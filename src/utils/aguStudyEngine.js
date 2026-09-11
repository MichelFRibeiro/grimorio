import {
  AGU_BLOCK_MINUTES,
  AGU_BLOCK_QUESTION_TARGET,
  AGU_DAILY_BLOCKS,
  AGU_GROUPS,
  AGU_KIND_META,
  AGU_PORTUGUESE_WAIVE_ACCURACY,
  AGU_PORTUGUESE_WAIVE_BLOCKS,
  AGU_REVIEW_INTERVALS,
  AGU_SUBJECTS,
  AGU_TOPIC_ADVANCE_MIN,
  AGU_TOPIC_REOPEN_ACCURACY,
  getAguSubject,
  getAguTopic,
  getEditalProfile,
  recommendPlatform
} from '../data/aguCurriculum.js';
import { parseDurationMinutes } from './activityDuration.js';
import {
  addDaysToDateStr,
  daysBetweenDateStr,
  getSaoPauloDateStr
} from './timeUtils.js';
import {
  accuracyPct,
  emptyStats,
  laplaceAccuracy,
  resolveExamSubject,
  resolveExamTopic,
  topicKey
} from './aguFragility.js';

export const AGU_BLOCK_KINDS = {
  estudo: { id: 'estudo', label: 'Estudo inicial', color: '#f59e0b' },
  revisao: { id: 'revisao', label: 'Revisão', color: '#38bdf8' }
};

function accuracyOf(correct, total) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.round(((Number(correct) || 0) / t) * 1000) / 10;
}

function examDate(entry) {
  if (entry?.date) return entry.date;
  if (entry?.timestamp) return getSaoPauloDateStr(entry.timestamp);
  return '';
}

function isQuestionKind(kind) {
  return ['questoes', 'estudo', 'revisao', 'erros', 'simulado', 'lei-seca'].includes(kind);
}

function normalizeKind(kind, review = false) {
  if (kind === 'revisao' || review) return 'revisao';
  if (kind === 'estudo') return 'estudo';
  if (isQuestionKind(kind)) return 'estudo';
  return kind || 'estudo';
}

function blockQuestions(input = {}) {
  return Number(input.questions ?? input.totalQuestions ?? input.solved) || 0;
}

function blockMinutes(input = {}) {
  return parseDurationMinutes(input.minutes ?? input.durationMinutes);
}

export function isBlockComplete(input = {}) {
  if (input.markedDone) return true;
  return blockQuestions(input) >= AGU_BLOCK_QUESTION_TARGET
    || blockMinutes(input) >= AGU_BLOCK_MINUTES;
}

export function blockCompletionReason(input = {}) {
  if (blockQuestions(input) >= AGU_BLOCK_QUESTION_TARGET) return 'questions';
  if (blockMinutes(input) >= AGU_BLOCK_MINUTES) return 'time';
  if (input.markedDone) return 'manual';
  return null;
}

function emptyTopicProgress(subject, topic) {
  return {
    key: topicKey(subject.id, topic.id),
    subjectId: subject.id,
    subjectName: subject.name,
    topicId: topic.id,
    topicName: topic.name,
    status: 'pending',
    solved: 0,
    correct: 0,
    wrong: 0,
    minutes: 0,
    sessions: 0,
    studyBlocks: 0,
    reviewBlocks: 0,
    initialSolved: 0,
    initialCorrect: 0,
    lastSessionAccuracy: 0,
    lastSessionDate: null,
    lastTouchedAt: null,
    completedAt: null,
    reviewStep: 0,
    nextReviewAt: null,
    lastReviewAt: null,
    accuracy: 0,
    accSmooth: 0.5,
    completionPercent: 0
  };
}

function applyLifetime(row, entry) {
  const total = Number(entry.totalQuestions) || 0;
  const correct = Number(entry.correctAnswers) || 0;
  row.solved += total;
  row.correct += correct;
  row.wrong += Number(entry.wrongAnswers) || Math.max(0, total - correct);
  row.minutes += parseDurationMinutes(entry.durationMinutes);
  row.sessions += 1;
  const dateStr = examDate(entry);
  if (dateStr && (!row.lastTouchedAt || dateStr > row.lastTouchedAt)) {
    row.lastTouchedAt = dateStr;
  }
}

