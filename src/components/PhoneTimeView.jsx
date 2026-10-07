import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { PhoneTimeChart } from './PhoneTimeChart';
import { addDaysToDateStr, getSaoPauloDateStr } from '../utils/timeUtils';
import {
  PHONE_TIME_CHART_DAYS,
  PHONE_TIME_MAX_MINUTES,
  buildPhoneTimeSeries,
  formatPhoneDuration,
  parsePhoneTimeMinutes
} from '../utils/phoneTime';

const RANGES = [
  { days: 14, label: '14 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' }
];

function splitMinutes(total) {
  const minutes = Math.max(0, Math.round(Number(total) || 0));
  return {
    hours: String(Math.floor(minutes / 60)),
    minutes: String(minutes % 60)
  };
}

function formatDay(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function PhoneTimeView({
  data,
  onSave,
  onDelete
}) {
  const todayStr = getSaoPauloDateStr();
  const [days, setDays] = useState(PHONE_TIME_CHART_DAYS);
  const [editing, setEditing] = useState(null);
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const series = useMemo(
    () => buildPhoneTimeSeries(data || {}, todayStr, days),
    [data, todayStr, days]
  );
  const logs = useMemo(
    () => [...(data?.phoneTimeLogs || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [data]
  );

  const openEditor = (entry) => {
    const parts = splitMinutes(entry?.minutes || 0);
    setEditing({
      id: entry?.id || null,
      date: entry?.date || addDaysToDateStr(todayStr, -1),
      isNew: !entry?.id
    });
    setHours(entry ? parts.hours : '');
    setMinutes(entry ? parts.minutes : '');
    setNote(entry?.note || '');
    setError('');
  };

  const save = async (event) => {
    event.preventDefault();
    const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
    const parsed = parsePhoneTimeMinutes(total);
    if (parsed == null || (hours === '' && minutes === '')) {
      setError('Informe horas e minutos.');
      return;
    }
    if (parsed > PHONE_TIME_MAX_MINUTES) {
      setError('O dia não tem mais de 24 horas.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave?.({ date: editing.date, minutes: parsed, note, id: editing.id });
      setEditing(null);
    } catch (err) {
      setError(err?.message || 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  const yesterday = series.points.find((point) => point.isYesterday);

  return (
    <section className="phone-time-view">
      <header className="phone-time-header">
        <div>
          <div className="phone-time-title">
            <Smartphone size={22} />
            <h2 className="font-cinzel">Tempo no Celular</h2>
          </div>
          <p>
            O celular de ontem ao lado do que o dia rendeu: missões, rituais, Biblioteca, Escrituras e AGU.
            Dia sem ponto azul ainda não foi registrado.
          </p>
        </div>
        <button type="button" className="phone-time-save" onClick={() => openEditor(null)}>
          <Plus size={16} /> Registrar dia
        </button>
      </header>

      <div className="phone-time-stats">
        <article>
          <span>Média no celular</span>
          <strong>{series.loggedDays ? formatPhoneDuration(series.avgPhoneMinutes) : '—'}</strong>
          <small>{series.loggedDays} dias registrados</small>
        </article>
        <article>
          <span>Média produtiva</span>
          <strong>{series.loggedDays ? formatPhoneDuration(series.avgProductiveMinutes) : '—'}</strong>
          <small>nos mesmos dias</small>
        </article>
        <article>
          <span>Ontem</span>
          <strong>{yesterday?.phoneLogged ? formatPhoneDuration(yesterday.phoneMinutes) : 'sem registro'}</strong>
          <small>
            {yesterday ? `${yesterday.activityCount} atividades · ${formatPhoneDuration(yesterday.productiveMinutes)}` : ''}
          </small>
        </article>
        <article>
          <span>Celular no total registrado</span>
          <strong>{series.phoneRatio == null ? '—' : `${series.phoneRatio}%`}</strong>
          <small>do tempo celular + produtivo</small>
        </article>
      </div>

      <div className="phone-time-range">
        {RANGES.map((range) => (
          <button
            key={range.days}
            type="button"
            className={days === range.days ? 'is-active' : ''}
            onClick={() => setDays(range.days)}
          >
            {range.label}
          </button>
        ))}
      </div>

      <div className="glass-panel phone-time-panel">
        <PhoneTimeChart series={series} />
      </div>

      <div className="glass-panel phone-time-panel">
        <h3>Registros</h3>
        {logs.length === 0 ? (
          <p className="phone-time-empty">Nenhum dia registrado ainda. A pergunta de ontem aparece ao abrir o Grimório.</p>
        ) : (
          <ul className="phone-time-log">
            {logs.map((entry) => {
              const point = series.points.find((item) => item.dateStr === entry.date);
              return (
                <li key={entry.id}>
                  <div>
                    <strong>{formatDay(entry.date)}</strong>
                    <span>{formatPhoneDuration(entry.minutes)}</span>
                    {entry.note && <em>{entry.note}</em>}
                  </div>
                  <small>
                    {point
                      ? `${point.activityCount} atividades · ${formatPhoneDuration(point.productiveMinutes)}`
                      : 'fora da janela do gráfico'}
                  </small>
                  <div className="phone-time-log-actions">
                    <button type="button" onClick={() => openEditor(entry)} aria-label={`Corrigir ${formatDay(entry.date)}`}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => setPendingDelete(entry)} aria-label={`Excluir ${formatDay(entry.date)}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <div className="phone-time-overlay" role="presentation" onClick={() => setEditing(null)}>
          <form
            className="phone-time-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="phone-edit-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={save}
          >
            <h2 id="phone-edit-title">{editing.isNew ? 'Registrar tempo no celular' : 'Corrigir registro'}</h2>
            <label className="phone-time-note">
              <span>Dia</span>
              <input
                type="date"
                value={editing.date}
                max={todayStr}
                disabled={!editing.isNew}
                onChange={(event) => setEditing((prev) => ({ ...prev, date: event.target.value }))}
              />
            </label>
            <div className="phone-time-fields">
              <label>
                <span>Horas</span>
                <input type="number" inputMode="numeric" min="0" max="24" value={hours} onChange={(event) => setHours(event.target.value)} />
              </label>
              <label>
                <span>Minutos</span>
                <input type="number" inputMode="numeric" min="0" max="59" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
              </label>
            </div>
            <label className="phone-time-note">
              <span>Nota</span>
              <input type="text" maxLength={280} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcional" />
            </label>
            {error && <p className="phone-time-error">{error}</p>}
            <div className="phone-time-actions">
              <button type="submit" className="phone-time-save" disabled={busy}>Salvar</button>
              <button type="button" className="phone-time-later" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(pendingDelete)}
        title="Excluir registro"
        message={pendingDelete ? `Apagar o tempo de celular de ${formatDay(pendingDelete.date)}? A pergunta volta a aparecer se for o dia de ontem.` : ''}
        confirmText="Excluir"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const id = pendingDelete?.id;
          setPendingDelete(null);
          if (id) await onDelete?.(id);
        }}
      />
    </section>
  );
}
