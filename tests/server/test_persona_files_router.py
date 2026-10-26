"""SOUL.md and USER.md edited from the screen: refused above their limit, used from the next message."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.server.persona_files_router import create_persona_files_router


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path / "home"))
    (tmp_path / "home").mkdir()
    return tmp_path / "home"


@pytest.fixture
def app(home):
    application = FastAPI()
    application.state.agent = SimpleNamespace(_prompt_builder=MagicMock())
    application.include_router(create_persona_files_router())
    return application


@pytest.fixture
def client(app):
    return TestClient(app)


def test_the_two_files_come_with_their_limits(client, home) -> None:
    (home / "SOUL.md").write_text("You are Phibe.", encoding="utf-8")
    got = client.get("/v1/persona-files").json()
    assert got["soul"] == {"text": "You are Phibe.", "limit": 4000}
    assert got["user"] == {"text": "", "limit": 1500}  # a file that does not exist reads as empty


def test_a_save_writes_only_the_file_sent_and_tells_the_prompt_to_reload(client, app, home) -> None:
    (home / "USER.md").write_text("Nizael", encoding="utf-8")
    got = client.put("/v1/persona-files", json={"soul": "New soul"}).json()
    assert got["soul"]["text"] == "New soul" and got["user"]["text"] == "Nizael"
    assert (home / "SOUL.md").read_text(encoding="utf-8") == "New soul"
    app.state.agent._prompt_builder.reload.assert_called_once()


def test_a_text_over_its_limit_is_refused_and_the_file_stays_as_it_was(client, home) -> None:
    (home / "SOUL.md").write_text("before", encoding="utf-8")
    refused = client.put("/v1/persona-files", json={"soul": "x" * 4001})
    assert refused.status_code == 422 and "4000" in refused.json()["detail"]
    assert (home / "SOUL.md").read_text(encoding="utf-8") == "before"
    assert client.put("/v1/persona-files", json={"soul": "x" * 4000}).status_code == 200  # exactly the limit is fine
    assert client.put("/v1/persona-files", json={"user": "y" * 1501}).status_code == 422


def test_unknown_files_and_non_text_are_refused(client) -> None:
    assert client.put("/v1/persona-files", json={"memory": "x"}).status_code == 422  # MEMORY.md no longer exists
    assert client.put("/v1/persona-files", json={"soul": 5}).status_code == 422


def test_the_preview_shows_what_the_prompt_is_made_of(client, home) -> None:
    (home / "SOUL.md").write_text("Soul text", encoding="utf-8")
    (home / "USER.md").write_text("User text", encoding="utf-8")
    got = client.get("/v1/persona-files/preview").json()
    names = [s["name"] for s in got["sections"]]
    assert names[-2:] == ["soul", "user"] and "memory" not in names
    assert got["chars"] == sum(s["chars"] for s in got["sections"])
    assert "Soul text" in next(s["text"] for s in got["sections"] if s["name"] == "soul")


def test_base_instructions_start_as_the_built_in_text_and_save_as_their_own_file(client, home) -> None:
    default = client.get("/v1/persona-files").json()["instructions"]["text"]
    assert "Phibe" in default and not (home / "INSTRUCTIONS.md").exists()
    client.put("/v1/persona-files", json={"instructions": "Be brief."})
    assert (home / "INSTRUCTIONS.md").read_text(encoding="utf-8") == "Be brief."
    assert client.put("/v1/persona-files", json={"instructions": "x" * 2001}).status_code == 422
    client.put("/v1/persona-files", json={"instructions": "  "})  # empty goes back to the built-in text
    assert not (home / "INSTRUCTIONS.md").exists()
