"""Data source connectors for Deep Research."""

from phibe.connectors._stubs import (
    Attachment,
    BaseConnector,
    Document,
    SyncStatus,
)
from phibe.connectors.store import KnowledgeStore

__all__ = ["Attachment", "BaseConnector", "Document", "KnowledgeStore", "SyncStatus"]

# Auto-register built-in connectors
import phibe.connectors.obsidian  # noqa: F401

try:
    import phibe.connectors.gmail  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.gmail_imap  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.gdrive  # noqa: F401
except ImportError:
    pass  # httpx may not be installed

try:
    import phibe.connectors.notion  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.anytype  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.granola  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.gcontacts  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.imessage  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.apple_notes  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.apple_music  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.apple_contacts  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.apple_calendar  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.slack_connector  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.outlook  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.imap  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.gcalendar  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.dropbox  # noqa: F401
except ImportError:
    pass  # httpx may not be installed

try:
    import phibe.connectors.whatsapp  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.oura  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.apple_health  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.strava  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.spotify  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.google_tasks  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.weather  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.github_notifications  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.hackernews  # noqa: F401
except ImportError:
    pass

try:
    import phibe.connectors.news_rss  # noqa: F401
except ImportError:
    pass
