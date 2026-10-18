import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NotebookPen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { getSaoPauloDateStr } from '../utils/timeUtils';
import {
  JOURNAL_BODY_MAX,
  JOURNAL_MOODS,
  JOURNAL_TITLE_MAX,
  countWords,
  formatJournalDate,
  formatJournalMonth,
  journalExcerpt,
  journalMood,
  journalStats
} from '../utils/journal';

const DRAFT_KEY = 'grimorio.journal.draft';

function blankForm(todayStr) {
  return { id: null, date: todayStr, title: '', body: '', mood: '' };
}

function loadDraft(todayStr) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!String(parsed.body || '').trim() && !String(parsed.title || '').trim()) return null;
    return {
      id: parsed.id || null,
      date: parsed.date || todayStr,
      title: String(parsed.title || '').slice(0, 140),
      body: String(parsed.body || '').slice(0, 20000),
      mood: JOURNAL_MOODS.some((mood) => mood.id === parsed.mood) ? parsed.mood : ''
    };
  } catch {
    return null;
  }
}

function persistDraft(form) {
  try {
    const dirty = Boolean(String(form.body || '').trim() || String(form.title || '').trim() || form.mood);
    if (!dirty) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  } catch {
    // Sem armazenamento local o texto continua na tela até recarregar.
  }
}

function savedCopy(form, entries) {
  if (!form.id) return null;
  return entries.find((entry) => entry.id === form.id) || null;
}

function isDirty(form, entries) {
  const saved = savedCopy(form, entries);
  if (!saved) return Boolean(form.body.trim() || form.title.trim() || form.mood);
  return form.date !== saved.date
    || form.title !== (saved.title || '')
    || form.body !== (saved.body || '')
    || form.mood !== (saved.mood || '');
}

