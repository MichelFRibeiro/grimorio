import {
  MAX_DAILY_VICTORIES,
  DAILY_VICTORY_REWARDS,
  DAILY_VICTORY_TRIPLE_BONUS,
  canPlanForDate,
  canCompleteOnDate,
  createDailyVictory,
  updateDailyVictory,
  completeDailyVictory,
  deleteDailyVictory,
  summarizeDay,
  sanitizeDailyVictories,
  bonusEntityId
} from '../src/utils/dailyVictories.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

function runTests() {
  console.log('🧪 Testes de Vitórias Planejadas para o Dia...\n');

  const today = '2026-03-20';
  const tomorrow = '2026-03-21';
  const yesterday = '2026-03-19';

  assert(MAX_DAILY_VICTORIES === 3, 'Máximo de 3 vitórias por dia');
  assert(DAILY_VICTORY_REWARDS.xp === 40 && DAILY_VICTORY_REWARDS.coins === 12, 'Recompensa individual definida');
  assert(DAILY_VICTORY_TRIPLE_BONUS.xp === 60 && DAILY_VICTORY_TRIPLE_BONUS.coins === 20, 'Bônus da tríade definido');
  assert(canPlanForDate(today, today) && canPlanForDate(tomorrow, today), 'Permite cadastrar hoje e amanhã');
  assert(!canPlanForDate(yesterday, today), 'Não permite cadastrar no passado');
  assert(canCompleteOnDate(today, today) && !canCompleteOnDate(tomorrow, today), 'Só conclui no próprio dia');

  let list = [];
  const first = createDailyVictory(list, { title: 'Finalizar petição', category: 'Trabalho', date: today }, { today });
  list = first.list;
  assert(list.length === 1 && list[0].title === 'Finalizar petição', 'Cria a primeira vitória do dia');
  assert(!list[0].completed, 'Vitória nasce pendente');

  const second = createDailyVictory(list, { title: 'Treinar 40 min', category: 'Saúde', date: today }, { today });
  list = second.list;
  const third = createDailyVictory(list, { title: 'Ler 20 páginas', category: 'Estudos', date: today }, { today });
  list = third.list;
  assert(list.length === 3, 'Aceita as 3 vitórias do dia');

  let blocked = false;
  try {
    createDailyVictory(list, { title: 'Quarta vitória', date: today }, { today });
  } catch (err) {
    blocked = /3 vitórias/.test(err.message);
  }
  assert(blocked, 'Bloqueia a 4ª vitória no mesmo dia');

  const tomorrowWin = createDailyVictory(list, { title: 'Acordar cedo', category: 'Pessoal', date: tomorrow }, { today });
  list = tomorrowWin.list;
  assert(list.filter(v => v.date === tomorrow).length === 1, 'Permite planejar amanhã mesmo com o dia cheio');

  let pastBlocked = false;
  try {
    createDailyVictory(list, { title: 'Ontem', date: yesterday }, { today });
  } catch (err) {
    pastBlocked = true;
  }
  assert(pastBlocked, 'Recusa cadastro em data passada');

  const updated = updateDailyVictory(list, first.victory.id, { title: 'Finalizar petição da AGU', category: 'Trabalho' }, { today });
  list = updated.list;
  assert(updated.victory.title === 'Finalizar petição da AGU', 'Edita título da vitória pendente');

  let earlyComplete = false;
  try {
    completeDailyVictory(list, {}, tomorrowWin.victory.id, { today });
  } catch (err) {
    earlyComplete = /próprio dia/.test(err.message);
  }
  assert(earlyComplete, 'Não deixa concluir vitória de amanhã hoje');

  let bonuses = {};
  const c1 = completeDailyVictory(list, bonuses, first.victory.id, { note: 'Petição protocolada.', today });
  list = c1.list;
  bonuses = c1.bonuses;
  assert(c1.willComplete && c1.victory.completed && c1.victory.note === 'Petição protocolada.', 'Conclui a 1ª vitória com anotação');
  assert(!c1.bonusAwardedNow, 'Ainda não dispara o bônus da tríade');

  const c2 = completeDailyVictory(list, bonuses, second.victory.id, { today });
  list = c2.list;
  bonuses = c2.bonuses;
  const c3 = completeDailyVictory(list, bonuses, third.victory.id, { note: 'Capítulo 4.', today });
  list = c3.list;
  bonuses = c3.bonuses;
  assert(c3.bonusAwardedNow === true, 'Concluir as 3 dispara o bônus');
  assert(bonuses[today]?.awarded === true, 'Bônus fica persistido para o dia');

  const summary = summarizeDay(list, today, bonuses);
  assert(summary.allComplete && summary.completedCount === 3, 'Resumo marca o dia como tríade completa');

  const reopen = completeDailyVictory(list, bonuses, third.victory.id, { completed: false, today });
  list = reopen.list;
  bonuses = reopen.bonuses;
  assert(!reopen.willComplete && reopen.bonusRevertedNow, 'Desmarcar uma vitória estorna o bônus da tríade');
  assert(!bonuses[today], 'Registro de bônus é removido ao reabrir');

  const again = completeDailyVictory(list, bonuses, third.victory.id, { today });
  list = again.list;
  bonuses = again.bonuses;
  assert(again.bonusAwardedNow, 'Reconcluir as 3 reconcede o bônus');

  const removed = deleteDailyVictory(list, bonuses, first.victory.id);
  list = removed.list;
  bonuses = removed.bonuses;
  assert(removed.shouldRevertReward, 'Excluir vitória concluída pede estorno');
  assert(removed.bonusRevertedNow, 'Excluir uma das 3 estorna o bônus');
  assert(list.filter(v => v.date === today).length === 2, 'Restam 2 vitórias no dia');

  const emptyTitle = (() => {
    try {
      createDailyVictory([], { title: '   ', date: today }, { today });
      return false;
    } catch {
      return true;
    }
  })();
  assert(emptyTitle, 'Título vazio é recusado');

  const sanitized = sanitizeDailyVictories([
    { id: 'x', title: 'Ok', date: today, category: 'Estudos' },
    { title: '', date: today },
    { title: 'Sem data' }
  ]);
  assert(sanitized.length === 1 && sanitized[0].category === 'Estudos', 'Sanitize descarta registros inválidos');
  assert(bonusEntityId(today) === 'dv-bonus-2026-03-20', 'ID estável do bônus da tríade');

  console.log('\n🎉 Todos os testes de Vitórias Planejadas passaram!');
}

runTests();
