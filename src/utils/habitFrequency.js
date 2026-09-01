/**
 * Frequências de rituais (hábitos) — compartilhado entre UI, API, MCP e Oráculo.
 *
 * Além das frequências semanais, suporta:
 * - fortnightly: 1x por quinzena, com dois dias do mês em que o ritual passa a ficar pendente
 * - monthly: 1x por mês, com o dia do mês em que o ritual passa a ficar pendente
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAO_PAULO_TZ = 'America/Sao_Paulo';

export const HABIT_FREQUENCIES = [
  'daily',
  'weekdays',
  'weekly',
  'times_per_week',
  'fortnightly',
  'monthly'
];

const FREQUENCY_ALIASES = {
  n_times_week: 'times_per_week',
  times_per_fortnight: 'fortnightly',
  biweekly: 'fortnightly',
  quinzenal: 'fortnightly',
  once_per_month: 'monthly',
  mensal: 'monthly'
};

export function canonicalizeHabitFrequency(frequency) {
  const raw = (frequency || 'daily').toString().trim();
  return FREQUENCY_ALIASES[raw] || raw;
}

export function isPeriodFrequency(frequency) {
  const freq = canonicalizeHabitFrequency(frequency);
  return freq === 'fortnightly' || freq === 'monthly';
}

export function normalizeMonthDay(value, fallback = 1) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(31, n));
}

export function normalizeFortnightDays(days, fallback = [1, 16]) {
  const fallbackA = normalizeMonthDay(fallback[0], 1);
  const fallbackB = normalizeMonthDay(fallback[1], 16);
  let a;
  let b;

  if (Array.isArray(days) && days.length >= 2) {
    a = normalizeMonthDay(days[0], fallbackA);
    b = normalizeMonthDay(days[1], fallbackB);
  } else if (Array.isArray(days) && days.length === 1) {
    a = normalizeMonthDay(days[0], fallbackA);
    b = fallbackB;
  } else if (days != null && !Array.isArray(days)) {
    a = normalizeMonthDay(days, fallbackA);
    b = fallbackB;
  } else {
    a = fallbackA;
    b = fallbackB;
  }

  if (a === b) {
    b = a >= 16 ? Math.max(1, a - 15) : Math.min(31, a + 15);
  }

  return [a, b].sort((x, y) => x - y);
}

export function padMonthDay(day) {
  return String(normalizeMonthDay(day, 1)).padStart(2, '0');
}

export function getFrequencyLabel(habit) {
  const freq = canonicalizeHabitFrequency(habit?.frequency || 'daily');
  if (freq === 'times_per_week') {
    const n = habit?.targetTimesPerWeek || habit?.timesPerWeek || 3;
    return `${n}x/sem`;
  }
  if (freq === 'fortnightly') {
    const days = normalizeFortnightDays(habit?.monthDays, [1, 16]).map(padMonthDay);
    return `Quinzena (${days.join(' e ')})`;
  }
  if (freq === 'monthly') {
    const day = padMonthDay(
      (Array.isArray(habit?.monthDays) && habit.monthDays[0])
      || habit?.monthDay
      || 1
    );
    return `Mensal (dia ${day})`;
  }
  if (freq === 'weekdays') return 'Seg-Sex';
  if (freq === 'weekly') return 'Semanal';
  return 'Diário';
}

function toDateStr(date = new Date()) {
  if (typeof date === 'string' && DATE_ONLY_RE.test(date)) return date;
  try {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    if (isNaN(d.getTime())) return toDateStr(new Date());
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: SAO_PAULO_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch {
    const fallback = new Date();
    const y = fallback.getFullYear();
    const m = String(fallback.getMonth() + 1).padStart(2, '0');
    const day = String(fallback.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

function parseDateStr(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

function formatYmd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
}

export function clampDayOfMonth(year, month, day) {
  return Math.min(normalizeMonthDay(day, 1), daysInMonth(year, month));
}

function shiftMonth(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1, 12, 0, 0));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function addDaysToDateStr(dateStr, daysOffset) {
  const { year, month, day } = parseDateStr(dateStr);
  const target = new Date(Date.UTC(year, month - 1, day + daysOffset, 12, 0, 0));
  return formatYmd(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
}

export function getHabitScheduleDays(habit) {
  const freq = canonicalizeHabitFrequency(habit?.frequency || 'daily');
  if (freq === 'fortnightly') {
    return normalizeFortnightDays(habit?.monthDays, [1, 16]);
  }
  if (freq === 'monthly') {
    const raw = Array.isArray(habit?.monthDays) ? habit.monthDays[0] : (habit?.monthDays ?? habit?.monthDay);
    return [normalizeMonthDay(raw, 1)];
  }
  return null;
}

function collectPeriodStarts(year, month, scheduleDays) {
  const starts = [];
  for (const delta of [-1, 0, 1]) {
    const shifted = shiftMonth(year, month, delta);
    const uniqueDays = [...new Set(
      scheduleDays.map(day => clampDayOfMonth(shifted.year, shifted.month, day))
    )].sort((a, b) => a - b);
    uniqueDays.forEach(day => {
      starts.push(formatYmd(shifted.year, shifted.month, day));
    });
  }
  return [...new Set(starts)].sort();
}

/**
 * Ciclo atual de um ritual quinzenal/mensal.
 * O ritual fica pendente a partir do dia informado até ser concluído (ou até o próximo ciclo).
 *
 * @returns {{ frequency: string, start: string, nextStart: string, end: string, monthDays: number[], completed: boolean, completedOn: string|null, due: boolean } | null}
 */
