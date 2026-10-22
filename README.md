# ⚔️ Grimório de Missões (Chronicles of Focus)

Um jogo completo de gerenciamento de tarefas e produtividade para rodar no navegador, com mecânicas de RPG, acompanhamento de sessões de leitura, processos em lote e um **Oráculo de Análise Comportamental** que identifica padrões de produtividade.

---

## 🚀 Como Iniciar (1 Clique)

Dê um duplo clique no arquivo **`iniciar.bat`** na pasta do projeto.

O script irá:
1. Verificar os arquivos e dependências.
2. Iniciar o servidor local na porta `3000`.
3. Abrir o seu navegador padrão automaticamente em `http://localhost:3000`.

---

## 🎮 Mecânicas do Jogo e Gamificação

### 1. Perfil do Herói e Níveis
- **XP e Subida de Nível**: Todas as tarefas, páginas lidas e processos analisados concedem Experiência.
- **Títulos Honoríficos**: Conforme sobe de nível, novos títulos são desbloqueados (*Aprendiz das Chamas*, *Adepto do Foco*, *Estrategista do Tempo*, *Mestre do Conhecimento*, *Soberano da Execução Lendária*).
- **Atributos** (com efeito, visível no tooltip do cabeçalho):
  - 🧠 **Sabedoria**: +1% de XP em estudo a cada 100 (teto +15%).
  - ⚡ **Foco**: +1% de dano no chefe a cada 50 (teto +20%).
  - ⚔️ **Vontade**: −1% no custo em moedas das punições a cada 20 (teto 30%).
  - 🛡️ **Consistência**: +1 escudo de sequência a cada 250 (estoque de 2 até 4).

### 2. Chefe Semanal da Procrastinação (Boss Raid)
- Semana = domingo a sábado (America/Sao_Paulo). No domingo o chefe vira: se caiu, o próximo sobe de nível; se não caiu, o mesmo nível volta com HP novo e o Grimório julga a semana.
- HP mira ~15% acima do dano médio das últimas 4 semanas (entre 50% e 200% da fórmula do catálogo).
- Só ação produtiva fere o chefe (missão, ritual, leitura, questão, bloco AGU, mapa, processo, vitória, revisão). Taverna, punição, tríade e o próprio baú do chefe não contam. Foco soma até +20% de dano.
- Derrotado no máximo uma vez por semana. Depois disso o dano vira overkill e o próximo chefe só nasce no domingo.

### 3. A Taverna & Loja de Recompensas
- Ganhe **Moedas de Ouro (🪙)** em suas atividades.
- Cadastre recompensas reais do seu dia a dia (ex: *1 episódio de série*, *Café gourmet*, *1h de videogame*, *Comprar um livro novo*).
- Resgate as recompensas sem culpa quando tiver moedas suficientes!

---

## 📚 Módulos do Sistema

### 📜 Grimório de Missões (To-Dos)
- Registro ágil de tarefas com prioridades (*Baixa*, *Média*, *Alta*, *Épica*).
- Prazos e horários limites com destaque de urgência.
- Subtarefas com checklists interativos.
- Filtros por categoria (*Trabalho*, *Estudos*, *Pessoal*, *Projetos*, *Saúde*, *Finanças*).

### ✝️ Escrituras (Leitura da Bíblia)
- Cânone protestante (66 livros, capítulos e versículos) para marcar o ponto de leitura.
- Sessão com cronômetro, citações por referência (`Jo 3:16`) e reflexões pessoais.
- O tempo é independente da Biblioteca: faixa de homeostase, vitória do dia e gráfico próprios. A meta estabiliza em 30 minutos, como a leitura.

### 📖 Biblioteca Ancestral (Livros & Sessões de Leitura)
- Cadastro de livros com total de páginas e capa temática.
- **Sessão de Leitura com Cronômetro**:
  - Cronômetro em tempo real integrado.
  - Registro de "Página inicial" até "Página final".
  - Campo para insights/anotações do trecho lido.
  - Cálculo instantâneo de páginas lidas, velocidade (páginas/hora) e Sabedoria.
  - Previsão de dias e horas para conclusão do livro.

