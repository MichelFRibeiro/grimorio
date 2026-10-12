import React from 'react';
import { Headphones, Pause, Play, SkipBack, SkipForward } from 'lucide-react';

export function FocusMiniPlayer({ player, onOpen, playClick }) {
  const {
    playing,
    currentTime,
    duration,
    loading,
    progress,
    toggle,
    skip,
    formatClock
  } = player;

  if (!playing && currentTime < 1) return null;

  return (
    <div className="focus-mini-player glass-panel">
      <button type="button" className="focus-mini-open" onClick={onOpen} title="Abrir Câmara do Foco">
        <span className={`focus-mini-eq ${playing ? 'is-playing' : ''}`} aria-hidden="true">
          <i /><i /><i />
        </span>
        <div style={{ textAlign: 'left', minWidth: 0 }}>
          <strong className="font-cinzel" style={{ display: 'block', fontSize: '0.82rem', color: '#f8fafc' }}>
            Câmara do Foco
          </strong>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
            {formatClock(currentTime)} / {duration ? formatClock(duration) : '--:--'}
            {loading ? ' · buffer' : ''}
          </span>
        </div>
      </button>

      <div className="focus-mini-bar" style={{ '--progress': `${progress}%` }} />

      <div className="focus-mini-actions">
        <button
          type="button"
          onClick={() => {
            if (playClick) playClick();
            skip(-15);
          }}
          title="Voltar 15s"
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          className="is-primary"
          onClick={() => {
            if (playClick) playClick();
            toggle();
          }}
          title={playing ? 'Pausar' : 'Tocar'}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          type="button"
          onClick={() => {
            if (playClick) playClick();
            skip(15);
          }}
          title="Avançar 15s"
        >
          <SkipForward size={16} />
        </button>
        <button type="button" onClick={onOpen} title="Abrir player">
          <Headphones size={16} />
        </button>
      </div>
    </div>
  );
}
