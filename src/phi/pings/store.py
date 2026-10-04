"""SQLite storage and rules for Phi's Pings (standalone reminders).

A Ping is a simple "remind me of X at this date/time" item — deliberately
smaller than a Task: no areas, no notes, no Kanban status. Just text, a
due date/time, a priority, and an optional weekly/monthly repeat.
"""

from __future__ import annotations

import calendar
import json
import re
import sqlite3
import threading
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence

PRIORITIES = ("high", "medium", "low")
REPEAT_TYPES = ("none", "weekly", "monthly")
DEFAULT_SNOOZE_MINUTES = 60
MAX_TEXT_LENGTH = 500

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS pings (
    id                   TEXT PRIMARY KEY,
    text                 TEXT NOT NULL,
    date                 TEXT NOT NULL,
    time                 TEXT NOT NULL,
    priority             TEXT NOT NULL DEFAULT 'medium',
    repeat_type          TEXT NOT NULL DEFAULT 'none',
    repeat_interval      INTEGER NOT NULL DEFAULT 1,
    repeat_days_of_week  TEXT NOT NULL DEFAULT '[]',
    completed            INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    completed_at         TEXT
);
CREATE INDEX IF NOT EXISTS pings_due ON pings (date, time);
"""


class PingError(ValueError):
    """The request is invalid (bad field, unknown id...)."""


class NotFound(PingError):
    """The ping does not exist."""


def _clean_text(text: str) -> str:
    text = (text or "").strip()
    if not text:
        raise PingError("Text cannot be empty")
    if len(text) > MAX_TEXT_LENGTH:
        raise PingError(f"Text can have at most {MAX_TEXT_LENGTH} characters")
    return text


def _clean_date(value: str) -> str:
    if not isinstance(value, str) or not _DATE_RE.match(value):
        raise PingError("date must look like 2026-10-05")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise PingError("date must look like 2026-10-05") from exc
    return value


def _clean_time(value: str) -> str:
    if not isinstance(value, str) or not _TIME_RE.match(value):
        raise PingError("time must look like 14:30 (24-hour, HH:MM)")
    return value


def _check_choice(value: Optional[str], allowed: tuple, label: str) -> None:
    if value is not None and value not in allowed:
        raise PingError(f"{label} must be one of: {', '.join(allowed)}")


def _clean_interval(value: Any) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise PingError("repeat_interval must be a whole number of 1 or more")
    return value


def _clean_days_of_week(value: Any) -> List[int]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple)):
        raise PingError("repeat_days_of_week must be a list of integers (0=Mon..6=Sun)")
    days = set()
    for item in value:
        if not isinstance(item, int) or isinstance(item, bool) or not (0 <= item <= 6):
            raise PingError("repeat_days_of_week must only contain integers 0-6 (0=Mon..6=Sun)")
        days.add(item)
    return sorted(days)


def _add_months(d: date, months: int) -> date:
    """The same day, *months* months later, clamped on shorter months."""
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, last))


def _next_weekly(due: date, interval: int, days_of_week: Sequence[int]) -> date:
    """Next date for a weekly repeat, Google-Calendar style.

    ``days_of_week`` uses 0=Mon..6=Sun. When empty, falls back to repeating
    on *due*'s own weekday every *interval* week(s) — the same as picking
    just that one day.
    """
    today = due.weekday()
    days = sorted(set(days_of_week)) if days_of_week else [today]

    later_this_week = [d for d in days if d > today]
    if later_this_week:
        return due + timedelta(days=later_this_week[0] - today)

    week_start = due - timedelta(days=today)
    return week_start + timedelta(weeks=interval, days=days[0])


def next_occurrence(
    due: date,
    repeat_type: str,
    interval: int = 1,
    days_of_week: Sequence[int] = (),
) -> date:
    """The next due date for a repeating ping ("weekly" or "monthly")."""
    if repeat_type == "weekly":
        return _next_weekly(due, interval, days_of_week)
    if repeat_type == "monthly":
        return _add_months(due, interval)
    raise PingError("repeat_type must be 'weekly' or 'monthly' to advance")


class PingStore:
    """Pings. Thread-safe; *now* can be replaced in tests."""

    def __init__(
        self,
        db_path: str | Path,
        *,
        now: Callable[[], datetime] = datetime.now,
    ) -> None:
        self._now = now
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._migrate()
        self._conn.commit()

    def _migrate(self) -> None:
        """Bring an older ``pings`` table up to the current schema in place.

        ``CREATE TABLE IF NOT EXISTS`` above is a no-op against a database
        created by a previous version of Phi, so any column added since then
        has to be added by hand here — including renaming the old ``repeat``
        column, whose values (``none``/``weekly``/``monthly``) are kept as
        ``repeat_type`` unchanged.
        """
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(pings)")}
        if "repeat_type" not in columns:
            if "repeat" in columns:
                self._conn.execute("ALTER TABLE pings ADD COLUMN repeat_type TEXT")
                self._conn.execute("UPDATE pings SET repeat_type = repeat")
                self._conn.execute(
                    "UPDATE pings SET repeat_type = 'none' WHERE repeat_type IS NULL"
                )
            else:
                self._conn.execute(
                    "ALTER TABLE pings ADD COLUMN repeat_type TEXT NOT NULL DEFAULT 'none'"
                )
        if "repeat_interval" not in columns:
            self._conn.execute(
                "ALTER TABLE pings ADD COLUMN repeat_interval INTEGER NOT NULL DEFAULT 1"
            )
        if "repeat_days_of_week" not in columns:
            self._conn.execute(
                "ALTER TABLE pings ADD COLUMN repeat_days_of_week TEXT NOT NULL DEFAULT '[]'"
            )

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _row(self, ping_id: str) -> sqlite3.Row:
        row = self._conn.execute(
            "SELECT * FROM pings WHERE id = ?", (ping_id,)
        ).fetchone()
        if row is None:
            raise NotFound(f"Ping not found: {ping_id}")
        return row

    @staticmethod
    def _dict(row: sqlite3.Row) -> Dict[str, Any]:
        try:
            days = json.loads(row["repeat_days_of_week"] or "[]")
        except (TypeError, ValueError):
            days = []
        return {
            "id": row["id"],
            "text": row["text"],
            "date": row["date"],
            "time": row["time"],
            "priority": row["priority"],
            "repeat_type": row["repeat_type"],
            "repeat_interval": row["repeat_interval"],
            "repeat_days_of_week": days,
            "completed": bool(row["completed"]),
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
        }

    def create_ping(
        self,
        *,
        text: str,
        date: str,
        time: str,
        priority: str = "medium",
        repeat_type: str = "none",
        repeat_interval: int = 1,
        repeat_days_of_week: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        text = _clean_text(text)
        date = _clean_date(date)
        time = _clean_time(time)
        _check_choice(priority, PRIORITIES, "priority")
        _check_choice(repeat_type, REPEAT_TYPES, "repeat_type")
        repeat_interval = _clean_interval(repeat_interval)
        days = _clean_days_of_week(repeat_days_of_week)
        if repeat_type != "weekly":
            days = []
        ping_id = uuid.uuid4().hex[:12]
        with self._lock:
            self._conn.execute(
                "INSERT INTO pings (id, text, date, time, priority, repeat_type,"
                " repeat_interval, repeat_days_of_week, completed, created_at,"
                " completed_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)",
                (
                    ping_id,
                    text,
                    date,
                    time,
                    priority,
                    repeat_type,
                    repeat_interval,
                    json.dumps(days),
                    self._now().isoformat(timespec="seconds"),
                ),
            )
            self._conn.commit()
            return self._dict(self._row(ping_id))

    def get_ping(self, ping_id: str) -> Dict[str, Any]:
        with self._lock:
            return self._dict(self._row(ping_id))

    _EDITABLE = (
        "text",
        "date",
        "time",
        "priority",
        "repeat_type",
        "repeat_interval",
        "repeat_days_of_week",
    )

    def update_ping(self, ping_id: str, **changes: Any) -> Dict[str, Any]:
        """Change fields. Only keys present in *changes* are touched."""
        unknown = set(changes) - set(self._EDITABLE)
        if unknown:
            raise PingError(f"Unknown field(s): {', '.join(sorted(unknown))}")
        with self._lock:
            row = self._row(ping_id)
            if "text" in changes:
                changes["text"] = _clean_text(changes["text"])
            if "date" in changes:
                changes["date"] = _clean_date(changes["date"])
            if "time" in changes:
                changes["time"] = _clean_time(changes["time"])
            if "priority" in changes:
                _check_choice(changes["priority"], PRIORITIES, "priority")
            if "repeat_type" in changes:
                _check_choice(changes["repeat_type"], REPEAT_TYPES, "repeat_type")
            if "repeat_interval" in changes:
                changes["repeat_interval"] = _clean_interval(changes["repeat_interval"])
            if "repeat_days_of_week" in changes:
                changes["repeat_days_of_week"] = _clean_days_of_week(
                    changes["repeat_days_of_week"]
                )

            effective_type = changes.get("repeat_type", row["repeat_type"])
            if effective_type != "weekly":
                # Days-of-week are only meaningful for a weekly repeat — keep
                # them cleared otherwise so stale selections never resurface
                # if the ping is later switched back to weekly.
                changes["repeat_days_of_week"] = []
            if "repeat_days_of_week" in changes:
                changes["repeat_days_of_week"] = json.dumps(changes["repeat_days_of_week"])

            for column, value in changes.items():
                self._conn.execute(
                    f"UPDATE pings SET {column} = ? WHERE id = ?", (value, ping_id)
                )
            self._conn.commit()
            return self._dict(self._row(ping_id))

    def delete_ping(self, ping_id: str) -> None:
        with self._lock:
            self._row(ping_id)
            self._conn.execute("DELETE FROM pings WHERE id = ?", (ping_id,))
            self._conn.commit()

    def complete_ping(self, ping_id: str) -> Dict[str, Any]:
        """Mark done. A repeating ping advances to its next date instead of
        staying completed; a one-off ping keeps ``completed`` for history."""
        with self._lock:
            row = self._row(ping_id)
            now = self._now().isoformat(timespec="seconds")
            if row["repeat_type"] != "none":
                try:
                    days = json.loads(row["repeat_days_of_week"] or "[]")
                except (TypeError, ValueError):
                    days = []
                following = next_occurrence(
                    date.fromisoformat(row["date"]),
                    row["repeat_type"],
                    row["repeat_interval"],
                    days,
                )
                self._conn.execute(
                    "UPDATE pings SET date = ?, completed = 0, completed_at = NULL"
                    " WHERE id = ?",
                    (following.isoformat(), ping_id),
                )
            else:
                self._conn.execute(
                    "UPDATE pings SET completed = 1, completed_at = ? WHERE id = ?",
                    (now, ping_id),
                )
            self._conn.commit()
            return self._dict(self._row(ping_id))

    def snooze_ping(
        self, ping_id: str, minutes: int = DEFAULT_SNOOZE_MINUTES
    ) -> Dict[str, Any]:
        """Push the due date/time forward by *minutes* (default one hour)."""
        if not isinstance(minutes, int) or isinstance(minutes, bool) or minutes <= 0:
            raise PingError("minutes must be a whole number greater than 0")
        with self._lock:
            row = self._row(ping_id)
            due = datetime.combine(
                date.fromisoformat(row["date"]),
                datetime.strptime(row["time"], "%H:%M").time(),
            )
            pushed = due + timedelta(minutes=minutes)
            self._conn.execute(
                "UPDATE pings SET date = ?, time = ? WHERE id = ?",
                (pushed.date().isoformat(), pushed.strftime("%H:%M"), ping_id),
            )
            self._conn.commit()
            return self._dict(self._row(ping_id))

    def list_pings(self, *, upcoming: bool = False) -> List[Dict[str, Any]]:
        """All pings, or (``upcoming=True``) only the not-yet-completed ones,
        soonest due first."""
        with self._lock:
            sql = "SELECT * FROM pings"
            if upcoming:
                sql += " WHERE completed = 0"
            sql += " ORDER BY date, time"
            rows = self._conn.execute(sql).fetchall()
            return [self._dict(r) for r in rows]
