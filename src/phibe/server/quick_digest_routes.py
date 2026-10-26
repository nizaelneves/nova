"""The quick digest on the home screen: what is new in the user's data sources, summarized.

``POST /api/quick-digest/generate`` reads the latest items of every connected source (news, newsletters,
notes, mail...), has the local model write two or three sentences per source and one line for the whole,
and keeps the result in a small JSON file. ``GET /api/quick-digest`` returns the last one.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException

from phibe.core.types import Message, Role

Items = Dict[str, List[Dict[str, str]]]

HOURS_BACK = 72
PER_SOURCE = 8

_SOURCE_PROMPT = (
    "You summarize the newest items of one of the user's data sources. Write plain text, two or three "
    "short sentences, using only facts from the items. No greeting, no markdown, no list."
)
_OVERVIEW_PROMPT = (
    "Write one sentence of at most 18 words that says the most important thing across these summaries. "
    "Plain text, only facts from the summaries."
)


def collect_recent(hours: int = HOURS_BACK, per_source: int = PER_SOURCE) -> Items:
    """The latest items of every connected source; sources that fail or have nothing are left out."""
    import phibe.connectors  # noqa: F401 - registers the connectors
    from phibe.core.registry import ConnectorRegistry

    since = datetime.now() - timedelta(hours=hours)
    found: Items = {}
    for key in ConnectorRegistry.keys():
        try:
            connector = ConnectorRegistry.get(key)()
            if not connector.is_connected():
                continue
            items: List[Dict[str, str]] = []
            for doc in connector.sync(since=since):
                items.append({
                    "title": str(doc.title or ""),
                    "text": str(doc.content or "")[:600],
                    "url": str(getattr(doc, "url", "") or ""),
                    "origin": str((getattr(doc, "metadata", None) or {}).get("feed_name") or ""),  # which feed or channel
                    "time": doc.timestamp.isoformat(timespec="seconds") if getattr(doc, "timestamp", None) else "",
                })
                if len(items) >= per_source:
                    break
            if items:
                found[key] = items
        except Exception:  # noqa: BLE001 - one broken source must not stop the digest
            continue
    return found


def _clean(text: str) -> str:
    """The model's answer without its thinking tags and stray markdown."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    return re.sub(r"[*_#`]+", "", text).strip()


def _ask(engine: Any, model: str, system: str, user: str, max_tokens: int) -> str:
    result = engine.generate(
        [Message(role=Role.SYSTEM, content=system), Message(role=Role.USER, content=user)],
        model=model,
        temperature=0.2,
        max_tokens=max_tokens,
    )
    return _clean(str(result.get("content", "")))


def _display_name(key: str) -> str:
    """The name of a source as its connector writes it ("Notion"); the key itself when it has none."""
    try:
        from phibe.core.registry import ConnectorRegistry

        name = getattr(ConnectorRegistry.get(key), "display_name", "")
        return str(name) if name else key
    except Exception:  # noqa: BLE001 - an unknown source keeps its key
        return key


_KINDS = {"news_rss": "rss", "gmail": "mail", "gmail_imap": "mail", "imap": "mail", "outlook": "mail"}


def _first_sentence(text: str, limit: int = 160) -> str:
    """The first sentence of *text*, flattened to one line and cut at *limit* characters."""
    flat = re.sub(r"\s+", " ", re.sub(r"[*_#`]+", "", text)).strip()
    sentence = re.split(r"(?<=[.!?])\s", flat, maxsplit=1)[0]
    return sentence if len(sentence) <= limit else sentence[: limit - 1].rstrip() + "…"


def _item_views(items: Items) -> List[Dict[str, str]]:
    """One small block per item for the widget: where it came from, a headline, one line and a link. No model needed."""
    views: List[Dict[str, str]] = []
    for source, entries in items.items():
        for e in entries:
            title = e.get("title", "").strip() or _first_sentence(e.get("text", ""), 80)
            views.append({
                "source": source,
                "source_name": _display_name(source),
                "kind": _KINDS.get(source, "other"),
                "title": title,
                "summary": _first_sentence(e.get("text", "")),
                "text": e.get("text", ""),
                "url": e.get("url", ""),
                "time": e.get("time", ""),
                "origin": e.get("origin", ""),
            })
    return views


def build_digest(engine: Any, model: str, items: Items) -> Dict[str, Any]:
    """Summarize every source, then the whole. Pure of I/O apart from the model calls."""
    sections: Dict[str, str] = {}
    for source, entries in items.items():
        block = "\n".join(f"- {e['title']}: {e['text']}".strip() for e in entries)
        try:
            summary = _ask(engine, model, _SOURCE_PROMPT, f"Source: {source}\n{block}", 250)
        except Exception:  # noqa: BLE001 - the model failed for this source: skip it
            continue
        if summary:
            sections[_display_name(source)] = summary

    count = sum(len(entries) for source, entries in items.items() if _display_name(source) in sections)
    if not sections:
        text = "Nothing new in your sources.\nTurn sources on in Settings, under Data Source, and write the digest again."
    else:
        headline = f"{count} New {'Item' if count == 1 else 'Items'} From {len(sections)} {'Source' if len(sections) == 1 else 'Sources'}"
        try:
            overview = _ask(engine, model, _OVERVIEW_PROMPT, "\n".join(f"{k}: {v}" for k, v in sections.items()), 80)
        except Exception:  # noqa: BLE001
            overview = ""
        text = f"{headline}\n{overview}".rstrip()
    return {
        "text": text,
        "sections": sections,
        "sources_used": list(sections),
        "items": _item_views(items),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "model_used": model,
    }


def create_quick_digest_router(
    get_engine: Callable[[], Any],
    get_model: Callable[[], str],
    *,
    path: Optional[Path] = None,
    collect: Callable[[], Items] = collect_recent,
) -> APIRouter:
    router = APIRouter(prefix="/api/quick-digest", tags=["quick-digest"])

    def file() -> Path:
        if path is not None:
            return path
        from phibe.core.paths import get_data_dir

        folder = get_data_dir()
        folder.mkdir(parents=True, exist_ok=True)
        return folder / "quick_digest.json"

    @router.get("")
    def latest() -> Dict[str, Any]:
        target = file()
        if not target.exists():
            raise HTTPException(status_code=404, detail="No digest yet")
        try:
            return json.loads(target.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=500, detail=f"The digest file is unreadable: {exc}") from exc

    @router.post("/generate")
    async def generate() -> Dict[str, Any]:
        def work() -> Dict[str, Any]:
            return build_digest(get_engine(), get_model(), collect())

        try:
            digest = await asyncio.to_thread(work)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Could not write the digest: {exc}") from exc
        file().write_text(json.dumps(digest, ensure_ascii=False), encoding="utf-8")
        return digest

    return router
