"""Data source connectors for Deep Research."""

from phi.connectors._stubs import (
    Attachment,
    BaseConnector,
    Document,
    SyncStatus,
)
from phi.connectors.store import KnowledgeStore

__all__ = ["Attachment", "BaseConnector", "Document", "KnowledgeStore", "SyncStatus"]

# Auto-register built-in connectors
import phi.connectors.obsidian  # noqa: F401

try:
    import phi.connectors.gmail  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.gmail_imap  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.gdrive  # noqa: F401
except ImportError:
    pass  # httpx may not be installed

try:
    import phi.connectors.notion  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.anytype  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.granola  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.gcontacts  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.imessage  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.apple_notes  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.apple_music  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.apple_contacts  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.apple_calendar  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.slack_connector  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.outlook  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.imap  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.gcalendar  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.dropbox  # noqa: F401
except ImportError:
    pass  # httpx may not be installed

try:
    import phi.connectors.whatsapp  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.oura  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.apple_health  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.strava  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.spotify  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.google_tasks  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.weather  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.github_notifications  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.hackernews  # noqa: F401
except ImportError:
    pass

try:
    import phi.connectors.news_rss  # noqa: F401
except ImportError:
    pass
