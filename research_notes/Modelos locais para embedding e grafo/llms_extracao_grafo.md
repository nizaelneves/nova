# Local LLMs for knowledge-graph extraction (Cognee cognify) on Ryzen 7 5800H / 13.9 GB RAM / GTX 1650 4 GB (state as of 2026-11-14)

Scope note: earlier notes (small_local_alternatives.md, cognee_arquitetura_local.md) were read and not redone. Research was capped at about 15 tool calls. Key limitation up front: NO public benchmark was found that measures Cognee-style graph extraction on Portuguese with sub-10B models, and no measured GTX 1650 speeds. Everything marked "estimate" is my arithmetic, not a measurement.

## 1. Benchmarks: structured output, information extraction, KG construction, Portuguese evidence

### Takeaway
Published evidence says the failure mode of small models is format compliance (valid schema-conformant JSON), not "intelligence", and that the extraction framework (BAML/fuzzy parsing, constrained decoding) matters more than model choice. There is no trustworthy ranked table for the candidate models on this task; the ranking in section 6 is therefore a shortlist to test, not a measured result.

### Cited Findings
- JSONSchemaBench: 10K real-world JSON schemas, evaluates constrained-decoding frameworks (Guidance, Outlines, llama.cpp, XGrammar, OpenAI, Gemini) on efficiency, coverage and output quality. The abstract page did not give the result numbers — [arXiv 2501.10868](https://arxiv.org/abs/2501.10868)
- A practitioner benchmark of local 7-9B models for GraphRAG extraction (Gemma 2 9B, Qwen 2.5 7B, Mistral 7B, Llama 3.1 8B few-shot) reports 95-100% valid JSON when the schema is put in the prompt, but quality varied; internal test set, not peer reviewed; I could only see a search summary (the full page and a mirror returned 404) — [Medium, Graph Praxis](https://medium.com/graph-praxis/building-knowledge-graphs-with-local-llms-from-benchmarking-to-fine-tuning-ed572268aa3f)
- Lettria vendor report: fine-tuned (SFT) models reached over 98% reliability on text-to-graph, with Mistral Small 3.2 at 99.9% and Qwen 3 32B at 99.95%. Vendor source, 32B is out of range for this machine, so only evidence that fine-tuning/schema work fixes reliability — [Lettria benchmark](https://www.lettria.com/benchmarks/benchmarking-text-to-graph)
- BAML write-up on KG extraction with llama3 via Ollama: LangChain LLMGraphTransformer about 25% success (empty output on 75% of 20 articles), custom prompt+JSON parser about 38%, BAML 99.4% on 344 articles (0.58% empty). Not like-for-like (20 vs 344 articles), only llama3 tested, no hardware given, instructor not compared — [besthub BAML article](https://besthub.dev/articles/how-baml-turns-a-25-success-rate-into-99-for-knowledge-graph-extraction-with-small-llms-32db05f0cf76)
- Schema-constrained extraction evaluation papers exist (LREC26, Ilves et al., 6 entity types / 96 relation types; Semantic Web Journal on small LMs for RDF with SHACL). I did not see per-model numbers for Qwen3/Gemma/Llama in the excerpts — [LREC26 paper](https://ceur-ws.org/Vol-4313/kgnesy-paper25.pdf), [SWJ](https://www.semantic-web-journal.net/system/files/swj3845.pdf)
- Official card numbers for qwen3.5:4b (IFEval 89.8, BFCL-V4 50.3, TAU2 79.9, MMMLU 76.1) — [HF Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) (carried over from earlier note). Gemma 4 E4B vs Qwen3.5-4B: TAU2 42.2 vs 79.9, MMMLU 76.6 vs 76.1; Gemma 4 12B vs Qwen3.5-9B: MMMLU 83.4 vs 81.2 — [gemma4all](https://gemma4all.com/blog/gemma-4-vs-qwen-3-5-benchmarks), TAU2 42.2 confirmed at [Ollama gemma4](https://ollama.com/library/gemma4)
- BFCL v4 (June 2026 snapshot via search summary, not opened): MiniCPM5-2B 66.6%, Granite 4.2 3B 52.4%, LFM2.5-8B-A1B 49.7% — [BenchLM](https://www.benchlm.ai/benchmarks/bfclV4)
- Qualitative only: Qwen preferred for strict JSON/tool calls, Gemma 4 ahead on multilingual (MMMLU 88.4 vs 85.9 for 31B vs Qwen3.5-27B); no Portuguese extraction test found — [MindStudio comparison](https://www.mindstudio.ai/blog/gemma-4-vs-qwen-3-5-open-weight-comparison), search-result summaries
- Portuguese: Prosa Brazilian-Portuguese chat benchmark ranks Qwen3-generation well (Qwen3 4B 64.6); a chat benchmark, not extraction — [Prosa arXiv 2605.01630](https://arxiv.org/pdf/2605.01630). Granite 4.1 lists Portuguese among 12 supported languages and advertises native structured JSON output, but no scores on its page — [Ollama granite4.1](https://ollama.com/library/granite4.1)
- A CallSphere comparison of open-model structured-extraction rates has no methodology or sample sizes; discard — [CallSphere](https://callsphere.ai/blog/llm-comparison-structured-data-extraction-open-vs-open-may-2026)

### Inferences
- Because model-level numbers are weak, treat the Cognee framework setting (section 2) as the main lever, then A/B 3 models on 10-20 of the user's own PT notes counting: parse success, node/edge count, and share of edges with valid endpoints.
- IFEval/BFCL are proxies; high IFEval suggests schema obedience, which favours Qwen3.5 (89.8).

### Gaps
- No JSONSchemaBench per-model leaderboard figures, no BFCL numbers for Gemma 4 / Qwen3.5 4B/9B / Phi-4-mini retrieved, no PT relation-extraction benchmark, no verification of Bonsai/GLM-small/other new names (earlier notes already listed them as unverified on Ollama).

## 2. How Cognee calls the LLM and why small Ollama models fail

### Takeaway
Cognee extracts the graph via a structured-output call against a Pydantic schema (nodes + edges). The current default backend is `litellm_native` (LiteLLM `response_format`); `instructor` and `baml` are opt-in extras. BAML is documented as the fix for small local models. Context truncation and output-token budget cause the HTTP 500s.

### Cited Findings
- `STRUCTURED_OUTPUT_FRAMEWORK` accepts `litellm_native` (default), `instructor` (needs `pip install "cognee[instructor]"`), `baml` (needs `cognee[baml]`, else ImportError at startup). BAML uses separate `BAML_LLM_PROVIDER`, `BAML_LLM_MODEL`, `BAML_LLM_API_KEY`, optional `BAML_LLM_ENDPOINT`, `BAML_LLM_TEMPERATURE`, and can target a different model than the main LLM; docs say it is useful when small local models produce invalid output under instructor. Set env before importing Cognee; switching at runtime with `set_llm_config()` does not initialise the BAML client registry — [Structured output backends](https://docs.cognee.ai/setup-configuration/structured-output-backends)
- `LLM_INSTRUCTOR_MODE` (only with instructor): `json_schema_mode`, `json_mode`, `markdown_json_mode`/`md_json`, `tool_call`, `anthropic_tools`, `mistral_tools`. Defaults: ollama, bedrock, openai gpt-5 = `json_schema_mode`; gemini, custom, llama.cpp = `json_mode`; anthropic = `anthropic_tools`. Ollama older than 0.5 needs `json_mode`; Gemini breaks if forced to schema/tool modes — [Structured output backends](https://docs.cognee.ai/setup-configuration/structured-output-backends), [LLM providers](https://docs.cognee.ai/setup-configuration/llm-providers)
- Endpoint rule: bare `http://localhost:11434` on `litellm_native`; add `/v1` only with instructor (or a local OpenAI-compatible endpoint for BAML). Embedding endpoint is separate (`.../api/embed`) — [LLM providers](https://docs.cognee.ai/setup-configuration/llm-providers)
- Token variable is `LLM_MAX_COMPLETION_TOKENS` (default 16384), NOT `LLM_MAX_TOKENS`; it caps output per request and sizes cognify chunks; lower it for small local windows — [LLM providers](https://docs.cognee.ai/setup-configuration/llm-providers)
- `LLM_TEMPERATURE=0.0` recommended for extraction; if unset, Ollama/llama.cpp/LM Studio get 0.0, hosted providers get none; gpt-5 models reject non-default temperature. `LLM_SEED`, rate limit vars (`LLM_RATE_LIMIT_ENABLED/REQUESTS/INTERVAL`; local default 10 req) exist; `AUTO_RATE_LIMIT` on 429/503 — [LLM providers](https://docs.cognee.ai/setup-configuration/llm-providers)
- Docs' own failure list: problematic Ollama models include mistral, phi3, phi3.5, qwen2.5 under 14B; recommended `llama3.1:8b` (about 6 GB VRAM 4-bit) and `llama3.2:3b` for constrained hardware; failures show as `InstructorRetryException` or empty graphs; HTTP 500s during cognify on Ollama often come from context truncation, so raise `num_ctx` via a custom Modelfile or lower `LLM_MAX_COMPLETION_TOKENS` — [LLM providers](https://docs.cognee.ai/setup-configuration/llm-providers)
- Reports: `qwen3.5:0.8b` and `llama3.1:8b` raise InstructorRetryException under instructor; a BAML + Ollama recall() bug with optional `X | None` fields in GRAPH_COMPLETION — [search summary of Cognee docs/issues](https://docs.cognee.ai/setup-configuration/structured-output-backends); not individually verified
- Dec 2025 third-party test via Ollama + BAML on a PDF price-list extraction: gpt-oss:20b, qwen3:14b, deepseek-r1:14b, devstral:24b, ministral-3:14b, qwen3-vl:30b-a3b all failed to give valid structured output; gpt-oss:120b not finished after 2+ h; chunks about 4k tokens; no GPU, versions or num_ctx stated — [Dev.to](https://dev.to/rosgluk/self-hosting-cognee-llm-performance-tests-3oel). Pre-v1.6, single task, low confidence for today.
- Constrained decoding in Ollama: native `format` with a JSON schema is grammar-constrained (llama.cpp GBNF); I did not verify Cognee's litellm_native path actually sends the schema as `format` on Ollama (unverified).

### Inferences
- Thinking models (Qwen3.5 default thinking on) can burn the output budget on `<think>` and return no JSON; set non-thinking mode or a high output budget. Cognee exposes no thinking toggle in the docs I read; options are an Ollama Modelfile with `/set nothink`-style template, or `qwen3.5` non-thinking variant behaviour (unverified here).
- Ollama default `num_ctx` (2048-4096 depending on version) is below Cognee's about 4k chunk + schema + prompt + 1-2k output; build a Modelfile with `num_ctx 8192` (qwen3.5's hybrid design keeps KV cache small, per earlier note).
- A reasonable hybrid: BAML pointed at the local model first; if it fails on the user's notes, point only `BAML_LLM_*` at a cloud model.

### Gaps
- Exact current cognify chunk size setting, ordered cognify task list, and whether Cognee passes `num_ctx`/`options` to Ollama were not confirmed. Cognee issue tracker not searched directly.

## 3. Which models are realistic on this hardware, and expected speed

### Takeaway
Realistic: 3-9B dense at Q4 (about 2-6.6 GB), running partly or fully on CPU. Not realistic: 14B+, dense 24-32B, and all the MoE models found (too big for 14 GB RAM, even with small active params, because weights still have to fit). Expect single-digit tokens/s.

### Cited Findings
- Ollama sizes (Q4_K_M default): qwen3.5:4b 3.3-4.0 GB, qwen3.5:9b 6.6-7.6 GB — [Ollama qwen3.5](https://ollama.com/library/qwen3.5); gemma4 e2b 4.6-7.5 GB, e4b 6.6-9.5 GB, 12b 7.7-8.0 GB, 26b MoE (4B active) 16-19 GB — [Ollama gemma4](https://ollama.com/library/gemma4); granite4.1 3b 2.1 GB, 8b 5.3 GB, 30b 17 GB, all 128K — [Ollama granite4.1](https://ollama.com/library/granite4.1); qwen3.6 only 27b (18-19 GB) and 35b (23-24 GB) — [Ollama qwen3.6](https://ollama.com/library/qwen3.6)
- Speed estimate calculators (not measurements): qwen3.5 4B Q4_K_M about 7.8 tok/s with about 25 s time-to-first-token on GTX 1650 4 GB (model needs about 6.2 GB with context so it offloads); qwen3.5 2B about 28 tok/s — [willitrunai](https://willitrunai.com/can-run/qwen-3.5-4b-on-gtx-1650-4gb)
- Cognee docs name llama3.1:8b (about 6 GB at 4-bit) as the validated local model — [LLM providers](https://docs.cognee.ai/setup-configuration/llm-providers)

### Inferences (my estimates, unmeasured)
- Tokens/s: 3B (granite4.1:3b, llama3.2:3b) about 10-20; 4B (qwen3.5:4b) about 6-10; 8-9B (qwen3.5:9b, llama3.1:8b, granite4.1:8b) about 3-5, mostly CPU. Gemma 4 e4b about 5-9 (per-layer embeddings inflate size).
- Per note (~1.5k words PT, about 2.5-3k tokens, probably 1-2 chunks): output of 1-2k tokens per chunk for the graph plus a summary call, so about 3-5k generated tokens per note, plus prompt prefill (the 25 s TTFT figure scales with prompt). Roughly 5-10 min per note on a 4B, 10-20 min on 8-9B, 3-6 min on a 3B, i.e. 160 notes about 13-27 h (4B) or 27-50+ h (8-9B). Plan as an overnight/background job, incremental per note.
- Out: gpt-oss-20b (about 14 GB), Qwen3-30B-A3B, Qwen3.6-35B-A3B, Gemma 4 26B-A4B (16-19 GB), granite4.1:30b, Phi-4 14B, Mistral Small 24B, Llama 3.3 70B, Llama 4 (Scout/Maverick far too large). Phi-4-mini (3.8B) and SmolLM3 (3B) fit but were not benchmarked here and Cognee docs list phi3/phi3.5 as problematic (phi-4-mini not stated).
- Use `ollama ps` to check GPU/CPU split; `OLLAMA_NUM_PARALLEL=1`.

### Gaps
- No measured tokens/s on this GPU for any candidate; no minutes-per-note measurement; Phi-4-mini, SmolLM3, GLM-small, Bonsai not checked for Cognee suitability.

## 4. Cloud fallback: prices and 160-note cost, plus privacy

### Takeaway
Cloud cognify for 160 notes costs on the order of cents to a few dollars on any cheap model. The privacy cost (full note text sent to a third party) is the real trade-off, not money.

### Cited Findings (USD per 1M tokens, input / output, standard)
- Google: gemini-2.5-flash-lite 0.10 / 0.40 (batch 0.05 / 0.20); gemini-3.1-flash-lite 0.25 / 1.50; gemini-3.5-flash-lite 0.30 / 2.50 (batch 0.15 / 1.25); gemini-2.5-flash 0.30 / 2.50 but deprecated, routed to 3.5-flash-lite from 2026-12-01 — [Gemini pricing](https://aistudio.google.com/docs/pricing)
- OpenAI: gpt-5-nano 0.05 / 0.40; gpt-5.4-nano 0.20 / 1.25; gpt-5-mini 0.25 / 2.00; gpt-5.4-mini 0.75 / 4.50; gpt-4o-mini 0.15 / 0.60; batch is half — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- Anthropic: Claude Haiku 5.5 0.10 / 0.50 for prompts up to 100k tokens (0.50 / 2.50 above), batch 0.05 / 0.25; Haiku 4.5 1.00 / 5.00 — [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing). The Haiku 5.5 price is unusually low versus Haiku 4.5; I read it from the official page but flag it to double-check before relying on it.
- DeepSeek: deepseek-flash off-peak 0.15 / 0.60 (cache hit 0.003), peak 0.30 / 1.20; deepseek-v4-pro off-peak 0.66 / 1.98 — [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing)
- Qwen via Alibaba Cloud Model Studio: qwen-flash 0.05 / 0.40 (up to 256k input), batch 0.025 / 0.20; newer Qwen3.7-Flash 0.03 / 0.13 and Qwen3.8 Flash 0.15 / 0.47 only from third-party trackers (unverified) — [Alibaba qwen-flash](https://www.alibabacloud.com/help/en/model-studio/qwen-flash-us), [BenchLM Qwen pricing](https://benchlm.ai/alibaba/api-pricing)
- Cognee docs examples: Gemini uses `LLM_PROVIDER=gemini` + `LLM_MODEL=gemini/<id>`; Anthropic `anthropic/<id>`; OpenAI-compatible `LLM_PROVIDER=custom`, `LLM_MODEL=openai/<id>`, `LLM_ENDPOINT=.../v1`; gemini and custom default to instructor `json_mode`, which should be left alone for Gemini — [LLM providers](https://docs.cognee.ai/setup-configuration/llm-providers), [structured backends](https://docs.cognee.ai/setup-configuration/structured-output-backends)

### Inferences (my arithmetic; token counts are assumptions, not measured Cognee traffic)
- Assumption: 160 notes x about 1.5k words, PT about 1.7 tokens/word, so about 0.4-0.5M text tokens. Cognify prompt+schema overhead per chunk plus summary calls plus graph output give a pessimistic total of about 1.5M input and 0.6M output tokens.
- Cost at that total: gemini-2.5-flash-lite about $0.39; gpt-5-nano about $0.32; qwen-flash about $0.32; Claude Haiku 5.5 about $0.45; deepseek-flash off-peak about $0.59; gemini-3.1-flash-lite about $1.3; gpt-5.4-mini about $3.8. Even at 3x tokens it stays under about $12. Batch APIs halve it but Cognee does not use them.
- Choose by reliability, not price: a Haiku/GPT-mini class is the safer pick for schema compliance; Flash-Lite and nano tiers are cheapest but not tested here for Cognee schemas in PT.
- Privacy: whole note text (and entities extracted) goes to the provider. Mitigations: API/business terms with no-training (check each provider's current terms, not verified here), send only non-sensitive datasets, keep embeddings and stores local, use BAML so only extraction is cloud, strip secrets before ingest. Cognee `recall`/completion calls would also send retrieved chunks if the LLM stays cloud.

### Gaps
- No provider data-retention/training terms were fetched. No measured Cognee token usage per note. OpenAI/Google/Anthropic structured-output compliance on Cognee's schema not benchmarked.

## 5. Recommendation for this machine

### Takeaway
No model is proven for Cognee on this hardware. Start with the lowest-risk path (documented-validated llama-class vs best-scoring Qwen3.5), use BAML, and keep a cheap cloud model as the escape hatch.

### Inferences (recommendation = judgement from sections 1-4, not benchmark-proven)
- Best local to try first: `qwen3.5:4b` (3.3-4 GB, highest instruction/IFEval score under 9B, 201 languages incl. PT, speed about 6-10 tok/s), with thinking off or a large enough output budget; fall back to `qwen3.5:9b` if the graph is too thin (slow, 3-5 tok/s).
- Alternative A: `llama3.1:8b`, the only model the Cognee docs call validated (accept slow speed; weaker PT). Alternative B: `granite4.1:8b` or `:3b` (documented JSON output + Portuguese, 3b about 2.1 GB is fastest; no scores). `gemma4:e4b` is a third A/B candidate for PT fluency but weak on agentic scores (TAU2 42.2).
- Cloud fallback: Claude Haiku 5.5 (or gemini-3.1-flash-lite / gpt-5-nano if cheapest matters), configured via BAML so only extraction leaves the machine; about $0.3-1.5 for 160 notes.

Exact env settings (verify variable names against the installed Cognee version; docs changed in v1.6.x):

Local primary (Qwen3.5 4B via BAML, bare-host on local; create the Modelfile first):
```
# Modelfile:  FROM qwen3.5:4b  /  PARAMETER num_ctx 8192  /  PARAMETER temperature 0
# ollama create qwen35-4b-kg -f Modelfile
pip install "cognee[baml]"
STRUCTURED_OUTPUT_FRAMEWORK=baml
LLM_PROVIDER=ollama
LLM_MODEL=qwen35-4b-kg
LLM_ENDPOINT=http://localhost:11434
LLM_API_KEY=ollama
LLM_TEMPERATURE=0.0
LLM_MAX_COMPLETION_TOKENS=4096
BAML_LLM_PROVIDER=ollama
BAML_LLM_MODEL=qwen35-4b-kg
BAML_LLM_ENDPOINT=http://localhost:11434/v1
BAML_LLM_API_KEY=ollama
BAML_LLM_TEMPERATURE=0.0
```
(BAML_LLM_PROVIDER value `ollama` for a local endpoint is my assumption; the docs example shows `openai` for cloud and an OpenAI-compatible `/v1` endpoint for local, so if `ollama` is rejected use `openai` + the `/v1` endpoint.)

Alternative without BAML (instructor): `STRUCTURED_OUTPUT_FRAMEWORK=instructor`, `LLM_ENDPOINT=http://localhost:11434/v1`, `LLM_INSTRUCTOR_MODE=json_schema_mode` (try `json_mode` or `md_json` if retries fail), same model/temperature, `pip install "cognee[instructor]"`.

Swap models by changing only the Modelfile `FROM` (`llama3.1:8b`, `granite4.1:8b`, `qwen3.5:9b`); keep `num_ctx` 8192 (check RAM with `ollama ps`).

Cloud fallback (extraction only; main LLM can stay local):
```
STRUCTURED_OUTPUT_FRAMEWORK=baml
BAML_LLM_PROVIDER=anthropic   # or openai / google-ai per BAML provider names (unverified)
BAML_LLM_MODEL=<claude-haiku-5.5 id>   # exact id unverified; check Anthropic model list
BAML_LLM_API_KEY=...
BAML_LLM_TEMPERATURE=0.0
```
Simpler cloud route without BAML: Gemini `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini/gemini-3.1-flash-lite`, `LLM_API_KEY=...` (leave the instructor mode default `json_mode`; with `litellm_native` default no extra install).

Always: `EMBEDDING_*` must also be configured locally (see cognee_arquitetura_local.md) or it falls back to OpenAI; run `cognee.prune.prune_system(metadata=True)` after changing providers; `TELEMETRY_DISABLED=true`.

### Gaps
- Nothing here was executed. A 10-note PT/EN A/B (parse success, entities, relations, minutes per note) on qwen3.5:4b, granite4.1:3b/8b, llama3.1:8b, gemma4:e4b is required before committing.
