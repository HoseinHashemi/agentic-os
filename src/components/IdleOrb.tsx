import { useRef, useEffect } from 'react';

interface Props {
  isTyping?: boolean;
  typingSeq?: number;   // increments on each keystroke — triggers pulse
}

// ── Geometry ────────────────────────────────────────────────────────────────
interface Dot { bx: number; by: number; bz: number }
interface Edge { a: number; b: number }

function buildGrid(): { dots: Dot[]; edges: Edge[] } {
  const dots: Dot[] = [];
  const edges: Edge[] = [];
  const N_LAT = 22;
  const N_LON = 36;
  const ringStart: number[] = [];
  const ringN:     number[] = [];

  for (let r = 0; r < N_LAT; r++) {
    const lat  = -Math.PI * 0.45 + (r / (N_LAT - 1)) * Math.PI * 0.90;
    const cosL = Math.cos(lat);
    const sinL = Math.sin(lat);
    const n    = Math.max(4, Math.round(N_LON * cosL));
    ringStart.push(dots.length);
    ringN.push(n);
    for (let d = 0; d < n; d++) {
      const lon = (d / n) * Math.PI * 2;
      dots.push({ bx: cosL * Math.cos(lon), by: sinL, bz: cosL * Math.sin(lon) });
    }
  }
  for (let r = 0; r < N_LAT; r++) {
    const s = ringStart[r], n = ringN[r];
    for (let d = 0; d < n; d++) edges.push({ a: s + d, b: s + (d + 1) % n });
  }
  for (let r = 0; r < N_LAT - 1; r++) {
    const sA = ringStart[r], nA = ringN[r];
    const sB = ringStart[r + 1], nB = ringN[r + 1];
    for (let d = 0; d < nA; d++) {
      const phiA = (d / nA) * Math.PI * 2;
      let best = 0, bestDist = Infinity;
      for (let e = 0; e < nB; e++) {
        const phiB = (e / nB) * Math.PI * 2;
        const diff = Math.min(Math.abs(phiA - phiB), Math.PI * 2 - Math.abs(phiA - phiB));
        if (diff < bestDist) { bestDist = diff; best = e; }
      }
      edges.push({ a: sA + d, b: sB + best });
    }
  }
  return { dots, edges };
}

const { dots: DOTS, edges: EDGES } = buildGrid();

// ── Base surface noise (smooth bumps) ────────────────────────────────────────
function sNoise(x: number, y: number, z: number, t: number): number {
  const n1 =  Math.sin(x * 2.1 + t * 0.30) * Math.cos(y * 1.9 + t * 0.24) * Math.sin(z * 2.3 + t * 0.33);
  const n2 = (Math.sin(y * 2.7 + t * 0.20) * Math.cos(z * 3.1 + t * 0.17) * Math.sin(x * 2.4 + t * 0.26)) * 0.55;
  const n3 = (Math.cos(z * 3.6 + t * 0.14) * Math.sin(x * 3.3 + t * 0.22) * Math.cos(y * 2.8 + t * 0.18)) * 0.28;
  return (n1 + n2 + n3) / 1.83;
}

// ── 3 attractor points drifting slowly on the sphere ─────────────────────────
function getAttractors(t: number): [number, number, number][] {
  return [0, 1, 2].map(i => {
    const theta = (i / 3) * Math.PI * 2 + t * 0.09;
    const phi   = Math.sin(t * 0.05 + i * 2.09) * 0.50;
    const cp    = Math.cos(phi);
    return [cp * Math.sin(theta), Math.sin(phi), cp * Math.cos(theta)] as [number, number, number];
  });
}

