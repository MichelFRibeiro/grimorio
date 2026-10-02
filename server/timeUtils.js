/**
 * Utilitários de Data e Fuso Horário para o Grimório
 * Fuso horário padrão: América/São Paulo (BRT, UTC-3)
 */

import { isPeriodFrequency, getHabitPeriodStatus, getHabitWeekDays, canonicalizeHabitFrequency } from '../src/utils/habitFrequency.js';

export const SAO_PAULO_TZ = 'America/Sao_Paulo';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte Date|string|number em Date válida.
 * Strings 'YYYY-MM-DD' são tratadas como data civil (meio-dia UTC),
 * evitando o deslocamento de fuso de `new Date('YYYY-MM-DD')` (meia-noite UTC),
 * que em America/Sao_Paulo cai no dia anterior.
 * @param {Date|string|number} [date=new Date()]
 * @returns {Date}
 */
function toValidDate(date = new Date()) {
  if (typeof date === 'string' && DATE_ONLY_RE.test(date)) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  }
  if (date instanceof Date) return date;
  if (typeof date === 'string' || typeof date === 'number') return new Date(date);
  return date || new Date();
}

/**
 * Retorna a data no formato 'YYYY-MM-DD' de acordo com o fuso horário de São Paulo.
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Ex: '2026-08-20'
 */
