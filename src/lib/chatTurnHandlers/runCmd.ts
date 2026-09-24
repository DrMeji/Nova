/**
 * Run-cmd turn — npm/pip/git shell. Runtime installs: honest manual link (no winget).
 */

import {
  inferAgentCommand,
  looksLikeRuntimeInstallAsk,
  runtimeInstallManualReply,
  runAgentCommand,
} from '@/lib/chatAgentExec';
import { looksLikeInstallDepsAsk } from '@/lib/folderPathAsk';
import { chatTurnAllowsExec } from '@/lib/chatAgentTurn';
import { executionModeLabel, getAgentExecutionMode } from '@/lib/agentExecution';

export type RunCmdTurnHost = {
  content: string;
  mode: string;
  composerMode: string | null;
  agentCwd: string | null | undefined;
  hasPackageJson: boolean;
  assistantId: string;
  finishAgentReply: (text: string, provider?: string) => void;
  setRunningStatus: (label: string) => void;
  confirm: (message: string) => boolean;
};

export type RunCmdTurnResult = { status: 'handled' } | { status: 'miss' };

export async function runCmdTurn(host: RunCmdTurnHost): Promise<RunCmdTurnResult> {
  if (host.mode !== 'general' && host.mode !== 'code') return { status: 'miss' };

  if (looksLikeRuntimeInstallAsk(host.content) && !looksLikeInstallDepsAsk(host.content)) {
    host.finishAgentReply(runtimeInstallManualReply(host.content), 'NOVA');
    return { status: 'handled' };
  }

  if (!host.agentCwd || !window.novaDesktop?.agentRun) return { status: 'miss' };
  if (!chatTurnAllowsExec(host.content, host.composerMode as never)) return { status: 'miss' };

  const agentCmd = inferAgentCommand(host.content, host.hasPackageJson);
  if (agentCmd) {
    const agentOutcome = await runAgentCommand({
      command: agentCmd,
      cwd: host.agentCwd,
      confirmLabel: agentCmd,
    });
    if (agentOutcome.needsConfirm) {
      const { command, cwd, label } = agentOutcome.needsConfirm;
      const modeLabel = executionModeLabel(getAgentExecutionMode());
      if (!host.confirm(`Run on your PC?\n\n${label}\n\nFolder: ${cwd}\n\nMode: ${modeLabel}`)) {
        host.finishAgentReply(
          'Command canceled. Say it again when ready, or switch to Run everything in Settings → Security.',
          'NOVA',
        );
        return { status: 'handled' };
      }
      host.setRunningStatus(`Running ${command}…`);
      const ran = await runAgentCommand({ command, cwd, skipConfirm: true });
      host.finishAgentReply(ran.reply || 'Command finished.', 'NOVA · agent');
      return { status: 'handled' };
    }
    if (agentOutcome.handled && agentOutcome.reply) {
      host.finishAgentReply(agentOutcome.reply, 'NOVA · agent');
      return { status: 'handled' };
    }
  }

  return { status: 'miss' };
}