function finalizeTopicRow(row, todayStr) {
  row.accuracy = accuracyOf(row.correct, row.solved);
  row.accSmooth = laplaceAccuracy(row.correct, row.solved);
  if (row.status === 'completed' || row.status === 'review') {
    row.completionPercent = 100;
  } else {
    row.completionPercent = Math.min(100, Math.round((row.initialSolved / AGU_TOPIC_ADVANCE_MIN) * 100));
  }
  row.daysSince = row.lastTouchedAt && todayStr
    ? Math.max(0, daysBetweenDateStr(row.lastTouchedAt, todayStr))
    : (row.solved > 0 ? 30 : 0);
  return row;
}

function emptyBlockRecord({
  key,
  dateStr,
  subjectId,
  topicId,
  kind,
  topicName
}) {
  return {
    key,
    dateStr,
    subjectId,
    topicId: topicId || null,
    topicName: topicName || null,
    kind: normalizeKind(kind),
    totalQuestions: 0,
    correctAnswers: 0,
    durationMinutes: 0,
    accuracy: 0,
    examIds: [],
    markedDone: false,
    done: false,
    completionReason: null
  };
}

function blockIdentity(entry, subject, topic) {
  if (entry?.blockKey) return entry.blockKey;
  const dateStr = examDate(entry);
  const kind = normalizeKind(entry?.kind);
  const topicId = topic?.id || entry?.topicId || '';
  return `${dateStr}|${subject.id}|${kind}|${topicId}`;
}

export function slotFromKey(key) {
  const parts = String(key || '').split('|');
  return {
    key: key || '',
    dateStr: parts[0] || '',
    subjectId: parts[1] || '',
    kind: normalizeKind(parts[2] || 'estudo'),
    topicId: parts[3] && parts[3] !== 'product' ? parts[3] : null
  };
}

export function canonicalSlot(blockOrKey) {
  if (!blockOrKey) return { dateStr: '', subjectId: '', kind: 'estudo', topicId: null };
  const parsed = typeof blockOrKey === 'string' ? slotFromKey(blockOrKey) : slotFromKey(blockOrKey.key);
  const extra = typeof blockOrKey === 'string' ? {} : blockOrKey;
  return {
    dateStr: extra.dateStr || parsed.dateStr || '',
    subjectId: extra.subjectId || parsed.subjectId || '',
    kind: normalizeKind(extra.kind || parsed.kind),
    topicId: extra.topicId || parsed.topicId || null
  };
}

export function sameStudySlot(a, b, options = {}) {
  if (!a || !b) return false;
  if (typeof a !== 'string' && typeof b !== 'string' && a.key && b.key && a.key === b.key) return true;
  const left = canonicalSlot(a);
  const right = canonicalSlot(b);
  if (left.dateStr !== right.dateStr || left.subjectId !== right.subjectId) return false;
  if (left.topicId && right.topicId && left.topicId !== right.topicId) return false;
  if (options.ignoreKind) return true;
  return left.kind === right.kind;
}

export function durationForStudySlot(plan, block) {
  const durations = plan?.blockDurations || {};
  let minutes = parseDurationMinutes(durations[block?.key]);
  Object.entries(durations).forEach(([key, value]) => {
    if (sameStudySlot(key, block) || sameStudySlot(key, block, { ignoreKind: true })) {
      minutes = Math.max(minutes, parseDurationMinutes(value));
    }
  });
  return minutes;
}

export function isSlotMarkedDone(plan, block) {
  const completed = plan?.completedBlocks || {};
  if (block?.key && completed[block.key]) return true;
  return Object.keys(completed).some((key) => (
    !key.endsWith('|product')
    && (sameStudySlot(key, block) || sameStudySlot(key, block, { ignoreKind: true }))
  ));
}

