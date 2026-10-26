"""Regression tests for the connectors-router OAuth flow (issue #512).

These tests reproduce the three coupled defects that prevented Google Drive
(and its Google siblings) from ever completing OAuth and appearing in Data
Sources, and assert the fixed behaviour:

(A/B) ``POST /connect`` with a pasted ``client_id:client_secret`` pair must
      persist the client credentials and return an ``oauth_required`` directive
      pointing at ``/oauth/start`` — NOT silently spawn a background browser
      thread and report a perpetual ``pending`` state.
(C-1) ``GET /oauth/start`` must return a redirect to the provider's consent
      page (regression: HTTP 422 because ``request: Request`` was mis-bound as
      a query param under ``from __future__ import annotations`` + a local
      ``Request`` import).
(C-2) ``GET /oauth/callback`` must read ``request.base_url`` and exchange the
      code for tokens without crashing (regression: ``request`` defaulted to
      ``None`` → ``AttributeError``), persisting the access token to every
      Google credential file and flipping ``is_connected()`` to True.

All tests are hermetic: the connectors directory, the shared Google
credentials path, and every Google connector's default credentials path are
redirected to ``tmp_path`` so the suite neither depends on nor pollutes
``~/.phibe/connectors`` (a real source of spurious failures — see the
verifier note on ``resolve_google_credentials`` silently substituting the
shared file when the caller-supplied path does not yet exist on disk).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator
from unittest.mock import patch

import pytest

fastapi = pytest.importorskip("fastapi", reason="requires the 'server' extra")
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

_CLIENT_PAIR = "myid-123.apps.googleusercontent.com:GOCSPX-secret"
_CLIENT_ID = "myid-123.apps.googleusercontent.com"

_ALL_GOOGLE_FILES = (
    "google.json",
    "gdrive.json",
    "gcalendar.json",
    "gmail.json",
)


@pytest.fixture()
def hermetic_connectors(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect all Google credential paths into *tmp_path*.

    Ensures connector instances created by the router's ``_get_or_create``
    resolve to the same directory the OAuth callback writes to, and that the
    test leaves ``~/.phibe`` untouched.

    Why this is more than a one-line monkeypatch: the autouse registry-clear
    fixture causes ``_ensure_connectors_registered()`` to ``importlib.reload``
    each connector module on the first router call, which re-executes the
    module body. To survive that reload we patch ``DEFAULT_CONFIG_DIR`` at its
    *source* (``phibe.core.config``) — every connector re-derives
    ``_DEFAULT_CREDENTIALS_PATH`` from it on reload, so the tmp dir sticks.
    We also pre-register + pre-reload the connectors inside the fixture so the
    reload happens while the patch is live, then reset module state on
    teardown so a later test that imports these modules fresh is unaffected.
    """
    import importlib
    import sys

    import phibe.connectors.oauth as oauth_mod
    import phibe.core.config as config_mod
    import phibe.server.connectors_router as router_mod
    from phibe.core.registry import ConnectorRegistry

    conn_dir = tmp_path / "connectors"
    conn_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(config_mod, "DEFAULT_CONFIG_DIR", tmp_path)
    monkeypatch.setattr(oauth_mod, "_CONNECTORS_DIR", conn_dir)
    monkeypatch.setattr(
        oauth_mod, "_SHARED_GOOGLE_CREDENTIALS_PATH", str(conn_dir / "google.json")
    )

    # Force the connector modules to re-derive their default paths from the
    # patched DEFAULT_CONFIG_DIR now, before any request, and register them so
    # the router's lazy reload-on-empty-registry path is a no-op.
    google_mods = [
        "phibe.connectors.gdrive",
        "phibe.connectors.gcalendar",
        "phibe.connectors.gmail",
    ]
    for name in google_mods:
        module = importlib.import_module(name)
        # Always execute each decorator under the patched config root. Merely
        # reloading modules that happen to be cached made this fixture depend
        # on collection order and could leave the registry empty.
        importlib.reload(module)

    router_mod._instances.clear()
    yield conn_dir
    router_mod._instances.clear()
    ConnectorRegistry.clear()
    # Restore the config root before reloading. Fixture finalizers otherwise
    # run in dependency order (this teardown before monkeypatch's), which used
    # to bake the temporary directory back into module-level defaults.
    monkeypatch.undo()
    for name in google_mods:
        module = sys.modules.get(name)
        if module is not None:
            importlib.reload(module)


