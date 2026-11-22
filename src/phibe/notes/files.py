"""Files that belong to notes (pictures, PDFs...): kept in ``notes-files/`` next to the databases.

A file is named after the SHA-256 of its content, so the same picture is stored once and a name can never
point outside the folder. Only the content decides what the file is; the browser is told not to guess.
"""

from __future__ import annotations

import hashlib
import os
import re
import tempfile
from pathlib import Path
from typing import Optional

MAX_BYTES = 100 * 1024 * 1024
_NAME = re.compile(r"^[0-9a-f]{64}\.[a-z0-9]{1,8}$")
# Shown inside the page. Anything else (SVG, HTML...) is only ever offered as a download, because those can carry scripts.
INLINE = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".avif": "image/avif", ".pdf": "application/pdf",
    ".mp4": "video/mp4", ".webm": "video/webm",
}
_MAGIC = ((b"\x89PNG", ".png"), (b"\xff\xd8\xff", ".jpg"), (b"GIF8", ".gif"), (b"%PDF", ".pdf"), (b"RIFF", ".webp"))


class FileTooBig(ValueError):
    pass


def folder() -> Path:
    from phibe.core.paths import get_config_dir

    return get_config_dir() / "notes-files"


def extension_for(data: bytes, filename: str = "") -> str:
    """The content's own type when it is a known one; otherwise the file name's extension; otherwise ``.bin``."""
    if data[4:8] == b"ftyp":  # MP4 and friends: the type sits after the box size
        return ".mp4"
    for magic, ext in _MAGIC:
        if data.startswith(magic) and (ext != ".webp" or data[8:12] == b"WEBP"):
            return ext
    ext = Path(filename).suffix.lower()
    return ext if re.fullmatch(r"\.[a-z0-9]{1,8}", ext) else ".bin"


def save(data: bytes, filename: str = "") -> str:
    """Keep the bytes and return the stored name. Saving the same bytes twice returns the same name."""
    if len(data) > MAX_BYTES:
        raise FileTooBig(f"files can be at most {MAX_BYTES // (1024 * 1024)} MB")
    name = hashlib.sha256(data).hexdigest() + extension_for(data, filename)
    target = folder() / name
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".part")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            os.replace(tmp, target)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
    return name


def path_of(name: str) -> Optional[Path]:
    """The file for a stored name, or ``None`` when the name is not one of ours or the file is gone."""
    if not _NAME.match(name):
        return None
    target = folder() / name
    return target if target.is_file() else None


def url_of(name: str) -> str:
    return f"/v1/notes/files/{name}"


# -- the list on disk, the names people gave, and deleting ------------------------------------------

def _names_file() -> Path:
    return folder() / ".names.json"


def labels() -> dict:
    """The original file names of what was uploaded (the stored name is only a hash)."""
    import json

    try:
        return {str(k): str(v) for k, v in json.loads(_names_file().read_text(encoding="utf-8")).items()}
    except (OSError, ValueError):
        return {}


def remember(name: str, filename: str) -> None:
    import json

    label = Path(filename).name.strip()
    if not label or labels().get(name) == label:
        return
    known = labels()
    known[name] = label
    _names_file().parent.mkdir(parents=True, exist_ok=True)
    _names_file().write_text(json.dumps(known, ensure_ascii=False), encoding="utf-8")


def on_disk() -> list:
    """Every stored file: ``(name, size)``."""
    base = folder()
    if not base.is_dir():
        return []
    return [(p.name, p.stat().st_size) for p in base.iterdir() if p.is_file() and _NAME.match(p.name)]


def remove(name: str) -> bool:
    """Takes a file out of the notes. It is moved to ``.deleted/`` inside the folder, not erased."""
    path = path_of(name)
    if path is None:
        return False
    gone = folder() / ".deleted"
    gone.mkdir(parents=True, exist_ok=True)
    os.replace(path, gone / name)
    return True


# -- tags on files (kept beside them: a file is not a note) ------------------------------------------

def _tags_file() -> Path:
    return folder() / ".tags.json"


def tags_map() -> dict:
    import json

    try:
        return {str(k): [str(t) for t in v] for k, v in json.loads(_tags_file().read_text(encoding="utf-8")).items()}
    except (OSError, ValueError):
        return {}


def _save_tags(data: dict) -> None:
    import json

    _tags_file().parent.mkdir(parents=True, exist_ok=True)
    _tags_file().write_text(json.dumps({k: v for k, v in data.items() if v}, ensure_ascii=False), encoding="utf-8")


def set_tags(name: str, tags: list) -> list:
    data = tags_map()
    data[name] = list(dict.fromkeys(t.strip() for t in tags if t and t.strip()))
    _save_tags(data)
    return data[name]


def rename_tag(old: str, new: str) -> None:
    data = tags_map()
    for k, v in data.items():
        data[k] = list(dict.fromkeys(new if t.lower() == old.lower() else t for t in v))
    _save_tags(data)


def drop_tag(name: str) -> None:
    data = tags_map()
    for k, v in data.items():
        data[k] = [t for t in v if t.lower() != name.lower()]
    _save_tags(data)


# -- the notes a file is connected to: only what the user connects, not what happens to be written in a text ----

def _links_file() -> Path:
    return folder() / ".links.json"


def links_map() -> dict:
    import json

    try:
        return {str(k): [str(i) for i in v] for k, v in json.loads(_links_file().read_text(encoding="utf-8")).items()}
    except (OSError, ValueError):
        return {}


def set_links(name: str, note_ids: list) -> list:
    import json

    data = links_map()
    data[name] = list(dict.fromkeys(i for i in note_ids if i))
    _links_file().parent.mkdir(parents=True, exist_ok=True)
    _links_file().write_text(json.dumps({k: v for k, v in data.items() if v}, ensure_ascii=False), encoding="utf-8")
    return data[name]