export function getHabitPeriodStatus(habit, date = new Date()) {
  const freq = canonicalizeHabitFrequency(habit?.frequency || 'daily');
  if (!isPeriodFrequency(freq)) return null;

  const dateStr = toDateStr(date);
  const { year, month } = parseDateStr(dateStr);
  const monthDays = getHabitScheduleDays(habit) || (freq === 'fortnightly' ? [1, 16] : [1]);
  const starts = collectPeriodStarts(year, month, monthDays);

  let start = starts.filter(s => s <= dateStr).pop();
  if (!start) start = starts[0];
  const startIndex = starts.indexOf(start);
  const nextStart = starts[startIndex + 1] || addDaysToDateStr(start, freq === 'monthly' ? 31 : 15);
  const end = addDaysToDateStr(nextStart, -1);
  const history = Array.isArray(habit?.history) ? habit.history : [];
  const completedOn = history
    .filter(d => typeof d === 'string' && d >= start && d < nextStart)
    .sort()[0] || null;
  const createdDate = typeof habit?.createdAt === 'string' ? habit.createdAt.slice(0, 10) : '';
  const cycleStartedAfterCreation = !DATE_ONLY_RE.test(createdDate) || start >= createdDate;

  return {
    frequency: freq,
    start,
    nextStart,
    end,
    monthDays,
    completed: Boolean(completedOn),
    completedOn,
    due: !completedOn && cycleStartedAfterCreation
  };
}

function pickTargetTimesPerWeek(freq, input, existing) {
  if (freq === 'times_per_week') {
    const raw = input.targetTimesPerWeek ?? input.timesPerWeek ?? existing.targetTimesPerWeek ?? existing.timesPerWeek;
    return Math.max(1, Math.min(7, parseInt(raw, 10) || 3));
  }
  if (freq === 'weekdays') return 5;
  if (freq === 'weekly' || freq === 'fortnightly' || freq === 'monthly') return 1;
  return 7;
}

/**
 * Normaliza frequência + dias do mês a partir do payload (create/update) e do hábito existente.
 */
export function resolveFrequencyConfig(input = {}, existing = {}) {
  const frequencyProvided = input.frequency != null && String(input.frequency).trim() !== '';
  let freq = canonicalizeHabitFrequency(
    frequencyProvided ? input.frequency : (existing.frequency || 'daily')
  );

  if (!HABIT_FREQUENCIES.includes(freq)) {
    freq = 'daily';
  }

  const config = {
    frequency: freq,
    targetTimesPerWeek: pickTargetTimesPerWeek(freq, input, existing),
    monthDays: null
  };

  if (freq === 'fortnightly') {
    const rawDays = input.monthDays !== undefined
      ? input.monthDays
      : (input.monthDay !== undefined ? [input.monthDay, existing.monthDays?.[1] ?? 16] : existing.monthDays);
    config.monthDays = normalizeFortnightDays(rawDays, existing.monthDays || [1, 16]);
  } else if (freq === 'monthly') {
    const rawDay = input.monthDay !== undefined
      ? input.monthDay
      : (Array.isArray(input.monthDays) ? input.monthDays[0] : (input.monthDays !== undefined ? input.monthDays : (
        Array.isArray(existing.monthDays) ? existing.monthDays[0] : (existing.monthDays ?? existing.monthDay)
      )));
    config.monthDays = [normalizeMonthDay(rawDay, 1)];
  }

  return config;
}

export function applyHabitFrequency(habit, payload = {}, { isUpdate = false } = {}) {
  const hasFrequencyPayload = payload.frequency !== undefined
    || payload.targetTimesPerWeek !== undefined
    || payload.timesPerWeek !== undefined
    || payload.monthDays !== undefined
    || payload.monthDay !== undefined;

  if (isUpdate && !hasFrequencyPayload) return habit;

  const config = resolveFrequencyConfig(payload, isUpdate ? habit : {});
  habit.frequency = config.frequency;
  habit.targetTimesPerWeek = config.targetTimesPerWeek;
  if (config.monthDays) {
    habit.monthDays = config.monthDays;
  } else if (habit.monthDays !== undefined) {
    delete habit.monthDays;
  }
  return habit;
}
