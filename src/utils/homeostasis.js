import { parseDurationMinutes } from './activityDuration.js';
import { DAILY_VICTORY_OVERFLOW_SOURCES } from './dailyVictories.js';
import { addDaysToDateStr, daysBetweenDateStr, getSaoPauloDateStr, getSaoPauloDayOfWeek, mondayOfDateStr } from './timeUtils.js';

/** Janela da faixa de homeostase: média real dos últimos N dias. */
export const HOMEOSTASIS_WINDOW_DAYS = 14;
/** Amplitude da faixa em torno da média (±20%). Mantido para a faixa descritiva. */
export const HOMEOSTASIS_BAND_RATIO = 0.2;

/**
 * Pisos absolutos (minutos). A faixa expansiva nunca desce abaixo deles.
 * Estudo AGU: 20 min (pedido do herói). Leitura: 15 min.
 */
export const HOMEOSTASIS_FLOOR_MINUTES = {
  study: 20,
  reading: 15,
  scripture: 15
};

/** Meta de longo prazo. Estudo sobe até 180 min/dia; leitura estabiliza em 30. */
export const HOMEOSTASIS_TARGET_MINUTES = {
  study: 180,
  reading: 30,
  scripture: 30
};

/** Passo de arredondamento e de expansão/contração (minutos). */
export const HOMEOSTASIS_STEP_MINUTES = 5;
/** Teto de expansão por avaliação semanal. */
export const HOMEOSTASIS_MAX_WEEKLY_INCREASE = 0.1;
/** Adesão mínima (dias na faixa ou acima / 7) para o setpoint subir. */
export const HOMEOSTASIS_EXPAND_ADHERENCE = 4 / 7;
/** Abaixo disso o setpoint recua um passo. */
export const HOMEOSTASIS_CONTRACT_ADHERENCE = 0.4;
/** Faixa em torno do setpoint: [0.85, 1.25]. */
export const SETPOINT_BAND_LOW = 0.85;
export const SETPOINT_BAND_HIGH = 1.25;
/** Sobrecarga sustentada: acima de 1,5× o setpoint por N dias seguidos. */
export const SETPOINT_OVERLOAD_RATIO = 1.5;
export const SETPOINT_OVERLOAD_DAYS = 3;
export const HOMEOSTASIS_EVAL_DAYS = 7;

export function roundLoadMinutes(value) {
  const n = Number(value) || 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function roundToStep(value, step = HOMEOSTASIS_STEP_MINUTES) {
  const n = Number(value) || 0;
  const size = Math.max(1, Number(step) || HOMEOSTASIS_STEP_MINUTES);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / size) * size;
}

/**
 * Faixa descritiva ±20% em torno de uma média. Usada pelos testes legados e
 * como fallback quando não há setpoint. O teto nunca cai abaixo do piso.
 */
export function buildHomeostasisBand(avgMinutes, floorMinutes = 0) {
  const center = Math.max(0, roundLoadMinutes(avgMinutes));
  const floor = Math.max(0, roundLoadMinutes(floorMinutes));
  const rawMin = roundLoadMinutes(center * (1 - HOMEOSTASIS_BAND_RATIO));
  const rawMax = roundLoadMinutes(center * (1 + HOMEOSTASIS_BAND_RATIO));
  const homeostasisMinMinutes = Math.max(rawMin, floor);
  return {
    avgMinutes: center,
    homeostasisMinMinutes,
    homeostasisMaxMinutes: Math.max(rawMax, homeostasisMinMinutes),
    floorMinutes: floor,
    floorApplied: floor > 0 && floor > rawMin
  };
}

/**
 * Faixa expansiva: o centro é o setpoint (a meta de hoje), não a média.
 * [setpoint × 0,85, setpoint × 1,25]. Dia vazio classifica como "sem estudo".
 */
