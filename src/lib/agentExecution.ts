/** Agent command + file execution policy (Cursor-style modes). */

import { getLocalPrefs } from '@/lib/localPrefs';

export type AgentExecutionMode = 'allowlist' | 'auto_review' | 'run_all';

export function getAgentExecutionMode(): AgentExecutionMode {
  const mode = getLocalPrefs().agentExecutionMode;
  if (mode === 'auto_review' || mode === 'run_all') return mode;
  return 'allowlist';
}

export function executionModeLabel(mode: AgentExecutionMode): string {
  if (mode === 'run_all') return 'Run everything';
  if (mode === 'auto_review') return 'Auto-review';
  return 'Allowlist';
}

const ALLOWLIST_PATTERNS: RegExp[] = [
  /^npm(\s|$)/i,
  /^npx(\s|$)/i,
  /^pnpm(\s|$)/i,
  /^yarn(\s|$)/i,
  /^node(\s|$)/i,
  /^python(\s|$)/i,
  /^py(\s|-)/i,
  /^pip(\s|$)/i,
  /^pip3(\s|$)/i,
  /^git(\s|$)/i,
  /^winget(\s|$)/i,
  /^choco(\s|$)/i,
];

const BLOCKED_PATTERNS: RegExp[] = [
  /\bformat\b/i,
  /\bdel\s+\/[sf]/i,
  /\brd\s+\/s/i,
  /\brmdir\s+\/s/i,
  /\brm\s+-rf\b/i,
  /Remove-Item\s+-Recurse\s+-Force\s+[A-Z]:\\/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
];

export function isBlockedAgentCommand(command: string): boolean {
  const cmd = String(command || '').trim();
  if (!cmd) return true;
  return BLOCKED_PATTERNS.some(re => re.test(cmd));
}

export function isAllowlistedAgentCommand(command: string): boolean {
  const cmd = String(command || '').trim();
  if (!cmd || isBlockedAgentCommand(cmd)) return false;
  return ALLOWLIST_PATTERNS.some(re => re.test(cmd));
}

/** Whether this command may run without an extra confirm dialog. */
export function agentCommandNeedsConfirm(command: string): boolean {
  const mode = getAgentExecutionMode();
  if (mode === 'run_all') return false;
  if (mode === 'auto_review') return !isAllowlistedAgentCommand(command);
  return true;
}

export function agentCommandAllowed(command: string): boolean {
  const mode = getAgentExecutionMode();
  if (isBlockedAgentCommand(command)) return false;
  if (mode === 'run_all') return true;
  if (mode === 'auto_review') return true;
  return isAllowlistedAgentCommand(command);
}

export function agentExecutionBlockedMessage(command: string): string {
  if (isBlockedAgentCommand(command)) {
    return 'That command is blocked for safety.';
  }
  return 'Command not on the allowlist. Switch to **Auto-review** or **Run everything** under Settings → Security → Execution & approvals.';
}
