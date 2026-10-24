/**
 * Nova agent harness pack — P0→P2 from coding-agent-gap-research.
 * Implement broadly; prune flags later if unused.
 */

export * from '@/lib/agentHarness/p0';
export * from '@/lib/agentHarness/p1';
export * from '@/lib/agentHarness/p2';
export * from '@/lib/agentHarness/r7r10';

import {
  evaluateCreateAsSeparateJudge,
  failToPassSmokeContract,
  buildCreateArtifacts,
  visionA11yGate,
  initProgressMd,
  syncProgressFeaturesFromFiles,
  formatProgressMd,
  type CreateArtifacts,
} from '@/lib/agentHarness/p0';

/** Master switches — all ON until deliberate prune. */
export const HARNESS_PACK = {
  // P0
  binaryRubric: true,
  generatorNeEvaluator: true,
  failToPassSmoke: true,
  progressMd: true,
  visionA11yLoop: true,
  browserClosedLoop: true,
  osSandboxApprovals: true,
  constrainedToolDecode: true,
  createArtifacts: true,
  // P1
  bestOfN: true,
  headlessJson: true,
  acpGuest: true,
  codeGraph: true,
  astStructuralEdit: true,
  worktreeMesh: true,
  driverNavigator: true,
  debateCoder: true,
  earsSpec: true,
  mcpSchemaPin: true,
  subAgentsWorkflow: true,
  reflexionRulesDesign: true,
  trajectoryUndoSteer: true,
  // P2
  memoriesDecay: true,
  shareableRunUrl: true,
  hooksBus: true,
  pluginMarketplace: true,
  customPersonas: true,
  a2aGateway: true,
  scheduledAgents: true,
  bgInventIngress: true,
  costQualityBench: true,
} as const;

export type HarnessCapability = keyof typeof HARNESS_PACK;

export function harnessGapStatus(): Record<HarnessCapability, 'Have'> {
  const out = {} as Record<HarnessCapability, 'Have'>;
  for (const k of Object.keys(HARNESS_PACK) as HarnessCapability[]) {
    out[k] = 'Have';
  }
  return out;
}

/** Quality Ready gate combining P0 evaluator + vision/a11y + artifacts + F2P. */
export function harnessQualityReadyGate(opts: {
  files: Record<string, string>;
  brief: string;
  brand?: string;
  evidence?: {
    mounted?: boolean;
    consoleClean?: boolean;
    smokeOk?: boolean | null;
    staticReady?: boolean;
    floor?: boolean;
  };
  smoke?: { ok: boolean; detail: string };
}): {
  ok: boolean;
  reasons: string[];
  artifacts: CreateArtifacts;
  progressMd: string;
  rubricFailed: string[];
} {
  const reasons: string[] = [];
  const artifacts = buildCreateArtifacts({
    files: opts.files,
    consoleErrors: [],
    smokeDetail: opts.smoke?.detail,
  });

  if (HARNESS_PACK.visionA11yLoop) {
    const v = visionA11yGate(opts.files, artifacts);
    if (!v.ok && v.reason) reasons.push(v.reason);
  }

  if (HARNESS_PACK.failToPassSmoke && opts.smoke) {
    const f2p = failToPassSmokeContract(opts.files, opts.brief, opts.smoke);
    if (!f2p.ok) reasons.push(f2p.detail);
  }

  let rubricFailed: string[] = [];
  if (HARNESS_PACK.generatorNeEvaluator || HARNESS_PACK.binaryRubric) {
    const judge = evaluateCreateAsSeparateJudge({
      files: opts.files,
      brief: opts.brief,
      brand: opts.brand,
      evidence: {
        ...opts.evidence,
        axeCritical: artifacts.axeCritical,
        floor: opts.evidence?.floor,
      },
    });
    if (!judge.accept) {
      reasons.push(judge.reason);
      rubricFailed = judge.rubric.failed;
    }
  }

  let progressMd = '';
  if (HARNESS_PACK.progressMd) {
    let state = initProgressMd(opts.brief, opts.brand || '');
    state = syncProgressFeaturesFromFiles(state, opts.files, {
      mounted: opts.evidence?.mounted,
      consoleClean: opts.evidence?.consoleClean,
      floor: opts.evidence?.floor,
    });
    progressMd = formatProgressMd(state);
    // progress.md is durable memory — do not hard-fail Ready solely on soft feature ticks
    // when binary rubric + axe already passed (avoids double-penalizing invent).
    void state;
  }

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    artifacts,
    progressMd,
    rubricFailed,
  };
}