### 🧠 Cartografia do Conhecimento (Mapas Mentais)
- Crie mapas com um **núcleo** e ramos ilimitados, anotações e cores.
- Editor visual: arrastar ramos, recolher/expandir, organizar layout automático.
- **Modo estudo**: recobrir ramos do pai ou cartões pai → filho, com cronômetro.
- Revisão espaçada (Esqueci / Difícil / Bom / Fácil) concede XP, Sabedoria e Moedas.
- Ramos vencidos voltam para a fila de estudo até consolidar a matéria.
- **Assuntos e subassuntos** próprios da Cartografia (ex: Direito Constitucional → CF/88), com filtro e agrupamento na lista.
- **Tela cheia** no editor e no modo estudo (Esc para sair).
- **Ícones e imagens** em cada ramo: mais de 1.700 ícones Lucide (busca e categorias) ou foto por upload/URL.
- **Galhos que afinam** nos subníveis (ou linhas clássicas, no seletor do editor).

### ⚡ Linha de Operações (Processos em Lote)
- Para metas como *"Analisar 10 processos judiciais"*, *"Revisar 15 relatórios"*, *"Estudar 8 aulas"*.
- Botões de avanço rápido: `+1`, `+2`, `+5` ou quantidade personalizada.
- Registro de anotações específicas em cada processo ou caso analisado.
- Barra de progresso com marco de 100%.

### 📱 Tempo no Celular
- Ao abrir o Grimório, pergunta quanto tempo você passou no celular **ontem**. Respondido, não pergunta de novo naquele dia.
- O registro pode ser corrigido ou excluído depois. Excluir o de ontem faz a pergunta voltar.
- Gráfico de 14, 30 ou 90 dias com três linhas: tempo no celular, quantidade de atividades realizadas e tempo gasto nelas (missões, rituais, Biblioteca, Escrituras e AGU).

### 📓 Diário
- Aba **Diário**: páginas com data, título opcional, texto e humor opcional (sereno, grato, focado, alegre, cansado, inquieto, pesado).
- Várias páginas no mesmo dia. Dá para corrigir, buscar e apagar. O rascunho não salvo fica no navegador até guardar.
- Não concede XP, moedas nem dano no chefe. Desligar em Configurações só esconde a aba.

### 💊 Suplementos
- Cadastro de suplementos (Omega 3, Creatina) com unidade e dose usual.
- Registro de cada tomada com data, hora e quantidade.
- Histórico editável; arquivar tira o item da tomada sem apagar o diário. Excluir o suplemento apaga os registros dele.
- **Review** percorre os suplementos ativos e pergunta se cada um foi tomado hoje. Sim abre o registro da tomada; Não segue para o próximo. Concluir o review fecha o passo Review de Suplementos nas rotinas.
- Não concede XP: é um diário de saúde, separado dos rituais.

### 🔥 Rituais Diários (Hábitos & Streaks)
- Sequência pela frequência: dias devidos, semanas com a meta batida, ou períodos (quinzena/mês). Um ritual seg/qua/sex não quebra por ter terça vazia.
- Multiplicador até 2.0x: +0,1 por dia ou +0,2 por semana/período.
- **O que acompanhar**: tempo, quantidade ou os dois. Push-ups medem repetições (`reps`), não o cronômetro. A unidade é livre (reps, páginas, copos).
- **Homeostase & Alostase** (opt-in, no cadastro): a faixa sobe com a capacidade, como no estudo da AGU, no que o ritual mede. Sobe no máximo 10% por semana se 4 dos últimos 7 dias ficaram na faixa. Tempo: piso 10 min, meta 60. Quantidade: piso 5, meta 50. Com os dois, cada um tem a sua faixa. O chip no cartão abre o gráfico e planeja a vitória do dia no piso.

