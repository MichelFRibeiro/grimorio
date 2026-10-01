/**
 * Ledger de recompensas (A4) e paridade HTTP/MCP (A5).
 * Isolado: import de testEnv antes de qualquer módulo do servidor.
 * Não sobe servidor em 3000/3090 e não lê DATABASE_URL.
 */
import './testEnv.js';
import assert from 'node:assert/strict';
import http from 'http';
import {
  defaultDatabase,
  getDb,
  rewardPlayer,
  revertLog,
  getXpForLevel,
  saveDb,
  sanitizeDb
} from './db.js';
import { toolsDefinition } from './mcpTools.js';
import {
  createProcess,
  stepProcess,
  logExamQuestions,
  addQuote,
  completeQuest,
  deleteQuest,
  toggleHabit,
  logReadingSession,
  deleteReadingSession
} from './domain/activities.js';
import { startTestServer } from './testEnv.js';

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

function tool(name) {
  const found = toolsDefinition.find(t => t.name === name);
  if (!found) throw new Error(`ferramenta MCP ausente: ${name}`);
  return found;
}

function finiteProfile(db) {
  const p = db.userProfile;
  for (const key of ['xp', 'coins', 'level']) {
    assert.equal(Number.isFinite(p[key]), true, `${key} não é finito`);
  }
  for (const key of ['wisdom', 'focus', 'willpower', 'consistency']) {
    assert.equal(Number.isFinite(p.stats[key]), true, `${key} não é finito`);
    assert.ok(p.stats[key] >= 0, `${key} abaixo de 0`);
  }
}

console.log('\n📒 Ledger de recompensas\n');

const tests = [];

tests.push(check('subida e descida de nível devolvem exatamente as moedas do bônus', () => {
  const db = freshDb();
  const before = {
    level: db.userProfile.level,
    xp: db.userProfile.xp,
    coins: db.userProfile.coins,
    wisdom: db.userProfile.stats.wisdom
  };
  const granted = rewardPlayer({
    xp: getXpForLevel(1) + 10,
    coins: 7,
    wisdom: 3,
    actionType: 'test_level',
    entityId: 'lvl-1',
    title: 'Level test'
  });
  const live = getDb();
  assert.equal(live.userProfile.level, 2);
  assert.equal(granted.levelUps.length, 1);
  assert.equal(granted.levelUps[0].level, 2);
  assert.equal(granted.levelUps[0].coins, 30);
  assert.equal(live.userProfile.coins, before.coins + 7 + 30);
  assert.equal(live.actionLogs[0].applied.xp, getXpForLevel(1) + 10);
  assert.equal(live.actionLogs[0].applied.coins, 7);
  assert.equal(live.actionLogs[0].applied.wisdom, 3);
  assert.equal(live.actionLogs[0].applied.levelUps[0].coins, 30);
  assert.equal(live.actionLogs[0].id, granted.logEntry.id);

  revertLog(live, granted.logEntry.id);
  const after = getDb().userProfile;
  assert.equal(after.level, before.level);
  assert.equal(after.xp, before.xp);
  assert.equal(after.coins, before.coins);
  assert.equal(after.stats.wisdom, before.wisdom);
  assert.equal(getDb().actionLogs.some(l => l.id === granted.logEntry.id), false);
}));

tests.push(check('desmarcar um dia antigo estorna o log daquele dia, não o mais recente', () => {
  const db = freshDb();
  db.habits.push({
    id: 'h-old',
    title: 'Ritual antigo',
    xpReward: 40,
    coinReward: 9,
    history: [],
    rewardLogs: {},
    currentStreak: 0,
    bestStreak: 0
  });
  saveDb(db);
  toggleHabit(getDb(), { id: 'h-old', date: '2020-01-02' });
  const olderLog = getDb().habits.find(h => h.id === 'h-old').rewardLogs['2020-01-02'];
  const xpOlder = getDb().actionLogs.find(l => l.id === olderLog).applied.xp;
  toggleHabit(getDb(), { id: 'h-old', date: '2020-01-03' });
  const newerLog = getDb().habits.find(h => h.id === 'h-old').rewardLogs['2020-01-03'];
  const xpNewer = getDb().actionLogs.find(l => l.id === newerLog).applied.xp;
  assert.ok(olderLog && newerLog && olderLog !== newerLog);
  assert.ok(xpNewer >= xpOlder, 'o segundo dia deve pagar pelo menos o streak do primeiro');

  const coinsBoth = getDb().userProfile.coins;
  toggleHabit(getDb(), { id: 'h-old', date: '2020-01-02' });
  const live = getDb();
  assert.equal(live.actionLogs.some(l => l.id === olderLog), false);
  assert.equal(live.actionLogs.some(l => l.id === newerLog), true);
  assert.equal(live.habits.find(h => h.id === 'h-old').rewardLogs['2020-01-02'], undefined);
  assert.equal(live.habits.find(h => h.id === 'h-old').rewardLogs['2020-01-03'], newerLog);
  assert.equal(live.userProfile.coins, coinsBoth - 9);
  assert.equal(live.userProfile.stats.consistency, 15);
  assert.equal(live.userProfile.xp, xpNewer);
  finiteProfile(live);
}));

