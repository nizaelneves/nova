"""Tests for CLI error hint functions."""

from __future__ import annotations

from phibe.cli.hints import hint_no_engine


class TestHintFunctions:
    def test_hint_no_engine_returns_string(self):
        msg = hint_no_engine()
        assert isinstance(msg, str)
        assert len(msg) > 0
        assert "engine" in msg.lower() or "ollama" in msg.lower()

    def test_hint_no_engine_with_name(self):
        msg = hint_no_engine("vllm")
        assert "vllm" in msg.lower()

    def test_hint_no_engine_includes_remote_tip(self):
        msg = hint_no_engine()
        assert "config set" in msg
        assert "OLLAMA_HOST" in msg

    def test_hint_no_engine_with_name_includes_remote_tip(self):
        msg = hint_no_engine("vllm")
        assert "config set" in msg
        assert "engine.vllm.host" in msg
