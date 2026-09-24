import assert from 'assert';
import {
  HOMEOSTASIS_BAND_RATIO,
  HOMEOSTASIS_FLOOR_MINUTES,
  HOMEOSTASIS_WINDOW_DAYS,
  buildHomeostasisBand,
  classifyLoadMinutes,
  buildDailyLoadSeries,
  getReadingLoadSeries,
  formatReadingHomeostasisVictoryTitle,
  buildReadingHomeostasisVictory,
  READING_HOMEOSTASIS_VICTORY_CATEGORY
} from '../src/utils/homeostasis.js';
import { DAILY_VICTORY_OVERFLOW_SOURCES } from '../src/utils/dailyVictories.js';

function run() {
  console.log('🧪 Testando faixa de homeostase em minutos...\n');

  assert.strictEqual(HOMEOSTASIS_WINDOW_DAYS, 14);
  assert.strictEqual(HOMEOSTASIS_BAND_RATIO, 0.2);

  const band = buildHomeostasisBand(33.6);
  assert.strictEqual(band.avgMinutes, 34, `média 33.6 arredonda para 34 min, veio ${band.avgMinutes}`);
  assert.strictEqual(band.homeostasisMinMinutes, 27);
  assert.strictEqual(band.homeostasisMaxMinutes, 41);
  assert.strictEqual(classifyLoadMinutes(34, band), 'homeostasis');
  assert.strictEqual(classifyLoadMinutes(26, band), 'allostasis-under');
  assert.strictEqual(classifyLoadMinutes(42, band), 'allostasis-over');
  console.log('✅ Faixa ±20% usa minutos inteiros e despreza segundos.');

  const series = buildDailyLoadSeries({
    minutesByDate: { '2026-09-07': 140 },
    todayStr: '2026-09-07',
    days: 14
  });
  assert.strictEqual(series.avgMinutes, 140, 'Dia vazio não entra na média');
  assert.strictEqual(series.activeDays, 1);
  assert.strictEqual(series.emptyDays, 13);
  assert.strictEqual(series.homeostasisMinMinutes, 112);
  assert.strictEqual(series.homeostasisMaxMinutes, 168);
  assert.strictEqual(series.today.minutes, 140);
  assert.strictEqual(series.today.zone, 'homeostasis');
  assert.strictEqual(series.points.filter((p) => p.zone === 'allostasis-under').length, 13);
  console.log('✅ Série diária ignora o zero na média e marca dia vazio como subcarga.');

  const floored = buildDailyLoadSeries({
    minutesByDate: { '2026-09-07': 10 },
    todayStr: '2026-09-07',
    days: 14,
    floorMinutes: HOMEOSTASIS_FLOOR_MINUTES.reading
  });
  assert.strictEqual(floored.avgMinutes, 10);
  assert.strictEqual(floored.homeostasisMinMinutes, HOMEOSTASIS_FLOOR_MINUTES.reading);
  assert.strictEqual(floored.floorApplied, true);
  assert.strictEqual(floored.today.zone, 'allostasis-under');
  console.log('✅ Piso absoluto segura a faixa quando a média murcha.');

  const reading = getReadingLoadSeries([
    { date: '2026-09-07', durationMinutes: 20 },
    { timestamp: '2026-09-07T22:10:00.000Z', durationMinutes: 15 },
    { date: '2026-09-01', durationMinutes: 40 }
  ], '2026-09-07', { days: 14 });
  const today = reading.points.find((p) => p.dateStr === '2026-09-07');
  const earlier = reading.points.find((p) => p.dateStr === '2026-09-01');
  assert.strictEqual(today.minutes, 35);
  assert.strictEqual(earlier.minutes, 40);
  assert.strictEqual(reading.activeDays, 2);
  assert.strictEqual(reading.avgMinutes, 38, 'Média só dos 2 dias com sessão: (35+40)/2');
  assert.strictEqual(reading.homeostasisMinMinutes, 30);
  assert.strictEqual(reading.homeostasisMaxMinutes, 46);
  assert.strictEqual(reading.floorApplied, false);
  console.log('✅ Tempo de leitura soma sessões do dia e monta a faixa só com dias ativos.');

  assert.strictEqual(formatReadingHomeostasisVictoryTitle(5), 'Ler no mínimo 5 minutos.');
  const readingVictory = buildReadingHomeostasisVictory([
    { date: '2026-09-07', durationMinutes: 20 },
    { timestamp: '2026-09-07T22:10:00.000Z', durationMinutes: 15 },
    { date: '2026-09-01', durationMinutes: 40 }
  ], '2026-09-07', { days: 14 });
  assert.strictEqual(readingVictory.title, 'Ler no mínimo 30 minutos.');
  assert.strictEqual(readingVictory.category, READING_HOMEOSTASIS_VICTORY_CATEGORY);
  assert.strictEqual(readingVictory.date, '2026-09-07');
  assert.strictEqual(readingVictory.source, DAILY_VICTORY_OVERFLOW_SOURCES.reading);
  console.log('✅ Vitória de leitura usa o piso da faixa de homeostase.');

  console.log('\n🎉 Teste de homeostase PASSOU COM SUCESSO!');
}

run();
