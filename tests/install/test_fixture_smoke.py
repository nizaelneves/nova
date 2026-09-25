"""Smoke test that the tmp_nova_home fixture works."""

from __future__ import annotations

from pathlib import Path

from nova.core import config as config_mod


def test_fixture_redirects_default_config_dir(tmp_nova_home: Path) -> None:
    assert config_mod.DEFAULT_CONFIG_DIR == tmp_nova_home
    assert tmp_nova_home.exists()
    assert (tmp_nova_home / ".state").exists()
    assert (tmp_nova_home / ".state" / "models").exists()


def test_fixture_redirects_config_path(tmp_nova_home: Path) -> None:
    assert config_mod.DEFAULT_CONFIG_PATH == tmp_nova_home / "config.toml"
