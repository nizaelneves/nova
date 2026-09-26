"""Finance rules: Contas, balances, transfers, installments, invoices, yield."""

from __future__ import annotations

from datetime import date, datetime

import pytest

from nova.finances import reports
from nova.finances.store import FinanceError, FinanceStore, InUse

NOW = datetime(2026, 10, 15, 12, 0)


@pytest.fixture
def store(tmp_path):
    s = FinanceStore(tmp_path / "f.db", now=lambda: NOW)
    yield s
    s.close()


@pytest.fixture
def world(store):
    """A personal and a company Conta, each with a bank; a card on personal."""
    me = store.create_account("Nizael Neves")
    firm = store.create_account("Company", "company")
    bank = store.create_wallet(me["id"], "Nubank", opening_cents=100_000)
    firm_bank = store.create_wallet(firm["id"], "Company bank")
    card = store.create_card(me["id"], "Visa", closing_day=10, due_day=17)
    return {"me": me, "firm": firm, "bank": bank, "firm_bank": firm_bank, "card": card}


def _tx(store, **kw):
    kw.setdefault("date", "2026-10-05")
    return store.create_transaction(**kw)


# -- Contas ------------------------------------------------------------------


def test_delete_needs_archive_first_and_the_exact_name(store, world) -> None:
    me = world["me"]
    with pytest.raises(FinanceError, match="Archive"):
        store.delete_account(me["id"], "Nizael Neves")
    store.archive_account(me["id"])
    assert [a["name"] for a in store.list_accounts()] == ["Company"]
    assert [a["name"] for a in store.list_accounts(archived=True)] == ["Nizael Neves"]
    with pytest.raises(FinanceError, match="does not match"):
        store.delete_account(me["id"], "nizael")
    store.delete_account(me["id"], "Nizael Neves")
    assert store.list_accounts(archived=True) == []
    assert store.list_wallets(me["id"]) == [] and store.list_cards(me["id"]) == []


def test_archived_conta_takes_no_new_entries(store, world) -> None:
    store.archive_account(world["me"]["id"])
    with pytest.raises(FinanceError, match="archived"):
        _tx(store, type="income", amount_cents=100, wallet_id=world["bank"]["id"])


def test_conta_names_are_unique(store, world) -> None:
    with pytest.raises(FinanceError):
        store.create_account("company")


# -- income / expense / balance ---------------------------------------------


def test_balance_follows_income_and_expense_up_to_today(store, world) -> None:
    bank = world["bank"]["id"]
    _tx(store, type="income", amount_cents=50_000, wallet_id=bank)
    _tx(store, type="expense", amount_cents=12_345, wallet_id=bank)
    _tx(store, type="expense", amount_cents=999, wallet_id=bank, date="2026-11-01")
    assert store.wallet_balance(bank) == 100_000 + 50_000 - 12_345
    assert store.wallet_balance(bank, as_of=date(2026, 11, 2)) == 137_655 - 999


def test_expense_needs_bank_or_card_not_both(store, world) -> None:
    with pytest.raises(FinanceError):
        _tx(store, type="expense", amount_cents=100)
    with pytest.raises(FinanceError):
        _tx(
            store,
            type="expense",
            amount_cents=100,
            wallet_id=world["bank"]["id"],
            card_id=world["card"]["id"],
        )
    with pytest.raises(FinanceError, match="card"):
        _tx(store, type="income", amount_cents=100, card_id=world["card"]["id"])


@pytest.mark.parametrize("amount", [0, -5, 1.5])
def test_amount_must_be_positive_whole_centavos(store, world, amount) -> None:
    with pytest.raises(FinanceError):
        _tx(store, type="income", amount_cents=amount, wallet_id=world["bank"]["id"])


# -- transfers ---------------------------------------------------------------


def test_transfer_inside_one_conta(store, world) -> None:
    me = world["me"]
    savings = store.create_wallet(me["id"], "Cofre", "savings")
    _tx(
        store,
        type="transfer",
        amount_cents=30_000,
        wallet_id=world["bank"]["id"],
        to_wallet_id=savings["id"],
    )
    assert store.wallet_balance(world["bank"]["id"]) == 70_000
    assert store.wallet_balance(savings["id"]) == 30_000


def test_transfer_between_any_two_contas_is_allowed(store, world) -> None:
    other = store.create_account("Spouse")
    theirs = store.create_wallet(other["id"], "Bank")
    for src, dst in (
        (world["bank"], world["firm_bank"]),
        (world["firm_bank"], world["bank"]),
        (world["bank"], theirs),
    ):
        made = _tx(
            store,
            type="transfer",
            amount_cents=1_000,
            wallet_id=src["id"],
            to_wallet_id=dst["id"],
        )
        assert len(made) == 1
    assert store.wallet_balance(theirs["id"]) == 1_000


