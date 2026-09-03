/**
 * Duração cronometrada de missões, rituais, questões e leitura.
 * Minutos inteiros; 0 = não cronometrado.
 */

export function parseDurationMinutes(value) {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function secondsToDurationMinutes(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s <= 0) return 0;
  return Math.max(1, Math.round(s / 60));
}

export function formatDurationLabel(minutes) {
  const m = parseDurationMinutes(minutes);
  if (m <= 0) return '';
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours}h ${rest} min` : `${hours}h`;
}

export function sumDurationMap(map) {
  if (!map || typeof map !== 'object') return 0;
  return Object.values(map).reduce((acc, value) => acc + parseDurationMinutes(value), 0);
}

export function getHabitDurationForDate(habit, dateStr) {
  if (!habit || !dateStr) return 0;
  return parseDurationMinutes(habit.durationsByDate?.[dateStr]);
}

export function setHabitDurationForDate(habit, dateStr, minutes) {
  if (!habit || !dateStr) return habit;
  const duration = parseDurationMinutes(minutes);
  if (!habit.durationsByDate) habit.durationsByDate = {};
  if (duration > 0) {
    habit.durationsByDate[dateStr] = duration;
  } else {
    delete habit.durationsByDate[dateStr];
  }
  if (Object.keys(habit.durationsByDate).length === 0) {
    delete habit.durationsByDate;
  }
  return habit;
}

export function clearHabitDurationForDate(habit, dateStr) {
  return setHabitDurationForDate(habit, dateStr, 0);
}
