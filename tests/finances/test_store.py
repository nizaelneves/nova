"""Finance storage and the rules that protect money."""

from __future__ import annotations

import pytest

from phibe.finances.store import FinanceError, FinanceStore, NotFound, match_logo_key


@pytest.fixture
def store(tmp_path):
    s = FinanceStore(tmp_path / "f.db")
    yield s
    s.close()


def _tx(**over):
    return {"date": "2026-10-05", "kind": "expense", "amount": 1000, "description": "Lunch",
            "categoryId": "food", "method": "pix", "accountId": None, **over}


@pytest.fixture
def setup(store):
    a = store.save_account({"name": "C6 Bank", "opening": 100_000})
    b = store.save_account({"name": "Cash", "icon": "wallet"})
    card = store.save_card({"accountId": a["id"], "name": "Carbon", "mode": "both", "limit": 500_000, "dueDay": 15, "closeDaysBefore": 7})
    debit = store.save_card({"accountId": b["id"], "name": "Debit only", "mode": "debit"})
    goal = store.save_goal({"name": "Trip", "target": 100_000, "color": "#fff"})
    return a, b, card, debit, goal


def test_new_users_get_default_categories_once(tmp_path) -> None:
    s = FinanceStore(tmp_path / "f.db")
    ids = {c["id"] for c in s.categories()}
    assert {"food", "food-groceries", "salary"} <= ids and "other" not in ids
    for c in s.categories():
        if any(x["id"] == c["id"] for x in s.categories()):
            s.delete_category(c["id"])
    s.close()
    again = FinanceStore(tmp_path / "f.db")
    assert again.categories() == []  # deleting everything must stick
    again.close()


def test_default_categories_are_the_chosen_set_with_subcategories_a_to_z(store) -> None:
    cats = store.categories()
    roots = {k: [c["name"] for c in cats if not c["parentId"] and c["kind"] == k] for k in ("income", "expense")}
    assert roots["income"] == ["Salary", "Freelance", "Investments"]
    assert roots["expense"] == ["Food", "Transport", "Payments", "Health", "Shopping", "Leisure", "Education", "Pets"]
    subs = {c["name"]: [s["name"] for s in cats if s["parentId"] == c["id"]] for c in cats if not c["parentId"]}
    assert subs["Food"] == ["Groceries", "Junk Food", "Restaurants", "Supermarket"]
    assert subs["Health"] == ["Gym", "Health Insurance", "Hospital", "Martial Arts Gym", "Medicine"]
    assert subs["Salary"] == subs["Shopping"] == subs["Pets"] == []
    for name, names in subs.items():
        assert names == sorted(names), name


def test_account_picks_a_bank_logo_from_its_name(setup, store) -> None:
    a, b, *_ = setup
    assert a["logoKey"] == "c6" and b["logoKey"] is None and b["icon"] == "wallet"
    assert match_logo_key("Santander Empresas") == "santander_empresas"
    renamed = store.save_account({"id": b["id"], "name": "Caixa Poupanca"})
    assert renamed["logoKey"] == "caixa"


def test_debit_and_credit_need_a_matching_card_and_use_its_account(setup, store) -> None:
    a, b, card, debit, _ = setup
    with pytest.raises(FinanceError, match="need a card"):
        store.save_transaction(_tx(method="debit"))
    with pytest.raises(FinanceError, match="does not work as credit"):
        store.save_transaction(_tx(method="credit", cardId=debit["id"]))
    paid = store.save_transaction(_tx(method="debit", cardId=debit["id"], accountId=a["id"]))
    assert paid["accountId"] == b["id"]  # the card's account wins over what was sent
    with pytest.raises(FinanceError, match="cannot go on credit"):
        store.save_transaction(_tx(kind="income", method="credit", cardId=card["id"], categoryId="salary"))


def test_transfer_and_savings_rules(setup, store) -> None:
    a, b, _, _, goal = setup
    with pytest.raises(FinanceError, match="two different"):
        store.save_transaction({"date": "2026-10-05", "kind": "transfer", "amount": 5, "accountId": a["id"], "toAccountId": a["id"]})
    t = store.save_transaction({"date": "2026-10-05", "kind": "transfer", "amount": 5, "accountId": a["id"], "toAccountId": b["id"]})
    assert t["description"] == "Transfer" and t["categoryId"] == ""
    s = store.save_transaction({"date": "2026-10-05", "kind": "savings", "amount": 7, "accountId": a["id"], "goalId": goal["id"]})
    assert s["goalId"] == goal["id"]
    with pytest.raises(NotFound):
        store.save_transaction({"date": "2026-10-05", "kind": "savings", "amount": 7, "accountId": a["id"], "goalId": "nope"})


