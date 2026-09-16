import { useState, useRef, useEffect, useCallback } from 'react';
import type { OrchestratorPhase } from '../types';
import type { AttachedImage } from '../hooks/useImageAttach';
import { useImageAttach } from '../hooks/useImageAttach';
import { useVoice } from '../hooks/useVoice';

interface Props {
  onSubmit: (task: string, images: AttachedImage[]) => void;
  onReset: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  phase: OrchestratorPhase;
  isActive: boolean;
  completionPct: number;
  mode: 'simulation' | 'live' | 'onboarding';
  isConnected: boolean;
  hasApiKey: boolean;
  onToggleMode: () => void;
  onSetupApiKey: () => void;
  hasConversation: boolean;
  onTypingChange?: (isTyping: boolean) => void;
  onKeystroke?: () => void;
  prefill?: string;
  onPrefillConsumed?: () => void;
  hasParallelTasks?: boolean;
  parallelTaskCount?: number;
}

const EXAMPLES = [
  { label: 'Medical Case', task: 'Patient presents with fatigue, irregular heartbeat, and elevated blood sugar. Analyze and suggest diagnostic pathways.' },
  { label: 'Security Audit', task: 'Review this codebase for security vulnerabilities, performance issues, and suggest architectural improvements.' },
  { label: 'Quantum Research', task: 'Analyze recent developments in quantum computing and identify the three most promising directions for practical applications in the next five years.' },
  { label: 'Create Files', task: "Create a folder called TestProject on my Desktop, create three subfolders inside it called Documents, Images, and Code, then create a readme.txt in Documents with today's date and a welcome message." },
];

const PHASE_LABELS: Record<OrchestratorPhase, string> = {
  idle: '', analyzing: 'Analyzing task…', spawning: 'Generating agents…',
  executing: 'Executing in parallel…', qa_review: 'QA Reviewing…',
  evaluating: 'Peer evaluation…', synthesizing: 'Synthesizing…', complete: 'Complete',
};

