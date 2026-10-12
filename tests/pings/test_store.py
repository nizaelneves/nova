"""Pings storage: create/list/update/complete/snooze/delete and recurrence."""

from __future__ import annotations

import sqlite3
from datetime import datetime

import pytest

from phibe.pings.store import NotFound, PingError, PingStore, next_occurrence
from datetime import date

NOW = datetime(2026, 10, 7, 12, 0)  # Wednesday


@pytest.fixture
def store(tmp_path):
    s = PingStore(tmp_path / "pings.db", now=lambda: NOW)
    yield s
    s.close()


def _add(store: PingStore, text="Water the plants", d="2026-10-10", t="09:00", **kw):
    return store.create_ping(text=text, date=d, time=t, **kw)


def test_create_uses_sensible_defaults(store) -> None:
    ping = _add(store)
    assert ping["priority"] == "medium"
    assert ping["repeat_type"] == "none"
    assert ping["repeat_interval"] == 1
    assert ping["repeat_days_of_week"] == []
    assert ping["completed"] is False
    assert ping["created_at"]
    assert ping["completed_at"] is None
    assert ping["id"]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"text": "  "},
        {"text": "x" * 501},
        {"d": "10-10-2026"},
        {"d": "not-a-date"},
        {"t": "9:00"},
        {"t": "25:00"},
        {"priority": "urgent"},
        {"repeat_type": "daily"},
        {"repeat_interval": 0},
        {"repeat_interval": -1},
        {"repeat_days_of_week": [7]},
        {"repeat_days_of_week": ["mon"]},
    ],
)
def test_bad_input_is_rejected(store, kwargs) -> None:
    text = kwargs.pop("text", "Water the plants")
    d = kwargs.pop("d", "2026-10-10")
    t = kwargs.pop("t", "09:00")
    with pytest.raises(PingError):
        store.create_ping(text=text, date=d, time=t, **kwargs)


def test_get_and_delete(store) -> None:
    ping = _add(store)
    assert store.get_ping(ping["id"])["id"] == ping["id"]
    store.delete_ping(ping["id"])
    with pytest.raises(NotFound):
        store.get_ping(ping["id"])


def test_missing_ping_raises_not_found(store) -> None:
    with pytest.raises(NotFound):
        store.get_ping("nope")
    with pytest.raises(NotFound):
        store.update_ping("nope", text="x")
    with pytest.raises(NotFound):
        store.delete_ping("nope")
    with pytest.raises(NotFound):
        store.complete_ping("nope")
    with pytest.raises(NotFound):
        store.snooze_ping("nope")


def test_update_only_touches_given_fields(store) -> None:
    ping = _add(store, priority="low")
    updated = store.update_ping(ping["id"], text="Water the ferns")
    assert updated["text"] == "Water the ferns"
    assert updated["priority"] == "low"
    assert updated["date"] == ping["date"]


def test_update_rejects_unknown_field(store) -> None:
    ping = _add(store)
    with pytest.raises(PingError):
        store.update_ping(ping["id"], nope="x")


def test_list_orders_by_due_soonest_first(store) -> None:
    later = _add(store, text="later", d="2026-10-12", t="08:00")
    sooner = _add(store, text="sooner", d="2026-10-08", t="08:00")
    ids = [p["id"] for p in store.list_pings()]
    assert ids == [sooner["id"], later["id"]]


def test_upcoming_excludes_completed(store) -> None:
    one_off = _add(store, text="one-off")
    store.complete_ping(one_off["id"])
    still_open = _add(store, text="open")

    all_pings = store.list_pings()
    upcoming = store.list_pings(upcoming=True)

    assert {p["id"] for p in all_pings} == {one_off["id"], still_open["id"]}
    assert {p["id"] for p in upcoming} == {still_open["id"]}


def test_completing_a_one_off_ping_stays_completed_for_history(store) -> None:
    ping = _add(store, repeat_type="none")
    completed = store.complete_ping(ping["id"])
    assert completed["completed"] is True
    assert completed["completed_at"]
    assert completed["date"] == ping["date"]  # unchanged


def test_completing_a_weekly_ping_advances_to_next_week_and_reopens(store) -> None:
    # No days_of_week selected: falls back to the ping's own weekday.
    ping = _add(store, d="2026-10-10", repeat_type="weekly")
    advanced = store.complete_ping(ping["id"])
    assert advanced["completed"] is False
    assert advanced["completed_at"] is None
    assert advanced["date"] == "2026-10-17"
    assert advanced["id"] == ping["id"]  # same row, not a new one


def test_completing_a_monthly_ping_advances_to_next_month_same_day(store) -> None:
    ping = _add(store, d="2026-01-31", repeat_type="monthly")
    advanced = store.complete_ping(ping["id"])
    # Shorter month: last day of Feb, not a rollover to March.
    assert advanced["date"] == "2026-02-28"


def test_completing_a_monthly_ping_advances_by_the_chosen_interval(store) -> None:
    ping = _add(store, d="2026-01-31", repeat_type="monthly", repeat_interval=3)
    advanced = store.complete_ping(ping["id"])
    assert advanced["date"] == "2026-04-30"


