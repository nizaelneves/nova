"""Command-line interface for Nova (Click-based)."""

from __future__ import annotations

import sys

import click

import nova
from nova.cli.scan_cmd import scan


def _invoked_command(argv: list[str]) -> str:
    """Return the first positional CLI token after global flags."""
    for arg in argv:
        if arg.startswith("-"):
            continue
        return arg
    return ""


# A data-boundary scan must be able to diagnose an invalid NOVA_HOME.
# Importing the rest of the CLI eagerly would import core.config and resolve that
# path before the scan can turn the failure into a finding.
_DATA_BOUNDARY_BOOTSTRAP = (
    _invoked_command(sys.argv[1:]) == "scan" and "--data-boundaries" in sys.argv[1:]
)


@click.group(
    help="Nova — modular AI assistant backend",
    invoke_without_command=True,
)
@click.version_option(version=nova.__version__, prog_name="nova")
@click.option("--verbose", is_flag=True, default=False, help="Enable debug logging")
@click.option("--quiet", is_flag=True, default=False, help="Suppress non-error output")
@click.option(
    "--pick-model",
    "pick_model_bare",
    is_flag=True,
    default=False,
    help=(
        "Bare ``nova``: force interactive model list (overrides NOVA_SKIP_MODEL_PICK)."
    ),
)
@click.pass_context
def cli(ctx: click.Context, verbose: bool, quiet: bool, pick_model_bare: bool) -> None:
    """Top-level CLI group."""
    from nova.cli.log_config import setup_logging

    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose
    ctx.obj["quiet"] = quiet
    ctx.obj["pick_model_bare"] = pick_model_bare
    setup_logging(verbose=verbose, quiet=quiet)

    # First-run guard — routes bare `nova` to chat or init.
    if ctx.invoked_subcommand is None:
        from nova.cli._first_run import check_and_route

        check_and_route(ctx)


cli.add_command(scan, "scan")
if not _DATA_BOUNDARY_BOOTSTRAP:
    from nova.cli._bootstrap import bootstrap_cmd
    from nova.cli.add_cmd import add
    from nova.cli.agent_cmd import agent
    from nova.cli.ask import ask
    from nova.cli.bench_cmd import bench
    from nova.cli.channel_cmd import channel
    from nova.cli.chat_cmd import chat
    from nova.cli.compose_cmd import compose
    from nova.cli.config_cmd import config
    from nova.cli.connect_cmd import connect
    from nova.cli.daemon_cmd import restart, start, status, stop
    from nova.cli.digest_cmd import digest
    from nova.cli.doctor_cmd import doctor
    from nova.cli.eval_cmd import eval_group
    from nova.cli.feedback_cmd import feedback_group
    from nova.cli.gateway_cmd import gateway
    from nova.cli.host_cmd import host
    from nova.cli.init_cmd import init
    from nova.cli.memory_cmd import memory
    from nova.cli.model import model
    from nova.cli.operators_cmd import operators
    from nova.cli.optimize_cmd import optimize_group
    from nova.cli.quickstart_cmd import quickstart
    from nova.cli.registry_cmd import registry
    from nova.cli.scheduler_cmd import scheduler
    from nova.cli.serve import serve
    from nova.cli.skill_cmd import skill
    from nova.cli.telemetry_cmd import telemetry
    from nova.cli.tool_cmd import tool
    from nova.cli.vault_cmd import vault
    from nova.cli.workflow_cmd import workflow

    cli.add_command(init, "init")
    cli.add_command(ask, "ask")
    cli.add_command(chat, "chat")
    cli.add_command(serve, "serve")
    cli.add_command(model, "model")
    cli.add_command(memory, "memory")
    cli.add_command(telemetry, "telemetry")
    cli.add_command(bench, "bench")
    cli.add_command(channel, "channel")
    cli.add_command(scheduler, "scheduler")
    cli.add_command(doctor, "doctor")
    cli.add_command(agent, "agents")
    cli.add_command(workflow, "workflow")
    cli.add_command(skill, "skill")
    cli.add_command(start, "start")
    cli.add_command(stop, "stop")
    cli.add_command(restart, "restart")
    cli.add_command(status, "status")
    cli.add_command(vault, "vault")
    cli.add_command(add, "add")
    cli.add_command(operators, "operators")
    cli.add_command(eval_group, "eval")
    cli.add_command(host, "host")
    cli.add_command(quickstart, "quickstart")
    cli.add_command(optimize_group, "optimize")
    cli.add_command(feedback_group, "feedback")
    cli.add_command(compose, "compose")
    cli.add_command(gateway, "gateway")
    cli.add_command(tool, "tool")
    cli.add_command(registry, "registry")
    cli.add_command(config, "config")
    cli.add_command(connect, "connect")
    cli.add_command(digest, "digest")

    # Deep Research setup pulls the ingestion pipeline (embeddings/numpy). Guard
    # it so an import-time dependency failure cannot take down the whole CLI.
    try:
        from nova.cli.deep_research_setup_cmd import deep_research_setup

        cli.add_command(deep_research_setup, "deep-research-setup")
        cli.add_command(deep_research_setup, "research")
    except Exception as _dr_exc:
        import logging as _logging

        _logging.getLogger(__name__).debug(
            "deep-research command unavailable: %s", _dr_exc
        )
    cli.add_command(bootstrap_cmd, "_bootstrap")

    # Gateway CLI commands (lazy import to avoid pulling starlette)
    try:
        from nova.cli.auth_cmd import auth

        cli.add_command(auth, "auth")
    except ImportError:
        pass

    try:
        from nova.cli.tunnel_cmd import tunnel

        cli.add_command(tunnel, "tunnel")
    except ImportError:
        pass


def main() -> None:
    """Entry point registered as ``nova`` console script."""
    import sys

    if sys.platform == "win32":
        for _stream in (sys.stdout, sys.stderr):
            if hasattr(_stream, "reconfigure"):
                try:
                    _stream.reconfigure(encoding="utf-8", errors="replace")
                except (AttributeError, OSError):
                    pass
    cli()


__all__ = ["cli", "main"]
