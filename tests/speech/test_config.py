"""Tests for speech configuration."""

from phibe.core.config import PhibeConfig, SpeechConfig


def test_speech_config_defaults():
    cfg = SpeechConfig()
    assert cfg.backend == "auto"
    assert cfg.model == "base"
    assert cfg.language == ""
    assert cfg.device == "auto"
    assert cfg.compute_type == "float16"


def test_phibe_config_has_speech():
    cfg = PhibeConfig()
    assert hasattr(cfg, "speech")
    assert isinstance(cfg.speech, SpeechConfig)
    assert cfg.speech.backend == "auto"


def test_phibe_system_has_speech_backend():
    """PhibeSystem has a speech_backend attribute."""
    from phibe.system import PhibeSystem

    assert "speech_backend" in PhibeSystem.__dataclass_fields__
