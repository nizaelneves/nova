# Embedding local, extração na nuvem: o melhor plano

**Recomendação direta:** use **embedding local com EmbeddingGemma-300m (via Ollama)** e **LLM de nuvem só no `cognify`** (GPT-5 mini; GPT-5 nano ou Claude Haiku 5.5 se quiser gastar menos). Para 160 notas, a indexação custa cerca de **US$ 0,2 a 1** e as edições mensais ficam abaixo de US$ 0,15 (conta minha, ver premissas abaixo). O seu PC (GTX 1650 de 4 GB, 13,9 GB de RAM) roda bem embeddings pequenos, mas só consegue LLMs de 3-9B quantizados, a poucos tokens por segundo. Nenhum modelo local está provado para o schema do Cognee em português. **Nada foi medido nesta máquina**: nem velocidade, nem qualidade. Várias cifras abaixo são estimativas ou vêm de fontes de terceiros, e estão marcadas. A escolha final sai do teste de 20 notas no fim do documento.

## 1. Embedding multilíngue (PT-BR + EN)

O ranking muda conforme o benchmark. No MTEB multilíngue geral, o Harrier-0.6B (69,0) e o Qwen3-Embedding-0.6B (64,3) lideram os modelos pequenos ([Bing blog](https://blogs.bing.com/search/April-2026/Microsoft-Open-Sources-Industry-Leading-Embedding-Model)). No MTEB-BR, um benchmark nativo em português de terceiros (22 tarefas, jul/2026), o **EmbeddingGemma-300m vence (64,9)**, seguido do multilingual-e5-large-instruct (64,1), Qwen3-0.6B (62,3) e bge-m3 (61,6) ([MTEB-BR](https://benchmarklist.com/benchmarks/mteb_br/)). Como o seu uso é PT-BR, pesei mais o MTEB-BR. É um único benchmark de terceiros, então a confiança é moderada.

| Opção | Onde | Tamanho / custo | Qualidade PT (MTEB-BR) | Observação |
|---|---|---|---|---|
| **EmbeddingGemma-300m** (recomendado) | Local, Ollama | ~622 MB, 768 dim, 2048 tokens | **64,9** | Usa prefixos de tarefa (ver riscos) |
| Qwen3-Embedding-0.6B (plano B) | Local, Ollama | 639 MB, 1024 dim, 32K tokens | 62,3 | Funciona bem sem prefixo |
| bge-m3 (plano C) | Local, Ollama | ~1,2 GB, 1024 dim, 8K tokens, MIT | 61,6 | Bom para notas longas |
| Harrier-0.6B | Local, só via llama.cpp | MIT | sem número PT | Bom no papel, sem listagem no Ollama, não recomendo agora |
| Gemini Embedding 2 | Nuvem | US$ 0,20/1M tokens, ~US$ 0,10 para tudo | sem número PT (69,9 geral) | Melhor documentado entre APIs |
| OpenAI 3-small / 3-large | Nuvem | US$ 0,02 / 0,13 por 1M | sem número | 3-small é o mais simples |
| Voyage-4 | Nuvem | US$ 0,06/1M, 200M tokens grátis | sem número | Grátis na prática para 160 notas |

Qualquer embedding de nuvem custa menos de US$ 0,10 para indexar tudo ([Gemini](https://aistudio.google.com/docs/pricing), [OpenAI](https://developers.openai.com/api/docs/pricing), [Voyage](https://docs.voyageai.com/docs/pricing)), então preço não decide. Decide a privacidade: embedding local mantém consultas e notas no PC. Nenhum modelo de API tem nota em PT-BR, o que reforça a escolha pelo local.

## 2. LLM de extração do grafo (`cognify`)

O ponto fraco dos modelos pequenos é **gerar JSON válido no schema do Cognee**, não "inteligência". As docs do Cognee listam falhas (`InstructorRetryException`, grafo vazio) com vários modelos pequenos e sugerem `llama3.1:8b` ou `llama3.2:3b` para hardware limitado ([Cognee LLM providers](https://docs.cognee.ai/setup-configuration/llm-providers)). O backend BAML é a correção documentada para modelos locais pequenos ([Cognee structured output](https://docs.cognee.ai/setup-configuration/structured-output-backends)). Não achei benchmark de extração de grafo em português para nenhum candidato.

Custos abaixo: premissa minha de ~1,9M tokens de entrada + 0,24M de saída para 160 notas. Os preços vêm das páginas oficiais, e a saída é suposição.

| Opção | Onde | Custo (160 notas) | Velocidade estimada | Risco |
|---|---|---|---|---|
| **GPT-5 mini** (recomendado) | Nuvem | ~US$ 0,96 | Rápida | Schema nativo no Cognee, o mais seguro. Não definir `LLM_TEMPERATURE` |
| GPT-5 nano | Nuvem | ~US$ 0,19 | Rápida | Pode gerar grafo mais pobre, testar |
| Claude Haiku 5.5 | Nuvem | ~US$ 0,31 | Rápida | **Preço de US$ 0,10/0,50 não confirmado** (ver abaixo) |
| Gemini 2.5 Flash-Lite | Nuvem | ~US$ 0,29 | Rápida | Erros de schema relatados com Gemini. Nunca usar o tier grátis (treina com seus dados) |
| **qwen3.5:4b** (local, via BAML) | Local | US$ 0 | ~6-10 tok/s, **~5-10 min por nota (estimativa)**, 160 notas ~13-27 h | Sem prova no Cognee em PT; precisa de Modelfile com `num_ctx 8192` |
| qwen3.5:9b / llama3.1:8b | Local, quase tudo na CPU | US$ 0 | ~3-5 tok/s, 160 notas ~27-50+ h | Lento demais para uso diário |
| granite4.1:3b | Local | US$ 0 | ~10-20 tok/s | Cita PT e JSON nativo, sem scores |

Não cabem na máquina: modelos de 14B para cima e todos os MoE grandes (gpt-oss-20b, Qwen3-30B-A3B, Gemma 4 26B). Extratores sem LLM (GLiNER) são piso de qualidade, não substituem o LLM: o extrator GLiNER do Cognee é um demo, usa embedding só em inglês, e o melhor GLiNER em PT mede apenas ~0,47 de F1 em HAREM ([PR #5095](https://github.com/topoteretes/cognee/pull/5095), [HF ottema](https://huggingface.co/ottema/gliner2-ptbr-v23)). Também não pegam conceitos abstratos nem relações de causa.

## 3. Custo e privacidade lado a lado

| | Custo inicial (160 notas) | Custo mensal (~20 notas editadas) | O que sai do PC | Esforço |
|---|---|---|---|---|
| **Híbrido** (embedding local + LLM nuvem no cognify) | ~US$ 0,2 a 1 | ~US$ 0,03 a 0,12 | Texto das notas, só no cognify | Baixo |
| **100% local** | US$ 0 (energia) | US$ 0 | Nada | Alto: horas de processamento, modelos pequenos, risco de grafo ruim |
| **100% nuvem** (ex.: Gemini Emb 2 + GPT-5 mini) | ~US$ 1,1 | ~US$ 0,13 | Notas e consultas | Mínimo |

Privacidade da nuvem (fontes de terceiros, não li as políticas oficiais): APIs pagas de OpenAI, Anthropic e Google em geral não treinam com dados de API e retêm por ~30-55 dias; ZDR exige contrato ([guptadeepak](https://guptadeepak.com/zero-data-retention-ai-providers/), [axoflow](https://axoflow.com/blog/privacy-map-for-claude-gpt-gemini-2026)). Evite DeepSeek e Qwen para notas pessoais (processamento provável na China, inferência minha). Confirme as políticas oficiais antes de enviar notas sensíveis.

**Híbrido vs 100% local vs 100% nuvem.** O híbrido gasta centavos e entrega um grafo confiável, porque o LLM de nuvem acerta o schema do Cognee, e mantém buscas, consultas e vetores dentro do PC. O que vaza é o texto das notas durante o `cognify`, uma vez, mais as edições. O 100% local não vaza nada, mas leva de horas a dias no seu hardware e é a opção com maior chance de grafo vazio ou fraco. O 100% nuvem é o mais simples, porém envia também as consultas, e a qualidade em PT-BR dos embeddings de API não foi comparada. Se o conteúdo das notas for sensível, o plano B é o 100% local; se não for, o híbrido ganha. Detalhe: se o chat da Phibe também usar o LLM de nuvem, trechos recuperados das notas sairão a cada pergunta.

## 4. Configuração pronta para colar (Cognee `.env`)

**Recomendada: embeddings locais + LLM de nuvem.** Confira os nomes das variáveis na versão instalada do Cognee (as docs mudaram na v1.6.x). Nada abaixo foi executado.

```env
# Embeddings locais (ollama pull embeddinggemma)
EMBEDDING_PROVIDER="ollama"
EMBEDDING_MODEL="embeddinggemma:latest"
EMBEDDING_ENDPOINT="http://localhost:11434/api/embed"
EMBEDDING_DIMENSIONS="768"
EMBEDDING_MAX_COMPLETION_TOKENS="2048"
EMBEDDING_BATCH_SIZE="8"
# HUGGINGFACE_TOKENIZER="google/embeddinggemma-300m"  # repo restrito; sem ele usa contagem aproximada

# LLM de nuvem para o cognify (GPT-5: NÃO definir LLM_TEMPERATURE)
LLM_PROVIDER="openai"
LLM_MODEL="gpt-5-mini"
LLM_API_KEY="sk-..."
TELEMETRY_DISABLED="true"
```

**Alternativa: 100% local** (qwen3.5:4b via BAML). Crie antes um Modelfile (`FROM qwen3.5:4b`, `PARAMETER num_ctx 8192`, `PARAMETER temperature 0`) e rode `ollama create qwen35-4b-kg -f Modelfile` e `pip install "cognee[baml]"`. Mantenha o bloco de embeddings acima e troque o do LLM por:

```env
STRUCTURED_OUTPUT_FRAMEWORK="baml"
LLM_PROVIDER="ollama"
LLM_MODEL="qwen35-4b-kg"
LLM_ENDPOINT="http://localhost:11434"
LLM_API_KEY="ollama"
LLM_TEMPERATURE="0.0"
LLM_MAX_COMPLETION_TOKENS="4096"
BAML_LLM_PROVIDER="ollama"          # se rejeitar, use "openai" com o endpoint /v1
BAML_LLM_MODEL="qwen35-4b-kg"
BAML_LLM_ENDPOINT="http://localhost:11434/v1"
BAML_LLM_API_KEY="ollama"
BAML_LLM_TEMPERATURE="0.0"
```

Depois de mudar de provedor ou de dimensão, rode `cognee.prune.prune_system(metadata=True)` e reindexe: dimensões diferentes dão erro. Defina sempre as duas pontas (LLM e embedding), senão o Cognee cai no OpenAI e o `add()` falha ([Cognee embeddings](https://docs.cognee.ai/setup-configuration/embedding-providers)).

## 5. Teste de 20 notas (decide a escolha final)

1. Separe 20 notas reais (mistura PT/EN, curtas e longas) e 20 perguntas em PT com a nota-alvo conhecida.
2. Embeddings: indexe as 20 notas com EmbeddingGemma, Qwen3-0.6B e bge-m3. Cronometre após um aquecimento e meça recall@5 nas 20 perguntas. Se o EmbeddingGemma empatar ou perder do Qwen3, fique com o Qwen3 (não depende de prefixo).
3. Extração: rode o `cognify` nas mesmas notas com GPT-5 mini, GPT-5 nano e qwen3.5:4b (BAML).
4. Anote por modelo: notas sem erro de parse, nº de nós e arestas, % de arestas com pontas válidas e minutos por nota.
5. Leia à mão 5 grafos: os conceitos e relações ("X causa Y", "efeito flywheel") fazem sentido?
6. Com `ollama ps`, confira se o modelo local está na GPU ou na CPU; use `OLLAMA_NUM_PARALLEL=1`.
7. Regra de decisão: se o local falhar em mais de 2 das 20 notas, ou o grafo vier raso, adote o híbrido.

## O que não foi verificado

- **Nenhuma medição** de velocidade ou qualidade foi feita nesta máquina. Os tok/s, minutos por nota e horas totais são estimativas ou números de calculadoras online.
- **Preço do Claude Haiku 5.5** (US$ 0,10 entrada / 0,50 saída): li na página oficial, mas é muito abaixo do Haiku 4.5 (US$ 1/5). Confirme no console antes de contar com ele.
- **Prefixos do EmbeddingGemma no Cognee:** o modelo espera `task: search result | query: ...` nas consultas e `title: none | text: ...` nos documentos. Não confirmei se o Cognee ou o template do Ollama os aplica. Se não aplicar, a recuperação pode piorar; nesse caso troque para Qwen3-0.6B ou bge-m3.
- Os custos de nuvem assumem ~1,9M tokens de entrada e ~0,24M de saída (premissa minha). Mesmo com 3x esse tráfego, o custo fica na faixa de poucos dólares.
- O MTEB-BR é um único benchmark de terceiros, e os scores gerais do MTEB vêm de agregadores. Harrier, nomic-v2 e os modelos de API não têm número em PT. Termos de retenção de dados vêm de blogs, não das políticas oficiais.
- Não confirmei se o Cognee envia o schema ao Ollama como saída restrita no caminho padrão, nem se a versão atual do extrator GLiNER já saiu em release no PyPI.
