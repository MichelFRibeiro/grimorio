/**
 * Casos de uso compartilhados por HTTP e MCP.
 * Cada função muta `db` e devolve { error, status } ou o resultado.
 * Quem chama decide se persiste (saveDb) — rewardPlayer/revertLog já persistem
 * o snapshot corrente, então o chamador ainda deve saveDb depois de mutar
 * entidades que essas funções alteram em seguida... na prática rewardPlayer
 * salva no meio. Por isso estas funções chamam saveDb só quando o chamador
 * pede, e os efeitos de recompensa já foram persistidos por rewardPlayer.
 * O chamador HTTP/MCP faz um saveDb final para gravar o estado das entidades.
 */

import { rewardPlayer, revertPlayerReward, revertLog, findRewardLog, uid } from '../db.js';
import { getSaoPauloDateStr, getSaoPauloHour, getSaoPauloDayOfWeek, calculateHabitStreak } from '../timeUtils.js';
import { willpowerForDifficulty } from '../../src/utils/activityScale.js';
import { parseDurationMinutes, setHabitDurationForDate, clearHabitDurationForDate, clearLiveActivityTimer } from '../../src/utils/activityDuration.js';
import { sanitizeAguPlan, applyExamToPlan } from '../../src/utils/aguCycle.js';
import { syncDailyVictoriesFromActivity } from '../dailyVictorySync.js';
import { markDecisionAccepted } from '../oracleMemory.js';
import {
  DAILY_VICTORY_REWARDS,
  DAILY_VICTORY_TRIPLE_BONUS,
  bonusEntityId,
  completeDailyVictory,
  sanitizeDailyVictories,
  sanitizeDailyVictoryBonuses
} from '../../src/utils/dailyVictories.js';
import { computeStudyRewards } from '../../src/utils/mindMaps.js';
import {
  DomainError,
  LIMITS,
  durationMinutes,
  pagesInSession,
  questionsCount,
  intInRange,
  xpPerUnit as capXpPerUnit,
  coinsPerUnit as capCoinsPerUnit,
  rewardCost,
  readRewardCost,
  dateOnly
} from './validate.js';
import {
  readingSessionRewards,
  quoteRewards,
  examQuestionRewards,
  processStepRewards,
  questRewards,
  habitRewards
} from './rewards.js';

function fail(error, status = 400) {
  return { error, status };
}

function asError(err) {
  if (err instanceof DomainError) return fail(err.message, err.status || 400);
  throw err;
}

function grant(payload) {
  return rewardPlayer(payload);
}

function revertByRef({ logId, entityId, actionType, date, xp = 0, coins = 0, wisdom = 0, focus = 0, willpower = 0, consistency = 0 }) {
  return revertPlayerReward({
    logId,
    entityId,
    actionType,
    date,
    xp,
    coins,
    wisdom,
    focus,
    willpower,
    consistency
  });
}

function attachLog(entity, rewardResult, field = 'rewardLogId') {
  if (entity && rewardResult?.logEntry?.id) entity[field] = rewardResult.logEntry.id;
  return entity;
}

// ---------------------------------------------------------------------------
// Missões
// ---------------------------------------------------------------------------

export function completeQuest(db, { id, completed, durationMinutes: rawDuration } = {}) {
  const quest = (db.quests || []).find(q => q.id === id);
  if (!quest) return fail('Missão não encontrada', 404);

  const willComplete = completed !== undefined ? !!completed : !quest.completed;
  if (quest.completed === willComplete) {
    return { quest, willComplete, stateUnchanged: true, rewardResult: null, linkedVictories: [] };
  }

  const previousLogId = quest.rewardLogId;
  quest.completed = willComplete;
  quest.completedAt = willComplete ? new Date().toISOString() : null;

  let rewardResult = null;
  const rewards = questRewards(quest, { willpowerForDifficulty });
  if (willComplete) {
    let minutes = 0;
    try {
      minutes = durationMinutes(rawDuration, { fallback: 0 });
    } catch (err) {
      return asError(err);
    }
    quest.durationMinutes = minutes || null;
    rewardResult = grant({
      xp: rewards.xp,
      coins: rewards.coins,
      willpower: rewards.willpower,
      focus: rewards.focus,
      actionType: 'quest_complete',
      entityId: quest.id,
      title: quest.title,
      details: {
        category: quest.category,
        priority: quest.priority,
        difficulty: quest.difficulty,
        location: quest.location || null,
        durationMinutes: minutes
      }
    });
    attachLog(quest, rewardResult);
    db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'quest', quest.id);
    markDecisionAccepted(db, { entityId: quest.id, kind: 'quest' });
  } else {
    quest.durationMinutes = null;
    delete quest.rewardLogId;
    db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'quest', quest.id);
    rewardResult = revertByRef({
      logId: previousLogId,
      entityId: quest.id,
      actionType: 'quest_complete',
      ...rewards
    });
  }

  const linkedVictories = syncDailyVictoriesFromActivity(db, {
    questId: quest.id,
    questCompleted: willComplete
  });

  return { quest, willComplete, rewardResult, linkedVictories };
}

export function deleteQuest(db, id) {
  const index = (db.quests || []).findIndex(q => q.id === id);
  if (index === -1) return fail('Missão não encontrada', 404);
  const [removed] = db.quests.splice(index, 1);
  let rewardResult = null;
  if (removed.completed) {
    const rewards = questRewards(removed, { willpowerForDifficulty });
    rewardResult = revertByRef({
      logId: removed.rewardLogId,
      entityId: removed.id,
      actionType: 'quest_complete',
      ...rewards
    });
  }
  db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'quest', removed.id);
  return { removed, rewardResult };
}

// ---------------------------------------------------------------------------
// Hábitos
// ---------------------------------------------------------------------------

