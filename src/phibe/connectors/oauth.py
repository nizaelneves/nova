"""Shared OAuth 2.0 helpers for all connectors.

Provides:
- ``OAuthProvider`` registry with configs for Google
- Generic ``run_connector_oauth()`` that opens browser + catches callback
- URL builder, token persistence, and token cleanup utilities
"""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode

from phibe.core import open_browser
from phibe.core.config import DEFAULT_CONFIG_DIR

# ---------------------------------------------------------------------------
# Connector credentials directory
# ---------------------------------------------------------------------------

_CONNECTORS_DIR = DEFAULT_CONFIG_DIR / "connectors"

# ---------------------------------------------------------------------------
# OAuth provider registry
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OAuthProvider:
    """Configuration for an OAuth 2.0 provider."""

    name: str  # "google"
    display_name: str
    auth_endpoint: str
    token_endpoint: str
    scopes: List[str]
    setup_url: str  # URL where user creates OAuth credentials
    setup_hint: str  # One-line instruction for setup
    callback_port: int = 8789
    callback_host: str = "127.0.0.1"
    callback_path: str = "/callback"
    token_auth: str = "body"  # "body" or "basic"
    extra_auth_params: Dict[str, str] = field(default_factory=dict)
    # Which connector IDs this provider covers (one flow → all connected)
    connector_ids: Tuple[str, ...] = ()
    # Filenames in ~/.phibe/connectors/ to save tokens to
    credential_files: Tuple[str, ...] = ()


# Combined scopes for all Google connectors so a single OAuth consent
# authorises Drive, Calendar and Gmail at once.
GOOGLE_ALL_SCOPES: List[str] = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.readonly",
    # calendar (not .readonly) so the proactive agent can accept/decline events.
    "https://www.googleapis.com/auth/calendar",
    # gmail.modify (a superset of gmail.readonly) so the proactive agent
    # can trash and label-modify (archive) emails after user approval.
    "https://www.googleapis.com/auth/gmail.modify",
]

OAUTH_PROVIDERS: Dict[str, OAuthProvider] = {
    "google": OAuthProvider(
        name="google",
        display_name="Google",
        auth_endpoint="https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint="https://oauth2.googleapis.com/token",
        scopes=GOOGLE_ALL_SCOPES,
        setup_url="https://console.cloud.google.com/apis/credentials",
        setup_hint="Create an OAuth 2.0 Client ID (Desktop app type)",
        extra_auth_params={"access_type": "offline", "prompt": "consent"},
        connector_ids=(
            "gdrive",
            "gcalendar",
            "gmail",
        ),
        credential_files=(
            "google.json",
            "gdrive.json",
            "gcalendar.json",
            "gmail.json",
        ),
    ),
}


_GOOGLE_API = "https://www.googleapis.com/auth/"

# The Google permissions each source asks for, by what Phibe may do with it (see connectors/permissions.py).
# Delete in Gmail is "move to the trash", which gmail.modify allows, so Can Write and Full Access ask the same.
_GOOGLE_SCOPES: Dict[str, Dict[str, List[str]]] = {
    "gdrive": {"read": [_GOOGLE_API + "drive.readonly"]},
    "gcalendar": {
        "read": [_GOOGLE_API + "calendar.readonly"],
        "write": [_GOOGLE_API + "calendar.readonly", _GOOGLE_API + "calendar.events"],
    },
    "gmail": {"read": [_GOOGLE_API + "gmail.readonly"], "write": [_GOOGLE_API + "gmail.modify"]},
}


def google_scopes(connector_id: str, level: str) -> List[str]:
    """What to ask Google for so a source can do what its level allows, and nothing more."""
    steps = _GOOGLE_SCOPES[connector_id]
    chosen = steps["read"] if level == "read" else steps.get(level) or steps.get("write") or steps["read"]
    return ["openid", "email", "profile", *chosen]


def _api_scopes(scope: str) -> set:
    return {s for s in scope.split() if s.startswith(_GOOGLE_API) and "userinfo" not in s}


def google_access(connector_id: str, level: str, tokens: Dict[str, Any]) -> Dict[str, Any]:
    """What Google lets this source do (from the saved token) against what its level needs.

    ``granted`` is ``None`` when the token does not say; ``needs_authorization`` is true when they differ,
    either because Google allows more than the level (narrow it) or less (the level needs a new consent).
    """
    expected = _api_scopes(" ".join(google_scopes(connector_id, level)))
    scope = tokens.get("scope")
    if not isinstance(scope, str) or not scope:
        return {"expected": sorted(expected), "granted": None, "needs_authorization": False}
    granted = _api_scopes(scope)
    return {"expected": sorted(expected), "granted": sorted(granted), "needs_authorization": granted != expected}


