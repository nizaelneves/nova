"""Phibe — modular AI assistant backend with composable intelligence primitives."""

from __future__ import annotations

import os as _os

# Phi -> Phibe: keep old PHI_* environment variables working.
for _k, _v in list(_os.environ.items()):
    if _k.startswith("PHI_") and "PHIBE_" + _k[4:] not in _os.environ:
        _os.environ["PHIBE_" + _k[4:]] = _v

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _pkg_version
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from phibe.sdk import MemoryHandle, Phibe, PhibeSystem, SystemBuilder

try:
    __version__ = _pkg_version("phibe")
except PackageNotFoundError:  # pragma: no cover — uninstalled source tree
    __version__ = "0.0.0+unknown"

__all__ = ["Phibe", "PhibeSystem", "MemoryHandle", "SystemBuilder", "__version__"]

_SDK_EXPORTS = {"Phibe", "PhibeSystem", "MemoryHandle", "SystemBuilder"}


def __getattr__(name: str) -> Any:
    """Load SDK exports lazily so lightweight CLI diagnostics can start safely."""
    if name not in _SDK_EXPORTS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    from phibe import sdk

    value = getattr(sdk, name)
    globals()[name] = value
    return value


def __dir__() -> list[str]:
    return sorted(set(globals()) | _SDK_EXPORTS)
