import React, { useState } from 'react';
import { Compass, CheckCircle2, Clock, MapPin, Sparkles, Flame, Scroll, RefreshCw, ChevronDown, ChevronUp, Trophy, Timer } from 'lucide-react';
import { LOCATIONS, getLocationMeta } from '../utils/locations';
import { PriorityBadge } from './ActivityScaleFields';
import { ActivityTimerBox } from './ActivityTimerBox';
import { consumeActivityTimerMinutes } from '../utils/liveActivityTimers';

export function NextActionCard({
  nextAction,
  locations = LOCATIONS,
  currentLocation,
  onChangeLocation,
  onCompleteQuest,
  onUpdateQuest,
  onToggleHabit,
  onCompleteVictory,
  onOpenQuests,
  onOpenHabits,
  onRefresh,
  onSubmitEnergy,
  onSkipEnergy,
  openRouter,
  onSaveOpenRouterKey,
  onDeclineSuggestion,
  onAcceptDose,
  quests = [],
  oracleMemory = null,
  playClick
}) {
  const [snoozedIds, setSnoozedIds] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [energyText, setEnergyText] = useState('');
  const [energyError, setEnergyError] = useState('');
  const [revisingEnergy, setRevisingEnergy] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [askingWhy, setAskingWhy] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineNote, setDeclineNote] = useState('');
  const [declineError, setDeclineError] = useState('');
  const catalog = (locations && locations.length) ? locations : LOCATIONS;
  const context = nextAction?.context || {};
  const activeLocation = currentLocation || context.location || 'anywhere';

  const primary = nextAction?.primary && !snoozedIds.includes(nextAction.primary.id)
    ? nextAction.primary
    : null;
  const deferred = nextAction?.deferredByLocation || [];
  const energy = nextAction?.energy || null;
  const needsEnergy = revisingEnergy || (nextAction?.needsEnergy !== false && !energy);
  // Sem chave configurada não há como enviar energia: em vez de um campo que
  // não leva a lugar nenhum, o cartão mostra a indicação do motor local.
  const energyBlocking = needsEnergy && !!openRouter?.configured;
  const declineReasons = nextAction?.declineReasons || [];
  const localEnergy = energy?.source === 'local';

  const handleLocation = (id, manual = true) => {
    setSnoozedIds([]);
    if (onChangeLocation) onChangeLocation(id, manual);
  };

  const handleDo = (item) => {
    if (!item) return;
    if (item.kind === 'habit' && onToggleHabit) {
      const durationMinutes = consumeActivityTimerMinutes('habit', item.id);
      onToggleHabit(item.id, null, durationMinutes > 0 ? { durationMinutes } : {});
      return;
    }
    if (item.kind === 'victory' && onCompleteVictory) {
      const durationMinutes = consumeActivityTimerMinutes('victory', item.id);
      onCompleteVictory(item.id, durationMinutes > 0 ? { durationMinutes } : {});
      return;
    }
    if (item.kind === 'quest') {
      if (item.nextSubtask?.id && onUpdateQuest) {
        const quest = (quests || []).find(q => q.id === item.id);
        if (quest) {
          const updatedSubtasks = (quest.subtasks || []).map(st => (
            st.id === item.nextSubtask.id ? { ...st, completed: true } : st
          ));
          onUpdateQuest(quest.id, { subtasks: updatedSubtasks });
          return;
        }
      }
      if (onCompleteQuest) {
        const durationMinutes = consumeActivityTimerMinutes('quest', item.id);
        onCompleteQuest(item.id, durationMinutes > 0 ? { durationMinutes } : {});
      }
    }
  };

  const handleSnooze = (item) => {
    if (!item) return;
    if (playClick) playClick();
    setAskingWhy(true);
    setDeclineError('');
  };

  const handleDecline = async () => {
    if (!primary?.decisionId || !onDeclineSuggestion) {
      setDeclineError('Esta indicação não pode ser recusada ainda. Reprocesse.');
      return;
    }
    if (!declineReason) {
      setDeclineError('Escolha um motivo.');
      return;
    }
    if (declineReason === 'other' && !declineNote.trim()) {
      setDeclineError('Escreva o motivo.');
      return;
    }
    setRefreshing(true);
    setDeclineError('');
    const result = await onDeclineSuggestion({
      decisionId: primary.decisionId,
      reason: declineReason,
      note: declineNote,
      location: activeLocation,
      snoozedIds: [...snoozedIds, primary.id]
    });
    setRefreshing(false);
    if (!result?.ok) {
      setDeclineError(result?.error || 'Não foi possível registrar a recusa.');
      return;
    }
    setSnoozedIds(prev => [...prev, primary.id]);
    setAskingWhy(false);
    setDeclineReason('');
    setDeclineNote('');
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim().startsWith('sk-or-')) {
      setKeyError('A chave do OpenRouter começa com sk-or-.');
      return;
    }
    if (!onSaveOpenRouterKey) return;
    setRefreshing(true);
    setKeyError('');
    const result = await onSaveOpenRouterKey(apiKey.trim());
    setRefreshing(false);
    if (!result?.ok) {
      setKeyError(result?.error || 'Não foi possível guardar a chave.');
      return;
    }
    setApiKey('');
    setKeySaved(true);
  };

  const handleEnergy = async () => {
    if (!energyText.trim()) {
      setEnergyError('Conte como você está agora.');
      return;
    }
    if (!onSubmitEnergy) return;
    setRefreshing(true);
    setEnergyError('');
    const result = await onSubmitEnergy({
      text: energyText.trim(),
      location: activeLocation,
      snoozedIds
    });
    setRefreshing(false);
    if (!result?.ok) {
      setEnergyError(result?.error || 'Não foi possível ler a energia.');
      return;
    }
    setRevisingEnergy(false);
    setEnergyText('');
  };

  const handleSkipEnergy = async () => {
    if (refreshing) return;
    if (!onSkipEnergy) return;
    setRefreshing(true);
    setEnergyError('');
    const result = await onSkipEnergy({ location: activeLocation, snoozedIds });
    setRefreshing(false);
    if (!result?.ok) {
      setEnergyError(result?.error || 'Não foi possível indicar agora.');
      return;
    }
    setRevisingEnergy(false);
    setEnergyText('');
  };

  const handleDose = async (item) => {
    if (!item?.decisionId || !onAcceptDose) return false;
    // O cronômetro da atividade é encerrado junto: sem isto ele seguia
    // rodando depois de "Fiz X min".
    const timerKind = item.kind === 'habit' ? 'habit' : (item.kind === 'victory' ? 'victory' : 'quest');
    const durationMinutes = consumeActivityTimerMinutes(timerKind, item.id);
    const result = await onAcceptDose(item.decisionId, durationMinutes > 0 ? { durationMinutes } : {});
    if (!result?.ok) {
      setRefreshError(result?.error || 'Não foi possível registrar a dose.');
      return false;
    }
    setSnoozedIds(prev => [...prev, item.id]);
    if (onRefresh) onRefresh({ location: activeLocation, snoozedIds: [...snoozedIds, item.id] });
    return true;
  };

  const handleRefresh = async () => {
    if (refreshing || !onRefresh) return;
    if (playClick) playClick();
    setRefreshing(true);
    setRefreshError('');
    try {
      const result = await onRefresh({ location: activeLocation, snoozedIds, consult: true });
      if (result && result.ok === false) {
        setRefreshError(result.error || 'Não foi possível reprocessar agora.');
      }
    } catch (err) {
      setRefreshError(err?.message || 'Não foi possível reprocessar agora.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpen = (item) => {
    if (!item) return;
    if (playClick) playClick();
    if (item.kind === 'habit' && onOpenHabits) onOpenHabits();
    if (item.kind === 'quest' && onOpenQuests) onOpenQuests();
    if (item.kind === 'victory') {
      document.getElementById('vitorias-do-dia')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const locMeta = getLocationMeta(activeLocation, catalog);
  const kindEmoji = { habit: '🔥', victory: '🏆' };
  const collapsedHint = primary
    ? `${kindEmoji[primary.kind] || '📜'} ${primary.title}${primary.dose?.reduced ? ` · Agora: ${primary.dose.label}` : ''}`
    : (nextAction?.emptyReason || 'Nada pendente neste lugar e neste horário.');

  return (
    <div
      className="glass-panel"
      style={{
        padding: collapsed ? '12px 16px' : '16px 20px',
        marginBottom: '24px',
        border: '1px solid rgba(124, 58, 237, 0.28)',
        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.07) 0%, rgba(251, 247, 238, 0.96) 100%)'
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: collapsed ? 0 : '14px' }}>
        <button
          type="button"
          onClick={() => {
            if (playClick) playClick();
            setCollapsed(prev => !prev);
          }}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expandir O Oráculo indica' : 'Recolher O Oráculo indica'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            textAlign: 'left',
            padding: 0,
            minWidth: 0,
            flex: '1 1 240px'
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(168, 85, 247, 0.18)',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c084fc',
              flexShrink: 0
            }}
          >
            <Compass size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 className="font-cinzel" style={{ fontSize: '1.02rem', fontWeight: 800, color: '#e9d5ff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              O Oráculo indica
              {collapsed ? <ChevronDown size={16} color="#c4b5fd" /> : <ChevronUp size={16} color="#c4b5fd" />}
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {collapsed
                ? collapsedHint
                : `Próxima atividade para agora · ${locMeta.emoji} ${locMeta.label}`}
            </p>
          </div>
        </button>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Reprocessar a indicação do Oráculo"
              style={{
                padding: '6px 10px',
                borderRadius: '999px',
                border: '1px solid rgba(168, 85, 247, 0.45)',
                background: refreshing ? 'rgba(168, 85, 247, 0.28)' : 'rgba(168, 85, 247, 0.14)',
                color: '#e9d5ff',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: refreshing ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: refreshing ? 0.85 : 1
              }}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Consultando...' : 'Reprocessar'}
            </button>
          )}
          {!collapsed && catalog.map(loc => {
            const active = loc.id === activeLocation;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => handleLocation(loc.id)}
                title={loc.label}
                style={{
                  padding: '6px 10px',
                  borderRadius: '999px',
                  border: active ? '1px solid rgba(168, 85, 247, 0.6)' : '1px solid rgba(255,255,255,0.1)',
                  background: active ? 'rgba(168, 85, 247, 0.22)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#e9d5ff' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                {loc.emoji} {loc.short}
              </button>
            );
          })}
          {!collapsed && context.locationSource === 'saved' && (
            <button
              type="button"
              onClick={() => handleLocation(null, false)}
              title="Voltar a adivinhar o lugar pelo horário"
              style={{
                padding: '6px 10px',
                borderRadius: '999px',
                border: '1px dashed rgba(255,255,255,0.22)',
                background: 'transparent',
                color: '#94a3b8',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              Automático
            </button>
          )}
        </div>
      </div>

      {collapsed ? null : (
        <>

      {!openRouter?.configured && (
        <OpenRouterKeyPrompt
          value={apiKey}
          error={keyError}
          busy={refreshing}
          onChange={setApiKey}
          onSubmit={handleSaveKey}
        />
      )}

      {openRouter?.configured && keySaved && (
        <p style={{ fontSize: '0.75rem', color: '#86efac', margin: '0 0 10px 0' }}>
          Chave guardada no servidor ({openRouter.hint}).
        </p>
      )}

      {energyBlocking && (
        <EnergyPrompt
          text={energyText}
          error={energyError}
          busy={refreshing}
          onChange={setEnergyText}
          onSubmit={handleEnergy}
          onSkip={handleSkipEnergy}
        />
      )}

      {!needsEnergy && energy && (
        <p style={{ fontSize: '0.78rem', color: '#c4b5fd', margin: '0 0 10px 0' }}>
          Energia {energy.score}/10
          {localEnergy ? ' · lida localmente' : ''}
          <button
            type="button"
            onClick={() => {
              setEnergyText(energy.text || '');
              setRevisingEnergy(true);
            }}
            style={{ marginLeft: '8px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem' }}
          >
            atualizar
          </button>
        </p>
      )}

      {primary && !energyBlocking && (
        <PrimaryRow
          item={primary}
          onDo={handleDo}
          onDose={handleDose}
          onSnooze={handleSnooze}
          onOpen={handleOpen}
          askingWhy={askingWhy}
          declineReasons={declineReasons}
          declineReason={declineReason}
          declineNote={declineNote}
          declineError={declineError}
          onReason={setDeclineReason}
          onNote={setDeclineNote}
          onConfirmDecline={handleDecline}
          onCancelDecline={() => setAskingWhy(false)}
        />
      )}
      {!primary && !energyBlocking && (
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px dashed rgba(255,255,255,0.12)',
            color: '#94a3b8',
            fontSize: '0.88rem'
          }}
        >
          {nextAction?.emptyReason || 'Nada pendente neste lugar e neste horário.'}
        </div>
      )}

      {refreshError && (
        <p style={{ fontSize: '0.75rem', color: '#fda4af', margin: '10px 0 0 0' }}>{refreshError}</p>
      )}

      {(nextAction?.trace || []).length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <button
            type="button"
            onClick={() => setShowTrace(prev => !prev)}
            style={quietButtonStyle}
          >
            {showTrace ? 'Ocultar processo' : 'Ver processo'}
          </button>
          {showTrace && <OracleTrace trace={nextAction.trace} />}
        </div>
      )}

      {oracleMemory && (
        <div style={{ marginTop: '12px' }}>
          <button
            type="button"
            onClick={() => setShowMemory(prev => !prev)}
            style={quietButtonStyle}
          >
            {showMemory ? 'Ocultar memória' : 'Memória do Oráculo'}
          </button>
          {showMemory && <OracleMemoryPanel memory={oracleMemory} />}
        </div>
      )}

      {nextAction?.source === 'heuristic' && nextAction?.jevError && (
        <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '8px' }}>
          O Oráculo usou o histórico local nesta rodada.
        </p>
      )}

      {deferred.length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {deferred.map(d => (
            <button
              key={d.location}
              type="button"
              onClick={() => handleLocation(d.location)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#94a3b8',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              <MapPin size={12} />
              {d.count} te espera{d.count === 1 ? '' : 'm'} em {d.locationLabel}
            </button>
          ))}
        </div>
      )}

      {(nextAction?.deferredByTime || []).length > 0 && (
        <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '10px' }}>
          Depois, neste lugar:{' '}
          {nextAction.deferredByTime.map(d => {
            const windowLabel = d.timeWindow ? `${d.timeWindow.start}–${d.timeWindow.end}` : '';
            return windowLabel ? `${d.title} (${windowLabel})` : d.title;
          }).join(' · ')}
        </p>
      )}
        </>
      )}
    </div>
  );
}

