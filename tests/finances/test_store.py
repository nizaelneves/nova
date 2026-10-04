"""Finance rules: Banks, nested Accounts, independent Cards, balances,
transfers, installments, invoices, yield."""

from __future__ import annotations

import sqlite3
from datetime import date, datetime

import pytest

from phi.finances import reports
from phi.finances.store import FinanceError, FinanceStore, InUse, match_logo_key

NOW = datetime(2026, 10, 15, 12, 0)


@pytest.fixture
def store(tmp_path):
    s = FinanceStore(tmp_path / "f.db", now=lambda: NOW)
    yield s
    s.close()


@pytest.fixture
def world(store):
    """A bank with its first (auto-created) account, a second account under
    the same bank, an independent card."""
    bank = store.create_bank("Nubank")
    account = bank["accounts"][0]
    store.update_account(account["id"], opening_cents=100_000)
    savings = store.create_account(bank["id"], "Cofre", "savings")
    card = store.create_card("Visa", closing_day=10, due_day=17)
    return {"bank": bank, "account": account, "savings": savings, "card": card}


def _tx(store, **kw):
    kw.setdefault("date", "2026-10-05")
    return store.create_transaction(**kw)


# -- logo matching -------------------------------------------------------------


@pytest.mark.parametrize(
    "name,expected",
    [
        ("Santander Empresas", "santander_empresas"),
        ("SANTANDER", "santander"),
        ("Santander", "santander"),
        ("c6 bank", "c6"),
        ("C6", "c6"),
        ("Caixa Econômica Federal", "caixa"),
        ("caixa", "caixa"),
        ("Nubank", None),
        ("", None),
    ],
)
def test_logo_matching_most_specific_first(name, expected) -> None:
    assert match_logo_key(name) == expected


# -- banks and nested accounts -------------------------------------------------


def test_creating_a_bank_auto_creates_its_first_account(store) -> None:
    bank = store.create_bank("Nubank")
    assert bank["name"] == "Nubank" and bank["logo_key"] is None
    assert len(bank["accounts"]) == 1
    assert bank["accounts"][0]["name"] == "Nubank"
    assert bank["accounts"][0]["bank_id"] == bank["id"]
    assert bank["accounts"][0]["balance_cents"] == 0


def test_a_bank_can_have_multiple_accounts(store) -> None:
    bank = store.create_bank("Santander", first_account_name="Checking")
    savings = store.create_account(bank["id"], "Savings", opening_cents=5_000)
    emergency = store.create_account(bank["id"], "Emergency fund")
    accounts = store.list_accounts(bank["id"])
    assert {a["name"] for a in accounts} == {"Checking", "Savings", "Emergency fund"}
    assert all(a["bank_id"] == bank["id"] for a in accounts)
    assert savings["balance_cents"] == 5_000
    assert emergency["balance_cents"] == 0


def test_bank_logo_recomputed_on_rename(store) -> None:
    bank = store.create_bank("Nubank")
    assert bank["logo_key"] is None
    renamed = store.rename_bank(bank["id"], "Santander Empresas")
    assert renamed["logo_key"] == "santander_empresas"


def test_renaming_a_bank_with_accounts_keeps_them(store, world) -> None:
    renamed = store.rename_bank(world["bank"]["id"], "Nu")
    assert len(renamed["accounts"]) == 2


def test_bank_with_accounts_cannot_be_deleted(store, world) -> None:
    with pytest.raises(InUse):
        store.delete_bank(world["bank"]["id"])


def test_account_balance_follows_income_and_expense(store, world) -> None:
    account = world["account"]["id"]
    _tx(store, type="income", amount_cents=50_000, account_id=account)
    _tx(store, type="expense", amount_cents=12_345, account_id=account)
    _tx(store, type="expense", amount_cents=999, account_id=account, date="2026-11-01")
    assert store.account_balance(account) == 100_000 + 50_000 - 12_345
    assert store.account_balance(account, as_of=date(2026, 11, 2)) == 137_655 - 999


def test_account_delete_blocked_while_it_has_transactions(store, world) -> None:
    _tx(store, type="income", amount_cents=100, account_id=world["account"]["id"])
    with pytest.raises(InUse):
        store.delete_account(world["account"]["id"])
    store.delete_account(world["savings"]["id"])


# -- cards are fully independent ----------------------------------------------


