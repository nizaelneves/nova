# Cognee GitHub issues, releases and changelog audit (Windows 11 + Ollama embeddings + cloud LLM), as of 2026-11-14

Method: GitHub issue search (semantic) and issue reads on topoteretes/cognee, the releases list, docs changelog, newreleases.io. Searches were semantic and not exhaustive; "no issue found" means no hit in the searches run. Discussions and Discord were NOT checked.

## Known bugs, breaking changes and workarounds for a Windows 11 + Ollama embeddings + cloud LLM setup

### Takeaway
Windows-relevant risks: (1) Ladybug graph engine bumps (0.22.3 in v1.6.8) have one unconfirmed Windows hang report, closed as "not reproduced"; (2) Ollama tokenizer/chunk sizing issues were fixed in v1.6.2 but HUGGINGFACE_TOKENIZER handling is still incomplete for some paths; (3) the graph store (Ladybug) has had checkpoint/WAL corruption on long cognify runs; (4) several 1.6.x breaking changes (instructor optional, ingestion refusals on API server, dataset delete purges history).

### Cited Findings

**Windows**
- v1.5.0 (2026-08-15) bundles OpenSSL for Windows to avoid TLS/SSL failures with the Ladybug adapter; ladybug pinned `==0.19.0` — [newreleases v1.5.0](https://newreleases.io/project/github/topoteretes/cognee/release/v1.5.0)
- v1.6.5 (2026-10-16): `python-magic-bin` no longer installed on Windows, which fixes `import cognee` hanging on Windows — [docs changelog](https://docs.cognee.ai/changelog)
- #6685 (opened 2026-11-12, closed 2026-11-13 as "not planned"): reporter says the Ladybug 0.22.3 bump (PR #6681) makes graph engine creation hang forever on Windows 11 (Python 3.12.14, bisected between two dev commits; test run in mock-journey mode with `VECTOR_DB_SUBPROCESS_ENABLED=false`). Maintainer dexters1 replied "We could not reproduce the issue." No fix. Reporter notes upstream CI runs journeys on ubuntu only, so Windows is not exercised — [#6685](https://github.com/topoteretes/cognee/issues/6685)
- v1.6.8 (2026-11-12) ships ladybug 0.22.3 and raises default `KUZU_MAX_DB_SIZE` to 128 GiB — [docs changelog](https://docs.cognee.ai/changelog); [release v1.6.8](https://github.com/topoteretes/cognee/releases/tag/v1.6.8)
- #3353 (Windows 11, v1.2.1, closed 2026-06-26 via PR #3355): `HUGGINGFACE_TOKENIZER` was wrongly required with Ollama embeddings (import-time ValidationError). Fixed by making it optional — [#3353](https://github.com/topoteretes/cognee/issues/3353)
- #3436 (Windows 11, v1.2.1, closed 2026-07-17, PR #3461 "configurable context window for Ollama"): chunk size was derived from output-token limit (fell back to 16384, chunks ~8191 tokens vs Ollama default num_ctx 4096) — [#3436](https://github.com/topoteretes/cognee/issues/3436)
- #2138 (closed 2026-03-01) Windows path normalization broke local storage; #1224 (closed 2025-08-27) re-enabled Windows support — [#2138](https://github.com/topoteretes/cognee/issues/2138), [#1224](https://github.com/topoteretes/cognee/issues/1224)
- Release notes v1.6.0 to v1.6.4 list no other Windows-specific entries — [docs changelog](https://docs.cognee.ai/changelog)

**Ollama embeddings, dimensions, tokenizer, truncation**
- v1.6.2 (2026-09-29): chunks sized to each embedding engine's input limit (Ollama reads limit from its server); token counting moved to the `tokenizers` library; `EMBEDDING_MAX_COMPLETION_TOKENS` default 8191 -> 4096; previously chunked content keeps old chunks until re-added; non-retryable LiteLLM embedding errors fail fast — [docs changelog](https://docs.cognee.ai/changelog)
- v1.6.5: engines return `EmbeddingResult`; base64 embedding encoding default only on api.openai.com; `EMBEDDING_ENCODING_FORMAT` with Ollama or fastembed raises `CogneeConfigurationError`; default `EMBEDDING_BATCH_SIZE` 36 -> 32 — [docs changelog](https://docs.cognee.ai/changelog)
- v1.6.0 (2026-09-18): each dataset records its embedding model; a change fails with a clear dimension-mismatch error (409 `EmbeddingDimensionMismatchError`). Default embedding when untouched and no key: fastembed `BAAI/bge-small-en-v1.5`. Default LLM changed to `openai/gpt-5.6-luna` for those who never set `LLM_MODEL` — [docs changelog](https://docs.cognee.ai/changelog)
- #5535 (OPEN, bug, 2026-10-08): the model-match check compares only dimensions; swapping to a different model with the same width passes silently and mixes embedding spaces — [#5535](https://github.com/topoteretes/cognee/issues/5535)
- #4266 (OPEN, 2026-07-30): `HUGGINGFACE_TOKENIZER` ignored on LiteLLM and OpenAI-compatible embedding paths (only the `ollama` engine forwards it); effect measured as ~3.5% token-count skew with tiktoken fallback, not data loss. Related #5185 closed 2026-09-23 (comment count 1) — [#4266](https://github.com/topoteretes/cognee/issues/4266), [#5185](https://github.com/topoteretes/cognee/issues/5185). Note: the Ollama engine path is the one that works.
- Dimension defaults: #2751 (default 3072 regardless of model, closed 2026-06-20), #4048 (hardcoded 3072 fallback, closed 2026-07-14), #1961 (LiteLLM engine did not pass EMBEDDING_DIMENSIONS, closed 2026-02-04), #3547 (clear error instead of silent empty recall, closed 2026-07-25) — [#2751](https://github.com/topoteretes/cognee/issues/2751), [#4048](https://github.com/topoteretes/cognee/issues/4048), [#1961](https://github.com/topoteretes/cognee/issues/1961), [#3547](https://github.com/topoteretes/cognee/issues/3547)
- #1915 (closed 2026-02-08): LiteLLM tokenizer lookup truncated `BAAI/bge-m3` to `bge-m3`; #1663 (closed 2025-10-25) Ollama embedding KeyError "embeddings"; #1765 (closed 2025-11-14) feature: raise error in Ollama embedding engine when context is small — [#1915](https://github.com/topoteretes/cognee/issues/1915), [#1663](https://github.com/topoteretes/cognee/issues/1663), [#1765](https://github.com/topoteretes/cognee/issues/1765)
- Model-specific issues for EmbeddingGemma, qwen3-embedding, nomic: no dedicated issue found (only bge-m3 #1915 and nomic-embed-text appearing in #3353). The Windows reporter in #3353 used `nomic-embed-text` with `EMBEDDING_DIMENSIONS=768` and workaround `HUGGINGFACE_TOKENIZER=nomic-ai/nomic-embed-text-v1.5`.

**Structured output / local LLMs**
- v1.6.7 (2026-11-06): `instructor` is now an optional extra (`cognee[instructor]`); with `STRUCTURED_OUTPUT_FRAMEWORK=instructor` and not installed it raises `InstructorNotInstalledError` — [docs changelog](https://docs.cognee.ai/changelog)
- #3647 (closed 2026-08-24, PR #3731): user feedback that qwen2.5 and mistral via Ollama did not give a satisfactory end-to-end extraction; fix added a curated supported-Ollama-model list and a startup warning. Cloud LLM avoids this class of problem — [#3647](https://github.com/topoteretes/cognee/issues/3647)
- Searches for BAML/litellm_native structured-output failures returned zero results (no issue found).

**File locks, concurrency, graph store (Ladybug/Kuzu), LanceDB**
- #6679 (closed 2026-11-12, same day, by maintainer dexters1): ladybug 0.19.0 consumes ~9 MiB of `max_db_size` per CHECKPOINT; a long cognify exhausts the 32 GiB cap after ~3,500 checkpoints, leaving a corrupted WAL; the store then fails to open. Workaround: raise `KUZU_MAX_DB_SIZE`; or delete leftover `.shadow` and `.wal.checkpoint` files (on a copy) to recover to the last checkpoint. Reporter labels the pin as Linux; v1.6.8 raised default cap to 128 GiB and ladybug to 0.22.3 — [#6679](https://github.com/topoteretes/cognee/issues/6679)
- #6170 (OPEN, bug, 2026-10-21): macOS reproduction, Ladybug 0.19.0 segfaults at ~1,650 documents / ~96 MB graph during cognify; reopened store reports corrupted WAL. No maintainer response recorded (1 comment) — [#6170](https://github.com/topoteretes/cognee/issues/6170)
- #5736 (OPEN, 2026-10-12): upgrading 1.4.x -> 1.6.x with an existing Kuzu/Ladybug DB fails to open because the JSON extension registered in the old catalog is missing from `~/.lbdb`; workaround: persist and pre-populate `~/.lbdb`. Also 1.6.x non-root user needs volume `chown` (Docker-specific) — [#5736](https://github.com/topoteretes/cognee/issues/5736)
- #5541 (OPEN, 2026-10-08): reopening a shared Ladybug dataset after LRU eviction fails with "Could not set lock on file" in a multi-user stack — [#5541](https://github.com/topoteretes/cognee/issues/5541)
- #5987 (closed 2026-11-09): LanceDB `create_data_points` deadlock when the collection does not exist (VECTOR_DB_LOCK taken twice); #5083 (closed 2026-09-16) deadlock from shared Kuzu/Ladybug lock; #4394 (closed 2026-08-09) concurrent cognify x memify violates Ladybug primary-key uniqueness (lock is process-local); #3708 (closed 2026-07-12) Kuzu worker crash leaves orphaned lock; #2717 (closed 2026-07-13, 12 comments) SQLite deadlock during cognify() in v1.0.2 — [#5987](https://github.com/topoteretes/cognee/issues/5987), [#5083](https://github.com/topoteretes/cognee/issues/5083), [#4394](https://github.com/topoteretes/cognee/issues/4394), [#3708](https://github.com/topoteretes/cognee/issues/3708), [#2717](https://github.com/topoteretes/cognee/issues/2717)
- "Database is locked" on Windows SQLite specifically: no issue found.
- v1.6.4 removed automatic background LanceDB pruning (it could leave orphaned worker processes); compaction/pruning is now manual — [docs changelog](https://docs.cognee.ai/changelog), [release v1.6.4](https://github.com/topoteretes/cognee/releases/tag/v1.6.4)

**Cognify hangs, performance, memory**
- #2119 (closed 2026-03-01): add()/cognify() hang with a local OpenAI-compatible LLM on macOS; #3876 (closed 2026-07-09): add + cognify report success but content not reliably searchable (worse under concurrent writes across datasets); #2532 (closed 2026-07-25) N+1 query pattern in /api/v1/cognify; #4277 (closed 2026-10-28) /api/v1/visualize ~197 s for 828 nodes — [#2119](https://github.com/topoteretes/cognee/issues/2119), [#3876](https://github.com/topoteretes/cognee/issues/3876), [#2532](https://github.com/topoteretes/cognee/issues/2532), [#4277](https://github.com/topoteretes/cognee/issues/4277)
- #5943 (OPEN, 2026-10-16): auto-generated "telemetry insights" says missing source files fail every later cognify (26% of failures) — [#5943](https://github.com/topoteretes/cognee/issues/5943)
- #5778 (OPEN): search() has no timeout parameter — [#5778](https://github.com/topoteretes/cognee/issues/5778)
- RAM-use issue: #6170 reports ~1.8 GB malloc at crash on 64 GB machine (not memory-bound). No dedicated RAM-bloat issue found.

**Duplicates, update/delete not removing data**
- #3526 (closed 2026-08-04): forget() removes data/graph nodes but recall() can still surface deleted facts after re-cognify — [#3526](https://github.com/topoteretes/cognee/issues/3526)
- #5473 (OPEN, 2026-10-07): provenance delete leaves orphaned `EdgeType_relationship_name` vectors and can delete a shared vector still used by a surviving edge — [#5473](https://github.com/topoteretes/cognee/issues/5473)
- #5686 (closed 2026-10-13): remove_disconnected_chunks deleted unrelated nodes — [#5686](https://github.com/topoteretes/cognee/issues/5686)
- #2510 (closed 2026-06-21) EntityAlreadyExistsError due to duplicate node ID with different types; #2633 (closed 2026-06-20) duplicate nodes when user-defined DataPoint id dropped; #3393 (closed 2026-07-25) hackathon task to consolidate near-duplicate entities — [#2510](https://github.com/topoteretes/cognee/issues/2510), [#2633](https://github.com/topoteretes/cognee/issues/2633), [#3393](https://github.com/topoteretes/cognee/issues/3393)
- #6144 (OPEN): relational dlt sources never update after first add — [#6144](https://github.com/topoteretes/cognee/issues/6144)

**Dataset permissions / telemetry**
- #6375 (OPEN, 2026-10-27): MCP recall persists session data into the queried dataset instead of a user-scoped store (privacy leak on shared datasets) — [#6375](https://github.com/topoteretes/cognee/issues/6375)
- Telemetry: only auto-generated "Telemetry insights" issues (#5943, #5991) found; these show the project analyses its own (cloud/telemetry) failure data. No issue about outbound calls from a local setup found. The #3353 reporter's environment dump contained `telemetry_disabled: 'true'` (i.e. a TELEMETRY_DISABLED setting exists) — [#3353](https://github.com/topoteretes/cognee/issues/3353)
- Unicode/PT-BR text: searched; no issue found.

### Inferences
- The main Windows exposure is the Ladybug graph engine bump in v1.6.8: unconfirmed single report, maintainers could not reproduce, CI is Linux only. Treat Windows as best-effort.
- Using a cloud LLM sidesteps the local-model structured-output problem (#3647).
- Same-width embedding model swaps (e.g. EmbeddingGemma 768 -> nomic 768) will not be caught (#5535); keep a manual record of the model per dataset and re-embed/reset when switching.
- Ollama context: setting Ollama num_ctx large enough for chunk size matters; v1.6.2 reads the limit from the Ollama server, but confirm the loaded context (not the default 4096) covers chunk size.

### Gaps
- No issue found for: EmbeddingGemma, qwen3-embedding, PT-BR/Unicode, BAML/litellm_native, SQLite "database is locked" on Windows, outbound telemetry calls, RAM bloat.
- Discussions tab, Discord and blog were not checked. v1.5.1-v1.5.4 notes (dates only: v1.5.4 2026-09-04) were not read; v1.6.x notes before v1.6.3 came from docs changelog only.
- Regression reports after each release were not systematically mapped; only the ones above were found.

## Release notes and version recommendation

### Takeaway
v1.5.0 (2026-08-15) was low-risk; v1.6.0-v1.6.8 contain many breaking changes. Recommendation: pin v1.6.6 (2026-10-29) or v1.6.7 (2026-11-06) rather than v1.6.8 (2026-11-12), because v1.6.8 is 2 days old, changes the Ladybug engine on Windows (unconfirmed hang, #6685), and adds ontology/ingestion behavior changes. This is a judgement, not a maintainer statement.

### Cited Findings
Release dates (from releases list): v1.5.4 2026-09-04; v1.5.4rc1 2026-09-15; v1.6.0 2026-09-18; v1.6.1 2026-09-24; v1.6.2 2026-09-29; v1.6.3 2026-10-07; v1.6.4 2026-10-13; v1.6.5 2026-10-16; v1.6.6rc1 2026-10-23; v1.6.6 2026-10-29; v1.6.7 2026-11-06; v1.6.8 2026-11-12 — [releases](https://github.com/topoteretes/cognee/releases)
- v1.5.0: no user-facing breaking changes; OpenSSL bundled for Windows — [newreleases v1.5.0](https://newreleases.io/project/github/topoteretes/cognee/release/v1.5.0)
- v1.6.0: `only_context` returns full LLM input, `context_format` removed; default LLM changed; unresolved dataset names fail search/recall; JWT secrets must be set for multi-process; fastembed/codegraph extras emptied; per-dataset embedding model recorded — [docs changelog](https://docs.cognee.ai/changelog)
- v1.6.1: dataset data endpoint paged (default 100); CSV via dlt; Alembic index build can block writes on large `data` tables — [docs changelog](https://docs.cognee.ai/changelog)
- v1.6.2: embedding/chunking/tokenizer changes (above); `.env` resolution changed (`COGNEE_ENV_FILE` pins file) — [docs changelog](https://docs.cognee.ai/changelog)
- v1.6.3: `temporal_cognify` removed (default pipeline extracts dates); `node_set` must be list of non-empty strings; dlt pinned <1.31; lancedb 0.39.x — [docs changelog](https://docs.cognee.ai/changelog), [release v1.6.3](https://github.com/topoteretes/cognee/releases/tag/v1.6.3)
- v1.6.4: LanceDB background pruning removed; searches no longer return raw vector column — [release v1.6.4](https://github.com/topoteretes/cognee/releases/tag/v1.6.4)
- v1.6.5 (2026-10-16): triplet embedding removed; memify deprecated in favor of `improve()` (CLI prints notice and exits); `ALLOW_CYPHER_QUERY` default false; litellm >=1.102.2 required; Windows import hang fix — [docs changelog](https://docs.cognee.ai/changelog)
- v1.6.6: dataset delete purges search/conversation history (rc1 notes), `run_info` no longer stores input (irreversible migration), `delete_data` returns receipt and may raise `DataDeletionIncompleteError`, `fs` session cache removed — [docs changelog](https://docs.cognee.ai/changelog), [release v1.6.6rc1](https://github.com/topoteretes/cognee/releases/tag/v1.6.6rc1)
- v1.6.7: API server refuses server-side file paths unless `ACCEPT_LOCAL_FILE_PATH` (SDK/CLI/MCP keep default true), refuses DB connection strings unless `ALLOW_DATABASE_INGESTION`; `instructor` optional extra; `diskcache` removed — [docs changelog](https://docs.cognee.ai/changelog)
- v1.6.8: API server refuses web/repo URLs unless `ALLOW_HTTP_REQUESTS`; searches use `ONTOLOGY_FILE_PATH` by default and a malformed file makes them raise (`ONTOLOGY_QUERY_GROUNDING=false` restores); Slack importer removed; Alembic revision added; ladybug 0.22.3; `KUZU_MAX_DB_SIZE` default 128 GiB; new `embedding_worker` (RabbitMQ) engine off by default — [docs changelog](https://docs.cognee.ai/changelog)
- Ollama-specific changes: no release notes explicitly mention Ollama beyond v1.6.2 (server-read input limit) and v1.6.5 (base64 encoding unsupported for Ollama) — [docs changelog](https://docs.cognee.ai/changelog)

### Inferences
- If the Phibe app calls the SDK directly (not API server), the API-server-only refusals (ACCEPT_LOCAL_FILE_PATH, ALLOW_HTTP_REQUESTS, ALLOW_DATABASE_INGESTION) don't apply; if it uses the HTTP API they do.
- Moving 1.6.2 -> 1.6.5+ for an app already using Ollama: re-add content to benefit from new chunk sizes; embedding model/dimension is tracked per dataset.
- v1.6.4-v1.6.7 all pin ladybug 0.19.0 (stated in #6679, #6170 for 1.6.5/1.6.7), which carries the checkpoint-accounting bug; v1.6.8 fixes via 0.22.3 and 128 GiB cap. Trade-off: known long-run cognify risk (0.19.0) vs unconfirmed Windows hang (0.22.3). If pinning 1.6.7, set a larger `KUZU_MAX_DB_SIZE` (documented as workaround in #6679) and keep graph backups.

### Gaps
- No post-release regression list could be built for each version; only #6685 (v1.6.8 on Windows), #5736 (1.4.x -> 1.6.3 upgrade) and #5991 (1.6.3 API recall 6% failing, open) were seen. #5991 not read in detail.
- v1.5.1-1.5.4 notes not read.

## Recurring maintainer answers and recommended configs

### Takeaway
Maintainers mostly respond via PRs and a bot/template ("provide minimal reproduction"); explicit recommended-config statements appear in docs and changelog rather than issue threads.

### Cited Findings
- Docs: `EMBEDDING_DIMENSIONS` must match the vector store and embedding model; Cognee rejects LLM/embedding provider mismatch with `ProviderConfigMismatchError` — [embedding providers docs](https://docs.cognee.ai/setup-configuration/embedding-providers)
- Boilerplate bot reply on new bug issues (github-actions): asks for screenshots and minimum viable code — [#6685 comments](https://github.com/topoteretes/cognee/issues/6685)
- Maintainer reply when unable to reproduce: "We could not reproduce the issue. Can you try again or give us more details?" (dexters1, #6685) — [#6685](https://github.com/topoteretes/cognee/issues/6685)
- Community workaround for Ollama + nomic: `EMBEDDING_PROVIDER=ollama`, `EMBEDDING_MODEL=nomic-embed-text:latest`, `EMBEDDING_ENDPOINT=http://localhost:11434/api/embed`, `EMBEDDING_DIMENSIONS=768`, and `HUGGINGFACE_TOKENIZER=nomic-ai/nomic-embed-text-v1.5` — [#3353](https://github.com/topoteretes/cognee/issues/3353) (since fixed so the tokenizer is optional)
- Third-party self-hosting guide (non-primary): [glukhov.org Cognee on Ollama](https://glukhov.org/post/2025/12/selfhosting-cognee-quickstart-llms-comparison)

### Inferences
- Setting `HUGGINGFACE_TOKENIZER` explicitly for the Ollama embedding model is cheap insurance for accurate chunk sizing (the Ollama path honours it, #4266).

### Gaps
- No single maintainer "recommended config" thread found; discussions/Discord not checked.

## Maintenance responsiveness

### Takeaway
Quick on some bugs (hours to days) with long tails on others; roughly 26 open issues with the `bug` label at the time of the search (a labelled subset only).

### Cited Findings
- Open bug-labelled issues: 26 (totalCount returned by list_issues with label `bug`, state OPEN; many issues are not labelled) — GitHub API query on [issues](https://github.com/topoteretes/cognee/issues)
- Sample time to close: #6679 closed ~3.5 h after opening (2026-11-12); #6685 first human reply and close ~10 h after opening; #3353 ~2 days (fix PR #3355); #3436 ~22 days; #2717 ~80 days (12 comments); #5987 ~22 days; #4394 ~1 day; #3708 ~12 days — computed from created/closed timestamps in the issue pages cited above
- Still open and old: #3491 (2026-06-26), #3508, #3653, #4266 (2026-07-30, no fix), #4462 (2026-08-13); #6170 (segfault, Oct 21) with no maintainer comment visible — [issues](https://github.com/topoteretes/cognee/issues)
- Cadence: 12 releases between 2026-09-04 and 2026-11-12 (roughly weekly) — [releases](https://github.com/topoteretes/cognee/releases)

### Inferences
- A median time to first response cannot be computed from this sample; closure speed is high for maintainer-triaged items (assignee dexters1) and many contributor-authored PRs fix issues. Weekly releases mean fixes arrive fast but regressions also do.

### Gaps
- No rigorous median first-response or open-vs-fixed ratio computed (would require paginating all issues). The 26 figure covers only `bug`-labelled open issues.
