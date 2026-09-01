import React from 'react';
import {
  DIFFICULTY_KEYS,
  DIFFICULTY_REWARDS,
  PRIORITY_KEYS,
  PRIORITY_META
} from '../utils/activityScale';

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

export function ActivityScaleFields({
  priority,
  difficulty,
  onPriorityChange,
  onDifficultyChange
}) {
  return (
    <div style={{ display: 'flex', gap: '12px' }}>
      <div style={{ flex: 1 }}>
        <label style={labelStyle}>Prioridade</label>
        <select
          value={priority}
          onChange={(e) => onPriorityChange(e.target.value)}
          style={fieldStyle}
        >
          {PRIORITY_KEYS.map((key) => (
            <option key={key} value={key}>
              {PRIORITY_META[key].label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ flex: 1 }}>
        <label style={labelStyle}>Dificuldade</label>
        <select
          value={difficulty}
          onChange={(e) => onDifficultyChange(e.target.value)}
          style={fieldStyle}
        >
          {DIFFICULTY_KEYS.map((key) => (
            <option key={key} value={key}>
              {DIFFICULTY_REWARDS[key].optionLabel}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function PriorityBadge({ priority, compact = false }) {
  const meta = PRIORITY_META[priority] || PRIORITY_META.importante;
  return (
    <span
      style={{
        fontSize: compact ? '0.62rem' : '0.7rem',
        padding: compact ? '2px 6px' : '2px 8px',
        borderRadius: '6px',
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
        fontWeight: 800,
        whiteSpace: 'nowrap'
      }}
    >
      {meta.shortLabel}
    </span>
  );
}
