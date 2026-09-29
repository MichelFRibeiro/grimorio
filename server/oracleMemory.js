/**
 * Memória do Oráculo: leituras de energia, quantidades interpretadas
 * e o desfecho de cada indicação. Não altera missões nem rituais.
 */

export const ENERGY_TTL_MS = 45 * 60 * 1000;
export const ACCEPT_WINDOW_MS = 90 * 60 * 1000;
export const MAX_ENERGY_READINGS = 200;
export const MAX_ORACLE_DECISIONS = 400;
export const MAX_QUANTITY_READS = 300;
export const DOSE_ENERGY_MAX = 6;

export const DECLINE_REASONS = [
  { id: 'tired', label: 'Estou cansado' },
  { id: 'no_time', label: 'Não tenho tempo agora' },
  { id: 'wrong_place', label: 'Lugar errado' },
  { id: 'not_priority', label: 'Não é prioridade agora' },
  { id: 'similar_done', label: 'Já fiz algo parecido' },
  { id: 'not_feeling', label: 'Não estou a fim' },
  { id: 'other', label: 'Outro motivo' }
];

const DECLINE_IDS = new Set(DECLINE_REASONS.map(r => r.id));

export const QUANTITY_UNITS = ['minutes', 'pages', 'questions', 'reps', 'steps', 'chapters', 'items'];
const QUANTITY_UNIT_INPUTS = new Set([...QUANTITY_UNITS, 'hours']);

const UNIT_LABEL = {
  minutes: { one: 'minuto', many: 'minutos', short: 'min' },
  pages: { one: 'página', many: 'páginas', short: 'pág.' },
  questions: { one: 'questão', many: 'questões', short: 'questões' },
  reps: { one: 'repetição', many: 'repetições', short: 'reps' },
  steps: { one: 'etapa', many: 'etapas', short: 'etapas' },
  chapters: { one: 'capítulo', many: 'capítulos', short: 'cap.' },
  items: { one: 'item', many: 'itens', short: 'itens' }
};

export const AMOUNT_LADDER = [
  { id: 'quarter', value: 0.25 },
  { id: 'third', value: 1 / 3 },
  { id: 'half', value: 0.5 },
  { id: 'one', value: 1 },
  { id: 'two', value: 2 },
  { id: 'three', value: 3 },
  { id: 'four', value: 4 },
  { id: 'five', value: 5 },
  { id: 'six', value: 6 },
  { id: 'eight', value: 8 },
  { id: 'ten', value: 10 },
  { id: 'twelve', value: 12 },
  { id: 'fifteen', value: 15 },
  { id: 'twenty', value: 20 },
  { id: 'twenty_five', value: 25 },
  { id: 'thirty', value: 30 },
  { id: 'forty', value: 40 },
  { id: 'forty_five', value: 45 },
  { id: 'fifty', value: 50 },
  { id: 'sixty', value: 60 },
  { id: 'ninety', value: 90 },
  { id: 'hundred', value: 100 },
  { id: 'hundred_twenty', value: 120 },
  { id: 'hundred_fifty', value: 150 },
  { id: 'two_hundred', value: 200 }
];

export const AMOUNT_BY_ID = Object.fromEntries(AMOUNT_LADDER.map(step => [step.id, step.value]));

export const DOSE_FRACTIONS = [
  { id: 'tenth', value: 0.1 },
  { id: 'quarter', value: 0.25 },
  { id: 'half', value: 0.5 },
  { id: 'three_quarters', value: 0.75 },
  { id: 'full', value: 1 }
];

