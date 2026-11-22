"""Boards API: workspaces, properties, items, sub-items, comments, views."""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from phibe.boards.store import BoardStore
from phibe.server.boards_routes import create_boards_router
from phibe.tasks.recurrence import next_due, validate_rule
from phibe.tasks.store import TaskStore


@pytest.fixture
def client(tmp_path):
    now = lambda: datetime(2026, 11, 2, 12, 0)  # noqa: E731
    boards = BoardStore(
        tmp_path / "b.db", files_dir=tmp_path / "files", clean_rule=validate_rule,
        next_date=lambda day, rule, n: next_due(day, rule, occurrences_so_far=n), now=now,
    )
    tasks = TaskStore(tmp_path / "t.db", now=now)
    app = FastAPI()
    app.include_router(create_boards_router(lambda: boards, lambda: tasks))
    app.state.tasks = tasks
    yield TestClient(app)
    boards.close()
    tasks.close()


def _board(client, **over):
    response = client.post("/api/boards", json={"workspace_id": "w1", "name": "Q4", **over})
    assert response.status_code == 201, response.text
    return response.json()


def _props(client, board_id):
    return {p["name"]: p for p in client.get(f"/api/boards/{board_id}").json()["properties"]}


def test_new_board_has_default_properties_and_a_table_view(client) -> None:
    board = client.get(f"/api/boards/{_board(client)['id']}").json()
    assert [p["name"] for p in board["properties"]] == ["Responsável", "Status", "Prioridade", "Deadline", "Tags"]
    assert [o["label"] for o in board["properties"][1]["options"]] == ["To-Do", "Em Andamento", "Concluído", "Cancelado"]
    assert [v["type"] for v in board["views"]] == ["table"]
    assert client.get("/api/boards", params={"workspace_id": "w1"}).json()["boards"][0]["name"] == "Q4"


def test_items_values_subitems_and_cleanup(client) -> None:
    board = _board(client)
    bid, props = board["id"], _props(client, board["id"])
    owner = client.post(f"/api/boards/{bid}/properties", json={"name": "Horas", "type": "number"}).json()
    item = client.post(f"/api/boards/{bid}/items", json={"title": "Pauta", "values": {owner["id"]: 3}}).json()
    sub = client.post(f"/api/boards/{bid}/items", json={"title": "Rascunho", "parent_id": item["id"]}).json()
    assert sub["parent_id"] == item["id"]
    # Sub-items cannot nest, and values must belong to the board.
    assert client.post(f"/api/boards/{bid}/items", json={"title": "x", "parent_id": sub["id"]}).status_code == 422
    assert client.patch(f"/api/boards/items/{item['id']}", json={"values": {"nope": 1}}).status_code == 422
    done = client.patch(f"/api/boards/items/{item['id']}", json={"values": {props["Status"]["id"]: "done", owner["id"]: None}}).json()
    assert done["values"] == {props["Status"]["id"]: "done"}
    # Deleting a property drops its values; deleting an item drops its sub-items.
    client.delete(f"/api/boards/properties/{props['Status']['id']}")
    assert client.get(f"/api/boards/{bid}").json()["items"][0]["values"] == {}
    client.delete(f"/api/boards/items/{item['id']}")
    assert client.get(f"/api/boards/{bid}").json()["items"] == []


def test_comments_and_views(client) -> None:
    board = _board(client)
    bid, view = board["id"], client.get(f"/api/boards/{board['id']}").json()["views"][0]
    item = client.post(f"/api/boards/{bid}/items", json={"title": "A"}).json()
    comment = client.post(f"/api/boards/items/{item['id']}/comments", json={"body": "ok"}).json()
    assert client.get(f"/api/boards/items/{item['id']}/comments").json()["comments"][0]["body"] == "ok"
    client.delete(f"/api/boards/comments/{comment['id']}")
    assert client.get(f"/api/boards/items/{item['id']}/comments").json()["comments"] == []
    assert client.post(f"/api/boards/items/{item['id']}/comments", json={"body": " "}).status_code == 422
    kanban = client.post(f"/api/boards/{bid}/views", json={"name": "Kanban", "type": "kanban"}).json()
    client.patch(f"/api/boards/views/{kanban['id']}", json={"config": {"filters": [1]}})
    assert client.get(f"/api/boards/{bid}").json()["views"][1]["config"] == {"filters": [1]}
    client.delete(f"/api/boards/views/{kanban['id']}")
    assert client.delete(f"/api/boards/views/{view['id']}").status_code == 422  # last view stays


