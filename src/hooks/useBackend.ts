import { useEffect, useRef, useCallback, useState } from 'react';
import type { OrchestratorState, Agent, ActiveCommunication, TimelineEvent, Insight, TaskRelationship } from '../types';
import type { ServerMessage, ApprovalPayload, ActionExecutedPayload, AttachedImage } from '../types/backend';

export interface ConvHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

const WS_URL = 'ws://localhost:3001';
const RECONNECT_DELAY = 3000;

export interface BackendConfig {
  hasApiKey: boolean;
  sandboxPaths: string[];
  workspacePath: string;
  searchApiKey?: string;
  agentModel: string;
  orchestratorModel: string;
  maxIterationsPerAgent: number;
}

export interface BackendState {
  connected: boolean;
  config: BackendConfig | null;
  orchestratorState: OrchestratorState;
  taskGroups: Map<string, OrchestratorState>;
  completedGroups: Map<string, OrchestratorState>; // persisted after task_complete
  taskRelationships: TaskRelationship[];
  pendingApproval: ApprovalPayload | null;
  executionLog: ActionExecutedPayload[];
  error: string | null;
  lastCompletionSummary: string | null;
  sessionTokenUsage: { input: number; output: number };
}

function defaultOrchestratorState(): OrchestratorState {
  return {
    phase: 'idle',
    taskDescription: '',
    agents: [],
    communications: [],
    timeline: [],
    insights: [],
    startTime: 0,
    completionPct: 0,
    isActive: false,
  };
}

let eventCounter = 0;
function nextId() { return `be-${++eventCounter}`; }

const AGENT_COLORS = [
  '#06b6d4', '#10b981', '#8b5cf6', '#f59e0b',
  '#f43f5e', '#3b82f6', '#14b8a6', '#f97316',
];
void AGENT_COLORS; // suppress unused warning

