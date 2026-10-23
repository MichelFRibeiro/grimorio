/**
 * Rotinas: playbook ordenado de rituais e de outras rotinas.
 * Criar/editar não concede recompensa. Avançar um passo chama toggleHabit
 * do próximo ritual ainda não feito hoje — mesmo se ele estiver dentro
 * de uma sub-rotina. O ritual é quem grava streak, XP, moedas e Consistência.
 */

import { uid } from '../db.js';
import { addDaysToDateStr, getSaoPauloDateStr } from '../timeUtils.js';
import { completeDailyVictoryUseCase, toggleHabit } from './activities.js';
import { activityPendingMessage, routineActivitySnapshot } from '../../src/utils/routineActivities.js';
import {
  canPlanForDate,
  createDailyVictory,
  findVictoryForRoutine,
  isValidDateStr,
  normalizeRoutineVictoryTitle,
  ROUTINE_VICTORY_SOURCE,
  sanitizeDailyVictories
} from '../../src/utils/dailyVictories.js';
import { routineDaySnapshot, routineVictoryProblem } from '../../src/utils/homeRoutine.js';
import {
  detachHabitFromRoutines,
  detachRoutineFromRoutines,
  findRoutineHabitStep,
  flattenRoutineLeaves,
  nextRoutineLeaf,
  nextRoutineStep,
  normalizeRoutineSteps,
  resolveRoutineSteps,
  routineDayProgress,
  sanitizeRoutine,
  sanitizeRoutines
} from '../../src/utils/routines.js';

function fail(error, status = 400) {
  return { error, status };
}

function ensureList(db) {
  if (!Array.isArray(db.routines)) db.routines = [];
  return db.routines;
}

function catalog(db) {
  const habits = db.habits || [];
  return {
    habits,
    routines: sanitizeRoutines(ensureList(db), habits)
  };
}

function activityMap(db, todayStr) {
  return routineActivitySnapshot(db, todayStr);
}

function nextPointers(next) {
  return {
    nextHabitId: next?.habitId && next.kind !== 'activity' ? next.habitId : null,
    nextActivityId: next?.kind === 'activity' ? next.activityId : null
  };
}

export function listRoutines(db, { todayStr = getSaoPauloDateStr() } = {}) {
  const { habits, routines } = catalog(db);
  const activities = activityMap(db, todayStr);
  return routines.map(routine => decorateRoutine(routine, habits, todayStr, routines, activities));
}

export function decorateRoutine(routine, habits, todayStr, allRoutines = [], activities = null) {
  const resolved = resolveRoutineSteps(routine, habits, todayStr, allRoutines, null, activities);
  const progress = routineDayProgress(resolved);
  const next = nextRoutineLeaf(resolved);
  return {
    ...routine,
    steps: resolved.map(decorateResolvedStep),
    progress,
    ...nextPointers(next),
    completeToday: progress.complete
  };
}

function decorateResolvedStep(step) {
  if (step.kind === 'routine') {
    const child = step.routine;
    const next = nextRoutineStep(flattenRoutineLeaves(step.steps));
    return {
      kind: 'routine',
      routineId: step.routineId,
      note: step.note || '',
      title: child?.title || null,
      icon: child?.icon || 'ListOrdered',
      color: child?.color || '#38bdf8',
      description: child?.description || '',
      missing: !!step.missing,
      doneToday: !!step.doneToday,
      progress: step.progress || routineDayProgress(step.steps),
      ...nextPointers(next),
      steps: (step.steps || []).map(decorateResolvedStep)
    };
  }
  if (step.kind === 'activity') {
    return {
      kind: 'activity',
      activityId: step.activityId,
      note: step.note || '',
      title: step.title || 'Atividade',
      tab: step.tab || '',
      rule: step.rule || '',
      minutes: step.minutes || 0,
      target: step.target || 0,
      count: step.count || 0,
      detail: step.detail || '',
      missing: !!step.missing,
      doneToday: !!step.doneToday
    };
  }
  return {
    kind: 'habit',
    habitId: step.habitId,
    note: step.note || '',
    title: step.habit?.title || null,
    icon: step.habit?.icon || null,
    frequency: step.habit?.frequency || null,
    tracking: step.habit?.tracking || 'time',
    countUnit: step.habit?.countUnit || '',
    category: step.habit?.category || null,
    description: step.habit?.description || '',
    missing: !!step.missing,
    doneToday: !!step.doneToday,
    currentStreak: step.habit?.currentStreak || 0
  };
}

