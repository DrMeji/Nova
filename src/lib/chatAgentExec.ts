/**
 * Chat agent command routing — npm/pip/git/runtime installs (Steps 4–5).
 */

import {
  agentCommandAllowed,
  agentCommandNeedsConfirm,
  agentExecutionBlockedMessage,
  getAgentExecutionMode,
} from '@/lib/agentExecution';
import { inferInstallCommand, looksLikeInstallDepsAsk } from '@/lib/folderPathAsk';
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
  return RUNTIME_INSTALL_RE.test(String(message || '').trim());
}

export function proposeRuntimeInstall(message: string): string | null {
  const t = String(message || '').toLowerCase();
  if (/\bnode\b|\bnpm\b/.test(t)) return 'winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements';
  if (/\bpython\b|\bpip\b/.test(t)) return 'winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements';
  if (/\bgit\b/.test(t)) return 'winget install Git.Git --accept-package-agreements --accept-source-agreements';
  return null;
}

export async function probeRuntime(command: string): Promise<boolean> {
  if (!window.arkDesktop?.agentRun) return false;
  const ran = await window.arkDesktop.agentRun({ command, cwd: undefined, mode: getAgentExecutionMode() });
  return Boolean(ran.ok);
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
    mode: getAgentExecutionMode(),
  });
  const out = ran.output?.trim();
  const reply = ran.ok
    ? [`Ran \`${command}\` in your workspace.`, out || 'Finished with no output.'].filter(Boolean).join('\n\n')
    : [`Could not run \`${command}\`.`, ran.error || out || 'Command failed.'].filter(Boolean).join('\n\n');
  return { handled: true, reply };
}

export function looksLikeAgentCommandAsk(message: string, hasPackageJson: boolean): boolean {
  return Boolean(inferAgentCommand(message, hasPackageJson))
    || looksLikeInstallDepsAsk(message)
    || looksLikeRuntimeInstallAsk(message);
}
