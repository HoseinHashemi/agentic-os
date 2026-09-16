import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Insight, Agent, TaskReport, VerifiedUrl, EmbeddedImage, CreatedFile } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  insights: Insight[];
  taskReport?: TaskReport;
  agents: Agent[];
  taskDescription: string;
  onExport: () => void;
  onReset: () => void;
  onFollowUp: (question: string) => void;
}

// ── Reference map (built from verified URLs only) ─────────────────────────────

function buildRefMap(urls: VerifiedUrl[]): Map<string, number> {
  const m = new Map<string, number>();
  urls.forEach((v, i) => m.set(v.url, i + 1));
  return m;
}

// ── Syntax highlighter ────────────────────────────────────────────────────────

const HL_KW: Record<string, string[]> = {
  python:     ['import','from','def','class','return','if','elif','else','for','while','in','not','and','or','True','False','None','try','except','finally','with','as','pass','break','continue','lambda','yield','async','await','raise','del','global','nonlocal','assert','is'],
  javascript: ['const','let','var','function','return','if','else','for','while','class','extends','import','export','default','from','new','this','typeof','instanceof','in','of','true','false','null','undefined','async','await','try','catch','finally','throw','break','continue','switch','case','void','delete','static','super'],
  typescript: ['const','let','var','function','return','if','else','for','while','class','extends','import','export','default','from','new','this','typeof','instanceof','in','of','true','false','null','undefined','async','await','try','catch','finally','throw','break','continue','switch','case','void','delete','static','super','interface','type','enum','as','is','readonly','abstract','implements','namespace','declare','keyof','infer','never','unknown','any','string','number','boolean','object'],
  go:         ['package','import','func','var','const','type','struct','interface','map','chan','if','else','for','range','return','switch','case','default','break','continue','go','defer','select','fallthrough','goto','true','false','nil'],
  rust:       ['fn','let','mut','const','struct','enum','impl','trait','use','pub','mod','if','else','for','while','loop','match','return','self','super','crate','type','where','async','await','move','ref','dyn','unsafe','extern','static','true','false'],
  bash:       ['if','then','else','elif','fi','for','do','done','while','until','case','esac','function','return','exit','echo','export','source','local','readonly','set','unset'],
  sh:         ['if','then','else','elif','fi','for','do','done','while','until','case','esac','function','return','exit','echo','export','source','local'],
  sql:        ['SELECT','FROM','WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','FULL','CROSS','ON','GROUP','BY','ORDER','HAVING','INSERT','INTO','UPDATE','SET','DELETE','CREATE','TABLE','DROP','ALTER','ADD','COLUMN','INDEX','AS','AND','OR','NOT','IN','IS','NULL','DISTINCT','COUNT','SUM','AVG','MAX','MIN','LIMIT','OFFSET','WITH','CASE','WHEN','THEN','ELSE','END','PRIMARY','KEY','FOREIGN','REFERENCES','UNIQUE','DEFAULT','AUTO_INCREMENT','SERIAL'],
  css:        ['@import','@media','@keyframes','@font-face','@supports','@layer'],
};
const HL_BUILTINS: Record<string, Set<string>> = {
  python:     new Set(['print','len','range','enumerate','zip','map','filter','sorted','list','dict','set','tuple','int','float','str','bool','type','isinstance','hasattr','getattr','setattr','open','input','abs','max','min','sum','round','format','repr','id','dir','vars','super','object','Exception','ValueError','TypeError','KeyError','IndexError','AttributeError','RuntimeError','plt','pd','np','os','sys','json','re','math','datetime','pathlib','Path','DataFrame','Series']),
  javascript: new Set(['console','Math','Object','Array','String','Number','Boolean','Promise','Error','JSON','parseInt','parseFloat','isNaN','isFinite','setTimeout','setInterval','clearTimeout','clearInterval','fetch','document','window','process','require','module','exports','__dirname','__filename','Buffer','Symbol','Map','Set','WeakMap','WeakSet','Proxy','Reflect']),
  typescript: new Set(['console','Math','Object','Array','String','Number','Boolean','Promise','Error','JSON','parseInt','parseFloat','isNaN','isFinite','setTimeout','setInterval','fetch','document','window','process','Record','Partial','Required','Readonly','Pick','Omit','Exclude','Extract','NonNullable','ReturnType','InstanceType']),
};

