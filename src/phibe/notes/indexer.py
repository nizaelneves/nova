"""Build the search copy of the notes inside ``knowledge.db`` (source ``notes``).

Only notes whose text, tags, collections or embedding model changed are indexed again, so editing one
note never touches the others. The index holds copies: deleting it loses nothing, and it can be rebuilt.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from phibe.connectors._stubs import Document
from phibe.connectors.pipeline import IngestionPipeline
from phibe.connectors.store import KnowledgeStore
from phibe.notes.pdftext import pdf_text
from phibe.notes.store import NotesStore

SOURCE = "notes"
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_TIMESTAMP_LINE = re.compile(r"^\s*\d{1,2}:\d{2}(?::\d{2})?\s*$")


def clean_markdown(markdown: str) -> str:
    """Remove what only adds noise to a search index: image links, and lines that are just a video timestamp (``0:12``)."""
    text = _IMAGE.sub("", markdown or "")
    lines = [line.rstrip() for line in text.splitlines() if not _TIMESTAMP_LINE.match(line)]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


class EmbeddingUnavailable(RuntimeError):
    """The embedding model cannot be used right now (for example it is not installed in Ollama)."""


def note_text(note: Dict[str, Any]) -> str:
    """What gets embedded and searched: the cleaned text plus its tags and collections."""
    if note["kind"] == "bookmark":
        body = "\n".join(p for p in (note["description"], note["url"]) if p)
    else:
        body = "\n\n".join(p for p in (clean_markdown(note["body"]), pdf_text(note["body"])) if p)
    extra = []
    if note["tags"]:
        extra.append("Tags: " + ", ".join(note["tags"]))
    if note["collections"]:
        extra.append("Collections: " + ", ".join(c["name"] for c in note["collections"]))
    return "\n\n".join(p for p in [body, *extra] if p).strip()


def _complete(knowledge: KnowledgeStore, doc_id: str) -> bool:
    """True when the document has chunks and every one of them got its embedding."""
    chunks, vectors = knowledge._conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(embedding IS NOT NULL), 0) FROM knowledge_chunks WHERE doc_id = ?", (doc_id,)
    ).fetchone()
    return chunks > 0 and chunks == vectors


def index_pending(
    notes: NotesStore,
    knowledge: KnowledgeStore,
    embedder: Any,
    *,
    limit: Optional[int] = None,
    progress: Optional[Callable[[int, int], None]] = None,
) -> Dict[str, int]:
    if not embedder.is_available():
        raise EmbeddingUnavailable(f"The embedding model '{embedder.model_version}' is not installed in Ollama.")
    model = embedder.model_version
    pipeline = IngestionPipeline(knowledge, embedder=embedder)
    todo = notes.pending_index(model)
    if limit is not None:
        todo = todo[:limit]
    out = {"indexed": 0, "failed": 0, "removed": 0, "pending": 0}
    for i, note in enumerate(todo, 1):
        if progress:
            progress(i, len(todo))
        doc_id = f"{SOURCE}:{note['id']}"
        text = note_text(note)
        if not text:
            knowledge.delete(doc_id)
            notes.mark_indexed(note["id"], note["hash"], model)
            continue
        doc = Document(
            doc_id=doc_id,
            source=SOURCE,
            doc_type="note",
            title=note["title"] or "(untitled)",
            content=text,
            timestamp=datetime.fromtimestamp(note["updated_at"], tz=timezone.utc),
            url=f"phibe://notes/{note['id']}",
            metadata={"note_id": note["id"], "tags": note["tags"]},
        )
        pipeline.ingest([doc], replace=True)
        if _complete(knowledge, doc_id):
            notes.mark_indexed(note["id"], note["hash"], model)
            out["indexed"] += 1
        else:  # a vector is missing: leave it pending so the next run retries
            out["failed"] += 1
    for nid in notes.trashed_still_indexed():
        knowledge.delete(f"{SOURCE}:{nid}")
        notes.mark_unindexed(nid)
        out["removed"] += 1
    out["pending"] = len(notes.pending_index(model))
    return out
