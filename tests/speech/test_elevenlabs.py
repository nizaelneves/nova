"""ElevenLabs backend and Nova's voice router (ElevenLabs -> local Kokoro)."""

from __future__ import annotations

import io
import wave
from types import SimpleNamespace

import httpx
import pytest

from nova.core.registry import TTSRegistry
from nova.speech.elevenlabs_tts import ElevenLabsError, ElevenLabsTTSBackend
from nova.speech.tts import TTSResult
from nova.speech.tts_router import COOLDOWN_SECONDS, NoVoiceAvailable, TTSRouter

PCM = b"\x01\x00" * 2400  # 0.1 s of 24 kHz 16-bit mono


@pytest.fixture
def creds(tmp_path, monkeypatch):
    monkeypatch.setenv("NOVA_HOME", str(tmp_path))
    (tmp_path / "credentials.toml").write_text(
        '[elevenlabs]\nELEVENLABS_API_KEY = "secret-key"\n'
        'ELEVENLABS_VOICE_ID = "voice-123"\n',
        encoding="utf-8",
    )
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.delenv("ELEVENLABS_VOICE_ID", raising=False)


def _reply(monkeypatch, status=200, content=PCM):
    calls = []

    def fake_post(url, **kwargs):
        calls.append({"url": url, **kwargs})
        return httpx.Response(status, content=content)

    monkeypatch.setattr(httpx, "post", fake_post)
    return calls


def test_sends_the_right_request_and_returns_wav(creds, monkeypatch) -> None:
    calls = _reply(monkeypatch)
    result = ElevenLabsTTSBackend().synthesize("Olá, Senhor.")

    call = calls[0]
    assert call["url"].endswith("/text-to-speech/voice-123")
    assert call["headers"] == {"xi-api-key": "secret-key"}
    assert call["json"] == {"text": "Olá, Senhor.", "model_id": "eleven_flash_v2_5"}
    assert call["params"] == {"output_format": "pcm_24000"}
    with wave.open(io.BytesIO(result.audio)) as wav:
        assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (
            24000,
            1,
            2,
        )
        assert wav.readframes(10**6) == PCM
    assert result.sample_rate == 24000
    assert round(result.duration_seconds, 2) == 0.1


def test_speed_is_sent_only_when_changed_and_kept_in_range(creds, monkeypatch) -> None:
    calls = _reply(monkeypatch)
    ElevenLabsTTSBackend().synthesize("a", speed=1.5)
    ElevenLabsTTSBackend().synthesize("a")
    assert calls[0]["json"]["voice_settings"] == {"speed": 1.2}
    assert "voice_settings" not in calls[1]["json"]


def test_health_needs_key_and_voice_and_makes_no_request(
    tmp_path, monkeypatch, creds
) -> None:
    def boom(*args, **kwargs):
        raise AssertionError("no network in health()")

    monkeypatch.setattr(httpx, "post", boom)
    assert ElevenLabsTTSBackend().health() is True
    (tmp_path / "credentials.toml").write_text("", encoding="utf-8")
    assert ElevenLabsTTSBackend().health() is False


@pytest.mark.parametrize(
    "status,words",
    [(401, "API key"), (402, "paid plan"), (429, "credits"), (422, "voice")],
)
def test_errors_are_explained_without_leaking_the_key(
    creds, monkeypatch, status, words
) -> None:
    _reply(monkeypatch, status=status, content=b'{"detail": "secret-key"}')
    with pytest.raises(ElevenLabsError, match=words) as info:
        ElevenLabsTTSBackend().synthesize("a")
    assert "secret-key" not in str(info.value)


def test_network_failure_is_an_elevenlabs_error(creds, monkeypatch) -> None:
    def down(*args, **kwargs):
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(httpx, "post", down)
    with pytest.raises(ElevenLabsError, match="Could not reach"):
        ElevenLabsTTSBackend().synthesize("a")


