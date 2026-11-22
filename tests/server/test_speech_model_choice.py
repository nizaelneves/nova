from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.server.api_routes import speech_router


def test_the_voice_model_can_be_picked_and_is_remembered(tmp_path, monkeypatch) -> None:
    cfg = tmp_path / "config.toml"
    monkeypatch.setenv("PHIBE_CONFIG", str(cfg))
    backend = SimpleNamespace(_model_size="base", reload=lambda: None)
    app = FastAPI()
    app.include_router(speech_router)
    app.state.speech_backend = backend
    c = TestClient(app)
    r = c.put("/v1/speech/model", json={"model": "small"})
    assert r.status_code == 200 and r.json()["model"] == "small" and backend._model_size == "small"
    assert 'model = "small"' in cfg.read_text(encoding="utf-8")
    assert c.put("/v1/speech/model", json={"model": "huge"}).status_code == 422
