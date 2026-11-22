"""HTTP API for the Swipe File: ``/v1/swipe/*``. The folder on disk is the source of truth."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.server.swipe_routes import create_swipe_router


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path))
    app = FastAPI()
    app.include_router(create_swipe_router())
    return TestClient(app), tmp_path / "swipe-file" / "videos"


def _upload(c, folder, name, data=b"x" * 100):
    return c.post("/v1/swipe/videos", params={"folder": folder}, files={"file": (name, data, "video/mp4")})


def test_a_video_dropped_in_a_folder_by_hand_shows_up(client) -> None:
    c, base = client
    (base / "Ads").mkdir(parents=True)
    (base / "Ads" / "cold plunge.mp4").write_bytes(b"v")
    (base / "Ads" / "notes.txt").write_text("not a video")
    (base / "loose.webm").write_bytes(b"v")
    body = c.get("/v1/swipe/videos").json()
    assert {f["name"]: f["count"] for f in body["folders"]} == {"Unsorted": 1, "Ads": 1}
    assert sorted(v["title"] for v in body["items"]) == ["cold plunge", "loose"]


def test_upload_creates_the_folder_keeps_the_original_and_never_overwrites(client) -> None:
    c, base = client
    assert _upload(c, "UGC", "hook.mp4", b"first").json() == {"folder": "UGC", "name": "hook.mp4", "size": 5}
    assert _upload(c, "UGC", "hook.mp4", b"second").json()["name"] == "hook (2).mp4"
    assert (base / "UGC" / "hook.mp4").read_bytes() == b"first"
    assert not list((base / "UGC").glob("*.part"))


def test_only_videos_and_safe_folder_names_are_accepted(client) -> None:
    c, base = client
    assert _upload(c, "UGC", "script.exe").status_code == 415
    assert _upload(c, "   ", "a.mp4").status_code == 400
    assert _upload(c, "../../escape", "a.mp4").status_code == 200  # slashes are stripped, it stays inside
    assert not (base.parent.parent / "escape").exists() and any(p.is_dir() for p in base.iterdir())


def test_the_player_can_seek_and_paths_cannot_escape(client) -> None:
    c, base = client
    _upload(c, "Ads", "a.mp4", bytes(range(100)))
    whole = c.get("/v1/swipe/videos/file", params={"folder": "Ads", "name": "a.mp4"})
    assert whole.status_code == 200 and whole.headers["content-type"] == "video/mp4"
    part = c.get("/v1/swipe/videos/file", params={"folder": "Ads", "name": "a.mp4"}, headers={"Range": "bytes=10-19"})
    assert part.status_code == 206 and part.content == bytes(range(10, 20))
    (base.parent / "secret.mp4").write_bytes(b"s")
    assert c.get("/v1/swipe/videos/file", params={"folder": "Ads", "name": "../secret.mp4"}).status_code == 404
    assert c.get("/v1/swipe/videos/file", params={"folder": "Ads", "name": "missing.mp4"}).status_code == 404


def test_create_folder(client) -> None:
    c, base = client
    assert c.post("/v1/swipe/folders", json={"name": "Hooks"}).json() == {"name": "Hooks"}
    assert (base / "Hooks").is_dir()
    assert c.post("/v1/swipe/folders", json={"name": "Unsorted"}).status_code == 400


def test_emails_take_pdfs_only_and_copy_is_saved_as_text(client) -> None:
    c, _ = client
    ok = c.post("/v1/swipe/emails", params={"folder": "Welcome"}, files={"file": ("seq.pdf", b"%PDF-1", "application/pdf")})
    assert ok.status_code == 200
    assert c.post("/v1/swipe/emails", params={"folder": "Welcome"}, files={"file": ("a.mp4", b"x", "video/mp4")}).status_code == 415
    written = c.post("/v1/swipe/emails/save", json={"folder": "Welcome", "title": "Day 1", "content": "Subject: Hi"}).json()
    assert written["name"] == "Day 1.md"
    assert c.get("/v1/swipe/emails/file", params={"folder": "Welcome", "name": "seq.pdf"}).headers["content-type"] == "application/pdf"

    saved = c.post("/v1/swipe/prompts/save", json={"folder": "Hooks", "title": "Cold open", "content": "Stop scrolling."}).json()
    assert saved == {"folder": "Hooks", "name": "Cold open.md"}
    c.post("/v1/swipe/prompts/save", json={"folder": "Hooks", "title": "Cold open", "content": "Edited", "name": saved["name"]})
    item = c.get("/v1/swipe/prompts").json()["items"][0]
    assert item["preview"] == "Edited" and item["name"] == "Cold open.md"
    assert c.get("/v1/swipe/prompts/file", params={"folder": "Hooks", "name": "Cold open.md"}).text == "Edited"


def test_prompts_are_written_like_copy_and_videos_cannot_be(client) -> None:
    c, _ = client
    saved = c.post("/v1/swipe/prompts/save", json={"folder": "Ads", "title": "Hook Writer", "content": "Write 10 hooks for {product}."}).json()
    assert saved == {"folder": "Ads", "name": "Hook Writer.md"}
    assert c.get("/v1/swipe/prompts").json()["items"][0]["preview"].startswith("Write 10 hooks")
    assert c.post("/v1/swipe/videos/save", json={"folder": "Ads", "title": "x", "content": "y"}).status_code == 404


def test_audios_take_audio_files_and_play_with_seeking(client) -> None:
    c, _ = client
    ok = c.post("/v1/swipe/audios", params={"folder": "Spots"}, files={"file": ("radio.mp3", b"ID3" + b"x" * 100, "audio/mpeg")})
    assert ok.status_code == 200
    assert c.post("/v1/swipe/audios", params={"folder": "Spots"}, files={"file": ("a.mp4", b"x", "video/mp4")}).status_code == 415
    part = c.get("/v1/swipe/audios/file", params={"folder": "Spots", "name": "radio.mp3"}, headers={"Range": "bytes=0-9"})
    assert part.status_code == 206 and part.headers["content-type"] == "audio/mpeg"


def test_an_email_link_is_saved_as_a_pdf_and_bad_links_are_refused(client, monkeypatch) -> None:
    client, _ = client
    def fake(url, dest_dir, name):
        dest_dir.mkdir(parents=True, exist_ok=True)
        out = dest_dir / "Hello.pdf"
        out.write_bytes(b"%PDF-1.4")
        return out, "Hello"

    monkeypatch.setattr("phibe.server.swipe_email.render_pdf", fake)
    saved = client.post("/v1/swipe/emails/link", json={"url": "https://x.test/e", "folder": "Hotels"})
    assert saved.status_code == 200 and saved.json() == {"folder": "Hotels", "name": "Hello.pdf", "size": 8}
    assert client.get("/v1/swipe/emails/file", params={"folder": "Hotels", "name": "Hello.pdf"}).status_code == 200
    monkeypatch.undo()
    assert client.post("/v1/swipe/emails/link", json={"url": "file:///etc/passwd", "folder": "Hotels"}).status_code == 400


def test_a_file_can_be_renamed_and_moved_but_never_over_another(client) -> None:
    c, base = client
    (base / "Ads").mkdir(parents=True)
    (base / "Ads" / "a.mp4").write_bytes(b"v")
    (base / "b.mp4").write_bytes(b"w")
    r = c.patch("/v1/swipe/videos/file", json={"folder": "Ads", "name": "a.mp4", "title": "Better name", "new_folder": "Keep"})
    assert r.status_code == 200 and r.json() == {"folder": "Keep", "name": "Better name.mp4"}
    assert (base / "Keep" / "Better name.mp4").read_bytes() == b"v" and not (base / "Ads" / "a.mp4").exists()
    assert c.patch("/v1/swipe/videos/file", json={"folder": "Keep", "name": "Better name.mp4", "title": "b", "new_folder": "Unsorted"}).status_code == 409
    assert c.patch("/v1/swipe/videos/file", json={"folder": "Keep", "name": "nope.mp4"}).status_code == 404


def test_ideas_are_written_like_copy(client) -> None:
    c, _ = client
    r = c.post("/v1/swipe/ideas/save", json={"folder": "Marketing", "title": "Referral loop", "content": "Give a month, get a month."})
    assert r.status_code == 200 and r.json()["name"] == "Referral loop.md"
    assert c.get("/v1/swipe/ideas").json()["items"][0]["preview"].startswith("Give a month")


def test_hunches_keep_threads_and_folders_can_be_renamed(client) -> None:
    c, base = client
    saved = c.post("/v1/swipe/ideas/save", json={"folder": "Unsorted", "title": "Loop", "content": "Give a month.", "threads": ["Business Playbook", "Águas Correntes"]})
    assert saved.status_code == 200
    item = c.get("/v1/swipe/ideas").json()["items"][0]
    assert item["threads"] == ["Business Playbook", "Águas Correntes"] and item["preview"].startswith("Give a month")
    edited = c.patch("/v1/swipe/ideas/file", json={"folder": "Unsorted", "name": "Loop.md", "threads": ["Israel"]})
    assert edited.status_code == 200 and c.get("/v1/swipe/ideas").json()["items"][0]["threads"] == ["Israel"]
    (base / "Ads").mkdir(parents=True)
    assert c.patch("/v1/swipe/folders", json={"kind": "videos", "name": "Ads", "new_name": "Paid Ads"}).json() == {"name": "Paid Ads"}
    assert (base / "Paid Ads").is_dir() and not (base / "Ads").exists()
    assert c.patch("/v1/swipe/folders", json={"kind": "videos", "name": "Paid Ads", "new_name": "Unsorted"}).status_code == 400


def test_emails_remember_where_they_come_from_and_it_follows_the_file(client, monkeypatch) -> None:
    from phibe.server.swipe_routes import source_from_url

    assert source_from_url("https://view.mkt.amarantehoteis.com.br/?qs=1") == "amarantehoteis.com.br"
    c, _ = client
    r = c.post("/v1/swipe/emails", params={"folder": "Parks", "source": "Amarante"}, files={"file": ("bf.pdf", b"%PDF-1.4", "application/pdf")})
    assert r.status_code == 200
    assert c.get("/v1/swipe/emails").json()["items"][0]["source"] == "Amarante"
    moved = c.patch("/v1/swipe/emails/file", json={"folder": "Parks", "name": "bf.pdf", "title": "Black Friday", "new_folder": "Hotels"})
    assert moved.status_code == 200
    assert c.get("/v1/swipe/emails").json()["items"][0]["source"] == "Amarante"
    c.patch("/v1/swipe/emails/file", json={"folder": "Hotels", "name": "Black Friday.pdf", "source": "Amarante Hotéis"})
    assert c.get("/v1/swipe/emails").json()["items"][0]["source"] == "Amarante Hotéis"


def test_trash_lists_restores_and_purges(client) -> None:
    """DELETE keeps the file in the Trash; it can be listed, put back, or removed for good."""
    c, base = client
    c.post("/v1/swipe/prompts/save", json={"folder": "Ads", "title": "Bye", "content": "x"})
    assert c.delete("/v1/swipe/prompts/file", params={"folder": "Ads", "name": "Bye.md"}).status_code == 200
    assert c.get("/v1/swipe/prompts").json()["items"] == []
    item = c.get("/v1/swipe/trash").json()["items"][0]
    assert (item["kind"], item["folder"], item["title"]) == ("prompts", "Ads", "Bye")
    r = c.post("/v1/swipe/trash/restore", json={"kind": "prompts", "folder": "Ads", "name": item["name"]})
    assert r.json() == {"folder": "Ads", "name": "Bye.md"}
    assert c.get("/v1/swipe/trash").json()["items"] == []
    c.delete("/v1/swipe/prompts/file", params={"folder": "Ads", "name": "Bye.md"})
    item = c.get("/v1/swipe/trash").json()["items"][0]
    assert c.delete("/v1/swipe/trash", params={"kind": "prompts", "folder": "Ads", "name": item["name"]}).status_code == 200
    assert c.get("/v1/swipe/trash").json()["items"] == []


def test_custom_text_types(client) -> None:
    """The user makes, renames, orders and deletes text types; each is a folder of its own, and every text has a Source."""
    c, base = client
    assert c.get("/v1/swipe/types").json() == [{"id": "emails", "label": "E-Mails"}]
    assert c.post("/v1/swipe/types", json={"name": "Scripts"}).json() == {"id": "Scripts", "label": "Scripts"}
    assert c.post("/v1/swipe/types", json={"name": "E-Mails"}).status_code == 409
    assert c.post("/v1/swipe/types", json={"name": "videos"}).status_code == 409
    r = c.post("/v1/swipe/Scripts/save", json={"folder": "Unsorted", "title": "Opening", "content": "hi", "source": "Amarante"})
    assert r.json() == {"folder": "Unsorted", "name": "Opening.md"}
    assert c.get("/v1/swipe/Scripts").json()["items"][0]["source"] == "Amarante"
    assert c.get("/v1/swipe/nope").status_code == 404
    assert c.patch("/v1/swipe/sources", json={"old": "Amarante", "new": "Amarante Hotéis"}).json() == {"changed": 1}
    assert c.get("/v1/swipe/Scripts").json()["items"][0]["source"] == "Amarante Hotéis"
    assert c.patch("/v1/swipe/types", json={"id": "Scripts", "new_name": "Pages"}).json()["id"] == "Pages"
    assert c.get("/v1/swipe/Pages").json()["items"][0]["title"] == "Opening"
    c.put("/v1/swipe/types/order", json={"order": ["Pages", "emails"]})
    assert [t["id"] for t in c.get("/v1/swipe/types").json()] == ["Pages", "emails"]
    assert c.delete("/v1/swipe/types", params={"id": "Pages"}).json() == {"moved": 2}  # the text and its Source note
    assert [t["id"] for t in c.get("/v1/swipe/types").json()] == ["emails"]
    item = c.get("/v1/swipe/trash").json()["items"][0]
    assert (item["kind"], item["title"]) == ("Pages", "Opening")
    c.post("/v1/swipe/trash/restore", json={"kind": "Pages", "folder": item["folder"], "name": item["name"]})
    assert c.get("/v1/swipe/Pages").json()["items"][0]["title"] == "Opening"
