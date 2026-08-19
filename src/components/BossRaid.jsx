import React from 'react';
import { Skull, Swords, Trophy, RefreshCw, Sparkles, ShieldAlert } from 'lucide-react';

export function BossRaid({ boss, onResetBoss }) {
  if (!boss) return null;

  const hpPercent = Math.max(0, Math.min(100, Math.round((boss.currentHp / boss.maxHp) * 100)));

  return (
    <div
      className={boss.defeated ? 'glass-panel-gold gold-glow-pulse' : 'glass-panel'}
      style={{
        padding: '16px 20px',
        marginBottom: '24px',
        position: 'relative',
        overflow: 'hidden',
        border: boss.defeated ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(244, 63, 94, 0.25)',
        background: boss.defeated
          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(19, 23, 34, 0.9) 100%)'
          : 'linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, rgba(19, 23, 34, 0.9) 100%)'
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        
        {/* Boss Icon & Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: boss.defeated ? 'rgba(245, 158, 11, 0.2)' : 'rgba(244, 63, 94, 0.2)',
              border: boss.defeated ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(244, 63, 94, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.6rem'
            }}
          >
            {boss.defeated ? '🏆' : '🐉'}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="font-cinzel" style={{ fontSize: '1.05rem', fontWeight: 800, color: boss.defeated ? '#fbbf24' : '#f87171' }}>
                {boss.name}
              </span>
              {boss.defeated ? (
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontWeight: 800 }}>
                  DERROTADO!
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e', fontWeight: 800 }}>
                  CHEFE SEMANAL
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              {boss.defeated ? 'Parabéns! O chefe semanal foi aniquilado com sua produtividade!' : 'Suas tarefas, páginas lidas e processos causam dano a este titã.'}
            </p>
          </div>
        </div>

        {/* Boss HP Bar or Victory Rewards */}
        <div style={{ flex: '1 1 260px', maxWidth: '420px' }}>
          {!boss.defeated ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px', fontWeight: 700 }}>
                <span style={{ color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Swords size={14} /> Vida do Chefe
                </span>
                <span style={{ color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                  {boss.currentHp} / {boss.maxHp} HP ({hpPercent}%)
                </span>
              </div>
              <div className="progress-container" style={{ height: '10px' }}>
                <div className="progress-fill-boss" style={{ width: `${hpPercent}%` }} />
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', fontSize: '0.85rem', fontWeight: 700 }}>
                <Sparkles size={16} /> Recompensa: +{boss.rewardXp} XP & +{boss.rewardCoins} 🪙
              </div>
              <button
                onClick={onResetBoss}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={14} /> Novo Chefe
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
