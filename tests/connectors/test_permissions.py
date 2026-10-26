"""What Phibe may do with each source: Read Only until the user allows more, enforced by the source itself."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from phibe.connectors import permissions
from phibe.connectors.gcalendar import GCalendarConnector
from phibe.connectors.gmail import GmailConnector


@pytest.fixture(autouse=True)
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("PHIBE_HOME", str(tmp_path / "home"))
    return tmp_path


def test_a_source_is_read_only_until_the_user_allows_more() -> None:
    assert permissions.level_of("gmail") == "read"
    permissions.set_level("gmail", "write")
    assert permissions.level_of("gmail") == "write" and permissions.level_of("gcalendar") == "read"
    assert permissions.allowed("gmail", "write") and not permissions.allowed("gmail", "all")
    with pytest.raises(ValueError):
        permissions.set_level("gmail", "root")


def test_a_damaged_file_allows_nothing_beyond_reading(tmp_path) -> None:
    permissions.set_level("gmail", "all")
    (tmp_path / "home" / "connector_permissions.json").write_text("{not json")
    assert permissions.level_of("gmail") == "read"


def test_gmail_archive_and_delete_are_locked_by_level(tmp_path) -> None:
    gmail = GmailConnector(credentials_path=str(tmp_path / "g.json"))
    with patch.object(GmailConnector, "_call_with_refresh") as api:
        with pytest.raises(permissions.PermissionDenied, match="Read Only"):
            gmail.archive_message("m1")
        permissions.set_level("gmail", "write")
        gmail.archive_message("m1")
        with pytest.raises(permissions.PermissionDenied, match="Full Access"):
            gmail.delete_message("m1")
        permissions.set_level("gmail", "all")
        gmail.delete_message("m1")
    assert api.call_count == 2  # only the two allowed calls reached Google


def test_calendar_answers_to_invitations_need_write(tmp_path) -> None:
    cal = GCalendarConnector(credentials_path=str(tmp_path / "c.json"))
    for act in (cal.accept_event, cal.decline_event):
        with pytest.raises(permissions.PermissionDenied):
            act("e1")


def test_every_attempt_is_recorded_allowed_or_blocked(tmp_path) -> None:
    gmail = GmailConnector(credentials_path=str(tmp_path / "g.json"))
    with patch.object(GmailConnector, "_call_with_refresh"):
        with pytest.raises(permissions.PermissionDenied):
            gmail.delete_message("m1")
        permissions.set_level("gmail", "all")
        gmail.delete_message("m2")
    log = permissions.recent("gmail")
    assert [(r["action"], r["allowed"], r["detail"]) for r in log] == [("delete_message", True, "m2"), ("delete_message", False, "m1")]
    assert permissions.recent("gcalendar") == []
