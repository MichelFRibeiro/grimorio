import {
  AGU_BLOCK_MINUTES,
  AGU_BLOCK_QUESTION_TARGET,
  AGU_CYCLE_LENGTH,
  AGU_CYCLE_TEMPLATE,
  AGU_DAILY_BLOCKS,
  AGU_DAILY_BLOCKS_MAX,
  AGU_DEFAULT_CAPACITY_BY_WEEKDAY,
  AGU_DEFAULT_EDITAL_PROFILE_ID,
  AGU_ERROR_REVIEW_INTERVALS,
  AGU_GROUPS,
  AGU_HORIZON_MONTHS_DEFAULT,
  AGU_KIND_META,
  AGU_MASTER_MIN_SOLVED,
  AGU_PHASES,
  AGU_PLAN_VERSION,
  AGU_PRODUCT_META,
  AGU_STALE_DAYS,
  AGU_SUBJECTS,
  AGU_TARGET_ACCURACY,
  AGU_WEEKDAY_MORNING_MINUTES,
  AGU_WEEKDAY_QUESTION_TARGET,
  blockKey,
  createDefaultAguPlan,
  getAguSubject,
  parseBlockKey,
  recommendPlatform
} from '../data/aguCurriculum.js';
import { parseDurationMinutes } from './activityDuration.js';
import { DAILY_VICTORY_OVERFLOW_SOURCES } from './dailyVictories.js';
import { addDaysToDateStr, daysBetweenDateStr, getCurrentWeekDays, getSaoPauloDateStr, getSaoPauloDayOfWeek } from './timeUtils.js';
import {
  HOMEOSTASIS_BAND_RATIO,
  HOMEOSTASIS_FLOOR_MINUTES,
  HOMEOSTASIS_WINDOW_DAYS,
  buildDailyLoadSeries,
  buildHomeostasisBand,
  classifyLoadMinutes,
  roundLoadMinutes,
  sessionDateStr
} from './homeostasis.js';
import {
  buildSubjectStats as buildSubjectStatsDetailed,
  buildTopicStats,
  currentTopicForSubject,
  detectPhase,
  getSubjectMastery,
  getTopicMastery,
  matchExamToSubject as matchExamToSubjectDetailed,
  phaseMeta,
  rankSubjects,
  resolveExamSubject,
  resolveExamTopic,
  topicKey
} from './aguFragility.js';
import {
  collectDebtFromCycle,
  fortnightStartFor,
  generateFortnight,
  liveCycleReasons,
  normalizeDebt
} from './aguCycleGenerator.js';
import {
  aguStudyHomeostasis,
  blocksPerDayForSetpoint,
  coverageProjection,
  migrateCapacityToHomeostasis,
  studyMinutesByDate,
  todayStudyTarget
} from './aguHomeostasis.js';
import {
  blockCompletionReason,
  buildEditalTable,
  buildTopicProgress,
  collectStudyBlocks,
  currentOpenTopic,
  durationForStudySlot,
  isBlockComplete,
  isPortugueseRequired,
  isSlotMarkedDone,
  overlayLoggedDayBlocks,
  sameStudySlot,
  serializeTopicStatus,
  suggestNextBlock
} from './aguStudyEngine.js';

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const AGU_STUDY_LOAD_WINDOW_DAYS = HOMEOSTASIS_WINDOW_DAYS;
export const AGU_HOMEOSTASIS_BAND_RATIO = HOMEOSTASIS_BAND_RATIO;

export { buildHomeostasisBand, classifyLoadMinutes as classifyStudyLoadHours };

export { matchExamToSubjectDetailed as matchExamToSubject };
export { detectPhase, phaseMeta, rankSubjects, collectDebtFromCycle, generateFortnight };

export function getCycleStartDate(plan, todayStr) {
  if (plan?.currentCycle?.start) return plan.currentCycle.start;
  if (plan?.startedAt) return plan.startedAt;
  if (plan?.cycleStartDate) return plan.cycleStartDate;
  return todayStr;
}

export function getCycleDayIndex(plan, dateStr) {
  const start = getCycleStartDate(plan, dateStr);
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ty, tm, td] = dateStr.split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const targetUtc = Date.UTC(ty, tm - 1, td);
  const diff = Math.round((targetUtc - startUtc) / 86400000);
  if (diff < 0) return 0;
  return diff % AGU_CYCLE_LENGTH;
}

export function getCycleNumber(plan, dateStr) {
  if (plan?.currentCycle?.number) return plan.currentCycle.number;
  const start = getCycleStartDate(plan, dateStr);
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ty, tm, td] = dateStr.split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const targetUtc = Date.UTC(ty, tm - 1, td);
  const diff = Math.max(0, Math.round((targetUtc - startUtc) / 86400000));
  return Math.floor(diff / AGU_CYCLE_LENGTH) + 1;
}

export function getTemplateDay(index) {
  return AGU_CYCLE_TEMPLATE[index] || AGU_CYCLE_TEMPLATE[0];
}

export function buildSubjectStats(examQuestions = [], todayStr) {
  return buildSubjectStatsDetailed(examQuestions, todayStr).byId;
}

export function isAguExamEntry(entry) {
  if (!entry) return false;
  if (entry.subjectId && getAguSubject(entry.subjectId)) return true;
  if (AGU_SUBJECTS.some((subject) => matchExamToSubjectDetailed(entry, subject))) return true;
  return String(entry.notes || '').includes('Campanha AGU');
}