export function buildSetpointBand(setpointMinutes, floorMinutes = 0) {
  const setpoint = Math.max(0, roundLoadMinutes(setpointMinutes));
  const floor = Math.max(0, roundLoadMinutes(floorMinutes));
  const rawMin = roundLoadMinutes(setpoint * SETPOINT_BAND_LOW);
  const rawMax = roundLoadMinutes(setpoint * SETPOINT_BAND_HIGH);
  const homeostasisMinMinutes = Math.max(rawMin, floor, setpoint > 0 ? 1 : 0);
  return {
    setpointMinutes: setpoint,
    avgMinutes: setpoint,
    homeostasisMinMinutes,
    homeostasisMaxMinutes: Math.max(rawMax, homeostasisMinMinutes),
    floorMinutes: floor,
    floorApplied: floor > 0 && floor > rawMin
  };
}

export function classifyLoadMinutes(minutes, band = {}, options = {}) {
  const value = roundLoadMinutes(minutes);
  if (options.empty && value <= 0) return 'empty';
  const min = Number(band.homeostasisMinMinutes);
  const max = Number(band.homeostasisMaxMinutes);
  const floor = Number.isFinite(min) ? min : 0;
  const ceiling = Number.isFinite(max) ? max : 0;
  if (value < floor) return 'allostasis-under';
  if (ceiling > 0 && value > ceiling) return 'allostasis-over';
  return 'homeostasis';
}

export function median(values = []) {
  const nums = (values || []).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (nums.length === 0) return 0;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 0) return (nums[mid - 1] + nums[mid]) / 2;
  return nums[mid];
}

/**
 * Baseline robusta: mediana dos últimos 14 dias, zeros inclusos.
 * Um dia de 86 min não puxa o setpoint de quem estuda ~5 min/dia.
 */
export function robustBaseline(minutesByDate = {}, todayStr, days = HOMEOSTASIS_WINDOW_DAYS) {
  const today = todayStr || getSaoPauloDateStr();
  const windowDays = Math.max(1, Number(days) || HOMEOSTASIS_WINDOW_DAYS);
  const start = addDaysToDateStr(today, -(windowDays - 1));
  const samples = [];
  for (let i = 0; i < windowDays; i += 1) {
    const dateStr = addDaysToDateStr(start, i);
    samples.push(roundLoadMinutes(minutesByDate[dateStr] || 0));
  }
  return {
    samples,
    median: median(samples),
    activeDays: samples.filter((n) => n > 0).length
  };
}

export function initialSetpointFromBaseline(baselineMinutes, {
  floor = HOMEOSTASIS_FLOOR_MINUTES.study,
  step = HOMEOSTASIS_STEP_MINUTES,
  softStart = 30
} = {}) {
  const floorMinutes = Math.max(0, roundLoadMinutes(floor));
  const baseline = roundLoadMinutes(baselineMinutes);
  if (baseline < floorMinutes) {
    return Math.max(floorMinutes, Math.min(softStart, roundToStep(Math.max(baseline, floorMinutes), step) || floorMinutes));
  }
  return Math.max(floorMinutes, roundToStep(baseline, step));
}

function clampSetpoint(value, { floor, target, step }) {
  const rounded = roundToStep(value, step);
  return Math.min(Math.max(floor, rounded), Math.max(floor, target));
}

