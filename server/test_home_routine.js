/**
 * Rotina da tela inicial + execução integral como vitória do dia.
 *
 * 1. Modelo: a escolha vive no perfil (`homeRoutineId`), o retrato da rotina
 *    usa a mesma régua da aba Rotinas e a validade da vitória exige a rotina
 *    inteira cumprida hoje.
 * 2. API: salvar a rotina da tela inicial, planejar a execução como vaga
 *    manual do dia, recusar a conquista com passos pendentes, conquistar
 *    depois de cumprir tudo, reabrir estornando, e não deixar vitória órfã
 *    quando a rotina é excluída.
 */
import './testEnv.js';
import assert from 'node:assert/strict';
import { startTestServer } from './testEnv.js';
import http from 'http';
import {
  MAX_DAILY_VICTORIES,
  createDailyVictory,
  findVictoryForRoutine,
  listRoutineVictoriesForDate,
  manualVictoriesFull,
  sanitizeDailyVictories,
  summarizeDay,
  countManualVictoriesForDate
} from '../src/utils/dailyVictories.js';
import {
  buildHomeRoutine,
  describeHomeRoutine,
  normalizeHomeRoutineId,
  routineVictoryGate,
  routineVictoryProblem
} from '../src/utils/homeRoutine.js';
import { getSaoPauloDateStr, addDaysToDateStr } from './timeUtils.js';

const PORT = Number(process.env.TEST_PORT || process.env.PORT);
let authToken = null;

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      ...options
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

const countManual = (list, dateStr) => countManualVictoriesForDate(list, dateStr);