export function getAguStudyTimeTotals(plan, examQuestions = [], todayStr, calendar) {
  const today = todayStr || getSaoPauloDateStr();
  const weekDays = getCurrentWeekDays(today);
  const weekStart = weekDays[0]?.dateStr || today;
  const weekEnd = weekDays[6]?.dateStr || today;
  const monthPrefix = today.slice(0, 7);
  const yearPrefix = today.slice(0, 4);
  const cycleStart = calendar?.cycleStart || plan?.currentCycle?.start || today;
  const cycleEnd = calendar?.cycleEnd || plan?.currentCycle?.end || today;

  const totals = { day: 0, week: 0, cycle: 0, month: 0, year: 0, total: 0 };

  const addMinutes = (dateStr, minutes) => {
    const amount = parseDurationMinutes(minutes);
    if (!amount || !dateStr) return;
    totals.total += amount;
    if (dateStr === today) totals.day += amount;
    if (dateStr >= weekStart && dateStr <= weekEnd) totals.week += amount;
    if (dateStr >= cycleStart && dateStr <= cycleEnd) totals.cycle += amount;
    if (dateStr.startsWith(monthPrefix)) totals.month += amount;
    if (dateStr.startsWith(yearPrefix)) totals.year += amount;
  };

  collectStudyBlocks(plan, examQuestions).forEach((block) => {
    addMinutes(block.dateStr, block.durationMinutes);
  });

  return totals;
}

/**
 * Série diária da Campanha AGU com setpoint expansivo.
 * Mapa mental só entra se a categoria casa com uma matéria AGU.
 */
export function getAguStudyLoadSeries(plan, examQuestions = [], todayStr, options = {}) {
  const minutesByDate = studyMinutesByDate(
    plan,
    examQuestions,
    options.mindMapSessions || [],
    options.mindMaps || []
  );
  const prepared = plan?.homeostasis?.seeded
    ? plan
    : { ...plan, homeostasis: migrateCapacityToHomeostasis(plan, minutesByDate, todayStr) };
  return aguStudyHomeostasis(prepared, examQuestions, todayStr, { ...options, minutesByDate });
}

export const AGU_HOMEOSTASIS_VICTORY_CATEGORY = 'Estudos';

export function formatAguHomeostasisStudyVictoryTitle(minutes) {
  return `Estudar no mínimo ${roundLoadMinutes(minutes)} minutos.`;
}

/**
 * Vitória do dia na meta de hoje (setpoint), não no piso móvel da faixa.
 */
export function buildAguHomeostasisStudyVictory(plan, examQuestions = [], todayStr, options = {}) {
  const today = todayStr || getSaoPauloDateStr();
  const series = getAguStudyLoadSeries(plan, examQuestions, today, options);
  const target = series.todayTargetMinutes || series.setpointMinutes || series.homeostasisMinMinutes;
  return {
    title: formatAguHomeostasisStudyVictoryTitle(target),
    category: AGU_HOMEOSTASIS_VICTORY_CATEGORY,
    date: today,
    source: DAILY_VICTORY_OVERFLOW_SOURCES.study,
    targetMinutes: target
  };
}

export function getSubjectProgressOnDate(examQuestions = [], subject, dateStr) {
  const entries = (examQuestions || []).filter((entry) => (
    (entry.date || '') === dateStr && matchExamToSubjectDetailed(entry, subject)
  ));
  const progress = entries.reduce((acc, entry) => {
    acc.solved += entry.totalQuestions || 0;
    acc.correct += entry.correctAnswers || 0;
    acc.sessions += 1;
    return acc;
  }, { solved: 0, correct: 0, sessions: 0, accuracy: 0 });
  progress.accuracy = progress.solved > 0
    ? Math.round((progress.correct / progress.solved) * 1000) / 10
    : 0;
  return progress;
}

function blockProgressOnDate(examQuestions = [], block, dateStr) {
  const entries = (examQuestions || []).filter((entry) => {
    if ((entry.date || '') !== dateStr) return false;
    const entrySlot = {
      key: entry.blockKey,
      dateStr,
      subjectId: entry.subjectId,
      topicId: entry.topicId,
      kind: entry.kind
    };
    if (entry.blockKey && (sameStudySlot(entrySlot, block) || sameStudySlot(entrySlot, block, { ignoreKind: true }))) {
      return true;
    }
    const subject = resolveExamSubject(entry) || getAguSubject(entry.subjectId);
    if (!subject || subject.id !== block.subjectId) {
      return matchExamToSubjectDetailed(entry, getAguSubject(block.subjectId)) && !block.topicId;
    }
    const topic = resolveExamTopic(entry, subject);
    if (block.topicId) return (topic?.id || entry.topicId || '') === block.topicId;
    return true;
  });
  return entries.reduce((acc, entry) => {
    acc.solved += entry.totalQuestions || 0;
    acc.correct += entry.correctAnswers || 0;
    acc.sessions += 1;
    acc.minutes += parseDurationMinutes(entry.durationMinutes);
    return acc;
  }, { solved: 0, correct: 0, sessions: 0, minutes: 0, accuracy: 0 });
}

