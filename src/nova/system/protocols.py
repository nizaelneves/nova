"""Structural protocols for substituting fakes in place of NovaSystem."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, List, Optional, Protocol

if TYPE_CHECKING:
    from nova.core.config import NovaConfig
    from nova.core.events import EventBus
    from nova.engine._stubs import InferenceEngine
    from nova.security.capabilities import CapabilityPolicy
    from nova.sessions.session import SessionStore
    from nova.tools._stubs import BaseTool
    from nova.tools.storage._stubs import MemoryBackend
    from nova.traces.collector import TraceCollector
    from nova.traces.store import TraceStore


class OrchestratorDeps(Protocol):
    """Minimum surface of NovaSystem that QueryOrchestrator depends on.

    Tests can satisfy this with a lightweight class — no need to construct
    the full NovaSystem dataclass or materialize every subsystem.
    """

    config: NovaConfig
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
