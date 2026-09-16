import { homedir } from 'os';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const CONFIG_DIR = join(homedir(), '.agentic-os');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface Config {
  apiKey?: string;
  sandboxPaths: string[];
  searchApiKey?: string;          // Brave Search API key (optional)
  agentModel: string;             // Model for worker agents
  orchestratorModel: string;      // Model for orchestration/eval/insights
  maxIterationsPerAgent: number;  // Tool-call limit per agent
}

const DEFAULT_CONFIG: Config = {
  sandboxPaths: [
    join(homedir(), 'Desktop'),
    join(homedir(), 'Documents'),
    join(homedir(), 'Downloads'),
    join(homedir(), 'Pictures'),
    join(homedir(), '.agentic-os', 'workspace'),
  ],
  agentModel: 'claude-sonnet-4-6',
  orchestratorModel: 'claude-haiku-4-5-20251001',
  maxIterationsPerAgent: 20,
};

let cachedConfig: Config | null = null;

export async function loadConfig(): Promise<Config> {
  if (cachedConfig !== null) return cachedConfig;
  try {
    if (!existsSync(CONFIG_FILE)) {
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig;
    }
    const raw = await readFile(CONFIG_FILE, 'utf8');
    cachedConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as Config;
    return cachedConfig;
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

export async function saveConfig(patch: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  cachedConfig = { ...current, ...patch };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cachedConfig, null, 2), 'utf8');
  return cachedConfig;
}

export async function getApiKey(): Promise<string | undefined> {
  const cfg = await loadConfig();
  return cfg.apiKey || process.env.ANTHROPIC_API_KEY;
}

export async function getWorkspacePath(): Promise<string> {
  const dir = join(homedir(), '.agentic-os', 'workspace');
  await mkdir(dir, { recursive: true });
  return dir;
}
