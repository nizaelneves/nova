"""Optional NVIDIA GPU pack for the local voice engine (Windows).

Faster-Whisper can run on an NVIDIA GPU, which turns a few seconds of waiting into well under
one, but it needs the CUDA libraries (cuBLAS and cuDNN, about 1 GB). They are not part of the
app: when the user asks, they are downloaded from PyPI (the official ``nvidia-*-cu12`` wheels)
into ``<config dir>/gpu-pack/`` and added to the DLL search path. A switch turns the GPU on
and off; if the GPU fails to load, the engine falls back to the CPU on its own.
"""

from __future__ import annotations

import io
import json
import os
import sys
import threading
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from phibe.core.config import get_config_dir

PACKAGES = ("nvidia-cublas-cu12", "nvidia-cudnn-cu12")
# A DLL that proves each package is in place, with the folder it lives in.
MARKERS = (("nvidia/cublas/bin", "cublas64_12.dll"), ("nvidia/cudnn/bin", "cudnn64_9.dll"))
APPROX_MB = 1000

_lock = threading.Lock()
_state: Dict[str, Any] = {"downloading": False, "done": 0, "total": 0, "error": None}


def pack_dir() -> Path:
    return get_config_dir() / "gpu-pack"


def _supported() -> bool:
    return sys.platform == "win32"


def gpu_present() -> bool:
    """True when CTranslate2 sees an NVIDIA GPU (this works before the libraries are installed)."""
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except Exception:  # noqa: BLE001
        return False


def is_installed(folder: Optional[Path] = None) -> bool:
    base = folder or pack_dir()
    return all((base / sub / dll).is_file() for sub, dll in MARKERS)


def is_enabled(folder: Optional[Path] = None) -> bool:
    base = folder or pack_dir()
    return is_installed(base) and (base / "enabled").is_file()


def set_enabled(on: bool, folder: Optional[Path] = None) -> None:
    flag = (folder or pack_dir()) / "enabled"
    if on:
        flag.parent.mkdir(parents=True, exist_ok=True)
        flag.write_text("1", encoding="utf-8")
    else:
        flag.unlink(missing_ok=True)


_dll_handles: List[Any] = []


def activate(folder: Optional[Path] = None) -> bool:
    """Makes the pack's DLLs loadable by this process; False when it is not installed."""
    base = folder or pack_dir()
    if not _supported() or not is_installed(base):
        return False
    for sub, _ in MARKERS:
        path = str(base / sub)
        os.environ["PATH"] = path + os.pathsep + os.environ.get("PATH", "")
        try:
            _dll_handles.append(os.add_dll_directory(path))
        except (OSError, AttributeError):
            pass
    return True


def status(folder: Optional[Path] = None) -> Dict[str, Any]:
    base = folder or pack_dir()
    with _lock:
        state = dict(_state)
    installed = is_installed(base)
    total = state["total"]
    return {
        "available": _supported() and gpu_present(),
        "installed": installed,
        "enabled": is_enabled(base),
        "downloading": state["downloading"] and not installed,
        "progress": 1.0 if installed else (round(min(0.99, state["done"] / total), 3) if total else 0.0),
        "size_mb": APPROX_MB,
        "error": state["error"],
    }


def pick_wheel(release_files: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The Windows 64-bit wheel among a PyPI release's files."""
    for file in release_files:
        name = file.get("filename", "")
        if name.endswith(".whl") and "win_amd64" in name and not file.get("yanked"):
            return file
    return None


def extract_wheel(data: bytes, folder: Path) -> None:
    """Unpacks the ``nvidia/...`` part of a wheel into the pack folder."""
    with zipfile.ZipFile(io.BytesIO(data)) as wheel:
        for member in wheel.namelist():
            if member.startswith("nvidia/") and not member.endswith("/"):
                target = folder / member
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(wheel.read(member))


def _fetch_json(url: str) -> Dict[str, Any]:
    with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310 - fixed PyPI host
        return json.loads(response.read())


def _download(url: str) -> bytes:
    chunks = []
    with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            chunks.append(chunk)
            with _lock:
                _state["done"] += len(chunk)
    return b"".join(chunks)


def _install(folder: Path) -> None:
    wheels = []
    for package in PACKAGES:
        info = _fetch_json(f"https://pypi.org/pypi/{package}/json")
        wheel = pick_wheel(info["urls"])
        if wheel is None:
            raise RuntimeError(f"No Windows build of {package} was found")
        wheels.append(wheel)
    with _lock:
        _state["done"] = 0
        _state["total"] = sum(int(w.get("size", 0)) for w in wheels)
    for wheel in wheels:
        extract_wheel(_download(wheel["url"]), folder)


def start_install(folder: Optional[Path] = None) -> bool:
    """Starts the download in the background; False if one is running or it cannot work here."""
    base = folder or pack_dir()
    if not _supported():
        return False
    with _lock:
        if _state["downloading"]:
            return False
        _state.update(downloading=True, error=None, done=0, total=0)

    def run() -> None:
        try:
            _install(base)
        except Exception as exc:  # noqa: BLE001
            with _lock:
                _state["error"] = f"Could not download the GPU pack: {exc}"
        finally:
            with _lock:
                _state["downloading"] = False

    threading.Thread(target=run, name="gpu-pack-download", daemon=True).start()
    return True
