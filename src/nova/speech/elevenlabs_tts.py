"""ElevenLabs text-to-speech backend (Flash v2.5, one multilingual voice).

The API key and voice ID are read from ``~/.nova/credentials.toml``::

    [elevenlabs]
    ELEVENLABS_API_KEY = "..."
    ELEVENLABS_VOICE_ID = "..."

The key is only ever sent in the ``xi-api-key`` header and never logged.
"""

from __future__ import annotations

import io
import wave
from typing import List

import httpx

from nova.core.credentials import get_tool_credential
from nova.core.registry import TTSRegistry
from nova.speech.tts import TTSBackend, TTSResult

_API_BASE = "https://api.elevenlabs.io/v1"
_MODEL = "eleven_flash_v2_5"
_SAMPLE_RATE = 24000
_MIN_SPEED, _MAX_SPEED = 0.7, 1.2  # range accepted by ElevenLabs


class ElevenLabsError(RuntimeError):
    """ElevenLabs refused the request or could not be reached."""


def _explain(response: httpx.Response) -> str:
    status = response.status_code
    if status == 401:
        return "ElevenLabs rejected the API key (401)"
    if status == 402:
        return (
            "ElevenLabs needs a paid plan for this voice: free plans cannot use "
            "library voices through the API (402)"
        )
    if status == 429:
        return "ElevenLabs credits or rate limit exhausted (429)"
    if status in (400, 404, 422):
        return f"ElevenLabs could not use this voice or text ({status})"
    return f"ElevenLabs error {status}"


def _wav(pcm: bytes) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(_SAMPLE_RATE)
        out.writeframes(pcm)
    return buffer.getvalue()


@TTSRegistry.register("elevenlabs")
class ElevenLabsTTSBackend(TTSBackend):
    """Cloud voice from ElevenLabs. Output is 16-bit mono WAV at 24 kHz."""

    backend_id = "elevenlabs"

    def __init__(
        self, *, api_key: str = "", voice_id: str = "", model: str = _MODEL
    ) -> None:
        self._api_key = api_key
        self._voice_id = voice_id
        self._model = model

    def _key(self) -> str:
        return (
            self._api_key
            or get_tool_credential("elevenlabs", "ELEVENLABS_API_KEY")
            or ""
        )

    def _voice(self, override: str = "") -> str:
        return (
            override
            or self._voice_id
            or get_tool_credential("elevenlabs", "ELEVENLABS_VOICE_ID")
            or ""
        )

    def synthesize(
        self,
        text: str,
        *,
        voice_id: str = "",
        speed: float = 1.0,
        output_format: str = "wav",
    ) -> TTSResult:
        key, voice = self._key(), self._voice(voice_id)
        if not key:
            raise ElevenLabsError("ELEVENLABS_API_KEY is not set")
        if not voice:
            raise ElevenLabsError("ELEVENLABS_VOICE_ID is not set")
        if output_format != "wav":
            raise ElevenLabsError("ElevenLabs backend only produces wav")

        body: dict = {"text": text, "model_id": self._model}
        if speed and speed != 1.0:
            speed = min(max(speed, _MIN_SPEED), _MAX_SPEED)
            body["voice_settings"] = {"speed": speed}
        try:
            response = httpx.post(
                f"{_API_BASE}/text-to-speech/{voice}",
                params={"output_format": f"pcm_{_SAMPLE_RATE}"},
                headers={"xi-api-key": key},
                json=body,
                timeout=30.0,
            )
        except httpx.HTTPError as exc:
            raise ElevenLabsError(f"Could not reach ElevenLabs: {type(exc).__name__}")
        if response.status_code != 200:
            raise ElevenLabsError(_explain(response))

        pcm = response.content
        return TTSResult(
            audio=_wav(pcm),
            format="wav",
            voice_id=voice,
            sample_rate=_SAMPLE_RATE,
            duration_seconds=len(pcm) / (2 * _SAMPLE_RATE),
            metadata={"backend": "elevenlabs", "model": self._model},
        )

    def available_voices(self) -> List[str]:
        voice = self._voice()
        return [voice] if voice else []

    def health(self) -> bool:
        """Configured (key and voice present). No network call is made."""
        return bool(self._key() and self._voice())