function hydrateBlock(raw, dateStr, plan, subjectStats, topicStats, examQuestions) {
  const subject = getAguSubject(raw.subjectId);
  const stats = subjectStats[raw.subjectId] || { solved: 0, correct: 0, wrong: 0, accuracy: 0, accSmooth: 0.5, sessions: 0, minutes: 0 };
  const tStats = raw.topicId ? topicStats[topicKey(raw.subjectId, raw.topicId)] : null;
  const platform = recommendPlatform(subject, tStats || stats);
  const key = raw.key || blockKey(dateStr, raw.subjectId, raw.kind, raw.topicId);
  const slot = { ...raw, key, dateStr, subjectId: raw.subjectId, topicId: raw.topicId, kind: raw.kind };
  const markedDone = Boolean(raw.done) || isSlotMarkedDone(plan, slot);
  const kind = raw.kind === 'revisao' ? 'revisao' : (raw.kind === 'estudo' ? 'estudo' : raw.kind);
  const kindMeta = AGU_KIND_META[kind] || (kind === 'estudo' ? { label: 'Estudo inicial', icon: '🎯', color: '#f59e0b' } : AGU_KIND_META.questoes);
  const group = AGU_GROUPS[subject?.group] || AGU_GROUPS.extra;
  const todayProgress = blockProgressOnDate(examQuestions, slot, dateStr);
  todayProgress.accuracy = todayProgress.solved > 0
    ? Math.round((todayProgress.correct / todayProgress.solved) * 1000) / 10
    : 0;
  const questionBlock = raw.kind !== 'discursiva' && raw.kind !== 'teoria' && raw.kind !== 'informativo';
  const target = questionBlock ? AGU_BLOCK_QUESTION_TARGET : (raw.target || 0);
  const targetMinutes = AGU_BLOCK_MINUTES;
  const storedMinutes = durationForStudySlot(plan, slot);
  const minutes = Math.max(storedMinutes, todayProgress.minutes);
  const remaining = Math.max(0, target - todayProgress.solved);
  const remainingMinutes = Math.max(0, targetMinutes - minutes);
  const metTarget = isBlockComplete({ questions: todayProgress.solved, minutes, markedDone });
  const productLogged = Boolean(raw.productLogged) || Boolean(plan?.completedBlocks?.[`${key}|product`]);
  const done = raw.kind === 'discursiva'
    ? productLogged
    : metTarget;
  const progressPercent = Math.min(100, Math.max(
    target > 0 ? Math.round((todayProgress.solved / target) * 100) : 0,
    targetMinutes > 0 ? Math.round((minutes / targetMinutes) * 100) : 0,
    done ? 100 : 0
  ));
  const cursor = subject ? currentTopicForSubject(plan, subject) : null;

  return {
    ...raw,
    key,
    dateStr,
    kind,
    done,
    markedDone,
    metTarget,
    remaining,
    remainingMinutes,
    progressPercent,
    todayProgress,
    minutes,
    target,
    targetMinutes,
    productLogged,
    subject,
    stats,
    platform,
    kindMeta,
    group,
    productMeta: raw.targetProduct ? AGU_PRODUCT_META[raw.targetProduct] : null,
    mastery: getTopicMastery(tStats || stats, plan?.staleDays || AGU_STALE_DAYS),
    topicName: raw.topicName || cursor?.topicName || null,
    optional: Boolean(raw.optional),
    completionReason: blockCompletionReason({ questions: todayProgress.solved, minutes, markedDone })
  };
}

function templateBlocksForDate(plan, dateStr) {
  const cycleIndex = getCycleDayIndex(plan, dateStr);
  const template = getTemplateDay(cycleIndex);
  return {
    label: template.label,
    cycleIndex,
    blocks: (template.blocks || []).map((block) => ({ ...block }))
  };
}

export function getDaySchedule(plan, dateStr, subjectStats = {}, examQuestions = []) {
  const weekday = getSaoPauloDayOfWeek(dateStr);
  const topicStats = buildTopicStats(examQuestions, dateStr);
  const generated = (plan?.currentCycle?.days || []).find((day) => day.dateStr === dateStr);
  const fallback = generated
    ? null
    : generateFortnight(plan, examQuestions, dateStr, { startDate: dateStr, cycleNumber: plan?.cycleNumber || 1 }).days?.[0];
  const source = generated
    ? { label: generated.label, cycleIndex: getCycleDayIndex(plan, dateStr), blocks: generated.blocks || [], optional: generated.optional }
    : {
      label: fallback?.label || templateBlocksForDate(plan, dateStr).label,
      cycleIndex: getCycleDayIndex(plan, dateStr),
      blocks: fallback?.blocks || templateBlocksForDate(plan, dateStr).blocks,
      optional: false
    };

  const cap = blocksPerDayForSetpoint(plan, weekday, dateStr);
  const sourceBlocks = overlayLoggedDayBlocks(source.blocks || [], plan, examQuestions, dateStr, { dailyBlocks: cap });
  const uniqueBlocks = [];
  const usedTopics = new Set();
  sourceBlocks.forEach((block) => {
    const stamp = `${block.subjectId}/${block.topicId || ''}/${block.kind}`;
    if (usedTopics.has(stamp)) return;
    if (block.kind !== 'revisao' && uniqueBlocks.some((item) => item.subjectId === block.subjectId && item.kind !== 'revisao')) return;
    usedTopics.add(stamp);
    uniqueBlocks.push(block);
  });
  const blocks = uniqueBlocks.map((block, index) => ({
    ...hydrateBlock(block, dateStr, plan, subjectStats, topicStats, examQuestions),
    index
  }));

  const questionTarget = blocks.reduce((sum, block) => sum + (block.target || 0), 0);
  const doneCount = blocks.filter((block) => block.done).length;
  const requiredBlocks = blocks.filter((block) => !block.optional);
  const requiredDone = requiredBlocks.filter((block) => block.done).length;

  return {
    dateStr,
    cycleIndex: source.cycleIndex,
    cycleDay: (source.cycleIndex || 0) + 1,
    cycleNumber: getCycleNumber(plan, dateStr),
    weekday,
    weekdayLabel: DAY_LABELS[weekday],
    label: source.label,
    isWeekend: weekday === 0 || weekday === 6,
    optional: Boolean(source.optional),
    blocks,
    morning: blocks.filter((b) => b.window === 'morning'),
    afternoon: blocks.filter((b) => b.window === 'afternoon' || !b.window),
    questionTarget,
    doneCount,
    totalBlocks: blocks.length,
    complete: requiredBlocks.length > 0
      ? requiredDone === requiredBlocks.length
      : (blocks.length > 0 && doneCount === blocks.length)
  };
}

