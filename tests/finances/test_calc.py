"""Finance maths: periods, totals, balances, cycles and breakdowns."""

from __future__ import annotations

from phibe.finances import calc

CATS = [
    {"id": "food", "name": "Food", "color": "#0f0", "parentId": None},
    {"id": "food-groceries", "name": "Groceries", "color": "#0f0", "parentId": "food"},
    {"id": "bills", "name": "Payments", "color": "#00f", "parentId": None},
]


def tx(date, kind="expense", amount=1000, **over):
    base = {
        "id": date + kind, "date": date, "description": "x", "categoryId": "", "kind": kind,
        "amount": amount, "accountId": "a", "toAccountId": None, "method": "pix",
        "cardId": None, "goalId": None,
    }
    return {**base, **over}


def test_month_preset_compares_with_the_same_span_of_the_month_before() -> None:
    assert calc.previous_range("month", "2026-10-01", "2026-10-11") == ("2026-09-01", "2026-09-11")
    assert calc.previous_range("month", "2026-03-01", "2026-03-31") == ("2026-02-01", "2026-02-28")


def test_other_ranges_compare_with_an_equal_span_right_before() -> None:
    assert calc.previous_range("7d", "2026-10-05", "2026-10-11") == ("2026-09-28", "2026-10-04")


def test_delta_pct() -> None:
    assert calc.delta_pct(112, 100) == 12
    assert calc.delta_pct(95, 100) == -5
    assert calc.delta_pct(10, 0) is None
    assert calc.delta_pct(0, 0) == 0


def test_totals_ignore_transfers_except_into_a_savings_account() -> None:
    txs = [
        tx("2026-10-02", "income", 5000), tx("2026-10-03", "expense", 1200),
        tx("2026-10-04", "transfer", 700, toAccountId="pot"),  # into savings: counts as saved
        tx("2026-10-05", "transfer", 900, toAccountId="b"),  # between ordinary accounts: never counts
        tx("2026-10-06", "transfer", 300, accountId="pot", toAccountId="pot2"),  # between savings accounts: not new saving
        tx("2026-09-30", "income", 999),
    ]
    assert calc.totals(txs, "2026-10-01", "2026-10-31", ["pot", "pot2"]) == {"income": 5000, "expenses": 1200, "savings": 700}
    assert calc.totals(txs, "2026-10-01", "2026-10-31")["savings"] == 0  # no savings accounts known


def test_balance_moves_with_transfers_and_skips_credit() -> None:
    a, b = {"id": "a", "opening": 10_000}, {"id": "b", "opening": 0}
    txs = [
        tx("2026-10-02", "income", 5000),
        tx("2026-10-03", "expense", 1000, method="credit", cardId="c"),
        tx("2026-10-04", "transfer", 2000, toAccountId="b"),
        tx("2026-10-05", "transfer", 500, toAccountId="b"),
    ]
    assert calc.account_balance(a, txs, "2026-10-31") == 10_000 + 5000 - 2000 - 500
    assert calc.account_balance(b, txs, "2026-10-31") == 2500
    assert calc.total_balance([a, b], txs, "2026-10-31") == 14_500 + 500
    assert calc.account_balance(a, txs, "2026-10-01") == 10_000  # nothing yet


def test_breakdown_rolls_subcategories_up_and_counts_uncategorized() -> None:
    txs = [
        tx("2026-10-02", categoryId="food-groceries", amount=3000),
        tx("2026-10-03", categoryId="food", amount=1000),
        tx("2026-10-04", categoryId="", amount=1000),  # its category was deleted
        tx("2026-10-05", "income", 9999, categoryId="food"),
    ]
    rows = calc.expense_breakdown(txs, CATS, "2026-10-01", "2026-10-31")
    assert [(r["id"], r["value"], r["pct"]) for r in rows] == [("food", 4000, 80.0), ("", 1000, 20.0)]
    assert rows[1]["name"] == "Uncategorized"
    assert calc.category_totals(txs, CATS, "expense", "2026-10-01", "2026-10-31") == {"food": 4000}


def test_monthly_series_is_oldest_first() -> None:
    txs = [tx("2026-10-02", "income", 5000), tx("2026-09-02", "expense", 1500)]
    rows = calc.monthly_series(txs, "2026-10-11", months=3)
    assert [r["date"] for r in rows] == ["2026-08-01", "2026-09-01", "2026-10-01"]
    assert rows[1]["expenses"] == 15 and rows[2] == {"date": "2026-10-01", "income": 50, "expenses": 0, "net": 50}


CARD = {"id": "c", "dueDay": 15, "closeDaysBefore": 7}  # closes on the 8th


def test_card_cycle_follows_the_closing_offset() -> None:
    assert calc.card_cycle(CARD, "2026-10-05") == {"start": "2026-09-09", "close": "2026-10-08", "due": "2026-10-15"}
    assert calc.card_cycle(CARD, "2026-10-11") == {"start": "2026-10-09", "close": "2026-11-08", "due": "2026-11-15"}
    # a due day that does not exist in a short month falls on its last day
    assert calc.card_cycle({"id": "c", "dueDay": 31, "closeDaysBefore": 3}, "2026-02-10")["due"] == "2026-02-28"


def test_card_used_counts_credit_inside_the_cycle_only() -> None:
    txs = [
        tx("2026-10-10", amount=4000, method="credit", cardId="c"),
        tx("2026-10-08", amount=900, method="credit", cardId="c"),  # last cycle
        tx("2026-10-12", amount=700, method="debit", cardId="c"),  # debit never uses the limit
    ]
    assert calc.card_used(CARD, txs, "2026-10-11") == 4000


def test_savings_pace() -> None:
    pot = {"id": "pot", "target": 10_000, "balance": 4000}
    txs = [tx("2026-09-20", "transfer", 3000, toAccountId="pot"), tx("2026-05-01", "transfer", 1000, toAccountId="pot")]
    assert calc.months_left(pot, txs, "2026-10-11") == 6  # 6000 left at 1000 a month (the May one is too old)
    assert calc.months_left(pot, [], "2026-10-11") is None  # no pace
    assert calc.months_left({**pot, "target": None}, txs, "2026-10-11") is None  # no target
    out = [*txs, tx("2026-10-01", "transfer", 3000, accountId="pot", toAccountId="b")]
    assert calc.months_left(pot, out, "2026-10-11") is None  # what went out cancels what came in