def test_existing_tasks_are_copied_into_the_first_board(client) -> None:
    tasks = client.app.state.tasks
    area = tasks.create_area("Acme")
    tasks.create_task(title="Antiga", due="2026-11-05", all_day=True, area_id=area["id"], priority="high", status="doing", notes="n")
    tasks.create_task(title="Pessoal", due="2026-11-06", all_day=True)
    board = _board(client, workspace_id=area["id"], import_tasks=True)
    data = client.get(f"/api/boards/{board['id']}").json()
    props = {p["name"]: p["id"] for p in data["properties"]}
    [item] = data["items"]
    assert item["title"] == "Antiga" and item["description"] == "n"
    assert item["values"] == {props["Status"]: "doing", props["Prioridade"]: "high", props["Deadline"]: "2026-11-05"}


def test_a_repeating_item_creates_the_next_one_when_it_is_done(client) -> None:
    bid = _board(client)["id"]
    props = _props(client, bid)
    status, deadline = props["Status"]["id"], props["Deadline"]["id"]
    item = client.post(f"/api/boards/{bid}/items", json={"title": "Relatório", "values": {status: "todo", deadline: "2026-11-02"}}).json()
    client.post(f"/api/boards/{bid}/items", json={"title": "Revisar", "parent_id": item["id"], "values": {status: "done"}})
    rule = {"freq": "weekly", "weekdays": [0]}  # Mondays
    assert client.patch(f"/api/boards/items/{item['id']}", json={"recurrence": rule}).json()["recurrence"]["prop"] == deadline
    client.patch(f"/api/boards/items/{item['id']}", json={"values": {status: "doing"}})
    assert len(client.get(f"/api/boards/{bid}").json()["items"]) == 2  # nothing yet
    client.patch(f"/api/boards/items/{item['id']}", json={"values": {status: "done"}})
    client.patch(f"/api/boards/items/{item['id']}", json={"values": {status: "done", deadline: "2026-11-02"}})  # no second copy
    items = client.get(f"/api/boards/{bid}").json()["items"]
    [nxt] = [i for i in items if i["id"] != item["id"] and not i["parent_id"]]
    assert nxt["values"] == {status: "todo", deadline: "2026-11-09"} and nxt["recurrence"]["freq"] == "weekly"
    [sub] = [i for i in items if i["parent_id"] == nxt["id"]]
    assert sub["title"] == "Revisar" and sub["values"][status] == "todo"
    # Stopping the rule, and a rule needs a valid frequency.
    assert client.patch(f"/api/boards/items/{nxt['id']}", json={"recurrence": None}).json()["recurrence"] is None
    assert client.patch(f"/api/boards/items/{nxt['id']}", json={"recurrence": {"freq": "weekly", "interval": 0}}).status_code == 422


def test_files_and_activity(client) -> None:
    bid = _board(client)["id"]
    status = _props(client, bid)["Status"]["id"]
    item = client.post(f"/api/boards/{bid}/items", json={"title": "A"}).json()
    sent = client.post(f"/api/boards/items/{item['id']}/files", files={"file": ("../brief.txt", b"hello")})
    assert sent.status_code == 201 and sent.json()["name"] == "brief.txt"
    fid = sent.json()["id"]
    assert client.get(f"/api/boards/files/{fid}").content == b"hello"
    client.patch(f"/api/boards/items/{item['id']}", json={"title": "B", "values": {status: "doing"}})
    texts = [a["text"] for a in client.get(f"/api/boards/items/{item['id']}/activity").json()["activity"]]
    assert texts[0] == "Status: empty → Em Andamento" and "File added: brief.txt" in texts and 'Renamed to "B"' in texts
    assert [f["item_title"] for f in client.get(f"/api/boards/{bid}/files").json()["files"]] == ["B"]
    assert client.delete(f"/api/boards/files/{fid}").status_code == 204
    assert client.get(f"/api/boards/files/{fid}").status_code == 404
