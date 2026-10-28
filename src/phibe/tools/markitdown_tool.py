"""MarkItDown tool — read a document (PDF, Word, Excel, PowerPoint, HTML...) as Markdown."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from phibe.connectors.markitdown_convert import SUPPORTED, UnsupportedDocument, to_markdown
from phibe.core.registry import ToolRegistry
from phibe.core.types import ToolResult
from phibe.tools._stubs import BaseTool, ToolSpec

_DEFAULT_MAX_CHARS = 50_000


@ToolRegistry.register("markitdown")
class MarkItDownTool(BaseTool):
    """Convert a document file to Markdown with Microsoft's MarkItDown."""

    tool_id = "markitdown"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="markitdown",
            description=(
                "Read a document file (PDF, Word, Excel, PowerPoint, HTML, CSV) and return its text as Markdown,"
                " keeping headings and tables."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Path to the document."},
                    "max_chars": {
                        "type": "integer",
                        "description": "Maximum characters to return. Default 50000.",
                    },
                },
                "required": ["file_path"],
            },
            category="media",
            required_capabilities=["file:read"],
        )

    def execute(self, **params: Any) -> ToolResult:
        def fail(message: str) -> ToolResult:
            return ToolResult(tool_name="markitdown", content=message, success=False)

        file_path = params.get("file_path", "")
        if not file_path:
            return fail("No file_path provided.")
        path = Path(file_path)
        if path.suffix.lower() not in SUPPORTED:
            return fail(f"Unsupported file type: {path.suffix or file_path}. Allowed: {', '.join(sorted(SUPPORTED))}")

        from phibe.security.file_policy import is_sensitive_file

        if is_sensitive_file(path):
            return fail(f"Access denied: {file_path} is a sensitive file.")
        if not path.exists():
            return fail(f"File not found: {file_path}")

        try:
            text = to_markdown(path.read_bytes(), path.name)
        except UnsupportedDocument as exc:
            return fail(str(exc))
        except Exception as exc:  # noqa: BLE001 - a corrupt file is a tool error, not a crash
            return fail(f"Could not read {file_path}: {exc}")
        if not text:
            return fail(f"No text found in {file_path}.")

        limit = params.get("max_chars", _DEFAULT_MAX_CHARS)
        if len(text) > limit:
            text = text[:limit] + "\n[...truncated...]"
        return ToolResult(tool_name="markitdown", content=text, success=True)
