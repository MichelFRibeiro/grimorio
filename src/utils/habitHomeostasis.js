/**
 * Homeostase & Alostase de um ritual.
 *
 * Opt-in: só rituais com `homeostasis.enabled` entram. O que a faixa mede
 * depende de `tracking`: tempo (`durationsByDate`), quantidade
 * (`countsByDate`) ou os dois. A conta é a mesma da AGU: o setpoint sobe
 * no máximo 10% por semana se 4 dos últimos 7 dias ficaram na faixa ou
 * acima, e recua um passo se a adesão cai abaixo de 40%.
 */

import { parseHabitCount } from './activityDuration.js';
import {
  HOMEOSTASIS_MAX_WEEKLY_INCREASE,
  HOMEOSTASIS_STEP_MINUTES,
  buildDailyLoadSeries,
  roundLoadMinutes,
  roundToStep
} from './homeostasis.js';
import { getSaoPauloDateStr } from './timeUtils.js';

export const HABIT_HOMEOSTASIS_KIND = 'habit';

export const HABIT_HOMEOSTASIS_FLOOR_MINUTES = 10;
export const HABIT_HOMEOSTASIS_TARGET_MINUTES = 60;
export const HABIT_HOMEOSTASIS_FLOOR_COUNT = 5;
export const HABIT_HOMEOSTASIS_TARGET_COUNT = 50;

/** time = cronômetro; count = repetições; both = os dois, cada um com a sua faixa. */
export const HABIT_TRACKING_MODES = ['time', 'count', 'both'];

export function normalizeHabitTracking(value, fallback = 'time') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'quantity' || raw === 'quantidade' || raw === 'reps' || raw === 'count') return 'count';
  if (raw === 'both' || raw === 'ambos' || raw === 'time_and_count') return 'both';
  if (raw === 'time' || raw === 'tempo' || raw === 'duration') return 'time';
  return HABIT_TRACKING_MODES.includes(fallback) ? fallback : 'time';
}

export function habitTracksTime(habit) {
  const mode = normalizeHabitTracking(habit?.tracking, 'time');
  return mode === 'time' || mode === 'both';
}

export function habitTracksCount(habit) {
  return normalizeHabitTracking(habit?.tracking, 'time') !== 'time';
}

export function habitMeasureLabel(habit, measure = 'time') {
  if (measure === 'count') {
    const unit = String(habit?.countUnit || '').trim();
    return unit || 'reps';
  }
  return 'min';
}

export function habitHomeostasisEnabled(habit) {
  return Boolean(habit?.homeostasis?.enabled);
}

function countStepFor(target) {
  const n = Number(target) || HABIT_HOMEOSTASIS_TARGET_COUNT;
  if (n >= 200) return 10;
  if (n >= 40) return 5;
  return 1;
}

export function defaultHabitHomeostasisState(overrides = {}, measure = 'time') {
  const counting = measure === 'count';
  const floorDefault = counting ? HABIT_HOMEOSTASIS_FLOOR_COUNT : HABIT_HOMEOSTASIS_FLOOR_MINUTES;
  const targetDefault = counting ? HABIT_HOMEOSTASIS_TARGET_COUNT : HABIT_HOMEOSTASIS_TARGET_MINUTES;
  const floor = roundLoadMinutes(overrides.floorMinutes) || floorDefault;
  const target = Math.max(floor, roundLoadMinutes(overrides.targetMinutes) || targetDefault);
  const step = roundLoadMinutes(overrides.stepMinutes) || (counting ? countStepFor(target) : HOMEOSTASIS_STEP_MINUTES);
  return {
    enabled: true,
    setpointMinutes: 0,
    targetMinutes: target,
    floorMinutes: floor,
    stepMinutes: step,
    maxWeeklyIncrease: HOMEOSTASIS_MAX_WEEKLY_INCREASE,
    weekdayFactors: null,
    lastEvaluated: null,
    history: [],
    seeded: false
  };
}

