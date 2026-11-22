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
    "gdrive": [{"title": "A new database", "text": "Launched today."}],
    "slack": [{"title": "Note 1", "text": "a"}, {"title": "Note 2", "text": "b"}],
}


def _client(tmp_path, items=ITEMS, engine=None):
    app = FastAPI()
    app.include_router(create_quick_digest_router(lambda: engine or FakeEngine(), lambda: "m:1", path=tmp_path / "d.json", collect=lambda: items))
    return TestClient(app)


def test_builds_a_section_per_source_and_a_headline() -> None:
    d = build_digest(FakeEngine(), "m:1", ITEMS)
    assert list(d["sections"]) == ["gdrive", "slack"]
    assert d["sections"]["gdrive"] == "gdrive has news."  # thinking tags and markdown are gone
    assert d["text"] == "3 New Items From 2 Sources\nBoth sources moved today."
    assert d["sources_used"] == ["gdrive", "slack"] and d["model_used"] == "m:1"


def test_every_item_becomes_a_small_block_without_asking_the_model() -> None:
    items = {"news_rss": [{"title": "A new database", "text": "Launched today. It is fast.", "url": "https://x.dev", "time": "2026-10-20T09:00:00", "origin": "Sandeco"}]}
    d = build_digest(FakeEngine(), "m:1", items)
    assert d["items"] == [{
        "source": "news_rss", "source_name": "news_rss", "kind": "rss", "title": "A new database",
        "summary": "Launched today.", "text": "Launched today. It is fast.", "url": "https://x.dev", "time": "2026-10-20T09:00:00",
        "origin": "Sandeco",
    }]
    untitled = build_digest(FakeEngine(), "m:1", {"gmail": [{"title": "", "text": "Weekly news. More below."}]})["items"][0]
    assert (untitled["title"], untitled["kind"]) == ("Weekly news.", "mail")


def test_skips_a_source_the_model_fails_on_and_says_so_when_nothing_is_left() -> None:
    d = build_digest(FakeEngine(fail_on="slack"), "m:1", ITEMS)
    assert list(d["sections"]) == ["gdrive"]
    assert d["text"].startswith("1 New Item From 1 Source")
    empty = build_digest(FakeEngine(), "m:1", {})
    assert empty["sections"] == {} and empty["text"].startswith("Nothing new in your sources.")


def test_there_is_no_digest_until_one_is_written_and_then_the_last_one_is_kept(tmp_path) -> None:
    client = _client(tmp_path)
    assert client.get("/api/quick-digest").status_code == 404
    written = client.post("/api/quick-digest/generate").json()
    assert written["sections"]["slack"] == "slack has news."
    assert client.get("/api/quick-digest").json() == written


def test_a_failing_collection_is_reported_not_swallowed(tmp_path) -> None:
    def boom():
        raise RuntimeError("no sources")

    app = FastAPI()
    app.include_router(create_quick_digest_router(lambda: FakeEngine(), lambda: "m", path=tmp_path / "d.json", collect=boom))
    resp = TestClient(app).post("/api/quick-digest/generate")
    assert resp.status_code == 500 and "no sources" in resp.json()["detail"]


def test_reading_one_source_again_keeps_the_others(tmp_path) -> None:
    from phibe.server.quick_digest_routes import merge_source

    first = build_digest(FakeEngine(), "m:1", ITEMS)
    again = merge_source(first, "slack", [{"title": "Note 3", "text": "c"}])
    assert [v["title"] for v in again["items"]] == ["Note 3", "A new database"]
    assert again["text"].startswith("2 New Items From 2 Sources")
    gone = merge_source(again, "gdrive", [])
    assert [v["source"] for v in gone["items"]] == ["slack"] and "gdrive" not in gone["sections"]
    assert merge_source(None, "gmail", [])["text"].startswith("Nothing new")


def test_each_source_refreshes_on_its_own_rhythm() -> None:
    import threading
    import time

    from phibe.connectors.sync_settings import SyncSettings
    from phibe.server.quick_digest_routes import start_digest_refresh

    ran: list = []
    settings = SyncSettings(interval_minutes=600, intervals={"news_rss": 1}, disabled_connectors=["slack"])
    stop = threading.Event()
    start_digest_refresh(
        ran.append, sources=lambda: ["news_rss", "gmail", "slack"], get_settings=lambda: settings,
        first_delay=0.0, tick=0.01, seconds_per_minute=0.05, stop=stop,
    )
    time.sleep(0.5)
    stop.set()
    assert ran.count("news_rss") >= 3  # every 0.05 s
    assert ran.count("gmail") == 1  # read once, then its 600 minutes are far away
    assert "slack" not in ran
