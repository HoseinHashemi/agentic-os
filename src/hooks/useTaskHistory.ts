import { useState, useCallback } from 'react';
import type { Insight, TaskReport, Agent } from '../types';

export interface TaskSnapshot {
  insights: Insight[];
  taskReport?: TaskReport;
  agents: Agent[];
}

export interface TaskRecord {
  id: string;
  timestamp: number;
  task: string;
  mode: 'simulation' | 'live';
  agents: Array<{ name: string; specialty: string; color: string }>;
  insights: Array<{ title: string; content: string }>;
  tokenUsage: { input: number; output: number };
  duration: number;
  actionsCount: number;
  success: boolean;
  snapshot?: TaskSnapshot; // full data for replaying results view
}

const STORAGE_KEY = 'nexus-task-history-v1';
const MAX_RECORDS = 50;

function loadFromStorage(): TaskRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as TaskRecord[];
  } catch {
    return [];
  }
}

export function useTaskHistory() {
  const [history, setHistory] = useState<TaskRecord[]>(loadFromStorage);

  const addRecord = useCallback((record: TaskRecord) => {
    setHistory(prev => {
      const next = [record, ...prev].slice(0, MAX_RECORDS);
      // Strip base64 embedded images before writing to localStorage (too large for quota)
      const toStore = next.map(r => !r.snapshot ? r : {
        ...r,
        snapshot: {
          ...r.snapshot,
          taskReport: r.snapshot.taskReport ? { ...r.snapshot.taskReport, embeddedImages: undefined } : undefined,
        },
      });
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore)); } catch {}
      return next; // keep full in-memory data including images
    });
  }, []);

  const clearHistory = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setHistory([]);
  }, []);

  return { history, addRecord, clearHistory };
}
