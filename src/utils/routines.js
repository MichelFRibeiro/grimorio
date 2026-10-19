/**
 * Rotinas: sequência ordenada de rituais, atividades e outras rotinas.
 * A rotina não concede XP nem moedas. O ritual é marcado pelo toggle
 * já existente. Biblioteca, Escrituras, AGU e Diário não são marcados
 * aqui: a rotina só reconhece o que o dia já registrou.
 *
 * Uma sub-rotina é referência, não cópia. Ciclo é recusado.
 * No máximo MAX_ROUTINE_NESTING elos.
 */

import {
  isActivityStep,
  isRoutineActivityId,
  routineActivityMeta
} from './routineActivities.js';

export { isActivityStep } from './routineActivities.js';

export const MAX_ROUTINE_STEPS = 24;

/** Elos rotina → sub-rotina. 3 cobre dia → manhã → preparação → rituais. */
export const MAX_ROUTINE_NESTING = 3;

export const ROUTINE_CYCLE_ERROR = 'Uma rotina não pode conter a si mesma, nem por meio de outras sub-rotinas.';
export const ROUTINE_DEPTH_ERROR = `Sub-rotinas podem ter no máximo ${MAX_ROUTINE_NESTING} níveis.`;

export function isRoutineStep(step) {
  if (!step || typeof step !== 'object') return false;
  if (step.kind === 'habit') return false;
  if (step.kind === 'routine') return true;
  return !!step.routineId && !step.habitId;
}

/**
 * @param {object[]|null} habits Lista de rituais. Null = não filtrar passos
 *   órfãos (a carga ainda não tem os hábitos). Array, mesmo vazio, remove
 *   passos cujo ritual não existe mais.
 */
export function sanitizeRoutines(routines, habits = null) {
  if (!Array.isArray(routines)) return [];
  const habitIds = Array.isArray(habits)
    ? new Set(habits.map(item => item?.id).filter(Boolean))
    : null;

  const validIds = new Set();
  const drafts = [];
  for (const item of routines) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = String(item.id || '').trim();
    const title = String(item.title || '').trim();
    if (!id || !title || validIds.has(id)) continue;
    validIds.add(id);
    drafts.push(item);
  }

  // Publicado ao fim de cada rotina, para o próximo elo que fecharia
  // um ciclo enxergar o caminho já aceito — qualquer que seja a ordem.
  const childMap = new Map();
  return drafts
    .map(item => sanitizeRoutine(item, habitIds, validIds, childMap))
    .filter(Boolean);
}

export function sanitizeRoutine(routine, habitIds = null, routineIds = null, childMap = null) {
  if (!routine || typeof routine !== 'object' || Array.isArray(routine)) return null;
  const title = String(routine.title || '').trim();
  if (!title) return null;
  const id = String(routine.id || '').trim();
  if (!id) return null;

  const seenHabits = new Set();
  const seenRoutines = new Set();
  const seenActivities = new Set();
  const steps = [];
  const rawSteps = Array.isArray(routine.steps) ? routine.steps : [];
  rawSteps.forEach(raw => {
    if (steps.length >= MAX_ROUTINE_STEPS) return;
    const step = readStoredStep(raw);
    if (!step) return;
    if (step.kind === 'routine') {
      if (step.routineId === id || seenRoutines.has(step.routineId)) return;
      if (routineIds && !routineIds.has(step.routineId)) return;
      if (childMap && routineReaches(childMap, step.routineId, id)) return;
      seenRoutines.add(step.routineId);
      steps.push(step);
      return;
    }
    if (step.kind === 'activity') {
      if (seenActivities.has(step.activityId)) return;
      seenActivities.add(step.activityId);
      steps.push(step);
      return;
    }
    if (seenHabits.has(step.habitId)) return;
    if (habitIds && !habitIds.has(step.habitId)) return;
    seenHabits.add(step.habitId);
    steps.push(step);
  });

  if (childMap) {
    childMap.set(id, steps.filter(step => step.kind === 'routine').map(step => step.routineId));
  }

  return {
    id,
    title: title.slice(0, 120),
    description: String(routine.description || '').trim().slice(0, 500),
    icon: String(routine.icon || 'ListOrdered').trim().slice(0, 40) || 'ListOrdered',
    color: normalizeColor(routine.color),
    steps,
    createdAt: typeof routine.createdAt === 'string' ? routine.createdAt : new Date().toISOString(),
    updatedAt: typeof routine.updatedAt === 'string' ? routine.updatedAt : null
  };
}

