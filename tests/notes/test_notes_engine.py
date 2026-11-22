"""Notes store and search index. Every database here is temporary."""

from __future__ import annotations

import struct
from typing import Any, Dict, List, Optional

import pytest

from phibe.connectors.hybrid_search import HybridSearch
from phibe.connectors.store import KnowledgeStore
from phibe.notes import indexer
from phibe.notes.store import NotesStore, NotFound


@pytest.fixture
def notes():
    s = NotesStore(":memory:")
    yield s
    s.close()


@pytest.fixture
def knowledge():
    k = KnowledgeStore(":memory:")
    yield k
    k.close()


def vec(*xs: float) -> bytes:
    return struct.pack(f"{len(xs)}f", *xs)


class FakeEmbedder:
    """Two dimensions: the first says 'about cats', the second 'about money'."""

    def __init__(self, model: str = "fake", ok: bool = True, available: bool = True) -> None:
        self.model_version, self.ok, self.available = f"ollama:{model}", ok, available

    def is_available(self) -> bool:
        return self.available

    def embed(self, text: str) -> Optional[bytes]:
        if not self.ok:
            return None
        t = text.lower()
        return vec(1.0 if "cat" in t or "gato" in t else 0.0, 1.0 if "money" in t or "preço" in t else 0.0, 0.1)


# -- store ----------------------------------------------------------------------


def test_note_with_tags_collections_and_trash(notes: NotesStore) -> None:
    a = notes.create("Cats", "All about cats", tags=["Animals", "animals", "Pets"])
    assert notes.get(a)["tags"] == ["Animals", "Pets"]  # tag names are case-insensitive
    col = notes.upsert_collection("Zoo")
    notes.add_to_collection(col, a)
    assert notes.get(a)["collections"] == [{"id": col, "name": "Zoo"}]
    assert [n["id"] for n in notes.list(tag="Pets")] == [a]
    assert [n["id"] for n in notes.list(collection=col)] == [a]
    notes.trash(a)
    assert notes.list() == [] and [n["id"] for n in notes.list(trashed=True)] == [a]
    notes.restore(a)
    assert [n["id"] for n in notes.list()] == [a]
    with pytest.raises(NotFound):
        notes.get("missing")


def test_update_marks_the_note_as_edited_here(notes: NotesStore) -> None:
    n = notes.create("Old", "old", origin="x:1")
    assert notes.get(n)["local_edit"] == 0
    notes.update(n, body="my own words")
    assert notes.get(n)["local_edit"] == 1 and notes.get(n)["body"] == "my own words"


def test_pending_index_follows_text_tags_collections_and_model(notes: NotesStore) -> None:
    n = notes.create("T", "body", tags=["a"])
    assert [p["id"] for p in notes.pending_index("m1")] == [n]
    notes.mark_indexed(n, notes.pending_index("m1")[0]["hash"], "m1")
    assert notes.pending_index("m1") == []
    assert len(notes.pending_index("m2")) == 1  # a new embedding model means a new index
    notes.update(n, tags=["a", "b"])
    assert len(notes.pending_index("m1")) == 1
    notes.mark_indexed(n, notes.pending_index("m1")[0]["hash"], "m1")
    notes.add_to_collection(notes.upsert_collection("C"), n)
    assert len(notes.pending_index("m1")) == 1


# -- index ----------------------------------------------------------------------------


def test_index_only_what_changed_and_clean_up_the_trash(notes: NotesStore, knowledge: KnowledgeStore) -> None:
    a = notes.create("Cats", "Cats purr.", tags=["Pets"])
    b = notes.create("Money", "Price of money.")
    emb = FakeEmbedder()
    assert indexer.index_pending(notes, knowledge, emb)["indexed"] == 2
    assert knowledge.distinct_sources() == ["notes"]
    text = " ".join(r[0] for r in knowledge._conn.execute("SELECT content FROM knowledge_chunks WHERE doc_id = ?", (f"notes:{a}",)))
    assert "Cats purr." in text and "Tags: Pets" in text
    assert indexer.index_pending(notes, knowledge, emb) == {"indexed": 0, "failed": 0, "removed": 0, "pending": 0}
    notes.update(b, body="Price of money, edited.")
    assert indexer.index_pending(notes, knowledge, emb)["indexed"] == 1
    notes.trash(a)
    assert indexer.index_pending(notes, knowledge, emb)["removed"] == 1
    assert knowledge.count() > 0 and not knowledge._conn.execute("SELECT 1 FROM knowledge_chunks WHERE doc_id = ?", (f"notes:{a}",)).fetchone()


