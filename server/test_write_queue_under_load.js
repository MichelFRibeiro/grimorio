/**
 * Regressão do incidente de produção (deploy b4a97b1..81cd599):
 * "app extremamente lento, mutações travando e MCP estourando timeout".
 *
 * Duas causas, cobertas aqui:
 *
 *  1. TimeUtils criava um `new Intl.DateTimeFormat` por chamada. Um único
 *     GET /api/state fazia ~51.808 construções (mais de 5 s de CPU), travando o
 *     event loop e, com ele, TODAS as rotas (inclusive o MCP). Este teste
 *     garante o cache e que o caminho rápido de data civil é equivalente ao
 *     caminho com Intl.
 *
 *  2. A resposta mutante esperava a fila de escrita do Postgres ESVAZIAR. Com
 *     enqueues contínuos (heartbeat de timers, saves de outras rotas) a promessa
 *     nunca resolvia: a requisição ficava pendurada. Aqui um pool falso lento
 *     prova que cada requisição espera apenas a SUA escrita, que leituras não
 *     escrevem e que a fila se recupera de erro.
 *
 * Pool falso com latência — nunca toca Postgres nem o data/ do projeto.
 */
import './testEnv.js';
import assert from 'assert';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ok = (condition, message) => {
  if (!condition) throw new Error(`❌ ${message}`);
  console.log(`✅ ${message}`);
};

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ---------------------------------------------------------------------------
// 1. Fuso horário: cache de Intl + equivalência do caminho rápido
// ---------------------------------------------------------------------------
async function testTimezoneCacheAndEquivalence() {
  console.log('\n--- Fuso horário: sem Intl.DateTimeFormat por chamada ---');

  const serverTime = await import('./timeUtils.js');
  const sharedTime = await import('../src/utils/timeUtils.js');
  const { getSaoPauloDateStr, getSaoPauloDayOfWeek, getSaoPauloHour } = serverTime;

  // Referência independente: um formatador próprio, criado uma vez.
  const refDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const refWeekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
  const refHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' });
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // Dias civis: inclui transições de horário de verão brasileiro (2018) e bordas.
  let checked = 0;
  for (let t = Date.UTC(2018, 0, 1, 12); t <= Date.UTC(2027, 0, 1, 12); t += 86400000 / 3) {
    const moment = new Date(t);
    const iso = moment.toISOString().slice(0, 10);
    const expectedDate = refDate.format(moment);
    assert.equal(getSaoPauloDateStr(moment), expectedDate, `data civil de ${moment.toISOString()}`);
    assert.equal(getSaoPauloDayOfWeek(moment), weekdayMap[refWeekday.format(moment)], `dia da semana de ${moment.toISOString()}`);
    const expectedHour = Number(refHour.format(moment)) % 24;
    assert.equal(getSaoPauloHour(moment), expectedHour, `hora de ${moment.toISOString()}`);
    // Caminho rápido (string de data civil) precisa concordar com o caminho Intl.
    assert.equal(getSaoPauloDateStr(iso), expectedDate, `atalho de data '${iso}'`);
    assert.equal(getSaoPauloDayOfWeek(iso), weekdayMap[refWeekday.format(new Date(`${iso}T12:00:00Z`))], `atalho do dia da semana '${iso}'`);
    assert.equal(sharedTime.getSaoPauloDateStr(iso), expectedDate, `atalho no módulo compartilhado '${iso}'`);
    checked += 1;
  }
  ok(checked > 9000, `caminho rápido equivalente ao Intl em ${checked} instantes (2018–2027, com horário de verão)`);
  ok(getSaoPauloDateStr('2026-13-45') === refDate.format(new Date(Date.UTC(2026, 12, 45, 12))), 'data inválida continua passando pelo caminho normal');

  // Formatadores podem ser criados uma vez por formato/modulo (cache preguiçoso);
  // o que não pode é crescer com o número de chamadas.
  const Real = Intl.DateTimeFormat;
  let constructions = 0;
  Intl.DateTimeFormat = new Proxy(Real, {
    construct(target, args, newTarget) {
      constructions += 1;
      return Reflect.construct(target, args, newTarget);
    }
  });
  try {
    for (let i = 0; i < 20000; i += 1) {
      const moment = new Date(Date.UTC(2026, 9, 2, 12) + i * 1000);
      getSaoPauloDateStr(moment);
      getSaoPauloDayOfWeek(moment.toISOString().slice(0, 10));
      sharedTime.getSaoPauloDateStr(moment);
    }
  } finally {
    Intl.DateTimeFormat = Real;
  }
  const afterWarmup = constructions;
  ok(afterWarmup <= 4, `nenhum Intl.DateTimeFormat novo em 20.000 iterações (${afterWarmup} criação(ões) de cache)`);

  Intl.DateTimeFormat = new Proxy(Real, {
    construct(target, args, newTarget) {
      constructions += 1;
      return Reflect.construct(target, args, newTarget);
    }
  });
  try {
    for (let i = 0; i < 60000; i += 1) {
      const moment = new Date(Date.UTC(2027, 0, 1, 12) + i * 1000);
      getSaoPauloDateStr(moment);
      getSaoPauloDayOfWeek(moment.toISOString().slice(0, 10));
      sharedTime.getSaoPauloDateStr(moment);
    }
  } finally {
    Intl.DateTimeFormat = Real;
  }
  ok(constructions === afterWarmup, 'mais 60.000 chamadas não criam nenhum formatador novo (antes: 1 por chamada)');
}

