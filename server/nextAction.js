/**
 * Motor de Próxima Atividade — escolhe a melhor missão ou ritual
 * dado lugar, horário, prazos e histórico.
 */

import {
  getSaoPauloDateStr,
  getSaoPauloHour,
  getSaoPauloMinute,
  getSaoPauloDayOfWeek,
  getHabitWeeklyStats,
  getCurrentWeekDays
} from './timeUtils.js';
import {
  normalizeLocation,
  getLocationMeta,
  locationMatches,
  isNowInTimeWindow,
  parseTimeToMinutes,
  guessCurrentLocation,
  applyActivityContext
} from './locations.js';

const PRIORITY_SCORE = { epica: 20, alta: 15, media: 10, baixa: 5 };
const PRIORITY_RANK = { epica: 4, alta: 3, media: 2, baixa: 1 };
const HIST_MIN_SAMPLES = 5;
const WINDOW_GRACE_MINUTES = 15;
const RELEVANT_LOG_TYPES = new Set(['quest_complete', 'habit_complete']);
const HOUR_FIT_MAX = 8;
const DAY_FIT_MAX = 4;

function daysBetween(fromStr, toStr) {
  if (!fromStr || !toStr) return null;
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

function formatDayMonth(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr || '';
  const parts = dateStr.split('-');
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
  const freq = habit.frequency || 'daily';
  const history = Array.isArray(habit.history) ? habit.history : [];
  const completedToday = history.includes(todayStr);
  const dayOfWeek = getSaoPauloDayOfWeek(now);

  if (freq === 'daily') {
    return { due: !completedToday, extra: false, completedToday };
  }
  if (freq === 'weekdays') {
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    return { due: isWeekday && !completedToday, extra: false, completedToday };
  }
  // weekly / times_per_week
  const goalMet = !!weeklyStats?.isGoalMet;
  if (completedToday) return { due: false, extra: false, completedToday };
  if (goalMet) return { due: false, extra: true, completedToday };
  return { due: true, extra: false, completedToday };
}

function urgencyScore(quest, todayStr, nowMinutes) {
  if (!quest?.dueDate) {
    return { score: 8, label: null, overdue: false, dueToday: false, dueSoon: false };
  }
  const delta = daysBetween(todayStr, quest.dueDate);
  if (delta == null) return { score: 8, label: null, overdue: false, dueToday: false, dueSoon: false };

  if (delta < 0) {
    return {
      score: 35,
      label: `Atrasada desde ${formatDayMonth(quest.dueDate)}`,
      overdue: true,
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
  if (extra) return { score: 0, label: 'Meta da semana já batida' };
  const freq = habit.frequency || 'daily';
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

  const target = weeklyStats?.targetTimesPerWeek || habit.targetTimesPerWeek || 1;
  const done = weeklyStats?.completionsThisWeek || 0;
  const remainingNeeded = Math.max(0, target - done);
  const weekDays = getCurrentWeekDays(now);
  // Compara datas civis da semana de `now`, não o "hoje" real do relógio.
  const remainingDays = weekDays.filter(d => d.dateStr >= todayStr).length;
  if (remainingNeeded <= 0) return { score: 0, label: null };
  if (remainingNeeded >= remainingDays) {
    return { score: 10, label: `Faltam ${remainingNeeded}x e restam ${remainingDays} dia(s)` };
  }
  return { score: 5, label: `Faltam ${remainingNeeded}x nesta semana` };
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
  weeklyStats
}) {
  const reasons = [];
  const urgency = kind === 'quest'
    ? urgencyScore(item, todayStr, nowMinutes)
    : { score: 8, label: extra ? 'Extra da semana' : null, overdue: false, dueToday: false, dueSoon: false };

  const priorityKey = kind === 'quest' ? (item.priority || 'media') : 'media';
  const priorityPts = PRIORITY_SCORE[priorityKey] || 10;

  const histograms = pickHistogram(hist, item.id, item.category);
  const hourFit = windowFit(histograms.hour, hour, 1, { wrap: true });
  const dayFit = windowFit(histograms.day, dayOfWeek, 0, { wrap: false });
  const hourPts = Math.round(HOUR_FIT_MAX * hourFit);
  const dayPts = Math.round(DAY_FIT_MAX * dayFit);

  const risk = kind === 'habit'
    ? ritualRiskScore(item, weeklyStats, now, todayStr, extra)
    : { score: 0, label: null };

  const freshPts = freshnessScore(item, todayStr, kind);

  if (urgency.label) reasons.push(urgency.label);
  if (kind === 'quest' && item.priority === 'epica') reasons.push('Prioridade épica');
  else if (kind === 'quest' && item.priority === 'alta' && !urgency.overdue) reasons.push('Prioridade alta');
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

  const nextSubtask = kind === 'quest' ? nextOpenSubtask(item) : null;
  if (nextSubtask?.title) {
    reasons.push(`Próximo passo: ${nextSubtask.title}`);
  }

  const score = urgency.score + priorityPts + hourPts + dayPts + risk.score + freshPts;
  // Prazos concretos não podem perder para pico horário de outro item.
  const urgencyClass = urgency.overdue ? 3 : urgency.dueToday ? 2 : (urgency.dueSoon ? 1 : 0);

  return {
    score,
    reasons: reasons.slice(0, 3),
    urgency,
    urgencyClass,
    hourFit,
    dayFit,
    histSource: histograms.source,
    nextSubtask: nextSubtask ? { id: nextSubtask.id, title: nextSubtask.title } : null
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
    priority: kind === 'quest' ? (item.priority || 'media') : null,
    dueDate: kind === 'quest' ? (item.dueDate || null) : null,
    dueTime: kind === 'quest' ? (item.dueTime || null) : null,
    score: scoring.score,
    urgencyClass: scoring.urgencyClass || 0,
    overdue: !!scoring.urgency?.overdue,
    dueToday: !!scoring.urgency?.dueToday,
    reasons: scoring.reasons,
    reason: scoring.reasons[0] || (kind === 'habit' ? 'Ritual pendente agora' : 'Missão pendente agora'),
    nextSubtask: scoring.nextSubtask,
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

function compareCandidates(a, b) {
  const aClass = a.urgencyClass || 0;
  const bClass = b.urgencyClass || 0;
  if (bClass !== aClass) return bClass - aClass;
  if (b.score !== a.score) return b.score - a.score;
  const aDue = a.dueDate || '9999-99-99';
  const bDue = b.dueDate || '9999-99-99';
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  const aP = PRIORITY_RANK[a.priority] || 0;
  const bP = PRIORITY_RANK[b.priority] || 0;
  if (bP !== aP) return bP - aP;
  const aStreak = a.currentStreak || 0;
  const bStreak = b.currentStreak || 0;
  if (bStreak !== aStreak) return bStreak - aStreak;
  return (a.id || '').localeCompare(b.id || '');
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
  const categories = db.questCategories || [];

  const ctx = resolveContextLocation(db, options, now);
  const location = ctx.location;
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

  const consider = (kind, item, extra, weeklyStats, completedToday) => {
    if (snoozed.has(item.id)) return;
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
      weeklyStats
    });
    const serialized = serializeCandidate(kind, item, scoring, extra, weeklyStats, completedToday);
    if (extra) extras.push(serialized);
    else main.push(serialized);
  };

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
    counts: {
      eligible: main.length,
      extras: extras.length,
      deferred: deferredSource.length,
      deferredByTime: deferredByTimeSource.length
    }
  };
}

export { daysBetween, formatDayMonth };
