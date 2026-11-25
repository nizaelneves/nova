"""Which inference source Phibe starts with (Settings > Local Engine), kept in ``config.toml``.

The desktop app picks the source with ``--engine/--model`` flags and writes ``[engine.<key>] host``.
In the browser nothing starts the server with flags, so the choice lives in the same config file the
server already reads; it applies the next time Phibe starts. If the chosen engine is down, the
server's own fallback uses another local engine instead of refusing to start.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse

import tomlkit
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from phibe.core.config import DEFAULT_CONFIG_DIR

router = APIRouter(prefix="/v1/inference", tags=["inference"])

# The engines Settings offers for "Custom" (the OpenAI-compatible servers).
CUSTOM_ENGINES = ("lmstudio", "vllm", "sglang", "llamacpp", "mlx", "lemonade")
_MODEL = re.compile(r"^[A-Za-z0-9][\w.:/@+-]{0,199}$")


class Source(BaseModel):
    kind: Literal["ollama", "custom"]
    engine: Optional[str] = None
    host: Optional[str] = None
    model: Optional[str] = None


def _path() -> Path:
    return Path(os.environ.get("PHIBE_CONFIG", DEFAULT_CONFIG_DIR / "config.toml"))


def _doc() -> tomlkit.TOMLDocument:
    path = _path()
    return tomlkit.parse(path.read_text(encoding="utf-8")) if path.exists() else tomlkit.document()


def _table(parent, key: str):
    if key not in parent:
        parent.add(key, tomlkit.table())
    return parent[key]


@router.get("/source")
def get_source() -> dict:
    doc = _doc()
    engine = str(doc.get("engine", {}).get("default", "ollama"))
    if engine not in CUSTOM_ENGINES:
        return {"kind": "ollama"}
    return {
        "kind": "custom",
        "engine": engine,
        "host": str(doc["engine"].get(engine, {}).get("host", "")) or None,
        "model": str(doc.get("intelligence", {}).get("default_model", "")) or None,
    }


@router.put("/source")
def set_source(body: Source) -> dict:
    doc = _doc()
    if body.kind == "ollama":
        engine = "ollama"
    else:
        engine = body.engine or ""
        if engine not in CUSTOM_ENGINES:
            raise HTTPException(status_code=422, detail=f"Server type must be one of: {', '.join(CUSTOM_ENGINES)}")
        url = urlparse((body.host or "").strip())
        if url.scheme not in ("http", "https") or not url.netloc:
            raise HTTPException(status_code=422, detail="A server URL starting with http:// or https:// is required.")
        model = (body.model or "").strip()
        if not _MODEL.match(model):
            raise HTTPException(status_code=422, detail="A model name is required (letters, digits and . : / @ + - _).")
        # Bare base URL, as the desktop app stores it: no trailing slash and no /v1.
        host = (body.host or "").strip().rstrip("/")
        host = host[: -len("/v1")] if host.endswith("/v1") else host
        _table(_table(doc, "engine"), engine)["host"] = host
        _table(doc, "intelligence")["default_model"] = model
    _table(doc, "engine")["default"] = engine
    if "preferred_engine" in doc.get("intelligence", {}):
        doc["intelligence"]["preferred_engine"] = engine
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(tomlkit.dumps(doc), encoding="utf-8")
    return get_source()
