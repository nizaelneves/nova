# Cognee: technical architecture and fully-local setup on Windows (state as of 2026-11-14)

Version context: latest release found is v1.6.8 (2026-11-12) per the [docs changelog](https://docs.cognee.ai/changelog). The GitHub README page showed v1.6.1 (2026-09-24), which was stale. License Apache-2.0 ([GitHub](https://github.com/topoteretes/cognee)). Cognee moves fast: v1.6.x changed APIs (remember/recall/improve/forget, memify deprecated), the graph engine (Kuzu to Ladybug), and security defaults within weeks. Pin versions.

## 1. Architecture: pipelines, default stores, datasets/users/permissions, ontology

### Takeaway
Cognee is a Python (async) library plus a FastAPI server with three stores (relational, vector, graph) fed by Task/DataPoint pipelines. Defaults need no server: SQLite + LanceDB + Ladybug (the renamed Kuzu). In v1.6 the high-level verbs became remember/recall/improve/forget; the classic add/cognify/search still work, and memify is deprecated.

### Cited Findings
- Core operations are now remember, recall, improve and forget; Python is async (`cognee.remember()`, `cognee.recall()`); also CLI `cognee-cli`, TypeScript SDK, Rust (Cognee-RS), MCP server, Docker image with API on 8000, UI on 3000, MCP on 8001 — [GitHub README](https://github.com/topoteretes/cognee)
- Three stores: relational (documents, chunks, provenance), vector (embeddings of chunks and DataPoints), graph (entities/relationships). Three pipelines share the same Task and DataPoint structure: ingestion, session learning, self-improvement — [Architecture docs](https://docs.cognee.ai/core-concepts/architecture)
- Cognify tasks (classic pipeline): chunking, graph extraction, summarization, adding DataPoints — [third-party architecture notes](https://programmerraja.is-a.dev/notes/AI-ML/Generative-AI/Memory-Context/Congnee) (low-detail secondary source; the fetched text had little prose)
- Default stack with plain `pip install cognee`: SQLite (`DB_PROVIDER=sqlite`, `<SYSTEM_ROOT_DIRECTORY>/databases/cognee_db`), LanceDB (`cognee.lancedb`), Ladybug graph (`cognee_graph_ladybug`). Files created on first use; connections lazy — [Setup overview](https://docs.cognee.ai/setup-configuration/overview)
- Alternatives: relational `postgres`; vector `pgvector`, `chromadb`, `neptune_analytics` built in, community adapters `qdrant`, `redis`, `falkordb`; graph `ladybug-remote`, `neo4j`, `neptune`; `kuzu` names are legacy aliases; `STORAGE_BACKEND` local or s3 — [Setup overview](https://docs.cognee.ai/setup-configuration/overview); Ladybug = renamed Kuzu engine, either value works — [graph stores](https://docs.cognee.ai/setup-configuration/graph-stores.md) (via search summary)
- Default paths resolve relative to the installed package (often inside the venv). Set absolute `SYSTEM_ROOT_DIRECTORY` and `DATA_ROOT_DIRECTORY`; relative paths in `.env` cause a config error — [Setup overview](https://docs.cognee.ai/setup-configuration/overview); otherwise a new venv may start with empty memory — [Local setup](https://docs.cognee.ai/guides/local-setup)
- Ladybug changes: v1.6.5 checkpoints graph writes; v1.6.8 upgraded ladybug 0.19.0 to 0.22.3 and raised default `KUZU_MAX_DB_SIZE` from 32 GiB to 128 GiB, "fixing stores that became unopenable after long cognify runs" — [Changelog](https://docs.cognee.ai/changelog)
- Memify: v1.6.5 removed triplet embedding and deprecated memify in favor of `improve()`; `cognee.memify()` and `POST /api/v1/memify` still work with FutureWarning and are slated for removal in the next release — [Changelog](https://docs.cognee.ai/changelog)
- Multi-user: `ENABLE_BACKEND_ACCESS_CONTROL` and `REQUIRE_AUTHENTICATION` are process-level (set in .env, not at runtime); under access control PGVector uses per-dataset engines — [Setup overview](https://docs.cognee.ai/setup-configuration/overview). v1.6.3 added tenant-scoped capabilities (`manage_users`, `grant_capabilities`, `revoke_capabilities`) next to dataset permissions; permission endpoints cover tenants, roles, user-tenant/role assignment, dataset grants — [Changelog](https://docs.cognee.ai/changelog), [Server guide](https://docs.cognee.ai/guides/deploy-rest-api-server)
- Search modes conceptually: semantic (vector), structural (graph/Cypher), hybrid — [Architecture docs](https://docs.cognee.ai/core-concepts/architecture). `CYPHER` and `NATURAL_LANGUAGE` search types are off by default since v1.6.5 (`ALLOW_CYPHER_QUERY=true` to enable; only for trusted users) — [Changelog](https://docs.cognee.ai/changelog)
- Ontologies: optional RDF/OWL (anything RDFLib parses). Supply via `ONTOLOGY_FILE_PATH`, a resolver in `config`, or `cognify(ontology_file_path=...)`; the docs conflict on that last parameter (one page says it raises an unrecognized-argument error) — [Ontologies](https://docs.cognee.ai/core-concepts/further-concepts/ontologies) vs [search summary of ontology-support](https://docs.cognee.ai/guides/ontology-support). Matching is name-based fuzzy (difflib, 0.8 cutoff); `ONTOLOGY_MODE=annotate` (default) keeps unmatched entities, `strict` drops them; not an OWL validator; file read once at startup; a mistyped path yields an empty lookup silently — [Ontologies](https://docs.cognee.ai/core-concepts/further-concepts/ontologies). v1.6.8: searches can be grounded in the ontology — [Changelog](https://docs.cognee.ai/changelog)

### Inferences
- For Phibe, the "dataset" is the natural mapping for a workspace/notebook; the default no-server stack suits a desktop app, but Ladybug is a native-extension wheel (Windows risk, see section 3).
- Given the API churn (memify gone soon, remember/recall new), wrap Cognee behind a thin adapter in Phibe and pin an exact version.

### Gaps
- No primary page found with the exact ordered task list of `cognify` in v1.6.x, nor an exhaustive list of `SearchType` values (GRAPH_COMPLETION, CHUNKS, etc.); these were not confirmed from docs in this session.
- Whether single-user mode needs a dataset/user at all (default user behavior) not confirmed.

## 2. Python API, REST server, embedding in an existing FastAPI app

### Takeaway
The server is a FastAPI app launched as `uvicorn cognee.api.client:app` (port 8000), with `/api/v1` routes and optional bearer-token auth. Docs do not describe mounting it in another app; since it is a plain FastAPI object it is plausibly mountable, but that is unverified. Calling the Python API in-process from Phibe's own FastAPI is the simpler path.

### Cited Findings
- Start: `uvicorn cognee.api.client:app --host 0.0.0.0 --port 8000`, or Docker compose, or `python cognee/api/client.py`; docs at `/docs`; `HTTP_API_HOST`/`HTTP_API_PORT`; agent mode on 8011 — [Deploy REST API server](https://docs.cognee.ai/guides/deploy-rest-api-server)
- Endpoint groups: Auth (register, login), Datasets (create, list), v1 data (`remember`, `recall` with SSE streaming, `improve`, `forget`), legacy `add`, `cognify`, `search`, LLM utilities (`infer-schema`, `custom-prompt`), Agents, Permissions, Activity (pipeline runs, spans, dataset export) — [Deploy REST API server](https://docs.cognee.ai/guides/deploy-rest-api-server). Ontology upload `POST /api/v1/ontologies` — [Ontologies](https://docs.cognee.ai/core-concepts/further-concepts/ontologies)
- All routes under `/api/v1`; older docs show `/api/add` without version (outdated); search body uses `query` in newer docs and `query_text`/`query_type` in older — [API reference search result](https://docs.cognee.ai/reference/api_reference); verify against your version's `/docs`
- Auth: enabled with `REQUIRE_AUTHENTICATION=true`; register `POST /api/v1/auth/register`, login `POST /api/v1/auth/login`; bearer token or cookie — [Deploy REST API server](https://docs.cognee.ai/guides/deploy-rest-api-server). `ENABLE_BACKEND_ACCESS_CONTROL=true` keeps auth required — [API reference](https://docs.cognee.ai/api-reference/introduction). Built on fastapi-users (env `FASTAPI_USERS_JWT_SECRET`) — [Security](https://docs.cognee.ai/setup-configuration/security)
- Hardening defaults for HTTP API: refuses server-side file paths unless `ACCEPT_LOCAL_FILE_PATH` (v1.6.7), refuses DB connection strings unless `ALLOW_DATABASE_INGESTION=true`, refuses web/repo URLs unless `ALLOW_HTTP_REQUESTS=true` (v1.6.8) — [Changelog](https://docs.cognee.ai/changelog)
- Python SDK client can talk to a remote server via `COGNEE_SERVICE_URL`, `COGNEE_API_KEY` — [Deploy REST API server](https://docs.cognee.ai/guides/deploy-rest-api-server)
- Windows-specific: v1.6.5 stopped installing `python-magic-bin` on Windows, fixing an `import cognee` hang — [Changelog](https://docs.cognee.ai/changelog)

### Inferences
- `cognee.api.client:app` being a module-level FastAPI instance suggests `app.mount("/cognee", cognee_app)` could work, but lifespan/startup events of mounted sub-apps are not run by the parent in Starlette; verify before relying on it. Safer: import `cognee` in-process and call async functions, or run the server as a separate local process on 127.0.0.1.

### Gaps
- No official statement on mounting into an existing FastAPI app or on Windows-specific server issues.

## 3. Local embeddings and Windows problems

### Takeaway
Supported local embedding routes: `fastembed` (in-process ONNX, CPU), `ollama`, `openai_compatible` (llama.cpp, vLLM, TEI), and LiteLLM-routed `custom` (LM Studio, HuggingFace). The default is OpenAI `text-embedding-3-large` (3072 dims), so any partial local config silently falls back to OpenAI. Failures come from: only LLM configured, dimension not matching the model/vector store, stale vector collections, first-run model download, Ollama tokenizer fallback, and Windows native wheels (Ladybug OpenSSL).

### Cited Findings
- Providers: `openai` (default), `gemini`, `mistral`, `bedrock`, `ollama`, `fastembed`, `openai_compatible`, `custom` (LiteLLM), `embedding_worker` (RabbitMQ, v1.6.8, off by default); LM Studio/HuggingFace/vLLM via `custom` — [Embedding providers](https://docs.cognee.ai/setup-configuration/embedding-providers)
- Key vars: `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `EMBEDDING_ENDPOINT`, `EMBEDDING_BATCH_SIZE` (default 32), `EMBEDDING_MAX_COMPLETION_TOKENS` (default 4096, lowered to the model's limit when detectable), `HUGGINGFACE_TOKENIZER` (Ollama only), `MOCK_EMBEDDING` — [Embedding providers](https://docs.cognee.ai/setup-configuration/embedding-providers)
- If dimensions can't be derived Cognee falls back to 3072 with a warning; set `EMBEDDING_DIMENSIONS` explicitly. Changing dimension requires pruning and re-ingesting — [Embedding providers](https://docs.cognee.ai/setup-configuration/embedding-providers)
- Unrecognized `EMBEDDING_PROVIDER` values silently fall through to the LiteLLM engine; if only LLM or only embeddings is configured the other defaults to OpenAI; mismatches raise `ProviderConfigMismatchError` — [Embedding providers](https://docs.cognee.ai/setup-configuration/embedding-providers); "both must be configured together" — [Local setup](https://docs.cognee.ai/guides/local-setup)
- Ollama embeddings: endpoint must be the full `http://localhost:11434/api/embed` (passed unchanged); `nomic-embed-text` 768 dims; set `HUGGINGFACE_TOKENIZER=nomic-ai/nomic-embed-text-v1.5` else falls back to TikToken with a warning; context length read from `/api/show`; Ollama handles requests sequentially, so lower `EMBEDDING_BATCH_SIZE` (1 to 10) — [Embedding providers](https://docs.cognee.ai/setup-configuration/embedding-providers), [Local Ollama](https://docs.cognee.ai/guides/local-ollama.md). `LLM_ENDPOINT` is the bare host (no `/v1`) while `EMBEDDING_ENDPOINT` needs `/api/embed` — [Local Ollama](https://docs.cognee.ai/guides/local-ollama.md)
- Fastembed: no API key or GPU; model downloaded from Hugging Face on first run (network needed once); example `sentence-transformers/all-MiniLM-L6-v2`, 384 dims; cache `FASTEMBED_CACHE_PATH` else HF hub cache (v1.6.5; `HF_HOME` moves it); tokenizer is the model's own; pinned `fastembed>=0.9.1,<0.10` (v1.6.6); base64 encoding unsupported for fastembed/ollama (`CogneeConfigurationError`) — [Embedding providers](https://docs.cognee.ai/setup-configuration/embedding-providers), [Changelog](https://docs.cognee.ai/changelog)
- Conflict: embedding page says fastembed needs `pip install 'cognee[fastembed]'`; installation page says the extra is empty and `fastembed`/`onnxruntime` are core dependencies — [Embedding providers](https://docs.cognee.ai/setup-configuration/embedding-providers) vs [Installation](https://docs.cognee.ai/getting-started/installation). Treat the installation page (newer behaviour, matches v1.6.6 pin) as likelier; installing the extra is harmless.
- Other sizes in docs/blogs: SDK example `BAAI/bge-large-en-v1.5` 1024 dims; `jina-embeddings-v2-base-en` 768 dims/8k ctx; `nomic-embed-text-v2-moe` 768/512 ctx; `qwen3-embedding` 0.6b/4b/8b 1024/2560/4096 dims, "unproven in Cognee"; `sfr-embedding-mistral` 4096 dims — [search summary of fastembed SDK docs](https://docs.cognee.ai/how-to-guides/cognee-sdk/fastembed), [glukhov.org](https://glukhov.org/post/2025/12/choosing-right-llm-for-cognee-on-ollama) (third-party; dimension for sfr-mistral also reported as 1024 in cognee's Ollama SDK example, so verify)
- After switching to local providers run `cognee.prune.prune_system(metadata=True)` before cognify to clear stale vector collections — [Local setup](https://docs.cognee.ai/guides/local-setup)
- Windows: Python 3.10 breaks the graph DB (OpenSSL 1.1 link); use 3.11+ from python.org or uv. Error `Could not find lbug C API shared library` = missing OpenSSL DLLs in ladybug wheel; Cognee supplies them (v1.5.0 shipped OpenSSL for Windows). Use forward slashes or doubled backslashes in `.env` paths; `ModuleNotFoundError` usually means system Python instead of venv; no coverage of long paths — [Installation](https://docs.cognee.ai/getting-started/installation)
- Python support 3.10 to 3.14 — [Installation](https://docs.cognee.ai/getting-started/installation)

### Inferences
- Likely "default local setup fails" causes for Phibe: (1) embeddings still pointing at OpenAI because only the LLM was changed; (2) 3072-dim default vs a 384/768/1024-dim local model, or old LanceDB collection created at another dimension; (3) first-run model download blocked/slow; (4) Ollama tokenizer mismatch giving approximate token counts; (5) relative data paths or Python 3.10 on Windows.
- Multilingual (Portuguese notes): bge-m3 (1024 dims) and multilingual-e5 variants are likely candidates, but I did not verify their availability in fastembed's list or their disk sizes from a source here. From general knowledge only (unsourced): bge-small ~130 MB, all-MiniLM-L6-v2 ~90 MB, nomic-embed-text ~270 MB, multilingual-e5-small ~470 MB, bge-m3 ~2.2 GB; verify before quoting.

### Gaps
- Fastembed supported-model table page returned 404; no verified list of multilingual models, MB/GB sizes, or RAM figures.
- No cognee-specific GitHub issues for Windows+fastembed/ollama dimension mismatch were found (searches surfaced docs and release notes only).

## 4. Local LLM for cognify, and cloud-only-for-cognify cost

### Takeaway
Cognify requires reliable structured (JSON-schema) output. Documented/blogged experience: small local models (under ~32B) often fail or make noisy graphs; only `llama3.1:8b` is on Cognee's recommended-validated list per the docs. A keyless, LLM-free path exists (GLiNER local extraction, ~750 MB weights) but is a lower-fidelity graph.

### Cited Findings
- Docs' local example uses Ollama `llama3.1:8b`, `LLM_API_KEY=ollama` placeholder, `LLM_TEMPERATURE=0.0`; unvalidated models trigger an advisory warning but extraction continues — [Local Ollama](https://docs.cognee.ai/guides/local-ollama.md), [Local setup](https://docs.cognee.ai/guides/local-setup)
- Third-party Dec 2025 test (BAML framework, SFR-Embedding-Mistral): gpt-oss:20b, qwen3:14b, deepseek-r1:14b, devstral:24b, ministral-3:14b, qwen3-vl:30b all failed to produce valid structured output; gpt-oss:120b did not finish after 2+ hours; chunks 4k tokens with Ollama — [Dev.to test](https://dev.to/rosgluk/self-hosting-cognee-llm-performance-tests-3oel). Another post by the same author recommends deepseek-r1:32b (24-32 GB VRAM), llama3.3-70b (40 GB+), devstral small 2 24B (18-20 GB), qwen3:14b budget (12-16 GB); hallucination percentages there are the author's own estimates and the two posts partly contradict (qwen3:14b/devstral failed in one, recommended in the other) — [glukhov.org](https://glukhov.org/post/2025/12/choosing-right-llm-for-cognee-on-ollama). Both predate v1.6 and the instructor/litellm structured-output backends; low confidence for today.
- Keyless: v1.5.4rc1 introduced optional GLiNER-based LLM-free graph/relation extraction; v1.6.0 (2026-09-18) made keyless workflows practical, LLM-dependent stages skip without error, GLiNER removed from default Docker image; v1.6.1 reworked installer (CPU Torch installed on first use) — [release mirrors](https://newreleases.io/project/github/topoteretes/cognee/release/v1.6.0), [v1.6.1](https://newreleases.io/project/github/topoteretes/cognee/release/v1.6.1). GLiNER extra: ~750 MB model weights downloaded on first use — [Installation](https://docs.cognee.ai/getting-started/installation)
- `instructor` structured output backend needs `cognee[instructor]` since v1.6.7 (`STRUCTURED_OUTPUT_FRAMEWORK=instructor`) — [Installation](https://docs.cognee.ai/getting-started/installation)
- Vendor claim: a local run of a standard dataset took >8 hours vs distributed on Modal being faster (no model/hardware detail) — [cognee.ai blog](https://www.cognee.ai/scaling-intelligence-introducing-distributed-cognee-for-parallel-dataset-processing)
- Cost: each chunk/document needs LLM calls for entity extraction — [search summary](https://dev.to/chinmay_bhosale_9ceed796b/cognee-with-ollama-3pp8)

### Inferences
- Hybrid option for Phibe: cloud LLM only for cognify (one-time per note, notes go to the provider) plus local embeddings and local stores; queries then need no cloud unless `recall` uses an LLM for answer completion. A privacy trade-off to state to the user.
- No token-cost figure can be computed from sources; estimate = chunks x (prompt + schema + output); not found published.

### Gaps
- No 2026 benchmark of qwen/llama/gemma small models on v1.6.x cognify; no latency per note; no cloud cost figures.

## 5. Offline/local-first: telemetry, encryption, backup

### Takeaway
Telemetry is on by default and is disabled with `TELEMETRY_DISABLED=true` (also silences dlt telemetry since v1.6.8). Built-in encryption covers only raw files under `DATA_ROOT_DIRECTORY` (AES-256-GCM); the SQLite/LanceDB/Ladybug stores are not encrypted, so use BitLocker/volume encryption.

### Cited Findings
- Telemetry default on; `TELEMETRY_DISABLED=true` in `.env` turns it off — [Local setup](https://docs.cognee.ai/guides/local-setup), origin [PR 767](https://github.amrom.workers.dev/topoteretes/cognee/pull/767). v1.6.8: `TELEMETRY_DISABLED` also disables dlt telemetry; with `TELEMETRY_ORIGIN=cloud` fewer fields are sent — [Changelog](https://docs.cognee.ai/changelog)
- Offline: fastembed weights and `HUGGINGFACE_TOKENIZER` download from Hugging Face on first use, so run once online or pre-populate the cache — [Local setup](https://docs.cognee.ai/guides/local-setup)
- File encryption: `FILE_ENCRYPTION_ENABLED` (default false), provider local or AWS KMS, AES-256-GCM per-file data key wrapped by a local key; covers originals/loader text under `DATA_ROOT_DIRECTORY` and uploaded ontologies; NOT `SYSTEM_ROOT_DIRECTORY` (SQLite, LanceDB, Ladybug), cache, logs, session cache; enabling does not re-encrypt existing files; key loss = data loss — [Security](https://docs.cognee.ai/setup-configuration/security)
- Other: `HASH_API_KEY` (default False, so API keys stored plaintext), `FASTAPI_USERS_JWT_SECRET` (random per process if unset) — [Security](https://docs.cognee.ai/setup-configuration/security)
- Local storage is plain files under `SYSTEM_ROOT_DIRECTORY`/`DATA_ROOT_DIRECTORY`, so backup = copy those directories while stopped (inference); dataset export exists via the activity/dataset export endpoint — [Deploy REST API server](https://docs.cognee.ai/guides/deploy-rest-api-server)

### Inferences
- SQLCipher is not a documented option; SQLite file encryption would require a custom adapter. Practical: BitLocker (OS) + optional `FILE_ENCRYPTION_*` for raw files.
- If a cloud LLM/embedding is configured, note content leaves the machine regardless of telemetry.

### Gaps
- No documented backup/restore procedure or consistency guarantees (LanceDB+Ladybug+SQLite copy atomicity); exact fields sent by default telemetry not confirmed.

## 6. Performance and scalability on a laptop with thousands of notes

### Takeaway
No credible published numbers for thousands of notes on a laptop with local models. The bottleneck is LLM calls in cognify (hours for local runs); embeddings (fastembed CPU) are cheap by comparison.

### Cited Findings
- Per-document LLM extraction dominates cost; local runs of a standard dataset >8 h (vendor claim, unspecified size) — [cognee.ai blog](https://www.cognee.ai/scaling-intelligence-introducing-distributed-cognee-for-parallel-dataset-processing)
- Ladybug store defaults: max DB size raised to 128 GiB in v1.6.8 after long runs left stores unopenable; bulk writes use primary-key index (v1.6.6) — [Changelog](https://docs.cognee.ai/changelog)
- Ollama processes embedding requests sequentially; reduce batch size — [Embedding providers](https://docs.cognee.ai/setup-configuration/embedding-providers)
- An official benchmarks page ([docs](https://docs.cognee.ai/reference/benchmarks)) returned 404; not read.

### Inferences
- Thousands of notes: plan for incremental cognify per changed note, background queue, and a cloud-or-GPU LLM; with an 8B local model expect long first-time indexing (unmeasured). Retrieval at that scale in LanceDB is not a concern.

### Gaps
- No laptop RAM/disk/CPU requirements, no latency figures, no scale tests found.
