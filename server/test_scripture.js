import './testEnv.js';
import assert from 'node:assert/strict';
import { defaultDatabase, getDb, saveDb } from './db.js';
import {
  bibleTotals,
  getBibleBook,
  verseCount,
  isValidPassage
} from '../src/data/bibleCanon.js';
import {
  logScriptureSession,
  updateScriptureSession,
  deleteScriptureSession,
  addScriptureQuote,
  updateScriptureQuote,
  deleteScriptureQuote,
  addScriptureReflection,
  saveScriptureLiveDraft
} from './domain/activities.js';
import { getReadingLoadSeries, getScriptureLoadSeries } from '../src/utils/homeostasis.js';
import { mergeScriptureDrafts, sanitizeScriptureDraft } from '../src/utils/liveScriptureDraft.js';

const totals = bibleTotals();
assert.equal(totals.books, 66, 'cânone protestante tem 66 livros');
assert.equal(totals.otBooks, 39);
assert.equal(totals.ntBooks, 27);
assert.equal(totals.chapters, 1189, '1189 capítulos');
assert.equal(totals.verses, 31102, '31102 versículos');
assert.equal(verseCount(getBibleBook('sl'), 119), 176, 'Salmo 119 tem 176 versículos');
assert.equal(verseCount(getBibleBook('joa'), 3), 36, 'João 3 tem 36 versículos');
assert.equal(isValidPassage('joa', 3, 16), true);
assert.equal(isValidPassage('joa', 3, 99), false);
assert.equal(isValidPassage('apocrifo', 1, 1), false);

const db = defaultDatabase();
db.bossRaid.maxHp = 100000;
db.bossRaid.currentHp = 100000;
saveDb(db);
const live = getDb();
const beforeXp = live.userProfile.xp;

const session = logScriptureSession(live, {
  startBookId: 'joa',
  startChapter: 3,
  startVerse: 1,
  endBookId: 'joa',
  endChapter: 3,
  endVerse: 21,
  durationMinutes: 25,
  reflection: 'O encontro com Nicodemos.',
  quotes: [{ bookId: 'joa', chapter: 3, verse: 16, quote: 'Porque Deus amou o mundo...', note: 'O versículo do dia.' }]
});
assert.equal(session.error, undefined, session.error);
assert.equal(session.session.chaptersRead, 1);
assert.equal(session.session.quotes[0].reference, 'Jo 3:16');
const joQuoteId = session.session.quotes[0].id;
assert.equal(live.scriptureProgress.joa.chaptersRead, 1);
assert.equal(live.scriptureReflections.length, 1);
assert.ok(live.userProfile.xp > beforeXp, 'a sessão concede XP');

const span = logScriptureSession(live, {
  startBookId: 'jd',
  startChapter: 1,
  startVerse: 1,
  endBookId: 'ap',
  endChapter: 1,
  endVerse: 5,
  durationMinutes: 12
});
assert.equal(span.session.chaptersRead, 2, 'Judas 1 + Apocalipse 1');
assert.equal(live.scriptureProgress.jd.completed, true);
assert.equal(live.scriptureProgress.ap.completed, false);

const invalid = logScriptureSession(live, {
  startBookId: 'joa',
  startChapter: 3,
  startVerse: 16,
  endBookId: 'joa',
  endChapter: 3,
  endVerse: 1,
  durationMinutes: 5
});
assert.ok(invalid.error, 'rejeita trecho invertido');

const quote = addScriptureQuote(live, {
  bookId: 'sl',
  chapter: 23,
  verse: 1,
  quote: 'O Senhor é o meu pastor.',
  note: 'Descanso.'
});
assert.equal(quote.quote.reference, 'Sl 23:1');
const reflection = addScriptureReflection(live, { bookId: 'sl', chapter: 23, verse: 1, text: 'Posso descansar.' });
assert.equal(reflection.reflection.reference, 'Sl 23:1');

const xpAfterQuote = live.userProfile.xp;
deleteScriptureQuote(live, quote.quote.id);
assert.ok(live.userProfile.xp < xpAfterQuote, 'citação avulsa estorna');

const xpBeforeDelete = live.userProfile.xp;
deleteScriptureSession(live, session.session.id);
assert.equal(live.scriptureProgress.joa, undefined, 'excluir a sessão devolve o progresso');
assert.ok(live.userProfile.xp < xpBeforeDelete, 'excluir a sessão estorna');

