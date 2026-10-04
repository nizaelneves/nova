"""HTTP routes for Pings: ``/v1/pings/*``."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from phi.pings.settings import (
    PingsSettingsError,
    load_pings_settings,
    save_pings_settings,
    validate as validate_settings,
)
from phi.pings.store import DEFAULT_SNOOZE_MINUTES, NotFound, PingError, PingStore

Priority = Literal["high", "medium", "low"]
RepeatType = Literal["none", "weekly", "monthly"]


class PingCreate(BaseModel):
    text: str
    date: str
    time: str
    priority: Priority = "medium"
    repeat_type: RepeatType = "none"
    repeat_interval: int = 1
    repeat_days_of_week: List[int] = []


class PingUpdate(BaseModel):
    """Only the fields sent are changed."""

    text: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    priority: Optional[Priority] = None
    repeat_type: Optional[RepeatType] = None
    repeat_interval: Optional[int] = None
    repeat_days_of_week: Optional[List[int]] = None


class SnoozeBody(BaseModel):
    minutes: int = DEFAULT_SNOOZE_MINUTES


def create_pings_router(get_store: Callable[[], PingStore]) -> APIRouter:
    """Build the router; *get_store* returns the shared :class:`PingStore`."""
    router = APIRouter(prefix="/v1/pings", tags=["pings"])

    def guarded(action: Callable[[], Any]) -> Any:
        try:
            return action()
        except NotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PingError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    # -- settings (fixed path, registered before "/{ping_id}" routes) -------

    @router.get("/settings")
    def get_settings() -> Dict[str, Any]:
        return load_pings_settings().to_dict()

    @router.put("/settings")
    def put_settings(body: Dict[str, Any]) -> Dict[str, Any]:
        try:
            settings = validate_settings({**load_pings_settings().to_dict(), **body})
        except PingsSettingsError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        save_pings_settings(settings)
        return settings.to_dict()

    # -- pings ----------------------------------------------------------------

    @router.get("")
    def list_pings(upcoming: bool = False) -> Dict[str, Any]:
        return {"pings": get_store().list_pings(upcoming=upcoming)}

    @router.post("", status_code=201)
    def create_ping(body: PingCreate) -> Dict[str, Any]:
        return guarded(
            lambda: get_store().create_ping(
                text=body.text,
                date=body.date,
                time=body.time,
                priority=body.priority,
                repeat_type=body.repeat_type,
                repeat_interval=body.repeat_interval,
                repeat_days_of_week=body.repeat_days_of_week,
            )
        )

    @router.patch("/{ping_id}")
    def update_ping(ping_id: str, body: PingUpdate) -> Dict[str, Any]:
        changes = body.model_dump(exclude_unset=True)
        return guarded(lambda: get_store().update_ping(ping_id, **changes))

    @router.post("/{ping_id}/complete")
    def complete_ping(ping_id: str) -> Dict[str, Any]:
        return guarded(lambda: get_store().complete_ping(ping_id))

    @router.post("/{ping_id}/snooze")
    def snooze_ping(ping_id: str, body: Optional[SnoozeBody] = None) -> Dict[str, Any]:
        minutes = body.minutes if body is not None else DEFAULT_SNOOZE_MINUTES
        return guarded(lambda: get_store().snooze_ping(ping_id, minutes=minutes))

    @router.delete("/{ping_id}", status_code=204)
    def delete_ping(ping_id: str) -> None:
        guarded(lambda: get_store().delete_ping(ping_id))

    return router


def get_shared_ping_store(app: Any) -> PingStore:
    """Open the pings database on first use and keep it on ``app.state``."""
    store = getattr(app.state, "ping_store", None)
    if store is None:
        from phi.core.paths import get_data_dir

        folder = get_data_dir()
        folder.mkdir(parents=True, exist_ok=True)
        store = PingStore(folder / "pings.db")
        app.state.ping_store = store
    return store
