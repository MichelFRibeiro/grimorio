import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Activity, Flame, ShieldAlert } from 'lucide-react';
import { formatStudyDuration } from '../utils/activityDuration';
import { HOMEOSTASIS_WINDOW_DAYS } from '../utils/homeostasis';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const DEFAULT_ZONE_META = {
  homeostasis: {
    label: 'Homeostase',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.35)',
    copy: 'Dentro da faixa dos dias em que houve sessão (±20%, sem descer do piso). O ritmo atual está sendo absorvido.'
  },
  'allostasis-under': {
    label: 'Alostase · subcarga',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    copy: 'Abaixo da média recente. Queda em relação ao que o organismo já vinha sustentando.'
  },
  'allostasis-over': {
    label: 'Alostase · sobrecarga',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    copy: 'Acima da média recente. O treino passou do ritmo que vinha sendo sustentado.'
  }
};

function shortDate(dateStr) {
  if (!dateStr) return '';
  const [, month, day] = dateStr.split('-');
  return `${day}/${month}`;
}

function zonePointColor(zone, isToday) {
  if (zone === 'homeostasis') return isToday ? '#34d399' : '#10b981';
  return isToday ? '#fb7185' : '#f43f5e';
}

function yTickStep(maxMinutes) {
  if (maxMinutes <= 30) return 5;
  if (maxMinutes <= 90) return 15;
  if (maxMinutes <= 180) return 30;
  if (maxMinutes <= 360) return 60;
  return 120;
}

