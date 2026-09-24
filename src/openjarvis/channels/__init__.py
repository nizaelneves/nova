"""Channel abstraction for multi-platform messaging."""

import importlib

from openjarvis.channels._stubs import (
    BaseChannel,
    ChannelHandler,
    ChannelMessage,
    ChannelStatus,
)

# Trigger registration of built-in channels.
# Each module uses @ChannelRegistry.register() — importing is sufficient.
_CHANNEL_MODULES = [
    "telegram",
    "whatsapp",
    "whatsapp_baileys",
    "gmail",
]

for _mod in _CHANNEL_MODULES:
    try:
        importlib.import_module(f".{_mod}", __name__)
    except ImportError:
        pass

__all__ = [
    "BaseChannel",
    "ChannelHandler",
    "ChannelMessage",
    "ChannelStatus",
]