const reading = getReadingLoadSeries([{ date: '2026-08-10', durationMinutes: 40 }], '2026-08-10');
const scripture = getScriptureLoadSeries([{ date: '2026-08-10', durationMinutes: 25 }], '2026-08-10');
assert.equal(reading.today.minutes, 40);
assert.equal(scripture.today.minutes, 25);
assert.notEqual(reading.today.minutes, scripture.today.minutes, 'os tempos não se misturam');

const editDb = defaultDatabase();
const editable = logScriptureSession(editDb, {
  startBookId: 'joa',
  startChapter: 3,
  startVerse: 16,
  endBookId: 'joa',
  endChapter: 3,
  endVerse: 16,
  durationMinutes: 8,
  quotes: [{ bookId: 'joa', chapter: 3, verse: 16, quote: 'Porque Deus amou o mundo.' }]
});
const edited = updateScriptureQuote(editDb, {
  id: editable.session.quotes[0].id,
  bookId: 'ec',
  chapter: 2,
  verse: 13,
  endVerse: 14,
  quote: 'A sabedoria é mais proveitosa.',
  note: 'Comentário revisado.'
});
assert.equal(edited.error, undefined, edited.error);
assert.equal(edited.quote.reference, 'Ec 2:13-14', 'a edição guarda o intervalo do versículo');
assert.equal(editDb.scriptureSessions[0].quotes[0].reference, 'Ec 2:13-14');

const sessionEdit = updateScriptureSession(editDb, editable.session.id, {
  notes: 'Sessão revisada',
  quotes: [{ bookId: 'ap', chapter: 1, verse: 1, endVerse: 3, quote: 'A revelação de Jesus Cristo.' }]
});
assert.equal(sessionEdit.error, undefined, sessionEdit.error);
assert.equal(sessionEdit.session.notes, 'Sessão revisada');
assert.equal(sessionEdit.session.quotes[0].reference, 'Ap 1:1–3');
assert.equal(sessionEdit.session.startBookId, 'joa');

const draftDb = defaultDatabase();
const startedAt = Date.now() - 90_000;
const saved = saveScriptureLiveDraft(draftDb, {
  start: { bookId: 'ec', chapter: 2, verse: 13 },
  end: { bookId: 'ec', chapter: 2, verse: 14 },
  notes: 'Leitura da manhã',
  reflection: 'O sábio tem os olhos na cabeça.',
  quoteText: 'A sabedoria é mais proveitosa',
  quoteNote: 'Comentário longo\ncom quebra de linha',
  quotes: [{ bookId: 'ec', chapter: 2, verse: 13, quote: 'Primeira citação', note: 'Nota 1' }],
  timer: { accumulatedMs: 83_000, runStartedAt: startedAt },
  updatedAt: Date.now() - 1000
});
assert.equal(saved.error, undefined, saved.error);
assert.equal(saved.scriptureLiveDraft.timer.runStartedAt, startedAt, 'o timer em andamento é persistido');
assert.equal(saved.scriptureLiveDraft.quoteNote.includes('\n'), true, 'comentário multilinha é preservado');
assert.equal(saved.scriptureLiveDraft.quotes.length, 1);

const newer = sanitizeScriptureDraft({
  ...saved.scriptureLiveDraft,
  notes: 'Atualizado no outro aparelho',
  timer: { accumulatedMs: 120_000, runStartedAt: startedAt },
  updatedAt: saved.scriptureLiveDraft.updatedAt + 5000
});
const older = sanitizeScriptureDraft({
  ...saved.scriptureLiveDraft,
  notes: 'Rascunho velho',
  updatedAt: saved.scriptureLiveDraft.updatedAt - 5000
});
assert.equal(mergeScriptureDrafts(older, newer).notes, 'Atualizado no outro aparelho');
assert.equal(mergeScriptureDrafts(newer, older).notes, 'Atualizado no outro aparelho');

const cleared = saveScriptureLiveDraft(draftDb, { clear: true });
assert.equal(cleared.scriptureLiveDraft, null);
assert.equal(draftDb.scriptureLiveDraft, null);

console.log('✅ leitura da Bíblia: cânone, sessão, citação, reflexão, tempo independente e rascunho vivo');