export function toggleHabit(db, { id, date, durationMinutes: rawDuration } = {}) {
  const habit = (db.habits || []).find(h => h.id === id);
  if (!habit) return fail('Hábito não encontrado', 404);

  const todayStr = getSaoPauloDateStr();
  let targetDate = date;
  if (!targetDate || typeof targetDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    targetDate = todayStr;
  }
  if (targetDate > todayStr) {
    return fail('Não é permitido marcar hábitos em datas futuras.');
  }

  if (!habit.history) habit.history = [];
  if (!habit.rewardLogs || typeof habit.rewardLogs !== 'object') habit.rewardLogs = {};
  const isAlreadyDone = habit.history.includes(targetDate);
  // Sequência calculada na data de São Paulo do servidor, nunca em new Date() cru
  // de um fuso diferente — getSaoPauloDateStr(hoje) é a referência.
  const refDate = todayStr;

  let rewardResult = null;
  if (isAlreadyDone) {
    habit.history = habit.history.filter(d => d !== targetDate);
    clearHabitDurationForDate(habit, targetDate);
    const logId = habit.rewardLogs[targetDate];
    delete habit.rewardLogs[targetDate];
    const streakData = calculateHabitStreak(habit.history, refDate, habit.bestStreak || 0);
    habit.currentStreak = streakData.currentStreak;
    habit.bestStreak = streakData.bestStreak;
    const rewards = habitRewards(habit, 0);
    rewardResult = revertByRef({
      logId,
      entityId: habit.id,
      actionType: 'habit_complete',
      date: targetDate,
      xp: rewards.xp,
      coins: rewards.coins,
      consistency: rewards.consistency
    });
    if (targetDate === todayStr) {
      db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'habit', habit.id);
    }
  } else {
    habit.history.push(targetDate);
    let minutes = 0;
    try {
      minutes = durationMinutes(rawDuration, { fallback: 0 });
    } catch (err) {
      return asError(err);
    }
    setHabitDurationForDate(habit, targetDate, minutes);
    const streakData = calculateHabitStreak(habit.history, refDate, habit.bestStreak || 0);
    habit.currentStreak = streakData.currentStreak;
    habit.bestStreak = streakData.bestStreak;
    const rewards = habitRewards(habit, habit.currentStreak);
    const isToday = targetDate === todayStr;
    const dateParts = targetDate.split('-');
    const formattedDate = isToday ? 'Hoje' : `${dateParts[2]}/${dateParts[1]}`;
    rewardResult = grant({
      xp: rewards.xp,
      coins: rewards.coins,
      consistency: rewards.consistency,
      actionType: 'habit_complete',
      entityId: habit.id,
      title: `${habit.title} (${formattedDate} - Sequência 🔥 ${habit.currentStreak})`,
      details: {
        category: habit.category || 'Pessoal',
        streak: habit.currentStreak,
        date: targetDate,
        location: habit.location || null,
        durationMinutes: minutes
      },
      logDate: targetDate
    });
    if (rewardResult?.logEntry?.id) habit.rewardLogs[targetDate] = rewardResult.logEntry.id;
    if (isToday) {
      db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'habit', habit.id);
      markDecisionAccepted(db, { entityId: habit.id, kind: 'habit' });
    }
  }

  return {
    habit,
    targetDate,
    done: !isAlreadyDone,
    doneToday: habit.history.includes(todayStr),
    rewardResult
  };
}

export function deleteHabit(db, id) {
  const index = (db.habits || []).findIndex(h => h.id === id);
  if (index === -1) return fail('Hábito não encontrado', 404);
  const [removed] = db.habits.splice(index, 1);
  const dates = Array.isArray(removed.history) ? [...removed.history] : [];
  const rewardLogs = removed.rewardLogs || {};
  dates.forEach((date) => {
    revertByRef({
      logId: rewardLogs[date],
      entityId: removed.id,
      actionType: 'habit_complete',
      date,
      xp: removed.xpReward || 30,
      coins: removed.coinReward || 8,
      consistency: 15
    });
  });
  db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'habit', removed.id);
  return { removed };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

function parseSessionPages(book, { startPage, endPage }) {
  const parsedStart = pagesInSession(startPage == null || startPage === '' ? (book.currentPage || 0) : startPage, { label: 'Página inicial' });
  const parsedEnd = pagesInSession(endPage, { label: 'Página final' });
  if (parsedEnd <= parsedStart) {
    throw new DomainError('A página final deve ser maior que a página inicial.');
  }
  const span = parsedEnd - parsedStart;
  if (span > LIMITS.pagesPerSession) {
    throw new DomainError(`Uma sessão não pode avançar mais de ${LIMITS.pagesPerSession} páginas.`);
  }
  const newEndPage = Math.min(book.totalPages, parsedEnd);
  const pagesRead = newEndPage - parsedStart;
  if (pagesRead <= 0) {
    throw new DomainError('A página final deve ser maior que a página inicial.');
  }
  return { sPage: parsedStart, newEndPage, pagesRead, finishedBook: newEndPage >= book.totalPages };
}

function parseQuotes(quotes, book, fallbackPage) {
  if (!Array.isArray(quotes)) return [];
  return quotes.filter(q => q && q.quote && String(q.quote).trim()).map(q => ({
    id: q.id || uid('quo'),
    bookId: book.id,
    bookTitle: book.title,
    quote: String(q.quote).trim(),
    page: Number.isFinite(parseInt(q.page, 10)) ? parseInt(q.page, 10) : fallbackPage,
    note: String(q.note || '').trim(),
    createdAt: q.createdAt || new Date().toISOString()
  }));
}

function recalcBookProgress(db, book) {
  if (!book) return;
  const remaining = (db.readingSessions || []).filter(s => s.bookId === book.id);
  const maxEnd = remaining.reduce((max, s) => Math.max(max, s.endPage || 0), 0);
  book.currentPage = Math.min(book.totalPages || maxEnd, maxEnd);
  if (book.totalPages && book.currentPage >= book.totalPages) {
    book.status = 'completed';
    if (!book.completedAt) book.completedAt = new Date().toISOString();
  } else if (book.status === 'completed') {
    book.status = 'reading';
    book.completedAt = null;
  }
}

