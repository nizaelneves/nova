"""The words inside a PDF kept with a note, so searching finds a note by what its attached PDF says."""

from __future__ import annotations

import re
from typing import List

from phibe.notes import files

_PDF_LINK = re.compile(r"/v1/notes/files/([0-9a-f]{64}\.pdf)")
MAX_PAGES = 40
MAX_CHARS = 30_000  # shortcut: only the start of a long PDF is searchable; raise it if long books matter


def pdf_text(body: str) -> str:
    """Text of the PDFs a note links to (empty when none, or when a file cannot be read: a scan has no text)."""
    out: List[str] = []
    for name in dict.fromkeys(_PDF_LINK.findall(body or "")):
        path = files.path_of(name)
        if path is None:
            continue
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(path))
            out.append(" ".join((page.extract_text() or "") for page in reader.pages[:MAX_PAGES]))
        except Exception:  # noqa: BLE001 - a damaged or locked PDF must never stop the note from being indexed
            continue
    return re.sub(r"\s+", " ", " ".join(out)).strip()[:MAX_CHARS]
