"""SQLite storage and rules for Nova's tasks and areas.

Dates are local, naive values: a timed task keeps ``YYYY-MM-DDTHH:MM``, an
all-day task keeps ``YYYY-MM-DD``.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from nova.tasks.recurrence import next_due, validate_rule

STATUSES = ("todo", "doing", "done")
PRIORITIES = ("high", "medium", "low")
DEFAULT_AREA = "General"

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS areas (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE COLLATE NOCASE,
    position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    notes        TEXT NOT NULL DEFAULT '',
    area_id      TEXT NOT NULL REFERENCES areas(id),
    due          TEXT NOT NULL,
    all_day      INTEGER NOT NULL,
    priority     TEXT,
    status       TEXT NOT NULL DEFAULT 'todo',
    recurrence   TEXT,
    series_id    TEXT,
    occurrence   INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS tasks_due ON tasks (due);
CREATE INDEX IF NOT EXISTS tasks_area ON tasks (area_id);
"""


class TaskError(ValueError):
    """The request is invalid (bad field, unknown id...)."""


class NotFound(TaskError):
    """The area or task does not exist."""


class AreaNotEmpty(TaskError):
    """The area still has tasks; the caller must say where to move them."""

    def __init__(self, count: int) -> None:
        super().__init__(f"Area has {count} task(s); choose an area to move them to")
        self.count = count


def _parse_due(value: str, all_day: bool) -> str:
    """Normalise *value* to ``YYYY-MM-DD`` (all day) or ``YYYY-MM-DDTHH:MM``."""
    try:
        if all_day:
            return date.fromisoformat(str(value)[:10]).isoformat()
        return datetime.fromisoformat(str(value)).strftime("%Y-%m-%dT%H:%M")
    except ValueError as exc:
        raise TaskError(
            "due must look like 2026-10-05 (all day) or 2026-10-05T14:30"
        ) from exc


