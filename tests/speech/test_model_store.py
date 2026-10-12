from phibe.speech import model_store


def test_missing_model_is_reported_as_not_installed(tmp_path):
    s = model_store.status("small", cache=tmp_path)
    assert (s["installed"], s["downloading"], s["progress"], s["size_mb"]) == (False, False, 0.0, 486)


def test_a_partial_download_shows_progress_but_is_not_installed(tmp_path):
    blobs = model_store._repo_dir("small", tmp_path) / "blobs"
    blobs.mkdir(parents=True)
    (blobs / "x.incomplete").write_bytes(b"0" * 243_000_000)
    s = model_store.status("small", cache=tmp_path)
    assert not s["installed"] and 0.45 < s["progress"] < 0.55


def test_a_finished_snapshot_is_installed(tmp_path):
    snap = model_store._repo_dir("small", tmp_path) / "snapshots" / "abc"
    snap.mkdir(parents=True)
    (snap / "model.bin").write_bytes(b"1")
    s = model_store.status("small", cache=tmp_path)
    assert s["installed"] and s["progress"] == 1.0
