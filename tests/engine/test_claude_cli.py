"""Claude CLI engine, tested against a fake ``claude`` program."""

from __future__ import annotations

import asyncio
import json
import sys
import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest

from nova.core.types import Message, Role
from nova.engine._base import EngineConnectionError
from nova.engine.claude_cli import ClaudeCLIEngine

FAKE = textwrap.dedent(
    """
    import json, os, sys

    args = sys.argv[1:]
    if args[:2] == ["auth", "status"]:
        print(json.dumps({"loggedIn": os.environ.get("FAKE_LOGGED_IN") == "1"}))
        sys.exit(0)

    sys.stdin.reconfigure(encoding="utf-8")
    stdin = sys.stdin.read()
    with open(os.environ["FAKE_LOG"], "w", encoding="utf-8") as fh:
        json.dump({"args": args, "stdin": stdin, "cwd": os.getcwd()}, fh)

    error = os.environ.get("FAKE_ERROR") == "1"
    result = "Session expired" if error else "Ola! " + stdin.splitlines()[0]
    final = {"type": "result", "is_error": error, "result": result,
             "total_cost_usd": 0.01,
             "usage": {"input_tokens": 10, "cache_read_input_tokens": 5,
                       "output_tokens": 7}}
    if "stream-json" in args:
        print(json.dumps({"type": "system", "subtype": "init"}))
        for piece in ("Ol", "a!"):
            print(json.dumps({"type": "stream_event", "event": {
                "type": "content_block_delta",
                "delta": {"type": "text_delta", "text": piece}}}))
        print(json.dumps(final))
    else:
        print(json.dumps(final))
    """
)


@pytest.fixture
def fake(tmp_path: Path, monkeypatch) -> dict:
    script = tmp_path / "fake_claude.py"
    script.write_text(FAKE, encoding="utf-8")
    log = tmp_path / "call.json"
    monkeypatch.setenv("FAKE_LOG", str(log))
    monkeypatch.setenv("FAKE_LOGGED_IN", "1")
    monkeypatch.delenv("FAKE_ERROR", raising=False)
    engine = ClaudeCLIEngine(
        command=[sys.executable, str(script)], workdir=tmp_path / "work"
    )
    return {"engine": engine, "log": log, "workdir": tmp_path / "work"}


def _call(fake: dict) -> dict:
    return json.loads(fake["log"].read_text(encoding="utf-8"))


def _messages() -> list[Message]:
    return [
        Message(role=Role.SYSTEM, content="You are Nova."),
        Message(role=Role.USER, content="Oi, tudo bem?"),
    ]


def test_generate_returns_text_usage_and_cost(fake: dict) -> None:
    result = fake["engine"].generate(_messages(), model="haiku")

    assert result["content"] == "Ola! Oi, tudo bem?"
    assert result["usage"] == {
        "prompt_tokens": 15,
        "completion_tokens": 7,
        "total_tokens": 22,
    }
    assert result["cost_usd"] == 0.01
    assert result["finish_reason"] == "stop"


def test_cli_runs_as_a_plain_model_with_no_tools_or_connectors(fake: dict) -> None:
    fake["engine"].generate(_messages(), model="sonnet")
    args = _call(fake)["args"]

    assert args[args.index("--tools") + 1] == ""
    assert "--strict-mcp-config" in args
    assert "--disable-slash-commands" in args
    assert args[args.index("--setting-sources") + 1] == ""
    assert "--no-session-persistence" in args
    assert args[args.index("--model") + 1] == "sonnet"
    assert args[args.index("--system-prompt") + 1] == "You are Nova."
    joined = " ".join(args).lower()
    assert "bypass" not in joined and "dangerously" not in joined


def test_cli_runs_in_an_empty_workspace_folder(fake: dict) -> None:
    fake["engine"].generate(_messages(), model="haiku")

    assert Path(_call(fake)["cwd"]).resolve() == fake["workdir"].resolve()


def test_multi_turn_history_is_sent_as_a_transcript(fake: dict) -> None:
    messages = [
        Message(role=Role.USER, content="Meu nome é Nizael."),
        Message(role=Role.ASSISTANT, content="Prazer!"),
        Message(role=Role.USER, content="Qual é meu nome?"),
    ]
    fake["engine"].generate(messages, model="haiku")
    stdin = _call(fake)["stdin"]

    assert "User: Meu nome é Nizael." in stdin
    assert "Assistant: Prazer!" in stdin
    assert "User: Qual é meu nome?" in stdin


