"""External-framework subprocess backends (Hermes Agent, OpenClaw)."""

from phibe.evals.backends.external.hermes_agent import HermesBackend
from phibe.evals.backends.external.openclaw import OpenClawBackend

__all__ = ["HermesBackend", "OpenClawBackend"]
