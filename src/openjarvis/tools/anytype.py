"""Read-only, compact Anytype tools for small local models.

Talks to the local Anytype API (``http://127.0.0.1:31009``). Results are kept
deliberately small (few hits, short snippets, truncated bodies) so a small
model can answer from them instead of drowning in metadata.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_KEY_ENV = "ANYTYPE_API_KEY"
_URL_ENV = "ANYTYPE_API_URL"
_DEFAULT_URL = "http://127.0.0.1:31009"
_API_VERSION = "2025-11-08"
_TIMEOUT = 15.0
_MAX_HITS = 5
_TAG_SCAN = 200  # hits fetched (not returned) when filtering by tag
_SNIPPET_CHARS = 220
_TOP_HIT_CHARS = 900
_DEFAULT_READ_CHARS = 2000
_MAX_READ_CHARS = 4000
_TYPES = ["page", "note", "project"]

# object_id -> space_id, filled by searches so refs can be just the object id.
_REF_SPACES: dict[str, str] = {}


class _AnytypeError(Exception):
    pass


def _request(method: str, path: str, **kwargs: Any) -> dict[str, Any]:
    key = os.environ.get(_KEY_ENV, "").strip()
    if not key or key == "COLE_SUA_CHAVE_AQUI":
        raise _AnytypeError(f"{_KEY_ENV} is not set (put it in the .env file).")
    base = os.environ.get(_URL_ENV, _DEFAULT_URL).rstrip("/")
    headers = {"Authorization": f"Bearer {key}", "Anytype-Version": _API_VERSION}
    try:
        resp = httpx.request(
            method, f"{base}/v1{path}", headers=headers, timeout=_TIMEOUT, **kwargs
        )
    except httpx.ConnectError as exc:
        raise _AnytypeError("Anytype is not running (open the Anytype app).") from exc
    except httpx.HTTPError as exc:
        raise _AnytypeError(f"Anytype request failed: {exc}") from exc
    if resp.status_code == 401:
        raise _AnytypeError("Anytype rejected the API key (401).")
    if resp.status_code == 429:
        raise _AnytypeError("Anytype rate limit exceeded; try again shortly.")
    if resp.status_code >= 400:
        raise _AnytypeError(f"Anytype returned HTTP {resp.status_code}.")
    return resp.json()


def _tags(obj: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for prop in obj.get("properties") or []:
        if prop.get("key") == "tag":
            names.extend(t.get("name", "") for t in prop.get("multi_select") or [])
    return [n for n in names if n]


def _tag_matches(obj: dict[str, Any], wanted: str) -> bool:
    wanted = wanted.strip().lower()
    for prop in obj.get("properties") or []:
        if prop.get("key") == "tag":
            for t in prop.get("multi_select") or []:
                if wanted in (t.get("name", "").lower(), t.get("key", "").lower()):
                    return True
    return False


def _clip(text: str, limit: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _search(query: str, types: list[str], fetch: int) -> list[dict[str, Any]]:
    body = {"query": query, "types": types}
    data = _request("POST", "/search", params={"limit": fetch}, json=body)
    return data.get("data") or []


@ToolRegistry.register("anytype_search")
class AnytypeSearchTool(BaseTool):
    """Small, targeted search over the user's Anytype notes."""

    tool_id = "anytype_search"
    is_local = True

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="anytype_search",
            description=(
                "Search the user's personal notes in Anytype (second brain). Use "
                "this FIRST for any question about the user's notes; never look "
                "for Anytype files on disk. Returns at most 5 hits: title, tags, "
                "a snippet (the first hit includes more text) and a 'ref'. Note "
                "titles may be in English even if the question is in Portuguese. "
                "Set 'tag' ONLY if the user named a tag. If the snippet is not "
                "enough, call anytype_read with the ref."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Keyword(s) to look for in title and content.",
                    },
                    "tag": {
                        "type": "string",
                        "description": "Only if the user named a tag; else omit.",
                    },
                    "type": {
                        "type": "string",
                        "description": "Optional object type: page, note, project.",
                    },
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": _MAX_HITS,
                        "description": f"Max hits (1-{_MAX_HITS}, default 3).",
                    },
                },
                "required": ["query"],
            },
            category="knowledge",
            timeout_seconds=30.0,
        )

    def _find(
        self, query: str, tag: str, types: list[str], limit: int, notes: list[str]
    ) -> list[dict[str, Any]]:
        def run(q: str, use_tag: bool) -> list[dict[str, Any]]:
            found = _search(q, types, _TAG_SCAN if use_tag else limit)
            return [h for h in found if _tag_matches(h, tag)] if use_tag else found

        hits = run(query, bool(tag))
        if tag and query and len(hits) < limit:
            # The words may be filler ("titles", or the tag itself): the tag
            # alone is what the user asked for, so top up with tagged notes.
            seen = {h.get("id") for h in hits}
            extra = [h for h in run("", True) if h.get("id") not in seen]
            if extra:
                hits = hits + extra
                notes.append(f"(all listed notes have tag '{tag}')")
        if not hits and tag:
            hits = run(query, False)
            if hits:
                notes.append(f"(no note has tag '{tag}'; these are NOT tagged '{tag}')")
        if not hits and len(query.split()) > 1:
            for word in sorted(query.split(), key=len, reverse=True)[:3]:
                hits = run(word, False)
                if hits:
                    notes.append(f"(no exact match; matched on '{word}')")
                    break
        return hits

    def execute(self, **params: Any) -> ToolResult:
        query = str(params.get("query") or "").strip()
        tag = str(params.get("tag") or "").strip()
        obj_type = str(params.get("type") or "").strip().lower()
        try:
            limit = int(params.get("limit") or 3)
        except (TypeError, ValueError):
            limit = 3
        limit = max(1, min(limit, _MAX_HITS))
        if not query and not tag:
            return ToolResult("anytype_search", "Provide a query or a tag.", False)

        notes: list[str] = []
        try:
            hits = self._find(
                query, tag, [obj_type] if obj_type else _TYPES, limit, notes
            )
        except _AnytypeError as exc:
            return ToolResult("anytype_search", str(exc), False)
        hits = hits[:limit]
        if not hits:
            return ToolResult("anytype_search", "No matching notes found.", True)

        lines = list(notes)
        for i, h in enumerate(hits, 1):
            obj_id, space_id = h.get("id", ""), h.get("space_id", "")
            _REF_SPACES[obj_id] = space_id
            text = _clip(h.get("snippet", ""), _SNIPPET_CHARS)
            if i == 1:  # give the best hit more text so one call can suffice
                try:
                    full = _request(
                        "GET",
                        f"/spaces/{space_id}/objects/{obj_id}",
                        params={"format": "md"},
                    ).get("object", {})
                    text = _clip(full.get("markdown", ""), _TOP_HIT_CHARS) or text
                except _AnytypeError:
                    pass
            lines.append(
                f"{i}. {h.get('name') or '(untitled)'} "
                f"[{(h.get('type') or {}).get('name', '?')}] "
                f"tags: {', '.join(_tags(h)) or '-'}\n"
                f"   {text}\n"
                f"   ref: {obj_id}"
            )
        return ToolResult("anytype_search", "\n".join(lines), True)


