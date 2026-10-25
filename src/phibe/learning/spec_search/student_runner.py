"""Real student runner for spec-search experiments.

Replaces the ``MagicMock()`` in the experiment runner script with a
callable that actually invokes the student model via vLLM (or any
OpenAI-compatible engine) and returns structured results.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class StudentResult:
    """Result from running the student model on a task."""

    content: str
    score: float = 0.0
    trace_id: str = ""
    latency_seconds: float = 0.0
    tokens_used: int = 0


class VLLMStudentRunner:
    """Invoke the student model via a vLLM OpenAI-compatible endpoint.

    Parameters
    ----------
    host :
        vLLM server URL (e.g. ``http://localhost:8001``).
    model :
        Model name as registered in vLLM (e.g. ``Qwen/Qwen3.5-9B``).
    temperature :
        Sampling temperature.
    max_tokens :
        Max tokens for the student response.
    """

    def __init__(
        self,
        host: str = "http://localhost:8001",
        model: str = "Qwen/Qwen3.5-9B",
        temperature: float = 0.6,
        max_tokens: int = 4096,
    ) -> None:
        import httpx

        self._host = host.rstrip("/")
        self._model = model
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._client = httpx.Client(base_url=self._host, timeout=300.0)

    def __call__(
        self, query: str, session_id: str = "", **kwargs: Any
    ) -> StudentResult:
        """Run the student on *query* and return a StudentResult."""
        t0 = time.time()
        try:
            resp = self._client.post(
                "/v1/chat/completions",
                json={
                    "model": self._model,
                    "messages": [{"role": "user", "content": query}],
                    "temperature": self._temperature,
                    "max_tokens": self._max_tokens,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            latency = time.time() - t0
            logger.warning("Student runner failed: %s", exc)
            return StudentResult(
                content=f"Error: {exc}",
                latency_seconds=latency,
            )

        latency = time.time() - t0
        choices = data.get("choices", [])
        content = ""
        if choices:
            msg = choices[0].get("message", {})
            content = msg.get("content", "")

        usage = data.get("usage", {})
        tokens = usage.get("total_tokens", 0)

        return StudentResult(
            content=content,
            latency_seconds=latency,
            tokens_used=tokens,
            trace_id=f"distill_{session_id}_{hash(query) % 10000}",
        )
