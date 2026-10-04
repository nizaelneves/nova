"""External-framework subprocess backends (Hermes Agent, OpenClaw)."""

from phi.evals.backends.external.hermes_agent import HermesBackend
from phi.evals.backends.external.openclaw import OpenClawBackend

__all__ = ["HermesBackend", "OpenClawBackend"]
