"""Tasks, areas, views and Kanban rules."""

from __future__ import annotations

from datetime import datetime

import pytest

from phibe.tasks.store import AreaNotEmpty, NotFound, TaskError, TaskStore

NOW = datetime(2026, 10, 7, 12, 0)  # Wednesday, noon


@pytest.fixture
def store(tmp_path):
    s = TaskStore(tmp_path / "tasks.db", now=lambda: NOW)
    yield s
    s.close()


def _add(store: TaskStore, title: str, due: str, all_day: bool = True, **kw):
    return store.create_task(title=title, due=due, all_day=all_day, **kw)


def _finish(store: TaskStore, task: dict) -> list:
    before = {t["id"] for t in store.list_tasks()}
    store.set_status(task["id"], "done")
    return [t for t in store.list_tasks() if t["id"] not in before]


def test_no_area_is_auto_seeded_but_a_task_can_still_be_created(store) -> None:
    assert store.list_areas() == []
    task = _add(store, "Pay rent", "2026-10-10")
    assert task["area_id"] is None and task["area"] == "" and task["status"] == "todo"


def test_required_and_optional_fields(store) -> None:
    task = _add(store, "Report", "2026-10-09T09:30", all_day=False, priority="high")
    assert task["due"] == "2026-10-09T09:30"
    assert task["all_day"] is False and task["priority"] == "high"
    assert _add(store, "Loose", "2026-10-09")["priority"] is None


@pytest.mark.parametrize(
    "kwargs",
    [
        {"title": " ", "due": "2026-10-09"},
        {"title": "x", "due": "tomorrow"},
        {"title": "x", "due": "2026-10-09", "priority": "urgent"},
        {"title": "x", "due": "2026-10-09", "status": "later"},
        {"title": "x", "due": "2026-10-09", "recurrence": {"freq": "hourly"}},
    ],
)
def test_bad_input_is_rejected(store, kwargs) -> None:
    with pytest.raises(TaskError):
        store.create_task(all_day=True, **kwargs)


def test_area_names_are_unique_ignoring_case(store) -> None:
    store.create_area("Work")
    with pytest.raises(TaskError):
        store.create_area("work")


def test_rename_area_keeps_its_tasks(store) -> None:
    area = store.create_area("Wrk")
    _add(store, "a", "2026-10-09", area_id=area["id"])
    renamed = store.rename_area(area["id"], "Work")
    assert renamed["name"] == "Work" and renamed["task_count"] == 1


def test_deleting_an_area_with_tasks_needs_a_destination_when_others_remain(
    store,
) -> None:
    home = store.create_area("Home")
    work = store.create_area("Work")
    _add(store, "a", "2026-10-09", area_id=work["id"])
    _add(store, "b", "2026-10-09", area_id=work["id"])

    with pytest.raises(AreaNotEmpty) as info:
        store.delete_area(work["id"])
    assert info.value.count == 2

    store.delete_area(work["id"], move_to=home["id"])
    assert [a["id"] for a in store.list_areas()] == [home["id"]]
    assert {t["area_id"] for t in store.list_tasks()} == {home["id"]}


def test_empty_area_deletes_without_a_destination(store) -> None:
    store.create_area("Home")
    extra = store.create_area("Empty")
    store.delete_area(extra["id"])
    assert len(store.list_areas()) == 1


def test_last_area_can_be_deleted_and_nulls_out_its_tasks(store) -> None:
    only = store.create_area("Only")
    _add(store, "a", "2026-10-09", area_id=only["id"])
    _add(store, "b", "2026-10-09", area_id=only["id"])

    store.delete_area(only["id"])
    assert store.list_areas() == []
    assert {t["area_id"] for t in store.list_tasks()} == {None}
    assert {t["area"] for t in store.list_tasks()} == {""}

    # a fresh task can still be created with no area at all
    task = _add(store, "c", "2026-10-09")
    assert task["area_id"] is None


def test_cannot_move_tasks_into_the_area_being_deleted(store) -> None:
    work = store.create_area("Work")
    _add(store, "a", "2026-10-09", area_id=work["id"])
    with pytest.raises(TaskError):
        store.delete_area(work["id"], move_to=work["id"])


