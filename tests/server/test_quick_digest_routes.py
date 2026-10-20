"""The quick digest: sources in, summaries out, last one kept."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.server.quick_digest_routes import build_digest, create_quick_digest_router


class FakeEngine:
    def __init__(self, fail_on: str = "") -> None:
        self.fail_on = fail_on
        self.calls = []

    def generate(self, messages, *, model, temperature=0.7, max_tokens=1024, **kw):
        user = messages[-1].content
        self.calls.append(user)
        if self.fail_on and self.fail_on in user:
            raise RuntimeError("model down")
        if user.startswith("Source:"):
            name = user.splitlines()[0].replace("Source: ", "")
            return {"content": f"<think>x</think>**{name}** has news."}
        return {"content": "Both sources moved today."}


ITEMS = {
    "hackernews": [{"title": "A new database", "text": "Launched today."}],
    "anytype": [{"title": "Note 1", "text": "a"}, {"title": "Note 2", "text": "b"}],
}


def _client(tmp_path, items=ITEMS, engine=None):
    app = FastAPI()
    app.include_router(create_quick_digest_router(lambda: engine or FakeEngine(), lambda: "m:1", path=tmp_path / "d.json", collect=lambda: items))
    return TestClient(app)


def test_builds_a_section_per_source_and_a_headline() -> None:
    d = build_digest(FakeEngine(), "m:1", ITEMS)
    assert list(d["sections"]) == ["hackernews", "anytype"]
    assert d["sections"]["hackernews"] == "hackernews has news."  # thinking tags and markdown are gone
    assert d["text"] == "3 New Items From 2 Sources\nBoth sources moved today."
    assert d["sources_used"] == ["hackernews", "anytype"] and d["model_used"] == "m:1"


def test_skips_a_source_the_model_fails_on_and_says_so_when_nothing_is_left() -> None:
    d = build_digest(FakeEngine(fail_on="anytype"), "m:1", ITEMS)
    assert list(d["sections"]) == ["hackernews"]
    assert d["text"].startswith("1 New Item From 1 Source")
    empty = build_digest(FakeEngine(), "m:1", {})
    assert empty["sections"] == {} and empty["text"].startswith("Nothing new in your sources.")


def test_there_is_no_digest_until_one_is_written_and_then_the_last_one_is_kept(tmp_path) -> None:
    client = _client(tmp_path)
    assert client.get("/api/quick-digest").status_code == 404
    written = client.post("/api/quick-digest/generate").json()
    assert written["sections"]["anytype"] == "anytype has news."
    assert client.get("/api/quick-digest").json() == written


def test_a_failing_collection_is_reported_not_swallowed(tmp_path) -> None:
    def boom():
        raise RuntimeError("no sources")

    app = FastAPI()
    app.include_router(create_quick_digest_router(lambda: FakeEngine(), lambda: "m", path=tmp_path / "d.json", collect=boom))
    resp = TestClient(app).post("/api/quick-digest/generate")
    assert resp.status_code == 500 and "no sources" in resp.json()["detail"]
