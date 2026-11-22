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
    pot = store.save_account({"name": "Trip", "savings": True, "target": 100_000, "color": "#fff"})
    return a, b, card, debit, pot


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


def test_transfer_rules_and_saving_into_a_savings_account(setup, store) -> None:
    a, b, _, _, pot = setup
    with pytest.raises(FinanceError, match="two different"):
        store.save_transaction({"date": "2026-10-05", "kind": "transfer", "amount": 5, "accountId": a["id"], "toAccountId": a["id"]})
    t = store.save_transaction({"date": "2026-10-05", "kind": "transfer", "amount": 5, "accountId": a["id"], "toAccountId": b["id"]})
    assert t["description"] == "Transfer" and t["categoryId"] == ""
    with pytest.raises(FinanceError, match="two different"):  # saving from the savings account into itself is refused
        store.save_transaction({"date": "2026-10-05", "kind": "transfer", "amount": 7, "accountId": pot["id"], "toAccountId": pot["id"]})
    with pytest.raises(FinanceError, match="Unknown transaction kind"):
        store.save_transaction({"date": "2026-10-05", "kind": "savings", "amount": 7, "accountId": a["id"]})


def test_a_savings_account_keeps_its_target_and_colour_only_while_it_is_one(store) -> None:
    pot = store.save_account({"name": "Trip", "savings": True, "target": 5000, "color": "#20e7aa"})
    assert (pot["savings"], pot["target"], pot["color"]) == (True, 5000, "#20e7aa")
    plain = store.save_account({"id": pot["id"], "name": "Trip", "savings": False, "target": 5000, "color": "#20e7aa"})
    assert (plain["savings"], plain["target"], plain["color"]) == (False, None, None)
    with pytest.raises(FinanceError, match="target"):
        store.save_account({"name": "Bad", "savings": True, "target": 0})


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


def test_import_only_into_an_empty_store(store) -> None:
    data = {
        "accounts": [{"id": "x", "name": "Bank", "opening": 100}],
        "goals": [{"id": "g", "name": "Trip", "target": 100, "color": "#fff"}],
        "transactions": [{"id": "t", "date": "2026-10-01", "kind": "income", "amount": 50, "description": "Pay", "categoryId": "salary", "accountId": "x", "method": "pix"}],
    }
    assert store.import_state(data) == {"accounts": 1, "cards": 0, "categories": 0, "goals": 1, "transactions": 1}
    assert store.transactions()[0]["id"] == "t"
    assert [(a["name"], a["savings"], a["target"]) for a in store.accounts()] == [("Bank", False, None), ("Trip", True, 100)]  # a goal became a savings account
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


def test_upcoming_shows_future_charges_without_recording_them(store, setup) -> None:
    a, *_ = setup
    store.save_recurring(_rule(a, date="2026-10-01", description="Gym"), today="2026-10-05")  # Oct + Nov recorded
    got = store.upcoming("2027-01-01", "2027-02-28")
    assert [(t["date"], t["description"]) for t in got] == [("2027-02-01", "Gym"), ("2027-01-01", "Gym")]
    assert len(store.transactions()) == 2  # nothing was stored
    store.save_recurring(_rule(a, date="2026-10-01", installments=3), today="2026-10-05")
    assert [t["date"] for t in store.upcoming("2026-12-01", "2027-03-01") if "(" in t["description"]] == ["2026-12-01"]


def test_an_existing_expense_can_start_repeating(store, setup) -> None:
    a, *_ = setup
    tx = store.save_transaction({"date": "2026-10-01", "kind": "expense", "amount": 5_000, "description": "Gym",
                                 "categoryId": "bills", "accountId": a["id"], "method": "pix"})
    rule = store.repeat_transaction(tx["id"], 3, "2026-10-05")
    got = sorted(store.transactions(), key=lambda t: t["date"])
    assert [(t["date"], t["description"], t["recurringId"]) for t in got] == [
        ("2026-10-01", "Gym (1/3)", rule["id"]), ("2026-11-01", "Gym (2/3)", rule["id"])]
    with pytest.raises(FinanceError):
        store.repeat_transaction(tx["id"], None, "2026-10-05")  # already repeats
    store.stop_recurring(rule["id"])
    assert store.repeat_transaction(tx["id"], None, "2026-10-05")["total"] is None  # stopped ones can start again


