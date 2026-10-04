"""Tools primitive — tool system with ABC interface and built-in tools."""

from __future__ import annotations

from phi.tools._stubs import BaseTool, ToolExecutor, ToolSpec

# Import built-in tools to trigger @ToolRegistry.register() decorators.
# Each is wrapped in try/except so the package loads even before the
# individual tool modules are created.
try:
    import phi.tools.calculator  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.think  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.retrieval  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.llm_tool  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.file_read  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.web_search  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.weather  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.code_interpreter  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.code_interpreter_docker  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.repl  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.storage_tools  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.mcp_adapter  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.channel_tools  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.http_request  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.docker_shell_exec  # noqa: F401
    import phi.tools.shell_exec  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.memory_manage  # noqa: F401
except ImportError:
    pass
try:
    import phi.tools.user_profile_manage  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.skill_manage  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.file_write  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.apply_patch  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.git_tool  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.db_query  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.pdf_tool  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.image_tool  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.audio_tool  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.knowledge_tools  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.text_to_speech  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.digest_collect  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.scan_chunks  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.knowledge_sql  # noqa: F401
except ImportError:
    pass

try:
    import phi.tools.apple_calendar  # noqa: F401
except ImportError:
    pass

__all__ = ["BaseTool", "ToolExecutor", "ToolSpec"]
