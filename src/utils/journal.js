/**
 * Diário pessoal.
 *
 * Várias páginas no mesmo dia. Não concede XP, não fere o chefe e não entra
 * nas correlações: é registro, não ritual. Bancos antigos simplesmente não
 * têm a lista — a ausência vira [].
 */

import { addDaysToDateStr, getSaoPauloDateStr } from './timeUtils.js';

export const JOURNAL_TITLE_MAX = 140;
export const JOURNAL_BODY_MAX = 20000;
export const JOURNAL_MAX_ENTRIES = 5000;
export const JOURNAL_ID_MAX = 80;

export const JOURNAL_MOODS = [
  { id: 'sereno', label: 'Sereno', emoji: '🌿' },
  { id: 'grato', label: 'Grato', emoji: '✨' },
  { id: 'focado', label: 'Focado', emoji: '🎯' },
  { id: 'alegre', label: 'Alegre', emoji: '☀️' },
  { id: 'cansado', label: 'Cansado', emoji: '🌙' },
  { id: 'inquieto', label: 'Inquieto', emoji: '🌊' },
  { id: 'pesado', label: 'Pesado', emoji: '🪨' }
];

const MOOD_IDS = new Set(JOURNAL_MOODS.map((mood) => mood.id));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

export function isJournalDate(value) {
  const text = String(value || '');
  if (!DATE_RE.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isJournalMood(value) {
  return value === '' || MOOD_IDS.has(value);
}

export function journalMood(id) {
  return JOURNAL_MOODS.find((mood) => mood.id === id) || null;
}

export function cleanJournalText(value) {
  return String(value ?? '').replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
}

export function countWords(value) {
  const text = cleanJournalText(value);
  if (!text) return 0;
  return text.split(/\s+/).length;
}

export function journalExcerpt(value, max = 180) {
  const flat = cleanJournalText(value).replace(/\s+/g, ' ');
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function formatJournalDate(dateStr) {
  if (!isJournalDate(dateStr)) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

export function formatJournalMonth(dateStr) {
  if (!isJournalDate(dateStr)) return '';
  const [year, month] = dateStr.split('-').map(Number);
  return `${MONTHS[month - 1]} de ${year}`;
}

function cleanId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > JOURNAL_ID_MAX) return '';
  return id;
}

function normalizeStoredEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = cleanId(raw.id);
  const date = String(raw.date || '');
  const body = cleanJournalText(raw.body).slice(0, JOURNAL_BODY_MAX);
  if (!id || !isJournalDate(date) || !body) return null;
  const mood = MOOD_IDS.has(raw.mood) ? raw.mood : '';
  return {
    id,
    date,
    title: cleanJournalText(raw.title).slice(0, JOURNAL_TITLE_MAX),
    body,
    mood,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || raw.createdAt || null
  };
}

function compareEntries(a, b) {
  const byDate = b.date.localeCompare(a.date);
  if (byDate) return byDate;
  const byCreated = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  if (byCreated) return byCreated;
  return b.id.localeCompare(a.id);
}

export function sanitizeJournalEntries(list = []) {
  const byId = new Map();
  (Array.isArray(list) ? list : []).forEach((raw) => {
    const entry = normalizeStoredEntry(raw);
    if (!entry) return;
    const previous = byId.get(entry.id);
    if (!previous || String(entry.updatedAt || '') >= String(previous.updatedAt || '')) {
      byId.set(entry.id, entry);
    }
  });
  return [...byId.values()].sort(compareEntries);
}

/**
 * Dias seguidos com pelo menos uma página. Se hoje ainda está em branco,
 * a sequência vale até ontem — escrever no fim do dia não zera o contador.
 */
export function journalWritingStreak(entries, todayStr = getSaoPauloDateStr()) {
  if (!isJournalDate(todayStr)) return 0;
  const days = new Set(
    sanitizeJournalEntries(entries)
      .map((entry) => entry.date)
      .filter((date) => date <= todayStr)
  );
  let cursor = days.has(todayStr) ? todayStr : addDaysToDateStr(todayStr, -1);
  if (!days.has(cursor)) return 0;
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = addDaysToDateStr(cursor, -1);
  }
  return count;
}

export function journalStats(entries, todayStr = getSaoPauloDateStr()) {
  const list = sanitizeJournalEntries(entries);
  const days = new Set(list.map((entry) => entry.date));
  return {
    pages: list.length,
    days: days.size,
    words: list.reduce((sum, entry) => sum + countWords(entry.body) + countWords(entry.title), 0),
    streak: journalWritingStreak(list, todayStr),
    today: list.filter((entry) => entry.date === todayStr).length
  };
}