def test_card_has_no_account_or_bank_link(store) -> None:
    card = store.create_card("Visa", 10, 17)
    assert "account_id" not in card and "bank_id" not in card
    assert card["logo_key"] is None


def test_card_logo_auto_matches_from_name(store) -> None:
    card = store.create_card("C6 Bank Platinum", 5, 12)
    assert card["logo_key"] == "c6"


def test_card_logo_recomputed_on_rename(store, world) -> None:
    updated = store.update_card(world["card"]["id"], name="Caixa Elo")
    assert updated["logo_key"] == "caixa"


def test_deleting_a_card_never_requires_or_touches_any_account(store, world) -> None:
    """Creating, using and deleting a card never needs a Bank/Account at all,
    except for the Account that eventually pays its invoice."""
    lone_card = store.create_card("Lone card", 1, 10)
    store.delete_card(lone_card["id"])  # no account ever involved

    _tx(store, type="expense", amount_cents=1_000, card_id=world["card"]["id"])
    with pytest.raises(InUse):
        store.delete_card(world["card"]["id"])
    # the account used elsewhere is untouched by the card's own lifecycle
    assert store.account_balance(world["account"]["id"]) == 100_000


def test_card_days_are_validated(store, world) -> None:
    with pytest.raises(FinanceError):
        store.create_card("X", closing_day=0, due_day=10)
    with pytest.raises(FinanceError):
        store.update_card(world["card"]["id"], due_day=32)


# -- income / expense / balance ------------------------------------------------


def test_expense_needs_account_or_card_not_both(store, world) -> None:
    with pytest.raises(FinanceError):
        _tx(store, type="expense", amount_cents=100)
    with pytest.raises(FinanceError):
        _tx(
            store,
            type="expense",
            amount_cents=100,
            account_id=world["account"]["id"],
            card_id=world["card"]["id"],
        )
    with pytest.raises(FinanceError, match="card"):
        _tx(store, type="income", amount_cents=100, card_id=world["card"]["id"])


@pytest.mark.parametrize("amount", [0, -5, 1.5])
def test_amount_must_be_positive_whole_centavos(store, world, amount) -> None:
    with pytest.raises(FinanceError):
        _tx(store, type="income", amount_cents=amount, account_id=world["account"]["id"])


# -- transfers ------------------------------------------------------------------


def test_transfer_between_accounts_of_the_same_bank(store, world) -> None:
    _tx(
        store,
        type="transfer",
        amount_cents=30_000,
        account_id=world["account"]["id"],
        to_account_id=world["savings"]["id"],
    )
    assert store.account_balance(world["account"]["id"]) == 70_000
    assert store.account_balance(world["savings"]["id"]) == 30_000


def test_transfer_between_any_two_banks_is_allowed(store, world) -> None:
    other_bank = store.create_bank("Other")
    other_account = other_bank["accounts"][0]
    made = _tx(
        store,
        type="transfer",
        amount_cents=1_000,
        account_id=world["account"]["id"],
        to_account_id=other_account["id"],
    )
    assert len(made) == 1
    assert store.account_balance(other_account["id"]) == 1_000


def test_transfer_needs_two_different_accounts(store, world) -> None:
    account = world["account"]["id"]
    with pytest.raises(FinanceError):
        _tx(store, type="transfer", amount_cents=1, account_id=account, to_account_id=account)
    with pytest.raises(FinanceError):
        _tx(store, type="transfer", amount_cents=1, account_id=account)


# -- installments ---------------------------------------------------------------


def test_installments_split_the_total_without_losing_centavos(store, world) -> None:
    made = _tx(
        store,
        type="expense",
        amount_cents=10_000,
        account_id=world["account"]["id"],
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
            account_id=world["account"]["id"],
            installments=2,
            recurrence={"freq": "monthly"},
        )


# -- recurring --------------------------------------------------------------------


def test_recurring_entries_are_created_a_year_ahead(store, world) -> None:
    made = _tx(
        store,
        type="expense",
        amount_cents=5_000,
        account_id=world["account"]["id"],
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
        account_id=world["account"]["id"],
        recurrence={"freq": "weekly", "count": 4},
    )
    assert len(made) == 4


