/**
 * Linha do tempo do dia.
 *
 * Junta o que foi feito na data — ritual, missão, leitura, escritura, bloco
 * AGU, questão avulsa, mapa, página de diário, suplemento, processo, jejum
 * e vitória manual — e ordena pelo horário de São Paulo. Não cria registro:
 * lê o que o banco já tem. Vitória de homeostase e de rotina não entram,
 * porque o trabalho já aparece na atividade de origem. Questão que pertence
 * a um bloco AGU também não se repete.
 */

import { collectStudyBlocks } from './aguStudyEngine.js';
import {
  formatDurationLabel,
  getHabitCountForDate,
  getHabitDurationForDate,
  getHabitNoteForDate
} from './activityDuration.js';
import { subjectIdForMindMap } from './aguHomeostasis.js';
import { formatReference, getBibleBook } from '../data/bibleCanon.js';
import {
  isOverflowDailyVictorySource,
  isRoutineVictory
} from './dailyVictories.js';
import { isFeatureEnabled } from './featureSettings.js';
import {
  formatFastingSpan,
  protocolLabel,
  sessionDurationMs
} from './fasting.js';
import { JOURNAL_MOODS } from './journal.js';
import { getSaoPauloDateStr } from './timeUtils.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const MOOD_LABEL = new Map(JOURNAL_MOODS.map((mood) => [mood.id, mood.label]));

const KIND_LABEL = {
  estudo: 'estudo',
  revisao: 'revisão'
};

