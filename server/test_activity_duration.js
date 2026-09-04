import assert from 'assert';
import {
  parseDurationMinutes,
  secondsToDurationMinutes,
  formatDurationLabel,
  sumDurationMap,
  getHabitDurationForDate,
  setHabitDurationForDate,
  clearHabitDurationForDate,
  mergeLiveActivityTimers,
  clearLiveActivityTimer,
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

  console.log('\n🎉 TODOS OS TESTES DE DURAÇÃO PASSARAM!');
}

run();
