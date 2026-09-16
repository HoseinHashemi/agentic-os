import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentRecord, AgentLink, NetworkData } from '../intelligence/types';

interface Props {
  network: NetworkData;
  highlightedAgentId: string | null;
  onAgentHover: (id: string, insightIds: string[]) => void;
  onAgentLeave: () => void;
}

interface Node3D { id: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; }
interface Projected { sx: number; sy: number; scale: number; depth: number; }

const REPULSION = 9000;
const SPRING_LEN = 140;
const SPRING_K = 0.025;
const GRAVITY = 0.006;
const DAMPING = 0.84;

function nodeRadius(ag: AgentRecord | undefined): number {
  if (!ag) return 12;
  return 10 + Math.min((ag.usageCount ?? 1), 15) * 1.4;
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function project(nx: number, ny: number, nz: number, rotX: number, rotY: number, zoom: number, cx: number, cy: number): Projected {
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const rx = nx * cosY + nz * sinY;
  const ry = ny;
  const rz = -nx * sinY + nz * cosY;
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const ry2 = ry * cosX - rz * sinX;
  const rz2 = ry * sinX + rz * cosX;
  const f = 500 * zoom;
  const s = f / (f + rz2 + 300);
  return { sx: cx + rx * s, sy: cy + ry2 * s, scale: s, depth: rz2 };
}

function simulate3D(nodes: Map<string, Node3D>, links: AgentLink[], agentMap: Map<string, AgentRecord>) {
  const arr = Array.from(nodes.values());
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d2 = dx*dx + dy*dy + dz*dz || 0.01;
      const d = Math.sqrt(d2);
      const ra = nodeRadius(agentMap.get(a.id));
      const rb = nodeRadius(agentMap.get(b.id));
      const minD = ra + rb + 30;
      const f = REPULSION / d2;
      const nx = dx/d, ny = dy/d, nz = dz/d;
      a.vx -= f*nx; a.vy -= f*ny; a.vz -= f*nz;
      b.vx += f*nx; b.vy += f*ny; b.vz += f*nz;
      if (d < minD) {
        const push = (minD - d) * 0.5;
        a.x -= nx*push; a.y -= ny*push; a.z -= nz*push;
        b.x += nx*push; b.y += ny*push; b.z += nz*push;
      }
    }
  }
  for (const link of links) {
    const a = nodes.get(link.source), b = nodes.get(link.target);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
    const f = SPRING_K * (d - SPRING_LEN);
    a.vx += f*dx/d; a.vy += f*dy/d; a.vz += f*dz/d;
    b.vx -= f*dx/d; b.vy -= f*dy/d; b.vz -= f*dz/d;
  }
  for (const n of arr) {
    n.vx = (n.vx - n.x * GRAVITY) * DAMPING;
    n.vy = (n.vy - n.y * GRAVITY) * DAMPING;
    n.vz = (n.vz - n.z * GRAVITY) * DAMPING;
    n.x += n.vx; n.y += n.vy; n.z += n.vz;
  }
}

function AgentDetailPanel({ agent, onClose }: { agent: AgentRecord; onClose: () => void }) {
  return (
    <motion.div className="agent-detail-panel"
      initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:20 }}
      transition={{ duration:0.25, ease:[0.16,1,0.3,1] }}>
      <div className="adp-header">
        <span className="adp-dot" style={{ background: agent.color }}/>
        <span className="adp-name">{agent.name}</span>
        <button className="adp-close" onClick={onClose}>×</button>
      </div>
      <div className="adp-specialty">{agent.specialty}</div>
      <div className="adp-stats">
        <div className="adp-stat"><span className="adps-val">{agent.tasksCompleted}</span><span className="adps-lbl">Tasks</span></div>
        <div className="adp-stat"><span className="adps-val">{Math.round(agent.successRate*100)}%</span><span className="adps-lbl">Success</span></div>
        <div className="adp-stat"><span className="adps-val">{Math.round(agent.avgConfidence*100)}%</span><span className="adps-lbl">Conf</span></div>
        {agent.speedImprovement > 0 && (
          <div className="adp-stat"><span className="adps-val" style={{color:'#34d399'}}>+{Math.round(agent.speedImprovement)}%</span><span className="adps-lbl">Speed</span></div>
        )}
      </div>
      {agent.confidenceHistory.length > 1 && (
        <div className="adp-chart">
          <svg width="100%" height="36" viewBox="0 0 120 36" preserveAspectRatio="none">
            <polyline points={agent.confidenceHistory.map((p,i)=>`${i*(120/(agent.confidenceHistory.length-1))},${36-p.value*30}`).join(' ')}
              fill="none" stroke={agent.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="adp-chart-label">Confidence over time</span>
        </div>
      )}
    </motion.div>
  );
}

