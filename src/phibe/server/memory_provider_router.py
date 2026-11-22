"""``/v1/memory-provider``: where Phibe keeps what it knows about the user (local files or Mem0)."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request


def create_memory_provider_router() -> APIRouter:
    from phibe.connectors import memory_provider as mp

    router = APIRouter(prefix="/v1/memory-provider", tags=["memory"])

    def state() -> Dict[str, Any]:
        return {"mode": mp.get_mode(), "modes": list(mp.MODES), "has_key": mp.has_key(), "installed": mp.sdk_installed()}

    @router.get("")
    async def get_state() -> Dict[str, Any]:
        return state()

    @router.put("")
    async def put_state(body: Dict[str, Any], request: Request) -> Dict[str, Any]:
        try:
            mp.set_mode(str(body.get("mode", "")))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        builder = getattr(getattr(request.app.state, "agent", None), "_prompt_builder", None)
        if builder is not None:
            builder.reload()  # USER.md enters or leaves the prompt on the next message
        return state()

    return router
