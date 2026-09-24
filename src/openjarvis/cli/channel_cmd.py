"""``jarvis channel`` -- channel management commands."""

from __future__ import annotations

from typing import Any, Optional

import click
from rich.console import Console
from rich.table import Table

_CHANNEL_TYPE_HELP = "Channel type (telegram, whatsapp, whatsapp_baileys, gmail)."


def _get_channel(
    channel_type: str | None,
    config: Any,
) -> Any:
    """Resolve a channel backend by type.

    Resolution order: ``--channel-type`` flag >
    ``config.channel.default_channel`` > error.
    """
    import openjarvis.channels  # noqa: F401 -- trigger registration
    from openjarvis.core.registry import ChannelRegistry

    key = channel_type or config.channel.default_channel
    if not key:
        raise click.ClickException(
            "No channel type specified. Use --channel-type or set "
            "default_channel in [channel] config."
        )

    from openjarvis.system._channel_kwargs import build_channel_kwargs

    kwargs = build_channel_kwargs(config.channel, key)
    if not ChannelRegistry.contains(key):
        raise click.ClickException(f"Unknown channel type: {key}")

    return ChannelRegistry.create(key, **kwargs)


@click.group()
def channel() -> None:
    """Manage messaging channels."""


@channel.command("list")
@click.option(
    "--channel-type",
    default=None,
    help=_CHANNEL_TYPE_HELP,
)
def channel_list(
    channel_type: Optional[str],
) -> None:
    """List available channels."""
    console = Console()
    from openjarvis.core.config import load_config

    config = load_config()

    try:
        ch = _get_channel(channel_type, config)
    except click.ClickException as exc:
        console.print(f"[red]{exc.message}[/red]")
        return

    try:
        channels = ch.list_channels()
    except Exception as exc:
        console.print(f"[red]Failed to list channels: {exc}[/red]")
        return

    if not channels:
        console.print("[yellow]No channels available[/yellow]")
        return

    table = Table(title="Available Channels")
    table.add_column("Channel", style="cyan")
    for name in channels:
        table.add_row(name)
    console.print(table)


@channel.command("send")
@click.argument("target")
@click.argument("message")
@click.option(
    "--channel-type",
    default=None,
    help=_CHANNEL_TYPE_HELP,
)
def channel_send(
    target: str,
    message: str,
    channel_type: Optional[str],
) -> None:
    """Send a message to a channel."""
    console = Console()
    from openjarvis.core.config import load_config

    config = load_config()

    try:
        ch = _get_channel(channel_type, config)
    except click.ClickException as exc:
        console.print(f"[red]{exc.message}[/red]")
        return

    ok = ch.send(target, message)
    if ok:
        console.print(f"[green]Message sent to {target}[/green]")
    else:
        console.print(
            f"[red]Failed to send message to {target}[/red]",
        )


@channel.command("status")
@click.option(
    "--channel-type",
    default=None,
    help=_CHANNEL_TYPE_HELP,
)
def channel_status(
    channel_type: Optional[str],
) -> None:
    """Show channel connection status."""
    console = Console()
    from openjarvis.core.config import load_config

    config = load_config()

    try:
        ch = _get_channel(channel_type, config)
    except click.ClickException as exc:
        console.print(f"[red]{exc.message}[/red]")
        return

    st = ch.status()
    color = {
        "connected": "green",
        "disconnected": "yellow",
        "connecting": "blue",
        "error": "red",
    }.get(st.value, "white")

    key = channel_type or config.channel.default_channel or "unknown"
    console.print(f"Channel: [cyan]{key}[/cyan]")
    console.print(f"Status: [{color}]{st.value}[/{color}]")
