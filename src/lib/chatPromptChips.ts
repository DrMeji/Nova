/** Clickable quick-action chips embedded in assistant messages. */

export type PromptChip = {
  label: string;
  prompt: string;
};

export type PromptChipsPayload = {
  chips: PromptChip[];
};

const CHIPS_MARKER_RE = /<!--nova-prompt-chips:([\s\S]*?)-->\n?/;

export function isPromptChipsMessage(content: string): boolean {
  return CHIPS_MARKER_RE.test(String(content || ''));
}

export function parsePromptChipsMessage(content: string): {
  body: string;
  chips: PromptChip[];
} {
  const raw = String(content || '');
  const m = raw.match(CHIPS_MARKER_RE);
  if (!m?.[1]) return { body: raw, chips: [] };
  try {
    const payload = JSON.parse(m[1]) as PromptChipsPayload;
    const body = raw.replace(CHIPS_MARKER_RE, '').trim();
    return { body, chips: payload.chips || [] };
  } catch {
    return { body: raw.replace(CHIPS_MARKER_RE, '').trim(), chips: [] };
  }
}

export function encodePromptChipsMessage(body: string, chips: PromptChip[]): string {
  const trimmed = String(body || '').trim();
  if (!chips.length) return trimmed;
  return `<!--nova-prompt-chips:${JSON.stringify({ chips })}-->\n${trimmed}`;
}

export function promptChipsToPlainText(chips: PromptChip[]): string {
  return chips.map(c => c.label).join(' · ');
}
