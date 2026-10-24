import { looksLikeNameFontStyleAsk, normalizeMessyUiEditAsk } from '@/lib/editAskResolve';

/**
 * Shared ask → brand label extraction.
 * Stops at layout instruction words so verifyAsk never looks for
 * "VOID Peripherals centered in the".
 */

const LAYOUT_WORD = /^(?:centered?|centred|in|the|middle|clean|white|black|text|on|screen|page|viewport|for|now|nothing|else|with|and|of|a|an)$/i;

/** Trailing instruction noise — not part of a short name like "local only". */
const TRAILING_LAYOUT = /\s+\b(?:centered?|centred|in\s+the\s+middle|in\s+the\s+center|on\s+(?:the\s+)?(?:screen|page)|nothing\s+else|clean\s+white)\b.*$/i;

const NAMED_COLOR = /^(?:black|white|blue|dark|red|green|yellow|purple|violet|brown|teal|chocolate|sienna|pink|orange|navy|cream|gr[ae]y)$/i;

const FONT_STYLE_LABEL = /^(?:bold|italic|cursive|serif|sans(?:-serif)?|thin|light|skinny|professional)(?:\s+(?:and|inside|in|a|the|bold|italic|cursive|serif|thin|light))*?$/i;

/**
 * "Show the word Hello on the screen" → "Hello"
 * "Show the sentence Welcome to my app on the screen" → "Welcome to my app"
 * Never keep layout tails ("on the screen", "in the middle").
 */
/**
 * "Put Hello on the left and Goodbye on the right" → both phrases with sides.
 * Returns [] when the ask is not a clear dual left/right place.
 */
