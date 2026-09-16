import { resolve, normalize } from 'path';
import { homedir } from 'os';

// Patterns that should never be executed in shell commands
const DANGEROUS_SHELL_PATTERNS = [
  /rm\s+-rf?\s+\//,       // rm -rf /
  />\s*\/dev\//,           // redirect to device files
  /mkfs/,                  // format filesystem
  /dd\s+if=/,             // dd - disk destroyer
  /chmod\s+777\s+\//,     // chmod 777 /
  /:\(\)\s*\{.*\}/,       // fork bomb
  /curl.*\|\s*bash/,      // curl pipe to bash
  /wget.*-O\s*-.*\|\s*sh/, // wget pipe to sh
];

// Operations that always need user approval
const ALWAYS_APPROVE_TOOLS = ['delete_file', 'execute_command', 'move_file'];

// Operations that need approval if outside workspace
const CONDITIONAL_APPROVE_TOOLS = ['copy_file'];

export function validatePath(inputPath: string, sandboxPaths: string[]): string {
  const resolved = resolve(inputPath.replace('~', homedir()));
  const normalized = normalize(resolved);

  // Check path traversal attempts
  if (normalized.includes('..')) {
    throw new Error(`Path traversal not allowed: ${inputPath}`);
  }

  // Allow if within any sandbox path
  const isAllowed = sandboxPaths.some(sandbox => {
    const resolvedSandbox = resolve(sandbox.replace('~', homedir()));
    return normalized.startsWith(resolvedSandbox);
  });

  if (!isAllowed) {
    throw new Error(
      `Path outside sandbox: ${normalized}\n` +
      `Allowed directories: ${sandboxPaths.join(', ')}`
    );
  }

  return normalized;
}

export function requiresApproval(toolName: string): boolean {
  return ALWAYS_APPROVE_TOOLS.includes(toolName);
}

export function validateShellCommand(command: string): void {
  for (const pattern of DANGEROUS_SHELL_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Dangerous command pattern detected: ${command}`);
    }
  }
}

export function classifyRisk(toolName: string, params: Record<string, string>): 'low' | 'medium' | 'high' {
  if (toolName === 'delete_file') return 'high';
  if (toolName === 'execute_command') return 'high';
  if (toolName === 'move_file') return 'medium';
  if (toolName === 'copy_file') return 'low';
  return 'low';
}

export function describeAction(toolName: string, params: Record<string, string>): { action: string; description: string } {
  switch (toolName) {
    case 'create_directory':
      return { action: 'Create folder', description: `Create directory at: ${params.path}` };
    case 'create_file':
      return {
        action: 'Create file',
        description: `Create file: ${params.path} (${params.content?.length ?? 0} bytes)`,
      };
    case 'read_file':
      return { action: 'Read file', description: `Read: ${params.path}` };
    case 'list_directory':
      return { action: 'List directory', description: `List contents of: ${params.path}` };
    case 'move_file':
      return { action: 'Move / rename', description: `Move: ${params.source} → ${params.destination}` };
    case 'copy_file':
      return { action: 'Copy file', description: `Copy: ${params.source} → ${params.destination}` };
    case 'delete_file':
      return { action: 'Delete', description: `Permanently delete: ${params.path}` };
    case 'execute_command':
      return { action: 'Execute shell command', description: `Run: ${params.command}` };
    default:
      return { action: toolName, description: JSON.stringify(params) };
  }
}
