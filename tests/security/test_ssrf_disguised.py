"""SSRF: disguised-IPv4 forms are normalized and unresolvable hosts fail closed.

Regression tests for ``check_ssrf``.
"""

from __future__ import annotations

import pytest

from nova.security.ssrf import check_ssrf


class TestSSRFDisguisedForms:
    @pytest.mark.parametrize(
        "url",
        [
            "http://2130706433/",  # decimal 127.0.0.1
            "http://0x7f000001/",  # hex 127.0.0.1
            "http://0x7f.0x0.0x0.0x1/",  # dotted hex
            "http://127.1/",  # short-dotted loopback
        ],
    )
    def test_disguised_loopback_blocked(self, url):
        assert check_ssrf(url) is not None

    def test_plain_loopback_still_blocked(self):
        assert check_ssrf("http://127.0.0.1/") is not None

    def test_metadata_endpoint_blocked(self):
        assert check_ssrf("http://169.254.169.254/") is not None

    def test_unresolvable_host_fails_closed(self):
        result = check_ssrf("http://this-host-does-not-exist-zzz.invalid/")
        assert result is not None  # blocked, not silently allowed

    def test_fail_open_override(self, monkeypatch):
        monkeypatch.setenv("NOVA_SSRF_FAIL_OPEN", "1")
        assert check_ssrf("http://another-nonexistent-zzz.invalid/") is None
