# Mem0 concept and architecture (fetched 2026-10-28; docs undated, v3 era, README mentions April 2026 algorithm)

## What problem does Mem0 solve and how does it extract and store memories?

### Takeaway
Mem0 is an Apache-2.0 memory layer that gives AI agents long-term memory across sessions. `add` runs an LLM to extract durable facts (not transcripts), dedupes, embeds and stores them; `search` retrieves them with multi-signal ranking.

### Cited Findings
- Mem0 "gives your AI agents long-term memory that persists across sessions, tools, and runs"; two deployments: hosted Platform (API key) and self-hosted Open Source (library or Docker stack). — [Intro](https://docs.mem0.ai/introduction)
- README: "Drop-in memory infrastructure for AI agents and apps"; Python/TS library, self-hosted server, managed cloud; Apache 2.0; `pip install mem0ai` / `npm install mem0ai`. — [GitHub](https://github.com/mem0ai/mem0)
- Typical loop: `Memory()`, `search` by user_id and inject into system prompt, generate reply, then `memory.add(conversation)`. — [GitHub](https://github.com/mem0ai/mem0)
- Extraction pipeline: (1) look up related existing memories to skip known facts; (2) LLM extracts durable details (preferences, decisions, plans), storing facts not verbatim transcript; (3) dedupe and embed; (4) entity extraction (people, places, orgs, concepts), which become Graph Memory nodes on Platform. — [How it works](https://docs.mem0.ai/core-concepts/how-it-works)
- Automatic extraction is additive: "moved from Austin to Seattle" adds a new fact and does not rewrite the old one; corrections/removals need explicit `update`/`delete`. — [How it works](https://docs.mem0.ai/core-concepts/how-it-works)
- `infer=True` default; `infer=False` stores payload verbatim (OSS only per add page). Mixing modes for the same fact can duplicate it. — [Add](https://docs.mem0.ai/core-concepts/memory-operations/add)
- On Platform send only new messages; Mem0 pulls earlier messages with the same identifiers as extraction context. Platform `add` is async: returns `status: PENDING` plus `event_id`; poll `GET /v1/event/{event_id}/`. — [Add](https://docs.mem0.ai/core-concepts/memory-operations/add)
- `add` accepts `metadata={...}` and `expiration_date="YYYY-MM-DD"` (expired memories hidden unless `show_expired`). — [Add](https://docs.mem0.ai/core-concepts/memory-operations/add)
- Retrieval uses four signals: semantic (vector), keyword, entity boost, temporal (time metadata extracted at write time). Platform fuses them in the managed service; OSS ranking depends on the vector store plus optional reranker, and its entity signal has no graph. — [How it works](https://docs.mem0.ai/core-concepts/how-it-works)
- Storage model: SQL DB (facts + metadata, source of truth), vector DB (embeddings), entity store. Platform manages them; in OSS you configure them. — [How it works](https://docs.mem0.ai/core-concepts/how-it-works)
- Core API ops (both): `add`, `search`, `get`, `get_all`, `update`, `delete`, `delete_all`, `history`; OSS via `Memory`/`AsyncMemory`. — [Platform vs OSS](https://docs.mem0.ai/platform/platform-vs-oss)
- README benchmark claims (April 2026 algorithm): LoCoMo 71.4 to 92.5, LongMemEval 67.8 to 94.4, BEAM 1M 64.1, BEAM 10M 48.6; README says these reflect the managed platform with proprietary optimizations, OSS gets "directionally similar" gains. Vendor self-reported. — [GitHub](https://github.com/mem0ai/mem0)

### Inferences
- Every `add` costs at least one LLM call plus embeddings, so cost/latency scale with write frequency; call it on meaningful turns only (docs advise this).
- Because extraction is additive, contradictory facts can coexist; an app needing "current state" must rely on temporal/ranking signals or explicit update/delete.

### Gaps
- Exact update/delete semantics, fusion weights, top-k/threshold defaults: not described on pages fetched (update/delete/search pages not fetched).
- Custom instructions / custom extraction prompt: not covered on the add page.

## How do user_id / agent_id / run_id scoping and metadata/filters work?

### Takeaway
Identifiers partition memories; reads use a `filters` dict where unmentioned fields are unconstrained, and by default user_id and agent_id land on separate records, so AND across them returns nothing.

### Cited Findings
- Fields: `user_id` (person/account), `agent_id` (agent persona), `app_id` (product/tenant; Platform only), `run_id` (short-lived thread/session). — [Entity-scoped memory](https://docs.mem0.ai/platform/features/entity-scoped-memory)
- Writes: `client.add(messages, user_id=..., agent_id=..., app_id=..., run_id=...)`; app_id and run_id stored on every produced memory; user_id/agent_id follow the speaker on default extraction (user messages get user_id with agent_id null, assistant messages the reverse). Only `infer=False` can store both on one record. — [Entity-scoped memory](https://docs.mem0.ai/platform/features/entity-scoped-memory)
- Reads: `filters={"AND":[{"user_id":"x"},{"app_id":"y"}]}`; unmentioned fields unconstrained; mentioned must match exactly (null does not match a named value); `"*"` wildcard matches non-null only. `AND` of user_id+agent_id returns nothing on the default path; use `OR`. — [Entity-scoped memory](https://docs.mem0.ai/platform/features/entity-scoped-memory)
- Deletes scope via keyword args (`client.delete_all(user_id=..., run_id=...)`); deleting by user_id alone removes everything for that user. Misspelled run_id silently returns nothing. — [Entity-scoped memory](https://docs.mem0.ai/platform/features/entity-scoped-memory)
- Docs say always scope searches with user_id/agent_id/run_id. — [How it works](https://docs.mem0.ai/core-concepts/how-it-works)
- Filtering: Platform has a fixed key allowlist (other keys give 400), operators vary by field; OSS allows any metadata key, operator support depends on the vector store. OSS scoping = user_id, agent_id, run_id only. — [Platform vs OSS](https://docs.mem0.ai/platform/platform-vs-oss)
- OSS `get_all(filters={"user_id": "john"})` form shown in the Ollama example. — [Mem0 with Ollama](https://docs.mem0.ai/examples/mem0-with-ollama)

### Inferences
- For a single-user desktop assistant, use one stable `user_id`, optionally `run_id` per conversation, and metadata for categories.

### Gaps
- Metadata filter operator list (V2 filters, OSS metadata-filtering pages) not fetched.
- The entity-scoping page is tagged Platform; whether OSS behaves identically on user/agent split is unconfirmed.

## Platform (managed) vs OSS; can OSS run fully local with Ollama?

### Takeaway
OSS is the same memory engine self-hosted; Platform adds graph, org/project model, dashboard, decay, temporal reasoning, etc. OSS can run 100% locally with Ollama LLM + embedder and local Qdrant.

### Cited Findings
- OSS is "the same memory engine as the Platform"; library (`Memory()`) or Docker Compose server (`make bootstrap`) with dashboard, per-user API keys, audit log. — [OSS overview](https://docs.mem0.ai/open-source/overview.md)
- Library defaults: LLM OpenAI `gpt-5-mini`, embeddings `text-embedding-3-small`, vector store local Qdrant at `/tmp/qdrant`, history SQLite at `~/.mem0/history.db`, reranker disabled. Server defaults to Postgres+pgvector. All overridable via `Memory.from_config`. — [OSS overview](https://docs.mem0.ai/open-source/overview.md)
- Platform-only: native always-on graph (OSS has no queryable graph/`relations`), app_id, orgs/projects, Memory Decay, Temporal Reasoning (raises error in OSS), Dream consolidation, custom categories, webhooks/export/feedback/summaries, batch ops up to 1,000, web dashboard. OSS lists 25 vector stores, 18 LLMs, 11 embedders. — [Platform vs OSS](https://docs.mem0.ai/platform/platform-vs-oss)
- Official fully local example: Qdrant at localhost:6333, LLM provider `ollama` (`llama3.1:latest`, base url http://localhost:11434), embedder `ollama` (`nomic-embed-text:latest`), `embedding_model_dims: 768` must match the model; then `Memory.from_config(config)`, `m.add("I'm visiting Paris", user_id="john")`. — [Mem0 with Ollama](https://docs.mem0.ai/examples/mem0-with-ollama)
- Optional hybrid search extra: `pip install mem0ai[nlp]` plus spaCy model. — [GitHub](https://github.com/mem0ai/mem0)
- Migration guides exist: OSS to Platform, OSS v2 to v3, Platform v2 to v3. — [llms.txt](https://docs.mem0.ai/llms.txt)

### Inferences
- Local-only means weaker extraction quality (small Ollama models) and no Platform-only features (temporal reasoning, decay); README's benchmark numbers do not apply to OSS.
- Qdrant embedded/local path default (`/tmp/qdrant`) is a temp dir on Linux; on Windows set an explicit path to persist (unverified, check config).

### Gaps
- Whether the Qdrant server must run separately versus embedded local-path mode with Ollama: official example uses a server on 6333; embedded mode not confirmed here.
- Exact current PyPI version not found (README shows none).
- Chroma and other stores supported per a search snippet only; not verified on a primary page.

## Free tier / pricing limits of the platform

### Takeaway
Free plan: first 30 days 10,000 adds and 1,000 retrieval calls per month with Mem0 covering model calls; after that 50,000 adds and 10,000 retrievals per month with your own LLM key. Higher tier is "Custom" (contact sales).

### Cited Findings
- Free: 10,000 memories (adds)/month for first 30 days then 50,000/month with own LLM key; 1,000 retrieval API calls/month first 30 days then 10,000/month with own LLM key; unlimited end users; Mem0 covers model calls 30 days then BYO key; usage-based overage with a user-set monthly cap; community support. — [Pricing](https://mem0.ai/pricing)
- Custom plan (price unlisted): graph memory, user profiles, Dream consolidation, advanced analytics, private Slack, SSO, audit logs, SLA, on-prem. — [Pricing](https://mem0.ai/pricing)
- Free tier needs no credit card. — [Platform vs OSS](https://docs.mem0.ai/platform/platform-vs-oss)

### Inferences
- Pricing page shows only Free and Custom in the fetch; earlier paid tiers (Starter/Pro) may have been removed or not rendered, so verify live. Graph memory appears gated to Custom.

### Gaps
- Overage unit prices not listed; the page's meta description says "10K memories" versus body wording "adds" (minor inconsistency).
- Pricing fetched through a summarizing tool, not raw HTML.