def test_today_upcoming_overdue_views(store) -> None:
    _add(store, "late day", "2026-10-06")
    _add(store, "late hour", "2026-10-07T09:00", all_day=False)
    _add(store, "today all day", "2026-10-07")
    _add(store, "today later", "2026-10-07T18:00", all_day=False)
    _add(store, "tomorrow", "2026-10-08")
    _add(store, "next week", "2026-10-14")
    _add(store, "far away", "2026-12-01")
    finished = _add(store, "done late", "2026-10-01")
    store.set_status(finished["id"], "done")

    def titles(view: str) -> list:
        return [t["title"] for t in store.list_tasks(view=view)]

    assert titles("overdue") == ["late day", "late hour"]
    assert titles("today") == ["today all day", "today later"]
    assert titles("upcoming") == ["tomorrow", "next week"]
    assert store.summary() == {"today": 2, "upcoming": 2, "overdue": 2}


def test_views_can_be_limited_to_an_area(store) -> None:
    home_area = store.create_area("Home")
    work = store.create_area("Work")
    _add(store, "home", "2026-10-07", area_id=home_area["id"])
    _add(store, "job", "2026-10-07", area_id=work["id"])
    tasks = store.list_tasks(view="today", area_id=work["id"])
    assert [t["title"] for t in tasks] == ["job"]


def test_same_day_tasks_are_ordered_by_priority(store) -> None:
    _add(store, "low", "2026-10-09", priority="low")
    _add(store, "none", "2026-10-09")
    _add(store, "high", "2026-10-09", priority="high")
    assert [t["title"] for t in store.list_tasks()] == ["high", "low", "none"]


def test_kanban_groups_by_status_and_dragging_changes_status(store) -> None:
    a = _add(store, "a", "2026-10-09")
    _add(store, "b", "2026-10-10", status="doing")
    store.set_status(a["id"], "doing")
    board = store.kanban()
    assert board["todo"] == []
    assert [t["title"] for t in board["doing"]] == ["a", "b"]

    done = store.set_status(a["id"], "done")
    assert done["completed_at"] == NOW.isoformat(timespec="seconds")
    assert [t["title"] for t in store.kanban()["done"]] == ["a"]

    reopened = store.set_status(a["id"], "todo")
    assert reopened["completed_at"] is None


def test_update_changes_only_what_is_sent(store) -> None:
    task = _add(store, "a", "2026-10-09", priority="high")
    updated = store.update_task(task["id"], title="b")
    assert updated["title"] == "b" and updated["priority"] == "high"
    cleared = store.update_task(task["id"], priority=None)
    assert cleared["priority"] is None


def test_switching_to_all_day_drops_the_time(store) -> None:
    task = _add(store, "a", "2026-10-09T09:30", all_day=False)
    updated = store.update_task(task["id"], all_day=True)
    assert updated["due"] == "2026-10-09"


def test_unknown_ids_and_fields(store) -> None:
    with pytest.raises(NotFound):
        store.get_task("nope")
    task = _add(store, "a", "2026-10-09")
    with pytest.raises(TaskError):
        store.update_task(task["id"], colour="red")
    with pytest.raises(NotFound):
        store.update_task(task["id"], area_id="nope")


def test_delete_task(store) -> None:
    task = _add(store, "a", "2026-10-09")
    store.delete_task(task["id"])
    assert store.list_tasks() == []


def test_finishing_a_repeating_task_creates_the_next_one(store) -> None:
    rule = {"freq": "weekly", "interval": 2, "weekdays": [2]}
    first = _add(store, "Sync", "2026-10-07T10:00", all_day=False, recurrence=rule)
    store.set_status(first["id"], "done")

    open_tasks = [t for t in store.list_tasks() if t["status"] != "done"]
    assert len(open_tasks) == 1
    nxt = open_tasks[0]
    assert nxt["due"] == "2026-10-21T10:00"
    assert nxt["series_id"] == first["series_id"]
    assert nxt["recurrence"]["interval"] == 2


def test_finishing_twice_does_not_duplicate_the_next_occurrence(store) -> None:
    first = _add(store, "Daily", "2026-10-07", recurrence={"freq": "daily"})
    store.set_status(first["id"], "done")
    store.set_status(first["id"], "todo")
    store.set_status(first["id"], "done")
    assert len(store.list_tasks()) == 2


def test_series_stops_at_its_end(store) -> None:
    first = _add(store, "Twice", "2026-10-07", recurrence={"freq": "daily", "count": 2})
    second = _finish(store, first)[0]
    assert _finish(store, second) == []
    assert [t["status"] for t in store.list_tasks()] == ["done", "done"]


def test_monthly_series_returns_to_the_anchor_day(store) -> None:
    first = _add(store, "Rent", "2026-01-31", recurrence={"freq": "monthly"})
    feb = _finish(store, first)[0]
    assert feb["due"] == "2026-02-28"
    mar = _finish(store, feb)[0]
    assert mar["due"] == "2026-03-31"


