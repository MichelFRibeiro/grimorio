import {
  getSaoPauloDateStr,
  getSaoPauloHour,
  getSaoPauloDayOfWeek,
  getSaoPauloMonthStr,
  getSaoPauloYearStr,
  getYesterdaySaoPauloDateStr,
  addDaysToDateStr
} from './timeUtils.js';
import { getWeekBounds } from './rankings.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

async function runTests() {
  console.log('🧪 Iniciando testes de validação do fuso horário de São Paulo (UTC-3)...\n');

  // Test 1: Horário noturno após as 21:00 BRT
  // 2026-08-20 22:30:00 BRT = 2026-08-21 01:30:00 UTC
  const nightTimeUtc = new Date('2026-08-21T01:30:00Z');
  const dateStr = getSaoPauloDateStr(nightTimeUtc);
  console.log(`2026-08-21T01:30:00Z (22:30 BRT) -> Data SP: '${dateStr}'`);
  assert(dateStr === '2026-08-20', 'Às 22:30 em SP a data deve ser 2026-08-20 e não 2026-08-21');

  const hour = getSaoPauloHour(nightTimeUtc);
  console.log(`2026-08-21T01:30:00Z -> Hora SP: ${hour}h`);
  assert(hour === 22, 'Hora em SP deve ser 22');

  const dayOfWeek = getSaoPauloDayOfWeek(nightTimeUtc);
  console.log(`2026-08-21T01:30:00Z -> Dia da semana SP: ${dayOfWeek} (Quinta=4)`);
  assert(dayOfWeek === 4, 'Dia da semana em SP deve ser 4 (Quinta-feira)');

  // Test 2: Meia-noite e 15 em São Paulo
  // 2026-08-21 00:15:00 BRT = 2026-08-21 03:15:00 UTC
  const afterMidnightUtc = new Date('2026-08-21T03:15:00Z');
  const dateMidnight = getSaoPauloDateStr(afterMidnightUtc);
  console.log(`\n2026-08-21T03:15:00Z (00:15 BRT) -> Data SP: '${dateMidnight}'`);
  assert(dateMidnight === '2026-08-21', 'Após a meia-noite em SP a data deve ser 2026-08-21');

  const hourMidnight = getSaoPauloHour(afterMidnightUtc);
  assert(hourMidnight === 0, 'Hora deve ser 0');

  const dayMidnight = getSaoPauloDayOfWeek(afterMidnightUtc);
  assert(dayMidnight === 5, 'Dia da semana deve ser 5 (Sexta-feira)');

  // Test 3: Ontem e virada de mês
  // 2026-08-01 10:00:00 BRT
  const firstOfMonth = new Date('2026-08-01T13:00:00Z');
  const yesterday = getYesterdaySaoPauloDateStr(firstOfMonth);
  console.log(`\nOntem a partir de 2026-08-01: '${yesterday}'`);
  assert(yesterday === '2026-07-31', 'Ontem de 01/08 deve ser 31/07');

  // Test 4: Sábado 23:30 BRT (Domingo 02:30 UTC)
  // Sábado, 22 de Agosto de 2026, 23:30 BRT
  const saturdayNight = new Date('2026-08-23T02:30:00Z');
  const satDateStr = getSaoPauloDateStr(saturdayNight);
  const satDay = getSaoPauloDayOfWeek(saturdayNight);
  console.log(`\nSábado 23:30 BRT (2026-08-23T02:30Z) -> Data SP: '${satDateStr}', Dia: ${satDay}`);
  assert(satDateStr === '2026-08-22', 'Data do sábado deve ser 2026-08-22');
  assert(satDay === 6, 'Dia da semana deve ser 6 (Sábado)');

  const weekBounds = getWeekBounds(saturdayNight);
  console.log(`Limites da semana para Sábado 23:30: ${weekBounds.weekLabel} (${weekBounds.weekKey})`);
  assert(weekBounds.weekKey === '2026-08-16', 'A semana ainda deve ser 2026-08-16');

  console.log('\n🎉 TODOS OS TESTES DE FUSO HORÁRIO PASSARAM COM SUCESSO!');
}

runTests().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
