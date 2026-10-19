import React, { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Layers,
  ListOrdered,
  NotebookPen,
  Pencil,
  Pill,
  Play,
  Plus,
  RotateCcw,
  Scale,
  Trash2
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { ActivityTimerBox } from './ActivityTimerBox';
import { getFrequencyLabel } from '../utils/habitFrequency';
import { MAX_DURATION_MINUTES, MAX_HABIT_COUNT, MAX_HABIT_NOTE_LENGTH, confirmLongDuration, formatDurationLabel, getHabitDurationForDate, getHabitNoteForDate, secondsToDurationMinutes, sumDurationMap } from '../utils/activityDuration';
import { consumeActivityTimerMinutes } from '../utils/liveActivityTimers';
import { useActivityTimer } from '../hooks/useActivityTimer';
import { formatTimer } from '../hooks/useStopwatch';
import { getSaoPauloDateStr } from '../utils/timeUtils';
import { getHabitLoadSeries, habitMeasureLabel, habitTracksCount, habitTracksTime } from '../utils/habitHomeostasis';
import { HabitHistoryModal, habitHistoryButtonStyle } from './HabitHistoryModal';
import { ROUTINE_ACTIVITIES } from '../utils/routineActivities';
import {
  MAX_ROUTINE_NESTING,
  collectRoutineHabitIds,
  findRoutineHabitStep,
  isActivityStep,
  isRoutineStep,
  routineHabitPath,
  routineLeafKey,
  routineLinkError,
  stepContainsLeaf
} from '../utils/routines';

const ACTIVITY_ICONS = {
  reading: BookOpen,
  scripture: BookMarked,
  journal: NotebookPen,
  agu: Scale,
  'supplement-review': Pill
};

function activityIcon(activityId) {
  return ACTIVITY_ICONS[activityId] || ListOrdered;
}

function activityHint(item) {
  if (item?.rule === 'entry') return 'qualquer página hoje';
  if (item?.rule === 'review') return 'ao concluir o review';
  return 'no setpoint';
}

function findActivityStep(steps, activityId) {
  for (const step of steps || []) {
    if (isRoutineStep(step)) {
      const found = findActivityStep(step.steps, activityId);
      if (found) return found;
    } else if (isActivityStep(step) && step.activityId === activityId) {
      return step;
    }
  }
  return null;
}

const ACCENT = '#38bdf8';

const fieldStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '10px',
  background: 'rgba(255, 255, 255, 0.06)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  color: '#fff',
  fontSize: '0.95rem'
};

const labelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#94a3b8',
  marginBottom: '4px'
};

function RoutineDurationField({ habitId, value, edited, onChange, onEdited, expected = '' }) {
  const { seconds } = useActivityTimer('habit', habitId);
  useEffect(() => {
    if (edited) return;
    const minutes = secondsToDurationMinutes(seconds);
    onChange(minutes > 0 ? String(minutes) : '');
  }, [seconds, edited, onChange]);

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={labelStyle}>Tempo a registrar (min){expected ? ` · esperado ${expected}` : ''}</span>
      <input
        type="number"
        min="0"
        max={MAX_DURATION_MINUTES}
        inputMode="numeric"
        value={value}
        onChange={(event) => {
          onEdited();
          onChange(event.target.value);
        }}
        placeholder="0"
        style={fieldStyle}
      />
      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
        Cronômetro em {formatTimer(seconds)}. Altere os minutos se o tempo real for outro. Vazio registra sem tempo.
      </span>
    </label>
  );
}

function formatBand(series, unit) {
  if (!series) return '';
  const min = series.homeostasisMinMinutes;
  const max = series.homeostasisMaxMinutes;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '';
  return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
}

/**
 * Quantidade esperada nesta execução, a faixa viva da homeostase.
 * `getHabitLoadSeries` devolve null sem opt-in — não existe `homeostasisEnabled`
 * na série; filtrar por esse campo escondia o intervalo (ex.: Bike, 5–6 min).
 * `measure` limita à unidade do campo (tempo ou quantidade).
 */
function habitBandHint(habit, measure) {
  if (!habit) return '';
  const today = getSaoPauloDateStr();
  const parts = [];
  const wantTime = measure !== 'count' && habitTracksTime(habit);
  const wantCount = measure !== 'time' && habitTracksCount(habit);
  if (wantTime) parts.push(formatBand(getHabitLoadSeries(habit, today), 'min'));
  if (wantCount) {
    parts.push(formatBand(getHabitLoadSeries(habit, today, { measure: 'count' }), habitMeasureLabel(habit, 'count')));
  }
  return parts.filter(Boolean).join(' · ');
}

