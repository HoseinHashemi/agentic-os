import { useEffect, useRef } from 'react';
import type { TimelineEvent } from '../types';

interface Props {
  events: TimelineEvent[];
  startTime: number;
}

const TYPE_ICONS: Record<TimelineEvent['type'], string> = {
  task_start: '◆',
  phase_change: '◈',
  agent_spawned: '⊕',
  agent_action: '▸',
  communication: '⇢',
  evaluation: '◎',
  qa_event: '⊛',
  insight: '✦',
  complete: '◉',
};

const TYPE_LABELS: Record<TimelineEvent['type'], string> = {
  task_start: 'Task',
  phase_change: 'Phase',
  agent_spawned: 'Spawn',
  agent_action: 'Action',
  communication: 'Signal',
  evaluation: 'Eval',
  qa_event: 'QA',
  insight: 'Insight',
  complete: 'Done',
};

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `${m}m ${sec}s`;
  return `${s}s`;
}

export default function Timeline({ events, startTime }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (!userScrolledRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledRef.current = !isAtBottom;
  }

  if (events.length === 0) {
    return (
      <div className="timeline">
        <div className="timeline-header">
          <span className="timeline-title">Timeline</span>
        </div>
        <div className="timeline-empty">
          <span>Events will appear here as agents work</span>
        </div>
      </div>
    );
  }

  return (
    <div className="timeline">
      <div className="timeline-header">
        <span className="timeline-title">Timeline</span>
        <span className="timeline-count">{events.length} events</span>
      </div>
      <div className="timeline-list" ref={listRef} onScroll={handleScroll}>
        {events.map((ev) => (
          <div key={ev.id} className={`timeline-event type-${ev.type}`}>
            <div className="tl-left">
              <span
                className="tl-icon"
                style={{ color: ev.agentColor ?? typeColor(ev.type) }}
              >
                {TYPE_ICONS[ev.type]}
              </span>
              <div className="tl-line" />
            </div>
            <div className="tl-body">
              <div className="tl-meta">
                <span className="tl-type-label" style={{ color: ev.agentColor ?? typeColor(ev.type) }}>
                  {TYPE_LABELS[ev.type]}
                </span>
                {ev.agentName && (
                  <span className="tl-agent" style={{ color: ev.agentColor }}>
                    {ev.agentName}
                  </span>
                )}
                <span className="tl-time">{formatTime(ev.timestamp)}</span>
              </div>
              <p className="tl-desc">{ev.description}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function typeColor(type: TimelineEvent['type']): string {
  switch (type) {
    case 'task_start': return '#6366f1';
    case 'phase_change': return '#a78bfa';
    case 'agent_spawned': return '#34d399';
    case 'agent_action': return '#60a5fa';
    case 'communication': return '#f59e0b';
    case 'evaluation': return '#818cf8';
    case 'insight': return '#f472b6';
    case 'complete': return '#34d399';
    default: return '#64748b';
  }
}
