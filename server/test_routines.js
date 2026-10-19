/**
 * Rotinas: sequência guiada de rituais.
 * Avançar marca o ritual (XP/streak) e recusa passo fora de ordem.
 * A rotina em si não cria um segundo lançamento de recompensa.
 */
import './testEnv.js';
import assert from 'node:assert/strict';
import { startTestServer } from './testEnv.js';
import http from 'http';
import {
  MAX_ROUTINE_NESTING,
  ROUTINE_CYCLE_ERROR,
  sanitizeRoutines,
  routineLinkError
} from '../src/utils/routines.js';

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

function assertModel() {
  const sanitized = sanitizeRoutines([
    { id: 'a', title: 'A', steps: [{ routineId: 'b' }, { habitId: 'h1' }] },
    { id: 'b', title: 'B', steps: [{ routineId: 'a' }, { habitId: 'h2' }] }
  ], [{ id: 'h1' }, { id: 'h2' }]);
  const a = sanitized.find(item => item.id === 'a');
  const b = sanitized.find(item => item.id === 'b');
  assert.equal(a.steps.some(step => step.routineId === 'b'), true);
  assert.equal(b.steps.some(step => step.routineId === 'a'), false, 'sanitize quebra o ciclo');
  assert.equal(a.steps.find(step => step.habitId === 'h1').kind, 'habit');

  const legacy = sanitizeRoutines([
    { id: 'r', title: 'R', steps: [{ id: 'h1' }, { habitId: 'h2', note: '  devagar  ' }] }
  ], [{ id: 'h1' }, { id: 'h2' }]);
  assert.deepEqual(legacy[0].steps, [
    { kind: 'habit', habitId: 'h1', note: '' },
    { kind: 'habit', habitId: 'h2', note: 'devagar' }
  ]);

  const morning = {
    id: 'm',
    title: 'Manhã',
    steps: [{ kind: 'habit', habitId: 'h1' }, { kind: 'habit', habitId: 'h2' }]
  };
  const day = {
    id: 'd',
    title: 'Dia',
    steps: [{ kind: 'routine', routineId: 'm' }, { kind: 'habit', habitId: 'h1' }]
  };
  assert.equal(
    routineLinkError([morning, day], 'm', [
      { kind: 'habit', habitId: 'h1' },
      { kind: 'routine', routineId: 'd' }
    ]),
    ROUTINE_CYCLE_ERROR
  );
  assert.equal(MAX_ROUTINE_NESTING >= 1, true);
}

