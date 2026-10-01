import React, { useMemo } from 'react';
import { getReadingLoadSeries, HOMEOSTASIS_WINDOW_DAYS } from '../utils/homeostasis';
import { HomeostasisLoadChart } from './HomeostasisLoadChart';

const READING_ZONE_COPY = {
  homeostasis: {
    label: 'Homeostase',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.35)',
    copy: 'Dentro da faixa real dos últimos 14 dias (±20% da média). O ritmo de leitura está sendo absorvido.'
  },
  'allostasis-under': {
    label: 'Alostase · subcarga',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    copy: 'Abaixo da média recente. Queda em relação ao tempo de leitura que vinha sendo sustentado.'
  },
  'allostasis-over': {
    label: 'Alostase · sobrecarga',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    copy: 'Acima da média recente. A leitura passou do ritmo que vinha sendo sustentado.'
  }
};

export function ReadingLoadChart({
  readingSessions,
  todayStr,
  liveMinutes = 0,
  days = HOMEOSTASIS_WINDOW_DAYS,
  actions = null
}) {
  // O tempo de leitura em andamento entra no ponto de hoje, não na faixa.
  const series = useMemo(() => getReadingLoadSeries(readingSessions || [], todayStr, {
    days,
    liveMinutesToday: liveMinutes
  }), [readingSessions, todayStr, liveMinutes, days]);

  return (
    <HomeostasisLoadChart
      series={series}
      days={days}
      title="Leitura real — Homeostase & Alostase"
      description="A faixa verde é a zona do setpoint de leitura. Sobe no máximo 10% por semana quando 4 dos últimos 7 dias ficaram nela, até a meta de leitura."
      seriesLabel="Leitura"
      accentColor="#34d399"
      zoneCopy={READING_ZONE_COPY}
      actions={actions}
    />
  );
}
