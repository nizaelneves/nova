"""``/v1/notes``: Phibe's own notes (the second brain): list, edit, tags, collections, search, index."""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel

from phibe.notes import backup as note_backup
from phibe.notes import files as note_files
from phibe.notes import settings as notes_settings
from phibe.notes.store import NotesStore, NotFound

# Seconds of quiet after a save before the search index is updated.
INDEX_DELAY = 20.0


class NoteBody(BaseModel):
    title: str = ""
    body: str = ""
    kind: str = "page"
    tags: List[str] = []
    url: str = ""
    description: str = ""


class NotePatch(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None


class TagBody(BaseModel):
    name: str
    new_name: Optional[str] = None
    color: Optional[str] = None


class FileTags(BaseModel):
    tags: List[str] = []


class ReindexBody(BaseModel):
    all: bool = False


class CollectionBody(BaseModel):
    name: str = ""


class BookmarkBody(BaseModel):
    url: str
    title: str = ""
    tags: List[str] = []


def _page_details(url: str) -> Dict[str, str]:
    """Best effort: the page's title and description, read from the start of the page. Never raises."""
    import html
    import re

    import httpx

    try:
        with httpx.stream("GET", url, timeout=8.0, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as r:
            head = b"".join(chunk for _, chunk in zip(range(4), r.iter_bytes(65536))).decode(r.encoding or "utf-8", "replace")
    except Exception:  # noqa: BLE001 - offline or blocked: the bookmark is still saved with its address
        return {}
    title = re.search(r"<title[^>]*>(.*?)</title>", head, re.S | re.I)
    desc = re.search(r"<meta[^>]+name=[\"']description[\"'][^>]*content=[\"'](.*?)[\"']", head, re.S | re.I)
    clean = lambda m: html.unescape(re.sub(r"\s+", " ", m.group(1))).strip() if m else ""  # noqa: E731
    return {"title": clean(title), "description": clean(desc)}


class CollectionIds(BaseModel):
    ids: List[str] = []


def get_shared_notes_store(app: Any) -> NotesStore:
    """Open the notes database on first use and keep it on ``app.state``."""
    store = getattr(app.state, "notes_store", None)
    if store is None:
        store = NotesStore()
        app.state.notes_store = store
    return store


def create_notes_router(get_store: Callable[[], NotesStore]) -> APIRouter:
    router = APIRouter(prefix="/v1/notes", tags=["notes"])
    jobs: Dict[str, Dict[str, Any]] = {
        name: {"state": "idle", "done": 0, "total": 0, "result": None, "error": None, "started": None}
        for name in ("index",)
    }

    def _start(name: str, work: Callable[[Dict[str, Any]], Any]) -> Dict[str, Any]:
        job = jobs[name]
        if job["state"] == "running":
            raise HTTPException(status_code=409, detail=f"{name} is already running")
        job.update(state="running", done=0, total=0, result=None, error=None, started=time.time())

        def run() -> None:
            try:
                job["result"] = work(job)
                job["state"] = "done"
            except Exception as exc:  # noqa: BLE001 - the job reports it; the server must not die
                job["state"], job["error"] = "error", str(exc)

        threading.Thread(target=run, daemon=True, name=f"notes-{name}").start()
        return job

    def _progress(job: Dict[str, Any]) -> Callable[[int, int], None]:
        def update(done: int, total: int) -> None:
            job["done"], job["total"] = done, total

        return update

    def _index_work(job: Dict[str, Any], *, everything: bool = False) -> Dict[str, int]:
        # Background threads open their own connections: SQLite handles the sharing (WAL).
        from phibe.connectors.store import KnowledgeStore
        from phibe.notes.indexer import index_pending

        notes = NotesStore(get_store()._path)
        knowledge = KnowledgeStore()
        try:
            if everything:
                for row in notes._conn.execute("SELECT id FROM notes").fetchall():
                    notes.mark_unindexed(row[0])
            return index_pending(notes, knowledge, notes_settings.embedder(), progress=_progress(job))
        finally:
            notes.close()
            knowledge.close()

    pending_timer: Dict[str, Any] = {"timer": None}
    backing_up = threading.Lock()

    def _daily_backup() -> None:
        """The first write of each day first takes a backup (in the background), so a bad edit can always be undone."""
        if note_backup.due() and backing_up.acquire(blocking=False):
            def work() -> None:
                try:
                    note_backup.make_backup(get_store())
                except Exception:  # noqa: BLE001 - a failed automatic backup must never block writing
                    pass
                finally:
                    backing_up.release()

            threading.Thread(target=work, daemon=True, name="notes-backup").start()

    def _kick_index() -> None:
        """After a write, index what changed once the writing has paused: embedding a long note takes a while.

        Each write restarts the wait; when it ends while a run is still going, it waits again."""
        _daily_backup()
        if pending_timer["timer"] is not None:
            pending_timer["timer"].cancel()

        def fire() -> None:
            if jobs["index"]["state"] == "running":
                pending_timer["timer"] = threading.Timer(INDEX_DELAY, fire)
                pending_timer["timer"].daemon = True
                pending_timer["timer"].start()
            else:
                _start("index", _index_work)

        pending_timer["timer"] = threading.Timer(INDEX_DELAY, fire)
        pending_timer["timer"].daemon = True
        pending_timer["timer"].start()

    @router.get("")
    def list_notes(
        tag: Optional[str] = None,
        collection: Optional[str] = None,
        kind: Optional[str] = None,
        trashed: bool = False,
        limit: int = Query(500, ge=1, le=2000),
        offset: int = Query(0, ge=0),
    ) -> List[Dict[str, Any]]:
        return get_store().list(tag=tag, collection=collection, kind=kind, trashed=trashed, limit=limit, offset=offset)

    @router.post("")
    def create_note(body: NoteBody) -> Dict[str, Any]:
        try:
            nid = get_store().create(
                body.title, body.body, kind=body.kind, tags=body.tags, url=body.url, description=body.description
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        _kick_index()
        return get_store().get(nid)

    @router.post("/bookmark")
    def create_bookmark(body: BookmarkBody) -> Dict[str, Any]:
        """Save an address as a bookmark note; the page's title and description are filled in when it can be reached."""
        url = body.url.strip()
        if not url.lower().startswith(("http://", "https://")):
            url = "https://" + url
        if " " in url or "." not in url.split("//", 1)[1]:
            raise HTTPException(status_code=422, detail="that does not look like a web address")
        found = _page_details(url)
        nid = get_store().create(
            body.title.strip() or found.get("title") or url, kind="bookmark", tags=body.tags, url=url, description=found.get("description", "")
        )
        _kick_index()
        return get_store().get(nid)

    def _vectors() -> Dict[str, Any]:
        from phibe.connectors.store import KnowledgeStore
        from phibe.notes.graph import note_vectors

        knowledge = KnowledgeStore()
        try:
            return note_vectors(knowledge, notes_settings.embedder().model_version)
        finally:
            knowledge.close()

    @router.get("/graph")
    def graph() -> Dict[str, Any]:
        """Tags, collections, written links and notes close in meaning, as nodes and edges."""
        from phibe.notes.graph import build

        return build(get_store(), _vectors())

    @router.get("/tags")
    def tags() -> List[Dict[str, Any]]:
        return get_store().tags()

    @router.post("/tags")
    def create_tag(body: TagBody) -> Dict[str, str]:
        if not body.name.strip():
            raise HTTPException(status_code=422, detail="a tag needs a name")
        return {"name": get_store().create_tag(body.name)}

    @router.patch("/tags")
    def edit_tag(body: TagBody) -> Dict[str, bool]:
        """Rename a tag (``new_name``) and/or give it a colour. Renaming into an existing tag merges the two."""
        store = get_store()
        if body.new_name is not None and body.new_name.strip() and body.new_name.strip() != body.name:
            if not store.rename_tag(body.name, body.new_name):
                raise HTTPException(status_code=404, detail="no such tag")
            note_files.rename_tag(body.name, body.new_name.strip())
            body.name = body.new_name.strip()
        if body.color is not None and not store.set_tag_color(body.name, body.color):
            raise HTTPException(status_code=404, detail="no such tag")
        return {"ok": True}

    @router.delete("/tags")
    def delete_tag(name: str) -> Dict[str, bool]:
        if not get_store().delete_tag(name):
            raise HTTPException(status_code=404, detail="no such tag")
        note_files.drop_tag(name)
        return {"ok": True}

    @router.get("/collections")
    def collections() -> List[Dict[str, Any]]:
        return get_store().collections()

    @router.get("/status")
    def status() -> Dict[str, Any]:
        store = get_store()
        model = notes_settings.embedder().model_version
        return {
            **store.stats(),
            "embedding_model": model,
            "pending": len(store.pending_index(model)),
            "index": jobs["index"],
            "backups": note_backup.list_backups()[:5],
        }

    @router.get("/settings")
    def get_settings() -> Dict[str, Any]:
        return notes_settings.get()

    @router.put("/settings")
    def put_settings(body: Dict[str, Any]) -> Dict[str, Any]:
        from phibe.connectors import chat_sources

        try:
            saved = notes_settings.set_embedding_model(str(body.get("embedding_model", "")))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        chat_sources.reset_searcher()  # the next chat question embeds with the new model
        return saved

    @router.get("/search")
    def search(q: str = Query(..., min_length=1), limit: int = Query(10, ge=1, le=50)) -> List[Dict[str, Any]]:
        from phibe.connectors import chat_sources
        from phibe.connectors.hybrid_search import HybridSearch

        base = chat_sources._searcher()
        # Questions about notes rarely repeat their words, so meaning counts more than keywords
        # (measured on the real notes: top-3 hits 17/18 at 0.75 against 15/18 at 0.5).
        notes_search = HybridSearch(
            base._store, base._embedder, embedders=base._embedders, bm25_weight=0.25, vector_weight=0.75
        )
        seen: Dict[str, Dict[str, Any]] = {}
        for hit in notes_search.search(q, sources=["notes"], limit=limit * 3):
            nid = hit.document_id.split(":", 1)[-1]
            if nid not in seen:
                seen[nid] = {"id": nid, "title": hit.title, "snippet": hit.content_snippet, "score": round(hit.score, 4)}
        return list(seen.values())[:limit]

    @router.get("/export")
    def export_everything() -> FileResponse:
        """Every note as a Markdown file, plus pictures and files, in one ZIP."""
        import os
        import tempfile

        from phibe.notes.export import export_zip

        fd, tmp = tempfile.mkstemp(suffix=".zip")
        os.close(fd)
        export_zip(get_store(), Path(tmp))
        stamp = time.strftime("%Y%m%d")
        return FileResponse(tmp, media_type="application/zip", filename=f"phibe-notes-{stamp}.zip", background=BackgroundTask(os.unlink, tmp))

    @router.post("/backup")
    def back_up_now() -> Dict[str, Any]:
        try:
            return note_backup.make_backup(get_store())
        except Exception as exc:  # noqa: BLE001 - say why, so the user can act
            raise HTTPException(status_code=500, detail=f"The backup failed: {exc}")

    @router.get("/backups")
    def backups() -> List[Dict[str, Any]]:
        return note_backup.list_backups()

    @router.post("/reindex")
    def reindex(body: ReindexBody) -> Dict[str, Any]:
        return _start("index", lambda job: _index_work(job, everything=body.all))

    @router.get("/attachments")
    def attachments() -> List[Dict[str, Any]]:
        """Every picture and file kept with the notes: the ones the notes use (with those notes) and the ones uploaded on their own."""
        rows = get_store().attachments()
        names = note_files.labels()
        sizes = dict(note_files.on_disk())
        tag_map = note_files.tags_map()
        seen = {r["name"] for r in rows}
        for r in rows:
            r["label"] = r["label"] or names.get(r["name"], "")
            r["size"] = sizes.get(r["name"], 0)
            r["tags"] = tag_map.get(r["name"], [])
        for name, size in sorted(sizes.items()):
            if name not in seen:
                ext = name.rsplit(".", 1)[-1]
                rows.append({"name": name, "ext": ext, "label": names.get(name, ""), "image": ext in {"png", "jpg", "jpeg", "gif", "webp", "avif"}, "notes": [], "size": size, "tags": tag_map.get(name, [])})
        return [r for r in rows if r["name"] in sizes]  # a file that is gone from the disk is not listed

    @router.post("/files")
    async def upload_file(file: UploadFile = File(...)) -> Dict[str, Any]:
        data = await file.read(note_files.MAX_BYTES + 1)
        try:
            name = note_files.save(data, file.filename or "")
        except note_files.FileTooBig as exc:
            raise HTTPException(status_code=413, detail=str(exc))
        note_files.remember(name, file.filename or "")
        return {"name": name, "url": note_files.url_of(name), "size": len(data)}

    @router.put("/files/{name}/tags")
    def set_file_tags(name: str, body: FileTags) -> Dict[str, List[str]]:
        if note_files.path_of(name) is None:
            raise HTTPException(status_code=404, detail="file not found")
        return {"tags": note_files.set_tags(name, body.tags)}

    @router.delete("/files/{name}")
    def delete_file(name: str) -> Dict[str, bool]:
        if not note_files.remove(name):
            raise HTTPException(status_code=404, detail="file not found")
        return {"ok": True}

    @router.get("/files/{name}")
    def get_file(name: str) -> FileResponse:
        path = note_files.path_of(name)
        if path is None:
            raise HTTPException(status_code=404, detail="file not found")
        inline = note_files.INLINE.get(path.suffix)
        if inline:
            return FileResponse(path, media_type=inline, headers={"Cache-Control": "private, max-age=31536000, immutable"})
        # Anything that could carry a script (SVG, HTML...) is a download, never shown inside Phibe's own page.
        return FileResponse(path, media_type="application/octet-stream", filename=name)

    @router.post("/collections")
    def create_collection(body: CollectionBody) -> Dict[str, Any]:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="a collection needs a name")
        return {"id": get_store().upsert_collection(name), "name": name}

    @router.patch("/collections/{collection_id}")
    def rename_collection(collection_id: str, body: CollectionBody) -> Dict[str, Any]:
        try:
            get_store().rename_collection(collection_id, body.name)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except NotFound:
            raise HTTPException(status_code=404, detail="collection not found")
        _kick_index()  # the index text names the collections
        return {"id": collection_id, "name": body.name.strip()}

    @router.delete("/collections/{collection_id}")
    def delete_collection(collection_id: str) -> Dict[str, Any]:
        """Remove the collection only: every note in it stays."""
        try:
            get_store().delete_collection(collection_id)
        except NotFound:
            raise HTTPException(status_code=404, detail="collection not found")
        _kick_index()
        return {"ok": True}

    @router.put("/{note_id}/collections")
    def put_note_collections(note_id: str, body: CollectionIds) -> Dict[str, Any]:
        try:
            get_store().set_collections(note_id, body.ids)
        except NotFound:
            raise HTTPException(status_code=404, detail="note not found")
        _kick_index()  # the index text names the collections
        return get_store().get(note_id)

    @router.get("/{note_id}/related")
    def related_notes(note_id: str, limit: int = Query(6, ge=1, le=20)) -> List[Dict[str, Any]]:
        from phibe.notes.graph import related

        try:
            return related(get_store(), _vectors(), note_id, limit)
        except NotFound:
            raise HTTPException(status_code=404, detail="note not found")

    @router.get("/{note_id}")
    def get_note(note_id: str) -> Dict[str, Any]:
        try:
            return get_store().get(note_id)
        except NotFound:
            raise HTTPException(status_code=404, detail="note not found")

    @router.patch("/{note_id}")
    def patch_note(note_id: str, body: NotePatch) -> Dict[str, Any]:
        try:
            note = get_store().update(note_id, **body.model_dump(exclude_unset=True))
        except NotFound:
            raise HTTPException(status_code=404, detail="note not found")
        _kick_index()
        return note

    @router.post("/{note_id}/trash")
    def trash(note_id: str) -> Dict[str, Any]:
        try:
            get_store().trash(note_id)
        except NotFound:
            raise HTTPException(status_code=404, detail="note not found")
        _kick_index()
        return {"ok": True}

    @router.post("/{note_id}/restore")
    def restore(note_id: str) -> Dict[str, Any]:
        try:
            get_store().restore(note_id)
        except NotFound:
            raise HTTPException(status_code=404, detail="note not found")
        _kick_index()
        return {"ok": True}

    return router
