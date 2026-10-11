import React, { useMemo } from 'react';
import { HOMEOSTASIS_WINDOW_DAYS } from '../utils/homeostasis';
import { getHabitLoadSeries } from '../utils/habitHomeostasis';
import { HomeostasisLoadChart } from './HomeostasisLoadChart';
import { PlanHomeostasisVictoryButton } from './PlanHomeostasisVictoryButton';

const HABIT_ZONE_COPY = {
  homeostasis: {
    label: 'Homeostase',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.35)',
    copy: 'Dentro da faixa do setpoint (85%–125%). Esse volume sustenta a próxima expansão.'
  },
  'allostasis-under': {
    label: 'Alostase · subcarga',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    copy: 'Abaixo do piso da faixa. O ritual ficou aquém do que a capacidade já sustenta.'
  },
  'allostasis-over': {
    label: 'Alostase · sobrecarga',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    copy: 'Acima do teto da faixa. Passou do ritmo que vinha sendo sustentado.'
  },
  empty: {
    label: 'Sem sessão',
    color: '#64748b',
    glow: 'rgba(100, 116, 139, 0.25)',
    copy: 'Nenhum tempo registrado neste dia.'
  }
};

export function HabitLoadChart({
  habit,
  todayStr,
  liveMinutes = 0,
  days = HOMEOSTASIS_WINDOW_DAYS,
  victory = null,
  onAddDailyVictory = null,
  measure = 'time'
}) {
  const counting = measure === 'count';
  const series = useMemo(() => getHabitLoadSeries(habit, todayStr, {
    days,
    liveMinutesToday: counting ? 0 : liveMinutes,
    measure
  }), [habit, todayStr, liveMinutes, days, measure, counting]);

  if (!series) return null;

  return (
    <HomeostasisLoadChart
      series={series}
      days={days}
      title={`${habit.title} — ${counting ? 'Quantidade' : 'Tempo'}`}
      description={counting
        ? `A faixa verde acompanha ${series.unit || 'reps'}, não o tempo. Sobe no máximo 10% por semana quando 4 dos últimos 7 dias ficaram nela, até ${series.targetMinutes}.`
        : `A faixa verde é a zona do setpoint. Sobe no máximo 10% por semana quando 4 dos últimos 7 dias ficaram nela, até ${series.targetMinutes} min.`}
      seriesLabel={counting ? (series.unit || 'Quantidade') : habit.title}
      accentColor={counting ? '#38bdf8' : '#f87171'}
      formatValue={(value) => String(Math.round(Number(value) || 0))}
      unitSuffix={counting ? ` ${series.unit || 'reps'}` : ' min'}
      zoneCopy={HABIT_ZONE_COPY}
      actions={victory ? (
        <PlanHomeostasisVictoryButton
          victory={victory}
          onAddDailyVictory={onAddDailyVictory}
          accentColor="#f87171"
        />
      ) : null}
    />
  );
}