def test_input_is_validated(setup, store) -> None:
    a, *_ = setup
    for bad in (_tx(amount=0, accountId=a["id"]), _tx(amount=1.5, accountId=a["id"]), _tx(date="soon", accountId=a["id"]),
                _tx(kind="gift", accountId=a["id"]), _tx(description=" ", accountId=a["id"]), _tx(method="barter", accountId=a["id"])):
        with pytest.raises(FinanceError):
            store.save_transaction(bad)
    with pytest.raises(FinanceError, match="other kind"):
        store.save_transaction(_tx(categoryId="salary", accountId=a["id"]))
    with pytest.raises(FinanceError, match="credit limit"):
        store.save_card({"accountId": a["id"], "name": "x", "mode": "credit", "limit": 0, "dueDay": 5, "closeDaysBefore": 3})


def test_edit_in_place_and_list_filters(setup, store) -> None:
    a, *_ = setup
    t = store.save_transaction(_tx(accountId=a["id"], description="Lunch"))
    store.save_transaction(_tx(accountId=a["id"], description="Fuel", date="2026-09-01"))
    store.save_transaction({**t, "description": "Late lunch"})
    assert len(store.transactions()) == 2
    assert [x["description"] for x in store.transactions(start="2026-10-01")] == ["Late lunch"]
    assert [x["description"] for x in store.transactions(query="fuel")] == ["Fuel"]


def test_deleting_an_account_removes_its_cards_and_transactions(setup, store) -> None:
    a, b, card, _, _ = setup
    store.save_transaction(_tx(method="credit", cardId=card["id"]))
    store.save_transaction({"date": "2026-10-05", "kind": "transfer", "amount": 5, "accountId": b["id"], "toAccountId": a["id"]})
    store.delete_account(a["id"])
    assert [c["name"] for c in store.cards()] == ["Debit only"]
    assert store.transactions() == []


def test_category_deletes_hand_transactions_up_or_leave_them_uncategorized(setup, store) -> None:
    a, *_ = setup
    store.save_transaction(_tx(accountId=a["id"], categoryId="food-groceries"))
    store.delete_category("food-groceries")
    assert store.transactions()[0]["categoryId"] == "food"
    store.delete_category("food")
    assert store.transactions()[0]["categoryId"] == ""
    assert not [c for c in store.categories() if c["parentId"] == "food"]


def test_subcategory_rules(store) -> None:
    sub = store.save_category({"name": "Snacks", "kind": "expense", "color": "#fff", "icon": "tag", "parentId": "food"})
    with pytest.raises(FinanceError, match="cannot hold"):
        store.save_category({"name": "Deep", "kind": "expense", "color": "#fff", "icon": "tag", "parentId": sub["id"]})
    with pytest.raises(FinanceError, match="same kind"):
        store.save_category({"name": "Odd", "kind": "income", "color": "#fff", "icon": "tag", "parentId": "food"})


def test_deleting_a_goal_removes_its_deposits(setup, store) -> None:
    a, _, _, _, goal = setup
    store.save_transaction({"date": "2026-10-05", "kind": "savings", "amount": 7, "accountId": a["id"], "goalId": goal["id"]})
    store.delete_goal(goal["id"])
    assert store.transactions() == []


def test_import_only_into_an_empty_store(store) -> None:
    data = {
        "accounts": [{"id": "x", "name": "Bank", "opening": 100}],
        "goals": [{"id": "g", "name": "Trip", "target": 100, "color": "#fff"}],
        "transactions": [{"id": "t", "date": "2026-10-01", "kind": "income", "amount": 50, "description": "Pay", "categoryId": "salary", "accountId": "x", "method": "pix"}],
    }
    assert store.import_state(data) == {"accounts": 1, "cards": 0, "categories": 0, "goals": 1, "transactions": 1}
    assert store.transactions()[0]["id"] == "t"
    with pytest.raises(FinanceError, match="already hold"):
        store.import_state(data)


# -- recurring expenses and card payments -------------------------------------------------


def _rule(account, **over):
    return {"date": "2026-08-31", "description": "Ame Credit Card Agreement", "categoryId": "bills",
            "amount": 25_000, "method": "pix", "accountId": account["id"], **over}


def test_installments_are_recorded_as_each_one_comes_due(store, setup) -> None:
    a, *_ = setup
    store.save_recurring(_rule(a, installments=4), today="2026-10-05")
    txs = sorted(store.transactions(), key=lambda t: t["date"])
    assert [(t["date"], t["description"]) for t in txs] == [
        ("2026-08-31", "Ame Credit Card Agreement (1/4)"),
        ("2026-09-30", "Ame Credit Card Agreement (2/4)"),  # September has 30 days
        ("2026-10-31", "Ame Credit Card Agreement (3/4)"),  # the next one is already on the timeline
    ]
    assert store.generate_due("2026-10-05") == 0  # repeating changes nothing
    store.generate_due("2026-12-31")
    assert len(store.transactions()) == 4
    store.generate_due("2027-06-01")
    assert len(store.transactions()) == 4  # the last installment was the fourth
    assert store.recurring()[0]["active"] is False


