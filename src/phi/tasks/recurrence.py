"""Repeat rules for tasks, in the style of Google Calendar.

A rule is a small dict, for example "every 2 weeks on Wednesday"::

    {"freq": "weekly", "interval": 2, "weekdays": [2]}

Keys:

* ``freq``      — ``daily``, ``weekly``, ``monthly`` or ``yearly``
* ``interval``  — repeat every N units (default 1)
* ``weekdays``  — weekly only; 0 = Monday ... 6 = Sunday (default: the due day)
* ``until``     — optional last date (``YYYY-MM-DD``), inclusive
* ``count``     — optional total number of occurrences, first one included

Monthly and yearly rules keep the day of the month of the first due date; on
shorter months the last day is used (31 Jan -> 28 Feb -> 31 Mar).
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional

FREQUENCIES = ("daily", "weekly", "monthly", "yearly")


def validate_rule(rule: Dict[str, Any]) -> Dict[str, Any]:
    """Return a cleaned copy of *rule*, or raise ``ValueError``."""
    freq = rule.get("freq")
    if freq not in FREQUENCIES:
        raise ValueError(f"freq must be one of {', '.join(FREQUENCIES)}")
    interval = rule.get("interval", 1)
    if not isinstance(interval, int) or isinstance(interval, bool) or interval < 1:
        raise ValueError("interval must be a whole number of 1 or more")
    clean: Dict[str, Any] = {"freq": freq, "interval": interval}
    weekdays = rule.get("weekdays")
    if weekdays:
        if freq != "weekly":
            raise ValueError("weekdays only applies to weekly rules")
        if not all(isinstance(d, int) and 0 <= d <= 6 for d in weekdays):
            raise ValueError("weekdays must be numbers from 0 (Mon) to 6 (Sun)")
        clean["weekdays"] = sorted(set(weekdays))
    if rule.get("until"):
        try:
            clean["until"] = date.fromisoformat(str(rule["until"])[:10]).isoformat()
        except ValueError as exc:
            raise ValueError("until must be a date like 2026-12-31") from exc
    if rule.get("count") is not None:
        count = rule["count"]
        if not isinstance(count, int) or isinstance(count, bool) or count < 1:
            raise ValueError("count must be a whole number of 1 or more")
        clean["count"] = count
    return clean


def _add_months(day: date, months: int, anchor_day: int) -> date:
    index = day.year * 12 + (day.month - 1) + months
    year, month = divmod(index, 12)
    month += 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(anchor_day, last))


def _next_date(current: date, rule: Dict[str, Any], anchor_day: int) -> date:
    freq = rule["freq"]
    interval = rule.get("interval", 1)
    if freq == "daily":
        return current + timedelta(days=interval)
    if freq == "weekly":
        weekdays = rule.get("weekdays") or [current.weekday()]
        # Later day in the same week?
        later = [d for d in weekdays if d > current.weekday()]
        if later:
            return current + timedelta(days=later[0] - current.weekday())
        # Otherwise the first listed day, `interval` weeks after this week.
        monday = current - timedelta(days=current.weekday())
        return monday + timedelta(weeks=interval, days=weekdays[0])
    if freq == "monthly":
        return _add_months(current, interval, anchor_day)
    return _add_months(current, 12 * interval, anchor_day)


def next_due(
    due: datetime | date,
    rule: Dict[str, Any],
    *,
    occurrences_so_far: int = 1,
    anchor_day: Optional[int] = None,
) -> Optional[datetime | date]:
    """Return the due date after *due*, or ``None`` when the series is over.

    *occurrences_so_far* counts the occurrences already created, *due* included,
    so a rule with ``count=3`` stops after the third one. A ``datetime`` keeps
    its time of day; a plain ``date`` (an all-day task) stays a ``date``.
    """
    if rule.get("count") is not None and occurrences_so_far >= rule["count"]:
        return None
    is_datetime = isinstance(due, datetime)
    current = due.date() if is_datetime else due
    following = _next_date(current, rule, anchor_day or current.day)
    if rule.get("until") and following > date.fromisoformat(rule["until"]):
        return None
    if is_datetime:
        return datetime.combine(following, due.time())
    return following
