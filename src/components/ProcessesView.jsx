import React, { useState } from 'react';
import { Plus, Layers, CheckCircle2, Zap, Sparkles, Trash2, ArrowUpRight, FileCheck, Check, MessageSquare, AlertCircle } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

export function ProcessesView({ processes, processSteps, onAddProcess, onStepProcess, onDeleteProcess }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProcessForStep, setSelectedProcessForStep] = useState(null);
  const [stepUnits, setStepUnits] = useState(1);
  const [stepNote, setStepNote] = useState('');

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
  const [newCategory, setNewCategory] = useState('Trabalho');
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
  };

  const handleConfirmStep = (e) => {
    e.preventDefault();
    if (!selectedProcessForStep) return;

    const units = parseInt(stepUnits, 10);
    if (units <= 0) return;

    onStepProcess(selectedProcessForStep.id, {
      unitsAdded: units,
      stepNote: stepNote.trim()
    });

    setSelectedProcessForStep(null);
    setStepNote('');
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

            // Filter recent steps for this process
            const recentSteps = (processSteps || [])
              .filter(s => s.processId === process.id)
              .slice(0, 3);

            return (
              <div
                key={process.id}
                className="rpg-card"
                style={{
                  padding: '20px',
                  borderLeft: isFinished ? '4px solid #10b981' : '4px solid #06b6d4',
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
                          background: 'rgba(6, 182, 212, 0.15)',
                          color: '#38bdf8',
                          border: '1px solid rgba(6, 182, 212, 0.3)',
                          fontWeight: 700
                        }}
                      >
                        {process.category}
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
                {recentSteps.length > 0 && (
                  <div style={{ marginTop: '8px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                      Últimos avanços registrados:
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {recentSteps.map(st => (
                        <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>
                          <Check size={12} color="#06b6d4" />
                          <span style={{ color: '#38bdf8', fontWeight: 700 }}>+{st.unitsAdded} {process.unitName}:</span>
                          <span>{st.stepNote || 'Avanço sem anotação'}</span>
                        </div>
                      ))}
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
                  <input
                    type="text"
                    placeholder="Trabalho, Auditoria"
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
                  />
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
