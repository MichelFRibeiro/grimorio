import React, { useState, useEffect } from 'react';
import {
  Plus,
  Flame,
  CheckCircle2,
  Circle,
  Trophy,
  Trash2,
  Calendar,
  CalendarDays,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Edit3,
  Tag,
  Target,
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  RotateCcw,
  Clock,
  EyeOff
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { ActivityContextFields } from './ActivityContextFields';
import { ActivityScaleFields, PriorityBadge } from './ActivityScaleFields';
import { getSaoPauloDateStr, getHabitWeeklyStats, getCurrentWeekDays, addDaysToDateStr } from '../utils/timeUtils';
import { defaultLocationForCategory, fieldsToTimeWindow, getLocationMeta, windowToFields } from '../utils/locations';
import { DEFAULT_DIFFICULTY, DEFAULT_PRIORITY, inferDifficultyFromRewards, normalizeDifficulty, normalizePriority } from '../utils/activityScale';
import { getFrequencyLabel, getHabitPeriodStatus, isPeriodFrequency, padMonthDay } from '../utils/habitFrequency';

const HIDE_SETTLED_STORAGE_KEY = 'grimorio_hide_settled_habits';
const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

function MonthDaySelect({ value, onChange, accent = '#ef4444' }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      style={{
        flex: 1,
        padding: '10px 12px',
        borderRadius: '10px',
        background: '#1a2030',
        border: `1px solid ${accent}55`,
        color: '#fff',
        fontSize: '0.95rem',
        fontWeight: 800,
        fontFamily: 'var(--font-mono)',
        textAlign: 'center'
      }}
    >
      {MONTH_DAY_OPTIONS.map(day => (
        <option key={day} value={day}>{padMonthDay(day)}</option>
      ))}
    </select>
  );
}

