"""The memory notes: what Phibe remembers about you, editable as plain text."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.server.memory_notes_router import MAX_NOTE_CHARS, create_memory_notes_router


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path))
    app = FastAPI()
    app.include_router(create_memory_notes_router())
    return TestClient(app)


def test_empty_when_the_files_do_not_exist(client) -> None:
    assert client.get("/v1/memory-notes").json() == {"about_you": "", "memories": ""}


def test_saving_writes_the_real_files_and_keeps_accents(client, tmp_path) -> None:
    reply = client.put("/v1/memory-notes", json={"about_you": "Nome: Nizael. Fala português."})
    assert reply.status_code == 200
    assert (tmp_path / "USER.md").read_text(encoding="utf-8") == "Nome: Nizael. Fala português."
    assert not (tmp_path / "MEMORY.md").exists()


def test_changing_one_note_keeps_the_other(client) -> None:
    client.put("/v1/memory-notes", json={"about_you": "A", "memories": "B"})
    client.put("/v1/memory-notes", json={"memories": "C"})
    assert client.get("/v1/memory-notes").json() == {"about_you": "A", "memories": "C"}


def test_a_note_can_be_cleared(client) -> None:
    client.put("/v1/memory-notes", json={"memories": "B"})
    client.put("/v1/memory-notes", json={"memories": ""})
    assert client.get("/v1/memory-notes").json()["memories"] == ""


@pytest.mark.parametrize(
    "bad",
    [{"nope": "x"}, {"memories": 3}, {"about_you": "x" * (MAX_NOTE_CHARS + 1)}],
)
def test_invalid_input_is_a_422_and_changes_nothing(client, bad) -> None:
    client.put("/v1/memory-notes", json={"about_you": "keep"})
    assert client.put("/v1/memory-notes", json=bad).status_code == 422
    assert client.get("/v1/memory-notes").json()["about_you"] == "keep"
