/**
 * Host-side judge after Live evidence (OpenHands /goal + proof-loop pattern).
 * Never trust prose — only evidence fields + file smoke + plan/design scores.
 * Soft brand token match so "Task Nest" ≈ TaskNest does not false-fail.
 */

import type { CreateEvidence } from '@/lib/createEvidence';
import { smokeCheckCreateFiles } from '@/lib/createEvidence';
import {
  buildProductPlan,
  scorePlanContract,
  scoreStartingDesignQuality,
} from '@/lib/createProductPlan';

export type HostJudgeVerdict = {
  ok: boolean;
  reasons: string[];
};

const GENERIC_BRAND = /^(?:app|my\s*app|project|new\s*project|website|site|demo)$/i;

function brandPresentInApp(brand: string, app: string): boolean {
  const b = String(brand || '').trim();
  if (!b || GENERIC_BRAND.test(b)) return true;
  const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(escaped, 'i').test(app)) return true;
  // Token overlap: "Copper Mug Roasters" vs CopperMugRoasters / copper-mug
  const tokens = b
    .split(/[\s\-_/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !/^(the|and|for|app)$/i.test(t));
  if (!tokens.length) return true;
  const hit = tokens.filter((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app)).length;
  return hit >= Math.min(2, tokens.length) || (tokens.length === 1 && hit === 1);
}

/**
 * Independent of the craft model: re-check evidence + smoke against the brief.
 */
export function judgeCreateEvidence(opts: {
  evidence: CreateEvidence;
  files: Record<string, string>;
  brief: string;
  productName?: string;
  /** When true, require plan + starting-design scores (quality Ready). */
  requirePlanDesign?: boolean;
}): HostJudgeVerdict {
  const reasons: string[] = [];
  const ev = opts.evidence;
  if (!ev.pass) reasons.push('evidence.pass is false');
  if (!ev.mounted) reasons.push('UI not mounted');
  if (!ev.httpOk) reasons.push('Live HTTP failed');
  if (!ev.consoleClean) {
    const errs = Array.isArray(ev.consoleErrors) ? ev.consoleErrors : [];
    const onlySoftToast = errs.length > 0 && errs.every((e) =>
      /Live can't show the app|something in this file is broken/i.test(String(e || '')),
    );
    // Cove Latch: soft Live toast while paint verified must not block quality Ready.
    if (!(ev.mounted && onlySoftToast)) reasons.push('console not clean');
  }
  if (ev.smokeOk === false) reasons.push(ev.smokeDetail || 'smoke failed');
  if (ev.buildOk === false) {
    reasons.push(`project build failed${ev.buildErrors?.[0] ? `: ${ev.buildErrors[0].slice(0, 220)}` : ''}`);
  }

  // Re-smoke only when evidence did not already clear smoke (avoid double-flaky fails).
  if (ev.smokeOk !== true) {
    const smoke = smokeCheckCreateFiles(opts.files, opts.brief);
    if (!smoke.ok) reasons.push(`judge smoke: ${smoke.detail}`);
  }

  const brand = String(opts.productName || '').trim();
  if (brand.length >= 2) {
    // Compositional sites keep their visible brand in imported section modules.
    // Judge the source tree that App renders instead of requiring the brand text
    // to be duplicated into the thin App shell.
    const renderedSources = Object.entries(opts.files || {})
      .filter(([path]) => /^(?:src\/App\.(?:jsx|tsx)|src\/sections\/.*\.(?:jsx|tsx)|index\.html)$/i.test(path.replace(/\\/g, '/')))
      .map(([, body]) => String(body || ''))
      .join('\n');
    if (renderedSources && !brandPresentInApp(brand, renderedSources)) {
      reasons.push(`product brand missing from rendered source: ${brand}`);
    }
    const visibleText = String(ev.renderedSample || '').trim();
    if (ev.mounted && visibleText && !brandPresentInApp(brand, visibleText)) {
      reasons.push(`product brand not visible in Live sample: ${brand}`);
    }
  }

  const appLen = (opts.files['src/App.jsx'] || opts.files['src/App.tsx'] || '').length;
  if (appLen > 0 && appLen < 120) reasons.push('App source too thin for judge PASS');

  if (opts.requirePlanDesign !== false) {
    const plan = buildProductPlan(opts.brief, opts.productName || '');
    const planScore = scorePlanContract(opts.files, plan);
    if (!planScore.ok) {
      for (const r of planScore.reasons.slice(0, 4)) reasons.push(`plan: ${r}`);
    }
    const design = scoreStartingDesignQuality(opts.files, plan);
    if (!design.ok) {
      for (const r of design.reasons.slice(0, 3)) reasons.push(`design: ${r}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}
