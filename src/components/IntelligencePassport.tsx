import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PassportData, Learning, KnowledgeDepth } from '../intelligence/types';
import type { DemoMode } from '../intelligence/useIntelligence';

interface Props {
  passport: PassportData;
  highlightedAgentId: string | null;
  onLearningHover: (agentIds: string[]) => void;
  onLearningLeave: () => void;
  demoMode: DemoMode;
  onDemoModeChange: (mode: DemoMode) => void;
}

const KNOWLEDGE_LABELS: Record<keyof KnowledgeDepth, string> = {
  workStyle:          'Work Style',
  outputPreferences:  'Output Prefs',
  domainExpertise:    'Domain Depth',
  taskPatterns:       'Task Patterns',
  communicationStyle: 'Comm Style',
};

const KNOWLEDGE_COLORS: Record<keyof KnowledgeDepth, string> = {
  workStyle:          '#f59e0b',
  outputPreferences:  '#818cf8',
  domainExpertise:    '#3b82f6',
  taskPatterns:       '#34d399',
  communicationStyle: '#f472b6',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days >= 7) return `${Math.floor(days/7)} week${Math.floor(days/7)>1?'s':''} ago`;
  if (days > 0) return `${days} day${days>1?'s':''} ago`;
  if (hours > 0) return `${hours} hour${hours>1?'s':''} ago`;
  if (mins > 0) return `${mins} minute${mins>1?'s':''} ago`;
  return 'Just now';
}

function KnowledgeCircle({ label, value, color }: { label: string; value: number; color: string }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const filled = circ * value;
  return (
    <div className="kc-item">
      <svg width="44" height="44" viewBox="0 0 44 44">
        <defs>
          <filter id={`glow-${label.replace(/\s/g,'')}`}>
            <feGaussianBlur stdDeviation="1.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5"/>
        {/* Fill */}
        <motion.circle
          cx="22" cy="22" r={r} fill="none"
          stroke={color} strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          strokeDashoffset={circ * 0.25}
          transform="rotate(-90 22 22)"
          filter={`url(#glow-${label.replace(/\s/g,'')})`}
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${filled} ${circ}` }}
          transition={{ duration: 1.2, ease: [0.16,1,0.3,1], delay: 0.2 }}
        />
        {/* Center pct */}
        <text x="22" y="26" textAnchor="middle" fontSize="8" fill={color} fontWeight="600" fontFamily="Inter, sans-serif">
          {Math.round(value * 100)}%
        </text>
      </svg>
      <span className="kc-label">{label}</span>
    </div>
  );
}

function LearningEntry({ learning, isHighlighted, onHover, onLeave }: {
  learning: Learning;
  isHighlighted: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const catColors: Record<Learning['category'], string> = {
    preference: '#f59e0b', pattern: '#34d399', domain: '#3b82f6',
    style: '#f472b6', workflow: '#818cf8',
  };
  return (
    <motion.div
      className={`learning-entry ${isHighlighted ? 'highlighted' : ''}`}
      onMouseEnter={onHover} onMouseLeave={onLeave}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.16,1,0.3,1] }}
    >
      <span className="learning-dot" style={{ background: catColors[learning.category] }} />
      <div className="learning-body">
        <span className="learning-text">{learning.text}</span>
        <span className="learning-time">{timeAgo(learning.timestamp)}</span>
      </div>
    </motion.div>
  );
}

export default function IntelligencePassport({ passport, highlightedAgentId, onLearningHover, onLearningLeave, demoMode, onDemoModeChange }: Props) {
  const [activeTab, setActiveTab] = useState<'overview'|'learnings'>('overview');

  const hasData = passport.tasksCompleted > 0;
  if (!hasData) return null;

  const knowledgeEntries = Object.entries(passport.knowledge) as Array<[keyof KnowledgeDepth, number]>;

  return (
    <motion.div
      className="passport-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16,1,0.3,1] }}
    >
      {/* Header */}
      <div className="passport-header">
        <div className="passport-title-row">
          <span className="passport-icon">◈</span>
          <span className="passport-title">Intelligence Passport</span>
          <span className="passport-tasks">{passport.tasksCompleted} task{passport.tasksCompleted !== 1 ? 's' : ''}</span>
        </div>
        <div className="passport-tabs">
          <button className={`passport-tab ${activeTab==='overview'?'active':''}`} onClick={()=>setActiveTab('overview')}>Overview</button>
          <button className={`passport-tab ${activeTab==='learnings'?'active':''}`} onClick={()=>setActiveTab('learnings')}>
            Learnings {passport.learnings.length > 0 && <span className="tab-badge">{passport.learnings.length}</span>}
          </button>
        </div>
      </div>

      <div className="passport-body">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' ? (
            <motion.div key="overview" className="passport-overview"
              initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.2}}>

              {/* Summary */}
              <p className="passport-summary">{passport.summary}</p>

              {/* Knowledge depth */}
              <div className="passport-section-label">Knowledge Depth</div>
              <div className="knowledge-circles">
                {knowledgeEntries.map(([key, val]) => (
                  <KnowledgeCircle key={key} label={KNOWLEDGE_LABELS[key]} value={val} color={KNOWLEDGE_COLORS[key]} />
                ))}
              </div>

              {/* Stats row */}
              <div className="passport-stats">
                <div className="passport-stat">
                  <div className="pstat-value" style={{ color: '#818cf8' }}>
                    {Math.round(passport.predictionAccuracy * 100)}%
                  </div>
                  <div className="pstat-label">Prediction accuracy</div>
                </div>
                {passport.velocityImprovement > 0 && (
                  <div className="passport-stat">
                    <div className="pstat-value" style={{ color: '#34d399' }}>
                      +{Math.round(passport.velocityImprovement)}%
                    </div>
                    <div className="pstat-label">Task velocity</div>
                  </div>
                )}
                {passport.dominantDomains.length > 0 && (
                  <div className="passport-stat">
                    <div className="pstat-domains">
                      {passport.dominantDomains.slice(0,3).map(d => (
                        <span key={d} className="domain-pill">{d}</span>
                      ))}
                    </div>
                    <div className="pstat-label">Domains</div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="learnings" className="passport-learnings"
              initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.2}}>
              <AnimatePresence>
                {passport.learnings.slice(0,8).map(l => (
                  <LearningEntry
                    key={l.id} learning={l}
                    isHighlighted={l.relatedAgentIds.includes(highlightedAgentId ?? '')}
                    onHover={() => onLearningHover(l.relatedAgentIds)}
                    onLeave={onLearningLeave}
                  />
                ))}
              </AnimatePresence>
              {passport.learnings.length === 0 && (
                <p className="learnings-empty">Complete more tasks to build your learning profile.</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Demo mode selector */}
      <div className="passport-footer">
        <span className="demo-label">Preview:</span>
        {(['real','day1','week1','month1'] as DemoMode[]).map(m => (
          <button key={m} className={`demo-pill ${demoMode===m?'active':''}`} onClick={()=>onDemoModeChange(m)}>
            {m==='real'?'Live':m==='day1'?'Day 1':m==='week1'?'Week 1':'Month 1'}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
