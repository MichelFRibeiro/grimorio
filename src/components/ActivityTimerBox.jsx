import React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useActivityTimer } from '../hooks/useActivityTimer';
import { formatTimer } from '../hooks/useStopwatch';

export function ActivityTimerBox({
  kind,
  id,
  label = 'Cronômetro',
  accent = '#fbbf24',
  compact = false
}) {
  const { seconds, isRunning, toggle, reset } = useActivityTimer(kind, id);

  return (
    <div
      style={{
        padding: compact ? '10px 12px' : '14px',
        borderRadius: compact ? '10px' : '12px',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: compact ? '8px' : '10px',
        width: '100%'
      }}
    >
      <div style={{ textAlign: 'left' }}>
        <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <div
          style={{
            fontSize: compact ? '1.25rem' : '1.6rem',
            fontWeight: 900,
            fontFamily: 'var(--font-mono)',
            color: isRunning ? '#f87171' : accent,
            lineHeight: 1.15
          }}
        >
          {formatTimer(seconds)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          type="button"
          onClick={toggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: compact ? '5px 10px' : '6px 14px',
            borderRadius: '8px',
            background: isRunning ? 'rgba(239, 68, 68, 0.2)' : `${accent}22`,
            color: isRunning ? '#f87171' : accent,
            border: isRunning ? '1px solid rgba(239, 68, 68, 0.4)' : `1px solid ${accent}66`,
            cursor: 'pointer',
            fontSize: compact ? '0.78rem' : '0.85rem',
            fontWeight: 700
          }}
        >
          {isRunning ? <Pause size={compact ? 13 : 14} /> : <Play size={compact ? 13 : 14} />}
          {isRunning ? 'Pausar' : 'Iniciar'}
        </button>

        <button
          type="button"
          onClick={reset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: compact ? '5px 8px' : '6px 12px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.06)',
            color: '#94a3b8',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
            fontSize: compact ? '0.78rem' : '0.85rem'
          }}
        >
          <RotateCcw size={compact ? 13 : 14} /> Zerar
        </button>
      </div>
    </div>
  );
}
