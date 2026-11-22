# Mem0 integrations ecosystem and fit for Phibe (local-first assistant)

Research date: 2026-10-28. Sources are Mem0 docs fetched this session (WebFetch summaries, not raw pages) and GitHub issue #3391. Phibe facts (FastAPI, qwen3.5:4b ~4096 ctx, knowledge.db, SOUL.md/USER.md, tool registry) come from the task brief, not verified in code.

## 1. What integrations does docs.mem0.ai/integrations list, grouped?

### Takeaway
The page is a flat list of about 22 entries, mostly agent/LLM frameworks plus voice, low-code, observability and one cloud entry, with Mem0 MCP as the "universal protocol". No vector-store or LLM-provider entries on this page; those live under OSS component docs.

### Cited Findings
Grouping is the fetch tool's own, not the page's ([Integrations](https://docs.mem0.ai/integrations)):
- Agent / multi-agent frameworks: Camel AI, LangChain, LlamaIndex, AutoGen, CrewAI, LangGraph, Vercel AI SDK, LangChain Tools, Agno, Mastra, OpenAI Agents SDK, Google ADK, ChatDev — [Integrations](https://docs.mem0.ai/integrations)
- Observability: AgentOps, Respan — [Integrations](https://docs.mem0.ai/integrations)
- Voice agents: Livekit, ElevenLabs, Pipecat — [Integrations](https://docs.mem0.ai/integrations)
- Low-code / app tools: Dify, Flowise, Raycast — [Integrations](https://docs.mem0.ai/integrations)
- Cloud platform: AWS Bedrock (with OpenSearch) — [Integrations](https://docs.mem0.ai/integrations)
- Universal protocol: Mem0 MCP — [Integrations](https://docs.mem0.ai/integrations)
- A Claude Code plugin integration also exists (hooks + background worker + `search_memories`) — [Claude Code integration](https://docs.mem0.ai/integrations/claude-code.md)
- OSS defaults: library uses local Qdrant at `/tmp/qdrant` plus SQLite history at `~/.mem0/history.db`; self-hosted server uses Postgres+pgvector; default LLM OpenAI `gpt-5-mini`, default embedder OpenAI `text-embedding-3-small`; server bundles openai/anthropic/gemini providers — [OSS overview](https://docs.mem0.ai/open-source/overview)
- Full vector-store provider list is on the Self-Hosted Setup page (docs.mem0.ai/open-source/setup), not retrieved.

### Inferences
- None of the framework integrations matter for Phibe (custom FastAPI, no LangChain etc.). The relevant surface is the Python `Memory` class, Ollama LLM+embedder config, and optionally MCP.

### Gaps
- Complete list of OSS vector stores and LLM providers not fetched (setup page not read).
- Whether the integrations list changed after the fetch is unknown; fetch summarizer, not raw HTML.

## 2. Is there an Ollama / local-model integration and an MCP server option?

### Takeaway
Yes to Ollama for both LLM and embedder in OSS Python. The documented MCP server is hosted-only (cloud account); I found no first-party fully local MCP in the docs I read.

### Cited Findings
- Ollama LLM provider: `provider: "ollama"`, config `model`, `temperature`, `max_tokens`; model must support tool calling; docs example uses an OpenAI key for the embedder — [Ollama LLM](https://docs.mem0.ai/components/llms/models/ollama)
- Ollama embedder: Python default `nomic-embed-text`, example `mxbai-embed-large`, `embedding_dims` default 512 (TS 768), `ollama_base_url` default None — [Ollama embedder](https://docs.mem0.ai/components/embedders/models/ollama)
- Hosted Mem0 MCP at `https://mcp.mem0.ai/mcp`, 11 tools: add_memory, search_memories, get_memories, get_memory, update_memory, delete_memory, delete_all_memories, delete_entities, list_entities, list_events, get_event_status; needs Mem0 Platform account, browser OAuth or API key bearer; memories stored in the Mem0 account — [Mem0 MCP](https://docs.mem0.ai/integrations/mcp)
- Claude Code plugin: memory storage and extraction are hosted, needs `m0-` API key; docs describe no self-hosted mode; recall injects up to 5 memories on first prompt of a session — [Claude Code integration](https://docs.mem0.ai/integrations/claude-code.md)
- OpenMemory docs page did not mention OpenMemory at all; GitHub issue #3439 "Fix: Openmemory local ollama" (closed) shows a local OpenMemory+Ollama path existed in the repo — [GitHub issues search](https://github.com/mem0ai/mem0/issues?q=ollama+windows)

### Inferences
- A truly local MCP would mean wrapping `Memory` yourself or using the OpenMemory repo (unverified, maintenance status unknown). Phibe has its own tool registry, so exposing `memory_search`/`memory_add` there is simpler than MCP.
- Dimension mismatch risk: Mem0 default embedder dims (512) vs Ollama model native dims (nomic 768, mxbai 1024); set `embedding_dims` and vector-store dims consistently (related reports: FastEmbed/Qdrant dimension docs bug #7736, Redis index dimension error in #3391).

### Gaps
- No current doc found confirming an official local/self-hosted MCP server. OpenMemory status unverified.
- Embedder doc page does not confirm OSS Mem0 works fully offline end to end beyond the Ollama embedder/LLM config.

## 3. Practical integration pattern and token/latency cost for a small-context local model

### Takeaway
Pattern: `search` before reply (cheap: one embedding + vector lookup, no LLM), inject a few short memories, then `add` after the turn off the critical path. `add` with inference runs an LLM extraction, which is the expensive and fragile part on a 4B model.

### Cited Findings
- `add` pipeline: messages go through an LLM that extracts key facts/decisions/preferences; storage is additive; search ranks relevant memories — [Add memory](https://docs.mem0.ai/core-concepts/memory-operations/add)
- `infer=False` stores payload as given, skips extraction; duplicates possible when mixing modes; recommended only for raw transcripts — [Add memory](https://docs.mem0.ai/core-concepts/memory-operations/add)
- Platform `add` is async (status PENDING + event_id); docs do not say whether OSS `add` is async or how many LLM calls it makes — [Add memory](https://docs.mem0.ai/core-concepts/memory-operations/add)
- Claude Code plugin batches: flush every 5 exchanges, on session end/compaction, or after 5 idle minutes; recall only on first prompt of a session (>=20 chars), max 5 memories — [Claude Code integration](https://docs.mem0.ai/integrations/claude-code.md)
- Ollama extraction failures: `Error in new_retrieved_facts: Expecting value...` (invalid JSON from the LLM) on `add()` with llama3.1/3.2, qwen3:8b, deepseek-r1; maintainer attributes to LLM hallucination under limited resources; workarounds: `infer=False`, install from git, pin 0.1.115, smaller model that fits next to embedder in VRAM; Feb 2026 reports mean not fully resolved — [GitHub #3391](https://github.com/mem0ai/mem0/issues/3391)
- Windows 11 without Docker: "Error adding to memory: Request timed out" (#2718, closed) — [GitHub issues search](https://github.com/mem0ai/mem0/issues?q=ollama+windows)
- Telemetry on by default; disable with `MEM0_TELEMETRY=false`, set before importing `mem0.memory.telemetry` — [third-party guide dated 2026-03-07](https://instagit.com/mem0ai/mem0/how-does-mem0-handle-telemetry-and-data-collection-and-can-it-be-disabled.md) (not verified against the repo)

### Inferences (not sourced; engineering estimates, measure before trusting)
- Budget for 4096 ctx: persona (SOUL+USER) + tool schemas + history already consume much of it. Cap injected memories to about 3-5 items, ~15-25 tokens each (~100-150 tokens total), with a similarity threshold so zero are injected when nothing is relevant.
- Search latency should be dominated by the Ollama embedding call (tens to low hundreds of ms warm); first call after model unload pays a load cost. Keep embedder resident (`keep_alive`) and watch VRAM contention with qwen3.5:4b.
- Run `add` in a FastAPI `BackgroundTasks`/queue after the response streams, batched every N turns or on idle, never inline. Extraction with the same 4B chat model competes with the next reply for the GPU, so queue it behind active generation or run on idle.
- Given the fragility on small models, consider `infer=False` on distilled facts Phibe already structured (e.g. from its own summarizer), or a stronger extractor model used only in idle batches.
- qwen3.5 thinking mode may emit reasoning tokens that break JSON extraction; disable thinking for the Mem0 LLM calls (unverified for this model).

### Gaps
- No benchmark numbers for Mem0 OSS + Ollama on Windows/small GPU found; must measure locally.
- LLM calls per `add` in current OSS version not documented in what I read.
- Search params (top_k, threshold) docs not retrieved.

## 4. Overlap/conflicts with local knowledge store and persona files; main risks

### Takeaway
Mem0 would duplicate three things Phibe already has (a hybrid-search store, a persona profile, and fact memory). Main risks are duplicated/contradictory memory, extraction quality on a 4B model, and cloud egress if the hosted Platform/MCP is used.

### Cited Findings
- Hosted MCP and Claude Code plugin send conversation content to Mem0 (redacted, in flush batches) and store memories in the Mem0 account; plugin telemetry is tied to account email when an API key is set — [Claude Code integration](https://docs.mem0.ai/integrations/claude-code.md), [Mem0 MCP](https://docs.mem0.ai/integrations/mcp)
- OSS defaults call OpenAI for LLM and embeddings unless reconfigured, and Ollama docs example still sets an OpenAI key for the embedder — [OSS overview](https://docs.mem0.ai/open-source/overview), [Ollama LLM](https://docs.mem0.ai/components/llms/models/ollama)
- Default library vector store path is `/tmp/qdrant`, which on Windows/reboots is not durable; set an explicit path — [OSS overview](https://docs.mem0.ai/open-source/overview) (durability implication is my inference)
- Additive storage and `infer=False` duplicate risk — [Add memory](https://docs.mem0.ai/core-concepts/memory-operations/add)

### Inferences
- Overlap: knowledge.db (bm25+vector) already does retrieval; USER.md holds stable user facts; Mem0 extracts "preferences/facts" which would collide with USER.md. Decide a single owner: USER.md stays curated/authoritative, Mem0 (if used) holds episodic, auto-extracted facts, and the prompt builder dedups against USER.md.
- Cheaper alternative worth weighing: a `memories` table in the existing knowledge.db reusing the current hybrid search plus a small extraction prompt. This avoids a second vector store (Qdrant), a second embedding model path, extra dependencies, and telemetry. Mem0's added value is the extraction/update logic and ecosystem, little of which Phibe needs.
- If adopting OSS Mem0: Ollama for both LLM and embedder, explicit Qdrant (or other store) path under the user data dir, `MEM0_TELEMETRY=false`, no Platform API key, no hosted MCP. Verify with a network check that nothing leaves the machine.
- Per-user scoping: use Mem0 `user_id` per Phibe user to match per-user SOUL/USER.
- Related reminder from user memory: chat does not read knowledge.db yet, so a memory layer should be decided together with that wiring.

### Gaps
- Not verified: whether OSS Mem0 sends any data to Mem0 servers beyond telemetry when fully configured with Ollama.
- Memory update/dedup (conflict resolution) behavior in current OSS version not covered by fetched pages.
- Code of Phibe not inspected; overlap claims rest on the task brief.
