import React from 'react';
import { Sparkles, Coins } from 'lucide-react';

export function FloatingToasts({ toasts }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className="animate-float-reward glass-panel"
          style={{
            padding: '12px 18px',
            background: 'rgba(19, 23, 34, 0.95)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.6), 0 0 15px rgba(245, 158, 11, 0.2)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#fff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {t.xp > 0 && (
              <span style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={16} /> +{t.xp} XP
              </span>
            )}
            {t.coins !== 0 && (
              <span style={{ color: t.coins > 0 ? '#38bdf8' : '#f43f5e', fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Coins size={16} /> {t.coins > 0 ? `+${t.coins}` : t.coins} 🪙
              </span>
            )}
          </div>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
            {t.text}
          </span>
        </div>
      ))}
    </div>
  );
}
