/**
 * Reply sanity — general guards against plan-prompt bleed and runaway token dumps.
 * Topic-agnostic: applies to any chat (keyboard, apps, shopping, etc.).
 */

/** Product-plan wrap-up that must never leak into normal chat answers. */
const PLAN_OVERALL_BLEED_RE =
  /\s*Overall:\s*keep\s+(?:the\s+first\s+version\s+tiny|v1\s+tiny|every\s+band)[\s\S]*/gi;

const PLAN_WHO_USER_RE =
  /\s*Who\s+is\s+(?:the\s+)?main\s+user,?\s+and\s+what\s+is\s+the\s+one\s+action[^.?\n]*[.?]?\s*/gi;

/**
 * Strip product-plan “Overall: keep the first version tiny…” bleed glued mid-reply
 * (including inside broken markdown links like `[Mechanical Key Overall: …]`).
 */
export function scrubPlanExitBleed(text: string): string {
  let body = String(text || '');
  if (!body) return body;
  // Broken markdown link that swallowed the plan exit.
  body = body.replace(/\[[^\]]{0,120}Overall:\s*keep[^\]]*\](?:\([^)]*\))?/gi, '');
  body = body.replace(PLAN_OVERALL_BLEED_RE, '');
  body = body.replace(PLAN_WHO_USER_RE, '');
  body = body.replace(/\s*Nail that before extras[^.?\n]*[.?]?\s*/gi, '');
  body = body.replace(/\s*one core screen and one must-have action[^.?\n]*[.?]?\s*/gi, '');
  body = body.replace(/\s*Would you like to proceed with this plan[^.?\n]*[.?]?\s*/gi, '');
  return body.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * True when the model dumped URL-encoded / hex token garbage (e.g. `%2Cfff80181%2Cfff…`)
 * instead of natural language. Topic-agnostic runaway detector.
 */
export function looksLikeRunawayTokenGarbage(text: string): boolean {
  const t = String(text || '');
  if (t.length < 160) return false;

  const pct = (t.match(/%[0-9a-fA-F]{2}/g) || []).length;
  if (pct >= 24) {
    const density = pct / Math.max(1, t.length / 8);
    if (density >= 0.12) return true;
  }
  if ((t.match(/%2[Cc]fff[0-9a-fA-F]{2,}/gi) || []).length >= 6) return true;
  if ((t.match(/,fff[0-9a-fA-F]{4,}/gi) || []).length >= 10) return true;
  if (/(?:%2[Cc]fff\d+){8,}/i.test(t)) return true;
  if (/(?:fff\d{4,}){12,}/i.test(t)) return true;

  // Long blob with almost no real words but lots of hex-ish crumbs.
  const words = (t.match(/[A-Za-z]{4,}/g) || []).length;
  if (t.length >= 600 && words < 18 && /[0-9a-f]{6,}/i.test(t) && pct >= 8) return true;

  return false;
}

/** Cut reply at the start of a garbage run; keep the leading prose if any. */
export function cutBeforeTokenGarbage(text: string): string {
  const t = String(text || '');
  if (!t) return '';
  const markers = [
    t.search(/%2[Cc]fff/i),
    t.search(/(?:,fff[0-9a-fA-F]{4,}){4,}/i),
    t.search(/(?:%[0-9a-fA-F]{2}){20,}/i),
  ].filter((i) => i >= 0);
  if (!markers.length) {
    return looksLikeRunawayTokenGarbage(t) ? '' : t;
  }
  const idx = Math.min(...markers);
  if (idx < 24) return '';
  return scrubPlanExitBleed(t.slice(0, idx));
}

/**
 * User wants store / vendor / parts purchase links (any product — not books-only).
 * “give me links where I can buy the parts to build X”
 */
