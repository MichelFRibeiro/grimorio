import {
  AGU_MASTER_MIN_SOLVED,
  AGU_PHASES,
  AGU_STALE_DAYS,
  AGU_SUBJECT_MASTERY_TOPIC_RATIO,
  AGU_SUBJECTS,
  AGU_TARGET_ACCURACY,
  AGU_TOPIC_ADVANCE_ACCURACY,
  AGU_TOPIC_ADVANCE_MIN,
  AGU_WINDOW_N_BY_PHASE,
  getAguSubject,
  getEditalProfile,
  recommendPlatform
} from '../data/aguCurriculum.js';
import { daysBetweenDateStr } from './timeUtils.js';

export function emptyStats() {
  return {
    solved: 0,
    correct: 0,
    wrong: 0,
    accuracy: 0,
    accSmooth: 0.5,
    sessions: 0,
    minutes: 0,
    lastTouchedAt: null
  };
}

export function laplaceAccuracy(correct, solved) {
  const c = Math.max(0, Number(correct) || 0);
  const s = Math.max(0, Number(solved) || 0);
  return (c + 2) / (s + 4);
}

export function accuracyPct(acc) {
  return Math.round((Number(acc) || 0) * 1000) / 10;
}

function haystack(entry) {
  return `${entry?.subject || ''} ${entry?.topic || ''} ${entry?.notes || ''}`.toLowerCase();
}

const SUBJECT_ALIASES = {
  constitucional: ['constitucional'],
  administrativo: ['administrativo'],
  financeiro: ['financeiro', 'afo', 'orçamento', 'orcamento'],
  economico: ['econômico', 'economico'],
  tributario: ['tributário', 'tributario'],
  seguridade: ['seguridade', 'previdenci'],
  ambiental: ['ambiental'],
  'leg-agu': ['legislação da agu', 'legislacao da agu', 'lc 73', 'lei orgânica da agu', 'lei organica da agu'],
  civil: ['direito civil'],
  'processual-civil': ['processual civil', 'processo civil'],
  'leg-civil-esp': ['legislação civil', 'legislacao civil', 'mandado de segurança', 'acao popular', 'ação popular'],
  empresarial: ['empresarial', 'comercial'],
  internacional: ['internacional', 'direitos humanos'],
  penal: ['direito penal'],
  'processual-penal': ['processual penal', 'processo penal'],
  'leg-penal-esp': ['legislação penal', 'legislacao penal', 'lei 8.137', 'lavagem'],
  trabalho: ['direito do trabalho'],
  'processual-trabalho': ['processual do trabalho', 'processo do trabalho'],
  agrario: ['agrário', 'agrario'],
  'educacao-cti': ['educação', 'educacao', 'ldb', 'inovação', 'inovacao'],
  portugues: ['português', 'portugues', 'língua portuguesa', 'lingua portuguesa', 'ortografia']
};

export function matchExamToSubject(entry, subject) {
  if (!entry || !subject) return false;
  if (entry.subjectId && entry.subjectId === subject.id) return true;

  const hay = haystack(entry);
  if (hay.includes('lindb')) {
    if (subject.id === 'leg-civil-esp') {
      return hay.includes('legislação civil') || hay.includes('legislacao civil') || entry.subjectId === 'leg-civil-esp';
    }
    if (subject.id === 'civil') {
      return entry.subjectId !== 'leg-civil-esp' && !hay.includes('legislação civil') && !hay.includes('legislacao civil');
    }
  }

  const name = subject.name.toLowerCase();
  if (hay.includes(name)) return true;
  return (SUBJECT_ALIASES[subject.id] || []).some((alias) => hay.includes(alias));
}

export function resolveExamSubject(entry) {
  if (!entry) return null;
  if (entry.subjectId) {
    const byId = getAguSubject(entry.subjectId);
    if (byId) return byId;
  }
  return AGU_SUBJECTS.find((subject) => matchExamToSubject(entry, subject)) || null;
}

export function resolveExamTopic(entry, subject) {
  if (!subject) return null;
  if (entry?.topicId) {
    const byId = (subject.topics || []).find((t) => t.id === entry.topicId);
    if (byId) return byId;
  }
  const hay = `${entry?.topic || ''}`.toLowerCase();
  if (!hay) return (subject.topics || [])[0] || null;
  const hit = (subject.topics || []).find((topic) => (
    hay.includes(String(topic.id).toLowerCase()) || hay.includes(String(topic.name).toLowerCase())
  ));
  return hit || (subject.topics || [])[0] || null;
}

function topicKey(subjectId, topicId) {
  return `${subjectId}/${topicId || '_'}`;
}

