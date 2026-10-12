import io
import zipfile

from phibe.speech import gpu_pack


def wheel(files: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def test_picks_the_windows_wheel_and_skips_the_rest():
    files = [
        {"filename": "x-12-py3-none-manylinux_2_27_x86_64.whl", "url": "linux"},
        {"filename": "x-12-py3-none-win_amd64.whl", "url": "win"},
    ]
    assert gpu_pack.pick_wheel(files)["url"] == "win"
    assert gpu_pack.pick_wheel(files[:1]) is None


def test_only_the_nvidia_folder_of_a_wheel_is_unpacked(tmp_path):
    data = wheel({"nvidia/cublas/bin/cublas64_12.dll": b"dll", "x-12.dist-info/METADATA": b"meta"})
    gpu_pack.extract_wheel(data, tmp_path)
    assert (tmp_path / "nvidia/cublas/bin/cublas64_12.dll").read_bytes() == b"dll"
    assert not (tmp_path / "x-12.dist-info").exists()


def test_installed_needs_both_libraries_and_enabled_needs_the_flag(tmp_path):
    assert not gpu_pack.is_installed(tmp_path)
    for sub, dll in gpu_pack.MARKERS:
        (tmp_path / sub).mkdir(parents=True)
        (tmp_path / sub / dll).write_bytes(b"x")
    assert gpu_pack.is_installed(tmp_path) and not gpu_pack.is_enabled(tmp_path)
    gpu_pack.set_enabled(True, tmp_path)
    assert gpu_pack.is_enabled(tmp_path)
    gpu_pack.set_enabled(False, tmp_path)
    assert not gpu_pack.is_enabled(tmp_path)


def test_status_of_an_empty_pack(tmp_path):
    s = gpu_pack.status(tmp_path)
    assert (s["installed"], s["enabled"], s["downloading"], s["progress"]) == (False, False, False, 0.0)
