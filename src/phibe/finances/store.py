"""SQLite storage and rules for Phibe's finances.

Rows are served as plain dicts with camelCase keys (the shape the app uses),
and amounts are integer cents. The store checks every rule that touches money:
which methods need a card, what a transfer is.
"""

from __future__ import annotations

import re
import sqlite3
import threading
import uuid
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

from phibe.finances import calc

_INSTALLMENT = re.compile(r" \(\d+/\d+\)$")  # the "(3/12)" a charge of an installment plan carries
KINDS = ("income", "expense", "transfer", "payment")  # payment = paying a credit card bill
METHODS = ("cash", "pix", "debit", "credit")
CARD_MODES = ("credit", "debit", "both")
CARD_BRANDS = ("visa", "mastercard", "elo", "amex", "hipercard")

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
    card_id TEXT, goal_id TEXT, recurring_id TEXT
);
CREATE INDEX IF NOT EXISTS tx_date ON transactions (date);
CREATE TABLE IF NOT EXISTS recurring (
    id TEXT PRIMARY KEY, description TEXT NOT NULL, category_id TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL, account_id TEXT NOT NULL, method TEXT NOT NULL, card_id TEXT,
    start_date TEXT NOT NULL, total INTEGER, made INTEGER NOT NULL DEFAULT 0
);
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
            # Databases made before recurring expenses have no such column yet.
            if "recurring_id" not in {r[1] for r in self._db.execute("PRAGMA table_info(transactions)")}:
                self._db.execute("ALTER TABLE transactions ADD COLUMN recurring_id TEXT")
            have = {r[1] for r in self._db.execute("PRAGMA table_info(accounts)")}
            for column, ddl in (("goal_id", "TEXT"), ("savings", "INTEGER NOT NULL DEFAULT 0"), ("target", "INTEGER"), ("color", "TEXT")):
                if column not in have:
                    self._db.execute(f"ALTER TABLE accounts ADD COLUMN {column} {ddl}")
            if "brand" not in {r[1] for r in self._db.execute("PRAGMA table_info(cards)")}:
                self._db.execute("ALTER TABLE cards ADD COLUMN brand TEXT")
            self._goals_become_savings_accounts()
            # Seed once: a user who deletes every category must not get them back.
            if not self._db.execute("SELECT 1 FROM meta WHERE key='seeded'").fetchone():
                self._insert_categories(default_categories())
                self._db.execute("INSERT INTO meta VALUES ('seeded', '1')")
            self._db.commit()

    def _goals_become_savings_accounts(self) -> None:
        """One-off: every goal becomes (or marks) a savings account carrying its target and colour,
        and every deposit to a goal becomes a plain transfer into that account. Balances do not change.
        The goals table itself is left alone."""
        db = self._db
        if db.execute("SELECT 1 FROM meta WHERE key='goals_migrated'").fetchone():
            return  # done once; a savings account the user deletes later must not come back
        db.execute("INSERT INTO meta VALUES ('goals_migrated', '1')")
        for g in db.execute("SELECT * FROM goals ORDER BY position").fetchall():
            acct = db.execute("SELECT * FROM accounts WHERE goal_id=? ORDER BY position LIMIT 1", (g["id"],)).fetchone()
            if acct is None:
                pos = db.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM accounts").fetchone()[0]
                db.execute(
                    "INSERT INTO accounts (id, name, icon, logo_key, opening, position, goal_id, savings, target, color) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (uuid.uuid4().hex, g["name"], "safe-square", match_logo_key(g["name"]), 0, pos, g["id"], 1, g["target"], g["color"]),
                )
            elif not acct["savings"]:
                db.execute("UPDATE accounts SET savings=1, target=?, color=? WHERE id=?", (g["target"], g["color"], acct["id"]))
        for t in db.execute("SELECT id, goal_id, account_id FROM transactions WHERE kind='savings'").fetchall():
            dest = db.execute("SELECT id FROM accounts WHERE goal_id=? ORDER BY position LIMIT 1", (t["goal_id"],)).fetchone()
            if dest is not None and dest["id"] != t["account_id"]:  # a deposit that came from its own account has no source to move from
                db.execute(
                    "UPDATE transactions SET kind='transfer', to_account_id=?, goal_id=NULL, method='pix', category_id='' WHERE id=?",
                    (dest["id"], t["id"]),
                )

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # -- reads ------------------------------------------------------------------

    def accounts(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM accounts ORDER BY position").fetchall()
        return [
            {
                "id": r["id"], "name": r["name"], "icon": r["icon"], "logoKey": r["logo_key"], "opening": r["opening"],
                "savings": bool(r["savings"]), "target": r["target"], "color": r["color"],
            }
            for r in rows
        ]

    def cards(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM cards ORDER BY rowid").fetchall()
        return [
            {
                "id": r["id"], "accountId": r["account_id"], "name": r["name"], "mode": r["mode"],
                "limit": r["credit_limit"], "dueDay": r["due_day"], "closeDaysBefore": r["close_days_before"],
                "brand": r["brand"],
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

    def recurring(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM recurring ORDER BY rowid").fetchall()
        return [
            {
                "id": r["id"], "description": r["description"], "amount": r["amount"], "total": r["total"],
                "made": r["made"], "active": r["total"] is None or r["made"] < r["total"],
            }
            for r in rows
        ]

    def upcoming(self, start: str, end: str) -> List[Dict[str, Any]]:
        """Charges of recurring expenses that fall in [start, end] but are not recorded yet (only one is
        recorded ahead), so a future month can still be shown. Never stored."""
        out: List[Dict[str, Any]] = []
        with self._lock:
            rules = self._db.execute("SELECT * FROM recurring").fetchall()
        for r in rules:
            first, n = date.fromisoformat(r["start_date"]), r["made"]
            while r["total"] is None or n < r["total"]:
                when = calc.nth_month(first, n).isoformat()
                if when > end:
                    break
                if when >= start:
                    label = f"{r['description']} ({n + 1}/{r['total']})" if r["total"] else r["description"]
                    out.append({
                        "id": f"upcoming:{r['id']}:{n}", "date": when, "description": label, "categoryId": r["category_id"],
                        "kind": "expense", "amount": r["amount"], "accountId": r["account_id"], "toAccountId": None,
                        "method": r["method"], "cardId": r["card_id"], "goalId": None, "recurringId": r["id"],
                        "upcoming": True,
                    })
                n += 1
        return sorted(out, key=lambda t: t["date"], reverse=True)

    @staticmethod
    def _tx(r: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": r["id"], "date": r["date"], "description": r["description"], "categoryId": r["category_id"],
            "kind": r["kind"], "amount": r["amount"], "accountId": r["account_id"], "toAccountId": r["to_account_id"],
            "method": r["method"], "cardId": r["card_id"], "goalId": r["goal_id"], "recurringId": r["recurring_id"],
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
        if kind == "card":  # everything that went through a card, debit or credit
            sql += " AND card_id IS NOT NULL"
        elif kind:
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
                for t in ("accounts", "cards", "transactions")
            )

    # -- accounts ----------------------------------------------------------------

    def save_account(self, data: Dict[str, Any]) -> Dict[str, Any]:
        name = _need(data.get("name"), "Account name")
        opening = data.get("opening", 0)
        if isinstance(opening, bool) or not isinstance(opening, int):
            raise FinanceError("Opening balance must be a whole number of cents")
        icon = data.get("icon") or None
        savings = bool(data.get("savings"))
        target = data.get("target") if savings else None
        if target is not None:
            if isinstance(target, bool) or not isinstance(target, int) or target <= 0:
                raise FinanceError("The target must be a whole number of cents above zero")
        color = (data.get("color") or None) if savings else None
        with self._lock:
            account_id = data.get("id")
            if account_id and self._exists("accounts", account_id):
                self._db.execute(
                    "UPDATE accounts SET name=?, icon=?, logo_key=?, opening=?, savings=?, target=?, color=? WHERE id=?",
                    (name, icon, match_logo_key(name), opening, int(savings), target, color, account_id),
                )
            else:
                account_id = account_id or uuid.uuid4().hex
                pos = self._db.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM accounts").fetchone()[0]
                self._db.execute(
                    "INSERT INTO accounts (id, name, icon, logo_key, opening, position, savings, target, color) VALUES (?,?,?,?,?,?,?,?,?)",
                    (account_id, name, icon, match_logo_key(name), opening, pos, int(savings), target, color),
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
            self._db.execute("DELETE FROM recurring WHERE account_id=?", (account_id,))
            for cid in card_ids:
                self._db.execute("DELETE FROM transactions WHERE card_id=?", (cid,))
                self._db.execute("DELETE FROM recurring WHERE card_id=?", (cid,))
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
        brand = data.get("brand") or None
        if brand is not None and brand not in CARD_BRANDS:
            raise FinanceError("Unknown card brand")
        with self._lock:
            self._require("accounts", data.get("accountId"), "Account")
            card_id = data.get("id")
            row = (name, data["accountId"], mode, limit if credit else 0, due, before, brand)
            if card_id and self._exists("cards", card_id):
                self._db.execute(
                    "UPDATE cards SET name=?, account_id=?, mode=?, credit_limit=?, due_day=?, close_days_before=?, brand=? WHERE id=?",
                    row + (card_id,),
                )
            else:
                card_id = card_id or uuid.uuid4().hex
                self._db.execute(
                    "INSERT INTO cards (name, account_id, mode, credit_limit, due_day, close_days_before, brand, id) VALUES (?,?,?,?,?,?,?,?)",
                    row + (card_id,),
                )
            self._db.commit()
        return next(c for c in self.cards() if c["id"] == card_id)

    def delete_card(self, card_id: str) -> None:
        """Also deletes the card's transactions."""
        with self._lock:
            self._require("cards", card_id, "Card")
            self._db.execute("DELETE FROM transactions WHERE card_id=?", (card_id,))
            self._db.execute("DELETE FROM recurring WHERE card_id=?", (card_id,))
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
                self._db.execute("UPDATE recurring SET category_id=? WHERE category_id=?", (target, gone))
                self._db.execute("DELETE FROM categories WHERE id=?", (gone,))
            self._db.commit()

    # -- transactions ---------------------------------------------------------------------

    def _checked(self, data: Dict[str, Any]) -> tuple:
        """Check one transaction against every money rule; the row values to store."""
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
        to_account = card_id = None
        category_id = ""

        if kind == "transfer":
            to_account = data.get("toAccountId")
            self._require("accounts", account_id, "Source account")
            self._require("accounts", to_account, "Destination account")
            if account_id == to_account:
                raise FinanceError("A transfer needs two different accounts")
            method, description = "pix", description or "Transfer"
        elif kind == "payment":
            card = self._db.execute("SELECT * FROM cards WHERE id=?", (data.get("cardId"),)).fetchone()
            if card is None or card["mode"] == "debit":
                raise FinanceError("A card payment needs a credit card")
            card_id = card["id"]
            self._require("accounts", account_id, "Paying account")
            if amount > self._owed(card, when.isoformat(), data.get("id")):
                raise FinanceError("That is more than this card owes in the current cycle")
            method, description = "pix", description or f"{card['name']} Payment"
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
        return (when.isoformat(), description, category_id, kind, amount, account_id, to_account, method, card_id, None)

    def _owed(self, card: sqlite3.Row, on: str, ignore_id: Optional[str]) -> int:
        """Credit used in the card's cycle that contains *on*, not counting one transaction."""
        rows = self._db.execute("SELECT * FROM transactions WHERE card_id=? AND id IS NOT ?", (card["id"], ignore_id)).fetchall()
        shape = {"id": card["id"], "dueDay": card["due_day"], "closeDaysBefore": card["close_days_before"]}
        return calc.card_used(shape, [self._tx(r) for r in rows], on)

    def save_transaction(self, data: Dict[str, Any], scope: str = "one") -> Dict[str, Any]:
        """*scope* matters for a charge made by a recurring expense: "one" changes only it, "following" this
        one and the later ones (and the rule, so future charges match), "all" every one (and the rule).
        Dates are never spread to the other charges: each keeps its own day."""
        if scope not in ("one", "following", "all"):
            raise FinanceError("Unknown edit scope")
        with self._lock:
            values = self._checked(data)
            tx_id = data.get("id")
            if tx_id and self._exists("transactions", tx_id):
                self._db.execute(
                    "UPDATE transactions SET date=?, description=?, category_id=?, kind=?, amount=?, account_id=?, "
                    "to_account_id=?, method=?, card_id=?, goal_id=? WHERE id=?",
                    values + (tx_id,),
                )
                self._spread(tx_id, values, scope)
            else:
                tx_id = tx_id or uuid.uuid4().hex
                self._db.execute(
                    "INSERT INTO transactions (date, description, category_id, kind, amount, account_id, "
                    "to_account_id, method, card_id, goal_id, id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    values + (tx_id,),
                )
            self._db.commit()
            return self._tx(self._db.execute("SELECT * FROM transactions WHERE id=?", (tx_id,)).fetchone())

    def _spread(self, tx_id: str, values: tuple, scope: str) -> None:
        """Copy an edited recurring charge's fields to the other charges of its rule, and to the rule."""
        row = self._db.execute("SELECT recurring_id, date FROM transactions WHERE id=?", (tx_id,)).fetchone()
        rule_id = row["recurring_id"]
        if scope == "one" or not rule_id or values[3] != "expense" or not self._exists("recurring", rule_id):
            return
        _, description, category_id, _, amount, account_id, _, method, card_id, _ = values
        base = _INSTALLMENT.sub("", description)
        sql = "SELECT id, description FROM transactions WHERE recurring_id=? AND id!=?"
        args: tuple = (rule_id, tx_id)
        if scope == "following":
            sql, args = sql + " AND date>?", args + (row["date"],)
        for other in self._db.execute(sql, args).fetchall():
            tail = _INSTALLMENT.search(other["description"])
            self._db.execute(
                "UPDATE transactions SET description=?, category_id=?, amount=?, account_id=?, method=?, card_id=? WHERE id=?",
                (base + (tail.group(0) if tail else ""), category_id, amount, account_id, method, card_id, other["id"]),
            )
        self._db.execute(
            "UPDATE recurring SET description=?, category_id=?, amount=?, account_id=?, method=?, card_id=? WHERE id=?",
            (base, category_id, amount, account_id, method, card_id, rule_id),
        )

    def delete_transaction(self, tx_id: str, scope: str = "one") -> None:
        """*scope* as in :meth:`save_transaction`; "following" and "all" also end the recurring expense."""
        if scope not in ("one", "following", "all"):
            raise FinanceError("Unknown delete scope")
        with self._lock:
            self._require("transactions", tx_id, "Transaction")
            row = self._db.execute("SELECT recurring_id, date FROM transactions WHERE id=?", (tx_id,)).fetchone()
            rule_id = row["recurring_id"]
            if scope == "one" or not rule_id:
                self._db.execute("DELETE FROM transactions WHERE id=?", (tx_id,))
            else:
                sql, args = "DELETE FROM transactions WHERE recurring_id=?", (rule_id,)
                if scope == "following":
                    sql, args = sql + " AND date>=?", args + (row["date"],)
                self._db.execute(sql, args)
                self._db.execute("DELETE FROM recurring WHERE id=?", (rule_id,))
            self._db.commit()

    # -- recurring expenses -------------------------------------------------------------------

    def save_recurring(self, data: Dict[str, Any], today: str) -> Dict[str, Any]:
        """A monthly expense on the same day as its first date; with *installments* it ends after that many."""
        installments = self._installments(data.get("installments"))
        with self._lock:
            when, description, category_id, _, amount, account_id, _, method, card_id, _ = self._checked(
                {**data, "kind": "expense", "id": None}
            )
            rule_id = uuid.uuid4().hex
            self._db.execute(
                "INSERT INTO recurring (id, description, category_id, amount, account_id, method, card_id, start_date, total) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (rule_id, description, category_id, amount, account_id, method, card_id, when, installments),
            )
            self._db.commit()
            self.generate_due(today)
        return next(r for r in self.recurring() if r["id"] == rule_id)

    @staticmethod
    def _installments(value: Any) -> Optional[int]:
        if value is None:
            return None
        value = _int(value, "Installments", 2)
        if value > 120:
            raise FinanceError("Installments go up to 120")
        return value

    def repeat_transaction(self, tx_id: str, installments: Optional[int], today: str) -> Dict[str, Any]:
        """Turn a one-off expense into the first charge of a new monthly rule (or installment plan)."""
        total = self._installments(installments)
        with self._lock:
            self._require("transactions", tx_id, "Transaction")
            tx = self._db.execute("SELECT * FROM transactions WHERE id=?", (tx_id,)).fetchone()
            if tx["kind"] != "expense":
                raise FinanceError("Only expenses can repeat")
            if tx["recurring_id"] and self._exists("recurring", tx["recurring_id"]):
                raise FinanceError("This expense already repeats")
            base = _INSTALLMENT.sub("", tx["description"])
            rule_id = uuid.uuid4().hex
            self._db.execute(
                "INSERT INTO recurring (id, description, category_id, amount, account_id, method, card_id, start_date, total, made) "
                "VALUES (?,?,?,?,?,?,?,?,?,1)",
                (rule_id, base, tx["category_id"], tx["amount"], tx["account_id"], tx["method"], tx["card_id"], tx["date"], total),
            )
            self._db.execute(
                "UPDATE transactions SET recurring_id=?, description=? WHERE id=?",
                (rule_id, f"{base} (1/{total})" if total else base, tx_id),
            )
            self._db.commit()
            self.generate_due(today)
        return next(r for r in self.recurring() if r["id"] == rule_id)

    def stop_recurring(self, rule_id: str) -> None:
        """No more charges; the ones already recorded stay."""
        with self._lock:
            self._require("recurring", rule_id, "Recurring expense")
            self._db.execute("DELETE FROM recurring WHERE id=?", (rule_id,))
            self._db.commit()

    def generate_due(self, today: str) -> int:
        """Record every charge that has come due by *today* and was not recorded yet, plus the next
        one still ahead, so a rule always has a charge on the timeline that can be opened or stopped.
        Safe to repeat."""
        added = 0
        with self._lock:
            for r in self._db.execute("SELECT * FROM recurring").fetchall():
                start, made = date.fromisoformat(r["start_date"]), r["made"]
                while r["total"] is None or made < r["total"]:
                    when = calc.nth_month(start, made)
                    if when.isoformat() > today and made > 0 and calc.nth_month(start, made - 1).isoformat() > today:
                        break  # the upcoming charge is already recorded
                    label = f"{r['description']} ({made + 1}/{r['total']})" if r["total"] else r["description"]
                    self._db.execute(
                        "INSERT INTO transactions (date, description, category_id, kind, amount, account_id, "
                        "to_account_id, method, card_id, goal_id, recurring_id, id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                        (when.isoformat(), label, r["category_id"], "expense", r["amount"], r["account_id"], None,
                         r["method"], r["card_id"], None, r["id"], uuid.uuid4().hex),
                    )
                    made, added = made + 1, added + 1
                    if when.isoformat() > today:
                        break  # one charge ahead is enough
                if made != r["made"]:
                    self._db.execute("UPDATE recurring SET made=? WHERE id=?", (made, r["id"]))
            self._db.commit()
        return added

    # -- moving browser data in --------------------------------------------------------------

    def import_state(self, data: Dict[str, Any]) -> Dict[str, int]:
        """Load data saved in the browser before the server kept finances.

        Only allowed while the store holds no accounts, cards or transactions.
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
            for g in data.get("goals", []):  # a goal from the browser becomes a savings account with that target
                self.save_account({"name": g.get("name"), "savings": True, "target": g.get("target") or None, "color": g.get("color")})
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
