import { useState, useCallback } from 'react';
import type { IntelligenceData, PassportData, NetworkData, AgentRecord, Learning } from './types';
import { loadIntelligence, saveIntelligence, clearIntelligence } from './storage';
import type { Agent, Insight } from '../types';

export type DemoMode = 'real' | 'day1' | 'week1' | 'month1';

function initialPassport(): PassportData {
  return {
    createdAt: Date.now(), lastUpdated: Date.now(), tasksCompleted: 0, summary: '',
    knowledge: { workStyle:0, outputPreferences:0, domainExpertise:0, taskPatterns:0, communicationStyle:0 },
    learnings: [], predictionAccuracy: 0.55, velocityImprovement: 0, dominantDomains: [],
  };
}
function initialNetwork(): NetworkData { return { agents:[], links:[], taskHistory:[] }; }

function detectDomain(specialty: string): AgentRecord['domain'] {
  const s = specialty.toLowerCase();
  // Order matters: more specific patterns first
  if (s.match(/cardio|hema|neph|endo|oncol|radio|patho|pharmac/)) return 'medical';
  if (s.match(/medical|clinical|patient|health|diagnos|thera/))   return 'medical';
  if (s.match(/legal|contract|compliance|law|regulat|litig/))     return 'legal';
  if (s.match(/secur|vuln|cyber|threat|pentest|forensic|exploit/)) return 'security';
  if (s.match(/quantum|qubit|superposit/))                         return 'quantum';
  if (s.match(/code|engineer|software|technical|program|develo|architect/)) return 'technical';
  if (s.match(/creative|design|content|writ|market|brand|copy/))  return 'creative';
  if (s.match(/data|analyt|statist|research|synth|model|ml|ai|nlp/)) return 'analytical';
  return 'general';
}

function domainColor(d: AgentRecord['domain']): string {
  return { medical:'#3b82f6', legal:'#a78bfa', security:'#34d399', quantum:'#818cf8',
           technical:'#10b981', creative:'#f59e0b', analytical:'#e2e8f0', general:'#94a3b8' }[d] ?? '#94a3b8';
}

// Domain-tagged learning templates. Untagged = always eligible.
const LEARNING_TEMPLATES: Array<Omit<Learning,'id'|'timestamp'> & { domains?: string[] }> = [
  // Generic workflow / style
  { text: 'You prefer concise structured outputs with confidence indicators', category: 'preference', relatedAgentIds: [] },
  { text: 'Multi-agent parallel workflows are your most efficient task pattern', category: 'workflow', relatedAgentIds: [] },
  { text: 'You consistently request cross-domain synthesis across your task history', category: 'pattern', relatedAgentIds: [] },
  { text: 'You value thorough analysis and tend to iterate on results', category: 'style', relatedAgentIds: [] },
  { text: 'Structured section headers and bullet points match your reading style', category: 'preference', relatedAgentIds: [] },
  { text: 'You deploy larger specialist teams for multi-faceted tasks', category: 'workflow', relatedAgentIds: [] },
  // Domain-specific
  { text: 'Medical analysis tasks dominate your workflow — you prioritise evidence-backed conclusions', category: 'domain', relatedAgentIds: [], domains: ['Medical'] },
  { text: 'Your legal queries consistently require multi-jurisdiction and compliance analysis', category: 'domain', relatedAgentIds: [], domains: ['Legal'] },
  { text: 'Security tasks reveal your preference for vulnerability-first risk framing', category: 'domain', relatedAgentIds: [], domains: ['Security'] },
  { text: 'You engage quantum computing tasks with an interest in both theoretical and applied outcomes', category: 'domain', relatedAgentIds: [], domains: ['Quantum'] },
  { text: 'Technical engineering tasks form a core part of your workflow — you value precise, runnable outputs', category: 'domain', relatedAgentIds: [], domains: ['Technical'] },
  { text: 'Creative tasks in your history lean towards structured storytelling and brand-consistent messaging', category: 'domain', relatedAgentIds: [], domains: ['Creative'] },
  { text: 'Analytical tasks show a preference for quantitative evidence and data-driven conclusions', category: 'domain', relatedAgentIds: [], domains: ['Analytical'] },
];

