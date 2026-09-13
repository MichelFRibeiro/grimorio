import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Mountain,
  Calendar,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
  Flame,
  Archive,
  Pencil,
  X,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { getSaoPauloDateStr } from '../utils/timeUtils';
import {
  CYCLE_DEFS,
  MAX_ACTIVE_NINETY_DAY_GOALS,
  countOccupiedNinetyDayGoalSlots,
  describeCycleBreakdown,
  formatDateBr,
  formatGoalAmount,
  parseGoalText,
  previewNinetyDayGoal
} from '../utils/ninetyDayGoals';

const PACE_META = {
  ahead: { label: 'À frente', color: '#34d399', bg: 'rgba(16, 185, 129, 0.12)' },
  on_track: { label: 'No ritmo', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)' },
  behind: { label: 'Atrasada', color: '#f87171', bg: 'rgba(248, 113, 113, 0.12)' },
  completed: { label: 'Conquistada', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)' }
};

const STATUS_META = {
  active: { label: 'Em andamento', color: '#fbbf24' },
  completed: { label: 'Conquistada', color: '#34d399' },
  expired: { label: 'Prazo encerrado', color: '#f87171' },
  archived: { label: 'Arquivada', color: '#94a3b8' }
};

function ProgressBar({ percent, color = '#f59e0b', height = 10 }) {
  return (
    <div className="progress-container" style={{ height: `${height}px`, background: 'rgba(255,255,255,0.06)' }}>
      <div style={{
        width: `${Math.min(100, Math.max(0, percent || 0))}%`,
        height: '100%',
        borderRadius: '999px',
        background: color,
        boxShadow: `0 0 10px ${color}66`,
        transition: 'width 0.35s ease'
      }} />
    </div>
  );
}

function CycleRow({ cycle, unit, unitLabel, kind, currentId }) {
  const def = CYCLE_DEFS[kind];
  const percent = cycle.targetAmount > 0
    ? Math.min(100, Math.round((cycle.currentAmount / cycle.targetAmount) * 100))
    : 0;
  const isCurrent = currentId && cycle.id === currentId;
  const color = cycle.completed ? '#34d399' : (isCurrent ? '#fbbf24' : '#64748b');

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(110px, 0.9fr) 1fr minmax(90px, auto)',
        gap: '10px',
        alignItems: 'center',
        padding: '8px 10px',
        borderRadius: '10px',
        background: isCurrent ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255,255,255,0.02)',
        border: isCurrent ? '1px solid rgba(245, 158, 11, 0.28)' : '1px solid rgba(255,255,255,0.04)'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: isCurrent ? '#fbbf24' : '#e2e8f0' }}>
          {def.label} {cycle.index}
          {cycle.completed && <CheckCircle2 size={12} color="#34d399" style={{ marginLeft: 6, verticalAlign: '-2px' }} />}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
          {formatDateBr(cycle.startDate)} – {formatDateBr(cycle.endDate)}
        </div>
      </div>
      <ProgressBar percent={percent} color={color} height={7} />
      <div style={{ fontSize: '0.75rem', color: '#cbd5e1', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
        {formatGoalAmount(cycle.currentAmount, unit, unitLabel)} / {formatGoalAmount(cycle.targetAmount, unit, unitLabel)}
      </div>
    </div>
  );
}

