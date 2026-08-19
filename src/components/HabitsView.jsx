import React, { useState } from 'react';
import {
  Plus,
  Flame,
  CheckCircle2,
  Circle,
  Trophy,
  Trash2,
  Calendar,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Edit3,
  Tag
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

export function HabitsView({
  habits,
  questCategories = [],
  rankings,
  onAddHabit,
  onUpdateHabit,
  onToggleHabit,
  onDeleteHabit
}) {
  const defaultCategoryList = [
    { id: 'cat-1', name: 'Trabalho', color: '#38bdf8' },
    { id: 'cat-2', name: 'Estudos', color: '#a855f7' },
    { id: 'cat-3', name: 'Pessoal', color: '#10b981' },
    { id: 'cat-4', name: 'Projetos', color: '#f59e0b' },
    { id: 'cat-5', name: 'Saúde', color: '#f43f5e' },
    { id: 'cat-6', name: 'Finanças', color: '#eab308' }
  ];

  const activeCategories = Array.isArray(questCategories) && questCategories.length > 0
    ? questCategories
    : defaultCategoryList;

  const defaultCatName = activeCategories[0]
    ? (typeof activeCategories[0] === 'string' ? activeCategories[0] : activeCategories[0].name)
    : 'Pessoal';

  // New Habit State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState(defaultCatName);
  const [newFrequency, setNewFrequency] = useState('daily');
  const [newXpReward, setNewXpReward] = useState('30');
  const [newCoinReward, setNewCoinReward] = useState('8');

  // Edit Habit State
  const [editingHabit, setEditingHabit] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState(defaultCatName);
  const [editFrequency, setEditFrequency] = useState('daily');
  const [editXpReward, setEditXpReward] = useState('30');
  const [editCoinReward, setEditCoinReward] = useState('8');

  // Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    confirmVariant: 'warning',
    icon: null,
    onConfirm: null
  });

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  const promptDeleteHabit = (habit) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Ritual',
      message: `Deseja realmente excluir o ritual "${habit.title}"?\nTodo o histórico e streak acumulado serão perdidos.`,
      confirmText: 'Sim, Excluir Ritual',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteHabit) onDeleteHabit(habit.id);
        closeConfirmModal();
      }
    });
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const handleCreateHabit = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    onAddHabit({
      title: newTitle.trim(),
      category: newCategory,
      frequency: newFrequency,
      xpReward: parseInt(newXpReward, 10) || 30,
      coinReward: parseInt(newCoinReward, 10) || 8
    });

    setNewTitle('');
    setShowAddModal(false);
  };

  const handleOpenEditHabit = (habit) => {
    setEditingHabit(habit);
    setEditTitle(habit.title || '');
    setEditCategory(habit.category || defaultCatName);
    setEditFrequency(habit.frequency || 'daily');
    setEditXpReward(String(habit.xpReward || 30));
    setEditCoinReward(String(habit.coinReward || 8));
  };

  const handleSaveEditHabit = (e) => {
    e.preventDefault();
    if (!editingHabit || !editTitle.trim()) return;

    if (onUpdateHabit) {
      onUpdateHabit(editingHabit.id, {
        title: editTitle.trim(),
        category: editCategory,
        frequency: editFrequency,
        xpReward: parseInt(editXpReward, 10) || 30,
        coinReward: parseInt(editCoinReward, 10) || 8
      });
    }

    setEditingHabit(null);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🔥</span> Rituais Diários (Hábitos & Streaks)
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Mantenha a chama da disciplina acesa! Sequências diárias aumentam seus multiplicadores de XP.
          </p>
        </div>

        <button
          onClick={() => {
            setNewCategory(defaultCatName);
            setShowAddModal(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            color: '#fff',
            fontWeight: 800,
            fontSize: '0.9rem',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.35)',
            transition: 'transform 0.15s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Plus size={18} /> Novo Ritual
        </button>
      </div>

      {/* Habits List */}
      {(!habits || habits.length === 0) ? (
        <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
          <Flame size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhum ritual diário configurado.</p>
          <p style={{ fontSize: '0.85rem' }}>Adicione rituais como "Leitura matinal" ou "Revisão de processos" para ganhar consistência!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {habits.map(habit => {
            const isDoneToday = (habit.history || []).includes(todayStr);
            const streak = habit.currentStreak || 0;
            const multiplier = Math.min(2.0, 1 + streak * 0.1).toFixed(1);
            const habitCat = habit.category || 'Pessoal';
            const catInfo = activeCategories.find(c => (typeof c === 'string' ? c : c.name) === habitCat);
            const catColor = (catInfo && typeof catInfo === 'object' && catInfo.color) ? catInfo.color : '#f59e0b';
            const catRanking = rankings?.categories?.[habitCat];

            return (
              <div
                key={habit.id}
                className="rpg-card"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  borderLeft: isDoneToday ? '4px solid #10b981' : '4px solid #ef4444',
                  background: isDoneToday ? 'rgba(16, 185, 129, 0.04)' : '#131722'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: `${catColor}18`,
                            color: catColor,
                            border: `1px solid ${catColor}40`,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          <span>{habitCat}</span>
                          {catRanking && (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: 900,
                                padding: '0 4px',
                                borderRadius: '3px',
                                background: catRanking.currentRank.bg,
                                color: catRanking.currentRank.textColor,
                                border: `1px solid ${catRanking.currentRank.border}`
                              }}
                            >
                              {catRanking.currentRank.name}
                            </span>
                          )}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                        {habit.title}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={() => handleOpenEditHabit(habit)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#38bdf8'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                        title="Editar ritual"
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        onClick={() => promptDeleteHabit(habit)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#f87171'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                        title="Excluir ritual"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Sparkles size={14} color="#f59e0b" /> +{habit.xpReward} XP
                    </span>
                    <span>•</span>
                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                      +{habit.coinReward} 🪙
                    </span>
                    <span>•</span>
                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                      {habit.frequency === 'daily' ? 'Diário' : habit.frequency === 'weekdays' ? 'Seg-Sex' : 'Semanal'}
                    </span>
                  </div>
                </div>

                {/* Streak & Completion Trigger */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Flame size={20} color={streak > 0 ? '#ef4444' : '#64748b'} />
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 900, color: streak > 0 ? '#f87171' : '#64748b', fontFamily: 'var(--font-mono)' }}>
                        {streak} {streak === 1 ? 'dia' : 'dias'}
                      </div>
                      {streak > 1 && (
                        <div style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: 700 }}>
                          Multiplicador x{multiplier}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => onToggleHabit(habit.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      background: isDoneToday
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.2) 100%)',
                      border: isDoneToday ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                      color: isDoneToday ? '#34d399' : '#f87171',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isDoneToday ? (
                      <>
                        <CheckCircle2 size={16} /> Realizado Hoje
                      </>
                    ) : (
                      <>
                        <Circle size={16} /> Marcar Ritual
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Novo Ritual */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '20px'
            }}
          >
            <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f87171', marginBottom: '18px' }}>
              🔥 Novo Ritual Diário
            </h3>

            <form onSubmit={handleCreateHabit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Nome do Hábito / Ritual *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 30 minutos de leitura concentrada"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Categoria *
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                >
                  {activeCategories.map(cat => {
                    const catName = typeof cat === 'string' ? cat : cat.name;
                    return (
                      <option key={catName} value={catName}>
                        {catName}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Frequência
                </label>
                <select
                  value={newFrequency}
                  onChange={(e) => setNewFrequency(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="daily">Todos os dias (Diário)</option>
                  <option value="weekdays">Dias de semana (Seg-Sex)</option>
                  <option value="weekly">Semanal</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    XP por Conclusão
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="150"
                    value={newXpReward}
                    onChange={(e) => setNewXpReward(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Moedas por Conclusão
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={newCoinReward}
                    onChange={(e) => setNewCoinReward(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                    color: '#fff',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Criar Ritual
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Ritual */}
      {editingHabit && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '20px'
            }}
          >
            <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit3 size={20} /> Editar Ritual Diário
            </h3>

            <form onSubmit={handleSaveEditHabit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Nome do Hábito / Ritual *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 30 minutos de leitura concentrada"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Categoria *
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                >
                  {activeCategories.map(cat => {
                    const catName = typeof cat === 'string' ? cat : cat.name;
                    return (
                      <option key={catName} value={catName}>
                        {catName}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Frequência
                </label>
                <select
                  value={editFrequency}
                  onChange={(e) => setEditFrequency(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="daily">Todos os dias (Diário)</option>
                  <option value="weekdays">Dias de semana (Seg-Sex)</option>
                  <option value="weekly">Semanal</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    XP por Conclusão
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="150"
                    value={editXpReward}
                    onChange={(e) => setEditXpReward(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Moedas por Conclusão
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={editCoinReward}
                    onChange={(e) => setEditCoinReward(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingHabit(null)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                    color: '#000',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reusable Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        confirmVariant={confirmModal.confirmVariant}
        icon={confirmModal.icon}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
      />
    </div>
  );
}