export function looksLikeShoppingOrPartsLinksAsk(text: string): boolean {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || t.length < 10) return false;
  // Explicit “no shopping links” / companion book chat — never treat as store ask.
  if (/\b(?:no|without|never|don'?t|do\s+not)\s+(?:any\s+)?(?:shopping|store|purchase|buy)\s+links?\b/i.test(t)) {
    return false;
  }
  if (/\b(?:this|the|my|our)\s+(?:project|folder|app|codebase)\b/i.test(t)
    && !/\b(?:buy|purchase|amazon|parts?|components?)\b/i.test(t)) {
    return false;
  }
  const wantsStore =
    /\b(?:where\s+(?:can|do)\s+i\s+(?:buy|purchase|get|order|find)|give\s+me\s+(?:some\s+)?links?|links?\s+(?:to\s+)?(?:where|buy|purchase|for)|shopping\s+links?|store\s+links?|vendor\s+links?)\b/i.test(t);
  // Do not treat the word “shopping” alone as a buy cue (false-positives “no shopping links”).
  const buyCue =
    /\b(?:buy|purchase|order|parts?|components?|materials?|supplies|kit|amazon|digi-?key|mouser|adafruit|sparkfun)\b/i.test(t)
    || /\bshopping\s+(?:for|list)\b/i.test(t);
  if (wantsStore && buyCue) return true;
  if (/\blinks?\b/i.test(t) && /\b(?:buy|purchase|order)\b/i.test(t) && /\b(?:parts?|components?|materials?|build)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function shoppingLinksHonestGap(_ask?: string): string {
  return [
    'I could not finish a clean list of store links for that.',
    'Name the exact parts you need (for example switches, PCB, case, keycaps, MCU) and I will look up vendors again — or search Amazon, Digi-Key, Mouser, Adafruit, or SparkFun for those parts.',
  ].join(' ');
}

/**
 * Real how-to / DIY / “exactly how to build X” asks — depth + options + parts, not software plan_talk.
 * Topic-agnostic: webcam, keyboard, drone, PC, etc.
 */
export function looksLikeHowToGuideAsk(text: string): boolean {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || t.length < 12) return false;
  // Software greenfield stays on the plan path.
  if (/\b(?:vite|react\s+app|saas|landing\s+page|scaffold|@@@FILE|on\s+disk)\b/i.test(t)
    && !/\b(?:camera|webcam|keyboard|drone|pcb|arduino|raspberry|hardware|sensor|lens)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:exactly\s+how|step[- ]by[- ]step|from\s+scratch|full\s+(?:guide|walkthrough|breakdown)|complete\s+(?:guide|build|walkthrough))\b/i.test(t)
    && /\b(?:build|make|assemble|wire|construct|put\s+together)\b/i.test(t)) {
    return true;
  }
  // Allow light adverbs: “how do I actually build this out” — but only for hardware/DIY context
  // (or when no software greenfield cues), so sticky Plan still owns software “how do I build this app”.
  const howBuild = /\bhow\s+(?:do|can|would|to)\s+(?:i|you|we)?\s+(?:\w+\s+){0,3}(?:build|make|assemble|wire|construct)\b/i.test(t);
  if (howBuild) {
    const hardware = /\b(?:camera|webcam|web\s*camera|keyboard|drone|pc|robot|circuit|pcb|arduino|raspberry|gadget|device|prototype|sensor|lens|microphone|hardware|parts?)\b/i.test(t);
    const softGreenfield = /\b(?:vite|react|saas|landing\s+page|website|web\s*app|mobile\s+app|scaffold)\b/i.test(t);
    if (hardware || !softGreenfield) return true;
  }
  if (/\b(?:i(?:'m| am)\s+trying\s+to\s+build|help\s+me\s+build|need\s+to\s+know\s+(?:exactly\s+)?how\s+to\s+build|want\s+to\s+build)\b/i.test(t)
    && /\b(?:camera|webcam|web\s*camera|keyboard|drone|pc|robot|circuit|pcb|arduino|raspberry|gadget|device|prototype|sensor|lens|microphone)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:build\s+(?:a|an|my|the)\s+(?:diy\s+)?(?:webcam|web\s*camera|camera|keyboard|drone|custom\s+pc))\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Thin outline that dodges the ask (generic 1-2-3 + “would you like to start with…”). */
export function looksLikeThinHowToOutline(reply: string, ask: string): boolean {
  if (!looksLikeHowToGuideAsk(ask) && !looksLikeShoppingOrPartsLinksAsk(ask)) return false;
  const t = String(reply || '').trim();
  if (!t) return true;
  const links = (t.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/gi) || []).length
    + (t.match(/https?:\/\/[^\s)]+/gi) || []).length;
  const numbered = (t.match(/^\s*\d+[.)]/gm) || []).length;
  const softClose = /\bwould you like (?:to\s+)?(?:start|go deeper|know more|begin|pick)\b/i.test(t)
    || /\bor do you (?:need|want) more details\b/i.test(t);
  // Short tease that ends by asking which section to open — not a real guide.
  if (t.length < 900 && softClose && links < 2) return true;
  if (t.length < 550 && numbered >= 3 && links === 0 && softClose) return true;
  // Generic MCU lecture with no named modules / vendors when user asked how to build.
  if (
    looksLikeHowToGuideAsk(ask)
    && t.length < 700
    && /\bmicrocontroller\b/i.test(t)
    && !/\b(?:IMX\d|OV\d{3,4}|Arducam|Arduino|Raspberry\s*Pi|Digi-?Key|Adafruit|SparkFun|UVC|MIPI)\b/i.test(t)
    && softClose
  ) {
    return true;
  }
  return false;
}