function allow(settings, featureId) {
  return isFeatureEnabled(settings, featureId);
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function clip(value, max = 90) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function joinDetail(parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(' · ');
}

function minutesOf(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function durationDetail(minutes) {
  return formatDurationLabel(minutesOf(minutes));
}

function instant(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** ISO só conta se o instante cai no dia civil de São Paulo. */
function timeOnDay(value, todayStr) {
  const date = instant(value);
  if (!date) return null;
  if (getSaoPauloDateStr(date) !== todayStr) return null;
  return date.toISOString();
}

function clockLabel(iso) {
  const date = instant(iso);
  if (!date) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === 'hour')?.value || '';
    const minute = parts.find((part) => part.type === 'minute')?.value || '';
    if (!hour || !minute) return '';
    return `${hour}:${minute}`;
  } catch {
    return '';
  }
}

function makeEvent(partial) {
  const at = partial.at || null;
  return {
    id: partial.id,
    kind: partial.kind,
    feature: partial.feature,
    tab: partial.tab || '',
    title: clip(partial.title, 140) || 'Atividade',
    detail: clip(partial.detail, 180),
    minutes: minutesOf(partial.minutes),
    at,
    timeLabel: at ? clockLabel(at) : ''
  };
}

function indexLogs(logs, todayStr) {
  const byKey = new Map();
  asList(logs).forEach((log) => {
    if (!log || log.date !== todayStr || !log.type || !log.entityId || !log.timestamp) return;
    const at = timeOnDay(log.timestamp, todayStr);
    if (!at) return;
    const key = `${log.type}|${log.entityId}`;
    const prev = byKey.get(key);
    if (!prev || at > prev) byKey.set(key, at);
  });
  return byKey;
}

function logTime(logs, type, entityId) {
  if (!entityId) return null;
  return logs.get(`${type}|${entityId}`) || null;
}

function scriptureSpan(session) {
  const startBook = getBibleBook(session?.startBookId);
  const endBook = getBibleBook(session?.endBookId);
  const start = formatReference(startBook, session?.startChapter, session?.startVerse);
  const end = formatReference(endBook, session?.endChapter, session?.endVerse);
  if (start && end && start !== end) return `${start}–${end}`;
  return end || start || '';
}

function examBelongsToBlock(entry, block) {
  if (!entry || !block) return false;
  if (entry.id && Array.isArray(block.examIds) && block.examIds.includes(entry.id)) return true;
  return !!(entry.blockKey && block.key && entry.blockKey === block.key);
}

function blockMoment(block, exams, logs, todayStr) {
  let latest = null;
  asList(exams).forEach((entry) => {
    if (!examBelongsToBlock(entry, block)) return;
    const at = timeOnDay(entry.timestamp, todayStr) || logTime(logs, 'exam_questions', entry.id);
    if (at && (!latest || at > latest)) latest = at;
  });
  return latest;
}

function collectHabits(source, todayStr, logs, settings) {
  if (!allow(settings, 'habits')) return [];
  return asList(source.habits).flatMap((habit) => {
    if (!habit?.id || !Array.isArray(habit.history) || !habit.history.includes(todayStr)) return [];
    const minutes = getHabitDurationForDate(habit, todayStr);
    const count = getHabitCountForDate(habit, todayStr);
    const note = getHabitNoteForDate(habit, todayStr);
    return [makeEvent({
      id: `habit:${habit.id}`,
      kind: 'habit',
      feature: 'habits',
      tab: 'habits',
      title: habit.title || 'Ritual',
      detail: joinDetail(['Ritual', count > 0 ? String(count) : '', durationDetail(minutes), clip(note)]),
      minutes,
      at: logTime(logs, 'habit_complete', habit.id)
    })];
  });
}

function collectQuests(source, todayStr, logs, settings) {
  if (!allow(settings, 'quests')) return [];
  return asList(source.quests).flatMap((quest) => {
    if (!quest?.id || !quest.completed) return [];
    const at = timeOnDay(quest.completedAt, todayStr) || logTime(logs, 'quest_complete', quest.id);
    const datedToday = !!quest.completedAt && getSaoPauloDateStr(quest.completedAt) === todayStr;
    if (!at && !datedToday) return [];
    return [makeEvent({
      id: `quest:${quest.id}`,
      kind: 'quest',
      feature: 'quests',
      tab: 'quests',
      title: quest.title || 'Missão',
      detail: joinDetail(['Missão', quest.category, durationDetail(quest.durationMinutes)]),
      minutes: quest.durationMinutes,
      at
    })];
  });
}

function collectReading(source, todayStr, settings) {
  if (!allow(settings, 'books')) return [];
  const books = new Map(asList(source.books).filter((book) => book?.id).map((book) => [book.id, book]));
  return asList(source.readingSessions).flatMap((session) => {
    if (!session?.id || session.date !== todayStr) return [];
    const pages = Number(session.pagesRead) || 0;
    const book = books.get(session.bookId);
    return [makeEvent({
      id: `reading:${session.id}`,
      kind: 'reading',
      feature: 'books',
      tab: 'books',
      title: session.bookTitle || book?.title || 'Leitura',
      detail: joinDetail([
        'Biblioteca',
        pages > 0 ? `${pages} ${pages === 1 ? 'página' : 'páginas'}` : '',
        durationDetail(session.durationMinutes),
        clip(session.notes)
      ]),
      minutes: session.durationMinutes,
      at: timeOnDay(session.timestamp, todayStr)
    })];
  });
}

function collectScripture(source, todayStr, settings) {
  if (!allow(settings, 'scripture')) return [];
  return asList(source.scriptureSessions).flatMap((session) => {
    if (!session?.id || session.date !== todayStr) return [];
    const chapters = Number(session.chaptersRead) || 0;
    return [makeEvent({
      id: `scripture:${session.id}`,
      kind: 'scripture',
      feature: 'scripture',
      tab: 'scripture',
      title: scriptureSpan(session) || 'Escrituras',
      detail: joinDetail([
        'Escrituras',
        chapters > 0 ? `${chapters} ${chapters === 1 ? 'capítulo' : 'capítulos'}` : '',
        durationDetail(session.durationMinutes),
        clip(session.notes || session.reflection)
      ]),
      minutes: session.durationMinutes,
      at: timeOnDay(session.timestamp, todayStr)
    })];
  });
}

function collectAgu(source, todayStr, logs, settings) {
  if (!allow(settings, 'agu')) return { events: [], absorbed: new Set() };
  let blocks = [];
  try {
    blocks = collectStudyBlocks(source.aguPlan, source.examQuestions || []);
  } catch {
    blocks = [];
  }
  const todayBlocks = blocks.filter((block) => (
    block?.dateStr === todayStr
    && (block.done || minutesOf(block.durationMinutes) > 0 || (Number(block.totalQuestions) || 0) > 0)
  ));
  const absorbed = new Set();
  const events = todayBlocks.map((block) => {
    asList(block.examIds).forEach((id) => {
      if (id) absorbed.add(id);
    });
    if (block.key) absorbed.add(block.key);
    const questions = Number(block.totalQuestions) || 0;
    const correct = Number(block.correctAnswers) || 0;
    const subject = block.subject?.name || block.subjectId || 'AGU';
    const topic = block.topicName || block.topic?.name || '';
    return makeEvent({
      id: `agu:${block.key || `${todayStr}|${block.subjectId}|${topic}`}`,
      kind: 'agu',
      feature: 'agu',
      tab: 'agu',
      title: topic ? `${subject} · ${topic}` : subject,
      detail: joinDetail([
        'AGU',
        KIND_LABEL[block.kind] || '',
        durationDetail(block.durationMinutes),
        questions > 0 ? `${correct}/${questions}` : '',
        clip(block.note)
      ]),
      minutes: block.durationMinutes,
      at: blockMoment(block, source.examQuestions, logs, todayStr)
    });
  });
  return { events, absorbed };
}

function collectQuestions(source, todayStr, logs, settings, absorbed) {
  if (!allow(settings, 'questions')) return [];
  return asList(source.examQuestions).flatMap((entry) => {
    if (!entry?.id) return [];
    if (absorbed.has(entry.id) || (entry.blockKey && absorbed.has(entry.blockKey))) return [];
    const date = entry.date || (entry.timestamp ? getSaoPauloDateStr(entry.timestamp) : '');
    if (date !== todayStr) return [];
    const total = Number(entry.totalQuestions) || 0;
    const correct = Number(entry.correctAnswers) || 0;
    return [makeEvent({
      id: `questions:${entry.id}`,
      kind: 'questions',
      feature: 'questions',
      tab: 'questions',
      title: entry.subject || entry.topic || 'Questões',
      detail: joinDetail([
        'Questões',
        total > 0 ? `${correct}/${total}` : '',
        durationDetail(entry.durationMinutes),
        clip(entry.notes)
      ]),
      minutes: entry.durationMinutes,
      at: timeOnDay(entry.timestamp, todayStr) || logTime(logs, 'exam_questions', entry.id)
    })];
  });
}

function collectMindMaps(source, todayStr, logs, settings) {
  if (!allow(settings, 'maps')) return [];
  const maps = new Map(asList(source.mindMaps).filter((map) => map?.id).map((map) => [map.id, map]));
  return asList(source.mindMapSessions).flatMap((session) => {
    if (!session?.id) return [];
    const date = session.date || (session.timestamp ? getSaoPauloDateStr(session.timestamp) : '');
    if (date !== todayStr) return [];
    const map = maps.get(session.mapId) || {
      title: session.mapTitle,
      category: session.category
    };
    if (subjectIdForMindMap(map)) return [];
    const reviewed = Number(session.reviewed) || 0;
    const recalled = Number(session.recalled) || 0;
    return [makeEvent({
      id: `mindmap:${session.id}`,
      kind: 'mindmap',
      feature: 'maps',
      tab: 'maps',
      title: session.mapTitle || map.title || 'Mapa mental',
      detail: joinDetail([
        'Mapa',
        reviewed > 0 ? `${recalled}/${reviewed}` : '',
        durationDetail(session.durationMinutes)
      ]),
      minutes: session.durationMinutes,
      at: timeOnDay(session.timestamp, todayStr) || logTime(logs, 'mind_map_study', session.id)
    })];
  });
}

function collectJournal(source, todayStr, settings) {
  if (!allow(settings, 'journal')) return [];
  return asList(source.journalEntries).flatMap((entry) => {
    if (!entry?.id || entry.date !== todayStr) return [];
    const mood = MOOD_LABEL.get(entry.mood) || '';
    const title = entry.title || clip(entry.body, 80) || 'Página do diário';
    return [makeEvent({
      id: `journal:${entry.id}`,
      kind: 'journal',
      feature: 'journal',
      tab: 'journal',
      title,
      detail: joinDetail(['Diário', mood, durationDetail(entry.durationMinutes)]),
      minutes: entry.durationMinutes,
      at: timeOnDay(entry.createdAt, todayStr) || timeOnDay(entry.updatedAt, todayStr)
    })];
  });
}

function collectSupplements(source, todayStr, settings) {
  if (!allow(settings, 'supplements')) return [];
  const names = new Map(
    asList(source.supplements).filter((item) => item?.id).map((item) => [item.id, item])
  );
  const doses = asList(source.supplementLogs).flatMap((log) => {
    if (!log?.id || log.date !== todayStr) return [];
    const supplement = names.get(log.supplementId);
    const amount = Number(log.amount);
    const dose = Number.isFinite(amount) && amount > 0
      ? `${String(amount).replace('.', ',')} ${log.unit || supplement?.unit || ''}`.trim()
      : '';
    const clock = TIME_RE.test(String(log.time || '')) ? String(log.time) : '';
    const at = timeOnDay(log.takenAt, todayStr);
    return [makeEvent({
      id: `supplement:${log.id}`,
      kind: 'supplement',
      feature: 'supplements',
      tab: 'supplements',
      title: supplement?.name || 'Suplemento',
      detail: joinDetail(['Suplemento', dose, clip(log.notes)]),
      minutes: 0,
      at: at || (clock ? timeOnDay(`${todayStr}T${clock}:00-03:00`, todayStr) : null)
    })];
  });
  const reviews = asList(source.supplementReviews).flatMap((review) => {
    if (!review?.id || review.date !== todayStr || !Array.isArray(review.answers) || !review.answers.length) {
      return [];
    }
    const yes = review.answers.filter((answer) => answer?.taken).length;
    const no = review.answers.length - yes;
    return [makeEvent({
      id: `review:${review.id}`,
      kind: 'review',
      feature: 'supplements',
      tab: 'supplements',
      title: 'Review de suplementos',
      detail: joinDetail(['Review', `${yes} sim`, `${no} não`]),
      minutes: 0,
      at: timeOnDay(review.completedAt, todayStr)
    })];
  });
  return doses.concat(reviews);
}

function collectProcesses(source, todayStr, logs, settings) {
  if (!allow(settings, 'processes')) return [];
  const processes = new Map(
    asList(source.processes).filter((item) => item?.id).map((item) => [item.id, item])
  );
  return asList(source.processSteps).flatMap((step) => {
    if (!step?.id) return [];
    const at = timeOnDay(step.timestamp || step.createdAt, todayStr)
      || logTime(logs, 'process_step', step.id);
    if (!at) return [];
    const process = processes.get(step.processId);
    const added = Number(step.unitsAdded || step.advancedCount) || 0;
    const unit = process?.unitName || 'unidades';
    return [makeEvent({
      id: `process:${step.id}`,
      kind: 'process',
      feature: 'processes',
      tab: 'processes',
      title: step.processTitle || process?.title || 'Processo',
      detail: joinDetail([
        'Processo',
        added > 0 ? `+${added} ${unit}` : '',
        clip(step.stepNote || step.note)
      ]),
      minutes: 0,
      at
    })];
  });
}

function collectFasting(source, todayStr, settings) {
  if (!allow(settings, 'fasting')) return [];
  const events = [];
  asList(source.fastingSessions).forEach((session) => {
    if (!session?.id) return;
    const started = timeOnDay(session.startedAt, todayStr);
    const ended = timeOnDay(session.endedAt, todayStr);
    const protocol = Number(session.targetMinutes) > 0 ? protocolLabel(session.targetMinutes) : '';
    if (started) {
      events.push(makeEvent({
        id: `fasting-start:${session.id}`,
        kind: 'fasting',
        feature: 'fasting',
        tab: 'fasting',
        title: 'Jejum começou',
        detail: joinDetail(['Jejum', protocol, ended ? '' : 'em curso']),
        minutes: 0,
        at: started
      }));
    }
    if (ended) {
      events.push(makeEvent({
        id: `fasting-end:${session.id}`,
        kind: 'fasting',
        feature: 'fasting',
        tab: 'fasting',
        title: 'Jejum encerrado',
        detail: joinDetail(['Jejum', protocol, formatFastingSpan(sessionDurationMs(session))]),
        minutes: 0,
        at: ended
      }));
    }
  });
  return events;
}

function collectVictories(source, todayStr, logs, settings, taken) {
  if (!allow(settings, 'victories')) return [];
  return asList(source.dailyVictories).flatMap((victory) => {
    if (!victory?.id || victory.date !== todayStr || !victory.completed) return [];
    if (isRoutineVictory(victory) || isOverflowDailyVictorySource(victory.source)) return [];
    if (victory.questId && taken.quests.has(victory.questId)) return [];
    if (victory.habitId && taken.habits.has(victory.habitId)) return [];
    return [makeEvent({
      id: `victory:${victory.id}`,
      kind: 'victory',
      feature: 'victories',
      tab: '',
      title: victory.title || 'Vitória',
      detail: joinDetail(['Vitória', victory.category, durationDetail(victory.durationMinutes), clip(victory.note)]),
      minutes: victory.durationMinutes,
      at: timeOnDay(victory.completedAt, todayStr) || logTime(logs, 'daily_victory_complete', victory.id)
    })];
  });
}

function sortEvents(events) {
  return events.slice().sort((a, b) => {
    if (a.at && b.at && a.at !== b.at) return a.at < b.at ? -1 : 1;
    if (a.at && !b.at) return -1;
    if (!a.at && b.at) return 1;
    const byTitle = a.title.localeCompare(b.title, 'pt');
    if (byTitle) return byTitle;
    return a.id.localeCompare(b.id);
  });
}

/**
 * @param {object} source banco ou estado do cliente
 * @param {string} todayStr YYYY-MM-DD em São Paulo
 * @param {{ featureSettings?: object }} [options]
 */
export function buildDayTimeline(source = {}, todayStr = '', options = {}) {
  const date = DATE_RE.test(String(todayStr || '')) ? String(todayStr) : getSaoPauloDateStr();
  const settings = options.featureSettings;
  const logs = indexLogs(source.actionLogs, date);
  const habits = collectHabits(source, date, logs, settings);
  const quests = collectQuests(source, date, logs, settings);
  const agu = collectAgu(source, date, logs, settings);
  const events = [
    ...habits,
    ...quests,
    ...collectReading(source, date, settings),
    ...collectScripture(source, date, settings),
    ...agu.events,
    ...collectQuestions(source, date, logs, settings, agu.absorbed),
    ...collectMindMaps(source, date, logs, settings),
    ...collectJournal(source, date, settings),
    ...collectSupplements(source, date, settings),
    ...collectProcesses(source, date, logs, settings),
    ...collectFasting(source, date, settings)
  ];
  const taken = {
    habits: new Set(habits.map((item) => item.id.slice('habit:'.length))),
    quests: new Set(quests.map((item) => item.id.slice('quest:'.length)))
  };
  events.push(...collectVictories(source, date, logs, settings, taken));
  const sorted = sortEvents(events);
  const minutes = sorted.reduce((sum, item) => sum + (item.minutes || 0), 0);
  return {
    date,
    count: sorted.length,
    minutes,
    events: sorted
  };
}