const DOSE_BY_ID = Object.fromEntries(DOSE_FRACTIONS.map(step => [step.id, step.value]));

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clip(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function energyBand(score) {
  const n = Math.max(1, Math.min(10, Math.round(Number(score) || 1)));
  if (n <= 2) return '1-2';
  if (n <= 4) return '3-4';
  if (n <= 6) return '5-6';
  if (n <= 8) return '7-8';
  return '9-10';
}

export function clampEnergy(raw) {
  const n = asNumber(raw);
  if (n == null) return null;
  return Math.max(1, Math.min(10, Math.round(n)));
}

export function energyFromJevScore(raw) {
  const n = asNumber(raw);
  if (n == null) return null;
  // O Score do Jev começa em 0. A escala visível é 1–10.
  return clampEnergy(Math.round(n) + 1);
}

export function roundEnergyScore(raw) {
  return energyFromJevScore(raw);
}

export function sanitizeEnergyReading(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = clip(raw.text, 500);
  const score = clampEnergy(raw.score);
  if (!text || score == null) return null;
  const createdAt = raw.createdAt || new Date().toISOString();
  return {
    id: raw.id || uid('en'),
    text,
    score,
    rawScore: asNumber(raw.rawScore) ?? score,
    confidence: asNumber(raw.confidence),
    createdAt,
    date: raw.date || createdAt.slice(0, 10),
    hour: Number.isInteger(raw.hour) ? raw.hour : null,
    dayOfWeek: Number.isInteger(raw.dayOfWeek) ? raw.dayOfWeek : null,
    location: raw.location || null
  };
}

export function sanitizeQuantityRead(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const entityId = clip(raw.entityId, 80);
  const sourceText = clip(raw.sourceText, 400);
  if (!entityId || !sourceText) return null;
  const unit = QUANTITY_UNITS.includes(raw.unit) ? raw.unit : null;
  const amount = asNumber(raw.amount);
  const hasQuantity = !!raw.hasQuantity && !!unit && amount != null && amount > 0;
  return {
    entityId,
    kind: raw.kind === 'habit' ? 'habit' : 'quest',
    sourceText,
    hasQuantity,
    unit: hasQuantity ? unit : null,
    amount: hasQuantity ? Math.round(amount * 100) / 100 : null,
    amountId: raw.amountId || null,
    confidence: asNumber(raw.confidence),
    readAt: raw.readAt || new Date().toISOString()
  };
}

export function sanitizeOracleDecision(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.id || !raw.entityId) return null;
  const outcome = ['pending', 'accepted', 'declined', 'expired', 'superseded'].includes(raw.outcome)
    ? raw.outcome
    : 'pending';
  return {
    id: String(raw.id),
    createdAt: raw.createdAt || new Date().toISOString(),
    date: raw.date || null,
    hour: Number.isInteger(raw.hour) ? raw.hour : null,
    dayOfWeek: Number.isInteger(raw.dayOfWeek) ? raw.dayOfWeek : null,
    location: raw.location || null,
    entityId: String(raw.entityId),
    kind: raw.kind === 'habit' ? 'habit' : 'quest',
    title: clip(raw.title, 180),
    category: raw.category || null,
    energyReadingId: raw.energyReadingId || null,
    energyScore: raw.energyScore == null ? null : clampEnergy(raw.energyScore),
    quantity: raw.quantity && raw.quantity.amount ? {
      amount: asNumber(raw.quantity.amount),
      unit: QUANTITY_UNITS.includes(raw.quantity.unit) ? raw.quantity.unit : 'items'
    } : null,
    dose: raw.dose && raw.dose.amount ? {
      amount: asNumber(raw.dose.amount),
      unit: QUANTITY_UNITS.includes(raw.dose.unit) ? raw.dose.unit : 'items',
      fraction: raw.dose.fraction || null,
      label: clip(raw.dose.label, 80)
    } : null,
    source: raw.source === 'jev' ? 'jev' : 'heuristic',
    probability: asNumber(raw.probability),
    confidence: asNumber(raw.confidence),
    outcome,
    declineReason: DECLINE_IDS.has(raw.declineReason) ? raw.declineReason : null,
    declineNote: clip(raw.declineNote, 240),
    resolvedAt: raw.resolvedAt || null
  };
}

export function ensureOracleMemory(db) {
  if (!db.oracleEnergyReadings) db.oracleEnergyReadings = [];
  if (!db.oracleDecisions) db.oracleDecisions = [];
  if (!db.oracleQuantityReads) db.oracleQuantityReads = [];
  db.oracleEnergyReadings = db.oracleEnergyReadings
    .map(sanitizeEnergyReading)
    .filter(Boolean)
    .slice(0, MAX_ENERGY_READINGS);
  db.oracleDecisions = db.oracleDecisions
    .map(sanitizeOracleDecision)
    .filter(Boolean)
    .slice(0, MAX_ORACLE_DECISIONS);
  db.oracleQuantityReads = db.oracleQuantityReads
    .map(sanitizeQuantityRead)
    .filter(Boolean)
    .slice(0, MAX_QUANTITY_READS);
  return db;
}

export function latestEnergyReading(db, now = new Date()) {
  ensureOracleMemory(db);
  const reading = db.oracleEnergyReadings[0];
  if (!reading) return null;
  const age = now.getTime() - new Date(reading.createdAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > ENERGY_TTL_MS) return null;
  return reading;
}

export function saveEnergyReading(db, reading) {
  ensureOracleMemory(db);
  const clean = sanitizeEnergyReading(reading);
  if (!clean) return null;
  db.oracleEnergyReadings.unshift(clean);
  db.oracleEnergyReadings = db.oracleEnergyReadings.slice(0, MAX_ENERGY_READINGS);
  return clean;
}

export function findQuantityRead(db, entityId, sourceText) {
  ensureOracleMemory(db);
  const wanted = clip(sourceText, 400);
  return db.oracleQuantityReads.find(read => read.entityId === entityId && read.sourceText === wanted) || null;
}

export function saveQuantityRead(db, reading) {
  ensureOracleMemory(db);
  const clean = sanitizeQuantityRead(reading);
  if (!clean) return null;
  db.oracleQuantityReads = db.oracleQuantityReads.filter(read => !(
    read.entityId === clean.entityId && read.sourceText === clean.sourceText
  ));
  db.oracleQuantityReads.unshift(clean);
  db.oracleQuantityReads = db.oracleQuantityReads.slice(0, MAX_QUANTITY_READS);
  return clean;
}

export function saveOracleDecision(db, decision) {
  ensureOracleMemory(db);
  const clean = sanitizeOracleDecision(decision);
  if (!clean) return null;
  db.oracleDecisions.unshift(clean);
  db.oracleDecisions = db.oracleDecisions.slice(0, MAX_ORACLE_DECISIONS);
  return clean;
}