export function logReadingSession(db, { bookId, startPage, endPage, durationMinutes: rawDuration, notes, quotes, date } = {}) {
  const book = (db.books || []).find(b => b.id === bookId);
  if (!book) return fail('Livro não encontrado', 404);

  let pages;
  let minutes;
  try {
    pages = parseSessionPages(book, { startPage, endPage });
    minutes = rawDuration == null || rawDuration === ''
      ? 20
      : durationMinutes(rawDuration, { fallback: 20, label: 'Duração da leitura' });
    if (date) dateOnly(date);
  } catch (err) {
    return asError(err);
  }

  const parsedQuotes = parseQuotes(quotes, book, pages.newEndPage);
  if (!book.quotes) book.quotes = [];
  if (parsedQuotes.length) book.quotes.unshift(...parsedQuotes);

  const rewards = readingSessionRewards({
    pagesRead: pages.pagesRead,
    finishedBook: pages.finishedBook,
    quotesCount: parsedQuotes.length
  });

  const session = {
    id: uid('rs'),
    bookId: book.id,
    bookTitle: book.title,
    startPage: pages.sPage,
    endPage: pages.newEndPage,
    pagesRead: pages.pagesRead,
    durationMinutes: minutes,
    notes: notes || '',
    quotes: parsedQuotes,
    xpEarned: rewards.xp,
    coinsEarned: rewards.coins,
    wisdomEarned: rewards.wisdom,
    date: date || getSaoPauloDateStr(),
    timestamp: new Date().toISOString()
  };
  if (!db.readingSessions) db.readingSessions = [];
  db.readingSessions.unshift(session);

  if (pages.finishedBook) {
    book.status = 'completed';
    book.completedAt = book.completedAt || new Date().toISOString();
  }
  recalcBookProgress(db, book);

  const rewardResult = grant({
    xp: rewards.xp,
    coins: rewards.coins,
    wisdom: rewards.wisdom,
    actionType: 'reading_session',
    entityId: session.id,
    title: `${book.title} (+${pages.pagesRead} págs${parsedQuotes.length ? `, ${parsedQuotes.length} citação(ões)` : ''})`,
    details: {
      category: 'Estudos',
      bookId: book.id,
      pagesRead: pages.pagesRead,
      durationMinutes: minutes,
      finishedBook: pages.finishedBook,
      quotesCount: parsedQuotes.length
    },
    logDate: session.date
  });
  attachLog(session, rewardResult);

  const linkedVictories = syncDailyVictoriesFromActivity(db, { syncReading: true });
  return { book, session, rewardResult, linkedVictories, finishedBook: pages.finishedBook };
}

export function updateReadingSession(db, id, { startPage, endPage, durationMinutes: rawDuration, notes, quotes } = {}) {
  const session = (db.readingSessions || []).find(s => s.id === id);
  if (!session) return fail('Sessão de leitura não encontrada', 404);
  const book = (db.books || []).find(b => b.id === session.bookId);
  if (!book) return fail('Livro associado não encontrado', 404);

  let pages;
  let minutes;
  try {
    pages = parseSessionPages(book, { startPage, endPage });
    minutes = rawDuration == null || rawDuration === ''
      ? (session.durationMinutes || 20)
      : durationMinutes(rawDuration, { fallback: session.durationMinutes || 20 });
  } catch (err) {
    return asError(err);
  }

  const parsedQuotes = Array.isArray(quotes)
    ? parseQuotes(quotes, book, pages.newEndPage)
    : (session.quotes || []);

  if (!book.quotes) book.quotes = [];
  const oldQuoteIds = (session.quotes || []).map(q => q.id);
  book.quotes = book.quotes.filter(q => !oldQuoteIds.includes(q.id));
  if (parsedQuotes.length) book.quotes.unshift(...parsedQuotes);

  const rewards = readingSessionRewards({
    pagesRead: pages.pagesRead,
    finishedBook: pages.finishedBook,
    quotesCount: parsedQuotes.length
  });

  // Estorna o log exato e concede de novo — sem mutação manual do perfil.
  // Logs anteriores a este ledger usavam entityId = book.id.
  const reverted = revertByRef({
    logId: session.rewardLogId,
    entityId: session.rewardLogId ? session.id : book.id,
    actionType: 'reading_session',
    date: session.date,
    xp: session.xpEarned || 0,
    coins: session.coinsEarned || 0,
    wisdom: session.wisdomEarned || 0
  });
  if (!session.rewardLogId && reverted?.missing) {
    const legacy = findRewardLog(db, { entityId: book.id, actionType: 'reading_session', date: session.date });
    if (legacy) revertLog(db, legacy.id);
  }

  session.startPage = pages.sPage;
  session.endPage = pages.newEndPage;
  session.pagesRead = pages.pagesRead;
  session.durationMinutes = minutes;
  if (notes !== undefined) session.notes = notes;
  session.quotes = parsedQuotes;
  session.xpEarned = rewards.xp;
  session.coinsEarned = rewards.coins;
  session.wisdomEarned = rewards.wisdom;

  recalcBookProgress(db, book);

  const rewardResult = grant({
    xp: rewards.xp,
    coins: rewards.coins,
    wisdom: rewards.wisdom,
    actionType: 'reading_session',
    entityId: session.id,
    title: `${book.title} (+${pages.pagesRead} págs${parsedQuotes.length ? `, ${parsedQuotes.length} citação(ões)` : ''})`,
    details: {
      category: 'Estudos',
      bookId: book.id,
      pagesRead: pages.pagesRead,
      durationMinutes: minutes,
      finishedBook: pages.finishedBook,
      quotesCount: parsedQuotes.length
    },
    logDate: session.date
  });
  attachLog(session, rewardResult);

  const linkedVictories = syncDailyVictoriesFromActivity(db, { syncReading: true });
  return { book, session, rewardResult, linkedVictories, userProfile: db.userProfile };
}

