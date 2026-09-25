"""Webhook endpoints for receiving messages from external platforms."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
from typing import Any

from fastapi import APIRouter, Request, Response
from starlette.responses import PlainTextResponse

logger = logging.getLogger(__name__)


def _log_task_exception(task: asyncio.Task) -> None:
    """Log exceptions from background message handling tasks."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error(
            "Background message handling failed: %s",
            exc,
            exc_info=exc,
        )


def create_webhook_router(
    bridge: Any,
    whatsapp_verify_token: str = "",
    whatsapp_app_secret: str = "",
) -> APIRouter:
    """Create a FastAPI router with webhook endpoints.

    Args:
        bridge: ChannelBridge instance for routing messages.
        whatsapp_verify_token: WhatsApp verification token.
        whatsapp_app_secret: WhatsApp app secret for HMAC.
    """
    router = APIRouter(prefix="/webhooks", tags=["webhooks"])

    # ----------------------------------------------------------
    # WhatsApp Cloud API
    # ----------------------------------------------------------

    @router.get("/whatsapp")
    async def whatsapp_verify(request: Request) -> Response:
        mode = request.query_params.get("hub.mode", "")
        token = request.query_params.get("hub.verify_token", "")
        challenge = request.query_params.get("hub.challenge", "")

        # Fail closed: never echo the challenge if no verify token is set,
        # otherwise an empty token would match an empty query value.
        if not whatsapp_verify_token:
            return Response("Forbidden", status_code=403)
        if mode == "subscribe" and hmac.compare_digest(token, whatsapp_verify_token):
            return PlainTextResponse(challenge)
        return Response("Forbidden", status_code=403)

    @router.post("/whatsapp")
    async def whatsapp_incoming(
        request: Request,
    ) -> Response:
        body_bytes = await request.body()

        # Fail closed: reject when no app secret is configured to verify HMAC.
        if not whatsapp_app_secret:
            logger.error("WhatsApp webhook rejected: app secret not configured.")
            return Response("Webhook signature verification not configured", 403)
        signature = request.headers.get("X-Hub-Signature-256", "")
        expected = (
            "sha256="
            + hmac.new(
                whatsapp_app_secret.encode(),
                body_bytes,
                hashlib.sha256,
            ).hexdigest()
        )
        if not hmac.compare_digest(signature, expected):
            return Response("Invalid signature", status_code=403)

        payload = json.loads(body_bytes)
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for message in value.get("messages", []):
                    if message.get("type") != "text":
                        continue
                    sender = message.get("from", "")
                    text = message.get("text", {}).get("body", "")

                    task = asyncio.create_task(
                        asyncio.to_thread(
                            bridge.handle_incoming,
                            sender,
                            text,
                            "whatsapp",
                        )
                    )
                    task.add_done_callback(_log_task_exception)

        return Response("OK", status_code=200)

    return router
