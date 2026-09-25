"""Think tool — zero-cost reasoning scratchpad."""

from __future__ import annotations

from typing import Any

from nova.core.registry import ToolRegistry
from nova.core.types import ToolResult
from nova.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("think")
class ThinkTool(BaseTool):
    """Reasoning scratchpad that echoes input for chain-of-thought."""

    tool_id = "think"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="think",
            description=(
                "A reasoning scratchpad. Think through"
                " a problem step by step. Input is echoed."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "thought": {
                        "type": "string",
                        "description": "Your reasoning or thought process.",
                    },
                },
                "required": ["thought"],
            },
            category="reasoning",
            cost_estimate=0.0,
            latency_estimate=0.0,
        )

    def execute(self, **params: Any) -> ToolResult:
        return ToolResult(
            tool_name="think",
            content=params.get("thought", ""),
            success=True,
        )


__all__ = ["ThinkTool"]
