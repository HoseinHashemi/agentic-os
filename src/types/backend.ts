// Frontend mirror of server message types
// Kept in sync with server/src/types.ts

export interface AgentSpawnedPayload {
  id: string; name: string; specialty: string; color: string; task: string;
}

export interface AgentUpdatePayload {
  id: string; status: string; action: string; confidence?: number;
}

export interface CommunicationPayload {
  fromId: string; fromName: string; toId: string; toName: string; message: string; duration: number;
}

export interface ApprovalPayload {
  id: string;
  agentId: string;
  agentName: string;
  agentColor: string;
  action: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  params: Record<string, string>;
  groupId?: string;
}

export interface ActionExecutedPayload {
  agentId: string;
  agentName: string;
  agentColor: string;
  tool: string;
  description: string;
  path?: string;
  success: boolean;
  result: string;
}

export interface InsightPayload {
  id: string; title: string; content: string;
  contributors: string[]; contributorNames: string[]; contributorColors: string[];
  confidence: number; category: string;
  evidence?: string[];
  severity?: 'critical' | 'warning' | 'success' | 'info';
}

export interface VerifiedUrl {
  url: string;
  title: string;
}

export interface EmbeddedImage {
  url: string;
  sourcePageUrl: string; // web page the image was found on
  data: string;          // base64
  mediaType: string;     // e.g. "image/jpeg"
  caption?: string;
}

export interface CreatedFile {
  path: string;
  name: string;
}

export interface TaskReportPayload {
  executiveSummary: string;
  actionItems: Array<{ label: string; priority: 'high' | 'medium' | 'low'; effort?: 'quick' | 'medium' | 'long' }>;
  followUpQuestions: string[];
  limitations: string;
  verifiedUrls?: VerifiedUrl[];
  embeddedImages?: EmbeddedImage[];
  createdFiles?: CreatedFile[];
}

export interface ConfigPayload {
  hasApiKey: boolean;
  sandboxPaths: string[];
  workspacePath: string;
  searchApiKey?: string;
  agentModel: string;
  orchestratorModel: string;
  maxIterationsPerAgent: number;
}

export interface AttachedImage {
  id: string;
  name: string;
  fileType: 'image' | 'pdf' | 'text';
  mediaType: string;
  data: string;    // base64 for images/pdf; raw text for text files
  preview: string; // data URL for images, '' for others
  size: number;
}

export interface GroupSyncPayload {
  groupId: string;
  task: string;
  phase: string;
  startTime: number;
  complete: boolean;
  agents: AgentSpawnedPayload[];
  agentStatuses: Record<string, AgentUpdatePayload>;
  insights: InsightPayload[];
  taskReport?: TaskReportPayload;
  pendingApproval?: ApprovalPayload;
  peerEvals: Array<{
    evaluatorId: string; evaluateeId: string;
    evaluateeName: string; score: number; feedback: string;
  }>;
}

export interface QAEventPayload {
  agentId: string;
  agentName: string;
  agentColor: string;
  status: 'failed_rerunning' | 'resolved' | 'unresolved';
  issue: string;
  attempt: number;
}

export type ServerMessage =
  | { type: 'config'; payload: ConfigPayload }
  | { type: 'status'; payload: { phase: string; message: string } }
  | { type: 'agent_spawned'; payload: AgentSpawnedPayload }
  | { type: 'agent_update'; payload: AgentUpdatePayload }
  | { type: 'communication'; payload: CommunicationPayload }
  | { type: 'approval_required'; payload: ApprovalPayload }
  | { type: 'action_executed'; payload: ActionExecutedPayload }
  | { type: 'insight'; payload: InsightPayload }
  | { type: 'task_report'; payload: TaskReportPayload }
  | { type: 'task_complete'; payload: { summary: string; actionsCount: number; duration: number; tokenUsage?: { input: number; output: number } } }
  | { type: 'task_cancelled'; payload: { groupId?: string } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'peer_evaluation'; payload: { evaluatorId: string; evaluateeId: string; evaluateeName: string; score: number; feedback: string } }
  | { type: 'task_relationship'; payload: { groupAId: string; groupBId: string; strength: number; keywords: string[]; merged?: boolean } }
  | { type: 'task_sync'; payload: { groups: GroupSyncPayload[] } }
  | { type: 'qa_event'; payload: QAEventPayload };

export type ClientMessage =
  | { type: 'task'; payload: { task: string; images?: unknown[]; conversationHistory?: unknown[] } }
  | { type: 'approve'; payload: { id: string; groupId?: string } }
  | { type: 'deny'; payload: { id: string; groupId?: string } }
  | { type: 'save_config'; payload: Record<string, unknown> }
  | { type: 'get_config' }
  | { type: 'cancel'; payload?: { groupId?: string } };
