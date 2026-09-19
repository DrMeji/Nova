/**
 * Nova studio modes — Ask / Plan / Build / Fix.
 * Original Nova pacing (not a clone of other builders). Free forever; no paywall.
 */

export type NovaStudioMode = 'ask' | 'plan' | 'build' | 'fix';

const PLAN_KEY = (chatId: string) => `NOVA:pending-build-plan:${chatId}`;

export type PendingBuildPlan = {
  chatId: string;
  productName: string;
  summary: string;
  bullets: string[];
  mustHaves: string[];
  createdAt: number;
};

export function modeStatusLabel(mode: NovaStudioMode, detail?: string): string {
  const d = String(detail || '').trim();
  switch (mode) {
    case 'ask':
      return d ? `Ask: ${d}` : 'Ask';
    case 'plan':
      return d ? `Plan: ${d}` : 'Planning the product…';
    case 'build':
      return d ? `Build: ${d}` : 'Building…';
    case 'fix':
      return d ? `Fix: ${d}` : 'Fixing Preview Ready issues…';
    default:
      return d || 'Working…';
  }
}

export function isBuildApprovePhrase(text: string): boolean {
  const t = String(text || '').trim();
  return /^(?:ok(?:ay)?\s+)?(?:start\s+)?(?:building|build(?:\s+it|\s+this|\s+that)?|go(?:\s+build|\s+implement)?|ship\s+it|implement\s+it|lets?\s+build(?:\s+(?:this|that|it))?)\s*[.!]?\s*$/i.test(t)
    || /^(?:yes|yep|yeah|approve|do\s+it|build\s+now)\s*[.!]?\s*$/i.test(t);
}

export function savePendingBuildPlan(plan: PendingBuildPlan): void {
  try {
    sessionStorage.setItem(PLAN_KEY(plan.chatId), JSON.stringify(plan));
  } catch { /* ignore */ }
}

export function loadPendingBuildPlan(chatId: string): PendingBuildPlan | null {
  try {
    const raw = sessionStorage.getItem(PLAN_KEY(chatId));
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingBuildPlan;
    if (!p?.productName || !p?.summary) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearPendingBuildPlan(chatId: string): void {
  try {
    sessionStorage.removeItem(PLAN_KEY(chatId));
  } catch { /* ignore */ }
}

/** User-facing plan card — Nova voice, free product, no upsell. */
export function formatBuildPlanReply(plan: PendingBuildPlan): string {
  const bullets = (plan.bullets.length ? plan.bullets : plan.mustHaves.slice(0, 5))
    .slice(0, 6)
    .map((b) => `- ${b}`)
    .join('\n');
  return [
    `**Plan — ${plan.productName}**`,
    '',
    plan.summary.trim().slice(0, 600),
    '',
    bullets ? `**Build checklist**\n${bullets}` : '',
    '',
    'Nova is free — no paywall. Say **build it** (or **ok start building**) when you want me to create the project on disk.',
    'Or tweak the plan in your next message before we build.',
  ].filter(Boolean).join('\n');
}

export function buildPlanFromBrief(opts: {
  chatId: string;
  productName: string;
  brief: string;
  mustHaves?: string[];
}): PendingBuildPlan {
  const brief = String(opts.brief || '').trim();
  const must = (opts.mustHaves || []).filter(Boolean).slice(0, 8);
  const sentences = brief
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 4);
  const bullets = must.length
    ? must.map((m) => m.replace(/^missing\s+/i, ''))
    : sentences.map((s) => s.slice(0, 120));
  return {
    chatId: opts.chatId,
    productName: opts.productName,
    summary: brief.slice(0, 900) || `Build ${opts.productName}.`,
    bullets,
    mustHaves: must,
    createdAt: Date.now(),
  };
}