export function createRoutine(db, payload = {}) {
  const title = String(payload.title || '').trim();
  if (!title) return fail('Título da rotina é obrigatório.');
  const habits = db.habits || [];
  const routines = ensureList(db);
  const normalized = normalizeRoutineSteps(payload.steps, habits, routines, null);
  if (normalized.error) return normalized;

  const routine = sanitizeRoutine({
    id: uid('rt'),
    title,
    description: payload.description,
    icon: payload.icon || 'ListOrdered',
    color: payload.color,
    steps: normalized.steps,
    createdAt: new Date().toISOString(),
    updatedAt: null
  });
  if (!routine) return fail('Não foi possível criar a rotina.');
  routines.unshift(routine);
  const todayStr = getSaoPauloDateStr();
  return {
    routine: decorateRoutine(routine, habits, todayStr, sanitizeRoutines(routines, habits), activityMap(db, todayStr))
  };
}

export function updateRoutine(db, id, payload = {}) {
  const routines = ensureList(db);
  const index = routines.findIndex(item => item.id === id);
  if (index === -1) return fail('Rotina não encontrada.', 404);
  const current = routines[index];

  const title = payload.title !== undefined ? String(payload.title || '').trim() : current.title;
  if (!title) return fail('Título da rotina é obrigatório.');

  let steps = current.steps;
  if (payload.steps !== undefined) {
    const normalized = normalizeRoutineSteps(payload.steps, db.habits || [], routines, id);
    if (normalized.error) return normalized;
    steps = normalized.steps;
  }

  const next = sanitizeRoutine({
    ...current,
    title,
    description: payload.description !== undefined ? payload.description : current.description,
    icon: payload.icon !== undefined ? payload.icon : current.icon,
    color: payload.color !== undefined ? payload.color : current.color,
    steps,
    updatedAt: new Date().toISOString()
  });
  if (!next) return fail('Não foi possível atualizar a rotina.');
  routines[index] = next;
  const todayStr = getSaoPauloDateStr();
  return {
    routine: decorateRoutine(next, db.habits || [], todayStr, sanitizeRoutines(routines, db.habits || []), activityMap(db, todayStr))
  };
}

export function deleteRoutine(db, id) {
  const routines = ensureList(db);
  const index = routines.findIndex(item => item.id === id);
  if (index === -1) return fail('Rotina não encontrada.', 404);
  const [removed] = routines.splice(index, 1);
  db.routines = detachRoutineFromRoutines(routines, id);
  // Vitórias planejadas desta rotina que ninguém conquistou: a rotina deixou
  // de existir, então não há mais execução para reconhecer. As conquistadas
  // ficam no histórico (foram pagas e aconteceram).
  const victoryCleanup = removeRoutineVictories(db, id);
  // A rotina escolhida para a tela inicial deixa de existir: o cartão passa a
  // explicar em vez de apontar para um fantasma.
  if (db.userProfile && db.userProfile.homeRoutineId === id) {
    db.userProfile.homeRoutineId = null;
  }
  return { removed, removedVictories: victoryCleanup.removed };
}

/**
 * Marca o próximo ritual ainda não feito hoje, ou o passo indicado se for
 * exatamente o próximo — inclusive dentro de uma sub-rotina.
 * `undo: true` desmarca um ritual já feito hoje, em qualquer ramo.
 * O estorno de XP e moedas é o do próprio ritual.
 */
export function advanceRoutine(db, id, { habitId, durationMinutes, count, note, decisionId, undo } = {}) {
  if (undo) return undoRoutineStep(db, id, { habitId });
  const { habits, routines } = catalog(db);
  const routine = routines.find(item => item.id === id);
  if (!routine) return fail('Rotina não encontrada.', 404);

  const todayStr = getSaoPauloDateStr();
  const activities = activityMap(db, todayStr);
  const resolved = resolveRoutineSteps(routine, habits, todayStr, routines, null, activities);
  const next = nextRoutineLeaf(resolved);
  if (!next) return fail('A sequência de hoje já foi concluída.');
  if (next.kind === 'activity') return fail(activityPendingMessage(activities[next.activityId] || next));
  if (habitId && habitId !== next.habitId) {
    return fail('Este passo ainda não é o próximo da sequência.');
  }

  const toggled = toggleHabit(db, {
    id: next.habitId,
    date: todayStr,
    durationMinutes,
    count,
    note,
    decisionId
  });
  if (toggled.error) return toggled;
  if (!toggled.done) return fail('O próximo ritual já estava marcado hoje.');

  const freshHabits = db.habits || [];
  const fresh = resolveRoutineSteps(routine, freshHabits, todayStr, routines, null, activities);
  const progress = routineDayProgress(fresh);
  return {
    routine: decorateRoutine(routine, freshHabits, todayStr, routines, activities),
    step: findRoutineHabitStep(fresh, next.habitId),
    habit: toggled.habit,
    rewardResult: toggled.rewardResult,
    progress,
    completeToday: progress.complete
  };
}

