"""The Horizon Computer widget: the numbers it reports and how it ranks programs."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.server import widgets_router
from phibe.server.widgets_router import rank, rate


def test_rate_is_bytes_per_second_and_never_negative() -> None:
    assert rate(1_000, 3_000, 2.0) == 1_000
    assert rate(5_000, 100, 1.0) == 0  # the counter restarted
    assert rate(0, 100, 0) == 0.0  # no time has passed


def test_rank_counts_a_program_with_many_processes_once() -> None:
    rows = [("chrome.exe", 5.0, 400), ("chrome.exe", 4.0, 600), ("code.exe", 7.0, 300), ("tiny.exe", 0.1, 10)]
    ranked = rank(rows)
    assert ranked["by_cpu"][0] == {"name": "chrome.exe", "cpu": 9.0, "memory": 1000}
    assert [p["name"] for p in ranked["by_memory"]][:2] == ["chrome.exe", "code.exe"]
    many = rank([(f"p{i}", float(i), i) for i in range(20)])
    assert len(many["by_cpu"]) == widgets_router.TOP


def test_computer_reports_every_section() -> None:
    app = FastAPI()
    app.include_router(widgets_router.router)
    body = TestClient(app).get("/v1/widgets/computer").json()
    assert {"os", "cpu", "memory", "gpus", "disks", "network", "battery", "programs", "ollama", "phibe"} <= set(body)
    assert body["cpu"]["threads"] >= 1 and len(body["cpu"]["each"]) == body["cpu"]["threads"]
    assert 0 < body["memory"]["used"] <= body["memory"]["total"]
    assert body["disks"] and all(d["used"] <= d["total"] for d in body["disks"])
    assert body["network"]["down"] >= 0 and body["network"]["up"] >= 0
    assert isinstance(body["ollama"]["running"], bool)
