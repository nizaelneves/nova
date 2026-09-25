"""Skill source resolvers — Hermes, OpenClaw, generic GitHub."""

from nova.skills.sources.base import ResolvedSkill, SourceResolver
from nova.skills.sources.github import GitHubResolver
from nova.skills.sources.hermes import HERMES_REPO_URL, HermesResolver
from nova.skills.sources.openclaw import OPENCLAW_REPO_URL, OpenClawResolver

__all__ = [
    "GitHubResolver",
    "HERMES_REPO_URL",
    "HermesResolver",
    "OPENCLAW_REPO_URL",
    "OpenClawResolver",
    "ResolvedSkill",
    "SourceResolver",
]
