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
  setBlockDuration,
  getAguStudyTimeTotals,
  getAguStudyLoadSeries,
  classifyStudyLoadHours,
  buildHomeostasisBand,
  AGU_STUDY_LOAD_WINDOW_DAYS,
  AGU_HOMEOSTASIS_BAND_RATIO
} from '../src/utils/aguCycle.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const monday = '2026-09-07';
let plan = createDefaultAguPlan(monday);
plan = startAguPlan(plan, monday);

assert(plan.startedAt === monday, 'Campanha deve iniciar na data informada');
assert(getCycleDayIndex(plan, monday) === 0, 'Segunda inicial deve ser dia 0 do ciclo');
assert(plan.currentCycle?.days?.length === 14, 'Ciclo gerado tem 14 dias');
assert(AGU_CYCLE_LENGTH === 14, 'Ciclo tem 14 dias');
assert(AGU_SUBJECTS.some((s) => s.id === 'portugues' && s.extra), 'Português entra como extra');
assert(AGU_SUBJECTS.length === 21, `21 matérias esperadas, veio ${AGU_SUBJECTS.length}`);

const exams = [
  { subject: 'Direito Constitucional', subjectId: 'constitucional', topicId: 'teoria', totalQuestions: 20, correctAnswers: 15, wrongAnswers: 5, date: monday, durationMinutes: 40 },
  { subject: 'Língua Portuguesa', subjectId: 'portugues', topic: 'Ortografia', topicId: 'ortografia', totalQuestions: 21, correctAnswers: 11, wrongAnswers: 10, date: monday, durationMinutes: 25 },
  { subject: 'Direito Penal', subjectId: 'penal', topicId: 'principios', totalQuestions: 20, correctAnswers: 19, wrongAnswers: 1, date: monday, durationMinutes: 30 }
];

assert(matchExamToSubject(exams[0], AGU_SUBJECTS.find((s) => s.id === 'constitucional')), 'Match constitucional');
assert(matchExamToSubject(exams[1], AGU_SUBJECTS.find((s) => s.id === 'portugues')), 'Match português');

const stats = buildSubjectStats(exams);
assert(stats.constitucional.solved === 20, 'Constitucional deve somar 20');
assert(stats.portugues.accuracy === 52.4, `Português 52.4%, veio ${stats.portugues.accuracy}`);

const today = getDaySchedule(plan, monday, stats, exams);
assert(today.blocks.length === 3, `Dia tem 3 blocos, veio ${today.blocks.length}`);
assert(today.blocks.some((b) => b.subjectId === 'portugues'), 'Dia 1 inclui português');
assert(today.blocks.every((b) => b.target === 20 && b.targetMinutes === 60), 'Cada bloco fecha com 20 q ou 60 min');

const key = today.blocks[0].key;
plan = toggleCompletedBlock(plan, key);
assert(plan.completedBlocks[key], 'Bloco deve ser marcado');
plan = toggleCompletedBlock(plan, key);
assert(!plan.completedBlocks[key], 'Bloco deve ser desmarcado');

plan = addBlockDuration(plan, `${monday}|administrativo|estudo|atos`, 12);
plan = addBlockDuration(plan, `${monday}|administrativo|estudo|atos`, 8);
assert(plan.blockDurations[`${monday}|administrativo|estudo|atos`] === 20, 'Duração do bloco deve somar');
plan = addBlockDuration(plan, `${monday}|administrativo|estudo|atos`, 30);
plan = addBlockDuration(plan, `${monday}|administrativo|estudo|atos`, 33);
assert(plan.blockDurations[`${monday}|administrativo|estudo|atos`] === 83, 'Sessões lançadas devem somar (20 + 30 + 33)');
plan = setBlockDuration(plan, `${monday}|administrativo|estudo|atos`, 45);
assert(plan.blockDurations[`${monday}|administrativo|estudo|atos`] === 45, 'Duração manual substitui o valor');

