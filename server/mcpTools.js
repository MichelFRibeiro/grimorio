import { z } from 'zod';
import { getDb, saveDb, rewardPlayer, revertPlayerReward, revertLog, getXpForLevel, getTitleForLevel, createBossRaid, applyCategoryRename } from './db.js';
import { runMaintenance } from './domain/maintenance.js';
import { listUnacknowledged, acknowledgePenalty, prepareContest } from './domain/penalties.js';
import { spendMoney, refundCoinsFromRedemption } from './tavernMoney.js';
import {
  createSupplement,
  updateSupplement,
  deleteSupplement,
  logSupplementIntake,
  updateSupplementLog,
  deleteSupplementLog
} from './domain/supplements.js';
import { formatBrl } from '../src/utils/coinExchange.js';
import { computeAnalytics } from './analytics.js';
import { computeCategoryRankings } from './rankings.js';
import { suggestNextAction, previewNextAction, recordEnergyAndSuggest, declineAndRemember, acceptDoseOnly } from './oracleSuggest.js';
import { markDecisionAccepted, markDecisionCompleted } from './oracleMemory.js';
import {
  summarizePlan,
  startAguPlan,
  toggleCompletedBlock,
  sanitizeAguPlan,
  addBlockDuration,
  ensureCurrentCycle,
  advanceAguCycle,
  logDiscursiveProduct,
  applyExamToPlan,
  addAguError,
  reviewAguError,
  dueAguErrors
} from '../src/utils/aguCycle.js';
import {
  applyDifficultyFields,
  DEFAULT_DIFFICULTY,
  DEFAULT_PRIORITY,
  resolveActivityScale,
  willpowerForDifficulty
} from '../src/utils/activityScale.js';
import {
  LOCATIONS,
  normalizeLocation,
  applyActivityContext,
  defaultLocationForCategory
} from './locations.js';
import {
  getSaoPauloDateStr,
  getSaoPauloHour,
  getSaoPauloDayOfWeek,
  getHabitWeeklyStats,
  calculateHabitStreak
} from './timeUtils.js';
import { BIBLE_BOOKS, bibleTotals, getBibleBook, formatReference } from '../src/data/bibleCanon.js';
import { applyHabitFrequency } from '../src/utils/habitFrequency.js';
import {
  MAX_DAILY_VICTORIES,
  EXTENDED_MAX_DAILY_VICTORIES,
  DAILY_VICTORY_REWARDS,
  DAILY_VICTORY_TRIPLE_BONUS,
  bonusEntityId,
  completeDailyVictory,
  createDailyVictory,
  deleteDailyVictory,
  getPlannableDates,
  sanitizeDailyVictories,
  sanitizeDailyVictoryBonuses,
  summarizeDay,
  updateDailyVictory
} from '../src/utils/dailyVictories.js';
import { syncDailyVictoriesFromActivity } from './dailyVictorySync.js';
import {
  completeQuest as domainCompleteQuest,
  breakDownQuest as domainBreakDownQuest,
  rescheduleQuests as domainRescheduleQuests,
  deleteQuest as domainDeleteQuest,
  toggleHabit as domainToggleHabit,
  deleteHabit as domainDeleteHabit,
  logReadingSession as domainLogReadingSession,
  updateReadingSession as domainUpdateReadingSession,
  deleteReadingSession as domainDeleteReadingSession,
  addQuote as domainAddQuote,
  updateQuote as domainUpdateQuote,
  deleteQuote as domainDeleteQuote,
  deleteBook as domainDeleteBook,
  logScriptureSession as domainLogScriptureSession,
  updateScriptureSession as domainUpdateScriptureSession,
  deleteScriptureSession as domainDeleteScriptureSession,
  addScriptureQuote as domainAddScriptureQuote,
  updateScriptureQuote as domainUpdateScriptureQuote,
  deleteScriptureQuote as domainDeleteScriptureQuote,
  addScriptureReflection as domainAddScriptureReflection,
  deleteScriptureReflection as domainDeleteScriptureReflection,
  logExamQuestions as domainLogExamQuestions,
  updateExamQuestions as domainUpdateExamQuestions,
  deleteExamQuestions as domainDeleteExamQuestions,
  createProcess as domainCreateProcess,
  stepProcess as domainStepProcess,
  updateProcess as domainUpdateProcess,
  deleteProcess as domainDeleteProcess,
  createReward as domainCreateReward,
  redeemReward as domainRedeemReward,
  completeDailyVictoryUseCase,
  deleteMindMapSession as domainDeleteMindMapSession,
  revertMindMapSession
} from './domain/activities.js';
import { markEnergySkip, formatQuantity } from './oracleMemory.js';
import {
  createMindMap,
  addMindMapNode,
  updateMindMapNode,
  updateMindMapNodes,
  deleteMindMapNode,
  addMindMapCrossLink,
  updateMindMapCrossLink,
  deleteMindMapCrossLink,
  addMindMapBrace,
  updateMindMapBrace,
  deleteMindMapBrace,
  updateMindMapMeta,
  layoutMindMap,
  applyStudySession,
  sanitizeMindMaps,
  sanitizeMindMapSessions,
  sanitizeMindMapCategories,
  createMindMapCategory,
  applyMindMapCategoryRename,
  reassignMindMapCategory,
  computeMapStats,
  getStudyQueue,
  rememberMindMapImage,
  forgetMindMapImage,
  sanitizeMindMapImageLibrary,
  stripMindMapImage
} from '../src/utils/mindMaps.js';
import { parseDurationMinutes, setHabitDurationForDate, clearHabitDurationForDate, sumDurationMap, clearLiveActivityTimer } from '../src/utils/activityDuration.js';
import {
  buildTodayPayload,
  buildWeeklyReview,
  closeDay,
  saveWeeklyPlan
} from './domain/today.js';

const locationEnum = z.enum(['anywhere', 'office', 'home', 'gym']);
const timeWindowSchema = z.object({
  start: z.string().describe('Início da janela HH:mm'),
  end: z.string().describe('Fim da janela HH:mm')
}).nullable();

