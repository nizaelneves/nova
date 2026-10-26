"""Managed-agent streaming parity tests (#382, #386, #395).

These exercise the pure helpers extracted from ``_stream_managed_agent`` so the
streaming path's history replay, sampler forwarding, and tool dependency
injection can be verified without a live engine.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

pytest.importorskip("fastapi")  # agent_manager_routes imports FastAPI at module load

from phibe.core.types import Role  # noqa: E402
from phibe.server.agent_manager_routes import (  # noqa: E402
    _build_managed_system_prompt,
    _replay_history_messages,
    _sampler_kwargs,
)


class TestReplayHistoryToolCalls:
    """#382 — stored tool_calls must be replayed, not dropped."""

    def test_assistant_tool_calls_are_replayed_with_results(self):
        history = [  # DESC order (newest first), as list_messages returns
            {
                "id": "m2",
                "direction": "agent_to_user",
                "content": "",
                "tool_calls": [
                    {
                        "tool": "shell_exec",
                        "arguments": '{"command":"pwd"}',
                        "result": "/home/u",
                        "success": True,
                        "latency": 1.0,
                    },
                ],
            },
            {
                "id": "m1",
                "direction": "user_to_agent",
                "content": "run pwd",
                "tool_calls": None,
            },
        ]
        msgs = _replay_history_messages(history, exclude_id="current")
        # Chronological: user, assistant(tool_calls), tool(result)
        assert [m.role for m in msgs] == [Role.USER, Role.ASSISTANT, Role.TOOL]
        assistant = msgs[1]
        assert assistant.tool_calls is not None
        assert assistant.tool_calls[0].name == "shell_exec"
        tool_msg = msgs[2]
        assert tool_msg.content == "/home/u"
        # The tool result must reference the assistant's tool_call id.
        assert tool_msg.tool_call_id == assistant.tool_calls[0].id

    def test_plain_assistant_without_tool_calls(self):
        history = [
            {
                "id": "m1",
                "direction": "agent_to_user",
                "content": "hi",
                "tool_calls": None,
            },
        ]
        msgs = _replay_history_messages(history, exclude_id="current")
        assert len(msgs) == 1
        assert msgs[0].role == Role.ASSISTANT
        assert msgs[0].tool_calls is None

    def test_excludes_current_message(self):
        history = [
            {
                "id": "cur",
                "direction": "user_to_agent",
                "content": "now",
                "tool_calls": None,
            },
            {
                "id": "old",
                "direction": "user_to_agent",
                "content": "before",
                "tool_calls": None,
            },
        ]
        msgs = _replay_history_messages(history, exclude_id="cur")
        assert [m.content for m in msgs] == ["before"]


class TestSamplerKwargs:
    """#386 — sampler params forwarded only when set."""

    def test_reads_present_keys(self):
        cfg = {
            "temperature": 0.7,
            "repetition_penalty": 1.1,
            "top_p": 0.9,
            "top_k": 40,
            "min_p": 0.05,
            "frequency_penalty": 0.2,
            "presence_penalty": 0.1,
        }
        out = _sampler_kwargs(cfg)
        assert out == {
            "repetition_penalty": 1.1,
            "top_p": 0.9,
            "top_k": 40,
            "min_p": 0.05,
            "frequency_penalty": 0.2,
            "presence_penalty": 0.1,
        }
        # temperature/max_tokens are handled separately, not here.
        assert "temperature" not in out

    def test_omits_absent_keys(self):
        assert _sampler_kwargs({"temperature": 0.7}) == {}

    def test_none_values_skipped(self):
        assert _sampler_kwargs({"top_p": None, "repetition_penalty": 1.05}) == {
            "repetition_penalty": 1.05
        }


class TestBuildManagedSystemPrompt:
    """#431 — the streaming managed-agent path must run the agent's
    system_prompt through SystemPromptBuilder so SOUL.md /
    USER.md persona files are injected (parity with the CLI/ask path),
    instead of using the raw config system_prompt verbatim.
    """

    def _config_with_soul(self, tmp_path):
        from phibe.core.config import (
            MemoryFilesConfig,
            SystemPromptConfig,
        )

        soul = tmp_path / "SOUL.md"
        soul.write_text("You are Phibe, a meticulous local-first assistant.")
        # Other persona files point at non-existent paths — only SOUL is set.
        return SimpleNamespace(
            memory_files=MemoryFilesConfig(soul_path=str(soul)),
            system_prompt=SystemPromptConfig(),
        )

    def test_injects_soul_persona(self, tmp_path):
        app_config = self._config_with_soul(tmp_path)
        result = _build_managed_system_prompt(
            system_prompt="You are a helpful assistant.",
            app_config=app_config,
        )
        # The persona file content is injected (the #431 fix)...
        assert "meticulous local-first assistant" in result
        # ...alongside the agent's own template.
        assert "You are a helpful assistant." in result

    def test_agent_template_is_preserved(self, tmp_path):
        from phibe.core.config import MemoryFilesConfig, SystemPromptConfig

        # No persona files configured (all default paths).
        app_config = SimpleNamespace(
            memory_files=MemoryFilesConfig(),
            system_prompt=SystemPromptConfig(),
        )
        result = _build_managed_system_prompt(
            system_prompt="Plain agent.",
            app_config=app_config,
        )
        # The agent's own template is carried into the assembled prompt.
        assert "Plain agent." in result

    def test_matches_cli_builder_output(self, tmp_path):
        """Parity check: the helper produces exactly what a directly-
        constructed SystemPromptBuilder produces (same path the CLI uses),
        so streaming chat and `phibe ask` assemble the prompt identically.
        """
        from phibe.core.config import MemoryFilesConfig, SystemPromptConfig
        from phibe.prompt.builder import SystemPromptBuilder

        app_config = SimpleNamespace(
            memory_files=MemoryFilesConfig(),
            system_prompt=SystemPromptConfig(),
        )
        helper_out = _build_managed_system_prompt("Agent X.", app_config)
        direct_out = SystemPromptBuilder(
            agent_template="Agent X.",
            memory_files_config=app_config.memory_files,
            system_prompt_config=app_config.system_prompt,
        ).build()
        assert helper_out == direct_out
