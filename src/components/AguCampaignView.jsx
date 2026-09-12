import React, { useEffect, useMemo, useState } from 'react';
import {
  Scale,
  Target,
  Play,
  CheckCircle2,
  Circle,
  ExternalLink,
  RotateCcw,
  CalendarDays,
  Swords,
  AlertTriangle,
  Landmark,
  ScrollText,
  Sparkles,
  X,
  Clock,
  SkipForward,
  PenLine,
  History,
  Table2,
  Compass,
  Pencil,
  Trash2
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { ActivityTimerBox } from './ActivityTimerBox';
import { consumeActivityTimerMinutes, getActivityTimerSnapshot, startActivityTimer, subscribeActivityTimers } from '../utils/liveActivityTimers';
import { elapsedMsFrom, formatStudyDuration, parseDurationMinutes } from '../utils/activityDuration';
import {
  AGU_FOLDER_URL,
  AGU_GROUPS,
  AGU_PLATFORMS,
  AGU_SUBJECTS,
  AGU_TARGET_ACCURACY,
  AGU_THEORY_URL
} from '../data/aguCurriculum.js';
import { summarizePlan } from '../utils/aguCycle.js';
import { getSaoPauloDateStr } from '../utils/timeUtils.js';

const PROTOCOL = [
  'Três blocos por dia, 60 min cada. Um tópico de uma matéria por bloco.',
  'O bloco fecha com 60 minutos ou com 20 questões — o que ocorrer primeiro.',
  'Um dos três blocos é de Língua Portuguesa (ortografia em prioridade) até 95%+ nos 10 últimos blocos da matéria.',
  'Tópico só conclui com ≥ 60 questões no estudo inicial. Se o último bloco ficar abaixo de 80%, o tópico volta a pendente.',
  'Depois de concluir: revisões em 1, 7, 21, 30, 90 e 120 dias (esta última, recorrente). Revisão = 1 bloco (60 min ou 20 q).',
  'O próximo bloco é calculado na hora: revisões devidas primeiro, depois tópicos pendentes, com a trava de português.',
  `Tec é a referência. Meta geral de acerto: ${AGU_TARGET_ACCURACY}%.`
];

function ProgressBar({ percent, color = '#f59e0b' }) {
  return (
    <div className="progress-container" style={{ height: '8px' }}>
      <div style={{
        width: `${Math.min(100, Math.max(0, percent))}%`,
        height: '100%',
        borderRadius: '999px',
        background: color,
        boxShadow: `0 0 10px ${color}66`,
        transition: 'width 0.35s ease'
      }} />
    </div>
  );
}

function StatChip({ label, value, color, sub }) {
  return (
    <div className="rpg-card" style={{ padding: '14px 16px', flex: '1 1 140px', minWidth: '140px' }}>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: color || '#fbbf24', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function liveMinutesForKeys(keys = []) {
  let ms = 0;
  keys.forEach((key) => {
    const snap = getActivityTimerSnapshot('agu', key);
    if (!snap) return;
    ms += elapsedMsFrom(snap.accumulatedMs || 0, snap.runStartedAt || null);
  });
  return Math.floor(ms / 60000);
}

function useLiveAguMinutes(blockKeys) {
  const keySig = (blockKeys || []).join('\n');
  const [minutes, setMinutes] = useState(() => liveMinutesForKeys(blockKeys));

  useEffect(() => {
    const keys = keySig ? keySig.split('\n').filter(Boolean) : [];
    const update = () => setMinutes(liveMinutesForKeys(keys));
    update();
    return subscribeActivityTimers(update);
  }, [keySig]);

  return minutes;
}

function StudyTimeCard({ studyTime, liveMinutes = 0 }) {
  const rows = [
    { id: 'day', label: 'Hoje', value: (studyTime?.day || 0) + liveMinutes, color: '#fbbf24' },
    { id: 'week', label: 'Semana', value: (studyTime?.week || 0) + liveMinutes, color: '#38bdf8' },
    { id: 'cycle', label: 'Ciclo', value: (studyTime?.cycle || 0) + liveMinutes, color: '#c084fc' },
    { id: 'month', label: 'Mês', value: (studyTime?.month || 0) + liveMinutes, color: '#10b981' },
    { id: 'year', label: 'Ano', value: (studyTime?.year || 0) + liveMinutes, color: '#f472b6' },
    { id: 'total', label: 'Total', value: (studyTime?.total || 0) + liveMinutes, color: '#f59e0b' }
  ];

  return (
    <section className="glass-panel-gold" style={{ padding: '18px 20px', marginBottom: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Clock size={18} color="#fbbf24" />
        <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#fbbf24' }}>Tempo total estudado</h3>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '12px' }}>
        Soma o cronômetro dos blocos da campanha e as sessões lançadas na Arena com matérias AGU.
        {liveMinutes > 0 ? ' Inclui o tempo em andamento agora.' : ''}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
        {rows.map((row) => (
          <div key={row.id} className="rpg-card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{row.label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: row.color, fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              {formatStudyDuration(row.value)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AguCampaignView({
  aguPlan,
  examQuestions,
  onStartPlan,
  onToggleBlock,
  onSetBlockDuration,
  onUpdateBlock,
  onDeleteBlock,
  onRealignCycle,
  onResetPlan,
  onAdvanceCycle,
  onLogProduct,
  onUpdatePlan,
  onOpenQuestions,
  onAddQuestions
}) {
  const todayStr = getSaoPauloDateStr();
  const summary = useMemo(
    () => summarizePlan(aguPlan, examQuestions || [], todayStr),
    [aguPlan, examQuestions, todayStr]
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [logBlock, setLogBlock] = useState(null);
  const [logTotal, setLogTotal] = useState('');
  const [logCorrect, setLogCorrect] = useState('');
  const [logMinutes, setLogMinutes] = useState('');
  const [logError, setLogError] = useState('');
  const [screen, setScreen] = useState('hoje');
  const todayBlockKeys = (summary.today?.blocks || []).map((block) => block.key);
  const liveMinutes = useLiveAguMinutes(todayBlockKeys);

  const consumeBlockTimer = (blockKey) => consumeActivityTimerMinutes('agu', blockKey);

  useEffect(() => {
    const firstOpen = (summary.today?.blocks || []).find((b) => !b.done);
    if (!firstOpen?.key) return undefined;
    const snap = getActivityTimerSnapshot('agu', firstOpen.key);
    if (!snap.isRunning && snap.accumulatedMs === 0) {
      startActivityTimer('agu', firstOpen.key);
    }
    return undefined;
  }, [summary.today?.dateStr]);

  const openLog = (block) => {
    const remaining = block.remaining > 0 ? String(block.remaining) : '20';
    const snap = getActivityTimerSnapshot('agu', block.key);
    const live = snap ? Math.floor(elapsedMsFrom(snap.accumulatedMs || 0, snap.runStartedAt || null) / 60000) : 0;
    setLogBlock(block);
    setLogTotal(remaining);
    setLogCorrect('0');
    setLogMinutes(live > 0 ? String(live) : (block.minutes > 0 ? String(block.minutes) : '60'));
    setLogError('');
  };

  const closeLog = () => {
    setLogBlock(null);
    setLogError('');
  };

  const submitLog = (e) => {
    e.preventDefault();
    if (!logBlock) return;
    const total = parseInt(logTotal, 10);
    const correct = logCorrect === '' ? 0 : parseInt(logCorrect, 10);
    if (Number.isNaN(total) || total < 0) {
      setLogError('Informe quantas questões você fez agora (0 se foi só teoria).');
      return;
    }
    if (Number.isNaN(correct) || correct < 0 || correct > total) {
      setLogError('Acertos devem ficar entre 0 e o total feito agora.');
      return;
    }
    const minutes = parseInt(logMinutes, 10);
    const durationMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
    if (total === 0 && durationMinutes <= 0) {
      setLogError('Bloco só de teoria: informe o tempo estudado, ou lance as questões feitas.');
      return;
    }
    consumeBlockTimer(logBlock.key);
    if (total > 0 && onAddQuestions) {
      onAddQuestions({
        category: 'Estudos',
        subject: logBlock.subject?.name || 'Geral',
        topic: logBlock.topicName || logBlock.kindMeta?.label || '',
        subjectId: logBlock.subjectId,
        topicId: logBlock.topicId,
        kind: logBlock.kind,
        cycleNumber: summary.calendar.cycleNumber,
        blockKey: logBlock.key,
        platform: logBlock.platform?.id,
        institution: 'Cebraspe',
        totalQuestions: total,
        correctAnswers: correct,
        durationMinutes,
        notes: `Campanha AGU · ${logBlock.kindMeta?.label || 'bloco'} · ${logBlock.topicName || ''} · ${total}/${logBlock.target || 20} q`,
        notebookUrl: logBlock.subject?.tecCadernoUrl || '',
        date: todayStr
      });
    }
    if (onSetBlockDuration && durationMinutes > 0) {
      onSetBlockDuration(logBlock.key, durationMinutes);
    }
    closeLog();
  };

  const handleToggleBlock = (block) => {
    const extra = {};
    if (!block.markedDone) {
      const durationMinutes = consumeBlockTimer(block.key);
      if (durationMinutes > 0) extra.durationMinutes = durationMinutes;
    }
    onToggleBlock(block.key, extra);
  };

  const selected = summary.subjects.find((subject) => subject.id === selectedSubjectId) || summary.subjects[0];
  const todayBlocks = summary.today?.blocks || [];
  const todayQuestionTarget = Math.max(summary.today?.questionTarget || (todayBlocks.length * 20), 1);
  const todayMinuteTarget = Math.max(todayBlocks.reduce((sum, block) => sum + (block.targetMinutes || 60), 0), todayBlocks.length * 60, 1);
  const todayMinutes = todayBlocks.reduce((sum, block) => sum + (block.minutes || 0), 0);
  const todayPercent = Math.round(Math.max(
    (summary.todayProgress.solved || 0) / todayQuestionTarget,
    todayMinutes / todayMinuteTarget,
    (summary.today?.doneCount || 0) / Math.max(todayBlocks.length, 1)
  ) * 100);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Scale size={22} color="#fbbf24" /> Campanha AGU — Procurador Federal
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.88rem', maxWidth: '720px', marginTop: '6px' }}>
            Três blocos de 60 min por dia, um tópico por bloco. Fecha com o tempo ou com 20 questões.
            Português é obrigatório até 95% nos 10 últimos blocos. Banca: Cebraspe. Plataforma-mãe: Tec.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {!summary.started ? (
            <button
              onClick={onStartPlan}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 18px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#000', fontWeight: 800, border: 'none', cursor: 'pointer'
              }}
            >
              <Play size={16} /> Iniciar campanha hoje
            </button>
          ) : (
            <>
              <button
                onClick={onRealignCycle}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 16px', borderRadius: '12px',
                  background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24',
                  fontWeight: 700, border: '1px solid rgba(245, 158, 11, 0.35)', cursor: 'pointer'
                }}
              >
                <RotateCcw size={15} /> Regenerar o que resta
              </button>
              {onAdvanceCycle && (
                <button
                  onClick={onAdvanceCycle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 16px', borderRadius: '12px',
                    background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8',
                    fontWeight: 700, border: '1px solid rgba(56, 189, 248, 0.35)', cursor: 'pointer'
                  }}
                >
                  <SkipForward size={15} /> Gerar próximo ciclo
                </button>
              )}
            </>
          )}
          <button
            onClick={() => setConfirmReset(true)}
            style={{
              padding: '10px 14px', borderRadius: '12px',
              background: 'transparent', color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontWeight: 700
            }}
          >
            Reiniciar
          </button>
        </div>
      </div>

      <div className="glass-panel-gold" style={{ padding: '16px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '0.8rem', color: '#fde68a' }}>
          <span>Guia Tec 2023 · {summary.totalSolved} questões no Grimório · {summary.overallAccuracy}% acerto</span>
          <span>•</span>
          <span>Fase {summary.phaseMeta?.label || 'A — Fundação'} · cargo-alvo Procurador Federal</span>
          <span>•</span>
          <span>{summary.portugueseRequired ? 'Português obrigatório (1 bloco/dia)' : 'Português dispensado (≥95% nos 10 últimos)'}</span>
          {onUpdatePlan && summary.started && (
            <button
              type="button"
              onClick={() => onUpdatePlan({ editalPublished: !summary.editalPublished })}
              style={{ ...ghostBtnStyle, padding: '4px 10px', fontSize: '0.72rem' }}
            >
              {summary.editalPublished ? 'Edital lock ON' : 'Ligar lock de edital'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
        <StatChip label="Fase" value={summary.phaseMeta?.short || 'Fundação'} sub={summary.editalPublished ? 'Lock de edital' : 'Automática'} color={summary.phaseMeta?.color || '#38bdf8'} />
        <StatChip label="Ciclo" value={`${summary.calendar.cycleNumber}`} sub={`${summary.today.weekdayLabel} · 3 blocos`} />
        <StatChip label="Blocos da quinzena" value={`${summary.cycleDoneBlocks}/${summary.cycleTotalBlocks}`} sub={`${summary.cyclePercent}% concluído`} color="#38bdf8" />
        <StatChip label="Hoje" value={`${summary.today.doneCount}/3`} sub={`${summary.todayProgress.solved}/${summary.today.questionTarget} q · 60 min ou 20 q`} color="#10b981" />
        <StatChip label="Maestria tópico" value={`${summary.masteredSubjects}/${summary.totalSubjects}`} sub={`${summary.startedSubjects} matérias tocadas`} color="#c084fc" />
        <StatChip label="Dívida" value={`${(summary.debt || []).length}`} sub="blocos / restos" color="#f43f5e" />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {[
          { id: 'hoje', label: 'Hoje', icon: Target },
          { id: 'edital', label: 'Edital verticalizado', icon: Table2 },
          { id: 'historico', label: 'Histórico de blocos', icon: History }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setScreen(tab.id)}
            style={{
              ...ghostBtnStyle,
              background: screen === tab.id ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255,255,255,0.04)',
              color: screen === tab.id ? '#fbbf24' : '#e2e8f0',
              borderColor: screen === tab.id ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255,255,255,0.1)'
            }}
          >
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      <StudyTimeCard studyTime={summary.studyTime} liveMinutes={liveMinutes} />

      {summary.nextBlock && (
        <section className="glass-panel-gold" style={{ padding: '16px 18px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#fbbf24', fontWeight: 800 }}>
            <Compass size={16} /> Próximo bloco sugerido
          </div>
          <p style={{ color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 700 }}>
            {summary.nextBlock.subject?.name || getSubjectName(summary.nextBlock.subjectId)} · {summary.nextBlock.topicName || 'tópico'}
          </p>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '4px' }}>
            {(summary.nextBlock.reasons || []).join(' · ') || (summary.nextBlock.kind === 'revisao' ? 'Revisão espaçada' : 'Estudo inicial')}
            {' · '}fecha com 60 min ou 20 questões
          </p>
        </section>
      )}

      {screen === 'hoje' && <section className="glass-panel" style={{ padding: '20px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div>
            <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#fbbf24' }}>Hoje — {summary.today.label}</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
              {summary.today.weekdayLabel} · {todayStr} · 3 blocos de 60 min (ou 20 questões) · 1 tópico por bloco
            </p>
          </div>
          <div style={{ minWidth: '180px', flex: '1 1 180px', maxWidth: '280px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>
              <span>Volume do dia</span>
              <span style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>{todayPercent}%</span>
            </div>
            <ProgressBar percent={todayPercent} />
          </div>
        </div>

        <div style={{ display: 'grid', gap: '10px' }}>
          {(summary.today.blocks || []).map((block, index) => (
            <AguBlockCard
              key={block.key}
              block={block}
              index={index}
              aguPlan={aguPlan}
              onToggle={() => handleToggleBlock(block)}
              onLog={onAddQuestions ? () => openLog(block) : null}
              onSetDuration={onSetBlockDuration}
              onProduct={onLogProduct && block.kind === 'discursiva' ? () => onLogProduct(block.key) : null}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
          <button onClick={onOpenQuestions} style={ghostBtnStyle}>
            <Target size={14} /> Registrar sessão na Arena
          </button>
          <a href={AGU_FOLDER_URL} target="_blank" rel="noreferrer" style={linkBtnStyle('#f59e0b')}>
            Pasta Tec do guia
          </a>
          <a href={AGU_THEORY_URL} target="_blank" rel="noreferrer" style={linkBtnStyle('#10b981')}>
            Biblioteca de teoria
          </a>
        </div>
      </section>}

      {screen === 'hoje' && <section className="glass-panel" style={{ padding: '20px', marginBottom: '18px' }}>
        <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#fbbf24', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarDays size={18} /> Quinzena {summary.calendar.cycleNumber}
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '12px' }}>
          {summary.calendar.cycleStart} → {summary.calendar.cycleEnd}
          {(summary.reasons || []).length > 0 ? ' · gerada pela fragilidade do histórico' : ''}
        </p>
        {(summary.reasons || []).length > 0 && (
          <div style={{ marginBottom: '12px', fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.5 }}>
            {(summary.reasons || []).slice(0, 5).map((reason) => (
              <div key={reason}>• {reason}</div>
            ))}
          </div>
        )}
        {(summary.debt || []).length > 0 && (
          <div style={{ marginBottom: '12px', fontSize: '0.78rem', color: '#fda4af' }}>
            Dívida: {(summary.debt || []).slice(0, 4).map((d) => `${d.subjectId} ${d.kind}${d.remainingQuestions ? ` (${d.remainingQuestions})` : ''}`).join(' · ')}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
          {summary.calendar.days.map((day) => {
            const isToday = day.dateStr === todayStr;
            return (
              <div
                key={day.dateStr}
                style={{
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: isToday ? 'rgba(245, 158, 11, 0.12)' : '#131722',
                  border: isToday ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid rgba(255,255,255,0.07)'
                }}
              >
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>
                  {day.weekdayLabel}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: 700, margin: '4px 0' }}>{day.label}</div>
                <div style={{ fontSize: '0.72rem', color: day.complete ? '#10b981' : '#64748b', fontFamily: 'var(--font-mono)' }}>
                  {day.doneCount}/{day.totalBlocks} blocos · {day.questionTarget} q
                </div>
              </div>
            );
          })}
        </div>
      </section>}

      {screen === 'edital' && (
        <EditalTable subjects={summary.edital?.subjects || []} />
      )}

      {screen === 'historico' && (
        <BlockHistoryList
          blocks={summary.studyBlocks || []}
          onUpdateBlock={onUpdateBlock}
          onDeleteBlock={onDeleteBlock}
        />
      )}

      {screen === 'hoje' && <section className="glass-panel" style={{ padding: '20px', marginBottom: '18px' }}>
        <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#fbbf24', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Landmark size={18} /> Matérias da campanha
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
          {Object.values(AGU_GROUPS).map((group) => (
            <span key={group.id} style={{
              fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: '999px',
              color: group.color, border: `1px solid ${group.color}55`, background: `${group.color}14`
            }}>
              {group.short}
            </span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
          {summary.subjects.map((subject) => (
            <button
              key={subject.id}
              onClick={() => setSelectedSubjectId(subject.id)}
              className="rpg-card"
              style={{
                padding: '14px',
                textAlign: 'left',
                cursor: 'pointer',
                borderColor: selected?.id === subject.id ? 'rgba(245, 158, 11, 0.5)' : undefined,
                background: selected?.id === subject.id ? '#1a2030' : undefined
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{subject.name}</strong>
                <span style={{ color: subject.mastery.color, fontSize: '0.72rem', fontWeight: 800 }}>{subject.mastery.label}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: subject.groupMeta.color, marginTop: '4px' }}>{subject.groupMeta.short}{subject.extra ? ' · extra' : ''}</div>
              <div style={{ marginTop: '10px' }}>
                <ProgressBar percent={subject.stats.accuracy} color={subject.mastery.color} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                <span>{subject.stats.solved} q</span>
                <span>{subject.stats.accuracy}%</span>
                <span>{subject.tecQuestions || '—'} no Tec</span>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="rpg-card" style={{ marginTop: '14px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h4 className="font-cinzel" style={{ color: '#fde68a' }}>{selected.name}</h4>
                <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: '4px' }}>{selected.platform.reason}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selected.tecCadernoUrl && (
                  <a href={selected.tecCadernoUrl} target="_blank" rel="noreferrer" style={linkBtnStyle('#f59e0b')}>Caderno Tec</a>
                )}
                {selected.tecGuideUrl && (
                  <a href={selected.tecGuideUrl} target="_blank" rel="noreferrer" style={linkBtnStyle('#38bdf8')}>Guia Tec</a>
                )}
                {selected.leiSeca && (
                  <a href={AGU_PLATFORMS.decorando.url} target="_blank" rel="noreferrer" style={linkBtnStyle('#a855f7')}>Lei seca</a>
                )}
              </div>
            </div>
            <ul style={{ marginTop: '12px', paddingLeft: '18px', color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.6 }}>
              {(selected.topics || []).map((topic) => (
                <li key={topic.id}>
                  {selected.cursor?.topicId === topic.id ? '▶ ' : ''}{topic.name}
                  {topic.questions ? <span style={{ color: '#64748b', fontFamily: 'var(--font-mono)' }}> · {topic.questions} q</span> : null}
                  {selected.cursor?.topicId === topic.id ? <span style={{ color: '#fbbf24' }}> · cursor</span> : null}
                </li>
              ))}
            </ul>
            {selected.overlap?.length > 0 && (
              <p style={{ marginTop: '10px', fontSize: '0.78rem', color: '#10b981' }}>
                Overlap: {selected.overlap.join(' · ')}
              </p>
            )}
          </div>
        )}
      </section>}

      {screen === 'hoje' && <section className="glass-panel" style={{ padding: '20px', marginBottom: '18px' }}>
        <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#fbbf24', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Swords size={18} /> Protocolo de execução
        </h3>
        <ol style={{ paddingLeft: '18px', color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.7 }}>
          {PROTOCOL.map((item) => <li key={item}>{item}</li>)}
        </ol>
        {summary.gapSubjects.length > 0 && (
          <div style={{ marginTop: '14px', padding: '12px', borderRadius: '12px', background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fb7185', fontWeight: 800, marginBottom: '6px' }}>
              <AlertTriangle size={16} /> Furos abaixo da meta
            </div>
            <p style={{ color: '#fda4af', fontSize: '0.82rem' }}>
              {summary.gapSubjects.map((subject) => `${subject.name} (${subject.stats.accuracy}%)`).join(' · ')}
            </p>
          </div>
        )}
      </section>}

      {screen === 'hoje' && <section className="glass-panel" style={{ padding: '20px' }}>
        <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#fbbf24', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ScrollText size={18} /> Como a prova é lida neste plano
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.65, marginBottom: '10px' }}>
          O PDF da pasta Editais é o Edital nº 1 — AGU, de 26/12/2022, <strong style={{ color: '#e2e8f0' }}>Advogado da União</strong> (Cebraspe).
          O guia Tec é <strong style={{ color: '#e2e8f0' }}>Procurador Federal 2023</strong>. O plano usa o guia Tec como currículo e a estrutura Cebraspe do edital como analogia da carreira AGU:
          objetiva por grupos, 50% mínimo por grupo, discursivas (parecer, peça, dissertação) e oral.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          {Object.values(AGU_GROUPS).filter((g) => g.id !== 'extra').map((group) => (
            <div key={group.id} className="rpg-card" style={{ padding: '12px' }}>
              <div style={{ color: group.color, fontWeight: 800, fontSize: '0.85rem' }}>{group.short}</div>
              <p style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '6px' }}>{group.examShare}</p>
              {group.analogQuestions > 0 && (
                <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                  Analogia AU 2023: {group.analogQuestions} itens
                </p>
              )}
            </div>
          ))}
        </div>
        <p style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={14} color="#fbbf24" />
          Quando sair o edital novo, ligue o lock na configuração do plano (editalPublished). O motor congela o que sair do edital.
        </p>
      </section>}

      {logBlock && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}
          onClick={closeLog}
        >
          <form
            onSubmit={submitLog}
            className="glass-panel modal-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px', width: '100%', padding: '24px', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '20px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
              <div>
                <h3 className="font-cinzel" style={{ fontSize: '1.15rem', color: '#f8fafc' }}>Lançar bloco</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: '4px' }}>
                  {logBlock.subject?.name} · {logBlock.topicName || 'tópico corrente'} · fecha com 20 q ou 60 min
                </p>
              </div>
              <button type="button" onClick={closeLog} style={{ ...ghostBtnStyle, padding: '8px' }}><X size={16} /></button>
            </div>
            <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '14px', lineHeight: 1.5 }}>
              Pode ser só teoria: 0 questões e 0 acertos. Nesse caso, o bloco fecha pelo tempo (60 min).
            </p>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, marginBottom: '6px' }}>
              Questões feitas agora
            </label>
            <input
              type="number" min="0" value={logTotal} onChange={(e) => setLogTotal(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, margin: '12px 0 6px' }}>
              Acertos nessas questões
            </label>
            <input
              type="number" min="0" value={logCorrect} onChange={(e) => setLogCorrect(e.target.value)}
              placeholder="4"
              style={inputStyle}
            />
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, margin: '12px 0 6px' }}>
              Tempo estudado (minutos)
            </label>
            <input
              type="number" min="0" value={logMinutes} onChange={(e) => setLogMinutes(e.target.value)}
              placeholder="60"
              style={inputStyle}
            />
            {logError && <p style={{ color: '#fb7185', fontSize: '0.8rem', marginTop: '10px' }}>{logError}</p>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={closeLog} style={ghostBtnStyle}>Cancelar</button>
              <button type="submit" style={{
                ...ghostBtnStyle,
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#000', border: 'none'
              }}>
                {parseInt(logTotal, 10) > 0 ? `Salvar ${logTotal} questões` : 'Salvar bloco'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmReset}
        title="Reiniciar campanha AGU?"
        message="Os blocos marcados do ciclo serão zerados. O histórico da Arena de Questões permanece intacto."
        confirmText="Reiniciar plano"
        confirmVariant="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          onResetPlan();
        }}
      />
    </div>
  );
}

function AguBlockCard({ block, index = 0, aguPlan, onToggle, onLog, onSetDuration, onProduct }) {
  const [manualMinutes, setManualMinutes] = useState(
    String(parseDurationMinutes(aguPlan?.blockDurations?.[block.key]) || block.minutes || '')
  );

  useEffect(() => {
    setManualMinutes(String(parseDurationMinutes(aguPlan?.blockDurations?.[block.key]) || block.minutes || ''));
  }, [aguPlan?.blockDurations?.[block.key], block.minutes, block.key]);
  return (
    <div
      className="rpg-card"
      style={{
        padding: '14px 16px',
        borderColor: block.done ? 'rgba(16, 185, 129, 0.45)' : 'rgba(255,255,255,0.07)'
      }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button
          onClick={onToggle}
          disabled={block.kind === 'discursiva'}
          style={{
            background: 'transparent', border: 'none', cursor: block.kind === 'discursiva' ? 'default' : 'pointer',
            display: 'flex', gap: '12px', alignItems: 'flex-start', textAlign: 'left', flex: '1 1 240px', color: 'inherit'
          }}
        >
          {block.done
            ? <CheckCircle2 size={22} color="#10b981" />
            : <Circle size={22} color="#64748b" />}
          <div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b' }}>Bloco {index + 1}</span>
              <strong style={{ color: '#f8fafc' }}>{block.subject?.name}</strong>
              <span style={{
                fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '999px',
                background: `${block.kindMeta.color}22`, color: block.kindMeta.color, border: `1px solid ${block.kindMeta.color}55`
              }}>
                {block.kindMeta.icon} {block.kindMeta.label}
              </span>
              {block.optional && (
                <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>bônus</span>
              )}
              {block.target > 0 && (
                <span style={{ fontSize: '0.75rem', color: block.metTarget ? '#10b981' : '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                  {block.todayProgress.solved}/{block.target} q · {block.minutes || 0}/{block.targetMinutes || 60} min
                </span>
              )}
            </div>
            {block.topicName && (
              <p style={{ fontSize: '0.8rem', color: '#fde68a', marginTop: '4px' }}>Tópico: {block.topicName}</p>
            )}
            {block.prompt && (
              <p style={{ fontSize: '0.8rem', color: '#e2e8f0', marginTop: '6px', lineHeight: 1.45 }}>{block.prompt}</p>
            )}
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
              {(block.reasons || []).join(' · ') || block.platform?.reason}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
              {block.group?.short} · {block.mastery?.label} · {block.stats?.solved || 0} no histórico · {block.stats?.accuracy || 0}%
            </p>
            {block.target > 0 && (
              <div style={{ marginTop: '8px', maxWidth: '280px' }}>
                <ProgressBar percent={block.progressPercent} color={block.metTarget ? '#10b981' : '#f59e0b'} />
              </div>
            )}
            {parseDurationMinutes(aguPlan?.blockDurations?.[block.key]) > 0 && (
              <p style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '6px', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={12} /> {formatStudyDuration(aguPlan.blockDurations[block.key])} neste bloco
              </p>
            )}
          </div>
        </button>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onLog && ['questoes', 'estudo', 'erros', 'simulado', 'revisao', 'lei-seca'].includes(block.kind) && (
            <button onClick={onLog} style={ghostBtnStyle}>
              <Target size={14} /> Lançar o que fiz
            </button>
          )}
          {onProduct && (
            <button onClick={onProduct} style={ghostBtnStyle}>
              <PenLine size={14} /> {block.productLogged ? 'Produto lançado' : `Lançar ${block.productMeta?.label || 'produto'}`}
            </button>
          )}
          {block.subject?.tecCadernoUrl && (
            <a href={block.subject.tecCadernoUrl} target="_blank" rel="noreferrer" style={linkBtnStyle('#f59e0b')}>
              <ExternalLink size={14} /> Caderno Tec
            </a>
          )}
          {block.kind === 'lei-seca' && (
            <a href={AGU_PLATFORMS.decorando.url} target="_blank" rel="noreferrer" style={linkBtnStyle('#a855f7')}>
              Decorando
            </a>
          )}
          {block.platform?.id === 'qconcursos' && (
            <a href={AGU_PLATFORMS.qconcursos.url} target="_blank" rel="noreferrer" style={linkBtnStyle('#38bdf8')}>
              Qconcursos
            </a>
          )}
        </div>
      </div>
      <div style={{ marginTop: '12px' }}>
        <ActivityTimerBox
          kind="agu"
          id={block.key}
          label={`Cronômetro · ${block.subject?.name || 'bloco'}`}
          accent={block.kindMeta?.color || '#fbbf24'}
          compact
        />
        {onSetDuration && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSetDuration(block.key, parseInt(manualMinutes, 10) || 0);
            }}
            style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}
          >
            <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>Tempo manual (min)</label>
            <input
              type="number"
              min="0"
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{ ...inputStyle, width: '90px', padding: '8px 10px', fontSize: '0.9rem' }}
            />
            <button type="submit" style={ghostBtnStyle} onClick={(e) => e.stopPropagation()}>
              <Clock size={14} /> Salvar tempo
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function pct(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

function EditalTable({ subjects }) {
  return (
    <section className="glass-panel" style={{ padding: '20px', marginBottom: '18px' }}>
      <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#fbbf24', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Table2 size={18} /> Edital verticalizado
      </h3>
      <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '12px' }}>
        Matérias e tópicos com conclusão, tempo, blocos, revisões, volume e acerto (geral e do último bloco).
      </p>
      <div className="agu-edital-wrap">
        <table className="agu-edital-table">
          <thead>
            <tr>
              <th>Matéria / tópico</th>
              <th className="num">Conclusão</th>
              <th className="num">Tempo</th>
              <th className="num">Blocos</th>
              <th className="num">Revisões</th>
              <th className="num">Questões</th>
              <th className="num">Acerto</th>
              <th className="num">Último bloco</th>
            </tr>
          </thead>
          <tbody>
            {(subjects || []).map((subject) => (
              <React.Fragment key={subject.id}>
                <tr className="subject-row">
                  <td>{subject.name}</td>
                  <td className="num">{pct(subject.completionPercent)}</td>
                  <td className="num">{formatStudyDuration(subject.minutes)}</td>
                  <td className="num">{subject.studyBlocks || 0}</td>
                  <td className="num">{subject.reviewBlocks || 0}</td>
                  <td className="num">{subject.solved || 0}</td>
                  <td className="num">{pct(subject.accuracy)}</td>
                  <td className="num">{subject.lastBlockAccuracy ? pct(subject.lastBlockAccuracy) : '—'}</td>
                </tr>
                {(subject.topics || []).map((topic) => (
                  <tr key={topic.key || topic.topicId} className="topic-row">
                    <td>{topic.topicName}</td>
                    <td className="num">{pct(topic.completionPercent)}</td>
                    <td className="num">{formatStudyDuration(topic.minutes)}</td>
                    <td className="num">{topic.studyBlocks || 0}</td>
                    <td className="num">{topic.reviewBlocks || 0}</td>
                    <td className="num">{topic.solved || 0}</td>
                    <td className="num">{pct(topic.accuracy)}</td>
                    <td className="num">{topic.lastBlockAccuracy ? pct(topic.lastBlockAccuracy) : '—'}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BlockHistoryList({ blocks, onUpdateBlock, onDeleteBlock }) {
  const list = (blocks || []).filter((block) => (
    block.done || (block.totalQuestions || 0) > 0 || (block.durationMinutes || 0) > 0
  ));
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editTopicId, setEditTopicId] = useState('');
  const [editKind, setEditKind] = useState('estudo');
  const [editTotal, setEditTotal] = useState('0');
  const [editCorrect, setEditCorrect] = useState('0');
  const [editMinutes, setEditMinutes] = useState('0');
  const [editError, setEditError] = useState('');

  const openEdit = (block) => {
    setEditing(block);
    setEditDate(block.dateStr || '');
    setEditSubjectId(block.subjectId || '');
    setEditTopicId(block.topicId || '');
    setEditKind(block.kind === 'revisao' ? 'revisao' : 'estudo');
    setEditTotal(String(block.totalQuestions || 0));
    setEditCorrect(String(block.correctAnswers || 0));
    setEditMinutes(String(block.durationMinutes || 0));
    setEditError('');
  };

  const topicsForSubject = AGU_SUBJECTS.find((s) => s.id === editSubjectId)?.topics || [];

  const submitEdit = (e) => {
    e.preventDefault();
    if (!editing || !onUpdateBlock) return;
    const total = parseInt(editTotal, 10);
    const correct = editCorrect === '' ? 0 : parseInt(editCorrect, 10);
    const minutes = parseInt(editMinutes, 10);
    if (Number.isNaN(total) || total < 0) {
      setEditError('Questões devem ser 0 ou mais (0 = só teoria).');
      return;
    }
    if (Number.isNaN(correct) || correct < 0 || correct > total) {
      setEditError('Acertos devem ficar entre 0 e o total de questões.');
      return;
    }
    if (Number.isNaN(minutes) || minutes < 0) {
      setEditError('Informe o tempo estudado em minutos.');
      return;
    }
    if (total === 0 && minutes <= 0) {
      setEditError('Bloco só de teoria precisa de tempo estudado.');
      return;
    }
    onUpdateBlock({
      key: editing.key,
      dateStr: editDate,
      subjectId: editSubjectId,
      topicId: editTopicId || null,
      kind: editKind,
      totalQuestions: total,
      correctAnswers: correct,
      durationMinutes: minutes
    });
    setEditing(null);
  };

  return (
    <section className="glass-panel" style={{ padding: '20px', marginBottom: '18px' }}>
      <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#fbbf24', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <History size={18} /> Histórico de blocos
      </h3>
      <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '12px' }}>
        Todos os blocos lançados ou cronometrados, do mais recente ao mais antigo. Dá para editar ou excluir.
      </p>
      {list.length === 0 ? (
        <p style={{ color: '#64748b' }}>Nenhum bloco registrado ainda.</p>
      ) : (
        <div className="agu-history-list">
          {list.map((block) => (
            <div key={block.key} className="rpg-card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <strong style={{ color: '#f8fafc' }}>
                  {block.subject?.name || block.subjectId} · {block.topicName || block.topicId || 'tópico'}
                </strong>
                <span style={{ color: '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{block.dateStr}</span>
              </div>
              <div style={{ marginTop: '6px', fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span>{block.kind === 'revisao' ? 'Revisão' : 'Estudo inicial'}</span>
                <span>{block.totalQuestions || 0} q</span>
                <span>{pct(block.accuracy)} acerto</span>
                <span>{formatStudyDuration(block.durationMinutes)}</span>
                <span style={{ color: block.done ? '#10b981' : '#fbbf24' }}>{block.done ? 'concluído' : 'em aberto'}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                {onUpdateBlock && (
                  <button type="button" onClick={() => openEdit(block)} style={ghostBtnStyle}>
                    <Pencil size={14} /> Editar
                  </button>
                )}
                {onDeleteBlock && (
                  <button type="button" onClick={() => setDeleting(block)} style={{ ...ghostBtnStyle, color: '#fb7185', borderColor: 'rgba(244,63,94,0.35)' }}>
                    <Trash2 size={14} /> Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}
          onClick={() => setEditing(null)}
        >
          <form
            onSubmit={submitEdit}
            className="glass-panel modal-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', width: '100%', padding: '24px', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '20px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
              <h3 className="font-cinzel" style={{ fontSize: '1.15rem', color: '#f8fafc' }}>Editar bloco</h3>
              <button type="button" onClick={() => setEditing(null)} style={{ ...ghostBtnStyle, padding: '8px' }}><X size={16} /></button>
            </div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, marginBottom: '6px' }}>Data</label>
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={inputStyle} />
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, margin: '12px 0 6px' }}>Matéria</label>
            <select
              value={editSubjectId}
              onChange={(e) => {
                setEditSubjectId(e.target.value);
                const first = AGU_SUBJECTS.find((s) => s.id === e.target.value)?.topics?.[0];
                setEditTopicId(first?.id || '');
              }}
              style={inputStyle}
            >
              {AGU_SUBJECTS.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, margin: '12px 0 6px' }}>Tópico</label>
            <select value={editTopicId} onChange={(e) => setEditTopicId(e.target.value)} style={inputStyle}>
              {topicsForSubject.map((topic) => (
                <option key={topic.id} value={topic.id}>{topic.name}</option>
              ))}
            </select>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, margin: '12px 0 6px' }}>Tipo</label>
            <select value={editKind} onChange={(e) => setEditKind(e.target.value)} style={inputStyle}>
              <option value="estudo">Estudo inicial</option>
              <option value="revisao">Revisão</option>
            </select>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, margin: '12px 0 6px' }}>Questões feitas</label>
            <input type="number" min="0" value={editTotal} onChange={(e) => setEditTotal(e.target.value)} style={inputStyle} />
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, margin: '12px 0 6px' }}>Acertos</label>
            <input type="number" min="0" value={editCorrect} onChange={(e) => setEditCorrect(e.target.value)} style={inputStyle} />
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, margin: '12px 0 6px' }}>Tempo estudado (min)</label>
            <input type="number" min="0" value={editMinutes} onChange={(e) => setEditMinutes(e.target.value)} style={inputStyle} />
            {editError && <p style={{ color: '#fb7185', fontSize: '0.8rem', marginTop: '10px' }}>{editError}</p>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEditing(null)} style={ghostBtnStyle}>Cancelar</button>
              <button type="submit" style={{
                ...ghostBtnStyle,
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#000', border: 'none'
              }}>
                Salvar alterações
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(deleting)}
        title="Excluir bloco"
        message={deleting
          ? `Excluir o bloco de ${deleting.subject?.name || deleting.subjectId} · ${deleting.topicName || 'tópico'} (${deleting.dateStr})? O tempo, as questões e o progresso desse bloco serão estornados.`
          : ''}
        confirmText="Excluir"
        confirmVariant="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting && onDeleteBlock) onDeleteBlock(deleting.key);
          setDeleting(null);
        }}
      />
    </section>
  );
}

function getSubjectName(subjectId) {
  return AGU_SUBJECTS.find((s) => s.id === subjectId)?.name || subjectId;
}

function linkBtnStyle(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderRadius: '10px',
    background: `${color}18`,
    color,
    border: `1px solid ${color}55`,
    fontWeight: 700,
    fontSize: '0.78rem',
    textDecoration: 'none'
  };
}

const ghostBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderRadius: '10px',
  background: 'rgba(255,255,255,0.04)',
  color: '#e2e8f0',
  border: '1px solid rgba(255,255,255,0.1)',
  fontWeight: 700,
  fontSize: '0.78rem',
  cursor: 'pointer'
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  background: '#1a2030',
  border: '1px solid rgba(245, 158, 11, 0.35)',
  color: '#fff',
  fontSize: '1rem',
  fontWeight: 800,
  fontFamily: 'var(--font-mono)'
};
