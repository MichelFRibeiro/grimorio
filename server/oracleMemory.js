/**
 * Memória do Oráculo: leituras de energia, quantidades interpretadas
 * e o desfecho de cada indicação. Não altera missões nem rituais.
 */

import { getSaoPauloDateStr } from './timeUtils.js';

export const ENERGY_TTL_MS = 45 * 60 * 1000;
export const ENERGY_SKIP_TTL_MS = 45 * 60 * 1000;
export const ACCEPT_WINDOW_MS = 90 * 60 * 1000;
export const DECISION_DEDUPE_MS = 2 * 60 * 1000;
export const MAX_ENERGY_READINGS = 200;
export const MAX_ORACLE_DECISIONS = 400;
export const MAX_QUANTITY_READS = 300;
export const QUANTITY_MISS_TTL_MS = 15 * 60 * 1000;
export const DOSE_ENERGY_MAX = 6;
export const DECISION_KINDS = ['quest', 'habit', 'victory'];
export const DECISION_OUTCOMES = ['pending', 'accepted', 'declined', 'expired', 'superseded'];

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
  // Number(null) === 0 e Number('') === 0: sem esta guarda, um campo ausente
  // voltava como zero na releitura e contaminava a memória do Oráculo.
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function energyBand(score) {
  const n = Math.max(1, Math.min(10, Math.round(Number(score) || 1)));
  if (n <= 2) return '0-2';
  if (n <= 4) return '3-4';
  if (n <= 6) return '5-6';
  if (n <= 8) return '7-8';
  return '9-10';
}

export function clampEnergy(raw) {
  const n = asNumber(raw);
  if (n == null) return null;
  return Math.max(0, Math.min(10, Math.round(n)));
}

export function energyFromJevScore(raw) {
  // 5,68 é a nota. O inteiro mais próximo é 6. Não se soma 1.
  return clampEnergy(raw);
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
    // A data é civil de São Paulo: o ISO gravado é UTC e viraria o dia errado
    // depois das 21h.
    date: raw.date || getSaoPauloDateStr(createdAt),
    hour: Number.isInteger(raw.hour) ? raw.hour : null,
    dayOfWeek: Number.isInteger(raw.dayOfWeek) ? raw.dayOfWeek : null,
    location: raw.location || null,
    // 'local' marca a estimativa de emergência usada quando o Jev não responde.
    source: raw.source === 'local' ? 'local' : 'jev'
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
  const outcome = DECISION_OUTCOMES.includes(raw.outcome) ? raw.outcome : 'pending';
  return {
    id: String(raw.id),
    createdAt: raw.createdAt || new Date().toISOString(),
    date: raw.date || null,
    hour: Number.isInteger(raw.hour) ? raw.hour : null,
    dayOfWeek: Number.isInteger(raw.dayOfWeek) ? raw.dayOfWeek : null,
    location: raw.location || null,
    entityId: String(raw.entityId),
    // 'victory' precisa sobreviver: sem isso a decisão da Vitória do Dia era
    // gravada como missão e nunca podia ser aceita.
    kind: DECISION_KINDS.includes(raw.kind) ? raw.kind : 'quest',
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
    abstained: !!raw.abstained,
    outcome,
    declineReason: DECLINE_IDS.has(raw.declineReason) ? raw.declineReason : null,
    declineNote: clip(raw.declineNote, 240),
    resolvedAt: raw.resolvedAt || null
  };
}

function sanitizeEnergySkip(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const at = raw.at;
  if (!at || !Number.isFinite(new Date(at).getTime())) return null;
  return {
    at,
    date: raw.date || getSaoPauloDateStr(at),
    hour: Number.isInteger(raw.hour) ? raw.hour : null
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
  db.oracleEnergySkip = sanitizeEnergySkip(db.oracleEnergySkip);
  expireStaleDecisions(db);
  return db;
}

/**
 * Uma indicação sem resposta dentro da janela de aceite não fica pendente
 * para sempre: ela vira histórico expirado e sai da fila de aprendizado.
 */
export function expireStaleDecisions(db, now = new Date()) {
  const reference = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(reference)) return db;
  (db.oracleDecisions || []).forEach(item => {
    if (item.outcome !== 'pending') return;
    const age = reference - new Date(item.createdAt).getTime();
    if (!Number.isFinite(age) || age < 0) return;
    if (age > ACCEPT_WINDOW_MS) {
      item.outcome = 'expired';
      item.resolvedAt = new Date(reference).toISOString();
    }
  });
  return db;
}

