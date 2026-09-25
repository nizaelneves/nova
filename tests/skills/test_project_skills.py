"""The skills shipped in the project's ``skills/`` folder load and are discoverable."""

from __future__ import annotations

import pytest

from nova.core.events import EventBus
from nova.core.paths import get_project_skills_dir
from nova.skills.manager import SkillManager

EXPECTED = {"marketing-data-analysis", "growth-marketing-strategy", "weekly-review"}


def test_project_skills_dir_is_found() -> None:
    skills_dir = get_project_skills_dir()
    assert skills_dir is not None
    assert skills_dir.name == "skills"


@pytest.fixture
def manager() -> SkillManager:
    skills_dir = get_project_skills_dir()
    assert skills_dir is not None
    mgr = SkillManager(EventBus())
    mgr.discover(paths=[skills_dir])
    return mgr


def test_expected_project_skills_are_discovered(manager: SkillManager) -> None:
    assert EXPECTED <= set(manager.skill_names())


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_each_skill_has_a_useful_description_and_instructions(
    manager: SkillManager, name: str
) -> None:
    skill = manager.resolve(name)
    assert "Use when" in skill.description
    assert len(skill.markdown_content) > 300


def test_skills_are_listed_in_the_model_catalog(manager: SkillManager) -> None:
    catalog = manager.get_catalog_xml()
    for name in EXPECTED:
        assert name in catalog
