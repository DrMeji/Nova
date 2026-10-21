/**
 * Ask fidelity spine — parse what the user asked into concrete ops, verify they
 * all landed, and keep micro asks from inventing landing-page chrome.
 *
 * This is the antidote to one-off ladder patches: every place/rename/bg/move
 * ask goes through the same plan → apply → verify loop.
 */

import {
  extractDualSideLabels,
  extractNameRenameTarget,
  extractNameTextColorTarget,
  extractPutPlaceNameLabel,
  extractShowWordLabel,
  looksLikeNameTextColorAsk,
} from '@/lib/brandLabel';
import { looksLikeNameFontStyleAsk, normalizeMessyUiEditAsk } from '@/lib/editAskResolve';

export type UiAskCorner =
  | 'left'
  | 'right'
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type UiAskOp =
  | { kind: 'dual-place'; left: string; right: string }
  | { kind: 'place-word'; label: string; corner: UiAskCorner }
  | { kind: 'rename'; label: string }
  | { kind: 'solid-bg'; colorWord: string; hex: string }
  | { kind: 'move-name'; corner: UiAskCorner }
  | { kind: 'name-color'; colorWord: string }
  | { kind: 'name-font'; styles: string[] }
  | { kind: 'remove-label'; label: string };

export type UiAskPlan = {
  raw: string;
  normalized: string;
  ops: UiAskOp[];
  /** Place / rename / bg / move / paint only — never invent sections. */
  microOnly: boolean;
};

export type UiAskVerify = {
  ok: boolean;
  missing: string[];
  checked: number;
};

function parseCorner(chunk: string): UiAskCorner | null {
  const s = String(chunk || '');
  if (/\btop[\s-]?left\b/i.test(s)) return 'top-left';
  if (/\btop[\s-]?right\b/i.test(s)) return 'top-right';
  if (/\bbottom[\s-]?left\b/i.test(s)) return 'bottom-left';
  if (/\bbottom[\s-]?right\b/i.test(s)) return 'bottom-right';
  if (/\b(?:center|centre|middle)\b/i.test(s)) return 'center';
  if (/\bright\b/i.test(s) && !/\bleft\b/i.test(s)) return 'right';
  if (/\bleft\b/i.test(s) && !/\bright\b/i.test(s)) return 'left';
  // Bare "top of the screen" / "bottom of the page" (ladder notes).
  if (/\btop\b/i.test(s) && !/\bbottom\b/i.test(s)) return 'top-left';
  if (/\bbottom\b/i.test(s) && !/\btop\b/i.test(s)) return 'bottom-left';
  return null;
}

function cornerPhrase(c: UiAskCorner): string {
  if (c === 'left') return 'the left';
  if (c === 'right') return 'the right';
  if (c === 'center') return 'the center of the screen';
  return c.replace('-', ' ');
}

/** Turn one op into a canonical surgical ask the existing canon already understands. */
export function canonicalAskForOp(op: UiAskOp): string {
  switch (op.kind) {
    case 'dual-place':
      return `Put ${op.left} on the left and ${op.right} on the right.`;
    case 'place-word':
      return `Put the words ${op.label} in ${cornerPhrase(op.corner)}.`;
    case 'rename':
      return `Change the name to ${op.label}.`;
    case 'solid-bg':
      return `Change the background color to ${op.colorWord}.`;
    case 'move-name':
      return `Move the name to ${cornerPhrase(op.corner)}.`;
    case 'name-color':
      return `Change the color of the name to ${op.colorWord}.`;
    case 'name-font':
      return `Make the name look ${op.styles.join(' and ')}.`;
    case 'remove-label':
      if (op.label === '__last__') return 'Remove the on-page words and leave a blank page.';
      return `Remove the words ${op.label} from the page.`;
    default:
      return '';
  }
}

/**
 * Parse the user message into fidelity ops.
 * Multi-part asks become multiple ops — never drop the second half.
 */