function weekdayFactor(weekday, factors) {
  if (!factors) return 1;
  const raw = factors[weekday] ?? factors[String(weekday)];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

/**
 * Meta do dia = setpoint × fator do weekday (padrão 1).
 * Se o herói gravou capacidade por dia, o fator sai da razão com a mediana.
 */
export function dailyTargetMinutes(setpoint, weekday, factors, step = HOMEOSTASIS_STEP_MINUTES) {
  const base = Math.max(0, roundLoadMinutes(setpoint));
  return Math.max(0, roundToStep(base * weekdayFactor(weekday, factors), step));
}

export function projectTargetDate(setpoint, target, weeklyRate = HOMEOSTASIS_MAX_WEEKLY_INCREASE, todayStr) {
  const today = todayStr || getSaoPauloDateStr();
  const from = Math.max(1, roundLoadMinutes(setpoint));
  const to = Math.max(from, roundLoadMinutes(target));
  if (from >= to) {
    return { weeks: 0, date: today, reached: true };
  }
  const rate = Number(weeklyRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { weeks: null, date: null, reached: false };
  }
  const weeks = Math.ceil(Math.log(to / from) / Math.log(1 + rate));
  return {
    weeks,
    date: addDaysToDateStr(today, weeks * 7),
    reached: false
  };
}

function adherenceOf(samples, band) {
  const inOrAbove = samples.filter((minutes) => {
    if (roundLoadMinutes(minutes) <= 0) return false;
    const zone = classifyLoadMinutes(minutes, band);
    return zone === 'homeostasis' || zone === 'allostasis-over';
  }).length;
  return samples.length > 0 ? inOrAbove / samples.length : 0;
}

function nextExpansionDate(lastEvaluated, todayStr) {
  const anchor = lastEvaluated ? addDaysToDateStr(mondayOfDateStr(lastEvaluated), 7) : mondayOfDateStr(todayStr);
  if (anchor > todayStr) return anchor;
  return addDaysToDateStr(mondayOfDateStr(todayStr), 7);
}

/**
 * Avalia o setpoint. Sobe no máximo 10% (arredondado ao passo) quando ≥ 4 dos
 * últimos 7 dias ficaram na faixa ou acima. Recua um passo se a adesão ficou
 * abaixo de 40%. Caso contrário, segura. Nunca desce do piso nem passa da meta.
 */
export function evaluateSetpoint({
  setpoint,
  samples = [],
  floor = HOMEOSTASIS_FLOOR_MINUTES.study,
  target = HOMEOSTASIS_TARGET_MINUTES.study,
  step = HOMEOSTASIS_STEP_MINUTES,
  maxWeeklyIncrease = HOMEOSTASIS_MAX_WEEKLY_INCREASE,
  date
} = {}) {
  const current = clampSetpoint(setpoint || floor, { floor, target, step });
  const windowSamples = (samples || []).slice(-HOMEOSTASIS_EVAL_DAYS);
  const band = buildSetpointBand(current, floor);
  const adherence = adherenceOf(windowSamples, band);
  let next = current;
  let reason = 'hold';
  if (windowSamples.length >= HOMEOSTASIS_EVAL_DAYS && adherence + 1e-9 >= HOMEOSTASIS_EXPAND_ADHERENCE && current < target) {
    const grown = roundToStep(current * (1 + maxWeeklyIncrease), step);
    const stepped = Math.max(grown, current + step);
    next = clampSetpoint(stepped, { floor, target, step });
    reason = next > current ? 'expand' : 'hold';
  } else if (windowSamples.length >= HOMEOSTASIS_EVAL_DAYS && adherence < HOMEOSTASIS_CONTRACT_ADHERENCE && current > floor) {
    next = clampSetpoint(current - step, { floor, target, step });
    reason = 'contract';
  }
  return {
    from: current,
    to: next,
    reason,
    adherence: Math.round(adherence * 1000) / 1000,
    date: date || getSaoPauloDateStr(),
    changed: next !== current
  };
}

function windowSamplesEnding(minutesByDate, endDate, days = HOMEOSTASIS_EVAL_DAYS) {
  const start = addDaysToDateStr(endDate, -(days - 1));
  const samples = [];
  for (let i = 0; i < days; i += 1) {
    const dateStr = addDaysToDateStr(start, i);
    samples.push(roundLoadMinutes(minutesByDate[dateStr] || 0));
  }
  return samples;
}

function overloadStreak(points, setpoint) {
  const limit = setpoint * SETPOINT_OVERLOAD_RATIO;
  let streak = 0;
  let max = 0;
  points.forEach((point) => {
    if ((point.loggedMinutes || 0) > limit && limit > 0) {
      streak += 1;
      max = Math.max(max, streak);
    } else if ((point.loggedMinutes || 0) > 0 || point.isToday) {
      streak = 0;
    }
  });
  const tail = [...points].reverse();
  let current = 0;
  for (const point of tail) {
    if ((point.loggedMinutes || 0) > limit && limit > 0) current += 1;
    else break;
  }
  return { current, max, warn: current >= SETPOINT_OVERLOAD_DAYS };
}

/**
 * Série diária com setpoint expansivo.
 *
 * O setpoint só muda na âncora de segunda (ou sob demanda). Dias vazios contam
 * zero e aparecem como "sem estudo" — não entram disfarçados de homeostase.
 * `liveMinutesToday` entra só no ponto de hoje, nunca na avaliação.
 */
export function buildExpansiveLoadSeries({
  minutesByDate = {},
  todayStr,
  days = HOMEOSTASIS_WINDOW_DAYS,
  liveMinutesToday = 0,
  floorMinutes = HOMEOSTASIS_FLOOR_MINUTES.study,
  targetMinutes = HOMEOSTASIS_TARGET_MINUTES.study,
  stepMinutes = HOMEOSTASIS_STEP_MINUTES,
  maxWeeklyIncrease = HOMEOSTASIS_MAX_WEEKLY_INCREASE,
  weekdayFactors = null,
  state = null,
  evaluate = false
} = {}) {
  const today = todayStr || getSaoPauloDateStr();
  const windowDays = Math.max(1, Number(days) || HOMEOSTASIS_WINDOW_DAYS);
  const floor = Math.max(0, roundLoadMinutes(floorMinutes));
  const target = Math.max(floor, roundLoadMinutes(targetMinutes) || floor);
  const step = Math.max(1, roundLoadMinutes(stepMinutes) || HOMEOSTASIS_STEP_MINUTES);
  const rate = Number.isFinite(Number(maxWeeklyIncrease)) ? Number(maxWeeklyIncrease) : HOMEOSTASIS_MAX_WEEKLY_INCREASE;
  const liveToday = Math.max(0, roundLoadMinutes(liveMinutesToday));

  const baseline = robustBaseline(minutesByDate, today, HOMEOSTASIS_WINDOW_DAYS);
  const seeded = state?.setpointMinutes > 0
    ? clampSetpoint(state.setpointMinutes, { floor, target, step })
    : initialSetpointFromBaseline(baseline.median, { floor, step, softStart: Math.min(30, target) });

  const history = Array.isArray(state?.history) ? state.history.map((item) => ({ ...item })) : [];
  let setpoint = seeded;
  let lastEvaluated = state?.lastEvaluated || null;

  const monday = mondayOfDateStr(today);
  const alreadyThisWeek = lastEvaluated && mondayOfDateStr(lastEvaluated) >= monday;
  const weekTurned = Boolean(lastEvaluated) && monday > mondayOfDateStr(lastEvaluated) && today >= monday;
  const due = !alreadyThisWeek && (weekTurned || (evaluate && lastEvaluated));
  let lastChange = null;
  if (due) {
    const end = addDaysToDateStr(monday, -1);
    const samples = windowSamplesEnding(minutesByDate, end);
    const verdict = evaluateSetpoint({
      setpoint,
      samples,
      floor,
      target,
      step,
      maxWeeklyIncrease: rate,
      date: today
    });
    lastEvaluated = today;
    if (verdict.changed) {
      lastChange = verdict;
      history.push({
        date: today,
        from: verdict.from,
        to: verdict.to,
        reason: verdict.reason,
        adherence: verdict.adherence
      });
      setpoint = verdict.to;
    }
  }

  const start = addDaysToDateStr(today, -(windowDays - 1));
  const rawPoints = [];
  for (let i = 0; i < windowDays; i += 1) {
    const dateStr = addDaysToDateStr(start, i);
    const isToday = dateStr === today;
    const loggedMinutes = roundLoadMinutes(minutesByDate[dateStr] || 0);
    const liveMinutes = isToday ? liveToday : 0;
    rawPoints.push({
      dateStr,
      minutes: loggedMinutes + liveMinutes,
      loggedMinutes,
      liveMinutes,
      isToday,
      empty: loggedMinutes <= 0 && liveMinutes <= 0
    });
  }

  const band = buildSetpointBand(setpoint, floor);
  const todayTarget = dailyTargetMinutes(setpoint, getSaoPauloDayOfWeek(today), weekdayFactors, step);
  const todayBand = buildSetpointBand(todayTarget || setpoint, floor);

  let homeostasisDays = 0;
  let allostasisUnderDays = 0;
  let allostasisOverDays = 0;
  let emptyDays = 0;
  const points = rawPoints.map((point) => {
    const pointTarget = dailyTargetMinutes(setpoint, getSaoPauloDayOfWeek(point.dateStr), weekdayFactors, step);
    const pointBand = buildSetpointBand(pointTarget || setpoint, floor);
    const zone = classifyLoadMinutes(point.loggedMinutes, pointBand, { empty: point.empty });
    if (zone === 'empty') emptyDays += 1;
    else if (zone === 'homeostasis') homeostasisDays += 1;
    else if (zone === 'allostasis-under') allostasisUnderDays += 1;
    else allostasisOverDays += 1;
    return {
      ...point,
      zone,
      setpointMinutes: pointTarget || setpoint,
      bandMin: pointBand.homeostasisMinMinutes,
      bandMax: pointBand.homeostasisMaxMinutes
    };
  });

  const recent = windowSamplesEnding(minutesByDate, today);
  const recentBand = buildSetpointBand(setpoint, floor);
  const adherence = adherenceOf(recent, recentBand);
  const adherentDays = recent.filter((minutes) => {
    if (roundLoadMinutes(minutes) <= 0) return false;
    const zone = classifyLoadMinutes(minutes, recentBand);
    return zone === 'homeostasis' || zone === 'allostasis-over';
  }).length;
  const overload = overloadStreak(points, setpoint);
  const projection = projectTargetDate(setpoint, target, rate, today);
  const daysToExpansion = Math.max(0, daysBetweenDateStr(today, nextExpansionDate(lastEvaluated, today)));

  return {
    mode: 'expansive',
    avgMinutes: band.avgMinutes,
    setpointMinutes: setpoint,
    targetMinutes: target,
    todayTargetMinutes: todayTarget,
    activeDays: baseline.activeDays,
    emptyDays,
    floorMinutes: floor,
    floorApplied: band.floorApplied,
    stepMinutes: step,
    maxWeeklyIncrease: rate,
    homeostasisMinMinutes: todayBand.homeostasisMinMinutes,
    homeostasisMaxMinutes: todayBand.homeostasisMaxMinutes,
    points,
    homeostasisDays,
    allostasisUnderDays,
    allostasisOverDays,
    allostasisDays: allostasisUnderDays + allostasisOverDays,
    today: points.find((point) => point.isToday) || null,
    adherence: Math.round(adherence * 1000) / 1000,
    adherentDays,
    adherenceWindow: HOMEOSTASIS_EVAL_DAYS,
    expandThreshold: 4,
    daysToNextExpansion: daysToExpansion,
    nextExpansionDate: nextExpansionDate(lastEvaluated, today),
    canExpand: adherentDays >= 4 && setpoint < target,
    projection,
    overloadWarning: overload.warn,
    overloadStreak: overload.current,
    lastChange,
    state: {
      setpointMinutes: setpoint,
      targetMinutes: target,
      floorMinutes: floor,
      stepMinutes: step,
      maxWeeklyIncrease: rate,
      weekdayFactors: weekdayFactors || null,
      lastEvaluated,
      history
    }
  };
}

/**
 * Série descritiva (legado): média só dos dias com sessão, ±20%.
 * Mantida para quem pedir explicitamente `mode: 'descriptive'`.
 */
export function buildDailyLoadSeries({
  minutesByDate = {},
  todayStr,
  days = HOMEOSTASIS_WINDOW_DAYS,
  liveMinutesToday = 0,
  floorMinutes = 0,
  mode = 'expansive',
  targetMinutes,
  stepMinutes,
  maxWeeklyIncrease,
  weekdayFactors,
  state,
  evaluate
} = {}) {
  if (mode !== 'descriptive') {
    return buildExpansiveLoadSeries({
      minutesByDate,
      todayStr,
      days,
      liveMinutesToday,
      floorMinutes,
      targetMinutes,
      stepMinutes,
      maxWeeklyIncrease,
      weekdayFactors,
      state,
      evaluate
    });
  }
  const today = todayStr || getSaoPauloDateStr();
  const windowDays = Math.max(1, Number(days) || HOMEOSTASIS_WINDOW_DAYS);
  const start = addDaysToDateStr(today, -(windowDays - 1));
  const liveToday = Math.max(0, roundLoadMinutes(liveMinutesToday));

  const rawPoints = [];
  let activeMinutes = 0;
  let activeDays = 0;

  for (let i = 0; i < windowDays; i += 1) {
    const dateStr = addDaysToDateStr(start, i);
    const isToday = dateStr === today;
    const loggedMinutes = roundLoadMinutes(minutesByDate[dateStr] || 0);
    const liveMinutes = isToday ? liveToday : 0;
    const minutes = loggedMinutes + liveMinutes;
    if (loggedMinutes > 0) {
      activeMinutes += loggedMinutes;
      activeDays += 1;
    }
    rawPoints.push({
      dateStr,
      minutes,
      loggedMinutes,
      liveMinutes,
      isToday,
      empty: loggedMinutes <= 0 && liveMinutes <= 0
    });
  }

  const avgMinutes = activeDays > 0 ? roundLoadMinutes(activeMinutes / activeDays) : 0;
  const band = buildHomeostasisBand(avgMinutes, floorMinutes);

  let homeostasisDays = 0;
  let allostasisUnderDays = 0;
  let allostasisOverDays = 0;
  const points = rawPoints.map((point) => {
    const zone = classifyLoadMinutes(point.minutes, band);
    if (zone === 'homeostasis') homeostasisDays += 1;
    else if (zone === 'allostasis-under') allostasisUnderDays += 1;
    else if (zone === 'allostasis-over') allostasisOverDays += 1;
    return { ...point, zone };
  });

  return {
    mode: 'descriptive',
    avgMinutes: band.avgMinutes,
    activeDays,
    emptyDays: windowDays - activeDays,
    floorMinutes: band.floorMinutes,
    floorApplied: band.floorApplied,
    homeostasisMinMinutes: band.homeostasisMinMinutes,
    homeostasisMaxMinutes: band.homeostasisMaxMinutes,
    points,
    homeostasisDays,
    allostasisUnderDays,
    allostasisOverDays,
    allostasisDays: allostasisUnderDays + allostasisOverDays,
    today: points.find((point) => point.isToday) || null
  };
}

export function sessionDateStr(entry) {
  if (!entry) return '';
  if (entry.date) return entry.date;
  if (entry.timestamp) return getSaoPauloDateStr(entry.timestamp);
  if (entry.createdAt) return getSaoPauloDateStr(entry.createdAt);
  return '';
}

export function scriptureHomeostasisConfig(options = {}) {
  return {
    floorMinutes: options.floorMinutes ?? HOMEOSTASIS_FLOOR_MINUTES.scripture,
    targetMinutes: options.targetMinutes ?? options.state?.targetMinutes ?? HOMEOSTASIS_TARGET_MINUTES.scripture,
    stepMinutes: options.stepMinutes ?? HOMEOSTASIS_STEP_MINUTES,
    maxWeeklyIncrease: options.maxWeeklyIncrease ?? HOMEOSTASIS_MAX_WEEKLY_INCREASE
  };
}

/** Tempo da Escritura. Não entra na série da Biblioteca. */
export function getScriptureLoadSeries(scriptureSessions = [], todayStr, options = {}) {
  const byDate = {};
  (scriptureSessions || []).forEach((session) => {
    const dateStr = sessionDateStr(session);
    if (!dateStr) return;
    byDate[dateStr] = (byDate[dateStr] || 0) + parseDurationMinutes(session.durationMinutes);
  });
  const config = scriptureHomeostasisConfig(options);
  return buildDailyLoadSeries({
    minutesByDate: byDate,
    todayStr,
    days: options.days,
    liveMinutesToday: options.liveMinutesToday,
    floorMinutes: config.floorMinutes,
    targetMinutes: config.targetMinutes,
    stepMinutes: config.stepMinutes,
    maxWeeklyIncrease: config.maxWeeklyIncrease,
    state: options.state || null,
    evaluate: options.evaluate,
    mode: options.mode
  });
}

export const SCRIPTURE_HOMEOSTASIS_VICTORY_CATEGORY = 'Estudos';

export function formatScriptureHomeostasisVictoryTitle(minutes) {
  return `Ler a Bíblia no mínimo ${roundLoadMinutes(minutes)} minutos.`;
}

export function buildScriptureHomeostasisVictory(scriptureSessions = [], todayStr, options = {}) {
  const series = getScriptureLoadSeries(scriptureSessions, todayStr, options);
  const target = series.todayTargetMinutes || series.setpointMinutes || series.homeostasisMinMinutes;
  return {
    title: formatScriptureHomeostasisVictoryTitle(target),
    category: SCRIPTURE_HOMEOSTASIS_VICTORY_CATEGORY,
    date: todayStr || getSaoPauloDateStr(),
    source: DAILY_VICTORY_OVERFLOW_SOURCES.scripture,
    targetMinutes: target
  };
}

export function readingHomeostasisConfig(options = {}) {
  return {
    floorMinutes: options.floorMinutes ?? HOMEOSTASIS_FLOOR_MINUTES.reading,
    targetMinutes: options.targetMinutes ?? options.state?.targetMinutes ?? HOMEOSTASIS_TARGET_MINUTES.reading,
    stepMinutes: options.stepMinutes ?? HOMEOSTASIS_STEP_MINUTES,
    maxWeeklyIncrease: options.maxWeeklyIncrease ?? HOMEOSTASIS_MAX_WEEKLY_INCREASE
  };
}

export function getReadingLoadSeries(readingSessions = [], todayStr, options = {}) {
  const byDate = {};
  (readingSessions || []).forEach((session) => {
    const dateStr = sessionDateStr(session);
    if (!dateStr) return;
    byDate[dateStr] = (byDate[dateStr] || 0) + parseDurationMinutes(session.durationMinutes);
  });
  const config = readingHomeostasisConfig(options);
  return buildDailyLoadSeries({
    minutesByDate: byDate,
    todayStr,
    days: options.days,
    liveMinutesToday: options.liveMinutesToday,
    floorMinutes: config.floorMinutes,
    targetMinutes: config.targetMinutes,
    stepMinutes: config.stepMinutes,
    maxWeeklyIncrease: config.maxWeeklyIncrease,
    state: options.state || options.readingHomeostasis || null,
    evaluate: options.evaluate,
    mode: options.mode
  });
}

export const READING_HOMEOSTASIS_VICTORY_CATEGORY = 'Estudos';

export function formatReadingHomeostasisVictoryTitle(minutes) {
  return `Ler no mínimo ${roundLoadMinutes(minutes)} minutos.`;
}

/**
 * Vitória do dia na meta de hoje (setpoint), não no piso móvel da faixa.
 */
export function buildReadingHomeostasisVictory(readingSessions = [], todayStr, options = {}) {
  const series = getReadingLoadSeries(readingSessions, todayStr, options);
  const target = series.todayTargetMinutes || series.setpointMinutes || series.homeostasisMinMinutes;
  return {
    title: formatReadingHomeostasisVictoryTitle(target),
    category: READING_HOMEOSTASIS_VICTORY_CATEGORY,
    date: todayStr || getSaoPauloDateStr(),
    source: DAILY_VICTORY_OVERFLOW_SOURCES.reading,
    targetMinutes: target
  };
}
