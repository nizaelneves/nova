"""Tasks, areas, views and Kanban rules."""

from __future__ import annotations

from datetime import datetime

import pytest

from nova.tasks.store import AreaNotEmpty, NotFound, TaskError, TaskStore

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


def test_a_default_area_exists_so_tasks_can_be_created_at_once(store) -> None:
    assert [a["name"] for a in store.list_areas()] == ["General"]
    task = _add(store, "Pay rent", "2026-10-10")
    assert task["area"] == "General" and task["status"] == "todo"


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


def test_deleting_an_area_with_tasks_needs_a_destination(store) -> None:
    home = store.list_areas()[0]
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
    extra = store.create_area("Empty")
    store.delete_area(extra["id"])
    assert len(store.list_areas()) == 1


def test_last_area_cannot_be_deleted(store) -> None:
    with pytest.raises(TaskError):
        store.delete_area(store.list_areas()[0]["id"])


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
    work = store.create_area("Work")
    _add(store, "home", "2026-10-07")
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
    _add(first, "kept", "2026-10-09")
    first.close()
    second = TaskStore(path, now=lambda: NOW)
    assert [t["title"] for t in second.list_tasks()] == ["kept"]
    assert len(second.list_areas()) == 1
    second.close()
