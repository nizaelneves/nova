"""An installed command-line engine joins the server's engines even when it is not signed in yet."""

from __future__ import annotations

from phibe.core.registry import EngineRegistry
from phibe.engine import _discovery


class _Cli:
    installed = True

    def _binary(self):
        return ["cli"] if self.installed else None


class _Missing(_Cli):
    installed = False


def test_installed_clis_join_and_missing_ones_do_not(monkeypatch) -> None:
    classes = {"claude_cli": _Cli, "codex_cli": _Missing}
    monkeypatch.setattr(EngineRegistry, "get", classmethod(lambda cls, key: classes[key]))
    local = object()
    out = _discovery.with_installed_cli_engines([("ollama", local)])
    assert [k for k, _ in out] == ["ollama", "claude_cli"] and out[0][1] is local


def test_a_cli_that_is_already_there_is_not_added_twice(monkeypatch) -> None:
    monkeypatch.setattr(EngineRegistry, "get", classmethod(lambda cls, key: _Missing))
    mine = object()
    assert _discovery.with_installed_cli_engines([("claude_cli", mine)]) == [("claude_cli", mine)]
