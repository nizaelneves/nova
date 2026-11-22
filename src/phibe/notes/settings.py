"""Notes settings (``notes_settings.json`` in the Phibe folder): the embedding model."""

from __future__ import annotations

import json
from pathlib import Path

from phibe.connectors.embeddings import OllamaEmbedder

DEFAULT_EMBED_MODEL = "bge-m3"


def _path() -> Path:
    from phibe.core.paths import get_config_dir

    return get_config_dir() / "notes_settings.json"


def _read() -> dict:
    try:
        data = json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write(change: dict) -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({**_read(), **change}), encoding="utf-8")  # merge: one setting never erases another


def get() -> dict:
    data = _read()
    model = data.get("embedding_model")
    return {
        "embedding_model": model if isinstance(model, str) and model.strip() else DEFAULT_EMBED_MODEL,
    }


def set_embedding_model(model: str) -> dict:
    model = (model or "").strip()
    if not model:
        raise ValueError("embedding_model must not be empty")
    _write({"embedding_model": model})
    return get()


def embedder() -> OllamaEmbedder:
    """The embedder for the chosen model. A new model means the index is rebuilt (see ``pending_index``)."""
    return OllamaEmbedder(model=get()["embedding_model"], timeout=120.0)
