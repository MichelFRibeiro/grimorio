/**
 * Efeitos reais dos atributos. Pequenos, com teto, e gravados no ledger
 * para o estorno ser exato (não se recalcula na hora de desfazer).
 *
 * Foco:        +1% de dano no chefe a cada 50 (teto +20%).
 * Sabedoria:   +1% de XP em estudo a cada 100 (teto +15%).
 * Vontade:     -1% no custo em moedas da punição a cada 20 (teto 30%).
 * Consistência: +1 escudo de sequência a cada 250 (estoque máx. 2 + bônus, teto 4).
 */

export const FOCUS_DAMAGE_STEP = 50;
export const FOCUS_DAMAGE_CAP = 0.2;
export const WISDOM_XP_STEP = 100;
export const WISDOM_XP_CAP = 0.15;
export const WILLPOWER_PENALTY_STEP = 20;
export const WILLPOWER_PENALTY_CAP = 0.3;
export const CONSISTENCY_SHIELD_STEP = 250;
export const BASE_STREAK_SHIELDS = 2;
export const MAX_STREAK_SHIELDS = 4;

export const STUDY_ACTION_TYPES = new Set([
  'reading_session',
  'book_quote',
  'exam_questions',
  'mind_map_study',
  'agu_block'
]);

export function focusDamageBonus(focus = 0) {
  const steps = Math.floor(Math.max(0, Number(focus) || 0) / FOCUS_DAMAGE_STEP);
  return Math.min(FOCUS_DAMAGE_CAP, steps * 0.01);
}

export function wisdomXpBonus(wisdom = 0) {
  const steps = Math.floor(Math.max(0, Number(wisdom) || 0) / WISDOM_XP_STEP);
  return Math.min(WISDOM_XP_CAP, steps * 0.01);
}

export function willpowerPenaltyMitigation(willpower = 0) {
  const steps = Math.floor(Math.max(0, Number(willpower) || 0) / WILLPOWER_PENALTY_STEP);
  return Math.min(WILLPOWER_PENALTY_CAP, steps * 0.01);
}

export function maxStreakShields(consistency = 0) {
  const extra = Math.floor(Math.max(0, Number(consistency) || 0) / CONSISTENCY_SHIELD_STEP);
  return Math.min(MAX_STREAK_SHIELDS, BASE_STREAK_SHIELDS + extra);
}

export function attributeEffects(stats = {}) {
  const focus = Math.max(0, Number(stats.focus) || 0);
  const wisdom = Math.max(0, Number(stats.wisdom) || 0);
  const willpower = Math.max(0, Number(stats.willpower) || 0);
  const consistency = Math.max(0, Number(stats.consistency) || 0);
  const focusBonus = focusDamageBonus(focus);
  const wisdomBonus = wisdomXpBonus(wisdom);
  const willMitigation = willpowerPenaltyMitigation(willpower);
  const shields = maxStreakShields(consistency);
  return {
    focus,
    wisdom,
    willpower,
    consistency,
    focusDamageBonus: focusBonus,
    wisdomXpBonus: wisdomBonus,
    willpowerPenaltyMitigation: willMitigation,
    maxStreakShields: shields,
    tooltips: {
      focus: `Foco ${focus} → +${Math.round(focusBonus * 100)}% de dano no chefe`,
      wisdom: `Sabedoria ${wisdom} → +${Math.round(wisdomBonus * 100)}% de XP em estudo`,
      willpower: `Vontade ${willpower} → -${Math.round(willMitigation * 100)}% no custo em moedas das punições`,
      consistency: `Consistência ${consistency} → estoque de ${shields} escudo${shields === 1 ? '' : 's'} de sequência`
    }
  };
}

/**
 * Aplica o bônus de Sabedoria sobre o XP de uma ação de estudo.
 * Devolve o XP final e o quanto foi acrescentado (para o ledger).
 */
export function applyWisdomToStudyXp(xp, actionType, stats) {
  const base = Math.max(0, Math.round(Number(xp) || 0));
  if (!STUDY_ACTION_TYPES.has(actionType) || base <= 0) {
    return { xp: Math.round(Number(xp) || 0), wisdomXpBonus: 0 };
  }
  const rate = wisdomXpBonus(stats?.wisdom);
  const bonus = Math.round(base * rate);
  return { xp: base + bonus, wisdomXpBonus: bonus };
}
