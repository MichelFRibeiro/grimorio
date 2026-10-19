/**
 * Rotinas: playbook ordenado de rituais e de outras rotinas.
 * Criar/editar não concede recompensa. Avançar um passo chama toggleHabit
 * do próximo ritual ainda não feito hoje — mesmo se ele estiver dentro
 * de uma sub-rotina. O ritual é quem grava streak, XP, moedas e Consistência.
 */

import { uid } from '../db.js';
import { getSaoPauloDateStr } from '../timeUtils.js';
import { toggleHabit } from './activities.js';
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

export function listRoutines(db, { todayStr = getSaoPauloDateStr() } = {}) {
  const { habits, routines } = catalog(db);
  return routines.map(routine => decorateRoutine(routine, habits, todayStr, routines));
}

export function decorateRoutine(routine, habits, todayStr, allRoutines = []) {
  const resolved = resolveRoutineSteps(routine, habits, todayStr, allRoutines);
  const progress = routineDayProgress(resolved);
  const next = nextRoutineLeaf(resolved);
  return {
    ...routine,
    steps: resolved.map(decorateResolvedStep),
    progress,
    nextHabitId: next?.habitId || null,
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
      nextHabitId: next?.habitId || null,
      steps: (step.steps || []).map(decorateResolvedStep)
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
  return { routine: decorateRoutine(routine, habits, todayStr, sanitizeRoutines(routines, habits)) };
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
  return { routine: decorateRoutine(next, db.habits || [], todayStr, sanitizeRoutines(routines, db.habits || [])) };
}

export function deleteRoutine(db, id) {
  const routines = ensureList(db);
  const index = routines.findIndex(item => item.id === id);
  if (index === -1) return fail('Rotina não encontrada.', 404);
  const [removed] = routines.splice(index, 1);
  db.routines = detachRoutineFromRoutines(routines, id);
  return { removed };
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
  const resolved = resolveRoutineSteps(routine, habits, todayStr, routines);
  const next = nextRoutineLeaf(resolved);
  if (!next) return fail('A sequência de hoje já foi concluída.');
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
  const fresh = resolveRoutineSteps(routine, freshHabits, todayStr, routines);
  const progress = routineDayProgress(fresh);
  return {
    routine: decorateRoutine(routine, freshHabits, todayStr, routines),
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
  const resolved = resolveRoutineSteps(routine, habits, todayStr, routines);
  const step = findRoutineHabitStep(resolved, habitId);
  if (!step || step.missing) return fail('Este ritual não faz parte da sequência.');
  if (!step.doneToday) return fail('Este passo ainda não foi feito hoje.');

  const toggled = toggleHabit(db, { id: habitId, date: todayStr });
  if (toggled.error) return toggled;
  if (toggled.done) return fail('Não foi possível desmarcar o ritual.');

  const freshHabits = db.habits || [];
  const fresh = resolveRoutineSteps(routine, freshHabits, todayStr, routines);
  const progress = routineDayProgress(fresh);
  return {
    routine: decorateRoutine(routine, freshHabits, todayStr, routines),
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