def test_a_recurring_expense_without_an_end_keeps_going_until_stopped(store, setup) -> None:
    a, *_ = setup
    rule = store.save_recurring(_rule(a, date="2026-10-01", description="Gym"), today="2026-10-05")
    assert [t["date"] for t in store.transactions()] == ["2026-11-01", "2026-10-01"]  # this month's and the next one
    store.generate_due("2026-12-02")
    assert len(store.transactions()) == 4  # Oct, Nov, Dec and January ahead
    store.stop_recurring(rule["id"])
    store.generate_due("2027-03-01")
    assert len(store.transactions()) == 4  # stopping keeps what was recorded
    assert store.recurring() == []


def test_a_recurring_expense_is_checked_like_any_expense(store, setup) -> None:
    a, b, card, debit, _ = setup
    with pytest.raises(FinanceError):
        store.save_recurring(_rule(a, method="credit"), today="2026-10-05")  # credit needs a card
    with pytest.raises(FinanceError):
        store.save_recurring(_rule(a, installments=1), today="2026-10-05")
    store.save_recurring(_rule(a, method="credit", cardId=card["id"], installments=3), today="2026-10-05")
    assert {t["cardId"] for t in store.transactions()} == {card["id"]}
    store.delete_card(card["id"])
    assert store.recurring() == [] and store.generate_due("2027-01-01") == 0  # its rule went with the card


def test_old_databases_get_the_recurring_column(tmp_path) -> None:
    import sqlite3

    db = sqlite3.connect(tmp_path / "old.db")
    db.executescript(
        "CREATE TABLE transactions (id TEXT PRIMARY KEY, date TEXT NOT NULL, description TEXT NOT NULL,"
        " category_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, amount INTEGER NOT NULL, account_id TEXT NOT NULL,"
        " to_account_id TEXT, method TEXT NOT NULL, card_id TEXT, goal_id TEXT);"
        "INSERT INTO transactions VALUES ('t','2026-01-01','Old','', 'expense', 100, 'a', NULL, 'pix', NULL, NULL);"
    )
    db.commit()
    db.close()
    s = FinanceStore(tmp_path / "old.db")
    assert s.transactions()[0]["recurringId"] is None
    s.close()


def test_paying_a_card_early_frees_its_limit_and_moves_the_money(store, setup) -> None:
    from phibe.finances import calc

    a, _, card, _, _ = setup
    store.save_transaction(_tx(date="2026-10-02", amount=300_000, method="credit", cardId=card["id"]))
    def shape():
        return next(c for c in store.cards() if c["id"] == card["id"])

    assert calc.card_used(shape(), store.transactions(), "2026-10-05") == 300_000
    before = calc.account_balance(a, store.transactions(), "2026-10-05")
    store.save_transaction({"kind": "payment", "date": "2026-10-05", "amount": 100_000, "cardId": card["id"], "accountId": a["id"]})
    txs = store.transactions()
    assert calc.card_used(shape(), txs, "2026-10-05") == 200_000  # limit is free again, before the bill closes
    assert calc.account_balance(a, txs, "2026-10-05") == before - 100_000
    assert calc.totals(txs, "2026-10-01", "2026-10-31")["expenses"] == 300_000  # not counted a second time


def test_a_card_payment_cannot_be_more_than_is_owed_or_for_a_debit_card(store, setup) -> None:
    a, _, card, debit, _ = setup
    store.save_transaction(_tx(date="2026-10-02", amount=10_000, method="credit", cardId=card["id"]))
    with pytest.raises(FinanceError):
        store.save_transaction({"kind": "payment", "date": "2026-10-05", "amount": 10_001, "cardId": card["id"], "accountId": a["id"]})
    with pytest.raises(FinanceError):
        store.save_transaction({"kind": "payment", "date": "2026-10-05", "amount": 100, "cardId": debit["id"], "accountId": a["id"]})
    ok = store.save_transaction({"kind": "payment", "date": "2026-10-05", "amount": 10_000, "cardId": card["id"], "accountId": a["id"]})
    store.save_transaction({**ok, "amount": 4_000})  # editing it does not count it twice


def test_a_charge_dated_later_shows_up_at_once_so_it_can_be_stopped(store, setup) -> None:
    a, *_ = setup
    rule = store.save_recurring(_rule(a, date="2026-10-26", description="Vivo Controle"), today="2026-10-25")
    (tx,) = store.transactions()
    assert (tx["date"], tx["recurringId"]) == ("2026-10-26", rule["id"])
    assert store.generate_due("2026-10-25") == 0


def test_the_card_filter_lists_debit_and_credit_through_a_card(store, setup) -> None:
    a, _, card, _, _ = setup
    store.save_transaction(_tx(description="Pix", accountId=a["id"]))
    store.save_transaction(_tx(description="Debit", method="debit", cardId=card["id"]))
    store.save_transaction(_tx(description="Credit", method="credit", cardId=card["id"]))
    assert sorted(t["description"] for t in store.transactions(kind="card")) == ["Credit", "Debit"]
