"""The voice model on disk: is it there, and download it on request.

The model is not bundled with the app (it is about 486 MB for ``small``); nothing downloads
until the user asks. Progress is read from the size of the download folder, so it works
without hooking into the downloader.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Dict, Optional

# Approximate download sizes in MB of the faster-whisper models.
SIZE_MB = {"tiny": 75, "base": 145, "small": 486, "medium": 1530, "large-v3": 3090}

_lock = threading.Lock()
_state: Dict[str, Any] = {"downloading": None, "error": None}


def _cache_dir() -> Path:
    from huggingface_hub import constants

    return Path(constants.HF_HUB_CACHE)


def _repo_dir(model: str, cache: Optional[Path] = None) -> Path:
    return (cache or _cache_dir()) / f"models--Systran--faster-whisper-{model}"


def _bytes_on_disk(folder: Path) -> int:
    blobs = folder / "blobs"
    if not blobs.is_dir():
        return 0
    return sum(f.stat().st_size for f in blobs.iterdir() if f.is_file())


def is_installed(model: str, cache: Optional[Path] = None) -> bool:
    """True when a finished snapshot (with the weights) is in the cache."""
    snapshots = _repo_dir(model, cache) / "snapshots"
    return snapshots.is_dir() and any(snapshots.glob("*/model.bin"))


def status(model: str, cache: Optional[Path] = None) -> Dict[str, Any]:
    total = SIZE_MB.get(model, 0)
    installed = is_installed(model, cache)
    with _lock:
        downloading = _state["downloading"] == model
        error = _state["error"]
    done_mb = total if installed else round(_bytes_on_disk(_repo_dir(model, cache)) / 1_000_000)
    progress = 1.0 if installed else (min(0.99, done_mb / total) if total else 0.0)
    return {
        "model": model,
        "installed": installed,
        "downloading": downloading and not installed,
        "size_mb": total,
        "progress": round(progress, 3),
        "error": error,
    }


def start_download(model: str) -> bool:
    """Starts the download in the background; False if one is already running."""
    with _lock:
        if _state["downloading"]:
            return False
        _state["downloading"] = model
        _state["error"] = None

    def run() -> None:
        try:
            from faster_whisper.utils import download_model

            download_model(model)
        except Exception as exc:  # noqa: BLE001
            with _lock:
                _state["error"] = f"Could not download the voice model: {exc}"
        finally:
            with _lock:
                _state["downloading"] = None

    threading.Thread(target=run, name="voice-model-download", daemon=True).start()
    return True
