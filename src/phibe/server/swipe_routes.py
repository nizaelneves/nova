"""``/v1/swipe``: the Swipe File inside Memoir. Three kinds live as plain files in ``<phibe home>/swipe-file/<kind>/<folder>/``:
videos, audios, emails (PDF or text), copy and prompts (text or markdown).

The folder on disk is the source of truth: put a video in a folder by hand and it shows up here; delete it and it goes.
Nothing is copied into a database.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from phibe.core.paths import get_config_dir

VIDEO_TYPES = {".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska"}
KINDS: Dict[str, Dict[str, str]] = {
    "videos": VIDEO_TYPES,
    "audios": {
        ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac",
        ".ogg": "audio/ogg", ".opus": "audio/ogg", ".flac": "audio/flac", ".weba": "audio/webm",
    },
    "emails": {".pdf": "application/pdf", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8"},
    "prompts": {".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8"},
    "ideas": {".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8"},
}
TEXT_KINDS = ("prompts", "emails", "ideas")  # kept as text the user writes here, not uploaded files only
TEXT_TYPES = KINDS["emails"]  # every text type (E-mails, Copies, or one the user made) takes PDF, markdown and text
LEGACY_TYPES = {"emails": "E-Mails"}  # the first type keeps its folder name on disk
BUILTIN = ("videos", "audios", "prompts", "ideas")
PREVIEW = 220
UNSORTED = "Unclassified"  # loose files in the videos folder itself
CHUNK = 1024 * 1024
_FM = re.compile(r"\A---\n(.*?)\n---\n?", re.S)


def _meta(file: Path) -> Path:
    """Where an e-mail's note about its origin is kept: a small file beside it (``name.pdf.json``)."""
    return file.with_name(file.name + ".json")


def read_source(file: Path) -> str:
    try:
        return str(json.loads(_meta(file).read_text(encoding="utf-8")).get("source", ""))
    except (OSError, ValueError):
        return ""


def write_source(file: Path, source: str) -> None:
    source = source.strip()[:120]
    if source:
        _meta(file).write_text(json.dumps({"source": source}, ensure_ascii=False), encoding="utf-8")
    else:
        _meta(file).unlink(missing_ok=True)


_GENERIC = {"www", "view", "mkt", "click", "email", "mail", "news", "e", "link", "links", "web", "m", "go"}


def source_from_url(url: str) -> str:
    """A first guess at where an e-mail comes from: its site, without the sending prefixes (view.mkt.amarantehoteis.com.br gives amarantehoteis.com.br)."""
    from urllib.parse import urlparse

    parts = [p for p in (urlparse(url).hostname or "").split(".") if p]
    while len(parts) > 2 and parts[0] in _GENERIC:
        parts.pop(0)
    return ".".join(parts)


STAMP = re.compile(r"^(\d{8}-\d{6}) (.+)$")


def _trash_root() -> Path:
    return get_config_dir() / "swipe-file" / ".trash"


def _to_trash(path: Path, kind: str, folder: str) -> None:
    """Trashed files wait in ``swipe-file/.trash/<kind>/<folder>/<stamp> <name>``: the Trash screen can restore them."""
    bin_ = _trash_root() / kind / folder
    bin_.mkdir(parents=True, exist_ok=True)
    path.rename(bin_ / f"{datetime.now().strftime('%Y%m%d-%H%M%S')} {path.name}")


class TrashBody(BaseModel):
    kind: str
    folder: str
    name: str


def split_threads(text: str) -> tuple[List[str], str]:
    """A hunch keeps its threads (like tags) in a small header: ``threads: ["Business Playbook", "Israel"]``."""
    m = _FM.match(text)
    if not m:
        return [], text
    for line in m.group(1).splitlines():
        if line.startswith("threads:"):
            try:
                found = json.loads(line[len("threads:"):].strip())
                return [str(t) for t in found if str(t).strip()], text[m.end():]
            except ValueError:
                break
    return [], text[m.end():]


