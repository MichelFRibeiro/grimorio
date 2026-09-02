import { useCallback, useEffect, useRef, useState } from 'react';

function elapsedMsFrom(accumulatedMs, runStartedAt, now = Date.now()) {
  const extra = runStartedAt != null ? Math.max(0, now - runStartedAt) : 0;
  return Math.max(0, (accumulatedMs || 0) + extra);
}

export function formatTimer(secs) {
  const total = Math.max(0, Math.floor(secs || 0));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const remainingSecs = total % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
}

/**
 * Cronômetro à prova de hibernação: mede pelo relógio de parede em vez de
 * contar ticks de setInterval (que o navegador congela em abas em segundo plano).
 */
export function useStopwatch({
  initialAccumulatedMs = 0,
  initialRunStartedAt = null
} = {}) {
  const accumulatedMsRef = useRef(Math.max(0, Number(initialAccumulatedMs) || 0));
  const runStartedAtRef = useRef(
    typeof initialRunStartedAt === 'number' && Number.isFinite(initialRunStartedAt)
      ? initialRunStartedAt
      : null
  );

  const [isRunning, setIsRunning] = useState(() => runStartedAtRef.current != null);
  const [, setTick] = useState(0);

  const bump = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  const getSnapshot = useCallback(() => ({
    accumulatedMs: accumulatedMsRef.current,
    runStartedAt: runStartedAtRef.current,
    isRunning: runStartedAtRef.current != null
  }), []);

  const getElapsedSeconds = useCallback(() => (
    Math.floor(elapsedMsFrom(accumulatedMsRef.current, runStartedAtRef.current) / 1000)
  ), []);

  const start = useCallback(() => {
    if (runStartedAtRef.current == null) {
      runStartedAtRef.current = Date.now();
    }
    setIsRunning(true);
    bump();
  }, [bump]);

  const pause = useCallback(() => {
    if (runStartedAtRef.current != null) {
      accumulatedMsRef.current = elapsedMsFrom(accumulatedMsRef.current, runStartedAtRef.current);
      runStartedAtRef.current = null;
    }
    setIsRunning(false);
    bump();
  }, [bump]);

  const toggle = useCallback(() => {
    if (runStartedAtRef.current != null) pause();
    else start();
  }, [start, pause]);

  const reset = useCallback(() => {
    accumulatedMsRef.current = 0;
    runStartedAtRef.current = null;
    setIsRunning(false);
    bump();
  }, [bump]);

  const restart = useCallback(() => {
    accumulatedMsRef.current = 0;
    runStartedAtRef.current = Date.now();
    setIsRunning(true);
    bump();
  }, [bump]);

  useEffect(() => {
    if (!isRunning) return undefined;

    const catchUp = () => bump();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') catchUp();
    };

    catchUp();
    const interval = setInterval(catchUp, 250);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('resume', catchUp);
    document.addEventListener('freeze', catchUp);
    window.addEventListener('focus', catchUp);
    window.addEventListener('pageshow', catchUp);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('resume', catchUp);
      document.removeEventListener('freeze', catchUp);
      window.removeEventListener('focus', catchUp);
      window.removeEventListener('pageshow', catchUp);
    };
  }, [isRunning, bump]);

  return {
    seconds: Math.floor(elapsedMsFrom(accumulatedMsRef.current, runStartedAtRef.current) / 1000),
    isRunning,
    start,
    pause,
    toggle,
    reset,
    restart,
    getSnapshot,
    getElapsedSeconds
  };
}
