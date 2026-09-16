import Anthropic from '@anthropic-ai/sdk';
import { homedir, platform } from 'os';
import { basename, resolve, isAbsolute } from 'path';
import { exec } from 'child_process';
import { FILESYSTEM_TOOLS, executeFilesystemTool } from './tools/filesystem.js';
import { LAUNCH_TOOLS, executeLaunchTool } from './tools/launch.js';
import { WEB_TOOLS, executeWebTool } from './tools/web.js';
import type { WebToolResult } from './tools/web.js';
import { SHELL_TOOLS, executeShellTool } from './tools/shell.js';
import type {
  ServerMessage, AgentPlan, OrchestrationPlan, AgentResult, ApprovalRequest, WireImage, ConvHistoryItem, QAEventPayload,
} from './types.js';
import { getWorkspacePath } from './store.js';

const ALL_TOOLS = [...FILESYSTEM_TOOLS, ...LAUNCH_TOOLS, ...WEB_TOOLS, ...SHELL_TOOLS];
const LAUNCH_TOOL_NAMES = new Set(LAUNCH_TOOLS.map(t => t.name));
const WEB_TOOL_NAMES    = new Set(WEB_TOOLS.map(t => t.name));
const SHELL_TOOL_NAMES  = new Set(SHELL_TOOLS.map(t => t.name));

// ─── Convert attached file to Anthropic content block ─────────────────────────
function wireImageToBlock(img: WireImage): Anthropic.ContentBlockParam {
  const ft = img.fileType ?? 'image';
  if (ft === 'pdf') {
    return { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: img.data } } as Anthropic.ContentBlockParam;
  }
  if (ft === 'text') {
    return { type: 'text' as const, text: `Attached file — ${img.name}:\n\`\`\`\n${img.data.slice(0, 20000)}${img.data.length > 20000 ? '\n…[truncated]' : ''}\n\`\`\`` };
  }
  return { type: 'image' as const, source: { type: 'base64' as const, media_type: img.mediaType as Anthropic.Base64ImageSource['media_type'], data: img.data } };
}

const COLORS = ['#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#3b82f6', '#14b8a6', '#f97316'];

const ORCHESTRATION_SYSTEM = `You are Nexus Orchestrator — an intelligent task analysis system.

When given a user task, determine what specialized AI agents are needed to complete it.

Respond ONLY with a valid JSON object (no markdown fences, no explanation text):
{
  "agents": [
    {
      "id": "agent_1",
      "name": "Human-readable name (e.g. File Manager, Research Agent, Web Scout)",
      "specialty": "Brief specialty (e.g. File System Operations, Web Research)",
      "task": "Detailed description of exactly what this agent must do, with specifics",
      "tools": ["create_directory", "create_file"],
      "depends_on": []
    }
  ],
  "summary": "One sentence describing what the system will do"
}

Available tools (assign only relevant ones to each agent):
- create_directory, create_file, read_file, list_directory, move_file, copy_file, delete_file, get_system_paths — filesystem operations
- launch_app — launch applications or open URLs in a browser
- web_search — search the internet for current information, news, facts, documentation
- fetch_url — fetch and read the full content of a specific web page
- run_command — execute shell commands (git, npm, pip, scripts, etc.)
- report_result — ALWAYS include this in every agent

Rules:
- For simple tasks: 1-2 agents. For complex multi-domain: 3-5 agents.
- Each agent owns exactly one domain. No two agents may share the same specialty or perform overlapping actions.
- Before adding an agent, ask: "Does any existing agent already cover this?" If yes, merge the work into that agent instead of creating a new one.
- Forbidden overlaps: do NOT create a separate "Analysis" agent if a "Research" agent already analyzes; do NOT create a separate "Summary" or "Writer" agent if synthesis is already implied by another agent's task.
- Tool exclusivity: if only one agent needs web_search, only assign it to that agent — never assign the same tool to multiple agents unless each has a truly distinct search goal.
- Use depends_on to express ordering (use agent id strings).
- Always include "report_result" in every agent's tools list.
- Task descriptions must be precise and actionable — state specifically WHAT data to gather or produce, not just HOW.
- Assign web_search/fetch_url to agents that need current information from the internet.
- Assign run_command to agents that need to execute scripts or CLI tools.
- For tasks that say "generate a script and run it" or "run on sample data" or "show results as a graph/chart": the responsible agent MUST have both create_file AND run_command tools and its task description must explicitly say "write the script, run it with run_command, and include the output in the report".
- Never create a "Script Writer" agent without pairing it with execution — the same agent that writes code must also run it.
- For tasks requesting interactive charts, graphs, dashboards, simulations, animations, or visualizations: the responsible agent MUST use create_file to write a self-contained HTML file (using Plotly.js or Chart.js CDN for charts, HTML5 canvas for animations/simulations), then run_command to verify the file exists. Interactive HTML artifacts are displayed inline as iframe viewers in the report — this is the preferred output for any visualization request.`;

