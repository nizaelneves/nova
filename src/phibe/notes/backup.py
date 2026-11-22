"""Backups of the notes: one ZIP with a consistent copy of ``notes.db`` and every file, kept in ``backups/``.

Each backup is opened and checked right after it is written, so a copy that cannot be restored is reported at once.
To restore one: close Phibe, unzip it over the Phibe folder (``notes.db`` and ``notes-files/``), and start Phibe again.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any, Dict, List

from phibe.notes import files as note_files
from phibe.notes.store import NotesStore

KEEP = 14  # automatic and manual backups kept; older ones are removed (only ``notes-*.zip`` in ``backups/``)


def folder() -> Path:
    from phibe.core.paths import get_config_dir

    return get_config_dir() / "backups"


def list_backups() -> List[Dict[str, Any]]:
    out = [
        {"name": p.name, "size": p.stat().st_size, "created": p.stat().st_mtime}
        for p in folder().glob("notes-*.zip")
    ] if folder().exists() else []
    return sorted(out, key=lambda b: -b["created"])


def verify(path: Path) -> Dict[str, int]:
    """Open the backup, run SQLite's own integrity check on the database inside and count what it holds."""
    with zipfile.ZipFile(path) as z:
        if z.testzip() is not None:
            raise ValueError("the backup file is damaged")
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(z.extract("notes.db", tmp))
            conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            try:
                if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("the database inside the backup failed its integrity check")
                count = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
            finally:
                conn.close()
        stored = sum(1 for n in z.namelist() if n.startswith("notes-files/") and not n.endswith("/"))
    return {"notes": count, "files": stored}


def make_backup(notes: NotesStore) -> Dict[str, Any]:
    folder().mkdir(parents=True, exist_ok=True)
    name = f"notes-{time.strftime('%Y%m%d-%H%M%S')}.zip"
    target = folder() / name
    with tempfile.TemporaryDirectory() as tmp:
        snapshot = Path(tmp) / "notes.db"
        copy = sqlite3.connect(snapshot)
        try:
            with notes._lock:  # one consistent picture, even while notes are being saved
                notes._conn.backup(copy)
        finally:
            copy.close()
        part = target.with_suffix(".part")
        with zipfile.ZipFile(part, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(snapshot, "notes.db")
            if note_files.folder().exists():
                for f in sorted(note_files.folder().iterdir()):
                    if f.is_file() and not f.name.endswith(".part"):
                        z.write(f, f"notes-files/{f.name}")
        os.replace(part, target)
    try:
        counts = verify(target)
    except Exception:
        target.unlink(missing_ok=True)  # a backup that cannot be read is worse than none
        raise
    for old in list_backups()[KEEP:]:
        (folder() / old["name"]).unlink(missing_ok=True)
    return {"name": name, "size": target.stat().st_size, **counts}


def due(hours: float = 24.0) -> bool:
    latest = list_backups()
    return not latest or time.time() - latest[0]["created"] > hours * 3600
