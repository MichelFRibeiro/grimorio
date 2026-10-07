import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatPhoneDuration } from '../utils/phoneTime';
import { formatStudyDuration } from '../utils/activityDuration';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const PHONE_COLOR = '#38bdf8';
const COUNT_COLOR = '#fbbf24';
const WORK_COLOR = '#34d399';

function formatCount(value) {
  const n = Number(value) || 0;
  return `${n} ${n === 1 ? 'atividade' : 'atividades'}`;
}

export function PhoneTimeChart({ series }) {
  const points = series?.points || [];

  const chartData = useMemo(() => ({
    labels: points.map((point) => point.label),
    datasets: [
      {
        label: 'Tempo no celular',
        yAxisID: 'minutes',
        data: points.map((point) => (point.phoneLogged ? point.phoneMinutes : null)),
        borderColor: PHONE_COLOR,
        backgroundColor: PHONE_COLOR,
        borderWidth: 2.5,
        tension: 0.32,
        spanGaps: false,
        pointRadius: points.map((point) => (point.isYesterday ? 6 : 3.5)),
        pointHoverRadius: 6,
        pointBackgroundColor: PHONE_COLOR
      },
      {
        label: 'Atividades realizadas',
        yAxisID: 'count',
        data: points.map((point) => point.activityCount),
        borderColor: COUNT_COLOR,
        backgroundColor: COUNT_COLOR,
        borderWidth: 2.5,
        tension: 0.32,
        pointRadius: points.map((point) => (point.isYesterday ? 6 : 3.5)),
        pointHoverRadius: 6,
        pointBackgroundColor: COUNT_COLOR
      },
      {
        label: 'Tempo produtivo',
        yAxisID: 'minutes',
        data: points.map((point) => point.productiveMinutes),
        borderColor: WORK_COLOR,
        backgroundColor: WORK_COLOR,
        borderWidth: 2.5,
        tension: 0.32,
        pointRadius: points.map((point) => (point.isYesterday ? 6 : 3.5)),
        pointHoverRadius: 6,
        pointBackgroundColor: WORK_COLOR
      }
    ]
  }), [points]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(12, 14, 20, 0.94)',
        borderColor: 'rgba(56, 189, 248, 0.35)',
        borderWidth: 1,
        titleColor: '#e0f2fe',
        bodyColor: '#e2e8f0',
        padding: 10,
        callbacks: {
          title: (items) => {
            const point = points[items[0]?.dataIndex];
            if (!point) return '';
            const mark = point.isToday ? ' · hoje' : point.isYesterday ? ' · ontem' : '';
            return `${point.label}${mark}`;
          },
          label: (item) => {
            const point = points[item.dataIndex];
            if (!point) return '';
            if (item.dataset.yAxisID === 'count') return `Atividades: ${formatCount(item.parsed.y)}`;
            if (item.dataset.label === 'Tempo no celular') {
              if (!point.phoneLogged) return 'Celular: sem registro';
              return `Celular: ${formatPhoneDuration(item.parsed.y)}`;
            }
            return `Produtivo: ${formatStudyDuration(item.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
      },
      minutes: {
        type: 'linear',
        position: 'left',
        min: 0,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        title: { display: true, text: 'Tempo', color: '#94a3b8', font: { size: 11 } },
        ticks: {
          color: '#94a3b8',
          callback: (value) => formatStudyDuration(value)
        }
      },
      count: {
        type: 'linear',
        position: 'right',
        min: 0,
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Quantidade', color: '#fbbf24', font: { size: 11 } },
        ticks: {
          color: '#fbbf24',
          precision: 0,
          stepSize: 1
        }
      }
    }
  }), [points]);

  return (
    <div>
      <div className="phone-time-legend">
        <span><i style={{ background: PHONE_COLOR }} /> Tempo no celular</span>
        <span><i style={{ background: COUNT_COLOR }} /> Atividades realizadas</span>
        <span><i style={{ background: WORK_COLOR }} /> Tempo produtivo</span>
      </div>
      <div className="phone-time-chart-canvas">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