### 📋 Rotinas
- Uma rotina é uma sequência de rituais já cadastrados e, se quiser, de outras rotinas (mínimo 2 passos, sem repetir o mesmo ritual ou a mesma sub-rotina).
- Rotina de rotinas: a sub-rotina entra inteira como um passo. O modo guiado faz os rituais dela, na ordem, antes de seguir. Editar a sub-rotina atualiza quem a usa. Não dá para criar um ciclo nem passar de 3 níveis.
- Também entram Biblioteca, Escrituras, AGU, Diário e Review de Suplementos. As três primeiras contam quando o tempo do dia chega no setpoint. O Diário conta se houver qualquer página hoje. O Review de Suplementos conta quando o review do dia foi concluído. A rotina não marca essas atividades no lugar delas: **Fazer agora** abre a aba — no review, já abre as perguntas.
- O modo guiado marca só o próximo ritual ainda não feito hoje, mesmo dentro de uma sub-rotina. O ritual é quem recebe streak, XP e moedas — a rotina não dá recompensa extra.
- Clicar num passo abre o ritual: cronômetro, quantidade (se o ritual mede) e o registro. Um passo já feito pode ser desmarcado ali — o estorno é o do ritual.
- Ritual com homeostase mostra a quantidade esperada naquela execução (a faixa viva, ex.: 5–6 min), no passo, no botão “Fazer agora” e no registro. Sem homeostase, nada extra aparece.
- Marcar o ritual na aba Rituais também avança a rotina. Excluir o ritual tira o passo da sequência. Excluir uma sub-rotina tira esse passo das rotinas que a usavam.

### ⚖️ Julgamento
- Punição preguiçosa, idempotente, só a partir da data de ativação (`penaltiesSince`) — o histórico anterior não é julgado.
- Missão crítica vencida (dia 1, 3, 7 e depois semanal), semana sem derrubar o chefe, ritual crítico perdido e dia planejado com zero vitórias.
- Modal “O Julgamento do Grimório” na carga, com custo, conselho e contestação em 24h (máximo 2 por semana, estorno pelo ledger). XP nunca cai; moedas e atributos têm piso 0.

### Sequência do herói e Baú do Destino
- A sequência sai do ledger (estorno corrige). 1 escudo a cada 7 dias, consumido automaticamente num dia vazio. Folga opcional em `streakRestDays`.
- Fechar o dia e completar a tríade (todas as vitórias planejadas, mínimo 3) rola o Baú do Destino, determinístico por dia+evento.

### 🔮 Oráculo de Análises & Padrões Comportamentais (Objetivo Secundário)
- **Janela de Pico Produtivo**: Gráfico horário (00h às 23h) que identifica exatamente quando você rende mais.
- **Ritmo Semanal**: Identifica os dias da semana com maior taxa de execução.
- **Métricas de Leitura**: Média de páginas por sessão e projeções de conclusão.
- **Revelações do Oráculo**: Dicas contextuais e alertas automáticos contra procrastinação.
- **Linha do Tempo**: Histórico completo de tudo que foi realizado com data e hora.
- **Backup & Restauração**: Download e upload em 1 clique de arquivo JSON para segurança total dos seus dados.