def remember_token_scope(path: str) -> Dict[str, Any]:
    """The saved token of *path*. One saved before Phibe kept the scope gets it from Google once and keeps it."""
    tokens = load_tokens(path) or {}
    if tokens.get("scope") or not tokens.get("access_token"):
        return tokens
    import httpx

    try:
        token = tokens["access_token"]
        for attempt in (1, 2):
            info = httpx.get("https://oauth2.googleapis.com/tokeninfo", params={"access_token": token}, timeout=15.0)
            if info.status_code == 200 or attempt == 2:
                break
            token = refresh_google_token(path) or token  # the access token had expired
        if info.status_code == 200 and info.json().get("scope"):
            tokens = {**(load_tokens(path) or tokens), "scope": info.json()["scope"]}
            save_tokens(path, tokens)
    except (httpx.HTTPError, OSError, ValueError):
        pass  # offline: the scope stays unknown for now
    return tokens


def keep_only_google_client_in_shared_file() -> None:
    """The shared google.json keeps the client id and secret and no token, so a source cannot fall back to a
    token with more access than its own. Only done once every Google source has a file of its own."""
    own = [_CONNECTORS_DIR / f"{c}.json" for c in _GOOGLE_SCOPES]
    shared = load_tokens(_SHARED_GOOGLE_CREDENTIALS_PATH)
    if shared and all(p.exists() for p in own):
        save_tokens(_SHARED_GOOGLE_CREDENTIALS_PATH, {k: shared[k] for k in ("client_id", "client_secret") if k in shared})


def get_provider_for_connector(connector_id: str) -> Optional[OAuthProvider]:
    """Return the OAuthProvider that covers *connector_id*, or ``None``."""
    for provider in OAUTH_PROVIDERS.values():
        if connector_id in provider.connector_ids:
            return provider
    return None


# ---------------------------------------------------------------------------
# Credential helpers
# ---------------------------------------------------------------------------


def get_client_credentials(
    provider: OAuthProvider,
) -> Optional[Tuple[str, str]]:
    """Load stored client_id and client_secret for *provider*.

    Checks credential files in ``~/.phibe/connectors/`` and falls
    back to environment variables ``PHIBE_{NAME}_CLIENT_ID`` and
    ``PHIBE_{NAME}_CLIENT_SECRET``.
    """
    # Check credential files
    for filename in provider.credential_files:
        path = _CONNECTORS_DIR / filename
        tokens = load_tokens(str(path))
        if tokens and tokens.get("client_id") and tokens.get("client_secret"):
            return tokens["client_id"], tokens["client_secret"]

    # Check environment variables
    prefix = f"PHIBE_{provider.name.upper()}"
    env_id = os.environ.get(f"{prefix}_CLIENT_ID", "")
    env_secret = os.environ.get(f"{prefix}_CLIENT_SECRET", "")
    if env_id and env_secret:
        return env_id, env_secret

    return None


def save_client_credentials(
    provider: OAuthProvider,
    client_id: str,
    client_secret: str,
) -> None:
    """Persist client credentials so the user never has to enter them again."""
    for filename in provider.credential_files:
        path = _CONNECTORS_DIR / filename
        existing = load_tokens(str(path)) or {}
        existing["client_id"] = client_id
        existing["client_secret"] = client_secret
        save_tokens(str(path), existing)


# ---------------------------------------------------------------------------
# Shared credentials file — one OAuth flow covers all Google connectors
# ---------------------------------------------------------------------------

_SHARED_GOOGLE_CREDENTIALS_PATH: str = str(_CONNECTORS_DIR / "google.json")

_GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
_DEFAULT_REDIRECT_URI = "http://localhost:8789/callback"
_DEFAULT_SCOPES: List[str] = ["openid", "email", "profile"]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_google_auth_url(
    client_id: str,
    redirect_uri: str = _DEFAULT_REDIRECT_URI,
    scopes: Optional[List[str]] = None,
) -> str:
    """Build a Google OAuth2 consent URL.

    Parameters
    ----------
    client_id:
        The OAuth 2.0 client ID from the Google Cloud Console.
    redirect_uri:
        Where Google should redirect after consent. Defaults to the local
        callback server at ``http://localhost:8789/callback``.
    scopes:
        List of OAuth scopes to request.  Defaults to
        ``["openid", "email", "profile"]``.

    Returns
    -------
    str
        Full consent URL including query string.
    """
    if scopes is None:
        scopes = _DEFAULT_SCOPES

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"{_GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}"


