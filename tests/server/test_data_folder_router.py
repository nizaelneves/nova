"""The Data settings show where Phi keeps its files and can open that folder."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phi.server import data_folder_router as mod


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setenv("PHI_HOME", str(tmp_path))
    opened = []
    monkeypatch.setattr(mod, "_open_folder", lambda path: opened.append(path))
    monkeypatch.setattr(mod, "_is_local_request", lambda request: True)
    app = FastAPI()
    app.include_router(mod.create_data_folder_router())
    return TestClient(app), opened, tmp_path


def test_it_reports_the_folder(setup) -> None:
    client, _, home = setup
    assert client.get("/v1/data-folder").json() == {"path": str(home), "exists": True}


def test_it_opens_exactly_that_folder(setup) -> None:
    client, opened, home = setup
    assert client.post("/v1/data-folder/open").status_code == 200
    assert opened == [home]


def test_it_refuses_requests_from_other_computers(setup, monkeypatch) -> None:
    client, opened, _ = setup
    monkeypatch.setattr(mod, "_is_local_request", lambda request: False)
    assert client.post("/v1/data-folder/open").status_code == 403
    assert opened == []


def test_a_missing_folder_is_a_404(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PHI_HOME", str(tmp_path / "not-there"))
    monkeypatch.setattr(mod, "_is_local_request", lambda request: True)
    app = FastAPI()
    app.include_router(mod.create_data_folder_router())
    assert TestClient(app).post("/v1/data-folder/open").status_code == 404
