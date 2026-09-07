import {
  AGU_CYCLE_LENGTH,
  AGU_CYCLE_TEMPLATE,
  AGU_GROUPS,
  AGU_KIND_META,
  AGU_MASTER_MIN_SOLVED,
  AGU_SUBJECTS,
  AGU_TARGET_ACCURACY,
  AGU_WEEKDAY_QUESTION_TARGET,
  blockKey,
  createDefaultAguPlan,
  getAguSubject,
  recommendPlatform
} from '../data/aguCurriculum.js';
import { addDaysToDateStr, getSaoPauloDateStr, getSaoPauloDayOfWeek } from './timeUtils.js';

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function getCycleStartDate(plan, todayStr) {
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

function emptyStats() {
  return { solved: 0, correct: 0, wrong: 0, accuracy: 0, sessions: 0, minutes: 0 };
}

export function matchExamToSubject(entry, subject) {
  if (!entry || !subject) return false;
  const hay = `${entry.subject || ''} ${entry.topic || ''}`.toLowerCase();
  const name = subject.name.toLowerCase();
  if (hay.includes(name.toLowerCase())) return true;
  const aliases = {
    constitucional: ['constitucional'],
    administrativo: ['administrativo'],
    financeiro: ['financeiro', 'afo', 'orçamento'],
    economico: ['econômico', 'economico'],
    tributario: ['tributário', 'tributario'],
    seguridade: ['seguridade', 'previdenci'],
    ambiental: ['ambiental'],
    'leg-agu': ['legislação da agu', 'legislacao da agu', 'lc 73', 'lei orgânica da agu'],
    civil: ['direito civil', 'lindb'],
    'processual-civil': ['processual civil', 'processo civil'],
    'leg-civil-esp': ['legislação civil', 'mandado de segurança', 'ação popular'],
    empresarial: ['empresarial', 'comercial'],
    internacional: ['internacional', 'direitos humanos'],
    penal: ['direito penal'],
    'processual-penal': ['processual penal', 'processo penal'],
    'leg-penal-esp': ['legislação penal', 'lei 8.137', 'lavagem'],
    trabalho: ['direito do trabalho'],
    'processual-trabalho': ['processual do trabalho', 'processo do trabalho'],
    agrario: ['agrário', 'agrario'],
    'educacao-cti': ['educação', 'ldb', 'inovação'],
    portugues: ['português', 'portugues', 'língua portuguesa', 'lingua portuguesa', 'ortografia']
  };
  return (aliases[subject.id] || []).some((alias) => hay.includes(alias));
}

export function buildSubjectStats(examQuestions = []) {
  const byId = {};
  AGU_SUBJECTS.forEach((subject) => {
    byId[subject.id] = emptyStats();
  });

  examQuestions.forEach((entry) => {
    const subject = AGU_SUBJECTS.find((item) => matchExamToSubject(entry, item));
    if (!subject) return;
    const stats = byId[subject.id];
    stats.solved += entry.totalQuestions || 0;
    stats.correct += entry.correctAnswers || 0;
    stats.wrong += entry.wrongAnswers || 0;
    stats.sessions += 1;
    stats.minutes += entry.durationMinutes || 0;
  });

  Object.values(byId).forEach((stats) => {
    stats.accuracy = stats.solved > 0
      ? Math.round((stats.correct / stats.solved) * 1000) / 10
      : 0;
  });

  return byId;
}

export function getSubjectMastery(stats) {
  const solved = stats?.solved || 0;
  const accuracy = stats?.accuracy || 0;
  if (solved === 0) return { id: 'idle', label: 'Não iniciado', color: '#64748b' };
  if (solved < AGU_MASTER_MIN_SOLVED) return { id: 'opening', label: 'Abertura', color: '#38bdf8' };
  if (accuracy >= AGU_TARGET_ACCURACY) return { id: 'mastered', label: 'Maestria 90%', color: '#10b981' };
  if (accuracy >= 80) return { id: 'close', label: 'Quase lá', color: '#f59e0b' };
  return { id: 'gap', label: 'Furo', color: '#f43f5e' };
}

export function getSubjectProgressOnDate(examQuestions = [], subject, dateStr) {
  const entries = (examQuestions || []).filter((entry) => (
    (entry.date || '') === dateStr && matchExamToSubject(entry, subject)
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

export function getDaySchedule(plan, dateStr, subjectStats = {}, examQuestions = []) {
  const cycleIndex = getCycleDayIndex(plan, dateStr);
  const template = getTemplateDay(cycleIndex);
  const weekday = getSaoPauloDayOfWeek(dateStr);
  const completed = plan?.completedBlocks || {};

  const blocks = (template.blocks || []).map((block, index) => {
    const subject = getAguSubject(block.subjectId);
    const stats = subjectStats[block.subjectId] || emptyStats();
    const platform = recommendPlatform(subject, stats);
    const key = blockKey(dateStr, block.subjectId, block.kind);
    const markedDone = Boolean(completed[key]);
    const kindMeta = AGU_KIND_META[block.kind] || AGU_KIND_META.questoes;
    const group = AGU_GROUPS[subject?.group] || AGU_GROUPS.extra;
    const todayProgress = getSubjectProgressOnDate(examQuestions, subject, dateStr);
    const target = block.target || 0;
    const remaining = Math.max(0, target - todayProgress.solved);
    const metTarget = target > 0 && todayProgress.solved >= target;
    const done = markedDone || metTarget;
    const progressPercent = target > 0
      ? Math.min(100, Math.round((todayProgress.solved / target) * 100))
      : (done ? 100 : 0);

    return {
      ...block,
      index,
      key,
      dateStr,
      done,
      markedDone,
      metTarget,
      remaining,
      progressPercent,
      todayProgress,
      subject,
      stats,
      platform,
      kindMeta,
      group,
      mastery: getSubjectMastery(stats)
    };
  });

  const questionTarget = blocks.reduce((sum, block) => sum + (block.target || 0), 0);
  const doneCount = blocks.filter((block) => block.done).length;

  return {
    dateStr,
    cycleIndex,
    cycleDay: cycleIndex + 1,
    cycleNumber: getCycleNumber(plan, dateStr),
    weekday,
    weekdayLabel: DAY_LABELS[weekday],
    label: template.label,
    isWeekend: weekday === 0 || weekday === 6,
    blocks,
    questionTarget,
    doneCount,
    totalBlocks: blocks.length,
    complete: blocks.length > 0 && doneCount === blocks.length
  };
}

export function getCycleCalendar(plan, todayStr, subjectStats = {}, examQuestions = []) {
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
  const subjectStats = buildSubjectStats(examQuestions);
  const today = todayStr || getSaoPauloDateStr();
  const schedule = getDaySchedule(plan, today, subjectStats, examQuestions);
  const calendar = getCycleCalendar(plan, today, subjectStats, examQuestions);
  const todayProgress = getTodayQuestionProgress(examQuestions, today);

  const subjects = AGU_SUBJECTS.map((subject) => {
    const stats = subjectStats[subject.id] || emptyStats();
    return {
      ...subject,
      groupMeta: AGU_GROUPS[subject.group] || AGU_GROUPS.extra,
      stats,
      mastery: getSubjectMastery(stats),
      platform: recommendPlatform(subject, stats)
    };
  });

  const started = subjects.filter((subject) => subject.stats.solved > 0).length;
  const mastered = subjects.filter((subject) => subject.mastery.id === 'mastered').length;
  const gaps = subjects.filter((subject) => subject.mastery.id === 'gap' || subject.mastery.id === 'close');
  const totalSolved = subjects.reduce((sum, subject) => sum + subject.stats.solved, 0);
  const totalCorrect = subjects.reduce((sum, subject) => sum + subject.stats.correct, 0);
  const overallAccuracy = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 1000) / 10 : 0;

  const cycleDoneBlocks = calendar.days.reduce((sum, day) => sum + day.doneCount, 0);
  const cycleTotalBlocks = calendar.days.reduce((sum, day) => sum + day.totalBlocks, 0);

  return {
    started: Boolean(plan?.startedAt),
    startedAt: plan?.startedAt || null,
    targetAccuracy: plan?.targetAccuracy || AGU_TARGET_ACCURACY,
    subjectStats,
    subjects,
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
    cyclePercent: cycleTotalBlocks > 0 ? Math.round((cycleDoneBlocks / cycleTotalBlocks) * 100) : 0
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

export function startAguPlan(plan, todayStr) {
  return {
    ...plan,
    startedAt: todayStr,
    cycleStartDate: todayStr,
    cycleNumber: 1,
    updatedAt: new Date().toISOString()
  };
}

export function realignAguCycle(plan, todayStr) {
  return {
    ...plan,
    cycleStartDate: todayStr,
    startedAt: plan?.startedAt || todayStr,
    updatedAt: new Date().toISOString()
  };
}

export function sanitizeAguPlan(plan, todayStr) {
  const base = createDefaultAguPlan(todayStr);
  if (!plan || typeof plan !== 'object') return base;
  return {
    ...base,
    ...plan,
    version: 1,
    cycleLengthDays: AGU_CYCLE_LENGTH,
    targetAccuracy: Number(plan.targetAccuracy) > 0 ? Number(plan.targetAccuracy) : AGU_TARGET_ACCURACY,
    dailyQuestionTarget: Number(plan.dailyQuestionTarget) > 0 ? Number(plan.dailyQuestionTarget) : AGU_WEEKDAY_QUESTION_TARGET,
    completedBlocks: plan.completedBlocks && typeof plan.completedBlocks === 'object' ? plan.completedBlocks : {},
    topicStatus: plan.topicStatus && typeof plan.topicStatus === 'object' ? plan.topicStatus : {},
    subjectNotes: plan.subjectNotes && typeof plan.subjectNotes === 'object' ? plan.subjectNotes : {},
    currentTopic: plan.currentTopic && typeof plan.currentTopic === 'object' ? plan.currentTopic : {},
    updatedAt: plan.updatedAt || new Date().toISOString()
  };
}