export function NinetyDayGoalsView({
  goals = [],
  questCategories = [],
  onAddGoal,
  onUpdateGoal,
  onLogProgress,
  onDeleteLog,
  onDeleteGoal
}) {
  const todayStr = getSaoPauloDateStr();
  const occupied = countOccupiedNinetyDayGoalSlots(goals);
  const canAdd = occupied < MAX_ACTIVE_NINETY_DAY_GOALS;

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

  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState(defaultCatName);
  const [newAmount, setNewAmount] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newStartDate, setNewStartDate] = useState(todayStr);
  const [newDirection, setNewDirection] = useState('accumulate');
  const [formError, setFormError] = useState('');

  const [progressGoal, setProgressGoal] = useState(null);
  const [progressAmount, setProgressAmount] = useState('');
  const [progressDate, setProgressDate] = useState(todayStr);
  const [progressNote, setProgressNote] = useState('');
  const [progressError, setProgressError] = useState('');

  const [expandedCycles, setExpandedCycles] = useState({});
  const [expandedLogs, setExpandedLogs] = useState({});
  const [editingGoal, setEditingGoal] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState(defaultCatName);

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

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    const validNames = activeCategories.map(c => typeof c === 'string' ? c : c.name);
    if (validNames.length > 0 && !validNames.includes(newCategory)) {
      setNewCategory(validNames[0]);
    }
  }, [activeCategories, newCategory]);

  const livePreview = useMemo(() => {
    if (!newTitle.trim() && !newAmount) return null;
    return previewNinetyDayGoal({
      title: newTitle,
      targetAmount: newAmount || undefined,
      unit: newUnit || undefined,
      direction: newDirection,
      startDate: newStartDate
    }, todayStr);
  }, [newTitle, newAmount, newUnit, newDirection, newStartDate, todayStr]);

  useEffect(() => {
    if (!newTitle.trim()) return;
    const parsed = parseGoalText(newTitle);
    if (parsed.amount != null) setNewAmount(String(parsed.amount));
    if (parsed.unit) setNewUnit(parsed.unitLabel || parsed.unit);
    if (parsed.direction) setNewDirection(parsed.direction);
  }, [newTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedGoals = useMemo(() => {
    const rank = { active: 0, expired: 1, completed: 2, archived: 3 };
    return [...(goals || [])].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  }, [goals]);

  const resetAddForm = () => {
    setNewTitle('');
    setNewDescription('');
    setNewAmount('');
    setNewUnit('');
    setNewStartDate(todayStr);
    setNewDirection('accumulate');
    setFormError('');
    setShowAddModal(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setFormError('Dê um nome à meta (ex: Quero perder 9 quilos).');
      return;
    }
    if (!livePreview?.valid) {
      setFormError(livePreview?.error || 'Informe um valor numérico (ex: 9 quilos, 180 horas).');
      return;
    }
    try {
      await onAddGoal({
        title: newTitle.trim(),
        description: newDescription.trim(),
        category: newCategory,
        targetAmount: livePreview.targetAmount,
        unit: livePreview.unit,
        unitLabel: livePreview.unitLabel,
        direction: livePreview.direction,
        startDate: livePreview.startDate
      });
      resetAddForm();
    } catch (err) {
      setFormError(err.message || 'Não foi possível criar a meta.');
    }
  };

  const openProgress = (goal) => {
    setProgressGoal(goal);
    setProgressAmount('');
    setProgressNote('');
    const clamped = todayStr < goal.startDate ? goal.startDate : (todayStr > goal.endDate ? goal.endDate : todayStr);
    setProgressDate(clamped);
    setProgressError('');
  };

  const handleProgress = async (e) => {
    e.preventDefault();
    if (!progressGoal) return;
    const amount = Number(String(progressAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount === 0) {
      setProgressError('Informe um avanço diferente de zero.');
      return;
    }
    try {
      await onLogProgress(progressGoal.id, {
        amount,
        date: progressDate,
        note: progressNote.trim()
      });
      setProgressGoal(null);
    } catch (err) {
      setProgressError(err.message || 'Não foi possível registrar o avanço.');
    }
  };

  const promptDeleteGoal = (goal) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Meta de 90 Dias',
      message: `Deseja realmente excluir "${goal.title}"?\nTodos os avanços e as submetas de 30/15/7 dias serão removidos e as recompensas estornadas.`,
      confirmText: 'Sim, Excluir Meta',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteGoal) onDeleteGoal(goal.id);
        closeConfirmModal();
      }
    });
  };

  const promptDeleteLog = (goal, log) => {
    setConfirmModal({
      isOpen: true,
      title: 'Estornar Avanço',
      message: `Remover o avanço de ${formatGoalAmount(log.amount, goal.unit, goal.unitLabel)} em ${formatDateBr(log.date, { withYear: true })}? O progresso será recompilado na semana, quinzena, mês e na meta de 90 dias.`,
      confirmText: 'Estornar',
      cancelText: 'Cancelar',
      confirmVariant: 'warning',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteLog) onDeleteLog(goal.id, log.id);
        closeConfirmModal();
      }
    });
  };

  const startEdit = (goal) => {
    setEditingGoal(goal);
    setEditTitle(goal.title);
    setEditDescription(goal.description || '');
    setEditCategory(goal.category || defaultCatName);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editingGoal || !editTitle.trim()) return;
    await onUpdateGoal(editingGoal.id, {
      title: editTitle.trim(),
      description: editDescription.trim(),
      category: editCategory
    });
    setEditingGoal(null);
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#fff',
    fontSize: '0.9rem'
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🏔️</span> Metas de 90 Dias
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', maxWidth: '640px' }}>
            Até 3 grandes objetivos. Cada um é quebrado automaticamente em 3 meses, 6 quinzenas e 12 semanas.
            Registrar um avanço atualiza todos os ciclos maiores.
          </p>
        </div>
        <button
          onClick={() => canAdd && setShowAddModal(true)}
          disabled={!canAdd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '12px',
            background: canAdd
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              : 'rgba(148, 163, 184, 0.18)',
            color: canAdd ? '#000' : '#94a3b8',
            fontWeight: 800,
            fontSize: '0.9rem',
            border: 'none',
            cursor: canAdd ? 'pointer' : 'not-allowed',
            boxShadow: canAdd ? '0 4px 15px rgba(245, 158, 11, 0.35)' : 'none'
          }}
          title={canAdd ? 'Cadastrar nova meta' : 'Limite de 3 metas em andamento atingido'}
        >
          <Plus size={18} /> Nova Meta ({occupied}/{MAX_ACTIVE_NINETY_DAY_GOALS})
        </button>
      </div>

      {sortedGoals.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
          <Mountain size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhuma meta de 90 dias cadastrada.</p>
          <p style={{ fontSize: '0.85rem' }}>Ex: “Quero perder 9 quilos” ou “Quero estudar 180 horas” — o Grimório quebra sozinho em mês, quinzena e semana.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sortedGoals.map((goal) => {
            const pace = PACE_META[goal.status === 'completed' ? 'completed' : (goal.pace || 'on_track')];
            const status = STATUS_META[goal.status] || STATUS_META.active;
            const breakdown = describeCycleBreakdown(goal);
            const catObj = activeCategories.find(c => (typeof c === 'string' ? c : c.name) === goal.category);
            const catColor = catObj?.color || '#f59e0b';
            const showCycles = !!expandedCycles[goal.id];
            const showLogs = !!expandedLogs[goal.id];
            const logs = goal.logs || [];

            return (
              <div
                key={goal.id}
                className="rpg-card"
                style={{
                  padding: '20px',
                  borderLeft: `4px solid ${goal.status === 'completed' ? '#34d399' : catColor}`,
                  background: goal.status === 'archived' ? 'rgba(19, 23, 34, 0.55)' : '#131722'
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', marginBottom: '12px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>{goal.title}</h3>
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px', background: `${catColor}18`, color: catColor, border: `1px solid ${catColor}40`, fontWeight: 700 }}>
                        {goal.category}
                      </span>
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px', background: pace.bg, color: pace.color, fontWeight: 800 }}>
                        {pace.label}
                      </span>
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px', color: status.color, fontWeight: 700 }}>
                        {status.label}
                      </span>
                    </div>
                    {goal.description && (
                      <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '6px' }}>{goal.description}</p>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.78rem', color: '#94a3b8' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={13} /> {formatDateBr(goal.startDate, { withYear: true })} → {formatDateBr(goal.endDate, { withYear: true })}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> {goal.daysElapsed}/90 dias · {goal.daysLeft} restantes</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(goal.status === 'active' || goal.status === 'expired') && (
                      <button
                        type="button"
                        onClick={() => openProgress(goal)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '10px',
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          color: '#000',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <TrendingUp size={15} /> Registrar avanço
                      </button>
                    )}
                    <button type="button" onClick={() => startEdit(goal)} title="Editar" style={{ padding: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                      <Pencil size={15} />
                    </button>
                    {goal.status === 'active' && (
                      <button
                        type="button"
                        title="Arquivar (libera o slot)"
                        onClick={() => onUpdateGoal(goal.id, { status: 'archived' })}
                        style={{ padding: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                      >
                        <Archive size={15} />
                      </button>
                    )}
                    <button type="button" onClick={() => promptDeleteGoal(goal)} title="Excluir" style={{ padding: '8px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', border: 'none', color: '#f87171', cursor: 'pointer' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                    {formatGoalAmount(goal.currentAmount, goal.unit, goal.unitLabel)}
                    <span style={{ color: '#64748b', fontWeight: 600 }}> / {formatGoalAmount(goal.targetAmount, goal.unit, goal.unitLabel)}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 800 }}>{goal.percent}%</div>
                </div>
                <ProgressBar percent={goal.percent} color={goal.status === 'completed' ? '#34d399' : '#f59e0b'} />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '14px' }}>
                  {[
                    { key: 'week', cycle: goal.currentWeek, color: '#38bdf8', hint: breakdown.week },
                    { key: 'fortnight', cycle: goal.currentFortnight, color: '#a855f7', hint: breakdown.fortnight },
                    { key: 'month', cycle: goal.currentMonth, color: '#f59e0b', hint: breakdown.month }
                  ].map(({ key, cycle, color, hint }) => {
                    if (!cycle) return null;
                    const p = cycle.targetAmount > 0 ? Math.min(100, Math.round((cycle.currentAmount / cycle.targetAmount) * 100)) : 0;
                    return (
                      <div key={key} className="glass-panel" style={{ padding: '12px 14px', borderColor: `${color}33` }}>
                        <div style={{ fontSize: '0.7rem', color, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '4px' }}>
                          {CYCLE_DEFS[key].label} {cycle.index}
                        </div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                          {formatGoalAmount(cycle.currentAmount, goal.unit, goal.unitLabel)}
                          <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.78rem' }}> / {formatGoalAmount(cycle.targetAmount, goal.unit, goal.unitLabel)}</span>
                        </div>
                        <div style={{ margin: '8px 0 6px' }}><ProgressBar percent={p} color={color} height={6} /></div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{hint}</div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedCycles(prev => ({ ...prev, [goal.id]: !prev[goal.id] }))}
                  style={{ marginTop: '14px', background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {showCycles ? <>Recolher ciclos <ChevronUp size={14} /></> : <>Ver 12 semanas · 6 quinzenas · 3 meses <ChevronDown size={14} /></>}
                </button>

                {showCycles && (
                  <div style={{ marginTop: '10px', display: 'grid', gap: '16px' }}>
                    {['week', 'fortnight', 'month'].map((kind) => (
                      <div key={kind}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {CYCLE_DEFS[kind].plural}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {(goal.cycles?.[kind] || []).map(cycle => (
                            <CycleRow
                              key={cycle.id}
                              cycle={cycle}
                              kind={kind}
                              unit={goal.unit}
                              unitLabel={goal.unitLabel}
                              currentId={kind === 'week' ? goal.currentWeek?.id : kind === 'fortnight' ? goal.currentFortnight?.id : goal.currentMonth?.id}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {logs.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                        Avanços registrados ({logs.length})
                      </span>
                      {logs.length > 4 && (
                        <button
                          type="button"
                          onClick={() => setExpandedLogs(prev => ({ ...prev, [goal.id]: !prev[goal.id] }))}
                          style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                        >
                          {showLogs ? 'Recolher' : `Ver todos (${logs.length})`}
                        </button>
                      )}
                    </div>
                    {(showLogs ? logs : logs.slice(0, 4)).map(log => (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.04)',
                          marginBottom: '4px',
                          fontSize: '0.8rem',
                          color: '#94a3b8'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <Flame size={13} color="#f59e0b" />
                          <span style={{ color: '#fbbf24', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                            +{formatGoalAmount(log.amount, goal.unit, goal.unitLabel)}
                          </span>
                          <span style={{ color: log.note ? '#cbd5e1' : '#64748b', fontStyle: log.note ? 'normal' : 'italic' }}>
                            {log.note || 'Sem anotação'}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                            S{log.weekIndex} · Q{log.fortnightIndex} · M{log.monthIndex}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{formatDateBr(log.date, { withYear: true })}</span>
                          <button type="button" onClick={() => promptDeleteLog(goal, log)} title="Estornar" style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-panel modal-sheet" style={{ maxWidth: '560px', width: '100%', padding: '28px', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24' }}>🏔️ Nova Meta de 90 Dias</h3>
              <button type="button" onClick={resetAddForm} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '16px' }}>
              Escreva o objetivo como falaria. O Grimório interpreta o número e quebra em 30, 15 e 7 dias.
            </p>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>O que você quer alcançar? *</label>
                <input style={inputStyle} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder='Ex: Quero perder 9 quilos' autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Contexto (opcional)</label>
                <input style={inputStyle} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Por que essa meta importa agora?" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Valor em 90 dias</label>
                  <input style={inputStyle} type="number" step="any" min="0" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="9" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Unidade</label>
                  <input style={inputStyle} value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="kg, horas, páginas..." />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Categoria</label>
                  <select style={inputStyle} value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                    {activeCategories.map(c => {
                      const name = typeof c === 'string' ? c : c.name;
                      return <option key={name} value={name}>{name}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Início</label>
                  <input style={inputStyle} type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { id: 'accumulate', label: 'Acumular (estudar, produzir)' },
                  { id: 'reduce', label: 'Reduzir (perder, quitar)' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setNewDirection(opt.id)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: newDirection === opt.id ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.08)',
                      background: newDirection === opt.id ? 'rgba(245,158,11,0.12)' : 'transparent',
                      color: newDirection === opt.id ? '#fbbf24' : '#94a3b8',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {livePreview?.valid && (
                <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fbbf24', fontWeight: 800, fontSize: '0.82rem', marginBottom: 8 }}>
                    <Sparkles size={14} /> Quebra automática até {formatDateBr(livePreview.endDate, { withYear: true })}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#e2e8f0', lineHeight: 1.55 }}>
                    <div>3 meses de {formatGoalAmount(livePreview.monthTarget, livePreview.unit, livePreview.unitLabel)}</div>
                    <div>6 quinzenas de {formatGoalAmount(livePreview.fortnightTarget, livePreview.unit, livePreview.unitLabel)}</div>
                    <div>12 semanas de {formatGoalAmount(livePreview.weekTarget, livePreview.unit, livePreview.unitLabel)}</div>
                  </div>
                </div>
              )}

              {formError && (
                <div style={{ color: '#f87171', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} /> {formError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" onClick={resetAddForm} style={{ padding: '10px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button type="submit" style={{ padding: '10px 18px', borderRadius: '10px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 800 }}>Criar meta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {progressGoal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-panel modal-sheet" style={{ maxWidth: '480px', width: '100%', padding: '28px', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '20px' }}>
            <h3 className="font-cinzel" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24', marginBottom: 6 }}>Registrar avanço</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '16px' }}>
              {progressGoal.title}. O valor entra na semana, quinzena, mês e na meta de 90 dias.
            </p>
            <form onSubmit={handleProgress} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                  Quanto avançou agora? ({progressGoal.unitLabel || progressGoal.unit || 'unidades'}) *
                </label>
                <input
                  style={{ ...inputStyle, color: '#fbbf24', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '1.1rem' }}
                  type="number"
                  step="any"
                  value={progressAmount}
                  onChange={(e) => setProgressAmount(e.target.value)}
                  placeholder={progressGoal.unit === 'kg' ? '0.75' : '1'}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Data</label>
                <input style={inputStyle} type="date" min={progressGoal.startDate} max={progressGoal.endDate} value={progressDate} onChange={(e) => setProgressDate(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Anotação (opcional)</label>
                <input style={inputStyle} value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="Ex: treino + déficit de 500 kcal" />
              </div>
              {progressError && <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{progressError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setProgressGoal(null)} style={{ padding: '10px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button type="submit" style={{ padding: '10px 18px', borderRadius: '10px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 800 }}>Lançar avanço</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingGoal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-panel modal-sheet" style={{ maxWidth: '480px', width: '100%', padding: '28px', borderRadius: '20px' }}>
            <h3 className="font-cinzel" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24', marginBottom: 14 }}>Editar meta</h3>
            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input style={inputStyle} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              <input style={inputStyle} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Contexto" />
              <select style={inputStyle} value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                {activeCategories.map(c => {
                  const name = typeof c === 'string' ? c : c.name;
                  return <option key={name} value={name}>{name}</option>;
                })}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setEditingGoal(null)} style={{ padding: '10px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button type="submit" style={{ padding: '10px 18px', borderRadius: '10px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 800 }}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
