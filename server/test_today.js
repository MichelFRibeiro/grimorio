/**
 * Painel Hoje, ritual de planejamento, fechamento do dia e revisão semanal.
 * Isolado: testEnv antes de qualquer módulo do servidor. Sem Postgres e sem
 * gravar em data/.
 */
import './testEnv.js';
import assert from 'node:assert/strict';
import http from 'node:http';
import { defaultDatabase, getDb, saveDb } from './db.js';
import { computeNextAction, PLAN_DAY_ID } from './nextAction.js';
import {
  buildTodayPayload,
  buildWeeklyReview,
  closeDay,
  deleteDailyReview,
  saveWeeklyPlan,
  toggleWeeklyFocus,
  DAILY_REVIEW_REWARDS,
  WEEKLY_FOCUS_REWARDS
} from './domain/today.js';
import { createApp } from './index.js';
import { toolsDefinition } from './mcpTools.js';
import { addDaysToDateStr, getSaoPauloDateStr } from './timeUtils.js';

let failed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        () => console.log(`✅ ${name}`),
        (err) => {
          failed += 1;
          console.error(`❌ ${name}\n   ${err.stack || err.message}`);
        }
      );
    }
    console.log(`✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`❌ ${name}\n   ${err.stack || err.message}`);
  }
  return Promise.resolve();
}

function freshDb() {
  const db = defaultDatabase();
  db.bossRaid.maxHp = 100000;
  db.bossRaid.currentHp = 100000;
  db.bossRaid.rewardXp = 0;
  db.bossRaid.rewardCoins = 0;
  saveDb(db);
  return getDb();
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(port, path, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function guestToken(port) {
  const res = await request(port, '/api/auth/guest', { method: 'POST', body: {} });
  assert.equal(res.status, 200, 'login de convidado');
  return res.data.token;
}

await check('GET /api/today devolve o formato consolidado', async () => {
  const db = freshDb();
  const today = getSaoPauloDateStr();
  db.userProfile.name = 'Herói';
  db.userProfile.streak = 4;
  db.quests.push({
    id: 'q-hoje',
    title: 'Peça de hoje',
    category: 'Pessoal',
    priority: 'importante',
    difficulty: 'media',
    dueDate: today,
    completed: false,
    createdAt: new Date().toISOString()
  });
  db.habits.push({
    id: 'h-hoje',
    title: 'Água',
    category: 'Pessoal',
    frequency: 'daily',
    priority: 'critico',
    history: [],
    timeWindow: { start: '08:00', end: '10:00' }
  });
  saveDb(db);

  const app = createApp();
  const server = await listen(app);
  try {
    const port = server.address().port;
    const token = await guestToken(port);
    const res = await request(port, '/api/today', { token });
    assert.equal(res.status, 200);
    const payload = res.data.today;
    for (const key of ['date', 'greeting', 'phase', 'dailyVictories', 'habitsDue', 'quests', 'agu', 'mindMaps', 'stalledBooks', 'rankingsAtRisk', 'boss', 'streak']) {
      assert.ok(key in payload, `falta ${key}`);
    }
    assert.equal(payload.date, today);
    assert.match(payload.greeting, /Herói/);
    assert.equal(payload.streak, 4);
    assert.equal(payload.habitsDueCount, 1);
    assert.equal(payload.habitsDue[0].title, 'Água');
    assert.equal(payload.quests.some((item) => item.id === 'q-hoje' && item.dueToday), true);
    assert.equal(typeof payload.boss.name, 'string');
    assert.equal(payload.nextAction == null || typeof payload.nextAction === 'object', true);
  } finally {
    server.close();
  }
});

await check('plan_day é a indicação antes do meio-dia sem vitórias', () => {
  const db = freshDb();
  const morning = new Date('2026-08-28T12:00:00Z'); // 09:00 BRT
  db.quests.push({
    id: 'q-manha',
    title: 'Qualquer missão',
    category: 'Pessoal',
    priority: 'critico',
    dueDate: '2026-08-28',
    completed: false,
    location: 'anywhere'
  });
  const result = computeNextAction(db, { now: morning, location: 'anywhere', includePlanDay: true });
  assert.equal(result.primary?.kind, 'plan_day');
  assert.equal(result.primary?.id, PLAN_DAY_ID);

  db.dailyVictories.push({
    id: 'dv-1',
    date: '2026-08-28',
    title: 'Já planejei',
    category: 'Pessoal',
    completed: false,
    createdAt: morning.toISOString()
  });
  const planned = computeNextAction(db, { now: morning, location: 'anywhere', includePlanDay: true });
  assert.notEqual(planned.primary?.kind, 'plan_day');

  const afternoon = new Date('2026-08-28T16:00:00Z'); // 13:00 BRT
  const later = computeNextAction({ ...db, dailyVictories: [] }, { now: afternoon, location: 'anywhere', includePlanDay: true });
  assert.notEqual(later.primary?.kind, 'plan_day');
});

await check('fechar o dia concede a recompensa uma vez e estorna ao excluir', () => {
  const db = freshDb();
  const before = db.userProfile.xp;
  const consistency = db.userProfile.stats.consistency;
  const first = closeDay(db, { note: 'Dia curto', mood: 4 });
  assert.equal(first.error, undefined);
  assert.equal(first.review.note, 'Dia curto');
  assert.equal(first.review.mood, 4);
  assert.equal(db.userProfile.xp, before + DAILY_REVIEW_REWARDS.xp);
  assert.equal(db.userProfile.stats.consistency, consistency + DAILY_REVIEW_REWARDS.consistency);
  assert.equal(db.actionLogs.filter((log) => log.type === 'daily_review').length, 1);

  const second = closeDay(db, { note: 'De novo' });
  assert.equal(second.status, 409);
  assert.equal(db.actionLogs.filter((log) => log.type === 'daily_review').length, 1);

  const removed = deleteDailyReview(db, first.review.id);
  assert.equal(removed.error, undefined);
  assert.equal(db.dailyReviews.length, 0);
  assert.equal(db.userProfile.xp, before);
  assert.equal(db.userProfile.stats.consistency, consistency);
  assert.equal(db.actionLogs.some((log) => log.type === 'daily_review'), false);
});

await check('revisão semanal agrega a semana e o foco premia uma vez', () => {
  const db = freshDb();
  const now = new Date('2026-08-31T15:00:00Z'); // segunda 12:00 BRT; semana anterior começa 23/08
  const lastSunday = '2026-08-23';
  const lastSaturday = '2026-08-29';
  db.questCategories = [{ id: 'cat-p', name: 'Pessoal', color: '#10b981', icon: 'User' }];
  db.dailyVictories = [
    { id: 'dv-a', date: lastSunday, title: 'A', category: 'Pessoal', completed: true, completedAt: `${lastSunday}T15:00:00Z` },
    { id: 'dv-b', date: lastSaturday, title: 'B', category: 'Pessoal', completed: false }
  ];
  db.quests = [
    { id: 'q-1', title: 'Feita', category: 'Pessoal', completed: true, completedAt: `${lastSaturday}T18:00:00Z`, createdAt: `${lastSunday}T12:00:00Z`, xpReward: 40 },
    { id: 'q-2', title: 'Atrasada', category: 'Pessoal', completed: false, dueDate: '2026-08-20', createdAt: '2026-08-01T12:00:00Z' }
  ];
  db.habits = [{
    id: 'h-1',
    title: 'Leitura',
    frequency: 'weekly',
    history: [lastSunday],
    category: 'Pessoal'
  }];
  db.readingSessions = [{ id: 'rs-1', bookId: 'b-1', date: lastSunday, durationMinutes: 25 }];
  db.actionLogs = [{
    id: 'log-xp',
    type: 'quest_complete',
    entityId: 'q-1',
    xp: 40,
    timestamp: `${lastSaturday}T18:00:00.000Z`,
    date: lastSaturday,
    details: { category: 'Pessoal' }
  }];

  const review = buildWeeklyReview(db, { weekKey: lastSunday, now });
  assert.equal(review.weekKey, lastSunday);
  assert.equal(review.end, lastSaturday);
  assert.equal(review.victories.planned, 2);
  assert.equal(review.victories.completed, 1);
  assert.equal(review.victories.rate, 50);
  assert.equal(review.quests.completed, 1);
  assert.equal(review.quests.created, 1);
  assert.ok(review.quests.overdue >= 1);
  assert.equal(review.habits.met, 1);
  assert.equal(review.study.minutes, 25);
  assert.equal(review.categories.some((item) => item.name === 'Pessoal' && item.xp === 40), true);

  const empty = buildWeeklyReview(db, { weekKey: '2026-08-02', now });
  assert.equal(empty.victories.planned, 0);
  assert.equal(empty.study.minutes, 0);

  const saved = saveWeeklyPlan(db, {
    weekKey: '2026-08-30',
    focuses: [{ title: 'Peças da AGU', category: 'Estudos' }, { title: 'Treino' }]
  });
  assert.equal(saved.plan.focuses.length, 2);
  const focus = saved.plan.focuses[0];
  const xp = getDb().userProfile.xp;
  const first = toggleWeeklyFocus(getDb(), { weekKey: '2026-08-30', focusId: focus.id, done: true });
  assert.equal(first.stateUnchanged, false);
  assert.equal(getDb().userProfile.xp, xp + WEEKLY_FOCUS_REWARDS.xp);
  assert.equal(db.actionLogs.filter((log) => log.type === 'weekly_focus' && log.entityId === focus.id).length, 1);

  const again = toggleWeeklyFocus(getDb(), { weekKey: '2026-08-30', focusId: focus.id, done: true });
  assert.equal(again.stateUnchanged, true);
  assert.equal(getDb().userProfile.xp, xp + WEEKLY_FOCUS_REWARDS.xp);

  const undone = toggleWeeklyFocus(getDb(), { weekKey: '2026-08-30', focusId: focus.id, done: false });
  assert.equal(undone.focus.done, false);
  assert.equal(getDb().userProfile.xp, xp);
  assert.equal(getDb().actionLogs.some((log) => log.entityId === focus.id), false);
});

await check('MCP expõe get_today, close_day, list_daily_reviews, get_weekly_review e set_weekly_plan', () => {
  for (const name of ['get_today', 'close_day', 'list_daily_reviews', 'get_weekly_review', 'set_weekly_plan']) {
    assert.ok(toolsDefinition.some((tool) => tool.name === name), name);
  }
});

await check('payload de hoje marca o ritual da manhã quando não há vitórias', () => {
  const db = freshDb();
  const morning = new Date('2026-08-28T11:30:00Z'); // 08:30 BRT
  const payload = buildTodayPayload(db, { now: morning, location: 'home' });
  assert.equal(payload.date, '2026-08-28');
  assert.equal(payload.phase, 'manha');
  assert.equal(payload.planning.morningOpen, true);
  assert.equal(payload.tomorrow, addDaysToDateStr('2026-08-28', 1));
});

if (failed) {
  console.error(`\n${failed} teste(s) de Hoje falharam.`);
  process.exit(1);
}
console.log('\n🎉 Painel Hoje, fechamento e semana passaram.');
