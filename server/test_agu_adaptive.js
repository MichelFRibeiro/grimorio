import {
  AGU_CYCLE_LENGTH,
  AGU_SUBJECTS,
  createDefaultAguPlan
} from '../src/data/aguCurriculum.js';
import {
  laplaceAccuracy,
  getTopicMastery,
  getSubjectMastery,
  matchExamToSubject,
  rankSubjects
} from '../src/utils/aguFragility.js';
import {
  afternoonBlockCap,
  generateFortnight,
  fortnightStartFor
} from '../src/utils/aguCycleGenerator.js';
import {
  startAguPlan,
  sanitizeAguPlan,
  summarizePlan,
  getDaySchedule,
  getCycleDayIndex,
  advanceAguCycle,
  realignAguCycle,
  applyExamToPlan
} from '../src/utils/aguCycle.js';
import {
  buildTopicProgress,
  isPortugueseRequired,
  suggestNextBlock,
  collectStudyBlocks
} from '../src/utils/aguStudyEngine.js';
import { addDaysToDateStr, getSaoPauloDayOfWeek } from '../src/utils/timeUtils.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const monday = '2026-09-07';
assert(getSaoPauloDayOfWeek(monday) === 1, '2026-09-07 deve ser segunda');
assert(fortnightStartFor('2026-09-09') === monday, 'quarta ancora na segunda da quinzena');
assert(afternoonBlockCap(2, { 2: 180 }) === 3, 'qualquer dia = 3 blocos');
assert(afternoonBlockCap(1, { 1: 180 }) === 3, 'segunda = 3 blocos');

assert(Math.abs(laplaceAccuracy(19, 20) - (21 / 24)) < 0.0001, 'Laplace 19/20');
assert(laplaceAccuracy(0, 0) === 0.5, 'prior 50%');

const penalStats = { solved: 61, correct: 55, accSmooth: laplaceAccuracy(55, 61), daysSince: 2 };
const penalSubject = AGU_SUBJECTS.find((s) => s.id === 'penal');
const topicStats = {};
(penalSubject.topics || []).forEach((t, i) => {
  topicStats[`penal/${t.id}`] = i === 0
    ? { solved: 61, correct: 55, accSmooth: laplaceAccuracy(55, 61), daysSince: 2 }
    : { solved: 0, correct: 0, accSmooth: 0.5, daysSince: 999 };
});
const penalMastery = getSubjectMastery(penalStats, topicStats, penalSubject, 21);
assert(penalMastery.id !== 'mastered', `Penal um tópico não é maestria de matéria, veio ${penalMastery.id}`);

const cold = getTopicMastery({ solved: 60, correct: 55, accSmooth: 0.92, daysSince: 40 }, 21);
assert(cold.id === 'repair', `tópico frio deve ir a repair, veio ${cold.id}`);

const lindbCivil = { subject: 'Direito Civil', topic: 'LINDB', totalQuestions: 20, correctAnswers: 16 };
const lindbEsp = { subject: 'Legislação Civil', topic: 'LINDB', subjectId: 'leg-civil-esp', totalQuestions: 10, correctAnswers: 8 };
assert(matchExamToSubject(lindbCivil, AGU_SUBJECTS.find((s) => s.id === 'civil')), 'LINDB em Civil casa Civil');
assert(!matchExamToSubject(lindbEsp, AGU_SUBJECTS.find((s) => s.id === 'civil')), 'LINDB de Leg. Civil Especial não rouba Civil');
assert(matchExamToSubject(lindbEsp, AGU_SUBJECTS.find((s) => s.id === 'leg-civil-esp')), 'LINDB especial casa especial');

let plan = startAguPlan(createDefaultAguPlan(monday), monday, []);
assert(plan.startedAt === monday, 'start grava data');
assert(plan.currentCycle, 'ciclo 1 gerado');
assert(plan.currentCycle.days.length === 14, '14 dias');
assert(plan.currentCycle.start === monday, 'ciclo 1 começa na segunda da quinzena');

plan.currentCycle.days.forEach((day) => {
  assert((day.blocks || []).length === 3, `${day.dateStr} deve ter 3 blocos, tem ${(day.blocks || []).length}`);
  assert((day.blocks || []).some((b) => b.subjectId === 'portugues'), `${day.dateStr} inclui português`);
  const topics = (day.blocks || []).map((b) => `${b.subjectId}/${b.topicId}`);
  assert(new Set(topics).size === topics.length, `${day.dateStr} não repete tópico`);
});

const zeroSummary = summarizePlan(plan, [], monday);
assert(zeroSummary.today.blocks.length === 3, 'hoje tem 3 blocos');
assert(zeroSummary.today.blocks.some((b) => b.subjectId === 'portugues'), 'hoje inclui português');
assert(zeroSummary.portugueseRequired, 'português obrigatório no início');
assert(zeroSummary.edital.subjects.length === 21, 'edital lista 21 matérias');
assert(zeroSummary.nextBlock, 'sugere o próximo bloco');

