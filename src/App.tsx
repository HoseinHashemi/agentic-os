import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Orchestrator } from './simulation/orchestrator';
import type { OrchestratorState, Agent, OrchestratorPhase } from './types';
import type { AttachedImage } from './hooks/useImageAttach';
import { useBackend } from './hooks/useBackend';
import type { ConvMessage } from './types/conversation';
import ConversationThread from './components/ConversationThread';
import InputLayer from './components/InputLayer';
import AgentCanvas from './components/AgentCanvas';
import Timeline from './components/Timeline';
import ResultsView from './components/ResultsView';
import Onboarding from './components/Onboarding';
import ApprovalModal from './components/ApprovalModal';
import ExecutionLog from './components/ExecutionLog';
import IdleOrb from './components/IdleOrb';
import IntelligencePassport from './components/IntelligencePassport';
import AgentMemoryTimeline from './components/AgentMemoryTimeline';
import { useIntelligence } from './intelligence/useIntelligence';
import { useTaskHistory } from './hooks/useTaskHistory';
import type { TaskRecord } from './hooks/useTaskHistory';
import SettingsModal from './components/SettingsModal';
import TaskHistoryPanel from './components/TaskHistoryPanel';

// ─── Simulation orchestrator (demo mode) ─────────────────────────────────────
const simOrchestrator = new Orchestrator();

function defaultSimState(): OrchestratorState {
  return {
    phase: 'idle', taskDescription: '', agents: [], communications: [],
    timeline: [], insights: [], startTime: 0, completionPct: 0, isActive: false,
  };
}

