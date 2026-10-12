"""Cloud provider keys can be saved from Settings and take effect at once."""

from __future__ import annotations

import os

import pytest

from phibe.core import credentials as creds


@pytest.mark.parametrize(
    ("section", "key"),
    [
        ("openai", "OPENAI_API_KEY"),
        ("anthropic", "ANTHROPIC_API_KEY"),
        ("gemini", "GEMINI_API_KEY"),
        ("openrouter", "OPENROUTER_API_KEY"),
        ("jev", "TYPESAFE_API_KEY"),
    ],
)
def test_a_provider_key_is_saved_and_reaches_the_environment(tmp_path, monkeypatch, section, key) -> None:
    monkeypatch.delenv(key, raising=False)
    path = tmp_path / "credentials.toml"
    creds.save_credential(section, key, "  secret-value  ", path=path)
    assert os.environ[key] == "secret-value"
    assert creds.load_credentials(path)[section][key] == "secret-value"
    assert creds.get_credential_status(section) == {key: True}
    creds.delete_credential(section, key, path=path)
    assert key not in os.environ
    assert creds.get_credential_status(section) == {key: False}


def test_a_key_of_another_provider_is_refused(tmp_path) -> None:
    with pytest.raises(ValueError):
        creds.save_credential("openai", "ANTHROPIC_API_KEY", "x", path=tmp_path / "c.toml")
