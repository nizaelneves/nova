"""The Home screen settings: the name in the greeting and the user's phrases."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from nova.server.home_router import (
    HomeSettings,
    HomeSettingsError,
    create_home_router,
    load_home_settings,
    save_home_settings,
    validate,
)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NOVA_HOME", str(tmp_path))
    app = FastAPI()
    app.include_router(create_home_router())
    return TestClient(app)


def test_defaults_have_a_name_and_no_phrases(client) -> None:
    assert client.get("/v1/home").json() == {"display_name": "Nizael", "messages": []}


def test_phrases_are_kept_as_written_in_any_language(client) -> None:
    sent = ["Um passo de cada vez.", "  Keep going  ", "", "   "]
    reply = client.put("/v1/home", json={"messages": sent})
    assert reply.status_code == 200
    assert reply.json()["messages"] == ["Um passo de cada vez.", "Keep going"]
    assert client.get("/v1/home").json()["messages"] == ["Um passo de cada vez.", "Keep going"]


def test_changing_only_the_name_keeps_the_phrases(client) -> None:
    client.put("/v1/home", json={"messages": ["Foco."]})
    client.put("/v1/home", json={"display_name": "Nizael Neves"})
    assert client.get("/v1/home").json() == {"display_name": "Nizael Neves", "messages": ["Foco."]}


@pytest.mark.parametrize(
    "bad",
    [
        {"display_name": 3},
        {"display_name": "x" * 41},
        {"messages": "one phrase"},
        {"messages": [1, 2]},
        {"messages": ["x"] * 51},
        {"messages": ["x" * 201]},
        {"colour": "red"},
    ],
)
def test_invalid_input_is_a_422_and_changes_nothing(client, bad) -> None:
    assert client.put("/v1/home", json=bad).status_code == 422
    assert client.get("/v1/home").json() == {"display_name": "Nizael", "messages": []}


def test_a_broken_file_falls_back_to_defaults(client, tmp_path) -> None:
    (tmp_path / "home.json").write_text("{not json", encoding="utf-8")
    assert load_home_settings() == HomeSettings()


def test_accents_survive_saving(tmp_path) -> None:
    path = tmp_path / "home.json"
    save_home_settings(validate({"messages": ["Vamos, você consegue!"]}), path)
    assert "você" in path.read_text(encoding="utf-8")
    assert load_home_settings(path).messages == ["Vamos, você consegue!"]


def test_validate_rejects_unknown_keys() -> None:
    with pytest.raises(HomeSettingsError):
        validate({"nope": 1})
