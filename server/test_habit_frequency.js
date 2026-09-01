import {
  applyHabitFrequency,
  getFrequencyLabel,
  getHabitPeriodStatus,
  isPeriodFrequency,
  normalizeFortnightDays,
  resolveFrequencyConfig
} from '../src/utils/habitFrequency.js';
import { getHabitWeeklyStats } from './timeUtils.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

function runTests() {
  console.log('🧪 Testes de frequência quinzenal e mensal de rituais...\n');

  assert(isPeriodFrequency('fortnightly') && isPeriodFrequency('monthly'), 'fortnightly e monthly são frequências de período');
  assert(!isPeriodFrequency('weekly') && !isPeriodFrequency('daily'), 'weekly e daily não são frequências de período');

  const days = normalizeFortnightDays(['01', '16']);
  assert(days[0] === 1 && days[1] === 16, 'Dias da quinzena 01 e 16 são normalizados para [1, 16]');
  const sameDays = normalizeFortnightDays([1, 1]);
  assert(sameDays[0] !== sameDays[1], 'Dias iguais da quinzena são afastados automaticamente');

  const fortnightly = applyHabitFrequency({}, {
    frequency: 'fortnightly',
    monthDays: [16, 1]
  });
  assert(fortnightly.frequency === 'fortnightly', 'Criação quinzenal persiste frequency=fortnightly');
  assert(JSON.stringify(fortnightly.monthDays) === JSON.stringify([1, 16]), 'Dias da quinzena ficam ordenados [1, 16]');
  assert(fortnightly.targetTimesPerWeek === 1, 'Quinzenal usa meta 1 por ciclo');
  assert(getFrequencyLabel(fortnightly) === 'Quinzena (01 e 16)', 'Label da quinzena inclui os dois dias');

  const monthly = applyHabitFrequency({}, { frequency: 'monthly', monthDay: 1 });
  assert(monthly.frequency === 'monthly' && JSON.stringify(monthly.monthDays) === JSON.stringify([1]), 'Mensal persiste monthDays=[1]');
  assert(getFrequencyLabel(monthly) === 'Mensal (dia 01)', 'Label mensal inclui o dia previsto');

  const updated = applyHabitFrequency({ ...fortnightly }, { frequency: 'monthly', monthDay: 5 }, { isUpdate: true });
  assert(updated.frequency === 'monthly' && updated.monthDays[0] === 5, 'Edição troca quinzena por mensal no dia 05');

  const cleared = applyHabitFrequency({ ...updated }, { frequency: 'daily', monthDays: null }, { isUpdate: true });
  assert(cleared.frequency === 'daily' && cleared.monthDays === undefined, 'Voltar para diário remove monthDays');

  const cfg = resolveFrequencyConfig({ frequency: 'n_times_week', targetTimesPerWeek: 3 });
  assert(cfg.frequency === 'times_per_week' && cfg.targetTimesPerWeek === 3, 'Alias n_times_week continua mapeando para times_per_week');

  const habit = {
    frequency: 'fortnightly',
    monthDays: [1, 16],
    history: []
  };

  const jan10 = getHabitPeriodStatus(habit, '2026-01-10');
  assert(jan10.start === '2026-01-01' && jan10.nextStart === '2026-01-16', 'Em 10/01 o ciclo quinzenal começou no dia 01');
  assert(jan10.due === true, 'Sem conclusão, o ritual fica pendente após o dia 01');

  const jan20Pending = getHabitPeriodStatus(habit, '2026-01-20');
  assert(jan20Pending.start === '2026-01-16' && jan20Pending.nextStart === '2026-02-01', 'Em 20/01 o ciclo é o da segunda quinzena (16)');
  assert(jan20Pending.due === true, 'Dia 16 reabre a pendência da segunda quinzena');

  const doneFirstHalf = getHabitPeriodStatus({ ...habit, history: ['2026-01-05'] }, '2026-01-10');
  assert(doneFirstHalf.completed === true && doneFirstHalf.due === false, 'Concluir no dia 05 encerra a pendência da primeira quinzena');

  const stillPendingSecond = getHabitPeriodStatus({ ...habit, history: ['2026-01-05'] }, '2026-01-16');
  assert(stillPendingSecond.due === true && stillPendingSecond.start === '2026-01-16', 'No dia 16 a pendência reabre mesmo com a quinzena anterior feita');

  const monthlyHabit = { frequency: 'monthly', monthDays: [1], history: [] };
  const jan15 = getHabitPeriodStatus(monthlyHabit, '2026-01-15');
  assert(jan15.start === '2026-01-01' && jan15.nextStart === '2026-02-01' && jan15.due === true, 'Mensal fica pendente a partir do dia 01 até o fim do mês');

  const monthlyDone = getHabitPeriodStatus({ ...monthlyHabit, history: ['2026-01-20'] }, '2026-01-28');
  assert(monthlyDone.completed === true, 'Concluir em qualquer dia do mês encerra o ciclo mensal');

  const febStart = getHabitPeriodStatus(monthlyHabit, '2026-02-01');
  assert(febStart.due === true && febStart.start === '2026-02-01', 'No dia 01 do mês seguinte a pendência reabre');

  const endOfMonth = getHabitPeriodStatus({ frequency: 'monthly', monthDays: [31], history: [] }, '2026-02-28');
  assert(endOfMonth.start === '2026-02-28', 'Dia 31 é limitado ao último dia de fevereiro');

  const weeklyFortnight = getHabitWeeklyStats({
    frequency: 'fortnightly',
    monthDays: [1, 16],
    history: ['2026-01-05']
  }, '2026-01-10');
  assert(weeklyFortnight.isGoalMet === true, 'getHabitWeeklyStats considera o ciclo quinzenal concluído, não a semana');
  assert(weeklyFortnight.period?.completed === true, 'period.completed marca a quinzena como feita');

  const weeklyPending = getHabitWeeklyStats({
    frequency: 'monthly',
    monthDays: [1],
    history: []
  }, '2026-01-20');
  assert(weeklyPending.isGoalMet === false && weeklyPending.period?.due === true, 'Mensal sem conclusão permanece pendente nas stats');

  const createdLate = getHabitPeriodStatus({
    frequency: 'fortnightly',
    monthDays: [1, 16],
    history: [],
    createdAt: '2026-01-10T12:00:00.000Z'
  }, '2026-01-10');
  assert(createdLate.due === false, 'Ritual criado depois do dia 01 só fica pendente na próxima quinzena');

  const createdOnStart = getHabitPeriodStatus({
    frequency: 'monthly',
    monthDays: [1],
    history: [],
    createdAt: '2026-01-01T12:00:00.000Z'
  }, '2026-01-01');
  assert(createdOnStart.due === true, 'Ritual criado no próprio dia previsto já nasce pendente');

  console.log('\n🎉 TODOS OS TESTES DE FREQUÊNCIA QUINZENAL/MENSAL PASSARAM!');
}

runTests();
