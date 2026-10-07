/**
 * Alquimia — suplementos e registros de consumo.
 *
 * Um suplemento é o item cadastrado (Omega 3, Creatina). Um registro é uma
 * tomada: data, hora e quantidade. Excluir o suplemento leva os registros
 * junto. Não concede XP: é diário de saúde, não ritual.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NAME_MAX = 80;
const UNIT_MAX = 24;
const NOTES_MAX = 500;
const DOSE_MAX = 1_000_000;

const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

export function ensureSupplements(db) {
  if (!db) return db;
  if (!Array.isArray(db.supplements)) db.supplements = [];
  if (!Array.isArray(db.supplementLogs)) db.supplementLogs = [];
  return db;
}

function fail(message, status = 400) {
  return { error: message, status };
}

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function parseDose(value) {
  if (value === '' || value == null) return null;
  const amount = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0 || amount > DOSE_MAX) return null;
  return Math.round(amount * 1000) / 1000;
}

function parseDate(value) {
  const date = String(value ?? '').trim();
  if (!DATE_RE.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1
    || probe.getUTCDate() !== day
  ) return null;
  return date;
}

function parseTime(value) {
  const time = String(value ?? '').trim();
  return TIME_RE.test(time) ? time : null;
}

function takenAtFrom(date, time) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

export function createSupplement(db, body = {}) {
  ensureSupplements(db);
  const name = cleanText(body.name, NAME_MAX);
  if (!name) return fail('Nome do suplemento é obrigatório.');
  const unit = cleanText(body.unit, UNIT_MAX) || 'dose';
  const defaultDose = body.defaultDose == null || body.defaultDose === ''
    ? null
    : parseDose(body.defaultDose);
  if (body.defaultDose != null && body.defaultDose !== '' && defaultDose == null) {
    return fail('A dose padrão precisa ser um número maior que zero.');
  }
  const notes = cleanText(body.notes, NOTES_MAX);
  const supplement = {
    id: uid('sup'),
    name,
    unit,
    defaultDose,
    notes,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.supplements.unshift(supplement);
  return { supplement };
}

export function updateSupplement(db, id, body = {}) {
  ensureSupplements(db);
  const supplement = db.supplements.find(item => item.id === id);
  if (!supplement) return fail('Suplemento não encontrado.', 404);

  if (body.name !== undefined) {
    const name = cleanText(body.name, NAME_MAX);
    if (!name) return fail('Nome do suplemento é obrigatório.');
    supplement.name = name;
  }
  if (body.unit !== undefined) {
    supplement.unit = cleanText(body.unit, UNIT_MAX) || 'dose';
  }
  if (body.defaultDose !== undefined) {
    if (body.defaultDose == null || body.defaultDose === '') {
      supplement.defaultDose = null;
    } else {
      const defaultDose = parseDose(body.defaultDose);
      if (defaultDose == null) return fail('A dose padrão precisa ser um número maior que zero.');
      supplement.defaultDose = defaultDose;
    }
  }
  if (body.notes !== undefined) supplement.notes = cleanText(body.notes, NOTES_MAX);
  if (body.archived !== undefined) supplement.archived = !!body.archived;
  supplement.updatedAt = new Date().toISOString();
  return { supplement };
}

export function deleteSupplement(db, id) {
  ensureSupplements(db);
  const index = db.supplements.findIndex(item => item.id === id);
  if (index === -1) return fail('Suplemento não encontrado.', 404);
  const [removed] = db.supplements.splice(index, 1);
  const removedLogs = db.supplementLogs.filter(log => log.supplementId === id);
  db.supplementLogs = db.supplementLogs.filter(log => log.supplementId !== id);
  return { removed, removedLogs };
}

export function logSupplementIntake(db, body = {}) {
  ensureSupplements(db);
  const supplement = db.supplements.find(item => item.id === body.supplementId);
  if (!supplement) return fail('Suplemento não encontrado.', 404);
  if (supplement.archived) return fail('Este suplemento está arquivado. Reative-o para registrar consumo.');

  const amount = parseDose(body.amount);
  if (amount == null) return fail('A quantidade tomada precisa ser um número maior que zero.');
  const date = parseDate(body.date);
  if (!date) return fail('Informe a data no formato YYYY-MM-DD.');
  const time = parseTime(body.time);
  if (!time) return fail('Informe a hora no formato HH:mm.');

  const log = {
    id: uid('suplog'),
    supplementId: supplement.id,
    amount,
    unit: supplement.unit,
    date,
    time,
    takenAt: takenAtFrom(date, time),
    notes: cleanText(body.notes, NOTES_MAX),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.supplementLogs.unshift(log);
  return { log, supplement };
}

export function updateSupplementLog(db, id, body = {}) {
  ensureSupplements(db);
  const log = db.supplementLogs.find(item => item.id === id);
  if (!log) return fail('Registro de consumo não encontrado.', 404);

  if (body.supplementId !== undefined && body.supplementId !== log.supplementId) {
    const supplement = db.supplements.find(item => item.id === body.supplementId);
    if (!supplement) return fail('Suplemento não encontrado.', 404);
    log.supplementId = supplement.id;
    log.unit = supplement.unit;
  }
  if (body.amount !== undefined) {
    const amount = parseDose(body.amount);
    if (amount == null) return fail('A quantidade tomada precisa ser um número maior que zero.');
    log.amount = amount;
  }
  if (body.date !== undefined || body.time !== undefined) {
    const date = parseDate(body.date !== undefined ? body.date : log.date);
    const time = parseTime(body.time !== undefined ? body.time : log.time);
    if (!date) return fail('Informe a data no formato YYYY-MM-DD.');
    if (!time) return fail('Informe a hora no formato HH:mm.');
    log.date = date;
    log.time = time;
    log.takenAt = takenAtFrom(date, time);
  }
  if (body.notes !== undefined) log.notes = cleanText(body.notes, NOTES_MAX);
  const current = db.supplements.find(item => item.id === log.supplementId);
  if (current) log.unit = current.unit;
  log.updatedAt = new Date().toISOString();
  return { log, supplement: current || null };
}

export function deleteSupplementLog(db, id) {
  ensureSupplements(db);
  const index = db.supplementLogs.findIndex(item => item.id === id);
  if (index === -1) return fail('Registro de consumo não encontrado.', 404);
  const [removed] = db.supplementLogs.splice(index, 1);
  return { removed };
}
