# Bonsai 2 27B (PrismML): viability for GTX 1650 4 GB / 14 GB RAM / Windows 11 / Ollama

## What it is, base model, size, context

### Takeaway
Ternary Bonsai 2 27B is a ternary-quantized (about 1.75-2.13 bits/weight) 27B multimodal reasoning model on a Qwen3.8 27B base, 5.95-7.21 GB on disk, 262K context, Apache 2.0, released 2026-09-17. It is far larger than the 4 GB of VRAM. A smaller sibling, Ternary Bonsai 2 4B (0.95 GB, Qwen3.5-4B base, released 2026-10-15), is the relevant candidate for this machine.

### Cited Findings
- Technique: weights are ternary {-1, 0, +1} with FP16 group-wise scaling, 1.76 effective bits/weight, applied end to end across the language model. Base is Qwen3.8 27B; text and image input; 262K context; Apache 2.0. — [PrismML announcement](https://prismml.com/news/bonsai-2-27b)
- Footprint 5.9 GB, "more than 9x smaller" than full precision; retains 98.2% of base aggregate score (vendor figure, 83.9 vs 85.4). — [PrismML announcement](https://prismml.com/news/bonsai-2-27b)
- Files: PTQ1_0 5.95 GB (1.75 bpw), PQ2_0 7.21 GB (2.13 bpw), mmproj vision Q8_0 0.63 GB / BF16 0.93 GB (optional), F16 53.8 GB. — [HF model card](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf)
- Collection has GGUF, GGUF-dev, and MLX 2-bit variants only (no safetensors listed). — [HF collection](https://huggingface.co/collections/prism-ml/bonsai-2)
- The company is a Caltech spin-out; backers listed are Khosla, Cerberus, Google. — [PrismML announcement](https://prismml.com/news/bonsai-2-27b)
- Base-model naming discrepancy: one guide says Qwen3.8-27B, another card cites Qwen3.6-27B (that card appears to be the earlier Bonsai 27B). Official page says Qwen3.8. — [search summary of mindstudio/HF cards](https://www.mindstudio.ai/blog/bonsai-2-27b-local-install)
- KV cache: about 64 KiB/token at FP16 (about 6.3 GiB at 100K ctx), about 1.8 GiB at 100K with 4-bit KV. — [Bonsai-demo repo](https://github.com/PrismML-Eng/Bonsai-demo/)
- Smaller siblings, Ternary Bonsai 2 (announced 2026-10-15): 2B 0.43 GB, 4B 0.95 GB, 9B 2 GB; Qwen3.5 base; ternary; Apache 2.0. — [PrismML Bonsai 2 family](https://prismml.com/news/bonsai-2-family)
- A third-party listing gives repo `prism-ml/Ternary-Bonsai-2-4B-gguf`, derived from Qwen3.5-4B, with vision projector and 262K context. — [llmreference](https://www.llmreference.com/model/bonsai-2-4b) (found via search snippet; page not opened, so unverified)

### Inferences
- 27B at 5.95 GB does not fit in 4 GB VRAM; weights alone would need partial CPU offload into the 14 GB RAM (KV cache and Windows overhead on top).
- The 4B (0.95 GB) fits fully in 4 GB VRAM with room for KV cache, and shares the Qwen3.5-4B base of the current qwen3.5:4b.

### Gaps
- Exact parameter count is not stated beyond "27B".
- Not confirmed whether the 4B Bonsai 2 file name/format matches the 27B packings.

## Open weights, license, GGUF/Ollama, runtime, GTX/CPU/Windows

### Takeaway
Weights are open (Apache 2.0) in GGUF, but the ternary packings need PrismML's llama.cpp fork (the Q2_0 packing may work on recent upstream). Ollama is not documented to work and very likely does not include the kernels. Windows with CUDA 12.4 prebuilt binaries exists; GTX 1650 (Turing) support is unverified.

### Cited Findings
- License Apache 2.0, open weights on Hugging Face. — [PrismML announcement](https://prismml.com/news/bonsai-2-27b)
- PQ2_0 and PTQ1_0 formats require the PrismML fork; stock llama.cpp rejects them and loads Q2_0 files without warning but outputs garbage. — [HF model card](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf)
- Bonsai-demo says the official Q2_0 format works with current upstream llama.cpp that includes Bonsai 2 support, while PQ2_0 (default, 7.8 GB incl. things) and PTQ1_0 need the fork. — [Bonsai-demo](https://github.com/PrismML-Eng/Bonsai-demo/)
- A Hadamard activation transform is not in upstream llama.cpp (per a secondary article), so the fork or setup-script binaries are needed. — [remio.ai](https://www.remio.ai/it/post/prismml-bonsai-2-27b-shrinks-local-ai-but-the-hardest-tests-still-matter-it)
- Repo supports Windows (PowerShell setup.ps1, start_llama_server.ps1), with prebuilt Windows binaries for CPU, CUDA 12.4, Vulkan, HIP; also CPU-only mode (-ngl 0). No compute-capability requirement stated. — [Bonsai-demo](https://github.com/PrismML-Eng/Bonsai-demo/)
- Vendor marketing says "NVIDIA GPUs via CUDA, using custom low-bit kernels" (speed numbers only on RTX 4090/5090). — [PrismML announcement](https://prismml.com/news/bonsai-2-27b)
- Ollama: the model card lists `ollama run hf.co/prism-ml/Ternary-Bonsai-2-27B-gguf:F16` (the unquantized 53.8 GB tag) and does not say whether Ollama has the fork; the Bonsai-demo and announcement never mention Ollama. — [HF model card](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf)
- Simon Willison confirmed the fork is needed (release `prism-b10685-7dffb15`) and saw a Metal warning suggesting it may not run optimally. — [Willison](https://simonwillison.net/2026/Sep/17/hn-49747390/)
- A web demo runs it in-browser via WebGPU. — [HF Space](https://huggingface.co/spaces/webml-community/ternary-bonsai-2-webgpu-kernels)

### Inferences
- Running via Ollama is likely not viable (unverified); the practical path is PrismML's llama-server (OpenAI-compatible HTTP at localhost), which Phibe could call instead of Ollama.
- GTX 1650 (Turing, CC 7.5) is within what CUDA 12.4 supports, but custom kernels' compatibility with it is untested in any source found.

### Gaps
- No evidence of anyone running any Bonsai on a GTX 1650 or any 4 GB GPU.
- Whether Ollama (recent versions) bundles Bonsai support: not found.

## Quality, speed, Portuguese, tool calling

### Takeaway
Vendor benchmarks show near-parity with the full-precision base, but nothing independent exists yet, and no speed data exists for weak GPUs. Portuguese is undocumented. On a 4 GB GPU the 27B would be CPU-offload-slow (inference).

### Cited Findings
- 27B per-category (thinking mode, vendor): agentic/tool 77.57, coding 81.58, instruction following 82.66, knowledge/reasoning 83.95, math 96.57, vision 78.59. — [PrismML announcement](https://prismml.com/news/bonsai-2-27b)
- Gaps vs full precision on a 14-benchmark suite: knowledge/reasoning 79.86 vs 85.55, BFCL v3 74.92 vs 76.74 (vendor figures, secondary-reported; differ from the announcement's category scores, so suites/definitions may differ). — [remio.ai](https://www.remio.ai/it/post/prismml-bonsai-2-27b-shrinks-local-ai-but-the-hardest-tests-still-matter-it)
- Speed (vendor): up to 143 tok/s on RTX 5090, 46.8 tok/s on M5 Max, 0.714 mWh/token on RTX 4090. — [PrismML announcement](https://prismml.com/news/bonsai-2-27b)
- Independent: about 20 tok/s (later about 44) on an M5 Pro with the fork. — [Willison](https://simonwillison.net/2026/Sep/17/hn-49747390/)
- Bonsai 2 small models vs Qwen3.5 full precision (vendor, retention %, 2B/4B/9B): tool calling 95.5/90.0/92.4, math 107.8/99.3/98.2, instruction following 121.5/106.0/100.0, coding 115.0/100.7/100.1, knowledge 82.9/90.9/93.0, vision 89.0/91.3/92.5. BFCLv3: 4B 70.16 vs 71.52 for Qwen3.5. No 4B speed figure given. — [PrismML Bonsai 2 family](https://prismml.com/news/bonsai-2-family)
- Thinking by default (reasoning effort default xhigh; low unsupported; needs large output cap such as 16384). Recommended temp 1.0, top_p 0.95, top_k 20 for thinking. — [HF model card](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf)
- Tool calling supported (BFCL v3, tau2-bench; Cline agent demos on RTX 5090). — [PrismML announcement](https://prismml.com/news/bonsai-2-27b)
- Headline figures are vendor-only and not independently reproduced; early user reports mixed/anecdotal. — [remio.ai](https://www.remio.ai/it/post/prismml-bonsai-2-27b-shrinks-local-ai-but-the-hardest-tests-still-matter-it)
- OpenRouter lists it at $0.075/M input, $0.50/M output tokens (hosted alternative). — [search summary of OpenRouter](https://openrouter.ai/models/prism-ml/ternary-bonsai-2-27b)

### Inferences
- With about 6 GB of weights mostly in system RAM over PCIe/DDR4 on a GTX 1650 machine, expect low single-digit tokens/s (estimate, no source); a default-thinking model would make that painful for a voice assistant.
- Bonsai 2 4B is roughly equal to Qwen3.5-4B on paper (about 90% on tool calling, about 100% on coding), at 0.95 GB vs 3.3 GB, which would free VRAM and speed things up, but only if it runs through a fork-based server.

### Gaps
- Portuguese/multilingual support: not stated in any source (Qwen base is multilingual, but ternary quantization effect on non-English is unknown).
- No independent benchmark or r/LocalLLaMA thread found (search returned none).
- No tokens/s for 4B or for any GTX-class GPU.
- Whether the 4B Bonsai 2 GGUF exists exactly as `prism-ml/Ternary-Bonsai-2-4B-gguf` was not verified on Hugging Face.
