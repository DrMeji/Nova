/**
 * Deterministic color-code replies — no LLM boilerplate about HTML/CSS.
 * Chat markdown already renders #hex as a click-to-copy swatch.
 */

const NAMED_HEX: Array<[RegExp, string, string]> = [
  [/\b(?:cream\s*white|white\s*cream)\b/i, '#FFFDD0', 'cream white'],
  [/\bcream\b/i, '#FFFDD0', 'cream'],
  [/\bivory\b/i, '#FFFFF0', 'ivory'],
  [/\boff[-\s]?white\b/i, '#FAF9F6', 'off-white'],
  [/\bpurple\b/i, '#800080', 'purple'],
  [/\bviolet\b/i, '#8F00FF', 'violet'],
  [/\bindigo\b/i, '#4B0082', 'indigo'],
  [/\blavender\b/i, '#E6E6FA', 'lavender'],
  [/\bmagenta\b/i, '#FF00FF', 'magenta'],
  [/\bpink\b/i, '#FFC0CB', 'pink'],
  [/\bhot\s*pink\b/i, '#FF69B4', 'hot pink'],
  [/\bred\b/i, '#FF0000', 'red'],
  [/\bcrimson\b/i, '#DC143C', 'crimson'],
  [/\bmaroon\b/i, '#800000', 'maroon'],
  [/\borange\b/i, '#FFA500', 'orange'],
  [/\bcoral\b/i, '#FF7F50', 'coral'],
  [/\bgold\b/i, '#FFD700', 'gold'],
  [/\byellow\b/i, '#FFFF00', 'yellow'],
  [/\blime\b/i, '#00FF00', 'lime'],
  [/\bgreen\b/i, '#008000', 'green'],
  [/\bteal\b/i, '#008080', 'teal'],
  [/\bcyan\b|\baqua\b/i, '#00FFFF', 'cyan'],
  [/\bsky\s*blue\b/i, '#87CEEB', 'sky blue'],
  [/\bnavy\b/i, '#000080', 'navy'],
  [/\bblue\b/i, '#0000FF', 'blue'],
  [/\bbrown\b/i, '#A52A2A', 'brown'],
  [/\bbeige\b/i, '#F5F5DC', 'beige'],
  [/\btan\b/i, '#D2B48C', 'tan'],
  [/\bblack\b/i, '#000000', 'black'],
  [/\bwhite\b/i, '#FFFFFF', 'white'],
  [/\bgr[ae]y\b/i, '#808080', 'gray'],
  [/\bsilver\b/i, '#C0C0C0', 'silver'],
];

/** True when the user is asking for a hex/color code (not a UI edit). */
export function looksLikeColorCodeAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 160) return false;
  // Project/UI edit asks stay on the edit path.
  if (/\b(?:background|button|header|banner|css|change|make|set|use)\b/i.test(t)
    && /\b(?:color|colour)\b/i.test(t)
    && !/\b(?:code|hex|hexadecimal)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:color|colour)\s*codes?\b/i.test(t)) return true;
  if (/\b(?:color|colour)\s+code\s+to\b/i.test(t)) return true;
  if (/\bhex(?:adecimal)?\s*(?:code|color|colour)?\b/i.test(t)) return true;
  if (/\b(?:what(?:'s|\s+is)|give\s+me|can\s+you\s+give|show\s+me)\b.{0,40}\b(?:color|colour|hex)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:color|colour)\s+(?:for|of|to)\b/i.test(t) && /\b(?:code|hex)\b/i.test(t)) return true;
  return false;
}

function resolveNamedColor(ask: string): { hex: string; label: string } | null {
  const t = String(ask || '');
  // Explicit hex in the ask — echo it back.
  const bare = t.match(/#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i);
  if (bare) {
    let hex = `#${bare[1]}`.toUpperCase();
    if (bare[1].length === 3) {
      hex = `#${bare[1].split('').map((c) => c + c).join('')}`.toUpperCase();
    }
    return { hex, label: hex };
  }
  for (const [re, hex, label] of NAMED_HEX) {
    if (re.test(t)) return { hex, label };
  }
  return null;
}

/** Short reply: one line + clickable hex swatch (rendered by chatMarkdown). */
export function colorCodeReply(ask: string): string {
  const hit = resolveNamedColor(ask);
  if (!hit) {
    return [
      "Sure — tell me the color name (or paste a hex) and I'll give you the code.",
      '',
      'Example: purple → **#800080**',
    ].join('\n');
  }
  return `Sure — here's the color code for **${hit.label}**:\n\n${hit.hex}`;
}
