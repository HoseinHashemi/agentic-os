import { useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { Agent, ActiveCommunication, OrchestratorPhase, TaskRelationship } from '../types';

interface Props {
  agents: Agent[];
  communications: ActiveCommunication[];
  phase: OrchestratorPhase;
  isActive: boolean;
  agentGroups?: Array<{ groupId: string; isActive: boolean; phase: string }>;
  relationships?: TaskRelationship[];
}

// ── Camera fit: compute scale/translate to fit all clusters on screen ─────────
function computeFitCamera(
  clusters: Array<{ cx: number; cy: number; r: number }>,
  w: number, h: number,
): { x: number; y: number; scale: number } {
  if (clusters.length === 0 || w === 0 || h === 0) return { x: 0, y: 0, scale: 1 };
  const PAD = 72;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of clusters) {
    minX = Math.min(minX, c.cx - c.r - PAD);
    maxX = Math.max(maxX, c.cx + c.r + PAD);
    minY = Math.min(minY, c.cy - c.r - PAD);
    maxY = Math.max(maxY, c.cy + c.r + PAD);
  }
  const cW = maxX - minX, cH = maxY - minY;
  const scale = Math.max(0.2, Math.min(1.0, Math.min(w / cW, h / cH)));
  const worldCx = (minX + maxX) / 2;
  const worldCy = (minY + maxY) / 2;
  return { scale, x: w / 2 - worldCx * scale, y: h / 2 - worldCy * scale };
}

// ── Union-Find: group tasks into "supergroups" based on merged relationships ──
function buildGroupToSuper(groups: string[], rels: TaskRelationship[]): Map<string, string> {
  const parent = new Map<string, string>(groups.map(g => [g, g]));
  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }
  for (const rel of rels) {
    if (rel.merged) {
      const ra = find(rel.groupAId), rb = find(rel.groupBId);
      if (ra !== rb) parent.set(ra, rb);
    }
  }
  const result = new Map<string, string>();
  for (const g of groups) result.set(g, find(g));
  return result;
}

interface VisAgent {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius: number;
  color: string;
  colorRgb: [number, number, number];
  pulsePhase: number;
  spawnProgress: number;
  name: string;
  specialty: string;
  status: string;
  currentAction: string;
  confidence: number;
  evaluationScore?: number;
  qaStatus?: string;
  groupId?: string;
}

interface OrbPulse {
  ringIdx: number;
  phase: number;
  speed: number;
  life: number;       // 1 → 0
  glow: number;
}

interface ThinkLine {
  text: string;
  chars: number;    // chars revealed so far (float)
  maxChars: number;
  age: number;      // ms since spawned
}

interface OrbState {
  angle: number;
  pulses: OrbPulse[];
  lastPulseSpawn: number;
  prevAction: string;
  currAction: string;
  actionFade: number; // 0→1 on action change
  labelIdx: number;
  labelTimer: number;
  thinkLines: ThinkLine[];
  thinkTimer: number;   // ms until next line
}

interface Particle {
  id: string;
  fromId: string;
  toId: string;
  t: number;
  opacity: number;
  size: number;
  color: [number, number, number];
  speed: number;
}

interface FlowBeam {
  id: string;
  fromId: string;
  toId: string;
  startTime: number;  // RAF timestamp (ms)
  duration: number;
}

interface Star {
  x: number; y: number;
  size: number; opacity: number;
  drift: number;
}

interface PingRing {
  id: string;
  x: number;
  y: number;
  startR: number;
  maxR: number;
  color: [number, number, number];
  age: number;
  maxAge: number;
}

// ── Orb ring configuration ────────────────────────────────────────────────────
const ORB_RINGS = [
  { latDeg:  0,   count: 14, speedMult:  1.00, baseSize: 1.9 },
  { latDeg:  28,  count: 10, speedMult:  0.78, baseSize: 1.6 },
  { latDeg: -28,  count: 10, speedMult: -0.83, baseSize: 1.6 },
  { latDeg:  55,  count:  7, speedMult:  0.58, baseSize: 1.3 },
  { latDeg: -55,  count:  7, speedMult: -0.62, baseSize: 1.3 },
  { latDeg:  80,  count:  3, speedMult:  0.38, baseSize: 1.0 },
  { latDeg: -80,  count:  3, speedMult: -0.38, baseSize: 1.0 },
] as const;

const TILT_X = 0.44; // ~25° X-axis tilt for 3-D feel
const COS_T  = Math.cos(TILT_X);
const SIN_T  = Math.sin(TILT_X);

// ── Domain readout labels per specialty ──────────────────────────────────────
function getDomainLabels(specialty: string): string[] {
  const s = specialty.toLowerCase();
  if (s.match(/cardio|heart|arrhyth|rhythm/))   return ['ECG', 'HR', 'QRS', 'BP', 'AV node'];
  if (s.match(/endo|insulin|glucose|thyroid/))   return ['HbA1c', 'TSH', 'Insulin', 'Cortisol', 'FPG'];
  if (s.match(/neph|renal|kidney/))              return ['eGFR', 'Creatinine', 'BUN', 'K⁺', 'Na⁺'];
  if (s.match(/hema|blood|coagul/))              return ['CBC', 'WBC', 'Hb', 'PT/INR', 'PLT'];
  if (s.match(/secur|vuln|pentest|threat/))      return ['CVE', 'CVSS', 'OWASP', 'RCE', 'SAST'];
  if (s.match(/network|firewall|packet|traffic/)) return ['TCP/IP', 'TLS 1.3', 'DNS', 'BGP', 'VLAN'];
  if (s.match(/crypto|cipher|hash|encrypt/))     return ['AES-256', 'SHA-3', 'RSA-4096', 'HMAC', 'ECDSA'];
  if (s.match(/quantum|qubit|entangle|superpos/)) return ['|ψ⟩', 'Qubit', 'QFT', 'QASM', 'Bell state'];
  if (s.match(/ml|neural|model|learn|ai/))       return ['∇Loss', 'Epoch', 'Accuracy', 'LR', 'F1'];
  if (s.match(/code|program|develop|software/))  return ['AST', 'CFG', 'Lint', 'CI/CD', 'Coverage'];
  if (s.match(/research|analys|synthes/))        return ['Δ', 'σ', 'p-value', 'CI 95%', 'Cohen d'];
  if (s.match(/file|folder|director|system/))    return ['mkdir', 'write', 'chmod', 'stat', 'sync'];
  return ['Proc', 'Sync', 'Queue', 'Eval', 'Emit'];
}

const ACTIVE_STATUSES = new Set(['thinking', 'executing', 'communicating', 'evaluating']);

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

function bezierPoint(from: {x:number,y:number}, to: {x:number,y:number}, t: number) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const off = Math.min(len * 0.4, 80);
  const cx = mx - (dy / len) * off;
  const cy = my + (dx / len) * off;
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
    y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
  };
}

function getAgentPositions(count: number, cx: number, cy: number, radius: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
}