def test_recurring_tops_up_as_time_passes(tmp_path) -> None:
    clock = {"now": NOW}
    s = FinanceStore(tmp_path / "clock.db", now=lambda: clock["now"])
    bank = s.create_bank("B")
    account = bank["accounts"][0]
    s.create_transaction(
        type="expense",
        amount_cents=100,
        date="2026-10-05",
        account_id=account["id"],
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
        account_id=world["account"]["id"],
        recurrence={"freq": "monthly"},
    )
    third = made[2]
    assert store.delete_transaction(third["id"], scope="one") == 1
    assert store.delete_transaction(made[4]["id"], scope="future") == 9
    left = store.list_transactions()
    assert len(left) == 3  # 0, 1 and 3
    assert len(store.list_transactions()) == 3
    assert store.delete_transaction(made[0]["id"], scope="all") == 3
    assert store.list_transactions() == []


def test_edit_future_changes_amount_of_later_entries_only(store, world) -> None:
    made = _tx(
        store,
        type="expense",
        amount_cents=100,
        account_id=world["account"]["id"],
        recurrence={"freq": "monthly"},
    )
    store.update_transaction(made[3]["id"], scope="future", amount_cents=250)
    amounts = {t["date"]: t["amount_cents"] for t in store.list_transactions()}
    assert amounts[made[2]["date"]] == 100
    assert amounts[made[3]["date"]] == 250 and amounts[made[12]["date"]] == 250


# -- cards and invoices -----------------------------------------------------------


def test_purchase_lands_in_the_invoice_by_closing_day(store, world) -> None:
    card = world["card"]["id"]
    on_close = _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-10-10")
    after = _tx(store, type="expense", amount_cents=200, card_id=card, date="2026-10-11")
    assert on_close[0]["invoice_month"] == "2026-10"
    assert after[0]["invoice_month"] == "2026-11"


def test_invoice_dates_and_status(store, world) -> None:
    card = world["card"]["id"]
    _tx(store, type="expense", amount_cents=4_000, card_id=card, date="2026-09-20")
    _tx(store, type="expense", amount_cents=1_000, card_id=card, date="2026-10-14")
    sept = store.get_invoice(card, "2026-10")
    assert sept["total_cents"] == 4_000
    assert (sept["closing_date"], sept["due_date"]) == ("2026-10-10", "2026-10-17")
    assert sept["status"] == "closed"
    nov = store.get_invoice(card, "2026-11")
    assert nov["total_cents"] == 1_000 and nov["status"] == "open"


def test_due_day_before_closing_day_falls_next_month(store, world) -> None:
    card = store.create_card("Master", closing_day=25, due_day=5)
    invoice = store.get_invoice(card["id"], "2026-10")
    assert (invoice["closing_date"], invoice["due_date"]) == ("2026-10-25", "2026-11-05")


def test_card_installments_go_to_consecutive_invoices(store, world) -> None:
    card = world["card"]["id"]
    made = _tx(
        store, type="expense", amount_cents=9_000, card_id=card, installments=3, date="2026-10-05"
    )
    assert [t["invoice_month"] for t in made] == ["2026-10", "2026-11", "2026-12"]
    for month in ("2026-10", "2026-11", "2026-12"):
        assert store.get_invoice(card, month)["total_cents"] == 3_000


def test_card_purchases_do_not_touch_the_account_until_the_invoice_is_paid(
    store, world
) -> None:
    card, account = world["card"]["id"], world["account"]["id"]
    _tx(store, type="expense", amount_cents=4_000, card_id=card, date="2026-09-20")
    assert store.account_balance(account) == 100_000

    paid = store.pay_invoice(card, "2026-10", account)
    assert paid["status"] == "paid"
    assert store.account_balance(account) == 96_000
    with pytest.raises(FinanceError, match="already paid"):
        store.pay_invoice(card, "2026-10", account)

    store.unpay_invoice(card, "2026-10")
    assert store.account_balance(account) == 100_000


def test_invoice_can_be_paid_from_any_account_regardless_of_bank(store, world) -> None:
    """Cards have no owner any more, so any Account can pay any card."""
    other_bank = store.create_bank("Other")
    other_account = other_bank["accounts"][0]
    card = world["card"]["id"]
    _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-09-20")
    paid = store.pay_invoice(card, "2026-10", other_account["id"])
    assert paid["status"] == "paid"
    assert store.account_balance(other_account["id"]) == -100


def test_changing_the_purchase_date_moves_it_between_invoices(store, world) -> None:
    card = world["card"]["id"]
    tx = _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-10-05")[0]
    moved = store.update_transaction(tx["id"], date="2026-10-20")
    assert moved["invoice_month"] == "2026-11"


