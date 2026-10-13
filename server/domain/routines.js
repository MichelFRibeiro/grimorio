/**
 * Rotinas: playbook ordenado de rituais.
 * Criar/editar não concede recompensa. Avançar um passo chama toggleHabit,
 * que é quem grava streak, XP, moedas e Consistência do ritual.
 */

import { uid } from '../db.js';
import { getSaoPauloDateStr } from '../timeUtils.js';
import { toggleHabit } from './activities.js';
import {
  MAX_ROUTINE_STEPS,
  detachHabitFromRoutines,
  nextRoutineStep,
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

function normalizeSteps(rawSteps, habits) {
  if (!Array.isArray(rawSteps)) return fail('Informe a sequência de rituais.');
  const habitIds = new Set((habits || []).map(h => h.id));
  const seen = new Set();
  const steps = [];
  for (const step of rawSteps) {
    const habitId = String(step?.habitId || step?.id || '').trim();
    if (!habitId) continue;
    if (seen.has(habitId)) return fail('A rotina não pode repetir o mesmo ritual.');
    if (!habitIds.has(habitId)) return fail('Um dos rituais da sequência não existe.');
    seen.add(habitId);
    steps.push({
      habitId,
      note: String(step?.note || '').trim().slice(0, 240)
    });
    if (steps.length > MAX_ROUTINE_STEPS) {
      return fail(`Uma rotina tem no máximo ${MAX_ROUTINE_STEPS} passos.`);
    }
  }
  if (steps.length < 2) return fail('Uma rotina precisa de pelo menos 2 rituais em sequência.');
  return { steps };
}

export function listRoutines(db, { todayStr = getSaoPauloDateStr() } = {}) {
  const routines = sanitizeRoutines(ensureList(db), db.habits || []);
  return routines.map(routine => decorateRoutine(routine, db.habits || [], todayStr));
}

export function decorateRoutine(routine, habits, todayStr) {
  const steps = resolveRoutineSteps(routine, habits, todayStr);
  const progress = routineDayProgress(steps);
  const next = nextRoutineStep(steps);
  return {
    ...routine,
    steps: steps.map(step => ({
      habitId: step.habitId,
      note: step.note,
      title: step.habit?.title || null,
      icon: step.habit?.icon || null,
      frequency: step.habit?.frequency || null,
      tracking: step.habit?.tracking || 'time',
      countUnit: step.habit?.countUnit || '',
      category: step.habit?.category || null,
      description: step.habit?.description || '',
      missing: step.missing,
      doneToday: step.doneToday,
      currentStreak: step.habit?.currentStreak || 0
    })),
    progress,
    nextHabitId: next?.habitId || null,
    completeToday: progress.complete
  };
}

export function createRoutine(db, payload = {}) {
  const title = String(payload.title || '').trim();
  if (!title) return fail('Título da rotina é obrigatório.');
  const normalized = normalizeSteps(payload.steps, db.habits || []);
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
  ensureList(db).unshift(routine);
  return { routine: decorateRoutine(routine, db.habits || [], getSaoPauloDateStr()) };
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
    const normalized = normalizeSteps(payload.steps, db.habits || []);
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
  return { routine: decorateRoutine(next, db.habits || [], getSaoPauloDateStr()) };
}

export function deleteRoutine(db, id) {
  const routines = ensureList(db);
  const index = routines.findIndex(item => item.id === id);
  if (index === -1) return fail('Rotina não encontrada.', 404);
  const [removed] = routines.splice(index, 1);
  return { removed };
}

/**
 * Marca o próximo ritual ainda não feito hoje, ou o passo indicado se for
 * exatamente o próximo. `undo: true` desmarca um passo já feito hoje —
 * o estorno de XP e moedas é o do próprio ritual.
 */
export function advanceRoutine(db, id, { habitId, durationMinutes, count, note, decisionId, undo } = {}) {
  if (undo) return undoRoutineStep(db, id, { habitId });
  const routines = ensureList(db);
  const routine = routines.find(item => item.id === id);
  if (!routine) return fail('Rotina não encontrada.', 404);

  const todayStr = getSaoPauloDateStr();
  const resolved = resolveRoutineSteps(routine, db.habits || [], todayStr);
  const next = nextRoutineStep(resolved);
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

  const fresh = resolveRoutineSteps(routine, db.habits || [], todayStr);
  const progress = routineDayProgress(fresh);
  return {
    routine: decorateRoutine(routine, db.habits || [], todayStr),
    step: fresh.find(step => step.habitId === next.habitId) || null,
    habit: toggled.habit,
    rewardResult: toggled.rewardResult,
    progress,
    completeToday: progress.complete
  };
}

export function undoRoutineStep(db, id, { habitId } = {}) {
  const routines = ensureList(db);
  const routine = routines.find(item => item.id === id);
  if (!routine) return fail('Rotina não encontrada.', 404);
  const todayStr = getSaoPauloDateStr();
  const resolved = resolveRoutineSteps(routine, db.habits || [], todayStr);
  const step = resolved.find(item => item.habitId === habitId && !item.missing);
  if (!step) return fail('Este ritual não faz parte da sequência.');
  if (!step.doneToday) return fail('Este passo ainda não foi feito hoje.');

  const toggled = toggleHabit(db, { id: habitId, date: todayStr });
  if (toggled.error) return toggled;
  if (toggled.done) return fail('Não foi possível desmarcar o ritual.');

  return {
    routine: decorateRoutine(routine, db.habits || [], todayStr),
    step: resolveRoutineSteps(routine, db.habits || [], todayStr).find(item => item.habitId === habitId) || null,
    habit: toggled.habit,
    rewardResult: toggled.rewardResult,
    undone: true,
    progress: routineDayProgress(resolveRoutineSteps(routine, db.habits || [], todayStr)),
    completeToday: false
  };
}

export function removeHabitFromRoutines(db, habitId) {
  if (!Array.isArray(db.routines) || !habitId) return;
  db.routines = detachHabitFromRoutines(db.routines, habitId);
}
