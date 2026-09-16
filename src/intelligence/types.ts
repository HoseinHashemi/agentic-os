export type AgentDomain = 'medical' | 'legal' | 'technical' | 'creative' | 'analytical' | 'security' | 'quantum' | 'general';

export interface Learning {
  id: string;
  timestamp: number;
  text: string;
  category: 'preference' | 'pattern' | 'domain' | 'style' | 'workflow';
  relatedAgentIds: string[];
}

export interface KnowledgeDepth {
  workStyle: number;
  outputPreferences: number;
  domainExpertise: number;
  taskPatterns: number;
  communicationStyle: number;
}

export interface PassportData {
  createdAt: number;
  lastUpdated: number;
  tasksCompleted: number;
  summary: string;
  knowledge: KnowledgeDepth;
  learnings: Learning[];
  predictionAccuracy: number;
  velocityImprovement: number;
  dominantDomains: string[];
}

export interface AgentRecord {
  id: string;
  name: string;
  specialty: string;
  domain: AgentDomain;
  color: string;
  usageCount: number;
  firstSeen: number;
  lastActive: number;
  successRate: number;
  avgConfidence: number;
  confidenceHistory: Array<{ timestamp: number; value: number }>;
  tasksCompleted: number;
  speedImprovement: number;
  relatedInsightIds: string[];
}

export interface AgentLink {
  source: string;
  target: string;
  collaborationCount: number;
  avgQuality: number;
  isEmergent: boolean;
  firstCollaboration: number;
  emergenceNote?: string;
}

export interface TaskSummary {
  id: string;
  timestamp: number;
  label: string;
  agentIds: string[];
  duration: number;
}

export interface NetworkData {
  agents: AgentRecord[];
  links: AgentLink[];
  taskHistory: TaskSummary[];
}

export interface IntelligenceData {
  passport: PassportData;
  network: NetworkData;
}