function routineTime(routine, habitById, today) {
  let todayMinutes = 0;
  let totalMinutes = 0;
  for (const habitId of collectRoutineHabitIds(routine?.steps)) {
    const habit = habitById.get(habitId);
    if (!habit) continue;
    todayMinutes += getHabitDurationForDate(habit, today);
    totalMinutes += sumDurationMap(habit.durationsByDate);
  }
  return { todayMinutes, totalMinutes };
}

function emptyForm() {
  return { title: '', description: '', steps: [] };
}

function formFromRoutine(routine) {
  return {
    title: routine?.title || '',
    description: routine?.description || '',
    steps: (routine?.steps || [])
      .filter(step => !step.missing)
      .map(step => {
        if (isRoutineStep(step)) return { kind: 'routine', routineId: step.routineId, note: step.note || '' };
        if (isActivityStep(step)) return { kind: 'activity', activityId: step.activityId, note: step.note || '' };
        return { kind: 'habit', habitId: step.habitId, note: step.note || '' };
      })
  };
}

function formStepKey(step, index) {
  if (isRoutineStep(step)) return `routine:${step.routineId}:${index}`;
  if (isActivityStep(step)) return `activity:${step.activityId}:${index}`;
  return `habit:${step.habitId}:${index}`;
}

function branchKey(ownerId, path, routineId) {
  return `${ownerId}:${path}:${routineId}`;
}