function getClusterCenters(groupCount: number, w: number, h: number): Array<{ cx: number; cy: number; r: number }> {
  const m = Math.min(w, h);
  if (groupCount <= 1) {
    return [{ cx: w / 2, cy: h / 2, r: m * 0.28 }];
  } else if (groupCount === 2) {
    return [
      { cx: w * 0.30, cy: h / 2, r: m * 0.20 },
      { cx: w * 0.70, cy: h / 2, r: m * 0.20 },
    ];
  } else if (groupCount === 3) {
    return [
      { cx: w * 0.50, cy: h * 0.25, r: m * 0.18 },
      { cx: w * 0.22, cy: h * 0.68, r: m * 0.18 },
      { cx: w * 0.78, cy: h * 0.68, r: m * 0.18 },
    ];
  } else {
    // 4+ groups: responsive grid — camera auto-zooms to fit
    const cols = Math.ceil(Math.sqrt(groupCount));
    const rows = Math.ceil(groupCount / cols);
    const r = m * Math.max(0.10, 0.20 - groupCount * 0.012);
    const cellW = w / (cols + 1);
    const cellH = h / (rows + 1);
    return Array.from({ length: groupCount }, (_, i) => ({
      cx: cellW * ((i % cols) + 1),
      cy: cellH * (Math.floor(i / cols) + 1),
      r,
    }));
  }
}

function orbAngularVel(status: string): number {
  switch (status) {
    case 'spawning':      return 0.7;
    case 'thinking':      return 0.5;
    case 'executing':     return 1.1;
    case 'communicating': return 1.6;
    case 'evaluating':    return 0.65;
    case 'complete':      return 0.12;
    default:              return 0.35;
  }
}

function glowAlpha(status: string): number {
  switch (status) {
    case 'spawning':      return 0.18;
    case 'thinking':      return 0.10;
    case 'executing':     return 0.20;
    case 'communicating': return 0.28;
    case 'evaluating':    return 0.14;
    case 'complete':      return 0.05;
    default:              return 0.08;
  }
}

function makeOrbState(initialAction: string): OrbState {
  return {
    angle: Math.random() * Math.PI * 2,
    pulses: [],
    lastPulseSpawn: 0,
    prevAction: '',
    currAction: initialAction,
    actionFade: 1,
    labelIdx: 0,
    labelTimer: Math.random() * 1500,
    thinkLines: [],
    thinkTimer: 100 + Math.random() * 200,
  };
}

// ── Think stream text generation ──────────────────────────────────────────────
function generateThinkLine(specialty: string): string {
  const s = specialty.toLowerCase();
  const h2 = () => Math.floor(Math.random() * 256).toString(16).padStart(2,'0');
  const hex = () => `0x${h2()}${h2()}`;
  const pct = () => (55 + Math.random() * 44).toFixed(2);
  const n   = () => Math.floor(Math.random() * 127 + 1);
  const f4  = () => (Math.random()).toFixed(4);
  const f6  = () => (Math.random() * 0.01).toFixed(6);
  const indent = Math.random() < 0.45;

  const generic = [
    `> token[${n()}] → resolved`,
    `  weight: ${f4}`,
    `> layer_${Math.floor(Math.random()*12+1)}: activated`,
    `  Δ: ${f6}   ok`,
    `> ctx depth=${n()} pass`,
    `  addr: ${hex()}`,
    `> reasoning node [${n()}]`,
    `  conf: ${pct()}%`,
    `> cross-ref: ${n()} links`,
    `  signal_${n()} → emit`,
    `> embed[${n()}] ↔ embed[${n()}]`,
    `  sim: ${(0.5+Math.random()*0.5).toFixed(3)}`,
    `> chain: step ${n()} ok`,
    `  attn head ${Math.floor(Math.random()*8)}: ${f4()}`,
    `> verify: hash ${h2()}${h2()}`,
    `  out: struct_${n()}`,
  ];

  let domain: string[] = [];
  if (s.match(/cardio|heart|arrhyth|rhythm/)) domain = [
    `> ECG: QRS=${(0.08+Math.random()*0.06).toFixed(3)}s`,
    `  HR: ${60+Math.floor(Math.random()*60)} bpm`,
    `> AV node: conduction ok`,
    `  ST-seg: ${(Math.random()*0.2-0.1).toFixed(2)}mV`,
  ];
  else if (s.match(/endo|insulin|glucose|thyroid/)) domain = [
    `> HbA1c: ${(5+Math.random()*4).toFixed(1)}%`,
    `  insulin: ${(Math.random()*30).toFixed(1)} μU/mL`,
    `> TSH: ${(0.5+Math.random()*3).toFixed(2)} mIU/L`,
  ];
  else if (s.match(/secur|vuln|pentest|threat/)) domain = [
    `> CVE scan: active`,
    `  CVSS: ${(5+Math.random()*5).toFixed(1)} HIGH`,
    `> payload: ${hex()}`,
    `  RCE vector: check`,
    `> OWASP A${Math.floor(Math.random()*10+1)}: scan`,
  ];
  else if (s.match(/quantum|qubit|entangle/)) domain = [
    `> |ψ⟩ collapse: ok`,
    `  qubit[${n()}]: |0⟩→|1⟩`,
    `> Bell state: Φ+`,
    `  fidelity: ${(0.9+Math.random()*0.099).toFixed(4)}`,
  ];
  else if (s.match(/ml|neural|model|learn|ai/)) domain = [
    `> ∇loss: ${f6()}`,
    `  epoch ${n()} / 200`,
    `> F1: ${(0.7+Math.random()*0.29).toFixed(3)}`,
    `  batch: ${n()*4} samples`,
  ];
  else if (s.match(/code|program|develop|software/)) domain = [
    `> AST: ${n()} nodes`,
    `  lint: ${Math.floor(Math.random()*3)} warn`,
    `> CFG: edge[${n()}] ok`,
    `  test coverage: ${pct()}%`,
  ];
  else if (s.match(/research|analys|synthes/)) domain = [
    `> p-val: ${(Math.random()*0.05).toFixed(4)}`,
    `  CI 95%: [${f4},${f4}]`,
    `> Cohen d: ${(Math.random()*1.2).toFixed(3)}`,
  ];
  else if (s.match(/file|folder|director|system/)) domain = [
    `> stat: ${hex()}`,
    `  inode: ${n()} ok`,
    `> write: ${n()*512}B`,
    `  fsync ok`,
  ];

  const pool = indent
    ? [...generic.filter(l => l.startsWith('  ')), ...domain.filter(l => l.startsWith('  '))]
    : [...generic.filter(l => l.startsWith('>')), ...domain.filter(l => l.startsWith('>'))];

  const all = pool.length > 0 ? pool : [...generic, ...domain];
  return all[Math.floor(Math.random() * all.length)];
}