tests.push(check('duas sessões do mesmo livro: apagar a primeira remove só o log dela', () => {
  const db = freshDb();
  db.books.push({
    id: 'book-1',
    title: 'Tomo',
    totalPages: 400,
    currentPage: 0,
    status: 'reading',
    quotes: []
  });
  saveDb(db);
  const first = logReadingSession(getDb(), {
    bookId: 'book-1', startPage: 0, endPage: 10, durationMinutes: 20, date: '2024-05-01'
  });
  const second = logReadingSession(getDb(), {
    bookId: 'book-1', startPage: 10, endPage: 25, durationMinutes: 20, date: '2024-05-02'
  });
  assert.equal(first.error, undefined);
  assert.equal(second.error, undefined);
  assert.notEqual(first.session.rewardLogId, second.session.rewardLogId);
  const firstXp = getDb().actionLogs.find(l => l.id === first.session.rewardLogId).applied.xp;
  const secondXp = getDb().actionLogs.find(l => l.id === second.session.rewardLogId).applied.xp;
  const xpBoth = getDb().userProfile.xp;

  const removed = deleteReadingSession(getDb(), first.session.id);
  const live = getDb();
  assert.equal(removed.error, undefined);
  assert.equal(live.readingSessions.length, 1);
  assert.equal(live.readingSessions[0].id, second.session.id);
  assert.equal(live.actionLogs.some(l => l.id === first.session.rewardLogId), false);
  assert.equal(live.actionLogs.some(l => l.id === second.session.rewardLogId), true);
  assert.equal(live.userProfile.xp, xpBoth - firstXp);
  assert.equal(live.userProfile.xp, secondXp);
  assert.equal(live.books[0].currentPage, 25);
  finiteProfile(live);
}));

tests.push(check('derrotar o chefe e estornar devolve HP, derrotas e moedas do bônus de nível', () => {
  const db = freshDb();
  db.bossRaid.maxHp = 40;
  db.bossRaid.currentHp = 40;
  db.bossRaid.rewardXp = 80;
  db.bossRaid.rewardCoins = 25;
  const bossId = db.bossRaid.id;
  saveDb(db);
  const before = {
    level: getDb().userProfile.level,
    xp: getDb().userProfile.xp,
    coins: getDb().userProfile.coins,
    hp: getDb().bossRaid.currentHp,
    defeats: getDb().bossRaid.defeatsCount
  };

  const granted = rewardPlayer({
    xp: 200,
    coins: 10,
    actionType: 'test_kill',
    entityId: 'kill-1',
    title: 'Golpe fatal'
  });
  const mid = getDb();
  assert.equal(mid.bossRaid.defeated, true);
  assert.equal(mid.bossRaid.defeatsCount, before.defeats + 1);
  assert.equal(granted.logEntry.applied.bossDefeated, true);
  assert.equal(granted.logEntry.applied.bossRewardCoins, 25);
  assert.equal(granted.logEntry.applied.bossRewardXp, 80);
  assert.ok(granted.levelUps.length >= 1, 'o XP do chefe também sobe de nível');
  const bossLevelUps = granted.levelUps.filter(entry => entry.level > 1);
  assert.ok(bossLevelUps.length >= 1);

  revertLog(mid, granted.logEntry.id);
  const after = getDb();
  assert.equal(after.bossRaid.defeated, false);
  assert.equal(after.bossRaid.defeatsCount, before.defeats);
  assert.equal(after.bossRaid.currentHp, before.hp);
  assert.equal(after.bossRaid.id, bossId);
  assert.equal(after.userProfile.level, before.level);
  assert.equal(after.userProfile.xp, before.xp);
  assert.equal(after.userProfile.coins, before.coins);
  assert.equal(after.actionLogs.some(l => l.id === granted.logEntry.id), false);
  finiteProfile(after);
}));

