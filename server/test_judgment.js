import './testEnv.js';
import assert from 'assert';
import http from 'http';
import { startTestServer } from './testEnv.js';
import { getDb, saveDb, createBossRaid, rewardPlayer, revertLog } from './db.js';
import { runMaintenance } from './domain/maintenance.js';
import { weekKeyFromDateStr, scaleBossHp, catalogBossHp } from './domain/bossWeek.js';
import { rollDestinyChest, chestSeed } from './domain/destinyChest.js';
import { applyReviewToNode, applyStudySession, restoreSessionScheduling } from '../src/utils/mindMaps.js';
import { calculateFrequencyStreak } from './timeUtils.js';
import { focusDamageBonus, wisdomXpBonus, willpowerPenaltyMitigation, maxStreakShields } from './domain/attributes.js';
import { addDaysToDateStr, getSaoPauloDateStr } from './timeUtils.js';

function log(date, type = 'quest_complete') {
  return {
    id: `log-${date}-${type}`,
    type,
    date,
    entityId: `e-${date}`,
    reverted: false,
    xp: 10,
    coins: 2,
    applied: { xp: 10, coins: 2, bossDamage: 10 }
  };
}

function freshHero() {
  const db = getDb();
  db.userProfile.coins = 500;
  db.userProfile.stats = { wisdom: 0, focus: 0, willpower: 0, consistency: 0 };
  db.quests = [];
  db.habits = [];
  db.dailyVictories = [];
  db.actionLogs = [];
  db.penalties = [];
  db.bossHistory = [];
  db.bossRaid = createBossRaid({ level: 1 });
  db.bossRaid.weekStartDate = '2026-09-27';
  db.bossRaid.defeated = false;
  db.maintenance = { penaltiesSince: '2026-10-01', penaltyKeys: {} };
  saveDb(db);
  return db;
}

