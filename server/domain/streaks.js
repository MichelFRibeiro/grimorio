/**
 * Sequências derivadas do ledger — um estorno corrige a sequência, porque
 * ela não é um contador incremental.
 *
 * Um dia conta se houve ao menos uma ação produtiva (taverna, punição e
 * estorno não contam). Escudo de sequência: 1 a cada 7 dias de sequência,
 * estoque limitado pelos atributos. Um dia vazio consome um escudo antes
 * de quebrar. `streakRestDays` (0=Dom … 6=Sáb) são folgas opcionais.
 */

import { addDaysToDateStr, getSaoPauloDateStr, getSaoPauloDayOfWeek } from '../timeUtils.js';
import { maxStreakShields } from './attributes.js';

export const PRODUCTIVE_ACTION_TYPES = new Set([
  'quest_complete',
  'habit_complete',
  'reading_session',
  'book_quote',
  'exam_questions',
  'agu_block',
  'mind_map_study',
  'process_step',
  'daily_victory_complete',
  'daily_review',
  'weekly_focus'
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isProductiveLog(log) {
  if (!log || log.reverted) return false;
  if (!PRODUCTIVE_ACTION_TYPES.has(log.type)) return false;
  return DATE_RE.test(String(log.date || ''));
}

export function productiveDates(logs = []) {
  const dates = new Set();
  (logs || []).forEach((log) => {
    if (isProductiveLog(log)) dates.add(log.date);
  });
  return dates;
}

function dayOfWeek(dateStr) {
  return getSaoPauloDayOfWeek(dateStr);
}

function isRestDay(dateStr, restDays) {
  return restDays.has(dayOfWeek(dateStr));
}

/**
 * Percorre do dia de referência para trás. Dias produtivos contam.
 * Folga configurada não quebra e não conta. Dia vazio com escudo disponível
 * consome um escudo (não conta, não quebra). Dia vazio sem escudo encerra.
 */
export function deriveHeroStreak(logs = [], {
  today = getSaoPauloDateStr(),
  restDays = [],
  maxShields = 2,
  shieldsEarned = 0
} = {}) {
  const dates = productiveDates(logs);
  const rest = new Set((Array.isArray(restDays) ? restDays : [])
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));

  const earned = Math.max(0, Math.floor(Number(shieldsEarned) || 0));
  let shields = Math.min(Math.max(0, Number(maxShields) || 0), earned);
  let streak = 0;
  let cursor = today;
  let guard = 0;
  const consumed = [];

  if (!dates.has(today)) {
    // Hoje ainda pode ser salvo: a sequência vive se ontem (ou a folga) segurou.
    cursor = addDaysToDateStr(today, -1);
  }

  while (guard < 4000) {
    guard += 1;
    if (dates.has(cursor)) {
      streak += 1;
      cursor = addDaysToDateStr(cursor, -1);
      continue;
    }
    if (isRestDay(cursor, rest)) {
      cursor = addDaysToDateStr(cursor, -1);
      continue;
    }
    if (shields > 0) {
      shields -= 1;
      consumed.push(cursor);
      cursor = addDaysToDateStr(cursor, -1);
      continue;
    }
    break;
  }

  return {
    streak,
    shieldsRemaining: shields,
    shieldsConsumed: consumed,
    activeToday: dates.has(today)
  };
}

/** 1 escudo a cada 7 dias de sequência já conquistada, limitado ao estoque. */
export function shieldsEarnedForStreak(streak, maxShields) {
  const earned = Math.floor(Math.max(0, Number(streak) || 0) / 7);
  return Math.min(Math.max(0, Number(maxShields) || 0), earned);
}

/**
 * Recomputa sequência e escudos a partir do ledger e grava no perfil.
 * Escudos consumidos ficam registrados para o modal/toast avisar o herói.
 */
export function syncHeroStreak(db, { today = getSaoPauloDateStr(), now = new Date() } = {}) {
  const profile = db?.userProfile;
  if (!profile) return { streak: 0, shields: 0, newlyConsumed: [] };
  const restDays = Array.isArray(profile.streakRestDays) ? profile.streakRestDays : [];
  const cap = maxStreakShields(profile.stats?.consistency);

  // Duas passagens: a sequência sem escudo diz quantos escudos foram ganhos;
  // a segunda aplica o consumo automático desses escudos.
  const bare = deriveHeroStreak(db.actionLogs || [], {
    today,
    restDays,
    maxShields: 0,
    shieldsEarned: 0
  });
  const earned = shieldsEarnedForStreak(bare.streak, cap);
  const withShields = deriveHeroStreak(db.actionLogs || [], {
    today,
    restDays,
    maxShields: cap,
    shieldsEarned: earned
  });

  // Herói antigo tem sequência salva e ledger sem esses dias (ou com tipos
  // que ainda não contam). Não zerar o que já estava conquistado: o derivado
  // só substitui quando é maior, ou quando um estorno de fato removeu um dia.
  const stored = Math.max(0, Math.floor(Number(profile.streak) || 0));
  const lastActive = DATE_RE.test(String(profile.lastActiveDate || '')) ? profile.lastActiveDate : null;
  const derived = withShields.streak;
  const keepStored = stored > derived && lastActive && lastActive >= addDaysToDateStr(today, -1);
  const streak = keepStored ? stored : derived;

  const previousConsumed = new Set(
    (Array.isArray(profile.streakShieldLog) ? profile.streakShieldLog : []).map((entry) => entry?.date)
  );
  const newlyConsumed = withShields.shieldsConsumed.filter((date) => !previousConsumed.has(date));

  profile.streak = streak;
  profile.streakShields = withShields.shieldsRemaining;
  profile.streakShieldsEarned = earned;
  profile.maxStreakShields = cap;
  profile.lastActiveDate = withShields.activeToday ? today : (profile.lastActiveDate || null);
  profile.streakShieldLog = withShields.shieldsConsumed.slice(0, 30).map((date) => ({
    date,
    consumedAt: previousConsumed.has(date)
      ? ((profile.streakShieldLog || []).find((entry) => entry?.date === date)?.consumedAt || null)
      : (now instanceof Date ? now.toISOString() : new Date().toISOString())
  }));

  return {
    streak,
    shields: withShields.shieldsRemaining,
    earned,
    cap,
    newlyConsumed,
    activeToday: withShields.activeToday
  };
}
