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
- **Atributos**:
  - 🧠 **Sabedoria**: Aumenta ao ler livros e registrar insights.
  - ⚡ **Foco**: Aumenta ao analisar lotes de processos e concluir tarefas.
  - ⚔️ **Vontade**: Aumenta ao finalizar tarefas difíceis e épicas.
  - 🛡️ **Consistência**: Aumenta ao manter sequências de dias em hábitos.

### 2. Chefe Semanal da Procrastinação (Boss Raid)
- Toda semana há um chefe temático (*O Dragão da Procrastinação*).
- Cada missão concluída, página lida ou processo avançado desfere dano contra o chefe.
- Ao derrotá-lo até domingo, você recebe um baú de moedas de ouro e XP extra!

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

### 📖 Biblioteca Ancestral (Livros & Sessões de Leitura)
- Cadastro de livros com total de páginas e capa temática.
- **Sessão de Leitura com Cronômetro**:
  - Cronômetro em tempo real integrado.
  - Registro de "Página inicial" até "Página final".
  - Campo para insights/anotações do trecho lido.
  - Cálculo instantâneo de páginas lidas, velocidade (páginas/hora) e Sabedoria.
  - Previsão de dias e horas para conclusão do livro.

### ⚡ Linha de Operações (Processos em Lote)
- Para metas como *"Analisar 10 processos judiciais"*, *"Revisar 15 relatórios"*, *"Estudar 8 aulas"*.
- Botões de avanço rápido: `+1`, `+2`, `+5` ou quantidade personalizada.
- Registro de anotações específicas em cada processo ou caso analisado.
- Barra de progresso com marco de 100%.

### 🔥 Rituais Diários (Hábitos & Streaks)
- Hábitos diários com contador de sequência (chamas 🔥).
- Multiplicador progressivo de XP (até 2.0x de bônus) para dias consecutivos.

### 🔮 Oráculo de Análises & Padrões Comportamentais (Objetivo Secundário)
- **Janela de Pico Produtivo**: Gráfico horário (00h às 23h) que identifica exatamente quando você rende mais.
- **Ritmo Semanal**: Identifica os dias da semana com maior taxa de execução.
- **Métricas de Leitura**: Média de páginas por sessão e projeções de conclusão.
- **Revelações do Oráculo**: Dicas contextuais e alertas automáticos contra procrastinação.
- **Linha do Tempo**: Histórico completo de tudo que foi realizado com data e hora.
- **Backup & Restauração**: Download e upload em 1 clique de arquivo JSON para segurança total dos seus dados.

### 🧭 Próxima Atividade
- Cartão permanente que indica a melhor missão ou ritual **agora**, filtrando por lugar (Casa, Escritório, Academia ou Qualquer lugar) e janela de horário.
- Prazo (`dueDate`/`dueTime`) é diferente da janela de execução: uma audiência às 17h continua visível o dia inteiro; um terço só das 15h às 16h some fora dessa faixa.
- Missões atrasadas no lugar certo ganham de rituais “na hora histórica”. Ritual com meta da semana já batida sai da lista principal.

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

### 🛠️ Lista de Ferramentas MCP (49 Tools)

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

#### 4. 📖 Sessões de Leitura (`readingSessions`)
- `list_reading_sessions`, `log_reading_session`, `update_reading_session`, `delete_reading_session`.

#### 5. ⚡ Processos em Lote (`processes`)
- `list_processes`, `get_process`, `create_process`, `step_process`, `update_process`, `delete_process`.

#### 6. 🔥 Rituais Diários (`habits`)
- `list_habits`: Lista hábitos com métricas semanais (`completionsThisWeek`, `targetTimesPerWeek`, `isGoalMet`).
- `create_habit`: Cria hábito com frequências (`daily`, `weekdays`, `weekly`, `times_per_week` com `targetTimesPerWeek` 1-7), `priority` (dispensavel→critico) e `difficulty` (baixa/media/alta/epica).
- `toggle_habit`: Marca/desmarca execução diária com cálculo de chamas/streaks.
- `update_habit`, `delete_habit`.

#### 7. 📝 Banco de Questões / Simulados (`examQuestions`)
- `list_exam_questions`, `log_exam_questions`, `update_exam_questions`, `delete_exam_questions`.

#### 8. 🪙 Taverna & Recompensas (`rewards`)
- `list_rewards`, `create_reward`, `redeem_reward`, `list_reward_redemptions`, `cancel_reward_redemption`, `delete_reward`.

#### 9. 🧙‍♂️ Herói & Boss Raid
- `get_player_state`, `reset_boss_raid`.

#### 10. 🔮 Oráculo de Análises & Padrões (Somente Leitura)
- `get_oracle_analytics`: Relatório completo (janela de pico produtivo, mapa de calor, ritmo semanal, simulados, hábitos e previsões).
- `get_oracle_insights`: Revelações e conselhos contra procrastinação.
- `get_productivity_patterns`: Distribuição de esforço horário e por dia da semana.
- `get_study_analytics`: Métricas consolidadas de leitura e questões.
- `get_category_rankings`: Rankings e tiers de maestria por categoria.

#### 11. 🧭 Próxima Atividade (contexto de lugar e horário)
- `get_next_action`: Indica a próxima missão ou ritual considerando lugar (`anywhere`, `office`, `home`, `gym`), janela de horário, prazos, prioridade e histórico.
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