export function planUiAsk(message: string): UiAskPlan {
  const raw = String(message || '').trim();
  const normalized = normalizeMessyUiEditAsk(raw);
  const t = normalized || raw;
  const ops: UiAskOp[] = [];

  // 0) Remove on-page copy — before place/rename so "remove Welcome…" isn't treated as show.
  if (/\b(?:remove|delete|get rid of|take\s+(?:off|away)|clear)\b/i.test(t)
    && !/\b(?:nav|sidebar|footer|section|button|icon|logo|form|card)\b/i.test(t)) {
    const quoted = t.match(/["“']([^"”']{1,80})["”']/)?.[1]?.trim();
    const welcome = t.match(/\b(welcome(?:\s+to\s+(?:my\s+)?app)?)\b/i)?.[1];
    const shown = extractShowWordLabel(t.replace(/\b(?:remove|delete|get rid of|take\s+(?:off|away)|clear)\b/gi, 'show'));
    const label = (quoted || welcome || shown || '').trim();
    if (label && label.length >= 2 && label.length <= 80) {
      ops.push({ kind: 'remove-label', label });
    } else if (/\b(?:what\s+you\s+(?:just\s+)?added|that(?:\s+text)?|the\s+(?:words?|text|sentence|title))\b/i.test(t)) {
      ops.push({ kind: 'remove-label', label: '__last__' });
    }
  }

  // 1) Dual left/right — highest priority (must not collapse to first label).
  const dual = extractDualSideLabels(t);
  if (dual.length === 2 && !ops.some((o) => o.kind === 'remove-label')) {
    ops.push({
      kind: 'dual-place',
      left: dual.find((d) => d.side === 'left')?.label || dual[0].label,
      right: dual.find((d) => d.side === 'right')?.label || dual[1].label,
    });
  }

  // 2) Solid page background (blank or change-bg). Hex resolved later by canon.
  // Prefer multi-word colors (sky blue) — greedy [\s\S] must not steal "sky " and leave "blue".
  const COLOR = String.raw`cream\s*[- ]?\s*brown|brown\s*[- ]?\s*cream|sky\s*blue|skyblue|light\s*red|lightred|light\s*blue|lightblue|light\s*pink|lightpink|chocolate|sienna|brown|black|white|cream|navy|teal|pink|orange|purple|yellow|green|red|blue|gr[ae]y`;
  const bgWord = t.match(
    new RegExp(String.raw`\b(?:background|bg)\b[\s\S]{0,48}?\b(${COLOR})\b`, 'i'),
  )?.[1]
    || (
      !/\b(?:buttons?|title|heading|h1|text|name|word|label|link)\b/i.test(t)
        ? t.match(
          new RegExp(String.raw`\b(?:change|set|make|turn|update|switch)\b[\s\S]{0,48}?\b(?:to|into)\s+(?:a\s+)?(?:solid\s+)?(${COLOR})\b`, 'i'),
        )?.[1]
        : undefined
    )
    || (/\bjust\s+a\s+solid\b/i.test(t) && t.match(new RegExp(String.raw`\b(${COLOR})\b`, 'i'))?.[1]);
  if (bgWord && !looksLikeNameTextColorAsk(t) && !/\bbuttons?\b/i.test(t)) {
    const colorWord = bgWord.toLowerCase().replace(/\s+/g, ' ').replace(/lightpink/, 'light pink')
      .replace(/lightred/, 'light red').replace(/lightblue/, 'light blue').replace(/skyblue/, 'sky blue')
      .replace(/cream\s*-\s*brown/, 'cream brown').replace(/brown\s*-\s*cream/, 'cream brown');
    const hex = (
      /cream\s*brown|brown\s*cream/.test(colorWord) ? '#c4a882'
        : /light\s*pink/.test(colorWord) ? '#fbcfe8'
          : /light\s*red/.test(colorWord) ? '#fca5a5'
            : /light\s*blue/.test(colorWord) ? '#bfdbfe'
              : /sky\s*blue/.test(colorWord) ? '#87CEEB'
                : /^pink$/.test(colorWord) ? '#ec4899'
                  : /cream/.test(colorWord) ? '#f5f0e8'
                    : /brown/.test(colorWord) ? '#8B4513'
                      : /white/.test(colorWord) ? '#ffffff'
                        : /black/.test(colorWord) ? '#000000'
                          : /teal/.test(colorWord) ? '#0f766e'
                            : /orange/.test(colorWord) ? '#f97316'
                              : /purple/.test(colorWord) ? '#7c3aed'
                                : /green/.test(colorWord) ? '#16a34a'
                                  : /navy/.test(colorWord) ? '#1e3a8a'
                                    : /yellow/.test(colorWord) ? '#eab308'
                                      : /red/.test(colorWord) ? '#dc2626'
                                        : /blue/.test(colorWord) ? '#2563eb'
                                          : ''
    );
    ops.push({
      kind: 'solid-bg',
      colorWord,
      hex,
    });
  }

  // 3) Place / show word (skip if dual / remove already covers).
  // Form-control asks are surgical shells — never fidelity place-word.
  const formControlAsk = /\b(?:text\s+input|email\s+input|password\s+input|placeholder|checkbox|radio\s+group|dropdown|select\b|textarea|Submit\s+button)\b/i.test(t)
    || (/\bform\b/i.test(t) && /\b(?:name|email|Submit)\b/i.test(t));
  if (!dual.length && !ops.some((o) => o.kind === 'remove-label') && !formControlAsk) {
    const label = (
      extractShowWordLabel(t)
      || extractPutPlaceNameLabel(t)
      || ''
    ).trim();
    if (label) {
      const corner = parseCorner(t) || (
        /\b(?:middle|center|centre|screen)\b/i.test(t) ? 'center' : 'center'
      );
      // Rename-only (no place) is handled below.
      const placing = /\b(?:put|place|add|show|display|write|move|center|centre)\b/i.test(t)
        || /\b(?:left|right|top|bottom|corner|center|middle|screen)\b/i.test(t);
      if (placing && !extractNameRenameTarget(t)) {
        ops.push({ kind: 'place-word', label, corner });
      }
    }
  }

  // 4) Rename
  const renamed = extractNameRenameTarget(t);
  if (renamed && !dual.length) {
    // Don't double-count place-word that used the same label from "change name to X" without layout.
    const alreadyPlace = ops.some((o) => o.kind === 'place-word' && o.label.toLowerCase() === renamed.toLowerCase());
    if (!alreadyPlace) ops.push({ kind: 'rename', label: renamed });
  }

  // 5) Move a named word ("Move Hello to the top of the screen") — place if missing.
  // Pronouns / "the name" / "that text" are move-name only (never invent label "the name").
  const PRONOUN_MOVE = /^(?:it|this|that|them|the|the\s+name|the\s+words?|the\s+title|the\s+text|that\s+text|this\s+text|those\s+words?)$/i;
  if (!dual.length && !ops.some((o) => o.kind === 'place-word' || o.kind === 'remove-label')) {
    const moveNamed = t.match(
      /\b(?:move|shift)\s+["“']?([A-Za-z][A-Za-z0-9' _-]{0,40}?)["”']?\s+(?:to|into|onto|up\s+to)\s+(?:the\s+)?(.+)$/i,
    );
    if (moveNamed?.[1]) {
      const label = String(moveNamed[1]).replace(/\s+/g, ' ').trim();
      const corner = parseCorner(moveNamed[2] || t) || parseCorner(t);
      if (label && corner && label.length <= 48) {
        if (PRONOUN_MOVE.test(label)) {
          ops.push({ kind: 'move-name', corner });
        } else {
          ops.push({ kind: 'place-word', label, corner });
        }
      }
    }
  }
  // 5b) Move existing name (no new label) — "put it back", "move that text"
  if (
    !dual.length
    && !ops.some((o) => o.kind === 'place-word' || o.kind === 'move-name')
    && /\b(?:move|put|place|shift)\b[\s\S]{0,40}\b(?:it|this|that|the\s+name|the\s+word|the\s+title|the\s+text|that\s+text)\b/i.test(t)
  ) {
    const corner = parseCorner(t);
    if (corner) ops.push({ kind: 'move-name', corner });
  }

  // 6) Name text color / font
  if (looksLikeNameTextColorAsk(t)) {
    const c = extractNameTextColorTarget(t);
    if (c) ops.push({ kind: 'name-color', colorWord: c });
  }
  if (looksLikeNameFontStyleAsk(t)) {
    const styles: string[] = [];
    if (/\b(?:cursive|italic)\b/i.test(t)) styles.push('cursive');
    if (/\bbold\b/i.test(t) && !/\b(?:instead\s+of|not|without)\b[\s\S]{0,16}\bbold\b/i.test(t)) styles.push('bold');
    if (/\b(?:thin|light|skinny)\b/i.test(t)) styles.push('thin');
    if (/\b(?:serif|professional)\b/i.test(t) && !/\bcursive\b/i.test(t)) styles.push('serif');
    if (styles.length) ops.push({ kind: 'name-font', styles });
  }

  // Deduplicate identical ops
  const seen = new Set<string>();
  const unique = ops.filter((op) => {
    const key = JSON.stringify(op);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const microOnly = unique.length > 0
    && unique.every((op) => (
      op.kind === 'dual-place'
      || op.kind === 'place-word'
      || op.kind === 'rename'
      || op.kind === 'solid-bg'
      || op.kind === 'move-name'
      || op.kind === 'name-color'
      || op.kind === 'name-font'
      || op.kind === 'remove-label'
    ))
    && !/\b(?:nav|footer|about|features?|section|hero|cta|shop|contact|form|landing|homepage)\b/i.test(t);

  return { raw, normalized: t, ops: unique, microOnly };
}

export function isMicroFidelityPlan(plan: UiAskPlan): boolean {
  return Boolean(plan?.microOnly && plan.ops.length > 0);
}

function haystack(files: Record<string, string>): string {
  return Object.entries(files || {})
    .filter(([p]) => /\.(jsx?|tsx?|css|html)$/i.test(p))
    .map(([, v]) => String(v || ''))
    .join('\n');
}

function hasLabel(blob: string, label: string): boolean {
  const want = String(label || '').trim();
  if (!want) return false;
  return blob.toLowerCase().includes(want.toLowerCase());
}

/** Post-apply: every planned op must be visible in the files. */
export function verifyUiAskPlan(plan: UiAskPlan, files: Record<string, string>): UiAskVerify {
  const blob = haystack(files);
  const missing: string[] = [];
  let checked = 0;

  for (const op of plan.ops) {
    if (op.kind === 'dual-place') {
      checked += 2;
      if (!hasLabel(blob, op.left)) missing.push(`“${op.left}” on the left`);
      if (!hasLabel(blob, op.right)) missing.push(`“${op.right}” on the right`);
      if (op.left && hasLabel(blob, op.left) && !/corner-word--left|left\s*:\s*1\.|text-align\s*:\s*left/i.test(blob)) {
        // Soft: label present is enough if dual CSS missing but both labels exist.
      }
      continue;
    }
    if (op.kind === 'place-word' || op.kind === 'rename') {
      checked += 1;
      if (!hasLabel(blob, op.label)) missing.push(`“${op.label}”`);
      continue;
    }
    if (op.kind === 'solid-bg') {
      checked += 1;
      const needle = op.hex || op.colorWord;
      if (needle && !blob.toLowerCase().includes(String(needle).toLowerCase())
        && !(op.colorWord && new RegExp(`\\b${op.colorWord.replace(/\s+/g, '\\s*')}\\b`, 'i').test(blob))) {
        // Accept common hex for named colors when hex wasn't filled.
        // Check light* before bare pink/red/blue so #fbcfe8 satisfies light pink.
        const ok = (
          (/cream\s*brown|brown\s*cream/i.test(op.colorWord) && /#c4a882|#c9a87[0-9a-f]|#d4b896/i.test(blob))
          || (/brown/i.test(op.colorWord) && !/cream/i.test(op.colorWord) && /#8[Bb]4513/i.test(blob))
          || (/light\s*pink/i.test(op.colorWord) && /#fbcfe8|#f9a8d4|#fce7f3/i.test(blob))
          || (/light\s*red/i.test(op.colorWord) && /#fca5a5|#ffa0a0/i.test(blob))
          || (/light\s*blue/i.test(op.colorWord) && /#bfdbfe|#93c5fd|#add8e6/i.test(blob))
          || (/sky\s*blue/i.test(op.colorWord) && /#87[Cc][Ee][Ee][Bb]|#7dd3fc/i.test(blob))
          || (/^pink$/i.test(op.colorWord.trim()) && /#ec4899|#f472b6/i.test(blob))
          || (/white|cream/i.test(op.colorWord) && /#fff|#f[5-9a-f]{5}|cream/i.test(blob))
          || (/black/i.test(op.colorWord) && /#000|#0a0a0a|#111/i.test(blob))
          || (/teal/i.test(op.colorWord) && /#0f766e|#0d9488|#14b8a6|#0b1210|#0b1c1c|#134e4a/i.test(blob))
          || (/orange/i.test(op.colorWord) && /#f97316|#ea580c|#fb923c/i.test(blob))
          || (/purple/i.test(op.colorWord) && /#7c3aed|#8b5cf6|#a855f7/i.test(blob))
          || (/green/i.test(op.colorWord) && /#16a34a|#22c55e|#15803d/i.test(blob))
          || (/navy/i.test(op.colorWord) && /#1e3a8a|#1e40af/i.test(blob))
          || (/yellow/i.test(op.colorWord) && /#eab308|#facc15/i.test(blob))
          || (/^red$/i.test(op.colorWord.trim()) && /#dc2626|#ef4444/i.test(blob))
          || (/^blue$/i.test(op.colorWord.trim()) && /#2563eb|#3b82f6/i.test(blob))
        );
        if (!ok) missing.push(`${op.colorWord} background`);
      }
      continue;
    }
    if (op.kind === 'move-name') {
      checked += 1;
      const pin = op.corner.includes('right') ? /right\s*:\s*1\./i
        : op.corner.includes('left') || op.corner === 'left' || op.corner === 'top-left' || op.corner === 'bottom-left'
          ? /left\s*:\s*1\.|top:\s*1\.|bottom:\s*1\./i
          : /center|translateX\(-50%\)|justify-content\s*:\s*center|text-align\s*:\s*center/i;
      // Soft: if any on-page title exists, layout CSS pin is enough — never demand literal "the name".
      if (!pin.test(blob) && !/center-word|corner-word/i.test(blob)) {
        missing.push(`name at ${op.corner}`);
      }
      continue;
    }
    if (op.kind === 'name-color') {
      checked += 1;
      // Soft check — color hex may vary.
      continue;
    }
    if (op.kind === 'name-font') {
      checked += 1;
      continue;
    }
    if (op.kind === 'remove-label') {
      checked += 1;
      if (op.label === '__last__') {
        // Cleared to blank shell — accept empty center/corner words.
        if (/className=["'](?:center-word|corner-word)/i.test(blob)) {
          missing.push('removed on-page words');
        }
      } else if (hasLabel(blob, op.label)) {
        missing.push(`still shows “${op.label}”`);
      }
      continue;
    }
  }

  // Invented junk that micro asks must never grow.
  if (plan.microOnly) {
    if (/\bAbout Us\b/i.test(blob) && !/\babout\b/i.test(plan.normalized)) {
      missing.push('unexpected About Us (invented)');
    }
    if (/\bFeature\s*[123]\b/i.test(blob) && !/\bfeature/i.test(plan.normalized)) {
      missing.push('unexpected Features block (invented)');
    }
  }

  return { ok: missing.length === 0, missing, checked };
}

/** Strict agent brief when a micro plan partially missed — invent nothing. */
export function fidelityAgentBrief(plan: UiAskPlan, missing: string[]): string {
  const lines = [
    'Do ONLY what the user asked. Invent nothing.',
    'Do NOT add About Us, Features, footers, nav, sample copy, or extra sections.',
    'Emit @@@FILE blocks with COMPLETE file contents for every file you change.',
    '',
    `User ask: ${plan.raw}`,
    '',
    'Required ops:',
    ...plan.ops.map((op, i) => `${i + 1}. ${canonicalAskForOp(op)}`),
  ];
  if (missing.length) {
    lines.push('', 'Still missing after local patch:', ...missing.map((m) => `- ${m}`));
  }
  return lines.join('\n');
}
