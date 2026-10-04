"""Codex CLI engine, tested against a fake ``codex`` program."""

from __future__ import annotations

import asyncio
import json
import sys
import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest

from phi.core.types import Message, Role
from phi.engine._base import EngineConnectionError
from phi.engine.codex_cli import CodexCLIEngine

FAKE = textwrap.dedent(
    """
    import json, os, sys

    args = sys.argv[1:]
    if args[:2] == ["login", "status"]:
        if os.environ.get("FAKE_LOGGED_IN") == "1":
            print("Logged in using ChatGPT", file=sys.stderr)
            sys.exit(0)
        print("Not logged in", file=sys.stderr)
        sys.exit(1)

    sys.stdin.reconfigure(encoding="utf-8")
    stdin = sys.stdin.read()
    with open(os.environ["FAKE_LOG"], "w", encoding="utf-8") as fh:
        json.dump({"args": args, "stdin": stdin, "cwd": os.getcwd()}, fh)

    reply = "Ola! " + stdin.split("---", 1)[1].strip().splitlines()[0]
    mode = os.environ.get("FAKE_MODE", "ok")
    if mode == "file_only":
        # No agent message in the JSONL stream: only the --output-last-message file.
        with open(args[args.index("-o") + 1], "w", encoding="utf-8") as fh:
            fh.write(reply)
        print(json.dumps({"type": "turn.completed", "usage": {}}))
        sys.exit(0)
    print(json.dumps({"type": "thread.started", "thread_id": "t1"}))
    print(json.dumps({"type": "turn.started"}))
    if mode == "failed":
        print(json.dumps({"type": "turn.failed", "error": {"message": "Session expired"}}))
        sys.exit(1)
    print(json.dumps({"type": "item.completed",
                      "item": {"id": "i0", "type": "reasoning", "text": "thinking"}}))
    print(json.dumps({"type": "item.completed",
                      "item": {"id": "i1", "type": "agent_message", "text": reply}}))
    print(json.dumps({"type": "turn.completed",
                      "usage": {"input_tokens": 10, "cached_input_tokens": 5,
                                "output_tokens": 7, "reasoning_output_tokens": 0}}))
    """
)


@pytest.fixture
def fake(tmp_path: Path, monkeypatch) -> dict:
    script = tmp_path / "fake_codex.py"
    script.write_text(FAKE, encoding="utf-8")
    log = tmp_path / "call.json"
    monkeypatch.setenv("FAKE_LOG", str(log))
    monkeypatch.setenv("FAKE_LOGGED_IN", "1")
    monkeypatch.delenv("FAKE_MODE", raising=False)
    engine = CodexCLIEngine(
        command=[sys.executable, str(script)], workdir=tmp_path / "work"
    )
    return {"engine": engine, "log": log, "workdir": tmp_path / "work"}


def _call(fake: dict) -> dict:
    return json.loads(fake["log"].read_text(encoding="utf-8"))


def _messages() -> list[Message]:
    return [
        Message(role=Role.SYSTEM, content="You are Phi."),
        Message(role=Role.USER, content="Oi, tudo bem?"),
    ]


def test_generate_returns_text_and_usage(fake: dict) -> None:
    result = fake["engine"].generate(_messages(), model="codex:default")

    assert result["content"] == "Ola! Oi, tudo bem?"
    assert result["usage"] == {
        "prompt_tokens": 10,
        "completion_tokens": 7,
        "total_tokens": 17,
    }
    assert result["finish_reason"] == "stop"


def test_cli_runs_as_a_plain_model_with_no_tools(fake: dict) -> None:
    fake["engine"].generate(_messages(), model="codex:default")
    args = _call(fake)["args"]

    assert args[args.index("--sandbox") + 1] == "read-only"
    for flag in ("--ephemeral", "--ignore-user-config", "--ignore-rules", "--json"):
        assert flag in args
    disabled = {args[i + 1] for i, a in enumerate(args) if a == "--disable"}
    assert {"shell_tool", "apps", "browser_use", "computer_use", "plugins"} <= disabled
    assert 'web_search="disabled"' in args
    joined = " ".join(args).lower()
    assert "bypass" not in joined and "dangerously" not in joined
    assert "danger-full-access" not in joined and "workspace-write" not in joined


def test_default_model_leaves_the_choice_to_the_users_codex(fake: dict) -> None:
    fake["engine"].generate(_messages(), model="codex:default")

    assert "-m" not in _call(fake)["args"]


def test_named_model_is_passed_without_the_prefix(fake: dict) -> None:
    fake["engine"].generate(_messages(), model="codex:gpt-6-luna")
    args = _call(fake)["args"]

    assert args[args.index("-m") + 1] == "gpt-6-luna"


def test_system_prompt_and_plain_chat_rules_go_in_the_prompt(fake: dict) -> None:
    fake["engine"].generate(_messages(), model="codex:default")
    stdin = _call(fake)["stdin"]

    assert "You are Phi." in stdin
    assert "do not run commands" in stdin
    assert stdin.rstrip().endswith("Oi, tudo bem?")


def test_cli_runs_in_an_empty_workspace_folder(fake: dict) -> None:
    fake["engine"].generate(_messages(), model="codex:default")
    call = _call(fake)

    assert Path(call["cwd"]).resolve() == fake["workdir"].resolve()
    assert "--skip-git-repo-check" in call["args"]
    assert not list(fake["workdir"].glob("reply-*.txt"))  # temp file cleaned up


