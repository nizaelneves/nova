"""The tasks API is part of the real Nova server."""

from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from nova.server.app import create_app


def test_tasks_api_is_served_by_the_real_app(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("NOVA_HOME", str(tmp_path / "home"))
    engine = SimpleNamespace(engine_id="fake", health=lambda: True)
    client = TestClient(create_app(engine, "fake"))

    created = client.post(
        "/api/tasks",
        json={"title": "Call the bank", "due": "2026-10-09", "all_day": True},
    )
    assert created.status_code == 201
    assert client.get("/api/tasks/areas").json()["areas"][0]["name"] == "General"
    assert (tmp_path / "home" / "tasks.db").exists()
