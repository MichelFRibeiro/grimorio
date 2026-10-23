/**
 * Jej um — monitoramento.
 *
 * Uma janela em curso por vez, mais o histórico do que já foi encerrado.
 * Não concede XP: é observação, como o tempo no celular.
 *
 * Os marcos (FASTING_STAGES) são referência de acompanhamento, não orientação médica.
 */

import { addDaysToDateStr, getSaoPauloDateStr } from './timeUtils.js';

export const FASTING_NOTE_MAX = 280;
export const FASTING_MIN_TARGET_MINUTES = 60;
export const FASTING_MAX_TARGET_MINUTES = 7 * 24 * 60;
export const FASTING_MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const FASTING_MIN_DURATION_MS = 60 * 1000;
export const FASTING_FUTURE_SKEW_MS = 2 * 60 * 1000;
export const FASTING_CHART_DAYS = 30;
export const DEFAULT_FASTING_TARGET_MINUTES = 16 * 60;

export const FASTING_PROTOCOLS = [
  { id: '12', label: '12:12', hours: 12 },
  { id: '14', label: '14:10', hours: 14 },
  { id: '16', label: '16:8', hours: 16 },
  { id: '18', label: '18:6', hours: 18 },
  { id: '20', label: '20:4', hours: 20 },
  { id: '23', label: 'OMAD', hours: 23 },
  { id: '24', label: '24 h', hours: 24 }
];

export const FASTING_STAGES = [
  { id: 'digestion', fromHours: 0, label: 'Digestão', detail: 'O corpo ainda usa a última refeição.' },
  { id: 'glucose', fromHours: 4, label: 'Glicose em queda', detail: 'A reserva rápida de glicose começa a baixar.' },
  { id: 'transition', fromHours: 8, label: 'Transição', detail: 'O organismo passa a buscar outra fonte de energia.' },
  { id: 'established', fromHours: 12, label: 'Jejum estabelecido', detail: 'Marco usual do jejum intermitente.' },
  { id: 'deep', fromHours: 16, label: 'Jejum profundo', detail: 'Faixa comum dos protocolos 16:8 e mais longos.' },
  { id: 'extended', fromHours: 24, label: 'Jejum prolongado', detail: 'Passou de um dia. Acompanhe com atenção.' }
];

