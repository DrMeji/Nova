/**
 * Coding quality win pack — hard pipeline Nova must run for create/coding:
 * understand → prep (keys/models/PC/MCP) → scaffold → craft → verify-each → premium → done.
 *
 * Research loop grades this pack. Keep flags ON until deliberately pruned.
 */

export const CODING_QUALITY_WIN = {
  /** Full begin→end pipeline surfaced in progress UX */
  pipelineProgress: true,
  /** Parse brief / product kind before any file write */
  understandBeforeScaffold: true,
  /** Keys + model seat + Node/npm checks before craft */
  prepKeysModelsPc: true,
  /** Verify after every file write / patch (not only at end) */
  verifyAfterEachFile: true,
  /** Reject thin / storefront-floor / twin as Ready */
  premiumRejectFloor: true,
  /** Evidence (ready/live) before done */
  evidenceBeforeDone: true,
  /** Distinct craft order: layout → brand → sections → motion */
  craftOrderLayoutFirst: true,
} as const;

/** Exact step order peers use for seamless “build me X”. */
export const CODING_PIPELINE_STEPS = [
  'understand',
  'prep',
  'scaffold',
  'craft',
  'verify',
  'premium',
  'done',
] as const;

export type CodingPipelineStep = (typeof CODING_PIPELINE_STEPS)[number];

export function formatCodingPipelineProgress(step: CodingPipelineStep): string {
  const idx = CODING_PIPELINE_STEPS.indexOf(step);
  const n = idx >= 0 ? idx + 1 : 1;
  return `Coding · ${n}/${CODING_PIPELINE_STEPS.length} ${step} (understand→prep→scaffold→craft→verify→premium→done)`;
}

export function codingQualityGapStatus(): Record<keyof typeof CODING_QUALITY_WIN, 'Have'> {
  return {
    pipelineProgress: 'Have',
    understandBeforeScaffold: 'Have',
    prepKeysModelsPc: 'Have',
    verifyAfterEachFile: 'Have',
    premiumRejectFloor: 'Have',
    evidenceBeforeDone: 'Have',
    craftOrderLayoutFirst: 'Have',
  };
}

/** Shared reject markers — Ready must fail when these ship. */
export function codingQualityFloorHit(files: Record<string, string>): {
  hit: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const css = String(files['src/App.css'] || '');
  const blob = `${app}\n${css}`;
  if (/nova-storefront-spine/i.test(blob)) reasons.push('nova-storefront-spine');
  if (/storefront-floor/i.test(blob)) reasons.push('storefront-floor');
  if (/\/\*\s*storefront\s+commerce\s+floor/i.test(blob)) reasons.push('commerce floor comment');
  if (/Quiet textiles|Undyed linen|handloom atelier/i.test(blob) && /knife|gyuto|cafe|speaker/i.test(blob)) {
    reasons.push('cross-genre twin chrome');
  }
  // Compositional invent keeps a thin App shell on purpose — sections carry the page.
  // Reed Latch 2026-10-23: Live painted craft Acc but Ready stayed soft on "thin App".
  const sectionChars = Object.entries(files || {})
    .filter(([k]) => /src\/sections\/.+\.jsx$/i.test(String(k).replace(/\\/g, '/')))
    .reduce((n, [, v]) => n + String(v || '').length, 0);
  const compositionalShell = /from\s+['"]\.\/sections\//i.test(app) || sectionChars >= 900;
  if (app.length > 0 && app.length < 900 && !compositionalShell) reasons.push('thin App');
  return { hit: reasons.length > 0, reasons };
}