export function JournalView({ entries = [], onSave, onDelete }) {
  const todayStr = getSaoPauloDateStr();
  const paperRef = useRef(null);
  const [form, setForm] = useState(() => loadDraft(todayStr) || blankForm(todayStr));
  const [search, setSearch] = useState('');
  const [moodFilter, setMoodFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingLeave, setPendingLeave] = useState(null);

  useEffect(() => {
    persistDraft(form);
  }, [form]);

  useEffect(() => {
    if (!form.id) return;
    if (entries.some((entry) => entry.id === form.id)) return;
    setForm((current) => (current.id ? { ...current, id: null } : current));
  }, [entries, form.id]);

  const stats = useMemo(() => journalStats(entries, todayStr), [entries, todayStr]);
  const dirty = isDirty(form, entries);
  const words = countWords(form.body);
  const nearLimit = form.body.length > JOURNAL_BODY_MAX * 0.8;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (moodFilter === 'none' && entry.mood) return false;
      if (moodFilter && moodFilter !== 'none' && entry.mood !== moodFilter) return false;
      if (!query) return true;
      return `${entry.title}\n${entry.body}`.toLowerCase().includes(query);
    });
  }, [entries, search, moodFilter]);

  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((entry) => {
      const key = entry.date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    });
    return [...map.entries()];
  }, [filtered]);

  const update = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setError('');
  };

  const startNew = () => {
    setForm(blankForm(todayStr));
    setError('');
    setPendingLeave(null);
  };

  const leaveTo = (next) => {
    if (next !== 'new' && next?.id && next.id === form.id) {
      paperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (dirty) {
      setPendingLeave(next);
      return;
    }
    if (next === 'new') startNew();
    else openEntry(next);
  };

  const openEntry = (entry) => {
    setForm({
      id: entry.id,
      date: entry.date,
      title: entry.title || '',
      body: entry.body || '',
      mood: entry.mood || ''
    });
    setError('');
    setPendingLeave(null);
    paperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const confirmLeave = () => {
    const next = pendingLeave;
    if (next === 'new') startNew();
    else if (next) openEntry(next);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.body.trim()) {
      setError('Escreva alguma coisa antes de guardar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave?.({
        id: form.id || undefined,
        date: form.date,
        title: form.title,
        body: form.body,
        mood: form.mood
      });
      startNew();
    } catch (err) {
      setError(err?.message || 'Não foi possível guardar. O texto continua aqui.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="journal-view">
      <header className="journal-header">
        <div>
          <div className="journal-title">
            <NotebookPen size={22} />
            <h2 className="font-cinzel">Diário</h2>
          </div>
          <p>
            Escreva o dia com as suas palavras. As páginas ficam no Grimório, sem XP e sem ferir o chefe.
          </p>
        </div>
        <button type="button" className="journal-new" onClick={() => leaveTo('new')}>
          <Plus size={16} /> Nova página
        </button>
      </header>

      <div className="journal-stats">
        <article>
          <span>Páginas</span>
          <strong>{stats.pages}</strong>
          <small>{stats.today ? `${stats.today} hoje` : 'nada hoje'}</small>
        </article>
        <article>
          <span>Dias escritos</span>
          <strong>{stats.days}</strong>
          <small>com pelo menos uma página</small>
        </article>
        <article title="Se hoje ainda está em branco, a sequência conta até ontem.">
          <span>Sequência</span>
          <strong>{stats.streak}</strong>
          <small>{stats.streak === 1 ? 'dia seguido' : 'dias seguidos'}</small>
        </article>
        <article>
          <span>Palavras</span>
          <strong>{stats.words}</strong>
          <small>no diário inteiro</small>
        </article>
      </div>

      <form className="glass-panel journal-paper" ref={paperRef} onSubmit={save}>
        <div className="journal-paper-top">
          <label>
            Data
            <input
              type="date"
              value={form.date}
              onChange={(event) => update({ date: event.target.value })}
              required
            />
          </label>
          <div className="journal-editing">
            {form.id ? `Editando ${formatJournalDate(form.date) || 'esta página'}` : 'Página nova'}
            {dirty && <em>rascunho neste navegador</em>}
          </div>
        </div>

        <div className="journal-moods" role="group" aria-label="Humor do dia">
          {JOURNAL_MOODS.map((mood) => (
            <button
              key={mood.id}
              type="button"
              className={form.mood === mood.id ? 'is-active' : ''}
              aria-pressed={form.mood === mood.id}
              onClick={() => update({ mood: form.mood === mood.id ? '' : mood.id })}
            >
              <span aria-hidden="true">{mood.emoji}</span>
              {mood.label}
            </button>
          ))}
        </div>

        <label className="journal-field">
          Título
          <input
            type="text"
            value={form.title}
            maxLength={JOURNAL_TITLE_MAX}
            placeholder="Opcional"
            onChange={(event) => update({ title: event.target.value })}
          />
        </label>

        <label className="journal-field">
          Página
          <textarea
            value={form.body}
            maxLength={JOURNAL_BODY_MAX}
            placeholder="O que ficou deste dia?"
            rows={12}
            onChange={(event) => update({ body: event.target.value })}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </label>

        <div className="journal-paper-foot">
          <span>
            {words} {words === 1 ? 'palavra' : 'palavras'}
            {nearLimit ? ` · ${form.body.length}/${JOURNAL_BODY_MAX}` : ''}
          </span>
          <div>
            {form.id && (
              <button type="button" className="journal-ghost" onClick={() => leaveTo('new')} disabled={busy}>
                Cancelar edição
              </button>
            )}
            <button type="submit" className="journal-save" disabled={busy || !form.body.trim()}>
              {busy ? 'Guardando…' : form.id ? 'Salvar alterações' : 'Salvar página'}
            </button>
          </div>
        </div>
        {error && <p className="journal-error" role="alert">{error}</p>}
      </form>

      <div className="glass-panel journal-list">
        <div className="journal-list-tools">
          <label className="journal-search">
            <Search size={16} />
            <input
              type="search"
              value={search}
              placeholder="Buscar nas páginas"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select value={moodFilter} onChange={(event) => setMoodFilter(event.target.value)} aria-label="Filtrar por humor">
            <option value="">Todos os humores</option>
            <option value="none">Sem humor</option>
            {JOURNAL_MOODS.map((mood) => (
              <option key={mood.id} value={mood.id}>{mood.label}</option>
            ))}
          </select>
        </div>

        {entries.length === 0 ? (
          <p className="journal-empty">Nenhuma página ainda. A primeira linha já registra o dia.</p>
        ) : filtered.length === 0 ? (
          <p className="journal-empty">Nenhuma página com esse filtro.</p>
        ) : (
          groups.map(([month, items]) => (
            <div key={month} className="journal-month">
              <h3>{formatJournalMonth(items[0].date)}</h3>
              <ul>
                {items.map((entry) => {
                  const mood = journalMood(entry.mood);
                  const active = form.id === entry.id;
                  return (
                    <li key={entry.id} className={active ? 'is-active' : ''}>
                      <button type="button" className="journal-entry" onClick={() => leaveTo(entry)}>
                        <span className="journal-entry-date">
                          {entry.date === todayStr ? 'Hoje' : formatJournalDate(entry.date)}
                          {mood && <em>{mood.emoji} {mood.label}</em>}
                        </span>
                        <strong>{entry.title || journalExcerpt(entry.body, 72)}</strong>
                        {entry.title && <span>{journalExcerpt(entry.body, 180)}</span>}
                        <small>{countWords(entry.body)} {countWords(entry.body) === 1 ? 'palavra' : 'palavras'}</small>
                      </button>
                      <div className="journal-entry-actions">
                        <button type="button" onClick={() => leaveTo(entry)} aria-label={`Editar página de ${formatJournalDate(entry.date)}`}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" onClick={() => setPendingDelete(entry)} aria-label={`Excluir página de ${formatJournalDate(entry.date)}`}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      <ConfirmModal
        isOpen={Boolean(pendingDelete)}
        title="Apagar página"
        message="Essa página sai do diário. O texto não volta."
        confirmText="Sim, apagar"
        cancelText="Cancelar"
        confirmVariant="danger"
        icon={Trash2}
        onConfirm={async () => {
          const id = pendingDelete?.id;
          setPendingDelete(null);
          if (!id) return;
          const result = await onDelete?.(id);
          if (result && form.id === id) startNew();
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmModal
        isOpen={Boolean(pendingLeave)}
        title="Descartar o que não foi salvo?"
        message="O texto desta página ainda não foi guardado no Grimório."
        confirmText="Descartar"
        cancelText="Continuar escrevendo"
        confirmVariant="warning"
        onConfirm={confirmLeave}
        onCancel={() => setPendingLeave(null)}
      />
    </section>
  );
}
