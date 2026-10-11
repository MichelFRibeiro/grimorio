import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Pencil
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { ActivityTimerBox } from './ActivityTimerBox';
import { getFrequencyLabel } from '../utils/habitFrequency';
import { MAX_DURATION_MINUTES, MAX_HABIT_COUNT, confirmLongDuration, getHabitDurationForDate, secondsToDurationMinutes } from '../utils/activityDuration';
import { consumeActivityTimerMinutes } from '../utils/liveActivityTimers';
import { useActivityTimer } from '../hooks/useActivityTimer';
import { formatTimer } from '../hooks/useStopwatch';
import { getSaoPauloDateStr } from '../utils/timeUtils';
import { getHabitLoadSeries, habitMeasureLabel, habitTracksCount, habitTracksTime } from '../utils/habitHomeostasis';

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

function RoutineDurationField({ habitId, value, edited, onChange, onEdited }) {
  const { seconds } = useActivityTimer('habit', habitId);
  useEffect(() => {
    if (edited) return;
    const minutes = secondsToDurationMinutes(seconds);
    onChange(minutes > 0 ? String(minutes) : '');
  }, [seconds, edited, onChange]);

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={labelStyle}>Tempo a registrar (min)</span>
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

function habitBandHint(habit) {
  if (!habit) return '';
  const today = getSaoPauloDateStr();
  const parts = [];
  const add = (series, unit) => {
    if (!series?.homeostasisEnabled) return;
    parts.push(`${series.homeostasisMinMinutes}–${series.homeostasisMaxMinutes} ${unit}`);
  };
  if (habitTracksTime(habit)) add(getHabitLoadSeries(habit, today), 'min');
  if (habitTracksCount(habit)) {
    add(getHabitLoadSeries(habit, today, { measure: 'count' }), habitMeasureLabel(habit, 'count'));
  }
  return parts.join(' · ');
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
      .map(step => ({ habitId: step.habitId, note: step.note || '' }))
  };
}