export function extractDualSideLabels(ask: string): Array<{ label: string; side: 'left' | 'right' }> {
  const t = normalizeMessyUiEditAsk(String(ask || '').trim());
  if (!t) return [];
  if (looksLikeNameTextColorAsk(t) || looksLikeNameFontStyleAsk(t)) return [];
  const scrub = (raw: string) => String(raw || '')
    .replace(/^(?:the\s+)?(?:words?|text|phrase|title|sentence|name)\s+/i, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const dual = t.match(
    /\b(?:put|place|add|show|write|display)\s+(.+?)\s+(?:up\s+)?(?:on|in|at)\s+(?:the\s+)?left\s+and\s+(.+?)\s+(?:up\s+)?(?:on|in|at)\s+(?:the\s+)?right\b/i,
  ) || t.match(
    /\b(.+?)\s+(?:up\s+)?(?:on|in|at)\s+(?:the\s+)?left\s+and\s+(.+?)\s+(?:up\s+)?(?:on|in|at)\s+(?:the\s+)?right\b/i,
  );
  if (!dual?.[1] || !dual?.[2]) return [];
  const left = scrub(dual[1]);
  const right = scrub(dual[2]);
  if (!left || !right) return [];
  if (left.length > 48 || right.length > 48) return [];
  if (/^(?:it|that|this|them)$/i.test(left) || /^(?:it|that|this|them)$/i.test(right)) return [];
  if (NAMED_COLOR.test(left) || NAMED_COLOR.test(right)) return [];
  if (/\b(?:logo|icon|nav|footer|button|section)\b/i.test(left + ' ' + right)) return [];
  return [
    { label: left, side: 'left' },
    { label: right, side: 'right' },
  ];
}

export function extractShowWordLabel(ask: string): string {
  const t = normalizeMessyUiEditAsk(String(ask || '').trim());
  if (!t) return '';
  if (looksLikeNameTextColorAsk(t)) return '';
  // Form controls: "Add a text input…" must never become place-word label "input".
  if (/\b(?:text|email|password)\s+inputs?\b/i.test(t)) return '';
  if (/\bplaceholder\b/i.test(t) && /\b(?:input|field)\b/i.test(t)) return '';
  if (/\b(?:checkbox|radio\s+group|dropdown|select\b|textarea)\b/i.test(t)) return '';
  const isSentence = /\bsentence\b/i.test(t);
  // Prefer quoted: show/center the word/sentence "Hello" …
  const quoted = t.match(
    /\b(?:show|display|write|put|place|add|center|centre|move)\b[\s\S]{0,24}\b(?:the\s+)?(?:words?|text|phrase|title|sentence)\b[\s\S]{0,12}["“']([^"”']{1,80})["”']/i,
  )?.[1];
  // Unquoted: "Center the words Hello World on the page" / show the sentence Welcome…
  // Do NOT treat "Move that text to the top" as a label capture ("to" is a preposition).
  const bare = t.match(
    /\b(?:show|display|write|put|place|add|center|centre|move)\b[\s\S]{0,24}\b(?:the\s+)?(?:words?|text|phrase|title|sentence)\s+([A-Za-z0-9][A-Za-z0-9'_-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'_-]*){0,12})\b/i,
  )?.[1];
  let label = String(quoted || bare || '').trim().replace(/[.,;:]+$/g, '');
  if (!label) return '';
  if (/^(?:to|into|onto|on|in|at|up|back|the)\b/i.test(label)) return '';
  // "move that text to …" / "put the text back" — layout move, not a new phrase.
  // Note: do not use [A-Z] with /i (JS makes it match lowercase too).
  if (
    /\b(?:move|put|place|shift)\b[\s\S]{0,24}\b(?:that|this|the|those)\s+(?:words?|text|phrase|title)\b/i.test(t)
    && !/\b(?:words?|text|phrase|title|sentence)\s+[A-Z]/.test(t)
  ) {
    return '';
  }
  label = label
    .replace(TRAILING_LAYOUT, '')
    .replace(/\s+\b(?:on|in|at)\s+(?:the\s+)?(?:screen|page|viewport|middle|center|centre|corner|top|bottom|left|right)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  {
    const parts: string[] = [];
    for (const p of label.split(/\s+/)) {
      const w = p.replace(/[.,;:]+$/g, '');
      if (!w) continue;
      // Sentences keep "to/my/and/a/the"; short names still stop at pure layout words.
      if (!isSentence && LAYOUT_WORD.test(w)) break;
      if (isSentence && /^(?:centered?|centred|on|screen|page|viewport|middle|center|centre)$/i.test(w)) break;
      parts.push(w);
      if (parts.length >= (isSentence ? 12 : 6)) break;
    }
    label = parts.join(' ').trim();
  }
  if (/^(?:that|this|it|them|those|these|a|an|the)$/i.test(label)) return '';
  // UI chrome nouns are never on-page copy labels.
  if (/^(?:input|inputs|button|buttons|form|field|fields|checkbox|radio|dropdown|select|textarea|placeholder|label|icon|icons|nav|sidebar|modal|card|cards)$/i.test(label)) {
    return '';
  }
  if (NAMED_COLOR.test(label)) return '';
  if (FONT_STYLE_LABEL.test(label)) return '';
  if (/\b(?:navigation|nav(?:bar)?|screen|page|viewport)\b/i.test(label)) return '';
  if (label.length < 1 || label.length > 80) return '';
  return label;
}

/**
 * "put the name Oak and Bean up in the top left" → "Oak and Bean"
 * "add the name Nightglass in the center" → "Nightglass"
 */
export function extractPutPlaceNameLabel(ask: string): string {
  const t = normalizeMessyUiEditAsk(String(ask || '').trim());
  if (!t) return '';
  // Pure paint asks are not place-name asks. Font-style can combine with put/place
  // ("put Atelier top left, elegant serif") — still extract the brand label first.
  if (looksLikeNameTextColorAsk(t)) return '';
  const shown = extractShowWordLabel(t);
  if (shown) return shown;
  // Verb casing is flexible ([Pp]ut); brand capture stays Title-Case — never use /i on
  // that group or "Add a simple top navigation on the right" becomes the brand.
  const m = t.match(
    /\b(?:[Pp]ut|[Pp]lace|[Aa]dd|[Ww]rite|[Ss]how)\s+(?:the\s+)?name\s+(.+?)(?:\s+(?:up|over|down))?(?:\s+(?:in|on|at|to))?\s+(?:the\s+)?(?:top|bottom|left|right|corner|center|centre|middle)\b/,
  ) || t.match(
    // Human: "Put Keyline in the top left" / "put Glow up in the top left"
    /\b(?:[Pp]ut|[Pp]lace|[Aa]dd|[Ww]rite|[Ss]how)\s+([A-Z][A-Za-z0-9_-]*(?:\s+(?:and|&|[A-Z][A-Za-z0-9_-]*)){0,4})\s+(?:up\s+)?(?:in|on|at)\s+(?:the\s+)?(?:top|bottom|left|right|corner|center|centre|middle)\b/,
  ) || t.match(
    /\b(?:[Pp]ut|[Pp]lace|[Aa]dd|[Ww]rite|[Ss]how)\s+(?:the\s+)?name\s+([A-Za-z0-9][A-Za-z0-9_-]*(?:\s+(?:and|&|[A-Za-z0-9][A-Za-z0-9_-]*)){0,5})\b/i,
  );
  if (!m?.[1]) {
    // Font-only asks with no put/place clause — not a place-name label.
    if (looksLikeNameFontStyleAsk(t)) return '';
    return '';
  }
  let label = m[1].trim().replace(/[.,;:]+$/g, '');
  label = label
    .replace(/\s+\bonly\s+(?:add|put|place|with|and|no|nothing|keep|leave)\b.*$/i, '')
    .replace(TRAILING_LAYOUT, '')
    .replace(/\s+/g, ' ')
    .trim();
  // "Add the name Auralis in a clean serif" → stop at layout/font words (not "Auralis in a").
  {
    const parts: string[] = [];
    for (const p of label.split(/\s+/)) {
      const w = p.replace(/[.,;:]+$/g, '');
      if (!w) continue;
      if (LAYOUT_WORD.test(w)) break;
      if (/^(?:serif|typeface|sans(?:-serif)?|italic|cursive|bold|font|professional)$/i.test(w)) break;
      parts.push(w);
    }
    label = parts.join(' ').trim();
  }
  if (/^(?:that|this|it|them|those|these)$/i.test(label)) return '';
  if (NAMED_COLOR.test(label)) return '';
  if (FONT_STYLE_LABEL.test(label)) return '';
  // Instruction residue — never promote nav/layout phrases into the brand word.
  if (/\b(?:navigation|nav(?:bar)?|links?|button|section|form|headline|menu|header)\b/i.test(label)) return '';
  if (/^(?:a|an|the)\s+/i.test(label)) return '';
  if (label.length < 1 || label.length > 60) return '';
  return label;
}

/** Layout / size chrome after a brand name — not part of the product title. */
const BRAND_TRAILING_CHROME = /^(?:large|larger|huge|small|smaller|big|tiny|bold|hero|line|button|cta|title|headline)$/i;

export function extractBrandLabel(ask: string): string {
  const t = normalizeMessyUiEditAsk(String(ask || ''));
  // Prefer explicit rename targets: "change the name … to Local Only"
  const renamed = extractNameRenameTarget(t);
  if (renamed) return renamed;
  const putName = extractPutPlaceNameLabel(t);
  if (putName) return putName;

  // Prefer quoted brand: brand name "Velvet Hour" large → Velvet Hour
  const quotedBrand = t.match(
    /\bbrand\s+name\s+["“']([^"”']{2,48})["”']/i,
  )?.[1];
  const raw = (
    quotedBrand
    || t.match(/\bbrand\s+name\s+([^\n.!?]{2,80})/i)?.[1]
    || t.match(/\bbrand\s+should\s+say\s+([^\n.!?]{2,80})/i)?.[1]
    || t.match(/\bshould\s+say\s+([A-Za-z0-9][^\n.!?]{1,80})/i)?.[1]
    // "named X" / "called X" — never bare "name" (matches "the name that's…")
    || t.match(/\b(?:named|called)\s+([A-Za-z0-9][A-Za-z0-9_-]*(?:\s+[A-Za-z0-9][A-Za-z0-9_-]*){0,4})\b/i)?.[1]
    || ''
  ).trim();
  if (!raw) return '';
  const parts: string[] = [];
  for (const p of raw.split(/\s+/)) {
    const w = p.replace(/^["“']+|["”']+$/g, '').replace(/[.,;:]+$/g, '');
    if (!w) continue;
    if (LAYOUT_WORD.test(w) || BRAND_TRAILING_CHROME.test(w)) break;
    // Stop before "line …" tag instructions glued without a separator.
    if (/^line["“']/i.test(w)) break;
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
  ) || t.match(
    // "Change the name to pizza" already covered; also "it should say pizza" / "make it say pizza"
    /\b(?:should\s+)?say\s+["“']?([A-Za-z0-9][A-Za-z0-9 _-]{0,40})\b/i,
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
