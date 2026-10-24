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
 * Hidden / minimized windows never paint, so rAF alone never fires — a create turn
 * awaiting this yield would freeze forever on its last status (the "Build uses …
 * budget" hang). Race a short timer so the yield always resolves; this is a paint
 * fallback, not a wall on craft time.
 */
export function yieldToUi(ms = 0): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      setTimeout(resolve, ms);
      return;
    }
    if (ms <= 0 && typeof window.requestAnimationFrame === 'function') {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      window.requestAnimationFrame(() => {
        window.setTimeout(finish, 0);
      });
      // No paint (window hidden/occluded) → timer still advances the turn.
      window.setTimeout(finish, 32);
      return;
    }
    window.setTimeout(resolve, Math.max(0, ms));
  });
}

export type CreateBudgetProfile = 'simple' | 'standard' | 'complex';

export function createBudgetProfile(brief: string): CreateBudgetProfile {
  const t = String(brief || '');
  // Ladder / everyday apps — never inflate coffee/todo into a 45m "complex" wall.
  if (/\b(?:todo|tip\s*calc|tipwise|tasknest|brewhaus|coffee\s+shop|simple\s+coffee|kilnbook|kiln\s*book|pottery|firing\s+journal)\b/i.test(t)
    || (t.length < 280 && /\b(?:simple|basic|small|quick|just|only|counter|timer|todo|tip|kiln|firing)\b/i.test(t))) {
    return 'simple';
  }
  // Screenshot / replica landings need real craft time — never the micro “simple” wall.
  if (/\b(?:screenshot|replica|match\s+(?:this|the)\s+image|looks?\s+like\s+this|from\s+(?:the\s+)?(?:image|photo)|vesper)\b/i.test(t)
    || /!\[[^\]]*]\([^)]+\)/.test(t)
    || /nova-media:/.test(t)) {
    return 'standard';
  }
  if (briefLooksLikeMarketingLanding(t) || /\b(?:apple\.com|quiet\s+luxury|dashboard|discord|full[- ]?stack|ecommerce|checkout)\b/i.test(t)) {
    return 'complex';
  }
  if (t.length < 160) return 'simple';
  return 'standard';
}

/** Wall-clock budgets — soft cap so create cannot spin forever without Stop. */
export function createWallBudgetMs(brief?: string): number {
  const profile = createBudgetProfile(String(brief || ''));
  if (profile === 'simple') return 6 * 60_000;
  if (profile === 'complex') return 14 * 60_000;
  return 10 * 60_000;
}

/** Per-attempt polish stream budget — Stop / abort still works. */
export function createPolishAttemptBudgetMs(brief?: string): number {
  const profile = createBudgetProfile(String(brief || ''));
  if (profile === 'simple') return 90_000;
  if (profile === 'complex') return 180_000;
  return 120_000;
}

export function createBudgetExceededReply(profile: CreateBudgetProfile, productName: string): string {
  const totalMinutes = profile === 'simple' ? 6 : profile === 'complex' ? 14 : 10;
  return [
    `**The create time limit was reached for ${productName || 'this project'}** (${profile} profile, ${totalMinutes} minute session cap).`,
    '',
    'The latest saved files are still available. Say **keep building** to continue from them, or tell me what to change.',
  ].join('\n');
}
