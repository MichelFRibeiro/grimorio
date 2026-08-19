import React, { useState } from 'react';
import { Volume2, VolumeX, Flame, Coins, Shield, Brain, Zap, Swords, Sparkles, LogOut, User } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

export function Header({ profile, currentUser, onLogout, boss, muted, onToggleMute }) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  if (!profile) return null;

  const xpPercent = Math.min(100, Math.round((profile.xp / profile.xpToNextLevel) * 100));

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
    if (onLogout) onLogout();
  };

  const userAvatarImage = currentUser?.picture || profile.picture;

  return (
    <header className="glass-panel" style={{ padding: '18px 24px', marginBottom: '24px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
        
        {/* Hero Identity & Level */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)',
              border: '2px solid rgba(245, 158, 11, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.8rem',
              boxShadow: '0 0 15px rgba(245, 158, 11, 0.2)',
              overflow: 'hidden',
              flexShrink: 0
            }}
          >
            {userAvatarImage ? (
              <img
                src={userAvatarImage}
                alt={currentUser?.name || profile.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                referrerPolicy="no-referrer"
              />
            ) : (
              profile.avatar || '🧙‍♂️'
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.02em' }}>
                {currentUser?.name || profile.name}
              </h1>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fbbf24',
                  fontWeight: 800,
                  border: '1px solid rgba(245, 158, 11, 0.4)'
                }}
              >
                NV. {profile.level}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <p style={{ fontSize: '0.85rem', color: '#c084fc', fontWeight: 600 }}>
                {profile.title}
              </p>
              {currentUser?.email && (
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  • {currentUser.email}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div style={{ flex: '1 1 240px', maxWidth: '360px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px', fontWeight: 600 }}>
            <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={14} color="#f59e0b" /> Experiência (XP)
            </span>
            <span style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
              {profile.xp} / {profile.xpToNextLevel} XP ({xpPercent}%)
            </span>
          </div>
          <div className="progress-container" style={{ height: '10px' }}>
            <div className="progress-fill-xp" style={{ width: `${xpPercent}%` }} />
          </div>
        </div>

        {/* Stats, Currency and Session Actions */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          
          {/* Gold Coins */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)'
            }}
          >
            <Coins size={18} color="#fbbf24" />
            <span style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
              {profile.coins}
            </span>
          </div>

          {/* Daily Streak */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}
            title="Sequência de dias ativos"
          >
            <Flame size={18} color="#f87171" />
            <span style={{ color: '#f87171', fontWeight: 800, fontSize: '0.95rem' }}>
              {profile.streak || 1} {profile.streak === 1 ? 'dia' : 'dias'}
            </span>
          </div>

          {/* Character Attributes Pills */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                fontSize: '0.78rem'
              }}
              title="Sabedoria (Leitura de Livros)"
            >
              <Brain size={14} color="#34d399" />
              <span style={{ color: '#34d399', fontWeight: 700 }}>{profile.stats?.wisdom || 0}</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                fontSize: '0.78rem'
              }}
              title="Foco (Processos & Execução)"
            >
              <Zap size={14} color="#38bdf8" />
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{profile.stats?.focus || 0}</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.2)',
                fontSize: '0.78rem'
              }}
              title="Vontade (Missões Épicas)"
            >
              <Swords size={14} color="#c084fc" />
              <span style={{ color: '#c084fc', fontWeight: 700 }}>{profile.stats?.willpower || 0}</span>
            </div>
          </div>

          {/* Sound Toggle Button */}
          <button
            onClick={onToggleMute}
            style={{
              padding: '8px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: muted ? '#64748b' : '#38bdf8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s ease'
            }}
            title={muted ? 'Desmutar Efeitos Sonoros' : 'Mutar Efeitos Sonoros'}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          {/* Logout Button */}
          {onLogout && (
            <button
              onClick={() => setShowLogoutModal(true)}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                transition: 'all 0.2s ease'
              }}
              title="Encerrar sessão"
            >
              <LogOut size={16} />
              <span>Sair</span>
            </button>
          )}

        </div>

      </div>

      {/* Modal de confirmação de Logout */}
      <ConfirmModal
        isOpen={showLogoutModal}
        title="Encerrar Sessão"
        message="Deseja realmente sair da sua conta no Grimório de Missões? Seu progresso continuará salvo na nuvem."
        confirmText="Sim, Encerrar Sessão"
        cancelText="Permanecer no Grimório"
        confirmVariant="danger"
        icon={LogOut}
        onConfirm={handleConfirmLogout}
        onCancel={() => setShowLogoutModal(false)}
      />
    </header>
  );
}
