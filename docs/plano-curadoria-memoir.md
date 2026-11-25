# Plano: a Phibe propõe Nós para o Memoir (curadoria com aprovação)

Estado: **plano salvo, nada construído ainda** (decidido em 2026-11-22). Ideia do Nizael: um agente da Phibe lê um RSS
(ou outra fonte), julga o que é útil segundo as preferências que o usuário escreveu para aquela tarefa, escreve a nota
e a manda para uma **tela de aprovação**. Ao aprovar, a Phibe cria sozinha o Nó: a nota, as tags, as coleções e os links.
Cada decisão (aprovou, negou, editou) alimenta as próximas propostas.

## 1. O que já existe e será reaproveitado

| Peça | Onde | Observação |
|---|---|---|
| Fila de aprovação | `src/phibe/tools/approval_store.py` (`ApprovalStore.queue_action(action_type, description, payload, permission_key, tier, ttl_hours)`) | Genérica: tipo, descrição, `payload` JSON, expiração. |
| Rotas da fila | `src/phibe/server/approval_routes.py` (`/v1/approvals/pending`, `/{id}/approve`, `/{id}/deny`) | **Aprovar só muda o status.** Quem executa hoje é o `ProactiveAgent` numa rodada seguinte (`execute_pending_actions`). Para o Nó precisamos executar ao aprovar. |
| Ilha | `frontend/src/components/Island.tsx` ("N to approve") | Só mostra a contagem. Não há tela para ler e decidir. |
| RSS | `src/phibe/connectors/news_rss.py` (`NewsRSSConnector`, `_parse_rss_items`, validação de URL) | Já tem proteção contra endereços internos. |
| Agente proativo e agenda | `src/phibe/agents/proactive_agent.py`, `register_cron`, `connectors/scheduler.py` | Base para rodar o agente de curadoria numa agenda. |
| Notas, tags, coleções, links | `src/phibe/notes/store.py` (`create`, `set_tags`, `upsert_collection`, `add_link`), rotas `/v1/notes/*` | Tudo o que o Nó precisa já existe. |
| Busca por significado | `notes/graph.py` (`related`), `connectors/hybrid_search.py`, índice bge-m3 | Serve para propor links e achar duplicatas **sem o Cognee**. |
| Modelo | `POST /v1/chat/completions` com `plain: true` | Chamada direta ao modelo, sem persona, memória nem fontes (feito em 2026-11). Funciona com Ollama, Sonnet e Codex. |

## 2. Fluxo

1. **Tarefa:** o usuário cria uma tarefa de curadoria: fonte (URL do feed), agenda, e um texto com as preferências
   ("me interessa growth e vendas B2B, ignore cripto e esportes").
2. **Coleta:** na agenda, o agente lê os itens novos do feed (ignora os já vistos).
3. **Pré-filtro barato:** palavras-chave e duplicatas (por link e por significado contra o Memoir) descartam o óbvio.
   Só o que sobra vai ao modelo.
4. **Julgamento:** o modelo recebe a preferência, os exemplos de aprovados e negados e o item. Responde em JSON:
   `relevant`, `score` (0 a 1), `title`, `summary`, `tags`, `collection`, `why`.
5. **Proposta:** os itens com nota acima do corte entram na fila como ação `memoir.create_node`, com o payload
   completo e a fonte (link). Há um limite de propostas por rodada.
6. **Aprovação:** nova tela no Memoir mostra a nota, as tags, a coleção, as notas relacionadas e o porquê.
   Botões: **Approve**, **Edit** (muda título, texto, tags, links) e **Deny** (com motivo opcional).
7. **Execução ao aprovar:** o sistema cria a nota, as tags, a coleção e os links, e indexa. A nota guarda a origem
   (feed, link, data) e a marca "proposta pela Phibe".
8. **Aprendizado:** cada decisão vira um exemplo; os últimos aprovados e negados entram no prompt da rodada seguinte.

