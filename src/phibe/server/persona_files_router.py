"""The two text files that shape every answer, read and edited from the Phibe screen.

* ``SOUL.md`` - who Phibe is and how she behaves.
* ``USER.md`` - who the user is.

Both live in the Phibe folder. Each has a size limit (``[system_prompt]`` ``soul_max_chars`` and
``user_max_chars``): a longer text would be cut in the middle when the prompt is built, so it is refused
here instead. A save takes effect from the next message.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

_FILES = ("soul", "user", "instructions")
INSTRUCTIONS_MAX_CHARS = 2000


def _paths_and_limits(cfg: Any) -> Dict[str, tuple]:
    from phibe.prompt.builder import SystemPromptBuilder

    files = SystemPromptBuilder._resolve_persona(cfg.memory_files)
    return {
        "soul": (Path(files.soul_path).expanduser(), cfg.system_prompt.soul_max_chars),
        "user": (Path(files.user_path).expanduser(), cfg.system_prompt.user_max_chars),
        "instructions": (Path(files.soul_path).expanduser().parent / "INSTRUCTIONS.md", INSTRUCTIONS_MAX_CHARS),
    }


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _write(path: Path, text: str) -> None:
    """Write atomically so a crash never leaves half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def create_persona_files_router() -> APIRouter:
    from phibe.core.config import load_config

    router = APIRouter(prefix="/v1/persona-files", tags=["persona"])

    def current() -> Dict[str, Dict[str, Any]]:
        where = _paths_and_limits(load_config())
        out = {name: {"text": _read(path), "limit": limit} for name, (path, limit) in where.items()}
        # No file of its own yet: show the built-in instructions, ready to be edited.
        if not out["instructions"]["text"].strip():
            out["instructions"]["text"] = load_config().agent.default_system_prompt or ""
        return out

    @router.get("")
    async def get_files() -> Dict[str, Dict[str, Any]]:
        return current()

    @router.put("")
    async def put_files(body: Dict[str, Any], request: Request) -> Dict[str, Dict[str, Any]]:
        """Change one or both files; the one not sent stays as it is. A text over its limit is refused."""
        where = _paths_and_limits(load_config())
        unknown = set(body) - set(_FILES)
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown file(s): {', '.join(sorted(unknown))}")
        for name, text in body.items():
            if not isinstance(text, str):
                raise HTTPException(status_code=422, detail=f"{name} must be text")
            if len(text) > where[name][1]:
                raise HTTPException(status_code=422, detail=f"{name.upper()}.md can have at most {where[name][1]} characters")
        for name, text in body.items():
            if name == "instructions" and (not text.strip() or text.strip() == (load_config().agent.default_system_prompt or "").strip()):
                where[name][0].unlink(missing_ok=True)  # back to the built-in text
                continue
            _write(where[name][0], text)
        builder = getattr(getattr(request.app.state, "agent", None), "_prompt_builder", None)
        if builder is not None:
            builder.reload()  # the next message is answered with the new text
        return current()

    @router.get("/preview")
    async def preview() -> Dict[str, Any]:
        """The system prompt as Phibe builds it now, section by section, and how many characters each takes."""
        from phibe.prompt.builder import SystemPromptBuilder

        cfg = load_config()
        sections = SystemPromptBuilder(
            agent_template=cfg.agent.default_system_prompt or "",
            memory_files_config=cfg.memory_files,
            system_prompt_config=cfg.system_prompt,
        ).sections()
        rows = [{"name": s.name, "source": s.source, "chars": len(s.content), "text": s.content} for s in sections]
        return {"sections": rows, "chars": sum(r["chars"] for r in rows)}

    return router
