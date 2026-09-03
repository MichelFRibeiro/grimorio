/**
 * Frequências de rituais (hábitos) — compartilhado entre UI, API, MCP e Oráculo.
 *
 * times_per_week e weekly aceitam weekDays opcionais (0=Dom … 6=Sáb).
 * Sem weekDays o ritual continua flexível; com weekDays ele só fica devido
 * nos dias previstos, ou em catch-up se a cota da semana já não cabe no restante.
 *
 * Além das frequências de período, suporta:
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

/** 0=Domingo … 6=Sábado, na ordem de exibição Seg→Dom. */
export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' }
];

const WEEKDAY_INDEX_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_SORT_ORDER = WEEKDAY_OPTIONS.map(d => d.value);

function supportsWeekDays(frequency) {
  const freq = canonicalizeHabitFrequency(frequency);
  return freq === 'times_per_week' || freq === 'weekly';
}

/**
 * Normaliza dias da semana (0=Dom … 6=Sáb), únicos, ordenados Seg→Dom.
 * Array vazio / inválido → null (rituais flexíveis, qualquer dia até a meta).
 */
export function normalizeWeekDays(days, { max = 7 } = {}) {
  const limit = Math.max(1, Math.min(7, parseInt(max, 10) || 7));
  if (days == null) return null;

  const raw = Array.isArray(days) ? days : [days];
  const unique = [...new Set(
    raw
      .map(value => parseInt(value, 10))
      .filter(value => Number.isInteger(value) && value >= 0 && value <= 6)
  )];

  if (unique.length === 0) return null;

  unique.sort((a, b) => WEEKDAY_SORT_ORDER.indexOf(a) - WEEKDAY_SORT_ORDER.indexOf(b));
  return unique.slice(0, limit);
}

export function formatWeekDaysLabel(weekDays) {
  const days = normalizeWeekDays(weekDays);
  if (!days) return '';
  return days.map(day => WEEKDAY_INDEX_LABELS[day]).join(', ');
}

export function getHabitWeekDays(habit) {
  const freq = canonicalizeHabitFrequency(habit?.frequency || 'daily');
  if (freq === 'weekdays') return [1, 2, 3, 4, 5];
  if (!supportsWeekDays(freq)) return null;
  return normalizeWeekDays(habit?.weekDays, { max: freq === 'weekly' ? 1 : 7 });
}