def test_a_card_cannot_pay_for_another_conta(store, world) -> None:
    firm_card = store.create_card(world["firm"]["id"], "Company card", 5, 12)
    with pytest.raises(FinanceError, match="belongs to the Conta 'Company'"):
        _tx(
            store,
            type="expense",
            amount_cents=100,
            card_id=firm_card["id"],
            account_id=world["me"]["id"],
        )
    ok = _tx(
        store,
        type="expense",
        amount_cents=100,
        card_id=firm_card["id"],
        account_id=world["firm"]["id"],
    )
    assert ok[0]["account_id"] == world["firm"]["id"]


def test_a_bank_must_also_match_the_chosen_conta(store, world) -> None:
    with pytest.raises(FinanceError, match="belongs to"):
        _tx(
            store,
            type="expense",
            amount_cents=100,
            wallet_id=world["firm_bank"]["id"],
            account_id=world["me"]["id"],
        )


def test_transfer_needs_two_different_banks(store, world) -> None:
    bank = world["bank"]["id"]
    with pytest.raises(FinanceError):
        _tx(store, type="transfer", amount_cents=1, wallet_id=bank, to_wallet_id=bank)
    with pytest.raises(FinanceError):
        _tx(store, type="transfer", amount_cents=1, wallet_id=bank)


# -- installments ------------------------------------------------------------


def test_installments_split_the_total_without_losing_centavos(store, world) -> None:
    made = _tx(
        store,
        type="expense",
        amount_cents=10_000,
        wallet_id=world["bank"]["id"],
        installments=3,
        date="2026-10-31",
    )
    assert [t["amount_cents"] for t in made] == [3334, 3333, 3333]
    assert sum(t["amount_cents"] for t in made) == 10_000
    assert [t["date"] for t in made] == ["2026-10-31", "2026-11-30", "2026-12-31"]
    assert [t["installment_no"] for t in made] == [1, 2, 3]
    assert {t["installments_total"] for t in made} == {3}


def test_installments_and_recurrence_are_exclusive(store, world) -> None:
    with pytest.raises(FinanceError):
        _tx(
            store,
            type="expense",
            amount_cents=1000,
            wallet_id=world["bank"]["id"],
            installments=2,
            recurrence={"freq": "monthly"},
        )


# -- recurring ---------------------------------------------------------------


def test_recurring_entries_are_created_a_year_ahead(store, world) -> None:
    made = _tx(
        store,
        type="expense",
        amount_cents=5_000,
        wallet_id=world["bank"]["id"],
        recurrence={"freq": "monthly"},
        date="2026-10-05",
        description="Gym",
    )
    dates = [t["date"] for t in made]
    assert dates[0] == "2026-10-05" and dates[-1] == "2027-10-05"
    assert len(dates) == 13


def test_recurring_with_a_count_stops(store, world) -> None:
    made = _tx(
        store,
        type="income",
        amount_cents=100,
        wallet_id=world["bank"]["id"],
        recurrence={"freq": "weekly", "count": 4},
    )
    assert len(made) == 4


def test_recurring_tops_up_as_time_passes(tmp_path, world) -> None:
    clock = {"now": NOW}
    s = FinanceStore(tmp_path / "clock.db", now=lambda: clock["now"])
    me = s.create_account("Me")
    bank = s.create_wallet(me["id"], "B")
    s.create_transaction(
        type="expense",
        amount_cents=100,
        date="2026-10-05",
        wallet_id=bank["id"],
        recurrence={"freq": "monthly"},
    )
    assert len(s.list_transactions()) == 13
    clock["now"] = datetime(2027, 3, 1)
    assert len(s.list_transactions()) == 17
    s.close()


def test_delete_scopes_for_a_recurring_plan(store, world) -> None:
    made = _tx(
        store,
        type="expense",
        amount_cents=100,
        wallet_id=world["bank"]["id"],
        recurrence={"freq": "monthly"},
    )
    third = made[2]
    assert store.delete_transaction(third["id"], scope="one") == 1
    assert store.delete_transaction(made[4]["id"], scope="future") == 9
    left = store.list_transactions()
    assert len(left) == 3  # 0, 1 and 3
    # and it does not grow back
    assert len(store.list_transactions()) == 3
    assert store.delete_transaction(made[0]["id"], scope="all") == 3
    assert store.list_transactions() == []


