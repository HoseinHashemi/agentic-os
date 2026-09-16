import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ConvMessage } from '../types/conversation';

interface Props {
  messages: ConvMessage[];
  isActive: boolean;
  onClear: () => void;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ConversationThread({ messages, isActive, onClear }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isActive]);

  if (messages.length === 0 && !isActive) return null;

  return (
    <div className="conv-thread">
      <div className="conv-thread-header">
        <span className="conv-thread-label">Conversation</span>
        {messages.length > 0 && (
          <button className="conv-clear-btn" onClick={onClear} title="Clear conversation">
            Clear
          </button>
        )}
      </div>

      <div className="conv-messages">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              className={`conv-msg conv-msg-${msg.role}${msg.isError ? ' conv-msg-error' : ''}`}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="conv-msg-meta">
                <span className="conv-msg-role">
                  {msg.role === 'user' ? 'You' : '◈ Nexus'}
                </span>
                <span className="conv-msg-time">{timeLabel(msg.timestamp)}</span>
              </div>
              <p className="conv-msg-content">{msg.content}</p>
            </motion.div>
          ))}

          {isActive && (
            <motion.div
              key="typing"
              className="conv-typing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="conv-typing-dot" />
              <span className="conv-typing-dot" />
              <span className="conv-typing-dot" />
              <span className="conv-typing-text">Agents working…</span>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </div>
  );
}
