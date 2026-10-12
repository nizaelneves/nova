"""What Phibe remembers about you, as two plain-text notes you can read and edit.

* ``USER.md``   - about you: name, language, work, goals.
* ``MEMORY.md`` - things Phibe should keep in mind between conversations.

Both live in the Phibe folder (``~/.phibe``). The chat builds its system prompt
from these files on every request, so an edit is used from the next message.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from phibe.core.paths import get_config_dir

logger = logging.getLogger(__name__)

MAX_NOTE_CHARS = 20_000

_FILES = {"about_you": "USER.md", "memories": "MEMORY.md"}


def _path(field: str) -> Path:
    return get_config_dir() / _FILES[field]


def read_note(field: str) -> str:
    try:
        return _path(field).read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""
    except OSError as exc:
        logger.warning("Could not read %s (%s)", _FILES[field], exc)
        return ""


def write_note(field: str, text: str) -> None:
    """Write atomically so a crash never leaves half a file."""
    target = _path(field)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        os.replace(tmp, target)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def create_memory_notes_router() -> APIRouter:
    router = APIRouter(prefix="/v1/memory-notes", tags=["memory"])

    @router.get("")
    async def get_notes() -> Dict[str, str]:
        return {field: read_note(field) for field in _FILES}

    @router.put("")
    async def put_notes(body: Dict[str, Any]) -> Dict[str, str]:
        """Change one or both notes; the ones not sent stay as they are."""
        unknown = set(body) - set(_FILES)
        if unknown:
            raise HTTPException(
                status_code=422, detail=f"Unknown note(s): {', '.join(sorted(unknown))}"
            )
        for field, text in body.items():
            if not isinstance(text, str):
                raise HTTPException(status_code=422, detail=f"{field} must be text")
            if len(text) > MAX_NOTE_CHARS:
                raise HTTPException(
                    status_code=422,
                    detail=f"{field} can have at most {MAX_NOTE_CHARS} characters",
                )
        for field, text in body.items():
            write_note(field, text)
        return {field: read_note(field) for field in _FILES}

    return router
