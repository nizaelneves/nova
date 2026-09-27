"""Anytype connector, tested against a fake local Anytype API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import httpx
import pytest

from nova.connectors import anytype as module
from nova.connectors.anytype import AnytypeConnector, AnytypeError, clean_markdown
from nova.connectors.pipeline import IngestionPipeline
from nova.connectors.store import KnowledgeStore
from nova.connectors.sync_engine import SyncEngine

OLD = "2020-01-01T10:00:00Z"


class FakeAnytype:
    """Just enough of the Anytype API: spaces, object listing, markdown."""

    def __init__(self) -> None:
        self.spaces: Dict[str, List[Dict[str, Any]]] = {"sp1": []}
        self.markdown: Dict[str, str] = {}
        self.calls: List[str] = []

    def add(
        self,
        oid: str,
        name: str,
        body: str,
        *,
        kind: str = "page",
        modified: str = OLD,
        space: str = "sp1",
    ) -> None:
        self.spaces.setdefault(space, []).append(
            {
                "id": oid,
                "name": name,
                "type": kind,
                "properties": {"last_modified_date": modified},
            }
        )
        self.markdown[oid] = body

    def edit(self, oid: str, body: str, modified: str) -> None:
        self.markdown[oid] = body
        for rows in self.spaces.values():
            for row in rows:
                if row["id"] == oid:
                    row["properties"]["last_modified_date"] = modified

    def remove(self, oid: str) -> None:
        for space in self.spaces:
            self.spaces[space] = [r for r in self.spaces[space] if r["id"] != oid]

    def __call__(self, base, key, path, params=None, version=""):
        self.calls.append(path)
        params = params or {}
        assert key == "k-123"
        limit, offset = params.get("limit", 100), params.get("offset", 0)
        assert path.startswith("/v2/"), "scoped keys only work on /v2"
        if path == "/v2/spaces":
            rows = [{"id": s, "name": s} for s in self.spaces]
        elif path.endswith("/objects"):
            assert params.get("fields") == "last_modified_date"
            rows = self.spaces[path.split("/")[3]]
        else:
            oid = path.rsplit("/", 1)[1]
            assert params == {"format": "md"}
            return {"id": oid, "markdown": self.markdown[oid]}
        page = rows[offset : offset + limit]
        return {"data": page, "has_more": offset + limit < len(rows)}

    def content_fetches(self) -> List[str]:
        return [c for c in self.calls if "/objects/" in c]


@pytest.fixture
def api(monkeypatch) -> FakeAnytype:
    fake = FakeAnytype()
    monkeypatch.setattr(module, "_anytype_get", fake)
    return fake


@pytest.fixture
def connector(tmp_path, monkeypatch) -> AnytypeConnector:
    monkeypatch.setenv("NOVA_HOME", str(tmp_path))
    monkeypatch.delenv("ANYTYPE_API_KEY", raising=False)
    return AnytypeConnector(api_key="k-123", credentials_path=str(tmp_path / "a.json"))


# -- reading ---------------------------------------------------------------------


def test_notes_become_documents(api, connector) -> None:
    api.add("o1", "Plano", "# Plano\nMetas do trimestre")

    docs = list(connector.sync())

    assert len(docs) == 1
    doc = docs[0]
    assert doc.doc_id == "anytype:sp1:o1" and doc.source == "anytype"
    assert doc.title == "Plano" and "Metas do trimestre" in doc.content
    assert doc.url == "anytype://object?objectId=o1&spaceId=sp1"
    assert doc.timestamp == datetime(2020, 1, 1, 10, 0, tzinfo=timezone.utc)


def test_object_types_without_text_are_skipped(api, connector) -> None:
    api.add("o1", "Nota", "# Nota\ntexto")
    api.add("o2", "Imagem", "x", kind="image")
    api.add("o3", "Tabela", "x", kind="set")

    assert [d.title for d in connector.sync()] == ["Nota"]
    assert api.content_fetches() == ["/v2/spaces/sp1/objects/o1"]


def test_empty_notes_are_skipped(api, connector) -> None:
    api.add("o1", "Vazia", "# Vazia\n")
    api.add("o2", "Cheia", "# Cheia\ncom texto")

    assert [d.title for d in connector.sync()] == ["Cheia"]


def test_lists_are_read_page_by_page_and_all_spaces(api, connector) -> None:
    for i in range(230):
        api.add(f"n{i}", f"Nota {i}", f"# Nota {i}\ncorpo {i}")
    api.add("x1", "Outro espaco", "# Outro\ncorpo", space="sp2")

    assert len(list(connector.sync())) == 231


def test_only_notes_changed_since_the_last_sync_are_downloaded(api, connector) -> None:
    api.add("old", "Antiga", "# Antiga\ncorpo", modified="2020-01-01T00:00:00Z")
    api.add("new", "Nova", "# Nova\ncorpo", modified="2030-01-01T00:00:00Z")
    since = datetime(2025, 1, 1, tzinfo=timezone.utc)

    assert [d.title for d in connector.sync(since=since)] == ["Nova"]
    assert api.content_fetches() == ["/v2/spaces/sp1/objects/new"]


def test_markdown_noise_is_removed() -> None:
    raw = (
        "# Titulo   \n![alt](http://127.0.0.1:47800/image/abc)   \n"
        "0:00\ntexto util   \n10:22\n\n\n\nfim"
    )

    assert clean_markdown(raw) == "# Titulo\n\ntexto util\n\nfim"


def test_no_key_means_not_connected_and_nothing_is_read(
    api, tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("NOVA_HOME", str(tmp_path))
    monkeypatch.delenv("ANYTYPE_API_KEY", raising=False)
    bare = AnytypeConnector(credentials_path=str(tmp_path / "none.json"))

    assert not bare.is_connected()
    assert list(bare.sync()) == [] and api.calls == []


def test_key_can_come_from_credentials_toml(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("NOVA_HOME", str(tmp_path))
    monkeypatch.delenv("ANYTYPE_API_KEY", raising=False)
    (tmp_path / "credentials.toml").write_text(
        '[anytype]\nANYTYPE_API_KEY = "from-toml"\n', encoding="utf-8"
    )

    assert (
        AnytypeConnector(credentials_path=str(tmp_path / "n.json"))._key()
        == "from-toml"
    )


def test_key_saved_from_the_screen_and_removed_on_disconnect(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("NOVA_HOME", str(tmp_path))
    monkeypatch.delenv("ANYTYPE_API_KEY", raising=False)
    conn = AnytypeConnector(credentials_path=str(tmp_path / "a.json"))

    conn.set_token("  pasted  ")
    assert (
        AnytypeConnector(credentials_path=str(tmp_path / "a.json"))._key() == "pasted"
    )
    with pytest.raises(ValueError):
        conn.set_token("  ")
    conn.disconnect()
    assert not conn.is_connected()


# -- safety and errors ----------------------------------------------------------------


def test_only_get_requests_are_ever_sent(monkeypatch) -> None:
    sent: List[str] = []

    def fake_get(url, **kwargs):
        sent.append("GET")
        return httpx.Response(200, json={"data": [], "has_more": False})

    def forbidden(*args, **kwargs):
        raise AssertionError("Anytype must stay read-only")

    monkeypatch.setattr(httpx, "get", fake_get)
    for verb in ("post", "put", "patch", "delete", "request"):
        monkeypatch.setattr(httpx, verb, forbidden)

    module._anytype_get("http://x", "k", "/v1/spaces")
    assert sent == ["GET"]


def test_the_key_goes_in_the_header_not_the_url(monkeypatch) -> None:
    seen: Dict[str, Any] = {}

    def fake_get(url, headers=None, params=None, timeout=None):
        seen.update(url=url, headers=headers)
        return httpx.Response(200, json={})

    monkeypatch.setattr(httpx, "get", fake_get)
    module._anytype_get("http://x/", "secret", "/v1/spaces", version="2025-01-01")

    assert "secret" not in seen["url"]
    assert seen["headers"] == {
        "Authorization": "Bearer secret",
        "Anytype-Version": "2025-01-01",
    }


@pytest.mark.parametrize(
    "response,words",
    [
        (httpx.Response(401), "rejected the API key"),
        (httpx.Response(500, json={"message": "boom"}), "boom"),
    ],
)
def test_http_errors_are_explained(monkeypatch, response, words) -> None:
    monkeypatch.setattr(httpx, "get", lambda *a, **k: response)

    with pytest.raises(AnytypeError, match=words):
        module._anytype_get("http://x", "k", "/v1/spaces")


def test_anytype_being_closed_is_a_clear_message(monkeypatch) -> None:
    def down(*args, **kwargs):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "get", down)

    with pytest.raises(AnytypeError, match="Open the Anytype app"):
        module._anytype_get("http://x", "k", "/v1/spaces")


def test_a_failed_listing_never_prunes(api, connector, monkeypatch) -> None:
    def down(*args, **kwargs):
        raise AnytypeError("closed")

    monkeypatch.setattr(module, "_anytype_get", down)

    assert connector.current_doc_ids() is None


# -- the whole path: Anytype -> index -> search ---------------------------------


@pytest.fixture
def engine(connector):
    store = KnowledgeStore(db_path=":memory:")
    pipeline = IngestionPipeline(store)
    sync = SyncEngine(pipeline, state_db=":memory:")
    yield store, sync
    sync.close()
    store.close()


def _titles(store: KnowledgeStore) -> set:
    rows = store._conn.execute("SELECT DISTINCT title FROM knowledge_chunks").fetchall()
    return {r[0] for r in rows}


def test_first_sync_indexes_and_search_finds_the_note(api, connector, engine) -> None:
    store, sync = engine
    api.add("o1", "Funil", "# Funil\nconversao do checkout no mobile")
    api.add("o2", "Receita", "# Receita\nbolo de cenoura")

    assert sync.sync(connector) == 2

    hits = store.retrieve("checkout mobile", top_k=3)
    assert hits and hits[0].metadata["title"] == "Funil"


def test_an_edited_note_replaces_its_old_version(api, connector, engine) -> None:
    store, sync = engine
    api.add("o1", "Plano", "# Plano\nversao antiga sobre tiktok")
    sync.sync(connector)

    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    api.edit("o1", "# Plano\nversao nova sobre linkedin", future)
    sync.sync(connector)

    assert store.retrieve("tiktok", top_k=3) == []
    assert store.retrieve("linkedin", top_k=3)


def test_a_note_deleted_in_anytype_leaves_the_index(api, connector, engine) -> None:
    store, sync = engine
    api.add("o1", "Fica", "# Fica\nconteudo um")
    api.add("o2", "Some", "# Some\nconteudo dois")
    sync.sync(connector)
    assert _titles(store) == {"Fica", "Some"}

    api.remove("o2")
    sync.sync(connector)

    assert _titles(store) == {"Fica"}


def test_unchanged_notes_are_not_downloaded_again(api, connector, engine) -> None:
    _, sync = engine
    api.add("o1", "Uma", "# Uma\ncorpo")
    sync.sync(connector)
    api.calls.clear()

    sync.sync(connector)

    assert api.content_fetches() == []


# -- embeddings are optional ---------------------------------------------------------


def test_missing_embedding_model_means_text_only_indexing(monkeypatch) -> None:
    from nova.connectors.embeddings import OllamaEmbedder, OptionalOllamaEmbedder

    checked: List[int] = []
    monkeypatch.setattr(
        OllamaEmbedder, "is_available", lambda self: checked.append(1) or False
    )
    embedder = OptionalOllamaEmbedder()

    assert embedder.embed("a") is None and embedder.embed("b") is None
    assert len(checked) == 1


def test_installed_embedding_model_is_used(monkeypatch) -> None:
    from nova.connectors.embeddings import OllamaEmbedder, OptionalOllamaEmbedder

    monkeypatch.setattr(OllamaEmbedder, "is_available", lambda self: True)
    monkeypatch.setattr(OllamaEmbedder, "embed", lambda self, text: b"vec")

    embedder = OptionalOllamaEmbedder()
    embedder._usable = True

    assert OllamaEmbedder.embed(embedder, "x") == b"vec"