function readStoredStep(step) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return null;
  const note = String(step.note || '').trim().slice(0, 240);
  const routineId = String(step.routineId || '').trim();
  const explicitHabit = String(step.habitId || '').trim();
  const fallbackHabit = String(step.id || '').trim();
  const activityId = String(step.activityId || '').trim();
  let kind = step.kind === 'routine' || step.kind === 'habit' || step.kind === 'activity' ? step.kind : '';
  if (!kind) {
    if (routineId && !explicitHabit) kind = 'routine';
    else if (activityId && !explicitHabit) kind = 'activity';
    else kind = 'habit';
  }
  if (kind === 'routine') {
    if (!routineId || explicitHabit || activityId) return null;
    return { kind: 'routine', routineId, note };
  }
  if (kind === 'activity') {
    if (!isRoutineActivityId(activityId) || routineId || explicitHabit) return null;
    return { kind: 'activity', activityId, note };
  }
  const habitId = explicitHabit || fallbackHabit;
  if (!habitId || routineId) return null;
  return { kind: 'habit', habitId, note };
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#38bdf8';
}

export function linkedRoutineIds(steps) {
  const ids = [];
  const seen = new Set();
  for (const step of steps || []) {
    if (!isRoutineStep(step)) continue;
    const routineId = String(step.routineId || '').trim();
    if (!routineId || seen.has(routineId)) continue;
    seen.add(routineId);
    ids.push(routineId);
  }
  return ids;
}

export function routineChildMap(routines) {
  const map = new Map();
  for (const routine of routines || []) {
    if (!routine?.id || map.has(routine.id)) continue;
    map.set(routine.id, linkedRoutineIds(routine.steps));
  }
  return map;
}

/** True se, seguindo sub-rotinas a partir de fromId, chega em targetId. */
export function routineReaches(childMap, fromId, targetId, seen = new Set()) {
  if (!fromId || !targetId) return false;
  if (fromId === targetId) return true;
  if (seen.has(fromId)) return false;
  seen.add(fromId);
  for (const childId of childMap.get(fromId) || []) {
    if (routineReaches(childMap, childId, targetId, seen)) return true;
  }
  return false;
}

function edgeDepth(id, childMap, memo, stack) {
  if (!id) return 0;
  if (memo.has(id)) return memo.get(id);
  if (stack.has(id)) return 0;
  stack.add(id);
  let depth = 0;
  for (const childId of childMap.get(id) || []) {
    depth = Math.max(depth, 1 + edgeDepth(childId, childMap, memo, stack));
  }
  stack.delete(id);
  memo.set(id, depth);
  return depth;
}

export function maxEdgeDepth(childMap) {
  const memo = new Map();
  let max = 0;
  for (const id of childMap.keys()) {
    max = Math.max(max, edgeDepth(id, childMap, memo, new Set()));
  }
  return max;
}

/**
 * Recusa ciclo e aninhamento além de MAX_ROUTINE_NESTING.
 * `selfId` null = rotina ainda sem id (criação). `steps` são os passos
 * propostos; as outras rotinas entram com os passos que já têm.
 * @returns {string|null}
 */
export function routineLinkError(routines, selfId, steps) {
  const childIds = linkedRoutineIds(steps);
  const others = (routines || []).filter(item => item && item.id && item.id !== selfId);
  const othersMap = routineChildMap(others);
  if (selfId) {
    for (const childId of childIds) {
      if (childId === selfId || routineReaches(othersMap, childId, selfId)) {
        return ROUTINE_CYCLE_ERROR;
      }
    }
  }
  const map = routineChildMap(others);
  map.set(selfId || '__draft__', childIds);
  if (maxEdgeDepth(map) > MAX_ROUTINE_NESTING) return ROUTINE_DEPTH_ERROR;
  return null;
}

/**
 * Valida a sequência enviada pelo cliente. Passo em branco é ignorado.
 * Ritual repetido, sub-rotina repetida, ciclo e nível demais recusam.
 */
