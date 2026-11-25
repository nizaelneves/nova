from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.server.inference_source import router


def _client(tmp_path, monkeypatch, text: str = ""):
    cfg = tmp_path / "config.toml"
    if text:
        cfg.write_text(text, encoding="utf-8")
    monkeypatch.setenv("PHIBE_CONFIG", str(cfg))
    app = FastAPI()
    app.include_router(router)
    return TestClient(app), cfg


def test_a_custom_source_is_saved_in_the_config_and_read_back(tmp_path, monkeypatch) -> None:
    c, cfg = _client(tmp_path, monkeypatch, '# keep me\n[engine]\ndefault = "ollama"\n\n[intelligence]\ndefault_model = "qwen3.5:4b"\n')
    assert c.get("/v1/inference/source").json() == {"kind": "ollama"}
    r = c.put("/v1/inference/source", json={"kind": "custom", "engine": "lmstudio", "host": "http://localhost:1234/v1/", "model": "qwen2.5-7b-instruct"})
    assert r.json() == {"kind": "custom", "engine": "lmstudio", "host": "http://localhost:1234", "model": "qwen2.5-7b-instruct"}
    text = cfg.read_text(encoding="utf-8")
    assert "# keep me" in text and 'default = "lmstudio"' in text and 'host = "http://localhost:1234"' in text
    assert c.put("/v1/inference/source", json={"kind": "ollama"}).json() == {"kind": "ollama"}
    assert 'default = "ollama"' in cfg.read_text(encoding="utf-8")


def test_a_bad_custom_source_is_refused_and_nothing_is_written(tmp_path, monkeypatch) -> None:
    c, cfg = _client(tmp_path, monkeypatch)
    ok = {"kind": "custom", "engine": "vllm", "host": "http://localhost:8000", "model": "m"}
    assert c.put("/v1/inference/source", json={**ok, "engine": "rm -rf"}).status_code == 422
    assert c.put("/v1/inference/source", json={**ok, "host": "file:///etc/passwd"}).status_code == 422
    assert c.put("/v1/inference/source", json={**ok, "host": ""}).status_code == 422
    assert c.put("/v1/inference/source", json={**ok, "model": ""}).status_code == 422
    assert c.put("/v1/inference/source", json={**ok, "model": 'x"\nengine = "y'}).status_code == 422
    assert not cfg.exists()
