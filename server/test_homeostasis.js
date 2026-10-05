import './testEnv.js';
import assert from 'assert';
import {
  HOMEOSTASIS_BAND_RATIO,
  HOMEOSTASIS_FLOOR_MINUTES,
  HOMEOSTASIS_WINDOW_DAYS,
  buildHomeostasisBand,
  classifyLoadMinutes,
  buildDailyLoadSeries,
  evaluateSetpoint,
  initialSetpointFromBaseline,
  projectTargetDate,
  robustBaseline,
  getReadingLoadSeries,
  formatReadingHomeostasisVictoryTitle,
  buildReadingHomeostasisVictory,
  READING_HOMEOSTASIS_VICTORY_CATEGORY
} from '../src/utils/homeostasis.js';
import { DAILY_VICTORY_OVERFLOW_SOURCES } from '../src/utils/dailyVictories.js';
import { getAguStudyLoadSeries, buildAguHomeostasisStudyVictory, addBlockDuration, startAguPlan } from '../src/utils/aguCycle.js';
import { createDefaultAguPlan } from '../src/data/aguCurriculum.js';

function run() {
  console.log('🧪 Testando faixa de homeostase em minutos...\n');

  assert.strictEqual(HOMEOSTASIS_WINDOW_DAYS, 14);
  assert.strictEqual(HOMEOSTASIS_BAND_RATIO, 0.2);

  const band = buildHomeostasisBand(33.6, 0);
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
    days: 14,
    mode: 'descriptive'
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
    floorMinutes: HOMEOSTASIS_FLOOR_MINUTES.reading,
    mode: 'descriptive'
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
  ], '2026-09-07', { days: 14, mode: 'descriptive' });
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
  ], '2026-09-07', { days: 14, state: { setpointMinutes: 30, targetMinutes: 30, seeded: true } });
  assert.strictEqual(readingVictory.title, 'Ler no mínimo 30 minutos.');
  assert.strictEqual(readingVictory.category, READING_HOMEOSTASIS_VICTORY_CATEGORY);
  assert.strictEqual(readingVictory.date, '2026-09-07');
  assert.strictEqual(readingVictory.source, DAILY_VICTORY_OVERFLOW_SOURCES.reading);
  console.log('✅ Vitória de leitura usa o setpoint do dia.');

  // O tempo EM ANDAMENTO não pode mexer na faixa: senão o gráfico mostra uma
  // faixa e a vitória planejada grava outra (45 min–1h07 vs "no mínimo 30 min"),
  // e a meta vira alvo móvel — quanto mais se estuda, mais alta fica.
  const historico = { '2026-09-05': 40, '2026-09-06': 50 };
  const semAndamento = buildDailyLoadSeries({
    minutesByDate: historico,
    todayStr: '2026-09-07',
    days: 14,
    mode: 'descriptive'
  });
  const comAndamento = buildDailyLoadSeries({
    minutesByDate: historico,
    todayStr: '2026-09-07',
    days: 14,
    liveMinutesToday: 55,
    mode: 'descriptive'
  });
  assert.strictEqual(comAndamento.avgMinutes, semAndamento.avgMinutes, 'tempo em andamento não entra na média da faixa');
  assert.strictEqual(comAndamento.homeostasisMinMinutes, semAndamento.homeostasisMinMinutes, 'piso da faixa estável durante a sessão');
  assert.strictEqual(comAndamento.homeostasisMaxMinutes, semAndamento.homeostasisMaxMinutes, 'teto da faixa estável durante a sessão');
  assert.strictEqual(semAndamento.today.minutes, 0, 'ponto de hoje sem tempo em andamento');
  assert.strictEqual(comAndamento.today.minutes, 55, 'ponto de hoje soma o tempo em andamento');
  assert.strictEqual(comAndamento.today.loggedMinutes, 0, 'ponto de hoje separa o registrado');
  assert.strictEqual(comAndamento.today.liveMinutes, 55, 'ponto de hoje separa o em andamento');
  console.log('✅ Tempo em andamento aparece no dia de hoje, mas não desloca a faixa.');

  // Gráfico, botão "Planeja vitória" e sincronização do servidor: mesma série.
  const planoVazio = { startedAt: null, blocks: {}, blockDurations: {} };
  const fontes = { mindMapSessions: [{ date: '2026-09-06', durationMinutes: 30 }] };
  const serie = getAguStudyLoadSeries(planoVazio, [], '2026-09-07', fontes);
  const vitoria = buildAguHomeostasisStudyVictory(planoVazio, [], '2026-09-07', fontes);
  assert.strictEqual(
    vitoria.title,
    `Estudar no mínimo ${serie.homeostasisMinMinutes} minutos.`,
    'título da vitória é exatamente o piso da faixa mostrada'
  );
  const serieComCronometro = getAguStudyLoadSeries(planoVazio, [], '2026-09-07', {
    ...fontes,
    liveMinutesToday: 40
  });
  assert.strictEqual(
    serieComCronometro.homeostasisMinMinutes,
    serie.homeostasisMinMinutes,
    'faixa do gráfico não muda com o cronômetro rodando'
  );
  assert.strictEqual(serieComCronometro.today.minutes, 40, 'gráfico mostra o tempo em andamento no dia de hoje');
  const semMapas = buildAguHomeostasisStudyVictory(planoVazio, [], '2026-09-07');
  assert.strictEqual(
    vitoria.title,
    semMapas.title,
    'mapas mentais entram nas duas pontas (aqui sem sessões, o número coincide)'
  );
  console.log('✅ Gráfico, vitória planejada e servidor usam o mesmo número.');

  // O lançamento grava o tempo no exame e no bloco. O gráfico tem que mostrar
  // o mesmo número do Histórico de blocos, sem contar o bloco duas vezes.
  const dia = '2026-10-05';
  let planoDuplicado = startAguPlan(createDefaultAguPlan(dia), dia);
  planoDuplicado = addBlockDuration(planoDuplicado, `${dia}|portugues|estudo|ortografia`, 81);
  const exameDoBloco = [{
    subject: 'Língua Portuguesa',
    subjectId: 'portugues',
    topicId: 'ortografia',
    blockKey: `${dia}|portugues|estudo|ortografia`,
    totalQuestions: 10,
    correctAnswers: 6,
    date: dia,
    durationMinutes: 81
  }];
  const serieDuplicada = getAguStudyLoadSeries(planoDuplicado, exameDoBloco, dia, { days: 14 });
  assert.strictEqual(
    serieDuplicada.today.minutes,
    81,
    `gráfico não pode dobrar o tempo do bloco lançado, veio ${serieDuplicada.today.minutes}`
  );
  console.log('✅ Gráfico conta cada bloco uma vez, igual ao histórico.');

  const zeros = {};
  for (let i = 0; i < 14; i += 1) zeros[`2026-08-${String(25 + i).padStart(2, '0')}`] = i === 13 ? 86 : 0;
  const baseline = robustBaseline({ ...zeros, '2026-09-07': 86 }, '2026-09-07');
  assert.strictEqual(baseline.samples.length, 14, 'baseline conta os 14 dias');
  assert.strictEqual(baseline.median, 0, 'um dia de 86 min não puxa a mediana com 13 zeros');
  assert.strictEqual(initialSetpointFromBaseline(0), 20, 'baseline abaixo de 20 começa no piso');
  assert.strictEqual(initialSetpointFromBaseline(33), 35, 'baseline arredonda ao passo de 5');

  const held = evaluateSetpoint({ setpoint: 30, samples: [30, 30, 30, 0, 0, 0, 0] });
  assert.strictEqual(held.reason, 'hold', '3/7 não expande nem contrai');
  const expanded = evaluateSetpoint({ setpoint: 30, samples: [30, 32, 28, 40, 30, 0, 0] });
  assert.strictEqual(expanded.reason, 'expand', '4/7 na faixa expande');
  assert.ok(expanded.to <= 35, `expansão máxima de 10% (30 → 33, passo 5 = 35), veio ${expanded.to}`);
  assert.ok(expanded.to > 30, 'expansão sobe pelo menos um passo');
  const contracted = evaluateSetpoint({ setpoint: 30, samples: [0, 0, 0, 0, 0, 40, 0] });
  assert.strictEqual(contracted.to, 25, 'adesão < 40% recua um passo');
  const flooredSetpoint = evaluateSetpoint({ setpoint: 20, samples: [0, 0, 0, 0, 0, 0, 0] });
  assert.strictEqual(flooredSetpoint.to, 20, 'contração não fura o piso de 20');
  const projection = projectTargetDate(30, 180, 0.1, '2026-09-07');
  assert.ok(projection.weeks >= 18 && projection.weeks <= 20, `30 → 180 a 10%/semana leva ~19 semanas, veio ${projection.weeks}`);
  assert.ok(projection.date > '2026-09-07', 'projeção tem data');
  console.log('✅ Setpoint: baseline com zeros, expansão 4/7, contração, piso e projeção.');

  console.log('\n🎉 Teste de homeostase PASSOU COM SUCESSO!');
}

run();
