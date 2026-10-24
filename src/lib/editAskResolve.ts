/**
 * Expand short conversational edit asks using the last successful edit topic.
 * "try orange" / "creamy white" / "put it back" → concrete surgical asks.
 */

export type EditTopicKind = 'background' | 'title' | 'text' | 'size' | 'generic';

export type LastEditTopic = {
  chatId: string;
  kind: EditTopicKind;
  /** Last expanded / applied ask */
  ask: string;
  /** Current value after the edit (e.g. orange, Local Path, 100mm) */
  value?: string;
  /** Value before that edit — used for “put it back” */
  priorValue?: string;
  at: number;
};

export type ResolveEditAskResult = {
  /** Ask to classify + surgically apply */
  content: string;
  /** Original composer text */
  raw: string;
  expanded: boolean;
  reason?: string;
  /** Restore files from apply snapshot instead of surgical rewrite */
  revertSnapshot?: boolean;
  /** Re-apply files from the redo buffer (after undo) */
  redoSnapshot?: boolean;
};

const byChat = new Map<string, LastEditTopic>();

const COLOR_WORDS =
  String.raw`sky\s*blue|skyblue|light\s*red|lightred|light\s*blue|lightblue|light\s*pink|lightpink|brown|white|black|red|blue|green|orange|pink|purple|gray|grey|navy|cream|creamy|teal|yellow|chocolate|sienna|violet`;

const FONT_STYLE_WORDS =
  String.raw`bold|italic|cursive|serif|sans(?:-serif)?|thin|light|skinny|professional`;

/**
 * Soften messy / ESL / typo UI edit asks into clear surgical intent.
 * Keeps meaning; does not invent product asks.
 */
