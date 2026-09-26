"""SQLite storage and rules for Nova's finances."""

from __future__ import annotations

import calendar
import json
import sqlite3
import threading
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from nova.tasks.recurrence import next_due, validate_rule

ACCOUNT_KINDS = ("person", "company")
WALLET_KINDS = ("bank", "savings")
TYPES = ("expense", "income", "transfer", "yield", "invoice_payment")
_SCHEMA = """\
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    kind TEXT NOT NULL,
    archived_at TEXT
);
CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    opening_cents INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    name TEXT NOT NULL,
    closing_day INTEGER NOT NULL,
    due_day INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE,
    parent_id TEXT REFERENCES categories(id)
);
CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    rule TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id TEXT REFERENCES categories(id),
    wallet_id TEXT REFERENCES wallets(id),
    card_id TEXT REFERENCES cards(id),
    to_wallet_id TEXT REFERENCES wallets(id),
    plan_id TEXT,
    installment_no INTEGER,
    installments_total INTEGER,
    invoice_month TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tx_date ON transactions (date);
CREATE INDEX IF NOT EXISTS tx_account ON transactions (account_id);
CREATE INDEX IF NOT EXISTS tx_card ON transactions (card_id, invoice_month);
CREATE INDEX IF NOT EXISTS tx_wallet ON transactions (wallet_id);
"""

_HORIZON_MONTHS = 12


class FinanceError(ValueError):
    """The request is invalid."""


class NotFound(FinanceError):
    """The record does not exist."""


class InUse(FinanceError):
    """The record still has data attached; the caller must move or archive it."""

    def __init__(self, message: str, count: int) -> None:
        super().__init__(message)
        self.count = count