export function HomeostasisLoadChart({
  series,
  days = HOMEOSTASIS_WINDOW_DAYS,
  title = 'Carga real — Homeostase & Alostase',
  description,
  seriesLabel = 'Tempo',
  accentColor = '#fbbf24',
  zoneCopy = DEFAULT_ZONE_META,
  actions = null
}) {
  const todayPoint = series?.today;
  const todayZone = zoneCopy[todayPoint?.zone] || zoneCopy['allostasis-under'] || DEFAULT_ZONE_META['allostasis-under'];
  const peakMinutes = Math.max(
    (series?.homeostasisMaxMinutes || 0) * 1.35,
    ...(series?.points || []).map((point) => point.minutes),
    20
  );
  const step = yTickStep(peakMinutes);
  const yMax = Math.max(step, Math.ceil(peakMinutes / step) * step);

  const chartData = useMemo(() => {
    const points = series?.points || [];
    const labels = points.map((point) => shortDate(point.dateStr));
    const minutes = points.map((point) => point.minutes);
    const floor = points.map(() => series.homeostasisMinMinutes);
    const ceiling = points.map(() => series.homeostasisMaxMinutes);
    const center = points.map(() => series.avgMinutes);
    const roof = points.map(() => yMax);

    return {
      labels,
      datasets: [
        {
          label: 'Alostase (acima)',
          data: roof,
          borderColor: 'transparent',
          backgroundColor: 'rgba(244, 63, 94, 0.14)',
          fill: 1,
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 4
        },
        {
          label: 'Teto da homeostase',
          data: ceiling,
          borderColor: 'rgba(16, 185, 129, 0.85)',
          backgroundColor: 'rgba(16, 185, 129, 0.16)',
          borderWidth: 1.5,
          borderDash: [7, 5],
          fill: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 3
        },
        {
          label: 'Piso da homeostase',
          data: floor,
          borderColor: 'rgba(16, 185, 129, 0.85)',
          backgroundColor: 'rgba(244, 63, 94, 0.16)',
          borderWidth: 1.5,
          borderDash: [7, 5],
          fill: 'origin',
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 3
        },
        {
          label: `Média ${days}d`,
          data: center,
          borderColor: 'rgba(251, 191, 36, 0.55)',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderDash: [2, 6],
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 2
        },
        {
          label: seriesLabel,
          data: minutes,
          borderColor: accentColor,
          backgroundColor: `${accentColor}14`,
          borderWidth: 2.5,
          tension: 0.35,
          fill: false,
          pointRadius: points.map((point) => (point.isToday ? 6 : 4)),
          pointHoverRadius: 7,
          pointBackgroundColor: points.map((point) => zonePointColor(point.zone, point.isToday)),
          pointBorderColor: points.map((point) => (point.isToday ? '#fde68a' : zonePointColor(point.zone, false))),
          pointBorderWidth: points.map((point) => (point.isToday ? 2 : 1)),
          order: 1
        }
      ]
    };
  }, [series, yMax, days, seriesLabel, accentColor]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(12, 14, 20, 0.94)',
        borderColor: 'rgba(245, 158, 11, 0.35)',
        borderWidth: 1,
        titleColor: '#fde68a',
        bodyColor: '#e2e8f0',
        padding: 10,
        callbacks: {
          title: (items) => {
            const idx = items[0]?.dataIndex;
            const point = series?.points?.[idx];
            return point ? `${shortDate(point.dateStr)}${point.isToday ? ' · hoje' : ''}` : '';
          },
          label: (item) => {
            if (item.dataset.label !== seriesLabel) return null;
            const point = series?.points?.[item.dataIndex];
            if (!point) return '';
            const zone = zoneCopy[point.zone] || DEFAULT_ZONE_META[point.zone];
            return `${formatStudyDuration(point.minutes)} · ${zone.label}`;
          },
          filter: (item) => item.dataset.label === seriesLabel
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 0 }
      },
      y: {
        min: 0,
        max: yMax,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#94a3b8',
          stepSize: step,
          callback: (value) => formatStudyDuration(value)
        }
      }
    }
  }), [series, yMax, step, seriesLabel, zoneCopy]);

  if (!series) return null;

  const homeostasisRatio = series.points.length
    ? Math.round((series.homeostasisDays / series.points.length) * 100)
    : 0;

  return (
    <section className="glass-panel-gold agu-load-chart" style={{ padding: '18px 20px', marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} color={accentColor} />
            <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: accentColor }}>
              {title}
            </h3>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '6px', maxWidth: '640px' }}>
            {description || `A faixa verde sai da média dos dias com sessão nos últimos ${days} dias: teto +20%, piso −20% ou o piso absoluto, o que for maior. Dia vazio não puxa a média — conta só como subcarga.`}
          </p>
          {actions}
        </div>
        <div
          className="rpg-card"
          style={{
            padding: '10px 14px',
            minWidth: '148px',
            textAlign: 'center',
            borderColor: `${todayZone.color}55`,
            boxShadow: `0 0 18px ${todayZone.glow}`
          }}
        >
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Faixa de hoje
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', color: accentColor, lineHeight: 1.2, margin: '4px 0' }}>
            {formatStudyDuration(series.homeostasisMinMinutes)}–{formatStudyDuration(series.homeostasisMaxMinutes)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '4px' }}>
            centro {formatStudyDuration(series.avgMinutes)}
          </div>
          <div style={{ fontSize: '0.78rem', color: todayZone.color, fontWeight: 800 }}>
            {todayZone.label}
          </div>
        </div>
      </div>

      <div className="agu-load-chart-frame">
        <div className="agu-load-chart-side agu-load-chart-side--over">ALOSTASE</div>
        <div className="agu-load-chart-canvas">
          <div className="agu-load-chart-band-label agu-load-chart-band-label--home">HOMEOSTASE</div>
          <Line data={chartData} options={chartOptions} />
        </div>
        <div className="agu-load-chart-side agu-load-chart-side--under">ALOSTASE</div>
      </div>

      <p style={{ color: '#cbd5e1', fontSize: '0.82rem', marginTop: '12px', lineHeight: 1.45 }}>
        {todayPoint
          ? `Hoje: ${formatStudyDuration(todayPoint.minutes)}. ${todayZone.copy}`
          : todayZone.copy}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginTop: '14px' }}>
        <div className="rpg-card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Média {series.activeDays ?? days}d ativos
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: accentColor, fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
            {formatStudyDuration(series.avgMinutes)}
          </div>
        </div>
        <div className="rpg-card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <Flame size={12} color="#10b981" /> Homeostase
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
            {series.homeostasisDays}d · {homeostasisRatio}%
          </div>
        </div>
        <div className="rpg-card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <ShieldAlert size={12} color="#f43f5e" /> Alostase
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fb7185', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
            {series.allostasisDays}d
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
            {series.allostasisUnderDays} sub · {series.allostasisOverDays} sobre
          </div>
        </div>
      </div>
    </section>
  );
}
