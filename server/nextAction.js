/**
 * Motor de Próxima Atividade — escolhe a melhor vitória do dia, missão ou ritual
 * dado lugar, horário, prazos e histórico.
 *
 * Vitória Planejada para o Dia tem prioridade máxima: enquanto houver uma
 * pendente hoje, ela vem antes de qualquer missão ou ritual.
 */

import {
  getSaoPauloDateStr,
  getSaoPauloHour,
  getSaoPauloMinute,
  getSaoPauloDayOfWeek,
  getHabitWeeklyStats
} from './timeUtils.js';
import { canonicalizeHabitFrequency, getHabitDueStatus, isPeriodFrequency, padMonthDay } from '../src/utils/habitFrequency.js';
import {
  normalizeLocation,
  getLocationMeta,
  locationMatches,
  isNowInTimeWindow,
  parseTimeToMinutes,
  guessCurrentLocation,
  applyActivityContext
} from './locations.js';
import {
  DEFAULT_PRIORITY,
  getPriorityMeta,
  isPriorityKey,
  normalizePriority,
  PRIORITY_KEYS,
  PRIORITY_META
} from '../src/utils/activityScale.js';
import { summarizePlan } from '../src/utils/aguCycle.js';
import { getAguSubject } from '../src/data/aguCurriculum.js';
import { computeMapStats } from '../src/utils/mindMaps.js';
import { computeOracleStats, hourSuccessTerm } from './oracleMemory.js';

const LEGACY_PRIORITY_MAP = {
  epica: 'critico',
  alta: 'importante',
  media: 'bom_fazer',
  baixa: 'opcional'
};

function resolvePriorityKey(item) {
  if (isPriorityKey(item?.priority)) return item.priority;
  return LEGACY_PRIORITY_MAP[item?.priority] || DEFAULT_PRIORITY;
}

/** Importante/Crítico formam a faixa alta; o restante, a faixa baixa. */
function priorityBand(priority) {
  return (priority === 'importante' || priority === 'critico') ? 1 : 0;
}
const HIST_MIN_SAMPLES = 5;
const WINDOW_GRACE_MINUTES = 15;
const DECLINE_MEMORY_MS = 7 * 24 * 60 * 60 * 1000;
const WRONG_PLACE_MS = 4 * 60 * 60 * 1000;
const NOT_PRIORITY_MS = 24 * 60 * 60 * 1000;
const STALL_DAYS = 7;
const PROCRASTINATION_DECLINES = 3;
const OVERDUE_TRIAGE_MIN = 3;
const CRITICAL_TRIAGE_DAYS = 7;
const CRITICAL_BOOST_DAYS = 3;
export const STARTER_DOSE_MINUTES = 5;
/** Antes do meio-dia, sem vitória planejada, planejar o dia vem antes de qualquer tarefa. */
export const PLAN_DAY_BEFORE_HOUR = 12;
export const PLAN_DAY_ID = 'plan-day';
const RELEVANT_LOG_TYPES = new Set(['quest_complete', 'habit_complete']);
const HOUR_FIT_MAX = 8;
const DAY_FIT_MAX = 4;

/**
 * Converte 'YYYY-MM-DD' (ou um ISO completo) em milissegundos UTC.
 * Devolve null para qualquer coisa que não seja uma data civil legível —
 * antes um prazo em ISO virava NaN e a tela mostrava "Prazo em NaN dias".
 */
function parseDateParts(value) {
  if (typeof value !== 'string') return null;
  const [year, month, day] = value.trim().slice(0, 10).split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
}

function daysBetween(fromStr, toStr) {
  const from = parseDateParts(fromStr);
  const to = parseDateParts(toStr);
  if (from == null || to == null) return null;
  return Math.round((to - from) / 86400000);
}

