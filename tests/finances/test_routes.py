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


def test_state_carries_balances_card_cycles_and_goal_progress(client) -> None:
    acc = _post(client, "accounts", {"name": "Cash", "opening": 5000})
    card = _post(client, "cards", {"accountId": acc["id"], "name": "Visa", "mode": "credit", "limit": 100_000, "dueDay": 15, "closeDaysBefore": 7})
    goal = _post(client, "goals", {"name": "Trip", "target": 10_000, "color": "#fff"})
    _post(client, "transactions", {"date": "2026-10-10", "kind": "expense", "amount": 2500, "description": "Shoes", "categoryId": "shopping", "method": "credit", "cardId": card["id"]})
    _post(client, "transactions", {"date": "2026-10-10", "kind": "savings", "amount": 1000, "accountId": acc["id"], "goalId": goal["id"]})
    s = client.get("/api/finances/state", params={"today": "2026-10-11"}).json()
    assert s["accounts"][0]["balance"] == 4000  # credit did not touch it, the deposit did
    assert s["cards"][0]["used"] == 2500 and s["cards"][0]["cycle"]["close"] == "2026-11-08"
    assert s["goals"][0]["saved"] == 1000 and s["goals"][0]["monthsLeft"] == 27
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