export function getSaoPauloDateStr(date = new Date()) {
  try {
    const d = toValidDate(date);
    if (isNaN(d.getTime())) return getSaoPauloDateStr(new Date());

    return new Intl.DateTimeFormat('en-CA', {
      timeZone: SAO_PAULO_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch (e) {
    const fallback = new Date();
    const y = fallback.getFullYear();
    const m = String(fallback.getMonth() + 1).padStart(2, '0');
    const day = String(fallback.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

/**
 * Retorna o mês e ano no formato 'YYYY-MM' no fuso de São Paulo.
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Ex: '2026-08'
 */
export function getSaoPauloMonthStr(date = new Date()) {
  return getSaoPauloDateStr(date).substring(0, 7);
}

/**
 * Retorna o ano no formato 'YYYY' no fuso de São Paulo.
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Ex: '2026'
 */
export function getSaoPauloYearStr(date = new Date()) {
  return getSaoPauloDateStr(date).substring(0, 4);
}

/**
 * Retorna a hora (0-23) no fuso de São Paulo.
 * @param {Date|string|number} [date=new Date()]
 * @returns {number} 0 a 23
 */
export function getSaoPauloHour(date = new Date()) {
  try {
    const d = toValidDate(date);
    if (isNaN(d.getTime())) return getSaoPauloHour(new Date());

    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: SAO_PAULO_TZ,
      hour: 'numeric',
      hourCycle: 'h23'
    }).format(d);

    const h = parseInt(hourStr, 10);
    return isNaN(h) ? d.getHours() : (h === 24 ? 0 : h);
  } catch (e) {
    return new Date().getHours();
  }
}

/**
 * Retorna o minuto (0-59) no fuso de São Paulo.
 * @param {Date|string|number} [date=new Date()]
 * @returns {number} 0 a 59
 */
export function getSaoPauloMinute(date = new Date()) {
  try {
    const d = toValidDate(date);
    if (isNaN(d.getTime())) return getSaoPauloMinute(new Date());

    const minuteStr = new Intl.DateTimeFormat('en-US', {
      timeZone: SAO_PAULO_TZ,
      minute: '2-digit'
    }).format(d);

    const m = parseInt(minuteStr, 10);
    return isNaN(m) ? d.getMinutes() : m;
  } catch (e) {
    return new Date().getMinutes();
  }
}

/**
 * Retorna o dia da semana (0: Domingo, 1: Segunda, ..., 6: Sábado) no fuso de São Paulo.
 * @param {Date|string|number} [date=new Date()]
 * @returns {number} 0 a 6
 */
export function getSaoPauloDayOfWeek(date = new Date()) {
  try {
    const d = toValidDate(date);
    if (isNaN(d.getTime())) return getSaoPauloDayOfWeek(new Date());

    const weekdayStr = new Intl.DateTimeFormat('en-US', {
      timeZone: SAO_PAULO_TZ,
      weekday: 'short'
    }).format(d);

    const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return days[weekdayStr] !== undefined ? days[weekdayStr] : d.getDay();
  } catch (e) {
    return new Date().getDay();
  }
}

/**
 * Retorna a data do dia anterior no formato 'YYYY-MM-DD' no fuso de São Paulo.
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Ex: '2026-08-19'
 */
export function getYesterdaySaoPauloDateStr(date = new Date()) {
  const spDateStr = getSaoPauloDateStr(date);
  const [year, month, day] = spDateStr.split('-').map(Number);
  // Meio-dia UTC evita qualquer transição de borda
  const prevDate = new Date(Date.UTC(year, month - 1, day - 1, 12, 0, 0));
  return getSaoPauloDateStr(prevDate);
}

/**
 * Adiciona ou subtrai dias a partir de uma data string 'YYYY-MM-DD' no fuso de São Paulo.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {number} daysOffset
 * @returns {string} 'YYYY-MM-DD'
 */
export function addDaysToDateStr(dateStr, daysOffset) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day + daysOffset, 12, 0, 0));
  return getSaoPauloDateStr(targetDate);
}

/**
 * Retorna os 7 dias da semana corrente (Segunda a Domingo) no fuso de São Paulo.
 * @param {Date|string|number} [date=new Date()]
 * @returns {Array<{dateStr: string, dayOfWeek: number, label: string, shortName: string, isToday: boolean, isPast: boolean, isFuture: boolean}>}
 */
export function getCurrentWeekDays(date = new Date()) {
  const todayStr = getSaoPauloDateStr(new Date());
  const refDateStr = getSaoPauloDateStr(date);
  // Usa a data civil já normalizada para não herdar parse UTC de 'YYYY-MM-DD'
  const currentDayOfWeek = getSaoPauloDayOfWeek(refDateStr); // 0=Sun, 1=Mon, ..., 6=Sat

  // Segunda-feira como início da semana (diffToMonday)
  const diffToMonday = (currentDayOfWeek === 0 ? -6 : 1) - currentDayOfWeek;
  const mondayDateStr = addDaysToDateStr(refDateStr, diffToMonday);

  const dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const dayShort = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const dayIndices = [1, 2, 3, 4, 5, 6, 0]; // Monday (1) to Sunday (0)

  return dayLabels.map((label, i) => {
    const dateStr = addDaysToDateStr(mondayDateStr, i);
    return {
      dateStr,
      dayOfWeek: dayIndices[i],
      label,
      shortName: dayShort[i],
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
      isFuture: dateStr > todayStr
    };
  });
}

/**
 * Calcula de forma determinística e precisa a sequência atual (currentStreak)
 * e a melhor sequência histórica (bestStreak) a partir do histórico de datas.
 * @param {string[]} history Lista de datas 'YYYY-MM-DD' em que o hábito foi concluído
 * @param {Date|string|number} [refDate=new Date()] Data de referência (hoje)
 * @param {number} [previousBestStreak=0] Recorde anterior para não regredir
 * @returns {{ currentStreak: number, bestStreak: number }}
 */
export function calculateHabitStreak(history = [], refDate = new Date(), previousBestStreak = 0) {
  if (!Array.isArray(history) || history.length === 0) {
    return { currentStreak: 0, bestStreak: previousBestStreak || 0 };
  }

  // Deduplica e filtra strings de data válidas YYYY-MM-DD
  const dateSet = new Set(history.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)));
  if (dateSet.size === 0) {
    return { currentStreak: 0, bestStreak: previousBestStreak || 0 };
  }

  const todayStr = getSaoPauloDateStr(refDate);
  const yesterdayStr = getYesterdaySaoPauloDateStr(refDate);

  // 1. Sequência Ativa (currentStreak)
  // A sequência está viva se hoje foi realizado, OU se ontem foi realizado (hoje ainda não concluído)
  let currentStreak = 0;
  let checkDate = null;

  if (dateSet.has(todayStr)) {
    checkDate = todayStr;
  } else if (dateSet.has(yesterdayStr)) {
    checkDate = yesterdayStr;
  }

  if (checkDate) {
    while (dateSet.has(checkDate)) {
      currentStreak++;
      checkDate = addDaysToDateStr(checkDate, -1);
    }
  }

  // 2. Melhor Sequência Histórica (bestStreak)
  const sortedDates = Array.from(dateSet).sort();
  let maxHistoryStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  for (const d of sortedDates) {
    if (prevDate && addDaysToDateStr(prevDate, 1) === d) {
      tempStreak++;
    } else {
      tempStreak = 1;
    }
    if (tempStreak > maxHistoryStreak) {
      maxHistoryStreak = tempStreak;
    }
    prevDate = d;
  }

  const bestStreak = Math.max(previousBestStreak || 0, maxHistoryStreak, currentStreak);

  return {
    currentStreak,
    bestStreak
  };
}

/**
 * Calcula estatísticas e progresso semanal de um ritual/hábito.
 * @param {object} habit
 * @param {Date|string|number} [date=new Date()]
 * @returns {{ targetTimesPerWeek: number, completionsThisWeek: number, isGoalMet: boolean, completedDays: Array }}
 */