def test_list_invoices_newest_first(store, world) -> None:
    card = world["card"]["id"]
    _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-09-20")
    _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-10-20")
    assert [i["month"] for i in store.list_invoices(card)] == ["2026-11", "2026-10"]


# -- categories --------------------------------------------------------------------


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
        account_id=world["account"]["id"],
        category_id=food["id"],
    )
    with pytest.raises(InUse):
        store.delete_category(food["id"])
    store.delete_category(food["id"], move_to=other["id"])
    assert store.list_transactions()[0]["category_id"] == other["id"]


# -- savings yield -------------------------------------------------------------------


def test_yield_history_with_percentages(store, world) -> None:
    sid = world["savings"]["id"]
    store.update_account(sid, opening_cents=100_000)
    store.record_yield(sid, "2026-08", 1_000)  # 1% of 1000,00
    store.record_yield(sid, "2026-09", 1_010)  # base is 1010,00 -> ~0.1%
    history = store.yield_history(sid)

    assert [h["month"] for h in history] == ["2026-08", "2026-09"]
    assert history[0]["base_cents"] == 100_000 and history[0]["pct"] == 1.0
    assert history[1]["base_cents"] == 101_000 and history[1]["pct"] == 1.0
    assert history[1]["cumulative_pct"] == 2.01
    assert store.account_balance(sid) == 102_010


def test_recording_a_month_again_replaces_it(store, world) -> None:
    sid = world["savings"]["id"]
    store.update_account(sid, opening_cents=100_000)
    store.record_yield(sid, "2026-08", 1_000)
    store.record_yield(sid, "2026-08", 1_500)
    assert [h["yield_cents"] for h in store.yield_history(sid)] == [1_500]
    assert store.account_balance(sid) == 101_500


def test_yield_only_on_savings_and_not_ordinary_income(store, world) -> None:
    with pytest.raises(FinanceError, match="savings"):
        store.record_yield(world["account"]["id"], "2026-08", 100)
    store.record_yield(world["savings"]["id"], "2026-08", 1_000)
    totals = reports.summary(store, year=2026)
    assert totals["income_cents"] == 0 and totals["yield_cents"] == 1_000


# -- reports --------------------------------------------------------------------------


def test_reports_leave_out_transfers_and_invoice_payments(store, world) -> None:
    account, card = world["account"]["id"], world["card"]["id"]
    _tx(store, type="income", amount_cents=500_000, account_id=account, date="2026-10-01")
    _tx(store, type="expense", amount_cents=20_000, account_id=account, date="2026-10-02")
    _tx(store, type="expense", amount_cents=30_000, card_id=card, date="2026-10-03")
    _tx(
        store,
        type="transfer",
        amount_cents=40_000,
        account_id=account,
        to_account_id=world["savings"]["id"],
    )
    store.pay_invoice(card, "2026-10", account)

    month = reports.summary(store, year=2026, month="2026-10")
    assert month["income_cents"] == 500_000
    assert month["expense_cents"] == 50_000  # account expense + card purchase, once
    assert month["net_cents"] == 450_000


def test_monthly_series_has_twelve_months(store, world) -> None:
    _tx(store, type="income", amount_cents=100, account_id=world["account"]["id"])
    series = reports.monthly_series(store, year=2026)
    assert len(series) == 12 and series[9]["month"] == "2026-10"
    assert series[9]["income_cents"] == 100


def test_yearly_series(store, world) -> None:
    account = world["account"]["id"]
    _tx(store, type="income", amount_cents=100, account_id=account, date="2025-03-01")
    _tx(store, type="expense", amount_cents=40, account_id=account, date="2026-03-01")
    series = reports.yearly_series(store)
    assert [(s["year"], s["income_cents"], s["expense_cents"]) for s in series] == [
        (2025, 100, 0),
        (2026, 0, 40),
    ]


def test_category_pie_rolls_subcategories_up(store, world) -> None:
    account = world["account"]["id"]
    food = store.create_category("Food")
    rest = store.create_category("Restaurants", food["id"])
    home = store.create_category("Home")
    _tx(store, type="expense", amount_cents=3_000, account_id=account, category_id=rest["id"])
    _tx(store, type="expense", amount_cents=1_000, account_id=account, category_id=food["id"])
    _tx(store, type="expense", amount_cents=4_000, account_id=account, category_id=home["id"])
    _tx(store, type="expense", amount_cents=2_000, account_id=account)

    pie = reports.by_category(store, year=2026, month="2026-10")
    names = {c["name"]: c for c in pie["categories"]}
    assert pie["total_cents"] == 10_000
    assert names["Food"]["total_cents"] == 4_000
    assert names["Food"]["children"][0]["name"] == "Restaurants"
    assert names["Uncategorized"]["total_cents"] == 2_000
    assert names["Home"]["share_pct"] == 40.0


