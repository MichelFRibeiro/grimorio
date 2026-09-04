/**
 * Duração cronometrada de missões, rituais, questões e leitura.
 * Minutos inteiros; 0 = não cronometrado.
 */

export const LIVE_TIMER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function parseDurationMinutes(value) {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function secondsToDurationMinutes(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s <= 0) return 0;
  return Math.max(1, Math.round(s / 60));
}

export function formatDurationLabel(minutes) {
  const m = parseDurationMinutes(minutes);
  if (m <= 0) return '';
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours}h ${rest} min` : `${hours}h`;
}

export function sumDurationMap(map) {
  if (!map || typeof map !== 'object') return 0;
  return Object.values(map).reduce((acc, value) => acc + parseDurationMinutes(value), 0);
}

export function getHabitDurationForDate(habit, dateStr) {
  if (!habit || !dateStr) return 0;
  return parseDurationMinutes(habit.durationsByDate?.[dateStr]);
}

export function setHabitDurationForDate(habit, dateStr, minutes) {
  if (!habit || !dateStr) return habit;
  const duration = parseDurationMinutes(minutes);
  if (!habit.durationsByDate) habit.durationsByDate = {};
  if (duration > 0) {
    habit.durationsByDate[dateStr] = duration;
  } else {
    delete habit.durationsByDate[dateStr];
  }
  if (Object.keys(habit.durationsByDate).length === 0) {
    delete habit.durationsByDate;
  }
  return habit;
}

export function clearHabitDurationForDate(habit, dateStr) {
  return setHabitDurationForDate(habit, dateStr, 0);
}

export function elapsedMsFrom(accumulatedMs, runStartedAt, now = Date.now()) {
  const extra = runStartedAt != null ? Math.max(0, now - runStartedAt) : 0;
  return Math.max(0, (accumulatedMs || 0) + extra);
}

export function liveTimerKey(kind, id) {
  return `${kind}:${id}`;
}

export function normalizeLiveTimerItem(value, now = Date.now()) {
  if (!value || typeof value !== 'object') return null;
  const updatedAt = Number(value.updatedAt) || 0;
  if (updatedAt && now - updatedAt > LIVE_TIMER_MAX_AGE_MS) return null;

  const accumulatedMs = Math.max(0, Number(value.accumulatedMs) || 0);
  const runStartedAt = typeof value.runStartedAt === 'number' && Number.isFinite(value.runStartedAt)
    ? value.runStartedAt
    : null;
  const cleared = !!value.cleared || (accumulatedMs <= 0 && runStartedAt == null);
  if (cleared) {
    if (!updatedAt) return null;
    return { accumulatedMs: 0, runStartedAt: null, updatedAt, cleared: true };
  }

  return {
    accumulatedMs,
    runStartedAt,
    updatedAt: updatedAt || now
  };
}

export function sanitizeLiveActivityTimers(items, now = Date.now()) {
  const next = {};
  if (!items || typeof items !== 'object' || Array.isArray(items)) return next;
  Object.entries(items).forEach(([key, value]) => {
    if (!key || typeof key !== 'string' || !key.includes(':')) return;
    const item = normalizeLiveTimerItem(value, now);
    if (item) next[key] = item;
  });
  return next;
}

export function mergeLiveActivityTimers(localItems, remoteItems, now = Date.now()) {
  const local = sanitizeLiveActivityTimers(localItems, now);
  const remote = sanitizeLiveActivityTimers(remoteItems, now);
  const merged = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  keys.forEach((key) => {
    const a = local[key];
    const b = remote[key];
    if (!a) {
      merged[key] = b;
      return;
    }
    if (!b) {
      merged[key] = a;
      return;
    }
    merged[key] = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
  });
  return sanitizeLiveActivityTimers(keepSingleRunningTimer(merged, now), now);
}

function keepSingleRunningTimer(items, now = Date.now()) {
  const running = Object.entries(items).filter(([, snap]) => snap && !snap.cleared && snap.runStartedAt != null);
  if (running.length <= 1) return items;
  running.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  const next = { ...items };
  running.slice(1).forEach(([key, snap]) => {
    next[key] = {
      accumulatedMs: elapsedMsFrom(snap.accumulatedMs, snap.runStartedAt, now),
      runStartedAt: null,
      updatedAt: now
    };
  });
  return next;
}

export function tombstoneLiveTimer(kind, id, now = Date.now()) {
  return {
    [liveTimerKey(kind, id)]: {
      accumulatedMs: 0,
      runStartedAt: null,
      updatedAt: now,
      cleared: true
    }
  };
}

export function clearLiveActivityTimer(store, kind, id, now = Date.now()) {
  const target = store && typeof store === 'object' ? store : {};
  Object.assign(target, tombstoneLiveTimer(kind, id, now));
  return target;
}
