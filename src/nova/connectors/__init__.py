"""Data source connectors for Deep Research."""

from nova.connectors._stubs import (
    Attachment,
    BaseConnector,
    Document,
    SyncStatus,
)
from nova.connectors.store import KnowledgeStore

__all__ = ["Attachment", "BaseConnector", "Document", "KnowledgeStore", "SyncStatus"]

# Auto-register built-in connectors
import nova.connectors.obsidian  # noqa: F401

try:
    import nova.connectors.gmail  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.gmail_imap  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.gdrive  # noqa: F401
except ImportError:
    pass  # httpx may not be installed

try:
    import nova.connectors.notion  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.granola  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.gcontacts  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.imessage  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.apple_notes  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.apple_music  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.apple_contacts  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.apple_calendar  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.slack_connector  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.outlook  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.imap  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.gcalendar  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.dropbox  # noqa: F401
except ImportError:
    pass  # httpx may not be installed

try:
    import nova.connectors.whatsapp  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.oura  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.apple_health  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.strava  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.spotify  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.google_tasks  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.weather  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.github_notifications  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.hackernews  # noqa: F401
except ImportError:
    pass

try:
    import nova.connectors.news_rss  # noqa: F401
except ImportError:
    pass
