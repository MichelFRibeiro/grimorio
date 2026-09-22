/**
 * Vitórias Planejadas para o Dia
 * Até 3 tarefas independentes das missões; categorias iguais às das missões.
 * Cadastro: no próprio dia ou no dia anterior (amanhã).
 * Botões de homeostase (estudo AGU / leitura) podem ir até 5.
 */

import { addDaysToDateStr, getSaoPauloDateStr } from './timeUtils.js';

export const MAX_DAILY_VICTORIES = 3;
export const EXTENDED_MAX_DAILY_VICTORIES = 5;

export const DAILY_VICTORY_OVERFLOW_SOURCES = {
  study: 'homeostasis-study',
  reading: 'homeostasis-reading'
};

export function isOverflowDailyVictorySource(source) {
  return Object.values(DAILY_VICTORY_OVERFLOW_SOURCES).includes(source);
}

export function maxDailyVictoriesForSource(source) {
  return isOverflowDailyVictorySource(source)
    ? EXTENDED_MAX_DAILY_VICTORIES
    : MAX_DAILY_VICTORIES;
}

export const DAILY_VICTORY_REWARDS = {
  xp: 40,
  coins: 12,
  willpower: 4
};

export const DAILY_VICTORY_TRIPLE_BONUS = {
  xp: 60,
  coins: 20,
  willpower: 8,
  consistency: 4
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function uidDaily(prefix = 'dv') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isValidDateStr(dateStr) {
  return DATE_ONLY_RE.test(dateStr || '');
}

export function formatDailyVictoryDate(dateStr, { withYear = true } = {}) {
  if (!isValidDateStr(dateStr)) return dateStr || '';
  const [year, month, day] = dateStr.split('-');
  return withYear ? `${day}/${month}/${year}` : `${day}/${month}`;
}

export function getPlannableDates(today = getSaoPauloDateStr()) {
  return {
    today,
    tomorrow: addDaysToDateStr(today, 1)
  };
}

export function canPlanForDate(dateStr, today = getSaoPauloDateStr()) {
  if (!isValidDateStr(dateStr)) return false;
  const { today: todayStr, tomorrow } = getPlannableDates(today);
  return dateStr === todayStr || dateStr === tomorrow;
}

export function canCompleteOnDate(victoryDate, today = getSaoPauloDateStr()) {
  return isValidDateStr(victoryDate) && victoryDate === today;
}

export function listVictoriesForDate(list = [], dateStr) {
  return (list || [])
    .filter(item => item && item.date === dateStr)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

export function countVictoriesForDate(list = [], dateStr) {
  return listVictoriesForDate(list, dateStr).length;
}

export function countCompletedForDate(list = [], dateStr) {
  return listVictoriesForDate(list, dateStr).filter(item => item.completed).length;
}

export function isTripleBonusAwarded(bonuses = {}, dateStr) {
  return !!(bonuses && bonuses[dateStr] && bonuses[dateStr].awarded);
}

export const DAY_OUTCOME = {
  victory: 'victory',
  partial: 'partial',
  unplanned: 'unplanned',
  defeat: 'defeat'
};

export const DAY_OUTCOME_META = {
  victory: {
    key: 'victory',
    label: 'Vitória',
    description: 'Todas as tarefas planejadas foram feitas',
    color: '#34d399',
    bg: 'rgba(16, 185, 129, 0.18)',
    border: 'rgba(52, 211, 153, 0.45)'
  },
  partial: {
    key: 'partial',
    label: 'Parcial',
    description: 'Algumas feitas, outras não',
    color: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.18)',
    border: 'rgba(251, 191, 36, 0.45)'
  },
  unplanned: {
    key: 'unplanned',
    label: 'Sem planejamento',
    description: 'Nenhuma vitória foi cadastrada',
    color: '#64748b',
    bg: 'rgba(100, 116, 139, 0.16)',
    border: 'rgba(148, 163, 184, 0.28)'
  },
  defeat: {
    key: 'defeat',
    label: 'Derrota',
    description: 'Nenhuma tarefa planejada foi feita',
    color: '#f87171',
    bg: 'rgba(244, 63, 94, 0.18)',
    border: 'rgba(248, 113, 113, 0.45)'
  }
};

export function classifyDayOutcome(plannedCount = 0, completedCount = 0) {
  if (plannedCount <= 0) return DAY_OUTCOME.unplanned;
  if (completedCount <= 0) return DAY_OUTCOME.defeat;
  if (completedCount >= plannedCount) return DAY_OUTCOME.victory;
  return DAY_OUTCOME.partial;
}

export function summarizeDay(list = [], dateStr, bonuses = {}) {
  const items = listVictoriesForDate(list, dateStr);
  const completedCount = items.filter(item => item.completed).length;
  const plannedCount = items.length;
  const outcome = classifyDayOutcome(plannedCount, completedCount);
  const displayCap = Math.max(plannedCount, MAX_DAILY_VICTORIES);
  return {
    date: dateStr,
    items,
    plannedCount,
    completedCount,
    displayCap,
    remainingSlots: Math.max(0, MAX_DAILY_VICTORIES - plannedCount),
    remainingOverflowSlots: Math.max(0, EXTENDED_MAX_DAILY_VICTORIES - plannedCount),
    canAdd: plannedCount < MAX_DAILY_VICTORIES,
    canAddOverflow: plannedCount < EXTENDED_MAX_DAILY_VICTORIES,
    allComplete: plannedCount > 0 && completedCount === plannedCount,
    tripleComplete: plannedCount >= MAX_DAILY_VICTORIES && completedCount >= MAX_DAILY_VICTORIES,
    tripleBonusAwarded: isTripleBonusAwarded(bonuses, dateStr),
    outcome,
    outcomeMeta: DAY_OUTCOME_META[outcome]
  };
}

export function monthKeyFromDate(dateStr) {
  if (!isValidDateStr(dateStr)) return '';
  return dateStr.slice(0, 7);
}

export function shiftMonthKey(monthKey, offset) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return monthKey;
  const d = new Date(Date.UTC(year, month - 1 + offset, 1, 12, 0, 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatMonthKey(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return monthKey || '';
  const names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${names[month - 1]} ${year}`;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
}

/**
 * Grade de calendário (domingo a sábado) com o resultado de cada dia do mês.
 */
export function buildMonthCalendar(list = [], bonuses = {}, monthKey, today = getSaoPauloDateStr()) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return { monthKey, weeks: [], days: [] };

  const totalDays = daysInMonth(year, month);
  const firstDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const firstDow = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)).getUTCDay();
  const cells = [];

  for (let i = 0; i < firstDow; i += 1) {
    cells.push({ empty: true, key: `pad-start-${i}` });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const summary = summarizeDay(list, date, bonuses);
    cells.push({
      empty: false,
      key: date,
      date,
      day,
      summary,
      outcome: summary.outcome,
      isToday: date === today,
      isFuture: date > today
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ empty: true, key: `pad-end-${cells.length}` });
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return {
    monthKey,
    year,
    month,
    label: formatMonthKey(monthKey),
    firstDate,
    weeks,
    days: cells.filter(cell => !cell.empty)
  };
}

export function sanitizeDailyVictory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  if (!title) return null;
  const date = isValidDateStr(raw.date) ? raw.date : null;
  if (!date) return null;

  const victory = {
    id: raw.id || uidDaily('dv'),
    date,
    title,
    category: String(raw.category || 'Pessoal').trim() || 'Pessoal',
    completed: !!raw.completed,
    completedAt: raw.completed ? (raw.completedAt || null) : null,
    note: String(raw.note || '').trim(),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    xpReward: DAILY_VICTORY_REWARDS.xp,
    coinReward: DAILY_VICTORY_REWARDS.coins,
    willpowerReward: DAILY_VICTORY_REWARDS.willpower
  };
  if (isOverflowDailyVictorySource(raw.source)) {
    victory.source = raw.source;
  }
  const questId = String(raw.questId || '').trim();
  if (questId) {
    victory.questId = questId;
  }
  return victory;
}

export function findVictoryForQuest(list = [], questId, dateStr) {
  const id = String(questId || '').trim();
  if (!id) return null;
  return listVictoriesForDate(list, dateStr).find(item => item.questId === id) || null;
}

export function isQuestPlannedForDate(list = [], questId, dateStr) {
  return !!findVictoryForQuest(list, questId, dateStr);
}

export function canPlanQuestAsDailyVictory(list = [], questId, dateStr) {
  const alreadyPlanned = isQuestPlannedForDate(list, questId, dateStr);
  const summary = summarizeDay(list, dateStr);
  return {
    alreadyPlanned,
    atLimit: !summary.canAdd,
    canPlan: !alreadyPlanned && summary.canAdd
  };
}

export function listOverflowVictoriesForDate(list = [], dateStr, source) {
  return listVictoriesForDate(list, dateStr).filter(item => item.source === source);
}

export function parseHomeostasisVictoryTargetMinutes(title) {
  const match = String(title || '').match(/no m[ií]nimo\s+(\d+)\s+minutos?/i);
  return match ? Number(match[1]) : null;
}

/**
 * true/false quando o título tem meta em minutos; null se não for possível avaliar.
 */
export function isHomeostasisVictoryFulfilled(victory, minutesDone) {
  const target = parseHomeostasisVictoryTargetMinutes(victory?.title);
  if (target == null) return null;
  return (Number(minutesDone) || 0) >= target;
}

function pushCompletionUpdate(updates, victory, completed, note) {
  if (!victory || !!victory.completed === !!completed) return;
  updates.push({
    id: victory.id,
    completed: !!completed,
    note: completed ? note : undefined
  });
}

/**
 * Decide quais vitórias do dia devem ser concluídas/reabertas
 * a partir de uma missão, leitura ou estudo AGU.
 */
export function planLinkedDailyVictoryUpdates(list = [], {
  today,
  questId,
  questCompleted,
  questNote,
  readingMinutes,
  studyMinutes
} = {}) {
  const updates = [];
  if (questId && questCompleted !== undefined) {
    const note = questNote || 'Concluída junto com a missão.';
    listVictoriesForDate(list, today)
      .filter(item => item.questId === questId)
      .forEach(victory => pushCompletionUpdate(updates, victory, !!questCompleted, note));
  }

  if (readingMinutes !== undefined) {
    listOverflowVictoriesForDate(list, today, DAILY_VICTORY_OVERFLOW_SOURCES.reading).forEach((victory) => {
      if (!isHomeostasisVictoryFulfilled(victory, readingMinutes)) return;
      pushCompletionUpdate(updates, victory, true, `Leitura do dia: ${Number(readingMinutes) || 0} min.`);
    });
  }

  if (studyMinutes !== undefined) {
    listOverflowVictoriesForDate(list, today, DAILY_VICTORY_OVERFLOW_SOURCES.study).forEach((victory) => {
      if (!isHomeostasisVictoryFulfilled(victory, studyMinutes)) return;
      pushCompletionUpdate(updates, victory, true, `Estudo AGU do dia: ${Number(studyMinutes) || 0} min.`);
    });
  }

  return updates;
}

export function sanitizeDailyVictories(list = []) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeDailyVictory).filter(Boolean);
}

export function sanitizeDailyVictoryBonuses(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next = {};
  Object.entries(raw).forEach(([date, value]) => {
    if (!isValidDateStr(date) || !value || !value.awarded) return;
    next[date] = {
      awarded: true,
      awardedAt: value.awardedAt || null,
      xp: DAILY_VICTORY_TRIPLE_BONUS.xp,
      coins: DAILY_VICTORY_TRIPLE_BONUS.coins
    };
  });
  return next;
}

export function createDailyVictory(list = [], input = {}, { today = getSaoPauloDateStr(), defaultCategory = 'Pessoal' } = {}) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('O título da vitória é obrigatório.');

  const date = isValidDateStr(input.date) ? input.date : today;
  if (!canPlanForDate(date, today)) {
    throw new Error('Só é possível cadastrar vitórias para hoje ou para amanhã.');
  }

  const current = sanitizeDailyVictories(list);
  const source = isOverflowDailyVictorySource(input.source) ? input.source : undefined;
  const questId = String(input.questId || '').trim() || undefined;
  if (questId && isQuestPlannedForDate(current, questId, date)) {
    throw new Error('Esta missão já está nas vitórias planejadas deste dia.');
  }
  const cap = maxDailyVictoriesForSource(source);
  const count = countVictoriesForDate(current, date);
  if (count >= cap) {
    throw new Error(`Já existem ${count} vitórias planejadas para ${formatDailyVictoryDate(date)}.`);
  }

  const nowIso = new Date().toISOString();
  const victory = sanitizeDailyVictory({
    id: input.id || uidDaily('dv'),
    date,
    title,
    category: input.category || defaultCategory,
    source,
    questId,
    completed: false,
    completedAt: null,
    note: '',
    createdAt: nowIso,
    updatedAt: nowIso
  });

  return {
    list: [...current, victory],
    victory
  };
}

export function updateDailyVictory(list = [], id, patch = {}, { today = getSaoPauloDateStr() } = {}) {
  const current = sanitizeDailyVictories(list);
  const index = current.findIndex(item => item.id === id);
  if (index === -1) throw new Error('Vitória planejada não encontrada.');

  const existing = { ...current[index] };

  if (patch.title !== undefined) {
    const title = String(patch.title || '').trim();
    if (!title) throw new Error('O título da vitória é obrigatório.');
    existing.title = title;
  }
  if (patch.category !== undefined) {
    existing.category = String(patch.category || '').trim() || existing.category;
  }
  if (patch.note !== undefined && existing.completed) {
    existing.note = String(patch.note || '').trim();
  }
  if (patch.date !== undefined && patch.date !== existing.date) {
    if (existing.completed) {
      throw new Error('Não é possível mudar o dia de uma vitória já realizada.');
    }
    const nextDate = patch.date;
    if (!canPlanForDate(nextDate, today)) {
      throw new Error('Só é possível mover vitórias para hoje ou para amanhã.');
    }
    const moveCap = maxDailyVictoriesForSource(existing.source);
    const nextCount = countVictoriesForDate(current.filter(item => item.id !== id), nextDate);
    if (nextCount >= moveCap) {
      throw new Error(`Já existem ${nextCount} vitórias planejadas para ${formatDailyVictoryDate(nextDate)}.`);
    }
    existing.date = nextDate;
  }

  existing.updatedAt = new Date().toISOString();
  const next = [...current];
  next[index] = existing;
  return { list: next, victory: existing };
}

export function completeDailyVictory(list = [], bonuses = {}, id, { note, completed, today = getSaoPauloDateStr() } = {}) {
  const current = sanitizeDailyVictories(list);
  const nextBonuses = sanitizeDailyVictoryBonuses(bonuses);
  const index = current.findIndex(item => item.id === id);
  if (index === -1) throw new Error('Vitória planejada não encontrada.');

  const existing = { ...current[index] };
  const willComplete = completed !== undefined ? !!completed : !existing.completed;

  if (existing.completed === willComplete) {
    if (willComplete && note !== undefined) {
      existing.note = String(note || '').trim();
      existing.updatedAt = new Date().toISOString();
      const next = [...current];
      next[index] = existing;
      return {
        list: next,
        bonuses: nextBonuses,
        victory: existing,
        willComplete,
        stateUnchanged: true,
        bonusAwardedNow: false,
        bonusRevertedNow: false
      };
    }
    return {
      list: current,
      bonuses: nextBonuses,
      victory: existing,
      willComplete,
      stateUnchanged: true,
      bonusAwardedNow: false,
      bonusRevertedNow: false
    };
  }

  if (willComplete && !canCompleteOnDate(existing.date, today)) {
    throw new Error('Só é possível registrar a vitória no próprio dia planejado.');
  }

  const nowIso = new Date().toISOString();
  existing.completed = willComplete;
  existing.completedAt = willComplete ? nowIso : null;
  existing.note = willComplete ? String(note !== undefined ? note : existing.note || '').trim() : '';
  existing.updatedAt = nowIso;

  const next = [...current];
  next[index] = existing;

  let bonusAwardedNow = false;
  let bonusRevertedNow = false;
  const completedCount = countCompletedForDate(next, existing.date);
  const plannedCount = countVictoriesForDate(next, existing.date);

  if (willComplete && plannedCount >= MAX_DAILY_VICTORIES && completedCount >= MAX_DAILY_VICTORIES && !isTripleBonusAwarded(nextBonuses, existing.date)) {
    nextBonuses[existing.date] = {
      awarded: true,
      awardedAt: nowIso,
      xp: DAILY_VICTORY_TRIPLE_BONUS.xp,
      coins: DAILY_VICTORY_TRIPLE_BONUS.coins
    };
    bonusAwardedNow = true;
  }

  if (!willComplete && isTripleBonusAwarded(nextBonuses, existing.date) && completedCount < MAX_DAILY_VICTORIES) {
    delete nextBonuses[existing.date];
    bonusRevertedNow = true;
  }

  return {
    list: next,
    bonuses: nextBonuses,
    victory: existing,
    willComplete,
    stateUnchanged: false,
    bonusAwardedNow,
    bonusRevertedNow,
    rewards: willComplete ? { ...DAILY_VICTORY_REWARDS } : { ...DAILY_VICTORY_REWARDS },
    bonusRewards: (bonusAwardedNow || bonusRevertedNow) ? { ...DAILY_VICTORY_TRIPLE_BONUS } : null
  };
}

export function deleteDailyVictory(list = [], bonuses = {}, id) {
  const current = sanitizeDailyVictories(list);
  const nextBonuses = sanitizeDailyVictoryBonuses(bonuses);
  const index = current.findIndex(item => item.id === id);
  if (index === -1) throw new Error('Vitória planejada não encontrada.');

  const [removed] = current.splice(index, 1);
  let bonusRevertedNow = false;

  if (removed.completed && isTripleBonusAwarded(nextBonuses, removed.date)) {
    const completedCount = countCompletedForDate(current, removed.date);
    if (completedCount < MAX_DAILY_VICTORIES) {
      delete nextBonuses[removed.date];
      bonusRevertedNow = true;
    }
  }

  return {
    list: current,
    bonuses: nextBonuses,
    removed,
    bonusRevertedNow,
    shouldRevertReward: !!removed.completed
  };
}

export function bonusEntityId(dateStr) {
  return `dv-bonus-${dateStr}`;
}
