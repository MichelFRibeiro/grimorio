export const LIVE_READING_SESSION_KEY = 'grimorio_live_reading_session';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readLiveReadingSession() {
  try {
    const raw = sessionStorage.getItem(LIVE_READING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.bookId) return null;
    if (parsed.updatedAt && Date.now() - parsed.updatedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLiveReadingSession(payload) {
  try {
    sessionStorage.setItem(LIVE_READING_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // Quota / modo privado: o cronômetro em memória continua válido nesta aba.
  }
}

export function clearLiveReadingSession() {
  try {
    sessionStorage.removeItem(LIVE_READING_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function hasLiveReadingSession() {
  return Boolean(readLiveReadingSession()?.bookId);
}