function buildAgentSystem(agent: AgentPlan, desktopPath: string, workspacePath: string): string {
  return `You are ${agent.name}, a specialized ${agent.specialty} agent in the Nexus agentic system.

Your task: ${agent.task}

System paths available to you:
- Desktop: ${desktopPath}
- Home: ${homedir()}
- Workspace: ${workspacePath}

Instructions:
1. Use get_system_paths first if you need exact paths.
2. For tasks requiring internet info, use web_search then fetch_url to read pages.
3. Execute your task step by step using the available tools.
4. Be specific — use absolute paths for all file operations.
5. After completing ALL steps, call report_result with a clear summary.
6. Set confidence between 0.0 and 1.0 based on how certain you are the task was done correctly.

CRITICAL SCRIPT EXECUTION RULES — you MUST follow these exactly:
- If you write any executable file (Python .py, bash .sh, Node .js, etc.), you MUST run it with run_command before calling report_result. Never create a script and stop there — run it.
- For Python scripts that generate static visualizations: ALWAYS use plt.savefig('${workspacePath}/output.png', dpi=150, bbox_inches='tight') and plt.close() instead of plt.show(). plt.show() has no effect in this headless environment.
- For interactive charts, graphs, or dashboards: generate a self-contained HTML file using Plotly.js CDN (https://cdn.plot.ly/plotly-latest.min.js) or Chart.js CDN (https://cdn.jsdelivr.net/npm/chart.js). Use create_file to write it, then run_command "ls -la <path>" to confirm it exists. The HTML must be fully self-contained (all data inline, all scripts from CDN). Use a dark background (#0d0d0d) and fill the viewport (100vw/100vh) for best display.
- For physics simulations, particle systems, or animations: generate a self-contained HTML file with an HTML5 canvas and requestAnimationFrame loop. Save to workspace as a .html file with create_file.
- When creating any HTML visualization: always include a <meta charset="utf-8"> and make it responsive. Prefer dark themes matching a dark UI.
- For Python data analysis scripts: write intermediate results with print() statements so the output is visible, AND save final results (DataFrames, arrays) to CSV/JSON files in the workspace.
- After running any script, copy the actual stdout output verbatim into your report_result summary so the user sees real computed results.
- If a script fails (import error, missing module), try installing the missing package with pip first: run_command "pip install <package>" or "pip3 install <package>", then re-run the script.
- Use the workspace directory (${workspacePath}) for all generated output files.
- IMPORTANT — include generated code in your summary: If you wrote any code (HTML, Python, JavaScript, CSS, etc.), paste the FULL code into your report_result summary inside a markdown fenced code block with the correct language tag (triple backticks followed by the language name, e.g. html, python, javascript). Never omit generated code from your summary — the user must be able to see it in the report.`;
}

type ApprovalResolver = (approved: boolean) => void;