export function getCycleCalendar(plan, todayStr, subjectStats = {}, examQuestions = []) {
  if (plan?.currentCycle?.days?.length) {
    const days = plan.currentCycle.days.map((day) => getDaySchedule(plan, day.dateStr, subjectStats, examQuestions));
    return {
      cycleNumber: plan.currentCycle.number,
      cycleStart: plan.currentCycle.start,
      cycleEnd: plan.currentCycle.end,
      phase: plan.currentCycle.phase || plan.phase,
      reasons: liveCycleReasons(plan, examQuestions, todayStr, days),
      warnings: plan.currentCycle.warnings || [],
      days
    };
  }
  const start = getCycleStartDate(plan, todayStr);
  const cycleNumber = getCycleNumber(plan, todayStr);
  const cycleStart = addDaysToDateStr(start, (cycleNumber - 1) * AGU_CYCLE_LENGTH);
  const days = [];
  for (let i = 0; i < AGU_CYCLE_LENGTH; i += 1) {
    const dateStr = addDaysToDateStr(cycleStart, i);
    days.push(getDaySchedule(plan, dateStr, subjectStats, examQuestions));
  }
  return {
    cycleNumber,
    cycleStart,
    cycleEnd: addDaysToDateStr(cycleStart, AGU_CYCLE_LENGTH - 1),
    phase: plan?.phase || 'fundacao',
    reasons: liveCycleReasons(plan, examQuestions, todayStr, days),
    warnings: [],
    days
  };
}

export function getTodayQuestionProgress(examQuestions = [], todayStr) {
  const today = (examQuestions || []).filter((entry) => (entry.date || '') === todayStr);
  return today.reduce((acc, entry) => {
    acc.solved += entry.totalQuestions || 0;
    acc.correct += entry.correctAnswers || 0;
    acc.sessions += 1;
    return acc;
  }, { solved: 0, correct: 0, sessions: 0, accuracy: 0 });
}

export function summarizePlan(plan, examQuestions = [], todayStr) {
  const today = todayStr || getSaoPauloDateStr();
  const { byId, topicStats } = buildSubjectStatsDetailed(examQuestions, today);
  const schedule = getDaySchedule(plan, today, byId, examQuestions);
  const calendar = getCycleCalendar(plan, today, byId, examQuestions);
  const todayProgress = getTodayQuestionProgress(examQuestions, today);
  const phase = plan?.phase || calendar.phase || 'fundacao';
  const edital = buildEditalTable(plan, examQuestions, today);
  const studyBlocks = collectStudyBlocks(plan, examQuestions);
  const portugueseRequired = isPortugueseRequired(studyBlocks, plan);
  const load = getAguStudyLoadSeries(plan, examQuestions, today);
  const weeklyBlocks = (calendar.days || []).reduce((sum, day) => sum + (day.totalBlocks || 0), 0) / 2;
  const coverage = coverageProjection(plan, edital.topicProgress, today, weeklyBlocks);
  const nextSuggested = suggestNextBlock(plan, examQuestions, today, {
    topicProgress: edital.topicProgress,
    usedTopicKeys: (schedule.blocks || []).filter((b) => b.done).map((b) => `${b.subjectId}/${b.topicId}`),
    usedSubjectIds: (schedule.blocks || []).map((b) => b.subjectId).filter(Boolean),
    portugueseRequired,
    portugueseToday: (schedule.blocks || []).some((b) => b.subjectId === 'portugues'),
    blocks: studyBlocks
  });

  const subjects = AGU_SUBJECTS.map((subject) => {
    const stats = byId[subject.id] || { solved: 0, correct: 0, accuracy: 0, accSmooth: 0.5 };
    const editalSubject = edital.subjects.find((s) => s.id === subject.id);
    const cursor = currentOpenTopic(plan, subject, edital.topicProgress) || currentTopicForSubject(plan, subject);
    return {
      ...subject,
      groupMeta: AGU_GROUPS[subject.group] || AGU_GROUPS.extra,
      stats,
      cursor,
      mastery: getSubjectMastery(stats, topicStats, subject, plan?.staleDays || AGU_STALE_DAYS),
      platform: recommendPlatform(subject, stats),
      edital: editalSubject
    };
  });

  const started = subjects.filter((subject) => subject.stats.solved > 0).length;
  const mastered = subjects.filter((subject) => subject.mastery.id === 'mastered').length;
  const gaps = subjects.filter((subject) => subject.mastery.id === 'gap' || subject.mastery.id === 'close' || subject.mastery.id === 'repair');
  const totalSolved = subjects.reduce((sum, subject) => sum + subject.stats.solved, 0);
  const totalCorrect = subjects.reduce((sum, subject) => sum + subject.stats.correct, 0);
  const overallAccuracy = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 1000) / 10 : 0;

  const cycleDoneBlocks = calendar.days.reduce((sum, day) => sum + day.doneCount, 0);
  const cycleTotalBlocks = calendar.days.reduce((sum, day) => sum + day.totalBlocks, 0);
  const nextOpen = (schedule.blocks || []).find((b) => !b.done) || nextSuggested;

  return {
    started: Boolean(plan?.startedAt),
    startedAt: plan?.startedAt || null,
    phase,
    phaseMeta: AGU_PHASES[phase] || AGU_PHASES.fundacao,
    editalPublished: Boolean(plan?.editalPublished),
    keepPortuguese: portugueseRequired,
    portugueseRequired,
    portugueseWaiver: edital.portugueseWaiver,
    targetAccuracy: plan?.targetAccuracy || AGU_TARGET_ACCURACY,
    subjectStats: byId,
    topicStats,
    topicProgress: edital.topicProgress,
    subjects,
    edital,
    studyBlocks,
    nextBlock: nextOpen,
    today: schedule,
    calendar,
    todayProgress,
    startedSubjects: started,
    masteredSubjects: mastered,
    gapSubjects: gaps,
    totalSubjects: subjects.length,
    totalSolved,
    overallAccuracy,
    cycleDoneBlocks,
    cycleTotalBlocks,
    cyclePercent: cycleTotalBlocks > 0 ? Math.round((cycleDoneBlocks / cycleTotalBlocks) * 100) : 0,
    studyTime: getAguStudyTimeTotals(plan, examQuestions, today, calendar),
    debt: plan?.debt || [],
    errorNotebook: plan?.errorNotebook || [],
    homeostasis: { ...load, state: plan?.homeostasis || load.state },
    coverage,
    horizonMonths: plan?.horizonMonths || AGU_HORIZON_MONTHS_DEFAULT,
    examDate: plan?.examDate || null,
    reasons: calendar.reasons || [],
    warnings: calendar.warnings || []
  };
}

