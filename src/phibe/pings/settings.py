"""How and where Phibe's Pings notify you.

Stored in ``~/.phibe/pings_settings.json``. Deliberately small: only the
channels that ship in this pass. Telegram and WhatsApp are not represented
here at all yet — the frontend renders them as static "coming soon"
placeholders with no backend-backed toggle.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from phibe.core.paths import get_config_dir

logger = logging.getLogger(__name__)

MIN_LEAD_MINUTES = 0
MAX_LEAD_MINUTES = 24 * 60


@dataclass
class PingsSettings:
    notifications_enabled: bool = True
    floating_button_enabled: bool = True
    # Notify ahead of the due time; when off, pings notify at the exact time.
    lead_enabled: bool = False
    default_lead_minutes: int = 15

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class PingsSettingsError(ValueError):
    """The submitted settings are not valid."""


def settings_path() -> Path:
    return get_config_dir() / "pings_settings.json"


def _bool(data: Dict[str, Any], key: str, default: bool) -> bool:
    value = data.get(key, default)
    if not isinstance(value, bool):
        raise PingsSettingsError(f"{key} must be true or false")
    return value


def _int_in_range(data: Dict[str, Any], key: str, default: int, lo: int, hi: int) -> int:
    value = data.get(key, default)
    if not isinstance(value, int) or isinstance(value, bool) or not (lo <= value <= hi):
        raise PingsSettingsError(f"{key} must be a whole number from {lo} to {hi}")
    return value


def validate(data: Dict[str, Any]) -> PingsSettings:
    """Build settings from user input, rejecting anything unknown or invalid."""
    defaults = PingsSettings()
    unknown = set(data) - set(defaults.to_dict())
    if unknown:
        raise PingsSettingsError(f"Unknown setting(s): {', '.join(sorted(unknown))}")

    return PingsSettings(
        notifications_enabled=_bool(data, "notifications_enabled", defaults.notifications_enabled),
        floating_button_enabled=_bool(data, "floating_button_enabled", defaults.floating_button_enabled),
        lead_enabled=_bool(data, "lead_enabled", defaults.lead_enabled),
        default_lead_minutes=_int_in_range(
            data, "default_lead_minutes", defaults.default_lead_minutes,
            MIN_LEAD_MINUTES, MAX_LEAD_MINUTES,
        ),
    )


def load_pings_settings(path: Optional[Path] = None) -> PingsSettings:
    """Current settings; defaults when the file is missing or unreadable.

    Keys from an older Phibe version (renamed or removed since) are dropped
    rather than treated as an error — otherwise a field rename would look
    like a corrupt file and silently reset the user's saved settings.
    """
    target = path or settings_path()
    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
        known = set(PingsSettings().to_dict())
        return validate({k: v for k, v in raw.items() if k in known})
    except FileNotFoundError:
        return PingsSettings()
    except (OSError, ValueError) as exc:
        logger.warning("Ignoring unreadable pings settings (%s)", exc)
        return PingsSettings()


def save_pings_settings(settings: PingsSettings, path: Optional[Path] = None) -> None:
    """Write the settings atomically so a crash never leaves half a file."""
    target = path or settings_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(settings.to_dict(), handle, indent=2)
        os.replace(tmp, target)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
