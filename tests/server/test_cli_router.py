"""The Claude Code sign-in helpers report state and open the official CLI; they never touch credentials."""

from __future__ import annotations

import subprocess
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.server import cli_router


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(cli_router.router)
    return TestClient(app)


def test_status_when_claude_is_not_installed(client, monkeypatch) -> None:
    monkeypatch.setattr(cli_router, "_binary", lambda: None)
    assert client.get("/v1/cli/claude/status").json() == {"installed": False, "signed_in": False}


@pytest.mark.parametrize("stdout,expected", [('{"loggedIn": true, "email": "a@b.c"}', True), ('{"loggedIn": false}', False), ("not json", False)])
def test_status_reads_the_cli_and_returns_only_booleans(client, monkeypatch, stdout, expected) -> None:
    monkeypatch.setattr(cli_router, "_binary", lambda: "claude")
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: SimpleNamespace(stdout=stdout))
    assert client.get("/v1/cli/claude/status").json() == {"installed": True, "signed_in": expected}


def test_login_opens_the_cli_in_a_terminal(client, monkeypatch) -> None:
    opened = []
    monkeypatch.setattr(cli_router, "_binary", lambda: "claude")
    monkeypatch.setattr(cli_router, "_open_terminal", lambda cmd: opened.append(cmd) or True)
    assert client.post("/v1/cli/claude/login").json() == {"opened": True}
    assert opened == [["claude"]]


def test_login_without_the_cli_is_a_404(client, monkeypatch) -> None:
    monkeypatch.setattr(cli_router, "_binary", lambda: None)
    assert client.post("/v1/cli/claude/login").status_code == 404
