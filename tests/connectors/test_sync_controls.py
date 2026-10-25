"""Sync settings, the background loop that obeys them, and "Sync now" for all."""

from __future__ import annotations

import json
from datetime import datetime
import threading
import time
from typing import List

import pytest

from phibe.connectors.autosync import start_auto_sync, start_source_sync
from phibe.connectors.sync_settings import (
    SyncSettings,
    SyncSettingsError,
    load_sync_settings,
    save_sync_settings,
    validate,
)

# -- settings ------------------------------------------------------------------


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path))
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


def test_a_field_from_an_older_version_is_dropped_not_treated_as_corrupt(home) -> None:
    """Renaming a setting must never look like a broken file and wipe the rest."""
    (home / "sync_settings.json").write_text(
        '{"auto_enabled": false, "interval_minutes": 30, "sync_when_phibe_starts": true}',
        encoding="utf-8",
    )

    loaded = load_sync_settings()

    assert loaded.auto_enabled is False
    assert loaded.interval_minutes == 30


@pytest.mark.parametrize(
    "bad",
    [
        {"interval_minutes": -1},
        {"interval_minutes": 5000},
        {"interval_minutes": 1.5},
        {"interval_minutes": True},
        {"auto_enabled": "yes"},
        {"disabled_connectors": "anytype"},
        {"colour": "red"},
        {"daily_time": "25:00"},
        {"daily_time": "3:00"},
        {"daily_time": "03:60"},
        {"daily_time": 300},
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

    from phibe.server.app import create_app

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
        from phibe.connectors._stubs import SyncStatus

        return SyncStatus()

    def sync(self, **kwargs):
        from phibe.connectors._stubs import Document

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

    from phibe.core.registry import ConnectorRegistry
    from phibe.server import connectors_router
    from phibe.server.connectors_router import create_connectors_router

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
    from phibe.connectors.sync_settings import settings_path

    return settings_path().read_text(encoding="utf-8")


def test_invalid_settings_are_a_422_and_change_nothing(api) -> None:
    client, _, _ = api

    bad = client.put("/v1/connectors/sync-settings", json={"interval_minutes": -1})

    assert bad.status_code == 422
    assert client.get("/v1/connectors/sync-settings").json()["interval_minutes"] == 15


def test_interval_zero_means_only_when_phibe_starts(api) -> None:
    client, _, _ = api

    changed = client.put("/v1/connectors/sync-settings", json={"interval_minutes": 0})

    assert changed.status_code == 200
    assert changed.json()["interval_minutes"] == 0


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


# -- once a day, at a chosen time ------------------------------------------------


class DailyHarness:
    """The loop with a hand-moved wall clock, to test "once a day at HH:MM"."""

    def __init__(self, start: datetime, **settings) -> None:
        self.wall = start
        self.settings = SyncSettings(**settings)
        self.runs: List[datetime] = []
        self.thread, self.stop = start_auto_sync(
            lambda: self.runs.append(self.wall),
            get_settings=lambda: self.settings,
            wall_clock=lambda: self.wall,
            first_delay=10_000,  # never reached: these tests use on_start=False
            tick=0.002,
        )

    def at(self, moment: datetime) -> None:
        self.wall = moment
        time.sleep(0.05)

    def close(self) -> None:
        self.stop.set()
        self.thread.join(timeout=2)


@pytest.fixture
def daily():
    made: List[DailyHarness] = []

    def make(start, **settings) -> DailyHarness:
        made.append(DailyHarness(start, **settings))
        return made[-1]

    yield make
    for item in made:
        item.close()


def test_daily_sync_waits_for_the_chosen_time_then_runs_once(daily) -> None:
    h = daily(datetime(2026, 10, 1, 8, 0), interval_minutes=1440, on_start=False, daily_time="21:30")

    h.at(datetime(2026, 10, 1, 21, 29))
    assert h.runs == []
    h.at(datetime(2026, 10, 1, 21, 30))
    assert len(h.runs) == 1
    h.at(datetime(2026, 10, 1, 23, 59))  # same day: no second run
    assert len(h.runs) == 1
    h.at(datetime(2026, 10, 2, 21, 29))
    assert len(h.runs) == 1
    h.at(datetime(2026, 10, 2, 21, 31))  # next day
    assert len(h.runs) == 2


def test_daily_sync_missed_while_off_runs_when_phibe_opens_later_that_day(daily) -> None:
    h = daily(datetime(2026, 10, 1, 8, 0), interval_minutes=1440, on_start=False, daily_time="03:00")
    # started at 08:00 after 03:00 already passed: today counts as done, tomorrow it runs
    assert h.runs == []
    h.at(datetime(2026, 10, 2, 3, 5))
    assert len(h.runs) == 1


def test_daily_time_is_ignored_for_other_intervals(daily) -> None:
    h = daily(datetime(2026, 10, 1, 8, 0), interval_minutes=30, on_start=False, daily_time="08:00")
    h.at(datetime(2026, 10, 1, 9, 0))  # wall clock moves, but the 30-minute timer is monotonic
    assert h.runs == []


# -- once, only when Phibe starts -------------------------------------------------


def test_only_on_start_runs_exactly_once_then_stops(loop) -> None:
    h = loop(interval_minutes=0, on_start=False)

    h.advance(19)
    assert h.runs == []
    h.advance(2)  # past first_delay (20)
    assert len(h.runs) == 1
    h.advance(1000)  # no periodic timer: it never runs again on its own
    assert len(h.runs) == 1


def test_only_on_start_does_not_repeat_just_from_toggling_the_switch(loop) -> None:
    """"Only when Phibe starts" means the process start, not flipping the switch."""
    h = loop(interval_minutes=0)
    h.advance(21)
    assert len(h.runs) == 1

    h.settings = SyncSettings(auto_enabled=False, interval_minutes=0)
    h.advance(5)
    h.settings = SyncSettings(auto_enabled=True, interval_minutes=0)
    h.advance(1000)
    assert len(h.runs) == 1


# -- a source with a rhythm of its own -------------------------------------------


def test_a_source_can_have_its_own_interval_and_a_bad_one_is_refused(home) -> None:
    ok = validate({"intervals": {"gmail": 60, "anytype": 1440}})
    assert ok.intervals == {"anytype": 1440, "gmail": 60}
    save_sync_settings(ok)
    assert load_sync_settings().intervals == {"anytype": 1440, "gmail": 60}
    for bad in ({"gmail": -1}, {"gmail": 1441}, {"gmail": True}, {"gmail": "60"}, ["gmail"]):
        with pytest.raises(SyncSettingsError):
            validate({"intervals": bad})


def test_sources_with_their_own_interval_run_on_it_and_wait_when_switched_off() -> None:
    ran: List[str] = []
    settings = SyncSettings(True, 15, False, [], "03:00", {"gmail": 2})
    stop = threading.Event()
    thread, _ = start_source_sync(
        ran.append,
        get_settings=lambda: settings,
        tick=0.01,
        seconds_per_minute=0.05,
        stop=stop,
    )
    try:
        deadline = time.time() + 3
        while len(ran) < 2 and time.time() < deadline:
            time.sleep(0.02)
        assert ran[:2] == ["gmail", "gmail"]  # armed first, then on its interval
        settings.auto_enabled = False
        time.sleep(0.2)
        settled = len(ran)
        time.sleep(0.3)
        assert len(ran) == settled  # nothing runs while automatic sync is off
    finally:
        stop.set()
        thread.join(timeout=2)


def _run_source_loop(settings: SyncSettings, wall: List[datetime], seconds: float) -> List[str]:
    ran: List[str] = []
    stop = threading.Event()
    thread, _ = start_source_sync(
        ran.append,
        get_settings=lambda: settings,
        first_delay=0.05,
        tick=0.01,
        wall_clock=lambda: wall[0],
        stop=stop,
    )
    try:
        time.sleep(seconds)
    finally:
        stop.set()
        thread.join(timeout=2)
    return ran


def test_a_source_set_to_only_on_start_runs_once(home) -> None:
    settings = SyncSettings(True, 15, False, [], "03:00", {"gmail": 0})
    ran = _run_source_loop(settings, [datetime(2026, 1, 1, 12, 0)], 0.4)
    assert ran == ["gmail"]  # once, and not again


def test_a_source_set_to_once_a_day_runs_at_its_own_time(home) -> None:
    wall = [datetime(2026, 1, 1, 8, 0)]
    settings = SyncSettings(True, 15, False, [], "03:00", {"gmail": 1440}, {"gmail": "09:30"})
    stop = threading.Event()
    ran: List[str] = []
    thread, _ = start_source_sync(
        ran.append, get_settings=lambda: settings, first_delay=0.05, tick=0.01,
        wall_clock=lambda: wall[0], stop=stop,
    )
    try:
        time.sleep(0.2)
        assert ran == []  # before 09:30
        wall[0] = datetime(2026, 1, 1, 9, 31)
        time.sleep(0.2)
        assert ran == ["gmail"]
        time.sleep(0.2)
        assert ran == ["gmail"]  # once that day
        wall[0] = datetime(2026, 1, 2, 9, 31)
        time.sleep(0.2)
        assert ran == ["gmail", "gmail"]
    finally:
        stop.set()
        thread.join(timeout=2)


def test_daily_times_and_zero_interval_are_validated(home) -> None:
    ok = validate({"intervals": {"gmail": 0}, "daily_times": {"gmail": "09:30"}})
    assert ok.intervals == {"gmail": 0} and ok.daily_times == {"gmail": "09:30"}
    for bad in ({"gmail": "9:30"}, {"gmail": 5}, ["x"]):
        with pytest.raises(SyncSettingsError):
            validate({"daily_times": bad})