export function getFrequencyLabel(habit) {
  const freq = canonicalizeHabitFrequency(habit?.frequency || 'daily');
  const weekDaysLabel = formatWeekDaysLabel(habit?.weekDays);
  if (freq === 'times_per_week') {
    const n = habit?.targetTimesPerWeek || habit?.timesPerWeek || 3;
    return weekDaysLabel ? `${n}x/sem (${weekDaysLabel})` : `${n}x/sem`;
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
  if (freq === 'weekly') return weekDaysLabel ? `Semanal (${weekDaysLabel})` : 'Semanal';
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

function pickTargetTimesPerWeek(freq, input, existing, weekDays) {
  if (freq === 'times_per_week') {
    if (weekDays?.length) return weekDays.length;
    const raw = input.targetTimesPerWeek ?? input.timesPerWeek ?? existing.targetTimesPerWeek ?? existing.timesPerWeek;
    return Math.max(1, Math.min(7, parseInt(raw, 10) || 3));
  }
  if (freq === 'weekdays') return 5;
  if (freq === 'weekly' || freq === 'fortnightly' || freq === 'monthly') return 1;
  return 7;
}

function pickWeekDays(freq, input, existing) {
  if (!supportsWeekDays(freq)) return null;

  const max = freq === 'weekly' ? 1 : 7;
  if (input.weekDays !== undefined) {
    return normalizeWeekDays(input.weekDays, { max });
  }

  if (input.frequency != null && String(input.frequency).trim() !== '') {
    const existingFreq = canonicalizeHabitFrequency(existing.frequency || 'daily');
    if (existingFreq === freq) {
      return normalizeWeekDays(existing.weekDays, { max });
    }
    return null;
  }

  return normalizeWeekDays(existing.weekDays, { max });
}

/**
 * Normaliza frequência + dias do mês / da semana a partir do payload (create/update) e do hábito existente.
 */
export function resolveFrequencyConfig(input = {}, existing = {}) {
  const frequencyProvided = input.frequency != null && String(input.frequency).trim() !== '';
  let freq = canonicalizeHabitFrequency(
    frequencyProvided ? input.frequency : (existing.frequency || 'daily')
  );

  if (!HABIT_FREQUENCIES.includes(freq)) {
    freq = 'daily';
  }

  const weekDays = pickWeekDays(freq, input, existing);
  const config = {
    frequency: freq,
    weekDays,
    targetTimesPerWeek: pickTargetTimesPerWeek(freq, input, existing, weekDays),
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
    || payload.monthDay !== undefined
    || payload.weekDays !== undefined;

  if (isUpdate && !hasFrequencyPayload) return habit;

  const config = resolveFrequencyConfig(payload, isUpdate ? habit : {});
  habit.frequency = config.frequency;
  habit.targetTimesPerWeek = config.targetTimesPerWeek;
  if (config.monthDays) {
    habit.monthDays = config.monthDays;
  } else if (habit.monthDays !== undefined) {
    delete habit.monthDays;
  }
  if (config.weekDays) {
    habit.weekDays = config.weekDays;
  } else if (habit.weekDays !== undefined) {
    delete habit.weekDays;
  }
  return habit;
}

/**
 * Status unificado de "está devido hoje?" para Oráculo e lista de rituais.
 *
 * @param {object} habit
 * @param {object} [weeklyStats]
 * @param {Date|string|number} [date=new Date()]
 * @param {string} [todayStr]
 * @returns {{ due: boolean, extra: boolean, completedToday: boolean, scheduledToday: boolean, overdue: boolean, remainingNeeded: number, remainingScheduledDays: number }}
 */
export function getHabitDueStatus(habit, weeklyStats = null, date = new Date(), todayStr = null) {
  const freq = canonicalizeHabitFrequency(habit?.frequency || 'daily');
  const dateStr = todayStr || toDateStr(date);
  const history = Array.isArray(habit?.history) ? habit.history : [];
  const completedToday = history.includes(dateStr);
  const { year, month, day } = parseDateStr(dateStr);
  const weekdayDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = weekdayDate.getUTCDay();

  const empty = {
    due: false,
    extra: false,
    completedToday,
    scheduledToday: false,
    overdue: false,
    remainingNeeded: 0,
    remainingScheduledDays: 0
  };

  if (freq === 'daily') {
    return { ...empty, due: !completedToday, scheduledToday: true, remainingNeeded: completedToday ? 0 : 1, remainingScheduledDays: 1 };
  }

  if (freq === 'weekdays') {
    const scheduledToday = dayOfWeek >= 1 && dayOfWeek <= 5;
    return {
      ...empty,
      due: scheduledToday && !completedToday,
      scheduledToday,
      remainingNeeded: scheduledToday && !completedToday ? 1 : 0,
      remainingScheduledDays: scheduledToday ? 1 : 0
    };
  }

  if (isPeriodFrequency(freq)) {
    const period = weeklyStats?.period || getHabitPeriodStatus(habit, dateStr);
    if (completedToday) return empty;
    if (period?.completed) return empty;
    return { ...empty, due: !!period?.due };
  }

  const weekDays = getHabitWeekDays(habit);
  const target = weekDays?.length
    ?? weeklyStats?.targetTimesPerWeek
    ?? habit?.targetTimesPerWeek
    ?? habit?.timesPerWeek
    ?? (freq === 'weekly' ? 1 : 3);
  const completionsThisWeek = weeklyStats?.completionsThisWeek ?? countCompletionsInWeek(history, dateStr);
  const remainingNeeded = Math.max(0, target - completionsThisWeek);
  const scheduledToday = Array.isArray(weekDays) ? weekDays.includes(dayOfWeek) : true;

  if (completedToday) {
    return { ...empty, extra: false, remainingNeeded: 0, remainingScheduledDays: 0, scheduledToday };
  }
  if (weeklyStats?.isGoalMet || remainingNeeded <= 0) {
    return { ...empty, extra: scheduledToday, scheduledToday };
  }

  if (!weekDays) {
    return {
      ...empty,
      due: true,
      scheduledToday: true,
      remainingNeeded,
      remainingScheduledDays: remainingCalendarDaysInWeek(dateStr)
    };
  }

  const schedule = inspectWeekSchedule(weekDays, dateStr);
  const overdue = !scheduledToday && remainingNeeded > schedule.remainingScheduledDays;
  const due = scheduledToday || overdue;
  const remainingScheduledDays = overdue
    ? remainingCalendarDaysInWeek(dateStr)
    : schedule.remainingScheduledDays;

  return {
    ...empty,
    due,
    scheduledToday,
    overdue,
    remainingNeeded,
    remainingScheduledDays
  };
}

function dayOfWeekFromDateStr(dateStr) {
  const { year, month, day } = parseDateStr(dateStr);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

function mondayOfWeek(dateStr) {
  const dayOfWeek = dayOfWeekFromDateStr(dateStr);
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  return addDaysToDateStr(dateStr, diffToMonday);
}

function remainingCalendarDaysInWeek(dateStr) {
  const dayOfWeek = dayOfWeekFromDateStr(dateStr);
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  return daysUntilSunday + 1;
}

function countCompletionsInWeek(history, dateStr) {
  const monday = mondayOfWeek(dateStr);
  const sunday = addDaysToDateStr(monday, 6);
  return history.filter(d => typeof d === 'string' && d >= monday && d <= sunday).length;
}

function inspectWeekSchedule(weekDays, dateStr) {
  const monday = mondayOfWeek(dateStr);
  let remainingScheduledDays = 0;

  for (let i = 0; i < 7; i += 1) {
    const candidate = addDaysToDateStr(monday, i);
    if (candidate < dateStr) continue;
    if (!weekDays.includes(dayOfWeekFromDateStr(candidate))) continue;
    remainingScheduledDays += 1;
  }

  return { remainingScheduledDays };
}
