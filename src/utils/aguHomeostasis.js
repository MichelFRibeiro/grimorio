import {
  AGU_BLOCK_MINUTES,
  AGU_DAILY_BLOCKS,
  AGU_DAILY_BLOCKS_MAX,
  AGU_SUBJECTS,
  getAguSubject
} from '../data/aguCurriculum.js';
import { parseDurationMinutes } from './activityDuration.js';
import { foldAccents, wordBoundaryIncludes } from './textMatch.js';
import {
  HOMEOSTASIS_FLOOR_MINUTES,
  HOMEOSTASIS_MAX_WEEKLY_INCREASE,
  HOMEOSTASIS_STEP_MINUTES,
  HOMEOSTASIS_TARGET_MINUTES,
  buildExpansiveLoadSeries,
  dailyTargetMinutes,
  initialSetpointFromBaseline,
  robustBaseline,
  roundLoadMinutes,
  roundToStep,
  sessionDateStr
} from './homeostasis.js';
import { getSaoPauloDayOfWeek } from './timeUtils.js';
import { collectStudyBlocks } from './aguStudyEngine.js';

export const AGU_CATEGORY_ALIASES = {
  constitucional: ['constitucional'],
  administrativo: ['administrativo', 'administracao publica'],
  financeiro: ['financeiro', 'orcamento'],
  economico: ['economico'],
  tributario: ['tributario'],
  seguridade: ['seguridade', 'previdencia', 'previdenciario'],
  ambiental: ['ambiental'],
  'leg-agu': ['agu', 'legislacao da agu'],
  civil: ['direito civil', 'civil'],
  'processual-civil': ['processual civil', 'processo civil'],
  'leg-civil-esp': ['legislacao civil'],
  empresarial: ['empresarial'],
  internacional: ['internacional'],
  penal: ['direito penal', 'penal'],
  'processual-penal': ['processual penal'],
  'leg-penal-esp': ['legislacao penal'],
  trabalho: ['direito do trabalho', 'trabalho'],
  'processual-trabalho': ['processual do trabalho'],
  agrario: ['agrario'],
  'educacao-cti': ['educacao', 'inovacao'],
  portugues: ['portugues', 'lingua portuguesa']
};

export function subjectIdForMindMap(map) {
  if (!map) return null;
  if (map.aguSubjectId && getAguSubject(map.aguSubjectId)) return map.aguSubjectId;
  if (map.aguTopicId && String(map.aguTopicId).includes('/')) return String(map.aguTopicId).split('/')[0];
  const label = foldAccents(`${map.category || ''} ${map.title || ''}`);
  const hits = AGU_SUBJECTS.filter((subject) => (
    (AGU_CATEGORY_ALIASES[subject.id] || []).some((alias) => wordBoundaryIncludes(label, alias))
    || wordBoundaryIncludes(label, subject.name)
  ));
  return hits.length === 1 ? hits[0].id : null;
}

export function defaultHomeostasisState(kind = 'study') {
  return {
    setpointMinutes: 0,
    targetMinutes: HOMEOSTASIS_TARGET_MINUTES[kind] || HOMEOSTASIS_TARGET_MINUTES.study,
    floorMinutes: HOMEOSTASIS_FLOOR_MINUTES[kind] || HOMEOSTASIS_FLOOR_MINUTES.study,
    stepMinutes: HOMEOSTASIS_STEP_MINUTES,
    maxWeeklyIncrease: HOMEOSTASIS_MAX_WEEKLY_INCREASE,
    weekdayFactors: null,
    lastEvaluated: null,
    history: [],
    seeded: false
  };
}

/**
 * capacityByWeekday uniforme (o plano real tem 180 nos 7 dias) vira a meta
 * de longo prazo, não a carga de amanhã. Valores diferentes viram fatores.
 */
export function migrateCapacityToHomeostasis(plan, minutesByDate = {}, todayStr) {
  const stored = plan?.homeostasis && typeof plan.homeostasis === 'object' ? plan.homeostasis : {};
  const target = roundLoadMinutes(stored.targetMinutes)
    || roundLoadMinutes(plan?.targetMinutes)
    || HOMEOSTASIS_TARGET_MINUTES.study;
  const floor = HOMEOSTASIS_FLOOR_MINUTES.study;
  const capacity = plan?.capacityByWeekday || {};
  const values = [0, 1, 2, 3, 4, 5, 6].map((day) => roundLoadMinutes(capacity[day] ?? capacity[String(day)] ?? 0));
  const unique = [...new Set(values.filter((n) => n > 0))];
  let weekdayFactors = stored.weekdayFactors || null;
  let migratedTarget = target;
  if (!stored.targetMinutes && unique.length === 1 && unique[0] >= 90) {
    migratedTarget = unique[0];
  } else if (!weekdayFactors && unique.length > 1) {
    const mid = [...unique].sort((a, b) => a - b)[Math.floor(unique.length / 2)];
    weekdayFactors = {};
    values.forEach((value, day) => {
      if (value > 0 && mid > 0) weekdayFactors[day] = Math.round((value / mid) * 100) / 100;
    });
  }
  const baseline = robustBaseline(minutesByDate, todayStr);
  const setpoint = stored.setpointMinutes > 0
    ? stored.setpointMinutes
    : initialSetpointFromBaseline(baseline.median, { floor, softStart: 30 });
  return {
    ...defaultHomeostasisState('study'),
    ...stored,
    setpointMinutes: setpoint,
    targetMinutes: migratedTarget,
    floorMinutes: floor,
    weekdayFactors,
    seeded: true,
    baselineMinutes: roundLoadMinutes(baseline.median)
  };
}

