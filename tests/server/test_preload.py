"""Model warm-up goes through the Nova server, not straight from the browser."""

from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from nova.server.app import create_app


def _client(tmp_path, monkeypatch, engine_id: str) -> TestClient:
    monkeypatch.setenv("NOVA_HOME", str(tmp_path / "home"))
    engine = SimpleNamespace(engine_id=engine_id, health=lambda: True)
    return TestClient(create_app(engine, "fake"))


def test_models_of_other_engines_are_skipped(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch, "claude_cli")

    response = client.post("/v1/models/preload", json={"model": "sonnet"})

    assert response.status_code == 200
    assert response.json()["status"] == "skipped"


def test_model_name_is_required(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch, "ollama")

    assert client.post("/v1/models/preload", json={}).status_code == 400


def test_unreachable_ollama_is_a_clear_error(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch, "ollama")
    client.app.state.config = SimpleNamespace(
        engine=SimpleNamespace(ollama=SimpleNamespace(host="http://127.0.0.1:9"))
    )

    response = client.post("/v1/models/preload", json={"model": "qwen3.5:2b"})

    assert response.status_code == 502
    assert "Ollama unreachable" in response.json()["detail"]
