# Cognee docs audit: installation and configuration (v1.6.x, as of 2026-11-14)

Method: read end to end the docs pages for installation, setup-configuration overview, LLM providers, structured output backends, embedding providers, security (telemetry/encryption), logging, local-setup, local-ollama; plus the upstream `.env.template` and source files (`pyproject.toml`, `llm/config.py`, `embeddings/config.py`, `OllamaEmbeddingEngine.py`, `shared/utils.py`) on `main`. PyPI JSON reports latest `cognee` 1.6.8, `requires_python <3.15,>=3.10`.

Sources (all fetched directly):
- Installation: https://docs.cognee.ai/getting-started/installation.md
- Overview/env reference: https://docs.cognee.ai/setup-configuration/overview.md
- LLM providers: https://docs.cognee.ai/setup-configuration/llm-providers.md
- Structured output: https://docs.cognee.ai/setup-configuration/structured-output-backends.md
- Embedding providers: https://docs.cognee.ai/setup-configuration/embedding-providers.md
- Security and Privacy (telemetry, encryption): https://docs.cognee.ai/setup-configuration/security.md
- Logging: https://docs.cognee.ai/setup-configuration/logging.md
- Local setup: https://docs.cognee.ai/guides/local-setup.md
- Local Ollama: https://docs.cognee.ai/guides/local-ollama.md
- .env.template: https://raw.githubusercontent.com/topoteretes/cognee/main/.env.template
- pyproject: https://raw.githubusercontent.com/topoteretes/cognee/main/pyproject.toml
- Embedding config source: https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/databases/vector/embeddings/config.py
- LLM config source: https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/llm/config.py
- Ollama embedding engine source: https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/databases/vector/embeddings/OllamaEmbeddingEngine.py
- Telemetry source: https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/shared/utils.py

