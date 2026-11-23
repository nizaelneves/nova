"""HTTP API for the notes: ``/v1/notes/*``. Databases are temporary and indexing is stubbed."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.connectors import chat_sources
from phibe.connectors.store import KnowledgeStore
from phibe.notes import settings as notes_settings
from phibe.notes.store import NotesStore
from phibe.server.notes_routes import create_notes_router


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path))
    monkeypatch.setattr(notes_settings, "_path", lambda: tmp_path / "s.json")
    monkeypatch.setattr("phibe.server.notes_routes.INDEX_DELAY", 0.01)
    monkeypatch.setattr("phibe.connectors.store.KnowledgeStore", lambda: KnowledgeStore(tmp_path / "k.db"))
    monkeypatch.setattr("phibe.notes.indexer.index_pending", lambda *a, **k: {"indexed": 0, "failed": 0, "removed": 0, "pending": 0})
    store = NotesStore(tmp_path / "n.db")
    app = FastAPI()
    app.include_router(create_notes_router(lambda: store))
    yield TestClient(app)
    store.close()


def test_create_edit_tag_trash_and_restore(client) -> None:
    made = client.post("/v1/notes", json={"title": "Cats", "body": "Cats purr", "tags": ["Pets"]})
    assert made.status_code == 200
    nid = made.json()["id"]
    assert client.get("/v1/notes", params={"tag": "Pets"}).json()[0]["id"] == nid
    patched = client.patch(f"/v1/notes/{nid}", json={"body": "Cats purr loudly", "tags": ["Pets", "Home"]}).json()
    assert patched["tags"] == ["Home", "Pets"] and patched["local_edit"] == 1
    assert [t["name"] for t in client.get("/v1/notes/tags").json()] == ["Home", "Pets"]
    assert client.post(f"/v1/notes/{nid}/trash").json() == {"ok": True}
    assert client.get("/v1/notes").json() == []
    client.post(f"/v1/notes/{nid}/restore")
    assert len(client.get("/v1/notes").json()) == 1


def test_purge_only_removes_a_note_that_is_in_the_trash(client) -> None:
    nid = client.post("/v1/notes", json={"title": "Gone", "body": "x"}).json()["id"]
    client.delete(f"/v1/notes/{nid}/purge")  # not in the trash: stays
    assert len(client.get("/v1/notes").json()) == 1
    client.post(f"/v1/notes/{nid}/trash")
    assert client.delete(f"/v1/notes/{nid}/purge").json() == {"ok": True}
    assert client.get("/v1/notes", params={"trashed": "true"}).json() == []
    assert client.delete(f"/v1/notes/{nid}/purge").status_code == 404


def test_errors_are_clear(client) -> None:
    assert client.get("/v1/notes/nope").status_code == 404
    assert client.patch("/v1/notes/nope", json={"title": "x"}).status_code == 404
    assert client.post("/v1/notes", json={"title": "x", "kind": "poem"}).status_code == 422
    assert client.put("/v1/notes/settings", json={"embedding_model": " "}).status_code == 422


def test_status_and_embedding_model_setting(client, monkeypatch) -> None:
    reset = []
    monkeypatch.setattr(chat_sources, "reset_searcher", lambda: reset.append(1))
    assert client.get("/v1/notes/settings").json() == {"embedding_model": "bge-m3"}
    assert client.put("/v1/notes/settings", json={"embedding_model": "embeddinggemma"}).json() == {"embedding_model": "embeddinggemma"}
    assert reset == [1]
    client.post("/v1/notes", json={"title": "A", "body": "b"})
    status = client.get("/v1/notes/status").json()
    assert status["notes"] == 1 and status["embedding_model"] == "ollama:embeddinggemma" and status["pending"] == 1


def test_files_upload_and_serve_safely(client) -> None:
    png = b"\x89PNG\r\n\x1a\n" + b"x" * 30
    up = client.post("/v1/notes/files", files={"file": ("a.png", png, "image/png")}).json()
    assert up["url"].startswith("/v1/notes/files/") and up["size"] == len(png)
    got = client.get(up["url"])
    assert got.status_code == 200 and got.headers["content-type"] == "image/png" and got.content == png
    svg = client.post("/v1/notes/files", files={"file": ("x.svg", b"<svg onload=alert(1)/>", "image/svg+xml")}).json()
    shown = client.get(svg["url"])
    assert "attachment" in shown.headers["content-disposition"]  # never displayed inside Phibe's own page
    assert client.get("/v1/notes/files/nope.png").status_code == 404


def test_collections_can_be_created_and_assigned(client) -> None:
    nid = client.post("/v1/notes", json={"title": "N"}).json()["id"]
    col = client.post("/v1/notes/collections", json={"name": "Reading"}).json()
    assert client.post("/v1/notes/collections", json={"name": " "}).status_code == 422
    done = client.put(f"/v1/notes/{nid}/collections", json={"ids": [col["id"]]}).json()
    assert done["collections"] == [{"id": col["id"], "name": "Reading"}]
    assert client.get("/v1/notes/collections").json()[0]["count"] == 1
    assert client.put("/v1/notes/nope/collections", json={"ids": []}).status_code == 404


def test_export_and_backup_endpoints(client) -> None:
    import io
    import zipfile

    client.post("/v1/notes", json={"title": "Cats", "body": "Cats purr", "tags": ["Pets"]})
    got = client.get("/v1/notes/export")
    assert got.status_code == 200 and got.headers["content-type"] == "application/zip"
    assert "phibe-notes-" in got.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(got.content)) as z:
        assert "Notes/Cats.md" in z.namelist() and "index.json" in z.namelist()
    made = client.post("/v1/notes/backup").json()
    assert made["notes"] == 1 and made["name"].startswith("notes-")
    assert [b["name"] for b in client.get("/v1/notes/backups").json()][0] == made["name"] or len(client.get("/v1/notes/backups").json()) >= 1
    assert client.get("/v1/notes/status").json()["backups"]


def test_uploaded_files_are_listed_and_can_be_deleted(client) -> None:
    """A file uploaded on its own shows in the Files set with its own name, and deleting it removes it from the list."""
    up = client.post("/v1/notes/files", files={"file": ("brief.pdf", b"%PDF-1.4 hello", "application/pdf")}).json()
    rows = client.get("/v1/notes/attachments").json()
    assert [(r["name"], r["label"], r["notes"]) for r in rows] == [(up["name"], "brief.pdf", [])]
    assert client.delete(f"/v1/notes/files/{up['name']}").json() == {"ok": True}
    assert client.get("/v1/notes/attachments").json() == []
    assert client.delete(f"/v1/notes/files/{up['name']}").status_code == 404


def test_file_backlinks_tags_and_tag_management(client) -> None:
    """A file's backlinks are the notes the user connected it to (not the notes that merely contain it); tags work on files too."""
    png = b"PNGDATA" + bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) + b".."
    up = client.post("/v1/notes/files", files={"file": ("a.png", png, "image/png")}).json()
    ref = f"![[ABORDAGEM]]({up['url']})"
    a = client.post("/v1/notes", json={"title": "One", "body": ref, "tags": ["Old"]}).json()["id"]
    row = client.get("/v1/notes/attachments").json()[0]
    assert row["notes"] == [] and row["label"] == "[ABORDAGEM]"  # written inside a note, but not connected
    assert client.put(f"/v1/notes/files/{up['name']}/notes", json={"notes": [a]}).json() == {"notes": [a]}
    assert [n["id"] for n in client.get("/v1/notes/attachments").json()[0]["notes"]] == [a]
    assert client.put(f"/v1/notes/files/{up['name']}/tags", json={"tags": ["Old", "Ads"]}).json() == {"tags": ["Old", "Ads"]}
    assert client.patch("/v1/notes/tags", json={"name": "Old", "new_name": "New", "color": "#8fe3ff"}).json() == {"ok": True}
    tags = {t["name"]: t for t in client.get("/v1/notes/tags").json()}
    assert tags["New"]["color"] == "#8fe3ff" and tags["New"]["count"] == 1 and "Old" not in tags
    assert client.get("/v1/notes/attachments").json()[0]["tags"] == ["New", "Ads"]
    assert client.delete("/v1/notes/tags", params={"name": "New"}).json() == {"ok": True}
    assert client.get(f"/v1/notes/{a}").json()["tags"] == []
    assert client.get("/v1/notes/attachments").json()[0]["tags"] == ["Ads"]


