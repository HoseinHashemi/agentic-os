import { exec } from 'child_process';
import { platform } from 'os';
import type { ApprovalRequest } from '../types.js';

// ─── Tool definition ──────────────────────────────────────────────────────────
export const LAUNCH_TOOLS = [
  {
    name: 'launch_app',
    description: 'Launch an application or open a URL on the user\'s computer. Use this to open browsers, apps, or websites.',
    input_schema: {
      type: 'object' as const,
      properties: {
        app: {
          type: 'string',
          description: 'Application to launch. Use common names: "chrome", "safari", "firefox", "terminal", "calculator", "vscode", "finder", "spotify", "slack", "zoom", "notes", "calendar", "mail". Leave empty to just open a URL in default browser.',
        },
        url: {
          type: 'string',
          description: 'URL to open (http/https). Can be used alone (opens in default browser) or with an app name to open in that browser.',
        },
      },
      required: [],
    },
  },
];

// ─── App name → executable mapping ───────────────────────────────────────────
const APP_MAP: Record<string, { mac: string; win: string; linux: string }> = {
  chrome:           { mac: 'Google Chrome',         win: 'chrome',           linux: 'google-chrome' },
  'google chrome':  { mac: 'Google Chrome',         win: 'chrome',           linux: 'google-chrome' },
  safari:           { mac: 'Safari',                win: '',                 linux: '' },
  firefox:          { mac: 'Firefox',               win: 'firefox',          linux: 'firefox' },
  edge:             { mac: 'Microsoft Edge',        win: 'msedge',           linux: 'microsoft-edge' },
  brave:            { mac: 'Brave Browser',         win: 'brave',            linux: 'brave-browser' },
  arc:              { mac: 'Arc',                   win: '',                 linux: '' },
  terminal:         { mac: 'Terminal',              win: 'cmd',              linux: 'x-terminal-emulator' },
  iterm:            { mac: 'iTerm',                 win: 'cmd',              linux: 'x-terminal-emulator' },
  iterm2:           { mac: 'iTerm',                 win: 'cmd',              linux: 'x-terminal-emulator' },
  finder:           { mac: 'Finder',                win: 'explorer',         linux: 'nautilus' },
  explorer:         { mac: 'Finder',                win: 'explorer',         linux: 'nautilus' },
  calculator:       { mac: 'Calculator',            win: 'calc',             linux: 'gnome-calculator' },
  vscode:           { mac: 'Visual Studio Code',    win: 'code',             linux: 'code' },
  'vs code':        { mac: 'Visual Studio Code',    win: 'code',             linux: 'code' },
  'visual studio code': { mac: 'Visual Studio Code', win: 'code',           linux: 'code' },
  spotify:          { mac: 'Spotify',               win: 'spotify',          linux: 'spotify' },
  slack:            { mac: 'Slack',                 win: 'slack',            linux: 'slack' },
  discord:          { mac: 'Discord',               win: 'discord',          linux: 'discord' },
  zoom:             { mac: 'zoom.us',               win: 'zoom',             linux: 'zoom' },
  notes:            { mac: 'Notes',                 win: 'notepad',          linux: 'gedit' },
  calendar:         { mac: 'Calendar',              win: 'outlook',          linux: 'gnome-calendar' },
  mail:             { mac: 'Mail',                  win: 'outlook',          linux: 'thunderbird' },
  photos:           { mac: 'Photos',                win: 'ms-photos:',       linux: 'eog' },
  music:            { mac: 'Music',                 win: 'wmplayer',         linux: 'rhythmbox' },
  figma:            { mac: 'Figma',                 win: 'figma',            linux: 'figma' },
  xcode:            { mac: 'Xcode',                 win: '',                 linux: '' },
  'activity monitor': { mac: 'Activity Monitor',   win: 'taskmgr',          linux: 'gnome-system-monitor' },
  'system settings':  { mac: 'System Settings',    win: 'control',          linux: 'gnome-control-center' },
  'system preferences': { mac: 'System Preferences', win: 'control',        linux: 'gnome-control-center' },
  'app store':      { mac: 'App Store',             win: 'ms-windows-store:', linux: '' },
  preview:          { mac: 'Preview',               win: '',                 linux: 'evince' },
  textedit:         { mac: 'TextEdit',              win: 'notepad',          linux: 'gedit' },
  notion:           { mac: 'Notion',                win: 'notion',           linux: 'notion' },
  obsidian:         { mac: 'Obsidian',              win: 'obsidian',         linux: 'obsidian' },
  cursor:           { mac: 'Cursor',                win: 'cursor',           linux: 'cursor' },
};

function findApp(query: string): { mac: string; win: string; linux: string } | undefined {
  const lower = query.toLowerCase().trim();
  if (APP_MAP[lower]) return APP_MAP[lower];
  // Partial match
  for (const [key, val] of Object.entries(APP_MAP)) {
    if (key.includes(lower) || lower.includes(key)) return val;
  }
  return undefined;
}

function buildCommand(app: string, url: string, os: string): string {
  if (os === 'darwin') {
    if (url && !app) return `open "${url}"`;
    if (app) {
      const def = findApp(app);
      const appName = def?.mac ?? app;
      return url ? `open -a "${appName}" "${url}"` : `open -a "${appName}"`;
    }
    return '';
  }

  if (os === 'win32') {
    if (url && !app) return `start "" "${url}"`;
    if (app) {
      const def = findApp(app);
      const exe = def?.win ?? app;
      return url ? `start "" "${exe}" "${url}"` : `start "" "${exe}"`;
    }
    return '';
  }

  // Linux
  if (url && !app) return `xdg-open "${url}"`;
  if (app) {
    const def = findApp(app);
    const exe = def?.linux ?? app;
    return url ? `${exe} "${url}"` : exe;
  }
  return '';
}

// ─── Execution ────────────────────────────────────────────────────────────────
export async function executeLaunchTool(
  name: string,
  input: Record<string, unknown>,
  requestApproval: (req: ApprovalRequest) => Promise<boolean>,
): Promise<string> {
  if (name !== 'launch_app') return `Unknown launch tool: ${name}`;

  const app = ((input.app as string) ?? '').trim();
  const url = ((input.url as string) ?? '').trim();

  if (!app && !url) return 'ERROR: Must specify an app name or URL';

  const isUrlOnly  = !app && !!url;
  const label      = app ? (url ? `${app} → ${url}` : app) : url;
  const risk       = isUrlOnly ? 'low' as const : 'medium' as const;

  const approved = await requestApproval({
    tool: name,
    action: 'Launch application',
    description: app ? `Launch "${app}"${url ? ` and open ${url}` : ''}` : `Open ${url} in browser`,
    risk,
    params: { ...(app ? { app } : {}), ...(url ? { url } : {}) },
  });

  if (!approved) return 'DENIED: User denied app launch';

  const os  = platform();
  const cmd = buildCommand(app, url, os);

  if (!cmd) return `ERROR: Cannot launch "${label}" on this operating system`;

  return new Promise<string>((resolve) => {
    exec(cmd, { timeout: 8000 }, (err) => {
      if (err && err.killed) {
        resolve(`ERROR: Command timed out trying to launch "${label}"`);
      } else if (err && err.code !== 0 && !err.message.includes('open')) {
        // macOS "open" exits 0 even when app name is fuzzy — only fail on real errors
        resolve(`ERROR: ${err.message.split('\n')[0]}`);
      } else {
        resolve(`Launched: ${label}`);
      }
    });
  });
}
