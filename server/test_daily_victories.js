import {
  MAX_DAILY_VICTORIES,
  EXTENDED_MAX_DAILY_VICTORIES,
  DAILY_VICTORY_OVERFLOW_SOURCES,
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
  bonusEntityId,
  classifyDayOutcome,
  DAY_OUTCOME,
  buildMonthCalendar,
  shiftMonthKey,
  monthKeyFromDate,
  canPlanQuestAsDailyVictory,
  isQuestPlannedForDate,
  parseHomeostasisVictoryTargetMinutes,
  isHomeostasisVictoryFulfilled,
  planLinkedDailyVictoryUpdates
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

  assert(MAX_DAILY_VICTORIES === 3, 'Máximo de 3 vitórias manuais por dia');
  assert(EXTENDED_MAX_DAILY_VICTORIES === 5, 'Estudo e leitura podem ir a 5');
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

  assert(classifyDayOutcome(0, 0) === DAY_OUTCOME.unplanned, 'Sem planejamento quando não há tarefas');
  assert(classifyDayOutcome(3, 0) === DAY_OUTCOME.defeat, 'Derrota quando nenhuma planejada foi feita');
  assert(classifyDayOutcome(3, 2) === DAY_OUTCOME.partial, 'Parcial quando só algumas foram feitas');
  assert(classifyDayOutcome(2, 2) === DAY_OUTCOME.victory, 'Vitória quando todas as planejadas foram feitas');
  assert(monthKeyFromDate(today) === '2026-03', 'Extrai YYYY-MM da data');
  assert(shiftMonthKey('2026-03', -1) === '2026-02' && shiftMonthKey('2026-12', 1) === '2027-01', 'Navega entre meses');

  const cal = buildMonthCalendar(list, bonuses, '2026-03', today);
  assert(cal.days.length === 31, 'Março tem 31 dias na grade');
  const day20 = cal.days.find(d => d.date === today);
  assert(day20.outcome === DAY_OUTCOME.victory, '20/03 é vitória com as 2 restantes feitas');
  const day19 = cal.days.find(d => d.date === yesterday);
  assert(day19.outcome === DAY_OUTCOME.unplanned, 'Dia sem cadastro fica sem planejamento');

  const mixed = list.map((item, idx) => (idx === 0 ? { ...item, completed: false } : item));
  const mixedCal = buildMonthCalendar(mixed, {}, '2026-03', today);
  assert(mixedCal.days.find(d => d.date === today).outcome === DAY_OUTCOME.partial, 'Parcial quando 1 de 2 está feita');

  let overflowList = [];
  overflowList = createDailyVictory(overflowList, { title: 'Finalizar petição', category: 'Trabalho', date: today }, { today }).list;
  overflowList = createDailyVictory(overflowList, { title: 'Treinar 40 min', category: 'Saúde', date: today }, { today }).list;
  overflowList = createDailyVictory(overflowList, { title: 'Ler 20 páginas', category: 'Estudos', date: today }, { today }).list;

  const studyOverflow = createDailyVictory(overflowList, {
    title: 'Estudar no mínimo 10 minutos.',
    category: 'Estudos',
    date: today,
    source: DAILY_VICTORY_OVERFLOW_SOURCES.study
  }, { today });
  overflowList = studyOverflow.list;
  assert(overflowList.filter(v => v.date === today).length === 4, 'Estudo pela homeostase passa de 3');
  assert(studyOverflow.victory.source === DAILY_VICTORY_OVERFLOW_SOURCES.study, 'Marca origem de estudo');

  const readingOverflow = createDailyVictory(overflowList, {
    title: 'Ler no mínimo 5 minutos.',
    category: 'Estudos',
    date: today,
    source: DAILY_VICTORY_OVERFLOW_SOURCES.reading
  }, { today });
  overflowList = readingOverflow.list;
  assert(overflowList.filter(v => v.date === today).length === 5, 'Leitura pela homeostase completa o teto de 5');

  let overflowBlocked = false;
  try {
    createDailyVictory(overflowList, {
      title: 'Estudar no mínimo 12 minutos.',
      date: today,
      source: DAILY_VICTORY_OVERFLOW_SOURCES.study
    }, { today });
  } catch (err) {
    overflowBlocked = /5 vitórias/.test(err.message);
  }
  assert(overflowBlocked, 'Bloqueia a 6ª vitória mesmo via homeostase');

  let manualStillBlocked = false;
  try {
    createDailyVictory(overflowList, { title: 'Quinta vitória manual', date: today }, { today });
  } catch {
    manualStillBlocked = true;
  }
  assert(manualStillBlocked, 'Cadastro manual continua bloqueado além de 3');

  let questList = [];
  const fromQuest = createDailyVictory(questList, {
    title: 'Redigir parecer',
    category: 'Trabalho',
    date: today,
    questId: 'q-parecer-1'
  }, { today });
  questList = fromQuest.list;
  assert(fromQuest.victory.questId === 'q-parecer-1', 'Persiste o vínculo com a missão');
  assert(isQuestPlannedForDate(questList, 'q-parecer-1', today), 'Detecta missão já planejada para o dia');
  assert(canPlanQuestAsDailyVictory(questList, 'q-parecer-1', today).alreadyPlanned, 'Bloqueia duplicar a mesma missão');
  assert(canPlanQuestAsDailyVictory(questList, 'q-outra', today).canPlan, 'Outra missão ainda pode ser planejada');

  let duplicateQuestBlocked = false;
  try {
    createDailyVictory(questList, { title: 'Redigir parecer de novo', date: today, questId: 'q-parecer-1' }, { today });
  } catch (err) {
    duplicateQuestBlocked = /já está nas vitórias/.test(err.message);
  }
  assert(duplicateQuestBlocked, 'Recusa a mesma missão duas vezes no mesmo dia');

  questList = createDailyVictory(questList, { title: 'Vitória 2', date: today }, { today }).list;
  questList = createDailyVictory(questList, { title: 'Vitória 3', date: today }, { today }).list;
  const atCap = canPlanQuestAsDailyVictory(questList, 'q-nova', today);
  assert(atCap.atLimit && !atCap.canPlan, 'Com 3 vitórias, o botão da missão deve ficar desabilitado');

  const questSync = planLinkedDailyVictoryUpdates(fromQuest.list, {
    today,
    questId: 'q-parecer-1',
    questCompleted: true
  });
  assert(questSync.length === 1 && questSync[0].completed === true, 'Concluir a missão gera update da vitória vinculada');
  const questReopen = planLinkedDailyVictoryUpdates(
    [{ ...fromQuest.victory, completed: true }],
    { today, questId: 'q-parecer-1', questCompleted: false }
  );
  assert(questReopen.length === 1 && questReopen[0].completed === false, 'Reabrir a missão reabre a vitória vinculada');
  assert(
    planLinkedDailyVictoryUpdates(fromQuest.list, { today, questId: 'q-outra', questCompleted: true }).length === 0,
    'Missão sem vínculo não altera vitórias'
  );

  assert(parseHomeostasisVictoryTargetMinutes('Ler no mínimo 12 minutos.') === 12, 'Extrai meta de minutos da vitória de leitura');
  assert(isHomeostasisVictoryFulfilled({ title: 'Estudar no mínimo 10 minutos.' }, 10) === true, 'Homeostase cumprida no mínimo');
  assert(isHomeostasisVictoryFulfilled({ title: 'Estudar no mínimo 10 minutos.' }, 9) === false, 'Homeostase pendente abaixo da meta');

  const readingVictory = {
    id: 'dv-read',
    date: today,
    title: 'Ler no mínimo 5 minutos.',
    category: 'Estudos',
    source: DAILY_VICTORY_OVERFLOW_SOURCES.reading,
    completed: false
  };
  const studyVictory = {
    id: 'dv-study',
    date: today,
    title: 'Estudar no mínimo 10 minutos.',
    category: 'Estudos',
    source: DAILY_VICTORY_OVERFLOW_SOURCES.study,
    completed: false
  };
  const readingDone = planLinkedDailyVictoryUpdates([readingVictory, studyVictory], { today, readingMinutes: 6 });
  assert(readingDone.length === 1 && readingDone[0].id === 'dv-read' && readingDone[0].completed, 'Leitura cumprida conclui só a vitória de leitura');
  const studyDone = planLinkedDailyVictoryUpdates([readingVictory, studyVictory], { today, studyMinutes: 10 });
  assert(studyDone.length === 1 && studyDone[0].id === 'dv-study' && studyDone[0].completed, 'Estudo cumprido conclui só a vitória de estudo');
  const readingShort = planLinkedDailyVictoryUpdates(
    [{ ...readingVictory, completed: true }],
    { today, readingMinutes: 2 }
  );
  assert(readingShort.length === 0, 'Leitura abaixo da meta não reabre vitória já concluída');

  const overflowSummary = summarizeDay(overflowList, today);
  assert(overflowSummary.plannedCount === 5 && overflowSummary.displayCap === 5, 'Resumo mostra o teto estendido');
  assert(overflowSummary.canAdd === false && overflowSummary.canAddOverflow === false, 'Sem vagas manuais nem de overflow');
  assert(overflowSummary.tripleComplete === false, 'Tríade ainda exige 3 concluídas');

  let overflowBonuses = {};
  const o1 = completeDailyVictory(overflowList, overflowBonuses, overflowList[0].id, { today });
  overflowList = o1.list;
  overflowBonuses = o1.bonuses;
  const o2 = completeDailyVictory(overflowList, overflowBonuses, overflowList[1].id, { today });
  overflowList = o2.list;
  overflowBonuses = o2.bonuses;
  const o3 = completeDailyVictory(overflowList, overflowBonuses, overflowList[2].id, { today });
  overflowList = o3.list;
  overflowBonuses = o3.bonuses;
  assert(o3.bonusAwardedNow === true, 'Tríade dispara ao concluir 3 mesmo com 5 planejadas');
  assert(summarizeDay(overflowList, today, overflowBonuses).allComplete === false, 'Dia com overflow só fecha com as 5');

  const moved = updateDailyVictory(overflowList, studyOverflow.victory.id, { date: tomorrow }, { today });
  overflowList = moved.list;
  assert(overflowList.filter(v => v.date === today).length === 4, 'Mover overflow para amanhã libera uma vaga hoje');
  assert(overflowList.filter(v => v.date === tomorrow).length === 1, 'Overflow de estudo pode ir para amanhã');

  console.log('\n🎉 Todos os testes de Vitórias Planejadas passaram!');
}

runTests();
