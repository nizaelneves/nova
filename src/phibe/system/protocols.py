"""Structural protocols for substituting fakes in place of PhibeSystem."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, List, Optional, Protocol

if TYPE_CHECKING:
    from phibe.core.config import PhibeConfig
    from phibe.core.events import EventBus
    from phibe.engine._stubs import InferenceEngine
    from phibe.security.capabilities import CapabilityPolicy
    from phibe.sessions.session import SessionStore
    from phibe.tools._stubs import BaseTool
    from phibe.tools.storage._stubs import MemoryBackend
    from phibe.traces.collector import TraceCollector
    from phibe.traces.store import TraceStore


class OrchestratorDeps(Protocol):
    """Minimum surface of PhibeSystem that QueryOrchestrator depends on.

    Tests can satisfy this with a lightweight class — no need to construct
    the full PhibeSystem dataclass or materialize every subsystem.
    """

    config: PhibeConfig
    bus: EventBus
    engine: InferenceEngine
    engine_key: str
    model: str
    agent_name: str
    tools: List[BaseTool]
    memory_backend: Optional[MemoryBackend]
    capability_policy: Optional[CapabilityPolicy]
    rate_limiter: Optional[Any]
    session_store: Optional[SessionStore]
    trace_store: Optional[TraceStore]
    trace_collector: Optional[TraceCollector]  # written by _run_agent

    # Optional attribute (getattr with default) — declared for type clarity.
    _skill_few_shot_examples: Any