const TRACE_LABELS = {
  energy: '1. Energia',
  'energy-fallback': '1b. Energia (leitura local)',
  filter: '2. Filtro local',
  choice: '3. Escolha da atividade',
  quantity: '4. Quantidade da tarefa',
  dose: '5. Dose sugerida',
  fallback: 'Atalho local',
  error: 'Falha'
};

const OUTCOME_LABEL = {
  accepted: 'aceita',
  declined: 'recusada',
  pending: 'aguardando',
  expired: 'expirada',
  superseded: 'substituída'
};

const OUTCOME_COLOR = {
  accepted: '#86efac',
  declined: '#fda4af',
  pending: '#e9d5ff',
  expired: '#94a3b8',
  superseded: '#94a3b8'
};

const memoryLineStyle = {
  fontSize: '0.75rem',
  color: '#cbd5e1',
  margin: 0
};

const memoryChipStyle = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: '#e9d5ff',
  background: 'rgba(168, 85, 247, 0.14)',
  border: '1px solid rgba(168, 85, 247, 0.35)',
  borderRadius: '999px',
  padding: '3px 9px'
};

/**
 * Retrato da memória do Oráculo: até agora os aceites e recusas só existiam
 * dentro do prompt do Jev e não apareciam em lugar nenhum.
 */
