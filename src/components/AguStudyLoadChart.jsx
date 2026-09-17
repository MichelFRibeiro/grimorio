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
import { getAguStudyLoadSeries } from '../utils/aguCycle';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const ZONE_META = {
  homeostasis: {
    label: 'Homeostase',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.35)',
    copy: 'Carga sustentável em torno das 3H. O organismo absorve o treino e devolve consistência.'
  },
  'allostasis-under': {
    label: 'Alostase · subcarga',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    copy: 'Abaixo da faixa 3H. O sistema ainda não encontrou o ritmo — dívida de treino, não descanso estratégico.'
  },
  'allostasis-over': {
    label: 'Alostase · sobrecarga',
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    copy: 'Acima da faixa 3H. Adaptação vira desgaste: o treino deixa de ser estímulo e vira carga alostática.'
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

export function AguStudyLoadChart({
  aguPlan,
  examQuestions,
  todayStr,
  liveMinutes = 0,
  days = 14
}) {
  const series = useMemo(() => {
    const extra = liveMinutes > 0 && todayStr ? { [todayStr]: liveMinutes } : {};
    return getAguStudyLoadSeries(aguPlan, examQuestions || [], todayStr, {
      days,
      extraMinutesByDate: extra
    });
  }, [aguPlan, examQuestions, todayStr, liveMinutes, days]);

  const todayPoint = series.today;
  const todayZone = ZONE_META[todayPoint?.zone] || ZONE_META['allostasis-under'];
  const peakHours = Math.max(
    series.homeostasisMaxHours + 2,
    ...series.points.map((point) => point.hours),
    6
  );
  const yMax = Math.ceil(peakHours);

  const chartData = useMemo(() => {
    const labels = series.points.map((point) => shortDate(point.dateStr));
    const hours = series.points.map((point) => point.hours);
    const floor = series.points.map(() => series.homeostasisMinHours);
    const ceiling = series.points.map(() => series.homeostasisMaxHours);
    const target = series.points.map(() => series.targetHours);
    const roof = series.points.map(() => yMax);

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
          label: 'Meta 3H',
          data: target,
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
          label: 'Horas AGU',
          data: hours,
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251, 191, 36, 0.08)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: false,
          pointRadius: series.points.map((point) => (point.isToday ? 6 : 4)),
          pointHoverRadius: 7,
          pointBackgroundColor: series.points.map((point) => zonePointColor(point.zone, point.isToday)),
          pointBorderColor: series.points.map((point) => (point.isToday ? '#fde68a' : zonePointColor(point.zone, false))),
          pointBorderWidth: series.points.map((point) => (point.isToday ? 2 : 1)),
          order: 1
        }
      ]
    };
  }, [series, yMax]);

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
            const point = series.points[idx];
            return point ? `${shortDate(point.dateStr)}${point.isToday ? ' · hoje' : ''}` : '';
          },
          label: (item) => {
            if (item.dataset.label !== 'Horas AGU') return null;
            const point = series.points[item.dataIndex];
            if (!point) return '';
            const zone = ZONE_META[point.zone];
            return `${formatStudyDuration(point.minutes)} · ${zone.label}`;
          },
          filter: (item) => item.dataset.label === 'Horas AGU'
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
          stepSize: 1,
          callback: (value) => `${value}h`
        }
      }
    }
  }), [series, yMax]);

  const homeostasisRatio = series.points.length
    ? Math.round((series.homeostasisDays / series.points.length) * 100)
    : 0;

  return (
    <section className="glass-panel-gold agu-load-chart" style={{ padding: '18px 20px', marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} color="#fbbf24" />
            <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#fbbf24' }}>
              Carga 3H — Homeostase & Alostase
            </h3>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '6px', maxWidth: '640px' }}>
            A faixa verde é o equilíbrio do protocolo AGU: 3 blocos de 60 min, com folga de 2h a 4h.
            Fora dela o treino vira alostase — subcarga (dívida) ou sobrecarga (desgaste).
          </p>
        </div>
        <div
          className="rpg-card"
          style={{
            padding: '10px 14px',
            minWidth: '132px',
            textAlign: 'center',
            borderColor: `${todayZone.color}55`,
            boxShadow: `0 0 18px ${todayZone.glow}`
          }}
        >
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Hoje
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.55rem', color: '#fbbf24', lineHeight: 1.1, margin: '4px 0' }}>
            3H
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
          ? `Hoje: ${formatStudyDuration(todayPoint.minutes)} (${todayPoint.hours}h). ${todayZone.copy}`
          : todayZone.copy}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginTop: '14px' }}>
        <div className="rpg-card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Média {days}d</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
            {series.avgHours}h
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
