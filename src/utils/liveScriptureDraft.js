import { getBibleBook, verseCount } from '../data/bibleCanon.js';
import { LIVE_SCRIPTURE_SESSION_KEY, readLiveScriptureSession } from './liveReadingSession.js';

export const LIVE_SCRIPTURE_DRAFT_KEY = 'grimorio_live_scripture_draft';
export const SCRIPTURE_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TEXT = 20000;
const MAX_QUOTES = 80;

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clipText(value, max = MAX_TEXT) {
  return String(value || '').slice(0, max);
}

export function sanitizePassage(value, fallback = { bookId: 'gn', chapter: 1, verse: 1 }) {
  const book = getBibleBook(value?.bookId) || getBibleBook(fallback.bookId) || getBibleBook('gn');
  const chapter = clampInt(value?.chapter, 1, book.chapters.length, 1);
  const verse = clampInt(value?.verse, 1, verseCount(book, chapter), 1);
  return { bookId: book.id, chapter, verse };
}

function sanitizeQuote(item) {
  if (!item || typeof item !== 'object') return null;
  const quote = clipText(item.quote).trim();
  const note = clipText(item.note).trim();
  if (!quote && !note) return null;
  return {
    id: clipText(item.id, 80) || `sqd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...sanitizePassage(item),
    endVerse: clampInt(item.endVerse, 1, verseCount(getBibleBook(item.bookId) || getBibleBook('gn'), clampInt(item.chapter, 1, 150, 1)), Number(item.verse) || 1),
    quote,
    note
  };
}

export function emptyScriptureDraft() {
  return {
    active: false,
    start: { bookId: 'gn', chapter: 1, verse: 1 },
    end: { bookId: 'gn', chapter: 1, verse: 1 },
    notes: '',
    reflection: '',
    quotes: [],
    quoteText: '',
    quoteNote: '',
    quotePassage: { bookId: 'gn', chapter: 1, verse: 1 },
    quoteEndVerse: 1,
    timer: { accumulatedMs: 0, runStartedAt: null },
    updatedAt: 0
  };
}

export function sanitizeScriptureDraft(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const updatedAt = Number(value.updatedAt) || 0;
  if (now !== Infinity && updatedAt && now - updatedAt > SCRIPTURE_DRAFT_MAX_AGE_MS) return null;
  const timer = value.timer && typeof value.timer === 'object' ? value.timer : {};
  const accumulatedMs = Math.max(0, Math.min(48 * 60 * 60 * 1000, Number(timer.accumulatedMs) || 0));
  const runStartedAt = typeof timer.runStartedAt === 'number' && Number.isFinite(timer.runStartedAt)
    ? timer.runStartedAt
    : null;
  const quotes = (Array.isArray(value.quotes) ? value.quotes : [])
    .slice(0, MAX_QUOTES)
    .map(sanitizeQuote)
    .filter(Boolean);
  return {
    active: value.active !== false,
    start: sanitizePassage(value.start),
    end: sanitizePassage(value.end),
    notes: clipText(value.notes),
    reflection: clipText(value.reflection),
    quotes,
    quoteText: clipText(value.quoteText),
    quoteNote: clipText(value.quoteNote),
    quotePassage: sanitizePassage(value.quotePassage || value.end),
    quoteEndVerse: clampInt(
      value.quoteEndVerse,
      1,
      verseCount(getBibleBook(value.quotePassage?.bookId || value.end?.bookId) || getBibleBook('gn'), clampInt(value.quotePassage?.chapter || value.end?.chapter, 1, 150, 1)),
      Number(value.quotePassage?.verse || value.end?.verse) || 1
    ),
    timer: { accumulatedMs, runStartedAt },
    updatedAt: updatedAt || now
  };
}

export function scriptureDraftsEqual(a, b) {
  const left = sanitizeScriptureDraft(a, Infinity);
  const right = sanitizeScriptureDraft(b, Infinity);
  if (!left || !right) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeScriptureDrafts(local, remote, now = Date.now()) {
  const a = sanitizeScriptureDraft(local, now);
  const b = sanitizeScriptureDraft(remote, now);
  if (!a) return b;
  if (!b) return a;
  if ((a.updatedAt || 0) !== (b.updatedAt || 0)) {
    return (a.updatedAt || 0) > (b.updatedAt || 0) ? a : b;
  }
  const score = (draft) => (
    (draft.timer?.accumulatedMs || 0)
    + (draft.timer?.runStartedAt ? 1 : 0)
    + draft.notes.length
    + draft.reflection.length
    + draft.quoteText.length
    + draft.quoteNote.length
    + draft.quotes.length
  );
  return score(a) >= score(b) ? a : b;
}

function fromLegacySession(session) {
  if (!session) return null;
  const end = session.end || (session.bookId
    ? { bookId: session.bookId, chapter: 1, verse: 1 }
    : null);
  return sanitizeScriptureDraft({
    active: true,
    start: session.start || end,
    end,
    notes: session.notes,
    reflection: session.reflection,
    quotes: session.quotes,
    quoteText: session.quoteText,
    quoteNote: session.quoteNote,
    timer: session.timer,
    updatedAt: session.updatedAt || Date.now()
  });
}

export function readLocalScriptureDraft() {
  try {
    const raw = localStorage.getItem(LIVE_SCRIPTURE_DRAFT_KEY);
    const current = raw ? sanitizeScriptureDraft(JSON.parse(raw)) : null;
    const legacy = fromLegacySession(readLiveScriptureSession());
    const winner = mergeScriptureDrafts(current, legacy);
    if (winner && legacy) {
      try {
        sessionStorage.removeItem(LIVE_SCRIPTURE_SESSION_KEY);
        localStorage.removeItem(LIVE_SCRIPTURE_SESSION_KEY);
      } catch {
        // ignore
      }
    }
    return winner;
  } catch {
    return null;
  }
}

export function writeLocalScriptureDraft(draft) {
  try {
    const clean = sanitizeScriptureDraft(draft);
    if (!clean) {
      localStorage.removeItem(LIVE_SCRIPTURE_DRAFT_KEY);
      return;
    }
    localStorage.setItem(LIVE_SCRIPTURE_DRAFT_KEY, JSON.stringify(clean));
  } catch {
    // Quota / modo privado: o rascunho em memória continua válido nesta aba.
  }
}

export function clearLocalScriptureDraft() {
  try {
    localStorage.removeItem(LIVE_SCRIPTURE_DRAFT_KEY);
  } catch {
    // ignore
  }
}
