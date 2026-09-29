/**
 * Create-turn runtime helpers: wall budgets, UI yielding, vision bans.
 */

import { briefLooksLikeMarketingLanding } from '@/lib/createBuildQuality';

/** Vision / multimodal GGUFs must never craft App.jsx. */
export function isVisionEngineId(id: string | null | undefined): boolean {
  return /\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj|qwen2-vl|qwen2\.5-vl)\b/i.test(String(id || ''));
}

/**
 * Yield so Electron can paint / handle input between heavy create steps.
 */
export function yieldToUi(ms = 0): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      setTimeout(resolve, ms);
      return;
    }
    if (ms <= 0 && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        window.setTimeout(resolve, 0);
      });
      return;
    }
    window.setTimeout(resolve, Math.max(0, ms));
  });
}

export type CreateBudgetProfile = 'simple' | 'standard' | 'complex';

export function createBudgetProfile(brief: string): CreateBudgetProfile {
  const t = String(brief || '');
  if (briefLooksLikeMarketingLanding(t) || /\b(?:apple\.com|quiet\s+luxury|dashboard|discord|full[- ]?stack|ecommerce|checkout)\b/i.test(t)) {
    return 'complex';
  }
  if (t.length < 220 && /\b(?:simple|basic|small|quick|just|only|css|animation|counter|todo|timer)\b/i.test(t)) {
    return 'simple';
  }
  if (t.length < 160) return 'simple';
  return 'standard';
}

/** Wall-clock budgets — uncapped. Prefer Live Code-pill timing + Stop. */
export function createWallBudgetMs(_brief?: string): number {
  return Number.POSITIVE_INFINITY;
}

/** Per-attempt polish stream budget — uncapped; Stop / abort still works. */
export function createPolishAttemptBudgetMs(_brief?: string): number {
  return Number.POSITIVE_INFINITY;
}

export function createBudgetExceededReply(profile: CreateBudgetProfile, productName: string): string {
  return [
    `**Stopped the create wall for ${productName || 'this project'}** (${profile} profile).`,
    '',
    'Say **keep building** to continue, or tell me what to change.',
  ].join('\n');
}
