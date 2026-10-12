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