export function collectStudyBlocks(plan, examQuestions = []) {
  const byKey = {};

  const ensure = (partial) => {
    if (!partial?.key) return null;
    if (!byKey[partial.key]) {
      byKey[partial.key] = emptyBlockRecord(partial);
    }
    return byKey[partial.key];
  };

  const ingestCycle = (cycle) => {
    (cycle?.days || []).forEach((day) => {
      (day.blocks || []).forEach((block) => {
        const rec = ensure({
          key: block.key,
          dateStr: day.dateStr || block.dateStr,
          subjectId: block.subjectId,
          topicId: block.topicId,
          kind: block.kind,
          topicName: block.topicName
        });
        if (rec && block.topicName) rec.topicName = block.topicName;
      });
    });
  };

  ingestCycle(plan?.currentCycle);
  (plan?.generatedCycles || []).forEach(ingestCycle);

  const findSlot = (partial) => Object.values(byKey).find((rec) => (
    sameStudySlot(rec, partial) || sameStudySlot(rec, partial, { ignoreKind: true })
  ));

  Object.keys(plan?.completedBlocks || {}).forEach((key) => {
    if (key.endsWith('|product')) return;
    const parsed = slotFromKey(key);
    const rec = findSlot(parsed) || ensure({
      key,
      dateStr: parsed.dateStr,
      subjectId: parsed.subjectId,
      topicId: parsed.topicId,
      kind: parsed.kind
    });
    if (rec) rec.markedDone = true;
  });

  (examQuestions || []).forEach((entry) => {
    const subject = resolveExamSubject(entry);
    if (!subject) return;
    const topic = resolveExamTopic(entry, subject);
    const key = blockIdentity(entry, subject, topic);
    const partial = {
      key,
      dateStr: examDate(entry),
      subjectId: subject.id,
      topicId: topic?.id || entry.topicId || null,
      kind: entry.kind || 'estudo',
      topicName: topic?.name || entry.topic || null
    };
    const rec = findSlot(partial) || ensure(partial);
    if (!rec) return;
    rec.totalQuestions += Number(entry.totalQuestions) || 0;
    rec.correctAnswers += Number(entry.correctAnswers) || 0;
    rec.durationMinutes += parseDurationMinutes(entry.durationMinutes);
    rec.examIds.push(entry.id);
    if (!rec.topicName && (topic?.name || entry.topic)) rec.topicName = topic?.name || entry.topic;
  });

  Object.entries(plan?.blockDurations || {}).forEach(([key, minutes]) => {
    const parsed = slotFromKey(key);
    const rec = findSlot(parsed) || ensure({
      key,
      dateStr: parsed.dateStr,
      subjectId: parsed.subjectId,
      topicId: parsed.topicId,
      kind: parsed.kind
    });
    if (rec) rec.durationMinutes = Math.max(rec.durationMinutes, parseDurationMinutes(minutes));
  });

  Object.values(byKey).forEach((rec) => {
    rec.kind = normalizeKind(rec.kind);
    rec.accuracy = accuracyOf(rec.correctAnswers, rec.totalQuestions);
    rec.subject = getAguSubject(rec.subjectId);
    rec.topic = rec.topicId ? getAguTopic(rec.subjectId, rec.topicId) : null;
    rec.done = isBlockComplete({
      questions: rec.totalQuestions,
      minutes: rec.durationMinutes,
      markedDone: rec.markedDone
    });
    rec.completionReason = blockCompletionReason({
      questions: rec.totalQuestions,
      minutes: rec.durationMinutes,
      markedDone: rec.markedDone
    });
  });

  return Object.values(byKey).sort((a, b) => {
    if (a.dateStr !== b.dateStr) return (b.dateStr || '').localeCompare(a.dateStr || '');
    return (b.key || '').localeCompare(a.key || '');
  });
}

export function listPortugueseQuestionBlocks(blocks = []) {
  return (blocks || [])
    .filter((block) => block.subjectId === 'portugues' && (block.totalQuestions || 0) > 0)
    .sort((a, b) => {
      if (a.dateStr !== b.dateStr) return (b.dateStr || '').localeCompare(a.dateStr || '');
      return (b.key || '').localeCompare(a.key || '');
    });
}

export function isPortugueseRequired(blocks = []) {
  const last = listPortugueseQuestionBlocks(blocks).slice(0, AGU_PORTUGUESE_WAIVE_BLOCKS);
  if (last.length < AGU_PORTUGUESE_WAIVE_BLOCKS) return true;
  return last.some((block) => (block.accuracy || 0) <= AGU_PORTUGUESE_WAIVE_ACCURACY);
}

