import React, { useState } from 'react';
import { Plus, Layers, CheckCircle2, Zap, Sparkles, Trash2, ArrowUpRight, FileCheck, Check, MessageSquare, AlertCircle, Clock, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { getSaoPauloNowDateTimeLocal } from '../utils/timeUtils';

const formatStepDateTime = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';

  const dateStr = d.toLocaleDateString('pt-BR');
  const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} às ${timeStr}`;
};

const getNowDateTimeLocal = () => {
  return getSaoPauloNowDateTimeLocal();
};

export function ProcessesView({ processes, processSteps, questCategories = [], rankings, onAddProcess, onStepProcess, onDeleteProcess }) {
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

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProcessForStep, setSelectedProcessForStep] = useState(null);
  const [stepUnits, setStepUnits] = useState(1);
  const [stepNote, setStepNote] = useState('');
  const [stepDateTime, setStepDateTime] = useState('');
  const [expandedHistory, setExpandedHistory] = useState({});

  const toggleHistory = (processId) => {
    setExpandedHistory(prev => ({ ...prev, [processId]: !prev[processId] }));
  };

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

  const promptDeleteProcess = (process) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Lote de Processos',
      message: `Deseja realmente excluir o lote "${process.title}"?\nTodo o histórico de etapas será removido.`,
      confirmText: 'Sim, Excluir Lote',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteProcess) onDeleteProcess(process.id);
        closeConfirmModal();
      }
    });
  };

  // New Process Form
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState(activeCategories[0]?.name || 'Trabalho');
  const [newUnitName, setNewUnitName] = useState('processos');
  const [newTotalUnits, setNewTotalUnits] = useState('10');
  const [newXpPerUnit, setNewXpPerUnit] = useState('20');
  const [newCoinsPerUnit, setNewCoinsPerUnit] = useState('5');
  const [newNotes, setNewNotes] = useState('');

  const handleCreateProcess = (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newTotalUnits) return;

    onAddProcess({
      title: newTitle.trim(),
      category: newCategory,
      unitName: newUnitName.trim() || 'unidades',
      totalUnits: parseInt(newTotalUnits, 10),
      xpPerUnit: parseInt(newXpPerUnit, 10) || 20,
      coinsPerUnit: parseInt(newCoinsPerUnit, 10) || 5,
      notes: newNotes.trim()
    });

    setNewTitle('');
    setNewCategory(activeCategories[0]?.name || 'Trabalho');
    setNewUnitName('processos');
    setNewTotalUnits('10');
    setNewNotes('');
    setShowAddModal(false);
  };

  const handleOpenStepModal = (process, defaultUnits = 1) => {
    const remaining = Math.max(1, process.totalUnits - process.completedUnits);
    setSelectedProcessForStep(process);
    setStepUnits(Math.min(remaining, defaultUnits));
    setStepNote('');
    setStepDateTime(getNowDateTimeLocal());
  };

  const handleConfirmStep = (e) => {
    e.preventDefault();
    if (!selectedProcessForStep) return;

    const units = parseInt(stepUnits, 10);
    if (units <= 0) return;

    onStepProcess(selectedProcessForStep.id, {
      unitsAdded: units,
      stepNote: stepNote.trim(),
      timestamp: stepDateTime ? new Date(stepDateTime).toISOString() : new Date().toISOString()
    });

    setSelectedProcessForStep(null);
    setStepNote('');
    setStepDateTime('');
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>⚡</span> Linha de Operações (Processos em Lote)
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Gerencie esteiras de tarefas incrementais (ex: analisar 10 processos, revisar 15 relatórios). Avance passo a passo!
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
            color: '#000',
            fontWeight: 800,
            fontSize: '0.9rem',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(6, 182, 212, 0.35)',
            transition: 'transform 0.15s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Plus size={18} /> Novo Lote de Processos
        </button>
      </div>

      {/* Process Cards */}
      {(!processes || processes.length === 0) ? (
        <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
          <Layers size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhum lote de processos ativo.</p>
          <p style={{ fontSize: '0.85rem' }}>Cadastre uma meta em lote (ex: analisar 10 processos) para acompanhar seu avanço!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {processes.map(process => {
            const completed = process.completedUnits || 0;
            const total = process.totalUnits || 1;
            const percent = Math.min(100, Math.round((completed / total) * 100));
            const isFinished = process.status === 'completed' || completed >= total;
            const remaining = Math.max(0, total - completed);

            // Filter and sort steps for this process (newest first)
            const processStepsForThis = (processSteps || [])
              .filter(s => s.processId === process.id)
              .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));

            const isHistoryExpanded = !!expandedHistory[process.id];
            const displayedSteps = isHistoryExpanded ? processStepsForThis : processStepsForThis.slice(0, 3);

            const catName = process.category;
            const catObj = activeCategories.find(c => (typeof c === 'string' ? c : c.name) === catName);
            const catColor = catObj?.color || '#38bdf8';

            return (
              <div
                key={process.id}
                className="rpg-card"
                style={{
                  padding: '20px',
                  borderLeft: isFinished ? '4px solid #10b981' : `4px solid ${catColor}`,
                  background: isFinished ? 'rgba(19, 23, 34, 0.7)' : '#131722'
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '14px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: isFinished ? '#94a3b8' : '#f8fafc' }}>
                        {process.title}
                      </h3>
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
                          gap: '6px'
                        }}
                      >
                        <span>{process.category}</span>
                        {rankings?.categories?.[process.category] && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 900,
                              padding: '0 4px',
                              borderRadius: '3px',
                              background: rankings.categories[process.category].currentRank.bg,
                              color: rankings.categories[process.category].currentRank.textColor,
                              border: `1px solid ${rankings.categories[process.category].currentRank.border}`
                            }}
                          >
                            {rankings.categories[process.category].currentRank.name}
                          </span>
                        )}
                      </span>
                    </div>

                    {process.notes && (
                      <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        {process.notes}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                        <Zap size={14} /> +{process.xpPerUnit} XP / {process.unitName.slice(0, -1) || 'unid'}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                        +{process.coinsPerUnit} 🪙 cada
                      </span>
                    </div>

                    <button
                      onClick={() => promptDeleteProcess(process)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '6px',
                        borderRadius: '8px'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.color = '#f87171'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                      title="Excluir lote"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Progress Bar & Counter */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                      Progresso: <strong style={{ color: '#38bdf8' }}>{completed}</strong> de <strong>{total}</strong> {process.unitName}
                    </span>
                    <span style={{ color: '#38bdf8', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                      {percent}% Concluído
                    </span>
                  </div>

                  <div className="progress-container" style={{ height: '10px' }}>
                    <div className="progress-fill-process" style={{ width: `${percent}%` }} />
                  </div>
                </div>

                {/* Quick Action Increment Buttons */}
                {!isFinished ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginRight: '4px' }}>
                      Avançar:
                    </span>

                    <button
                      onClick={() => handleOpenStepModal(process, 1)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        background: 'rgba(6, 182, 212, 0.15)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        color: '#38bdf8',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      +1 {process.unitName.slice(0, -1) || 'item'}
                    </button>

                    {remaining >= 2 && (
                      <button
                        onClick={() => handleOpenStepModal(process, 2)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          background: 'rgba(6, 182, 212, 0.15)',
                          border: '1px solid rgba(6, 182, 212, 0.3)',
                          color: '#38bdf8',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                      >
                        +2 {process.unitName}
                      </button>
                    )}

                    {remaining >= 5 && (
                      <button
                        onClick={() => handleOpenStepModal(process, 5)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          background: 'rgba(6, 182, 212, 0.15)',
                          border: '1px solid rgba(6, 182, 212, 0.3)',
                          color: '#38bdf8',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                      >
                        +5 {process.unitName}
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenStepModal(process, 1)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#94a3b8',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      + Personalizado...
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '0.9rem', fontWeight: 800, padding: '8px 0' }}>
                    <CheckCircle2 size={18} /> Todos os {total} {process.unitName} foram analisados com sucesso! (+100 XP Bônus)
                  </div>
                )}

                {/* Recent step logs */}
                {processStepsForThis.length > 0 && (
                  <div style={{ marginTop: '8px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                        Últimos avanços registrados ({processStepsForThis.length}):
                      </span>
                      {processStepsForThis.length > 3 && (
                        <button
                          type="button"
                          onClick={() => toggleHistory(process.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#38bdf8',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: 600
                          }}
                          onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                          onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                        >
                          {isHistoryExpanded ? (
                            <>Recolher <ChevronUp size={13} /></>
                          ) : (
                            <>Ver todos ({processStepsForThis.length}) <ChevronDown size={13} /></>
                          )}
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {displayedSteps.map(st => {
                        const stepTime = st.timestamp || st.createdAt;
                        const formattedDate = formatStepDateTime(stepTime);

                        return (
                          <div
                            key={st.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '6px 12px',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              background: 'rgba(255, 255, 255, 0.02)',
                              border: '1px solid rgba(255, 255, 255, 0.04)',
                              fontSize: '0.8rem',
                              color: '#94a3b8'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                              <Check size={13} color="#06b6d4" style={{ flexShrink: 0 }} />
                              <span style={{ color: '#38bdf8', fontWeight: 700, flexShrink: 0 }}>
                                +{st.unitsAdded} {st.unitsAdded === 1 ? (process.unitName?.replace(/s$/, '') || 'item') : process.unitName}:
                              </span>
                              <span style={{ color: st.stepNote ? '#cbd5e1' : '#64748b', fontStyle: st.stepNote ? 'normal' : 'italic' }}>
                                {st.stepNote || 'Avanço sem anotação'}
                              </span>
                            </div>

                            {formattedDate && (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  color: '#94a3b8',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontFamily: 'var(--font-mono)',
                                  flexShrink: 0,
                                  backgroundColor: 'rgba(6, 182, 212, 0.08)',
                                  border: '1px solid rgba(6, 182, 212, 0.15)',
                                  padding: '2px 8px',
                                  borderRadius: '6px'
                                }}
                                title="Data e hora em que o avanço foi registrado"
                              >
                                <Clock size={11} color="#38bdf8" />
                                {formattedDate}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* Modal Avançar Passo do Processo */}
      {selectedProcessForStep && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
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
              maxWidth: '480px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              borderRadius: '20px'
            }}
          >
            <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginBottom: '6px' }}>
              ⚡ Registrar Avanço no Lote
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '18px' }}>
              {selectedProcessForStep.title} (Restam {selectedProcessForStep.totalUnits - selectedProcessForStep.completedUnits} {selectedProcessForStep.unitName})
            </p>

            <form onSubmit={handleConfirmStep} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Quantidade de {selectedProcessForStep.unitName} analisados agora *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedProcessForStep.totalUnits - selectedProcessForStep.completedUnits}
                  value={stepUnits}
                  onChange={(e) => setStepUnits(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(6, 182, 212, 0.4)',
                    color: '#38bdf8',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    fontFamily: 'var(--font-mono)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Data e Hora do Registro
                </label>
                <input
                  type="datetime-local"
                  value={stepDateTime}
                  onChange={(e) => setStepDateTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontFamily: 'var(--font-mono)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Nota / Identificador do Item (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Processos #204 e #205 finalizados com parecer"
                  value={stepNote}
                  onChange={(e) => setStepNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              {/* Reward preview */}
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <span style={{ color: '#94a3b8' }}>Recompensa estimada:</span>
                <span style={{ color: '#38bdf8', fontWeight: 800 }}>
                  +{parseInt(stepUnits || 0, 10) * selectedProcessForStep.xpPerUnit} XP & +{parseInt(stepUnits || 0, 10) * selectedProcessForStep.coinsPerUnit} 🪙
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedProcessForStep(null)}
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
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                    color: '#000',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Registrar e Ganhar Foco ⚡
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Criar Processo */}
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
              maxWidth: '500px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: '20px'
            }}
          >
            <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', marginBottom: '18px' }}>
              ⚡ Novo Lote de Processos / Itens
            </h3>

            <form onSubmit={handleCreateProcess} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Título do Lote *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Analisar 10 Processos Judiciais"
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

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Total de Unidades / Itens *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="10"
                    value={newTotalUnits}
                    onChange={(e) => setNewTotalUnits(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.95rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Nome da Unidade
                  </label>
                  <input
                    type="text"
                    placeholder="processos, relatórios, laudos"
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
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

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Categoria
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
                    {activeCategories.map(c => {
                      const name = typeof c === 'string' ? c : c.name;
                      return (
                        <option key={name} value={name} style={{ background: '#1a2030', color: '#fff' }}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    XP por Unidade Concluída
                  </label>
                  <input
                    type="number"
                    min="5"
                    value={newXpPerUnit}
                    onChange={(e) => setNewXpPerUnit(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.95rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Descrição / Notas
                </label>
                <textarea
                  placeholder="Instruções ou escopo deste lote de processos..."
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
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
                    background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                    color: '#000',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Criar Lote de Processos
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
