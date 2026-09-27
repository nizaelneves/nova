"""Anytype connector — a read-only copy of your notes for Nova to search.

Anytype runs a local API on your own computer (the app must be open). This
connector reads every note through it and hands the text to Nova's index, which
splits it into pieces and gives each one an embedding ("map of meaning") so the
right note can be found even when the words differ.

Read-only by design: only ``GET`` requests are ever sent, and the API key you
create in Anytype can be restricted to reading.

The key is read, in this order, from: the constructor, ``credentials.toml``
(``[anytype] ANYTYPE_API_KEY``), or the file written by the Data Sources screen
(``~/.nova/connectors/anytype.json``).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional, Tuple

import httpx

from nova.connectors._stubs import BaseConnector, Document, SyncStatus
from nova.connectors.oauth import delete_tokens, load_tokens, save_tokens
from nova.core.config import DEFAULT_CONFIG_DIR
from nova.core.credentials import get_tool_credential
from nova.core.registry import ConnectorRegistry

logger = logging.getLogger(__name__)

DEFAULT_URL = "http://127.0.0.1:31009"
_CREDENTIALS_PATH = str(DEFAULT_CONFIG_DIR / "connectors" / "anytype.json")
_PAGE_SIZE = 100
# Keys limited to some spaces (the safe way to give Nova read access) only work
# on the /v2 routes; /v1 refuses them.
_API = "/v2"
_TIMEOUT = 30.0

# Object types that carry no readable text of their own.
SKIP_TYPES = frozenset(
    {
        "set",
        "collection",
        "file",
        "image",
        "video",
        "audio",
        "pdf",
        "template",
        "type",
        "relation",
        "relation_option",
        "space_view",
        "participant",
        "chat",
        "dashboard",
    }
)

_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_TIMESTAMP_LINE = re.compile(r"^\s*\d{1,2}:\d{2}(?::\d{2})?\s*$")


class AnytypeError(RuntimeError):
    """Anytype could not be reached or refused the request."""


def _anytype_get(
    base_url: str,
    api_key: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    version: str = "",
) -> Dict[str, Any]:
    """The only network call this connector makes: a ``GET`` on the local API."""
    headers = {"Authorization": f"Bearer {api_key}"}
    if version:
        headers["Anytype-Version"] = version
    try:
        response = httpx.get(
            f"{base_url.rstrip('/')}{path}",
            headers=headers,
            params=params,
            timeout=_TIMEOUT,
        )
    except httpx.ConnectError as exc:
        raise AnytypeError(
            "Anytype is not reachable. Open the Anytype app and try again."
        ) from exc
    except httpx.HTTPError as exc:
        raise AnytypeError(f"Could not talk to Anytype: {type(exc).__name__}") from exc
    if response.status_code in (401, 403):
        raise AnytypeError("Anytype rejected the API key. Create a new key and retry.")
    if response.status_code >= 400:
        detail = ""
        try:
            detail = str(response.json().get("message", ""))[:200]
        except (ValueError, AttributeError):
            pass
        raise AnytypeError(f"Anytype error {response.status_code}: {detail}".strip())
    try:
        return response.json()
    except ValueError as exc:
        raise AnytypeError("Anytype sent an answer Nova could not read.") from exc


def clean_markdown(markdown: str) -> str:
    """Remove what only adds noise to a search index.

    Local image links point at the Anytype app and mean nothing outside it;
    lines that are just a video timestamp (``0:12``) come from pasted
    transcripts and would dominate the embeddings.
    """
    text = _IMAGE.sub("", markdown or "")
    lines = [
        line.rstrip() for line in text.splitlines() if not _TIMESTAMP_LINE.match(line)
    ]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _parse_time(value: Any) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(tz=timezone.utc)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _type_key(obj: Dict[str, Any]) -> str:
    kind = obj.get("type")
    if isinstance(kind, dict):
        kind = kind.get("key") or kind.get("name")
    return str(kind or "").lower()


@ConnectorRegistry.register("anytype")
class AnytypeConnector(BaseConnector):
    """Read-only index of Anytype objects."""

    connector_id = "anytype"
    display_name = "Anytype"
    auth_type = "token"
    replaces_existing = True

    def __init__(
        self,
        api_key: str = "",
        *,
        base_url: str = "",
        credentials_path: str = "",
    ) -> None:
        self._token = api_key
        self._base_url = base_url
        self._credentials_path = credentials_path or _CREDENTIALS_PATH
        self._items_synced = 0
        self._items_total = 0
        self._last_sync: Optional[datetime] = None
        self._error: Optional[str] = None
        self._state = "idle"

    # -- credentials ---------------------------------------------------------

    def _key(self) -> str:
        if self._token:
            return self._token
        stored = get_tool_credential("anytype", "ANYTYPE_API_KEY")
        if stored:
            return stored
        return (load_tokens(self._credentials_path) or {}).get("token", "")

    def _url(self) -> str:
        return (
            self._base_url
            or get_tool_credential("anytype", "ANYTYPE_URL")
            or DEFAULT_URL
        )

    def _version(self) -> str:
        return get_tool_credential("anytype", "ANYTYPE_API_VERSION") or ""

    def _get(
        self, path: str, params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        return _anytype_get(self._url(), self._key(), path, params, self._version())

    def is_connected(self) -> bool:
        return bool(self._key())

    def set_token(self, token: str) -> None:
        """Save the API key pasted in the Data Sources screen."""
        token = (token or "").strip()
        if not token:
            raise ValueError("An Anytype API key is required")
        save_tokens(self._credentials_path, {"token": token})

    def disconnect(self) -> None:
        """Forget the key saved by the Data Sources screen (not credentials.toml)."""
        self._token = ""
        delete_tokens(self._credentials_path)

    # -- reading -------------------------------------------------------------

    def _pages(
        self, path: str, extra: Optional[Dict[str, Any]] = None
    ) -> Iterator[Dict[str, Any]]:
        offset = 0
        while True:
            params = {"limit": _PAGE_SIZE, "offset": offset, **(extra or {})}
            page = self._get(path, params)
            rows = page.get("data") or []
            yield from rows
            if not rows or not page.get("has_more"):
                return
            offset += len(rows)

    def _objects(self) -> Iterator[Tuple[str, Dict[str, Any]]]:
        """Every text-bearing object of every space the key can reach."""
        for space in self._pages(f"{_API}/spaces"):
            space_id = space.get("id")
            if not space_id:
                continue
            listing = f"{_API}/spaces/{space_id}/objects"
            # The list only carries the edit date when it is asked for.
            for obj in self._pages(listing, {"fields": "last_modified_date"}):
                if not obj.get("id") or obj.get("archived"):
                    continue
                if _type_key(obj) in SKIP_TYPES:
                    continue
                yield space_id, obj

    @staticmethod
    def _doc_id(space_id: str, object_id: str) -> str:
        return f"anytype:{space_id}:{object_id}"

    def current_doc_ids(self) -> Optional[set[str]]:
        try:
            return {self._doc_id(s, o["id"]) for s, o in self._objects()}
        except AnytypeError as exc:
            # Without a complete listing nothing may be pruned.
            logger.warning("Anytype listing failed, keeping the index as is: %s", exc)
            return None

    def sync(
        self,
        *,
        since: Optional[datetime] = None,
        cursor: Optional[str] = None,
    ) -> Iterator[Document]:
        """Yield the notes that are new or edited since *since* (all if ``None``)."""
        if not self.is_connected():
            return
        self._state, self._error = "syncing", None
        self._items_synced = self._items_total = 0
        try:
            for space_id, obj in self._objects():
                self._items_total += 1
                props = obj.get("properties") or {}
                edited = _parse_time(props.get("last_modified_date"))
                if since is not None and edited <= since:
                    continue
                note = self._get(
                    f"{_API}/spaces/{space_id}/objects/{obj['id']}", {"format": "md"}
                )
                text = clean_markdown(note.get("markdown", ""))
                title = str(obj.get("name") or "").strip()
                if len(text.replace(f"# {title}", "").strip()) < 1:
                    continue
                self._items_synced += 1
                yield Document(
                    doc_id=self._doc_id(space_id, obj["id"]),
                    source="anytype",
                    doc_type="note",
                    title=title or "(untitled)",
                    content=text,
                    timestamp=edited,
                    url=f"anytype://object?objectId={obj['id']}&spaceId={space_id}",
                    metadata={"space_id": space_id, "anytype_type": _type_key(obj)},
                )
        except AnytypeError as exc:
            self._state, self._error = "error", str(exc)
            raise
        self._state, self._last_sync = "idle", datetime.now(tz=timezone.utc)

    def sync_status(self) -> SyncStatus:
        return SyncStatus(
            state=self._state,
            items_synced=self._items_synced,
            items_total=self._items_total,
            last_sync=self._last_sync,
            error=self._error,
        )

    def mcp_tools(self) -> List[Any]:
        return []
