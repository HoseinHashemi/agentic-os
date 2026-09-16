import { motion, AnimatePresence } from 'framer-motion';
import type { ApprovalPayload } from '../types/backend';

interface Props {
  approval: ApprovalPayload | null;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onApproveAll: () => void;
  onDenyAll: () => void;
}

const RISK_CONFIG = {
  low:    { label: 'Safe',        color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.2)'  },
  medium: { label: 'Caution',     color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
  high:   { label: 'Destructive', color: '#f43f5e', bg: 'rgba(244,63,94,0.08)',  border: 'rgba(244,63,94,0.2)'  },
};

const TOOL_ICONS: Record<string, string> = {
  create_directory: '📁',
  create_file:      '📄',
  move_file:        '↔',
  copy_file:        '⎘',
  delete_file:      '⚠',
  execute_command:  '⚡',
  default:          '◈',
};

export default function ApprovalModal({ approval, onApprove, onDeny, onApproveAll, onDenyAll }: Props) {
  return (
    <AnimatePresence>
      {approval && (
        <motion.div
          className="approval-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="approval-modal"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Agent badge */}
            <div className="ap-agent">
              <div
                className="ap-agent-dot"
                style={{ background: approval.agentColor, boxShadow: `0 0 10px ${approval.agentColor}60` }}
              />
              <span className="ap-agent-name" style={{ color: approval.agentColor }}>
                {approval.agentName}
              </span>
              <span className="ap-agent-wants">wants to:</span>
            </div>

            {/* Action */}
            <div className="ap-action">
              <span className="ap-action-icon">
                {TOOL_ICONS[approval.params?.tool ?? ''] ?? TOOL_ICONS.default}
              </span>
              <div className="ap-action-body">
                <div className="ap-action-title">{approval.action}</div>
                <div className="ap-action-desc">{approval.description}</div>
              </div>
              <RiskBadge risk={approval.risk} />
            </div>

            {/* Params table */}
            {Object.keys(approval.params).length > 0 && (
              <div className="ap-params">
                {Object.entries(approval.params).slice(0, 4).map(([k, v]) => (
                  <div key={k} className="ap-param-row">
                    <span className="ap-param-key">{k}</span>
                    <span className="ap-param-val">{v?.length > 70 ? v.slice(0, 70) + '…' : v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── This action ── */}
            <div className="ap-section-label">This action</div>
            <div className="ap-buttons">
              <button className="ap-btn ap-deny" onClick={() => onDeny(approval.id)}>
                Deny
              </button>
              <button
                className={`ap-btn ap-approve risk-${approval.risk}`}
                onClick={() => onApprove(approval.id)}
              >
                {approval.risk === 'high' ? '⚠ Approve' : 'Approve'}
              </button>
            </div>

            {/* ── All remaining ── */}
            <div className="ap-divider" />
            <div className="ap-section-label">All remaining actions this task</div>
            <div className="ap-buttons">
              <button className="ap-btn ap-deny-all" onClick={onDenyAll}>
                ✕ Deny All
              </button>
              <button
                className={`ap-btn ap-approve-all ${approval.risk === 'high' ? 'risk-high' : ''}`}
                onClick={onApproveAll}
              >
                {approval.risk === 'high' ? '⚠ Approve All' : '✓ Approve All'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  const cfg = RISK_CONFIG[risk];
  return (
    <div
      className="ap-risk-badge"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
    >
      {cfg.label}
    </div>
  );
}
