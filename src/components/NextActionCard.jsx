import React, { useMemo, useState } from 'react';
import { Compass, CheckCircle2, Clock, MapPin, Sparkles, Flame, Scroll, RefreshCw } from 'lucide-react';
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
  onOpenQuests,
  onOpenHabits,
  onRefresh,
  quests = [],
  playClick
}) {
  const [snoozedIds, setSnoozedIds] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const catalog = (locations && locations.length) ? locations : LOCATIONS;
  const context = nextAction?.context || {};
  const activeLocation = currentLocation || context.location || 'anywhere';

  const visible = useMemo(() => {
    const list = [];
    if (nextAction?.primary) list.push(nextAction.primary);
    (nextAction?.queue || []).forEach(item => list.push(item));
    return list.filter(item => item && !snoozedIds.includes(item.id));
  }, [nextAction, snoozedIds]);

  const primary = visible[0] || null;
  const queue = visible.slice(1, 4);
  const extras = (nextAction?.extras || []).filter(e => e && !snoozedIds.includes(e.id) && e.id !== primary?.id).slice(0, 2);
  const deferred = nextAction?.deferredByLocation || [];

  const handleLocation = (id) => {
    setSnoozedIds([]);
    if (onChangeLocation) onChangeLocation(id, true);
  };

  const handleDo = (item) => {
    if (!item) return;
    if (item.kind === 'habit' && onToggleHabit) {
      const durationMinutes = consumeActivityTimerMinutes('habit', item.id);
      onToggleHabit(item.id, null, durationMinutes > 0 ? { durationMinutes } : {});
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
    setSnoozedIds(prev => [...prev, item.id]);
  };

  const handleRefresh = async () => {
    if (refreshing || !onRefresh) return;
    if (playClick) playClick();
    setRefreshing(true);
    try {
      await onRefresh({ snoozedIds });
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpen = (item) => {
    if (!item) return;
    if (playClick) playClick();
    if (item.kind === 'habit' && onOpenHabits) onOpenHabits();
    if (item.kind === 'quest' && onOpenQuests) onOpenQuests();
  };

  const locMeta = getLocationMeta(activeLocation, catalog);

  return (
    <div
      className="glass-panel"
      style={{
        padding: '16px 20px',
        marginBottom: '24px',
        border: '1px solid rgba(168, 85, 247, 0.28)',
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(19, 23, 34, 0.92) 100%)'
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              color: '#c084fc'
            }}
          >
            <Compass size={18} />
          </div>
          <div>
            <h3 className="font-cinzel" style={{ fontSize: '1.02rem', fontWeight: 800, color: '#e9d5ff', margin: 0 }}>
              O Oráculo indica
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
              Próxima atividade para agora · {locMeta.emoji} {locMeta.label}
            </p>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Reprocessar a indicação do Oráculo"
              style={{
                marginLeft: '4px',
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
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          {catalog.map(loc => {
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
        </div>
      </div>

      {primary ? (
        <PrimaryRow
          item={primary}
          onDo={handleDo}
          onSnooze={handleSnooze}
          onOpen={handleOpen}
        />
      ) : (
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

      {queue.length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {queue.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleOpen(item)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: '#cbd5e1',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', width: '16px' }}>{idx + 2}</span>
              <span style={{ fontSize: '0.95rem' }}>{item.kind === 'habit' ? '🔥' : '📜'}</span>
              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>{item.title}</span>
              {item.priority && <PriorityBadge priority={item.priority} compact />}
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{item.locationEmoji}</span>
            </button>
          ))}
        </div>
      )}

      {extras.length > 0 && !queue.length && (
        <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '10px' }}>
          Extra da semana: {extras.map(e => e.title).join(' · ')}
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
    </div>
  );
}

function PrimaryRow({ item, onDo, onSnooze, onOpen }) {
  const isHabit = item.kind === 'habit';
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: '14px',
        background: 'rgba(15, 18, 28, 0.7)',
        border: '1px solid rgba(168, 85, 247, 0.25)'
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
                background: isHabit ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: isHabit ? '#fb7185' : '#fbbf24',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {isHabit ? <Flame size={11} /> : <Scroll size={11} />}
              {isHabit ? 'Ritual' : 'Missão'}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              {item.locationEmoji} {item.locationLabel}
            </span>
            {item.category && (
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.category}</span>
            )}
            {item.priority && <PriorityBadge priority={item.priority} compact />}
          </div>
          <h4 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 4px 0' }}>
            {item.title}
          </h4>
          {item.nextSubtask?.title && (
            <p style={{ fontSize: '0.82rem', color: '#c4b5fd', margin: '0 0 4px 0' }}>
              Próximo passo: {item.nextSubtask.title}
            </p>
          )}
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
            {item.reason}
          </p>
        </button>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => onDo(item)}
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
            {isHabit ? 'Marcar ritual' : (item.nextSubtask ? 'Avançar passo' : 'Concluir')}
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
          kind={isHabit ? 'habit' : 'quest'}
          id={item.id}
          label={isHabit ? 'Cronômetro do Ritual' : 'Cronômetro da Missão'}
          accent={isHabit ? '#f87171' : '#fbbf24'}
          compact
        />
      </div>
    </div>
  );
}
