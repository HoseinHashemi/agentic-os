import type { Scenario } from '../types';

// ─── Medical Case ──────────────────────────────────────────────────────────────
const medicalScenario: Scenario = {
  id: 'medical',
  keywords: ['patient', 'fatigue', 'heartbeat', 'blood sugar', 'medical', 'diagnostic', 'symptoms', 'diagnosis'],
  taskLabel: 'Medical Case Analysis',
  agents: [
    { id: 'card',   name: 'Dr. Aria Chen',    specialty: 'Cardiology',             color: '#06b6d4' },
    { id: 'endo',   name: 'Dr. Marcus Webb',  specialty: 'Endocrinology',          color: '#10b981' },
    { id: 'neph',   name: 'Dr. Priya Nair',   specialty: 'Nephrology',             color: '#8b5cf6' },
    { id: 'hema',   name: 'Dr. James Liu',    specialty: 'Hematology',             color: '#f59e0b' },
    { id: 'diag',   name: 'Dr. Sofia Reyes',  specialty: 'Diagnostic Synthesis',   color: '#f43f5e' },
  ],
  totalDuration: 38000,
  events: [
    { delay: 400,  type: 'phase_change', phase: 'analyzing', phaseLabel: 'Parsing clinical presentation…' },

    // Agent spawning
    { delay: 1200, type: 'agent_spawn', agentId: 'card', action: 'Initializing cardiac analysis protocols…' },
    { delay: 2100, type: 'agent_spawn', agentId: 'endo', action: 'Loading endocrine evaluation frameworks…' },
    { delay: 3000, type: 'agent_spawn', agentId: 'neph', action: 'Calibrating renal function models…' },
    { delay: 3900, type: 'agent_spawn', agentId: 'hema', action: 'Activating hematologic screening engine…' },
    { delay: 4800, type: 'agent_spawn', agentId: 'diag', action: 'Preparing multi-system synthesis layer…' },

    { delay: 5200, type: 'phase_change', phase: 'executing', phaseLabel: 'Agents analyzing in parallel…' },

    // Independent analysis
    { delay: 5400, type: 'agent_action', agentId: 'card',   action: 'Mapping arrhythmia patterns against ECG signatures…',    status: 'executing' },
    { delay: 5600, type: 'agent_action', agentId: 'endo',   action: 'Cross-referencing glucose with HbA1c thresholds…',       status: 'executing' },
    { delay: 5800, type: 'agent_action', agentId: 'neph',   action: 'Evaluating GFR trajectories and creatinine ratios…',     status: 'executing' },
    { delay: 6000, type: 'agent_action', agentId: 'hema',   action: 'Screening CBC for anemia and inflammatory markers…',     status: 'executing' },
    { delay: 6200, type: 'agent_action', agentId: 'diag',   action: 'Monitoring agent outputs, preparing integration…',       status: 'thinking' },

    // Confidence updates during analysis
    { delay: 7200, type: 'agent_confidence', agentId: 'card', confidence: 0.71 },
    { delay: 7400, type: 'agent_confidence', agentId: 'endo', confidence: 0.68 },
    { delay: 7600, type: 'agent_confidence', agentId: 'neph', confidence: 0.62 },
    { delay: 7800, type: 'agent_confidence', agentId: 'hema', confidence: 0.74 },

    // First wave of cross-specialist communication
    { delay: 8500, type: 'communication', fromId: 'card', toId: 'endo',
      message: 'Irregular rhythm pattern consistent with diabetic cardiomyopathy — requesting endocrine correlation.',
      commDuration: 2200 },
    { delay: 8500, type: 'agent_action', agentId: 'card', action: 'Transmitting arrhythmia signature to Endocrinology…', status: 'communicating' },

    { delay: 9500, type: 'communication', fromId: 'endo', toId: 'neph',
      message: 'Elevated fasting glucose + symptoms suggest nephropathy pathway — need renal clearance data.',
      commDuration: 2000 },
    { delay: 9500, type: 'agent_action', agentId: 'endo', action: 'Sharing glucose-insulin axis findings with Nephrology…', status: 'communicating' },

    { delay: 10400, type: 'communication', fromId: 'neph', toId: 'card',
      message: 'eGFR decline detected — cardiac preload likely elevated. Fluid status critical.',
      commDuration: 2000 },
    { delay: 10400, type: 'agent_action', agentId: 'neph', action: 'Reporting renal-cardiac interaction to Cardiology…', status: 'communicating' },

    { delay: 11200, type: 'communication', fromId: 'hema', toId: 'diag',
      message: 'CBC shows normocytic anemia — likely chronic disease origin. Iron studies recommended.',
      commDuration: 1800 },
    { delay: 11200, type: 'agent_action', agentId: 'hema', action: 'Flagging anemia signature to Diagnostic Coordinator…', status: 'communicating' },

    // Confidence rises after peer data
    { delay: 12000, type: 'agent_confidence', agentId: 'card', confidence: 0.87 },
    { delay: 12200, type: 'agent_confidence', agentId: 'endo', confidence: 0.84 },
    { delay: 12400, type: 'agent_confidence', agentId: 'neph', confidence: 0.79 },
    { delay: 12600, type: 'agent_confidence', agentId: 'hema', confidence: 0.89 },

    // Second wave — more refined conclusions
    { delay: 13000, type: 'agent_action', agentId: 'card', action: 'Classifying arrhythmia: paroxysmal atrial fibrillation, risk score HIGH…', status: 'executing' },
    { delay: 13200, type: 'agent_action', agentId: 'endo', action: 'Provisional diagnosis: Type 2 DM with HbA1c > 8% probable…', status: 'executing' },
    { delay: 13400, type: 'agent_action', agentId: 'neph', action: 'Stage 3 CKD plausible — proteinuria screening indicated…', status: 'executing' },

    { delay: 14200, type: 'communication', fromId: 'card', toId: 'diag',
      message: 'AFib with RVR classification complete. Anticoagulation risk stratification required.',
      commDuration: 2000 },
    { delay: 14600, type: 'communication', fromId: 'endo', toId: 'diag',
      message: 'T2DM pathway confirmed. Metformin contraindicated given renal findings.',
      commDuration: 2000 },
    { delay: 15000, type: 'communication', fromId: 'neph', toId: 'diag',
      message: 'Renal dosing adjustments needed for any cardiac medication. Flagging drug interactions.',
      commDuration: 2000 },

    { delay: 15500, type: 'agent_action', agentId: 'diag', action: 'Integrating multi-system findings — resolving contraindication conflicts…', status: 'executing' },
    { delay: 15700, type: 'agent_confidence', agentId: 'diag', confidence: 0.91 },

    // Peer evaluation phase
    { delay: 16800, type: 'phase_change', phase: 'evaluating', phaseLabel: 'Agents cross-evaluating each other…' },
    { delay: 17000, type: 'peer_evaluation', evaluatorId: 'card', evaluateeId: 'endo', score: 0.91,
      feedback: 'Endocrine analysis rigorous; HbA1c inference sound but needs OGTT confirmation.' },
    { delay: 17600, type: 'peer_evaluation', evaluatorId: 'endo', evaluateeId: 'neph', score: 0.88,
      feedback: 'Renal trajectory compelling; recommend adding urine albumin-to-creatinine ratio.' },
    { delay: 18200, type: 'peer_evaluation', evaluatorId: 'neph', evaluateeId: 'card', score: 0.93,
      feedback: 'Cardiac classification excellent. Drug dosing cross-check consistent with renal findings.' },
    { delay: 18800, type: 'peer_evaluation', evaluatorId: 'hema', evaluateeId: 'diag', score: 0.89,
      feedback: 'Synthesis coherent. Anemia as driver vs. consequence remains open — flag for clinician.' },

    { delay: 19200, type: 'agent_confidence', agentId: 'card', confidence: 0.94 },
    { delay: 19400, type: 'agent_confidence', agentId: 'endo', confidence: 0.91 },
    { delay: 19600, type: 'agent_confidence', agentId: 'neph', confidence: 0.87 },
    { delay: 19800, type: 'agent_confidence', agentId: 'hema', confidence: 0.92 },

    // Synthesis
    { delay: 20500, type: 'phase_change', phase: 'synthesizing', phaseLabel: 'Synthesizing unified clinical picture…' },
    { delay: 20600, type: 'agent_action', agentId: 'diag', action: 'Generating unified diagnostic report and care pathway…', status: 'executing' },

    { delay: 21500, type: 'task_report', taskReport: {
        executiveSummary: 'The patient presents with a cardiorenal-metabolic triad: paroxysmal atrial fibrillation, probable Type 2 Diabetes Mellitus, and early-stage CKD. These conditions are mutually reinforcing and require coordinated multi-specialist management with urgent diagnostic workup to prevent stroke and renal progression.',
        actionItems: [
          { label: 'Order 24h Holter monitor, HbA1c, spot urine ACR, BMP, CBC with differential, and iron studies immediately', priority: 'high', effort: 'quick' },
          { label: 'Schedule echocardiogram and renal ultrasound within 72 hours', priority: 'high', effort: 'quick' },
          { label: 'Hold Metformin pending GFR confirmation — switch to apixaban (preferred over rivaroxaban for renal function)', priority: 'high', effort: 'quick' },
          { label: 'Initiate endocrinology and nephrology co-management referrals', priority: 'medium', effort: 'medium' },
          { label: 'Resolve anemia etiology before treatment escalation — iron-deficiency vs. chronic disease requires direct clinician review', priority: 'medium', effort: 'medium' },
        ],
        followUpQuestions: [
          'What are the contraindications for apixaban given this patient\'s specific GFR level?',
          'How should diabetes management be adjusted given the cardiac and renal complications?',
          'What monitoring frequency is recommended for CKD progression in this cardiometabolic context?',
          'Are there any drug interactions between the proposed anticoagulant and current medications?',
        ],
        limitations: 'Analysis based on the symptom triad provided — lab values, imaging results, and full medication history were not available for review. Diagnostic certainty requires in-person examination and confirmed test results.',
    }},

    { delay: 22000, type: 'insight', insight: {
        title: 'Primary Clinical Picture',
        content: 'Triad of paroxysmal atrial fibrillation, probable Type 2 Diabetes Mellitus, and early-stage CKD — likely interconnected via cardiorenal-metabolic syndrome. Fatigue driven by anemia of chronic disease compounding cardiac and renal hypoperfusion.',
        contributors: ['card', 'endo', 'neph', 'hema'],
        contributorNames: ['Dr. Aria Chen', 'Dr. Marcus Webb', 'Dr. Priya Nair', 'Dr. James Liu'],
        contributorColors: ['#06b6d4', '#10b981', '#8b5cf6', '#f59e0b'],
        confidence: 0.91,
        category: 'Diagnosis',
        severity: 'warning',
        evidence: [
          'Irregular heartbeat + elevated blood sugar + fatigue forms a recognized cardiorenal-metabolic triad',
          'Anemia of chronic disease confirmed as compounding factor by Hematology Agent',
          'CKD stage estimated early based on symptom constellation — GFR confirmation pending',
        ],
    }},

    { delay: 24500, type: 'insight', insight: {
        title: 'Recommended Diagnostic Pathway',
        content: 'Immediate: 24h Holter monitor, HbA1c, spot urine ACR, BMP, CBC with differential, iron studies. Within 72h: Echocardiogram (EF assessment), renal ultrasound. Consider: Endocrinology and nephrology co-management. Note: Metformin hold pending GFR < 30 verification.',
        contributors: ['card', 'endo', 'neph', 'diag'],
        contributorNames: ['Dr. Aria Chen', 'Dr. Marcus Webb', 'Dr. Priya Nair', 'Dr. Sofia Reyes'],
        contributorColors: ['#06b6d4', '#10b981', '#8b5cf6', '#f43f5e'],
        confidence: 0.93,
        category: 'Action Plan',
        severity: 'info',
        evidence: [
          'Holter monitor is gold standard for paroxysmal AF — 24h capture preferred for intermittent arrhythmias',
          'HbA1c + spot ACR combination detects both T2DM severity and early diabetic nephropathy',
          'Echocardiogram necessary to assess EF and rule out structural heart disease contributing to AF',
        ],
    }},

    { delay: 27000, type: 'insight', insight: {
        title: 'Risk Stratification & Conflicts',
        content: 'High stroke risk (CHA₂DS₂-VASc ≥ 3) — anticoagulation indicated but renal function limits DOAC dosing (apixaban preferred over rivaroxaban). Agent disagreement flagged: anemia etiology uncertain (iron-deficiency vs. chronic disease) — direct clinician review recommended before treatment escalation.',
        contributors: ['card', 'neph', 'hema', 'diag'],
        contributorNames: ['Dr. Aria Chen', 'Dr. Priya Nair', 'Dr. James Liu', 'Dr. Sofia Reyes'],
        contributorColors: ['#06b6d4', '#8b5cf6', '#f59e0b', '#f43f5e'],
        confidence: 0.87,
        category: 'Risk & Conflicts',
        severity: 'critical',
        evidence: [
          'CHA₂DS₂-VASc score ≥ 3 based on age, hypertension history, and diabetes — stroke risk >3.7%/year',
          'Rivaroxaban contraindicated if GFR < 30; apixaban has favorable renal profile down to GFR 15',
          'Inter-agent disagreement: iron deficiency vs. anemia of chronic disease requires serum ferritin + TIBC to resolve',
        ],
    }},

    { delay: 29000, type: 'agent_action', agentId: 'card', action: 'Analysis complete. Findings logged to knowledge base.', status: 'complete' },
    { delay: 29400, type: 'agent_action', agentId: 'endo', action: 'Analysis complete. Endocrine pathway documented.', status: 'complete' },
    { delay: 29800, type: 'agent_action', agentId: 'neph', action: 'Analysis complete. Renal dosing flags archived.', status: 'complete' },
    { delay: 30200, type: 'agent_action', agentId: 'hema', action: 'Analysis complete. Iron study recommendation logged.', status: 'complete' },
    { delay: 30600, type: 'agent_action', agentId: 'diag', action: 'Synthesis complete. Report delivered.', status: 'complete' },

    { delay: 31500, type: 'phase_change', phase: 'complete', phaseLabel: 'Task complete' },
    { delay: 31500, type: 'complete', completionPct: 100 },
  ],
};

