import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, Flame, Coins, Shield, Brain, Zap, Swords, Sparkles, LogOut, User, Trophy, Award, ChevronRight, X, AlertTriangle, TrendingUp, Bot } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { McpModal } from './McpModal';

export function Header({ profile, currentUser, onLogout, boss, rankings, muted, onToggleMute, onOpenOracle }) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showRankingsModal, setShowRankingsModal] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);

  // Close Rankings modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showRankingsModal) {
        setShowRankingsModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showRankingsModal]);

  if (!profile) return null;

  const xpPercent = Math.min(100, Math.round((profile.xp / profile.xpToNextLevel) * 100));
  const overallRank = rankings?.overall?.rank || { name: 'E', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: '#64748b', title: 'Iniciado' };

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
    if (onLogout) onLogout();
  };

  const userAvatarImage = currentUser?.picture || profile.picture;

  return (
    <header className="glass-panel" style={{ padding: '18px 24px', marginBottom: '24px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
        
        {/* Hero Identity & Level */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flex: '1 1 220px' }}>
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

          <div className="header-identity">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.02em', wordBreak: 'break-word' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '0.85rem', color: '#c084fc', fontWeight: 600 }}>
                {profile.title}
              </p>
              {currentUser?.email && (
                <span style={{ fontSize: '0.72rem', color: '#64748b', wordBreak: 'break-all' }}>
                  • {currentUser.email}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div className="header-xp">
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

          {/* Overall Rank Pill */}
          <button
            onClick={() => setShowRankingsModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: '12px',
              background: overallRank.bg || 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${overallRank.border || 'rgba(245, 158, 11, 0.4)'}`,
              cursor: 'pointer',
              boxShadow: `0 0 14px ${overallRank.glow || 'rgba(245, 158, 11, 0.2)'}`,
              transition: 'all 0.2s ease'
            }}
            title="Clique para ver o Ranking de todas as Categorias"
          >
            <Trophy size={18} color={overallRank.color || '#fbbf24'} />
            <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                Ranking Geral
              </div>
              <div style={{ color: overallRank.textColor || '#fbbf24', fontWeight: 900, fontSize: '0.9rem' }}>
                Tier {overallRank.name} <span style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 600 }}>({rankings?.overall?.avgScore || 0}/10)</span>
              </div>
            </div>
          </button>

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

          {/* MCP AI Agents Button */}
          <button
            onClick={() => setShowMcpModal(true)}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: 700,
              transition: 'all 0.2s ease',
              boxShadow: '0 0 10px rgba(56, 189, 248, 0.1)'
            }}
            title="Conectar Agentes de IA via MCP"
          >
            <Bot size={16} />
            <span>MCP / IA</span>
          </button>

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

      {/* Modal de Integração MCP / Agentes IA */}
      <McpModal isOpen={showMcpModal} onClose={() => setShowMcpModal(false)} />

      {/* Modal de Detalhes dos Rankings de Categorias */}
      {showRankingsModal && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(5, 7, 13, 0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.15s ease'
          }}
          onClick={() => setShowRankingsModal(false)}
        >
          <div
            className="glass-panel modal-sheet"
            style={{
              maxWidth: '660px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '28px',
              borderRadius: '24px',
              border: `1px solid ${overallRank.border || 'rgba(245, 158, 11, 0.4)'}`,
              background: '#0c101d',
              boxShadow: `0 25px 60px rgba(0, 0, 0, 0.95), 0 0 40px ${overallRank.glow || 'rgba(245, 158, 11, 0.2)'}`,
              textAlign: 'left',
              position: 'relative',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '20px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: overallRank.bg || 'rgba(245, 158, 11, 0.15)',
                    border: `1px solid ${overallRank.border || 'rgba(245, 158, 11, 0.4)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <Trophy size={24} color={overallRank.color || '#fbbf24'} />
                </div>
                <div>
                  <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                    Quadro de Rankings de Categorias
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0, marginTop: '2px' }}>
                    Ciclo Semanal: {rankings?.currentWeek?.weekLabel || 'Domingo a Sábado'} {rankings?.currentWeek?.countdownLabel ? `(${rankings.currentWeek.countdownLabel})` : ''}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowRankingsModal(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = '#f8fafc';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = '#94a3b8';
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Overall Rank Hero Banner */}
            <div
              style={{
                padding: '16px 20px',
                borderRadius: '16px',
                background: overallRank.bg || 'rgba(245, 158, 11, 0.12)',
                border: `1px solid ${overallRank.border || 'rgba(245, 158, 11, 0.3)'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '20px',
                flexShrink: 0
              }}
            >
              <div>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                  Seu Ranking Geral
                </span>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: overallRank.textColor || '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Tier {overallRank.name}</span>
                  <span style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 700 }}>• {overallRank.title}</span>
                </div>
                <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                  Média calculada entre {rankings?.overall?.totalCategories || 0} categorias ativas: {rankings?.overall?.avgScore || 0} / 10
                </span>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                  XP Total Esta Semana
                </span>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                  +{rankings?.overall?.totalWeeklyXp || 0} XP
                </div>
              </div>
            </div>

            {/* Category Rankings Cards List (Scrollable Area) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '20px',
                overflowY: 'auto',
                paddingRight: '6px',
                flex: 1
              }}
            >
              {(rankings?.categoriesList || []).length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                  Nenhuma categoria com pontuação registrada para esta semana.
                </div>
              ) : (
                (rankings?.categoriesList || []).map(catRank => {
                  const rank = catRank.currentRank;
                  const status = catRank.status;

                  return (
                    <div
                      key={catRank.category.name}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '14px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '14px'
                      }}
                    >
                      {/* Category Name & Color */}
                      <div style={{ flex: '1 1 180px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '999px',
                              background: catRank.category.color || '#38bdf8',
                              boxShadow: `0 0 8px ${catRank.category.color || '#38bdf8'}`
                            }}
                          />
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f8fafc' }}>
                            {catRank.category.name}
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                          Semana atual: <strong style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>{catRank.weeklyXp} XP</strong>
                          {catRank.nextRank && (
                            <span> (faltam {catRank.xpNeededForNextRank} XP para Tier {catRank.nextRank.name})</span>
                          )}
                        </div>
                      </div>

                      {/* Status Pill */}
                      <div>
                        {status === 'promoted' && (
                          <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 800, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            ⚡ Promovido!
                          </span>
                        )}
                        {status === 'at_risk' && (
                          <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontWeight: 800, border: '1px solid rgba(245, 158, 11, 0.3)' }} title={`Faltam ${catRank.xpNeededToMaintain} XP para não cair`}>
                            ⚠️ Risco (-1)
                          </span>
                        )}
                        {status === 'maintained' && catRank.currentRankIndex > 0 && (
                          <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 800, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                            🛡️ Mantido
                          </span>
                        )}
                      </div>

                      {/* Rank Badge */}
                      <div
                        style={{
                          padding: '6px 14px',
                          borderRadius: '10px',
                          background: rank.bg,
                          border: `1px solid ${rank.border}`,
                          color: rank.textColor,
                          fontWeight: 900,
                          fontSize: '1rem',
                          minWidth: '58px',
                          textAlign: 'center',
                          boxShadow: `0 0 10px ${rank.glow}`
                        }}
                        title={`${rank.title}: ${rank.description}`}
                      >
                        {rank.name}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0, paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <button
                type="button"
                onClick={() => setShowRankingsModal(false)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#000',
                  border: 'none',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)',
                  transition: 'transform 0.15s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