There is no dedicated "Troubleshooting" page and no dedicated "Environment variables" or "Encryption" page in the docs index (https://docs.cognee.ai/llms-core.md). Troubleshooting content is spread across Local Setup, LLM Providers (Ollama section), Embedding Providers, Installation (Windows accordion) and Logging.

---

## 1. Python versions, install commands, extras, uv/pip, Windows notes, system deps

### Takeaway
Python 3.10 to 3.14 (`>=3.10,<3.15`). `pip install cognee` or `uv add cognee` pulls in FastAPI, uvicorn, litellm, fastembed and the default SQLite/LanceDB/Ladybug stores. On Windows use Python 3.11 or newer, because CPython 3.10 on Windows breaks the default graph DB.

### Cited Findings
- Python "3.10 – 3.14" required — [Installation](https://docs.cognee.ai/getting-started/installation.md); `requires-python = ">=3.10,<3.15"`, package `version = "1.6.8"` on main — [pyproject](https://raw.githubusercontent.com/topoteretes/cognee/main/pyproject.toml)
- In a uv project the project's own `requires-python` must stay inside `>=3.10,<3.15` or resolution fails; `uv add cognee`; extras quoted: `uv add "cognee[postgres]"`. `uv add` fails outside a uv project (use `uv pip install cognee`) — [Installation](https://docs.cognee.ai/getting-started/installation.md)
- Base install includes everything for OpenAI plus default local DBs (SQLite, LanceDB, Ladybug); no external servers — [Installation](https://docs.cognee.ai/getting-started/installation.md)
- Core deps include `litellm>=1.102.2,<2`, `fastapi>=0.116.2,<1`, `fastapi-users[sqlalchemy]>=15.0.2`, `uvicorn>=0.34,<1`, `fastembed>=0.9.1,<0.10` — [pyproject](https://raw.githubusercontent.com/topoteretes/cognee/main/pyproject.toml). So Cognee brings its own FastAPI/uvicorn pins into the host app's environment (resolution risk for the Phibe app).
- Extras table (verified against pyproject and docs):
  - `ollama` = `transformers>=4.46.3,<6` only (the docs say it is for Ollama; it does NOT install an Ollama client). `huggingface` = same pin.
  - `fastembed` = empty extra, fastembed is a core dependency (kept only so `cognee[fastembed]` stays valid). `codegraph`, `dlt` also empty. `api` = `api=[]` (empty) in pyproject.
  - `instructor` = `instructor>=1.9.1,<1.15.3`; NOT in base since v1.6.7; needed only if `STRUCTURED_OUTPUT_FRAMEWORK=instructor`.
  - `baml` = `baml-py==0.206.0`. `gliner` = `gliner2[local]>=2.0.0,<3`, `torch>=2.1,<3`, etc. (about 750 MB model download on first use). `llama-cpp` includes instructor. `anthropic`, `groq`, `mistral`, `azure`, `postgres`, `postgres-binary`, `neo4j`, `neptune`, `chromadb`, `docs`, `docling`, `scraping`, `ontology`, `tracing`, `posthog`, `redis`, `aws`, `gmail`, `google-drive`, `google-calendar`, `deepeval`, `evals`, `notebook`, `dev`, `debug`.
  — [Installation](https://docs.cognee.ai/getting-started/installation.md), [pyproject](https://raw.githubusercontent.com/topoteretes/cognee/main/pyproject.toml)
- Windows: use `uv venv` + `.\.venv\Scripts\Activate.ps1` (PowerShell; may need `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`); `ModuleNotFoundError: No module named 'cognee'` means the wrong interpreter is active — [Installation, Windows Setup](https://docs.cognee.ai/getting-started/installation.md)
- Windows + Ladybug graph DB: Ladybug Windows wheels stopped shipping OpenSSL 3; Cognee borrows CPython's own OpenSSL 3 at import time. This fails on CPython 3.10 on Windows (links OpenSSL 1.1) and embedded Python distributions, error `RuntimeError: Could not find lbug C API shared library.` Fix: Python 3.11+ from python.org or uv — [Installation](https://docs.cognee.ai/getting-started/installation.md)
- Since v1.6.0 wheels bundle the graph engine JSON extension binaries (no runtime download; wheel about 19 MB); since v1.6.1 also in the sdist — [Installation](https://docs.cognee.ai/getting-started/installation.md)
- Releases carry PEP 740 attestations and SLSA provenance; verify with `gh attestation verify ./cognee-<version>-py3-none-any.whl --repo topoteretes/cognee` — [Installation](https://docs.cognee.ai/getting-started/installation.md)
- System dependency: no system package is listed for the default stack. PostgreSQL server only if using the `postgres` extra — [Installation](https://docs.cognee.ai/getting-started/installation.md)
- Weekly canary builds are published to PyPI as `X.Y.Z.devYYYYMMDD` — [Installation](https://docs.cognee.ai/getting-started/installation.md); pin `cognee==1.6.x` explicitly to avoid them (pip skips pre-releases by default; uv too unless allowed).

### Inferences
- Minimal install for Phibe on Windows 11: `uv add "cognee[ollama]"` (or `pip install "cognee[ollama]"`), Python 3.11 or newer. The `ollama` extra is only needed for the HuggingFace tokenizer fallback path (repos without `tokenizer.json`); the `tokenizers` library in the base install already covers repos that ship `tokenizer.json`, so even the plain base install likely works (docs say so explicitly under "Troubleshooting dependency errors").
- Dependency conflict risk with the existing FastAPI app: cognee pins `fastapi>=0.116.2`, `fastapi-users>=15`, `litellm>=1.102.2`, `tiktoken>=0.8`. Install into a venv and run `uv pip check` / the app's tests.
- Everything is large (torch is only pulled by `gliner` extra; do not install it).

### Gaps
- No documented list of Windows-specific C++ build requirements; docs imply wheels only. Not verified by installing (no install was run).
- The docs (Local Setup page) say the fastembed extra is "not bundled with the base cognee package" while Installation page and pyproject say fastembed is a core dependency. The Installation page and pyproject are the newer, source-confirmed statement; the Local Setup sentence looks stale.

---

## 2. LLM configuration (env vars, structured output frameworks)

### Takeaway
LLM settings are plain env names (no prefix). Default structured-output framework is `litellm_native` (no `instructor` needed); `instructor` and `baml` are opt-in. A cloud OpenAI-compatible endpoint is configured with `LLM_PROVIDER="custom"`, a LiteLLM-prefixed model id and `LLM_ENDPOINT=<base>/v1`.

### Cited Findings
- Variables and defaults (docs table, confirmed in `LLMConfig` fields): `LLM_PROVIDER` (default `openai`; optional, inferred from `LLM_MODEL` prefix; unrecognized prefix raises `ProviderNotDeducibleError`), `LLM_MODEL` (default `openai/gpt-5.6-luna`), `LLM_API_KEY`, `LLM_ENDPOINT`, `LLM_API_VERSION`, `LLM_MAX_COMPLETION_TOKENS` (default 16384, clamped to the model's LiteLLM limit; also drives chunk size: `min(embedding limit, LLM_MAX_COMPLETION_TOKENS // 2)`), `LLM_TEMPERATURE`, `LLM_SEED`, `LLM_ARGS` (JSON), `LLM_INSTRUCTOR_MODE`, `STRUCTURED_OUTPUT_FRAMEWORK` (default `litellm_native`), `OLLAMA_NUM_CTX` (2048), `LLAMA_CPP_*`, `TRANSCRIPTION_MODEL` (`whisper-1`), `IMAGE_TRANSCRIBE_MODEL`, `AUTO_RATE_LIMIT` (true), `LLM_RATE_LIMIT_ENABLED` (false), `LLM_RATE_LIMIT_REQUESTS` (60, or 10 on local servers), `LLM_RATE_LIMIT_INTERVAL` (60), `COGNEE_SKIP_CONNECTION_TEST`, `FALLBACK_MODEL/ENDPOINT/API_KEY` — [Overview](https://docs.cognee.ai/setup-configuration/overview.md), [LLM source](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/llm/config.py)
- Per-stage routing: `LLM_EXTRACTION_*`, `LLM_SUMMARIZATION_*`, `LLM_QUERY_*` with `MODEL, PROVIDER, ENDPOINT, API_KEY, API_VERSION` only; unset fields fall back to base `LLM_*` — [LLM Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- Custom (cloud OpenAI-compatible) recipe: `LLM_PROVIDER="custom"`, `LLM_MODEL="openai/<model-id>"` (or `openrouter/...`, `deepseek/...`, `hosted_vllm/...`), `LLM_ENDPOINT="https://host/v1"`, `LLM_API_KEY`. `custom` always sends a key (use `"."` for no auth). Default instructor mode for `custom` is `json_mode`. Embeddings are independent — [LLM Providers, Custom Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- Docs for the plain `openai` provider: `LLM_PROVIDER="openai"`, `LLM_MODEL="gpt-4o-mini"`, `LLM_API_KEY`, optional `LLM_ENDPOINT=https://api.openai.com/v1` — [LLM Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- Structured output: `litellm_native` (default; uses LiteLLM `response_format`; for providers without native schema support (Ollama, llama.cpp, custom) falls back to JSON-object plus schema-in-prompt with up to 3 validation retries); `instructor` (needs `cognee[instructor]`; default modes per provider: openai gpt-5 and bedrock and ollama `json_schema_mode`, gemini/custom/llama.cpp `json_mode`, anthropic `anthropic_tools`, mistral `mistral_tools`); `baml` (needs `cognee[baml]`; uses separate `BAML_LLM_PROVIDER`, `BAML_LLM_MODEL`, `BAML_LLM_API_KEY`, optional `BAML_LLM_ENDPOINT`, `BAML_LLM_API_VERSION`, `BAML_LLM_TEMPERATURE`; source defaults `baml_llm_provider="openai"`, `baml_llm_model="gpt-5.6-luna"`) — [Structured Output Backends](https://docs.cognee.ai/setup-configuration/structured-output-backends.md), [LLM source](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/llm/config.py)
- Provider/endpoint gotcha for Ollama LLM: `LLM_ENDPOINT` = bare host `http://localhost:11434` (no `/v1`) on `litellm_native`; `/v1` only with `instructor`. `LLM_API_KEY="ollama"` placeholder is mandatory (else `LLMAPIKeyNotSetError`). If any of `LLM_MODEL/LLM_ENDPOINT/LLM_API_KEY` is set with `LLM_PROVIDER=ollama`, all three must be set — [LLM Providers, Ollama](https://docs.cognee.ai/setup-configuration/llm-providers.md), [Local Setup](https://docs.cognee.ai/guides/local-setup.md)
- Ollama `num_ctx`: default Ollama context may be smaller than Cognee's extraction chunks; build a Modelfile with `PARAMETER num_ctx 8192` or lower `LLM_MAX_COMPLETION_TOKENS`. HTTP 500 on cognify while `ollama run` works is the typical symptom — [LLM Providers, Ollama](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- Advisory Ollama model matrix: recommended `llama3`, `llama3.1`, `llama3.2`, `llama3.3`, `qwen2.5` 14B or larger; problematic `mistral`, `phi3`, `phi3.5`, small qwen2.5; unknown = warning only — [LLM Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- Provider preflight: `add()`/`remember()` raise `ProviderConfigMismatchError` if LLM is non-OpenAI while embeddings are untouched (or vice versa); skip with `COGNEE_SKIP_PREFLIGHT`, `COGNEE_SKIP_CONNECTION_TEST`, `MOCK_EMBEDDING` — [Overview](https://docs.cognee.ai/setup-configuration/overview.md)
- `cognee-cli doctor` and `cognee-cli doctor --probe` check config / live calls — [Overview](https://docs.cognee.ai/setup-configuration/overview.md)
- Retry: structured calls retry with exponential backoff until at least 2 attempts and about 240 s; startup connection test times out at 30 s — [Overview](https://docs.cognee.ai/setup-configuration/overview.md)

### Inferences
- For a cloud OpenAI-compatible LLM (later), the safest path is `LLM_PROVIDER="custom"` with `LLM_MODEL="openai/<id>"`, or `LLM_PROVIDER="openai"` with `LLM_ENDPOINT` for true OpenAI. Do not set `EMBEDDING_API_KEY` to the cloud key by accident (see section 5).
- Switching LLM later needs no data migration (LLM is not stored per dataset); switching the embedding model does.

### Gaps
- Docs say `LLM_TEMPERATURE` is "unset" by default (no temperature sent on hosted providers), but `LLMConfig` source has `llm_temperature: float = 0.0`. Either the docs describe resolved behavior via some other logic or the source default changed; not reconciled. Set it explicitly if it matters.
- Not verified: exact behavior of `LLM_PROVIDER=custom` with providers requiring non-`/v1` paths.

---

## 3. Embedding configuration (Ollama, EmbeddingGemma, bge-m3, Qwen3-Embedding-0.6B, prefixes)

### Takeaway
Use `EMBEDDING_PROVIDER="ollama"` with the full `/api/embed` endpoint, set `EMBEDDING_DIMENSIONS` explicitly (the 3072 fallback silently breaks local models), and consider `HUGGINGFACE_TOKENIZER`. Cognee applies NO query/passage prefix or instruction to Ollama embeddings.

### Cited Findings
- Variables (defaults): `EMBEDDING_PROVIDER` (`openai`), `EMBEDDING_MODEL` (`openai/text-embedding-3-large`), `EMBEDDING_DIMENSIONS` (auto-derived from fastembed/LiteLLM registries, else 3072 with a warning), `EMBEDDING_API_KEY` (falls back to `LLM_API_KEY`), `EMBEDDING_ENDPOINT` (alias `EMBEDDING_API_BASE`; endpoint wins), `EMBEDDING_API_VERSION`, `EMBEDDING_MAX_COMPLETION_TOKENS` (unset = 4096; effective = min(this, model input limit)), `EMBEDDING_BATCH_SIZE` (32), `EMBEDDING_MAX_CONCURRENT_DATA_POINTS` (150), `EMBEDDING_INPUT_TYPE`, `EMBEDDING_ENCODING_FORMAT` (`base64`/`float`; base64 raises with ollama/fastembed), `EMBEDDING_RATE_LIMIT_ENABLED/REQUESTS/INTERVAL` (false/60/60), `HUGGINGFACE_TOKENIZER`, `TOKENIZERS_PARALLELISM` — [Overview](https://docs.cognee.ai/setup-configuration/overview.md), [Embedding source](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/databases/vector/embeddings/config.py)
- Valid `EMBEDDING_PROVIDER` values: `openai` (default; also Azure), `gemini`, `mistral`, `bedrock`, `ollama`, `fastembed`, `openai_compatible`, `custom`, `embedding_worker`. Any other value, including a typo, silently falls through to the LiteLLM engine — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md)
- Ollama recipe: `EMBEDDING_PROVIDER="ollama"`, `EMBEDDING_MODEL="nomic-embed-text:latest"`, `EMBEDDING_ENDPOINT="http://localhost:11434/api/embed"`, `EMBEDDING_DIMENSIONS="768"`, `HUGGINGFACE_TOKENIZER="nomic-ai/nomic-embed-text-v1.5"` (optional, no longer enforced at startup) — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md)
- `HUGGINGFACE_TOKENIZER` is only consulted by the Ollama engine. Mapping table in docs: `bge-m3:latest` -> `BAAI/bge-m3` (1024), `nomic-embed-text` -> `nomic-ai/nomic-embed-text-v1.5` (768), `mxbai-embed-large` -> `mixedbread-ai/mxbai-embed-large-v1` (1024), `all-minilm` -> `sentence-transformers/all-MiniLM-L6-v2` (384). If unset or unloadable, Cognee logs a warning and falls back to TikToken (approximate counts, never raises). The docs say a mismatch-advisory warning appears even for correct setups — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md)
- Docs list only `bge-m3` (1024) among the three requested models. EmbeddingGemma and Qwen3-Embedding-0.6B are NOT mentioned anywhere in the docs pages read (grep for gemma/qwen3 only hit vLLM/Qwen3-Embedding-4B and the LLM Gemma example).
- Ollama library facts: `embeddinggemma:latest` / `embeddinggemma:300m` (622 MB), 2K context, requires Ollama v0.11.10 or newer — [Ollama embeddinggemma](https://ollama.com/library/embeddinggemma). `qwen3-embedding:0.6b` (639 MB), 32K context; the 8B page states user-defined dimensions 32 to 4096 — [Ollama qwen3-embedding](https://ollama.com/library/qwen3-embedding)
- Ollama engine reads `context_length` from the server's `/api/show` and sizes chunks by it (capped by `EMBEDDING_MAX_COMPLETION_TOKENS`); sends `truncate: false` on native `/api/` endpoints, and on over-length errors splits the batch or text in half and mean-pools — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md)
- Source of the request body in `_get_embedding`: `{"model", "input", "dimensions": self.dimensions}` plus `truncate: False` when the endpoint contains `/api/`; headers get `Authorization: Bearer <os.getenv("LLM_API_KEY")>` if that env var is set — [OllamaEmbeddingEngine.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/databases/vector/embeddings/OllamaEmbeddingEngine.py)
- Query/passage prefixes: no prefix, instruction or task-prompt logic in the Ollama engine source (grep for prefix/instruction/query:/passage returned nothing relevant); the only related knob is `EMBEDDING_INPUT_TYPE`, a non-standard `input_type` body field documented for NVIDIA NIM-style providers and "ignored elsewhere" — [Overview](https://docs.cognee.ai/setup-configuration/overview.md), [Embedding source](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/databases/vector/embeddings/config.py)
- Batch size: Ollama is sequential; docs recommend `EMBEDDING_BATCH_SIZE` 1 to 10 (example 5) for local hardware — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md), [Local Setup](https://docs.cognee.ai/guides/local-setup.md)
- Measure the real dimension: `await get_embedding_engine().embed_text(["hello"])` from `cognee.infrastructure.databases.vector.embeddings`, `len(vectors[0])` — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md)
- Embedding timeouts and retries are hardcoded: 300 s per attempt, 128 s total retry window with exponential backoff (starts 2 s); a hung request is not retried and blocks its task up to 5 minutes — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md)

### Inferences
- Expected `EMBEDDING_DIMENSIONS` (NOT confirmed by Cognee docs; from model knowledge, verify by measuring): `embeddinggemma` 768; `bge-m3` 1024 (docs-confirmed); `qwen3-embedding:0.6b` 1024 native. Always measure once with the snippet above before ingesting.
- Because source sends `"dimensions"` to Ollama, setting `EMBEDDING_DIMENSIONS` lower than the native size may trigger Ollama's Matryoshka truncation if the installed Ollama supports the `dimensions` field of `/api/embed`. The docs claim `ollama` "never sends" this parameter (docs section on UnsupportedParamsError), which contradicts the source; I did not test. Unverified whether older Ollama builds ignore or reject it.
- Missing prefixes matter for quality: EmbeddingGemma and Qwen3-Embedding are trained with task/instruction prefixes (query vs document). Since Cognee does not add them, retrieval will use the un-prefixed text for both indexing and queries. This is a quality, not a correctness, issue. A workaround would require a custom embedding engine (subclassing) or serving the model behind a proxy that prepends prefixes (and then using `openai_compatible`). Not documented by Cognee.
- bge-m3 needs no prefixes, so it is the least risky of the three for Cognee as-is.
- Tokenizer repos (my knowledge, unverified by Cognee docs): `Qwen/Qwen3-Embedding-0.6B` is public; `google/embeddinggemma-300m` is a gated HF repo, so tokenizer download may fail without an HF token, after which Cognee falls back to TikToken with a warning (non-fatal per docs). Safest: omit `HUGGINGFACE_TOKENIZER` for EmbeddingGemma, or set `HF_TOKEN` (not covered by the docs).
- If the existing vector collection has another dimension, delete it (see section 7).

### Gaps
- Dimension values for EmbeddingGemma and Qwen3-Embedding-0.6B not stated in Cognee docs or on the fetched Ollama pages (Ollama pages gave no dimension for those two).
- Whether Ollama honors `dimensions` in `/api/embed` and from which version: not verified.
- Whether any other Cognee engine (LiteLLM, openai_compatible, fastembed) adds query/passage prefixes was not checked in source; only Ollama engine inspected.

---

## 4. Storage paths, DB providers, ENV precedence, encryption, logging

### Takeaway
Defaults resolve inside the installed package (venv), so pin `SYSTEM_ROOT_DIRECTORY` and `DATA_ROOT_DIRECTORY` to absolute paths. `.env` is loaded once at import with override, so `.env` beats process env vars; `cognee.config.set(...)` beats both.

### Cited Findings
- Defaults: `DB_PROVIDER=sqlite`, `VECTOR_DB_PROVIDER=lancedb`, `GRAPH_DATABASE_PROVIDER=ladybug` (aliases `kuzu` legacy); files at `<SYSTEM_ROOT_DIRECTORY>/databases/cognee_db`, `cognee.lancedb`, `cognee_graph_ladybug` — [Overview](https://docs.cognee.ai/setup-configuration/overview.md)
- `SYSTEM_ROOT_DIRECTORY` default `<cognee package>/.cognee_system`; `DATA_ROOT_DIRECTORY` default `<cognee package>/.data_storage` (one section also says `.cognee_system` / `.data_storage` relative); `.env` values must be absolute paths or `s3://` (relative raises a configuration error). On Windows use forward slashes or doubled backslashes, `~` works — [Overview](https://docs.cognee.ai/setup-configuration/overview.md), [Installation](https://docs.cognee.ai/getting-started/installation.md)
- `.env` loading: exactly one file, once per process at `import cognee`. Order: `COGNEE_ENV_FILE` (must exist or `FileNotFoundError`), then `.env` in CWD and parents up to project root (nearest dir with `.git` or `pyproject.toml`), then `.env` in the installed cognee package tree, else process env only. Loaded with `override=True`: a key in `.env` overrides the same key in the shell / `os.environ` — [Overview](https://docs.cognee.ai/setup-configuration/overview.md)
- Documented precedence table: 1 `cognee.config.set(...)` runtime, 2 `.env`, 3 shell/`os.environ`, 4 defaults. Post-import `os.environ` changes are unreliable — [Overview](https://docs.cognee.ai/setup-configuration/overview.md)
- `cognee.config.set` keys: `llm_provider, llm_model, llm_api_key, llm_endpoint`; `embedding_provider, embedding_model, embedding_dimensions, embedding_endpoint, embedding_api_key, embedding_api_version, embedding_max_completion_tokens, embedding_batch_size, huggingface_tokenizer`; graph/vector provider keys; chunking keys; `system_root_directory`, `data_root_directory`. Unsupported keys raise. Telemetry, auth, caching, logging stay env-only — [Overview](https://docs.cognee.ai/setup-configuration/overview.md)
- Provider inference runs once at config load; setting `llm_model` later via `set_llm_config` does not re-infer the provider, so set `llm_provider` in the same call — [LLM Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- File encryption: opt-in `FILE_ENCRYPTION_ENABLED=true` (AES-256-GCM), `FILE_ENCRYPTION_KEY` (base64 32 bytes) or `FILE_ENCRYPTION_KEYS` JSON ring, `FILE_ENCRYPTION_ACTIVE_KEY_ID`, `FILE_ENCRYPTION_PROVIDER` (`local`/`aws_kms`), `FILE_ENCRYPTION_KEY_FILE`. Only files under `DATA_ROOT_DIRECTORY` are encrypted; SQLite/LanceDB/Ladybug files, session cache and logs are NOT. Sealed files are unsealed to a temp file while a loader runs — [Security](https://docs.cognee.ai/setup-configuration/security.md)
- Other secrets: `HASH_API_KEY` (default False), `NEO4J_ENCRYPTION_KEY` default `"test_key"`, `INTEGRATION_CREDENTIALS_KEYS` — [Security](https://docs.cognee.ai/setup-configuration/security.md)
- Access control: `ENABLE_BACKEND_ACCESS_CONTROL` default True (multi-tenant: per user+dataset DBs, and API endpoints require an authenticated user); false = single-user shared DB and no auth requirement. `.env.template` also shows `REQUIRE_AUTHENTICATION=False` and `ENV="local"` — [.env.template](https://raw.githubusercontent.com/topoteretes/cognee/main/.env.template). The Ollama guide sets `ENABLE_BACKEND_ACCESS_CONTROL=false` and `CACHING=false` for plain single-user scripts — [Local Ollama](https://docs.cognee.ai/guides/local-ollama.md)
- Default session cache `CACHING=true`, `CACHE_BACKEND=sqlite` (a `cache.db` next to the relational DB); `SESSION_TTL_SECONDS=604800`. Search history: every answered search/recall stores question and answer in the relational DB; disable with `COGNEE_LOG_SEARCH_HISTORY=false` — [Overview](https://docs.cognee.ai/setup-configuration/overview.md), [.env.template](https://raw.githubusercontent.com/topoteretes/cognee/main/.env.template)
- Logging: `LOG_LEVEL` (default INFO, read at import), `COGNEE_LOG_FILE` (default true), `COGNEE_LOGS_DIR` (absolute, default `~/.cognee/logs`, fallback `/tmp/cognee_logs`), `COGNEE_LOG_MAX_BYTES` (50 MB), `COGNEE_LOG_BACKUP_COUNT` (5); keeps 10 most recent startup logs; `LITELLM_LOG="ERROR"` in template; startup INFO line states which `.env` was loaded — [Logging](https://docs.cognee.ai/setup-configuration/logging.md)
- `setup_logging()` runs at `import cognee` and installs a `sys.excepthook` and its own console and file handlers — [Logging](https://docs.cognee.ai/setup-configuration/logging.md); relevant when embedding in an existing FastAPI app (global side effects).
- Back up both root dirs together with Cognee idle; stores are embedded files — [Overview](https://docs.cognee.ai/setup-configuration/overview.md)

### Inferences
- Because `.env` overrides the environment, an existing Phibe `.env`/process env that also defines e.g. `LLM_API_KEY`, `LLM_MODEL`, `OPENAI_API_KEY`, `LOG_LEVEL` could be clobbered or clash. Cognee searches parent directories up to the dir with `.git`/`pyproject.toml`, so it will pick up Phibe's own project `.env` if run from the Phibe tree. Use `COGNEE_ENV_FILE=<path to a dedicated cognee.env>` to isolate. (Name clashes such as `LOG_LEVEL`, `DB_PROVIDER`, `DB_HOST`, `ENV` are plausible in an existing app.)
- For an in-process integration, setting configuration via `os.environ` before `import cognee` is fine only for keys not in `.env`; otherwise use a dedicated env file.
- Multi-user mode defaults (`ENABLE_BACKEND_ACCESS_CONTROL=True`) create a default superuser with no password and per-dataset databases; for a local single-user embedded use, setting it to `false` is what the official local guide does.

### Gaps
- Not verified in source: whether the `.env` loader mutates the process env globally (docs say "process environment that this single load populated", i.e. yes) and its exact interaction with an existing python-dotenv load in the host app.
- Not verified: Windows file-locking behavior of embedded Ladybug/LanceDB/SQLite when the FastAPI app runs multiple workers.

---

## 5. Defaults that silently send data off the machine or fall back to OpenAI

### Takeaway
(1) Any unset half defaults to OpenAI (now blocked by a preflight error for `add()`/`remember()`). (2) Anonymous telemetry to `https://test.prometh.ai` is ON by default. (3) The Ollama embedding engine sends `Bearer $LLM_API_KEY` to the embedding endpoint. (4) First-use model/tokenizer downloads hit Hugging Face.

### Cited Findings
- Defaults: LLM `openai/gpt-5.6-luna`, embeddings `openai/text-embedding-3-large` (3072 dims); `EMBEDDING_API_KEY` falls back to `LLM_API_KEY`. Changing only one half leaves the other on OpenAI — [Installation](https://docs.cognee.ai/getting-started/installation.md), [Overview](https://docs.cognee.ai/setup-configuration/overview.md)
- Preflight `ProviderConfigMismatchError` on `add()`/`remember()` (not on other entry points): "Your provider key ... would otherwise be sent to the OpenAI embeddings endpoint" — [Overview](https://docs.cognee.ai/setup-configuration/overview.md)
- Keyless defaults: with no usable LLM key and nothing else configured, graph extraction uses local GLiNER (`GRAPH_EXTRACTOR=auto`, about 750 MB download, auto-installs torch unless `GLINER_AUTO_INSTALL=false`) and embeddings use fastembed `BAAI/bge-small-en-v1.5` (384 dims). Any credential or explicit setting takes that half back. `COGNEE_SKIP_PREFLIGHT`/`COGNEE_SKIP_CONNECTION_TEST`/`MOCK_EMBEDDING` also disable this rerouting — [Overview](https://docs.cognee.ai/setup-configuration/overview.md)
- Telemetry: default ON; posts to `https://test.prometh.ai` (source `proxy_url = "https://test.prometh.ai"`); disabled when env var `TELEMETRY_DISABLED` is any non-empty value (`false` included); also skipped when `ENV` is `dev` or `test`. Contents: event name, time, Cognee version, settings (search type, top_k, query length, configured LLM/embedding provider and model), two random IDs (`.anon_id` in install dir, `~/.cognee/.persistent_id`), user/tenant UUIDs, a hash of `LLM_API_KEY` (key never sent), dataset UUIDs, REST error types. Never document/query/prompt text. Batched, 5 s timeout (`TELEMETRY_REQUEST_TIMEOUT`) — [Security](https://docs.cognee.ai/setup-configuration/security.md), [utils.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/shared/utils.py) (lines 575-580 confirm the `TELEMETRY_DISABLED` and `ENV in [test, dev]` checks)
- `TELEMETRY_DISABLED` also sets `RUNTIME__DLTHUB_TELEMETRY=false` for dlt ingestion — [Security](https://docs.cognee.ai/setup-configuration/security.md)
- OpenTelemetry tracing is off by default and exports only to a configured backend; `posthog` extra is separate — [Security](https://docs.cognee.ai/setup-configuration/security.md), [Installation](https://docs.cognee.ai/getting-started/installation.md)
- Turning telemetry off does not keep data on the machine: LLM and embedding providers still receive processed text — [Security](https://docs.cognee.ai/setup-configuration/security.md)
- Hugging Face downloads: a fastembed model or the tokenizer named by `HUGGINGFACE_TOKENIZER` is fetched on first use; pre-populate the HF cache (`HF_HOME`) to go offline — [Local Setup](https://docs.cognee.ai/guides/local-setup.md), [.env.template](https://raw.githubusercontent.com/topoteretes/cognee/main/.env.template)
- Ollama embedding engine source: `api_key = os.getenv("LLM_API_KEY")`; if set, adds `Authorization: Bearer <that key>` to the request to `EMBEDDING_ENDPOINT` — [OllamaEmbeddingEngine.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/llm/../databases/vector/embeddings/OllamaEmbeddingEngine.py). Note this reads `LLM_API_KEY`, not `EMBEDDING_API_KEY`.
- Cloud-sync template values `COGNEE_CLOUD_API_URL="http://localhost:8001"` and `COGNEE_CLOUD_AUTH_TOKEN` appear in the template but are only used for `serve()`/cloud connection — [.env.template](https://raw.githubusercontent.com/topoteretes/cognee/main/.env.template), [Overview](https://docs.cognee.ai/setup-configuration/overview.md)
- Optional outbound features are env-gated and off or unconfigured by default (Tavily/Keenable web search, scraping, integrations, `ALLOW_HTTP_REQUESTS`) — [Overview](https://docs.cognee.ai/setup-configuration/overview.md), [Security](https://docs.cognee.ai/setup-configuration/security.md)

### Inferences
- Combined local-embedding + cloud-LLM setup: the cloud `LLM_API_KEY` will be sent as a Bearer header to the Ollama endpoint. Harmless when Ollama is on localhost (it ignores it), but never point `EMBEDDING_ENDPOINT` at a remote non-trusted host in this configuration. This looks like a source-level quirk, not documented behavior; low severity locally.
- Must-set for privacy: `TELEMETRY_DISABLED=true`. Because any non-empty value disables, never write `TELEMETRY_DISABLED=false` expecting telemetry on.
- LiteLLM itself may fetch its model-cost registry from GitHub at import; I found no Cognee setting for `LITELLM_LOCAL_MODEL_COST_MAP` in the docs/template. Unverified (not in scope of Cognee docs).
- tiktoken may download `.tiktoken` encoding files on first use (OpenAI blob storage) when it is the tokenizer fallback; not documented by Cognee. Unverified.

### Gaps
- Not run: no network capture to confirm absence of other outbound calls (LiteLLM cost map, tiktoken download, HF hub checks).
- Telemetry endpoint "test.prometh.ai" is as documented and in source; I did not verify ownership.

---

## 6. Troubleshooting relevant to Ollama, embeddings, dimension mismatch, timeouts

### Takeaway
Most local-Ollama failures are: missing `LLM_API_KEY` placeholder, `/v1` on `LLM_ENDPOINT`, small `num_ctx`, embedding batch too big, and stale vector collections after changing embedding size.

### Cited Findings
- `LLMAPIKeyNotSetError` on a local setup: Ollama requires a non-empty `LLM_API_KEY`; use `ollama` — [Local Setup](https://docs.cognee.ai/guides/local-setup.md)
- `cannot connect to host`: start `ollama serve`, test `curl http://localhost:11434/api/tags`; pull models (Cognee never pulls); in Docker use `host.docker.internal`; Ollama binds 127.0.0.1 by default (`OLLAMA_HOST=0.0.0.0:11434` to expose) — [Local Setup](https://docs.cognee.ai/guides/local-setup.md), [LLM Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- 404 with `http://localhost:11434/v1/api/generate`: remove `/v1` from `LLM_ENDPOINT` — [LLM Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- Repeated timeouts: lower `EMBEDDING_BATCH_SIZE` (5) — [Local Setup](https://docs.cognee.ai/guides/local-setup.md)
- `EmbeddingException: Failed to index data points using model <model>`: on Ollama usually wrong model name or model not pulled; retried through the 128 s window — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md)
- `Embedding request timed out. Check EMBEDDING_ENDPOINT connectivity.` after 300 s; `Cannot connect to embedding endpoint.` — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md)
- Dimension mismatch: collections are created at the configured width; wrong vectors are always rejected (never truncated or padded). Multi-user mode: `EmbeddingDimensionMismatchError` (HTTP 409) naming dataset and widths; single-user: store-specific shape error on first write. Fix = set correct `EMBEDDING_DIMENSIONS`, `await cognee.prune.prune_system()` (or `prune_system(metadata=True)`), re-ingest. Different model with same width passes the check silently and degrades recall — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md)
- After first switching from OpenAI to a local provider call `cognee.prune.prune_system(metadata=True)` before cognify to clear stale vector collections — [Local Setup](https://docs.cognee.ai/guides/local-setup.md)
- Changing embedding model on existing data: re-process with `cognify(incremental_loading=False)` or delete and re-add; prune wipes all datasets — [LLM Providers, Switching the LLM](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- `ValidationError ... Missing: [...]` on import when only some of `LLM_MODEL/LLM_ENDPOINT/LLM_API_KEY` are set for ollama — [LLM Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- Known issue: Ollama LLM + OpenAI embeddings may fail with `NoDataError`; audio transcription unsupported with Ollama provider — [LLM Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- Inconsistent extraction on local servers: unset `LLM_TEMPERATURE` sends 0.0 on Ollama/llama.cpp/LM Studio — [Local Setup](https://docs.cognee.ai/guides/local-setup.md)
- Ollama HTTP 500 during cognify while `ollama run` works: context truncation; use Modelfile `num_ctx 8192` or lower `LLM_MAX_COMPLETION_TOKENS` — [LLM Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- "Could not load a matching tokenizer" warning is benign; fall back to TikToken — [Embedding Providers](https://docs.cognee.ai/setup-configuration/embedding-providers.md)
- Startup LLM preflight times out at 30 s; skip with `COGNEE_SKIP_CONNECTION_TEST=true` — [LLM Providers](https://docs.cognee.ai/setup-configuration/llm-providers.md)
- Windows `Could not find lbug C API shared library` and `ModuleNotFoundError` — see section 1.
- Debug: `LOG_LEVEL=DEBUG`; logs in `~/.cognee/logs` — [Logging](https://docs.cognee.ai/setup-configuration/logging.md)

### Inferences
- A reasonable first smoke test: `cognee-cli doctor --probe` (documented in Overview) before `remember()`.
- For EmbeddingGemma specifically, Ollama older than v0.11.10 will not run it (Ollama page); this would surface as an Ollama error inside `EmbeddingException`.

### Gaps
- No Cognee doc covering `Qwen3-Embedding`/`EmbeddingGemma` specific issues.
- `cognee-cli doctor` output format not reviewed.

---

## 7. Minimal .env files (derived; every name verified in docs and source above)

### Takeaway
Two blocks below. They are assembled from documented examples; they were not executed. Dimension values for EmbeddingGemma and Qwen3-Embedding-0.6B are unconfirmed by Cognee docs, so measure with the snippet in section 3 before first ingest.

### Cited Findings
- Variable names and formats used below come from the pages cited in sections 2 to 5.

### Inferences

#### A. Local Ollama embedding + cloud OpenAI-compatible LLM

```dotenv
# --- LLM: cloud OpenAI-compatible endpoint (LiteLLM routed) ---
LLM_PROVIDER="custom"
LLM_MODEL="openai/<model-id-your-endpoint-reports>"
LLM_ENDPOINT="https://<provider-host>/v1"
LLM_API_KEY="<cloud-key>"
# STRUCTURED_OUTPUT_FRAMEWORK=litellm_native is the default; leave unset

# --- Embeddings: local Ollama (pick ONE block) ---
EMBEDDING_PROVIDER="ollama"
EMBEDDING_ENDPOINT="http://localhost:11434/api/embed"
EMBEDDING_BATCH_SIZE="5"
# bge-m3 (docs-confirmed 1024 and tokenizer; no prefixes needed)
EMBEDDING_MODEL="bge-m3:latest"
EMBEDDING_DIMENSIONS="1024"
HUGGINGFACE_TOKENIZER="BAAI/bge-m3"
# EmbeddingGemma (dimension NOT confirmed by Cognee docs; measure; needs Ollama >= 0.11.10;
# tokenizer repo is gated on HF, so leave HUGGINGFACE_TOKENIZER unset)
# EMBEDDING_MODEL="embeddinggemma:latest"
# EMBEDDING_DIMENSIONS="768"
# Qwen3-Embedding-0.6B (dimension NOT confirmed by Cognee docs; measure)
# EMBEDDING_MODEL="qwen3-embedding:0.6b"
# EMBEDDING_DIMENSIONS="1024"
# HUGGINGFACE_TOKENIZER="Qwen/Qwen3-Embedding-0.6B"

# --- Storage (absolute paths, forward slashes on Windows) ---
SYSTEM_ROOT_DIRECTORY="C:/Projects/Jarvis/.cognee_system"
DATA_ROOT_DIRECTORY="C:/Projects/Jarvis/.cognee_data"
DB_PROVIDER="sqlite"
VECTOR_DB_PROVIDER="lancedb"
GRAPH_DATABASE_PROVIDER="ladybug"

# --- Behavior / privacy ---
ENABLE_BACKEND_ACCESS_CONTROL="false"   # single-user, as in the official local guide
TELEMETRY_DISABLED="true"
COGNEE_LOG_SEARCH_HISTORY="false"       # optional: do not store query/answer text
```
Notes: only one `EMBEDDING_MODEL` line may be active. Replace the example storage paths with the real ones. Cognee will send the cloud `LLM_API_KEY` as a Bearer header to the local Ollama embedding URL (harmless on localhost). The cloud provider receives the document text (chunks) for extraction.

#### B. Fully local Ollama (LLM + embeddings)

```dotenv
LLM_PROVIDER="ollama"
LLM_MODEL="llama3.1:8b"
LLM_ENDPOINT="http://localhost:11434"     # bare host, no /v1
LLM_API_KEY="ollama"                      # required non-empty placeholder
# Optional if cognify returns 500s: build a Modelfile with num_ctx 8192 and use that tag,
# or lower LLM_MAX_COMPLETION_TOKENS.

EMBEDDING_PROVIDER="ollama"
EMBEDDING_MODEL="bge-m3:latest"
EMBEDDING_ENDPOINT="http://localhost:11434/api/embed"
EMBEDDING_DIMENSIONS="1024"
HUGGINGFACE_TOKENIZER="BAAI/bge-m3"
EMBEDDING_BATCH_SIZE="5"

DB_PROVIDER="sqlite"
VECTOR_DB_PROVIDER="lancedb"
GRAPH_DATABASE_PROVIDER="ladybug"
SYSTEM_ROOT_DIRECTORY="C:/Projects/Jarvis/.cognee_system"
DATA_ROOT_DIRECTORY="C:/Projects/Jarvis/.cognee_data"

ENABLE_BACKEND_ACCESS_CONTROL="false"
CACHING="false"                           # as in the official Ollama example
TELEMETRY_DISABLED="true"
```
Install: `uv add "cognee[ollama]"`, then `ollama pull llama3.1:8b` and `ollama pull bge-m3`. The same block matches the official [Local Setup](https://docs.cognee.ai/guides/local-setup.md) "fully offline" `.env`, with bge-m3 substituted for nomic-embed-text (that substitution is mine, not in the docs). Tokenizer files from Hugging Face must be cached once while online; the docs state this.

### Gaps
- Neither block was run. Model tags `embeddinggemma:latest`, `qwen3-embedding:0.6b`, `bge-m3:latest` are real Ollama tags per Ollama pages or Cognee docs (bge-m3 in docs only).
- `COGNEE_ENV_FILE` recommended for isolation from Phibe's own `.env` is not in the blocks; add `COGNEE_ENV_FILE=<path>` in the process env if Phibe already has a `.env` at the project root (see section 4).
- Not verified: `LLM_MODEL="openai/<id>"` with `LLM_PROVIDER="custom"` against a specific cloud vendor; the docs call this the generic recipe.
