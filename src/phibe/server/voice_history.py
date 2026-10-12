"""History of what was said with the global voice shortcut.

Each entry is the transcript plus the recording, kept compressed (Opus, about 0.2 MB a
minute) in ``<config dir>/voice/``. A retention setting (15 / 30 / 90 days, or never) removes
old entries; "delete all" removes every recording and transcript.
"""

from __future__ import annotations

import io
import json
import threading
import time
import uuid
import wave
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from phibe.core.config import get_config_dir

DEFAULT_RETENTION_DAYS = 30
ALLOWED_RETENTION = (0, 15, 30, 90)  # 0 means "never delete"
_OPUS_FRAME = 320  # 20 ms at 16 kHz


def encode_opus(wav: bytes) -> Optional[bytes]:
    """Compress a 16-bit mono WAV to Ogg/Opus; None when it cannot be done."""
    try:
        import av
        import numpy as np

        with wave.open(io.BytesIO(wav)) as reader:
            rate, channels = reader.getframerate(), reader.getnchannels()
            if channels != 1 or reader.getsampwidth() != 2:
                return None
            samples = np.frombuffer(reader.readframes(reader.getnframes()), dtype=np.int16)
        out = io.BytesIO()
        with av.open(out, "w", format="ogg") as container:
            stream = container.add_stream("libopus", rate=rate)
            stream.layout = "mono"
            stream.bit_rate = 24000
            for start in range(0, len(samples), _OPUS_FRAME):
                chunk = samples[start : start + _OPUS_FRAME]
                if len(chunk) < _OPUS_FRAME:
                    chunk = np.pad(chunk, (0, _OPUS_FRAME - len(chunk)))
                frame = av.AudioFrame.from_ndarray(chunk.reshape(1, -1), format="s16", layout="mono")
                frame.sample_rate = rate
                frame.pts = start
                for packet in stream.encode(frame):
                    container.mux(packet)
            for packet in stream.encode(None):
                container.mux(packet)
        return out.getvalue()
    except Exception:  # noqa: BLE001 - history is a bonus, never a reason to fail a message
        return None


class VoiceHistory:
    """Index (``index.json``) and audio files in one folder."""

    def __init__(self, folder: Optional[Path] = None) -> None:
        self._dir = Path(folder) if folder else get_config_dir() / "voice"
        self._lock = threading.Lock()

    # -- storage ---------------------------------------------------------

    def _index_path(self) -> Path:
        return self._dir / "index.json"

    def _read(self) -> Dict[str, Any]:
        try:
            data = json.loads(self._index_path().read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        data.setdefault("retention_days", DEFAULT_RETENTION_DAYS)
        data.setdefault("items", [])
        return data

    def _write(self, data: Dict[str, Any]) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        self._index_path().write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    def _audio_path(self, item_id: str) -> Path:
        return self._dir / f"{item_id}.ogg"

    # -- operations ------------------------------------------------------

    def add(self, text: str, wav: bytes, now: Optional[float] = None) -> Dict[str, Any]:
        """Keeps a transcript and its recording; the audio is dropped if it cannot be compressed."""
        item_id = uuid.uuid4().hex[:12]
        audio = encode_opus(wav)
        seconds = 0.0
        try:
            with wave.open(io.BytesIO(wav)) as reader:
                seconds = reader.getnframes() / float(reader.getframerate())
        except Exception:  # noqa: BLE001
            pass
        item = {
            "id": item_id,
            "created_at": now if now is not None else time.time(),
            "text": text,
            "seconds": round(seconds, 1),
            "has_audio": audio is not None,
        }
        with self._lock:
            data = self._read()
            if audio is not None:
                self._dir.mkdir(parents=True, exist_ok=True)
                self._audio_path(item_id).write_bytes(audio)
            data["items"].append(item)
            self._write(data)
        self.purge()
        return item

    def purge(self, now: Optional[float] = None) -> int:
        """Removes entries older than the retention; returns how many went."""
        with self._lock:
            data = self._read()
            days = data["retention_days"]
            if not days:
                return 0
            cutoff = (now if now is not None else time.time()) - days * 86400
            old = [i for i in data["items"] if i["created_at"] < cutoff]
            if not old:
                return 0
            for item in old:
                self._audio_path(item["id"]).unlink(missing_ok=True)
            data["items"] = [i for i in data["items"] if i["created_at"] >= cutoff]
            self._write(data)
            return len(old)

    def listing(self) -> Dict[str, Any]:
        self.purge()
        with self._lock:
            data = self._read()
        return {"retention_days": data["retention_days"], "items": sorted(data["items"], key=lambda i: -i["created_at"])}

    def delete(self, item_id: str) -> bool:
        with self._lock:
            data = self._read()
            kept = [i for i in data["items"] if i["id"] != item_id]
            if len(kept) == len(data["items"]):
                return False
            self._audio_path(item_id).unlink(missing_ok=True)
            data["items"] = kept
            self._write(data)
            return True

    def delete_all(self) -> int:
        with self._lock:
            data = self._read()
            for item in data["items"]:
                self._audio_path(item["id"]).unlink(missing_ok=True)
            count = len(data["items"])
            data["items"] = []
            self._write(data)
            return count

    def set_retention(self, days: int) -> None:
        if days not in ALLOWED_RETENTION:
            raise ValueError(f"retention must be one of {ALLOWED_RETENTION}")
        with self._lock:
            data = self._read()
            data["retention_days"] = days
            self._write(data)
        self.purge()

    def audio_file(self, item_id: str) -> Optional[Path]:
        path = self._audio_path(item_id)
        return path if path.is_file() else None


_shared: Optional[VoiceHistory] = None


def shared_history() -> VoiceHistory:
    global _shared
    if _shared is None:
        _shared = VoiceHistory()
    return _shared


class RetentionBody(BaseModel):
    days: int


def create_voice_router() -> APIRouter:
    router = APIRouter(prefix="/v1/voice", tags=["voice"])

    @router.get("/history")
    async def history() -> Dict[str, Any]:
        return shared_history().listing()

    @router.get("/history/{item_id}/audio")
    async def audio(item_id: str):
        path = shared_history().audio_file(item_id)
        if path is None:
            raise HTTPException(status_code=404, detail="No recording for this entry")
        return FileResponse(path, media_type="audio/ogg")

    @router.delete("/history/{item_id}")
    async def delete_one(item_id: str) -> Dict[str, bool]:
        if not shared_history().delete(item_id):
            raise HTTPException(status_code=404, detail="Entry not found")
        return {"deleted": True}

    @router.delete("/history")
    async def delete_everything() -> Dict[str, int]:
        return {"deleted": shared_history().delete_all()}

    @router.put("/retention")
    async def retention(body: RetentionBody) -> Dict[str, int]:
        try:
            shared_history().set_retention(body.days)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {"retention_days": body.days}

    return router


def save_if_asked(form_save: Any, text: str, wav: bytes) -> None:
    """Called by the transcribe route: keeps the entry when the caller asked for it."""
    if str(form_save or "") != "1" or not text.strip():
        return
    try:
        shared_history().add(text.strip(), wav)
    except Exception:  # noqa: BLE001
        pass
