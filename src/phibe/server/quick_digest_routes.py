"""The quick digest on the home screen: what is new in the user's data sources, summarized.

``POST /api/quick-digest/generate`` reads the latest items of every connected source (news, newsletters,
notes, mail...), has the local model write two or three sentences per source and one line for the whole,
and keeps the result in a small JSON file. ``GET /api/quick-digest`` returns the last one.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException

from phibe.core.types import Message, Role

logger = logging.getLogger(__name__)
Items = Dict[str, List[Dict[str, str]]]

HOURS_BACK = 168  # 7 days
PER_SOURCE = 30

_SOURCE_PROMPT = (
    "You summarize the newest items of one of the user's data sources. Write plain text, two or three "
    "short sentences, using only facts from the items. No greeting, no markdown, no list."
)
_OVERVIEW_PROMPT = (
    "Write one sentence of at most 18 words that says the most important thing across these summaries. "
    "Plain text, only facts from the summaries."
)


def collect_recent(hours: int = HOURS_BACK, per_source: int = PER_SOURCE, only: Optional[str] = None) -> Items:
    """The latest items of every connected source (or just *only*); sources that fail or have nothing are left out."""
    import phibe.connectors  # noqa: F401 - registers the connectors
    from phibe.core.registry import ConnectorRegistry

    since = datetime.now() - timedelta(hours=hours)
    found: Items = {}
    for key in [only] if only else ConnectorRegistry.keys():
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
    """The name of a source as its connector writes it ("Gmail"); the key itself when it has none."""
    try:
        from phibe.core.registry import ConnectorRegistry

        name = getattr(ConnectorRegistry.get(key), "display_name", "")
        return str(name) if name else key
    except Exception:  # noqa: BLE001 - an unknown source keeps its key
        return key


_KINDS = {"news_rss": "rss", "gmail": "mail", "gmail_imap": "mail", "imap": "mail"}


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


def merge_source(digest: Optional[Dict[str, Any]], source: str, entries: List[Dict[str, str]]) -> Dict[str, Any]:
    """The digest with *source* read again: its blocks replaced, the other sources and their summaries untouched.

    No model is asked, so this is cheap enough to run on every source's own rhythm.
    """
    base = dict(digest or {})
    views = _item_views({source: entries} if entries else {}) + [v for v in base.get("items", []) if v.get("source") != source]
    sections = {k: v for k, v in (base.get("sections") or {}).items() if entries or k != _display_name(source)}
    if views:
        count, kinds = len(views), len({v["source"] for v in views})
        overview = (base.get("text") or "").partition("\n")[2].strip()
        headline = f"{count} New {'Item' if count == 1 else 'Items'} From {kinds} {'Source' if kinds == 1 else 'Sources'}"
        text = f"{headline}\n{overview}".rstrip()
    else:
        text = "Nothing new in your sources.\nTurn sources on in Settings, under Data Source, and write the digest again."
    return {
        **base,
        "text": text,
        "sections": sections,
        "sources_used": list(dict.fromkeys(v["source_name"] for v in views)),
        "items": views,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "model_used": base.get("model_used", ""),
    }


def connected_sources() -> List[str]:
    """The connectors that are switched on right now."""
    import phibe.connectors  # noqa: F401 - registers the connectors
    from phibe.core.registry import ConnectorRegistry

    live: List[str] = []
    for key in ConnectorRegistry.keys():
        try:
            if ConnectorRegistry.get(key)().is_connected():
                live.append(key)
        except Exception:  # noqa: BLE001 - a broken connector is simply not live
            continue
    return live


def start_digest_refresh(
    refresh: Callable[[str], None],
    *,
    sources: Callable[[], List[str]] = connected_sources,
    get_settings: Optional[Callable[[], Any]] = None,
    first_delay: float = 30.0,
    tick: float = 30.0,
    seconds_per_minute: float = 60.0,
    clock: Callable[[], float] = time.monotonic,
    wall_clock: Callable[[], datetime] = datetime.now,
    stop: Optional[threading.Event] = None,
) -> tuple[threading.Thread, threading.Event]:
    """Call ``refresh(source)`` for each connected source on the rhythm that source has in the sync settings.

    The rhythm is the source's own (``intervals``) or the general one; "only when Phibe starts" refreshes once,
    once a day refreshes at the source's time. Every source is read once shortly after start so the digest
    is current. Nothing runs while automatic sync is off or the source is switched off there.
    """
    from phibe.connectors.sync_settings import DAILY_MINUTES, ON_START_ONLY_MINUTES, load_sync_settings

    get_settings = get_settings or load_sync_settings
    stop = stop or threading.Event()

    def loop() -> None:
        started = clock()
        last: Dict[str, float] = {}
        done_on: Dict[str, Any] = {}
        while not stop.wait(tick):
            now = clock()
            settings = get_settings()
            if not settings.auto_enabled or now - started < first_delay:
                continue
            today = wall_clock().date()
            for source in sources():
                if source in settings.disabled_connectors:
                    continue
                minutes = settings.intervals.get(source, settings.interval_minutes)
                at = settings.daily_times.get(source, settings.daily_time)
                hour, minute = (int(p) for p in at.split(":"))
                past = (wall_clock().hour, wall_clock().minute) >= (hour, minute)
                if source in last:  # already read at least once since Phibe started
                    if minutes == ON_START_ONLY_MINUTES:
                        continue
                    if minutes == DAILY_MINUTES:
                        if done_on.get(source) == today or not past:
                            continue
                    elif now - last[source] < minutes * seconds_per_minute:
                        continue
                last[source] = now
                if past:
                    done_on[source] = today
                try:
                    refresh(source)
                except Exception:  # noqa: BLE001 - one source must not stop the rest
                    logger.exception("Digest refresh failed for %s", source)

    thread = threading.Thread(target=loop, name="phibe-digest-refresh", daemon=True)
    thread.start()
    return thread, stop


def create_quick_digest_router(
    get_engine: Callable[[], Any],
    get_model: Callable[[], str],
    *,
    path: Optional[Path] = None,
    collect: Callable[[], Items] = collect_recent,
    collect_one: Callable[[str], Items] = lambda source: collect_recent(only=source),
) -> APIRouter:
    router = APIRouter(prefix="/api/quick-digest", tags=["quick-digest"])
    write_lock = threading.Lock()  # the background refresh and a manual write must not overwrite each other

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
        with write_lock:
            file().write_text(json.dumps(digest, ensure_ascii=False), encoding="utf-8")
        return digest

    def refresh_source(source: str) -> None:
        """Read one source again and keep the rest of the digest as it is (called on that source's rhythm)."""
        entries = collect_one(source).get(source, [])
        with write_lock:
            target = file()
            try:
                current = json.loads(target.read_text(encoding="utf-8")) if target.exists() else None
            except (OSError, ValueError):
                current = None
            target.write_text(json.dumps(merge_source(current, source, entries), ensure_ascii=False), encoding="utf-8")

    router.refresh_source = refresh_source  # type: ignore[attr-defined]
    return router
