/**
 * Documented turn dispatch contract.
 * AIChat should call classifyTurn once, then switch — handlers own work.
 */

import { classifyTurn, type ClassifyTurnResult, type TurnKind } from '@/lib/classifyTurn';

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
  'edit', // surgical path
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
