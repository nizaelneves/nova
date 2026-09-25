"""External-framework subprocess backends (Hermes Agent, OpenClaw)."""

from nova.evals.backends.external.hermes_agent import HermesBackend
from nova.evals.backends.external.openclaw import OpenClawBackend

__all__ = ["HermesBackend", "OpenClawBackend"]