function updatePassport(
  existing: PassportData,
  task: string,
  agents: Agent[],
  insights: Insight[],
): PassportData {
  const t = task.toLowerCase();

  // Detect domains from task text
  const domains: string[] = [];
  if (t.match(/medical|patient|clinical|health|diagnos/)) domains.push('Medical');
  if (t.match(/legal|contract|compliance|law/)) domains.push('Legal');
  if (t.match(/secur|vuln|cyber|threat/)) domains.push('Security');
  if (t.match(/quantum/)) domains.push('Quantum');
  if (t.match(/code|software|engineer|program/)) domains.push('Technical');
  if (t.match(/creative|design|content|writ/)) domains.push('Creative');
  if (t.match(/data|analyt|statist|research/)) domains.push('Analytical');

  // Also detect domains from agent specialties
  for (const ag of agents) {
    if (ag.status === 'dissolved') continue;
    const d = detectDomain(ag.specialty);
    const label = d.charAt(0).toUpperCase() + d.slice(1);
    if (!domains.includes(label)) domains.push(label);
  }

  const allDomains = Array.from(new Set([...existing.dominantDomains, ...domains])).slice(0, 5);

  // Pick a learning template relevant to current detected domains
  const eligible = LEARNING_TEMPLATES.filter(
    tmpl => !tmpl.domains || tmpl.domains.some(d => allDomains.includes(d))
  );
  const template = eligible[existing.learnings.length % eligible.length];

  // Link the learning to the agents that participated
  const participantIds = agents.filter(a => a.status !== 'dissolved').map(a => a.id);
  const newLearning: Learning = {
    ...template,
    id: `l-${Date.now()}`,
    timestamp: Date.now(),
    relatedAgentIds: participantIds,
  };
  const learnings = [newLearning, ...existing.learnings].slice(0, 20);

  // Scale knowledge bump by task complexity: agent count + insight count
  const complexityFactor = 1 + (agents.filter(a => a.status !== 'dissolved').length - 1) * 0.08
    + (insights.length > 0 ? 0.06 : 0);
  const bump = (0.045 + Math.random() * 0.025) * complexityFactor;

  // Only boost the domains that were actually exercised this task
  const domainBoosted = allDomains.length > 0;
  const knowledge = {
    workStyle:          Math.min(1, existing.knowledge.workStyle          + bump),
    outputPreferences:  Math.min(1, existing.knowledge.outputPreferences  + bump * 1.1),
    domainExpertise:    Math.min(1, existing.knowledge.domainExpertise    + bump * (domainBoosted ? 1.2 : 0.6)),
    taskPatterns:       Math.min(1, existing.knowledge.taskPatterns       + bump * 0.8),
    communicationStyle: Math.min(1, existing.knowledge.communicationStyle + bump * 0.7),
  };

  const n = existing.tasksCompleted + 1;
  const domainStr = allDomains.length > 0 ? allDomains.join(' and ') : 'general';
  const summary = n >= 8
    ? `You work primarily in ${domainStr} analysis. You consistently prefer parallel multi-agent workflows with confidence scores. Your ${n}-task history reveals a strong preference for cross-domain synthesis and structured outputs.`
    : n >= 3
    ? `Your profile is building. You've completed ${n} tasks across ${domainStr} domains. The system is learning your preference for structured outputs and parallel agent execution.`
    : 'Your intelligence profile has begun. The system noted your first task domain and is starting to learn your preferences. Each task makes predictions more accurate.';

  return {
    ...existing, lastUpdated: Date.now(), tasksCompleted: n, summary, knowledge, learnings,
    predictionAccuracy: Math.min(0.98, existing.predictionAccuracy + 0.013 + Math.random() * 0.007),
    velocityImprovement: Math.min(60, existing.velocityImprovement + 0.9 + Math.random() * 0.4),
    dominantDomains: allDomains,
  };
}