export function deleteReadingSession(db, id) {
  const index = (db.readingSessions || []).findIndex(s => s.id === id);
  if (index === -1) return fail('Sessão de leitura não encontrada', 404);
  const [session] = db.readingSessions.splice(index, 1);
  const book = (db.books || []).find(b => b.id === session.bookId);

  const rewardResult = revertByRef({
    logId: session.rewardLogId,
    entityId: session.id,
    actionType: 'reading_session',
    date: session.date,
    xp: session.xpEarned || 0,
    coins: session.coinsEarned || 0,
    wisdom: session.wisdomEarned || 0
  });
  if (!session.rewardLogId && book) {
    const legacy = findRewardLog(db, { entityId: book.id, actionType: 'reading_session', date: session.date });
    if (legacy) revertLog(db, legacy.id);
  }

  if (book && Array.isArray(book.quotes) && Array.isArray(session.quotes)) {
    const ids = new Set(session.quotes.map(q => q.id));
    // Citações da sessão que também receberam recompensa avulsa (não é o caso
    // hoje) são só removidas da lista; o XP delas está no log da sessão.
    book.quotes = book.quotes.filter(q => !ids.has(q.id));
  }
  recalcBookProgress(db, book);
  const linkedVictories = syncDailyVictoriesFromActivity(db, { syncReading: true });
  return { book, deletedSessionId: session.id, removed: session, rewardResult, linkedVictories, userProfile: db.userProfile };
}

export function addQuote(db, { bookId, quote, page, note } = {}) {
  const book = (db.books || []).find(b => b.id === bookId);
  if (!book) return fail('Livro não encontrado', 404);
  if (!quote || !String(quote).trim()) return fail('O texto da citação é obrigatório.');

  const newQuote = {
    id: uid('quo'),
    bookId: book.id,
    bookTitle: book.title,
    quote: String(quote).trim(),
    page: Number.isFinite(parseInt(page, 10)) ? parseInt(page, 10) : (book.currentPage || 1),
    note: String(note || '').trim(),
    createdAt: new Date().toISOString()
  };
  if (!book.quotes) book.quotes = [];
  book.quotes.unshift(newQuote);

  const rewards = quoteRewards();
  const rewardResult = grant({
    xp: rewards.xp,
    coins: rewards.coins,
    wisdom: rewards.wisdom,
    actionType: 'book_quote',
    entityId: newQuote.id,
    title: `Citação: ${book.title} (pág. ${newQuote.page})`,
    details: { category: 'Estudos', bookId: book.id, quote: newQuote.quote.substring(0, 50) }
  });
  attachLog(newQuote, rewardResult);
  return { quote: newQuote, book, rewardResult };
}

export function updateQuote(db, { bookId, quoteId, quote, page, note } = {}) {
  const book = (db.books || []).find(b => b.id === bookId);
  if (!book) return fail('Livro não encontrado', 404);
  const quoteIndex = (book.quotes || []).findIndex(q => q.id === quoteId);
  if (quoteIndex === -1) return fail('Citação não encontrada', 404);

  if (quote !== undefined) book.quotes[quoteIndex].quote = String(quote).trim();
  if (page !== undefined) book.quotes[quoteIndex].page = parseInt(page, 10) || 1;
  if (note !== undefined) book.quotes[quoteIndex].note = String(note).trim();

  (db.readingSessions || []).forEach(s => {
    (s.quotes || []).forEach(sq => {
      if (sq.id === quoteId) {
        if (quote !== undefined) sq.quote = String(quote).trim();
        if (page !== undefined) sq.page = parseInt(page, 10) || 1;
        if (note !== undefined) sq.note = String(note).trim();
      }
    });
  });
  return { quote: book.quotes[quoteIndex], book };
}

export function deleteQuote(db, { bookId, quoteId } = {}) {
  const book = (db.books || []).find(b => b.id === bookId);
  if (!book) return fail('Livro não encontrado', 404);
  const index = (book.quotes || []).findIndex(q => q.id === quoteId);
  if (index === -1) return fail('Citação não encontrada', 404);
  const [removed] = book.quotes.splice(index, 1);

  (db.readingSessions || []).forEach(rs => {
    if (rs.quotes) rs.quotes = rs.quotes.filter(q => q.id !== quoteId);
  });

  // Citação embutida numa sessão já foi paga no log da sessão (fórmula de
  // sessão). Só estorna o log avulso, se existir — senão não mexe no perfil.
  const standalone = removed.rewardLogId
    || findRewardLog(db, { entityId: removed.id, actionType: 'book_quote' });
  let rewardResult = null;
  if (standalone) {
    const rewards = quoteRewards();
    rewardResult = revertByRef({
      logId: removed.rewardLogId,
      entityId: removed.id,
      actionType: 'book_quote',
      ...rewards
    });
  }
  return { removed, book, rewardResult };
}

export function deleteBook(db, id) {
  const index = (db.books || []).findIndex(b => b.id === id);
  if (index === -1) return fail('Livro não encontrado', 404);
  const [removed] = db.books.splice(index, 1);

  const sessions = (db.readingSessions || []).filter(s => s.bookId === removed.id);
  sessions.forEach((session) => {
    revertByRef({
      logId: session.rewardLogId,
      entityId: session.id,
      actionType: 'reading_session',
      date: session.date,
      xp: session.xpEarned || 0,
      coins: session.coinsEarned || 0,
      wisdom: session.wisdomEarned || 0
    });
    if (!session.rewardLogId) {
      const legacy = findRewardLog(db, { entityId: removed.id, actionType: 'reading_session', date: session.date });
      if (legacy) revertLog(db, legacy.id);
    }
  });
  db.readingSessions = (db.readingSessions || []).filter(s => s.bookId !== removed.id);

  (removed.quotes || []).forEach((quote) => {
    if (quote.rewardLogId || findRewardLog(db, { entityId: quote.id, actionType: 'book_quote' })) {
      const rewards = quoteRewards();
      revertByRef({
        logId: quote.rewardLogId,
        entityId: quote.id,
        actionType: 'book_quote',
        ...rewards
      });
    }
  });
  return { removed };
}