export function useBackend() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<OrchestratorState>(defaultOrchestratorState());
  const taskGroupsRef = useRef<Map<string, OrchestratorState>>(new Map());
  const commTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const taskStartRef = useRef(0);
  // Queue of pending task descriptions (FIFO, matched to incoming groups in order)
  const pendingTasksRef = useRef<string[]>([]);
  // Track which groups have already had their taskDescription initialised
  const initializedGroupsRef = useRef<Set<string>>(new Set());

  const [backendState, setBackendState] = useState<BackendState>({
    connected: false,
    config: null,
    orchestratorState: defaultOrchestratorState(),
    taskGroups: new Map(),
    completedGroups: new Map(),
    taskRelationships: [],
    pendingApproval: null,
    executionLog: [],
    error: null,
    lastCompletionSummary: null,
    sessionTokenUsage: { input: 0, output: 0 },
  });

  // ── Helper: get or create a task group state ────────────────────────────────
  function getOrCreateGroup(groupId: string): OrchestratorState {
    if (!taskGroupsRef.current.has(groupId)) {
      taskGroupsRef.current.set(groupId, defaultOrchestratorState());
    }
    return taskGroupsRef.current.get(groupId)!;
  }

  // ── Publish current taskGroups map to React state ───────────────────────────
  function publishGroups() {
    // Create a new Map so React sees the change
    const newMap = new Map(taskGroupsRef.current);
    setBackendState(prev => ({
      ...prev,
      taskGroups: newMap,
      orchestratorState: stateRef.current,
    }));
  }

  const updateOrch = useCallback((patch: Partial<OrchestratorState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    setBackendState(prev => ({ ...prev, orchestratorState: stateRef.current }));
  }, []);

  const addTimeline = useCallback((event: Omit<TimelineEvent, 'id' | 'timestamp'>) => {
    const entry: TimelineEvent = {
      id: nextId(),
      timestamp: Date.now() - taskStartRef.current,
      ...event,
    };
    stateRef.current = {
      ...stateRef.current,
      timeline: [...stateRef.current.timeline, entry],
    };
    setBackendState(prev => ({ ...prev, orchestratorState: stateRef.current }));
  }, []);

  // ── Group-scoped helpers ────────────────────────────────────────────────────
  function updateGroup(groupId: string, patch: Partial<OrchestratorState>) {
    const current = getOrCreateGroup(groupId);
    const updated = { ...current, ...patch };
    taskGroupsRef.current.set(groupId, updated);
    // Also keep stateRef / orchestratorState in sync (most recently touched group)
    stateRef.current = updated;
    publishGroups();
  }

  function addGroupTimeline(groupId: string, event: Omit<TimelineEvent, 'id' | 'timestamp'>) {
    const current = getOrCreateGroup(groupId);
    const entry: TimelineEvent = {
      id: nextId(),
      timestamp: Date.now() - taskStartRef.current,
      ...event,
    };
    const updated = { ...current, timeline: [...current.timeline, entry] };
    taskGroupsRef.current.set(groupId, updated);
    stateRef.current = updated;
    publishGroups();
  }

  const handleMessage = useCallback((rawMsg: ServerMessage, groupId?: string) => {
    const msg = rawMsg;

    // If this message belongs to a task group, route it there
    if (groupId) {
      switch (msg.type) {
        case 'status': {
          const phaseMap: Record<string, OrchestratorState['phase']> = {
            analyzing: 'analyzing', spawning: 'spawning', executing: 'executing',
            qa_review: 'qa_review', evaluating: 'evaluating', synthesizing: 'synthesizing', complete: 'complete',
          };
          const phase = phaseMap[msg.payload.phase] ?? 'executing';
          if (!initializedGroupsRef.current.has(groupId)) {
            initializedGroupsRef.current.add(groupId);
            const taskDescription = pendingTasksRef.current.shift() ?? '';
            updateGroup(groupId, { phase, isActive: true, taskDescription });
          } else {
            updateGroup(groupId, { phase, isActive: true });
          }
          addGroupTimeline(groupId, { type: 'phase_change', description: msg.payload.message });
          break;
        }

        case 'agent_spawned': {
          const { id, name, specialty, color, task } = msg.payload;
          const current = getOrCreateGroup(groupId);
          const newAgent: Agent = {
            id, name, specialty, color,
            status: 'spawning',
            currentAction: 'Initializing…',
            confidence: 0.5,
            contributions: [task],
            spawnTime: performance.now(),
            groupId,
          };
          const updated = { ...current, agents: [...current.agents, newAgent] };
          taskGroupsRef.current.set(groupId, updated);
          stateRef.current = updated;
          publishGroups();
          addGroupTimeline(groupId, {
            type: 'agent_spawned', agentId: id, agentName: name, agentColor: color,
            description: `${name} (${specialty}) — generated`,
          });
          break;
        }

        case 'agent_update': {
          const { id, status, action, confidence } = msg.payload;
          const current = getOrCreateGroup(groupId);
          const agents = current.agents.map(a =>
            a.id === id
              ? { ...a, status: status as Agent['status'], currentAction: action, confidence: confidence ?? a.confidence }
              : a
          );
          const done = agents.filter(a => a.status === 'complete').length;
          const completionPct = agents.length > 0 ? Math.round((done / agents.length) * 100) : current.completionPct;
          const updated = { ...current, agents, completionPct };
          taskGroupsRef.current.set(groupId, updated);
          stateRef.current = updated;
          publishGroups();

          if (status !== 'thinking' && status !== 'executing') {
            const agent = agents.find(a => a.id === id);
            addGroupTimeline(groupId, {
              type: 'agent_action', agentId: id,
              agentName: agent?.name, agentColor: agent?.color,
              description: action,
            });
          }
          break;
        }

        case 'communication': {
          const { fromId, fromName, toId, message, duration } = msg.payload;
          const commId = nextId();
          const current = getOrCreateGroup(groupId);
          const comm: ActiveCommunication = {
            id: commId, fromId, toId, message, startTime: performance.now(), duration,
          };
          const updated = { ...current, communications: [...current.communications, comm] };
          taskGroupsRef.current.set(groupId, updated);
          stateRef.current = updated;
          publishGroups();

          const fromAgent = current.agents.find(a => a.id === fromId);
          const toAgent = current.agents.find(a => a.id === toId);
          addGroupTimeline(groupId, {
            type: 'communication', agentId: fromId, agentName: fromName, agentColor: fromAgent?.color,
            description: `${fromAgent?.name ?? fromName} → ${toAgent?.name ?? toId}: "${message.slice(0, 72)}"`,
          });

          const t = setTimeout(() => {
            const cur = getOrCreateGroup(groupId);
            const upd = { ...cur, communications: cur.communications.filter(c => c.id !== commId) };
            taskGroupsRef.current.set(groupId, upd);
            stateRef.current = upd;
            publishGroups();
          }, duration + 500);
          commTimersRef.current.set(commId, t);
          break;
        }

        case 'approval_required': {
          setBackendState(prev => ({ ...prev, pendingApproval: msg.payload }));
          addGroupTimeline(groupId, {
            type: 'agent_action', agentId: msg.payload.agentId,
            agentName: msg.payload.agentName, agentColor: msg.payload.agentColor,
            description: `⚠ Approval needed: ${msg.payload.action}`,
          });
          break;
        }

        case 'action_executed': {
          const { agentId, agentName, agentColor, description, success } = msg.payload;
          addGroupTimeline(groupId, {
            type: 'agent_action', agentId, agentName, agentColor,
            description: `${success ? '✓' : '✗'} ${description}`,
          });
          setBackendState(prev => ({
            ...prev,
            pendingApproval: null,
            executionLog: [...prev.executionLog, msg.payload],
          }));
          break;
        }

        case 'peer_evaluation': {
          const { evaluatorId, evaluateeId, score, feedback } = msg.payload;
          const current = getOrCreateGroup(groupId);
          const evaluator = current.agents.find(a => a.id === evaluatorId);
          const agents = current.agents.map(a =>
            a.id === evaluateeId ? { ...a, evaluationScore: score } : a
          );
          const updated = { ...current, agents };
          taskGroupsRef.current.set(groupId, updated);
          stateRef.current = updated;
          publishGroups();
          addGroupTimeline(groupId, {
            type: 'evaluation', agentId: evaluatorId, agentName: evaluator?.name, agentColor: evaluator?.color,
            description: `${evaluator?.name ?? evaluatorId} → ${msg.payload.evaluateeName}: ${Math.round(score * 100)}% — "${feedback}"`,
          });
          break;
        }

        case 'qa_event': {
          const { agentId, agentName, agentColor, status, issue } = msg.payload;
          const qaStatus = status === 'failed_rerunning' ? 'rerunning' as const
            : status === 'resolved' ? 'resolved' as const
            : 'unresolved' as const;
          const current = getOrCreateGroup(groupId);
          const agents = current.agents.map(a =>
            a.id === agentId ? { ...a, qaStatus } : a
          );
          const updated = { ...current, agents };
          taskGroupsRef.current.set(groupId, updated);
          stateRef.current = updated;
          publishGroups();
          // Only add timeline entries for failures and reruns — keep it quiet for passing agents
          if (status === 'failed_rerunning') {
            addGroupTimeline(groupId, {
              type: 'qa_event', agentId, agentName, agentColor,
              description: `QA: ${agentName} re-running — ${issue}`,
            });
          } else if (status === 'resolved') {
            addGroupTimeline(groupId, {
              type: 'qa_event', agentId, agentName, agentColor,
              description: `QA: ${agentName} resolved`,
            });
          } else if (status === 'unresolved') {
            addGroupTimeline(groupId, {
              type: 'qa_event', agentId, agentName, agentColor,
              description: `QA: ${agentName} could not be resolved — ${issue}`,
            });
          }
          break;
        }

        case 'task_report': {
          updateGroup(groupId, { taskReport: msg.payload });
          break;
        }

        case 'insight': {
          const current = getOrCreateGroup(groupId);
          const insight: Insight = { ...msg.payload, timestamp: Date.now() - taskStartRef.current };
          const updated = { ...current, insights: [...current.insights, insight] };
          taskGroupsRef.current.set(groupId, updated);
          stateRef.current = updated;
          publishGroups();
          addGroupTimeline(groupId, { type: 'insight', description: `Insight: ${insight.title}` });
          break;
        }

        case 'task_complete': {
          updateGroup(groupId, { phase: 'complete', completionPct: 100, isActive: false });
          addGroupTimeline(groupId, { type: 'complete', description: `Task complete — ${msg.payload.actionsCount} real actions executed in ${Math.round(msg.payload.duration / 1000)}s` });
          // Snapshot the completed group state for persistent tab access
          const completedState = taskGroupsRef.current.get(groupId);
          setBackendState(prev => ({
            ...prev,
            lastCompletionSummary: msg.payload.summary,
            sessionTokenUsage: {
              input: prev.sessionTokenUsage.input + (msg.payload.tokenUsage?.input ?? 0),
              output: prev.sessionTokenUsage.output + (msg.payload.tokenUsage?.output ?? 0),
            },
            completedGroups: completedState
              ? new Map([...prev.completedGroups, [groupId, { ...completedState }]])
              : prev.completedGroups,
          }));
          break;
        }

        case 'task_cancelled': {
          const current = getOrCreateGroup(groupId);
          const dissolvedAgents = current.agents.map(a =>
            a.status !== 'complete' && a.status !== 'dissolved'
              ? { ...a, status: 'dissolved' as Agent['status'], currentAction: 'Stopped' }
              : a
          );
          const updated = { ...current, agents: dissolvedAgents, isActive: false, phase: 'idle' as OrchestratorState['phase'] };
          taskGroupsRef.current.set(groupId, updated);
          stateRef.current = updated;
          publishGroups();
          addGroupTimeline(groupId, { type: 'complete', description: 'Task stopped by user' });
          break;
        }

        case 'error': {
          updateGroup(groupId, { isActive: false });
          setBackendState(prev => ({ ...prev, error: msg.payload.message }));
          break;
        }

        default:
          break;
      }
      return;
    }

    // Non-group messages (config, task_relationship, global error)
    switch (msg.type) {
      case 'config': {
        setBackendState(prev => ({ ...prev, config: msg.payload, error: null }));
        break;
      }

      case 'task_relationship': {
        const rel: TaskRelationship = {
          groupAId: msg.payload.groupAId,
          groupBId: msg.payload.groupBId,
          strength: msg.payload.strength,
          keywords: msg.payload.keywords,
          merged: msg.payload.merged,
        };
        setBackendState(prev => ({
          ...prev,
          taskRelationships: [...prev.taskRelationships, rel],
        }));
        break;
      }

      case 'task_sync': {
        // Reconnect: re-hydrate all in-flight and recently completed groups so
        // the UI picks up exactly where it left off without losing progress.
        const phaseMap: Record<string, OrchestratorState['phase']> = {
          analyzing: 'analyzing', spawning: 'spawning', executing: 'executing',
          qa_review: 'qa_review', evaluating: 'evaluating', synthesizing: 'synthesizing', complete: 'complete',
        };

        let latestApproval: (typeof msg.payload.groups)[0]['pendingApproval'] | null = null;
        const newCompleted = new Map<string, OrchestratorState>();

        for (const g of msg.payload.groups) {
          const phase = phaseMap[g.phase] ?? 'executing';

          // Reconstruct agents from spawn records + latest status updates
          const agents: Agent[] = g.agents.map(a => {
            const st = g.agentStatuses[a.id];
            return {
              id: a.id, name: a.name, specialty: a.specialty, color: a.color,
              status: ((st?.status ?? 'executing') as Agent['status']),
              currentAction: st?.action ?? 'Working…',
              confidence: st?.confidence ?? 0.5,
              contributions: [a.task],
              spawnTime: performance.now(),
              groupId: g.groupId,
            };
          });

          // Apply any peer-evaluation scores that came in before reconnect
          for (const ev of g.peerEvals) {
            const agent = agents.find(a => a.id === ev.evaluateeId);
            if (agent) agent.evaluationScore = ev.score;
          }

          const insights: Insight[] = g.insights.map(ins => ({
            ...ins, timestamp: Date.now() - g.startTime,
          }));

          const done = agents.filter(a => a.status === 'complete').length;
          const completionPct = agents.length > 0 ? Math.round(done / agents.length * 100) : 0;

          const groupState: OrchestratorState = {
            phase,
            isActive: !g.complete,
            taskDescription: g.task,
            agents,
            insights,
            taskReport: g.taskReport,
            communications: [],
            timeline: [{
              id: 'sync-reconnect',
              timestamp: 0,
              type: 'task_start',
              description: 'Reconnected — task resumed',
            }],
            startTime: g.startTime,
            completionPct,
          };

          taskGroupsRef.current.set(g.groupId, groupState);
          initializedGroupsRef.current.add(g.groupId);
          stateRef.current = groupState;

          if (g.complete) {
            newCompleted.set(g.groupId, groupState);
          }

          if (g.pendingApproval) {
            latestApproval = g.pendingApproval;
          }
        }

        // Update task start time to the earliest active group so timeline offsets work
        const active = msg.payload.groups.filter(g => !g.complete);
        if (active.length > 0) {
          taskStartRef.current = Math.min(...active.map(g => g.startTime));
        }

        setBackendState(prev => ({
          ...prev,
          taskGroups: new Map(taskGroupsRef.current),
          orchestratorState: stateRef.current,
          completedGroups: newCompleted.size > 0
            ? new Map([...prev.completedGroups, ...newCompleted])
            : prev.completedGroups,
          pendingApproval: latestApproval ?? prev.pendingApproval,
        }));
        break;
      }

      case 'status': {
        const phaseMap: Record<string, OrchestratorState['phase']> = {
          analyzing: 'analyzing', spawning: 'spawning', executing: 'executing',
          evaluating: 'evaluating', synthesizing: 'synthesizing', complete: 'complete',
        };
        const phase = phaseMap[msg.payload.phase] ?? 'executing';
        updateOrch({ phase, isActive: true });
        addTimeline({ type: 'phase_change', description: msg.payload.message });
        break;
      }

      case 'agent_spawned': {
        const { id, name, specialty, color, task } = msg.payload;
        const newAgent: Agent = {
          id, name, specialty, color,
          status: 'spawning',
          currentAction: 'Initializing…',
          confidence: 0.5,
          contributions: [task],
          spawnTime: performance.now(),
        };
        stateRef.current = {
          ...stateRef.current,
          agents: [...stateRef.current.agents, newAgent],
        };
        setBackendState(prev => ({ ...prev, orchestratorState: stateRef.current }));
        addTimeline({
          type: 'agent_spawned', agentId: id, agentName: name, agentColor: color,
          description: `${name} (${specialty}) — generated`,
        });
        break;
      }

      case 'agent_update': {
        const { id, status, action, confidence } = msg.payload;
        const agents = stateRef.current.agents.map(a =>
          a.id === id
            ? { ...a, status: status as Agent['status'], currentAction: action, confidence: confidence ?? a.confidence }
            : a
        );
        stateRef.current = { ...stateRef.current, agents };
        setBackendState(prev => ({ ...prev, orchestratorState: stateRef.current }));

        if (status !== 'thinking' && status !== 'executing') {
          const agent = agents.find(a => a.id === id);
          addTimeline({
            type: 'agent_action', agentId: id,
            agentName: agent?.name, agentColor: agent?.color,
            description: action,
          });
        }

        const done = agents.filter(a => a.status === 'complete').length;
        if (agents.length > 0) {
          updateOrch({ completionPct: Math.round((done / agents.length) * 100) });
        }
        break;
      }

      case 'communication': {
        const { fromId, fromName, toId, message, duration } = msg.payload;
        const commId = nextId();
        const comm: ActiveCommunication = {
          id: commId, fromId, toId, message, startTime: performance.now(), duration,
        };
        stateRef.current = {
          ...stateRef.current,
          communications: [...stateRef.current.communications, comm],
        };
        setBackendState(prev => ({ ...prev, orchestratorState: stateRef.current }));

        const fromAgent = stateRef.current.agents.find(a => a.id === fromId);
        const toAgent = stateRef.current.agents.find(a => a.id === toId);
        addTimeline({
          type: 'communication', agentId: fromId, agentName: fromName, agentColor: fromAgent?.color,
          description: `${fromAgent?.name ?? fromName} → ${toAgent?.name ?? toId}: "${message.slice(0, 72)}"`,
        });

        const t = setTimeout(() => {
          stateRef.current = {
            ...stateRef.current,
            communications: stateRef.current.communications.filter(c => c.id !== commId),
          };
          setBackendState(prev => ({ ...prev, orchestratorState: stateRef.current }));
        }, duration + 500);
        commTimersRef.current.set(commId, t);
        break;
      }

      case 'approval_required': {
        setBackendState(prev => ({ ...prev, pendingApproval: msg.payload }));
        addTimeline({
          type: 'agent_action', agentId: msg.payload.agentId,
          agentName: msg.payload.agentName, agentColor: msg.payload.agentColor,
          description: `⚠ Approval needed: ${msg.payload.action}`,
        });
        break;
      }

      case 'action_executed': {
        const { agentId, agentName, agentColor, description, success } = msg.payload;
        addTimeline({
          type: 'agent_action', agentId, agentName, agentColor,
          description: `${success ? '✓' : '✗'} ${description}`,
        });
        setBackendState(prev => ({
          ...prev,
          pendingApproval: null,
          executionLog: [...prev.executionLog, msg.payload],
        }));
        break;
      }

      case 'peer_evaluation': {
        const { evaluatorId, evaluateeId, evaluateeName, score, feedback } = msg.payload;
        const evaluator = stateRef.current.agents.find(a => a.id === evaluatorId);
        const agents = stateRef.current.agents.map(a =>
          a.id === evaluateeId ? { ...a, evaluationScore: score } : a
        );
        stateRef.current = { ...stateRef.current, agents };
        setBackendState(prev => ({ ...prev, orchestratorState: stateRef.current }));
        addTimeline({
          type: 'evaluation', agentId: evaluatorId, agentName: evaluator?.name, agentColor: evaluator?.color,
          description: `${evaluator?.name ?? evaluatorId} → ${evaluateeName}: ${Math.round(score * 100)}% — "${feedback}"`,
        });
        break;
      }

      case 'task_report': {
        stateRef.current = { ...stateRef.current, taskReport: msg.payload };
        setBackendState(prev => ({ ...prev, orchestratorState: stateRef.current }));
        break;
      }

      case 'insight': {
        const insight: Insight = { ...msg.payload, timestamp: Date.now() - taskStartRef.current };
        stateRef.current = {
          ...stateRef.current,
          insights: [...stateRef.current.insights, insight],
        };
        setBackendState(prev => ({ ...prev, orchestratorState: stateRef.current }));
        addTimeline({ type: 'insight', description: `Insight: ${insight.title}` });
        break;
      }

      case 'task_complete': {
        updateOrch({ phase: 'complete', completionPct: 100, isActive: false });
        addTimeline({ type: 'complete', description: `Task complete — ${msg.payload.actionsCount} real actions executed in ${Math.round(msg.payload.duration / 1000)}s` });
        setBackendState(prev => ({
          ...prev,
          lastCompletionSummary: msg.payload.summary,
          sessionTokenUsage: {
            input: prev.sessionTokenUsage.input + (msg.payload.tokenUsage?.input ?? 0),
            output: prev.sessionTokenUsage.output + (msg.payload.tokenUsage?.output ?? 0),
          },
        }));
        break;
      }

      case 'task_cancelled': {
        const current = stateRef.current;
        const dissolvedAgents = current.agents.map(a =>
          a.status !== 'complete' && a.status !== 'dissolved'
            ? { ...a, status: 'dissolved' as Agent['status'], currentAction: 'Stopped' }
            : a
        );
        updateOrch({ isActive: false, phase: 'idle', agents: dissolvedAgents });
        addTimeline({ type: 'complete', description: 'Task stopped by user' });
        break;
      }

      case 'error': {
        setBackendState(prev => ({ ...prev, error: msg.payload.message }));
        updateOrch({ isActive: false });
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateOrch, addTimeline]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setBackendState(prev => ({ ...prev, connected: true, error: null }));
      ws.send(JSON.stringify({ type: 'get_config' }));
    };

    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data as string) as ServerMessage & { groupId?: string };
        const { groupId, ...msg } = parsed as { groupId?: string } & ServerMessage;
        handleMessage(msg as ServerMessage, groupId);
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      setBackendState(prev => ({ ...prev, connected: false }));
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      // onerror always followed by onclose
    };
  }, [handleMessage]);

  useEffect(() => {
    connect();
    return () => {
      reconnectRef.current && clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendTask = useCallback((task: string, images: AttachedImage[] = [], conversationHistory: ConvHistoryItem[] = []) => {
    taskStartRef.current = Date.now();
    // Enqueue task description so the first incoming group message can claim it
    pendingTasksRef.current.push(task);
    // Prune completed task groups from the active canvas (results stay in completedGroups).
    for (const [gid, gs] of taskGroupsRef.current.entries()) {
      if (gs.phase === 'complete' || !gs.isActive) {
        taskGroupsRef.current.delete(gid);
      }
    }
    // Clear execution log so references from previous tasks don't bleed into the new one
    setBackendState(prev => ({ ...prev, executionLog: [], error: null }));
    // Strip preview URL before sending
    const wireImages = images.map(({ id, name, fileType, mediaType, data, size }) => ({ id, name, fileType: fileType ?? 'image', mediaType, data, size }));
    wsRef.current?.send(JSON.stringify({ type: 'task', payload: { task, images: wireImages, conversationHistory } }));
  }, []);

  const sendApproval = useCallback((id: string, approved: boolean, groupId?: string) => {
    setBackendState(prev => ({ ...prev, pendingApproval: null }));
    const payload: { id: string; groupId?: string } = { id };
    if (groupId) payload.groupId = groupId;
    wsRef.current?.send(JSON.stringify({ type: approved ? 'approve' : 'deny', payload }));
  }, []);

  const saveApiKey = useCallback((apiKey: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'save_config', payload: { apiKey } }));
  }, []);

  const sendSettings = useCallback((patch: {
    apiKey?: string;
    sandboxPaths?: string[];
    searchApiKey?: string;
    agentModel?: string;
    orchestratorModel?: string;
    maxIterationsPerAgent?: number;
  }) => {
    wsRef.current?.send(JSON.stringify({ type: 'save_config', payload: patch }));
  }, []);

  const reset = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel' }));
    stateRef.current = defaultOrchestratorState();
    taskGroupsRef.current = new Map();
    pendingTasksRef.current = [];
    initializedGroupsRef.current = new Set();
    setBackendState(prev => ({
      ...prev,
      orchestratorState: defaultOrchestratorState(),
      taskGroups: new Map(),
      completedGroups: new Map(),
      taskRelationships: [],
      pendingApproval: null,
      executionLog: [],
      error: null,
      lastCompletionSummary: null,
      sessionTokenUsage: { input: 0, output: 0 },
    }));
  }, []);

  const stop = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel' }));
  }, []);

  return { backendState, sendTask, sendApproval, saveApiKey, sendSettings, reset, stop };
}