// ── Module-level orb draw ──────────────────────────────────────────────────────
function drawOrbAgent(
  ctx: CanvasRenderingContext2D,
  va: VisAgent,
  now: number,
  dt: number,
  orb: OrbState,
  canvasCx: number,
  taskActive: boolean,
) {
  // Treat agent as complete (visually frozen) when task is done
  const effectiveStatus = (!taskActive || va.status === 'complete') ? 'complete' : va.status;
  const { x, y, radius, colorRgb: [r, g, b], spawnProgress, confidence } = va;
  const status = effectiveStatus;
  const sp = easeOutCubic(spawnProgress);
  const R  = radius * sp;
  if (R < 1) return;

  // ── Update orb rotation ────────────────────────────────────────────────────
  orb.angle += dt * 0.00055 * orbAngularVel(status);

  // ── Spawn surface pulses ───────────────────────────────────────────────────
  const pInterval = status === 'communicating' ? 650 : status === 'executing' ? 900 : 1700;
  if (now - orb.lastPulseSpawn > pInterval && sp > 0.55) {
    orb.lastPulseSpawn = now;
    orb.pulses.push({
      ringIdx: Math.floor(Math.random() * ORB_RINGS.length),
      phase:   Math.random() * Math.PI * 2,
      speed:   (0.7 + Math.random() * 1.1) * (Math.random() > 0.5 ? 1 : -1),
      life:    1.0,
      glow:    0.55 + Math.random() * 0.45,
    });
  }
  // Update / prune pulses
  for (const p of orb.pulses) {
    p.phase += dt * 0.0022 * p.speed;
    p.life  -= dt * 0.00048;
  }
  orb.pulses = orb.pulses.filter(p => p.life > 0);

  // ── Update action text crossfade ───────────────────────────────────────────
  if (va.currentAction !== orb.currAction) {
    orb.prevAction = orb.currAction;
    orb.currAction = va.currentAction;
    orb.actionFade = 0;
  }
  if (orb.actionFade < 1) orb.actionFade = Math.min(1, orb.actionFade + dt * 0.0032);

  // ── Update domain label cycling ────────────────────────────────────────────
  if (ACTIVE_STATUSES.has(status)) {
    orb.labelTimer += dt;
    if (orb.labelTimer > 1600) {
      orb.labelTimer -= 1600;
      const labels = getDomainLabels(va.specialty);
      orb.labelIdx = (orb.labelIdx + 1) % labels.length;
    }
  }

  // ── Update think stream ────────────────────────────────────────────────────
  if (ACTIVE_STATUSES.has(status) && sp > 0.6) {
    orb.thinkTimer -= dt;
    if (orb.thinkTimer <= 0) {
      orb.thinkTimer = 180 + Math.random() * 270;
      const text = generateThinkLine(va.specialty);
      orb.thinkLines.push({ text, chars: 0, maxChars: text.length, age: 0 });
      if (orb.thinkLines.length > 9) orb.thinkLines.shift();
    }
    for (const line of orb.thinkLines) {
      line.age += dt;
      // typewriter: ~50 chars/second
      if (line.chars < line.maxChars) line.chars = Math.min(line.maxChars, line.chars + dt * 0.052);
    }
  }

  // ── Ambient outer glow ─────────────────────────────────────────────────────
  const gA = glowAlpha(status) * sp;
  const ambG = ctx.createRadialGradient(x, y, R * 0.2, x, y, R * 3.8);
  ambG.addColorStop(0,   `rgba(${r},${g},${b},${gA * 0.9})`);
  ambG.addColorStop(0.45,`rgba(${r},${g},${b},${gA * 0.35})`);
  ambG.addColorStop(1,   `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = ambG;
  ctx.beginPath(); ctx.arc(x, y, R * 3.8, 0, Math.PI * 2); ctx.fill();

  // ── Sphere rim light (subtle edge highlight) ───────────────────────────────
  const rimG = ctx.createRadialGradient(x - R * 0.15, y - R * 0.15, R * 0.55, x, y, R * 1.08);
  rimG.addColorStop(0,    `rgba(${r},${g},${b},0)`);
  rimG.addColorStop(0.82, `rgba(${r},${g},${b},${0.03 * sp})`);
  rimG.addColorStop(1,    `rgba(${r},${g},${b},${0.12 * sp})`);
  ctx.fillStyle = rimG;
  ctx.beginPath(); ctx.arc(x, y, R * 1.08, 0, Math.PI * 2); ctx.fill();

  // ── Project & collect all dots ─────────────────────────────────────────────
  type DotEntry = { px: number; py: number; depth: number; size: number; alpha: number; ri: number };
  const allDots: DotEntry[] = [];

  for (let ri = 0; ri < ORB_RINGS.length; ri++) {
    const ring  = ORB_RINGS[ri];
    const latR  = (ring.latDeg * Math.PI) / 180;
    const cosL  = Math.cos(latR);
    const sinL  = Math.sin(latR);

    for (let di = 0; di < ring.count; di++) {
      const ang = (di / ring.count) * Math.PI * 2 + orb.angle * ring.speedMult;

      // Sphere surface → 3D
      const x3 = cosL * Math.cos(ang);
      const y3 = sinL;
      const z3 = cosL * Math.sin(ang);

      // Apply X-tilt
      const y3t = y3 * COS_T - z3 * SIN_T;
      const z3t = y3 * SIN_T + z3 * COS_T;

      const depth = (z3t + 1) / 2; // 0=back, 1=front

      // Pulse proximity boost
      let pulseBoost = 0;
      for (const p of orb.pulses) {
        if (p.ringIdx !== ri) continue;
        const dotAng = (di / ring.count) * Math.PI * 2;
        let diff = Math.abs((p.phase % (Math.PI * 2)) - dotAng);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 1.1) {
          pulseBoost = Math.max(pulseBoost, p.life * p.glow * (1 - diff / 1.1));
        }
      }

      const depthF = 0.25 + depth * 0.75;
      allDots.push({
        px: x + x3 * R,
        py: y - y3t * R,
        depth,
        size:  ring.baseSize * depthF * sp + pulseBoost * 2.8,
        alpha: Math.min(1, depthF * sp + pulseBoost * 0.55),
        ri,
      });
    }
  }

  // Sort back → front
  allDots.sort((a, b) => a.depth - b.depth);

  // ── Draw dots ─────────────────────────────────────────────────────────────
  for (const dot of allDots) {
    if (dot.size < 0.25) continue;
    const { px, py, depth, size, alpha } = dot;

    // Soft glow halo (only for sufficiently visible dots)
    if (depth > 0.25 && size > 0.9) {
      const dg = ctx.createRadialGradient(px, py, 0, px, py, size * 4.2);
      dg.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.28})`);
      dg.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(px, py, size * 4.2, 0, Math.PI * 2); ctx.fill();
    }

    // Core dot
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fill();

    // Specular highlight (front-facing dots)
    if (depth > 0.62) {
      const hiA = ((depth - 0.62) / 0.38) * alpha * 0.55;
      ctx.fillStyle = `rgba(255,255,255,${hiA})`;
      ctx.beginPath();
      ctx.arc(px - size * 0.28, py - size * 0.32, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Neural mesh threads (inter-ring connections on front hemisphere) ────────
  const frontDots = allDots.filter(d => d.depth > 0.52);
  ctx.save();
  ctx.setLineDash([]);
  for (let i = 0; i < frontDots.length; i++) {
    for (let j = i + 1; j < frontDots.length; j++) {
      const a = frontDots[i], b = frontDots[j];
      if (a.ri === b.ri) continue; // same ring — skip
      const dx = a.px - b.px, dy = a.py - b.py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxD = R * 0.7;
      if (dist > maxD) continue;
      const threadA = (1 - dist / maxD) * Math.min(a.depth, b.depth) * 0.14 * sp;
      ctx.globalAlpha = threadA;
      ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
      ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
    }
  }
  ctx.restore();

  // ── Confidence arc (bottom) ───────────────────────────────────────────────
  if (sp > 0.7) {
    ctx.save(); ctx.globalAlpha = 0.55 * sp;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.setLineDash([]);
    const startA = Math.PI * 0.2, endA = Math.PI * 0.8;
    const confA  = startA + (endA - startA) * confidence;
    ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
    ctx.beginPath(); ctx.arc(x, y, R + 13, startA, endA); ctx.stroke();
    ctx.strokeStyle = `rgba(${r},${g},${b},0.72)`;
    ctx.beginPath(); ctx.arc(x, y, R + 13, startA, confA); ctx.stroke();
    ctx.restore();
  }

  // ── Text labels ──────────────────────────────────────────────────────────
  if (sp > 0.45) {
    const labelAlpha = Math.min(1, (sp - 0.45) * 2.2);
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.setLineDash([]);

    const baseY = y + R + 15;

    // Agent name
    ctx.globalAlpha = labelAlpha;
    ctx.fillStyle   = '#f1f5f9';
    ctx.font        = '500 11px Inter, sans-serif';
    ctx.fillText(va.name, x, baseY);

    // Current action text with crossfade
    const currTxt = orb.currAction.length > 36 ? orb.currAction.slice(0, 36) + '…' : orb.currAction;
    const prevTxt = orb.prevAction.length > 36 ? orb.prevAction.slice(0, 36) + '…' : orb.prevAction;
    const fade    = orb.actionFade;

    ctx.font = '400 8.5px Inter, sans-serif';

    if (fade < 1 && prevTxt) {
      ctx.globalAlpha = labelAlpha * (1 - fade) * 0.65;
      ctx.fillStyle   = 'rgba(148,163,184,0.8)';
      ctx.fillText(prevTxt, x, baseY + 14);
    }
    ctx.globalAlpha = labelAlpha * (0.25 + fade * 0.55);
    ctx.fillStyle   = 'rgba(148,163,184,0.85)';
    ctx.fillText(currTxt, x, baseY + 14);

    // Pulsing active indicator dot
    if (ACTIVE_STATUSES.has(status) && fade > 0.5) {
      const dotP = (Math.sin(now * 0.0042) * 0.5 + 0.5);
      ctx.globalAlpha = labelAlpha * (0.45 + dotP * 0.55);
      ctx.fillStyle   = statusColor(status);
      const tw = ctx.measureText(currTxt).width;
      ctx.beginPath(); ctx.arc(x - tw / 2 - 7, baseY + 18.5, 2.2, 0, Math.PI * 2); ctx.fill();
    }

    // ── QA status badge ──────────────────────────────────────────────────────
    if (va.qaStatus === 'rerunning') {
      const pulse = 0.6 + Math.sin(now * 0.006) * 0.4;
      ctx.globalAlpha = labelAlpha * pulse;
      ctx.fillStyle   = '#f59e0b';
      ctx.font        = '500 8px Inter, sans-serif';
      ctx.fillText('↻ QA re-running', x, baseY + 26);
    } else if (va.qaStatus === 'resolved') {
      ctx.globalAlpha = labelAlpha * 0.75;
      ctx.fillStyle   = '#10b981';
      ctx.font        = '500 8px Inter, sans-serif';
      ctx.fillText('✓ QA resolved', x, baseY + 26);
    } else if (va.qaStatus === 'unresolved') {
      ctx.globalAlpha = labelAlpha * 0.7;
      ctx.fillStyle   = '#f43f5e';
      ctx.font        = '500 8px Inter, sans-serif';
      ctx.fillText('⚠ QA unresolved', x, baseY + 26);
    }

    // ── Think stream (side column) ───────────────────────────────────────────
    if (orb.thinkLines.length > 0 && sp > 0.6) {
      const streamW   = 148;
      // Side: use the agent's stored canvas x to decide left vs right
      // We receive `x` from va.x which is in canvas CSS-pixel space
      // Place stream on the side away from center (cx not available here — use sign of orb pulse offset as proxy)
      // We'll pick side based on whether x is left or right half; `now` gives us canvas via closure — not available.
      // Instead pass a `canvasCx` — actually we can infer nothing; just always use right, clip handled by CSS overflow hidden.
      // Better: stagger: alternate per-agent. Use orb.labelIdx parity. Actually simplest: always right side.
      // Place stream outward — away from centre of the agent circle
      // Left-side agents → stream goes left; right-side + top/bottom → stream goes right
      const onLeft = x < canvasCx - 30;
      const STREAM_SIDE_X = onLeft ? x - R - 14 - 148 : x + R + 14;
      const STREAM_TOP_Y  = y - R * 0.7;
      const LINE_H        = 10.5;
      const MAX_LINES     = 9;
      const visLines = orb.thinkLines.slice(-MAX_LINES);

      ctx.font = '7px "SF Mono","Fira Code","Courier New",monospace';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';

      visLines.forEach((line, i) => {
        const rank    = i / Math.max(1, visLines.length - 1); // 0=oldest, 1=newest
        // Fade: newest line fully visible, oldest nearly invisible
        const ageFade = Math.min(1, line.age / 120);   // fade-in first 120ms
        const rankFade = 0.08 + rank * 0.92;            // old lines dim
        const alpha    = labelAlpha * ageFade * rankFade * (line.text.startsWith('>') ? 0.55 : 0.38);

        ctx.globalAlpha = alpha;
        // Color: agent color for '>' lines, dimmer white for indented values
        if (line.text.startsWith('>')) {
          ctx.fillStyle = `rgba(${r},${g},${b},1)`;
        } else {
          ctx.fillStyle = 'rgba(180,200,230,1)';
        }

        const visText = line.text.slice(0, Math.floor(line.chars));
        // Blinking cursor on the currently typing line (newest)
        const isNewest = i === visLines.length - 1;
        const cursor   = isNewest && line.chars < line.maxChars
          ? (Math.floor(now / 220) % 2 === 0 ? '▋' : '')
          : '';
        ctx.fillText(visText + cursor, STREAM_SIDE_X, STREAM_TOP_Y + i * LINE_H);
      });
    }

    ctx.restore();
  }
}

export default function AgentCanvas({ agents, communications, phase, isActive, agentGroups, relationships }: Props) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const rafRef        = useRef<number>(0);
  const visAgentsRef  = useRef<Map<string, VisAgent>>(new Map());
  const orbStatesRef  = useRef<Map<string, OrbState>>(new Map());
  const particlesRef  = useRef<Particle[]>([]);
  const starsRef      = useRef<Star[]>([]);
  const pingRingsRef  = useRef<PingRing[]>([]);
  const lastPingRef    = useRef<Map<string, number>>(new Map());
  const lastTimeRef    = useRef<number>(0);
  const phaseRef       = useRef<OrchestratorPhase>(phase);
  const isActiveRef    = useRef(isActive);
  const flowBeamsRef   = useRef<FlowBeam[]>([]);
  const lastFlowRef    = useRef<number>(0);
  // Store agents for use in resize handler (avoids closure capture issues)
  const agentsRef      = useRef<Agent[]>(agents);
  // Cluster centers by groupId for bridge drawing
  const clusterCentersRef = useRef<Map<string, { cx: number; cy: number; r: number }>>(new Map());
  // Keep relationships in a ref for the draw loop
  const relationshipsRef = useRef(relationships);
  // groupId → supergroupId (union-find result)
  const supergroupRef = useRef<Map<string, string>>(new Map());
  // Camera: current (interpolated) and target
  const cameraRef       = useRef({ x: 0, y: 0, scale: 1 });
  const targetCameraRef = useRef({ x: 0, y: 0, scale: 1 });
  // Drag / pinch state for user pan+zoom
  const isDraggingRef   = useRef(false);
  const dragStartRef    = useRef({ x: 0, y: 0, camX: 0, camY: 0 });
  const pinchRef        = useRef<{ dist: number; midX: number; midY: number } | null>(null);

  // Keep comms for labelling, but flow animation is driven autonomously in the RAF loop
  const commsRef = useRef<ActiveCommunication[]>([]);
  useLayoutEffect(() => { commsRef.current = communications; }, [communications]);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { agentsRef.current = agents; }, [agents]);
  useEffect(() => { relationshipsRef.current = relationships; }, [relationships]);

  // ── Sync agents → visAgents (group-aware, supergroup-clustered) ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    // Group agents by groupId (or 'default')
    const groupMap = new Map<string, Agent[]>();
    for (const agent of agents) {
      const gid = agent.groupId ?? 'default';
      if (!groupMap.has(gid)) groupMap.set(gid, []);
      groupMap.get(gid)!.push(agent);
    }

    const uniqueGroups = Array.from(groupMap.keys());

    // Build supergroups: merged related groups share one cluster center
    const rels = relationshipsRef.current ?? [];
    const groupToSuper = buildGroupToSuper(uniqueGroups, rels);
    supergroupRef.current = groupToSuper;

    // Unique supergroup IDs determine how many clusters to draw
    const uniqueSupergroups = [...new Set(Array.from(groupToSuper.values()))];
    const centers = getClusterCenters(uniqueSupergroups.length, w, h);

    // Map supergroupId → cluster center
    const superCenters = new Map<string, { cx: number; cy: number; r: number }>(
      uniqueSupergroups.map((sg, i) => [sg, centers[i] ?? centers[0]])
    );

    // Each group gets the center of its supergroup, stored for bridge drawing
    clusterCentersRef.current = new Map(
      uniqueGroups.map(gid => [gid, superCenters.get(groupToSuper.get(gid)!)!])
    );

    // Auto-fit camera to show all clusters whenever the constellation changes
    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;
    const allCenters = Array.from(superCenters.values());
    const fit = computeFitCamera(allCenters, cw, ch);
    // Only animate to fit if we're not in the middle of a user-initiated pan/zoom
    if (!isDraggingRef.current && !pinchRef.current) {
      targetCameraRef.current = fit;
    }

    // Position agents within their supergroup cluster
    // Agents from multiple merged groups share the same pool of positions
    const supergroupAgents = new Map<string, Array<{ agent: Agent; gid: string }>>();
    for (const [gid, groupAgents] of groupMap.entries()) {
      const sg = groupToSuper.get(gid)!;
      if (!supergroupAgents.has(sg)) supergroupAgents.set(sg, []);
      for (const a of groupAgents) supergroupAgents.get(sg)!.push({ agent: a, gid });
    }

    for (const [sg, entries] of supergroupAgents.entries()) {
      const center = superCenters.get(sg)!;
      const positions = getAgentPositions(entries.length, center.cx, center.cy, center.r);

      entries.forEach(({ agent, gid }, i) => {
        const visKey = `${gid}:${agent.id}`;
        const existing = visAgentsRef.current.get(visKey);
        const pos = positions[i];
        if (existing) {
          existing.targetX       = pos.x;
          existing.targetY       = pos.y;
          existing.status        = agent.status;
          existing.currentAction = agent.currentAction;
          existing.confidence    = agent.confidence;
          existing.evaluationScore = agent.evaluationScore;
          existing.qaStatus      = agent.qaStatus;
          existing.name          = agent.name;
          existing.specialty     = agent.specialty;
          existing.color         = agent.color;
          existing.colorRgb      = hexToRgb(agent.color);
          existing.groupId       = gid === 'default' ? undefined : gid;
          if (existing.spawnProgress < 1)
            existing.spawnProgress = Math.min(existing.spawnProgress + 0.05, 1);
        } else {
          visAgentsRef.current.set(visKey, {
            id: visKey, x: pos.x, y: pos.y,
            targetX: pos.x, targetY: pos.y,
            radius: 26, color: agent.color,
            colorRgb: hexToRgb(agent.color),
            pulsePhase: Math.random() * Math.PI * 2,
            spawnProgress: 0.01,
            name: agent.name, specialty: agent.specialty,
            status: agent.status, currentAction: agent.currentAction,
            confidence: agent.confidence, evaluationScore: agent.evaluationScore,
            qaStatus: agent.qaStatus,
            groupId: gid === 'default' ? undefined : gid,
          });
          orbStatesRef.current.set(visKey, makeOrbState(agent.currentAction));
        }
      });
    }

    // Remove dissolved agents (agents no longer in the prop list)
    const validKeys = new Set<string>();
    for (const agent of agents) {
      validKeys.add(`${agent.groupId ?? 'default'}:${agent.id}`);
    }
    for (const key of visAgentsRef.current.keys()) {
      if (!validKeys.has(key)) {
        visAgentsRef.current.delete(key);
        orbStatesRef.current.delete(key);
      }
    }
  }, [agents, relationships]);

  // ── Background ────────────────────────────────────────────────────────────────
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w * 0.5);
    grad.addColorStop(0, 'rgba(99,102,241,0.04)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    for (const s of starsRef.current) {
      ctx.globalAlpha = s.opacity;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }, []);


  // ── Bridge lines between distinct (non-merged) related supergroups ───────────
  const drawGroupBridges = useCallback((ctx: CanvasRenderingContext2D, now: number) => {
    const rels = relationshipsRef.current;
    if (!rels || rels.length === 0) return;
    const supergroup = supergroupRef.current;
    ctx.save();
    const drawnPairs = new Set<string>();
    for (const rel of rels) {
      if (rel.merged) continue; // merged groups share a cluster — no bridge needed
      if (rel.strength <= 0.08) continue;
      // Get supergroup IDs for both sides
      const sgA = supergroup.get(rel.groupAId) ?? rel.groupAId;
      const sgB = supergroup.get(rel.groupBId) ?? rel.groupBId;
      if (sgA === sgB) continue; // already in same cluster after merging
      const pairKey = [sgA, sgB].sort().join('|');
      if (drawnPairs.has(pairKey)) continue;
      drawnPairs.add(pairKey);

      const centerA = clusterCentersRef.current.get(rel.groupAId);
      const centerB = clusterCentersRef.current.get(rel.groupBId);
      if (!centerA || !centerB) continue;
      // Don't draw if both centers are the same point (shouldn't happen but safety check)
      if (centerA.cx === centerB.cx && centerA.cy === centerB.cy) continue;

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(centerA.cx, centerA.cy);
      ctx.lineTo(centerB.cx, centerB.cy);
      ctx.strokeStyle = `rgba(99,102,241,${rel.strength * 0.40})`;
      ctx.lineWidth = 0.9;
      ctx.setLineDash([4, 10]);
      ctx.lineDashOffset = -(now * 0.02);
      ctx.stroke();

      // Small dot at midpoint for strong bridge relationships
      if (rel.strength > 0.15) {
        const mx = (centerA.cx + centerB.cx) / 2;
        const my = (centerA.cy + centerB.cy) / 2;
        ctx.globalAlpha = rel.strength * 0.7;
        ctx.fillStyle = 'rgba(129,140,248,1)';
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.setLineDash([]);
        ctx.fillText('●', mx, my);
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }, []);

  // ── Static mesh — only within same supergroup ─────────────────────────────
  const drawMesh = useCallback((ctx: CanvasRenderingContext2D, vas: VisAgent[]) => {
    if (vas.length < 2) return;
    const supergroup = supergroupRef.current;
    ctx.save();
    ctx.setLineDash([]);
    for (let i = 0; i < vas.length; i++) {
      for (let j = i + 1; j < vas.length; j++) {
        const a = vas[i], b = vas[j];
        // Only draw mesh within the same supergroup
        const sgA = supergroup.get(a.groupId ?? 'default') ?? (a.groupId ?? 'default');
        const sgB = supergroup.get(b.groupId ?? 'default') ?? (b.groupId ?? 'default');
        if (sgA !== sgB) continue;
        const sp = Math.min(a.spawnProgress, b.spawnProgress);
        if (sp < 0.1) continue;
        // Gradient line from a's color to b's color
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, `rgba(${a.colorRgb[0]},${a.colorRgb[1]},${a.colorRgb[2]},${sp * 0.18})`);
        grad.addColorStop(1, `rgba(${b.colorRgb[0]},${b.colorRgb[1]},${b.colorRgb[2]},${sp * 0.18})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.7;
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.restore();
  }, []);

  // ── Directed flow beams ───────────────────────────────────────────────────────
  // Spawned autonomously in the draw loop — zero React prop dependency
  const drawFlowBeams = useCallback((ctx: CanvasRenderingContext2D, vas: VisAgent[], now: number) => {
    if (vas.length < 2 || !isActiveRef.current) return;

    // Spawn a new flow beam periodically
    const spawnInterval = 1400 + Math.random() * 800;
    if (now - lastFlowRef.current > spawnInterval) {
      lastFlowRef.current = now;
      const supergroup = supergroupRef.current;
      const rels = relationshipsRef.current ?? [];
      const active = vas.filter(v => ACTIVE_STATUSES.has(v.status) && v.spawnProgress > 0.8);
      if (active.length >= 2) {
        const fi = Math.floor(Math.random() * active.length);
        const fromAgent = active[fi];
        const sgFrom = supergroup.get(fromAgent.groupId ?? 'default') ?? (fromAgent.groupId ?? 'default');

        // 85% chance: beam within same supergroup; 15% chance: beam to a bridge-related supergroup
        const useBridge = Math.random() < 0.15 && rels.some(r => !r.merged && r.strength > 0.1);
        const candidates = active.filter((v, idx) => {
          if (idx === fi) return false;
          const sgV = supergroup.get(v.groupId ?? 'default') ?? (v.groupId ?? 'default');
          if (useBridge) {
            // Cross-cluster beam: target must be in a bridge-related supergroup
            if (sgV === sgFrom) return false;
            const gidV = v.groupId ?? 'default';
            const gidFrom = fromAgent.groupId ?? 'default';
            return rels.some(r => !r.merged && r.strength > 0.1 &&
              ((r.groupAId === gidFrom && r.groupBId === gidV) ||
               (r.groupBId === gidFrom && r.groupAId === gidV) ||
               (supergroup.get(r.groupAId) === sgFrom && supergroup.get(r.groupBId) === sgV) ||
               (supergroup.get(r.groupBId) === sgFrom && supergroup.get(r.groupAId) === sgV)));
          }
          return sgV === sgFrom; // within same supergroup
        });

        if (candidates.length > 0) {
          const ti = Math.floor(Math.random() * candidates.length);
          flowBeamsRef.current.push({
            id: `beam-${now}-${Math.random()}`,
            fromId: fromAgent.id,
            toId:   candidates[ti].id,
            startTime: now,
            duration:  1200 + Math.random() * 600,
          });
        }
      }
    }

    // Prune expired beams
    flowBeamsRef.current = flowBeamsRef.current.filter(b => now - b.startTime < b.duration + 300);

    // Draw each beam
    for (const beam of flowBeamsRef.current) {
      const from = visAgentsRef.current.get(beam.fromId);
      const to   = visAgentsRef.current.get(beam.toId);
      if (!from || !to) continue;

      const elapsed  = now - beam.startTime;
      const progress = Math.min(1, elapsed / beam.duration);

      // Fade in / hold / fade out
      let alpha: number;
      if      (progress < 0.08) alpha = progress / 0.08;
      else if (progress < 0.75) alpha = 1;
      else                      alpha = 1 - (progress - 0.75) / 0.25;
      if (alpha <= 0) continue;

      const [r, g, b] = from.colorRgb;
      const dx  = to.x - from.x, dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      // Curve control point — offset perpendicular
      const off = Math.min(len * 0.35, 70);
      const cpx = (from.x + to.x) / 2 - (dy / len) * off;
      const cpy = (from.y + to.y) / 2 + (dx / len) * off;

      const path = () => {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cpx, cpy, to.x, to.y);
      };

      // Outer glow
      ctx.save(); ctx.globalAlpha = alpha * 0.10;
      ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
      ctx.lineWidth = 18; ctx.lineCap = 'round'; ctx.setLineDash([]);
      path(); ctx.stroke(); ctx.restore();

      // Mid glow
      ctx.save(); ctx.globalAlpha = alpha * 0.22;
      ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
      ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.setLineDash([]);
      path(); ctx.stroke(); ctx.restore();

      // Core line
      ctx.save(); ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
      ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.setLineDash([]);
      path(); ctx.stroke(); ctx.restore();

      // White spine
      ctx.save(); ctx.globalAlpha = alpha * 0.45;
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.lineWidth = 0.5; ctx.lineCap = 'round'; ctx.setLineDash([]);
      path(); ctx.stroke(); ctx.restore();

      // Traveling bright dot (direction indicator)
      const dotT  = (elapsed / beam.duration) % 1;
      const u     = 1 - dotT;
      const dotX  = u * u * from.x + 2 * u * dotT * cpx + dotT * dotT * to.x;
      const dotY  = u * u * from.y + 2 * u * dotT * cpy + dotT * dotT * to.y;
      // Halo around dot
      const halo = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 10);
      halo.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.9})`);
      halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(dotX, dotY, 10, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // Bright core dot
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgba(255,255,255,0.95)`;
      ctx.beginPath(); ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();

      // Arrowhead at destination end of beam (drawn when dot is near the end)
      if (dotT > 0.75) {
        const aT = 0.98, bT = 0.94;
        const ua = 1 - aT, ub = 1 - bT;
        const ax = ua*ua*from.x + 2*ua*aT*cpx + aT*aT*to.x;
        const ay = ua*ua*from.y + 2*ua*aT*cpy + aT*aT*to.y;
        const bx = ub*ub*from.x + 2*ub*bT*cpx + bT*bT*to.x;
        const by = ub*ub*from.y + 2*ub*bT*cpy + bT*bT*to.y;
        const angle = Math.atan2(ay - by, ax - bx);
        const arrowAlpha = alpha * ((dotT - 0.75) / 0.25); // fade in as dot arrives
        ctx.save();
        ctx.globalAlpha = arrowAlpha;
        ctx.fillStyle   = `rgba(${r},${g},${b},1)`;
        ctx.translate(ax, ay); ctx.rotate(angle);
        ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(-4,3.5); ctx.lineTo(-2,0); ctx.lineTo(-4,-3.5);
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
  }, []);

  // ── Sonar ping rings ──────────────────────────────────────────────────────────
  const drawPingRings = useCallback((ctx: CanvasRenderingContext2D, dt: number) => {
    ctx.save(); ctx.setLineDash([]);
    for (const p of pingRingsRef.current) {
      p.age += dt;
      const t = Math.min(1, p.age / p.maxAge);
      const rr = p.startR + (p.maxR - p.startR) * easeOutCubic(t);
      const opacity = t < 0.2 ? 1 : 1 - (t - 0.2) / 0.8;
      const [pr, pg, pb] = p.color;
      ctx.globalAlpha = opacity * 0.30;
      ctx.strokeStyle = `rgba(${pr},${pg},${pb},1)`;
      ctx.lineWidth = 1.0;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    pingRingsRef.current = pingRingsRef.current.filter(p => p.age < p.maxAge);
  }, []);

  // ── Main draw loop ────────────────────────────────────────────────────────────
  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = Math.min(now - lastTimeRef.current, 50); // cap dt to avoid jumps
    lastTimeRef.current = now;

    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    const cx  = w / 2; // world-space canvas centre (used by drawOrbAgent for label placement)

    // Lerp camera toward target
    const cam = cameraRef.current;
    const tgt = targetCameraRef.current;
    const CL  = 0.072;
    cam.x     += (tgt.x     - cam.x)     * CL;
    cam.y     += (tgt.y     - cam.y)     * CL;
    cam.scale += (tgt.scale - cam.scale) * CL;

    // Drift stars (screen-space, before camera transform)
    for (const s of starsRef.current) s.x = (s.x + s.drift * 0.05) % w;

    // Advance agents (world-space positions)
    for (const va of visAgentsRef.current.values()) {
      if (va.spawnProgress < 1) va.spawnProgress = Math.min(1, va.spawnProgress + dt * 0.002);
      va.x = lerp(va.x, va.targetX, 0.08);
      va.y = lerp(va.y, va.targetY, 0.08);
    }

    // Spawn sonar ping rings for active agents (not when task is complete)
    for (const va of visAgentsRef.current.values()) {
      if (!isActiveRef.current || !ACTIVE_STATUSES.has(va.status) || va.spawnProgress < 0.85) continue;
      const lastPing     = lastPingRef.current.get(va.id) ?? 0;
      const pingInterval = va.status === 'communicating' ? 900 : 1800;
      if (now - lastPing > pingInterval) {
        lastPingRef.current.set(va.id, now);
        const cr = va.radius * easeOutCubic(va.spawnProgress);
        pingRingsRef.current.push({
          id: `ping-${Math.random()}`,
          x: va.x, y: va.y,
          startR: cr + 2, maxR: cr + 52,
          color: va.colorRgb,
          age: 0, maxAge: 1500,
        });
      }
    }

    // Reset to DPR transform, then clear
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background: screen-space (no camera), fills the whole canvas
    drawBackground(ctx, w, h);

    // World-space content: everything inside the camera transform
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.scale, cam.scale);

    drawGroupBridges(ctx, now);

    const vas = Array.from(visAgentsRef.current.values());
    drawMesh(ctx, vas);
    drawPingRings(ctx, dt);

    for (const va of vas) {
      let orb = orbStatesRef.current.get(va.id);
      if (!orb) {
        orb = makeOrbState(va.currentAction);
        orbStatesRef.current.set(va.id, orb);
      }
      drawOrbAgent(ctx, va, now, dt, orb, cx, isActiveRef.current);
    }

    drawFlowBeams(ctx, vas, now);

    ctx.restore();

    // Screen-space overlays (idle / analyzing)
    if (!isActiveRef.current) {
      drawIdleState(ctx, w, h, now);
    } else if (phaseRef.current === 'analyzing') {
      drawAnalyzingRing(ctx, w, h, now);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [drawBackground, drawGroupBridges, drawMesh, drawPingRings, drawFlowBeams]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Non-null for use in closures (TypeScript can't narrow across closure boundaries)
    const cv = canvas as HTMLCanvasElement;

    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      // Re-group agents by groupId and recompute cluster positions (supergroup-aware)
      if (visAgentsRef.current.size > 0) {
        const currentAgents = agentsRef.current;
        const groupMap = new Map<string, Agent[]>();
        for (const agent of currentAgents) {
          const gid = agent.groupId ?? 'default';
          if (!groupMap.has(gid)) groupMap.set(gid, []);
          groupMap.get(gid)!.push(agent);
        }

        const uniqueGroups = Array.from(groupMap.keys());
        const rels = relationshipsRef.current ?? [];
        const groupToSuper = buildGroupToSuper(uniqueGroups, rels);
        supergroupRef.current = groupToSuper;

        const uniqueSupergroups = [...new Set(Array.from(groupToSuper.values()))];
        const centers = getClusterCenters(uniqueSupergroups.length, w, h);
        const superCenters = new Map<string, { cx: number; cy: number; r: number }>(
          uniqueSupergroups.map((sg, i) => [sg, centers[i] ?? centers[0]])
        );
        clusterCentersRef.current = new Map(
          uniqueGroups.map(gid => [gid, superCenters.get(groupToSuper.get(gid)!)!])
        );

        // Reposition visAgents by supergroup
        const supergroupAgents = new Map<string, Array<{ agent: Agent; gid: string }>>();
        for (const [gid, groupAgents] of groupMap.entries()) {
          const sg = groupToSuper.get(gid)!;
          if (!supergroupAgents.has(sg)) supergroupAgents.set(sg, []);
          for (const a of groupAgents) supergroupAgents.get(sg)!.push({ agent: a, gid });
        }

        for (const [sg, entries] of supergroupAgents.entries()) {
          const center = superCenters.get(sg)!;
          const positions = getAgentPositions(entries.length, center.cx, center.cy, center.r);
          entries.forEach(({ agent, gid }, i) => {
            const visKey = `${gid}:${agent.id}`;
            const va = visAgentsRef.current.get(visKey);
            if (va) { va.targetX = positions[i].x; va.targetY = positions[i].y; }
          });
        }
      }

      starsRef.current = Array.from({ length: 120 }, () => ({
        x:       Math.random() * canvas.offsetWidth,
        y:       Math.random() * canvas.offsetHeight,
        size:    Math.random() * 1.2,
        opacity: Math.random() * 0.4 + 0.05,
        drift:   Math.random() * 0.3 - 0.15,
      }));

      // Re-fit camera on resize (only if user isn't manually panning/zooming)
      if (!isDraggingRef.current && !pinchRef.current) {
        const allCenters = Array.from(
          new Set(Array.from(clusterCentersRef.current.values()))
        );
        if (allCenters.length > 0) {
          const fit = computeFitCamera(allCenters, w, h);
          targetCameraRef.current = fit;
          cameraRef.current = { ...fit }; // snap immediately on resize (no lerp)
        }
      }
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    rafRef.current = requestAnimationFrame(draw);

    // ── Zoom (mouse wheel) ────────────────────────────────────────────────────
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const tgt    = targetCameraRef.current;
      const ns     = Math.max(0.15, Math.min(2.5, tgt.scale * factor));
      tgt.x     = mx - (mx - tgt.x) * (ns / tgt.scale);
      tgt.y     = my - (my - tgt.y) * (ns / tgt.scale);
      tgt.scale = ns;
    }

    // ── Pan (pointer drag) ────────────────────────────────────────────────────
    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      isDraggingRef.current = true;
      cv.setPointerCapture(e.pointerId);
      dragStartRef.current = {
        x: e.clientX, y: e.clientY,
        camX: targetCameraRef.current.x, camY: targetCameraRef.current.y,
      };
      cv.style.cursor = 'grabbing';
    }
    function onPointerMove(e: PointerEvent) {
      if (!isDraggingRef.current) return;
      targetCameraRef.current.x = dragStartRef.current.camX + (e.clientX - dragStartRef.current.x);
      targetCameraRef.current.y = dragStartRef.current.camY + (e.clientY - dragStartRef.current.y);
    }
    function onPointerUp() {
      isDraggingRef.current = false;
      cv.style.cursor = 'grab';
    }

    // ── Pinch zoom (touch) ────────────────────────────────────────────────────
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 2) return;
      const t1 = e.touches[0], t2 = e.touches[1];
      pinchRef.current = {
        dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        midX: (t1.clientX + t2.clientX) / 2,
        midY: (t1.clientY + t2.clientY) / 2,
      };
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = cv.getBoundingClientRect();
      const mx = (t1.clientX + t2.clientX) / 2 - rect.left;
      const my = (t1.clientY + t2.clientY) / 2 - rect.top;
      const factor = newDist / pinchRef.current.dist;
      const tgt = targetCameraRef.current;
      const ns  = Math.max(0.15, Math.min(2.5, tgt.scale * factor));
      tgt.x = mx - (mx - tgt.x) * (ns / tgt.scale);
      tgt.y = my - (my - tgt.y) * (ns / tgt.scale);
      tgt.scale = ns;
      pinchRef.current = { dist: newDist, midX: mx, midY: my };
    }
    function onTouchEnd() { pinchRef.current = null; }

    cv.addEventListener('wheel',        onWheel,       { passive: false });
    cv.addEventListener('pointerdown',  onPointerDown);
    cv.addEventListener('pointermove',  onPointerMove);
    cv.addEventListener('pointerup',    onPointerUp);
    cv.addEventListener('pointerleave', onPointerUp);
    cv.addEventListener('touchstart',   onTouchStart,  { passive: true });
    cv.addEventListener('touchmove',    onTouchMove,   { passive: false });
    cv.addEventListener('touchend',     onTouchEnd);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      cv.removeEventListener('wheel',        onWheel);
      cv.removeEventListener('pointerdown',  onPointerDown);
      cv.removeEventListener('pointermove',  onPointerMove);
      cv.removeEventListener('pointerup',    onPointerUp);
      cv.removeEventListener('pointerleave', onPointerUp);
      cv.removeEventListener('touchstart',   onTouchStart);
      cv.removeEventListener('touchmove',    onTouchMove);
      cv.removeEventListener('touchend',     onTouchEnd);
    };
  }, [draw]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
      />
      {/* Zoom controls */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        display: 'flex', flexDirection: 'column', gap: 4,
        opacity: 0.55, transition: 'opacity 0.2s',
      }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.opacity = '1'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.opacity = '0.55'}
      >
        {[
          { label: '+', title: 'Zoom in',  onClick: () => { const t = targetCameraRef.current; const c = canvasRef.current; const cx = (c?.offsetWidth ?? 800) / 2, cy = (c?.offsetHeight ?? 600) / 2; const ns = Math.min(2.5, t.scale * 1.25); t.x = cx - (cx - t.x) * (ns / t.scale); t.y = cy - (cy - t.y) * (ns / t.scale); t.scale = ns; } },
          { label: '−', title: 'Zoom out', onClick: () => { const t = targetCameraRef.current; const c = canvasRef.current; const cx = (c?.offsetWidth ?? 800) / 2, cy = (c?.offsetHeight ?? 600) / 2; const ns = Math.max(0.15, t.scale * 0.8); t.x = cx - (cx - t.x) * (ns / t.scale); t.y = cy - (cy - t.y) * (ns / t.scale); t.scale = ns; } },
          { label: '⊡', title: 'Fit all',  onClick: () => { const c = canvasRef.current; if (!c) return; const allC = Array.from(new Set(Array.from(clusterCentersRef.current.values()))); if (allC.length > 0) targetCameraRef.current = computeFitCamera(allC, c.offsetWidth, c.offsetHeight); } },
        ].map(({ label, title, onClick }) => (
          <button
            key={label}
            title={title}
            onClick={onClick}
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(99,102,241,0.3)',
              background: 'rgba(15,15,25,0.8)', color: 'rgba(148,163,184,0.9)',
              fontSize: label === '⊡' ? 14 : 18, lineHeight: 1, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >{label}</button>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'spawning':      return '#a78bfa';
    case 'thinking':      return '#60a5fa';
    case 'executing':     return '#34d399';
    case 'communicating': return '#f59e0b';
    case 'evaluating':    return '#818cf8';
    case 'complete':      return '#6b7280';
    default:              return '#4b5563';
  }
}

function drawIdleState(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
  const cx = w / 2, cy = h / 2;
  const pulse = Math.sin(now * 0.0008) * 0.5 + 0.5;
  ctx.save();
  ctx.globalAlpha = 0.12 + pulse * 0.06;
  ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 0.5; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.arc(cx, cy, 80 + pulse * 10, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 140 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.18 + pulse * 0.1;
  ctx.fillStyle   = '#6366f1';
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
  grd.addColorStop(0, 'rgba(99,102,241,0.15)');
  grd.addColorStop(1, 'rgba(99,102,241,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawAnalyzingRing(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
  const cx = w / 2, cy = h / 2;
  ctx.save();
  ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
  ctx.setLineDash([6, 10]); ctx.lineDashOffset = -(now * 0.05) % 16;
  ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