# -- weekly recurrence on specific weekdays ---------------------------------
#
# 0=Mon..6=Sun. In this test file's fixed calendar, 2026-10-05 is a Monday,
# 2026-10-09 is a Friday and 2026-10-10 is a Saturday.


def test_weekly_single_day_interval_one_is_a_plain_weekly_repeat(store) -> None:
    # Same behavior as the original simple "every Saturday" case.
    ping = _add(store, d="2026-10-10", repeat_type="weekly", repeat_days_of_week=[5])
    advanced = store.complete_ping(ping["id"])
    assert advanced["date"] == "2026-10-17"


def test_weekly_multiple_days_advances_within_the_same_week(store) -> None:
    # Mon/Wed/Fri; completing Monday should land on Wednesday, same week.
    ping = _add(store, d="2026-10-05", repeat_type="weekly", repeat_days_of_week=[0, 2, 4])
    advanced = store.complete_ping(ping["id"])
    assert advanced["date"] == "2026-10-07"  # Wednesday


def test_weekly_multiple_days_wraps_to_the_first_day_next_cycle(store) -> None:
    # Mon/Wed/Fri; completing Friday (the last selected day of the week)
    # wraps to Monday, one interval later.
    ping = _add(store, d="2026-10-09", repeat_type="weekly", repeat_days_of_week=[0, 2, 4])
    advanced = store.complete_ping(ping["id"])
    assert advanced["date"] == "2026-10-12"  # Monday


def test_weekly_multiple_days_wraps_by_the_chosen_interval(store) -> None:
    # Same Mon/Wed/Fri set but every 2 weeks: wrapping from Friday skips a
    # full extra week before landing back on Monday.
    ping = _add(
        store, d="2026-10-09", repeat_type="weekly", repeat_interval=2,
        repeat_days_of_week=[0, 2, 4],
    )
    advanced = store.complete_ping(ping["id"])
    assert advanced["date"] == "2026-10-19"  # Monday, one week further out


def test_weekly_empty_days_falls_back_to_the_original_weekday(store) -> None:
    # Toggled weekly but picked no specific days: repeats on the ping's own
    # weekday (Saturday) every N weeks instead of being left undefined.
    ping = _add(
        store, d="2026-10-10", repeat_type="weekly", repeat_interval=2,
        repeat_days_of_week=[],
    )
    advanced = store.complete_ping(ping["id"])
    assert advanced["date"] == "2026-10-24"


def test_next_occurrence_helper_weekly_and_monthly() -> None:
    assert next_occurrence(date(2026, 10, 10), "weekly") == date(2026, 10, 17)
    assert next_occurrence(date(2026, 1, 31), "monthly") == date(2026, 2, 28)
    assert next_occurrence(date(2026, 3, 15), "monthly") == date(2026, 4, 15)
    with pytest.raises(PingError):
        next_occurrence(date(2026, 1, 1), "none")


def test_migration_adds_new_columns_to_an_old_schema_db(tmp_path) -> None:
    """A pre-existing db (from before repeat_type/interval/days) opens fine
    and its old rows keep their repeat value under the new column name."""
    db_path = tmp_path / "old.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE pings (
            id           TEXT PRIMARY KEY,
            text         TEXT NOT NULL,
            date         TEXT NOT NULL,
            time         TEXT NOT NULL,
            priority     TEXT NOT NULL DEFAULT 'medium',
            repeat       TEXT NOT NULL DEFAULT 'none',
            completed    INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL,
            completed_at TEXT
        );
        """
    )
    conn.execute(
        "INSERT INTO pings (id, text, date, time, priority, repeat, completed,"
        " created_at, completed_at) VALUES ('abc123', 'Old ping', '2026-10-10',"
        " '09:00', 'high', 'weekly', 0, '2026-10-01T00:00:00', NULL)"
    )
    conn.commit()
    conn.close()

    store = PingStore(db_path, now=lambda: NOW)
    try:
        ping = store.get_ping("abc123")
        assert ping["repeat_type"] == "weekly"
        assert ping["repeat_interval"] == 1
        assert ping["repeat_days_of_week"] == []
        assert ping["priority"] == "high"
    finally:
        store.close()


def test_snooze_pushes_date_and_time_forward_by_default_one_hour(store) -> None:
    ping = _add(store, d="2026-10-10", t="09:00")
    snoozed = store.snooze_ping(ping["id"])
    assert snoozed["date"] == "2026-10-10"
    assert snoozed["time"] == "10:00"


def test_snooze_can_cross_into_the_next_day(store) -> None:
    ping = _add(store, d="2026-10-10", t="23:30")
    snoozed = store.snooze_ping(ping["id"], minutes=60)
    assert snoozed["date"] == "2026-10-11"
    assert snoozed["time"] == "00:30"


def test_snooze_rejects_non_positive_minutes(store) -> None:
    ping = _add(store)
    with pytest.raises(PingError):
        store.snooze_ping(ping["id"], minutes=0)
    with pytest.raises(PingError):
        store.snooze_ping(ping["id"], minutes=-5)
