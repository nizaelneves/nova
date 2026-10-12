"""Central, env-aware resolution of Phibe's home directory.

Phibe keeps all of its runtime state (config, databases, caches, logs,
credentials, skills, recipes, …) under a single root so it never clutters the
user's home directory beyond one directory. That root is resolved here, with
the following precedence (highest first):

1. ``$PHIBE_HOME`` — explicit override.
2. ``$XDG_DATA_HOME/phibe`` — when ``$XDG_DATA_HOME`` is set, follow the
   XDG Base Directory spec by nesting a single ``phibe`` directory under
   it. We deliberately use ONE directory rather than splitting across XDG
   config/data/cache so the install tree stays self-contained and relocatable.
3. ``~/.phibe`` — the historical default. With no env vars set, the
   resolved path is exactly this, so existing installs are untouched.

``config.py`` re-exports :func:`get_config_dir` results through the legacy
``DEFAULT_CONFIG_DIR``/``DEFAULT_CONFIG_PATH`` names (computed dynamically) so
the ~45 modules that import those names keep working while honoring the
override. Modules that previously hardcoded ``Path.home() / ".phibe"``
should call :func:`get_config_dir` (or :func:`get_data_dir` /
:func:`get_cache_dir`) instead.

Defense in depth: the resolved root must never live inside the Phibe
source tree (a misconfigured ``$PHIBE_HOME`` pointing at the repo would
otherwise scatter runtime artifacts into the working tree). This mirrors the
guard in ``learning/spec_search/storage/paths.py`` and fails loudly per
REVIEW.md's no-silent-failure discipline.
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

_DEFAULT_DIR_NAME = ".phibe"
# Oldest last: ~/.phi (the previous name, Phi) wins over ~/.nova (before that).
_LEGACY_DIR_NAMES = (".phi", ".nova")
_XDG_SUBDIR_NAME = "phibe"


class ConfigurationError(RuntimeError):
    """Raised when the resolved home directory would violate isolation guarantees."""


def _find_source_root() -> Path | None:
    """Walk upward from this module to find the Phibe source root.

    Returns the directory containing the Phibe ``pyproject.toml`` (the one
    whose ``name = "phibe"``), or ``None`` when running from an installed
    wheel rather than a source checkout.
    """
    here = Path(__file__).resolve()
    for candidate in (here, *here.parents):
        py = candidate / "pyproject.toml"
        if py.exists():
            try:
                content = py.read_text(encoding="utf-8")
            except OSError:
                continue
            if 'name = "phibe"' in content.lower():
                return candidate
    return None


def _reject_source_tree(path: Path) -> Path:
    """Raise if ``path`` resolves inside the Phibe source tree."""
    source_root = _find_source_root()
    if source_root is not None:
        try:
            path.relative_to(source_root)
        except ValueError:
            pass  # Good — not inside the source tree.
        else:
            raise ConfigurationError(
                f"Phibe home ({path}) is inside the source tree "
                f"({source_root}). Phibe refuses to write runtime state "
                "inside its own repo. Set PHIBE_HOME (or XDG_DATA_HOME) "
                "to a directory outside the repo (default: ~/.phibe)."
            )
    return path


def _migrate_legacy_home(default_dir: Path) -> None:
    """One-time copy of the legacy ``~/.phi`` (or older ``~/.nova``) directory to ``~/.phibe``.

    Phi (and before it Nova) was renamed to Phibe; existing installs keep their settings,
    credentials, and memory under the old ``~/.nova`` directory. When the new
    default location doesn't exist yet but the legacy one does, transparently
    copy it over so nothing appears to have been lost. This only ever applies
    to the plain default-path branch (no ``PHIBE_HOME``/``XDG_DATA_HOME``
    override in play) and only runs once, guarded by ``default_dir`` not yet
    existing. Any failure is logged and swallowed — a failed migration must
    never crash the app; worst case the user ends up with a fresh ~/.phibe.
    """
    if default_dir.exists():
        return
    legacy_dir = next(
        (d for d in (default_dir.with_name(n) for n in _LEGACY_DIR_NAMES) if d.is_dir()),
        default_dir.with_name(_LEGACY_DIR_NAMES[0]),
    )
    try:
        if not legacy_dir.is_dir():
            return
        tmp_dir = default_dir.with_name(default_dir.name + ".migrating")
        try:
            if tmp_dir.exists():
                shutil.rmtree(tmp_dir, ignore_errors=True)
            shutil.copytree(legacy_dir, tmp_dir, symlinks=True)
            os.replace(tmp_dir, default_dir)
        finally:
            if tmp_dir.exists() and tmp_dir != default_dir:
                shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception:
        logger.warning(
            "Failed to migrate legacy %s to %s; continuing with a fresh directory.",
            legacy_dir, default_dir, exc_info=True,
        )


def get_config_dir() -> Path:
    """Resolve Phibe's single root directory, honoring env overrides.

    Precedence: ``$PHIBE_HOME`` > ``$XDG_DATA_HOME/phibe`` >
    ``~/.phibe``. The result is always absolute and is rejected if it
    falls inside the Phibe source tree.

    When resolving the plain default (no env override) and ``~/.phibe``
    doesn't exist yet, a legacy ``~/.nova`` directory (from before the
    Nova → Phibe rename) is copied over automatically so existing local
    settings/credentials/memory carry over transparently. See
    :func:`_migrate_legacy_home`.
    """
    env_home = os.environ.get("PHIBE_HOME") or os.environ.get("PHI_HOME")
    if env_home:
        resolved = Path(env_home).expanduser().resolve()
        return _reject_source_tree(resolved)

    xdg_data = os.environ.get("XDG_DATA_HOME")
    if xdg_data:
        resolved = (Path(xdg_data).expanduser() / _XDG_SUBDIR_NAME).resolve()
        return _reject_source_tree(resolved)

    default_dir = (Path.home() / _DEFAULT_DIR_NAME).resolve()
    _migrate_legacy_home(default_dir)
    return default_dir


def get_config_path() -> Path:
    """Resolve the path to ``config.toml`` under the Phibe root."""
    return get_config_dir() / "config.toml"


def get_data_dir() -> Path:
    """Resolve the directory for persistent data (databases, blobs, …).

    Consolidated under the single root; identical to :func:`get_config_dir`.
    Provided as a distinct name so call sites read intentionally.
    """
    return get_config_dir()


def get_cache_dir() -> Path:
    """Resolve the directory for regenerable caches (eval datasets, etc.).

    Lives at ``<root>/cache`` so caches stay inside the single Phibe
    directory instead of scattering across ``~/.cache``.
    """
    return get_config_dir() / "cache"


def get_project_skills_dir() -> Path | None:
    """Return the ``skills/`` folder of the Phibe source checkout, if present.

    Skills shipped with the project live here so they are versioned with the
    code. Returns ``None`` when Phibe runs from an installed wheel.
    """
    root = _find_source_root()
    if root is None:
        return None
    skills = root / "skills"
    return skills if skills.is_dir() else None
