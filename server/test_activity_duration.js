import './testEnv.js';
import assert from 'assert';
import { defaultDatabase, getDb, saveDb } from './db.js';
import { completeQuest, toggleHabit, updateQuestDuration, updateHabitDuration } from './domain/activities.js';
import {
  parseDurationMinutes,
  secondsToDurationMinutes,
  formatDurationLabel,
  formatStudyDuration,
  sumDurationMap,
  getHabitDurationForDate,
  setHabitDurationForDate,
  clearHabitDurationForDate,
  mergeLiveActivityTimers,
  clearLiveActivityTimer,
  liveTimersEqual,
  LIVE_TIMER_MAX_AGE_MS
} from '../src/utils/activityDuration.js';

function run() {
  console.log('🧪 Testando duração cronometrada de missões e rituais...\n');

  assert.strictEqual(parseDurationMinutes(undefined), 0);
  assert.strictEqual(parseDurationMinutes(''), 0);
  assert.strictEqual(parseDurationMinutes(-5), 0);
  assert.strictEqual(parseDurationMinutes('40'), 40);
  assert.strictEqual(parseDurationMinutes(12.4), 12);
  console.log('✅ parseDurationMinutes ignora vazio/negativo e arredonda minutos válidos.');

  assert.strictEqual(secondsToDurationMinutes(0), 0);
  assert.strictEqual(secondsToDurationMinutes(20), 1);
  assert.strictEqual(secondsToDurationMinutes(90), 2);
  assert.strictEqual(secondsToDurationMinutes(3599), 60);
  console.log('✅ secondsToDurationMinutes arredonda para no mínimo 1 min quando o cronômetro rodou.');

  assert.strictEqual(formatDurationLabel(0), '');
  assert.strictEqual(formatDurationLabel(18), '18 min');
  assert.strictEqual(formatDurationLabel(60), '1h');
  assert.strictEqual(formatDurationLabel(75), '1h 15 min');
  assert.strictEqual(formatStudyDuration(0), '0 min');
  assert.strictEqual(formatStudyDuration(75), '1h 15 min');
  console.log('✅ formatDurationLabel formata minutos e horas.');

  const habit = { history: [] };
  setHabitDurationForDate(habit, '2026-09-03', 25);
  assert.strictEqual(getHabitDurationForDate(habit, '2026-09-03'), 25);
  assert.strictEqual(sumDurationMap(habit.durationsByDate), 25);

  setHabitDurationForDate(habit, '2026-09-02', 40);
  assert.strictEqual(sumDurationMap(habit.durationsByDate), 65);

  clearHabitDurationForDate(habit, '2026-09-03');
  assert.strictEqual(getHabitDurationForDate(habit, '2026-09-03'), 0);
  assert.strictEqual(sumDurationMap(habit.durationsByDate), 40);

  clearHabitDurationForDate(habit, '2026-09-02');
  assert.strictEqual(habit.durationsByDate, undefined);
  console.log('✅ durationsByDate grava, soma e limpa o tempo de cada execução do ritual.');

  const now = 1_700_000_000_000;
  const local = {
    'quest:q1': { accumulatedMs: 120000, runStartedAt: now - 5000, updatedAt: now }
  };
  const remote = {
    'quest:q1': { accumulatedMs: 60000, runStartedAt: null, updatedAt: now - 10000 },
    'habit:h1': { accumulatedMs: 30000, runStartedAt: null, updatedAt: now - 1000 }
  };
  const merged = mergeLiveActivityTimers(local, remote, now);
  assert.strictEqual(merged['quest:q1'].accumulatedMs, 120000);
  assert.strictEqual(merged['quest:q1'].runStartedAt, now - 5000);
  assert.strictEqual(merged['habit:h1'].accumulatedMs, 30000);
  console.log('✅ mergeLiveActivityTimers preserva o snapshot mais recente e une dispositivos.');

  const store = { 'quest:q1': { accumulatedMs: 120000, runStartedAt: now - 5000, updatedAt: now } };
  clearLiveActivityTimer(store, 'quest', 'q1', now + 1);
  const afterClear = mergeLiveActivityTimers(store, { 'quest:q1': local['quest:q1'] }, now + 1);
  assert.strictEqual(afterClear['quest:q1'].cleared, true);
  assert.strictEqual(afterClear['quest:q1'].runStartedAt, null);
  console.log('✅ Tombstone de zerar/concluir vence o cronômetro antigo de outro dispositivo.');

  const stale = mergeLiveActivityTimers({
    'quest:old': { accumulatedMs: 1000, runStartedAt: null, updatedAt: now - LIVE_TIMER_MAX_AGE_MS - 1 }
  }, {}, now);
  assert.strictEqual(stale['quest:old'], undefined);
  console.log('✅ Cronômetros com mais de 24h são descartados.');

  const twoRunning = mergeLiveActivityTimers({
    'quest:q1': { accumulatedMs: 1000, runStartedAt: now - 4000, updatedAt: now }
  }, {
    'habit:h1': { accumulatedMs: 2000, runStartedAt: now - 9000, updatedAt: now - 100 }
  }, now);
  assert.ok(twoRunning['quest:q1'].runStartedAt != null, 'o cronômetro mais recente continua rodando');
  assert.strictEqual(twoRunning['habit:h1'].runStartedAt, null);
  console.log('✅ Apenas um cronômetro permanece em execução após o merge entre dispositivos.');

  const sameA = { 'quest:q1': { accumulatedMs: 1000, runStartedAt: null, updatedAt: now } };
  const sameB = { 'quest:q1': { accumulatedMs: 1000, runStartedAt: null, updatedAt: now } };
  assert.strictEqual(liveTimersEqual(sameA, sameB, now), true);
  assert.strictEqual(liveTimersEqual(sameA, { ...sameB, 'habit:h1': { accumulatedMs: 1, runStartedAt: null, updatedAt: now } }, now), false);
  console.log('✅ liveTimersEqual detecta snapshots idênticos e evita PUT sem mudança.');

  const db = defaultDatabase();
  db.quests = [{
    id: 'q-dur',
    title: 'Revisar peça',
    completed: false,
    xpReward: 40,
    coinReward: 8,
    difficulty: 'baixa'
  }];
  db.habits = [{
    id: 'h-dur',
    title: 'Alongar',
    history: [],
    rewardLogs: {},
    xpReward: 20,
    coinReward: 4
  }];
  saveDb(db);

  const pending = updateQuestDuration(getDb(), 'q-dur', 30);
  assert.ok(pending.error, 'missão pendente não aceita edição de duração');

  const done = completeQuest(getDb(), { id: 'q-dur', completed: true, durationMinutes: 25 });
  assert.strictEqual(done.quest.durationMinutes, 25);
  const xpAfterComplete = getDb().userProfile.xp;
  const coinsAfterComplete = getDb().userProfile.coins;
  const logId = getDb().quests.find((quest) => quest.id === 'q-dur').rewardLogId;

  const edited = updateQuestDuration(getDb(), 'q-dur', 90);
  assert.strictEqual(edited.durationMinutes, 90);
  assert.strictEqual(getDb().quests.find((quest) => quest.id === 'q-dur').durationMinutes, 90);
  assert.strictEqual(getDb().quests.find((quest) => quest.id === 'q-dur').completed, true);
  assert.strictEqual(getDb().userProfile.xp, xpAfterComplete);
  assert.strictEqual(getDb().userProfile.coins, coinsAfterComplete);
  assert.strictEqual(getDb().actionLogs.find((log) => log.id === logId).details.durationMinutes, 90);

  const cleared = updateQuestDuration(getDb(), 'q-dur', 0);
  assert.strictEqual(cleared.quest.durationMinutes, null);
  assert.strictEqual(getDb().actionLogs.find((log) => log.id === logId).details.durationMinutes, undefined);
  assert.strictEqual(getDb().userProfile.xp, xpAfterComplete);
  console.log('✅ updateQuestDuration corrige o tempo da missão concluída sem mexer em XP ou moedas.');

  const unmarked = updateHabitDuration(getDb(), 'h-dur', { date: '2026-09-03', durationMinutes: 15 });
  assert.ok(unmarked.error, 'dia não marcado não aceita duração');

  const marked = toggleHabit(getDb(), { id: 'h-dur', date: '2026-09-03', durationMinutes: 12 });
  assert.strictEqual(marked.done, true);
  const habitXp = getDb().userProfile.xp;
  const habitLogId = getDb().habits.find((habit) => habit.id === 'h-dur').rewardLogs['2026-09-03'];

  const habitEdited = updateHabitDuration(getDb(), 'h-dur', { date: '2026-09-03', durationMinutes: 48 });
  assert.strictEqual(habitEdited.durationMinutes, 48);
  assert.strictEqual(getDb().habits.find((habit) => habit.id === 'h-dur').durationsByDate['2026-09-03'], 48);
  assert.ok(getDb().habits.find((habit) => habit.id === 'h-dur').history.includes('2026-09-03'));
  assert.strictEqual(getDb().userProfile.xp, habitXp);
  assert.strictEqual(getDb().actionLogs.find((log) => log.id === habitLogId).details.durationMinutes, 48);

  const habitCleared = updateHabitDuration(getDb(), 'h-dur', { date: '2026-09-03', durationMinutes: 0 });
  assert.strictEqual(getDb().habits.find((habit) => habit.id === 'h-dur').durationsByDate, undefined);
  assert.strictEqual(getDb().actionLogs.find((log) => log.id === habitLogId).details.durationMinutes, undefined);
  assert.ok(getDb().habits.find((habit) => habit.id === 'h-dur').history.includes('2026-09-03'));
  console.log('✅ updateHabitDuration corrige o tempo de um dia marcado sem desmarcar o ritual.');

  const tooLong = updateQuestDuration(getDb(), 'q-dur', 481);
  assert.ok(tooLong.error, 'duração acima de 8h é rejeitada');
  console.log('✅ Duração editada continua limitada a 480 minutos.');

  console.log('\n🎉 TODOS OS TESTES DE DURAÇÃO PASSARAM!');
}

run();
