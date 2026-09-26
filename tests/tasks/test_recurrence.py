"""Repeat rules (Google-Calendar style)."""

from __future__ import annotations

from datetime import date, datetime

import pytest

from nova.tasks.recurrence import next_due, validate_rule


def test_every_2_weeks_on_wednesday() -> None:
    rule = {"freq": "weekly", "interval": 2, "weekdays": [2]}
    first = date(2026, 10, 7)  # a Wednesday
    assert first.weekday() == 2
    second = next_due(first, rule)
    assert second == date(2026, 10, 21)
    assert next_due(second, rule) == date(2026, 11, 4)


def test_weekly_with_several_weekdays_walks_through_the_week() -> None:
    rule = {"freq": "weekly", "weekdays": [0, 2, 4]}  # Mon, Wed, Fri
    assert next_due(date(2026, 10, 5), rule) == date(2026, 10, 7)  # Mon -> Wed
    assert next_due(date(2026, 10, 7), rule) == date(2026, 10, 9)  # Wed -> Fri
    assert next_due(date(2026, 10, 9), rule) == date(2026, 10, 12)  # Fri -> Mon


def test_weekly_without_weekdays_uses_the_due_day() -> None:
    assert next_due(date(2026, 10, 7), {"freq": "weekly"}) == date(2026, 10, 14)


def test_daily_keeps_the_time_of_day() -> None:
    due = datetime(2026, 10, 7, 14, 30)
    assert next_due(due, {"freq": "daily", "interval": 3}) == datetime(
        2026, 10, 10, 14, 30
    )


def test_monthly_clamps_to_the_last_day_and_returns_to_the_anchor() -> None:
    rule = {"freq": "monthly"}
    feb = next_due(date(2026, 1, 31), rule, anchor_day=31)
    assert feb == date(2026, 2, 28)
    assert next_due(feb, rule, anchor_day=31) == date(2026, 3, 31)


def test_yearly_handles_leap_day() -> None:
    assert next_due(date(2028, 2, 29), {"freq": "yearly"}) == date(2029, 2, 28)


def test_until_ends_the_series() -> None:
    rule = {"freq": "daily", "until": "2026-10-08"}
    assert next_due(date(2026, 10, 7), rule) == date(2026, 10, 8)
    assert next_due(date(2026, 10, 8), rule) is None


def test_count_ends_the_series() -> None:
    rule = {"freq": "daily", "count": 3}
    assert next_due(date(2026, 10, 7), rule, occurrences_so_far=2) is not None
    assert next_due(date(2026, 10, 7), rule, occurrences_so_far=3) is None


@pytest.mark.parametrize(
    "rule",
    [
        {"freq": "hourly"},
        {"freq": "daily", "interval": 0},
        {"freq": "daily", "weekdays": [1]},
        {"freq": "weekly", "weekdays": [7]},
        {"freq": "daily", "until": "soon"},
        {"freq": "daily", "count": 0},
    ],
)
def test_invalid_rules_are_rejected(rule: dict) -> None:
    with pytest.raises(ValueError):
        validate_rule(rule)


def test_valid_rule_is_cleaned() -> None:
    clean = validate_rule(
        {"freq": "weekly", "weekdays": [4, 2, 2], "until": "2026-12-31"}
    )
    assert clean == {
        "freq": "weekly",
        "interval": 1,
        "weekdays": [2, 4],
        "until": "2026-12-31",
    }
