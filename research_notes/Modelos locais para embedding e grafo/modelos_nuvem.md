# Modelos em nuvem (API) para embedding multilingue e extracao de grafo (Cognee) - nov/2026

Premissas de custo (minhas, nao de fontes): 160 notas x ~3k tokens = 480k tokens de embedding. Extracao: ~4x de overhead = ~1,9M tokens de entrada + ~240k de saida (saida e suposicao, ~1,5k/nota). Edicoes: ~20 notas/mes (~12,5% do corpus), ou seja custo mensal = ~1/8 do custo inicial. Todas as contas abaixo sao aritmetica minha sobre precos citados.

## 1. Embeddings multilingues em nuvem: preco, qualidade, dimensoes

### Takeaway
Embeddings de nuvem custam centavos para 160 notas (< US$0,10 em todos os casos). O custo nao decide; decide privacidade e qualidade em PT-BR. No topo do MTEB Multilingual v2 (set/2026) lideram modelos open-weight; entre APIs, Gemini Embedding e o mais citado. Nao achei score especifico de PT-BR para nenhum modelo de API.

### Cited Findings
- Ranking de set/2026 em MTEB(Multilingual, v2): harrier-oss-v1-27b (Microsoft, open) 74,31; KaLM-Embedding-Gemma3-12B 72,32; Qwen3-Embedding-8B 70,75 (fonte secundaria; leaderboard ao vivo nao pude ler) — [llmreference MTEB v2](https://www.llmreference.com/benchmark/mteb-multilingual-v2) / busca agregada; [Qwen3-Embedding-8B model card cita 70,58 em jun/2025](https://huggingface.co/Qwen/Qwen3-Embedding-8B) (via resumo de busca)
- Gemini Embedding 2: 69,9 em MTEB multilingual, segundo o paper do proprio Google (mai/2026); dimensoes 128-3072 (Matryoshka, default 3072); contexto 8192 (fonte secundaria) — [arXiv 2605.27295](https://arxiv.org/pdf/2605.27295.pdf); [guia apiyi](https://docs.apiyi.com/en/news/gemini-embedding-2-preview-launch)
- Precos Gemini: gemini-embedding-001 US$0,15/1M; gemini-embedding-2 US$0,20/1M (batch US$0,10); tier gratuito existe, mas no tier gratuito os dados sao usados para melhorar produtos Google — [Gemini pricing](https://aistudio.google.com/docs/pricing)
- OpenAI: text-embedding-3-small US$0,02/1M; 3-large US$0,13/1M (batch nao listado) — [OpenAI pricing](https://developers.openai.com/api/docs/pricing). Dimensoes 1536/3072: padrao Cognee ([Cognee embeddings](https://docs.cognee.ai/setup-configuration/embedding-providers))
- Voyage: voyage-4 US$0,06/1M, voyage-4-lite US$0,02, voyage-4-large US$0,12; 200M tokens gratis; Batch API -33%; voyage-3.5 US$0,06 — [Voyage pricing](https://docs.voyageai.com/docs/pricing). Dimensoes/contexto: nao constam na pagina (gap)
- Qwen text-embedding-v4 (Alibaba Model Studio): ~US$0,07/1M (tabelas mostram 0,07 e 0,072), dim 64-2048, 8192 tokens max; pagina datada dez/2025 — [Alibaba Model Studio](https://www.alibabacloud.com/help/en/model-studio/embedding)
- Cohere Embed v4: ~US$0,12/1M segundo agregadores; pagina oficial nao publica preco por token e cita Embed v5 como mais novo — [agregador getmaxim](https://www.getmaxim.ai/bifrost/llm-cost-calculator/provider/cohere/model/embed-v4.0); [Cohere pricing](https://cohere.com/pricing)
- Mistral embed: US$0,10/1M, 1024 dim (so fonte terceira) — [digitalapplied](https://www.digitalapplied.com/blog/embedding-model-cost-calculator-vendor-comparison-2026)
- Jina v5 text small: US$0,05/1M (agregador), 677M params, 32K contexto, Matryoshka; pesos CC-BY-NC-4.0 (uso comercial restrito); nano US$0,02, 8K — [aisa.one](https://aisa.one/models/jina-embeddings-v5-text-small); [edenai nano](https://www.edenai.co/expert-models/jina-embeddings-v5-text-nano)
- Rank global multilingue prediz so moderadamente o rank em PT; existe benchmark nativo MTEB-BR; auditoria AACL 2026 mostra inversoes de rank por idioma — [AACL 2026](https://aclanthology.org/2026.aacl-short.28.pdf); resumo de busca sobre MTEB-BR
- Nomic API: nao pesquisado (gap).

### Tabela (custo = 480k tokens; mensal ~ 60k tokens)

| Modelo | US$/1M | Indexar 160 notas | Mensal (edicoes) | Dim | Contexto | Qualidade (MTEB multi) | Verificacao |
|---|---|---|---|---|---|---|---|
| OpenAI 3-small | 0,02 | ~0,010 | ~0,001 | 1536 | 8191 (nao verificado nesta rodada) | nao obtido (modelo de 2024, antigo) | preco oficial |
| OpenAI 3-large | 0,13 | ~0,062 | ~0,008 | 3072 | idem | nao obtido | preco oficial |
| Gemini embedding-001 | 0,15 | ~0,072 | ~0,009 | 3072 (Matryoshka) | nao verificado | ~68,3 (vendor, 2025; conflito entre fontes) | preco oficial |
| Gemini embedding-2 | 0,20 (batch 0,10) | ~0,096 | ~0,012 | 128-3072 | 8192 | 69,9 (paper Google) | preco oficial |
| Voyage-4 | 0,06 (200M gratis) | 0 (gratis) | 0 (gratis) | nao verificado | nao verificado | nao obtido | preco oficial |
| Voyage-4-large | 0,12 (200M gratis) | 0 (gratis) | 0 | nao verificado | nao verificado | nao obtido | preco oficial |
| Qwen text-embedding-v4 | ~0,07 | ~0,034 | ~0,004 | 64-2048 | 8192 | baseado em Qwen3-Embedding (~70,6 no 8B; nao e o mesmo modelo hospedado, nao verificado) | preco oficial, datado dez/2025 |
| Cohere embed v4 | ~0,12 | ~0,058 | ~0,007 | nao verificado | nao verificado | nao obtido | NAO verificado (agregador) |
| Mistral embed | ~0,10 | ~0,048 | ~0,006 | 1024 | nao verificado | nao obtido | NAO verificado (3a parte) |
| Jina v5 small | ~0,05 | ~0,024 | ~0,003 | Matryoshka | 32K | nao obtido | NAO verificado (agregador) |

### Inferences
- Para 160 notas, qualquer opcao custa < US$0,10; o tier gratis do Voyage (200M tokens) cobre indexacao e edicoes por muito tempo.
- Melhor qualidade documentada entre APIs: Gemini Embedding 2 (69,9) ~ Qwen3-class; mas melhor pontuacao geral e open-weight (harrier, KaLM, Qwen3-8B), que podem rodar localmente se a GPU aguentar — comparacao com a pesquisa local.
- Sem teste em PT-BR, a escolha deveria ser validada com ~20 consultas reais das proprias notas.

### Gaps
- Nao consegui ler o leaderboard MTEB ao vivo (pagina carrega via JS); scores vem de agregadores.
- Sem score PT-BR especifico (MTEB-BR) de nenhum modelo de API; nao li a tabela do MTEB-BR.
- Dimensoes/contexto de Voyage-4, Cohere, OpenAI nao verificados nesta rodada; Nomic API nao pesquisado; Mistral/Cohere/Jina precos nao confirmados em pagina oficial.

## 2. LLM barato para extracao de grafo (cognify)

### Takeaway
Os mais baratos viaveis: GPT-5 nano (~US$0,19 p/ indexar tudo), Claude Haiku 5.5 (~US$0,31), Gemini 2.5 Flash-Lite (~US$0,29). Todos custam menos de US$1,50 na indexacao inicial; o gargalo e a confiabilidade do JSON estruturado, nao o preco.

### Cited Findings
- Gemini: 2.5 Flash-Lite US$0,10 in / 0,40 out (batch -50%, tier gratis com treino nos dados); 3.1 Flash-Lite 0,25/1,50; 3.5 Flash-Lite 0,30/2,50; 2.5 Flash 0,30/2,50 (deprecado: desde 1/dez/2026 roteia para 3.5 Flash-Lite); 3.6/3.8 Flash 0,75/3,75 ate 31/dez/2026 e dobra em 1/jan/2027 — [Gemini pricing](https://aistudio.google.com/docs/pricing). Batch "nao disponivel" para varios modelos na tabela do tier gratis.
- OpenAI: gpt-5-nano 0,05 in / 0,40 out; gpt-5-mini 0,25/2,00; gpt-5.4-nano 0,20/1,25; gpt-5.4-mini 0,75/4,50; batch = 50% — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- Claude: Haiku 5.5 US$0,10 in / 0,50 out para prompts ate 100k tokens (0,50/2,50 acima disso); batch 0,05/0,25; Haiku 4.5 US$1/5 — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing). Preco muito baixo para Haiku; conferir se e correto no console antes de contar com ele (valor incomum).
- DeepSeek: deepseek-flash (V4.1-Flash) off-peak 0,15 in (cache miss) / 0,60 out; pico 0,30/1,20; JSON output suportado — [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing)
- Mistral Small, Qwen API, Llama via Groq/Together/OpenRouter: precos nao pesquisados (gap).
- Confiabilidade: Cognee usa `litellm_native` por padrao; OpenAI/Azure/Gemini/Mistral/Bedrock tem validacao de schema nativa; endpoints "custom" (OpenRouter, Groq, DeepSeek) caem em fallback JSON-object com ate 3 retentativas — [Cognee structured output](https://docs.cognee.ai/setup-configuration/structured-output-backends)
- Relato de terceiro: Gemini 2.0 Flash ~20% de falhas de estrutura e o JSON oficial do DeepSeek pior (resumo de busca, nao verificado, modelos antigos) — [glukhov.org](https://www.glukhov.org/post/2025/12/selfhosting-cognee-quickstart-llms-comparison/)
- Cognee: modelos gpt-5 rejeitam temperatura nao padrao (LLM_TEMPERATURE quebra todas as chamadas) — [Cognee LLM providers](https://docs.cognee.ai/setup-configuration/llm-providers)

### Tabela (indexacao: 1,9M in + 0,24M out; mensal ~1/8)

| LLM | In/Out US$/1M | Indexar | Mensal | Batch -50% | JSON no Cognee |
|---|---|---|---|---|---|
| GPT-5 nano | 0,05 / 0,40 | ~0,19 | ~0,02 | sim (~0,10) | json_schema_mode (nativo); sem relato de problema |
| Gemini 2.5 Flash-Lite | 0,10 / 0,40 | ~0,29 | ~0,04 | sim (~0,14) | json_mode; erros relatados em Gemini com schema; dado do tier gratis treina |
| Claude Haiku 5.5 | 0,10 / 0,50 (<=100k) | ~0,31 | ~0,04 | sim (~0,15) | anthropic_tools; preco a confirmar |
| DeepSeek flash (off-peak) | 0,15 / 0,60 | ~0,43 (pico ~0,86) | ~0,05-0,11 | n/d | json_mode via custom; reputacao de JSON pior; dados vao para China |
| GPT-5 mini | 0,25 / 2,00 | ~0,96 | ~0,12 | sim (~0,48) | json_schema_mode (nativo) |
| Gemini 3.1 Flash-Lite | 0,25 / 1,50 | ~0,84 | ~0,11 | sim | json_mode |
| Gemini 2.5 Flash | 0,30 / 2,50 | ~1,18 | ~0,15 | sim | deprecado em dez/2026 |

### Inferences
- GPT-5 mini e a escolha segura para confiabilidade de JSON schema (vale gastar ~US$1); nano e o minimo viavel, mas modelos muito pequenos podem produzir grafos ruins (nao ha benchmark de qualidade de extracao nas fontes: gap).
- Haiku 5.5 a US$0,10/0,50 parece barato demais em comparacao a geracao anterior (US$1/5); tratar como numero a validar.

### Gaps
- Sem benchmark de qualidade de grafo (so preco). Mistral Small, Qwen, Groq/Together/OpenRouter nao pesquisados. Saida de ~240k tokens e suposicao minha.

## 3. Privacidade

### Takeaway
Todas as notas saem da maquina em qualquer opcao de nuvem. APIs pagas dos grandes (OpenAI, Anthropic, Google pago) em geral nao treinam com dados da API, mas retem ~30-55 dias; ZDR exige contrato. Evitar tier gratis do Gemini para notas pessoais.

### Cited Findings
- Gemini tier gratis: dados usados para melhorar produtos Google; tier pago: nao — [Gemini pricing](https://aistudio.google.com/docs/pricing)
- Gemini API paga: retencao de abuso reportada em 55 dias (configuravel 7/14/28), Vertex 30 dias (blog; nao oficial) — [axoflow privacy map](https://axoflow.com/blog/privacy-map-for-claude-gpt-gemini-2026)
- OpenAI API: sem treino, ~30 dias de retencao para abuso, ZDR para enterprise (blogs de terceiros) — [guptadeepak](https://guptadeepak.com/zero-data-retention-ai-providers/)
- Anthropic API: sem treino por padrao; delecao em ~30 dias salvo ZDR/legal hold (fontes de terceiros divergem) — mesma fonte
- Voyage, Cohere, Mistral, Jina, Qwen, DeepSeek: politicas nao verificadas. Qwen/DeepSeek processam na China (inferencia minha pela empresa; regiao nao verificada).

### Inferences
- Para notas pessoais: OpenAI/Anthropic/Google pago = risco aceitavel com consciencia; DeepSeek/Qwen = nao recomendado. Opcao mais privada: embeddings locais + LLM de nuvem so no cognify (mesmo assim o texto das notas sai).

### Gaps
- Termos oficiais de retencao nao lidos diretamente (so blogs); verificar paginas oficiais antes de decidir.

## 4. Compatibilidade com Cognee

### Takeaway
Cognee suporta via LiteLLM todos os provedores relevantes; os cuidados principais: definir EMBEDDING_DIMENSIONS explicitamente e configurar LLM e embeddings juntos.

### Cited Findings
- EMBEDDING_PROVIDER: openai (padrao), gemini, mistral, bedrock (LiteLLM), custom (prefixo LiteLLM obrigatorio, ex. openrouter/, deepinfra/), ollama, fastembed, openai_compatible — [Cognee embeddings](https://docs.cognee.ai/setup-configuration/embedding-providers)
- Exemplo: `EMBEDDING_PROVIDER=openai`, `EMBEDDING_MODEL=openai/text-embedding-3-large`, `EMBEDDING_DIMENSIONS=3072`; variaveis EMBEDDING_API_KEY, EMBEDDING_ENDPOINT, EMBEDDING_BATCH_SIZE (padrao 32) — mesma fonte
- Armadilhas: se so LLM ou so embedding e configurado, o outro cai em OpenAI e `add()` falha (ProviderConfigMismatchError); EMBEDDING_DIMENSIONS ausente = chute em 3072; mudar dimensao exige prune e re-ingestao; `custom` sem prefixo vai para OpenAI — mesma fonte
- LLM_PROVIDER: openai, azure, gemini (`gemini/gemini-...`), anthropic (`anthropic/...`), mistral, bedrock, ollama, llama_cpp, custom (openrouter/, groq/, deepseek/), mcp-sampling — [Cognee LLM providers](https://docs.cognee.ai/setup-configuration/llm-providers)
- Voyage, Cohere, Jina e Qwen nao aparecem como providers nativos; seriam via `custom` + prefixo LiteLLM ou `openai_compatible` (inferencia; nao testado).
- Dica Cognee: BAML permite rotear extracao para modelo de nuvem mais capaz mantendo o resto local — [structured output backends](https://docs.cognee.ai/setup-configuration/structured-output-backends)

### Gaps
- Nao verifiquei nenhuma issue do GitHub do Cognee especifica por provedor.

## 5. Recomendacao

### Takeaway
Hibrido: embeddings locais (melhor privacidade, custo zero, comparar com open-weight Qwen3/harrier) + LLM de nuvem so no cognify. Se for tudo nuvem: Gemini Embedding 2 (pago, nao o tier gratis) ou OpenAI 3-large + GPT-5 mini.

### Cited Findings
- Veja secoes 1-4. Recomendacoes sao julgamento meu, nao fatos citados.

### Inferences
- Melhor embedding em nuvem: Gemini Embedding 2 pela melhor qualidade documentada (69,9); opcao mais barata/gratis: Voyage-4 (200M tokens gratis); OpenAI 3-small so se simplicidade importar.
- Melhor LLM barato para cognify: GPT-5 mini (~US$1 inicial, schema nativo, mais confiavel) ou GPT-5 nano (~US$0,19) se aprovar na qualidade; Gemini Flash-Lite via json_mode e plano B.
- Hibrido: so as notas (texto bruto) vao para o LLM durante cognify, uma vez + edicoes; buscas e embeddings ficam locais. Tradeoff: ainda ha vazamento do conteudo; dimensao local deve ser fixada antes (trocar exige re-ingestao).
- Tudo nuvem: menos manutencao, custo total < US$2 inicial e < US$0,20/mes; tradeoff: notas e consultas saem da maquina, dependencia de API.
- Total estimado tudo nuvem recomendado (Gemini Emb 2 + GPT-5 mini): ~US$0,10 + ~US$0,96 = ~US$1,06 inicial; ~US$0,13/mes.

### Gaps
- Qualidade real em PT-BR e qualidade do grafo precisam de teste empirico com as notas do usuario.
