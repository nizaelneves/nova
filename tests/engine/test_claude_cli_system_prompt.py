"""A system prompt of several lines must not go on the Windows command line, where it would be cut at the first line break."""

from __future__ import annotations

import pytest

from phibe.engine import claude_cli

TWO_LINES = "first\nsecond"


@pytest.mark.parametrize(
    "platform,prompt,inline",
    [
        ("win32", "one line", True),
        ("win32", TWO_LINES, False),
        ("linux", TWO_LINES, True),
        ("win32", "", False),
        ("win32", "x" * 16_001, False),
    ],
)
def test_where_the_system_prompt_goes(monkeypatch, platform, prompt, inline) -> None:
    monkeypatch.setattr(claude_cli.sys, "platform", platform)
    assert claude_cli._passes_inline(prompt) is inline


def test_a_prompt_kept_off_the_command_line_travels_in_the_message(monkeypatch) -> None:
    monkeypatch.setattr(claude_cli.sys, "platform", "win32")
    engine = claude_cli.ClaudeCLIEngine(command=["claude"])
    cmd = engine._build_command(model="sonnet", system_prompt=TWO_LINES, streaming=False)
    assert "--system-prompt" not in cmd
    message = engine._stdin_text(TWO_LINES, "hello")
    assert TWO_LINES in message and message.endswith("hello")
