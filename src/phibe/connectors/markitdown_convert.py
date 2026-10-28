"""Turn a document (PDF, Word, Excel, PowerPoint, HTML...) into Markdown with Microsoft's MarkItDown.

Used by the Upload source (the Markdown is indexed in the knowledge store), by the Add File button of
the chat (the Markdown is kept with the conversation) and by the ``markitdown`` tool.
"""

from __future__ import annotations

import io
from pathlib import PurePath

# Plain text needs no conversion; the rest goes through MarkItDown.
_PLAIN = {".txt", ".md"}
SUPPORTED = _PLAIN | {".csv", ".pdf", ".docx", ".xlsx", ".pptx", ".html", ".htm", ".json", ".xml"}


class UnsupportedDocument(ValueError):
    """The file type cannot be converted."""


def extension(filename: str) -> str:
    return PurePath(filename).suffix.lower()


def to_markdown(data: bytes, filename: str) -> str:
    """The text of *data* as Markdown. Raises ``UnsupportedDocument`` for a type it cannot read."""
    ext = extension(filename)
    if ext not in SUPPORTED:
        raise UnsupportedDocument(f"Unsupported file type: {ext or filename}. Allowed: {', '.join(sorted(SUPPORTED))}")
    if ext in _PLAIN:
        try:
            return data.decode("utf-8").strip()
        except UnicodeDecodeError:
            return data.decode("latin-1").strip()
    from markitdown import MarkItDown

    return MarkItDown().convert_stream(io.BytesIO(data), file_extension=ext).text_content.strip()
