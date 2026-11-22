"""Everything you wrote, as plain files you can open anywhere: a ZIP of Markdown notes plus their pictures.

Layout: one folder per collection (``Notes`` for the rest, ``Bookmarks``, ``Trash``), one ``.md`` per note
with its tags and dates at the top, ``files/`` with every picture and attachment, and ``index.json``.
No Phibe is needed to read it. Links to pictures are relative, so they work from the folder.
"""

from __future__ import annotations

import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from phibe.notes import files as note_files
from phibe.notes.store import NotesStore

_BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}
_LOCAL_FILE = "/v1/notes/files/"


def safe_name(text: str, fallback: str = "Untitled", limit: int = 80) -> str:
    """A name that is valid on Windows, macOS and Linux."""
    name = _BAD.sub(" ", text or "").strip().strip(".").strip()
    name = re.sub(r"\s+", " ", name)[:limit].strip().strip(".").strip()
    if not name:
        return fallback
    return f"_{name}" if name.lower() in _RESERVED else name


def _day(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _front_matter(note: Dict[str, Any], trashed: bool) -> str:
    lines = ["---", f"title: {json.dumps(note['title'], ensure_ascii=False)}"]
    lines.append("tags: " + json.dumps(note["tags"], ensure_ascii=False))
    lines.append("collections: " + json.dumps([c["name"] for c in note["collections"]], ensure_ascii=False))
    lines += [f"created: {_day(note['created_at'])}", f"updated: {_day(note['updated_at'])}", f"kind: {note['kind']}"]
    if note["url"]:
        lines.append(f"source: {json.dumps(note['url'], ensure_ascii=False)}")
    if trashed:
        lines.append("trashed: true")
    lines.append("---\n")
    return "\n".join(lines)


def _body(note: Dict[str, Any]) -> str:
    if note["kind"] == "bookmark":
        return "\n\n".join(p for p in (note["description"], f"<{note['url']}>" if note["url"] else "") if p) + "\n"
    return note["body"]


def export_zip(notes: NotesStore, dest: Path) -> Dict[str, int]:
    """Write the ZIP to ``dest``. Returns how many notes and files went in."""
    summaries = notes.list(limit=100000) + notes.list(trashed=True, limit=100000)
    used: Dict[str, int] = {}
    index: List[Dict[str, Any]] = []
    wanted_files = set()
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for summary in summaries:
            note = notes.get(summary["id"])
            trashed = bool(note["deleted_at"])
            folder = "Trash" if trashed else "Bookmarks" if note["kind"] == "bookmark" else (
                safe_name(note["collections"][0]["name"], "Notes") if note["collections"] else "Notes")
            stem = safe_name(note["title"])
            key = f"{folder}/{stem}".lower()
            used[key] = used.get(key, 0) + 1
            if used[key] > 1:  # two notes with one title: the short id tells them apart
                stem = f"{stem} ({note['id'][:6]})"
            body = _body(note).replace(_LOCAL_FILE, "../files/")
            wanted_files.update(re.findall(r"\.\./files/([0-9a-f]{64}\.[a-z0-9]{1,8})", body))
            z.writestr(f"{folder}/{stem}.md", _front_matter(note, trashed) + body)
            index.append({
                "id": note["id"], "path": f"{folder}/{stem}.md", "title": note["title"], "tags": note["tags"],
                "collections": [c["name"] for c in note["collections"]], "kind": note["kind"], "origin": note["origin"],
                "created": _day(note["created_at"]), "updated": _day(note["updated_at"]), "trashed": trashed,
            })
        for name in sorted(wanted_files):
            path = note_files.path_of(name)
            if path:
                z.write(path, f"files/{name}")
        z.writestr("index.json", json.dumps({"exported": _day(datetime.now(tz=timezone.utc).timestamp()), "notes": index}, ensure_ascii=False, indent=1))
    return {"notes": len(index), "files": len(wanted_files)}
