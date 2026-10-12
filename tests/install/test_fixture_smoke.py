"""Smoke test that the tmp_phibe_home fixture works."""

from __future__ import annotations

from pathlib import Path

from phibe.core import config as config_mod


def test_fixture_redirects_default_config_dir(tmp_phibe_home: Path) -> None:
    assert config_mod.DEFAULT_CONFIG_DIR == tmp_phibe_home
    assert tmp_phibe_home.exists()
    assert (tmp_phibe_home / ".state").exists()
    assert (tmp_phibe_home / ".state" / "models").exists()


def test_fixture_redirects_config_path(tmp_phibe_home: Path) -> None:
    assert config_mod.DEFAULT_CONFIG_PATH == tmp_phibe_home / "config.toml"