### 🧭 O Oráculo indica (Próxima Atividade)
- Cartão permanente que indica a melhor **Vitória do Dia, missão ou ritual agora**, filtrando por lugar (Casa, Escritório, Academia ou Qualquer lugar) e janela de horário.
- Prazo (`dueDate`/`dueTime`) é diferente da janela de execução: uma audiência às 17h continua visível o dia inteiro; um terço só das 15h às 16h some fora dessa faixa.
- Missões atrasadas no lugar certo ganham de rituais “na hora histórica”. Ritual com meta da semana já batida sai da lista principal.
- A **Vitória Planejada do Dia** vem antes de tudo, na ordem em que foi cadastrada.
- **Energia:** o cartão pergunta “Como você está agora?” uma vez; a leitura vale 45 minutos e **não** é pedida de novo a cada atividade concluída. O botão **Pular** vale pela mesma janela e segue com a indicação do histórico local.
- **Jev (OpenRouter):** com a chave configurada, o modelo escolhe a atividade mais provável, lê a quantidade implícita na tarefa (`5 PABs`, `meia hora`, `15 recursos`) e, com energia igual ou abaixo de 6, propõe uma **dose menor** — a tarefa original nunca é alterada. Sem chave, ou se o Jev falhar, o motor local indica e o herói continua vendo a sugestão.
- **Dose sugerida (energia ≤ 6):** tarefa com quantitativo declarado vira uma fração dele (`60 min` → “Agora: 15 min”; `5 PABs` → “1 item”). Tarefa aberta, sem número nem duração (`Limpar PAT`), vira uma **dose de partida** em minutos: o Jev escolhe entre 5, 10, 15, 20 e 30 min e, se não responder, a faixa de energia decide (1-2 → 5 min, 3-4 → 10 min, 5-6 → 15 min). A dose aparece mesmo sem chave do OpenRouter e mesmo com o Jev fora do ar — ajuste os valores em `START_MINUTES_BY_BAND` (`server/oracleMemory.js`). No cartão, o **título é a tarefa** e a dose vem em destaque (“Agora: 10 min de 45 min”), para não ficar só “Agora: 10 min” sem dizer a que se refere.
- **Agora não:** a recusa pede um motivo (cansado, sem tempo, lugar errado…), fica na memória do Oráculo e ensina as próximas escolhas.
- **Ver processo:** mostra exatamente o que foi enviado ao Jev e o que voltou. **Memória do Oráculo:** taxa de aceite, energia e últimos desfechos.
- O motor local roda em `server/nextAction.js`; o julgamento do Jev, em `server/oracleJev.js`; a memória (energia, quantidades e desfechos), em `server/oracleMemory.js`.

### ⚙️ Configurações
- Botão **Configurações** no cabeçalho, ao lado de Sair. Cada função do Grimório tem um interruptor: Vitórias Planejadas, Chefe Ativo, O Oráculo indica, Hoje, Missões, Questões, Biblioteca, Escrituras, Mapas, Processos, Rituais, Rotinas, Suplementos, Celular, Diário, Correlações, Foco, Taverna, AGU, Oráculo e Bate Papo.
- Desligar **só esconde**. Missões, rituais, leituras, moedas e o plano AGU continuam gravados; ligar de novo devolve tudo como estava. O Oráculo deixa de indicar o que estiver desligado, e o painel Hoje deixa de mostrar a seção correspondente.
- A preferência fica no perfil (`POST /api/profile` com `featureSettings`) e vale em qualquer aparelho da mesma conta.
- **Aparência — escolha do tema.** No topo da tela há quatro visuais: **Catálogo** (o padrão de sempre: papel creme e carimbo terracota), **Lousa de Giz** (verde-escura, tipo lousa), **Atlas Botânico** (papel claro, verde-sálvia e ocre) e **Terminal de Estudo** (grafite, âmbar e ciano). A troca é imediata e fica gravada no perfil (`userProfile.theme`), então acompanha a conta em qualquer aparelho; o aparelho também guarda uma cópia local, que é aplicada antes do primeiro desenho para a página não abrir no tema errado.

### 💬 Sala de Bate Papo
- Aba **Bate Papo**. A chave do OpenRouter é a mesma do Oráculo: fica só no servidor e pode ser cadastrada (ou trocada) na própria sala.
- Abra uma sala, escolha quantos modelos quiser e escreva. Cada modelo tem um botão: ao clicar, ele recebe o histórico inteiro até aquele ponto — inclusive as falas dos outros modelos — e se manifesta.
- Cada resposta é cortada em no máximo 60 palavras, no servidor, mesmo que o modelo escreva mais.
- O × de cada fala tira essa mensagem do histórico. As próximas convocações não a recebem.

