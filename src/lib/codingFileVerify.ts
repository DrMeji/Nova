/**
 * Per-file syntax / thin / premium verify chips while coding.
 */
export type FileVerifyResult = {
  path: string;
  ok: boolean;
  reasons: string[];
  premiumScore: number;
};

const doomCounts = new Map<string, number>();

export function syntaxCheckContent(path: string, content: string): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = String(content || '');
  const rel = String(path || '').replace(/\\/g, '/');
  if (!text.trim()) reasons.push('empty file');
  if (/\.(jsx|tsx|js|ts)$/i.test(rel)) {
    const opens = (text.match(/\{/g) || []).length;
    const closes = (text.match(/\}/g) || []).length;
    if (Math.abs(opens - closes) > 2) reasons.push('unbalanced braces');
    if (/<<<<<<|>>>>>>|=======/.test(text)) reasons.push('merge conflict markers');
    if (/@@@FILE/.test(text)) reasons.push('raw @@@FILE marker left in source');
  }
  if (/App\.(jsx|tsx)$/i.test(rel) && text.length < 900) reasons.push('thin App');
  return { ok: reasons.length === 0, reasons };
}

export function premiumScore(content: string): number {
  let score = 40;
  const t = String(content || '');
  if (t.length > 2000) score += 15;
  if (t.length > 5000) score += 10;
  if (/className=|style=\{/.test(t)) score += 10;
  if (/<button|<form|<nav|<header/i.test(t)) score += 10;
  if (/lorem ipsum|placeholder text|TODO: UI/i.test(t)) score -= 25;
  if (/nova-storefront-spine|storefront-floor/i.test(t)) score -= 40;
  return Math.max(0, Math.min(100, score));
}

export function verifyCraftFile(path: string, content: string): FileVerifyResult {
  const syn = syntaxCheckContent(path, content);
  const score = premiumScore(content);
  const reasons = [...syn.reasons];
  if (score < 45) reasons.push(`low premium score ${score}`);
  return {
    path,
    ok: syn.ok && score >= 45,
    reasons,
    premiumScore: score,
  };
}

/** Doom-loop: same thin path rewritten thrice → break. */
export function doomLoopGuard(path: string, content: string): { break: boolean; count: number } {
  const key = String(path || '').replace(/\\/g, '/');
  const thin = content.length < 900 || /storefront-floor/i.test(content);
  if (!thin) {
    doomCounts.set(key, 0);
    return { break: false, count: 0 };
  }
  const n = (doomCounts.get(key) || 0) + 1;
  doomCounts.set(key, n);
  return { break: n >= 3, count: n };
}

export function resetDoomLoopGuards() {
  doomCounts.clear();
}
