/**
 * Configurações: o interruptor esconde a função sem apagar dado nenhum.
 * Isolado: testEnv antes de qualquer módulo do servidor.
 */
import './testEnv.js';
import assert from 'node:assert/strict';
import http from 'node:http';
import { defaultDatabase, getDb, saveDb } from './db.js';
import { computeNextAction } from './nextAction.js';
import { buildTodayPayload, suggestDayPlan } from './domain/today.js';
import { computeAnalytics } from './analytics.js';
import { buildCorrelationFrame } from './correlations.js';
import { createApp } from './index.js';
import { FEATURE_IDS, sanitizeFeatureSettings } from '../src/utils/featureSettings.js';

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

await check('banco antigo chega com tudo ligado e lixo é descartado', () => {
  const clean = sanitizeFeatureSettings(undefined);
  assert.equal(FEATURE_IDS.every((id) => clean[id] === true), true);
  const mixed = sanitizeFeatureSettings({ quests: false, inventado: false, books: 'não' });
  assert.equal(mixed.quests, false);
  assert.equal(mixed.books, true);
  assert.equal('inventado' in mixed, false);

  const legacy = defaultDatabase();
  delete legacy.userProfile.featureSettings;
  const saved = saveDb(legacy);
  const loaded = getDb();
  assert.equal(loaded === saved || loaded.userProfile.featureSettings.quests, true);
  assert.equal(getDb().userProfile.featureSettings.maps, true);
});

await check('desligar missões tira a indicação e o painel, sem apagar a missão', () => {
  const db = freshDb();
  const today = '2026-08-28';
  const morning = new Date('2026-08-28T15:00:00Z');
  db.quests.push({
    id: 'q-1',
    title: 'Peça urgente',
    category: 'Pessoal',
    priority: 'critico',
    dueDate: today,
    completed: false,
    location: 'anywhere'
  });
  db.dailyVictories.push({
    id: 'dv-1',
    date: today,
    title: 'Já planejei',
    category: 'Pessoal',
    completed: false
  });
  saveDb(db);

  const before = computeNextAction(getDb(), { now: morning, location: 'anywhere', includePlanDay: true });
  assert.equal(before.primary?.kind, 'victory');

  getDb().userProfile.featureSettings = { victories: false };
  const withoutVictory = computeNextAction(getDb(), { now: morning, location: 'anywhere', includePlanDay: true });
  assert.equal(withoutVictory.primary?.kind, 'quest');
  assert.equal(getDb().dailyVictories.length, 1, 'a vitória continua gravada');

  getDb().userProfile.featureSettings = { victories: false, quests: false };
  const none = computeNextAction(getDb(), { now: morning, location: 'anywhere', includePlanDay: true });
  assert.equal(none.primary, null);

  const todayPayload = buildTodayPayload(getDb(), { now: morning });
  assert.deepEqual(todayPayload.quests, []);
  assert.equal(todayPayload.dailyVictories.planned, 0);
  assert.equal(todayPayload.planning.suggestions.length, 0);
  assert.equal(suggestDayPlan(getDb(), { now: morning, todayStr: today }).length, 0);
  assert.equal(getDb().quests.length, 1, 'a missão continua gravada');
  assert.equal(getDb().quests[0].title, 'Peça urgente');
});

await check('insights e correlações ignoram a função desligada', () => {
  const db = freshDb();
  db.books.push({ id: 'b-1', title: 'Livro parado', status: 'reading', createdAt: '2026-01-01T00:00:00.000Z' });
  db.processes.push({ id: 'p-1', title: 'Lote', status: 'in_progress', totalUnits: 4, completedUnits: 1 });
  saveDb(db);

  const full = computeAnalytics();
  assert.equal(full.insights.some((item) => item.type === 'stalled_book'), true);
  assert.equal(full.insights.some((item) => item.type === 'process_momentum'), true);

  getDb().userProfile.featureSettings = { books: false };
  const hidden = computeAnalytics();
  assert.equal(hidden.insights.some((item) => item.type === 'stalled_book'), false);
  assert.equal(hidden.insights.some((item) => item.type === 'process_momentum'), true);
  assert.equal(hidden.bookProjections.length >= 0, true, 'o relatório numérico continua disponível');

  getDb().readingSessions = [
    { id: 'rs-1', bookId: 'b-1', date: '2026-08-20', durationMinutes: 20 },
    { id: 'rs-2', bookId: 'b-1', date: '2026-08-21', durationMinutes: 25 },
    { id: 'rs-3', bookId: 'b-1', date: '2026-08-22', durationMinutes: 15 },
    { id: 'rs-4', bookId: 'b-1', date: '2026-08-23', durationMinutes: 30 }
  ];
  const frame = buildCorrelationFrame(getDb(), { todayStr: '2026-08-28' });
  assert.equal(frame.catalog.some((item) => item.kind === 'reading'), false);
});

await check('POST /api/profile grava só o interruptor e recusa lixo', async () => {
  freshDb();
  const app = createApp();
  const server = await listen(app);
  try {
    const port = server.address().port;
    const login = await request(port, '/api/auth/guest', { method: 'POST', body: {} });
    const token = login.data.token;
    const coins = getDb().userProfile.coins;

    const bad = await request(port, '/api/profile', {
      method: 'POST',
      token,
      body: { featureSettings: ['quests'] }
    });
    assert.equal(bad.status, 400);

    const off = await request(port, '/api/profile', {
      method: 'POST',
      token,
      body: { featureSettings: { maps: false, fantasma: false } }
    });
    assert.equal(off.status, 200);
    assert.equal(off.data.userProfile.featureSettings.maps, false);
    assert.equal(off.data.userProfile.featureSettings.quests, true);
    assert.equal('fantasma' in off.data.userProfile.featureSettings, false);
    assert.equal(getDb().userProfile.coins, coins, 'moedas intocadas');

    const back = await request(port, '/api/profile', {
      method: 'POST',
      token,
      body: { featureSettings: { maps: true } }
    });
    assert.equal(back.data.userProfile.featureSettings.maps, true);
  } finally {
    server.close();
  }
});

if (failed > 0) {
  console.error(`\n${failed} teste(s) de configurações falharam.`);
  process.exitCode = 1;
} else {
  console.log('\n🎉 Configurações: esconder não apaga.');
}
