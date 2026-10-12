import io
import math
import struct
import time
import wave

from phibe.server.voice_history import VoiceHistory, encode_opus

DAY = 86400


def tone(seconds: float = 2.0, rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        n = int(seconds * rate)
        w.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(i / 20))) for i in range(n)))
    return buf.getvalue()


def test_audio_is_compressed_well_below_wav(tmp_path):
    wav = tone(4.0)
    audio = encode_opus(wav)
    assert audio is not None and len(audio) < len(wav) / 5


def test_add_lists_and_plays_back(tmp_path):
    h = VoiceHistory(tmp_path)
    item = h.add("hello there", tone())
    assert item["has_audio"] and h.audio_file(item["id"]).is_file()
    assert [i["text"] for i in h.listing()["items"]] == ["hello there"]


def test_retention_removes_old_entries_and_their_audio(tmp_path):
    h = VoiceHistory(tmp_path)  # 30 days by default
    old = h.add("old", tone(), now=time.time() - 40 * DAY)
    assert h.audio_file(old["id"]) is None  # already past the retention when it was added
    fresh = h.add("recent", tone(), now=time.time() - 10 * DAY)
    assert [i["text"] for i in h.listing()["items"]] == ["recent"]
    assert h.audio_file(fresh["id"]) is not None


def test_never_keeps_everything(tmp_path):
    h = VoiceHistory(tmp_path)
    h.set_retention(0)
    h.add("ancient", tone(), now=time.time() - 900 * DAY)
    assert len(h.listing()["items"]) == 1


def test_delete_one_and_delete_all_remove_text_and_audio(tmp_path):
    h = VoiceHistory(tmp_path)
    a = h.add("one", tone())
    b = h.add("two", tone())
    assert h.delete(a["id"]) and h.audio_file(a["id"]) is None
    assert not h.delete("nope")
    assert h.delete_all() == 1
    assert h.listing()["items"] == [] and h.audio_file(b["id"]) is None


def test_bad_retention_is_refused(tmp_path):
    h = VoiceHistory(tmp_path)
    try:
        h.set_retention(7)
    except ValueError:
        return
    raise AssertionError("7 days is not an allowed retention")