tests.push(check('excluir missão concluída estorna o log gravado nela', () => {
  const db = freshDb();
  db.quests.push({
    id: 'q-del',
    title: 'Petição',
    xpReward: 55,
    coinReward: 12,
    difficulty: 'media',
    completed: false
  });
  saveDb(db);
  const before = {
    xp: getDb().userProfile.xp,
    coins: getDb().userProfile.coins,
    willpower: getDb().userProfile.stats.willpower,
    focus: getDb().userProfile.stats.focus
  };
  const done = completeQuest(getDb(), { id: 'q-del', completed: true });
  assert.equal(done.error, undefined);
  const logId = getDb().quests[0].rewardLogId;
  assert.ok(logId);
  assert.ok(getDb().userProfile.xp > before.xp);

  const removed = deleteQuest(getDb(), 'q-del');
  const live = getDb();
  assert.equal(removed.error, undefined);
  assert.equal(live.quests.some(q => q.id === 'q-del'), false);
  assert.equal(live.actionLogs.some(l => l.id === logId), false);
  assert.equal(live.userProfile.xp, before.xp);
  assert.equal(live.userProfile.coins, before.coins);
  assert.equal(live.userProfile.stats.willpower, before.willpower);
  assert.equal(live.userProfile.stats.focus, before.focus);
}));

tests.push(check('NaN de entrada não contamina perfil, e moedas podem ficar negativas no estorno', () => {
  const db = freshDb();
  db.userProfile.coins = 3;
  saveDb(db);
  const granted = rewardPlayer({
    xp: Number.NaN,
    coins: 1,
    wisdom: Number.NaN,
    focus: 'não-número',
    actionType: 'test_nan',
    entityId: 'nan-1',
    title: 'NaN'
  });
  const live = getDb();
  finiteProfile(live);
  assert.equal(live.userProfile.xp, 0);
  assert.equal(live.userProfile.stats.wisdom, 0);
  assert.equal(live.actionLogs[0].applied.xp, 0);
  assert.equal(live.actionLogs[0].applied.wisdom, 0);

  live.userProfile.coins = 0;
  saveDb(live);
  revertLog(getDb(), granted.logEntry.id);
  const after = getDb();
  finiteProfile(after);
  assert.ok(after.userProfile.coins <= 0, 'estorno pode deixar moedas negativas');
}));

tests.push(check('migração de processo MCP não reescreve XP e espelha aliases', () => {
  const db = freshDb();
  db.userProfile.xp = 1234;
  db.userProfile.coins = 567;
  db.processes.push({
    id: 'p-legacy',
    title: 'Lote antigo',
    totalSteps: 8,
    currentStep: 2,
    stepUnit: 'recursos',
    status: 'active'
  });
  db.rewards.push({ id: 'r-legacy', title: 'Café', costCoins: 40 });
  const migrated = sanitizeDb(db);
  assert.equal(migrated.userProfile.xp, 1234);
  assert.equal(migrated.userProfile.coins, 567);
  const process = migrated.processes[0];
  assert.equal(process.totalUnits, 8);
  assert.equal(process.completedUnits, 2);
  assert.equal(process.unitName, 'recursos');
  assert.equal(process.status, 'in_progress');
  assert.equal(process.xpPerUnit, 15);
  assert.equal(process.coinsPerUnit, 3);
  assert.equal(process.totalSteps, 8);
  assert.equal(process.currentStep, 2);
  assert.equal(migrated.rewards[0].cost, 40);
  assert.equal(migrated.rewards[0].costCoins, 40);
  sanitizeDb(migrated);
  assert.equal(migrated.processes[0].xpPerUnit, 15);
}));

