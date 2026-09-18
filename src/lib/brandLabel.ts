import { looksLikeNameFontStyleAsk, normalizeMessyUiEditAsk } from '@/lib/editAskResolve';

/**
 * Shared ask → brand label extraction.
 * Stops at layout instruction words so verifyAsk never looks for
 * "VOID Peripherals centered in the".
 */

const LAYOUT_WORD = /^(?:centered?|centred|in|the|middle|clean|white|black|text|on|screen|page|viewport|for|now|nothing|else|with|and|of|a|an)$/i;

/** Trailing instruction noise — not part of a short name like "local only". */
const TRAILING_LAYOUT = /\s+\b(?:centered?|centred|in\s+the\s+middle|in\s+the\s+center|on\s+screen|nothing\s+else|clean\s+white)\b.*$/i;

const NAMED_COLOR = /^(?:black|white|blue|dark|red|green|yellow|purple|violet|brown|teal|chocolate|sienna|pink|orange|navy|cream|gr[ae]y)$/i;

const FONT_STYLE_LABEL = /^(?:bold|italic|cursive|serif|sans(?:-serif)?|thin|light|skinny|professional)(?:\s+(?:and|inside|in|a|the|bold|italic|cursive|serif|thin|light))*?$/i;

export function extractBrandLabel(ask: string): string {
  const t = normalizeMessyUiEditAsk(String(ask || ''));
  // Prefer explicit rename targets: "change the name … to Local Only"
  const renamed = extractNameRenameTarget(t);
  if (renamed) return renamed;

  const raw = (
    t.match(/\bbrand\s+name\s+([^\n.!?]{2,80})/i)?.[1]
    || t.match(/\bbrand\s+should\s+say\s+([^\n.!?]{2,80})/i)?.[1]
    || t.match(/\bshould\s+say\s+([A-Za-z0-9][^\n.!?]{1,80})/i)?.[1]
    // "named X" / "called X" — never bare "name" (matches "the name that's…")
    || t.match(/\b(?:named|called)\s+([A-Za-z0-9][A-Za-z0-9_-]*(?:\s+[A-Za-z0-9][A-Za-z0-9_-]*){0,4})\b/i)?.[1]
    || ''
  ).trim();
  if (!raw) return '';
  const parts: string[] = [];
  for (const p of raw.split(/\s+/)) {
    const w = p.replace(/[.,;:]+$/g, '');
    if (!w) continue;
    if (LAYOUT_WORD.test(w)) break;
    parts.push(w);
    if (parts.length >= 5) break;
  }
  return parts.join(' ').trim();
}

/**
 * "change the color of the name from white to black" — paint the word, don't rename it.
 */
export function looksLikeNameTextColorAsk(ask: string): boolean {
  const t = normalizeMessyUiEditAsk(String(ask || '').trim());
  if (!t) return false;
  if (looksLikeNameFontStyleAsk(t)) return false;
  if (/\bbackground\b/i.test(t) && !/\b(?:name|title|word|text|heading)\b/i.test(t)) return false;
  if (/\bcolou?r\b[\s\S]{0,48}\b(?:of\s+|on\s+|for\s+)?(?:the\s+)?(?:name|title|word|text|heading|wording)\b/i.test(t)) return true;
  if (/\b(?:name|title|word|text|heading|wording)\b[\s\S]{0,48}\bcolou?r\b/i.test(t)) return true;
  if (
    /\b(?:name|title|word|text|heading)\b[\s\S]{0,64}\bfrom\s+(?:a\s+)?(?:black|white|blue|red|green|yellow|purple|brown|teal|pink|orange|navy|cream|gr[ae]y)\s+to\s+(?:a\s+)?(?:black|white|blue|red|green|yellow|purple|brown|teal|pink|orange|navy|cream|gr[ae]y)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(?:make|set|turn|paint)\b[\s\S]{0,40}\b(?:the\s+)?(?:name|title|word|text)\b[\s\S]{0,32}\b(?:black|white|blue|red|green|yellow|purple|brown|teal|pink|orange|navy|cream)\b/i.test(t)
    && !/\bbackground\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Target paint for the on-page name: "… to black" / "make the name black". */
export function extractNameTextColorTarget(ask: string): string {
  const t = normalizeMessyUiEditAsk(String(ask || '').trim());
  if (!t || !looksLikeNameTextColorAsk(t)) return '';
  const to = t.match(
    /\bto\s+(?:a\s+)?(black|white|blue|dark|red|green|yellow|purple|violet|brown|teal|chocolate|sienna|pink|orange|navy|cream|gr[ae]y)\b/i,
  )?.[1];
  if (to) return to.toLowerCase();
  const make = t.match(
    /\b(?:make|set|turn|paint)\b[\s\S]{0,40}\b(?:name|title|word|text)\b[\s\S]{0,32}\b(black|white|blue|dark|red|green|yellow|purple|violet|brown|teal|pink|orange|navy|cream|gr[ae]y)\b/i,
  )?.[1];
  return make ? make.toLowerCase() : '';
}

/**
 * "change the name that's in the middle to local only" → "local only"
 * "rename the title to Tesla" → "Tesla"
 */
export function extractNameRenameTarget(ask: string): string {
  const t = normalizeMessyUiEditAsk(String(ask || '').trim());
  if (!t) return '';
  // Paint / font-style asks are never renames to the word "black" or "cursive".
  if (looksLikeNameTextColorAsk(t) || looksLikeNameFontStyleAsk(t)) return '';
  const m = t.match(
    /\b(?:change|rename|set|update|make)\b[\s\S]{0,100}\b(?:name|title|heading|headline|h1|word|text|label|brand)\b[\s\S]{0,100}\b(?:to|into)\s+["“']?([^"”'\n.!?]{1,80})/i,
  );
  if (!m?.[1]) return '';
  let label = m[1].trim().replace(/[.,;:]+$/g, '');
  // Drop trailing layout instructions, but keep short names that end in "only"
  // ("local only", "logo only") — strip "only" only when more instruction follows.
  label = label
    .replace(/\s+\bonly\s+(?:add|put|place|with|and|no|nothing|keep|leave)\b.*$/i, '')
    .replace(TRAILING_LAYOUT, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Reject pronoun junk from "name that's…"
  if (/^(?:that|this|it|them|those|these)$/i.test(label)) return '';
  // Bare color / font-style words are paint targets, not brand labels.
  if (NAMED_COLOR.test(label)) return '';
  if (FONT_STYLE_LABEL.test(label)) return '';
  if (/\b(?:bold|italic|cursive|serif|thin|light|skinny)\b/i.test(label)) return '';
  if (label.length < 1 || label.length > 60) return '';
  return label;
}
