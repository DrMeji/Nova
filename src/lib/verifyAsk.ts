/**
 * verifyAsk — post-write check that the ask actually landed in files.
 * Fail closed: any unmatched constraint goes into missing[].
 */

export type VerifyAskResult = {
  ok: boolean;
  missing: string[];
};

function haystack(files: Record<string, string>): string {
  return Object.entries(files || {})
    .filter(([p]) => /\.(jsx?|tsx?|css|html|md)$/i.test(p))
    .map(([, t]) => String(t || ''))
    .join('\n');
}

/** Quoted strings, named colors, center, remove X, no-nav constraints. */
export function verifyAsk(ask: string, files: Record<string, string>): VerifyAskResult {
  const t = String(ask || '');
  const blob = haystack(files);
  const missing: string[] = [];

  const quotes = [...t.matchAll(/["“']([^"”']{2,80})["”']/g)].map((m) => m[1]);
  for (const q of quotes) {
    if (q && !blob.toLowerCase().includes(q.toLowerCase())) missing.push(`quoted “${q}”`);
  }

  // Bare heading / h1 / title: "change the heading to X" (words after to, not only quotes)
  const headingTo = t.match(
    /\b(?:change|set|update|make|rename)\s+(?:the\s+)?(?:heading|h1|title|headline)\s+to\s+["“']?([^"”'\n.!?]{2,80})/i,
  );
  if (headingTo?.[1]) {
    const want = headingTo[1].trim().replace(/[.!,;:]+$/, '');
    if (want && !blob.toLowerCase().includes(want.toLowerCase())) {
      missing.push(`heading “${want}”`);
    }
  }

  if (/\bcenter(?:ed)?\b/i.test(t) && !/text-align:\s*center|justify(?:-content)?:\s*center|place-items:\s*center|mx-auto|items-center|text-center/i.test(blob)) {
    missing.push('center layout');
  }

  const colorWord = t.match(/\b(brown|white|black|red|blue|green|orange|pink|purple|gray|grey|navy|cream)\b/i)?.[1];
  if (colorWord) {
    const hexish = /#[0-9a-f]{3,8}\b/i.test(blob);
    const named = new RegExp(`\\b${colorWord}\\b|${colorWord}\\s*[:=]`, 'i').test(blob);
    if (!hexish && !named && !blob.toLowerCase().includes(colorWord.toLowerCase())) {
      missing.push(`color ${colorWord}`);
    }
  }

  // Hex colors in the ask must appear in files
  const askHexes = [...t.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)].map((m) => m[0].toLowerCase());
  for (const hex of askHexes) {
    if (!blob.toLowerCase().includes(hex)) missing.push(`color ${hex}`);
  }

  // Footer + any hours (am/pm patterns), not only 9am–9pm
  const wantsFooterHours = /\bfooter\b/i.test(t) && /\b\d{1,2}\s*(?:am|pm)\b|\bhours?\b|\bopen\b/i.test(t);
  const bareHours = /\b\d{1,2}\s*:\s*\d{2}\s*(?:am|pm)\b|\b\d{1,2}\s*(?:am|pm)\s*[–\-—]\s*\d{1,2}\s*(?:am|pm)\b/i.test(t)
    && /\bfooter\b/i.test(t);
  if (wantsFooterHours || bareHours) {
    const hasHours = /\b\d{1,2}\s*(?::\d{2})?\s*(?:am|pm)\b/i.test(blob);
    const hasFooter = /footer|<footer[\s>]/i.test(blob);
    if (!hasFooter || !hasHours) missing.push('footer hours');
  }

  // Logo: ask mentions logo → files should have logo / img alt
  if (/\blogo\b/i.test(t)) {
    const hasLogo = /\blogo\b/i.test(blob) || /<img[^>]+alt=["'][^"']*logo/i.test(blob);
    if (!hasLogo) missing.push('logo');
  }

  // Nav add / remove
  if (/\b(?:add|include|put)\b[\s\S]{0,40}\bnav(?:igation|bar)?\b/i.test(t) && !/<nav[\s>]/i.test(blob)) {
    missing.push('nav missing');
  }
  if (/\b(?:remove|delete|drop)\b[\s\S]{0,40}\bnav(?:igation|bar)?\b/i.test(t) && /<nav[\s>]/i.test(blob)) {
    missing.push('nav still present');
  }

  if (/\bdon'?t\s+add\s+(?:a\s+)?nav\b|\bno\s+nav\b/i.test(t) && /<nav[\s>]/i.test(blob)) {
    missing.push('nav was introduced');
  }

  // Blank page / full viewport
  if (/\b(?:blank\s+page|full\s+viewport|full[\s-]?screen|fill\s+(?:the\s+)?(?:screen|viewport)|100vh)\b/i.test(t)) {
    if (!/min-height:\s*100vh|height:\s*100%|min-h-screen|h-screen|h-full|100vh/i.test(blob)) {
      missing.push('full viewport height');
    }
  }

  const removeTarget = t.match(/\b(?:remove|delete|drop)\s+(?:the\s+)?([a-z0-9 _-]{2,40})/i)?.[1];
  if (removeTarget && !/^nav(?:igation|bar)?$/i.test(removeTarget.trim())) {
    if (new RegExp(removeTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(blob)) {
      missing.push(`still contains “${removeTarget.trim()}”`);
    }
  }

  return { ok: missing.length === 0, missing };
}
