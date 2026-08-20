/**
 * Utilitários de Data e Fuso Horário para o Grimório
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
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : (date || new Date());
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
