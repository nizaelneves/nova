# Small local LLM alternatives to qwen3.5:4b for Phibe (Ollama, GTX 1650 4 GB, 14 GB RAM), as of 2026-10-26

## What is qwen3.5:4b's standing (benchmarks, tool calling, Portuguese, thinking mode)?

### Takeaway
qwen3.5:4b is very strong on paper for its size (IFEval 89.8, TAU2 79.9, MMMLU 76.1), and no sub-9B model I found clearly beats it on official numbers. Its real weakness on Ollama is integration: thinking is on by default and there are open reports of tool-call and thinking problems.

### Cited Findings
- Official card, Qwen3.5-4B: MMLU-Pro 79.1, IFEval 89.8, BFCL-V4 50.3, TAU2-Bench 79.9, MMMLU 76.1, INCLUDE 71.0, NOVA-63 54.3, AA-LCR 57.0, LongBench v2 50.0 — [HF Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B)
- Thinking is on by default (emits `<think>...</think>`). It can be turned off with `enable_thinking: False`. Recommended thinking-mode sampling is temp 1.0, top_p 0.95, top_k 20, presence_penalty 1.5. The model has 262K native context, a hybrid Gated DeltaNet + attention architecture, and supports 201 languages — [HF Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B)
- On Ollama, qwen3.5 has tools, thinking and vision capabilities. The 4b tag is 3.3-4.0 GB, and the 9b tag (same as latest) is 6.6-7.6 GB — [Ollama qwen3.5](https://ollama.com/library/qwen3.5)
- Known Ollama issues:
  - One reporter says the penalty parameters (repeat/presence/frequency) are accepted but silently ignored. This is the reporter's own source analysis, not confirmed by maintainers — [ollama#14493](https://github.com/ollama/ollama/issues/14493)
  - qwen3.5:9b sometimes prints the tool call instead of executing it — [ollama#14745](https://github.com/ollama/ollama/issues/14745)
  - A ZeroClaw report says the model produces reasoning but no structured tool call, while direct Ollama API calls worked — [zeroclaw#3079](https://github.com/zeroclaw-labs/zeroclaw/issues/3079)
  - A llama.cpp user reports that with thinking disabled all tool calls worked — [llama.cpp#20837](https://github.com/ggml-org/llama.cpp/issues/20837)
  - If thinking exhausts the output budget before the tool call, no tool call is emitted — [LocalAI docs](https://localai.io/docs/features/interleaved-thinking/)
- Portuguese: the Prosa Brazilian-Portuguese chat benchmark ranks Qwen3-generation models well (Qwen3 4B scores 64.6). Gemma 4 and Qwen3.5 are not in the snippet I saw — [Prosa arXiv 2605.01630](https://arxiv.org/pdf/2605.01630)

### Inferences
- The right first fix is probably configuration, not a model swap: disable thinking for plain chat and tool calls, and raise the output-token budget if thinking stays on.
- Do not treat BFCL-V4 50.3 as weak without comparison. BFCL v4 is a hard multi-turn/web-search suite, and the Qwen3-4B-Instruct-2507 entry is 35.5 overall — [benchmarklist](https://benchmarklist.com/models/qwen3-4b-instruct-2507-2/)

### Gaps
- No direct Portuguese head-to-head of qwen3.5:4b against Gemma 4 or Granite was found. The Prosa and PoETa v2 snippets did not include them.
- I did not verify whether the Ollama issues above are fixed in the current Ollama version.

## Which 3B-9B (or small-active MoE) models are better for tool use, instruction following, PT/EN and RAG?

### Takeaway
Nothing in the 3-9B class clearly beats qwen3.5:4b on published tool-use and instruction-following numbers. qwen3.5:9b is the clear step up in quality. Gemma 4 E4B is a weaker agentic model but a comparable multilingual one. Granite 4.1 is the credible different-family alternative for RAG and tool use.

### Cited Findings
- Head-to-head from model cards, as compiled by gemma4all:
  - Gemma 4 E4B vs Qwen3.5-4B: MMLU-Pro 69.4 vs 79.1, TAU2 42.2 vs 79.9, MMMLU 76.6 vs 76.1, LiveCodeBench 52.0 vs 55.8
  - Gemma 4 12B vs Qwen3.5-9B: TAU2 69.0 vs 79.1, MMMLU 83.4 vs 81.2, MMLU-Pro 77.2 vs 82.5
  - — [gemma4all](https://gemma4all.com/blog/gemma-4-vs-qwen-3-5-benchmarks). Gemma E4B TAU2 42.2 is confirmed on the [Ollama gemma4 page](https://ollama.com/library/gemma4).
- Gemma 4 on Ollama: e2b is 4.6-7.5 GB and e4b is 6.6-9.5 GB (128K context). 12b is 7.7-8.0 GB. 26b is an MoE with 4B active parameters and is 16-19 GB. All have native function calling and configurable thinking — [Ollama gemma4](https://ollama.com/library/gemma4)
- Granite 4.1: `granite4.1:3b` is 2.1 GB and `granite4.1:8b` is 5.3 GB (128K context). Its stated uses include RAG, function calling and structured JSON, and Portuguese is explicitly listed. The Ollama page shows no benchmark scores — [Ollama granite4.1](https://ollama.com/library/granite4.1)
- BenchLM BFCL v4 snapshot (June 2026) lists MiniCPM5-2B 66.6%, Granite 4.2 3B 52.4%, LFM2.5-8B-A1B 49.7%. Qwen3.5-4B and Gemma 4 are not on that list — [BenchLM BFCL v4](https://www.benchlm.ai/benchmarks/bfclV4), via a search summary I did not open in full.
- MoE candidates are too big for this machine:
  - qwen3.6 is only 27b (18-19 GB) and 35b (23-24 GB) — [Ollama qwen3.6](https://ollama.com/library/qwen3.6)
  - Gemma 4 26B-A4B is 16-19 GB
  - Qwen3.5-35B is 22 GB
- The Ollama newest list shows many unfamiliar small names (for example tev1 0.8b/4b, bonsai-2, nimble-v3 9b, nemotron-3.5-bolt e4b). I could not verify any of them or find independent benchmarks — [Ollama newest](https://ollama.com/search?o=newest)
- The Ertas article ranks Qwen3-4B-Instruct-2507, Gemma 4 E4B and Phi-4-Mini on BFCL v4. It says its figures are illustrative ranges and not first-party, and the vendor sells fine-tuning, so I did not use its numbers — [Ertas](https://www.ertas.ai/blog/on-device-tool-calling-2026-qwen3-gemma4-phi4)
- Qualitative claim, unverified: Gemma 4 emits cleaner tool calls via native special tokens and needs fewer output tokens per call — [Ertas](https://www.ertas.ai/blog/on-device-tool-calling-2026-qwen3-gemma4-phi4); [MindStudio](https://www.mindstudio.ai/blog/gemma-4-vs-qwen-3-5-open-weight-comparison)

### Inferences
- Candidate ranking for Phibe:
  1. qwen3.5:9b is the best quality step if speed allows (TAU2 79.1, MMLU-Pro 82.5).
  2. gemma4:e4b is the only family worth an A/B for Portuguese fluency and cleaner tool formatting. Its agentic score is far lower.
  3. granite4.1:3b or 8b is a RAG-oriented, Portuguese-listed alternative, but it has no published scores I could find.
- Qwen3-4B-Instruct-2507 (non-thinking) is a fallback if thinking is a persistent problem. It is an older generation, and I did not verify that it beats qwen3.5:4b with thinking off.

### Gaps
- No independent RAG-grounding or faithfulness benchmark for these small models was found.
- No Granite 4.1 IFEval or BFCL numbers were found.
- I did not check Phi, SmolLM, GLM or gpt-oss small variants. gpt-oss-20b (~14 GB) is, from my own background knowledge and not verified here, too large for 4 GB VRAM plus 14 GB RAM.

## Realistic speed/VRAM on GTX 1650 4 GB + 14 GB RAM, quantization and context

### Takeaway
Only about 3 GB-class models fit fully on the GPU. A 4B model at Q4 is borderline once the KV cache is added, and 8-9B models run mostly on the CPU at single-digit tokens/s.

### Cited Findings
- A calculator estimates qwen3.5 4B Q4_K_M at about 7.8 tok/s with ~25 s time to first token. It flags the model as not fitting in 4 GB (needs ~6.2 GB) and says it will offload. The qwen3.5 2B estimate is ~28 tok/s. These are estimates, not measurements — [willitrunai](https://willitrunai.com/can-run/qwen-3.5-4b-on-gtx-1650-4gb)
- The Qwen3.5-4B Q4_K_M GGUF is 2.55 GiB, and a Towards AI author reports 2.24x faster generation on a 4 GB NVIDIA GPU after tuning llama.cpp GPU settings. Absolute numbers were not retrieved, and the article does not name the 1650 — [Towards AI](https://pub.towardsai.net/how-i-made-local-llms-up-to-2-24-faster-on-a-4gb-nvidia-gpu-e0c02f2b1821)
- Q4 memory per gemma4all: Gemma E4B ~5 GB, Qwen3.5-4B ~4 GB, Qwen3.5-9B ~5 GB (minimum), Gemma 4 12B ~6.6 GB — [gemma4all](https://gemma4all.com/blog/gemma-4-vs-qwen-3-5-benchmarks)
- Ollama sizes (above) include more than the weights for Gemma E4B (per-layer embeddings), which is why e4b shows 6.6 GB or more.

### Inferences
- qwen3.5:4b at 4096 context on this card is probably already partly offloaded. Qwen3.5's hybrid DeltaNet design keeps the KV cache small, so keeping num_ctx at 4096 is cheap in VRAM.
- Expected speeds are my estimates and unmeasured: 9B Q4 around 3-5 tok/s and Gemma E4B around 6-10 tok/s. Thinking mode multiplies latency by hundreds of hidden tokens, so disabling it is the biggest speed lever.
- Use Q4_K_M, the Ollama default. Do not go below Q4 for tool calling. Q8 on the 4B is not worth it on this card.
- Measure with `ollama run <model> --verbose` and `ollama ps` to see the GPU/CPU split.

### Gaps
- No measured GTX 1650 benchmark for qwen3.5 or Gemma 4 was found.

## Concrete recommendation: top 3 to try

### Takeaway
Keep qwen3.5:4b but test it with thinking disabled. Try qwen3.5:9b for quality, gemma4:e4b for Portuguese and tool-format cleanliness, and granite4.1:8b (or 3b) for retrieval-grounded answers.

### Cited Findings
- Pull names confirmed on the Ollama library pages: `qwen3.5:9b`, `gemma4:e4b`, `granite4.1:8b` and `granite4.1:3b` — [qwen3.5](https://ollama.com/library/qwen3.5), [gemma4](https://ollama.com/library/gemma4), [granite4.1](https://ollama.com/library/granite4.1)

### Inferences
1. `ollama pull qwen3.5:9b`. It has the best published tool-use and instruction scores in range, but it will be slow on this hardware (mostly CPU). It is worth it only if latency is acceptable.
2. `ollama pull gemma4:e4b`. It has the closest multilingual score to the 4B (MMMLU 76.6) and native function-calling tokens, but a much lower TAU2 (42.2). Run it as an A/B on Phibe's real tool set.
3. `ollama pull granite4.1:8b` (or `granite4.1:3b` for speed). It is built for RAG and function calling with Portuguese listed, but it has no published scores, so rely on your own eval.
- Evaluation plan: run the same 30-50 Phibe prompts (PT and EN, tool calls, knowledge-grounded Q&A) against each model, and count correct tool calls, hallucinated facts and tokens per second.

### Gaps
- I could not confirm any model that clearly beats qwen3.5:4b for this use, so this is a shortlist to test and not a proven upgrade.