function OracleMemoryPanel({ memory }) {
  const counts = memory?.counts || {};
  const bands = Object.entries(memory?.byBand || {});
  const recent = memory?.recent || [];
  return (
    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <p style={memoryLineStyle}>
        {memory?.lastEnergy
          ? `Última energia: ${memory.lastEnergy.score}/10`
          : 'Sem leitura de energia recente.'}
        {memory?.acceptanceRate != null
          ? ` · ${memory.acceptanceRate}% de aceite em ${memory.answered} resposta(s)`
          : ' · nenhuma indicação respondida ainda'}
      </p>
      <p style={memoryLineStyle}>
        {counts.accepted || 0} aceitas · {counts.declined || 0} recusadas · {counts.pending || 0} aguardando
        {' · '}{counts.expired || 0} expiradas
      </p>
      {bands.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {bands.map(([band, data]) => (
            <span key={band} style={memoryChipStyle}>
              energia {band}: {data.accepted || 0} ok / {data.declined || 0} não
            </span>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {recent.slice(0, 6).map(item => (
            <p key={item.id} style={memoryLineStyle}>
              <span style={{ color: OUTCOME_COLOR[item.outcome] || '#94a3b8', fontWeight: 700 }}>
                {OUTCOME_LABEL[item.outcome] || item.outcome}
              </span>
              {' · '}{item.title}
              {item.energyScore != null ? ` · energia ${item.energyScore}` : ''}
              {item.declineReason ? ` · ${item.declineReason}` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function OracleTrace({ trace }) {
  return (
    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {(trace || []).map((entry, index) => (
        <details key={`${entry.step}-${index}`} open={index === 0} className="oracle-trace-step">
          <summary>
            {TRACE_LABELS[entry.step] || entry.step}
            {entry.cached ? ' · reutilizado' : ''}
            {entry.ok === false ? ' · falhou' : ''}
          </summary>
          {entry.note && <p className="oracle-trace-note">{entry.note}</p>}
          {entry.error && <p className="oracle-trace-error">{entry.error}</p>}
          {entry.request && (
            <>
              <p className="oracle-trace-label">Enviado ao Jev</p>
              <pre className="oracle-trace-json">{JSON.stringify(entry.request, null, 2)}</pre>
            </>
          )}
          {entry.response && (
            <>
              <p className="oracle-trace-label">Resposta</p>
              <pre className="oracle-trace-json">{JSON.stringify(entry.response, null, 2)}</pre>
            </>
          )}
        </details>
      ))}
    </div>
  );
}

function OpenRouterKeyPrompt({ value, error, busy, onChange, onSubmit }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <p style={{ fontSize: '0.9rem', color: '#e9d5ff', fontWeight: 700, margin: '0 0 6px 0' }}>
        Chave do OpenRouter
      </p>
      <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 8px 0' }}>
        Fica só no servidor. O navegador não a recebe de volta.
      </p>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="sk-or-..."
        autoComplete="off"
        style={{
          width: '100%',
          borderRadius: '10px',
          border: '1px solid rgba(124, 58, 237, 0.35)',
          background: '#fbf7ee',
          color: '#2a2118',
          padding: '10px 12px',
          font: 'inherit'
        }}
      />
      {error && <p style={{ color: '#9f1239', fontSize: '0.75rem', margin: '6px 0 0 0' }}>{error}</p>}
      <button type="button" onClick={onSubmit} disabled={busy} style={{ ...primaryButtonStyle, marginTop: '8px' }}>
        {busy ? 'Guardando...' : 'Guardar chave'}
      </button>
    </div>
  );
}

function EnergyPrompt({ text, error, busy, onChange, onSubmit, onSkip }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <p style={{ fontSize: '0.9rem', color: '#e9d5ff', fontWeight: 700, margin: '0 0 8px 0' }}>
        Como você está agora?
      </p>
      <textarea
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ex.: cansado, mas consigo fazer algo curto"
        rows={2}
        style={{
          width: '100%',
          resize: 'vertical',
          borderRadius: '10px',
          border: '1px solid rgba(124, 58, 237, 0.35)',
          background: '#fbf7ee',
          color: '#2a2118',
          padding: '10px 12px',
          font: 'inherit'
        }}
      />
      {error && <p style={{ color: '#9f1239', fontSize: '0.75rem', margin: '6px 0 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button type="button" onClick={onSubmit} disabled={busy} style={primaryButtonStyle}>
          {busy ? 'Lendo...' : 'Enviar'}
        </button>
        <button type="button" onClick={onSkip} style={quietButtonStyle}>Pular</button>
      </div>
    </div>
  );
}

const primaryButtonStyle = {
  padding: '9px 14px',
  borderRadius: '10px',
  background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
  color: '#fff',
  fontWeight: 800,
  fontSize: '0.82rem',
  border: 'none',
  cursor: 'pointer'
};

const quietButtonStyle = {
  padding: '9px 12px',
  borderRadius: '10px',
  background: 'rgba(255,255,255,0.06)',
  color: '#94a3b8',
  fontWeight: 700,
  fontSize: '0.78rem',
  border: '1px solid rgba(255,255,255,0.1)',
  cursor: 'pointer'
};

function PrimaryRow({
  item,
  onDo,
  onDose,
  onSnooze,
  onOpen,
  askingWhy,
  declineReasons,
  declineReason,
  declineNote,
  declineError,
  onReason,
  onNote,
  onConfirmDecline,
  onCancelDecline
}) {
  const isHabit = item.kind === 'habit';
  const isVictory = item.kind === 'victory';
  const kindLabel = isVictory ? 'Vitória do dia' : (isHabit ? 'Ritual' : 'Missão');
  const KindIcon = isVictory ? Trophy : (isHabit ? Flame : Scroll);
  const hasDose = !!item.dose?.reduced;
  // Com dose na tela, o segundo botão é o caminho "fiz tudo": o rótulo precisa
  // deixar claro o que ele conclui (e não prometer "inteiro" quando ele só
  // avança um passo da missão).
  const fullActionLabel = isVictory
    ? 'Concluir vitória'
    : isHabit
      ? (hasDose ? 'Marcar ritual inteiro' : 'Marcar ritual')
      : item.nextSubtask
        ? 'Avançar passo'
        : (hasDose ? 'Concluir missão inteira' : 'Concluir');
  const fullActionTitle = item.nextSubtask
    ? `Avançar o próximo passo: ${item.nextSubtask.title}`
    : `Concluir a atividade inteira: ${item.title}`;
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: '14px',
        background: '#fbf7ee',
        border: '1px solid rgba(124, 58, 237, 0.25)'
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <button
          type="button"
          onClick={() => onOpen(item)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
            flex: '1 1 240px',
            minWidth: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '999px',
                background: isVictory ? 'rgba(154, 52, 18, 0.12)' : (isHabit ? 'rgba(159, 18, 57, 0.12)' : 'rgba(154, 52, 18, 0.12)'),
                color: isVictory ? '#9a3412' : (isHabit ? '#9f1239' : '#9a3412'),
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <KindIcon size={11} />
              {kindLabel}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              {item.locationEmoji} {item.locationLabel}
            </span>
            {item.category && (
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.category}</span>
            )}
            {item.priority && <PriorityBadge priority={item.priority} compact />}
          </div>
          {/* O título diz O QUE fazer; a dose diz POR QUANTO TEMPO começar.
              Antes a dose substituía o título e o cartão mostrava só
              "Agora: 10 min", sem dizer a que se referia. */}
          <h4 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#2a2118', margin: '0 0 4px 0' }}>
            {item.title}
          </h4>
          {item.dose?.reduced && (
            <p
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.84rem',
                fontWeight: 800,
                color: '#6d28d9',
                background: 'rgba(109, 40, 217, 0.08)',
                border: '1px solid rgba(109, 40, 217, 0.22)',
                borderRadius: '999px',
                padding: '3px 10px',
                margin: '0 0 6px 0'
              }}
            >
              <Timer size={13} />
              Agora: {item.dose.label}
              {item.quantity?.label ? ` de ${item.quantity.label}` : ''}
              {item.dose.fraction === 'start' ? ' (dose de partida)' : ''}
            </p>
          )}
          {item.nextSubtask?.title && (
            <p style={{ fontSize: '0.82rem', color: '#6d28d9', margin: '0 0 4px 0' }}>
              Próximo passo: {item.nextSubtask.title}
            </p>
          )}
          <p style={{ fontSize: '0.8rem', color: item.abstained ? '#b45309' : '#94a3b8', margin: 0 }}>
            {item.reason}
          </p>
        </button>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {/* Com dose sugerida, os dois caminhos precisam existir: fazer só o
              começo (dose) ou concluir a atividade inteira de uma vez. */}
          {item.dose?.reduced && (
            <button
              type="button"
              onClick={() => onDose(item)}
              title="Registrar só o começo sugerido"
              style={{
                padding: '9px 14px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.82rem',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <CheckCircle2 size={15} />
              Fiz {item.dose.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDo(item)}
            title={fullActionTitle}
            style={{
              padding: '9px 14px',
              borderRadius: '10px',
              background: item.dose?.reduced
                ? 'rgba(16, 185, 129, 0.14)'
                : 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
              color: item.dose?.reduced ? '#047857' : '#fff',
              fontWeight: 800,
              fontSize: '0.82rem',
              border: item.dose?.reduced ? '1px solid rgba(16, 185, 129, 0.55)' : 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <CheckCircle2 size={15} />
            {fullActionLabel}
          </button>
          <button
            type="button"
            onClick={() => onSnooze(item)}
            style={{
              padding: '9px 12px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)',
              color: '#94a3b8',
              fontWeight: 700,
              fontSize: '0.78rem',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Clock size={14} /> Agora não
          </button>
        </div>
      </div>
      {askingWhy && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#e9d5ff', fontWeight: 700 }}>Por que não agora?</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {declineReasons.map(reason => (
              <button
                key={reason.id}
                type="button"
                onClick={() => onReason(reason.id)}
                style={{
                  ...quietButtonStyle,
                  color: declineReason === reason.id ? '#e9d5ff' : '#94a3b8',
                  borderColor: declineReason === reason.id ? 'rgba(168, 85, 247, 0.6)' : 'rgba(255,255,255,0.1)'
                }}
              >
                {reason.label}
              </button>
            ))}
          </div>
          {declineReason === 'other' && (
            <textarea
              value={declineNote}
              onChange={(event) => onNote(event.target.value)}
              rows={2}
              placeholder="Escreva o motivo"
              style={{ borderRadius: '10px', border: '1px solid rgba(61, 46, 31, 0.16)', background: '#fbf7ee', color: '#2a2118', padding: '8px 10px' }}
            />
          )}
          {declineError && <p style={{ color: '#9f1239', fontSize: '0.75rem', margin: 0 }}>{declineError}</p>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onConfirmDecline} style={primaryButtonStyle}>Guardar motivo</button>
            <button type="button" onClick={onCancelDecline} style={quietButtonStyle}>Cancelar</button>
          </div>
        </div>
      )}

      {(item.xpReward || item.coinReward) && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px', fontSize: '0.75rem', color: '#fbbf24', fontWeight: 700 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Sparkles size={12} /> +{item.xpReward || 0} XP
          </span>
          <span style={{ color: '#38bdf8' }}>+{item.coinReward || 0} 🪙</span>
        </div>
      )}

      <div style={{ marginTop: '12px' }}>
        <ActivityTimerBox
          kind={isVictory ? 'victory' : (isHabit ? 'habit' : 'quest')}
          id={item.id}
          label={isVictory ? 'Cronômetro da Vitória' : (isHabit ? 'Cronômetro do Ritual' : 'Cronômetro da Missão')}
          accent={isHabit ? '#9f1239' : '#c2410c'}
          compact
        />
      </div>
    </div>
  );
}
