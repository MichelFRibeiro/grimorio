import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Check,
  ListOrdered,
  NotebookPen,
  Pill,
  Play,
  Scale,
  Settings,
  Sparkles,
  Trophy
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import {
  DAILY_VICTORY_REWARDS,
  describeRoutineVictoryRow,
  findVictoryForRoutine,
  isRoutineVictory,
  listVictoriesForDate,
  manualVictoriesFull
} from '../utils/dailyVictories';
import { getSaoPauloDateStr } from '../utils/timeUtils';

const ACTIVITY_ICONS = {
  reading: BookOpen,
  scripture: BookMarked,
  journal: NotebookPen,
  agu: Scale,
  'supplement-review': Pill
};

function activityIcon(activityId) {
  return ACTIVITY_ICONS[activityId] || ListOrdered;
}

/** Passos visíveis do cartão: uma linha por ritual/atividade/sub-rotina. */
function flattenSteps(steps, depth = 0, acc = []) {
  (steps || []).forEach((step) => {
    acc.push({ step, depth });
    if (step.kind === 'routine' && Array.isArray(step.steps) && step.steps.length) {
      flattenSteps(step.steps, depth + 1, acc);
    }
  });
  return acc;
}

function StepRow({ step, depth, onOpenActivity }) {
  const Icon = step.kind === 'activity'
    ? activityIcon(step.activityId)
    : step.kind === 'routine'
      ? ListOrdered
      : null;
  const done = !step.missing && !!step.doneToday;
  const label = step.missing
    ? (step.kind === 'routine' ? 'Sub-rotina excluída' : 'Passo excluído')
    : step.title;
  const hint = step.kind === 'activity' && step.detail ? step.detail : '';
  const progress = step.kind === 'routine' ? step.progress : null;
  const canOpenActivity = step.kind === 'activity' && !step.missing && !step.doneToday && step.tab;

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginLeft: depth ? `${depth * 18}px` : 0,
        padding: '5px 0',
        opacity: step.missing ? 0.55 : 1,
        minWidth: 0
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '6px',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: done ? 'none' : '1px solid rgba(148, 163, 184, 0.45)',
          background: done ? 'rgba(16, 185, 129, 0.22)' : 'transparent',
          color: '#34d399'
        }}
      >
        {done ? <Check size={12} strokeWidth={3} /> : null}
      </span>
      {Icon ? <Icon size={14} style={{ flexShrink: 0, color: '#94a3b8' }} aria-hidden="true" /> : null}
      <span
        style={{
          fontSize: '0.84rem',
          fontWeight: 600,
          color: done ? '#94a3b8' : '#e2e8f0',
          textDecoration: done ? 'line-through' : 'none',
          minWidth: 0,
          overflowWrap: 'anywhere'
        }}
      >
        {label}
        {hint ? <span style={{ color: '#64748b', fontWeight: 500 }}> · {hint}</span> : null}
        {progress ? (
          <span style={{ color: '#64748b', fontWeight: 600 }}> · {progress.done}/{progress.total}</span>
        ) : null}
      </span>
      {canOpenActivity ? (
        <button
          type="button"
          onClick={() => onOpenActivity?.(step)}
          title={`Abrir ${step.title}`}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '8px',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            background: 'rgba(56, 189, 248, 0.1)',
            color: '#38bdf8',
            fontSize: '0.7rem',
            fontWeight: 800,
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          Abrir <ArrowRight size={11} />
        </button>
      ) : null}
    </li>
  );
}

function RoutineState({ kind, title, text, action }) {
  return (
    <div
      className="glass-panel home-routine"
      style={{
        padding: '14px 18px',
        marginBottom: '24px',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.06) 0%, rgba(19, 23, 34, 0.92) 100%)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '12px'
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'rgba(56, 189, 248, 0.14)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#38bdf8',
          flexShrink: 0
        }}
      >
        <ListOrdered size={19} />
      </div>
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <h2 className="font-cinzel" style={{ fontSize: '0.98rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
          {kind === 'missing' ? 'Rotina da tela inicial' : 'Rotina do dia'}
        </h2>
        <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>{text}</p>
      </div>
      {action || null}
    </div>
  );
}