const LOCAL_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function parseFastingInstant(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  const local = raw.match(LOCAL_RE);
  if (local && !/[zZ]$/.test(raw) && !/[+-]\d{2}:\d{2}$/.test(raw)) {
    const date = new Date(`${local[1]}T${local[2]}:${local[3]}:${local[4] || '00'}-03:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isFutureInstant(date, now = new Date()) {
  return date.getTime() > now.getTime() + FASTING_FUTURE_SKEW_MS;
}

export function parseTargetMinutes(value) {
  if (value == null || value === '') return null;
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes)) return null;
  if (minutes < FASTING_MIN_TARGET_MINUTES || minutes > FASTING_MAX_TARGET_MINUTES) return null;
  return minutes;
}

export function protocolById(id) {
  return FASTING_PROTOCOLS.find((item) => item.id === id) || null;
}

export function protocolIdForMinutes(minutes) {
  const match = FASTING_PROTOCOLS.find((item) => item.hours * 60 === minutes);
  return match ? match.id : 'custom';
}

export function protocolLabel(minutes) {
  const protocol = protocolById(protocolIdForMinutes(minutes));
  if (protocol) return protocol.label;
  return formatFastingSpan(minutes * 60000);
}

/** Horas de alimentação do protocolo de 24h. Personalizado não inventa janela. */
export function eatingWindowHours(targetMinutes) {
  const protocol = protocolById(protocolIdForMinutes(targetMinutes));
  if (!protocol) return null;
  return Math.max(0, 24 - protocol.hours);
}

export function fastingStage(elapsedMs) {
  const hours = Math.max(0, Number(elapsedMs) || 0) / 3600000;
  let current = FASTING_STAGES[0];
  for (const stage of FASTING_STAGES) {
    if (hours >= stage.fromHours) current = stage;
  }
  return current;
}

export function formatFastingClock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export function formatFastingSpan(ms) {
  const minutes = Math.max(0, Math.round((Number(ms) || 0) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${String(rest).padStart(2, '0')}min`;
}

export function sessionDurationMs(session, now = new Date()) {
  const start = parseFastingInstant(session?.startedAt);
  if (!start) return 0;
  const end = session?.endedAt ? parseFastingInstant(session.endedAt) : now;
  if (!end) return 0;
  return Math.max(0, end.getTime() - start.getTime());
}

export function goalReached(session, now = new Date()) {
  const target = Number(session?.targetMinutes) || 0;
  if (target <= 0) return false;
  return sessionDurationMs(session, now) >= target * 60000;
}

function cleanNote(value) {
  return String(value || '').trim().slice(0, FASTING_NOTE_MAX);
}

export function sanitizeFastingSessions(list = []) {
  const byId = new Map();
  (Array.isArray(list) ? list : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const start = parseFastingInstant(entry.startedAt);
    if (!start) return;
    const ended = entry.endedAt == null || entry.endedAt === ''
      ? null
      : parseFastingInstant(entry.endedAt);
    if ((entry.endedAt != null && entry.endedAt !== '') && !ended) return;
    if (ended && ended.getTime() <= start.getTime()) return;
    if (ended && ended.getTime() - start.getTime() > FASTING_MAX_DURATION_MS) return;
    const targetMinutes = parseTargetMinutes(entry.targetMinutes) || DEFAULT_FASTING_TARGET_MINUTES;
    const id = String(entry.id || `fast-${start.toISOString()}`).slice(0, 80);
    byId.set(id, {
      id,
      startedAt: start.toISOString(),
      endedAt: ended ? ended.toISOString() : null,
      targetMinutes,
      protocol: protocolIdForMinutes(targetMinutes),
      note: cleanNote(entry.note),
      createdAt: parseFastingInstant(entry.createdAt)?.toISOString() || start.toISOString(),
      updatedAt: parseFastingInstant(entry.updatedAt)?.toISOString() || start.toISOString()
    });
  });
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function openFastingSessions(list = []) {
  return sanitizeFastingSessions(list).filter((session) => !session.endedAt);
}

export function activeFastingSession(list = []) {
  return openFastingSessions(list)[0] || null;
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function sessionRange(session, now = new Date()) {
  const start = parseFastingInstant(session?.startedAt);
  if (!start) return null;
  const end = session?.endedAt ? parseFastingInstant(session.endedAt) : now;
  if (!end || end.getTime() <= start.getTime()) return null;
  return { start: start.getTime(), end: end.getTime() };
}

export function findOverlap(sessions, range, ignoreId, now = new Date()) {
  if (!range || range.end <= range.start) return null;
  return sanitizeFastingSessions(sessions).find((session) => {
    if (session.id === ignoreId) return false;
    const other = sessionRange(session, now);
    if (!other) return false;
    return rangesOverlap(range.start, range.end, other.start, other.end);
  }) || null;
}

/**
 * Dias seguidos com a meta batida. O jejum em curso já conta hoje se passou da meta.
 * Se hoje ainda não bateu, a sequência olha a partir de ontem.
 */
export function fastingStreak(sessions, now = new Date()) {
  const list = sanitizeFastingSessions(sessions);
  const today = getSaoPauloDateStr(now);
  const hit = new Set();
  list.forEach((session) => {
    if (!session.endedAt || !goalReached(session, now)) return;
    hit.add(getSaoPauloDateStr(session.endedAt));
  });
  const active = activeFastingSession(list);
  if (active && goalReached(active, now)) hit.add(today);

  let cursor = hit.has(today) ? today : addDaysToDateStr(today, -1);
  let streak = 0;
  while (hit.has(cursor)) {
    streak += 1;
    cursor = addDaysToDateStr(cursor, -1);
  }
  return streak;
}

/**
 * Cada barra é a soma dos jejuns encerrados naquele dia (fuso de São Paulo).
 * O jejum em curso fica só no relógio, até ser encerrado.
 */
export function buildFastingSeries(sessions = [], todayStr = getSaoPauloDateStr(), days = FASTING_CHART_DAYS) {
  const windowDays = Math.min(90, Math.max(7, Math.round(Number(days) || FASTING_CHART_DAYS)));
  const start = addDaysToDateStr(todayStr, -(windowDays - 1));
  const byDate = new Map();
  sanitizeFastingSessions(sessions).forEach((session) => {
    if (!session.endedAt) return;
    const dateStr = getSaoPauloDateStr(session.endedAt);
    if (dateStr < start || dateStr > todayStr) return;
    const bucket = byDate.get(dateStr) || { minutes: 0, count: 0, hits: 0 };
    bucket.minutes += Math.round(sessionDurationMs(session) / 60000);
    bucket.count += 1;
    if (goalReached(session)) bucket.hits += 1;
    byDate.set(dateStr, bucket);
  });

  const points = [];
  for (let i = 0; i < windowDays; i += 1) {
    const dateStr = addDaysToDateStr(start, i);
    const bucket = byDate.get(dateStr) || { minutes: 0, count: 0, hits: 0 };
    points.push({
      dateStr,
      minutes: bucket.minutes,
      count: bucket.count,
      hits: bucket.hits,
      hit: bucket.count > 0 && bucket.hits === bucket.count
    });
  }
  const logged = points.filter((point) => point.count > 0);
  const totalMinutes = logged.reduce((sum, point) => sum + point.minutes, 0);
  return {
    days: windowDays,
    points,
    loggedDays: logged.length,
    totalMinutes,
    avgMinutes: logged.length ? Math.round(totalMinutes / logged.length) : 0,
    maxMinutes: points.reduce((max, point) => Math.max(max, point.minutes), 0),
    hits: logged.reduce((sum, point) => sum + point.hits, 0),
    completed: logged.reduce((sum, point) => sum + point.count, 0)
  };
}
