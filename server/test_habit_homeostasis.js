import './testEnv.js';
import assert from 'assert';
import { addDaysToDateStr } from '../src/utils/timeUtils.js';
import { DAILY_VICTORY_OVERFLOW_SOURCES, createDailyVictory, planLinkedDailyVictoryUpdates, isOverflowDailyVictorySource } from '../src/utils/dailyVictories.js';
import {
  HABIT_HOMEOSTASIS_FLOOR_COUNT,
  HABIT_HOMEOSTASIS_FLOOR_MINUTES,
  HABIT_HOMEOSTASIS_TARGET_MINUTES,
  applyHabitMeasure,
  buildHabitHomeostasisVictory,
  getHabitLoadSeries,
  habitHomeostasisSource,
  persistHabitHomeostasis,
  sanitizeHabitHomeostasisInput
} from '../src/utils/habitHomeostasis.js';
import { applyHabitHomeostasis, toggleHabit, updateHabitDuration } from './domain/activities.js';
import { defaultDatabase, getDb, saveDb } from './db.js';

function habit(overrides = {}) {
  return {
    id: 'h-apoios',
    title: 'Fazer Apoios',
    category: 'Saúde',
    frequency: 'daily',
    history: [],
    durationsByDate: {},
    homeostasis: {
      enabled: true,
      floorMinutes: HABIT_HOMEOSTASIS_FLOOR_MINUTES,
      targetMinutes: HABIT_HOMEOSTASIS_TARGET_MINUTES,
      setpointMinutes: 20,
      seeded: true,
      lastEvaluated: null,
      history: []
    },
    ...overrides
  };
}