function scheduleReview(row, fromDate) {
  const step = Math.min(row.reviewStep || 0, AGU_REVIEW_INTERVALS.length - 1);
  const interval = AGU_REVIEW_INTERVALS[step] || 120;
  row.status = 'completed';
  row.nextReviewAt = addDaysToDateStr(fromDate, interval);
}

function reopenTopic(row) {
  row.status = 'pending';
  row.initialSolved = 0;
  row.initialCorrect = 0;
  row.completedAt = null;
  row.nextReviewAt = null;
  row.reviewStep = 0;
}

function completeTopic(row, dateStr) {
  row.status = 'completed';
  row.completedAt = dateStr;
  row.reviewStep = 0;
  scheduleReview(row, dateStr);
}

function applyBlockToTopic(row, block, dateStr) {
  const questions = Number(block.totalQuestions) || 0;
  const correct = Number(block.correctAnswers) || 0;
  const kind = normalizeKind(block.kind, row.status === 'completed' && block.kind === 'revisao');
  if (questions > 0) {
    row.lastSessionAccuracy = accuracyOf(correct, questions);
    row.lastSessionDate = dateStr;
  }
  if (kind === 'revisao') {
    row.reviewBlocks += 1;
    row.lastReviewAt = dateStr;
    if (questions > 0 && row.lastSessionAccuracy < AGU_TOPIC_REOPEN_ACCURACY) {
      reopenTopic(row);
      return;
    }
    if (row.status === 'completed' || row.status === 'review') {
      row.reviewStep = Math.min((row.reviewStep || 0) + 1, AGU_REVIEW_INTERVALS.length - 1);
      if ((row.reviewStep || 0) >= AGU_REVIEW_INTERVALS.length - 1) {
        row.reviewStep = AGU_REVIEW_INTERVALS.length - 1;
      }
      scheduleReview(row, dateStr);
    }
    return;
  }

  row.studyBlocks += 1;
  row.initialSolved += questions;
  row.initialCorrect += correct;
  if (questions > 0 && row.lastSessionAccuracy < AGU_TOPIC_REOPEN_ACCURACY && row.initialSolved >= AGU_TOPIC_ADVANCE_MIN) {
    reopenTopic(row);
    return;
  }
  if (row.initialSolved >= AGU_TOPIC_ADVANCE_MIN) {
    if (questions > 0 && row.lastSessionAccuracy < AGU_TOPIC_REOPEN_ACCURACY) {
      reopenTopic(row);
    } else {
      completeTopic(row, dateStr);
    }
  } else if (row.initialSolved > 0) {
    row.status = 'in_progress';
  }
}

export function buildTopicProgress(plan, examQuestions = [], todayStr) {
  const today = todayStr || getSaoPauloDateStr();
  const byKey = {};
  AGU_SUBJECTS.forEach((subject) => {
    (subject.topics || []).forEach((topic) => {
      const key = topicKey(subject.id, topic.id);
      byKey[key] = emptyTopicProgress(subject, topic);
      const stored = plan?.topicStatus?.[key];
      if (stored && typeof stored === 'object') {
        Object.assign(byKey[key], {
          status: stored.status || byKey[key].status,
          initialSolved: Number(stored.initialSolved) || 0,
          initialCorrect: Number(stored.initialCorrect) || 0,
          studyBlocks: Number(stored.studyBlocks) || 0,
          reviewBlocks: Number(stored.reviewBlocks) || 0,
          lastSessionAccuracy: Number(stored.lastSessionAccuracy) || 0,
          lastSessionDate: stored.lastSessionDate || null,
          completedAt: stored.completedAt || null,
          reviewStep: Number(stored.reviewStep) || 0,
          nextReviewAt: stored.nextReviewAt || null,
          lastReviewAt: stored.lastReviewAt || null
        });
      }
    });
  });

  const blocks = collectStudyBlocks(plan, examQuestions)
    .slice()
    .sort((a, b) => {
      if (a.dateStr !== b.dateStr) return (a.dateStr || '').localeCompare(b.dateStr || '');
      return (a.key || '').localeCompare(b.key || '');
    });

  const rebuilt = {};
  AGU_SUBJECTS.forEach((subject) => {
    (subject.topics || []).forEach((topic) => {
      rebuilt[topicKey(subject.id, topic.id)] = emptyTopicProgress(subject, topic);
    });
  });

  (examQuestions || []).forEach((entry) => {
    const subject = resolveExamSubject(entry);
    if (!subject) return;
    const topic = resolveExamTopic(entry, subject);
    if (!topic) return;
    const row = rebuilt[topicKey(subject.id, topic.id)];
    if (row) applyLifetime(row, entry);
  });

  blocks.forEach((block) => {
    if (!block.topicId || !block.subjectId) return;
    const row = rebuilt[topicKey(block.subjectId, block.topicId)];
    if (!row) return;
    if (!row.minutes) row.minutes = 0;
    if ((block.durationMinutes || 0) > 0 && (block.examIds || []).length === 0) {
      row.minutes += parseDurationMinutes(block.durationMinutes);
    }
    if (!block.done && (block.totalQuestions || 0) === 0 && parseDurationMinutes(block.durationMinutes) === 0) return;
    if (block.done || (block.totalQuestions || 0) > 0) {
      applyBlockToTopic(row, block, block.dateStr || today);
    }
  });

  Object.values(rebuilt).forEach((row) => finalizeTopicRow(row, today));
  return rebuilt;
}