function sendNotification(title: string, message: string) {
  if (platform() !== 'darwin') return;
  const safeMsg = message.replace(/"/g, '\\"').replace(/'/g, "'").slice(0, 100);
  const safeTitle = title.replace(/"/g, '\\"');
  exec(`osascript -e 'display notification "${safeMsg}" with title "${safeTitle}" sound name "Glass"'`);
}

export class RealOrchestrator {
  private anthropic: Anthropic;
  private send: (msg: ServerMessage) => void;
  private pendingApprovals: Map<string, ApprovalResolver> = new Map();
  private sandboxPaths: string[] = [];
  private searchApiKey?: string;
  private agentModel: string;
  private orchestratorModel: string;
  private maxIterations: number;
  private cancelled = false;
  private startTime = 0;
  private totalActions = 0;
  private tokenUsage = { input: 0, output: 0 };
  private fetchedUrls = new Set<string>();
  private discoveredImages: Array<{ imageUrl: string; pageUrl: string; alt?: string; isOg: boolean }> = [];
  private createdFiles: Array<{ path: string; name: string }> = [];

  constructor(
    apiKey: string,
    sandboxPaths: string[],
    send: (msg: ServerMessage) => void,
    options: { searchApiKey?: string; agentModel?: string; orchestratorModel?: string; maxIterations?: number } = {},
  ) {
    this.anthropic = new Anthropic({ apiKey });
    this.sandboxPaths = sandboxPaths;
    this.send = send;
    this.searchApiKey = options.searchApiKey;
    this.agentModel = options.agentModel ?? 'claude-sonnet-4-6';
    this.orchestratorModel = options.orchestratorModel ?? 'claude-haiku-4-5-20251001';
    this.maxIterations = options.maxIterations ?? 20;
  }

  handleApproval(id: string, approved: boolean) {
    const resolve = this.pendingApprovals.get(id);
    if (resolve) { resolve(approved); this.pendingApprovals.delete(id); }
  }

  cancel() {
    this.cancelled = true;
    for (const [id, resolve] of this.pendingApprovals) {
      resolve(false);
      this.pendingApprovals.delete(id);
    }
  }

  async run(task: string, images: WireImage[] = [], conversationHistory: ConvHistoryItem[] = []): Promise<void> {
    this.cancelled = false;
    this.startTime = Date.now();
    this.totalActions = 0;
    this.tokenUsage = { input: 0, output: 0 };
    this.fetchedUrls = new Set<string>();
    this.discoveredImages = [];
    this.createdFiles = [];

    try {
      this.send({ type: 'status', payload: { phase: 'analyzing', message: 'Analyzing task and determining agents…' } });
      const plan = await this.orchestrate(task, images, conversationHistory);
      if (this.cancelled) return;

      this.send({ type: 'status', payload: { phase: 'spawning', message: 'Generating specialist agents…' } });

      for (let i = 0; i < plan.agents.length; i++) {
        const agent = plan.agents[i];
        const color = COLORS[i % COLORS.length];
        agent.color = color;
        this.send({ type: 'agent_spawned', payload: { id: agent.id, name: agent.name, specialty: agent.specialty, color, task: agent.task } });
        await sleep(120);
        if (this.cancelled) return;
      }

      this.send({ type: 'status', payload: { phase: 'executing', message: 'Agents executing in parallel…' } });

      const results = new Map<string, AgentResult>();
      const levels = getDependencyLevels(plan.agents);
      const workspacePath = await getWorkspacePath();

      for (const level of levels) {
        if (this.cancelled) return;
        await Promise.all(level.map(agent =>
          this.executeAgentWithRetry(agent, results, task, images, workspacePath, conversationHistory)
        ));
      }

      if (!this.cancelled) {
        this.send({ type: 'status', payload: { phase: 'qa_review', message: 'QA Reviewer verifying agent results…' } });
        await this.runQAReview(plan.agents, results, task, images, workspacePath, conversationHistory);
      }

      if (plan.agents.length > 1 && !this.cancelled) {
        this.send({ type: 'status', payload: { phase: 'evaluating', message: 'Agents cross-evaluating each other…' } });
        await this.runPeerEvaluations(plan.agents, results);
      }

      if (!this.cancelled) {
        this.send({ type: 'status', payload: { phase: 'synthesizing', message: 'Synthesizing results into insights…' } });
        await this.generateInsights(plan, results, task);
      }

      const duration = Date.now() - this.startTime;
      this.send({
        type: 'task_complete',
        payload: { summary: plan.summary, actionsCount: this.totalActions, duration, tokenUsage: { ...this.tokenUsage } },
      });

      sendNotification('Nexus', `Task complete — ${plan.summary.slice(0, 80)}`);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.send({ type: 'error', payload: { message: msg } });
    }
  }

  private async orchestrate(task: string, images: WireImage[] = [], conversationHistory: ConvHistoryItem[] = []): Promise<OrchestrationPlan> {
    const historyContext = conversationHistory.length > 0
      ? `Conversation history (prior exchanges — use for context and corrections):\n${conversationHistory.map(m => `${m.role === 'user' ? 'User' : 'Nexus'}: ${m.content}`).join('\n')}\n\n`
      : '';

    const userContent: Anthropic.ContentBlockParam[] = [
      ...images.map(wireImageToBlock),
      { type: 'text' as const, text: `${historyContext}Task: "${task}"` },
    ];

    const response = await this.anthropic.messages.create({
      model: this.orchestratorModel,
      max_tokens: 2048,
      system: ORCHESTRATION_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    });

    if (response.usage) {
      this.tokenUsage.input += response.usage.input_tokens;
      this.tokenUsage.output += response.usage.output_tokens;
    }

    const text = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Orchestrator returned invalid plan: ${text.slice(0, 200)}`);

    const plan = JSON.parse(jsonMatch[0]) as OrchestrationPlan;
    plan.agents = plan.agents.map((a, i) => {
      const agent = { ...a, id: a.id || `agent_${i + 1}`, color: COLORS[i % COLORS.length], depends_on: a.depends_on ?? [] };
      const taskLower = (agent.task + ' ' + agent.specialty + ' ' + agent.name).toLowerCase();
      // Ensure visualization/HTML agents always have the tools they need
      const needsHtml = /html|chart|graph|dashboard|visuali[sz]|plot|diagram|animation|simulat/.test(taskLower);
      const needsExec = /script|run|execut|command|python|node|bash|install|pip|npm/.test(taskLower);
      if (needsHtml) {
        if (!agent.tools.includes('create_file')) agent.tools.push('create_file');
        if (!agent.tools.includes('run_command')) agent.tools.push('run_command');
      }
      if (needsExec) {
        if (!agent.tools.includes('run_command')) agent.tools.push('run_command');
        if (!agent.tools.includes('create_file')) agent.tools.push('create_file');
      }
      return agent;
    });
    return plan;
  }

  private async executeAgentWithRetry(
    agent: AgentPlan,
    results: Map<string, AgentResult>,
    originalTask: string,
    images: WireImage[],
    workspacePath: string,
    conversationHistory: ConvHistoryItem[],
  ): Promise<void> {
    const MAX_ATTEMPTS = 2;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        await this.executeAgent(agent, results, originalTask, images, workspacePath, conversationHistory);
        return;
      } catch (err) {
        if (attempt < MAX_ATTEMPTS - 1 && !this.cancelled) {
          this.send({ type: 'agent_update', payload: { id: agent.id, status: 'thinking', action: `Retrying after error…`, confidence: 0.3 } });
          await sleep(1200);
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          this.send({ type: 'agent_update', payload: { id: agent.id, status: 'complete', action: `Failed: ${msg.slice(0, 80)}`, confidence: 0 } });
          results.set(agent.id, { agentId: agent.id, success: false, summary: `Failed after ${MAX_ATTEMPTS} attempts: ${msg}`, confidence: 0, actions: [] });
        }
      }
    }
  }

  private async executeAgent(
    agent: AgentPlan,
    results: Map<string, AgentResult>,
    originalTask: string,
    images: WireImage[] = [],
    workspacePath = '',
    conversationHistory: ConvHistoryItem[] = [],
  ): Promise<void> {
    const desktopPath = `${homedir()}/Desktop`;

    const contextParts: string[] = [];
    for (const depId of (agent.depends_on ?? [])) {
      const depResult = results.get(depId);
      if (depResult) contextParts.push(`Result from ${depId}: ${depResult.summary}`);
    }
    const context = contextParts.length > 0 ? `\nPrevious agent results:\n${contextParts.join('\n')}` : '';

    const historyContext = conversationHistory.length > 0
      ? `\n\nConversation history (prior corrections and context from the user):\n${conversationHistory.map(m => `${m.role === 'user' ? 'User' : 'Nexus'}: ${m.content}`).join('\n')}`
      : '';

    const systemPrompt = buildAgentSystem(agent, desktopPath, workspacePath) + context + historyContext;

    this.send({ type: 'agent_update', payload: { id: agent.id, status: 'thinking', action: 'Orienting to task context…', confidence: 0.5 } });

    const firstMessageContent: Anthropic.ContentBlockParam[] = [
      ...images.map(wireImageToBlock),
      { type: 'text' as const, text: `Original user task: "${originalTask}"\n\nYour specific assignment: ${agent.task}` },
    ];

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: firstMessageContent }];

    const toolsToUse = ALL_TOOLS.filter(
      t => agent.tools.includes(t.name) || t.name === 'report_result' || t.name === 'get_system_paths'
    );

    let agentResult: AgentResult | null = null;
    let iterations = 0;

    while (iterations < this.maxIterations && !this.cancelled) {
      iterations++;

      this.send({ type: 'agent_update', payload: { id: agent.id, status: 'executing', action: 'Reasoning about next step…', confidence: 0.6 + iterations * 0.02 } });

      const response = await this.anthropic.messages.create({
        model: this.agentModel,
        max_tokens: 16000,
        system: systemPrompt,
        tools: toolsToUse as Anthropic.Tool[],
        messages,
      });

      if (response.usage) {
        this.tokenUsage.input += response.usage.input_tokens;
        this.tokenUsage.output += response.usage.output_tokens;
      }

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        const text = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('');
        agentResult = { agentId: agent.id, success: true, summary: text || 'Task completed.', confidence: 0.8, actions: [] };
        break;
      }

      // If output was cut off mid-generation, nudge Claude to continue rather than silently stopping
      if (response.stop_reason === 'max_tokens') {
        messages.push({ role: 'user', content: 'Your response was cut off. Please continue from where you left off and complete the task, making sure to call the required tools.' });
        continue;
      }

      if (response.stop_reason !== 'tool_use') break;

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        if (this.cancelled) break;

        if (block.name === 'report_result') {
          const inp = block.input as { success: boolean; summary: string; confidence: number; actions: string[] };
          agentResult = { agentId: agent.id, success: inp.success, summary: inp.summary, confidence: inp.confidence, actions: inp.actions };
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Result reported. Task complete.' });
          break;
        }

        const input = block.input as Record<string, string>;
        this.send({
          type: 'agent_update',
          payload: { id: agent.id, status: 'executing', action: `${humanizeToolName(block.name)}: ${getShortParam(block.name, input)}`, confidence: 0.75 },
        });

        let result: string;
        if (WEB_TOOL_NAMES.has(block.name)) {
          const webResult: WebToolResult = await executeWebTool(block.name, block.input as Record<string, unknown>, this.searchApiKey);
          result = webResult.text;
          if (block.name === 'fetch_url' && !result.startsWith('ERROR') && !result.startsWith('DENIED')) {
            const pageUrl = ((block.input as Record<string, unknown>).url as string ?? '').trim();
            if (pageUrl) this.fetchedUrls.add(pageUrl);
            // Pair each extracted image with the page it came from (preserving alt + isOg)
            for (const img of webResult.pageImages ?? []) {
              this.discoveredImages.push({ imageUrl: img.url, pageUrl, alt: img.alt, isOg: img.isOg });
            }
          }
        } else if (SHELL_TOOL_NAMES.has(block.name)) {
          result = await executeShellTool(block.name, block.input as Record<string, unknown>, (req) => this.waitForApproval(agent, req));
        } else if (LAUNCH_TOOL_NAMES.has(block.name)) {
          result = await executeLaunchTool(block.name, block.input as Record<string, unknown>, (req) => this.waitForApproval(agent, req));
        } else {
          result = await executeFilesystemTool(block.name, block.input as Record<string, unknown>, this.sandboxPaths, (req) => this.waitForApproval(agent, req), workspacePath);
        }

        this.send({
          type: 'action_executed',
          payload: {
            agentId: agent.id, agentName: agent.name, agentColor: agent.color, tool: block.name,
            description: `${humanizeToolName(block.name)}: ${getShortParam(block.name, input)}`,
            path: input.path || input.destination || input.source,
            success: !result.startsWith('ERROR') && !result.startsWith('DENIED') && !result.startsWith('TIMEOUT'),
            result,
          },
        });

        const succeeded = !result.startsWith('ERROR') && !result.startsWith('DENIED') && !result.startsWith('TIMEOUT');
        if (succeeded) {
          this.totalActions++;
          // Track files created by create_file
          if (block.name === 'create_file') {
            const filePath = (input.path ?? '').trim();
            if (filePath) this.createdFiles.push({ path: filePath, name: basename(filePath) });
          }
          // Track files written by run_command (savefig, redirects, to_csv/json/excel, etc.)
          if (block.name === 'run_command') {
            const cmd = (input.command ?? '') as string;
            const workDir = ((input.working_directory as string) ?? '').trim();
            for (const filePath of extractCommandOutputFiles(cmd, workDir, workspacePath)) {
              if (!this.createdFiles.some(f => f.path === filePath)) {
                this.createdFiles.push({ path: filePath, name: basename(filePath) });
              }
            }
          }
        }

        const MAX_RESULT_CHARS = 6000;
        const safeResult = result.length > MAX_RESULT_CHARS ? result.slice(0, MAX_RESULT_CHARS) + '\n…[truncated]' : result;
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: safeResult });
      }

      messages.push({ role: 'user', content: toolResults });
      if (agentResult) break;
    }

    if (agentResult) {
      results.set(agent.id, agentResult);
      this.send({
        type: 'agent_update',
        payload: { id: agent.id, status: 'complete', action: agentResult.success ? agentResult.summary : `Failed: ${agentResult.summary}`, confidence: agentResult.confidence },
      });
    }
  }

  private async assessAgentResult(agent: AgentPlan, result: AgentResult): Promise<{ passed: boolean; issue: string }> {
    try {
      const prompt = `Task assigned: "${agent.task}"\n\nAgent result:\n- Success: ${result.success}\n- Confidence: ${Math.round(result.confidence * 100)}%\n- Summary (first 600 chars): ${result.summary.slice(0, 600)}\n\nDid the agent successfully complete its assigned task? Reply JSON only:\n{"passed": true, "issue": ""}`;
      const response = await this.anthropic.messages.create({
        model: this.orchestratorModel, max_tokens: 128,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.usage) { this.tokenUsage.input += response.usage.input_tokens; this.tokenUsage.output += response.usage.output_tokens; }
      const text = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('');
      const match = text.match(/\{[\s\S]*?\}/);
      if (match) return JSON.parse(match[0]) as { passed: boolean; issue: string };
    } catch { /* non-fatal */ }
    return { passed: result.success, issue: result.success ? '' : 'Agent reported task failure' };
  }

  private async runQAReview(
    agents: AgentPlan[],
    results: Map<string, AgentResult>,
    task: string,
    images: WireImage[],
    workspacePath: string,
    conversationHistory: ConvHistoryItem[],
  ): Promise<void> {
    const QA_ID = 'qa_reviewer';
    const QA_COLOR = '#a78bfa';

    this.send({ type: 'agent_spawned', payload: {
      id: QA_ID, name: 'QA Reviewer', specialty: 'Quality Assurance',
      color: QA_COLOR, task: 'Verify all agents completed their tasks and trigger reruns for failures',
    }});
    await sleep(150);
    this.send({ type: 'agent_update', payload: { id: QA_ID, status: 'thinking', action: 'Reviewing agent results…', confidence: 0.9 } });

    let failedCount = 0;
    let resolvedCount = 0;

    for (const agent of agents) {
      if (this.cancelled) break;
      const result = results.get(agent.id);
      if (!result) continue;

      this.send({ type: 'agent_update', payload: {
        id: QA_ID, status: 'thinking', action: `Reviewing ${agent.name}…`, confidence: 0.88,
      }});
      await sleep(180);

      // Skip obviously healthy results
      if (result.success && result.confidence >= 0.4 && result.summary.trim().length >= 40) continue;

      // Ask Claude haiku to assess borderline/failed results
      const assessment = await this.assessAgentResult(agent, result);
      if (assessment.passed) continue;

      failedCount++;
      const payload: QAEventPayload = {
        agentId: agent.id, agentName: agent.name, agentColor: agent.color,
        status: 'failed_rerunning', issue: assessment.issue, attempt: 1,
      };
      this.send({ type: 'qa_event', payload });
      this.send({ type: 'agent_update', payload: {
        id: QA_ID, status: 'executing',
        action: `Re-running ${agent.name} — ${assessment.issue.slice(0, 55)}`, confidence: 0.75,
      }});

      // Rerun the agent with QA context injected into the task
      const augmented: AgentPlan = {
        ...agent,
        task: `${agent.task}\n\n⚠ QA NOTE: Your previous attempt was flagged. Issue: ${assessment.issue}. Address this specifically and call report_result with success=true when complete.`,
      };
      await this.executeAgentWithRetry(augmented, results, task, images, workspacePath, conversationHistory);

      const newResult = results.get(agent.id);
      const resolved = !!(newResult && newResult.success && newResult.confidence >= 0.4);
      if (resolved) resolvedCount++;

      this.send({ type: 'qa_event', payload: {
        agentId: agent.id, agentName: agent.name, agentColor: agent.color,
        status: resolved ? 'resolved' : 'unresolved', issue: assessment.issue, attempt: 2,
      }});
    }

    const summary = failedCount === 0
      ? `All ${agents.length} agent${agents.length !== 1 ? 's' : ''} verified`
      : resolvedCount === failedCount
        ? `${failedCount} issue${failedCount > 1 ? 's' : ''} detected and resolved`
        : `${resolvedCount}/${failedCount} issues resolved`;

    this.send({ type: 'agent_update', payload: {
      id: QA_ID, status: 'complete', action: summary,
      confidence: failedCount === 0 ? 1.0 : resolvedCount === failedCount ? 0.92 : 0.65,
    }});
  }

  private async runPeerEvaluations(agents: AgentPlan[], results: Map<string, AgentResult>): Promise<void> {
    await Promise.all(agents.map(async (evaluator, i) => {
      if (this.cancelled) return;
      const evaluatee = agents[(i + 1) % agents.length];
      const evaluateeResult = results.get(evaluatee.id);
      if (!evaluateeResult) return;

      const prompt = `You previously completed: "${evaluator.task}"\n\nNow evaluate this other agent's work:\nAgent: ${evaluatee.name} (${evaluatee.specialty})\nTheir task: ${evaluatee.task}\nTheir result: ${evaluateeResult.summary}\n\nRespond with JSON only: {"score": 0.87, "feedback": "brief professional feedback in one sentence"}`;

      try {
        const response = await this.anthropic.messages.create({ model: this.orchestratorModel, max_tokens: 256, messages: [{ role: 'user', content: prompt }] });
        if (response.usage) { this.tokenUsage.input += response.usage.input_tokens; this.tokenUsage.output += response.usage.output_tokens; }
        const text = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('');
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const ev = JSON.parse(jsonMatch[0]) as { score: number; feedback: string };
          this.send({ type: 'peer_evaluation', payload: { evaluatorId: evaluator.id, evaluateeId: evaluatee.id, evaluateeName: evaluatee.name, score: ev.score, feedback: ev.feedback } });
        }
      } catch { /* non-fatal */ }
    }));
  }

  private async generateInsights(plan: OrchestrationPlan, results: Map<string, AgentResult>, task: string): Promise<void> {
    if (results.size === 0 || this.cancelled) return;
    const summaries = Array.from(results.entries()).map(([id, r]) => {
      const agent = plan.agents.find(a => a.id === id);
      return `## ${agent?.name ?? id} (${agent?.specialty ?? 'Agent'})\nConfidence: ${Math.round(r.confidence * 100)}%\n${r.summary}\nActions taken: ${r.actions.join(', ')}`;
    }).join('\n\n');

    const avgConfidence = results.size > 0
      ? Array.from(results.values()).reduce((s, r) => s + r.confidence, 0) / results.size
      : 0.85;

    try {
      // Run Claude synthesis AND URL validation/image embedding concurrently
      const [response, resources] = await Promise.all([
        this.anthropic.messages.create({

          model: this.agentModel,
          max_tokens: 8000,
          messages: [{
            role: 'user',
            content: (
              'You are synthesizing a multi-agent analysis into a professional report.\n\n' +
              `Original task: "${task}"\n\n` +
              `Agent results:\n${summaries}\n\n` +
              'Generate a comprehensive structured report as JSON with this exact schema:\n' +
              '{\n' +
              '  "executiveSummary": "2-3 sentence synthesis of the most important findings — clear, direct prose",\n' +
              '  "findings": [\n' +
              '    {\n' +
              '      "title": "Concise finding title",\n' +
              '      "content": "Detailed explanation. If the agent produced code (HTML, Python, JavaScript, CSS, shell scripts, etc.), embed the FULL code here using a markdown fenced code block with the correct language tag (triple backticks then the language name). Never omit or truncate generated code — paste it in full. For non-code findings, 2-4 sentences of prose is fine.",\n' +
              '      "category": "Short category label (e.g. Code, Risk, Opportunity, Technical, Market, Process)",\n' +
              '      "evidence": ["Specific concrete fact or data point", "Another verifiable detail"],\n' +
              '      "severity": "critical|warning|success|info"\n' +
              '    }\n' +
              '  ],\n' +
              '  "actionItems": [\n' +
              '    {\n' +
              '      "label": "Specific, concrete next step the user should take",\n' +
              '      "priority": "high|medium|low",\n' +
              '      "effort": "quick|medium|long"\n' +
              '    }\n' +
              '  ],\n' +
              '  "followUpQuestions": [\n' +
              '    "A question that would deepen understanding of a key finding",\n' +
              '    "A question exploring an adjacent area not fully covered",\n' +
              '    "A question about implementation or next steps",\n' +
              '    "A question about risks or tradeoffs"\n' +
              '  ],\n' +
              '  "limitations": "What the analysis could not determine, verify, or access — be honest and specific"\n' +
              '}\n\n' +
              'Rules:\n' +
              '- 2-4 findings; use severity to rank: critical=blockers/risks, warning=concerns, success=strengths, info=context\n' +
              '- CODE RULE (mandatory): if any agent generated code, scripts, or HTML, create a dedicated finding with category "Code" and embed the full code in the content field as a markdown fenced code block (triple backticks + language tag). Do NOT summarize code into prose — show the actual code in full.\n' +
              '- Each finding needs 2-3 evidence bullets — cite specific facts, numbers, or details from the agent work\n' +
              '- 3-5 action items; be concrete and actionable, not vague\n' +
              '- 3-4 follow-up questions; each must explore a meaningfully different angle\n' +
              '- Limitations: 1-2 sentences, honest about gaps\n' +
              '- Respond with valid JSON only, no markdown fences'
            ),
          }],
        }),
        collectVerifiedResources(summaries, this.fetchedUrls, this.discoveredImages, task),
      ]);

      if (response.usage) { this.tokenUsage.input += response.usage.input_tokens; this.tokenUsage.output += response.usage.output_tokens; }
      const text = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('');
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          executiveSummary?: string;
          findings?: Array<{ title: string; content: string; category: string; evidence?: string[]; severity?: string }>;
          actionItems?: Array<{ label: string; priority: string; effort?: string }>;
          followUpQuestions?: string[];
          limitations?: string;
        };

        const agents = plan.agents.slice(0, 4);

        // Send structured report metadata (now includes verified URLs and embedded images)
        this.send({
          type: 'task_report',
          payload: {
            executiveSummary: parsed.executiveSummary ?? '',
            actionItems: (parsed.actionItems ?? []).slice(0, 5).map(a => ({
              label: a.label,
              priority: (['high', 'medium', 'low'].includes(a.priority) ? a.priority : 'medium') as 'high' | 'medium' | 'low',
              effort: (['quick', 'medium', 'long'].includes(a.effort ?? '') ? a.effort : undefined) as 'quick' | 'medium' | 'long' | undefined,
            })),
            followUpQuestions: (parsed.followUpQuestions ?? []).slice(0, 4),
            limitations: parsed.limitations ?? '',
            verifiedUrls: resources.verifiedUrls,
            embeddedImages: resources.embeddedImages,
            createdFiles: this.createdFiles,
          },
        });

        // Send individual finding insights
        for (const finding of (parsed.findings ?? []).slice(0, 4)) {
          if (this.cancelled) break;
          this.send({
            type: 'insight',
            payload: {
              id: `insight-${Math.random()}`,
              title: finding.title,
              content: finding.content,
              category: finding.category ?? 'Result',
              evidence: finding.evidence ?? [],
              severity: (['critical', 'warning', 'success', 'info'].includes(finding.severity ?? '') ? finding.severity : 'info') as 'critical' | 'warning' | 'success' | 'info',
              contributors: agents.map(a => a.id),
              contributorNames: agents.map(a => a.name),
              contributorColors: agents.map(a => a.color),
              confidence: avgConfidence,
            },
          });
        }
      }
    } catch { /* non-fatal */ }
  }

  private waitForApproval(agent: AgentPlan, req: ApprovalRequest): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.pendingApprovals.set(id, resolve);
      this.send({ type: 'approval_required', payload: { id, agentId: agent.id, agentName: agent.name, agentColor: agent.color, action: req.action, description: req.description, risk: req.risk, params: req.params } });
      setTimeout(() => {
        if (this.pendingApprovals.has(id)) { this.pendingApprovals.delete(id); resolve(false); }
      }, 60_000);
    });
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Detect files written by shell commands ───────────────────────────────────

