/**
 * Tempo no celular.
 *
 * O herói informa, uma vez por dia, quanto tempo passou no celular ONTEM.
 * O registro fica editável para correção. Não concede XP: é observação, não ritual.
 *
 * A série de produtividade do mesmo dia junta missões concluídas, rituais,
 * Biblioteca, Escrituras, blocos AGU e sessões de mapa que não entram no AGU.
 * Um bloco AGU conta uma vez (a fusão de questões + duração já evita o dobro).
 */

import { parseDurationMinutes, formatStudyDuration } from './activityDuration.js';
import { addDaysToDateStr, getSaoPauloDateStr } from './timeUtils.js';
import { sessionDateStr } from './homeostasis.js';
import { collectStudyBlocks } from './aguStudyEngine.js';
import { subjectIdForMindMap } from './aguHomeostasis.js';

export const PHONE_TIME_MAX_MINUTES = 24 * 60;
export const PHONE_TIME_CHART_DAYS = 30;
export const PHONE_TIME_NOTE_MAX = 280;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value) {
  return DATE_RE.test(String(value || ''));
}

export function yesterdayDateStr(todayStr = getSaoPauloDateStr()) {
  return addDaysToDateStr(todayStr, -1);
}

/** "2h 15", "1:30", "90" ou "90min" → minutos. Vazio ou inválido → null. */
export function parsePhoneTimeMinutes(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }
  const raw = String(value).trim().toLowerCase().replace(',', '.');
  if (!raw) return null;

  const clock = raw.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
  if (clock) {
    const hours = Number(clock[1]);
    const mins = Number(clock[2]);
    if (mins > 59) return null;
    return hours * 60 + mins;
  }

  const hoursMinutes = raw.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ora|oras|r)?)?(?:\s*(\d+)\s*(?:m|min|mins|minuto|minutos)?)?$/);
  if (hoursMinutes && (hoursMinutes[1] || hoursMinutes[2]) && (raw.includes('h') || raw.includes('m'))) {
    const hours = hoursMinutes[1] ? Number(hoursMinutes[1]) : 0;
    const mins = hoursMinutes[2] ? Number(hoursMinutes[2]) : 0;
    if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
    return Math.round(hours * 60 + mins);
  }

  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw));
  return null;
}