// ---------------------------------------------------------------------------
// Questões
// ---------------------------------------------------------------------------

function buildExamEntry(body, existing = null) {
  const total = questionsCount(
    body.totalQuestions != null ? body.totalQuestions : existing?.totalQuestions,
    { label: 'Quantidade de questões' }
  );
  const correctRaw = body.correctAnswers != null ? body.correctAnswers : existing?.correctAnswers;
  const correct = intInRange(correctRaw, { min: 0, max: total, label: 'Acertos' });
  const minutes = durationMinutes(
    body.durationMinutes != null ? body.durationMinutes : existing?.durationMinutes,
    { fallback: 0 }
  );
  const rewards = examQuestionRewards({ total, correct });
  const entryDate = body.date || existing?.date || getSaoPauloDateStr();
  dateOnly(entryDate);
  const subject = String(body.subject != null ? body.subject : (existing?.subject || 'Geral')).trim() || 'Geral';
  const chosenCategory = (body.category && String(body.category).trim())
    ? String(body.category).trim()
    : (existing?.category || 'Estudos');

  const entry = {
    ...(existing || {}),
    id: existing?.id || uid('eq'),
    category: chosenCategory,
    subject,
    topic: String(body.topic != null ? body.topic : (existing?.topic || '')).trim(),
    subjectId: String(body.subjectId != null ? body.subjectId : (existing?.subjectId || '')).trim() || undefined,
    topicId: String(body.topicId != null ? body.topicId : (existing?.topicId || '')).trim() || undefined,
    kind: String(body.kind != null ? body.kind : (existing?.kind || '')).trim() || undefined,
    cycleNumber: body.cycleNumber != null ? body.cycleNumber : existing?.cycleNumber,
    blockKey: String(body.blockKey != null ? body.blockKey : (existing?.blockKey || '')).trim() || undefined,
    platform: String(body.platform != null ? body.platform : (existing?.platform || '')).trim() || undefined,
    institution: String(body.institution != null ? body.institution : (existing?.institution || '')).trim(),
    totalQuestions: total,
    correctAnswers: correct,
    wrongAnswers: rewards.wrong,
    accuracyRate: rewards.accuracyRate,
    durationMinutes: minutes,
    notes: String(body.notes != null ? body.notes : (existing?.notes || '')).trim(),
    notebookUrl: String(body.notebookUrl != null ? body.notebookUrl : (existing?.notebookUrl || '')).trim(),
    xpEarned: rewards.xp,
    coinsEarned: rewards.coins,
    date: entryDate,
    timestamp: existing?.timestamp || new Date().toISOString()
  };
  return { entry, rewards };
}

function applyExamSideEffects(db, entry) {
  if (db.aguPlan) {
    db.aguPlan = applyExamToPlan(
      sanitizeAguPlan(db.aguPlan, entry.date),
      entry,
      entry.date,
      db.examQuestions
    );
  }
}

export function logExamQuestions(db, body = {}) {
  let built;
  try {
    built = buildExamEntry(body);
  } catch (err) {
    return asError(err);
  }
  const { entry, rewards } = built;
  if (!db.examQuestions) db.examQuestions = [];
  db.examQuestions.unshift(entry);
  applyExamSideEffects(db, entry);

  const rewardResult = grant({
    xp: rewards.xp,
    coins: rewards.coins,
    focus: rewards.focus,
    wisdom: rewards.wisdom,
    consistency: rewards.consistency,
    actionType: 'exam_questions',
    entityId: entry.id,
    title: `${entry.subject}: ${entry.correctAnswers}/${entry.totalQuestions} acertos (${entry.accuracyRate}%)`,
    details: {
      category: entry.category,
      totalQuestions: entry.totalQuestions,
      correctAnswers: entry.correctAnswers,
      accuracyRate: entry.accuracyRate,
      subject: entry.subject,
      topic: entry.topic,
      institution: entry.institution,
      subjectId: entry.subjectId,
      topicId: entry.topicId,
      kind: entry.kind,
      blockKey: entry.blockKey
    },
    logDate: entry.date
  });
  attachLog(entry, rewardResult);
  const linkedVictories = syncDailyVictoriesFromActivity(db, { syncStudy: true });
  return { examQuestion: entry, entry, rewardResult, linkedVictories };
}

