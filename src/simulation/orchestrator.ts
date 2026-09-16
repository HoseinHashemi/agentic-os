import { matchScenario } from './scenarios';
import type {
  Agent,
  AgentStatus,
  ActiveCommunication,
  TimelineEvent,
  Insight,
  OrchestratorState,
  OrchestratorPhase,
  Scenario,
  ScriptedEvent,
} from '../types';

let globalEventId = 0;
function nextId() { return `ev-${++globalEventId}`; }

export type OrchestratorCallback = (state: OrchestratorState) => void;

export class Orchestrator {
  private cb: OrchestratorCallback | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private state: OrchestratorState = defaultState();
  private taskStart = 0;

  onUpdate(cb: OrchestratorCallback) {
    this.cb = cb;
  }

  private push(partial: Partial<OrchestratorState>) {
    this.state = { ...this.state, ...partial };
    this.cb?.(this.state);
  }

  private elapsed() {
    return performance.now() - this.taskStart;
  }

  private schedule(delay: number, fn: () => void) {
    this.timers.push(setTimeout(fn, delay));
  }

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  reset() {
    this.stop();
    this.state = defaultState();
    this.cb?.(this.state);
  }

  private updateAgent(agentId: string, patch: Partial<Agent>) {
    const agents = this.state.agents.map(a =>
      a.id === agentId ? { ...a, ...patch } : a
    );
    this.push({ agents });
  }

  private addTimeline(event: Omit<TimelineEvent, 'id' | 'timestamp'>) {
    const entry: TimelineEvent = {
      id: nextId(),
      timestamp: this.elapsed(),
      ...event,
    };
    this.push({ timeline: [...this.state.timeline, entry] });
  }

  private updateCompletion() {
    const agents = this.state.agents;
    if (agents.length === 0) return;
    const done = agents.filter(a => a.status === 'complete').length;
    this.push({ completionPct: Math.round((done / agents.length) * 100) });
  }

  run(task: string) {
    this.stop();
    const scenario = matchScenario(task);
    this.taskStart = performance.now();

    this.state = {
      ...defaultState(),
      taskDescription: task,
      isActive: true,
      startTime: Date.now(),
    };
    this.cb?.(this.state);

    this.addTimeline({
      type: 'task_start',
      description: `Task received: "${task}"`,
    });

    this.executeScenario(scenario);
  }

  private executeScenario(scenario: Scenario) {
    // Sort events by delay to ensure clean ordering
    const sorted = [...scenario.events].sort((a, b) => a.delay - b.delay);

    sorted.forEach((ev: ScriptedEvent) => {
      this.schedule(ev.delay, () => this.applyEvent(ev, scenario));
    });

    // Progress ticker
    const progressTimer = setInterval(() => {
      const elapsed = this.elapsed();
      const pct = Math.min(99, Math.round((elapsed / scenario.totalDuration) * 100));
      if (this.state.phase !== 'complete') {
        this.push({ completionPct: pct });
      }
    }, 500);
    this.timers.push(progressTimer as unknown as ReturnType<typeof setTimeout>);
  }