export function normalizeRoutineSteps(rawSteps, habits = [], routines = [], selfId = null) {
  if (!Array.isArray(rawSteps)) return { error: 'Informe a sequência de passos.' };
  const habitIds = new Set((habits || []).map(item => item?.id).filter(Boolean));
  const routineIds = new Set((routines || []).map(item => item?.id).filter(Boolean));
  const seenHabits = new Set();
  const seenRoutines = new Set();
  const seenActivities = new Set();
  const steps = [];

  for (const raw of rawSteps) {
    if (!raw || typeof raw !== 'object') continue;
    const classified = classifyIncomingStep(raw);
    if (classified.error) return classified;
    if (!classified.step) continue;

    if (classified.step.kind === 'routine') {
      const { routineId, note } = classified.step;
      if (selfId && routineId === selfId) return { error: 'Uma rotina não pode conter a si mesma.' };
      if (seenRoutines.has(routineId)) return { error: 'A rotina não pode repetir a mesma sub-rotina.' };
      if (!routineIds.has(routineId)) return { error: 'Uma das sub-rotinas da sequência não existe.' };
      seenRoutines.add(routineId);
      steps.push({ kind: 'routine', routineId, note });
    } else if (classified.step.kind === 'activity') {
      const { activityId, note } = classified.step;
      if (seenActivities.has(activityId)) return { error: 'A rotina não pode repetir a mesma atividade.' };
      if (!isRoutineActivityId(activityId)) return { error: 'Essa atividade não entra em rotina.' };
      seenActivities.add(activityId);
      steps.push({ kind: 'activity', activityId, note });
    } else {
      const { habitId, note } = classified.step;
      if (seenHabits.has(habitId)) return { error: 'A rotina não pode repetir o mesmo ritual.' };
      if (!habitIds.has(habitId)) return { error: 'Um dos rituais da sequência não existe.' };
      seenHabits.add(habitId);
      steps.push({ kind: 'habit', habitId, note });
    }

    if (steps.length > MAX_ROUTINE_STEPS) {
      return { error: `Uma rotina tem no máximo ${MAX_ROUTINE_STEPS} passos.` };
    }
  }

  if (steps.length < 2) return { error: 'Uma rotina precisa de pelo menos 2 passos em sequência.' };
  const linkError = routineLinkError(routines, selfId, steps);
  if (linkError) return { error: linkError };
  return { steps };
}

function classifyIncomingStep(step) {
  const routineId = String(step.routineId || '').trim();
  const habitId = String(step.habitId || '').trim();
  const activityId = String(step.activityId || '').trim();
  const fallbackHabit = String(step.id || '').trim();
  const note = String(step.note || '').trim().slice(0, 240);
  const mixed = [routineId, habitId, activityId].filter(Boolean).length > 1;
  if (mixed) return { error: 'Um passo é um ritual, uma atividade ou uma sub-rotina, não mais de um.' };

  if (step.kind === 'routine' || (!step.kind && routineId)) {
    if (!routineId) return { step: null };
    return { step: { kind: 'routine', routineId, note } };
  }
  if (step.kind === 'activity' || (!step.kind && activityId)) {
    if (!activityId) return { step: null };
    return { step: { kind: 'activity', activityId, note } };
  }
  if (step.kind === 'habit') {
    const id = habitId || fallbackHabit;
    if (!id) return { step: null };
    return { step: { kind: 'habit', habitId: id, note } };
  }
  const id = habitId || fallbackHabit;
  if (!id) return { step: null };
  return { step: { kind: 'habit', habitId: id, note } };
}

/**
 * Passos na ordem, com o ritual ou a sub-rotina resolvidos.
 * Ritual excluído, sub-rotina excluída ou ciclo viram passo ausente.
 */
export function resolveRoutineSteps(routine, habits = [], todayStr = '', routines = [], seen = null, activities = null) {
  const trail = new Set(seen || []);
  if (routine?.id) {
    if (trail.has(routine.id)) return [];
    trail.add(routine.id);
  }

  const byHabit = new Map((habits || []).map(habit => [habit.id, habit]));
  const byRoutine = new Map((routines || []).map(item => [item.id, item]));

  return (routine?.steps || []).map((step, index) => {
    if (isRoutineStep(step)) {
      const routineId = step.routineId;
      const child = byRoutine.get(routineId) || null;
      const blocked = !child || trail.has(routineId) || trail.size > MAX_ROUTINE_NESTING;
      if (blocked) {
        return {
          index,
          kind: 'routine',
          routineId,
          note: step.note || '',
          routine: child,
          steps: [],
          missing: true,
          doneToday: false,
          progress: { total: 0, done: 0, missing: 1, complete: false }
        };
      }
      const children = resolveRoutineSteps(child, habits, todayStr, routines, trail, activities);
      const progress = routineDayProgress(children);
      return {
        index,
        kind: 'routine',
        routineId,
        note: step.note || '',
        routine: child,
        steps: children,
        missing: false,
        doneToday: progress.complete,
        progress
      };
    }

    if (isActivityStep(step)) {
      const meta = routineActivityMeta(step.activityId);
      const status = activities?.[step.activityId] || null;
      return {
        index,
        kind: 'activity',
        activityId: step.activityId,
        note: step.note || '',
        title: status?.label || meta?.label || 'Atividade',
        tab: status?.tab || meta?.tab || '',
        rule: status?.rule || meta?.rule || '',
        minutes: status?.minutes || 0,
        target: status?.target || 0,
        count: status?.count || 0,
        detail: status?.detail || '',
        missing: !meta,
        doneToday: !!status?.done
      };
    }

    const habit = byHabit.get(step.habitId) || null;
    const history = Array.isArray(habit?.history) ? habit.history : [];
    return {
      index,
      kind: 'habit',
      habitId: step.habitId,
      note: step.note || '',
      habit,
      missing: !habit,
      doneToday: !!(todayStr && habit && history.includes(todayStr))
    };
  });
}

