"""Tests for channel configuration — nested sub-configs and TOML loading."""

from __future__ import annotations

import tempfile
from pathlib import Path

from nova.core.config import (
    ChannelConfig,
    TelegramChannelConfig,
    WhatsAppChannelConfig,
    load_config,
)


class TestChannelConfig:
    def test_defaults(self):
        cfg = ChannelConfig()
        assert cfg.enabled is False
        assert cfg.default_channel == ""
        assert cfg.default_agent == "simple"

    def test_nested_defaults(self):
        cfg = ChannelConfig()
        assert isinstance(cfg.telegram, TelegramChannelConfig)
        assert isinstance(cfg.whatsapp, WhatsAppChannelConfig)

    def test_telegram_defaults(self):
        cfg = TelegramChannelConfig()
        assert cfg.bot_token == ""
        assert cfg.allowed_chat_ids == ""
        assert cfg.parse_mode == "Markdown"

    def test_whatsapp_defaults(self):
        cfg = WhatsAppChannelConfig()
        assert cfg.access_token == ""
        assert cfg.phone_number_id == ""


class TestTomlLoading:
    def _write_toml(self, content: str) -> Path:
        f = tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".toml",
            delete=False,
        )
        f.write(content)
        f.flush()
        f.close()
        return Path(f.name)

    def test_load_channel_top_level(self):
        path = self._write_toml("""
[channel]
enabled = true
default_channel = "telegram"
""")
        try:
            cfg = load_config(path)
            assert cfg.channel.enabled is True
            assert cfg.channel.default_channel == "telegram"
        finally:
            path.unlink()

    def test_load_channel_telegram(self):
        path = self._write_toml("""
[channel]
enabled = true
default_channel = "telegram"

[channel.telegram]
bot_token = "123:ABC"
parse_mode = "HTML"
""")
        try:
            cfg = load_config(path)
            assert cfg.channel.telegram.bot_token == "123:ABC"
            assert cfg.channel.telegram.parse_mode == "HTML"
        finally:
            path.unlink()

    def test_load_channel_whatsapp(self):
        path = self._write_toml("""
[channel.whatsapp]
access_token = "wa-token"
phone_number_id = "123"
""")
        try:
            cfg = load_config(path)
            assert cfg.channel.whatsapp.access_token == "wa-token"
            assert cfg.channel.whatsapp.phone_number_id == "123"
        finally:
            path.unlink()

    def test_backward_compat_no_default_channel(self):
        """Old config without default_channel still works."""
        path = self._write_toml("""
[channel]
enabled = false
""")
        try:
            cfg = load_config(path)
            assert cfg.channel.enabled is False
            assert cfg.channel.default_channel == ""
        finally:
            path.unlink()

    def test_multiple_channel_configs(self):
        path = self._write_toml("""
[channel]
enabled = true
default_channel = "whatsapp"

[channel.telegram]
bot_token = "tg-token"

[channel.whatsapp]
access_token = "wa-token"
""")
        try:
            cfg = load_config(path)
            assert cfg.channel.default_channel == "whatsapp"
            assert cfg.channel.telegram.bot_token == "tg-token"
            assert cfg.channel.whatsapp.access_token == "wa-token"
        finally:
            path.unlink()
