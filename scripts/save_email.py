"""Save an e-mail's web-view link into the Swipe File as one PDF (the same thing Memoir's "From a Link" does).

    python scripts/save_email.py <url> [--folder Hotels] [--name "Black Friday"]
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from phibe.core.paths import get_config_dir  # noqa: E402
from phibe.server.swipe_email import render_pdf  # noqa: E402

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("url", help="the e-mail's web-view link")
ap.add_argument("--folder", default="Unsorted", help="Swipe File folder (default: Unsorted)")
ap.add_argument("--name", help="file name (default: the e-mail's title)")
a = ap.parse_args()
base = get_config_dir() / "swipe-file" / "emails"
print(render_pdf(a.url, base if a.folder == "Unsorted" else base / a.folder, a.name)[0])