export function undoRoutineStep(db, id, { habitId } = {}) {
  const { habits, routines } = catalog(db);
  const routine = routines.find(item => item.id === id);
  if (!routine) return fail('Rotina não encontrada.', 404);
  const todayStr = getSaoPauloDateStr();
  const activities = activityMap(db, todayStr);
  const resolved = resolveRoutineSteps(routine, habits, todayStr, routines, null, activities);
  const step = findRoutineHabitStep(resolved, habitId);
  if (!step || step.missing) return fail('Este ritual não faz parte da sequência.');
  if (!step.doneToday) return fail('Este passo ainda não foi feito hoje.');

  const toggled = toggleHabit(db, { id: habitId, date: todayStr });
  if (toggled.error) return toggled;
  if (toggled.done) return fail('Não foi possível desmarcar o ritual.');

  const freshHabits = db.habits || [];
  const fresh = resolveRoutineSteps(routine, freshHabits, todayStr, routines, null, activities);
  const progress = routineDayProgress(fresh);
  return {
    routine: decorateRoutine(routine, freshHabits, todayStr, routines, activities),
    step: findRoutineHabitStep(fresh, habitId),
    habit: toggled.habit,
    rewardResult: toggled.rewardResult,
    undone: true,
    progress,
    completeToday: progress.complete
  };
}

export function removeHabitFromRoutines(db, habitId) {
  if (!Array.isArray(db.routines) || !habitId) return;
  db.routines = detachHabitFromRoutines(db.routines, habitId);
}

// ---------------------------------------------------------------------------
// Execução integral de uma rotina como Vitória Planejada para o Dia
//
// Planejar não paga nada: o registro é uma vaga manual do dia (uma das 3),
// com `source: 'routine'` e o `routineId`. Conquistar paga como uma vitória
// comum (+ XP e moedas), mas só depois que o SERVIDOR confere que todos os
// passos da rotina foram cumpridos hoje — rituais marcados e atividades
// (Biblioteca, Escrituras, AGU, Diário, Review) reconhecidas.
// Desmarcar um ritual depois não estorna a vitória sozinho: reabrir a vitória
// é ato explícito. Excluir a rotina leva junto as vitórias dela que ainda não
// foram conquistadas; as conquistadas continuam no histórico (foram feitas).
// ---------------------------------------------------------------------------

/** Id estável da vitória de uma rotina: mesma rotina, mesmo cartão no dia. */
export function routineVictoryId(routineId) {
  return `dv-routine-${String(routineId || '').trim()}`;
}

function findRoutineCatalog(db, routineId) {
  const habits = db.habits || [];
  const routines = sanitizeRoutines(ensureList(db), habits);
  const routine = routines.find(item => item.id === routineId) || null;
  if (!routine) return { error: 'Rotina não encontrada.', status: 404 };
  return { routine, routines, habits };
}

/**
 * Foto da execução da rotina numa data. `live` marca o próprio dia: só nele a
 * execução pode ser conferida (uma vitória de amanhã mostra o plano, não o
 * resultado). `complete` é o que a confirmação da vitória exige.
 */
export function routineVictorySnapshot(db, routineId, date = getSaoPauloDateStr()) {
  const found = findRoutineCatalog(db, routineId);
  if (found.error) return found;
  const { routine, routines, habits } = found;
  const activities = activityMap(db, date);
  const snapshot = routineDaySnapshot(routine, habits, routines, date, activities);
  return {
    status: 'ok',
    routine: decorateRoutine(routine, habits, date, routines, activities),
    date,
    total: snapshot.progress.total,
    done: snapshot.progress.done,
    missing: snapshot.progress.missing,
    complete: snapshot.progress.complete,
    live: date === getSaoPauloDateStr()
  };
}

/** Prontidão da vitória: pendente, pronta (todos os passos do dia), vazia ou fechada. */
export function routineVictoryReadiness(db, routineId, date = getSaoPauloDateStr()) {
  const snap = routineVictorySnapshot(db, routineId, date);
  if (snap.error) {
    return { status: 'missing', error: snap.error, routine: null, date, total: 0, done: 0, missing: 0, live: false };
  }
  let status = 'pending';
  if (!snap.total) status = 'empty';
  else if (!snap.live) status = 'closed';
  else if (snap.complete) status = 'ready';
  return { ...snap, status };
}

/**
 * Planeja a execução da rotina como vitória do dia.
 * A rotina ocupa uma vaga manual: o dia continua com 3 vagas no total, e a
 * rotina entra em qualquer uma delas (inclusive no lugar de uma tarefa que
 * ainda não foi planejada).
 */
