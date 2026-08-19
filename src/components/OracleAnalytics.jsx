import React, { useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Compass,
  Clock,
  Calendar,
  BookOpen,
  Sparkles,
  ShieldAlert,
  Layers,
  Download,
  Upload,
  History,
  TrendingUp,
  CheckCircle2,
  Brain,
  Target,
  Award,
  Filter,
  Trophy,
  Shield,
  Zap,
  Flame,
  Info,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

export function OracleAnalytics({ analytics, actionLogs, onRefresh }) {
  const fileInputRef = useRef(null);
  const [selectedHorizon, setSelectedHorizon] = useState('total'); // 'day' | 'week' | 'month' | 'year' | 'total'
  const [rankingTab, setRankingTab] = useState('categories'); // 'categories' | 'tiers'

  if (!analytics) {
    return (
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        <Compass size={40} style={{ margin: '0 auto 12px auto' }} />
        <p>Calculando padrões comportamentais do Grimório...</p>
      </div>
    );
  }

  // 1. Hourly Chart Data
  const hourlyLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`);
  const hourlyData = {
    labels: hourlyLabels,
    datasets: [
      {
        label: 'Ações Concluídas por Horário',
        data: analytics.hourlyCount || Array(24).fill(0),
        backgroundColor: 'rgba(245, 158, 11, 0.65)',
        borderColor: '#f59e0b',
        borderWidth: 1,
        borderRadius: 6
      }
    ]
  };

  const hourlyOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => `${item.raw} ações concluídas`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8', precision: 0 }
      }
    }
  };

  // 2. Weekday Chart Data
  const weekdayData = {
    labels: analytics.dayNames || ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
    datasets: [
      {
        label: 'Produtividade por Dia da Semana',
        data: analytics.dayCounts || Array(7).fill(0),
        backgroundColor: 'rgba(56, 189, 248, 0.65)',
        borderColor: '#38bdf8',
        borderWidth: 1,
        borderRadius: 6
      }
    ]
  };

  const weekdayOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8' }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8', precision: 0 }
      }
    }
  };

  // 3. Category Doughnut Data
  const catEntries = Object.entries(analytics.categoryCounts || {});
  const catColors = ['#f59e0b', '#38bdf8', '#10b981', '#a855f7', '#f43f5e', '#06b6d4', '#eab308'];
  const categoryData = {
    labels: catEntries.map(([k]) => k),
    datasets: [
      {
        data: catEntries.map(([, v]) => v),
        backgroundColor: catColors.slice(0, catEntries.length),
        borderWidth: 0
      }
    ]
  };

  // 4. Questions Daily History Chart (Last 14 Days)
  const questionHistory = analytics.questionDailyHistory || [];
  const questionHistoryData = {
    labels: questionHistory.map(h => h.label),
    datasets: [
      {
        label: 'Questões Acertadas',
        data: questionHistory.map(h => h.totalCorrect),
        backgroundColor: 'rgba(16, 185, 129, 0.75)',
        borderColor: '#10b981',
        borderWidth: 1,
        borderRadius: 4
      },
      {
        label: 'Questões Erradas',
        data: questionHistory.map(h => h.totalWrong),
        backgroundColor: 'rgba(244, 63, 94, 0.65)',
        borderColor: '#f43f5e',
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  const questionHistoryOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { color: '#94a3b8', font: { size: 11 } }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      },
      y: {
        stacked: true,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8', precision: 0 }
      }
    }
  };

  const handleExportBackup = () => {
    window.location.href = '/api/backup/export';
  };

  const handleImportBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json)
      });
      if (res.ok) {
        alert('Backup restaurado com sucesso!');
        onRefresh();
      } else {
        alert('Erro ao restaurar backup.');
      }
    } catch (err) {
      alert('Arquivo de backup inválido: ' + err.message);
    }
  };

  const horizons = analytics.questionHorizons || {
    day: { totalSolved: 0, totalCorrect: 0, totalWrong: 0, accuracyRate: 0, sessionsCount: 0, totalDurationMinutes: 0, label: 'Hoje' },
    week: { totalSolved: 0, totalCorrect: 0, totalWrong: 0, accuracyRate: 0, sessionsCount: 0, totalDurationMinutes: 0, label: 'Esta Semana' },
    month: { totalSolved: 0, totalCorrect: 0, totalWrong: 0, accuracyRate: 0, sessionsCount: 0, totalDurationMinutes: 0, label: 'Este Mês' },
    year: { totalSolved: 0, totalCorrect: 0, totalWrong: 0, accuracyRate: 0, sessionsCount: 0, totalDurationMinutes: 0, label: 'Este Ano' },
    total: { totalSolved: 0, totalCorrect: 0, totalWrong: 0, accuracyRate: 0, sessionsCount: 0, totalDurationMinutes: 0, label: 'Todo o Histórico' }
  };

  const activeHorizonData = horizons[selectedHorizon] || horizons.total;

  const getAccuracyColor = (rate) => {
    if (rate >= 80) return '#10b981';
    if (rate >= 65) return '#f59e0b';
    return '#f43f5e';
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🔮</span> Oráculo de Análises & Padrões Comportamentais
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            O Oráculo estuda seus registros históricos para revelar suas janelas de pico, velocidade de leitura, taxa de acerto em concursos e hábitos de foco.
          </p>
        </div>

        {/* Backup Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleExportBackup}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Download size={14} /> Exportar Backup JSON
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportBackup}
            accept=".json"
            style={{ display: 'none' }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#94a3b8',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Upload size={14} /> Importar
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Top Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        
        {/* Questões de Concurso KPI */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <Target size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Questões Feitas</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
              {horizons.total.totalSolved} <span style={{ fontSize: '0.85rem', color: getAccuracyColor(horizons.total.accuracyRate) }}>({horizons.total.accuracyRate}%)</span>
            </div>
          </div>
        </div>

        {/* Missões Concluídas */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Missões Concluídas</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
              {analytics.summary?.totalQuestsCompleted || 0}
            </div>
          </div>
        </div>

        {/* Páginas Lidas */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
            <BookOpen size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Páginas Lidas</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
              {analytics.totalPagesRead || 0} págs
            </div>
          </div>
        </div>

        {/* Pico Produtivo */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
            <Clock size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Pico Produtivo</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#c084fc' }}>
              {analytics.peakWindow}
            </div>
          </div>
        </div>

      </div>

      {/* SECTION: TRIBUNAL DOS RANKINGS & MAESTRIA DE CATEGORIAS */}
      {analytics.rankings && (
        <div
          className="glass-panel"
          style={{
            padding: '24px',
            marginBottom: '26px',
            border: `1px solid ${analytics.rankings.overall?.rank?.border || 'rgba(245, 158, 11, 0.4)'}`,
            background: 'rgba(18, 22, 34, 0.9)',
            boxShadow: `0 0 25px ${analytics.rankings.overall?.rank?.glow || 'rgba(0,0,0,0.3)'}`
          }}
        >
          {/* Section Header */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginBottom: '20px' }}>
            <div>
              <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Trophy size={24} color={analytics.rankings.overall?.rank?.color || '#fbbf24'} /> Tribunal dos Rankings & Maestria de Categorias
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '2px' }}>
                Ciclo semanal de <strong>Domingo a Sábado</strong>. O ranking sobe com o XP semanal e decai <strong>1 nível por semana</strong> com produção insuficiente.
              </p>
            </div>

            {/* Tab Selector */}
            <div
              style={{
                padding: '4px',
                borderRadius: '10px',
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'inline-flex',
                gap: '4px'
              }}
            >
              <button
                onClick={() => setRankingTab('categories')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: rankingTab === 'categories' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'transparent',
                  color: rankingTab === 'categories' ? '#000' : '#94a3b8',
                  fontWeight: rankingTab === 'categories' ? 800 : 600,
                  fontSize: '0.82rem',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                📊 Rankings por Categoria
              </button>

              <button
                onClick={() => setRankingTab('tiers')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: rankingTab === 'tiers' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'transparent',
                  color: rankingTab === 'tiers' ? '#000' : '#94a3b8',
                  fontWeight: rankingTab === 'tiers' ? 800 : 600,
                  fontSize: '0.82rem',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                📜 Tabela de Faixas (E a S+)
              </button>
            </div>
          </div>

          {/* Hero Card - Overall User Ranking */}
          <div
            style={{
              padding: '20px 24px',
              borderRadius: '16px',
              background: analytics.rankings.overall?.rank?.bg || 'rgba(245, 158, 11, 0.12)',
              border: `1px solid ${analytics.rankings.overall?.rank?.border || 'rgba(245, 158, 11, 0.35)'}`,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px',
              marginBottom: '24px'
            }}
          >
            {/* Rank Identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  background: 'rgba(0,0,0,0.4)',
                  border: `2px solid ${analytics.rankings.overall?.rank?.border || '#fbbf24'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.8rem',
                  fontWeight: 900,
                  color: analytics.rankings.overall?.rank?.textColor || '#fbbf24',
                  boxShadow: `0 0 18px ${analytics.rankings.overall?.rank?.glow || 'rgba(245, 158, 11, 0.3)'}`
                }}
              >
                {analytics.rankings.overall?.rank?.name || 'E'}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                    Ranking Geral do Usuário
                  </span>
                  <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#cbd5e1', fontWeight: 700 }}>
                    Média de {analytics.rankings.overall?.totalCategories || 0} categorias
                  </span>
                </div>

                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>Tier {analytics.rankings.overall?.rank?.name}</span>
                  <span style={{ fontSize: '1rem', color: analytics.rankings.overall?.rank?.color || '#fbbf24', fontWeight: 700 }}>
                    • {analytics.rankings.overall?.rank?.title}
                  </span>
                </div>

                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                  {analytics.rankings.overall?.rank?.description}
                </p>
              </div>
            </div>

            {/* Stats Metrics */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '10px 16px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Pontuação Média</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                  {analytics.rankings.overall?.avgScore || 0} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>/ 10</span>
                </div>
              </div>

              <div style={{ padding: '10px 16px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>XP Semanal Total</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                  +{analytics.rankings.overall?.totalWeeklyXp || 0} XP
                </div>
              </div>

              <div style={{ padding: '10px 16px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.7rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} /> Fechamento Semanal
                </span>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc' }}>
                  {analytics.rankings.currentWeek?.countdownLabel || 'Sábado às 23:59'}
                </div>
              </div>
            </div>
          </div>

          {/* TAB 1: Categories Cards Grid */}
          {rankingTab === 'categories' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '16px' }}>
                {(analytics.rankings.categoriesList || []).map(catRank => {
                  const rank = catRank.currentRank;
                  const status = catRank.status;

                  return (
                    <div
                      key={catRank.category.name}
                      style={{
                        padding: '18px',
                        borderRadius: '14px',
                        background: 'rgba(255, 255, 255, 0.025)',
                        border: `1px solid ${rank.border ? `${rank.border}40` : 'rgba(255, 255, 255, 0.08)'}`,
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Top Row: Category Name + Rank Badge */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span
                              style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: catRank.category.color || '#38bdf8',
                                boxShadow: `0 0 10px ${catRank.category.color || '#38bdf8'}`
                              }}
                            />
                            <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                              {catRank.category.name}
                            </h4>
                          </div>
                          <span style={{ fontSize: '0.78rem', color: rank.color, fontWeight: 700 }}>
                            {rank.title}
                          </span>
                        </div>

                        {/* Big Rank Badge */}
                        <div
                          style={{
                            padding: '8px 16px',
                            borderRadius: '12px',
                            background: rank.bg,
                            border: `2px solid ${rank.border}`,
                            color: rank.textColor,
                            fontWeight: 900,
                            fontSize: '1.25rem',
                            textAlign: 'center',
                            boxShadow: `0 0 12px ${rank.glow}`
                          }}
                          title={`Tier ${rank.name} • Mínimo para manter: ${catRank.maintainMinXp} XP`}
                        >
                          {rank.name}
                        </div>
                      </div>

                      {/* Middle: Weekly XP & Progress */}
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginBottom: '6px' }}>
                          <span style={{ color: '#94a3b8' }}>
                            XP nesta semana: <strong style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>{catRank.weeklyXp} XP</strong>
                          </span>
                          <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>
                            {catRank.nextRank ? `Meta Tier ${catRank.nextRank.name}: ${catRank.nextRankMinXp} XP` : 'Tier Máximo!'}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="progress-container" style={{ height: '8px', background: 'rgba(0,0,0,0.4)' }}>
                          <div
                            style={{
                              width: `${catRank.progressPercent}%`,
                              height: '100%',
                              background: rank.border,
                              borderRadius: '999px',
                              transition: 'width 0.4s ease'
                            }}
                          />
                        </div>

                        {/* Status Note */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                          {status === 'promoted' && (
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 800, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                              ⚡ Promovido esta semana!
                            </span>
                          )}
                          {status === 'at_risk' && (
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontWeight: 800, border: '1px solid rgba(245, 158, 11, 0.3)' }} title={`Faltam ${catRank.xpNeededToMaintain} XP para não cair`}>
                              ⚠️ Risco de Queda (-1 Rank no domingo)
                            </span>
                          )}
                          {status === 'maintained' && (
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 800, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                              🛡️ Nível Garantido
                            </span>
                          )}

                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {catRank.nextRank && catRank.xpNeededForNextRank > 0 ? (
                              `+${catRank.xpNeededForNextRank} XP para subir`
                            ) : (
                              'Nível máximo atingido'
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Historical Evolution Badges */}
                      {catRank.history && catRank.history.length > 1 && (
                        <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                            Evolução Semanal Recente
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                            {catRank.history.map((h, hIdx) => (
                              <div
                                key={h.weekKey}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '0.72rem',
                                  padding: '2px 6px',
                                  borderRadius: '6px',
                                  background: h.isClosed ? 'rgba(255, 255, 255, 0.04)' : 'rgba(245, 158, 11, 0.15)',
                                  border: h.isClosed ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(245, 158, 11, 0.35)',
                                  color: h.isClosed ? '#cbd5e1' : '#fbbf24',
                                  fontWeight: 700
                                }}
                                title={`${h.weekLabel}: ${h.xp} XP gerados -> Rank ${h.rank}`}
                              >
                                <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>{h.shortLabel}:</span>
                                <span>{h.rank}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: 11-Tiers Reference Guide Table */}
          {rankingTab === 'tiers' && (
            <div style={{ padding: '10px', borderRadius: '14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ marginBottom: '14px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                <p style={{ fontSize: '0.85rem', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
                  ℹ️ <strong>Como funcionam as 11 Faixas de Ranking:</strong> O ranking de cada categoria é calculado com base no XP semanal gerado entre Domingo e Sábado. Ao atingir o XP da faixa, você sobe imediatamente de tier. Caso passe uma semana inteira sem produzir o XP mínimo para manter seu nível, aquela categoria <strong>cai 1 nível</strong> no domingo subsequente (decaimento gradual, sem queda abrupta).
                </p>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: '#94a3b8' }}>
                      <th style={{ padding: '10px 14px' }}>Tier</th>
                      <th style={{ padding: '10px 14px' }}>Faixa de XP Semanal</th>
                      <th style={{ padding: '10px 14px' }}>Título de Prestígio</th>
                      <th style={{ padding: '10px 14px' }}>Rendimento Esperado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics.rankings.tiers || []).map((t, idx) => (
                      <tr
                        key={t.name}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: t.bg,
                              color: t.textColor,
                              border: `1px solid ${t.border}`,
                              fontWeight: 900,
                              fontSize: '0.88rem'
                            }}
                          >
                            {t.name}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f8fafc' }}>
                          {t.maxXp === Infinity || !t.maxXp ? `${t.minXp}+ XP` : `${t.minXp} - ${t.maxXp} XP`}
                        </td>
                        <td style={{ padding: '10px 14px', color: t.color, fontWeight: 700 }}>
                          {t.title}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                          {t.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION: CONCURSO QUESTIONS ORACLE MONITORING (5 TIME HORIZONS) */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          marginBottom: '26px',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          background: 'rgba(23, 22, 18, 0.85)'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginBottom: '20px' }}>
          <div>
            <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={22} color="#fbbf24" /> Painel do Concurseiro: Monitoramento de Questões
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              Monitore a quantidade de questões feitas e acertadas no dia, na semana, no mês, no ano e em todo o histórico.
            </p>
          </div>

          {/* 5 Horizons Selector Buttons */}
          <div
            style={{
              padding: '4px',
              borderRadius: '10px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'inline-flex',
              gap: '4px'
            }}
          >
            {[
              { id: 'day', label: 'Hoje' },
              { id: 'week', label: 'Semana' },
              { id: 'month', label: 'Mês' },
              { id: 'year', label: 'Ano' },
              { id: 'total', label: 'Total Geral' }
            ].map(tab => {
              const isActive = selectedHorizon === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedHorizon(tab.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: isActive ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'transparent',
                    color: isActive ? '#000' : '#94a3b8',
                    fontWeight: isActive ? 800 : 600,
                    fontSize: '0.82rem',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Horizon Metrics Spotlight */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '22px' }}>
          
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Questões Feitas ({activeHorizonData.label})</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f8fafc', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
              {activeHorizonData.totalSolved}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{activeHorizonData.sessionsCount} baterias realizadas</span>
          </div>

          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            <span style={{ fontSize: '0.72rem', color: '#34d399', textTransform: 'uppercase', fontWeight: 700 }}>Questões Acertadas</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#34d399', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
              {activeHorizonData.totalCorrect}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#34d399' }}>{activeHorizonData.totalSolved > 0 ? `${activeHorizonData.totalSolved - activeHorizonData.totalCorrect} erradas` : 'Sem erros'}</span>
          </div>

          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
            <span style={{ fontSize: '0.72rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 700 }}>Taxa de Precisão / Acerto</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: getAccuracyColor(activeHorizonData.accuracyRate), fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
              {activeHorizonData.accuracyRate}%
            </div>
            <div className="progress-container" style={{ height: '6px', marginTop: '4px' }}>
              <div
                style={{
                  width: `${activeHorizonData.accuracyRate}%`,
                  height: '100%',
                  background: getAccuracyColor(activeHorizonData.accuracyRate),
                  borderRadius: '999px',
                  transition: 'width 0.4s ease'
                }}
              />
            </div>
          </div>

          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
            <span style={{ fontSize: '0.72rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>Tempo Dedicado</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
              {activeHorizonData.totalDurationMinutes > 0 ? `${Math.round(activeHorizonData.totalDurationMinutes / 60 * 10) / 10}h` : '0 min'}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>+{activeHorizonData.totalXp || 0} XP conquistados</span>
          </div>

        </div>

        {/* 5-Horizons Side-by-Side Comparison Strip */}
        <div style={{ marginBottom: '22px' }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '8px' }}>
            Comparativo nos 5 Horizontes Temporais (Feitas / Acertadas)
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
            {[
              { key: 'day', label: 'Hoje', data: horizons.day, border: '#38bdf8' },
              { key: 'week', label: 'Semana', data: horizons.week, border: '#10b981' },
              { key: 'month', label: 'Mês', data: horizons.month, border: '#fbbf24' },
              { key: 'year', label: 'Ano', data: horizons.year, border: '#a855f7' },
              { key: 'total', label: 'Total Histórico', data: horizons.total, border: '#f43f5e' }
            ].map(h => (
              <div
                key={h.key}
                onClick={() => setSelectedHorizon(h.key)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: selectedHorizon === h.key ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  border: selectedHorizon === h.key ? `2px solid ${h.border}` : '1px solid rgba(255, 255, 255, 0.06)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f8fafc' }}>{h.label}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 900, color: getAccuracyColor(h.data.accuracyRate) }}>
                    {h.data.accuracyRate}%
                  </span>
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                  {h.data.totalCorrect} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>/ {h.data.totalSolved}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Questions Charts Grid: 14 Days History + Subject Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          
          {/* Daily Evolution Chart */}
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <TrendingUp size={15} color="#10b981" /> Evolução de Questões (Últimos 14 Dias)
            </h4>
            <div style={{ height: '190px', position: 'relative' }}>
              <Bar data={questionHistoryData} options={questionHistoryOptions} />
            </div>
          </div>

          {/* Ranking por Disciplina */}
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <Award size={15} color="#fbbf24" /> Aproveitamento por Disciplina
            </h4>

            {(!analytics.subjectStats || analytics.subjectStats.length === 0) ? (
              <p style={{ fontSize: '0.82rem', color: '#64748b', textAlign: 'center', paddingTop: '40px' }}>
                Nenhuma questão registrada ainda para gerar o ranking por matéria.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '190px', overflowY: 'auto', paddingRight: '4px' }}>
                {analytics.subjectStats.slice(0, 6).map(s => {
                  const color = getAccuracyColor(s.accuracyRate);
                  return (
                    <div
                      key={s.subject}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, color: '#f8fafc' }}>{s.subject}</span>
                        <span style={{ fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>
                          {s.totalCorrect}/{s.totalSolved} ({s.accuracyRate}%)
                        </span>
                      </div>
                      <div className="progress-container" style={{ height: '4px' }}>
                        <div style={{ width: `${s.accuracyRate}%`, height: '100%', background: color, borderRadius: '999px' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Behavioral Insights Cards (Oracle Wisdom) */}
      <div style={{ marginBottom: '24px' }}>
        <h3 className="font-cinzel" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Sparkles size={18} color="#fbbf24" /> Revelações do Oráculo de Comportamento
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
          {(analytics.insights || []).map((ins, idx) => (
            <div
              key={idx}
              className="glass-panel"
              style={{
                padding: '18px 20px',
                borderLeft: '4px solid #f59e0b',
                background: 'rgba(19, 23, 34, 0.85)'
              }}
            >
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {ins.title}
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5 }}>
                {ins.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* General Productivity Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        
        {/* Hourly Productivity Chart */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} color="#fbbf24" /> Distribuição de Produtividade por Horário (0h - 23h)
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 700 }}>
              Pico: {analytics.peakWindow}
            </span>
          </div>
          <div style={{ height: '220px', position: 'relative' }}>
            <Bar data={hourlyData} options={hourlyOptions} />
          </div>
        </div>

        {/* Day of Week Chart */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={16} color="#38bdf8" /> Ritmo de Conclusões por Dia da Semana
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>
              Melhor dia: {analytics.bestDay}
            </span>
          </div>
          <div style={{ height: '220px', position: 'relative' }}>
            <Bar data={weekdayData} options={weekdayOptions} />
          </div>
        </div>

      </div>

      {/* Reading Projections & Categories Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        
        {/* Reading Pace Projections */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <BookOpen size={16} /> Projeções de Leitura em Andamento
          </h3>

          {(!analytics.bookProjections || analytics.bookProjections.length === 0) ? (
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Nenhum livro em andamento no momento.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {analytics.bookProjections.map(proj => (
                <div
                  key={proj.bookId}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>{proj.title}</span>
                    <span style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 800 }}>{proj.percent}%</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Faltam {proj.remainingPages} páginas</span>
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>Previsão: ~{proj.estimatedDays} sessões (~{proj.estimatedHours}h)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Categories Distribution */}
        {catEntries.length > 0 && (
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <TrendingUp size={16} color="#c084fc" /> Concentração por Categoria
            </h3>
            <div style={{ height: '180px', position: 'relative' }}>
              <Doughnut
                data={categoryData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } }
                  }
                }}
              />
            </div>
          </div>
        )}

      </div>

      {/* Master Action Log Timeline */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 className="font-cinzel" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <History size={18} color="#fbbf24" /> Linha do Tempo das Ações Realizadas
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
          {(actionLogs || []).slice(0, 15).map(log => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                fontSize: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.1rem' }}>
                  {log.type === 'quest_complete' ? '📜' : log.type === 'reading_session' ? '📚' : log.type === 'exam_questions' ? '🎯' : log.type === 'book_quote' ? '✍️' : log.type === 'process_step' ? '⚡' : log.type === 'habit_complete' ? '🔥' : '🎁'}
                </span>
                <span style={{ color: '#f8fafc', fontWeight: 600 }}>{log.title}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {log.xp > 0 && (
                  <span style={{ color: '#fbbf24', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    +{log.xp} XP
                  </span>
                )}
                {log.coins !== 0 && (
                  <span style={{ color: log.coins > 0 ? '#38bdf8' : '#f43f5e', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {log.coins > 0 ? `+${log.coins}` : log.coins} 🪙
                  </span>
                )}
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                  {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