// ---------------------------------------------------------------------------
// 2. Fila de escrita: sem starvation, sem travar depois de erro
// ---------------------------------------------------------------------------
async function testFlushDoesNotWaitForWholeQueue() {
  console.log('\n--- Fila: resposta espera só a SUA escrita, não a fila inteira ---');
  const { __setPoolForTests, saveDb, flushDb, getDb, getWriteState, defaultDatabase } = await import('./db.js');

  let queries = 0;
  const WRITE_LATENCY_MS = 200;
  __setPoolForTests({
    async query() {
      queries += 1;
      await new Promise((resolve) => setTimeout(resolve, WRITE_LATENCY_MS));
      return { rows: [] };
    }
  });

  const db = getDb();
  saveDb(db);
  // Outra rota (heartbeat de timers) grava sem parar enquanto a requisição espera.
  let stop = false;
  const heartbeat = (async () => {
    while (!stop) {
      db.userProfile.lastActiveDate = new Date().toISOString().slice(0, 10);
      saveDb(db);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  })();

  const started = Date.now();
  await flushDb();
  const elapsed = Date.now() - started;
  stop = true;
  await heartbeat;

  ok(elapsed < WRITE_LATENCY_MS * 3, `flushDb resolveu em ${elapsed} ms (limite ${WRITE_LATENCY_MS * 3} ms) mesmo com enqueues contínuos`);
  ok(queries <= 4, `coalescência: ${queries} escritas em ~${elapsed} ms de carga contínua (sem coalescer seriam dezenas)`);
  __setPoolForTests(null);
}

async function testQueueRecoversFromFailure() {
  console.log('\n--- Fila: uma falha passageira se cura sozinha ---');
  const { __setPoolForTests, saveDb, flushDb, getDb, getWriteState } = await import('./db.js');

  let calls = 0;
  __setPoolForTests({
    async query() {
      calls += 1;
      if (calls === 1) throw new Error('blip simulado do Postgres');
      return { rows: [] };
    }
  });

  const db = getDb();
  saveDb(db);
  const result = await flushDb({ timeoutMs: 8000 });
  ok(calls >= 2, `a fila tentou de novo sozinha após a falha (${calls} tentativas)`);
  ok(result.writtenSeq >= result.seq, 'a escrita foi confirmada depois da nova tentativa');
  const state = getWriteState();
  ok(state.failures === 0 && state.lastFailure === null, 'contador de falhas zerou: nada de erro "pegajoso"');
  __setPoolForTests(null);
}

async function testQueueFailsFastDuringOutage() {
  console.log('\n--- Fila: banco fora do ar dá erro claro em vez de pendurar ---');
  const { __setPoolForTests, saveDb, flushDb, getDb } = await import('./db.js');

  __setPoolForTests({ async query() { throw new Error('conexão recusada'); } });

  const db = getDb();
  const started = Date.now();
  saveDb(db);
  await assert.rejects(
    () => flushDb({ timeoutMs: 20000 }),
    (err) => err.code === 'EWRITEFAILED' && err.message.includes('conexão recusada'),
    'flushDb rejeita com erro de escrita (não fica pendurado até o cliente desistir)'
  );
  const elapsed = Date.now() - started;
  ok(elapsed < 6000, `erro devolvido em ${elapsed} ms, depois das tentativas rápidas`);

  // O banco volta: a fila retoma e as respostas seguintes voltam a ser felizes.
  let healthy = false;
  __setPoolForTests({ async query() { if (!healthy) throw new Error('ainda fora'); return { rows: [] }; } });
  healthy = true;
  db.userProfile.coins = 3;
  saveDb(db);
  const recovered = await flushDb({ timeoutMs: 8000 });
  ok(recovered.writtenSeq >= recovered.seq, 'com o banco de volta, a próxima escrita é confirmada');
  __setPoolForTests(null);
}

async function testFlushDoesNotRejectAfterRecovery() {
  console.log('\n--- Fila: erro antigo não contamina a próxima resposta ---');
  const { __setPoolForTests, saveDb, flushDb, getDb } = await import('./db.js');

  let failCount = 0;
  __setPoolForTests({
    async query() {
      if (failCount < 3) { failCount += 1; throw new Error('queda momentânea'); }
      return { rows: [] };
    }
  });

  const doc = getDb();
  saveDb(doc);
  await flushDb({ timeoutMs: 5000 }).catch(() => {});

  // A partir daqui o banco responde: a fila precisa voltar ao normal.
  doc.userProfile.coins = 11;
  saveDb(doc);
  const result = await flushDb({ timeoutMs: 8000 });
  ok(result.writtenSeq >= result.seq, 'depois do erro, uma escrita boa libera as respostas seguintes');
  __setPoolForTests(null);
}

async function testFlushTimesOutInsteadOfHanging() {
  console.log('\n--- Fila: escrita travada tem prazo (nada de spinner infinito) ---');
  const { __setPoolForTests, saveDb, flushDb, getDb } = await import('./db.js');
  __setPoolForTests({ query: () => new Promise(() => {}) }); // nunca resolve
  const db = getDb();
  saveDb(db);
  const started = Date.now();
  await assert.rejects(
    () => flushDb({ timeoutMs: 600 }),
    (err) => err.code === 'ETIMEDOUT',
    'flushDb estoura o prazo em vez de esperar para sempre'
  );
  const elapsed = Date.now() - started;
  ok(elapsed < 2000, `prazo respeitado: rejeitou em ${elapsed} ms`);
  __setPoolForTests(null);
}

// ---------------------------------------------------------------------------
// 3. HTTP de verdade: leituras não escrevem, mutações respondem sob carga
// ---------------------------------------------------------------------------
function bigFixture() {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  return {    userProfile: {
      id: 'hero-1', name: 'Mestre do Foco', level: 16, xp: 4380, xpToNextLevel: 9000, coins: 2232,
      title: 'Mestre do Conhecimento', stats: { wisdom: 250, focus: 1398, willpower: 75, consistency: 500 },
      streak: 4, lastActiveDate: '2026-10-01', streakShields: 1, streakShieldsEarned: 1,
      maxStreakShields: 4, streakRestDays: [], streakShieldLog: []
    },
    users: [], questCategories: [], bossRaid: null, quests: [], books: [], readingSessions: [],
    examQuestions: [], processes: [], processSteps: [],
    habits: Array.from({ length: 12 }, (_, i) => ({
      id: `h-${i}`, title: `Ritual ${i}`, category: 'Pessoal', frequency: 'daily', history: [], streak: 0
    })),
    rewards: [], rewardRedemptions: [],
    actionLogs: Array.from({ length: 5000 }, (_, i) => ({
      id: `log-${i}`, type: 'habit_complete', entityId: `h-${i % 12}`, title: 'Ritual', xp: 10, coins: 2,
      wisdom: 0, focus: 0, willpower: 0, consistency: 1,
      applied: { xp: 10, coins: 2, wisdom: 0, focus: 0, willpower: 0, consistency: 1, bossDamage: 0, levelUps: [] },
      details: {}, timestamp: '2026-09-30T12:00:00.000Z', hour: 9, dayOfWeek: 3,
      date: '2026-09-30'
    })),
    liveActivityTimers: {},
    mindMaps: Array.from({ length: 4 }, (_, i) => ({
      id: `map-${i}`, title: `Mapa ${i}`, category: 'Estudos', nodes: Array.from({ length: 40 }, (_, n) => ({
        id: `n-${n}`, label: `Ramo ${n}`, imageUrl: `data:image/png;base64,${b64.repeat(60)}`
      }))
    })),
    ninetyDayGoals: [], dailyVictories: [], dailyVictoryBonuses: {},
    mindMapSessions: [], mindMapCategories: [], mindMapImages: [],
    oracleEnergyReadings: [], oracleDecisions: [], oracleQuantityReads: [],
    dailyReviews: [], weeklyPlans: [], penalties: [], bossHistory: [], destinyChests: [],
    maintenance: { penaltiesSince: '2026-10-01', penaltyKeys: {}, lastDailyRun: null, lastWeeklyRun: null }
  };
}

/** Plano AGU real (com ciclos arquivados), como no documento de produção. */
async function withAguPlan(doc) {
  const { startAguPlan, advanceAguCycle } = await import('../src/utils/aguCycle.js');
  const { createDefaultAguPlan } = await import('../src/data/aguCurriculum.js');
  const today = '2026-10-01';
  let plan = startAguPlan(createDefaultAguPlan(today), today, []);
  for (let i = 0; i < 3; i += 1) plan = advanceAguCycle(plan, today, []);
  doc.aguPlan = plan;
  return doc;
}

async function testHttpUnderLoad() {
  console.log('\n--- HTTP real com pool lento: leituras não gravam, mutações respondem ---');

  const doc = await withAguPlan(bigFixture());
  const docSizeMb = (JSON.stringify(doc).length / 1048576).toFixed(2);

  let writes = 0;
  let reads = 0;
  const LATENCY_MS = 150;
  const { __setPoolForTests } = await import('./db.js');
  __setPoolForTests({
    async query(sql) {
      if (/INSERT INTO grimorio_store/i.test(String(sql))) writes += 1;
      if (/SELECT data FROM grimorio_store/i.test(String(sql))) {
        reads += 1;
        return { rows: [{ data: doc }] };
      }
      await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
      return { rows: [] };
    }
  });

  const { createApp } = await import('./index.js');
  const { initDb } = await import('./db.js');
  await initDb();
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const request = (route, { method = 'GET', body, token, timeoutMs = 10000 } = {}) => new Promise((resolve) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1', port, path: route, method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch { /* não-JSON */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout do cliente')); });
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });

  try {
    const login = await request('/api/auth/login', { method: 'POST', body: { email: 'teste@grimorio.app', name: 'Teste' } });
    assert.equal(login.status, 200, `login respondeu ${login.status}`);
    const token = login.json.token;
    ok(Boolean(token), `documento de teste com ${docSizeMb} MB carregado via pool falso`);

    // A PRIMEIRA leitura pode gravar: é a manutenção do deploy (migração,
    // normalização do chefe, punição pendente). O que não pode é gravar sempre.
    const firstRead = await request('/api/state', { token });
    assert.equal(firstRead.status, 200, `/api/state respondeu ${firstRead.status}`);

    writes = 0;
    const stateTimes = [];
    for (let i = 0; i < 3; i += 1) {
      const started = Date.now();
      const res = await request('/api/state', { token });
      stateTimes.push(Date.now() - started);
      assert.equal(res.status, 200, `/api/state respondeu ${res.status}`);
    }
    ok(writes === 0, `3 leituras de /api/state com o documento já estável não geraram escrita (${writes})`);
    const slowestState = Math.max(...stateTimes);
    ok(slowestState < 2000, `GET /api/state com documento de ${docSizeMb} MB: pior caso ${slowestState} ms`);

    const todayStarted = Date.now();
    await request('/api/today', { token });
    ok(Date.now() - todayStarted < 1500, `GET /api/today respondeu em ${Date.now() - todayStarted} ms`);

    // Mutação isolada: uma escrita e resposta dentro de poucas latências.
    writes = 0;
    const toggleStarted = Date.now();
    const toggle = await request('/api/habits/h-0/toggle', { method: 'POST', body: {}, token });
    const toggleMs = Date.now() - toggleStarted;
    assert.equal(toggle.status, 200, `toggle respondeu ${toggle.status}: ${JSON.stringify(toggle.json)?.slice(0, 200)}`);
    ok(toggleMs < LATENCY_MS * 4, `toggle de hábito respondeu em ${toggleMs} ms (4x a latência do banco = ${LATENCY_MS * 4} ms)`);
    ok(writes === 1, `toggle gerou exatamente 1 escrita (rewardPlayer + rota coalescidos): ${writes}`);

    // "Aceitar Plano" — o caso que girava para sempre.
    const planStarted = Date.now();
    const plan = await request('/api/today/plan', { method: 'POST', body: { items: [{ title: 'Bloco de estudo', category: 'Estudos' }] }, token });
    const planMs = Date.now() - planStarted;
    assert.equal(plan.status, 200, `aceitar plano respondeu ${plan.status}: ${JSON.stringify(plan.json)?.slice(0, 200)}`);
    ok(planMs < LATENCY_MS * 4, `"Aceitar Plano" respondeu em ${planMs} ms`);
    ok(Array.isArray(plan.json?.today?.dailyVictories?.items), 'o plano aceito criou vitórias no dia');

    // Carga concorrente igual à do navegador: estado + hoje + heartbeat + mutação.
    const mutations = [];
    for (let i = 0; i < 3; i += 1) {
      const heartbeats = Array.from({ length: 8 }, (_, k) => new Promise((resolve) => {
        setTimeout(() => {
          request('/api/live-timers', {
            method: 'PUT',
            body: { items: { [`focus-${k}`]: { startAt: Date.now(), runStartedAt: Date.now() + k } } },
            token
          }).then(resolve);
        }, k * 30);
      }));
      const readsInFlight = [request('/api/state', { token }), request('/api/today', { token })];
      const started = Date.now();
      mutations.push(request(`/api/habits/h-${i + 1}/toggle`, { method: 'POST', body: {}, token }).then((res) => ({ res, ms: Date.now() - started })));
      await Promise.all([...heartbeats, ...readsInFlight]);
    }
    const settled = await Promise.all(mutations);
    const worst = Math.max(...settled.map((item) => item.ms));
    ok(settled.every((item) => item.res.status === 200), 'mutações concorrentes com heartbeat/timers responderam 200 (antes: travavam até o timeout)');
    ok(worst < 3000, `pior mutação concorrente: ${worst} ms (antes: nunca respondia / timeout de 15 s)`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    __setPoolForTests(null);
  }
}

