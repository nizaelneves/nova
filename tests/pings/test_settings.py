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
        in_app_enabled=True,
        browser_enabled=False,
        default_lead_minutes=0,
        tasks_reminders_enabled=False,
        tasks_lead_minutes=15,
        finances_reminders_enabled=False,
        finances_lead_days=3,
    )


def test_settings_survive_a_restart(home) -> None:
    save_pings_settings(
        PingsSettings(
            notifications_enabled=False,
            browser_enabled=True,
            default_lead_minutes=30,
            tasks_reminders_enabled=True,
            tasks_lead_minutes=60,
            finances_reminders_enabled=True,
            finances_lead_days=7,
        )
    )

    loaded = load_pings_settings()

    assert loaded.notifications_enabled is False
    assert loaded.browser_enabled is True
    assert loaded.default_lead_minutes == 30
    assert loaded.tasks_lead_minutes == 60
    assert loaded.finances_lead_days == 7
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
        {"in_app_enabled": 1},
        {"browser_enabled": "on"},
        {"default_lead_minutes": -1},
        {"default_lead_minutes": 1441},
        {"default_lead_minutes": 1.5},
        {"default_lead_minutes": True},
        {"tasks_reminders_enabled": "no"},
        {"tasks_lead_minutes": -1},
        {"tasks_lead_minutes": 99999},
        {"finances_reminders_enabled": "no"},
        {"finances_lead_days": -1},
        {"finances_lead_days": 91},
        {"telegram_enabled": True},
        {"colour": "red"},
    ],
)
def test_invalid_settings_are_refused(bad) -> None:
    with pytest.raises(PingsSettingsError):
        validate(bad)
