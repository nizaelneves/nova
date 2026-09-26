"""HTTP API for tasks."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from nova.server.tasks_routes import create_tasks_router
from nova.tasks.store import TaskStore


@pytest.fixture
def client(tmp_path):
    store = TaskStore(tmp_path / "t.db", now=lambda: datetime(2026, 10, 7, 12, 0))
    app = FastAPI()
    app.include_router(create_tasks_router(lambda: store))
    yield TestClient(app)
    store.close()


def _task(client, **over):
    body = {"title": "Task", "due": "2026-10-07", "all_day": True, **over}
    response = client.post("/api/tasks", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_read_a_task(client) -> None:
    rule = {"freq": "weekly", "weekdays": [2]}
    task = _task(client, priority="high", recurrence=rule)
    got = client.get(f"/api/tasks/{task['id']}").json()
    assert got["priority"] == "high" and got["recurrence"]["weekdays"] == [2]


def test_validation_errors_are_422(client) -> None:
    assert client.post("/api/tasks", json={"title": "x"}).status_code == 422
    bad = client.post("/api/tasks", json={"title": "x", "due": "soon", "all_day": True})
    assert bad.status_code == 422
    assert client.get("/api/tasks/missing").status_code == 404


def test_views_and_summary(client) -> None:
    _task(client, title="late", due="2026-10-01")
    _task(client, title="now", due="2026-10-07")
    _task(client, title="soon", due="2026-10-09")
    for view, expected in (("overdue", "late"), ("today", "now"), ("upcoming", "soon")):
        tasks = client.get(f"/api/tasks?view={view}").json()["tasks"]
        assert [t["title"] for t in tasks] == [expected]
    assert client.get("/api/tasks/summary").json() == {
        "today": 1,
        "upcoming": 1,
        "overdue": 1,
    }


def test_kanban_drag_changes_status(client) -> None:
    task = _task(client)
    moved = client.post(f"/api/tasks/{task['id']}/status", json={"status": "doing"})
    assert moved.json()["status"] == "doing"
    columns = client.get("/api/tasks/kanban").json()["columns"]
    assert [t["id"] for t in columns["doing"]] == [task["id"]]
    bad = client.post(f"/api/tasks/{task['id']}/status", json={"status": "later"})
    assert bad.status_code == 422


def test_patch_updates_and_clears_fields(client) -> None:
    task = _task(client, priority="low")
    patched = client.patch(f"/api/tasks/{task['id']}", json={"title": "New"}).json()
    assert patched["title"] == "New" and patched["priority"] == "low"
    cleared = client.patch(f"/api/tasks/{task['id']}", json={"priority": None}).json()
    assert cleared["priority"] is None


def test_delete_task(client) -> None:
    task = _task(client)
    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404


def test_area_flow_including_the_move_on_delete_rule(client) -> None:
    home = client.get("/api/tasks/areas").json()["areas"][0]
    work = client.post("/api/tasks/areas", json={"name": "Work"}).json()
    assert client.post("/api/tasks/areas", json={"name": "work"}).status_code == 422
    _task(client, area_id=work["id"])

    blocked = client.delete(f"/api/tasks/areas/{work['id']}")
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["task_count"] == 1

    ok = client.delete(f"/api/tasks/areas/{work['id']}?move_to={home['id']}")
    assert ok.status_code == 204
    assert client.get("/api/tasks").json()["tasks"][0]["area_id"] == home["id"]


def test_rename_area(client) -> None:
    area = client.post("/api/tasks/areas", json={"name": "Wrk"}).json()
    renamed = client.patch(f"/api/tasks/areas/{area['id']}", json={"name": "Work"})
    assert renamed.json()["name"] == "Work"
