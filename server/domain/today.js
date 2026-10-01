/**
 * Painel "Hoje" e rituais de planejamento / fechamento / revisão semanal.
 * Só lê o snapshot e devolve um payload consolidado — sem efeitos colaterais.
 * Quem grava (rotas, MCP) chama as funções de mutação deste mesmo módulo.
 */

import { previewNextAction } from '../oracleSuggest.js';
import { computeOracleStats } from '../oracleMemory.js';
import { computeCategoryRankings, getWeekBounds } from '../rankings.js';
import {
  addDaysToDateStr,
  getHabitWeeklyStats,
  getSaoPauloDateStr,
  getSaoPauloDayOfWeek,
  getSaoPauloHour
} from '../timeUtils.js';
import { getHabitDueStatus } from '../../src/utils/habitFrequency.js';
import { parseTimeToMinutes } from '../locations.js';
import { summarizePlan, getAguStudyLoadSeries, buildAguHomeostasisStudyVictory } from '../../src/utils/aguCycle.js';
import { collectStudyBlocks } from '../../src/utils/aguStudyEngine.js';
import { getAguSubject } from '../../src/data/aguCurriculum.js';
import { computeMapStats } from '../../src/utils/mindMaps.js';
import {
  MAX_DAILY_VICTORIES,
  createDailyVictory,
  isOverflowDailyVictorySource,
  listVictoriesForDate,
  maxDailyVictoriesForSource,
  summarizeDay
} from '../../src/utils/dailyVictories.js';
import { normalizePriority } from '../../src/utils/activityScale.js';
import { parseDurationMinutes } from '../../src/utils/activityDuration.js';
import { getDb, rewardPlayer, revertLog, findRewardLog } from '../db.js';

function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const PLAN_DAY_BEFORE_HOUR = 12;
export const EVENING_REVIEW_HOUR = 18;
export const DAILY_REVIEW_REWARDS = { xp: 15, consistency: 2 };
export const WEEKLY_FOCUS_REWARDS = { xp: 20, consistency: 1 };
export const MAX_WEEKLY_FOCUSES = 3;
export const STALL_DAYS = 7;

const PRIORITY_RANK = {
  critico: 5,
  importante: 4,
  bom_fazer: 3,
  opcional: 2,
  dispensavel: 1
};

const DECLINE_REASON_LABEL = {
  no_time: 'Sem tempo',
  tired: 'Cansaço',
  wrong_place: 'Lugar errado',
  not_priority: 'Não é prioridade',
  already_done: 'Já fiz',
  other: 'Outro'
};

function phaseOfHour(hour) {
  if (hour < 12) return { id: 'manha', label: 'manhã', greeting: 'Bom dia' };
  if (hour < 18) return { id: 'tarde', label: 'tarde', greeting: 'Boa tarde' };
  return { id: 'noite', label: 'noite', greeting: 'Boa noite' };
}