function run() {
  console.log('🧪 Testando homeostase de rituais...\n');

  assert.strictEqual(getHabitLoadSeries({ id: 'h', title: 'Sem faixa' }, '2026-09-07'), null, 'ritual sem opt-in não tem faixa');
  const off = sanitizeHabitHomeostasisInput(false);
  assert.strictEqual(off.enabled, false, 'false desliga');
  const on = sanitizeHabitHomeostasisInput(true);
  assert.strictEqual(on.enabled, true);
  assert.strictEqual(on.floorMinutes, HABIT_HOMEOSTASIS_FLOOR_MINUTES);
  assert.strictEqual(on.targetMinutes, HABIT_HOMEOSTASIS_TARGET_MINUTES);
  const kept = sanitizeHabitHomeostasisInput(false, { enabled: true, setpointMinutes: 25, history: [{ to: 25 }] });
  assert.strictEqual(kept.enabled, false);
  assert.strictEqual(kept.setpointMinutes, 25, 'desligar não apaga o histórico');
  console.log('✅ Opt-in liga, desliga e preserva o histórico.');

  const today = '2026-09-14';
  const durations = {};
  for (let i = 1; i <= 6; i += 1) durations[addDaysToDateStr(today, -i)] = 20;
  const apoios = habit({ durationsByDate: durations });
  const series = getHabitLoadSeries(apoios, today, { days: 14 });
  const victory = buildHabitHomeostasisVictory(apoios, today);
  assert.ok(series, 'série existe');
  assert.strictEqual(
    victory.title,
    `Fazer Apoios: no mínimo ${series.homeostasisMinMinutes} minutos.`,
    'título da vitória é exatamente o piso da faixa'
  );
  assert.strictEqual(victory.source, habitHomeostasisSource(apoios.id));
  assert.strictEqual(victory.category, 'Saúde');
  assert.ok(series.homeostasisMinMinutes <= series.setpointMinutes, 'piso não passa do setpoint');
  assert.ok(series.homeostasisMaxMinutes >= series.setpointMinutes, 'teto cobre o setpoint');
  const withLive = getHabitLoadSeries(apoios, today, { days: 14, liveMinutesToday: 40 });
  assert.strictEqual(withLive.homeostasisMinMinutes, series.homeostasisMinMinutes, 'cronômetro em andamento não desloca a faixa');
  assert.strictEqual(withLive.today.minutes, 40, 'ponto de hoje mostra o tempo em andamento');
  console.log('✅ Gráfico e vitória usam o mesmo piso; tempo ao vivo não mexe na faixa.');

  assert.strictEqual(isOverflowDailyVictorySource(victory.source), true, 'vitória do ritual passa do teto manual');
  assert.strictEqual(isOverflowDailyVictorySource(DAILY_VICTORY_OVERFLOW_SOURCES.study), true);
  const planned = createDailyVictory([], victory, { today });
  const short = planLinkedDailyVictoryUpdates(planned.list, {
    today,
    habitMinutesById: { 'h-apoios': series.homeostasisMinMinutes - 1 },
    habitTargetMinutesById: { 'h-apoios': series.homeostasisMinMinutes }
  });
  assert.strictEqual(short.length, 0, 'abaixo do piso não conclui');
  const met = planLinkedDailyVictoryUpdates(planned.list, {
    today,
    habitMinutesById: { 'h-apoios': series.homeostasisMinMinutes },
    habitTargetMinutesById: { 'h-apoios': series.homeostasisMinMinutes }
  });
  assert.strictEqual(met.length, 1, 'no piso conclui a vitória do ritual');
  assert.strictEqual(met[0].id, planned.victory.id);
  console.log('✅ Cumprir o piso conclui a vitória; ficar abaixo não.');

  const db = defaultDatabase();
  db.habits = [habit({
    rewardLogs: {},
    xpReward: 30,
    coinReward: 8,
    homeostasis: on
  })];
  saveDb(db);
  const marked = toggleHabit(getDb(), { id: 'h-apoios', date: today, durationMinutes: 18 });
  assert.strictEqual(marked.error, undefined, marked.error);
  assert.strictEqual(marked.habit.durationsByDate[today], 18);
  assert.strictEqual(marked.habit.homeostasis.seeded, true, 'marcar semeia a homeostase');
  assert.ok(marked.habit.homeostasis.setpointMinutes >= HABIT_HOMEOSTASIS_FLOOR_MINUTES);
  const corrected = updateHabitDuration(getDb(), 'h-apoios', { date: today, durationMinutes: 25 });
  assert.strictEqual(corrected.habit.durationsByDate[today], 25);
  const disabled = applyHabitHomeostasis(corrected.habit, { enabled: false });
  assert.strictEqual(disabled.homeostasis.enabled, false);
  assert.ok(disabled.homeostasis.setpointMinutes > 0, 'desligar guarda o setpoint');
  console.log('✅ Marcar e corrigir a duração alimentam a faixa; desligar não apaga.');

  persistHabitHomeostasis(apoios, today);
  assert.strictEqual(apoios.homeostasis.seeded, true);

  const pushups = {
    id: 'h-push',
    title: 'Push ups',
    category: 'Saúde',
    tracking: 'time',
    history: [],
    durationsByDate: { [today]: 12 }
  };
  applyHabitMeasure(pushups, { enabled: true, tracking: 'count', countUnit: 'reps', countFloor: 8, countTarget: 40 });
  assert.strictEqual(pushups.tracking, 'count');
  assert.strictEqual(pushups.countUnit, 'reps');
  assert.ok(!pushups.homeostasis?.enabled, 'quantidade não liga a faixa de tempo');
  assert.strictEqual(pushups.homeostasisCount.enabled, true);
  assert.strictEqual(pushups.homeostasisCount.floorMinutes, 8);
  assert.strictEqual(pushups.homeostasisCount.targetMinutes, 40);
  pushups.countsByDate = {};
  for (let i = 1; i <= 6; i += 1) pushups.countsByDate[addDaysToDateStr(today, -i)] = 20;
  pushups.homeostasisCount.setpointMinutes = 20;
  pushups.homeostasisCount.seeded = true;
  const reps = getHabitLoadSeries(pushups, today, { measure: 'count' });
  const timeIgnored = getHabitLoadSeries(pushups, today);
  assert.strictEqual(timeIgnored, null, '12 min de cronômetro não alimentam a faixa de um ritual de quantidade');
  assert.ok(reps.today == null || reps.points.some((point) => point.minutes === 20), 'a série lê as repetições');
  const repsVictory = buildHabitHomeostasisVictory(pushups, today);
  assert.strictEqual(repsVictory.measure, 'count');
  assert.strictEqual(repsVictory.title, `Push ups: no mínimo ${reps.homeostasisMinMinutes} reps.`);
  assert.ok(repsVictory.title.includes('reps'));
  assert.ok(!repsVictory.title.includes('minutos'), 'a vitória não pede minutos');
  const repsMet = planLinkedDailyVictoryUpdates(
    createDailyVictory([], repsVictory, { today }).list,
    {
      today,
      habitMinutesById: { 'h-push:count': reps.homeostasisMinMinutes },
      habitTargetMinutesById: { 'h-push:count': reps.homeostasisMinMinutes }
    }
  );
  assert.strictEqual(repsMet.length, 1, 'bater as repetições conclui a vitória');
  const both = { id: 'h-both', title: 'Alongar', tracking: 'time' };
  applyHabitMeasure(both, { enabled: true, tracking: 'both', countUnit: 'páginas' });
  assert.strictEqual(both.homeostasis.enabled, true);
  assert.strictEqual(both.homeostasisCount.enabled, true);
  assert.strictEqual(both.homeostasis.floorMinutes, HABIT_HOMEOSTASIS_FLOOR_MINUTES);
  assert.strictEqual(both.homeostasisCount.floorMinutes, HABIT_HOMEOSTASIS_FLOOR_COUNT);
  console.log('✅ Quantidade tem faixa própria; tempo e quantidade não se misturam.');

  console.log('\n🎉 Teste de homeostase de rituais PASSOU COM SUCESSO!');
}

run();
