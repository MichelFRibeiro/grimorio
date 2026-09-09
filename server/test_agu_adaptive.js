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
import { getSaoPauloDayOfWeek } from '../src/utils/timeUtils.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const monday = '2026-09-07';
assert(getSaoPauloDayOfWeek(monday) === 1, '2026-09-07 deve ser segunda');
assert(fortnightStartFor('2026-09-09') === monday, 'quarta ancora na segunda da quinzena');
assert(afternoonBlockCap(2, { 2: 110 }) === 2, 'terça curta = 2 blocos');
assert(afternoonBlockCap(1, { 1: 225 }) === 3, 'segunda longa = 3 blocos');

assert(Math.abs(laplaceAccuracy(19, 20) - (21 / 24)) < 0.0001, 'Laplace 19/20');
assert(laplaceAccuracy(0, 0) === 0.5, 'prior 50%');

const penalStats = { solved: 41, correct: 39, accSmooth: laplaceAccuracy(39, 41), daysSince: 2 };
const penalSubject = AGU_SUBJECTS.find((s) => s.id === 'penal');
const topicStats = {};
(penalSubject.topics || []).forEach((t, i) => {
  topicStats[`penal/${t.id}`] = i === 0
    ? { solved: 41, correct: 39, accSmooth: laplaceAccuracy(39, 41), daysSince: 2 }
    : { solved: 0, correct: 0, accSmooth: 0.5, daysSince: 999 };
});
const penalMastery = getSubjectMastery(penalStats, topicStats, penalSubject, 21);
assert(penalMastery.id !== 'mastered', `Penal arts. 1–31 não é maestria de matéria, veio ${penalMastery.id}`);

const cold = getTopicMastery({ solved: 50, correct: 48, accSmooth: 0.92, daysSince: 40 }, 21);
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

const wednesday = '2026-09-09';
let wedPlan = startAguPlan(createDefaultAguPlan(wednesday), wednesday, []);
const sat = wedPlan.currentCycle.days.find((d) => d.weekday === 6);
assert(sat, 'sábado existe');
assert(sat.dateStr === '2026-09-12', `sábado da quinzena da quarta é 12/09, veio ${sat.dateStr}`);
assert(sat.blocks.every((b) => b.optional), 'sábado é bônus');
assert(wedPlan.currentCycle.days.filter((d) => d.weekday === 6).every((d) => getSaoPauloDayOfWeek(d.dateStr) === 6), 'kinds de sábado só no sábado');

wedPlan.currentCycle.days.forEach((day) => {
  if (day.weekday === 2 || day.weekday === 4) {
    const afternoon = (day.blocks || []).filter((b) => b.window === 'afternoon');
    assert(afternoon.length <= 2, `ter/qui tarde ≤ 2, ${day.dateStr} tem ${afternoon.length}`);
  }
  if (day.weekday === 1 || day.weekday === 3 || day.weekday === 5) {
    const afternoon = (day.blocks || []).filter((b) => b.window === 'afternoon');
    assert(afternoon.length <= 3, `seg/qua/sex tarde ≤ 3, ${day.dateStr} tem ${afternoon.length}`);
  }
  (day.blocks || []).forEach((block) => {
    assert(block.window !== 'night', 'nada depois das 18h');
  });
});

const zeroSummary = summarizePlan(plan, [], monday);
const todayBlocks = zeroSummary.today.blocks;
assert(todayBlocks.some((b) => b.subjectId === 'constitucional'), 'ciclo 1 cobre constitucional');
assert(todayBlocks.some((b) => b.kind === 'teoria'), 'ciclo 1 tem teoria');
const allBlocks = plan.currentCycle.days.flatMap((d) => d.blocks);
assert(allBlocks.some((b) => b.subjectId === 'administrativo'), 'adm presente');
assert(allBlocks.some((b) => b.subjectId === 'portugues'), 'português presente');
assert(allBlocks.some((b) => b.subjectId === 'seguridade'), 'seguridade presente');
assert(allBlocks.some((b) => b.subjectId === 'leg-agu'), 'leg AGU presente');
assert(allBlocks.some((b) => b.kind === 'discursiva' && b.targetProduct), 'discursiva com produto');
assert(allBlocks.some((b) => b.kind === 'lei-seca'), 'lei seca presente');

const exams = [
  { subject: 'Língua Portuguesa', subjectId: 'portugues', topic: 'Ortografia', topicId: 'ortografia', totalQuestions: 81, correctAnswers: 59, wrongAnswers: 22, date: monday },
  { subject: 'Direito Constitucional', subjectId: 'constitucional', topic: 'df', topicId: 'df', totalQuestions: 50, correctAnswers: 37, wrongAnswers: 13, date: monday },
  { subject: 'Direito Penal', subjectId: 'penal', topic: 'principios', topicId: 'principios', totalQuestions: 41, correctAnswers: 39, wrongAnswers: 2, date: monday }
];
const ranked = rankSubjects(plan, exams, monday).ranked;
const portRank = ranked.find((r) => r.subject.id === 'portugues');
const agrarioRank = ranked.find((r) => r.subject.id === 'agrario');
assert(portRank.score > agrarioRank.score, `Português furo deve pontuar mais que Agrário virgem relativo ao overlay, ${portRank.score} vs ${agrarioRank.score}`);

