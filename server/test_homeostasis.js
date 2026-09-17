import assert from 'assert';
import {
  HOMEOSTASIS_BAND_RATIO,
  HOMEOSTASIS_WINDOW_DAYS,
  buildHomeostasisBand,
  classifyLoadMinutes,
  buildDailyLoadSeries,
  getReadingLoadSeries
} from '../src/utils/homeostasis.js';

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
  assert.strictEqual(series.avgMinutes, 10);
  assert.strictEqual(series.homeostasisMinMinutes, 8);
  assert.strictEqual(series.homeostasisMaxMinutes, 12);
  assert.strictEqual(series.today.minutes, 140);
  assert.strictEqual(series.today.zone, 'allostasis-over');
  console.log('✅ Série diária classifica sobrecarga contra a média real.');

  const reading = getReadingLoadSeries([
    { date: '2026-09-07', durationMinutes: 20 },
    { timestamp: '2026-09-07T22:10:00.000Z', durationMinutes: 15 },
    { date: '2026-09-01', durationMinutes: 40 }
  ], '2026-09-07', { days: 14 });
  const today = reading.points.find((p) => p.dateStr === '2026-09-07');
  const earlier = reading.points.find((p) => p.dateStr === '2026-09-01');
  assert.strictEqual(today.minutes, 35);
  assert.strictEqual(earlier.minutes, 40);
  assert.strictEqual(reading.avgMinutes, 5);
  assert.strictEqual(reading.homeostasisMinMinutes, 4);
  assert.strictEqual(reading.homeostasisMaxMinutes, 6);
  console.log('✅ Tempo de leitura soma sessões do dia e monta a faixa em minutos.');

  console.log('\n🎉 Teste de homeostase PASSOU COM SUCESSO!');
}

run();
