/**
 * Create pass spine — gather → act → verify → retry (Freebuff / OpenHands pattern).
 *
 * Craft stays createV2 staged write (avoids tool-loop thrash). The spine owns:
 * plan → structure → design → interact → verify → critic, with hard Ready gates.
 */

import {
  buildProductPlan,
  scorePlanContract,
  scoreStartingDesignQuality,
  type ProductPlan,
} from '@/lib/createProductPlan';
import type { CreateEvidence } from '@/lib/createEvidence';
import { judgeCreateEvidence, type HostJudgeVerdict } from '@/lib/createHostJudge';

export const CREATE_PASS_ORDER = [
  'plan',
  'structure',
  'design',
  'interact',
  'verify',
  'critic',
] as const;

export type CreatePassId = (typeof CREATE_PASS_ORDER)[number];

export type CreatePassGate = {
  passId: CreatePassId;
  ok: boolean;
  reasons: string[];
  score?: number;
};

export type CreateVerifiedVerdict = {
  /** Live button may unlock (HTTP + mount). */
  liveUnlock: boolean;
  /** Product quality Ready — plan + design + host judge. */
  qualityReady: boolean;
  plan: ProductPlan;
  planGate: CreatePassGate;
  designGate: CreatePassGate;
  judge: HostJudgeVerdict;
  reasons: string[];
  floorFallback: boolean;
};

export function createPassStatusLabel(passId: CreatePassId, detail?: string): string {
  const base: Record<CreatePassId, string> = {
    plan: 'Plan · product structure',
    structure: 'Structure · shell + regions',
    design: 'Design · type + atmosphere',
    interact: 'Interact · primary actions',
    verify: 'Verify · Live evidence',
    critic: 'Critic · plan + design grade',
  };
  const label = base[passId] || passId;
  return detail ? `${label} · ${detail}` : label;
}

/** Craft rules block: ordered passes the model must complete. */
export function formatCreatePassSpineBlock(plan: ProductPlan): string {
  return [
    '## Create pass spine (required order — do not skip)',
    `1) PLAN — family **${plan.compositionFamily}** / genre **${plan.genre}**`,
    `2) STRUCTURE — regions: ${plan.requiredRegions.join(', ')}`,
    `3) DESIGN — intentional type + atmosphere (no phone-column, no cream-terracotta AI look)`,
    `4) INTERACT — ${plan.requiredInteractions.join(', ') || 'primary controls'}`,
    '5) VERIFY — complete tags/braces; App must mount',
    '6) CRITIC — checklist must pass before you stop:',
    ...plan.checklist.map((c) => `   - ${c}`),
    'Emit REQUIRED @@@FILE paths from the Product plan. Wrong-family marketing landing = FAIL.',
  ].join('\n');
}

export function gatePlanPass(
  files: Record<string, string>,
  brief: string,
  productName?: string,
): CreatePassGate & { plan: ProductPlan } {
  const plan = buildProductPlan(brief, productName || '');
  const scored = scorePlanContract(files, plan);
  return {
    passId: 'plan',
    ok: scored.ok,
    reasons: scored.reasons,
    score: scored.score,
    plan,
  };
}

export function gateDesignPass(
  files: Record<string, string>,
  plan: ProductPlan,
): CreatePassGate {
  const scored = scoreStartingDesignQuality(files, plan);
  return {
    passId: 'design',
    ok: scored.ok,
    reasons: scored.reasons,
    score: scored.score,
  };
}

/**
 * Hard Ready definition for create quality (not Live unlock alone).
 * Floors may unlock Live but cannot force qualityReady.
 */
export function judgeCreateVerified(opts: {
  evidence: CreateEvidence;
  files: Record<string, string>;
  brief: string;
  productName?: string;
  floorFallback?: boolean;
}): CreateVerifiedVerdict {
  const planGate = gatePlanPass(opts.files, opts.brief, opts.productName);
  const designGate = gateDesignPass(opts.files, planGate.plan);
  const judge = judgeCreateEvidence({
    evidence: opts.evidence,
    files: opts.files,
    brief: opts.brief,
    productName: opts.productName,
  });

  const liveUnlock = Boolean(opts.evidence.pass || (opts.evidence.httpOk && opts.evidence.mounted));
  const floorFallback = Boolean(opts.floorFallback);

  const reasons: string[] = [];
  if (!judge.ok) reasons.push(...judge.reasons.slice(0, 6));
  if (!planGate.ok) reasons.push(...planGate.reasons.slice(0, 4).map((r) => `plan: ${r}`));
  if (!designGate.ok) reasons.push(...designGate.reasons.slice(0, 3).map((r) => `design: ${r}`));
  if (floorFallback) reasons.push('floor fallback used — original craft incomplete');

  // Floor can unlock Live but never qualityReady.
  const qualityReady = Boolean(
    liveUnlock
    && judge.ok
    && planGate.ok
    && designGate.ok
    && !floorFallback
    && opts.evidence.smokeOk !== false
  );

  return {
    liveUnlock,
    qualityReady,
    plan: planGate.plan,
    planGate,
    designGate,
    judge,
    reasons,
    floorFallback,
  };
}

/** Prefer patch-sized repair prompts over whole-App rewrite. */
export function formatCreateCommanderFixPrompt(opts: {
  brief: string;
  productName: string;
  evidenceText: string;
  planReasons: string[];
  designReasons: string[];
}): string {
  return [
    `COMMANDER FIX for **${opts.productName}** — targeted patches only.`,
    'Prefer TOOL: patch / small @@@FILE rewrites of the broken region — not a full App novel.',
    'Close these gaps, then stop:',
    ...opts.planReasons.slice(0, 5).map((r) => `- plan: ${r}`),
    ...opts.designReasons.slice(0, 4).map((r) => `- design: ${r}`),
    '',
    opts.evidenceText,
    '',
    `Brief: ${String(opts.brief || '').slice(0, 600)}`,
  ].join('\n');
}
