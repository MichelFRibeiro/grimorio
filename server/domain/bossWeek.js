/**
 * Chefe semanal de verdade.
 *
 * Semana = domingo–sábado em America/Sao_Paulo (mesma chave de rankings.js).
 * Na virada, se o chefe caiu, o próximo sobe de nível; se não caiu, paga a
 * punição da semana e o mesmo nível volta com HP novo. HP é meta de esforço:
 * ~15% acima do dano médio das últimas 4 semanas fechadas, preso entre
 * metade e o dobro da fórmula do catálogo.
 *
 * Dano só de ação produtiva. Recompensa do próprio chefe, bônus de tríade,
 * baú e level-up não ferem o chefe. Depois da derrota, o dano vira overkill
 * e o próximo chefe só nasce no domingo.
 */

import { getWeekBounds } from '../rankings.js';
import { addDaysToDateStr, getSaoPauloDateStr } from '../timeUtils.js';
import { PRODUCTIVE_ACTION_TYPES } from './streaks.js';
import { focusDamageBonus } from './attributes.js';

export const BOSS_BASE_HP = 500;
export const BOSS_HP_GROWTH = 1.1;
export const BOSS_STRETCH = 1.15;
export const BOSS_HISTORY_WEEKS = 4;

const NON_DAMAGE_TYPES = new Set([
  'boss_reward',
  'daily_victory_triple_bonus',
  'destiny_chest',
  'penalty',
  'penalty_contest',
  'reward_redeem',
  'spend_money',
  'level_up'
]);

export function catalogBossHp(level = 1) {
  const safe = Math.max(1, parseInt(level, 10) || 1);
  return Math.round(BOSS_BASE_HP * Math.pow(BOSS_HP_GROWTH, safe - 1));
}

export function weekKeyOf(dateInput = new Date()) {
  return getWeekBounds(dateInput).weekKey;
}

export function weekKeyFromDateStr(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return weekKeyOf(new Date());
  return getWeekBounds(`${dateStr}T12:00:00-03:00`).weekKey;
}

export function previousWeekKey(weekKey) {
  return addDaysToDateStr(weekKey, -7);
}

export function nextWeekKey(weekKey) {
  return addDaysToDateStr(weekKey, 7);
}

/** Semanas fechadas estritamente anteriores à semana corrente, da mais antiga à mais nova. */
export function weeksBetween(fromKey, toKey) {
  const weeks = [];
  if (!fromKey || !toKey || fromKey >= toKey) return weeks;
  let cursor = fromKey;
  let guard = 0;
  while (cursor < toKey && guard < 520) {
    weeks.push(cursor);
    cursor = nextWeekKey(cursor);
    guard += 1;
  }
  return weeks;
}

export function isBossDamageAction(actionType, { damageBoss = true } = {}) {
  if (damageBoss === false) return false;
  if (!actionType || NON_DAMAGE_TYPES.has(actionType)) return false;
  // Tipos produtivos conhecidos ferem o chefe. Tipo desconhecido com XP/moedas
  // também fere — senão um teste ou uma ação nova some sem combate. O que
  // não pode ferir está na lista explícita (taverna, punição, baú, level-up).
  return true;
}

/**
 * Dano no chefe. `focus` entra só no dano de combate (xp*0.8 + coins*1.2),
 * nunca na recompensa do próprio chefe. Devolve também o bônus aplicado.
 */
export function computeBossDamage({ xp = 0, coins = 0, actionType, focus = 0, damageBoss = true } = {}) {
  if (!isBossDamageAction(actionType, { damageBoss })) {
    return { damage: 0, focusBonus: 0, baseDamage: 0 };
  }
  const base = Math.round(Math.max(0, Number(xp) || 0) * 0.8 + Math.max(0, Number(coins) || 0) * 1.2);
  if (base <= 0) return { damage: 0, focusBonus: 0, baseDamage: 0 };
  const rate = focusDamageBonus(focus);
  const bonus = Math.round(base * rate);
  return { damage: base + bonus, focusBonus: bonus, baseDamage: base };
}

export function averageWeeklyDamage(history = [], { take = BOSS_HISTORY_WEEKS } = {}) {
  const closed = (Array.isArray(history) ? history : [])
    .filter((entry) => entry && Number.isFinite(Number(entry.damageDealt)))
    .slice(-take);
  if (!closed.length) return null;
  const total = closed.reduce((sum, entry) => sum + Number(entry.damageDealt || 0), 0);
  return total / closed.length;
}

/**
 * HP da semana: teto entre 50% e 200% do catálogo, mirando 15% acima da média.
 * Sem histórico, usa a fórmula do catálogo.
 */
export function scaleBossHp(level, history = []) {
  const base = catalogBossHp(level);
  const avg = averageWeeklyDamage(history);
  if (avg == null) return base;
  const target = Math.round(avg * BOSS_STRETCH);
  const floor = Math.round(base * 0.5);
  const ceiling = Math.round(base * 2);
  return Math.min(ceiling, Math.max(floor, target));
}

export function emptyDaysInWeek(logs = [], weekKey) {
  const end = addDaysToDateStr(weekKey, 6);
  const productive = new Set();
  (logs || []).forEach((log) => {
    if (!log || !PRODUCTIVE_ACTION_TYPES.has(log.type)) return;
    if (typeof log.date === 'string' && log.date >= weekKey && log.date <= end) {
      productive.add(log.date);
    }
  });
  const empty = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDaysToDateStr(weekKey, i);
    if (!productive.has(date)) empty.push(date);
  }
  return empty;
}

export function bossHistoryEntry({ boss, weekKey, defeated, penaltyApplied = false }) {
  return {
    weekKey,
    bossName: boss?.name || 'Chefe',
    level: boss?.level || 1,
    maxHp: boss?.maxHp || 0,
    damageDealt: Math.max(0, (boss?.maxHp || 0) - (boss?.currentHp || 0)) + Math.max(0, boss?.overkill || 0),
    defeated: !!defeated,
    defeatedAt: boss?.defeatedAt || null,
    penaltyApplied: !!penaltyApplied
  };
}

export function ensureBossWeekFields(boss, today = getSaoPauloDateStr()) {
  if (!boss) return boss;
  if (!boss.weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(boss.weekStartDate))) {
    boss.weekStartDate = weekKeyOf(today);
  } else {
    // Normaliza quarta (ou qualquer dia) para o domingo daquela semana, sem mexer no HP.
    boss.weekStartDate = weekKeyFromDateStr(boss.weekStartDate);
  }
  if (boss.overkill == null) boss.overkill = 0;
  if (!boss.defeatedAt && boss.defeated) boss.defeatedAt = null;
  return boss;
}
