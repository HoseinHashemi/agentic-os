import type { IntelligenceData, PassportData, NetworkData, AgentRecord, AgentLink, Learning } from './types';

const NOW = Date.now();
const DAY = 86_400_000;
const WEEK = DAY * 7;

function L(idx: number, daysAgo: number, text: string, cat: Learning['category'], agentIds: string[] = []): Learning {
  return { id: `l${idx}`, timestamp: NOW - daysAgo * DAY, text, category: cat, relatedAgentIds: agentIds };
}

const ALL_LEARNINGS: Learning[] = [
  L(0,  0.2, 'You prefer concise bullet-point summaries under 200 words',           'preference',  []),
  L(1,  0.5, 'Your primary work domain is medical document analysis',               'domain',      ['cardiology','medical']),
  L(2,  1.0, 'You work most effectively with 3–4 specialist agents in parallel',     'workflow',    []),
  L(3,  2.0, 'You prefer PDF outputs saved to your Projects folder',                'preference',  []),
  L(4,  3.0, 'Your most productive task type is cross-domain synthesis',            'pattern',     ['analytical','research']),
  L(5,  4.0, 'You consistently request confidence scores with all results',         'style',       []),
  L(6,  5.0, 'You work across healthcare and legal domains frequently',             'domain',      ['medical','legal']),
  L(7,  6.0, 'You prefer agents to ask clarifying questions before executing',      'style',       []),
  L(8,  8.0, 'Your tasks typically require data validation and cross-referencing',  'pattern',     ['research','analytical']),
  L(9, 10.0, 'You favor structured outputs with clear section headers',             'preference',  []),
  L(10,12.0, 'Security and compliance checks are important to your workflow',       'workflow',    ['security']),
  L(11,14.0, 'You often iterate on results, preferring refinement over single-pass','style',       []),
  L(12,16.0, 'Your technical tasks lean toward Python and data pipelines',          'domain',      ['technical']),
  L(13,18.0, 'You schedule complex multi-agent tasks in the morning',               'pattern',     []),
  L(14,20.0, 'You prefer agents to provide sources alongside confidence levels',    'style',       []),
];

function makeAgent(
  id: string, name: string, specialty: string,
  domain: AgentRecord['domain'], color: string,
  usage: number, firstDaysAgo: number, lastDaysAgo: number,
  success: number, conf: number, speed: number, insightIds: string[],
): AgentRecord {
  const first = NOW - firstDaysAgo * DAY;
  const last  = NOW - lastDaysAgo  * DAY;
  const steps = 8;
  const confHistory = Array.from({ length: steps }, (_, i) => ({
    timestamp: first + (i * (last - first) / (steps - 1)),
    value: Math.min(0.99, 0.55 + i * 0.045 + Math.random() * 0.02),
  }));
  return { id, name, specialty, domain, color, usageCount: usage, firstSeen: first, lastActive: last,
    successRate: success, avgConfidence: conf, confidenceHistory: confHistory,
    tasksCompleted: usage, speedImprovement: speed, relatedInsightIds: insightIds };
}

const FULL_AGENTS: AgentRecord[] = [
  makeAgent('cardiology',   'Cardiology Specialist',   'Cardiac Analysis',         'medical',    '#3b82f6', 8,  28, 1,  0.94, 0.88, 28, ['l1','l6']),
  makeAgent('medical',      'Medical Analyst',         'Clinical Research',        'medical',    '#60a5fa', 12, 28, 2,  0.91, 0.86, 34, ['l1','l6']),
  makeAgent('legal',        'Legal Analyst',           'Contract Analysis',        'legal',      '#a78bfa', 6,  21, 3,  0.89, 0.84, 22, ['l6']),
  makeAgent('analytical',   'Data Analyst',            'Statistical Analysis',     'analytical', '#f8fafc', 15, 28, 0,  0.96, 0.91, 41, ['l0','l4','l8']),
  makeAgent('research',     'Research Synthesizer',    'Cross-domain Research',    'analytical', '#e2e8f0', 10, 21, 1,  0.88, 0.82, 19, ['l4','l8']),
  makeAgent('security',     'Security Auditor',        'Compliance & Security',    'security',   '#34d399', 4,  21, 5,  0.92, 0.87, 15, ['l10']),
  makeAgent('technical',    'Technical Engineer',      'Software & Systems',       'technical',  '#10b981', 7,  21, 2,  0.90, 0.85, 31, ['l12']),
  makeAgent('nephrology',   'Nephrology Specialist',   'Renal Analysis',           'medical',    '#93c5fd', 3,  14, 6,  0.87, 0.80, 12, ['l1']),
];

