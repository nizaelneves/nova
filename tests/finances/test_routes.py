"""HTTP API for finances, and that the real app serves it."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.finances.store import FinanceStore
from phibe.server.app import create_app
from phibe.server.finances_routes import create_finances_router


@pytest.fixture
def client(tmp_path):
    store = FinanceStore(tmp_path / "f.db")
    app = FastAPI()
    app.include_router(create_finances_router(lambda: store))
    yield TestClient(app)
    store.close()


def _post(client, path, body):
    r = client.post(f"/api/finances/{path}", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_overview_works_out_totals_deltas_and_the_breakdown(client) -> None:
    acc = _post(client, "accounts", {"name": "C6 Bank", "opening": 100_000})
    base = {"accountId": acc["id"], "method": "pix"}
    for date, kind, amount, cat in (
        ("2026-09-03", "expense", 1000, "food-groceries"), ("2026-10-03", "expense", 1500, "food"),
        ("2026-10-02", "income", 50_000, "salary"),
    ):
        _post(client, "transactions", {**base, "date": date, "kind": kind, "amount": amount, "description": "x", "categoryId": cat})
    r = client.get("/api/finances/overview", params={"from": "2026-10-01", "to": "2026-10-11", "preset": "month"}).json()
    assert r["totals"] == {"income": 50_000, "expenses": 1500, "savings": 0}
    assert r["previous"]["expenses"] == 1000
    assert r["deltas"]["expenses"] == 50 and r["deltas"]["income"] is None
    assert r["balance"] == 100_000 + 50_000 - 1500 - 1000  # both months count
    assert [(s["id"], s["pct"]) for s in r["breakdown"]] == [("food", 100.0)]
    assert len(r["series"]) == 6


def test_state_carries_balances_card_cycles_and_savings_progress(client) -> None:
    acc = _post(client, "accounts", {"name": "Cash", "opening": 5000})
    card = _post(client, "cards", {"accountId": acc["id"], "name": "Visa", "mode": "credit", "limit": 100_000, "dueDay": 15, "closeDaysBefore": 7})
    pot = _post(client, "accounts", {"name": "Trip", "savings": True, "target": 10_000, "color": "#fff"})
    _post(client, "transactions", {"date": "2026-10-10", "kind": "expense", "amount": 2500, "description": "Shoes", "categoryId": "shopping", "method": "credit", "cardId": card["id"]})
    _post(client, "transactions", {"date": "2026-10-10", "kind": "transfer", "amount": 1000, "accountId": acc["id"], "toAccountId": pot["id"]})
    s = client.get("/api/finances/state", params={"today": "2026-10-11"}).json()
    assert s["accounts"][0]["balance"] == 4000  # credit did not touch it, the move to savings did
    assert s["cards"][0]["used"] == 2500 and s["cards"][0]["cycle"]["close"] == "2026-11-08"
    assert s["accounts"][1]["balance"] == 1000 and s["accounts"][1]["monthsLeft"] == 27 and "monthsLeft" not in s["accounts"][0]
    assert "goals" not in s
    assert any(c["id"] == "food" for c in s["categories"])


def test_errors_map_to_http_codes(client) -> None:
    assert client.post("/api/finances/accounts", json={"name": " "}).status_code == 422
    assert client.delete("/api/finances/transactions/missing").status_code == 404
    bad = {"kind": "income", "date": "2026-10-01", "amount": 5, "description": "x", "accountId": "nope", "method": "pix"}
    assert client.post("/api/finances/transactions", json=bad).status_code == 404


def test_import_and_delete_round_trip(client) -> None:
    r = client.post("/api/finances/import", json={"accounts": [{"id": "x", "name": "Bank", "opening": 1}]})
    assert r.status_code == 200 and r.json()["accounts"] == 1
    assert client.post("/api/finances/import", json={}).status_code == 422
    assert client.delete("/api/finances/accounts/x").status_code == 204
    assert client.get("/api/finances/state").json()["accounts"] == []


def test_real_app_serves_finances(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path / "home"))
    app_client = TestClient(create_app(SimpleNamespace(engine_id="fake", health=lambda: True), "fake"))
    assert app_client.get("/api/finances/state").status_code == 200
    assert (tmp_path / "home" / "finance.db").exists()


def test_recurring_expense_over_http(client) -> None:
    acc = _post(client, "accounts", {"name": "C6 Bank", "opening": 100_000})
    body = {"date": "2026-08-31", "description": "Ame Credit Card Agreement", "categoryId": "bills", "amount": 25_000,
            "method": "pix", "accountId": acc["id"], "installments": 3}
    rule = _post(client, "recurring", body)
    state = client.get("/api/finances/state", params={"today": "2026-10-05"}).json()
    assert [r["id"] for r in state["recurring"]] == [rule["id"]]
    txs = client.get("/api/finances/transactions", params={"from": "2026-08-01", "to": "2026-12-31"}).json()["transactions"]
    assert all(t["recurringId"] == rule["id"] for t in txs) and len(txs) >= 1
    assert client.delete(f"/api/finances/recurring/{rule['id']}").status_code == 204
    assert client.delete(f"/api/finances/recurring/{rule['id']}").status_code == 404
    assert client.post("/api/finances/recurring", json={**body, "installments": 1}).status_code == 422


def test_saving_money_is_a_transfer_into_a_savings_account(client) -> None:
    wallet = _post(client, "accounts", {"name": "Wallet", "opening": 50_000})
    pot = _post(client, "accounts", {"name": "Savings", "opening": 30_000, "savings": True, "target": 100_000, "color": "#20e7aa"})
    assert (pot["savings"], pot["target"]) == (True, 100_000)
    _post(client, "transactions", {"date": "2026-01-05", "kind": "transfer", "amount": 10_000, "accountId": wallet["id"], "toAccountId": pot["id"], "description": "Savings Deposit"})
    state = client.get("/api/finances/state", params={"today": "2026-01-31"}).json()
    balance = {a["name"]: a["balance"] for a in state["accounts"]}
    assert balance == {"Wallet": 40_000, "Savings": 40_000}  # the money left Wallet and entered Savings
    r = client.get("/api/finances/overview", params={"from": "2026-01-01", "to": "2026-01-31", "preset": "month"}).json()
    assert r["totals"]["savings"] == 10_000  # what was saved in the month
    bad = client.post("/api/finances/transactions", json={"date": "2026-01-06", "kind": "transfer", "amount": 5, "accountId": pot["id"], "toAccountId": pot["id"]})
    assert bad.status_code == 422  # from the account into itself
    assert client.post("/api/finances/accounts", json={"name": "Bad", "savings": True, "target": -5}).status_code == 422


def test_deleting_one_recurring_charge_leaves_the_rest_over_http(client) -> None:
    acc = _post(client, "accounts", {"name": "C6 Bank", "opening": 100_000})
    body = {"date": "2026-08-31", "description": "Plan", "categoryId": "bills", "amount": 1_000,
            "method": "pix", "accountId": acc["id"], "installments": 6}
    rule = _post(client, "recurring", body)
    listing = lambda: client.get("/api/finances/transactions", params={"from": "2026-01-01", "to": "2027-12-31"}).json()["transactions"]  # noqa: E731
    before = sorted(listing(), key=lambda t: t["date"])
    assert len(before) >= 3
    for victim in (before[1], before[-1], before[0]):  # a middle one, the last one ahead, the first
        assert client.delete(f"/api/finances/transactions/{victim['id']}").status_code == 204  # no scope given
        left = {t["id"] for t in listing()}
        assert victim["id"] not in left
    assert len(listing()) == len(before) - 3 or len(listing()) >= len(before) - 3
    assert [r["id"] for r in client.get("/api/finances/state").json()["recurring"]] == [rule["id"]]  # the rule is still there
