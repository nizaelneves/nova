# Cognee audit: security, privacy/telemetry, licensing, enterprise boundaries, project health (as of 2026-11-14)

Method note: sources were fetched through a summarizing WebFetch; code quotes come from that summary, not a local clone. No git clone / grep / pip-audit was run. Items marked UNVERIFIED need a local `git clone` + `grep -rn` to confirm.

## 1. Telemetry and outbound network calls (is note content ever sent?)

### Takeaway
Cognee sends anonymous telemetry by default to `https://test.prometh.ai` (not PostHog by default). It is disabled with `TELEMETRY_DISABLED` set to any non-empty value (the value "false" also disables it) or `ENV=dev|test`. Docs say document contents, queries, prompts and answers are never included. The real content-egress path is the configured LLM/embedding provider, not telemetry.

### Cited Findings
- Endpoint is hard-coded: `proxy_url = "https://test.prometh.ai"`, events queued via `TelemetrySender` with timeout `TELEMETRY_REQUEST_TIMEOUT` (default 5 s) — [cognee/shared/utils.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/shared/utils.py)
- Disable: `if os.getenv("TELEMETRY_DISABLED"): return`; any non-empty value disables, including "0" and "false". Also skipped if `ENV` in ["test","dev"] — [cognee/shared/utils.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/shared/utils.py); [docs security](https://docs.cognee.ai/setup-configuration/security.md); [docs telemetry](https://docs.cognee.ai/reference/telemetry)
- `TELEMETRY_DISABLED` also turns off dlt's telemetry (dlt is a core dependency) — [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- Payload fields: anonymous_id (uuid in `.anon_id` in project root), persistent_id (`~/.cognee/.persistent_id`), event name/time, user_id, tenant_id, a PBKDF2-derived hash of `LLM_API_KEY` (`api_key_tracking_id`), provider/model names, operation settings (search type, top_k, query length not text). Optional `TRACKING_ID` override — [cognee/shared/utils.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/shared/utils.py)
- Docs: "Events never include document contents, queries, prompts or answers"; dataset names, session IDs and URLs are uuid5-fingerprinted; some REST names (e.g. node set names) are sent as typed — [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- REST error telemetry: exception class, status code, route template, Cognee version, no messages — [docs telemetry](https://docs.cognee.ai/reference/telemetry)
- `TELEMETRY_ORIGIN=cloud` gives a stricter metadata-only contract — [docs telemetry](https://docs.cognee.ai/reference/telemetry)
- Turning telemetry off does not stop the LLM/embedding providers receiving the text Cognee processes — [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- Startup/connection test: Cognee calls the configured LLM and embedding endpoint with a test prompt at 30 s timeout; skip with `COGNEE_SKIP_CONNECTION_TEST=true` — [cognee/infrastructure/llm/utils.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/llm/utils.py)
- tiktoken: `tiktoken.encoding_for_model(model)` or `get_encoding("cl100k_base")`; no try/except, no env var. tiktoken library itself downloads BPE files from openaipublic.blob.core.windows.net on first use (library behavior, my knowledge, not seen in Cognee code) — [TikToken adapter](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/llm/tokenizer/TikToken/adapter.py)
- fastembed: `TextEmbedding(model_name, cache_dir)`; cache = `FASTEMBED_CACHE_PATH`, else HF hub cache (`HF_HUB_CACHE`/`HF_HOME`), else temp dir. Downloads go through the HF hub with fallback to fastembed's own bucket; `HF_HUB_OFFLINE` is not referenced in Cognee code — [FastembedEmbeddingEngine.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/databases/vector/embeddings/FastembedEmbeddingEngine.py)
- Ollama engine: default endpoint `http://localhost:11434/api/embed`, also POSTs to `/api/show` on same host; default HF tokenizer name `Salesforce/SFR-Embedding-Mistral` is resolved via `resolve_embedding_tokenizer` (file not seen), falls back to TikToken on mismatch — [OllamaEmbeddingEngine.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/infrastructure/databases/vector/embeddings/OllamaEmbeddingEngine.py)
- Optional `posthog` extra (`posthog>=3.5,<4`) and `tracing` extra (OpenTelemetry OTLP exporters) exist; not default — [PyPI metadata](https://pypi.org/pypi/cognee/json)
- Default dependency `fastembed`, `huggingface-hub`, `tiktoken`, `litellm`, `tokenizers` are in core requires_dist — [PyPI metadata](https://pypi.org/pypi/cognee/json)
- `cognee/__init__.py` loads `.env` and logging at import; no litellm telemetry/callback settings visible there — [cognee/__init__.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/__init__.py)
- URL fetching/repo cloning (`ALLOW_HTTP_REQUESTS`) and integrations (Slack, Gmail, Notion, GitHub...) are outbound only when used — [docs security](https://docs.cognee.ai/setup-configuration/security.md), [api/client.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/api/client.py)

### Inferences
- Recommended lockdown env for Phibe: `TELEMETRY_DISABLED=1`, `ENV=dev` (belt and braces; but check ENV side effects), `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `FASTEMBED_CACHE_PATH=<pre-seeded dir>`, `COGNEE_SKIP_CONNECTION_TEST=true` if no LLM at boot, `LITELLM_LOCAL_MODEL_COST_MAP=True` (litellm env var, my knowledge: stops fetch of the model-cost JSON from GitHub; UNVERIFIED for the pinned litellm version), pre-warm tiktoken cache via `TIKTOKEN_CACHE_DIR`. Then verify with a firewall/Process Monitor test.
- The hash of `LLM_API_KEY` plus persistent user/tenant IDs is pseudonymous identifying metadata even though no note content is sent.
- Hard-coded host named "test.prometh.ai" is odd (looks like a test/proxy host); a signal to block it at the firewall in addition to the env flag.

### Gaps
- Not verified: whether litellm sets `litellm.telemetry`/callbacks anywhere in Cognee (needs grep of repo); litellm's own model-cost-map fetch from GitHub at import (known litellm behavior, not confirmed for this pin).
- Not verified: exact tokenizer fetch behavior in `resolve_embedding_tokenizer` (file not read).
- Not verified: any version-check call (none seen in files read; only 4 files plus docs read).
- Not verified: the `TelemetrySender` implementation and posthog use outside the optional extra.

## 2. Security: advisories, API defaults, ingestion restrictions, code execution, secrets

### Takeaway
One published critical advisory: CVE-2026-31231 (RCE via notebook exec endpoint, CVSS 9.8), affecting 0.3.0 to <1.2.0, fixed in 1.2.0; before 1.1.0 the API needed no auth by default. Current auth default is on, but the server binds 0.0.0.0 by default. Latest (1.6.8) has ingestion path restrictions.

### Cited Findings
- GHSA-8pr4-p4c8-8gr9 / CVE-2026-31231, Critical CVSS 3.1 9.8 (AV:N/PR:N), CWE-94, published 2026-09-15; `POST /api/v1/notebooks/{notebook_id}/{cell_id}/run` passes body to `exec()`; affected >=0.3.0,<1.2.0; fixed 1.2.0 by removing the endpoint; auth was not required by default before 1.1.0 — [GitHub advisory](https://github.com/topoteretes/cognee/security/advisories/GHSA-8pr4-p4c8-8gr9)
- This was the only advisory listed on the advisories page when fetched — [advisories list](https://github.com/topoteretes/cognee/security/advisories)
- SECURITY.md: report to security@cognee.ai or GitHub private advisory; only the latest release gets fixes; ack 2 business days; targets Critical 7d / High 30d / Medium 60d / Low 90d; coordinated disclosure with CVE — [SECURITY.md](https://github.com/topoteretes/cognee/blob/main/SECURITY.md)
- Default bind: `start_api_server(host="0.0.0.0", port=8000)` and `HTTP_API_HOST` default "0.0.0.0" (port 8011 in agent mode) — [api/client.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/api/client.py)
- Auth default: `ENABLE_BACKEND_ACCESS_CONTROL` defaults true; `REQUIRE_AUTHENTICATION` inherits it, so auth is required with no env vars; `ENABLE_BACKEND_ACCESS_CONTROL=false` makes auth optional and uses a default user — [get_authenticated_user.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/modules/users/methods/get_authenticated_user.py); [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- Default user has no password unless `DEFAULT_USER_PASSWORD` set; local stacks (`cognee-cli -ui`, docker-compose) set `default_password`; JWT secret is random per process unless `FASTAPI_USERS_JWT_SECRET` set; API keys stored plaintext unless `HASH_API_KEY=true` — [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- CORS: origins from `CORS_ALLOWED_ORIGINS`, default `UI_APP_URL` or `http://localhost:3000`; `allow_credentials=True`; headers `*` — [api/client.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/api/client.py)
- Ingestion restrictions: `ACCEPT_LOCAL_FILE_PATH` unset means SDK/CLI/stdio-MCP accept local paths, API/network-MCP refuse; `COGNEE_ALLOWED_LOCAL_FILE_ROOTS` opt-in allowlist; `ALLOW_HTTP_REQUESTS` (SSRF-checked) and `ALLOW_DATABASE_INGESTION` refused over API when unset; `ALLOW_CYPHER_QUERY` off by default (RCE risk) — [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- v1.6.7 (2026-11-06): refuses raw DB connection strings and server file paths over HTTP by default, `ACCEPT_LOCAL_FILE_PATH` also governs `s3://`, blocked ingestion returns 403. v1.6.6: KMS errors surfaced, delete-permission checks. v1.6.5.dev0: daily CVE summary to Slack, connector hardening — [GitHub releases](https://api.github.com/repos/topoteretes/cognee/releases?per_page=8)
- `COGNEE_LOG_SEARCH_HISTORY=true` by default stores plaintext questions and answers — [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- api/client.py router list shows no explicit exec endpoint, but includes `/api/v1/agents`, `/llm`, `/responses`, `/skills`, `/slack`, `/integrations`; router internals not seen — [api/client.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/api/client.py)
- Dependency pins visible: cryptography <51, aiohttp>=3.13.5, pypdf>=6.6.2, urllib3>=2.6.0, python-multipart>=0.0.22, certifi>=2026.10.19 (floors suggest recent CVE bumps); heavy core deps incl. litellm, gunicorn, fakeredis[lua], enola-cli==0.5.1 — [PyPI metadata](https://pypi.org/pypi/cognee/json)

### Inferences
- For local-first use: run via the Python SDK in-process (no HTTP server), or bind `HTTP_API_HOST=127.0.0.1`. Must be >=1.2.0 (really latest, since only latest gets fixes). Do not enable `ENABLE_BACKEND_ACCESS_CONTROL=false` plus a network-reachable port.
- Any browser page can still target a localhost server; CORS is credentialed but restricted to one origin by default, which is acceptable; DNS-rebinding/CSRF not assessed.
- Fix SLA of 7 days for critical plus daily CVE watch is a good sign; but the existence of an exec() endpoint shipped for ~1.5 years shows code-review maturity risk.

### Gaps
- No pip-audit was run; no list of CVEs in transitive deps checked. Do not treat the absence of other advisories as proof of no issues (only one page fetched; no NVD query).
- CVE-2026-31231 cross-check on NVD not done.
- Custom tasks/eval/pickle usage in the repo not grepped. Code search of `exec(`, `eval(`, `pickle`, `subprocess` is pending.
- Version in which `ENABLE_BACKEND_ACCESS_CONTROL` default and bind default changed not traced.

## 3. Encryption

### Takeaway
File encryption (AES-256-GCM) exists but is off by default and covers only files under `DATA_ROOT_DIRECTORY`. The graph, vector and relational stores, session cache and SQLite/LanceDB/Ladybug system files are not covered; docs defer to backend/volume encryption. SQLCipher is not mentioned.

### Cited Findings
- File encryption off by default; files under `DATA_ROOT_DIRECTORY` sealed with AES-256-GCM, a per-file data key; keys from a local keyring or AWS KMS; no bulk re-encryption tool for existing files — [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- Not covered: graph/vector/relational stores, session cache, SQLite/LanceDB/Ladybug files; rely on volume/backend encryption — [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- OAuth/integration credentials: AES-256-GCM with a user-supplied keyring, no default key. Neo4j stored password: Fernet, with an insecure default `NEO4J_ENCRYPTION_KEY` that must be replaced — [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- SQLCipher / DB-level encryption: not mentioned on the page — [docs security](https://docs.cognee.ai/setup-configuration/security.md)
- PyPI extra `turso` (pyturso) exists; encryption capabilities not checked — [PyPI metadata](https://pypi.org/pypi/cognee/json)

### Inferences
- For Phibe: derived chunk text, entity names and embeddings live unencrypted in SQLite/LanceDB/graph files; file encryption of raw sources alone gives little protection. Use OS volume encryption (BitLocker/LUKS/FileVault) and keep the data dir under user-only ACLs.
- Keyring location for local keys not documented in what was read; key custody (OS keychain vs file) UNVERIFIED.

### Gaps
- Keyring format/location and whether the Windows DPAPI/keychain is supported: not found.

## 4. License, dependencies, feature walls

### Takeaway
Apache-2.0, copyright Topoteretes UG (Berlin). No enterprise wall found on add/cognify/search/update/forget, Ollama embeddings, or LLM providers in the OSS package; enterprise features are sold as BYOC services.

### Cited Findings
- LICENSE: Apache License 2.0, copyright Topoteretes UG 2024; Section 6 gives no trademark rights — [LICENSE](https://raw.githubusercontent.com/topoteretes/cognee/main/LICENSE)
- PyPI: `license_expression` Apache-2.0, files LICENSE and NOTICE.md; python `>=3.10,<3.15`; latest 1.6.8 — [PyPI](https://pypi.org/pypi/cognee/json)
- NOTICE.md: Topoteretes UG copyright; third-party section is an unfilled template, so it lists no third-party licenses — [NOTICE.md](https://raw.githubusercontent.com/topoteretes/cognee/main/NOTICE.md)
- Default dependencies (core) are mostly permissive (fastapi, sqlalchemy, lancedb, litellm, networkx, tiktoken, fastembed, onnxruntime, pandas, pydantic etc.); no AGPL/GPL package seen in the core list. `ladybug==0.22.3` (embedded graph DB) license not checked; `enola-cli==0.5.1` unknown package, license not checked — [PyPI metadata](https://pypi.org/pypi/cognee/json)
- Optional extras with possible license/size concerns: `docs` (unstructured, nltk), `docling`, `gliner` (torch, gliner2), `llama-cpp`, `scraping` (playwright), `neo4j` (driver Apache; Neo4j server GPL/commercial, separate), `postgres` (psycopg2 is LGPL; psycopg2-binary too) — [PyPI metadata](https://pypi.org/pypi/cognee/json); licenses of these are my knowledge, UNVERIFIED here
- Pricing page: self-hosting "free, forever"; Free cloud tier 1M tokens; Standard $1/1M tokens adds Slack/Notion/Linear/Drive integrations and code indexing (cloud); Enterprise (BYOC) adds bi-temporal memory, conflict resolution, per-answer provenance, personalization, SSO and advanced permissions (tier-dependent), support SLA — [cognee.ai/pricing](https://www.cognee.ai/pricing)
- API router includes `conflicts`, `provenance`, `sync`, `ontologies`, `visualize`, `skills`, `agents` endpoints in the OSS package, so some of the "enterprise" ideas have OSS code; maturity not assessed — [api/client.py](https://raw.githubusercontent.com/topoteretes/cognee/main/cognee/api/client.py)

### Inferences
- Core Phibe verbs (add/cognify/search/update/forget), Ollama embeddings (`ollama` extra, local `/api/embed`), litellm for cloud LLMs, `baml` extra and graph visualization (`visualize` router) are present in the OSS wheel; no license-key check seen. Whether bi-temporal memory is OSS or cloud/BYOC-only: pricing lists it as Enterprise; OSS code status UNVERIFIED.
- psycopg2 (LGPL) only matters if the postgres extra is bundled/redistributed in Phibe; not needed for SQLite/LanceDB/Ladybug default.

### Gaps
- No automated license scan (pip-licenses) was run. gliner_demo, "demo vs production" labels in docs not found.
- Trademark policy: no document found; only Apache Section 6. Unknown whether a separate policy exists.

## 5. Project health

### Takeaway
Active, venture-funded, rapidly releasing project with a commercial cloud/BYOC business built on top; abandonment risk low near term; relicensing risk is non-zero but there is no signal.

### Cited Findings
- GitHub: 33,310 stars, 3,512 forks, 1,124 open issues, created 2023-08-16, last push 2026-11-14, not archived — [GitHub API](https://api.github.com/repos/topoteretes/cognee)
- Releases: v1.6.8 on 2026-11-12, v1.6.7 on 2026-11-06, v1.6.6 on 2026-10-29, v1.6.5 on 2026-10-16 (roughly weekly) — [GitHub releases](https://api.github.com/repos/topoteretes/cognee/releases?per_page=8)
- Seed round announced 2026-02-19, $7.5M per company blog (some outlets say EUR 7.5M), led by Pebblebed with 42CAP, Vermilion Cliffs Ventures and angels; funds go to a managed cloud platform; 70+ companies in production claimed — [Cognee blog](https://www.cognee.ai/blog/cognee-news/cognee-raises-seven-million-five-hundred-thousand-dollars-seed); [Pulse2](https://pulse2.com/cognee-7-5-million-seed-funding-raised-for-building-enterprise-grade-memory-layer-for-ai-agents); amount/currency conflict noted by [Bebeez](https://bebeez.eu/?p=69554)
- Security: SECURITY.md says only latest release supported — [SECURITY.md](https://github.com/topoteretes/cognee/blob/main/SECURITY.md)

### Inferences
- High release cadence with a 1.x number and only the latest release patched means pin-and-forget is unsafe; Phibe must track upstream or fork.
- Monetization targets cloud/BYOC; the open-core split (integrations, bi-temporal, SSO in paid) is where relicensing or feature-gating pressure would appear. Apache-2.0 snapshots remain forkable regardless.
- 1,124 open issues vs team size suggests triage backlog.

### Gaps
- Contributor count/concentration: page did not load; not found.
- Stars trend over time, roadmap doc, company headcount, trademark policy: not found.
- Release dates before v1.6.5 not read.
