"""SQLite/FTS5 memory backend — zero-dependency default."""

from __future__ import annotations

import json
import re
import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from openjarvis.core.events import EventType, get_event_bus
from openjarvis.core.registry import MemoryRegistry
from openjarvis.tools.storage._stubs import MemoryBackend, RetrievalResult

_WORD_RE = re.compile(r"\w+", re.UNICODE)


def _check_fts5(conn: sqlite3.Connection) -> bool:
    """Return True if the SQLite build includes FTS5."""
    try:
        opts = conn.execute("PRAGMA compile_options").fetchall()
        return any("FTS5" in o[0].upper() for o in opts)
    except sqlite3.Error:
        return False


def _fts_query(query: str) -> str:
    """Build an OR-joined FTS5 query of quoted terms.

    Quoting keeps words like ``AND``/``NEAR`` from being parsed as FTS5
    operators.
    """
    return " OR ".join(f'"{w}"' for w in _WORD_RE.findall(query))


@MemoryRegistry.register("sqlite")
class SQLiteMemory(MemoryBackend):
    """Full-text search memory backend using SQLite FTS5.

    Uses the built-in ``sqlite3`` module — no extra dependencies.
    """

    backend_id: str = "sqlite"

    def __init__(self, db_path: str | Path = "") -> None:
        if not db_path:
            from openjarvis.core.config import DEFAULT_CONFIG_DIR

            db_path = str(DEFAULT_CONFIG_DIR / "memory.db")

        self._db_path = str(db_path)
        if self._db_path != ":memory:":
            self._db_path = str(Path(self._db_path).expanduser())
            Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)

        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self._db_path, timeout=10, check_same_thread=False)
        if self._db_path != ":memory:":
            self._conn.execute("PRAGMA journal_mode=WAL")
        self._create_tables()

    def _create_tables(self) -> None:
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
                id       TEXT PRIMARY KEY,
                content  TEXT NOT NULL,
                source   TEXT NOT NULL DEFAULT '',
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL DEFAULT (julianday('now'))
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
            USING fts5(
                content,
                source,
                tokenize='porter unicode61'
            );
        """)
        self._conn.commit()

    def _insert(self, content: str, source: str, meta_json: str) -> str:
        doc_id = str(uuid.uuid4())
        cur = self._conn.execute(
            "INSERT INTO documents (id, content, source, metadata) VALUES (?, ?, ?, ?)",
            (doc_id, content, source, meta_json),
        )
        self._conn.execute(
            "INSERT INTO documents_fts (rowid, content, source) VALUES (?, ?, ?)",
            (cur.lastrowid, content, source),
        )
        return doc_id

    def store(
        self,
        content: str,
        *,
        source: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Persist *content* and return a unique document id."""
        with self._lock, self._conn:
            doc_id = self._insert(content, source, json.dumps(metadata or {}))
        get_event_bus().publish(
            EventType.MEMORY_STORE,
            {"backend": self.backend_id, "doc_id": doc_id, "source": source},
        )
        return doc_id

    def replace_source(
        self,
        source: str,
        documents: List[tuple[str, Optional[Dict[str, Any]]]],
    ) -> List[str]:
        """Atomically replace all documents associated with *source*."""
        with self._lock, self._conn:
            self._conn.execute(
                "DELETE FROM documents_fts WHERE rowid IN "
                "(SELECT rowid FROM documents WHERE source = ?)",
                (source,),
            )
            self._conn.execute("DELETE FROM documents WHERE source = ?", (source,))
            doc_ids = [
                self._insert(content, source, json.dumps(metadata or {}))
                for content, metadata in documents
            ]
        bus = get_event_bus()
        for doc_id in doc_ids:
            bus.publish(
                EventType.MEMORY_STORE,
                {"backend": self.backend_id, "doc_id": doc_id, "source": source},
            )
        return doc_ids

    def retrieve(
        self,
        query: str,
        *,
        top_k: int = 5,
        **kwargs: Any,
    ) -> List[RetrievalResult]:
        """Search via FTS5 MATCH with BM25 ranking."""
        fts_query = _fts_query(query)
        if not fts_query:
            return []

        with self._lock:
            rows = self._conn.execute(
                "SELECT d.content, d.source, d.metadata, "
                "bm25(documents_fts, 1.0, 0.5) * -1 AS score "
                "FROM documents_fts f JOIN documents d ON d.rowid = f.rowid "
                "WHERE documents_fts MATCH ? "
                "ORDER BY bm25(documents_fts, 1.0, 0.5) LIMIT ?",
                (fts_query, top_k),
            ).fetchall()

        results = []
        for content, source, meta_json, score in rows:
            try:
                metadata = json.loads(meta_json) if meta_json else {}
            except json.JSONDecodeError:
                metadata = {}
            results.append(
                RetrievalResult(
                    content=content,
                    score=float(score or 0.0),
                    source=source or "",
                    metadata=metadata,
                )
            )

        get_event_bus().publish(
            EventType.MEMORY_RETRIEVE,
            {
                "backend": self.backend_id,
                "query": query,
                "num_results": len(results),
            },
        )
        return results

    def delete(self, doc_id: str) -> bool:
        """Delete a document by id."""
        with self._lock, self._conn:
            self._conn.execute(
                "DELETE FROM documents_fts WHERE rowid = "
                "(SELECT rowid FROM documents WHERE id = ?)",
                (doc_id,),
            )
            cur = self._conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        return cur.rowcount > 0

    def clear(self) -> None:
        """Remove all stored documents."""
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM documents_fts")
            self._conn.execute("DELETE FROM documents")

    def count(self) -> int:
        """Return the number of stored documents."""
        with self._lock:
            return self._conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]

    def close(self) -> None:
        """Close the database connection."""
        with self._lock:
            self._conn.close()


__all__ = ["SQLiteMemory"]