// ─── Security Review ───────────────────────────────────────────────────────────
const securityScenario: Scenario = {
  id: 'security',
  keywords: ['security', 'vulnerability', 'codebase', 'code review', 'performance', 'architectural', 'audit', 'pentest'],
  taskLabel: 'Codebase Security & Architecture Review',
  agents: [
    { id: 'sast',   name: 'SAST Scanner',          specialty: 'Static Analysis',         color: '#f97316' },
    { id: 'perf',   name: 'Perf Analyst',           specialty: 'Performance Engineering', color: '#06b6d4' },
    { id: 'arch',   name: 'Arch Reviewer',          specialty: 'System Architecture',     color: '#8b5cf6' },
    { id: 'dep',    name: 'Dependency Auditor',     specialty: 'Supply Chain Security',   color: '#10b981' },
    { id: 'synth',  name: 'Security Synthesizer',   specialty: 'Risk Synthesis',          color: '#f43f5e' },
  ],
  totalDuration: 36000,
  events: [
    { delay: 400,  type: 'phase_change', phase: 'analyzing', phaseLabel: 'Parsing codebase scope and entry points…' },

    { delay: 1200, type: 'agent_spawn', agentId: 'sast',  action: 'Loading OWASP Top-10 detection models…' },
    { delay: 2000, type: 'agent_spawn', agentId: 'perf',  action: 'Initializing profiling and complexity analyzers…' },
    { delay: 2800, type: 'agent_spawn', agentId: 'arch',  action: 'Mapping system boundaries and data flows…' },
    { delay: 3600, type: 'agent_spawn', agentId: 'dep',   action: 'Pulling dependency tree and CVE feeds…' },
    { delay: 4400, type: 'agent_spawn', agentId: 'synth', action: 'Calibrating risk aggregation framework…' },

    { delay: 5000, type: 'phase_change', phase: 'executing', phaseLabel: 'Parallel multi-layer analysis in progress…' },

    { delay: 5200, type: 'agent_action', agentId: 'sast',  action: 'Scanning for injection vectors and authentication bypasses…', status: 'executing' },
    { delay: 5400, type: 'agent_action', agentId: 'perf',  action: 'Profiling hot paths, N+1 queries, and memory leaks…', status: 'executing' },
    { delay: 5600, type: 'agent_action', agentId: 'arch',  action: 'Analyzing service boundaries, coupling, and trust zones…', status: 'executing' },
    { delay: 5800, type: 'agent_action', agentId: 'dep',   action: 'Cross-referencing 847 dependencies against NVD/OSV…', status: 'executing' },
    { delay: 6000, type: 'agent_action', agentId: 'synth', action: 'Awaiting agent outputs for risk aggregation…', status: 'thinking' },

    { delay: 7000, type: 'agent_confidence', agentId: 'sast', confidence: 0.69 },
    { delay: 7200, type: 'agent_confidence', agentId: 'perf', confidence: 0.72 },
    { delay: 7400, type: 'agent_confidence', agentId: 'arch', confidence: 0.65 },
    { delay: 7600, type: 'agent_confidence', agentId: 'dep',  confidence: 0.88 },

    { delay: 8200, type: 'communication', fromId: 'sast', toId: 'arch',
      message: 'SQL injection surface detected in data access layer — architectural boundary missing between API and DB.',
      commDuration: 2200 },
    { delay: 8200, type: 'agent_action', agentId: 'sast', action: 'Flagging injection surface to Architecture Reviewer…', status: 'communicating' },

    { delay: 9200, type: 'communication', fromId: 'dep', toId: 'synth',
      message: '3 critical CVEs found: CVE-2024-4577 (PHP RCE), CVE-2024-3094 (XZ backdoor), CVE-2023-44487 (HTTP/2 DoS).',
      commDuration: 2200 },
    { delay: 9200, type: 'agent_action', agentId: 'dep', action: 'Escalating critical CVEs to Risk Synthesizer…', status: 'communicating' },

    { delay: 10200, type: 'communication', fromId: 'perf', toId: 'arch',
      message: 'Detected synchronous blocking I/O in critical hot path — throughput ceiling ~200 RPS under load.',
      commDuration: 2000 },
    { delay: 10200, type: 'agent_action', agentId: 'perf', action: 'Reporting throughput bottleneck to Architecture Reviewer…', status: 'communicating' },

    { delay: 11200, type: 'communication', fromId: 'arch', toId: 'synth',
      message: 'Monolithic auth service is single point of failure. No circuit breakers. Cascading failure risk critical.',
      commDuration: 2000 },
    { delay: 11200, type: 'agent_action', agentId: 'arch', action: 'Transmitting structural failure risk assessment…', status: 'communicating' },

    { delay: 12000, type: 'agent_confidence', agentId: 'sast', confidence: 0.88 },
    { delay: 12200, type: 'agent_confidence', agentId: 'perf', confidence: 0.85 },
    { delay: 12400, type: 'agent_confidence', agentId: 'arch', confidence: 0.83 },
    { delay: 12600, type: 'agent_confidence', agentId: 'dep',  confidence: 0.96 },

    { delay: 13000, type: 'agent_action', agentId: 'sast', action: 'Completing IDOR and SSRF surface mapping…', status: 'executing' },
    { delay: 13200, type: 'agent_action', agentId: 'perf', action: 'Finalizing memory allocation anomaly report…', status: 'executing' },
    { delay: 13400, type: 'agent_action', agentId: 'arch', action: 'Documenting service mesh gaps and trust boundary violations…', status: 'executing' },

    { delay: 14500, type: 'communication', fromId: 'sast', toId: 'synth',
      message: '14 high-severity findings. 3 critical: RCE via deserialization, stored XSS in admin panel, broken auth on /api/export.',
      commDuration: 2000 },
    { delay: 15000, type: 'communication', fromId: 'perf', toId: 'synth',
      message: '6 performance anti-patterns. N+1 in user feed (47ms → 2ms fix), unbounded goroutine leaks in websocket handler.',
      commDuration: 2000 },
    { delay: 15500, type: 'communication', fromId: 'arch', toId: 'synth',
      message: 'Recommend strangler-fig migration for auth monolith. Event-driven async layer would resolve perf + security coupling.',
      commDuration: 2200 },

    { delay: 16000, type: 'agent_action', agentId: 'synth', action: 'Aggregating 23 findings. Correlating cross-layer interactions…', status: 'executing' },
    { delay: 16200, type: 'agent_confidence', agentId: 'synth', confidence: 0.93 },

    { delay: 17200, type: 'phase_change', phase: 'evaluating', phaseLabel: 'Cross-agent validation pass…' },
    { delay: 17400, type: 'peer_evaluation', evaluatorId: 'sast',  evaluateeId: 'dep',   score: 0.95, feedback: 'CVE coverage complete. SBOM generation would strengthen supply chain posture.' },
    { delay: 18000, type: 'peer_evaluation', evaluatorId: 'arch',  evaluateeId: 'sast',  score: 0.89, feedback: 'Injection findings solid. SSRF scan missed internal metadata endpoints — recommend rescan.' },
    { delay: 18600, type: 'peer_evaluation', evaluatorId: 'perf',  evaluateeId: 'arch',  score: 0.91, feedback: 'Architectural analysis accurate. Async migration estimate aligns with profiling data.' },
    { delay: 19200, type: 'peer_evaluation', evaluatorId: 'dep',   evaluateeId: 'synth', score: 0.88, feedback: 'Risk aggregation sound. Prioritization matrix could weight exploit availability from EPSS.' },

    { delay: 20000, type: 'phase_change', phase: 'synthesizing', phaseLabel: 'Generating prioritized remediation plan…' },

    { delay: 20800, type: 'task_report', taskReport: {
        executiveSummary: 'The codebase has 3 critical security vulnerabilities requiring immediate patching, a monolithic auth architecture creating systemic risk, and a performance ceiling of ~200 RPS due to synchronous blocking I/O. All three issues are interdependent — resolving the architecture also addresses the security coupling and performance bottleneck.',
        actionItems: [
          { label: 'Patch Java deserialization RCE in /api/v2/import — replace ObjectInputStream with SerialKiller or JSON', priority: 'high', effort: 'quick' },
          { label: 'Add Content-Security-Policy header and escape admin markdown renderer output to fix stored XSS', priority: 'high', effort: 'quick' },
          { label: 'Enforce RS256 explicitly on JWT validation to close auth bypass on /api/export', priority: 'high', effort: 'quick' },
          { label: 'Fix N+1 query in user feed with eager-loading JOIN — 47ms → 2ms (96% reduction)', priority: 'high', effort: 'quick' },
          { label: 'Extract monolithic auth to dedicated service with circuit breakers (Hystrix/Resilience4j)', priority: 'medium', effort: 'long' },
          { label: 'Introduce async event bus to decouple payment and notification services — raises throughput ceiling above 200 RPS', priority: 'medium', effort: 'long' },
        ],
        followUpQuestions: [
          'What is the estimated timeline and effort for the auth service extraction using strangler-fig pattern?',
          'Are there any dependencies or customers currently relying on the /api/v2/import deserialization endpoint?',
          'What EPSS exploit probability scores exist for the 3 identified critical CVEs?',
          'Should the service mesh (Istio) be adopted alongside the auth extraction or deferred to a later phase?',
        ],
        limitations: 'Analysis was performed without access to actual source code — findings are based on described architecture and symptom patterns. CVE cross-referencing used NVD/OSV public feeds; private vendor advisories were not checked.',
    }},

    { delay: 21500, type: 'insight', insight: {
        title: 'Critical Vulnerabilities — Patch Immediately',
        content: '3 critical RCEs and broken authentication require immediate hotfix. (1) Java deserialization via untrusted ObjectInputStream in /api/v2/import — patch with SerialKiller or migrate to JSON. (2) Stored XSS in admin markdown renderer — missing Content-Security-Policy + unescaped output. (3) Auth bypass on /api/export via JWT algorithm confusion — enforce RS256 explicitly.',
        contributors: ['sast', 'dep', 'synth'],
        contributorNames: ['SAST Scanner', 'Dependency Auditor', 'Security Synthesizer'],
        contributorColors: ['#f97316', '#10b981', '#f43f5e'],
        confidence: 0.96,
        category: 'Critical Security',
        severity: 'critical',
        evidence: [
          'ObjectInputStream deserialization at /api/v2/import — OWASP A08:2021 — exploitable without authentication',
          'Admin markdown renderer outputs unsanitized HTML with no CSP header — CVSS 8.2 stored XSS',
          'JWT accepts both RS256 and HS256 — algorithm confusion allows forged tokens with public key as HMAC secret',
        ],
    }},

    { delay: 24000, type: 'insight', insight: {
        title: 'Architectural Transformation Required',
        content: 'Monolithic auth service creates cascading failure risk and is a single injection target. Recommended: (1) Extract auth to dedicated service with circuit breakers (Hystrix/Resilience4j). (2) Introduce async event bus to decouple payment and notification services — removes synchronous blocking that caps throughput at 200 RPS. (3) Implement service mesh (Istio) for mutual TLS between services.',
        contributors: ['arch', 'perf', 'synth'],
        contributorNames: ['Arch Reviewer', 'Perf Analyst', 'Security Synthesizer'],
        contributorColors: ['#8b5cf6', '#06b6d4', '#f43f5e'],
        confidence: 0.89,
        category: 'Architecture',
        severity: 'warning',
        evidence: [
          'Auth service handles 100% of request authentication with no fallback — single point of failure confirmed',
          'Payment and notification services share synchronous call chain — one timeout cascades across all services',
          'No mutual TLS between internal services — lateral movement possible after perimeter breach',
        ],
    }},

    { delay: 26500, type: 'insight', insight: {
        title: 'Performance — 10x Wins Available',
        content: 'N+1 query in user feed endpoint: 1 query → 47 queries per request. Fix: eager-load with JOIN. Estimated: 47ms → 2ms (96% reduction). Unbounded goroutine leak in WebSocket handler will cause OOM under sustained load — add context cancellation. Add Redis caching layer for session lookups (current: 12ms DB round-trips per request).',
        contributors: ['perf', 'arch'],
        contributorNames: ['Perf Analyst', 'Arch Reviewer'],
        contributorColors: ['#06b6d4', '#8b5cf6'],
        confidence: 0.92,
        category: 'Performance',
        severity: 'info',
        evidence: [
          'User feed generates 47 SQL queries per request — confirmed via query profiling, fix is a 3-line JOIN change',
          'WebSocket goroutines lack context.Done() check — goroutine count grows unbounded under sustained connections',
          'Session lookup makes 12ms DB round-trip on every request — Redis cache estimated 0.3ms (97.5% reduction)',
        ],
    }},

    { delay: 28500, type: 'agent_action', agentId: 'sast',  action: 'Analysis complete. 14 findings archived.', status: 'complete' },
    { delay: 28900, type: 'agent_action', agentId: 'perf',  action: 'Profiling complete. Optimization roadmap logged.', status: 'complete' },
    { delay: 29300, type: 'agent_action', agentId: 'arch',  action: 'Architecture review complete. Migration plan delivered.', status: 'complete' },
    { delay: 29700, type: 'agent_action', agentId: 'dep',   action: 'CVE audit complete. 3 critical patched, 12 flagged.', status: 'complete' },
    { delay: 30100, type: 'agent_action', agentId: 'synth', action: 'Risk synthesis complete. Prioritized remediation report ready.', status: 'complete' },

    { delay: 31000, type: 'phase_change', phase: 'complete', phaseLabel: 'Task complete' },
    { delay: 31000, type: 'complete', completionPct: 100 },
  ],
};

