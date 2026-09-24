/**
 * Create pipeline ownership — ordered hops only.
 * Talk stays in chat.ts. Craft stays in createCraft / novaBuildLoop.
 *
 * Order: plan → design → copy → craft → style → verify → critic
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
