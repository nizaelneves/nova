"""Codex CLI engine — drives the official ``codex`` binary in headless mode.

The user's own ChatGPT login (subscription) is used through the unmodified
Codex CLI; Phibe never reads or copies credentials.

The CLI is run as a plain language model:

* the shell, browser, computer-use, connectors, plugins, hooks and sub-agent
  tools are switched off and web search is disabled, so it cannot touch files
  or run commands,
* the user's own ``config.toml`` (MCP servers, profiles, rules) is not loaded
  (auth still works, it lives in ``CODEX_HOME``),
* the sandbox is read-only, nothing is persisted, and the process runs in an
  empty workspace folder,
* the sandbox and approvals are never bypassed.

Sessions are stateless: Phibe sends the whole conversation on every call.

Model ids are ``codex:<name>`` (``codex:default`` leaves the model to the
user's own Codex setup). The ``codex:`` prefix keeps them apart from the API
models handled by the cloud engine.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import subprocess
import sys
import time
import uuid
from collections.abc import AsyncIterator, Sequence
from pathlib import Path
from typing import Any, Dict, List, Optional

from phibe.core.paths import get_config_dir
from phibe.core.registry import EngineRegistry
from phibe.core.types import Message, Role
from phibe.engine._base import EngineConnectionError
from phibe.engine._stubs import InferenceEngine

logger = logging.getLogger(__name__)

_PREFIX = "codex:"
_DEFAULT = "default"
_MODELS = (
    f"{_PREFIX}{_DEFAULT}",
    f"{_PREFIX}gpt-6-astra",
    f"{_PREFIX}gpt-6.1-sol",
    f"{_PREFIX}gpt-6-luna",
)
# Reasoning effort levels, sent as ``model_reasoning_effort`` (the app's slider).
EFFORT_LEVELS = ("low", "medium", "high", "xhigh", "max")
# Everything that would let the model act on the machine or reach other services.
_DISABLED_FEATURES = (
    "shell_tool",
    "apps",
    "browser_use",
    "browser_use_external",
    "computer_use",
    "image_generation",
    "multi_agent",
    "plugins",
    "hooks",
    "tool_suggest",
)
_PLAIN_CHAT_RULES = (
    "You are a plain chat assistant. Answer in text only: do not run commands, "
    "read or edit files, browse the web or use any tool."
)
_AUTH_CACHE_SECONDS = 60.0
_AGENT_MESSAGE_TYPES = ("agent_message", "assistant_message")


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
    prompt = int(raw.get("input_tokens", 0))
    completion = int(raw.get("output_tokens", 0))
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": prompt + completion,
    }


def _model_name(model: str) -> Optional[str]:
    """The name to pass to ``codex -m``, or None to use the user's default."""
    name = model[len(_PREFIX) :] if model.startswith(_PREFIX) else model
    return None if name in ("", _DEFAULT) else name


def _agent_text(event: Dict[str, Any]) -> Optional[str]:
    """The reply text of an ``item.completed`` event, if it carries one."""
    if event.get("type") != "item.completed":
        return None
    item = event.get("item") or {}
    kind = item.get("type") or item.get("item_type")
    text = item.get("text")
    if kind in _AGENT_MESSAGE_TYPES and isinstance(text, str) and text:
        return text
    return None


def _failure(event: Dict[str, Any]) -> Optional[str]:
    """The error message of a failed turn / error event, if it is one."""
    kind = event.get("type")
    if kind not in ("turn.failed", "error"):
        return None
    detail = event.get("error") or event.get("message") or "unknown error"
    if isinstance(detail, dict):
        detail = detail.get("message") or json.dumps(detail)
    return str(detail)


