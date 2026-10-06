/**
 * Research open references before create craft.
 * Inspiration only — never claim cloned proprietary sites are original IP.
 *
 * Research is driven by the user's ask text (not a canned product catalog).
 * When the ask is UI/landing/visual, also pull public UI-kit hubs as reference paths.
 */

import { webSearchForChat, formatWebLookupForPrompt } from '@/lib/webSearch';
import { extractReferenceSiteUrl } from '@/lib/brandAssets';

/**
 * Curated UI reference hubs — inspiration only.
 * Nova may search / cite these when craft needs layout help; never scrape assets or clone trademarks.
 */
export const UI_REFERENCE_HUBS: { name: string; url: string; use: string }[] = [
  { name: '21st.dev', url: 'https://21st.dev/', use: 'modern React/component UI patterns' },
  { name: 'Figma UI design', url: 'https://www.figma.com/ui-design-tool/', use: 'layout, spacing, and visual hierarchy inspiration' },
  { name: 'Mobbin', url: 'https://mobbin.com/', use: 'mobile/web product UI patterns' },
  { name: 'Landingfolio', url: 'https://www.landingfolio.com/', use: 'landing-page section patterns' },
];

/** Every create with a real brief should research before craft. */
export function looksLikeNeedsCreateResearch(brief: string): boolean {
  const t = String(brief || '').trim();
  return t.length >= 8;
}

/** Visual / landing / screenshot-style asks benefit from UI-hub research. */
export function looksLikeNeedsUiReferenceResearch(brief: string): boolean {
  const t = String(brief || '').toLowerCase();
  if (t.length < 8) return false;
  return /\b(?:ui|ux|landing|website|homepage|hero|screenshot|mockup|figma|design|layout|page|site|visual|aesthetic|looks?\s+like|replica|clone|match\s+(?:this|the)\s+image)\b/i.test(t)
    || /!\[[^\]]*]\([^)]+\)/.test(String(brief || ''))
    || /nova-media:/.test(String(brief || ''));
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

/** Public UI pattern search — prefer hubs, force uniqueness (colors/type/copy). */
export function uiReferenceQueryFromBrief(brief: string, projectName: string): string {
  const t = String(brief || '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const name = String(projectName || '').trim();
  const hubs = UI_REFERENCE_HUBS.map((h) => h.name).slice(0, 2).join(' OR ');
  return [
    hubs,
    name,
    t || 'landing page',
    'UI layout section patterns inspiration unique colors typography',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 220);
}

function uiHubReferenceBlock(): string {
  return [
    'UI REFERENCE HUBS (go here when stuck on layout — inspiration only, rebuild unique):',
    ...UI_REFERENCE_HUBS.map((h) => `- ${h.name}: ${h.url} (${h.use})`),
    'HARD UNIQUENESS: Do NOT rebuild the same generic purple/cream template every time.',
    'Change colors, texture, type, wording, and section rhythm so each project feels distinct.',
    'Never scrape proprietary assets or claim trademark ownership. Rebuild original UI in App.jsx + App.css (or static HTML/CSS).',
  ].join('\n');
}

export async function researchCreateReferences(opts: {
  brief: string;
  projectName: string;
}): Promise<{ ok: boolean; notes: string; sources: { title: string; url: string }[] }> {
  const query = researchQueryFromBrief(opts.brief, opts.projectName);
  const implQuery = implementQueryFromBrief(opts.brief, opts.projectName);
  const wantUi = looksLikeNeedsUiReferenceResearch(opts.brief);
  const uiQuery = wantUi ? uiReferenceQueryFromBrief(opts.brief, opts.projectName) : '';
  const refUrl = extractReferenceSiteUrl(opts.brief);
  const [hit, implHit, uiHit] = await Promise.all([
    webSearchForChat(query, { timeoutMs: 14_000 }),
    webSearchForChat(implQuery, { timeoutMs: 14_000 }),
    wantUi
      ? webSearchForChat(uiQuery, { timeoutMs: 12_000 })
      : Promise.resolve({ ok: false, text: '', sources: [] as { title: string; url: string }[] }),
  ]);
  const parts: string[] = [];
  const sources = [
    ...(hit.sources || []),
    ...(implHit.sources || []),
    ...(uiHit.sources || []),
  ];

  if (refUrl) {
    parts.push(
      `User reference site: ${refUrl}\nMatch layout/IA, hierarchy, and tone as inspiration only — rebuild original UI in App.jsx + App.css. Do not scrape proprietary assets or claim trademark ownership.`,
    );
    sources.unshift({ title: 'User reference', url: refUrl });
  }

  // Always give craft a concrete path to UI hubs when the ask is visual — even if search is thin.
  if (wantUi) {
    parts.push(uiHubReferenceBlock());
    for (const h of UI_REFERENCE_HUBS) {
      sources.push({ title: h.name, url: h.url });
    }
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
  if (wantUi && uiHit.ok && uiHit.text) {
    parts.push(
      [
        'UI PATTERN RESEARCH (from public hubs / search — adapt, do not clone):',
        String(uiHit.text).slice(0, 1800),
        'Pick 1–2 layout ideas, then reinvent colors, type, copy, and texture so the result is unique.',
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
        uiHubReferenceBlock(),
      ].join(' '),
      sources: UI_REFERENCE_HUBS.map((h) => ({ title: h.name, url: h.url })),
    };
  }

  const notes = [
    'Create research notes (inspiration only — rebuild original UI; do not copy proprietary assets):',
    `USER ASK: ${String(opts.brief || '').replace(/\s+/g, ' ').trim().slice(0, 400)}`,
    'Build THAT product. Never swap in Core/Day/Reserve booking cards, a shop grid, or a marketing homepage unless the ask is clearly that.',
    ...parts,
  ].join('\n\n');

  return { ok: true, notes: notes.slice(0, 7500), sources: filterUniqueSources(sources).slice(0, 16) };
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
