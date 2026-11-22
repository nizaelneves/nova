# Alternativas ao Cognee / build vs adopt para um "Second Brain" local-first, criptografado, com REST API, UI e midia (estado: nov/2026)

Nota de metodo: ~20 chamadas de pesquisa/fetch. Muitas fontes sao agregadores; onde possivel usei README/docs oficiais. Fatos de licenca devem ser reconfirmados nos arquivos LICENSE antes de qualquer decisao juridica. Estimativas de semanas sao inferencias minhas, nao dado de fonte.

## 1. Matriz por candidato: licenca, embedabilidade, local-first, criptografia, API, midia, IA/grafo, maturidade

### Takeaway
Dos 14 candidatos, so Cognee, LightRAG, Graphiti, Mem0 e Letta sao "motores de memoria" (Apache-2.0/MIT, embutiveis em backend Python). Entre os apps de UI, apenas AFFiNE CE (MIT) e Obsidian-como-ferramenta-externa sao viaveis sem copyleft/restricao; Anytype (source-available), SiYuan/Trilium/Logseq (AGPL) e Notesnook (GPL) impoem restricoes de redistribuicao. Capacities e Tana sao SaaS cloud, nao embutiveis.

### Cited Findings

**Cognee (motor de memoria)**
- Licenca Apache-2.0, ~33.3k stars. — [GitHub topoteretes/cognee](https://github.com/topoteretes/cognee)
- Roda local sem API key (GLiNER e embeddings locais); REST API na porta 8000, UI local via `cognee-cli -ui` (Node), MCP na porta 8001. — [GitHub topoteretes/cognee](https://github.com/topoteretes/cognee)
- Ultima versao no changelog oficial: v1.6.8 em 12/nov/2026 (cadencia semanal/quinzenal: 1.6.3 a 7/out, 1.6.7 a 6/nov). A pagina do GitHub exibia v1.6.1 (24/set) e agregadores divergem; changelog oficial e a referencia mais recente. — [Cognee changelog](https://docs.cognee.ai/changelog); conflito com [GitHub README](https://github.com/topoteretes/cognee)
- REST em `/api/v1` (add, search, recall, forget, improve, datasets, ontologias, sessions); endpoint SPARQL somente-leitura desde v1.6.6. — [Cognee changelog](https://docs.cognee.ai/changelog)
- Grafo padrao Ladybug (Neo4j adapter tambem); vetores LanceDB/pgvector/Turso; relacional SQLite; data root configuravel (ou S3). — [Cognee changelog](https://docs.cognee.ai/changelog)
- Criptografia: `FILE_ENCRYPTION_ENABLED` (v1.6.6) cifra arquivos armazenados com AES-256-GCM (chave local ou AWS KMS); grafo, vetor, relacional e cache NAO cobertos, dependem de criptografia em repouso do backend. — [Cognee changelog](https://docs.cognee.ai/changelog)
- Controle de acesso: datasets, tenants, roles (v1.6.3); varias protecoes (Cypher, paths de servidor, fetch externo) opt-in/desligadas por padrao. — [Cognee changelog](https://docs.cognee.ai/changelog)
- Midia: loaders Docling e LibreOffice, transcricao de audio e imagem (requer modelo de visao/transcricao); video nao listado explicitamente. — [Cognee changelog](https://docs.cognee.ai/changelog), [GitHub](https://github.com/topoteretes/cognee)
- Conectores OAuth: Google Drive, Gmail, Calendar, Notion, Linear, Slack. — [Cognee changelog](https://docs.cognee.ai/changelog)

**Graphiti / Zep (motor de memoria temporal)**
- Apache-2.0, ~32.8k stars; backends Neo4j 5.26, FalkorDB (inclui FalkorDB Lite embutido, Py 3.12+), Neptune; Kuzu depreciado. — [GitHub getzep/graphiti](https://github.com/getzep/graphiti)
- Servidor REST de referencia em FastAPI sem autenticacao/autorizacao/protecao a prompt injection (README avisa nao ser producao); MCP server de referencia. — [GitHub getzep/graphiti](https://github.com/getzep/graphiti)
- Midia: apenas episodios de texto e JSON. — [GitHub getzep/graphiti](https://github.com/getzep/graphiti)
- Zep parou de manter a Community Edition; foco open-source e Graphiti. — [Zep blog](https://blog.getzep.com/announcing-a-new-direction-for-zeps-open-source-strategy/)

**LightRAG**
- Maioria das fontes diz MIT (uma discorda: Apache-2.0 em copia no HF); confirmar LICENSE oficial. `lightrag-server` com Web UI + REST (`pip install "lightrag-hku[api]"`), rotas compativeis com Ollama, binda em todas interfaces por padrao (configurar `LIGHTRAG_API_KEY`). Agregador cita v1.5.4 (24/jun/2026). — [dev.co](https://dev.co/ai/frameworks/lightrag), [mirror ChainPortal](https://github.com/ChainPortal/HKUDS-LightRAG), [github.com/hkuds/lightrag](https://github.com/hkuds/lightrag)

**Mem0**
- Apache-2.0, ~69k stars; servidor self-host via Docker com dashboard em localhost:3000, auth ligada por padrao; alguns recursos avancados so no cloud ("Teasers"); README nao menciona multimodal nem backends de grafo. — [GitHub mem0ai/mem0](https://github.com/mem0ai/mem0)
- "OpenMemory" e nome usado por mais de um projeto (Mem0 e CaviraOSS); fontes conflitam. — [dev.co](https://dev.co/ai/frameworks/openmemory), [comparativo Hindsight](https://hindsight.vectorize.io/blog/2026/08/11/open-source-agent-memory-systems)

**Letta (MemGPT)**
- Apache-2.0, ~25.4k stars; codigo ativo migrou para `letta-ai/letta-code` (harness de coding agent, App Server via `letta server`); API server V1 antigo arquivado no branch `archive`; README nao documenta REST. E plataforma de agentes com estado, nao store de conhecimento. — [GitHub letta-ai/letta](https://github.com/letta-ai/letta)

**Anytype**
- Codigo do desktop e anytype-api sob Any Source Available License 1.0 (nao-OSI; uso comercial exige permissao/rede autorizada); protocolo any-sync e MIT; fundadores falam em migrar para MIT, sem mudanca oficial encontrada. — [busca consolidada: community.anytype.io](https://community.anytype.io/t/privacy-sovereignty-and-direction-what-the-anytype-code-the-balderton-thread-and-the-governance-structure-actually-tell-us/30996), [blog Anytype](https://blog.anytype.io/our-open-philosophy/)
- Local API embutida no desktop (desde 0.46.x), rodando em localhost, offline, auth por chave Bearer via pareamento de 4 digitos; docs a rotulam "Developer Preview"; tipos de objeto/arquivos/limitacoes nao detalhados na pagina. — [Anytype docs Local API](https://doc.anytype.io/anytype/features/local-api)
- Servidor MCP `anytype` configurado neste ambiente falhou ao conectar (CONNECTION_CLOSED); nao foi testado na pratica.

**AFFiNE**
- Community Edition MIT para self-host; EE (rebranding, SSO, auditoria) "ainda nao publicada"; CLA obrigatorio para PRs; README nao documenta API publica (plugins "em breve"); precisa de Docker (relatos: Postgres + Redis); IA descrita mas sem dizer se esta no CE. Fontes terceiras divergem sobre licenca do backend (alguns citam "AFFiNE EE license"); BlockSuite sem licenca declarada na pagina. — [GitHub toeverything/AFFiNE](https://github.com/toeverything/AFFiNE), [tooliverse](https://tooliverse.ai/tools/affine), [busca consolidada](https://quizandsurveymaster.com/8-best-open-source-notion-alternatives-self-hosted-2026/)

**SiYuan**
- AGPL-3.0; REST API documentada (docs/API.md), kernel Go, CLI; notebooks criptografados com senha mestra (CLI nao opera neles); Docker `b3log/siyuan` porta 6806; "maioria dos recursos gratis, inclusive comercial", alguns exigem plano Member pago. — [GitHub siyuan-note/siyuan](https://github.com/siyuan-note/siyuan)
- Tres CVEs de set/2026 (CVE-2026-72801, -72793, -72789) sobre vazamento de material de chave de notebooks criptografados e bypass via modo publish; corrigidos em builds de 24-25/jul/2026 (fontes secundarias de seguranca). — [SecureLayer7](https://securelayer7.net/lab/cve-2026-72801-siyuan-notebook-crypto-disclosure), [GitLab advisories](https://advisories.gitlab.com/golang/github.com/siyuan-note/siyuan/kernel/CVE-2026-72801/)

**Trilium (TriliumNext)**
- AGPL-3.0; comunitario ativo (zadam transferiu); ETAPI REST; criptografia por nota; modo servidor (Docker) com sync self-hosted; canvas Excalidraw, mapas, versionamento, scripting; README nao descreve IA. Nenhuma fonte sobre se chamadas ETAPI externas disparam obrigacoes AGPL. — [GitHub TriliumNext/Trilium](https://github.com/TriliumNext/Trilium), [dev.co](https://dev.co/devops/open-source/trilium)

**Logseq**
- AGPL-3.0; versao DB 2.0.x em beta (2.0.1 em 13/jul/2026, 2.0.2 em 7/out/2026); linha de arquivos virou "Logseq OG" so com correcoes de seguranca; fonte de comparacao diz risco de perda de dados em jun/2026. — [Japanese guide issoh.co.jp](https://www.issoh.co.jp/md/tech/4954), [promptquorum](https://www.promptquorum.com/power-local-llm/logseq-review), [Logseq forum](https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020)

**Obsidian**
- Proprietario (conteudo/codigo reservados), gratuito para qualquer uso incl. comercial; pagina nao trata redistribuicao/embedding (remete aos Termos). Vault = pasta de Markdown. API via plugin comunitario Local REST API (MIT segundo listagens, nao confirmado no LICENSE). — [Obsidian license](https://obsidian.md/license), [awesome.ecosyste.ms](https://awesome.ecosyste.ms/projects/github.com%2Fcoddingtonbear%2Fobsidian-local-rest-api)

**Notesnook**
- GPL-3.0 (um listing diz AGPL; conflito); E2EE XChaCha20-Poly1305 + Argon2; sync server self-hostavel via Docker Compose; unica API oficial encontrada e Inbox API (beta). — [dev.co](https://dev.co/devops/open-source/notesnook), [Notesnook Inbox API](https://help.notesnook.com/inbox-api/self-hosting-inbox-api), [guia self-host](https://fareedwarrad.substack.com/p/how-to-self-host-notesnook-sync-server)

**Capacities / Tana**
- Tana: API local + MCP em early access; cloud-only. Capacities: API publica (um diretorio diz 2.0 em jul/2026), offline-first mas cloud; um review de 2026 diz que nenhum dos tres (Reflect/Tana/Capacities) tem REST API publica estavel. Licenca: SaaS proprietario (nao pesquisado diretamente; sem fonte primaria de termos). — [Tana blog](https://outliner.tana.inc/blog/tana-api-mcp-voice-ai-workflows), [dev.to comparativo](https://dev.to/pickuma/reflect-vs-tana-vs-capacities-a-tools-for-thought-review-for-engineers-4dk), [Fabric comparativo](https://fabric.so/comparison/capacities-vs-tana)

### Inferences
- UI products x memory engines: Anytype, AFFiNE, Logseq, Obsidian, SiYuan, Notesnook, Trilium, Capacities, Tana = produtos de UI (sem camada de recuperacao semantica/grafo equivalente ao Cognee). Cognee, Graphiti, LightRAG, Mem0, Letta = motores. Cognee e o unico com ingestao multi-formato + grafo + vetor + API + UI basica no mesmo pacote; LightRAG e o mais proximo (UI Web propria).
- Para app proprietario/fechado: licencas utilizaveis sem copyleft: Cognee, Graphiti, Mem0, Letta (Apache), LightRAG (MIT, a confirmar), AFFiNE CE (MIT, com ressalva do backend a confirmar). AGPL (SiYuan, Trilium, Logseq) so e seguro se rodar como processo separado e sem modificar/distribuir; embutir/forkar contamina. Anytype exige acordo comercial.
- Capacities e Tana nao sao embutiveis nem local-first: descartar como backend, so como fonte de importacao.
- Graphiti e Mem0 nao atendem midia nem UI; servem como camada de memoria de conversa, nao como "segundo cerebro" de arquivos.

### Gaps
- Termos de licenca/ToS de Capacities e Tana, e LICENSE exato de LightRAG, Obsidian Local REST API e Notesnook, nao verificados em arquivos primarios.
- Versao/data de release atual de AFFiNE, SiYuan, Trilium, Notesnook, LightRAG: nao obtidas de fonte primaria.
- Qualidade real e endpoints da Local API do Anytype (sem acesso ao portal de desenvolvedores nem ao MCP local).
- Se AFFiNE expoe API estavel/GraphQL utilizavel externamente: README nao documenta.
- Suporte real de Cognee a video e a OCR de imagens: changelog parcial (so os primeiros 100k de 695k caracteres lidos).

## 2. Quais sao UI vs motor, e qual combinacao entrega UI polida + recuperacao com IA mais rapido num app React/FastAPI

### Takeaway
Nenhum candidato entrega "UI polida + IA" pronto e embutivel: os apps de UI nao tem retrieval grafo/semantico embutido de nivel Cognee, e os motores tem UI minima. A combinacao mais rapida para um stack React/FastAPI proprio e motor (Cognee) + UI propria em React sobre armazenamento proprio; usar um app externo so se o usuario aceitar rodar um segundo programa.

### Cited Findings
- Cognee ja serve REST, UI local e MCP; conectores OAuth (Drive, Gmail, Notion, Slack) cobrem ingestao. — [Cognee changelog](https://docs.cognee.ai/changelog), [GitHub](https://github.com/topoteretes/cognee)
- LightRAG traz Web UI e REST prontos, mas com foco em RAG de documentos. — [mirror ChainPortal](https://github.com/ChainPortal/HKUDS-LightRAG)
- Obsidian/Anytype/SiYuan/Trilium expoem APIs locais (plugin, Local API preview, REST, ETAPI) que permitem sincronizar conteudo para um indexador externo. — [Anytype docs](https://doc.anytype.io/anytype/features/local-api), [SiYuan](https://github.com/siyuan-note/siyuan), [Trilium](https://github.com/TriliumNext/Trilium)

### Inferences
- Opcao mais rapida para "UI polida": usuario usa Obsidian (ou Anytype) como UI e voce indexa o vault no Cognee; custo: Phibe nao controla a UI nem a criptografia.
- Opcao mais rapida dentro do produto Phibe: React proprio (editor TipTap/BlockNote/Lexical; esses editores nao foram pesquisados aqui) sobre store proprio, com Cognee so para busca/grafo.
- Segundo parametro de ritmo: Cognee muda quase semanalmente (1.6.1 a 1.6.8 em ~7 semanas) e tem mudanca breaking (dlt core dep em 1.6.1, segundo agregador); fixar versoes.

### Gaps
- Nao comparei editores de bloco React open-source (fora do escopo dos candidatos).
- Nao ha benchmark de qualidade de recuperacao entre Cognee, LightRAG, Graphiti e Mem0 em fonte confiavel.

## 3. Opcoes A/B/C/D: pros, contras, esforco em semanas, riscos

### Takeaway
Recomendacao: D (store proprio SQLite + arquivos, com Cognee como camada de grafo/busca) por controle de criptografia, licenca e UX; B como atalho de curto prazo se o usuario ja vive no Anytype; evitar C com AGPL e A como unica base.

### Cited Findings (base factual das opcoes)
- Cognee cifra so arquivos (AES-256-GCM); grafo/vetor/SQLite ficam sem cifra propria. — [Cognee changelog](https://docs.cognee.ai/changelog)
- Cognee tem controles de acesso opt-in e padroes mais abertos em varios recursos; Graphiti server de referencia nao tem auth. — [Cognee changelog](https://docs.cognee.ai/changelog), [Graphiti](https://github.com/getzep/graphiti)
- Anytype: Local API em Developer Preview, licenca source-available. — [Anytype docs](https://doc.anytype.io/anytype/features/local-api), [community.anytype.io](https://community.anytype.io/t/privacy-sovereignty-and-direction-what-the-anytype-code-the-balderton-thread-and-the-governance-structure-actually-tell-us/30996)
- AFFiNE CE MIT, mas sem API publica documentada e com CLA; SiYuan/Trilium AGPL; SiYuan teve CVEs em cripto de notebooks em 2026. — [AFFiNE](https://github.com/toeverything/AFFiNE), [SiYuan](https://github.com/siyuan-note/siyuan), [SecureLayer7](https://securelayer7.net/lab/cve-2026-72801-siyuan-notebook-crypto-disclosure)

### Inferences (estimativas minhas; sem fonte, assuma incerteza +-50%)
| Opcao | Descricao | Esforco | Pros | Contras / riscos |
|---|---|---|---|---|
| A | Fork Cognee + UI React propria | 8-12 semanas para UI de notas/midia + modelo de dados (Cognee nao e um note store) | Apache, grafo+vetor+API prontos | Cognee e motor de memoria, nao editor; fork diverge de releases quase semanais; criptografia parcial (so arquivos); evitar fork, usar como dependencia |
| B | Manter Anytype + sync para Cognee so para busca | 2-4 semanas (conector via Local API + indexacao incremental) | UI polida, E2EE e sync nativos do Anytype, rapido | Local API em preview e pode quebrar; Phibe nao controla UI; licenca source-available impede embutir/redistribuir; dois sistemas de verdade; sem UI propria da Phibe; Cognee ve so texto exportado |
| C | Embutir AFFiNE/SiYuan/Trilium + Cognee como IA | AFFiNE 8-14 sem (backend Postgres/Redis, sem API documentada); SiYuan/Trilium 4-8 sem | UI rica pronta | AGPL (SiYuan/Trilium) contamina app proprietario se embutido; AFFiNE e pesado e sem API estavel; criptografia e modelo de dados de terceiros; CVEs SiYuan 2026; roadmap de terceiros |
| D | Store proprio (SQLite + arquivos cifrados) + Cognee | 6-10 semanas (CRUD, anexos, editor, cripto SQLCipher/age, sync para Cognee) | Controle total de licenca, UI, criptografia (cobre tambem os gaps de Cognee: cifrar SQLite/grafo no nivel de disco), media nativa | Maior custo inicial; voce mantem editor/versionamento/sync; precisa decidir editor React |

### Gaps
- Nao ha dados de custo real; estimativas acima sao estimativas minhas.
- Nao pesquisei SQLCipher/age/editores React; escolhas tecnicas de D ficam a validar.
- Nao testei Cognee (video, tamanho de grafo local, desempenho) nem o MCP do Anytype.