function formatDayMonth(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr || '';
  const parts = dateStr.trim().slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}`;
}

function emptyHist(size) {
  return Array(size).fill(0);
}

function bump(map, key, index, size) {
  if (!key && key !== 0) return;
  if (!map[key]) map[key] = emptyHist(size);
  if (index >= 0 && index < size) map[key][index] += 1;
}

function histTotal(arr) {
  return (arr || []).reduce((s, n) => s + n, 0);
}

function windowFit(counts, center, radius = 1, { wrap = true } = {}) {
  const n = (counts || []).length;
  if (!n) return 0.5;
  let peak = 0;
  let current = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let r = -radius; r <= radius; r++) {
      const idx = wrap ? ((i + r + n) % n) : (i + r);
      if (idx < 0 || idx >= n) continue;
      sum += counts[idx] || 0;
    }
    if (sum > peak) peak = sum;
    if (i === center) current = sum;
  }
  if (peak === 0) return 0.5;
  return current / peak;
}

function buildHistoryIndexes(logs) {
  const hourlyGlobal = emptyHist(24);
  const dayGlobal = emptyHist(7);
  const byEntityHour = {};
  const byEntityDay = {};
  const byCategoryHour = {};
  const byCategoryDay = {};

  (logs || []).forEach(log => {
    if (!log || !RELEVANT_LOG_TYPES.has(log.type)) return;
    const h = log.hour !== undefined ? log.hour : (log.timestamp ? getSaoPauloHour(log.timestamp) : -1);
    const d = log.dayOfWeek !== undefined ? log.dayOfWeek : (log.timestamp ? getSaoPauloDayOfWeek(log.timestamp) : -1);
    const category = log.details?.category;
    const entityId = log.entityId;

    if (h >= 0 && h < 24) {
      hourlyGlobal[h] += 1;
      bump(byEntityHour, entityId, h, 24);
      bump(byCategoryHour, category, h, 24);
    }
    if (d >= 0 && d < 7) {
      dayGlobal[d] += 1;
      bump(byEntityDay, entityId, d, 7);
      bump(byCategoryDay, category, d, 7);
    }
  });

  return {
    hourlyGlobal,
    dayGlobal,
    byEntityHour,
    byEntityDay,
    byCategoryHour,
    byCategoryDay
  };
}

function pickHistogram(hist, entityId, category) {
  const entHour = hist.byEntityHour[entityId];
  if (histTotal(entHour) >= HIST_MIN_SAMPLES) {
    return { hour: entHour, day: hist.byEntityDay[entityId] || emptyHist(7), source: 'item' };
  }
  const catHour = hist.byCategoryHour[category];
  if (histTotal(catHour) >= HIST_MIN_SAMPLES) {
    return { hour: catHour, day: hist.byCategoryDay[category] || emptyHist(7), source: 'category' };
  }
  return { hour: hist.hourlyGlobal, day: hist.dayGlobal, source: 'global' };
}

function nextOpenSubtask(quest) {
  const list = Array.isArray(quest?.subtasks) ? quest.subtasks : [];
  return list.find(st => st && !st.completed) || null;
}

function isHabitDueToday(habit, weeklyStats, now, todayStr) {
  return getHabitDueStatus(habit, weeklyStats, now, todayStr);
}

function urgencyScore(quest, todayStr, nowMinutes) {
  if (!quest?.dueDate) {
    return { score: 8, label: null, overdue: false, dueToday: false, dueSoon: false };
  }
  const delta = daysBetween(todayStr, quest.dueDate);
  if (delta == null) return { score: 8, label: null, overdue: false, dueToday: false, dueSoon: false };

  if (delta < 0) {
    const daysOverdue = Math.abs(delta);
    // 1 dia e 40 dias não podem valer o mesmo: a idade do atraso pesa.
    const ageBonus = Math.min(25, Math.round(3 * Math.sqrt(daysOverdue)));
    return {
      score: 35 + ageBonus,
      label: `Atrasada há ${daysOverdue} dia${daysOverdue === 1 ? '' : 's'}`,
      overdue: true,
      daysOverdue,
      dueToday: false,
      dueSoon: false
    };
  }

  if (delta === 0) {
    const dueMin = parseTimeToMinutes(quest.dueTime);
    if (dueMin != null && nowMinutes > dueMin + WINDOW_GRACE_MINUTES) {
      return {
        score: 35,
        label: `Prazo de hoje (${quest.dueTime}) já passou`,
        overdue: true,
        dueToday: true,
        dueSoon: false
      };
    }
    let score = 30;
    if (dueMin != null && Math.abs(dueMin - nowMinutes) <= 120) score = 34;
    return {
      score,
      label: quest.dueTime ? `Vence hoje às ${quest.dueTime}` : 'Vence hoje',
      overdue: false,
      dueToday: true,
      dueSoon: true
    };
  }

  if (delta <= 2) {
    return {
      score: 22,
      label: delta === 1 ? 'Prazo amanhã' : `Prazo em ${delta} dias`,
      overdue: false,
      dueToday: false,
      dueSoon: true
    };
  }
  if (delta <= 7) {
    return {
      score: 14,
      label: `Prazo em ${delta} dias`,
      overdue: false,
      dueToday: false,
      dueSoon: false
    };
  }
  return { score: 8, label: `Prazo em ${delta} dias`, overdue: false, dueToday: false, dueSoon: false };
}

function ritualRiskScore(habit, weeklyStats, now, todayStr, extra) {
  if (extra) return { score: 0, label: 'Meta do período já batida' };
  const freq = canonicalizeHabitFrequency(habit.frequency || 'daily');
  const streak = habit.currentStreak || 0;
  const dayOfWeek = getSaoPauloDayOfWeek(now);

  if (freq === 'daily') {
    if (streak >= 5) return { score: 10, label: `Streak de ${streak} dias em risco` };
    if (streak >= 1) return { score: 7, label: `Streak de ${streak} dias em risco` };
    return { score: 4, label: 'Ritual diário pendente' };
  }

  if (freq === 'weekdays') {
    if (dayOfWeek === 5) return { score: 10, label: 'Sexta: último dia útil da semana' };
    return { score: 6, label: 'Ritual de dia útil pendente' };
  }

  if (isPeriodFrequency(freq)) {
    const period = weeklyStats?.period;
    if (!period?.due) return { score: 0, label: null };
    const remainingDays = Math.max(0, daysBetween(todayStr, period.end) ?? 0) + 1;
    const daysLabel = period.monthDays.map(padMonthDay).join(' e ');
    if (remainingDays <= 2) {
      return {
        score: 10,
        label: freq === 'monthly'
          ? `Últimos dias do ciclo mensal (dia ${daysLabel})`
          : `Últimos dias da quinzena (dias ${daysLabel})`
      };
    }
    return {
      score: 6,
      label: freq === 'monthly'
        ? `Ritual mensal pendente desde o dia ${daysLabel}`
        : `Ritual quinzenal pendente (dias ${daysLabel})`
    };
  }

  const due = getHabitDueStatus(habit, weeklyStats, now, todayStr);
  const remainingNeeded = due.remainingNeeded;
  const remainingDays = due.remainingScheduledDays;
  if (remainingNeeded <= 0) return { score: 0, label: null };
  if (due.overdue && remainingNeeded >= remainingDays) {
    return { score: 10, label: `Atrasado: faltam ${remainingNeeded}x e restam ${remainingDays} dia(s)` };
  }
  if (remainingNeeded >= remainingDays) {
    return { score: 10, label: `Faltam ${remainingNeeded}x e restam ${remainingDays} dia(s)` };
  }
  if (due.overdue) {
    return { score: 8, label: `Atrasado: faltam ${remainingNeeded}x nesta semana` };
  }
  return { score: 5, label: `Faltam ${remainingNeeded}x nesta semana` };
}

function stepPriorityDown(priority) {
  const key = normalizePriority(priority);
  const index = PRIORITY_KEYS.indexOf(key);
  if (index <= 0) return key;
  return PRIORITY_KEYS[index - 1];
}

/**
 * Memória de recusa por entidade. wrong_place exclui naquele lugar por 4h;
 * no_time/tired pedem dose pequena; not_priority desce um degrau por 24h;
 * 3+ recusas/expirações em 7 dias marcam procrastinação.
 */
export function buildDeclineMemory(decisions, { now = new Date(), location = null } = {}) {
  const reference = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const byEntity = {};
  (decisions || []).forEach(item => {
    if (!item?.entityId) return;
    const at = new Date(item.outcomeAt || item.resolvedAt || item.createdAt).getTime();
    if (!Number.isFinite(at)) return;
    const age = reference - at;
    if (age < 0 || age > DECLINE_MEMORY_MS) return;
    const postponed = item.outcome === 'declined' || item.outcome === 'expired' || item.outcome === 'superseded';
    if (!postponed) return;
    if (!byEntity[item.entityId]) {
      byEntity[item.entityId] = {
        declines: 0,
        preferSmallDose: false,
        priorityStepDown: false,
        excludedLocation: null
      };
    }
    const memory = byEntity[item.entityId];
    memory.declines += 1;
    if (item.outcome === 'declined' && age <= WRONG_PLACE_MS && item.declineReason === 'wrong_place') {
      memory.excludedLocation = item.location || null;
    }
    if (item.outcome === 'declined' && (item.declineReason === 'no_time' || item.declineReason === 'tired')) {
      memory.preferSmallDose = true;
    }
    if (item.outcome === 'declined' && item.declineReason === 'not_priority' && age <= NOT_PRIORITY_MS) {
      memory.priorityStepDown = true;
    }
  });
  return { byEntity, location };
}

function procrastinationOf(kind, item, todayStr, memory, urgency) {
  const reasons = [];
  const declines = memory?.declines || 0;
  if (declines >= PROCRASTINATION_DECLINES) reasons.push(`${declines} recusas ou expirações em 7 dias`);
  const daysOverdue = urgency?.daysOverdue || 0;
  if (kind === 'quest' && daysOverdue >= STALL_DAYS) reasons.push(`Atrasada há ${daysOverdue} dias`);
  if (kind === 'quest') {
    const created = (item.createdAt || '').slice(0, 10);
    const age = created ? daysBetween(created, todayStr) : null;
    const subtasks = Array.isArray(item.subtasks) ? item.subtasks : [];
    const progress = subtasks.some(st => st && st.completed);
    if (age != null && age >= 14 && subtasks.length > 0 && !progress && !item.completed) {
      reasons.push('Pendente há 14 dias ou mais, sem subtarefa concluída');
    } else if (age != null && age >= 14 && subtasks.length === 0 && !item.dueDate) {
      reasons.push('Pendente há 14 dias ou mais, sem ser quebrada em passos');
    }
  }
  return {
    flagged: reasons.length > 0,
    reasons,
    postponeCount: declines,
    daysOverdue
  };
}

function freshnessScore(item, todayStr, kind) {
  const created = (item.createdAt || '').slice(0, 10);
  if (!created) return kind === 'quest' ? 2 : 1;
  const age = daysBetween(created, todayStr);
  if (age == null || age < 0) return 1;
  if (kind === 'habit') return 2;
  return Math.min(5, Math.floor(age / 7) + (age >= 3 ? 1 : 0));
}

function resolveContextLocation(db, options, now) {
  if (options.location) {
    return { location: normalizeLocation(options.location), source: 'request' };
  }
  const profile = db.userProfile || {};
  if (profile.locationManual && profile.currentLocation) {
    return { location: normalizeLocation(profile.currentLocation), source: 'saved' };
  }
  const habits = db.habits || [];
  const todayStr = getSaoPauloDateStr(now);
  const preferGym = habits.some(h => {
    const loc = normalizeLocation(h.location || 'anywhere');
    if (loc !== 'gym') return false;
    const weekly = getHabitWeeklyStats(h, now);
    const due = isHabitDueToday(h, weekly, now, todayStr);
    return due.due;
  });
  return {
    location: guessCurrentLocation(now, { preferGym }),
    source: 'guessed'
  };
}

function scoreCandidate({
  kind,
  item,
  todayStr,
  now,
  nowMinutes,
  hour,
  dayOfWeek,
  hist,
  extra,
  weeklyStats,
  declineMemory,
  oracleStats
}) {
  const reasons = [];
  const memory = declineMemory?.byEntity?.[item.id] || null;

  if (kind === 'plan_day') {
    return {
      score: 200,
      reasons: [item.reason || 'O dia ainda não tem vitórias planejadas'],
      urgency: { score: 50, label: item.reason, overdue: false, dueToday: true, dueSoon: true },
      urgencyClass: 5,
      hourFit: 1,
      dayFit: 1,
      histSource: 'plan',
      nextSubtask: null,
      procrastination: { flagged: false, reasons: [], postponeCount: 0, daysOverdue: 0 },
      firstStep: null,
      preferSmallDose: false,
      effectivePriority: 'critico'
    };
  }

  if (kind === 'agu' || kind === 'mindmap' || kind === 'reading') {
    const base = kind === 'reading' ? 6 : (kind === 'mindmap' ? 11 : 16);
    if (item.reason) reasons.push(item.reason);
    return {
      score: base,
      reasons: reasons.slice(0, 3),
      urgency: { score: base, label: item.reason || null, overdue: false, dueToday: kind !== 'reading', dueSoon: false },
      urgencyClass: 0,
      hourFit: 0.5,
      dayFit: 0.5,
      histSource: 'plan',
      nextSubtask: null,
      procrastination: { flagged: false, reasons: [], postponeCount: 0, daysOverdue: 0 },
      firstStep: null,
      preferSmallDose: false,
      effectivePriority: kind === 'reading' ? 'opcional' : 'bom_fazer'
    };
  }

  // A vitória do dia não disputa ponto com ninguém: ela é o plano do dia.
  if (kind === 'victory') {
    const remaining = Math.max(0, (item.plannedCount || 1) - (item.completedCount || 0));
    reasons.push(remaining > 1
      ? `Vitória planejada para hoje · faltam ${remaining}`
      : 'Vitória planejada para hoje');
    if (item.category) reasons.push(item.category);
    return {
      score: 100,
      reasons: reasons.slice(0, 3),
      urgency: { score: 40, label: reasons[0], overdue: false, dueToday: true, dueSoon: true },
      urgencyClass: 4,
      hourFit: 1,
      dayFit: 1,
      histSource: 'plan',
      nextSubtask: null,
      procrastination: { flagged: false, reasons: [], postponeCount: 0, daysOverdue: 0 },
      firstStep: null,
      preferSmallDose: false,
      effectivePriority: 'critico'
    };
  }

  const urgency = kind === 'quest'
    ? urgencyScore(item, todayStr, nowMinutes)
    : { score: 8, label: extra ? 'Extra da semana' : null, overdue: false, dueToday: false, dueSoon: false };

  let priorityKey = resolvePriorityKey(item);
  if (memory?.priorityStepDown) priorityKey = stepPriorityDown(priorityKey);
  const priorityMeta = getPriorityMeta(priorityKey);
  const priorityPts = priorityMeta.score;

  const histograms = pickHistogram(hist, item.id, item.category);
  const hourFit = windowFit(histograms.hour, hour, 1, { wrap: true });
  const dayFit = windowFit(histograms.day, dayOfWeek, 0, { wrap: false });
  const hourPts = Math.round(HOUR_FIT_MAX * hourFit);
  const dayPts = Math.round(DAY_FIT_MAX * dayFit);

  const risk = kind === 'habit'
    ? ritualRiskScore(item, weeklyStats, now, todayStr, extra)
    : { score: 0, label: null };

  const freshPts = freshnessScore(item, todayStr, kind);
  const hourSuccessPts = hourSuccessTerm(oracleStats, hour);
  const declinePenalty = memory ? Math.min(18, 6 * memory.declines) : 0;

  if (urgency.label && (kind !== 'quest' || !urgency.overdue || priorityKey === 'critico' || priorityKey === 'importante')) {
    reasons.push(urgency.label);
  } else if (urgency.label && urgency.overdue) {
    reasons.push(urgency.label);
  }
  if (priorityKey === 'critico') reasons.push('Prioridade crítica');
  else if (priorityKey === 'importante' && !urgency.overdue) reasons.push('Prioridade importante');
  else if (priorityKey === 'dispensavel') reasons.push('Prioridade dispensável');
  if (risk.label) reasons.push(risk.label);

  const locMeta = getLocationMeta(item.location);
  if (item.location && item.location !== 'anywhere') {
    reasons.push(`Lugar: ${locMeta.label}`);
  }
  if (item.timeWindow) {
    reasons.push(`Janela ${item.timeWindow.start}–${item.timeWindow.end}`);
  }
  if (histograms.source === 'category' && hourFit >= 0.75) {
    reasons.push(`Horário forte para ${item.category || 'esta categoria'}`);
  } else if (histograms.source === 'global' && hourFit >= 0.85) {
    reasons.push('Dentro do seu pico de produtividade');
  }

  const procrastination = procrastinationOf(kind, item, todayStr, memory, urgency);
  const nextSubtask = kind === 'quest' ? nextOpenSubtask(item) : null;
  let firstStep = null;
  if (procrastination.flagged && kind === 'quest') {
    if (nextSubtask?.title) {
      firstStep = { mode: 'subtask', subtaskId: nextSubtask.id, title: nextSubtask.title, minutes: STARTER_DOSE_MINUTES };
      reasons.unshift(`Primeiro passo: ${nextSubtask.title}`);
    } else {
      firstStep = {
        mode: 'starter',
        title: 'Quebre em 3 passos',
        minutes: STARTER_DOSE_MINUTES,
        suggestion: 'Quebre em 3 passos e faça só o primeiro, por 5 minutos.'
      };
      reasons.unshift('Procrastinando: quebre em 3 passos');
    }
  } else if (nextSubtask?.title) {
    reasons.push(`Próximo passo: ${nextSubtask.title}`);
  }
  if (memory?.preferSmallDose && !firstStep) {
    reasons.push('Recusou por tempo ou cansaço: comece pequeno');
  }

  const score = urgency.score + priorityPts + hourPts + dayPts + risk.score + freshPts + hourSuccessPts - declinePenalty;
  // Dentro da mesma faixa de prioridade, prazos concretos não perdem para pico horário.
  const urgencyClass = urgency.overdue ? 3 : urgency.dueToday ? 2 : (urgency.dueSoon ? 1 : 0);

  return {
    score,
    reasons: reasons.slice(0, 3),
    urgency,
    urgencyClass,
    hourFit,
    dayFit,
    histSource: histograms.source,
    nextSubtask: nextSubtask ? { id: nextSubtask.id, title: nextSubtask.title } : null,
    procrastination,
    firstStep,
    preferSmallDose: !!memory?.preferSmallDose,
    effectivePriority: priorityKey,
    declinePenalty
  };
}

function serializeCandidate(kind, item, scoring, extra, weeklyStats, completedToday) {
  const loc = getLocationMeta(item.location);
  return {
    kind,
    id: item.id,
    title: item.title,
    category: item.category || null,
    location: loc.id,
    locationLabel: loc.label,
    locationEmoji: loc.emoji,
    timeWindow: item.timeWindow || null,
    priority: scoring.effectivePriority || resolvePriorityKey(item),
    dueDate: kind === 'quest' ? (item.dueDate || null) : null,
    estimatedMinutes: item.estimatedMinutes || null,
    openTab: item.openTab || null,
    blockKey: item.blockKey || null,
    dueTime: kind === 'quest' ? (item.dueTime || null) : null,
    score: scoring.score,
    urgencyClass: scoring.urgencyClass || 0,
    overdue: !!scoring.urgency?.overdue,
    dueToday: !!scoring.urgency?.dueToday,
    reasons: scoring.reasons,
    reason: scoring.reasons[0] || (kind === 'victory'
      ? 'Vitória planejada para hoje'
      : (kind === 'habit' ? 'Ritual pendente agora' : 'Missão pendente agora')),
    nextSubtask: scoring.nextSubtask,
    procrastination: scoring.procrastination || { flagged: false, reasons: [], postponeCount: 0, daysOverdue: 0 },
    firstStep: scoring.firstStep || null,
    preferSmallDose: !!scoring.preferSmallDose,
    daysOverdue: scoring.urgency?.daysOverdue || 0,
    extra: !!extra,
    frequency: kind === 'habit' ? (item.frequency || 'daily') : null,
    currentStreak: kind === 'habit' ? (item.currentStreak || 0) : null,
    completedToday: kind === 'habit' ? !!completedToday : false,
    weekly: kind === 'habit' ? {
      completionsThisWeek: weeklyStats?.completionsThisWeek || 0,
      targetTimesPerWeek: weeklyStats?.targetTimesPerWeek || 0,
      isGoalMet: !!weeklyStats?.isGoalMet
    } : null,
    xpReward: item.xpReward,
    coinReward: item.coinReward
  };
}

function compareDueDate(a, b) {
  const aDue = a.dueDate || '9999-99-99';
  const bDue = b.dueDate || '9999-99-99';
  if (aDue === bDue) return 0;
  return aDue < bDue ? -1 : 1;
}

function compareUrgencyThenScore(a, b) {
  const aClass = a.urgencyClass || 0;
  const bClass = b.urgencyClass || 0;
  if (bClass !== aClass) return bClass - aClass;
  if (b.score !== a.score) return b.score - a.score;
  return compareDueDate(a, b);
}

function comparePriorityRank(a, b) {
  const aP = PRIORITY_META[a.priority]?.rank || 0;
  const bP = PRIORITY_META[b.priority]?.rank || 0;
  return bP - aP;
}

function isCriticalOverdueBoost(item) {
  return item?.kind === 'quest'
    && item.priority === 'critico'
    && (item.daysOverdue || 0) >= CRITICAL_BOOST_DAYS;
}

function compareCandidates(a, b) {
  // Planejar o dia, de manhã e sem vitórias, vem antes de qualquer tarefa.
  const aPlan = a.kind === 'plan_day' ? 1 : 0;
  const bPlan = b.kind === 'plan_day' ? 1 : 0;
  if (bPlan !== aPlan) return bPlan - aPlan;

  // Vitória planejada para hoje vem antes de missão e ritual.
  const aVictory = a.kind === 'victory' ? 1 : 0;
  const bVictory = b.kind === 'victory' ? 1 : 0;
  if (bVictory !== aVictory) return bVictory - aVictory;

  // Crítica atrasada há 3+ dias vem logo depois das vitórias, acima do ritual.
  const aBoost = isCriticalOverdueBoost(a) ? 1 : 0;
  const bBoost = isCriticalOverdueBoost(b) ? 1 : 0;
  if (bBoost !== aBoost) return bBoost - aBoost;

  // Faixa alta (Importante/Crítico) sempre vence Dispensável/Opcional/Bom fazer.
  const aBand = priorityBand(a.priority);
  const bBand = priorityBand(b.priority);
  if (bBand !== aBand) return bBand - aBand;

  if (aBand === 1) {
    // Entre Importante e Crítico, o prazo manda.
    const urgencyCmp = compareUrgencyThenScore(a, b);
    if (urgencyCmp) return urgencyCmp;
    const priorityCmp = comparePriorityRank(a, b);
    if (priorityCmp) return priorityCmp;
  } else {
    // Na faixa baixa, prioridade vale mais que prazo.
    const priorityCmp = comparePriorityRank(a, b);
    if (priorityCmp) return priorityCmp;
    const urgencyCmp = compareUrgencyThenScore(a, b);
    if (urgencyCmp) return urgencyCmp;
  }

  const aOrder = a.planOrder || 0;
  const bOrder = b.planOrder || 0;
  if (aOrder !== bOrder) return aOrder - bOrder;
  const aStreak = a.currentStreak || 0;
  const bStreak = b.currentStreak || 0;
  if (bStreak !== aStreak) return bStreak - aStreak;
  return (a.id || '').localeCompare(b.id || '');
}

function buildTriage(candidates) {
  const overdue = candidates.filter(item => item.kind === 'quest' && item.overdue);
  const criticalOld = overdue.some(item => item.priority === 'critico' && (item.daysOverdue || 0) >= CRITICAL_TRIAGE_DAYS);
  if (overdue.length <= OVERDUE_TRIAGE_MIN && !criticalOld) return null;
  const items = overdue
    .slice()
    .sort((a, b) => {
      const priority = comparePriorityRank(a, b);
      if (priority) return priority;
      return (b.daysOverdue || 0) - (a.daysOverdue || 0);
    })
    .slice(0, 8)
    .map(item => ({
      id: item.id,
      title: item.title,
      priority: item.priority,
      dueDate: item.dueDate,
      daysOverdue: item.daysOverdue || 0,
      category: item.category
    }));
  return {
    items,
    suggestion: 'Faça 1 hoje e remarque o resto.'
  };
}

function aguCandidate(db, todayStr) {
  const plan = db.aguPlan;
  if (!plan?.startedAt) return null;
  let summary;
  try {
    summary = summarizePlan(plan, db.examQuestions || [], todayStr);
  } catch {
    return null;
  }
  const block = (summary?.today?.blocks || []).find(item => item && !item.done);
  if (!block) return null;
  const subject = block.subject?.name || getAguSubject(block.subjectId)?.name || block.subjectId;
  const kindLabel = block.kindMeta?.label || block.kind || 'bloco';
  return {
    id: `agu:${block.key}`,
    title: `${subject}: ${kindLabel}`,
    description: block.topicName || '',
    category: 'Estudos',
    location: 'anywhere',
    priority: 'bom_fazer',
    reason: 'Bloco AGU de hoje',
    estimatedMinutes: Math.min(
      block.targetMinutes || summary.blockMinutes || 30,
      Math.max(10, (summary.homeostasis?.todayTargetMinutes || 30) - (summary.homeostasis?.today?.minutes || 0))
    ),
    blockKey: block.key,
    subjectId: block.subjectId,
    topicId: block.topicId || null,
    openTab: 'agu'
  };
}

function mindMapCandidate(db, todayStr) {
  let best = null;
  let bestDue = 0;
  (db.mindMaps || []).forEach(map => {
    if (!map) return;
    const stats = computeMapStats(map, { today: todayStr });
    if ((stats.dueBranches || 0) > bestDue) {
      best = map;
      bestDue = stats.dueBranches;
    }
  });
  if (!best || bestDue <= 0) return null;
  return {
    id: best.id,
    title: best.title,
    description: best.description || '',
    category: 'Estudos',
    location: 'anywhere',
    priority: 'bom_fazer',
    reason: `${bestDue} ramo${bestDue === 1 ? '' : 's'} vencido${bestDue === 1 ? '' : 's'}`,
    estimatedMinutes: 10,
    dueBranches: bestDue,
    openTab: 'maps'
  };
}

function stalledBookCandidate(db, todayStr) {
  const sessions = db.readingSessions || [];
  let best = null;
  let bestDays = 0;
  (db.books || []).forEach(book => {
    if (!book || book.status !== 'reading') return;
    const own = sessions.filter(session => session.bookId === book.id);
    const last = own.reduce((max, session) => {
      const date = (session.date || session.timestamp || '').slice(0, 10);
      return date > max ? date : max;
    }, (book.updatedAt || book.createdAt || '').slice(0, 10));
    const stalled = last ? daysBetween(last, todayStr) : STALL_DAYS;
    if (stalled == null || stalled < STALL_DAYS) return;
    if (stalled > bestDays) {
      best = book;
      bestDays = stalled;
    }
  });
  if (!best) return null;
  return {
    id: best.id,
    title: best.title,
    description: best.author || '',
    category: best.category || 'Estudos',
    location: 'anywhere',
    priority: 'opcional',
    reason: `Livro parado há ${bestDays} dias — leia 10 min`,
    estimatedMinutes: 10,
    stalledDays: bestDays,
    openTab: 'books'
  };
}

function countDeferred(eligibleWrongPlace) {
  const map = {};
  eligibleWrongPlace.forEach(item => {
    const loc = normalizeLocation(item.location);
    if (loc === 'anywhere') return;
    if (!map[loc]) {
      const meta = getLocationMeta(loc);
      map[loc] = {
        location: loc,
        locationLabel: meta.label,
        locationEmoji: meta.emoji,
        count: 0,
        sampleTitles: []
      };
    }
    map[loc].count += 1;
    if (map[loc].sampleTitles.length < 2) {
      map[loc].sampleTitles.push(item.title);
    }
  });
  return Object.values(map).sort((a, b) => b.count - a.count);
}

/**
 * @param {object} db snapshot do grimório
 * @param {{ location?: string, now?: Date, snoozedIds?: string[] }} [options]
 */
export function computeNextAction(db, options = {}) {
  const now = options.now instanceof Date ? options.now : (options.now ? new Date(options.now) : new Date());
  const todayStr = getSaoPauloDateStr(now);
  const hour = getSaoPauloHour(now);
  const minute = getSaoPauloMinute(now);
  const nowMinutes = hour * 60 + minute;
  const dayOfWeek = getSaoPauloDayOfWeek(now);
  const snoozed = new Set((options.snoozedIds || []).filter(Boolean));
  (db.oracleSnoozes || []).forEach(item => {
    if (!item?.entityId || !item.expiresAt) return;
    if (new Date(item.expiresAt).getTime() > now.getTime()) snoozed.add(item.entityId);
  });
  const categories = db.questCategories || [];
  const ctx = resolveContextLocation(db, options, now);
  const location = ctx.location;
  const declineMemory = buildDeclineMemory(db.oracleDecisions, { now, location });
  const oracleStats = options.oracleStats || computeOracleStats(db, now);
  const locMeta = getLocationMeta(location);
  const hist = buildHistoryIndexes(db.actionLogs || []);

  const main = [];
  const extras = [];
  const deferredSource = [];
  const deferredByTimeSource = [];

  const prepareItem = (item) => {
    const copy = { ...item };
    applyActivityContext(copy, {}, categories);
    return copy;
  };

  const consider = (kind, item, extra, weeklyStats, completedToday, order = 0) => {
    if (snoozed.has(item.id)) return;
    const memory = declineMemory.byEntity[item.id];
    if (memory?.excludedLocation && memory.excludedLocation === location && location !== 'anywhere') return;
    const scoring = scoreCandidate({
      kind,
      item,
      todayStr,
      now,
      nowMinutes,
      hour,
      dayOfWeek,
      hist,
      extra,
      weeklyStats,
      declineMemory,
      oracleStats
    });
    const serialized = serializeCandidate(kind, item, scoring, extra, weeklyStats, completedToday);
    // A ordem de cadastro desempata as vitórias do dia entre si.
    serialized.planOrder = order;
    if (extra) extras.push(serialized);
    else main.push(serialized);
  };

  // Vitória planejada para hoje: prioridade máxima, na ordem em que foi cadastrada.
  const victoriesToday = (db.dailyVictories || []).filter(v => v && v.date === todayStr);
  // Manhã sem plano: a próxima atividade é planejar, não uma tarefa solta.
  // Opt-in: o cartão e o painel Hoje pedem; chamadas antigas do motor não mudam.
  if (options.includePlanDay && hour < PLAN_DAY_BEFORE_HOUR && victoriesToday.length === 0 && !snoozed.has(PLAN_DAY_ID)) {
    consider('plan_day', {
      id: PLAN_DAY_ID,
      title: 'Planejar o dia',
      category: null,
      location: 'anywhere',
      priority: 'critico',
      reason: 'Nenhuma vitória planejada para hoje',
      openTab: 'today',
      estimatedMinutes: 3
    }, false, null, false);
  }

  const victoryPlan = {
    plannedCount: victoriesToday.length,
    completedCount: victoriesToday.filter(v => v.completed).length
  };
  (db.dailyVictories || []).forEach((victory, index) => {
    if (!victory || victory.completed || victory.date !== todayStr) return;
    // A vitória do dia vale em qualquer lugar, salvo se ela mesma tiver um
    // lugar definido. Sem isso, a categoria (INSS → Escritório) a esconderia
    // sempre que o herói estivesse em casa.
    const item = prepareItem({ ...victory, location: victory.location || 'anywhere', ...victoryPlan });
    const windowOk = isNowInTimeWindow(item.timeWindow, nowMinutes, WINDOW_GRACE_MINUTES);
    const placeOk = locationMatches(item.location, location);
    if (!placeOk) {
      deferredSource.push(item);
      return;
    }
    if (!windowOk) {
      deferredByTimeSource.push({ kind: 'victory', item });
      return;
    }
    consider('victory', item, false, null, false, index);
  });

  (db.quests || []).forEach(quest => {
    if (!quest || quest.completed) return;
    const item = prepareItem(quest);
    const windowOk = isNowInTimeWindow(item.timeWindow, nowMinutes, WINDOW_GRACE_MINUTES);
    const placeOk = locationMatches(item.location, location);
    if (!placeOk) {
      deferredSource.push(item);
      return;
    }
    if (!windowOk) {
      deferredByTimeSource.push({ kind: 'quest', item });
      return;
    }
    consider('quest', item, false, null, false);
  });

  (db.habits || []).forEach(habit => {
    if (!habit) return;
    const item = prepareItem(habit);
    const weeklyStats = getHabitWeeklyStats(item, now);
    const due = isHabitDueToday(item, weeklyStats, now, todayStr);
    if (!due.due && !due.extra) return;
    const windowOk = isNowInTimeWindow(item.timeWindow, nowMinutes, WINDOW_GRACE_MINUTES);
    const placeOk = locationMatches(item.location, location);
    if (!placeOk) {
      if (due.due) deferredSource.push(item);
      return;
    }
    if (!windowOk) {
      if (due.due) deferredByTimeSource.push({ kind: 'habit', item });
      return;
    }
    consider('habit', item, due.extra, weeklyStats, due.completedToday);
  });

  const studyCandidates = [
    ['agu', aguCandidate(db, todayStr)],
    ['mindmap', mindMapCandidate(db, todayStr)],
    ['reading', stalledBookCandidate(db, todayStr)]
  ];
  studyCandidates.forEach(([kind, item]) => {
    if (!item) return;
    if (!locationMatches(item.location || 'anywhere', location)) return;
    consider(kind, item, false, null, false);
  });

  main.sort(compareCandidates);
  extras.sort(compareCandidates);

  let primary = main[0] || null;
  let queue = main.slice(1, 4);
  if (!primary && extras.length > 0) {
    primary = extras[0];
    queue = extras.slice(1, 3);
  }

  const deferredByLocation = countDeferred(deferredSource);
  const deferredByTime = deferredByTimeSource
    .slice()
    .sort((a, b) => {
      const aStart = parseTimeToMinutes(a.item?.timeWindow?.start) ?? 0;
      const bStart = parseTimeToMinutes(b.item?.timeWindow?.start) ?? 0;
      return aStart - bStart;
    })
    .slice(0, 4)
    .map(({ kind, item }) => ({
      id: item.id,
      kind,
      title: item.title,
      timeWindow: item.timeWindow || null
    }));

  let emptyReason = null;
  if (!primary) {
    if (deferredByLocation.length > 0) {
      const first = deferredByLocation[0];
      emptyReason = `${first.count} atividade(s) te esperam em ${first.locationLabel}.`;
    } else if (deferredByTime.length > 0) {
      const first = deferredByTime[0];
      const windowLabel = first.timeWindow
        ? `${first.timeWindow.start}–${first.timeWindow.end}`
        : 'outra janela';
      emptyReason = `${deferredByTime.length} atividade(s) neste lugar só entram na janela ${windowLabel}.`;
    } else {
      emptyReason = 'Nada pendente neste lugar e neste horário. O Boss pode esperar.';
    }
  }

  return {
    context: {
      location,
      locationLabel: locMeta.label,
      locationEmoji: locMeta.emoji,
      locationSource: ctx.source,
      date: todayStr,
      hour,
      minute,
      dayOfWeek,
      nowMinutes
    },
    primary,
    queue,
    extras: extras.filter(e => !primary || e.id !== primary.id).slice(0, 3),
    deferredByLocation,
    deferredByTime,
    emptyReason,
    triage: buildTriage(main),
    counts: {
      eligible: main.length,
      extras: extras.length,
      deferred: deferredSource.length,
      deferredByTime: deferredByTimeSource.length
    }
  };
}

export { daysBetween, formatDayMonth, urgencyScore, buildTriage };
