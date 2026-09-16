/**
 * Vitórias Planejadas para o Dia
 * Até 3 tarefas independentes das missões; categorias iguais às das missões.
 * Cadastro: no próprio dia ou no dia anterior (amanhã).
 */

import { addDaysToDateStr, getSaoPauloDateStr } from './timeUtils.js';

export const MAX_DAILY_VICTORIES = 3;

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

export function summarizeDay(list = [], dateStr, bonuses = {}) {
  const items = listVictoriesForDate(list, dateStr);
  const completedCount = items.filter(item => item.completed).length;
  const plannedCount = items.length;
  return {
    date: dateStr,
    items,
    plannedCount,
    completedCount,
    remainingSlots: Math.max(0, MAX_DAILY_VICTORIES - plannedCount),
    canAdd: plannedCount < MAX_DAILY_VICTORIES,
    allComplete: plannedCount === MAX_DAILY_VICTORIES && completedCount === MAX_DAILY_VICTORIES,
    tripleBonusAwarded: isTripleBonusAwarded(bonuses, dateStr)
  };
}

export function sanitizeDailyVictory(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  if (!title) return null;
  const date = isValidDateStr(raw.date) ? raw.date : null;
  if (!date) return null;

  return {
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
  if (countVictoriesForDate(current, date) >= MAX_DAILY_VICTORIES) {
    throw new Error(`Já existem ${MAX_DAILY_VICTORIES} vitórias planejadas para ${formatDailyVictoryDate(date)}.`);
  }

  const nowIso = new Date().toISOString();
  const victory = sanitizeDailyVictory({
    id: input.id || uidDaily('dv'),
    date,
    title,
    category: input.category || defaultCategory,
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
    if (countVictoriesForDate(current.filter(item => item.id !== id), nextDate) >= MAX_DAILY_VICTORIES) {
      throw new Error(`Já existem ${MAX_DAILY_VICTORIES} vitórias planejadas para ${formatDailyVictoryDate(nextDate)}.`);
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

  if (willComplete && plannedCount === MAX_DAILY_VICTORIES && completedCount === MAX_DAILY_VICTORIES && !isTripleBonusAwarded(nextBonuses, existing.date)) {
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
