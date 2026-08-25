/**
 * Chat agent command routing. npm/pip/git/runtime installs (Steps 4–5).
 */

import {
  agentCommandAllowed,
  agentCommandNeedsConfirm,
  agentExecutionBlockedMessage,
} from '@/lib/agentExecution';
import { inferInstallCommand, looksLikeInstallDepsAsk, looksLikeRunDevServerAsk } from '@/lib/folderPathAsk';
import { classifyGitAsk } from '@/lib/arkGitClient';

export type AgentRunOutcome = {
  handled: boolean;
  reply?: string;
  needsConfirm?: { command: string; cwd: string; label: string };
};

export function inferGitShellCommand(message: string): string | null {
  const t = String(message || '').toLowerCase();
  if (/\bgit status\b/.test(t) || /\bwhat('s| is) (changed|the status)\b/.test(t)) return 'git status';
  const kind = classifyGitAsk(message);
  if (!kind) return null;
  if (kind === 'diff') return 'git diff';
  if (kind === 'commit') {
    const msg = message.match(/commit(?:\s+with|\s+message)?\s+["“']([^"”']+)["”']/i)?.[1]
      || message.match(/commit\s+(?:message\s+)?(.+)/i)?.[1]?.trim();
    return msg ? `git commit -am "${msg.replace(/"/g, '\\"')}"` : 'git status';
  }
  return null;
}

export function inferAgentCommand(message: string, hasPackageJson: boolean): string | null {
  const install = inferInstallCommand(message, hasPackageJson);
  if (install) return install;
  return inferGitShellCommand(message);
}

const RUNTIME_INSTALL_RE =
  /\b(don'?t|do not)\s+have\s+(node|npm|python|pip|git)\b|\b(install|get|need)\s+(node|npm|python|git)\b|\bno\s+(node|python|git)\b/i;

export function looksLikeRuntimeInstallAsk(message: string): boolean {
  const t = String(message || '').trim();
  if (!t) return false;
  // "install npm dependencies" = project deps, not winget Node.js
  if (looksLikeInstallDepsAsk(t)) return false;
  if (/\b(install|add|get)\b[\s\S]{0,32}\b(dependencies|packages|node_modules|requirements)\b/i.test(t)) {
    return false;
  }
  if (/\bnpm\s+install\b/i.test(t) || /\bpip\s+install\b/i.test(t)) return false;
  return RUNTIME_INSTALL_RE.test(t);
}

export function proposeRuntimeInstall(message: string): string | null {
  const t = String(message || '').toLowerCase();
  if (looksLikeInstallDepsAsk(message)) return null;
  if (/\bnpm\s+install\b/i.test(t) || /\bpip\s+install\b/i.test(t)) return null;
  if (/\b(install|need|get)\s+npm\b/.test(t) && /\b(dependencies|packages)\b/.test(t)) return null;
  if (/\bnode\b/.test(t) && !/\bnode_modules\b/.test(t)) {
    return 'winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements';
  }
  if (/\bnpm\b/.test(t) && /\b(install|need|get)\s+node\b/.test(t)) {
    return 'winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements';
  }
  if (/\bpython\b|\bpip\b/.test(t)) return 'winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements';
  if (/\bgit\b/.test(t)) return 'winget install Git.Git --accept-package-agreements --accept-source-agreements';
  return null;
}

export async function probeRuntime(command: string): Promise<boolean> {
  if (!window.arkDesktop?.agentRun) return false;
  const ran = await window.arkDesktop.agentRun({
    command,
    cwd: undefined,
    skipConfirm: true,
    userConfirmed: true,
  });
  return Boolean(ran.ok);
}

const WINGET_NOISE_RE = [
  /^this application is licensed to you by its owner\.?$/i,
  /^microsoft is not responsible for, nor does it grant any licenses to, third-party packages\.?$/i,
  /^found an existing package already installed/i,
  /^found .+\] version /i,
  /^downloading https?:\/\//i,
  /^successfully verified installer hash/i,
  /^installer hash verified/i,
];

function sanitizeAgentOutput(raw: string, command: string): string {
  const cmd = String(command || '').trim();
  const text = String(raw || '').trim();
  if (!text) return 'Done.';

  if (/^winget\b/i.test(cmd)) {
    const pkg = cmd.match(/winget\s+install\s+(\S+)/i)?.[1] || 'package';
    if (/\bsuccessfully installed\b/i.test(text)) {
      return `**${pkg}** installed successfully.`;
    }
    if (/\bno available upgrade found\b/i.test(text) || /\balready installed\b/i.test(text)) {
      return `**${pkg}** is already installed.`;
    }
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      .filter(l => !WINGET_NOISE_RE.some(re => re.test(l)));
    const tail = lines.slice(-3).join('\n');
    return tail || 'Install finished.';
  }

  if (/^npm\s+install\b/i.test(cmd) || /^pnpm\s+install\b/i.test(cmd) || /^yarn(\s+install)?\b/i.test(cmd)) {
    if (/\badded \d+ package/i.test(text) || /\bup to date\b/i.test(text) || /\baudited \d+ package/i.test(text)) {
      return 'Dependencies installed successfully.';
    }
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const useful = lines.filter(l => /^(added|removed|changed|up to date|audited)\b/i.test(l));
    return useful.slice(-4).join('\n') || 'Dependencies installed successfully.';
  }

  if (/^pip\s+install\b/i.test(cmd)) {
    if (/\bsuccessfully installed\b/i.test(text)) return 'Python packages installed successfully.';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.filter(l => /successfully installed|requirement already satisfied/i.test(l)).slice(-4).join('\n')
      || 'Install finished.';
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => !WINGET_NOISE_RE.some(re => re.test(l)));
  if (lines.length <= 8) return lines.join('\n');
  return [...lines.slice(0, 2), '…', ...lines.slice(-4)].join('\n');
}

export async function runAgentCommand(opts: {
  command: string;
  cwd: string;
  confirmLabel?: string;
  skipConfirm?: boolean;
}): Promise<AgentRunOutcome> {
  const { command, cwd } = opts;
  if (!window.arkDesktop?.agentRun) {
    return { handled: true, reply: 'Agent commands need the ARK desktop app.' };
  }
  if (!agentCommandAllowed(command)) {
    return { handled: true, reply: agentExecutionBlockedMessage(command) };
  }
  if (!opts.skipConfirm && agentCommandNeedsConfirm(command)) {
    return {
      handled: true,
      needsConfirm: {
        command,
        cwd,
        label: opts.confirmLabel || command,
      },
    };
  }
  const ran = await window.arkDesktop.agentRun({
    command,
    cwd,
    skipConfirm: true,
    userConfirmed: true,
  });
  const out = sanitizeAgentOutput(ran.output?.trim() || '', command);
  const reply = ran.ok
    ? out
    : [`Could not run \`${command}\`.`, ran.error || out || 'Command failed.'].filter(Boolean).join('\n\n');
  return { handled: true, reply };
}

export function looksLikeAgentCommandAsk(message: string, hasPackageJson: boolean): boolean {
  return Boolean(inferAgentCommand(message, hasPackageJson))
    || looksLikeInstallDepsAsk(message)
    || looksLikeRunDevServerAsk(message)
    || looksLikeRuntimeInstallAsk(message);
}