export function getHabitWeeklyStats(habit, date = new Date()) {
  const weekDays = getCurrentWeekDays(date);
  const history = Array.isArray(habit?.history) ? habit.history : [];

  let targetTimesPerWeek = 7;
  if (habit?.frequency === 'weekdays') {
    targetTimesPerWeek = 5;
  } else if (habit?.frequency === 'weekly' || isPeriodFrequency(habit?.frequency)) {
    targetTimesPerWeek = 1;
  } else if (habit?.frequency === 'times_per_week') {
    const scheduled = getHabitWeekDays(habit);
    targetTimesPerWeek = scheduled?.length
      || Math.max(1, Math.min(7, parseInt(habit?.targetTimesPerWeek || habit?.timesPerWeek, 10) || 3));
  } else {
    targetTimesPerWeek = 7;
  }

  const completedDays = weekDays.map(day => ({
    ...day,
    completed: history.includes(day.dateStr)
  }));

  const completionsThisWeek = completedDays.filter(d => d.completed).length;
  const period = isPeriodFrequency(habit?.frequency) ? getHabitPeriodStatus(habit, date) : null;
  const isGoalMet = period ? !period.due : completionsThisWeek >= targetTimesPerWeek;

  return {
    targetTimesPerWeek,
    completionsThisWeek,
    isGoalMet,
    completedDays,
    period
  };
}

function sundayOfWeek(dateStr) {
  return addDaysToDateStr(dateStr, -getSaoPauloDayOfWeek(dateStr));
}

function weekMet(habit, sunday, target) {
  const end = addDaysToDateStr(sunday, 6);
  const history = Array.isArray(habit?.history) ? habit.history : [];
  const done = history.filter((date) => typeof date === 'string' && date >= sunday && date <= end).length;
  return done >= target;
}

export function weekRangeForStreak(dateStr) {
  const sunday = sundayOfWeek(dateStr);
  return { start: sunday, end: addDaysToDateStr(sunday, 6) };
}

function weeklyTargetOf(habit) {
  const freq = canonicalizeHabitFrequency(habit?.frequency || 'daily');
  if (freq === 'weekly') return 1;
  const days = getHabitWeekDays(habit);
  if (days?.length) return days.length;
  return Math.max(1, Math.min(7, parseInt(habit?.targetTimesPerWeek || habit?.timesPerWeek, 10) || 3));
}

/**
 * Sequência pela frequência, não por dia corrido.
 * daily/weekdays contam dias devidos consecutivos.
 * weekly/times_per_week contam semanas em que a meta fechou.
 * fortnightly/monthly contam períodos concluídos.
 * A semana/período corrente ainda aberta não quebra a sequência.
 */
export function calculateFrequencyStreak(habit, refDate = new Date()) {
  const freq = canonicalizeHabitFrequency(habit?.frequency || 'daily');
  const history = Array.isArray(habit?.history) ? habit.history : [];
  const today = getSaoPauloDateStr(refDate);
  const previousBest = habit?.bestStreak || 0;

  if (freq === 'weekly' || freq === 'times_per_week') {
    const target = weeklyTargetOf(habit);
    let cursor = sundayOfWeek(today);
    if (!weekMet(habit, cursor, target)) cursor = addDaysToDateStr(cursor, -7);
    let current = 0;
    let guard = 0;
    while (weekMet(habit, cursor, target) && guard < 520) {
      current += 1;
      cursor = addDaysToDateStr(cursor, -7);
      guard += 1;
    }
    return {
      currentStreak: current,
      bestStreak: Math.max(previousBest, current),
      unit: 'weeks',
      unitLabel: current === 1 ? 'semana' : 'semanas'
    };
  }

  if (isPeriodFrequency(freq)) {
    const currentPeriod = getHabitPeriodStatus(habit, today);
    let cursor = currentPeriod?.start || today;
    if (currentPeriod && !currentPeriod.completed) {
      cursor = addDaysToDateStr(currentPeriod.start, -1);
    }
    let current = 0;
    let guard = 0;
    while (guard < 240) {
      const period = getHabitPeriodStatus(habit, cursor);
      if (!period?.completed) break;
      current += 1;
      cursor = addDaysToDateStr(period.start, -1);
      guard += 1;
    }
    return {
      currentStreak: current,
      bestStreak: Math.max(previousBest, current),
      unit: 'periods',
      unitLabel: current === 1 ? 'período' : 'períodos'
    };
  }

  const dateSet = new Set(history.filter((date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)));
  const dueOn = (dateStr) => {
    if (freq === 'weekdays') {
      const day = getSaoPauloDayOfWeek(dateStr);
      return day >= 1 && day <= 5;
    }
    return true;
  };
  let cursor = today;
  if (!dateSet.has(today)) cursor = addDaysToDateStr(today, -1);
  let current = 0;
  let guard = 0;
  while (guard < 2000) {
    if (!dueOn(cursor)) {
      cursor = addDaysToDateStr(cursor, -1);
      guard += 1;
      continue;
    }
    if (!dateSet.has(cursor)) break;
    current += 1;
    cursor = addDaysToDateStr(cursor, -1);
    guard += 1;
  }
  return {
    currentStreak: current,
    bestStreak: Math.max(previousBest, current),
    unit: 'days',
    unitLabel: current === 1 ? 'dia' : 'dias'
  };
}