export function toggleCompletedBlock(plan, key) {
  const completed = { ...(plan.completedBlocks || {}) };
  if (completed[key]) delete completed[key];
  else completed[key] = new Date().toISOString();
  return {
    ...plan,
    completedBlocks: completed,
    updatedAt: new Date().toISOString()
  };
}

export function addBlockDuration(plan, key, minutes) {
  const amount = parseDurationMinutes(minutes);
  if (!plan || !key || amount <= 0) return plan;
  const blockDurations = { ...(plan.blockDurations || {}) };
  blockDurations[key] = parseDurationMinutes(blockDurations[key]) + amount;
  return {
    ...plan,
    blockDurations,
    updatedAt: new Date().toISOString()
  };
}

export function setBlockDuration(plan, key, minutes) {
  if (!plan || !key) return plan;
  const amount = parseDurationMinutes(minutes);
  const blockDurations = { ...(plan.blockDurations || {}) };
  if (amount > 0) blockDurations[key] = amount;
  else delete blockDurations[key];
  return {
    ...plan,
    blockDurations,
    updatedAt: new Date().toISOString()
  };
}

function remapBlockKey(plan, fromKey, toKey) {
  if (!plan || !fromKey || !toKey || fromKey === toKey) return plan;
  const completedBlocks = { ...(plan.completedBlocks || {}) };
  const blockDurations = { ...(plan.blockDurations || {}) };
  if (completedBlocks[fromKey]) {
    completedBlocks[toKey] = completedBlocks[fromKey];
    delete completedBlocks[fromKey];
  }
  if (completedBlocks[`${fromKey}|product`]) {
    completedBlocks[`${toKey}|product`] = completedBlocks[`${fromKey}|product`];
    delete completedBlocks[`${fromKey}|product`];
  }
  if (blockDurations[fromKey] != null) {
    blockDurations[toKey] = blockDurations[fromKey];
    delete blockDurations[fromKey];
  }
  return {
    ...plan,
    completedBlocks,
    blockDurations,
    updatedAt: new Date().toISOString()
  };
}

export function deleteStudyBlock(plan, key) {
  if (!plan || !key) return plan;
  const completedBlocks = { ...(plan.completedBlocks || {}) };
  const blockDurations = { ...(plan.blockDurations || {}) };
  delete completedBlocks[key];
  delete completedBlocks[`${key}|product`];
  delete blockDurations[key];
  return {
    ...plan,
    completedBlocks,
    blockDurations,
    updatedAt: new Date().toISOString()
  };
}

export function refreshAguProgress(plan, examQuestions = [], todayStr) {
  const today = todayStr || getSaoPauloDateStr();
  const progress = buildTopicProgress({ ...plan, topicStatus: {} }, examQuestions, today);
  const currentTopic = { ...(plan.currentTopic || {}) };
  AGU_SUBJECTS.forEach((subject) => {
    const open = currentOpenTopic(plan, subject, progress);
    if (open?.topicId) {
      currentTopic[subject.id] = {
        topicId: open.topicId,
        topicName: open.topicName,
        status: open.status,
        questionsOnTopic: open.questionsOnTopic || 0,
        correctOnTopic: open.correctOnTopic || 0
      };
    }
  });
  return {
    ...plan,
    currentTopic,
    topicStatus: serializeTopicStatus(progress),
    keepPortuguese: plan.keepPortuguese === false
      ? false
      : isPortugueseRequired(collectStudyBlocks(plan, examQuestions), plan),
    updatedAt: new Date().toISOString()
  };
}

