/**
 * Project stack detection. leaf module (no chat/disk imports).
 */

import { looksLikeLandingBrief, prefersReactAppScaffold, wantsInteractiveSpaScaffold } from '@/lib/webLandingFromBrief';

export type ProjectKind = 'static-web' | 'vite-react' | 'python' | 'node-cli' | 'unknown';

export function detectProjectKind(text: string): ProjectKind {
  const t = String(text || '');
  const lower = t.toLowerCase();
  // General-purpose non-web coding — early, before micro-toy / landing heuristics.
  if (
    /\b(?:node\s+cli|command[\s-]?line\s+tool|cli\s+tool|cli\s+app|npm\s+package|node\s+library|typescript\s+library|js\s+library)\b/.test(lower)
    || (
      /\b(?:cli|command[\s-]?line|argv|yargs|commander|oclif)\b/.test(lower)
      && /\b(?:build|create|make|write|scaffold|implement|tool|app|script)\b/.test(lower)
      && !/\b(?:website|landing|homepage|react|vite|ui|dashboard|frontend)\b/.test(lower)
    )
  ) {
    return 'node-cli';
  }
  if (
    /\b(?:express|fastify|koa|hono)\b/.test(lower)
    && /\b(?:api|server|backend|rest|http)\b/.test(lower)
    && (
      /\b(?:no|without|backend[\s-]?only)\s+(?:frontend|ui|react|vite)\b/.test(lower)
      || !/\b(?:website|landing|react|vite)\b/.test(lower)
    )
    && !/\b(?:react\s+app|vite\s+app|frontend\s+app)\b/.test(lower)
  ) {
    // Node HTTP API without a UI — still npm, but not a Vite React SPA.
    return 'node-cli';
  }
  // Tiny single-page toys (sticky note, todo, timer, counter) → static HTML, no npm.
  // Must beat prefersReactAppScaffold so Live opens without a 5-minute install wall.
  if (
    /\b(?:notedot|note\s*dot|sticky\s*notes?|notepad)\b/.test(lower)
    || (
      /\b(?:note|notes|sticky)\b/.test(lower)
      && /\b(?:title|text\s*box|textarea|type|typing)\b/.test(lower)
      && (/\b(?:tiny|simple|basic|just|only|most basic|nothing else)\b/.test(lower) || t.length < 220)
    )
  ) {
    return 'static-web';
  }
  if (
    /\b(?:todo(?:s)?|to-?dos?|to\s+do\s+list|checklist|task\s*list)\b/.test(lower)
    && t.length < 360
    && !/\b(?:landing|dashboard|discord|react|vite|api|server|express|fastify|backend|cli|command[\s-]?line)\b/.test(lower)
  ) {
    return 'static-web';
  }
  if (
    /\b(?:timer|stopwatch|pomodoro|countdown|click\s+counter|counter\s+app)\b/.test(lower)
    && t.length < 360
    && !/\b(?:landing|dashboard|react|vite)\b/.test(lower)
  ) {
    return 'static-web';
  }
  // Calculator apps → Vite React (thin create / Live). Static HTML paste path is retired.
  if (
    (/\bcalculator\b/.test(lower) || (/\bcalc\b/.test(lower) && /\b(scientific|professional|pro)\b/.test(lower)))
    && /\b(?:app|application|project|react|vite|on\s+disk|live)\b/.test(lower)
  ) {
    return 'vite-react';
  }
  if (/\bcalculator\b/.test(lower) || (/\bcalc\b/.test(lower) && /\b(scientific|professional|pro)\b/.test(lower))) {
    return 'vite-react';
  }
  if (/\b(watchlist|trading\s+cockpit|trade\s*rail)\b/.test(lower) && /\b(tab|orders|settings)\b/.test(lower)) {
    return 'static-web';
  }
  // Explicit static HTML wins over React/landing defaults.
  if (
    /\b(?:static\s+html\s+ok|plain\s+html|simple\s+site|static\s+site)\b/i.test(t)
    && !/\bno\s+static\s+html\b/i.test(t)
  ) {
    return 'static-web';
  }
  if (/\bstatic\s+html\b/i.test(t) && !/\bno\s+static\s+html\b/i.test(t) && !/\b(?:react|vite)\b/i.test(t)) {
    return 'static-web';
  }
  if (prefersReactAppScaffold(t)) return 'vite-react';
  if (/\bno\s+static\s+html\b/i.test(t) && /\b(react|vite)\b/i.test(t)) return 'vite-react';
  // Desktop website / cafe / landing with App.jsx language → Vite (Preview needs npm).
  if (/\b(desktop\s+(?:website|site|layout)|full[- ]?desktop)\b/.test(lower)) return 'vite-react';

  if (/\b(python|flask|fastapi|trading\s+bot|pip|\.py)\b/.test(lower)) return 'python';
  // Product / hardware / desk brand landings need Vite + npm Live — never static-web.
  // "just a landing page" + gaming desk used to scaffold css/js only → npm Unavailable.
  if (
    /\b(?:gaming\s+desk|standing\s+desk|desk\s+brand|product\s+landing|hardware\s+brand)\b/.test(lower)
    || (
      /\blanding\s+page\b/.test(lower)
      && /\b(?:gaming|desk|shop|brand|hardware|peripheral|keyboard|mouse|headset)\b/.test(lower)
      && /\b(?:website|site|new\s+project|on\s+disk)\b/.test(lower)
    )
  ) {
    return 'vite-react';
  }
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
    // Cafe / portfolio / venue landings can stay static HTML unless React/Vite was requested above.
    return 'static-web';
  }
  if (/\b(html|simple\s+site|static\s+site|plain\s+html|static\s+html)\b/.test(lower) && !/\bno\s+static\s+html\b/i.test(t)) {
    return 'static-web';
  }
  if (/images\.unsplash\.com|unsplash\.com/.test(lower) && /\b(website|site|create|build)\b/.test(lower)) {
    // Unsplash marketing sites are static unless React/Vite was requested above.
    return 'static-web';
  }
  // Interactive product / game / 3D / canvas apps → Vite React.
  if (/\b(react|vite|next|web\s+app|electron|discord|call|chat\s+app|3d|webgl|three\.?js|babylon|modeler|dinosaur|dino\s+runner|chrome\s+dino|habit|streak|tracker|netflix|twitch|streaming\s+app|billboard|game|playable|arcade|fps|shooter|canvas\s+game|pong|snake|pac-?man)\b/.test(lower)) {
    return 'vite-react';
  }
  if (/\b(website|site)\b/.test(lower) && /\b(react|vite|spa|dashboard|app)\b/.test(lower)) return 'vite-react';
  // Do not default every unknown ask to Vite React — that forced websites onto CLI/API/library.
  return 'unknown';
}