def test_a_missing_vector_stays_pending_and_an_absent_model_is_reported(notes: NotesStore, knowledge: KnowledgeStore) -> None:
    notes.create("Cats", "Cats purr.")
    out = indexer.index_pending(notes, knowledge, FakeEmbedder(ok=False))
    assert out["failed"] == 1 and out["pending"] == 1
    with pytest.raises(indexer.EmbeddingUnavailable):
        indexer.index_pending(notes, knowledge, FakeEmbedder(available=False))


# -- search with vectors from two models ---------------------------------------------------


def test_search_embeds_the_query_with_the_model_that_made_each_vector(knowledge: KnowledgeStore) -> None:
    knowledge.store("legacy cat story", source="mail", doc_id="m", embedding=vec(1, 0, 0, 0, 0), embedding_model_version="ollama:old")
    knowledge.store("notes about cats", source="notes", doc_id="n", embedding=vec(1, 0, 0.1), embedding_model_version="ollama:fake")

    class OldEmbedder(FakeEmbedder):
        def embed(self, text: str) -> Optional[bytes]:
            return vec(1, 0, 0, 0, 0)

    search = HybridSearch(knowledge, OldEmbedder("old"), embedders={"ollama:fake": FakeEmbedder()})
    hits = search.search("zzz cat", limit=5)  # no word matches: only the vector leg can find them
    assert {h.document_id for h in hits} == {"m", "n"}
    assert [h.document_id for h in search.search("zzz cat", sources=["notes"], limit=5)] == ["n"]


def test_stopwords_stay_out_of_the_keyword_query() -> None:
    from phibe.connectors.hybrid_search import _quote_fts

    assert _quote_fts("Por que não conseguimos parar de pensar em algo inacabado?") == (
        '"conseguimos" OR "parar" OR "pensar" OR "algo" OR "inacabado?"'
    )
    assert _quote_fts("why is the cat?") == '"cat?"'  # only the topic word stays
    assert _quote_fts("de que a") == '"de" OR "que" OR "a"'  # nothing else to match on: keep them


def test_one_store_serves_many_threads_at_once(tmp_path) -> None:
    """The web server answers several requests at the same time on one store."""
    from concurrent.futures import ThreadPoolExecutor

    store = NotesStore(tmp_path / "n.db")
    ids = [store.create(f"Note {i}", "body " * 50, tags=[f"t{i % 5}", "all"]) for i in range(40)]

    def work(i: int) -> int:
        store.list()
        store.tags()
        store.collections()
        store.stats()
        store.update(ids[i % 40], body=f"edited {i}")
        return len(store.get(ids[i % 40])["tags"])

    with ThreadPoolExecutor(12) as pool:
        assert set(pool.map(work, range(400))) == {2}
    store.close()


# -- files, collections and the picture copy -----------------------------------------------------


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path))
    return tmp_path


PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 40


def test_files_are_stored_once_by_content_and_names_cannot_escape(home) -> None:
    from phibe.notes import files

    a = files.save(PNG, "photo.bin")
    assert a.endswith(".png") and files.save(PNG, "other.jpg") == a  # the content decides, and it is stored once
    assert files.path_of(a).read_bytes() == PNG
    assert files.path_of("../../etc/passwd") is None and files.path_of("a" * 64 + ".png") is None
    assert files.save(b"<svg onload=alert(1)/>", "x.svg").endswith(".svg")
    with pytest.raises(files.FileTooBig):
        files.save(b"0" * (files.MAX_BYTES + 1))


def test_a_note_can_be_put_in_collections(notes: NotesStore) -> None:
    n = notes.create("N", "b")
    a, b = notes.upsert_collection("A"), notes.upsert_collection("B")
    notes.set_collections(n, [a, b, "unknown"])
    assert [c["name"] for c in notes.get(n)["collections"]] == ["A", "B"]
    notes.set_collections(n, [b])
    assert [c["name"] for c in notes.get(n)["collections"]] == ["B"] and len(notes.collections()) == 2
