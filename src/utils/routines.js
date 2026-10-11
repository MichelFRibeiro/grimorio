/**
 * Rotinas: sequência ordenada de rituais existentes.
 * A rotina não concede XP nem moedas — cada passo marca o ritual
 * pelo toggle já existente. O progresso do dia é o histórico do ritual.
 */

export const MAX_ROUTINE_STEPS = 24;

/**
 * @param {object[]|null} habits Lista de rituais. Null = não filtrar passos
 *   órfãos (a carga ainda não tem os hábitos). Array, mesmo vazio, remove
 *   passos cujo ritual não existe mais.
 */
export function sanitizeRoutines(routines, habits = null) {
  if (!Array.isArray(routines)) return [];
  const habitIds = Array.isArray(habits)
    ? new Set(habits.map(h => h?.id).filter(Boolean))
    : null;

  return routines
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => sanitizeRoutine(item, habitIds))
    .filter(Boolean);
}

export function sanitizeRoutine(routine, habitIds = null) {
  if (!routine || typeof routine !== 'object' || Array.isArray(routine)) return null;
  const title = String(routine.title || '').trim();
  if (!title) return null;
  const id = String(routine.id || '').trim();
  if (!id) return null;

  const seen = new Set();
  const steps = [];
  const rawSteps = Array.isArray(routine.steps) ? routine.steps : [];
  rawSteps.forEach((step, index) => {
    if (steps.length >= MAX_ROUTINE_STEPS) return;
    const habitId = String(step?.habitId || step?.id || '').trim();
    if (!habitId || seen.has(habitId)) return;
    if (habitIds && !habitIds.has(habitId)) return;
    seen.add(habitId);
    steps.push({
      habitId,
      note: String(step?.note || '').trim().slice(0, 240)
    });
    void index;
  });

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

function normalizeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#38bdf8';
}

/**
 * Passos na ordem, com o ritual resolvido e se já foi feito hoje.
 * Ritual excluído vira passo ausente (a UI pede para tirá-lo da rotina).
 */
export function resolveRoutineSteps(routine, habits = [], todayStr = '') {
  const byId = new Map((habits || []).map(habit => [habit.id, habit]));
  return (routine?.steps || []).map((step, index) => {
    const habit = byId.get(step.habitId) || null;
    const history = Array.isArray(habit?.history) ? habit.history : [];
    const doneToday = !!(todayStr && history.includes(todayStr));
    return {
      index,
      habitId: step.habitId,
      note: step.note || '',
      habit,
      missing: !habit,
      doneToday
    };
  });
}

/** Primeiro passo ainda não feito hoje. Null se a sequência do dia acabou. */
export function nextRoutineStep(resolvedSteps) {
  return (resolvedSteps || []).find(step => !step.missing && !step.doneToday) || null;
}

export function routineDayProgress(resolvedSteps) {
  const present = (resolvedSteps || []).filter(step => !step.missing);
  const done = present.filter(step => step.doneToday).length;
  return {
    total: present.length,
    done,
    missing: (resolvedSteps || []).filter(step => step.missing).length,
    complete: present.length > 0 && done === present.length
  };
}

export function detachHabitFromRoutines(routines, habitId) {
  if (!Array.isArray(routines) || !habitId) return routines || [];
  return routines.map(routine => ({
    ...routine,
    steps: (routine.steps || []).filter(step => step.habitId !== habitId)
  }));
}