/**
 * Minutos de estudo AGU por dia, na mesma conta do Histórico de blocos.
 *
 * O lançamento de um bloco grava o tempo duas vezes: em `examQuestions` (quando
 * há questões) e em `blockDurations` (sempre). Somar as duas fontes conta o
 * mesmo bloco duas vezes — o gráfico mostrava 2h 42 min num dia cujo histórico
 * tinha 1h 21 min. `collectStudyBlocks` já funde as duas pelo maior valor de
 * cada bloco, e é exatamente o número exibido no histórico. Um exame sem
 * `blockKey` também não pode ser somado de novo: a fusão já o absorveu no bloco
 * da mesma data, matéria e tópico.
 */
export function studyMinutesByDate(plan, examQuestions = [], mindMapSessions = [], mindMaps = []) {
  const byDate = {};
  const mapById = {};
  (mindMaps || []).forEach((map) => {
    if (map?.id) mapById[map.id] = map;
  });
  collectStudyBlocks(plan, examQuestions).forEach((block) => {
    if (!block?.dateStr) return;
    byDate[block.dateStr] = (byDate[block.dateStr] || 0) + parseDurationMinutes(block.durationMinutes);
  });
  (mindMapSessions || []).forEach((session) => {
    const dateStr = sessionDateStr(session);
    if (!dateStr) return;
    const map = mapById[session.mapId] || session.map || session;
    if (!subjectIdForMindMap(map)) return;
    byDate[dateStr] = (byDate[dateStr] || 0) + parseDurationMinutes(session.durationMinutes);
  });
  return byDate;
}

export function aguStudyHomeostasis(plan, examQuestions = [], todayStr, options = {}) {
  const byDate = options.minutesByDate || studyMinutesByDate(
    plan,
    examQuestions,
    options.mindMapSessions || [],
    options.mindMaps || []
  );
  const state = plan?.homeostasis?.seeded
    ? plan.homeostasis
    : migrateCapacityToHomeostasis(plan, byDate, todayStr);
  return buildExpansiveLoadSeries({
    minutesByDate: byDate,
    todayStr,
    days: options.days,
    liveMinutesToday: options.liveMinutesToday,
    floorMinutes: state.floorMinutes,
    targetMinutes: state.targetMinutes,
    stepMinutes: state.stepMinutes,
    maxWeeklyIncrease: state.maxWeeklyIncrease,
    weekdayFactors: state.weekdayFactors,
    state,
    evaluate: options.evaluate
  });
}

export function blocksPerDayForSetpoint(plan, weekday, todayStr) {
  const setpoint = roundLoadMinutes(plan?.homeostasis?.setpointMinutes);
  const factors = plan?.homeostasis?.weekdayFactors;
  const target = setpoint > 0
    ? dailyTargetMinutes(setpoint, weekday, factors)
    : roundLoadMinutes(plan?.dailyBlocks) * AGU_BLOCK_MINUTES || AGU_DAILY_BLOCKS * AGU_BLOCK_MINUTES;
  const blocks = Math.ceil(Math.max(AGU_BLOCK_MINUTES, target) / AGU_BLOCK_MINUTES);
  return Math.min(AGU_DAILY_BLOCKS_MAX, Math.max(1, blocks || AGU_DAILY_BLOCKS));
}

export function todayStudyTarget(plan, weekday) {
  const setpoint = roundLoadMinutes(plan?.homeostasis?.setpointMinutes) || HOMEOSTASIS_FLOOR_MINUTES.study;
  return dailyTargetMinutes(setpoint, weekday ?? getSaoPauloDayOfWeek(), plan?.homeostasis?.weekdayFactors);
}

export function coverageProjection(plan, topicProgress, todayStr, weeklyBlocks) {
  const rows = Object.values(topicProgress || {});
  const totalWeight = rows.reduce((sum, row) => {
    const subject = getAguSubject(row.subjectId);
    return sum + ((subject?.weight || 1) * 1);
  }, 0);
  const doneWeight = rows.reduce((sum, row) => {
    if (row.status !== 'completed' && row.status !== 'review') return sum;
    const subject = getAguSubject(row.subjectId);
    return sum + (subject?.weight || 1);
  }, 0);
  const completed = rows.filter((row) => row.status === 'completed' || row.status === 'review').length;
  const total = rows.length;
  const coverage = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 1000) / 10 : 0;
  const remaining = Math.max(0, total - completed);
  const blocksPerTopic = Math.max(1, Math.ceil(60 / (plan?.blockQuestionTarget || 10)));
  const pace = Math.max(0, Number(weeklyBlocks) || 0);
  const weeks = pace > 0 ? Math.ceil((remaining * blocksPerTopic) / pace) : null;
  const months = weeks == null ? null : Math.ceil(weeks / 4.345);
  const horizon = Number(plan?.horizonMonths) || 18;
  return {
    coverage,
    topicsCompleted: completed,
    topicsTotal: total,
    months,
    horizonMonths: horizon,
    behind: months != null && months > horizon,
    weeklyBlocks: pace
  };
}

export { roundToStep };
