"""Tests for the Python SDK — Nova class and MemoryHandle."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

import nova
from nova.core.config import NovaConfig
from nova.sdk import MemoryHandle, Nova


def _make_engine(content="Hello from SDK"):
    engine = MagicMock()
    engine.engine_id = "mock"
    engine.health.return_value = True
    engine.list_models.return_value = ["test-model"]
    engine.generate.return_value = {
        "content": content,
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
        "model": "test-model",
        "finish_reason": "stop",
    }
    return engine


class TestNovaInit:
    def test_default_config(self):
        j = Nova(config=NovaConfig())
        assert j.config is not None
        j.close()

    def test_custom_config(self):
        cfg = NovaConfig()
        j = Nova(config=cfg)
        assert j.config is cfg
        j.close()

    def test_version_property(self):
        j = Nova(config=NovaConfig())
        assert j.version == nova.__version__
        j.close()

    def test_engine_key_override(self):
        j = Nova(config=NovaConfig(), engine_key="custom")
        assert j._engine_key == "custom"
        j.close()

    def test_model_override(self):
        j = Nova(config=NovaConfig(), model="my-model")
        assert j._model_override == "my-model"
        j.close()


class TestNovaAsk:
    def test_ask_returns_string(self):
        engine = _make_engine("The answer is 42.")
        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=NovaConfig(), model="test-model")
            result = j.ask("What is the answer?")
            assert result == "The answer is 42."
            j.close()

    def test_ask_with_model_override(self):
        engine = _make_engine()
        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=NovaConfig())
            j.ask("Hello", model="custom-model")
            # Verify engine.generate was called with the custom model
            call_kwargs = engine.generate.call_args
            assert call_kwargs[1]["model"] == "custom-model"
            j.close()

    def test_ask_with_agent(self):
        from nova.agents._stubs import AgentResult
        from nova.core.registry import AgentRegistry

        engine = _make_engine()

        class MockAgent:
            agent_id = "mock-agent"

            def __init__(self, eng, model, **kwargs):
                pass

            def run(self, input, context=None, **kwargs):
                return AgentResult(content="Agent response", turns=1)

        AgentRegistry.register_value("mock-agent", MockAgent)

        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=NovaConfig(), model="test-model")
            result = j.ask("Hello", agent="mock-agent")
            assert result == "Agent response"
            j.close()

    def test_simple_agent_ignores_tool_security_kwargs(self):
        from nova.agents.simple import SimpleAgent
        from nova.core.registry import AgentRegistry
        from nova.security import SecurityContext

        engine = _make_engine("simple secured response")
        AgentRegistry.register_value("simple", SimpleAgent)
        with (
            patch("nova.sdk.get_engine", return_value=("mock", engine)),
            patch(
                "nova.security.setup_security",
                return_value=SecurityContext(
                    engine=engine,
                    capability_policy=object(),
                    rate_limiter=object(),
                ),
            ),
        ):
            j = Nova(config=NovaConfig(), model="test-model")
            result = j.ask("Hello", agent="simple")
            j.close()

        assert result == "simple secured response"

    def test_direct_operation_agent_receives_policy_rate_and_identity(self):
        from nova.agents._stubs import AgentContext, AgentResult, BaseAgent
        from nova.core.registry import AgentRegistry
        from nova.security import SecurityContext
        from nova.security.capabilities import CapabilityPolicy

        class _RecordingLimiter:
            def __init__(self):
                self.keys = []

            def check(self, key):
                self.keys.append(key)
                return True, 0.0

        class _DirectSDKAgent(BaseAgent):
            agent_id = "direct-sdk"
            required_capabilities = ("code:execute",)

            def run(self, input, context: AgentContext | None = None, **kwargs):
                return self._execution_denied_result() or AgentResult(content="ran")

        engine = _make_engine()
        policy = CapabilityPolicy(default_deny=True)
        policy.grant("_default", "code:execute")
        policy.deny("direct-sdk", "code:execute")
        limiter = _RecordingLimiter()
        AgentRegistry.register_value("direct-sdk", _DirectSDKAgent)

        with (
            patch("nova.sdk.get_engine", return_value=("mock", engine)),
            patch(
                "nova.security.setup_security",
                return_value=SecurityContext(
                    engine=engine,
                    capability_policy=policy,
                    rate_limiter=limiter,
                ),
            ),
        ):
            j = Nova(config=NovaConfig(), model="test-model")
            result = j.ask("run", agent="direct-sdk")
            j.close()

        assert "code:execute" in result
        assert limiter.keys == ["direct-sdk:agent_run"]

    def test_ask_with_agent_wires_persona(self, tmp_path):
        from nova.agents.simple import SimpleAgent
        from nova.core.registry import AgentRegistry

        soul = tmp_path / "SOUL.md"
        soul.write_text("SDK_PERSONA_SENTINEL", encoding="utf-8")

        cfg = NovaConfig()
        cfg.memory_files.soul_path = str(soul)
        cfg.memory_files.memory_path = ""
        cfg.memory_files.user_path = ""
        cfg.agent.context_from_memory = False

        if not AgentRegistry.contains("simple"):
            AgentRegistry.register_value("simple", SimpleAgent)

        engine = _make_engine()
        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=cfg, model="test-model")
            j.ask("Hello", agent="simple")
            messages = engine.generate.call_args.args[0]
            assert "SDK_PERSONA_SENTINEL" in messages[0].content
            j.close()

    def test_ask_no_engine_raises(self):
        with patch("nova.sdk.get_engine", return_value=None):
            j = Nova(config=NovaConfig())
            with pytest.raises(RuntimeError, match="No inference engine"):
                j.ask("Hello")
            j.close()

    def test_ask_full_returns_dict(self):
        engine = _make_engine("Full response")
        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=NovaConfig(), model="test-model")
            result = j.ask_full("Hello")
            assert isinstance(result, dict)
            assert "content" in result
            assert "usage" in result
            assert result["content"] == "Full response"
            j.close()


class TestNovaModels:
    def test_list_models(self):
        engine = _make_engine()
        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=NovaConfig())
            models = j.list_models()
            assert models == ["test-model"]
            j.close()

    def test_list_engines(self):
        from nova.core.registry import EngineRegistry

        EngineRegistry.register_value("test-eng", object)
        j = Nova(config=NovaConfig())
        engines = j.list_engines()
        assert "test-eng" in engines
        j.close()

    def test_list_engines_empty(self):
        j = Nova(config=NovaConfig())
        engines = j.list_engines()
        assert isinstance(engines, list)
        j.close()


class TestMemoryHandle:
    def test_lazy_backend_init(self):
        cfg = NovaConfig()
        handle = MemoryHandle(cfg)
        assert handle._backend is None
        handle.close()

    def test_close_idempotent(self):
        cfg = NovaConfig()
        handle = MemoryHandle(cfg)
        handle.close()
        handle.close()  # should not raise

    def test_index_file(self, tmp_path):
        # Create a test file with enough content to produce chunks
        test_file = tmp_path / "test.txt"
        words = " ".join(f"word{i}" for i in range(100))
        test_file.write_text(words)

        # Mock the memory backend
        mock_backend = MagicMock()
        mock_backend.store.return_value = "doc-1"

        cfg = NovaConfig()
        handle = MemoryHandle(cfg)
        handle._backend = mock_backend

        result = handle.index(str(test_file))
        assert result["chunks"] > 0
        assert "doc_ids" in result
        handle.close()

    def test_search_returns_results(self):
        mock_backend = MagicMock()
        mock_result = MagicMock()
        mock_result.content = "test content"
        mock_result.score = 0.9
        mock_result.source = "test.txt"
        mock_result.metadata = {}
        mock_backend.retrieve.return_value = [mock_result]

        cfg = NovaConfig()
        handle = MemoryHandle(cfg)
        handle._backend = mock_backend

        results = handle.search("test query")
        assert len(results) == 1
        assert results[0]["content"] == "test content"
        handle.close()

    def test_search_empty(self):
        mock_backend = MagicMock()
        mock_backend.retrieve.return_value = []

        cfg = NovaConfig()
        handle = MemoryHandle(cfg)
        handle._backend = mock_backend

        results = handle.search("nothing")
        assert results == []
        handle.close()

    def test_stats_returns_dict(self):
        mock_backend = MagicMock()
        mock_backend.count.return_value = 5

        cfg = NovaConfig()
        handle = MemoryHandle(cfg)
        handle._backend = mock_backend

        stats = handle.stats()
        assert isinstance(stats, dict)
        assert stats["count"] == 5
        handle.close()


class TestNovaStreaming:
    @pytest.mark.asyncio
    async def test_ask_stream_yields_tokens(self):
        engine = _make_engine()

        async def mock_stream(*args, **kwargs):
            for token in ["Hello", " ", "world"]:
                yield token

        engine.stream = mock_stream

        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=NovaConfig(), model="test-model")
            tokens = []
            async for token in j.ask_stream("Hi"):
                tokens.append(token)
            assert tokens == ["Hello", " ", "world"]
            j.close()

    @pytest.mark.asyncio
    async def test_ask_full_stream_yields_dicts(self):
        engine = _make_engine()

        async def mock_stream(*args, **kwargs):
            for token in ["Hello", " ", "world"]:
                yield token

        engine.stream = mock_stream

        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=NovaConfig(), model="test-model")
            chunks = []
            async for chunk in j.ask_full_stream("Hi"):
                chunks.append(chunk)

            # First three chunks are token dicts
            assert chunks[0] == {"token": "Hello", "index": 0}
            assert chunks[1] == {"token": " ", "index": 1}
            assert chunks[2] == {"token": "world", "index": 2}

            # Final chunk has done flag and full content
            final = chunks[-1]
            assert final["done"] is True
            assert final["content"] == "Hello world"
            assert final["model"] == "test-model"
            assert final["engine"] == "mock"
            j.close()

    @pytest.mark.asyncio
    async def test_ask_stream_with_model_override(self):
        engine = _make_engine()
        call_log: list = []

        async def mock_stream(*args, **kwargs):
            call_log.append(kwargs)
            for token in ["ok"]:
                yield token

        engine.stream = mock_stream

        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=NovaConfig())
            tokens = []
            async for token in j.ask_stream("Hi", model="custom-model"):
                tokens.append(token)
            assert tokens == ["ok"]
            assert call_log[0]["model"] == "custom-model"
            j.close()


class TestNovaLifecycle:
    @pytest.mark.parametrize("security_enabled", [False, True])
    def test_close_initialized_engine(self, security_enabled: bool) -> None:
        from nova.security.guardrails import GuardrailsEngine

        cfg = NovaConfig()
        cfg.security.enabled = security_enabled
        engine = _make_engine()
        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=cfg)
            try:
                assert j.list_models() == ["test-model"]
                assert (
                    isinstance(j._engine._inner, GuardrailsEngine) == security_enabled
                )
                j.close()
                j.close()
                engine.close.assert_called_once()
                assert j._engine is None
            finally:
                j.close()

    def test_context_manager_closes_initialized_engine(self) -> None:
        engine = _make_engine()
        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            with Nova(config=NovaConfig()) as j:
                j.list_models()
            engine.close.assert_called_once()

    def test_engine_close_failure_clears_reference(self) -> None:
        engine = _make_engine()
        engine.close.side_effect = RuntimeError("cleanup failed")
        with patch("nova.sdk.get_engine", return_value=("mock", engine)):
            j = Nova(config=NovaConfig())
            try:
                j.list_models()
                j.close()
                assert j._engine is None
                j.close()
                engine.close.assert_called_once()
            finally:
                j.close()

    def test_close_releases_resources(self):
        j = Nova(config=NovaConfig())
        j.close()
        assert j._engine is None

    def test_double_close_safe(self):
        j = Nova(config=NovaConfig())
        j.close()
        j.close()  # should not raise
