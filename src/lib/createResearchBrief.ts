/**
 * Research open references before create craft.
 * Inspiration only — never claim cloned proprietary sites are original IP.
 *
 * Research is driven by the user's ask text (not a canned product catalog).
 */

import { webSearchForChat, formatWebLookupForPrompt } from '@/lib/webSearch';
import { extractReferenceSiteUrl } from '@/lib/brandAssets';

/** Every create with a real brief should research before craft. */
export function looksLikeNeedsCreateResearch(brief: string): boolean {
  const t = String(brief || '').trim();
  return t.length >= 8;
}

/** What is this product / feature set? — from the user ask only. */
export function researchQueryFromBrief(brief: string, projectName: string): string {
  const t = String(brief || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const name = String(projectName || '').trim();
  const refUrl = extractReferenceSiteUrl(brief);
  if (refUrl) {
    let host = refUrl;
    try { host = new URL(refUrl).hostname.replace(/^www\./, ''); } catch { /* keep */ }
    return `${host} homepage layout hierarchy React Vite UI reference inspiration only`.slice(0, 220);
  }
  return [
    'what is',
    name || t.slice(0, 80),
    t,
    'UI features examples interactive app (not marketing landing unless asked)',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 220);
}

/** How to implement this ask in React/Vite — brief-literal, no canned genre. */
export function implementQueryFromBrief(brief: string, projectName: string): string {
  const t = String(brief || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const name = String(projectName || '').trim();
  return [
    'React Vite',
    name,
    t,
    'App.jsx App.css interactive UI state buttons best practices',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 220);
}

export async function researchCreateReferences(opts: {
  brief: string;
  projectName: string;
}): Promise<{ ok: boolean; notes: string; sources: { title: string; url: string }[] }> {
  const query = researchQueryFromBrief(opts.brief, opts.projectName);
  const implQuery = implementQueryFromBrief(opts.brief, opts.projectName);
  const refUrl = extractReferenceSiteUrl(opts.brief);
  const [hit, implHit] = await Promise.all([
    webSearchForChat(query, { timeoutMs: 18_000 }),
    webSearchForChat(implQuery, { timeoutMs: 18_000 }),
  ]);
  const parts: string[] = [];
  const sources = [...(hit.sources || []), ...(implHit.sources || [])];

  if (refUrl) {
    parts.push(
      `User reference site: ${refUrl}\nMatch layout/IA, hierarchy, and tone as inspiration only — rebuild original UI in App.jsx + App.css. Do not scrape proprietary assets or claim trademark ownership.`,
    );
    sources.unshift({ title: 'User reference', url: refUrl });
  }
  if (hit.ok && hit.text) {
    parts.push(
      [
        'PRODUCT RESEARCH (what people mean by this ask — match these capabilities, not a different product):',
        formatWebLookupForPrompt(hit),
      ].join('\n'),
    );
  }
  if (implHit.ok && implHit.text) {
    parts.push(
      [
        'IMPLEMENTATION NOTES (public React/Vite patterns for THIS ask):',
        String(implHit.text).slice(0, 2200),
        'HARD: Rebuild in App.jsx + App.css. Real interactive controls (useState). Do not invent a different product category.',
      ].join('\n'),
    );
  }

  if (!parts.length) {
    return {
      ok: false,
      notes: [
        'Reference research returned no usable public results.',
        'Build strictly from the user brief — the interactive product they named.',
        'Do not substitute a booking, shop, or marketing landing unless they asked for that.',
      ].join(' '),
      sources: [],
    };
  }

  const notes = [
    'Create research notes (inspiration only — rebuild original UI; do not copy proprietary assets):',
    `USER ASK: ${String(opts.brief || '').replace(/\s+/g, ' ').trim().slice(0, 400)}`,
    'Build THAT product. Never swap in Core/Day/Reserve booking cards, a shop grid, or a marketing homepage unless the ask is clearly that.',
    ...parts,
  ].join('\n\n');

  return { ok: true, notes: notes.slice(0, 7000), sources: filterUniqueSources(sources).slice(0, 12) };
}

function filterUniqueSources(sources: { title: string; url: string }[]): { title: string; url: string }[] {
  const seen = new Set<string>();
  const out: { title: string; url: string }[] = [];
  for (const s of sources || []) {
    const u = String(s?.url || '').trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push({ title: String(s.title || u).slice(0, 120), url: u });
  }
  return out;
}