/**
 * Rituais na ordem em que o modo guiado os encontra.
 * O mesmo ritual em dois ramos conta uma vez — o histórico é dele.
 */
export function flattenRoutineLeaves(resolvedSteps, seenHabits = new Set(), seenRoutines = new Set(), seenActivities = new Set()) {
  const leaves = [];
  for (const step of resolvedSteps || []) {
    if (isRoutineStep(step)) {
      if (step.missing) {
        leaves.push({ kind: 'habit', habitId: '', missing: true, doneToday: false });
        continue;
      }
      if (step.routineId && seenRoutines.has(step.routineId)) continue;
      if (step.routineId) seenRoutines.add(step.routineId);
      leaves.push(...flattenRoutineLeaves(step.steps, seenHabits, seenRoutines, seenActivities));
      continue;
    }
    if (isActivityStep(step)) {
      if (step.missing) {
        leaves.push(step);
        continue;
      }
      if (step.activityId && seenActivities.has(step.activityId)) continue;
      if (step.activityId) seenActivities.add(step.activityId);
      leaves.push(step);
      continue;
    }
    if (step?.habitId && seenHabits.has(step.habitId)) continue;
    if (step?.habitId) seenHabits.add(step.habitId);
    leaves.push(step);
  }
  return leaves;
}

export function routineLeafKey(step) {
  if (!step || step.missing) return '';
  if (isActivityStep(step) && step.activityId) return `activity:${step.activityId}`;
  if (step.habitId && !isRoutineStep(step)) return `habit:${step.habitId}`;
  return '';
}

export function stepContainsLeaf(step, leafKey) {
  if (!leafKey || !step) return false;
  if (isRoutineStep(step)) return (step.steps || []).some(child => stepContainsLeaf(child, leafKey));
  return routineLeafKey(step) === leafKey;
}

export function findRoutineHabitStep(steps, habitId) {
  if (!habitId) return null;
  for (const step of steps || []) {
    if (!step) continue;
    if (isRoutineStep(step)) {
      const found = findRoutineHabitStep(step.steps, habitId);
      if (found) return found;
    } else if (step.habitId === habitId) {
      return step;
    }
  }
  return null;
}

export function stepContainsHabit(step, habitId) {
  if (!habitId || !step) return false;
  if (isRoutineStep(step)) return !!findRoutineHabitStep(step.steps, habitId);
  return step.habitId === habitId;
}

/** Títulos das sub-rotinas até o ritual. Lista vazia se ele é passo direto. */
export function routineHabitPath(steps, habitId, trail = []) {
  for (const step of steps || []) {
    if (isRoutineStep(step)) {
      const nested = routineHabitPath(step.steps, habitId, [...trail, step.title || 'Sub-rotina']);
      if (nested) return nested;
    } else if (step?.habitId === habitId) {
      return trail;
    }
  }
  return null;
}

export function collectRoutineHabitIds(steps, seen = new Set(), acc = []) {
  for (const step of steps || []) {
    if (isRoutineStep(step)) {
      collectRoutineHabitIds(step.steps, seen, acc);
      continue;
    }
    if (!step?.habitId || step.missing || seen.has(step.habitId)) continue;
    seen.add(step.habitId);
    acc.push(step.habitId);
  }
  return acc;
}

function isPendingLeaf(step) {
  if (!step || step.missing || step.doneToday) return false;
  if (isActivityStep(step)) return !!step.activityId;
  return !!step.habitId && !isRoutineStep(step);
}

/** Primeiro passo ainda não feito hoje. Null se a sequência do dia acabou. */
export function nextRoutineStep(resolvedSteps) {
  return (resolvedSteps || []).find(isPendingLeaf) || null;
}

export function nextRoutineLeaf(resolvedSteps) {
  return nextRoutineStep(flattenRoutineLeaves(resolvedSteps));
}

export function routineDayProgress(resolvedSteps) {
  const leaves = flattenRoutineLeaves(resolvedSteps);
  const present = leaves.filter(step => routineLeafKey(step));
  const done = present.filter(step => step.doneToday).length;
  return {
    total: present.length,
    done,
    missing: leaves.filter(step => step?.missing).length,
    complete: present.length > 0 && done === present.length
  };
}

export function detachHabitFromRoutines(routines, habitId) {
  if (!Array.isArray(routines) || !habitId) return routines || [];
  return routines.map(routine => ({
    ...routine,
    steps: (routine.steps || []).filter(step => step?.kind === 'routine' || step?.kind === 'activity' || step?.habitId !== habitId)
  }));
}

export function detachRoutineFromRoutines(routines, routineId) {
  if (!Array.isArray(routines) || !routineId) return routines || [];
  return routines.map(routine => ({
    ...routine,
    steps: (routine.steps || []).filter(step => step?.routineId !== routineId)
  }));
}
