"""SQLite storage and rules for Phibe's finances.

Rows are served as plain dicts with camelCase keys (the shape the app uses),
and amounts are integer cents. The store checks every rule that touches money:
which methods need a card, what a transfer is, what a goal deposit is.
"""

from __future__ import annotations

import sqlite3
import threading
import uuid
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

KINDS = ("income", "expense", "savings", "transfer")
METHODS = ("cash", "pix", "debit", "credit")
CARD_MODES = ("credit", "debit", "both")

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, logo_key TEXT,
    opening INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
    name TEXT NOT NULL, mode TEXT NOT NULL, credit_limit INTEGER NOT NULL DEFAULT 0,
    due_day INTEGER NOT NULL, close_days_before INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, color TEXT NOT NULL,
    icon TEXT NOT NULL, parent_id TEXT, position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, target INTEGER NOT NULL, color TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, description TEXT NOT NULL,
    category_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, amount INTEGER NOT NULL,
    account_id TEXT NOT NULL, to_account_id TEXT, method TEXT NOT NULL,
    card_id TEXT, goal_id TEXT
);
CREATE INDEX IF NOT EXISTS tx_date ON transactions (date);
"""

# (id, name, icon, color, subcategory names in A-Z order): what every new user starts with.
_EXPENSE = [
    ("food", "Food", "cart-large-2", "#20e7aa", ["Groceries", "Junk Food", "Restaurants", "Supermarket"]),
    ("transport", "Transport", "bus", "#10c3d3", ["Car Maintenance", "Fuel", "Parking"]),
    ("bills", "Payments", "bill-list", "#a78bfa", ["Bills", "Loans", "People", "Subscriptions", "Taxes"]),
    ("health", "Health", "heart-pulse", "#f472a6", ["Gym", "Health Insurance", "Hospital", "Martial Arts Gym", "Medicine"]),
    ("shopping", "Shopping", "bag-smile", "#f6c38f", []),
    ("leisure", "Leisure", "gamepad-minimalistic", "#fb923c", []),
    ("education", "Education", "book-2", "#38bdf8", ["Books", "Courses"]),
    ("pets", "Pets", "paw", "#fbbf24", []),
]
_INCOME = [
    ("salary", "Salary", "banknote-2", "#20e7aa", []),
    ("freelance", "Freelance", "case-minimalistic", "#10c3d3", []),
    ("investments", "Investments", "hand-money", "#f6c38f", []),
]


def default_categories() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for kind, defs in (("expense", _EXPENSE), ("income", _INCOME)):
        for cid, name, icon, color, subs in defs:
            out.append({"id": cid, "name": name, "kind": kind, "color": color, "icon": icon, "parentId": None})
            for sname in subs:
                out.append({"id": f"{cid}-{sname.lower().replace(' ', '-')}", "name": sname, "kind": kind, "color": color, "icon": icon, "parentId": cid})
    return out


def match_logo_key(name: str) -> Optional[str]:
    """Pick a bundled bank logo from an account name, most specific first."""
    n = (name or "").lower()
    if "santander" in n and "empresas" in n:
        return "santander_empresas"
    for key in ("santander", "c6", "caixa"):
        if key in n:
            return key
    return None


class FinanceError(ValueError):
    """The request breaks a finance rule (bad field, unknown id...)."""


class NotFound(FinanceError):
    """No row has that id."""


def _need(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise FinanceError(f"{label} is required")
    if len(text) > 120:
        raise FinanceError(f"{label} is too long")
    return text


def _int(value: Any, label: str, low: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < low:
        raise FinanceError(f"{label} must be a whole number of at least {low}")
    return value


class FinanceStore:
    def __init__(self, path: Path) -> None:
        self._lock = threading.RLock()
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.executescript(_SCHEMA)
            # Seed once: a user who deletes every category must not get them back.
            if not self._db.execute("SELECT 1 FROM meta WHERE key='seeded'").fetchone():
                self._insert_categories(default_categories())
                self._db.execute("INSERT INTO meta VALUES ('seeded', '1')")
            self._db.commit()

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # -- reads ------------------------------------------------------------------

    def accounts(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM accounts ORDER BY position").fetchall()
        return [
            {"id": r["id"], "name": r["name"], "icon": r["icon"], "logoKey": r["logo_key"], "opening": r["opening"]}
            for r in rows
        ]

    def cards(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM cards ORDER BY rowid").fetchall()
        return [
            {
                "id": r["id"], "accountId": r["account_id"], "name": r["name"], "mode": r["mode"],
                "limit": r["credit_limit"], "dueDay": r["due_day"], "closeDaysBefore": r["close_days_before"],
            }
            for r in rows
        ]

    def categories(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM categories ORDER BY position").fetchall()
        return [
            {"id": r["id"], "name": r["name"], "kind": r["kind"], "color": r["color"], "icon": r["icon"], "parentId": r["parent_id"]}
            for r in rows
        ]

    def goals(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM goals ORDER BY position").fetchall()
        return [{"id": r["id"], "name": r["name"], "target": r["target"], "color": r["color"]} for r in rows]

    @staticmethod
    def _tx(r: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": r["id"], "date": r["date"], "description": r["description"], "categoryId": r["category_id"],
            "kind": r["kind"], "amount": r["amount"], "accountId": r["account_id"], "toAccountId": r["to_account_id"],
            "method": r["method"], "cardId": r["card_id"], "goalId": r["goal_id"],
        }

    def transactions(
        self,
        start: Optional[str] = None,
        end: Optional[str] = None,
        kind: Optional[str] = None,
        query: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        sql, args = "SELECT * FROM transactions WHERE 1=1", []
        if start:
            sql, args = sql + " AND date >= ?", args + [start]
        if end:
            sql, args = sql + " AND date <= ?", args + [end]
        if kind:
            sql, args = sql + " AND kind = ?", args + [kind]
        if query:
            sql, args = sql + " AND description LIKE ?", args + [f"%{query}%"]
        sql += " ORDER BY date DESC, rowid DESC"
        with self._lock:
            return [self._tx(r) for r in self._db.execute(sql, args).fetchall()]

    def is_empty(self) -> bool:
        with self._lock:
            return not any(
                self._db.execute(f"SELECT 1 FROM {t} LIMIT 1").fetchone()
                for t in ("accounts", "cards", "goals", "transactions")
            )

    # -- accounts ----------------------------------------------------------------

    def save_account(self, data: Dict[str, Any]) -> Dict[str, Any]:
        name = _need(data.get("name"), "Account name")
        opening = data.get("opening", 0)
        if isinstance(opening, bool) or not isinstance(opening, int):
            raise FinanceError("Opening balance must be a whole number of cents")
        icon = data.get("icon") or None
        with self._lock:
            account_id = data.get("id")
            if account_id and self._exists("accounts", account_id):
                self._db.execute(
                    "UPDATE accounts SET name=?, icon=?, logo_key=?, opening=? WHERE id=?",
                    (name, icon, match_logo_key(name), opening, account_id),
                )
            else:
                account_id = account_id or uuid.uuid4().hex
                pos = self._db.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM accounts").fetchone()[0]
                self._db.execute(
                    "INSERT INTO accounts VALUES (?,?,?,?,?,?)",
                    (account_id, name, icon, match_logo_key(name), opening, pos),
                )
            self._db.commit()
        return next(a for a in self.accounts() if a["id"] == account_id)

    def delete_account(self, account_id: str) -> None:
        """Also deletes the account's cards and everything recorded on it."""
        with self._lock:
            self._require("accounts", account_id, "Account")
            card_ids = [r[0] for r in self._db.execute("SELECT id FROM cards WHERE account_id=?", (account_id,))]
            self._db.execute(
                "DELETE FROM transactions WHERE account_id=? OR to_account_id=?", (account_id, account_id)
            )
            for cid in card_ids:
                self._db.execute("DELETE FROM transactions WHERE card_id=?", (cid,))
            self._db.execute("DELETE FROM cards WHERE account_id=?", (account_id,))
            self._db.execute("DELETE FROM accounts WHERE id=?", (account_id,))
            self._db.commit()

    # -- cards ---------------------------------------------------------------------

    def save_card(self, data: Dict[str, Any]) -> Dict[str, Any]:
        name = _need(data.get("name"), "Card name")
        mode = data.get("mode")
        if mode not in CARD_MODES:
            raise FinanceError("Card must work as credit, debit or both")
        credit = mode != "debit"
        limit = _int(data.get("limit", 0), "Credit limit")
        if credit and limit <= 0:
            raise FinanceError("A credit card needs a credit limit")
        due = _int(data.get("dueDay", 1), "Due day", 1)
        before = _int(data.get("closeDaysBefore", 0), "Closing offset")
        if due > 31 or before > 28:
            raise FinanceError("Due day is 1 to 31 and the closing offset 0 to 28 days")
        with self._lock:
            self._require("accounts", data.get("accountId"), "Account")
            card_id = data.get("id")
            row = (name, data["accountId"], mode, limit if credit else 0, due, before)
            if card_id and self._exists("cards", card_id):
                self._db.execute(
                    "UPDATE cards SET name=?, account_id=?, mode=?, credit_limit=?, due_day=?, close_days_before=? WHERE id=?",
                    row + (card_id,),
                )
            else:
                card_id = card_id or uuid.uuid4().hex
                self._db.execute(
                    "INSERT INTO cards (name, account_id, mode, credit_limit, due_day, close_days_before, id) VALUES (?,?,?,?,?,?,?)",
                    row + (card_id,),
                )
            self._db.commit()
        return next(c for c in self.cards() if c["id"] == card_id)

    def delete_card(self, card_id: str) -> None:
        """Also deletes the card's transactions."""
        with self._lock:
            self._require("cards", card_id, "Card")
            self._db.execute("DELETE FROM transactions WHERE card_id=?", (card_id,))
            self._db.execute("DELETE FROM cards WHERE id=?", (card_id,))
            self._db.commit()

    # -- categories --------------------------------------------------------------------

    def save_category(self, data: Dict[str, Any]) -> Dict[str, Any]:
        name = _need(data.get("name"), "Category name")
        kind = data.get("kind")
        if kind not in ("income", "expense"):
            raise FinanceError("A category is for income or expense")
        color = _need(data.get("color"), "Color")
        icon = _need(data.get("icon"), "Icon")
        parent = data.get("parentId") or None
        with self._lock:
            cat_id = data.get("id")
            if parent:
                row = self._db.execute("SELECT * FROM categories WHERE id=?", (parent,)).fetchone()
                if row is None:
                    raise NotFound("Parent category not found")
                if row["parent_id"] or parent == cat_id:
                    raise FinanceError("A subcategory cannot hold other subcategories")
                if row["kind"] != kind:
                    raise FinanceError("A subcategory must be the same kind as its parent")
                if cat_id and self._db.execute("SELECT 1 FROM categories WHERE parent_id=?", (cat_id,)).fetchone():
                    raise FinanceError("A category with subcategories cannot move inside another")
            if cat_id and self._exists("categories", cat_id):
                self._db.execute(
                    "UPDATE categories SET name=?, kind=?, color=?, icon=?, parent_id=? WHERE id=?",
                    (name, kind, color, icon, parent, cat_id),
                )
            else:
                cat_id = cat_id or uuid.uuid4().hex
                pos = self._db.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM categories").fetchone()[0]
                self._db.execute(
                    "INSERT INTO categories VALUES (?,?,?,?,?,?,?)", (cat_id, name, kind, color, icon, parent, pos)
                )
            self._db.commit()
        return next(c for c in self.categories() if c["id"] == cat_id)

    def delete_category(self, category_id: str) -> None:
        """A subcategory hands its transactions to its parent; a general category takes
        its subcategories with it and leaves its transactions uncategorized."""
        with self._lock:
            row = self._db.execute("SELECT * FROM categories WHERE id=?", (category_id,)).fetchone()
            if row is None:
                raise NotFound("Category not found")
            subs = [r[0] for r in self._db.execute("SELECT id FROM categories WHERE parent_id=?", (category_id,))]
            target = row["parent_id"] or ""
            for gone in [category_id, *subs]:
                self._db.execute("UPDATE transactions SET category_id=? WHERE category_id=?", (target, gone))
                self._db.execute("DELETE FROM categories WHERE id=?", (gone,))
            self._db.commit()

    # -- goals --------------------------------------------------------------------------

    def save_goal(self, data: Dict[str, Any]) -> Dict[str, Any]:
        name = _need(data.get("name"), "Goal name")
        target = _int(data.get("target"), "Target", 1)
        color = _need(data.get("color"), "Color")
        with self._lock:
            goal_id = data.get("id")
            if goal_id and self._exists("goals", goal_id):
                self._db.execute("UPDATE goals SET name=?, target=?, color=? WHERE id=?", (name, target, color, goal_id))
            else:
                goal_id = goal_id or uuid.uuid4().hex
                pos = self._db.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM goals").fetchone()[0]
                self._db.execute("INSERT INTO goals VALUES (?,?,?,?,?)", (goal_id, name, target, color, pos))
            self._db.commit()
        return next(g for g in self.goals() if g["id"] == goal_id)

    def delete_goal(self, goal_id: str) -> None:
        """Also deletes the goal's deposits, so that money goes back to the accounts."""
        with self._lock:
            self._require("goals", goal_id, "Goal")
            self._db.execute("DELETE FROM transactions WHERE goal_id=?", (goal_id,))
            self._db.execute("DELETE FROM goals WHERE id=?", (goal_id,))
            self._db.commit()

    # -- transactions ---------------------------------------------------------------------

    def save_transaction(self, data: Dict[str, Any]) -> Dict[str, Any]:
        kind = data.get("kind")
        if kind not in KINDS:
            raise FinanceError("Unknown transaction kind")
        amount = _int(data.get("amount"), "Amount", 1)
        try:
            when = date.fromisoformat(str(data.get("date")))
        except ValueError as exc:
            raise FinanceError("Date must look like YYYY-MM-DD") from exc
        method = data.get("method", "pix")
        if method not in METHODS:
            raise FinanceError("Unknown payment method")
        description = str(data.get("description") or "").strip()
        account_id = data.get("accountId")
        to_account = card_id = goal_id = None
        category_id = ""

        with self._lock:
            if kind == "transfer":
                to_account = data.get("toAccountId")
                self._require("accounts", account_id, "Source account")
                self._require("accounts", to_account, "Destination account")
                if account_id == to_account:
                    raise FinanceError("A transfer needs two different accounts")
                method, description = "pix", description or "Transfer"
            elif kind == "savings":
                goal_id = data.get("goalId")
                self._require("goals", goal_id, "Goal")
                self._require("accounts", account_id, "Account")
                description = description or "Savings deposit"
            else:
                description = _need(description, "Description")
                category_id = data.get("categoryId") or ""
                if category_id:
                    row = self._db.execute("SELECT kind FROM categories WHERE id=?", (category_id,)).fetchone()
                    if row is None:
                        raise NotFound("Category not found")
                    if row["kind"] != kind:
                        raise FinanceError("That category is for the other kind of transaction")
                if method in ("debit", "credit"):
                    if kind == "income" and method == "credit":
                        raise FinanceError("Income cannot go on credit")
                    card_id = data.get("cardId")
                    card = self._db.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone()
                    if card is None:
                        raise FinanceError("Debit and credit need a card")
                    needed = "credit" if method == "credit" else "debit"
                    if card["mode"] not in (needed, "both"):
                        raise FinanceError(f"That card does not work as {needed}")
                    account_id = card["account_id"]  # debit spends from the card's account
                else:
                    self._require("accounts", account_id, "Account")

            tx_id = data.get("id")
            values = (when.isoformat(), description, category_id, kind, amount, account_id, to_account, method, card_id, goal_id)
            if tx_id and self._exists("transactions", tx_id):
                self._db.execute(
                    "UPDATE transactions SET date=?, description=?, category_id=?, kind=?, amount=?, account_id=?, "
                    "to_account_id=?, method=?, card_id=?, goal_id=? WHERE id=?",
                    values + (tx_id,),
                )
            else:
                tx_id = tx_id or uuid.uuid4().hex
                self._db.execute(
                    "INSERT INTO transactions (date, description, category_id, kind, amount, account_id, "
                    "to_account_id, method, card_id, goal_id, id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    values + (tx_id,),
                )
            self._db.commit()
            return self._tx(self._db.execute("SELECT * FROM transactions WHERE id=?", (tx_id,)).fetchone())

    def delete_transaction(self, tx_id: str) -> None:
        with self._lock:
            self._require("transactions", tx_id, "Transaction")
            self._db.execute("DELETE FROM transactions WHERE id=?", (tx_id,))
            self._db.commit()

    # -- moving browser data in --------------------------------------------------------------

    def import_state(self, data: Dict[str, Any]) -> Dict[str, int]:
        """Load data saved in the browser before the server kept finances.

        Only allowed while the store holds no accounts, cards, goals or transactions.
        Categories replace the defaults when the import brings its own.
        """
        if not self.is_empty():
            raise FinanceError("Finances already hold data, so nothing was imported")
        with self._lock:
            if data.get("categories"):
                self._db.execute("DELETE FROM categories")
                self._insert_categories(data["categories"])
            for a in data.get("accounts", []):
                self.save_account(a)
            for g in data.get("goals", []):
                self.save_goal(g)
            for c in data.get("cards", []):
                self.save_card(c)
            for t in data.get("transactions", []):
                self.save_transaction(t)
        return {k: len(data.get(k, [])) for k in ("accounts", "cards", "categories", "goals", "transactions")}

    # -- helpers ----------------------------------------------------------------------------------

    def _insert_categories(self, cats: List[Dict[str, Any]]) -> None:
        for pos, c in enumerate(cats):
            self._db.execute(
                "INSERT INTO categories VALUES (?,?,?,?,?,?,?)",
                (c["id"], c["name"], c["kind"], c["color"], c["icon"], c.get("parentId"), pos),
            )

    def _exists(self, table: str, row_id: Any) -> bool:
        return self._db.execute(f"SELECT 1 FROM {table} WHERE id=?", (row_id,)).fetchone() is not None

    def _require(self, table: str, row_id: Any, label: str) -> None:
        if not row_id or not self._exists(table, row_id):
            raise NotFound(f"{label} not found")
