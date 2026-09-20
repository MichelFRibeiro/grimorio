import React, { useState } from 'react';
import { Trophy } from 'lucide-react';

export function PlanHomeostasisVictoryButton({
  victory,
  onAddDailyVictory,
  accentColor = '#fbbf24'
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  if (!onAddDailyVictory || !victory) return null;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await onAddDailyVictory(victory);
      setFeedback({ ok: true, message: `Vitória planejada: ${victory.title}` });
    } catch (err) {
      setFeedback({ ok: false, message: err.message || 'Não foi possível cadastrar a vitória.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '9px 14px',
          borderRadius: '10px',
          background: busy
            ? `${accentColor}2e`
            : `linear-gradient(135deg, ${accentColor}38 0%, rgba(16, 185, 129, 0.18) 100%)`,
          color: accentColor,
          border: `1px solid ${accentColor}73`,
          fontWeight: 800,
          fontSize: '0.8rem',
          cursor: busy ? 'wait' : 'pointer'
        }}
      >
        <Trophy size={14} />
        {busy ? 'Planejando…' : `Planejar vitória: ${victory.title}`}
      </button>
      {feedback && (
        <p style={{
          marginTop: '8px',
          fontSize: '0.78rem',
          fontWeight: 700,
          color: feedback.ok ? '#34d399' : '#fb7185'
        }}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}