def test_multi_turn_history_is_sent_as_a_transcript(fake: dict) -> None:
    messages = [
        Message(role=Role.USER, content="Meu nome é Nizael."),
        Message(role=Role.ASSISTANT, content="Prazer!"),
        Message(role=Role.USER, content="Qual é meu nome?"),
    ]
    fake["engine"].generate(messages, model="codex:default")
    stdin = _call(fake)["stdin"]

    assert "User: Meu nome é Nizael." in stdin
    assert "Assistant: Prazer!" in stdin
    assert "User: Qual é meu nome?" in stdin


def test_reply_is_recovered_from_the_output_file_when_events_differ(
    fake: dict, monkeypatch
) -> None:
    monkeypatch.setenv("FAKE_MODE", "file_only")

    result = fake["engine"].generate(_messages(), model="codex:default")

    assert result["content"] == "Ola! Oi, tudo bem?"


def test_error_from_the_cli_becomes_an_engine_error(fake: dict, monkeypatch) -> None:
    monkeypatch.setenv("FAKE_MODE", "failed")

    with pytest.raises(EngineConnectionError, match="Session expired"):
        fake["engine"].generate(_messages(), model="codex:default")


def test_stream_yields_the_reply(fake: dict) -> None:
    async def collect() -> list[str]:
        return [
            piece
            async for piece in fake["engine"].stream(_messages(), model="codex:default")
        ]

    assert asyncio.run(collect()) == ["Ola! Oi, tudo bem?"]
    assert "--json" in _call(fake)["args"]


def test_stream_falls_back_to_the_output_file(fake: dict, monkeypatch) -> None:
    monkeypatch.setenv("FAKE_MODE", "file_only")

    async def collect() -> list[str]:
        return [
            piece
            async for piece in fake["engine"].stream(_messages(), model="codex:default")
        ]

    assert asyncio.run(collect()) == ["Ola! Oi, tudo bem?"]


def test_stream_error_is_raised(fake: dict, monkeypatch) -> None:
    monkeypatch.setenv("FAKE_MODE", "failed")

    async def collect() -> None:
        async for _ in fake["engine"].stream(_messages(), model="codex:default"):
            pass

    with pytest.raises(EngineConnectionError, match="Session expired"):
        asyncio.run(collect())


def test_health_requires_a_logged_in_cli(fake: dict, monkeypatch) -> None:
    assert fake["engine"].health() is True

    monkeypatch.setenv("FAKE_LOGGED_IN", "0")
    fresh = CodexCLIEngine(command=fake["engine"]._command, workdir=fake["workdir"])
    assert fresh.health() is False


def test_health_is_false_when_the_binary_is_missing() -> None:
    with patch("phi.engine.codex_cli.shutil.which", return_value=None):
        assert CodexCLIEngine().health() is False


def test_models_and_serving_rules() -> None:
    engine = CodexCLIEngine()
    models = engine.list_models()

    assert models[0] == "codex:default"
    assert all(m.startswith("codex:") for m in models)
    assert engine.can_serve("codex:gpt-6-astra")
    assert not engine.can_serve("sonnet")
    assert not engine.can_serve("codex/gpt-4o")  # the API path belongs to the cloud engine
    assert not engine.can_serve("qwen3.5:2b")
    assert engine.is_cloud is True


def test_model_ids_never_look_like_cloud_api_models() -> None:
    from phi.server.cloud_router import is_cloud_model

    assert not any(is_cloud_model(m) for m in CodexCLIEngine().list_models())


def test_engine_is_registered() -> None:
    import importlib

    import phi.engine.codex_cli as module
    from phi.core.registry import EngineRegistry

    # The test suite clears registries between tests; re-import to register.
    importlib.reload(module)
    assert EngineRegistry.contains("codex_cli")


def test_effort_is_passed_to_the_cli(fake: dict) -> None:
    fake["engine"].generate(_messages(), model="codex:default", effort="high")
    args = _call(fake)["args"]

    assert 'model_reasoning_effort="high"' in args


def test_no_effort_when_none_is_chosen(fake: dict) -> None:
    fake["engine"].generate(_messages(), model="codex:default")

    assert not any("model_reasoning_effort" in a for a in _call(fake)["args"])


def test_effort_also_applies_to_streaming(fake: dict) -> None:
    async def collect() -> None:
        async for _ in fake["engine"].stream(
            _messages(), model="codex:default", effort="max"
        ):
            pass

    asyncio.run(collect())
    assert 'model_reasoning_effort="max"' in _call(fake)["args"]


def test_unknown_effort_is_refused(fake: dict) -> None:
    with pytest.raises(EngineConnectionError, match="Unknown effort"):
        fake["engine"].generate(_messages(), model="codex:default", effort="turbo")


def test_server_sends_effort_to_both_cli_engines_only() -> None:
    from phi.server import routes
    from phi.server.models import ChatCompletionRequest

    req = ChatCompletionRequest(model="codex:default", messages=[], effort="high")
    for key in ("codex_cli", "claude_cli"):
        with patch.object(routes, "_engine_key_for_model", return_value=key):
            assert routes._engine_extras(object(), "m", req) == {"effort": "high"}
    with patch.object(routes, "_engine_key_for_model", return_value="ollama"):
        assert routes._engine_extras(object(), "qwen3.5:2b", req) == {}
