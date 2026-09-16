import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BackendConfig } from '../hooks/useBackend';

interface Props {
  open: boolean;
  config: BackendConfig;
  onSave: (patch: Partial<{
    apiKey: string;
    sandboxPaths: string[];
    searchApiKey: string;
    agentModel: string;
    orchestratorModel: string;
    maxIterationsPerAgent: number;
  }>) => void;
  onClose: () => void;
}

const AGENT_MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (most capable)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
];

const ORCH_MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (recommended — fast & cheap)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (higher quality)' },
];

export default function SettingsModal({ open, config, onSave, onClose }: Props) {
  const [sandboxPaths, setSandboxPaths] = useState(config.sandboxPaths);
  const [newPath, setNewPath] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [searchApiKey, setSearchApiKey] = useState(config.searchApiKey ?? '');
  const [agentModel, setAgentModel] = useState(config.agentModel);
  const [orchestratorModel, setOrchestratorModel] = useState(config.orchestratorModel);
  const [maxIter, setMaxIter] = useState(config.maxIterationsPerAgent);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    onSave({
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      sandboxPaths,
      searchApiKey: searchApiKey.trim() || undefined,
      agentModel,
      orchestratorModel,
      maxIterationsPerAgent: maxIter,
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 900);
  }

  function addPath() {
    const p = newPath.trim();
    if (p && !sandboxPaths.includes(p)) { setSandboxPaths(prev => [...prev, p]); setNewPath(''); }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="settings-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="settings-modal"
            initial={{ scale: 0.93, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.93, y: 20, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
          >
            <div className="settings-header">
              <span className="settings-title">&#9881; Settings</span>
              <button className="settings-close" onClick={onClose}>&#10005;</button>
            </div>

            <div className="settings-body">
              {/* API Key */}
              <section className="settings-section">
                <h3 className="settings-section-title">Anthropic API Key</h3>
                <label className="settings-label">
                  {config.hasApiKey ? 'Update API key' : 'Set API key'}
                  <span className="settings-optional"> (leave blank to keep current)</span>
                </label>
                <input
                  type="password" className="settings-input" placeholder="sk-ant-..."
                  value={apiKey} onChange={e => setApiKey(e.target.value)}
                  autoComplete="new-password"
                />
                {config.hasApiKey && <p className="settings-hint" style={{ color: '#10b981' }}>✓ API key is set</p>}
              </section>

              {/* Models */}
              <section className="settings-section">
                <h3 className="settings-section-title">Models</h3>
                <label className="settings-label">Agent model (worker agents)</label>
                <select className="settings-select" value={agentModel} onChange={e => setAgentModel(e.target.value)}>
                  {AGENT_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <label className="settings-label" style={{ marginTop: 10 }}>Orchestrator model (planning, evaluation)</label>
                <select className="settings-select" value={orchestratorModel} onChange={e => setOrchestratorModel(e.target.value)}>
                  {ORCH_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </section>

              {/* Max iterations */}
              <section className="settings-section">
                <h3 className="settings-section-title">Agent limits</h3>
                <label className="settings-label">Max tool calls per agent: <strong style={{ color: 'var(--text)' }}>{maxIter}</strong></label>
                <input
                  type="range" min={5} max={60} step={5} value={maxIter}
                  onChange={e => setMaxIter(Number(e.target.value))}
                  className="settings-range"
                />
                <div className="settings-range-labels"><span>5</span><span>60</span></div>
              </section>

              {/* Web search */}
              <section className="settings-section">
                <h3 className="settings-section-title">Web Search</h3>
                <label className="settings-label">Brave Search API key <span className="settings-optional">(optional &#8212; improves web_search results)</span></label>
                <input
                  type="password" className="settings-input" placeholder="BSA..."
                  value={searchApiKey} onChange={e => setSearchApiKey(e.target.value)}
                />
                <p className="settings-hint">Without a key, DuckDuckGo instant answers are used. Get a free key at search.brave.com/api.</p>
              </section>

              {/* Sandbox paths */}
              <section className="settings-section">
                <h3 className="settings-section-title">Sandbox paths</h3>
                <p className="settings-hint">Agents can only read/write within these directories.</p>
                <div className="settings-paths">
                  {sandboxPaths.map(p => (
                    <div key={p} className="settings-path-row">
                      <span className="settings-path-text">{p}</span>
                      <button className="settings-path-remove" onClick={() => setSandboxPaths(prev => prev.filter(x => x !== p))}>&#10005;</button>
                    </div>
                  ))}
                </div>
                <div className="settings-path-add">
                  <input
                    className="settings-input" placeholder="/Users/you/Projects"
                    value={newPath} onChange={e => setNewPath(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPath()}
                  />
                  <button className="settings-add-btn" onClick={addPath}>Add</button>
                </div>
              </section>
            </div>

            <div className="settings-footer">
              <button className="settings-cancel-btn" onClick={onClose}>Cancel</button>
              <button className="settings-save-btn" onClick={handleSave}>
                {saved ? '&#10003; Saved' : 'Save changes'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