async function run() {
  console.log('🧪 Julgamento, chefe semanal, streaks e SM-2...\n');

  assert.equal(weekKeyFromDateStr('2026-09-30'), '2026-09-27', 'quarta 30/09 normaliza para o domingo 27/09');
  assert.equal(focusDamageBonus(1398), 0.2, 'Foco 1398 chega no teto de +20%');
  assert.equal(wisdomXpBonus(250), 0.02, 'Sabedoria 250 = +2%');
  assert.equal(willpowerPenaltyMitigation(80), 0.04, 'Vontade 80 reduz 4% das moedas');
  assert.equal(maxStreakShields(500), 4, 'Consistência 500 chega no teto de 4 escudos');

  const db = freshHero();
  db.bossRaid = createBossRaid({ level: 16 });
  db.bossRaid.name = 'A Quimera da Hesitação';
  db.bossRaid.weekStartDate = '2026-09-30';
  db.bossRaid.currentHp = 1296;
  db.bossRaid.maxHp = 2089;
  db.bossRaid.defeated = false;
  db.bossHistory = [
    { weekKey: '2026-09-06', damageDealt: 800, defeated: true },
    { weekKey: '2026-09-13', damageDealt: 900, defeated: true },
    { weekKey: '2026-09-20', damageDealt: 1000, defeated: false }
  ];
  db.maintenance.penaltiesSince = '2026-10-05';
  saveDb(db);

  const beforeHp = db.bossRaid.currentHp;
  const sameWeek = runMaintenance(db, new Date('2026-10-03T15:00:00-03:00'), { createBossRaid });
  assert.equal(sameWeek.weekly.rolled.length, 0, 'mesma semana não vira o chefe');
  assert.equal(db.bossRaid.weekStartDate, '2026-09-27', 'weekStartDate normaliza para o domingo sem mexer no HP');
  assert.equal(db.bossRaid.currentHp, beforeHp, 'HP vivo é preservado na migração');
  assert.equal(db.bossRaid.name, 'A Quimera da Hesitação');

  db.maintenance.penaltiesSince = '2026-08-01';
  const september = runMaintenance({ ...db, bossRaid: { ...db.bossRaid, weekStartDate: '2026-09-06' }, maintenance: { penaltiesSince: '2026-10-05', penaltyKeys: {} }, penalties: [], actionLogs: [] }, new Date('2026-10-12T12:00:00-03:00'), { createBossRaid });
  assert.equal((september.created || []).some((item) => item.type === 'boss_undefeated' && item.weekKey < '2026-10-05'), false, 'não pune semana anterior à ativação');

  const live = freshHero();
  live.bossRaid.weekStartDate = '2026-10-04';
  live.bossRaid.level = 3;
  live.bossRaid.defeated = false;
  live.bossRaid.currentHp = 100;
  live.bossRaid.maxHp = 605;
  live.bossRaid.rewardCoins = 182;
  live.maintenance.penaltiesSince = '2026-10-01';
  live.bossHistory = [
    { damageDealt: 400 },
    { damageDealt: 500 },
    { damageDealt: 600 },
    { damageDealt: 700 }
  ];
  const rolled = runMaintenance(live, new Date('2026-10-12T12:00:00-03:00'), { createBossRaid });
  assert.ok(rolled.weekly.rolled.length >= 1, 'semana vencida vira');
  const undefeated = rolled.weekly.rolled.find((item) => item.closed === '2026-10-04');
  assert.equal(undefeated.defeated, false);
  assert.ok(undefeated.penalty, 'semana sem derrota gera punição');
  assert.equal(undefeated.penalty.deltas.willpower, -10);
  assert.equal(live.bossRaid.level, 3, 'sem derrota o nível não sobe');
  assert.equal(live.bossRaid.weekStartDate, '2026-10-11');
  const expectedHp = scaleBossHp(3, live.bossHistory.slice(0, -1).concat([{ damageDealt: Math.max(0, 605 - 100) }]));
  assert.equal(live.bossRaid.maxHp, live.bossRaid.currentHp);
  assert.ok(live.bossRaid.maxHp >= Math.round(catalogBossHp(3) * 0.5));
  assert.ok(live.bossRaid.maxHp <= catalogBossHp(3) * 2);
  assert.equal(live.userProfile.stats.willpower, 0, 'atributo de punição tem piso 0');
  assert.ok(live.userProfile.coins <= 500, 'moedas caem, sem ficar negativas');

  const again = runMaintenance(live, new Date('2026-10-12T18:00:00-03:00'), { createBossRaid });
  assert.equal(again.created.length, 0, 'segunda passagem não repete punição');
  assert.equal(again.weekly.rolled.length, 0);

  const won = freshHero();
  won.bossRaid.weekStartDate = '2026-10-04';
  won.bossRaid.level = 2;
  won.bossRaid.defeated = true;
  won.bossRaid.currentHp = 0;
  won.bossRaid.defeatsCount = 4;
  won.maintenance.penaltiesSince = '2026-10-01';
  const promoted = runMaintenance(won, new Date('2026-10-12T12:00:00-03:00'), { createBossRaid });
  assert.equal(promoted.weekly.rolled[0].penalty, null, 'chefe derrotado não paga punição de semana');
  assert.equal(won.bossRaid.level, 3, 'derrota sobe o nível na virada');
  assert.equal(won.bossRaid.defeated, false);

  const quests = freshHero();
  quests.maintenance.penaltiesSince = '2026-10-01';
  quests.quests = [{
    id: 'q-crit',
    title: 'Protocolar agravo',
    priority: 'critico',
    completed: false,
    dueDate: '2026-10-06'
  }];
  const day1 = runMaintenance(quests, new Date('2026-10-07T12:00:00-03:00'), { createBossRaid });
  assert.ok(day1.created.some((item) => item.type === 'critical_quest_overdue' && item.milestone === 1));
  const coinsAfterDay1 = quests.userProfile.coins;
  const day2 = runMaintenance(quests, new Date('2026-10-08T12:00:00-03:00'), { createBossRaid });
  assert.equal(day2.created.filter((item) => item.type === 'critical_quest_overdue').length, 0, 'dia 2 não é marco');
  assert.equal(quests.userProfile.coins, coinsAfterDay1);
  const day3 = runMaintenance(quests, new Date('2026-10-09T12:00:00-03:00'), { createBossRaid });
  assert.ok(day3.created.some((item) => item.milestone === 3), 'dia 3 escala');
  const repeat = runMaintenance(quests, new Date('2026-10-09T20:00:00-03:00'), { createBossRaid });
  assert.equal(repeat.created.length, 0, 'marco já julgado não repete');

  const old = freshHero();
  old.maintenance.penaltiesSince = '2026-10-05';
  old.quests = [{ id: 'q-old', title: 'Setembro', priority: 'critico', completed: false, dueDate: '2026-09-01' }];
  const guarded = runMaintenance(old, new Date('2026-10-06T12:00:00-03:00'), { createBossRaid });
  assert.equal(guarded.created.filter((item) => item.entityIds?.includes('q-old')).length, 0, 'penaltiesSince barra histórico de setembro');
  const futureOnly = freshHero();
  futureOnly.maintenance.penaltiesSince = '2026-10-05';
  futureOnly.quests = [{ id: 'q-cross', title: 'Cruzou a ativação', priority: 'critico', completed: false, dueDate: '2026-10-04' }];
  const crossed = runMaintenance(futureOnly, new Date('2026-10-06T12:00:00-03:00'), { createBossRaid });
  assert.equal(crossed.created.filter((item) => item.milestone === 1).length, 0, 'marco anterior à ativação não é julgado');
  assert.equal(crossed.created.filter((item) => item.milestone === 7).length, 0);

  // Missão já vencida na ativação (caso real "DENÚNCIAS", vencida em 10/09):
  // o atraso conta do piso (véspera da ativação), então ela entra no marco 1
  // — nunca no marco 21, que seria punição retroativa por dívida antiga.
  const legacy = freshHero();
  legacy.userProfile.coins = 500;
  legacy.maintenance.penaltiesSince = '2026-10-02';
  legacy.quests = [{ id: 'q-denuncias', title: 'DENÚNCIAS', priority: 'critico', completed: false, dueDate: '2026-09-10' }];
  const firstDay = runMaintenance(legacy, new Date('2026-10-02T12:00:00-03:00'), { createBossRaid });
  const legacyPenalties = firstDay.created.filter((item) => item.entityIds?.includes('q-denuncias'));
  assert.equal(legacyPenalties.length, 1, 'missão vencida antes da ativação é julgada no dia da ativação');
  assert.equal(legacyPenalties[0].milestone, 1, 'o atraso antigo entra no marco 1, não no marco 21');
  assert.equal(legacyPenalties[0].deltas.willpower, -5, 'marco 1 custa 5 de Vontade');
  assert.equal(legacyPenalties[0].deltas.coins, -10, 'marco 1 custa 10 moedas — nada de −50 retroativo');
  assert.equal(legacy.userProfile.coins, 490, 'o desconto retroativo não escala pelo atraso antigo');
  const legacyNext = runMaintenance(legacy, new Date('2026-10-03T12:00:00-03:00'), { createBossRaid });
  assert.equal(legacyNext.created.length, 0, 'dia 2 do piso não é marco');
  const legacyDay3 = runMaintenance(legacy, new Date('2026-10-04T12:00:00-03:00'), { createBossRaid });
  const legacyThird = legacyDay3.created.find((item) => item.entityIds?.includes('q-denuncias'));
  assert.equal(legacyThird?.milestone, 3, 'no terceiro dia do piso o marco 3 escala');
  assert.equal(legacyThird?.deltas.willpower, -10);

  const habit = freshHero();
  habit.maintenance.penaltiesSince = '2026-10-01';
  habit.habits = [{
    id: 'h-mwf',
    title: 'Treino',
    priority: 'critico',
    frequency: 'times_per_week',
    weekDays: [1, 3, 5],
    targetTimesPerWeek: 3,
    history: ['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09']
  }];
  const streak = calculateFrequencyStreak(habit.habits[0], '2026-10-10');
  assert.equal(streak.unit, 'weeks');
  assert.equal(streak.currentStreak, 3, 'MWF por 3 semanas = 3 semanas, não dias corridos');

  const missedHabit = freshHero();
  missedHabit.maintenance.penaltiesSince = '2026-10-01';
  missedHabit.habits = [{
    id: 'h-miss',
    title: 'Treino crítico',
    priority: 'critico',
    frequency: 'times_per_week',
    weekDays: [1, 3, 5],
    targetTimesPerWeek: 3,
    history: ['2026-10-05']
  }];
  const missed = runMaintenance(missedHabit, new Date('2026-10-12T12:00:00-03:00'), { createBossRaid });
  assert.ok(missed.created.some((item) => item.type === 'critical_habit_miss'), 'ritual crítico sem meta semanal é julgado na virada');

  const defeat = freshHero();
  defeat.maintenance.penaltiesSince = '2026-10-01';
  defeat.dailyVictories = [
    { id: 'v1', title: 'A', date: '2026-10-06', completed: false },
    { id: 'v2', title: 'B', date: '2026-10-06', completed: false }
  ];
  const lostDay = runMaintenance(defeat, new Date('2026-10-07T12:00:00-03:00'), { createBossRaid });
  const daily = lostDay.created.find((item) => item.type === 'daily_defeat');
  assert.ok(daily, '0 de N planejadas é derrota do dia');
  assert.equal(daily.deltas.willpower, -5);

  const contestDb = freshHero();
  contestDb.userProfile.coins = 100;
  contestDb.userProfile.stats.willpower = 40;
  contestDb.maintenance.penaltiesSince = '2026-10-01';
  contestDb.quests = [{ id: 'q-c', title: 'Peça', priority: 'critico', completed: false, dueDate: '2026-10-06' }];
  runMaintenance(contestDb, new Date('2026-10-07T12:00:00-03:00'), { createBossRaid });
  const penalty = contestDb.penalties.find((item) => item.type === 'critical_quest_overdue');
  assert.ok(penalty.rewardLogId, 'punição tem log no ledger');
  assert.equal(penalty.logId, penalty.rewardLogId, 'logId aponta para o mesmo log do ledger');
  const coinsAfter = contestDb.userProfile.coins;
  const willAfter = contestDb.userProfile.stats.willpower;
  const reverted = revertLog(contestDb, penalty.rewardLogId, { save: false });
  assert.ok(contestDb.userProfile.coins >= coinsAfter, 'contestar devolve moedas');
  assert.ok(contestDb.userProfile.stats.willpower >= willAfter, 'contestar devolve vontade');
  assert.equal(reverted.reverted, true);

  const studyHero = freshHero();
  studyHero.userProfile.level = 16;
  studyHero.userProfile.xp = 400;
  studyHero.userProfile.xpToNextLevel = 2000;
  studyHero.userProfile.stats.wisdom = 200;
  saveDb(studyHero);
  void studyHero;
  const boosted = rewardPlayer({
    xp: 100,
    coins: 10,
    actionType: 'reading_session',
    entityId: 'read-2',
    title: 'Leitura com sabedoria'
  });
  assert.equal(boosted.logEntry.applied.wisdomXpBonus, 2, 'bônus de sabedoria fica no ledger');
  assert.equal(boosted.logEntry.applied.xp, 102);
  const liveHero = getDb();
  const beforeRevert = liveHero.userProfile.xp;
  revertLog(liveHero, boosted.logEntry.id, { save: false });
  assert.equal(liveHero.userProfile.xp, beforeRevert - 102, 'estorno desfaz o XP com bônus');

  const chestA = rollDestinyChest(chestSeed('2026-10-07', 'daily-review'));
  const chestB = rollDestinyChest(chestSeed('2026-10-07', 'daily-review'));
  assert.deepEqual(chestA, chestB, 'baú do mesmo dia+evento não muda');
  assert.notEqual(chestA.roll, undefined);

  const node = { ease: 2.5, interval: 0, reviews: 0, lapses: 0 };
  const forgot = applyReviewToNode(node, 0, '2026-10-07');
  assert.equal(forgot.interval, 1);
  assert.equal(forgot.dueDate, '2026-10-08', 'qualidade 0 não vence no mesmo dia');
  assert.equal(forgot.lapses, 1);
  const hard = applyReviewToNode({ ...node, interval: 10, ease: 2.5 }, 1, '2026-10-07');
  assert.equal(hard.interval, 12, 'difícil = anterior × 1.2');
  const easy = applyReviewToNode({ ...node, interval: 10, ease: 2.5 }, 3, '2026-10-07');
  assert.ok(easy.ease <= 2.8, 'ease tem teto 2.8');
  assert.ok(easy.interval <= 180, 'intervalo tem teto de 180');
  const farm = applyReviewToNode({ ease: 2.7, interval: 100, reviews: 4, lapses: 0 }, 3, '2026-10-07');
  assert.ok(farm.interval <= 180);

  const map = {
    id: 'map-1',
    title: 'Art. 5º',
    rootId: 'root',
    nodes: [
      { id: 'root', label: 'Núcleo', ease: 2.5, interval: 0, reviews: 0, lapses: 0 },
      { id: 'child', parentId: 'root', label: 'Ramo', ease: 2.5, interval: 4, dueDate: '2026-10-01', reviews: 2, lapses: 0 }
    ]
  };
  const studied = applyStudySession(map, [{ nodeId: 'child', quality: 0 }], { today: '2026-10-07' });
  assert.ok(studied.session.nodeSnapshots?.length === 1, 'sessão guarda snapshot do agendamento');
  const restored = restoreSessionScheduling(studied.map, studied.session);
  const child = restored.nodes.find((item) => item.id === 'child');
  assert.equal(child.interval, 4, 'excluir sessão restaura o intervalo');
  assert.equal(child.dueDate, '2026-10-01');

  console.log('✅ domínio do julgamento ok');
  await runHttp();
  console.log('\n🎉 Julgamento, chefe, streaks, SM-2 e caderno de erros passaram.');
}

