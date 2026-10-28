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
  nextRoutineLeaf,
  resolveRoutineSteps,
  routineDayProgress,
  sanitizeRoutines,
  routineLinkError
} from '../src/utils/routines.js';
import { routineActivitySnapshot } from '../src/utils/routineActivities.js';
import { addDaysToDateStr, getSaoPauloDateStr } from './timeUtils.js';

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

  const today = '2026-04-12';
  const short = routineActivitySnapshot({
    readingSessions: [{ date: today, durationMinutes: 10 }],
    scriptureSessions: [{ date: today, durationMinutes: 10 }],
    journalEntries: [],
    examQuestions: [{ id: 'q', subjectId: 'constitucional', date: today, durationMinutes: 10, totalQuestions: 1 }]
  }, today);
  assert.equal(short.reading.done, false, `leitura abaixo do setpoint (${short.reading.detail})`);
  assert.equal(short.scripture.done, false);
  assert.equal(short.journal.done, false, 'diário vazio não conclui');
  assert.equal(short.agu.done, false, `AGU abaixo do setpoint (${short.agu.detail})`);
  assert.ok(short.reading.target >= 15, `setpoint de leitura veio ${short.reading.target}`);

  const met = routineActivitySnapshot({
    readingSessions: [{ date: today, durationMinutes: short.reading.target }],
    scriptureSessions: [{ date: today, durationMinutes: short.scripture.target }],
    journalEntries: [{ id: 'p1', date: today, body: 'uma página' }],
    examQuestions: [{ id: 'q2', subjectId: 'constitucional', date: today, durationMinutes: short.agu.target, totalQuestions: 1 }]
  }, today);
  assert.equal(met.reading.done, true, met.reading.detail);
  assert.equal(met.scripture.done, true, met.scripture.detail);
  assert.equal(met.journal.done, true, met.journal.detail);
  assert.equal(met.journal.detail, '1 página hoje');
  assert.equal(met.agu.done, true, met.agu.detail);
  assert.equal(met['supplement-review'].done, false, 'review ausente não conclui');
  assert.equal(met['supplement-review'].label, 'Review de Suplementos');

  const reviewed = routineActivitySnapshot({
    supplements: [{ id: 's1', name: 'Omega 3', archived: false }],
    supplementReviews: [{
      date: today,
      answers: [{ supplementId: 's1', taken: false }]
    }]
  }, today);
  assert.equal(reviewed['supplement-review'].done, true, reviewed['supplement-review'].detail);
  assert.equal(reviewed['supplement-review'].detail, '0 sim · 1 não');
  assert.equal(reviewed['supplement-review'].tab, 'supplements');
}

