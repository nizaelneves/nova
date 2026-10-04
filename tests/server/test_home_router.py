"""The Home screen settings: the name in the greeting and the user's phrases."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phi.server.home_router import (
    HomeSettings,
    HomeSettingsError,
    create_home_router,
    load_home_settings,
    save_home_settings,
    validate,
)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PHI_HOME", str(tmp_path))
    app = FastAPI()
    app.include_router(create_home_router())
    return TestClient(app)


def test_defaults_have_a_name_and_no_phrases(client) -> None:
    assert client.get("/v1/home").json() == {
        "display_name": "Nizael",
        "messages": [],
        "phrase_rotation_minutes": 60,
    }


def test_phrases_are_kept_as_written_in_any_language(client) -> None:
    sent = ["Um passo de cada vez.", "  Keep going  ", "", "   "]
    reply = client.put("/v1/home", json={"messages": sent})
    assert reply.status_code == 200
    assert reply.json()["messages"] == ["Um passo de cada vez.", "Keep going"]
    assert client.get("/v1/home").json()["messages"] == ["Um passo de cada vez.", "Keep going"]


def test_changing_only_the_name_keeps_the_phrases(client) -> None:
    client.put("/v1/home", json={"messages": ["Foco."]})
    client.put("/v1/home", json={"display_name": "Nizael Neves"})
    assert client.get("/v1/home").json() == {
        "display_name": "Nizael Neves",
        "messages": ["Foco."],
        "phrase_rotation_minutes": 60,
    }


def test_phrase_rotation_can_be_set_and_is_kept(client) -> None:
    reply = client.put("/v1/home", json={"phrase_rotation_minutes": 1440})
    assert reply.json()["phrase_rotation_minutes"] == 1440
    assert client.get("/v1/home").json()["phrase_rotation_minutes"] == 1440


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
        {"phrase_rotation_minutes": 45},
        {"phrase_rotation_minutes": "60"},
        {"phrase_rotation_minutes": 0},
    ],
)
def test_invalid_input_is_a_422_and_changes_nothing(client, bad) -> None:
    assert client.put("/v1/home", json=bad).status_code == 422
    assert client.get("/v1/home").json() == {
        "display_name": "Nizael",
        "messages": [],
        "phrase_rotation_minutes": 60,
    }


def test_a_broken_file_falls_back_to_defaults(client, tmp_path) -> None:
    (tmp_path / "home.json").write_text("{not json", encoding="utf-8")
    assert load_home_settings() == HomeSettings()


def test_a_field_from_an_older_version_is_dropped_not_treated_as_corrupt(tmp_path) -> None:
    """Renaming a setting must never look like a broken file and wipe the rest."""
    path = tmp_path / "home.json"
    path.write_text(
        '{"display_name": "Nizael", "messages": ["Foco."], "phrase_rotation": "hourly"}',
        encoding="utf-8",
    )
    loaded = load_home_settings(path)
    assert loaded.messages == ["Foco."]
    assert loaded.display_name == "Nizael"


def test_accents_survive_saving(tmp_path) -> None:
    path = tmp_path / "home.json"
    save_home_settings(validate({"messages": ["Vamos, você consegue!"]}), path)
    assert "você" in path.read_text(encoding="utf-8")
    assert load_home_settings(path).messages == ["Vamos, você consegue!"]


def test_validate_rejects_unknown_keys() -> None:
    with pytest.raises(HomeSettingsError):
        validate({"nope": 1})