function allowedSubjectSet(plan, portugueseRequired) {
  const profile = getEditalProfile(plan?.editalProfileId);
  if (plan?.phase === 'lock' || plan?.editalPublished) {
    const ids = new Set((profile.subjects || []).map((s) => s.id));
    (profile.addedSubjects || []).forEach((s) => ids.add(s.id));
    [...(profile.removedSubjectIds || []), ...(plan.removedSubjectIds || [])].forEach((id) => ids.delete(id));
    if (portugueseRequired) ids.add('portugues');
    return ids;
  }
  return new Set(AGU_SUBJECTS.map((s) => s.id));
}

export function dueReviews(topicProgress, todayStr) {
  const today = todayStr || getSaoPauloDateStr();
  return Object.values(topicProgress || {})
    .filter((row) => row.status === 'completed' && row.nextReviewAt && row.nextReviewAt <= today)
    .sort((a, b) => {
      const overdueA = daysBetweenDateStr(a.nextReviewAt, today);
      const overdueB = daysBetweenDateStr(b.nextReviewAt, today);
      if (overdueA !== overdueB) return overdueB - overdueA;
      return (b.subjectId || '').localeCompare(a.subjectId || '');
    });
}

export function pendingTopics(topicProgress) {
  return Object.values(topicProgress || {})
    .filter((row) => row.status === 'pending' || row.status === 'in_progress')
    .sort((a, b) => {
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
      if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
      if ((b.initialSolved || 0) !== (a.initialSolved || 0)) return (b.initialSolved || 0) - (a.initialSolved || 0);
      const subjectA = getAguSubject(a.subjectId);
      const subjectB = getAguSubject(b.subjectId);
      return (subjectB?.weight || 0) - (subjectA?.weight || 0);
    });
}

function pickPortugueseTopic(topicProgress) {
  const ortografia = topicProgress[topicKey('portugues', 'ortografia')];
  if (ortografia && (ortografia.status === 'pending' || ortografia.status === 'in_progress')) return ortografia;
  const due = dueReviews(topicProgress).find((row) => row.subjectId === 'portugues');
  if (due) return { ...due, reviewDue: true };
  const pending = pendingTopics(topicProgress).find((row) => row.subjectId === 'portugues');
  if (pending) return pending;
  return ortografia || Object.values(topicProgress).find((row) => row.subjectId === 'portugues') || null;
}

function makeSuggestedBlock(row, dateStr, kind, reason) {
  const subject = getAguSubject(row.subjectId);
  const topic = getAguTopic(row.subjectId, row.topicId);
  const resolvedKind = kind === 'revisao' ? 'revisao' : 'estudo';
  return {
    subjectId: row.subjectId,
    kind: resolvedKind,
    topicId: row.topicId,
    topicName: row.topicName || topic?.name || null,
    window: 'afternoon',
    optional: false,
    target: AGU_BLOCK_QUESTION_TARGET,
    targetMinutes: AGU_BLOCK_MINUTES,
    reasons: [reason],
    key: `${dateStr}|${row.subjectId}|${resolvedKind}|${row.topicId}`,
    subject,
    topic
  };
}

