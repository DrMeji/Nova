/** Agent command + file execution policy (Cursor-style modes). */

import { getLocalPrefs } from '@/lib/localPrefs';
import {
  DEFAULT_APPROVAL_PREFS,
  commandNeedsApproval,
  type ApprovalPolicy,
  type SandboxMode,
} from '@/lib/agentHarness/p0';

export type AgentExecutionMode = 'allowlist' | 'auto_review' | 'run_all';

export function getAgentExecutionMode(): AgentExecutionMode {
  const mode = getLocalPrefs().agentExecutionMode;
  if (mode === 'auto_review' || mode === 'run_all') return mode;
  return 'allowlist';
}

/** Codex-style approval_policy + sandbox layered on prefs. */
export function getApprovalPrefs() {
  const p = getLocalPrefs() as LocalPrefsWithHarness;
  return {
    approvalPolicy: (p.approvalPolicy || DEFAULT_APPROVAL_PREFS.approvalPolicy) as ApprovalPolicy,
    sandboxMode: (p.sandboxMode || DEFAULT_APPROVAL_PREFS.sandboxMode) as SandboxMode,
    networkDenyByDefault: p.networkDenyByDefault !== false,
    networkAllowlist: Array.isArray(p.networkAllowlist) && p.networkAllowlist.length
      ? p.networkAllowlist
      : DEFAULT_APPROVAL_PREFS.networkAllowlist,
  };
}

type LocalPrefsWithHarness = ReturnType<typeof getLocalPrefs> & {
  approvalPolicy?: ApprovalPolicy;
  sandboxMode?: SandboxMode;
  networkDenyByDefault?: boolean;
  networkAllowlist?: string[];
};

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
  /^Checkpoint-Computer\b/i,
  /^Get-ComputerRestorePoint\b/i,
  /^Enable-ComputerRestore\b/i,
];

/** Shared allowlist — renderer + Electron should import this. */
export const EXEC_ALLOWLIST_PATTERNS = ALLOWLIST_PATTERNS;

/** Verify / install commands that should not need an extra confirm when allowlisted. */
export function isVerifyAgentCommand(command: string): boolean {
  const cmd = String(command || '').trim();
  return /^(npm|pnpm|yarn)(\.cmd)?\s+(test|ci|run\s+(test|build|lint|typecheck)|install)\b/i.test(cmd)
    || /^npx(\.cmd)?\s+vite\b/i.test(cmd)
    || /^git(\.exe)?\s+(status|diff|add|commit)\b/i.test(cmd);
}

const BLOCKED_PATTERNS: RegExp[] = [
  /\bformat\b/i,
  /\bdel\s+\/[sf]/i,
  /\brd\s+\/s/i,
  /\brmdir\s+\/s/i,
  /\brm\s+-rf\b/i,
  /Remove-Item\s+-Recurse\s+-Force\s+[A-Z]:\\/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
  /\bnode(?:\.exe)?\s+(-e|--eval)\b/i,
  /\bpython(?:\d+(?:\.\d+)?)?(?:\.exe)?\s+(-c|--command)\b/i,
  /\bpy(?:\.exe)?\s+(-3\s+)?-c\b/i,
  /^winget(\s|$)/i,
  /^choco(\s|$)/i,
];

/** Chat must never propose PC-wide package-manager installs. */
export function isChatBannedInstallCommand(command: string): boolean {
  const cmd = String(command || '').trim();
  return /^winget(\s|$)/i.test(cmd) || /^choco(\s|$)/i.test(cmd);
}

export function isBlockedAgentCommand(command: string): boolean {
  const cmd = String(command || '').trim();
  if (!cmd) return true;
  if (isChatBannedInstallCommand(cmd)) return true;
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
  if (isBlockedAgentCommand(command)) return true;
  // Harness P0: network deny-by-default + approval_policy.
  try {
    const harness = commandNeedsApproval(command, getApprovalPrefs());
    if (harness.needsApproval && /network deny|destructive|read-only/i.test(harness.reason)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  // OpenHands-style: verify cmds are low-risk when allowlisted.
  if (isVerifyAgentCommand(command) && isAllowlistedAgentCommand(command)) return false;
  const powerful = /^(node|python(?:\d+(?:\.\d+)?)?|py|npx)(\.exe|\.cmd)?(\s|$)/i.test(command.trim())
    || /\bnode(?:\.exe)?\s+(-e|--eval)\b/i.test(command)
    || /\bpython(?:\d+(?:\.\d+)?)?(?:\.exe)?\s+(-c|--command)\b/i.test(command)
    || /\bpy(?:\.exe)?\s+(-3\s+)?-c\b/i.test(command);
  if (powerful && !isVerifyAgentCommand(command)) return true;
  if (mode === 'run_all') return !isAllowlistedAgentCommand(command);
  if (mode === 'auto_review') return !isAllowlistedAgentCommand(command);
  // allowlist mode: verify auto; everything else still confirms
  if (isAllowlistedAgentCommand(command) && isVerifyAgentCommand(command)) return false;
  return true;
}

export function agentCommandAllowed(command: string): boolean {
  const mode = getAgentExecutionMode();
  if (isBlockedAgentCommand(command)) return false;
  if (/\bnode(?:\.exe)?\s+(-e|--eval)\b/i.test(command)
    || /\bpython(?:\d+(?:\.\d+)?)?(?:\.exe)?\s+(-c|--command)\b/i.test(command)
    || /\bpy(?:\.exe)?\s+(-3\s+)?-c\b/i.test(command)) {
    return false;
  }
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
