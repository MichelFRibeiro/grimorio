import React, { useMemo, useState } from 'react';
import {
  Sunrise,
  CheckCircle2,
  Circle,
  Flame,
  Scroll,
  Scale,
  Network,
  BookOpen,
  ShieldAlert,
  Trophy,
  Moon,
  CalendarRange,
  Plus
} from 'lucide-react';
import { getSaoPauloDateStr, addDaysToDateStr, getSaoPauloDayOfWeek } from '../utils/timeUtils';

const MOODS = [
  { value: 1, label: 'pesado' },
  { value: 2, label: 'cansado' },
  { value: 3, label: 'ok' },
  { value: 4, label: 'bom' },
  { value: 5, label: 'leve' }
];

function Section({ title, count, children, action }) {
  return (
    <section className="today-section glass-panel">
      <header className="today-section-head">
        <h3>{title}</h3>
        {count != null && <span className="today-count">{count}</span>}
        {action}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="today-empty">{children}</p>;
}

export function TodayView({
  today,
  dailyVictories = [],
  questCategories = [],
  onCompleteVictory,
  onToggleHabit,
  onCompleteQuest,
  onAddVictory,
  onRescheduleQuests,
  onOpenTab,
  onCloseDay,
  onOpenEvening,
  onOpenWeekly,
  onToggleFocus,
  playClick
}) {
  const payload = today || {};
  const hour = payload.hour ?? 12;
  const todayStr = payload.date || getSaoPauloDateStr();
  const tomorrowStr = payload.tomorrow || addDaysToDateStr(todayStr, 1);
  const planning = payload.planning || {};
  const showPlan = planning.morningOpen || (hour >= 18 && (payload.dailyVictories?.planned || 0) === 0);
  const day = getSaoPauloDayOfWeek();
  const showWeeklyHint = (day === 0 && hour >= 18) || (day === 1 && hour < 12);

  const categories = questCategories.length
    ? questCategories.map((item) => (typeof item === 'string' ? item : item.name)).filter(Boolean)
    : ['Pessoal', 'Estudos'];

  const suggestions = useMemo(() => (
    (planning.suggestions || []).map((item) => ({ ...item, accepted: true }))
  ), [planning.suggestions]);
  const [drafts, setDrafts] = useState(null);
  const [planningDate, setPlanningDate] = useState(todayStr);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const rows = drafts || suggestions;

  const acceptPlan = async () => {
    const items = rows.filter((item) => item.accepted && String(item.title || '').trim());
    if (!items.length) {
      setPlanError('Marque ao menos uma vitória.');
      return;
    }
    setSavingPlan(true);
    setPlanError('');
    try {
      for (const item of items) {
        await onAddVictory({
          title: item.title.trim(),
          category: item.category || categories[0],
          date: planningDate,
          source: item.source,
          questId: item.questId
        });
      }
      setDrafts(null);
    } catch (err) {
      setPlanError(err?.message || 'Não foi possível planejar.');
    } finally {
      setSavingPlan(false);
    }
  };

  const victories = payload.dailyVictories?.items
    || (dailyVictories || []).filter((item) => item.date === todayStr);

  return (
    <div className="today-board">
      <header className="today-hero">
        <div>
          <p className="today-kicker">{payload.phaseLabel || 'hoje'}</p>
          <h2 className="font-cinzel">{payload.greeting || 'Hoje'}</h2>
          <p className="today-meta">
            Sequência de {payload.streak || 0} dia{(payload.streak || 0) === 1 ? '' : 's'}
            {payload.boss?.name ? ` · ${payload.boss.icon || ''} ${payload.boss.name}` : ''}
          </p>
        </div>
        <div className="today-hero-actions">
          <button type="button" className="today-ghost" onClick={() => onOpenEvening?.()}>
            <Moon size={15} /> Fechar o dia
          </button>
          <button type="button" className="today-ghost" onClick={() => onOpenWeekly?.()}>
            <CalendarRange size={15} /> Semana
          </button>
        </div>
      </header>

      {showPlan && (
        <section className="today-plan glass-panel-gold" id="planejar-o-dia">
          <header className="today-section-head">
            <h3><Sunrise size={16} /> Planejar o dia</h3>
            {hour >= 18 && (
              <div className="today-chips">
                <button type="button" className={planningDate === todayStr ? 'is-on' : ''} onClick={() => setPlanningDate(todayStr)}>hoje</button>
                <button type="button" className={planningDate === tomorrowStr ? 'is-on' : ''} onClick={() => setPlanningDate(tomorrowStr)}>amanhã</button>
              </div>
            )}
          </header>
          <p className="today-empty">Até 3 vitórias. A de estudo entra pela homeostase e não ocupa o teto manual.</p>
          {rows.map((item, index) => (
            <label key={item.key || index} className="today-line">
              <input
                type="checkbox"
                checked={item.accepted !== false}
                onChange={(event) => {
                  const next = rows.map((row, i) => (i === index ? { ...row, accepted: event.target.checked } : row));
                  setDrafts(next);
                }}
              />
              <input
                className="today-inline-input"
                value={item.title}
                onChange={(event) => {
                  const next = rows.map((row, i) => (i === index ? { ...row, title: event.target.value } : row));
                  setDrafts(next);
                }}
              />
              <select
                value={item.category || categories[0]}
                onChange={(event) => {
                  const next = rows.map((row, i) => (i === index ? { ...row, category: event.target.value } : row));
                  setDrafts(next);
                }}
              >
                {categories.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          ))}
          {rows.length < 3 && (
            <button
              type="button"
              className="today-ghost"
              onClick={() => setDrafts([...(rows), { key: `custom-${rows.length}`, title: '', category: categories[0], accepted: true }])}
            >
              <Plus size={14} /> Outra
            </button>
          )}
          {planError && <p className="today-error">{planError}</p>}
          <button type="button" className="today-solid" disabled={savingPlan} onClick={acceptPlan}>
            {savingPlan ? 'Gravando…' : 'Aceitar o plano'}
          </button>
        </section>
      )}

      {(payload.weeklyFocuses || []).length > 0 && (
        <Section title="Focos da semana" count={payload.weeklyFocuses.filter((item) => item.done).length}>
          {payload.weeklyFocuses.map((focus) => (
            <label key={focus.id} className="today-line">
              <input
                type="checkbox"
                checked={!!focus.done}
                onChange={() => {
                  if (playClick) playClick();
                  onToggleFocus?.(focus.id, !focus.done);
                }}
              />
              <span className={focus.done ? 'is-done' : ''}>{focus.title}</span>
              {focus.category && <em>{focus.category}</em>}
            </label>
          ))}
        </Section>
      )}

      <div className="today-grid">
        <Section title="Vitórias" count={`${payload.dailyVictories?.completed || 0}/${payload.dailyVictories?.planned || victories.length}`}>
          {victories.length === 0 && <Empty>Nenhuma vitória planejada.</Empty>}
          {victories.map((item) => (
            <label key={item.id} className="today-line">
              <input
                type="checkbox"
                checked={!!item.completed}
                onChange={() => onCompleteVictory?.(item.id)}
              />
              {item.completed ? <CheckCircle2 size={15} /> : <Circle size={15} />}
              <span className={item.completed ? 'is-done' : ''}>{item.title}</span>
            </label>
          ))}
        </Section>

        <Section title="Rituais devidos" count={payload.habitsDueCount ?? (payload.habitsDue || []).length} action={
          <button type="button" className="today-link" onClick={() => onOpenTab?.('habits')}>ver</button>
        }>
          {(payload.habitsDue || []).length === 0 && <Empty>Nenhum ritual pendente hoje.</Empty>}
          {(payload.habitsDue || []).map((habit) => (
            <label key={habit.id} className="today-line">
              <input type="checkbox" checked={false} onChange={() => onToggleHabit?.(habit.id)} />
              <Flame size={14} />
              <span>{habit.title}</span>
              {habit.timeWindow && <em>{habit.timeWindow.start}–{habit.timeWindow.end}</em>}
            </label>
          ))}
        </Section>

        <Section title="Missões de hoje e atrasadas" count={(payload.quests || []).length} action={
          <button type="button" className="today-link" onClick={() => onOpenTab?.('quests')}>ver</button>
        }>
          {(payload.quests || []).length === 0 && <Empty>Nada vencendo hoje.</Empty>}
          {(payload.quests || []).slice(0, 6).map((quest) => (
            <div key={quest.id} className="today-line">
              <button type="button" className="today-check" onClick={() => onCompleteQuest?.(quest.id)} aria-label={`Concluir ${quest.title}`}>
                <Scroll size={14} />
              </button>
              <span>{quest.title}</span>
              {quest.overdue && <em className="is-late">{quest.overdueDays}d</em>}
              {quest.procrastinating && <ShieldAlert size={13} />}
              <button
                type="button"
                className="today-link"
                onClick={() => onRescheduleQuests?.([quest.id], tomorrowStr)}
              >
                amanhã
              </button>
            </div>
          ))}
        </Section>

        <Section title="AGU" count={payload.agu?.started ? `${payload.agu.done}/${payload.agu.total}` : '—'} action={
          <button type="button" className="today-link" onClick={() => onOpenTab?.('agu')}>abrir</button>
        }>
          {!payload.agu?.started && <Empty>Campanha ainda não iniciada.</Empty>}
          {payload.agu?.started && (
            <>
              <p className="today-meta">
                {payload.agu.minutesToday || 0} min
                {payload.agu.targetMinutes ? ` · meta ${payload.agu.targetMinutes} min` : ''}
                {payload.agu.coverage ? ` · edital ${payload.agu.coverage.coverage}%` : ''}
                {payload.agu.remaining ? ` · ${payload.agu.remaining} bloco(s) aberto(s)` : ' · dia fechado'}
              </p>
              {(payload.agu.blocks || []).filter((block) => !block.done).slice(0, 3).map((block) => (
                <div key={block.key} className="today-line">
                  <Scale size={14} />
                  <span>{block.subject}{block.label ? ` — ${block.label}` : ''}</span>
                </div>
              ))}
            </>
          )}
        </Section>

        <Section title="Mapas vencidos" count={payload.mindMaps?.count || 0}>
          {!payload.mindMaps?.top && <Empty>Nenhum ramo vencido.</Empty>}
          {payload.mindMaps?.top && (
            <button type="button" className="today-line today-line-btn" onClick={() => onOpenTab?.('maps')}>
              <Network size={14} />
              <span>{payload.mindMaps.top.title}</span>
              <em>{payload.mindMaps.top.dueBranches}</em>
            </button>
          )}
        </Section>

        <Section title="Livros parados" count={(payload.stalledBooks || []).length}>
          {(payload.stalledBooks || []).length === 0 && <Empty>Nenhum livro parado.</Empty>}
          {(payload.stalledBooks || []).slice(0, 3).map((book) => (
            <button key={book.id} type="button" className="today-line today-line-btn" onClick={() => onOpenTab?.('books')}>
              <BookOpen size={14} />
              <span>{book.title}</span>
              <em>{book.stalledDays}d</em>
            </button>
          ))}
        </Section>
      </div>

      {(payload.rankingsAtRisk || []).length > 0 && (
        <Section title="Rankings em risco" count={payload.weekRemainingDays != null ? `${payload.weekRemainingDays}d` : null}>
          {payload.rankingsAtRisk.map((item) => (
            <div key={item.name} className="today-line">
              <Trophy size={14} />
              <span>{item.name}</span>
              <em>rank {item.rank} · faltam {item.xpNeededToMaintain} XP</em>
            </div>
          ))}
        </Section>
      )}

      {showWeeklyHint && (
        <button type="button" className="today-banner" onClick={() => onOpenWeekly?.()}>
          <CalendarRange size={16} /> Revisão da semana disponível
        </button>
      )}
    </div>
  );
}

export function EveningReviewModal({ open, review, onClose, onCloseDay, onReschedule, onPlanTomorrow, playClick }) {
  const [note, setNote] = useState('');
  const [mood, setMood] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!open) return null;
  const data = review || {};

  const submit = async () => {
    setBusy(true);
    setError('');
    const result = await onCloseDay?.({ note, mood });
    setBusy(false);
    if (!result?.ok) {
      setError(result?.error || 'Não foi possível fechar o dia.');
      return;
    }
    onClose?.();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet glass-panel today-modal" onClick={(event) => event.stopPropagation()}>
        <header className="today-section-head">
          <h3 className="font-cinzel">Fechar o dia</h3>
          <button type="button" className="today-link" onClick={onClose}>fechar</button>
        </header>
        <p className="today-meta">{data.completedCount || 0} concluída(s) · {data.pendingCount || 0} pendente(s)</p>

        <h4>Vitórias pendentes</h4>
        {(data.victories?.pending || []).length === 0 && <Empty>Nenhuma.</Empty>}
        {(data.victories?.pending || []).map((item) => (
          <div key={item.id} className="today-line">
            <span>{item.title}</span>
            <button type="button" className="today-link" onClick={() => onPlanTomorrow?.(item)}>amanhã</button>
          </div>
        ))}

        <h4>Missões de hoje</h4>
        {(data.questsDue || []).length === 0 && <Empty>Nenhuma.</Empty>}
        {(data.questsDue || []).map((item) => (
          <div key={item.id} className="today-line">
            <span>{item.title}</span>
            <button type="button" className="today-link" onClick={() => onReschedule?.([item.id])}>remarcar</button>
            <button type="button" className="today-link" onClick={() => onPlanTomorrow?.(item)}>vitória</button>
          </div>
        ))}

        <h4>Rituais devidos</h4>
        {(data.habitsDue || []).length === 0 && <Empty>Nenhum.</Empty>}
        {(data.habitsDue || []).map((item) => (
          <div key={item.id} className="today-line"><span>{item.title}</span><em>deixar</em></div>
        ))}

        {(data.oracle || []).length > 0 && (
          <>
            <h4>Recusas do Oráculo</h4>
            {data.oracle.map((item) => (
              <div key={item.id} className="today-line">
                <span>{item.title}</span>
                <em>{item.reasonLabel || item.outcome}</em>
              </div>
            ))}
          </>
        )}

        <label className="today-field">
          Uma linha sobre o dia
          <input value={note} maxLength={280} onChange={(event) => setNote(event.target.value)} placeholder="O que ficou de pé?" />
        </label>
        <div className="today-chips" role="group" aria-label="Humor">
          {MOODS.map((item) => (
            <button key={item.value} type="button" className={mood === item.value ? 'is-on' : ''} onClick={() => { if (playClick) playClick(); setMood(item.value); }}>
              {item.value} {item.label}
            </button>
          ))}
        </div>
        {error && <p className="today-error">{error}</p>}
        <button type="button" className="today-solid" disabled={busy || data.closed} onClick={submit}>
          {data.closed ? 'Dia já fechado' : busy ? 'Fechando…' : 'Fechar o dia · +15 XP'}
        </button>
      </div>
    </div>
  );
}

export function WeeklyReviewModal({ open, review, categories = [], onClose, onSavePlan, playClick }) {
  const [focuses, setFocuses] = useState([
    { title: '', category: '' },
    { title: '', category: '' },
    { title: '', category: '' }
  ]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const data = review || {};
  const names = categories.length ? categories : ['Pessoal', 'Estudos'];

  const save = async () => {
    const chosen = focuses.filter((item) => item.title.trim());
    if (!chosen.length) {
      setError('Escreva ao menos um foco.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await onSavePlan?.({ focuses: chosen, note, weekKey: data.isCurrent ? data.weekKey : undefined });
    setBusy(false);
    if (!result?.ok) {
      setError(result?.error || 'Não foi possível gravar o plano.');
      return;
    }
    if (playClick) playClick();
    onClose?.();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet glass-panel today-modal" onClick={(event) => event.stopPropagation()}>
        <header className="today-section-head">
          <h3 className="font-cinzel">Revisão da semana</h3>
          <button type="button" className="today-link" onClick={onClose}>fechar</button>
        </header>
        <p className="today-meta">{data.weekLabel}</p>
        <div className="today-stats">
          <span>Vitórias {data.victories?.completed || 0}/{data.victories?.planned || 0}{data.victories?.rate != null ? ` (${data.victories.rate}%)` : ''}</span>
          <span>Rituais {data.habits?.met || 0} ok · {data.habits?.missed || 0} abaixo</span>
          <span>Missões {data.quests?.completed || 0} feitas · {data.quests?.overdue || 0} atrasadas</span>
          <span>Estudo {data.study?.minutes || 0} min ({(data.study?.delta || 0) >= 0 ? '+' : ''}{data.study?.delta || 0} vs anterior)</span>
          {data.oracle?.bestHour != null && <span>Melhor hora: {data.oracle.bestHour}h</span>}
          {data.oracle?.bestDay && <span>Melhor dia: {data.oracle.bestDay}</span>}
        </div>
        {(data.oracle?.topDeclineReasons || []).length > 0 && (
          <p className="today-meta">Recusas: {data.oracle.topDeclineReasons.map((item) => `${item.label} (${item.count})`).join(', ')}</p>
        )}
        <ul className="today-rank-list">
          {(data.categories || []).filter((item) => item.xp > 0 || item.changed).slice(0, 6).map((item) => (
            <li key={item.name}>{item.name}: {item.xp} XP · {item.previousRank ? `${item.previousRank} → ` : ''}{item.rank}</li>
          ))}
        </ul>

        <h4>Plano da semana — até 3 focos</h4>
        {focuses.map((focus, index) => (
          <div key={index} className="today-line">
            <input
              className="today-inline-input"
              placeholder={`Foco ${index + 1}`}
              value={focus.title}
              onChange={(event) => {
                const next = focuses.slice();
                next[index] = { ...focus, title: event.target.value };
                setFocuses(next);
              }}
            />
            <select
              value={focus.category}
              onChange={(event) => {
                const next = focuses.slice();
                next[index] = { ...focus, category: event.target.value };
                setFocuses(next);
              }}
            >
              <option value="">categoria</option>
              {names.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        ))}
        <label className="today-field">
          Nota
          <input value={note} maxLength={280} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error && <p className="today-error">{error}</p>}
        <button type="button" className="today-solid" disabled={busy} onClick={save}>
          {busy ? 'Gravando…' : 'Guardar focos'}
        </button>
      </div>
    </div>
  );
}

export function QuickCapture({ open, onClose, onCreate, categories = [], lastCategory }) {
  const todayStr = getSaoPauloDateStr();
  const tomorrowStr = addDaysToDateStr(todayStr, 1);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const submit = async () => {
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    await onCreate?.({
      title: text,
      category: lastCategory || categories[0] || 'Pessoal',
      priority: 'bom_fazer',
      difficulty: 'media',
      dueDate: due || null
    });
    setBusy(false);
    setTitle('');
    setDue('');
    onClose?.();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-sheet glass-panel today-capture" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label className="today-field">
          O que precisa ser feito?
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Uma missão, em uma linha" />
        </label>
        <div className="today-chips">
          <button type="button" className={due === todayStr ? 'is-on' : ''} onClick={() => setDue(due === todayStr ? '' : todayStr)}>hoje</button>
          <button type="button" className={due === tomorrowStr ? 'is-on' : ''} onClick={() => setDue(due === tomorrowStr ? '' : tomorrowStr)}>amanhã</button>
        </div>
        <button type="submit" className="today-solid" disabled={busy || !title.trim()}>Criar missão</button>
      </form>
    </div>
  );
}

export function ShortcutsHelp({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet glass-panel today-modal" onClick={(event) => event.stopPropagation()}>
        <header className="today-section-head">
          <h3 className="font-cinzel">Atalhos</h3>
          <button type="button" className="today-link" onClick={onClose}>fechar</button>
        </header>
        <ul className="today-rank-list">
          <li><kbd>n</kbd> nova missão</li>
          <li><kbd>h</kbd> ir para Hoje</li>
          <li><kbd>?</kbd> esta ajuda</li>
          <li><kbd>Esc</kbd> fecha o que estiver aberto</li>
        </ul>
      </div>
    </div>
  );
}
