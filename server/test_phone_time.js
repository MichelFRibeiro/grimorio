import './testEnv.js';
import assert from 'node:assert/strict';
import { initDb, getDb, saveDb } from './db.js';
import { upsertPhoneTimeLog, deletePhoneTimeLog } from './domain/phoneTime.js';
import {
  buildPhoneTimeSeries,
  buildProductivityByDate,
  needsYesterdayPhonePrompt,
  parsePhoneTimeMinutes,
  yesterdayDateStr
} from '../src/utils/phoneTime.js';

await initDb();
const db = getDb();
const today = '2026-10-07';
const yesterday = yesterdayDateStr(today);

assert.equal(parsePhoneTimeMinutes('2h 15'), 135);
assert.equal(parsePhoneTimeMinutes('1:30'), 90);
assert.equal(parsePhoneTimeMinutes('90'), 90);
assert.equal(parsePhoneTimeMinutes(''), null);
assert.equal(parsePhoneTimeMinutes('2h 75'), 195);

db.phoneTimeLogs = [];
db.quests = [];
db.habits = [];
db.readingSessions = [];
db.scriptureSessions = [];
db.examQuestions = [];
db.mindMapSessions = [];
db.mindMaps = [];
db.aguPlan = { completedBlocks: {}, blockDurations: {}, currentCycle: { days: [] } };
saveDb(db);

assert.equal(needsYesterdayPhonePrompt(db.phoneTimeLogs, today), true);

const future = upsertPhoneTimeLog(db, { date: '2026-10-08', minutes: 10 }, { todayStr: today });
assert.equal(future.status, 400);

const bad = upsertPhoneTimeLog(db, { date: yesterday, minutes: 'ontem' }, { todayStr: today });
assert.match(bad.error, /tempo/i);

const created = upsertPhoneTimeLog(db, { date: yesterday, minutes: '3h 20', note: '  rolando feed  ' }, { todayStr: today });
assert.equal(created.error, undefined);
assert.equal(created.created, true);
assert.equal(created.log.minutes, 200);
assert.equal(created.log.note, 'rolando feed');
assert.equal(needsYesterdayPhonePrompt(db.phoneTimeLogs, today), false);

const corrected = upsertPhoneTimeLog(db, { date: yesterday, minutes: 150, note: '' }, { todayStr: today });
assert.equal(corrected.created, false);
assert.equal(corrected.log.id, created.log.id);
assert.equal(corrected.log.minutes, 150);
assert.equal(db.phoneTimeLogs.filter((entry) => entry.date === yesterday).length, 1);

db.quests.push({
  id: 'q1',
  completed: true,
  completedAt: `${yesterday}T15:00:00-03:00`,
  durationMinutes: 40
});
db.habits.push({
  id: 'h1',
  history: [yesterday],
  durationsByDate: { [yesterday]: 25 }
});
db.readingSessions.push({ id: 'r1', date: yesterday, durationMinutes: 30 });
db.scriptureSessions.push({ id: 's1', date: yesterday, durationMinutes: 20 });
const aguKey = `${yesterday}|constitucional|questoes|df`;
db.aguPlan = {
  completedBlocks: { [aguKey]: true },
  blockDurations: { [aguKey]: 50 },
  currentCycle: {
    days: [{
      dateStr: yesterday,
      blocks: [{
        key: aguKey,
        dateStr: yesterday,
        subjectId: 'constitucional',
        topicId: 'df',
        kind: 'questoes',
        topicName: 'Direitos'
      }]
    }]
  }
};
db.examQuestions.push({
  id: 'eq-agu',
  blockKey: aguKey,
  subjectId: 'constitucional',
  topicId: 'df',
  subject: 'Direito Constitucional',
  date: yesterday,
  totalQuestions: 20,
  correctAnswers: 15,
  durationMinutes: 50
});
db.examQuestions.push({
  id: 'eq-loose',
  subject: 'Raciocínio Lógico',
  date: yesterday,
  totalQuestions: 10,
  correctAnswers: 8,
  durationMinutes: 15
});

const productivity = buildProductivityByDate(db);
assert.equal(productivity[yesterday].count, 6, 'missão + ritual + biblioteca + escritura + bloco AGU + questão avulsa');
assert.equal(
  productivity[yesterday].minutes,
  40 + 25 + 30 + 20 + 50 + 15,
  'o bloco AGU não pode contar o tempo duas vezes'
);

const series = buildPhoneTimeSeries(db, today, 7);
const point = series.points.find((item) => item.dateStr === yesterday);
assert.equal(point.phoneMinutes, 150);
assert.equal(point.activityCount, 6);
assert.equal(point.productiveMinutes, 180);
assert.equal(series.points.at(-1).isToday, true);
assert.equal(series.points.at(-1).phoneMinutes, null);

const removed = deletePhoneTimeLog(db, created.log.id);
assert.equal(removed.error, undefined);
assert.equal(needsYesterdayPhonePrompt(db.phoneTimeLogs, today), true);

console.log('phone time ok');