export function howToGuideHonestGap(ask?: string): string {
  const topic = String(ask || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  return [
    'I started that guide too thin.',
    topic
      ? `Ask again and I will lay out real options, a first prototype path, named parts, rough prices, and buy links for “${topic}”.`
      : 'Ask again and I will lay out real options, a first prototype path, named parts, rough prices, and buy links.',
  ].join(' ');
}

/**
 * Tooling / IDE / language questions about an ongoing DIY build — stay in normal chat.
 * Never auto-enter Plan mode for “do I need Python or VS Code?”.
 */
export function looksLikeBuildToolingAsk(text: string): boolean {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || t.length < 8) return false;
  if (/\b(?:keep\s+refining|update\s+the\s+plan|lets?\s+build\s+this|scaffold|on\s+disk|@@@FILE)\b/i.test(t)) {
    return false;
  }
  const toolCue = /\b(?:python|vs\s*code|vscode|arduino\s+ide|platformio|micropython|circuitpython|c\+\+|firmware|ide|editor|compiler|library|opencv|thuggy)\b/i.test(t);
  const askCue = /\b(?:what\s+(?:program|software|language|ide|editor|tool)|do\s+i\s+(?:need|use)|should\s+i\s+use|how\s+do\s+i\s+(?:\w+\s+){0,3}(?:build|code|write|flash)|which\s+(?:program|language|ide|tool)|what\s+program\s+i\s+can\s+use)\b/i.test(t);
  if (toolCue && askCue) return true;
  if (toolCue && /\b(?:build\s+this|build\s+(?:it|one)|make\s+this|program\s+(?:it|this)|code\s+(?:it|this))\b/i.test(t)) {
    return true;
  }
  // “what program / do I need Python or VS Code” even without an explicit how-to verb
  if (askCue && /\b(?:python|vs\s*code|vscode|program|ide|editor)\b/i.test(t) && /\?/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Strip markdown # / ## / #### heading markers from chat replies.
 * Prefer plain **Bold** titles — never show raw hashtags to the user.
 */
export function scrubMarkdownHashHeadings(text: string): string {
  let body = String(text || '').replace(/\r\n/g, '\n');
  if (!body) return body;
  // Line-leading ATX headings → bold titles
  body = body.replace(/^[ \t]*#{1,6}[ \t]+(.+?)\s*$/gm, (_m, title) => {
    const clean = String(title || '').replace(/\*+/g, '').replace(/#{1,}/g, '').trim();
    return clean ? `**${clean}**` : '';
  });
  // Mid-paragraph #### Title glued into prose (common local-model failure)
  body = body.replace(/[ \t]*#{1,6}[ \t]+/g, '\n\n');
  // Leftover bare hash runs
  body = body.replace(/#{2,}/g, '');
  body = body.replace(/^[ \t]*#[ \t]*$/gm, '');
  return body.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * True when a markdown link label does not match the destination URL
 * (e.g. “Adafruit OV5647” pointing at a random Adafruit product page).
 */
export function linkLabelMatchesUrl(label: string, url: string): boolean {
  const lab = String(label || '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();
  if (!lab) return true;
  let hay = '';
  try {
    hay = decodeURIComponent(String(url || '')).toLowerCase();
  } catch {
    hay = String(url || '').toLowerCase();
  }
  if (!hay) return false;
  // Distinctive part codes (OV5647, IMX219, ESP32, …)
  const codes = lab.match(/\b(?:ov|imx|esp|rp|pi|samd|stm32)[\w-]*\b/gi) || [];
  if (codes.some((c) => hay.includes(c.toLowerCase()))) return true;
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'module', 'camera', 'board', 'link', 'buy', 'here',
    'adafruit', 'amazon', 'sparkfun', 'digikey', 'mouser', 'display', 'sensor', 'usb',
  ]);
  const tokens = lab.split(/\s+/).filter((t) => t.length >= 3 && !stop.has(t));
  if (!tokens.length) {
    // Label is only generic words — require host brand if present in label
    if (/\badafruit\b/i.test(lab) && /adafruit\.com/i.test(hay)) return true;
    if (/\bamazon\b/i.test(lab) && /amazon\./i.test(hay)) return true;
    return /\/s\?k=/i.test(hay); // search URLs are ok for generic labels
  }
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits >= Math.min(2, tokens.length) || (tokens.length === 1 && hits === 1);
}

/** Prefer a search URL that embeds the exact part name over a mismatched product page. */
export function shopSearchUrlForLabel(label: string): string {
  const q = String(label || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!q) return '';
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
}
