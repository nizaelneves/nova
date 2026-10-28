"""Tools primitive — tool system with ABC interface and built-in tools."""

from __future__ import annotations

from phibe.tools._stubs import BaseTool, ToolExecutor, ToolSpec

# Import built-in tools to trigger @ToolRegistry.register() decorators.
# Each is wrapped in try/except so the package loads even before the
# individual tool modules are created.
try:
    import phibe.tools.calculator  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.think  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.retrieval  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.llm_tool  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.file_read  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.web_search  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.weather  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.code_interpreter  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.repl  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.storage_tools  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.mcp_adapter  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.channel_tools  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.http_request  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.docker_shell_exec  # noqa: F401
    import phibe.tools.shell_exec  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.user_profile_manage  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.skill_manage  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.file_write  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.apply_patch  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.git_tool  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.db_query  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.markitdown_tool  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.image_tool  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.audio_tool  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.knowledge_tools  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.text_to_speech  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.digest_collect  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.scan_chunks  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.knowledge_sql  # noqa: F401
except ImportError:
    pass

try:
    import phibe.tools.apple_calendar  # noqa: F401
except ImportError:
    pass

__all__ = ["BaseTool", "ToolExecutor", "ToolSpec"]
