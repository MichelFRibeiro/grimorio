/**
 * Rotinas: sequência guiada de rituais.
 * Avançar marca o ritual (XP/streak) e recusa passo fora de ordem.
 * A rotina em si não cria um segundo lançamento de recompensa.
 */
import './testEnv.js';
import assert from 'node:assert/strict';
import { startTestServer } from './testEnv.js';
import http from 'http';

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

async function run() {
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

    console.log('Rotinas: sequência guiada ok');
  } finally {
    server.stop();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