// ─── Quantum Research ──────────────────────────────────────────────────────────
const quantumScenario: Scenario = {
  id: 'quantum',
  keywords: ['quantum', 'computing', 'research', 'developments', 'applications', 'promising', 'directions'],
  taskLabel: 'Quantum Computing Research Analysis',
  agents: [
    { id: 'lit',   name: 'Literature Scout',        specialty: 'Academic Research',         color: '#3b82f6' },
    { id: 'hw',    name: 'Hardware Analyst',         specialty: 'Quantum Hardware',          color: '#8b5cf6' },
    { id: 'alg',   name: 'Algorithm Researcher',     specialty: 'Quantum Algorithms',        color: '#14b8a6' },
    { id: 'app',   name: 'Applications Analyst',     specialty: 'Practical Applications',    color: '#f59e0b' },
    { id: 'val',   name: 'Validation Agent',         specialty: 'Claim Verification',        color: '#f43f5e' },
    { id: 'res',   name: 'Research Synthesizer',     specialty: 'Insight Synthesis',         color: '#06b6d4' },
  ],
  totalDuration: 40000,
  events: [
    { delay: 400,  type: 'phase_change', phase: 'analyzing', phaseLabel: 'Scoping research domain and timeframe…' },

    { delay: 1200, type: 'agent_spawn', agentId: 'lit',  action: 'Indexing arXiv, Nature, Science — 2023-2026 corpus…' },
    { delay: 2100, type: 'agent_spawn', agentId: 'hw',   action: 'Loading hardware milestone and qubit coherence databases…' },
    { delay: 3000, type: 'agent_spawn', agentId: 'alg',  action: 'Activating algorithm complexity and benchmark models…' },
    { delay: 3900, type: 'agent_spawn', agentId: 'app',  action: 'Initializing industry readiness and TRL assessment frameworks…' },
    { delay: 4800, type: 'agent_spawn', agentId: 'val',  action: 'Calibrating claim verification and source credibility scoring…' },
    { delay: 5700, type: 'agent_spawn', agentId: 'res',  action: 'Preparing multi-source synthesis and narrative construction…' },

    { delay: 6200, type: 'phase_change', phase: 'executing', phaseLabel: 'Deep research scan in progress…' },

    { delay: 6400, type: 'agent_action', agentId: 'lit',  action: 'Scanning 2,847 papers — filtering by citation velocity and novelty…', status: 'executing' },
    { delay: 6600, type: 'agent_action', agentId: 'hw',   action: 'Analyzing error rate trajectories: IBM, Google, IonQ, Quantinuum…', status: 'executing' },
    { delay: 6800, type: 'agent_action', agentId: 'alg',  action: 'Benchmarking QAOA, VQE, and fault-tolerant algorithm maturity…', status: 'executing' },
    { delay: 7000, type: 'agent_action', agentId: 'app',  action: 'Assessing pharmaceutical, financial, and logistics use-case readiness…', status: 'executing' },
    { delay: 7200, type: 'agent_action', agentId: 'val',  action: 'Queuing claims from hardware and algorithm agents for verification…', status: 'thinking' },
    { delay: 7400, type: 'agent_action', agentId: 'res',  action: 'Monitoring research threads, building thematic clusters…', status: 'thinking' },

    { delay: 8500, type: 'agent_confidence', agentId: 'lit',  confidence: 0.70 },
    { delay: 8700, type: 'agent_confidence', agentId: 'hw',   confidence: 0.74 },
    { delay: 8900, type: 'agent_confidence', agentId: 'alg',  confidence: 0.68 },
    { delay: 9100, type: 'agent_confidence', agentId: 'app',  confidence: 0.65 },

    { delay: 9800, type: 'communication', fromId: 'lit', toId: 'hw',
      message: 'High citation velocity on error-corrected logical qubit papers (Google 2025, MIT 2025). Hardware noise crossing threshold?',
      commDuration: 2200 },
    { delay: 9800, type: 'agent_action', agentId: 'lit', action: 'Surfacing logical qubit breakthrough papers to Hardware Analyst…', status: 'communicating' },

    { delay: 11000, type: 'communication', fromId: 'hw', toId: 'alg',
      message: 'Google Willow achieved 105 logical qubits with below-threshold error rates. Surface code viability confirmed.',
      commDuration: 2200 },
    { delay: 11000, type: 'agent_action', agentId: 'hw', action: 'Relaying logical qubit viability to Algorithm Researcher…', status: 'communicating' },

    { delay: 12200, type: 'communication', fromId: 'alg', toId: 'app',
      message: 'Fault-tolerant Shor variants now tractable at 1000+ logical qubits. RSA-2048 break timeline: 8-12 years.',
      commDuration: 2000 },
    { delay: 12200, type: 'agent_action', agentId: 'alg', action: 'Transmitting cryptographic timeline analysis to Applications Analyst…', status: 'communicating' },

    { delay: 13400, type: 'communication', fromId: 'app', toId: 'val',
      message: 'Drug discovery (protein folding) and materials simulation showing near-term advantage — 3-5 year horizon plausible.',
      commDuration: 2200 },
    { delay: 13400, type: 'agent_action', agentId: 'app', action: 'Submitting pharma/materials advantage claims for validation…', status: 'communicating' },

    { delay: 14600, type: 'communication', fromId: 'val', toId: 'res',
      message: 'Pharma claim: verified via 3 independent studies (Quantinuum 2025, IBM 2024, Nature 2025). Confidence HIGH. RSA claim: verified, confidence MEDIUM (timeline uncertainty ±3 years).',
      commDuration: 2200 },
    { delay: 14600, type: 'agent_action', agentId: 'val', action: 'Delivering verification verdicts to Research Synthesizer…', status: 'communicating' },

    { delay: 15500, type: 'agent_confidence', agentId: 'lit',  confidence: 0.88 },
    { delay: 15700, type: 'agent_confidence', agentId: 'hw',   confidence: 0.91 },
    { delay: 15900, type: 'agent_confidence', agentId: 'alg',  confidence: 0.85 },
    { delay: 16100, type: 'agent_confidence', agentId: 'app',  confidence: 0.83 },
    { delay: 16300, type: 'agent_confidence', agentId: 'val',  confidence: 0.90 },

    { delay: 17000, type: 'agent_action', agentId: 'lit',  action: 'Identifying top-10 breakthrough papers by normalized impact…', status: 'executing' },
    { delay: 17200, type: 'agent_action', agentId: 'hw',   action: 'Projecting qubit scaling curves — 2026-2031 roadmap…', status: 'executing' },
    { delay: 17400, type: 'agent_action', agentId: 'alg',  action: 'Ranking algorithm readiness by TRL and NISQ vs. fault-tolerant…', status: 'executing' },

    { delay: 18200, type: 'communication', fromId: 'lit', toId: 'res',
      message: 'QEC surface codes dominating recent literature. Topological qubits (Microsoft) re-emerging with "topoconductor" claims.',
      commDuration: 2000 },
    { delay: 18800, type: 'communication', fromId: 'hw', toId: 'res',
      message: 'Hardware consensus: photonic and trapped-ion paths most scalable. Superconducting ahead on qubit count, behind on coherence time.',
      commDuration: 2000 },
    { delay: 19400, type: 'communication', fromId: 'alg', toId: 'res',
      message: 'VQE and QAOA useful in NISQ era but showing noise sensitivity ceiling. Fault-tolerant algorithms are the durable bet.',
      commDuration: 2000 },

    { delay: 20000, type: 'agent_action', agentId: 'res', action: 'Synthesizing three primary opportunity vectors from all agent threads…', status: 'executing' },
    { delay: 20200, type: 'agent_confidence', agentId: 'res', confidence: 0.91 },

    { delay: 21400, type: 'phase_change', phase: 'evaluating', phaseLabel: "Agents validating each other's findings…" },
    { delay: 21600, type: 'peer_evaluation', evaluatorId: 'hw',  evaluateeId: 'lit',  score: 0.92, feedback: 'Literature coverage excellent. Suggest including topological qubit preprints — emerging but significant.' },
    { delay: 22200, type: 'peer_evaluation', evaluatorId: 'val', evaluateeId: 'alg',  score: 0.89, feedback: 'Algorithm maturity assessments solid. RSA timeline range should be wider given hardware uncertainty.' },
    { delay: 22800, type: 'peer_evaluation', evaluatorId: 'alg', evaluateeId: 'app',  score: 0.87, feedback: 'Practical use-case analysis realistic. Financial optimization claims require more enterprise validation data.' },
    { delay: 23400, type: 'peer_evaluation', evaluatorId: 'lit', evaluateeId: 'res',  score: 0.93, feedback: 'Synthesis captures the three major threads accurately. Recommend adding a dissenting view on 5-year timeline.' },

    { delay: 24200, type: 'agent_confidence', agentId: 'hw',  confidence: 0.93 },
    { delay: 24400, type: 'agent_confidence', agentId: 'alg', confidence: 0.89 },
    { delay: 24600, type: 'agent_confidence', agentId: 'app', confidence: 0.87 },
    { delay: 24800, type: 'agent_confidence', agentId: 'res', confidence: 0.94 },

    { delay: 25500, type: 'phase_change', phase: 'synthesizing', phaseLabel: 'Assembling final research report…' },

    { delay: 26200, type: 'task_report', taskReport: {
        executiveSummary: 'Three high-confidence directions emerge for practical quantum computing over the next 5 years: fault-tolerant quantum error correction (6-8 year horizon, highest impact), molecular simulation for drug discovery (2-4 year horizon, near-term revenue), and post-quantum cryptography migration (urgent now, harvest-now-decrypt-later risk is active). The PQC transition is the most immediately actionable regardless of quantum hardware timelines.',
        actionItems: [
          { label: 'Begin post-quantum cryptography audit — identify all RSA/ECC endpoints and data stores needing migration', priority: 'high', effort: 'medium' },
          { label: 'Evaluate CRYSTALS-Kyber and CRYSTALS-Dilithium (NIST 2024 finalized standards) for infrastructure adoption', priority: 'high', effort: 'medium' },
          { label: 'Monitor Google Willow and Quantinuum hardware roadmaps — milestone triggers for molecular simulation investment', priority: 'medium', effort: 'quick' },
          { label: 'Explore pilot partnerships with ProteinQure, Roche, or AstraZeneca for early quantum drug discovery positioning', priority: 'medium', effort: 'long' },
          { label: 'Track Microsoft topological qubit ("topoconductor") claims — if validated, rewrites hardware timeline assumptions', priority: 'low', effort: 'quick' },
        ],
        followUpQuestions: [
          'What specific encryption standards in our current infrastructure are most vulnerable to harvest-now-decrypt-later attacks?',
          'How does the classical tensor-network method improvement affect the timeline for quantum advantage in drug discovery?',
          'Which NISQ-era quantum algorithms (VQE, QAOA) show the most promise before fault-tolerant hardware is available?',
          'What is the investment thesis for quantum computing startups vs. established players (Google, IBM, Microsoft) in 2025?',
        ],
        limitations: 'Research was based on publicly available papers and announcements as of early 2025. Proprietary hardware roadmaps and classified government research were not accessible. Timeline projections carry ±2-3 year uncertainty due to rapid pace of development.',
    }},

    { delay: 27000, type: 'insight', insight: {
        title: 'Direction 1: Quantum Error Correction at Scale',
        content: 'The most consequential development: logical qubits with below-threshold error rates are now experimentally confirmed (Google Willow, 2025). Surface code error correction is mature enough to project a clear path to fault-tolerant computation by 2030-2032. This unlocks all other quantum applications. Key players: Google (superconducting), Quantinuum (trapped-ion), Microsoft (topological). Timeline to practical advantage: 6-8 years for cryptography, 3-4 years for simulation.',
        contributors: ['lit', 'hw', 'val', 'res'],
        contributorNames: ['Literature Scout', 'Hardware Analyst', 'Validation Agent', 'Research Synthesizer'],
        contributorColors: ['#3b82f6', '#8b5cf6', '#f43f5e', '#06b6d4'],
        confidence: 0.93,
        category: 'Primary Direction',
        severity: 'success',
        evidence: [
          'Google Willow (2025): 105 logical qubits at below-threshold error rates — surface code viability experimentally confirmed',
          'High citation velocity on QEC papers: 3 landmark papers in Nature/Science in 12 months signal field maturity',
          'Microsoft "topoconductor" claims re-emerging in preprints — topological qubits would offer inherent error protection',
        ],
    }},

    { delay: 30000, type: 'insight', insight: {
        title: 'Direction 2: Molecular Simulation for Drug Discovery',
        content: 'Near-term quantum advantage is most achievable in molecular simulation. NISQ-era VQE already shows advantage over classical methods for small molecules (< 50 atoms). Pharmaceutical targets: protein folding energy landscapes, catalyst optimization, antibiotic resistance modeling. Horizon: commercially relevant demonstrations within 2-4 years. Companies betting here: Roche, AstraZeneca, ProteinQure. Key risk: classical tensor-network methods are catching up faster than expected.',
        contributors: ['alg', 'app', 'val'],
        contributorNames: ['Algorithm Researcher', 'Applications Analyst', 'Validation Agent'],
        contributorColors: ['#14b8a6', '#f59e0b', '#f43f5e'],
        confidence: 0.88,
        category: 'Primary Direction',
        severity: 'info',
        evidence: [
          'VQE shows quantum advantage for molecules < 50 atoms — verified in Quantinuum 2025, IBM 2024, and Nature 2025 studies',
          'Roche and AstraZeneca have active quantum programs targeting protein folding energy landscape optimization',
          'Classical tensor-network methods improving at ~15% accuracy/year — this narrows the advantage window',
        ],
    }},

    { delay: 33000, type: 'insight', insight: {
        title: 'Direction 3: Post-Quantum Cryptography Transition',
        content: 'Harvest-now-decrypt-later attacks make the quantum threat to RSA/ECC urgent regardless of 10-year timelines. NIST finalized PQC standards (CRYSTALS-Kyber, CRYSTALS-Dilithium) in 2024. Most practical opportunity in the next 5 years: building cryptographic agility infrastructure, quantum key distribution (QKD) networks for high-value links, and PKI migration tooling. Note: agent disagreement on timeline — val agent flags ±3 year uncertainty in RSA-2048 break window.',
        contributors: ['alg', 'app', 'res'],
        contributorNames: ['Algorithm Researcher', 'Applications Analyst', 'Research Synthesizer'],
        contributorColors: ['#14b8a6', '#f59e0b', '#06b6d4'],
        confidence: 0.86,
        category: 'Primary Direction',
        severity: 'warning',
        evidence: [
          'Harvest-now-decrypt-later: adversaries storing encrypted traffic today for future decryption — data with 10+ year sensitivity at risk now',
          'NIST 2024: CRYSTALS-Kyber (key encapsulation) and CRYSTALS-Dilithium (signatures) finalized as primary PQC standards',
          'RSA-2048 break window: 8-12 years (±3 year uncertainty per Validation Agent — driven by hardware scaling uncertainty)',
        ],
    }},

    { delay: 35000, type: 'agent_action', agentId: 'lit',  action: 'Research scan complete. 2,847 papers indexed, 34 flagged as high-impact.', status: 'complete' },
    { delay: 35400, type: 'agent_action', agentId: 'hw',   action: 'Hardware analysis complete. Scaling roadmaps archived.', status: 'complete' },
    { delay: 35800, type: 'agent_action', agentId: 'alg',  action: 'Algorithm benchmarks complete. TRL matrix delivered.', status: 'complete' },
    { delay: 36200, type: 'agent_action', agentId: 'app',  action: 'Application analysis complete. Industry readiness report logged.', status: 'complete' },
    { delay: 36600, type: 'agent_action', agentId: 'val',  action: 'Validation complete. 12 claims verified, 3 flagged uncertain.', status: 'complete' },
    { delay: 37000, type: 'agent_action', agentId: 'res',  action: 'Synthesis complete. Three-direction report finalized.', status: 'complete' },

    { delay: 38000, type: 'phase_change', phase: 'complete', phaseLabel: 'Task complete' },
    { delay: 38000, type: 'complete', completionPct: 100 },
  ],
};