export function updateStudyBlockMeta(plan, key, patch = {}) {
  if (!plan || !key) return { plan, key };
  const parsed = parseBlockKey(key);
  const dateStr = patch.dateStr || parsed.dateStr;
  const subjectId = patch.subjectId || parsed.subjectId;
  const rawKind = patch.kind || parsed.kind || 'estudo';
  const kind = rawKind === 'revisao' ? 'revisao' : 'estudo';
  const topicId = patch.topicId !== undefined ? patch.topicId : parsed.topicId;
  const nextKey = blockKey(dateStr, subjectId, kind, topicId);
  let next = remapBlockKey(plan, key, nextKey);
  if (patch.durationMinutes !== undefined) {
    next = setBlockDuration(next, nextKey, patch.durationMinutes);
  }
  const questions = Number(patch.totalQuestions);
  const minutes = patch.durationMinutes !== undefined
    ? parseDurationMinutes(patch.durationMinutes)
    : parseDurationMinutes(next.blockDurations?.[nextKey]);
  const complete = isBlockComplete({
    questions: Number.isFinite(questions) ? questions : 0,
    minutes
  });
  const completedBlocks = { ...(next.completedBlocks || {}) };
  if (complete) {
    completedBlocks[nextKey] = completedBlocks[nextKey] || new Date().toISOString();
  } else {
    delete completedBlocks[nextKey];
    delete completedBlocks[`${nextKey}|product`];
  }
  return {
    plan: {
      ...next,
      completedBlocks,
      updatedAt: new Date().toISOString()
    },
    key: nextKey
  };
}

export function logDiscursiveProduct(plan, key, payload = {}) {
  const completed = { ...(plan.completedBlocks || {}) };
  completed[key] = new Date().toISOString();
  completed[`${key}|product`] = new Date().toISOString();
  const currentCycle = plan.currentCycle
    ? {
      ...plan.currentCycle,
      days: (plan.currentCycle.days || []).map((day) => ({
        ...day,
        blocks: (day.blocks || []).map((block) => (
          block.key === key
            ? { ...block, productLogged: true, productNote: payload.note || '', done: true }
            : block
        ))
      }))
    }
    : plan.currentCycle;
  const rotation = Number(plan.discursiveRotationIndex || 0) + 1;
  return {
    ...plan,
    completedBlocks: completed,
    currentCycle,
    discursiveRotationIndex: rotation,
    updatedAt: new Date().toISOString()
  };
}

function archiveCurrentCycle(plan) {
  if (!plan?.currentCycle) return plan.generatedCycles || [];
  const generated = [...(plan.generatedCycles || [])];
  const last = generated[generated.length - 1];
  if (last && last.start === plan.currentCycle.start && last.number === plan.currentCycle.number) {
    generated[generated.length - 1] = plan.currentCycle;
    return generated;
  }
  generated.push(plan.currentCycle);
  return generated;
}

export function generateAndAttachCycle(plan, examQuestions, todayStr, options = {}) {
  const phase = detectPhase(plan, examQuestions, todayStr);
  const cycle = generateFortnight({ ...plan, phase }, examQuestions, todayStr, {
    ...options,
    phase,
    cycleNumber: options.cycleNumber || (plan.generatedCycles?.length || 0) + 1
  });
  return {
    ...plan,
    phase,
    currentCycle: cycle,
    cycleNumber: cycle.number,
    cycleStartDate: cycle.start,
    updatedAt: new Date().toISOString()
  };
}

export function startAguPlan(plan, todayStr, examQuestions = []) {
  const started = {
    ...plan,
    startedAt: todayStr,
    cycleStartDate: fortnightStartFor(todayStr),
    cycleNumber: 1,
    phase: plan?.editalPublished ? 'lock' : 'fundacao',
    generatedCycles: [],
    debt: [],
    updatedAt: new Date().toISOString()
  };
  return generateAndAttachCycle(started, examQuestions, todayStr, {
    startDate: fortnightStartFor(todayStr),
    cycleNumber: 1
  });
}

export function realignAguCycle(plan, todayStr, examQuestions = []) {
  const current = plan?.currentCycle;
  const start = current?.start && todayStr <= current.end
    ? current.start
    : fortnightStartFor(todayStr);
  const regenerated = generateFortnight(plan, examQuestions, todayStr, {
    startDate: start,
    cycleNumber: current?.number || plan.cycleNumber || 1,
    phase: detectPhase(plan, examQuestions, todayStr)
  });
  regenerated.days = regenerated.days.map((day) => {
    if (day.dateStr < todayStr && current?.days) {
      const prev = current.days.find((d) => d.dateStr === day.dateStr);
      return prev || day;
    }
    return day;
  });
  return {
    ...plan,
    currentCycle: regenerated,
    cycleStartDate: start,
    updatedAt: new Date().toISOString()
  };
}

