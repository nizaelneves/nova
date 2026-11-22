"""HTTP routes for workspace boards: ``/api/boards/*``."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Literal, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from phibe.boards.store import BoardError, BoardStore, NotFound
from phibe.tasks.store import TaskStore


MAX_FILE_BYTES = 25 * 1024 * 1024


class BoardCreate(BaseModel):
    workspace_id: str
    name: str
    #: Copy the workspace's existing tasks into the new board.
    import_tasks: bool = False


class NameBody(BaseModel):
    name: str


class PropertyCreate(BaseModel):
    name: str
    type: str
    options: List[Dict[str, Any]] = []


class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    options: Optional[List[Dict[str, Any]]] = None


class ItemCreate(BaseModel):
    title: str
    parent_id: Optional[str] = None
    description: str = ""
    values: Dict[str, Any] = {}


class RepeatBody(BaseModel):
    freq: Literal["daily", "weekly", "monthly", "yearly"]
    interval: int = 1
    weekdays: Optional[List[int]] = None
    until: Optional[str] = None
    count: Optional[int] = None
    #: The date property the rule follows (default: the first one).
    prop: Optional[str] = None


class ItemUpdate(BaseModel):
    """Only the fields sent are changed; send ``recurrence: null`` to stop repeating."""

    title: Optional[str] = None
    description: Optional[str] = None
    values: Optional[Dict[str, Any]] = None
    recurrence: Optional[RepeatBody] = None


class CommentBody(BaseModel):
    body: str


class ViewCreate(BaseModel):
    name: str
    type: str
    config: Dict[str, Any] = {}


class ViewUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


def create_boards_router(
    get_store: Callable[[], BoardStore], get_tasks: Callable[[], TaskStore]
) -> APIRouter:
    router = APIRouter(prefix="/api/boards", tags=["boards"])

    def guarded(action: Callable[[], Any]) -> Any:
        try:
            return action()
        except NotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except BoardError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    def legacy_tasks(workspace_id: str) -> List[Dict[str, Any]]:
        tasks = get_tasks().list_tasks()
        if workspace_id == "me":
            return [t for t in tasks if not t["area_id"]]
        return [t for t in tasks if t["area_id"] == workspace_id]

    @router.get("")
    def list_boards(workspace_id: str) -> Dict[str, Any]:
        return {"boards": get_store().list_boards(workspace_id)}

    @router.post("", status_code=201)
    def create_board(body: BoardCreate) -> Dict[str, Any]:
        return guarded(
            lambda: get_store().create_board(
                body.workspace_id,
                body.name,
                legacy_tasks(body.workspace_id) if body.import_tasks else None,
            )
        )

    @router.get("/{board_id}")
    def get_board(board_id: str) -> Dict[str, Any]:
        return guarded(lambda: get_store().get_board(board_id))

    @router.patch("/{board_id}")
    def rename_board(board_id: str, body: NameBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().rename_board(board_id, body.name))

    @router.delete("/{board_id}", status_code=204)
    def delete_board(board_id: str) -> None:
        guarded(lambda: get_store().delete_board(board_id))

    # -- properties ----------------------------------------------------------

    @router.post("/{board_id}/properties", status_code=201)
    def create_property(board_id: str, body: PropertyCreate) -> Dict[str, Any]:
        return guarded(lambda: get_store().create_property(board_id, body.name, body.type, body.options))

    @router.patch("/properties/{property_id}")
    def update_property(property_id: str, body: PropertyUpdate) -> Dict[str, Any]:
        return guarded(lambda: get_store().update_property(property_id, **body.model_dump(exclude_unset=True)))

    @router.delete("/properties/{property_id}", status_code=204)
    def delete_property(property_id: str) -> None:
        guarded(lambda: get_store().delete_property(property_id))

    # -- items ---------------------------------------------------------------

    @router.post("/{board_id}/items", status_code=201)
    def create_item(board_id: str, body: ItemCreate) -> Dict[str, Any]:
        return guarded(
            lambda: get_store().create_item(
                board_id, body.title, body.parent_id, body.description, body.values
            )
        )

    @router.patch("/items/{item_id}")
    def update_item(item_id: str, body: ItemUpdate) -> Dict[str, Any]:
        changes = body.model_dump(exclude_unset=True)
        if changes.get("recurrence"):
            changes["recurrence"] = body.recurrence.model_dump(exclude_none=True)  # type: ignore[union-attr]
        return guarded(lambda: get_store().update_item(item_id, **changes))

    @router.delete("/items/{item_id}", status_code=204)
    def delete_item(item_id: str) -> None:
        guarded(lambda: get_store().delete_item(item_id))

    @router.get("/items/{item_id}/comments")
    def list_comments(item_id: str) -> Dict[str, Any]:
        return {"comments": guarded(lambda: get_store().list_comments(item_id))}

    @router.post("/items/{item_id}/comments", status_code=201)
    def add_comment(item_id: str, body: CommentBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().add_comment(item_id, body.body))

    @router.delete("/comments/{comment_id}", status_code=204)
    def delete_comment(comment_id: str) -> None:
        guarded(lambda: get_store().delete_comment(comment_id))

    # -- files and history ---------------------------------------------------

    @router.get("/items/{item_id}/files")
    def list_files(item_id: str) -> Dict[str, Any]:
        return {"files": guarded(lambda: get_store().list_attachments(item_id))}

    @router.post("/items/{item_id}/files", status_code=201)
    async def add_file(item_id: str, file: UploadFile = File(...)) -> Dict[str, Any]:
        data = await file.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail="Files can be at most 25 MB")
        return guarded(lambda: get_store().add_attachment(item_id, file.filename or "file", data))

    @router.get("/files/{file_id}")
    def download_file(file_id: str) -> FileResponse:
        name, path = guarded(lambda: get_store().attachment_file(file_id))
        return FileResponse(path, filename=name)

    @router.delete("/files/{file_id}", status_code=204)
    def delete_file(file_id: str) -> None:
        guarded(lambda: get_store().delete_attachment(file_id))

    @router.get("/{board_id}/files")
    def board_files(board_id: str) -> Dict[str, Any]:
        return {"files": guarded(lambda: get_store().board_files(board_id))}

    @router.get("/items/{item_id}/activity")
    def activity(item_id: str) -> Dict[str, Any]:
        return {"activity": guarded(lambda: get_store().list_activity(item_id))}

    # -- views ---------------------------------------------------------------

    @router.post("/{board_id}/views", status_code=201)
    def create_view(board_id: str, body: ViewCreate) -> Dict[str, Any]:
        return guarded(lambda: get_store().create_view(board_id, body.name, body.type, body.config))

    @router.patch("/views/{view_id}")
    def update_view(view_id: str, body: ViewUpdate) -> Dict[str, Any]:
        return guarded(lambda: get_store().update_view(view_id, **body.model_dump(exclude_unset=True)))

    @router.delete("/views/{view_id}", status_code=204)
    def delete_view(view_id: str) -> None:
        guarded(lambda: get_store().delete_view(view_id))

    return router


def get_shared_board_store(app: Any) -> BoardStore:
    """Open the boards database on first use and keep it on ``app.state``."""
    store = getattr(app.state, "board_store", None)
    if store is None:
        from phibe.core.paths import get_data_dir

        folder = get_data_dir()
        folder.mkdir(parents=True, exist_ok=True)
        from phibe.tasks.recurrence import next_due, validate_rule

        def next_date(day: Any, rule: Dict[str, Any], occurrences: int) -> Any:
            return next_due(day, rule, occurrences_so_far=occurrences)

        store = BoardStore(
            folder / "boards.db", files_dir=folder / "board_files", next_date=next_date, clean_rule=validate_rule
        )
        app.state.board_store = store
    return store
