/**
 * Manutenção preguiçosa. Roda na leitura de estado e antes de recompensar.
 * Idempotente: chaves em db.maintenance.penaltyKeys não são julgadas de novo.
 * Semanas perdidas são percorridas, mas punição de chefe só nas 2 últimas.
 */

import { getSaoPauloDateStr, getSaoPauloHour, getSaoPauloDayOfWeek } from '../timeUtils.js';
import {
  ensureBossWeekFields,
  scaleBossHp,
  weekKeyOf,
  weeksBetween,
  nextWeekKey as nextWeekAfter,
  bossHistoryEntry,
  catalogBossHp
} from './bossWeek.js';
import {
  ensurePenaltyState,
  evaluateCriticalQuests,
  evaluateBossWeekPenalty,
  evaluateCriticalHabits,
  evaluateDailyDefeat
} from './penalties.js';
import { syncHeroStreak } from './streaks.js';
import { attributeEffects } from './attributes.js';

const PENALTY_WEEK_CAP = 2;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Aplica a punição no perfil com piso 0 em moedas e atributos.
 * Não mexe em XP. Grava o delta realmente aplicado (pode ser menor que o
 * pedido se a moeda ou o atributo já estavam no chão).
 */
function logId() {
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function applyPenaltyDeltas(db, penalty, { now = new Date() } = {}) {
  const profile = db.userProfile;
  if (!profile.stats) profile.stats = { wisdom: 0, focus: 0, willpower: 0, consistency: 0 };
  const requested = penalty.deltas || {};
  const applied = { xp: 0, coins: 0, wisdom: 0, focus: 0, willpower: 0, consistency: 0 };

  const coinsBefore = finite(profile.coins, 0);
  const coinDelta = Math.min(0, Math.round(finite(requested.coins, 0)));
  profile.coins = Math.max(0, coinsBefore + coinDelta);
  applied.coins = profile.coins - coinsBefore;

  for (const key of ['wisdom', 'focus', 'willpower', 'consistency']) {
    const before = Math.max(0, finite(profile.stats[key], 0));
    const delta = Math.min(0, Math.round(finite(requested[key], 0)));
    profile.stats[key] = Math.max(0, before + delta);
    applied[key] = profile.stats[key] - before;
  }

  const logEntry = {
    id: logId(),
    type: 'penalty',
    entityId: penalty.id,
    title: penalty.title,
    xp: 0,
    coins: applied.coins,
    wisdom: applied.wisdom,
    focus: applied.focus,
    willpower: applied.willpower,
    consistency: applied.consistency,
    applied: {
      ...applied,
      bossDamage: 0,
      bossDefeated: false,
      bossId: null,
      bossRewardXp: 0,
      bossRewardCoins: 0,
      levelUps: [],
      penalty: true
    },
    details: { penaltyType: penalty.type, weekKey: penalty.weekKey || null },
    timestamp: now.toISOString(),
    hour: getSaoPauloHour(now),
    dayOfWeek: getSaoPauloDayOfWeek(now),
    date: penalty.date
  };
  if (!db.actionLogs) db.actionLogs = [];
  db.actionLogs.unshift(logEntry);
  penalty.applied = applied;
  penalty.rewardLogId = logEntry.id;
  return { penalty, logEntry, applied };
}

function summonBoss({ level, currentBoss, history, createBossRaid, weekKey }) {
  const next = createBossRaid({ level, currentBoss });
  const hp = scaleBossHp(level, history);
  next.maxHp = hp;
  next.currentHp = hp;
  next.weekStartDate = weekKey;
  next.overkill = 0;
  next.hpScaled = hp !== catalogBossHp(level);
  return next;
}

export function closeBossWeek(db, weekKey, { applyPenalty, now, createBossRaid }) {
  const boss = db.bossRaid;
  const defeated = !!boss?.defeated;
  let penalty = null;
  if (!defeated && applyPenalty) {
    const maintenance = ensurePenaltyState(db);
    const found = evaluateBossWeekPenalty(db, weekKey, boss, {
      since: maintenance.penaltiesSince,
      keys: maintenance.penaltyKeys
    });
    if (found.length) {
      const item = found[0];
      maintenance.penaltyKeys[item.key] = item.penalty.id;
      applyPenaltyDeltas(db, item.penalty, { now });
      db.penalties.unshift(item.penalty);
      penalty = item.penalty;
    }
  }
  if (!Array.isArray(db.bossHistory)) db.bossHistory = [];
  db.bossHistory.push(bossHistoryEntry({
    boss,
    weekKey,
    defeated,
    penaltyApplied: !!penalty
  }));
  const nextLevel = defeated ? (boss.level || 1) + 1 : Math.max(1, boss?.level || 1);
  db.bossRaid = summonBoss({
    level: nextLevel,
    currentBoss: boss,
    history: db.bossHistory,
    createBossRaid,
    weekKey: nextWeekAfter(weekKey)
  });
  return { closed: weekKey, defeated, penalty, next: db.bossRaid };
}

export function runWeeklyMaintenance(db, now = new Date(), options = {}) {
  const { createBossRaid } = options;
  if (typeof createBossRaid !== 'function') {
    throw new Error('runWeeklyMaintenance exige createBossRaid.');
  }
  if (!db.bossRaid) return { rolled: [] };
  ensureBossWeekFields(db.bossRaid, getSaoPauloDateStr(now));
  const currentKey = weekKeyOf(now);
  const bossKey = db.bossRaid.weekStartDate;
  if (bossKey >= currentKey) {
    db.bossRaid.weekStartDate = bossKey;
    return { rolled: [], currentKey };
  }
  const missed = weeksBetween(bossKey, currentKey);
  const penalized = new Set(missed.slice(-PENALTY_WEEK_CAP));
  const rolled = [];
  missed.forEach((weekKey) => {
    const result = closeBossWeek(db, weekKey, {
      applyPenalty: penalized.has(weekKey),
      now,
      createBossRaid
    });
    rolled.push(result);
  });
  db.bossRaid.weekStartDate = currentKey;
  return { rolled, currentKey };
}

export function runDailyMaintenance(db, now = new Date(), options = {}) {
  const today = getSaoPauloDateStr(now);
  const maintenance = ensurePenaltyState(db, today);
  const weekly = runWeeklyMaintenance(db, now, { createBossRaid: options.createBossRaid });
  const created = [];
  const accept = (items) => {
    items.forEach((item) => {
      if (!item?.key || maintenance.penaltyKeys[item.key]) return;
      maintenance.penaltyKeys[item.key] = item.penalty.id;
      applyPenaltyDeltas(db, item.penalty, { now });
      db.penalties.unshift(item.penalty);
      created.push(item.penalty);
    });
  };

  const ctx = { since: maintenance.penaltiesSince, keys: maintenance.penaltyKeys };
  accept(evaluateCriticalQuests(db, today, ctx));
  accept(evaluateCriticalHabits(db, today, {
    ...ctx,
    weeksJustClosed: (weekly.rolled || []).slice(-2).map((item) => item.closed)
  }));
  accept(evaluateDailyDefeat(db, today, ctx));

  const streak = syncHeroStreak(db, { today, now });
  maintenance.lastDailyRun = today;
  maintenance.lastWeeklyRun = weekly.currentKey || weekKeyOf(now);
  if (db.userProfile) {
    db.userProfile.attributeEffects = attributeEffects(db.userProfile.stats || {});
  }
  return { today, created, weekly, streak };
}

export function runMaintenance(db, now = new Date(), options = {}) {
  return runDailyMaintenance(db, now, options);
}