**Endpoints**
- `GET /api/next-action` — retrato sem efeitos colaterais (energia vigente, indicação local, motivo).
- `POST /api/next-action/consult` — consulta de verdade (grava a decisão, pode chamar o Jev).
- `POST /api/next-action/energy` — registra a energia e devolve a indicação.
- `POST /api/next-action/skip-energy` — pula a pergunta de energia pela janela de 45 min.
- `POST /api/next-action/decline` — motivo da recusa e nova indicação.
- `POST /api/next-action/accept-dose` — aceita a dose reduzida (registra no diário de ações).
- `POST /api/next-action/location` — lugar atual (com ou sem modo automático).

---

## 🔊 Efeitos Sonoros
- Efeitos sonoros de RPG gerados em tempo real via Web Audio API (sem atraso).
- Botão de ativar/desativar som no cabeçalho.

---

## 🤖 Servidor MCP (Model Context Protocol) & Agentes de IA

O Grimório de Missões possui um servidor **MCP (Model Context Protocol)** integrado e autenticado por **Bearer Token**, permitindo que agentes de IA externos (Claude Desktop, Cursor, Antigravity, scripts em Python ou ferramentas HTTP/SSE) realizem operações completas de **CRUD** em todos os registros e acessem em **somente leitura** os dados calculados pelo **Oráculo de Análises & Padrões Comportamentais**.

### 🔑 Autenticação Bearer Token
Todas as chamadas aos endpoints do MCP exigem o cabeçalho:
```http
Authorization: Bearer <SEU_TOKEN_MCP>
```
*(Ou parâmetro `?token=<SEU_TOKEN_MCP>` para EventSource/SSE).*

O token pode ser visualizado ou regenerado no cabeçalho da aplicação clicando no botão **"MCP / IA"**, ou configurado no `.env` via `MCP_BEARER_TOKEN`.

### 🌐 Endpoints MCP Disponíveis
- **SSE (Server-Sent Events)**: `GET /mcp/sse` e `POST /mcp/messages` (transporte padrão do Claude Desktop e Cursor).
- **JSON-RPC 2.0 Direto (HTTP POST)**: `POST /api/mcp` ou `POST /mcp` (ideal para chamadas simples via cURL ou scripts Python).
- **Stdio CLI (Linha de Comando)**: `npm run mcp` ou `node server/mcpCli.js`.

---

### 🛠️ Lista de Ferramentas MCP

#### 1. 📜 Missões (`quests`)
- `list_quests`: Listar missões com filtros (categoria, prioridade, status de conclusão, busca).
- `get_quest`: Obter detalhes de uma missão por ID.
- `create_quest`: Criar missão (`title`, `description`, `category`, `priority` dispensavel→critico, `difficulty` baixa/media/alta/epica, `dueDate`, `dueTime`, `subtasks`).
- `update_quest`: Atualizar missão existente.
- `complete_quest`: Concluir/desmarcar missão (concede XP, moedas, atributos e dano no Boss Semanal).
- `delete_quest`: Excluir missão por ID.

#### 2. 🗂️ Categorias (`questCategories`)
- `list_quest_categories`, `create_quest_category`, `update_quest_category`, `delete_quest_category`.

#### 3. 📚 Livros & Citações (`books`)
- `list_books`, `get_book`, `create_book`, `update_book`, `delete_book`.
- `add_book_quote`, `update_book_quote`, `delete_book_quote`.

#### 3.1. ✝️ Escrituras (`scripture`)
- `list_scripture`, `log_scripture_session`, `delete_scripture_session`.
- `add_scripture_quote`, `delete_scripture_quote`, `add_scripture_reflection`, `delete_scripture_reflection`.
- O tempo não entra em `readingSessions`.

#### 4. 📖 Sessões de Leitura (`readingSessions`)
- `list_reading_sessions`, `log_reading_session`, `update_reading_session`, `delete_reading_session`.

#### 5. ⚡ Processos em Lote (`processes`)
- `list_processes`, `get_process`, `create_process`, `step_process`, `update_process`, `delete_process`.

#### 6. 💊 Suplementos (`supplements`)
- `list_supplements`, `create_supplement`, `update_supplement`, `delete_supplement`.
- `log_supplement_intake`: registra data (`YYYY-MM-DD`), hora (`HH:mm`) e quantidade de um suplemento já cadastrado.
- `update_supplement_log`, `delete_supplement_log`.

