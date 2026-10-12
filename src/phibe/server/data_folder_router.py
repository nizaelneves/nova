"""Where Phibe keeps your data on this computer, and a button to open it.

Tasks, finances, memory, the knowledge index and settings all live in one
folder (``.phibe`` inside your user folder).
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict

from fastapi import APIRouter, HTTPException, Request

from phibe.core.paths import get_config_dir

logger = logging.getLogger(__name__)

_LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}


def _is_local_request(request: Request) -> bool:
    """Opening a window only makes sense for someone at this computer."""
    return bool(request.client) and request.client.host in _LOCAL_HOSTS


def _open_folder(path: Path) -> None:
    if sys.platform.startswith("win"):
        os.startfile(str(path))  # noqa: S606 - a fixed folder we just checked
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])  # noqa: S603, S607
    else:
        subprocess.Popen(["xdg-open", str(path)])  # noqa: S603, S607


def create_data_folder_router() -> APIRouter:
    router = APIRouter(prefix="/v1/data-folder", tags=["system"])

    @router.get("")
    async def get_data_folder() -> Dict[str, object]:
        folder = get_config_dir()
        return {"path": str(folder), "exists": folder.is_dir()}

    @router.post("/open")
    async def open_data_folder(request: Request) -> Dict[str, str]:
        if not _is_local_request(request):
            raise HTTPException(status_code=403, detail="Only from this computer")
        folder = get_config_dir()
        if not folder.is_dir():
            raise HTTPException(status_code=404, detail="The folder does not exist yet")
        try:
            _open_folder(folder)
        except OSError as exc:
            logger.warning("Could not open %s (%s)", folder, exc)
            raise HTTPException(status_code=500, detail="Could not open the folder") from exc
        return {"opened": str(folder)}

    return router