const laterExam = { subject: 'Direito Civil', subjectId: 'civil', topicId: 'pessoas', totalQuestions: 10, correctAnswers: 9, date: '2026-10-01', durationMinutes: 50 };
const timeTotals = getAguStudyTimeTotals(plan, [...exams, laterExam], monday);
assert(timeTotals.day === 140, `Hoje 140 min (95 exames + 45 bloco sem exame), veio ${timeTotals.day}`);
assert(timeTotals.week === 140, `Semana deve incluir só o ciclo atual, veio ${timeTotals.week}`);
assert(timeTotals.cycle === 140, `Ciclo deve ignorar outubro, veio ${timeTotals.cycle}`);
assert(timeTotals.month === 140, `Mês deve ignorar outubro, veio ${timeTotals.month}`);
assert(timeTotals.year === 190, `Ano deve incluir outubro, veio ${timeTotals.year}`);
assert(timeTotals.total === 190, `Total 190 min, veio ${timeTotals.total}`);

const summary = summarizePlan(plan, exams, monday);
assert(summary.todayProgress.solved === 61, `Hoje 61 questões, veio ${summary.todayProgress.solved}`);
assert(summary.targetAccuracy === AGU_TARGET_ACCURACY, 'Meta de 90%');
assert(summary.portugueseRequired === true, 'Português permanece obrigatório');
assert(summary.edital?.subjects?.length === 21, 'Edital verticalizado lista as matérias');
assert(Array.isArray(summary.studyBlocks), 'Histórico de blocos presente');
assert(summary.nextBlock, 'Próximo bloco sugerido');
assert(AGU_STUDY_LOAD_WINDOW_DAYS === 14, 'Janela da faixa usa 14 dias');
assert(AGU_HOMEOSTASIS_BAND_RATIO === 0.2, 'Faixa é ±20% da média real');
const band = buildHomeostasisBand(34);
assert(band.avgMinutes === 34, `Centro da faixa é a média em minutos, veio ${band.avgMinutes}`);
assert(band.homeostasisMinMinutes === 27, `Piso −20% deveria ser 27 min, veio ${band.homeostasisMinMinutes}`);
assert(band.homeostasisMaxMinutes === 41, `Teto +20% deveria ser 41 min, veio ${band.homeostasisMaxMinutes}`);
assert(classifyStudyLoadHours(34, band) === 'homeostasis', 'Média está em homeostase');
assert(classifyStudyLoadHours(20, band) === 'allostasis-under', 'Abaixo da média recente é subcarga');
assert(classifyStudyLoadHours(50, band) === 'allostasis-over', 'Acima da média recente é sobrecarga');
assert(classifyStudyLoadHours(0, buildHomeostasisBand(0)) === 'homeostasis', 'Média zero: 0 min permanece na faixa');

const loadSeries = getAguStudyLoadSeries(plan, [...exams, laterExam], monday, { days: 14 });
const mondayPoint = loadSeries.points.find((p) => p.dateStr === monday);
assert(mondayPoint.minutes === 140, `Segunda deve ter 140 min, veio ${mondayPoint.minutes}`);
assert(loadSeries.avgMinutes === 10, `Média 14d de 140 min é 10 min, veio ${loadSeries.avgMinutes}`);
assert(loadSeries.homeostasisMinMinutes === 8, `Piso deveria ser 8 min, veio ${loadSeries.homeostasisMinMinutes}`);
assert(loadSeries.homeostasisMaxMinutes === 12, `Teto deveria ser 12 min, veio ${loadSeries.homeostasisMaxMinutes}`);
assert(mondayPoint.zone === 'allostasis-over', '140 min supera a média recente e entra em sobrecarga');
assert(loadSeries.points.length === 14, 'Série padrão cobre 14 dias');
assert(loadSeries.today.dateStr === monday, 'today aponta para a data de referência');

assert(sanitizeAguPlan(null, monday).completedBlocks, 'sanitize cria plano vazio');
assert(sanitizeAguPlan(plan, monday).blockDurations[`${monday}|administrativo|estudo|atos`] === 45, 'sanitize preserva durações');

console.log('🎉 Teste da campanha AGU PASSOU COM SUCESSO!');
process.exit(0);
