import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { getSaoPauloDateStr } from '../utils/timeUtils';
import {
  MAX_DAILY_VICTORIES,
  EXTENDED_MAX_DAILY_VICTORIES,
  DAILY_VICTORY_REWARDS,
  DAILY_VICTORY_TRIPLE_BONUS,
  formatDailyVictoryDate,
  getPlannableDates,
  summarizeDay,
  displayHomeostasisVictoryTitle,
  DAY_OUTCOME_META,
  monthKeyFromDate,
  shiftMonthKey,
  buildMonthCalendar
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
  onDeleteVictory,
  studyFloorMinutes = null,
  readingFloorMinutes = null
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
    ? Math.round((summary.completedCount / Math.max(summary.displayCap || MAX_DAILY_VICTORIES, 1)) * 100)
    : 0;

  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState(defaultCatName);
  const [formError, setFormError] = useState('');
  const [editing, setEditing] = useState(null);

  const [completing, setCompleting] = useState(null);
  const [completeNote, setCompleteNote] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => monthKeyFromDate(todayStr));
  const [historyDate, setHistoryDate] = useState(todayStr);

  useEffect(() => {
    if (!showCalendar) {
      setCalendarMonth(monthKeyFromDate(todayStr));
      setHistoryDate(todayStr);
    }
  }, [todayStr, showCalendar]);

  const calendar = useMemo(
    () => buildMonthCalendar(dailyVictories, dailyVictoryBonuses, calendarMonth, todayStr),
    [dailyVictories, dailyVictoryBonuses, calendarMonth, todayStr]
  );
  const historySummary = useMemo(
    () => summarizeDay(dailyVictories, historyDate, dailyVictoryBonuses),
    [dailyVictories, historyDate, dailyVictoryBonuses]
  );
  const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const victoryTitle = (victory) => displayHomeostasisVictoryTitle(victory, {
    studyFloorMinutes,
    readingFloorMinutes
  });

  const selectHistoryDate = (date) => {
    setHistoryDate(date);
    if (date === dates.today || date === dates.tomorrow) {
      setSelectedDate(date);
    }
  };

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
                {summary.completedCount}/{summary.displayCap || MAX_DAILY_VICTORIES}
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
              Até 3 tarefas manuais; estudo e leitura pela homeostase podem ir a {EXTENDED_MAX_DAILY_VICTORIES}. +{DAILY_VICTORY_REWARDS.xp} XP e +{DAILY_VICTORY_REWARDS.coins} 🪙 cada
              {summary.plannedCount >= MAX_DAILY_VICTORIES ? ` · tríade +${DAILY_VICTORY_TRIPLE_BONUS.xp} XP` : ''}.
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
                  onClick={() => {
                    setSelectedDate(tab.key);
                    setHistoryDate(tab.key);
                  }}
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
            onClick={() => setShowCalendar(open => !open)}
            title={showCalendar ? 'Ocultar calendário' : 'Ver calendário do mês'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '10px',
              border: showCalendar ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              background: showCalendar ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255,255,255,0.05)',
              color: showCalendar ? '#fbbf24' : '#cbd5e1',
              fontWeight: 800,
              fontSize: '0.8rem'
            }}
          >
            <Calendar size={15} />
            Histórico
            {showCalendar ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            type="button"
            onClick={openCreate}
            disabled={!summary.canAdd}
            title={summary.canAdd ? 'Adicionar vitória' : 'Limite de 3 vitórias manuais neste dia. Estudo e leitura ainda podem ser adicionados pela homeostase.'}
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

      {showCalendar && (
        <div
          style={{
            marginBottom: '14px',
            padding: '14px',
            borderRadius: '14px',
            background: 'rgba(8, 10, 18, 0.55)',
            border: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={() => setCalendarMonth(prev => shiftMonthKey(prev, -1))}
              title="Mês anterior"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#e2e8f0',
                borderRadius: '8px',
                width: '34px',
                height: '34px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <div className="font-cinzel" style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc' }}>
                {calendar.label}
              </div>
              {calendarMonth !== monthKeyFromDate(todayStr) && (
                <button
                  type="button"
                  onClick={() => setCalendarMonth(monthKeyFromDate(todayStr))}
                  style={{
                    marginTop: '2px',
                    background: 'none',
                    border: 'none',
                    color: '#fbbf24',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Voltar ao mês atual
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCalendarMonth(prev => shiftMonthKey(prev, 1))}
              title="Próximo mês"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#e2e8f0',
                borderRadius: '8px',
                width: '34px',
                height: '34px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
            {weekdayLabels.map(label => (
              <div key={label} style={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.04em' }}>
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px' }}>
            {calendar.weeks.flat().map(cell => {
              if (cell.empty) {
                return <div key={cell.key} />;
              }
              const meta = DAY_OUTCOME_META[cell.outcome] || DAY_OUTCOME_META.unplanned;
              const muted = cell.isFuture && cell.outcome === 'unplanned';
              const selected = historyDate === cell.date;
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => selectHistoryDate(cell.date)}
                  title={`${formatDailyVictoryDate(cell.date)} — ${meta.label}${cell.summary.plannedCount ? ` (${cell.summary.completedCount}/${cell.summary.plannedCount})` : ''}`}
                  style={{
                    minHeight: '42px',
                    borderRadius: '10px',
                    padding: '6px 4px 5px',
                    background: muted ? 'rgba(255,255,255,0.03)' : meta.bg,
                    border: selected
                      ? '1px solid #fbbf24'
                      : cell.isToday
                        ? '1px solid rgba(251, 191, 36, 0.55)'
                        : `1px solid ${muted ? 'rgba(255,255,255,0.05)' : meta.border}`,
                    color: muted ? '#475569' : meta.color,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px',
                    boxShadow: selected ? '0 0 0 1px rgba(251, 191, 36, 0.55)' : 'none',
                    cursor: 'pointer',
                    width: '100%',
                    font: 'inherit',
                    appearance: 'none'
                  }}
                >
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, lineHeight: 1 }}>{cell.day}</span>
                  {!muted && (
                    <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1, textAlign: 'center' }}>
                      {cell.summary.plannedCount > 0 ? `${cell.summary.completedCount}/${cell.summary.plannedCount}` : '—'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', marginTop: '12px' }}>
            {Object.values(DAY_OUTCOME_META).map(meta => (
              <div key={meta.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#cbd5e1' }}>
                <span style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '999px',
                  background: meta.color,
                  boxShadow: `0 0 8px ${meta.color}88`,
                  flexShrink: 0
                }} />
                <span style={{ fontWeight: 700, color: meta.color }}>{meta.label}</span>
                <span style={{ color: '#64748b' }}>{meta.description}</span>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: '14px',
            padding: '12px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${(historySummary.outcomeMeta || DAY_OUTCOME_META.unplanned).border}`
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: historySummary.items.length ? '10px' : 0 }}>
              <div>
                <div className="font-cinzel" style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f8fafc' }}>
                  {formatDailyVictoryDate(historyDate)}
                  {historyDate === dates.today ? ' · Hoje' : historyDate === dates.tomorrow ? ' · Amanhã' : ''}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                  {historySummary.plannedCount > 0
                    ? `${historySummary.completedCount} feitas · ${historySummary.plannedCount - historySummary.completedCount} não feitas`
                    : 'Nenhuma vitória cadastrada neste dia'}
                </div>
              </div>
              <span style={{
                fontSize: '0.7rem',
                padding: '3px 8px',
                borderRadius: '999px',
                fontWeight: 800,
                background: (historySummary.outcomeMeta || DAY_OUTCOME_META.unplanned).bg,
                color: (historySummary.outcomeMeta || DAY_OUTCOME_META.unplanned).color,
                border: `1px solid ${(historySummary.outcomeMeta || DAY_OUTCOME_META.unplanned).border}`
              }}>
                {(historySummary.outcomeMeta || DAY_OUTCOME_META.unplanned).label}
                {historySummary.plannedCount > 0 ? ` · ${historySummary.completedCount}/${historySummary.plannedCount}` : ''}
              </span>
            </div>

            {historySummary.items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { key: 'done', label: 'Feitas', items: historySummary.items.filter(item => item.completed) },
                  { key: 'pending', label: 'Não feitas', items: historySummary.items.filter(item => !item.completed) }
                ].map(group => (
                  <div key={group.key}>
                    <div style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: group.key === 'done' ? '#34d399' : '#f87171',
                      marginBottom: '6px'
                    }}>
                      {group.label} ({group.items.length})
                    </div>
                    {group.items.length === 0 ? (
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                        {group.key === 'done' ? 'Nenhuma vitória foi concluída neste dia.' : 'Todas as vitórias planejadas foram feitas.'}
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {group.items.map(victory => {
                          const color = categoryColor(victory.category, activeCategories);
                          return (
                            <div
                              key={victory.id}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px',
                                padding: '8px 10px',
                                borderRadius: '10px',
                                background: victory.completed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(248, 113, 113, 0.08)',
                                border: `1px solid ${victory.completed ? 'rgba(16, 185, 129, 0.22)' : 'rgba(248, 113, 113, 0.22)'}`
                              }}
                            >
                              <span style={{ color: victory.completed ? '#34d399' : '#f87171', flexShrink: 0, marginTop: 1 }}>
                                {victory.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                              </span>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                                  <span style={{
                                    fontSize: '0.84rem',
                                    fontWeight: 700,
                                    color: victory.completed ? '#94a3b8' : '#f8fafc',
                                    textDecoration: victory.completed ? 'line-through' : 'none'
                                  }}>
                                    {victoryTitle(victory)}
                                  </span>
                                  <span style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
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
                                  <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>
                                    {victory.note}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
            Cadastre até 3 tarefas independentes das missões. Concluir as três dispara um bônus. Estudo e leitura pela homeostase podem ir além.
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
                      {idx + 1}/{summary.displayCap || MAX_DAILY_VICTORIES}
                    </span>
                    <span style={{
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      color: victory.completed ? '#94a3b8' : '#f8fafc',
                      textDecoration: victory.completed ? 'line-through' : 'none'
                    }}>
                      {victoryTitle(victory)}
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

      {showForm && typeof document !== 'undefined' && createPortal(
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
        </div>,
        document.body
      )}

      {completing && typeof document !== 'undefined' && createPortal(
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
              {victoryTitle(completing)}
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
        </div>,
        document.body
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