export function advanceAguCycle(plan, todayStr, examQuestions = []) {
  const generatedCycles = archiveCurrentCycle(plan);
  const debt = collectDebtFromCycle(plan.currentCycle, todayStr, plan.completedBlocks, examQuestions);
  const nextNumber = (plan.currentCycle?.number || generatedCycles.length || 1) + 1;
  const nextStart = todayStr;
  const nextPlan = {
    ...plan,
    generatedCycles,
    debt: normalizeDebt([...(plan.debt || []), ...debt], todayStr),
    cycleNumber: nextNumber,
    cycleStartDate: nextStart
  };
  return generateAndAttachCycle(nextPlan, examQuestions, todayStr, {
    startDate: nextStart,
    cycleNumber: nextNumber
  });
}

function cycleStartContaining(plan, todayStr) {
  const origin = plan?.startedAt || plan?.cycleStartDate || todayStr;
  const elapsed = Math.max(0, daysBetweenDateStr(origin, todayStr));
  const index = Math.floor(elapsed / AGU_CYCLE_LENGTH);
  return {
    start: addDaysToDateStr(origin, index * AGU_CYCLE_LENGTH),
    number: index + 1
  };
}

export function ensureCurrentCycle(plan, examQuestions = [], todayStr) {
  let next = plan;
  const today = todayStr || getSaoPauloDateStr();
  if (!next?.startedAt) return next;
  const due = cycleStartContaining(next, today);
  const current = next.currentCycle;
  const missing = !current?.start || !current?.end;
  const stale = current?.end && today > current.end;
  if (missing || stale) {
    if (current && stale) {
      next = {
        ...next,
        generatedCycles: archiveCurrentCycle(next),
        debt: normalizeDebt([
          ...(next.debt || []),
          ...collectDebtFromCycle(current, today, next.completedBlocks, examQuestions)
        ], today)
      };
    }
    next = generateAndAttachCycle(next, examQuestions, today, {
      startDate: due.start,
      cycleNumber: due.number
    });
  }
  const detected = detectPhase(next, examQuestions, today);
  if (detected !== next.phase) {
    next = { ...next, phase: detected, updatedAt: new Date().toISOString() };
  }
  return next;
}

export function applyExamToPlan(plan, entry, todayStr, examQuestions = null) {
  if (!plan || !entry) return plan;
  const subject = resolveExamSubject(entry);
  if (!subject) return plan;
  const allExams = Array.isArray(examQuestions) ? examQuestions : [];
  const hasEntry = allExams.some((item) => item === entry || (entry.id && item.id === entry.id));
  const exams = hasEntry ? allExams : [entry, ...allExams];
  const progress = buildTopicProgress(plan, exams, entry.date || todayStr);
  const currentTopic = { ...(plan.currentTopic || {}) };
  const topic = resolveExamTopic(entry, subject);
  const topicId = entry.topicId || topic?.id;
  if (topicId) {
    const row = progress[topicKey(subject.id, topicId)];
    currentTopic[subject.id] = {
      topicId,
      topicName: topic?.name || row?.topicName,
      status: row?.status || 'in_progress',
      questionsOnTopic: row?.initialSolved || 0,
      correctOnTopic: row?.initialCorrect || 0
    };
  }
  let debt = [...(plan.debt || [])];
  if (entry.blockKey || (entry.subjectId && entry.date)) {
    debt = debt.map((item) => {
      if (item.subjectId !== (entry.subjectId || subject.id)) return item;
      if (item.topicId && entry.topicId && item.topicId !== entry.topicId) return item;
      const remaining = Math.max(0, (item.remainingQuestions || 0) - (entry.totalQuestions || 0));
      return { ...item, remainingQuestions: remaining };
    }).filter((item) => item.productMissing || (item.remainingQuestions || 0) > 0);
  }
  return {
    ...plan,
    currentTopic,
    topicStatus: serializeTopicStatus(progress),
    keepPortuguese: plan.keepPortuguese === false
      ? false
      : isPortugueseRequired(collectStudyBlocks(plan, exams), plan),
    debt,
    updatedAt: new Date().toISOString()
  };
}

function alignExamTopicWithBlockKey(entry) {
  if (!entry?.blockKey || !entry.topicId) return entry;
  const parsed = parseBlockKey(entry.blockKey);
  if (!parsed.topicId || parsed.topicId === entry.topicId) return entry;
  if (parsed.subjectId && entry.subjectId && parsed.subjectId !== entry.subjectId) return entry;
  const topic = getAguSubject(parsed.subjectId)?.topics?.find((item) => item.id === parsed.topicId);
  return {
    ...entry,
    topicId: parsed.topicId,
    topic: topic?.name || entry.topic
  };
}

export function migrateAguExams(examQuestions = []) {
  return (examQuestions || []).map(alignExamTopicWithBlockKey);
}