export default function AgentMemoryTimeline({ network, highlightedAgentId, onAgentHover, onAgentLeave }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const rafRef      = useRef<number>(0);
  const nodesRef    = useRef<Map<string, Node3D>>(new Map());
  const networkRef  = useRef(network);
  networkRef.current = network;
  const highlightRef = useRef(highlightedAgentId);
  highlightRef.current = highlightedAgentId;
  const ticksRef    = useRef(0);
  const rotXRef     = useRef(-0.25);
  const rotYRef     = useRef(0.35);
  const zoomRef     = useRef(1.0);
  const dragRef     = useRef({ active: false, lastX: 0, lastY: 0 });
  const dimsRef     = useRef({ w: 600, h: 380 });
  const [dims, setDims] = useState({ w: 600, h: 380 });
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const [isDragging, setIsDragging] = useState(false);

  // suppress unused warning — dims is used to trigger re-render on resize
  void dims;

  // Measure container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      const w = Math.max(200, width), h = Math.max(200, height);
      dimsRef.current = { w, h };
      setDims({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sync nodes when agents change
  useEffect(() => {
    const current = nodesRef.current;
    for (const ag of network.agents) {
      if (!current.has(ag.id)) {
        const angle = Math.random() * Math.PI * 2;
        const elev  = (Math.random() - 0.5) * 1.2;
        const dist  = 80 + Math.random() * 80;
        current.set(ag.id, {
          id: ag.id,
          x: Math.cos(elev) * Math.cos(angle) * dist,
          y: Math.sin(elev) * dist,
          z: Math.cos(elev) * Math.sin(angle) * dist,
          vx: 0, vy: 0, vz: 0,
        });
      }
    }
    for (const key of current.keys()) {
      if (!network.agents.find(a => a.id === key)) current.delete(key);
    }
    ticksRef.current = 0;
  }, [network.agents]);

  // Single persistent RAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    function resizeCanvas() {
      if (!canvas) return;
      const { w, h } = dimsRef.current;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
    }
    resizeCanvas();

    function draw() {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h } = dimsRef.current;
      // Resize if dims changed
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      const net = networkRef.current;
      const cx = w / 2, cy = h / 2;
      const now = performance.now();
      const rotX = rotXRef.current, rotY = rotYRef.current, zoom = zoomRef.current;

      // Build agent map for fast lookup
      const agentMap = new Map<string, AgentRecord>(net.agents.map(a => [a.id, a]));

      // Run simulation ticks
      if (ticksRef.current < 400) {
        const steps = ticksRef.current < 100 ? 5 : 2;
        for (let i = 0; i < steps; i++) {
          simulate3D(nodesRef.current, net.links, agentMap);
          ticksRef.current++;
        }
      }

      // Project all agents
      const projected = net.agents.map(ag => {
        const n = nodesRef.current.get(ag.id);
        if (!n) return null;
        return { ag, n, p: project(n.x, n.y, n.z, rotX, rotY, zoom, cx, cy) };
      }).filter(Boolean) as Array<{ ag: AgentRecord; n: Node3D; p: Projected }>;
      projected.sort((a, b) => b.p.depth - a.p.depth); // back to front

      // Draw subtle grid axes
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 0.5;
      const axisLen = 200;
      const axes = [[axisLen,0,0],[-axisLen,0,0],[0,axisLen,0],[0,-axisLen,0],[0,0,axisLen],[0,0,-axisLen]];
      for (const [ax,ay,az] of axes) {
        const p0 = project(0,0,0,rotX,rotY,zoom,cx,cy);
        const p1 = project(ax,ay,az,rotX,rotY,zoom,cx,cy);
        ctx.beginPath(); ctx.moveTo(p0.sx,p0.sy); ctx.lineTo(p1.sx,p1.sy); ctx.stroke();
      }
      ctx.restore();

      // Draw links
      for (const link of net.links) {
        const na = nodesRef.current.get(link.source);
        const nb = nodesRef.current.get(link.target);
        if (!na || !nb) continue;
        const pa = project(na.x,na.y,na.z,rotX,rotY,zoom,cx,cy);
        const pb = project(nb.x,nb.y,nb.z,rotX,rotY,zoom,cx,cy);
        const fromAg = agentMap.get(link.source);
        const isEmergent = link.isEmergent;
        const highlighted = highlightRef.current;
        const isRelated = highlighted && (link.source===highlighted || link.target===highlighted);
        const color = isEmergent ? '#f59e0b' : (fromAg?.color ?? '#6366f1');
        const [cr,cg,cb] = isEmergent ? [245,158,11] : hexToRgb(fromAg?.color ?? '#6366f1');
        const alpha = isRelated ? 0.9 : 0.18 + link.avgQuality * 0.22;
        const avgScale = (pa.scale + pb.scale) / 2;
        const lineW = (0.6 + link.collaborationCount * 0.35) * avgScale;
        const midX = (pa.sx+pb.sx)/2 + (pa.sy-pb.sy)*0.08;
        const midY = (pa.sy+pb.sy)/2 + (pb.sx-pa.sx)*0.08;

        ctx.save();
        // Glow
        ctx.globalAlpha = alpha * 0.12;
        ctx.strokeStyle = color; ctx.lineWidth = lineW + 6; ctx.lineCap = 'round'; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(pa.sx,pa.sy); ctx.quadraticCurveTo(midX,midY,pb.sx,pb.sy); ctx.stroke();
        // Core
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},1)`; ctx.lineWidth = lineW;
        if (isEmergent) { ctx.setLineDash([6,4]); ctx.lineDashOffset = -(now*0.06)%10; }
        else ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(pa.sx,pa.sy); ctx.quadraticCurveTo(midX,midY,pb.sx,pb.sy); ctx.stroke();
        // Emergent sparkle
        if (isEmergent) {
          ctx.strokeStyle='#fbbf24'; ctx.lineWidth=0.8;
          ctx.globalAlpha = 0.35 + 0.2*Math.sin(now*0.003);
          ctx.setLineDash([2,16]); ctx.lineDashOffset = -(now*0.03)%18;
          ctx.beginPath(); ctx.moveTo(pa.sx,pa.sy); ctx.quadraticCurveTo(midX,midY,pb.sx,pb.sy); ctx.stroke();
        }
        ctx.restore();
      }

      // Draw nodes back-to-front
      for (const { ag, p } of projected) {
        const r  = nodeRadius(ag) * p.scale;
        const isActive = Date.now() - ag.lastActive < 86400000 * 2;
        const isHover  = highlightRef.current === ag.id;
        const isSel    = selectedRef.current === ag.id;
        const [cr,cg,cb] = hexToRgb(ag.color);

        // Outer pulse ring
        if (isActive) {
          const pulseR = r + (3 + 2*Math.sin(now*0.002 + ag.firstSeen*0.001)) * p.scale;
          ctx.save(); ctx.globalAlpha = 0.15 + 0.1*Math.sin(now*0.002);
          ctx.strokeStyle=ag.color; ctx.lineWidth=0.8*p.scale; ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(p.sx,p.sy,pulseR,0,Math.PI*2); ctx.stroke(); ctx.restore();
        }

        // Glow halo
        const grd = ctx.createRadialGradient(p.sx,p.sy,0,p.sx,p.sy,r*2.8);
        grd.addColorStop(0,`rgba(${cr},${cg},${cb},${isHover||isSel?0.28:0.1})`);
        grd.addColorStop(1,`rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(p.sx,p.sy,r*2.8,0,Math.PI*2); ctx.fill();

        // 3D sphere: dark rim, gradient fill
        const rimGrd = ctx.createRadialGradient(p.sx,p.sy,r*0.4,p.sx,p.sy,r);
        rimGrd.addColorStop(0,`rgba(${cr},${cg},${cb},0)`);
        rimGrd.addColorStop(1,`rgba(0,0,0,0.5)`);
        // Base fill
        const orbGrd = ctx.createRadialGradient(p.sx-r*0.3,p.sy-r*0.35,r*0.05,p.sx,p.sy,r);
        orbGrd.addColorStop(0,`rgba(255,255,255,${isActive?0.95:0.55})`);
        orbGrd.addColorStop(0.2,`rgba(${cr},${cg},${cb},0.97)`);
        orbGrd.addColorStop(0.75,`rgba(${Math.max(0,cr-20)},${Math.max(0,cg-20)},${Math.max(0,cb-20)},0.85)`);
        orbGrd.addColorStop(1,`rgba(${Math.max(0,cr-40)},${Math.max(0,cg-40)},${Math.max(0,cb-40)},0.5)`);
        ctx.fillStyle=orbGrd; ctx.beginPath(); ctx.arc(p.sx,p.sy,r,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=rimGrd; ctx.beginPath(); ctx.arc(p.sx,p.sy,r,0,Math.PI*2); ctx.fill();

        // Specular highlight
        const specGrd = ctx.createRadialGradient(p.sx-r*0.32,p.sy-r*0.38,0,p.sx-r*0.32,p.sy-r*0.38,r*0.55);
        specGrd.addColorStop(0,`rgba(255,255,255,${isActive?0.4:0.18})`);
        specGrd.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=specGrd; ctx.beginPath(); ctx.arc(p.sx-r*0.32,p.sy-r*0.38,r*0.55,0,Math.PI*2); ctx.fill();

        // Selection ring
        if (isSel) {
          ctx.save(); ctx.globalAlpha=0.9;
          ctx.strokeStyle=ag.color; ctx.lineWidth=1.5*p.scale; ctx.setLineDash([4,3]);
          ctx.lineDashOffset=-(now*0.05)%7;
          ctx.beginPath(); ctx.arc(p.sx,p.sy,r+5*p.scale,0,Math.PI*2); ctx.stroke(); ctx.restore();
        }
        // Hover ring
        if (isHover && !isSel) {
          ctx.save(); ctx.globalAlpha=0.5;
          ctx.strokeStyle=ag.color; ctx.lineWidth=1*p.scale; ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(p.sx,p.sy,r+3*p.scale,0,Math.PI*2); ctx.stroke(); ctx.restore();
        }

      }

      // ── Label pass: front-to-back, skip overlaps ──────────────────────────
      const usedRects: Array<[number,number,number,number]> = [];
      for (const { ag: lag, p: lp } of [...projected].reverse()) {
        if (lp.scale <= 0.3) continue;
        const lr   = nodeRadius(lag) * lp.scale;
        const lIsActive = Date.now() - lag.lastActive < 86400000 * 2;
        const fontSize  = Math.round(Math.max(7, 9 * lp.scale));
        ctx.font = `500 ${fontSize}px Inter, sans-serif`;
        // Truncate to fit — max ~16 chars
        let label = lag.name;
        if (ctx.measureText(label).width > lr * 2.8 + 20) {
          label = lag.name.slice(0, Math.max(8, Math.floor((lr * 2.8 + 20) / (fontSize * 0.55)))) + '…';
        }
        const tw = ctx.measureText(label).width;
        const lh = fontSize + 4;
        const lx = lp.sx - tw / 2 - 4;
        const ly = lp.sy + lr + 3 * lp.scale;
        const lw = tw + 8;
        const overlapping = usedRects.some(([rx,ry,rw,rh]) =>
          lx < rx+rw && lx+lw > rx && ly < ry+rh && ly+lh > ry
        );
        if (overlapping) continue;
        usedRects.push([lx, ly, lw, lh]);
        ctx.save();
        ctx.globalAlpha = Math.min(1, (lp.scale - 0.3) * 2.5) * (lIsActive ? 0.92 : 0.55);
        // Pill background
        ctx.fillStyle = 'rgba(3,7,18,0.65)';
        ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, 3); ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, lp.sx, ly + lh / 2);
        ctx.restore();
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // only once — reads from refs

  // Mouse handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    setIsDragging(true);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active) {
      // Hover hit test
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const { w, h } = dimsRef.current;
      const cx = w/2, cy = h/2;
      const net = networkRef.current;
      for (const ag of net.agents) {
        const n = nodesRef.current.get(ag.id); if (!n) continue;
        const p = project(n.x,n.y,n.z,rotXRef.current,rotYRef.current,zoomRef.current,cx,cy);
        const r = nodeRadius(ag)*p.scale;
        if ((mx-p.sx)**2+(my-p.sy)**2 <= r*r) { onAgentHover(ag.id,ag.relatedInsightIds); return; }
      }
      onAgentLeave();
      return;
    }
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    rotYRef.current += dx * 0.006;
    rotXRef.current = Math.max(-Math.PI*0.48, Math.min(Math.PI*0.48, rotXRef.current + dy*0.006));
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
  }, [onAgentHover, onAgentLeave]);

  const onMouseUp = useCallback(() => { dragRef.current.active = false; setIsDragging(false); }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    zoomRef.current = Math.max(0.2, Math.min(10.0, zoomRef.current * (1 - e.deltaY * 0.001)));
  }, []);

  const onClick = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const { w, h } = dimsRef.current;
    const cx = w/2, cy = h/2;
    const net = networkRef.current;
    for (const ag of net.agents) {
      const n = nodesRef.current.get(ag.id); if (!n) continue;
      const p = project(n.x,n.y,n.z,rotXRef.current,rotYRef.current,zoomRef.current,cx,cy);
      const r = nodeRadius(ag)*p.scale;
      if ((mx-p.sx)**2+(my-p.sy)**2 <= r*r) { setSelected(prev => prev===ag.id ? null : ag.id); return; }
    }
    setSelected(null);
  }, []);

  const selectedAgent = selected ? network.agents.find(a => a.id === selected) : null;

  return (
    <div className="agent-timeline-wrap">
      <div className="atl-header">
        <span className="atl-title">Agent Memory Network</span>
        <span className="atl-count">{network.agents.length} agents · {network.links.length} connections</span>
        <span className="atl-hint">drag to rotate · scroll to zoom · click to inspect</span>
      </div>
      <div className="atl-canvas-row">
        <div className="atl-svg-wrap" ref={wrapRef} style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            onClick={onClick}
          />
          {network.agents.length === 0 && (
            <div className="atl-empty">
              <span className="atl-empty-icon">◎</span>
              <span>Complete your first task to see your agent network grow.</span>
            </div>
          )}
        </div>
        <AnimatePresence>
          {selectedAgent && <AgentDetailPanel agent={selectedAgent} onClose={() => setSelected(null)} />}
        </AnimatePresence>
      </div>
      {network.taskHistory.length > 0 && (
        <div className="atl-history-bar">
          <span className="atl-history-label">Task history</span>
          <div className="atl-history-dots">
            {network.taskHistory.slice(-20).map((t,i) => (
              <div key={t.id} className="atl-history-dot"
                style={{ opacity: 0.3 + (i/Math.max(1,network.taskHistory.length-1))*0.7 }}
                title={t.label}/>
            ))}
          </div>
          <span className="atl-history-count">{network.taskHistory.length} tasks</span>
        </div>
      )}
      {network.links.some(l => l.isEmergent) && (
        <div className="atl-emergent-legend">
          <span className="emergent-dot"/>
          <span>Emergent collaboration detected</span>
          {network.links.find(l=>l.isEmergent)?.emergenceNote && (
            <span className="emergent-note"> · {network.links.find(l=>l.isEmergent)!.emergenceNote}</span>
          )}
        </div>
      )}
    </div>
  );
}