function daysBetween(fromStr, toStr) {
  if (!fromStr || !toStr) return null;
  const [fy, fm, fd] = String(fromStr).slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = String(toStr).slice(0, 10).split('-').map(Number);
  if (![fy, fm, fd, ty, tm, td].every(Number.isInteger)) return null;
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function decisionDate(item) {
  return String(item?.outcomeAt || item?.resolvedAt || item?.createdAt || '').slice(0, 10);
}

function windowStartMinutes(habit) {
  return parseTimeToMinutes(habit?.timeWindow?.start) ?? 24 * 60;
}

export function habitsDueToday(db, { now = new Date(), todayStr } = {}) {
  const today = todayStr || getSaoPauloDateStr(now);
  return (db.habits || [])
    .map((habit) => {
      if (!habit) return null;
      const weekly = getHabitWeeklyStats(habit, now);
      const due = getHabitDueStatus(habit, weekly, now, today);
      if (!due.due || due.completedToday) return null;
      return {
        id: habit.id,
        title: habit.title,
        category: habit.category || null,
        priority: normalizePriority(habit.priority),
        icon: habit.icon || 'Flame',
        timeWindow: habit.timeWindow || null,
        location: habit.location || 'anywhere',
        frequency: habit.frequency || 'daily',
        currentStreak: habit.currentStreak || 0,
        overdue: !!due.overdue,
        remainingNeeded: due.remainingNeeded || 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const windowCmp = windowStartMinutes(a) - windowStartMinutes(b);
      if (windowCmp) return windowCmp;
      return (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
    });
}

function questAge(quest, todayStr) {
  if (!quest?.dueDate || quest.dueDate >= todayStr) return 0;
  return Math.max(0, daysBetween(quest.dueDate, todayStr) || 0);
}

function procrastinationFlag(quest, todayStr, decisions) {
  const declines = (decisions || []).filter((item) => {
    if (!item || item.entityId !== quest.id) return false;
    const postponed = item.outcome === 'declined' || item.outcome === 'expired' || item.outcome === 'superseded';
    if (!postponed) return false;
    const at = new Date(item.outcomeAt || item.createdAt).getTime();
    return Number.isFinite(at) && Date.now() - at <= 7 * 86400000;
  }).length;
  const overdueDays = questAge(quest, todayStr);
  return declines >= 3 || overdueDays >= STALL_DAYS;
}

export function questsDueAndOverdue(db, todayStr) {
  const decisions = db.oracleDecisions || [];
  return (db.quests || [])
    .filter((quest) => quest && !quest.completed && quest.dueDate && quest.dueDate <= todayStr)
    .map((quest) => {
      const overdueDays = questAge(quest, todayStr);
      return {
        id: quest.id,
        title: quest.title,
        category: quest.category || null,
        priority: normalizePriority(quest.priority),
        dueDate: quest.dueDate,
        dueTime: quest.dueTime || null,
        overdue: overdueDays > 0,
        overdueDays,
        dueToday: quest.dueDate === todayStr,
        procrastinating: procrastinationFlag(quest, todayStr, decisions)
      };
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
      return (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
    });
}

function aguTodaySnapshot(db, todayStr) {
  const plan = db.aguPlan;
  if (!plan?.startedAt) {
    return {
      started: false,
      done: 0,
      remaining: 0,
      total: 0,
      minutesToday: 0,
      targetMinutes: null,
      blocks: []
    };
  }
  const summary = summarizePlan(plan, db.examQuestions || [], todayStr);
  const series = getAguStudyLoadSeries(plan, db.examQuestions || [], todayStr, {
    mindMapSessions: db.mindMapSessions || []
  });
  const blocks = (summary.today?.blocks || []).map((block) => ({
    key: block.key,
    subjectId: block.subjectId,
    subject: block.subject?.name || getAguSubject(block.subjectId)?.name || block.subjectId,
    kind: block.kind || null,
    label: block.kindMeta?.label || block.kind || 'bloco',
    topicName: block.topicName || '',
    done: !!block.done,
    targetMinutes: block.targetMinutes || summary.blockMinutes || null
  }));
  return {
    started: true,
    done: summary.today?.doneCount || 0,
    remaining: Math.max(0, (summary.today?.totalBlocks || 0) - (summary.today?.doneCount || 0)),
    total: summary.today?.totalBlocks || 0,
    minutesToday: series.today?.minutes ?? summary.studyTime?.day ?? 0,
    targetMinutes: series.todayTargetMinutes || series.setpointMinutes || null,
    setpointMinutes: series.setpointMinutes || null,
    coverage: summary.coverage || null,
    blocks
  };
}

function mindMapsDue(db, todayStr) {
  let total = 0;
  let top = null;
  (db.mindMaps || []).forEach((map) => {
    if (!map) return;
    const stats = computeMapStats(map, { today: todayStr });
    const due = stats.dueBranches || 0;
    if (due <= 0) return;
    total += due;
    if (!top || due > top.dueBranches) {
      top = { id: map.id, title: map.title, dueBranches: due };
    }
  });
  return { count: total, top };
}

function stalledBooks(db, todayStr) {
  const sessions = db.readingSessions || [];
  return (db.books || [])
    .filter((book) => book && book.status === 'reading')
    .map((book) => {
      const last = sessions
        .filter((session) => session.bookId === book.id)
        .reduce((max, session) => {
          const date = (session.date || session.timestamp || '').slice(0, 10);
          return date > max ? date : max;
        }, (book.updatedAt || book.createdAt || '').slice(0, 10));
      const stalledDays = last ? daysBetween(last, todayStr) : STALL_DAYS;
      if (stalledDays == null || stalledDays < STALL_DAYS) return null;
      return {
        id: book.id,
        title: book.title,
        author: book.author || '',
        stalledDays,
        currentPage: book.currentPage || 0,
        totalPages: book.totalPages || 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.stalledDays - a.stalledDays);
}

function rankingsAtRisk(db, now) {
  const rankings = computeCategoryRankings(db);
  const daysRemaining = rankings.currentWeek?.daysRemaining ?? 0;
  const atRisk = (rankings.categoriesList || [])
    .filter((item) => item.status === 'at_risk')
    .map((item) => ({
      name: item.category?.name,
      rank: item.currentRank?.name,
      weeklyXp: item.weeklyXp,
      xpNeededToMaintain: item.xpNeededToMaintain,
      daysRemaining,
      color: item.category?.color || null
    }));
  return { atRisk, daysRemaining, weekKey: rankings.currentWeek?.weekKey || null };
}

function oracleDeclinesToday(db, todayStr) {
  return (db.oracleDecisions || [])
    .filter((item) => {
      if (!item) return false;
      if (item.outcome !== 'declined' && item.outcome !== 'expired') return false;
      return decisionDate(item) === todayStr;
    })
    .map((item) => ({
      id: item.id,
      entityId: item.entityId || null,
      title: item.title || item.kind || 'indicação',
      kind: item.kind || null,
      outcome: item.outcome,
      reason: item.declineReason || null,
      reasonLabel: DECLINE_REASON_LABEL[item.declineReason] || item.declineReason || (item.outcome === 'expired' ? 'Expirou' : null)
    }));
}

export function greetingFor(now = new Date(), name = '') {
  const hour = getSaoPauloHour(now);
  const phase = phaseOfHour(hour);
  const who = String(name || '').trim();
  return {
    phase: phase.id,
    phaseLabel: phase.label,
    greeting: who ? `${phase.greeting}, ${who}` : phase.greeting,
    hour
  };
}

/**
 * Payload de GET /api/today. A próxima atividade é só preview (sem decisão gravada).
 */
export function buildTodayPayload(db, { now = new Date(), location } = {}) {
  const todayStr = getSaoPauloDateStr(now);
  const tomorrowStr = addDaysToDateStr(todayStr, 1);
  const hour = getSaoPauloHour(now);
  const profile = db.userProfile || {};
  const greet = greetingFor(now, profile.name);
  const victories = listVictoriesForDate(db.dailyVictories || [], todayStr);
  const summary = summarizeDay(db.dailyVictories || [], todayStr, db.dailyVictoryBonuses || {});
  const dueHabits = habitsDueToday(db, { now, todayStr });
  const quests = questsDueAndOverdue(db, todayStr);
  const agu = aguTodaySnapshot(db, todayStr);
  const maps = mindMapsDue(db, todayStr);
  const books = stalledBooks(db, todayStr);
  const next = previewNextAction(db, { now, location });
  const risk = rankingsAtRisk(db, now);
  const review = (db.dailyReviews || []).find((item) => item && item.date === todayStr) || null;
  const week = currentWeekPlan(db, now);

  return {
    date: todayStr,
    tomorrow: tomorrowStr,
    greeting: greet.greeting,
    phase: greet.phase,
    phaseLabel: greet.phaseLabel,
    hour,
    planning: {
      morningOpen: hour < PLAN_DAY_BEFORE_HOUR && victories.length === 0,
      eveningOpen: hour >= EVENING_REVIEW_HOUR,
      canPlanTomorrow: hour >= EVENING_REVIEW_HOUR,
      suggestions: suggestDayPlan(db, { now, todayStr })
    },
    dailyVictories: {
      items: victories.map((item) => ({
        id: item.id,
        title: item.title,
        category: item.category,
        completed: !!item.completed,
        source: item.source || null,
        questId: item.questId || null
      })),
      planned: summary.plannedCount,
      completed: summary.completedCount,
      allComplete: summary.allComplete
    },
    habitsDue: dueHabits,
    habitsDueCount: dueHabits.length,
    quests,
    agu,
    mindMaps: maps,
    stalledBooks: books,
    nextAction: next.primary
      ? {
        kind: next.primary.kind,
        id: next.primary.id,
        title: next.primary.title,
        reason: next.primary.reason,
        category: next.primary.category,
        openTab: next.primary.openTab || null,
        estimatedMinutes: next.primary.estimatedMinutes || null
      }
      : null,
    rankingsAtRisk: risk.atRisk,
    weekRemainingDays: risk.daysRemaining,
    boss: db.bossRaid
      ? {
        name: db.bossRaid.name,
        level: db.bossRaid.level || 1,
        currentHp: db.bossRaid.currentHp,
        maxHp: db.bossRaid.maxHp,
        defeated: !!db.bossRaid.defeated,
        icon: db.bossRaid.icon || null
      }
      : null,
    streak: profile.streak || 0,
    reviewClosed: !!review,
    weeklyFocuses: week?.focuses || [],
    weekKey: week?.weekKey || risk.weekKey
  };
}

/**
 * Até 3 sugestões para o ritual "Planejar o dia".
 * Homeostase de estudo usa a fonte de overflow; o restante conta no teto manual.
 */
export function suggestDayPlan(db, { now = new Date(), todayStr, date } = {}) {
  const today = todayStr || getSaoPauloDateStr(now);
  const targetDate = date || today;
  const existing = listVictoriesForDate(db.dailyVictories || [], targetDate);
  const takenTitles = new Set(existing.map((item) => String(item.title || '').trim().toLowerCase()));
  const takenQuests = new Set(existing.map((item) => item.questId).filter(Boolean));
  const suggestions = [];

  const homeostasis = buildAguHomeostasisStudyVictory(
    db.aguPlan,
    db.examQuestions || [],
    targetDate,
    { mindMapSessions: db.mindMapSessions || [] }
  );
  if (homeostasis?.title && !takenTitles.has(homeostasis.title.toLowerCase())) {
    suggestions.push({
      key: 'homeostasis-study',
      title: homeostasis.title,
      category: homeostasis.category || 'Estudos',
      source: homeostasis.source,
      reason: 'Piso de estudo da homeostase'
    });
  }

  const critical = (db.quests || [])
    .filter((quest) => quest && !quest.completed && quest.dueDate && quest.dueDate < today)
    .filter((quest) => normalizePriority(quest.priority) === 'critico')
    .filter((quest) => !takenQuests.has(quest.id))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
  if (critical) {
    suggestions.push({
      key: `quest:${critical.id}`,
      title: critical.title,
      category: critical.category || 'Pessoal',
      questId: critical.id,
      reason: `Missão crítica atrasada desde ${critical.dueDate}`
    });
  }

  const agu = aguTodaySnapshot(db, targetDate === today ? today : targetDate);
  const openBlock = (agu.blocks || []).find((block) => !block.done);
  if (openBlock) {
    const title = `AGU: ${openBlock.subject}${openBlock.label ? ` — ${openBlock.label}` : ''}`;
    if (!takenTitles.has(title.toLowerCase())) {
      suggestions.push({
        key: `agu:${openBlock.key}`,
        title,
        category: 'Estudos',
        reason: 'Bloco AGU ainda aberto'
      });
    }
  }

  const criticalHabit = habitsDueToday(db, { now, todayStr: today })
    .find((habit) => habit.priority === 'critico');
  if (criticalHabit && !takenTitles.has(String(criticalHabit.title).toLowerCase())) {
    suggestions.push({
      key: `habit:${criticalHabit.id}`,
      title: criticalHabit.title,
      category: criticalHabit.category || 'Pessoal',
      reason: 'Ritual crítico devido hoje'
    });
  }

  return suggestions.slice(0, 3);
}

export function acceptDayPlan(db, { items, date, now = new Date() } = {}) {
  const todayStr = getSaoPauloDateStr(now);
  const targetDate = date || todayStr;
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Escolha ao menos uma vitória.', status: 400 };
  }
  if (!Array.isArray(db.dailyVictories)) db.dailyVictories = [];
  const created = [];
  const skipped = [];
  items.slice(0, 5).forEach((item) => {
    const title = String(item?.title || '').trim();
    if (!title) return;
    const source = isOverflowDailyVictorySource(item?.source) ? item.source : undefined;
    const cap = maxDailyVictoriesForSource(source);
    const count = listVictoriesForDate(db.dailyVictories, targetDate).length;
    if (count >= cap) {
      skipped.push({ title, reason: `Teto de ${cap} vitórias para este dia.` });
      return;
    }
    try {
      const result = createDailyVictory(db.dailyVictories, {
        title,
        category: item.category,
        date: targetDate,
        source,
        questId: item.questId
      }, { today: todayStr, defaultCategory: 'Pessoal' });
      db.dailyVictories = result.list;
      created.push(result.victory);
    } catch (err) {
      skipped.push({ title, reason: err.message });
    }
  });
  if (!created.length) {
    return { error: skipped[0]?.reason || 'Nenhuma vitória pôde ser criada.', status: 400, skipped };
  }
  return { created, skipped, cap: MAX_DAILY_VICTORIES };
}

function countPending(db, todayStr, now) {
  const victories = listVictoriesForDate(db.dailyVictories || [], todayStr);
  const pendingVictories = victories.filter((item) => !item.completed).length;
  const pendingQuests = questsDueAndOverdue(db, todayStr).filter((item) => item.dueToday || item.overdue).length;
  const pendingHabits = habitsDueToday(db, { now, todayStr }).length;
  return {
    completedCount: victories.filter((item) => item.completed).length,
    pendingCount: pendingVictories + pendingQuests + pendingHabits
  };
}

export function buildEveningReview(db, { now = new Date() } = {}) {
  const todayStr = getSaoPauloDateStr(now);
  const tomorrowStr = addDaysToDateStr(todayStr, 1);
  const victories = listVictoriesForDate(db.dailyVictories || [], todayStr);
  const counts = countPending(db, todayStr, now);
  return {
    date: todayStr,
    tomorrow: tomorrowStr,
    hour: getSaoPauloHour(now),
    available: getSaoPauloHour(now) >= EVENING_REVIEW_HOUR,
    closed: (db.dailyReviews || []).some((item) => item && item.date === todayStr),
    victories: {
      completed: victories.filter((item) => item.completed).map(compactVictory),
      pending: victories.filter((item) => !item.completed).map(compactVictory)
    },
    questsDue: questsDueAndOverdue(db, todayStr).filter((item) => item.dueToday),
    habitsDue: habitsDueToday(db, { now, todayStr }),
    oracle: oracleDeclinesToday(db, todayStr),
    ...counts
  };
}

function compactVictory(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category || null,
    completed: !!item.completed,
    questId: item.questId || null
  };
}

export function sanitizeDailyReview(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = String(raw.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const mood = Number(raw.mood);
  return {
    id: String(raw.id || uid('drev')),
    date,
    note: String(raw.note || '').trim().slice(0, 280),
    mood: Number.isInteger(mood) && mood >= 1 && mood <= 5 ? mood : null,
    completedCount: Math.max(0, Number(raw.completedCount) || 0),
    pendingCount: Math.max(0, Number(raw.pendingCount) || 0),
    rewardLogId: raw.rewardLogId || null,
    createdAt: raw.createdAt || new Date().toISOString()
  };
}

export function sanitizeDailyReviews(list) {
  if (!Array.isArray(list)) return [];
  const byDate = new Map();
  list.forEach((item) => {
    const clean = sanitizeDailyReview(item);
    if (clean) byDate.set(clean.date, clean);
  });
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Fecha o dia uma vez. A recompensa (15 XP, +2 consistência) fica no ledger
 * e é estornada se a revisão for excluída.
 */
export function closeDay(_db, { note, mood, now = new Date() } = {}) {
  const db = getDb();
  if (!Array.isArray(db.dailyReviews)) db.dailyReviews = [];
  const todayStr = getSaoPauloDateStr(now);
  if (db.dailyReviews.some((item) => item && item.date === todayStr)) {
    return { error: 'O dia já foi fechado.', status: 409 };
  }
  const counts = countPending(db, todayStr, now);
  const review = sanitizeDailyReview({
    date: todayStr,
    note,
    mood,
    completedCount: counts.completedCount,
    pendingCount: counts.pendingCount,
    createdAt: now.toISOString()
  });
  const reward = rewardPlayer({
    xp: DAILY_REVIEW_REWARDS.xp,
    consistency: DAILY_REVIEW_REWARDS.consistency,
    actionType: 'daily_review',
    entityId: review.id,
    title: 'Fechar o dia',
    details: { date: todayStr }
  });
  review.rewardLogId = reward.logEntry?.id || null;
  // Mesma razão do foco semanal: o log já foi persistido; a revisão entra no snapshot seguinte.
  const persisted = getDb();
  if (!Array.isArray(persisted.dailyReviews)) persisted.dailyReviews = [];
  persisted.dailyReviews = persisted.dailyReviews.filter((item) => item?.date !== todayStr);
  persisted.dailyReviews.unshift(review);
  return { review, rewardResult: reward, alreadyClosed: false };
}

export function deleteDailyReview(_db, id) {
  const db = getDb();
  if (!Array.isArray(db.dailyReviews)) db.dailyReviews = [];
  const index = db.dailyReviews.findIndex((item) => item && item.id === id);
  if (index === -1) return { error: 'Revisão não encontrada.', status: 404 };
  const [removed] = db.dailyReviews.splice(index, 1);
  const log = findRewardLog(db, {
    logId: removed.rewardLogId,
    entityId: removed.id,
    actionType: 'daily_review',
    date: removed.date
  });
  let rewardResult = null;
  if (log) rewardResult = revertLog(db, log.id, { save: false });
  return { removed, rewardResult };
}

function studyMinutesBetween(db, startStr, endStr) {
  let minutes = 0;
  const add = (dateStr, amount) => {
    if (!dateStr || dateStr < startStr || dateStr > endStr) return;
    minutes += parseDurationMinutes(amount);
  };
  (db.readingSessions || []).forEach((session) => {
    add((session.date || session.timestamp || '').slice(0, 10), session.durationMinutes);
  });
  (db.mindMapSessions || []).forEach((session) => {
    add((session.date || session.timestamp || '').slice(0, 10), session.durationMinutes);
  });
  (db.examQuestions || []).forEach((entry) => {
    add((entry.date || '').slice(0, 10), entry.durationMinutes);
  });
  collectStudyBlocks(db.aguPlan, db.examQuestions || []).forEach((block) => {
    add(block.dateStr, block.durationMinutes);
  });
  return minutes;
}

function habitWeekMet(habit, weekStart, weekEnd) {
  const history = Array.isArray(habit?.history) ? habit.history : [];
  const done = history.filter((date) => date >= weekStart && date <= weekEnd).length;
  const freq = habit?.frequency || 'daily';
  let target = 7;
  if (freq === 'weekdays') target = 5;
  else if (freq === 'weekly' || freq === 'fortnightly' || freq === 'monthly') target = 1;
  else if (freq === 'times_per_week') {
    target = Array.isArray(habit.weekDays) && habit.weekDays.length
      ? habit.weekDays.length
      : Math.max(1, Math.min(7, Number(habit.targetTimesPerWeek) || 3));
  }
  return { done, target, met: done >= target };
}

export function weekKeyOf(now = new Date()) {
  return getWeekBounds(now).weekKey;
}

export function buildWeeklyReview(db, { weekKey, now = new Date() } = {}) {
  const current = getWeekBounds(now);
  const key = weekKey || addDaysToDateStr(current.weekKey, -7);
  const bounds = getWeekBounds(new Date(`${key}T12:00:00-03:00`));
  const start = bounds.weekKey;
  const end = addDaysToDateStr(start, 6);
  const prevStart = addDaysToDateStr(start, -7);
  const prevEnd = addDaysToDateStr(start, -1);
  const rankings = computeCategoryRankings(db);

  const categories = (rankings.categoriesList || []).map((item) => {
    const history = item.history || [];
    const week = history.find((entry) => entry.weekKey === start) || null;
    const previous = history.find((entry) => entry.weekKey === prevStart) || null;
    return {
      name: item.category?.name,
      xp: week?.xp || 0,
      rank: week?.rank || item.currentRank?.name,
      previousRank: previous?.rank || week?.previousRank || null,
      changed: week ? week.rank !== week.previousRank : false,
      status: week?.isClosed === false ? item.status : (week ? 'closed' : null)
    };
  });

  const victories = (db.dailyVictories || []).filter((item) => item && item.date >= start && item.date <= end);
  const planned = victories.length;
  const completed = victories.filter((item) => item.completed).length;

  const habits = (db.habits || []).filter(Boolean).map((habit) => {
    const stats = habitWeekMet(habit, start, end);
    return { id: habit.id, title: habit.title, ...stats };
  });

  const quests = db.quests || [];
  const questsCompleted = quests.filter((quest) => {
    const date = String(quest?.completedAt || '').slice(0, 10);
    return quest?.completed && date >= start && date <= end;
  }).length;
  const questsCreated = quests.filter((quest) => {
    const date = String(quest?.createdAt || '').slice(0, 10);
    return date >= start && date <= end;
  }).length;
  const questsOverdue = quests.filter((quest) => quest && !quest.completed && quest.dueDate && quest.dueDate < end).length;

  const studyMinutes = studyMinutesBetween(db, start, end);
  const previousStudyMinutes = studyMinutesBetween(db, prevStart, prevEnd);

  const stats = computeOracleStats(db, now);
  const declineReasons = Object.entries(stats.declineReasons || {})
    .map(([reason, entry]) => ({
      reason,
      label: DECLINE_REASON_LABEL[reason] || reason,
      count: entry.count || 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const bestHour = Object.entries(stats.byHour || {})
    .filter(([, entry]) => (entry.samples || 0) >= 1)
    .sort((a, b) => (b[1].rate || 0) - (a[1].rate || 0))[0];
  const bestDay = Object.entries(stats.byWeekday || {})
    .filter(([, entry]) => (entry.samples || 0) >= 1)
    .sort((a, b) => (b[1].rate || 0) - (a[1].rate || 0))[0];
  const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  return {
    weekKey: start,
    weekLabel: bounds.weekLabel,
    start,
    end,
    isCurrent: start === current.weekKey,
    categories,
    victories: {
      planned,
      completed,
      rate: planned ? Math.round((completed / planned) * 100) : null
    },
    habits: {
      met: habits.filter((item) => item.met).length,
      missed: habits.filter((item) => !item.met).length,
      items: habits
    },
    quests: { completed: questsCompleted, created: questsCreated, overdue: questsOverdue },
    study: {
      minutes: studyMinutes,
      previousMinutes: previousStudyMinutes,
      delta: studyMinutes - previousStudyMinutes
    },
    oracle: {
      topDeclineReasons: declineReasons,
      bestHour: bestHour ? Number(bestHour[0]) : null,
      bestDay: bestDay ? dayNames[Number(bestDay[0])] || null : null
    },
    plan: currentWeekPlan(db, new Date(`${start}T12:00:00-03:00`))
  };
}

export function sanitizeWeeklyPlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const weekKey = String(raw.weekKey || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return null;
  const focuses = (Array.isArray(raw.focuses) ? raw.focuses : [])
    .map((item) => {
      const title = String(item?.title || '').trim().slice(0, 120);
      if (!title) return null;
      return {
        id: String(item.id || uid('wf')),
        title,
        category: item.category ? String(item.category).trim().slice(0, 40) : null,
        done: !!item.done,
        rewardLogId: item.rewardLogId || null
      };
    })
    .filter(Boolean)
    .slice(0, MAX_WEEKLY_FOCUSES);
  return {
    id: String(raw.id || uid('wp')),
    weekKey,
    focuses,
    note: String(raw.note || '').trim().slice(0, 280),
    createdAt: raw.createdAt || new Date().toISOString()
  };
}

export function sanitizeWeeklyPlans(list) {
  if (!Array.isArray(list)) return [];
  const byWeek = new Map();
  list.forEach((item) => {
    const clean = sanitizeWeeklyPlan(item);
    if (clean) byWeek.set(clean.weekKey, clean);
  });
  return [...byWeek.values()].sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}

export function currentWeekPlan(db, now = new Date()) {
  const key = weekKeyOf(now);
  return (db.weeklyPlans || []).find((item) => item && item.weekKey === key) || null;
}

export function saveWeeklyPlan(_db, { weekKey, focuses, note, now = new Date() } = {}) {
  const db = getDb();
  if (!Array.isArray(db.weeklyPlans)) db.weeklyPlans = [];
  const key = weekKey || weekKeyOf(now);
  const existing = db.weeklyPlans.find((item) => item && item.weekKey === key);
  const incoming = sanitizeWeeklyPlan({
    id: existing?.id,
    weekKey: key,
    focuses: (focuses || []).map((item, index) => ({
      ...(existing?.focuses?.[index] || {}),
      ...item,
      id: item?.id || existing?.focuses?.find((focus) => focus.title === item?.title)?.id
    })),
    note: note ?? existing?.note,
    createdAt: existing?.createdAt || now.toISOString()
  });
  if (!incoming) return { error: 'Semana inválida.', status: 400 };
  if (!incoming.focuses.length) return { error: 'Escolha ao menos um foco.', status: 400 };
  // Preserva o ledger dos focos que continuam com o mesmo id.
  incoming.focuses = incoming.focuses.map((focus) => {
    const prev = (existing?.focuses || []).find((item) => item.id === focus.id);
    if (!prev) return focus;
    return { ...focus, done: prev.done, rewardLogId: prev.rewardLogId };
  });
  if (existing) {
    const index = db.weeklyPlans.indexOf(existing);
    db.weeklyPlans[index] = incoming;
  } else {
    db.weeklyPlans.unshift(incoming);
  }
  return { plan: incoming };
}

/**
 * Marca um foco da semana. A recompensa entra uma vez; desmarcar estorna o log.
 */
export function toggleWeeklyFocus(_db, { weekKey, focusId, done, now = new Date() } = {}) {
  // Sempre o banco vivo: rewardPlayer persiste sozinho e uma cópia antiga
  // apagaria o foco já concluído na segunda chamada.
  const db = getDb();
  const key = weekKey || weekKeyOf(now);
  const plan = (db.weeklyPlans || []).find((item) => item && item.weekKey === key);
  if (!plan) return { error: 'Plano da semana não encontrado.', status: 404 };
  const focus = (plan.focuses || []).find((item) => item.id === focusId);
  if (!focus) return { error: 'Foco não encontrado.', status: 404 };
  const nextDone = done === undefined ? !focus.done : !!done;
  if (nextDone === !!focus.done) return { plan, focus, stateUnchanged: true, rewardResult: null };

  if (nextDone) {
    const reward = rewardPlayer({
      xp: WEEKLY_FOCUS_REWARDS.xp,
      consistency: WEEKLY_FOCUS_REWARDS.consistency,
      actionType: 'weekly_focus',
      entityId: focus.id,
      title: `Foco da semana: ${focus.title}`,
      details: { weekKey: key, category: focus.category }
    });
    // rewardPlayer grava o próprio snapshot; a marca precisa entrar depois,
    // no banco que ele acabou de persistir.
    const persisted = getDb();
    const persistedPlan = (persisted.weeklyPlans || []).find((item) => item && item.weekKey === key);
    const persistedFocus = persistedPlan?.focuses?.find((item) => item.id === focusId);
    if (persistedFocus) {
      persistedFocus.done = true;
      persistedFocus.rewardLogId = reward.logEntry?.id || null;
    }
    return { plan: persistedPlan, focus: persistedFocus, stateUnchanged: false, rewardResult: reward };
  }

  const log = findRewardLog(db, {
    logId: focus.rewardLogId,
    entityId: focus.id,
    actionType: 'weekly_focus'
  });
  let rewardResult = null;
  if (log) rewardResult = revertLog(db, log.id, { save: false });
  focus.done = false;
  focus.rewardLogId = null;
  return { plan, focus, stateUnchanged: false, rewardResult };
}

export function weeklyReviewPrompt(now = new Date()) {
  const day = getSaoPauloDayOfWeek(now);
  const hour = getSaoPauloHour(now);
  const sundayEvening = day === 0 && hour >= EVENING_REVIEW_HOUR;
  const mondayMorning = day === 1 && hour < PLAN_DAY_BEFORE_HOUR;
  return sundayEvening || mondayMorning;
}