export function planRoutineVictory(db, routineId, { date, category } = {}) {
  const found = findRoutineCatalog(db, routineId);
  if (found.error) return found;
  const { routine } = found;
  const problem = routineVictoryProblem(routine);
  if (problem) return fail(problem);

  const todayStr = getSaoPauloDateStr();
  const targetDate = isValidDateStr(date) ? date : todayStr;
  if (!canPlanForDate(targetDate, todayStr)) {
    return fail('Só é possível planejar para hoje ou para amanhã.');
  }
  db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);

  // Já planejada neste dia: devolve a existente em vez de duplicar.
  const existing = findVictoryForRoutine(db.dailyVictories, routineId, targetDate);
  if (existing) {
    return {
      victory: existing,
      created: false,
      readiness: routineVictoryReadiness(db, routineId, targetDate)
    };
  }

  const defaultCat = String(category || '').trim() || db.questCategories?.[0]?.name || 'Pessoal';
  let result;
  try {
    result = createDailyVictory(db.dailyVictories, {
      title: normalizeRoutineVictoryTitle(routine.title),
      category: defaultCat,
      date: targetDate,
      routineId
    }, { today: todayStr, defaultCategory: defaultCat });
  } catch (err) {
    return fail(err.message);
  }
  db.dailyVictories = result.list;
  return {
    victory: result.victory,
    created: true,
    readiness: routineVictoryReadiness(db, routineId, targetDate)
  };
}

/** Conquista a vitória da rotina — só com a rotina inteira cumprida hoje. */
export async function completeRoutineVictory(db, routineId, { date = getSaoPauloDateStr(), note } = {}) {
  const found = findRoutineCatalog(db, routineId);
  if (found.error) return found;
  const { routine } = found;

  db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
  const victory = findVictoryForRoutine(db.dailyVictories, routineId, date);
  if (!victory) return fail('A execução desta rotina não está nas vitórias planejadas deste dia.', 404);
  if (victory.completed) return fail('Esta vitória já foi conquistada.');

  const snap = routineVictorySnapshot(db, routineId, date);
  if (snap.error) return snap;
  if (!snap.live) return fail('Só é possível registrar a vitória no próprio dia planejado.');
  if (!snap.total) return fail('Esta rotina não tem passos válidos para reconhecer no dia.');
  if (!snap.complete) {
    return fail(`Faltam ${snap.total - snap.done} de ${snap.total} passos da rotina para hoje.`);
  }

  const text = note != null && String(note).trim()
    ? String(note).trim()
    : `Rotina "${routine.title}" cumprida inteira hoje.`;
  const result = await completeDailyVictoryUseCase(db, {
    id: victory.id,
    completed: true,
    note: text
  });
  if (result.error) return result;
  return {
    ...result,
    readiness: routineVictoryReadiness(db, routineId, date)
  };
}

/** Reabrir a vitória da rotina estorna o que ela pagou; os rituais ficam. */
export async function reopenRoutineVictory(db, routineId, { date = getSaoPauloDateStr() } = {}) {
  const found = findRoutineCatalog(db, routineId);
  if (found.error) return found;
  db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
  const victory = findVictoryForRoutine(db.dailyVictories, routineId, date);
  if (!victory) return fail('A execução desta rotina não está nas vitórias planejadas deste dia.', 404);
  if (!victory.completed) return fail('Esta vitória ainda não foi conquistada.');
  const result = await completeDailyVictoryUseCase(db, { id: victory.id, completed: false });
  if (result.error) return result;
  return { ...result, readiness: routineVictoryReadiness(db, routineId, date) };
}

/** Rotinas planejadas nos dias que ainda podem ser editados (hoje e amanhã). */
export function listRoutinePlans(db, date = getSaoPauloDateStr()) {
  const targets = [date, addDaysToDateStr(date, 1)];
  return sanitizeDailyVictories(db.dailyVictories)
    .filter(item => item.source === ROUTINE_VICTORY_SOURCE && targets.includes(item.date))
    .map(item => ({
      victoryId: item.id,
      routineId: item.routineId,
      date: item.date,
      completed: !!item.completed,
      readiness: routineVictoryReadiness(db, item.routineId, item.date)
    }));
}

/**
 * Rotina excluída: as vitórias dela que ainda NÃO foram conquistadas somem
 * (a rotina não existe mais para ser cumprida). As conquistadas ficam: são
 * histórico de um dia que aconteceu. Chamar antes de gravar a exclusão.
 */
export function removeRoutineVictories(db, routineId) {
  if (!Array.isArray(db.dailyVictories) || !routineId) return { removed: [] };
  const current = sanitizeDailyVictories(db.dailyVictories);
  const removed = current.filter(item => (
    item.source === ROUTINE_VICTORY_SOURCE && item.routineId === routineId && !item.completed
  ));
  if (!removed.length) return { removed: [] };
  const ids = new Set(removed.map(item => item.id));
  db.dailyVictories = current.filter(item => !ids.has(item.id));
  return { removed };
}
