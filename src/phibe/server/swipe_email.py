"""Turn an e-mail's web-view link into one PDF, drawn by a real browser so it looks like it does in the browser.

The PDF is a single page as tall as the e-mail: text stays sharp and nothing is cut in the middle.
Tracking pixels are blocked, so saving it does not tell the sender the e-mail was opened.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Tuple

WIDTH = 800  # most e-mails are 600-700px wide; this leaves a little air around them
TRACKERS = re.compile(r"open\.aspx|/track/|/open\?|pixel", re.I)


def render_pdf(url: str, dest_dir: Path, name: str | None) -> Tuple[Path, str]:
    """Print ``url`` into ``dest_dir`` as ``<name or page title>.pdf``. Never overwrites: a number is added instead."""
    from phibe.server.swipe_routes import clean

    if not re.match(r"https?://", url):
        raise ValueError("Paste a link that starts with http:// or https://")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise ValueError("Saving from a link needs the browser extra: run  uv sync --extra browser")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")  # the Edge that comes with Windows: nothing to download
        try:
            page = browser.new_page(viewport={"width": WIDTH, "height": 900}, device_scale_factor=2)
            page.route("**/*", lambda r: r.abort() if TRACKERS.search(r.request.url) else r.continue_())
            page.goto(url, wait_until="networkidle", timeout=45000)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")  # wake lazy images
            page.wait_for_timeout(500)
            title = clean(name or "") or clean(page.title()) or "Email"
            height = page.evaluate("Math.ceil(document.documentElement.scrollHeight)")
            dest_dir.mkdir(parents=True, exist_ok=True)
            out, n = dest_dir / f"{title}.pdf", 2
            while out.exists():
                out, n = dest_dir / f"{title} ({n}).pdf", n + 1
            page.pdf(path=str(out), width=f"{WIDTH}px", height=f"{height + 2}px", print_background=True,
                     margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
        finally:
            browser.close()
    return out, title
