"""Keyword routing of skills, in code, for small local models."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from nova.core.types import Message, Role
from nova.skills.router import (
    SkillRouter,
    active_skill_prompt,
    get_router,
    normalize,
    render_active_skill,
)
from nova.skills.types import SkillManifest


def _skill(
    name: str, triggers: list[str], body: str = "Do the thing."
) -> SkillManifest:
    return SkillManifest(
        name=name,
        description=f"Use when {name}",
        markdown_content=body,
        metadata={"nova": {"triggers": triggers}},
    )


@pytest.fixture
def router() -> SkillRouter:
    return SkillRouter(
        [
            _skill("weekly-review", ["weekly review", "revisao semanal"]),
            _skill("growth", ["growth", "crescer", "cac"]),
            _skill("no-triggers", []),
        ]
    )


def test_normalize_ignores_case_accents_and_punctuation() -> None:
    assert normalize("Revisão SEMANAL!") == "revisao semanal"


def test_matches_portuguese_with_accents(router: SkillRouter) -> None:
    assert router.match("Vamos fazer a minha revisão semanal").name == "weekly-review"


def test_matches_english(router: SkillRouter) -> None:
    assert router.match("Let's do my weekly review").name == "weekly-review"


def test_matches_whole_words_only(router: SkillRouter) -> None:
    assert router.match("preciso de cacau e cache") is None
    assert router.match("qual o meu CAC?").name == "growth"


def test_no_match_returns_none(router: SkillRouter) -> None:
    assert router.match("Qual a capital da França?") is None


def test_skills_without_triggers_are_ignored(router: SkillRouter) -> None:
    assert len(router) == 2


def test_more_matching_triggers_wins() -> None:
    router = SkillRouter(
        [
            _skill("a", ["grow"]),
            _skill("b", ["grow", "funnel", "signups"]),
        ]
    )
    assert router.match("grow my funnel and signups").name == "b"


def test_skill_stays_active_across_follow_up_messages(router: SkillRouter) -> None:
    history = ["Quero crescer meu app", "É um app de finanças", "O público é jovem"]
    assert router.match_conversation(history).name == "growth"


def test_newest_message_takes_priority_over_older_ones(router: SkillRouter) -> None:
    history = ["Quero crescer meu app", "Agora vamos à revisão semanal"]
    assert router.match_conversation(history).name == "weekly-review"


def test_old_messages_outside_the_window_are_ignored(router: SkillRouter) -> None:
    history = ["Quero crescer"] + ["oi"] * 4
    assert router.match_conversation(history) is None


def test_render_includes_name_and_instructions() -> None:
    text = render_active_skill(_skill("growth", ["x"], body="Step 1: ask."))
    assert "Active Skill: growth" in text
    assert "Step 1: ask." in text


def test_project_skills_route_for_real_sentences() -> None:
    from nova.core.config import load_config

    router = get_router(load_config())
    assert router.match("Vamos fazer minha revisão semanal").name == "weekly-review"
    assert (
        router.match("Quero crescer meus cadastros em 30%").name
        == "growth-marketing-strategy"
    )
    assert (
        router.match("Analise esta planilha de campanhas em CSV").name
        == "marketing-data-analysis"
    )


def test_active_skill_prompt_respects_disabled_skills() -> None:
    from nova.core.config import load_config

    config = load_config()
    disabled = SimpleNamespace(skills=SimpleNamespace(enabled=False))
    assert active_skill_prompt(["revisão semanal"], disabled) == ""
    assert "Active Skill: weekly-review" in active_skill_prompt(
        ["revisão semanal"], config
    )


def test_server_prompt_includes_the_matching_skill() -> None:
    from nova.core.config import load_config
    from nova.server.routes import _ensure_identity_prompt

    messages = [Message(role=Role.USER, content="Vamos fazer minha revisão semanal.")]
    result = _ensure_identity_prompt(messages, load_config())

    assert result[0].role == Role.SYSTEM
    assert "Active Skill: weekly-review" in result[0].content
    assert "You are Nova" in result[0].content


def test_server_prompt_has_no_skill_when_nothing_matches() -> None:
    from nova.core.config import load_config
    from nova.server.routes import _ensure_identity_prompt

    messages = [Message(role=Role.USER, content="Qual a capital da França?")]
    result = _ensure_identity_prompt(messages, load_config())

    assert "Active Skill" not in result[0].content


def _no_tools_skill() -> SkillManifest:
    return SkillManifest(
        name="data",
        description="Use when data",
        markdown_content="Analyze.",
        metadata={
            "nova": {
                "triggers": ["csv"],
                "tools": "none",
                "tools_allowed_when": [r"\.(csv|xlsx)\b", r"[a-z]:[\\/]"],
            }
        },
    )


def test_tool_free_skill_disables_tools_for_pasted_data() -> None:
    from nova.skills.router import _tools_disabled_for

    assert _tools_disabled_for(_no_tools_skill(), "analise este CSV:\na,b\n1,2")


def test_tool_free_skill_keeps_tools_when_a_file_is_named() -> None:
    from nova.skills.router import _tools_disabled_for

    skill = _no_tools_skill()
    assert not _tools_disabled_for(skill, "analise o arquivo campanhas.csv")
    assert not _tools_disabled_for(skill, r"analise C:\dados\vendas")


def test_skill_without_a_tool_policy_never_disables_tools() -> None:
    from nova.skills.router import _tools_disabled_for

    assert not _tools_disabled_for(_skill("growth", ["growth"]), "growth")


def test_real_data_skill_turns_tools_off_only_for_pasted_data() -> None:
    from nova.core.config import load_config
    from nova.skills.router import skill_disables_tools

    config = load_config()
    assert skill_disables_tools(["Analise esta planilha em CSV:\na,b\n1,2"], config)
    assert not skill_disables_tools(["Analise a planilha vendas.xlsx"], config)
    assert not skill_disables_tools(["Vamos fazer minha revisão semanal"], config)
