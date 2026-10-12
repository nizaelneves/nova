"""Pings settings: notifications channels and automatic-reminder options."""

from __future__ import annotations

import pytest

from phibe.pings.settings import (
    PingsSettings,
    PingsSettingsError,
    load_pings_settings,
    save_pings_settings,
    validate,
)


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path))
    return tmp_path


def test_defaults(home) -> None:
    settings = load_pings_settings()
    assert settings == PingsSettings(
        notifications_enabled=True,
        floating_button_enabled=True,
        lead_enabled=False,
        default_lead_minutes=15,
    )


def test_settings_survive_a_restart(home) -> None:
    save_pings_settings(
        PingsSettings(
            notifications_enabled=False,
            lead_enabled=True,
            default_lead_minutes=30,
        )
    )

    loaded = load_pings_settings()

    assert loaded.notifications_enabled is False
    assert loaded.lead_enabled is True
    assert loaded.default_lead_minutes == 30
    assert not list(home.glob("*.tmp"))


def test_a_broken_settings_file_falls_back_to_defaults(home) -> None:
    (home / "pings_settings.json").write_text("{not json", encoding="utf-8")
    assert load_pings_settings() == PingsSettings()


def test_a_field_from_an_older_version_is_dropped_not_treated_as_corrupt(home) -> None:
    """Renaming a setting must never look like a broken file and wipe the rest."""
    (home / "pings_settings.json").write_text(
        '{"notifications_enabled": false, "default_lead_minutes": 45,'
        ' "telegram_enabled": true}',
        encoding="utf-8",
    )

    loaded = load_pings_settings()

    assert loaded.notifications_enabled is False
    assert loaded.default_lead_minutes == 45


@pytest.mark.parametrize(
    "bad",
    [
        {"notifications_enabled": "yes"},
        {"floating_button_enabled": 1},
        {"lead_enabled": "on"},
        {"browser_enabled": True},  # removed,
        {"default_lead_minutes": -1},
        {"default_lead_minutes": 1441},
        {"default_lead_minutes": 1.5},
        {"default_lead_minutes": True},
        {"tasks_reminders_enabled": True},  # automatic pings were removed
        {"finances_lead_days": 3},
        {"telegram_enabled": True},
        {"colour": "red"},
    ],
)
def test_invalid_settings_are_refused(bad) -> None:
    with pytest.raises(PingsSettingsError):
        validate(bad)


def test_keys_from_older_versions_are_dropped_not_fatal(home) -> None:
    (home / "pings_settings.json").write_text(
        '{"lead_enabled": true, "browser_enabled": true, "tasks_lead_minutes": 60}', encoding="utf-8"
    )
    assert load_pings_settings().lead_enabled is True
