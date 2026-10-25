#!/usr/bin/env python3
"""Run the OAuth flow for Google.

Usage:
    uv run python scripts/oauth_all.py [--google]
"""

from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

from phibe.core import open_browser

CONFIG_DIR = Path.home() / ".phibe" / "connectors"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

CALLBACK_PORT = 8789
REDIRECT_URI = f"http://localhost:{CALLBACK_PORT}/callback"

# ── Credentials (read from stored files, then env vars) ──────────────────────


def _load_creds(filename: str) -> Dict[str, str]:
    """Load client_id/client_secret from a stored credential file."""
    path = CONFIG_DIR / filename
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return {
                "client_id": data.get("client_id", ""),
                "client_secret": data.get("client_secret", ""),
            }
        except (json.JSONDecodeError, OSError):
            pass
    return {"client_id": "", "client_secret": ""}


_google = _load_creds("google.json")
GOOGLE_CLIENT_ID = (
    os.environ.get("PHIBE_GOOGLE_CLIENT_ID", "") or _google["client_id"]
)
GOOGLE_CLIENT_SECRET = (
    os.environ.get("PHIBE_GOOGLE_CLIENT_SECRET", "")
    or _google["client_secret"]
)


# ── Generic OAuth helpers ────────────────────────────────────────────────────


def _wait_for_code(port: int = CALLBACK_PORT, timeout: int = 120) -> str:
    """Start a localhost server and wait for the OAuth callback with ?code=."""
    auth_code: List[str] = []
    error: List[str] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            params = parse_qs(urlparse(self.path).query)
            if "code" in params:
                auth_code.append(params["code"][0])
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(
                    b"<html><body><h2>Success!</h2>"
                    b"<p>You can close this tab.</p></body></html>"
                )
            else:
                error.append(params.get("error", ["unknown"])[0])
                self.send_response(400)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(b"<html><body><h2>Failed</h2></body></html>")

        def log_message(self, *args: Any) -> None:
            pass

    server = HTTPServer(("127.0.0.1", port), Handler)
    server.timeout = timeout
    while not auth_code and not error:
        server.handle_request()
    server.server_close()

    if error:
        raise RuntimeError(f"OAuth error: {error[0]}")
    if not auth_code:
        raise RuntimeError("OAuth timed out")
    return auth_code[0]


def _save(path: Path, data: Dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    path.chmod(0o600)
    print(f"  Saved tokens to {path}")


# ── Google ───────────────────────────────────────────────────────────────────


def do_google() -> None:
    print("\n=== Google OAuth (Drive, Calendar, Contacts, Gmail, Tasks) ===")
    scopes = [
        "openid", "email", "profile",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/tasks.readonly",
    ]
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        + urlencode({
            "client_id": GOOGLE_CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
            "response_type": "code",
            "scope": " ".join(scopes),
            "access_type": "offline",
            "prompt": "consent",
        })
    )
    print("  Opening browser...")
    open_browser(url)
    code = _wait_for_code()

    resp = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    tokens = resp.json()

    payload = {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "token_type": tokens.get("token_type", "Bearer"),
        "expires_in": tokens.get("expires_in", 3600),
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
    }

    # Save to shared + all connector-specific files
    for name in ["google", "gdrive", "gcalendar", "gmail"]:
        _save(CONFIG_DIR / f"{name}.json", payload)

    print("  Google OAuth complete!")


# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run OAuth flows for Phibe connectors"
    )
    parser.add_argument("--google", action="store_true", help="Only Google")
    args = parser.parse_args()

    do_google()

    print("\nDone! The OAuth flow is complete.")