type HlSpan = { t: string; k: 'kw' | 'bi' | 'str' | 'cmt' | 'num' | 'def' | 'plain' };

function highlightCode(code: string, lang: string): HlSpan[] {
  const l = lang.toLowerCase().replace(/^(jsx?|tsx?)$/, s => s.startsWith('ts') ? 'typescript' : 'javascript');
  const isPython = l === 'python';
  const isSql = l === 'sql';
  const isShell = l === 'bash' || l === 'sh' || l === 'shell' || l === 'zsh';
  const kwSet = isSql
    ? new Set((HL_KW.sql ?? []).map(k => k.toUpperCase()))
    : new Set((HL_KW[l] ?? HL_KW.javascript).map(k => k.toLowerCase()));
  const biSet = HL_BUILTINS[l] ?? HL_BUILTINS.javascript ?? new Set<string>();
  const lineCommentRe = (isPython || isShell) ? /^#[^\n]*/ : /^\/\/[^\n]*/;
  const spans: HlSpan[] = [];
  let i = 0;
  const ch = () => code[i];
  const rest = () => code.slice(i);

  while (i < code.length) {
    if (!isPython && !isShell && rest().startsWith('/*')) {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      spans.push({ t: code.slice(i, stop), k: 'cmt' });
      i = stop; continue;
    }
    const lcm = rest().match(lineCommentRe);
    if (lcm) { spans.push({ t: lcm[0], k: 'cmt' }); i += lcm[0].length; continue; }
    if (isPython && (rest().startsWith('"""') || rest().startsWith("'''"))) {
      const q = code.slice(i, i + 3);
      let j = i + 3;
      while (j <= code.length - 3) {
        if (code.slice(j, j + 3) === q) { j += 3; break; }
        j++;
      }
      spans.push({ t: code.slice(i, j), k: 'str' }); i = j; continue;
    }
    if (ch() === '"' || ch() === "'" || ch() === '`') {
      const q = ch();
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === q) { j++; break; }
        if (code[j] === '\n' && q !== '`') break;
        j++;
      }
      spans.push({ t: code.slice(i, j), k: 'str' }); i = j; continue;
    }
    const numM = rest().match(/^(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (numM && (i === 0 || !/\w/.test(code[i - 1]))) {
      spans.push({ t: numM[0], k: 'num' }); i += numM[0].length; continue;
    }
    const wm = rest().match(/^\w+/);
    if (wm) {
      const w = wm[0];
      const wl = isSql ? w.toUpperCase() : w;
      const kind: HlSpan['k'] = kwSet.has(wl) ? 'kw' : biSet.has(w) ? 'bi' : 'plain';
      spans.push({ t: w, k: kind }); i += w.length; continue;
    }
    const wsM = rest().match(/^\s+/);
    if (wsM) { spans.push({ t: wsM[0], k: 'plain' }); i += wsM[0].length; continue; }
    spans.push({ t: ch(), k: 'plain' }); i++;
  }
  return spans;
}

function HighlightedCode({ code, lang }: { code: string; lang?: string }) {
  if (!lang) return <>{code}</>;
  const spans = highlightCode(code, lang);
  return (
    <>
      {spans.map((s, i) => {
        if (s.k === 'plain') return <span key={i}>{s.t}</span>;
        return <span key={i} className={`hl-${s.k}`}>{s.t}</span>;
      })}
    </>
  );
}

// ── Code Block with copy + download ──────────────────────────────────────────

