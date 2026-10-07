import React, { useMemo, useState } from 'react';
import {
  Pill,
  Plus,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Clock,
  Calendar,
  Search,
  AlertCircle,
  Check
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { getSaoPauloDateStr, getSaoPauloNowDateTimeLocal } from '../utils/timeUtils';

const ACCENT = '#2dd4bf';

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

const nowParts = () => {
  const local = getSaoPauloNowDateTimeLocal();
  const [date, time] = local.split('T');
  return { date: date || getSaoPauloDateStr(), time: time || '08:00' };
};

const formatAmount = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  return String(Math.round(value * 1000) / 1000).replace('.', ',');
};

const formatWhen = (log) => {
  if (!log?.date) return '';
  const [year, month, day] = log.date.split('-');
  return `${day}/${month}/${year}${log.time ? ` às ${log.time}` : ''}`;
};

const emptySupplement = () => ({
  name: '',
  unit: 'cápsula',
  defaultDose: '1',
  notes: ''
});

export function SupplementsView({
  supplements = [],
  supplementLogs = [],
  onAddSupplement,
  onUpdateSupplement,
  onDeleteSupplement,
  onLogIntake,
  onUpdateLog,
  onDeleteLog
}) {
  const [subTab, setSubTab] = useState('log');
  const [search, setSearch] = useState('');
  const [filterId, setFilterId] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [supplementModal, setSupplementModal] = useState(null);
  const [intakeModal, setIntakeModal] = useState(null);
  const [form, setForm] = useState(emptySupplement());
  const [intake, setIntake] = useState({ supplementId: '', amount: '1', date: '', time: '', notes: '' });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const active = useMemo(
    () => (supplements || []).filter(item => item && !item.archived),
    [supplements]
  );
  const catalog = useMemo(
    () => (supplements || []).filter(item => item && (showArchived || !item.archived)),
    [supplements, showArchived]
  );

  const logs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (supplementLogs || [])
      .filter(log => {
        if (filterId !== 'all' && log.supplementId !== filterId) return false;
        if (!query) return true;
        const supplement = (supplements || []).find(item => item.id === log.supplementId);
        const haystack = `${supplement?.name || ''} ${log.notes || ''} ${log.unit || ''}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice()
      .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
  }, [supplementLogs, supplements, filterId, search]);

  const todayStr = getSaoPauloDateStr();
  const todayLogs = (supplementLogs || []).filter(log => log.date === todayStr);
  const todayBySupplement = active.map(item => {
    const taken = todayLogs
      .filter(log => log.supplementId === item.id)
      .reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
    return { ...item, taken, doses: todayLogs.filter(log => log.supplementId === item.id).length };
  });

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const alert = (title, message) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText: 'Entendi',
      cancelText: null,
      confirmVariant: 'warning',
      icon: AlertCircle,
      onConfirm: closeConfirm
    });
  };

  const openCreate = () => {
    setForm(emptySupplement());
    setSupplementModal({ mode: 'create' });
  };

  const openEditSupplement = (item) => {
    setForm({
      name: item.name || '',
      unit: item.unit || 'dose',
      defaultDose: item.defaultDose == null ? '' : String(item.defaultDose),
      notes: item.notes || ''
    });
    setSupplementModal({ mode: 'edit', id: item.id });
  };

  const openIntake = (preset) => {
    const parts = nowParts();
    const supplement = preset || active[0];
    setIntake({
      supplementId: supplement?.id || '',
      amount: supplement?.defaultDose == null ? '1' : String(supplement.defaultDose),
      date: parts.date,
      time: parts.time,
      notes: ''
    });
    setIntakeModal({ mode: 'create' });
  };

  const openEditLog = (log) => {
    setIntake({
      supplementId: log.supplementId,
      amount: String(log.amount ?? ''),
      date: log.date || '',
      time: log.time || '',
      notes: log.notes || ''
    });
    setIntakeModal({ mode: 'edit', id: log.id });
  };

  const saveSupplement = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      alert('Nome obrigatório', 'Dê um nome ao suplemento, como Omega 3 ou Creatina.');
      return;
    }
    const payload = {
      name: form.name.trim(),
      unit: form.unit.trim() || 'dose',
      defaultDose: form.defaultDose === '' ? null : form.defaultDose,
      notes: form.notes.trim()
    };
    if (supplementModal?.mode === 'edit') onUpdateSupplement?.(supplementModal.id, payload);
    else onAddSupplement?.(payload);
    setSupplementModal(null);
  };

  const saveIntake = (event) => {
    event.preventDefault();
    const amount = Number(String(intake.amount).replace(',', '.'));
    if (!intake.supplementId) {
      alert('Escolha o suplemento', 'Cadastre um suplemento antes de registrar o consumo.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Quantidade inválida', 'A quantidade tomada precisa ser um número maior que zero.');
      return;
    }
    if (!intake.date || !intake.time) {
      alert('Data e hora', 'Informe quando o suplemento foi tomado.');
      return;
    }
    const payload = {
      supplementId: intake.supplementId,
      amount,
      date: intake.date,
      time: intake.time,
      notes: intake.notes.trim()
    };
    if (intakeModal?.mode === 'edit') onUpdateLog?.(intakeModal.id, payload);
    else onLogIntake?.(payload);
    setIntakeModal(null);
  };

  const askDeleteSupplement = (item) => {
    const count = (supplementLogs || []).filter(log => log.supplementId === item.id).length;
    setConfirmModal({
      isOpen: true,
      title: 'Excluir suplemento',
      message: count
        ? `Excluir "${item.name}" também apaga ${count} registro(s) de consumo. Esta ação não pode ser desfeita.`
        : `Excluir "${item.name}"? Esta ação não pode ser desfeita.`,
      confirmText: 'Sim, excluir',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        onDeleteSupplement?.(item.id);
        closeConfirm();
      }
    });
  };

  const askDeleteLog = (log) => {
    const name = (supplements || []).find(item => item.id === log.supplementId)?.name || 'suplemento';
    setConfirmModal({
      isOpen: true,
      title: 'Excluir registro',
      message: `Apagar a tomada de ${formatAmount(log.amount)} ${log.unit || ''} de ${name} em ${formatWhen(log)}?`,
      confirmText: 'Sim, excluir',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        onDeleteLog?.(log.id);
        closeConfirm();
      }
    });
  };

  return (
    <div style={{ animation: 'fadeIn 0.35s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.7rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Pill size={26} color={ACCENT} /> Suplementos
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginTop: '4px' }}>
            Cadastre o que você toma e registre cada dose com data, hora e quantidade.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={openCreate} style={ghostButton}>
            <Plus size={16} /> Novo suplemento
          </button>
          <button type="button" onClick={() => openIntake()} disabled={active.length === 0} style={primaryButton(active.length === 0)}>
            <Check size={16} /> Registrar tomada
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '8px', marginBottom: '16px', display: 'flex', gap: '6px', width: 'fit-content' }}>
        {[
          { id: 'log', label: 'Registros' },
          { id: 'catalog', label: 'Cadastro' }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              background: subTab === tab.id ? 'rgba(45, 212, 191, 0.16)' : 'transparent',
              color: subTab === tab.id ? ACCENT : '#94a3b8'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'log' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            {todayBySupplement.length === 0 && (
              <div className="glass-panel" style={{ padding: '16px', color: '#94a3b8' }}>
                Nenhum suplemento ativo. Cadastre o primeiro para começar o diário.
              </div>
            )}
            {todayBySupplement.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => openIntake(item)}
                className="rpg-card"
                style={{ textAlign: 'left', padding: '14px 16px', cursor: 'pointer', background: '#131722', color: 'inherit' }}
              >
                <div style={{ color: '#cbd5e1', fontWeight: 800 }}>{item.name}</div>
                <div style={{ marginTop: '6px', color: item.taken > 0 ? ACCENT : '#64748b', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                  {item.taken > 0 ? `${formatAmount(item.taken)} ${item.unit} hoje` : 'Nada hoje'}
                </div>
                <div style={{ marginTop: '4px', color: '#64748b', fontSize: '0.75rem' }}>
                  {item.doses} tomada{item.doses === 1 ? '' : 's'} · toque para registrar
                </div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <label style={{ position: 'relative', flex: '1 1 220px' }}>
              <Search size={15} color="#64748b" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nos registros"
                style={{ ...fieldStyle, paddingLeft: '34px' }}
              />
            </label>
            <select value={filterId} onChange={(event) => setFilterId(event.target.value)} style={{ ...fieldStyle, width: 'auto', minWidth: '180px' }}>
              <option value="all">Todos os suplementos</option>
              {(supplements || []).map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          {logs.length === 0 ? (
            <div className="glass-panel" style={{ padding: '28px', textAlign: 'center', color: '#94a3b8' }}>
              Nenhum registro ainda. Quando tomar, anote a dose, a data e a hora.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {logs.map(log => {
                const supplement = (supplements || []).find(item => item.id === log.supplementId);
                return (
                  <article key={log.id} className="glass-panel" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: '#fff' }}>{supplement?.name || 'Suplemento removido'}</div>
                      <div style={{ marginTop: '4px', color: ACCENT, fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                        {formatAmount(log.amount)} {log.unit || supplement?.unit || ''}
                      </div>
                      <div style={{ marginTop: '4px', color: '#94a3b8', fontSize: '0.82rem', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Calendar size={13} /> {formatWhen(log)}</span>
                        {log.notes ? <span>{log.notes}</span> : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <IconButton label="Editar registro" onClick={() => openEditLog(log)}><Pencil size={15} /></IconButton>
                      <IconButton label="Excluir registro" danger onClick={() => askDeleteLog(log)}><Trash2 size={15} /></IconButton>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {subTab === 'catalog' && (
        <>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '12px' }}>
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
            Mostrar arquivados
          </label>
          {catalog.length === 0 ? (
            <div className="glass-panel" style={{ padding: '28px', textAlign: 'center', color: '#94a3b8' }}>
              Nenhum suplemento cadastrado.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {catalog.map(item => (
                <article key={item.id} className="glass-panel" style={{ padding: '16px', opacity: item.archived ? 0.65 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <h3 style={{ fontWeight: 800, color: '#fff' }}>{item.name}</h3>
                    {item.archived ? <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 700 }}>Arquivado</span> : null}
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '8px 0' }}>
                    Unidade: {item.unit || 'dose'}
                    {item.defaultDose != null ? ` · dose usual ${formatAmount(item.defaultDose)}` : ''}
                  </p>
                  {item.notes ? <p style={{ color: '#cbd5e1', fontSize: '0.82rem', marginBottom: '10px' }}>{item.notes}</p> : null}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {!item.archived && (
                      <button type="button" onClick={() => openIntake(item)} style={tinyButton}>Registrar</button>
                    )}
                    <IconButton label="Editar suplemento" onClick={() => openEditSupplement(item)}><Pencil size={15} /></IconButton>
                    <IconButton
                      label={item.archived ? 'Reativar suplemento' : 'Arquivar suplemento'}
                      onClick={() => onUpdateSupplement?.(item.id, { archived: !item.archived })}
                    >
                      {item.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </IconButton>
                    <IconButton label="Excluir suplemento" danger onClick={() => askDeleteSupplement(item)}><Trash2 size={15} /></IconButton>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {supplementModal && (
        <Modal title={supplementModal.mode === 'edit' ? 'Editar suplemento' : 'Novo suplemento'}>
          <form onSubmit={saveSupplement} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Field label="Nome *">
              <input required value={form.name} onChange={(event) => setForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Ex: Omega 3, Creatina" style={fieldStyle} />
            </Field>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Field label="Unidade">
                <input value={form.unit} onChange={(event) => setForm(prev => ({ ...prev, unit: event.target.value }))} placeholder="cápsula, g, ml" style={fieldStyle} />
              </Field>
              <Field label="Dose usual">
                <input type="number" min="0" step="any" value={form.defaultDose} onChange={(event) => setForm(prev => ({ ...prev, defaultDose: event.target.value }))} style={fieldStyle} />
              </Field>
            </div>
            <Field label="Notas">
              <textarea value={form.notes} onChange={(event) => setForm(prev => ({ ...prev, notes: event.target.value }))} rows={3} placeholder="Marca, horário sugerido, observação" style={{ ...fieldStyle, resize: 'vertical' }} />
            </Field>
            <ModalActions onCancel={() => setSupplementModal(null)} submitLabel="Salvar suplemento" />
          </form>
        </Modal>
      )}

      {intakeModal && (
        <Modal title={intakeModal.mode === 'edit' ? 'Editar registro' : 'Registrar tomada'}>
          <form onSubmit={saveIntake} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Field label="Suplemento *">
              <select
                required
                value={intake.supplementId}
                onChange={(event) => {
                  const next = (supplements || []).find(item => item.id === event.target.value);
                  setIntake(prev => ({
                    ...prev,
                    supplementId: event.target.value,
                    amount: next?.defaultDose == null ? prev.amount : String(next.defaultDose)
                  }));
                }}
                style={fieldStyle}
              >
                <option value="">Selecione</option>
                {(supplements || []).filter(item => !item.archived || item.id === intake.supplementId).map(item => (
                  <option key={item.id} value={item.id}>{item.name}{item.archived ? ' (arquivado)' : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Quantidade tomada *">
              <input required type="number" min="0" step="any" value={intake.amount} onChange={(event) => setIntake(prev => ({ ...prev, amount: event.target.value }))} style={fieldStyle} />
            </Field>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Field label="Data *">
                <input required type="date" value={intake.date} onChange={(event) => setIntake(prev => ({ ...prev, date: event.target.value }))} style={fieldStyle} />
              </Field>
              <Field label="Hora *">
                <input required type="time" value={intake.time} onChange={(event) => setIntake(prev => ({ ...prev, time: event.target.value }))} style={fieldStyle} />
              </Field>
            </div>
            <Field label="Nota">
              <input value={intake.notes} onChange={(event) => setIntake(prev => ({ ...prev, notes: event.target.value }))} placeholder="Com o café, depois do treino..." style={fieldStyle} />
            </Field>
            <div style={{ color: '#64748b', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={13} /> A hora fica no fuso de São Paulo.
            </div>
            <ModalActions onCancel={() => setIntakeModal(null)} submitLabel={intakeModal.mode === 'edit' ? 'Salvar alterações' : 'Registrar'} />
          </form>
        </Modal>
      )}

      <ConfirmModal {...confirmModal} onCancel={closeConfirm} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ flex: 1 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, children }) {
  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="glass-panel modal-sheet" style={{ maxWidth: '480px', width: '100%', padding: '28px', border: '1px solid rgba(45, 212, 191, 0.35)', borderRadius: '20px' }}>
        <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: ACCENT, marginBottom: '16px' }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, submitLabel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
      <button type="button" onClick={onCancel} style={{ padding: '10px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
        Cancelar
      </button>
      <button type="submit" style={{ padding: '10px 18px', borderRadius: '10px', background: ACCENT, color: '#042f2e', fontWeight: 800, border: 'none', cursor: 'pointer' }}>
        {submitLabel}
      </button>
    </div>
  );
}

function IconButton({ label, onClick, danger = false, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: '34px',
        height: '34px',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: danger ? 'rgba(244, 63, 94, 0.12)' : 'rgba(255,255,255,0.05)',
        color: danger ? '#fb7185' : '#cbd5e1',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  );
}

const ghostButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 14px',
  borderRadius: '12px',
  background: 'rgba(255,255,255,0.06)',
  color: '#e2e8f0',
  border: '1px solid rgba(255,255,255,0.08)',
  cursor: 'pointer',
  fontWeight: 700
};

const primaryButton = (disabled) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 14px',
  borderRadius: '12px',
  background: disabled ? 'rgba(45, 212, 191, 0.25)' : ACCENT,
  color: '#042f2e',
  border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 800
});

const tinyButton = {
  padding: '7px 10px',
  borderRadius: '9px',
  background: 'rgba(45, 212, 191, 0.16)',
  color: ACCENT,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '0.8rem'
};
