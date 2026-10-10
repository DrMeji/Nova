/**
 * Create Ready ownership — Preview Ready / Live unlock gates live here.
 */
import type { CreateJob } from '@/lib/createJobStore';
import { scoreAskMatch } from '@/lib/createAskContract';
import {
  isThinCreatePath,
  thinBlocksLivePreview,
  thinLiveVisualDeficits,
  thinWantsCompositionalShell,
  heroSectionWrongGenreArt,
} from '@/lib/createThinPath';
import { detectHeroProductKind } from '@/lib/createIdentity';

export type CanUnlockCreateLiveResult = { ok: boolean; reasons: string[] };

/**
 * UI-ready §D — brief-required bands the seed stack owns must be visible in the mounted tree.
 * Only compositional marketing/brand asks are gated; tool/app/toy creates stay thin and free.
 * Reuses scoreAskMatch reasons (id OR #href OR real copy) so a renamed-but-present band passes.
 * Patch 6 — band-purpose mismatches (copy under the wrong anchor) hard-fail notes/shop only;
 * subscribe purpose stays soft in scoreAskMatch.
 */
export function askSectionHardMisses(
  files: Record<string, string>,
  brief: string,
  productName = '',
): string[] {
  if (!isThinCreatePath()) return [];
  const briefRaw = String(brief || '').trim();
  if (!briefRaw || !thinWantsCompositionalShell(briefRaw)) return [];
  if (!Object.keys(files || {}).length) return [];
  const match = scoreAskMatch(files, briefRaw, productName);
  const out = match.reasons
    .filter((r) => /ask anchor missing: #(?:notes|shop|subscribe)\b|tasting notes missing|shop path missing|subscribe path missing|no interactive stub|band purpose: (?:notes|shop)\b/i.test(r))
    .map((r) => `ask section: ${r}`);
  const heroKey = Object.keys(files).find((k) => /src\/sections\/.*Hero.*\.jsx$/i.test(k.replace(/\\/g, '/')));
  if (heroKey && heroSectionWrongGenreArt(String(files[heroKey] || ''), briefRaw, productName)) {
    out.push('ask section: hero art is wrong genre (phone/leak) for this brief');
  }
  const logo = String(files['public/logo.svg'] || '');
  const kind = detectHeroProductKind(productName, briefRaw);
  if (
    logo
    && /M9\.937 15\.5/i.test(logo)
    && (kind === 'bottle' || kind === 'coffee' || kind === 'tea' || kind === 'ceramic' || kind === 'chocolate' || kind === 'lotion')
  ) {
    out.push('ask section: logo.svg is generic sparkles — needs a genre family mark');
  }
  return out;
}

/**
 * Single gate for evidence-ready Live (markCreateJobReady + chrome consumers).
 * Fail-closed: craft blocked, failed job, missing URL, or thin visual floor still open.
 * Invent depth (9k chars) is soft — Live uses thinBlocksLivePreview / visual seed.
 * Ask match: hard only on wrong genre / missing brand / missing hero art.
 */
export function canUnlockCreateLive(
  job: CreateJob | null | undefined,
  files: Record<string, string>,
  brief: string,
): CanUnlockCreateLiveResult {
  const reasons: string[] = [];
  if (!job) {
    reasons.push('no create job');
    return { ok: false, reasons };
  }
  if (job.craftBlocked) {
    reasons.push('craft blocked');
    for (const r of (job.blockedReasons || []).slice(0, 8)) {
      if (r?.trim()) reasons.push(String(r).trim());
    }
  }
  if (job.status === 'failed') {
    reasons.push(job.error?.trim() || 'create job failed');
  }
  const url = String(job.previewUrl || '').trim();
  if (!url || /127\.0\.0\.1:0|localhost:0|:\/\/0(?:\/|$)/.test(url)) {
    reasons.push('missing Live preview URL');
  }
  const briefRaw = String(brief || '').trim();
  if (isThinCreatePath() && briefRaw && thinBlocksLivePreview(files, briefRaw)) {
    for (const d of thinLiveVisualDeficits(files, briefRaw).slice(0, 6)) {
      reasons.push(`thin visual floor open: ${d}`);
    }
    if (!reasons.some((r) => /thin visual floor open/i.test(r))) {
      reasons.push('thin visual floor open');
    }
  }
  // Live judge — matches-ask hard fails only (seed should already clear these).
  if (isThinCreatePath() && briefRaw && Object.keys(files || {}).length) {
    const match = scoreAskMatch(files, briefRaw, String(job.name || ''));
    for (const r of match.reasons) {
      if (/wrong genre|missing designed hero|brand name missing/i.test(r)) {
        reasons.push(`ask match: ${r}`);
      }
    }
  }
  // UI-ready §D — brief-required bands the seed stack owns must not vanish in a static rewrite.
  for (const r of askSectionHardMisses(files, briefRaw, String(job.name || ''))) {
    reasons.push(r);
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export {
  previewReadyForBrief,
  briefLooksLikeAppleStyleHomepage,
  appleHomepageHasProductBands,
  briefLooksLikeMarketingLanding,
  isPreviewReady,
  looksLikeFillerStubAppSource,
  isEmptyOrStubAppSource,
  buildBriefInteractiveFloor,
  healNearReadyCreateUi,
  ensureProductBrandInApp,
  buildUtilityCompanionCss,
} from '@/lib/createBuildQuality';
