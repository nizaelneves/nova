"""Sign-in helpers for the Claude Code engine: ``/v1/cli/claude/*``.

Phibe never signs in for the user. It only reports whether the official ``claude`` binary is
installed and signed in, and it opens that binary in a terminal so the user can sign in through
Anthropic's own flow. Credentials stay with the CLI: Phibe does not read, copy or store them.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/v1/cli/claude", tags=["cli"])


def _binary() -> Optional[str]:
    return shutil.which("claude")


def _open_terminal(command: List[str]) -> bool:
    """Run *command* in a new terminal window. True when one was started."""
    try:
        if sys.platform == "win32":
            subprocess.Popen(command, creationflags=subprocess.CREATE_NEW_CONSOLE)
            return True
        if sys.platform == "darwin":
            line = " ".join(subprocess.list2cmdline([c]) if " " in c else c for c in command)
            script = f'tell application "Terminal" to activate\ntell application "Terminal" to do script "{line}"'
            subprocess.Popen(["osascript", "-e", script])
            return True
        for terminal, flag in (("x-terminal-emulator", "-e"), ("gnome-terminal", "--"), ("konsole", "-e"), ("xterm", "-e")):
            if shutil.which(terminal):
                subprocess.Popen([terminal, flag, *command])
                return True
    except OSError:
        return False
    return False


@router.get("/status")
def status() -> Dict[str, Any]:
    """Whether Claude Code is installed and signed in. No account details are returned."""
    binary = _binary()
    if binary is None:
        return {"installed": False, "signed_in": False}
    try:
        proc = subprocess.run(
            [binary, "auth", "status"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        signed_in = bool(json.loads(proc.stdout).get("loggedIn"))
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        signed_in = False
    return {"installed": True, "signed_in": signed_in}


@router.post("/login")
def login() -> Dict[str, bool]:
    """Open the official Claude Code in a terminal; on first run it starts Anthropic's own sign-in."""
    binary = _binary()
    if binary is None:
        raise HTTPException(status_code=404, detail="Claude Code is not installed")
    return {"opened": _open_terminal([binary])}


codex_router = APIRouter(prefix="/v1/cli/codex", tags=["cli"])


def _codex_binary() -> Optional[str]:
    return shutil.which("codex")


@codex_router.get("/status")
def codex_status() -> Dict[str, Any]:
    """Whether Codex is installed and signed in (``codex login status``). No account details are returned."""
    binary = _codex_binary()
    if binary is None:
        return {"installed": False, "signed_in": False}
    try:
        proc = subprocess.run(
            [binary, "login", "status"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        said = f"{proc.stdout or ''} {proc.stderr or ''}".lower()
        signed_in = proc.returncode == 0 and "logged in" in said and "not logged in" not in said
    except (OSError, subprocess.TimeoutExpired):
        signed_in = False
    return {"installed": True, "signed_in": signed_in}


@codex_router.post("/login")
def codex_login() -> Dict[str, bool]:
    """Open the official Codex sign-in in a terminal."""
    binary = _codex_binary()
    if binary is None:
        raise HTTPException(status_code=404, detail="Codex is not installed")
    return {"opened": _open_terminal([binary, "login"])}
