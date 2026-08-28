/**
 * Utilitários de Data e Fuso Horário para o Frontend do Grimório
 * Fuso horário padrão: América/São Paulo (BRT, UTC-3)
 */

export const SAO_PAULO_TZ = 'America/Sao_Paulo';

/**
 * Retorna a data no formato 'YYYY-MM-DD' de acordo com o fuso horário de São Paulo.
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Ex: '2026-08-20'
 */
export function getSaoPauloDateStr(date = new Date()) {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : (date || new Date());
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
 * Retorna a hora atual no fuso de São Paulo no formato aceito por inputs datetime-local ('YYYY-MM-DDTHH:mm').
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Ex: '2026-08-20T14:30'
 */
export function getSaoPauloNowDateTimeLocal(date = new Date()) {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : (date || new Date());
    if (isNaN(d.getTime())) return getSaoPauloNowDateTimeLocal(new Date());

    const dateStr = getSaoPauloDateStr(d);
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: SAO_PAULO_TZ,
      hour: '2-digit',
      hourCycle: 'h23'
    }).format(d);

    const minuteStr = new Intl.DateTimeFormat('en-US', {
      timeZone: SAO_PAULO_TZ,
      minute: '2-digit'
    }).format(d);

    const hourFormatted = hourStr.length === 1 ? `0${hourStr}` : (hourStr === '24' ? '00' : hourStr);
    const minuteFormatted = minuteStr.padStart(2, '0');

    return `${dateStr}T${hourFormatted}:${minuteFormatted}`;
  } catch (e) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}

/**
 * Retorna o dia da semana (0: Domingo, 1: Segunda, ..., 6: Sábado) no fuso de São Paulo.
 * @param {Date|string|number} [date=new Date()]
 * @returns {number} 0 a 6
 */
export function getSaoPauloDayOfWeek(date = new Date()) {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : (date || new Date());
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
  const currentDayOfWeek = getSaoPauloDayOfWeek(date); // 0=Sun, 1=Mon, ..., 6=Sat

  // Segunda-feira como início da semana
  const diffToMonday = (currentDayOfWeek === 0 ? -6 : 1) - currentDayOfWeek;
  const mondayDateStr = addDaysToDateStr(refDateStr, diffToMonday);

  const dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const dayShort = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const dayIndices = [1, 2, 3, 4, 5, 6, 0];

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
  const yesterdayStr = addDaysToDateStr(todayStr, -1);

  // 1. Sequência Ativa (currentStreak)
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
  } else if (habit?.frequency === 'weekly') {
    targetTimesPerWeek = 1;
  } else if (habit?.frequency === 'times_per_week') {
    targetTimesPerWeek = Math.max(1, Math.min(7, parseInt(habit?.targetTimesPerWeek || habit?.timesPerWeek, 10) || 3));
  } else {
    targetTimesPerWeek = 7;
  }

  const completedDays = weekDays.map(day => ({
    ...day,
    completed: history.includes(day.dateStr)
  }));

  const completionsThisWeek = completedDays.filter(d => d.completed).length;
  const isGoalMet = completionsThisWeek >= targetTimesPerWeek;

  return {
    targetTimesPerWeek,
    completionsThisWeek,
    isGoalMet,
    completedDays
  };
}
