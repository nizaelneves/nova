"""Default persona files seeded for a fresh Nova home."""

from __future__ import annotations

from pathlib import Path

from nova.prompt.defaults import default_memory, default_soul, default_user


def test_default_soul_defines_nova_and_how_to_address_the_user() -> None:
    soul = default_soul()
    assert "You are Nova" in soul
    assert '"Senhor"' in soul and '"Nizael"' in soul
    assert "Portuguese" in soul and "English" in soul


def test_default_user_profile_names_the_user() -> None:
    assert "Nizael Neves" in default_user()


def test_default_memory_is_empty_template() -> None:
    assert default_memory().startswith("# Agent Memory")


def test_seed_memory_files_writes_persona_files(tmp_path: Path, monkeypatch) -> None:
    from nova.cli import _bootstrap

    monkeypatch.setattr(_bootstrap._cfg, "DEFAULT_CONFIG_DIR", tmp_path)

    _bootstrap._seed_memory_files()

    assert (tmp_path / "SOUL.md").read_text(encoding="utf-8") == default_soul()
    assert (tmp_path / "USER.md").read_text(encoding="utf-8") == default_user()
    assert (tmp_path / "MEMORY.md").exists()
    assert (tmp_path / "skills").is_dir()