export function markEnergySkip(db, { now = new Date(), date, hour } = {}) {
  ensureOracleMemory(db);
  const reference = now instanceof Date ? now : new Date(now);
  db.oracleEnergySkip = sanitizeEnergySkip({
    at: reference.toISOString(),
    date,
    hour
  });
  return db.oracleEnergySkip;
}

export function clearEnergySkip(db) {
  if (!db) return null;
  db.oracleEnergySkip = null;
  return null;
}

/**
 * "Pular" precisa valer por uma janela, não só para a requisição seguinte:
 * toda atualização da tela reavalia a indicação e a pergunta voltaria.
 */
export function isEnergySkipped(db, now = new Date()) {
  const skip = db?.oracleEnergySkip;
  if (!skip?.at) return false;
  const reference = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const age = reference - new Date(skip.at).getTime();
  if (!Number.isFinite(age) || age < 0 || age > ENERGY_SKIP_TTL_MS) return false;
  return true;
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
  clearEnergySkip(db);
  return clean;
}

/**
 * Última leitura de quantidade para este texto exato (telemetria).
 *
 * Um "sem quantidade" NÃO é reutilizado: o modelo pode ter errado a sigla
 * (ver commit "consultar o Jev de novo a cada leitura de quantidade"), então
 * `resolveQuantity` só aproveita um acerto (`findQuantityHit`).
 */
export function findQuantityRead(db, entityId, sourceText, now = new Date()) {
  ensureOracleMemory(db);
  const wanted = clip(sourceText, 400);
  const read = db.oracleQuantityReads.find(item => item.entityId === entityId && item.sourceText === wanted) || null;
  if (!read || read.hasQuantity) return read;
  // Um "sem quantidade" pode ser o modelo não ter reconhecido a sigla.
  // Não pode ficar gravado para sempre, senão a correção nunca é consultada.
  const age = now.getTime() - new Date(read.readAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > QUANTITY_MISS_TTL_MS) return null;
  return read;
}

