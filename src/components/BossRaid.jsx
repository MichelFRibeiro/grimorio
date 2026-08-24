import React from 'react';
import { Skull, Swords, Trophy, RefreshCw, Sparkles, ShieldAlert, Zap, Flame } from 'lucide-react';

export function BossRaid({ boss, onResetBoss }) {
  if (!boss) return null;

  const currentLevel = boss.level || 1;
  const hpPercent = Math.max(0, Math.min(100, Math.round((boss.currentHp / boss.maxHp) * 100)));
  const powerBonus = currentLevel > 1 ? Math.round((Math.pow(1.10, currentLevel - 1) - 1) * 100) : 0;
  const defeats = boss.defeatsCount || 0;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 320px' }}>
          <div
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '12px',
              background: boss.defeated ? 'rgba(245, 158, 11, 0.2)' : 'rgba(244, 63, 94, 0.2)',
              border: boss.defeated ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(244, 63, 94, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.7rem',
              flexShrink: 0
            }}
          >
            {boss.defeated ? '🏆' : (boss.icon || '🐉')}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '2px' }}>
              <span className="font-cinzel" style={{ fontSize: '1.05rem', fontWeight: 800, color: boss.defeated ? '#fbbf24' : '#f87171' }}>
                {boss.name}
              </span>
              
              {/* Level Badge */}
              <span style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '6px',
                background: boss.defeated ? 'rgba(245, 158, 11, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                color: boss.defeated ? '#fbbf24' : '#f87171',
                fontWeight: 800,
                border: boss.defeated ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)'
              }}>
                Nv. {currentLevel}
              </span>

              {/* Power Scaling Badge (+10% cumulative per level) */}
              {powerBonus > 0 && (
                <span style={{
                  fontSize: '0.68rem',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#fca5a5',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}>
                  <Flame size={11} /> +{powerBonus}% Força
                </span>
              )}

              {/* Defeats count badge */}
              {defeats > 0 && (
                <span style={{
                  fontSize: '0.68rem',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#fcd34d',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}>
                  <Trophy size={11} /> {defeats} {defeats === 1 ? 'vitória' : 'vitórias'}
                </span>
              )}

              {boss.defeated ? (
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.25)', color: '#fbbf24', fontWeight: 800 }}>
                  DERROTADO!
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e', fontWeight: 800 }}>
                  CHEFE ATIVO
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
              {boss.defeated
                ? 'Parabéns! O chefe foi aniquilado com sua produtividade e foco!'
                : (boss.subtitle || 'Suas tarefas, páginas lidas e processos causam dano a este titã.')}
            </p>
          </div>
        </div>

        {/* Boss HP Bar or Victory Rewards */}
        <div style={{ flex: '1 1 260px', maxWidth: '440px' }}>
          {!boss.defeated ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginBottom: '6px', fontWeight: 700 }}>
                <span style={{ color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Swords size={14} /> Vida do Chefe
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                    {boss.currentHp} / {boss.maxHp} HP ({hpPercent}%)
                  </span>
                  <button
                    onClick={onResetBoss}
                    title="Trocar oponente ou reiniciar chefe"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(148, 163, 184, 0.6)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '2px',
                      borderRadius: '4px',
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(148, 163, 184, 0.6)'}
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>
              <div className="progress-container" style={{ height: '10px' }}>
                <div className="progress-fill-boss" style={{ width: `${hpPercent}%` }} />
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', fontSize: '0.85rem', fontWeight: 700 }}>
                <Sparkles size={16} /> +{boss.rewardXp} XP & +{boss.rewardCoins} 🪙
              </div>
              <button
                onClick={onResetBoss}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.3) 0%, rgba(239, 68, 68, 0.3) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  color: '#fff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 0 12px rgba(245, 158, 11, 0.2)',
                  transition: 'all 0.2s'
                }}
              >
                <RefreshCw size={14} /> Próximo Chefe (Nv. {currentLevel + 1} • +10% Força)
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
