"""Sync settings, the background loop that obeys them, and "Sync now" for all."""

from __future__ import annotations

import json
import threading
import time
from typing import List

import pytest

from nova.connectors.autosync import start_auto_sync
from nova.connectors.sync_settings import (
    SyncSettings,
    SyncSettingsError,
    load_sync_settings,
    save_sync_settings,
    validate,
)

# -- settings ------------------------------------------------------------------


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("NOVA_HOME", str(tmp_path))
    return tmp_path


def test_defaults_sync_everything_every_15_minutes_and_at_start(home) -> None:
    settings = load_sync_settings()

    assert settings == SyncSettings(True, 15, True, [])


def test_settings_survive_a_restart(home) -> None:
    save_sync_settings(SyncSettings(False, 60, False, ["gmail", "anytype"]))

    loaded = load_sync_settings()

    assert (loaded.auto_enabled, loaded.interval_minutes, loaded.on_start) == (
        False,
        60,
        False,
    )
    assert loaded.disabled_connectors == ["anytype", "gmail"]
    assert not list(home.glob("*.tmp"))


def test_a_broken_settings_file_falls_back_to_defaults(home) -> None:
    (home / "sync_settings.json").write_text("{not json", encoding="utf-8")

    assert load_sync_settings() == SyncSettings()


@pytest.mark.parametrize(
    "bad",
    [
        {"interval_minutes": 0},
        {"interval_minutes": 5000},
        {"interval_minutes": 1.5},
        {"interval_minutes": True},
        {"auto_enabled": "yes"},
        {"disabled_connectors": "anytype"},
        {"colour": "red"},
    ],
)
def test_invalid_settings_are_refused(bad) -> None:
    with pytest.raises(SyncSettingsError):
        validate(bad)


# -- the loop --------------------------------------------------------------------


class Harness:
    """Runs the loop with a hand-moved clock and settings."""

    def __init__(self, **settings) -> None:
        self.now = 0.0
        self.settings = SyncSettings(**settings)
        self.runs: List[float] = []
        self.thread, self.stop = start_auto_sync(
            lambda: self.runs.append(self.now),
            get_settings=lambda: self.settings,
            clock=lambda: self.now,
            first_delay=20,
            tick=0.002,
            seconds_per_minute=1,  # one "minute" is one fake second
        )

    def advance(self, seconds: float) -> None:
        self.now += seconds
        time.sleep(0.05)  # a few ticks

    def close(self) -> None:
        self.stop.set()
        self.thread.join(timeout=2)


@pytest.fixture
def loop():
    made: List[Harness] = []

    def make(**settings) -> Harness:
        made.append(Harness(**settings))
        return made[-1]

    yield make
    for item in made:
        item.close()


def test_first_run_comes_shortly_after_start_then_every_interval(loop) -> None:
    h = loop(interval_minutes=15)

    h.advance(10)
    assert h.runs == []
    h.advance(11)  # 21s: past the first delay
    assert len(h.runs) == 1
    h.advance(14)
    assert len(h.runs) == 1
    h.advance(2)  # 15s+ since the last run
    assert len(h.runs) == 2


def test_without_on_start_the_first_run_waits_a_whole_interval(loop) -> None:
    h = loop(interval_minutes=60, on_start=False)

    h.advance(30)
    assert h.runs == []
    h.advance(31)
    assert len(h.runs) == 1


def test_nothing_runs_while_automatic_sync_is_off(loop) -> None:
    h = loop(auto_enabled=False, interval_minutes=1)

    h.advance(500)

    assert h.runs == []


def test_switching_back_on_waits_a_full_interval(loop) -> None:
    h = loop(auto_enabled=False, interval_minutes=30)
    h.advance(500)

    h.settings = SyncSettings(auto_enabled=True, interval_minutes=30)
    h.advance(1)
    assert h.runs == []
    h.advance(31)
    assert len(h.runs) == 1


def test_a_new_interval_applies_without_a_restart(loop) -> None:
    h = loop(interval_minutes=1000)
    h.advance(25)
    assert len(h.runs) == 1  # the first run, on_start

    h.settings = SyncSettings(interval_minutes=10)
    h.advance(11)

    assert len(h.runs) == 2


def test_a_failing_run_does_not_stop_the_loop() -> None:
    calls: List[int] = []
    done = threading.Event()

    def flaky() -> None:
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("Anytype is closed")
        done.set()

    thread, stop = start_auto_sync(
        flaky,
        get_settings=lambda: SyncSettings(interval_minutes=1),
        first_delay=0,
        tick=0.002,
        seconds_per_minute=0.005,
    )
    assert done.wait(timeout=2)
    stop.set()
    thread.join(timeout=2)


