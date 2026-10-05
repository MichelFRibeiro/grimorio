export const LIVE_READING_SESSION_KEY = 'grimorio_live_reading_session';
export const LIVE_SCRIPTURE_SESSION_KEY = 'grimorio_live_scripture_session';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readLiveReadingSession(key = LIVE_READING_SESSION_KEY) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.bookId) return null;
    if (parsed.updatedAt && Date.now() - parsed.updatedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLiveReadingSession(payload, key = LIVE_READING_SESSION_KEY) {
  try {
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Quota / modo privado: o cronômetro em memória continua válido nesta aba.
  }
}

export function clearLiveReadingSession(key = LIVE_READING_SESSION_KEY) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function hasLiveReadingSession() {
  return Boolean(readLiveReadingSession()?.bookId);
}

export function readLiveScriptureSession() {
  return readLiveReadingSession(LIVE_SCRIPTURE_SESSION_KEY);
}

export function writeLiveScriptureSession(payload) {
  writeLiveReadingSession(payload, LIVE_SCRIPTURE_SESSION_KEY);
}

export function clearLiveScriptureSession() {
  clearLiveReadingSession(LIVE_SCRIPTURE_SESSION_KEY);
}