async function run() {
  assertModel();
  const server = await startTestServer();
  try {
    const guest = await request('/api/auth/guest', { method: 'POST' }, {});
    assert.equal(guest.status, 200);
    authToken = guest.data.token;

    const before = await request('/api/state');
    const xp = before.data.userProfile.xp;
    const logs = before.data.actionLogs.length;

    const water = await request('/api/habits', { method: 'POST' }, { title: 'Água', frequency: 'daily' });
    const stretch = await request('/api/habits', { method: 'POST' }, { title: 'Alongar', frequency: 'daily' });
    const read = await request('/api/habits', { method: 'POST' }, { title: 'Ler 2 páginas', frequency: 'daily' });
    assert.equal(water.status, 200);
    const ids = [water.data.habit.id, stretch.data.habit.id, read.data.habit.id];

    const empty = await request('/api/routines', { method: 'POST' }, { title: 'Vazia', steps: [] });
    assert.equal(empty.status, 400);

    const created = await request('/api/routines', { method: 'POST' }, {
      title: 'Manhã',
      description: 'Abre o dia',
      steps: ids.map(habitId => ({ habitId }))
    });
    assert.equal(created.status, 200, created.data?.error);
    const routineId = created.data.routine.id;
    assert.equal(created.data.routine.nextHabitId, ids[0]);
    assert.equal(created.data.routine.progress.done, 0);

    const skipped = await request(`/api/routines/${routineId}/advance`, { method: 'POST' }, { habitId: ids[1] });
    assert.equal(skipped.status, 400);

    const first = await request(`/api/routines/${routineId}/advance`, { method: 'POST' }, { habitId: ids[0], durationMinutes: 5 });
    assert.equal(first.status, 200, first.data?.error);
    assert.equal(first.data.habit.id, ids[0]);
    assert.equal(first.data.habit.history.length, 1);
    assert.equal(first.data.progress.done, 1);
    assert.equal(first.data.completeToday, false);
    assert.ok(first.data.rewardResult);

    const afterFirst = await request('/api/state');
    assert.ok(afterFirst.data.userProfile.xp > xp, 'XP do ritual deve subir ao avançar a rotina');
    assert.equal(afterFirst.data.actionLogs.length, logs + 1, 'a rotina não pode gerar um segundo log de recompensa');
    const listed = afterFirst.data.routines.find(item => item.id === routineId);
    assert.equal(listed.nextHabitId, ids[1]);
    assert.equal(listed.steps[0].doneToday, true);

    const viaHabit = await request(`/api/habits/${ids[1]}/toggle`, { method: 'POST' });
    assert.equal(viaHabit.status, 200);
    const afterHabit = await request('/api/state');
    const mid = afterHabit.data.routines.find(item => item.id === routineId);
    assert.equal(mid.steps[1].doneToday, true, 'marcar o ritual fora da rotina também avança a sequência');
    assert.equal(mid.nextHabitId, ids[2]);

    const last = await request(`/api/routines/${routineId}/advance`, { method: 'POST' }, {});
    assert.equal(last.status, 200, last.data?.error);
    assert.equal(last.data.completeToday, true);
    assert.equal(last.data.routine.nextHabitId, null);

    const again = await request(`/api/routines/${routineId}/advance`, { method: 'POST' }, {});
    assert.equal(again.status, 400);

    const undone = await request(`/api/routines/${routineId}/advance`, { method: 'POST' }, { habitId: ids[2], undo: true });
    assert.equal(undone.status, 200, undone.data?.error);
    assert.equal(undone.data.undone, true);
    assert.equal(undone.data.routine.nextHabitId, ids[2], 'desmarcar devolve o passo à sequência');
    const outOfOrder = await request(`/api/routines/${routineId}/advance`, { method: 'POST' }, { habitId: ids[0], undo: true });
    assert.equal(outOfOrder.status, 200, 'desmarcar um passo já feito não exige que ele seja o último');
    assert.equal(outOfOrder.data.routine.steps.find(step => step.habitId === ids[0]).doneToday, false);

    await request(`/api/habits/${ids[0]}`, { method: 'DELETE' });
    const afterDelete = await request('/api/state');
    const trimmed = afterDelete.data.routines.find(item => item.id === routineId);
    assert.ok(trimmed.steps.every(step => step.habitId !== ids[0]), 'excluir o ritual tira o passo da rotina');

    const removed = await request(`/api/routines/${routineId}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    const end = await request('/api/state');
    assert.equal(end.data.routines.find(item => item.id === routineId), undefined);
    assert.ok(end.data.habits.some(habit => habit.id === ids[2]), 'excluir a rotina não apaga os rituais');

    const wake = await request('/api/habits', { method: 'POST' }, { title: 'Acordar', frequency: 'daily' });
    const coffee = await request('/api/habits', { method: 'POST' }, { title: 'Café', frequency: 'daily' });
    const studyHabit = await request('/api/habits', { method: 'POST' }, { title: 'Estudar', frequency: 'daily' });
    const review = await request('/api/habits', { method: 'POST' }, { title: 'Revisar', frequency: 'daily' });
    const close = await request('/api/habits', { method: 'POST' }, { title: 'Fechar o dia', frequency: 'daily' });
    const nestedIds = [wake, coffee, studyHabit, review, close].map(res => {
      assert.equal(res.status, 200, res.data?.error);
      return res.data.habit.id;
    });

    const morning = await request('/api/routines', { method: 'POST' }, {
      title: 'Manhã curta',
      steps: [{ habitId: nestedIds[0] }, { habitId: nestedIds[1] }]
    });
    const study = await request('/api/routines', { method: 'POST' }, {
      title: 'Estudo',
      steps: [{ habitId: nestedIds[2] }, { habitId: nestedIds[3] }]
    });
    assert.equal(morning.status, 200, morning.data?.error);
    assert.equal(study.status, 200, study.data?.error);
    const morningId = morning.data.routine.id;
    const studyId = study.data.routine.id;

    const lone = await request('/api/routines', { method: 'POST' }, {
      title: 'Só uma',
      steps: [{ routineId: morningId }]
    });
    assert.equal(lone.status, 400);

    const duplicated = await request('/api/routines', { method: 'POST' }, {
      title: 'Repete',
      steps: [{ routineId: morningId }, { routineId: morningId }]
    });
    assert.equal(duplicated.status, 400);

    const ghost = await request('/api/routines', { method: 'POST' }, {
      title: 'Fantasma',
      steps: [{ routineId: 'rt_nope' }, { habitId: nestedIds[0] }]
    });
    assert.equal(ghost.status, 400);

    const day = await request('/api/routines', { method: 'POST' }, {
      title: 'Dia',
      description: 'Manhã e estudo',
      steps: [{ routineId: morningId }, { routineId: studyId }]
    });
    assert.equal(day.status, 200, day.data?.error);
    const dayId = day.data.routine.id;
    assert.equal(day.data.routine.steps[0].kind, 'routine');
    assert.equal(day.data.routine.steps[0].steps.length, 2);
    assert.equal(day.data.routine.steps[0].steps[0].habitId, nestedIds[0]);
    assert.equal(day.data.routine.nextHabitId, nestedIds[0]);
    assert.equal(day.data.routine.progress.total, 4);

    const mixed = await request('/api/routines', { method: 'POST' }, {
      title: 'Manhã e fecho',
      steps: [{ routineId: morningId }, { habitId: nestedIds[4] }]
    });
    assert.equal(mixed.status, 200, mixed.data?.error);
    assert.equal(mixed.data.routine.nextHabitId, nestedIds[0]);
    const mixedId = mixed.data.routine.id;

    const kept = await request(`/api/routines/${dayId}`, { method: 'PUT' }, {
      title: 'Dia',
      steps: day.data.routine.steps.map(step => ({ routineId: step.routineId, note: step.note || '' }))
    });
    assert.equal(kept.status, 200, kept.data?.error);
    assert.equal(kept.data.routine.steps.length, 2);
    assert.equal(kept.data.routine.steps[1].routineId, studyId);

    const skipNested = await request(`/api/routines/${dayId}/advance`, { method: 'POST' }, { habitId: nestedIds[2] });
    assert.equal(skipNested.status, 400);

    const firstNested = await request(`/api/routines/${dayId}/advance`, { method: 'POST' }, { habitId: nestedIds[0], durationMinutes: 3 });
    assert.equal(firstNested.status, 200, firstNested.data?.error);
    assert.equal(firstNested.data.progress.done, 1);
    assert.equal(firstNested.data.routine.nextHabitId, nestedIds[1]);
    assert.equal(firstNested.data.routine.steps[0].doneToday, false);

    const viaChild = await request(`/api/routines/${morningId}/advance`, { method: 'POST' }, {});
    assert.equal(viaChild.status, 200, viaChild.data?.error);
    assert.equal(viaChild.data.completeToday, true);
    const afterChild = await request('/api/state');
    const parent = afterChild.data.routines.find(item => item.id === dayId);
    assert.equal(parent.steps[0].doneToday, true, 'concluir a sub-rotina marca o passo da rotina-mãe');
    assert.equal(parent.nextHabitId, nestedIds[2]);
    const mixedAfter = afterChild.data.routines.find(item => item.id === mixedId);
    assert.equal(mixedAfter.nextHabitId, nestedIds[4], 'o fecho só chega depois da sub-rotina');

    const ego = await request(`/api/routines/${morningId}`, { method: 'PUT' }, {
      title: 'Manhã curta',
      steps: [{ habitId: nestedIds[0] }, { routineId: dayId }]
    });
    assert.equal(ego.status, 400);

    const week = await request('/api/routines', { method: 'POST' }, {
      title: 'Semana',
      steps: [{ routineId: dayId }, { habitId: nestedIds[0] }]
    });
    assert.equal(week.status, 200, week.data?.error);
    assert.equal(week.data.routine.progress.total, 4, 'ritual repetido na sub-rotina não conta duas vezes');

    const month = await request('/api/routines', { method: 'POST' }, {
      title: 'Mês',
      steps: [{ routineId: week.data.routine.id }, { habitId: nestedIds[1] }]
    });
    assert.equal(month.status, 200, month.data?.error);

    const year = await request('/api/routines', { method: 'POST' }, {
      title: 'Ano',
      steps: [{ routineId: month.data.routine.id }, { habitId: nestedIds[2] }]
    });
    assert.equal(year.status, 400, 'o quarto nível de sub-rotina é recusado');

    const finishStudy = await request(`/api/routines/${dayId}/advance`, { method: 'POST' }, {});
    assert.equal(finishStudy.status, 200, finishStudy.data?.error);
    assert.equal(finishStudy.data.habit.id, nestedIds[2]);
    const finishReview = await request(`/api/routines/${dayId}/advance`, { method: 'POST' }, {});
    assert.equal(finishReview.status, 200, finishReview.data?.error);
    assert.equal(finishReview.data.completeToday, true);
    assert.equal(finishReview.data.routine.nextHabitId, null);

    const undoneNested = await request(`/api/routines/${dayId}/advance`, { method: 'POST' }, { habitId: nestedIds[2], undo: true });
    assert.equal(undoneNested.status, 200, undoneNested.data?.error);
    assert.equal(undoneNested.data.routine.nextHabitId, nestedIds[2], 'desmarcar um ritual da sub-rotina devolve o passo');

    const removedStudy = await request(`/api/routines/${studyId}`, { method: 'DELETE' });
    assert.equal(removedStudy.status, 200);
    const afterDetach = await request('/api/state');
    const dayAfter = afterDetach.data.routines.find(item => item.id === dayId);
    assert.ok(dayAfter.steps.every(step => step.routineId !== studyId), 'excluir a sub-rotina tira o passo da rotina-mãe');
    assert.ok(afterDetach.data.habits.some(habit => habit.id === nestedIds[2]), 'excluir a sub-rotina não apaga os rituais');

    console.log('Rotinas: sequência guiada e sub-rotinas ok');
  } finally {
    server.stop();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
