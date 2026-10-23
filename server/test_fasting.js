import './testEnv.js';
import assert from 'node:assert/strict';
import { defaultDatabase, getDb, initDb, sanitizeDb } from './db.js';
import {
  deleteFastingSession,
  endFastingSession,
  startFastingSession,
  updateFastingSession
} from './domain/fasting.js';
import {
  activeFastingSession,
  buildFastingSeries,
  eatingWindowHours,
  fastingStage,
  fastingStreak,
  formatFastingClock,
  parseFastingInstant,
  sanitizeFastingSessions
} from '../src/utils/fasting.js';

await initDb();
const db = getDb();
const now = new Date('2026-10-23T15:00:00-03:00');

assert.equal(Array.isArray(defaultDatabase().fastingSessions), true);
const legacy = defaultDatabase();
delete legacy.fastingSessions;
assert.deepEqual(sanitizeDb(legacy).fastingSessions, []);

assert.equal(formatFastingClock(16 * 3600000 + 5 * 60000 + 9000), '16:05:09');
assert.equal(fastingStage(0).id, 'digestion');
assert.equal(fastingStage(4 * 3600000).id, 'glucose');
assert.equal(fastingStage(16 * 3600000).id, 'deep');
assert.equal(fastingStage(24 * 3600000).id, 'extended');
assert.equal(eatingWindowHours(16 * 60), 8);
assert.equal(eatingWindowHours(90), null);
assert.equal(
  parseFastingInstant('2026-10-23T12:00').toISOString(),
  '2026-10-23T15:00:00.000Z'
);

const dirty = sanitizeFastingSessions([
  { id: 'a', startedAt: '2026-10-20T10:00:00-03:00', endedAt: '2026-10-20T09:00:00-03:00', targetMinutes: 960 },
  { id: 'b', startedAt: 'nope' },
  {
    id: 'c',
    startedAt: '2026-10-21T20:00:00-03:00',
    endedAt: '2026-10-22T12:00:00-03:00',
    targetMinutes: 16 * 60,
    note: '  água  '
  }
]);
assert.equal(dirty.length, 1);
assert.equal(dirty[0].note, 'água');
assert.equal(dirty[0].protocol, '16');

db.fastingSessions = [];
const future = startFastingSession(db, { startedAt: '2026-10-24T10:00' }, { now });
assert.equal(future.status, 400);

const tooShort = startFastingSession(db, { targetMinutes: 30 }, { now });
assert.match(tooShort.error, /1 hora/);

const started = startFastingSession(db, { targetMinutes: 16 * 60, note: '  depois do jantar  ' }, { now });
assert.equal(started.error, undefined);
assert.equal(started.created, true);
assert.equal(started.session.protocol, '16');
assert.equal(started.session.note, 'depois do jantar');
assert.equal(started.session.endedAt, null);
assert.equal(activeFastingSession(db.fastingSessions).id, started.session.id);

const second = startFastingSession(db, {}, { now: new Date(now.getTime() + 60000) });
assert.match(second.error, /em curso/);

const tooSoon = endFastingSession(db, started.session.id, { endedAt: now.toISOString() }, { now });
assert.match(tooSoon.error, /1 minuto/);

const endedAt = new Date('2026-10-24T07:00:00-03:00');
const ended = endFastingSession(db, started.session.id, {}, { now: endedAt });
assert.equal(ended.error, undefined);
assert.equal(ended.session.endedAt, endedAt.toISOString());
assert.equal(activeFastingSession(db.fastingSessions), null);

const again = endFastingSession(db, started.session.id, {}, { now: endedAt });
assert.match(again.error, /encerrado/);

const overlap = startFastingSession(db, {
  startedAt: '2026-10-23T20:00',
  endedAt: '2026-10-24T06:00',
  targetMinutes: 12 * 60
}, { now: endedAt });
assert.match(overlap.error, /cruza/);

const previous = startFastingSession(db, {
  startedAt: '2026-10-22T18:00',
  endedAt: '2026-10-23T10:00',
  targetMinutes: 16 * 60
}, { now: endedAt });
assert.equal(previous.error, undefined);
assert.equal(previous.session.protocol, '16');
assert.equal(fastingStreak(db.fastingSessions, endedAt), 2);

const updated = updateFastingSession(db, previous.session.id, {
  targetMinutes: 18 * 60,
  note: '18:6'
}, { now: endedAt });
assert.equal(updated.session.protocol, '18');
assert.equal(updated.session.note, '18:6');
assert.equal(fastingStreak(db.fastingSessions, endedAt), 1);

const series = buildFastingSeries(db.fastingSessions, '2026-10-24', 14);
const todayBar = series.points.find((point) => point.dateStr === '2026-10-24');
const yesterdayBar = series.points.find((point) => point.dateStr === '2026-10-23');
assert.equal(todayBar.count, 1);
assert.equal(todayBar.minutes, 16 * 60);
assert.equal(todayBar.hit, true);
assert.equal(yesterdayBar.count, 1);
assert.equal(yesterdayBar.hit, false);

const open = startFastingSession(db, { targetMinutes: 16 * 60 }, { now: endedAt });
assert.equal(open.error, undefined);
const reopen = updateFastingSession(db, previous.session.id, { endedAt: '' }, { now: endedAt });
assert.match(reopen.error, /em curso/);

const removed = deleteFastingSession(db, open.session.id);
assert.equal(removed.error, undefined);
assert.equal(activeFastingSession(db.fastingSessions), null);

const tooLong = startFastingSession(db, {
  startedAt: '2026-10-10T08:00',
  endedAt: '2026-10-18T08:00',
  targetMinutes: 24 * 60
}, { now: endedAt });
assert.match(tooLong.error, /7 dias/);

const later = new Date('2026-10-25T10:00:00-03:00');
const backdated = startFastingSession(db, {
  startedAt: '2026-10-24T20:00',
  targetMinutes: 16 * 60,
  note: 'comecei ontem'
}, { now: later });
assert.equal(backdated.error, undefined);
assert.equal(backdated.session.endedAt, null);
assert.equal(backdated.session.startedAt, parseFastingInstant('2026-10-24T20:00').toISOString());
assert.equal(activeFastingSession(db.fastingSessions).id, backdated.session.id);

const closedPast = startFastingSession(db, {
  startedAt: '2026-10-24T08:00',
  endedAt: '2026-10-24T16:00',
  targetMinutes: 12 * 60
}, { now: later });
assert.equal(closedPast.error, undefined);
assert.equal(closedPast.session.endedAt, parseFastingInstant('2026-10-24T16:00').toISOString());

const editedPast = updateFastingSession(db, closedPast.session.id, {
  startedAt: '2026-10-24T09:00',
  endedAt: '2026-10-24T15:30',
  note: 'horário corrigido'
}, { now: later });
assert.equal(editedPast.error, undefined);
assert.equal(editedPast.session.startedAt, parseFastingInstant('2026-10-24T09:00').toISOString());
assert.equal(editedPast.session.endedAt, parseFastingInstant('2026-10-24T15:30').toISOString());
assert.equal(editedPast.session.note, 'horário corrigido');

const movedOpen = updateFastingSession(db, backdated.session.id, {
  startedAt: '2026-10-24T19:00',
  endedAt: ''
}, { now: later });
assert.equal(movedOpen.error, undefined);
assert.equal(movedOpen.session.endedAt, null);
assert.equal(movedOpen.session.startedAt, parseFastingInstant('2026-10-24T19:00').toISOString());

console.log('fasting ok');
