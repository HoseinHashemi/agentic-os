import {
  mkdir, writeFile, readFile, readdir, rename, copyFile, unlink, stat, rm
} from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, basename } from 'path';
import { homedir } from 'os';
import { validatePath, requiresApproval, classifyRisk, describeAction, validateShellCommand } from './safety.js';
import type { ApprovalRequest } from '../types.js';

// All tool definitions for Claude API
export const FILESYSTEM_TOOLS = [
  {
    name: 'create_directory',
    description: 'Create a directory and all necessary parent directories. Safe operation within sandbox.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path of the directory to create.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a new file with specified text content. Parent directory must exist or will be created.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path of the file to create.' },
        content: { type: 'string', description: 'Text content to write to the file.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Read and return the text contents of a file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path of the file to read.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'List all files and subdirectories at the given path with their types.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path of the directory to list.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'move_file',
    description: 'Move or rename a file or directory. Requires user approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source: { type: 'string', description: 'Absolute source path.' },
        destination: { type: 'string', description: 'Absolute destination path.' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'copy_file',
    description: 'Copy a file to a new location.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source: { type: 'string', description: 'Absolute path of the source file.' },
        destination: { type: 'string', description: 'Absolute path of the destination.' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'delete_file',
    description: 'Permanently delete a file or directory. ALWAYS requires explicit user approval.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path to delete.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_system_paths',
    description: 'Get important system paths: desktop, documents, home directory, workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'report_result',
    description: 'REQUIRED: Call this when ALL tasks are complete to report your results. This ends your execution.',
    input_schema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean', description: 'Whether all tasks completed successfully.' },
        summary: { type: 'string', description: 'Clear summary of what was accomplished.' },
        confidence: { type: 'number', description: 'Confidence level from 0.0 to 1.0.' },
        actions: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of actions taken (e.g., "Created folder /Users/.../Desktop/TestProject").',
        },
      },
      required: ['success', 'summary', 'confidence', 'actions'],
    },
  },
];

export type ToolExecutor = (
  toolName: string,
  input: Record<string, unknown>,
  sandboxPaths: string[],
  requestApproval: (req: ApprovalRequest) => Promise<boolean>,
  workspacePath: string
) => Promise<string>;

export const executeFilesystemTool: ToolExecutor = async (
  toolName,
  input,
  sandboxPaths,
  requestApproval,
  workspacePath
) => {
  const params = input as Record<string, string>;

  // Special non-fs tools
  if (toolName === 'get_system_paths') {
    return JSON.stringify({
      desktop: `${homedir()}/Desktop`,
      documents: `${homedir()}/Documents`,
      downloads: `${homedir()}/Downloads`,
      home: homedir(),
      workspace: workspacePath,
    });
  }

  if (toolName === 'report_result') {
    return 'Result reported. Task complete.';
  }

  // Safety: check if approval needed
  if (requiresApproval(toolName)) {
    const { action, description } = describeAction(toolName, params);
    const risk = classifyRisk(toolName, params);
    const approved = await requestApproval({ tool: toolName, action, description, risk, params });
    if (!approved) {
      return `DENIED: User rejected the operation "${action}".`;
    }
  }

  try {
    switch (toolName) {
      case 'create_directory': {
        const path = validatePath(params.path, sandboxPaths);
        await mkdir(path, { recursive: true });
        return `✓ Created directory: ${path}`;
      }

      case 'create_file': {
        const path = validatePath(params.path, sandboxPaths);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, params.content ?? '', 'utf8');
        return `✓ Created file: ${path} (${(params.content ?? '').length} bytes)`;
      }

      case 'read_file': {
        const path = validatePath(params.path, sandboxPaths);
        const content = await readFile(path, 'utf8');
        return content;
      }

      case 'list_directory': {
        const path = validatePath(params.path, sandboxPaths);
        const entries = await readdir(path, { withFileTypes: true });
        const lines = entries.map(e => `${e.isDirectory() ? '[dir] ' : '[file]'} ${e.name}`);
        return lines.join('\n') || '(empty directory)';
      }

      case 'move_file': {
        const src = validatePath(params.source, sandboxPaths);
        const dst = validatePath(params.destination, sandboxPaths);
        await mkdir(dirname(dst), { recursive: true });
        await rename(src, dst);
        return `✓ Moved: ${src} → ${dst}`;
      }

      case 'copy_file': {
        const src = validatePath(params.source, sandboxPaths);
        const dst = validatePath(params.destination, sandboxPaths);
        await mkdir(dirname(dst), { recursive: true });
        await copyFile(src, dst);
        return `✓ Copied: ${src} → ${dst}`;
      }

      case 'delete_file': {
        const path = validatePath(params.path, sandboxPaths);
        const s = await stat(path);
        if (s.isDirectory()) {
          await rm(path, { recursive: true });
        } else {
          await unlink(path);
        }
        return `✓ Deleted: ${path}`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `ERROR: ${msg}`;
  }
};