@ToolRegistry.register("anytype_read")
class AnytypeReadTool(BaseTool):
    """Read one Anytype note found via anytype_search (truncated)."""

    tool_id = "anytype_read"
    is_local = True

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="anytype_read",
            description=(
                "Read the text of ONE Anytype note, using the 'ref' returned by "
                "anytype_search. The text is truncated; only use it to answer."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "ref": {
                        "type": "string",
                        "description": "The 'ref' value from anytype_search.",
                    },
                    "max_chars": {
                        "type": "integer",
                        "minimum": 200,
                        "maximum": _MAX_READ_CHARS,
                        "description": f"Default {_DEFAULT_READ_CHARS}.",
                    },
                },
                "required": ["ref"],
            },
            category="knowledge",
            timeout_seconds=30.0,
        )

    def execute(self, **params: Any) -> ToolResult:
        object_id = str(params.get("ref") or "").strip().rpartition("|")[2]
        if not object_id:
            return ToolResult(
                "anytype_read", "Invalid ref; use the ref from anytype_search.", False
            )
        try:
            max_chars = int(params.get("max_chars") or _DEFAULT_READ_CHARS)
        except (TypeError, ValueError):
            max_chars = _DEFAULT_READ_CHARS
        max_chars = max(200, min(max_chars, _MAX_READ_CHARS))

        try:
            if object_id in _REF_SPACES:
                spaces = [_REF_SPACES[object_id]]
            else:
                spaces = [s["id"] for s in _request("GET", "/spaces").get("data", [])]
            data = None
            for space_id in spaces:
                try:
                    data = _request(
                        "GET",
                        f"/spaces/{space_id}/objects/{object_id}",
                        params={"format": "md"},
                    )
                    break
                except _AnytypeError:
                    continue
        except _AnytypeError as exc:
            return ToolResult("anytype_read", str(exc), False)
        if data is None:
            return ToolResult(
                "anytype_read", "Note not found; use a ref from anytype_search.", False
            )

        obj = data.get("object") or {}
        text = obj.get("markdown") or obj.get("snippet") or ""
        body = text[:max_chars].rstrip() + (
            "\n[...truncated]" if len(text) > max_chars else ""
        )
        return ToolResult(
            "anytype_read",
            f"# {obj.get('name') or '(untitled)'}\n"
            f"tags: {', '.join(_tags(obj)) or '-'}\n\n{body}",
            True,
        )
