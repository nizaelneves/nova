# Cognee na Phibe: adote como sidecar isolado, fixando a 1.6.7

**Veredito: GO com condições.** O Cognee serve como Segundo Cérebro local (Apache-2.0, add/cognify/search/update/forget completos, SQLite + LanceDB + Ladybug embutidos, sem muro de licença nas funções que você precisa) ([LICENSE](https://raw.githubusercontent.com/topoteretes/cognee/main/LICENSE), [PyPI](https://pypi.org/pypi/cognee/json)). Mas só se: (1) rodar em **venv Python 3.12 separado**, como processo sidecar, nunca no `uv.lock` da Phibe; (2) fixar **`cognee==1.6.7`** (não a 1.6.8); (3) usar **bge-m3**, o único dos três modelos documentado e sem prefixo de consulta/documento; (4) aplicar o bloco de lockdown abaixo, porque a telemetria vem **ligada** por padrão; (5) passar no teste de fumaça antes de qualquer integração. Três pontos continuam abertos e dependem de você: ligar ou não o controle de acesso, qual versão fixar em definitivo, e se os nomes canônicos em inglês funcionam (não é recurso documentado, exige experimento). **Nada foi instalado nem executado**: tudo vem de documentação e GitHub lidos via WebFetch (resumos, não texto literal) e de leitura do `pyproject.toml`/`uv.lock` da Phibe.

## Checklist de riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| Conflito de dependências com a Phibe: litellm 1.100.1 (pin de segurança) vs Cognee >=1.102.2; websockets 16.1.1 vs <16; huggingface-hub 1.29 vs <1; tokenizers 0.23.2 vs <=0.23.0; rdflib 7.6.0 vs <7.2; pandas (venv instalado 3.0 vs <3) | Alta | Venv separado, sidecar HTTP. Comparação feita à mão, o resolver não foi rodado |
| v1.6.8: Ladybug 0.22.3 trava na criação do grafo no Windows 11 (#6685, fechada "not planned", mantenedor não reproduziu; CI só roda Ubuntu) | Alta (não confirmada) | Fixar 1.6.7; testar a 1.6.8 só em cópia, no smoke test |
| v1.6.7 (e 1.6.4-1.6.6) usa Ladybug 0.19.0: ~9 MiB de `max_db_size` por checkpoint, cognify longo esgota o teto de 32 GiB e corrompe o WAL (#6679) | Média | Subir `KUZU_MAX_DB_SIZE`; ingestão em lotes pequenos; backup antes de cada lote |
| Telemetria ligada por padrão para `https://test.prometh.ai` (inclui hash da `LLM_API_KEY` e IDs persistentes; sem conteúdo de notas) | Média | `TELEMETRY_DISABLED=1` (qualquer valor não vazio desliga, até "false") e bloqueio do host no firewall |
| O texto das notas vai para a LLM de nuvem no cognify (desligar telemetria não impede) ([Security](https://docs.cognee.ai/setup-configuration/security.md)) | Média | Decisão de privacidade sua; usar `CHUNKS` ou `only_context=True` na busca para não mandar consulta à nuvem |
| Padrões que voltam para OpenAI/GPT/fastembed se faltar uma metade da config | Média | Configurar LLM e embedding juntos; `COGNEE_SKIP_PREFLIGHT` não usar |
| `SYSTEM_ROOT_DIRECTORY`/`DATA_ROOT_DIRECTORY` default dentro do pacote (venv) | Alta | Caminhos absolutos com barras normais, fora do venv |
| `.env` é carregado com `override=True` e procura `.env` nos pais até `.git`/`pyproject.toml`: pode pegar o da Phibe | Média | `COGNEE_ENV_FILE` apontando para arquivo dedicado; rodar fora da árvore da Phibe |
| API ouve em `0.0.0.0` por padrão; CVE-2026-31231 (RCE, 9.8) afetou 0.3.0 a <1.2.0 ([advisory](https://github.com/topoteretes/cognee/security/advisories/GHSA-8pr4-p4c8-8gr9)) | Alta se mal configurada | `HTTP_API_HOST=127.0.0.1`; versão >=1.2.0 |
| Modelos de embedding: EmbeddingGemma e Qwen3-Embedding exigem prefixo de tarefa e o motor Ollama do Cognee não adiciona nenhum; EmbeddingGemma tem tokenizer gated no HF | Média (qualidade) | bge-m3. Trocar de modelo com mesma dimensão passa em silêncio (#5535): registrar o modelo por dataset |
| Dimensão padrão cai em 3072 se `EMBEDDING_DIMENSIONS` faltar | Média | Definir 1024 e medir |
| Edição por re-add cria documento novo com fatos velhos; só `update()` mantém o `data_id` | Média | Mapa `nota_id -> data_id` na Phibe; editar via `update`, apagar via `datasets.delete_data` |
| Apagar deixa lixo: vetores órfãos de arestas (#5473, aberta) | Baixa | Conferir no smoke test; reconstruir o grafo a partir das notas se necessário |
| Criptografia só cobre arquivos em `DATA_ROOT_DIRECTORY`; grafo, vetores e SQLite ficam em claro | Média | BitLocker e permissões de usuário |
| Projeto semanal (12 releases em ~10 semanas), só a última versão recebe correção, 1.124 issues abertas | Média | Pin exato, revisão mensal, notas da Phibe como fonte de verdade |
| Defender, caminhos longos (260), wheels win_amd64 cp312 de ladybug/pylance/lancedb não verificados | Média | `uv pip install --dry-run` antes; caminhos curtos; excluir a pasta do scan, se aceitável |

## Versão: fixar 1.6.7, tratar 1.6.8 como candidata

A 1.6.8 (12/11/2026) é a mais recente, mas tem dois dias, sobe o Ladybug para 0.22.3 e carrega a única denúncia de travamento no Windows 11 com Python 3.12 ([#6685](https://github.com/topoteretes/cognee/issues/6685)). O mantenedor não reproduziu, mas o relator observa que o CI do projeto só cobre Ubuntu, então "não reproduzido" não prova que funciona. A 1.6.5 corrigiu o travamento no `import cognee` do Windows (remoção do `python-magic-bin`) ([changelog](https://docs.cognee.ai/changelog)), então a 1.6.5 em diante é o piso razoável.

A 1.6.7 (06/11/2026) e a 1.6.6 (29/10/2026) são as alternativas. A 1.6.7 tem as recusas de caminho local no servidor HTTP e `instructor` opcional; a 1.6.6 traz o recibo de `delete_data` e o `improve` com revisão de conflitos ligada. Ambas usam Ladybug 0.19.0, com o defeito de checkpoint do #6679 ([#6679](https://github.com/topoteretes/cognee/issues/6679)); a 1.6.8 o corrige subindo o teto padrão para 128 GiB. Escolha minha, não do mantenedor: **1.6.7 com `KUZU_MAX_DB_SIZE` alto**, porque é um defeito conhecido e contornável, enquanto o travamento da 1.6.8 não tem contorno. Verifique no smoke test a unidade aceita pela variável (bytes, no bloco abaixo, não confirmado). Não faça upgrade no lugar de uma base existente: 1.4.x para 1.6.x falha ao abrir o grafo (#5736); reconstrua a partir das notas. Pre-releases `.devYYYYMMDD` saem semanalmente no PyPI, por isso o pin exato `==`.

## Isolamento: sidecar em venv próprio

Um venv compartilhado não resolve: a Phibe fixa litellm 1.100.1 por segurança e a pilha transformers 5.x exige huggingface-hub >=1, enquanto o Cognee pede hub <1 e litellm >=1.102.2. Relaxar isso degradaria o resto. O Cognee também instala seu próprio FastAPI/uvicorn e instala handlers globais de log no `import`. A saída mais barata é um venv Python 3.12 em `~/.phibe/cognee-sidecar`, com um pequeno servidor (ou o `cognee.api.client:app` em `127.0.0.1`) que a Phibe chama por HTTP. Escopo: um processo só abre os arquivos (Ladybug é escritor único e o lock é local ao processo) e as edições devem entrar em fila. Se usar o app REST, o CORS não lista PATCH, então o frontend deve passar pelo backend da Phibe. Docker evitaria problemas de wheel, mas exige Docker Desktop.

Comandos (PowerShell, nada disso foi executado):

```powershell
$root = "$env:USERPROFILE\.phibe\cognee-sidecar"
New-Item -ItemType Directory -Force "$root", "$env:USERPROFILE\.phibe\cognee\system", "$env:USERPROFILE\.phibe\cognee\data" | Out-Null
uv venv "$root\.venv" --python 3.12
$py = "$root\.venv\Scripts\python.exe"

# 1) ensaio: confirma que existem wheels win_amd64 cp312 sem compilar nada
uv pip install --python $py --dry-run --only-binary=:all: "cognee==1.6.7"

# 2) instala e congela
uv pip install --python $py "cognee==1.6.7"
uv pip check --python $py
uv pip freeze --python $py | Out-File "$root\requirements.lock" -Encoding utf8

# 3) modelo de embedding no Ollama (Cognee nunca baixa modelos)
ollama pull bge-m3

# 4) cache do tokenizer, UMA vez, ainda online (depois liga HF_HUB_OFFLINE=1)
& $py -c "from huggingface_hub import snapshot_download as s; s('BAAI/bge-m3', allow_patterns=['tokenizer*','*.json'])"
```

Não instale os extras `gliner` (puxa torch e ~750 MB), `docs`, `docling` nem `postgres`. O extra `ollama` só traz `transformers` para o tokenizer de repositórios sem `tokenizer.json`; o `tokenizers` do núcleo cobre o bge-m3, então o base basta (a documentação diz isso na seção de dependências).

## Bloco .env de lockdown (bge-m3 + Ollama + LLM de nuvem)

Salve em `~\.phibe\cognee-sidecar\cognee.env`. Antes de iniciar: `$env:COGNEE_ENV_FILE = "$env:USERPROFILE\.phibe\cognee-sidecar\cognee.env"` e execute fora da árvore da Phibe. Troque `SEU_USUARIO` pelo seu usuário (caminhos absolutos, barras normais).

```dotenv
# --- LLM de nuvem (só o cognify precisa dela) ---
LLM_PROVIDER="custom"
LLM_MODEL="openai/<id-do-modelo>"
LLM_ENDPOINT="https://<host>/v1"
LLM_API_KEY="<chave>"          # o motor Ollama a envia como Bearer ao localhost: inofensivo
LLM_TEMPERATURE="0"            # docs e código discordam do padrão
COGNEE_SKIP_CONNECTION_TEST="true"

# --- Embeddings locais (bge-m3: 1024 dim, sem prefixos) ---
EMBEDDING_PROVIDER="ollama"
EMBEDDING_MODEL="bge-m3:latest"
EMBEDDING_ENDPOINT="http://localhost:11434/api/embed"
EMBEDDING_DIMENSIONS="1024"
HUGGINGFACE_TOKENIZER="BAAI/bge-m3"
EMBEDDING_BATCH_SIZE="5"

# --- Dados (absolutos, barras normais) ---
SYSTEM_ROOT_DIRECTORY="C:/Users/SEU_USUARIO/.phibe/cognee/system"
DATA_ROOT_DIRECTORY="C:/Users/SEU_USUARIO/.phibe/cognee/data"
COGNEE_LOGS_DIR="C:/Users/SEU_USUARIO/.phibe/cognee/logs"
DB_PROVIDER="sqlite"
VECTOR_DB_PROVIDER="lancedb"
GRAPH_DATABASE_PROVIDER="ladybug"
KUZU_MAX_DB_SIZE="137438953472"   # 128 GiB em bytes; unidade a confirmar no smoke test

# --- Privacidade / offline ---
TELEMETRY_DISABLED="1"
COGNEE_LOG_SEARCH_HISTORY="false"
HF_HUB_OFFLINE="1"                # só depois do passo 4 (cache do tokenizer)
TRANSFORMERS_OFFLINE="1"
LITELLM_LOCAL_MODEL_COST_MAP="True"   # não verificado para esta versão do litellm
# TIKTOKEN_CACHE_DIR="C:/Users/SEU_USUARIO/.phibe/cognee/tiktoken"  # se o fallback do tokenizer for usado

# --- Rede e autenticação ---
HTTP_API_HOST="127.0.0.1"
HTTP_API_PORT="8000"
ENABLE_BACKEND_ACCESS_CONTROL="false"  # Opção A: usuário único, sem login
# Opção B (acesso ligado): troque a linha acima por "true" e defina
# DEFAULT_USER_PASSWORD="<senha-longa>"
# FASTAPI_USERS_JWT_SECRET="<segredo-aleatório-longo>"  # sem ele o token quebra a cada reinício
```

Observações: `ENV=dev` também desliga telemetria, mas seus efeitos colaterais não foram verificados, então não o uso. Com acesso desligado, os filtros de `datasets` são ignorados (um grafo e um vetor compartilhados); com ele ligado, cada dataset tem banco próprio, mas toda chamada precisa de token. Use `add` + `cognify` em vez de `remember()`, cujo `improve()` automático faz chamadas extras de LLM por nota. Para buscar sem custo de nuvem, use `CHUNKS` ou `only_context=True`; `GRAPH_COMPLETION` e `HYBRID_COMPLETION` (o padrão) chamam o LLM.

**Outros modelos.** EmbeddingGemma (`embeddinggemma:latest`, esperado 768, requer Ollama >=0.11.10): deixe `HUGGINGFACE_TOKENIZER` vazio, porque o repositório do HF é gated e o Cognee cai para tiktoken com aviso. Qwen3-Embedding-0.6B (`qwen3-embedding:0.6b`, esperado 1024, tokenizer `Qwen/Qwen3-Embedding-0.6B`). As dimensões dos dois **não** constam na documentação do Cognee: meça. Ambos perdem qualidade sem prefixo de consulta/documento, e a correção exigiria um motor customizado ou um proxy. Ollama: mantenha `num_ctx` maior que o tamanho do chunk.

## Teste de fumaça local

Rode em cópia, com a pasta de dados vazia, e só nessa ordem:

1. **Instalação:** `import cognee` abre sem travar (Windows) e `uv pip check` limpo; anote `ladybug` instalado.
2. **Dimensão:** `len((await get_embedding_engine().embed_text(["hello"]))[0]) == 1024` (`cognee.infrastructure.databases.vector.embeddings`); rode `cognee-cli doctor --probe`.
3. **Duas notas** (uma PT-BR com acentos, uma EN): `add` + `cognify` sem erro, tempo e tokens anotados; `search` com `CHUNKS` devolve a nota certa nas duas línguas.
4. **Nomes canônicos em inglês** (experimento): `custom_prompt` que exija `name` em inglês e alias no idioma original, **reescrevendo as regras úteis do prompt padrão** (ele é substituído por inteiro); conferir no grafo se a mesma entidade em PT e EN vira um nó só. Não documentado; se falhar, avaliar `graph_model` com `aliases` ou traduzir antes.
5. **Edição:** `update(data_id, ...)` mantém o `data_id` (`status` `incremental`/`full_rebuild`); a busca traz o fato novo e não o antigo. Repetir com re-`add` do texto editado para confirmar o documento duplicado.
6. **Apagar:** `datasets.delete_data`; o recibo mostra `success`, a busca não devolve mais a nota, e entidades exclusivas sumiram do grafo (#5473, #3526).
7. **Persistência:** encerrar o processo, reiniciar e repetir a busca; checar ausência de arquivo `.wal`/`.shadow` remanescente e de erro de lock.
8. **Rede:** capturar saída (Process Monitor, `netstat` ou firewall) durante add/cognify/search; esperado só `localhost:11434` e o host da LLM no cognify. Nada para `test.prometh.ai`, `huggingface.co`, `openaipublic.blob.core.windows.net` nem raw.githubusercontent.com (cost map do litellm).
9. **Servidor:** conferir que a porta escuta só em `127.0.0.1` (`netstat -ano`), e o resultado conforme a opção de acesso escolhida (401 sem token se ligado).
10. **Teto do Ladybug:** ingerir ~200 notas curtas e observar o crescimento do arquivo; confirmar que `KUZU_MAX_DB_SIZE` foi aceito.
11. **Backup:** com o processo parado, copiar `system` e `data` juntos; restaurar em outra pasta, apontar o `.env` e repetir o passo 3.
12. **Opcional, em cópia:** repetir 1 e 3 com `cognee==1.6.8` para ver se o #6685 acontece na sua máquina.

## Conclusão

O que decide a adoção não é capacidade, e sim **disciplina de operação**: o Cognee é um projeto que muda toda semana, com defeitos reais no mecanismo de grafo embutido, e que só se torna seguro com pin exato, sidecar isolado, lockdown de rede e as notas originais da Phibe como fonte de verdade (o grafo deve poder ser reconstruído). Os dois bloqueadores possíveis, o travamento do Ladybug 0.22.3 e o teto de checkpoint do 0.19.0, são problemas de uma versão específica, e o teste de fumaça os revela em minutos.

**Não verificado e em aberto:** nada foi instalado; a lista de conflitos foi feita à mão; wheels Windows de ladybug, pylance e lancedb não foram confirmadas; unidade do `KUZU_MAX_DB_SIZE`; dimensões de EmbeddingGemma e Qwen3; nomes canônicos em inglês; ausência de outras chamadas de saída (litellm, tiktoken, HF); comportamento de entidades compartilhadas ao apagar; a documentação contradiz a si mesma em alguns pontos (Ladybug vs NetworkX, `LLM_TEMPERATURE`, `dimensions` enviado ao Ollama). Decisões suas: acesso ligado ou desligado, versão (1.6.7 recomendada), e aceitar ou não que o texto das notas vá à nuvem no cognify.