function assertModel() {
  const today = '2026-10-23';
  const habits = [
    { id: 'h1', title: 'Banho frio', history: [today] },
    { id: 'h2', title: 'Meditar', history: [] }
  ];
  const routines = [
    { id: 'r1', title: 'Manhã', steps: [{ kind: 'habit', habitId: 'h1' }, { kind: 'habit', habitId: 'h2' }] }
  ];

  assert.equal(normalizeHomeRoutineId('  r1 '), 'r1');
  assert.equal(normalizeHomeRoutineId(''), null);
  assert.equal(normalizeHomeRoutineId(null), null);

  assert.deepEqual(describeHomeRoutine(routines, null).status, 'none');
  assert.deepEqual(describeHomeRoutine(routines, 'sumiu').status, 'missing');
  assert.deepEqual(describeHomeRoutine(routines, 'r1').status, 'ok');

  const snapshot = buildHomeRoutine(routines, habits, today, 'r1');
  assert.equal(snapshot.total ?? snapshot.progress.total, 2);
  assert.equal(snapshot.progress.done, 1);
  assert.equal(snapshot.progress.complete, false);
  assert.equal(snapshot.next.habitId, 'h2');
  assert.equal(snapshot.next.title, 'Meditar');
  assert.deepEqual(snapshot.habitIds, ['h1', 'h2']);
  assert.equal(snapshot.steps[0].doneToday, true);

  const gatePending = routineVictoryGate(routines[0], { progress: { total: 2, done: 1 } });
  assert.equal(gatePending.canComplete, false);
  assert.match(gatePending.reason, /Faltam 1 passo/);
  const gateReady = routineVictoryGate(routines[0], { progress: { total: 2, done: 2 } });
  assert.equal(gateReady.canComplete, true);

  assert.equal(routineVictoryProblem(routines[0]), null);
  assert.equal(routineVictoryProblem({ id: 'empty', steps: [] }) !== null, true);
  assert.equal(routineVictoryProblem({ id: 'only-missing', steps: [{ kind: 'habit', habitId: 'nope' }] }), null);
  const onlyChild = [
    { id: 'pai', title: 'Dia', steps: [{ kind: 'routine', routineId: 'filho' }] },
    { id: 'filho', title: 'Manhã', steps: [{ kind: 'habit', habitId: 'h1' }] }
  ];
  assert.equal(
    routineVictoryProblem(onlyChild[0], { habits, routines: onlyChild }),
    null,
    'rotina feita só de sub-rotina tem passos para reconhecer'
  );

  // Sub-rotina: o retrato inclui os rituais do ramo filho.
  const nested = [
    { id: 'a', title: 'Dia', steps: [{ kind: 'routine', routineId: 'b' }, { kind: 'habit', habitId: 'h2' }] },
    { id: 'b', title: 'Estudo', steps: [{ kind: 'habit', habitId: 'h1' }] }
  ];
  const nestedSnapshot = buildHomeRoutine(nested, habits, today, 'a');
  assert.equal(nestedSnapshot.progress.total, 2);

  // 2026-03-24 é terça. Seg/Qua/Sex em dia (segunda feita) não entra na conta.
  const tuesday = '2026-03-24';
  const scheduledHabits = [
    {
      id: 'sei',
      title: 'Limpar SEI',
      frequency: 'times_per_week',
      targetTimesPerWeek: 3,
      weekDays: [1, 3, 5],
      history: ['2026-03-23']
    },
    { id: 'agua', title: 'Água', frequency: 'daily', history: [] }
  ];
  const scheduledRoutines = [{
    id: 'expediente',
    title: 'Expediente',
    steps: [{ kind: 'habit', habitId: 'sei' }, { kind: 'habit', habitId: 'agua' }]
  }];
  const offDay = buildHomeRoutine(scheduledRoutines, scheduledHabits, tuesday, 'expediente');
  assert.equal(offDay.progress.total, 1);
  assert.equal(offDay.progress.resting, 1);
  assert.equal(offDay.steps[0].expectedToday, false);
  assert.equal(offDay.next.habitId, 'agua');
  assert.equal(offDay.completeToday, false);
  const lateHome = buildHomeRoutine(scheduledRoutines, [
    { ...scheduledHabits[0], history: [] },
    scheduledHabits[1]
  ], tuesday, 'expediente');
  assert.equal(lateHome.steps[0].expectedToday, true, 'atraso da segunda volta a esperar o ritual na terça');
  assert.equal(lateHome.next.habitId, 'sei');
  assert.equal(nestedSnapshot.steps[0].kind, 'routine');
  assert.equal(nestedSnapshot.steps[0].progress.done, 1);

  // Vaga manual: rotina ocupa uma das 3; leitura pela homeostase não disputa.
  let list = [];
  for (let i = 0; i < MAX_DAILY_VICTORIES - 1; i += 1) {
    list = createDailyVictory(list, { title: `Tarefa ${i}`, date: today }, { today }).list;
  }
  assert.equal(manualVictoriesFull(list, today), false);
  list = createDailyVictory(list, { title: 'Rotina inteira: Manhã', date: today, routineId: 'r1' }, { today }).list;
  assert.equal(manualVictoriesFull(list, today), true);
  assert.equal(findVictoryForRoutine(list, 'r1', today).routineId, 'r1');
  assert.equal(listRoutineVictoriesForDate(list, today).length, 1);
  assert.throws(
    () => createDailyVictory(list, { title: 'Quarta', date: today }, { today }),
    /limite de 3/
  );
  // A rotina pode entrar mesmo com uma leitura de homeostase no dia.
  let withReading = createDailyVictory([], {
    title: 'Leitura pela homeostase',
    date: today,
    source: 'homeostasis-reading'
  }, { today }).list;
  withReading = createDailyVictory(withReading, { title: 'A', date: today }, { today }).list;
  withReading = createDailyVictory(withReading, { title: 'B', date: today }, { today }).list;
  withReading = createDailyVictory(withReading, { title: 'C', date: today }, { today }).list;
  // A leitura pela homeostase não ocupa vaga manual: as 3 tarefas do herói
  // continuam possíveis, e daí em diante o dia fica cheio para a rotina.
  assert.equal(countManual(withReading, today), 3);
  assert.equal(withReading.length, 4);
  assert.throws(
    () => createDailyVictory(withReading, { title: 'Rotina: D', date: today, routineId: 'r9' }, { today }),
    /limite de 3/
  );

  // Com uma vaga livre no dia, a rotina entra normalmente.
  let twoTasks = createDailyVictory([], {
    title: 'Leitura pela homeostase',
    date: today,
    source: 'homeostasis-reading'
  }, { today }).list;
  twoTasks = createDailyVictory(twoTasks, { title: 'A', date: today }, { today }).list;
  twoTasks = createDailyVictory(twoTasks, { title: 'B', date: today }, { today }).list;
  const routineVictory = createDailyVictory(twoTasks, { title: 'Rotina inteira: D', date: today, routineId: 'r9' }, { today });
  assert.equal(routineVictory.victory.category, 'Pessoal');
  assert.equal(routineVictory.victory.source, 'routine');
  assert.equal(routineVictory.victory.routineId, 'r9');
  assert.equal(countManual(routineVictory.list, today), 3);
  assert.equal(manualVictoriesFull(routineVictory.list, today), true);

  // A mesma rotina não entra duas vezes no mesmo dia.
  assert.throws(
    () => createDailyVictory(routineVictory.list, { title: 'De novo', date: today, routineId: 'r9' }, { today }),
    /já está nas vitórias/
  );

  // Resumo do dia: a vaga manual conta só tarefas do herói.
  const summary = summarizeDay(withReading, today);
  assert.equal(summary.manualCount, 3);
  assert.equal(summary.canAdd, false);
  assert.equal(summary.plannedCount, 4);

  // Registro órfão (rotina sem id) não vira tarefa comum.
  assert.equal(sanitizeDailyVictories([{ id: 'x', date: today, title: 'X', source: 'routine' }]).length, 0);
  assert.equal(
    sanitizeDailyVictories([{ id: 'y', date: today, title: 'Y', source: 'routine', routineId: 'r1' }])[0].routineId,
    'r1'
  );
}

