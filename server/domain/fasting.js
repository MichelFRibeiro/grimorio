/**
 * Registro de jejum. Um em curso por vez. Horário local é o de São Paulo.
 */

import { uid } from '../db.js';
import {
  DEFAULT_FASTING_TARGET_MINUTES,
  FASTING_MAX_DURATION_MS,
  FASTING_MIN_DURATION_MS,
  FASTING_NOTE_MAX,
  findOverlap,
  isFutureInstant,
  parseFastingInstant,
  parseTargetMinutes,
  protocolIdForMinutes,
  sanitizeFastingSessions
} from '../../src/utils/fasting.js';

function fail(error, status = 400) {
  return { error, status };
}

export function ensureFastingSessions(db) {
  if (!db) return [];
  db.fastingSessions = sanitizeFastingSessions(db.fastingSessions);
  return db.fastingSessions;
}

function noteOf(body) {
  return String(body?.note || '').trim().slice(0, FASTING_NOTE_MAX);
}

function targetOf(body, fallback) {
  if (body?.targetMinutes == null || body.targetMinutes === '') {
    return fallback ?? DEFAULT_FASTING_TARGET_MINUTES;
  }
  const parsed = parseTargetMinutes(body.targetMinutes);
  if (parsed == null) return fail('A meta precisa ficar entre 1 hora e 7 dias.');
  return parsed;
}

function saved(db, id, extra = {}) {
  return {
    fastingSessions: db.fastingSessions,
    session: db.fastingSessions.find((item) => item.id === id) || null,
    ...extra
  };
}

export function startFastingSession(db, body = {}, { now = new Date() } = {}) {
  ensureFastingSessions(db);
  const started = body.startedAt ? parseFastingInstant(body.startedAt) : now;
  if (!started) return fail('Horário de início inválido.');
  if (isFutureInstant(started, now)) return fail('O jejum não pode começar no futuro.');

  const ended = body.endedAt ? parseFastingInstant(body.endedAt) : null;
  if (body.endedAt && !ended) return fail('Horário de fim inválido.');
  if (ended && isFutureInstant(ended, now)) return fail('O jejum não pode terminar no futuro.');
  if (ended && ended.getTime() - started.getTime() < FASTING_MIN_DURATION_MS) {
    return fail('O jejum precisa durar pelo menos 1 minuto.');
  }
  if (ended && ended.getTime() - started.getTime() > FASTING_MAX_DURATION_MS) {
    return fail('Um jejum não pode passar de 7 dias neste registro. Confira o horário.');
  }

  const open = db.fastingSessions.find((session) => !session.endedAt);
  if (!ended && open) {
    return fail('Já existe um jejum em curso. Encerre-o antes de começar outro.');
  }

  const target = targetOf(body);
  if (target?.error) return target;

  const rangeEnd = ended ? ended.getTime() : now.getTime();
  if (findOverlap(db.fastingSessions, { start: started.getTime(), end: rangeEnd }, null, now)) {
    return fail('Esse horário cruza outro jejum já registrado.');
  }

  const stamp = now.toISOString();
  const session = {
    id: uid('fast'),
    startedAt: started.toISOString(),
    endedAt: ended ? ended.toISOString() : null,
    targetMinutes: target,
    protocol: protocolIdForMinutes(target),
    note: noteOf(body),
    createdAt: stamp,
    updatedAt: stamp
  };
  db.fastingSessions.unshift(session);
  db.fastingSessions = sanitizeFastingSessions(db.fastingSessions);
  return { ...saved(db, session.id), created: true };
}

export function endFastingSession(db, id, body = {}, { now = new Date() } = {}) {
  ensureFastingSessions(db);
  const session = db.fastingSessions.find((item) => item.id === id);
  if (!session) return fail('Jejum não encontrado.', 404);
  if (session.endedAt) return fail('Esse jejum já foi encerrado.');

  const ended = body.endedAt ? parseFastingInstant(body.endedAt) : now;
  if (!ended) return fail('Horário de fim inválido.');
  if (isFutureInstant(ended, now)) return fail('O jejum não pode terminar no futuro.');

  const started = parseFastingInstant(session.startedAt);
  const duration = ended.getTime() - started.getTime();
  if (duration < FASTING_MIN_DURATION_MS) return fail('O jejum precisa durar pelo menos 1 minuto.');
  if (duration > FASTING_MAX_DURATION_MS) {
    return fail('Um jejum não pode passar de 7 dias neste registro. Confira o horário.');
  }
  if (findOverlap(db.fastingSessions, { start: started.getTime(), end: ended.getTime() }, session.id, now)) {
    return fail('Esse horário cruza outro jejum já registrado.');
  }

  session.endedAt = ended.toISOString();
  if (body.note != null) session.note = noteOf(body);
  session.updatedAt = now.toISOString();
  db.fastingSessions = sanitizeFastingSessions(db.fastingSessions);
  return saved(db, id);
}

export function updateFastingSession(db, id, body = {}, { now = new Date() } = {}) {
  ensureFastingSessions(db);
  const session = db.fastingSessions.find((item) => item.id === id);
  if (!session) return fail('Jejum não encontrado.', 404);

  const started = body.startedAt != null
    ? parseFastingInstant(body.startedAt)
    : parseFastingInstant(session.startedAt);
  if (!started) return fail('Horário de início inválido.');
  if (isFutureInstant(started, now)) return fail('O jejum não pode começar no futuro.');

  let ended = session.endedAt ? parseFastingInstant(session.endedAt) : null;
  if (body.endedAt === null || body.endedAt === '') {
    ended = null;
  } else if (body.endedAt != null) {
    ended = parseFastingInstant(body.endedAt);
    if (!ended) return fail('Horário de fim inválido.');
  }
  if (ended && isFutureInstant(ended, now)) return fail('O jejum não pode terminar no futuro.');
  if (ended) {
    const duration = ended.getTime() - started.getTime();
    if (duration < FASTING_MIN_DURATION_MS) return fail('O jejum precisa durar pelo menos 1 minuto.');
    if (duration > FASTING_MAX_DURATION_MS) {
      return fail('Um jejum não pode passar de 7 dias neste registro. Confira o horário.');
    }
  }

  const anotherOpen = db.fastingSessions.find((item) => item.id !== id && !item.endedAt);
  if (!ended && anotherOpen) {
    return fail('Já existe um jejum em curso. Encerre-o antes de reabrir este.');
  }

  const target = targetOf(body, session.targetMinutes);
  if (target?.error) return target;

  const rangeEnd = ended ? ended.getTime() : now.getTime();
  if (findOverlap(db.fastingSessions, { start: started.getTime(), end: rangeEnd }, id, now)) {
    return fail('Esse horário cruza outro jejum já registrado.');
  }

  session.startedAt = started.toISOString();
  session.endedAt = ended ? ended.toISOString() : null;
  session.targetMinutes = target;
  session.protocol = protocolIdForMinutes(target);
  if (body.note != null) session.note = noteOf(body);
  session.updatedAt = now.toISOString();
  db.fastingSessions = sanitizeFastingSessions(db.fastingSessions);
  return saved(db, id);
}

export function deleteFastingSession(db, id) {
  ensureFastingSessions(db);
  const index = db.fastingSessions.findIndex((item) => item.id === id);
  if (index === -1) return fail('Jejum não encontrado.', 404);
  const [removed] = db.fastingSessions.splice(index, 1);
  return { removed, fastingSessions: db.fastingSessions };
}