function extractCommandOutputFiles(command: string, workDir: string, workspacePath: string): string[] {
  const paths: string[] = [];
  const baseDir = workDir || workspacePath;

  const resolvePath = (p: string): string => {
    p = p.trim();
    return isAbsolute(p) ? p : resolve(baseDir, p);
  };

  // Python: plt.savefig('path'), plt.savefig("path")
  for (const m of command.matchAll(/savefig\s*\(\s*['"]([^'"]+)['"]/g)) {
    paths.push(resolvePath(m[1]));
  }
  // Python: df.to_csv('path'), df.to_excel, df.to_json, np.savetxt, cv2.imwrite
  for (const m of command.matchAll(/\.to_(?:csv|excel|json|parquet|pickle|feather)\s*\(\s*['"]([^'"]+)['"]/g)) {
    paths.push(resolvePath(m[1]));
  }
  for (const m of command.matchAll(/(?:np\.savetxt|np\.save|cv2\.imwrite|imageio\.imwrite|Image\.save)\s*\(\s*['"]([^'"]+)['"]/g)) {
    paths.push(resolvePath(m[1]));
  }
  // Shell: > file  or  >> file
  for (const m of command.matchAll(/>{1,2}\s*['"]?([^\s|&'"]+\.(?:txt|csv|json|html|md|png|jpg|svg|pdf))['"]?/g)) {
    paths.push(resolvePath(m[1]));
  }
  // open(path, 'w'), with open(path, 'wb')
  for (const m of command.matchAll(/open\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]w/g)) {
    paths.push(resolvePath(m[1]));
  }

  // Deduplicate and only keep safe-looking file paths
  return [...new Set(paths)].filter(p => {
    const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
    return ['.py','.sh','.js','.ts','.csv','.json','.txt','.md','.png','.jpg','.svg','.pdf','.html','.xlsx'].includes(ext);
  });
}

// ─── URL validation & image embedding ────────────────────────────────────────

const URL_RE_EXTRACT = /https?:\/\/[^\s<>"')\]`,]+/g;

function extractUrlsFromText(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.match(URL_RE_EXTRACT) ?? []) {
    const url = m.replace(/[.,;:!?]+$/, '');
    try { new URL(url); seen.add(url); } catch { /* skip malformed */ }
  }
  return Array.from(seen);
}

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|svg)(\?[^)]*)?$/i.test(url);
}