const FULL_LINKS: AgentLink[] = [
  { source:'cardiology', target:'medical',   collaborationCount:6, avgQuality:0.91, isEmergent:false, firstCollaboration: NOW-WEEK*3 },
  { source:'medical',    target:'analytical',collaborationCount:8, avgQuality:0.93, isEmergent:false, firstCollaboration: NOW-WEEK*3 },
  { source:'medical',    target:'legal',     collaborationCount:3, avgQuality:0.87, isEmergent:true,  firstCollaboration: NOW-WEEK*2,
    emergenceNote:'These agents discovered exceptional synergy on your healthcare compliance tasks.' },
  { source:'analytical', target:'research',  collaborationCount:9, avgQuality:0.89, isEmergent:false, firstCollaboration: NOW-WEEK*3 },
  { source:'security',   target:'technical', collaborationCount:3, avgQuality:0.88, isEmergent:false, firstCollaboration: NOW-WEEK*2 },
  { source:'technical',  target:'analytical',collaborationCount:5, avgQuality:0.90, isEmergent:false, firstCollaboration: NOW-WEEK*2 },
  { source:'cardiology', target:'nephrology',collaborationCount:2, avgQuality:0.85, isEmergent:true,  firstCollaboration: NOW-WEEK,
    emergenceNote:'Cardiac-renal interaction pattern discovered through your patient case analysis.' },
  { source:'research',   target:'legal',     collaborationCount:2, avgQuality:0.84, isEmergent:false, firstCollaboration: NOW-WEEK*2 },
];

export function getDay1Data(): IntelligenceData {
  const agents = FULL_AGENTS.slice(0, 2).map(a => ({ ...a, usageCount:1, tasksCompleted:1, speedImprovement:0 }));
  const passport: PassportData = {
    createdAt: NOW - DAY, lastUpdated: NOW - DAY * 0.5, tasksCompleted: 1,
    summary: "You've completed your first task. Your intelligence profile has begun — the system noted you work in medical analysis and prefer detailed, structured outputs.",
    knowledge: { workStyle:0.12, outputPreferences:0.10, domainExpertise:0.16, taskPatterns:0.08, communicationStyle:0.09 },
    learnings: [ALL_LEARNINGS[1]],
    predictionAccuracy: 0.62, velocityImprovement: 0, dominantDomains: ['Medical'],
  };
  const network: NetworkData = {
    agents, links: [],
    taskHistory: [{ id:'t1', timestamp: NOW-DAY, label:'Medical case analysis', agentIds:['cardiology','medical'], duration:32000 }],
  };
  return { passport, network };
}

export function getWeek1Data(): IntelligenceData {
  const agents = FULL_AGENTS.slice(0, 5).map(a => ({
    ...a, usageCount: Math.max(1, Math.round(a.usageCount * 0.35)),
    tasksCompleted: Math.max(1, Math.round(a.tasksCompleted * 0.35)),
    speedImprovement: Math.round(a.speedImprovement * 0.35),
  }));
  const passport: PassportData = {
    createdAt: NOW-WEEK, lastUpdated: NOW-DAY*2, tasksCompleted: 7,
    summary: "You primarily work in medical document analysis and contract review. You prefer structured outputs with confidence scores. Your workflow patterns suggest you run complex tasks in batches, favoring parallel agent execution.",
    knowledge: { workStyle:0.44, outputPreferences:0.58, domainExpertise:0.50, taskPatterns:0.38, communicationStyle:0.32 },
    learnings: ALL_LEARNINGS.slice(0, 5),
    predictionAccuracy: 0.79, velocityImprovement: 18, dominantDomains: ['Medical','Legal'],
  };
  const links = FULL_LINKS.slice(0, 4).map(l => ({ ...l, collaborationCount: Math.max(1, Math.round(l.collaborationCount * 0.4)) }));
  const network: NetworkData = {
    agents, links,
    taskHistory: Array.from({ length: 7 }, (_, i) => ({
      id:`t${i+1}`, timestamp: NOW-(7-i)*DAY,
      label: ['Medical case analysis','Contract review','Cross-domain synthesis','Data analysis','Legal compliance check','Patient assessment','Research report'][i],
      agentIds: agents.slice(0, 2+(i%3)).map(a=>a.id), duration: 20000+i*5000,
    })),
  };
  return { passport, network };
}

export function getMonth1Data(): IntelligenceData {
  const passport: PassportData = {
    createdAt: NOW-WEEK*4, lastUpdated: NOW-DAY, tasksCompleted: 34,
    summary: "You work primarily in medical document analysis and legal compliance. You consistently prefer concise bullet-point summaries under 200 words with confidence scores. Your most productive task type is cross-domain synthesis spanning healthcare and legal domains. You schedule complex multi-agent tasks in the morning, favoring 3–4 agents in parallel.",
    knowledge: { workStyle:0.88, outputPreferences:0.92, domainExpertise:0.84, taskPatterns:0.79, communicationStyle:0.74 },
    learnings: ALL_LEARNINGS.slice(0, 10),
    predictionAccuracy: 0.94, velocityImprovement: 34, dominantDomains: ['Medical','Legal','Analytical'],
  };
  const network: NetworkData = {
    agents: FULL_AGENTS,
    links: FULL_LINKS,
    taskHistory: Array.from({ length: 34 }, (_, i) => ({
      id:`t${i+1}`, timestamp: NOW-(34-i)*(WEEK*4/34),
      label: ['Medical case analysis','Contract review','Security audit','Research synthesis','Data pipeline','Compliance check'][i%6],
      agentIds: FULL_AGENTS.slice(0, 2+(i%4)).map(a=>a.id), duration: 15000+(i%7)*8000,
    })),
  };
  return { passport, network };
}
