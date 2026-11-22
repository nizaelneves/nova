"""SQLite storage for workspace boards: boards, properties, items, comments and views.

A workspace is a task area id (or ``"me"`` for the personal one). A board holds
items (with sub-items through ``parent_id``); each item keeps one JSON value per
user-defined property. Views only store how the board is shown (type + config).
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

PROPERTY_TYPES = ("text", "number", "checkbox", "date", "select", "status", "tags")
VIEW_TYPES = ("table", "kanban", "calendar", "files", "feed")

# Stable ids so the legacy tasks (todo/doing/done, high/medium/low) map straight onto them.
DEFAULT_STATUSES = [
    {"id": "todo", "label": "To-Do", "color": "#8b93a7"},
    {"id": "doing", "label": "Em Andamento", "color": "#d9a441"},
    {"id": "done", "label": "Concluído", "color": "#1fae7a", "done": True},
    {"id": "canceled", "label": "Cancelado", "color": "#e5484d", "done": True},
]
DEFAULT_PRIORITIES = [
    {"id": "high", "label": "Alta", "color": "#e5484d"},
    {"id": "medium", "label": "Média", "color": "#d9a441"},
    {"id": "low", "label": "Baixa", "color": "#3e8fe0"},
]

# One person for now; the user adds more names by editing the labels of the column.
DEFAULT_OWNERS = [{"id": "me", "label": "Eu", "color": "#7c6df0"}]

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS boards (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    position     INTEGER NOT NULL,
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS boards_ws ON boards (workspace_id);
CREATE TABLE IF NOT EXISTS properties (
    id       TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    type     TEXT NOT NULL,
    options  TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    parent_id   TEXT REFERENCES items(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    vals        TEXT NOT NULL DEFAULT '{}',
    position    INTEGER NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_board ON items (board_id);
CREATE TABLE IF NOT EXISTS comments (
    id         TEXT PRIMARY KEY,
    item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
    id         TEXT PRIMARY KEY,
    item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    size       INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
    id         TEXT PRIMARY KEY,
    item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS views (
    id       TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    type     TEXT NOT NULL,
    config   TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL
);
"""


class BoardError(ValueError):
    """The request is invalid."""


class NotFound(BoardError):
    """The board, property, item or view does not exist."""


def _id() -> str:
    return uuid.uuid4().hex[:12]


def _clean(text: str, what: str) -> str:
    text = (text or "").strip()
    if not text:
        raise BoardError(f"{what} cannot be empty")
    return text


def _options(value: Any) -> List[Dict[str, Any]]:
    """Validate select/status/tags options: a list of ``{id, label, color}``."""
    if not isinstance(value, list):
        raise BoardError("options must be a list")
    out = []
    for opt in value:
        if not isinstance(opt, dict) or not str(opt.get("label", "")).strip():
            raise BoardError("every option needs a label")
        out.append({**opt, "id": str(opt.get("id") or _id()), "label": str(opt["label"]).strip()})
    return out


#: ``(day, rule, occurrences_so_far) -> next day or None`` and ``rule -> cleaned rule`` (raises ValueError).
NextDate = Callable[[date, Dict[str, Any], int], Optional[date]]
CleanRule = Callable[[Dict[str, Any]], Dict[str, Any]]


