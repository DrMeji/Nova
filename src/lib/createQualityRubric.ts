/**
 * Cheap deterministic create quality checks — soft repair hints, not hard Live gates.
 */

export type CreateQualityScore = {
  score: number;
  max: number;
  ok: boolean;
  reasons: string[];
};

function appAndCss(files: Record<string, string>): { app: string; css: string } {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const css = String(files['src/App.css'] || '') + String(files['src/styles/tokens.css'] || '');
  return { app, css };
}

function checkViewportFluid(css: string, app: string): string | null {
  const blob = `${css}\n${app}`;
  if (/viewport|100vw|100dvh|min-height:\s*100(?:vh|dvh)|clamp\s*\(/i.test(blob)) return null;
  return 'missing viewport / fluid layout signal (viewport meta, 100vh/dvh, or clamp())';
}

function checkHeadingOrder(app: string): string | null {
  if (!app.trim()) return 'no App source for heading order';
  const h1 = (app.match(/<h1\b/gi) || []).length;
  if (h1 === 0) return 'no h1 — add a primary page heading';
  if (h1 > 1) return 'multiple h1 tags — use one h1 then h2/h3';
  const h1Pos = app.search(/<h1\b/i);
  const h2Before = app.slice(0, h1Pos).search(/<h2\b/i);
  if (h2Before >= 0) return 'h2 appears before h1 — fix heading order';
  return null;
}

function checkImgAlt(app: string): string | null {
  const imgs = app.match(/<img\b[^>]*>/gi) || [];
  if (imgs.length === 0) return null;
  const missing = imgs.filter((tag) => !/\balt\s*=/.test(tag));
  if (missing.length === 0) return null;
  return `${missing.length} img tag(s) missing alt`;
}

function checkColorCustomProps(css: string): string | null {
  if (!css.trim()) return 'no CSS for color tokens';
  if (/--(?:bg|ink|accent|muted|text|primary|brand)\b/i.test(css)) return null;
  if (/var\s*\(\s*--/i.test(css)) return null;
  return 'CSS missing color custom properties (--bg / --accent / similar)';
}

function checkInteractiveCta(app: string): string | null {
  const hasButton = /<button\b/i.test(app);
  const hasLinkCta = /<a\b[^>]*className=["'][^"']*(?:cta|btn|button)/i.test(app);
  if (!hasButton && !hasLinkCta) return null;
  if (/\bonClick\s*=|<form\b[^>]*\bonSubmit\s*=|type=["']submit["']/i.test(app)) return null;
  return 'CTA present but no onClick / onSubmit handler';
}

/** Five cheap checks — failures are soft repair hints. */
export function scoreCreateQuality(
  files: Record<string, string>,
  _opts?: { brief?: string; productName?: string },
): CreateQualityScore {
  const { app, css } = appAndCss(files);
  const checks = [
    checkViewportFluid(css, app),
    checkHeadingOrder(app),
    checkImgAlt(app),
    checkColorCustomProps(css),
    checkInteractiveCta(app),
  ].filter(Boolean) as string[];
  const max = 5;
  const score = max - checks.length;
  return {
    score,
    max,
    ok: checks.length === 0,
    reasons: checks,
  };
}

/** Prefix for soft reasons that must not alone block Live / structural Ready. */
export const CREATE_QUALITY_RUBRIC_PREFIX = 'quality rubric:';

export function formatCreateQualityRubricReasons(files: Record<string, string>, brief?: string): string[] {
  const { reasons } = scoreCreateQuality(files, { brief });
  return reasons.map((r) => `${CREATE_QUALITY_RUBRIC_PREFIX} ${r}`);
}
