/**
 * Project stack detection. leaf module (no chat/disk imports).
 */

import { looksLikeLandingBrief, prefersReactAppScaffold, wantsInteractiveSpaScaffold } from '@/lib/webLandingFromBrief';

export type ProjectKind = 'static-web' | 'vite-react' | 'python' | 'node-cli' | 'unknown';

export function detectProjectKind(text: string): ProjectKind {
  const t = String(text || '');
  const lower = t.toLowerCase();
  // Static tool UIs that ship without npm (must beat prefersReactAppScaffold / vite default).
  if (/\bcalculator\b/.test(lower) || (/\bcalc\b/.test(lower) && /\b(scientific|professional|pro)\b/.test(lower))) {
    return 'static-web';
  }
  if (/\b(watchlist|trading\s+cockpit|trade\s*rail)\b/.test(lower) && /\b(tab|orders|settings)\b/.test(lower)) {
    return 'static-web';
  }
  if (prefersReactAppScaffold(t)) return 'vite-react';
  if (/\bno\s+static\s+html\b/i.test(t) && /\b(react|vite)\b/i.test(t)) return 'vite-react';

  if (/\b(python|flask|fastapi|trading\s+bot|pip|\.py)\b/.test(lower)) return 'python';
  const negatesLanding = /\bno\s+static\s+html\b/i.test(t) || /\bnot\s+(?:a\s+)?(?:static|landing)\b/i.test(t);
  if (
    !negatesLanding
    && (
      looksLikeLandingBrief(t)
      || (
        /\b(landing\s+page|cabin|restaurant|portfolio|gym|fitness|hero\s+image|festival|lineup|jazz|concert|velvet)\b/.test(lower)
        && /\b(website|site|page|landing)\b/.test(lower)
      )
    )
  ) {
    return 'static-web';
  }
  if (/\b(html|simple\s+site|static\s+site|plain\s+html|static\s+html)\b/.test(lower) && !/\bno\s+static\s+html\b/i.test(t)) {
    return 'static-web';
  }
  if (/images\.unsplash\.com|unsplash\.com/.test(lower) && /\b(website|site|create|build)\b/.test(lower)) {
    return 'static-web';
  }
  if (/\b(node\s+cli|command\s+line\s+tool|cli\s+tool)\b/.test(lower)) return 'node-cli';
  // Interactive product / game apps (including spatial / WebGL / canvas runners) → Vite React.
  if (/\b(react|vite|next|web\s+app|electron|discord|call|chat\s+app|3d|webgl|three\.?js|babylon|modeler|dinosaur|dino\s+runner|chrome\s+dino)\b/.test(lower)) {
    return 'vite-react';
  }
  if (/\b(website|site)\b/.test(lower) && /\b(react|vite|spa|dashboard|app)\b/.test(lower)) return 'vite-react';
  return 'vite-react';
}

export function resolveProjectKindForCreate(
  summary: string,
  storedKind: ProjectKind,
  parsedKind: ProjectKind,
): ProjectKind {
  const s = String(summary || '');
  if (/\bcalculator\b/i.test(s) || (/\bcalc\b/i.test(s) && /\b(scientific|professional|pro)\b/i.test(s))) {
    return 'static-web';
  }
  if (/\b(watchlist|trading\s+cockpit|trade\s*rail)\b/i.test(s) && /\b(tab|orders|settings)\b/i.test(s)) {
    return 'static-web';
  }
  if (prefersReactAppScaffold(summary)) return 'vite-react';
  // Interactive premium marketing sites stay on Vite React (animated SPA), not blank static HTML.
  if (wantsInteractiveSpaScaffold(summary)) return 'vite-react';
  if (storedKind && storedKind !== 'unknown') return storedKind;
  if (looksLikeLandingBrief(summary)) return 'static-web';
  return parsedKind || 'vite-react';
}