/** Rótulo humano do tipo de atividade indicada pelo Oráculo. */
const KIND_TEXT = {
  victory: 'vitória do dia',
  habit: 'ritual',
  quest: 'missão',
  plan_day: 'planejar o dia'
};

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
      priority: z.enum(['dispensavel', 'opcional', 'bom_fazer', 'importante', 'critico']).optional().describe('Filtrar por prioridade (dispensavel → critico)'),
      difficulty: z.enum(['baixa', 'media', 'alta', 'epica']).optional().describe('Filtrar por dificuldade (baixa/média/alta/épica)'),
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
      if (args.difficulty) {
        quests = quests.filter(q => q.difficulty === args.difficulty);
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
      priority: z.enum(['dispensavel', 'opcional', 'bom_fazer', 'importante', 'critico', 'baixa', 'media', 'alta', 'epica']).optional().describe('Prioridade da missão (dispensavel → critico). Valores legados baixa/media/alta/epica são interpretados como Dificuldade.'),
      difficulty: z.enum(['baixa', 'media', 'alta', 'epica']).optional().describe('Dificuldade da missão (define XP e moedas)'),
      dueDate: z.string().optional().describe('Data limite no formato YYYY-MM-DD'),
      dueTime: z.string().optional().describe('Horário limite no formato HH:mm'),
      location: locationEnum.optional().describe('Onde a missão pode ser feita: anywhere, office, home ou gym'),
      timeWindow: timeWindowSchema.optional().describe('Janela de execução (não é prazo). Null = qualquer hora'),
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

      const scale = resolveActivityScale({
        ...(args.priority !== undefined ? { priority: args.priority } : {}),
        ...(args.difficulty !== undefined ? { difficulty: args.difficulty } : {})
      });
      const defaultCategory = db.questCategories?.[0]?.name || 'Geral';
      const newQuest = {
        id: uid('q'),
        title: args.title.trim(),
        description: (args.description || '').trim(),
        category: args.category || defaultCategory,
        priority: scale.priority,
        difficulty: scale.difficulty,
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
      applyDifficultyFields(newQuest, scale.difficulty);
      applyActivityContext(newQuest, { location: args.location, timeWindow: args.timeWindow }, db.questCategories);

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
      priority: z.enum(['dispensavel', 'opcional', 'bom_fazer', 'importante', 'critico', 'baixa', 'media', 'alta', 'epica']).optional().describe('Nova prioridade (dispensavel → critico). Valores legados baixa/media/alta/epica são interpretados como Dificuldade.'),
      difficulty: z.enum(['baixa', 'media', 'alta', 'epica']).optional().describe('Nova dificuldade (define XP e moedas)'),
      dueDate: z.string().nullable().optional().describe('Nova data limite YYYY-MM-DD (ou null para remover)'),
      dueTime: z.string().nullable().optional().describe('Novo horário limite HH:mm (ou null para remover)'),
      location: locationEnum.optional().describe('Novo lugar (anywhere, office, home, gym)'),
      timeWindow: timeWindowSchema.optional().describe('Nova janela de execução (ou null para qualquer hora)'),
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
      if (args.priority !== undefined || args.difficulty !== undefined) {
        const scale = resolveActivityScale({
          ...(args.priority !== undefined ? { priority: args.priority } : {}),
          ...(args.difficulty !== undefined ? { difficulty: args.difficulty } : {})
        }, quest);
        quest.priority = scale.priority;
        applyDifficultyFields(quest, scale.difficulty);
      }
      if (args.dueDate !== undefined) quest.dueDate = args.dueDate;
      if (args.dueTime !== undefined) quest.dueTime = args.dueTime;
      if (args.location !== undefined || args.timeWindow !== undefined) {
        applyActivityContext(quest, { location: args.location, timeWindow: args.timeWindow }, db.questCategories);
      }
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
      completed: z.boolean().optional().describe('Definir explicitamente como concluída (true) ou pendente (false). Se omitido, alterna o estado atual.'),
      durationMinutes: z.number().optional().describe('Tempo cronometrado da missão em minutos (igual às sessões de leitura e baterias de questões)'),
      decisionId: z.string().optional().describe('ID da indicação do Oráculo, se a conclusão veio dela')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainCompleteQuest(db, {
        id: args.id,
        completed: args.completed,
        durationMinutes: args.durationMinutes,
        decisionId: args.decisionId
      });
      if (result.error) return formatError(result.error);
      if (result.stateUnchanged) {
        return formatSuccess({ quest: result.quest, stateUnchanged: true }, `A missão já estava no estado ${result.willComplete ? 'concluída' : 'pendente'}.`);
      }
      saveDb(db);
      return formatSuccess({
        quest: result.quest,
        completed: result.willComplete,
        rewardResult: result.rewardResult,
        linkedVictories: result.linkedVictories
      }, result.willComplete ? `🎉 Missão '${result.quest.title}' concluída! Recompensas concedidas.` : `Missão '${result.quest.title}' desmarcada e recompensas estornadas.`);
    }
  },
  {
    name: 'break_down_quest',
    description: 'Quebrar uma missão em passos curtos. Acrescenta subtarefas sem apagar as existentes. Use quando a missão está procrastinada.',
    schema: {
      id: z.string().describe('ID da missão'),
      steps: z.array(z.string()).describe('Passos, do primeiro ao último (2 a 8)')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainBreakDownQuest(db, args.id, args.steps);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess({ quest: result.quest, added: result.added }, `Missão quebrada em ${result.added.length} passo(s).`);
    }
  },
  {
    name: 'reschedule_quests',
    description: 'Remarcar um lote de missões para outra data. Use na triagem de atrasadas: faça 1 hoje e remarque o resto.',
    schema: {
      ids: z.array(z.string()).describe('IDs das missões a remarcar'),
      dueDate: z.string().nullable().optional().describe('Nova data YYYY-MM-DD, ou null para tirar o prazo')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainRescheduleQuests(db, { ids: args.ids, dueDate: args.dueDate });
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result, `${result.updated.length} missão(ões) remarcada(s).`);
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
      const result = domainDeleteQuest(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.removed, `Missão '${result.removed.title}' excluída com sucesso.`);
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
      icon: z.string().optional().default('FolderGit2').describe('Nome do ícone Lucide'),
      defaultLocation: locationEnum.optional().describe('Lugar padrão das missões desta categoria')
    },
    handler: async (args) => {
      const db = getDb();
      if (!args.name || !args.name.trim()) return formatError('Nome da categoria é obrigatório.');

      const newCategory = {
        id: uid('cat'),
        name: args.name.trim(),
        color: args.color || '#38bdf8',
        icon: args.icon || 'FolderGit2',
        defaultLocation: args.defaultLocation
          ? normalizeLocation(args.defaultLocation)
          : defaultLocationForCategory(args.name.trim()),
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
      icon: z.string().optional().describe('Novo ícone'),
      defaultLocation: locationEnum.optional().describe('Novo lugar padrão da categoria')
    },
    handler: async (args) => {
      const db = getDb();
      const category = (db.questCategories || []).find(c => c.id === args.id);
      if (!category) return formatError(`Categoria '${args.id}' não encontrada.`);

      const oldName = category.name;
      if (args.name !== undefined && args.name.trim()) {
        category.name = args.name.trim();
        applyCategoryRename(db, oldName, category.name);
      }
      if (args.color !== undefined) category.color = args.color;
      if (args.icon !== undefined) category.icon = args.icon;
      if (args.defaultLocation !== undefined) {
        category.defaultLocation = args.defaultLocation
          ? normalizeLocation(args.defaultLocation)
          : defaultLocationForCategory(category.name);
      }

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
      const fallbackCat = db.questCategories.length > 0 ? db.questCategories[0].name : 'Geral';
      applyCategoryRename(db, removed.name, fallbackCat);
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
      const result = domainDeleteBook(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.removed, `Livro '${result.removed.title}' excluído com sucesso.`);
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
      const result = domainAddQuote(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess({ quote: result.quote, rewardResult: result.rewardResult }, `Citação adicionada a '${result.book.title}' com sucesso! (+20 XP, +10 Sabedoria)`);
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
      const result = domainDeleteQuote(db, { bookId: args.bookId, quoteId: args.quoteId });
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.removed, 'Citação removida e recompensas estornadas com sucesso.');
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
      date: z.string().optional().describe('Data da sessão YYYY-MM-DD'),
      decisionId: z.string().optional().describe('ID da indicação do Oráculo')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainLogReadingSession(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      const pages = result.session.pagesRead;
      return formatSuccess({
        session: result.session,
        book: result.book,
        finishedBook: result.finishedBook,
        rewardResult: result.rewardResult,
        linkedVictories: result.linkedVictories
      }, `📖 Sessão de leitura registrada! +${pages} páginas lidas (+${result.session.xpEarned} XP, +${result.session.wisdomEarned} Sabedoria, +${result.session.coinsEarned} Moedas).`);
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
      const result = domainDeleteReadingSession(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess({ removed: result.removed, book: result.book, linkedVictories: result.linkedVictories }, 'Sessão de leitura excluída e progresso estornado com sucesso.');
    }
  },

  // ==========================================
  // 4.1. ESCRITURAS (BÍBLIA) — tempo independente da Biblioteca
  // ==========================================
  {
    name: 'list_scripture',
    description: 'Listar o cânone, o progresso de leitura da Bíblia, as sessões, citações e reflexões. O tempo não entra na Biblioteca.',
    schema: {
      bookId: z.string().optional().describe('Filtrar por livro (ex: jo, sl, gn)')
    },
    handler: async (args) => {
      const db = getDb();
      const bookId = args.bookId || null;
      const sessions = (db.scriptureSessions || []).filter(item => !bookId || item.startBookId === bookId || item.endBookId === bookId);
      const quotes = (db.scriptureQuotes || []).filter(item => !bookId || item.bookId === bookId);
      const reflections = (db.scriptureReflections || []).filter(item => !bookId || item.bookId === bookId);
      return formatSuccess({
        canon: bibleTotals(),
        translation: 'Almeida (cânone protestante)',
        books: BIBLE_BOOKS.map(book => ({
          id: book.id,
          name: book.name,
          abbr: book.abbr,
          testament: book.testament,
          chapters: book.chapters.length,
          progress: (db.scriptureProgress || {})[book.id] || null
        })),
        sessions,
        quotes,
        reflections
      }, 'Leitura da Bíblia.');
    }
  },
  {
    name: 'log_scripture_session',
    description: 'Registrar uma sessão de leitura da Bíblia (livro, capítulo e versículo). Concede XP, moedas e Sabedoria. Não altera o tempo da Biblioteca.',
    schema: {
      startBookId: z.string().describe('Livro inicial (id do cânone, ex: jo)'),
      startChapter: z.number().describe('Capítulo inicial'),
      startVerse: z.number().describe('Versículo inicial'),
      endBookId: z.string().describe('Livro final'),
      endChapter: z.number().describe('Capítulo final'),
      endVerse: z.number().describe('Versículo final'),
      durationMinutes: z.number().optional().describe('Duração em minutos'),
      notes: z.string().optional().describe('Notas da sessão'),
      reflection: z.string().optional().describe('Reflexão pessoal sobre o trecho'),
      date: z.string().optional().describe('Data YYYY-MM-DD'),
      quotes: z.array(z.object({
        bookId: z.string().optional(),
        chapter: z.number().optional(),
        verse: z.number().optional(),
        quote: z.string(),
        note: z.string().optional()
      })).optional().describe('Citações coletadas na sessão')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainLogScriptureSession(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result, `Sessão da Escritura registrada (+${result.session.xpEarned} XP).`);
    }
  },
  {
    name: 'delete_scripture_session',
    description: 'Excluir uma sessão de leitura da Bíblia e estornar as recompensas.',
    schema: { id: z.string().describe('ID da sessão') },
    handler: async (args) => {
      const db = getDb();
      const result = domainDeleteScriptureSession(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.removed, 'Sessão da Escritura excluída e recompensas estornadas.');
    }
  },
  {
    name: 'add_scripture_quote',
    description: 'Adicionar uma citação bíblica com referência (livro, capítulo, versículo) e reflexão opcional.',
    schema: {
      bookId: z.string().describe('ID do livro (ex: jo)'),
      chapter: z.number(),
      verse: z.number(),
      quote: z.string().describe('Texto da citação'),
      note: z.string().optional().describe('Reflexão ou anotação')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainAddScriptureQuote(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      const book = getBibleBook(result.quote.bookId);
      return formatSuccess(result, `Citação salva: ${formatReference(book, result.quote.chapter, result.quote.verse)}.`);
    }
  },
  {
    name: 'delete_scripture_quote',
    description: 'Remover uma citação bíblica e estornar a recompensa avulsa, se houver.',
    schema: { id: z.string().describe('ID da citação') },
    handler: async (args) => {
      const db = getDb();
      const result = domainDeleteScriptureQuote(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.removed, 'Citação bíblica removida.');
    }
  },
  {
    name: 'add_scripture_reflection',
    description: 'Escrever uma reflexão pessoal sobre um versículo, sem conceder recompensa extra.',
    schema: {
      bookId: z.string(),
      chapter: z.number(),
      verse: z.number(),
      text: z.string().describe('Texto da reflexão'),
      date: z.string().optional()
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainAddScriptureReflection(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.reflection, 'Reflexão registrada.');
    }
  },
  {
    name: 'delete_scripture_reflection',
    description: 'Excluir uma reflexão da Escritura.',
    schema: { id: z.string() },
    handler: async (args) => {
      const db = getDb();
      const result = domainDeleteScriptureReflection(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.removed, 'Reflexão excluída.');
    }
  },

  // ==========================================
  // 5. PROCESSOS EM LOTE - CRUD
  // ==========================================
  {
    name: 'list_processes',
    description: 'Listar processos da Linha de Operações (processos em lote).',
    schema: {
      status: z.enum(['active', 'in_progress', 'completed', 'all']).optional().describe('Status dos processos (active é alias de in_progress)'),
      category: z.string().optional().describe('Filtrar por categoria')
    },
    handler: async (args) => {
      const db = getDb();
      let processes = [...(db.processes || [])];
      if (args.status && args.status !== 'all') {
        const wanted = args.status === 'active' ? 'in_progress' : args.status;
        processes = processes.filter(p => p.status === wanted || (args.status === 'active' && p.status === 'active'));
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
      category: z.string().optional().describe('Categoria do processo')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainCreateProcess(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.process, `Processo em lote '${result.process.title}' criado com sucesso.`);
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
      const result = domainStepProcess(db, args.id, args);
      if (result.error) {
        if (result.error.includes('totalmente concluído')) {
          const process = (db.processes || []).find(p => p.id === args.id);
          return formatSuccess({ process, unchanged: true }, 'O processo já atingiu 100% das etapas.');
        }
        return formatError(result.error);
      }
      saveDb(db);
      return formatSuccess({
        process: result.process,
        historyEntry: result.historyEntry,
        finished: result.finished,
        rewardResult: result.rewardResult
      }, `⚡ +${result.step.unitsAdded} ${result.process.unitName} concluído(s)! (+${result.step.xpEarned} XP, +${result.rewardResult?.logEntry?.focus || result.step.unitsAdded * 10} Foco, +${result.step.coinsEarned} Moedas).`);
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
      const result = domainUpdateProcess(db, args.id, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.process, `Processo '${result.process.title}' atualizado com sucesso.`);
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
      const result = domainDeleteProcess(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.removed, `Processo '${result.removed.title}' excluído.`);
    }
  },

  // ==========================================
  // 6. RITUAIS DIÁRIOS & HÁBITOS - CRUD (COM NOVAS FREQUÊNCIAS)
  // ==========================================
  {
    name: 'list_habits',
    description: 'Listar todos os rituais/hábitos diários com status de conclusão de hoje, sequências (streaks) e métricas semanais calculadas de acordo com sua frequência (daily, weekdays, weekly, times_per_week, fortnightly, monthly).',
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
          weekDays: h.weekDays || null,
          monthDays: h.monthDays || null,
          completionsThisWeek: weeklyStats.completionsThisWeek,
          isGoalMet: weeklyStats.isGoalMet,
          period: weeklyStats.period || null,
          completedToday,
          currentStreak: h.currentStreak || 0,
          bestStreak: h.bestStreak || 0,
          priority: h.priority || DEFAULT_PRIORITY,
          difficulty: h.difficulty || DEFAULT_DIFFICULTY,
          xpReward: h.xpReward || 30,
          coinReward: h.coinReward || 8,
          location: h.location || 'anywhere',
          timeWindow: h.timeWindow || null,
          durationsByDate: h.durationsByDate || {},
          totalDurationMinutes: sumDurationMap(h.durationsByDate),
          createdAt: h.createdAt
        };
      });

      return formatSuccess({ total: habits.length, habits }, `${habits.length} rituais listados.`);
    }
  },
  {
    name: 'create_habit',
    description: 'Criar um novo ritual diário/hábito com suporte a 6 frequências: daily (Diário), weekdays (Seg-Sex), weekly (Semanal, com dia previsto opcional), times_per_week (N vezes por semana, com dias previstos opcionais), fortnightly (1x por quinzena, com 2 dias do mês) e monthly (1x por mês, com 1 dia do mês).',
    schema: {
      title: z.string().describe('Nome do ritual (ex: Meditar 10 min, Exercício Físico)'),
      description: z.string().optional().describe('Descrição ou instrução do ritual'),
      category: z.string().optional().default('Pessoal').describe('Categoria'),
      icon: z.string().optional().default('Flame').describe('Ícone Lucide (ex: Flame, Dumbbell, Book, Sun)'),
      frequency: z.enum(['daily', 'weekdays', 'weekly', 'times_per_week', 'fortnightly', 'monthly']).optional().default('daily').describe('Frequência do hábito'),
      targetTimesPerWeek: z.number().min(1).max(7).optional().describe('Meta de vezes por semana (usado quando frequency for times_per_week e weekDays não for informado)'),
      weekDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional().describe('Dias previstos da semana (0=Dom … 6=Sáb). times_per_week e weekly. Ex: [1, 3, 5] = Seg, Qua, Sex. Define também a meta quando informado.'),
      monthDays: z.array(z.number().min(1).max(31)).min(1).max(2).optional().describe('Dias do mês em que o ritual fica pendente. fortnightly: 2 dias (ex: [1, 16]); monthly: 1 dia (ex: [1])'),
      monthDay: z.number().min(1).max(31).optional().describe('Dia do mês (atalho para monthly; também aceito como primeiro dia de fortnightly)'),
      priority: z.enum(['dispensavel', 'opcional', 'bom_fazer', 'importante', 'critico']).optional().describe('Prioridade do ritual (dispensavel → critico)'),
      difficulty: z.enum(['baixa', 'media', 'alta', 'epica']).optional().describe('Dificuldade do ritual (define XP e moedas)'),
      xpReward: z.number().optional().describe('XP concedido por execução (legado; preferir difficulty)'),
      coinReward: z.number().optional().describe('Moedas concedidas por execução (legado; preferir difficulty)'),
      location: locationEnum.optional().describe('Onde o ritual pode ser feito: anywhere, office, home ou gym'),
      timeWindow: timeWindowSchema.optional().describe('Janela de execução (não é prazo). Null = qualquer hora')
    },
    handler: async (args) => {
      const db = getDb();
      if (!args.title || !args.title.trim()) return formatError('Título do hábito é obrigatório.');

      const scale = resolveActivityScale({
        ...(args.priority !== undefined ? { priority: args.priority } : {}),
        ...(args.difficulty !== undefined ? { difficulty: args.difficulty } : {})
      });
      const newHabit = {
        id: uid('h'),
        title: args.title.trim(),
        description: (args.description || '').trim(),
        category: (args.category || 'Pessoal').trim(),
        icon: args.icon || 'Flame',
        currentStreak: 0,
        bestStreak: 0,
        history: [],
        priority: scale.priority,
        difficulty: scale.difficulty,
        createdAt: new Date().toISOString()
      };
      applyHabitFrequency(newHabit, {
        frequency: args.frequency,
        targetTimesPerWeek: args.targetTimesPerWeek,
        weekDays: args.weekDays,
        monthDays: args.monthDays,
        monthDay: args.monthDay
      });
      applyDifficultyFields(newHabit, scale.difficulty);
      if (args.difficulty === undefined) {
        if (args.xpReward !== undefined) newHabit.xpReward = parseInt(args.xpReward, 10) || 30;
        if (args.coinReward !== undefined) newHabit.coinReward = parseInt(args.coinReward, 10) || 8;
      }
      applyActivityContext(newHabit, { location: args.location, timeWindow: args.timeWindow }, db.questCategories);

      if (!db.habits) db.habits = [];
      db.habits.unshift(newHabit);
      saveDb(db);
      return formatSuccess(newHabit, `Ritual '${newHabit.title}' criado com sucesso (${newHabit.frequency}).`);
    }
  },
  {
    name: 'toggle_habit',
    description: 'Marcar ou desmarcar a execução de um ritual diário para hoje (ou para uma data específica YYYY-MM-DD no passado). Concede/estorna XP, Moedas, Consistência e atualiza a sequência de chamas.',
    schema: {
      id: z.string().describe('ID do ritual/hábito'),
      date: z.string().optional().describe('Data da execução YYYY-MM-DD (se omitido, usa a data atual)'),
      durationMinutes: z.number().optional().describe('Tempo cronometrado do ritual em minutos (igual às sessões de leitura e baterias de questões)')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainToggleHabit(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      const todayStr = getSaoPauloDateStr();
      const weeklyStats = getHabitWeeklyStats(result.habit, todayStr);
      const dateParts = result.targetDate.split('-');
      const formattedDate = result.targetDate === todayStr ? 'hoje' : `em ${dateParts[2]}/${dateParts[1]}`;
      return formatSuccess({
        habit: {
          ...result.habit,
          weeklyStats,
          completedToday: result.doneToday
        },
        targetDate: result.targetDate,
        action: result.done ? 'completed' : 'uncompleted',
        rewardResult: result.rewardResult
      }, result.done
        ? `🔥 Ritual '${result.habit.title}' marcado para ${formattedDate}! Sequência: ${result.habit.currentStreak} dias.`
        : `Ritual '${result.habit.title}' desmarcado para ${formattedDate} e recompensas estornadas.`);
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
      frequency: z.enum(['daily', 'weekdays', 'weekly', 'times_per_week', 'fortnightly', 'monthly']).optional().describe('Nova frequência'),
      targetTimesPerWeek: z.number().min(1).max(7).optional().describe('Nova meta de vezes por semana'),
      weekDays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional().describe('Novos dias previstos da semana (0=Dom … 6=Sáb). Null ou [] remove a agenda rígida'),
      monthDays: z.array(z.number().min(1).max(31)).min(1).max(2).optional().describe('Novos dias do mês (fortnightly: 2 dias; monthly: 1 dia)'),
      monthDay: z.number().min(1).max(31).optional().describe('Novo dia do mês (atalho para monthly)'),
      priority: z.enum(['dispensavel', 'opcional', 'bom_fazer', 'importante', 'critico']).optional().describe('Nova prioridade (dispensavel → critico)'),
      difficulty: z.enum(['baixa', 'media', 'alta', 'epica']).optional().describe('Nova dificuldade (define XP e moedas)'),
      xpReward: z.number().optional().describe('Novo XP (legado; preferir difficulty)'),
      coinReward: z.number().optional().describe('Novas moedas (legado; preferir difficulty)'),
      location: locationEnum.optional().describe('Novo lugar (anywhere, office, home, gym)'),
      timeWindow: timeWindowSchema.optional().describe('Nova janela de execução (ou null para qualquer hora)')
    },
    handler: async (args) => {
      const db = getDb();
      const habit = (db.habits || []).find(h => h.id === args.id);
      if (!habit) return formatError(`Ritual '${args.id}' não encontrado.`);

      if (args.title !== undefined) habit.title = args.title.trim();
      if (args.description !== undefined) habit.description = args.description.trim();
      if (args.category !== undefined) habit.category = args.category.trim();
      if (args.icon !== undefined) habit.icon = args.icon;

      applyHabitFrequency(habit, {
        frequency: args.frequency,
        targetTimesPerWeek: args.targetTimesPerWeek,
        weekDays: args.weekDays,
        monthDays: args.monthDays,
        monthDay: args.monthDay
      }, { isUpdate: true });

      if (args.priority !== undefined || args.difficulty !== undefined) {
        const scale = resolveActivityScale({
          ...(args.priority !== undefined ? { priority: args.priority } : {}),
          ...(args.difficulty !== undefined ? { difficulty: args.difficulty } : {})
        }, habit);
        habit.priority = scale.priority;
        applyDifficultyFields(habit, scale.difficulty);
      } else {
        if (args.xpReward !== undefined) habit.xpReward = parseInt(args.xpReward, 10) || 30;
        if (args.coinReward !== undefined) habit.coinReward = parseInt(args.coinReward, 10) || 8;
      }
      if (args.location !== undefined || args.timeWindow !== undefined) {
        applyActivityContext(habit, { location: args.location, timeWindow: args.timeWindow }, db.questCategories);
      }

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
      const result = domainDeleteHabit(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.removed, `Ritual '${result.removed.title}' excluído.`);
    }
  },

  // ==========================================
  // 6.4. SUPLEMENTOS
  // ==========================================
  {
    name: 'list_supplements',
    description: 'Listar suplementos cadastrados e, opcionalmente, os registros de consumo (data, hora e quantidade).',
    schema: {
      search: z.string().optional().describe('Buscar no nome do suplemento'),
      includeArchived: z.boolean().optional().describe('Incluir suplementos arquivados'),
      includeLogs: z.boolean().optional().describe('Incluir registros de consumo'),
      supplementId: z.string().optional().describe('Filtrar registros por ID do suplemento'),
      date: z.string().optional().describe('Filtrar registros por data YYYY-MM-DD'),
      limit: z.number().optional().describe('Limite de registros de consumo')
    },
    handler: async (args) => {
      const db = getDb();
      const search = (args.search || '').toLowerCase().trim();
      let supplements = [...(db.supplements || [])];
      if (!args.includeArchived) supplements = supplements.filter(item => !item.archived);
      if (search) supplements = supplements.filter(item => (item.name || '').toLowerCase().includes(search));
      let logs = [];
      if (args.includeLogs) {
        logs = [...(db.supplementLogs || [])];
        if (args.supplementId) logs = logs.filter(log => log.supplementId === args.supplementId);
        if (args.date) logs = logs.filter(log => log.date === args.date);
        logs.sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
        if (args.limit && args.limit > 0) logs = logs.slice(0, args.limit);
      }
      return formatSuccess(
        { total: supplements.length, supplements, ...(args.includeLogs ? { logs } : {}) },
        `${supplements.length} suplemento(s) listado(s).`
      );
    }
  },
  {
    name: 'create_supplement',
    description: 'Cadastrar um suplemento (ex: Omega 3, Creatina) com unidade e dose usual.',
    schema: {
      name: z.string().describe('Nome do suplemento'),
      unit: z.string().optional().describe('Unidade da dose (cápsula, g, ml, dose)'),
      defaultDose: z.number().optional().describe('Dose usual, usada como sugestão ao registrar'),
      notes: z.string().optional().describe('Marca, horário sugerido ou observação')
    },
    handler: async (args) => {
      const db = getDb();
      const result = createSupplement(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.supplement, `Suplemento '${result.supplement.name}' cadastrado.`);
    }
  },
  {
    name: 'update_supplement',
    description: 'Editar nome, unidade, dose usual, notas ou arquivar um suplemento.',
    schema: {
      id: z.string().describe('ID do suplemento'),
      name: z.string().optional().describe('Novo nome'),
      unit: z.string().optional().describe('Nova unidade'),
      defaultDose: z.number().nullable().optional().describe('Nova dose usual, ou null para limpar'),
      notes: z.string().optional().describe('Novas notas'),
      archived: z.boolean().optional().describe('Arquivar (true) ou reativar (false)')
    },
    handler: async (args) => {
      const db = getDb();
      const { id, ...patch } = args;
      const result = updateSupplement(db, id, patch);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.supplement, `Suplemento '${result.supplement.name}' atualizado.`);
    }
  },
  {
    name: 'delete_supplement',
    description: 'Excluir um suplemento e todos os registros de consumo dele.',
    schema: {
      id: z.string().describe('ID do suplemento')
    },
    handler: async (args) => {
      const db = getDb();
      const result = deleteSupplement(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(
        { removed: result.removed, removedLogs: result.removedLogs.length },
        `Suplemento '${result.removed.name}' excluído com ${result.removedLogs.length} registro(s).`
      );
    }
  },
  {
    name: 'log_supplement_intake',
    description: 'Registrar que um suplemento já cadastrado foi tomado, com data, hora e quantidade.',
    schema: {
      supplementId: z.string().describe('ID do suplemento cadastrado'),
      amount: z.number().describe('Quantidade tomada'),
      date: z.string().describe('Data YYYY-MM-DD'),
      time: z.string().describe('Hora HH:mm, no fuso de São Paulo'),
      notes: z.string().optional().describe('Nota da tomada')
    },
    handler: async (args) => {
      const db = getDb();
      const result = logSupplementIntake(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.log, `Consumo de '${result.supplement.name}' registrado.`);
    }
  },
  {
    name: 'update_supplement_log',
    description: 'Editar data, hora, quantidade, suplemento ou nota de um registro de consumo.',
    schema: {
      id: z.string().describe('ID do registro'),
      supplementId: z.string().optional().describe('Novo suplemento'),
      amount: z.number().optional().describe('Nova quantidade'),
      date: z.string().optional().describe('Nova data YYYY-MM-DD'),
      time: z.string().optional().describe('Nova hora HH:mm'),
      notes: z.string().optional().describe('Nova nota')
    },
    handler: async (args) => {
      const db = getDb();
      const { id, ...patch } = args;
      const result = updateSupplementLog(db, id, patch);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.log, 'Registro de consumo atualizado.');
    }
  },
  {
    name: 'delete_supplement_log',
    description: 'Excluir um registro de consumo de suplemento.',
    schema: {
      id: z.string().describe('ID do registro')
    },
    handler: async (args) => {
      const db = getDb();
      const result = deleteSupplementLog(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.removed, 'Registro de consumo excluído.');
    }
  },

  // ==========================================
  // 6.5. MAPAS MENTAIS
  // ==========================================
  {
    name: 'list_mind_maps',
    description: 'Listar mapas mentais da Cartografia do Conhecimento, com contagem de ramos e revisões vencidas.',
    schema: {
      search: z.string().optional().describe('Buscar no título, descrição ou ramos'),
      categoryId: z.string().optional().describe('Filtrar por assunto ou subassunto')
    },
    handler: async (args) => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      let maps = sanitizeMindMaps(db.mindMaps).map(m => ({
        ...m,
        stats: computeMapStats(m, { today: todayStr })
      }));
      if (args.categoryId) {
        const cats = sanitizeMindMapCategories(db.mindMapCategories);
        const childIds = cats.filter(c => c.parentId === args.categoryId).map(c => c.id);
        const allowed = new Set([args.categoryId, ...childIds]);
        maps = maps.filter(m => allowed.has(m.categoryId));
      }
      if (args.search) {
        const q = args.search.toLowerCase();
        maps = maps.filter(m =>
          m.title.toLowerCase().includes(q)
          || (m.description || '').toLowerCase().includes(q)
          || (m.nodes || []).some(n => (n.label || '').toLowerCase().includes(q))
        );
      }
      return formatSuccess({ total: maps.length, mindMaps: maps }, `${maps.length} mapas mentais encontrados.`);
    }
  },
  {
    name: 'get_mind_map',
    description: 'Obter um mapa mental completo, incluindo ramos, anotações e fila de estudo.',
    schema: {
      id: z.string().describe('ID do mapa mental')
    },
    handler: async (args) => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      const map = sanitizeMindMaps(db.mindMaps).find(m => m.id === args.id);
      if (!map) return formatError(`Mapa mental '${args.id}' não encontrado.`);
      return formatSuccess({
        mindMap: { ...map, stats: computeMapStats(map, { today: todayStr }) },
        studyQueue: getStudyQueue(map, { today: todayStr, mode: 'branches' })
      }, 'Mapa mental carregado.');
    }
  },
  {
    name: 'create_mind_map',
    description: 'Criar um novo mapa mental com um núcleo (ideia central) para ramificar depois.',
    schema: {
      title: z.string().describe('Título / núcleo do mapa'),
      description: z.string().optional().describe('Descrição ou contexto'),
      category: z.string().optional().describe('Nome do assunto (legado)'),
      categoryId: z.string().optional().describe('ID do assunto ou subassunto'),
      color: z.string().optional().describe('Cor hex do núcleo'),
      rootLabel: z.string().optional().describe('Rótulo do núcleo, se diferente do título')
    },
    handler: async (args) => {
      try {
        const db = getDb();
        db.mindMaps = sanitizeMindMaps(db.mindMaps);
        db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
        const cat = args.categoryId
          ? db.mindMapCategories.find(c => c.id === args.categoryId)
          : db.mindMapCategories.find(c => c.name.toLowerCase() === String(args.category || '').toLowerCase());
        const map = createMindMap({
          ...args,
          category: cat?.name || args.category,
          categoryId: cat?.id || args.categoryId || null,
          color: args.color || cat?.color
        });
        db.mindMaps.unshift(map);
        saveDb(db);
        return formatSuccess(map, `Mapa mental '${map.title}' criado.`);
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'update_mind_map',
    description: 'Atualizar título, descrição, categoria, estilo das linhas, escala de fonte pelo núcleo ou reorganizar o layout de um mapa mental.',
    schema: {
      id: z.string().describe('ID do mapa'),
      title: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      categoryId: z.string().optional().describe('ID do assunto ou subassunto'),
      color: z.string().optional(),
      rootLabel: z.string().optional(),
      lineStyle: z.enum(['curve', 'taper']).optional().describe('curve = linhas, taper = galhos que afinam'),
      scaleFontByDepth: z.boolean().optional().describe('Se true, a fonte fica maior perto do núcleo e menor nas pontas'),
      fillHideableNodeIds: z.array(z.string()).nullable().optional().describe('IDs dos nós que podem ser ocultados no modo Preencher Mapa. Null = qualquer nó'),
      layout: z.boolean().optional().describe('Se true, reorganiza automaticamente os ramos')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.id);
      if (index === -1) return formatError(`Mapa mental '${args.id}' não encontrado.`);
      try {
        let next = updateMindMapMeta(db.mindMaps[index], args);
        if (args.layout) next = layoutMindMap(next);
        db.mindMaps[index] = next;
        saveDb(db);
        return formatSuccess(next, `Mapa '${next.title}' atualizado.`);
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'add_mind_map_node',
    description: 'Adicionar um ramo (ideia filha) a um mapa mental existente.',
    schema: {
      mapId: z.string().describe('ID do mapa'),
      parentId: z.string().optional().describe('ID do ramo pai (omitido = núcleo)'),
      label: z.string().describe('Texto do ramo'),
      notes: z.string().optional().describe('Anotação de estudo'),
      color: z.string().optional(),
      icon: z.string().optional().describe('Nome do ícone Lucide (ex: Scale, BookOpen, Heart)'),
      imageUrl: z.string().optional().describe('URL ou data URI de uma imagem no ramo')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.mapId);
      if (index === -1) return formatError(`Mapa mental '${args.mapId}' não encontrado.`);
      try {
        const next = addMindMapNode(db.mindMaps[index], args);
        db.mindMaps[index] = next;
        const added = (next.nodes || []).find(n => n.imageUrl && args.imageUrl && n.imageUrl === args.imageUrl);
        if (added?.imageUrl) {
          db.mindMapImages = rememberMindMapImage(db.mindMapImages, added.imageUrl, {
            label: added.label,
            mapTitle: next.title
          });
        }
        saveDb(db);
        return formatSuccess(next, `Ramo '${args.label}' adicionado.`);
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'update_mind_map_node',
    description: 'Atualizar o texto, anotação, cor, ícone, imagem, tamanho da fonte, curva do galho ou posição de um ramo.',
    schema: {
      mapId: z.string().describe('ID do mapa'),
      nodeId: z.string().describe('ID do ramo'),
      label: z.string().optional(),
      notes: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().optional().describe('Nome do ícone Lucide (vazio para remover)'),
      imageUrl: z.string().optional().describe('URL ou data URI da imagem (vazio para remover)'),
      collapsed: z.boolean().optional(),
      fontSize: z.number().optional().describe('Tamanho da fonte do ramo em pixels (10 a 32)'),
      curve: z.object({
        from: z.object({ side: z.enum(['left', 'right', 'top', 'bottom']), t: z.number().optional() }).optional(),
        to: z.object({ side: z.enum(['left', 'right', 'top', 'bottom']), t: z.number().optional() }).optional(),
        points: z.array(z.object({ x: z.number(), y: z.number() })).optional()
      }).nullable().optional().describe('Âncoras e pontos de rota do galho (null restaura a curva natural)')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.mapId);
      if (index === -1) return formatError(`Mapa mental '${args.mapId}' não encontrado.`);
      try {
        const next = updateMindMapNode(db.mindMaps[index], args.nodeId, args);
        db.mindMaps[index] = next;
        if (args.imageUrl) {
          const node = (next.nodes || []).find(n => n.id === args.nodeId && n.imageUrl);
          if (node?.imageUrl) {
            db.mindMapImages = rememberMindMapImage(db.mindMapImages, node.imageUrl, {
              label: node.label,
              mapTitle: next.title
            });
          }
        }
        saveDb(db);
        return formatSuccess(next, 'Ramo atualizado.');
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'update_mind_map_nodes',
    description: 'Atualizar a aparência de vários ramos de uma vez (cor, ícone, imagem, tamanho da fonte).',
    schema: {
      mapId: z.string().describe('ID do mapa'),
      nodeIds: z.array(z.string()).describe('IDs dos ramos a atualizar'),
      color: z.string().optional(),
      icon: z.string().optional().describe('Nome do ícone Lucide (vazio para remover)'),
      imageUrl: z.string().optional().describe('URL ou data URI da imagem (vazio para remover)'),
      collapsed: z.boolean().optional(),
      fontSize: z.number().optional().describe('Tamanho da fonte do ramo em pixels (10 a 32)'),
      fontSizeDelta: z.number().optional().describe('Ajuste relativo da fonte em pixels (ex: 1 ou -1)')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.mapId);
      if (index === -1) return formatError(`Mapa mental '${args.mapId}' não encontrado.`);
      try {
        const next = updateMindMapNodes(db.mindMaps[index], args.nodeIds, args);
        db.mindMaps[index] = next;
        if (args.imageUrl) {
          const ids = new Set(args.nodeIds || []);
          const node = (next.nodes || []).find(n => ids.has(n.id) && n.imageUrl);
          if (node?.imageUrl) {
            db.mindMapImages = rememberMindMapImage(db.mindMapImages, node.imageUrl, {
              label: node.label,
              mapTitle: next.title
            });
          }
        }
        saveDb(db);
        return formatSuccess(next, `${args.nodeIds.length} ramos atualizados.`);
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'add_mind_map_brace',
    description: 'Criar uma chave } que engloba dois ou mais ramos e aponta para um rótulo (ex.: A e E são Mamíferos).',
    schema: {
      mapId: z.string().describe('ID do mapa'),
      nodeIds: z.array(z.string()).describe('IDs dos ramos englobados pela chave'),
      label: z.string().optional().describe('Rótulo na ponta da chave'),
      color: z.string().optional().describe('Cor hex da chave'),
      side: z.enum(['left', 'right']).optional().describe('Lado da chave em relação aos ramos')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.mapId);
      if (index === -1) return formatError(`Mapa mental '${args.mapId}' não encontrado.`);
      try {
        const next = addMindMapBrace(db.mindMaps[index], args);
        db.mindMaps[index] = next;
        saveDb(db);
        return formatSuccess(next, 'Chave criada englobando os ramos.');
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'update_mind_map_brace',
    description: 'Atualizar o rótulo, a cor, o lado ou os ramos de uma chave do mapa mental.',
    schema: {
      mapId: z.string().describe('ID do mapa'),
      braceId: z.string().describe('ID da chave'),
      nodeIds: z.array(z.string()).optional(),
      label: z.string().optional(),
      color: z.string().optional(),
      side: z.enum(['left', 'right']).optional()
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.mapId);
      if (index === -1) return formatError(`Mapa mental '${args.mapId}' não encontrado.`);
      try {
        const next = updateMindMapBrace(db.mindMaps[index], args.braceId, args);
        db.mindMaps[index] = next;
        saveDb(db);
        return formatSuccess(next, 'Chave atualizada.');
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'delete_mind_map_brace',
    description: 'Remover uma chave que engloba ramos do mapa mental.',
    schema: {
      mapId: z.string().describe('ID do mapa'),
      braceId: z.string().describe('ID da chave')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.mapId);
      if (index === -1) return formatError(`Mapa mental '${args.mapId}' não encontrado.`);
      try {
        const next = deleteMindMapBrace(db.mindMaps[index], args.braceId);
        db.mindMaps[index] = next;
        saveDb(db);
        return formatSuccess(next, 'Chave removida.');
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'add_mind_map_link',
    description: 'Criar uma ligação extra entre dois ramos escolhidos (não substitui o galho pai-filho). Pode ter rótulo e ícone.',
    schema: {
      mapId: z.string().describe('ID do mapa'),
      fromId: z.string().describe('ID do primeiro ramo'),
      toId: z.string().describe('ID do segundo ramo'),
      label: z.string().optional().describe('Rótulo da ligação (ex: causa, vs., exceção)'),
      icon: z.string().optional().describe('Nome do ícone Lucide no rótulo'),
      color: z.string().optional().describe('Cor hex da linha')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.mapId);
      if (index === -1) return formatError(`Mapa mental '${args.mapId}' não encontrado.`);
      try {
        const next = addMindMapCrossLink(db.mindMaps[index], args);
        db.mindMaps[index] = next;
        saveDb(db);
        return formatSuccess(next, 'Ligação criada entre os ramos.');
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'update_mind_map_link',
    description: 'Atualizar rótulo, ícone ou cor de uma ligação extra entre ramos.',
    schema: {
      mapId: z.string().describe('ID do mapa'),
      linkId: z.string().describe('ID da ligação'),
      label: z.string().optional(),
      icon: z.string().optional(),
      color: z.string().optional()
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.mapId);
      if (index === -1) return formatError(`Mapa mental '${args.mapId}' não encontrado.`);
      try {
        const next = updateMindMapCrossLink(db.mindMaps[index], args.linkId, args);
        db.mindMaps[index] = next;
        saveDb(db);
        return formatSuccess(next, 'Ligação atualizada.');
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'delete_mind_map_link',
    description: 'Remover uma ligação extra entre ramos.',
    schema: {
      mapId: z.string().describe('ID do mapa'),
      linkId: z.string().describe('ID da ligação')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.mapId);
      if (index === -1) return formatError(`Mapa mental '${args.mapId}' não encontrado.`);
      try {
        const next = deleteMindMapCrossLink(db.mindMaps[index], args.linkId);
        db.mindMaps[index] = next;
        saveDb(db);
        return formatSuccess(next, 'Ligação removida.');
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'delete_mind_map_node',
    description: 'Excluir um ramo e todos os descendentes. O núcleo não pode ser excluído.',
    schema: {
      mapId: z.string().describe('ID do mapa'),
      nodeId: z.string().describe('ID do ramo')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      const index = db.mindMaps.findIndex(m => m.id === args.mapId);
      if (index === -1) return formatError(`Mapa mental '${args.mapId}' não encontrado.`);
      try {
        const next = deleteMindMapNode(db.mindMaps[index], args.nodeId);
        db.mindMaps[index] = next;
        saveDb(db);
        return formatSuccess(next, 'Ramo excluído.');
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'study_mind_map',
    description: 'Registrar uma sessão de estudo de um mapa mental (revisão espaçada). Concede XP, Sabedoria e Moedas.',
    schema: {
      id: z.string().describe('ID do mapa'),
      reviews: z.array(z.object({
        nodeId: z.string().describe('ID do ramo revisado'),
        quality: z.number().describe('0 esqueci, 1 difícil, 2 bom, 3 fácil')
      })).describe('Avaliações dos ramos'),
      durationMinutes: z.number().optional().describe('Duração da sessão em minutos'),
      mode: z.enum(['branches', 'cards', 'fill']).optional().describe('Modo de estudo: ramos, cartões ou preencher mapa'),
      decisionId: z.string().optional().describe('ID da indicação do Oráculo')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      db.mindMapSessions = sanitizeMindMapSessions(db.mindMapSessions);
      const index = db.mindMaps.findIndex(m => m.id === args.id);
      if (index === -1) return formatError(`Mapa mental '${args.id}' não encontrado.`);
      try {
        const todayStr = getSaoPauloDateStr();
        const result = applyStudySession(db.mindMaps[index], args.reviews, {
          today: todayStr,
          durationMinutes: args.durationMinutes,
          mode: args.mode
        });
        db.mindMaps[index] = result.map;
        db.mindMapSessions.unshift(result.session);
        markDecisionCompleted(db, { decisionId: args.decisionId, entityId: result.map.id, kind: 'mindmap', completionKind: 'study' });
        const rewardResult = rewardPlayer({
          xp: result.rewards.xp,
          coins: result.rewards.coins,
          wisdom: result.rewards.wisdom,
          focus: result.rewards.focus,
          actionType: 'mind_map_study',
          entityId: result.session.id,
          title: `${result.map.title}: ${result.session.recalled}/${result.session.reviewed} ramos (${result.session.accuracy}%)`,
          details: {
            category: result.map.category || 'Estudos',
            mapId: result.map.id,
            sessionId: result.session.id,
            reviewed: result.session.reviewed,
            recalled: result.session.recalled,
            accuracy: result.session.accuracy,
            durationMinutes: result.session.durationMinutes,
            mode: result.session.mode
          }
        });
        if (rewardResult?.logEntry?.id) result.session.rewardLogId = rewardResult.logEntry.id;
        saveDb(db);
        return formatSuccess({
          mindMap: result.map,
          session: result.session,
          rewardResult
        }, `Sessão registrada: ${result.session.recalled}/${result.session.reviewed} ramos lembrados.`);
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'delete_mind_map',
    description: 'Excluir um mapa mental e estornar as recompensas das sessões de estudo.',
    schema: {
      id: z.string().describe('ID do mapa')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      db.mindMapSessions = sanitizeMindMapSessions(db.mindMapSessions);
      const index = db.mindMaps.findIndex(m => m.id === args.id);
      if (index === -1) return formatError(`Mapa mental '${args.id}' não encontrado.`);
      const [removed] = db.mindMaps.splice(index, 1);
      db.mindMapSessions.filter(s => s.mapId === removed.id).forEach((session) => {
        revertMindMapSession(db, session);
      });
      db.mindMapSessions = db.mindMapSessions.filter(s => s.mapId !== removed.id);
      saveDb(db);
      return formatSuccess(removed, `Mapa '${removed.title}' excluído.`);
    }
  },
  {
    name: 'list_mind_map_images',
    description: 'Listar a biblioteca de imagens já enviadas ou usadas nos mapas mentais.',
    schema: {},
    handler: async () => {
      const db = getDb();
      const images = sanitizeMindMapImageLibrary(db.mindMapImages).map(({ url, ...rest }) => ({
        ...rest,
        preview: url.startsWith('data:') ? '[imagem enviada]' : url
      }));
      return formatSuccess({ total: images.length, images }, `${images.length} imagens na biblioteca.`);
    }
  },
  {
    name: 'delete_mind_map_image',
    description: 'Excluir uma imagem da biblioteca de mapas mentais e removê-la dos ramos que a usam.',
    schema: {
      id: z.string().optional().describe('ID da imagem na biblioteca'),
      url: z.string().optional().describe('URL da imagem, se o ID não for conhecido')
    },
    handler: async (args) => {
      const db = getDb();
      const images = sanitizeMindMapImageLibrary(db.mindMapImages);
      const target = images.find(item => (args.id && item.id === args.id) || (args.url && item.url === args.url));
      if (!target) return formatError('Imagem não encontrada na biblioteca.');
      db.mindMapImages = forgetMindMapImage(images, target.url);
      db.mindMaps = stripMindMapImage(sanitizeMindMaps(db.mindMaps), target.url);
      saveDb(db);
      return formatSuccess({ id: target.id, label: target.label }, 'Imagem excluída da biblioteca e dos ramos.');
    }
  },
  {
    name: 'list_mind_map_categories',
    description: 'Listar assuntos e subassuntos usados para organizar os mapas mentais.',
    schema: {},
    handler: async () => {
      const db = getDb();
      const categories = sanitizeMindMapCategories(db.mindMapCategories);
      return formatSuccess({ total: categories.length, categories }, `${categories.length} assuntos encontrados.`);
    }
  },
  {
    name: 'create_mind_map_category',
    description: 'Criar um assunto (matéria) ou subassunto de mapas mentais. Subassuntos usam parentId do assunto pai.',
    schema: {
      name: z.string().describe('Nome do assunto ou subassunto'),
      color: z.string().optional().describe('Cor hex'),
      parentId: z.string().optional().describe('ID do assunto pai (omitido = assunto raiz)')
    },
    handler: async (args) => {
      try {
        const db = getDb();
        db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
        const category = createMindMapCategory(args, db.mindMapCategories);
        db.mindMapCategories.push(category);
        saveDb(db);
        return formatSuccess(category, `Assunto '${category.name}' criado.`);
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'update_mind_map_category',
    description: 'Renomear, recolocar ou recolorir um assunto/subassunto de mapas mentais.',
    schema: {
      id: z.string().describe('ID do assunto'),
      name: z.string().optional(),
      color: z.string().optional(),
      parentId: z.string().nullable().optional().describe('Novo pai (null = promover a assunto)')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
      const cat = db.mindMapCategories.find(c => c.id === args.id);
      if (!cat) return formatError(`Assunto '${args.id}' não encontrado.`);
      try {
        if (args.name !== undefined) {
          const trimmed = String(args.name || '').trim();
          if (!trimmed) return formatError('Informe o nome do assunto.');
          cat.name = trimmed;
          db.mindMaps = applyMindMapCategoryRename(sanitizeMindMaps(db.mindMaps), cat.id, cat);
        }
        if (args.color) cat.color = args.color;
        if (args.parentId !== undefined) {
          if (args.parentId) {
            const parent = db.mindMapCategories.find(c => c.id === args.parentId);
            if (!parent) return formatError('Assunto pai não encontrado.');
            if (parent.parentId) return formatError('Subassuntos não podem ter outros subassuntos.');
            cat.parentId = parent.id;
          } else {
            cat.parentId = null;
          }
        }
        saveDb(db);
        return formatSuccess(cat, `Assunto '${cat.name}' atualizado.`);
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'delete_mind_map_category',
    description: 'Excluir um assunto (e seus subassuntos). Mapas são movidos para outro assunto raiz.',
    schema: {
      id: z.string().describe('ID do assunto')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
      const cat = db.mindMapCategories.find(c => c.id === args.id);
      if (!cat) return formatError(`Assunto '${args.id}' não encontrado.`);
      const childIds = db.mindMapCategories.filter(c => c.parentId === cat.id).map(c => c.id);
      const removeIds = new Set([cat.id, ...childIds]);
      const fallback = db.mindMapCategories.find(c => !removeIds.has(c.id) && !c.parentId)
        || db.mindMapCategories.find(c => !removeIds.has(c.id))
        || null;
      db.mindMaps = sanitizeMindMaps(db.mindMaps);
      removeIds.forEach((id) => {
        db.mindMaps = reassignMindMapCategory(db.mindMaps, id, fallback);
      });
      db.mindMapCategories = db.mindMapCategories.filter(c => !removeIds.has(c.id));
      saveDb(db);
      return formatSuccess({ removed: cat, fallback }, `Assunto '${cat.name}' excluído.`);
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
      subjectId: z.string().optional().describe('ID da matéria no plano AGU (ex: constitucional)'),
      topicId: z.string().optional().describe('ID do tópico no plano AGU'),
      kind: z.string().optional().describe('Tipo do bloco AGU: questoes, erros, revisao, lei-seca, discursiva, simulado, teoria'),
      blockKey: z.string().optional().describe('Chave do bloco AGU a creditar'),
      category: z.string().optional().describe('Categoria (padrão: Estudos)'),
      institution: z.string().optional().describe('Banca ou instituição'),
      platform: z.string().optional().describe('Plataforma (Qconcursos, Tec...)'),
      totalQuestions: z.number().describe('Total de questões resolvidas'),
      correctAnswers: z.number().describe('Quantidade de acertos'),
      wrongAnswers: z.number().optional().describe('Quantidade de erros (se omitido, calcula total - acertos)'),
      durationMinutes: z.number().optional().default(30).describe('Tempo dedicado em minutos'),
      notes: z.string().optional().describe('Observações, pontos de melhoria ou pegadinhas'),
      notebookUrl: z.string().optional().describe('Link do caderno de questões (Qconcursos, Tec, etc.)'),
      date: z.string().optional().describe('Data no formato YYYY-MM-DD')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainLogExamQuestions(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      const entry = result.entry;
      return formatSuccess({
        entry,
        rewardResult: result.rewardResult,
        linkedVictories: result.linkedVictories
      }, `🎯 ${entry.totalQuestions} questões registradas em '${entry.subject}' com ${entry.accuracyRate}% de acerto! (+${entry.xpEarned} XP).`);
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
      const result = domainDeleteExamQuestions(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess({ removed: result.removed, linkedVictories: result.linkedVictories }, 'Registro de questões excluído e pontuação estornada.');
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
      const result = domainCreateReward(db, {
        title: args.title,
        cost: args.costCoins,
        costCoins: args.costCoins,
        icon: args.icon,
        category: args.category
      });
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.reward, `Recompensa '${result.reward.title}' criada por ${result.reward.cost} moedas.`);
    }
  },
  {
    name: 'spend_money',
    description: 'Registrar um gasto em R$ na Taverna. Cada R$ 1,00 custa 10 moedas de ouro (ex: R$ 25,00 em sorvete debita 250 moedas).',
    schema: {
      amountBrl: z.number().describe('Valor gasto em reais (ex: 25 para R$ 25,00)'),
      item: z.string().describe('O que foi comprado (ex: sorvete, almoço, cinema)'),
      notes: z.string().optional().describe('Observações sobre o gasto')
    },
    handler: async (args) => {
      const db = getDb();
      const result = spendMoney(db, {
        amountBrl: args.amountBrl,
        item: args.item,
        notes: args.notes
      });
      if (result.error) return formatError(result.error);

      saveDb(db);
      return formatSuccess({
        redemption: result.redemption,
        remainingCoins: db.userProfile.coins
      }, `💸 Gastou ${formatBrl(result.redemption.amountBrl)} com '${result.redemption.rewardTitle}'. Debitado 🪙 ${result.redemption.cost} moedas. Saldo restante: 🪙 ${db.userProfile.coins}.`);
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
      const result = domainRedeemReward(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess({
        redemption: result.redemption,
        remainingCoins: db.userProfile.coins
      }, `🎁 Recompensa '${result.reward.title}' resgatada com sucesso! Saldo restante: 🪙 ${db.userProfile.coins} moedas.`);
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
      const refundedCoins = refundCoinsFromRedemption(removed);
      db.userProfile.coins = (db.userProfile.coins ?? 0) + refundedCoins;

      saveDb(db);
      return formatSuccess({
        removed,
        refundedCoins,
        newBalance: db.userProfile.coins
      }, `Resgate cancelado! 🪙 ${refundedCoins} moedas foram devolvidas.`);
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
        totalMindMaps: (db.mindMaps || []).length,
        totalRewardItems: (db.rewards || []).length,
        dailyVictoriesToday: summarizeDay(
          sanitizeDailyVictories(db.dailyVictories),
          getSaoPauloDateStr(),
          sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses)
        )
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
    description: 'Invocar o próximo chefe somente se o atual já foi derrotado. force=true é o reset explícito e não apaga HP em silêncio: sem derrota, recusa.',
    schema: {
      level: z.number().int().positive().optional().describe('Nível do chefe desejado (opcional. Se omitido, avança 1 nível caso o atual tenha sido derrotado)'),
      name: z.string().optional().describe('Nome forçado para o chefe (opcional)'),
      force: z.boolean().optional().describe('true só para reset explícito com o chefe ainda vivo')
    },
    handler: async (args = {}) => {
      const db = getDb();
      const currentBoss = db.bossRaid;
      if (!currentBoss?.defeated && args.force !== true) {
        return formatError('O chefe da semana ainda está de pé. Novo chefe no domingo. Passe force=true para um reset explícito.');
      }
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

  {
    name: 'list_penalties',
    description: 'Listar os julgamentos do Grimório (punições). pending=true devolve só os não reconhecidos.',
    schema: {
      pending: z.boolean().optional().describe('Se true, só julgamentos ainda não reconhecidos')
    },
    handler: async (args = {}) => {
      const db = getDb();
      runMaintenance(db, new Date(), { createBossRaid });
      saveDb(db);
      const all = db.penalties || [];
      const list = args.pending ? listUnacknowledged(db) : all;
      return formatSuccess({ penalties: list, pending: listUnacknowledged(db).length }, `${list.length} julgamento(s).`);
    }
  },
  {
    name: 'acknowledge_penalty',
    description: 'Reconhecer um julgamento (“Entendi, vou melhorar”). Sem id, reconhece todos os pendentes.',
    schema: {
      id: z.string().optional().describe('ID do julgamento. Omita para reconhecer todos.')
    },
    handler: async (args = {}) => {
      const db = getDb();
      if (args.id) {
        const result = acknowledgePenalty(db, args.id);
        if (result.error) return formatError(result.error);
        saveDb(db);
        return formatSuccess(result.penalty, 'Julgamento reconhecido.');
      }
      const pending = listUnacknowledged(db);
      const at = new Date().toISOString();
      pending.forEach((item) => { item.acknowledgedAt = at; });
      saveDb(db);
      return formatSuccess({ acknowledged: pending.length }, `${pending.length} julgamento(s) reconhecido(s).`);
    }
  },
  {
    name: 'contest_penalty',
    description: 'Contestar um julgamento em até 24h (máximo 2 por semana). Estorna moedas e atributos pelo ledger.',
    schema: {
      id: z.string().describe('ID do julgamento'),
      reason: z.string().describe('Motivo da contestação')
    },
    handler: async (args) => {
      const db = getDb();
      const prepared = prepareContest(db, args.id, args.reason);
      if (prepared.error) return formatError(prepared.error);
      if (prepared.penalty.rewardLogId) revertLog(db, prepared.penalty.rewardLogId, { save: false });
      prepared.penalty.contestedAt = new Date().toISOString();
      prepared.penalty.contestReason = prepared.reason;
      prepared.penalty.acknowledgedAt = prepared.penalty.contestedAt;
      saveDb(db);
      return formatSuccess(prepared.penalty, 'Contestação aceita. A punição foi estornada.');
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
        },
        mindMaps: analytics.mindMaps || []
      }, 'Métricas de leitura e simulados obtidas.');
    }
  },
  {
    name: 'get_category_rankings',
    description: 'Obter os rankings e níveis de maestria alcançados em cada categoria de atividade cadastrada.',
    schema: {},
    handler: async () => {
      const rankings = computeCategoryRankings(getDb());
      return formatSuccess(rankings, 'Rankings de categoria obtidos.');
    }
  },

  // ==========================================
  // 11. PRÓXIMA ATIVIDADE (ORÁCULO DE CONTEXTO)
  // ==========================================
  {
    name: 'get_today',
    description: 'Obter o painel de Hoje: saudação, vitórias, rituais devidos, missões do dia e atrasadas, blocos AGU, mapas vencidos, próxima atividade (sem efeito colateral) e rankings em risco.',
    schema: {
      location: locationEnum.optional().describe('Lugar atual para a prévia da próxima atividade')
    },
    handler: async (args = {}) => {
      const db = getDb();
      const today = buildTodayPayload(db, { location: args.location });
      return formatSuccess(today, `${today.greeting}. ${today.habitsDueCount} ritual(is) devido(s), ${today.quests.length} missão(ões) do dia ou atrasada(s).`);
    }
  },
  {
    name: 'close_day',
    description: 'Fechar o dia: grava uma revisão (nota e humor 1-5) e concede 15 XP e +2 de consistência, uma vez por dia. Estornável se a revisão for excluída.',
    schema: {
      note: z.string().optional().describe('Reflexão de uma linha sobre o dia'),
      mood: z.number().min(1).max(5).optional().describe('Humor de 1 a 5')
    },
    handler: async (args = {}) => {
      const db = getDb();
      const result = await closeDay(db, { note: args.note, mood: args.mood });
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess({
        review: result.review,
        xp: result.rewardResult?.logEntry?.xp || 0
      }, `Dia fechado. +${result.rewardResult?.logEntry?.xp || 0} XP.`);
    }
  },
  {
    name: 'list_daily_reviews',
    description: 'Listar as revisões de fechamento do dia já gravadas.',
    schema: {},
    handler: async () => {
      const db = getDb();
      return formatSuccess({ reviews: db.dailyReviews || [] }, `${(db.dailyReviews || []).length} revisão(ões) de dia.`);
    }
  },
  {
    name: 'get_weekly_review',
    description: 'Resumo de uma semana (domingo a sábado): XP por categoria, vitórias, rituais, missões, minutos de estudo e motivos de recusa do Oráculo.',
    schema: {
      weekKey: z.string().optional().describe('Domingo da semana YYYY-MM-DD. Se omitido, usa a semana anterior.')
    },
    handler: async (args = {}) => {
      const review = buildWeeklyReview(getDb(), { weekKey: args.weekKey });
      return formatSuccess(review, `Semana ${review.weekLabel}: ${review.victories.completed}/${review.victories.planned} vitórias, ${review.study.minutes} min de estudo.`);
    }
  },
  {
    name: 'set_weekly_plan',
    description: 'Definir até 3 focos da semana (texto livre e categoria opcional). Não concede XP; concluir cada foco é outra ação.',
    schema: {
      weekKey: z.string().optional().describe('Domingo da semana YYYY-MM-DD. Padrão: semana atual.'),
      note: z.string().optional().describe('Nota da semana'),
      focuses: z.array(z.object({
        title: z.string().describe('Foco da semana'),
        category: z.string().optional().describe('Categoria opcional')
      })).min(1).max(3).describe('Até 3 focos')
    },
    handler: async (args = {}) => {
      const db = getDb();
      const result = saveWeeklyPlan(db, {
        weekKey: args.weekKey,
        focuses: args.focuses,
        note: args.note
      });
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess({ plan: result.plan }, `${result.plan.focuses.length} foco(s) gravado(s) para a semana ${result.plan.weekKey}.`);
    }
  },
  {
    name: 'get_next_action',
    description: 'Indicar uma única próxima atividade. O Jev escolhe a mais provável de ser iniciada agora, usando energia recente, histórico e recusas. Sem leitura de energia, usa o motor local.',
    schema: {
      location: locationEnum.optional().describe('Lugar atual (anywhere, office, home, gym). Se omitido, usa o lugar salvo no perfil ou um palpite por horário.'),
      snoozedIds: z.array(z.string()).optional().describe('IDs adiados nesta sessão (ignorados no ranking)')
    },
    handler: async (args = {}) => {
      const db = getDb();
      const result = await suggestNextAction(db, {
        location: args.location,
        snoozedIds: args.snoozedIds || []
      });
      saveDb(db);
      return formatSuccess({
        ...result,
        locations: LOCATIONS
      }, result.primary
        ? `Próxima atividade: ${result.primary.title} (${KIND_TEXT[result.primary.kind] || 'missão'} · ${result.primary.locationLabel}).`
        : (result.emptyReason || 'Nenhuma atividade elegível agora.'));
    }
  },
  {
    name: 'set_current_location',
    description: 'Definir o lugar atual do herói (Casa, Escritório, Academia ou Qualquer lugar) usado pelo Oráculo para indicar a próxima atividade.',
    schema: {
      location: locationEnum.describe('Lugar atual: anywhere, office, home ou gym'),
      manual: z.boolean().optional().default(true).describe('Se true, persiste a escolha até o herói mudar. Se false, volta a palpite automático.')
    },
    handler: async (args) => {
      const db = getDb();
      db.userProfile.currentLocation = normalizeLocation(args.location);
      db.userProfile.locationManual = args.manual !== false;
      saveDb(db);
      // Sem lugar explícito: o contexto continua dizendo que veio do perfil
      // salvo, e a resposta traz energia/needsEnergy como o cartão espera.
      const result = previewNextAction(db);
      return formatSuccess({
        currentLocation: db.userProfile.currentLocation,
        locationManual: db.userProfile.locationManual,
        nextAction: result
      }, `Lugar atual: ${result.context.locationLabel}.`);
    }
  },
  {
    name: 'get_agu_plan',
    description: 'Obter o plano de estudos da Campanha AGU (Procurador Federal): ciclo atual, blocos de hoje, matérias e maestria.',
    schema: {},
    handler: async () => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      let plan = sanitizeAguPlan(db.aguPlan, todayStr);
      if (plan.startedAt) {
        const next = ensureCurrentCycle(plan, db.examQuestions || [], todayStr);
        if (next !== plan) {
          db.aguPlan = next;
          saveDb(db);
          plan = next;
        }
      }
      const summary = summarizePlan(plan, db.examQuestions || [], todayStr);
      return formatSuccess({
        plan,
        today: summary.today,
        nextBlock: summary.nextBlock,
        portugueseRequired: summary.portugueseRequired,
        edital: summary.edital,
        studyBlocks: (summary.studyBlocks || []).slice(0, 40),
        cycle: {
          number: summary.calendar.cycleNumber,
          start: summary.calendar.cycleStart,
          end: summary.calendar.cycleEnd,
          phase: summary.phase,
          percent: summary.cyclePercent,
          reasons: summary.reasons
        },
        debt: summary.debt,
        masteredSubjects: summary.masteredSubjects,
        totalSubjects: summary.totalSubjects,
        overallAccuracy: summary.overallAccuracy,
        totalSolved: summary.totalSolved,
        studyTime: summary.studyTime
      }, summary.today
        ? `AGU hoje: ${summary.today.label} (${summary.today.doneCount}/${summary.today.totalBlocks} blocos). Fase ${summary.phaseMeta?.short || summary.phase}.`
        : 'Campanha AGU carregada.');
    }
  },
  {
    name: 'start_agu_campaign',
    description: 'Iniciar (ou reiniciar a data de início) da Campanha AGU — Procurador Federal a partir de hoje.',
    schema: {},
    handler: async () => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      db.aguPlan = startAguPlan(sanitizeAguPlan(db.aguPlan, todayStr), todayStr, db.examQuestions || []);
      saveDb(db);
      const summary = summarizePlan(db.aguPlan, db.examQuestions || [], todayStr);
      return formatSuccess({ plan: db.aguPlan, today: summary.today }, `Campanha AGU iniciada em ${todayStr}.`);
    }
  },
  {
    name: 'advance_agu_cycle',
    description: 'Arquivar o ciclo AGU atual e gerar o próximo (fragilidade + dívida).',
    schema: {},
    handler: async () => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      db.aguPlan = sanitizeAguPlan(db.aguPlan, todayStr);
      if (!db.aguPlan.startedAt) return formatError('Inicie a campanha antes de gerar o próximo ciclo.');
      db.aguPlan = advanceAguCycle(db.aguPlan, todayStr, db.examQuestions || []);
      saveDb(db);
      const summary = summarizePlan(db.aguPlan, db.examQuestions || [], todayStr);
      return formatSuccess({ plan: db.aguPlan, today: summary.today, reasons: summary.reasons }, `Ciclo ${summary.calendar.cycleNumber} gerado.`);
    }
  },
  {
    name: 'log_agu_discursive',
    description: 'Marcar o produto de um bloco discursivo AGU (parecer, peça, dissertação ou oral).',
    schema: {
      key: z.string().describe('Chave do bloco discursivo'),
      note: z.string().optional().describe('Caminho ou nota do produto')
    },
    handler: async (args) => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      db.aguPlan = logDiscursiveProduct(sanitizeAguPlan(db.aguPlan, todayStr), args.key, { note: args.note });
      saveDb(db);
      return formatSuccess({ key: args.key }, 'Produto discursivo lançado.');
    }
  },
  {
    name: 'complete_agu_block',
    description: 'Marcar ou desmarcar um bloco do ciclo AGU de hoje (ou de uma data YYYY-MM-DD).',
    schema: {
      subjectId: z.string().describe('ID da matéria (ex: constitucional, administrativo, portugues)'),
      kind: z.string().optional().describe('Tipo do bloco: questoes, erros, revisao, lei-seca, discursiva, simulado, teoria'),
      topicId: z.string().optional().describe('ID do tópico, se conhecido'),
      key: z.string().optional().describe('Chave completa do bloco (se já conhecida)'),
      date: z.string().optional().describe('Data YYYY-MM-DD (padrão: hoje)'),
      durationMinutes: z.number().optional().describe('Tempo cronometrado do bloco em minutos')
    },
    handler: async (args) => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      const dateStr = args.date || todayStr;
      const kind = args.kind || 'questoes';
      const plan = sanitizeAguPlan(db.aguPlan, todayStr);
      const summary = summarizePlan(plan, db.examQuestions || [], todayStr);
      const day = (summary.calendar?.days || []).find((d) => d.dateStr === dateStr) || summary.today;
      const match = (day?.blocks || []).find((b) => (
        b.subjectId === args.subjectId
        && (!args.kind || b.kind === kind)
        && (!args.topicId || b.topicId === args.topicId)
      ));
      const key = args.key || match?.key || `${dateStr}|${args.subjectId}|${kind}`;
      db.aguPlan = toggleCompletedBlock(plan, key);
      db.aguPlan = addBlockDuration(db.aguPlan, key, args.durationMinutes);
      if (db.aguPlan?.completedBlocks?.[key]) {
        markDecisionCompleted(db, { decisionId: args.decisionId, entityId: `agu:${key}`, kind: 'agu', completionKind: 'block' });
      }
      const linkedVictories = syncDailyVictoriesFromActivity(db, { today: todayStr, syncStudy: true });
      saveDb(db);
      const next = summarizePlan(db.aguPlan, db.examQuestions || [], todayStr);
      return formatSuccess({ key, plan: db.aguPlan, today: next.today, linkedVictories }, `Bloco ${key} alternado.`);
    }
  },
  {
    name: 'add_agu_error',
    description: 'Anotar um erro no caderno da Campanha AGU. Entra na revisão espaçada (1, 3, 7, 14, 30 dias).',
    schema: {
      note: z.string().describe('O que errou, em texto livre'),
      subjectId: z.string().optional().describe('ID da matéria'),
      topicId: z.string().optional().describe('ID do tópico'),
      questionId: z.string().optional().describe('Identificador da questão'),
      url: z.string().optional().describe('Link da questão')
    },
    handler: async (args) => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      db.aguPlan = addAguError(sanitizeAguPlan(db.aguPlan, todayStr), args, todayStr);
      saveDb(db);
      return formatSuccess({ error: db.aguPlan.errorNotebook[0] }, 'Erro anotado no caderno AGU.');
    }
  },
  {
    name: 'list_agu_errors',
    description: 'Listar o caderno de erros da Campanha AGU, com os vencidos primeiro.',
    schema: {},
    handler: async () => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      const plan = sanitizeAguPlan(db.aguPlan, todayStr);
      const due = dueAguErrors(plan, todayStr);
      return formatSuccess({
        due,
        errors: plan.errorNotebook || []
      }, `${due.length} erro(s) vencido(s) de ${(plan.errorNotebook || []).length}.`);
    }
  },
  {
    name: 'review_agu_error',
    description: 'Revisar um erro do caderno AGU. quality 0-1 reabre em 1 dia; 2-3 avança o intervalo.',
    schema: {
      id: z.string().describe('ID do erro'),
      quality: z.number().optional().describe('0 errei de novo, 2 lembrei, 3 fácil')
    },
    handler: async (args) => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      db.aguPlan = reviewAguError(sanitizeAguPlan(db.aguPlan, todayStr), args.id, args.quality ?? 2, todayStr);
      saveDb(db);
      const item = (db.aguPlan.errorNotebook || []).find((error) => error.id === args.id);
      return formatSuccess({ error: item }, item ? `Próxima revisão em ${item.nextReviewAt}.` : 'Erro não encontrado.');
    }
  },
  // ==========================================
  // VITÓRIAS PLANEJADAS PARA O DIA
  // ==========================================
  {
    name: 'list_daily_victories',
    description: 'Listar as Vitórias Planejadas para o Dia (máximo de 3 manuais por dia; estudo/leitura pela homeostase podem ir a 5). Independentes das missões, usam as mesmas categorias. Padrão: hoje e amanhã.',
    schema: {
      date: z.string().optional().describe('Filtrar por data YYYY-MM-DD (hoje ou amanhã). Se omitido, retorna hoje e amanhã.')
    },
    handler: async (args) => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      const dates = getPlannableDates(todayStr);
      const items = sanitizeDailyVictories(db.dailyVictories);
      const bonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
      if (args.date) {
        return formatSuccess({
          date: args.date,
          summary: summarizeDay(items, args.date, bonuses),
          maxPerDay: MAX_DAILY_VICTORIES,
          overflowMaxPerDay: EXTENDED_MAX_DAILY_VICTORIES,
          rewards: DAILY_VICTORY_REWARDS,
          tripleBonus: DAILY_VICTORY_TRIPLE_BONUS
        }, `Vitórias de ${args.date}.`);
      }
      return formatSuccess({
        today: todayStr,
        dates,
        maxPerDay: MAX_DAILY_VICTORIES,
        overflowMaxPerDay: EXTENDED_MAX_DAILY_VICTORIES,
        rewards: DAILY_VICTORY_REWARDS,
        tripleBonus: DAILY_VICTORY_TRIPLE_BONUS,
        todaySummary: summarizeDay(items, dates.today, bonuses),
        tomorrowSummary: summarizeDay(items, dates.tomorrow, bonuses)
      }, 'Vitórias de hoje e amanhã.');
    }
  },
  {
    name: 'create_daily_victory',
    description: 'Cadastrar uma Vitória Planejada para hoje ou amanhã (máximo de 3 manuais por dia). Use source homeostasis-study ou homeostasis-reading para ir até 5.',
    schema: {
      title: z.string().describe('Título da vitória (ex: Finalizar petição, Treinar 40 min)'),
      category: z.string().optional().describe('Categoria (ex: Trabalho, Estudos, Pessoal, Saúde)'),
      date: z.string().optional().describe('Data YYYY-MM-DD (hoje ou amanhã). Padrão: hoje'),
      source: z.enum(['homeostasis-study', 'homeostasis-reading', 'homeostasis-scripture']).optional().describe('Origem especial que permite ir além de 3 (estudo AGU, leitura ou Bíblia)'),
      questId: z.string().optional().describe('ID da missão de origem, se a vitória foi planejada a partir de uma missão')
    },
    handler: async (args) => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
      db.dailyVictoryBonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
      try {
        const result = createDailyVictory(db.dailyVictories, args, {
          today: todayStr,
          defaultCategory: db.questCategories?.[0]?.name || 'Pessoal'
        });
        db.dailyVictories = result.list;
        saveDb(db);
        return formatSuccess({
          victory: result.victory,
          summary: summarizeDay(result.list, result.victory.date, db.dailyVictoryBonuses)
        }, `Vitória '${result.victory.title}' planejada para ${result.victory.date}.`);
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'update_daily_victory',
    description: 'Atualizar título, categoria ou data de uma Vitória Planejada (ainda não realizada).',
    schema: {
      id: z.string().describe('ID da vitória'),
      title: z.string().optional().describe('Novo título'),
      category: z.string().optional().describe('Nova categoria'),
      date: z.string().optional().describe('Nova data YYYY-MM-DD (hoje ou amanhã)'),
      note: z.string().optional().describe('Anotação (só se já estiver concluída)')
    },
    handler: async (args) => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
      try {
        const result = updateDailyVictory(db.dailyVictories, args.id, args, { today: todayStr });
        db.dailyVictories = result.list;
        saveDb(db);
        return formatSuccess(result.victory, `Vitória '${result.victory.title}' atualizada.`);
      } catch (err) {
        return formatError(err.message);
      }
    }
  },
  {
    name: 'complete_daily_victory',
    description: 'Registrar (ou desmarcar) a realização de uma Vitória Planejada no próprio dia. Concede XP, moedas e Vontade; concluir as 3 do dia dispara um bônus extra. Anotação opcional na conclusão.',
    schema: {
      id: z.string().describe('ID da vitória'),
      completed: z.boolean().optional().describe('true = realizada, false = reabrir. Se omitido, alterna.'),
      note: z.string().optional().describe('Anotação opcional ao concluir'),
      durationMinutes: z.number().optional().describe('Tempo cronometrado em minutos (máx. 480). Limpa o cronômetro ao vivo.')
    },
    handler: async (args) => {
      const db = getDb();
      const result = await completeDailyVictoryUseCase(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      const verb = result.willComplete ? 'conquistada' : 'reaberta';
      const bonusMsg = result.bonusAwardedNow ? ' Tríade completa — bônus concedido!' : (result.bonusRevertedNow ? ' Bônus da tríade estornado.' : '');
      const chestMsg = result.chest?.chest?.label ? ` Baú do Destino: ${result.chest.chest.label}.` : '';
      return formatSuccess({
        victory: result.victory,
        willComplete: result.willComplete,
        bonusAwardedNow: result.bonusAwardedNow,
        bonusRevertedNow: result.bonusRevertedNow,
        rewardResult: result.rewardResult,
        bonusRewardResult: result.bonusRewardResult,
        chest: result.chest?.chest || null
      }, `Vitória '${result.victory.title}' ${verb}.${bonusMsg}${chestMsg}`);
    }
  },
  {
    name: 'delete_daily_victory',
    description: 'Excluir uma Vitória Planejada. Se já estava concluída, estorna as recompensas (e o bônus da tríade, se aplicável).',
    schema: {
      id: z.string().describe('ID da vitória a excluir')
    },
    handler: async (args) => {
      const db = getDb();
      db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
      db.dailyVictoryBonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
      try {
        const result = deleteDailyVictory(db.dailyVictories, db.dailyVictoryBonuses, args.id);
        db.dailyVictories = result.list;
        db.dailyVictoryBonuses = result.bonuses;
        if (result.shouldRevertReward) {
          revertPlayerReward({
            xp: DAILY_VICTORY_REWARDS.xp,
            coins: DAILY_VICTORY_REWARDS.coins,
            willpower: DAILY_VICTORY_REWARDS.willpower,
            actionType: 'daily_victory_complete',
            entityId: result.removed.id
          });
        }
        if (result.bonusRevertedNow) {
          revertPlayerReward({
            xp: DAILY_VICTORY_TRIPLE_BONUS.xp,
            coins: DAILY_VICTORY_TRIPLE_BONUS.coins,
            willpower: DAILY_VICTORY_TRIPLE_BONUS.willpower,
            consistency: DAILY_VICTORY_TRIPLE_BONUS.consistency,
            actionType: 'daily_victory_triple_bonus',
            entityId: bonusEntityId(result.removed.date)
          });
        }
        saveDb(db);
        return formatSuccess({ removed: result.removed }, `Vitória '${result.removed.title}' excluída.`);
      } catch (err) {
        return formatError(err.message);
      }
    }
  },

  // ==========================================
  // Ferramentas que antes só existiam no HTTP
  // ==========================================
  {
    name: 'update_reading_session',
    description: 'Atualizar uma sessão de leitura (páginas, duração, notas, citações). Estorna o log antigo e concede a recompensa nova.',
    schema: {
      id: z.string().describe('ID da sessão de leitura'),
      startPage: z.number().describe('Página inicial'),
      endPage: z.number().describe('Página final'),
      durationMinutes: z.number().optional().describe('Duração em minutos (máx. 480)'),
      notes: z.string().optional().describe('Notas da sessão'),
      quotes: z.array(z.object({
        id: z.string().optional(),
        quote: z.string(),
        page: z.number().optional(),
        note: z.string().optional()
      })).optional().describe('Citações da sessão (substitui as anteriores desta sessão)')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainUpdateReadingSession(db, args.id, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess({ session: result.session, book: result.book, rewardResult: result.rewardResult }, 'Sessão de leitura atualizada.');
    }
  },
  {
    name: 'update_book_quote',
    description: 'Atualizar o texto, a página ou a anotação de uma citação.',
    schema: {
      bookId: z.string().describe('ID do livro'),
      quoteId: z.string().describe('ID da citação'),
      quote: z.string().optional().describe('Novo texto'),
      page: z.number().optional().describe('Nova página'),
      note: z.string().optional().describe('Nova anotação')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainUpdateQuote(db, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.quote, 'Citação atualizada.');
    }
  },
  {
    name: 'update_exam_questions',
    description: 'Atualizar um registro de questões. Se total ou acertos mudarem, estorna a recompensa antiga e concede a nova (fórmula HTTP).',
    schema: {
      id: z.string().describe('ID do registro'),
      subject: z.string().optional(),
      topic: z.string().optional(),
      totalQuestions: z.number().optional(),
      correctAnswers: z.number().optional(),
      durationMinutes: z.number().optional(),
      notes: z.string().optional(),
      notebookUrl: z.string().optional(),
      date: z.string().optional(),
      category: z.string().optional(),
      subjectId: z.string().optional().describe('ID da matéria AGU'),
      topicId: z.string().optional().describe('ID do tópico AGU'),
      kind: z.string().optional().describe('Tipo do bloco AGU'),
      blockKey: z.string().optional().describe('Chave do bloco AGU')
    },
    handler: async (args) => {
      const db = getDb();
      const result = domainUpdateExamQuestions(db, args.id, args);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess({ examQuestion: result.examQuestion, rewardResult: result.rewardResult }, 'Registro de questões atualizado.');
    }
  },
  {
    name: 'delete_mind_map_session',
    description: 'Excluir uma sessão de estudo de mapa mental e estornar as recompensas.',
    schema: {
      id: z.string().describe('ID da sessão de estudo')
    },
    handler: async (args) => {
      const db = getDb();
      db.mindMapSessions = sanitizeMindMapSessions(db.mindMapSessions);
      const result = domainDeleteMindMapSession(db, args.id);
      if (result.error) return formatError(result.error);
      saveDb(db);
      return formatSuccess(result.removed, 'Sessão de estudo excluída e recompensas estornadas.');
    }
  },
  {
    name: 'record_energy',
    description: 'Registrar como o herói está agora e obter a próxima atividade sugerida pelo Oráculo.',
    schema: {
      text: z.string().describe('Como você está agora, em uma frase'),
      location: locationEnum.optional().describe('Lugar atual'),
      snoozedIds: z.array(z.string()).optional().describe('IDs adiados nesta sessão')
    },
    handler: async (args) => {
      const text = String(args.text || '').trim();
      if (!text) return formatError('Conte como você está agora.');
      const db = getDb();
      try {
        const { suggestion, energyError } = await recordEnergyAndSuggest(db, text, {
          location: args.location,
          snoozedIds: args.snoozedIds || []
        });
        saveDb(db);
        return formatSuccess({ ...suggestion, energyError: energyError || null }, suggestion.primary
          ? `Próxima atividade: ${suggestion.primary.title}.`
          : 'Energia registrada.');
      } catch (err) {
        return formatError(err.message || 'Não foi possível ler a energia.');
      }
    }
  },
  {
    name: 'decline_next_action',
    description: 'Recusar a indicação atual do Oráculo, guardar o motivo e pedir outra.',
    schema: {
      decisionId: z.string().describe('ID da indicação'),
      reason: z.string().describe('Motivo da recusa'),
      note: z.string().optional().describe('Nota, obrigatória se o motivo for other'),
      location: locationEnum.optional(),
      snoozedIds: z.array(z.string()).optional()
    },
    handler: async (args) => {
      const db = getDb();
      const remembered = declineAndRemember(db, {
        decisionId: args.decisionId,
        reason: args.reason,
        note: args.note
      });
      if (remembered.error) return formatError(remembered.error);
      const excluded = [...new Set([...(args.snoozedIds || []), remembered.decision.entityId])];
      const suggestion = await suggestNextAction(db, { location: args.location, snoozedIds: excluded });
      saveDb(db);
      return formatSuccess(suggestion, 'Indicação recusada. Outra foi escolhida.');
    }
  },
  {
    name: 'accept_next_action_dose',
    description: 'Aceitar só a dose parcial da indicação do Oráculo e registrar o tempo cronometrado.',
    schema: {
      decisionId: z.string().describe('ID da indicação'),
      durationMinutes: z.number().optional().describe('Minutos cronometrados (máx. 480)')
    },
    handler: async (args) => {
      const db = getDb();
      const accepted = acceptDoseOnly(db, args.decisionId);
      if (accepted.error) return formatError(accepted.error);
      const { decision } = accepted;
      const now = new Date();
      let trackedMinutes = 0;
      try {
        trackedMinutes = args.durationMinutes == null ? 0 : Math.min(480, Math.max(0, Math.round(Number(args.durationMinutes) || 0)));
      } catch {
        trackedMinutes = 0;
      }
      db.actionLogs.unshift({
        id: uid('log'),
        type: 'oracle_dose',
        entityId: decision.entityId,
        title: `Dose aceita: ${decision.dose.label} de ${decision.title}`,
        xp: 0,
        coins: 0,
        details: {
          kind: decision.kind,
          dose: decision.dose.label,
          doseAmount: decision.dose.amount,
          doseUnit: decision.dose.unit,
          fraction: decision.dose.fraction,
          fullAmount: decision.quantity ? formatQuantity(decision.quantity.amount, decision.quantity.unit) : null,
          trackedMinutes: trackedMinutes || null,
          decisionId: decision.id
        },
        timestamp: now.toISOString(),
        hour: getSaoPauloHour(now),
        dayOfWeek: getSaoPauloDayOfWeek(now),
        date: getSaoPauloDateStr(now)
      });
      saveDb(db);
      return formatSuccess({ decision }, `Dose aceita: ${decision.dose.label}.`);
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
            habits: (db.habits || []).length,
            supplements: (db.supplements || []).length,
            dailyVictories: (db.dailyVictories || []).length,
            mindMaps: (db.mindMaps || []).length
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
    uri: 'grimorio://supplements',
    name: 'Suplementos',
    description: 'Suplementos cadastrados e registros de consumo com data, hora e quantidade',
    mimeType: 'application/json',
    handler: async () => {
      const db = getDb();
      return {
        uri: 'grimorio://supplements',
        mimeType: 'application/json',
        text: JSON.stringify({
          supplements: db.supplements || [],
          logs: db.supplementLogs || []
        }, null, 2)
      };
    }
  },
  {
    uri: 'grimorio://scripture',
    name: 'Escrituras',
    description: 'Cânone, progresso, sessões, citações e reflexões da leitura da Bíblia',
    mimeType: 'application/json',
    handler: async () => {
      const db = getDb();
      return {
        uri: 'grimorio://scripture',
        mimeType: 'application/json',
        text: JSON.stringify({
          canon: bibleTotals(),
          progress: db.scriptureProgress || {},
          sessions: db.scriptureSessions || [],
          quotes: db.scriptureQuotes || [],
          reflections: db.scriptureReflections || []
        }, null, 2)
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
  },
  {
    uri: 'grimorio://mind-maps',
    name: 'Cartografia do Conhecimento',
    description: 'Mapas mentais, ramos e sessões de estudo com revisão espaçada',
    mimeType: 'application/json',
    handler: async () => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      const maps = sanitizeMindMaps(db.mindMaps).map(m => ({
        ...m,
        stats: computeMapStats(m, { today: todayStr })
      }));
      return {
        uri: 'grimorio://mind-maps',
        mimeType: 'application/json',
        text: JSON.stringify({
          mindMaps: maps,
          sessions: sanitizeMindMapSessions(db.mindMapSessions),
          categories: sanitizeMindMapCategories(db.mindMapCategories)
        }, null, 2)
      };
    }
  },
  {
    uri: 'grimorio://daily-victories',
    name: 'Vitórias Planejadas para o Dia',
    description: 'Até 3 vitórias manuais por dia (hoje e amanhã); estudo/leitura pela homeostase podem ir a 5',
    mimeType: 'application/json',
    handler: async () => {
      const db = getDb();
      const todayStr = getSaoPauloDateStr();
      const dates = getPlannableDates(todayStr);
      const items = sanitizeDailyVictories(db.dailyVictories);
      const bonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
      return {
        uri: 'grimorio://daily-victories',
        mimeType: 'application/json',
        text: JSON.stringify({
          today: todayStr,
          dates,
          todaySummary: summarizeDay(items, dates.today, bonuses),
          tomorrowSummary: summarizeDay(items, dates.tomorrow, bonuses),
          dailyVictories: items
        }, null, 2)
      };
    }
  }
];
