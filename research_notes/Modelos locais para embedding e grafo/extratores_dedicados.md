# Extratores dedicados (nao generativos / pequenos) para grafo de conhecimento PT-BR + EN

Data da pesquisa: 2026-11-14. Numeros nao verificados em fonte primaria estao marcados [NAO VERIFICADO].

## 1. O extrator GLiNER do proprio Cognee: como ligar, o que extrai, PT-BR, fidelidade

### Takeaway
O Cognee tem um extrator sem LLM baseado em GLiNER2, mas o codigo open source e explicitamente um "demo" (renomeado para `gliner_demo`); a versao de producao exige licenca enterprise. Ele produz nos e arestas com relacoes tipadas (born_in, works_for), mas o pipeline keyless usa embeddings ingles-only (bge-small-en-v1.5) e nenhuma fonte confirma suporte a portugues.

### Cited Findings
- Extractor GLiNER open source e um demo da extracao enterprise, que tem "maior precisao e maior cobertura de labels" e exige licenca (social@cognee.ai); a classe foi renomeada para `gliner_demo` — [PR #5095](https://github.com/topoteretes/cognee/pull/5095)
- Como ativar: `pip install "cognee[gliner]"`; variavel `GRAPH_EXTRACTOR=gliner_demo` (alias antigo `gliner` ainda funciona) ou `cognify(extractor=...)`; sem chave de LLM, nenhum LLM e necessario — [PR #5095](https://github.com/topoteretes/cognee/pull/5095)
- `GRAPH_EXTRACTOR` default e `auto`: usa LLM se houver chave/provedor, senao GLiNER; embeddings via fastembed `BAAI/bge-small-en-v1.5` (384 dim) — [PR #5086](https://github.com/topoteretes/cognee/pull/5086) (merge em `dev` em 17/09/2026; versao de release nao informada)
- Pesos: GLiNER ~746 MB, bge-small ~67 MB, fastembed ~65 MB, torch 415 MB (macOS) a 2 GB+ (Linux) — [PR #5086](https://github.com/topoteretes/cognee/pull/5086)
- Teste keyless (paragrafo de Marie Curie): 19 nos / 31 arestas, relacoes como born_in, works_for, located_in — [PR #5086](https://github.com/topoteretes/cognee/pull/5086)
- Pipeline usa tasks `prepare_gliner_schema` e `extract_graph_and_summarize_with_gliner`; usa o pacote `gliner2` — [PR #5095](https://github.com/topoteretes/cognee/pull/5095)
- Extracao pode rodar em worker remoto (HTTP/gRPC/RabbitMQ), sem torch no processo principal — [PR #5435](https://github.com/topoteretes/cognee/pull/5435); processos/threads configuraveis — [PR #5220](https://github.com/topoteretes/cognee/pull/5220)
- Docs oficiais ainda nao tem pagina de GLiNER; arquivos a consultar: `cognee/tasks/graph/gliner_demo/__init__.py`, exemplos `gliner_demo_llm_free_cognify.py` — [PR #5095](https://github.com/topoteretes/cognee/pull/5095)
- Fidelidade vs LLM: o proprio PR descreve a versao enterprise como mais precisa; a open source e demo. Nenhum benchmark publico encontrado.

### Inferences
- Para PT-BR, e provavel que o demo use um checkpoint GLiNER2 ingles (ou multi) e embeddings ingles; sem confirmacao, assuma pior caso: embeddings ruins para portugues. Dá para trocar o embedding do Cognee para multilingue (ex. bge-m3 / multilingual-e5) independentemente do extrator.
- Labels fixos de "entidade" tendem a perder conceitos abstratos; o demo e um piso de qualidade, nao um substituto do LLM.

### Gaps
- Qual checkpoint GLiNER2 o demo carrega (en vs multi) e o schema/labels exatos: nao consegui ler o codigo-fonte.
- Se ja esta numa release publicada no PyPI (v1.5.4/1.6.x): nao confirmado.
- Nenhuma medida de fidelidade vs LLM.

## 2. GLiNER (urchade, multi, v2.5 community) e GLiNER2 / GLiNER2.5: qualidade, relacoes, licenca, PT

### Takeaway
GLiNER e uma familia de NER zero-shot de ~200-300M parametros, Apache-2.0, feita para CPU. GLiNER2/2.5 adicionam classificacao, extracao estruturada e relacoes; ha fine-tunes PT-BR (Ottema) com F1 modesto em HAREM (~0.47 entidade). Nao existe score publicado de v2.5 em portugues que eu tenha achado.

### Cited Findings
- Repo GLiNER sob Apache-2.0; "otimizado para CPU e hardware de consumo"; ONNX export disponivel; INT8 exige Quantization-Aware Training para manter acuracia; alega "100+ idiomas" nos modelos multi PII — [GitHub urchade/GLiNER](https://github.com/urchade/GLiNER)
- `urchade/gliner_multi-v2.1`: Apache-2.0, ~209M-0.3B params, multilingue (sem lista de idiomas; benchmark so em imagem) — [HF](https://huggingface.co/urchade/gliner_multi-v2.1)
- Artigo original: GLiNER supera ChatGPT e LLMs fine-tuned em varios benchmarks NER zero-shot; versao Multi usa mDeBERTa-v3 e foi avaliada em Multiconll — [arXiv 2311.08526](https://arxiv.org/pdf/2311.08526)
- Existe `gliner-relex-large-v1.0` (NER + RE conjunto, Knowledgator) — [GitHub urchade/GLiNER](https://github.com/urchade/GLiNER)
- GLiNER2 (205M params; NER, classificacao, extracao estruturada, relacoes): CrossNER medio 0.590 vs GLiNER-M 0.615 vs GPT-4o 0.599; latencia CPU de classificacao ~130 ms (5 labels); RE nao e avaliada no paper; extracao hierarquica nao avaliada — [arXiv 2507.18546](https://arxiv.org/html/2507.18546v1)
- GLiNER2.5: checkpoint `gliner2.5-multi-v1` com 287M params (mDeBERTa-v3-base), Apache-2.0, relacoes suportadas (inclusive `JointIE`), `pip install "gliner2[local]"` (Python >=3.10, traz PyTorch); checkpoint pequeno de 74M voltado a CPU; ingles-only para o base; idiomas do multi nao listados — [HF fastino/gliner2.5-base-v1](https://huggingface.co/fastino/gliner2.5-base-v1)
- Resumo de busca: GLiNER2.5 multi 56.17 macro F1 geral vs 56.09 GLiNER2 [NAO VERIFICADO: resumo de busca, nao li a pagina original]
- Fine-tune PT-BR `ottema/gliner2-ptbr-v23`: HAREM (163 amostras, 2511 entidades) entity F1 0.4749 (micro 0.4501), span F1 0.4878, base zero-shot 0.4251; BERT-CRF HAREM 0.4700 (131 ms vs 31 ms em GPU); autor ressalva que e um unico benchmark; card marca como legado; sem relacoes — [HF ottema](https://huggingface.co/ottema/gliner2-ptbr-v23)
- Pontos para conceitos abstratos: a formulacao e match span-rotulo e foco em entidades; nao achei fonte que avalie GLiNER em keyphrases/conceitos abstratos [NAO VERIFICADO; so inferencia] — [arXiv 2311.08526](https://arxiv.org/pdf/2311.08526)

### Inferences
- F1 ~0.45-0.50 em HAREM (zero-shot/fine-tune leve) e bem abaixo de modelos supervisionados (ver secao 3), entao nomes proprios em PT sao captados com ruido consideravel.
- "efeito flywheel" e relacoes causais: um span-extractor pode ate marcar "efeito flywheel" se o label for "conceito", mas sem garantia; causalidade exige relacao tipada que so GLiNER2.5/relex tentam, sem validacao em PT.

### Gaps
- Scores de GLiNER multi v2.1/v2.5 em MultiCoNER, WikiNEuRal ou pt: nao achados. Velocidade em notas/segundo em Ryzen 5800H: nao medida em fonte.
- Existencia de "gliner multilingual v2.5" oficial: busca nao confirmou; v2.5 community e (ao menos) ingles.

## 3. spaCy, Stanza, BERTimbau, Flair, XLM-R: NER supervisionado em portugues

### Takeaway
Para entidades nomeadas em PT, NER supervisionado (BERTimbau/XLM-R) e claramente melhor em F1 que zero-shot, mas so cobre as classes do treino (PER/ORG/LOC...) e nao relacoes nem conceitos.

### Cited Findings
- `pt_core_news_lg` 3.8.0: 541 MB, licenca CC BY-SA 4.0, vetores 500k x 300; treinado em texto jornalistico — [spacy-models releases](https://github.com/explosion/spacy-models/releases?q=pt_core_news), [spaCy docs](https://spacy.io/models/pt)
- XLM-RoBERTa-large: 83.8% F1 em HAREM e 92.3% em LeNER-Br; BERTimbau-base fine-tuned LeNER-Br F1 0.857 em validacao (um unico model card, indicativo) — [busca: SBC/HF card](https://huggingface.co/CassioBN/BERTimbau-base_LeNER-Br/blob/main/README.md)
- Estudo PROPOR 2026 compara LLMs PT-EU/PT-BR em NER de dominios especializados — [ACL Anthology 2026.propor-1.33](https://preview.aclanthology.org/ingest-dnd/2026.propor-1.33.pdf)
- LeNER-Br e corpus juridico: nao representa notas pessoais.

### Inferences
- Notas pessoais informais (abreviacoes, mistura PT/EN) sao fora de distribuicao para spaCy (noticias) e LeNER (juridico); espere queda grande.

### Gaps
- F1 NER de `pt_core_news_lg`/trf e de Stanza em PT: nao encontrei numeros (spacy.io nao carregou detalhes). Flair e BERTimbau NER generico (modelos HF prontos): nao pesquisados a fundo. WikiNEuRal/MultiCoNER para PT: nao encontrei.

## 4. Relacoes: GLiREL, REBEL/mREBEL, ReLiK, NuExtract

### Takeaway
Nenhum extrator pequeno entrega relacoes causais/conceituais confiaveis em PT. GLiREL e zero-shot mas treinado/avaliado em ingles; mREBEL cobre 18 idiomas mas com ontologia fixa Wikidata e licenca NC duvidosa; ReLiK e ingles; NuExtract e generativo (LLM pequeno).

### Cited Findings
- GLiREL (NAACL 2025): macro F1 zero-shot m=5 ~62.8 (Wiki-ZSL) e 81.2 (FewRel) base; ~83.3 e ~94.2 com pre-treino sintetico; m=15 ~73.9/84.5 [NAO VERIFICADO: tabela vem de resumos de terceiros] — [arXiv 2501.03172](https://arxiv.org/pdf/2501.03172)
- REBEL (seq2seq BART, 200+ relacoes); mREBEL ~18 idiomas, mREBEL400 com 17 idiomas; metadata de licenca CC-BY-NC-SA-4.0 conflita com texto "CC BY-SA 4.0" no mrebel — nao resolvido; dados silver filtrados por NLI — [mrebel-large](https://huggingface.co/Babelscape/mrebel-large/blob/main/README.md), [REDFM](https://arxiv.org/html/2306.09802v2)
- ReLiK: cards com `language: en`, Apache-2.0 verificado so em relik-cie-small — [HF relik-cie-small](https://huggingface.co/relik-ie/relik-cie-small/raw/main/README.md)
- NuExtract 2.0: 2B (base Qwen2-VL-2B, MIT), 4B (Qwen Research License, restritiva, de README espelhado), 8B (MIT); multilingue — [HF NuExtract-2.0-2B](https://huggingface.co/numind/NuExtract-2.0-2B), [8B](https://huggingface.co/numind/NuExtract-2.0-8B). Aviso: o 4B atribuido a Qwen Research e de um espelho [NAO VERIFICADO]; um resumo de noticias cita um "NuExtract3" 4B Apache-2.0 [NAO VERIFICADO] — [aiweekly](https://aiweekly.co/alerts/numind-releases-apache-20-4b-vision-model-for-document-extraction)
- NuExtract 1.5-smol (SmolLM2-1.7B, MIT, multilingue), 1.5-tiny 0.5B (MIT no card; PromptLayer diz Apache-2.0; PT, EN, FR, ES, DE, IT citados; blog diz que tiny e bem mais fraco) — [NuExtract-1.5-smol](https://huggingface.co/numind/NuExtract-1.5-smol), [blog NuMind](https://numind.ai/blog/nuextract-1-5---multilingual-infinite-context-still-small-and-better-than-gpt-4o)
- GGUF (llama.cpp) e OpenVINO int8 existem para NuExtract smol/tiny e 2.0 2B/8B — links acima.

### Inferences
- NuExtract 1.5-smol/tiny e 2.0-2B em GGUF rodam em CPU e entendem template JSON (entidades + relacoes como campos), logo sao a opcao "LLM-light" mais viavel para relacoes em PT, mas continuam generativos e lentos em CPU frente a GLiNER.
- Extratores de relacao de ontologia fixa (REBEL/mREBEL) nao capturam "causa/depende/alimenta".

### Gaps
- Velocidade (tokens/s, notas/s) de NuExtract GGUF no Ryzen 7 5800H: nao encontrada. Scores de NuExtract em PT: nao encontrados. OpenIE: nao pesquisado; sem opcao PT madura identificada. Stanza, Flair: nao cobertos alem da secao 3.

## 5. Integracao no Cognee e desenho hibrido; recomendacao para Ryzen 7 5800H / 13,9 GB / GTX 1650 4 GB / Windows 11

### Takeaway
Para notas pessoais onde conceitos importam mais que entidades nomeadas, nenhuma opcao sem LLM substitui o LLM; o desenho mais pragmatico e hibrido: embeddings multilingues + extracao LLM pequena quantizada, com GLiNER (2.5 multi) como pre-filtro/complemento opcional e arestas de similaridade como fallback.

### Cited Findings
- Cognee: extrator selecionavel (`GRAPH_EXTRACTOR`, `extractor=`), padrao `auto` cai para GLiNER sem chave de LLM — [PR #5086](https://github.com/topoteretes/cognee/pull/5086)
- Cognee ja separa embedding de extracao (fastembed local); extracao pode ser remota — [PR #5086](https://github.com/topoteretes/cognee/pull/5086), [PR #5435](https://github.com/topoteretes/cognee/pull/5435)
- Pitfall Windows/instalacao: `gliner2[local]` exige PyTorch e Python >=3.10 — [HF GLiNER2.5](https://huggingface.co/fastino/gliner2.5-base-v1); torch + extra do Cognee ~0,4-2 GB — [PR #5086](https://github.com/topoteretes/cognee/pull/5086)

### Inferences (nao medidos)
- Opcao A, LLM-only (modelo 3-4B quantizado Q4 via Ollama, GTX 1650 4 GB com offload parcial): melhor para conceitos e causalidade, mais lento; ja e o caminho nativo do Cognee.
- Opcao B, hibrido: GLiNER2.5 multi (287M, Apache-2.0, CPU) extrai entidades/conceitos candidatos rapido; LLM pequeno so para relacoes/resumos sobre os candidatos. Exige tarefa custom no Cognee (substituir/encadear `extract_graph_from_data`) ja que o demo e entidades+relacoes com labels fixos.
- Opcao C, sem grafo: embeddings multilingues + arestas por similaridade/co-ocorrencia; barato, robusto em PT, sem relacoes semanticas; bom para "notas relacionadas".
- Recomendacao: (1) trocar o embedding para multilingue; (2) manter LLM local pequeno para o `cognify` em lote noturno; (3) testar GLiNER2.5-multi com labels de conceito como etapa opcional, medindo em amostra propria de 50 notas antes de adotar; (4) usar arestas de similaridade como fallback. Nao dependa do extractor demo do Cognee para PT.

### Gaps
- Nenhum benchmark de notas/segundo em hardware equivalente foi encontrado; precisa medir localmente. Compatibilidade exata de versao do Cognee v1.5.4/1.6.x com o extractor: nao verificada.