## 3. O que construir (em ordem)

**Etapa 1: Nó proposto, aprovado e criado (sem agente ainda)**
- Executor de ações por tipo: `approve` passa a chamar um registro de handlers (`memoir.create_node`) e marca
  `executed` ou `failed`. Mantém o comportamento atual para os tipos antigos.
- Handler `memoir.create_node`: valida o payload, cria nota (origem "phibe"), tags, coleção e links; ignora link
  para nota que não existe mais; é idempotente (mesmo `source_url` não cria duas vezes).
- Endpoint para editar o payload antes de aprovar.
- Testes: aprovar cria o Nó completo; aprovar duas vezes não duplica; negar não cria nada; payload inválido falha
  sem criar metade.

**Etapa 2: tela de aprovação no Memoir**
- Item novo no Hub (ícone com contador). Lista de propostas com nota, tags, coleção, relacionadas, origem e "porquê".
- Aprovar, editar (reaproveita o editor e o seletor de tags) e negar. Aprovar em lote, só dos itens sem edição.
- Estado vazio ("Nothing To Approve."), expiração visível, e a ilha abrindo essa tela.

**Etapa 3: agente de curadoria de RSS**
- Cadastro da tarefa (fonte, agenda, preferências, limite por rodada, corte de nota) em Settings do Memoir.
- Coleta incremental com memória de itens vistos, pré-filtro, julgamento em JSON validado (rejeita resposta fora do
  formato e tenta uma vez de novo), propostas na fila.
- Botão "Run Now" e relatório da rodada (lidos, descartados, propostos).

**Etapa 4: aprender com as decisões**
- Tabela `curation_feedback` (item, decisão, motivo, edições, nota do modelo, data).
- Prompt com os N últimos aprovados e negados da mesma tarefa (few-shot), e resumo das preferências.
- Painel simples: taxa de aprovação por fonte e por tag; ajuste do corte de nota.

**Etapa 5 (depois): Cognee como camada extra de entidades e relações**, quando houver chave de nuvem para o
cognify. Não bloqueia nada acima.

## 4. Decisões pendentes (perguntar antes de construir)
- O julgamento roda em modelo **local** (privado, mais lento) ou **nuvem** (Sonnet: melhor, mas o texto sai do computador)?
- Corte padrão de nota e limite de propostas por rodada (sugestão: nota 0,7 e 10 por rodada).
- A nota guarda o texto do artigo ou só resumo e link? (direitos autorais: sugestão é resumo próprio e link.)
- Prazo de expiração das propostas (hoje o padrão da fila é 24 h; para curadoria sugerimos 7 dias).
- Outras fontes depois do RSS (e-mail, Slack, GitHub)? O executor da Etapa 1 já serve a todas.

## 5. Riscos e cuidados
- **Poluição do Memoir:** só entra nota aprovada por você; cada nota mostra a fonte e o motivo; limite por rodada.
- **Custo e tempo:** pré-filtro antes do modelo; processar um item por vez; teto de itens por rodada.
- **Privacidade:** com modelo de nuvem, o texto dos artigos e as preferências saem do computador; deixar a escolha
  explícita na tarefa.
- **Duplicatas:** checar por link e por significado antes de propor.
- **Resposta fora do formato:** validar o JSON, tentar de novo uma vez, e se falhar descartar o item (nunca criar nó parcial).
- **"Machine Learning":** na prática é guardar decisões e usá-las como exemplos. Treinar um modelo não compensa agora.
- **Fila cheia:** corte de nota, limite por rodada, e expiração.

## 6. Como saber que deu certo
- Aprovar uma proposta cria nota, tags, coleção e links, e a nota aparece na busca do Memoir.
- Negar não deixa rastro nas notas e registra o motivo.
- Uma rodada com 30 itens de RSS gera no máximo o limite configurado de propostas, sem duplicatas.
- Depois de 20 decisões, a taxa de aprovação das propostas sobe em relação às primeiras rodadas.