class TaskStore:
    """Tasks and areas. Thread-safe; *now* can be replaced in tests."""

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
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.executescript(_SCHEMA)
        self._conn.commit()
        if not self._conn.execute("SELECT 1 FROM areas LIMIT 1").fetchone():
            self.create_area(DEFAULT_AREA)

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # -- areas ---------------------------------------------------------------

    def _area_row(self, area_id: str) -> sqlite3.Row:
        row = self._conn.execute(
            "SELECT * FROM areas WHERE id = ?", (area_id,)
        ).fetchone()
        if row is None:
            raise NotFound(f"Area not found: {area_id}")
        return row

    def _area_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        count = self._conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE area_id = ?", (row["id"],)
        ).fetchone()[0]
        return {"id": row["id"], "name": row["name"], "task_count": count}

    @staticmethod
    def _clean_name(name: str) -> str:
        name = (name or "").strip()
        if not name:
            raise TaskError("Area name cannot be empty")
        return name

    def list_areas(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM areas ORDER BY position, name"
            ).fetchall()
            return [self._area_dict(r) for r in rows]

    def create_area(self, name: str) -> Dict[str, Any]:
        name = self._clean_name(name)
        with self._lock:
            position = self._conn.execute(
                "SELECT COALESCE(MAX(position), 0) + 1 FROM areas"
            ).fetchone()[0]
            area_id = uuid.uuid4().hex[:12]
            try:
                self._conn.execute(
                    "INSERT INTO areas (id, name, position) VALUES (?, ?, ?)",
                    (area_id, name, position),
                )
            except sqlite3.IntegrityError as exc:
                raise TaskError(f"An area named '{name}' already exists") from exc
            self._conn.commit()
            return self._area_dict(self._area_row(area_id))

    def rename_area(self, area_id: str, name: str) -> Dict[str, Any]:
        name = self._clean_name(name)
        with self._lock:
            self._area_row(area_id)
            try:
                self._conn.execute(
                    "UPDATE areas SET name = ? WHERE id = ?", (name, area_id)
                )
            except sqlite3.IntegrityError as exc:
                raise TaskError(f"An area named '{name}' already exists") from exc
            self._conn.commit()
            return self._area_dict(self._area_row(area_id))

    def delete_area(self, area_id: str, move_to: Optional[str] = None) -> None:
        """Delete an area. If it has tasks, *move_to* says where they go."""
        with self._lock:
            self._area_row(area_id)
            count = self._conn.execute(
                "SELECT COUNT(*) FROM tasks WHERE area_id = ?", (area_id,)
            ).fetchone()[0]
            total = self._conn.execute("SELECT COUNT(*) FROM areas").fetchone()[0]
            if total <= 1:
                raise TaskError("At least one area must remain")
            if count:
                if not move_to:
                    raise AreaNotEmpty(count)
                if move_to == area_id:
                    raise TaskError("Cannot move tasks into the area being deleted")
                self._area_row(move_to)
                self._conn.execute(
                    "UPDATE tasks SET area_id = ? WHERE area_id = ?",
                    (move_to, area_id),
                )
            self._conn.execute("DELETE FROM areas WHERE id = ?", (area_id,))
            self._conn.commit()

    # -- tasks ---------------------------------------------------------------

    def _task_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        area = self._conn.execute(
            "SELECT name FROM areas WHERE id = ?", (row["area_id"],)
        ).fetchone()
        recurrence = json.loads(row["recurrence"]) if row["recurrence"] else None
        return {
            "id": row["id"],
            "title": row["title"],
            "notes": row["notes"],
            "area_id": row["area_id"],
            "area": area["name"] if area else "",
            "due": row["due"],
            "all_day": bool(row["all_day"]),
            "priority": row["priority"],
            "status": row["status"],
            "recurrence": recurrence,
            "series_id": row["series_id"],
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
        }

    def _task_row(self, task_id: str) -> sqlite3.Row:
        row = self._conn.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if row is None:
            raise NotFound(f"Task not found: {task_id}")
        return row

    @staticmethod
    def _check_choice(value: Optional[str], allowed: tuple, label: str) -> None:
        if value is not None and value not in allowed:
            raise TaskError(f"{label} must be one of: {', '.join(allowed)}")

    def _insert(self, values: Dict[str, Any]) -> str:
        task_id = uuid.uuid4().hex[:12]
        recurrence = values.get("recurrence")
        self._conn.execute(
            "INSERT INTO tasks (id, title, notes, area_id, due, all_day, priority,"
            " status, recurrence, series_id, occurrence, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                task_id,
                values["title"],
                values.get("notes", ""),
                values["area_id"],
                values["due"],
                int(values["all_day"]),
                values.get("priority"),
                values.get("status", "todo"),
                json.dumps(recurrence) if recurrence else None,
                values.get("series_id") or (task_id if recurrence else None),
                values.get("occurrence", 1),
                self._now().isoformat(timespec="seconds"),
            ),
        )
        return task_id

    def create_task(
        self,
        *,
        title: str,
        due: str,
        all_day: bool,
        area_id: Optional[str] = None,
        priority: Optional[str] = None,
        status: str = "todo",
        notes: str = "",
        recurrence: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        title = (title or "").strip()
        if not title:
            raise TaskError("Title cannot be empty")
        self._check_choice(priority, PRIORITIES, "priority")
        self._check_choice(status, STATUSES, "status")
        try:
            rule = validate_rule(recurrence) if recurrence else None
        except ValueError as exc:
            raise TaskError(str(exc)) from exc
        with self._lock:
            if area_id is None:
                area_id = self._conn.execute(
                    "SELECT id FROM areas ORDER BY position LIMIT 1"
                ).fetchone()["id"]
            self._area_row(area_id)
            task_id = self._insert(
                {
                    "title": title,
                    "notes": notes,
                    "area_id": area_id,
                    "due": _parse_due(due, all_day),
                    "all_day": all_day,
                    "priority": priority,
                    "status": status,
                    "recurrence": rule,
                }
            )
            if status == "done":
                self._finish(task_id)
            self._conn.commit()
            return self._task_dict(self._task_row(task_id))

    def get_task(self, task_id: str) -> Dict[str, Any]:
        with self._lock:
            return self._task_dict(self._task_row(task_id))

    _EDITABLE = (
        "title",
        "notes",
        "area_id",
        "due",
        "all_day",
        "priority",
        "recurrence",
    )

    def update_task(self, task_id: str, **changes: Any) -> Dict[str, Any]:
        """Change fields. Only keys present in *changes* are touched, so
        ``priority=None`` clears the priority and omitting it keeps it."""
        unknown = set(changes) - set(self._EDITABLE) - {"status"}
        if unknown:
            raise TaskError(f"Unknown field(s): {', '.join(sorted(unknown))}")
        with self._lock:
            row = self._task_row(task_id)
            if "title" in changes:
                changes["title"] = (changes["title"] or "").strip()
                if not changes["title"]:
                    raise TaskError("Title cannot be empty")
            if "priority" in changes:
                self._check_choice(changes["priority"], PRIORITIES, "priority")
            if "area_id" in changes:
                self._area_row(changes["area_id"])
            if "recurrence" in changes:
                try:
                    changes["recurrence"] = (
                        validate_rule(changes["recurrence"])
                        if changes["recurrence"]
                        else None
                    )
                except ValueError as exc:
                    raise TaskError(str(exc)) from exc
            if "due" in changes or "all_day" in changes:
                all_day = bool(changes.get("all_day", row["all_day"]))
                changes["all_day"] = all_day
                changes["due"] = _parse_due(changes.get("due", row["due"]), all_day)
            status = changes.pop("status", None)
            for column, value in changes.items():
                if column == "recurrence":
                    value = json.dumps(value) if value else None
                elif column == "all_day":
                    value = int(value)
                self._conn.execute(
                    f"UPDATE tasks SET {column} = ? WHERE id = ?", (value, task_id)
                )
            if "recurrence" in changes and changes["recurrence"]:
                self._conn.execute(
                    "UPDATE tasks SET series_id = COALESCE(series_id, id) WHERE id = ?",
                    (task_id,),
                )
            if status is not None:
                self.set_status(task_id, status, _commit=False)
            self._conn.commit()
            return self._task_dict(self._task_row(task_id))

    def delete_task(self, task_id: str) -> None:
        with self._lock:
            self._task_row(task_id)
            self._conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            self._conn.commit()

    def _finish(self, task_id: str) -> Optional[str]:
        """Stamp *task_id* as done; return the id of the next occurrence, if any."""
        row = self._task_row(task_id)
        self._conn.execute(
            "UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?",
            (self._now().isoformat(timespec="seconds"), task_id),
        )
        if not row["recurrence"]:
            return None
        rule = json.loads(row["recurrence"])
        due = (
            date.fromisoformat(row["due"])
            if row["all_day"]
            else datetime.fromisoformat(row["due"])
        )
        # Anchor the day of month on the first occurrence so 31 Jan -> 28 Feb
        # comes back to 31 Mar instead of drifting to the 28th.
        first = self._conn.execute(
            "SELECT due FROM tasks WHERE series_id = ? AND occurrence = 1",
            (row["series_id"],),
        ).fetchone()
        anchor = int(first["due"][8:10]) if first else None
        following = next_due(
            due, rule, occurrences_so_far=row["occurrence"], anchor_day=anchor
        )
        if following is None:
            return None
        already = self._conn.execute(
            "SELECT 1 FROM tasks WHERE series_id = ? AND occurrence = ?",
            (row["series_id"], row["occurrence"] + 1),
        ).fetchone()
        if already:
            return None
        return self._insert(
            {
                "title": row["title"],
                "notes": row["notes"],
                "area_id": row["area_id"],
                "due": following.strftime(
                    "%Y-%m-%d" if row["all_day"] else "%Y-%m-%dT%H:%M"
                ),
                "all_day": bool(row["all_day"]),
                "priority": row["priority"],
                "status": "todo",
                "recurrence": rule,
                "series_id": row["series_id"],
                "occurrence": row["occurrence"] + 1,
            }
        )

    def set_status(
        self, task_id: str, status: str, *, _commit: bool = True
    ) -> Dict[str, Any]:
        """Move a task between To Do / Doing / Done (Kanban drag).

        Finishing a repeating task also creates its next occurrence.
        """
        self._check_choice(status, STATUSES, "status")
        with self._lock:
            row = self._task_row(task_id)
            if status == "done" and row["status"] != "done":
                self._finish(task_id)
            elif status != "done":
                self._conn.execute(
                    "UPDATE tasks SET status = ?, completed_at = NULL WHERE id = ?",
                    (status, task_id),
                )
            if _commit:
                self._conn.commit()
            return self._task_dict(self._task_row(task_id))

    # -- views ---------------------------------------------------------------

    def _open_tasks(self, area_id: Optional[str]) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM tasks WHERE status != 'done'"
        args: List[Any] = []
        if area_id:
            sql += " AND area_id = ?"
            args.append(area_id)
        rows = self._conn.execute(sql + " ORDER BY due", args).fetchall()
        return [self._task_dict(r) for r in rows]

    @staticmethod
    def _sort(tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rank = {"high": 0, "medium": 1, "low": 2, None: 3}
        return sorted(tasks, key=lambda t: (t["due"], rank[t["priority"]], t["title"]))

    def _is_overdue(self, task: Dict[str, Any], now: datetime) -> bool:
        if task["all_day"]:
            return date.fromisoformat(task["due"]) < now.date()
        return datetime.fromisoformat(task["due"]) < now

    def _due_day(self, task: Dict[str, Any]) -> date:
        return date.fromisoformat(task["due"][:10])

    def list_tasks(
        self,
        *,
        view: str = "all",
        area_id: Optional[str] = None,
        status: Optional[str] = None,
        upcoming_days: int = 7,
    ) -> List[Dict[str, Any]]:
        """Views: ``today``, ``upcoming``, ``overdue`` (open tasks only) or ``all``.

        * today — open tasks due today that are not late yet (a timed task
          whose hour has passed moves to *overdue*)
        * upcoming — open tasks due after today, up to *upcoming_days* days
        * overdue — open tasks whose date (or time, if timed) has passed
        """
        if view not in ("today", "upcoming", "overdue", "all"):
            raise TaskError("view must be today, upcoming, overdue or all")
        self._check_choice(status, STATUSES, "status")
        with self._lock:
            if area_id:
                self._area_row(area_id)
            now = self._now()
            today = now.date()
            if view == "all":
                sql = "SELECT * FROM tasks WHERE 1=1"
                args: List[Any] = []
                if area_id:
                    sql += " AND area_id = ?"
                    args.append(area_id)
                if status:
                    sql += " AND status = ?"
                    args.append(status)
                rows = self._conn.execute(sql + " ORDER BY due", args).fetchall()
                return self._sort([self._task_dict(r) for r in rows])
            tasks = self._open_tasks(area_id)
            if status:
                tasks = [t for t in tasks if t["status"] == status]
            overdue = [t for t in tasks if self._is_overdue(t, now)]
            if view == "overdue":
                return self._sort(overdue)
            late_ids = {t["id"] for t in overdue}
            live = [t for t in tasks if t["id"] not in late_ids]
            if view == "today":
                return self._sort([t for t in live if self._due_day(t) == today])
            limit = today + timedelta(days=upcoming_days)
            return self._sort([t for t in live if today < self._due_day(t) <= limit])

    def kanban(
        self, *, area_id: Optional[str] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Tasks grouped by status, each column sorted by due date."""
        with self._lock:
            if area_id:
                self._area_row(area_id)
            board: Dict[str, List[Dict[str, Any]]] = {s: [] for s in STATUSES}
            for task in self.list_tasks(view="all", area_id=area_id):
                board[task["status"]].append(task)
            return board

    def summary(self) -> Dict[str, int]:
        """Counts for the Today / Upcoming / Overdue tabs."""
        return {
            view: len(self.list_tasks(view=view))
            for view in ("today", "upcoming", "overdue")
        }