function RoutineStepList({
  steps,
  routine,
  habitById,
  nextLeafKey,
  collapsedBranches,
  onToggleBranch,
  onOpen,
  onOpenActivity,
  onHistory,
  path = ''
}) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {(steps || []).map((step, index) => {
        if (isRoutineStep(step)) {
          const key = branchKey(routine.id, path, step.routineId);
          const collapsed = collapsedBranches.has(key);
          const containsNext = stepContainsLeaf(step, nextLeafKey);
          const childDone = step.progress?.done || 0;
          const childTotal = step.progress?.total || 0;
          return (
            <li
              key={`${routine.id}-${path}-rt-${step.routineId}`}
              style={{
                padding: '8px 10px',
                borderRadius: '10px',
                background: containsNext ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255,255,255,0.03)',
                border: containsNext ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid transparent',
                opacity: step.missing ? 0.55 : 1
              }}
            >
              <button
                type="button"
                onClick={() => onToggleBranch(key)}
                aria-expanded={!collapsed && !step.missing}
                title={collapsed ? 'Mostrar a sub-rotina' : 'Recolher a sub-rotina'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: 0
                }}
              >
                <span style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  background: step.doneToday ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255,255,255,0.06)',
                  color: step.doneToday ? '#34d399' : '#cbd5e1',
                  flex: '0 0 auto'
                }}>
                  {step.doneToday ? <Check size={13} /> : index + 1}
                </span>
                <Layers size={14} color={ACCENT} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.9rem' }}>
                    {step.missing ? 'Sub-rotina excluída' : (step.title || 'Sub-rotina')}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: '2px' }}>
                    {step.missing
                      ? 'Tire este passo ao editar a rotina.'
                      : `sub-rotina · ${childDone} de ${childTotal}${step.note ? ` · ${step.note}` : ''}`}
                  </div>
                </div>
                {containsNext ? <span style={{ fontSize: '0.72rem', fontWeight: 800, color: ACCENT }}>agora</span> : null}
                {step.missing ? null : (collapsed ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronUp size={14} color="#94a3b8" />)}
              </button>
              {!step.missing && !collapsed && (
                <div style={{ margin: '8px 0 0 18px', borderLeft: '2px solid rgba(56, 189, 248, 0.35)', paddingLeft: '10px' }}>
                  {(step.steps || []).length === 0 ? (
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem' }}>Sem passos nesta sub-rotina.</p>
                  ) : (
                    <RoutineStepList
                      steps={step.steps}
                      routine={routine}
                      habitById={habitById}
                      nextLeafKey={nextLeafKey}
                      collapsedBranches={collapsedBranches}
                      onToggleBranch={onToggleBranch}
                      onOpen={onOpen}
                      onOpenActivity={onOpenActivity}
                      onHistory={onHistory}
                      path={path ? `${path}/${step.routineId}` : step.routineId}
                    />
                  )}
                </div>
              )}
            </li>
          );
        }

        if (isActivityStep(step)) {
          const isNext = routineLeafKey(step) === nextLeafKey;
          const Icon = activityIcon(step.activityId);
          const hint = step.detail || activityHint(step);
          return (
            <li
              key={`${routine.id}-${path}-act-${step.activityId}`}
              onClick={() => onOpenActivity?.(step)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: '10px',
                background: isNext ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255,255,255,0.03)',
                border: isNext ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid transparent',
                opacity: step.missing ? 0.55 : 1,
                cursor: 'pointer'
              }}
            >
              <span style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.72rem',
                fontWeight: 800,
                background: step.doneToday ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255,255,255,0.06)',
                color: step.doneToday ? '#34d399' : '#cbd5e1'
              }}>
                {step.doneToday ? <Check size={13} /> : index + 1}
              </span>
              <Icon size={14} color={ACCENT} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.9rem' }}>
                  {step.title || 'Atividade'}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: '2px' }}>
                  {step.missing ? 'Atividade indisponível.' : `${hint}${step.note ? ` · ${step.note}` : ''}`}
                </div>
              </div>
              {isNext ? <span style={{ fontSize: '0.72rem', fontWeight: 800, color: ACCENT }}>agora</span> : null}
            </li>
          );
        }

        const isNext = routineLeafKey(step) === nextLeafKey;
        const habit = habitById.get(step.habitId);
        const band = step.missing ? '' : habitBandHint(habit);
        return (
          <li
            key={`${routine.id}-${path}-${step.habitId}`}
            onClick={() => onOpen(step)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '10px',
              background: isNext ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255,255,255,0.03)',
              border: isNext ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid transparent',
              opacity: step.missing ? 0.55 : 1,
              cursor: step.missing ? 'default' : 'pointer'
            }}
          >
            <span style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              fontSize: '0.72rem',
              fontWeight: 800,
              background: step.doneToday ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255,255,255,0.06)',
              color: step.doneToday ? '#34d399' : '#cbd5e1'
            }}>
              {step.doneToday ? <Check size={13} /> : index + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.9rem' }}>
                {step.missing ? 'Ritual excluído' : (step.title || 'Ritual')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                  {step.missing
                    ? 'Tire este passo ao editar a rotina.'
                    : `${getFrequencyLabel(habit || step)}${step.note ? ` · ${step.note}` : ''}`}
                </span>
                {!step.missing && (
                  <button
                    type="button"
                    className="habit-history-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onHistory(step.habitId);
                    }}
                    style={habitHistoryButtonStyle()}
                    title="Histórico de execução deste ritual"
                  >
                    <History size={12} /> Histórico
                  </button>
                )}
              </div>
              {band ? (
                <div className="routine-band" style={{ marginTop: '2px' }}>esperado {band}</div>
              ) : null}
            </div>
            {isNext ? <span style={{ fontSize: '0.72rem', fontWeight: 800, color: ACCENT }}>agora</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function RoutinesView({
  routines = [],
  habits = [],
  onAddRoutine,
  onUpdateRoutine,
  onAdvanceRoutine,
  onUpdateHabitDuration,
  onDeleteRoutine,
  onOpenActivity
}) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [picker, setPicker] = useState('');
  const [routinePicker, setRoutinePicker] = useState('');
  const [activityPicker, setActivityPicker] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [collapsedBranches, setCollapsedBranches] = useState(() => new Set());
  const [stepCount, setStepCount] = useState('');
  const [stepMinutes, setStepMinutes] = useState('');
  const [minutesEdited, setMinutesEdited] = useState(false);
  const [stepError, setStepError] = useState('');
  const [stepNote, setStepNote] = useState('');
  const [historyHabitId, setHistoryHabitId] = useState(null);

  const habitById = useMemo(() => new Map((habits || []).map(habit => [habit.id, habit])), [habits]);
  const routineById = useMemo(() => new Map((routines || []).map(item => [item.id, item])), [routines]);
  const available = (habits || []).filter(habit => !form.steps.some(step => step.kind !== 'routine' && step.habitId === habit.id));
  const otherRoutines = (routines || []).filter(item => item?.id && item.id !== modal?.id);
  const availableActivities = ROUTINE_ACTIVITIES.filter(item => (
    !form.steps.some(step => step.kind === 'activity' && step.activityId === item.id)
  ));
  const selectableRoutines = otherRoutines.filter(item => {
    if (form.steps.some(step => step.kind === 'routine' && step.routineId === item.id)) return false;
    return !routineLinkError(routines, modal?.id || null, [...form.steps, { kind: 'routine', routineId: item.id }]);
  });

  const parentTitles = (routineId) => (routines || [])
    .filter(item => item.id !== routineId && (item.steps || []).some(step => isRoutineStep(step) && step.routineId === routineId))
    .map(item => item.title);

  const openCreate = () => {
    setError('');
    setForm(emptyForm());
    setPicker('');
    setRoutinePicker('');
    setActivityPicker('');
    setModal({ mode: 'create' });
  };

  const openEdit = (routine) => {
    setError('');
    setForm(formFromRoutine(routine));
    setPicker('');
    setRoutinePicker('');
    setActivityPicker('');
    setModal({ mode: 'edit', id: routine.id });
  };

  const toggleExpanded = (routineId) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(routineId)) next.delete(routineId);
      else next.add(routineId);
      return next;
    });
  };

  const addStep = () => {
    if (!picker) return;
    setForm(prev => ({ ...prev, steps: [...prev.steps, { kind: 'habit', habitId: picker, note: '' }] }));
    setPicker('');
  };

  const addRoutineStep = () => {
    if (!routinePicker) return;
    setForm(prev => ({ ...prev, steps: [...prev.steps, { kind: 'routine', routineId: routinePicker, note: '' }] }));
    setRoutinePicker('');
  };

  const addActivityStep = () => {
    if (!activityPicker) return;
    setForm(prev => ({ ...prev, steps: [...prev.steps, { kind: 'activity', activityId: activityPicker, note: '' }] }));
    setActivityPicker('');
  };

  const toggleBranch = (key) => {
    setCollapsedBranches(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const moveStep = (index, delta) => {
    setForm(prev => {
      const next = [...prev.steps];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return { ...prev, steps: next };
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.title.trim()) {
      setError('Dê um nome à rotina.');
      return;
    }
    if (form.steps.length < 2) {
      setError('Escolha pelo menos dois passos, na ordem. Pode ser ritual, atividade ou rotina.');
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      steps: form.steps.map(step => {
        if (step.kind === 'routine') return { kind: 'routine', routineId: step.routineId, note: step.note || '' };
        if (step.kind === 'activity') return { kind: 'activity', activityId: step.activityId, note: step.note || '' };
        return { kind: 'habit', habitId: step.habitId, note: step.note || '' };
      })
    };
    const ok = modal?.mode === 'edit'
      ? await onUpdateRoutine?.(modal.id, payload)
      : await onAddRoutine?.(payload);
    if (ok !== true) {
      setError(typeof ok === 'string' ? ok : 'Não foi possível salvar a rotina.');
      return;
    }
    setModal(null);
  };

  const openStep = (routine, step) => {
    if (step.missing) return;
    setStepError('');
    setStepCount('');
    setStepNote(step.doneToday
      ? getHabitNoteForDate(habitById.get(step.habitId), getSaoPauloDateStr())
      : '');
    setMinutesEdited(false);
    setStepMinutes(step.doneToday
      ? String(getHabitDurationForDate(habitById.get(step.habitId), getSaoPauloDateStr()) || '')
      : '');
    setActiveStep({ routineId: routine.id, habitId: step.habitId });
  };

  const closeStep = () => {
    setActiveStep(null);
    setStepError('');
  };

  const advance = async (routine, extra = {}) => {
    if (!routine?.nextHabitId || busyId) return null;
    setBusyId(routine.id);
    try {
      return await onAdvanceRoutine?.(routine.id, { habitId: routine.nextHabitId, ...extra });
    } finally {
      setBusyId(null);
    }
  };

  const finishStep = async (routine, habit) => {
    if (!routine || !habit || busyId) return;
    setStepError('');
    const extra = {};
    if (habitTracksCount(habit)) {
      const count = Number(String(stepCount).replace(',', '.'));
      if (!Number.isFinite(count) || count <= 0 || count > MAX_HABIT_COUNT) {
        setStepError(`Informe a quantidade (1 a ${MAX_HABIT_COUNT}).`);
        return;
      }
      extra.count = count;
    }
    if (habitTracksTime(habit)) {
      const raw = String(stepMinutes).trim();
      const nextMinutes = raw === '' ? 0 : parseInt(raw, 10);
      if (!Number.isFinite(nextMinutes) || nextMinutes < 0 || nextMinutes > MAX_DURATION_MINUTES) {
        setStepError(`O tempo precisa ser um número entre 0 e ${MAX_DURATION_MINUTES} minutos.`);
        return;
      }
      const confirmed = confirmLongDuration(nextMinutes);
      if (confirmed == null) return;
      consumeActivityTimerMinutes('habit', habit.id);
      if (confirmed > 0) extra.durationMinutes = confirmed;
    }
    const note = stepNote.trim();
    if (note) extra.note = note;
    const result = await advance(routine, extra);
    if (result) closeStep();
    else setStepError('Não foi possível registrar o ritual.');
  };

  const saveDoneExecution = async (habit) => {
    if (!habit || !onUpdateHabitDuration) return;
    setStepError('');
    const today = getSaoPauloDateStr();
    const tracksTime = habitTracksTime(habit);
    let confirmed = undefined;
    if (tracksTime) {
      const raw = String(stepMinutes).trim();
      const nextMinutes = raw === '' ? 0 : parseInt(raw, 10);
      if (!Number.isFinite(nextMinutes) || nextMinutes < 0 || nextMinutes > MAX_DURATION_MINUTES) {
        setStepError(`O tempo precisa ser um número entre 0 e ${MAX_DURATION_MINUTES} minutos.`);
        return;
      }
      confirmed = confirmLongDuration(nextMinutes);
      if (confirmed == null) return;
    }
    const noteChanged = stepNote !== getHabitNoteForDate(habit, today);
    if (confirmed === undefined && !noteChanged) {
      closeStep();
      return;
    }
    const result = await onUpdateHabitDuration(
      habit.id,
      today,
      confirmed,
      undefined,
      noteChanged ? stepNote : undefined
    );
    if (result) closeStep();
    else setStepError('Não foi possível salvar a execução.');
  };

  const undoStep = async (routine, habitId) => {
    if (!routine || !habitId || busyId) return;
    setBusyId(routine.id);
    setStepError('');
    try {
      const result = await onAdvanceRoutine?.(routine.id, { habitId, undo: true });
      if (result) closeStep();
      else setStepError('Não foi possível desmarcar.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ListOrdered size={22} color={ACCENT} /> Rotinas
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', maxWidth: '640px' }}>
            Uma sequência feita na ordem: rituais, atividades ou rotinas inteiras. Biblioteca, Escrituras e AGU fecham no setpoint; o Diário, com qualquer página; o Review de Suplementos, ao concluir o review. O ritual é quem leva XP e moedas.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '12px',
            background: `linear-gradient(135deg, ${ACCENT} 0%, #0284c7 100%)`,
            color: '#0f172a',
            fontWeight: 800,
            fontSize: '0.9rem',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} /> Nova Rotina
        </button>
      </div>

      {(routines || []).length === 0 ? (
        <div className="glass-panel" style={{ padding: '28px', textAlign: 'center', color: '#94a3b8' }}>
          Nenhuma rotina ainda. Monte uma sequência com os rituais que você já faz em ordem — manhã, treino, fechamento do dia. Depois, se quiser, junte essas rotinas numa rotina maior.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {routines.map(routine => {
            const total = routine.progress?.total || 0;
            const done = routine.progress?.done || 0;
            const ratio = total ? Math.round((done / total) * 100) : 0;
            const nextLeafKey = routine.nextActivityId
              ? `activity:${routine.nextActivityId}`
              : (routine.nextHabitId ? `habit:${routine.nextHabitId}` : '');
            const next = routine.nextActivityId
              ? (routine.steps && findActivityStep(routine.steps, routine.nextActivityId))
              : findRoutineHabitStep(routine.steps, routine.nextHabitId);
            const nextExpected = next ? habitBandHint(habitById.get(next.habitId)) : '';
            const subCount = (routine.steps || []).filter(step => isRoutineStep(step) && !step.missing).length;
            const parents = parentTitles(routine.id);
            const time = routineTime(routine, habitById, getSaoPauloDateStr());
            const todayLabel = formatDurationLabel(time.todayMinutes);
            const totalLabel = formatDurationLabel(time.totalMinutes);
            const expanded = expandedIds.has(routine.id);
            return (
              <article key={routine.id} className="glass-panel" style={{ padding: expanded ? '16px 18px' : '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(routine.id)}
                    aria-expanded={expanded}
                    title={expanded ? 'Recolher rotina' : 'Expandir rotina'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flex: '1 1 180px',
                      minWidth: 0,
                      flexWrap: 'wrap',
                      background: 'transparent',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: 0
                    }}
                  >
                    {expanded ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                    <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.05rem' }}>{routine.title}</h3>
                    {routine.completeToday ? (
                      <span title="Concluída hoje" aria-label="Concluída hoje" style={{ fontSize: '0.95rem', lineHeight: 1 }}>✅</span>
                    ) : null}
                    {subCount > 0 ? (
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: ACCENT }}>
                        {subCount} sub-rotina{subCount === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {parents.length > 0 ? (
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8' }}>
                        entra em {parents.join(', ')}
                      </span>
                    ) : null}
                  </button>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={() => openEdit(routine)} title="Editar" style={iconBtn}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => setConfirmId(routine.id)} title="Excluir" style={iconBtn}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {expanded && routine.description ? (
                  <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '0.82rem' }}>{routine.description}</p>
                ) : null}

                {expanded && (
                <>
                <div style={{ margin: '12px 0 8px', height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${ratio}%`, height: '100%', background: routine.completeToday ? '#34d399' : ACCENT }} />
                </div>
                <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: routine.completeToday ? '#34d399' : '#94a3b8', fontWeight: 700 }}>
                  {routine.completeToday ? 'Sequência de hoje concluída' : `${done} de ${total} hoje`}
                  {subCount ? ` · ${subCount} sub-rotina${subCount === 1 ? '' : 's'}` : ''}
                  {` · hoje ${todayLabel || '0 min'} · total ${totalLabel || '0 min'}`}
                </p>

                <RoutineStepList
                  steps={routine.steps}
                  routine={routine}
                  habitById={habitById}
                  nextLeafKey={nextLeafKey}
                  collapsedBranches={collapsedBranches}
                  onToggleBranch={toggleBranch}
                  onOpen={(step) => openStep(routine, step)}
                  onOpenActivity={onOpenActivity}
                  onHistory={setHistoryHabitId}
                />

                <button
                  type="button"
                  disabled={!next || busyId === routine.id}
                  onClick={() => {
                    if (!next) return;
                    if (next.kind === 'activity') {
                      onOpenActivity?.(next);
                      return;
                    }
                    openStep(routine, next);
                  }}
                  style={{
                    marginTop: '14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: next ? 'pointer' : 'not-allowed',
                    fontWeight: 800,
                    background: next ? `linear-gradient(135deg, ${ACCENT} 0%, #0284c7 100%)` : 'rgba(255,255,255,0.06)',
                    color: next ? '#0f172a' : '#64748b'
                  }}
                >
                  <Play size={15} />
                  {next
                    ? (next.kind === 'activity'
                      ? `Fazer agora: ${next.title}${next.detail ? ` · ${next.detail}` : ''}`
                      : `Fazer agora: ${next.title}${nextExpected ? ` · esperado ${nextExpected}` : ''}`)
                    : 'Nada pendente nesta sequência'}
                </button>
                </>
                )}
              </article>
            );
          })}
        </div>
      )}

      {modal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.72)',
            zIndex: 40,
            display: 'grid',
            placeItems: 'center',
            padding: '20px'
          }}
          onClick={() => setModal(null)}
        >
          <form
            className="glass-panel"
            onClick={(event) => event.stopPropagation()}
            onSubmit={save}
            style={{ width: 'min(560px, 100%)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <h3 style={{ margin: 0, color: '#f8fafc' }}>{modal.mode === 'edit' ? 'Editar rotina' : 'Nova rotina'}</h3>
            <div>
              <label style={labelStyle}>Nome</label>
              <input
                value={form.title}
                onChange={(event) => setForm(prev => ({ ...prev, title: event.target.value }))}
                placeholder="Manhã"
                style={fieldStyle}
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Descrição</label>
              <input
                value={form.description}
                onChange={(event) => setForm(prev => ({ ...prev, description: event.target.value }))}
                placeholder="O que esta sequência abre no dia"
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Adicionar ritual</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={picker} onChange={(event) => setPicker(event.target.value)} style={{ ...fieldStyle, flex: 1 }}>
                  <option value="">Escolha um ritual</option>
                  {available.map(habit => (
                    <option key={habit.id} value={habit.id}>{habit.title}</option>
                  ))}
                </select>
                <button type="button" onClick={addStep} disabled={!picker} style={{ ...iconBtn, width: '42px' }}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Adicionar sub-rotina</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={routinePicker} onChange={(event) => setRoutinePicker(event.target.value)} style={{ ...fieldStyle, flex: 1 }}>
                  <option value="">{otherRoutines.length ? 'Escolha uma rotina' : 'Nenhuma outra rotina ainda'}</option>
                  {selectableRoutines.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.title} ({item.progress?.total || 0} rituais)
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addRoutineStep} disabled={!routinePicker} style={{ ...iconBtn, width: '42px' }} title="Adicionar sub-rotina">
                  <Layers size={16} />
                </button>
              </div>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.72rem' }}>
                {otherRoutines.length === 0
                  ? 'Crie outra rotina antes para usá-la como sub-rotina.'
                  : selectableRoutines.length === 0
                    ? (form.steps.filter(step => step.kind === 'routine').length >= otherRoutines.length
                      ? 'Todas as rotinas já estão nesta sequência.'
                      : `As rotinas restantes criariam um ciclo ou passariam de ${MAX_ROUTINE_NESTING} níveis.`)
                    : 'A sub-rotina entra inteira nesta posição. O modo guiado faz os rituais dela antes de seguir. Editar a sub-rotina atualiza esta sequência.'}
              </p>
            </div>
            <div>
              <label style={labelStyle}>Adicionar atividade</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={activityPicker} onChange={(event) => setActivityPicker(event.target.value)} style={{ ...fieldStyle, flex: 1 }}>
                  <option value="">Escolha uma atividade</option>
                  {availableActivities.map(item => (
                    <option key={item.id} value={item.id}>{item.label} · {activityHint(item)}</option>
                  ))}
                </select>
                <button type="button" onClick={addActivityStep} disabled={!activityPicker} style={{ ...iconBtn, width: '42px' }} title="Adicionar atividade">
                  <Plus size={16} />
                </button>
              </div>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.72rem' }}>
                Biblioteca, Escrituras e AGU contam quando o tempo do dia chega no setpoint. O Diário conta se houver qualquer página hoje. O Review de Suplementos conta quando o review do dia for concluído. A rotina não marca no lugar delas.
              </p>
            </div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {form.steps.map((step, index) => {
                const nested = step.kind === 'routine';
                const activity = step.kind === 'activity';
                const child = nested ? routineById.get(step.routineId) : null;
                const ActivityIcon = activity ? activityIcon(step.activityId) : null;
                const label = nested
                  ? (child?.title || 'Sub-rotina')
                  : activity
                    ? (ROUTINE_ACTIVITIES.find(item => item.id === step.activityId)?.label || 'Atividade')
                    : (habitById.get(step.habitId)?.title || step.habitId);
                return (
                  <li key={formStepKey(step, index)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '18px', color: '#94a3b8', fontWeight: 800 }}>{index + 1}</span>
                    {nested ? <Layers size={14} color={ACCENT} /> : null}
                    {ActivityIcon ? <ActivityIcon size={14} color={ACCENT} /> : null}
                    <span style={{ flex: 1, color: '#f8fafc' }}>
                      {label}
                      {nested ? <span style={{ color: ACCENT, fontSize: '0.72rem', fontWeight: 800 }}> · sub-rotina</span> : null}
                      {activity ? <span style={{ color: ACCENT, fontSize: '0.72rem', fontWeight: 800 }}> · atividade</span> : null}
                    </span>
                    <button type="button" onClick={() => moveStep(index, -1)} style={iconBtn} title="Subir"><ChevronUp size={14} /></button>
                    <button type="button" onClick={() => moveStep(index, 1)} style={iconBtn} title="Descer"><ChevronDown size={14} /></button>
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, steps: prev.steps.filter((_, itemIndex) => itemIndex !== index) }))}
                      style={iconBtn}
                      title="Tirar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ol>
            {error ? <p style={{ margin: 0, color: '#f87171', fontSize: '0.82rem' }}>{error}</p> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setModal(null)} style={{ ...iconBtn, width: 'auto', padding: '8px 12px' }}>Cancelar</button>
              <button type="submit" style={{
                padding: '8px 14px',
                borderRadius: '10px',
                border: 'none',
                background: ACCENT,
                color: '#0f172a',
                fontWeight: 800,
                cursor: 'pointer'
              }}>
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {activeStep && (() => {
        const routine = (routines || []).find(item => item.id === activeStep.routineId);
        const step = findRoutineHabitStep(routine?.steps, activeStep.habitId);
        const habit = habitById.get(activeStep.habitId);
        if (!routine || !step || !habit) return null;
        const isNext = routine.nextHabitId === habit.id;
        const trail = routineHabitPath(routine.steps, habit.id) || [];
        const tracksTime = habitTracksTime(habit);
        const tracksCount = habitTracksCount(habit);
        const expected = habitBandHint(habit);
        const expectedTime = habitBandHint(habit, 'time');
        const expectedCount = habitBandHint(habit, 'count');
        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(2, 6, 23, 0.78)',
              zIndex: 45,
              display: 'grid',
              placeItems: 'center',
              padding: '20px'
            }}
            onClick={closeStep}
          >
            <div
              className="glass-panel"
              onClick={(event) => event.stopPropagation()}
              style={{ width: 'min(480px, 100%)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700 }}>
                  {[routine.title, ...trail].join(' · ')}
                </p>
                <h3 style={{ margin: '4px 0 0', color: '#f8fafc' }}>
                  {habit.title}
                </h3>
                {expected ? (
                  <p className="routine-band" style={{ margin: '4px 0 0' }}>
                    esperado nesta execução: {expected}
                  </p>
                ) : null}
                {habit.description ? (
                  <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '0.82rem' }}>{habit.description}</p>
                ) : null}
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span>
                    {habit.category || 'Pessoal'} · {getFrequencyLabel(habit)}
                    {step.note ? ` · ${step.note}` : ''}
                    {habit.currentStreak ? ` · 🔥 ${habit.currentStreak}` : ''}
                  </span>
                  <button
                    type="button"
                    className="habit-history-btn"
                    onClick={() => setHistoryHabitId(habit.id)}
                    style={habitHistoryButtonStyle()}
                    title="Histórico de execução deste ritual"
                  >
                    <History size={12} /> Histórico
                  </button>
                </p>
              </div>

              {tracksTime && !step.doneToday && (
                <>
                  <ActivityTimerBox kind="habit" id={habit.id} label="Cronômetro do ritual" accent={ACCENT} />
                  <RoutineDurationField
                    habitId={habit.id}
                    value={stepMinutes}
                    edited={minutesEdited}
                    onChange={setStepMinutes}
                    onEdited={() => setMinutesEdited(true)}
                    expected={expectedTime}
                  />
                </>
              )}

              {tracksCount && !step.doneToday && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={labelStyle}>
                    Quantidade ({habitMeasureLabel(habit, 'count')})
                    {expectedCount ? ` · esperado ${expectedCount}` : ''}
                  </span>
                  <input
                    type="number"
                    min="1"
                    max={MAX_HABIT_COUNT}
                    inputMode="decimal"
                    value={stepCount}
                    onChange={(event) => setStepCount(event.target.value)}
                    placeholder={`Quantos ${habitMeasureLabel(habit, 'count')}?`}
                    style={fieldStyle}
                    autoFocus={!tracksTime}
                  />
                </label>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={labelStyle}>Notas (opcional)</span>
                <textarea
                  value={stepNote}
                  maxLength={MAX_HABIT_NOTE_LENGTH}
                  rows={3}
                  onChange={(event) => setStepNote(event.target.value)}
                  placeholder="Como foi esta execução?"
                  style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </label>

              {step.doneToday && (
                <p style={{ margin: 0, color: '#34d399', fontWeight: 700, fontSize: '0.85rem' }}>
                  Feito hoje. Desmarcar estorna XP e moedas deste ritual.
                </p>
              )}
              {step.doneToday && tracksTime && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={labelStyle}>Tempo registrado (min)</span>
                  <input
                    type="number"
                    min="0"
                    max={MAX_DURATION_MINUTES}
                    inputMode="numeric"
                    value={stepMinutes}
                    onChange={(event) => setStepMinutes(event.target.value)}
                    style={fieldStyle}
                  />
                </label>
              )}
              {stepError ? <p style={{ margin: 0, color: '#f87171', fontSize: '0.82rem' }}>{stepError}</p> : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" onClick={closeStep} style={{ ...iconBtn, width: 'auto', padding: '8px 12px' }}>Fechar</button>
                {step.doneToday ? (
                  <>
                  <button
                    type="button"
                    disabled={!onUpdateHabitDuration}
                    onClick={() => saveDoneExecution(habit)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: `1px solid ${ACCENT}`,
                      background: 'rgba(56, 189, 248, 0.12)',
                      color: ACCENT,
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {tracksTime ? 'Salvar' : 'Salvar nota'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === routine.id}
                    onClick={() => undoStep(routine, habit.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: '1px solid rgba(248, 113, 113, 0.45)',
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    <RotateCcw size={14} /> Desmarcar
                  </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={!isNext || busyId === routine.id}
                    onClick={() => finishStep(routine, habit)}
                    title={isNext ? 'Registrar este passo' : 'Faça os passos anteriores primeiro'}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: 'none',
                      background: isNext ? ACCENT : 'rgba(255,255,255,0.08)',
                      color: isNext ? '#0f172a' : '#64748b',
                      fontWeight: 800,
                      cursor: isNext ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {isNext ? 'Registrar' : 'Ainda não é a vez'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {historyHabitId && (
        <HabitHistoryModal
          habit={habitById.get(historyHabitId) || null}
          onClose={() => setHistoryHabitId(null)}
          onSaveNote={onUpdateHabitDuration
            ? (id, date, note) => onUpdateHabitDuration(id, date, undefined, undefined, note)
            : null}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmId}
        title="Excluir rotina"
        message={(() => {
          const parents = confirmId ? parentTitles(confirmId) : [];
          if (parents.length) {
            return `A sequência some e deixa de ser passo de: ${parents.join(', ')}. Os rituais e as recompensas já recebidas ficam.`;
          }
          return 'A sequência some. Os rituais e as recompensas já recebidas ficam.';
        })()}
        confirmText="Excluir"
        confirmVariant="danger"
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          const id = confirmId;
          setConfirmId(null);
          onDeleteRoutine?.(id);
        }}
      />
    </div>
  );
}

const iconBtn = {
  width: '32px',
  height: '32px',
  display: 'grid',
  placeItems: 'center',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: '#cbd5e1',
  cursor: 'pointer'
};
