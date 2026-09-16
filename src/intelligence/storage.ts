import type { IntelligenceData } from './types';

const KEY = 'nexus_intelligence_v1';

export function loadIntelligence(): IntelligenceData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as IntelligenceData) : null;
  } catch { return null; }
}

export function saveIntelligence(data: IntelligenceData): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* quota */ }
}

export function clearIntelligence(): void {
  localStorage.removeItem(KEY);
}
