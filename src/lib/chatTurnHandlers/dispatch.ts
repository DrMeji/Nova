/**
 * Runtime turn dispatch — classify once, then owned handlers.
 * AIChat may still own edit/chat fallthrough until fully migrated.
 */

import { classifyTurn, type ClassifyTurnResult, type TurnKind } from '@/lib/classifyTurn';
import { runPlanTurn } from './plan';
import { runCreateTurn, type CreateTurnHost, type CreateTurnOutcome } from './create';
import { runDeleteTurn, type DeleteTurnHost } from './delete';
import { runOpenFolderTurn, type OpenFolderTurnHost } from './openFolder';
import { runCmdTurn, type RunCmdTurnHost } from './runCmd';
import { runEditTurn, type RunEditTurnHost, type RunEditTurnResult } from './edit';
import { runChatTurn, type ChatTurnHost, type ChatTurnResult } from './chat';

export type TurnDispatchPlan = {
  classified: ClassifyTurnResult;
  /** Kinds that already have dedicated handlers. */
  owned: TurnKind[];
};

export const HANDLER_OWNED_KINDS: TurnKind[] = [
  'create',
  'plan',
  'delete',
  'open_folder',
  'run_cmd',
  'edit', // surgical + runEditTurn
];

export function planTurnDispatch(
  message: string,
  opts?: Parameters<typeof classifyTurn>[1],
): TurnDispatchPlan {
  const classified = classifyTurn(message, opts);
  return {
    classified,
    owned: HANDLER_OWNED_KINDS,
  };
}

/** Next-step reply for when no host AND no model path exists — never a flat refusal. */
function missingHostReply(kind: 'delete' | 'open_folder' | 'run_cmd'): string {
  switch (kind) {
    case 'delete':
      return 'I can’t reach the file tools from this window, so nothing was deleted. Open the project folder (**+ → Open folder**) and say it again, or tell me which file and I’ll show the exact change.';
    case 'open_folder':
      return 'I can’t open folders from this window. Use **+ → Open folder** to pick it, or tell me the path and I’ll work from that.';
    default:
      return 'I can’t run commands from this window. Open the project in the desktop app and say it again, or ask and I’ll walk you through the exact command to run yourself.';
  }
}

/**
 * Missing owned host: prefer a real attempt over a canned refusal.
 * Order: chatHost (model answers helpfully) → next-step plain reply → continue (caller falls through).
 */
async function recoverMissingHost(
  host: DispatchHost,
  classified: ClassifyTurnResult,
  kind: 'delete' | 'open_folder' | 'run_cmd',
): Promise<DispatchOwnedResult> {
  if (host.chatHost && host.finishPlainReply) {
    const chatOutcome = await runChatTurn({
      ...host.chatHost,
      content: host.chatHost.content || host.content,
    });
    await host.finishPlainReply(chatOutcome.text, chatOutcome.provider || 'NOVA');
    return { status: 'handled', classified, chatOutcome };
  }
  if (host.finishPlainReply) {
    await host.finishPlainReply(missingHostReply(kind));
    return { status: 'handled', classified };
  }
  return { status: 'continue', classified };
}

/**
 * Host bag for owned kinds. Optional nested hosts mirror what AIChat passes today.
 * Missing delete/open/cmd host → chatHost attempt, else a next-step plain reply (never a flat refusal, never generate).
 * Missing create host → continue (scaffold still optional at call site).
 * editHost present → runEditTurn inside dispatch and return handled.
 */
export type DispatchHost = {
  content: string;
  classifyOpts?: Parameters<typeof classifyTurn>[1];
  mode?: string;
  /** When true, skip create (e.g. diskIntent.type === 'add_file'). */
  skipCreate?: boolean;

  planName?: string | null;
  planSummary?: string | null;
  planMessages?: Array<{ role?: string; content?: string } | null | undefined>;
  planPreferredModelId?: string | null;
  planOnProgress?: (msg: string) => void;
  savePlanBrief?: (brief: { name: string; summary: string; planLog?: string[] }) => void;
  finishPlainReply?: (text: string, provider?: string) => Promise<void> | void;

  createHost?: CreateTurnHost;
  deleteHost?: DeleteTurnHost;
  openFolderHost?: OpenFolderTurnHost;
  runCmdHost?: RunCmdTurnHost;
  /** When set, edit/keep_building runs runEditTurn here and returns handled. */
  editHost?: RunEditTurnHost;
  /** When set, default / chat-like kinds run runChatTurn here and return handled. */
  chatHost?: ChatTurnHost;
};