export function buildTopicStats(examQuestions = [], todayStr) {
  const byKey = {};
  const ensure = (subjectId, topicId) => {
    const key = topicKey(subjectId, topicId);
    if (!byKey[key]) {
      byKey[key] = { subjectId, topicId, ...emptyStats() };
    }
    return byKey[key];
  };

  (examQuestions || []).forEach((entry) => {
    const subject = resolveExamSubject(entry);
    if (!subject) return;
    const topic = resolveExamTopic(entry, subject);
    const stats = ensure(subject.id, topic?.id || null);
    stats.solved += entry.totalQuestions || 0;
    stats.correct += entry.correctAnswers || 0;
    stats.wrong += entry.wrongAnswers || 0;
    stats.sessions += 1;
    stats.minutes += entry.durationMinutes || 0;
    const dateStr = entry.date || '';
    if (dateStr && (!stats.lastTouchedAt || dateStr > stats.lastTouchedAt)) {
      stats.lastTouchedAt = dateStr;
    }
  });

  Object.values(byKey).forEach((stats) => {
    stats.accuracy = stats.solved > 0
      ? Math.round((stats.correct / stats.solved) * 1000) / 10
      : 0;
    stats.accSmooth = laplaceAccuracy(stats.correct, stats.solved);
    stats.daysSince = stats.lastTouchedAt && todayStr
      ? Math.max(0, daysBetweenDateStr(stats.lastTouchedAt, todayStr))
      : (stats.solved > 0 ? 30 : 0);
  });

  return byKey;
}

export function buildSubjectStats(examQuestions = [], todayStr) {
  const byId = {};
  AGU_SUBJECTS.forEach((subject) => {
    byId[subject.id] = { ...emptyStats(), topicsOpened: 0, topicsMastered: 0 };
  });

  const topicStats = buildTopicStats(examQuestions, todayStr);

  (examQuestions || []).forEach((entry) => {
    const subject = resolveExamSubject(entry);
    if (!subject) return;
    const stats = byId[subject.id];
    stats.solved += entry.totalQuestions || 0;
    stats.correct += entry.correctAnswers || 0;
    stats.wrong += entry.wrongAnswers || 0;
    stats.sessions += 1;
    stats.minutes += entry.durationMinutes || 0;
    const dateStr = entry.date || '';
    if (dateStr && (!stats.lastTouchedAt || dateStr > stats.lastTouchedAt)) {
      stats.lastTouchedAt = dateStr;
    }
  });

  Object.entries(byId).forEach(([subjectId, stats]) => {
    stats.accuracy = stats.solved > 0
      ? Math.round((stats.correct / stats.solved) * 1000) / 10
      : 0;
    stats.accSmooth = laplaceAccuracy(stats.correct, stats.solved);
    stats.daysSince = stats.lastTouchedAt && todayStr
      ? Math.max(0, daysBetweenDateStr(stats.lastTouchedAt, todayStr))
      : (stats.solved > 0 ? 30 : 0);
    const subject = getAguSubject(subjectId);
    const topicIds = (subject?.topics || []).map((t) => t.id);
    const opened = topicIds.filter((id) => (topicStats[topicKey(subjectId, id)]?.solved || 0) > 0);
    stats.topicsOpened = opened.length;
    stats.topicsTotal = topicIds.length;
  });

  return { byId, topicStats };
}

export function getTopicMastery(stats, staleDays = AGU_STALE_DAYS) {
  const solved = stats?.solved || 0;
  const accSmooth = stats?.accSmooth ?? laplaceAccuracy(stats?.correct || 0, solved);
  const daysSince = stats?.daysSince ?? 999;
  if (solved === 0) return { id: 'idle', label: 'Não iniciado', color: '#64748b' };
  if (solved < AGU_MASTER_MIN_SOLVED) return { id: 'opening', label: 'Abertura', color: '#38bdf8' };
  if (daysSince > staleDays) return { id: 'repair', label: 'Frio — repair', color: '#f59e0b' };
  if (accSmooth >= AGU_TARGET_ACCURACY / 100) return { id: 'mastered', label: 'Maestria 90%', color: '#10b981' };
  if (accSmooth >= 0.80) return { id: 'close', label: 'Quase lá', color: '#f59e0b' };
  return { id: 'gap', label: 'Furo', color: '#f43f5e' };
}