def test_very_long_system_prompt_goes_through_stdin(fake: dict) -> None:
    messages = [
        Message(role=Role.SYSTEM, content="x" * 20_000),
        Message(role=Role.USER, content="oi"),
    ]
    fake["engine"].generate(messages, model="haiku")
    call = _call(fake)

    assert "--system-prompt" not in call["args"]
    assert "x" * 20_000 in call["stdin"]


def test_error_from_the_cli_becomes_an_engine_error(fake: dict, monkeypatch) -> None:
    monkeypatch.setenv("FAKE_ERROR", "1")

    with pytest.raises(EngineConnectionError, match="Session expired"):
        fake["engine"].generate(_messages(), model="haiku")


def test_stream_yields_text_pieces(fake: dict) -> None:
    async def collect() -> list[str]:
        return [
            piece async for piece in fake["engine"].stream(_messages(), model="haiku")
        ]

    assert asyncio.run(collect()) == ["Ol", "a!"]
    assert "stream-json" in _call(fake)["args"]


def test_stream_error_is_raised(fake: dict, monkeypatch) -> None:
    monkeypatch.setenv("FAKE_ERROR", "1")

    async def collect() -> None:
        async for _ in fake["engine"].stream(_messages(), model="haiku"):
            pass

    with pytest.raises(EngineConnectionError, match="Session expired"):
        asyncio.run(collect())


def test_health_requires_a_logged_in_cli(fake: dict, monkeypatch) -> None:
    assert fake["engine"].health() is True

    monkeypatch.setenv("FAKE_LOGGED_IN", "0")
    fresh = ClaudeCLIEngine(command=fake["engine"]._command, workdir=fake["workdir"])
    assert fresh.health() is False


def test_health_is_false_when_the_binary_is_missing() -> None:
    with patch("nova.engine.claude_cli.shutil.which", return_value=None):
        assert ClaudeCLIEngine().health() is False


def test_models_and_serving_rules() -> None:
    engine = ClaudeCLIEngine()
    assert engine.list_models() == ["sonnet", "opus", "haiku"]
    assert engine.can_serve("opus") and engine.can_serve("claude-sonnet-5")
    assert not engine.can_serve("qwen3.5:2b")
    assert engine.is_cloud is True


def test_engine_is_registered() -> None:
    import importlib

    import nova.engine.claude_cli as module
    from nova.core.registry import EngineRegistry

    # The test suite clears registries between tests; re-import to register.
    importlib.reload(module)
    assert EngineRegistry.contains("claude_cli")


class _FakeEngine:
    def __init__(self, *, healthy: bool, is_cloud: bool) -> None:
        self._healthy = healthy
        self.is_cloud = is_cloud

    def health(self) -> bool:
        return self._healthy

    def can_serve(self, model: str) -> bool:
        return True


def _select(default_local: bool, others: list[tuple[str, _FakeEngine]]):
    from nova.core.config import NovaConfig
    from nova.engine import _discovery

    config = NovaConfig()
    config.engine.default = "ollama"
    default = _FakeEngine(healthy=False, is_cloud=not default_local)
    with (
        patch.object(_discovery, "_make_engine", return_value=default),
        patch.object(_discovery, "discover_engines", return_value=others),
        patch.object(_discovery.EngineRegistry, "contains", return_value=True),
        patch.object(_discovery.EngineRegistry, "get", return_value=_FakeEngine),
    ):
        return _discovery.get_engine(config)


def test_local_default_never_falls_back_to_a_cloud_engine() -> None:
    cloud = ("claude_cli", _FakeEngine(healthy=True, is_cloud=True))

    assert _select(default_local=True, others=[cloud]) is None


def test_local_default_can_still_fall_back_to_another_local_engine() -> None:
    cloud = ("claude_cli", _FakeEngine(healthy=True, is_cloud=True))
    local = ("lmstudio", _FakeEngine(healthy=True, is_cloud=False))

    chosen = _select(default_local=True, others=[cloud, local])

    assert chosen is not None and chosen[0] == "lmstudio"