// ─── Generic fallback ──────────────────────────────────────────────────────────
export function createGenericScenario(task: string): Scenario {
  const words = task.split(' ').slice(0, 3).join('-').toLowerCase();
  return {
    id: `generic-${words}`,
    keywords: [],
    taskLabel: 'General Intelligence Task',
    agents: [
      { id: 'analyst', name: 'Task Analyst',    specialty: 'Problem Decomposition', color: '#3b82f6' },
      { id: 'expert',  name: 'Domain Expert',   specialty: 'Deep Analysis',         color: '#10b981' },
      { id: 'critic',  name: 'Critical Reviewer', specialty: 'Validation',          color: '#f59e0b' },
      { id: 'synth',   name: 'Synthesizer',     specialty: 'Output Generation',     color: '#f43f5e' },
    ],
    totalDuration: 28000,
    events: [
      { delay: 400,  type: 'phase_change', phase: 'analyzing' },
      { delay: 1200, type: 'agent_spawn', agentId: 'analyst', action: 'Decomposing task structure and requirements…' },
      { delay: 2200, type: 'agent_spawn', agentId: 'expert',  action: 'Activating domain knowledge and reasoning models…' },
      { delay: 3200, type: 'agent_spawn', agentId: 'critic',  action: 'Loading validation and consistency-checking protocols…' },
      { delay: 4200, type: 'agent_spawn', agentId: 'synth',   action: 'Preparing synthesis and output generation layer…' },
      { delay: 5000, type: 'phase_change', phase: 'executing' },
      { delay: 5200, type: 'agent_action', agentId: 'analyst', action: 'Breaking task into structured sub-problems…', status: 'executing' },
      { delay: 5600, type: 'agent_action', agentId: 'expert',  action: 'Applying domain expertise to each sub-problem…', status: 'executing' },
      { delay: 6000, type: 'agent_action', agentId: 'critic',  action: 'Monitoring agent outputs for consistency…', status: 'thinking' },
      { delay: 7000, type: 'agent_confidence', agentId: 'analyst', confidence: 0.72 },
      { delay: 7200, type: 'agent_confidence', agentId: 'expert',  confidence: 0.68 },
      { delay: 8000, type: 'communication', fromId: 'analyst', toId: 'expert',
        message: 'Task decomposition complete — 4 primary sub-problems identified.', commDuration: 2000 },
      { delay: 9000, type: 'communication', fromId: 'expert',  toId: 'critic',
        message: 'Initial findings ready for validation review.', commDuration: 2000 },
      { delay: 10000, type: 'communication', fromId: 'critic',  toId: 'synth',
        message: 'Findings validated with 2 caveats. Ready for synthesis.', commDuration: 2000 },
      { delay: 11000, type: 'agent_confidence', agentId: 'analyst', confidence: 0.88 },
      { delay: 11200, type: 'agent_confidence', agentId: 'expert',  confidence: 0.85 },
      { delay: 11400, type: 'agent_confidence', agentId: 'critic',  confidence: 0.90 },
      { delay: 12000, type: 'phase_change', phase: 'evaluating' },
      { delay: 12200, type: 'peer_evaluation', evaluatorId: 'critic', evaluateeId: 'expert', score: 0.87, feedback: 'Analysis thorough. Two assumptions should be flagged for user review.' },
      { delay: 13500, type: 'phase_change', phase: 'synthesizing' },
      { delay: 14500, type: 'agent_action', agentId: 'synth', action: 'Generating structured output from all agent contributions…', status: 'executing' },
      { delay: 15500, type: 'insight', insight: {
          title: 'Analysis Complete',
          content: 'Task successfully decomposed and analyzed across 4 sub-problems. Key findings synthesized with high confidence. 2 areas flagged for human review due to ambiguity in source constraints.',
          contributors: ['analyst', 'expert', 'critic', 'synth'],
          contributorNames: ['Task Analyst', 'Domain Expert', 'Critical Reviewer', 'Synthesizer'],
          contributorColors: ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e'],
          confidence: 0.87,
          category: 'Summary',
      }},
      { delay: 18000, type: 'agent_action', agentId: 'analyst', action: 'Complete.', status: 'complete' },
      { delay: 18400, type: 'agent_action', agentId: 'expert',  action: 'Complete.', status: 'complete' },
      { delay: 18800, type: 'agent_action', agentId: 'critic',  action: 'Complete.', status: 'complete' },
      { delay: 19200, type: 'agent_action', agentId: 'synth',   action: 'Complete.', status: 'complete' },
      { delay: 20000, type: 'phase_change', phase: 'complete' },
      { delay: 20000, type: 'complete', completionPct: 100 },
    ],
  };
}

export const SCENARIOS: Scenario[] = [medicalScenario, securityScenario, quantumScenario];

export function matchScenario(task: string): Scenario {
  const lower = task.toLowerCase();
  for (const scenario of SCENARIOS) {
    const matches = scenario.keywords.filter(kw => lower.includes(kw));
    if (matches.length >= 2) return scenario;
  }
  for (const scenario of SCENARIOS) {
    const matches = scenario.keywords.filter(kw => lower.includes(kw));
    if (matches.length >= 1) return scenario;
  }
  return createGenericScenario(task);
}