export function findOracleDecision(db, id) {
  ensureOracleMemory(db);
  return db.oracleDecisions.find(item => item.id === id) || null;
}

export function declineReasonLabel(id) {
  return DECLINE_REASONS.find(reason => reason.id === id)?.label || 'Outro motivo';
}

export function formatQuantity(amount, unit) {
  const n = asNumber(amount);
  if (n == null || !UNIT_LABEL[unit]) return '';
  const rounded = Math.round(n);
  const label = UNIT_LABEL[unit];
  if (unit === 'minutes') return `${rounded} min`;
  return `${rounded} ${rounded === 1 ? label.one : label.many}`;
}

export function doseFloor(unit) {
  if (unit === 'minutes') return 5;
  if (unit === 'pages' || unit === 'questions' || unit === 'reps') return 2;
  return 1;
}

const CLOCK_FRACTIONS = new Set(['quarter', 'third', 'half']);

export function composeQuantity(hasQuantity, unit, amountId) {
  if (!hasQuantity) return null;
  const value = AMOUNT_BY_ID[amountId];
  if (value == null) return null;
  // hours+half = 30 min. minutes+half também, porque "meia hora" às vezes
  // é lida como duração fracionária e não como 0,5 minuto.
  if (unit === 'hours' || (unit === 'minutes' && CLOCK_FRACTIONS.has(amountId))) {
    return {
      hasQuantity: true,
      unit: 'minutes',
      amount: Math.max(1, Math.round(value * 60)),
      amountId
    };
  }
  if (!QUANTITY_UNITS.includes(unit)) return null;
  return {
    hasQuantity: true,
    unit,
    amount: Math.round(value * 100) / 100,
    amountId
  };
}

export function applyDose(quantity, fractionId) {
  if (!quantity?.hasQuantity || !quantity.amount) return null;
  const fraction = DOSE_BY_ID[fractionId] ?? 1;
  const floor = doseFloor(quantity.unit);
  let amount = quantity.amount * fraction;
  if (quantity.unit === 'minutes') amount = Math.round(amount / 5) * 5;
  else amount = Math.max(1, Math.round(amount));
  if (amount < floor && fraction < 1) amount = Math.min(quantity.amount, floor);
  amount = Math.min(quantity.amount, Math.max(floor, amount));
  if (fraction >= 1) amount = quantity.amount;
  return {
    amount,
    unit: quantity.unit,
    fraction: fractionId || 'full',
    reduced: amount < quantity.amount,
    label: formatQuantity(amount, quantity.unit)
  };
}

export function buildLearningSummary(db, { limit = 12 } = {}) {
  ensureOracleMemory(db);
  const settled = db.oracleDecisions.filter(item => item.outcome === 'accepted' || item.outcome === 'declined');
  const recent = settled.slice(0, limit).map(item => ({
    energy: item.energyScore,
    band: item.energyScore == null ? null : energyBand(item.energyScore),
    title: item.title,
    category: item.category,
    kind: item.kind,
    dose: item.dose?.label || null,
    full: item.quantity ? formatQuantity(item.quantity.amount, item.quantity.unit) : null,
    outcome: item.outcome,
    reason: item.outcome === 'declined' ? declineReasonLabel(item.declineReason) : null,
    note: item.declineNote || null
  }));

  const byBand = {};
  settled.slice(0, 80).forEach(item => {
    if (item.energyScore == null) return;
    const band = energyBand(item.energyScore);
    if (!byBand[band]) byBand[band] = { accepted: 0, declined: 0, acceptedDoses: [], declinedDoses: [] };
    byBand[band][item.outcome] += 1;
    const bucket = item.outcome === 'accepted' ? byBand[band].acceptedDoses : byBand[band].declinedDoses;
    if (item.dose?.label && bucket.length < 4) bucket.push(`${item.title}: ${item.dose.label}`);
  });

  return { recent, byBand };
}

export function markDecisionAccepted(db, { entityId, kind, at = new Date() } = {}) {
  ensureOracleMemory(db);
  if (!entityId) return null;
  const pending = db.oracleDecisions.find(item => (
    item.outcome === 'pending'
    && item.entityId === entityId
    && (!kind || item.kind === kind)
    && (at.getTime() - new Date(item.createdAt).getTime()) <= ACCEPT_WINDOW_MS
    && (at.getTime() - new Date(item.createdAt).getTime()) >= 0
  ));
  if (!pending) return null;
  pending.outcome = 'accepted';
  pending.resolvedAt = at.toISOString();
  return pending;
}

export function acceptPartialDose(db, decisionId, at = new Date()) {
  const decision = findOracleDecision(db, decisionId);
  if (!decision || decision.outcome !== 'pending') return null;
  if (!decision.dose?.amount || !decision.quantity?.amount) return null;
  if (decision.dose.amount >= decision.quantity.amount) return null;
  decision.outcome = 'accepted';
  decision.resolvedAt = at.toISOString();
  return decision;
}

export { uid as oracleUid };
