"""Nova's voice: ElevenLabs first, Kokoro (local) when it fails.

Text goes to a cloud provider only when the configured primary backend is a
cloud one. If it fails (no credits, no internet, bad key), the reply is spoken
by the local Kokoro voice instead, and the failed backend is left alone for a
few minutes so every sentence does not wait for a timeout. Nothing else falls
back automatically: the fallback is always the local voice.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Callable, Dict, List, Optional

from nova.core.registry import TTSRegistry
from nova.speech.tts import TTSResult

logger = logging.getLogger(__name__)

FALLBACK_BACKEND = "kokoro"
DEFAULT_FALLBACK_VOICE = "pf_dora"  # Kokoro, Brazilian Portuguese
COOLDOWN_SECONDS = 300.0
MAX_TEXT_CHARS = 4000


class NoVoiceAvailable(RuntimeError):
    """Every voice backend failed; ``errors`` says why, per backend."""

    def __init__(self, errors: Dict[str, str]) -> None:
        self.errors = errors
        detail = "; ".join(f"{k}: {v}" for k, v in errors.items()) or "none configured"
        super().__init__(f"No voice available ({detail})")


class TTSRouter:
    """Speak text with the configured voice, falling back to the local one."""

    def __init__(
        self,
        config: Any,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        speech = getattr(config, "speech", None)
        self._primary = getattr(speech, "tts_backend", "") or "elevenlabs"
        self._primary_voice = getattr(speech, "voice_id", "") or ""
        self._fallback_voice = (
            getattr(speech, "fallback_voice_id", "") or DEFAULT_FALLBACK_VOICE
        )
        self._speed = float(getattr(speech, "voice_speed", 1.0))
        self._clock = clock
        self._failed_at: Dict[str, float] = {}
        self._backends: Dict[str, Any] = {}
        self._lock = threading.Lock()
        self.last_backend: str = ""
        self.last_notice: str = ""

    @property
    def order(self) -> List[str]:
        return [self._primary] + (
            [FALLBACK_BACKEND] if self._primary != FALLBACK_BACKEND else []
        )

    def _voice_for(self, key: str) -> str:
        """Voice IDs are not portable between backends."""
        if key == self._primary:
            # ElevenLabs takes its voice from credentials.toml.
            return "" if key == "elevenlabs" else self._primary_voice
        return self._fallback_voice

    def _backend(self, key: str) -> Any:
        import nova.speech  # noqa: F401  (registers the built-in backends)

        if key not in self._backends:
            if not TTSRegistry.contains(key):
                raise RuntimeError("backend not installed")
            self._backends[key] = TTSRegistry.get(key)()
        return self._backends[key]

    def _cooling(self, key: str) -> bool:
        failed = self._failed_at.get(key)
        return failed is not None and self._clock() - failed < COOLDOWN_SECONDS

    def status(self) -> Dict[str, Any]:
        """What would speak right now, without making any request."""
        chain = []
        for key in self.order:
            try:
                backend = self._backend(key)
                # Kokoro's health check loads the whole model; just report it
                # as installed here.
                ready = True if key == FALLBACK_BACKEND else bool(backend.health())
            except Exception:
                ready = False
            chain.append(
                {"backend": key, "ready": ready, "cooling": self._cooling(key)}
            )
        return {"primary": self._primary, "chain": chain}

    def synthesize(self, text: str, *, speed: Optional[float] = None) -> TTSResult:
        """Return WAV audio for *text* from the first backend that works."""
        text = (text or "").strip()
        if not text:
            raise ValueError("No text to speak")
        errors: Dict[str, str] = {}
        with self._lock:
            keys = self.order
            usable = [k for k in keys if not self._cooling(k)] or keys[-1:]
            for key in usable:
                try:
                    kwargs: Dict[str, Any] = {
                        "output_format": "wav",
                        "speed": self._speed if speed is None else speed,
                    }
                    voice = self._voice_for(key)
                    if voice:
                        kwargs["voice_id"] = voice
                    result = self._backend(key).synthesize(text, **kwargs)
                except Exception as exc:
                    errors[key] = str(exc) or type(exc).__name__
                    self._failed_at[key] = self._clock()
                    logger.warning("Voice backend %s failed: %s", key, errors[key])
                    continue
                self._failed_at.pop(key, None)
                self.last_backend = key
                self.last_notice = ""
                if key != keys[0]:
                    why = errors.get(keys[0], "recent failure")
                    self.last_notice = f"{keys[0]} unavailable ({why}); using {key}"
                return result
        raise NoVoiceAvailable(errors)


__all__ = [
    "COOLDOWN_SECONDS",
    "DEFAULT_FALLBACK_VOICE",
    "MAX_TEXT_CHARS",
    "NoVoiceAvailable",
    "TTSRouter",
]