@pytest.fixture()
def client(hermetic_connectors: Path) -> Iterator[TestClient]:
    from phibe.server.connectors_router import create_connectors_router

    app = FastAPI()
    app.include_router(create_connectors_router())
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Defect A/B — POST /connect must not silently spawn a background OAuth thread
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "connector_id", ["gdrive", "gcalendar", "gmail"]
)
def test_connect_client_pair_returns_oauth_required_no_browser(
    client: TestClient, hermetic_connectors: Path, connector_id: str
) -> None:
    """Pasting client_id:secret persists creds + asks the UI to run the flow.

    Covers every Google connector that shares the OAuth provider, proving the
    sibling connectors are fixed too (not just gdrive).
    """
    with patch("phibe.core.open_browser") as mock_browser:
        resp = client.post(
            f"/v1/connectors/{connector_id}/connect", json={"code": _CLIENT_PAIR}
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "oauth_required"
    assert body["oauth_start"] == f"/v1/connectors/{connector_id}/oauth/start"
    assert body["connected"] is False
    # No fire-and-forget browser thread (the root cause of "nothing happens").
    mock_browser.assert_not_called()

    # Client credentials persisted to EVERY Google credential file so a single
    # consent covers all Google connectors.
    for filename in _ALL_GOOGLE_FILES:
        path = hermetic_connectors / filename
        assert path.exists(), f"{filename} not written"
        assert json.loads(path.read_text())["client_id"] == _CLIENT_ID


def test_connect_malformed_client_pair_raises_400(
    client: TestClient,
) -> None:
    """A blank secret surfaces an actionable 400 — not a silent pending state."""
    resp = client.post(
        "/v1/connectors/gdrive/connect",
        json={"code": "myid-123.apps.googleusercontent.com:"},
    )
    assert resp.status_code == 400
    assert "CLIENT_ID:CLIENT_SECRET" in resp.json()["detail"]


def test_connect_raw_token_still_handled(
    client: TestClient, hermetic_connectors: Path
) -> None:
    """A raw token (not a client pair) still flows through handle_callback."""
    resp = client.post(
        "/v1/connectors/gdrive/connect", json={"token": "ya29.raw-access-token"}
    )
    assert resp.status_code == 200, resp.text
    saved = json.loads((hermetic_connectors / "gdrive.json").read_text())
    assert saved.get("token") == "ya29.raw-access-token"


def test_google_client_pair_detection_unaffected_by_generalization(
    client: TestClient, hermetic_connectors: Path
) -> None:
    """Guard against regressing defect A/B: Google's pair must still only be
    recognized via its distinctive client ID suffix, not just any colon."""
    resp = client.post("/v1/connectors/gdrive/connect", json={"code": _CLIENT_PAIR})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "oauth_required"
    saved = json.loads((hermetic_connectors / "gdrive.json").read_text())
    assert saved["client_id"] == _CLIENT_ID


# ---------------------------------------------------------------------------
# Defect C-1 — GET /oauth/start must redirect (was HTTP 422)
# ---------------------------------------------------------------------------


def test_oauth_start_redirects_to_consent(
    client: TestClient,
) -> None:
    # First save client creds via the connect call.
    client.post("/v1/connectors/gdrive/connect", json={"code": _CLIENT_PAIR})

    resp = client.get("/v1/connectors/gdrive/oauth/start", follow_redirects=False)
    # FastAPI's RedirectResponse defaults to 307; any 3xx is a pass (was 422).
    assert resp.status_code in (302, 307), resp.text
    location = resp.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth")
    assert _CLIENT_ID in location
    # redirect_uri must point back at OUR in-process callback.
    assert "oauth%2Fcallback" in location or "oauth/callback" in location


def test_oauth_start_without_creds_returns_400(client: TestClient) -> None:
    resp = client.get("/v1/connectors/gdrive/oauth/start", follow_redirects=False)
    assert resp.status_code == 400
    assert "client credentials" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Defect C-2 — GET /oauth/callback must exchange + persist (was 500 on None)
# ---------------------------------------------------------------------------


def test_oauth_callback_exchanges_and_connects(
    client: TestClient, hermetic_connectors: Path
) -> None:
    import phibe.connectors.oauth as oauth_mod

    client.post("/v1/connectors/gdrive/connect", json={"code": _CLIENT_PAIR})

    fake_tokens = {
        "access_token": "ya29.REAL",
        "refresh_token": "1//REAL",
        "token_type": "Bearer",
        "expires_in": 3600,
        "scope": "openid https://www.googleapis.com/auth/drive.readonly",
    }
    with patch.object(oauth_mod, "_exchange_token", return_value=fake_tokens) as ex:
        resp = client.get("/v1/connectors/gdrive/oauth/callback?code=authcode123")

    assert resp.status_code == 200, resp.text
    assert "Connected!" in resp.text
    ex.assert_called_once()

    # One consent per source: the token (and the scope Google gave) is kept for this source only.
    saved = json.loads((hermetic_connectors / "gdrive.json").read_text())
    assert saved["access_token"] == "ya29.REAL" and saved["refresh_token"] == "1//REAL"
    assert "drive.readonly" in saved["scope"]
    for filename in ("gcalendar.json", "gmail.json"):
        assert "access_token" not in json.loads((hermetic_connectors / filename).read_text())
    # The shared file keeps the client id and secret and no token.
    shared = json.loads((hermetic_connectors / "google.json").read_text())
    assert set(shared) == {"client_id", "client_secret"}

    # The connector now reports connected, and GET /connectors agrees.
    from phibe.connectors.gdrive import GDriveConnector

    assert GDriveConnector().is_connected() is True

    listing = client.get("/v1/connectors").json()["connectors"]
    gdrive = next(c for c in listing if c["connector_id"] == "gdrive")
    assert gdrive["connected"] is True


def test_oauth_callback_error_param_renders_failure(client: TestClient) -> None:
    resp = client.get("/v1/connectors/gdrive/oauth/callback?error=access_denied")
    assert resp.status_code == 400
    assert "access_denied" in resp.text


def test_oauth_callback_exchange_failure_renders_error(
    client: TestClient,
) -> None:
    import phibe.connectors.oauth as oauth_mod

    client.post("/v1/connectors/gdrive/connect", json={"code": _CLIENT_PAIR})

    def _boom(*_a: Any, **_k: Any) -> dict[str, Any]:
        raise RuntimeError("token endpoint 400")

    with patch.object(oauth_mod, "_exchange_token", side_effect=_boom):
        resp = client.get("/v1/connectors/gdrive/oauth/callback?code=bad")

    assert resp.status_code == 500
    assert "Token Exchange Failed" in resp.text


# -- one consent per source, asking Google only for what the source's level needs ---------------


def test_google_scopes_follow_the_level_and_never_ask_for_more() -> None:
    from phibe.connectors.oauth import google_scopes

    api = "https://www.googleapis.com/auth/"
    only = lambda cid, lvl: {s.removeprefix(api) for s in google_scopes(cid, lvl) if s.startswith(api)}  # noqa: E731
    assert only("gmail", "read") == {"gmail.readonly"}
    assert only("gmail", "write") == only("gmail", "all") == {"gmail.modify"}  # delete is "to the trash"
    assert only("gcalendar", "read") == {"calendar.readonly"}
    assert only("gcalendar", "write") == {"calendar.readonly", "calendar.events"}
    assert all(only("gdrive", lvl) == {"drive.readonly"} for lvl in ("read", "write", "all"))
    assert google_scopes("gmail", "read")[:3] == ["openid", "email", "profile"]


def test_google_access_compares_what_the_token_allows_with_what_the_level_needs() -> None:
    from phibe.connectors.oauth import google_access

    api = "https://www.googleapis.com/auth/"
    legacy = {"scope": f"openid {api}gmail.modify {api}calendar {api}drive.readonly {api}userinfo.email"}
    assert google_access("gmail", "read", legacy)["needs_authorization"] is True  # Google allows more than Read Only
    assert google_access("gmail", "write", legacy)["needs_authorization"] is True  # still also Calendar and Drive
    assert google_access("gmail", "write", {"scope": f"openid {api}gmail.modify"})["needs_authorization"] is False
    assert google_access("gmail", "write", {"scope": f"{api}gmail.readonly"})["needs_authorization"] is True  # needs a new consent
    unknown = google_access("gmail", "read", {})
    assert (unknown["granted"], unknown["needs_authorization"]) == (None, False)


def test_a_token_saved_without_its_scope_gets_it_from_google_once(tmp_path: Path) -> None:
    from phibe.connectors.oauth import remember_token_scope, save_tokens

    path = str(tmp_path / "gmail.json")
    save_tokens(path, {"access_token": "t", "refresh_token": "r"})
    reply = type("R", (), {"status_code": 200, "json": lambda self: {"scope": "openid https://www.googleapis.com/auth/gmail.modify"}})()
    with patch("httpx.get", return_value=reply) as ask:
        assert "gmail.modify" in remember_token_scope(path)["scope"]
        assert "gmail.modify" in remember_token_scope(path)["scope"]  # the second time it is read from the file
    assert ask.call_count == 1
    save_tokens(path, {"access_token": "t"})
    with patch("httpx.get", side_effect=OSError("offline")):
        assert "scope" not in remember_token_scope(path)  # offline: unknown, nothing broken


def test_the_google_consent_asks_only_for_the_scopes_of_the_sources_level(
    client: TestClient, hermetic_connectors: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from urllib.parse import parse_qs, urlparse

    from phibe.connectors import permissions

    monkeypatch.setenv("PHIBE_HOME", str(tmp_path / "home"))
    client.post("/v1/connectors/gmail/connect", json={"code": _CLIENT_PAIR})

    def asked() -> list[str]:
        resp = client.get("/v1/connectors/gmail/oauth/start", follow_redirects=False)
        return parse_qs(urlparse(resp.headers["location"]).query)["scope"][0].split()

    assert [s.rsplit("/", 1)[-1] for s in asked() if "googleapis" in s] == ["gmail.readonly"]
    permissions.set_level("gmail", "write")
    assert [s.rsplit("/", 1)[-1] for s in asked() if "googleapis" in s] == ["gmail.modify"]


def test_the_permissions_list_says_whether_google_agrees(
    client: TestClient, hermetic_connectors: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from phibe.connectors import permissions
    from phibe.connectors.oauth import save_tokens

    monkeypatch.setenv("PHIBE_HOME", str(tmp_path / "home"))
    save_tokens(
        str(hermetic_connectors / "gmail.json"),
        {"access_token": "t", "scope": "openid https://www.googleapis.com/auth/gmail.modify"},
    )
    google = client.get("/v1/connectors/permissions").json()["gmail"]["google"]
    assert google["needs_authorization"] is True and google["expected"] == ["https://www.googleapis.com/auth/gmail.readonly"]
    permissions.set_level("gmail", "write")
    assert client.get("/v1/connectors/permissions").json()["gmail"]["google"]["needs_authorization"] is False
