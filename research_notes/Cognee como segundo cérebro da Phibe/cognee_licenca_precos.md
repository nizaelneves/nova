# Cognee: license, pricing, health, hybrid feasibility (state as of 2026-11-14)

Note: not a lawyer; trademark/ToS terms were not retrievable (see Gaps).

## 1. License, forking rights, CLA, trademark, non-open parts

### Takeaway
Core repo is Apache-2.0 (permissive): modify, fork, embed in a closed-source desktop app and redistribute is allowed, subject to the standard notice/attribution terms. Contributions use DCO, not a CLA. A few "production" components are explicitly sold as licensed products, not in the OSS repo.

### Cited Findings
- Repo license is Apache License 2.0 (Jan 2004), copyright Topoteretes UG, 2024 — [LICENSE](https://raw.githubusercontent.com/topoteretes/cognee/main/LICENSE); [repo](https://github.com/topoteretes/cognee)
- No CLA mentioned; contributions require DCO sign-off (`git commit -s`); CONTRIBUTING does not say which license contributions fall under or mention trademarks — [CONTRIBUTING](https://github.com/topoteretes/cognee/blob/main/CONTRIBUTING.md)
- README: Postgres-as-graph-store is a demo, "production-ready version is available as a licensed product"; bundled GLiNER extractor is a demo, production version via contact — [repo](https://github.com/topoteretes/cognee)
- Cognee Cloud is a managed service; its licensing is not described in the README — [repo](https://github.com/topoteretes/cognee)
- The Cloud UI is the same frontend as the open-source local UI (`cognee.start_ui()`, ports 3000/8000); only hosted-workspace usage/spend pages are not in the OSS build — [docs local UI](https://docs.cognee.ai/cognee-cloud/local-ui)
- No license change found in the sources I read (still Apache-2.0 on main).

### Inferences
- Apache-2.0 allows closed-source embedding/forking; must keep LICENSE/NOTICE and mark changes, and includes a patent grant. Apache-2.0 section 6 does not grant trademark rights: rebrand your fork and don't call it "Cognee" (inference from the license text, not from a Cognee trademark policy).
- The "licensed product" bits are niche (Postgres graph store, GLiNER extractor); core pipelines are open.

### Gaps
- No Cognee trademark policy found. Cloud Terms of Service / privacy policy: /terms returned 404; not read.
- Whether the UI frontend directory carries a different license than the Python core was not verified.

## 2. Cognee Cloud pricing, plans, limits, paid-only features, privacy

### Takeaway
Free tier (1M tokens, 1 workspace), usage-based Standard at $1/1M tokens + $5/workspace/month, and a sales-led Enterprise BYOC tier. Data residency is not stated publicly.

### Cited Findings
- Free: $0, 1M tokens, 1 workspace, no card, unlimited users/API calls, Claude Code/Codex/MCP integrations — [pricing](https://www.cognee.ai/pricing)
- Standard: $1.00 per 1M tokens processed; $5/month per extra workspace; adds Slack, Notion, Linear, Google Drive integrations, repo code indexing, in-app support — [pricing](https://www.cognee.ai/pricing)
- Enterprise: contact sales, BYOC (own cloud/VPC), SLAs, bi-temporal memory with conflict resolution, answer provenance, per-user/agent personalization, dedicated support engineer — [pricing](https://www.cognee.ai/pricing)
- Enterprise BYOC engagement tiers: Startup (12 mo, pre-Series B discount), Standard (6 mo), Recommended (12 mo; finetuned small-model runtime, optional SSO, limited governance), Priority (24 mo; continuous evals, org-wide ontology) — [pricing](https://www.cognee.ai/pricing)
- Pricing page says Cloud runs on gpt-oss-120b — [pricing](https://www.cognee.ai/pricing)
- Cloud features: managed compute/storage (PostgreSQL, LanceDB, Ladybug), web UI, `cognee.serve()` SDK, Company Brain connectors (Slack, GitHub, Drive), multi-tenancy with dataset isolation and RBAC; idle workspaces sleep and wake in about a minute — [docs cloud](https://docs.cognee.ai/cognee-cloud/overview)
- Data movement: `cognee.serve()` points the SDK at Cloud or a self-hosted backend; `cognee.push()` moves an existing local graph — [docs local UI](https://docs.cognee.ai/cognee-cloud/local-ui)
- Data region, SSO (Standard tier), rate limits: not stated on the pages read.

### Inferences
- Docs say Cloud vs OSS differ in where it runs (hosted persistence, collaboration, managed compute), not in core engine. No evidence of a proprietary "better search" algorithm in Cloud; enterprise extras are bi-temporal memory, provenance, finetuned models, governance, SLAs.
- For a single-user desktop app, paid tiers add little.

### Gaps
- Data residency regions, privacy/DPA terms, SSO availability per tier: not found.
- Whether Enterprise features (bi-temporal, provenance) exist in OSS: unclear; listed under Enterprise only.

## 3. Maintenance health

### Takeaway
Very active: ~33k stars, 12.6k commits, funded seed, near-weekly releases (v1.6.8 on 2026-11-12) but with frequent breaking changes in minor/patch releases.

### Cited Findings
- 33.3k stars, 3.5k forks, 12,645 commits on main; latest news items v1.6.1 on 2026-09-24 (the README list lags) — [repo](https://github.com/topoteretes/cognee)
- Releases: v1.6.8 (2026-11-12), v1.6.7 (11-06), v1.6.6 (10-29), v1.6.6rc1 (10-23), v1.6.5 (10-16), v1.6.4 (10-13) — [releases](https://github.com/topoteretes/cognee/releases)
- Breaking/behavior changes: v1.6.7 ingestion refuses raw DB connection strings / HTTP paths by default, `ACCEPT_LOCAL_FILE_PATH` gates s3://; v1.6.6rc1 deleting a dataset purges search/conversation history, `run_info` shape changed, new `LLMPaymentRequiredError`; v1.6.5 triplet embedding/memify deprecated or removed, fastembed cache default moved to `~/.cognee/models`, needs datamodel-code-generator >=0.56.0; v1.6.4 LanceDB auto-pruning removed — [releases](https://github.com/topoteretes/cognee/releases)
- Funding: $7.5M seed announced 2026-02-19, led by Pebblebed with 42CAP, Vermilion Ventures, angels from Google DeepMind, n8n, Snowplow; funds for cloud platform, Rust edge engine, connectors — [Pulse 2.0](https://pulse2.com/cognee-7-5-million-seed-funding-raised-for-building-enterprise-grade-memory-layer-for-ai-agents), [Cognee](https://www.cognee.ai/cognee-raises-seven-million-five-hundred-thousand-dollars-seed). Some sources say EUR 7.5M or $8.8-8.9M (CB Insights/Seedtable); treat as inconsistent.

### Inferences
- Pre-2.0 API churn is real: pin a version in a fork/embed and review each upgrade. Company has runway (seed Feb 2026) and a commercial incentive to keep OSS core alive.

### Gaps
- Contributor count not retrieved. Whether 1.6.x is the latest stable (vs newer) as of today: 1.6.8 was the newest seen.

## 4. Hybrid feasibility (paid cloud search + forked OSS UI)

### Takeaway
Technically feasible and documented (same API, `serve()`/`push()`), but economically pointless for a single user and untested legally against Cloud ToS.

### Cited Findings
- Same SDK/API for local, self-hosted and Cloud; `cognee.serve()` switches backend; `cognee.push()` uploads a local graph — [docs local UI](https://docs.cognee.ai/cognee-cloud/local-ui), [docs cloud](https://docs.cognee.ai/cognee-cloud/overview)
- OSS UI = Cloud UI minus usage pages — [docs local UI](https://docs.cognee.ai/cognee-cloud/local-ui)

### Inferences
- Nothing in what I read forbids using Cloud as a backend from a forked app; ToS unread, so verify (especially reselling/multi-tenant use of one account). Privacy trade-off: a "second brain" in a third-party cloud with undisclosed region contradicts a local-first app. Free tier (1M tokens) is small for heavy ingestion.

### Gaps
- Cloud ToS, acceptable use, API rate limits not read.

## 5. "Free version could not do embedding": real limitation?

### Takeaway
Not an OSS limitation. Local embeddings are supported (fastembed in-process ONNX, Ollama, LM Studio, vLLM, etc.). Failures usually stem from config (dimension mismatch, OpenAI fallback) or small LLM structured-output quality.

### Cited Findings
- Fastembed runs in-process with no key/GPU; downloads a few hundred MB on first run — [embedding docs](https://docs.cognee.ai/setup-configuration/embedding-providers)
- `EMBEDDING_DIMENSIONS` must match the model (MiniLM 384, nomic-embed-text 768, bge-large 1024); mismatch errors; fix with `prune_system()` and re-ingest; unknown aliases fall back to 3072 — [embedding docs](https://docs.cognee.ai/setup-configuration/embedding-providers)
- Ollama processes sequentially; lower `EMBEDDING_BATCH_SIZE` (default 32) to 1-10 on timeouts; 300 s per-request timeout — [embedding docs](https://docs.cognee.ai/setup-configuration/embedding-providers)
- If only the LLM or only the embedding provider is configured locally, the other falls back to OpenAI (needs a key, which looks like "can't embed") — [local setup](https://docs.cognee.ai/guides/local-setup)
- Local LLM caveats: `LLM_ENDPOINT` without `/v1` for litellm_native; temperature 0.0; `cognee[instructor]` for the instructor path; small models can give empty/malformed extraction — [local setup](https://docs.cognee.ai/guides/local-setup)
- Docs conflict on whether fastembed is bundled or an extra (`cognee[fastembed]`) — [search summary of docs](https://docs.cognee.ai/setup-configuration/embedding-providers)

### Inferences
- The most likely user-side cause: unset embedding provider (silent OpenAI fallback), wrong dimensions, or a too-small LLM failing the graph extraction step (cognify), not embedding itself.

### Gaps
- Docs do not list model-size limits; the LLM-providers page (recommended/problematic models) was not read.