// cos(angle)^10 — tight falloff, only dots within ~25° of centre get > 0.1
function dotProtrusion(bx: number, by: number, bz: number, attractors: [number,number,number][]): number {
  let best = 0;
  for (const [ax, ay, az] of attractors) {
    const c = bx * ax + by * ay + bz * az;
    best = Math.max(best, Math.pow(Math.max(0, c), 10));
  }
  return best;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function IdleOrb({ isTyping = false, typingSeq = 0 }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef(0);
  const t0          = useRef(performance.now());
  const rotAngle    = useRef(0);
  const lastMs      = useRef(performance.now());
  const typingRef   = useRef(isTyping);
  const typingLevel = useRef(0);     // lerped 0→1
  const pulse       = useRef(0);     // 0→1, fires on each keystroke, decays fast
  const lastSeq     = useRef(typingSeq);

  useEffect(() => { typingRef.current = isTyping; }, [isTyping]);
  useEffect(() => {
    if (typingSeq !== lastSeq.current) {
      lastSeq.current = typingSeq;
      pulse.current   = 1.0;          // spike on each character
    }
  }, [typingSeq]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      const p = canvas.parentElement;
      if (!p) return;
      canvas.width  = p.clientWidth;
      canvas.height = p.clientHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    function frame() {
      if (!canvas || !ctx) return;
      const W = canvas.width, H = canvas.height;
      if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(frame); return; }

      const now = performance.now();
      const dt  = Math.min((now - lastMs.current) / 1000, 0.05);
      lastMs.current = now;
      const t = (now - t0.current) / 1000;

      rotAngle.current += dt * 0.055 * Math.PI * 2;
      const ry = rotAngle.current;
      const rx = Math.sin(t * 0.08 * Math.PI * 2) * 0.15;

      // Typing level & pulse decay
      const targetTL = typingRef.current ? 1 : 0;
      typingLevel.current += (targetTL - typingLevel.current) * dt * (typingRef.current ? 3.5 : 1.0);
      pulse.current = Math.max(0, pulse.current - dt * 5.0); // decays in ~0.2 s
      const TL = typingLevel.current;
      const PL = pulse.current;

      // Base distortion breathes always
      const AMP = 0.30 + Math.sin(t * 0.14 * Math.PI * 2) * 0.25;

      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const cosX = Math.cos(rx), sinX = Math.sin(rx);

      const cx = W / 2;
      const cy = H * 0.40;
      const R  = Math.min(W * 0.26, H * 0.28);

      function proj(x: number, y: number, z: number): [number, number, number] {
        const x1 =  x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y2 =  y * cosX - z1 * sinX;
        const z2 =  z1 * cosX + y  * sinX;
        const s  = 4.8 / (4.8 + z2);
        return [cx + x1 * s * R, cy + y2 * s * R, z2];
      }

      const attractors = getAttractors(t);

      // Spike extension: base from TL, boosted per keystroke by PL
      const SPIKE_AMP = TL * (0.28 + PL * 0.18);

      type WP = {
        // tip (displaced position)
        wx: number; wy: number; wz: number;
        px: number; py: number; depth: number;
        // base (surface position, without spike push)
        bpx: number; bpy: number;
        raw01: number;
      };

      const wp: WP[] = DOTS.map(d => {
        const noise  = sNoise(d.bx, d.by, d.bz, t);
        const raw01  = dotProtrusion(d.bx, d.by, d.bz, attractors);

        // Base surface position (noise distortion only, no spike)
        const rBase = 1 + noise * AMP;
        const [bpx, bpy] = proj(d.bx * rBase, d.by * rBase, d.bz * rBase);

        // Tip: spike push on top
        const r  = rBase + raw01 * SPIKE_AMP;
        const wx = d.bx * r, wy = d.by * r, wz = d.bz * r;
        const [px, py, depth] = proj(wx, wy, wz);

        return { wx, wy, wz, px, py, depth, bpx, bpy, raw01: raw01 * TL };
      });

      ctx.clearRect(0, 0, W, H);

      // ── Ambient glow ──────────────────────────────────────────────────────
      const breathe = 1 + Math.sin(t * 0.55) * 0.05;
      const glowR   = R * 1.55 * breathe;
      const g0 = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      g0.addColorStop(0,   `rgba(80,100,220,${0.08 + TL * 0.04})`);
      g0.addColorStop(0.5, 'rgba(50,60,180,0.03)');
      g0.addColorStop(1,   'rgba(20,20,120,0)');
      ctx.fillStyle = g0;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // ── Wireframe edges ───────────────────────────────────────────────────
      ctx.lineCap = 'round';
      for (const e of EDGES) {
        const a = wp[e.a], b = wp[e.b];
        const avgZ  = (a.depth + b.depth) * 0.5;
        const visib = Math.max(0.03, (avgZ + 1.4) / 2.0);
        // Edges touching a spike dot glow brighter
        const spikeBoost = Math.max(a.raw01, b.raw01);
        const alpha = visib * (0.10 + spikeBoost * 0.18);
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.strokeStyle = `rgba(180,200,255,${Math.min(alpha, 0.30)})`;
        ctx.lineWidth   = 0.5 + spikeBoost * 0.6;
        ctx.stroke();
      }

      // ── Spike sticks — drawn before dots so tips sit on top ──────────────
      // Only for dots whose raw01 > threshold — these are the "spike" dots
      const SPIKE_THRESH = 0.25;
      for (const p of wp) {
        if (p.raw01 < SPIKE_THRESH || p.depth < -0.4) continue;
        const depthF = Math.max(0, (p.depth + 1.6) / 2.4);
        const w      = p.raw01; // 0.25 … 1.0

        // Pulse flash: lighter/whiter on keypress
        const flashL = 78 + w * 16 + PL * w * 20;
        const alpha  = w * depthF * (0.75 + PL * 0.25);

        // Stick line from surface base to spike tip
        const grad = ctx.createLinearGradient(p.bpx, p.bpy, p.px, p.py);
        grad.addColorStop(0, `rgba(180,210,255,0)`);                              // fade from surface
        grad.addColorStop(0.3, `hsla(200,70%,${flashL}%,${alpha * 0.5})`);
        grad.addColorStop(1,   `hsla(195,85%,${flashL + 8}%,${alpha})`);          // bright at tip

        ctx.beginPath();
        ctx.moveTo(p.bpx, p.bpy);
        ctx.lineTo(p.px,  p.py);
        ctx.strokeStyle = grad;
        ctx.lineWidth   = 0.7 + w * 0.8;
        ctx.stroke();

        // Glowing dot at the tip
        const tipR = (1.5 + w * 1.8) * (4.8 / (4.8 + p.depth));
        const halo = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, tipR * (2.5 + PL * 1.5));
        halo.addColorStop(0,  `hsla(195,90%,92%,${alpha * (0.55 + PL * 0.3)})`);
        halo.addColorStop(1,  `hsla(200,80%,75%,0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.px, p.py, tipR * (2.5 + PL * 1.5), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(200,60%,${flashL + 12}%,${Math.min(alpha * 1.1, 1)})`;
        ctx.beginPath();
        ctx.arc(p.px, p.py, tipR, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── All dots (depth-sorted) ───────────────────────────────────────────
      const sorted = wp.map((p, i) => ({ ...p, i })).sort((a, b) => a.depth - b.depth);

      for (const p of sorted) {
        if (p.raw01 >= SPIKE_THRESH) continue;  // spike dots already drawn above
        const depthF = Math.max(0, (p.depth + 1.6) / 2.4);
        const dr     = Math.sqrt(p.wx*p.wx + p.wy*p.wy + p.wz*p.wz) - 1;
        const s      = 4.8 / (4.8 + p.depth);
        const dotR   = Math.max(0.7, (1.6 + Math.abs(dr) * 3) * s * (0.4 + depthF * 0.6));
        const alpha  = (0.5 + depthF * 0.5) * 0.75;
        const hue    = 215 + dr * 100;

        if (alpha > 0.08 && depthF > 0.10) {
          const gr = dotR * 2.0;
          const dg = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, gr);
          dg.addColorStop(0, `hsla(${hue},55%,80%,${alpha * 0.28})`);
          dg.addColorStop(1, `hsla(${hue},55%,75%,0)`);
          ctx.fillStyle = dg;
          ctx.beginPath();
          ctx.arc(p.px, p.py, gr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `hsla(${hue},50%,86%,${Math.min(alpha, 1)})`;
        ctx.beginPath();
        ctx.arc(p.px, p.py, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  return (
    <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
  );
}