function isUsefulUrl(url: string): boolean {
  try {
    const p = new URL(url);
    return !['localhost', '127.0.0.1', '0.0.0.0'].includes(p.hostname)
      && !p.hostname.includes('duckduckgo')
      && !p.hostname.includes('search.brave')
      && !p.hostname.includes('anthropic.com')
      && !p.hostname.includes('api.');
  } catch { return false; }
}

function urlTitle(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url.slice(0, 60); }
}

async function validateUrlHead(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      redirect: 'follow',
    });
    clearTimeout(t);
    return resp.ok;
  } catch { return false; }
}

async function fetchAndEmbedImage(url: string): Promise<{ url: string; data: string; mediaType: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      redirect: 'follow',
    });
    clearTimeout(t);
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > 600 * 1024) return null; // skip images >600 KB
    const data = Buffer.from(buf).toString('base64');
    const mediaType = ct.split(';')[0].trim();
    return { url, data, mediaType };
  } catch { return null; }
}

// ── Task-keyword extraction ────────────────────────────────────────────────────
function buildTaskKeywords(task: string): Set<string> {
  const STOP = new Set([
    'what','when','where','which','that','this','with','from','have','will','should',
    'could','would','please','make','show','tell','help','need','want','find','give',
    'list','the','and','for','are','but','not','you','all','can','has','had','was',
    'were','been','being','their','there','these','those','than','then','them','they',
    'your','some','into','more','such','also','just','over','each','very','most','like',
    'any','how','its','our','use','used','using','create','write','analyze','analyse',
    'research','generate','provide','report','about','get','look','check','review',
    'compare','identify','explain','describe','summarize','summarise',
  ]);
  return new Set(
    task.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w))
  );
}

