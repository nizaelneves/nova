"""Tests for speech configuration."""

from phi.core.config import PhiConfig, SpeechConfig


def test_speech_config_defaults():
    cfg = SpeechConfig()
    assert cfg.backend == "auto"
    assert cfg.model == "base"
    assert cfg.language == ""
    assert cfg.device == "auto"
    assert cfg.compute_type == "float16"


def test_phi_config_has_speech():
    cfg = PhiConfig()
    assert hasattr(cfg, "speech")
    assert isinstance(cfg.speech, SpeechConfig)
    assert cfg.speech.backend == "auto"


def test_phi_system_has_speech_backend():
    """PhiSystem has a speech_backend attribute."""
    from phi.system import PhiSystem

    assert "speech_backend" in PhiSystem.__dataclass_fields__
