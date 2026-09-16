import React, { useEffect, useMemo, useState } from 'react';
import {
  Trophy,
  Plus,
  CheckCircle2,
  Circle,
  Pencil,
  Trash2,
  X,
  Sparkles,
  Calendar,
  RotateCcw
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { getSaoPauloDateStr } from '../utils/timeUtils';
import {
  MAX_DAILY_VICTORIES,
  DAILY_VICTORY_REWARDS,
  DAILY_VICTORY_TRIPLE_BONUS,
  formatDailyVictoryDate,
  getPlannableDates,
  summarizeDay
} from '../utils/dailyVictories';

const DEFAULT_CATEGORIES = [
  { id: 'cat-1', name: 'Trabalho', color: '#38bdf8' },
  { id: 'cat-2', name: 'Estudos', color: '#a855f7' },
  { id: 'cat-3', name: 'Pessoal', color: '#10b981' },
  { id: 'cat-4', name: 'Projetos', color: '#f59e0b' },
  { id: 'cat-5', name: 'Saúde', color: '#f43f5e' },
  { id: 'cat-6', name: 'Finanças', color: '#eab308' }
];

function categoryColor(name, categories) {
  const found = categories.find(c => (typeof c === 'string' ? c : c.name) === name);
  if (!found || typeof found === 'string') return '#fbbf24';
  return found.color || '#fbbf24';
}

export function DailyVictoriesCard({
  dailyVictories = [],
  dailyVictoryBonuses = {},
  questCategories = [],
  onAddVictory,
  onUpdateVictory,
  onCompleteVictory,
  onDeleteVictory
}) {
  const todayStr = getSaoPauloDateStr();
  const dates = getPlannableDates(todayStr);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  useEffect(() => {
    if (selectedDate !== dates.today && selectedDate !== dates.tomorrow) {
      setSelectedDate(dates.today);
    }
  }, [dates.today, dates.tomorrow, selectedDate]);

  const activeCategories = Array.isArray(questCategories) && questCategories.length > 0
    ? questCategories
    : DEFAULT_CATEGORIES;
  const defaultCatName = activeCategories[0]
    ? (typeof activeCategories[0] === 'string' ? activeCategories[0] : activeCategories[0].name)
    : 'Pessoal';

  const todaySummary = useMemo(
    () => summarizeDay(dailyVictories, dates.today, dailyVictoryBonuses),
    [dailyVictories, dates.today, dailyVictoryBonuses]
  );
  const tomorrowSummary = useMemo(
    () => summarizeDay(dailyVictories, dates.tomorrow, dailyVictoryBonuses),
    [dailyVictories, dates.tomorrow, dailyVictoryBonuses]
  );
  const summary = selectedDate === dates.tomorrow ? tomorrowSummary : todaySummary;
  const isToday = selectedDate === dates.today;
  const canComplete = isToday;
  const progressPct = summary.plannedCount > 0
    ? Math.round((summary.completedCount / MAX_DAILY_VICTORIES) * 100)
    : 0;

  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState(defaultCatName);
  const [formError, setFormError] = useState('');
  const [editing, setEditing] = useState(null);

  const [completing, setCompleting] = useState(null);
  const [completeNote, setCompleteNote] = useState('');

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    confirmVariant: 'danger',
    onConfirm: null
  });

  const openCreate = () => {
    setEditing(null);
    setFormTitle('');
    setFormCategory(defaultCatName);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (victory) => {
    setEditing(victory);
    setFormTitle(victory.title);
    setFormCategory(victory.category || defaultCatName);
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormTitle('');
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFormError('Informe o título da vitória.');
      return;
    }
    try {
      if (editing) {
        await onUpdateVictory(editing.id, { title: formTitle.trim(), category: formCategory });
      } else {
        await onAddVictory({ title: formTitle.trim(), category: formCategory, date: selectedDate });
      }
      closeForm();
    } catch (err) {
      setFormError(err.message || 'Não foi possível salvar a vitória.');
    }
  };

  const openComplete = (victory) => {
    setCompleting(victory);
    setCompleteNote(victory.note || '');
  };

  const handleConfirmComplete = async () => {
    if (!completing) return;
    try {
      await onCompleteVictory(completing.id, { completed: true, note: completeNote });
      setCompleting(null);
      setCompleteNote('');
    } catch {
      setCompleting(null);
    }
  };

  const promptDelete = (victory) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir vitória',
      message: `Remover "${victory.title}" das vitórias de ${isToday ? 'hoje' : 'amanhã'}?${victory.completed ? '\nAs recompensas serão estornadas.' : ''}`,
      confirmText: 'Excluir',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await onDeleteVictory(victory.id);
      }
    });
  };

  const promptReopen = (victory) => {
    setConfirmModal({
      isOpen: true,
      title: 'Reabrir vitória',
      message: `Desmarcar "${victory.title}"? As recompensas (e o bônus da tríade, se houver) serão estornadas.`,
      confirmText: 'Reabrir',
      confirmVariant: 'warning',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await onCompleteVictory(victory.id, { completed: false });
      }
    });
  };

  return (
    <div
      className={summary.allComplete ? 'glass-panel-gold gold-glow-pulse' : 'glass-panel'}
      style={{
        padding: '16px 20px',
        marginBottom: '24px',
        position: 'relative',
        overflow: 'hidden',
        border: summary.allComplete
          ? '1px solid rgba(245, 158, 11, 0.45)'
          : '1px solid rgba(251, 191, 36, 0.22)',
        background: summary.allComplete
          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(19, 23, 34, 0.92) 100%)'
          : 'linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(19, 23, 34, 0.92) 100%)'
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: '1 1 280px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.18)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbbf24',
              flexShrink: 0
            }}
          >
            <Trophy size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <h2 className="font-cinzel" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fbbf24', margin: 0 }}>
                Vitórias Planejadas para o Dia
              </h2>
              <span style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '6px',
                background: summary.allComplete ? 'rgba(16, 185, 129, 0.18)' : 'rgba(245, 158, 11, 0.16)',
                color: summary.allComplete ? '#34d399' : '#fbbf24',
                fontWeight: 800
              }}>
                {summary.completedCount}/{MAX_DAILY_VICTORIES}
              </span>
              {summary.tripleBonusAwarded && (
                <span style={{
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fcd34d',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <Sparkles size={11} /> Tríade
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>
              Até 3 tarefas que, se alcançadas, tornam o dia uma vitória. +{DAILY_VICTORY_REWARDS.xp} XP e +{DAILY_VICTORY_REWARDS.coins} 🪙 cada
              {summary.plannedCount === MAX_DAILY_VICTORIES ? ` · tríade +${DAILY_VICTORY_TRIPLE_BONUS.xp} XP` : ''}.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'inline-flex',
            padding: '3px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            {[{ key: dates.today, label: 'Hoje' }, { key: dates.tomorrow, label: 'Amanhã' }].map(tab => {
              const active = selectedDate === tab.key;
              const tabSummary = tab.key === dates.today ? todaySummary : tomorrowSummary;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSelectedDate(tab.key)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    background: active ? 'rgba(245, 158, 11, 0.22)' : 'transparent',
                    color: active ? '#fbbf24' : '#94a3b8'
                  }}
                >
                  {tab.label} {tabSummary.plannedCount > 0 ? `${tabSummary.completedCount}/${tabSummary.plannedCount}` : ''}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={openCreate}
            disabled={!summary.canAdd}
            title={summary.canAdd ? 'Adicionar vitória' : 'Limite de 3 vitórias neste dia'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              cursor: summary.canAdd ? 'pointer' : 'not-allowed',
              background: summary.canAdd
                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                : 'rgba(255,255,255,0.06)',
              color: summary.canAdd ? '#000' : '#64748b',
              fontWeight: 800,
              fontSize: '0.8rem',
              opacity: summary.canAdd ? 1 : 0.6
            }}
          >
            <Plus size={15} /> Nova
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <div className="progress-container" style={{ height: '8px', flex: 1 }}>
          <div style={{
            width: `${progressPct}%`,
            height: '100%',
            borderRadius: '999px',
            background: summary.allComplete ? '#34d399' : '#fbbf24',
            boxShadow: summary.allComplete ? '0 0 10px rgba(52, 211, 153, 0.45)' : '0 0 10px rgba(251, 191, 36, 0.35)',
            transition: 'width 0.35s ease'
          }} />
        </div>
        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {formatDailyVictoryDate(selectedDate)}
        </span>
      </div>

      {summary.items.length === 0 ? (
        <div style={{
          padding: '18px 12px',
          textAlign: 'center',
          color: '#64748b',
          borderRadius: '12px',
          border: '1px dashed rgba(245, 158, 11, 0.2)',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <Calendar size={22} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600 }}>
            Nenhuma vitória planejada para {isToday ? 'hoje' : 'amanhã'}.
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>
            Cadastre até 3 tarefas independentes das missões. Concluir as três dispara um bônus.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {summary.items.map((victory, idx) => {
            const color = categoryColor(victory.category, activeCategories);
            return (
              <div
                key={victory.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: victory.completed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${victory.completed ? 'rgba(16, 185, 129, 0.28)' : 'rgba(255,255,255,0.06)'}`
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (victory.completed) promptReopen(victory);
                    else if (canComplete) openComplete(victory);
                  }}
                  disabled={!canComplete && !victory.completed}
                  title={!canComplete && !victory.completed ? 'Só é possível realizar no próprio dia' : (victory.completed ? 'Reabrir' : 'Registrar vitória')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: victory.completed ? '#34d399' : '#fbbf24',
                    cursor: (!canComplete && !victory.completed) ? 'not-allowed' : 'pointer',
                    padding: '2px',
                    marginTop: '1px',
                    opacity: (!canComplete && !victory.completed) ? 0.45 : 1,
                    flexShrink: 0
                  }}
                >
                  {victory.completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      color: '#64748b',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {idx + 1}/{MAX_DAILY_VICTORIES}
                    </span>
                    <span style={{
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      color: victory.completed ? '#94a3b8' : '#f8fafc',
                      textDecoration: victory.completed ? 'line-through' : 'none'
                    }}>
                      {victory.title}
                    </span>
                    <span style={{
                      fontSize: '0.68rem',
                      padding: '1px 7px',
                      borderRadius: '999px',
                      background: `${color}18`,
                      color,
                      border: `1px solid ${color}40`,
                      fontWeight: 700
                    }}>
                      {victory.category}
                    </span>
                  </div>
                  {victory.completed && victory.note && (
                    <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>
                      {victory.note}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {!victory.completed && (
                    <button
                      type="button"
                      onClick={() => openEdit(victory)}
                      title="Editar"
                      style={{
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.22)',
                        color: '#38bdf8',
                        cursor: 'pointer',
                        padding: '5px',
                        borderRadius: '8px'
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {victory.completed && canComplete && (
                    <button
                      type="button"
                      onClick={() => promptReopen(victory)}
                      title="Reabrir e estornar"
                      style={{
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.22)',
                        color: '#fbbf24',
                        cursor: 'pointer',
                        padding: '5px',
                        borderRadius: '8px'
                      }}
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => promptDelete(victory)}
                    title="Excluir"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: '5px',
                      borderRadius: '8px'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.color = '#f87171'; }}
                    onMouseOut={(e) => { e.currentTarget.style.color = '#64748b'; }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div
          className="modal-overlay"
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
          onClick={closeForm}
        >
          <div
            className="glass-panel modal-sheet"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '20px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 className="font-cinzel" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fbbf24', margin: 0 }}>
                {editing ? 'Editar vitória' : `Nova vitória — ${isToday ? 'hoje' : 'amanhã'}`}
              </h3>
              <button type="button" onClick={closeForm} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Título *</label>
                <input
                  autoFocus
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Finalizar petição da AGU"
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
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Categoria</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
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
                  {activeCategories.map(c => {
                    const name = typeof c === 'string' ? c : c.name;
                    return <option key={name} value={name}>{name}</option>;
                  })}
                </select>
              </div>
              {formError && <p style={{ margin: 0, color: '#f87171', fontSize: '0.8rem' }}>{formError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={closeForm}
                  style={{
                    padding: '9px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '9px 16px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    border: 'none',
                    color: '#000',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {editing ? 'Salvar' : 'Planejar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {completing && (
        <div
          className="modal-overlay"
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
          onClick={() => setCompleting(null)}
        >
          <div
            className="glass-panel modal-sheet"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: '20px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-cinzel" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#34d399', margin: '0 0 8px' }}>
              Registrar vitória
            </h3>
            <p style={{ color: '#cbd5e1', fontSize: '0.88rem', margin: '0 0 14px' }}>
              {completing.title}
            </p>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
              Anotação (opcional)
            </label>
            <textarea
              rows={4}
              value={completeNote}
              onChange={(e) => setCompleteNote(e.target.value)}
              placeholder="Como foi, o que aprendeu, o que ficou pendente..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                fontSize: '0.9rem',
                resize: 'vertical',
                marginBottom: '14px'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setCompleting(null)}
                style={{
                  padding: '9px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Conquistar (+{DAILY_VICTORY_REWARDS.xp} XP)
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        confirmVariant={confirmModal.confirmVariant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
