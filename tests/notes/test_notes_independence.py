"""The Markdown export and the backups. Everything here is temporary."""

from __future__ import annotations

import json
import sqlite3
import zipfile

import pytest

from phibe.notes import backup, export
from phibe.notes.store import NotesStore

PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 40


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path))
    return tmp_path


@pytest.fixture
def notes():
    s = NotesStore(":memory:")
    yield s
    s.close()


# -- export ----------------------------------------------------------------------------------


def test_export_makes_a_readable_folder_of_markdown(notes: NotesStore, home) -> None:
    from phibe.notes import files

    stored = files.save(PNG, "pic.png")
    col = notes.upsert_collection('Plans: "Q1"/2026')
    a = notes.create("Same Title", f"First ![p](/v1/notes/files/{stored})", tags=["x", "y z"])
    notes.add_to_collection(col, a)
    notes.create("Same Title", "Second")
    notes.create("Same Title", "Third")
    notes.create("CON", "reserved name")
    notes.create("Link", kind="bookmark", url="https://x.test", description="A site")
    gone = notes.create("Old", "removed")
    notes.trash(gone)
    out = home / "out.zip"
    assert export.export_zip(notes, out) == {"notes": 6, "files": 1}
    with zipfile.ZipFile(out) as z:
        names = set(z.namelist())
        assert {"Notes/Same Title.md", "Notes/_CON.md", "Bookmarks/Link.md", "Trash/Old.md", f"files/{stored}", "index.json"} <= names
        assert any(n.startswith("Notes/Same Title (") for n in names)  # the second one with that title gets its id
        folder = next(n for n in names if n.startswith("Plans") and n.endswith(".md"))
        assert "/" not in folder.split("/", 1)[0] and ":" not in folder and '"' not in folder
        text = z.read(folder).decode("utf-8")
        assert text.startswith('---\ntitle: "Same Title"\ntags: ["x", "y z"]') and f"![p](../files/{stored})" in text
        assert "trashed: true" in z.read("Trash/Old.md").decode("utf-8")
        assert "https://x.test" in z.read("Bookmarks/Link.md").decode("utf-8")
        assert len(json.loads(z.read("index.json"))["notes"]) == 6


# -- backup --------------------------------------------------------------------------------------


def test_backup_is_checked_listed_and_pruned(tmp_path, home, monkeypatch) -> None:
    from phibe.notes import files

    store = NotesStore(tmp_path / "notes.db")
    store.create("A", "body")
    files.save(PNG, "pic.png")
    assert backup.due()
    first = backup.make_backup(store)
    assert (first["notes"], first["files"]) == (1, 1) and not backup.due()
    with zipfile.ZipFile(backup.folder() / first["name"]) as z:
        assert {"notes.db", f"notes-files/{files.save(PNG)}"} <= set(z.namelist())
    # a backup keeps the note even if it is changed afterwards
    store.create("B", "later")
    monkeypatch.setattr(backup, "KEEP", 2)
    for i in range(3):
        (backup.folder() / f"notes-2020010{i}-000000.zip").write_bytes(first_bytes := (backup.folder() / first["name"]).read_bytes())
        import os
        os.utime(backup.folder() / f"notes-2020010{i}-000000.zip", (1_600_000_000 + i, 1_600_000_000 + i))
    newest = backup.make_backup(store)
    assert newest["notes"] == 2
    assert len(backup.list_backups()) == 2 and backup.list_backups()[0]["name"] == newest["name"]
    store.close()


def test_a_damaged_backup_is_refused(home) -> None:
    folder = backup.folder()
    folder.mkdir(parents=True)
    bad = folder / "notes-bad.zip"
    with zipfile.ZipFile(bad, "w") as z:
        z.writestr("notes.db", b"this is not a database")
    with pytest.raises((sqlite3.DatabaseError, ValueError)):
        backup.verify(bad)


def test_a_deleted_file_waits_in_the_trash_and_can_come_back(home) -> None:
    from phibe.notes import files

    name = files.save(PNG)
    assert files.remove(name) and files.path_of(name) is None
    assert [t[0] for t in files.trashed()] == [name]
    assert files.restore(name) and files.path_of(name) is not None and files.trashed() == []
    files.remove(name)
    assert files.purge(name) and files.trashed() == [] and not files.restore(name)
