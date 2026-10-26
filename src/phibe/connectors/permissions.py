"""What Phibe may do with each connected source: only read it, also change it, or do everything (delete).

The level is kept in ``<config dir>/connector_permissions.json``; a source with no entry is Read Only.
The check is made by the source's own write methods (see :func:`requires`), so nothing that calls them,
an agent included, can skip it. Every attempt to write, allowed or blocked, is recorded in
``<config dir>/connector_actions.db`` so the user can see what Phibe did and what it was stopped from doing.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from functools import wraps
from typing import Any, Callable, Dict, List, Optional

from phibe.core.paths import get_config_dir
from phibe.security.file_utils import secure_write_json

logger = logging.getLogger(__name__)

LEVELS = ("read", "write", "all")
LABELS = {"read": "Read Only", "write": "Can Write", "all": "Full Access"}


class PermissionDenied(PermissionError):
    """The source is not set to a level that allows this action."""


def _levels_path():
    return get_config_dir() / "connector_permissions.json"


def all_levels() -> Dict[str, str]:
    """The level of every source that has one saved. A damaged file means nothing is allowed beyond reading."""
    try:
        saved = json.loads(_levels_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {k: v for k, v in saved.items() if v in LEVELS} if isinstance(saved, dict) else {}


def level_of(connector_id: str) -> str:
    return all_levels().get(connector_id, "read")


def set_level(connector_id: str, level: str) -> None:
    if level not in LEVELS:
        raise ValueError(f"level must be one of {', '.join(LEVELS)}")
    levels = all_levels()
    levels[connector_id] = level
    secure_write_json(_levels_path(), levels)


def allowed(connector_id: str, needed: str) -> bool:
    return LEVELS.index(level_of(connector_id)) >= LEVELS.index(needed)


# -- the record of what was tried ---------------------------------------------------------


def _db() -> sqlite3.Connection:
    folder = get_config_dir()
    folder.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(folder / "connector_actions.db"), timeout=30)
    db.execute(
        "CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY, at REAL NOT NULL, connector TEXT NOT NULL, "
        "action TEXT NOT NULL, needed TEXT NOT NULL, level TEXT NOT NULL, allowed INTEGER NOT NULL, detail TEXT NOT NULL)"
    )
    return db


def record(connector_id: str, action: str, needed: str, ok: bool, detail: str = "") -> None:
    """Note one attempt. A failure to write the note never changes the decision the lock already made."""
    try:
        db = _db()
        try:
            with db:
                db.execute(
                    "INSERT INTO actions (at, connector, action, needed, level, allowed, detail) VALUES (?,?,?,?,?,?,?)",
                    (time.time(), connector_id, action, needed, level_of(connector_id), int(ok), detail[:120]),
                )
        finally:
            db.close()
    except (sqlite3.Error, OSError):
        logger.warning("Could not record the %s attempt on %s", action, connector_id, exc_info=True)


def recent(connector_id: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
    """The latest write attempts, newest first, for one source or all of them."""
    db = _db()
    try:
        sql = "SELECT at, connector, action, needed, level, allowed, detail FROM actions"
        args: tuple = ()
        if connector_id:
            sql, args = sql + " WHERE connector=?", (connector_id,)
        rows = db.execute(sql + " ORDER BY id DESC LIMIT ?", args + (limit,)).fetchall()
    finally:
        db.close()
    return [
        {"at": r[0], "connector": r[1], "action": r[2], "needed": r[3], "level": r[4], "allowed": bool(r[5]), "detail": r[6]}
        for r in rows
    ]


# -- the lock itself ---------------------------------------------------------------------------


def requires(needed: str, action: Optional[str] = None) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Mark a connector method as one that writes: it runs only when the source's level reaches *needed*."""
    assert needed in LEVELS[1:], "a write method needs the write or all level"

    def wrap(fn: Callable[..., Any]) -> Callable[..., Any]:
        name = action or fn.__name__

        @wraps(fn)
        def checked(self: Any, *args: Any, **kwargs: Any) -> Any:
            connector_id = self.connector_id
            ok = allowed(connector_id, needed)
            record(connector_id, name, needed, ok, str(args[0]) if args else "")
            if not ok:
                raise PermissionDenied(
                    f"{getattr(self, 'display_name', connector_id)} is set to {LABELS[level_of(connector_id)]}, "
                    f"and {name} needs {LABELS[needed]}. Change it in Connections, under the gear icon of the source."
                )
            return fn(self, *args, **kwargs)

        return checked

    return wrap
