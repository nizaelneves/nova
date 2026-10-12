"""Startup banner — Phibe wordmark + tagline."""

from __future__ import annotations

# "Phibe" rendered in the figlet "standard" font. Stored as plain text
# (no inline Rich markup) so the backslashes in the glyphs don't collide with
# Rich's [tag] markup or Python raw-string escaping — colour is applied at
# print time via a style argument.
_WORDMARK = (
    r" ____  _     _ _          ",
    r"|  _ \| |__ (_) |__   ___ ",
    r"| |_) | '_ \| | '_ \ / _ \ ",
    r"|  __/| | | | | |_) |  __/",
    r"|_|   |_| |_|_|_.__/ \___|",
)

_TAGLINE = "Your personal AI copilot"


def print_banner(quiet: bool = False) -> None:
    """Print the Phibe startup banner. No-op when quiet."""
    if quiet:
        return
    try:
        from rich.console import Console

        console = Console()
        for line in _WORDMARK:
            console.print(line, style="bold bright_blue", highlight=False, markup=False)
        console.print(f"      {_TAGLINE}", style="cyan", highlight=False, markup=False)
        console.print()
    except ImportError:
        for line in _WORDMARK:
            print(line)
        print(f"      {_TAGLINE}")
        print()