export function suggestNextBlock(plan, examQuestions, todayStr, options = {}) {
  const today = todayStr || getSaoPauloDateStr();
  const topicProgress = options.topicProgress || buildTopicProgress(plan, examQuestions, today);
  const usedKeys = new Set(options.usedTopicKeys || []);
  const portugueseRequired = options.portugueseRequired != null
    ? options.portugueseRequired
    : isPortugueseRequired(options.blocks || collectStudyBlocks(plan, examQuestions));
  const portugueseToday = Boolean(options.portugueseToday);
  const allowed = allowedSubjectSet(plan, portugueseRequired);

  if (portugueseRequired && !portugueseToday) {
    const row = pickPortugueseTopic(topicProgress);
    if (row && !usedKeys.has(row.key) && allowed.has(row.subjectId)) {
      const kind = row.reviewDue || row.status === 'completed'
        ? 'revisao'
        : 'estudo';
      return makeSuggestedBlock(row, today, kind, kind === 'revisao'
        ? 'Revisão de português devida'
        : 'Bloco obrigatório de Língua Portuguesa (ortografia em prioridade)');
    }
  }

  const review = dueReviews(topicProgress, today).find((row) => !usedKeys.has(row.key) && allowed.has(row.subjectId));
  if (review) {
    return makeSuggestedBlock(review, today, 'revisao', `Revisão devida desde ${review.nextReviewAt}`);
  }

  const pending = pendingTopics(topicProgress).find((row) => {
    if (usedKeys.has(row.key)) return false;
    if (!allowed.has(row.subjectId)) return false;
    if (portugueseRequired && row.subjectId === 'portugues' && portugueseToday) return false;
    return true;
  });
  if (pending) {
    const reason = pending.status === 'in_progress'
      ? `Continuar tópico (${pending.initialSolved}/${AGU_TOPIC_ADVANCE_MIN} questões)`
      : 'Tópico pendente do edital';
    return makeSuggestedBlock(pending, today, 'estudo', reason);
  }

  const fallback = Object.values(topicProgress).find((row) => !usedKeys.has(row.key) && allowed.has(row.subjectId));
  if (fallback) {
    return makeSuggestedBlock(fallback, today, fallback.status === 'completed' ? 'revisao' : 'estudo', 'Nenhum tópico pendente — revisão extra');
  }
  return null;
}

export function overlayLoggedDayBlocks(sourceBlocks, plan, examQuestions, dateStr) {
  const pinned = pinExistingTodayBlocks(plan, examQuestions, dateStr);
  if (!pinned.length) return sourceBlocks || [];
  const used = new Set(pinned.map((block) => topicKey(block.subjectId, block.topicId)));
  const merged = [...pinned];
  (sourceBlocks || []).forEach((block) => {
    if (merged.length >= AGU_DAILY_BLOCKS) return;
    const stamp = topicKey(block.subjectId, block.topicId);
    if (used.has(stamp)) return;
    used.add(stamp);
    merged.push(block);
  });
  return merged;
}

function pinExistingTodayBlocks(plan, examQuestions, dateStr) {
  const seen = new Set();
  const blocks = collectStudyBlocks(plan, examQuestions)
    .filter((block) => block.dateStr === dateStr && (block.done || (block.totalQuestions || 0) > 0 || parseDurationMinutes(block.durationMinutes) > 0))
    .sort((a, b) => {
      if (Boolean(b.done) !== Boolean(a.done)) return b.done ? 1 : -1;
      return (a.key || '').localeCompare(b.key || '');
    })
    .filter((block) => {
      const stamp = `${block.subjectId}|${normalizeKind(block.kind)}|${block.topicId || ''}`;
      if (seen.has(stamp)) return false;
      seen.add(stamp);
      return true;
    });
  return blocks.slice(0, AGU_DAILY_BLOCKS).map((block, index) => ({
    subjectId: block.subjectId,
    kind: normalizeKind(block.kind),
    topicId: block.topicId,
    topicName: block.topicName,
    window: index === 0 ? 'morning' : 'afternoon',
    optional: false,
    target: AGU_BLOCK_QUESTION_TARGET,
    targetMinutes: AGU_BLOCK_MINUTES,
    reasons: ['Já iniciado / lançado hoje'],
    key: block.key,
    pinned: true
  }));
}