def test_data_survives_reopening_the_database(tmp_path) -> None:
    path = tmp_path / "tasks.db"
    first = TaskStore(path, now=lambda: NOW)
    first.create_area("Home")
    _add(first, "kept", "2026-10-09")
    first.close()
    second = TaskStore(path, now=lambda: NOW)
    assert [t["title"] for t in second.list_tasks()] == ["kept"]
    assert len(second.list_areas()) == 1
    second.close()


def test_migration_makes_area_id_nullable_on_an_old_schema_db(tmp_path) -> None:
    """A pre-existing db (from before areas became optional) had ``area_id``
    as NOT NULL and auto-seeded a "General" area. Opening it with the new
    store must not crash, must keep existing tasks and their area, and must
    allow deleting the only area afterwards (nulling out its tasks)."""
    import sqlite3

    db_path = tmp_path / "old.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE areas (
            id       TEXT PRIMARY KEY,
            name     TEXT NOT NULL UNIQUE COLLATE NOCASE,
            position INTEGER NOT NULL
        );
        CREATE TABLE tasks (
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
        CREATE INDEX tasks_due ON tasks (due);
        CREATE INDEX tasks_area ON tasks (area_id);
        INSERT INTO areas (id, name, position) VALUES ('area1', 'General', 1);
        INSERT INTO tasks (id, title, notes, area_id, due, all_day, priority,
            status, recurrence, series_id, occurrence, created_at, completed_at)
        VALUES ('task1', 'Old task', '', 'area1', '2026-10-09', 1, NULL, 'todo',
            NULL, NULL, 1, '2026-10-01T00:00:00', NULL);
        """
    )
    conn.commit()
    conn.close()

    store = TaskStore(db_path, now=lambda: NOW)
    try:
        task = store.get_task("task1")
        assert task["area_id"] == "area1" and task["area"] == "General"
        # The only area can now be deleted; its task loses its area instead
        # of blocking the deletion.
        store.delete_area("area1")
        assert store.list_areas() == []
        assert store.get_task("task1")["area_id"] is None
        # And a brand-new task can be created with no area at all.
        fresh = store.create_task(title="New", due="2026-10-10", all_day=True)
        assert fresh["area_id"] is None
    finally:
        store.close()


def test_a_task_without_an_area_stays_personal_even_when_areas_exist(store) -> None:
    store.create_area("Client")
    assert _add(store, "mine", "2026-10-09")["area_id"] is None


def test_a_task_can_span_days_and_rejects_a_start_after_its_end(store) -> None:
    t = _add(store, "Trip", "2026-10-12", start="2026-10-09")
    assert (t["start"], t["due"]) == ("2026-10-09", "2026-10-12")
    assert _add(store, "Plain", "2026-10-12")["start"] is None
    with pytest.raises(TaskError):
        _add(store, "Backwards", "2026-10-09", start="2026-10-12")
    assert store.update_task(t["id"], start=None)["start"] is None
    with pytest.raises(TaskError):
        store.update_task(t["id"], start="2026-10-20")


def test_a_repeating_span_moves_whole(store) -> None:
    t = _add(store, "Sprint", "2026-10-12", start="2026-10-09", recurrence={"freq": "weekly"})
    (nxt,) = _finish(store, t)
    assert (nxt["start"], nxt["due"]) == ("2026-10-16", "2026-10-19")


def test_migration_adds_start_to_a_db_that_lacks_it(tmp_path) -> None:
    import sqlite3

    path = tmp_path / "old.db"
    db = sqlite3.connect(path)
    db.executescript(
        "CREATE TABLE areas (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, position INTEGER NOT NULL);"
        "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',"
        " area_id TEXT, due TEXT NOT NULL, all_day INTEGER NOT NULL, priority TEXT, status TEXT NOT NULL DEFAULT 'todo',"
        " recurrence TEXT, series_id TEXT, occurrence INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, completed_at TEXT);"
        "INSERT INTO tasks (id, title, due, all_day, created_at) VALUES ('a', 'Old', '2026-10-05', 1, '2026-10-01T00:00:00');"
    )
    db.commit()
    db.close()
    s = TaskStore(path, now=lambda: NOW)
    assert s.get_task("a")["start"] is None
    assert s.create_task(title="New", due="2026-10-06", all_day=True, start="2026-10-05")["start"] == "2026-10-05"
    s.close()
