/** Chat-side web lookup (Electron IPC → DuckDuckGo / Wikipedia). */

export function looksLikeWebGroundedAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 8) return false;
  // File / local disk intents should not hit the web.
  if (/\b(?:create|rename|delete|edit)\b.{0,40}\b(?:file|folder|\.ts\b|\.md\b|\.png\b)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:restaurant|menu|carrabba|carrabas|olive\s*garden|near\s+me|closest|hours|address|directions)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:recommend|recommendation|best)\b/i.test(t)
    && /\b(?:eat|meal|food|dish|place|go|order|dinner|lunch)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:my\s+car|engine|transmission|\bAC\b|air\s*conditioning|alternator|brake|check\s+engine)\b/i.test(t)
    && /\b(?:noise|problem|fix|broken|stop|stall|rattle|squeak|help)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:what(?:'s| is)|who(?:'s| is)|where(?:'s| is))\b/i.test(t)
    && /\b(?:known\s+for|famous|located|mean|company|founded)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:weather|news|stock\s+price|current\s+events)\b/i.test(t)) return true;
  if (/\blook\s+(?:up|this)\s+up\b|\bsearch\s+(?:the\s+)?(?:web|internet|online)\b/i.test(t)) return true;
  return false;
}

export async function webSearchForChat(query: string): Promise<{
  ok: boolean;
  text: string;
  sources: { title: string; url: string }[];
  error?: string;
}> {
  try {
    if (window.arkDesktop?.webSearch) {
      const res = await window.arkDesktop.webSearch(query);
      return {
        ok: Boolean(res?.ok),
        text: String(res?.text || ''),
        sources: Array.isArray(res?.sources) ? res.sources : [],
        error: res?.error,
      };
    }
  } catch (err) {
    return {
      ok: false,
      text: '',
      sources: [],
      error: err instanceof Error ? err.message : 'Web search failed',
    };
  }
  return { ok: false, text: '', sources: [], error: 'Web search unavailable outside desktop' };
}

export function formatWebLookupForPrompt(result: {
  text: string;
  sources?: { title: string; url: string }[];
}): string {
  const body = String(result.text || '').trim();
  if (!body) return '';
  const links = (result.sources || [])
    .filter((s) => s?.url)
    .slice(0, 5)
    .map((s) => `- ${s.title || 'Link'}: ${s.url}`)
    .join('\n');
  return [
    'Web lookup notes (use these facts; still answer the user directly; ask clarifying questions when needed):',
    body,
    links ? `Sources:\n${links}` : '',
  ].filter(Boolean).join('\n');
}