async function run() {
  assertModel();
  const server = await startTestServer();
  try {
    const guest = await request('/api/auth/guest', { method: 'POST' }, {});
    assert.equal(guest.status, 200);
    authToken = guest.data.token;

    const todayStr = getSaoPauloDateStr();
    const tomorrowStr = addDaysToDateStr(todayStr, 1);

    const water = await request('/api/habits', { method: 'POST' }, { title: 'Água', frequency: 'daily' });
    const stretch = await request('/api/habits', { method: 'POST' }, { title: 'Alongar', frequency: 'daily' });
    assert.equal(water.status, 200, water.data?.error);
    assert.equal(stretch.status, 200, stretch.data?.error);
    const habitIds = [water.data.habit.id, stretch.data.habit.id];

    const created = await request('/api/routines', { method: 'POST' }, {
      title: 'Manhã',
      steps: habitIds.map(habitId => ({ habitId }))
    });
    assert.equal(created.status, 200, created.data?.error);
    const routineId = created.data.routine.id;

    // --- escolha da rotina da tela inicial ---------------------------------
    const badChoice = await request('/api/profile', { method: 'POST' }, { homeRoutineId: 'nao-existe' });
    assert.equal(badChoice.status, 400, 'escolher rotina inexistente é recusado');

    const chosen = await request('/api/profile', { method: 'POST' }, { homeRoutineId: routineId });
    assert.equal(chosen.status, 200, chosen.data?.error);
    assert.equal(chosen.data.userProfile.homeRoutineId, routineId);
    const afterChoice = await request('/api/state');
    assert.equal(afterChoice.data.userProfile.homeRoutineId, routineId, 'a escolha fica no perfil');

    // Trocar o tema não pode apagar a escolha da rotina.
    await request('/api/profile', { method: 'POST' }, { theme: 'claro' });
    const afterTheme = await request('/api/state');
    assert.equal(afterTheme.data.userProfile.homeRoutineId, routineId, 'trocar tema preserva a rotina da tela inicial');

    const cleared = await request('/api/profile', { method: 'POST' }, { homeRoutineId: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.data.userProfile.homeRoutineId, null, 'null limpa a escolha');
    await request('/api/profile', { method: 'POST' }, { homeRoutineId: routineId });

    // --- rotina como vitória planejada -------------------------------------
    const early = await request(`/api/routines/${routineId}/complete`, { method: 'POST' }, {});
    assert.equal(early.status, 404, 'sem estar planejada, não há vitória para conquistar');

    const planned = await request(`/api/routines/${routineId}/plan`, { method: 'POST' }, {});
    assert.equal(planned.status, 200, planned.data?.error);
    assert.equal(planned.data.created, true);
    assert.equal(planned.data.victory.routineId, routineId);
    assert.equal(planned.data.victory.source, 'routine');
    assert.equal(planned.data.victory.date, todayStr);
    assert.equal(planned.data.victory.completed, false);
    assert.match(planned.data.victory.title, /Manhã/);
    assert.equal(planned.data.readiness.status, 'pending');
    assert.equal(planned.data.todaySummary.plannedCount, 1);
    assert.equal(planned.data.todaySummary.manualCount, 1);

    const planAgain = await request(`/api/routines/${routineId}/plan`, { method: 'POST' }, {});
    assert.equal(planAgain.status, 200);
    assert.equal(planAgain.data.created, false, 'planejar de novo devolve a mesma vitória');
    assert.equal(planAgain.data.victory.id, planned.data.victory.id);

    const tooEarly = await request(`/api/routines/${routineId}/complete`, { method: 'POST' }, {});
    assert.equal(tooEarly.status, 400, 'não conquista com passos pendentes');
    assert.match(tooEarly.data.error, /Faltam 2 de 2/);

    const readiness = await request(`/api/routines/${routineId}/readiness`);
    assert.equal(readiness.status, 200);
    assert.equal(readiness.data.readiness.total, 2);
    assert.equal(readiness.data.readiness.done, 0);

    // Cumpre a rotina (o próprio ritual é quem paga): passa pelos dois passos.
    for (const habitId of habitIds) {
      const toggle = await request(`/api/habits/${habitId}/toggle`, { method: 'POST' }, {});
      assert.equal(toggle.status, 200, toggle.data?.error);
    }
    const ready = await request(`/api/routines/${routineId}/readiness`);
    assert.equal(ready.data.readiness.status, 'ready');
    assert.equal(ready.data.readiness.complete, true);

    const conquered = await request(`/api/routines/${routineId}/complete`, { method: 'POST' }, {});
    assert.equal(conquered.status, 200, conquered.data?.error);
    assert.equal(conquered.data.victory.completed, true);
    assert.ok(conquered.data.rewardResult, 'conquistar a vitória paga XP');
    assert.equal(conquered.data.rewardResult.logEntry?.type, 'daily_victory_complete');
    assert.equal(conquered.data.rewardResult.logEntry?.xp, 40, 'paga como uma vitória comum');
    assert.equal(conquered.data.todaySummary.completedCount, 1);
    assert.equal(conquered.data.readiness.willComplete ?? true, true);

    const twice = await request(`/api/routines/${routineId}/complete`, { method: 'POST' }, {});
    assert.equal(twice.status, 400, 'a vitória não é paga duas vezes');

    const reopened = await request(`/api/routines/${routineId}/reopen`, { method: 'POST' }, {});
    assert.equal(reopened.status, 200, reopened.data?.error);
    assert.equal(reopened.data.victory.completed, false);
    assert.ok(reopened.data.rewardResult, 'reabrir estorna a recompensa');
    assert.ok(Number(reopened.data.rewardResult.revertedXp) > 0, 'o XP da vitória é devolvido');

    // Planejar para amanhã é permitido; conquistar, não.
    await request(`/api/daily-victories/${planned.data.victory.id}`, { method: 'DELETE' });
    const plannedTomorrow = await request(`/api/routines/${routineId}/plan`, { method: 'POST' }, { date: tomorrowStr });
    assert.equal(plannedTomorrow.status, 200, plannedTomorrow.data?.error);
    assert.equal(plannedTomorrow.data.victory.date, tomorrowStr);
    assert.equal(plannedTomorrow.data.readiness.status, 'closed', 'vitória de amanhã não tem resultado ainda');
    const earlyTomorrow = await request(`/api/routines/${routineId}/complete`, { method: 'POST' }, { date: tomorrowStr });
    assert.equal(earlyTomorrow.status, 400);
    assert.match(earlyTomorrow.data.error, /próprio dia/);

    const plans = await request('/api/routines/victories');
    assert.equal(plans.status, 200);
    assert.ok(plans.data.plans.some(item => item.routineId === routineId && item.date === tomorrowStr));

    // --- trilha: rotina da tela inicial continua viva -----------------------
    const state = await request('/api/state');
    assert.equal(state.data.userProfile.homeRoutineId, routineId);
    const listed = state.data.routines.find(item => item.id === routineId);
    assert.equal(listed.progress.total, 2);
    assert.equal(listed.progress.done, 2);

    // --- excluir a rotina leva a escolha e as vitórias não conquistadas -----
    const removed = await request(`/api/routines/${routineId}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    const finalState = await request('/api/state');
    assert.equal(finalState.data.userProfile.homeRoutineId, null, 'excluir a rotina limpa a escolha da tela inicial');
    const leftovers = finalState.data.dailyVictories.filter(item => item.routineId === routineId && !item.completed);
    assert.equal(leftovers.length, 0, 'vitórias não conquistadas da rotina somem com ela');

    console.log('\n✅ Rotina da tela inicial e execução como vitória do dia: OK');
  } finally {
    server.stop();
  }
}

run().catch((err) => {
  console.error('❌ test_home_routine.js:', err);
  process.exit(1);
});
