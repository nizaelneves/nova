"""HTTP routes for finances: ``/api/finances/*``."""

from __future__ import annotations

from datetime import date
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from phibe.finances import calc
from phibe.finances.store import FinanceError, FinanceStore, NotFound


class AccountBody(BaseModel):
    name: str = ""
    icon: Optional[str] = None
    opening: int = 0


class CardBody(BaseModel):
    accountId: str = ""
    name: str = ""
    mode: str = ""
    limit: int = 0
    dueDay: int = 1
    closeDaysBefore: int = 0


class CategoryBody(BaseModel):
    name: str = ""
    kind: str = ""
    color: str = ""
    icon: str = ""
    parentId: Optional[str] = None


class GoalBody(BaseModel):
    name: str = ""
    target: int = 0
    color: str = ""


class TransactionBody(BaseModel):
    date: str = ""
    description: str = ""
    categoryId: str = ""
    kind: str = ""
    amount: int = 0
    accountId: Optional[str] = None
    toAccountId: Optional[str] = None
    method: str = "pix"
    cardId: Optional[str] = None
    goalId: Optional[str] = None


class ImportBody(BaseModel):
    accounts: List[Dict[str, Any]] = []
    cards: List[Dict[str, Any]] = []
    categories: List[Dict[str, Any]] = []
    goals: List[Dict[str, Any]] = []
    transactions: List[Dict[str, Any]] = []


def create_finances_router(get_store: Callable[[], FinanceStore]) -> APIRouter:
    """Build the router; *get_store* returns the shared :class:`FinanceStore`."""
    router = APIRouter(prefix="/api/finances", tags=["finances"])

    def guarded(action: Callable[[], Any]) -> Any:
        try:
            return action()
        except NotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except FinanceError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    def today_or(value: Optional[str]) -> str:
        return value or date.today().isoformat()

    # -- reads, with the numbers worked out here -----------------------------------

    @router.get("/state")
    def state(today: Optional[str] = None) -> Dict[str, Any]:
        store, now = get_store(), today_or(today)
        txs = store.transactions()
        accounts = [{**a, "balance": calc.account_balance(a, txs, now)} for a in store.accounts()]
        cards = [
            {**c, "used": calc.card_used(c, txs, now), "cycle": calc.card_cycle(c, now)}
            for c in store.cards()
        ]
        goals = [
            {**g, "saved": calc.goal_saved(txs, g["id"]), "monthsLeft": calc.months_left(g, txs, now)}
            for g in store.goals()
        ]
        return {"accounts": accounts, "cards": cards, "categories": store.categories(), "goals": goals}

    @router.get("/overview")
    def overview(
        start: str = Query(alias="from"),
        end: str = Query(alias="to"),
        preset: str = "custom",
    ) -> Dict[str, Any]:
        store = get_store()
        txs, accounts = store.transactions(), store.accounts()
        prev_start, prev_end = calc.previous_range(preset, start, end)
        now, before = calc.totals(txs, start, end), calc.totals(txs, prev_start, prev_end)
        balance = calc.total_balance(accounts, txs, end)
        balance_before = calc.total_balance(accounts, txs, prev_end)
        return {
            "totals": now,
            "previous": before,
            "deltas": {
                "balance": calc.delta_pct(balance, balance_before),
                "income": calc.delta_pct(now["income"], before["income"]),
                "expenses": calc.delta_pct(now["expenses"], before["expenses"]),
                "savings": calc.delta_pct(now["savings"], before["savings"]),
            },
            "balance": balance,
            "breakdown": calc.expense_breakdown(txs, store.categories(), start, end),
            "series": calc.monthly_series(txs, end),
        }

    @router.get("/transactions")
    def transactions(
        start: Optional[str] = Query(None, alias="from"),
        end: Optional[str] = Query(None, alias="to"),
        kind: Optional[str] = None,
        q: Optional[str] = None,
    ) -> Dict[str, Any]:
        return {"transactions": get_store().transactions(start, end, kind, q)}

    @router.get("/category-totals")
    def category_totals(kind: str, start: str = Query(alias="from"), end: str = Query(alias="to")) -> Dict[str, Any]:
        store = get_store()
        return {"totals": calc.category_totals(store.transactions(), store.categories(), kind, start, end)}

    # -- writes ------------------------------------------------------------------------

    @router.post("/accounts", status_code=201)
    def add_account(body: AccountBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().save_account(body.model_dump()))

    @router.put("/accounts/{item_id}")
    def edit_account(item_id: str, body: AccountBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().save_account({**body.model_dump(), "id": item_id}))

    @router.delete("/accounts/{item_id}", status_code=204)
    def remove_account(item_id: str) -> None:
        guarded(lambda: get_store().delete_account(item_id))

    @router.post("/cards", status_code=201)
    def add_card(body: CardBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().save_card(body.model_dump()))

    @router.put("/cards/{item_id}")
    def edit_card(item_id: str, body: CardBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().save_card({**body.model_dump(), "id": item_id}))

    @router.delete("/cards/{item_id}", status_code=204)
    def remove_card(item_id: str) -> None:
        guarded(lambda: get_store().delete_card(item_id))

    @router.post("/categories", status_code=201)
    def add_category(body: CategoryBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().save_category(body.model_dump()))

    @router.put("/categories/{item_id}")
    def edit_category(item_id: str, body: CategoryBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().save_category({**body.model_dump(), "id": item_id}))

    @router.delete("/categories/{item_id}", status_code=204)
    def remove_category(item_id: str) -> None:
        guarded(lambda: get_store().delete_category(item_id))

    @router.post("/goals", status_code=201)
    def add_goal(body: GoalBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().save_goal(body.model_dump()))

    @router.put("/goals/{item_id}")
    def edit_goal(item_id: str, body: GoalBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().save_goal({**body.model_dump(), "id": item_id}))

    @router.delete("/goals/{item_id}", status_code=204)
    def remove_goal(item_id: str) -> None:
        guarded(lambda: get_store().delete_goal(item_id))

    @router.post("/transactions", status_code=201)
    def add_transaction(body: TransactionBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().save_transaction(body.model_dump()))

    @router.put("/transactions/{item_id}")
    def edit_transaction(item_id: str, body: TransactionBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().save_transaction({**body.model_dump(), "id": item_id}))

    @router.delete("/transactions/{item_id}", status_code=204)
    def remove_transaction(item_id: str) -> None:
        guarded(lambda: get_store().delete_transaction(item_id))

    @router.post("/import")
    def import_state(body: ImportBody) -> Dict[str, int]:
        return guarded(lambda: get_store().import_state(body.model_dump()))

    return router


def get_shared_finance_store(app: Any) -> FinanceStore:
    """Open the finances database on first use and keep it on ``app.state``."""
    store = getattr(app.state, "finance_store", None)
    if store is None:
        from phibe.core.paths import get_data_dir

        folder = get_data_dir()
        folder.mkdir(parents=True, exist_ok=True)
        store = FinanceStore(folder / "finance.db")
        app.state.finance_store = store
    return store