def resolve_google_credentials(connector_path: str) -> str:
    """Return the best available Google credentials file path.

    Checks the connector-specific file first, then falls back to the
    shared ``google.json``.  Returns *connector_path* if neither exists
    (so ``is_connected()`` correctly returns ``False``).
    """
    if Path(connector_path).exists():
        return connector_path
    if Path(_SHARED_GOOGLE_CREDENTIALS_PATH).exists():
        return _SHARED_GOOGLE_CREDENTIALS_PATH
    return connector_path


def load_tokens(path: str) -> Optional[Dict[str, Any]]:
    """Load OAuth tokens from a JSON file.

    Returns ``None`` if the file is missing, unreadable, or contains
    invalid JSON.
    """
    p = Path(path)
    if not p.exists():
        return None
    try:
        raw = p.read_text(encoding="utf-8")
        return json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return None


def save_tokens(path: str, tokens: Dict[str, Any]) -> None:
    """Persist *tokens* to *path* as JSON with owner-only (0o600) permissions.

    Creates parent directories as needed.
    """
    from phibe.security.file_utils import secure_write_json

    secure_write_json(Path(path), tokens)


def require_access_token(tokens: Any) -> str:
    """Return a non-empty OAuth access token or reject the response.

    Client registration credentials and error-shaped token responses are not
    authenticated sessions.  Centralizing this check keeps every OAuth entry
    point from persisting a false-success credential file.
    """
    if not isinstance(tokens, dict):
        raise RuntimeError("OAuth token response was not a JSON object")
    access_token = tokens.get("access_token")
    if not isinstance(access_token, str) or not access_token.strip():
        raise RuntimeError("OAuth token response did not include an access_token")
    return access_token.strip()


def delete_tokens(path: str) -> None:
    """Delete the credentials file at *path* if it exists."""
    p = Path(path)
    if p.exists():
        p.unlink()


def refresh_google_token(path: str) -> Optional[str]:
    """Refresh a Google access token using the stored refresh token.

    Reads the credentials file at *path*, exchanges its ``refresh_token``
    (plus ``client_id``/``client_secret``) for a new ``access_token``
    against Google's OAuth token endpoint, persists the refreshed payload
    back to *path*, and returns the new access token.

    Returns ``None`` if any required field is missing or the refresh call
    fails (network error or Google returns a non-2xx response — typically
    ``invalid_grant`` when the refresh token has been revoked).
    """
    import httpx

    tokens = load_tokens(path)
    if not tokens:
        return None
    refresh_token = tokens.get("refresh_token")
    client_id = tokens.get("client_id")
    client_secret = tokens.get("client_secret")
    if not (refresh_token and client_id and client_secret):
        return None

    try:
        resp = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=15.0,
        )
    except httpx.HTTPError:
        return None
    if resp.status_code >= 400:
        return None

    body = resp.json()
    new_access = body.get("access_token")
    if not new_access:
        return None

    tokens.update(
        {
            "access_token": new_access,
            "token": new_access,  # legacy key used by some connectors
            "token_type": body.get("token_type", tokens.get("token_type", "Bearer")),
            "expires_in": body.get("expires_in", tokens.get("expires_in", 3600)),
        }
    )
    save_tokens(path, tokens)
    return new_access


# ---------------------------------------------------------------------------
# Token exchange & full OAuth flow
# ---------------------------------------------------------------------------


def exchange_google_token(
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str = _DEFAULT_REDIRECT_URI,
) -> Dict[str, Any]:
    """Exchange an authorization code for access + refresh tokens.

    Parameters
    ----------
    code:
        The authorization code received from Google's consent redirect.
    client_id:
        OAuth 2.0 client ID.
    client_secret:
        OAuth 2.0 client secret.
    redirect_uri:
        Must match the redirect URI used when obtaining the auth code.

    Returns
    -------
    dict
        Token response containing ``access_token``, ``refresh_token``,
        ``token_type``, and ``expires_in``.
    """
    import httpx

    resp = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    tokens = resp.json()
    require_access_token(tokens)
    return tokens


# ---------------------------------------------------------------------------
# Generic OAuth flow — works with any OAuthProvider
# ---------------------------------------------------------------------------


