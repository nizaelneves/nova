"""``/v1/chat-sources``: whether the chat may read the user's connected sources (auto, always, off)."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException


def create_chat_sources_router() -> APIRouter:
    from phibe.connectors import chat_sources

    router = APIRouter(prefix="/v1/chat-sources", tags=["chat"])

    @router.get("")
    async def get_mode() -> Dict[str, Any]:
        return {"mode": chat_sources.get_mode(), "modes": list(chat_sources.MODES)}

    @router.put("")
    async def put_mode(body: Dict[str, Any]) -> Dict[str, Any]:
        try:
            mode = chat_sources.set_mode(str(body.get("mode", "")))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        return {"mode": mode, "modes": list(chat_sources.MODES)}

    return router