plan = applyExamToPlan(plan, exams[0], monday);
const cycle2Plan = advanceAguCycle(plan, '2026-09-21', exams);
assert(cycle2Plan.currentCycle.number === 2, 'ciclo 2');
const c1Subjects = new Set(plan.currentCycle.days.flatMap((d) => d.blocks.map((b) => `${b.subjectId}|${b.kind}`)));
const c2Subjects = new Set(cycle2Plan.currentCycle.days.flatMap((d) => d.blocks.map((b) => `${b.subjectId}|${b.kind}`)));
const same = [...c1Subjects].every((k) => c2Subjects.has(k)) && c1Subjects.size === c2Subjects.size;
assert(!same, 'ciclo 2 não é cópia do ciclo 1');
const c2All = cycle2Plan.currentCycle.days.flatMap((d) => d.blocks);
const portBlocks = c2All.filter((b) => b.subjectId === 'portugues').length;
const agrarioBlocks = c2All.filter((b) => b.subjectId === 'agrario').length;
assert(portBlocks >= agrarioBlocks, `Português (${portBlocks}) deve aparecer ≥ Agrário (${agrarioBlocks}) no ciclo 2`);

let windowPlan = startAguPlan(createDefaultAguPlan(monday), monday, []);
for (let i = 0; i < 3; i += 1) {
  windowPlan = advanceAguCycle(windowPlan, '2026-12-01', []);
}
const seen = new Set();
[windowPlan.currentCycle, ...(windowPlan.generatedCycles || [])].forEach((cycle) => {
  (cycle.days || []).forEach((day) => {
    (day.blocks || []).forEach((b) => seen.add(b.subjectId));
  });
});
assert(seen.has('leg-penal-esp'), 'Leg. Penal Especial entra na janela N≤3');
assert(seen.has('educacao-cti'), 'Educação/CTI entra na janela N≤3');

const partial = { subjectId: 'constitucional', date: monday, totalQuestions: 5, correctAnswers: 4, blockKey: plan.currentCycle.days[0].blocks.find((b) => b.kind === 'questoes')?.key };
const withPartial = applyExamToPlan({ ...plan, debt: [{ subjectId: 'constitucional', remainingQuestions: 25, kind: 'questoes' }] }, partial, monday);
assert(withPartial.debt[0].remainingQuestions === 20, `dívida 25-5=20, veio ${withPartial.debt[0].remainingQuestions}`);

const skipSat = startAguPlan(createDefaultAguPlan(monday), monday, []);
const mondayAfter = skipSat.currentCycle.days.find((d) => d.dateStr === '2026-09-14');
assert(mondayAfter, 'segunda da semana 2 existe');
assert(!(mondayAfter.blocks || []).some((b) => b.window === 'night'), 'segunda não ganha bloco noturno');

const disc = allBlocks.find((b) => b.kind === 'discursiva');
assert(disc.targetProduct, 'discursiva exige produto');
assert(!disc.done, 'discursiva não nasce feita');

const lockPlan = generateFortnight({
  ...createDefaultAguPlan(monday),
  phase: 'lock',
  editalPublished: true,
  keepPortuguese: true,
  removedSubjectIds: ['economico']
}, [], monday, { startDate: monday, cycleNumber: 2, phase: 'lock' });
assert(!lockPlan.days.flatMap((d) => d.blocks).some((b) => b.subjectId === 'economico'), 'lock remove Econômico');

const sanitized = sanitizeAguPlan({ version: 1, startedAt: monday }, monday);
assert(sanitized.version === 2, 'migra para v2');
assert(sanitized.capacityByWeekday[2] === 110, 'capacidade terça');
assert(Array.isArray(sanitized.debt), 'debt array');

const realigned = realignAguCycle(wedPlan, wednesday, []);
const sat2 = realigned.currentCycle.days.find((d) => d.weekday === 6 && d.weekIndex === 0);
assert(sat2.dateStr === '2026-09-12', 'realinhar numa quarta não move o sábado');

assert(AGU_CYCLE_LENGTH === 14, 'ciclo 14');
assert(AGU_SUBJECTS.length === 21, '21 matérias');

const schedule = getDaySchedule(plan, monday, {}, []);
assert(schedule.morning.length >= 1, 'segunda tem manhã');
assert(getCycleDayIndex(plan, monday) === 0, 'índice 0 na segunda do ciclo');

console.log('🎉 Teste do motor adaptativo AGU PASSOU.');
process.exit(0);
