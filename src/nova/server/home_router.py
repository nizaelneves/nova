"""What the Home screen says: the name in the greeting and the user's own phrases.

Stored in ``~/.nova/home.json``. The phrases are shown exactly as written, in
whatever language the user typed them.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException

from nova.core.paths import get_config_dir

logger = logging.getLogger(__name__)

MAX_NAME_LENGTH = 40
MAX_MESSAGES = 50
MAX_MESSAGE_LENGTH = 200


@dataclass
class HomeSettings:
    display_name: str = "Nizael"
    messages: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class HomeSettingsError(ValueError):
    """The submitted settings are not valid."""


def home_path() -> Path:
    return get_config_dir() / "home.json"


def validate(data: Dict[str, Any]) -> HomeSettings:
    """Build settings from user input, rejecting anything that does not fit."""
    defaults = HomeSettings()
    unknown = set(data) - set(defaults.to_dict())
    if unknown:
        raise HomeSettingsError(f"Unknown setting(s): {', '.join(sorted(unknown))}")

    name = data.get("display_name", defaults.display_name)
    if not isinstance(name, str):
        raise HomeSettingsError("display_name must be text")
    name = name.strip()
    if len(name) > MAX_NAME_LENGTH:
        raise HomeSettingsError(f"display_name can have at most {MAX_NAME_LENGTH} characters")

    messages = data.get("messages", defaults.messages)
    if not isinstance(messages, list) or not all(isinstance(m, str) for m in messages):
        raise HomeSettingsError("messages must be a list of text")
    cleaned = [m.strip() for m in messages if m.strip()]
    if len(cleaned) > MAX_MESSAGES:
        raise HomeSettingsError(f"At most {MAX_MESSAGES} phrases")
    if any(len(m) > MAX_MESSAGE_LENGTH for m in cleaned):
        raise HomeSettingsError(f"Each phrase can have at most {MAX_MESSAGE_LENGTH} characters")
    return HomeSettings(display_name=name, messages=cleaned)


def load_home_settings(path: Optional[Path] = None) -> HomeSettings:
    """Current settings; defaults when the file is missing or unreadable."""
    target = path or home_path()
    try:
        return validate(json.loads(target.read_text(encoding="utf-8")))
    except FileNotFoundError:
        return HomeSettings()
    except (OSError, ValueError) as exc:
        logger.warning("Ignoring unreadable home settings (%s)", exc)
        return HomeSettings()


def save_home_settings(settings: HomeSettings, path: Optional[Path] = None) -> None:
    """Write the settings atomically so a crash never leaves half a file."""
    target = path or home_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(settings.to_dict(), handle, indent=2, ensure_ascii=False)
        os.replace(tmp, target)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def create_home_router() -> APIRouter:
    router = APIRouter(prefix="/v1/home", tags=["home"])

    @router.get("")
    async def get_home() -> Dict[str, Any]:
        return load_home_settings().to_dict()

    @router.put("")
    async def put_home(body: Dict[str, Any]) -> Dict[str, Any]:
        """Change the name and/or the phrases; what is not sent stays as it is."""
        try:
            settings = validate({**load_home_settings().to_dict(), **body})
        except HomeSettingsError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        save_home_settings(settings)
        return settings.to_dict()

    return router
