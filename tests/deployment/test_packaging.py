"""Guards for the phibe-rust packaging split (#584 / #615).

``phibe_rust`` is the native PyO3 extension. It is NOT published to PyPI,
so it must not appear in the published ``desktop`` extra — listing it there
breaks ``pip install phibe[desktop]`` at install time. Nothing in the
packaged desktop extra may depend on it.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tarfile
import zipfile
from pathlib import Path

import pytest
import tomllib

ROOT = Path(__file__).resolve().parent.parent.parent
PYPROJECT = ROOT / "pyproject.toml"
QUICKSTART_SH = ROOT / "scripts" / "quickstart.sh"
CLAUDE_RUNNER = ROOT / "src" / "phibe" / "agents" / "claude_code_runner"


def _pyproject() -> dict:
    return tomllib.loads(PYPROJECT.read_text())


def test_python310_speech_extras_use_installable_onnxruntime() -> None:
    extras = _pyproject()["project"]["optional-dependencies"]
    constraint = "onnxruntime<1.24; python_version < '3.11'"

    assert constraint in extras["desktop"]
    assert constraint in extras["speech"]


def test_claude_runner_wheel_maps_only_runtime_files() -> None:
    wheel = _pyproject()["tool"]["hatch"]["build"]["targets"]["wheel"]
    force_include = wheel["force-include"]
    source = "src/phibe/agents/claude_code_runner"

    assert source not in force_include
    for filename in ("index.mjs", "package.json"):
        assert force_include[f"{source}/{filename}"] == (
            f"_node_modules/claude_code_runner/{filename}"
        )
        assert (CLAUDE_RUNNER / filename).is_file()
    assert f"/{source}" in wheel["exclude"]


def test_sdist_omits_desktop_binaries_and_rebuilds_runtime_wheel(tmp_path) -> None:
    uv = shutil.which("uv")
    if uv is None:
        pytest.skip("uv is required for archive-content validation")

    project = tmp_path / "project"
    project.mkdir()
    runtime_sources = (
        "src/phibe/__init__.py",
        "src/phibe/templates/data/assistant.toml",
    )
    force_include = _pyproject()["tool"]["hatch"]["build"]["targets"]["wheel"][
        "force-include"
    ]
    for relative in (
        "pyproject.toml",
        ".gitignore",
        "README.md",
        "LICENSE",
        *runtime_sources,
    ):
        destination = project / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / relative, destination)
    for relative in force_include:
        source, destination = ROOT / relative, project / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.is_dir():
            shutil.copytree(
                source,
                destination,
                ignore=shutil.ignore_patterns("node_modules", "__pycache__"),
            )
        else:
            shutil.copy2(source, destination)

    binary_dirs = ("desktop/src-tauri/binaries", "frontend/src-tauri/binaries")
    for relative in binary_dirs:
        directory = project / relative
        directory.mkdir(parents=True)
        (directory / "bundled-native-executable").write_bytes(b"native binary")
    # Keep buildable desktop source; only prebuilt executables are excluded.
    desktop_source = "frontend/src-tauri/src/lib.rs"
    (project / desktop_source).parent.mkdir(parents=True)
    (project / desktop_source).write_text("// desktop source\n")
    generated_assets = {
        "src/phibe/server/static/index.html": ('<script src="assets/app.js"></script>'),
        "src/phibe/server/static/assets/app.js": "// generated frontend\n",
    }
    for relative, contents in generated_assets.items():
        asset = project / relative
        asset.parent.mkdir(parents=True, exist_ok=True)
        asset.write_text(contents)

    dist = tmp_path / "dist"
    # uv's default build creates the wheel from the newly built sdist.
    subprocess.run(
        [uv, "build", "--out-dir", str(dist)],
        cwd=project,
        env=os.environ | {"SETUPTOOLS_SCM_PRETEND_VERSION": "1.0.0"},
        check=True,
        capture_output=True,
        text=True,
        timeout=90,
    )
    with tarfile.open(next(dist.glob("*.tar.gz"))) as archive:
        source_files = {member.name.split("/", 1)[1] for member in archive.getmembers()}
    assert not any(
        name.startswith(f"{directory}/")
        for name in source_files
        for directory in binary_dirs
    )
    assert desktop_source in source_files
    assert set(runtime_sources) <= source_files
    assert set(generated_assets) <= source_files
    with zipfile.ZipFile(next(dist.glob("*.whl"))) as archive:
        wheel_files = set(archive.namelist())
    assert {source.removeprefix("src/") for source in runtime_sources} <= wheel_files
    assert {source.removeprefix("src/") for source in generated_assets} <= wheel_files
    for source, destination in force_include.items():
        if (project / source).is_file():
            assert destination in wheel_files
        else:
            for path in (project / source).rglob("*"):
                if path.is_file():
                    assert f"{destination}/{path.relative_to(project / source)}" in (
                        wheel_files
                    )