export type DispatchOwnedResult =
  | { status: 'handled'; classified: ClassifyTurnResult; createOutcome?: CreateTurnOutcome; editOutcome?: RunEditTurnResult; chatOutcome?: ChatTurnResult }
  | { status: 'edit'; classified: ClassifyTurnResult }
  | { status: 'continue'; classified: ClassifyTurnResult };

export async function dispatchOwnedTurn(host: DispatchHost): Promise<DispatchOwnedResult> {
  const classified = classifyTurn(host.content, host.classifyOpts);
  const modeOk = !host.mode || host.mode === 'general' || host.mode === 'code';

  switch (classified.kind) {
    case 'plan': {
      if (!modeOk) return { status: 'continue', classified };
      if (!host.finishPlainReply) return { status: 'continue', classified };
      await runPlanTurn({
        userMessage: host.content,
        name: host.planName,
        summary: host.planSummary,
        preferredModelId: host.planPreferredModelId,
        messages: host.planMessages,
        savePlanBrief: host.savePlanBrief,
        finishPlainReply: host.finishPlainReply,
        onProgress: host.planOnProgress,
      });
      return { status: 'handled', classified };
    }

    case 'create': {
      if (!modeOk || host.skipCreate || !host.createHost) {
        return { status: 'continue', classified };
      }
      const createOutcome = await runCreateTurn({
        ...host.createHost,
        content: host.createHost.content || host.content,
        classifiedCreateName: host.createHost.classifiedCreateName ?? classified.createName,
      });
      if (createOutcome.status === 'fallthrough_edit') {
        // Invariant: fallthrough must NOT have called finishPlainReply — edit owns the bubble.
        if (host.editHost) {
          const editOutcome = await runEditTurn({
            ...host.editHost,
            content: host.editHost.content || host.content,
          });
          return { status: 'handled', classified, createOutcome, editOutcome };
        }
        return { status: 'edit', classified };
      }
      // Create owns the single reply (finishPlainReply inside runCreateTurn).
      return { status: 'handled', classified, createOutcome };
    }

    case 'delete': {
      if (!host.deleteHost) return recoverMissingHost(host, classified, 'delete');
      const outcome = await runDeleteTurn({
        ...host.deleteHost,
        content: host.deleteHost.content || host.content,
      });
      if (outcome.status === 'miss') return { status: 'continue', classified };
      return { status: 'handled', classified };
    }

    case 'open_folder': {
      if (!host.openFolderHost) return recoverMissingHost(host, classified, 'open_folder');
      const outcome = await runOpenFolderTurn({
        ...host.openFolderHost,
        content: host.openFolderHost.content || host.content,
      });
      if (outcome.status === 'miss') return { status: 'continue', classified };
      return { status: 'handled', classified };
    }

    case 'run_cmd': {
      if (!host.runCmdHost) return recoverMissingHost(host, classified, 'run_cmd');
      const outcome = await runCmdTurn({
        ...host.runCmdHost,
        content: host.runCmdHost.content || host.content,
      });
      if (outcome.status === 'miss') return { status: 'continue', classified };
      return { status: 'handled', classified };
    }

    case 'edit':
    case 'keep_building': {
      if (host.editHost) {
        const editOutcome = await runEditTurn({
          ...host.editHost,
          content: host.editHost.content || host.content,
        });
        return { status: 'handled', classified, editOutcome };
      }
      return { status: 'edit', classified };
    }

    default: {
      // Kinds not owned above (chat / inspect / unknown): run chatHost when present.
      if (host.chatHost) {
        const chatOutcome = await runChatTurn({
          ...host.chatHost,
          content: host.chatHost.content || host.content,
        });
        if (host.finishPlainReply) {
          await host.finishPlainReply(
            chatOutcome.text,
            chatOutcome.provider || 'NOVA',
          );
        }
        return { status: 'handled', classified, chatOutcome };
      }
      return { status: 'continue', classified };
    }
  }
}
