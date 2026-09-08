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
  sanitizeAguPlan,
  addBlockDuration,
  getAguStudyTimeTotals
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
  { subject: 'Direito Constitucional', totalQuestions: 20, correctAnswers: 15, wrongAnswers: 5, date: monday, durationMinutes: 40 },
  { subject: 'Língua Portuguesa', topic: 'Ortografia', totalQuestions: 21, correctAnswers: 11, wrongAnswers: 10, date: monday, durationMinutes: 25 },
  { subject: 'Direito Penal', totalQuestions: 20, correctAnswers: 19, wrongAnswers: 1, date: monday, durationMinutes: 30 }
];

assert(matchExamToSubject(exams[0], AGU_SUBJECTS.find((s) => s.id === 'constitucional')), 'Match constitucional');
assert(matchExamToSubject(exams[1], AGU_SUBJECTS.find((s) => s.id === 'portugues')), 'Match português');

const stats = buildSubjectStats(exams);
assert(stats.constitucional.solved === 20, 'Constitucional deve somar 20');
assert(stats.portugues.accuracy === 52.4, `Português 52.4%, veio ${stats.portugues.accuracy}`);

const today = getDaySchedule(plan, monday, stats, exams);
assert(today.blocks.length >= 2, 'Dia 1 tem ao menos 2 blocos');
assert(today.blocks[0].subjectId === 'constitucional', 'Dia 1 abre com constitucional');
assert(today.blocks.some((b) => b.subjectId === 'portugues'), 'Dia 1 inclui português');
assert(today.blocks[0].todayProgress.solved === 20, 'Bloco constitucional conta as 20 de hoje');
assert(today.blocks[0].remaining === 10, 'Meta 30, feitas 20, faltam 10');
assert(today.blocks[0].metTarget === false, 'Ainda não bateu a meta de 30');

const key = today.blocks[0].key;
plan = toggleCompletedBlock(plan, key);
assert(plan.completedBlocks[key], 'Bloco deve ser marcado');
plan = toggleCompletedBlock(plan, key);
assert(!plan.completedBlocks[key], 'Bloco deve ser desmarcado');

plan = addBlockDuration(plan, `${monday}|constitucional|questoes`, 12);
plan = addBlockDuration(plan, `${monday}|constitucional|questoes`, 8);
assert(plan.blockDurations[`${monday}|constitucional|questoes`] === 20, 'Duração do bloco deve somar');

const laterExam = { subject: 'Direito Civil', totalQuestions: 10, correctAnswers: 9, date: '2026-10-01', durationMinutes: 50 };
const timeTotals = getAguStudyTimeTotals(plan, [...exams, laterExam], monday);
assert(timeTotals.day === 115, `Hoje 115 min (95 exames + 20 bloco), veio ${timeTotals.day}`);
assert(timeTotals.week === 115, `Semana deve incluir só o ciclo atual, veio ${timeTotals.week}`);
assert(timeTotals.cycle === 115, `Ciclo deve ignorar outubro, veio ${timeTotals.cycle}`);
assert(timeTotals.month === 115, `Mês deve ignorar outubro, veio ${timeTotals.month}`);
assert(timeTotals.year === 165, `Ano deve incluir outubro, veio ${timeTotals.year}`);
assert(timeTotals.total === 165, `Total 165 min, veio ${timeTotals.total}`);

const summary = summarizePlan(plan, exams, monday);
assert(summary.todayProgress.solved === 61, `Hoje 61 questões, veio ${summary.todayProgress.solved}`);
assert(summary.targetAccuracy === AGU_TARGET_ACCURACY, 'Meta de 90%');
assert(summary.studyTime.day === 115, `Resumo deve expor tempo do dia, veio ${summary.studyTime.day}`);
assert(sanitizeAguPlan(null, monday).completedBlocks, 'sanitize cria plano vazio');
assert(sanitizeAguPlan(plan, monday).blockDurations[`${monday}|constitucional|questoes`] === 20, 'sanitize preserva durações');

console.log('🎉 Teste da campanha AGU PASSOU COM SUCESSO!');
process.exit(0);
