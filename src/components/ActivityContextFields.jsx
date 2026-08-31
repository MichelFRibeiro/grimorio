import React from 'react';
import { LOCATIONS, getLocationMeta } from '../utils/locations';

const fieldStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  background: '#1a2030',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  color: '#fff',
  fontSize: '0.9rem'
};

const labelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#94a3b8',
  marginBottom: '4px'
};

export function ActivityContextFields({
  location,
  timeWindowStart,
  timeWindowEnd,
  onLocationChange,
  onWindowStartChange,
  onWindowEndChange,
  locations = LOCATIONS
}) {
  const catalog = locations.length ? locations : LOCATIONS;
  const meta = getLocationMeta(location, catalog);
  const hasWindow = !!(timeWindowStart && timeWindowEnd);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>Onde pode ser feita</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {catalog.map(loc => {
            const active = loc.id === (location || 'anywhere');
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => onLocationChange(loc.id)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '999px',
                  border: active ? '1px solid rgba(245, 158, 11, 0.55)' : '1px solid rgba(255,255,255,0.12)',
                  background: active ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#fbbf24' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer'
                }}
              >
                {loc.emoji} {loc.short}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
          {meta.label} — o Oráculo só sugere esta atividade quando você estiver neste lugar.
        </p>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Janela de horário (opcional)</label>
          {hasWindow && (
            <button
              type="button"
              onClick={() => {
                onWindowStartChange('');
                onWindowEndChange('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '0.72rem',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              Qualquer hora
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <input
              type="time"
              value={timeWindowStart || ''}
              onChange={(e) => onWindowStartChange(e.target.value)}
              style={fieldStyle}
              title="Início da janela de execução"
            />
          </div>
          <div style={{ flex: 1 }}>
            <input
              type="time"
              value={timeWindowEnd || ''}
              onChange={(e) => onWindowEndChange(e.target.value)}
              style={fieldStyle}
              title="Fim da janela de execução"
            />
          </div>
        </div>
        <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
          Diferente do prazo. Use só se a atividade só puder ser feita neste intervalo (ex.: 15:00–16:00).
        </p>
      </div>
    </div>
  );
}