/**
 * Normaliza o que veio do cadastro. `enabled: false` desliga sem apagar o
 * histórico já gravado — reativar continua de onde parou.
 */
export function sanitizeHabitHomeostasisInput(raw, existing = null) {
  if (raw === undefined) return undefined;
  if (raw === false || raw === null) {
    if (!existing) return { enabled: false };
    return { ...existing, enabled: false };
  }
  const source = raw === true || raw === 'true' ? {} : (raw && typeof raw === 'object' ? raw : null);
  if (!source) return undefined;
  if (source.enabled === false) {
    return existing ? { ...existing, enabled: false } : { enabled: false };
  }
  const measure = source.measure === 'count' ? 'count' : 'time';
  const base = existing && typeof existing === 'object'
    ? { ...defaultHabitHomeostasisState(existing, measure), ...existing }
    : defaultHabitHomeostasisState(source, measure);
  const floorDefault = measure === 'count' ? HABIT_HOMEOSTASIS_FLOOR_COUNT : HABIT_HOMEOSTASIS_FLOOR_MINUTES;
  const targetDefault = measure === 'count' ? HABIT_HOMEOSTASIS_TARGET_COUNT : HABIT_HOMEOSTASIS_TARGET_MINUTES;
  const floor = roundLoadMinutes(source.floorMinutes ?? base.floorMinutes) || floorDefault;
  const target = Math.max(floor, roundLoadMinutes(source.targetMinutes ?? base.targetMinutes) || targetDefault);
  const step = roundLoadMinutes(source.stepMinutes ?? base.stepMinutes) || (measure === 'count' ? countStepFor(target) : HOMEOSTASIS_STEP_MINUTES);
  return {
    ...base,
    enabled: true,
    floorMinutes: floor,
    targetMinutes: target,
    stepMinutes: step,
    setpointMinutes: Math.min(Math.max(floor, roundToStep(base.setpointMinutes, step) || floor), target),
    seeded: Boolean(base.seeded)
  };
}

/**
 * O ritual guarda a faixa de tempo em `homeostasis` e, se medir quantidade,
 * a faixa de repetições em `homeostasisCount`. `both` tem as duas.
 */
export function applyHabitTracking(habit, { tracking, countUnit } = {}) {
  if (!habit) return habit;
  if (tracking !== undefined) habit.tracking = normalizeHabitTracking(tracking, habit.tracking || 'time');
  if (countUnit !== undefined) habit.countUnit = String(countUnit || '').trim().slice(0, 24);
  return habit;
}

export function applyHabitMeasure(habit, raw) {
  if (!habit) return habit;
  if (raw === undefined) return habit;
  if (raw === false || raw === null) {
    habit.tracking = 'time';
    if (habit.homeostasis) habit.homeostasis = { ...habit.homeostasis, enabled: false };
    if (habit.homeostasisCount) habit.homeostasisCount = { ...habit.homeostasisCount, enabled: false };
    return habit;
  }
  const source = raw === true || raw === 'true' ? {} : (raw && typeof raw === 'object' ? raw : null);
  if (!source) return habit;
  if (source.enabled === false) {
    if (habit.homeostasis) habit.homeostasis = { ...habit.homeostasis, enabled: false };
    if (habit.homeostasisCount) habit.homeostasisCount = { ...habit.homeostasisCount, enabled: false };
    return habit;
  }
  const tracking = normalizeHabitTracking(source.tracking ?? raw.tracking, habit.tracking || 'time');
  habit.tracking = tracking;
  if (source.countUnit !== undefined || source.unit !== undefined) {
    habit.countUnit = String(source.countUnit ?? source.unit ?? '').trim().slice(0, 24);
  }
  if (tracking === 'time' || tracking === 'both') {
    habit.homeostasis = sanitizeHabitHomeostasisInput(
      { ...source, enabled: true, measure: 'time', floorMinutes: source.floorMinutes, targetMinutes: source.targetMinutes },
      habit.homeostasis
    );
  } else if (habit.homeostasis?.enabled) {
    habit.homeostasis = { ...habit.homeostasis, enabled: false };
  }
  if (tracking === 'count' || tracking === 'both') {
    const countSource = source.count && typeof source.count === 'object' ? source.count : {};
    habit.homeostasisCount = sanitizeHabitHomeostasisInput({
      enabled: true,
      measure: 'count',
      floorMinutes: countSource.floorMinutes ?? countSource.floor ?? source.countFloor ?? source.floorCount,
      targetMinutes: countSource.targetMinutes ?? countSource.target ?? source.countTarget ?? source.targetCount
    }, habit.homeostasisCount);
  } else if (habit.homeostasisCount?.enabled) {
    habit.homeostasisCount = { ...habit.homeostasisCount, enabled: false };
  }
  return habit;
}

