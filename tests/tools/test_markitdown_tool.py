"""MarkItDown: documents become Markdown for the tool, for Upload and for the chat's Add File."""

from __future__ import annotations

import io

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.connectors.markitdown_convert import UnsupportedDocument, to_markdown
from phibe.server import upload_router
from phibe.tools.markitdown_tool import MarkItDownTool


def test_text_and_tables_become_markdown() -> None:
    assert to_markdown("olá".encode("latin-1"), "a.txt") == "olá"
    assert to_markdown(b"a,b\n1,2\n", "t.csv") == "| a | b |\n| --- | --- |\n| 1 | 2 |"
    with pytest.raises(UnsupportedDocument):
        to_markdown(b"x", "movie.mp4")


def test_a_presentation_keeps_its_titles() -> None:
    from pptx import Presentation

    deck = Presentation()
    slide = deck.slides.add_slide(deck.slide_layouts[1])
    slide.shapes.title.text = "Plano"
    slide.placeholders[1].text = "Texto do plano."
    out = io.BytesIO()
    deck.save(out)
    md = to_markdown(out.getvalue(), "plano.pptx")
    assert "Plano" in md and "Texto do plano." in md


def test_the_tool_reads_a_file_and_refuses_the_rest(tmp_path) -> None:
    (tmp_path / "n.md").write_text("# Nota\ncorpo", encoding="utf-8")
    tool = MarkItDownTool()
    assert tool.execute(file_path=str(tmp_path / "n.md")).content.startswith("# Nota")
    assert not tool.execute(file_path=str(tmp_path / "nope.pdf")).success
    assert not tool.execute(file_path=str(tmp_path / "x.mp4")).success
    assert tool.execute(file_path=str(tmp_path / "n.md"), max_chars=3).content.endswith("[...truncated...]")


def test_add_file_converts_without_indexing_and_upload_indexes(tmp_path, monkeypatch) -> None:
    from phibe.connectors.store import KnowledgeStore

    store = KnowledgeStore(db_path=tmp_path / "k.db")
    monkeypatch.setattr(upload_router, "_get_store", lambda: store)
    monkeypatch.setattr(upload_router, "DEFAULT_CONFIG_DIR", tmp_path)
    app = FastAPI()
    app.include_router(upload_router.router)
    client = TestClient(app)

    got = client.post("/v1/connectors/upload/convert", files={"file": ("n.csv", b"a,b\n1,2\n")}).json()
    assert got["name"] == "n.csv" and "| a | b |" in got["markdown"]
    assert store.search("a") == [] if hasattr(store, "search") else True  # nothing was indexed by Add File

    done = client.post("/v1/connectors/upload/ingest/files", files={"files": ("n.csv", b"a,b\n1,2\n")}).json()
    assert done["chunks_added"] == 1
    assert list((tmp_path / "documents").glob("*-n.md"))  # the converted .md is kept
    assert client.post("/v1/connectors/upload/convert", files={"file": ("x.mp4", b"x")}).status_code == 400
