import {
  parseGoalText,
  splitEven,
  createNinetyDayGoal,
  logNinetyDayGoalProgress,
  deleteNinetyDayGoalLog,
  previewNinetyDayGoal,
  findCyclesForDate,
  formatGoalAmount,
  MAX_ACTIVE_NINETY_DAY_GOALS,
  NINETY_DAY_SPAN,
  occupiesNinetyDayGoalSlot,
  countOccupiedNinetyDayGoalSlots
} from '../src/utils/ninetyDayGoals.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

function almostEqual(a, b, eps = 1e-6) {
  return Math.abs(Number(a) - Number(b)) < eps;
}

function runTests() {
  console.log('🧪 Testes de Metas de 90 dias...\n');

  assert(MAX_ACTIVE_NINETY_DAY_GOALS === 3, 'Máximo de 3 metas ativas');
  assert(NINETY_DAY_SPAN === 90, 'Ciclo dura 90 dias civis');

  const kg = parseGoalText('Quero perder 9 quilos');
  assert(kg.amount === 9 && kg.unit === 'kg' && kg.direction === 'reduce', 'Interpreta "perder 9 quilos"');

  const hours = parseGoalText('Quero estudar 180 horas');
  assert(hours.amount === 180 && hours.unit === 'horas' && hours.direction === 'accumulate', 'Interpreta "estudar 180 horas"');

  const grams = parseGoalText('Emagrecer 1,5 kg');
  assert(grams.amount === 1.5 && grams.unit === 'kg' && grams.direction === 'reduce', 'Interpreta decimal com vírgula');

  const ignoreHorizon = parseGoalText('Quero perder 9 quilos em 90 dias');
  assert(ignoreHorizon.amount === 9 && ignoreHorizon.unit === 'kg', 'Ignora o "90 dias" do horizonte ao extrair o valor');

  const parts = splitEven(9, 3);
  assert(parts.length === 3 && parts.every(p => p === 3), '9 kg / 3 meses = 3 kg');
  const weeks = splitEven(9, 12);
  assert(almostEqual(weeks[0], 0.75) && almostEqual(weeks.reduce((a, b) => a + b, 0), 9), '9 kg / 12 semanas = 0,75 kg e a soma fecha 9');

  const preview = previewNinetyDayGoal({ title: 'Quero perder 9 quilos' }, '2026-01-01');
  assert(preview.valid, 'Preview aceita meta de 9 kg');
  assert(preview.endDate === '2026-03-31', '90 dias a partir de 01/01/2026 terminam em 31/03/2026');
  assert(almostEqual(preview.monthTarget, 3), 'Submeta mensal = 3 kg');
  assert(almostEqual(preview.fortnightTarget, 1.5), 'Submeta quinzenal = 1,5 kg');
  assert(almostEqual(preview.weekTarget, 0.75), 'Submeta semanal = 0,75 kg');
  assert(formatGoalAmount(0.75, 'kg', 'kg') === '750 g', '0,75 kg é formatado como 750 g');

  const study = createNinetyDayGoal({ title: 'Quero estudar 180 horas' }, { today: '2026-01-01' });
  assert(study.cycles.month.length === 3, '3 submetas mensais');
  assert(study.cycles.fortnight.length === 6, '6 submetas quinzenais');
  assert(study.cycles.week.length === 12, '12 submetas semanais');
  assert(almostEqual(study.cycles.month[0].targetAmount, 60), '60 horas por mês');
  assert(almostEqual(study.cycles.fortnight[0].targetAmount, 30), '30 horas por quinzena');
  assert(almostEqual(study.cycles.week[0].targetAmount, 15), '15 horas por semana');
  assert(study.cycles.week[11].startDate === '2026-03-19' && study.cycles.week[11].endDate === '2026-03-31', 'Última semana cobre os 6 dias finais (dias 77–89)');

  const day15 = findCyclesForDate(study, '2026-01-15');
  assert(day15.week === 2 && day15.fortnight === 0 && day15.month === 0, '15/01 cai na semana 3, 1ª quinzena e 1º mês (índices 0-based)');
  const day16 = findCyclesForDate(study, '2026-01-16');
  assert(day16.week === 2 && day16.fortnight === 1, '16/01 abre a 2ª quinzena');

  const first = logNinetyDayGoalProgress(study, { amount: 15, date: '2026-01-03', note: 'Semana 1' }, '2026-01-03');
  assert(almostEqual(first.goal.currentAmount, 15), 'Avanço de 15h entra na meta de 90 dias');
  assert(almostEqual(first.goal.currentWeek.currentAmount, 15), 'Compila na semana atual');
  assert(almostEqual(first.goal.currentFortnight.currentAmount, 15), 'Compila na quinzena atual');
  assert(almostEqual(first.goal.currentMonth.currentAmount, 15), 'Compila no mês atual');
  assert(first.justCompleted.week === true, 'Fecha a 1ª semana automaticamente');
  assert(first.justCompleted.fortnight === false, 'Ainda não fecha a quinzena');
  assert(first.rewards.xp > 18, 'Conceder XP extra ao fechar a semana');

  const second = logNinetyDayGoalProgress(first.goal, { amount: 15, date: '2026-01-10' }, '2026-01-10');
  assert(almostEqual(second.goal.cycles.fortnight[0].currentAmount, 30), 'Duas semanas de 15h fecham 30h da 1ª quinzena');
  assert(second.justCompleted.fortnight === true, 'Fecha a 1ª quinzena ao completar 30h');
  assert(second.goal.cycles.week[0].completed && second.goal.cycles.week[1].completed, 'Semanas 1 e 2 ficam concluídas');

  const third = logNinetyDayGoalProgress(second.goal, { amount: 30, date: '2026-01-25' }, '2026-01-25');
  assert(almostEqual(third.goal.cycles.month[0].currentAmount, 60), 'Mês 1 chega a 60h');
  assert(third.justCompleted.month === true, 'Fecha o 1º mês automaticamente');

  let rolling = third.goal;
  for (let i = 1; i < 3; i += 1) {
    const date = `2026-0${i + 1}-15`;
    rolling = logNinetyDayGoalProgress(rolling, { amount: 60, date }, date).goal;
  }
  assert(rolling.status === 'completed', 'Ao completar 180h a meta de 90 dias é concluída');
  assert(almostEqual(rolling.currentAmount, 180), 'Progresso total = 180h');

  const undone = deleteNinetyDayGoalLog(rolling, rolling.logs[0].id, '2026-03-15');
  assert(undone.goal.status !== 'completed' || almostEqual(undone.goal.currentAmount, 120), 'Estornar um avanço recompila a meta maior');

  const overflowDate = (() => {
    try {
      logNinetyDayGoalProgress(study, { amount: 1, date: '2025-12-31' }, '2026-01-01');
      return false;
    } catch (err) {
      return /fora da janela/i.test(err.message);
    }
  })();
  assert(overflowDate, 'Recusa avanço fora da janela de 90 dias');

  const occupied = [
    { status: 'active' },
    { status: 'expired' },
    { status: 'completed' },
    { status: 'archived' }
  ];
  assert(countOccupiedNinetyDayGoalSlots(occupied) === 2, 'Apenas ativas e expiradas ocupam slot');
  assert(occupiesNinetyDayGoalSlot({ status: 'completed' }) === false, 'Concluída libera o slot para uma nova meta');

  console.log('\n🎉 Testes de Metas de 90 dias passaram!');
}

runTests();