async function testPersistenceFlushIsBounded() {
  console.log('\n--- Middleware: resposta mutante tem prazo máximo ---');
  const { persistenceFlushMiddleware } = await import('./httpGuards.js');
  const { __setPoolForTests } = await import('./db.js');

  __setPoolForTests({ query: () => new Promise(() => {}) }); // banco pendurado
  const { saveDb, getDb } = await import('./db.js');
  saveDb(getDb());

  const logs = [];
  const realWarn = console.warn;
  console.warn = (...args) => { logs.push(args.join(' ')); };

  const res = {
    headersSent: false,
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  const req = { method: 'POST', path: '/api/habits/h-1/toggle' };
  try {
    persistenceFlushMiddleware(req, res, () => {});
    const started = Date.now();
    await res.json({ success: true });
    const elapsed = Date.now() - started;
    ok(res.statusCode === 200 && res.body.success === true, 'a resposta sai mesmo com o banco pendurado (sem spinner infinito)');
    ok(elapsed < 9000, `resposta liberada em ${elapsed} ms (prazo de 8 s)`);
    ok(logs.some((line) => line.includes('Persistência não confirmou')), 'o atraso é registrado no log para diagnóstico no Render');
  } finally {
    console.warn = realWarn;
    __setPoolForTests(null);
  }
}

function testDocSizeReport() {
  console.log('\n--- Tamanho do documento (contexto do incidente) ---');
  const doc = bigFixture();
  const bytes = JSON.stringify(doc).length;
  const aguPlan = doc.aguPlan ? JSON.stringify(doc.aguPlan).length : 0;
  console.log(`  · fixture: ${(bytes / 1048576).toFixed(2)} MB (aguPlan ${(aguPlan / 1048576).toFixed(2)} MB, mindMaps ${(JSON.stringify(doc.mindMaps).length / 1048576).toFixed(2)} MB)`);
  ok(bytes > 1024 * 1024, 'fixture do teste representa um documento de produção (mais de 1 MB)');
}

async function main() {
  console.log('🧪 Incidente de produção: fila de escrita, latência e fuso horário\n');
  await testTimezoneCacheAndEquivalence();
  await testFlushDoesNotWaitForWholeQueue();
  await testQueueRecoversFromFailure();
  await testQueueFailsFastDuringOutage();
  await testFlushDoesNotRejectAfterRecovery();
  await testFlushTimesOutInsteadOfHanging();
  testDocSizeReport();
  await testHttpUnderLoad();
  await testPersistenceFlushIsBounded();
  console.log('\n🎉 Regressão do incidente validada: nada trava, nada pendura.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Falhou:', err.message);
  console.error(err.stack?.split('\n').slice(1, 6).join('\n'));
  process.exit(1);
});
