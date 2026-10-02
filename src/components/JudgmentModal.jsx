import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Scale, AlertTriangle, Swords, Shield, Coins, X } from 'lucide-react';

function costLine(deltas = {}) {
  const parts = [];
  if (deltas.coins) parts.push(`${deltas.coins} moedas`);
  if (deltas.willpower) parts.push(`${deltas.willpower} Vontade`);
  if (deltas.consistency) parts.push(`${deltas.consistency} Consistência`);
  if (deltas.focus) parts.push(`${deltas.focus} Foco`);
  if (deltas.wisdom) parts.push(`${deltas.wisdom} Sabedoria`);
  return parts.length ? parts.join(' · ') : 'sem custo numérico';
}

export function JudgmentModal({
  penalties = [],
  onAcknowledge,
  onContest,
  onAction
}) {
  const [contestId, setContestId] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!penalties.length) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onAcknowledge?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [penalties.length, onAcknowledge]);

  if (!penalties.length) return null;

  const submitContest = async (id) => {
    setBusy(true);
    setError('');
    try {
      await onContest?.(id, reason);
      setContestId(null);
      setReason('');
    } catch (err) {
      setError(err?.message || 'Não foi possível contestar.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="judgment-overlay" role="presentation">
      <div
        className="judgment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="judgment-title"
      >
        <div className="judgment-seal" aria-hidden="true">
          <Scale size={28} />
        </div>
        <p className="judgment-kicker">O Grimório observa</p>
        <h2 id="judgment-title">O Julgamento do Grimório</h2>
        <p className="judgment-lead">
          {penalties.length === 1
            ? 'Um aspecto ficou para trás. Leia o custo e escolha o próximo passo — consciência vem antes da desculpa.'
            : `${penalties.length} aspectos ficaram para trás. Cada um tem custo, motivo e um passo concreto.`}
        </p>

        <ul className="judgment-list">
          {penalties.map((penalty) => (
            <li key={penalty.id} className="judgment-card">
              <header>
                <AlertTriangle size={16} />
                <strong>{penalty.title}</strong>
              </header>
              <p>{penalty.description}</p>
              <p className="judgment-cost">
                <Coins size={14} /> Custou {costLine(penalty.applied || penalty.deltas)}
              </p>
              {(penalty.advice || []).slice(0, 3).map((line) => (
                <p key={line} className="judgment-advice">{line}</p>
              ))}
              <div className="judgment-actions">
                {(penalty.actions || []).map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="judgment-action"
                    onClick={() => onAction?.(action, penalty)}
                  >
                    {action.id === 'open-rituals' ? <Shield size={14} /> : <Swords size={14} />}
                    {action.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="judgment-contest"
                  onClick={() => {
                    setContestId(contestId === penalty.id ? null : penalty.id);
                    setError('');
                  }}
                >
                  Contestar
                </button>
              </div>
              {contestId === penalty.id && (
                <form
                  className="judgment-contest-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitContest(penalty.id);
                  }}
                >
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Motivo honesto (feriado, doença, prazo impossível)…"
                    maxLength={280}
                    required
                  />
                  {error && <p className="judgment-error">{error}</p>}
                  <button type="submit" disabled={busy || reason.trim().length < 3}>
                    {busy ? 'Enviando…' : 'Enviar contestação'}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="judgment-accept"
          onClick={() => onAcknowledge?.()}
        >
          Entendi, vou melhorar
        </button>
        <button type="button" className="judgment-close" onClick={() => onAcknowledge?.()} aria-label="Fechar julgamento">
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body
  );
}

export function JudgmentHistory({ penalties = [], onClose }) {
  if (!penalties) return null;
  return (
    <section className="judgment-history glass-panel">
      <header>
        <h3><Scale size={16} /> Registro de Julgamentos</h3>
        {onClose && (
          <button type="button" onClick={onClose}>fechar</button>
        )}
      </header>
      {penalties.length === 0 ? (
        <p>Nenhum julgamento ainda. A semana está limpa.</p>
      ) : (
        <ul>
          {penalties.slice(0, 20).map((penalty) => (
            <li key={penalty.id}>
              <strong>{penalty.title}</strong>
              <span>{penalty.date} · {penalty.contestedAt ? 'contestado' : penalty.acknowledgedAt ? 'reconhecido' : 'pendente'}</span>
              <em>{costLine(penalty.applied || penalty.deltas)}</em>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
