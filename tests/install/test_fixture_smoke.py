"""Smoke test that the tmp_phi_home fixture works."""

from __future__ import annotations

from pathlib import Path

from phi.core import config as config_mod


def test_fixture_redirects_default_config_dir(tmp_phi_home: Path) -> None:
    assert config_mod.DEFAULT_CONFIG_DIR == tmp_phi_home
    assert tmp_phi_home.exists()
    assert (tmp_phi_home / ".state").exists()
    assert (tmp_phi_home / ".state" / "models").exists()


def test_fixture_redirects_config_path(tmp_phi_home: Path) -> None:
    assert config_mod.DEFAULT_CONFIG_PATH == tmp_phi_home / "config.toml"
