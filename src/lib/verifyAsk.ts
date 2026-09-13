/**
 * verifyAsk — post-write check that the ask actually landed in files.
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

  const footerHours = t.match(/\bfooter\b[\s\S]{0,40}?(9\s*am|9am|hours?|open)/i)
    || t.match(/\b(9\s*am\s*[–\-—]\s*9\s*pm|9am\s*[-–]\s*9pm)\b/i);
  if (footerHours) {
    if (!/footer|9\s*am|9am|9\s*pm|9pm/i.test(blob)) missing.push('footer hours');
  }

  const removeTarget = t.match(/\b(?:remove|delete|drop)\s+(?:the\s+)?([a-z0-9 _-]{2,40})/i)?.[1];
  if (removeTarget && new RegExp(removeTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(blob)) {
    missing.push(`still contains “${removeTarget.trim()}”`);
  }

  if (/\bdon'?t\s+add\s+(?:a\s+)?nav\b|\bno\s+nav\b/i.test(t) && /<nav[\s>]/i.test(blob)) {
    missing.push('nav was introduced');
  }

  return { ok: missing.length === 0, missing };
}
