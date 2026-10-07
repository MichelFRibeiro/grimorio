/**
 * Registro diário de tempo no celular.
 * Uma entrada por data. A pergunta da abertura só cobre ontem;
 * a seção permite corrigir qualquer dia já passado, inclusive hoje.
 */

import { uid } from '../db.js';
import { getSaoPauloDateStr } from '../timeUtils.js';
import {
  PHONE_TIME_MAX_MINUTES,
  PHONE_TIME_NOTE_MAX,
  isDateKey,
  parsePhoneTimeMinutes,
  sanitizePhoneTimeLogs
} from '../../src/utils/phoneTime.js';

function fail(error, status = 400) {
  return { error, status };
}

export function ensurePhoneTimeLogs(db) {
  if (!db) return [];
  db.phoneTimeLogs = sanitizePhoneTimeLogs(db.phoneTimeLogs);
  return db.phoneTimeLogs;
}

export function upsertPhoneTimeLog(db, body = {}, { todayStr = getSaoPauloDateStr(), now = new Date() } = {}) {
  ensurePhoneTimeLogs(db);
  const date = String(body.date || '').trim();
  if (!isDateKey(date)) return fail('Data inválida. Use YYYY-MM-DD.');
  if (date > todayStr) return fail('Não é possível registrar tempo de celular em data futura.');

  const minutes = parsePhoneTimeMinutes(body.minutes);
  if (minutes == null) return fail('Informe o tempo em minutos, ou como 2h 15.');
  if (minutes > PHONE_TIME_MAX_MINUTES) {
    return fail('O tempo no celular não pode passar de 24 horas.');
  }

  const note = String(body.note || '').trim().slice(0, PHONE_TIME_NOTE_MAX);
  const existing = db.phoneTimeLogs.find((entry) => entry.date === date);
  const stamp = now.toISOString();
  if (existing) {
    existing.minutes = minutes;
    existing.note = note;
    existing.updatedAt = stamp;
    return { log: existing, created: false };
  }

  const log = {
    id: uid('phone'),
    date,
    minutes,
    note,
    createdAt: stamp,
    updatedAt: stamp
  };
  db.phoneTimeLogs.unshift(log);
  db.phoneTimeLogs = sanitizePhoneTimeLogs(db.phoneTimeLogs);
  return { log: db.phoneTimeLogs.find((entry) => entry.date === date) || log, created: true };
}

export function deletePhoneTimeLog(db, id) {
  ensurePhoneTimeLogs(db);
  const index = db.phoneTimeLogs.findIndex((entry) => entry.id === id);
  if (index === -1) return fail('Registro de tempo no celular não encontrado.', 404);
  const [removed] = db.phoneTimeLogs.splice(index, 1);
  return { removed };
}
