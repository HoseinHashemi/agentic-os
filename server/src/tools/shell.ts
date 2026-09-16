import { exec } from 'child_process';
import { homedir } from 'os';
import type { ApprovalRequest } from '../types.js';

export const SHELL_TOOLS = [
  {
    name: 'run_command',
    description: 'Run a shell command on the user\'s computer and return its output. Use for running scripts, git commands, package managers (npm/pip/brew), compilers, and other CLI tools. Always requires user approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'The shell command to run' },
        working_directory: { type: 'string', description: 'Directory to run the command in. Defaults to home directory.' },
        timeout_seconds: { type: 'number', description: 'Timeout in seconds (default 30, max 120)' },
      },
      required: ['command'],
    },
  },
];

// Patterns that are always blocked regardless of approval
const BLOCKED_PATTERNS = [
  /\brm\s+(-[^-\s]*f[^-\s]*|-[^-\s]*r[^-\s]*f|--force|--recursive).*\/(?:\s|$)/i,
  />\s*\/dev\/(?:sda|sdb|hda|hdb|nvme)/i,
  /:\(\)\s*\{\s*:\|:/,                    // fork bomb
  /\bmkfs\b/i,
  /\bdd\b.*\bof=\/dev\//i,
  /\bformat\s+[A-Z]:/i,
  /\bsudo\s+rm\s+-rf\s+\//i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bcurl\b.*\|\s*(?:bash|sh|zsh)/i,     // curl-pipe-shell
  /\bwget\b.*-O-.*\|\s*(?:bash|sh|zsh)/i,
];

// Paths that commands should not touch
const BLOCKED_PATH_PREFIXES = ['/etc', '/sys', '/boot', '/proc', '/dev'];

function isSafe(command: string): { safe: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) return { safe: false, reason: 'Blocked dangerous pattern' };
  }
  for (const blocked of BLOCKED_PATH_PREFIXES) {
    if (new RegExp(`\\b${blocked}(?:/|\\s|$)`).test(command)) {
      return { safe: false, reason: `Access to ${blocked} is not allowed` };
    }
  }
  return { safe: true };
}

function classifyCommandRisk(command: string): 'low' | 'medium' | 'high' {
  const cmd = command.toLowerCase();
  if (/\b(rm|rmdir|delete|drop\s+table|truncate)\b/.test(cmd)) return 'high';
  if (/\b(sudo|chmod|chown|kill|pkill|killall|shutdown|reboot)\b/.test(cmd)) return 'high';
  if (/\b(npm|pip|brew|apt|yarn|cargo|gem)\b/.test(cmd)) return 'medium';
  if (/\b(git|python|node|ruby|go|rust|java)\b/.test(cmd)) return 'medium';
  return 'low';
}

export async function executeShellTool(
  name: string,
  input: Record<string, unknown>,
  requestApproval: (req: ApprovalRequest) => Promise<boolean>,
): Promise<string> {
  if (name !== 'run_command') return `ERROR: Unknown shell tool: ${name}`;

  const command = ((input.command as string) ?? '').trim();
  if (!command) return 'ERROR: command is required';

  const safety = isSafe(command);
  if (!safety.safe) return `ERROR: Command blocked — ${safety.reason}`;

  const workDir = ((input.working_directory as string) ?? homedir()).trim() || homedir();
  const timeoutSec = Math.min(Number(input.timeout_seconds ?? 30), 120);

  const approved = await requestApproval({
    tool: name,
    action: 'Run shell command',
    description: `Execute: ${command.slice(0, 120)}`,
    risk: classifyCommandRisk(command),
    params: { command: command.slice(0, 200), working_directory: workDir },
  });

  if (!approved) return 'DENIED: User denied command execution';

  return new Promise<string>((resolve) => {
    exec(command, {
      cwd: workDir,
      timeout: timeoutSec * 1000,
      maxBuffer: 2 * 1024 * 1024, // 2MB
      shell: process.env.SHELL ?? '/bin/zsh',
    }, (error, stdout, stderr) => {
      const out = stdout.slice(0, 8000);
      const err = stderr.slice(0, 2000);

      if (error?.killed) {
        resolve(`TIMEOUT: Command exceeded ${timeoutSec}s limit.\nOutput so far:\n${out}`);
        return;
      }

      const parts: string[] = [];
      if (out) parts.push(`stdout:\n${out}`);
      if (err) parts.push(`stderr:\n${err}`);
      if (error && error.code !== 0) parts.push(`exit code: ${error.code}`);

      resolve(parts.join('\n\n') || 'Command completed with no output.');
    });
  });
}