#### 6.1. 🔥 Rituais Diários (`habits`)
- `list_habits`: Lista hábitos com métricas semanais (`completionsThisWeek`, `targetTimesPerWeek`, `isGoalMet`).
- `create_habit`: Cria hábito com frequências (`daily`, `weekdays`, `weekly`, `times_per_week` com `targetTimesPerWeek` 1-7, `fortnightly` com `monthDays` [ex: 1 e 16], `monthly` com `monthDay` [ex: 1]), `priority` (dispensavel→critico) e `difficulty` (baixa/media/alta/epica).
- `toggle_habit`: Marca/desmarca execução diária com cálculo de chamas/streaks.
- `update_habit`, `delete_habit`.

#### 6.2. 📋 Rotinas (`routines`)
- `list_routines`: Lista as sequências, as sub-rotinas e o progresso de hoje (vem do histórico de cada ritual).
- `create_routine`, `update_routine`, `delete_routine`: CRUD da ordem. Um passo leva `habitId` ou `routineId`. Não concede recompensa. Recusa ciclo e mais de 3 níveis.
- `advance_routine`: Marca o próximo ritual ainda não feito hoje, inclusive dentro de uma sub-rotina. Reusa streak, XP e moedas do ritual. Recusa passo fora de ordem.

#### 6.3. 📓 Diário (`journal`)
- `list_journal_entries`, `get_journal_entry`, `create_journal_entry`, `update_journal_entry`, `delete_journal_entry`.
- Não concede XP. Várias páginas no mesmo dia. Data `YYYY-MM-DD`; humor opcional: `sereno`, `grato`, `focado`, `alegre`, `cansado`, `inquieto`, `pesado`.

#### 7. 🧠 Mapas Mentais (`mindMaps`)
- `list_mind_maps`, `get_mind_map`, `create_mind_map`, `update_mind_map`.
- `add_mind_map_node`, `update_mind_map_node`, `delete_mind_map_node`.
- `add_mind_map_link`, `update_mind_map_link`, `delete_mind_map_link` (ligações extras entre ramos, com rótulo/ícone).
- `study_mind_map`: registra revisão espaçada (qualidade 0–3) e concede XP/Sabedoria.
- `delete_mind_map`: exclui o mapa e estorna as sessões de estudo.
- `list_mind_map_categories`, `create_mind_map_category`, `update_mind_map_category`, `delete_mind_map_category` (assunto + subassunto via `parentId`).

#### 8. 📝 Banco de Questões / Simulados (`examQuestions`)
- `list_exam_questions`, `log_exam_questions`, `update_exam_questions`, `delete_exam_questions`.

#### 9. 🪙 Taverna & Recompensas (`rewards`)
- `list_rewards`, `create_reward`, `redeem_reward`, `list_reward_redemptions`, `cancel_reward_redemption`, `delete_reward`.

#### 10. 🧙‍♂️ Herói & Boss Raid
- `get_player_state`, `reset_boss_raid` (só com chefe derrotado, ou `force=true`).
- `list_penalties`, `acknowledge_penalty`, `contest_penalty`.

#### 11. 🔮 Oráculo de Análises & Padrões (Somente Leitura)
- `get_oracle_analytics`: Relatório completo (janela de pico produtivo, mapa de calor, ritmo semanal, simulados, hábitos e previsões).
- `get_oracle_insights`: Revelações e conselhos contra procrastinação.
- `get_productivity_patterns`: Distribuição de esforço horário e por dia da semana.
- `get_study_analytics`: Métricas consolidadas de leitura e questões.
- `get_category_rankings`: Rankings e tiers de maestria por categoria.

