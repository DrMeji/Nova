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

const CANT_YET = "I can't do that yet.";

/**
 * Host bag for owned kinds. Optional nested hosts mirror what AIChat passes today.
 * Missing delete/open/cmd host → plain reply + handled (never fall through to generate).
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
      if (!host.deleteHost) {
        if (host.finishPlainReply) await host.finishPlainReply(CANT_YET);
        return { status: 'handled', classified };
      }
      const outcome = await runDeleteTurn({
        ...host.deleteHost,
        content: host.deleteHost.content || host.content,
      });
      if (outcome.status === 'miss') return { status: 'continue', classified };
      return { status: 'handled', classified };
    }

    case 'open_folder': {
      if (!host.openFolderHost) {
        if (host.finishPlainReply) await host.finishPlainReply(CANT_YET);
        return { status: 'handled', classified };
      }
      const outcome = await runOpenFolderTurn({
        ...host.openFolderHost,
        content: host.openFolderHost.content || host.content,
      });
      if (outcome.status === 'miss') return { status: 'continue', classified };
      return { status: 'handled', classified };
    }

    case 'run_cmd': {
      if (!host.runCmdHost) {
        if (host.finishPlainReply) await host.finishPlainReply(CANT_YET);
        return { status: 'handled', classified };
      }
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