def clamp_day(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _month_str(day: date) -> str:
    return day.strftime("%Y-%m")


def _shift_month(month: str, delta: int) -> str:
    year, mon = int(month[:4]), int(month[5:7])
    index = year * 12 + (mon - 1) + delta
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def _month_index(month: str) -> int:
    return int(month[:4]) * 12 + int(month[5:7]) - 1


def _parse_date(value: Any) -> date:
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError as exc:
        raise FinanceError("date must look like 2026-10-05") from exc


def parse_month(value: str) -> str:
    try:
        return datetime.strptime(str(value), "%Y-%m").strftime("%Y-%m")
    except ValueError as exc:
        raise FinanceError("month must look like 2026-10") from exc


def _split(total: int, parts: int) -> List[int]:
    """Split *total* centavos into *parts*; the extra centavos go to the first."""
    base, extra = divmod(total, parts)
    return [base + (1 if i < extra else 0) for i in range(parts)]


class FinanceStore:
    """Thread-safe finance data. *now* can be replaced in tests."""

    def __init__(
        self,
        db_path: str | Path,
        *,
        now: Callable[[], datetime] = datetime.now,
    ) -> None:
        self._now = now
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def today(self) -> date:
        return self._now().date()

    @staticmethod
    def _id() -> str:
        return uuid.uuid4().hex[:12]

    def _one(self, table: str, row_id: str, label: str) -> sqlite3.Row:
        row = self._conn.execute(
            f"SELECT * FROM {table} WHERE id = ?", (row_id,)
        ).fetchone()
        if row is None:
            raise NotFound(f"{label} not found: {row_id}")
        return row

    @staticmethod
    def _name(value: str, label: str) -> str:
        value = (value or "").strip()
        if not value:
            raise FinanceError(f"{label} name cannot be empty")
        return value

    # -- Contas --------------------------------------------------------------

    def _account_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "kind": row["kind"],
            "archived": row["archived_at"] is not None,
            "archived_at": row["archived_at"],
        }

    def create_account(self, name: str, kind: str = "person") -> Dict[str, Any]:
        name = self._name(name, "Conta")
        if kind not in ACCOUNT_KINDS:
            raise FinanceError(f"kind must be one of: {', '.join(ACCOUNT_KINDS)}")
        with self._lock:
            account_id = self._id()
            try:
                self._conn.execute(
                    "INSERT INTO accounts (id, name, kind) VALUES (?, ?, ?)",
                    (account_id, name, kind),
                )
            except sqlite3.IntegrityError as exc:
                raise FinanceError(f"A Conta named '{name}' already exists") from exc
            self._conn.commit()
            return self._account_dict(self._one("accounts", account_id, "Conta"))

    def list_accounts(self, *, archived: bool = False) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM accounts WHERE (archived_at IS NOT NULL) = ? "
                "ORDER BY name",
                (int(archived),),
            ).fetchall()
            return [self._account_dict(r) for r in rows]

    def rename_account(self, account_id: str, name: str) -> Dict[str, Any]:
        name = self._name(name, "Conta")
        with self._lock:
            self._one("accounts", account_id, "Conta")
            try:
                self._conn.execute(
                    "UPDATE accounts SET name = ? WHERE id = ?", (name, account_id)
                )
            except sqlite3.IntegrityError as exc:
                raise FinanceError(f"A Conta named '{name}' already exists") from exc
            self._conn.commit()
            return self._account_dict(self._one("accounts", account_id, "Conta"))

    def archive_account(self, account_id: str) -> Dict[str, Any]:
        with self._lock:
            self._one("accounts", account_id, "Conta")
            self._conn.execute(
                "UPDATE accounts SET archived_at = ? WHERE id = ? "
                "AND archived_at IS NULL",
                (self._now().isoformat(timespec="seconds"), account_id),
            )
            self._conn.commit()
            return self._account_dict(self._one("accounts", account_id, "Conta"))

    def unarchive_account(self, account_id: str) -> Dict[str, Any]:
        with self._lock:
            self._one("accounts", account_id, "Conta")
            self._conn.execute(
                "UPDATE accounts SET archived_at = NULL WHERE id = ?", (account_id,)
            )
            self._conn.commit()
            return self._account_dict(self._one("accounts", account_id, "Conta"))

    def delete_account(self, account_id: str, confirm_name: str) -> None:
        """Permanently delete an archived Conta and everything inside it.

        The caller must type the Conta's exact name as confirmation.
        """
        with self._lock:
            row = self._one("accounts", account_id, "Conta")
            if row["archived_at"] is None:
                raise FinanceError("Archive the Conta before deleting it")
            if confirm_name != row["name"]:
                raise FinanceError("Confirmation does not match the Conta name")
            plan_ids = [
                r[0]
                for r in self._conn.execute(
                    "SELECT DISTINCT plan_id FROM transactions "
                    "WHERE account_id = ? AND plan_id IS NOT NULL",
                    (account_id,),
                )
            ]
            for table in ("transactions", "cards", "wallets"):
                self._conn.execute(
                    f"DELETE FROM {table} WHERE account_id = ?", (account_id,)
                )
            for plan_id in plan_ids:
                self._conn.execute("DELETE FROM plans WHERE id = ?", (plan_id,))
            self._conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
            self._conn.commit()

    def _active_account(self, account_id: str) -> sqlite3.Row:
        row = self._one("accounts", account_id, "Conta")
        if row["archived_at"] is not None:
            raise FinanceError("This Conta is archived; unarchive it first")
        return row

    # -- banks / savings (wallets) ------------------------------------------

    def _wallet_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "account_id": row["account_id"],
            "name": row["name"],
            "kind": row["kind"],
            "opening_cents": row["opening_cents"],
            "balance_cents": self.wallet_balance(row["id"]),
        }

    def create_wallet(
        self,
        account_id: str,
        name: str,
        kind: str = "bank",
        opening_cents: int = 0,
    ) -> Dict[str, Any]:
        name = self._name(name, "Bank")
        if kind not in WALLET_KINDS:
            raise FinanceError(f"kind must be one of: {', '.join(WALLET_KINDS)}")
        with self._lock:
            self._active_account(account_id)
            wallet_id = self._id()
            self._conn.execute(
                "INSERT INTO wallets (id, account_id, name, kind, opening_cents)"
                " VALUES (?, ?, ?, ?, ?)",
                (wallet_id, account_id, name, kind, int(opening_cents)),
            )
            self._conn.commit()
            return self._wallet_dict(self._one("wallets", wallet_id, "Bank"))

    def list_wallets(self, account_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            sql, args = "SELECT * FROM wallets", []
            if account_id:
                sql, args = sql + " WHERE account_id = ?", [account_id]
            rows = self._conn.execute(sql + " ORDER BY name", args).fetchall()
            return [self._wallet_dict(r) for r in rows]

    def update_wallet(
        self,
        wallet_id: str,
        *,
        name: Optional[str] = None,
        opening_cents: Optional[int] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            self._one("wallets", wallet_id, "Bank")
            if name is not None:
                self._conn.execute(
                    "UPDATE wallets SET name = ? WHERE id = ?",
                    (self._name(name, "Bank"), wallet_id),
                )
            if opening_cents is not None:
                self._conn.execute(
                    "UPDATE wallets SET opening_cents = ? WHERE id = ?",
                    (int(opening_cents), wallet_id),
                )
            self._conn.commit()
            return self._wallet_dict(self._one("wallets", wallet_id, "Bank"))

    def delete_wallet(self, wallet_id: str) -> None:
        with self._lock:
            self._one("wallets", wallet_id, "Bank")
            count = self._conn.execute(
                "SELECT COUNT(*) FROM transactions "
                "WHERE wallet_id = ? OR to_wallet_id = ?",
                (wallet_id, wallet_id),
            ).fetchone()[0]
            if count:
                raise InUse(f"Bank has {count} transaction(s)", count)
            self._conn.execute("DELETE FROM wallets WHERE id = ?", (wallet_id,))
            self._conn.commit()

    def wallet_balance(self, wallet_id: str, *, as_of: Optional[date] = None) -> int:
        """Balance in centavos up to and including *as_of* (default: today)."""
        as_of = as_of or self.today()
        stop = as_of.isoformat()
        row = self._one("wallets", wallet_id, "Bank")

        def total(where: str) -> int:
            return self._conn.execute(
                "SELECT COALESCE(SUM(amount_cents), 0) FROM transactions "
                f"WHERE date <= ? AND {where}",
                (stop, wallet_id),
            ).fetchone()[0]

        plus = total("type IN ('income', 'yield') AND wallet_id = ?")
        plus += total("type = 'transfer' AND to_wallet_id = ?")
        minus = total("type IN ('expense', 'invoice_payment') AND wallet_id = ?")
        minus += total("type = 'transfer' AND wallet_id = ?")
        return row["opening_cents"] + plus - minus

    # -- cards ---------------------------------------------------------------

    @staticmethod
    def _check_day(value: int, label: str) -> int:
        if not isinstance(value, int) or not 1 <= value <= 31:
            raise FinanceError(f"{label} must be a day from 1 to 31")
        return value

    def _card_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "account_id": row["account_id"],
            "name": row["name"],
            "closing_day": row["closing_day"],
            "due_day": row["due_day"],
        }

    def create_card(
        self, account_id: str, name: str, closing_day: int, due_day: int
    ) -> Dict[str, Any]:
        name = self._name(name, "Card")
        self._check_day(closing_day, "closing_day")
        self._check_day(due_day, "due_day")
        with self._lock:
            self._active_account(account_id)
            card_id = self._id()
            self._conn.execute(
                "INSERT INTO cards (id, account_id, name, closing_day, due_day)"
                " VALUES (?, ?, ?, ?, ?)",
                (card_id, account_id, name, closing_day, due_day),
            )
            self._conn.commit()
            return self._card_dict(self._one("cards", card_id, "Card"))

    def list_cards(self, account_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            sql, args = "SELECT * FROM cards", []
            if account_id:
                sql, args = sql + " WHERE account_id = ?", [account_id]
            rows = self._conn.execute(sql + " ORDER BY name", args).fetchall()
            return [self._card_dict(r) for r in rows]

    def update_card(self, card_id: str, **changes: Any) -> Dict[str, Any]:
        """Change name / closing_day / due_day. Past invoices keep their month."""
        allowed = {"name", "closing_day", "due_day"}
        if set(changes) - allowed:
            raise FinanceError("Only name, closing_day and due_day can be changed")
        with self._lock:
            self._one("cards", card_id, "Card")
            if "name" in changes:
                changes["name"] = self._name(changes["name"], "Card")
            for key in ("closing_day", "due_day"):
                if key in changes:
                    self._check_day(changes[key], key)
            for column, value in changes.items():
                self._conn.execute(
                    f"UPDATE cards SET {column} = ? WHERE id = ?", (value, card_id)
                )
            self._conn.commit()
            return self._card_dict(self._one("cards", card_id, "Card"))

    def delete_card(self, card_id: str) -> None:
        with self._lock:
            self._one("cards", card_id, "Card")
            count = self._conn.execute(
                "SELECT COUNT(*) FROM transactions WHERE card_id = ?", (card_id,)
            ).fetchone()[0]
            if count:
                raise InUse(f"Card has {count} transaction(s)", count)
            self._conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
            self._conn.commit()

    @staticmethod
    def invoice_month_for(card: sqlite3.Row | Dict[str, Any], day: date) -> str:
        """Invoice a purchase lands in: on or before the closing day -> this
        month's invoice, after it -> next month's. Invoices are named by the
        month in which they close."""
        month = _month_str(day)
        return month if day.day <= card["closing_day"] else _shift_month(month, 1)

    @staticmethod
    def invoice_dates(card: sqlite3.Row | Dict[str, Any], month: str) -> Dict[str, str]:
        """Closing and due dates of the invoice that closes in *month*. When the
        due day is not after the closing day, it falls in the following month."""
        year, mon = int(month[:4]), int(month[5:7])
        closing = clamp_day(year, mon, card["closing_day"])
        due_month = (
            month if card["due_day"] > card["closing_day"] else _shift_month(month, 1)
        )
        due = clamp_day(int(due_month[:4]), int(due_month[5:7]), card["due_day"])
        return {"closing_date": closing.isoformat(), "due_date": due.isoformat()}

    # -- categories ----------------------------------------------------------

    def _category_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {"id": row["id"], "name": row["name"], "parent_id": row["parent_id"]}

    def create_category(
        self, name: str, parent_id: Optional[str] = None
    ) -> Dict[str, Any]:
        name = self._name(name, "Category")
        with self._lock:
            if parent_id:
                parent = self._one("categories", parent_id, "Category")
                if parent["parent_id"]:
                    raise FinanceError("Subcategories cannot have subcategories")
            clash = self._conn.execute(
                "SELECT 1 FROM categories WHERE name = ? AND parent_id IS ?",
                (name, parent_id),
            ).fetchone()
            if clash:
                raise FinanceError(f"'{name}' already exists here")
            category_id = self._id()
            self._conn.execute(
                "INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)",
                (category_id, name, parent_id),
            )
            self._conn.commit()
            return self._category_dict(self._one("categories", category_id, "Category"))

    def list_categories(self) -> List[Dict[str, Any]]:
        """Top-level categories, each with its ``children``."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM categories ORDER BY name"
            ).fetchall()
            tops = [self._category_dict(r) for r in rows if not r["parent_id"]]
            for top in tops:
                top["children"] = [
                    self._category_dict(r) for r in rows if r["parent_id"] == top["id"]
                ]
            return tops

    def rename_category(self, category_id: str, name: str) -> Dict[str, Any]:
        name = self._name(name, "Category")
        with self._lock:
            row = self._one("categories", category_id, "Category")
            clash = self._conn.execute(
                "SELECT 1 FROM categories WHERE name = ? AND parent_id IS ? "
                "AND id != ?",
                (name, row["parent_id"], category_id),
            ).fetchone()
            if clash:
                raise FinanceError(f"'{name}' already exists here")
            self._conn.execute(
                "UPDATE categories SET name = ? WHERE id = ?", (name, category_id)
            )
            self._conn.commit()
            return self._category_dict(self._one("categories", category_id, "Category"))

    def delete_category(self, category_id: str, move_to: Optional[str] = None) -> None:
        """Delete a category (and its subcategories). Transactions using any of
        them need *move_to*, another category outside the deleted group."""
        with self._lock:
            self._one("categories", category_id, "Category")
            group = [category_id] + [
                r[0]
                for r in self._conn.execute(
                    "SELECT id FROM categories WHERE parent_id = ?", (category_id,)
                )
            ]
            marks = ",".join("?" * len(group))
            count = self._conn.execute(
                f"SELECT COUNT(*) FROM transactions WHERE category_id IN ({marks})",
                group,
            ).fetchone()[0]
            if count:
                if not move_to:
                    raise InUse(f"Category is used by {count} transaction(s)", count)
                if move_to in group:
                    raise FinanceError("Cannot move into the category being deleted")
                self._one("categories", move_to, "Category")
                self._conn.execute(
                    f"UPDATE transactions SET category_id = ? "
                    f"WHERE category_id IN ({marks})",
                    [move_to, *group],
                )
            self._conn.execute(f"DELETE FROM categories WHERE id IN ({marks})", group)
            self._conn.commit()

    # -- transactions --------------------------------------------------------

    def _tx_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        out = {k: row[k] for k in row.keys()}
        return out

    def _insert_tx(self, **v: Any) -> str:
        tx_id = self._id()
        self._conn.execute(
            "INSERT INTO transactions (id, account_id, type, amount_cents, date,"
            " description, category_id, wallet_id, card_id, to_wallet_id, plan_id,"
            " installment_no, installments_total, invoice_month, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                tx_id,
                v["account_id"],
                v["type"],
                v["amount_cents"],
                v["date"],
                v.get("description", ""),
                v.get("category_id"),
                v.get("wallet_id"),
                v.get("card_id"),
                v.get("to_wallet_id"),
                v.get("plan_id"),
                v.get("installment_no"),
                v.get("installments_total"),
                v.get("invoice_month"),
                self._now().isoformat(timespec="seconds"),
            ),
        )
        return tx_id

    def _resolve_places(
        self,
        kind: str,
        wallet_id: Optional[str],
        card_id: Optional[str],
        to_wallet_id: Optional[str],
        account_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Check where the money moves and return the owning ``account_id``.

        When *account_id* (the Conta the entry is for) is given, the bank or
        card used must belong to it: the company card cannot pay a personal
        bill, and vice versa.
        """
        if kind == "transfer":
            if card_id or not wallet_id or not to_wallet_id:
                raise FinanceError("A transfer needs a source and a destination bank")
            if wallet_id == to_wallet_id:
                raise FinanceError("Source and destination must be different")
            src = self._one("wallets", wallet_id, "Bank")
            dst = self._one("wallets", to_wallet_id, "Bank")
            # Any Conta may send to any other; the transfer is recorded on
            # the source Conta.
            self._active_account(dst["account_id"])
            return {"account_id": src["account_id"], "card": None}
        if to_wallet_id:
            raise FinanceError("to_wallet_id is only for transfers")
        if bool(wallet_id) == bool(card_id):
            raise FinanceError("Choose either a bank or a card")
        if card_id:
            if kind != "expense":
                raise FinanceError("Only expenses can be paid with a card")
            card = self._one("cards", card_id, "Card")
            self._same_conta(account_id, card, f"Card '{card['name']}'")
            return {"account_id": card["account_id"], "card": card}
        wallet = self._one("wallets", wallet_id, "Bank")
        self._same_conta(account_id, wallet, f"Bank '{wallet['name']}'")
        return {"account_id": wallet["account_id"], "card": None}

    def _same_conta(
        self, account_id: Optional[str], owner: sqlite3.Row, label: str
    ) -> None:
        if account_id and owner["account_id"] != account_id:
            conta = self._one("accounts", owner["account_id"], "Conta")
            raise FinanceError(f"{label} belongs to the Conta '{conta['name']}'")

    def create_transaction(
        self,
        *,
        type: str,
        amount_cents: int,
        date: str,
        wallet_id: Optional[str] = None,
        card_id: Optional[str] = None,
        to_wallet_id: Optional[str] = None,
        category_id: Optional[str] = None,
        description: str = "",
        installments: Optional[int] = None,
        recurrence: Optional[Dict[str, Any]] = None,
        account_id: Optional[str] = None,
        invoice_month: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Create an expense, income or transfer. One popup, three shapes:

        * one-off — no *installments* and no *recurrence*
        * installments — *installments* >= 2; *amount_cents* is the TOTAL and is
          split across months (on a card, across consecutive invoices)
        * recurring — *recurrence* rule (see ``nova.tasks.recurrence``);
          occurrences are created up to 12 months ahead and topped up later

        *account_id* is the Conta the entry is for; the bank or card must belong
        to it. For a card purchase, *invoice_month* (``YYYY-MM``, the month the
        invoice closes) overrides the automatic choice; later installments or
        occurrences keep the same distance from their automatic invoice.

        Returns the created transactions (all installments / occurrences).
        """
        if type not in ("expense", "income", "transfer"):
            raise FinanceError("type must be expense, income or transfer")
        if not isinstance(amount_cents, int) or amount_cents <= 0:
            raise FinanceError("amount_cents must be a positive whole number")
        if installments is not None and recurrence:
            raise FinanceError("Choose installments or recurrence, not both")
        if installments is not None and (
            not isinstance(installments, int) or installments < 2
        ):
            raise FinanceError("installments must be 2 or more")
        if installments is not None and installments > amount_cents:
            raise FinanceError("Too many installments for this amount")
        first = _parse_date(date)
        try:
            rule = validate_rule(recurrence) if recurrence else None
        except ValueError as exc:
            raise FinanceError(str(exc)) from exc
        with self._lock:
            places = self._resolve_places(
                type, wallet_id, card_id, to_wallet_id, account_id
            )
            self._active_account(places["account_id"])
            offset = 0
            if invoice_month:
                if not card_id:
                    raise FinanceError("invoice_month is only for card purchases")
                offset = _month_index(parse_month(invoice_month)) - _month_index(
                    self.invoice_month_for(places["card"], first)
                )
            if category_id:
                if type == "transfer":
                    raise FinanceError("Transfers have no category")
                self._one("categories", category_id, "Category")
            base = {
                "account_id": places["account_id"],
                "type": type,
                "wallet_id": wallet_id,
                "card_id": card_id,
                "to_wallet_id": to_wallet_id,
                "category_id": category_id,
                "description": (description or "").strip(),
            }
            card = places["card"]

            def add(day: date, cents: int, **extra: Any) -> str:
                month = None
                if card:
                    month = _shift_month(self.invoice_month_for(card, day), offset)
                return self._insert_tx(
                    **base,
                    amount_cents=cents,
                    date=day.isoformat(),
                    invoice_month=month,
                    **extra,
                )

            ids: List[str] = []
            if installments:
                plan_id = self._id()
                self._conn.execute(
                    "INSERT INTO plans (id, kind, rule) "
                    "VALUES (?, 'installment', NULL)",
                    (plan_id,),
                )
                anchor = first.day
                current: Any = first
                for number, cents in enumerate(_split(amount_cents, installments), 1):
                    ids.append(
                        add(
                            current,
                            cents,
                            plan_id=plan_id,
                            installment_no=number,
                            installments_total=installments,
                        )
                    )
                    current = next_due(
                        current,
                        {"freq": "monthly"},
                        occurrences_so_far=0,
                        anchor_day=anchor,
                    )
            elif rule:
                plan_id = self._id()
                self._conn.execute(
                    "INSERT INTO plans (id, kind, rule) VALUES (?, 'recurring', ?)",
                    (
                        plan_id,
                        json.dumps(
                            {
                                **rule,
                                "amount_cents": amount_cents,
                                "invoice_offset": offset,
                            }
                        ),
                    ),
                )
                ids.append(add(first, amount_cents, plan_id=plan_id))
                self._extend_plan(plan_id)
                ids = [
                    r[0]
                    for r in self._conn.execute(
                        "SELECT id FROM transactions WHERE plan_id = ? ORDER BY date",
                        (plan_id,),
                    )
                ]
            else:
                ids.append(add(first, amount_cents))
            self._conn.commit()
            return [
                self._tx_dict(self._one("transactions", i, "Transaction")) for i in ids
            ]

    # recurring plans ------------------------------------------------------

    def _extend_plan(self, plan_id: str) -> None:
        plan = self._one("plans", plan_id, "Plan")
        if plan["kind"] != "recurring":
            return
        rule = json.loads(plan["rule"])
        rows = self._conn.execute(
            "SELECT * FROM transactions WHERE plan_id = ? ORDER BY date", (plan_id,)
        ).fetchall()
        if not rows:
            return
        last, count = rows[-1], len(rows)
        anchor_day = int(rows[0]["date"][8:10])
        horizon = clamp_day(
            *divmod_month(self.today(), _HORIZON_MONTHS), self.today().day
        )
        card = self._one("cards", last["card_id"], "Card") if last["card_id"] else None
        current = date.fromisoformat(last["date"])
        while True:
            following = next_due(
                current, rule, occurrences_so_far=count, anchor_day=anchor_day
            )
            if following is None or following > horizon:
                return
            self._insert_tx(
                account_id=last["account_id"],
                type=last["type"],
                amount_cents=rule["amount_cents"],
                date=following.isoformat(),
                description=last["description"],
                category_id=last["category_id"],
                wallet_id=last["wallet_id"],
                card_id=last["card_id"],
                to_wallet_id=last["to_wallet_id"],
                plan_id=plan_id,
                invoice_month=(
                    _shift_month(
                        self.invoice_month_for(card, following),
                        rule.get("invoice_offset", 0),
                    )
                    if card
                    else None
                ),
            )
            current, count = following, count + 1

    def extend_recurring(self) -> None:
        """Create missing future occurrences of every recurring plan."""
        with self._lock:
            for row in self._conn.execute(
                "SELECT id FROM plans WHERE kind = 'recurring'"
            ).fetchall():
                self._extend_plan(row["id"])
            self._conn.commit()

    def list_transactions(
        self,
        *,
        account_id: Optional[str] = None,
        wallet_id: Optional[str] = None,
        card_id: Optional[str] = None,
        category_id: Optional[str] = None,
        type: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: int = 500,
    ) -> List[Dict[str, Any]]:
        self.extend_recurring()
        clauses, args = ["1=1"], []
        for column, value in (
            ("account_id", account_id),
            ("card_id", card_id),
            ("type", type),
        ):
            if value:
                clauses.append(f"{column} = ?")
                args.append(value)
        if wallet_id:
            clauses.append("(wallet_id = ? OR to_wallet_id = ?)")
            args += [wallet_id, wallet_id]
        if category_id:
            clauses.append(
                "(category_id = ? OR category_id IN "
                "(SELECT id FROM categories WHERE parent_id = ?))"
            )
            args += [category_id, category_id]
        if start:
            clauses.append("date >= ?")
            args.append(_parse_date(start).isoformat())
        if end:
            clauses.append("date <= ?")
            args.append(_parse_date(end).isoformat())
        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM transactions WHERE {' AND '.join(clauses)} "
                "ORDER BY date DESC, created_at DESC LIMIT ?",
                [*args, limit],
            ).fetchall()
            return [self._tx_dict(r) for r in rows]

    def get_transaction(self, tx_id: str) -> Dict[str, Any]:
        with self._lock:
            return self._tx_dict(self._one("transactions", tx_id, "Transaction"))

    def update_transaction(
        self, tx_id: str, *, scope: str = "one", **changes: Any
    ) -> Dict[str, Any]:
        """Edit description, category, amount (and date, for scope 'one').

        *scope* ``future`` applies description/category/amount to this and the
        later occurrences of a recurring plan (installments keep their split).
        """
        allowed = {
            "description",
            "category_id",
            "amount_cents",
            "date",
            "invoice_month",
        }
        if set(changes) - allowed:
            raise FinanceError(
                "Only description, category, amount, date and invoice change"
            )
        if scope not in ("one", "future"):
            raise FinanceError("scope must be one or future")
        with self._lock:
            row = self._one("transactions", tx_id, "Transaction")
            if row["type"] in ("yield", "invoice_payment"):
                raise FinanceError("This entry is managed automatically")
            if "amount_cents" in changes and (
                not isinstance(changes["amount_cents"], int)
                or changes["amount_cents"] <= 0
            ):
                raise FinanceError("amount_cents must be a positive whole number")
            if changes.get("category_id"):
                if row["type"] == "transfer":
                    raise FinanceError("Transfers have no category")
                self._one("categories", changes["category_id"], "Category")
            if "invoice_month" in changes:
                if scope != "one" or not row["card_id"]:
                    raise FinanceError(
                        "The invoice can only be changed on one card purchase"
                    )
                changes["invoice_month"] = parse_month(changes["invoice_month"])
            if "date" in changes:
                if scope != "one":
                    raise FinanceError("The date can only change one entry at a time")
                changes["date"] = _parse_date(changes["date"]).isoformat()
            targets = [row["id"]]
            if scope == "future" and row["plan_id"]:
                targets = [
                    r[0]
                    for r in self._conn.execute(
                        "SELECT id FROM transactions WHERE plan_id = ? AND date >= ?",
                        (row["plan_id"], row["date"]),
                    )
                ]
            for target in targets:
                for column, value in changes.items():
                    self._conn.execute(
                        f"UPDATE transactions SET {column} = ? WHERE id = ?",
                        (value, target),
                    )
            if "date" in changes and row["card_id"] and "invoice_month" not in changes:
                card = self._one("cards", row["card_id"], "Card")
                self._conn.execute(
                    "UPDATE transactions SET invoice_month = ? WHERE id = ?",
                    (
                        self.invoice_month_for(
                            card, date.fromisoformat(changes["date"])
                        ),
                        tx_id,
                    ),
                )
            if "amount_cents" in changes and row["plan_id"]:
                plan = self._one("plans", row["plan_id"], "Plan")
                if plan["kind"] == "recurring" and scope == "future":
                    rule = json.loads(plan["rule"])
                    rule["amount_cents"] = changes["amount_cents"]
                    self._conn.execute(
                        "UPDATE plans SET rule = ? WHERE id = ?",
                        (json.dumps(rule), plan["id"]),
                    )
            self._conn.commit()
            return self._tx_dict(self._one("transactions", tx_id, "Transaction"))

    def delete_transaction(self, tx_id: str, *, scope: str = "one") -> int:
        """Delete one entry, this and later ones (``future``) or the whole plan
        (``all``). Returns how many entries were removed."""
        if scope not in ("one", "future", "all"):
            raise FinanceError("scope must be one, future or all")
        with self._lock:
            row = self._one("transactions", tx_id, "Transaction")
            if scope == "one" or not row["plan_id"]:
                self._conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
                removed = 1
            else:
                sql = "DELETE FROM transactions WHERE plan_id = ?"
                args: List[Any] = [row["plan_id"]]
                if scope == "future":
                    sql += " AND date >= ?"
                    args.append(row["date"])
                removed = self._conn.execute(sql, args).rowcount
                left = self._conn.execute(
                    "SELECT COUNT(*) FROM transactions WHERE plan_id = ?",
                    (row["plan_id"],),
                ).fetchone()[0]
                if scope == "future" and row["plan_id"]:
                    plan = self._one("plans", row["plan_id"], "Plan")
                    if plan["kind"] == "recurring":
                        rule = json.loads(plan["rule"])
                        before = date.fromisoformat(row["date"]).toordinal() - 1
                        rule["until"] = date.fromordinal(before).isoformat()
                        self._conn.execute(
                            "UPDATE plans SET rule = ? WHERE id = ?",
                            (json.dumps(rule), plan["id"]),
                        )
                if not left:
                    self._conn.execute(
                        "DELETE FROM plans WHERE id = ?", (row["plan_id"],)
                    )
            self._conn.commit()
            return removed

    # -- card invoices -------------------------------------------------------

    def get_invoice(self, card_id: str, month: str) -> Dict[str, Any]:
        """The invoice of *card_id* that closes in *month* (``YYYY-MM``)."""
        month = parse_month(month)
        with self._lock:
            card = self._one("cards", card_id, "Card")
            rows = self._conn.execute(
                "SELECT * FROM transactions WHERE card_id = ? AND invoice_month = ? "
                "AND type = 'expense' ORDER BY date, created_at",
                (card_id, month),
            ).fetchall()
            payment = self._conn.execute(
                "SELECT * FROM transactions WHERE card_id = ? AND invoice_month = ? "
                "AND type = 'invoice_payment'",
                (card_id, month),
            ).fetchone()
            dates = self.invoice_dates(card, month)
            total = sum(r["amount_cents"] for r in rows)
            if payment:
                status = "paid"
            elif self.today().isoformat() <= dates["closing_date"]:
                status = "open"
            else:
                status = "closed"
            return {
                "card_id": card_id,
                "month": month,
                **dates,
                "total_cents": total,
                "status": status,
                "paid_at": payment["date"] if payment else None,
                "transactions": [self._tx_dict(r) for r in rows],
            }

    def list_invoices(self, card_id: str) -> List[Dict[str, Any]]:
        """Every invoice of the card that has purchases, newest first."""
        self.extend_recurring()
        with self._lock:
            self._one("cards", card_id, "Card")
            months = [
                r[0]
                for r in self._conn.execute(
                    "SELECT DISTINCT invoice_month FROM transactions "
                    "WHERE card_id = ? ORDER BY invoice_month DESC",
                    (card_id,),
                )
            ]
            invoices = [self.get_invoice(card_id, m) for m in months]
            for invoice in invoices:
                del invoice["transactions"]
            return invoices

    def pay_invoice(
        self,
        card_id: str,
        month: str,
        wallet_id: str,
        *,
        paid_on: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Pay an invoice from a bank. The money leaves the bank now; the card
        purchases are not counted a second time in reports."""
        month = parse_month(month)
        with self._lock:
            invoice = self.get_invoice(card_id, month)
            card = self._one("cards", card_id, "Card")
            wallet = self._one("wallets", wallet_id, "Bank")
            self._active_account(card["account_id"])
            if wallet["account_id"] != card["account_id"]:
                raise FinanceError("Pay the invoice from a bank of the same Conta")
            if invoice["status"] == "paid":
                raise FinanceError("This invoice is already paid")
            if invoice["total_cents"] <= 0:
                raise FinanceError("This invoice has nothing to pay")
            day = _parse_date(paid_on) if paid_on else self.today()
            self._insert_tx(
                account_id=card["account_id"],
                type="invoice_payment",
                amount_cents=invoice["total_cents"],
                date=day.isoformat(),
                description=f"Invoice {card['name']} {month}",
                wallet_id=wallet_id,
                card_id=card_id,
                invoice_month=month,
            )
            self._conn.commit()
            return self.get_invoice(card_id, month)

    def unpay_invoice(self, card_id: str, month: str) -> Dict[str, Any]:
        month = parse_month(month)
        with self._lock:
            self._conn.execute(
                "DELETE FROM transactions WHERE card_id = ? AND invoice_month = ? "
                "AND type = 'invoice_payment'",
                (card_id, month),
            )
            self._conn.commit()
            return self.get_invoice(card_id, month)

    # -- savings yield -------------------------------------------------------

    def record_yield(
        self, wallet_id: str, month: str, amount_cents: int
    ) -> Dict[str, Any]:
        """Enter (or correct) the total yield of a savings bank for a month."""
        month = parse_month(month)
        if not isinstance(amount_cents, int) or amount_cents < 0:
            raise FinanceError("amount_cents must be zero or more")
        with self._lock:
            wallet = self._one("wallets", wallet_id, "Bank")
            if wallet["kind"] != "savings":
                raise FinanceError("Yield can only be recorded on a savings bank")
            self._active_account(wallet["account_id"])
            year, mon = int(month[:4]), int(month[5:7])
            day = clamp_day(year, mon, 31).isoformat()
            self._conn.execute(
                "DELETE FROM transactions WHERE wallet_id = ? AND type = 'yield' "
                "AND substr(date, 1, 7) = ?",
                (wallet_id, month),
            )
            self._insert_tx(
                account_id=wallet["account_id"],
                type="yield",
                amount_cents=amount_cents,
                date=day,
                description=f"Yield {month}",
                wallet_id=wallet_id,
            )
            self._conn.commit()
            return next(h for h in self.yield_history(wallet_id) if h["month"] == month)

    def yield_history(self, wallet_id: str) -> List[Dict[str, Any]]:
        """Monthly yield with the balance it started from, the % for the month
        and the compounded % since the first entry. Oldest first."""
        with self._lock:
            wallet = self._one("wallets", wallet_id, "Bank")
            if wallet["kind"] != "savings":
                raise FinanceError("Yield history is only for a savings bank")
            rows = self._conn.execute(
                "SELECT substr(date, 1, 7) AS month, amount_cents FROM transactions "
                "WHERE wallet_id = ? AND type = 'yield' ORDER BY date",
                (wallet_id,),
            ).fetchall()
            history, growth = [], 1.0
            for row in rows:
                month = row["month"]
                start = date(int(month[:4]), int(month[5:7]), 1)
                base = self.wallet_balance(
                    wallet_id, as_of=date.fromordinal(start.toordinal() - 1)
                )
                pct = round(row["amount_cents"] / base * 100, 2) if base > 0 else None
                if pct is not None:
                    growth *= 1 + row["amount_cents"] / base
                history.append(
                    {
                        "month": month,
                        "base_cents": base,
                        "yield_cents": row["amount_cents"],
                        "pct": pct,
                        "cumulative_pct": round((growth - 1) * 100, 2),
                    }
                )
            return history


def divmod_month(day: date, months: int) -> tuple[int, int]:
    """(year, month) that is *months* after *day*."""
    index = day.year * 12 + (day.month - 1) + months
    return index // 12, index % 12 + 1
