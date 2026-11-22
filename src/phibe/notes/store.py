"""Phibe's own notes: the original text, tags, collections and links, in ``notes.db``.

This file is the original. The search index in ``knowledge.db`` is a copy rebuilt from here, so
losing the index costs nothing, while this file deserves backups. Nothing here is ever hard-deleted:
a removed note goes to the trash (``deleted_at``) and can be restored.
"""

from __future__ import annotations

import functools
import hashlib
import sqlite3
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

_SCHEMA = """
CREATE TABLE IF NOT EXISTS notes (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL DEFAULT 'page',
    title         TEXT NOT NULL DEFAULT '',
    body          TEXT NOT NULL DEFAULT '',
    url           TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    lang          TEXT NOT NULL DEFAULT '',
    origin        TEXT UNIQUE,
    local_edit    INTEGER NOT NULL DEFAULT 0,
    created_at    REAL NOT NULL,
    updated_at    REAL NOT NULL,
    deleted_at    REAL,
    indexed_hash  TEXT NOT NULL DEFAULT '',
    indexed_model TEXT NOT NULL DEFAULT '',
    indexed_at    REAL
);
CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    kind TEXT NOT NULL DEFAULT 'topic'
);
CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);
CREATE TABLE IF NOT EXISTS collections (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    origin TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS collection_notes (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    note_id       TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (collection_id, note_id)
);
CREATE TABLE IF NOT EXISTS links (
    src  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    dst  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'link',
    PRIMARY KEY (src, dst, kind)
);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
"""

KINDS = ("page", "bookmark")

# A mention is a Markdown link to another note: [Title](/notes?note=<id>). [[Title]] is a shortcut for it.
_MENTION = re.compile(r"\]\(/notes\?note=([0-9a-f]{32})\)")
_ATTACHMENT = re.compile(r"!?\[((?:[^\[\]]|\[[^\]]*\])*)\]\(/v1/notes/files/([0-9a-f]{64})\.([a-z0-9]{1,8})\)")  # the label may hold [brackets]
_FILE_REF = re.compile(r"/v1/notes/files/([0-9a-f]{64})\.([a-z0-9]{1,8})")
_IMAGE_EXT = {"png", "jpg", "jpeg", "gif", "webp", "avif"}
_WIKILINK = re.compile(r"\\?\[\\?\[([^\[\]\n]{1,200}?)\\?\]\\?\]")


class NotFound(LookupError):
    pass