def test_edit_future_changes_amount_of_later_entries_only(store, world) -> None:
    made = _tx(
        store,
        type="expense",
        amount_cents=100,
        wallet_id=world["bank"]["id"],
        recurrence={"freq": "monthly"},
    )
    store.update_transaction(made[3]["id"], scope="future", amount_cents=250)
    amounts = {t["date"]: t["amount_cents"] for t in store.list_transactions()}
    assert amounts[made[2]["date"]] == 100
    assert amounts[made[3]["date"]] == 250 and amounts[made[12]["date"]] == 250


# -- cards and invoices ------------------------------------------------------


def test_purchase_lands_in_the_invoice_by_closing_day(store, world) -> None:
    card = world["card"]["id"]
    on_close = _tx(
        store, type="expense", amount_cents=100, card_id=card, date="2026-10-10"
    )
    after = _tx(
        store, type="expense", amount_cents=200, card_id=card, date="2026-10-11"
    )
    assert on_close[0]["invoice_month"] == "2026-10"
    assert after[0]["invoice_month"] == "2026-11"


def test_invoice_dates_and_status(store, world) -> None:
    card = world["card"]["id"]
    _tx(store, type="expense", amount_cents=4_000, card_id=card, date="2026-09-20")
    _tx(store, type="expense", amount_cents=1_000, card_id=card, date="2026-10-14")
    sept = store.get_invoice(card, "2026-10")
    assert sept["total_cents"] == 4_000
    assert (sept["closing_date"], sept["due_date"]) == ("2026-10-10", "2026-10-17")
    assert sept["status"] == "closed"  # today is the 15th, already closed
    nov = store.get_invoice(card, "2026-11")
    assert nov["total_cents"] == 1_000 and nov["status"] == "open"


def test_due_day_before_closing_day_falls_next_month(store, world) -> None:
    card = store.create_card(world["me"]["id"], "Master", closing_day=25, due_day=5)
    invoice = store.get_invoice(card["id"], "2026-10")
    assert (invoice["closing_date"], invoice["due_date"]) == (
        "2026-10-25",
        "2026-11-05",
    )


def test_card_installments_go_to_consecutive_invoices(store, world) -> None:
    card = world["card"]["id"]
    made = _tx(
        store,
        type="expense",
        amount_cents=9_000,
        card_id=card,
        installments=3,
        date="2026-10-05",
    )
    assert [t["invoice_month"] for t in made] == ["2026-10", "2026-11", "2026-12"]
    for month in ("2026-10", "2026-11", "2026-12"):
        assert store.get_invoice(card, month)["total_cents"] == 3_000


def test_card_purchases_do_not_touch_the_bank_until_the_invoice_is_paid(
    store, world
) -> None:
    card, bank = world["card"]["id"], world["bank"]["id"]
    _tx(store, type="expense", amount_cents=4_000, card_id=card, date="2026-09-20")
    assert store.wallet_balance(bank) == 100_000

    paid = store.pay_invoice(card, "2026-10", bank)
    assert paid["status"] == "paid"
    assert store.wallet_balance(bank) == 96_000
    with pytest.raises(FinanceError, match="already paid"):
        store.pay_invoice(card, "2026-10", bank)

    store.unpay_invoice(card, "2026-10")
    assert store.wallet_balance(bank) == 100_000


def test_invoice_must_be_paid_from_the_same_conta(store, world) -> None:
    card = world["card"]["id"]
    _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-09-20")
    with pytest.raises(FinanceError, match="same Conta"):
        store.pay_invoice(card, "2026-10", world["firm_bank"]["id"])


def test_changing_the_purchase_date_moves_it_between_invoices(store, world) -> None:
    card = world["card"]["id"]
    tx = _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-10-05")[
        0
    ]
    moved = store.update_transaction(tx["id"], date="2026-10-20")
    assert moved["invoice_month"] == "2026-11"


def test_list_invoices_newest_first(store, world) -> None:
    card = world["card"]["id"]
    _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-09-20")
    _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-10-20")
    assert [i["month"] for i in store.list_invoices(card)] == ["2026-11", "2026-10"]


# -- banks and cards housekeeping -------------------------------------------


def test_bank_and_card_with_history_cannot_be_deleted(store, world) -> None:
    _tx(store, type="income", amount_cents=100, wallet_id=world["bank"]["id"])
    _tx(store, type="expense", amount_cents=100, card_id=world["card"]["id"])
    with pytest.raises(InUse):
        store.delete_wallet(world["bank"]["id"])
    with pytest.raises(InUse):
        store.delete_card(world["card"]["id"])
    store.delete_wallet(world["firm_bank"]["id"])


