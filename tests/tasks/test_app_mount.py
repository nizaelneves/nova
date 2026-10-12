"""The tasks API is part of the real Phibe server."""

from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from phibe.server.app import create_app


def test_tasks_api_is_served_by_the_real_app(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path / "home"))
    engine = SimpleNamespace(engine_id="fake", health=lambda: True)
    client = TestClient(create_app(engine, "fake"))

    created = client.post(
        "/api/tasks",
        json={"title": "Call the bank", "due": "2026-10-09", "all_day": True},
    )
    assert created.status_code == 201
    # No area is auto-seeded any more; a task can exist without one.
    assert client.get("/api/tasks/areas").json()["areas"] == []
    assert created.json()["area_id"] is None
    assert (tmp_path / "home" / "tasks.db").exists()