def test_links_show_both_ways_and_can_be_removed(client) -> None:
    """A bookmark lists the notes it is connected to; a written link is removed from the text, the words stay."""
    page = client.post("/v1/notes", json={"title": "Page", "body": "x"}).json()["id"]
    mark = client.post("/v1/notes", json={"title": "Mark", "kind": "bookmark", "body": "y"}).json()["id"]
    client.patch(f"/v1/notes/{mark}", json={"body": f"see [the page](/notes?note={page})"})
    rows = {r["id"]: r for r in client.get("/v1/notes").json()}
    assert [n["id"] for n in rows[mark]["linked_to"]] == [page] and [n["id"] for n in rows[page]["linked_from"]] == [mark]
    assert client.delete("/v1/notes/links", params={"src": mark, "dst": page}).json() == {"ok": True}
    assert client.get(f"/v1/notes/{mark}").json()["body"] == "see the page"
    rows = {r["id"]: r for r in client.get("/v1/notes").json()}
    assert rows[page]["linked_from"] == [] and rows[mark]["linked_to"] == []
    assert client.delete("/v1/notes/links", params={"src": mark, "dst": page}).status_code == 404


def test_a_file_can_be_renamed(client) -> None:
    up = client.post("/v1/notes/files", files={"file": ("brief.pdf", b"%PDF-1.4 hello", "application/pdf")}).json()
    assert client.put(f"/v1/notes/files/{up['name']}/label", json={"label": "  Plan  "}).json() == {"label": "Plan"}
    assert client.get("/v1/notes/attachments").json()[0]["label"] == "Plan"
    assert client.put(f"/v1/notes/files/{up['name']}/label", json={"label": " "}).status_code == 422
    assert client.put("/v1/notes/files/nope.pdf/label", json={"label": "x"}).status_code == 404