export function updateExamQuestions(db, id, body = {}) {
  if (!db.examQuestions) db.examQuestions = [];
  const index = db.examQuestions.findIndex(q => q.id === id);
  if (index === -1) return fail('Registro de questões não encontrado', 404);
  const existing = db.examQuestions[index];

  const scoreFields = ['totalQuestions', 'correctAnswers'];
  const recomputes = scoreFields.some(key => body[key] !== undefined && body[key] !== existing[key]);

  let entry;
  let rewards;
  try {
    if (recomputes || body.durationMinutes !== undefined || body.subject !== undefined) {
      const built = buildExamEntry({ ...existing, ...body }, existing);
      entry = built.entry;
      rewards = built.rewards;
    } else {
      entry = { ...existing };
      if (body.category !== undefined && String(body.category).trim()) entry.category = String(body.category).trim();
      if (body.subject !== undefined) entry.subject = String(body.subject).trim();
      if (body.topic !== undefined) entry.topic = String(body.topic).trim();
      if (body.institution !== undefined) entry.institution = String(body.institution).trim();
      if (body.notes !== undefined) entry.notes = String(body.notes).trim();
      if (body.notebookUrl !== undefined) entry.notebookUrl = String(body.notebookUrl).trim();
      if (body.date !== undefined) {
        dateOnly(body.date);
        entry.date = body.date;
      }
      if (body.subjectId !== undefined) entry.subjectId = String(body.subjectId).trim() || undefined;
      if (body.topicId !== undefined) entry.topicId = String(body.topicId).trim() || undefined;
      if (body.kind !== undefined) entry.kind = String(body.kind).trim() || undefined;
      if (body.blockKey !== undefined) entry.blockKey = String(body.blockKey).trim() || undefined;
      rewards = null;
    }
  } catch (err) {
    return asError(err);
  }

  let rewardResult = null;
  if (recomputes) {
    revertByRef({
      logId: existing.rewardLogId,
      entityId: existing.id,
      actionType: 'exam_questions',
      xp: existing.xpEarned || 0,
      coins: existing.coinsEarned || 0,
      focus: (existing.totalQuestions || 0) * 2,
      wisdom: (existing.correctAnswers || 0) * 2,
      consistency: 10
    });
    rewardResult = grant({
      xp: rewards.xp,
      coins: rewards.coins,
      focus: rewards.focus,
      wisdom: rewards.wisdom,
      consistency: rewards.consistency,
      actionType: 'exam_questions',
      entityId: entry.id,
      title: `${entry.subject}: ${entry.correctAnswers}/${entry.totalQuestions} acertos (${entry.accuracyRate}%)`,
      details: {
        category: entry.category,
        totalQuestions: entry.totalQuestions,
        correctAnswers: entry.correctAnswers,
        accuracyRate: entry.accuracyRate,
        subject: entry.subject,
        topic: entry.topic
      },
      logDate: entry.date
    });
    attachLog(entry, rewardResult);
  }

  db.examQuestions[index] = entry;
  if (recomputes) applyExamSideEffects(db, entry);
  const linkedVictories = syncDailyVictoriesFromActivity(db, { syncStudy: true });
  return { examQuestion: entry, rewardResult, linkedVictories };
}

export function deleteExamQuestions(db, id) {
  const index = (db.examQuestions || []).findIndex(q => q.id === id);
  if (index === -1) return fail('Registro não encontrado', 404);
  const [removed] = db.examQuestions.splice(index, 1);
  const rewardResult = revertByRef({
    logId: removed.rewardLogId,
    entityId: removed.id,
    actionType: 'exam_questions',
    xp: removed.xpEarned || 0,
    coins: removed.coinsEarned || 0,
    focus: (removed.totalQuestions || 0) * 2,
    wisdom: (removed.correctAnswers || 0) * 2,
    consistency: 10
  });
  const linkedVictories = syncDailyVictoriesFromActivity(db, { syncStudy: true });
  return { removed, rewardResult, linkedVictories };
}

// ---------------------------------------------------------------------------
// Processos — schema canônico HTTP, aliases MCP na borda
// ---------------------------------------------------------------------------

export function canonicalProcessFromAliases(body = {}) {
  return {
    title: body.title,
    description: body.description,
    notes: body.notes != null ? body.notes : body.description,
    category: body.category,
    unitName: body.unitName != null ? body.unitName : body.stepUnit,
    totalUnits: body.totalUnits != null ? body.totalUnits : body.totalSteps,
    completedUnits: body.completedUnits != null ? body.completedUnits : body.currentStep,
    xpPerUnit: body.xpPerUnit,
    coinsPerUnit: body.coinsPerUnit,
    status: body.status === 'active' ? 'in_progress' : body.status
  };
}

function mirrorProcess(process) {
  process.totalSteps = process.totalUnits;
  process.currentStep = process.completedUnits;
  process.stepUnit = process.unitName;
  return process;
}

export function createProcess(db, body = {}) {
  const input = canonicalProcessFromAliases(body);
  if (!input.title || !String(input.title).trim()) return fail('Título é obrigatório');
  let total;
  let current;
  let xpUnit;
  let coinUnit;
  try {
    total = intInRange(input.totalUnits, { min: 1, max: LIMITS.totalUnits, label: 'Total de unidades' });
    current = input.completedUnits == null
      ? 0
      : intInRange(input.completedUnits, { min: 0, max: total, label: 'Unidades concluídas' });
    xpUnit = capXpPerUnit(input.xpPerUnit, { fallback: 20 });
    coinUnit = capCoinsPerUnit(input.coinsPerUnit, { fallback: 5 });
  } catch (err) {
    return asError(err);
  }
  const finished = current >= total;
  const process = mirrorProcess({
    id: uid('p'),
    title: String(input.title).trim(),
    description: String(input.description || '').trim(),
    category: input.category || (db.questCategories?.[0]?.name || 'Geral'),
    unitName: input.unitName || 'unidades',
    totalUnits: total,
    completedUnits: current,
    xpPerUnit: xpUnit,
    coinsPerUnit: coinUnit,
    notes: input.notes || '',
    status: finished ? 'completed' : 'in_progress',
    completedAt: finished ? new Date().toISOString() : null,
    stepLogIds: [],
    createdAt: new Date().toISOString()
  });
  if (!db.processes) db.processes = [];
  db.processes.unshift(process);
  return { process };
}

