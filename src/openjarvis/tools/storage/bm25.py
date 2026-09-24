"""BM25 memory backend — classic term-frequency retrieval."""

from __future__ import annotations

import math
import re
import threading
import uuid
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from openjarvis.core.events import EventType, get_event_bus
from openjarvis.core.registry import MemoryRegistry
from openjarvis.tools.storage._stubs import MemoryBackend, RetrievalResult

_EDGE_PUNCT_RE = re.compile(r"^[\W_]+|[\W_]+$")


def _tokenize(text: str) -> Counter[str]:
    """Lowercase whitespace tokenizer that strips surrounding punctuation."""
    terms: Counter[str] = Counter()
    for word in text.split():
        normalized = _EDGE_PUNCT_RE.sub("", word.lower())
        if normalized:
            terms[normalized] += 1
    return terms


@dataclass(slots=True)
class _Document:
    id: str
    content: str
    source: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    terms: Counter[str] = field(default_factory=Counter)
    length: int = 0


@MemoryRegistry.register("bm25")
class BM25Memory(MemoryBackend):
    """In-memory BM25 (Okapi) retrieval backend.

    All data lives in memory — there is no persistence across restarts.
    """

    backend_id: str = "bm25"

    def __init__(self, k1: float = 1.2, b: float = 0.75) -> None:
        self._k1 = k1
        self._b = b
        self._docs: List[_Document] = []
        self._lock = threading.Lock()

    # -- ABC implementation -------------------------------------------------

    def store(
        self,
        content: str,
        *,
        source: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Persist *content* and return a unique document id."""
        terms = _tokenize(content)
        doc = _Document(
            id=str(uuid.uuid4()),
            content=content,
            source=source,
            metadata=dict(metadata or {}),
            terms=terms,
            length=sum(terms.values()),
        )
        with self._lock:
            self._docs.append(doc)
        get_event_bus().publish(
            EventType.MEMORY_STORE,
            {"backend": self.backend_id, "doc_id": doc.id, "source": source},
        )
        return doc.id

    def retrieve(
        self,
        query: str,
        *,
        top_k: int = 5,
        **kwargs: Any,
    ) -> List[RetrievalResult]:
        """Search for *query* and return the top-k results."""
        query_terms = _tokenize(query)
        with self._lock:
            docs = list(self._docs)
        if not docs or not query_terms:
            return []

        n = len(docs)
        avg_dl = sum(d.length for d in docs) / n or 1.0
        df: Counter[str] = Counter()
        for doc in docs:
            df.update(doc.terms.keys())

        scored = []
        for doc in docs:
            score = 0.0
            for term in query_terms:
                tf = doc.terms.get(term, 0)
                if not tf:
                    continue
                idf = math.log((n - df[term] + 0.5) / (df[term] + 0.5) + 1.0)
                norm = self._k1 * (1.0 - self._b + self._b * doc.length / avg_dl)
                score += idf * (tf * (self._k1 + 1.0)) / (tf + norm)
            if score > 0.0:
                scored.append((score, doc))
        scored.sort(key=lambda item: item[0], reverse=True)

        results = [
            RetrievalResult(
                content=doc.content,
                score=score,
                source=doc.source,
                metadata=dict(doc.metadata),
            )
            for score, doc in scored[:top_k]
        ]
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
        with self._lock:
            before = len(self._docs)
            self._docs = [d for d in self._docs if d.id != doc_id]
            return len(self._docs) < before

    def clear(self) -> None:
        """Remove all stored documents."""
        with self._lock:
            self._docs.clear()

    def count(self) -> int:
        """Return the number of stored documents."""
        with self._lock:
            return len(self._docs)


__all__ = ["BM25Memory"]
