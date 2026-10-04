"""Numbers behind the finance charts and the overview screen.

Only real income and expenses are counted. Transfers, credit-card invoice
payments (the purchases were already counted) and savings yield are kept out
of income/expense and reported on their own line.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from phi.finances.store import FinanceError, FinanceStore, parse_month


def _period(year: int, month: Optional[str]) -> tuple[str, str]:
    """Inclusive date range for a whole year, or for one ``YYYY-MM``."""
    if month:
        month = parse_month(month)
        return f"{month}-01", f"{month}-31"
    return f"{year:04d}-01-01", f"{year:04d}-12-31"


def _totals(
    store: FinanceStore, start: str, end: str, account_id: Optional[str] = None
) -> Dict[str, int]:
    sql = (
        "SELECT type, COALESCE(SUM(amount_cents), 0) AS total FROM transactions "
        "WHERE date >= ? AND date <= ? AND type IN ('income', 'expense', 'yield')"
    )
    args: List[Any] = [start, end]
    if account_id:
        sql += " AND account_id = ?"
        args.append(account_id)
    rows = store._conn.execute(sql + " GROUP BY type", args).fetchall()
    found = {r["type"]: r["total"] for r in rows}
    income, expense, gain = (found.get(k, 0) for k in ("income", "expense", "yield"))
    return {
        "income_cents": income,
        "expense_cents": expense,
        "yield_cents": gain,
        "net_cents": income - expense,
    }


def summary(store: FinanceStore, *, year: int, month: Optional[str] = None) -> Dict[str, Any]:
    """Totals for a year, or for one month when *month* is given."""
    store.extend_recurring()
    with store._lock:
        start, end = _period(year, month)
        return {"start": start, "end": end, **_totals(store, start, end)}


def monthly_series(store: FinanceStore, *, year: int) -> List[Dict[str, Any]]:
    """Twelve months of income / expense / yield / net (bar or line chart)."""
    store.extend_recurring()
    with store._lock:
        series = []
        for number in range(1, 13):
            month = f"{year:04d}-{number:02d}"
            start, end = _period(year, month)
            series.append({"month": month, **_totals(store, start, end)})
        return series


def yearly_series(store: FinanceStore) -> List[Dict[str, Any]]:
    """One row per year that has data."""
    store.extend_recurring()
    with store._lock:
        years = [
            int(r[0])
            for r in store._conn.execute(
                "SELECT DISTINCT substr(date, 1, 4) FROM transactions "
                "WHERE type IN ('income', 'expense', 'yield') ORDER BY 1"
            )
        ]
        out = []
        for year in years:
            start, end = _period(year, None)
            out.append({"year": year, **_totals(store, start, end)})
        return out


def by_category(
    store: FinanceStore,
    *,
    year: int,
    month: Optional[str] = None,
    type: str = "expense",
) -> Dict[str, Any]:
    """Pie-chart data: totals per top-level category, each with its
    subcategories. Uncategorised entries appear as "Uncategorized"."""
    if type not in ("expense", "income"):
        raise FinanceError("type must be expense or income")
    store.extend_recurring()
    with store._lock:
        start, end = _period(year, month)
        sql = (
            "SELECT category_id, SUM(amount_cents) AS total FROM transactions "
            "WHERE type = ? AND date >= ? AND date <= ?"
        )
        args: List[Any] = [type, start, end]
        rows = store._conn.execute(sql + " GROUP BY category_id", args).fetchall()
        names = {
            r["id"]: (r["name"], r["parent_id"])
            for r in store._conn.execute("SELECT * FROM categories")
        }
        groups: Dict[Optional[str], Dict[str, Any]] = {}
        for row in rows:
            cid = row["category_id"]
            name, parent = names.get(cid, ("Uncategorized", None))
            top_id = parent or cid
            top_name = names[top_id][0] if top_id in names else "Uncategorized"
            group = groups.setdefault(
                top_id,
                {
                    "category_id": top_id,
                    "name": top_name,
                    "total_cents": 0,
                    "children": [],
                },
            )
            group["total_cents"] += row["total"]
            if parent:
                group["children"].append(
                    {"category_id": cid, "name": name, "total_cents": row["total"]}
                )
        total = sum(g["total_cents"] for g in groups.values())
        items = sorted(groups.values(), key=lambda g: -g["total_cents"])
        for item in items:
            item["share_pct"] = round(item["total_cents"] / total * 100, 1) if total else 0.0
            item["children"].sort(key=lambda c: -c["total_cents"])
        return {"type": type, "total_cents": total, "categories": items}


def overview(store: FinanceStore, *, month: Optional[str] = None) -> Dict[str, Any]:
    """Home screen: every Bank with its nested Accounts (balances always "as
    of now"; income/expense are for *month*, default this month) and every
    Card with its current invoice."""
    store.extend_recurring()
    month = parse_month(month) if month else store.today().strftime("%Y-%m")
    start, end = _period(0, month)
    banks = []
    for bank in store.list_banks():
        accounts = []
        for account in bank["accounts"]:
            accounts.append(
                {**account, "month": _totals(store, start, end, account["id"])}
            )
        banks.append({**bank, "accounts": accounts})
    cards = []
    for card in store.list_cards():
        unpaid = [
            i for i in reversed(store.list_invoices(card["id"])) if i["status"] != "paid"
        ]
        if unpaid:
            invoice = unpaid[0]
        else:
            invoice_month = store.invoice_month_for(card, store.today())
            invoice = store.get_invoice(card["id"], invoice_month)
            invoice.pop("transactions")
        cards.append({**card, "current_invoice": invoice})
    return {"month": month, "banks": banks, "cards": cards}
