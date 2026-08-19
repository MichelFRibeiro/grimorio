import React from 'react';
import { Crown, Sparkles, Award, ArrowRight } from 'lucide-react';

export function LevelUpModal({ data, onClose }) {
  if (!data) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="glass-panel-gold gold-glow-pulse"
        style={{
          maxWidth: '480px',
          width: '100%',
          padding: '32px',
          textAlign: 'center',
          position: 'relative',
          background: 'linear-gradient(180deg, rgba(30, 27, 20, 0.95) 0%, rgba(15, 17, 26, 0.98) 100%)',
          borderRadius: '24px'
        }}
      >
        <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.15)', border: '2px solid rgba(245, 158, 11, 0.4)', marginBottom: '16px' }}>
          <Crown size={48} color="#fbbf24" />
        </div>

        <h2 className="font-cinzel" style={{ fontSize: '2rem', fontWeight: 900, color: '#fbbf24', textShadow: '0 0 20px rgba(245, 158, 11, 0.6)', marginBottom: '8px' }}>
          SUBIU DE NÍVEL!
        </h2>

        <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '24px' }}>
          Seu foco e disciplina elevaram seus poderes no Grimório!
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '24px' }}>
          <div style={{ padding: '12px 20px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Nível Anterior</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#94a3b8' }}>{data.oldLevel}</span>
          </div>

          <ArrowRight size={24} color="#f59e0b" />

          <div style={{ padding: '12px 20px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.5)' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 700 }}>Novo Nível</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fbbf24' }}>{data.newLevel}</span>
          </div>
        </div>

        {data.title && (
          <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Award size={20} color="#c084fc" />
            <span style={{ color: '#e9d5ff', fontWeight: 700, fontSize: '0.95rem' }}>
              Novo Título: <strong>{data.title}</strong>
            </span>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#000',
            fontWeight: 800,
            fontSize: '1rem',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)',
            transition: 'transform 0.15s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          Continuar Jornada ⚔️
        </button>
      </div>
    </div>
  );
}