export function stepProcess(db, id, { unitsAdded, stepCount, stepNote, note, timestamp } = {}) {
  const process = (db.processes || []).find(p => p.id === id);
  if (!process) return fail('Processo não encontrado', 404);
  mirrorProcess(process);

  let added;
  try {
    const raw = unitsAdded != null ? unitsAdded : (stepCount != null ? stepCount : 1);
    added = intInRange(raw, { min: 1, max: LIMITS.totalUnits, label: 'Unidades' });
  } catch (err) {
    return asError(err);
  }
  const previous = process.completedUnits || 0;
  const newCompleted = Math.min(process.totalUnits, previous + added);
  const actual = newCompleted - previous;
  if (actual <= 0) return fail('Processo já está totalmente concluído!');

  const stepTimestamp = new Date().toISOString();
  process.completedUnits = newCompleted;
  const finished = newCompleted >= process.totalUnits;
  if (finished) {
    process.status = 'completed';
    process.completedAt = stepTimestamp;
  }
  mirrorProcess(process);

  const rewards = processStepRewards({
    unitsAdded: actual,
    finished,
    xpPerUnit: process.xpPerUnit,
    coinsPerUnit: process.coinsPerUnit
  });
  const step = {
    id: uid('ps'),
    processId: process.id,
    processTitle: process.title,
    unitsAdded: actual,
    advancedCount: actual,
    totalCompletedNow: newCompleted,
    stepNote: stepNote || note || '',
    note: stepNote || note || '',
    timestamp: stepTimestamp,
    createdAt: stepTimestamp,
    xpEarned: rewards.xp,
    coinsEarned: rewards.coins
  };
  if (!db.processSteps) db.processSteps = [];
  db.processSteps.unshift(step);
  if (!process.stepLogIds) process.stepLogIds = [];

  const rewardResult = grant({
    xp: rewards.xp,
    coins: rewards.coins,
    focus: rewards.focus,
    actionType: 'process_step',
    entityId: step.id,
    title: `${process.title} (+${actual} ${process.unitName})`,
    details: {
      category: process.category || 'Geral',
      processId: process.id,
      unitsAdded: actual,
      finished
    }
    // timestamp do cliente NÃO entra: a sequência do herói é do servidor.
    // O campo timestamp do passo fica só no registro do passo.
  });
  attachLog(step, rewardResult);
  if (rewardResult?.logEntry?.id) process.stepLogIds.unshift(rewardResult.logEntry.id);
  void timestamp;
  return { process, step, historyEntry: step, rewardResult, finished };
}

export function updateProcess(db, id, body = {}) {
  const process = (db.processes || []).find(p => p.id === id);
  if (!process) return fail('Processo não encontrado', 404);
  const input = canonicalProcessFromAliases(body);
  try {
    if (input.title !== undefined && input.title) process.title = String(input.title).trim();
    if (body.description !== undefined) process.description = String(body.description || '').trim();
    if (input.category !== undefined) process.category = input.category;
    if (input.unitName !== undefined && input.unitName) process.unitName = input.unitName;
    if (input.totalUnits !== undefined) {
      process.totalUnits = intInRange(input.totalUnits, { min: 1, max: LIMITS.totalUnits, label: 'Total de unidades' });
    }
    if (input.completedUnits !== undefined) {
      process.completedUnits = intInRange(input.completedUnits, {
        min: 0,
        max: process.totalUnits,
        label: 'Unidades concluídas'
      });
    }
    if (input.xpPerUnit !== undefined) process.xpPerUnit = capXpPerUnit(input.xpPerUnit, { fallback: process.xpPerUnit || 20 });
    if (input.coinsPerUnit !== undefined) process.coinsPerUnit = capCoinsPerUnit(input.coinsPerUnit, { fallback: process.coinsPerUnit || 5 });
    if (input.notes !== undefined && body.notes !== undefined) process.notes = input.notes;
    if (input.status === 'completed' || input.status === 'in_progress') process.status = input.status;
  } catch (err) {
    return asError(err);
  }
  if ((process.completedUnits || 0) >= (process.totalUnits || 0)) {
    process.status = 'completed';
  } else if (process.status === 'completed') {
    process.status = 'in_progress';
    process.completedAt = null;
  }
  mirrorProcess(process);
  return { process };
}

export function deleteProcess(db, id) {
  const index = (db.processes || []).findIndex(p => p.id === id);
  if (index === -1) return fail('Processo não encontrado', 404);
  const [removed] = db.processes.splice(index, 1);
  const steps = (db.processSteps || []).filter(s => s.processId === removed.id);
  steps.forEach((step) => {
    revertByRef({
      logId: step.rewardLogId,
      entityId: step.id,
      actionType: 'process_step',
      xp: step.xpEarned || 0,
      coins: step.coinsEarned || 0,
      focus: (step.unitsAdded || step.advancedCount || 0) * 10
    });
  });
  // Logs antigos usavam entityId = process.id. Estorna os que sobraram.
  let legacy = findRewardLog(db, { entityId: removed.id, actionType: 'process_step' });
  let guard = 0;
  while (legacy && guard < 500) {
    revertLog(db, legacy.id);
    legacy = findRewardLog(db, { entityId: removed.id, actionType: 'process_step' });
    guard += 1;
  }
  db.processSteps = (db.processSteps || []).filter(s => s.processId !== removed.id);
  return { removed };
}

// ---------------------------------------------------------------------------
// Taverna
// ---------------------------------------------------------------------------

export function createReward(db, { title, description, cost, costCoins, icon, category } = {}) {
  if (!title || !String(title).trim()) return fail('Título é obrigatório');
  let parsedCost;
  try {
    parsedCost = rewardCost(cost != null ? cost : costCoins);
  } catch (err) {
    return asError(err);
  }
  const reward = {
    id: uid('r'),
    title: String(title).trim(),
    description: description || '',
    cost: parsedCost,
    costCoins: parsedCost,
    icon: icon || 'Gift',
    category: category || 'custom',
    timesRedeemed: 0,
    isVirtual: false,
    unlocked: true,
    createdAt: new Date().toISOString()
  };
  if (!db.rewards) db.rewards = [];
  db.rewards.unshift(reward);
  return { reward };
}