@EngineRegistry.register("codex_cli")
class CodexCLIEngine(InferenceEngine):
    """Inference through the official Codex CLI (uses the user's login)."""

    engine_id = "codex_cli"
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
        found = shutil.which("codex")
        return [found] if found else None

    def _cwd(self) -> Path:
        folder = self._workdir or (get_config_dir() / "cli_workspace" / "codex")
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    @staticmethod
    def _popen_kwargs() -> Dict[str, Any]:
        if sys.platform == "win32":
            return {"creationflags": subprocess.CREATE_NO_WINDOW}
        return {}

    def _build_command(
        self,
        *,
        model: str,
        reply_file: Path,
        effort: Optional[str] = None,
    ) -> List[str]:
        binary = self._binary()
        if binary is None:
            raise EngineConnectionError(
                "Codex CLI not found. Install Codex and log in with `codex login`."
            )
        cmd = [*binary]
        for feature in _DISABLED_FEATURES:
            cmd += ["--disable", feature]
        cmd += ["-c", 'web_search="disabled"']
        if effort:
            if effort not in EFFORT_LEVELS:
                raise EngineConnectionError(
                    f"Unknown effort '{effort}'; use one of: {', '.join(EFFORT_LEVELS)}"
                )
            cmd += ["-c", f'model_reasoning_effort="{effort}"']
        cmd += [
            "exec",
            "--json",
            "--sandbox",
            "read-only",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--skip-git-repo-check",
            "-C",
            str(self._cwd()),
            "-o",
            str(reply_file),
        ]
        name = _model_name(model)
        if name:
            cmd += ["-m", name]
        cmd.append("-")  # the prompt comes on stdin
        return cmd

    def _reply_file(self) -> Path:
        return self._cwd() / f"reply-{uuid.uuid4().hex}.txt"

    @staticmethod
    def _stdin_text(system_prompt: str, prompt: str) -> str:
        rules = f"{_PLAIN_CHAT_RULES}\n\n{system_prompt}" if system_prompt else _PLAIN_CHAT_RULES
        return f"Follow these instructions:\n{rules}\n\n---\n\n{prompt}"

    @staticmethod
    def _read_reply_file(path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8").strip()
        except OSError:
            return ""
        finally:
            path.unlink(missing_ok=True)

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
        reply_file = self._reply_file()
        cmd = self._build_command(
            model=model, reply_file=reply_file, effort=kwargs.get("effort")
        )
        try:
            proc = subprocess.run(
                cmd,
                input=self._stdin_text(system_prompt, prompt),
                capture_output=True,
                text=True,
                encoding="utf-8",
                cwd=str(self._cwd()),
                timeout=self._timeout,
                **self._popen_kwargs(),
            )
        except subprocess.TimeoutExpired as exc:
            reply_file.unlink(missing_ok=True)
            raise EngineConnectionError(
                f"Codex CLI timed out after {self._timeout:.0f}s"
            ) from exc
        except OSError as exc:
            reply_file.unlink(missing_ok=True)
            raise EngineConnectionError(f"Could not run Codex CLI: {exc}") from exc

        pieces: List[str] = []
        usage: Dict[str, Any] = {}
        error: Optional[str] = None
        for raw in proc.stdout.splitlines():
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue
            error = error or _failure(event)
            if (text := _agent_text(event)) is not None:
                pieces.append(text)
            if event.get("type") == "turn.completed":
                usage = event.get("usage") or usage
        fallback = self._read_reply_file(reply_file)
        if error:
            raise EngineConnectionError(f"Codex CLI error: {error}")
        content = "\n\n".join(pieces) or fallback
        if not content:
            detail = (proc.stderr or proc.stdout or "no output").strip()[:300]
            raise EngineConnectionError(f"Codex CLI gave no result: {detail}")
        return {
            "content": content,
            "usage": _usage(usage),
            "model": model,
            "finish_reason": "stop",
            "cost_usd": 0.0,
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
        reply_file = self._reply_file()
        cmd = self._build_command(
            model=model, reply_file=reply_file, effort=kwargs.get("effort")
        )
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self._cwd()),
                **self._popen_kwargs(),
            )
        except OSError as exc:
            reply_file.unlink(missing_ok=True)
            raise EngineConnectionError(f"Could not run Codex CLI: {exc}") from exc

        assert proc.stdin is not None and proc.stdout is not None
        sent_any = False
        error: Optional[str] = None
        try:
            proc.stdin.write(self._stdin_text(system_prompt, prompt).encode("utf-8"))
            await proc.stdin.drain()
            proc.stdin.close()
            # Codex reports whole messages, not token deltas, so each reply
            # arrives as one piece.
            async for raw in proc.stdout:
                try:
                    event = json.loads(raw.decode("utf-8", errors="replace"))
                except json.JSONDecodeError:
                    continue
                error = error or _failure(event)
                if (text := _agent_text(event)) is not None:
                    yield text if not sent_any else f"\n\n{text}"
                    sent_any = True
            await asyncio.wait_for(proc.wait(), timeout=10)
        finally:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()
            fallback = self._read_reply_file(reply_file)
        if error:
            raise EngineConnectionError(f"Codex CLI error: {error}")
        if not sent_any:
            if not fallback:
                raise EngineConnectionError("Codex CLI gave no result")
            yield fallback

    def list_models(self) -> List[str]:
        return list(_MODELS)

    def can_serve(self, model: str) -> bool:
        return model.startswith(_PREFIX)

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
                [*binary, "login", "status"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=15,
                cwd=str(self._cwd()),
                **self._popen_kwargs(),
            )
            # The status line goes to stderr on some versions, stdout on others.
            text = f"{proc.stdout}\n{proc.stderr}".lower()
            self._auth_ok = (
                proc.returncode == 0
                and "logged in" in text
                and "not logged in" not in text
            )
        except (OSError, subprocess.TimeoutExpired):
            self._auth_ok = False
        self._auth_checked_at = now
        return self._auth_ok


__all__ = ["CodexCLIEngine"]