/**
 * Rotina escolhida para a tela inicial, imediatamente abaixo do quadro
 * "Vitórias Planejadas para o Dia".
 *
 * - Sem escolha ou rotina excluída: explica como escolher em Configurações.
 * - Com escolha: passos do dia, progresso e "Fazer agora" no próximo passo.
 * - Com a execução planejada como vitória do dia: mostra o mesmo progresso que
 *   o quadro de Vitórias usa e o botão de conquistar/reabrir a vitória.
 */
export function HomeRoutineCard({
  routines = [],
  homeRoutineId = null,
  homeRoutine = null,
  dailyVictories = [],
  onOpenSettings,
  onOpenTab,
  onStartNext,
  onPlanVictory,
  onCompleteVictory,
  onReopenVictory,
  playClick
}) {
  const todayStr = getSaoPauloDateStr();
  const [confirm, setConfirm] = useState({ isOpen: false, mode: null, message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chosen = useMemo(
    () => (routines || []).find((item) => item && item.id === homeRoutineId) || null,
    [routines, homeRoutineId]
  );
  const routine = homeRoutine && homeRoutine.id === homeRoutineId ? homeRoutine : null;

  const victory = useMemo(
    () => findVictoryForRoutine(dailyVictories, homeRoutineId, todayStr),
    [dailyVictories, homeRoutineId, todayStr]
  );
  const tomorrowVictory = useMemo(() => {
    const todayVictories = listVictoriesForDate(dailyVictories, todayStr);
    const plannedTomorrow = (dailyVictories || []).find((item) => (
      isRoutineVictory(item) && item.routineId === homeRoutineId && !todayVictories.includes(item) && item.date !== todayStr
    ));
    return plannedTomorrow || null;
  }, [dailyVictories, homeRoutineId, todayStr]);
  const row = describeRoutineVictoryRow(victory, chosen || routine);

  const openSettings = () => {
    if (playClick) playClick();
    onOpenSettings?.();
  };

  const settingsButton = (
    <button
      type="button"
      onClick={openSettings}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 12px',
        borderRadius: '10px',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        background: 'rgba(56, 189, 248, 0.1)',
        color: '#38bdf8',
        fontWeight: 800,
        fontSize: '0.78rem',
        cursor: 'pointer',
        flexShrink: 0
      }}
    >
      <Settings size={14} /> Trocar em Configurações
    </button>
  );

  if (!homeRoutineId || !chosen) {
    return (
      <RoutineState
        kind="missing"
        text={homeRoutineId
          ? 'A rotina escolhida não existe mais. Escolha outra em Configurações para vê-la aqui todos os dias.'
          : 'Escolha uma rotina em Configurações para acompanhar a sequência do dia logo aqui na tela inicial.'}
        action={settingsButton}
      />
    );
  }

  const progress = routine?.progress || chosen.progress || { total: 0, done: 0 };
  const total = progress.total || 0;
  const done = progress.done || 0;
  const completeToday = total > 0 && done >= total;
  const next = routine?.next || null;
  const rows = routine ? flattenSteps(routine.steps) : [];
  const color = routine?.color || chosen.color || '#38bdf8';

  const planDisabledReason = manualVictoriesFull(dailyVictories, todayStr)
    ? 'As 3 vagas de vitórias de hoje já estão ocupadas.'
    : (!total ? 'Esta rotina não tem passos válidos.' : '');

  const run = async (mode) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'plan') await onPlanVictory?.(homeRoutineId);
      else if (mode === 'complete') await onCompleteVictory?.(homeRoutineId);
      else if (mode === 'reopen') await onReopenVictory?.(homeRoutineId);
    } catch (err) {
      setError(err?.message || 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  };

  const askPlan = async () => {
    if (playClick) playClick();
    if (!victory && total > 0) {
      // Planejar a rotina inteira tira uma vaga do dia: confirma antes.
      setConfirm({
        isOpen: true,
        mode: 'plan',
        message: `Incluir "${chosen.title}" inteira nas vitórias de hoje? Ela passa a ocupar uma das 3 vagas do dia e paga +${DAILY_VICTORY_REWARDS.xp} XP quando todos os passos forem cumpridos.`
      });
      return;
    }
    await run('plan');
  };

  const askComplete = () => {
    if (playClick) playClick();
    setConfirm({
      isOpen: true,
      mode: 'complete',
      message: `Conquistar a vitória "${chosen.title}"? Todos os ${total} passos de hoje já estão feitos. Você recebe +${DAILY_VICTORY_REWARDS.xp} XP e +${DAILY_VICTORY_REWARDS.coins} moedas.`
    });
  };

  const askReopen = () => {
    if (playClick) playClick();
    setConfirm({
      isOpen: true,
      mode: 'reopen',
      message: 'Reabrir esta vitória? As recompensas (e o bônus da tríade, se houver) serão estornadas. Os rituais e o progresso da rotina continuam como estão.'
    });
  };

  const confirmAction = async () => {
    const mode = confirm.mode;
    setConfirm({ isOpen: false, mode: null, message: '' });
    await run(mode);
  };

  const victoryBadge = (() => {
    if (!victory) {
      return tomorrowVictory
        ? { text: 'Planejada para amanhã', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' }
        : null;
    }
    if (victory.completed) {
      return { text: 'Vitória conquistada', color: '#34d399', bg: 'rgba(16, 185, 129, 0.16)' };
    }
    return {
      text: total && done >= total ? 'Vitória pronta' : 'Nas vitórias de hoje',
      color: total && done >= total ? '#fbbf24' : '#38bdf8',
      bg: total && done >= total ? 'rgba(245, 158, 11, 0.16)' : 'rgba(56, 189, 248, 0.14)'
    };
  })();

  return (
    <section
      className="glass-panel home-routine"
      aria-labelledby="home-routine-title"
      style={{
        padding: '16px 20px',
        marginBottom: '24px',
        border: completeToday ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(56, 189, 248, 0.24)',
        background: completeToday
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(19, 23, 34, 0.92) 100%)'
          : 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(19, 23, 34, 0.92) 100%)'
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: '1 1 280px' }}>
          <div
            aria-hidden="true"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: `${color}22`,
              border: `1px solid ${color}55`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color,
              flexShrink: 0
            }}
          >
            <ListOrdered size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <h2 id="home-routine-title" className="font-cinzel" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                {chosen.title}
              </h2>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: completeToday ? 'rgba(16, 185, 129, 0.18)' : 'rgba(56, 189, 248, 0.16)',
                  color: completeToday ? '#34d399' : '#38bdf8',
                  fontWeight: 800,
                  whiteSpace: 'nowrap'
                }}
              >
                {total ? `${done}/${total}` : 'sem passos'}
              </span>
              {completeToday ? (
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.18)',
                    color: '#34d399',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Sparkles size={11} /> Sequência concluída
                </span>
              ) : null}
              {victoryBadge ? (
                <span
                  title="Execução desta rotina planejada nas Vitórias do dia"
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: victoryBadge.bg,
                    color: victoryBadge.color,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Trophy size={11} /> {victoryBadge.text}
                </span>
              ) : null}
            </div>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>
              {chosen.description || 'Rotina escolhida para acompanhar o dia.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={openSettings}
            title="Escolher outra rotina para a tela inicial"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#cbd5e1',
              borderRadius: '10px',
              padding: '7px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center'
            }}
          >
            <Settings size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (playClick) playClick();
              onOpenTab?.('routines');
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)',
              color: '#cbd5e1',
              fontWeight: 800,
              fontSize: '0.78rem',
              cursor: 'pointer'
            }}
          >
            Ver em Rotinas
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: rows.length ? '10px' : 0 }}>
        <div className="progress-container" style={{ height: '8px', flex: 1 }}>
          <div
            style={{
              width: `${total ? Math.round((done / total) * 100) : 0}%`,
              height: '100%',
              borderRadius: '999px',
              background: completeToday ? '#34d399' : color,
              boxShadow: completeToday ? '0 0 10px rgba(52, 211, 153, 0.45)' : `0 0 10px ${color}66`,
              transition: 'width 0.35s ease'
            }}
          />
        </div>
        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {done} de {total} hoje
        </span>
      </div>

      {rows.length ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0 0', display: 'flex', flexDirection: 'column' }}>
          {rows.map(({ step, depth }, index) => (
            <StepRow
              // O mesmo ritual pode aparecer em dois ramos: a posição é a chave.
              key={step.habitId || step.activityId || step.routineId || `step-${index}`}
              step={step}
              depth={depth}
              onOpenActivity={onStartNext}
            />
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
          Esta rotina ainda não tem passos. Monte a sequência na aba Rotinas.
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
        <button
          type="button"
          disabled={!next || busy}
          onClick={() => {
            if (!next || busy) return;
            if (playClick) playClick();
            onStartNext?.(next);
          }}
          title={next ? `Fazer agora: ${next.title}` : 'Nada pendente nesta sequência'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 14px',
            borderRadius: '10px',
            border: 'none',
            cursor: next ? 'pointer' : 'not-allowed',
            fontWeight: 800,
            fontSize: '0.82rem',
            background: next ? 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)' : 'rgba(255,255,255,0.06)',
            color: next ? '#0f172a' : '#64748b',
            maxWidth: '100%',
            textAlign: 'left'
          }}
        >
          <Play size={14} />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {next
              ? `Fazer agora: ${next.title}${next.detail ? ` · ${next.detail}` : ''}`
              : 'Nada pendente nesta sequência'}
          </span>
        </button>

        {!victory ? (
          <button
            type="button"
            onClick={askPlan}
            disabled={busy || !total || manualVictoriesFull(dailyVictories, todayStr)}
            title={planDisabledReason || 'Incluir a execução integral desta rotina nas vitórias de hoje'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(251, 191, 36, 0.35)',
              background: 'rgba(251, 191, 36, 0.1)',
              color: '#fbbf24',
              fontWeight: 800,
              fontSize: '0.8rem',
              cursor: (!total || manualVictoriesFull(dailyVictories, todayStr)) ? 'not-allowed' : 'pointer',
              opacity: (!total || manualVictoriesFull(dailyVictories, todayStr)) ? 0.55 : 1
            }}
          >
            <Trophy size={14} /> Incluir nas vitórias de hoje
          </button>
        ) : victory.completed ? (
          <button
            type="button"
            onClick={askReopen}
            disabled={busy}
            title="Reabrir a vitória e estornar as recompensas"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              background: 'rgba(245, 158, 11, 0.1)',
              color: '#fbbf24',
              fontWeight: 800,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Reabrir vitória
          </button>
        ) : (
          <button
            type="button"
            onClick={askComplete}
            disabled={busy || !completeToday}
            title={completeToday ? 'Conquistar a vitória da rotina' : (row ? `${done} de ${total} passos feitos hoje` : '')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '10px',
              border: 'none',
              background: completeToday ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.06)',
              color: completeToday ? '#fff' : '#64748b',
              fontWeight: 800,
              fontSize: '0.8rem',
              cursor: completeToday ? 'pointer' : 'not-allowed'
            }}
          >
            <Trophy size={14} />
            {completeToday ? `Conquistar (+${DAILY_VICTORY_REWARDS.xp} XP)` : 'Conquistar vitória'}
          </button>
        )}

        {victory && !victory.completed && completeToday ? (
          <span style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 700 }}>
            Rotina inteira cumprida — a vitória está pronta.
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" style={{ margin: '10px 0 0', color: '#f87171', fontSize: '0.78rem', fontWeight: 700 }}>
          {error}
        </p>
      ) : null}

      <ConfirmModal
        isOpen={confirm.isOpen}
        title={confirm.mode === 'complete' ? 'Conquistar vitória' : confirm.mode === 'reopen' ? 'Reabrir vitória' : 'Incluir rotina nas vitórias'}
        message={confirm.message}
        confirmText={confirm.mode === 'reopen' ? 'Reabrir' : confirm.mode === 'complete' ? 'Conquistar' : 'Incluir'}
        confirmVariant={confirm.mode === 'reopen' ? 'warning' : 'info'}
        onConfirm={confirmAction}
        onCancel={() => setConfirm({ isOpen: false, mode: null, message: '' })}
      />
    </section>
  );
}