function assertSchedule() {
  const tuesday = '2026-03-24';
  const wednesday = '2026-03-25';
  const thursday = '2026-03-26';
  const saturday = '2026-03-28';
  const sei = {
    id: 'sei',
    title: 'Limpar SEI',
    frequency: 'times_per_week',
    targetTimesPerWeek: 3,
    weekDays: [1, 3, 5],
    history: ['2026-03-23']
  };
  const agua = { id: 'agua', title: 'Água', frequency: 'daily', history: [] };
  const routine = {
    id: 'manha',
    title: 'Manhã',
    steps: [
      { kind: 'habit', habitId: 'sei' },
      { kind: 'habit', habitId: 'agua' },
      { kind: 'activity', activityId: 'journal' }
    ]
  };

  const onTrack = resolveRoutineSteps(routine, [sei, agua], tuesday);
  assert.equal(onTrack[0].expectedToday, false, 'terça em dia não espera o ritual de Seg/Qua/Sex');
  assert.equal(onTrack[1].expectedToday, true, 'ritual diário continua esperado');
  assert.equal(onTrack[2].expectedToday, true, 'atividade não tem agenda e continua esperada');
  const onTrackProgress = routineDayProgress(onTrack);
  assert.equal(onTrackProgress.total, 2, 'o ritual fora do dia sai da conta');
  assert.equal(onTrackProgress.resting, 1);
  assert.equal(onTrackProgress.complete, false);
  assert.equal(nextRoutineLeaf(onTrack).habitId, 'agua', 'o próximo passo pula o ritual que não é de hoje');

  const late = resolveRoutineSteps(routine, [{ ...sei, history: [] }, agua], tuesday);
  assert.equal(late[0].expectedToday, true, 'terça espera o ritual se a segunda foi perdida');
  assert.equal(routineDayProgress(late).total, 3);

  const scheduled = resolveRoutineSteps(routine, [sei, agua], wednesday);
  assert.equal(scheduled[0].expectedToday, true, 'quarta prevista entra mesmo em dia');

  const doneOnDay = resolveRoutineSteps(routine, [{
    ...sei,
    history: ['2026-03-23', wednesday]
  }, { ...agua, history: [wednesday] }], wednesday);
  assert.equal(doneOnDay[0].expectedToday, true, 'feito no dia previsto continua na conta, como feito');
  assert.equal(doneOnDay[0].doneToday, true);
  assert.equal(routineDayProgress(doneOnDay).done, 2);
  assert.equal(routineDayProgress(doneOnDay).complete, false, 'falta a atividade');

  const catchUp = resolveRoutineSteps(routine, [{
    ...sei,
    history: ['2026-03-23', '2026-03-25']
  }, agua], saturday);
  assert.equal(catchUp[0].expectedToday, true, 'sábado recupera a sexta perdida');

  const quotaMet = resolveRoutineSteps(routine, [{
    ...sei,
    history: ['2026-03-23', '2026-03-25', '2026-03-27']
  }, { ...agua, history: [saturday] }], saturday);
  assert.equal(quotaMet[0].expectedToday, false, 'meta 3/3 já batida não volta no sábado');
  assert.equal(routineDayProgress(quotaMet).complete, false, 'ainda falta a atividade');
  const quotaWithoutActivity = resolveRoutineSteps({
    ...routine,
    steps: routine.steps.filter(step => step.activityId !== 'journal')
  }, [{
    ...sei,
    history: ['2026-03-23', '2026-03-25', '2026-03-27']
  }, { ...agua, history: [saturday] }], saturday);
  assert.equal(routineDayProgress(quotaWithoutActivity).complete, true, 'só o diário feito basta quando o 3x/sem já fechou');

  const flexible = resolveRoutineSteps(routine, [{
    id: 'sei',
    title: 'Limpar SEI',
    frequency: 'times_per_week',
    targetTimesPerWeek: 3,
    history: []
  }, agua], tuesday);
  assert.equal(flexible[0].expectedToday, true, '3x/sem sem dias previstos continua devido qualquer dia');

  const weeklyOff = resolveRoutineSteps({
    id: 'sem',
    title: 'Semana',
    steps: [{ kind: 'habit', habitId: 'sem' }]
  }, [{ id: 'sem', title: 'Revisão', frequency: 'weekly', weekDays: [3], history: [] }], tuesday);
  assert.equal(weeklyOff[0].expectedToday, false, 'semanal de quarta não entra na terça');

  const weeklyLate = resolveRoutineSteps({
    id: 'sem',
    title: 'Semana',
    steps: [{ kind: 'habit', habitId: 'sem' }]
  }, [{ id: 'sem', title: 'Revisão', frequency: 'weekly', weekDays: [3], history: [] }], thursday);
  assert.equal(weeklyLate[0].expectedToday, true, 'semanal de quarta entra na quinta se atrasou');

  const weekend = resolveRoutineSteps({
    id: 'util',
    title: 'Útil',
    steps: [{ kind: 'habit', habitId: 'util' }]
  }, [{ id: 'util', title: 'Expediente', frequency: 'weekdays', history: [] }], saturday);
  assert.equal(weekend[0].expectedToday, false, 'dias úteis não entram no sábado');

  const child = {
    id: 'filho',
    title: 'SEI',
    steps: [{ kind: 'habit', habitId: 'sei' }]
  };
  const parent = {
    id: 'pai',
    title: 'Dia',
    steps: [{ kind: 'routine', routineId: 'filho' }, { kind: 'habit', habitId: 'agua' }]
  };
  const nested = resolveRoutineSteps(parent, [sei, agua], tuesday, [child, parent]);
  assert.equal(nested[0].expectedToday, false, 'sub-rotina só com ritual fora do dia não é esperada');
  assert.equal(routineDayProgress(nested).total, 1);
  assert.equal(nextRoutineLeaf(nested).habitId, 'agua');
}

