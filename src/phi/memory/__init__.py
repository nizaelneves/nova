"""Native persistent long-term memory for Phi.

This package provides the automatic memory service that extracts durable facts
from conversations in the background and persists them across sessions. It is
started and stopped as part of the ``phi serve`` / ``phi chat`` lifecycle
and configured via the ``[memory]`` section of ``config.toml``.
"""

from __future__ import annotations

from phi.memory.extractor import FactExtractor
from phi.memory.service import (
    MemoryService,
    build_memory_service,
    publish_completed_exchange,
)
from phi.memory.store import (
    Fact,
    FactStore,
    LocalFactStore,
    create_fact_store,
    load_configured_facts,
)

__all__ = [
    "Fact",
    "FactStore",
    "FactExtractor",
    "LocalFactStore",
    "MemoryService",
    "build_memory_service",
    "create_fact_store",
    "load_configured_facts",
    "publish_completed_exchange",
]