const exams = [
  { subject: 'Língua Portuguesa', subjectId: 'portugues', topic: 'Ortografia', topicId: 'ortografia', kind: 'estudo', totalQuestions: 20, correctAnswers: 16, date: monday, durationMinutes: 50 },
  { subject: 'Direito Constitucional', subjectId: 'constitucional', topicId: 'teoria', kind: 'estudo', totalQuestions: 20, correctAnswers: 16, date: monday, durationMinutes: 50 }
];
const ranked = rankSubjects(plan, exams, monday).ranked;
const portRank = ranked.find((r) => r.subject.id === 'portugues');
const agrarioRank = ranked.find((r) => r.subject.id === 'agrario');
assert(portRank.score > agrarioRank.score, `Português deve pontuar mais que Agrário, ${portRank.score} vs ${agrarioRank.score}`);

plan = applyExamToPlan(plan, exams[0], monday, exams);
const cycle2Plan = advanceAguCycle(plan, '2026-09-21', exams);
assert(cycle2Plan.currentCycle.number === 2, 'ciclo 2');
assert(cycle2Plan.currentCycle.days.every((d) => (d.blocks || []).length === 3), 'ciclo 2 também tem 3 blocos/dia');

const lockPlan = generateFortnight({
  ...createDefaultAguPlan(monday),
  phase: 'lock',
  editalPublished: true,
  keepPortuguese: true,
  removedSubjectIds: ['economico']
}, [], monday, { startDate: monday, cycleNumber: 2, phase: 'lock' });
assert(!lockPlan.days.flatMap((d) => d.blocks).some((b) => b.subjectId === 'economico'), 'lock remove Econômico');

const sanitized = sanitizeAguPlan({ version: 1, startedAt: monday }, monday);
assert(sanitized.version === 3, 'migra para v3');
assert(sanitized.dailyBlocks === 3, '3 blocos/dia');
assert(Array.isArray(sanitized.debt), 'debt array');

const wednesday = '2026-09-09';
let wedPlan = startAguPlan(createDefaultAguPlan(wednesday), wednesday, []);
const realigned = realignAguCycle(wedPlan, wednesday, []);
assert(realigned.currentCycle.days[0].dateStr === monday, 'realinhar numa quarta ancora na segunda');

assert(AGU_CYCLE_LENGTH === 14, 'ciclo 14');
assert(AGU_SUBJECTS.length === 21, '21 matérias');
assert(getCycleDayIndex(plan, monday) === 0, 'índice 0 na segunda do ciclo');
assert(getDaySchedule(plan, monday, {}, []).blocks.length === 3, 'segunda tem 3 blocos');

const topicExams = [];
for (let i = 0; i < 3; i += 1) {
  topicExams.push({
    subjectId: 'constitucional',
    topicId: 'teoria',
    kind: 'estudo',
    date: addDaysToDateStr(monday, i),
    totalQuestions: 20,
    correctAnswers: 18,
    durationMinutes: 50,
    blockKey: `${addDaysToDateStr(monday, i)}|constitucional|estudo|teoria`
  });
}
const progress = buildTopicProgress(createDefaultAguPlan(monday), topicExams, addDaysToDateStr(monday, 2));
const row = progress['constitucional/teoria'];
assert(row.status === 'completed', `60 questões com último bloco ≥80% conclui o tópico, veio ${row.status}`);
assert(row.nextReviewAt === addDaysToDateStr(monday, 3), `primeira revisão em 1 dia, veio ${row.nextReviewAt}`);

const failLast = topicExams.map((e, i) => (i === 2 ? { ...e, correctAnswers: 10 } : e));
const reopened = buildTopicProgress(createDefaultAguPlan(monday), failLast, addDaysToDateStr(monday, 2));
assert(reopened['constitucional/teoria'].status === 'pending', 'último bloco <80% reabre o tópico');

const portBlocks = [];
for (let i = 0; i < 10; i += 1) {
  portBlocks.push({
    subjectId: 'portugues',
    topicId: 'ortografia',
    kind: 'estudo',
    date: addDaysToDateStr(monday, i),
    totalQuestions: 20,
    correctAnswers: 20,
    durationMinutes: 40
  });
}
assert(isPortugueseRequired(collectStudyBlocks(createDefaultAguPlan(monday), portBlocks)) === false, '10 blocos de português ≥95% dispensam a trava');
portBlocks[0] = { ...portBlocks[0], correctAnswers: 10 };
assert(isPortugueseRequired(collectStudyBlocks(createDefaultAguPlan(monday), portBlocks)) === true, 'um dos 10 abaixo de 95% mantém a trava');

const next = suggestNextBlock(createDefaultAguPlan(monday), [], monday);
assert(next.subjectId === 'portugues', `próximo bloco sem histórico começa em português, veio ${next.subjectId}`);

console.log('🎉 Teste do motor adaptativo AGU PASSOU.');
process.exit(0);