// ── Image relevance scorer ─────────────────────────────────────────────────────
// Returns a score ≥ 0. Anything < 2 is treated as irrelevant and discarded.
function scoreImageRelevance(
  imageUrl: string,
  alt: string | undefined,
  isOg: boolean,
  pageUrl: string,
  taskKeywords: Set<string>,
): number {
  let score = 0;

  // Normalise filename: strip extension and separators so "heart-attack.jpg" → "heart attack"
  let filename = '';
  try {
    filename = new URL(imageUrl).pathname.split('/').pop() ?? '';
    filename = filename.replace(/\.[^.]+$/, '').replace(/[-_.+%]/g, ' ').toLowerCase();
  } catch { /* */ }

  const altLower = (alt ?? '').toLowerCase();
  let pagePath = '';
  try { pagePath = new URL(pageUrl).pathname.toLowerCase(); } catch { /* */ }

  // OG / twitter:image — the page author explicitly chose this as the representative image.
  // It passes even without keyword overlap (but stays subject to the global threshold).
  if (isOg) score += 3;

  // Alt text keyword matches — most reliable signal (human-authored description)
  let altHits = 0;
  for (const kw of taskKeywords) {
    if (altLower.includes(kw)) altHits++;
  }
  score += Math.min(altHits * 2, 6);

  // Filename keyword matches
  for (const kw of taskKeywords) {
    if (filename.includes(kw)) score += 1;
  }

  // Page URL path keyword matches — if the page itself is clearly about the topic
  // then any content image from it is more likely relevant
  let pageHits = 0;
  for (const kw of taskKeywords) {
    if (pagePath.includes(kw)) pageHits++;
  }
  if (pageHits >= 2) score += 2;
  else if (pageHits >= 1) score += 1;

  // Penalise hash-like filenames (e.g. "a3f9c2b1.jpg") — no semantic signal
  const noSpaces = filename.replace(/\s/g, '');
  if (/^[a-f0-9-]{8,}$/.test(noSpaces) || noSpaces.length < 3) score -= 1;

  return score;
}

