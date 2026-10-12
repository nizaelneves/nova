"""HTTP API for Pings: ``/v1/pings/*``."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.server.pings_router import create_pings_router
from phibe.pings.store import PingStore


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path))
    store = PingStore(tmp_path / "p.db", now=lambda: datetime(2026, 10, 7, 12, 0))
    app = FastAPI()
    app.include_router(create_pings_router(lambda: store))
    yield TestClient(app)
    store.close()


def _ping(client, **over):
    body = {"text": "Water the plants", "date": "2026-10-10", "time": "09:00", **over}
    response = client.post("/v1/pings", json=body)
    assert response.status_code == 201, response.text
    return response.json()


# -- CRUD ----------------------------------------------------------------------


def test_create_and_list_a_ping(client) -> None:
    ping = _ping(client, priority="high", repeat_type="weekly", repeat_days_of_week=[0, 2, 4])
    got = client.get("/v1/pings").json()["pings"]
    assert [p["id"] for p in got] == [ping["id"]]
    assert got[0]["priority"] == "high"
    assert got[0]["repeat_type"] == "weekly"
    assert got[0]["repeat_days_of_week"] == [0, 2, 4]


def test_defaults_are_medium_priority_and_no_repeat(client) -> None:
    ping = _ping(client)
    assert ping["priority"] == "medium"
    assert ping["repeat_type"] == "none"
    assert ping["repeat_interval"] == 1
    assert ping["repeat_days_of_week"] == []
    assert ping["completed"] is False


def test_validation_errors_are_422(client) -> None:
    assert client.post("/v1/pings", json={"text": ""}).status_code == 422
    bad = client.post(
        "/v1/pings", json={"text": "x", "date": "not-a-date", "time": "09:00"}
    )
    assert bad.status_code == 422
    bad_priority = client.post(
        "/v1/pings",
        json={"text": "x", "date": "2026-10-10", "time": "09:00", "priority": "urgent"},
    )
    assert bad_priority.status_code == 422


def test_missing_ping_is_404(client) -> None:
    assert client.patch("/v1/pings/missing", json={"text": "x"}).status_code == 404
    assert client.post("/v1/pings/missing/complete").status_code == 404
    assert client.post("/v1/pings/missing/snooze").status_code == 404
    assert client.delete("/v1/pings/missing").status_code == 404


def test_patch_updates_only_given_fields(client) -> None:
    ping = _ping(client, priority="low")
    updated = client.patch(f"/v1/pings/{ping['id']}", json={"text": "New text"})
    assert updated.status_code == 200
    body = updated.json()
    assert body["text"] == "New text"
    assert body["priority"] == "low"


def test_delete_removes_the_ping(client) -> None:
    ping = _ping(client)
    assert client.delete(f"/v1/pings/{ping['id']}").status_code == 204
    assert client.get("/v1/pings").json()["pings"] == []


# -- upcoming filter -------------------------------------------------------------


def test_upcoming_query_param_excludes_completed(client) -> None:
    done = _ping(client, text="done")
    client.post(f"/v1/pings/{done['id']}/complete")
    open_ping = _ping(client, text="open")

    upcoming = client.get("/v1/pings?upcoming=true").json()["pings"]

    assert [p["id"] for p in upcoming] == [open_ping["id"]]


# -- complete / recurrence -------------------------------------------------------


def test_completing_a_one_off_ping_marks_it_completed(client) -> None:
    ping = _ping(client, repeat_type="none")
    completed = client.post(f"/v1/pings/{ping['id']}/complete").json()
    assert completed["completed"] is True
    assert completed["completed_at"]


def test_completing_a_weekly_ping_advances_instead_of_completing(client) -> None:
    ping = _ping(client, date="2026-10-10", repeat_type="weekly")
    advanced = client.post(f"/v1/pings/{ping['id']}/complete").json()
    assert advanced["completed"] is False
    assert advanced["date"] == "2026-10-17"
    assert advanced["id"] == ping["id"]


def test_completing_a_monthly_ping_keeps_day_of_month(client) -> None:
    ping = _ping(client, date="2026-01-31", repeat_type="monthly")
    advanced = client.post(f"/v1/pings/{ping['id']}/complete").json()
    assert advanced["date"] == "2026-02-28"


def test_completing_a_weekly_ping_advances_within_the_same_week_for_multiple_days(client) -> None:
    # 2026-10-05 is a Monday; Mon/Wed/Fri selected, completing Monday should
    # land on Wednesday the same week.
    ping = _ping(client, date="2026-10-05", repeat_type="weekly", repeat_days_of_week=[0, 2, 4])
    advanced = client.post(f"/v1/pings/{ping['id']}/complete").json()
    assert advanced["date"] == "2026-10-07"


# -- snooze ----------------------------------------------------------------------


def test_snooze_defaults_to_one_hour(client) -> None:
    ping = _ping(client, date="2026-10-10", time="09:00")
    snoozed = client.post(f"/v1/pings/{ping['id']}/snooze").json()
    assert snoozed["date"] == "2026-10-10"
    assert snoozed["time"] == "10:00"


def test_snooze_accepts_a_custom_amount(client) -> None:
    ping = _ping(client, date="2026-10-10", time="09:00")
    snoozed = client.post(
        f"/v1/pings/{ping['id']}/snooze", json={"minutes": 30}
    ).json()
    assert snoozed["time"] == "09:30"


# -- settings ----------------------------------------------------------------------


def test_settings_defaults(client) -> None:
    settings = client.get("/v1/pings/settings").json()
    assert settings == {
        "notifications_enabled": True,
        "in_app_enabled": True,
        "browser_enabled": False,
        "default_lead_minutes": 0,
        "tasks_reminders_enabled": False,
        "tasks_lead_minutes": 15,
        "finances_reminders_enabled": False,
        "finances_lead_days": 3,
    }


def test_settings_can_be_changed_and_partial_updates_keep_the_rest(client) -> None:
    client.put("/v1/pings/settings", json={"browser_enabled": True})
    changed = client.put("/v1/pings/settings", json={"default_lead_minutes": 15})
    assert changed.json()["browser_enabled"] is True
    assert changed.json()["default_lead_minutes"] == 15


def test_invalid_settings_are_a_422_and_change_nothing(client) -> None:
    bad = client.put("/v1/pings/settings", json={"default_lead_minutes": -1})
    assert bad.status_code == 422
    assert client.get("/v1/pings/settings").json()["default_lead_minutes"] == 0


def test_unknown_setting_is_rejected(client) -> None:
    bad = client.put("/v1/pings/settings", json={"telegram_enabled": True})
    assert bad.status_code == 422