export default function App() {
  // ── Simulation state ────────────────────────────────────────────────────────
  const [simState, setSimState] = useState<OrchestratorState>(defaultSimState);
  const [activeTab, setActiveTab] = useState<'workspace' | 'intelligence'>('workspace');
  const [sidebarTab, setSidebarTab] = useState<'log' | 'chat'>('log');
  const [isTyping, setIsTyping] = useState(false);
  const [typingSeq, setTypingSeq] = useState(0);

  // ── Conversation history ─────────────────────────────────────────────────────
  const [convHistory, setConvHistory] = useState<ConvMessage[]>([]);
  function addConvMessage(role: 'user' | 'assistant', content: string, isError = false) {
    setConvHistory(prev => [...prev, {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role, content, timestamp: Date.now(), isError,
    }]);
  }

  // ── Intelligence hook ────────────────────────────────────────────────────────
  const intel = useIntelligence();

  // ── Last submitted task (for retry) ─────────────────────────────────────────
  const lastTaskRef    = useRef<string>('');
  const lastImagesRef  = useRef<AttachedImage[]>([]);

  // ── Approval bulk policy: null = ask each time ─────────────────────────────
  const [autoPolicy, setAutoPolicy] = useState<'approve' | 'deny' | null>(null);
  const autoPolicyRef = useRef<'approve' | 'deny' | null>(null);
  autoPolicyRef.current = autoPolicy;

  // ── Backend / live state ────────────────────────────────────────────────────
  const { backendState, sendTask, sendApproval, saveApiKey, sendSettings, reset: resetBackend, stop: stopBackend } = useBackend();
  const { connected, config, orchestratorState: liveState, taskGroups, completedGroups, taskRelationships, pendingApproval, executionLog, error, lastCompletionSummary, sessionTokenUsage } = backendState;

  // ── Active result tab (which completed group is shown) ───────────────────────
  const [activeResultGroupId, setActiveResultGroupId] = useState<string | null>(null);

  const { history: taskHistory, addRecord: addTaskRecord, clearHistory: clearTaskHistory } = useTaskHistory();
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [inputPrefill, setInputPrefill] = useState('');
  const [viewingHistoryRecord, setViewingHistoryRecord] = useState<TaskRecord | null>(null);

  // ── Mode: 'simulation' | 'live' | 'onboarding' ─────────────────────────────
  const [mode, setMode] = useState<'simulation' | 'live' | 'onboarding'>('simulation');
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Determine effective mode
  const isLive = mode === 'live' && connected && !!config?.hasApiKey;
  const activeState = isLive ? liveState : simState;

  // When backend connects and has API key, offer live mode
  useEffect(() => {
    if (connected && config?.hasApiKey && mode === 'simulation') {
      setMode('live');
    }
  }, [connected, config]);

  // Show onboarding when backend is connected but no API key
  useEffect(() => {
    if (connected && config && !config.hasApiKey && mode !== 'live') {
      setShowOnboarding(true);
    }
  }, [connected, config]);

  // Sync sim orchestrator
  useEffect(() => {
    simOrchestrator.onUpdate(setSimState);
  }, []);

  // ── Auto-resolve incoming approvals when bulk policy is set ─────────────────
  useEffect(() => {
    if (!pendingApproval || autoPolicy === null) return;
    // Immediately resolve without showing the modal
    sendApproval(pendingApproval.id, autoPolicy === 'approve');
  }, [pendingApproval, autoPolicy, sendApproval]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback((task: string, images: AttachedImage[] = []) => {
    setAutoPolicy(null);
    setSidebarTab('log');
    lastTaskRef.current   = task;
    lastImagesRef.current = images;
    if (isLive) {
      // If we're on the results screen (previous task done, nothing active),
      // reset first so the idle orb and agent animations play normally.
      if (completedGroups.size > 0 && !activeState.isActive) {
        resetBackend();
        setActiveResultGroupId(null);
      }
      sendTask(task, images, convHistory.map(m => ({ role: m.role, content: m.content })));
    } else {
      simOrchestrator.run(task);
    }
    addConvMessage('user', task);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, sendTask, convHistory, completedGroups.size, activeState.isActive, resetBackend]);

  const handleRetry = useCallback(() => {
    const task   = lastTaskRef.current;
    const images = lastImagesRef.current;
    if (!task && images.length === 0) return;
    setAutoPolicy(null);
    setSidebarTab('log');
    if (isLive) {
      resetBackend();
      setTimeout(() => { sendTask(task, images, convHistory.map(m => ({ role: m.role, content: m.content }))); }, 150);
    } else {
      simOrchestrator.reset();
      setSimState(defaultSimState());
      setTimeout(() => { simOrchestrator.run(task); }, 80);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, resetBackend, sendTask, convHistory]);

  const handleReset = useCallback(() => {
    setAutoPolicy(null);
    setConvHistory([]);
    setActiveResultGroupId(null);
    if (isLive) {
      resetBackend();
    } else {
      simOrchestrator.reset();
      setSimState(defaultSimState());
    }
  }, [isLive, resetBackend]);

  const handleStop = useCallback(() => {
    if (isLive) {
      stopBackend();
    } else {
      simOrchestrator.reset();
      setSimState(defaultSimState());
    }
    addConvMessage('assistant', 'Task stopped. Agents have been halted. You can start a new task or ask a follow-up.');
  }, [isLive, stopBackend, simOrchestrator]);

  const handleFollowUp = useCallback((question: string) => {
    handleReset();
    setTimeout(() => setInputPrefill(question), 50);
  }, [handleReset]);

  const handleApproveAll = useCallback(() => {
    if (!pendingApproval) return;
    setAutoPolicy('approve');
    sendApproval(pendingApproval.id, true); // approve the current one immediately
  }, [pendingApproval, sendApproval]);

  const handleDenyAll = useCallback(() => {
    if (!pendingApproval) return;
    setAutoPolicy('deny');
    sendApproval(pendingApproval.id, false); // deny the current one immediately
  }, [pendingApproval, sendApproval]);

  const handleSaveApiKey = useCallback((key: string) => {
    saveApiKey(key);
    setShowOnboarding(false);
    setMode('live');
  }, [saveApiKey]);

  const handleExportCopy = useCallback(() => {
    const state = (activeResultGroupId ? completedGroups.get(activeResultGroupId) : null) ?? activeState;
    const report = state.taskReport;
    const lines = [
      `# Nexus Task Report`,
      `**Task:** ${state.taskDescription}`,
      `**Date:** ${new Date().toLocaleString()}`,
      `**Agents:** ${state.agents.map(a => `${a.name} (${a.specialty})`).join(', ')}`,
      '',
      ...(report?.executiveSummary ? [`## Summary\n${report.executiveSummary}`, ''] : []),
      '## Findings',
      ...state.insights.map(ins => [
        `### ${ins.title}`,
        `_Category: ${ins.category} · Confidence: ${Math.round(ins.confidence * 100)}%_`,
        ins.content,
        ...(ins.evidence?.length ? ['', '**Evidence:**', ...ins.evidence.map(e => `- ${e}`)] : []),
      ].join('\n')),
      '',
      ...(report?.actionItems?.length ? [
        '## Action Items',
        ...report.actionItems.map(a => `- [${a.priority.toUpperCase()}] ${a.label}${a.effort ? ` _(${a.effort})_` : ''}`),
        '',
      ] : []),
      ...(report?.followUpQuestions?.length ? [
        '## Follow-up Questions',
        ...report.followUpQuestions.map(q => `- ${q}`),
        '',
      ] : []),
      ...(report?.limitations ? [`## Limitations\n${report.limitations}`, ''] : []),
      '## Timeline',
      ...state.timeline.map(e => `- ${e.description}`),
    ].join('\n');
    navigator.clipboard.writeText(lines).catch(() => {});
  }, [activeState]);

  const toggleMode = useCallback(() => {
    if (mode === 'live') {
      setMode('simulation');
    } else if (connected && config?.hasApiKey) {
      setMode('live');
    } else if (connected && !config?.hasApiKey) {
      setShowOnboarding(true);
    } else {
      // Backend not running
    }
  }, [mode, connected, config]);

  const { phase, agents, communications, timeline, insights, isActive, completionPct } = activeState;

  // ── Multi-task constellation derived values ──────────────────────────────────
  const allLiveAgents = isLive
    ? Array.from(taskGroups.entries()).flatMap(([gid, gs]) =>
        gs.agents.map(a => ({ ...a, groupId: gid }))
      )
    : [];

  const agentGroupMeta = isLive
    ? Array.from(taskGroups.entries()).map(([gid, gs]) => ({
        groupId: gid,
        isActive: gs.isActive,
        phase: gs.phase,
      }))
    : [];

  const hasParallelTasks = isLive && taskGroups.size > 0;
  const parallelTaskCount = taskGroups.size;

  // ── Intelligence: track phase transitions to detect task completion ──────────
  const prevPhaseRef = useRef<OrchestratorPhase>('idle');
  useEffect(() => {
    if (prevPhaseRef.current !== 'complete' && phase === 'complete') {
      // Only update the Intelligence Passport for real live tasks — simulation
      // scenarios use scripted agents that would otherwise pollute the passport
      // with far more agents than the demo modes display.
      if (isLive) {
        const taskDuration = activeState.startTime ? Date.now() - activeState.startTime : 0;
        intel.updateFromTask(activeState.taskDescription, activeState.agents, activeState.insights, taskDuration);
      }
      if (isLive && lastCompletionSummary) {
        addConvMessage('assistant', lastCompletionSummary);
        setSidebarTab('chat');
      } else if (isLive) {
        addConvMessage('assistant', 'Task completed successfully.');
        setSidebarTab('chat');
      }
      // Record in history (with full snapshot for later viewing)
      const record: TaskRecord = {
        id: `task-${Date.now()}`,
        timestamp: activeState.startTime || Date.now(),
        task: activeState.taskDescription,
        mode: isLive ? 'live' : 'simulation',
        agents: activeState.agents.map(a => ({ name: a.name, specialty: a.specialty, color: a.color })),
        insights: activeState.insights.map(ins => ({ title: ins.title, content: ins.content })),
        tokenUsage: isLive ? { input: sessionTokenUsage.input, output: sessionTokenUsage.output } : { input: 0, output: 0 },
        duration: activeState.startTime ? Date.now() - activeState.startTime : 0,
        actionsCount: activeState.agents.filter(a => a.status === 'complete').length,
        success: true,
        snapshot: {
          insights: activeState.insights,
          taskReport: activeState.taskReport,
          agents: activeState.agents,
        },
      };
      addTaskRecord(record);
    }
    prevPhaseRef.current = phase;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Auto-select the latest completed group ────────────────────────────────────
  const prevCompletedSizeRef = useRef(0);
  useEffect(() => {
    if (completedGroups.size > prevCompletedSizeRef.current) {
      // A new group just completed — switch to it
      const keys = Array.from(completedGroups.keys());
      setActiveResultGroupId(keys[keys.length - 1]);
    }
    prevCompletedSizeRef.current = completedGroups.size;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedGroups.size]);

  // ── Add error messages to conversation history ────────────────────────────────
  const prevErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== prevErrorRef.current && isLive) {
      addConvMessage('assistant', `Error: ${error}`, true);
    }
    prevErrorRef.current = error;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <div className="app">
      {/* Onboarding overlay */}
      <AnimatePresence>
        {showOnboarding && config && (
          <Onboarding
            onSave={handleSaveApiKey}
            sandboxPaths={config.sandboxPaths}
          />
        )}
      </AnimatePresence>

      {/* Approval modal — hidden when a bulk policy is already active */}
      <ApprovalModal
        approval={autoPolicy === null ? pendingApproval : null}
        onApprove={(id) => sendApproval(id, true)}
        onDeny={(id) => sendApproval(id, false)}
        onApproveAll={handleApproveAll}
        onDenyAll={handleDenyAll}
      />

      <div className="app-top-bar">
        {/* Brand */}
        <div className="top-bar-brand">
          <span className="brand-dot" />
          <span className="brand-name">Nexus</span>
        </div>

        {/* Tabs */}
        <div className="top-bar-tabs">
          <button className={`app-tab ${activeTab==='workspace'?'active':''}`} onClick={()=>setActiveTab('workspace')}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{marginRight:5}}>
              <rect x="1" y="1" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.1"/>
              <rect x="6.5" y="1" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.1"/>
              <rect x="1" y="6.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.1"/>
              <rect x="6.5" y="6.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.1"/>
            </svg>
            Workspace
          </button>
          <button className={`app-tab ${activeTab==='intelligence'?'active':''}`} onClick={()=>setActiveTab('intelligence')}>
            <span style={{marginRight:5}}>&#9672;</span>
            Intelligence
            {intel.hasData && <span className="app-tab-dot" />}
          </button>
        </div>

        {/* Right controls */}
        <div className="top-bar-actions">
          {isLive && (sessionTokenUsage.input + sessionTokenUsage.output) > 0 && (
            <span className="token-usage-badge" title={`${sessionTokenUsage.input.toLocaleString()} input + ${sessionTokenUsage.output.toLocaleString()} output tokens`}>
              &#9672; {((sessionTokenUsage.input + sessionTokenUsage.output) / 1000).toFixed(1)}k tokens
            </span>
          )}
          <button className="app-icon-btn" onClick={() => setShowHistory(h => !h)} title="Task history">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M6.5 3.5v3l2 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
          </button>
          {connected && (
            <button className="app-icon-btn" onClick={() => setShowSettings(true)} title="Settings">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.1"/>
                <path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12M2.6 2.6l1 1M9.4 9.4l1 1M9.4 3.6l-1 1M3.6 9.4l-1 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <InputLayer
        onSubmit={handleSubmit}
        onReset={handleReset}
        onRetry={handleRetry}
        onStop={handleStop}
        phase={phase}
        isActive={isActive}
        completionPct={completionPct}
        mode={mode === 'onboarding' ? 'simulation' : mode}
        isConnected={connected}
        hasApiKey={!!config?.hasApiKey}
        onToggleMode={toggleMode}
        onSetupApiKey={() => setShowOnboarding(true)}
        hasConversation={convHistory.length > 0}
        onTypingChange={setIsTyping}
        onKeystroke={() => setTypingSeq(s => s + 1)}
        prefill={inputPrefill}
        onPrefillConsumed={() => setInputPrefill('')}
        hasParallelTasks={hasParallelTasks}
        parallelTaskCount={parallelTaskCount}
      />

      {activeTab === 'intelligence' ? (
        <div className="intelligence-tab-panel">
          <IntelligencePassport
            passport={intel.passport}
            highlightedAgentId={intel.highlightedAgentId}
            onLearningHover={(ids) => intel.setHighlightedAgent(ids[0] ?? null)}
            onLearningLeave={() => intel.setHighlightedAgent(null)}
            demoMode={intel.demoMode}
            onDemoModeChange={intel.setDemoMode}
          />
          <AgentMemoryTimeline
            network={intel.network}
            highlightedAgentId={intel.highlightedAgentId}
            onAgentHover={(id, insightIds) => { intel.setHighlightedAgent(id); intel.setHighlightedInsight(insightIds[0]??null); }}
            onAgentLeave={() => { intel.setHighlightedAgent(null); intel.setHighlightedInsight(null); }}
          />
        </div>
      ) : (
        <div className="main-area">
          <div className="canvas-area" style={{ flex: 1, minWidth: 0 }}>
            {(() => {
              // ── Compute results state once, shared by canvas dimming + overlay ──
              // Default to the latest completed group when no tab is explicitly selected.
              // This eliminates the one-render-cycle delay (useEffect) that previously
              // left the canvas dim with no results overlay showing on top.
              const _cgKeys = completedGroups.size > 0 ? Array.from(completedGroups.keys()) : [];
              const effectiveGroupId = activeResultGroupId
                ?? (_cgKeys.length > 0 ? _cgKeys[_cgKeys.length - 1] : null);
              const resultState = effectiveGroupId ? completedGroups.get(effectiveGroupId) : null;
              const showResults = isLive
                ? (completedGroups.size > 0 && !!resultState && resultState.insights.length > 0)
                : (phase === 'complete' && insights.length > 0);

              // Canvas is only dim when results are actually visible on top of it.
              // Previously used `completedGroups.size > 0` which caused a flash of
              // dim-canvas-with-no-overlay between task completion and the useEffect firing.
              const canvasOpacity = showResults ? 0.12 : 1;
              const resultInsights = isLive ? (resultState?.insights ?? []) : insights;
              const resultReport = isLive ? resultState?.taskReport : activeState.taskReport;
              const resultAgents = isLive ? (resultState?.agents ?? []) : agents;
              const resultTask = isLive ? (resultState?.taskDescription ?? '') : activeState.taskDescription;

              return (
                <>
                  {/* Agent canvas — dims only when results overlay is actually visible */}
                  <div style={{ position: 'absolute', inset: 0, opacity: canvasOpacity, transition: 'opacity 0.8s ease', pointerEvents: showResults ? 'none' : undefined }}>
                    <AgentCanvas
                      agents={allLiveAgents.length > 0 ? allLiveAgents : agents}
                      communications={communications}
                      phase={phase}
                      isActive={isActive}
                      agentGroups={agentGroupMeta}
                      relationships={taskRelationships}
                    />
                  </div>

                  {/* Results overlay */}
                  <AnimatePresence>
                    {showResults && (
                      <motion.div
                        className="results-wrapper"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      >
                        {/* Tab bar — only shown when multiple results exist */}
                        {isLive && completedGroups.size > 1 && (
                          <div className="result-tabs-bar">
                            {Array.from(completedGroups.entries()).map(([gid, gs]) => {
                              const words = (gs.taskDescription || 'Task').trim().split(/\s+/);
                              const title = words.slice(0, 5).join(' ') + (words.length > 5 ? '…' : '');
                              return (
                                <button
                                  key={gid}
                                  className={`result-tab${gid === effectiveGroupId ? ' active' : ''}`}
                                  onClick={() => setActiveResultGroupId(gid)}
                                >
                                  <span className="result-tab-dots">
                                    {gs.agents.slice(0, 3).map(a => (
                                      <span key={a.id} className="result-tab-dot" style={{ background: a.color }} />
                                    ))}
                                  </span>
                                  <span className="result-tab-title">{title}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className={`results-content-area${isLive && completedGroups.size > 1 ? ' has-tabs' : ''}`}>
                          <ResultsView
                            key={effectiveGroupId ?? 'sim'}
                            insights={resultInsights}
                            taskReport={resultReport}
                            agents={resultAgents}
                            taskDescription={resultTask}
                            onExport={handleExportCopy}
                            onReset={handleReset}
                            onFollowUp={handleFollowUp}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              );
            })()}

            {/* Idle / analyzing overlay — visible until first agent spawns */}
            <AnimatePresence>
              {agents.length === 0 && (
                <motion.div
                  className="idle-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {/* Sphere fills entire overlay; text sits at bottom */}
                  <IdleOrb isTyping={isTyping} typingSeq={typingSeq} />
                  <motion.div
                    className="idle-content"
                    animate={{ opacity: phase === 'idle' ? 1 : 0 }}
                    transition={{ duration: 0.6 }}
                  >
                    <h2 className="idle-headline">Intelligence on standby</h2>
                    <p className="idle-sub">
                      Describe your task above and watch a team of specialist agents<br />
                      synthesize, collaborate, and deliver — in real time.
                    </p>
                    <div className="idle-capabilities">
                      {isLive ? (
                        <>
                          <span className="live-indicator-inline">⬤ Live</span>
                          <span>Real Claude API · Real file operations · Real results</span>
                        </>
                      ) : (
                        <>
                          <span>Medical Analysis</span><span>·</span>
                          <span>Security Auditing</span><span>·</span>
                          <span>Research Synthesis</span><span>·</span>
                          <span>Any Complex Task</span>
                        </>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status bar during execution */}
            <AnimatePresence>
              {isActive && (
                <motion.div
                  className="phase-overlay"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <AgentStatusBar agents={agents} isLive={isLive} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bulk policy banner */}
            <AnimatePresence>
              {autoPolicy !== null && isActive && (
                <motion.div
                  className={`bulk-policy-banner policy-${autoPolicy}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  {autoPolicy === 'approve'
                    ? '✓ Auto-approving all remaining actions'
                    : '✕ Auto-denying all remaining actions'}
                  <button
                    className="bulk-policy-cancel"
                    onClick={() => setAutoPolicy(null)}
                    title="Stop and ask for each action again"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error display */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="error-toast"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <span style={{ color: '#f43f5e' }}>&#10007;</span> {error}
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          {/* Right sidebar: log + chat tabs */}
          <AnimatePresence>
            {(isActive || timeline.length > 0 || convHistory.length > 0) && (
              <motion.div
                className="right-sidebar"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="sidebar-tabs">
                  <button
                    className={`sidebar-tab ${sidebarTab === 'log' ? 'active' : ''}`}
                    onClick={() => setSidebarTab('log')}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{marginRight:5}}>
                      <rect x="1" y="1" width="8" height="1.5" rx="0.75" fill="currentColor"/>
                      <rect x="1" y="4.25" width="5.5" height="1.5" rx="0.75" fill="currentColor"/>
                      <rect x="1" y="7.5" width="7" height="1.5" rx="0.75" fill="currentColor"/>
                    </svg>
                    Log
                  </button>
                  <button
                    className={`sidebar-tab ${sidebarTab === 'chat' ? 'active' : ''}`}
                    onClick={() => setSidebarTab('chat')}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{marginRight:5}}>
                      <path d="M1 1.5C1 1.22 1.22 1 1.5 1h7C8.78 1 9 1.22 9 1.5v5C9 6.78 8.78 7 8.5 7H3L1 9V1.5Z" stroke="currentColor" strokeWidth="1" fill="none"/>
                    </svg>
                    Chat
                    {convHistory.length > 0 && sidebarTab !== 'chat' && (
                      <span className="sidebar-tab-badge">{convHistory.length}</span>
                    )}
                  </button>
                </div>
                <div className="sidebar-content">
                  {sidebarTab === 'log' ? (
                    <Timeline events={timeline} startTime={activeState.startTime} />
                  ) : (
                    <ConversationThread
                      messages={convHistory}
                      isActive={isActive}
                      onClear={() => setConvHistory([])}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Execution log (live mode only) */}
      <ExecutionLog log={executionLog} isLiveMode={isLive} />

      {/* History result viewer overlay */}
      <AnimatePresence>
        {viewingHistoryRecord?.snapshot && (
          <motion.div
            className="history-viewer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="history-viewer-bar">
              <button className="history-viewer-back" onClick={() => setViewingHistoryRecord(null)}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
              </button>
              <span className="history-viewer-label">History</span>
              <span className="history-viewer-task">{viewingHistoryRecord.task.slice(0, 80)}{viewingHistoryRecord.task.length > 80 ? '…' : ''}</span>
            </div>
            <div className="history-viewer-content">
              <ResultsView
                key={viewingHistoryRecord.id}
                insights={viewingHistoryRecord.snapshot.insights}
                taskReport={viewingHistoryRecord.snapshot.taskReport}
                agents={viewingHistoryRecord.snapshot.agents}
                taskDescription={viewingHistoryRecord.task}
                onExport={handleExportCopy}
                onReset={() => setViewingHistoryRecord(null)}
                onFollowUp={(q) => { setViewingHistoryRecord(null); setTimeout(() => setInputPrefill(q), 50); }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History drawer */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            className="history-drawer"
            initial={{ opacity: 0, x: -320 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -320 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="history-drawer-header">
              <span className="history-drawer-title">Task History</span>
              <button className="settings-close" onClick={() => setShowHistory(false)}>&#10005;</button>
            </div>
            <TaskHistoryPanel
              history={taskHistory}
              onClear={clearTaskHistory}
              onRerun={(task) => { setShowHistory(false); handleSubmit(task); }}
              onView={(record) => { setShowHistory(false); setViewingHistoryRecord(record); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings modal */}
      {config && (
        <SettingsModal
          open={showSettings}
          config={config}
          onSave={sendSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Intelligence onboarding overlay */}
      <AnimatePresence>
        {intel.showOnboarding && (
          <motion.div className="intel-onboarding-overlay"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={intel.dismissOnboarding}>
            <motion.div className="intel-onboarding-card"
              initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} exit={{ scale:0.9, opacity:0 }}
              transition={{ duration:0.5, ease:[0.16,1,0.3,1] }}
              onClick={e=>e.stopPropagation()}>
              <div className="iob-glow"/>
              <div className="iob-icon">◈</div>
              <h2 className="iob-title">Your Intelligence Profile Has Begun</h2>
              <p className="iob-text">The system has learned something about you. It will grow smarter — and more personal — with every task you complete.</p>
              <button className="iob-btn" onClick={intel.dismissOnboarding}>Begin →</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Agent status bar ───────────────────────────────────────────────────────────
function AgentStatusBar({ agents, isLive }: { agents: Agent[]; isLive: boolean }) {
  const active = agents.filter(a => a.status !== 'complete' && a.status !== 'dissolved');
  const done = agents.filter(a => a.status === 'complete');

  return (
    <div className="agent-status-bar">
      <div className="asb-left">
        {isLive && <span className="live-dot" title="Live mode" />}
        <span className="asb-count">{agents.length}</span>
        <span className="asb-label">agents</span>
        {active.length > 0 && (
          <><span className="asb-sep">·</span><span className="asb-active">{active.length} active</span></>
        )}
        {done.length > 0 && (
          <><span className="asb-sep">·</span><span className="asb-done">{done.length} complete</span></>
        )}
      </div>
      <div className="asb-agents">
        {agents.map(a => (
          <div
            key={a.id}
            className={`asb-dot ${a.status}`}
            title={`${a.name} — ${a.status}`}
            style={{ background: a.color, boxShadow: a.status !== 'complete' ? `0 0 8px ${a.color}60` : 'none' }}
          />
        ))}
      </div>
    </div>
  );
}