async function collectVerifiedResources(
  agentSummaries: string,
  fetchedUrls: Set<string>,
  discoveredImages: Array<{ imageUrl: string; pageUrl: string; alt?: string; isOg: boolean }>,
  task: string,
): Promise<{
  verifiedUrls: Array<{ url: string; title: string }>;
  embeddedImages: Array<{ url: string; sourcePageUrl: string; data: string; mediaType: string; caption?: string }>;
}> {
  const taskKeywords = buildTaskKeywords(task);

  // Deduplicate by domain (up to 2 per domain), then score by relevance
  const dedupedImages: typeof discoveredImages = [];
  for (const item of discoveredImages) {
    try {
      const domain = new URL(item.imageUrl).hostname;
      const domainCount = dedupedImages.filter(d => {
        try { return new URL(d.imageUrl).hostname === domain; } catch { return false; }
      }).length;
      if (domainCount < 2 && isUsefulUrl(item.imageUrl)) dedupedImages.push(item);
    } catch { /* skip */ }
  }

  // Score each candidate against the task
  const scored = dedupedImages.map(item => ({
    ...item,
    score: scoreImageRelevance(item.imageUrl, item.alt, item.isOg, item.pageUrl, taskKeywords),
  }));

  // Sort best first
  scored.sort((a, b) => b.score - a.score);

  // Primary filter: strong keyword overlap or OG image (score >= 3)
  let relevant = scored.filter(s => s.score >= 3);

  // Fallback: if nothing clears the bar, accept the top-3 if they have at least
  // some signal (score >= 2). This handles tasks with unusual vocabulary.
  if (relevant.length === 0) {
    relevant = scored.filter(s => s.score >= 2).slice(0, 3);
  }

  // Hard cap: no more than 6 images in the report
  const imageItems = relevant.slice(0, 6);

  // Page URLs from agent text (for verified sources section)
  const pageUrls = extractUrlsFromText(agentSummaries)
    .filter(isUsefulUrl)
    .filter(u => !isImageUrl(u))
    .slice(0, 25);

  // Run image embedding and page-URL validation concurrently
  const [imageResults, pageValidations] = await Promise.all([
    Promise.all(imageItems.map(item => fetchAndEmbedImage(item.imageUrl).then(r => r ? { ...r, sourcePageUrl: item.pageUrl } : null))),
    Promise.all(pageUrls.map(url => fetchedUrls.has(url) ? Promise.resolve(true) : validateUrlHead(url))),
  ]);

  const embeddedImages = imageResults.filter((r): r is NonNullable<typeof r> => r !== null);

  const verifiedUrls = pageUrls
    .filter((_, i) => pageValidations[i])
    .map(url => ({ url, title: urlTitle(url) }));

  for (const url of fetchedUrls) {
    if (!isImageUrl(url) && isUsefulUrl(url) && !verifiedUrls.some(v => v.url === url)) {
      verifiedUrls.push({ url, title: urlTitle(url) });
    }
  }

  return { verifiedUrls: verifiedUrls.slice(0, 20), embeddedImages };
}

