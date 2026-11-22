# Monday.com Work Management: mecânica do módulo de tarefas (tabela principal)

Nota de método: support.monday.com retornou HTTP 403 ao fetch direto; os fatos de suporte vêm de snippets de busca (resumos), então cheque nomes de menu exatos no app. A doc de desenvolvedor (developer.monday.com) foi lida na íntegra e é a fonte mais forte para o modelo de dados.

## 1. O que aparece na tabela padrão e como cada tipo de coluna se comporta?

### Takeaway
Um board é uma tabela: grupos coloridos contêm itens (linhas); colunas tipadas definem os dados. Um board novo vem só com Item, Person, Status e Date; o resto o usuário adiciona pelo "+" ao lado das colunas. Comportamento detalhado de clique/hover por coluna NÃO foi coberto por fonte oficial acessível (ver Gaps).

### Cited Findings
- Board = tabela; itens = linhas; grupo = seção do board; subitem = item aninhado com `parent_item`; o valor de cada coluna é guardado por item em `column_values` — [API Items](https://developer.monday.com/api-reference/docs/items)
- Board padrão ("Add New Board") tem colunas Item, Person, Status, Date (relato de usuário na comunidade, pode estar desatualizado) — [Community: Customize the default board](https://community.monday.com/t/customize-the-default-board/102725)
- Primeira linha criada via "Add Item" no fim do board; colunas novas via "+" ao lado das existentes (Status, Date, Person, Numbers, Text...) — [TemperStack](https://www.temperstack.com/learn/monday/create-first-board/)
- Tipos de coluna (id da API): button, checkbox, color_picker, board_relation (Connect boards), country, date, dependency, dropdown, email, file, hour, link, location, long_text, doc, name, numbers, people, phone, rating, status, subtasks (Subitems), tags, text, timeline, time_tracking, vote, week, world_clock — [API Column types reference](https://developer.monday.com/api-reference/docs/column-types-reference)
- Somente leitura (calculadas): creation_log, formula, item_id, last_updated, mirror, progress; auto_number é calculada e fora de `column_values`; person/team legados substituídos por people; integration é gerida por integrações — mesma fonte
- Existe coluna "Priority" como uso comum, mas na API é só uma coluna status com labels customizados (inferência; nenhuma fonte direta). Status: ver seção 3
- Colunas de IA usam sistema de "AI credits"; há colunas "Combo" do Team Power-Up — [Support: Available column types](https://support.monday.com/hc/en-us/articles/115005310285) (via snippet)
- Escrita via API: valor simples (string) ou JSON por tipo (`change_simple_column_value`, `change_multiple_column_values`) — [API Column types reference](https://developer.monday.com/api-reference/docs/column-types-reference)
- Dropdown tem opções predefinidas na criação (`create_dropdown_column`) — mesma fonte
- Arquivos: 4 pontos de upload (seção Updates, caixa de Status, coluna Files, aba Files); a aba Files do item junta arquivos da coluna e dos updates numa galeria — [Support: How to manage files](https://support.monday.com/hc/en-us/articles/115005339505-How-to-manage-files-in-monday-com) (via snippet)

### Inferences
- MVP de colunas: Name, Status, People, Date, Timeline, Text, Numbers, Dropdown, Checkbox, Files, mais Priority (status com paleta própria). Avançadas: formula, mirror, connect boards, dependency, time tracking, auto number, rating, vote, tags, world clock, colunas IA.
- Padrão de implementação sugerido pelo modelo da API: coluna = (id, tipo, settings JSON) e valor = JSON por item/coluna, tipo-específico.

### Gaps
- Comportamento exato de clique/hover/edição inline por tipo (ex.: popup de calendário na Date, avatar+busca na People, drag das bordas na Timeline, "+" ao hover): páginas de suporte deram 403 e não achei fonte alternativa confiável. Documentar a partir de teste manual no produto.
- Confirmação oficial dos nomes exatos das colunas padrão de um board novo (a fonte é post de usuário).

## 2. Grupos, subitens e painel do item

### Takeaway
Grupos são seções coloridas, colapsáveis e reordenáveis por arrastar; subitens ficam sob o item pai e hoje podem ter vários níveis (limite documentado difere entre fontes); o item abre em um card/painel lateral com feed de Updates e aba Files.

### Cited Findings
- Grupo = seção colorida que contém itens; colapsa individualmente pela seta ao lado do nome ou todos de uma vez; pode ser reordenado por arrastar, com grupos colapsados ou não — [Support: groups](https://support.monday.com/hc/en-us/articles/360011472320) (via snippet)
- Item pode ser movido para outro grupo no mesmo board (`move_item_to_group`, move subitens junto) ou reposicionado antes/depois de outro item (`change_item_position`; mover subitem não é suportado) — [API Items](https://developer.monday.com/api-reference/docs/items)
- Duplicar item copia subitens; updates são copiados de forma assíncrona (opcional); arquivar/excluir item remove também subitens aninhados — mesma fonte
- Subitens multinível: disponível em todos os planos em boards regulares e em projects (Enterprise); profundidade máxima 4 níveis; excluir um subitem pai exclui os descendentes; limite de 5.000 itens totais por board (incluindo subitens); sem permissões granulares por nível e sem AI Autofill — [Support: Multiple levels of subitems](https://support.monday.com/hc/en-us/articles/29810815287570-Multiple-levels-of-subitems-on-monday-com) (via snippet); conflita com a API, que valida profundidade máxima 5 ao mover entre boards — [API Items](https://developer.monday.com/api-reference/docs/items)
- Converter item em subitem existe (botão "Convert"); seta ao lado do item expande/colapsa subitens — [Guideflow](https://www.guideflow.com/tutorial/how-to-create-a-subitem-in-mondaycom) (terceiro)
- Em boards multinível, coluna status de rollup retorna valor tipo bateria (progresso agregado) — [API Status](https://developer.monday.com/api-reference/docs/status)
- Item card: abre em painel deslizante à direita; usuários relatam que colunas e updates deixaram de aparecer lado a lado e que houve reversão para pop-up (sem changelog oficial achado) — [Community](https://community.monday.com/t/item-card-layout-change-is-terrible/112766)
- Updates: thread de discussão do item com respostas, reações, anexos e pin — [Support/dev via snippet](https://developer.monday.com/api-reference/reference/updates); usuários pedem mover update para outro item (não existe) — [Community wish list](https://community.monday.com/t/wish-list-of-basic-fixes-that-would-seriously-improve-monday-com/88920)
- Item tem `subscribers`, `updates`, `assets`, `description`, `state` (active/archived/deleted) — [API Items](https://developer.monday.com/api-reference/docs/items)

### Inferences
- MVP: grupos (nome, cor, colapsar, reordenar), subitens de 1 nível com colunas próprias, painel do item com abas Updates/Files/Activity. Avançado: multinível, rollups, mirror, mover entre boards.
- Item e subitem podem ser mesma tabela com `parent_item_id` (espelha o modelo da API).

### Gaps
- Layout exato atual do painel (abas: Updates, Files, Activity Log) não confirmado por fonte oficial lida.
- Se subitens têm colunas independentes do pai: não verificado nesta rodada.

## 3. Status/labels, filtros, views, atalhos, automações e ações em massa (e MVP vs avançado)

### Takeaway
Status é a coluna central: até 40 labels, cada cor usada uma vez por coluna. Filter/Sort/Group by/Search/Person ficam na barra superior; views alternativas (Kanban, Calendar, Gantt, Timeline) ficam no "+" abaixo do título; automações são trigger + condição + ação; ações em lote vêm de checkboxes + barra inferior.

### Cited Findings
- Status: label até 30 caracteres, até 40 labels por coluna, 40 cores onde cada cor aparece uma vez por coluna, `is_done` e `is_deactivated` por label, descrição opcional, id estável distinto de `index` — [API Status](https://developer.monday.com/api-reference/docs/status)
- Labels padrão: (vazio, cinza), Done (verde), Working on it (laranja), Stuck (vermelho) — mesma fonte; admins podem definir nomes/cores padrão de boards novos — [Support via snippet](https://support.monday.com/hc/en-us/articles/360001269685)
- Usuários pedem cor hex custom e repetir cor; não existe — [Community](https://community.monday.com/t/allow-same-color-be-used-for-different-statuses-within-the-same-status-column/4929)
- Sort: ícone Sort no topo ou seta no cabeçalho da coluna (asc/desc); Filter: botão no topo, ex.: só itens de uma pessoa — [Community tip #22](https://community.monday.com/t/tip-of-the-week-22-how-to-sort-and-filter-your-monday-com-board/114497)
- Views: Table (padrão), Kanban, Calendar (dia/semana/mês), Gantt, Timeline, mais charts, dashboards, cards, forms; adicionadas pelo "+" abaixo do título do board; owner/admin pode ocultar a main table de outros — [Support board views](https://support.monday.com/hc/en-us/articles/360001267945) e [Everhour](https://everhour.com/blog/monday-board/) (via snippets)
- Batch actions: editar, mover, excluir, arquivar, exportar, duplicar vários itens; selecionar todos de um grupo, individualmente ou intervalo; barra inferior mostra contagem e ações; arquivados podem ser restaurados, exclusão é permanente — [Support: Batch Actions](https://support.monday.com/hc/en-us/articles/115005335049-Batch-Actions) (via snippet)
- Automações: trigger ("when this happens"), condição opcional ("only if") e ação; receita de exemplo "When status changes to something, notify someone"; cada automação disparada conta como uma ação do plano — [TechRepublic](https://www.techrepublic.com/article/create-monday-automation/) e [Advaiya](https://advaiya.com/automate-approval-and-notification-in-monday-com/) (terceiros)
- Atalhos: menu via foto de perfil > Shortcuts ou Shift+?; seções System navigation e Board navigation; Ctrl/Cmd+B quick search; Ctrl/Cmd+G alterna visibilidade de grupos (fontes comunitárias); atalho para criar item e trocar views não existe — [Support shortcuts](https://support.monday.com/hc/en-us/articles/115005339905-monday-com-Shortcuts), [Community](https://community.monday.com/t/shocked-no-shortcut-to-create-task/58510), [Community views](https://community.monday.com/t/keyboard-shortcut-for-board-views/9723)
- Filtros na API: regras por coluna (ex.: status `any_of` por id, people); busca global "Search Everything" por nome de pessoa — [API Items page](https://developer.monday.com/api-reference/docs/items_page), [Community](https://community.monday.com/t/help-with-search-everything-in-specific-columns-filtering-search-everything/24769)

### Inferences
- MVP: status/priority com labels coloridos editáveis, filtro + filtro por pessoa + sort + search, group por coluna, add-item no fim de cada grupo, edição inline, seleção em lote (mover/arquivar/excluir/duplicar), drag para reordenar itens e grupos, painel do item com Updates.
- Avançado: Kanban/Calendar/Gantt/Timeline, automações (começar com 2–3 receitas fixas "status muda -> notifica/move"), dependências, formulas, mirror, multinível, dashboards, atalhos de teclado além de básicos.

### Gaps
- Lista oficial completa de atalhos (403 no suporte; timecamp não listava).
- Comportamento de "Group by" e como sort/filter persistem ou combinam; "Group your board by anything" só citado por título.
- Drag-to-reorder de itens e inline editing sem página oficial lida (apenas API de posição).
- Planos/limites de automações e views por plano (varia; verificar pricing atual).
