import { motion } from 'framer-motion';
import type { TaskRecord } from '../hooks/useTaskHistory';

interface Props {
  history: TaskRecord[];
  onClear: () => void;
  onRerun: (task: string) => void;
  onView: (record: TaskRecord) => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function estimateCost(usage: { input: number; output: number }): string {
  // Sonnet 4.6 pricing: $3/MTok in, $15/MTok out
  const cost = (usage.input / 1_000_000) * 3 + (usage.output / 1_000_000) * 15;
  if (cost < 0.001) return '<$0.001';
  return `~$${cost.toFixed(3)}`;
}

function deriveTitle(task: string): string {
  const clean = task.trim().replace(/\s+/g, ' ');
  // Skip leading filler words when building the title
  const FILLER = new Set(['please', 'can', 'you', 'could', 'i', 'want', 'need', 'to', 'help', 'me']);
  const words = clean.split(' ');
  const meaningful = words.filter((w, i) => i > 0 || !FILLER.has(w.toLowerCase()));
  const title = meaningful.slice(0, 6).join(' ');
  return (title.length > 48 ? title.slice(0, 48).trimEnd() : title) + (meaningful.length > 6 ? '…' : '');
}

export default function TaskHistoryPanel({ history, onClear, onRerun, onView }: Props) {
  if (history.length === 0) {
    return (
      <div className="history-empty">
        <div className="history-empty-icon" aria-hidden="true" />
        <p>No completed tasks yet.</p>
        <p className="history-empty-sub">Finished tasks will appear here.</p>
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-header">
        <span className="history-count">{history.length} task{history.length !== 1 ? 's' : ''}</span>
        <button className="history-clear-btn" onClick={onClear}>Clear all</button>
      </div>
      <div className="history-list">
        {history.map((rec, i) => (
          <motion.div
            key={rec.id}
            className="history-item"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <div className="history-item-top">
              <div className="history-item-dots">
                {rec.agents.slice(0, 5).map((a, j) => (
                  <div key={j} className="history-agent-dot" style={{ background: a.color, boxShadow: `0 0 4px ${a.color}60` }} title={a.name} />
                ))}
              </div>
              <span className="history-time">{formatDate(rec.timestamp)}</span>
            </div>
            <p className="history-item-title">{deriveTitle(rec.task)}</p>
            <p className="history-task-sub">{rec.task}</p>
            <div className="history-meta">
              <span className="history-badge history-badge-mode">{rec.mode}</span>
              {rec.duration > 0 && <span className="history-badge">{formatDuration(rec.duration)}</span>}
              {rec.actionsCount > 0 && <span className="history-badge">{rec.actionsCount} actions</span>}
              {(rec.tokenUsage.input + rec.tokenUsage.output) > 0 && (
                <span className="history-badge history-badge-tokens" title={`${rec.tokenUsage.input.toLocaleString()} in + ${rec.tokenUsage.output.toLocaleString()} out`}>
                  {estimateCost(rec.tokenUsage)}
                </span>
              )}
            </div>
            <div className="history-item-actions">
              {rec.snapshot && (
                <button className="history-view-btn" onClick={() => onView(rec)}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.1"/>
                    <circle cx="5" cy="5" r="1.2" fill="currentColor"/>
                  </svg>
                  View result
                </button>
              )}
              <button className="history-rerun-btn" onClick={() => onRerun(rec.task)}>&#8635; Re-run</button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
