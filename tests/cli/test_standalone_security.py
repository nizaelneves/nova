"""Standalone channel/research launchers inherit configured security."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from openjarvis.core.config import JarvisConfig
from openjarvis.security import SecurityContext


def _security(raw_engine, wrapped_engine, policy, limiter):
    return MagicMock(
        return_value=SecurityContext(
            engine=wrapped_engine,
            capability_policy=policy,
            rate_limiter=limiter,
        )
    )


def test_deep_research_setup_chat_wires_security(monkeypatch):
    from openjarvis.cli.deep_research_setup_cmd import _launch_chat

    raw_engine = MagicMock(name="raw-engine")
    wrapped_engine = MagicMock(name="wrapped-engine")
    wrapped_engine.health.return_value = True
    wrapped_engine.list_models.return_value = ["qwen3.5:4b"]
    policy = object()
    limiter = object()
    setup = _security(raw_engine, wrapped_engine, policy, limiter)
    captured = {}

    class _Agent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def run(self, text):
            return SimpleNamespace(content="done")

    monkeypatch.setattr("openjarvis.core.config.load_config", lambda: JarvisConfig())
    monkeypatch.setattr("openjarvis.engine.ollama.OllamaEngine", lambda: raw_engine)
    monkeypatch.setattr("openjarvis.security.setup_security", setup)
    monkeypatch.setattr("openjarvis.agents.deep_research.DeepResearchAgent", _Agent)
    console = MagicMock()
    console.input.return_value = "/quit"

    _launch_chat(MagicMock(), console)

    assert captured["engine"] is wrapped_engine
    assert captured["capability_policy"] is policy
    assert captured["rate_limiter"] is limiter
    assert captured["agent_id"] == "cli:deep-research"
    assert captured["bus"] is setup.call_args.args[2]
