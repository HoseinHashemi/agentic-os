import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Insight } from '../types';

interface Props {
  insights: Insight[];
}

export default function InsightsPanel({ insights }: Props) {
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (insights.length > 0) setMinimized(false);
  }, [insights.length]);

  if (insights.length === 0) return null;

  return (
    <motion.div
      className={`insights-panel ${minimized ? 'minimized' : ''}`}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="insights-header" onClick={() => setMinimized(m => !m)}>
        <span className="insights-title">
          <span className="insights-icon">✦</span>
          Synthesis
          <span className="insights-count-badge">{insights.length}</span>
        </span>
        <button className="insights-toggle-btn" onClick={e => { e.stopPropagation(); setMinimized(m => !m); }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d={minimized ? 'M2 6.5l3-3 3 3' : 'M2 3.5l3 3 3-3'}
              stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {!minimized && (
          <motion.div
            className="insights-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="insights-scroll">
              <AnimatePresence>
                {insights.map((ins, i) => (
                  <InsightCard key={ins.id} insight={ins} index={i} />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function InsightCard({ insight: ins, index }: { insight: Insight; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = ins.content.length > 200;

  const accentBar = ins.contributorColors.length > 1
    ? `linear-gradient(90deg, ${ins.contributorColors.map((c, i) => `${c} ${(i / (ins.contributorColors.length - 1)) * 100}%`).join(', ')})`
    : ins.contributorColors[0] ?? '#6366f1';

  return (
    <motion.div
      className="insight-card"
      initial={{ opacity: 0, x: -16, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: index * 0.06 }}
    >
      <div className="insight-accent" style={{ background: accentBar }} />

      <div className="insight-body">
        <h3 className="insight-title">{ins.title}</h3>

        <p className={`insight-content ${expanded ? 'expanded' : ''}`}>
          {ins.content}
        </p>

        {canExpand && (
          <button className="insight-expand-btn" onClick={() => setExpanded(e => !e)}>
            {expanded
              ? <><ChevronUpIcon /> less</>
              : <><ChevronDownIcon /> more</>
            }
          </button>
        )}

        <div className="insight-footer">
          <div className="insight-contributors">
            {ins.contributorNames.map((name, i) => (
              <span key={name} className="contributor-chip" style={{ '--chip-color': ins.contributorColors[i] } as React.CSSProperties}>
                <span className="chip-dot" />
                {name}
              </span>
            ))}
          </div>
          <div className="insight-meta-right">
            <span className="insight-cat-label">{ins.category}</span>
            <ConfidenceBar confidence={ins.confidence} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 90 ? '#34d399' : pct >= 75 ? '#60a5fa' : '#f59e0b';
  return (
    <div className="conf-bar" title={`${pct}% confidence`}>
      <div className="conf-track">
        <div className="conf-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="conf-label" style={{ color }}>{pct}%</span>
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ marginRight: 3 }}>
      <path d="M1.5 3l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ marginRight: 3 }}>
      <path d="M1.5 6l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
