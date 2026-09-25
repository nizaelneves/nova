"""Keyword routing: pick the skill whose triggers match what the user wrote.

Small local models are unreliable at choosing a skill from a catalog, so the
choice is made in code. Each skill lists ``triggers`` (words or short phrases,
any language) under ``metadata.nova.triggers`` in its ``SKILL.md`` frontmatter.
Matching ignores case and accents and only matches whole words.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from nova.core.events import EventBus
from nova.skills.manager import SkillManager
from nova.skills.types import SkillManifest

logger = logging.getLogger(__name__)

# How many of the most recent user messages are searched for a trigger, so a
# skill stays active across short follow-up answers in the same conversation.
_HISTORY_WINDOW = 4


def normalize(text: str) -> str:
    """Lowercase, strip accents and collapse punctuation into single spaces."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    without_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", without_accents).strip()


def _trigger_pattern(trigger: str) -> Optional[re.Pattern[str]]:
    norm = normalize(trigger)
    if not norm:
        return None
    return re.compile(rf"(?<![a-z0-9]){re.escape(norm)}(?![a-z0-9])")


def skill_triggers(manifest: SkillManifest) -> List[str]:
    """Return the trigger phrases declared by a skill (empty when none)."""
    nova_meta = (manifest.metadata or {}).get("nova") or {}
    triggers = nova_meta.get("triggers") or []
    return [str(t) for t in triggers if str(t).strip()]


class SkillRouter:
    """Selects skills by trigger match for a piece of user text."""

    def __init__(self, skills: Sequence[SkillManifest]) -> None:
        self._entries: List[Tuple[SkillManifest, List[re.Pattern[str]]]] = []
        for manifest in skills:
            if manifest.disable_model_invocation:
                continue
            patterns = [
                p for t in skill_triggers(manifest) if (p := _trigger_pattern(t))
            ]
            if patterns:
                self._entries.append((manifest, patterns))

    def __len__(self) -> int:
        return len(self._entries)

    def match(self, text: str) -> Optional[SkillManifest]:
        """Return the best matching skill for *text*, or ``None``."""
        norm = normalize(text)
        if not norm:
            return None
        best: Optional[SkillManifest] = None
        best_score = 0
        for manifest, patterns in self._entries:
            score = sum(1 for p in patterns if p.search(norm))
            if score > best_score:
                best, best_score = manifest, score
        return best

    def match_conversation(
        self, user_messages: Sequence[str]
    ) -> Optional[SkillManifest]:
        """Match against the newest user message first, then recent history."""
        for text in list(reversed(user_messages))[:_HISTORY_WINDOW]:
            found = self.match(text)
            if found is not None:
                return found
        return None


def skill_search_paths(config: Any) -> List[Path]:
    """Directories searched for skills, highest precedence first."""
    from nova.core.paths import get_project_skills_dir

    paths = [Path(config.skills.skills_dir).expanduser()]
    project_skills = get_project_skills_dir()
    if project_skills is not None:
        paths.insert(0, project_skills)
    workspace_skills = Path("./skills")
    if workspace_skills.exists():
        paths.insert(0, workspace_skills)
    return paths


_CACHE: Dict[Tuple[Tuple[str, ...], float], SkillRouter] = {}


def _latest_mtime(paths: Sequence[Path]) -> float:
    latest = 0.0
    for root in paths:
        if not root.exists():
            continue
        for md in root.rglob("SKILL.md"):
            try:
                latest = max(latest, md.stat().st_mtime)
            except OSError:
                continue
    return latest


def get_router(config: Any) -> SkillRouter:
    """Return a cached router for the configured skill folders.

    The cache is refreshed whenever a ``SKILL.md`` file changes on disk.
    """
    paths = skill_search_paths(config)
    key = (tuple(str(p) for p in paths), _latest_mtime(paths))
    router = _CACHE.get(key)
    if router is None:
        manager = SkillManager(EventBus())
        manager.discover(paths=paths)
        router = SkillRouter([manager.resolve(n) for n in manager.skill_names()])
        _CACHE.clear()
        _CACHE[key] = router
    return router


def render_active_skill(manifest: SkillManifest) -> str:
    """Prompt section that gives the model the chosen skill's instructions."""
    body = (manifest.markdown_content or "").strip()
    return (
        f"## Active Skill: {manifest.name}\n\n"
        "The user's request matches this skill. Follow its instructions.\n\n"
        f"{body}"
    )


def active_skill_prompt(user_texts: Sequence[str], config: Any = None) -> str:
    """Return the prompt section for the skill matching the conversation.

    ``user_texts`` are the user's messages, oldest first. Returns ``""`` when
    skills are disabled, nothing matches, or anything goes wrong: routing must
    never break a chat request.
    """
    try:
        if config is None:
            from nova.core.config import load_config

            config = load_config()
        if not config.skills.enabled:
            return ""
        manifest = get_router(config).match_conversation(list(user_texts))
        return render_active_skill(manifest) if manifest is not None else ""
    except Exception:
        logger.debug("Skill routing failed; continuing without a skill", exc_info=True)
        return ""


def _tools_disabled_for(manifest: SkillManifest, latest_user_text: str) -> bool:
    """True when the skill asks for a tool-free answer for this message.

    A skill declares ``metadata.nova.tools: none`` to run without tools.
    ``tools_allowed_when`` lists regular expressions (for example a file name
    ending in ``.csv``) that switch tools back on for that message.
    """
    nova_meta = (manifest.metadata or {}).get("nova") or {}
    if str(nova_meta.get("tools", "")).lower() != "none":
        return False
    for pattern in nova_meta.get("tools_allowed_when") or []:
        try:
            if re.search(str(pattern), latest_user_text, re.IGNORECASE):
                return False
        except re.error:
            logger.warning("Invalid tools_allowed_when pattern %r", pattern)
    return True


def skill_disables_tools(user_texts: Sequence[str], config: Any = None) -> bool:
    """Whether the skill matching this conversation wants answers without tools.

    Small local models call tools too eagerly (for example inventing a file to
    read when the data is already in the message), so a skill can turn tools
    off. Never raises.
    """
    try:
        if config is None:
            from nova.core.config import load_config

            config = load_config()
        if not config.skills.enabled or not user_texts:
            return False
        manifest = get_router(config).match_conversation(list(user_texts))
        if manifest is None:
            return False
        return _tools_disabled_for(manifest, user_texts[-1])
    except Exception:
        logger.debug("Skill tool policy failed; keeping tools", exc_info=True)
        return False


__all__ = [
    "SkillRouter",
    "active_skill_prompt",
    "get_router",
    "normalize",
    "render_active_skill",
    "skill_disables_tools",
    "skill_search_paths",
    "skill_triggers",
]
