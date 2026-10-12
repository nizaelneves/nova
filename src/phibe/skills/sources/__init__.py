"""Skill source resolvers — Hermes, OpenClaw, generic GitHub."""

from phibe.skills.sources.base import ResolvedSkill, SourceResolver
from phibe.skills.sources.github import GitHubResolver
from phibe.skills.sources.hermes import HERMES_REPO_URL, HermesResolver
from phibe.skills.sources.openclaw import OPENCLAW_REPO_URL, OpenClawResolver

__all__ = [
    "GitHubResolver",
    "HERMES_REPO_URL",
    "HermesResolver",
    "OPENCLAW_REPO_URL",
    "OpenClawResolver",
    "ResolvedSkill",
    "SourceResolver",
]
