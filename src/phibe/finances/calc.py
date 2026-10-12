"""Finance maths: periods, totals, balances, credit-card cycles and breakdowns.

Everything here is pure: it takes plain dicts (the same shape the API serves)
and returns plain values. Amounts are integer cents; dates are ``YYYY-MM-DD``.
"""

from __future__ import annotations

import calendar
import math
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

Tx = Dict[str, Any]


def _d(value: str) -> date:
    return date.fromisoformat(value)


def _add_days(value: str, days: int) -> str:
    return (_d(value) + timedelta(days=days)).isoformat()


def _month_start(year: int, month: int) -> date:
    """First day of a month; *month* may overflow or underflow the year."""
    year += (month - 1) // 12
    return date(year, (month - 1) % 12 + 1, 1)


def _clamp_day(year: int, month: int, day: int) -> date:
    first = _month_start(year, month)
    return first.replace(day=min(day, calendar.monthrange(first.year, first.month)[1]))


# -- Periods -------------------------------------------------------------------


def previous_range(preset: str, start: str, end: str) -> Tuple[str, str]:
    """The period "last month" is compared with.

    The month preset compares with the same span of the month before; any other
    range compares with an equal span directly before it.
    """
    if preset == "month":
        first = _d(start)
        prev = _month_start(first.year, first.month - 1)
        last_day = calendar.monthrange(prev.year, prev.month)[1]
        return prev.isoformat(), prev.replace(day=min(_d(end).day, last_day)).isoformat()
    length = (_d(end) - _d(start)).days + 1
    return _add_days(start, -length), _add_days(start, -1)


def delta_pct(now: int, before: int) -> Optional[float]:
    """Change against the earlier value in percent; ``None`` with nothing to compare."""
    if before == 0:
        return 0.0 if now == 0 else None
    return math.floor((now - before) / abs(before) * 1000 + 0.5) / 10


# -- Totals and balances ------------------------------------------------------------


def totals(txs: List[Tx], start: str, end: str) -> Dict[str, int]:
    """Income, expenses and savings in a period; transfers never count."""
    out = {"income": 0, "expenses": 0, "savings": 0}
    key = {"income": "income", "expense": "expenses", "savings": "savings"}
    for t in txs:
        if start <= t["date"] <= end and t["kind"] in key:
            out[key[t["kind"]]] += t["amount"]
    return out


def account_balance(account: Dict[str, Any], txs: List[Tx], upto: str) -> int:
    """Money in one account on a date. Credit spending uses the card limit instead."""
    total = account["opening"]
    for t in txs:
        if t["date"] > upto:
            continue
        if t["kind"] == "transfer":
            if t["accountId"] == account["id"]:
                total -= t["amount"]
            if t["toAccountId"] == account["id"]:
                total += t["amount"]
        elif t["accountId"] == account["id"] and t["method"] != "credit":
            total += t["amount"] if t["kind"] == "income" else -t["amount"]
    return total


def total_balance(accounts: List[Dict[str, Any]], txs: List[Tx], upto: str) -> int:
    return sum(account_balance(a, txs, upto) for a in accounts)


# -- Breakdown and series -------------------------------------------------------------


def root_of(categories: List[Dict[str, Any]], category_id: str) -> Optional[Dict[str, Any]]:
    by_id = {c["id"]: c for c in categories}
    cat = by_id.get(category_id)
    if cat and cat["parentId"]:
        return by_id.get(cat["parentId"], cat)
    return cat


def expense_breakdown(
    txs: List[Tx], categories: List[Dict[str, Any]], start: str, end: str
) -> List[Dict[str, Any]]:
    """Spending share by general category; subcategories roll up into their parent."""
    by_root: Dict[str, int] = {}
    total = 0
    for t in txs:
        if t["kind"] != "expense" or not start <= t["date"] <= end:
            continue
        root = root_of(categories, t["categoryId"])
        key = root["id"] if root else ""  # "" = the category was deleted
        by_root[key] = by_root.get(key, 0) + t["amount"]
        total += t["amount"]
    named = {c["id"]: c for c in categories}
    named[""] = {"id": "", "name": "Uncategorized", "color": "#94a3b8"}
    rows = [
        {
            "id": key,
            "name": named[key]["name"],
            "color": named[key]["color"],
            "value": value,
            "pct": math.floor(value / total * 1000 + 0.5) / 10,
        }
        for key, value in by_root.items()
        if key in named
    ]
    return sorted(rows, key=lambda r: -r["value"])


def category_totals(
    txs: List[Tx], categories: List[Dict[str, Any]], kind: str, start: str, end: str
) -> Dict[str, int]:
    """Amount per general category for one kind in a period."""
    out: Dict[str, int] = {}
    for t in txs:
        if t["kind"] != kind or not start <= t["date"] <= end:
            continue
        root = root_of(categories, t["categoryId"])
        if root:
            out[root["id"]] = out.get(root["id"], 0) + t["amount"]
    return out


def monthly_series(txs: List[Tx], end: str, months: int = 6) -> List[Dict[str, Any]]:
    """Income, expenses and net per month (in whole currency), oldest first."""
    last = _d(end)
    rows = []
    for back in range(months - 1, -1, -1):
        first = _month_start(last.year, last.month - back)
        prefix = first.isoformat()[:7]
        income = sum(t["amount"] for t in txs if t["date"].startswith(prefix) and t["kind"] == "income")
        expenses = sum(t["amount"] for t in txs if t["date"].startswith(prefix) and t["kind"] == "expense")
        rows.append(
            {
                "date": first.isoformat(),
                "income": income / 100,
                "expenses": expenses / 100,
                "net": (income - expenses) / 100,
            }
        )
    return rows


# -- Goals and cards ---------------------------------------------------------------------


def goal_saved(txs: List[Tx], goal_id: str) -> int:
    return sum(t["amount"] for t in txs if t["kind"] == "savings" and t["goalId"] == goal_id)


def months_left(goal: Dict[str, Any], txs: List[Tx], today: str) -> Optional[int]:
    """Months to reach the target at the pace of the last 90 days, or ``None``."""
    since = _add_days(today, -90)
    recent = sum(
        t["amount"]
        for t in txs
        if t["goalId"] == goal["id"] and t["kind"] == "savings" and t["date"] > since
    )
    left = goal["target"] - goal_saved(txs, goal["id"])
    return math.ceil(left / (recent / 3)) if recent > 0 and left > 0 else None


def card_cycle(card: Dict[str, Any], today: str) -> Dict[str, str]:
    """The billing cycle containing *today*: first day, closing date and due date."""
    now = _d(today)

    def close_on(offset: int) -> str:
        due = _clamp_day(now.year, now.month + offset, card["dueDay"])
        return (due - timedelta(days=card["closeDaysBefore"])).isoformat()

    k = 1 if today > close_on(0) else 0
    close = close_on(k)
    return {
        "start": _add_days(close_on(k - 1), 1),
        "close": close,
        "due": _add_days(close, card["closeDaysBefore"]),
    }


def card_used(card: Dict[str, Any], txs: List[Tx], today: str) -> int:
    """Credit used in the current cycle."""
    cycle = card_cycle(card, today)
    return sum(
        t["amount"]
        for t in txs
        if t["cardId"] == card["id"]
        and t["method"] == "credit"
        and t["kind"] == "expense"
        and cycle["start"] <= t["date"] <= cycle["close"]
    )
