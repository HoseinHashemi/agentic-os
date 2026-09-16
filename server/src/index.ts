import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFile } from 'fs/promises';
import { resolve, basename } from 'path';
import { homedir } from 'os';
import { loadConfig, saveConfig, getApiKey } from './store.js';
import { RealOrchestrator } from './orchestrator.js';
import type {
  ClientMessage, ServerMessage,
  AgentSpawnedPayload, AgentUpdatePayload, InsightPayload,
  TaskReportPayload, ApprovalPayload, GroupSyncPayload,
} from './types.js';

const PORT = 3001;

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, version: '0.1.0' }));

// File download endpoint — only serves files inside allowed sandbox/workspace paths
app.get('/api/download', async (req, res) => {
  const rawPath = req.query.path as string | undefined;
  if (!rawPath) { res.status(400).json({ error: 'path is required' }); return; }

  const absPath = resolve(rawPath);
  const workspacePath = resolve(`${homedir()}/.agentic-os/workspace`);

  const config = await loadConfig();
  const allowedRoots = [workspacePath, ...config.sandboxPaths.map(p => resolve(p))];
  const allowed = allowedRoots.some(root => absPath.startsWith(root + '/') || absPath === root);
  if (!allowed) { res.status(403).json({ error: 'Path not in allowed sandbox' }); return; }

  try {
    const data = await readFile(absPath);
    const filename = basename(absPath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(data);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// Inline file viewer — serves workspace files with correct MIME type for iframe rendering
app.get('/api/file', async (req, res) => {
  const rawPath = req.query.path as string | undefined;
  if (!rawPath) { res.status(400).json({ error: 'path is required' }); return; }

  const absPath = resolve(rawPath);
  const workspacePath = resolve(`${homedir()}/.agentic-os/workspace`);

  const config = await loadConfig();
  const allowedRoots = [workspacePath, ...config.sandboxPaths.map(p => resolve(p))];
  const allowed = allowedRoots.some(root => absPath.startsWith(root + '/') || absPath === root);
  if (!allowed) { res.status(403).json({ error: 'Path not in allowed sandbox' }); return; }

  try {
    const data = await readFile(absPath);
    const ext = basename(absPath).split('.').pop()?.toLowerCase() ?? '';
    const MIME: Record<string, string> = {
      html: 'text/html; charset=utf-8',
      htm:  'text/html; charset=utf-8',
      svg:  'image/svg+xml',
      json: 'application/json',
      csv:  'text/csv',
      txt:  'text/plain; charset=utf-8',
      png:  'image/png',
      jpg:  'image/jpeg',
      jpeg: 'image/jpeg',
      gif:  'image/gif',
      webp: 'image/webp',
    };
    res.setHeader('Content-Type', MIME[ext] ?? 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(data);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// ── Keyword helpers ────────────────────────────────────────────────────────────
function getKeywords(text: string): Set<string> {
  const STOP = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','this','that','what','how','can','will','should','please','make','also','create']);
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w))
  );
}

function computeStrength(a: string, b: string): { strength: number; keywords: string[] } {
  const kA = getKeywords(a), kB = getKeywords(b);
  const shared = [...kA].filter(k => kB.has(k));
  const denom = Math.sqrt(kA.size * kB.size);
  return { strength: denom > 0 ? shared.length / denom : 0, keywords: shared.slice(0, 4) };
}

// ── Module-level task state (persists across WebSocket reconnects) ─────────────

/** The most-recently connected client. Orchestrator messages always go here. */
let currentWs: WebSocket | null = null;

interface RunningTask {
  orch: RealOrchestrator;
  task: string;
}

/** All orchestrators currently executing, keyed by groupId. */
const runningTasks = new Map<string, RunningTask>();

/** Per-group snapshot for replaying state to a reconnecting client. */
const groupSnapshots = new Map<string, GroupSnapshot>();

interface GroupSnapshot {
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

/** Send a message to the current connected client. */
function broadcast(msg: ServerMessage & { groupId?: string }) {
  if (currentWs?.readyState === WebSocket.OPEN) {
    currentWs.send(JSON.stringify(msg));
  }
}

/** Update the in-memory snapshot for a group as events arrive. */
function updateSnapshot(groupId: string, msg: ServerMessage): void {
  const snap = groupSnapshots.get(groupId);
  if (!snap) return;

  switch (msg.type) {
    case 'status':
      snap.phase = msg.payload.phase;
      break;
    case 'agent_spawned':
      if (!snap.agents.find(a => a.id === msg.payload.id)) {
        snap.agents.push(msg.payload);
      }
      snap.agentStatuses[msg.payload.id] = {
        id: msg.payload.id, status: 'spawning', action: 'Initializing…',
      };
      break;
    case 'agent_update':
      snap.agentStatuses[msg.payload.id] = msg.payload;
      break;
    case 'insight':
      if (!snap.insights.find(i => i.id === msg.payload.id)) {
        snap.insights.push(msg.payload);
      }
      break;
    case 'task_report':
      snap.taskReport = msg.payload;
      break;
    case 'approval_required':
      snap.pendingApproval = msg.payload;
      break;
    case 'action_executed':
      snap.pendingApproval = undefined;
      break;
    case 'peer_evaluation':
      snap.peerEvals.push(msg.payload);
      break;
    case 'task_complete':
      snap.phase = 'complete';
      snap.complete = true;
      snap.pendingApproval = undefined;
      break;
    case 'error':
      snap.complete = true;
      snap.pendingApproval = undefined;
      break;
  }
}

// ── WebSocket server ──────────────────────────────────────────────────────────

wss.on('connection', async (ws: WebSocket) => {
  currentWs = ws;
  console.log('[WS] Client connected');

  function send(msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // Send initial config state
  const config = await loadConfig();
  const apiKey = await getApiKey();
  send({
    type: 'config',
    payload: {
      hasApiKey: !!apiKey,
      sandboxPaths: config.sandboxPaths,
      workspacePath: `${process.env.HOME}/.agentic-os/workspace`,
      searchApiKey: config.searchApiKey,
      agentModel: config.agentModel,
      orchestratorModel: config.orchestratorModel,
      maxIterationsPerAgent: config.maxIterationsPerAgent,
    },
  });

  // Replay all in-flight (and recently completed) task groups so a reconnecting
  // client immediately sees everything that's still running or just finished.
  const activeSnapshots = Array.from(groupSnapshots.values());
  if (activeSnapshots.length > 0) {
    const groups: GroupSyncPayload[] = activeSnapshots.map(snap => ({
      groupId:        snap.groupId,
      task:           snap.task,
      phase:          snap.phase,
      startTime:      snap.startTime,
      complete:       snap.complete,
      agents:         snap.agents,
      agentStatuses:  snap.agentStatuses,
      insights:       snap.insights,
      taskReport:     snap.taskReport,
      pendingApproval: snap.pendingApproval,
      peerEvals:      snap.peerEvals,
    }));
    ws.send(JSON.stringify({ type: 'task_sync', payload: { groups } }));
    console.log(`[WS] Sent sync with ${groups.length} group(s) to reconnecting client`);
  }

  ws.on('message', async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send({ type: 'error', payload: { message: 'Invalid JSON message' } });
      return;
    }

    switch (msg.type) {
      case 'get_config': {
        const config = await loadConfig();
        const apiKey = await getApiKey();
        send({
          type: 'config',
          payload: {
            hasApiKey: !!apiKey,
            sandboxPaths: config.sandboxPaths,
            workspacePath: `${process.env.HOME}/.agentic-os/workspace`,
            searchApiKey: config.searchApiKey,
            agentModel: config.agentModel,
            orchestratorModel: config.orchestratorModel,
            maxIterationsPerAgent: config.maxIterationsPerAgent,
          },
        });
        break;
      }

      case 'save_config': {
        try {
          await saveConfig({
            ...(msg.payload.apiKey !== undefined ? { apiKey: msg.payload.apiKey } : {}),
            ...(msg.payload.sandboxPaths ? { sandboxPaths: msg.payload.sandboxPaths } : {}),
            ...(msg.payload.searchApiKey !== undefined ? { searchApiKey: msg.payload.searchApiKey } : {}),
            ...(msg.payload.agentModel ? { agentModel: msg.payload.agentModel } : {}),
            ...(msg.payload.orchestratorModel ? { orchestratorModel: msg.payload.orchestratorModel } : {}),
            ...(msg.payload.maxIterationsPerAgent ? { maxIterationsPerAgent: msg.payload.maxIterationsPerAgent } : {}),
          });
          const newKey = await getApiKey();
          const updatedConfig = await loadConfig();
          send({
            type: 'config',
            payload: {
              hasApiKey: !!newKey,
              sandboxPaths: updatedConfig.sandboxPaths,
              workspacePath: `${process.env.HOME}/.agentic-os/workspace`,
              searchApiKey: updatedConfig.searchApiKey,
              agentModel: updatedConfig.agentModel,
              orchestratorModel: updatedConfig.orchestratorModel,
              maxIterationsPerAgent: updatedConfig.maxIterationsPerAgent,
            },
          });
          console.log('[Config] API key saved');
        } catch (err) {
          send({ type: 'error', payload: { message: `Failed to save config: ${err}` } });
        }
        break;
      }

      case 'task': {
        const apiKey = await getApiKey();
        if (!apiKey) {
          send({ type: 'error', payload: { message: 'No API key configured. Please set your Anthropic API key.' } });
          return;
        }

        const groupId = `g${Date.now().toString(36)}-${Math.random().toString(36).slice(2,5)}`;
        const config = await loadConfig();

        // Initialise snapshot before starting so reconnects during the task see it
        groupSnapshots.set(groupId, {
          groupId, task: msg.payload.task, phase: 'analyzing',
          startTime: Date.now(), complete: false,
          agents: [], agentStatuses: {}, insights: [], peerEvals: [],
        });

        // Always include the workspace path in the sandbox so agents can write there
        // even if the user's saved config omits it.
        const workspaceDir = resolve(`${homedir()}/.agentic-os/workspace`);
        const effectiveSandbox = config.sandboxPaths.some(p => resolve(p) === workspaceDir)
          ? config.sandboxPaths
          : [...config.sandboxPaths, workspaceDir];

        const orch = new RealOrchestrator(
          apiKey,
          effectiveSandbox,
          (m) => {
            // Route to whoever is connected right now (survives reconnects)
            broadcast({ ...m, groupId });
            updateSnapshot(groupId, m);
          },
          {
            searchApiKey: config.searchApiKey,
            agentModel: config.agentModel,
            orchestratorModel: config.orchestratorModel,
            maxIterations: config.maxIterationsPerAgent,
          },
        );

        // Detect relationships with already-running tasks
        for (const [existId, { task: existTask }] of runningTasks.entries()) {
          const { strength, keywords } = computeStrength(msg.payload.task, existTask);
          if (strength > 0.10) {
            broadcast({
              type: 'task_relationship',
              payload: { groupAId: existId, groupBId: groupId, strength, keywords, merged: strength > 0.30 },
            });
          }
        }

        runningTasks.set(groupId, { orch, task: msg.payload.task });

        const images = msg.payload.images ?? [];
        const conversationHistory = msg.payload.conversationHistory ?? [];
        console.log(`[Task] Starting group=${groupId}: "${msg.payload.task}" (${images.length} files, ${conversationHistory.length} history turns)`);

        orch.run(msg.payload.task, images, conversationHistory)
          .catch(err => {
            console.error('[Task] Error:', err);
            broadcast({ type: 'error', payload: { message: String(err) }, groupId });
            updateSnapshot(groupId, { type: 'error', payload: { message: String(err) } });
          })
          .finally(() => {
            runningTasks.delete(groupId);
            // Keep the snapshot for 60 s after completion so a late reconnect
            // still sees the finished result before it fades away.
            setTimeout(() => groupSnapshots.delete(groupId), 60_000);
          });
        break;
      }

      case 'approve': {
        const gid = msg.payload?.groupId;
        if (gid) {
          runningTasks.get(gid)?.orch.handleApproval(msg.payload.id, true);
        } else {
          for (const [, { orch }] of runningTasks) orch.handleApproval(msg.payload.id, true);
        }
        break;
      }

      case 'deny': {
        const gid = msg.payload?.groupId;
        if (gid) {
          runningTasks.get(gid)?.orch.handleApproval(msg.payload.id, false);
        } else {
          for (const [, { orch }] of runningTasks) orch.handleApproval(msg.payload.id, false);
        }
        break;
      }

      case 'cancel': {
        const gid = (msg as { type: 'cancel'; payload?: { groupId?: string } }).payload?.groupId;
        if (gid) {
          runningTasks.get(gid)?.orch.cancel();
          runningTasks.delete(gid);
          groupSnapshots.delete(gid);
          send({ type: 'task_cancelled', payload: { groupId: gid } });
        } else {
          for (const [, { orch }] of runningTasks) orch.cancel();
          runningTasks.clear();
          groupSnapshots.clear();
          send({ type: 'task_cancelled', payload: {} });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentWs === ws) currentWs = null;
    console.log(`[WS] Client disconnected — ${runningTasks.size} task(s) continue running`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err);
  });
});

server.listen(PORT, () => {
  console.log(`\n🟣 Nexus Backend running on http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health\n`);
});
