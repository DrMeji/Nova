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
import { scoreAskMatch } from '@/lib/createAskContract';
import {
  compositionalDepthIsComplete,
  formatCompositionalSectionSpecs,
  compositionalSectionFileSubstantial,
  thinWantsCompositionalShell,
  looksLikeInventFloorTwin,
  atelierAccMissingLayoutSalt,
  looksLikeHollowAtelierCraft,
  looksLikeEmptySwatchAtelier,
} from '@/lib/createThinPath';
import { understandCreateBrief, verifyCreateBriefAgainstFiles } from '@/lib/codingCreatePipeline';
import {
  briefWantsProductLadder,
  gradeProductQuality,
} from '@/lib/createProductLadder';
import { artifactWantsProductLadder, resolveArtifactKind } from '@/lib/createArtifactKind';

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
 * Thin create: floorFallback / repairOwned product shells never unlock quality Ready.
 */
export function judgeCreateVerified(opts: {
  evidence: CreateEvidence;
  files: Record<string, string>;
  brief: string;
  productName?: string;
  floorFallback?: boolean;
  /** When true (thin create), repairOwnedProduct also blocks quality Ready. */
  repairOwnedProduct?: boolean;
}): CreateVerifiedVerdict {
  const planGate = gatePlanPass(opts.files, opts.brief, opts.productName);
  const designGate = gateDesignPass(opts.files, planGate.plan);
  const asksForVisualArt = /\b(?:website|site|homepage|landing|brand|shop|store|hero|product|visual|image|art|photo|render|illustration|app|application|dashboard|tool|calculator|todo|notes|game|chat)\b/i.test(opts.brief);
  const askMatch = asksForVisualArt
    ? scoreAskMatch(opts.files, opts.brief, opts.productName || '')
    : { ok: true, score: 10, reasons: [] };
  const judge = judgeCreateEvidence({
    evidence: opts.evidence,
    files: opts.files,
    brief: opts.brief,
    productName: opts.productName,
  });

  const compositionalComplete = compositionalDepthIsComplete(
    opts.files,
    opts.brief,
    opts.productName || '',
  );

  // Coding foundation: Live = mount/evidence only. Composition stays a quality badge gate.
  const liveUnlock = Boolean(
    opts.evidence.pass || (opts.evidence.httpOk && opts.evidence.mounted),
  );
  const floorFallback = Boolean(opts.floorFallback);
  const repairOwned = Boolean(opts.repairOwnedProduct);
  const inventTwin = looksLikeInventFloorTwin(opts.files);
  // Fox Latch 2026-10-23: twin Acc (same layout shell, swapped names) was Ready while
  // floorFallback was false — unique-layout atelier asks must never Ready on a twin.
  // Quill Latch: also treat leather/atelier productName as enough signal when brief
  // was truncated upstream and lost "unique layout" / "premium" tokens.
  const twinBrief = `${opts.brief || ''} ${opts.productName || ''}`;
  const twinBlocksQuality = inventTwin && (
    /\b(?:unique layout|no generic|atelier|leather[- ]goods|premium|professional|full[- ]?bleed|latch)\b/i.test(
      twinBrief,
    )
  );
  // Onyx Latch: hollow craft (Our Products / Espresso Briefcase) Ready'd with no layout salt.
  // Noir Latch: empty identical product-swatch gradients Ready'd as "unique".
  const missingSaltBlocks = atelierAccMissingLayoutSalt(opts.files, twinBrief)
    || looksLikeHollowAtelierCraft(opts.files, twinBrief)
    || looksLikeEmptySwatchAtelier(opts.files, twinBrief);
  const floorBlocksQuality = (floorFallback && (inventTwin || repairOwned))
    || twinBlocksQuality
    || missingSaltBlocks;

  const reasons: string[] = [];
  if (!judge.ok) reasons.push(...judge.reasons.slice(0, 6));
  if (!planGate.ok) reasons.push(...planGate.reasons.slice(0, 4).map((r) => `plan: ${r}`));
  if (!designGate.ok) reasons.push(...designGate.reasons.slice(0, 3).map((r) => `design: ${r}`));
  if (!askMatch.ok) reasons.push(...askMatch.reasons.slice(0, 6).map((r) => `ask: ${r}`));
  if (!compositionalComplete) {
    // Mirror compositionalDepthIsComplete — optional bands must not appear as Ready blockers.
    const optional = new Set([
      'NotesSection',
      'SecondaryCtaSection',
      'ProofSection',
      'SubscribeSection',
      'ToolSection',
      'ContentSection1',
      'ContentSection2',
      'ContentSection3',
      'PageBodySection',
    ]);
    const missing = thinWantsCompositionalShell(opts.brief)
      ? formatCompositionalSectionSpecs(opts.brief, opts.productName || '')
        .filter((spec) => !optional.has(spec.componentName))
        .filter((spec) => !compositionalSectionFileSubstantial(String(opts.files[spec.filePath] || '')))
        .map((spec) => spec.filePath)
      : [];
    reasons.push(`compositional content incomplete: ${missing.slice(0, 4).join(', ') || 'required sections missing'}`);
  }
  if (floorBlocksQuality) {
    reasons.push(
      missingSaltBlocks
        ? 'unique-layout atelier Acc missing layout salt / hollow craft shell'
        : inventTwin
          ? (twinBlocksQuality
            ? 'invent-floor twin layout still on Acc — unique craft required'
            : 'floor fallback used — invent-floor twin still on Acc')
          : 'floor fallback used — original craft incomplete',
    );
  }
  if (repairOwned) reasons.push('repair owned product shell — not original craft');

  // Peer Done checks (Replit/Devin) — brief must-haves must appear in App before quality Ready.
  const understand = understandCreateBrief({
    brief: opts.brief,
    brand: opts.productName || '',
  });
  const briefVerify = verifyCreateBriefAgainstFiles({
    files: opts.files,
    brand: opts.productName || understand.brand,
    mustHave: understand.mustHave,
    verifyChecks: understand.verifyChecks,
    outOfScope: understand.outOfScope,
  });
  if (!briefVerify.ok) {
    for (const m of briefVerify.missing.slice(0, 4)) reasons.push(`brief miss: ${m}`);
    for (const v of briefVerify.violations.slice(0, 3)) reasons.push(`brief violate: ${v}`);
  }

  // Quality Ready still requires composition + plan/design/ask + brief; Live does not.
  let qualityReady = Boolean(
    liveUnlock
    && judge.ok
    && planGate.ok
    && designGate.ok
    && askMatch.ok
    && compositionalComplete
    && briefVerify.ok
    && !floorBlocksQuality
    && !repairOwned
    && opts.evidence.smokeOk !== false
  );

  // Product invents only: Ready means Premium craft — never for CLI/API/dashboard.
  if (
    qualityReady
    && artifactWantsProductLadder(resolveArtifactKind(opts.brief), opts.brief)
    && briefWantsProductLadder(opts.brief)
  ) {
    const graded = gradeProductQuality(
      opts.files,
      opts.brief,
      opts.productName || '',
    );
    if (!graded.okPremium) {
      qualityReady = false;
      reasons.push(
        `product invent below Premium (${graded.label})`,
        ...graded.reasons.slice(0, 4),
      );
    }
  }

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