function virtualApply(topicProgress, block, dateStr) {
  const row = topicProgress[topicKey(block.subjectId, block.topicId)];
  if (!row) return;
  applyBlockToTopic(row, {
    kind: block.kind,
    totalQuestions: AGU_BLOCK_QUESTION_TARGET,
    correctAnswers: Math.round(AGU_BLOCK_QUESTION_TARGET * 0.85)
  }, dateStr);
  row.solved += AGU_BLOCK_QUESTION_TARGET;
  row.correct += Math.round(AGU_BLOCK_QUESTION_TARGET * 0.85);
  row.lastTouchedAt = dateStr;
  finalizeTopicRow(row, dateStr);
}

export function buildDayBlocks(plan, examQuestions, dateStr, options = {}) {
  const topicProgress = options.topicProgress || buildTopicProgress(plan, examQuestions, dateStr);
  const allBlocks = options.blocks || collectStudyBlocks(plan, examQuestions);
  const portugueseRequired = isPortugueseRequired(allBlocks);
  const pinExisting = options.pinExisting !== false && options.preview !== true;
  const advanceProgress = options.advanceProgress !== false;
  const pinned = pinExisting ? pinExistingTodayBlocks(plan, examQuestions, dateStr) : [];
  const blocks = [...pinned];
  const usedTopicKeys = new Set(blocks.map((b) => topicKey(b.subjectId, b.topicId)));
  let portugueseToday = blocks.some((b) => b.subjectId === 'portugues');

  while (blocks.length < AGU_DAILY_BLOCKS) {
    const next = suggestNextBlock(plan, examQuestions, dateStr, {
      topicProgress,
      usedTopicKeys: [...usedTopicKeys],
      portugueseRequired,
      portugueseToday,
      blocks: allBlocks
    });
    if (!next) break;
    next.window = blocks.length === 0 ? 'morning' : 'afternoon';
    next.key = `${dateStr}|${next.subjectId}|${next.kind}|${next.topicId}|${blocks.length}`;
    blocks.push(next);
    usedTopicKeys.add(topicKey(next.subjectId, next.topicId));
    if (next.subjectId === 'portugues') portugueseToday = true;
    if (advanceProgress) virtualApply(topicProgress, next, dateStr);
  }

  return {
    blocks,
    portugueseRequired,
    portugueseToday,
    nextBlock: blocks.find((b) => !b.done && !b.pinned) || blocks.find((b) => !b.done) || blocks[0] || null
  };
}

export function buildEditalTable(plan, examQuestions = [], todayStr) {
  const today = todayStr || getSaoPauloDateStr();
  const topicProgress = buildTopicProgress(plan, examQuestions, today);
  const blocks = collectStudyBlocks(plan, examQuestions);

  const lastBlockFor = (subjectId, topicId = null) => {
    return blocks.find((block) => (
      block.subjectId === subjectId
      && (topicId == null || block.topicId === topicId)
      && ((block.totalQuestions || 0) > 0 || (block.durationMinutes || 0) > 0)
    )) || null;
  };

  const subjects = AGU_SUBJECTS.map((subject) => {
    const topics = (subject.topics || []).map((topic) => {
      const row = topicProgress[topicKey(subject.id, topic.id)] || emptyTopicProgress(subject, topic);
      const last = lastBlockFor(subject.id, topic.id);
      return {
        ...row,
        lastBlockAccuracy: last?.accuracy || 0,
        lastBlockDate: last?.dateStr || null,
        lastBlockKind: last?.kind || null
      };
    });
    const solved = topics.reduce((sum, t) => sum + (t.solved || 0), 0);
    const correct = topics.reduce((sum, t) => sum + (t.correct || 0), 0);
    const minutes = topics.reduce((sum, t) => sum + (t.minutes || 0), 0);
    const studyBlocks = topics.reduce((sum, t) => sum + (t.studyBlocks || 0), 0);
    const reviewBlocks = topics.reduce((sum, t) => sum + (t.reviewBlocks || 0), 0);
    const completed = topics.filter((t) => t.status === 'completed').length;
    const last = lastBlockFor(subject.id);
    return {
      id: subject.id,
      name: subject.name,
      group: subject.group,
      groupMeta: AGU_GROUPS[subject.group] || AGU_GROUPS.extra,
      extra: Boolean(subject.extra),
      weight: subject.weight,
      tecCadernoUrl: subject.tecCadernoUrl,
      tecGuideUrl: subject.tecGuideUrl,
      solved,
      correct,
      minutes,
      studyBlocks,
      reviewBlocks,
      accuracy: accuracyOf(correct, solved),
      lastBlockAccuracy: last?.accuracy || 0,
      lastBlockDate: last?.dateStr || null,
      completionPercent: topics.length > 0
        ? Math.round(topics.reduce((sum, t) => sum + (t.completionPercent || 0), 0) / topics.length)
        : 0,
      topicsCompleted: completed,
      topicsTotal: topics.length,
      platform: recommendPlatform(subject, { solved, accuracy: accuracyOf(correct, solved), accSmooth: laplaceAccuracy(correct, solved) }),
      topics
    };
  });

  return {
    subjects,
    topicProgress,
    blocks,
    portugueseRequired: isPortugueseRequired(blocks),
    portugueseWaiver: {
      required: AGU_PORTUGUESE_WAIVE_BLOCKS,
      accuracy: AGU_PORTUGUESE_WAIVE_ACCURACY,
      recent: listPortugueseQuestionBlocks(blocks).slice(0, AGU_PORTUGUESE_WAIVE_BLOCKS)
    }
  };
}

