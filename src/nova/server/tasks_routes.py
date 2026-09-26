"""HTTP routes for tasks and areas: ``/api/tasks/*``."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from nova.tasks.store import AreaNotEmpty, NotFound, TaskError, TaskStore

Priority = Literal["high", "medium", "low"]
Status = Literal["todo", "doing", "done"]


class RecurrenceBody(BaseModel):
    freq: Literal["daily", "weekly", "monthly", "yearly"]
    interval: int = 1
    weekdays: Optional[List[int]] = None
    until: Optional[str] = None
    count: Optional[int] = None


class TaskCreate(BaseModel):
    title: str
    due: str
    all_day: bool
    area_id: Optional[str] = None
    priority: Optional[Priority] = None
    status: Status = "todo"
    notes: str = ""
    recurrence: Optional[RecurrenceBody] = None


class TaskUpdate(BaseModel):
    """Only the fields sent are changed; send ``null`` to clear one."""

    title: Optional[str] = None
    notes: Optional[str] = None
    area_id: Optional[str] = None
    due: Optional[str] = None
    all_day: Optional[bool] = None
    priority: Optional[Priority] = None
    status: Optional[Status] = None
    recurrence: Optional[RecurrenceBody] = None


class StatusBody(BaseModel):
    status: Status


class AreaBody(BaseModel):
    name: str


def _rule(body: Optional[RecurrenceBody]) -> Optional[Dict[str, Any]]:
    return body.model_dump(exclude_none=True) if body else None


def create_tasks_router(get_store: Callable[[], TaskStore]) -> APIRouter:
    """Build the router; *get_store* returns the shared :class:`TaskStore`."""
    router = APIRouter(prefix="/api/tasks", tags=["tasks"])

    def guarded(action: Callable[[], Any]) -> Any:
        try:
            return action()
        except AreaNotEmpty as exc:
            raise HTTPException(
                status_code=409,
                detail={"message": str(exc), "task_count": exc.count},
            ) from exc
        except NotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except TaskError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    # -- areas (fixed paths first so they are not read as a task id) --------

    @router.get("/areas")
    def list_areas() -> Dict[str, Any]:
        return {"areas": get_store().list_areas()}

    @router.post("/areas", status_code=201)
    def create_area(body: AreaBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().create_area(body.name))

    @router.patch("/areas/{area_id}")
    def rename_area(area_id: str, body: AreaBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().rename_area(area_id, body.name))

    @router.delete("/areas/{area_id}", status_code=204)
    def delete_area(area_id: str, move_to: Optional[str] = None) -> None:
        guarded(lambda: get_store().delete_area(area_id, move_to))

    # -- views --------------------------------------------------------------

    @router.get("/kanban")
    def kanban(area_id: Optional[str] = None) -> Dict[str, Any]:
        return {"columns": guarded(lambda: get_store().kanban(area_id=area_id))}

    @router.get("/summary")
    def summary() -> Dict[str, int]:
        return get_store().summary()

    # -- tasks --------------------------------------------------------------

    @router.get("")
    def list_tasks(
        view: Literal["all", "today", "upcoming", "overdue"] = "all",
        area_id: Optional[str] = None,
        status: Optional[Status] = None,
        upcoming_days: int = 7,
    ) -> Dict[str, Any]:
        tasks = guarded(
            lambda: get_store().list_tasks(
                view=view,
                area_id=area_id,
                status=status,
                upcoming_days=upcoming_days,
            )
        )
        return {"tasks": tasks}

    @router.post("", status_code=201)
    def create_task(body: TaskCreate) -> Dict[str, Any]:
        return guarded(
            lambda: get_store().create_task(
                title=body.title,
                due=body.due,
                all_day=body.all_day,
                area_id=body.area_id,
                priority=body.priority,
                status=body.status,
                notes=body.notes,
                recurrence=_rule(body.recurrence),
            )
        )

    @router.get("/{task_id}")
    def get_task(task_id: str) -> Dict[str, Any]:
        return guarded(lambda: get_store().get_task(task_id))

    @router.patch("/{task_id}")
    def update_task(task_id: str, body: TaskUpdate) -> Dict[str, Any]:
        changes = body.model_dump(exclude_unset=True)
        if "recurrence" in changes:
            changes["recurrence"] = _rule(body.recurrence)
        return guarded(lambda: get_store().update_task(task_id, **changes))

    @router.post("/{task_id}/status")
    def move_task(task_id: str, body: StatusBody) -> Dict[str, Any]:
        return guarded(lambda: get_store().set_status(task_id, body.status))

    @router.delete("/{task_id}", status_code=204)
    def delete_task(task_id: str) -> None:
        guarded(lambda: get_store().delete_task(task_id))

    return router


def get_shared_store(app: Any) -> TaskStore:
    """Open the tasks database on first use and keep it on ``app.state``."""
    store = getattr(app.state, "task_store", None)
    if store is None:
        from nova.core.paths import get_data_dir

        folder = get_data_dir()
        folder.mkdir(parents=True, exist_ok=True)
        store = TaskStore(folder / "tasks.db")
        app.state.task_store = store
    return store
