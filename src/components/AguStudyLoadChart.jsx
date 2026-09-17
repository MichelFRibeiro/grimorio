import React, { useMemo } from 'react';
import { getAguStudyLoadSeries } from '../utils/aguCycle';
import { HOMEOSTASIS_WINDOW_DAYS } from '../utils/homeostasis';
import { HomeostasisLoadChart } from './HomeostasisLoadChart';

const AGU_ZONE_COPY = {
  homeostasis: {
    label: 'Homeostase',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.35)',
    copy: 'Dentro da faixa real dos últimos 14 dias (±20% da média). O ritmo de estudo está sendo absorvido.'
  },
  'allostasis-under': {
    label: 'Alostase · subcarga',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    copy: 'Abaixo da média recente. Queda em relação ao tempo de estudo que vinha sendo sustentado.'
  },
  'allostasis-over': {
    label: 'Alostase · sobrecarga',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    copy: 'Acima da média recente. O treino passou do ritmo de estudo que vinha sendo sustentado.'
  }
};

export function AguStudyLoadChart({
  aguPlan,
  examQuestions,
  todayStr,
  liveMinutes = 0,
  days = HOMEOSTASIS_WINDOW_DAYS
}) {
  const series = useMemo(() => {
    const extra = liveMinutes > 0 && todayStr ? { [todayStr]: liveMinutes } : {};
    return getAguStudyLoadSeries(aguPlan, examQuestions || [], todayStr, {
      days,
      extraMinutesByDate: extra
    });
  }, [aguPlan, examQuestions, todayStr, liveMinutes, days]);

  return (
    <HomeostasisLoadChart
      series={series}
      days={days}
      title="Carga real — Homeostase & Alostase"
      description={`A faixa verde acompanha o que você realmente estudou: média dos últimos ${days} dias, com teto +20% e piso −20%. Atualiza todo dia. Fora dela o treino vira alostase — subcarga ou sobrecarga em relação ao ritmo recente.`}
      seriesLabel="Estudo AGU"
      accentColor="#fbbf24"
      zoneCopy={AGU_ZONE_COPY}
    />
  );
}
