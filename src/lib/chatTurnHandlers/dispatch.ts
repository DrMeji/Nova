/**
 * Runtime turn dispatch — classify once, then owned handlers.
 * AIChat may still own edit/chat fallthrough until fully migrated.
 */

import { classifyTurn, type ClassifyTurnResult, type TurnKind } from '@/lib/classifyTurn';
import { handlePlanTurnReply } from './plan';
import { runCreateTurn, type CreateTurnHost, type CreateTurnOutcome } from './create';
import { runDeleteTurn, type DeleteTurnHost } from './delete';
import { runOpenFolderTurn, type OpenFolderTurnHost } from './openFolder';
import { runCmdTurn, type RunCmdTurnHost } from './runCmd';

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

/**
 * Host bag for owned kinds. Optional nested hosts mirror what AIChat passes today.
 * Missing host for a kind → that branch is skipped (continue/edit as appropriate).
 */
export type DispatchHost = {
  content: string;
  classifyOpts?: Parameters<typeof classifyTurn>[1];
  mode?: string;
  /** When true, skip create (e.g. diskIntent.type === 'add_file'). */
  skipCreate?: boolean;

  planName?: string | null;
  planSummary?: string | null;
  savePlanBrief?: (brief: { name: string; summary: string }) => void;
  finishPlainReply?: (text: string, provider?: string) => Promise<void> | void;

  createHost?: CreateTurnHost;
  deleteHost?: DeleteTurnHost;
  openFolderHost?: OpenFolderTurnHost;
  runCmdHost?: RunCmdTurnHost;
};

export type DispatchOwnedResult =
  | { status: 'handled'; classified: ClassifyTurnResult; createOutcome?: CreateTurnOutcome }
  | { status: 'edit'; classified: ClassifyTurnResult }
  | { status: 'continue'; classified: ClassifyTurnResult };

export async function dispatchOwnedTurn(host: DispatchHost): Promise<DispatchOwnedResult> {
  const classified = classifyTurn(host.content, host.classifyOpts);
  const modeOk = !host.mode || host.mode === 'general' || host.mode === 'code';

  switch (classified.kind) {
    case 'plan': {
      if (!modeOk) return { status: 'continue', classified };
      const reply = handlePlanTurnReply({
        name: host.planName,
        summary: host.planSummary,
        savePlanBrief: host.savePlanBrief,
      });
      if (host.finishPlainReply) await host.finishPlainReply(reply);
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
        return { status: 'edit', classified };
      }
      return { status: 'handled', classified, createOutcome };
    }

    case 'delete': {
      if (!host.deleteHost) return { status: 'continue', classified };
      const outcome = await runDeleteTurn({
        ...host.deleteHost,
        content: host.deleteHost.content || host.content,
      });
      if (outcome.status === 'miss') return { status: 'continue', classified };
      return { status: 'handled', classified };
    }

    case 'open_folder': {
      if (!host.openFolderHost) return { status: 'continue', classified };
      const outcome = await runOpenFolderTurn({
        ...host.openFolderHost,
        content: host.openFolderHost.content || host.content,
      });
      if (outcome.status === 'miss') return { status: 'continue', classified };
      return { status: 'handled', classified };
    }

    case 'run_cmd': {
      if (!host.runCmdHost) return { status: 'continue', classified };
      const outcome = await runCmdTurn({
        ...host.runCmdHost,
        content: host.runCmdHost.content || host.content,
      });
      if (outcome.status === 'miss') return { status: 'continue', classified };
      return { status: 'handled', classified };
    }

    case 'edit':
    case 'keep_building':
      return { status: 'edit', classified };

    default:
      return { status: 'continue', classified };
  }
}
