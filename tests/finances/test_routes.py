"""HTTP API for finances, and its presence in the real server."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phi.finances.store import FinanceStore
from phi.server.finances_routes import create_finances_router

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
    bank = _post(client, "/banks", {"name": "Nubank"})
    account = bank["accounts"][0]
    food = _post(client, "/categories", {"name": "Food"})
    made = _post(
        client,
        "/transactions",
        {
            "type": "expense",
            "amount_cents": 1_234,
            "date": "2026-10-10",
            "account_id": account["id"],
            "category_id": food["id"],
        },
    )["transactions"]
    assert len(made) == 1

    accounts = client.get(f"{BASE}/accounts").json()["accounts"]
    assert accounts[0]["balance_cents"] == -1_234
    summary = client.get(f"{BASE}/reports/summary?year=2026&month=2026-10").json()
    assert summary["expense_cents"] == 1_234
    pie = client.get(f"{BASE}/reports/categories?year=2026").json()
    assert pie["categories"][0]["name"] == "Food"
    overview = client.get(f"{BASE}/overview").json()
    assert overview["banks"][0]["accounts"][0]["balance_cents"] == -1_234


def test_bank_auto_creates_first_account_and_can_grow_more(client) -> None:
    bank = _post(client, "/banks", {"name": "Santander", "first_account_name": "Checking"})
    assert len(bank["accounts"]) == 1 and bank["accounts"][0]["name"] == "Checking"
    savings = _post(
        client, "/accounts", {"bank_id": bank["id"], "name": "Savings", "opening_cents": 500}
    )
    accounts = client.get(f"{BASE}/accounts?bank_id={bank['id']}").json()["accounts"]
    assert {a["name"] for a in accounts} == {"Checking", "Savings"}
    assert savings["bank_id"] == bank["id"]


def test_card_is_created_without_any_account_or_bank(client) -> None:
    card = _post(client, "/cards", {"name": "C6 Platinum", "closing_day": 5, "due_day": 12})
    assert "account_id" not in card and "bank_id" not in card
    assert card["logo_key"] == "c6"
    assert client.delete(f"{BASE}/cards/{card['id']}").status_code == 204


def test_recurrence_and_installments_from_the_single_form(client) -> None:
    bank = _post(client, "/banks", {"name": "Bank"})
    account = bank["accounts"][0]
    parts = _post(
        client,
        "/transactions",
        {
            "type": "expense",
            "amount_cents": 9_000,
            "date": "2026-10-10",
            "account_id": account["id"],
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
            "account_id": account["id"],
            "recurrence": {"freq": "monthly", "count": 5},
        },
    )["transactions"]
    assert len(monthly) == 5
    removed = client.delete(f"{BASE}/transactions/{monthly[0]['id']}?scope=all").json()
    assert removed == {"removed": 5}


def test_card_invoice_flow(client) -> None:
    bank = _post(client, "/banks", {"name": "B"})
    account = bank["accounts"][0]
    card = _post(client, "/cards", {"name": "Visa", "closing_day": 10, "due_day": 17})
    _post(
        client,
        "/transactions",
        {"type": "expense", "amount_cents": 4_000, "date": "2026-09-20", "card_id": card["id"]},
    )
    invoices = client.get(f"{BASE}/cards/{card['id']}/invoices").json()["invoices"]
    assert invoices[0]["month"] == "2026-10" and invoices[0]["status"] == "closed"
    paid = _post(
        client,
        f"/cards/{card['id']}/invoices/2026-10/pay",
        {"account_id": account["id"]},
        status=200,
    )
    assert paid["status"] == "paid"


def test_errors_map_to_http_codes(client) -> None:
    assert client.get(f"{BASE}/transactions/none").status_code == 404
    bad = client.post(f"{BASE}/banks", json={"name": "  "})
    assert bad.status_code == 422
    bank = _post(client, "/banks", {"name": "B"})
    account = bank["accounts"][0]
    _post(
        client,
        "/transactions",
        {"type": "income", "amount_cents": 1, "date": "2026-10-01", "account_id": account["id"]},
    )
    assert client.delete(f"{BASE}/accounts/{account['id']}").status_code == 409


def test_bank_with_accounts_cannot_be_deleted(client) -> None:
    bank = _post(client, "/banks", {"name": "B"})
    assert client.delete(f"{BASE}/banks/{bank['id']}").status_code == 409


def test_bank_rename_recomputes_logo(client) -> None:
    bank = _post(client, "/banks", {"name": "Nubank"})
    renamed = client.patch(f"{BASE}/banks/{bank['id']}", json={"name": "Caixa"})
    assert renamed.json()["logo_key"] == "caixa"


def test_yield_endpoints(client) -> None:
    bank = _post(client, "/banks", {"name": "B"})
    account = bank["accounts"][0]
    savings = _post(
        client,
        "/accounts",
        {"bank_id": bank["id"], "name": "Cofre", "kind": "savings", "opening_cents": 100_000},
    )
    response = client.put(
        f"{BASE}/accounts/{savings['id']}/yield",
        json={"month": "2026-09", "amount_cents": 1_000},
    )
    assert response.json()["pct"] == 1.0
    history = client.get(f"{BASE}/accounts/{savings['id']}/yield").json()["history"]
    assert len(history) == 1


def test_overview_accepts_a_month_param(client) -> None:
    bank = _post(client, "/banks", {"name": "B"})
    account = bank["accounts"][0]
    _post(
        client,
        "/transactions",
        {"type": "income", "amount_cents": 100, "date": "2026-09-01", "account_id": account["id"]},
    )
    overview = client.get(f"{BASE}/overview?month=2026-09").json()
    assert overview["month"] == "2026-09"
    assert overview["banks"][0]["accounts"][0]["month"]["income_cents"] == 100
    other_month = client.get(f"{BASE}/overview?month=2026-10").json()
    assert other_month["banks"][0]["accounts"][0]["month"]["income_cents"] == 0


def test_finances_api_is_served_by_the_real_app(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PHI_HOME", str(tmp_path / "home"))
    from phi.server.app import create_app

    engine = SimpleNamespace(engine_id="fake", health=lambda: True)
    real = TestClient(create_app(engine, "fake"))
    created = real.post(f"{BASE}/banks", json={"name": "Me"})
    assert created.status_code == 201
    assert (tmp_path / "home" / "finances.db").exists()