function request(port, path, method, body, token) {
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
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(data); } catch { json = { raw: data }; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runHttp() {
  const server = await startTestServer();
  try {
    const guest = await request(server.port, '/api/auth/guest', 'POST', {});
    assert.equal(guest.status, 200);
    const token = guest.body.token;
    const added = await request(server.port, '/api/agu-plan/errors', 'POST', {
      note: 'Confundi decadência com prescrição',
      subjectId: 'administrativo',
      url: 'https://tec.example/q/1'
    }, token);
    assert.equal(added.status, 200, added.body.error || 'caderno recusou o erro');
    const id = added.body.error.id;
    const listed = await request(server.port, '/api/agu-plan/errors', 'GET', null, token);
    assert.ok(listed.body.errors.some((item) => item.id === id));
    const reviewed = await request(server.port, `/api/agu-plan/errors/${id}/review`, 'POST', { quality: 0 }, token);
    assert.equal(reviewed.status, 200);
    assert.ok(reviewed.body.error.lapses >= 1, 'errei de novo conta lapso');
    const removed = await request(server.port, `/api/agu-plan/errors/${id}`, 'DELETE', null, token);
    assert.equal(removed.status, 200);
    const blocked = await request(server.port, '/api/boss/reset', 'POST', {}, token);
    assert.equal(blocked.status, 409, 'reset manual sem derrota é recusado');
    console.log('✅ rotas do caderno e do reset do chefe ok');
  } finally {
    server.stop();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