function FrequencyDayFields({
  frequency,
  fortnightDayA,
  fortnightDayB,
  monthDay,
  onFortnightDayAChange,
  onFortnightDayBChange,
  onMonthDayChange,
  accent = '#ef4444',
  accentSoft = 'rgba(239, 68, 68, 0.08)',
  accentBorder = 'rgba(239, 68, 68, 0.25)'
}) {
  if (frequency !== 'fortnightly' && frequency !== 'monthly') return null;

  return (
    <div
      style={{
        padding: '12px',
        borderRadius: '10px',
        background: accentSoft,
        border: `1px solid ${accentBorder}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
    >
      {frequency === 'fortnightly' ? (
        <>
          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: accent }}>
            Dias do mês em que o ritual fica pendente:
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MonthDaySelect value={fortnightDayA} onChange={onFortnightDayAChange} accent={accent} />
            <span style={{ color: '#94a3b8', fontWeight: 800 }}>e</span>
            <MonthDaySelect value={fortnightDayB} onChange={onFortnightDayBChange} accent={accent} />
          </div>
          <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
            A cada quinzena o ritual passa a ficar pendente nos dias {padMonthDay(fortnightDayA)} e {padMonthDay(fortnightDayB)}, até ser concluído.
          </p>
        </>
      ) : (
        <>
          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: accent }}>
            Dia previsto do mês:
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MonthDaySelect value={monthDay} onChange={onMonthDayChange} accent={accent} />
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 700 }}>
              Todo dia {padMonthDay(monthDay)}
            </span>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
            O ritual fica pendente a partir do dia {padMonthDay(monthDay)} de cada mês, até ser concluído.
          </p>
        </>
      )}
    </div>
  );
}

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
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState(defaultCatName);
  const [newFrequency, setNewFrequency] = useState('daily');
  const [newTimesPerWeek, setNewTimesPerWeek] = useState(3);
  const [newFortnightDayA, setNewFortnightDayA] = useState(1);
  const [newFortnightDayB, setNewFortnightDayB] = useState(16);
  const [newMonthDay, setNewMonthDay] = useState(1);
  const [newPriority, setNewPriority] = useState(DEFAULT_PRIORITY);
  const [newDifficulty, setNewDifficulty] = useState(DEFAULT_DIFFICULTY);
  const [newLocation, setNewLocation] = useState(defaultLocationForCategory(defaultCatName, activeCategories));
  const [newWindowStart, setNewWindowStart] = useState('');
  const [newWindowEnd, setNewWindowEnd] = useState('');

  // Sync newCategory with activeCategories
  useEffect(() => {
    const validNames = activeCategories.map(c => typeof c === 'string' ? c : c.name);
    if (validNames.length > 0 && !validNames.includes(newCategory)) {
      setNewCategory(validNames[0]);
    }
  }, [activeCategories, newCategory]);

  // Edit Habit State
  const [editingHabit, setEditingHabit] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState(defaultCatName);
  const [editFrequency, setEditFrequency] = useState('daily');
  const [editTimesPerWeek, setEditTimesPerWeek] = useState(3);
  const [editFortnightDayA, setEditFortnightDayA] = useState(1);
  const [editFortnightDayB, setEditFortnightDayB] = useState(16);
  const [editMonthDay, setEditMonthDay] = useState(1);
  const [editPriority, setEditPriority] = useState(DEFAULT_PRIORITY);
  const [editDifficulty, setEditDifficulty] = useState(DEFAULT_DIFFICULTY);
  const [editLocation, setEditLocation] = useState('anywhere');
  const [editWindowStart, setEditWindowStart] = useState('');
  const [editWindowEnd, setEditWindowEnd] = useState('');

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

  const todayStr = getSaoPauloDateStr();
  const yesterdayStr = addDaysToDateStr(todayStr, -1);
  const dayBeforeYesterdayStr = addDaysToDateStr(todayStr, -2);

  // Week View & Retroactive Completion State
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [hideSettledHabits, setHideSettledHabits] = useState(() => {
    try {
      return localStorage.getItem(HIDE_SETTLED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [retroModalHabit, setRetroModalHabit] = useState(null);
  const [customRetroDate, setCustomRetroDate] = useState(yesterdayStr);

  useEffect(() => {
    try {
      localStorage.setItem(HIDE_SETTLED_STORAGE_KEY, hideSettledHabits ? 'true' : 'false');
    } catch {
      // ignore storage errors (private mode)
    }
  }, [hideSettledHabits]);

  // Format date helper (YYYY-MM-DD -> DD/MM)
  const formatShortDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}`;
  };

  const categoryNames = ['Todas', ...activeCategories.map(c => typeof c === 'string' ? c : c.name)];

  const isHabitSettled = (habit) => {
    if (isPeriodFrequency(habit.frequency)) {
      return !getHabitPeriodStatus(habit, todayStr)?.due;
    }
    const isDoneToday = (habit.history || []).includes(todayStr);
    const targetRefDate = addDaysToDateStr(todayStr, weekOffset * 7);
    const weeklyStats = getHabitWeeklyStats(habit, targetRefDate);
    // Feito hoje (rituais diários) ou meta da semana já atingida (semanal / Nx).
    return isDoneToday || weeklyStats.isGoalMet;
  };

  const categoryFilteredHabits = (habits || []).filter(h => {
    if (selectedCategory === 'Todas') return true;
    return (h.category || 'Pessoal') === selectedCategory;
  });

  const filteredHabits = hideSettledHabits
    ? categoryFilteredHabits.filter(h => !isHabitSettled(h))
    : categoryFilteredHabits;

  const hiddenSettledCount = hideSettledHabits
    ? categoryFilteredHabits.length - filteredHabits.length
    : 0;

  const handleCreateHabit = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    onAddHabit({
      title: newTitle.trim(),
      description: newDesc.trim(),
      category: newCategory,
      frequency: newFrequency,
      targetTimesPerWeek: newFrequency === 'times_per_week' ? (parseInt(newTimesPerWeek, 10) || 3) : undefined,
      monthDays: newFrequency === 'fortnightly'
        ? [newFortnightDayA, newFortnightDayB]
        : newFrequency === 'monthly'
          ? [newMonthDay]
          : undefined,
      priority: newPriority,
      difficulty: newDifficulty,
      location: newLocation,
      timeWindow: fieldsToTimeWindow(newWindowStart, newWindowEnd)
    });

    setNewTitle('');
    setNewDesc('');
    setNewFrequency('daily');
    setNewTimesPerWeek(3);
    setNewFortnightDayA(1);
    setNewFortnightDayB(16);
    setNewMonthDay(1);
    setNewPriority(DEFAULT_PRIORITY);
    setNewDifficulty(DEFAULT_DIFFICULTY);
    setNewLocation(defaultLocationForCategory(newCategory, activeCategories));
    setNewWindowStart('');
    setNewWindowEnd('');
    setShowAddModal(false);
  };

  const handleOpenEditHabit = (habit) => {
    setEditingHabit(habit);
    setEditTitle(habit.title || '');
    setEditDesc(habit.description || '');
    setEditCategory(habit.category || defaultCatName);
    setEditFrequency(habit.frequency || 'daily');
    setEditTimesPerWeek(habit.targetTimesPerWeek || habit.timesPerWeek || 3);
    const scheduledDays = Array.isArray(habit.monthDays) ? habit.monthDays : [];
    setEditFortnightDayA(scheduledDays[0] || 1);
    setEditFortnightDayB(scheduledDays[1] || 16);
    setEditMonthDay(scheduledDays[0] || habit.monthDay || 1);
    setEditPriority(normalizePriority(habit.priority));
    setEditDifficulty(habit.difficulty
      ? normalizeDifficulty(habit.difficulty)
      : inferDifficultyFromRewards(habit.xpReward));
    setEditLocation(habit.location || defaultLocationForCategory(habit.category || defaultCatName, activeCategories));
    const win = windowToFields(habit.timeWindow);
    setEditWindowStart(win.start);
    setEditWindowEnd(win.end);
  };

  const handleSaveEditHabit = (e) => {
    e.preventDefault();
    if (!editingHabit || !editTitle.trim()) return;

    if (onUpdateHabit) {
      onUpdateHabit(editingHabit.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        category: editCategory,
        frequency: editFrequency,
        targetTimesPerWeek: editFrequency === 'times_per_week' ? (parseInt(editTimesPerWeek, 10) || 3) : undefined,
        monthDays: editFrequency === 'fortnightly'
          ? [editFortnightDayA, editFortnightDayB]
          : editFrequency === 'monthly'
            ? [editMonthDay]
            : null,
        priority: editPriority,
        difficulty: editDifficulty,
        location: editLocation,
        timeWindow: fieldsToTimeWindow(editWindowStart, editWindowEnd)
      });
    }

    setEditingHabit(null);
  };

  return (
    <div>
      {/* Header & Week Navigation Control */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🔥</span> Rituais Diários (Hábitos & Streaks)
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Mantenha a chama da disciplina acesa! Marque hábitos diários e datas passadas para manter suas sequências.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Week Selector Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <button
              onClick={() => setWeekOffset(prev => prev - 1)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s ease'
              }}
              title="Semana anterior"
              onMouseOver={e => e.currentTarget.style.color = '#fff'}
              onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: weekOffset === 0 ? '#38bdf8' : '#fbbf24', padding: '0 4px', minWidth: '115px', textAlign: 'center' }}>
              {weekOffset === 0 ? 'Esta Semana' : weekOffset === -1 ? 'Semana Passada' : `Há ${Math.abs(weekOffset)} Semanas`}
            </span>

            <button
              onClick={() => setWeekOffset(prev => Math.min(0, prev + 1))}
              disabled={weekOffset === 0}
              style={{
                background: 'transparent',
                border: 'none',
                color: weekOffset === 0 ? 'rgba(255,255,255,0.15)' : '#94a3b8',
                cursor: weekOffset === 0 ? 'not-allowed' : 'pointer',
                padding: '4px 6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s ease'
              }}
              title={weekOffset === 0 ? 'Semana atual' : 'Próxima semana'}
              onMouseOver={e => { if (weekOffset < 0) e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e => { if (weekOffset < 0) e.currentTarget.style.color = '#94a3b8'; }}
            >
              <ChevronRight size={16} />
            </button>

            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: '#38bdf8',
                  cursor: 'pointer',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Voltar para a semana atual"
              >
                <RotateCcw size={11} /> Hoje
              </button>
            )}
          </div>

          <button
            onClick={() => {
              setNewCategory(defaultCatName);
              setNewDesc('');
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
      </div>

      {/* Category Filter Bar — same pattern as QuestsView */}
      <div className="glass-panel" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {categoryNames.map(catName => {
            const isAll = catName === 'Todas';
            const catRanking = !isAll ? rankings?.categories?.[catName] : null;
            const rankTier = catRanking?.currentRank;

            return (
              <button
                key={catName}
                onClick={() => setSelectedCategory(catName)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: selectedCategory === catName ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: selectedCategory === catName ? '#f87171' : '#94a3b8',
                  border: selectedCategory === catName ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid transparent'
                }}
              >
                <span>{catName}</span>
                {rankTier && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 900,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: rankTier.bg,
                      color: rankTier.textColor,
                      border: `1px solid ${rankTier.border}`,
                      lineHeight: 1.15
                    }}
                    title={`Ranking semanal: Tier ${rankTier.name} (${rankTier.title}) • ${catRanking.weeklyXp} XP nesta semana`}
                  >
                    {rankTier.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={hideSettledHabits}
          aria-label="Ocultar hábitos já realizados hoje ou com meta semanal atingida"
          title="Oculta rituais já feitos hoje e os que já bateram a meta da semana visível"
          onClick={() => setHideSettledHabits(prev => !prev)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            userSelect: 'none',
            padding: '6px 10px',
            borderRadius: '10px',
            background: hideSettledHabits ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.04)',
            border: hideSettledHabits ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
            color: 'inherit',
            font: 'inherit',
            flexShrink: 0
          }}
        >
          <EyeOff size={14} color={hideSettledHabits ? '#f87171' : '#64748b'} />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: hideSettledHabits ? '#f87171' : '#94a3b8', whiteSpace: 'nowrap' }}>
            Ocultar feitos
            {hideSettledHabits && hiddenSettledCount > 0 ? ` (${hiddenSettledCount})` : ''}
          </span>
          <span
            aria-hidden="true"
            style={{
              position: 'relative',
              width: '36px',
              height: '20px',
              borderRadius: '999px',
              background: hideSettledHabits ? '#ef4444' : 'rgba(255, 255, 255, 0.18)',
              transition: 'background 0.18s ease',
              flexShrink: 0
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '2px',
                left: hideSettledHabits ? '18px' : '2px',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.35)',
                transition: 'left 0.18s ease'
              }}
            />
          </span>
        </button>
      </div>

      {/* Habits List */}
      {(!habits || habits.length === 0) ? (
        <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
          <Flame size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhum ritual diário configurado.</p>
          <p style={{ fontSize: '0.85rem' }}>Adicione rituais como "Leitura matinal" ou "Revisão de processos" para ganhar consistência!</p>
        </div>
      ) : filteredHabits.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
          {hideSettledHabits && hiddenSettledCount > 0 ? (
            <>
              <EyeOff size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <p style={{ fontSize: '1rem', fontWeight: 600 }}>Todos os rituais visíveis já foram feitos.</p>
              <p style={{ fontSize: '0.85rem' }}>
                {hiddenSettledCount} {hiddenSettledCount === 1 ? 'ritual está oculto' : 'rituais estão ocultos'} (feitos hoje ou com meta semanal atingida).
              </p>
              <button
                type="button"
                onClick={() => setHideSettledHabits(false)}
                style={{
                  marginTop: '14px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#f87171',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Mostrar todos
              </button>
            </>
          ) : (
            <>
              <Flame size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhum ritual nesta categoria.</p>
              <p style={{ fontSize: '0.85rem' }}>Selecione outra categoria ou cadastre um novo ritual.</p>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '16px' }}>
          {filteredHabits.map(habit => {
            const isDoneToday = (habit.history || []).includes(todayStr);
            const periodStats = isPeriodFrequency(habit.frequency)
              ? getHabitPeriodStatus(habit, todayStr)
              : null;
            const isCycleDone = periodStats ? !periodStats.due : isDoneToday;
            const streak = habit.currentStreak || 0;
            const multiplier = Math.min(2.0, 1 + streak * 0.1).toFixed(1);
            const habitCat = habit.category || 'Pessoal';
            const catInfo = activeCategories.find(c => (typeof c === 'string' ? c : c.name) === habitCat);
            const catColor = (catInfo && typeof catInfo === 'object' && catInfo.color) ? catInfo.color : '#f59e0b';
            const catRanking = rankings?.categories?.[habitCat];

            // Weekly Stats based on active weekOffset
            const targetRefDate = addDaysToDateStr(todayStr, weekOffset * 7);
            const weeklyStats = getHabitWeeklyStats(habit, targetRefDate);

            const locationMeta = habit.location && habit.location !== 'anywhere'
              ? getLocationMeta(habit.location)
              : null;
            const hasTimeWindow = Boolean(habit.timeWindow?.start && habit.timeWindow?.end);
            const metaChipStyle = {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '999px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#94a3b8',
              whiteSpace: 'nowrap',
              lineHeight: 1.2
            };
            const iconBtnStyle = {
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            };

            return (
              <div
                key={habit.id}
                className="rpg-card"
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                  minWidth: 0,
                  overflow: 'hidden',
                  borderLeft: isCycleDone ? '4px solid #10b981' : '4px solid #ef4444',
                  background: isCycleDone ? 'rgba(16, 185, 129, 0.04)' : '#131722'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: `${catColor}18`,
                            color: catColor,
                            border: `1px solid ${catColor}40`,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            maxWidth: '100%',
                            minWidth: 0
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{habitCat}</span>
                          {catRanking && (
                            <span
                              style={{
                                fontSize: '0.62rem',
                                fontWeight: 900,
                                padding: '0 4px',
                                borderRadius: '3px',
                                background: catRanking.currentRank.bg,
                                color: catRanking.currentRank.textColor,
                                border: `1px solid ${catRanking.currentRank.border}`,
                                flexShrink: 0
                              }}
                            >
                              {catRanking.currentRank.name}
                            </span>
                          )}
                        </span>
                        <PriorityBadge priority={habit.priority} compact />
                      </div>
                      <h3 style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: '#f8fafc',
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {habit.title}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setCustomRetroDate(yesterdayStr);
                          setRetroModalHabit(habit);
                        }}
                        style={iconBtnStyle}
                        onMouseOver={(e) => e.currentTarget.style.color = '#fbbf24'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                        title="Marcar datas passadas / Histórico retroativo"
                      >
                        <CalendarDays size={15} />
                      </button>

                      <button
                        onClick={() => handleOpenEditHabit(habit)}
                        style={iconBtnStyle}
                        onMouseOver={(e) => e.currentTarget.style.color = '#38bdf8'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                        title="Editar ritual"
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        onClick={() => promptDeleteHabit(habit)}
                        style={iconBtnStyle}
                        onMouseOver={(e) => e.currentTarget.style.color = '#f87171'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                        title="Excluir ritual"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {habit.description && (
                    <p style={{
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      marginBottom: '10px',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {habit.description}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    <span style={{ ...metaChipStyle, color: '#fbbf24' }}>
                      <Sparkles size={12} color="#f59e0b" /> +{habit.xpReward} XP
                    </span>
                    <span style={{ ...metaChipStyle, color: '#fbbf24' }}>
                      +{habit.coinReward} 🪙
                    </span>
                    <span style={{ ...metaChipStyle, color: '#38bdf8' }}>
                      {getFrequencyLabel(habit)}
                    </span>
                    {locationMeta && (
                      <span style={metaChipStyle} title={locationMeta.label}>
                        {locationMeta.emoji} {locationMeta.short}
                      </span>
                    )}
                    {hasTimeWindow && (
                      <span style={metaChipStyle} title={`${habit.timeWindow.start}–${habit.timeWindow.end}`}>
                        <Clock size={12} /> {habit.timeWindow.start}–{habit.timeWindow.end}
                      </span>
                    )}
                  </div>

                  {/* Weekly Progress Tracker */}
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.78rem', minWidth: 0 }}>
                      <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <Target size={13} color={(periodStats ? periodStats.completed : weeklyStats.isGoalMet) ? '#10b981' : '#38bdf8'} />
                        <span>{periodStats ? (periodStats.frequency === 'monthly' ? 'Mês' : 'Quinzena') : 'Semana'}</span>
                        <strong style={{ color: (periodStats ? periodStats.completed : weeklyStats.isGoalMet) ? '#34d399' : '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                          {periodStats
                            ? `${periodStats.completed ? 1 : 0}/1`
                            : `${weeklyStats.completionsThisWeek}/${weeklyStats.targetTimesPerWeek}`}
                        </strong>
                      </span>
                      {(periodStats ? periodStats.completed : weeklyStats.isGoalMet) ? (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            color: '#34d399',
                            background: 'rgba(16, 185, 129, 0.15)',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            border: '1px solid rgba(16, 185, 129, 0.35)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            flexShrink: 0,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <Check size={11} /> Meta ok
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: '#64748b', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {periodStats
                            ? (periodStats.due
                              ? `Pendente desde ${formatShortDate(periodStats.start)}`
                              : `Próximo: ${formatShortDate(periodStats.nextStart)}`)
                            : `Faltam ${Math.max(0, weeklyStats.targetTimesPerWeek - weeklyStats.completionsThisWeek)}x`}
                        </span>
                      )}
                    </div>

                    {/* 7 Days Interactive Tracker (Seg a Dom - Clicável para marcar dias passados e hoje) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                      {weeklyStats.completedDays.map(day => {
                        const isClickable = !day.isFuture;
                        const tooltipText = day.isFuture
                          ? `Dia futuro (${day.dateStr})`
                          : `${day.completed ? 'Desmarcar' : 'Marcar'} ${day.label} (${formatShortDate(day.dateStr)})${day.isToday ? ' - Hoje' : day.dateStr === yesterdayStr ? ' - Ontem' : ''}`;

                        return (
                          <button
                            key={day.dateStr}
                            type="button"
                            disabled={!isClickable}
                            onClick={() => {
                              if (isClickable) {
                                onToggleHabit(habit.id, day.dateStr);
                              }
                            }}
                            title={tooltipText}
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              padding: '5px 2px',
                              borderRadius: '7px',
                              background: day.completed
                                ? 'rgba(16, 185, 129, 0.22)'
                                : day.isToday
                                  ? 'rgba(56, 189, 248, 0.12)'
                                  : 'rgba(255, 255, 255, 0.03)',
                              border: day.completed
                                ? '1px solid rgba(16, 185, 129, 0.55)'
                                : day.isToday
                                  ? '1px solid rgba(56, 189, 248, 0.5)'
                                  : '1px solid rgba(255, 255, 255, 0.07)',
                              color: day.completed ? '#34d399' : day.isToday ? '#38bdf8' : day.isFuture ? '#475569' : '#94a3b8',
                              fontSize: '0.68rem',
                              fontWeight: day.completed || day.isToday ? 800 : 500,
                              cursor: isClickable ? 'pointer' : 'not-allowed',
                              opacity: day.isFuture ? 0.4 : 1,
                              transition: 'all 0.15s ease',
                              outline: 'none'
                            }}
                            onMouseOver={(e) => {
                              if (isClickable && !day.completed) {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                                e.currentTarget.style.transform = 'scale(1.04)';
                              }
                            }}
                            onMouseOut={(e) => {
                              if (isClickable && !day.completed) {
                                e.currentTarget.style.background = day.isToday ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)';
                                e.currentTarget.style.borderColor = day.isToday ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.07)';
                                e.currentTarget.style.transform = 'scale(1)';
                              }
                            }}
                          >
                            <span>{day.shortName}</span>
                            <div
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                marginTop: '3px',
                                background: day.completed
                                  ? '#10b981'
                                  : day.isToday
                                    ? '#38bdf8'
                                    : day.isFuture
                                      ? 'rgba(255, 255, 255, 0.08)'
                                      : 'rgba(255, 255, 255, 0.2)'
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Streak & Completion Trigger */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Flame size={18} color={streak > 0 ? '#ef4444' : '#64748b'} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 900, color: streak > 0 ? '#f87171' : '#64748b', fontFamily: 'var(--font-mono)' }}>
                      {streak} {streak === 1 ? 'dia' : 'dias'}
                    </span>
                    {streak > 1 && (
                      <span style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: 700 }}>
                        · x{multiplier}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomRetroDate(yesterdayStr);
                        setRetroModalHabit(habit);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        padding: '8px 8px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#94a3b8',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        minWidth: 0
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.color = '#fbbf24';
                        e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.4)';
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.color = '#94a3b8';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                      }}
                      title="Marcar ontem ou datas passadas"
                    >
                      <Calendar size={13} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Datas</span>
                    </button>

                    <button
                      onClick={() => onToggleHabit(habit.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 8px',
                        borderRadius: '10px',
                        background: isDoneToday
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.2) 100%)',
                        border: isDoneToday ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                        color: isDoneToday ? '#34d399' : '#f87171',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        minWidth: 0
                      }}
                    >
                      {isDoneToday ? (
                        <>
                          <CheckCircle2 size={15} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Feito hoje</span>
                        </>
                      ) : (
                        <>
                          <Circle size={15} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Marcar hoje</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Novo Ritual */}
      {showAddModal && (
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
        >
          <div
            className="glass-panel modal-sheet"
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
                  Descrição / Notas
                </label>
                <textarea
                  placeholder="Detalhes adicionais do ritual..."
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Categoria *
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => {
                    const next = e.target.value;
                    setNewCategory(next);
                    setNewLocation(defaultLocationForCategory(next, activeCategories));
                  }}
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
                  <option value="weekdays">Dias de semana (Seg-Sex - 5x/sem)</option>
                  <option value="times_per_week">N vezes por semana (Personalizado)</option>
                  <option value="weekly">1 vez por semana (Semanal)</option>
                  <option value="fortnightly">01 vez por quinzena</option>
                  <option value="monthly">01 vez por mês</option>
                </select>
              </div>

              <FrequencyDayFields
                frequency={newFrequency}
                fortnightDayA={newFortnightDayA}
                fortnightDayB={newFortnightDayB}
                monthDay={newMonthDay}
                onFortnightDayAChange={setNewFortnightDayA}
                onFortnightDayBChange={setNewFortnightDayB}
                onMonthDayChange={setNewMonthDay}
              />

              {/* N vezes por semana - seletor */}
              {newFrequency === 'times_per_week' && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f87171' }}>
                      Meta semanal de execuções:
                    </label>
                    <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>
                      {newTimesPerWeek}x / semana
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1, 2, 3, 4, 5, 6, 7].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNewTimesPerWeek(n)}
                        style={{
                          flex: 1,
                          padding: '7px 0',
                          borderRadius: '8px',
                          background: newTimesPerWeek === n
                            ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                            : 'rgba(255, 255, 255, 0.05)',
                          border: newTimesPerWeek === n
                            ? '1px solid #ef4444'
                            : '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
                    O ritual terá como meta ser realizado {newTimesPerWeek} {newTimesPerWeek === 1 ? 'vez' : 'vezes'} entre Segunda e Domingo.
                  </p>
                </div>
              )}

              <ActivityContextFields
                location={newLocation}
                timeWindowStart={newWindowStart}
                timeWindowEnd={newWindowEnd}
                onLocationChange={setNewLocation}
                onWindowStartChange={setNewWindowStart}
                onWindowEndChange={setNewWindowEnd}
              />

              <ActivityScaleFields
                priority={newPriority}
                difficulty={newDifficulty}
                onPriorityChange={setNewPriority}
                onDifficultyChange={setNewDifficulty}
              />

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
        >
          <div
            className="glass-panel modal-sheet"
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
                  Descrição / Notas
                </label>
                <textarea
                  placeholder="Detalhes adicionais..."
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Categoria *
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEditCategory(next);
                    setEditLocation(defaultLocationForCategory(next, activeCategories));
                  }}
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
                  <option value="weekdays">Dias de semana (Seg-Sex - 5x/sem)</option>
                  <option value="times_per_week">N vezes por semana (Personalizado)</option>
                  <option value="weekly">1 vez por semana (Semanal)</option>
                  <option value="fortnightly">01 vez por quinzena</option>
                  <option value="monthly">01 vez por mês</option>
                </select>
              </div>

              <FrequencyDayFields
                frequency={editFrequency}
                fortnightDayA={editFortnightDayA}
                fortnightDayB={editFortnightDayB}
                monthDay={editMonthDay}
                onFortnightDayAChange={setEditFortnightDayA}
                onFortnightDayBChange={setEditFortnightDayB}
                onMonthDayChange={setEditMonthDay}
                accent="#38bdf8"
                accentSoft="rgba(56, 189, 248, 0.08)"
                accentBorder="rgba(56, 189, 248, 0.25)"
              />

              {/* N vezes por semana - seletor em Edição */}
              {editFrequency === 'times_per_week' && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8' }}>
                      Meta semanal de execuções:
                    </label>
                    <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#fff' }}>
                      {editTimesPerWeek}x / semana
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1, 2, 3, 4, 5, 6, 7].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setEditTimesPerWeek(n)}
                        style={{
                          flex: 1,
                          padding: '7px 0',
                          borderRadius: '8px',
                          background: editTimesPerWeek === n
                            ? 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)'
                            : 'rgba(255, 255, 255, 0.05)',
                          border: editTimesPerWeek === n
                            ? '1px solid #38bdf8'
                            : '1px solid rgba(255, 255, 255, 0.1)',
                          color: editTimesPerWeek === n ? '#0f172a' : '#fff',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
                    O ritual terá como meta ser realizado {editTimesPerWeek} {editTimesPerWeek === 1 ? 'vez' : 'vezes'} entre Segunda e Domingo.
                  </p>
                </div>
              )}

              <ActivityContextFields
                location={editLocation}
                timeWindowStart={editWindowStart}
                timeWindowEnd={editWindowEnd}
                onLocationChange={setEditLocation}
                onWindowStartChange={setEditWindowStart}
                onWindowEndChange={setEditWindowEnd}
              />

              <ActivityScaleFields
                priority={editPriority}
                difficulty={editDifficulty}
                onPriorityChange={setEditPriority}
                onDifficultyChange={setEditDifficulty}
              />

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

      {/* Modal Conclusão Retroativa & Datas Passadas */}
      {retroModalHabit && (() => {
        const activeHabit = habits?.find(h => h.id === retroModalHabit.id) || retroModalHabit;
        const habitHistory = activeHabit.history || [];
        const isYesterdayDone = habitHistory.includes(yesterdayStr);
        const isAnteontemDone = habitHistory.includes(dayBeforeYesterdayStr);
        const isCustomDateDone = habitHistory.includes(customRetroDate);

        // Generate last 14 days for quick toggle grid
        const last14Days = Array.from({ length: 14 }, (_, i) => {
          const dStr = addDaysToDateStr(todayStr, -i);
          const parts = dStr.split('-');
          const isDone = habitHistory.includes(dStr);
          const isToday = dStr === todayStr;
          const isYesterday = dStr === yesterdayStr;
          const label = isToday ? 'Hoje' : isYesterday ? 'Ontem' : `${parts[2]}/${parts[1]}`;
          return { dateStr: dStr, label, shortDate: `${parts[2]}/${parts[1]}`, isDone, isToday, isYesterday };
        });

        return (
          <div
            className="modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.82)',
              backdropFilter: 'blur(8px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
            onClick={() => setRetroModalHabit(null)}
          >
            <div
              className="glass-panel modal-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '520px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '28px',
                border: '1px solid rgba(251, 191, 36, 0.35)',
                borderRadius: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📅</span> Conclusão Retroativa
                  </h3>
                  <p style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.95rem', marginTop: '4px' }}>
                    {activeHabit.title}
                  </p>
                  <p style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '2px' }}>
                    Esqueceu de marcar? Registre datas passadas para manter suas chamas acesas.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(239, 68, 68, 0.15)', padding: '4px 8px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <Flame size={14} color="#ef4444" />
                    <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#f87171', fontFamily: 'var(--font-mono)' }}>
                      {activeHabit.currentStreak || 0} {activeHabit.currentStreak === 1 ? 'dia' : 'dias'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: 700 }}>
                    Recorde: {activeHabit.bestStreak || 0}d 🏆
                  </span>
                </div>
              </div>

              {/* 1-Click Quick Buttons (Ontem e Anteontem) */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⚡ Atalhos Rápidos de 1 Clique
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {/* Ontem */}
                  <button
                    type="button"
                    onClick={() => onToggleHabit(activeHabit.id, yesterdayStr)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: isYesterdayDone
                        ? 'rgba(16, 185, 129, 0.18)'
                        : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.2) 100%)',
                      border: isYesterdayDone
                        ? '1px solid rgba(16, 185, 129, 0.5)'
                        : '1px solid rgba(239, 68, 68, 0.5)',
                      color: isYesterdayDone ? '#34d399' : '#f87171',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    {isYesterdayDone ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                    <span>{isYesterdayDone ? 'Ontem (Feito ✅)' : `Ontem (${formatShortDate(yesterdayStr)})`}</span>
                  </button>

                  {/* Anteontem */}
                  <button
                    type="button"
                    onClick={() => onToggleHabit(activeHabit.id, dayBeforeYesterdayStr)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: isAnteontemDone
                        ? 'rgba(16, 185, 129, 0.18)'
                        : 'rgba(255, 255, 255, 0.05)',
                      border: isAnteontemDone
                        ? '1px solid rgba(16, 185, 129, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.12)',
                      color: isAnteontemDone ? '#34d399' : '#e2e8f0',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    {isAnteontemDone ? <CheckCircle2 size={16} /> : <History size={16} />}
                    <span>{isAnteontemDone ? 'Anteontem (Feito ✅)' : `Anteontem (${formatShortDate(dayBeforeYesterdayStr)})`}</span>
                  </button>
                </div>
              </div>

              {/* Custom Date Picker */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📅 Escolher Outra Data no Calendário
                </label>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="date"
                    max={todayStr}
                    value={customRetroDate}
                    onChange={(e) => setCustomRetroDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />

                  <button
                    type="button"
                    disabled={!customRetroDate || customRetroDate > todayStr}
                    onClick={() => {
                      if (customRetroDate && customRetroDate <= todayStr) {
                        onToggleHabit(activeHabit.id, customRetroDate);
                      }
                    }}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '10px',
                      background: isCustomDateDone
                        ? 'rgba(239, 68, 68, 0.18)'
                        : 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                      border: isCustomDateDone ? '1px solid rgba(239, 68, 68, 0.5)' : 'none',
                      color: isCustomDateDone ? '#f87171' : '#000',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: (!customRetroDate || customRetroDate > todayStr) ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isCustomDateDone ? `Desmarcar (${formatShortDate(customRetroDate)})` : `Marcar (${formatShortDate(customRetroDate)})`}
                  </button>
                </div>
              </div>

              {/* Last 14 Days History Grid */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📋 Histórico dos Últimos 14 Dias
                  </label>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Clique para alternar</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(65px, 1fr))', gap: '6px' }}>
                  {last14Days.map(item => (
                    <button
                      key={item.dateStr}
                      type="button"
                      onClick={() => onToggleHabit(activeHabit.id, item.dateStr)}
                      title={`${item.isDone ? 'Desmarcar' : 'Marcar'} ${item.label} (${item.dateStr})`}
                      style={{
                        padding: '6px 4px',
                        borderRadius: '8px',
                        background: item.isDone
                          ? 'rgba(16, 185, 129, 0.2)'
                          : item.isToday
                            ? 'rgba(56, 189, 248, 0.1)'
                            : 'rgba(255, 255, 255, 0.02)',
                        border: item.isDone
                          ? '1px solid rgba(16, 185, 129, 0.5)'
                          : item.isToday
                            ? '1px solid rgba(56, 189, 248, 0.4)'
                            : '1px solid rgba(255, 255, 255, 0.06)',
                        color: item.isDone ? '#34d399' : item.isToday ? '#38bdf8' : '#94a3b8',
                        fontSize: '0.68rem',
                        fontWeight: item.isDone || item.isToday ? 800 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseOver={e => {
                        if (!item.isDone) {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                        }
                      }}
                      onMouseOut={e => {
                        if (!item.isDone) {
                          e.currentTarget.style.background = item.isToday ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.02)';
                          e.currentTarget.style.borderColor = item.isToday ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.06)';
                        }
                      }}
                    >
                      <span>{item.label}</span>
                      <div
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: item.isDone ? '#10b981' : item.isToday ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)'
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Close Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setRetroModalHabit(null)}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                  onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                >
                  Concluir & Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