export function resolveProjectKindForCreate(
  summary: string,
  storedKind: ProjectKind,
  parsedKind: ProjectKind,
): ProjectKind {
  const s = String(summary || '');
  // Micro single-page toys never need Vite/npm — keep Live instant.
  const micro = detectProjectKind(s);
  // Calculator always Vite under create (never static HTML → product name "Site").
  if (/\bcalculator\b/i.test(s) || (/\bcalc\b/i.test(s) && /\b(scientific|professional|pro)\b/i.test(s))) {
    return 'vite-react';
  }
  if (micro === 'static-web' && (
    /\b(?:notedot|sticky|notepad|todo|timer|stopwatch|pomodoro|countdown|click\s+counter)\b/i.test(s)
    || (/\b(?:note|notes)\b/i.test(s) && /\b(?:title|text\s*box|textarea)\b/i.test(s))
  )) {
    return 'static-web';
  }
  if (/\b(watchlist|trading\s+cockpit|trade\s*rail)\b/i.test(s) && /\b(tab|orders|settings)\b/i.test(s)) {
    return 'static-web';
  }
  if (prefersReactAppScaffold(summary)) return 'vite-react';
  // Interactive premium marketing sites stay on Vite React (animated SPA), not blank static HTML.
  if (wantsInteractiveSpaScaffold(summary)) return 'vite-react';
  // Product desk / hardware brands always Vite (same rule as detectProjectKind).
  if (detectProjectKind(s) === 'vite-react' && /\b(?:desk|gaming|hardware|product\s+landing)\b/i.test(s)) {
    return 'vite-react';
  }
  if (storedKind && storedKind !== 'unknown') return storedKind;
  if (looksLikeLandingBrief(summary) && !/\b(?:gaming\s+desk|standing\s+desk|desk\s+brand|hardware)\b/i.test(s)) {
    return 'static-web';
  }
  // Prefer unknown over silent vite-react so CLI/API asks are not rewritten into SPAs.
  return parsedKind && parsedKind !== 'unknown' ? parsedKind : 'unknown';
}
