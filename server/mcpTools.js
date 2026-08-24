import { z } from 'zod';
import { getDb, saveDb, rewardPlayer, revertPlayerReward, getXpForLevel, getTitleForLevel, createBossRaid } from './db.js';
import { computeAnalytics } from './analytics.js';
import { computeCategoryRankings } from './rankings.js';
import {
  getSaoPauloDateStr,
  getSaoPauloHour,
  getSaoPauloDayOfWeek,
  getHabitWeeklyStats
} from './timeUtils.js';

// Unique ID generator
const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

// Helper to format standard tool results
export function formatSuccess(data, message) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, message, data }, null, 2)
      }
    ]
  };
}

export function formatError(errorMessage) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error: errorMessage }, null, 2)
      }
    ]
  };
}

/**
 * All MCP Tool Definitions & Executors
 */
export const toolsDefinition = [
  // ==========================================
  // 1. QUESTS (MISSÕES / TAREFAS) - CRUD
  // ==========================================
  {
    name: 'list_quests',
    description: 'Listar todas as missões cadastradas no Grimório, com filtros opcionais por categoria, prioridade, status de conclusão ou termo de busca.',
    schema: {
      completed: z.boolean().optional().describe('Filtrar por status de conclusão (true = concluídas, false = pendentes)'),
      category: z.string().optional().describe('Filtrar por nome de categoria (ex: Trabalho, Estudos, Pessoal)'),
      priority: z.enum(['baixa', 'media', 'alta', 'epica']).optional().describe('Filtrar por nível de prioridade'),
      search: z.string().optional().describe('Buscar termo no título ou descrição da missão'),
      limit: z.number().optional().describe('Limite máximo de registros a retornar')
    },
    handler: async (args) => {
      const db = getDb();
      let quests = [...(db.quests || [])];

      if (args.completed !== undefined) {
        quests = quests.filter(q => !!q.completed === args.completed);
      }
      if (args.category) {
        const cat = args.category.toLowerCase().trim();
        quests = quests.filter(q => (q.category || '').toLowerCase().trim() === cat);
      }
      if (args.priority) {
        quests = quests.filter(q => q.priority === args.priority);
      }
      if (args.search) {
        const s = args.search.toLowerCase().trim();
        quests = quests.filter(q =>
          (q.title || '').toLowerCase().includes(s) ||
          (q.description || '').toLowerCase().includes(s)
        );
      }
      if (args.limit && args.limit > 0) {
        quests = quests.slice(0, args.limit);
      }

      return formatSuccess({ total: quests.length, quests }, `${quests.length} missões encontradas.`);
    }
  },
  {
    name: 'get_quest',
    description: 'Obter detalhes completos de uma missão específica através do seu ID.',
    schema: {
      id: z.string().describe('ID da missão (ex: q-1700000000000-abc123)')
    },
    handler: async (args) => {
      const db = getDb();
      const quest = (db.quests || []).find(q => q.id === args.id);
      if (!quest) {
        return formatError(`Missão com ID '${args.id}' não foi encontrada.`);
      }
      return formatSuccess(quest, 'Missão encontrada com sucesso.');
    }
  },
  {
    name: 'create_quest',
    description: 'Criar uma nova missão no Grimório com cálculo automático de recompensas de XP, moedas e dificuldade.',
    schema: {
      title: z.string().describe('Título da missão'),
      description: z.string().optional().describe('Descrição detalhada ou contexto da missão'),
      category: z.string().optional().describe('Categoria da missão (ex: Trabalho, Estudos, Pessoal, Projetos, Saúde, Finanças)'),
      priority: z.enum(['baixa', 'media', 'alta', 'epica']).optional().default('media').describe('Prioridade da missão'),
      dueDate: z.string().optional().describe('Data limite no formato YYYY-MM-DD'),
      dueTime: z.string().optional().describe('Horário limite no formato HH:mm'),
      subtasks: z.array(z.union([
        z.string(),
        z.object({ title: z.string(), completed: z.boolean().optional() })
      ])).optional().describe('Lista de subtarefas/checklist da missão')
    },
    handler: async (args) => {
      const db = getDb();
      if (!args.title || !args.title.trim()) {
        return formatError('O título da missão é obrigatório.');
      }

      let priority = args.priority || 'media';
      let xpReward = 45;
      let coinReward = 12;
      let difficulty = 2;

      switch (priority) {
        case 'baixa':
          xpReward = 20; coinReward = 5; difficulty = 1; break;
        case 'media':
          xpReward = 45; coinReward = 12; difficulty = 2; break;
        case 'alta':
          xpReward = 80; coinReward = 25; difficulty = 3; break;
        case 'epica':
          xpReward = 150; coinReward = 50; difficulty = 4; break;
      }

      const newQuest = {
        id: uid('q'),
        title: args.title.trim(),
        description: (args.description || '').trim(),
        category: args.category || 'Trabalho',
        priority,
        difficulty,
        xpReward,
        coinReward,
        dueDate: args.dueDate || null,
        dueTime: args.dueTime || null,
        subtasks: (args.subtasks || []).map(st => ({
          id: uid('st'),
          title: typeof st === 'string' ? st.trim() : (st.title || '').trim(),
          completed: typeof st === 'object' ? !!st.completed : false
        })),
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString()
      };

      if (!db.quests) db.quests = [];
      db.quests.unshift(newQuest);
      saveDb(db);

      return formatSuccess(newQuest, `Missão '${newQuest.title}' criada com sucesso!`);
    }
  },
  {
    name: 'update_quest',
    description: 'Atualizar informações de uma missão existente no Grimório.',
    schema: {
      id: z.string().describe('ID da missão a ser atualizada'),
      title: z.string().optional().describe('Novo título'),
      description: z.string().optional().describe('Nova descrição'),
      category: z.string().optional().describe('Nova categoria'),
      priority: z.enum(['baixa', 'media', 'alta', 'epica']).optional().describe('Nova prioridade'),
      dueDate: z.string().nullable().optional().describe('Nova data limite YYYY-MM-DD (ou null para remover)'),
      dueTime: z.string().nullable().optional().describe('Novo horário limite HH:mm (ou null para remover)'),
      subtasks: z.array(z.union([
        z.string(),
        z.object({ id: z.string().optional(), title: z.string(), completed: z.boolean().optional() })
      ])).optional().describe('Nova lista completa de subtarefas')
    },
    handler: async (args) => {
      const db = getDb();
      const quest = (db.quests || []).find(q => q.id === args.id);
      if (!quest) return formatError(`Missão '${args.id}' não encontrada.`);

      if (args.title !== undefined) quest.title = args.title.trim();
      if (args.description !== undefined) quest.description = args.description.trim();
      if (args.category !== undefined) quest.category = args.category;
      if (args.priority !== undefined) {
        quest.priority = args.priority;
        if (args.priority === 'baixa') { quest.xpReward = 20; quest.coinReward = 5; quest.difficulty = 1; }
        else if (args.priority === 'media') { quest.xpReward = 45; quest.coinReward = 12; quest.difficulty = 2; }
        else if (args.priority === 'alta') { quest.xpReward = 80; quest.coinReward = 25; quest.difficulty = 3; }
        else if (args.priority === 'epica') { quest.xpReward = 150; quest.coinReward = 50; quest.difficulty = 4; }
      }
      if (args.dueDate !== undefined) quest.dueDate = args.dueDate;
      if (args.dueTime !== undefined) quest.dueTime = args.dueTime;
      if (args.subtasks !== undefined) {
        quest.subtasks = args.subtasks.map(st => ({
          id: (typeof st === 'object' && st.id) ? st.id : uid('st'),
          title: typeof st === 'string' ? st.trim() : (st.title || '').trim(),
          completed: typeof st === 'object' ? !!st.completed : false
        }));
      }

      saveDb(db);
      return formatSuccess(quest, `Missão '${quest.title}' atualizada com sucesso.`);
    }
  },
  {
    name: 'complete_quest',
    description: 'Alternar ou definir o status de conclusão de uma missão. Concluir concede XP, Moedas de Ouro, Vontade, Foco e ataca o Boss Semanal. Desmarcar estorna as recompensas.',
    schema: {
      id: z.string().describe('ID da missão'),
      completed: z.boolean().optional().describe('Definir explicitamente como concluída (true) ou pendente (false). Se omitido, alterna o estado atual.')
    },
    handler: async (args) => {
      const db = getDb();
      const quest = (db.quests || []).find(q => q.id === args.id);
      if (!quest) return formatError(`Missão '${args.id}' não encontrada.`);

      const willComplete = args.completed !== undefined ? args.completed : !quest.completed;
      if (quest.completed === willComplete) {
        return formatSuccess({ quest, stateUnchanged: true }, `A missão já estava no estado ${willComplete ? 'concluída' : 'pendente'}.`);
      }

      quest.completed = willComplete;
      quest.completedAt = willComplete ? new Date().toISOString() : null;

      let rewardResult = null;
      if (willComplete) {
        const willpower = quest.priority === 'epica' ? 25 : quest.priority === 'alta' ? 15 : 5;
        const focus = 10;
        rewardResult = rewardPlayer({
          xp: quest.xpReward,
          coins: quest.coinReward,
          willpower,
          focus,
          actionType: 'quest_complete',
          entityId: quest.id,
          title: quest.title,
          details: { category: quest.category, priority: quest.priority }
        });
      } else {
        const willpower = quest.priority === 'epica' ? 25 : quest.priority === 'alta' ? 15 : 5;
        const focus = 10;
        rewardResult = revertPlayerReward({
          xp: quest.xpReward,
          coins: quest.coinReward,
          willpower,
          focus,
          actionType: 'quest_complete',
          entityId: quest.id
        });
      }

      saveDb(db);
      return formatSuccess({
        quest,
        completed: willComplete,
        rewardResult
      }, willComplete ? `🎉 Missão '${quest.title}' concluída! Recompensas concedidas.` : `Missão '${quest.title}' desmarcada e recompensas estornadas.`);
    }
  },
  {
    name: 'delete_quest',
    description: 'Excluir permanentemente uma missão do Grimório.',
    schema: {
      id: z.string().describe('ID da missão a ser excluída')
    },
    handler: async (args) => {
      const db = getDb();
      const index = (db.quests || []).findIndex(q => q.id === args.id);
      if (index === -1) return formatError(`Missão '${args.id}' não encontrada.`);

      const [removed] = db.quests.splice(index, 1);
      saveDb(db);
      return formatSuccess(removed, `Missão '${removed.title}' excluída com sucesso.`);
    }
  },

  // ==========================================
  // 2. CATEGORIAS DE MISSÕES - CRUD
  // ==========================================
  {
    name: 'list_quest_categories',
    description: 'Listar todas as categorias de missões configuradas no sistema.',
    schema: {},
    handler: async () => {
      const db = getDb();
      return formatSuccess(db.questCategories || [], 'Categorias listadas com sucesso.');
    }
  },
  {
    name: 'create_quest_category',
    description: 'Criar uma nova categoria de missões.',
    schema: {
      name: z.string().describe('Nome da categoria'),
      color: z.string().optional().default('#38bdf8').describe('Código hexadecimal da cor (ex: #38bdf8)'),
      icon: z.string().optional().default('FolderGit2').describe('Nome do ícone Lucide')
    },
    handler: async (args) => {
      const db = getDb();
      if (!args.name || !args.name.trim()) return formatError('Nome da categoria é obrigatório.');

      const newCategory = {
        id: uid('cat'),
        name: args.name.trim(),
        color: args.color || '#38bdf8',
        icon: args.icon || 'FolderGit2',
        isCustom: true,
        createdAt: new Date().toISOString()
      };

      if (!db.questCategories) db.questCategories = [];
      db.questCategories.push(newCategory);
      saveDb(db);
      return formatSuccess(newCategory, `Categoria '${newCategory.name}' criada com sucesso.`);
    }
  },
  {
    name: 'update_quest_category',
    description: 'Atualizar uma categoria de missões existente.',
    schema: {
      id: z.string().describe('ID da categoria'),
      name: z.string().optional().describe('Novo nome'),
      color: z.string().optional().describe('Nova cor hex'),
      icon: z.string().optional().describe('Novo ícone')
    },
    handler: async (args) => {
      const db = getDb();
      const category = (db.questCategories || []).find(c => c.id === args.id);
      if (!category) return formatError(`Categoria '${args.id}' não encontrada.`);

      if (args.name !== undefined) category.name = args.name.trim();
      if (args.color !== undefined) category.color = args.color;
      if (args.icon !== undefined) category.icon = args.icon;

      saveDb(db);
      return formatSuccess(category, `Categoria '${category.name}' atualizada.`);
    }
  },
  {
    name: 'delete_quest_category',
    description: 'Excluir uma categoria de missões.',
    schema: {
      id: z.string().describe('ID da categoria')
    },
    handler: async (args) => {
      const db = getDb();
      const index = (db.questCategories || []).findIndex(c => c.id === args.id);
      if (index === -1) return formatError(`Categoria '${args.id}' não encontrada.`);

      const [removed] = db.questCategories.splice(index, 1);
      saveDb(db);
      return formatSuccess(removed, `Categoria '${removed.name}' excluída.`);
    }
  },

  // ==========================================
  // 3. LIVROS & CITAÇÕES - CRUD
  // ==========================================
  {
    name: 'list_books',
    description: 'Listar livros da Biblioteca Ancestral com filtros opcionais por status (reading, completed, planned) ou busca.',
    schema: {
      status: z.enum(['reading', 'completed', 'planned', 'lendo', 'concluido', 'planejado']).optional().describe('Status de leitura'),
      search: z.string().optional().describe('Buscar no título ou autor do livro')
    },
    handler: async (args) => {
      const db = getDb();
      let books = [...(db.books || [])];

      if (args.status) {
        let st = args.status;
        if (st === 'lendo') st = 'reading';
        if (st === 'concluido') st = 'completed';
        if (st === 'planejado') st = 'planned';
        books = books.filter(b => b.status === st);
      }
      if (args.search) {
        const s = args.search.toLowerCase().trim();
        books = books.filter(b =>
          (b.title || '').toLowerCase().includes(s) ||
          (b.author || '').toLowerCase().includes(s)
        );
      }

      return formatSuccess({ total: books.length, books }, `${books.length} livros encontrados.`);
    }
  },
  {
    name: 'get_book',
    description: 'Obter detalhes de um livro específico por ID, incluindo todas as citações salvas.',
    schema: {
      id: z.string().describe('ID do livro')
    },
    handler: async (args) => {
      const db = getDb();
      const book = (db.books || []).find(b => b.id === args.id);
      if (!book) return formatError(`Livro '${args.id}' não encontrado.`);
      return formatSuccess(book, 'Livro encontrado com sucesso.');
    }
  },
  {
    name: 'create_book',
    description: 'Cadastrar um novo livro na Biblioteca Ancestral.',
    schema: {
      title: z.string().describe('Título do livro'),
      author: z.string().optional().describe('Autor do livro'),
      totalPages: z.number().describe('Total de páginas do livro'),
      currentPage: z.number().optional().default(0).describe('Página atual lida'),
      category: z.string().optional().default('Estudos').describe('Categoria'),
      coverUrl: z.string().optional().describe('URL da imagem de capa'),
      status: z.enum(['reading', 'completed', 'planned']).optional().default('reading').describe('Status inicial')
    },
    handler: async (args) => {
      const db = getDb();
      if (!args.title || !args.title.trim()) return formatError('Título do livro é obrigatório.');
      if (!args.totalPages || args.totalPages <= 0) return formatError('Total de páginas deve ser maior que 0.');

      const newBook = {
        id: uid('bk'),
        title: args.title.trim(),
        author: (args.author || '').trim(),
        totalPages: parseInt(args.totalPages, 10),
        currentPage: Math.min(args.totalPages, Math.max(0, parseInt(args.currentPage, 10) || 0)),
        category: args.category || 'Estudos',
        coverUrl: args.coverUrl || '',
        status: args.status || 'reading',
        quotes: [],
        createdAt: new Date().toISOString()
      };

      if (!db.books) db.books = [];
      db.books.unshift(newBook);
      saveDb(db);
      return formatSuccess(newBook, `Livro '${newBook.title}' cadastrado com sucesso.`);
    }
  },
  {
    name: 'update_book',
    description: 'Atualizar informações de um livro existente.',
    schema: {
      id: z.string().describe('ID do livro'),
      title: z.string().optional().describe('Novo título'),
      author: z.string().optional().describe('Novo autor'),
      totalPages: z.number().optional().describe('Novo total de páginas'),
      currentPage: z.number().optional().describe('Nova página atual'),
      category: z.string().optional().describe('Nova categoria'),
      coverUrl: z.string().optional().describe('Nova URL de capa'),
      status: z.enum(['reading', 'completed', 'planned']).optional().describe('Novo status')
    },
    handler: async (args) => {
      const db = getDb();
      const book = (db.books || []).find(b => b.id === args.id);
      if (!book) return formatError(`Livro '${args.id}' não encontrado.`);

      if (args.title !== undefined) book.title = args.title.trim();
      if (args.author !== undefined) book.author = args.author.trim();
      if (args.totalPages !== undefined) book.totalPages = parseInt(args.totalPages, 10);
      if (args.currentPage !== undefined) book.currentPage = Math.min(book.totalPages, Math.max(0, parseInt(args.currentPage, 10)));
      if (args.category !== undefined) book.category = args.category;
      if (args.coverUrl !== undefined) book.coverUrl = args.coverUrl;
      if (args.status !== undefined) book.status = args.status;

      saveDb(db);
      return formatSuccess(book, `Livro '${book.title}' atualizado com sucesso.`);
    }
  },
  {
    name: 'delete_book',
    description: 'Excluir um livro da Biblioteca Ancestral.',
    schema: {
      id: z.string().describe('ID do livro a ser excluído')
    },
    handler: async (args) => {
      const db = getDb();
      const index = (db.books || []).findIndex(b => b.id === args.id);
      if (index === -1) return formatError(`Livro '${args.id}' não encontrado.`);

      const [removed] = db.books.splice(index, 1);
      saveDb(db);
      return formatSuccess(removed, `Livro '${removed.title}' excluído com sucesso.`);
    }
  },
  {
    name: 'add_book_quote',
    description: 'Adicionar uma citação/insight a um livro, concedendo pontos de Sabedoria e XP.',
    schema: {
      bookId: z.string().describe('ID do livro'),
      quote: z.string().describe('Texto da citação ou insight'),
      page: z.number().optional().describe('Número da página'),
      note: z.string().optional().describe('Anotação pessoal ou reflexão sobre a citação')
    },
    handler: async (args) => {
      const db = getDb();
      const book = (db.books || []).find(b => b.id === args.bookId);
      if (!book) return formatError(`Livro '${args.bookId}' não encontrado.`);
      if (!args.quote || !args.quote.trim()) return formatError('Texto da citação é obrigatório.');

      const newQuote = {
        id: uid('quo'),
        bookId: book.id,
        bookTitle: book.title,
        quote: args.quote.trim(),
        page: parseInt(args.page, 10) || book.currentPage,
        note: (args.note || '').trim(),
        createdAt: new Date().toISOString()
      };

      if (!book.quotes) book.quotes = [];
      book.quotes.unshift(newQuote);

      const rewardResult = rewardPlayer({
        xp: 15,
        coins: 2,
        wisdom: 5,
        actionType: 'book_quote',
        entityId: newQuote.id,
        title: `Insight em "${book.title}" (pág. ${newQuote.page})`,
        details: { bookId: book.id, quote: newQuote.quote.substring(0, 50) }
      });

      saveDb(db);
      return formatSuccess({ quote: newQuote, rewardResult }, `Citação adicionada a '${book.title}' com sucesso! (+15 XP, +5 Sabedoria)`);
    }
  },
  {
    name: 'delete_book_quote',
    description: 'Remover uma citação de um livro e estornar as recompensas.',
    schema: {
      bookId: z.string().describe('ID do livro'),
      quoteId: z.string().describe('ID da citação')
    },
    handler: async (args) => {
      const db = getDb();
      const book = (db.books || []).find(b => b.id === args.bookId);
      if (!book) return formatError(`Livro '${args.bookId}' não encontrado.`);

      const index = (book.quotes || []).findIndex(q => q.id === args.quoteId);
      if (index === -1) return formatError(`Citação '${args.quoteId}' não encontrada no livro.`);

      const [removed] = book.quotes.splice(index, 1);
      revertPlayerReward({
        xp: 15,
        coins: 2,
        wisdom: 5,
        actionType: 'book_quote',
        entityId: args.quoteId
      });

      saveDb(db);
      return formatSuccess(removed, 'Citação removida e recompensas estornadas com sucesso.');
    }
  },

  // ==========================================
  // 4. SESSÕES DE LEITURA - CRUD
  // ==========================================
  {
    name: 'list_reading_sessions',
    description: 'Listar histórico de sessões de leitura realizadas.',
    schema: {
      bookId: z.string().optional().describe('Filtrar sessões de um livro específico'),
      limit: z.number().optional().describe('Limite de registros')
    },
    handler: async (args) => {
      const db = getDb();
      let sessions = [...(db.readingSessions || [])];
      if (args.bookId) {
        sessions = sessions.filter(s => s.bookId === args.bookId);
      }
      if (args.limit && args.limit > 0) {
        sessions = sessions.slice(0, args.limit);
      }
      return formatSuccess({ total: sessions.length, sessions }, `${sessions.length} sessões de leitura encontradas.`);
    }
  },
  {
    name: 'log_reading_session',
    description: 'Registrar uma nova sessão de leitura. Atualiza a página atual do livro, concede XP, moedas, Sabedoria e inflige dano ao Boss da Procrastinação.',
    schema: {
      bookId: z.string().describe('ID do livro lido'),
      startPage: z.number().optional().describe('Página inicial da sessão (se omitido, usa a página atual do livro)'),
      endPage: z.number().describe('Página final alcançada nesta sessão'),
      durationMinutes: z.number().optional().default(20).describe('Duração da leitura em minutos'),
      notes: z.string().optional().describe('Notas ou resumo do trecho lido'),
      quotes: z.array(z.object({
        quote: z.string().describe('Texto do insight/citação'),
        page: z.number().optional().describe('Número da página'),
        note: z.string().optional().describe('Reflexão pessoal')
      })).optional().describe('Citações coletadas durante esta sessão'),
      date: z.string().optional().describe('Data da sessão YYYY-MM-DD')
    },
    handler: async (args) => {
      const db = getDb();
      const book = (db.books || []).find(b => b.id === args.bookId);
      if (!book) return formatError(`Livro '${args.bookId}' não encontrado.`);

      const sPage = parseInt(args.startPage, 10) || book.currentPage || 0;
      const ePage = parseInt(args.endPage, 10);
      const duration = parseInt(args.durationMinutes, 10) || 20;

      if (ePage <= sPage) {
        return formatError(`A página final (${ePage}) deve ser maior que a página inicial (${sPage}).`);
      }

      const pagesRead = Math.min(book.totalPages, ePage) - sPage;
      const newCurrentPage = Math.min(book.totalPages, ePage);
      const finishedBook = newCurrentPage >= book.totalPages;

      book.currentPage = newCurrentPage;
      if (finishedBook) {
        book.status = 'completed';
        book.completedAt = new Date().toISOString();
      }

      // Process quotes
      const parsedQuotes = Array.isArray(args.quotes) ? args.quotes.filter(q => q.quote && q.quote.trim()).map(q => ({
        id: uid('quo'),
        bookId: book.id,
        bookTitle: book.title,
        quote: q.quote.trim(),
        page: parseInt(q.page, 10) || newCurrentPage,
        note: (q.note || '').trim(),
        createdAt: new Date().toISOString()
      })) : [];

      if (!book.quotes) book.quotes = [];
      if (parsedQuotes.length > 0) {
        book.quotes.unshift(...parsedQuotes);
      }

      // XP & Rewards
      const basePageXp = pagesRead * 2;
      const finishBonusXp = finishedBook ? 200 : 0;
      const quoteBonusXp = parsedQuotes.length * 15;
      const totalXp = basePageXp + finishBonusXp + quoteBonusXp;
      const coins = Math.max(5, Math.floor(pagesRead / 3)) + (finishedBook ? 50 : 0) + parsedQuotes.length * 2;
      const wisdom = pagesRead + (finishedBook ? 50 : 0) + parsedQuotes.length * 5;

      const session = {
        id: uid('rs'),
        bookId: book.id,
        bookTitle: book.title,
        startPage: sPage,
        endPage: newCurrentPage,
        pagesRead,
        durationMinutes: duration,
        notes: args.notes || '',
        quotes: parsedQuotes,
        xpEarned: totalXp,
        coinsEarned: coins,
        wisdomEarned: wisdom,
        date: args.date || getSaoPauloDateStr(),
        timestamp: new Date().toISOString()
      };

      if (!db.readingSessions) db.readingSessions = [];
      db.readingSessions.unshift(session);

      const rewardResult = rewardPlayer({
        xp: totalXp,
        coins,
        wisdom,
        actionType: 'reading_session',
        entityId: book.id,
        title: `${book.title} (+${pagesRead} págs${parsedQuotes.length > 0 ? `, ${parsedQuotes.length} citações` : ''})`,
        details: { category: 'Estudos', pagesRead, durationMinutes: duration, finishedBook, quotesCount: parsedQuotes.length }
      });

      saveDb(db);
      return formatSuccess({
        session,
        book,
        finishedBook,
        rewardResult
      }, `📖 Sessão de leitura registrada! +${pagesRead} páginas lidas (+${totalXp} XP, +${wisdom} Sabedoria, +${coins} Moedas).`);
    }
  },
  {
    name: 'delete_reading_session',
    description: 'Excluir uma sessão de leitura com estorno automático de progresso e recompensas.',
    schema: {
      id: z.string().describe('ID da sessão de leitura')
    },
    handler: async (args) => {
      const db = getDb();
      const index = (db.readingSessions || []).findIndex(s => s.id === args.id);
      if (index === -1) return formatError(`Sessão de leitura '${args.id}' não encontrada.`);

      const [removed] = db.readingSessions.splice(index, 1);
      const book = (db.books || []).find(b => b.id === removed.bookId);
      if (book) {
        book.currentPage = Math.max(0, (book.currentPage || 0) - (removed.pagesRead || 0));
        if (book.status === 'completed' && book.currentPage < book.totalPages) {
          book.status = 'reading';
        }
      }

      revertPlayerReward({
        xp: removed.xpEarned || 0,
        coins: removed.coinsEarned || 0,
        wisdom: removed.wisdomEarned || 0,
        actionType: 'reading_session',
        entityId: removed.bookId
      });

      saveDb(db);
      return formatSuccess({ removed, book }, 'Sessão de leitura excluída e progresso estornado com sucesso.');
    }
  },

  // ==========================================
  // 5. PROCESSOS EM LOTE - CRUD
  // ==========================================
  {
    name: 'list_processes',
    description: 'Listar processos da Linha de Operações (processos em lote).',
    schema: {
      status: z.enum(['active', 'completed', 'all']).optional().describe('Status dos processos'),
      category: z.string().optional().describe('Filtrar por categoria')
    },
    handler: async (args) => {
      const db = getDb();
      let processes = [...(db.processes || [])];
      if (args.status && args.status !== 'all') {
        processes = processes.filter(p => p.status === args.status);
      }
      if (args.category) {
        processes = processes.filter(p => (p.category || '').toLowerCase() === args.category.toLowerCase().trim());
      }
      return formatSuccess({ total: processes.length, processes }, `${processes.length} processos encontrados.`);
    }
  },
  {
    name: 'get_process',
    description: 'Obter detalhes e histórico de etapas de um processo em lote.',
    schema: {
      id: z.string().describe('ID do processo')
    },
    handler: async (args) => {
      const db = getDb();
      const process = (db.processes || []).find(p => p.id === args.id);
      if (!process) return formatError(`Processo '${args.id}' não encontrado.`);
      return formatSuccess(process, 'Processo encontrado.');
    }
  },
  {
    name: 'create_process',
    description: 'Criar um novo lote de processos/tarefas repetitivas na Linha de Operações.',
    schema: {
      title: z.string().describe('Título do lote de processos (ex: Analisar 15 Recursos)'),
      description: z.string().optional().describe('Descrição ou instrução operacional'),
      totalSteps: z.number().optional().default(10).describe('Meta total de itens/etapas no lote'),
      currentStep: z.number().optional().default(0).describe('Itens já concluídos inicialmente'),
      stepUnit: z.string().optional().default('processos').describe('Unidade de contagem (ex: processos, relatórios, casos, aulas)'),
      category: z.string().optional().default('Trabalho').describe('Categoria do processo')
    },
    handler: async (args) => {
      const db = getDb();
      if (!args.title || !args.title.trim()) return formatError('Título do processo é obrigatório.');

      const total = parseInt(args.totalSteps, 10) || 10;
      const current = Math.min(total, Math.max(0, parseInt(args.currentStep, 10) || 0));

      const newProcess = {
        id: uid('proc'),
        title: args.title.trim(),
        description: (args.description || '').trim(),
        totalSteps: total,
        currentStep: current,
        completedUnits: current,
        stepUnit: args.stepUnit || 'processos',
        category: args.category || 'Trabalho',
        status: current >= total ? 'completed' : 'active',
        stepHistory: [],
        createdAt: new Date().toISOString()
      };

      if (!db.processes) db.processes = [];
      db.processes.unshift(newProcess);
      saveDb(db);
      return formatSuccess(newProcess, `Processo em lote '${newProcess.title}' criado com sucesso.`);
    }
  },
  {
    name: 'step_process',
    description: 'Avançar etapas de um processo em lote (+1, +2 ou quantidade customizada). Concede XP, Moedas, Foco e ataca o Boss Semanal.',
    schema: {
      id: z.string().describe('ID do processo'),
      stepCount: z.number().optional().default(1).describe('Quantidade de etapas concluídas agora (padrão: 1)'),
      note: z.string().optional().describe('Anotação rápida sobre o caso/processo analisado')
    },
    handler: async (args) => {
      const db = getDb();
      const process = (db.processes || []).find(p => p.id === args.id);
      if (!process) return formatError(`Processo '${args.id}' não encontrado.`);

      const increment = parseInt(args.stepCount, 10) || 1;
      const prevStep = process.currentStep || 0;
      const newStep = Math.min(process.totalSteps, prevStep + increment);
      const actualAdvance = newStep - prevStep;

      if (actualAdvance <= 0) {
        return formatSuccess({ process, unchanged: true }, 'O processo já atingiu 100% das etapas.');
      }

      process.currentStep = newStep;
      process.completedUnits = newStep;
      const finished = newStep >= process.totalSteps;
      if (finished) {
        process.status = 'completed';
        process.completedAt = new Date().toISOString();
      }

      if (!process.stepHistory) process.stepHistory = [];
      const historyEntry = {
        id: uid('step'),
        stepNumber: newStep,
        advancedCount: actualAdvance,
        note: (args.note || '').trim(),
        timestamp: new Date().toISOString()
      };
      process.stepHistory.unshift(historyEntry);

      // XP & Rewards
      const xp = actualAdvance * 15 + (finished ? 100 : 0);
      const coins = actualAdvance * 3 + (finished ? 20 : 0);
      const focus = actualAdvance * 5 + (finished ? 25 : 0);

      const rewardResult = rewardPlayer({
        xp,
        coins,
        focus,
        actionType: 'process_step',
        entityId: process.id,
        title: `${process.title} (+${actualAdvance} ${process.stepUnit})`,
        details: { category: process.category, finished }
      });

      saveDb(db);
      return formatSuccess({
        process,
        historyEntry,
        finished,
        rewardResult
      }, `⚡ +${actualAdvance} ${process.stepUnit} concluído(s)! (+${xp} XP, +${focus} Foco, +${coins} Moedas).`);
    }
  },
  {
    name: 'update_process',
    description: 'Atualizar informações de um processo em lote.',
    schema: {
      id: z.string().describe('ID do processo'),
      title: z.string().optional().describe('Novo título'),
      description: z.string().optional().describe('Nova descrição'),
      totalSteps: z.number().optional().describe('Novo total de etapas'),
      currentStep: z.number().optional().describe('Nova etapa atual'),
      stepUnit: z.string().optional().describe('Nova unidade de medida'),
      category: z.string().optional().describe('Nova categoria'),
      status: z.enum(['active', 'completed']).optional().describe('Novo status')
    },
    handler: async (args) => {
      const db = getDb();
      const process = (db.processes || []).find(p => p.id === args.id);
      if (!process) return formatError(`Processo '${args.id}' não encontrado.`);

      if (args.title !== undefined) process.title = args.title.trim();
      if (args.description !== undefined) process.description = args.description.trim();
      if (args.totalSteps !== undefined) process.totalSteps = parseInt(args.totalSteps, 10);
      if (args.currentStep !== undefined) {
        process.currentStep = Math.min(process.totalSteps, Math.max(0, parseInt(args.currentStep, 10)));
        process.completedUnits = process.currentStep;
      }
      if (args.stepUnit !== undefined) process.stepUnit = args.stepUnit.trim();
      if (args.category !== undefined) process.category = args.category.trim();
      if (args.status !== undefined) process.status = args.status;

      saveDb(db);
      return formatSuccess(process, `Processo '${process.title}' atualizado com sucesso.`);
    }
  },
  {
    name: 'delete_process',
    description: 'Excluir um processo em lote.',
    schema: {
      id: z.string().describe('ID do processo a ser excluído')
    },
    handler: async (args) => {
      const db = getDb();
      const index = (db.processes || []).findIndex(p => p.id === args.id);
      if (index === -1) return formatError(`Processo '${args.id}' não encontrado.`);

      const [removed] = db.processes.splice(index, 1);
      saveDb(db);
      return formatSuccess(removed, `Processo '${removed.title}' excluído.`);
    }
  },

  // ==========================================
  // 6. RITUAIS DIÁRIOS & HÁBITOS - CRUD (COM NOVAS FREQUÊNCIAS)
  // ==========================================
  {
    name: 'list_habits',
    description: 'Listar todos os rituais/hábitos diários com status de conclusão de hoje, sequências (streaks) e métricas semanais calculadas de acordo com sua frequência (daily, weekdays, weekly, times_per_week).',
    schema: {},
    handler: async () => {
      const db = getDb();
      const now = new Date();
      const todayStr = getSaoPauloDateStr(now);

      const habits = (db.habits || []).map(h => {
        const weeklyStats = getHabitWeeklyStats(h, now);
        const history = Array.isArray(h.history) ? h.history : [];
        const completedToday = history.includes(todayStr);

        return {
          id: h.id,
          title: h.title,
          description: h.description,
          category: h.category,
          icon: h.icon,
          frequency: h.frequency || 'daily',
          targetTimesPerWeek: weeklyStats.targetTimesPerWeek,
          completionsThisWeek: weeklyStats.completionsThisWeek,
          isGoalMet: weeklyStats.isGoalMet,
          completedToday,
          currentStreak: h.currentStreak || 0,
          bestStreak: h.bestStreak || 0,
          xpReward: h.xpReward || 30,
          coinReward: h.coinReward || 8,
          createdAt: h.createdAt
        };
      });

      return formatSuccess({ total: habits.length, habits }, `${habits.length} rituais listados.`);
    }
  },
  {
    name: 'create_habit',
    description: 'Criar um novo ritual diário/hábito com suporte a 4 frequências: daily (Diário), weekdays (Seg-Sex), weekly (Semanal) e times_per_week (N vezes por semana).',
    schema: {
      title: z.string().describe('Nome do ritual (ex: Meditar 10 min, Exercício Físico)'),
      description: z.string().optional().describe('Descrição ou instrução do ritual'),
      category: z.string().optional().default('Pessoal').describe('Categoria'),
      icon: z.string().optional().default('Flame').describe('Ícone Lucide (ex: Flame, Dumbbell, Book, Sun)'),
      frequency: z.enum(['daily', 'weekdays', 'weekly', 'times_per_week']).optional().default('daily').describe('Frequência do hábito'),
      targetTimesPerWeek: z.number().min(1).max(7).optional().describe('Meta de vezes por semana (usado quando frequency for times_per_week)'),
      xpReward: z.number().optional().default(30).describe('XP concedido por execução'),
      coinReward: z.number().optional().default(8).describe('Moedas concedidas por execução')
    },
    handler: async (args) => {
      const db = getDb();
      if (!args.title || !args.title.trim()) return formatError('Título do hábito é obrigatório.');

      let freq = args.frequency || 'daily';
      let target = 7;
      if (freq === 'times_per_week') {
        target = Math.max(1, Math.min(7, parseInt(args.targetTimesPerWeek, 10) || 3));
      } else if (freq === 'weekdays') {
        target = 5;
      } else if (freq === 'weekly') {
        target = 1;
      } else {
        freq = 'daily';
        target = 7;
      }

      const newHabit = {
        id: uid('h'),
        title: args.title.trim(),
        description: (args.description || '').trim(),
        category: (args.category || 'Pessoal').trim(),
        icon: args.icon || 'Flame',
        frequency: freq,
        targetTimesPerWeek: target,
        currentStreak: 0,
        bestStreak: 0,
        history: [],
        xpReward: parseInt(args.xpReward, 10) || 30,
        coinReward: parseInt(args.coinReward, 10) || 8,
        createdAt: new Date().toISOString()
      };

      if (!db.habits) db.habits = [];
      db.habits.unshift(newHabit);
      saveDb(db);
      return formatSuccess(newHabit, `Ritual '${newHabit.title}' criado com sucesso (${freq}).`);
    }
  },
  {
    name: 'toggle_habit',
    description: 'Marcar ou desmarcar a execução de um ritual diário para hoje (ou para uma data específica YYYY-MM-DD). Concede/estorna XP, Moedas, Consistência e atualiza a sequência de chamas.',
    schema: {
      id: z.string().describe('ID do ritual/hábito'),
      date: z.string().optional().describe('Data da execução YYYY-MM-DD (se omitido, usa a data atual)')
    },
    handler: async (args) => {
      const db = getDb();
      const habit = (db.habits || []).find(h => h.id === args.id);
      if (!habit) return formatError(`Ritual '${args.id}' não encontrado.`);

      const targetDate = args.date || getSaoPauloDateStr();
      if (!habit.history) habit.history = [];
      const isAlreadyCompleted = habit.history.includes(targetDate);

      let rewardResult = null;
      if (!isAlreadyCompleted) {
        habit.history.push(targetDate);
        habit.currentStreak = (habit.currentStreak || 0) + 1;
        if (habit.currentStreak > (habit.bestStreak || 0)) {
          habit.bestStreak = habit.currentStreak;
        }

        const xp = habit.xpReward || 30;
        const coins = habit.coinReward || 8;
        const consistency = 10;

        rewardResult = rewardPlayer({
          xp,
          coins,
          consistency,
          actionType: 'habit_toggle',
          entityId: habit.id,
          title: `Ritual Concluído: ${habit.title}`,
          details: { category: habit.category, date: targetDate, streak: habit.currentStreak }
        });
      } else {
        habit.history = habit.history.filter(d => d !== targetDate);
        habit.currentStreak = Math.max(0, (habit.currentStreak || 1) - 1);

        const xp = habit.xpReward || 30;
        const coins = habit.coinReward || 8;
        const consistency = 10;

        rewardResult = revertPlayerReward({
          xp,
          coins,
          consistency,
          actionType: 'habit_toggle',
          entityId: habit.id
        });
      }

      saveDb(db);
      const weeklyStats = getHabitWeeklyStats(habit, new Date());

      return formatSuccess({
        habit: {
          ...habit,
          weeklyStats,
          completedToday: !isAlreadyCompleted
        },
        action: !isAlreadyCompleted ? 'completed' : 'uncompleted',
        rewardResult
      }, !isAlreadyCompleted ? `🔥 Ritual '${habit.title}' marcado! Sequência: ${habit.currentStreak} dias (+${habit.xpReward || 30} XP).` : `Ritual '${habit.title}' desmarcado e recompensas estornadas.`);
    }
  },
  {
    name: 'update_habit',
    description: 'Atualizar informações de um ritual diário, frequência e metas.',
    schema: {
      id: z.string().describe('ID do ritual'),
      title: z.string().optional().describe('Novo título'),
      description: z.string().optional().describe('Nova descrição'),
      category: z.string().optional().describe('Nova categoria'),
      icon: z.string().optional().describe('Novo ícone'),
      frequency: z.enum(['daily', 'weekdays', 'weekly', 'times_per_week']).optional().describe('Nova frequência'),
      targetTimesPerWeek: z.number().min(1).max(7).optional().describe('Nova meta de vezes por semana'),
      xpReward: z.number().optional().describe('Novo XP'),
      coinReward: z.number().optional().describe('Novas moedas')
    },
    handler: async (args) => {
      const db = getDb();
      const habit = (db.habits || []).find(h => h.id === args.id);
      if (!habit) return formatError(`Ritual '${args.id}' não encontrado.`);

      if (args.title !== undefined) habit.title = args.title.trim();
      if (args.description !== undefined) habit.description = args.description.trim();
      if (args.category !== undefined) habit.category = args.category.trim();
      if (args.icon !== undefined) habit.icon = args.icon;

      if (args.frequency !== undefined) {
        let freq = args.frequency;
        if (freq === 'times_per_week') {
          habit.targetTimesPerWeek = Math.max(1, Math.min(7, parseInt(args.targetTimesPerWeek || habit.targetTimesPerWeek, 10) || 3));
        } else if (freq === 'weekdays') {
          habit.targetTimesPerWeek = 5;
        } else if (freq === 'weekly') {
          habit.targetTimesPerWeek = 1;
        } else if (freq === 'daily') {
          habit.targetTimesPerWeek = 7;
        }
        habit.frequency = freq;
      } else if (args.targetTimesPerWeek !== undefined) {
        habit.targetTimesPerWeek = Math.max(1, Math.min(7, parseInt(args.targetTimesPerWeek, 10) || 3));
      }

      if (args.xpReward !== undefined) habit.xpReward = parseInt(args.xpReward, 10) || 30;
      if (args.coinReward !== undefined) habit.coinReward = parseInt(args.coinReward, 10) || 8;

      saveDb(db);
      return formatSuccess(habit, `Ritual '${habit.title}' atualizado com sucesso.`);
    }
  },
  {
    name: 'delete_habit',
    description: 'Excluir um ritual diário.',
    schema: {
      id: z.string().describe('ID do ritual a ser excluído')
    },
    handler: async (args) => {
      const db = getDb();
      const index = (db.habits || []).findIndex(h => h.id === args.id);
      if (index === -1) return formatError(`Ritual '${args.id}' não encontrado.`);

      const [removed] = db.habits.splice(index, 1);
      saveDb(db);
      return formatSuccess(removed, `Ritual '${removed.title}' excluído.`);
    }
  },

  // ==========================================
  // 7. BANCO DE QUESTÕES / SIMULADOS - CRUD
  // ==========================================
  {
    name: 'list_exam_questions',
    description: 'Listar histórico de simulados e questões de concurso respondidas.',
    schema: {
      subject: z.string().optional().describe('Filtrar por matéria/disciplina'),
      limit: z.number().optional().describe('Limite de registros')
    },
    handler: async (args) => {
      const db = getDb();
      let questions = [...(db.examQuestions || [])];
      if (args.subject) {
        questions = questions.filter(q => (q.subject || '').toLowerCase() === args.subject.toLowerCase().trim());
      }
      if (args.limit && args.limit > 0) {
        questions = questions.slice(0, args.limit);
      }
      return formatSuccess({ total: questions.length, examQuestions: questions }, `${questions.length} registros de questões encontrados.`);
    }
  },
  {
    name: 'log_exam_questions',
    description: 'Registrar uma bateria de questões resolvidas (concurso/simulado). Concede XP proporcional a acertos, Sabedoria e Moedas.',
    schema: {
      subject: z.string().describe('Matéria / Disciplina (ex: Direito Administrativo, Raciocínio Lógico)'),
      topic: z.string().optional().describe('Tópico ou assunto específico'),
      totalQuestions: z.number().describe('Total de questões resolvidas'),
      correctAnswers: z.number().describe('Quantidade de acertos'),
      wrongAnswers: z.number().optional().describe('Quantidade de erros (se omitido, calcula total - acertos)'),
      durationMinutes: z.number().optional().default(30).describe('Tempo dedicado em minutos'),
      notes: z.string().optional().describe('Observações, pontos de melhoria ou pegadinhas'),
      date: z.string().optional().describe('Data no formato YYYY-MM-DD')
    },
    handler: async (args) => {
      const db = getDb();
      if (!args.subject || !args.subject.trim()) return formatError('A matéria é obrigatória.');

      const total = parseInt(args.totalQuestions, 10);
      const correct = parseInt(args.correctAnswers, 10);
      if (isNaN(total) || total <= 0) return formatError('Total de questões deve ser maior que 0.');
      if (isNaN(correct) || correct < 0 || correct > total) return formatError('Acertos deve ser entre 0 e o total de questões.');

      const wrong = args.wrongAnswers !== undefined ? parseInt(args.wrongAnswers, 10) : total - correct;
      const duration = parseInt(args.durationMinutes, 10) || 30;

      const accuracy = Math.round((correct / total) * 100);
      const xp = correct * 10 + (total - correct) * 2;
      const coins = Math.floor(correct * 1.5);
      const wisdom = correct * 3;

      const newEntry = {
        id: uid('eq'),
        subject: args.subject.trim(),
        topic: (args.topic || '').trim(),
        totalQuestions: total,
        correctAnswers: correct,
        wrongAnswers: wrong,
        accuracyRate: accuracy,
        durationMinutes: duration,
        notes: (args.notes || '').trim(),
        xpEarned: xp,
        coinsEarned: coins,
        wisdomEarned: wisdom,
        date: args.date || getSaoPauloDateStr(),
        timestamp: new Date().toISOString()
      };

      if (!db.examQuestions) db.examQuestions = [];
      db.examQuestions.unshift(newEntry);

      const rewardResult = rewardPlayer({
        xp,
        coins,
        wisdom,
        actionType: 'exam_questions',
        entityId: newEntry.id,
        title: `Questões: ${newEntry.subject} (${correct}/${total} - ${accuracy}%)`,
        details: { subject: newEntry.subject, correct, total, accuracy }
      });

      saveDb(db);
      return formatSuccess({
        entry: newEntry,
        rewardResult
      }, `🎯 ${total} questões registradas em '${newEntry.subject}' com ${accuracy}% de acerto! (+${xp} XP, +${wisdom} Sabedoria).`);
    }
  },
  {
    name: 'delete_exam_questions',
    description: 'Excluir um registro de questões resolvidas e estornar recompensas.',
    schema: {
      id: z.string().describe('ID do registro de questões')
    },
    handler: async (args) => {
      const db = getDb();
      const index = (db.examQuestions || []).findIndex(q => q.id === args.id);
      if (index === -1) return formatError(`Registro de questões '${args.id}' não encontrado.`);

      const [removed] = db.examQuestions.splice(index, 1);
      revertPlayerReward({
        xp: removed.xpEarned || 0,
        coins: removed.coinsEarned || 0,
        wisdom: removed.wisdomEarned || 0,
        actionType: 'exam_questions',
        entityId: args.id
      });

      saveDb(db);
      return formatSuccess(removed, 'Registro de questões excluído e pontuação estornada.');
    }
  },

  // ==========================================
  // 8. TAVERNA & RECOMPENSAS - CRUD
  // ==========================================
  {
    name: 'list_rewards',
    description: 'Listar recompensas cadastradas na Taverna.',
    schema: {},
    handler: async () => {
      const db = getDb();
      return formatSuccess(db.rewards || [], 'Recompensas listadas.');
    }
  },
  {
    name: 'create_reward',
    description: 'Cadastrar uma recompensa na Taverna que pode ser resgatada com Moedas de Ouro do herói.',
    schema: {
      title: z.string().describe('Nome da recompensa (ex: 1h de Videogame, Café Gourmet, Assistir Filme)'),
      costCoins: z.number().min(1).describe('Custo em Moedas de Ouro'),
      icon: z.string().optional().default('Gift').describe('Ícone Lucide (ex: Gift, Coffee, Gamepad2, Tv, Sparkles)'),
      category: z.string().optional().default('Lazer').describe('Categoria da recompensa')
    },
    handler: async (args) => {
      const db = getDb();
      if (!args.title || !args.title.trim()) return formatError('Título da recompensa é obrigatório.');

      const newReward = {
        id: uid('rew'),
        title: args.title.trim(),
        costCoins: parseInt(args.costCoins, 10) || 50,
        icon: args.icon || 'Gift',
        category: args.category || 'Lazer',
        createdAt: new Date().toISOString()
      };

      if (!db.rewards) db.rewards = [];
      db.rewards.unshift(newReward);
      saveDb(db);
      return formatSuccess(newReward, `Recompensa '${newReward.title}' criada por ${newReward.costCoins} moedas.`);
    }
  },
  {
    name: 'redeem_reward',
    description: 'Resgatar uma recompensa da Taverna debitando as Moedas de Ouro necessárias do herói.',
    schema: {
      id: z.string().describe('ID da recompensa a resgatar'),
      notes: z.string().optional().describe('Observações sobre o resgate')
    },
    handler: async (args) => {
      const db = getDb();
      const reward = (db.rewards || []).find(r => r.id === args.id);
      if (!reward) return formatError(`Recompensa '${args.id}' não encontrada.`);

      const userCoins = db.userProfile?.coins || 0;
      if (userCoins < reward.costCoins) {
        return formatError(`Moedas insuficientes! Você possui 🪙 ${userCoins} moedas, mas o item custa 🪙 ${reward.costCoins}.`);
      }

      db.userProfile.coins = userCoins - reward.costCoins;

      const redemption = {
        id: uid('red'),
        rewardId: reward.id,
        title: reward.title,
        costCoins: reward.costCoins,
        icon: reward.icon,
        notes: (args.notes || '').trim(),
        timestamp: new Date().toISOString()
      };

      if (!db.rewardRedemptions) db.rewardRedemptions = [];
      db.rewardRedemptions.unshift(redemption);

      saveDb(db);
      return formatSuccess({
        redemption,
        remainingCoins: db.userProfile.coins
      }, `🎁 Recompensa '${reward.title}' resgatada com sucesso! Saldo restante: 🪙 ${db.userProfile.coins} moedas.`);
    }
  },
  {
    name: 'list_reward_redemptions',
    description: 'Listar histórico de resgates de recompensas efetuados.',
    schema: {},
    handler: async () => {
      const db = getDb();
      return formatSuccess(db.rewardRedemptions || [], 'Histórico de resgates listado.');
    }
  },
  {
    name: 'cancel_reward_redemption',
    description: 'Cancelar um resgate de recompensa e reembolsar as moedas ao herói.',
    schema: {
      id: z.string().describe('ID do resgate')
    },
    handler: async (args) => {
      const db = getDb();
      const index = (db.rewardRedemptions || []).findIndex(r => r.id === args.id);
      if (index === -1) return formatError(`Resgate '${args.id}' não encontrado.`);

      const [removed] = db.rewardRedemptions.splice(index, 1);
      db.userProfile.coins = (db.userProfile.coins || 0) + (removed.costCoins || 0);

      saveDb(db);
      return formatSuccess({
        removed,
        refundedCoins: removed.costCoins,
        newBalance: db.userProfile.coins
      }, `Resgate cancelado! 🪙 ${removed.costCoins} moedas foram devolvidas.`);
    }
  },
  {
    name: 'delete_reward',
    description: 'Excluir uma recompensa da Taverna.',
    schema: {
      id: z.string().describe('ID da recompensa a ser excluída')
    },
    handler: async (args) => {
      const db = getDb();
      const index = (db.rewards || []).findIndex(r => r.id === args.id);
      if (index === -1) return formatError(`Recompensa '${args.id}' não encontrada.`);

      const [removed] = db.rewards.splice(index, 1);
      saveDb(db);
      return formatSuccess(removed, `Recompensa '${removed.title}' excluída.`);
    }
  },

  // ==========================================
  // 9. PERFIL DO HERÓI & BOSS RAID
  // ==========================================
  {
    name: 'get_player_state',
    description: 'Obter o estado completo do herói: nível, XP atual, XP para próximo nível, Moedas, atributos (Sabedoria, Foco, Vontade, Consistência), streak diário, Boss Semanal e contadores gerais.',
    schema: {},
    handler: async () => {
      const db = getDb();
      const profile = db.userProfile || {};
      const boss = db.bossRaid || {};

      const summary = {
        totalQuests: (db.quests || []).length,
        pendingQuests: (db.quests || []).filter(q => !q.completed).length,
        completedQuests: (db.quests || []).filter(q => q.completed).length,
        totalBooks: (db.books || []).length,
        activeBooks: (db.books || []).filter(b => b.status === 'reading').length,
        totalProcesses: (db.processes || []).length,
        totalHabits: (db.habits || []).length,
        totalRewardItems: (db.rewards || []).length
      };

      return formatSuccess({
        userProfile: profile,
        bossRaid: boss,
        summary
      }, 'Estado do jogador carregado com sucesso.');
    }
  },
  {
    name: 'reset_boss_raid',
    description: 'Invocar um novo Chefe Semanal ou avançar para o próximo nível (+10% de vida e recompensas). Escolhe dinamicamente um novo chefe motivador com nome e ícone exclusivos.',
    schema: {
      level: z.number().int().positive().optional().describe('Nível do chefe desejado (opcional. Se omitido, avança 1 nível caso o atual tenha sido derrotado)'),
      name: z.string().optional().describe('Nome forçado para o chefe (opcional)')
    },
    handler: async (args = {}) => {
      const db = getDb();
      const currentBoss = db.bossRaid;
      let targetLevel;

      if (args.level !== undefined) {
        targetLevel = Math.max(1, args.level);
      } else if (currentBoss && currentBoss.defeated) {
        targetLevel = (currentBoss.level || 1) + 1;
      } else {
        targetLevel = currentBoss?.level || 1;
      }

      db.bossRaid = createBossRaid({
        level: targetLevel,
        currentBoss,
        forceName: args.name || null
      });
      saveDb(db);

      const icon = db.bossRaid.icon || '🐉';
      const pctStronger = db.bossRaid.level > 1 ? ` (+${Math.round((Math.pow(1.10, db.bossRaid.level - 1) - 1) * 100)}% poder)` : '';
      return formatSuccess(
        db.bossRaid,
        `${icon} Chefe Nível ${db.bossRaid.level} invocado: "${db.bossRaid.name}" com ${db.bossRaid.maxHp} HP${pctStronger}!`
      );
    }
  },

  // ==========================================
  // 10. ORÁCULO DE ANÁLISES & PADRÕES COMPORTAMENTAIS (SOMENTE LEITURA)
  // ==========================================
  {
    name: 'get_oracle_analytics',
    description: 'Acessar o relatório analítico completo do Oráculo de Análises & Padrões Comportamentais (somente leitura). Inclui janela de pico produtivo, mapa de calor horário, melhor dia da semana, métricas de leitura e velocidade PPH, taxa de acerto em simulados nos 5 horizontes de tempo, consistência semanal de rituais e revelações comportamentais.',
    schema: {},
    handler: async () => {
      const analytics = computeAnalytics();
      return formatSuccess(analytics, 'Relatório completo do Oráculo de Análises gerado com sucesso.');
    }
  },
  {
    name: 'get_oracle_insights',
    description: 'Obter exclusivamente a lista de revelações, conselhos e alertas contextuais contra procrastinação gerados pelo motor de inteligência do Oráculo.',
    schema: {},
    handler: async () => {
      const analytics = computeAnalytics();
      return formatSuccess({
        totalInsights: (analytics.insights || []).length,
        insights: analytics.insights || []
      }, 'Revelações do Oráculo obtidas com sucesso.');
    }
  },
  {
    name: 'get_productivity_patterns',
    description: 'Obter os padrões comportamentais de tempo e produtividade: janela de pico horário (00h às 23h), contagem por hora do dia e desempenho comparativo por dia da semana (Domingo a Sábado).',
    schema: {},
    handler: async () => {
      const analytics = computeAnalytics();
      return formatSuccess({
        peakWindow: analytics.peakWindow,
        bestDay: analytics.bestDay,
        hourlyCount: analytics.hourlyCount,
        dayCounts: analytics.dayCounts,
        dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
      }, 'Padrões de produtividade horária e semanal calculados.');
    }
  },
  {
    name: 'get_study_analytics',
    description: 'Obter métricas consolidadas de estudo e foco: velocidade e projeções de livros em leitura + desempenho em questões de concurso (taxa de acerto por matéria, tempo dedicado e histórico dos últimos 14 dias).',
    schema: {},
    handler: async () => {
      const analytics = computeAnalytics();
      return formatSuccess({
        reading: {
          totalPagesRead: analytics.totalPagesRead,
          totalReadingMinutes: analytics.totalReadingMinutes,
          avgPagesPerSession: analytics.avgPagesPerSession,
          readingSpeedPPH: analytics.readingSpeedPPH,
          bookProjections: analytics.bookProjections
        },
        examQuestions: {
          questionHorizons: analytics.questionHorizons,
          subjectStats: analytics.subjectStats,
          questionDailyHistory: analytics.questionDailyHistory
        }
      }, 'Métricas de leitura e simulados obtidas.');
    }
  },
  {
    name: 'get_category_rankings',
    description: 'Obter os rankings e níveis de maestria alcançados em cada categoria de atividade (Trabalho, Estudos, Pessoal, etc.).',
    schema: {},
    handler: async () => {
      const rankings = computeCategoryRankings();
      return formatSuccess(rankings, 'Rankings de categoria obtidos.');
    }
  }
];