export function RoutinesView({
  routines = [],
  habits = [],
  onAddRoutine,
  onUpdateRoutine,
  onAdvanceRoutine,
  onUpdateHabitDuration,
  onDeleteRoutine
}) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [picker, setPicker] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(null);
  const [stepCount, setStepCount] = useState('');
  const [stepMinutes, setStepMinutes] = useState('');
  const [minutesEdited, setMinutesEdited] = useState(false);
  const [stepError, setStepError] = useState('');

  const habitById = useMemo(() => new Map((habits || []).map(habit => [habit.id, habit])), [habits]);
  const available = (habits || []).filter(habit => !form.steps.some(step => step.habitId === habit.id));

  const openCreate = () => {
    setError('');
    setForm(emptyForm());
    setPicker('');
    setModal({ mode: 'create' });
  };

  const openEdit = (routine) => {
    setError('');
    setForm(formFromRoutine(routine));
    setPicker('');
    setModal({ mode: 'edit', id: routine.id });
  };

  const addStep = () => {
    if (!picker) return;
    setForm(prev => ({ ...prev, steps: [...prev.steps, { habitId: picker, note: '' }] }));
    setPicker('');
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
      setError('Escolha pelo menos dois rituais, na ordem.');
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      steps: form.steps
    };
    const ok = modal?.mode === 'edit'
      ? await onUpdateRoutine?.(modal.id, payload)
      : await onAddRoutine?.(payload);
    if (ok === false) {
      setError('Não foi possível salvar a rotina.');
      return;
    }
    setModal(null);
  };

  const openStep = (routine, step) => {
    if (step.missing) return;
    setStepError('');
    setStepCount('');
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
    const result = await advance(routine, extra);
    if (result) closeStep();
    else setStepError('Não foi possível registrar o ritual.');
  };

  const saveDoneMinutes = async (habit) => {
    if (!habit || !onUpdateHabitDuration) return;
    const raw = String(stepMinutes).trim();
    const nextMinutes = raw === '' ? 0 : parseInt(raw, 10);
    if (!Number.isFinite(nextMinutes) || nextMinutes < 0 || nextMinutes > MAX_DURATION_MINUTES) {
      setStepError(`O tempo precisa ser um número entre 0 e ${MAX_DURATION_MINUTES} minutos.`);
      return;
    }
    const confirmed = confirmLongDuration(nextMinutes);
    if (confirmed == null) return;
    const result = await onUpdateHabitDuration(habit.id, getSaoPauloDateStr(), confirmed);
    if (result) closeStep();
    else setStepError('Não foi possível corrigir o tempo.');
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
            Uma sequência de rituais feita na ordem. Cada passo marca o ritual — a sequência, o XP e as moedas continuam sendo dele.
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
          Nenhuma rotina ainda. Monte uma sequência com os rituais que você já faz em ordem — manhã, treino, fechamento do dia.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {routines.map(routine => {
            const total = routine.progress?.total || 0;
            const done = routine.progress?.done || 0;
            const ratio = total ? Math.round((done / total) * 100) : 0;
            const next = (routine.steps || []).find(step => step.habitId === routine.nextHabitId);
            return (
              <article key={routine.id} className="glass-panel" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.05rem' }}>{routine.title}</h3>
                    {routine.description ? (
                      <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.82rem' }}>{routine.description}</p>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={() => openEdit(routine)} title="Editar" style={iconBtn}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => setConfirmId(routine.id)} title="Excluir" style={iconBtn}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ margin: '12px 0 8px', height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${ratio}%`, height: '100%', background: routine.completeToday ? '#34d399' : ACCENT }} />
                </div>
                <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: routine.completeToday ? '#34d399' : '#94a3b8', fontWeight: 700 }}>
                  {routine.completeToday ? 'Sequência de hoje concluída' : `${done} de ${total} hoje`}
                </p>

                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(routine.steps || []).map((step, index) => {
                    const isNext = step.habitId === routine.nextHabitId;
                    const band = step.missing ? '' : habitBandHint(habitById.get(step.habitId));
                    return (
                      <li
                        key={`${routine.id}-${step.habitId}`}
                        onClick={() => openStep(routine, step)}
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
                            {band ? <span className="routine-band"> · faixa {band}</span> : null}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                            {step.missing
                              ? 'Tire este passo ao editar a rotina.'
                              : `${getFrequencyLabel(habitById.get(step.habitId) || step)}${step.note ? ` · ${step.note}` : ''}`}
                          </div>
                        </div>
                        {isNext ? <span style={{ fontSize: '0.72rem', fontWeight: 800, color: ACCENT }}>agora</span> : null}
                      </li>
                    );
                  })}
                </ol>

                <button
                  type="button"
                  disabled={!next || busyId === routine.id}
                  onClick={() => {
                    const step = (routine.steps || []).find(item => item.habitId === routine.nextHabitId);
                    if (step) openStep(routine, step);
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
                  {next ? `Fazer agora: ${next.title}` : 'Nada pendente nesta sequência'}
                </button>
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
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {form.steps.map((step, index) => (
                <li key={step.habitId} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '18px', color: '#94a3b8', fontWeight: 800 }}>{index + 1}</span>
                  <span style={{ flex: 1, color: '#f8fafc' }}>{habitById.get(step.habitId)?.title || step.habitId}</span>
                  <button type="button" onClick={() => moveStep(index, -1)} style={iconBtn} title="Subir"><ChevronUp size={14} /></button>
                  <button type="button" onClick={() => moveStep(index, 1)} style={iconBtn} title="Descer"><ChevronDown size={14} /></button>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, steps: prev.steps.filter(item => item.habitId !== step.habitId) }))}
                    style={iconBtn}
                    title="Tirar"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
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
        const step = (routine?.steps || []).find(item => item.habitId === activeStep.habitId);
        const habit = habitById.get(activeStep.habitId);
        if (!routine || !step || !habit) return null;
        const isNext = routine.nextHabitId === habit.id;
        const tracksTime = habitTracksTime(habit);
        const tracksCount = habitTracksCount(habit);
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
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700 }}>{routine.title}</p>
                <h3 style={{ margin: '4px 0 0', color: '#f8fafc' }}>
                  {habit.title}
                  {habitBandHint(habit) ? (
                    <span className="routine-band"> · faixa {habitBandHint(habit)}</span>
                  ) : null}
                </h3>
                {habit.description ? (
                  <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '0.82rem' }}>{habit.description}</p>
                ) : null}
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.75rem' }}>
                  {habit.category || 'Pessoal'} · {getFrequencyLabel(habit)}
                  {step.note ? ` · ${step.note}` : ''}
                  {habit.currentStreak ? ` · 🔥 ${habit.currentStreak}` : ''}
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
                  />
                </>
              )}

              {tracksCount && !step.doneToday && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={labelStyle}>Quantidade ({habitMeasureLabel(habit, 'count')})</span>
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
                  {tracksTime && (
                    <button
                      type="button"
                      disabled={!onUpdateHabitDuration}
                      onClick={() => saveDoneMinutes(habit)}
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
                      Salvar tempo
                    </button>
                  )}
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

      <ConfirmModal
        isOpen={!!confirmId}
        title="Excluir rotina"
        message="A sequência some. Os rituais e as recompensas já recebidas ficam."
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
