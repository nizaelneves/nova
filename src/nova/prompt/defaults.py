"""Default persona files seeded into a fresh Nova home directory."""

from __future__ import annotations

from pathlib import Path

_DIR = Path(__file__).parent


def default_soul() -> str:
    """Return the default ``SOUL.md`` text (who Nova is and how she behaves)."""
    return (_DIR / "default_soul.md").read_text(encoding="utf-8")


def default_user() -> str:
    """Return the default ``USER.md`` text (who the user is)."""
    return (_DIR / "default_user.md").read_text(encoding="utf-8")


def default_memory() -> str:
    """Return the default (empty) ``MEMORY.md`` text."""
    return "# Agent Memory\n\n"
