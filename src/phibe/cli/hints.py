"""Rich-formatted error hints for common CLI failure modes."""

from __future__ import annotations

from typing import Optional


def hint_no_engine(engine_name: Optional[str] = None) -> str:
    """Return a suggestion when the inference engine is unreachable."""
    name = engine_name or "ollama"
    return (
        f"[yellow]Hint:[/yellow] Engine '{name}' is not reachable.\n"
        f"  Make sure the {name} server is running.\n"
        "  Run [bold]phibe doctor[/bold] to check all engines.\n"
        "  Run [bold]phibe quickstart[/bold] for guided setup.\n"
        "\n"
        "  [dim]To use a remote engine:[/dim]\n"
        f"    [cyan]phibe config set engine.{name}.host http://<remote-ip>:<port>[/cyan]\n"
        f"    [dim]or[/dim] [cyan]export OLLAMA_HOST=http://<remote-ip>:11434[/cyan]"
    )