#### 12. 🧭 Próxima Atividade (contexto de lugar e horário)
- `get_next_action`: Indica a próxima Vitória do Dia, missão, ritual, bloco AGU, revisão de mapa ou livro parado, considerando lugar (`anywhere`, `office`, `home`, `gym`), janela de horário, prazos, prioridade, recusas recentes e histórico. Com energia recente e chave do OpenRouter, o Jev escolhe; sem isso, responde o motor local (`source: "heuristic"`).
- `break_down_quest`: acrescenta subtarefas a uma missão procrastinada (`steps`).
- `reschedule_quests`: remarca um lote de missões (`ids`, `dueDate`).
- `set_current_location`: Define o lugar atual do herói usado pelo Oráculo.

---

### 📦 Configuração no Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "grimorio-missoes": {
      "command": "node",
      "args": [
        "c:/Coder/Projetos/Memory/server/mcpCli.js"
      ],
      "env": {
        "MCP_BEARER_TOKEN": "SEU_TOKEN_AQUI"
      }
    }
  }
}
```

### ⚡ Exemplo de Requisição HTTP com cURL
```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <SEU_TOKEN_MCP>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_oracle_analytics",
      "arguments": {}
    }
  }'
```

---

## 🎨 Temas (arquitetura)

Os quatro visuais estão em `src/styles/themes/<id>/` e vivem no **mesmo bundle**:

| Arquivo | Papel |
| --- | --- |
| `skin.css` | tokens, tipografia, forma, superfícies e componentes; tudo escopado em `html[data-theme="<id>"]` |
| `overrides.css` | reescrita dos literais de cor do JSX (`[style*="color: rgb(...)"]`), gerada por script |
| `dark-rules.css` | espelho claro das regras de classe do `index.css` (que é o tema escuro), só nos temas claros |
| `derived.css` | tons montados por template literal (`${accent}22`), também gerados |
| `sketch.css` | detalhe extra da Lousa (sublinhado traçado) |

Como funciona na prática:

1. o `index.html` aplica `data-theme` antes de pintar, lendo `localStorage.grimorio_theme`;
2. o App reconcilia com `userProfile.theme`, que é a fonte de verdade (vale em todos os aparelhos);
3. trocar em Configurações aplica na hora e grava no perfil; se o servidor recusar, o tema anterior volta;
4. os gráficos (Chart.js, canvas) são repintados por `src/utils/chartTheme.js`, que lê os tokens `--tpl-*` de cada tema.

Genar os arquivos derivados (não editar à mão):

```bash
node scripts/build-theme-overrides.mjs   # overrides.css dos temas novos
node scripts/build-dark-fallback.mjs     # dark-rules.css dos temas claros
node scripts/build-derived-colors.mjs    # derived.css dos quatro
node scripts/build-catalog-theme.mjs     # overrides.css do Catálogo (precisa de Chromium)
```

Auditorias de legibilidade (rodam sobre o build servido):

```bash
node scripts/audit-contrast.mjs   # telas em todos os temas medindo contraste texto/fundo
node scripts/audit-modals.mjs     # modais (missão, chefe, rankings, MCP, sair)
```

## 🧪 Testes

Cada arquivo `server/test_*.js` roda sozinho com `node`:

```bash
node server/test_next_action.js    # motor local (lugar, janela, prioridade, prazo, vitória)
node server/test_oracle_flow.js    # fluxo do Oráculo (energia, pular, abstenção, memória)
node server/test_oracle_jev.js     # leitura do Jev (energia, quantidade, dose)
node server/test_daily_victories.js
node server/test_feature_settings.js # interruptores de Configurações (esconde, não apaga)
```

⚠️ **Atenção:** vários testes antigos usam o banco real (`data/database.json`) e gravam nele
(recompensas, chefe, citações de teste). Para rodar sem tocar no seu save, aponte o Grimório
para uma pasta temporária:

```bash
GRIMORIO_DATA_DIR=/tmp/grimorio-test node server/test_boss_progression.js
```

(No Windows: `set GRIMORIO_DATA_DIR=C:\temp\grimorio-test` antes do comando.)

Os testes que precisam de um servidor no ar esperam `http://localhost:3000` e autenticação
(`/api/auth/guest`); sem isso eles falham por conexão, não por lógica.