export default function InputLayer({
  onSubmit, onReset, onStop, onRetry, phase, isActive, completionPct,
  mode, isConnected, hasApiKey, onToggleMode, onSetupApiKey,
  hasConversation, onTypingChange, onKeystroke, prefill, onPrefillConsumed,
  hasParallelTasks, parallelTaskCount,
}: Props) {
  const [value, setValue] = useState('');
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea as content grows (max ~6 lines)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  // Apply prefill from follow-up questions
  useEffect(() => {
    if (!prefill) return;
    setValue(prefill);
    onPrefillConsumed?.();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [prefill, onPrefillConsumed]);

  const { images, isDragging, addFiles, removeImage, clearImages, dragHandlers } = useImageAttach(isActive);

  // Voice — appends transcript to the text field
  const handleFinalTranscript = useCallback((text: string) => {
    setValue(prev => prev ? `${prev} ${text}` : text);
  }, []);
  const { isListening, isSupported: voiceSupported, interimText, start: startVoice, stop: stopVoice } = useVoice(handleFinalTranscript);

  useEffect(() => {
    if (!isActive) inputRef.current?.focus();
  }, [isActive]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter submits; Shift+Enter inserts newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed && images.length === 0) return;
      onSubmit(trimmed || 'Analyze the attached image(s).', images);
      setValue('');
      clearImages();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed && images.length === 0) return;
    onSubmit(trimmed || (images.length > 0 ? 'Analyze the attached image(s).' : ''), images);
    setValue('');
    clearImages();
  }

  function handleExample(task: string) {
    setValue(task);
    setTimeout(() => { onSubmit(task, []); }, 80);
  }

  function handleMicClick() {
    if (isListening) stopVoice();
    else startVoice();
  }

  const isLive = mode === 'live' && isConnected && hasApiKey;
  const isComplete = phase === 'complete';
  const canSubmit = value.trim().length > 0 || images.length > 0;
  const displayValue = isListening && interimText ? `${value}${value ? ' ' : ''}${interimText}` : value;

  return (
    <div className="input-layer">
      <div
        className={`input-inner ${isDragging ? 'dragging' : ''}`}
        {...dragHandlers}
      >
        {/* Mode / status bar */}
        <div className="brand">
          <button
            className={`mode-toggle ${isLive ? 'live' : 'sim'}`}
            onClick={isLive ? onToggleMode : (isConnected ? onToggleMode : onSetupApiKey)}
            title={isLive ? 'Switch to simulation mode' : 'Switch to live mode'}
          >
            {isLive ? <><span className="mode-live-dot" />Live Mode</> : <><span className="mode-sim-icon">◈</span>Simulation</>}
          </button>

          {!isConnected && (
            <span className="backend-status offline">Backend offline</span>
          )}
          {isActive && <span className={`phase-badge ${phase}`}>{PHASE_LABELS[phase]}</span>}
        </div>

        {/* File previews */}
        {images.length > 0 && (
          <div className="image-strip">
            {images.map(img => (
              <div key={img.id} className={`image-thumb-wrap ${img.fileType !== 'image' ? 'file-thumb-wrap' : ''}`}>
                {img.fileType === 'image' ? (
                  <img src={img.preview} alt={img.name} className="image-thumb" />
                ) : img.fileType === 'pdf' ? (
                  <div className="file-thumb pdf-thumb">
                    <PdfIcon />
                    <span className="file-thumb-name">{img.name.length > 14 ? img.name.slice(0,12)+'…' : img.name}</span>
                    <span className="file-thumb-size">{(img.size/1024).toFixed(0)} KB</span>
                  </div>
                ) : (
                  <div className="file-thumb text-thumb">
                    <DocIcon />
                    <span className="file-thumb-name">{img.name.length > 14 ? img.name.slice(0,12)+'…' : img.name}</span>
                    <span className="file-thumb-size">{(img.size/1024).toFixed(0)} KB</span>
                  </div>
                )}
                <button
                  className="image-thumb-remove"
                  onClick={() => removeImage(img.id)}
                  title="Remove"
                >×</button>
              </div>
            ))}
            <label className="image-add-more" title="Add more files">
              <input
                type="file"
                accept="image/*,.pdf,.txt,.csv,.md,.json,.yaml,.yml,.xml,.log"
                multiple
                style={{ display: 'none' }}
                onChange={e => e.target.files && addFiles(e.target.files)}
              />
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </label>
          </div>
        )}

        {/* Input row */}
        <form onSubmit={handleSubmit} className="input-form">
          <div className={`input-wrap ${isActive ? 'active' : ''} ${isDragging ? 'drop-target' : ''}`}>

            {/* Attach file button */}
            {!isActive && (
              <label className="attach-btn" title="Attach file — image, PDF, text, CSV…">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.txt,.csv,.md,.json,.yaml,.yml,.xml,.log"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => e.target.files && addFiles(e.target.files)}
                />
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M3 1.5h6l3 3V13a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 2.5 13V2a.5.5 0 0 1 .5-.5Z" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M9 1.5V4.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M5 8h5M5 10.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                </svg>
                {images.length > 0 && <span className="attach-count">{images.length}</span>}
              </label>
            )}

            <textarea
              ref={inputRef}
              rows={1}
              value={displayValue}
              onChange={e => {
                const v = e.target.value;
                if (v.length > value.length) onKeystroke?.();
                setValue(v);
                onTypingChange?.(v.length > 0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                isDragging ? 'Drop file here…' :
                isListening ? 'Listening…' :
                hasConversation ? 'Reply to Nexus…' :
                isLive ? 'Describe any task — or attach a file…' :
                'What do you want to accomplish?'
              }
              className={`task-input ${isListening ? 'listening' : ''}`}
              autoComplete="off"
              spellCheck={false}
            />

            {/* Mic button */}
            {!isActive && voiceSupported && (
              <button
                type="button"
                className={`mic-btn ${isListening ? 'recording' : ''}`}
                onClick={handleMicClick}
                title={isListening ? 'Stop listening' : 'Speak your task'}
              >
                {isListening ? <MicActiveIcon /> : <MicIcon />}
              </button>
            )}

            {/* Parallel tasks badge */}
            {hasParallelTasks && (
              <div className="input-parallel-badge">
                <span className="input-parallel-dot" />
                {parallelTaskCount && parallelTaskCount > 1 ? `${parallelTaskCount} running in parallel` : 'Running in parallel'}
              </div>
            )}

            {/* Stop button — shown as flex sibling when active */}
            {isActive && onStop && (
              <button
                type="button"
                className="stop-btn"
                onClick={onStop}
                title="Stop agents"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor"/>
                </svg>
              </button>
            )}

            {/* Progress bar — absolute, sits at bottom edge */}
            {isActive && !hasParallelTasks && (
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${completionPct}%` }} />
              </div>
            )}

            {/* Submit button — shown when not active */}
            {!isActive && (
              <button type="submit" className="submit-btn" disabled={!canSubmit}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="input-footer">
          {!isActive && !hasConversation && (
            <div className="examples">
              <span className="examples-label">Try:</span>
              {EXAMPLES.map(ex => (
                <button
                  key={ex.label}
                  className={`example-chip ${ex.label === 'Create Files' && isLive ? 'chip-live' : ''}`}
                  onClick={() => handleExample(ex.task)}
                >
                  {ex.label === 'Create Files' && isLive && <span style={{ color: '#34d399', marginRight: 4 }}>●</span>}
                  {ex.label}
                </button>
              ))}
            </div>
          )}
          {isComplete && (
            <div className="completion-actions">
              {onRetry && (
                <button className="retry-btn" onClick={onRetry} title="Re-run the same task">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginRight: 5 }}>
                    <path d="M10 6a4 4 0 1 1-1.2-2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <path d="M10 2.5V6H6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Retry
                </button>
              )}
              <button className="reset-btn" onClick={onReset}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginRight: 5 }}>
                  <path d="M1 6a5 5 0 1 0 1.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M1 2.5V6h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                New task
              </button>
            </div>
          )}
          {!isConnected && !isLive && (
            <span className="start-backend-hint">
              Run <code>npm run server</code> for live mode
            </span>
          )}
          {!isActive && (
            <span className="input-hints">
              {voiceSupported && <span>🎤 voice</span>}
              <span>⌘V paste</span>
              <span>drag & drop</span>
              <span>PDF · text · CSV</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PdfIcon() {
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
      <rect x="1" y="1" width="18" height="22" rx="2" stroke="currentColor" strokeWidth="1.2" fill="rgba(239,68,68,0.12)"/>
      <path d="M5 1v5h-4" stroke="currentColor" strokeWidth="1.2"/>
      <text x="4" y="16" fontSize="6" fontWeight="700" fill="#ef4444" fontFamily="Inter,sans-serif">PDF</text>
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
      <rect x="1" y="1" width="18" height="22" rx="2" stroke="currentColor" strokeWidth="1.2" fill="rgba(99,102,241,0.1)"/>
      <path d="M5 1v5h-4" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 11h10M5 14h8M5 17h6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="4.5" y="1" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 6.5a5 5 0 0 0 10 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="7" y1="11.5" x2="7" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function MicActiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="4.5" y="1" width="5" height="8" rx="2.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 6.5a5 5 0 0 0 10 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="7" y1="11.5" x2="7" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}
