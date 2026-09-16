import { useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  onSave: (apiKey: string) => void;
  sandboxPaths: string[];
}

export default function Onboarding({ onSave, sandboxPaths }: Props) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      setError('API key should start with sk-ant-api…');
      return;
    }
    if (trimmed.length < 40) {
      setError('Key looks too short — paste your full Anthropic API key.');
      return;
    }
    setError('');
    onSave(trimmed);
  }

  return (
    <motion.div
      className="onboarding-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="onboarding-card"
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="ob-header">
          <div className="ob-orb" />
          <div>
            <h2 className="ob-title">Connect Nexus to Claude</h2>
            <p className="ob-sub">Your API key stays on your machine — never leaves this device.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="ob-form">
          <label className="ob-label">
            Anthropic API Key
            <a
              href="https://console.anthropic.com/account/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="ob-link"
            >
              Get key →
            </a>
          </label>
          <div className="ob-input-wrap">
            <input
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={e => { setKey(e.target.value); setError(''); }}
              placeholder="sk-ant-api03-…"
              className="ob-input"
              autoFocus
              spellCheck={false}
            />
            <button
              type="button"
              className="ob-show-btn"
              onClick={() => setShowKey(v => !v)}
              title={showKey ? 'Hide' : 'Show'}
            >
              {showKey ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.2"/>
                  <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.2"/>
                  <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
              )}
            </button>
          </div>
          {error && <p className="ob-error">{error}</p>}

          <button type="submit" className="ob-submit" disabled={!key.trim()}>
            Connect & Start
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginLeft: 6 }}>
              <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </form>

        <div className="ob-sandbox">
          <p className="ob-sandbox-title">Sandboxed to these directories by default:</p>
          <div className="ob-sandbox-paths">
            {sandboxPaths.slice(0, 5).map(p => (
              <span key={p} className="ob-sandbox-chip">
                {p.replace(/\/Users\/[^/]+/, '~')}
              </span>
            ))}
          </div>
          <p className="ob-sandbox-note">
            Agents can only read/write files in these locations. Destructive operations always require your approval.
          </p>
        </div>

        <div className="ob-footer">
          <div className="ob-feature">
            <span className="ob-feature-icon">◎</span>
            Real Claude API calls — actual intelligence, not simulation
          </div>
          <div className="ob-feature">
            <span className="ob-feature-icon">◈</span>
            Real filesystem operations on your computer
          </div>
          <div className="ob-feature">
            <span className="ob-feature-icon">✦</span>
            Every action requires your approval before execution
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
