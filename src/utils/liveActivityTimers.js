import {
  elapsedMsFrom,
  liveTimerKey,
  mergeLiveActivityTimers,
  sanitizeLiveActivityTimers,
  secondsToDurationMinutes,
  tombstoneLiveTimer
} from './activityDuration.js';

export const LIVE_ACTIVITY_TIMERS_KEY = 'grimorio_live_activity_timers';
const SYNC_DEBOUNCE_MS = 400;

function canUseStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readPersisted() {
  if (!canUseStorage()) return {};
  try {
    const raw = localStorage.getItem(LIVE_ACTIVITY_TIMERS_KEY)
      || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(LIVE_ACTIVITY_TIMERS_KEY) : null);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const items = parsed?.items && typeof parsed.items === 'object' ? parsed.items : parsed;
    return sanitizeLiveActivityTimers(items);
  } catch {
    return {};
  }
}

function persist(items) {
  if (!canUseStorage()) return;
  try {
    const payload = JSON.stringify({
      items,
      updatedAt: Date.now()
    });
    localStorage.setItem(LIVE_ACTIVITY_TIMERS_KEY, payload);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(LIVE_ACTIVITY_TIMERS_KEY);
    }
  } catch {
    // Quota / modo privado: o cronômetro em memória continua válido nesta aba.
  }
}

let timers = readPersisted();
const listeners = new Set();
const keyedListeners = new Map();
let tickInterval = null;
let remoteSyncFn = null;
let syncTimer = null;

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

function scheduleRemoteSync() {
  if (!remoteSyncFn) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    const payload = { ...timers };
    Promise.resolve(remoteSyncFn(payload)).catch(() => {});
  }, SYNC_DEBOUNCE_MS);
}

function commit(key, { sync = true } = {}) {
  persist(timers);
  ensureTick();
  notify(key);
  if (sync) scheduleRemoteSync();
}

function emptySnap() {
  return { accumulatedMs: 0, runStartedAt: null, isRunning: false, seconds: 0 };
}

export function subscribeActivityTimers(fn, kind, id) {
  if (kind && id) {
    const key = liveTimerKey(kind, id);
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
  const snap = timers[liveTimerKey(kind, id)];
  if (!snap || snap.cleared) return emptySnap();
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

export function getLiveActivityTimers() {
  return { ...timers };
}

export function pauseActivityTimer(kind, id) {
  const key = liveTimerKey(kind, id);
  const snap = timers[key];
  if (!snap || snap.cleared || snap.runStartedAt == null) return getActivityTimerSnapshot(kind, id);
  timers[key] = {
    accumulatedMs: elapsedMsFrom(snap.accumulatedMs, snap.runStartedAt),
    runStartedAt: null,
    updatedAt: Date.now()
  };
  commit(key);
  return getActivityTimerSnapshot(kind, id);
}

function pauseAllRunningExcept(kind, id) {
  const keep = liveTimerKey(kind, id);
  const pausedKeys = [];
  Object.entries(timers).forEach(([key, snap]) => {
    if (key === keep || !snap || snap.cleared || snap.runStartedAt == null) return;
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
  const key = liveTimerKey(kind, id);
  const snap = timers[key] && !timers[key].cleared ? timers[key] : { accumulatedMs: 0, runStartedAt: null };
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
  scheduleRemoteSync();
  return getActivityTimerSnapshot(kind, id);
}

export function toggleActivityTimer(kind, id) {
  const snap = getActivityTimerSnapshot(kind, id);
  if (snap.isRunning) return pauseActivityTimer(kind, id);
  return startActivityTimer(kind, id);
}

export function resetActivityTimer(kind, id) {
  const key = liveTimerKey(kind, id);
  Object.assign(timers, tombstoneLiveTimer(kind, id));
  commit(key);
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
  scheduleRemoteSync();
}

export function hydrateLiveActivityTimers(remoteItems, { sync = false, persistLocal = true } = {}) {
  const merged = mergeLiveActivityTimers(timers, remoteItems);
  const prevKeys = new Set(Object.keys(timers));
  const nextKeys = new Set(Object.keys(merged));
  const changed = [...prevKeys, ...nextKeys].some((key) => {
    const a = timers[key];
    const b = merged[key];
    if (!a && !b) return false;
    if (!a || !b) return true;
    return a.accumulatedMs !== b.accumulatedMs
      || a.runStartedAt !== b.runStartedAt
      || !!a.cleared !== !!b.cleared
      || a.updatedAt !== b.updatedAt;
  });
  timers = merged;
  if (persistLocal && changed) persist(timers);
  ensureTick();
  if (changed) notify();
  if (sync) scheduleRemoteSync();
  return timers;
}

export function setLiveActivityTimerSync(fn) {
  remoteSyncFn = typeof fn === 'function' ? fn : null;
}

export function flushLiveActivityTimers() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  persist(timers);
  if (remoteSyncFn) {
    Promise.resolve(remoteSyncFn({ ...timers })).catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== LIVE_ACTIVITY_TIMERS_KEY) return;
    try {
      const parsed = event.newValue ? JSON.parse(event.newValue) : { items: {} };
      const items = parsed?.items && typeof parsed.items === 'object' ? parsed.items : {};
      hydrateLiveActivityTimers(items, { persistLocal: false });
    } catch {
      // ignore
    }
  });
}

if (typeof document !== 'undefined') {
  const persistIfHidden = () => {
    if (document.visibilityState === 'hidden') flushLiveActivityTimers();
  };
  const catchUp = () => notify();
  document.addEventListener('visibilitychange', () => {
    persistIfHidden();
    if (document.visibilityState === 'visible') catchUp();
  });
  window.addEventListener('pagehide', () => flushLiveActivityTimers());
  document.addEventListener('freeze', () => flushLiveActivityTimers());
  window.addEventListener('focus', catchUp);
  window.addEventListener('pageshow', catchUp);
}

ensureTick();
