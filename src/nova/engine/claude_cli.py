"""Claude CLI engine — drives the official ``claude`` binary in headless mode.

The user's own Claude login (subscription) is used through the unmodified
Claude Code CLI; Nova never reads or copies credentials.

The CLI is run as a plain language model:

* built-in tools are turned off (``--tools ""``) so it cannot touch files or
  run commands,
* only MCP servers passed explicitly are loaded (``--strict-mcp-config``), so the
  user's own connectors are not reachable from Nova,
* skills, plugins and project instructions are not loaded, and the process
  runs in an empty workspace folder,
* permissions are never bypassed.

Sessions are stateless: Nova sends the whole conversation on every call.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import subprocess
import sys
import time
from collections.abc import AsyncIterator, Sequence
from pathlib import Path
from typing import Any, Dict, List, Optional

from nova.core.paths import get_config_dir
from nova.core.registry import EngineRegistry
from nova.core.types import Message, Role
from nova.engine._base import EngineConnectionError
from nova.engine._stubs import InferenceEngine

logger = logging.getLogger(__name__)

_ALIASES = ("sonnet", "opus", "haiku")
# Above this many characters the system prompt is sent on stdin instead of the
# command line, which is limited on Windows.
_MAX_ARG_CHARS = 16_000
_AUTH_CACHE_SECONDS = 60.0


def _flatten_conversation(messages: Sequence[Message]) -> tuple[str, str]:
    """Split *messages* into ``(system_prompt, prompt)`` for the CLI."""
    system_parts = [m.text for m in messages if m.role == Role.SYSTEM and m.text]
    turns = [m for m in messages if m.role in (Role.USER, Role.ASSISTANT) and m.text]
    if len(turns) == 1:
        prompt = turns[0].text
    else:
        lines = ["This is the conversation so far."]
        for m in turns:
            label = "User" if m.role == Role.USER else "Assistant"
            lines.append(f"\n{label}: {m.text}")
        lines.append("\nReply to the last User message as the Assistant.")
        prompt = "\n".join(lines)
    return "\n\n".join(system_parts), prompt


def _usage(raw: Dict[str, Any] | None) -> Dict[str, int]:
    raw = raw or {}
    prompt = (
        int(raw.get("input_tokens", 0))
        + int(raw.get("cache_creation_input_tokens", 0))
        + int(raw.get("cache_read_input_tokens", 0))
    )
    completion = int(raw.get("output_tokens", 0))
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": prompt + completion,
    }


@EngineRegistry.register("claude_cli")
class ClaudeCLIEngine(InferenceEngine):
    """Inference through the official Claude Code CLI (uses the user's login)."""

    engine_id = "claude_cli"
    # The conversation leaves the machine, so this counts as a cloud engine and
    # is never chosen as an automatic fallback for a local one.
    is_cloud = True

    def __init__(
        self,
        *,
        command: Optional[Sequence[str]] = None,
        workdir: Optional[Path] = None,
        timeout: float = 300.0,
    ) -> None:
        self._command: Optional[List[str]] = list(command) if command else None
        self._workdir = Path(workdir) if workdir else None
        self._timeout = timeout
        self._auth_checked_at = 0.0
        self._auth_ok = False

    # -- process helpers ---------------------------------------------------

    def _binary(self) -> Optional[List[str]]:
        if self._command:
            return list(self._command)
        found = shutil.which("claude")
        return [found] if found else None

    def _cwd(self) -> str:
        folder = self._workdir or (get_config_dir() / "cli_workspace" / "claude")
        folder.mkdir(parents=True, exist_ok=True)
        return str(folder)

    @staticmethod
    def _popen_kwargs() -> Dict[str, Any]:
        if sys.platform == "win32":
            return {"creationflags": subprocess.CREATE_NO_WINDOW}
        return {}

    def _build_command(
        self, *, model: str, system_prompt: str, streaming: bool
    ) -> List[str]:
        binary = self._binary()
        if binary is None:
            raise EngineConnectionError(
                "Claude CLI not found. Install Claude Code and log in with `claude`."
            )
        cmd = [
            *binary,
            "-p",
            "--model",
            model,
            "--tools",
            "",
            "--strict-mcp-config",
            "--disable-slash-commands",
            "--setting-sources",
            "",
            "--no-session-persistence",
        ]
        if streaming:
            cmd += [
                "--output-format",
                "stream-json",
                "--verbose",
                "--include-partial-messages",
            ]
        else:
            cmd += ["--output-format", "json"]
        if system_prompt and len(system_prompt) <= _MAX_ARG_CHARS:
            cmd += ["--system-prompt", system_prompt]
        return cmd

    @staticmethod
    def _stdin_text(system_prompt: str, prompt: str) -> str:
        if system_prompt and len(system_prompt) > _MAX_ARG_CHARS:
            return f"Follow these instructions:\n{system_prompt}\n\n---\n\n{prompt}"
        return prompt

    @staticmethod
    def _raise_on_error(event: Dict[str, Any]) -> None:
        if event.get("is_error"):
            message = str(event.get("result") or "unknown error")
            raise EngineConnectionError(f"Claude CLI error: {message}")

    # -- InferenceEngine ---------------------------------------------------

    def generate(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        system_prompt, prompt = _flatten_conversation(messages)
        cmd = self._build_command(
            model=model, system_prompt=system_prompt, streaming=False
        )
        try:
            proc = subprocess.run(
                cmd,
                input=self._stdin_text(system_prompt, prompt),
                capture_output=True,
                text=True,
                encoding="utf-8",
                cwd=self._cwd(),
                timeout=self._timeout,
                **self._popen_kwargs(),
            )
        except subprocess.TimeoutExpired as exc:
            raise EngineConnectionError(
                f"Claude CLI timed out after {self._timeout:.0f}s"
            ) from exc
        except OSError as exc:
            raise EngineConnectionError(f"Could not run Claude CLI: {exc}") from exc

        try:
            event = json.loads(proc.stdout.strip().splitlines()[-1])
        except (IndexError, json.JSONDecodeError) as exc:
            detail = (proc.stderr or proc.stdout or "no output").strip()[:300]
            raise EngineConnectionError(f"Claude CLI gave no result: {detail}") from exc
        self._raise_on_error(event)
        return {
            "content": str(event.get("result", "")),
            "usage": _usage(event.get("usage")),
            "model": model,
            "finish_reason": "stop",
            "cost_usd": float(event.get("total_cost_usd") or 0.0),
        }

    async def stream(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        system_prompt, prompt = _flatten_conversation(messages)
        cmd = self._build_command(
            model=model, system_prompt=system_prompt, streaming=True
        )
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self._cwd(),
                **self._popen_kwargs(),
            )
        except OSError as exc:
            raise EngineConnectionError(f"Could not run Claude CLI: {exc}") from exc

        assert proc.stdin is not None and proc.stdout is not None
        try:
            proc.stdin.write(self._stdin_text(system_prompt, prompt).encode("utf-8"))
            await proc.stdin.drain()
            proc.stdin.close()
            async for raw in proc.stdout:
                try:
                    event = json.loads(raw.decode("utf-8", errors="replace"))
                except json.JSONDecodeError:
                    continue
                kind = event.get("type")
                if kind == "stream_event":
                    delta = (event.get("event") or {}).get("delta") or {}
                    if delta.get("type") == "text_delta" and delta.get("text"):
                        yield delta["text"]
                elif kind == "result":
                    self._raise_on_error(event)
            await asyncio.wait_for(proc.wait(), timeout=10)
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()

    def list_models(self) -> List[str]:
        return list(_ALIASES)

    def can_serve(self, model: str) -> bool:
        return model in _ALIASES or model.startswith("claude-")

    def health(self) -> bool:
        """True when the CLI is installed and logged in (cached for a minute)."""
        binary = self._binary()
        if binary is None:
            return False
        now = time.monotonic()
        if now - self._auth_checked_at < _AUTH_CACHE_SECONDS:
            return self._auth_ok
        try:
            proc = subprocess.run(
                [*binary, "auth", "status"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=15,
                cwd=self._cwd(),
                **self._popen_kwargs(),
            )
            self._auth_ok = bool(json.loads(proc.stdout).get("loggedIn"))
        except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
            self._auth_ok = False
        self._auth_checked_at = now
        return self._auth_ok


__all__ = ["ClaudeCLIEngine"]