def _wait_for_callback_code(
    host: str = "127.0.0.1",
    port: int = 8789,
    path: str = "/callback",
    timeout: int = 120,
) -> str:
    """Start a localhost HTTP server and wait for ``?code=`` on *path*.

    Returns the authorization code received from the OAuth redirect.
    """
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from urllib.parse import parse_qs, urlparse

    auth_code: List[str] = []
    error: List[str] = []

    class _Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            params = parse_qs(urlparse(self.path).query)
            if "code" in params:
                auth_code.append(params["code"][0])
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(
                    b"<html><body style='font-family:system-ui;text-align:center;"
                    b"padding:60px'>"
                    b"<h2 style='color:#22c55e'>Connected!</h2>"
                    b"<p>You can close this tab and return to Phibe.</p>"
                    b"</body></html>"
                )
            elif "error" in params:
                error.append(params.get("error", ["unknown"])[0])
                self.send_response(400)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(
                    b"<html><body style='font-family:system-ui;text-align:center;"
                    b"padding:60px'>"
                    b"<h2 style='color:#ef4444'>Authorization Failed</h2>"
                    b"<p>Please close this tab and try again.</p>"
                    b"</body></html>"
                )
            else:
                self.send_response(400)
                self.end_headers()

        def log_message(self, *_args: Any) -> None:
            pass

    # Ensure port is free
    import socket

    test_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        test_sock.bind((host, port))
    except OSError:
        pass
    finally:
        test_sock.close()

    import time

    time.sleep(0.3)

    server = HTTPServer((host, port), _Handler)
    server.timeout = timeout

    while not auth_code and not error:
        server.handle_request()
    server.server_close()

    if error:
        raise RuntimeError(f"OAuth authorization denied: {error[0]}")
    if not auth_code:
        raise RuntimeError("OAuth callback timed out")
    return auth_code[0]


def _exchange_token(
    provider: OAuthProvider,
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> Dict[str, Any]:
    """Exchange an authorization *code* for tokens using *provider* config."""
    import httpx

    data: Dict[str, str] = {
        "code": code,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    headers: Dict[str, str] = {}

    if provider.token_auth == "basic":
        creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        headers["Authorization"] = f"Basic {creds}"
    else:
        data["client_id"] = client_id
        data["client_secret"] = client_secret

    resp = httpx.post(provider.token_endpoint, data=data, headers=headers, timeout=30.0)
    resp.raise_for_status()
    tokens = resp.json()
    require_access_token(tokens)
    return tokens


def run_connector_oauth(
    connector_id: str,
    client_id: str = "",
    client_secret: str = "",
) -> Dict[str, Any]:
    """Run a complete OAuth flow for *connector_id*.

    1. Look up the ``OAuthProvider``
    2. Resolve client credentials (arg → stored → env)
    3. Build auth URL and open the user's browser
    4. Start localhost callback server and wait for the code
    5. Exchange the code for tokens
    6. Save tokens to all relevant credential files

    Returns the raw token response dict.
    """

    provider = get_provider_for_connector(connector_id)
    if provider is None:
        raise ValueError(f"No OAuth provider configured for '{connector_id}'")

    # Resolve credentials
    if not (client_id and client_secret):
        creds = get_client_credentials(provider)
        if creds:
            client_id, client_secret = creds
    if not (client_id and client_secret):
        raise RuntimeError(
            f"No client credentials for {provider.display_name}. "
            f"Set them up at: {provider.setup_url}"
        )

    redirect_uri = (
        f"http://{provider.callback_host}:{provider.callback_port}"
        f"{provider.callback_path}"
    )

    # Build auth URL
    params: Dict[str, str] = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(provider.scopes),
        **provider.extra_auth_params,
    }
    auth_url = f"{provider.auth_endpoint}?{urlencode(params)}"

    # Open browser and wait for callback
    open_browser(auth_url)
    code = _wait_for_callback_code(
        host=provider.callback_host,
        port=provider.callback_port,
        path=provider.callback_path,
    )

    # Exchange code for tokens
    tokens = _exchange_token(provider, code, client_id, client_secret, redirect_uri)
    access_token = require_access_token(tokens)

    # Build payload with client credentials included (needed for refresh)
    payload = {
        "access_token": access_token,
        "refresh_token": tokens.get("refresh_token", ""),
        "token_type": tokens.get("token_type", "Bearer"),
        "expires_in": tokens.get("expires_in", 3600),
        "client_id": client_id,
        "client_secret": client_secret,
    }

    # Save to all credential files for this provider
    for filename in provider.credential_files:
        save_tokens(str(_CONNECTORS_DIR / filename), payload)

    return tokens