export function sanitizePhoneTimeLogs(list = []) {
  const byDate = new Map();
  (Array.isArray(list) ? list : []).forEach((entry) => {
    if (!entry || !isDateKey(entry.date)) return;
    const minutes = parsePhoneTimeMinutes(entry.minutes);
    if (minutes == null || minutes < 0 || minutes > PHONE_TIME_MAX_MINUTES) return;
    const note = String(entry.note || '').trim().slice(0, PHONE_TIME_NOTE_MAX);
    byDate.set(entry.date, {
      id: entry.id || `phone-${entry.date}`,
      date: entry.date,
      minutes,
      note,
      createdAt: entry.createdAt || null,
      updatedAt: entry.updatedAt || entry.createdAt || null
    });
  });
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function phoneTimeForDate(logs = [], dateStr) {
  if (!isDateKey(dateStr)) return null;
  return sanitizePhoneTimeLogs(logs).find((entry) => entry.date === dateStr) || null;
}

export function needsYesterdayPhonePrompt(logs = [], todayStr = getSaoPauloDateStr()) {
  return !phoneTimeForDate(logs, yesterdayDateStr(todayStr));
}

function questDateStr(quest) {
  if (!quest?.completed) return '';
  return getSaoPauloDateStr(quest.completedAt || quest.updatedAt || quest.createdAt);
}

function countBucket(map, dateStr) {
  if (!isDateKey(dateStr)) return;
  if (!map[dateStr]) map[dateStr] = { count: 0, minutes: 0 };
  map[dateStr].count += 1;
}

function addMinutes(map, dateStr, minutes) {
  if (!isDateKey(dateStr)) return;
  if (!map[dateStr]) map[dateStr] = { count: 0, minutes: 0 };
  map[dateStr].minutes += parseDurationMinutes(minutes);
}

/**
 * Quantidade e tempo produtivo por dia.
 * Conta: missão concluída, ritual marcado, sessão de leitura, sessão de
 * Escritura, bloco AGU realizado e sessão de mapa fora do AGU.
 */
export function buildProductivityByDate(db = {}) {
  const byDate = {};

  (db.quests || []).forEach((quest) => {
    const dateStr = questDateStr(quest);
    if (!dateStr) return;
    countBucket(byDate, dateStr);
    addMinutes(byDate, dateStr, quest.durationMinutes);
  });

  (db.habits || []).forEach((habit) => {
    const history = Array.isArray(habit?.history) ? habit.history : [];
    history.forEach((dateStr) => {
      countBucket(byDate, dateStr);
      addMinutes(byDate, dateStr, habit?.durationsByDate?.[dateStr]);
    });
  });

  (db.readingSessions || []).forEach((session) => {
    const dateStr = sessionDateStr(session);
    countBucket(byDate, dateStr);
    addMinutes(byDate, dateStr, session?.durationMinutes);
  });

  (db.scriptureSessions || []).forEach((session) => {
    const dateStr = sessionDateStr(session);
    countBucket(byDate, dateStr);
    addMinutes(byDate, dateStr, session?.durationMinutes);
  });

  const aguBlocks = collectStudyBlocks(db.aguPlan, db.examQuestions || []);
  const aguExamIds = new Set();
  aguBlocks.forEach((block) => {
    (block.examIds || []).forEach((id) => {
      if (id) aguExamIds.add(id);
    });
    if (!block?.done || !isDateKey(block.dateStr)) return;
    countBucket(byDate, block.dateStr);
    addMinutes(byDate, block.dateStr, block.durationMinutes);
  });

  // Questões avulsas (sem bloco AGU) também são trabalho realizado.
  (db.examQuestions || []).forEach((entry) => {
    if (entry?.id && aguExamIds.has(entry.id)) return;
    if (entry?.blockKey) return;
    const dateStr = sessionDateStr(entry);
    countBucket(byDate, dateStr);
    addMinutes(byDate, dateStr, entry?.durationMinutes);
  });

  const mapById = {};
  (db.mindMaps || []).forEach((map) => {
    if (map?.id) mapById[map.id] = map;
  });
  (db.mindMapSessions || []).forEach((session) => {
    const map = mapById[session.mapId] || session.map || session;
    // Mapa de matéria AGU já entra no tempo de estudo da campanha; não dobrar.
    if (subjectIdForMindMap(map)) return;
    const dateStr = sessionDateStr(session);
    countBucket(byDate, dateStr);
    addMinutes(byDate, dateStr, session?.durationMinutes);
  });

  return byDate;
}

function shortDate(dateStr) {
  if (!isDateKey(dateStr)) return '';
  const [, month, day] = dateStr.split('-');
  return `${day}/${month}`;
}

export function buildPhoneTimeSeries(db = {}, todayStr = getSaoPauloDateStr(), days = PHONE_TIME_CHART_DAYS) {
  const windowDays = Math.max(7, Math.min(90, Math.round(Number(days) || PHONE_TIME_CHART_DAYS)));
  const logs = sanitizePhoneTimeLogs(db.phoneTimeLogs);
  const phoneByDate = {};
  logs.forEach((entry) => {
    phoneByDate[entry.date] = entry;
  });
  const productivity = buildProductivityByDate(db);
  const points = [];

  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const dateStr = addDaysToDateStr(todayStr, -offset);
    const phone = phoneByDate[dateStr] || null;
    const work = productivity[dateStr] || { count: 0, minutes: 0 };
    points.push({
      dateStr,
      label: shortDate(dateStr),
      isToday: dateStr === todayStr,
      isYesterday: dateStr === yesterdayDateStr(todayStr),
      phoneMinutes: phone ? phone.minutes : null,
      phoneLogged: Boolean(phone),
      phoneNote: phone?.note || '',
      phoneId: phone?.id || null,
      activityCount: work.count,
      productiveMinutes: work.minutes
    });
  }

  const logged = points.filter((point) => point.phoneLogged);
  const phoneTotal = logged.reduce((acc, point) => acc + point.phoneMinutes, 0);
  const productiveOnLogged = logged.reduce((acc, point) => acc + point.productiveMinutes, 0);

  return {
    days: windowDays,
    todayStr,
    yesterdayStr: yesterdayDateStr(todayStr),
    points,
    loggedDays: logged.length,
    missingDays: points.filter((point) => !point.phoneLogged && !point.isToday).length,
    avgPhoneMinutes: logged.length ? Math.round(phoneTotal / logged.length) : 0,
    avgProductiveMinutes: logged.length ? Math.round(productiveOnLogged / logged.length) : 0,
    phoneRatio: phoneTotal + productiveOnLogged > 0
      ? Math.round((phoneTotal / (phoneTotal + productiveOnLogged)) * 100)
      : null
  };
}

export function formatPhoneDuration(minutes) {
  return formatStudyDuration(minutes);
}
