"""Tools primitive — tool system with ABC interface and built-in tools."""

from __future__ import annotations

from nova.tools._stubs import BaseTool, ToolExecutor, ToolSpec

# Import built-in tools to trigger @ToolRegistry.register() decorators.
# Each is wrapped in try/except so the package loads even before the
# individual tool modules are created.
try:
    import nova.tools.calculator  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.think  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.retrieval  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.llm_tool  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.file_read  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.web_search  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.weather  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.code_interpreter  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.code_interpreter_docker  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.repl  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.storage_tools  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.mcp_adapter  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.channel_tools  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.http_request  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.docker_shell_exec  # noqa: F401
    import nova.tools.shell_exec  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.memory_manage  # noqa: F401
except ImportError:
    pass
try:
    import nova.tools.user_profile_manage  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.skill_manage  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.file_write  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.apply_patch  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.git_tool  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.db_query  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.pdf_tool  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.image_tool  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.audio_tool  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.knowledge_tools  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.text_to_speech  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.digest_collect  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.scan_chunks  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.knowledge_sql  # noqa: F401
except ImportError:
    pass

try:
    import nova.tools.apple_calendar  # noqa: F401
except ImportError:
    pass

__all__ = ["BaseTool", "ToolExecutor", "ToolSpec"]