tests.push(check('citação avulsa e questão usam a fórmula HTTP, não a antiga do MCP', () => {
  const db = freshDb();
  db.books.push({ id: 'b-q', title: 'Código', totalPages: 100, currentPage: 0, status: 'reading', quotes: [] });
  saveDb(db);
  const quote = addQuote(getDb(), { bookId: 'b-q', quote: 'Nemo iudex', page: 3 });
  assert.equal(quote.error, undefined);
  const quoteLog = getDb().actionLogs.find(l => l.id === quote.quote.rewardLogId);
  assert.equal(quoteLog.applied.xp, 20);
  assert.equal(quoteLog.applied.coins, 5);
  assert.equal(quoteLog.applied.wisdom, 10);

  const exam = logExamQuestions(getDb(), {
    subject: 'Administrativo',
    subjectId: 'administrativo',
    topicId: 'licitacoes',
    kind: 'questoes',
    blockKey: 'administrativo:licitacoes:questoes',
    totalQuestions: 10,
    correctAnswers: 10
  });
  assert.equal(exam.error, undefined);
  const entry = exam.entry;
  assert.equal(entry.subjectId, 'administrativo');
  assert.equal(entry.topicId, 'licitacoes');
  assert.equal(entry.kind, 'questoes');
  assert.equal(entry.blockKey, 'administrativo:licitacoes:questoes');
  // HTTP: 10*3 + 10*4 + 50 = 120 XP; moedas max(2, 5) + 5 + 10 = 20
  assert.equal(entry.xpEarned, 120);
  assert.equal(entry.coinsEarned, 20);
  const examLog = getDb().actionLogs.find(l => l.id === entry.rewardLogId);
  assert.equal(examLog.applied.xp, 120);
  assert.equal(examLog.applied.focus, 20);
  assert.equal(examLog.applied.wisdom, 20);
  assert.equal(examLog.applied.consistency, 10);
}));

