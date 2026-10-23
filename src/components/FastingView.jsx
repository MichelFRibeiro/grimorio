import React, { useEffect, useMemo, useState } from 'react';
import { Hourglass, Pencil, Plus, Trash2 } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { addDaysToDateStr, getSaoPauloDateStr, getSaoPauloNowDateTimeLocal } from '../utils/timeUtils';
import {
  FASTING_CHART_DAYS,
  FASTING_NOTE_MAX,
  FASTING_PROTOCOLS,
  activeFastingSession,
  buildFastingSeries,
  eatingWindowHours,
  fastingStage,
  fastingStreak,
  formatFastingClock,
  formatFastingSpan,
  goalReached,
  openFastingSessions,
  protocolById,
  protocolIdForMinutes,
  protocolLabel,
  sanitizeFastingSessions,
  sessionDurationMs
} from '../utils/fasting';

const RANGES = [
  { days: 14, label: '14 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' }
];

function useNow(ticking) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!ticking) return undefined;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);
  return now;
}

function formatWhen(iso) {
  if (!iso) return '';
  const local = getSaoPauloNowDateTimeLocal(iso);
  const [date, time] = local.split('T');
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year} às ${time}`;
}

function dayLabel(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${day}/${month}`;
}

function shiftLocalDay(local, days) {
  const source = local || getSaoPauloNowDateTimeLocal();
  const [date, time] = source.split('T');
  if (!date) return getSaoPauloNowDateTimeLocal();
  return `${addDaysToDateStr(date, days)}T${time || '20:00'}`;
}

function targetMinutesFrom(protocolId, customHours) {
  if (protocolId !== 'custom') {
    const protocol = protocolById(protocolId);
    return protocol ? protocol.hours * 60 : null;
  }
  const raw = String(customHours || '').trim().replace(',', '.');
  if (!raw) return null;
  const hours = Number(raw);
  if (!Number.isFinite(hours)) return null;
  return Math.round(hours * 60);
}

function ProtocolPicker({ protocolId, customHours, onProtocol, onCustomHours }) {
  return (
    <div className="fasting-protocols">
      {FASTING_PROTOCOLS.map((protocol) => (
        <button
          key={protocol.id}
          type="button"
          form="grimorio-no-form"
          className={protocolId === protocol.id ? 'is-active' : ''}
          onClick={() => onProtocol(protocol.id)}
        >
          {protocol.label}
        </button>
      ))}
      <button
        type="button"
        form="grimorio-no-form"
        className={protocolId === 'custom' ? 'is-active' : ''}
        onClick={() => onProtocol('custom')}
      >
        Outro
      </button>
      {protocolId === 'custom' && (
        <label className="fasting-custom">
          Horas da meta
          <input
            inputMode="decimal"
            value={customHours}
            onChange={(event) => onCustomHours(event.target.value)}
            placeholder="16"
            aria-label="Horas da meta"
          />
        </label>
      )}
    </div>
  );
}

export function FastingHomeStrip({ sessions, onOpen }) {
  const active = activeFastingSession(sessions);
  const now = useNow(Boolean(active));
  if (!active) return null;
  const elapsed = sessionDurationMs(active, now);
  const targetMs = active.targetMinutes * 60000;
  const ratio = Math.min(100, Math.round((elapsed / targetMs) * 100));
  const stage = fastingStage(elapsed);
  const hit = goalReached(active, now);
  return (
    <button type="button" className="fasting-strip" onClick={onOpen}>
      <span className="fasting-strip-icon" aria-hidden="true">
        <Hourglass size={18} />
      </span>
      <span className="fasting-strip-copy">
        <strong>Jejum em curso</strong>
        <span>
          {formatFastingClock(elapsed)}
          {' · '}
          meta {protocolLabel(active.targetMinutes)}
          {' · '}
          {hit ? 'meta batida' : stage.label}
        </span>
        <span className="fasting-progress" aria-hidden="true">
          <span style={{ width: `${ratio}%` }} data-hit={hit ? 'yes' : 'no'} />
        </span>
      </span>
      <span className="fasting-strip-open">Abrir</span>
    </button>
  );
}

