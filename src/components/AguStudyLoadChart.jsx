import React, { useMemo } from 'react';
import { getAguStudyLoadSeries } from '../utils/aguCycle';
import { HOMEOSTASIS_WINDOW_DAYS } from '../utils/homeostasis';
import { HomeostasisLoadChart } from './HomeostasisLoadChart';

const AGU_ZONE_COPY = {
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
  mindMapSessions = [],
  days = HOMEOSTASIS_WINDOW_DAYS,
  actions = null
}) {
  // O tempo em andamento entra no ponto de hoje, não na média da faixa: assim
  // o número do gráfico é o mesmo da vitória planejada.
  const series = useMemo(() => getAguStudyLoadSeries(aguPlan, examQuestions || [], todayStr, {
    days,
    liveMinutesToday: liveMinutes,
    mindMapSessions: mindMapSessions || []
  }), [aguPlan, examQuestions, todayStr, liveMinutes, mindMapSessions, days]);

  return (
    <HomeostasisLoadChart
      series={series}
      days={days}
      title="Carga real — Homeostase & Alostase"
      description="A faixa verde é a zona do setpoint de hoje. Ela sobe no máximo 10% por semana, e só se 4 dos últimos 7 dias ficaram nela. A linha clara é a meta de 180 min."
      seriesLabel="Estudo AGU"
      accentColor="#fbbf24"
      zoneCopy={AGU_ZONE_COPY}
      actions={actions}
    />
  );
}
