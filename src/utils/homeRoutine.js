/**
 * Rotina da tela inicial.
 *
 * A escolha vive no perfil (`userProfile.homeRoutineId`), ao lado do tema, para
 * acompanhar a conta em qualquer aparelho. A tela inicial desenha essa rotina
 * logo abaixo do quadro "Vitórias Planejadas para o Dia"; Configurações é onde
 * ela é trocada.
 *
 * Um mesmo arquivo serve às duas pontas: o servidor valida o id que chega em
 * POST /api/profile e monta o retrato da rotina para as vitórias planejadas;
 * o cliente desenha o cartão. Por isso as funções que dependem do banco
 * recebem `routines`/`habits` por parâmetro, e nada aqui importa servidor.
 */

import {
  collectRoutineHabitIds,
  flattenRoutineLeaves,
  resolveRoutineSteps,
  routineDayProgress,
  routineLeafKey
} from './routines.js';

/** Chave do campo no perfil. Sem valor = nenhuma rotina escolhida. */
export const HOME_ROUTINE_FIELD = 'homeRoutineId';

export function normalizeHomeRoutineId(value) {
  if (value == null) return null;
  const id = String(value).trim().slice(0, 80);
  return id || null;
}

export function findRoutineById(routines, routineId) {
  const id = normalizeHomeRoutineId(routineId);
  if (!id) return null;
  return (Array.isArray(routines) ? routines : []).find(routine => routine?.id === id) || null;
}

/**
 * A escolha guardada contra as rotinas que existem hoje.
 * Rotina excluída (ou id desconhecido) devolve `status: 'missing'` e o cartão
 * da tela inicial explica como trocar em Configurações, em vez de sumir mudo.
 */
export function describeHomeRoutine(routines, savedId) {
  const id = normalizeHomeRoutineId(savedId);
  if (!id) return { status: 'none', routineId: null, routine: null };
  const routine = findRoutineById(routines, id);
  if (!routine) return { status: 'missing', routineId: id, routine: null };
  return { status: 'ok', routineId: id, routine };
}

/**
 * Execução da rotina numa data: passos resolvidos, progresso do dia e o que
 * falta — a mesma régua da aba Rotinas (`routineDayProgress`).
 */
export function routineDaySnapshot(routine, habits, routines, dateStr, activities = null) {
  const resolved = resolveRoutineSteps(routine, habits, dateStr, routines, null, activities);
  const leaves = flattenRoutineLeaves(resolved);
  const progress = routineDayProgress(resolved);
  const present = leaves.filter(step => routineLeafKey(step));
  return {
    resolved,
    leaves,
    progress,
    // Rituais inteiros (sub-rotinas incluídas), sem repetição — o que a
    // execução da rotina reconhece como "feito" no dia.
    habitIds: collectRoutineHabitIds(resolved),
    pending: present.filter(step => !step.doneToday)
  };
}

/**
 * Retrato da rotina escolhida para a tela inicial.
 * Devolve null quando não há escolha, quando a rotina sumiu ou quando a carga
 * ainda não trouxe os rituais.
 */
export function buildHomeRoutine(routines, habits, todayStr, savedId, activities = null) {
  const described = describeHomeRoutine(routines, savedId);
  if (described.status !== 'ok') return null;
  const routine = described.routine;
  const snapshot = routineDaySnapshot(routine, habits || [], routines || [], todayStr, activities);
  const next = snapshot.pending[0] || null;
  return {
    id: routine.id,
    title: routine.title,
    description: routine.description || '',
    icon: routine.icon || 'ListOrdered',
    color: routine.color || '#38bdf8',
    steps: snapshot.resolved.map(step => describeHomeStep(step, todayStr)),
    progress: snapshot.progress,
    completeToday: snapshot.progress.complete,
    habitIds: snapshot.habitIds,
    next: next ? describeHomeNext(next) : null
  };
}

function describeHomeNext(step) {
  return {
    kind: step.kind === 'activity' ? 'activity' : 'habit',
    leafKey: routineLeafKey(step),
    habitId: step.habitId || null,
    activityId: step.activityId || null,
    title: step.kind === 'activity' ? (step.title || '') : (step.habit?.title || ''),
    detail: step.kind === 'activity' ? (step.detail || '') : '',
    tab: step.tab || ''
  };
}

function describeHomeStep(step, todayStr) {
  if (step.kind === 'routine') {
    const progress = step.progress || { total: 0, done: 0, missing: 1, complete: false };
    return {
      kind: 'routine',
      routineId: step.routineId,
      title: step.routine?.title || 'Sub-rotina',
      icon: step.routine?.icon || 'ListOrdered',
      missing: !!step.missing,
      doneToday: !!step.doneToday,
      progress: {
        total: progress.total || 0,
        done: progress.done || 0,
        missing: progress.missing || 0,
        complete: !!progress.complete
      },
      steps: (step.steps || []).map(child => describeHomeStep(child, todayStr))
    };
  }
  if (step.kind === 'activity') {
    return {
      kind: 'activity',
      activityId: step.activityId,
      title: step.title || 'Atividade',
      detail: step.detail || '',
      tab: step.tab || '',
      rule: step.rule || '',
      missing: !!step.missing,
      doneToday: step.missing ? false : !!step.doneToday
    };
  }
  const history = Array.isArray(step.habit?.history) ? step.habit.history : [];
  return {
    kind: 'habit',
    habitId: step.habitId,
    title: step.habit?.title || 'Ritual',
    icon: step.habit?.icon || null,
    tracking: step.habit?.tracking || null,
    missing: !!step.missing,
    doneToday: step.missing ? false : !!(step.doneToday || (todayStr && history.includes(todayStr)))
  };
}

/**
 * O que falta para a rotina do dia valer como vitória conquistada.
 * O servidor confere de novo — isto é só para o cartão explicar o botão.
 */
export function routineVictoryGate(routine, snapshot) {
  if (!routine) return { canComplete: false, reason: 'Rotina não encontrada.' };
  if (!snapshot || !snapshot.progress?.total) {
    return { canComplete: false, reason: 'Esta rotina não tem passos válidos para hoje.' };
  }
  const { total, done } = snapshot.progress;
  if (done < total) {
    const missing = total - done;
    return {
      canComplete: false,
      reason: `Faltam ${missing} ${missing === 1 ? 'passo' : 'passos'} da rotina para hoje.`
    };
  }
  return { canComplete: true, reason: 'Rotina inteira cumprida hoje.' };
}

/**
 * Valida se a rotina pode virar vitória do dia: precisa de ao menos um passo
 * válido (ritual existente ou atividade). Sem isso não há o que reconhecer.
 */
export function routineVictoryProblem(routine) {
  if (!routine || !routine.id) return 'Escolha uma rotina para planejar a execução.';
  const leaves = flattenRoutineLeaves(routine.steps || []);
  const present = leaves.filter(step => !step?.missing && (
    step?.kind === 'activity' ? !!step.activityId : !!step.habitId
  ));
  if (!present.length) {
    return 'Esta rotina não tem passos válidos para reconhecer no dia.';
  }
  return null;
}
