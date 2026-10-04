"""HTTP routes for finances: ``/api/finances/*``. Amounts are in centavos."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from phi.finances import reports
from phi.finances.store import FinanceError, FinanceStore, InUse, NotFound
from phi.server.tasks_routes import RecurrenceBody


class BankBody(BaseModel):
    name: str
    first_account_name: Optional[str] = None


class NameBody(BaseModel):
    name: str


class AccountBody(BaseModel):
    bank_id: str
    name: str
    kind: Literal["bank", "savings"] = "bank"
    opening_cents: int = 0


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    opening_cents: Optional[int] = None


class CardBody(BaseModel):
    name: str
    closing_day: int
    due_day: int


class CategoryBody(BaseModel):
    name: str
    parent_id: Optional[str] = None


class TransactionBody(BaseModel):
    type: Literal["expense", "income", "transfer"]
    amount_cents: int
    date: str
    account_id: Optional[str] = None
    card_id: Optional[str] = None
    to_account_id: Optional[str] = None
    category_id: Optional[str] = None
    description: str = ""
    installments: Optional[int] = None
    recurrence: Optional[RecurrenceBody] = None
    invoice_month: Optional[str] = None


class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    category_id: Optional[str] = None
    amount_cents: Optional[int] = None
    date: Optional[str] = None
    invoice_month: Optional[str] = None


class PayInvoiceBody(BaseModel):
    account_id: str
    paid_on: Optional[str] = None


class YieldBody(BaseModel):
    month: str
    amount_cents: int


def create_finances_router(get_store: Callable[[], FinanceStore]) -> APIRouter:
    router = APIRouter(prefix="/api/finances", tags=["finances"])

    def guarded(action: Callable[[], Any]) -> Any:
        try:
            return action()
        except InUse as exc:
            raise HTTPException(
                status_code=409, detail={"message": str(exc), "count": exc.count}
            ) from exc
        except NotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except FinanceError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    # -- banks ----------------------------------------------------------------

    @router.get("/banks")
    def list_banks() -> Dict[str, Any]:
        return {"banks": get_store().list_banks()}

    @router.post("/banks", status_code=201)
    def create_bank(body: BankBody) -> Dict[str, Any]:
        return guarded(
            lambda: get_store().create_bank(body.name, body.first_account_name)
        )

    @router.patch("/banks/{bank_id}")
    def rename_bank(bank_id: str, body: NameBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().rename_bank(bank_id, body.name))

    @router.delete("/banks/{bank_id}", status_code=204)
    def delete_bank(bank_id: str) -> None:
        guarded(lambda: get_store().delete_bank(bank_id))

    # -- accounts (bank-nested balances) --------------------------------------

    @router.get("/accounts")
    def list_accounts(bank_id: Optional[str] = None) -> Dict[str, Any]:
        return {"accounts": get_store().list_accounts(bank_id)}

    @router.post("/accounts", status_code=201)
    def create_account(body: AccountBody) -> Dict[str, Any]:
        return guarded(
            lambda: get_store().create_account(
                body.bank_id, body.name, body.kind, body.opening_cents
            )
        )

    @router.patch("/accounts/{account_id}")
    def update_account(account_id: str, body: AccountUpdate) -> Dict[str, Any]:
        return guarded(
            lambda: get_store().update_account(
                account_id, name=body.name, opening_cents=body.opening_cents
            )
        )

    @router.delete("/accounts/{account_id}", status_code=204)
    def delete_account(account_id: str) -> None:
        guarded(lambda: get_store().delete_account(account_id))

    @router.get("/accounts/{account_id}/yield")
    def yield_history(account_id: str) -> Dict[str, Any]:
        return {"history": guarded(lambda: get_store().yield_history(account_id))}

    @router.put("/accounts/{account_id}/yield")
    def record_yield(account_id: str, body: YieldBody) -> Dict[str, Any]:
        return guarded(
            lambda: get_store().record_yield(
                account_id, body.month, body.amount_cents
            )
        )

    # -- cards and invoices -------------------------------------------------

    @router.get("/cards")
    def list_cards() -> Dict[str, Any]:
        return {"cards": get_store().list_cards()}

    @router.post("/cards", status_code=201)
    def create_card(body: CardBody) -> Dict[str, Any]:
        return guarded(
            lambda: get_store().create_card(body.name, body.closing_day, body.due_day)
        )

    @router.patch("/cards/{card_id}")
    def update_card(card_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
        return guarded(lambda: get_store().update_card(card_id, **body))

    @router.delete("/cards/{card_id}", status_code=204)
    def delete_card(card_id: str) -> None:
        guarded(lambda: get_store().delete_card(card_id))

    @router.get("/cards/{card_id}/invoices")
    def list_invoices(card_id: str) -> Dict[str, Any]:
        return {"invoices": guarded(lambda: get_store().list_invoices(card_id))}

    @router.get("/cards/{card_id}/invoices/{month}")
    def get_invoice(card_id: str, month: str) -> Dict[str, Any]:
        return guarded(lambda: get_store().get_invoice(card_id, month))

    @router.post("/cards/{card_id}/invoices/{month}/pay")
    def pay_invoice(card_id: str, month: str, body: PayInvoiceBody) -> Dict[str, Any]:
        return guarded(
            lambda: get_store().pay_invoice(
                card_id, month, body.account_id, paid_on=body.paid_on
            )
        )

    @router.post("/cards/{card_id}/invoices/{month}/unpay")
    def unpay_invoice(card_id: str, month: str) -> Dict[str, Any]:
        return guarded(lambda: get_store().unpay_invoice(card_id, month))

    # -- categories ---------------------------------------------------------

    @router.get("/categories")
    def list_categories() -> Dict[str, Any]:
        return {"categories": get_store().list_categories()}

    @router.post("/categories", status_code=201)
    def create_category(body: CategoryBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().create_category(body.name, body.parent_id))

    @router.patch("/categories/{category_id}")
    def rename_category(category_id: str, body: NameBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().rename_category(category_id, body.name))

    @router.delete("/categories/{category_id}", status_code=204)
    def delete_category(category_id: str, move_to: Optional[str] = None) -> None:
        guarded(lambda: get_store().delete_category(category_id, move_to))

    # -- transactions -------------------------------------------------------

    @router.get("/transactions")
    def list_transactions(
        account_id: Optional[str] = None,
        card_id: Optional[str] = None,
        category_id: Optional[str] = None,
        type: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: int = 500,
    ) -> Dict[str, Any]:
        found: List[Dict[str, Any]] = guarded(
            lambda: get_store().list_transactions(
                account_id=account_id,
                card_id=card_id,
                category_id=category_id,
                type=type,
                start=start,
                end=end,
                limit=limit,
            )
        )
        return {"transactions": found}

    @router.post("/transactions", status_code=201)
    def create_transaction(body: TransactionBody) -> Dict[str, Any]:
        rule = (
            body.recurrence.model_dump(exclude_none=True) if body.recurrence else None
        )
        created = guarded(
            lambda: get_store().create_transaction(
                type=body.type,
                amount_cents=body.amount_cents,
                date=body.date,
                account_id=body.account_id,
                card_id=body.card_id,
                to_account_id=body.to_account_id,
                category_id=body.category_id,
                description=body.description,
                installments=body.installments,
                recurrence=rule,
                invoice_month=body.invoice_month,
            )
        )
        return {"transactions": created}

    @router.get("/transactions/{tx_id}")
    def get_transaction(tx_id: str) -> Dict[str, Any]:
        return guarded(lambda: get_store().get_transaction(tx_id))

    @router.patch("/transactions/{tx_id}")
    def update_transaction(
        tx_id: str, body: TransactionUpdate, scope: Literal["one", "future"] = "one"
    ) -> Dict[str, Any]:
        changes = body.model_dump(exclude_unset=True)
        return guarded(
            lambda: get_store().update_transaction(tx_id, scope=scope, **changes)
        )

    @router.delete("/transactions/{tx_id}")
    def delete_transaction(
        tx_id: str, scope: Literal["one", "future", "all"] = "one"
    ) -> Dict[str, int]:
        return {
            "removed": guarded(
                lambda: get_store().delete_transaction(tx_id, scope=scope)
            )
        }

    # -- reports ------------------------------------------------------------

    @router.get("/overview")
    def overview(month: Optional[str] = None) -> Dict[str, Any]:
        return guarded(lambda: reports.overview(get_store(), month=month))

    @router.get("/reports/summary")
    def summary(year: int, month: Optional[str] = None) -> Dict[str, Any]:
        return guarded(lambda: reports.summary(get_store(), year=year, month=month))

    @router.get("/reports/monthly")
    def monthly(year: int) -> Dict[str, Any]:
        return {"series": reports.monthly_series(get_store(), year=year)}

    @router.get("/reports/yearly")
    def yearly() -> Dict[str, Any]:
        return {"series": reports.yearly_series(get_store())}

    @router.get("/reports/categories")
    def categories_report(
        year: int,
        month: Optional[str] = None,
        type: Literal["expense", "income"] = "expense",
    ) -> Dict[str, Any]:
        return guarded(
            lambda: reports.by_category(get_store(), year=year, month=month, type=type)
        )

    return router


def get_shared_finance_store(app: Any) -> FinanceStore:
    """Open the finances database on first use and keep it on ``app.state``."""
    store = getattr(app.state, "finance_store", None)
    if store is None:
        from phi.core.paths import get_data_dir

        folder = get_data_dir()
        folder.mkdir(parents=True, exist_ok=True)
        store = FinanceStore(folder / "finances.db")
        app.state.finance_store = store
    return store
