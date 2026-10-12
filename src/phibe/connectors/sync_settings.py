"""How and when Phibe keeps its connected sources up to date.

Stored in ``~/.phibe/sync_settings.json`` and read again on every check, so a
change made in Settings takes effect without restarting Phibe.
"""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from phibe.core.paths import get_config_dir

logger = logging.getLogger(__name__)

MIN_INTERVAL_MINUTES = 1
MAX_INTERVAL_MINUTES = 24 * 60
# When the interval is one day, the sync runs once a day at ``daily_time``.
DAILY_MINUTES = 24 * 60
# Special interval: no periodic timer at all — sync runs once, shortly after
# each time Phibe starts, and never again until the next start.
ON_START_ONLY_MINUTES = 0
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


@dataclass
class SyncSettings:
    """Automatic sync options. Manual "Sync now" ignores all of them."""

    auto_enabled: bool = True
    interval_minutes: int = 15
    # Sync shortly after Phibe starts instead of waiting a whole interval.
    on_start: bool = True
    # Connectors left out of the automatic sync (they still sync on demand).
    disabled_connectors: List[str] = field(default_factory=list)
    # Local time of day (HH:MM) used when the interval is "once a day".
    daily_time: str = "03:00"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SyncSettingsError(ValueError):
    """The submitted settings are not valid."""


def settings_path() -> Path:
    return get_config_dir() / "sync_settings.json"


def validate(data: Dict[str, Any]) -> SyncSettings:
    """Build settings from user input, rejecting anything out of range."""
    defaults = SyncSettings()
    unknown = set(data) - set(defaults.to_dict())
    if unknown:
        raise SyncSettingsError(f"Unknown setting(s): {', '.join(sorted(unknown))}")
    for key in ("auto_enabled", "on_start"):
        if key in data and not isinstance(data[key], bool):
            raise SyncSettingsError(f"{key} must be true or false")
    daily_time = data.get("daily_time", defaults.daily_time)
    if not isinstance(daily_time, str) or not _TIME_RE.match(daily_time):
        raise SyncSettingsError("daily_time must look like 03:00 (24-hour, HH:MM)")
    interval = data.get("interval_minutes", defaults.interval_minutes)
    valid_interval = (
        isinstance(interval, int)
        and not isinstance(interval, bool)
        and (
            interval == ON_START_ONLY_MINUTES
            or MIN_INTERVAL_MINUTES <= interval <= MAX_INTERVAL_MINUTES
        )
    )
    if not valid_interval:
        raise SyncSettingsError(
            f"interval_minutes must be {ON_START_ONLY_MINUTES} (only on start) or a "
            f"whole number from {MIN_INTERVAL_MINUTES} to {MAX_INTERVAL_MINUTES}"
        )
    disabled = data.get("disabled_connectors", defaults.disabled_connectors)
    if not isinstance(disabled, list) or not all(isinstance(i, str) for i in disabled):
        raise SyncSettingsError("disabled_connectors must be a list of names")
    return SyncSettings(
        auto_enabled=data.get("auto_enabled", defaults.auto_enabled),
        interval_minutes=interval,
        on_start=data.get("on_start", defaults.on_start),
        daily_time=daily_time,
        disabled_connectors=sorted(set(disabled)),
    )


def load_sync_settings(path: Optional[Path] = None) -> SyncSettings:
    """Current settings; defaults when the file is missing or unreadable.

    Keys from an older Phibe version (renamed or removed since) are dropped
    rather than treated as an error — otherwise a field rename would look
    like a corrupt file and silently reset the user's saved settings.
    """
    target = path or settings_path()
    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
        known = set(SyncSettings().to_dict())
        return validate({k: v for k, v in raw.items() if k in known})
    except FileNotFoundError:
        return SyncSettings()
    except (OSError, ValueError) as exc:
        logger.warning("Ignoring unreadable sync settings (%s)", exc)
        return SyncSettings()


def save_sync_settings(settings: SyncSettings, path: Optional[Path] = None) -> None:
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