def test_the_real_app_starts_and_stops_the_loop(home) -> None:
    from types import SimpleNamespace

    from fastapi.testclient import TestClient

    from nova.server.app import create_app

    app = create_app(SimpleNamespace(engine_id="fake", health=lambda: True), "fake")

    with TestClient(app):
        assert app.state.auto_sync_stop is not None
        assert not app.state.auto_sync_stop.is_set()

    assert app.state.auto_sync_stop.is_set()


# -- the API -------------------------------------------------------------------------


class FakeSource:
    """A connected connector that indexes one note when synced."""

    indexed_sources = ("obsidian",)
    connector_id = "obsidian"
    display_name = "Fake source"
    auth_type = "filesystem"
    replaces_existing = False

    def __init__(self, connected: bool = True) -> None:
        self.connected = connected
        self.synced = threading.Event()

    def is_connected(self) -> bool:
        return self.connected

    def disconnect(self) -> None:
        self.connected = False

    def sync_status(self):
        from nova.connectors._stubs import SyncStatus

        return SyncStatus()

    def sync(self, **kwargs):
        from nova.connectors._stubs import Document

        self.synced.set()
        yield Document(
            doc_id="obsidian:one",
            source="obsidian",
            doc_type="note",
            title="One",
            content="a note about weekly reviews",
        )


@pytest.fixture
def api(home, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from nova.core.registry import ConnectorRegistry
    from nova.server import connectors_router
    from nova.server.connectors_router import create_connectors_router

    router = create_connectors_router()
    app = FastAPI()
    app.include_router(router)
    # Only the fake source takes part, so no real service is ever contacted.
    monkeypatch.setattr(
        ConnectorRegistry, "keys", classmethod(lambda cls: ["obsidian"])
    )
    monkeypatch.setattr(
        ConnectorRegistry, "contains", classmethod(lambda cls, key: key == "obsidian")
    )
    source = FakeSource()
    connectors_router._instances["obsidian"] = source
    yield TestClient(app), router, source
    connectors_router._instances.pop("obsidian", None)


def _wait_until_idle(client) -> dict:
    for _ in range(100):
        data = client.get("/v1/connectors/sync-status").json()
        if not data["syncing"]:
            return data
        time.sleep(0.05)
    raise AssertionError("sync never finished")


def test_settings_endpoints_read_and_change_them(api) -> None:
    client, _, _ = api

    assert client.get("/v1/connectors/sync-settings").json()["interval_minutes"] == 15
    changed = client.put("/v1/connectors/sync-settings", json={"interval_minutes": 60})
    assert changed.json()["interval_minutes"] == 60
    assert changed.json()["auto_enabled"] is True  # untouched
    assert json.loads(open_settings()) == changed.json()


def open_settings() -> str:
    from nova.connectors.sync_settings import settings_path

    return settings_path().read_text(encoding="utf-8")


def test_invalid_settings_are_a_422_and_change_nothing(api) -> None:
    client, _, _ = api

    bad = client.put("/v1/connectors/sync-settings", json={"interval_minutes": 0})

    assert bad.status_code == 422
    assert client.get("/v1/connectors/sync-settings").json()["interval_minutes"] == 15


def test_sync_all_starts_every_connected_source(api) -> None:
    client, _, source = api

    result = client.post("/v1/connectors/sync-all").json()

    assert result == {"started": ["obsidian"], "already_syncing": [], "failed": {}}
    assert source.synced.wait(timeout=5)
    status = _wait_until_idle(client)
    assert [c["connector_id"] for c in status["connectors"]] == ["obsidian"]
    assert status["connectors"][0]["display_name"] == "Fake source"
    assert status["connectors"][0]["state"] in ("idle", "complete"), status[
        "connectors"
    ][0]["error"]
    assert status["connectors"][0]["last_sync"]


def test_sources_that_are_not_connected_are_left_alone(api) -> None:
    client, _, source = api
    source.connected = False

    result = client.post("/v1/connectors/sync-all").json()

    assert result["started"] == []
    assert client.get("/v1/connectors/sync-status").json()["connectors"] == []


def test_the_status_says_which_sources_sync_automatically(api) -> None:
    client, _, _ = api
    client.put(
        "/v1/connectors/sync-settings", json={"disabled_connectors": ["obsidian"]}
    )

    row = client.get("/v1/connectors/sync-status").json()["connectors"][0]

    assert row["auto"] is False


def test_automatic_sync_skips_sources_switched_off(api) -> None:
    client, router, source = api
    client.put(
        "/v1/connectors/sync-settings", json={"disabled_connectors": ["obsidian"]}
    )

    router.run_auto_sync()
    time.sleep(0.3)
    assert not source.synced.is_set()

    client.put("/v1/connectors/sync-settings", json={"disabled_connectors": []})
    router.run_auto_sync()
    assert source.synced.wait(timeout=5)


def test_the_fixed_names_are_not_swallowed_by_the_connector_id_routes(api) -> None:
    client, _, _ = api

    assert client.get("/v1/connectors/sync-status").status_code == 200
    assert client.get("/v1/connectors/sync-settings").status_code == 200