class BoardStore:
    """Thread-safe boards storage; *now* can be replaced in tests.

    Repeat rules are the tasks' rules; *next_date* and *clean_rule* are handed in so this
    package does not import the tasks one. Without them items cannot repeat.
    """

    def __init__(
        self,
        db_path: str | Path,
        *,
        files_dir: Optional[str | Path] = None,
        next_date: Optional[NextDate] = None,
        clean_rule: Optional[CleanRule] = None,
        now: Callable[[], datetime] = datetime.now,
    ) -> None:
        self._now = now
        self._next_date = next_date
        self._clean_rule = clean_rule
        self._files = Path(files_dir) if files_dir else Path(str(db_path)).with_suffix(".files")
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.executescript(_SCHEMA)
        columns = {r["name"] for r in self._conn.execute("PRAGMA table_info(items)")}
        for column, ddl in (
            ("recurrence", "TEXT"),
            ("series_id", "TEXT"),
            ("occurrence", "INTEGER NOT NULL DEFAULT 1"),
        ):
            if column not in columns:
                self._conn.execute(f"ALTER TABLE items ADD COLUMN {column} {ddl}")
        self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _stamp(self) -> str:
        return self._now().strftime("%Y-%m-%dT%H:%M:%S")

    def _next(self, table: str, column: str, value: str) -> int:
        return self._conn.execute(
            f"SELECT COALESCE(MAX(position), 0) + 1 FROM {table} WHERE {column} = ?", (value,)
        ).fetchone()[0]

    # -- boards --------------------------------------------------------------

    def _board_row(self, board_id: str) -> sqlite3.Row:
        row = self._conn.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()
        if row is None:
            raise NotFound(f"Board not found: {board_id}")
        return row

    @staticmethod
    def _board(row: sqlite3.Row) -> Dict[str, Any]:
        return {"id": row["id"], "workspace_id": row["workspace_id"], "name": row["name"]}

    def list_boards(self, workspace_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM boards WHERE workspace_id = ? ORDER BY position", (workspace_id,)
            ).fetchall()
            return [self._board(r) for r in rows]

    def create_board(
        self, workspace_id: str, name: str, legacy_tasks: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Create a board with the usual properties and a table view.

        *legacy_tasks* (rows from the old tasks table) are copied in as items.
        """
        name = _clean(name, "Board name")
        workspace_id = _clean(workspace_id, "Workspace")
        with self._lock:
            board_id = _id()
            self._conn.execute(
                "INSERT INTO boards (id, workspace_id, name, position, created_at) VALUES (?,?,?,?,?)",
                (board_id, workspace_id, name, self._next("boards", "workspace_id", workspace_id), self._stamp()),
            )
            self._add_property(board_id, "Responsável", "select", DEFAULT_OWNERS)
            status = self._add_property(board_id, "Status", "status", DEFAULT_STATUSES)
            priority = self._add_property(board_id, "Prioridade", "select", DEFAULT_PRIORITIES)
            deadline = self._add_property(board_id, "Deadline", "date", [])
            self._add_property(board_id, "Tags", "tags", [])
            self._add_view(board_id, "Tabela", "table", {"groupBy": status["id"]})
            for task in legacy_tasks or []:
                vals = {status["id"]: task.get("status", "todo"), deadline["id"]: str(task.get("due", ""))[:10]}
                if task.get("priority"):
                    vals[priority["id"]] = task["priority"]
                self._add_item(board_id, None, task["title"], task.get("notes", ""), vals)
            self._conn.commit()
            return self._board(self._board_row(board_id))

    def rename_board(self, board_id: str, name: str) -> Dict[str, Any]:
        name = _clean(name, "Board name")
        with self._lock:
            self._board_row(board_id)
            self._conn.execute("UPDATE boards SET name = ? WHERE id = ?", (name, board_id))
            self._conn.commit()
            return self._board(self._board_row(board_id))

    def delete_board(self, board_id: str) -> None:
        with self._lock:
            self._board_row(board_id)
            files = self._purge("i.board_id = ? AND ? IS NOT NULL", board_id)
            self._conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))
            self._conn.commit()
            self._unlink(files)

    def get_board(self, board_id: str) -> Dict[str, Any]:
        """The board with everything needed to draw it."""
        with self._lock:
            board = self._board(self._board_row(board_id))
            props = self._conn.execute(
                "SELECT * FROM properties WHERE board_id = ? ORDER BY position", (board_id,)
            ).fetchall()
            views = self._conn.execute(
                "SELECT * FROM views WHERE board_id = ? ORDER BY position", (board_id,)
            ).fetchall()
            items = self._conn.execute(
                "SELECT * FROM items WHERE board_id = ? ORDER BY position", (board_id,)
            ).fetchall()
            return {
                **board,
                "properties": [self._property(r) for r in props],
                "views": [self._view(r) for r in views],
                "items": [self._item(r) for r in items],
            }

    # -- properties ----------------------------------------------------------

    @staticmethod
    def _property(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"], "name": row["name"], "type": row["type"],
            "options": json.loads(row["options"]),
        }

    def _property_row(self, property_id: str) -> sqlite3.Row:
        row = self._conn.execute("SELECT * FROM properties WHERE id = ?", (property_id,)).fetchone()
        if row is None:
            raise NotFound(f"Property not found: {property_id}")
        return row

    def _add_property(self, board_id: str, name: str, type_: str, options: List[Dict[str, Any]]) -> Dict[str, Any]:
        name = _clean(name, "Property name")
        if type_ not in PROPERTY_TYPES:
            raise BoardError(f"type must be one of {', '.join(PROPERTY_TYPES)}")
        prop_id = _id()
        self._conn.execute(
            "INSERT INTO properties (id, board_id, name, type, options, position) VALUES (?,?,?,?,?,?)",
            (prop_id, board_id, name, type_, json.dumps(_options(options)), self._next("properties", "board_id", board_id)),
        )
        return self._property(self._property_row(prop_id))

    def create_property(self, board_id: str, name: str, type_: str, options: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        with self._lock:
            self._board_row(board_id)
            prop = self._add_property(board_id, name, type_, options or [])
            self._conn.commit()
            return prop

    def update_property(self, property_id: str, **changes: Any) -> Dict[str, Any]:
        """Rename a property or replace its options (the type is fixed)."""
        with self._lock:
            self._property_row(property_id)
            if "name" in changes and changes["name"] is not None:
                self._conn.execute(
                    "UPDATE properties SET name = ? WHERE id = ?", (_clean(changes["name"], "Property name"), property_id)
                )
            if "options" in changes and changes["options"] is not None:
                self._conn.execute(
                    "UPDATE properties SET options = ? WHERE id = ?", (json.dumps(_options(changes["options"])), property_id)
                )
            self._conn.commit()
            return self._property(self._property_row(property_id))

    def delete_property(self, property_id: str) -> None:
        with self._lock:
            row = self._property_row(property_id)
            self._conn.execute("DELETE FROM properties WHERE id = ?", (property_id,))
            for item in self._conn.execute("SELECT id, vals FROM items WHERE board_id = ?", (row["board_id"],)).fetchall():
                vals = json.loads(item["vals"])
                if vals.pop(property_id, None) is not None:
                    self._conn.execute("UPDATE items SET vals = ? WHERE id = ?", (json.dumps(vals), item["id"]))
            self._conn.commit()

    # -- items ---------------------------------------------------------------

    @staticmethod
    def _item(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"], "board_id": row["board_id"], "parent_id": row["parent_id"],
            "title": row["title"], "description": row["description"],
            "values": json.loads(row["vals"]), "created_at": row["created_at"],
            "recurrence": json.loads(row["recurrence"]) if row["recurrence"] else None,
        }

    def _item_row(self, item_id: str) -> sqlite3.Row:
        row = self._conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
        if row is None:
            raise NotFound(f"Item not found: {item_id}")
        return row

    def _add_item(self, board_id: str, parent_id: Optional[str], title: str, description: str, values: Dict[str, Any]) -> str:
        item_id = _id()
        self._conn.execute(
            "INSERT INTO items (id, board_id, parent_id, title, description, vals, position, created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (item_id, board_id, parent_id, _clean(title, "Title"), description, json.dumps(values),
             self._next("items", "board_id", board_id), self._stamp()),
        )
        return item_id

    def _check_values(self, board_id: str, values: Dict[str, Any]) -> None:
        known = {r["id"] for r in self._conn.execute("SELECT id FROM properties WHERE board_id = ?", (board_id,))}
        unknown = set(values) - known
        if unknown:
            raise BoardError(f"Unknown property: {sorted(unknown)[0]}")

    def create_item(
        self, board_id: str, title: str, parent_id: Optional[str] = None,
        description: str = "", values: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            self._board_row(board_id)
            if parent_id is not None:
                parent = self._item_row(parent_id)
                if parent["board_id"] != board_id:
                    raise BoardError("The parent item belongs to another board")
                if parent["parent_id"] is not None:
                    raise BoardError("Sub-items cannot have sub-items")
            self._check_values(board_id, values or {})
            item_id = self._add_item(board_id, parent_id, title, description, values or {})
            self._conn.commit()
            return self._item(self._item_row(item_id))

    def _log(self, item_id: str, text: str) -> None:
        self._conn.execute(
            "INSERT INTO activity (id, item_id, text, created_at) VALUES (?,?,?,?)",
            (_id(), item_id, text, self._stamp()),
        )

    def _props(self, board_id: str) -> List[Dict[str, Any]]:
        rows = self._conn.execute("SELECT * FROM properties WHERE board_id = ? ORDER BY position", (board_id,)).fetchall()
        return [self._property(r) for r in rows]

    @staticmethod
    def _shown(prop: Dict[str, Any], value: Any) -> str:
        """A value as a person reads it: the label of an option, not its id."""
        labels = {o["id"]: o["label"] for o in prop["options"]}
        if isinstance(value, list):
            return ", ".join(labels.get(v, str(v)) for v in value) or "empty"
        return "empty" if value in (None, "") else str(labels.get(value, value))

    def update_item(self, item_id: str, **changes: Any) -> Dict[str, Any]:
        """Change title/description/repeat rule, or merge *values* (a ``None`` value clears that property).

        Moving a repeating item into its first "done" stage creates the next occurrence.
        """
        with self._lock:
            row = self._item_row(item_id)
            props = self._props(row["board_id"])
            if changes.get("title") is not None and changes["title"].strip() != row["title"]:
                self._conn.execute("UPDATE items SET title = ? WHERE id = ?", (_clean(changes["title"], "Title"), item_id))
                self._log(item_id, f'Renamed to "{changes["title"].strip()}"')
            if changes.get("description") is not None and changes["description"] != row["description"]:
                self._conn.execute("UPDATE items SET description = ? WHERE id = ?", (changes["description"], item_id))
                self._log(item_id, "Description edited")
            if "recurrence" in changes:
                self._set_recurrence(item_id, props, changes["recurrence"])
            if changes.get("values"):
                self._check_values(row["board_id"], changes["values"])
                before = json.loads(row["vals"])
                merged = dict(before)
                for key, value in changes["values"].items():
                    if value is None:
                        merged.pop(key, None)
                    else:
                        merged[key] = value
                    if before.get(key) != merged.get(key):
                        prop = next(p for p in props if p["id"] == key)
                        self._log(item_id, f'{prop["name"]}: {self._shown(prop, before.get(key))} → {self._shown(prop, merged.get(key))}')
                self._conn.execute("UPDATE items SET vals = ? WHERE id = ?", (json.dumps(merged), item_id))
                self._spawn_next(self._item_row(item_id), props, before, merged)
            self._conn.commit()
            return self._item(self._item_row(item_id))

    def _set_recurrence(self, item_id: str, props: List[Dict[str, Any]], rule: Optional[Dict[str, Any]]) -> None:
        if not rule:
            self._conn.execute("UPDATE items SET recurrence = NULL WHERE id = ?", (item_id,))
            self._log(item_id, "Repeat removed")
            return
        if self._clean_rule is None:
            raise BoardError("Repeating items are not available")
        dates = [p for p in props if p["type"] == "date"]
        prop = next((p for p in dates if p["id"] == rule.get("prop")), dates[0] if dates else None)
        if prop is None:
            raise BoardError("Add a Date property before making an item repeat")
        try:
            clean = self._clean_rule({k: v for k, v in rule.items() if k != "prop"})
        except ValueError as exc:
            raise BoardError(str(exc)) from exc
        self._conn.execute(
            "UPDATE items SET recurrence = ?, series_id = COALESCE(series_id, id) WHERE id = ?",
            (json.dumps({**clean, "prop": prop["id"]}), item_id),
        )
        self._log(item_id, f'Repeats {clean["freq"]} (every {clean.get("interval", 1)}) by {prop["name"]}')

    def _spawn_next(self, row: sqlite3.Row, props: List[Dict[str, Any]], before: Dict[str, Any], after: Dict[str, Any]) -> None:
        if not row["recurrence"] or self._next_date is None:
            return
        status = next((p for p in props if p["type"] == "status" and p["options"]), None)
        done = next((o for o in status["options"] if o.get("done")), None) if status else None
        if not status or not done or after.get(status["id"]) != done["id"] or before.get(status["id"]) == done["id"]:
            return
        rule = json.loads(row["recurrence"])
        anchor_value = after.get(rule["prop"])
        if not anchor_value:
            return
        anchor = date.fromisoformat(str(anchor_value)[:10])
        series = row["series_id"] or row["id"]
        if self._conn.execute(
            "SELECT 1 FROM items WHERE series_id = ? AND occurrence = ?", (series, row["occurrence"] + 1)
        ).fetchone():
            return
        following = self._next_date(anchor, {k: v for k, v in rule.items() if k != "prop"}, row["occurrence"])
        if following is None:
            return
        shift = timedelta(days=(following - anchor).days)
        date_ids = {p["id"] for p in props if p["type"] == "date"}

        def fresh(values: Dict[str, Any]) -> Dict[str, Any]:
            out = {k: (date.fromisoformat(str(v)[:10]) + shift).isoformat() if k in date_ids and v else v for k, v in values.items()}
            out[status["id"]] = status["options"][0]["id"]
            return out

        new_id = self._add_item(row["board_id"], None, row["title"], row["description"], fresh(after))
        self._conn.execute(
            "UPDATE items SET recurrence = ?, series_id = ?, occurrence = ? WHERE id = ?",
            (row["recurrence"], series, row["occurrence"] + 1, new_id),
        )
        self._conn.execute("UPDATE items SET series_id = ? WHERE id = ?", (series, row["id"]))
        for sub in self._conn.execute("SELECT * FROM items WHERE parent_id = ? ORDER BY position", (row["id"],)).fetchall():
            self._add_item(row["board_id"], new_id, sub["title"], sub["description"], fresh(json.loads(sub["vals"])))
        self._log(new_id, f"Created by the repeat rule (next: {following.isoformat()})")
        self._log(row["id"], f"Next occurrence created for {following.isoformat()}")

    def _purge(self, where: str, arg: str) -> List[str]:
        """Ids of the attachments of the items matched by *where* (which uses *arg* twice)."""
        rows = self._conn.execute(
            f"SELECT a.id FROM attachments a JOIN items i ON a.item_id = i.id WHERE {where}", (arg, arg)
        ).fetchall()
        return [r["id"] for r in rows]

    def _unlink(self, ids: List[str]) -> None:
        for attachment_id in ids:
            (self._files / attachment_id).unlink(missing_ok=True)

    def delete_item(self, item_id: str) -> None:
        with self._lock:
            self._item_row(item_id)
            files = self._purge("i.id = ? OR i.parent_id = ?", item_id)
            self._conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
            self._conn.commit()
            self._unlink(files)

    # -- attachments and activity -------------------------------------------

    def list_attachments(self, item_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            self._item_row(item_id)
            rows = self._conn.execute("SELECT * FROM attachments WHERE item_id = ? ORDER BY created_at, rowid", (item_id,)).fetchall()
            return [dict(r) for r in rows]

    def add_attachment(self, item_id: str, name: str, data: bytes) -> Dict[str, Any]:
        name = Path(name or "").name or "file"
        with self._lock:
            self._item_row(item_id)
            attachment_id = _id()
            self._files.mkdir(parents=True, exist_ok=True)
            (self._files / attachment_id).write_bytes(data)
            self._conn.execute(
                "INSERT INTO attachments (id, item_id, name, size, created_at) VALUES (?,?,?,?,?)",
                (attachment_id, item_id, name, len(data), self._stamp()),
            )
            self._log(item_id, f"File added: {name}")
            self._conn.commit()
            return dict(self._conn.execute("SELECT * FROM attachments WHERE id = ?", (attachment_id,)).fetchone())

    def attachment_file(self, attachment_id: str) -> Tuple[str, Path]:
        with self._lock:
            row = self._conn.execute("SELECT * FROM attachments WHERE id = ?", (attachment_id,)).fetchone()
            if row is None or not (self._files / attachment_id).exists():
                raise NotFound(f"File not found: {attachment_id}")
            return row["name"], self._files / attachment_id

    def delete_attachment(self, attachment_id: str) -> None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM attachments WHERE id = ?", (attachment_id,)).fetchone()
            if row is None:
                raise NotFound(f"File not found: {attachment_id}")
            self._conn.execute("DELETE FROM attachments WHERE id = ?", (attachment_id,))
            self._log(row["item_id"], f'File removed: {row["name"]}')
            self._conn.commit()
            self._unlink([attachment_id])

    def board_files(self, board_id: str) -> List[Dict[str, Any]]:
        """Every file of the board's items, newest first, with the item it belongs to."""
        with self._lock:
            self._board_row(board_id)
            rows = self._conn.execute(
                "SELECT a.*, i.title AS item_title FROM attachments a JOIN items i ON i.id = a.item_id "
                "WHERE i.board_id = ? ORDER BY a.created_at DESC, a.rowid DESC", (board_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    def list_activity(self, item_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            self._item_row(item_id)
            rows = self._conn.execute(
                "SELECT * FROM activity WHERE item_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100", (item_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    # -- comments ------------------------------------------------------------

    def list_comments(self, item_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            self._item_row(item_id)
            rows = self._conn.execute(
                "SELECT * FROM comments WHERE item_id = ? ORDER BY created_at, rowid", (item_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    def add_comment(self, item_id: str, body: str) -> Dict[str, Any]:
        body = _clean(body, "Comment")
        with self._lock:
            self._item_row(item_id)
            comment_id = _id()
            self._conn.execute(
                "INSERT INTO comments (id, item_id, body, created_at) VALUES (?,?,?,?)",
                (comment_id, item_id, body, self._stamp()),
            )
            self._conn.commit()
            return dict(self._conn.execute("SELECT * FROM comments WHERE id = ?", (comment_id,)).fetchone())

    def delete_comment(self, comment_id: str) -> None:
        with self._lock:
            if not self._conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,)).rowcount:
                raise NotFound(f"Comment not found: {comment_id}")
            self._conn.commit()

    # -- views ---------------------------------------------------------------

    @staticmethod
    def _view(row: sqlite3.Row) -> Dict[str, Any]:
        return {"id": row["id"], "name": row["name"], "type": row["type"], "config": json.loads(row["config"])}

    def _view_row(self, view_id: str) -> sqlite3.Row:
        row = self._conn.execute("SELECT * FROM views WHERE id = ?", (view_id,)).fetchone()
        if row is None:
            raise NotFound(f"View not found: {view_id}")
        return row

    def _add_view(self, board_id: str, name: str, type_: str, config: Dict[str, Any]) -> str:
        if type_ not in VIEW_TYPES:
            raise BoardError(f"type must be one of {', '.join(VIEW_TYPES)}")
        view_id = _id()
        self._conn.execute(
            "INSERT INTO views (id, board_id, name, type, config, position) VALUES (?,?,?,?,?,?)",
            (view_id, board_id, _clean(name, "View name"), type_, json.dumps(config), self._next("views", "board_id", board_id)),
        )
        return view_id

    def create_view(self, board_id: str, name: str, type_: str, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        with self._lock:
            self._board_row(board_id)
            view_id = self._add_view(board_id, name, type_, config or {})
            self._conn.commit()
            return self._view(self._view_row(view_id))

    def update_view(self, view_id: str, **changes: Any) -> Dict[str, Any]:
        with self._lock:
            self._view_row(view_id)
            if changes.get("name") is not None:
                self._conn.execute("UPDATE views SET name = ? WHERE id = ?", (_clean(changes["name"], "View name"), view_id))
            if changes.get("config") is not None:
                self._conn.execute("UPDATE views SET config = ? WHERE id = ?", (json.dumps(changes["config"]), view_id))
            self._conn.commit()
            return self._view(self._view_row(view_id))

    def delete_view(self, view_id: str) -> None:
        with self._lock:
            row = self._view_row(view_id)
            left = self._conn.execute("SELECT COUNT(*) FROM views WHERE board_id = ?", (row["board_id"],)).fetchone()[0]
            if left <= 1:
                raise BoardError("A board needs at least one view")
            self._conn.execute("DELETE FROM views WHERE id = ?", (view_id,))
            self._conn.commit()