def note_hash(
    title: str, tags: Sequence[str], body: str, url: str = "", description: str = "", collections: Sequence[str] = ()
) -> str:
    """What the search index was built from: when it changes, the note must be indexed again."""
    raw = "\x1f".join(
        [title, ",".join(sorted(t.lower() for t in tags)), body, url, description, ",".join(sorted(collections))]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _serialized(method):
    """One call at a time per store: the web server answers several requests at once on one connection."""

    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        with self._lock:
            return method(self, *args, **kwargs)

    return wrapper


class NotesStore:
    def __init__(self, db_path: Union[str, Path] = "") -> None:
        self._lock = threading.RLock()
        if not db_path:
            from phibe.core.config import DEFAULT_CONFIG_DIR

            db_path = DEFAULT_CONFIG_DIR / "notes.db"
        self._path = str(db_path)
        if self._path != ":memory:":
            from phibe.security.file_utils import secure_create

            secure_create(Path(self._path))
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute("PRAGMA foreign_keys=ON;")
        self._conn.executescript(_SCHEMA)
        if "color" not in {r[1] for r in self._conn.execute("PRAGMA table_info(tags)")}:
            self._conn.execute("ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT ''")
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    # -- tags and collections -------------------------------------------------

    def _tag_id(self, name: str) -> int:
        name = name.strip()
        row = self._conn.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()
        if row:
            return row[0]
        return self._conn.execute("INSERT INTO tags(name) VALUES (?)", (name,)).lastrowid

    def set_tags(self, note_id: str, names: Iterable[str]) -> None:
        wanted = [n.strip() for n in names if n and n.strip()]
        self._conn.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
        for n in dict.fromkeys(wanted):
            self._conn.execute("INSERT OR IGNORE INTO note_tags VALUES (?, ?)", (note_id, self._tag_id(n)))

    def tags_of(self, note_id: str) -> List[str]:
        rows = self._conn.execute(
            "SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = ? ORDER BY t.name",
            (note_id,),
        ).fetchall()
        return [r[0] for r in rows]

    def collections_of(self, note_id: str) -> List[Dict[str, str]]:
        rows = self._conn.execute(
            "SELECT c.id, c.name FROM collection_notes cn JOIN collections c ON c.id = cn.collection_id "
            "WHERE cn.note_id = ? ORDER BY c.name",
            (note_id,),
        ).fetchall()
        return [{"id": r[0], "name": r[1]} for r in rows]

    def upsert_collection(self, name: str, origin: Optional[str] = None) -> str:
        row = self._conn.execute(
            "SELECT id FROM collections WHERE origin = ?" if origin else "SELECT id FROM collections WHERE name = ?",
            (origin or name,),
        ).fetchone()
        if row:
            self._conn.execute("UPDATE collections SET name = ? WHERE id = ?", (name, row[0]))
            self._conn.commit()
            return row[0]
        cid = uuid.uuid4().hex
        self._conn.execute("INSERT INTO collections(id, name, origin) VALUES (?, ?, ?)", (cid, name, origin))
        self._conn.commit()
        return cid

    def add_to_collection(self, collection_id: str, note_id: str, position: int = 0) -> None:
        self._conn.execute(
            "INSERT OR REPLACE INTO collection_notes VALUES (?, ?, ?)", (collection_id, note_id, position)
        )
        self._conn.commit()

    def set_collections(self, note_id: str, collection_ids: Iterable[str]) -> None:
        """Put the note in exactly these collections (unknown ids are ignored). The collections themselves stay."""
        self.get(note_id)
        wanted = [c for c in dict.fromkeys(collection_ids) if self._conn.execute("SELECT 1 FROM collections WHERE id = ?", (c,)).fetchone()]
        self._conn.execute("DELETE FROM collection_notes WHERE note_id = ?", (note_id,))
        for pos, cid in enumerate(wanted):
            self._conn.execute("INSERT INTO collection_notes VALUES (?, ?, ?)", (cid, note_id, pos))
        self._conn.commit()

    def rename_collection(self, collection_id: str, name: str) -> None:
        name = name.strip()
        if not name:
            raise ValueError("a collection needs a name")
        if not self._conn.execute("UPDATE collections SET name = ? WHERE id = ?", (name, collection_id)).rowcount:
            raise NotFound(collection_id)
        self._conn.commit()

    def delete_collection(self, collection_id: str) -> None:
        """Remove the grouping only: the notes in it stay, they just are no longer in this collection."""
        if not self._conn.execute("DELETE FROM collections WHERE id = ?", (collection_id,)).rowcount:
            raise NotFound(collection_id)
        self._conn.commit()

    def _resolve_wikilinks(self, body: str, own_id: str) -> str:
        """Turn [[Title]] into a link when exactly one live note has that title; anything else stays as typed."""

        def swap(m: "re.Match[str]") -> str:
            title = m.group(1).strip()
            rows = self._conn.execute(
                "SELECT id, title FROM notes WHERE deleted_at IS NULL AND id != ? AND title = ? COLLATE NOCASE", (own_id, title)
            ).fetchall()
            return f"[{rows[0][1]}](/notes?note={rows[0][0]})" if len(rows) == 1 else m.group(0)

        return _WIKILINK.sub(swap, body)

    def sync_mentions(self, note_id: str, body: str) -> None:
        """Keep the 'mention' links of a note equal to the notes its text points at."""
        found = {i for i in _MENTION.findall(body) if i != note_id}
        self._conn.execute("DELETE FROM links WHERE src = ? AND kind = 'mention'", (note_id,))
        for dst in found:
            if self._conn.execute("SELECT 1 FROM notes WHERE id = ?", (dst,)).fetchone():
                self._conn.execute("INSERT OR IGNORE INTO links VALUES (?, ?, 'mention')", (note_id, dst))
        self._conn.commit()

    def add_link(self, src: str, dst: str, kind: str = "link") -> None:
        if src != dst:
            self._conn.execute("INSERT OR IGNORE INTO links VALUES (?, ?, ?)", (src, dst, kind))
            self._conn.commit()

    def rewrite_body(self, note_id: str, body: str) -> None:
        """Change only the stored text (for example a picture's address). It is not an edit by the user."""
        self._conn.execute("UPDATE notes SET body = ? WHERE id = ?", (body, note_id))
        self._conn.commit()

    # -- notes ----------------------------------------------------------------

    def create(
        self,
        title: str,
        body: str = "",
        *,
        kind: str = "page",
        tags: Sequence[str] = (),
        url: str = "",
        description: str = "",
        lang: str = "",
        origin: Optional[str] = None,
        created_at: Optional[float] = None,
        updated_at: Optional[float] = None,
    ) -> str:
        if kind not in KINDS:
            raise ValueError(f"kind must be one of {', '.join(KINDS)}")
        now = time.time()
        nid = uuid.uuid4().hex
        self._conn.execute(
            "INSERT INTO notes(id, kind, title, body, url, description, lang, origin, created_at, updated_at, local_edit) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (nid, kind, title, body, url, description, lang, origin, created_at or now, updated_at or now,
             0 if origin else 1),
        )
        self.set_tags(nid, tags)
        self._conn.commit()
        return nid

    def update(self, note_id: str, **fields: Any) -> Dict[str, Any]:
        """Change a note made or edited here. Marks it as edited here."""
        self.get(note_id)
        if fields.get("body"):
            fields["body"] = self._resolve_wikilinks(fields["body"], note_id)
        allowed = {"title", "body", "url", "description", "lang"}
        sets = {k: v for k, v in fields.items() if k in allowed and v is not None}
        if sets:
            cols = ", ".join(f"{k} = ?" for k in sets)
            self._conn.execute(
                f"UPDATE notes SET {cols}, updated_at = ?, local_edit = 1 WHERE id = ?",
                (*sets.values(), time.time(), note_id),
            )
        if fields.get("tags") is not None:
            self.set_tags(note_id, fields["tags"])
            self._conn.execute("UPDATE notes SET updated_at = ?, local_edit = 1 WHERE id = ?", (time.time(), note_id))
        self._conn.commit()
        if fields.get("body") is not None:
            self.sync_mentions(note_id, fields["body"])
        return self.get(note_id)

    def trash(self, note_id: str) -> None:
        self.get(note_id)
        self._conn.execute("UPDATE notes SET deleted_at = ? WHERE id = ?", (time.time(), note_id))
        self._conn.commit()

    def restore(self, note_id: str) -> None:
        self.get(note_id)
        self._conn.execute("UPDATE notes SET deleted_at = NULL WHERE id = ?", (note_id,))
        self._conn.commit()

    def get(self, note_id: str) -> Dict[str, Any]:
        row = self._conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
        if row is None:
            raise NotFound(note_id)
        return self._full(row)

    def _full(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        d["tags"] = self.tags_of(d["id"])
        d["collections"] = self.collections_of(d["id"])
        d["links"] = [
            {"id": r[0], "kind": r[1]}
            for r in self._conn.execute("SELECT dst, kind FROM links WHERE src = ?", (d["id"],)).fetchall()
        ]
        d["backlinks"] = [
            {"id": r[0], "kind": r[1]}
            for r in self._conn.execute("SELECT src, kind FROM links WHERE dst = ?", (d["id"],)).fetchall()
        ]
        return d

    def list(
        self,
        *,
        tag: Optional[str] = None,
        collection: Optional[str] = None,
        kind: Optional[str] = None,
        trashed: bool = False,
        limit: int = 500,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        where = ["n.deleted_at IS NOT NULL" if trashed else "n.deleted_at IS NULL"]
        args: List[Any] = []
        join = ""
        if tag:
            join += " JOIN note_tags nt ON nt.note_id = n.id JOIN tags t ON t.id = nt.tag_id"
            where.append("t.name = ?")
            args.append(tag)
        if collection:
            join += " JOIN collection_notes cn ON cn.note_id = n.id"
            where.append("cn.collection_id = ?")
            args.append(collection)
        if kind:
            where.append("n.kind = ?")
            args.append(kind)
        rows = self._conn.execute(
            f"SELECT n.id, n.kind, n.title, n.url, n.created_at, n.updated_at, n.deleted_at, n.indexed_at FROM notes n{join} "
            f"WHERE {' AND '.join(where)} ORDER BY n.updated_at DESC LIMIT ? OFFSET ?",
            (*args, limit, offset),
        ).fetchall()
        ids = [r["id"] for r in rows]
        back: Dict[str, List[Dict[str, str]]] = {i: [] for i in ids}
        for i in range(0, len(ids), 500):  # the notes that link to each row, for the "Backlinks" column
            chunk = ids[i : i + 500]
            for dst, src, title in self._conn.execute(
                "SELECT l.dst, n.id, n.title FROM links l JOIN notes n ON n.id = l.src "
                f"WHERE n.deleted_at IS NULL AND l.dst IN ({','.join('?' * len(chunk))}) ORDER BY n.title",
                chunk,
            ).fetchall():
                if len(back[dst]) < 3 and all(b["id"] != src for b in back[dst]):
                    back[dst].append({"id": src, "title": title})
        out = []
        for r in rows:
            d = dict(r)
            d["tags"] = self.tags_of(d["id"])
            d["linked_from"] = back[d["id"]]
            out.append(d)
        return out

    def attachments(self) -> List[Dict[str, Any]]:
        """Every picture and file the notes point to, with the notes that use it (for the Files, Images and Videos sets)."""
        found: Dict[str, Dict[str, Any]] = {}
        for nid, title, body in self._conn.execute(
            "SELECT id, title, body FROM notes WHERE deleted_at IS NULL AND body LIKE '%/v1/notes/files/%'"
        ).fetchall():
            labels = {f"{sha}.{ext}": label.strip() for label, sha, ext in _ATTACHMENT.findall(body)}
            for sha, ext in _FILE_REF.findall(body):  # any mention: markdown, an <img> tag, a bare link
                name = f"{sha}.{ext}"
                item = found.setdefault(name, {"name": name, "ext": ext, "label": "", "image": ext in _IMAGE_EXT, "notes": []})
                if not item["label"] and labels.get(name):
                    item["label"] = labels[name]
                if all(n["id"] != nid for n in item["notes"]):
                    item["notes"].append({"id": nid, "title": title})
        return sorted(found.values(), key=lambda a: (a["label"] or a["name"]).lower())

    @_serialized
    def create_tag(self, name: str) -> str:
        name = name.strip()
        self._tag_id(name)
        self._conn.commit()
        return name

    @_serialized
    def rename_tag(self, old: str, new: str) -> bool:
        """A new name for a tag. If the name is already a tag, the two become one (every note keeps its tag)."""
        new = new.strip()
        row = self._conn.execute("SELECT id FROM tags WHERE name = ?", (old,)).fetchone()
        if not row or not new:
            return False
        other = self._conn.execute("SELECT id FROM tags WHERE name = ? AND id != ?", (new, row[0])).fetchone()
        if other:
            self._conn.execute("INSERT OR IGNORE INTO note_tags SELECT note_id, ? FROM note_tags WHERE tag_id = ?", (other[0], row[0]))
            self._conn.execute("DELETE FROM tags WHERE id = ?", (row[0],))
        else:
            self._conn.execute("UPDATE tags SET name = ? WHERE id = ?", (new, row[0]))
        self._conn.commit()
        return True

    @_serialized
    def delete_tag(self, name: str) -> bool:
        """The tag goes from every note; the notes stay."""
        cur = self._conn.execute("DELETE FROM tags WHERE name = ?", (name,))
        self._conn.commit()
        return cur.rowcount > 0

    @_serialized
    def set_tag_color(self, name: str, color: str) -> bool:
        cur = self._conn.execute("UPDATE tags SET color = ? WHERE name = ?", (color, name))
        self._conn.commit()
        return cur.rowcount > 0

    def tags(self) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT t.name, t.kind, t.color, COUNT(n.id) AS count FROM tags t "
            "LEFT JOIN note_tags nt ON nt.tag_id = t.id LEFT JOIN notes n ON n.id = nt.note_id AND n.deleted_at IS NULL "
            "GROUP BY t.id ORDER BY count DESC, t.name"
        ).fetchall()
        return [dict(r) for r in rows]

    def collections(self) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT c.id, c.name, COUNT(n.id) AS count FROM collections c "
            "LEFT JOIN collection_notes cn ON cn.collection_id = c.id LEFT JOIN notes n ON n.id = cn.note_id AND n.deleted_at IS NULL "
            "GROUP BY c.id ORDER BY c.name"
        ).fetchall()
        return [dict(r) for r in rows]

    # -- search index state -------------------------------------------------------

    def pending_index(self, model: str) -> List[Dict[str, Any]]:
        """Live notes whose text, tags or embedding model differ from what the index was built from."""
        out = []
        for r in self._conn.execute("SELECT * FROM notes WHERE deleted_at IS NULL").fetchall():
            d = self._full(r)
            h = note_hash(d["title"], d["tags"], d["body"], d["url"], d["description"], [c["name"] for c in d["collections"]])
            if d["indexed_hash"] != h or d["indexed_model"] != model:
                d["hash"] = h
                out.append(d)
        return out

    def trashed_still_indexed(self) -> List[str]:
        rows = self._conn.execute(
            "SELECT id FROM notes WHERE deleted_at IS NOT NULL AND indexed_hash != ''"
        ).fetchall()
        return [r[0] for r in rows]

    def mark_indexed(self, note_id: str, digest: str, model: str) -> None:
        self._conn.execute(
            "UPDATE notes SET indexed_hash = ?, indexed_model = ?, indexed_at = ? WHERE id = ?",
            (digest, model, time.time(), note_id),
        )
        self._conn.commit()

    def mark_unindexed(self, note_id: str) -> None:
        self._conn.execute("UPDATE notes SET indexed_hash = '', indexed_model = '' WHERE id = ?", (note_id,))
        self._conn.commit()

    def stats(self) -> Dict[str, int]:
        c = self._conn
        one = lambda sql: c.execute(sql).fetchone()[0]  # noqa: E731
        return {
            "notes": one("SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL"),
            "pages": one("SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND kind = 'page'"),
            "bookmarks": one("SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND kind = 'bookmark'"),
            "trashed": one("SELECT COUNT(*) FROM notes WHERE deleted_at IS NOT NULL"),
            "tags": one("SELECT COUNT(*) FROM tags"),
            "collections": one("SELECT COUNT(*) FROM collections"),
            "links": one("SELECT COUNT(*) FROM links"),
            "indexed": one("SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL AND indexed_hash != ''"),
        }


# Every public method (and the private helpers they share) runs under the store's lock.
for _name, _fn in list(vars(NotesStore).items()):
    if callable(_fn) and not (_name.startswith("__") and _name.endswith("__")):
        setattr(NotesStore, _name, _serialized(_fn))
