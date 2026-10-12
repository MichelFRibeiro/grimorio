import React from 'react';
import { Scale } from 'lucide-react';

function costLine(deltas = {}) {
  const parts = [];
  if (deltas.coins) parts.push(`${deltas.coins} moedas`);
  if (deltas.willpower) parts.push(`${deltas.willpower} Vontade`);
  if (deltas.consistency) parts.push(`${deltas.consistency} Consistência`);
  if (deltas.focus) parts.push(`${deltas.focus} Foco`);
  if (deltas.wisdom) parts.push(`${deltas.wisdom} Sabedoria`);
  return parts.length ? parts.join(' · ') : 'sem custo numérico';
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
