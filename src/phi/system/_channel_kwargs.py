"""Per-channel config→kwargs mappers for ChannelRegistry.create()."""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional


def _telegram(c: Any) -> Dict[str, Any]:
    kw: Dict[str, Any] = {}
    if c.bot_token:
        kw["bot_token"] = c.bot_token
    if c.parse_mode:
        kw["parse_mode"] = c.parse_mode
    return kw


def _whatsapp(c: Any) -> Dict[str, Any]:
    kw: Dict[str, Any] = {}
    if c.access_token:
        kw["access_token"] = c.access_token
    if c.phone_number_id:
        kw["phone_number_id"] = c.phone_number_id
    return kw


def _whatsapp_baileys(c: Any) -> Dict[str, Any]:
    kw: Dict[str, Any] = {"assistant_has_own_number": c.assistant_has_own_number}
    if c.auth_dir:
        kw["auth_dir"] = c.auth_dir
    if c.assistant_name:
        kw["assistant_name"] = c.assistant_name
    return kw


# Maps channel key → (config.channel.<attr>, mapper).
# Omit a channel here to have it fall through with only {"bus": bus}.
_CHANNEL_MAPPERS: Dict[str, tuple] = {
    "telegram": ("telegram", _telegram),
    "whatsapp": ("whatsapp", _whatsapp),
    "whatsapp_baileys": ("whatsapp_baileys", _whatsapp_baileys),
}


def build_channel_kwargs(channel_config: Any, key: str) -> Dict[str, Any]:
    """Return channel-specific kwargs for ChannelRegistry.create(key, ...).

    Does not include ``bus`` — the caller adds that.
    """
    entry: Optional[tuple] = _CHANNEL_MAPPERS.get(key)
    if entry is None:
        return {}
    attr, mapper = entry
    sub_cfg: Callable[[Any], Dict[str, Any]] = getattr(channel_config, attr, None)
    if sub_cfg is None:
        return {}
    return mapper(sub_cfg)