def with_threads(body: str, threads: List[str]) -> str:
    names = list(dict.fromkeys(t.strip() for t in threads if t.strip()))
    return f"---\nthreads: {json.dumps(names, ensure_ascii=False)}\n---\n{body}" if names else body


def _tagged(kind: str, text: str, threads: str) -> str:
    """A Hunch sent with threads (a JSON list in the query) gets them in its header, beside any it already had."""
    if kind != "ideas" or not threads:
        return text
    try:
        extra = [str(t) for t in json.loads(threads)]
    except ValueError:
        return text
    old, body = split_threads(text)
    return with_threads(body, old + extra)


_BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _custom(kind: str) -> bool:
    """A text type the user made: a folder of its own inside the Swipe File."""
    return bool(kind) and kind not in KINDS and not kind.startswith(".") and clean(kind) == kind and (get_config_dir() / "swipe-file" / kind).is_dir()


DOCUMENTS = {".docx", ".pdf", ".html", ".htm", ".pptx"}  # read to Markdown when sent to Hunches or Prompts


def exts(kind: str) -> Dict[str, str]:
    """The file types a kind takes ({} when it is not a kind at all)."""
    return KINDS.get(kind) or (TEXT_TYPES if _custom(kind) else {})


def is_text(kind: str) -> bool:
    return kind in TEXT_KINDS or _custom(kind)


def has_source(kind: str) -> bool:
    """Texts (E-Mails and the types the user made) remember where each piece came from."""
    return is_text(kind) and kind not in ("prompts", "ideas")


def _types_file() -> Path:
    return get_config_dir() / "swipe-file" / ".types.json"


def _order() -> List[str]:
    try:
        return [str(x) for x in json.loads(_types_file().read_text(encoding="utf-8")).get("order", [])]
    except (OSError, ValueError):
        return []


def _save_order(order: List[str]) -> None:
    _types_file().parent.mkdir(parents=True, exist_ok=True)
    _types_file().write_text(json.dumps({"order": order}, ensure_ascii=False), encoding="utf-8")


def root(kind: str = "videos") -> Path:
    if kind not in KINDS and not _custom(kind):
        raise HTTPException(status_code=404, detail="unknown swipe file kind")
    return get_config_dir() / "swipe-file" / kind


def clean(name: str) -> str:
    """A safe single path segment: no separators, no leading dots, never empty."""
    name = _BAD.sub(" ", name or "").strip().strip(".")
    return re.sub(r"\s+", " ", name)[:80]


def _folder_path(kind: str, folder: str) -> Path:
    name = clean(folder)
    if not name:
        raise HTTPException(status_code=400, detail="Give the shelf a name")
    return root(kind) if name == UNSORTED else root(kind) / name


