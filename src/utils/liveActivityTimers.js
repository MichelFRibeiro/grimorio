import { secondsToDurationMinutes } from './activityDuration.js';

export const LIVE_ACTIVITY_TIMERS_KEY = 'grimorio_live_activity_timers';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function elapsedMsFrom(accumulatedMs, runStartedAt, now = Date.now()) {
  const extra = runStartedAt != null ? Math.max(0, now - runStartedAt) : 0;
  return Math.max(0, (accumulatedMs || 0) + extra);
}

function canUseSessionStorage() {
  try {
    return typeof sessionStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readPersisted() {
  if (!canUseSessionStorage()) return {};
  try {
    const raw = sessionStorage.getItem(LIVE_ACTIVITY_TIMERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const items = parsed?.items && typeof parsed.items === 'object' ? parsed.items : parsed;
    if (!items || typeof items !== 'object') return {};
    const now = Date.now();
    const next = {};
    Object.entries(items).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      const updatedAt = Number(value.updatedAt) || 0;
      if (updatedAt && now - updatedAt > MAX_AGE_MS) return;
      next[key] = {
        accumulatedMs: Math.max(0, Number(value.accumulatedMs) || 0),
        runStartedAt: typeof value.runStartedAt === 'number' && Number.isFinite(value.runStartedAt)
          ? value.runStartedAt
          : null,
        updatedAt: updatedAt || now
      };
    });
    return next;
  } catch {
    return {};
  }
}

function persist(items) {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.setItem(LIVE_ACTIVITY_TIMERS_KEY, JSON.stringify({
      items,
      updatedAt: Date.now()
    }));
  } catch {
    // Quota / modo privado: o cronômetro em memória continua válido nesta aba.
  }
}

function timerKey(kind, id) {
  return `${kind}:${id}`;
}

let timers = readPersisted();
const listeners = new Set();
const keyedListeners = new Map();
let tickInterval = null;

function notify(key) {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
  if (key) {
    const set = keyedListeners.get(key);
    if (set) {
      set.forEach((fn) => {
        try { fn(); } catch { /* ignore */ }
      });
    }
  } else {
    keyedListeners.forEach((set) => {
      set.forEach((fn) => {
        try { fn(); } catch { /* ignore */ }
      });
    });
  }
}

function tickRunning() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
  Object.entries(timers).forEach(([key, snap]) => {
    if (!snap || snap.runStartedAt == null) return;
    const set = keyedListeners.get(key);
    if (!set) return;
    set.forEach((fn) => {
      try { fn(); } catch { /* ignore */ }
    });
  });
}

function ensureTick() {
  const anyRunning = Object.values(timers).some((t) => t && t.runStartedAt != null);
  if (anyRunning && tickInterval == null) {
    tickInterval = setInterval(tickRunning, 250);
  } else if (!anyRunning && tickInterval != null) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function commit(key) {
  persist(timers);
  ensureTick();
  notify(key);
}

function emptySnap() {
  return { accumulatedMs: 0, runStartedAt: null, isRunning: false, seconds: 0 };
}

export function subscribeActivityTimers(fn, kind, id) {
  if (kind && id) {
    const key = timerKey(kind, id);
    if (!keyedListeners.has(key)) keyedListeners.set(key, new Set());
    keyedListeners.get(key).add(fn);
    return () => {
      const set = keyedListeners.get(key);
      if (!set) return;
      set.delete(fn);
      if (set.size === 0) keyedListeners.delete(key);
    };
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActivityTimerSnapshot(kind, id) {
  const snap = timers[timerKey(kind, id)];
  if (!snap) return emptySnap();
  const accumulatedMs = snap.accumulatedMs || 0;
  const runStartedAt = snap.runStartedAt ?? null;
  return {
    accumulatedMs,
    runStartedAt,
    isRunning: runStartedAt != null,
    seconds: Math.floor(elapsedMsFrom(accumulatedMs, runStartedAt) / 1000)
  };
}

export function hasLiveActivityTimer(kind, id) {
  const snap = getActivityTimerSnapshot(kind, id);
  return snap.isRunning || snap.accumulatedMs > 0;
}

export function pauseActivityTimer(kind, id) {
  const key = timerKey(kind, id);
  const snap = timers[key];
  if (!snap || snap.runStartedAt == null) return getActivityTimerSnapshot(kind, id);
  timers[key] = {
    accumulatedMs: elapsedMsFrom(snap.accumulatedMs, snap.runStartedAt),
    runStartedAt: null,
    updatedAt: Date.now()
  };
  commit(key);
  return getActivityTimerSnapshot(kind, id);
}

function pauseAllRunningExcept(kind, id) {
  const keep = timerKey(kind, id);
  const pausedKeys = [];
  Object.entries(timers).forEach(([key, snap]) => {
    if (key === keep || !snap || snap.runStartedAt == null) return;
    timers[key] = {
      accumulatedMs: elapsedMsFrom(snap.accumulatedMs, snap.runStartedAt),
      runStartedAt: null,
      updatedAt: Date.now()
    };
    pausedKeys.push(key);
  });
  return pausedKeys;
}

export function startActivityTimer(kind, id) {
  const pausedKeys = pauseAllRunningExcept(kind, id);
  const key = timerKey(kind, id);
  const snap = timers[key] || { accumulatedMs: 0, runStartedAt: null };
  if (snap.runStartedAt == null) {
    timers[key] = {
      accumulatedMs: Math.max(0, snap.accumulatedMs || 0),
      runStartedAt: Date.now(),
      updatedAt: Date.now()
    };
  }
  persist(timers);
  ensureTick();
  pausedKeys.forEach((pausedKey) => notify(pausedKey));
  notify(key);
  return getActivityTimerSnapshot(kind, id);
}

export function toggleActivityTimer(kind, id) {
  const snap = getActivityTimerSnapshot(kind, id);
  if (snap.isRunning) return pauseActivityTimer(kind, id);
  return startActivityTimer(kind, id);
}

export function resetActivityTimer(kind, id) {
  const key = timerKey(kind, id);
  if (timers[key]) {
    delete timers[key];
    commit(key);
  }
  return emptySnap();
}

export function consumeActivityTimerMinutes(kind, id) {
  const snap = getActivityTimerSnapshot(kind, id);
  resetActivityTimer(kind, id);
  return secondsToDurationMinutes(snap.seconds);
}

export function resetAllActivityTimers() {
  timers = {};
  persist(timers);
  ensureTick();
  notify();
}

if (typeof document !== 'undefined') {
  const persistIfHidden = () => {
    if (document.visibilityState === 'hidden') persist(timers);
  };
  const catchUp = () => notify();
  document.addEventListener('visibilitychange', () => {
    persistIfHidden();
    if (document.visibilityState === 'visible') catchUp();
  });
  window.addEventListener('pagehide', () => persist(timers));
  document.addEventListener('freeze', () => persist(timers));
  window.addEventListener('focus', catchUp);
  window.addEventListener('pageshow', catchUp);
}

ensureTick();
