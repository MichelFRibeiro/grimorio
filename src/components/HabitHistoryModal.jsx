import React, { useMemo, useState } from 'react';
import { History, X } from 'lucide-react';
import { addDaysToDateStr, getSaoPauloDateStr } from '../utils/timeUtils';
import {
  formatDurationLabel,
  getHabitCountForDate,
  getHabitDurationForDate,
  getHabitNoteForDate,
  MAX_HABIT_NOTE_LENGTH
} from '../utils/activityDuration';
import { habitMeasureLabel, habitTracksCount, habitTracksTime } from '../utils/habitHomeostasis';

function formatExecutionDate(dateStr, todayStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const short = `${parts[2]}/${parts[1]}/${parts[0]}`;
  if (dateStr === todayStr) return `Hoje · ${short}`;
  if (dateStr === addDaysToDateStr(todayStr, -1)) return `Ontem · ${short}`;
  return short;
}

/**
 * Histórico de execução de um ritual: data, tempo, quantidade e a anotação
 * facultativa de cada dia marcado. Aberto a partir do card e das rotinas.
 */
export function HabitHistoryModal({ habit, onClose, onSaveNote }) {
  const todayStr = getSaoPauloDateStr();
  const [drafts, setDrafts] = useState({});
  const [savingDate, setSavingDate] = useState('');
  const [error, setError] = useState('');

  const entries = useMemo(() => {
    const history = Array.isArray(habit?.history) ? habit.history : [];
    return [...history]
      .filter((dateStr) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr))
      .sort((a, b) => b.localeCompare(a))
      .map((dateStr) => ({
        dateStr,
        minutes: getHabitDurationForDate(habit, dateStr),
        count: getHabitCountForDate(habit, dateStr),
        note: getHabitNoteForDate(habit, dateStr)
      }));
  }, [habit]);

  if (!habit) return null;

  const tracksTime = habitTracksTime(habit);
  const tracksCount = habitTracksCount(habit);
  const countLabel = habitMeasureLabel(habit, 'count');

  const saveNote = async (dateStr) => {
    if (!onSaveNote) return;
    const draft = Object.prototype.hasOwnProperty.call(drafts, dateStr)
      ? drafts[dateStr]
      : getHabitNoteForDate(habit, dateStr);
    setSavingDate(dateStr);
    setError('');
    try {
      const result = await onSaveNote(habit.id, dateStr, draft);
      if (!result) {
        setError('Não foi possível salvar a anotação.');
        return;
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
    } finally {
      setSavingDate('');
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel modal-sheet"
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <h3 className="font-cinzel" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={18} /> Histórico
            </h3>
            <p style={{ margin: '4px 0 0', color: '#f8fafc', fontWeight: 700 }}>{habit.title}</p>
            <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>
              {entries.length
                ? `${entries.length} ${entries.length === 1 ? 'execução registrada' : 'execuções registradas'}`
                : 'Nenhuma execução registrada ainda.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar histórico"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '8px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {entries.length === 0 ? (
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
            Quando o ritual for concluído, a data, o tempo, a quantidade e a anotação aparecem aqui.
          </p>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {entries.map((entry) => {
              const draft = Object.prototype.hasOwnProperty.call(drafts, entry.dateStr)
                ? drafts[entry.dateStr]
                : entry.note;
              const dirty = draft !== entry.note;
              return (
                <li
                  key={entry.dateStr}
                  style={{
                    padding: '12px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ color: '#f8fafc', fontSize: '0.88rem' }}>{formatExecutionDate(entry.dateStr, todayStr)}</strong>
                    <span style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>
                      {tracksTime && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fbbf24' }}>
                          {entry.minutes > 0 ? formatDurationLabel(entry.minutes) : 'sem tempo'}
                        </span>
                      )}
                      {tracksCount && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8' }}>
                          {entry.count > 0 ? `${entry.count} ${countLabel}` : `sem ${countLabel}`}
                        </span>
                      )}
                    </span>
                  </div>
                  {onSaveNote ? (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8' }}>Notas</span>
                      <textarea
                        value={draft}
                        maxLength={MAX_HABIT_NOTE_LENGTH}
                        rows={2}
                        placeholder="Anotação desta execução"
                        onChange={(event) => {
                          setDrafts((prev) => ({ ...prev, [entry.dateStr]: event.target.value }));
                          setError('');
                        }}
                        style={{
                          width: '100%',
                          resize: 'vertical',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#f8fafc',
                          fontSize: '0.85rem',
                          fontFamily: 'inherit'
                        }}
                      />
                      {dirty && (
                        <button
                          type="button"
                          disabled={savingDate === entry.dateStr}
                          onClick={() => saveNote(entry.dateStr)}
                          style={{
                            alignSelf: 'flex-end',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#38bdf8',
                            color: '#0f172a',
                            fontWeight: 800,
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          {savingDate === entry.dateStr ? 'Salvando…' : 'Salvar nota'}
                        </button>
                      )}
                    </label>
                  ) : entry.note ? (
                    <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{entry.note}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}

        {error ? <p style={{ margin: 0, color: '#f87171', fontSize: '0.82rem' }}>{error}</p> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export function habitHistoryButtonStyle(extra = {}) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '999px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(56, 189, 248, 0.35)',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#38bdf8',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
    ...extra
  };
}