export function getSubjectMastery(stats, topicStats = {}, subject, staleDays = AGU_STALE_DAYS) {
  const solved = stats?.solved || 0;
  if (solved === 0) return { id: 'idle', label: 'Não iniciado', color: '#64748b' };
  const topics = subject?.topics || [];
  if (topics.length === 0) return getTopicMastery(stats, staleDays);
  const mastered = topics.filter((topic) => {
    const tStats = topicStats[topicKey(subject.id, topic.id)];
    return getTopicMastery(tStats, staleDays).id === 'mastered';
  }).length;
  const ratio = mastered / topics.length;
  const highWeightGap = topics.some((topic) => {
    const tStats = topicStats[topicKey(subject.id, topic.id)];
    const mastery = getTopicMastery(tStats, staleDays);
    return mastery.id === 'gap' || mastery.id === 'repair';
  });
  if (ratio >= AGU_SUBJECT_MASTERY_TOPIC_RATIO && !highWeightGap && solved >= AGU_MASTER_MIN_SOLVED) {
    return { id: 'mastered', label: 'Maestria 90%', color: '#10b981' };
  }
  if (solved < AGU_MASTER_MIN_SOLVED) return { id: 'opening', label: 'Abertura', color: '#38bdf8' };
  if ((stats.accSmooth || 0) >= 0.80) return { id: 'close', label: 'Quase lá', color: '#f59e0b' };
  return { id: 'gap', label: 'Furo', color: '#f43f5e' };
}

export function shouldAdvanceTopic(stats) {
  const solved = stats?.solved || 0;
  const accSmooth = stats?.accSmooth ?? laplaceAccuracy(stats?.correct || 0, solved);
  return solved >= AGU_TOPIC_ADVANCE_MIN && accSmooth >= AGU_TOPIC_ADVANCE_ACCURACY / 100;
}

export function currentTopicForSubject(plan, subject) {
  const stored = plan?.currentTopic?.[subject.id];
  if (stored?.topicId) {
    const found = (subject.topics || []).find((t) => t.id === stored.topicId);
    if (found) {
      return {
        topicId: found.id,
        topicName: found.name,
        tecGuideUrl: subject.tecGuideUrl,
        status: stored.status || 'open',
        openedAt: stored.openedAt || null,
        questionsOnTopic: stored.questionsOnTopic || 0,
        correctOnTopic: stored.correctOnTopic || 0
      };
    }
  }
  const first = (subject.topics || [])[0];
  if (!first) return null;
  return {
    topicId: first.id,
    topicName: first.name,
    tecGuideUrl: subject.tecGuideUrl,
    status: 'open',
    openedAt: null,
    questionsOnTopic: 0,
    correctOnTopic: 0
  };
}

export function nextClosedTopic(plan, subject, topicStats = {}) {
  const topics = subject.topics || [];
  for (const topic of topics) {
    const status = plan?.topicStatus?.[topicKey(subject.id, topic.id)]?.status;
    const solved = topicStats[topicKey(subject.id, topic.id)]?.solved || 0;
    if (status !== 'closed' && solved < AGU_TOPIC_ADVANCE_MIN) return topic;
  }
  return topics[topics.length - 1] || null;
}

function sampleTrust(solved) {
  return Math.min(1, (solved || 0) / AGU_MASTER_MIN_SOLVED);
}

export function subjectPriorityScore({
  subject,
  stats,
  phase = 'fundacao',
  debtMod = 1,
  repairMod = 1,
  lastCycleBlocks = 0,
  staleDays = AGU_STALE_DAYS,
  editalProfile
}) {
  const solved = stats?.solved || 0;
  const accSmooth = stats?.accSmooth ?? 0.5;
  const daysSince = stats?.daysSince ?? 0;
  const weakness = Math.max(0, 0.90 - accSmooth);
  const unknown = solved === 0 ? 1 : 0;
  const stale = solved === 0 ? 1 : Math.min(4, 1 + daysSince / staleDays);
  const weight = Number(subject?.weight) || 1;
  const group = subject?.group;
  let phaseMod = 1;
  if (phase === 'fundacao') {
    phaseMod = group === 1 || subject?.extra ? 1.3 : 0.7;
  } else if (phase === 'aprofundamento') {
    phaseMod = group === 2 || group === 3 ? 1.2 : 1;
  } else if (phase === 'simulados') {
    phaseMod = accSmooth < 0.8 ? 1.3 : 0.9;
  } else if (phase === 'lock') {
    const allowed = new Set((editalProfile?.subjects || []).map((s) => s.id));
    if (subject?.extra && editalProfile?.keepPortugueseDefault) phaseMod = 1;
    else phaseMod = allowed.has(subject.id) ? 1.2 : 0;
  }

  const score = weight * phaseMod * debtMod * repairMod
    * (1.2 * unknown + (0.4 + weakness) * (0.4 + sampleTrust(solved)))
    * stale
    * (1 + Math.max(0, 2 - lastCycleBlocks) * 0.05);

  return Math.round(score * 1000) / 1000;
}

