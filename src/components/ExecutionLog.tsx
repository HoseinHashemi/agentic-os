import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ActionExecutedPayload } from '../types/backend';

interface Props {
  log: ActionExecutedPayload[];
  isLiveMode: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  create_directory: 'mkdir',
  create_file: 'write',
  read_file: 'read',
  list_directory: 'ls',
  move_file: 'mv',
  copy_file: 'cp',
  delete_file: 'rm',
  execute_command: 'exec',
  run_command: 'shell',
  web_search: 'search',
  fetch_url: 'fetch',
  launch_app: 'launch',
};

export default function ExecutionLog({ log, isLiveMode }: Props) {
  const [open, setOpen] = useState(false);

  if (!isLiveMode || log.length === 0) return null;

  const successCount = log.filter(e => e.success).length;
  const failCount = log.length - successCount;

  return (
    <div className="exec-float">
      <AnimatePresence>
        {open && (
          <motion.div
            className="exec-drawer"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="exec-drawer-header">
              <span className="exec-drawer-title">Action Log</span>
              <span className="exec-drawer-stats">
                <span style={{ color: '#34d399' }}>{successCount} ok</span>
                {failCount > 0 && <span style={{ color: '#f43f5e', marginLeft: 8 }}>{failCount} failed</span>}
              </span>
            </div>
            <div className="exec-drawer-list">
              {log.map((entry, i) => (
                <div key={i} className={`exec-entry ${entry.success ? 'ok' : 'fail'}`}>
                  <span className="exec-entry-icon">{entry.success ? '✓' : '✗'}</span>
                  <span className="exec-entry-tool" style={{ color: entry.agentColor }}>
                    {TOOL_LABELS[entry.tool] ?? entry.tool}
                  </span>
                  {entry.path && (
                    <span className="exec-entry-path">
                      {entry.path.replace(/\/Users\/[^/]+/, '~')}
                    </span>
                  )}
                  <span className="exec-entry-agent" style={{ color: entry.agentColor }}>
                    {entry.agentName}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button className="exec-pill" onClick={() => setOpen(o => !o)}>
        <span className="exec-pill-dot" />
        <span className="exec-pill-count">{log.length} actions</span>
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ opacity: 0.5 }}>
          <path
            d={open ? 'M1.5 6l3-3 3 3' : 'M1.5 3l3 3 3-3'}
            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
