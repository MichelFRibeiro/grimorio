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
