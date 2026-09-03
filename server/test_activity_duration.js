import assert from 'assert';
import {
  parseDurationMinutes,
  secondsToDurationMinutes,
  formatDurationLabel,
  sumDurationMap,
  getHabitDurationForDate,
  setHabitDurationForDate,
  clearHabitDurationForDate
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

  console.log('\n🎉 TODOS OS TESTES DE DURAÇÃO PASSARAM!');
}

run();