export function habitMinutesByDate(habit) {
  const byDate = {};
  const map = habit?.durationsByDate;
  if (!map || typeof map !== 'object') return byDate;
  Object.entries(map).forEach(([dateStr, minutes]) => {
    const value = roundLoadMinutes(minutes);
    if (!dateStr || value <= 0) return;
    byDate[dateStr] = (byDate[dateStr] || 0) + value;
  });
  return byDate;
}

export function habitCountsByDate(habit) {
  const byDate = {};
  const map = habit?.countsByDate;
  if (!map || typeof map !== 'object') return byDate;
  Object.entries(map).forEach(([dateStr, count]) => {
    const value = parseHabitCount(count);
    if (!dateStr || value <= 0) return;
    byDate[dateStr] = value;
  });
  return byDate;
}

function storedHomeostasis(habit, measure) {
  if (measure === 'count') return habit?.homeostasisCount;
  return habit?.homeostasis;
}

/**
 * Série expansiva do ritual. Sem opt-in devolve null.
 * `evaluate: true` deixa o setpoint andar na âncora semanal — quem chama
 * persiste `series.state` de volta no ritual.
 */
export function getHabitLoadSeries(habit, todayStr, options = {}) {
  const measure = options.measure === 'count' ? 'count' : 'time';
  const enabled = measure === 'count'
    ? Boolean(habit?.homeostasisCount?.enabled)
    : habitHomeostasisEnabled(habit);
  if (!enabled && !options.force) return null;
  const stored = storedHomeostasis(habit, measure) && typeof storedHomeostasis(habit, measure) === 'object'
    ? storedHomeostasis(habit, measure)
    : defaultHabitHomeostasisState({}, measure);
  const floorDefault = measure === 'count' ? HABIT_HOMEOSTASIS_FLOOR_COUNT : HABIT_HOMEOSTASIS_FLOOR_MINUTES;
  const targetDefault = measure === 'count' ? HABIT_HOMEOSTASIS_TARGET_COUNT : HABIT_HOMEOSTASIS_TARGET_MINUTES;
  const floor = roundLoadMinutes(stored.floorMinutes) || floorDefault;
  const target = Math.max(floor, roundLoadMinutes(stored.targetMinutes) || targetDefault);
  const step = roundLoadMinutes(stored.stepMinutes) || (measure === 'count' ? countStepFor(target) : HOMEOSTASIS_STEP_MINUTES);
  const byDate = options.minutesByDate
    || (measure === 'count' ? habitCountsByDate(habit) : habitMinutesByDate(habit));
  const series = buildDailyLoadSeries({
    minutesByDate: byDate,
    todayStr: todayStr || getSaoPauloDateStr(),
    days: options.days,
    liveMinutesToday: options.liveMinutesToday,
    floorMinutes: floor,
    targetMinutes: target,
    stepMinutes: step,
    maxWeeklyIncrease: stored.maxWeeklyIncrease ?? HOMEOSTASIS_MAX_WEEKLY_INCREASE,
    weekdayFactors: stored.weekdayFactors || null,
    state: stored.setpointMinutes > 0 ? stored : null,
    evaluate: options.evaluate,
    mode: options.mode
  });
  return series ? { ...series, measure, unit: habitMeasureLabel(habit, measure) } : series;
}