export function rankSubjects(plan, examQuestions, todayStr) {
  const { byId, topicStats } = buildSubjectStats(examQuestions, todayStr);
  const phase = plan?.phase || 'fundacao';
  const editalProfile = getEditalProfile(plan?.editalProfileId);
  const lastCycle = plan?.generatedCycles?.slice(-1)[0] || plan?.currentCycle;
  const lastCounts = {};
  (lastCycle?.days || []).forEach((day) => {
    (day.blocks || []).forEach((block) => {
      lastCounts[block.subjectId] = (lastCounts[block.subjectId] || 0) + 1;
    });
  });
  const debtBySubject = {};
  (plan?.debt || []).forEach((item) => {
    debtBySubject[item.subjectId] = (debtBySubject[item.subjectId] || 0) + 1;
  });

  const ranked = AGU_SUBJECTS.map((subject) => {
    const stats = byId[subject.id];
    const cursor = currentTopicForSubject(plan, subject);
    const tStats = topicStats[topicKey(subject.id, cursor?.topicId)] || emptyStats();
    const repair = getTopicMastery(tStats, plan?.staleDays || AGU_STALE_DAYS).id === 'repair'
      || cursor?.status === 'repair';
    const score = subjectPriorityScore({
      subject,
      stats,
      phase,
      debtMod: debtBySubject[subject.id] ? 1.5 : 1,
      repairMod: repair ? 1.4 : 1,
      lastCycleBlocks: lastCounts[subject.id] || 0,
      staleDays: plan?.staleDays || AGU_STALE_DAYS,
      editalProfile: {
        ...editalProfile,
        keepPortugueseDefault: plan?.keepPortuguese !== false
      }
    });
    return {
      subject,
      stats,
      cursor,
      score,
      mastery: getSubjectMastery(stats, topicStats, subject, plan?.staleDays || AGU_STALE_DAYS),
      platform: recommendPlatform(subject, { ...stats, accSmooth: stats.accSmooth })
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((a.stats.accSmooth || 0) !== (b.stats.accSmooth || 0)) return (a.stats.accSmooth || 0) - (b.stats.accSmooth || 0);
    if ((b.subject.weight || 0) !== (a.subject.weight || 0)) return (b.subject.weight || 0) - (a.subject.weight || 0);
    return (lastCounts[a.subject.id] || 0) - (lastCounts[b.subject.id] || 0);
  });

  return { ranked, byId, topicStats };
}

export function detectPhase(plan, examQuestions, todayStr) {
  if (plan?.editalPublished) return 'lock';
  const { byId, topicStats } = buildSubjectStats(examQuestions, todayStr);
  const official = AGU_SUBJECTS.filter((s) => !s.extra);
  const groupI = official.filter((s) => s.group === 1);
  const groupIReady = groupI.every((s) => (byId[s.id]?.solved || 0) >= 40);
  const groupITopics = groupI.reduce((acc, s) => {
    const total = s.topics?.length || 1;
    const opened = (s.topics || []).filter((t) => (topicStats[topicKey(s.id, t.id)]?.solved || 0) > 0).length;
    acc.opened += opened;
    acc.total += total;
    return acc;
  }, { opened: 0, total: 0 });
  const openedRatio = groupITopics.total > 0 ? groupITopics.opened / groupITopics.total : 0;
  const globalSolved = official.reduce((sum, s) => sum + (byId[s.id]?.solved || 0), 0);
  const globalCorrect = official.reduce((sum, s) => sum + (byId[s.id]?.correct || 0), 0);
  const globalSmooth = laplaceAccuracy(globalCorrect, globalSolved);
  const touchedOfficial = official.filter((s) => (byId[s.id]?.solved || 0) > 0).length;
  const discursiveDone = (plan?.generatedCycles || []).concat(plan?.currentCycle ? [plan.currentCycle] : [])
    .reduce((sum, cycle) => {
      (cycle?.days || []).forEach((day) => {
        (day.blocks || []).forEach((block) => {
          if (block.kind === 'discursiva' && block.productLogged) sum += 1;
        });
      });
      return sum;
    }, 0);
  const simuladoCount = (plan?.generatedCycles || []).concat(plan?.currentCycle ? [plan.currentCycle] : [])
    .reduce((sum, cycle) => {
      (cycle?.days || []).forEach((day) => {
        (day.blocks || []).forEach((block) => {
          if (block.kind === 'simulado' && block.done) sum += 1;
        });
      });
      return sum;
    }, 0);

  if (simuladoCount >= 12) return 'lock';
  if (touchedOfficial >= official.length && globalSmooth >= 0.80 && discursiveDone >= 8) return 'simulados';
  if (groupIReady && globalSmooth >= 0.75 && openedRatio >= 0.6) return 'aprofundamento';
  return plan?.phase || 'fundacao';
}

export function phaseMeta(phase) {
  return AGU_PHASES[phase] || AGU_PHASES.fundacao;
}

export function windowN(phase) {
  return AGU_WINDOW_N_BY_PHASE[phase] || 3;
}

export { topicKey };