const LANG_DISPLAY: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'JSX', tsx: 'TSX',
  python: 'Python', py: 'Python', go: 'Go', rust: 'Rust', ruby: 'Ruby',
  java: 'Java', kotlin: 'Kotlin', swift: 'Swift', cpp: 'C++', c: 'C',
  css: 'CSS', html: 'HTML', json: 'JSON', yaml: 'YAML', toml: 'TOML',
  bash: 'Bash', sh: 'Shell', zsh: 'Zsh', sql: 'SQL', r: 'R',
  dockerfile: 'Dockerfile', makefile: 'Makefile', md: 'Markdown',
};

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [code]);

  const handleDownload = useCallback(() => {
    const ext = lang ? `.${lang.toLowerCase()}` : '.txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, lang]);

  const displayLang = lang ? (LANG_DISPLAY[lang.toLowerCase()] ?? lang.toUpperCase()) : undefined;
  const lineCount = code.split('\n').length;

  return (
    <div className="cb-wrap">
      <div className="cb-toolbar">
        <div className="cb-toolbar-left">
          {displayLang && <span className="cb-lang">{displayLang}</span>}
          <span className="cb-lines">{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
        </div>
        <div className="cb-toolbar-right">
          <button className="cb-btn" onClick={handleCopy} title="Copy code">
            {copied ? (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1.5 5.5l2.5 2.5 5.5-5.5" stroke="#34d399" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ color: '#34d399' }}>Copied</span>
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <rect x="1" y="3" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1.1"/>
                  <path d="M3.5 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H8" stroke="currentColor" strokeWidth="1.1"/>
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
          <button className="cb-btn" onClick={handleDownload} title="Download file">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1v6M3 4.5l2.5 2.5 2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1 9.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span>Save</span>
          </button>
        </div>
      </div>
      <div className="cb-code-wrap">
        <div className="cb-gutter" aria-hidden="true">
          {code.split('\n').map((_, i) => (
            <div key={i} className="cb-line-num">{i + 1}</div>
          ))}
        </div>
        <pre className="cb-pre"><code><HighlightedCode code={code} lang={lang} /></code></pre>
      </div>
    </div>
  );
}

// ── Inline markdown tokeniser ─────────────────────────────────────────────────

type Tok =
  | { t: 'text';   v: string }
  | { t: 'bold';   v: string }
  | { t: 'italic'; v: string }
  | { t: 'code';   v: string }
  | { t: 'url';    v: string };

function tokenise(text: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let buf = '';
  const flush = () => { if (buf) { toks.push({ t: 'text', v: buf }); buf = ''; } };

  while (i < text.length) {
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) { flush(); toks.push({ t: 'bold', v: text.slice(i + 2, end) }); i = end + 2; continue; }
    }
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end !== -1 && end > i + 1) { flush(); toks.push({ t: 'italic', v: text.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) { flush(); toks.push({ t: 'code', v: text.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if (text.slice(i, i + 7) === 'http://' || text.slice(i, i + 8) === 'https://') {
      flush();
      const rel = text.slice(i);
      const endOff = rel.search(/[\s<>"')\]`,]/);
      const raw = endOff === -1 ? rel : rel.slice(0, endOff);
      toks.push({ t: 'url', v: raw.replace(/[.,;:!?]+$/, '') });
      i += raw.length;
      continue;
    }
    buf += text[i++];
  }
  flush();
  return toks;
}

function renderInline(text: string, refMap: Map<string, number>): React.ReactNode[] {
  return tokenise(text).map((tok, idx) => {
    switch (tok.t) {
      case 'text':   return <span key={idx}>{tok.v}</span>;
      case 'bold':   return <strong key={idx} className="md-bold">{tok.v}</strong>;
      case 'italic': return <em key={idx} className="md-italic">{tok.v}</em>;
      case 'code':   return <code key={idx} className="md-icode">{tok.v}</code>;
      case 'url': {
        const ref = refMap.get(tok.v);
        if (ref != null) {
          let domain = tok.v;
          try { domain = new URL(tok.v).hostname.replace(/^www\./, ''); } catch { /* noop */ }
          return (
            <a key={idx} href={tok.v} target="_blank" rel="noopener noreferrer" className="md-link">
              {domain}<sup className="md-cite">[{ref}]</sup>
            </a>
          );
        }
        return <span key={idx} className="md-url-unverified">{tok.v}</span>;
      }
    }
  });
}

// ── Markdown block renderer ───────────────────────────────────────────────────

function MarkdownContent({ text, refMap, className }: {
  text: string;
  refMap: Map<string, number>;
  className?: string;
}) {
  if (!text) return null;
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  let listItems: string[] = [];
  let listKind: 'ul' | 'ol' | null = null;
  let codeLines: string[] = [];
  let codeLang: string | undefined;
  let inCode = false;
  let k = 0;

  const flushList = () => {
    if (!listItems.length) return;
    const items = listItems.map((li, i) => (
      <li key={i} className="md-li">{renderInline(li, refMap)}</li>
    ));
    blocks.push(listKind === 'ul'
      ? <ul key={k++} className="md-ul">{items}</ul>
      : <ol key={k++} className="md-ol">{items}</ol>
    );
    listItems = []; listKind = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      if (inCode) {
        blocks.push(<CodeBlock key={k++} code={codeLines.join('\n')} lang={codeLang} />);
        codeLines = []; codeLang = undefined; inCode = false;
      } else {
        flushList();
        codeLang = line.slice(3).trim() || undefined;
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }
    if (line.startsWith('### ')) { flushList(); blocks.push(<h4 key={k++} className="md-h4">{renderInline(line.slice(4), refMap)}</h4>); continue; }
    if (line.startsWith('## '))  { flushList(); blocks.push(<h3 key={k++} className="md-h3">{renderInline(line.slice(3), refMap)}</h3>); continue; }
    if (line.startsWith('# '))   { flushList(); blocks.push(<h2 key={k++} className="md-h2">{renderInline(line.slice(2), refMap)}</h2>); continue; }
    const ulM = line.match(/^[-*+]\s+(.*)/);
    if (ulM) { if (listKind !== 'ul') flushList(); listKind = 'ul'; listItems.push(ulM[1]); continue; }
    const olM = line.match(/^\d+\.\s+(.*)/);
    if (olM) { if (listKind !== 'ol') flushList(); listKind = 'ol'; listItems.push(olM[1]); continue; }
    flushList();
    if (!line) continue;
    blocks.push(<p key={k++} className="md-p">{renderInline(line, refMap)}</p>);
  }
  flushList();
  if (inCode && codeLines.length) blocks.push(<CodeBlock key={k++} code={codeLines.join('\n')} lang={codeLang} />);
  return <div className={`md-content${className ? ' ' + className : ''}`}>{blocks}</div>;
}

// ── Priority dot colors ───────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  high:   '#f43f5e',
  medium: '#f59e0b',
  low:    '#475569',
};

// ── Finding item — clean, expandable evidence ─────────────────────────────────

function FindingItem({ insight: ins, index, refMap }: {
  insight: Insight;
  index: number;
  refMap: Map<string, number>;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const severity = ins.severity ?? 'info';

  const borderStyle: React.CSSProperties =
    severity === 'critical' ? { borderLeft: '2px solid var(--severity-critical-line)', paddingLeft: 14 } :
    severity === 'warning'  ? { borderLeft: '2px solid var(--severity-warning-line)',  paddingLeft: 14 } :
    {};

  const hasEvidence = ins.evidence && ins.evidence.length > 0;

  return (
    <motion.article
      className="rv3-finding"
      style={borderStyle}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.08 + index * 0.05 }}
    >
      <h3 className="rv3-finding-title">{ins.title}</h3>
      <MarkdownContent text={ins.content} refMap={refMap} className="rv3-finding-body" />

      {hasEvidence && (
        <>
          <button
            className="rv3-evidence-toggle"
            onClick={() => setEvidenceOpen(o => !o)}
          >
            <motion.span
              className="rv3-toggle-chevron"
              animate={{ rotate: evidenceOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              ↓
            </motion.span>
            {evidenceOpen ? 'Hide evidence' : 'Show evidence'}
          </button>
          <AnimatePresence>
            {evidenceOpen && (
              <motion.ul
                className="rv3-evidence-list"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                style={{ overflow: 'hidden' }}
              >
                {ins.evidence!.map((ev, i) => (
                  <li key={i} className="rv3-evidence-item">
                    {renderInline(ev, refMap)}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.article>
  );
}

// ── Agent attribution — collapsed by default ──────────────────────────────────

function AgentAttribution({ agents }: { agents: Agent[] }) {
  const [open, setOpen] = useState(false);
  if (!agents.length) return null;

  const names = agents.map(a => a.name);
  const preview = names.length <= 2
    ? names.join(', ')
    : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;

  return (
    <div className="rv3-attribution-wrap">
      <button className="rv3-attribution" onClick={() => setOpen(o => !o)}>
        <span className="rv3-complete-dot" />
        <span>Analyzed by {preview}</span>
        <motion.span
          className="rv3-toggle-chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          ↓
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="rv3-agents-expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {agents.map(agent => (
              <div key={agent.id} className="rv3-agent-item">
                <span className="rv3-agent-dot" style={{ background: agent.color }} />
                <span className="rv3-agent-name">{agent.name}</span>
                <span className="rv3-agent-specialty">{agent.specialty}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Limitations disclosure ────────────────────────────────────────────────────

function LimitationsDisclosure({ text, refMap }: { text: string; refMap: Map<string, number> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rv3-limitations-wrap">
      <button className="rv3-toggle" onClick={() => setOpen(o => !o)}>
        <span style={{ opacity: 0.5 }}>ⓘ</span>
        Note on limitations
        <motion.span
          className="rv3-toggle-chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          ↓
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="rv3-limitations-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <p className="rv3-limitations-text">{renderInline(text, refMap)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── HTML Artifact Viewer (iframe for interactive charts/simulations) ──────────

function HtmlArtifact({ file }: { file: CreatedFile }) {
  const [expanded, setExpanded] = useState(false);
  const fileUrl = `http://localhost:3001/api/file?path=${encodeURIComponent(file.path)}`;
  const dlUrl = `http://localhost:3001/api/download?path=${encodeURIComponent(file.path)}`;

  return (
    <motion.div
      className="rv2-artifact"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="rv2-artifact-header">
        <div className="rv2-artifact-title">
          <span className="rv2-artifact-badge">Interactive</span>
          <span className="rv2-artifact-name">{file.name}</span>
        </div>
        <div className="rv2-artifact-actions">
          <button
            className="rv2-artifact-btn"
            onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 7.5l4-4 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 3.5l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="rv2-artifact-btn">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M4.5 1H1v9h9V6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 1H10v3M10 1L5.5 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Open
          </a>
          <a href={dlUrl} download={file.name} className="rv2-artifact-btn">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1v6M3 4.5l2.5 2.5 2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1 9.5h9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
            Save
          </a>
        </div>
      </div>
      <div className="rv2-artifact-frame-wrap" style={{ height: expanded ? 680 : 420 }}>
        <iframe
          src={fileUrl}
          className="rv2-artifact-frame"
          sandbox="allow-scripts"
          title={file.name}
        />
      </div>
    </motion.div>
  );
}

// ── Files Section (inline images + code + downloads) ─────────────────────────

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);
const HTML_EXTS  = new Set(['.html', '.htm']);

function FilesSection({ files }: { files: CreatedFile[] }) {
  if (!files.length) return null;

  const getExt = (name: string) => {
    const m = name.match(/\.([^.]+)$/);
    return m ? m[1].toLowerCase() : '';
  };
  const isImage = (name: string) => IMAGE_EXTS.has(`.${getExt(name)}`);
  const isHtml  = (name: string) => HTML_EXTS.has(`.${getExt(name)}`);
  const getExtLabel = (name: string) => getExt(name).toUpperCase() || 'FILE';

  const htmlFiles  = files.filter(f => isHtml(f.name));
  const imgFiles   = files.filter(f => isImage(f.name));
  const otherFiles = files.filter(f => !isImage(f.name) && !isHtml(f.name));

  const dlUrl = (path: string) => `http://localhost:3001/api/download?path=${encodeURIComponent(path)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
    >
      {/* Interactive HTML artifacts (iframes) */}
      {htmlFiles.length > 0 && (
        <div className="rv2-artifacts-list">
          {htmlFiles.map(file => <HtmlArtifact key={file.path} file={file} />)}
        </div>
      )}

      {/* Inline image viewer */}
      {imgFiles.length > 0 && (
        <div className="rv2-inline-imgs">
          {imgFiles.map((file, i) => (
            <motion.div
              key={file.path}
              className="rv2-inline-img-item"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 * i }}
            >
              <img
                src={dlUrl(file.path)}
                alt={file.name}
                className="rv2-inline-img"
              />
              <div className="rv2-inline-img-footer">
                <span className="rv2-inline-img-name">{file.name}</span>
                <a href={dlUrl(file.path)} download={file.name} className="rv2-inline-img-dl">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v5.5M2.5 4.5L5 7l2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M1 9h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                  </svg>
                  Save
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Other file downloads */}
      {otherFiles.length > 0 && (
        <div className="rv2-dl-list">
          {otherFiles.map((file, i) => (
            <motion.a
              key={file.path}
              href={dlUrl(file.path)}
              download={file.name}
              className="rv2-dl-item"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: 0.04 * i }}
            >
              <span className="rv2-dl-ext">{getExtLabel(file.name)}</span>
              <div className="rv2-dl-info">
                <span className="rv2-dl-name">{file.name}</span>
                <span className="rv2-dl-path">{file.path}</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="rv2-dl-icon">
                <path d="M6 1v7M3 5.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1 10h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </motion.a>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Web Images (deduplicated) ─────────────────────────────────────────────────

function WebImagesSection({ images }: { images: EmbeddedImage[] }) {
  const seen = new Set<string>();
  const unique = images.filter(img => {
    const fp = img.data.slice(0, 200);
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
  if (!unique.length) return null;

  const getDomain = (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.14 }}
    >
      <div className={`rv2-img-grid rv2-img-grid--${Math.min(unique.length, 3)}`}>
        {unique.map((img, i) => (
          <motion.a
            key={i}
            href={img.sourcePageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rv2-img-card"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.04 * i }}
          >
            <div className="rv2-img-frame">
              <img
                src={`data:${img.mediaType};base64,${img.data}`}
                alt={img.caption ?? getDomain(img.sourcePageUrl)}
                className="rv2-img-embed"
              />
              <div className="rv2-img-overlay">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 11.5l9-9M9 2.5h2.5v2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            {(img.caption || getDomain(img.sourcePageUrl)) && (
              <div className="rv2-img-footer">
                {img.caption && <span className="rv2-img-caption">{img.caption}</span>}
                <span className="rv2-img-domain">{getDomain(img.sourcePageUrl)}</span>
              </div>
            )}
          </motion.a>
        ))}
      </div>
    </motion.div>
  );
}

// ── Sources with show-more ────────────────────────────────────────────────────

function SourcesSection({ urls }: { urls: VerifiedUrl[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!urls.length) return null;
  const visible = showAll ? urls : urls.slice(0, 3);
  const hidden = urls.length - 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.45 }}
    >
      <p className="rv3-section-heading">Sources</p>
      <ol className="rv2-sources-list">
        {visible.map((v, i) => (
          <li key={v.url} className="rv2-source-item">
            <span className="rv2-source-num">{i + 1}</span>
            <div className="rv2-source-info">
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="rv2-source-title">
                {v.title}
              </a>
              <span className="rv2-source-url">{v.url}</span>
            </div>
          </li>
        ))}
      </ol>
      {!showAll && hidden > 0 && (
        <button className="rv3-toggle" onClick={() => setShowAll(true)} style={{ marginTop: 8 }}>
          <motion.span className="rv3-toggle-chevron" animate={{ rotate: 0 }}>↓</motion.span>
          Show {hidden} more source{hidden !== 1 ? 's' : ''}
        </button>
      )}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResultsView({
  insights,
  taskReport,
  agents,
  taskDescription,
  onExport,
  onReset,
  onFollowUp,
}: Props) {
  const [copiedExport, setCopiedExport] = useState(false);

  const verifiedUrls = taskReport?.verifiedUrls ?? [];
  const embeddedImages = taskReport?.embeddedImages ?? [];
  const createdFiles = taskReport?.createdFiles ?? [];
  const refMap = buildRefMap(verifiedUrls);
  const completedAgents = agents.filter(a => a.status === 'complete');

  const handleExport = () => {
    onExport();
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
  };

  return (
    <motion.div
      className="results-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
    >
      <div className="results-scroll">

        {/* ── Header ─────────────────────────────────────────────── */}
        <motion.header
          className="rv3-header"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="rv3-task-text">{taskDescription}</p>
          {completedAgents.length > 0 && (
            <AgentAttribution agents={completedAgents} />
          )}
        </motion.header>

        {/* ── Executive Summary ───────────────────────────────────── */}
        {taskReport?.executiveSummary && (
          <motion.div
            className="rv3-summary"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
          >
            <MarkdownContent text={taskReport.executiveSummary} refMap={refMap} />
          </motion.div>
        )}

        {/* ── Generated Files (HTML artifacts + images + downloads) ── */}
        {createdFiles.length > 0 && (
          <div className="rv3-section">
            <FilesSection files={createdFiles} />
          </div>
        )}

        {/* ── Web Images ──────────────────────────────────────────── */}
        {embeddedImages.length > 0 && (
          <div className="rv3-section">
            <WebImagesSection images={embeddedImages} />
          </div>
        )}

        {/* ── Findings ────────────────────────────────────────────── */}
        {insights.length > 0 && (
          <motion.div
            className="rv3-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
          >
            <div className="rv3-findings-list">
              {insights.map((ins, i) => (
                <FindingItem key={ins.id} insight={ins} index={i} refMap={refMap} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Action Items ─────────────────────────────────────────── */}
        {taskReport?.actionItems && taskReport.actionItems.length > 0 && (
          <motion.div
            className="rv3-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
          >
            <ol className="rv3-actions-list">
              {taskReport.actionItems.map((item, i) => (
                <motion.li
                  key={i}
                  className="rv3-action-item"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: 0.2 + i * 0.04 }}
                >
                  <span
                    className="rv3-action-dot"
                    style={{ background: PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.low }}
                  />
                  <span className="rv3-action-text">{item.label}</span>
                </motion.li>
              ))}
            </ol>
          </motion.div>
        )}

        {/* ── Follow-up Questions ──────────────────────────────────── */}
        {taskReport?.followUpQuestions && taskReport.followUpQuestions.length > 0 && (
          <motion.div
            className="rv3-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
          >
            <div className="rv3-followup-list">
              {taskReport.followUpQuestions.map((q, i) => (
                <motion.button
                  key={i}
                  className="rv3-followup-item"
                  onClick={() => onFollowUp(q)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.27 + i * 0.04 }}
                >
                  {q}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Sources ─────────────────────────────────────────────── */}
        {verifiedUrls.length > 0 && (
          <div className="rv3-section">
            <SourcesSection urls={verifiedUrls} />
          </div>
        )}

        {/* ── Limitations ──────────────────────────────────────────── */}
        {taskReport?.limitations && (
          <motion.div
            className="rv3-section"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <LimitationsDisclosure text={taskReport.limitations} refMap={refMap} />
          </motion.div>
        )}

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer className="rv3-footer">
          <button className="rv2-export-btn" onClick={handleExport}>
            {copiedExport ? (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="#34d399" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ color: '#34d399' }}>Copied</span>
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <rect x="1" y="3" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1.1"/>
                  <path d="M3.5 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H8" stroke="currentColor" strokeWidth="1.1"/>
                </svg>
                Copy report
              </>
            )}
          </button>
          <button className="rv2-new-btn" onClick={onReset}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M1 6a5 5 0 1 0 1.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M1 2.5V6h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            New task
          </button>
        </footer>

      </div>
    </motion.div>
  );
}
