"""The module boundaries in pyproject.toml ([tool.importlinter]) hold."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_import_contracts_hold() -> None:
    result = subprocess.run(
        [sys.executable, "-c", "from importlinter.cli import lint_imports_command as m; m()"],
        cwd=ROOT, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