def test_overview_lists_each_bank_with_accounts_and_each_card_with_invoice(
    store, world
) -> None:
    _tx(store, type="expense", amount_cents=1_000, card_id=world["card"]["id"])
    data = reports.overview(store)
    bank = next(b for b in data["banks"] if b["name"] == "Nubank")
    assert {a["name"] for a in bank["accounts"]} == {"Nubank", "Cofre"}
    card = next(c for c in data["cards"] if c["name"] == "Visa")
    assert card["current_invoice"]["total_cents"] == 1_000


def test_overview_month_scopes_the_income_expense_figures_but_not_balance(
    store, world
) -> None:
    account = world["account"]["id"]
    _tx(store, type="income", amount_cents=1_000, account_id=account, date="2026-09-15")
    _tx(store, type="income", amount_cents=2_000, account_id=account, date="2026-10-15")
    sept = reports.overview(store, month="2026-09")
    oct_ = reports.overview(store, month="2026-10")
    sept_acc = next(
        a for b in sept["banks"] for a in b["accounts"] if a["id"] == account
    )
    oct_acc = next(
        a for b in oct_["banks"] for a in b["accounts"] if a["id"] == account
    )
    assert sept_acc["month"]["income_cents"] == 1_000
    assert oct_acc["month"]["income_cents"] == 2_000
    # balance is always "as of now", not scoped to the viewed month
    assert sept_acc["balance_cents"] == oct_acc["balance_cents"]


def test_data_survives_reopening(tmp_path) -> None:
    path = tmp_path / "again.db"
    first = FinanceStore(path, now=lambda: NOW)
    first.create_bank("Kept")
    first.close()
    second = FinanceStore(path, now=lambda: NOW)
    assert [b["name"] for b in second.list_banks()] == ["Kept"]
    second.close()


def test_user_can_choose_the_invoice(store, world) -> None:
    card = world["card"]["id"]
    auto = _tx(store, type="expense", amount_cents=100, card_id=card, date="2026-10-10")
    chosen = _tx(
        store, type="expense", amount_cents=100, card_id=card, date="2026-10-10",
        invoice_month="2026-11",
    )
    assert auto[0]["invoice_month"] == "2026-10"
    assert chosen[0]["invoice_month"] == "2026-11"


def test_chosen_invoice_carries_over_to_installments_and_recurrence(store, world) -> None:
    card = world["card"]["id"]
    parts = _tx(
        store, type="expense", amount_cents=9_000, card_id=card, installments=3,
        date="2026-10-05", invoice_month="2026-11",
    )
    assert [p["invoice_month"] for p in parts] == ["2026-11", "2026-12", "2027-01"]
    monthly = _tx(
        store, type="expense", amount_cents=100, card_id=card,
        recurrence={"freq": "monthly", "count": 3}, date="2026-10-05",
        invoice_month="2026-11",
    )
    assert [m["invoice_month"] for m in monthly] == ["2026-11", "2026-12", "2027-01"]


def test_invoice_month_is_only_for_cards_and_can_be_edited(store, world) -> None:
    with pytest.raises(FinanceError, match="card"):
        _tx(
            store, type="expense", amount_cents=100, account_id=world["account"]["id"],
            invoice_month="2026-11",
        )
    tx = _tx(store, type="expense", amount_cents=100, card_id=world["card"]["id"])[0]
    moved = store.update_transaction(tx["id"], invoice_month="2026-12")
    assert moved["invoice_month"] == "2026-12"


# -- migration from the old owner-Account/Wallet shape --------------------------------