def test_card_days_are_validated(store, world) -> None:
    with pytest.raises(FinanceError):
        store.create_card(world["me"]["id"], "X", closing_day=0, due_day=10)
    with pytest.raises(FinanceError):
        store.update_card(world["card"]["id"], due_day=32)


# -- categories --------------------------------------------------------------


def test_categories_are_two_levels_and_global(store) -> None:
    food = store.create_category("Food")
    store.create_category("Restaurants", food["id"])
    store.create_category("Groceries", food["id"])
    tree = store.list_categories()
    assert [c["name"] for c in tree] == ["Food"]
    assert [c["name"] for c in tree[0]["children"]] == ["Groceries", "Restaurants"]
    sub = tree[0]["children"][0]
    with pytest.raises(FinanceError):
        store.create_category("Deeper", sub["id"])
    with pytest.raises(FinanceError):
        store.create_category("food")


def test_deleting_a_used_category_needs_a_destination(store, world) -> None:
    food = store.create_category("Food")
    other = store.create_category("Other")
    _tx(
        store,
        type="expense",
        amount_cents=100,
        wallet_id=world["bank"]["id"],
        category_id=food["id"],
    )
    with pytest.raises(InUse):
        store.delete_category(food["id"])
    store.delete_category(food["id"], move_to=other["id"])
    assert store.list_transactions()[0]["category_id"] == other["id"]


# -- savings yield -----------------------------------------------------------


def test_yield_history_with_percentages(store, world) -> None:
    me = world["me"]
    savings = store.create_wallet(me["id"], "Cofre", "savings", opening_cents=100_000)
    sid = savings["id"]
    store.record_yield(sid, "2026-08", 1_000)  # 1% of 1000,00
    store.record_yield(sid, "2026-09", 1_010)  # base is 1010,00 -> ~0.1%
    history = store.yield_history(sid)

    assert [h["month"] for h in history] == ["2026-08", "2026-09"]
    assert history[0]["base_cents"] == 100_000 and history[0]["pct"] == 1.0
    assert history[1]["base_cents"] == 101_000 and history[1]["pct"] == 1.0
    assert history[1]["cumulative_pct"] == 2.01
    assert store.wallet_balance(sid) == 102_010


def test_recording_a_month_again_replaces_it(store, world) -> None:
    savings = store.create_wallet(world["me"]["id"], "Cofre", "savings", 100_000)
    store.record_yield(savings["id"], "2026-08", 1_000)
    store.record_yield(savings["id"], "2026-08", 1_500)
    assert [h["yield_cents"] for h in store.yield_history(savings["id"])] == [1_500]
    assert store.wallet_balance(savings["id"]) == 101_500


def test_yield_only_on_savings_and_not_ordinary_income(store, world) -> None:
    with pytest.raises(FinanceError, match="savings"):
        store.record_yield(world["bank"]["id"], "2026-08", 100)
    savings = store.create_wallet(world["me"]["id"], "Cofre", "savings", 100_000)
    store.record_yield(savings["id"], "2026-08", 1_000)
    totals = reports.summary(store, year=2026)
    assert totals["income_cents"] == 0 and totals["yield_cents"] == 1_000


# -- reports -----------------------------------------------------------------


def test_reports_leave_out_transfers_and_invoice_payments(store, world) -> None:
    bank, card = world["bank"]["id"], world["card"]["id"]
    savings = store.create_wallet(world["me"]["id"], "Cofre", "savings")
    _tx(store, type="income", amount_cents=500_000, wallet_id=bank, date="2026-10-01")
    _tx(store, type="expense", amount_cents=20_000, wallet_id=bank, date="2026-10-02")
    _tx(store, type="expense", amount_cents=30_000, card_id=card, date="2026-10-03")
    _tx(
        store,
        type="transfer",
        amount_cents=40_000,
        wallet_id=bank,
        to_wallet_id=savings["id"],
    )
    store.pay_invoice(card, "2026-10", bank)

    month = reports.summary(store, year=2026, month="2026-10")
    assert month["income_cents"] == 500_000
    assert month["expense_cents"] == 50_000  # bank expense + card purchase, once
    assert month["net_cents"] == 450_000