export function redeemReward(db, { id, notes } = {}) {
  const reward = (db.rewards || []).find(r => r.id === id);
  if (!reward) return fail('Recompensa não encontrada', 404);
  const cost = readRewardCost(reward);
  if (!Number.isFinite(cost) || cost < 1) {
    return fail('Esta recompensa não tem um custo válido.');
  }
  const balance = db.userProfile?.coins ?? 0;
  if (balance < cost) {
    return fail(`Moedas insuficientes. São necessárias ${cost} moedas e você tem ${balance}.`);
  }
  db.userProfile.coins = balance - cost;
  reward.timesRedeemed = (reward.timesRedeemed || 0) + 1;
  reward.cost = cost;
  reward.costCoins = cost;

  const now = new Date();
  const redemption = {
    id: uid('red'),
    rewardId: reward.id,
    rewardTitle: reward.title,
    title: reward.title,
    cost,
    costCoins: cost,
    icon: reward.icon,
    notes: String(notes || '').trim(),
    timestamp: now.toISOString()
  };
  if (!db.rewardRedemptions) db.rewardRedemptions = [];
  db.rewardRedemptions.unshift(redemption);

  if (!db.actionLogs) db.actionLogs = [];
  const logId = uid('log');
  db.actionLogs.unshift({
    id: logId,
    type: 'reward_redeem',
    entityId: redemption.id,
    title: `Resgatou: ${reward.title}`,
    xp: 0,
    coins: -cost,
    applied: {
      xp: 0,
      coins: -cost,
      wisdom: 0,
      focus: 0,
      willpower: 0,
      consistency: 0,
      bossDamage: 0,
      bossDefeated: false,
      bossId: null,
      bossRewardXp: 0,
      bossRewardCoins: 0,
      levelUps: []
    },
    details: { cost, rewardId: reward.id },
    timestamp: now.toISOString(),
    hour: getSaoPauloHour(now),
    dayOfWeek: getSaoPauloDayOfWeek(now),
    date: getSaoPauloDateStr(now)
  });
  redemption.rewardLogId = logId;
  return { reward, redemption, userProfile: db.userProfile };
}

// ---------------------------------------------------------------------------
// Vitória do dia
// ---------------------------------------------------------------------------

export function completeDailyVictoryUseCase(db, { id, completed, note, durationMinutes: rawDuration } = {}) {
  const todayStr = getSaoPauloDateStr();
  db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
  db.dailyVictoryBonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
  let minutes;
  try {
    minutes = rawDuration == null ? undefined : durationMinutes(rawDuration, { fallback: 0 });
  } catch (err) {
    return asError(err);
  }
  const result = completeDailyVictory(db.dailyVictories, db.dailyVictoryBonuses, id, {
    note,
    completed,
    durationMinutes: minutes,
    today: todayStr
  });
  db.dailyVictories = result.list;
  db.dailyVictoryBonuses = result.bonuses;

  let rewardResult = null;
  let bonusRewardResult = null;
  if (!result.stateUnchanged) {
    db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'victory', result.victory.id);
    if (result.willComplete) {
      markDecisionAccepted(db, { entityId: result.victory.id, kind: 'victory' });
      rewardResult = grant({
        xp: DAILY_VICTORY_REWARDS.xp,
        coins: DAILY_VICTORY_REWARDS.coins,
        willpower: DAILY_VICTORY_REWARDS.willpower,
        actionType: 'daily_victory_complete',
        entityId: result.victory.id,
        title: result.victory.title,
        details: {
          category: result.victory.category,
          date: result.victory.date,
          note: result.victory.note || '',
          durationMinutes: result.victory.durationMinutes || null
        }
      });
      if (rewardResult?.logEntry?.id) result.victory.rewardLogId = rewardResult.logEntry.id;
      if (result.bonusAwardedNow) {
        bonusRewardResult = grant({
          xp: DAILY_VICTORY_TRIPLE_BONUS.xp,
          coins: DAILY_VICTORY_TRIPLE_BONUS.coins,
          willpower: DAILY_VICTORY_TRIPLE_BONUS.willpower,
          consistency: DAILY_VICTORY_TRIPLE_BONUS.consistency,
          actionType: 'daily_victory_triple_bonus',
          entityId: bonusEntityId(result.victory.date),
          title: `Tríade de vitórias — ${result.victory.date}`,
          details: { category: result.victory.category, date: result.victory.date, bonus: true }
        });
        const bonus = db.dailyVictoryBonuses?.[result.victory.date];
        if (bonus && bonusRewardResult?.logEntry?.id) bonus.rewardLogId = bonusRewardResult.logEntry.id;
      }
    } else {
      const victoryLogId = result.victory.rewardLogId;
      delete result.victory.rewardLogId;
      rewardResult = revertByRef({
        logId: victoryLogId,
        entityId: result.victory.id,
        actionType: 'daily_victory_complete',
        xp: DAILY_VICTORY_REWARDS.xp,
        coins: DAILY_VICTORY_REWARDS.coins,
        willpower: DAILY_VICTORY_REWARDS.willpower
      });
      if (result.bonusRevertedNow) {
        const bonus = db.dailyVictoryBonuses?.[result.victory.date];
        bonusRewardResult = revertByRef({
          logId: bonus?.rewardLogId,
          entityId: bonusEntityId(result.victory.date),
          actionType: 'daily_victory_triple_bonus',
          xp: DAILY_VICTORY_TRIPLE_BONUS.xp,
          coins: DAILY_VICTORY_TRIPLE_BONUS.coins,
          willpower: DAILY_VICTORY_TRIPLE_BONUS.willpower,
          consistency: DAILY_VICTORY_TRIPLE_BONUS.consistency
        });
      }
    }
  }
  return { ...result, rewardResult, bonusRewardResult, todayStr };
}

// ---------------------------------------------------------------------------
// Mapas mentais — estorno de sessão
// ---------------------------------------------------------------------------

export function revertMindMapSession(db, session) {
  if (!session) return null;
  const rewards = computeStudyRewards({
    reviewed: session.reviewed || 0,
    recalled: session.recalled || 0,
    durationMinutes: session.durationMinutes || 0
  });
  return revertByRef({
    logId: session.rewardLogId,
    entityId: session.id,
    actionType: 'mind_map_study',
    xp: session.xpEarned || rewards.xp,
    coins: session.coinsEarned || rewards.coins,
    wisdom: rewards.wisdom,
    focus: rewards.focus
  });
}

export function deleteMindMapSession(db, id) {
  if (!db.mindMapSessions) db.mindMapSessions = [];
  const index = db.mindMapSessions.findIndex(s => s.id === id);
  if (index === -1) return fail('Sessão de estudo não encontrada', 404);
  const [removed] = db.mindMapSessions.splice(index, 1);
  const rewardResult = revertMindMapSession(db, removed);
  return { removed, rewardResult };
}

export { DomainError };