function updateNetwork(
  existing: NetworkData,
  agents: Agent[],
  insights: Insight[],
  label: string,
  duration: number,
): NetworkData {
  const now = Date.now();
  const updatedAgents = [...existing.agents];
  const taskAgentIds: string[] = [];

  // Build a map from agent name → insight IDs they contributed to
  const agentInsightMap = new Map<string, string[]>();
  for (const ins of insights) {
    for (let i = 0; i < ins.contributorNames.length; i++) {
      const name = ins.contributorNames[i];
      if (!agentInsightMap.has(name)) agentInsightMap.set(name, []);
      agentInsightMap.get(name)!.push(ins.id);
    }
  }

  for (const ag of agents) {
    if (ag.status === 'dissolved') continue;
    const domain = detectDomain(ag.specialty);
    const color  = domainColor(domain);
    const insightIds = agentInsightMap.get(ag.name) ?? [];
    const idx = updatedAgents.findIndex(a => a.name === ag.name);

    if (idx >= 0) {
      const ea = updatedAgents[idx];
      const newTaskCount = ea.tasksCompleted + 1;
      const newAvgConfidence = (ea.avgConfidence * ea.tasksCompleted + ag.confidence) / newTaskCount;
      // successRate: running weighted average; treat confidence > 0.7 as success
      const taskSuccess = ag.confidence > 0.65 ? 1 : ag.confidence;
      const newSuccessRate = (ea.successRate * ea.tasksCompleted + taskSuccess) / newTaskCount;
      const mergedInsightIds = Array.from(new Set([...ea.relatedInsightIds, ...insightIds]));

      updatedAgents[idx] = {
        ...ea,
        usageCount: ea.usageCount + 1,
        lastActive: now,
        avgConfidence: newAvgConfidence,
        confidenceHistory: [...ea.confidenceHistory, { timestamp: now, value: ag.confidence }].slice(-20),
        successRate: newSuccessRate,
        tasksCompleted: newTaskCount,
        speedImprovement: Math.min(60, ea.speedImprovement + 0.5),
        relatedInsightIds: mergedInsightIds,
      };
      taskAgentIds.push(ea.id);
    } else {
      const taskSuccess = ag.confidence > 0.65 ? 1 : ag.confidence;
      updatedAgents.push({
        id: ag.id, name: ag.name, specialty: ag.specialty, domain, color,
        usageCount: 1, firstSeen: now, lastActive: now,
        successRate: taskSuccess,
        avgConfidence: ag.confidence,
        confidenceHistory: [{ timestamp: now, value: ag.confidence }],
        tasksCompleted: 1,
        speedImprovement: 0,
        relatedInsightIds: insightIds,
      });
      taskAgentIds.push(ag.id);
    }
  }

  // Build collaboration links using actual evaluation scores where available
  const updatedLinks = [...existing.links];
  for (let i = 0; i < taskAgentIds.length; i++) {
    for (let j = i + 1; j < taskAgentIds.length; j++) {
      const src = taskAgentIds[i], tgt = taskAgentIds[j];
      const agSrc = agents.find(a => a.id === src);
      const agTgt = agents.find(a => a.id === tgt);
      // Quality = average of evaluationScore if available, else confidence
      const srcQ = agSrc ? (agSrc.evaluationScore ?? agSrc.confidence) : 0.8;
      const tgtQ = agTgt ? (agTgt.evaluationScore ?? agTgt.confidence) : 0.8;
      const pairQuality = (srcQ + tgtQ) / 2;

      const li = updatedLinks.findIndex(
        l => (l.source === src && l.target === tgt) || (l.source === tgt && l.target === src)
      );
      if (li >= 0) {
        const el = updatedLinks[li];
        const c = el.collaborationCount + 1;
        const newAvgQ = (el.avgQuality * el.collaborationCount + pairQuality) / c;
        const emergent = !el.isEmergent && c >= 4 && Math.random() < 0.2;
        updatedLinks[li] = {
          ...el,
          collaborationCount: c,
          avgQuality: newAvgQ,
          isEmergent: el.isEmergent || emergent,
          emergenceNote: emergent
            ? `These agents developed unique synergy on your ${label.toLowerCase()} tasks.`
            : el.emergenceNote,
        };
      } else {
        updatedLinks.push({
          source: src, target: tgt,
          collaborationCount: 1,
          avgQuality: pairQuality,
          isEmergent: false,
          firstCollaboration: now,
        });
      }
    }
  }

  return {
    agents: updatedAgents,
    links: updatedLinks,
    taskHistory: [
      ...existing.taskHistory,
      { id: `t-${now}`, timestamp: now, label: label.slice(0, 60), agentIds: taskAgentIds, duration },
    ],
  };
}

export function useIntelligence() {
  const [data, setData] = useState<IntelligenceData>(() => {
    const saved = loadIntelligence();
    return saved ?? { passport: initialPassport(), network: initialNetwork() };
  });
  const [demoMode, setDemoModeState] = useState<DemoMode>('real');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [highlightedAgentId,   setHighlightedAgentId]   = useState<string|null>(null);
  const [highlightedInsightId, setHighlightedInsightId] = useState<string|null>(null);

  const setDemoMode = useCallback(async (mode: DemoMode) => {
    setDemoModeState(mode);
    if (mode === 'real') {
      const saved = loadIntelligence();
      setData(saved ?? { passport: initialPassport(), network: initialNetwork() });
    } else {
      const sim = await import('./simulator');
      const fn = mode === 'day1' ? sim.getDay1Data : mode === 'week1' ? sim.getWeek1Data : sim.getMonth1Data;
      setData(fn());
    }
  }, []);

  const updateFromTask = useCallback((
    task: string,
    agents: Agent[],
    insights: Insight[],
    duration: number,
  ) => {
    setData(prev => {
      const newPassport = updatePassport(prev.passport, task, agents, insights);
      const newNetwork  = updateNetwork(prev.network, agents, insights, task.slice(0, 60), duration);
      const next = { passport: newPassport, network: newNetwork };
      if (demoMode === 'real') saveIntelligence(next);
      if (newPassport.tasksCompleted === 1) setShowOnboarding(true);
      return next;
    });
  }, [demoMode]);

  const reset = useCallback(() => {
    clearIntelligence();
    setData({ passport: initialPassport(), network: initialNetwork() });
    setDemoModeState('real');
  }, []);

  return {
    passport: data.passport, network: data.network,
    hasData: data.passport.tasksCompleted > 0 || demoMode !== 'real',
    showOnboarding, dismissOnboarding: () => setShowOnboarding(false),
    demoMode, setDemoMode,
    highlightedAgentId, highlightedInsightId,
    setHighlightedAgent: setHighlightedAgentId,
    setHighlightedInsight: setHighlightedInsightId,
    updateFromTask, reset,
  };
}