/** Leitura já confirmada e ainda válida para o mesmo texto da tarefa. */
export function findQuantityHit(db, entityId, sourceText) {
  const read = findQuantityRead(db, entityId, sourceText);
  return read?.hasQuantity ? read : null;
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

  // Reprocessar a mesma indicação não pode gerar uma decisão nova a cada clique:
  // isso poluía o aprendizado com pendências que o herói nunca viu.
  const duplicate = db.oracleDecisions.find(item => (
    item.outcome === 'pending'
    && item.entityId === clean.entityId
    && item.source === clean.source
    && item.date === clean.date
    && item.hour === clean.hour
    && item.location === clean.location
    && item.energyReadingId === clean.energyReadingId
    && (new Date(clean.createdAt).getTime() - new Date(item.createdAt).getTime()) <= DECISION_DEDUPE_MS
  ));
  if (duplicate) return duplicate;

  // Uma indicação nova para a mesma atividade substitui a anterior sem resposta.
  db.oracleDecisions.forEach(item => {
    if (item.outcome === 'pending' && item.entityId === clean.entityId) {
      item.outcome = 'superseded';
      item.resolvedAt = clean.createdAt;
    }
  });

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

const NUMBER_WORDS = [
  ['meia', 0.5],
  ['half', 0.5],
  ['duas', 2],
  ['dois', 2],
  ['two', 2],
  ['três', 3],
  ['tres', 3],
  ['three', 3],
  ['quatro', 4],
  ['four', 4],
  ['cinco', 5],
  ['five', 5],
  ['seis', 6],
  ['six', 6],
  ['sete', 7],
  ['seven', 7],
  ['oito', 8],
  ['eight', 8],
  ['nove', 9],
  ['nine', 9],
  ['dez', 10],
  ['ten', 10]
];

/**
 * O dígito do título é fato, não julgamento. "Analisar 5 PABs" tem 5
 * mesmo quando o Jev não reconhece a sigla. Sem número, devolve null
 * e a leitura continua inteiramente com o modelo.
 */
export function explicitAmount(text) {
  const source = String(text || '');
  const digit = source.match(/(?:^|[\s(])(\d{1,3}(?:[.,]\d+)?)(?=$|[\s).,;:])/);
  if (digit) {
    const value = Number(digit[1].replace(',', '.'));
    if (value > 0 && value <= MAX_QUANTITY_AMOUNT) return value;
  }
  const lower = source.toLowerCase();
  const word = NUMBER_WORDS.find(([token]) => new RegExp(`(?:^|\\s)${token}(?:$|\\s)`, 'i').test(lower));
  return word ? word[1] : null;
}

export function nearestAmountId(value) {
  const n = asNumber(value);
  if (n == null || n <= 0) return null;
  let best = null;
  let bestDistance = Infinity;
  AMOUNT_LADDER.forEach(step => {
    const distance = Math.abs(step.value - n);
    if (distance < bestDistance) {
      best = step;
      bestDistance = distance;
    }
  });
  if (!best || bestDistance > 0.001) return null;
  return best.id;
}

export const MAX_QUANTITY_AMOUNT = 999;

/**
 * Combina unidade e magnitude em uma quantidade.
 *
 * `explicitValue` é o número escrito na tarefa quando ele não está na régua
 * (7, 9, 300…). Sem ele, "Ler 7 páginas" ficava sem quantidade e nunca
 * recebia dose.
 */
export function composeQuantity(hasQuantity, unit, amountId, explicitValue = null) {
  if (!hasQuantity) return null;
  const ladderValue = AMOUNT_BY_ID[amountId];
  const rawValue = ladderValue != null ? ladderValue : asNumber(explicitValue);
  if (rawValue == null || rawValue <= 0 || rawValue > MAX_QUANTITY_AMOUNT) return null;
  const resolvedId = ladderValue != null ? amountId : null;
  // hours+half = 30 min. minutes+half também, porque "meia hora" às vezes
  // é lida como duração fracionária e não como 0,5 minuto.
  if (unit === 'hours' || (unit === 'minutes' && CLOCK_FRACTIONS.has(amountId))) {
    return {
      hasQuantity: true,
      unit: 'minutes',
      amount: Math.max(1, Math.round(rawValue * 60)),
      amountId: resolvedId
    };
  }
  if (!QUANTITY_UNITS.includes(unit)) return null;
  if (unit !== 'minutes' && !Number.isInteger(rawValue) && resolvedId == null) {
    // Fração solta ("1,5 recursos") não vira leitura confiável.
    return null;
  }
  return {
    hasQuantity: true,
    unit,
    amount: unit === 'minutes'
      ? Math.max(1, Math.round(rawValue))
      : Math.round(rawValue * 100) / 100,
    amountId: resolvedId
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

/**
 * Retrato compacto da memória do Oráculo para a interface.
 * Até aqui os desfechos só alimentavam o prompt do Jev e ficavam invisíveis.
 */
export function oracleMemoryStats(db, { limit = 20 } = {}) {
  ensureOracleMemory(db);
  const counts = { accepted: 0, declined: 0, pending: 0, expired: 0, superseded: 0 };
  db.oracleDecisions.forEach(item => {
    counts[item.outcome] = (counts[item.outcome] || 0) + 1;
  });
  const answered = counts.accepted + counts.declined;
  const reading = db.oracleEnergyReadings[0] || null;
  return {
    counts,
    answered,
    acceptanceRate: answered ? Math.round((counts.accepted / answered) * 100) : null,
    energyReadings: db.oracleEnergyReadings.length,
    lastEnergy: reading ? {
      score: reading.score,
      text: reading.text,
      createdAt: reading.createdAt
    } : null,
    byBand: buildLearningSummary(db, { limit }).byBand,
    recent: db.oracleDecisions.slice(0, limit).map(item => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      outcome: item.outcome,
      createdAt: item.createdAt,
      energyScore: item.energyScore,
      dose: item.dose?.label || null,
      declineReason: item.outcome === 'declined' ? declineReasonLabel(item.declineReason) : null
    }))
  };
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
