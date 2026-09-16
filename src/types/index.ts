export type AgentStatus =
  | 'spawning'
  | 'thinking'
  | 'executing'
  | 'communicating'
  | 'evaluating'
  | 'complete'
  | 'dissolved';

export type OrchestratorPhase =
  | 'idle'
  | 'analyzing'
  | 'spawning'
  | 'executing'
  | 'qa_review'
  | 'evaluating'
  | 'synthesizing'
  | 'complete';

export interface AgentConfig {
  id: string;
  name: string;
  specialty: string;
  color: string;
}

export interface Agent extends AgentConfig {
  status: AgentStatus;
  currentAction: string;
  confidence: number; // 0–1
  contributions: string[];
  spawnTime: number;
  evaluationScore?: number;
  qaStatus?: 'failed' | 'rerunning' | 'resolved' | 'unresolved';
  groupId?: string;
}

export interface TaskRelationship {
  groupAId: string;
  groupBId: string;
  strength: number;
  keywords: string[];
  merged?: boolean; // true = tasks are closely related → join same cluster
}

export interface ActiveCommunication {
  id: string;
  fromId: string;
  toId: string;
  message: string;
  startTime: number; // performance.now()
  duration: number;  // ms
}

export interface TimelineEvent {
  id: string;
  timestamp: number; // ms since task start
  agentId?: string;
  agentName?: string;
  agentColor?: string;
  type:
    | 'task_start'
    | 'phase_change'
    | 'agent_spawned'
    | 'agent_action'
    | 'communication'
    | 'evaluation'
    | 'qa_event'
    | 'insight'
    | 'complete';
  description: string;
}

export interface Insight {
  id: string;
  title: string;
  content: string;
  contributors: string[];        // agent ids
  contributorNames: string[];
  contributorColors: string[];
  confidence: number;
  category: string;
  timestamp: number;
  evidence?: string[];
  severity?: 'critical' | 'warning' | 'success' | 'info';
}

export interface VerifiedUrl {
  url: string;
  title: string;
}

export interface EmbeddedImage {
  url: string;
  sourcePageUrl: string;
  data: string;       // base64
  mediaType: string;
  caption?: string;
}

export interface CreatedFile {
  path: string;
  name: string;
}

export interface TaskReport {
  executiveSummary: string;
  actionItems: Array<{ label: string; priority: 'high' | 'medium' | 'low'; effort?: 'quick' | 'medium' | 'long' }>;
  followUpQuestions: string[];
  limitations: string;
  verifiedUrls?: VerifiedUrl[];
  embeddedImages?: EmbeddedImage[];
  createdFiles?: CreatedFile[];
}

export interface OrchestratorState {
  phase: OrchestratorPhase;
  taskDescription: string;
  agents: Agent[];
  communications: ActiveCommunication[];
  timeline: TimelineEvent[];
  insights: Insight[];
  taskReport?: TaskReport;
  startTime: number;
  completionPct: number;
  isActive: boolean;
}

// ---- Scenario Script Types ----

export type ScriptedEventType =
  | 'phase_change'
  | 'agent_spawn'
  | 'agent_action'
  | 'agent_confidence'
  | 'communication'
  | 'peer_evaluation'
  | 'insight'
  | 'task_report'
  | 'complete';

export interface ScriptedEvent {
  delay: number; // ms from task start
  type: ScriptedEventType;
  // phase_change
  phase?: OrchestratorPhase;
  phaseLabel?: string;
  // agent_spawn / agent_action
  agentId?: string;
  action?: string;
  status?: AgentStatus;
  // agent_confidence
  confidence?: number;
  // communication
  fromId?: string;
  toId?: string;
  message?: string;
  commDuration?: number;
  // peer_evaluation
  evaluatorId?: string;
  evaluateeId?: string;
  score?: number;
  feedback?: string;
  // insight
  insight?: Omit<Insight, 'id' | 'timestamp'>;
  // task_report
  taskReport?: TaskReport;
  // completion
  completionPct?: number;
}

export interface Scenario {
  id: string;
  keywords: string[];
  taskLabel: string;
  agents: AgentConfig[];
  events: ScriptedEvent[];
  totalDuration: number; // ms
}