/**
 * Grava o setpoint avaliado. Idempotente: sem mudança devolve o mesmo objeto.
 */
function persistOne(habit, todayStr, measure, options) {
  const key = measure === 'count' ? 'homeostasisCount' : 'homeostasis';
  const enabled = measure === 'count' ? Boolean(habit?.[key]?.enabled) : habitHomeostasisEnabled(habit);
  if (!enabled) return false;
  const series = getHabitLoadSeries(habit, todayStr, { ...options, measure, evaluate: options.evaluate !== false });
  if (!series?.state) return false;
  const next = {
    ...habit[key],
    ...series.state,
    enabled: true,
    seeded: true,
    baselineMinutes: roundLoadMinutes(series.avgMinutes)
  };
  const prev = habit[key] || {};
  const same = prev.seeded
    && prev.setpointMinutes === next.setpointMinutes
    && prev.lastEvaluated === next.lastEvaluated
    && (prev.history || []).length === (next.history || []).length;
  if (same) return false;
  habit[key] = next;
  return true;
}

export function persistHabitHomeostasis(habit, todayStr, options = {}) {
  if (!habit) return habit;
  const measure = options.measure;
  if (measure === 'count' || measure === 'time') {
    persistOne(habit, todayStr, measure, options);
    return habit;
  }
  persistOne(habit, todayStr, 'time', options);
  persistOne(habit, todayStr, 'count', options);
  return habit;
}

export function formatHabitLoad(value, habit, measure = 'time') {
  const n = roundLoadMinutes(value);
  if (measure === 'count') {
    const unit = habitMeasureLabel(habit, 'count');
    return `${n} ${unit}`;
  }
  return `${n} min`;
}

export function formatHabitHomeostasisVictoryTitle(habit, amount, measure = 'time') {
  const name = String(habit?.title || 'Ritual').trim() || 'Ritual';
  if (measure === 'count') {
    return `${name}: no mínimo ${formatHabitLoad(amount, habit, 'count')}.`;
  }
  return `${name}: no mínimo ${roundLoadMinutes(amount)} minutos.`;
}

/**
 * Vitória do dia no piso da faixa (o mesmo número do gráfico), não no
 * setpoint cru. Assim "Fazer Apoios" pede o mínimo da zona verde.
 */
export function buildHabitHomeostasisVictory(habit, todayStr, options = {}) {
  const today = todayStr || getSaoPauloDateStr();
  const measure = options.measure || (habitTracksCount(habit) && !habitTracksTime(habit) ? 'count' : 'time');
  const series = getHabitLoadSeries(habit, today, { ...options, measure });
  if (!series) return null;
  const target = series.homeostasisMinMinutes || series.todayTargetMinutes || series.setpointMinutes;
  const suffix = measure === 'count' ? ':count' : '';
  return {
    title: formatHabitHomeostasisVictoryTitle(habit, target, measure),
    category: habit.category || 'Pessoal',
    date: today,
    source: `homeostasis-habit:${habit.id}${suffix}`,
    habitId: habit.id,
    measure,
    targetMinutes: target
  };
}

export function habitHomeostasisSource(habitId) {
  const id = String(habitId || '').trim();
  return id ? `homeostasis-habit:${id}` : '';
}

export function habitIdFromHomeostasisSource(source) {
  const raw = String(source || '');
  if (!raw.startsWith('homeostasis-habit:')) return '';
  return raw.slice('homeostasis-habit:'.length).replace(/:(count|time)$/, '');
}

export function habitMeasureFromHomeostasisSource(source) {
  return String(source || '').endsWith(':count') ? 'count' : 'time';
}

export function isHabitHomeostasisSource(source) {
  return String(source || '').startsWith('homeostasis-habit:');
}