def test_monthly_series_has_twelve_months_and_filters_by_conta(store, world) -> None:
    _tx(store, type="income", amount_cents=100, wallet_id=world["bank"]["id"])
    _tx(store, type="income", amount_cents=900, wallet_id=world["firm_bank"]["id"])
    everyone = reports.monthly_series(store, year=2026)
    mine = reports.monthly_series(store, year=2026, account_id=world["me"]["id"])
    assert len(everyone) == 12 and everyone[9]["month"] == "2026-10"
    assert everyone[9]["income_cents"] == 1_000 and mine[9]["income_cents"] == 100


def test_yearly_series(store, world) -> None:
    bank = world["bank"]["id"]
    _tx(store, type="income", amount_cents=100, wallet_id=bank, date="2025-03-01")
    _tx(store, type="expense", amount_cents=40, wallet_id=bank, date="2026-03-01")
    series = reports.yearly_series(store)
    assert [(s["year"], s["income_cents"], s["expense_cents"]) for s in series] == [
        (2025, 100, 0),
        (2026, 0, 40),
    ]


def test_category_pie_rolls_subcategories_up(store, world) -> None:
    bank = world["bank"]["id"]
    food = store.create_category("Food")
    rest = store.create_category("Restaurants", food["id"])
    home = store.create_category("Home")
    _tx(
        store,
        type="expense",
        amount_cents=3_000,
        wallet_id=bank,
        category_id=rest["id"],
    )
    _tx(
        store,
        type="expense",
        amount_cents=1_000,
        wallet_id=bank,
        category_id=food["id"],
    )
    _tx(
        store,
        type="expense",
        amount_cents=4_000,
        wallet_id=bank,
        category_id=home["id"],
    )
    _tx(store, type="expense", amount_cents=2_000, wallet_id=bank)

    pie = reports.by_category(store, year=2026, month="2026-10")
    names = {c["name"]: c for c in pie["categories"]}
    assert pie["total_cents"] == 10_000
    assert names["Food"]["total_cents"] == 4_000
    assert names["Food"]["children"][0]["name"] == "Restaurants"
    assert names["Uncategorized"]["total_cents"] == 2_000
    assert names["Home"]["share_pct"] == 40.0


def test_overview_lists_each_conta_with_balances_and_invoices(store, world) -> None:
    _tx(store, type="expense", amount_cents=1_000, card_id=world["card"]["id"])
    data = reports.overview(store)
    mine = next(a for a in data["accounts"] if a["name"] == "Nizael Neves")
    assert mine["balance_cents"] == 100_000
    assert mine["cards"][0]["current_invoice"]["total_cents"] == 1_000


def test_data_survives_reopening(tmp_path) -> None:
    path = tmp_path / "again.db"
    first = FinanceStore(path, now=lambda: NOW)
    first.create_account("Kept")
    first.close()
    second = FinanceStore(path, now=lambda: NOW)
    assert [a["name"] for a in second.list_accounts()] == ["Kept"]
    second.close()


def test_user_can_choose_the_invoice(store, world) -> None:
    card = world["card"]["id"]
    # 2026-10-10 is the closing day -> automatic invoice is 2026-10
    auto = _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-10-10")
    chosen = _tx(
        store,
        type="expense",
        amount_cents=100,
        card_id=card,
        date="2026-10-10",
        invoice_month="2026-11",
    )
    assert auto[0]["invoice_month"] == "2026-10"
    assert chosen[0]["invoice_month"] == "2026-11"


def test_chosen_invoice_carries_over_to_installments_and_recurrence(
    store, world
) -> None:
    card = world["card"]["id"]
    parts = _tx(
        store,
        type="expense",
        amount_cents=9_000,
        card_id=card,
        installments=3,
        date="2026-10-05",
        invoice_month="2026-11",
    )
    assert [p["invoice_month"] for p in parts] == ["2026-11", "2026-12", "2027-01"]
    monthly = _tx(
        store,
        type="expense",
        amount_cents=100,
        card_id=card,
        recurrence={"freq": "monthly", "count": 3},
        date="2026-10-05",
        invoice_month="2026-11",
    )
    assert [m["invoice_month"] for m in monthly] == ["2026-11", "2026-12", "2027-01"]


def test_invoice_month_is_only_for_cards_and_can_be_edited(store, world) -> None:
    with pytest.raises(FinanceError, match="card"):
        _tx(
            store,
            type="expense",
            amount_cents=100,
            wallet_id=world["bank"]["id"],
            invoice_month="2026-11",
        )
    tx = _tx(store, type="expense", amount_cents=100, card_id=world["card"]["id"])[0]
    moved = store.update_transaction(tx["id"], invoice_month="2026-12")
    assert moved["invoice_month"] == "2026-12"