export function serializeTopicStatus(topicProgress) {
  const out = {};
  Object.entries(topicProgress || {}).forEach(([key, row]) => {
    out[key] = {
      status: row.status,
      initialSolved: row.initialSolved,
      initialCorrect: row.initialCorrect,
      studyBlocks: row.studyBlocks,
      reviewBlocks: row.reviewBlocks,
      lastSessionAccuracy: row.lastSessionAccuracy,
      lastSessionDate: row.lastSessionDate,
      completedAt: row.completedAt,
      reviewStep: row.reviewStep,
      nextReviewAt: row.nextReviewAt,
      lastReviewAt: row.lastReviewAt,
      solved: row.solved,
      correct: row.correct
    };
  });
  return out;
}

export function applyStudySession(plan, entry, todayStr) {
  const subject = resolveExamSubject(entry);
  if (!plan || !subject) return plan;
  const progress = buildTopicProgress(plan, [], todayStr);
  Object.entries(plan.topicStatus || {}).forEach(([key, stored]) => {
    if (progress[key]) Object.assign(progress[key], stored);
  });
  const rebuilt = buildTopicProgress({
    ...plan,
    topicStatus: serializeTopicStatus(progress)
  }, [entry], entry.date || todayStr);

  return {
    ...plan,
    topicStatus: serializeTopicStatus(rebuilt),
    keepPortuguese: isPortugueseRequired(collectStudyBlocks(plan, [entry])),
    updatedAt: new Date().toISOString()
  };
}

export function currentOpenTopic(plan, subject, topicProgress) {
  const topics = subject?.topics || [];
  const inProgress = topics.find((topic) => topicProgress?.[topicKey(subject.id, topic.id)]?.status === 'in_progress');
  if (inProgress) {
    const row = topicProgress[topicKey(subject.id, inProgress.id)];
    return { topicId: inProgress.id, topicName: inProgress.name, status: row.status, questionsOnTopic: row.initialSolved, correctOnTopic: row.initialCorrect };
  }
  const pending = topics.find((topic) => {
    const status = topicProgress?.[topicKey(subject.id, topic.id)]?.status;
    return status === 'pending' || !status;
  });
  if (pending) {
    const row = topicProgress?.[topicKey(subject.id, pending.id)];
    return { topicId: pending.id, topicName: pending.name, status: row?.status || 'pending', questionsOnTopic: row?.initialSolved || 0, correctOnTopic: row?.initialCorrect || 0 };
  }
  const first = topics[0];
  if (!first) return null;
  const row = topicProgress?.[topicKey(subject.id, first.id)];
  return { topicId: first.id, topicName: first.name, status: row?.status || 'pending', questionsOnTopic: row?.initialSolved || 0, correctOnTopic: row?.initialCorrect || 0 };
}

export { emptyStats, accuracyPct, AGU_KIND_META };
