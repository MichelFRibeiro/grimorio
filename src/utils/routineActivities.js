/**
 * Atividades que uma rotina pode incluir além de rituais.
 * A rotina não marca nem recompensa: reconhece o que já foi feito hoje.
 * Biblioteca, Escrituras e AGU fecham quando o tempo do dia chega no
 * setpoint (a meta de hoje). O Diário fecha com qualquer página do dia.
 */

import { getAguStudyLoadSeries } from './aguCycle.js';
import {
  HOMEOSTASIS_FLOOR_MINUTES,
  getReadingLoadSeries,
  getScriptureLoadSeries
} from './homeostasis.js';

export const ROUTINE_ACTIVITIES = [
  {
    id: 'reading',
    label: 'Biblioteca',
    tab: 'books',
    rule: 'setpoint',
    floor: HOMEOSTASIS_FLOOR_MINUTES.reading
  },
  {
    id: 'scripture',
    label: 'Escrituras',
    tab: 'scripture',
    rule: 'setpoint',
    floor: HOMEOSTASIS_FLOOR_MINUTES.scripture
  },
  {
    id: 'journal',
    label: 'Diário',
    tab: 'journal',
    rule: 'entry',
    floor: 0
  },
  {
    id: 'agu',
    label: 'AGU',
    tab: 'agu',
    rule: 'setpoint',
    floor: HOMEOSTASIS_FLOOR_MINUTES.study
  }
];

const BY_ID = new Map(ROUTINE_ACTIVITIES.map(item => [item.id, item]));

export function routineActivityMeta(id) {
  return BY_ID.get(String(id || '').trim()) || null;
}

export function isRoutineActivityId(id) {
  return BY_ID.has(String(id || '').trim());
}

export function isActivityStep(step) {
  if (!step || typeof step !== 'object') return false;
  if (step.kind === 'habit' || step.kind === 'routine') return false;
  if (step.kind === 'activity') return true;
  return isRoutineActivityId(step.activityId) && !step.habitId && !step.routineId;
}

export function activityTargetMinutes(series, floor = 0) {
  const target = Number(series?.todayTargetMinutes || series?.setpointMinutes || 0);
  if (Number.isFinite(target) && target > 0) return Math.round(target);
  const fallback = Number(floor) || 0;
  return fallback > 0 ? Math.round(fallback) : 0;
}

export function minutesReachedSetpoint(minutes, target) {
  const done = Number(minutes) || 0;
  const goal = Number(target) || 0;
  return goal > 0 && done >= goal;
}

function loggedToday(series) {
  const today = series?.today;
  if (!today) return 0;
  const logged = Number(today.loggedMinutes);
  if (Number.isFinite(logged)) return Math.max(0, Math.round(logged));
  return Math.max(0, Math.round(Number(today.minutes) || 0));
}

function safeSeries(load) {
  try {
    return load() || null;
  } catch {
    return null;
  }
}

function setpointStatus(id, series) {
  const meta = routineActivityMeta(id);
  const minutes = loggedToday(series);
  const target = activityTargetMinutes(series, meta?.floor || 0);
  const done = minutesReachedSetpoint(minutes, target);
  return {
    activityId: id,
    label: meta?.label || id,
    tab: meta?.tab || '',
    rule: 'setpoint',
    minutes,
    target,
    count: 0,
    done,
    detail: target > 0 ? `${minutes} de ${target} min` : `${minutes} min`
  };
}

/**
 * Retrato do dia para resolver passos de atividade.
 * `source` aceita o banco ou o estado do cliente.
 */
export function routineActivitySnapshot(source = {}, todayStr = '') {
  const reading = setpointStatus('reading', safeSeries(() => (
    getReadingLoadSeries(source.readingSessions || [], todayStr)
  )));
  const scripture = setpointStatus('scripture', safeSeries(() => (
    getScriptureLoadSeries(source.scriptureSessions || [], todayStr)
  )));
  const agu = setpointStatus('agu', safeSeries(() => (
    getAguStudyLoadSeries(source.aguPlan, source.examQuestions || [], todayStr, {
      mindMapSessions: source.mindMapSessions || [],
      mindMaps: source.mindMaps || []
    })
  )));
  const count = (Array.isArray(source.journalEntries) ? source.journalEntries : [])
    .filter(entry => entry && entry.date === todayStr)
    .length;
  const journal = {
    activityId: 'journal',
    label: 'Diário',
    tab: 'journal',
    rule: 'entry',
    minutes: 0,
    target: 0,
    count,
    done: count > 0,
    detail: count > 0
      ? (count === 1 ? '1 página hoje' : `${count} páginas hoje`)
      : 'nenhuma página hoje'
  };
  return { reading, scripture, journal, agu };
}

export function activityPendingMessage(status) {
  if (!status) return 'Esta atividade ainda não foi concluída hoje.';
  if (status.rule === 'entry') {
    return 'O Diário ainda não tem página hoje. A rotina reconhece quando houver um registro.';
  }
  const label = status.label || 'Esta atividade';
  const progress = status.target > 0 ? ` (${status.minutes} de ${status.target} min)` : '';
  return `${label} ainda não atingiu o setpoint de hoje${progress}. A rotina reconhece quando a meta for batida.`;
}