def test_missing_credentials_message(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("NOVA_HOME", str(tmp_path))
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    with pytest.raises(ElevenLabsError, match="API_KEY"):
        ElevenLabsTTSBackend().synthesize("a")


def test_backend_is_registered() -> None:
    import importlib

    import nova.speech.elevenlabs_tts as module

    importlib.reload(module)
    assert TTSRegistry.contains("elevenlabs")


# -- router ------------------------------------------------------------------


class _Fake:
    def __init__(self, key, log, fail=False):
        self.key, self.log, self.fail = key, log, fail

    def synthesize(self, text, **kwargs):
        self.log.append((self.key, kwargs.get("voice_id"), kwargs.get("speed")))
        if self.fail:
            raise RuntimeError(f"{self.key} down")
        return TTSResult(audio=self.key.encode(), format="wav")

    def health(self):
        return True


@pytest.fixture
def world(monkeypatch):
    log, backends = [], {}
    monkeypatch.setattr(TTSRegistry, "contains", lambda key: key in backends)
    monkeypatch.setattr(TTSRegistry, "get", lambda key: lambda: backends[key])
    for key in ("elevenlabs", "kokoro"):
        backends[key] = _Fake(key, log)
    return SimpleNamespace(log=log, backends=backends, now=[0.0])


def _router(world, **speech):
    config = SimpleNamespace(speech=SimpleNamespace(**speech))
    return TTSRouter(config, clock=lambda: world.now[0])


def test_uses_elevenlabs_without_a_voice_argument(world) -> None:
    router = _router(world, tts_backend="elevenlabs", voice_id="pf_dora")
    assert router.synthesize("oi").audio == b"elevenlabs"
    # the Kokoro id in voice_id must never reach ElevenLabs
    assert world.log == [("elevenlabs", None, 1.0)]
    assert router.last_notice == ""


def test_falls_back_to_kokoro_pf_dora_and_says_so(world) -> None:
    world.backends["elevenlabs"].fail = True
    router = _router(world, tts_backend="elevenlabs")
    result = router.synthesize("oi")
    assert result.audio == b"kokoro"
    assert world.log == [("elevenlabs", None, 1.0), ("kokoro", "pf_dora", 1.0)]
    assert "elevenlabs unavailable" in router.last_notice
    assert router.last_backend == "kokoro"


def test_a_failed_backend_rests_for_a_few_minutes_then_is_retried(world) -> None:
    world.backends["elevenlabs"].fail = True
    router = _router(world, tts_backend="elevenlabs")
    router.synthesize("one")
    router.synthesize("two")
    assert [k for k, *_ in world.log].count("elevenlabs") == 1  # skipped 2nd time

    world.backends["elevenlabs"].fail = False
    world.now[0] = COOLDOWN_SECONDS + 1
    assert router.synthesize("three").audio == b"elevenlabs"
    assert router.last_notice == ""


def test_never_falls_back_to_another_cloud_voice(world) -> None:
    world.backends["openai_tts"] = _Fake("openai_tts", world.log)
    world.backends["elevenlabs"].fail = True
    router = _router(world, tts_backend="elevenlabs")
    assert router.order == ["elevenlabs", "kokoro"]
    world.backends["kokoro"].fail = True
    with pytest.raises(NoVoiceAvailable) as info:
        router.synthesize("oi")
    assert set(info.value.errors) == {"elevenlabs", "kokoro"}
    assert all(k != "openai_tts" for k, *_ in world.log)


def test_local_primary_has_no_cloud_step(world) -> None:
    router = _router(world, tts_backend="kokoro", voice_id="pf_dora")
    assert router.order == ["kokoro"]
    router.synthesize("oi")
    assert world.log == [("kokoro", "pf_dora", 1.0)]


def test_configured_fallback_voice_and_speed(world) -> None:
    world.backends["elevenlabs"].fail = True
    router = _router(
        world, tts_backend="elevenlabs", fallback_voice_id="pm_alex", voice_speed=1.1
    )
    router.synthesize("oi")
    assert world.log[-1] == ("kokoro", "pm_alex", 1.1)


def test_empty_text_is_rejected(world) -> None:
    with pytest.raises(ValueError):
        _router(world).synthesize("   ")


def test_status_does_not_synthesize(world) -> None:
    status = _router(world, tts_backend="elevenlabs").status()
    assert [c["backend"] for c in status["chain"]] == ["elevenlabs", "kokoro"]
    assert world.log == []


# -- endpoint ----------------------------------------------------------------


def test_synthesize_endpoint(world, tmp_path, monkeypatch) -> None:
    from fastapi.testclient import TestClient

    from nova.server.app import create_app

    monkeypatch.setenv("NOVA_HOME", str(tmp_path / "home"))
    engine = SimpleNamespace(engine_id="fake", health=lambda: True)
    client = TestClient(create_app(engine, "fake"))

    ok = client.post("/v1/speech/synthesize", json={"text": "Olá"})
    assert ok.status_code == 200
    assert ok.headers["content-type"] == "audio/wav"
    assert ok.headers["x-nova-voice"] == "elevenlabs"
    assert ok.content == b"elevenlabs"

    world.backends["elevenlabs"].fail = True
    client.app.state.tts_router._failed_at.clear()
    fell = client.post("/v1/speech/synthesize", json={"text": "Olá"})
    assert fell.headers["x-nova-voice"] == "kokoro"
    assert "elevenlabs unavailable" in fell.headers["x-nova-voice-notice"]

    assert client.post("/v1/speech/synthesize", json={"text": " "}).status_code == 422
    too_long = client.post("/v1/speech/synthesize", json={"text": "a" * 4001})
    assert too_long.status_code == 413
    assert client.get("/v1/speech/voice-status").json()["primary"] == "elevenlabs"
