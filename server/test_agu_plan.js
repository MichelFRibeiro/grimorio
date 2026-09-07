import {
  AGU_CYCLE_LENGTH,
  AGU_SUBJECTS,
  AGU_TARGET_ACCURACY,
  createDefaultAguPlan
} from '../src/data/aguCurriculum.js';
import {
  getCycleDayIndex,
  matchExamToSubject,
  buildSubjectStats,
  getDaySchedule,
  summarizePlan,
  startAguPlan,
  toggleCompletedBlock,
  sanitizeAguPlan
} from '../src/utils/aguCycle.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const monday = '2026-09-07';
let plan = createDefaultAguPlan(monday);
plan = startAguPlan(plan, monday);

assert(plan.startedAt === monday, 'Campanha deve iniciar na data informada');
assert(getCycleDayIndex(plan, monday) === 0, 'Segunda inicial deve ser dia 0 do ciclo');
assert(getCycleDayIndex(plan, '2026-09-20') === 13, '14º dia deve fechar o ciclo');
assert(getCycleDayIndex(plan, '2026-09-21') === 0, 'Ciclo deve recomeçar após 14 dias');
assert(AGU_CYCLE_LENGTH === 14, 'Ciclo tem 14 dias');
assert(AGU_SUBJECTS.some((s) => s.id === 'portugues' && s.extra), 'Português entra como extra');
assert(AGU_SUBJECTS.length === 21, `21 matérias esperadas, veio ${AGU_SUBJECTS.length}`);

const exams = [
  { subject: 'Direito Constitucional', totalQuestions: 20, correctAnswers: 15, wrongAnswers: 5, date: monday },
  { subject: 'Língua Portuguesa', topic: 'Ortografia', totalQuestions: 21, correctAnswers: 11, wrongAnswers: 10, date: monday },
  { subject: 'Direito Penal', totalQuestions: 20, correctAnswers: 19, wrongAnswers: 1, date: monday }
];

assert(matchExamToSubject(exams[0], AGU_SUBJECTS.find((s) => s.id === 'constitucional')), 'Match constitucional');
assert(matchExamToSubject(exams[1], AGU_SUBJECTS.find((s) => s.id === 'portugues')), 'Match português');

const stats = buildSubjectStats(exams);
assert(stats.constitucional.solved === 20, 'Constitucional deve somar 20');
assert(stats.portugues.accuracy === 52.4, `Português 52.4%, veio ${stats.portugues.accuracy}`);

const today = getDaySchedule(plan, monday, stats);
assert(today.blocks.length >= 2, 'Dia 1 tem ao menos 2 blocos');
assert(today.blocks[0].subjectId === 'constitucional', 'Dia 1 abre com constitucional');
assert(today.blocks.some((b) => b.subjectId === 'portugues'), 'Dia 1 inclui português');

const key = today.blocks[0].key;
plan = toggleCompletedBlock(plan, key);
assert(plan.completedBlocks[key], 'Bloco deve ser marcado');
plan = toggleCompletedBlock(plan, key);
assert(!plan.completedBlocks[key], 'Bloco deve ser desmarcado');

const summary = summarizePlan(plan, exams, monday);
assert(summary.todayProgress.solved === 61, `Hoje 61 questões, veio ${summary.todayProgress.solved}`);
assert(summary.targetAccuracy === AGU_TARGET_ACCURACY, 'Meta de 90%');
assert(sanitizeAguPlan(null, monday).completedBlocks, 'sanitize cria plano vazio');

console.log('🎉 Teste da campanha AGU PASSOU COM SUCESSO!');
process.exit(0);
