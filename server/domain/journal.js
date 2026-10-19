/**
 * Diário pessoal. Várias páginas por dia. Não concede XP nem dano no chefe.
 * O cronômetro só registra o tempo da página.
 */

import { uid } from '../db.js';
import { getSaoPauloDateStr } from '../timeUtils.js';
import { clearLiveActivityTimer } from '../../src/utils/activityDuration.js';
import {
  JOURNAL_BODY_MAX,
  JOURNAL_DRAFT_TIMER_ID,
  JOURNAL_MAX_ENTRIES,
  JOURNAL_TIMER_KIND,
  JOURNAL_TITLE_MAX,
  cleanJournalText,
  isJournalDate,
  isJournalMood,
  sanitizeJournalEntries
} from '../../src/utils/journal.js';
import { DomainError, durationMinutes } from './validate.js';

function fail(error, status = 400) {
  return { error, status };
}

function asError(err) {
  if (err instanceof DomainError) return fail(err.message, err.status || 400);
  throw err;
}

function clearJournalTimer(db, id) {
  if (!db || !id) return;
  db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, JOURNAL_TIMER_KIND, id);
}

export function ensureJournal(db) {
  if (!db) return [];
  db.journalEntries = sanitizeJournalEntries(db.journalEntries);
  return db.journalEntries;
}

function readJournalInput(body = {}, { todayStr, partial = false } = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const value = {};

  if (!partial || has('date')) {
    const date = String(body.date || '').trim() || (partial ? '' : todayStr);
    if (!date) return fail('Informe a data da página.');
    if (!isJournalDate(date)) return fail('Data inválida. Use YYYY-MM-DD.');
    value.date = date;
  }

  if (!partial || has('title')) {
    const title = cleanJournalText(body.title);
    if (title.length > JOURNAL_TITLE_MAX) {
      return fail(`O título pode ter no máximo ${JOURNAL_TITLE_MAX} caracteres.`);
    }
    value.title = title;
  }

  if (!partial || has('body')) {
    const text = cleanJournalText(body.body);
    if (!text) return fail('Escreva alguma coisa antes de guardar a página.');
    if (text.length > JOURNAL_BODY_MAX) {
      return fail(`A página pode ter no máximo ${JOURNAL_BODY_MAX} caracteres.`);
    }
    value.body = text;
  }

  if (!partial || has('mood')) {
    const mood = String(body.mood || '').trim();
    if (!isJournalMood(mood)) return fail('Humor inválido.');
    value.mood = mood;
  }

  if (has('durationMinutes')) {
    try {
      value.durationMinutes = durationMinutes(body.durationMinutes, { fallback: 0, label: 'Duração' });
    } catch (err) {
      return asError(err);
    }
  }

  return { value };
}

export function listJournalEntries(db, filters = {}) {
  let entries = [...ensureJournal(db)];
  const date = String(filters.date || '').trim();
  const from = String(filters.from || '').trim();
  const to = String(filters.to || '').trim();
  const mood = String(filters.mood || '').trim();
  const search = String(filters.search || '').trim().toLowerCase();

  if (date) {
    if (!isJournalDate(date)) return fail('Data inválida. Use YYYY-MM-DD.');
    entries = entries.filter((entry) => entry.date === date);
  }
  if (from) {
    if (!isJournalDate(from)) return fail('Data inicial inválida. Use YYYY-MM-DD.');
    entries = entries.filter((entry) => entry.date >= from);
  }
  if (to) {
    if (!isJournalDate(to)) return fail('Data final inválida. Use YYYY-MM-DD.');
    entries = entries.filter((entry) => entry.date <= to);
  }
  if (mood) {
    if (!isJournalMood(mood)) return fail('Humor inválido.');
    entries = entries.filter((entry) => entry.mood === mood);
  }
  if (search) {
    entries = entries.filter((entry) => `${entry.title}\n${entry.body}`.toLowerCase().includes(search));
  }

  const limit = Number(filters.limit);
  if (Number.isFinite(limit) && limit > 0) entries = entries.slice(0, limit);
  return { entries };
}

export function getJournalEntry(db, id) {
  const entry = ensureJournal(db).find((item) => item.id === id);
  if (!entry) return fail('Página do diário não encontrada.', 404);
  return { entry };
}

export function createJournalEntry(db, body = {}, { now = new Date(), todayStr = getSaoPauloDateStr(now) } = {}) {
  const entries = ensureJournal(db);
  if (entries.length >= JOURNAL_MAX_ENTRIES) {
    return fail(`O diário chegou ao limite de ${JOURNAL_MAX_ENTRIES} páginas.`);
  }
  const parsed = readJournalInput(body, { todayStr });
  if (parsed.error) return parsed;

  const stamp = now.toISOString();
  const entry = {
    id: uid('journal'),
    date: parsed.value.date,
    title: parsed.value.title,
    body: parsed.value.body,
    mood: parsed.value.mood,
    createdAt: stamp,
    updatedAt: stamp
  };
  if (parsed.value.durationMinutes > 0) entry.durationMinutes = parsed.value.durationMinutes;
  clearJournalTimer(db, JOURNAL_DRAFT_TIMER_ID);
  db.journalEntries.unshift(entry);
  db.journalEntries = sanitizeJournalEntries(db.journalEntries);
  return {
    entry: db.journalEntries.find((item) => item.id === entry.id) || entry,
    entries: db.journalEntries,
    created: true
  };
}

export function updateJournalEntry(db, id, body = {}, { now = new Date() } = {}) {
  ensureJournal(db);
  const index = db.journalEntries.findIndex((item) => item.id === id);
  if (index === -1) return fail('Página do diário não encontrada.', 404);

  const parsed = readJournalInput(body, { partial: true });
  if (parsed.error) return parsed;

  const current = db.journalEntries[index];
  const next = {
    ...current,
    ...parsed.value,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: now.toISOString()
  };
  db.journalEntries[index] = next;
  db.journalEntries = sanitizeJournalEntries(db.journalEntries);
  clearJournalTimer(db, current.id);
  return {
    entry: db.journalEntries.find((item) => item.id === id) || next,
    entries: db.journalEntries
  };
}

export function deleteJournalEntry(db, id) {
  ensureJournal(db);
  const index = db.journalEntries.findIndex((item) => item.id === id);
  if (index === -1) return fail('Página do diário não encontrada.', 404);
  const [removed] = db.journalEntries.splice(index, 1);
  clearJournalTimer(db, removed.id);
  return { removed, entries: db.journalEntries };
}