async function runParity() {
  console.log('\n⚖️  Paridade HTTP × MCP\n');
  const server = await startTestServer();
  const port = server.port;
  assert.ok(port >= 20000 && port !== 3000 && port !== 3090, `porta inesperada ${port}`);

  function request(path, options = {}, body = null) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method || (body ? 'POST' : 'GET'),
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  try {
    const guest = await request('/api/auth/guest', { method: 'POST' }, {});
    assert.equal(guest.status, 200);
    const auth = { Authorization: `Bearer ${guest.data.token}` };
    const mcpToken = await request('/api/mcp/token', { headers: auth });
    assert.equal(mcpToken.status, 200);
    const mcpAuth = { Authorization: `Bearer ${mcpToken.data.token}` };

    async function rpc(name, args) {
      const res = await request('/api/mcp', { method: 'POST', headers: mcpAuth }, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args }
      });
      assert.equal(res.status, 200, `${name} HTTP ${res.status} ${res.raw || ''}`);
      const text = res.data?.result?.content?.[0]?.text || '';
      const parsed = JSON.parse(text);
      assert.equal(parsed.success, true, `${name}: ${text}`);
      return parsed.data;
    }

    const state = await request('/api/state', { headers: auth });
    const coins0 = state.data.userProfile.coins;
    const xp0 = state.data.userProfile.xp;

    const httpProcess = await request('/api/processes', { method: 'POST', headers: auth }, {
      title: 'Lote HTTP',
      totalUnits: 5,
      unitName: 'peças',
      xpPerUnit: 20,
      coinsPerUnit: 5
    });
    assert.equal(httpProcess.status, 200);
    const httpStep = await request(`/api/processes/${httpProcess.data.process.id}/step`, { method: 'POST', headers: auth }, { unitsAdded: 2 });
    assert.equal(httpStep.status, 200);

    const mcpProcess = await rpc('create_process', { title: 'Lote MCP', totalSteps: 5, stepUnit: 'peças' });
    const mcpStep = await rpc('step_process', { id: mcpProcess.id, stepCount: 2 });
    assert.equal(mcpStep.process.currentStep, 2);
    assert.equal(mcpStep.process.totalSteps, 5);
    assert.equal(httpStep.data.rewardResult.logEntry.applied.xp, mcpStep.rewardResult.logEntry.applied.xp);
    assert.equal(httpStep.data.rewardResult.logEntry.applied.coins, mcpStep.rewardResult.logEntry.applied.coins);
    assert.equal(httpStep.data.rewardResult.logEntry.applied.focus, mcpStep.rewardResult.logEntry.applied.focus);

    const httpBook = await request('/api/books', { method: 'POST', headers: auth }, {
      title: 'Livro HTTP', author: 'A', totalPages: 80
    });
    const mcpBook = await rpc('create_book', { title: 'Livro MCP', author: 'B', totalPages: 80 });
    const httpQuote = await request(`/api/books/${httpBook.data.book.id}/quotes`, { method: 'POST', headers: auth }, {
      quote: 'Citação HTTP', page: 2
    });
    const mcpQuote = await rpc('add_book_quote', { bookId: mcpBook.id, quote: 'Citação MCP', page: 2 });
    const mcpQuoteXp = mcpQuote.rewardResult?.logEntry?.applied?.xp
      ?? mcpQuote.quote?.xpEarned;
    assert.equal(httpQuote.data.rewardResult.logEntry.applied.xp, 20);
    assert.equal(mcpQuoteXp, 20);

    const httpExam = await request('/api/questions', { method: 'POST', headers: auth }, {
      subject: 'Penal',
      subjectId: 'penal',
      topicId: 'crimes',
      kind: 'questoes',
      totalQuestions: 8,
      correctAnswers: 6,
      durationMinutes: 25
    });
    const mcpExam = await rpc('log_exam_questions', {
      subject: 'Penal',
      subjectId: 'penal',
      topicId: 'crimes',
      kind: 'questoes',
      totalQuestions: 8,
      correctAnswers: 6,
      durationMinutes: 25
    });
    assert.equal(httpExam.status, 200, JSON.stringify(httpExam.data));
    assert.equal(httpExam.data.examQuestion.xpEarned, mcpExam.entry.xpEarned);
    assert.equal(httpExam.data.examQuestion.coinsEarned, mcpExam.entry.coinsEarned);
    assert.equal(httpExam.data.rewardResult.logEntry.applied.focus, mcpExam.rewardResult.logEntry.applied.focus);
    assert.equal(mcpExam.entry.subjectId, 'penal');
    assert.equal(mcpExam.entry.kind, 'questoes');

    const poor = await request('/api/rewards', { method: 'POST', headers: auth }, {
      title: 'Relíquia impossível', cost: 1000000
    });
    const redeem = await request(`/api/rewards/${poor.data.reward.id}/redeem`, { method: 'POST', headers: auth }, {});
    assert.equal(redeem.status, 400);
    assert.match(redeem.data.error, /Moedas insuficientes/);

    const listed = await rpc('list_processes', { status: 'active' });
    assert.ok(listed.processes.some(p => p.title === 'Lote MCP'), 'active deve achar in_progress');

    const after = await request('/api/state', { headers: auth });
    assert.ok(Number.isFinite(after.data.userProfile.xp));
    assert.ok(after.data.userProfile.xp > xp0);
    assert.ok(Number.isFinite(after.data.userProfile.coins));
    assert.ok(after.data.userProfile.coins >= coins0);
    console.log('✅ HTTP e MCP concedem os mesmos deltas em processo, citação e questão');
  } finally {
    server.stop();
  }
}

tests.push(runParity());

const listedTools = ['update_reading_session', 'update_book_quote', 'update_exam_questions', 'delete_mind_map_session', 'record_energy', 'decline_next_action', 'accept_next_action_dose'];
tests.push(check('ferramentas MCP que faltavam estão registradas', () => {
  for (const name of listedTools) tool(name);
}));

tests.push(check('domínio de processo novo usa 20/5 e espelha currentStep', () => {
  const db = freshDb();
  const created = createProcess(db, { title: 'Novo', totalSteps: 4, stepUnit: 'casos' });
  saveDb(db);
  assert.equal(created.process.xpPerUnit, 20);
  assert.equal(created.process.coinsPerUnit, 5);
  assert.equal(created.process.totalSteps, 4);
  const stepped = stepProcess(getDb(), created.process.id, { stepCount: 1 });
  assert.equal(stepped.error, undefined);
  assert.equal(getDb().processes[0].currentStep, 1);
  assert.equal(stepped.rewardResult.logEntry.applied.xp, 20);
  assert.equal(stepped.rewardResult.logEntry.applied.focus, 10);
}));

await Promise.all(tests);
if (failed) {
  console.error(`\n${failed} falha(s) no ledger/paridade.`);
  process.exit(1);
}
console.log('\n📒 Ledger e paridade ok.\n');
