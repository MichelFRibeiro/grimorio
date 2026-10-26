import React, { useMemo } from 'react';
import {
  BookMarked,
  BookOpen,
  Flame,
  Hourglass,
  Layers,
  Network,
  NotebookPen,
  Pill,
  Scale,
  Scroll,
  Target,
  Trophy
} from 'lucide-react';
import { formatDurationLabel } from '../utils/activityDuration';
import { buildDayTimeline } from '../utils/dayTimeline';

const ICONS = {
  habit: Flame,
  quest: Scroll,
  reading: BookOpen,
  scripture: BookMarked,
  agu: Scale,
  questions: Target,
  mindmap: Network,
  journal: NotebookPen,
  supplement: Pill,
  review: Pill,
  process: Layers,
  fasting: Hourglass,
  victory: Trophy
};

function countLabel(count) {
  if (!count) return 'Nada registrado hoje';
  return count === 1 ? '1 atividade' : `${count} atividades`;
}

export function HomeTimelineCard({
  source = null,
  todayStr = '',
  featureSettings = null,
  onOpenTab,
  playClick
}) {
  const timeline = useMemo(() => {
    try {
      return buildDayTimeline(source || {}, todayStr, { featureSettings });
    } catch {
      return { date: todayStr, count: 0, minutes: 0, events: [] };
    }
  }, [source, todayStr, featureSettings]);

  const events = timeline.events || [];
  const minutesLabel = formatDurationLabel(timeline.minutes);
  const summary = minutesLabel
    ? `${countLabel(timeline.count)} · ${minutesLabel}`
    : countLabel(timeline.count);

  const openEvent = (item) => {
    playClick?.();
    if (item.kind === 'victory') {
      document.getElementById('vitorias-do-dia')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (item.tab) {
      onOpenTab?.(item.tab);
      window.setTimeout(() => {
        document.querySelector('main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  return (
    <section className="day-timeline" aria-label="Linha do tempo do dia">
      <header className="day-timeline-head">
        <div className="day-timeline-copy">
          <h2 className="font-cinzel">Linha do tempo</h2>
          <p>{summary}</p>
        </div>
        {timeline.count > 0 && (
          <span className="day-timeline-count">{timeline.count}</span>
        )}
      </header>

      {events.length === 0 ? (
        <p className="day-timeline-empty">O que for feito hoje aparece aqui, na ordem do dia.</p>
      ) : (
        <ol className="day-timeline-list">
          {events.map((item) => {
            const Icon = ICONS[item.kind] || Scroll;
            const label = [item.timeLabel || 'sem horário', item.title, item.detail].filter(Boolean).join('. ');
            return (
              <li key={item.id} className="day-timeline-item">
                <button type="button" onClick={() => openEvent(item)} aria-label={label}>
                  <time className="day-timeline-time" dateTime={item.at || undefined}>
                    {item.timeLabel || '–'}
                  </time>
                  <span className="day-timeline-rail" aria-hidden="true" />
                  <span className="day-timeline-body">
                    <span className="day-timeline-icon" aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    <span className="day-timeline-text">
                      <strong>{item.title}</strong>
                      {item.detail ? <small>{item.detail}</small> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
