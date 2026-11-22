"""Links between notes, collection rename/delete, bookmarks from an address, and PDF text in the index."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.notes import files, pdftext
from phibe.notes.indexer import note_text
from phibe.notes.store import NotesStore
from phibe.server import notes_routes
from phibe.server.notes_routes import create_notes_router


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path))
    monkeypatch.setattr("phibe.server.notes_routes.INDEX_DELAY", 3600)
    store = NotesStore(tmp_path / "n.db")
    app = FastAPI()
    app.include_router(create_notes_router(lambda: store))
    yield TestClient(app)
    store.close()


def test_mentions_and_wikilinks_become_links_with_backlinks() -> None:
    s = NotesStore(":memory:")
    a, b = s.create("Alpha", "x"), s.create("Beta", "y")
    s.create("Beta", "twin")  # two notes called Beta: [[Beta]] is ambiguous and stays as typed
    body = s.update(a, body=f"see [[beta]], [[Missing]] and [Gamma](/notes?note={b})")["body"]
    assert "[[beta]]" in body and "[[Missing]]" in body
    assert [(l["id"], l["kind"]) for l in s.get(a)["links"]] == [(b, "mention")]
    assert s.get(b)["backlinks"] == [{"id": a, "kind": "mention"}]
    s.update(a, body="no links now")
    assert s.get(a)["links"] == [] and s.get(b)["backlinks"] == []
    one = s.create("Solo", "z")
    assert f"[Solo](/notes?note={one})" in s.update(a, body="go to [[solo]]")["body"]
    s.close()


def test_collections_can_be_renamed_and_deleted_without_losing_notes(client) -> None:
    cid = client.post("/v1/notes/collections", json={"name": "Old"}).json()["id"]
    nid = client.post("/v1/notes", json={"title": "Keep me"}).json()["id"]
    client.put(f"/v1/notes/{nid}/collections", json={"ids": [cid]})
    assert client.patch(f"/v1/notes/collections/{cid}", json={"name": " New "}).json()["name"] == "New"
    assert client.patch(f"/v1/notes/collections/{cid}", json={"name": " "}).status_code == 422
    assert client.patch("/v1/notes/collections/nope", json={"name": "x"}).status_code == 404
    assert client.delete(f"/v1/notes/collections/{cid}").json() == {"ok": True}
    assert client.get("/v1/notes/collections").json() == []
    assert client.get(f"/v1/notes/{nid}").json()["collections"] == []  # the note itself is still there
    assert client.delete(f"/v1/notes/collections/{cid}").status_code == 404


def test_bookmark_from_an_address(client, monkeypatch) -> None:
    monkeypatch.setattr(notes_routes, "_page_details", lambda url: {"title": "Site Title", "description": "About it"})
    made = client.post("/v1/notes/bookmark", json={"url": "example.com/page"}).json()
    assert (made["kind"], made["url"], made["title"], made["description"]) == ("bookmark", "https://example.com/page", "Site Title", "About it")
    monkeypatch.setattr(notes_routes, "_page_details", lambda url: {})  # offline: still saved, named by its address
    assert client.post("/v1/notes/bookmark", json={"url": "https://a.test"}).json()["title"] == "https://a.test"
    assert client.post("/v1/notes/bookmark", json={"url": "not an address"}).status_code == 422


def test_pdf_words_are_searchable_but_never_stored_in_the_note(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path))
    PdfWriter = pytest.importorskip("pypdf").PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(200, 200)
    path = tmp_path / "blank.pdf"
    with open(path, "wb") as f:
        writer.write(f)
    name = files.save(path.read_bytes(), "blank.pdf")
    body = f"[Blank.pdf]({files.url_of(name)})"
    assert pdftext.pdf_text(body) == ""  # a page without text gives nothing, and does not fail
    monkeypatch.setattr(pdftext, "pdf_text", lambda b: "quarterly beachhead strategy")
    monkeypatch.setattr("phibe.notes.indexer.pdf_text", pdftext.pdf_text)
    note = {"kind": "page", "body": body, "tags": [], "collections": [], "description": "", "url": ""}
    assert "quarterly beachhead strategy" in note_text(note)


PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 40


def test_attachments_and_backlinks_are_listed_for_the_sets() -> None:
    s = NotesStore(":memory:")
    sha = "a" * 64
    page = s.create("Page", f"![Chart](/v1/notes/files/{sha}.png) and [Deck](/v1/notes/files/{'b' * 64}.pdf)")
    mark = s.create("Site", "", kind="bookmark", url="https://x.com")
    s.add_link(page, mark)
    items = {a["name"]: a for a in s.attachments()}
    assert items[f"{sha}.png"]["image"] and items[f"{sha}.png"]["label"] == "Chart"
    assert not items[f"{'b' * 64}.pdf"]["image"] and items[f"{sha}.png"]["notes"][0]["id"] == page
    row = next(r for r in s.list(kind="bookmark") if r["id"] == mark)
    assert row["linked_from"] == [{"id": page, "title": "Page"}]
    s.close()