/**
 * MCP Resources Definition & Handlers
 */
export const resourcesDefinition = [
  {
    uri: 'grimorio://state',
    name: 'Estado do Herói & Grimório',
    description: 'Perfil completo do jogador, atributos, status do Boss e resumo de registros',
    mimeType: 'application/json',
    handler: async () => {
      const db = getDb();
      return {
        uri: 'grimorio://state',
        mimeType: 'application/json',
        text: JSON.stringify({
          userProfile: db.userProfile,
          bossRaid: db.bossRaid,
          summary: {
            quests: (db.quests || []).length,
            books: (db.books || []).length,
            processes: (db.processes || []).length,
            habits: (db.habits || []).length
          }
        }, null, 2)
      };
    }
  },
  {
    uri: 'grimorio://oracle/analytics',
    name: 'Oráculo de Análises & Padrões',
    description: 'Relatório completo de inteligência analítica e padrões comportamentais',
    mimeType: 'application/json',
    handler: async () => {
      const analytics = computeAnalytics();
      return {
        uri: 'grimorio://oracle/analytics',
        mimeType: 'application/json',
        text: JSON.stringify(analytics, null, 2)
      };
    }
  },
  {
    uri: 'grimorio://oracle/insights',
    name: 'Revelações do Oráculo',
    description: 'Insights e alertas contextuais contra procrastinação gerados pelo Oráculo',
    mimeType: 'application/json',
    handler: async () => {
      const analytics = computeAnalytics();
      return {
        uri: 'grimorio://oracle/insights',
        mimeType: 'application/json',
        text: JSON.stringify(analytics.insights || [], null, 2)
      };
    }
  },
  {
    uri: 'grimorio://quests',
    name: 'Missões Ativas e Concluídas',
    description: 'Lista completa de missões do Grimório',
    mimeType: 'application/json',
    handler: async () => {
      const db = getDb();
      return {
        uri: 'grimorio://quests',
        mimeType: 'application/json',
        text: JSON.stringify(db.quests || [], null, 2)
      };
    }
  },
  {
    uri: 'grimorio://habits',
    name: 'Rituais Diários e Metas Semanais',
    description: 'Hábitos cadastrados, frequências e status da semana',
    mimeType: 'application/json',
    handler: async () => {
      const db = getDb();
      const now = new Date();
      const habits = (db.habits || []).map(h => ({
        ...h,
        weeklyStats: getHabitWeeklyStats(h, now)
      }));
      return {
        uri: 'grimorio://habits',
        mimeType: 'application/json',
        text: JSON.stringify(habits, null, 2)
      };
    }
  },
  {
    uri: 'grimorio://books',
    name: 'Biblioteca Ancestral',
    description: 'Lista de livros e citações cadastradas',
    mimeType: 'application/json',
    handler: async () => {
      const db = getDb();
      return {
        uri: 'grimorio://books',
        mimeType: 'application/json',
        text: JSON.stringify(db.books || [], null, 2)
      };
    }
  },
  {
    uri: 'grimorio://processes',
    name: 'Linha de Operações',
    description: 'Processos em lote e histórico de etapas',
    mimeType: 'application/json',
    handler: async () => {
      const db = getDb();
      return {
        uri: 'grimorio://processes',
        mimeType: 'application/json',
        text: JSON.stringify(db.processes || [], null, 2)
      };
    }
  }
];
