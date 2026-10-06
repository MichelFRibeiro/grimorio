import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookMarked,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Quote,
  ScrollText,
  Trash2,
  CheckCircle2,
  Search
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { useStopwatch, formatTimer } from '../hooks/useStopwatch';
import { ScriptureLoadChart } from './ReadingLoadChart';
import { PlanHomeostasisVictoryButton } from './PlanHomeostasisVictoryButton';
import {
  BIBLE_BOOKS,
  bibleTotals,
  booksByTestament,
  chapterCount,
  verseCount,
  formatReference,
  getBibleBook
} from '../data/bibleCanon';
import {
  readLocalScriptureDraft,
  writeLocalScriptureDraft,
  clearLocalScriptureDraft,
  mergeScriptureDrafts,
  sanitizeScriptureDraft
} from '../utils/liveScriptureDraft';
import { getSaoPauloDateStr } from '../utils/timeUtils';
import { confirmLongDuration, secondsToDurationMinutes } from '../utils/activityDuration';
import { buildScriptureHomeostasisVictory } from '../utils/homeostasis';

const fieldStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  background: '#1a2030',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  color: '#fff',
  fontSize: '0.92rem'
};

function PassageFields({ label, bookId, chapter, verse, onChange, accent = '#fbbf24' }) {
  const book = getBibleBook(bookId);
  const chapters = chapterCount(book);
  const verses = verseCount(book, chapter);
  return (
    <div style={{ flex: 1, minWidth: '220px' }}>
      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: accent, marginBottom: '6px' }}>{label}</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <select value={bookId} onChange={(e) => onChange({ bookId: e.target.value, chapter: 1, verse: 1 })} style={{ ...fieldStyle, flex: 2 }}>
          {BIBLE_BOOKS.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <select
          value={chapter}
          onChange={(e) => onChange({ bookId, chapter: Number(e.target.value), verse: 1 })}
          style={{ ...fieldStyle, flex: 1 }}
          aria-label={`${label} capítulo`}
        >
          {Array.from({ length: chapters }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select
          value={verse}
          onChange={(e) => onChange({ bookId, chapter, verse: Number(e.target.value) })}
          style={{ ...fieldStyle, flex: 1 }}
          aria-label={`${label} versículo`}
        >
          {Array.from({ length: verses }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}

export function ScriptureView({
  scriptureProgress = {},
  scriptureSessions = [],
  scriptureQuotes = [],
  scriptureReflections = [],
  onLogSession,
  onDeleteSession,
  onAddQuote,
  onDeleteQuote,
  onAddReflection,
  onDeleteReflection,
  onAddDailyVictory,
  scriptureLiveDraft = null,
  onSaveLiveDraft,
  onClearLiveDraft
}) {
  const restoredRef = useRef(readLocalScriptureDraft());
  const restored = restoredRef.current;
  const [tab, setTab] = useState('canon');
  const [testament, setTestament] = useState('ot');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(restored?.end?.bookId || 'gn');
  const [sessionOpen, setSessionOpen] = useState(Boolean(restored?.active));
  const [start, setStart] = useState(restored?.start || { bookId: 'gn', chapter: 1, verse: 1 });
  const [end, setEnd] = useState(restored?.end || { bookId: 'gn', chapter: 1, verse: 1 });
  const [notes, setNotes] = useState(restored?.notes || '');
  const [reflection, setReflection] = useState(restored?.reflection || '');
  const [quoteText, setQuoteText] = useState(restored?.quoteText || '');
  const [quoteNote, setQuoteNote] = useState(restored?.quoteNote || '');
  const [quotes, setQuotes] = useState(restored?.quotes || []);
  const [directQuote, setDirectQuote] = useState('');
  const [directNote, setDirectNote] = useState('');
  const [reflectionText, setReflectionText] = useState('');
  const [confirm, setConfirm] = useState(null);

  const persistEnabledRef = useRef(Boolean(restored?.active));
  const appliedRemoteAtRef = useRef(restored?.updatedAt || 0);
  const fieldsRef = useRef(null);
  const draftRef = useRef(restored);

  const timer = useStopwatch({
    initialAccumulatedMs: restored?.timer?.accumulatedMs || 0,
    initialRunStartedAt: restored?.timer?.runStartedAt || null
  });
  const today = getSaoPauloDateStr();
  const victory = useMemo(
    () => buildScriptureHomeostasisVictory(scriptureSessions, today),
    [scriptureSessions, today]
  );
  const totals = bibleTotals();
  const groups = booksByTestament();
  const selected = getBibleBook(selectedId) || BIBLE_BOOKS[0];
  const progress = scriptureProgress?.[selected.id] || null;
  const readChapters = progress?.chaptersRead || 0;

  const visibleBooks = (groups[testament] || []).filter((book) => {
    const q = query.trim().toLowerCase();
    return !q || book.name.toLowerCase().includes(q) || book.abbr.toLowerCase().includes(q);
  });

  fieldsRef.current = { start, end, notes, reflection, quoteText, quoteNote, quotes };

  const buildDraft = (overrides = {}) => {
    const fields = fieldsRef.current || {};
    const snap = timer.getSnapshot();
    return sanitizeScriptureDraft({
      active: true,
      start: fields.start,
      end: fields.end,
      notes: fields.notes,
      reflection: fields.reflection,
      quotes: fields.quotes,
      quoteText: fields.quoteText,
      quoteNote: fields.quoteNote,
      timer: { accumulatedMs: snap.accumulatedMs, runStartedAt: snap.runStartedAt },
      updatedAt: Date.now(),
      ...overrides
    });
  };
  const rememberDraft = (draft) => {
    draftRef.current = draft;
    return draft;
  };

  const applyDraft = (draft, { resumeTimer = true } = {}) => {
    if (!draft) return;
    setStart(draft.start);
    setEnd(draft.end);
    setNotes(draft.notes || '');
    setReflection(draft.reflection || '');
    setQuotes(draft.quotes || []);
    setQuoteText(draft.quoteText || '');
    setQuoteNote(draft.quoteNote || '');
    setSelectedId(draft.end?.bookId || draft.start?.bookId || 'gn');
    appliedRemoteAtRef.current = draft.updatedAt || Date.now();
    if (resumeTimer) {
      timer.restore(draft.timer?.accumulatedMs || 0, draft.timer?.runStartedAt || null);
    }
  };

  useEffect(() => {
    if (!scriptureLiveDraft) return;
    const remote = sanitizeScriptureDraft(scriptureLiveDraft);
    if (!remote?.active) return;
    const winner = mergeScriptureDrafts(draftRef.current || readLocalScriptureDraft(), remote);
    if (!winner) return;
    const knownAt = Math.max(draftRef.current?.updatedAt || 0, appliedRemoteAtRef.current || 0);
    if ((winner.updatedAt || 0) <= knownAt) return;
    persistEnabledRef.current = true;
    writeLocalScriptureDraft(winner);
    rememberDraft(winner);
    setSessionOpen(true);
    applyDraft(winner);
  }, [scriptureLiveDraft]);

  useEffect(() => {
    if (!sessionOpen) return undefined;
    const blockDismiss = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', blockDismiss, true);
    return () => window.removeEventListener('keydown', blockDismiss, true);
  }, [sessionOpen]);

  useEffect(() => {
    if (!sessionOpen || !persistEnabledRef.current) return undefined;
    const persist = () => {
      if (!persistEnabledRef.current) return;
      const draft = rememberDraft(buildDraft());
      if (!draft) return;
      writeLocalScriptureDraft(draft);
      appliedRemoteAtRef.current = draft.updatedAt;
      onSaveLiveDraft?.(draft)?.catch?.(() => {});
    };
    persist();
    const interval = setInterval(persist, timer.isRunning ? 5000 : 15000);
    const persistIfHidden = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    document.addEventListener('visibilitychange', persistIfHidden);
    window.addEventListener('pagehide', persist);
    document.addEventListener('freeze', persist);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', persistIfHidden);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('freeze', persist);
    };
  }, [sessionOpen, start, end, notes, reflection, quoteText, quoteNote, quotes, timer.isRunning, timer.getSnapshot, onSaveLiveDraft]);

  const openSession = (book) => {
    if (sessionOpen && persistEnabledRef.current) {
      setTab('canon');
      return;
    }
    const next = { bookId: book.id, chapter: progress?.chapter || 1, verse: 1 };
    persistEnabledRef.current = true;
    setStart(next);
    setEnd(next);
    setNotes('');
    setReflection('');
    setQuotes([]);
    setQuoteText('');
    setQuoteNote('');
    timer.restart();
    setSessionOpen(true);
    setTab('canon');
  };

  const discardSession = () => {
    persistEnabledRef.current = false;
    clearLocalScriptureDraft();
    draftRef.current = null;
    appliedRemoteAtRef.current = Date.now();
    setSessionOpen(false);
    timer.reset();
    setQuotes([]);
    setQuoteText('');
    setQuoteNote('');
    setNotes('');
    setReflection('');
    onClearLiveDraft?.()?.catch?.(() => {});
  };

  const saveSession = (event) => {
    event.preventDefault();
    const durationMinutes = confirmLongDuration(Math.max(1, secondsToDurationMinutes(timer.getElapsedSeconds())));
    if (durationMinutes == null) return;
    const collected = [...quotes];
    if (quoteText.trim() || quoteNote.trim()) {
      collected.push({
        id: `sqd-${Date.now()}`,
        bookId: end.bookId,
        chapter: end.chapter,
        verse: end.verse,
        quote: quoteText.trim(),
        note: quoteNote.trim()
      });
    }
    persistEnabledRef.current = false;
    clearLocalScriptureDraft();
    onLogSession?.({
      startBookId: start.bookId,
      startChapter: start.chapter,
      startVerse: start.verse,
      endBookId: end.bookId,
      endChapter: end.chapter,
      endVerse: end.verse,
      durationMinutes,
      notes,
      reflection,
      quotes: collected
    });
    discardSession();
    setTab('canon');
  };

  const addQuoteToSession = () => {
    if (!quoteText.trim() && !quoteNote.trim()) return;
    setQuotes((prev) => [...prev, {
      id: `sqd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      bookId: end.bookId,
      chapter: end.chapter,
      verse: end.verse,
      quote: quoteText.trim(),
      note: quoteNote.trim()
    }]);
    setQuoteText('');
    setQuoteNote('');
  };

  const bookQuotes = (scriptureQuotes || []).filter((item) => item.bookId === selected.id);
  const bookReflections = (scriptureReflections || []).filter((item) => item.bookId === selected.id);
  const bookSessions = (scriptureSessions || []).filter((item) => (
    item.startBookId === selected.id || item.endBookId === selected.id
    || (item.chapters || []).some((chapter) => chapter.bookId === selected.id)
  ));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BookMarked size={22} color="#fbbf24" /> Escrituras
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            {totals.books} livros · {totals.chapters} capítulos · {totals.verses.toLocaleString('pt-BR')} versículos. O tempo não entra na Biblioteca.
          </p>
        </div>
        <button type="button" onClick={() => openSession(selected)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#111', fontWeight: 800, cursor: 'pointer' }}>
          <Play size={16} /> Ler agora
        </button>
      </div>

      <ScriptureLoadChart
        scriptureSessions={scriptureSessions}
        todayStr={today}
        liveMinutes={sessionOpen ? Math.floor(timer.seconds / 60) : 0}
        actions={<PlanHomeostasisVictoryButton victory={victory} onAddDailyVictory={onAddDailyVictory} accentColor="#fbbf24" />}
      />

      <div className="glass-panel" style={{ display: 'flex', gap: '8px', padding: '6px', margin: '16px 0', borderRadius: '12px', width: 'fit-content' }}>
        {[['canon', 'Cânone'], ['quotes', `Citações (${scriptureQuotes.length})`], ['reflections', `Reflexões (${scriptureReflections.length})`]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 800, background: tab === id ? 'rgba(245,158,11,0.2)' : 'transparent', color: tab === id ? '#fbbf24' : '#94a3b8' }}>{label}</button>
        ))}
      </div>

      {tab === 'canon' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: '16px' }}>
          <div className="glass-panel" style={{ padding: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              {[['ot', 'Antigo'], ['nt', 'Novo']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setTestament(id)} style={{ flex: 1, padding: '7px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 800, background: testament === id ? '#fbbf24' : 'rgba(255,255,255,0.06)', color: testament === id ? '#111' : '#cbd5e1' }}>{label}</button>
              ))}
            </div>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: '#64748b' }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar livro" style={{ ...fieldStyle, paddingLeft: '30px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '62vh', overflowY: 'auto' }}>
              {visibleBooks.map((book) => {
                const done = scriptureProgress?.[book.id]?.chaptersRead || 0;
                const active = book.id === selected.id;
                return (
                  <button key={book.id} type="button" onClick={() => setSelectedId(book.id)} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: active ? 'rgba(245,158,11,0.16)' : 'transparent', color: active ? '#fbbf24' : '#e2e8f0' }}>
                    <strong>{book.name}</strong>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8' }}>{done}/{book.chapters.length} capítulos</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
              <div>
                <h3 className="font-cinzel" style={{ color: '#f8fafc', fontSize: '1.3rem' }}>{selected.name}</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>{selected.abbr} · {chapterCount(selected)} capítulos · {selected.testament === 'nt' ? 'Novo Testamento' : 'Antigo Testamento'}</p>
              </div>
              {progress?.completed && <span style={{ color: '#34d399', fontWeight: 800, display: 'flex', gap: '4px', alignItems: 'center' }}><CheckCircle2 size={16} /> Lido</span>}
            </div>
            <div style={{ margin: '14px 0', height: '8px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ width: `${Math.min(100, Math.round((readChapters / chapterCount(selected)) * 100))}%`, height: '100%', borderRadius: '99px', background: '#fbbf24' }} />
            </div>
            <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '14px' }}>
              {readChapters} de {chapterCount(selected)} capítulos lidos
              {progress?.lastReadDate ? ` · última leitura em ${progress.lastReadDate}` : ''}.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '18px' }}>
              {selected.chapters.map((verses, index) => {
                const chapter = index + 1;
                const read = progress?.completed || (progress?.chapter && chapter < progress.chapter) || (progress?.chapter === chapter && progress?.verse >= verses);
                return (
                  <button key={chapter} type="button" title={`${verses} versículos`} onClick={() => openSession(selected)} style={{ width: '36px', height: '32px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.08)', background: read ? 'rgba(245,158,11,0.28)' : 'rgba(255,255,255,0.04)', color: read ? '#fbbf24' : '#94a3b8', fontWeight: 700, cursor: 'pointer' }}>{chapter}</button>
                );
              })}
            </div>

            {bookSessions.length > 0 && (
              <div>
                <h4 style={{ color: '#f8fafc', marginBottom: '8px' }}>Sessões deste livro</h4>
                {bookSessions.slice(0, 6).map((session) => (
                  <div key={session.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#cbd5e1', fontSize: '0.82rem' }}>
                    <span>{formatReference(getBibleBook(session.startBookId), session.startChapter, session.startVerse)} – {formatReference(getBibleBook(session.endBookId), session.endChapter, session.endVerse)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={12} /> {session.durationMinutes} min
                      <button type="button" aria-label="Excluir sessão" onClick={() => setConfirm({ title: 'Excluir sessão', message: 'O XP e a Sabedoria desta sessão serão estornados.', onConfirm: () => onDeleteSession?.(session.id) })} style={{ background: 'none', border: 'none', color: '#fb7185', cursor: 'pointer' }}><Trash2 size={13} /></button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'quotes' && (
        <QuotePanel
          quotes={scriptureQuotes}
          draft={directQuote}
          note={directNote}
          passage={end}
          onPassage={setEnd}
          onDraft={setDirectQuote}
          onNote={setDirectNote}
          onAdd={() => {
            if (!directQuote.trim()) return;
            onAddQuote?.({ ...end, quote: directQuote.trim(), note: directNote.trim() });
            setDirectQuote('');
            setDirectNote('');
          }}
          onDelete={(id) => setConfirm({ title: 'Excluir citação', message: 'A recompensa avulsa, se houver, será estornada.', onConfirm: () => onDeleteQuote?.(id) })}
        />
      )}

      {tab === 'reflections' && (
        <div className="glass-panel" style={{ padding: '16px' }}>
          <PassageFields label="Versículo da reflexão" {...end} onChange={setEnd} />
          <textarea value={reflectionText} onChange={(e) => setReflectionText(e.target.value)} rows={4} placeholder="O que este trecho diz para hoje?" style={{ ...fieldStyle, marginTop: '10px' }} />
          <button type="button" onClick={() => { if (!reflectionText.trim()) return; onAddReflection?.({ ...end, text: reflectionText.trim() }); setReflectionText(''); }} style={{ marginTop: '10px', padding: '9px 14px', borderRadius: '10px', border: 'none', background: '#fbbf24', color: '#111', fontWeight: 800, cursor: 'pointer' }}>
            <ScrollText size={14} /> Guardar reflexão
          </button>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(scriptureReflections || []).map((item) => (
              <article key={item.id} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', color: '#fbbf24', fontWeight: 800 }}>
                  <span>{item.reference}</span>
                  <button type="button" aria-label="Excluir reflexão" onClick={() => onDeleteReflection?.(item.id)} style={{ background: 'none', border: 'none', color: '#fb7185', cursor: 'pointer' }}><Trash2 size={13} /></button>
                </header>
                <p style={{ color: '#e2e8f0', marginTop: '6px' }}>{item.text}</p>
              </article>
            ))}
            {bookReflections.length === 0 && scriptureReflections.length === 0 && <p style={{ color: '#64748b' }}>Nenhuma reflexão ainda.</p>}
          </div>
        </div>
      )}

      {sessionOpen && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => event.stopPropagation()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <form onSubmit={saveSession} onMouseDown={(event) => event.stopPropagation()} className="glass-panel modal-sheet" style={{ width: 'min(820px, 100%)', maxHeight: '92vh', overflowY: 'auto', padding: '24px', borderRadius: '18px' }}>
            <h3 className="font-cinzel" style={{ color: '#f8fafc', marginBottom: '12px' }}>Sessão de Escritura</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: '12px', background: 'rgba(0,0,0,0.35)', marginBottom: '14px' }}>
              <strong style={{ color: '#fbbf24', fontSize: '1.6rem', fontFamily: 'var(--font-mono)' }}>{formatTimer(timer.seconds)}</strong>
              <span style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={timer.toggle} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontWeight: 800, cursor: 'pointer' }}>{timer.isRunning ? <Pause size={14} /> : <Play size={14} />} {timer.isRunning ? 'Pausar' : 'Iniciar'}</button>
                <button type="button" onClick={timer.reset} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}><RotateCcw size={14} /></button>
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <PassageFields label="De" {...start} onChange={setStart} />
              <PassageFields label="Até" {...end} onChange={setEnd} accent="#34d399" />
            </div>
            <label style={{ display: 'block', marginTop: '12px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>Notas da sessão
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...fieldStyle, marginTop: '4px' }} />
            </label>
            <label style={{ display: 'block', marginTop: '10px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>Reflexão
              <textarea value={reflection} onChange={(e) => setReflection(e.target.value)} rows={3} placeholder="O que ficou desta leitura?" style={{ ...fieldStyle, marginTop: '4px' }} />
            </label>
            <div style={{ marginTop: '12px', padding: '12px', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                <strong style={{ color: '#fbbf24', display: 'flex', gap: '6px', alignItems: 'center' }}><Quote size={14} /> Citações deste trecho</strong>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{quotes.length} {quotes.length === 1 ? 'citação' : 'citações'}</span>
              </div>
              <label style={{ display: 'block', marginTop: '8px', color: '#94a3b8', fontSize: '0.78rem', fontWeight: 700 }}>Citação
                <textarea value={quoteText} onChange={(e) => setQuoteText(e.target.value)} rows={3} placeholder="Versículo ou trecho marcado" style={{ ...fieldStyle, marginTop: '4px' }} />
              </label>
              <label style={{ display: 'block', marginTop: '8px', color: '#94a3b8', fontSize: '0.78rem', fontWeight: 700 }}>Comentário
                <textarea value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} rows={3} placeholder="Comentário ou reflexão sobre esta citação (opcional)" style={{ ...fieldStyle, marginTop: '4px' }} />
              </label>
              <button type="button" onClick={addQuoteToSession} style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'rgba(245,158,11,0.18)', color: '#fbbf24', fontWeight: 800, cursor: 'pointer' }}>
                <Plus size={14} /> Adicionar citação
              </button>
              {quotes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  {quotes.map((item) => (
                    <article key={item.id} style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: '#fbbf24', fontSize: '0.75rem' }}>{formatReference(getBibleBook(item.bookId), item.chapter, item.verse)}</strong>
                        {item.quote && <p style={{ color: '#f8fafc', fontStyle: 'italic', marginTop: '4px', whiteSpace: 'pre-wrap' }}>“{item.quote}”</p>}
                        {item.note && <p style={{ color: '#94a3b8', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{item.note}</p>}
                      </div>
                      <button type="button" aria-label="Remover citação" onClick={() => setQuotes((prev) => prev.filter((quote) => quote.id !== item.id))} style={{ background: 'none', border: 'none', color: '#fb7185', cursor: 'pointer', flexShrink: 0 }}>
                        <Trash2 size={14} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <p style={{ marginTop: '10px', color: '#64748b', fontSize: '0.75rem' }}>
              O cronômetro e os textos ficam salvos neste aparelho e na conta. Recarregar ou abrir em outro dispositivo continua de onde parou. Só Cancelar ou Salvar sessão encerram.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button type="button" onClick={discardSession} style={{ padding: '10px 14px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer' }}>Cancelar</button>
              <button type="submit" style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', background: '#fbbf24', color: '#111', fontWeight: 800, cursor: 'pointer' }}><Plus size={14} /> Salvar sessão</button>
            </div>
          </form>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          isOpen
          title={confirm.title}
          message={confirm.message}
          confirmText="Excluir"
          confirmVariant="danger"
          onCancel={() => setConfirm(null)}
          onConfirm={() => { confirm.onConfirm?.(); setConfirm(null); }}
        />
      )}
    </div>
  );
}

function QuotePanel({ quotes, draft, note, passage, onPassage, onDraft, onNote, onAdd, onDelete }) {
  return (
    <div className="glass-panel" style={{ padding: '16px' }}>
      <PassageFields label="Referência" {...passage} onChange={onPassage} />
      <label style={{ display: 'block', marginTop: '10px', color: '#94a3b8', fontSize: '0.78rem', fontWeight: 700 }}>Citação
        <textarea value={draft} onChange={(e) => onDraft(e.target.value)} rows={3} placeholder="Texto da citação" style={{ ...fieldStyle, marginTop: '4px' }} />
      </label>
      <label style={{ display: 'block', marginTop: '8px', color: '#94a3b8', fontSize: '0.78rem', fontWeight: 700 }}>Comentário
        <textarea value={note} onChange={(e) => onNote(e.target.value)} rows={3} placeholder="Reflexão sobre a citação" style={{ ...fieldStyle, marginTop: '4px' }} />
      </label>
      <button type="button" onClick={onAdd} style={{ marginTop: '10px', padding: '9px 14px', borderRadius: '10px', border: 'none', background: '#fbbf24', color: '#111', fontWeight: 800, cursor: 'pointer' }}>Salvar citação</button>
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {quotes.map((item) => (
          <article key={item.id} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', color: '#fbbf24', fontWeight: 800 }}>
              <span>{item.reference}</span>
              <button type="button" aria-label="Excluir citação" onClick={() => onDelete(item.id)} style={{ background: 'none', border: 'none', color: '#fb7185', cursor: 'pointer' }}><Trash2 size={13} /></button>
            </header>
            <p style={{ color: '#f8fafc', fontStyle: 'italic', marginTop: '6px', whiteSpace: 'pre-wrap' }}>“{item.quote}”</p>
            {item.note && <p style={{ color: '#94a3b8', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{item.note}</p>}
          </article>
        ))}
        {quotes.length === 0 && <p style={{ color: '#64748b' }}>Nenhuma citação ainda.</p>}
      </div>
    </div>
  );
}