export function sanitizeAguPlan(plan, todayStr, examQuestions = []) {
  const today = todayStr || getSaoPauloDateStr();
  const base = createDefaultAguPlan(today);
  if (!plan || typeof plan !== 'object') return base;
  const capacity = plan.capacityByWeekday && typeof plan.capacityByWeekday === 'object'
    ? { ...AGU_DEFAULT_CAPACITY_BY_WEEKDAY, ...plan.capacityByWeekday }
    : { ...AGU_DEFAULT_CAPACITY_BY_WEEKDAY };
  const merged = {
    ...base,
    ...plan,
    capacityByWeekday: capacity
  };
  const exams = migrateAguExams(examQuestions);
  const minutesByDate = studyMinutesByDate(merged, exams);
  const incomingHomeostasis = plan.homeostasis && plan.homeostasis.seeded ? plan.homeostasis : null;
  const seeded = incomingHomeostasis
    ? { ...migrateCapacityToHomeostasis(merged, minutesByDate, today), ...incomingHomeostasis, seeded: true }
    : migrateCapacityToHomeostasis(merged, minutesByDate, today);
  const evaluated = aguStudyHomeostasis(
    { ...merged, homeostasis: seeded },
    exams,
    today,
    { evaluate: Boolean(seeded.evaluateNow), minutesByDate }
  );
  const homeostasis = {
    ...seeded,
    ...(evaluated.state || {}),
    setpointMinutes: evaluated.setpointMinutes || seeded.setpointMinutes,
    seeded: true,
    evaluateNow: false
  };
  const dailyBlocks = Math.min(AGU_DAILY_BLOCKS_MAX, Math.max(1, blocksPerDayForSetpoint({ ...merged, homeostasis }, getSaoPauloDayOfWeek(today))));
  return {
    ...merged,
    version: AGU_PLAN_VERSION,
    phase: AGU_PHASES[plan.phase] ? plan.phase : 'fundacao',
    editalPublished: Boolean(plan.editalPublished),
    keepPortuguese: plan.keepPortuguese !== false,
    capacityByWeekday: capacity,
    homeostasis,
    horizonMonths: Number(plan.horizonMonths) > 0 ? Number(plan.horizonMonths) : AGU_HORIZON_MONTHS_DEFAULT,
    examDate: plan.examDate || null,
    weekdaysMorning: AGU_WEEKDAY_MORNING_MINUTES,
    dailyBlocks,
    blockMinutes: AGU_BLOCK_MINUTES,
    blockQuestionTarget: AGU_BLOCK_QUESTION_TARGET,
    cycleLengthDays: AGU_CYCLE_LENGTH,
    targetAccuracy: Number(plan.targetAccuracy) > 0 ? Number(plan.targetAccuracy) : AGU_TARGET_ACCURACY,
    dailyQuestionTarget: AGU_WEEKDAY_QUESTION_TARGET,
    masterMinSolved: Number(plan.masterMinSolved) > 0 ? Number(plan.masterMinSolved) : AGU_MASTER_MIN_SOLVED,
    staleDays: Number(plan.staleDays) > 0 ? Number(plan.staleDays) : AGU_STALE_DAYS,
    completedBlocks: plan.completedBlocks && typeof plan.completedBlocks === 'object' ? plan.completedBlocks : {},
    blockDurations: plan.blockDurations && typeof plan.blockDurations === 'object' ? plan.blockDurations : {},
    topicStatus: plan.topicStatus && typeof plan.topicStatus === 'object' ? plan.topicStatus : {},
    subjectNotes: plan.subjectNotes && typeof plan.subjectNotes === 'object' ? plan.subjectNotes : {},
    currentTopic: plan.currentTopic && typeof plan.currentTopic === 'object' ? plan.currentTopic : {},
    currentCycle: plan.currentCycle && typeof plan.currentCycle === 'object' ? plan.currentCycle : null,
    generatedCycles: Array.isArray(plan.generatedCycles) ? plan.generatedCycles : [],
    debt: normalizeDebt(Array.isArray(plan.debt) ? plan.debt : [], today),
    errorNotebook: Array.isArray(plan.errorNotebook) ? plan.errorNotebook : [],
    discursiveRotationIndex: Number(plan.discursiveRotationIndex) || 0,
    editalProfileId: plan.editalProfileId || AGU_DEFAULT_EDITAL_PROFILE_ID,
    updatedAt: plan.updatedAt || new Date().toISOString()
  };
}

function errorId() {
  return `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function addAguError(plan, input = {}, todayStr) {
  const today = todayStr || input.date || getSaoPauloDateStr();
  const notebook = [...(plan?.errorNotebook || [])];
  notebook.unshift({
    id: input.id || errorId(),
    subjectId: input.subjectId || null,
    topicId: input.topicId || null,
    note: String(input.note || input.text || '').trim(),
    questionId: input.questionId || null,
    url: input.url || null,
    createdAt: today,
    nextReviewAt: addDaysToDateStr(today, AGU_ERROR_REVIEW_INTERVALS[0]),
    reviews: 0,
    lapses: 0,
    resolved: false
  });
  return { ...plan, errorNotebook: notebook, updatedAt: new Date().toISOString() };
}

export function reviewAguError(plan, id, quality = 2, todayStr) {
  const today = todayStr || getSaoPauloDateStr();
  const notebook = (plan?.errorNotebook || []).map((item) => {
    if (item.id !== id) return item;
    const remembered = Number(quality) >= 2;
    const reviews = (item.reviews || 0) + (remembered ? 1 : 0);
    const lapses = (item.lapses || 0) + (remembered ? 0 : 1);
    const step = remembered ? Math.min(reviews, AGU_ERROR_REVIEW_INTERVALS.length - 1) : 0;
    return {
      ...item,
      reviews,
      lapses,
      resolved: remembered && step >= AGU_ERROR_REVIEW_INTERVALS.length - 1,
      nextReviewAt: addDaysToDateStr(today, AGU_ERROR_REVIEW_INTERVALS[step])
    };
  });
  return { ...plan, errorNotebook: notebook, updatedAt: new Date().toISOString() };
}

export function dueAguErrors(plan, todayStr) {
  const today = todayStr || getSaoPauloDateStr();
  return (plan?.errorNotebook || []).filter((item) => !item.resolved && item.nextReviewAt && item.nextReviewAt <= today);
}

export { parseBlockKey };