export function FastingView({
  sessions = [],
  onStart,
  onEnd,
  onUpdate,
  onDelete
}) {
  const list = useMemo(() => sanitizeFastingSessions(sessions), [sessions]);
  const active = activeFastingSession(list);
  const extras = openFastingSessions(list).slice(1);
  const now = useNow(Boolean(active) || extras.length > 0);
  const todayStr = getSaoPauloDateStr(now);
  const [days, setDays] = useState(FASTING_CHART_DAYS);
  const [protocolId, setProtocolId] = useState('16');
  const [customHours, setCustomHours] = useState('16');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(null);
  const [pending, setPending] = useState(null);

  const series = useMemo(
    () => buildFastingSeries(list, todayStr, days),
    [list, todayStr, days]
  );
  const closed = list.filter((session) => session.endedAt);
  const streak = fastingStreak(list, now);
  const longest = closed.reduce((max, session) => Math.max(max, sessionDurationMs(session, now)), 0);
  const scale = Math.max(series.maxMinutes, 16 * 60, 1);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err?.message || 'Não foi possível registrar o jejum.');
    } finally {
      setBusy(false);
    }
  };

  const startNow = (event) => {
    event.preventDefault();
    const targetMinutes = targetMinutesFrom(protocolId, customHours);
    if (targetMinutes == null) {
      setError('A meta precisa ficar entre 1 hora e 7 dias.');
      return;
    }
    run(async () => {
      await onStart?.({ targetMinutes, note });
      setNote('');
    });
  };

  const openEditor = (session, mode) => {
    const currentProtocol = session ? protocolIdForMinutes(session.targetMinutes) : protocolId;
    setEditor({
      mode,
      id: session?.id || null,
      started: session ? getSaoPauloNowDateTimeLocal(session.startedAt) : getSaoPauloNowDateTimeLocal(),
      ended: session?.endedAt ? getSaoPauloNowDateTimeLocal(session.endedAt) : '',
      protocolId: currentProtocol,
      customHours: session ? String(Math.round((session.targetMinutes / 60) * 10) / 10) : customHours,
      note: session?.note || ''
    });
    setError('');
  };

  const saveEditor = (event) => {
    event.preventDefault();
    if (!editor) return;
    const targetMinutes = targetMinutesFrom(editor.protocolId, editor.customHours);
    if (targetMinutes == null) {
      setError('A meta precisa ficar entre 1 hora e 7 dias.');
      return;
    }
    if (!editor.started) {
      setError('Informe o início.');
      return;
    }
    if (editor.ended && editor.ended < editor.started) {
      setError('O fim precisa ser depois do início.');
      return;
    }
    const body = {
      startedAt: editor.started,
      endedAt: editor.ended || null,
      targetMinutes,
      note: editor.note
    };
    run(async () => {
      if (editor.mode === 'past') await onStart?.(body);
      else await onUpdate?.(editor.id, body);
      setEditor(null);
    });
  };

  const elapsed = active ? sessionDurationMs(active, now) : 0;
  const stage = active ? fastingStage(elapsed) : null;
  const hit = active ? goalReached(active, now) : false;
  const remaining = active ? active.targetMinutes * 60000 - elapsed : 0;
  const windowHours = active ? eatingWindowHours(active.targetMinutes) : null;
  const ratio = active ? Math.min(100, Math.round((elapsed / (active.targetMinutes * 60000)) * 100)) : 0;
  const labelEvery = days >= 90 ? 15 : days >= 30 ? 5 : 2;

  return (
    <section className="fasting-view">
      <header className="fasting-header">
        <div>
          <div className="fasting-title">
            <Hourglass size={22} />
            <h2 className="font-cinzel">Jejum — monitoramento</h2>
          </div>
          <p>
            O início pode ser agora, mais cedo hoje ou em um dia anterior. O fim fica em aberto enquanto o jejum corre, ou pode ser um horário que já passou. Não concede XP.
          </p>
          <p className="fasting-disclaimer">Os marcos são referência de acompanhamento, não orientação médica.</p>
        </div>
        <button type="button" className="fasting-primary" onClick={() => openEditor(null, 'past')}>
          <Plus size={16} /> Registrar jejum
        </button>
      </header>

      <article className="glass-panel fasting-live">
        {active ? (
          <>
            <div className="fasting-live-top">
              <div>
                <span className="fasting-kicker">{hit ? 'Meta batida' : 'Em curso'}</span>
                <p className="fasting-clock" aria-label={`Jejum em curso há ${formatFastingSpan(elapsed)}`}>
                  {formatFastingClock(elapsed)}
                </p>
                <strong>{stage.label}</strong>
                <p>{stage.detail}</p>
              </div>
              <div className="fasting-live-meta">
                <span>Meta {protocolLabel(active.targetMinutes)}</span>
                <span>{hit ? (elapsed - active.targetMinutes * 60000 < 60000 ? 'meta batida agora' : `há ${formatFastingSpan(elapsed - active.targetMinutes * 60000)}`) : `faltam ${formatFastingSpan(remaining)}`}</span>
                <span>desde {formatWhen(active.startedAt)}</span>
                {windowHours != null && (
                  <span>
                    {windowHours === 0
                      ? 'Protocolo de um dia inteiro.'
                      : `Janela de alimentação do protocolo: ${windowHours}h.`}
                  </span>
                )}
              </div>
            </div>
            <div className="fasting-progress" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio} aria-label="Progresso da meta">
              <span style={{ width: `${ratio}%` }} data-hit={hit ? 'yes' : 'no'} />
            </div>
            {active.note && <em className="fasting-note-line">{active.note}</em>}
            {error && !editor && <p className="fasting-error" role="alert">{error}</p>}
            <div className="fasting-actions">
              <button
                type="button"
                className="fasting-primary"
                disabled={busy}
                onClick={() => setPending({ kind: 'end', session: active })}
              >
                Encerrar jejum
              </button>
              <button type="button" className="fasting-ghost" disabled={busy} onClick={() => openEditor(active, 'edit')}>
                <Pencil size={15} /> Editar
              </button>
              <button
                type="button"
                className="fasting-ghost"
                disabled={busy}
                onClick={() => setPending({ kind: 'delete', session: active })}
              >
                <Trash2 size={15} /> Excluir
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={startNow}>
            <span className="fasting-kicker">Nenhum jejum em curso</span>
            <h3>Começar agora</h3>
            <ProtocolPicker
              protocolId={protocolId}
              customHours={customHours}
              onProtocol={setProtocolId}
              onCustomHours={setCustomHours}
            />
            <label className="fasting-note">
              Nota
              <input
                value={note}
                maxLength={FASTING_NOTE_MAX}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Opcional"
              />
            </label>
            {error && !editor && <p className="fasting-error" role="alert">{error}</p>}
            <button type="submit" className="fasting-primary" disabled={busy}>
              Começar agora
            </button>
          </form>
        )}
      </article>

      {extras.length > 0 && (
        <p className="fasting-error" role="status">
          Há {extras.length} outro{extras.length > 1 ? 's' : ''} jejum{extras.length > 1 ? 's' : ''} em aberto. Encerre ou exclua para o relógio ficar único.
        </p>
      )}

      <div className="fasting-stats">
        <article>
          <span>Média na janela</span>
          <strong>{series.loggedDays ? formatFastingSpan(series.avgMinutes * 60000) : '—'}</strong>
          <small>{series.loggedDays} dias com jejum encerrado</small>
        </article>
        <article>
          <span>Mais longo</span>
          <strong>{longest ? formatFastingSpan(longest) : '—'}</strong>
          <small>entre os encerrados</small>
        </article>
        <article>
          <span>Metas batidas</span>
          <strong>{series.completed ? `${series.hits}/${series.completed}` : '—'}</strong>
          <small>na janela do gráfico</small>
        </article>
        <article>
          <span>Sequência</span>
          <strong>{streak ? `${streak} dia${streak > 1 ? 's' : ''}` : '—'}</strong>
          <small>metas batidas seguidas</small>
        </article>
      </div>

      <div className="fasting-range">
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

      <div className="glass-panel fasting-panel">
        <h3>Horas encerradas por dia</h3>
        <p className="fasting-chart-lead">A barra soma os jejuns terminados naquele dia. O que ainda está em curso não entra.</p>
        <div className="fasting-chart" role="img" aria-label="Horas de jejum encerradas por dia">
          {series.points.map((point, index) => (
            <div key={point.dateStr} className="fasting-bar" title={`${dayLabel(point.dateStr)} · ${point.count ? formatFastingSpan(point.minutes * 60000) : 'sem jejum'}`}>
              <span
                className="fasting-bar-fill"
                data-hit={point.count ? (point.hit ? 'yes' : 'no') : 'empty'}
                style={{ height: `${Math.max(point.minutes ? 8 : 0, Math.round((point.minutes / scale) * 100))}%` }}
              />
              <small>{index % labelEvery === 0 ? dayLabel(point.dateStr) : ''}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel fasting-panel">
        <h3>Registros</h3>
        {list.length === 0 ? (
          <p className="fasting-empty">Nenhum jejum registrado ainda. O início pode ser de ontem, com o fim em aberto.</p>
        ) : (
          <ul className="fasting-log">
            {list.map((session) => {
              const duration = sessionDurationMs(session, now);
              const reached = goalReached(session, now);
              const open = !session.endedAt;
              return (
                <li key={session.id}>
                  <div>
                    <strong>{open ? `Em curso desde ${formatWhen(session.startedAt)}` : formatWhen(session.endedAt)}</strong>
                    <span>{formatFastingSpan(duration)} · meta {protocolLabel(session.targetMinutes)}</span>
                    <em>{open ? 'fim em aberto' : (reached ? 'meta batida' : 'abaixo da meta')}</em>
                    {session.note && <small>{session.note}</small>}
                  </div>
                  <div className="fasting-log-actions">
                    <button type="button" onClick={() => openEditor(session, 'edit')} aria-label={`Editar jejum de ${formatWhen(session.startedAt)}`}>
                      Editar
                    </button>
                    <button type="button" onClick={() => setPending({ kind: 'delete', session })} aria-label={`Excluir jejum de ${formatWhen(session.startedAt)}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editor && (
        <div className="fasting-overlay" role="presentation" onClick={() => !busy && setEditor(null)}>
          <form
            className="fasting-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fasting-edit-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={saveEditor}
          >
            <h3 id="fasting-edit-title">{editor.mode === 'past' ? 'Registrar jejum' : 'Editar jejum'}</h3>
            <p className="fasting-hint">
              O início pode ser agora, mais cedo hoje ou em um dia anterior.
              Deixe o fim em aberto se o jejum ainda está em curso, ou informe um fim que já passou.
            </p>
            <label>
              Início
              <input
                type="datetime-local"
                value={editor.started}
                max={getSaoPauloNowDateTimeLocal(now)}
                onChange={(event) => setEditor({ ...editor, started: event.target.value })}
                required
              />
            </label>
            <div className="fasting-protocols">
              <button
                type="button"
                form="grimorio-no-form"
                onClick={() => setEditor({ ...editor, started: getSaoPauloNowDateTimeLocal(now) })}
              >
                Início agora
              </button>
              <button
                type="button"
                form="grimorio-no-form"
                onClick={() => setEditor({ ...editor, started: shiftLocalDay(getSaoPauloNowDateTimeLocal(now), -1) })}
              >
                Início ontem
              </button>
            </div>
            <label className="fasting-open-toggle">
              <input
                type="checkbox"
                checked={!editor.ended}
                onChange={(event) => setEditor({
                  ...editor,
                  ended: event.target.checked ? '' : getSaoPauloNowDateTimeLocal(now)
                })}
              />
              Fim em aberto — jejum ainda em curso
            </label>
            {editor.ended !== '' && (
              <label>
                Fim
                <input
                  type="datetime-local"
                  value={editor.ended}
                  max={getSaoPauloNowDateTimeLocal(now)}
                  onChange={(event) => setEditor({ ...editor, ended: event.target.value })}
                  required
                />
              </label>
            )}
            <ProtocolPicker
              protocolId={editor.protocolId}
              customHours={editor.customHours}
              onProtocol={(id) => setEditor({ ...editor, protocolId: id })}
              onCustomHours={(value) => setEditor({ ...editor, customHours: value })}
            />
            <label>
              Nota
              <input
                value={editor.note}
                maxLength={FASTING_NOTE_MAX}
                onChange={(event) => setEditor({ ...editor, note: event.target.value })}
              />
            </label>
            {error && <p className="fasting-error" role="alert">{error}</p>}
            <div className="fasting-actions">
              <button type="submit" className="fasting-primary" disabled={busy}>Guardar</button>
              <button type="button" className="fasting-ghost" onClick={() => setEditor(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(pending)}
        title={pending?.kind === 'end' ? 'Encerrar jejum' : 'Excluir jejum'}
        message={pending?.kind === 'end'
          ? 'O relógio para agora. Dá para corrigir o horário depois.'
          : 'O registro some do histórico. Essa ação não desfaz.'}
        confirmText={pending?.kind === 'end' ? 'Encerrar' : 'Excluir'}
        confirmVariant={pending?.kind === 'end' ? 'primary' : 'danger'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const current = pending;
          setPending(null);
          if (!current) return;
          run(async () => {
            if (current.kind === 'end') await onEnd?.(current.session.id);
            else await onDelete?.(current.session.id);
          });
        }}
      />
    </section>
  );
}
