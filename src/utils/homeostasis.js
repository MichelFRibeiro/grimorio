import { parseDurationMinutes } from './activityDuration.js';
import { DAILY_VICTORY_OVERFLOW_SOURCES } from './dailyVictories.js';
import { addDaysToDateStr, getSaoPauloDateStr } from './timeUtils.js';

/** Janela da faixa de homeostase: média real dos últimos N dias. */
export const HOMEOSTASIS_WINDOW_DAYS = 14;
/** Amplitude da faixa em torno da média (±20%). */
export const HOMEOSTASIS_BAND_RATIO = 0.2;
/**
 * Pisos absolutos (minutos). A faixa nunca desce abaixo deles:
 * o teto continua seguindo a média, o chão não.
 */
export const HOMEOSTASIS_FLOOR_MINUTES = {
  study: 25,
  reading: 15
};

export function roundLoadMinutes(value) {
  const n = Number(value) || 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function buildHomeostasisBand(avgMinutes, floorMinutes = 0) {
  const center = Math.max(0, roundLoadMinutes(avgMinutes));
  const floor = Math.max(0, roundLoadMinutes(floorMinutes));
  const rawMin = roundLoadMinutes(center * (1 - HOMEOSTASIS_BAND_RATIO));
  const rawMax = roundLoadMinutes(center * (1 + HOMEOSTASIS_BAND_RATIO));
  const homeostasisMinMinutes = Math.max(rawMin, floor);
  return {
    avgMinutes: center,
    homeostasisMinMinutes,
    homeostasisMaxMinutes: Math.max(rawMax, homeostasisMinMinutes),
    floorMinutes: floor,
    floorApplied: floor > 0 && floor > rawMin
  };
}

export function classifyLoadMinutes(minutes, band = {}) {
  const value = roundLoadMinutes(minutes);
  const min = Number(band.homeostasisMinMinutes);
  const max = Number(band.homeostasisMaxMinutes);
  const floor = Number.isFinite(min) ? min : 0;
  const ceiling = Number.isFinite(max) ? max : 0;
  if (value < floor) return 'allostasis-under';
  if (value > ceiling) return 'allostasis-over';
  return 'homeostasis';
}

/**
 * Série diária de minutos, com faixa de homeostase = média da janela ±20%.
 * A média sai só dos dias com sessão: dia vazio é falta de dado, não ritmo,
 * e conta apenas como subcarga. O piso absoluto impede a faixa de murchar.
 * Recalcula a cada dia a partir do que realmente aconteceu.
 */
export function buildDailyLoadSeries({
  minutesByDate = {},
  todayStr,
  days = HOMEOSTASIS_WINDOW_DAYS,
  extraMinutesByDate = {},
  floorMinutes = 0
} = {}) {
  const today = todayStr || getSaoPauloDateStr();
  const windowDays = Math.max(1, Number(days) || HOMEOSTASIS_WINDOW_DAYS);
  const start = addDaysToDateStr(today, -(windowDays - 1));

  const rawPoints = [];
  let activeMinutes = 0;
  let activeDays = 0;

  for (let i = 0; i < windowDays; i += 1) {
    const dateStr = addDaysToDateStr(start, i);
    const minutes = roundLoadMinutes(
      (minutesByDate[dateStr] || 0) + parseDurationMinutes(extraMinutesByDate[dateStr])
    );
    if (minutes > 0) {
      activeMinutes += minutes;
      activeDays += 1;
    }
    rawPoints.push({
      dateStr,
      minutes,
      isToday: dateStr === today
    });
  }

  const avgMinutes = activeDays > 0 ? roundLoadMinutes(activeMinutes / activeDays) : 0;
  const band = buildHomeostasisBand(avgMinutes, floorMinutes);

  let homeostasisDays = 0;
  let allostasisUnderDays = 0;
  let allostasisOverDays = 0;
  const points = rawPoints.map((point) => {
    const zone = classifyLoadMinutes(point.minutes, band);
    if (zone === 'homeostasis') homeostasisDays += 1;
    else if (zone === 'allostasis-under') allostasisUnderDays += 1;
    else allostasisOverDays += 1;
    return { ...point, zone };
  });

  return {
    avgMinutes: band.avgMinutes,
    activeDays,
    emptyDays: windowDays - activeDays,
    floorMinutes: band.floorMinutes,
    floorApplied: band.floorApplied,
    homeostasisMinMinutes: band.homeostasisMinMinutes,
    homeostasisMaxMinutes: band.homeostasisMaxMinutes,
    points,
    homeostasisDays,
    allostasisUnderDays,
    allostasisOverDays,
    allostasisDays: allostasisUnderDays + allostasisOverDays,
    today: points.find((point) => point.isToday) || null
  };
}

export function sessionDateStr(entry) {
  if (!entry) return '';
  if (entry.date) return entry.date;
  if (entry.timestamp) return getSaoPauloDateStr(entry.timestamp);
  if (entry.createdAt) return getSaoPauloDateStr(entry.createdAt);
  return '';
}

export function getReadingLoadSeries(readingSessions = [], todayStr, options = {}) {
  const byDate = {};
  (readingSessions || []).forEach((session) => {
    const dateStr = sessionDateStr(session);
    if (!dateStr) return;
    byDate[dateStr] = (byDate[dateStr] || 0) + parseDurationMinutes(session.durationMinutes);
  });
  return buildDailyLoadSeries({
    minutesByDate: byDate,
    todayStr,
    days: options.days,
    extraMinutesByDate: options.extraMinutesByDate,
    floorMinutes: options.floorMinutes ?? HOMEOSTASIS_FLOOR_MINUTES.reading
  });
}

export const READING_HOMEOSTASIS_VICTORY_CATEGORY = 'Estudos';

export function formatReadingHomeostasisVictoryTitle(minutes) {
  return `Ler no mínimo ${roundLoadMinutes(minutes)} minutos.`;
}

/**
 * Vitória do dia no piso da faixa de homeostase de leitura.
 * O título é só rótulo: o cumprimento usa o piso recalculado na hora.
 */
export function buildReadingHomeostasisVictory(readingSessions = [], todayStr, options = {}) {
  const series = getReadingLoadSeries(readingSessions, todayStr, options);
  return {
    title: formatReadingHomeostasisVictoryTitle(series.homeostasisMinMinutes),
    category: READING_HOMEOSTASIS_VICTORY_CATEGORY,
    date: todayStr || getSaoPauloDateStr(),
    source: DAILY_VICTORY_OVERFLOW_SOURCES.reading
  };
}
