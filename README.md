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

---

## 🔊 Efeitos Sonoros
- Efeitos sonoros de RPG gerados em tempo real via Web Audio API (sem atraso).
- Botão de ativar/desativar som no cabeçalho.
