from __future__ import annotations

from openjarvis.agents.loop_guard import LoopGuard, LoopGuardConfig

_ARGS = '{"q": "test"}'


def _guard(warn_before_block: bool) -> LoopGuard:
    return LoopGuard(
        LoopGuardConfig(
            enabled=True,
            max_identical_calls=2,
            warn_before_block=warn_before_block,
        )
    )


def test_warn_before_block_first_cycle_warns():
    guard = _guard(warn_before_block=True)
    guard.check_call("search", _ARGS)
    guard.check_call("search", _ARGS)
    v = guard.check_call("search", _ARGS)  # exceeds max_identical_calls
    assert not v.blocked
    assert v.warned


def test_warn_before_block_second_cycle_blocks():
    guard = _guard(warn_before_block=True)
    for _ in range(2):
        guard.check_call("search", _ARGS)
    v_warn = guard.check_call("search", _ARGS)
    assert v_warn.warned and not v_warn.blocked
    v_block = guard.check_call("search", _ARGS)
    assert v_block.blocked
    assert not v_block.warned


def test_default_behavior_unchanged():
    guard = _guard(warn_before_block=False)
    for _ in range(2):
        guard.check_call("search", _ARGS)
    v = guard.check_call("search", _ARGS)
    assert v.blocked
    assert not v.warned