def test_deleting_a_recurring_charge_can_reach_one_following_or_all(store, setup) -> None:
    a, *_ = setup
    store.save_recurring(_rule(a, installments=6), today="2026-12-05")  # five charges recorded
    first, second, third, *_ = sorted(store.transactions(), key=lambda t: t["date"])
    store.delete_transaction(second["id"], "one")
    assert len(store.transactions()) == 4 and store.recurring()[0]["made"] == 5  # not regenerated
    store.delete_transaction(third["id"], "following")
    assert [t["id"] for t in store.transactions()] == [first["id"]] and store.recurring() == []
    rule = store.save_recurring(_rule(a), today="2026-12-05")
    store.delete_transaction(next(t for t in store.transactions() if t["recurringId"] == rule["id"])["id"], "all")
    assert [t["id"] for t in store.transactions()] == [first["id"]] and store.recurring() == []


def _edit(store, tx, scope, **over):
    return store.save_transaction({**tx, "amount": 9_900, **over}, scope)


def test_editing_a_recurring_charge_can_reach_one_following_or_all(store, setup) -> None:
    a, *_ = setup
    store.save_recurring(_rule(a, installments=4), today="2026-12-05")  # Aug..Dec recorded: 4 charges
    by_date = lambda: sorted(store.transactions(), key=lambda t: t["date"])  # noqa: E731
    first, second, third, fourth = by_date()

    _edit(store, second, "one")
    assert [t["amount"] for t in by_date()] == [25_000, 9_900, 25_000, 25_000]

    _edit(store, third, "following", description="Renamed (3/4)")
    got = by_date()
    assert [t["amount"] for t in got] == [25_000, 9_900, 9_900, 9_900]
    assert [t["description"] for t in got][2:] == ["Renamed (3/4)", "Renamed (4/4)"]  # each keeps its own count
    assert store.recurring()[0]["amount"] == 9_900 and store.recurring()[0]["description"] == "Renamed"

    _edit(store, first, "all", amount=1_000)
    assert {t["amount"] for t in store.transactions()} == {1_000}
    assert store.recurring()[0]["amount"] == 1_000
    with pytest.raises(FinanceError):
        _edit(store, first, "nope")


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


def test_goals_of_an_older_database_become_savings_accounts_once(tmp_path) -> None:
    import sqlite3

    path = tmp_path / "old.db"
    s = FinanceStore(path)
    a = s.save_account({"name": "Santander", "opening": 50_000})
    pot = s.save_account({"name": "Emergency Fund"})
    s.close()
    raw = sqlite3.connect(path)  # what an older version left: a goal, an account linked to it, and deposits to it
    raw.execute("INSERT INTO goals VALUES ('g1', 'Emergency Fund', 90000, '#20e7aa', 0)")
    raw.execute("INSERT INTO goals VALUES ('g2', 'Holiday', 20000, '#ffb199', 1)")
    raw.execute("UPDATE accounts SET goal_id='g1' WHERE id=?", (pot["id"],))
    for tid, acct in (("d1", a["id"]), ("d2", pot["id"])):  # d2 came from the savings account itself: no source to move from
        raw.execute(
            "INSERT INTO transactions (id, date, description, category_id, kind, amount, account_id, method, goal_id) "
            "VALUES (?, '2026-10-30', 'Deposit', '', 'savings', 10000, ?, 'pix', 'g1')", (tid, acct))
    raw.execute("DELETE FROM meta WHERE key='goals_migrated'")
    raw.commit()
    raw.close()

    s = FinanceStore(path)
    by = {x["name"]: x for x in s.accounts()}
    assert (by["Emergency Fund"]["savings"], by["Emergency Fund"]["target"], by["Emergency Fund"]["color"]) == (True, 90000, "#20e7aa")
    assert (by["Holiday"]["savings"], by["Holiday"]["target"], by["Holiday"]["opening"]) == (True, 20000, 0)  # a goal with no account got one
    moved = {t["id"]: t for t in s.transactions()}
    assert (moved["d1"]["kind"], moved["d1"]["toAccountId"]) == ("transfer", pot["id"])
    assert moved["d2"]["kind"] == "savings"  # left alone, nothing is lost
    s.delete_account(by["Holiday"]["id"])
    s.close()
    assert "Holiday" not in {x["name"] for x in FinanceStore(path).accounts()}  # an account deleted later does not come back


def test_a_card_has_an_optional_known_brand(store, setup) -> None:
    a, *_ = setup
    base = {"accountId": a["id"], "name": "Gold", "mode": "both", "limit": 10_000, "dueDay": 10, "closeDaysBefore": 7}
    assert store.save_card(base)["brand"] is None
    card = store.save_card({**base, "brand": "mastercard"})
    assert card["brand"] == "mastercard"
    assert store.save_card({**base, "id": card["id"], "brand": ""})["brand"] is None
    with pytest.raises(FinanceError, match="brand"):
        store.save_card({**base, "brand": "diners-ish"})
