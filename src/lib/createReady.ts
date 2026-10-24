/**
 * Create Ready ownership — Preview Ready / Live unlock gates live here.
 */
import type { CreateJob } from '@/lib/createJobStore';
import { isNonWebArtifactKind } from '@/lib/createArtifactKind';
import { scoreAskMatch } from '@/lib/createAskContract';
import {
  isThinCreatePath,
  thinBlocksLivePreview,
  thinLiveVisualDeficits,
  thinWantsCompositionalShell,
  compositionalDepthIsComplete,
  formatCompositionalSectionSpecs,
  compositionalSectionFileSubstantial,
  heroSectionWrongGenreArt,
} from '@/lib/createThinPath';
import { detectHeroProductKind } from '@/lib/createIdentity';

export type CanUnlockCreateLiveResult = { ok: boolean; reasons: string[] };

/**
 * Bound folder in a new chat: Live pill only when the tree can actually preview
 * (package.json + a real App), not an empty/stub bind.
 */
export function boundFolderLiveReady(files: Record<string, string> | null | undefined): boolean {
  const map = files || {};
  if (!String(map['package.json'] || '').trim()) return false;
  const app = String(map['src/App.jsx'] || map['src/App.tsx'] || '');
  if (!/export\s+default/i.test(app)) return false;
  // Empty shell / center-only stub — keep Live hidden until craft lands UI.
  if (/return\s*\(\s*<div className=["']app["']\s*\/>\s*\)/i.test(app)) return false;
  if (!/<[A-Za-z]/.test(app)) return false;
  // Compositional invent shells are short App.jsx (imports + <Hero/>…) — count landed
  // sections so Live is not hidden after Fern Latch-class creates (app < 400 chars).
  const sectionChars = Object.entries(map)
    .filter(([k]) => /^src\/sections\/[^/]+\.jsx$/i.test(String(k || '').replace(/\\/g, '/')))
    .reduce((n, [, v]) => n + String(v || '').replace(/\s+/g, '').length, 0);
  const appCompact = app.replace(/\s+/g, '').length;
  const sectionFiles = Object.keys(map)
    .filter((k) => /^src\/sections\/[^/]+\.jsx$/i.test(k.replace(/\\/g, '/')));
  const compositionalMount = /from\s+['"]\.\/sections\//i.test(app) && sectionFiles.length >= 2;
  // Short App shell + ≥2 section files = invent floor Live-ready (Fern Latch class).
  if (compositionalMount && (sectionChars >= 280 || sectionFiles.length >= 3)) return true;
  if (appCompact < 400 && sectionChars < 280 && sectionFiles.length < 2) return false;
  if (app.length < 200 && !compositionalMount) return false;
  return true;
}

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
 * Live chrome unlock — coding foundation: job healthy + real preview URL.
 * Composition / visual floor / ask bands are soft notes for quality (not Live blockers).
 * Non-web Ready jobs (CLI/API/library/python) unlock via artifactEvidence.runOk — no URL.
 */
export function canUnlockCreateLive(
  job: CreateJob | null | undefined,
  files: Record<string, string>,
  brief: string,
): CanUnlockCreateLiveResult {
  const reasons: string[] = [];
  const soft: string[] = [];
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
  const evidenceKind = job.artifactKind || job.artifactEvidence?.kind;
  const nonWebEvidenceOk = Boolean(
    job.artifactEvidence?.runOk === true
    && evidenceKind
    && isNonWebArtifactKind(evidenceKind),
  );
  if (nonWebEvidenceOk && job.status === 'ready') {
    // Non-web Ready: Code/Folder pills, not Live URL.
    return { ok: true, reasons: soft.length ? soft.slice(0, 8) : [`non-web Ready · ${job.artifactEvidence?.runDetail || job.artifactKind || 'ok'}`] };
  }
  if (!url || /127\.0\.0\.1:0|localhost:0|:\/\/0(?:\/|$)/.test(url)) {
    reasons.push('missing Live preview URL');
  }
  const briefRaw = String(brief || '').trim();
  if (isThinCreatePath() && briefRaw && thinBlocksLivePreview(files, briefRaw)) {
    for (const d of thinLiveVisualDeficits(files, briefRaw).slice(0, 6)) {
      soft.push(`thin visual floor open: ${d}`);
    }
    if (!soft.some((r) => /thin visual floor open/i.test(r))) {
      soft.push('thin visual floor open');
    }
  }
  if (isThinCreatePath() && briefRaw && thinWantsCompositionalShell(briefRaw)
    && !compositionalDepthIsComplete(files, briefRaw, String(job.name || ''))) {
    const missing = formatCompositionalSectionSpecs(briefRaw, String(job.name || ''))
      .filter((spec) => !compositionalSectionFileSubstantial(String(files[spec.filePath] || '')))
      .map((spec) => spec.filePath);
    soft.push(`compositional content incomplete: ${missing.slice(0, 6).join(', ') || 'required sections missing'}`);
  }
  if (isThinCreatePath() && briefRaw && Object.keys(files || {}).length) {
    const match = scoreAskMatch(files, briefRaw, String(job.name || ''));
    for (const r of match.reasons) {
      if (/wrong genre|missing designed hero|brand name missing/i.test(r)) {
        soft.push(`ask match: ${r}`);
      }
    }
  }
  for (const r of askSectionHardMisses(files, briefRaw, String(job.name || ''))) {
    soft.push(r);
  }
  // Soft notes attach when Live is otherwise ok (quality follow-ups), never block URL Live.
  if (reasons.length === 0 && soft.length) {
    return { ok: true, reasons: soft.slice(0, 8) };
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
