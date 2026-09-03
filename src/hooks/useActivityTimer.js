import { useEffect, useState } from 'react';
import {
  getActivityTimerSnapshot,
  resetActivityTimer,
  subscribeActivityTimers,
  toggleActivityTimer
} from '../utils/liveActivityTimers.js';

export function useActivityTimer(kind, id) {
  const [snap, setSnap] = useState(() => (
    id ? getActivityTimerSnapshot(kind, id) : { seconds: 0, isRunning: false }
  ));

  useEffect(() => {
    if (!id) {
      setSnap({ seconds: 0, isRunning: false });
      return undefined;
    }

    const update = () => {
      const next = getActivityTimerSnapshot(kind, id);
      setSnap((prev) => {
        if (prev.seconds === next.seconds && prev.isRunning === next.isRunning) return prev;
        return { seconds: next.seconds, isRunning: next.isRunning };
      });
    };

    update();
    return subscribeActivityTimers(update, kind, id);
  }, [kind, id]);

  return {
    seconds: snap.seconds || 0,
    isRunning: !!snap.isRunning,
    toggle: () => { if (id) toggleActivityTimer(kind, id); },
    reset: () => { if (id) resetActivityTimer(kind, id); }
  };
}
