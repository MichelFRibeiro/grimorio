/**
 * Validação compartilhada entre HTTP e MCP.
 * Números não finitos viram erro — nunca entram no perfil como NaN.
 */

export class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

export const LIMITS = {
  durationMinutes: 480,
  durationConfirmMinutes: 180,
  pagesPerSession: 2000,
  questionsPerBatch: 500,
  xpPerUnit: 200,
  coinsPerUnit: 200,
  rewardCostMin: 1,
  rewardCostMax: 1_000_000,
  totalUnits: 100_000,
  pageNumber: 100_000
};

export function finiteNumber(value, { min, max, fallback, label = 'valor' } = {}) {
  if (value == null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new DomainError(`${label} é obrigatório.`);
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new DomainError(`${label} precisa ser um número válido.`);
  }
  if (min != null && n < min) {
    throw new DomainError(`${label} não pode ser menor que ${min}.`);
  }
  if (max != null && n > max) {
    throw new DomainError(`${label} não pode ser maior que ${max}.`);
  }
  return n;
}

export function intInRange(value, { min = 0, max, fallback, label = 'valor' } = {}) {
  if ((value == null || value === '') && fallback !== undefined) return fallback;
  const n = finiteNumber(value, { min, max, label });
  return Math.round(n);
}

/** Duração de uma entrada: 0 = não cronometrada; teto de 8h (480 min). */
export function durationMinutes(value, { fallback = 0, label = 'Duração' } = {}) {
  if (value == null || value === '') return fallback;
  return intInRange(value, { min: 0, max: LIMITS.durationMinutes, label });
}

export function pagesInSession(value, { label = 'Páginas' } = {}) {
  return intInRange(value, { min: 0, max: LIMITS.pageNumber, label });
}

export function questionsCount(value, { label = 'Quantidade de questões' } = {}) {
  return intInRange(value, { min: 1, max: LIMITS.questionsPerBatch, label });
}

export function rewardCost(value, { label = 'Custo' } = {}) {
  return intInRange(value, {
    min: LIMITS.rewardCostMin,
    max: LIMITS.rewardCostMax,
    label
  });
}

export function xpPerUnit(value, { fallback = 20 } = {}) {
  if (value == null || value === '') return fallback;
  return intInRange(value, { min: 0, max: LIMITS.xpPerUnit, label: 'XP por unidade' });
}

export function coinsPerUnit(value, { fallback = 5 } = {}) {
  if (value == null || value === '') return fallback;
  return intInRange(value, { min: 0, max: LIMITS.coinsPerUnit, label: 'Moedas por unidade' });
}

export function dateOnly(value) {
  if (value == null || value === '') return null;
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new DomainError('Data inválida. Use YYYY-MM-DD.');
  }
  return s;
}

/** Lê cost canônico, aceitando o alias legado costCoins. */
export function readRewardCost(reward) {
  if (!reward) return 0;
  const raw = reward.cost != null ? reward.cost : reward.costCoins;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
