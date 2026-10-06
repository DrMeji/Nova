/**
 * Create helpers (legacy ensemble exports).
 * Live create path is Single Brain Create in chatTurnHandlers/create.ts:
 * bare Vite → craft from brief → same-model style → originality lint → Live.
 * Plan/design/copy hops are dead for create (do not re-wire seat swaps).
 */

export {
  resolveCreateEnsembleTeam,
  assertSequentialEnsembleOk,
  ensembleMember,
  runCreatePlanHop,
  runCreateSpecHop,
  runCreateDesignHop,
  runCreateCopyHop,
  runCreateStyleHop,
  runCreateVerifyHop,
  runCreateCriticHop,
} from '@/lib/createEnsemble';

export type { CreateEnsembleTeam, EnsembleMember, EnsembleRole } from '@/lib/createEnsemble';