export function normalizeMessyUiEditAsk(message: string): string {
  let t = String(message || '').trim();
  if (!t) return t;

  // "He changed…" / "She change…" typed instead of "Change…"
  t = t.replace(/^(?:he|she|they|we|i)\s+(?:changed|change|changd|chnged)\b/i, 'Change');
  t = t.replace(/^(?:can\s+you\s+)?(?:pls|please|plz)\s+/i, 'Can you ');
  t = t.replace(/\bcna\s+u\b/gi, 'can you');
  t = t.replace(/\bcan\s+u\b/gi, 'can you');

  // Ladder typo: "browmwhite" / "brown white" → cream (soft warm blank), not junk color.
  t = t.replace(/\bbrowm?white\b/gi, 'cream');
  t = t.replace(/\bbrowm?\s+white\b/gi, 'cream');
  t = t.replace(/\bbrown\s*white\b/gi, 'cream');

  // Correction / one-sentence color asks → apply bg, never tutor.
  // "I asked for light red", "give me light pink", "I want light pink", "I want you to give me light pink"
  {
    const correction = t.match(
      new RegExp(
        String.raw`^(?:i\s+asked\s+for|i\s+said|i\s+wanted|i\s+meant|i\s+want(?:\s+you\s+to)?(?:\s+give\s+me)?|give\s+me|should\s+(?:be|have\s+been)|make\s+it|it\s+should\s+be|you\s+(?:made|gave)\s+(?:it|me)|not\s+white\s*[,—-]?\s*(?:i\s+wanted|make\s+it)?)\s+(?:a\s+)?(${COLOR_WORDS})\s*(?:background|bg|page|color|colour)?[.!?]*$`,
        'i',
      ),
    );
    if (correction?.[1]) {
      let color = correction[1].toLowerCase().replace(/\s+/g, ' ');
      if (color === 'lightred') color = 'light red';
      if (color === 'lightpink') color = 'light pink';
      if (color === 'lightblue') color = 'light blue';
      if (color === 'skyblue') color = 'sky blue';
      return `Change the background color to ${color}.`;
    }
  }

  // "it ned to say pizza" / "it needs to say pizza" / "ned to say pizza" → rename
  t = t.replace(
    /^(?:it\s+)?(?:neds?|neads?|needs?|needed)\s+to\s+say\s+/i,
    'Change the name to ',
  );
  t = t.replace(
    /\b(?:it\s+)?(?:neds?|neads?|needs?|needed)\s+to\s+say\s+["'“”]?([A-Za-z0-9][A-Za-z0-9 _-]{0,40})/i,
    'Change the name to $1',
  );

  // Speech typo: "add a like pizza" → "add i like pizza"
  t = t.replace(/\badd\s+a\s+like\b/gi, 'add i like');

  // Keep dual left/right place asks intact — never collapse to the first label only.
  if (
    /\b(?:on|in|at)\s+(?:the\s+)?left\b/i.test(t)
    && /\b(?:on|in|at)\s+(?:the\s+)?right\b/i.test(t)
    && /\band\b/i.test(t)
  ) {
    return t;
  }

  // "Show the sentence Welcome to my app on the screen" → clear place-words ask (surgical).
  // Keep any earlier intent (bg color, rename, etc.) — never wipe half a multi-part ask.
  {
    const sentenceAsk = t.match(
      /\b(?:show|display|write|put|place|add)\b[\s\S]{0,24}\b(?:the\s+)?sentence\s+(.+?)(?:\s+(?:on|in|at)\s+(?:the\s+)?(?:screen|page|viewport|middle|center|centre))?\s*[.!?]*$/i,
    );
    if (sentenceAsk?.[1]) {
      let phrase = sentenceAsk[1]
        .trim()
        .replace(/\s+\b(?:on|in|at)\s+(?:the\s+)?(?:screen|page|viewport|middle|center|centre).*$/i, '')
        .replace(/[.,;:!?]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (phrase.length >= 2 && phrase.length <= 80) {
        const place = `Put the words ${phrase} in the center of the screen.`;
        const prefix = t.slice(0, sentenceAsk.index ?? 0)
          .trim()
          .replace(/[.,;]+\s*$/g, '')
          .replace(/\band\s*$/i, '')
          .trim();
        if (prefix && /\b(?:background|bg|colou?r|rename|change\s+the\s+name|make\s+the\s+name)\b/i.test(prefix)) {
          return `${prefix}. ${place}`;
        }
        return place;
      }
    }
  }

  // "put it back in the middle" is layout recenter — never snapshot undo / never phrase-place.
  if (
    /\bput\s+(?:it|that|this|the\s+name)\s+(?:back\s+)?(?:in(?:to)?|to)\s+(?:the\s+)?(?:middle|center|centre)\b/i.test(t)
    || /\b(?:move|put|place)\s+(?:it|that|this|the\s+name)\s+(?:back\s+)?(?:to\s+)?(?:the\s+)?(?:middle|center|centre)\b/i.test(t)
  ) {
    return 'Move the name to the center of the screen.';
  }

  // "add i like pizza on top left in all caps" → clear place-words ask (surgical, not agent).
  {
    const wantsCaps = /\b(?:in\s+)?all\s+caps\b|\buppercase\b|\bin\s+caps\b/i.test(t);
    const cornerPhrase = t.match(
      /\b(?:add|put|place|write|show)\s+(.+?)\s+(?:up\s+)?(?:in|on|at)\s+(?:the\s+)?(top[\s-]?left|top[\s-]?right|bottom[\s-]?left|bottom[\s-]?right|center|centre|middle|(?:left|right)\s+corner)\b/i,
    );
    if (cornerPhrase?.[1] && cornerPhrase[2]) {
      let phrase = cornerPhrase[1]
        .trim()
        .replace(/^(?:the\s+)?(?:words?|text|phrase|name|title)\s+/i, '')
        .replace(/^(?:a|an|the)\s+/i, '')
        .replace(/\s+/g, ' ')
        .replace(/[.,;:]+$/g, '')
        .trim();
      // Pronoun / move asks are not new labels ("put it …", "move that …").
      const pronounAsk = /^(?:it|that|this|them|those|these|back)\b/i.test(phrase)
        || /\bback\b/i.test(phrase);
      // Never collapse chrome asks (logo/icon/nav) into a center-word label.
      const chromeAsk = /\b(?:logo|icon|icons?|nav(?:igation|bar)?|button|footer|section|form|menu|search|cart|bag)\b/i.test(phrase)
        || /^(?:a|an|the)$/i.test(phrase);
      if (
        phrase
        && phrase.length >= 2
        && phrase.length <= 72
        && !pronounAsk
        && !chromeAsk
        && !/\b(?:background|page|blank|cream|white)\b/i.test(phrase)
      ) {
        if (wantsCaps) phrase = phrase.toUpperCase();
        const where = cornerPhrase[2].replace(/-/g, ' ').replace(/\s+/g, ' ').toLowerCase();
        const place = `Put the words ${phrase} in the ${where}.`;
        const prefix = t.slice(0, cornerPhrase.index ?? 0)
          .trim()
          .replace(/[.,;]+\s*$/g, '')
          .replace(/\band\s*$/i, '')
          .trim();
        if (prefix && /\b(?:background|bg|colou?r|rename|change\s+the\s+name)\b/i.test(prefix)) {
          return `${prefix}. ${place}`;
        }
        return place;
      }
    }
  }

  // "wording place" / "the wording" → the name (on-page title)
  t = t.replace(/\bthe\s+wording\s+place\b/gi, 'the name');
  t = t.replace(/\bwording\s+place\b/gi, 'the name');
  t = t.replace(/\bthe\s+wording\b/gi, 'the name');
  t = t.replace(/\bfor\s+the\s+wording\b/gi, 'for the name');

  // "change the color to black for the name" stays a text-color ask
  if (
    /\bcolou?r\b/i.test(t)
    && /\b(?:to|into)\s+(?:a\s+)?(?:black|white|blue|red|green|yellow|purple|brown|teal|pink|orange|navy|cream|gr[ae]y)\b/i.test(t)
    && /\b(?:name|title|word|text|heading|wording)\b/i.test(t)
    && !/\bbackground\b/i.test(t)
  ) {
    const color = t.match(
      /\b(?:to|into)\s+(?:a\s+)?(black|white|blue|red|green|yellow|purple|brown|teal|pink|orange|navy|cream|gr[ae]y)\b/i,
    )?.[1];
    if (color) return `Change the color of the name to ${color.toLowerCase()}.`;
  }

  // Font style: "change the name into cursive instead of bold" / "… inside a bold"
  // Never collapse full landing rewrites / multi-section asks into a one-line font tip.
  // Also never collapse put/place brand asks — "put Maison top left, elegant serif" must keep both.
  // Never collapse page-background mood asks — "deep charcoal … light text" must keep charcoal.
  const placeBrandAsk = (
    /\b(?:put|place|add|write|show)\s+(?:the\s+)?name\b/i.test(t)
    || /\b(?:[Pp]ut|[Pp]lace|[Aa]dd|[Ww]rite|[Ss]how)\s+[A-Z][A-Za-z0-9_-]*(?:\s+(?:and|&|[A-Z][A-Za-z0-9_-]*)){0,4}\s+(?:up\s+)?(?:in|on|at)\s+(?:the\s+)?(?:top|bottom|left|right|corner|center|centre|middle)\b/.test(t)
  );
  const pageMoodAsk = (
    /\b(?:charcoal|background|canvas|page)\b/i.test(t)
    && /\b(?:switch|turn|make|change|set|to|into)\b/i.test(t)
    && !/\b(?:name|title|word|heading)\b[\s\S]{0,24}\b(?:colou?r|font|bold|italic|cursive|serif)\b/i.test(t)
  );
  const structuralRewrite = placeBrandAsk
    || pageMoodAsk
    || /\b(?:replace|rewrite|rebuild|from\s+scratch|start\s+over)\b/i.test(t)
    || /\b(?:nav|hero|footer|eyebrow|cta|discover|sign\s*in)\b/i.test(t)
    || t.length > 220
    || /<!--\s*(?:nova|ark)-kind\s*:/i.test(t);
  if (
    !structuralRewrite
    && /\b(?:name|title|word|text|heading)\b/i.test(t)
    && new RegExp(`\\b(?:${FONT_STYLE_WORDS})\\b`, 'i').test(t)
    && /\b(?:change|make|set|update|look|style|into|to)\b/i.test(t)
  ) {
    const wantCursive = /\b(?:cursive|italic)\b/i.test(t);
    const wantBold = /\bbold\b/i.test(t);
    const wantThin = /\b(?:thin|light|skinny)\b/i.test(t);
    const wantSerif = /\b(?:serif|professional)\b/i.test(t);
    // "instead of being bold" / "not bold" → drop bold
    const dropBold = /\b(?:instead\s+of|not|without)\b[\s\S]{0,24}\bbold\b/i.test(t)
      || /\bbold\b[\s\S]{0,24}\b(?:instead|not)\b/i.test(t);
    const parts: string[] = [];
    if (wantCursive) parts.push('cursive');
    if (wantBold && !dropBold) parts.push('bold');
    if (wantThin) parts.push('thin');
    if (wantSerif && !wantCursive) parts.push('serif');
    if (parts.length === 1) {
      return `Make the name look more ${parts[0]}.`;
    }
    if (parts.length > 1) {
      return `Make the name look ${parts.join(' and ')}.`;
    }
  }

  return t;
}

/**
 * General messy-English softener used before turn routing.
 * Safe, conservative — only rewrites clear speech/typo patterns.
 */
export function normalizeMessyUserAsk(message: string): string {
  let t = String(message || '').trim();
  if (!t) return t;
  t = normalizeMessyUiEditAsk(t);
  // Extra light chat polish (non-destructive)
  t = t.replace(/\bi\s+want\s+you\s+to\s+/i, 'Please ');
  t = t.replace(/\bcan\s+u\b/gi, 'can you');
  t = t.replace(/\bpls\b/gi, 'please');
  t = t.replace(/\bthx\b/gi, 'thanks');
  return t.trim();
}

export function looksLikeNameFontStyleAsk(message: string): boolean {
  const t = normalizeMessyUiEditAsk(message);
  if (!t) return false;
  if (!/\b(?:name|title|word|text|heading|brand)\b/i.test(t)) return false;
  if (!new RegExp(`\\b(?:${FONT_STYLE_WORDS})\\b`, 'i').test(t)) return false;
  // Real rename to a brand that happens to include "Bold" is rare; block style-only targets.
  if (
    /\b(?:change|rename|set|update)\b[\s\S]{0,64}\b(?:name|title|word|text)\b[\s\S]{0,40}\b(?:to|into)\s+["']?[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,4}\b/i.test(t)
    && !new RegExp(`\\b(?:to|into)\\s+(?:a\\s+)?(?:${FONT_STYLE_WORDS})\\b`, 'i').test(t)
  ) {
    return false;
  }
  return /\b(?:make|look|style|font|change|set|more|try|into|to)\b/i.test(t);
}

export function rememberLastEditTopic(topic: LastEditTopic): void {
  if (!topic.chatId) return;
  byChat.set(topic.chatId, topic);
}

export function getLastEditTopic(chatId: string | null | undefined): LastEditTopic | null {
  if (!chatId) return null;
  return byChat.get(chatId) || null;
}

export function clearLastEditTopic(chatId: string): void {
  byChat.delete(chatId);
}

/** Infer topic metadata from an ask + optional pre-edit files. */
export function inferEditTopicFromAsk(
  chatId: string,
  ask: string,
  opts?: { priorFiles?: Record<string, string>; nextFiles?: Record<string, string> },
): LastEditTopic | null {
  const t = String(ask || '').trim();
  if (!chatId || !t) return null;

  const color = extractColorPhrase(t);
  if (color && (/\bbackground\b/i.test(t) || /\b(?:bg|back\s*ground)\b/i.test(t) || looksLikeColorTryAsk(t))) {
    const prior = opts?.priorFiles ? extractBackgroundColorLabel(opts.priorFiles) : undefined;
    return {
      chatId,
      kind: 'background',
      ask: t,
      value: color,
      priorValue: prior,
      at: Date.now(),
    };
  }

  const size = t.match(/\b(\d+(?:\.\d+)?)\s*(mm|millimeter|millimetre|px|rem|em|%|vh|vw)\b/i);
  if (size && /\b(?:change|set|make|try|to|from)\b/i.test(t)) {
    return {
      chatId,
      kind: 'size',
      ask: t,
      value: `${size[1]}${size[2].toLowerCase()}`,
      priorValue: undefined,
      at: Date.now(),
    };
  }

  const title = t.match(
    /\b(?:change|rename|set|make|update|try)\b[\s\S]{0,48}\b(?:title|heading|h1|brand|name|label|path|text|word)\b[\s\S]{0,24}\b(?:to|into)\s+["']?([^"'\n.!?]{2,60})/i,
  )?.[1]?.trim();
  if (title) {
    return {
      chatId,
      kind: /\b(?:title|heading|h1|brand)\b/i.test(t) ? 'title' : 'text',
      ask: t,
      value: title.replace(/[.,;:]+$/, ''),
      at: Date.now(),
    };
  }

  if (/\b(?:change|update|set|make|add|remove|fix|rename|try)\b/i.test(t)) {
    return { chatId, kind: 'generic', ask: t, at: Date.now() };
  }
  return null;
}

export function looksLikeRevertEditAsk(message: string): boolean {
  const t = String(message || '').trim();
  if (!t) return false;
  if (/^(?:undo|revert)(?:\s+that)?[.!?]*$/i.test(t)) return true;
  // "Undo the last change" / "undo what you just did"
  if (/\bundo\b/i.test(t) && /\b(?:last|previous|that|this|change|edit|apply|what\s+you)\b/i.test(t)) return true;
  // "put it back in the middle" / "… to the left" = layout ask, not file undo.
  const layoutRestore = /\b(?:middle|center|centre|left|right|top|bottom|corner)\b/i.test(t);
  if (/\b(?:put|change|set|make)\s+(?:it|that|this)\s+back\b/i.test(t)) {
    return !layoutRestore;
  }
  if (/\bput\s+back\b/i.test(t)) {
    return !layoutRestore;
  }
  if (/\b(?:go\s+back|roll\s+back|restore)\b/i.test(t) && /\b(?:old|previous|before|last)\b/i.test(t)) return true;
  if (/\bi\s+like\s+the\s+old\s+one\s+better\b/i.test(t)) return true;
  if (/\b(?:old|previous)\s+one\s+better\b/i.test(t)) return true;
  if (/\bnever\s*mind\b|\bnvm\b/i.test(t) && /\b(?:change|edit|that|it)\b/i.test(t)) return true;
  return false;
}

/** "Redo the last undone change" — restore files from the redo buffer after undo. */
export function looksLikeRedoEditAsk(message: string): boolean {
  const t = String(message || '').trim();
  if (!t) return false;
  if (/^(?:redo)(?:\s+that)?[.!?]*$/i.test(t)) return true;
  if (/\bredo\b/i.test(t) && /\b(?:last|previous|that|this|undone|change|edit|apply)\b/i.test(t)) return true;
  // Don't steal "rebuild/redo the UI from scratch" craft asks.
  if (/\b(?:scrap|rebuild|from\s+scratch|everything)\b/i.test(t)) return false;
  return false;
}

export function looksLikeColorTryAsk(message: string): boolean {
  const t = String(message || '').trim();
  if (!t || t.length > 120) return false;
  if (extractColorPhrase(t) == null) return false;
  if (/\btry\b/i.test(t)) return true;
  if (/^(?:how\s+about|what\s+about|maybe|perhaps)\b/i.test(t)) return true;
  if (
    new RegExp(
      `^(?:a\\s+)?(?:${COLOR_WORDS})(?:\\s+(?:color|colour|bg|background))?[.!?]*$`,
      'i',
    ).test(t)
  ) {
    return true;
  }
  if (
    new RegExp(
      `^(?:(?:let'?s|please)\\s+)?(?:try\\s+)?(?:a\\s+)?(?:${COLOR_WORDS})(?:\\s+white)?(?:\\s+(?:color|colour|background|bg))?[.!?]*$`,
      'i',
    ).test(t)
  ) {
    return true;
  }
  if (/\b(?:creamy|cream)\s+white\b/i.test(t) && t.length < 80) return true;
  return false;
}

export function looksLikeConversationalEditShorthand(message: string): boolean {
  const t = String(message || '').trim();
  if (!t || t.length > 160) return false;
  if (looksLikeRevertEditAsk(t)) return true;
  if (looksLikeColorTryAsk(t)) return true;
  // One-sentence color asks — bound-folder correction, not chat tutoring.
  if (
    new RegExp(
      String.raw`^(?:i\s+asked\s+for|i\s+said|i\s+wanted|i\s+meant|i\s+want(?:\s+you\s+to)?(?:\s+give\s+me)?|give\s+me|should\s+(?:be|have\s+been)|make\s+it|it\s+should\s+be)\s+(?:a\s+)?(?:${COLOR_WORDS})\b`,
      'i',
    ).test(t)
  ) {
    return true;
  }
  if (/\btry\b/i.test(t) && /\b\d+(?:\.\d+)?\s*(?:mm|millimeter|millimetre|px|rem|em)\b/i.test(t)) return true;
  if (/^try\s+["']?[A-Za-z0-9][^.!?\n]{0,60}["']?[.!?]*$/i.test(t)) return true;
  return false;
}

function extractColorPhrase(t: string): string | null {
  const creamy = t.match(/\b(creamy|cream)\s+white\b/i);
  if (creamy) return 'cream';
  const m = t.match(new RegExp(`\\b(${COLOR_WORDS})\\b`, 'i'));
  if (!m?.[1]) return null;
  let c = m[1].toLowerCase().replace(/\s+/g, ' ');
  if (c === 'creamy') return 'cream';
  if (c === 'lightred') return 'light red';
  if (c === 'lightblue') return 'light blue';
  if (c === 'lightpink') return 'light pink';
  if (c === 'skyblue') return 'sky blue';
  return c;
}

function extractBackgroundColorLabel(files: Record<string, string>): string | undefined {
  const blob = Object.entries(files || {})
    .filter(([p]) => /\.(css|jsx?|tsx?|html)$/i.test(p))
    .map(([, v]) => v)
    .join('\n');
  const bg = blob.match(/background(?:-color)?\s*:\s*([^;}\n]+)/i)?.[1]?.trim().toLowerCase() || '';
  if (!bg) return undefined;
  if (/#8b4513|#5c4033|brown|sienna|chocolate/i.test(bg)) return 'brown';
  if (/#ec4899|#ffc0cb|pink/i.test(bg)) return 'pink';
  if (/#2563eb|#3b82f6|blue/i.test(bg)) return 'blue';
  if (/#f97316|#fa7315|orange/i.test(bg)) return 'orange';
  if (/#fef3c7|#fffdd0|cream/i.test(bg)) return 'cream';
  if (/#fca5a5|#ffa0a0|light\s*red/i.test(bg)) return 'light red';
  if (/#93c5fd|light\s*blue/i.test(bg)) return 'light blue';
  if (/#87ceeb|sky\s*blue/i.test(bg)) return 'sky blue';
  if (/#fff(?:fff)?\b|white/i.test(bg)) return 'white';
  if (/#000(?:000)?\b|black/i.test(bg)) return 'black';
  if (/#0f766e|teal/i.test(bg)) return 'teal';
  if (/#dc2626|red/i.test(bg)) return 'red';
  if (/#16a34a|green/i.test(bg)) return 'green';
  if (/#7c3aed|purple|violet/i.test(bg)) return 'purple';
  if (/#6b7280|gr[ae]y/i.test(bg)) return 'gray';
  return undefined;
}

function priorUserAsks(
  messages: Array<{ role?: string; content?: string }> | undefined,
  current: string,
): string[] {
  const cur = String(current || '').trim();
  return (messages || [])
    .filter((m) => m?.role === 'user')
    .map((m) => String(m.content || '').trim())
    .filter((c) => c && c !== cur)
    .slice(-8);
}

function inferKindFromPriorAsks(priors: string[]): EditTopicKind | null {
  for (let i = priors.length - 1; i >= 0; i -= 1) {
    const p = priors[i];
    if (
      /\bbackground\b/i.test(p)
      || looksLikeColorTryAsk(p)
      || (extractColorPhrase(p) && /\b(?:color|colour)\b/i.test(p))
      // "Create a blank lightred page" — color correction follow-ups target the canvas.
      || (extractColorPhrase(p) && /\b(?:blank|page|solid)\b/i.test(p))
    ) {
      return 'background';
    }
    if (/\b\d+(?:\.\d+)?\s*(?:mm|millimeter|millimetre|px)\b/i.test(p)) return 'size';
    if (/\b(?:title|heading|h1|brand\s+name)\b/i.test(p)) return 'title';
    if (/\b(?:change|rename|set)\b[\s\S]{0,40}\b(?:to|into)\b/i.test(p)) return 'text';
  }
  return null;
}

/**
 * Expand shorthand using sticky last-edit topic and/or prior user asks.
 * When workspaceBound and the ask is a color try with no topic, default to background.
 */
export function resolveConversationalEditAsk(opts: {
  message: string;
  chatId?: string | null;
  messages?: Array<{ role?: string; content?: string }>;
  workspaceBound?: boolean;
  hasApplySnapshot?: boolean;
  hasRedoSnapshot?: boolean;
}): ResolveEditAskResult {
  const raw = String(opts.message || '').trim();
  const normalized = normalizeMessyUiEditAsk(raw);
  const base: ResolveEditAskResult = {
    content: normalized,
    raw,
    expanded: normalized !== raw,
    reason: normalized !== raw ? 'messy-ui-normalize' : undefined,
  };
  if (!normalized) return { content: raw, raw, expanded: false };

  const sticky = getLastEditTopic(opts.chatId || null);
  const priors = priorUserAsks(opts.messages, raw);
  const kindFromPrior = sticky?.kind || inferKindFromPriorAsks(priors);

  if (looksLikeRedoEditAsk(normalized) || looksLikeRedoEditAsk(raw)) {
    if (opts.hasRedoSnapshot) {
      return {
        content: raw,
        raw,
        expanded: true,
        reason: 'redo-snapshot',
        redoSnapshot: true,
      };
    }
    return base;
  }

  if (looksLikeRevertEditAsk(normalized) || looksLikeRevertEditAsk(raw)) {
    if (sticky?.kind === 'background' && sticky.priorValue) {
      return {
        content: `Change the background color to ${sticky.priorValue}.`,
        raw,
        expanded: true,
        reason: 'revert-background-prior',
      };
    }
    if (sticky?.kind === 'size' && sticky.priorValue) {
      return {
        content: `Change it to ${sticky.priorValue}.`,
        raw,
        expanded: true,
        reason: 'revert-size-prior',
      };
    }
    if (sticky?.value && sticky.priorValue && (sticky.kind === 'title' || sticky.kind === 'text')) {
      return {
        content: `Change it back to ${sticky.priorValue}.`,
        raw,
        expanded: true,
        reason: 'revert-text-prior',
      };
    }
    if (opts.hasApplySnapshot) {
      return {
        content: raw,
        raw,
        expanded: true,
        reason: 'revert-snapshot',
        revertSnapshot: true,
      };
    }
    return base;
  }

  const color = extractColorPhrase(normalized);
  const sizeTry = normalized.match(/\btry\b[\s\S]{0,24}\b(\d+(?:\.\d+)?)\s*(mm|millimeter|millimetre|px|rem|em)\b/i);
  const tryRest = normalized.match(/^try\s+(.+?)[.!?]*$/i)?.[1]?.trim();

  // Bound folder + color correction / bare color → paint the canvas (never tutor).
  // Never steal button/control/title recolors into page background via sticky "background" topic.
  const controlColorAsk = (
    /\b(?:buttons?|controls?|links?|inputs?|primary|secondary)\b/i.test(normalized)
    && /\b(?:to|into|turn|make|paint|hover)\b/i.test(normalized)
  ) || (
    /\btitle\b/i.test(normalized)
    && /\b(?:red|green|blue|orange|purple|teal|pink|black|white|larger|bigger)\b/i.test(normalized)
    && !/\bbackground\b/i.test(normalized)
  );
  if (
    opts.workspaceBound
    && color
    && !controlColorAsk
    && !/\b(?:name|title|word|text|heading|wording)\b/i.test(normalized)
    && (
      /^change the background color to /i.test(normalized)
      || looksLikeColorTryAsk(normalized)
      || looksLikeConversationalEditShorthand(raw)
      || (kindFromPrior === 'background' && color)
    )
  ) {
    if (!/^change the background color to /i.test(normalized)) {
      return {
        content: `Change the background color to ${color}.`,
        raw,
        expanded: true,
        reason: 'correction-color-background',
      };
    }
  }

  if (color && (looksLikeColorTryAsk(normalized) || (opts.workspaceBound && /\btry\b/i.test(normalized)))) {
    // Don't treat "name color to black" as a page background try.
    if (looksLikeNameFontStyleAsk(normalized) || /\b(?:name|title|word|text|heading)\b[\s\S]{0,40}\bcolou?r\b/i.test(normalized)
      || /\bcolou?r\b[\s\S]{0,40}\b(?:name|title|word|text|heading)\b/i.test(normalized)) {
      return {
        content: normalized,
        raw,
        expanded: normalized !== raw,
        reason: normalized !== raw ? 'messy-ui-normalize' : undefined,
      };
    }
    const useBg = kindFromPrior === 'background'
      || kindFromPrior == null
      || /\b(?:background|bg|color|colour)\b/i.test(normalized)
      || opts.workspaceBound;
    if (
      useBg
      && !controlColorAsk
      && !/\b(?:name|title|word|text|heading|wording)\b/i.test(normalized)
    ) {
      return {
        content: `Change the background color to ${color}.`,
        raw,
        expanded: true,
        reason: 'try-color-background',
      };
    }
  }

  if (sizeTry && (kindFromPrior === 'size' || opts.workspaceBound)) {
    const unit = sizeTry[2].toLowerCase().startsWith('millimet') ? 'mm' : sizeTry[2];
    return {
      content: `Change it to ${sizeTry[1]}${unit}.`,
      raw,
      expanded: true,
      reason: 'try-size',
    };
  }

  if (tryRest && sticky?.kind === 'title') {
    return {
      content: `Change the title to ${tryRest}.`,
      raw,
      expanded: true,
      reason: 'try-title',
    };
  }
  if (tryRest && sticky?.kind === 'text') {
    return {
      content: `Change the text to ${tryRest}.`,
      raw,
      expanded: true,
      reason: 'try-text',
    };
  }
  if (tryRest && sticky?.kind === 'generic' && sticky.ask) {
    const swapped = sticky.ask.replace(
      /\b(?:to|into)\s+["']?[^"'\n.!?]{1,60}["']?\s*$/i,
      `to ${tryRest}`,
    );
    if (swapped !== sticky.ask) {
      return { content: swapped, raw, expanded: true, reason: 'try-swap-prior-to' };
    }
    return {
      content: `${sticky.ask.replace(/[.!?]+$/, '')} — try ${tryRest}.`,
      raw,
      expanded: true,
      reason: 'try-append-prior',
    };
  }

  return base;
}