def _files_in(kind: str, folder: Path, label: str) -> List[Dict[str, Any]]:
    out = []
    for f in sorted(folder.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if f.is_file() and f.suffix.lower() in exts(kind):
            st = f.stat()
            item: Dict[str, Any] = {"folder": label, "name": f.name, "title": f.stem, "size": st.st_size, "modified": st.st_mtime, "created": st.st_ctime}  # st_ctime is the creation time on Windows
            if has_source(kind):
                item["source"] = read_source(f)
            if is_text(kind) and f.suffix.lower() != ".pdf":
                text = f.read_text(encoding="utf-8", errors="replace")
                if kind == "ideas":
                    item["threads"], text = split_threads(text)
                item["preview"] = text.lstrip()[:PREVIEW]
            out.append(item)
    return out


class FolderBody(BaseModel):
    name: str
    kind: str = "videos"


class EditBody(BaseModel):
    folder: str
    name: str
    title: str = ""  # empty keeps the name
    new_folder: str = ""  # empty keeps the folder
    threads: Optional[List[str]] = None  # hunches only: replaces the threads
    source: Optional[str] = None  # e-mails only: where it comes from


class LinkBody(BaseModel):
    url: str
    folder: str
    name: str = ""
    source: str = ""  # empty: guessed from the link


class RenameFolderBody(BaseModel):
    kind: str = "videos"
    name: str
    new_name: str


class RenameType(BaseModel):
    id: str
    new_name: str


class RenameSource(BaseModel):
    old: str
    new: str


class TypeOrder(BaseModel):
    order: List[str]


class TextBody(BaseModel):
    folder: str
    title: str
    content: str
    threads: List[str] = []  # hunches only
    name: str = ""  # an existing file to overwrite; empty creates a new one
    source: Optional[str] = None  # texts: where it comes from


def create_swipe_router() -> APIRouter:
    router = APIRouter(prefix="/v1/swipe", tags=["swipe-file"])

    @router.get("/types")
    def list_types() -> List[Dict[str, str]]:
        """The text types, in the user's order: each is a folder of its own inside the Swipe File."""
        base = get_config_dir() / "swipe-file"
        base.mkdir(parents=True, exist_ok=True)
        if not _types_file().exists():  # the first time: E-Mails is there to start with, and the empty old "copy" folder goes
            if (base / "copy").is_dir() and not any((base / "copy").iterdir()):
                (base / "copy").rmdir()
            (base / "emails").mkdir(exist_ok=True)
            _save_order(["emails"])
        found = [p.name for p in base.iterdir() if p.is_dir() and not p.name.startswith(".") and p.name not in BUILTIN]
        order = [n for n in _order() if n in found]
        names = order + sorted((n for n in found if n not in order), key=str.lower)
        return [{"id": n, "label": LEGACY_TYPES.get(n, n)} for n in names]

    def _type_dir(type_id: str) -> Path:
        if type_id in BUILTIN or clean(type_id) != type_id or not (get_config_dir() / "swipe-file" / type_id).is_dir():
            raise HTTPException(status_code=404, detail="no such type")
        return get_config_dir() / "swipe-file" / type_id

    def _taken(name: str, besides: str = "") -> bool:
        base = get_config_dir() / "swipe-file"
        base.mkdir(parents=True, exist_ok=True)
        reserved = {n.lower() for n in [*BUILTIN, "e-mails", "emails", "e-mail", "email"]}
        existing = {p.name.lower() for p in base.iterdir() if p.is_dir() and p.name != besides}
        return name.lower() in reserved | existing

    @router.post("/types")
    def create_type(body: FolderBody) -> Dict[str, str]:
        name = clean(body.name)
        base = get_config_dir() / "swipe-file"
        if name.lower() in ("e-mails", "emails"):
            name = "emails"  # the first type has a folder of its own, and a label
            if (base / name).is_dir():
                raise HTTPException(status_code=409, detail="Pick another type name")
        elif not name or _taken(name):
            raise HTTPException(status_code=409, detail="Pick another type name")
        (get_config_dir() / "swipe-file" / name).mkdir(parents=True, exist_ok=True)
        _save_order([*[n for n in _order() if n != name], name])
        return {"id": name, "label": LEGACY_TYPES.get(name, name)}

    @router.patch("/types")
    def rename_type(body: RenameType) -> Dict[str, str]:
        src = _type_dir(body.id)
        new = clean(body.new_name)
        if not new or new == body.id:
            raise HTTPException(status_code=400, detail="Pick another type name")
        if _taken(new, besides=body.id):
            raise HTTPException(status_code=409, detail="Pick another type name")
        src.rename(src.with_name(new))
        gone = _trash_root() / body.id  # what was trashed from it keeps its way back
        if gone.is_dir():
            gone.rename(gone.with_name(new))
        _save_order([new if n == body.id else n for n in _order()])
        return {"id": new, "label": new}

    @router.put("/types/order")
    def order_types(body: TypeOrder) -> Dict[str, bool]:
        _save_order([n for n in body.order if n not in BUILTIN and clean(n) == n])
        return {"ok": True}

    @router.delete("/types")
    def delete_type(id: str = Query(...)) -> Dict[str, int]:
        """The type goes, and its texts wait in the Trash (they can be restored: the type comes back with them)."""
        import shutil

        src = _type_dir(id)
        moved = 0
        for f in sorted(src.rglob("*")):
            if f.is_file():
                label = f.parent.name if f.parent != src else UNSORTED
                _to_trash(f, id, label)
                moved += 1
        shutil.rmtree(src, ignore_errors=True)
        _save_order([n for n in _order() if n != id])
        return {"moved": moved}

    @router.patch("/sources")
    def rename_source(body: RenameSource) -> Dict[str, int]:
        """Every text that came from ``old`` now says it came from ``new``."""
        new = body.new.strip()
        if not new or not body.old:
            raise HTTPException(status_code=400, detail="Give the source a name")
        base = get_config_dir() / "swipe-file"
        changed = 0
        for d in (p for p in base.iterdir() if p.is_dir() and not p.name.startswith(".") and p.name not in BUILTIN):
            for f in d.rglob("*"):
                if f.is_file() and f.suffix.lower() in TEXT_TYPES and read_source(f) == body.old:
                    write_source(f, new)
                    changed += 1
        return {"changed": changed}

    @router.get("/trash")
    def list_trash() -> Dict[str, Any]:
        items: List[Dict[str, Any]] = []
        for base in sorted(p for p in _trash_root().glob("*") if p.is_dir()):
            kind = base.name
            for f in base.rglob("*"):
                if not f.is_file() or f.suffix.lower() not in TEXT_TYPES | KINDS.get(kind, {}):
                    continue
                folder = f.parent.name if f.parent != base else UNSORTED  # the first version kept no folder
                m = STAMP.match(f.name)
                items.append({"kind": kind, "folder": folder, "name": f.name, "title": Path(m.group(2) if m else f.name).stem,
                              "size": f.stat().st_size, "deleted": f.stat().st_mtime})
        items.sort(key=lambda v: v["deleted"], reverse=True)
        return {"items": items}

    @router.post("/trash/restore")
    def restore_trashed(body: TrashBody) -> Dict[str, Any]:
        base = _trash_root() / body.kind
        src = base / body.folder / Path(body.name).name
        if not src.is_file():
            src = base / Path(body.name).name  # trashed before folders were remembered
        if not src.is_file() or Path(body.kind).name != body.kind:
            raise HTTPException(status_code=404, detail="not in the trash")
        if body.kind not in KINDS and clean(body.kind) == body.kind and body.kind not in BUILTIN:
            (get_config_dir() / "swipe-file" / body.kind).mkdir(parents=True, exist_ok=True)  # a deleted type comes back with its text
        target = _folder_path(body.kind, body.folder)
        target.mkdir(parents=True, exist_ok=True)
        m = STAMP.match(src.name)
        plain = Path(m.group(2) if m else src.name)
        dest, n = target / plain.name, 2
        while dest.exists():
            dest, n = target / f"{plain.stem} ({n}){plain.suffix}", n + 1
        side = src.with_name(src.name + ".json")
        src.rename(dest)
        if side.exists():
            side.rename(_meta(dest))
        return {"folder": body.folder, "name": dest.name}

    @router.delete("/trash")
    def purge_trashed(kind: str = Query(...), folder: str = Query(...), name: str = Query(...)) -> Dict[str, Any]:
        base = _trash_root() / kind
        src = base / folder / Path(name).name
        if not src.is_file():
            src = base / Path(name).name
        if not src.is_file() or Path(kind).name != kind:
            raise HTTPException(status_code=404, detail="not in the trash")
        src.with_name(src.name + ".json").unlink(missing_ok=True)
        src.unlink()
        return {"ok": True}

    @router.get("/{kind}")
    def list_files(kind: str) -> Dict[str, Any]:
        base = root(kind)
        base.mkdir(parents=True, exist_ok=True)
        folders: List[Dict[str, Any]] = []
        files = _files_in(kind, base, UNSORTED)
        if files:
            folders.append({"name": UNSORTED, "count": len(files)})
        for d in sorted((p for p in base.iterdir() if p.is_dir()), key=lambda p: p.name.lower()):
            inside = _files_in(kind, d, d.name)
            folders.append({"name": d.name, "count": len(inside)})
            files += inside
        files.sort(key=lambda v: v["modified"], reverse=True)
        return {"folders": folders, "items": files}

    @router.post("/folders")
    def create_folder(body: FolderBody) -> Dict[str, Any]:
        name = clean(body.name)
        if not name or name == UNSORTED:
            raise HTTPException(status_code=400, detail="Pick another shelf name")
        (root(body.kind) / name).mkdir(parents=True, exist_ok=True)
        return {"name": name}

    @router.patch("/folders")
    def rename_folder(body: RenameFolderBody) -> Dict[str, Any]:
        old, new = clean(body.name), clean(body.new_name)
        if not new or UNSORTED in (old, new):
            raise HTTPException(status_code=400, detail="Pick another shelf name")
        src, dest = root(body.kind) / old, root(body.kind) / new
        if not src.is_dir():
            raise HTTPException(status_code=404, detail="shelf not found")
        if dest.exists() and dest.name.lower() != src.name.lower():
            raise HTTPException(status_code=409, detail="A shelf with this name already exists")
        if dest != src:
            src.rename(dest)
        return {"name": new}

    @router.post("/{kind}/save")
    def save_text(kind: str, body: TextBody) -> Dict[str, Any]:
        if not is_text(kind):
            raise HTTPException(status_code=404, detail="this kind is not written here")
        title = clean(body.title)
        if not title:
            raise HTTPException(status_code=400, detail="Give it a title")
        target = _folder_path(kind, body.folder)
        target.mkdir(parents=True, exist_ok=True)
        content = with_threads(body.content, body.threads) if kind == "ideas" else body.content
        if body.name:
            dest = target / clean(body.name)
            if dest.suffix.lower() not in exts(kind) or not dest.is_file():
                raise HTTPException(status_code=404, detail="file not found")
            if dest.stem != title:  # renamed: write the new file, then drop the old one
                new = target / f"{title}{dest.suffix}"
                if new.exists():
                    raise HTTPException(status_code=409, detail="One with this title already exists")
                new.write_text(content, encoding="utf-8")
                if _meta(dest).exists():
                    _meta(dest).rename(_meta(new))
                dest.unlink()
                dest = new
            else:
                dest.write_text(content, encoding="utf-8")
        else:
            dest, n = target / f"{title}.md", 2
            while dest.exists():
                dest, n = target / f"{title} ({n}).md", n + 1
            dest.write_text(content, encoding="utf-8")
        if has_source(kind) and body.source is not None:
            write_source(dest, body.source)
        return {"folder": target.name if target != root(kind) else UNSORTED, "name": dest.name}

    @router.post("/{kind}/link")
    def save_email_link(kind: str, body: LinkBody) -> Dict[str, Any]:
        from phibe.server.swipe_email import render_pdf

        if not is_text(kind):
            raise HTTPException(status_code=404, detail="this kind takes no links")
        target = _folder_path(kind, body.folder.strip() or UNSORTED)
        try:
            dest, _ = render_pdf(body.url.strip(), target, body.name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:  # the page did not open, or no browser: say so in plain words
            raise HTTPException(status_code=502, detail=f"Could not open that link ({type(e).__name__})")
        write_source(dest, body.source or source_from_url(body.url.strip()))
        return {"folder": target.name if target != root(kind) else UNSORTED, "name": dest.name, "size": dest.stat().st_size}

    @router.post("/{kind}")
    async def upload_file(kind: str, folder: str = Query(...), source: str = Query(""), threads: str = Query(""), file: UploadFile = File(...)) -> Dict[str, Any]:
        types = exts(kind)
        if not types:
            raise HTTPException(status_code=404, detail="unknown swipe file kind")
        suffix = Path(file.filename or "").suffix.lower()
        convert = kind in ("ideas", "prompts") and suffix in DOCUMENTS
        if suffix not in types and not convert:
            raise HTTPException(status_code=415, detail=f"Only {kind} files can go here ({', '.join(sorted(types) + sorted(DOCUMENTS) if kind in ('ideas', 'prompts') else sorted(types))})")
        if convert:  # a Word, PDF or web page is read to text; the Swipe File keeps it as a Markdown note
            from phibe.connectors.markitdown_convert import to_markdown

            try:
                text = to_markdown(await file.read(), file.filename or "file" + suffix)
            except Exception:
                raise HTTPException(status_code=422, detail="Could not read the text of that file")
            if not text:
                raise HTTPException(status_code=422, detail="That file has no text to keep")
            target = _folder_path(kind, folder)
            target.mkdir(parents=True, exist_ok=True)
            stem = clean(Path(file.filename or "file").stem) or "file"
            dest, n = target / f"{stem}.md", 2
            while dest.exists():
                dest, n = target / f"{stem} ({n}).md", n + 1
            dest.write_text(_tagged(kind, text, threads), encoding="utf-8")
            return {"folder": target.name if target != root(kind) else UNSORTED, "name": dest.name, "size": dest.stat().st_size}
        target = _folder_path(kind, folder)
        target.mkdir(parents=True, exist_ok=True)
        stem = clean(Path(file.filename or "file").stem) or "file"
        dest, n = target / f"{stem}{suffix}", 2
        while dest.exists():  # never overwrite a file that is already there
            dest, n = target / f"{stem} ({n}){suffix}", n + 1
        part = dest.with_name(dest.name + ".part")
        try:
            with part.open("wb") as out:
                while chunk := await file.read(CHUNK):
                    out.write(chunk)
            part.replace(dest)
        finally:
            part.unlink(missing_ok=True)
        if kind == "ideas" and threads:
            dest.write_text(_tagged(kind, dest.read_text(encoding="utf-8", errors="replace"), threads), encoding="utf-8")
        if has_source(kind) and source.strip():
            write_source(dest, source)
        return {"folder": target.name if target != root(kind) else UNSORTED, "name": dest.name, "size": dest.stat().st_size}

    @router.patch("/{kind}/file")
    def edit_file(kind: str, body: EditBody) -> Dict[str, Any]:
        """Rename a file and/or move it to another folder. The extension stays, and nothing is ever overwritten."""
        src = _folder_path(kind, body.folder) / clean(body.name)
        if src.suffix.lower() not in exts(kind) or not src.is_file():
            raise HTTPException(status_code=404, detail="file not found")
        title = clean(body.title) or src.stem
        target = _folder_path(kind, body.new_folder or body.folder)
        dest = target / f"{title}{src.suffix}"
        if kind == "ideas" and body.threads is not None:
            _, text = split_threads(src.read_text(encoding="utf-8"))
            src.write_text(with_threads(text, body.threads), encoding="utf-8")
        if dest != src:
            if dest.exists():
                raise HTTPException(status_code=409, detail="A file with this name already exists there")
            target.mkdir(parents=True, exist_ok=True)
            src.rename(dest)
            if _meta(src).exists():
                _meta(src).rename(_meta(dest))
        if has_source(kind) and body.source is not None:
            write_source(dest, body.source)
        return {"folder": target.name if target != root(kind) else UNSORTED, "name": dest.name}

    @router.delete("/{kind}/file")
    def trash_file(kind: str, folder: str = Query(...), name: str = Query(...)) -> Dict[str, Any]:
        """Not deleted for good: the file goes to the Trash (``swipe-file/.trash``), where it can be restored."""
        src = _folder_path(kind, folder) / clean(name)
        if src.suffix.lower() not in exts(kind) or not src.is_file():
            raise HTTPException(status_code=404, detail="file not found")
        label = clean(folder) or UNSORTED
        sidecar = _meta(src)
        _to_trash(src, kind, label)
        if sidecar.exists():
            _to_trash(sidecar, kind, label)
        return {"ok": True}

    @router.get("/{kind}/file")
    def get_file(kind: str, folder: str = Query(...), name: str = Query(...)) -> FileResponse:
        path = _folder_path(kind, folder) / clean(name)
        types = exts(kind)
        if path.suffix.lower() not in types or not path.is_file():
            raise HTTPException(status_code=404, detail="file not found")
        # FileResponse answers Range requests, so the player can seek without downloading everything.
        return FileResponse(path, media_type=types[path.suffix.lower()], headers={"Cache-Control": "private, max-age=3600"})

    return router