async function run() {
  assertModel();
  assertSchedule();
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

    const anchor = await request('/api/habits', { method: 'POST' }, { title: 'Abrir o dia', frequency: 'daily' });
    assert.equal(anchor.status, 200, anchor.data?.error);
    const anchorId = anchor.data.habit.id;
    const book = await request('/api/books', { method: 'POST' }, { title: 'Um livro', totalPages: 80 });
    assert.equal(book.status, 200, book.data?.error || book.raw);
    const bookId = book.data.book?.id || book.data.id;
    assert.ok(bookId, 'livro criado');

    const dayWork = await request('/api/routines', { method: 'POST' }, {
      title: 'Estudo do dia',
      steps: [
        { habitId: anchorId },
        { activityId: 'reading' },
        { activityId: 'scripture' },
        { activityId: 'journal' },
        { activityId: 'agu' }
      ]
    });
    assert.equal(dayWork.status, 200, dayWork.data?.error);
    const dayWorkId = dayWork.data.routine.id;
    assert.equal(dayWork.data.routine.nextHabitId, anchorId);
    assert.equal(dayWork.data.routine.steps[1].kind, 'activity');
    assert.equal(dayWork.data.routine.steps[1].activityId, 'reading');
    assert.equal(dayWork.data.routine.steps[1].doneToday, false);
    assert.ok(dayWork.data.routine.steps[1].target >= 15);

    const repeatActivity = await request('/api/routines', { method: 'POST' }, {
      title: 'Repete atividade',
      steps: [{ activityId: 'journal' }, { activityId: 'journal' }]
    });
    assert.equal(repeatActivity.status, 400);

    const forced = await request(`/api/routines/${dayWorkId}/advance`, { method: 'POST' }, { habitId: anchorId });
    assert.equal(forced.status, 200, forced.data?.error);
    assert.equal(forced.data.routine.nextActivityId, 'reading');
    assert.equal(forced.data.routine.nextHabitId, null);

    const blocked = await request(`/api/routines/${dayWorkId}/advance`, { method: 'POST' }, {});
    assert.equal(blocked.status, 400, 'atividade não é marcada pela rotina');

    const shortRead = await request(`/api/books/${bookId}/reading-session`, { method: 'POST' }, {
      startPage: 1,
      endPage: 2,
      durationMinutes: 10
    });
    assert.equal(shortRead.status, 200, shortRead.data?.error);
    const afterShort = await request('/api/state');
    const stillReading = afterShort.data.routines.find(item => item.id === dayWorkId);
    assert.equal(stillReading.nextActivityId, 'reading', stillReading.steps.find(step => step.activityId === 'reading')?.detail);
    assert.equal(stillReading.steps.find(step => step.activityId === 'reading').doneToday, false);

    const enoughRead = await request(`/api/books/${bookId}/reading-session`, { method: 'POST' }, {
      startPage: 2,
      endPage: 4,
      durationMinutes: stillReading.steps.find(step => step.activityId === 'reading').target
    });
    assert.equal(enoughRead.status, 200, enoughRead.data?.error);
    const afterRead = await request('/api/state');
    const readingDone = afterRead.data.routines.find(item => item.id === dayWorkId);
    assert.equal(readingDone.steps.find(step => step.activityId === 'reading').doneToday, true);
    assert.equal(readingDone.nextActivityId, 'scripture');

    const shortScripture = await request('/api/scripture/sessions', { method: 'POST' }, {
      startBookId: 'joa',
      startChapter: 1,
      startVerse: 1,
      endBookId: 'joa',
      endChapter: 1,
      endVerse: 5,
      durationMinutes: 10
    });
    assert.equal(shortScripture.status, 200, shortScripture.data?.error);
    const midScripture = await request('/api/state');
    assert.equal(midScripture.data.routines.find(item => item.id === dayWorkId).nextActivityId, 'scripture');

    const scriptureTarget = midScripture.data.routines
      .find(item => item.id === dayWorkId)
      .steps.find(step => step.activityId === 'scripture').target;
    const enoughScripture = await request('/api/scripture/sessions', { method: 'POST' }, {
      startBookId: 'joa',
      startChapter: 1,
      startVerse: 6,
      endBookId: 'joa',
      endChapter: 1,
      endVerse: 10,
      durationMinutes: scriptureTarget
    });
    assert.equal(enoughScripture.status, 200, enoughScripture.data?.error);
    const afterScripture = await request('/api/state');
    const scriptureDone = afterScripture.data.routines.find(item => item.id === dayWorkId);
    assert.equal(scriptureDone.steps.find(step => step.activityId === 'scripture').doneToday, true);
    assert.equal(scriptureDone.nextActivityId, 'journal');

    const page = await request('/api/journal', { method: 'POST' }, { body: 'Uma linha basta.' });
    assert.equal(page.status, 200, page.data?.error);
    const afterJournal = await request('/api/state');
    const journalDone = afterJournal.data.routines.find(item => item.id === dayWorkId);
    assert.equal(journalDone.steps.find(step => step.activityId === 'journal').doneToday, true);
    assert.equal(journalDone.nextActivityId, 'agu');

    const aguTarget = journalDone.steps.find(step => step.activityId === 'agu').target;
    const aguStudy = await request('/api/questions', { method: 'POST' }, {
      subject: 'Direito Constitucional',
      topic: 'Controle de Constitucionalidade',
      totalQuestions: 5,
      correctAnswers: 4,
      durationMinutes: aguTarget
    });
    assert.equal(aguStudy.status, 200, aguStudy.data?.error);
    const afterAgu = await request('/api/state');
    const finished = afterAgu.data.routines.find(item => item.id === dayWorkId);
    assert.equal(finished.steps.find(step => step.activityId === 'agu').doneToday, true, finished.steps.find(step => step.activityId === 'agu')?.detail);
    assert.equal(finished.completeToday, true);
    assert.equal(finished.nextActivityId, null);
    assert.equal(finished.nextHabitId, null);

    const omega = await request('/api/supplements', { method: 'POST' }, { name: 'Omega Review', defaultDose: 1 });
    assert.equal(omega.status, 200, omega.data?.error);
    const reviewRoutine = await request('/api/routines', { method: 'POST' }, {
      title: 'Review do dia',
      steps: [{ activityId: 'journal' }, { activityId: 'supplement-review' }]
    });
    assert.equal(reviewRoutine.status, 200, reviewRoutine.data?.error);
    const reviewRoutineId = reviewRoutine.data.routine.id;
    assert.equal(reviewRoutine.data.routine.nextActivityId, 'supplement-review');
    assert.equal(
      reviewRoutine.data.routine.steps.find(step => step.activityId === 'supplement-review').doneToday,
      false
    );

    const reviewedDay = await request('/api/supplement-reviews', { method: 'POST' }, {
      date: getSaoPauloDateStr(),
      answers: [{ supplementId: omega.data.supplement.id, taken: false }]
    });
    assert.equal(reviewedDay.status, 200, reviewedDay.data?.error);
    const afterReview = await request('/api/state');
    const reviewDone = afterReview.data.routines.find(item => item.id === reviewRoutineId);
    assert.equal(reviewDone.steps.find(step => step.activityId === 'supplement-review').doneToday, true);
    assert.equal(reviewDone.completeToday, true);
    assert.equal(reviewDone.nextActivityId, null);

    const today = getSaoPauloDateStr();
    const todayDow = new Date(`${today}T12:00:00Z`).getUTCDay();
    const monday = addDaysToDateStr(today, (todayDow === 0 ? -6 : 1) - todayDow);
    const dateOfWeekday = (dow) => addDaysToDateStr(monday, dow === 0 ? 6 : dow - 1);
    const otherDays = [1, 2, 3, 4, 5, 6, 0].filter(dow => dow !== todayDow);
    const scheduledDays = otherDays.slice(0, 2);
    const sei = await request('/api/habits', { method: 'POST' }, {
      title: 'Limpar SEI',
      frequency: 'times_per_week',
      weekDays: scheduledDays
    });
    const aguaDia = await request('/api/habits', { method: 'POST' }, {
      title: 'Água do dia',
      frequency: 'daily'
    });
    assert.equal(sei.status, 200, sei.data?.error);
    assert.equal(aguaDia.status, 200, aguaDia.data?.error);
    const seiId = sei.data.habit.id;
    const aguaDiaId = aguaDia.data.habit.id;
    for (const dow of scheduledDays) {
      const date = dateOfWeekday(dow);
      if (date >= today) continue;
      const marked = await request(`/api/habits/${seiId}/toggle`, { method: 'POST' }, { date });
      assert.equal(marked.status, 200, marked.data?.error);
      assert.equal(marked.data.done, true);
    }

    const expediente = await request('/api/routines', { method: 'POST' }, {
      title: 'Expediente',
      steps: [{ habitId: seiId }, { habitId: aguaDiaId }]
    });
    assert.equal(expediente.status, 200, expediente.data?.error);
    assert.equal(expediente.data.routine.steps[0].expectedToday, false, 'ritual em dia, fora do dia previsto, não é esperado');
    assert.equal(expediente.data.routine.progress.total, 1);
    assert.equal(expediente.data.routine.progress.resting, 1);
    assert.equal(expediente.data.routine.nextHabitId, aguaDiaId);
    assert.equal(expediente.data.routine.completeToday, false);

    const aguaFeita = await request(`/api/routines/${expediente.data.routine.id}/advance`, { method: 'POST' }, {
      habitId: aguaDiaId
    });
    assert.equal(aguaFeita.status, 200, aguaFeita.data?.error);
    assert.equal(aguaFeita.data.completeToday, true, 'a rotina fecha sem o ritual que não é de hoje');

    const planned = await request(`/api/routines/${expediente.data.routine.id}/plan`, { method: 'POST' }, {});
    assert.equal(planned.status, 200, planned.data?.error);
    const conquered = await request(`/api/routines/${expediente.data.routine.id}/complete`, { method: 'POST' }, {});
    assert.equal(conquered.status, 200, conquered.data?.error);

    const earlier = otherDays.find(dow => dateOfWeekday(dow) < today);
    if (earlier != null) {
      const arquivo = await request('/api/habits', { method: 'POST' }, {
        title: 'Arquivo',
        frequency: 'times_per_week',
        weekDays: [earlier]
      });
      assert.equal(arquivo.status, 200, arquivo.data?.error);
      const atraso = await request('/api/routines', { method: 'POST' }, {
        title: 'Atraso',
        steps: [{ habitId: arquivo.data.habit.id }, { habitId: aguaDiaId }]
      });
      assert.equal(atraso.status, 200, atraso.data?.error);
      assert.equal(atraso.data.routine.steps[0].expectedToday, true, 'dia previsto já passado continua esperado');
      assert.equal(atraso.data.routine.nextHabitId, arquivo.data.habit.id);
      assert.equal(atraso.data.routine.completeToday, false);
      assert.equal(atraso.data.routine.progress.total, 2);
      assert.equal(atraso.data.routine.progress.done, 1);
    }

    console.log('Rotinas: sequência guiada e sub-rotinas ok');
  } finally {
    server.stop();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