def test_migration_from_old_owner_wallet_schema(tmp_path) -> None:
    """An old-shape db (owner `accounts` -> `wallets`/`cards`, transactions
    with `wallet_id`/`to_wallet_id`) opens fine under the new store: each
    wallet becomes a Bank + one Account (same id, so existing transactions
    keep pointing at the right row); each card loses its owner link and
    gains an auto-matched logo; balances, invoices and yield history are
    unaffected."""
    db_path = tmp_path / "old.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE accounts (
            id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            kind TEXT NOT NULL, archived_at TEXT
        );
        CREATE TABLE wallets (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
            name TEXT NOT NULL, kind TEXT NOT NULL, opening_cents INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE cards (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
            name TEXT NOT NULL, closing_day INTEGER NOT NULL, due_day INTEGER NOT NULL
        );
        CREATE TABLE categories (
            id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE,
            parent_id TEXT REFERENCES categories(id)
        );
        CREATE TABLE plans (id TEXT PRIMARY KEY, kind TEXT NOT NULL, rule TEXT);
        CREATE TABLE transactions (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
            type TEXT NOT NULL, amount_cents INTEGER NOT NULL, date TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '', category_id TEXT REFERENCES categories(id),
            wallet_id TEXT REFERENCES wallets(id), card_id TEXT REFERENCES cards(id),
            to_wallet_id TEXT REFERENCES wallets(id), plan_id TEXT,
            installment_no INTEGER, installments_total INTEGER, invoice_month TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX tx_date ON transactions (date);
        CREATE INDEX tx_account ON transactions (account_id);
        CREATE INDEX tx_card ON transactions (card_id, invoice_month);
        CREATE INDEX tx_wallet ON transactions (wallet_id);

        INSERT INTO accounts VALUES ('acc1', 'Nizael Neves', 'person', NULL);
        INSERT INTO wallets VALUES ('wal1', 'acc1', 'Nubank', 'bank', 100000);
        INSERT INTO wallets VALUES ('wal2', 'acc1', 'Cofre', 'savings', 0);
        INSERT INTO cards VALUES ('card1', 'acc1', 'Santander Visa', 10, 17);
        INSERT INTO categories VALUES ('cat1', 'Food', NULL);
        INSERT INTO transactions VALUES
            ('tx1', 'acc1', 'income', 50000, '2026-10-01', '', NULL, 'wal1', NULL, NULL,
             NULL, NULL, NULL, NULL, '2026-10-01T00:00:00'),
            ('tx2', 'acc1', 'expense', 1000, '2026-10-02', '', 'cat1', NULL, 'card1', NULL,
             NULL, NULL, NULL, '2026-10', '2026-10-02T00:00:00'),
            ('tx3', 'acc1', 'transfer', 2000, '2026-10-03', '', NULL, 'wal1', NULL, 'wal2',
             NULL, NULL, NULL, NULL, '2026-10-03T00:00:00'),
            ('tx4', 'acc1', 'yield', 100, '2026-10-04', 'Yield 2026-10', NULL, 'wal2', NULL,
             NULL, NULL, NULL, NULL, NULL, '2026-10-04T00:00:00');
        """
    )
    conn.commit()
    conn.close()

    store = FinanceStore(db_path, now=lambda: NOW)
    try:
        banks = store.list_banks()
        nubank = next(b for b in banks if b["name"] == "Nubank")
        assert nubank["accounts"][0]["id"] == "wal1"  # id preserved
        assert nubank["accounts"][0]["opening_cents"] == 100_000
        cofre = next(b for b in banks if b["name"] == "Cofre")
        assert cofre["accounts"][0]["kind"] == "savings"

        cards = store.list_cards()
        card = next(c for c in cards if c["id"] == "card1")
        assert card["logo_key"] == "santander"
        assert "account_id" not in card

        # balances/invoices/transfers still line up after migration
        assert store.account_balance("wal1") == 100_000 + 50_000 - 2_000
        assert store.account_balance("wal2") == 2_000 + 100
        invoice = store.get_invoice("card1", "2026-10")
        assert invoice["total_cents"] == 1_000
        history = store.yield_history("wal2")
        assert history[0]["yield_cents"] == 100

        # the old owner-level `accounts` table is gone entirely
        tables = {
            r[0]
            for r in store._conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        assert "old_wallets" not in tables and "old_accounts" not in tables
        assert tables & {"banks", "accounts", "cards", "transactions"} == {
            "banks",
            "accounts",
            "cards",
            "transactions",
        }
    finally:
        store.close()

    # opening it again (already migrated) is a no-op, not a repeat migration
    reopened = FinanceStore(db_path, now=lambda: NOW)
    assert len(reopened.list_banks()) == 2
    reopened.close()
