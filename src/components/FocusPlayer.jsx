import React, { useEffect } from 'react';
import {
  Headphones,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Waves
} from 'lucide-react';

function ControlButton({ onClick, title, children, active, accent = '#38bdf8', size = 42 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? `${accent}22` : 'rgba(255, 255, 255, 0.05)',
        border: active ? `1px solid ${accent}88` : '1px solid rgba(255, 255, 255, 0.1)',
        color: active ? accent : '#e2e8f0',
        cursor: 'pointer',
        flexShrink: 0
      }}
    >
      {children}
    </button>
  );
}

export function FocusChamberView({ player, playClick }) {
  const {
    playing,
    currentTime,
    duration,
    volume,
    muted,
    loop,
    error,
    loading,
    progress,
    toggle,
    seek,
    skip,
    setVolume,
    toggleMute,
    toggleLoop,
    formatClock,
    prepare
  } = player;

  useEffect(() => {
    if (prepare) prepare();
  }, [prepare]);

  const handleSeek = (event) => {
    const next = Number(event.target.value);
    seek(next);
  };

  return (
    <div className="focus-chamber">
      <section
        className="glass-panel-gold"
        style={{
          padding: '28px 24px',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          background: 'linear-gradient(160deg, rgba(6, 182, 212, 0.12) 0%, rgba(19, 23, 34, 0.94) 42%, rgba(168, 85, 247, 0.1) 100%)'
        }}
      >
        <div className={`focus-orb ${playing ? 'is-playing' : ''}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '22px',
              background: playing ? 'rgba(56, 189, 248, 0.2)' : 'rgba(245, 158, 11, 0.16)',
              border: playing ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: playing ? '#38bdf8' : '#fbbf24',
              boxShadow: playing ? '0 0 28px rgba(56, 189, 248, 0.28)' : '0 0 18px rgba(245, 158, 11, 0.18)'
            }}
          >
            {playing ? <Waves size={34} /> : <Headphones size={34} />}
          </div>

          <h2 className="font-cinzel" style={{ fontSize: '1.55rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
            Câmara do Foco
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', maxWidth: '520px', margin: 0 }}>
            Trilha longa para estudar, ler e enfrentar o Boss da Procrastinação. O áudio continua tocando se você mudar de aba.
          </p>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: playing ? '#38bdf8' : '#fbbf24',
              padding: '4px 10px',
              borderRadius: '999px',
              background: playing ? 'rgba(56, 189, 248, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              border: playing ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
            }}
          >
            {loading ? 'Carregando…' : playing ? 'Em fluxo' : 'Em silêncio'}
          </span>
        </div>

        <div className="rpg-card" style={{ position: 'relative', zIndex: 1, marginTop: '22px', padding: '18px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#cbd5e1' }}>
            <span>{formatClock(currentTime)}</span>
            <span>{duration ? formatClock(duration) : '--:--'}</span>
          </div>

          <input
            className="focus-seek"
            type="range"
            min="0"
            max={duration || 0}
            step="1"
            value={Math.min(currentTime, duration || 0)}
            onChange={handleSeek}
            disabled={!duration}
            aria-label="Posição da trilha"
            style={{ '--progress': `${progress}%` }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
            <ControlButton
              title="Voltar 15 segundos"
              onClick={() => {
                if (playClick) playClick();
                skip(-15);
              }}
            >
              <SkipBack size={18} />
            </ControlButton>

            <button
              type="button"
              onClick={() => {
                if (playClick) playClick();
                toggle();
              }}
              title={playing ? 'Pausar' : 'Tocar'}
              className="focus-play-btn"
            >
              {playing ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: '3px' }} />}
            </button>

            <ControlButton
              title="Avançar 15 segundos"
              onClick={() => {
                if (playClick) playClick();
                skip(15);
              }}
            >
              <SkipForward size={18} />
            </ControlButton>

            <ControlButton
              title={loop ? 'Repetir: ligado' : 'Repetir: desligado'}
              active={loop}
              onClick={() => {
                if (playClick) playClick();
                toggleLoop();
              }}
            >
              <Repeat size={18} />
            </ControlButton>

            <ControlButton
              title="Reiniciar"
              onClick={() => {
                if (playClick) playClick();
                seek(0);
              }}
            >
              <RotateCcw size={18} />
            </ControlButton>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '18px' }}>
            <button
              type="button"
              onClick={() => {
                if (playClick) playClick();
                toggleMute();
              }}
              title={muted || volume === 0 ? 'Ativar som' : 'Silenciar'}
              style={{
                background: 'transparent',
                border: 'none',
                color: muted || volume === 0 ? '#64748b' : '#38bdf8',
                cursor: 'pointer',
                display: 'flex',
                padding: '4px'
              }}
            >
              {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              className="focus-seek focus-volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              style={{ '--progress': `${(muted ? 0 : volume) * 100}%` }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#94a3b8', minWidth: '40px' }}>
              {Math.round((muted ? 0 : volume) * 100)}%
            </span>
          </div>

          {error && (
            <p style={{ margin: '14px 0 0', color: '#f87171', fontSize: '0.85rem' }}>{error}</p>
          )}
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '18px 20px', marginTop: '16px' }}>
        <h3 className="font-cinzel" style={{ fontSize: '1rem', color: '#fbbf24', marginBottom: '8px' }}>
          Como usar
        </h3>
        <p style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.55, margin: 0 }}>
          Fonte: <code style={{ color: '#7dd3fc' }}>az-vault/audios/focus/focus_mp3.mp3</code>. Aproximadamente 2 horas de trilha.
          O mini-player aparece no rodapé enquanto a música toca em qualquer outra aba do Grimório.
        </p>
      </section>
    </div>
  );
}

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
