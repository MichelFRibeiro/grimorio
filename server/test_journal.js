import './testEnv.js';
import assert from 'node:assert/strict';
import fs from 'fs';
import { getDb, getDbFilePath, initDb, saveDb } from './db.js';
import {
  createJournalEntry,
  deleteJournalEntry,
  listJournalEntries,
  updateJournalEntry
} from './domain/journal.js';
import { isFeatureEnabled } from '../src/utils/featureSettings.js';
import {
  JOURNAL_BODY_MAX,
  JOURNAL_MAX_ENTRIES,
  countWords,
  journalExcerpt,
  journalWritingStreak,
  sanitizeJournalEntries
} from '../src/utils/journal.js';

await initDb();
const db = getDb();
const today = '2026-10-18';

assert.equal(isFeatureEnabled({}, 'journal'), true);
assert.equal(isFeatureEnabled({ journal: false }, 'journal'), false);
assert.equal(Array.isArray(db.journalEntries), true);

const empty = createJournalEntry(db, { body: '   ' }, { todayStr: today });
assert.match(empty.error, /escreva/i);

const badDate = createJournalEntry(db, { body: 'um dia', date: '2026-02-31' }, { todayStr: today });
assert.match(badDate.error, /data/i);

const badMood = createJournalEntry(db, { body: 'um dia', mood: 'eufórico' }, { todayStr: today });
assert.match(badMood.error, /humor/i);

const tooLong = createJournalEntry(db, { body: 'a'.repeat(JOURNAL_BODY_MAX + 1) }, { todayStr: today });
assert.match(tooLong.error, /máximo/i);

const created = createJournalEntry(db, {
  title: '  Manhã clara  ',
  body: '  Escrevi antes do café.\nA casa ainda estava quieta.  ',
  mood: 'sereno'
}, { todayStr: today, now: new Date('2026-10-18T11:00:00.000Z') });
assert.equal(created.error, undefined);
assert.equal(created.created, true);
assert.equal(created.entry.date, today);
assert.equal(created.entry.title, 'Manhã clara');
assert.equal(created.entry.body, 'Escrevi antes do café.\nA casa ainda estava quieta.');
assert.equal(created.entry.mood, 'sereno');
assert.equal(countWords(created.entry.body), 9);

const second = createJournalEntry(db, {
  date: today,
  body: 'Segunda página do mesmo dia.'
}, { todayStr: today, now: new Date('2026-10-18T18:00:00.000Z') });
assert.equal(second.error, undefined);
assert.equal(db.journalEntries.filter((entry) => entry.date === today).length, 2);

const yesterday = createJournalEntry(db, {
  date: '2026-10-17',
  title: 'Ontem',
  body: 'Uma linha só.',
  mood: 'cansado'
}, { todayStr: today, now: new Date('2026-10-17T21:00:00.000Z') });
assert.equal(yesterday.entry.date, '2026-10-17');

const updated = updateJournalEntry(db, created.entry.id, {
  title: '',
  mood: '',
  body: 'Texto corrigido.'
}, { now: new Date('2026-10-18T19:00:00.000Z') });
assert.equal(updated.error, undefined);
assert.equal(updated.entry.id, created.entry.id);
assert.equal(updated.entry.createdAt, created.entry.createdAt);
assert.notEqual(updated.entry.updatedAt, created.entry.updatedAt);
assert.equal(updated.entry.title, '');
assert.equal(updated.entry.mood, '');
assert.equal(updated.entry.body, 'Texto corrigido.');

const missing = updateJournalEntry(db, 'journal-nao-existe', { body: 'x' });
assert.equal(missing.status, 404);

const listed = listJournalEntries(db, { search: 'corrigido', date: today });
assert.equal(listed.entries.length, 1);
assert.equal(listed.entries[0].id, created.entry.id);

const byMood = listJournalEntries(db, { mood: 'cansado' });
assert.equal(byMood.entries.length, 1);
assert.equal(byMood.entries[0].id, yesterday.entry.id);

assert.equal(journalWritingStreak(db.journalEntries, today), 2);
assert.equal(journalWritingStreak(db.journalEntries, '2026-10-19'), 2);
assert.equal(journalWritingStreak([], today), 0);
assert.equal(journalExcerpt('linha\n\nseguinte com mais texto', 12).endsWith('…'), true);

const sanitized = sanitizeJournalEntries([
  { id: 'a', date: '2026-13-01', body: 'mês inválido' },
  { id: 'b', date: today, body: '   ' },
  { id: 'dup', date: today, body: 'cópia velha', updatedAt: '2020-01-01T00:00:00.000Z', createdAt: '2020-01-01T00:00:00.000Z' },
  { id: 'dup', date: today, body: 'cópia nova', updatedAt: '2026-10-18T19:00:00.000Z', createdAt: '2020-01-01T00:00:00.000Z' },
  null,
  { date: today, body: 'sem id' }
]);
assert.equal(sanitized.some((entry) => entry.id === 'a' || entry.id === 'b'), false);
assert.equal(sanitized.find((entry) => entry.id === 'dup').body, 'cópia nova');

saveDb(db);
const raw = JSON.parse(fs.readFileSync(getDbFilePath(), 'utf8'));
assert.equal(raw.journalEntries.length, 3);

const removed = deleteJournalEntry(db, second.entry.id);
assert.equal(removed.error, undefined);
assert.equal(removed.removed.id, second.entry.id);
assert.equal(db.journalEntries.some((entry) => entry.id === second.entry.id), false);
assert.equal(deleteJournalEntry(db, second.entry.id).status, 404);

db.journalEntries = Array.from({ length: JOURNAL_MAX_ENTRIES }, (_, index) => ({
  id: `journal-seed-${index}`,
  date: '2020-01-01',
  title: '',
  body: 'página',
  mood: '',
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z'
}));
const capped = createJournalEntry(db, { body: 'não cabe' }, { todayStr: today });
assert.match(capped.error, /limite/i);

console.log('Diário: escrita, edição, busca e exclusão ok.');