  private applyEvent(ev: ScriptedEvent, scenario: Scenario) {
    const agentConfig = scenario.agents.find(a => a.id === ev.agentId);
    const fromConfig = scenario.agents.find(a => a.id === ev.fromId);
    const toConfig = scenario.agents.find(a => a.id === ev.toId);

    switch (ev.type) {
      case 'phase_change': {
        const phase = ev.phase as OrchestratorPhase;
        this.push({ phase });
        this.addTimeline({
          type: 'phase_change',
          description: ev.phaseLabel ?? phaseLabel(phase),
        });
        break;
      }

      case 'agent_spawn': {
        if (!agentConfig) break;
        const agent: Agent = {
          ...agentConfig,
          status: 'spawning',
          currentAction: ev.action ?? 'Initializing…',
          confidence: 0.5,
          contributions: [],
          spawnTime: performance.now(),
        };
        const agents = [...this.state.agents, agent];
        this.push({ agents });
        this.addTimeline({
          type: 'agent_spawned',
          agentId: agent.id,
          agentName: agent.name,
          agentColor: agent.color,
          description: `${agent.name} (${agent.specialty}) generated`,
        });

        // Transition from spawning to thinking after 800ms
        this.schedule(800, () => {
          this.updateAgent(agent.id, { status: 'thinking', currentAction: 'Orienting to task context…' });
        });
        break;
      }

      case 'agent_action': {
        if (!agentConfig) break;
        const status = (ev.status as AgentStatus) ?? 'executing';
        this.updateAgent(agentConfig.id, {
          status,
          currentAction: ev.action ?? '',
        });
        if (status !== 'complete') {
          this.addTimeline({
            type: 'agent_action',
            agentId: agentConfig.id,
            agentName: agentConfig.name,
            agentColor: agentConfig.color,
            description: ev.action ?? '',
          });
        }
        if (status === 'complete') {
          this.addTimeline({
            type: 'agent_action',
            agentId: agentConfig.id,
            agentName: agentConfig.name,
            agentColor: agentConfig.color,
            description: `${agentConfig.name} — work complete`,
          });
          this.updateCompletion();
        }
        break;
      }

      case 'agent_confidence': {
        if (!agentConfig) break;
        this.updateAgent(agentConfig.id, { confidence: ev.confidence ?? 0.8 });
        break;
      }

      case 'communication': {
        if (!fromConfig || !toConfig) break;
        const commId = nextId();
        const duration = ev.commDuration ?? 2000;
        const comm: ActiveCommunication = {
          id: commId,
          fromId: fromConfig.id,
          toId: toConfig.id,
          message: ev.message ?? '',
          startTime: performance.now(),
          duration,
        };
        this.push({ communications: [...this.state.communications, comm] });
        this.addTimeline({
          type: 'communication',
          agentId: fromConfig.id,
          agentName: fromConfig.name,
          agentColor: fromConfig.color,
          description: `${fromConfig.name} → ${toConfig.name}: "${truncate(ev.message ?? '', 72)}"`,
        });

        // Remove communication after it finishes
        this.schedule(duration + 500, () => {
          this.push({
            communications: this.state.communications.filter(c => c.id !== commId),
          });
        });
        break;
      }

      case 'peer_evaluation': {
        const evaluator = scenario.agents.find(a => a.id === ev.evaluatorId);
        const evaluatee = scenario.agents.find(a => a.id === ev.evaluateeId);
        if (!evaluator || !evaluatee) break;
        this.updateAgent(evaluatee.id, { evaluationScore: ev.score });
        this.addTimeline({
          type: 'evaluation',
          agentId: evaluator.id,
          agentName: evaluator.name,
          agentColor: evaluator.color,
          description: `${evaluator.name} → ${evaluatee.name}: score ${Math.round((ev.score ?? 0) * 100)}% — "${truncate(ev.feedback ?? '', 72)}"`,
        });
        break;
      }

      case 'task_report': {
        if (!ev.taskReport) break;
        this.push({ taskReport: ev.taskReport });
        break;
      }

      case 'insight': {
        if (!ev.insight) break;
        const insight: Insight = {
          ...ev.insight,
          id: nextId(),
          timestamp: this.elapsed(),
        };
        this.push({ insights: [...this.state.insights, insight] });
        this.addTimeline({
          type: 'insight',
          description: `Insight: ${insight.title}`,
        });
        break;
      }

      case 'complete': {
        const completedAgents = this.state.agents.map(a =>
          a.status === 'complete' ? a : { ...a, status: 'complete' as AgentStatus }
        );
        this.push({ phase: 'complete', completionPct: 100, isActive: false, agents: completedAgents });
        this.addTimeline({ type: 'complete', description: 'Task fully complete. All agents dissolved.' });
        break;
      }
    }
  }
}

function defaultState(): OrchestratorState {
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

function phaseLabel(phase: OrchestratorPhase): string {
  const labels: Record<OrchestratorPhase, string> = {
    idle: 'Idle',
    analyzing: 'Analyzing task…',
    spawning: 'Spawning specialist agents…',
    executing: 'Agents executing in parallel…',
    qa_review: 'QA Reviewer verifying results…',
    evaluating: 'Cross-agent peer evaluation…',
    synthesizing: 'Synthesizing final output…',
    complete: 'Task complete',
  };
  return labels[phase] ?? phase;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
