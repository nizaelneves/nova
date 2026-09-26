"""HTTP API for finances, and its presence in the real server."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from nova.finances.store import FinanceStore
from nova.server.finances_routes import create_finances_router

BASE = "/api/finances"


@pytest.fixture
def client(tmp_path):
    store = FinanceStore(tmp_path / "f.db", now=lambda: datetime(2026, 10, 15, 12, 0))
    app = FastAPI()
    app.include_router(create_finances_router(lambda: store))
    yield TestClient(app)
    store.close()


def _post(client, path, body, status=201):
    response = client.post(f"{BASE}{path}", json=body)
    assert response.status_code == status, response.text
    return response.json()


def test_full_flow(client) -> None:
    me = _post(client, "/accounts", {"name": "Me"})
    bank = _post(
        client,
        "/wallets",
        {"account_id": me["id"], "name": "Bank", "opening_cents": 50_000},
    )
    food = _post(client, "/categories", {"name": "Food"})
    made = _post(
        client,
        "/transactions",
        {
            "type": "expense",
            "amount_cents": 1_234,
            "date": "2026-10-10",
            "wallet_id": bank["id"],
            "category_id": food["id"],
        },
    )["transactions"]
    assert len(made) == 1

    wallets = client.get(f"{BASE}/wallets").json()["wallets"]
    assert wallets[0]["balance_cents"] == 48_766
    summary = client.get(f"{BASE}/reports/summary?year=2026&month=2026-10").json()
    assert summary["expense_cents"] == 1_234
    pie = client.get(f"{BASE}/reports/categories?year=2026").json()
    assert pie["categories"][0]["name"] == "Food"
    assert (
        client.get(f"{BASE}/overview").json()["accounts"][0]["balance_cents"] == 48_766
    )


def test_recurrence_and_installments_from_the_single_form(client) -> None:
    me = _post(client, "/accounts", {"name": "Me"})
    bank = _post(client, "/wallets", {"account_id": me["id"], "name": "Bank"})
    parts = _post(
        client,
        "/transactions",
        {
            "type": "expense",
            "amount_cents": 9_000,
            "date": "2026-10-10",
            "wallet_id": bank["id"],
            "installments": 3,
        },
    )["transactions"]
    assert [p["amount_cents"] for p in parts] == [3_000] * 3
    monthly = _post(
        client,
        "/transactions",
        {
            "type": "income",
            "amount_cents": 100,
            "date": "2026-10-10",
            "wallet_id": bank["id"],
            "recurrence": {"freq": "monthly", "count": 5},
        },
    )["transactions"]
    assert len(monthly) == 5
    removed = client.delete(f"{BASE}/transactions/{monthly[0]['id']}?scope=all").json()
    assert removed == {"removed": 5}


def test_card_invoice_flow(client) -> None:
    me = _post(client, "/accounts", {"name": "Me"})
    bank = _post(
        client,
        "/wallets",
        {"account_id": me["id"], "name": "B", "opening_cents": 9_000},
    )
    card = _post(
        client,
        "/cards",
        {"account_id": me["id"], "name": "Visa", "closing_day": 10, "due_day": 17},
    )
    _post(
        client,
        "/transactions",
        {
            "type": "expense",
            "amount_cents": 4_000,
            "date": "2026-09-20",
            "card_id": card["id"],
        },
    )
    invoices = client.get(f"{BASE}/cards/{card['id']}/invoices").json()["invoices"]
    assert invoices[0]["month"] == "2026-10" and invoices[0]["status"] == "closed"
    paid = _post(
        client,
        f"/cards/{card['id']}/invoices/2026-10/pay",
        {"wallet_id": bank["id"]},
        status=200,
    )
    assert paid["status"] == "paid"


def test_errors_map_to_http_codes(client) -> None:
    assert client.get(f"{BASE}/transactions/none").status_code == 404
    bad = client.post(f"{BASE}/accounts", json={"name": "  "})
    assert bad.status_code == 422
    me = _post(client, "/accounts", {"name": "Me"})
    bank = _post(client, "/wallets", {"account_id": me["id"], "name": "B"})
    _post(
        client,
        "/transactions",
        {
            "type": "income",
            "amount_cents": 1,
            "date": "2026-10-01",
            "wallet_id": bank["id"],
        },
    )
    assert client.delete(f"{BASE}/wallets/{bank['id']}").status_code == 409


def test_archive_then_delete_with_confirmation(client) -> None:
    me = _post(client, "/accounts", {"name": "Me"})
    refused = client.post(
        f"{BASE}/accounts/{me['id']}/delete", json={"confirm_name": "Me"}
    )
    assert refused.status_code == 422
    _post(client, f"/accounts/{me['id']}/archive", {}, status=200)
    wrong = client.post(
        f"{BASE}/accounts/{me['id']}/delete", json={"confirm_name": "x"}
    )
    assert wrong.status_code == 422
    done = client.post(
        f"{BASE}/accounts/{me['id']}/delete", json={"confirm_name": "Me"}
    )
    assert done.json() == {"status": "deleted"}
    assert client.get(f"{BASE}/accounts?archived=true").json()["accounts"] == []


def test_yield_endpoints(client) -> None:
    me = _post(client, "/accounts", {"name": "Me"})
    savings = _post(
        client,
        "/wallets",
        {
            "account_id": me["id"],
            "name": "Cofre",
            "kind": "savings",
            "opening_cents": 100_000,
        },
    )
    response = client.put(
        f"{BASE}/wallets/{savings['id']}/yield",
        json={"month": "2026-09", "amount_cents": 1_000},
    )
    assert response.json()["pct"] == 1.0
    history = client.get(f"{BASE}/wallets/{savings['id']}/yield").json()["history"]
    assert len(history) == 1


def test_finances_api_is_served_by_the_real_app(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("NOVA_HOME", str(tmp_path / "home"))
    from nova.server.app import create_app

    engine = SimpleNamespace(engine_id="fake", health=lambda: True)
    real = TestClient(create_app(engine, "fake"))
    created = real.post(f"{BASE}/accounts", json={"name": "Me", "kind": "person"})
    assert created.status_code == 201
    assert (tmp_path / "home" / "finances.db").exists()