function getDependencyLevels(agents: AgentPlan[]): AgentPlan[][] {
  const remaining = [...agents];
  const completed = new Set<string>();
  const levels: AgentPlan[][] = [];
  while (remaining.length > 0) {
    const ready = remaining.filter(a => (a.depends_on ?? []).every(dep => completed.has(dep)));
    if (ready.length === 0) { levels.push([...remaining]); break; }
    levels.push(ready);
    for (const a of ready) { completed.add(a.id); remaining.splice(remaining.indexOf(a), 1); }
  }
  return levels;
}

function humanizeToolName(name: string): string {
  const map: Record<string, string> = {
    create_directory: 'Creating folder', create_file: 'Creating file', read_file: 'Reading file',
    list_directory: 'Listing directory', move_file: 'Moving', copy_file: 'Copying',
    delete_file: 'Deleting', get_system_paths: 'Getting system paths', launch_app: 'Launching app',
    web_search: 'Searching web', fetch_url: 'Fetching URL', run_command: 'Running command',
  };
  return map[name] ?? name;
}

function getShortParam(tool: string, input: Record<string, string>): string {
  if (tool === 'web_search') return (input.query ?? '').slice(0, 50);
  if (tool === 'fetch_url') return (input.url ?? '').slice(0, 50);
  if (tool === 'run_command') return (input.command ?? '').slice(0, 50);
  if (tool === 'launch_app') return [input.app, input.url].filter(Boolean).join(' → ').slice(0, 50);
  const path = input.path || input.destination || input.source || '';
  return path.replace(homedir(), '~').slice(0, 50);
}
