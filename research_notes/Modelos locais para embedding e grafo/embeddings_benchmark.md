# Local multilingual embedding models for PT-BR + EN personal notes (as of Nov 2026)

Method note: ~20 tool calls. The live MTEB leaderboard Space did not render via fetch, so scores come from model cards, Microsoft/Jina blogs and aggregators. Numbers marked (UNVERIFIED) come from my memory or an unconfirmed source. Nothing here was benchmarked on the target machine.

## 1. Quality: MMTEB / MTEB multilingual and Portuguese-specific numbers

### Takeaway
Best small-and-open options by MTEB(Multilingual, v2) mean-task: Harrier-OSS 0.6B (69.0) and 270M (66.5), then Qwen3-Embedding 0.6B (64.3), then EmbeddingGemma (61.2). On a native Brazilian-Portuguese benchmark (MTEB-BR, 22 tasks, third-party, July 2026), EmbeddingGemma-300m (64.9) and multilingual-e5-large-instruct (64.09) beat Qwen3-0.6B (62.32), arctic-l-v2 (62.01), bge-m3 (61.57) and multilingual-e5-large (59.09). The ranking differs between the generic and PT benchmarks, so weigh PT more for this use case.

### Cited Findings
- MTEB(Multilingual, v2) mean-task, model-card values: Qwen3-Embedding-0.6B 64.33, 4B 69.45, 8B 70.58 — [0.6B card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B), [4B card](https://huggingface.co/Qwen/Qwen3-Embedding-4B), [8B card](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- EmbeddingGemma-300m: 61.15 at 768d, 60.71 at 512d, 59.68 at 256d, 58.23 at 128d. QAT checkpoints: Q8_0 60.93, Q4_0 60.62 — [model card](https://huggingface.co/google/embeddinggemma-300m)
- EmbeddingGemma 2 (Ollama `embeddinggemma-2`): 61.36 at 768d (270m text variant per Ollama page; the page does not say which tag the score belongs to) — [Ollama](https://ollama.com/library/embeddinggemma-2)
- Microsoft Harrier-OSS-v1 (new, 2026, MIT): 270M = 66.5 (640d), 0.6B = 69.0 (1024d), 27B = 74.3; 32,768-token context. Bing blog lists Qwen3-0.6B at 64.3 and EmbeddingGemma-270m at 61.2 on the same 131-task average — [Bing blog](https://blogs.bing.com/search/April-2026/Microsoft-Open-Sources-Industry-Leading-Embedding-Model), [HF 27B card](https://huggingface.co/microsoft/harrier-oss-v1-27b), [aggregator](https://www.llmreference.com/benchmark/mteb-multilingual-v2)
- Granite-Embedding multilingual R2: 311M = 55.96, 97M = 51.92 on MTEB-Multilingual v2 (aggregator) — [llmreference](https://www.llmreference.com/benchmark/mteb-multilingual-v2)
- Jina-embeddings-v5-text-small (677M, Qwen3-0.6B-base backbone): about 67.0 MMTEB (Jina's own figure; one mirror says 67.7), license CC-BY-NC-4.0 (non-commercial) — [Jina](https://jina.ai/models/jina-embeddings-v5-text-small/), [Jina news](https://jina.ai/news/jina-embeddings-v5-text-distilling-4b-quality-into-sub-1b-multilingual-embeddings)
- MMTEB paper: best publicly available model across languages (at paper time) was the much smaller multilingual-e5-large-instruct, not the LLM-based ones — [arXiv 2502.13595](https://arxiv.org/pdf/2502.13595v4)
- A 2026 AACL short paper warns global MTEB(Multilingual) averages hide per-language failures (e.g. granite-311m, harrier-0.6b collapse on some of 17 tested languages; it does not say which languages, so check whether PT is among them) — [ACL Anthology](https://aclanthology.org/2026.aacl-short.28.pdf)
- Nomic-embed-text-v2-moe: MIRACL 65.80 vs bge-m3 69.20 and arctic-embed-v2-large 66.00; BEIR 52.86; Portuguese not named explicitly in the card — [HF card](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe)
- Ollama page lists snowflake-arctic-embed2 at 55.6 NDCG@10 BEIR and 55.8 MIRACL (secondary source, unverified) — [morphllm](https://www.morphllm.com/ollama-embedding-models)

#### Portuguese-specific: MTEB-BR (22 native Brazilian-Portuguese tasks, 7 categories, no translated data; author Tardelli Stekel; released 2026-07-06; third-party, not an official MTEB leaderboard)
Source for the whole table: [benchmarklist.com/benchmarks/mteb_br](https://benchmarklist.com/benchmarks/mteb_br/)

| Model | MTEB-BR Mean_22 |
|---|---|
| gemini-embedding-001 (closed) | 68.2 |
| Qwen3-Embedding-8B | 67.04 |
| KaLM-Embedding-Gemma3-12B-2511 | 67.01 |
| Octen-Embedding-8B | 66.74 |
| Qwen3-Embedding-4B | 66.21 |
| jina-embeddings-v5-text-small | 64.35 |
| EmbeddingGemma-300m | 64.9 |
| multilingual-e5-large-instruct | 64.09 |
| Qwen3-Embedding-0.6B | 62.32 |
| snowflake-arctic-embed-l-v2.0 | 62.01 |
| bge-m3 | 61.57 |
| multilingual-e5-large | 59.09 |
| granite-embedding-311m-multilingual-r2 | 59.02 |
| multilingual-e5-base | 57.54 |
| multilingual-e5-small | 56.11 |
| granite-embedding-107m-multilingual | 56.05 |
| paraphrase-multilingual-mpnet-base-v2 | 52.84 |
| paraphrase-multilingual-MiniLM-L12-v2 | 24.82 (suspiciously low; treat as unreliable/possibly truncation-limited) |

Not listed on MTEB-BR: jina-embeddings-v3, nomic-embed-text-v2-moe, Harrier (not checked in the table; unknown).

### Inferences
- Harrier-0.6B/270M likely the best small models on generic multilingual, but no PT-specific number was found for them. The AACL paper's per-language warning means PT should be validated on your own notes.
- For PT, EmbeddingGemma-300m (small, 300M) outperforms bge-m3 and Qwen3-0.6B on MTEB-BR despite lower generic score. Single third-party benchmark, so moderate confidence.
- Qwen3 4B/8B gain about 4-5 points over 0.6B on MTEB-BR but do not fit this GPU comfortably (see section 3).

### Gaps
- No MIRACL-pt per-language number extracted (bge-m3 card shows it only as an image). No mMARCO-pt, Quati, BEIR-PT numbers found in this session.
- No official MTEB(Multilingual v2) mean-task for bge-m3 / multilingual-e5 / arctic-l-v2 / jina-v3 / nomic-v2 was fetched. From memory (UNVERIFIED): bge-m3 ~59.6, e5-large-instruct ~63.2, e5-large ~58.1.
- Leaderboard Space was not fetchable, so "new strong small models" could be missed beyond Harrier, jina-v5, EmbeddingGemma 2, KaLM, Octen.

## 2. Size, quantization, dimensions, context, license

### Takeaway
Everything relevant is under ~2.5 GB in a 4-bit/8-bit form; only Qwen3 8B-class needs more than 4 GB. Licenses are mostly permissive; watch Jina v5 (non-commercial) and Gemma (custom terms).

### Cited Findings
- Qwen3-Embedding on Ollama: 0.6b / 0.6b-q8_0 639 MB (32K ctx); 0.6b-fp16 1.2 GB; 4b (q4_K_M) 2.5 GB; 4b-q8_0 4.3 GB; 4b-fp16 8.0 GB; 8b (q4_K_M) 4.7 GB; 8b-q8_0 8.0 GB; 8b-fp16 15 GB (4B/8B 40K ctx). Dims 1024 / 2560 / 4096 with MRL 32 up to max. Apache-2.0 — [Ollama tags](https://ollama.com/library/qwen3-embedding/tags), [HF card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)
- EmbeddingGemma-300m: 768d, MRL to 512/256/128, 2048-token context, QAT Q4_0/Q8_0 checkpoints, Gemma license (accept terms), no float16 activations. Ollama download about 622 MB — [HF](https://huggingface.co/google/embeddinggemma-300m), [morphllm](https://www.morphllm.com/ollama-embedding-models)
- EmbeddingGemma 2 on Ollama: 270m tag 304-378 MB (text only), 570m 918-990 MB, 440m/740m multimodal (1.3 GB); 768d with MRL to 512/256/128; 100+ languages; context stated as 8,192 in overview but 256K in Ollama listing (conflict); license not stated on the page — [Ollama](https://ollama.com/library/embeddinggemma-2)
- bge-m3: 567M, 1024d, 8192 ctx, MIT, ~1.2 GB on Ollama, dense+sparse+multi-vector; ONNX tag exists — [HF](https://huggingface.co/BAAI/bge-m3), [morphllm](https://www.morphllm.com/ollama-embedding-models)
- multilingual-e5-large-instruct: 1024d, 512-token cap, MIT, 24 layers — [HF](https://huggingface.co/intfloat/multilingual-e5-large-instruct)
- nomic-embed-text-v2-moe: 475M total / 305M active, 768d (MRL to 256), 512 ctx, Apache-2.0, ~100 langs — [HF](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe)
- snowflake-arctic-embed-l-v2.0: 74 languages, Apache-2.0, 568M, 1024d with MRL to 256, 8192 ctx (size/dims from Ollama listing; card truncated in my fetch) — [HF](https://huggingface.co/Snowflake/snowflake-arctic-embed-l-v2.0), [morphllm](https://www.morphllm.com/ollama-embedding-models)
- Harrier-OSS 270M 640d / 0.6B 1024d, 32,768 ctx, MIT — [Bing blog](https://blogs.bing.com/search/April-2026/Microsoft-Open-Sources-Industry-Leading-Embedding-Model)
- Jina-v5-text-small: 677M, 14 GGUF quants (F16 to IQ1_S), CC-BY-NC-4.0 — [Jina news](https://jina.ai/news/jina-embeddings-v5-text-distilling-4b-quality-into-sub-1b-multilingual-embeddings)
- Ollama library embedding list includes: embeddinggemma-2, nomic-embed-text(-v2-moe), qwen3-embedding, mxbai-embed-large, bge-m3 (567m), embeddinggemma (300m), all-minilm, snowflake-arctic-embed / -embed2 (568m), paraphrase-multilingual (278m), granite-embedding (30m, 278m), bge-large — [Ollama search](https://ollama.com/search?c=embedding)
- fastembed (docs list, 25 text models): multilingual-e5-large 1024d 2.24 GB, paraphrase-multilingual-mpnet-base-v2 1.0 GB, paraphrase-multilingual-MiniLM-L12-v2 0.22 GB; jina-v2-base-de/code. No bge-m3, no Qwen3, no EmbeddingGemma in this list — [fastembed docs](https://qdrant.github.io/fastembed/examples/Supported_Models/)

### Inferences
- Harrier and jina-v5 are not in the Ollama library list; they would need llama.cpp (GGUF) or sentence-transformers/ONNX. Harrier GGUF availability not verified.

### Gaps
- Per-quant quality loss for Qwen3/bge-m3 GGUF not found (only EmbeddingGemma QAT: <0.6 point drop at Q4_0).
- jina-v3 / v4 specs not fetched (card too large); from memory (UNVERIFIED): v3 570M, 1024d MRL, 8192 ctx, CC-BY-NC-4.0; v4 3.8B. Both non-commercial, v4 too large for 4 GB VRAM.
- ONNX int8 sizes not collected. multilingual-e5-small/base sizes (~118M/278M, UNVERIFIED) and Matryoshka support for them (none) not verified.

## 3. Speed on CPU and small GPU, RAM/VRAM

### Takeaway
No reliable published numbers for a Ryzen 7 5800H or GTX 1650. You should measure on the machine. VRAM need is roughly the download size plus overhead; the 4 GB GTX 1650 fits everything up to Qwen3-4B q4_K_M (2.5 GB) barely, and 8B does not fit.

### Cited Findings
- Guide states VRAM is roughly the quant's download size plus activation overhead; published tokens/sec figures mostly come from high-end GPUs — [morphllm](https://www.morphllm.com/ollama-embedding-models), [search summary](https://insiderllm.com/guides/embedding-models-rag/)
- H100 study (sequence length 512): bge-m3 about 640K tokens/s, small multilingual-e5 about 4.3M tokens/s. Not comparable to a laptop but gives relative cost (e5-small ~7x bge-m3) — [arXiv 2608.12875](https://arxiv.org/pdf/2608.12875)
- Arctic-embed2 >100 docs/s on an NVIDIA A10 (setup unspecified) — [morphllm](https://www.morphllm.com/ollama-embedding-models)
- Unverified aggregator claims of CPU (Ryzen 9 7950X): bge-m3 880 tok/s, Qwen3-0.6B 1,150 tok/s. I could not confirm source.

### Inferences
- Rough scale (my estimate, not measured): 0.3-0.6B models on 8 Zen3 cores should do on the order of 1-3K tokens/s, i.e. a 300-token chunk in about 0.1-0.3 s; GTX 1650 with Ollama should be several times faster. Treat as a hypothesis to test.
- 13.9 GB RAM leaves room for CPU inference of anything up to 4B q4/q8 but it will be slow (4B about 10x slower than 0.6B).

### Gaps
- No measured docs/s on 5800H or GTX 1650 for any model. Run the timing script below.

## 4. Availability in Ollama, fastembed, Cognee; pitfalls

### Takeaway
Cognee supports `fastembed`, `ollama`, `openai_compatible`. Ollama is the simplest route for EmbeddingGemma, Qwen3-0.6B, bge-m3, arctic-embed2, nomic-v2-moe. Fastembed (official) only covers old multilingual models, so it is weak for this goal. Harrier/jina-v5 require llama.cpp server via openai_compatible.

### Cited Findings
- Cognee shared vars: EMBEDDING_PROVIDER, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_MAX_COMPLETION_TOKENS (default 4096), EMBEDDING_BATCH_SIZE (default 32); leave EMBEDDING_ENCODING_FORMAT unset for fastembed/ollama — [Cognee docs](https://docs.cognee.ai/setup-configuration/embedding-providers)
- Ollama provider: `EMBEDDING_ENDPOINT=http://localhost:11434/api/embed` (full native path); HUGGINGFACE_TOKENIZER optional (falls back to TikToken approximate counts), read only by the Ollama engine; set EMBEDDING_BATCH_SIZE 1-10 if Ollama stalls — [Cognee docs](https://docs.cognee.ai/setup-configuration/embedding-providers)
- openai_compatible: endpoint e.g. `http://localhost:8080/v1`, `EMBEDDING_API_KEY="."`; llama.cpp via `llama-server --model x.gguf --embedding --port 8080`; use real HF repo ID as model for token counting — [Cognee docs](https://docs.cognee.ai/setup-configuration/embedding-providers)
- Changing dimensions needs `cognee.prune.prune_system()` and re-ingest; mismatch raises an error — [Cognee docs](https://docs.cognee.ai/setup-configuration/embedding-providers)
- fastembed: Qwen3 only in the Rust crate (candle, feature flag) and community Python forks (fastembed-qwen3, qwen3-embed); bge-m3 in Rust crate, not found in the Python list — [docs.rs](https://docs.rs/crate/fastembed/latest), [PyPI fork](https://pypi.org/project/qwen3-embed/1.0.0/)
- Prefixes: EmbeddingGemma `task: search result | query: {q}` for queries and `title: none | text: {doc}` for docs; nomic-v2 `search_query:` / `search_document:` (required); e5-instruct queries `Instruct: {task}\nQuery: {q}`, docs plain (e5 non-instruct uses `query: ` / `passage: ` per its standard card, UNVERIFIED here) — [Gemma card](https://huggingface.co/google/embeddinggemma-300m), [nomic card](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe), [e5-instruct card](https://huggingface.co/intfloat/multilingual-e5-large-instruct)

### Inferences
- Pitfall: Cognee's Ollama engine sends plain text; it likely does NOT add EmbeddingGemma/e5/nomic prefixes. Prefix-dependent models may lose retrieval quality unless Ollama's model template adds them. Verify (Ollama's embeddinggemma template may not add task prefixes; not confirmed). bge-m3 and Qwen3 (documents need no instruction; queries benefit from instruction) are most forgiving without prefixes.
- Ollama context for nomic is 2048 not 8192 per the Ollama card; chunks should stay below the model limits (EmbeddingGemma 2048, e5 512, nomic-v2 512).

### Gaps
- Whether Cognee injects prompts/prefixes: not documented in what I read; check Cognee source.
- Exact Ollama tag strings for `embeddinggemma` (`embeddinggemma:300m`) are from the listing and not pull-tested.

## 5. Ranking for THIS machine (Win11, 5800H, 13.9 GB RAM, GTX 1650 4 GB, Ollama)

### Takeaway
1. Best: EmbeddingGemma-300m via Ollama (small, 622 MB, best PT score among small models on MTEB-BR, MRL, GPU-friendly) provided the prefix issue is checked; otherwise Qwen3-Embedding-0.6B.
2. Alternative A: Qwen3-Embedding-0.6B Q8 (639 MB, 32K ctx, 1024d, no-prefix friendly, strong generic MMTEB 64.3).
3. Alternative B: bge-m3 (567M, ~1.2 GB, 8192 ctx, MIT, robust for long notes; 61.6 on MTEB-BR). Upgrade path if you want more quality: Qwen3-Embedding-4B q4_K_M (2.5 GB, 66.2 on MTEB-BR) but it barely fits 4 GB VRAM and will be slow on CPU.
Watch: Harrier-0.6B (MIT, 69.0 MMTEB) looks like the best small model on paper but has no PT number, no Ollama listing, and the AACL paper flags per-language collapses; test it via llama.cpp if you want to experiment.

### Cited Findings
- Scores and sizes as in sections 1-2 (see sources there).

### Inferences / Recommended Cognee env settings (untested)

Best (EmbeddingGemma-300m):
```
ollama pull embeddinggemma
EMBEDDING_PROVIDER="ollama"
EMBEDDING_MODEL="embeddinggemma:latest"
EMBEDDING_ENDPOINT="http://localhost:11434/api/embed"
EMBEDDING_DIMENSIONS="768"
EMBEDDING_MAX_COMPLETION_TOKENS="2048"
HUGGINGFACE_TOKENIZER="google/embeddinggemma-300m"   # gated repo: needs HF login, else drop it and accept TikToken approximation
EMBEDDING_BATCH_SIZE="8"
```
Alternative A (Qwen3-0.6B):
```
ollama pull qwen3-embedding:0.6b
EMBEDDING_PROVIDER="ollama"
EMBEDDING_MODEL="qwen3-embedding:0.6b"
EMBEDDING_ENDPOINT="http://localhost:11434/api/embed"
EMBEDDING_DIMENSIONS="1024"
HUGGINGFACE_TOKENIZER="Qwen/Qwen3-Embedding-0.6B"
EMBEDDING_BATCH_SIZE="8"
```
Alternative B (bge-m3):
```
ollama pull bge-m3
EMBEDDING_PROVIDER="ollama"
EMBEDDING_MODEL="bge-m3:latest"
EMBEDDING_ENDPOINT="http://localhost:11434/api/embed"
EMBEDDING_DIMENSIONS="1024"
HUGGINGFACE_TOKENIZER="BAAI/bge-m3"
EMBEDDING_BATCH_SIZE="8"
```
Smaller dims (MRL, e.g. 256) are possible for EmbeddingGemma/Qwen3 but Ollama's `/api/embed` accepts a `dimensions` parameter that Cognee may not pass (unverified); stick to native dims.

Quick local benchmark: embed ~200 real PT/EN note chunks per model with the `/api/embed` endpoint, time it after one warm-up, and build 20 PT queries with known target notes to compute recall@5. This replaces the missing speed and PT numbers.

### Gaps
- Nothing here was run on the target machine. Reminder to the project: Cognee embedding dimension change requires prune + re-ingest.
