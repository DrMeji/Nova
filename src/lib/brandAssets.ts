/**
 * Create-time Brand Assets: fetch logos, UI icons, and unique CC photos,
 * save them into public/, and wire App.jsx/CSS to local paths.
 * Never scrape apple.com CDN. Never reuse banned Unsplash cafe IDs.
 * Pollinations is not used as a create fallback.
 */

import { extractVisionImages, getMemoryThumb } from '@/lib/recentStore';
import { heroSeedForProject } from '@/lib/siteHeroImages';
import { createIdentityFromBrief, heroResultMatchesCategory, svgHeroDataUrl } from '@/lib/createIdentity';

export type BrandAssetRole = 'logo' | 'icon' | 'hero';

export type BrandAssetSlot = {
  role: BrandAssetRole;
  id: string;
  /** Vite-public path, e.g. public/logo.svg → served as /logo.svg */
  rel: string;
  href: string;
  query?: string;
  iconify?: string;
  /** User-pasted URL wins over search. */
  explicitUrl?: string;
};

export type BrandAssetPlan = {
  projectName: string;
  slots: BrandAssetSlot[];
};

const BANNED_PHOTO_IDS = [
  '1554118811-1e0d58224f24',
  '1517248135467-4c7edcad34c4',
  '1523275335684-37898b6baf30',
  '1497366216548-37526070297c',
];

const ICONIFY_COLLECTIONS = new Set([
  'lucide', 'simple-icons', 'mdi', 'tabler', 'ph', 'heroicons', 'ri', 'bi', 'carbon', 'ion',
]);

function joinDisk(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${rel.replace(/^[/\\]+/, '').replace(/\//g, sep)}`;
}

function publicHref(rel: string): string {
  return `/${rel.replace(/^public\//, '').replace(/\\/g, '/')}`;
}

function iconifySvgUrl(id: string, height = 64): string {
  // Iconify wants /prefix/name.svg — encoding the colon as %3A returns 403.
  const raw = String(id || '').trim();
  const m = raw.match(/^([a-z0-9-]+):([a-z0-9-]+)$/i);
  const path = m ? `${m[1]}/${m[2]}` : raw.replace(':', '/');
  const h = Number(height) || 64;
  return `https://api.iconify.design/${path}.svg?height=${h}`;
}

/** Make Iconify SVGs ink-readable on cream/light canvases (img tags ignore CSS currentColor). */
export function tintIconSvg(svg: string, ink = '#1a1a1a'): string {
  let s = String(svg || '');
  if (!s.includes('<svg')) return s;
  s = s.replace(/\scurrentColor/g, ` ${ink}`);
  s = s.replace(/="currentColor"/g, `="${ink}"`);
  s = s.replace(/fill="currentColor"/gi, `fill="${ink}"`);
  s = s.replace(/stroke="currentColor"/gi, `stroke="${ink}"`);
  return s;
}

async function saveUrl(diskRoot: string, rel: string, url: string): Promise<{ ok: boolean; text: string; rel: string }> {
  if (!window.arkDesktop?.workspaceSaveAsset) return { ok: false, text: '', rel };
  let destRel = rel;
  let fetchUrl = String(url || '');
  // Unsplash auto=format may return AVIF/WebP — force JPEG for <img src="*.jpg"> reliability.
  if (/images\.unsplash\.com/i.test(fetchUrl)) {
    if (!/[?&]fm=/i.test(fetchUrl)) fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'fm=jpg';
    fetchUrl = fetchUrl.replace(/([?&])auto=format&?/i, '$1').replace(/[?&]$/, '');
    if (!/[?&]fm=jpg/i.test(fetchUrl)) fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'fm=jpg';
  }
  const dataMime = fetchUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,/i)?.[1]?.toLowerCase();
  if (dataMime) {
    const ext = dataMime.includes('png') ? 'png'
      : dataMime.includes('webp') ? 'webp'
      : dataMime.includes('gif') ? 'gif'
      : dataMime.includes('avif') ? 'avif'
      : 'jpg';
    destRel = rel.replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, `.${ext}`);
  }
  const saved = await window.arkDesktop.workspaceSaveAsset({
    targetPath: joinDisk(diskRoot, destRel),
    url: fetchUrl,
    timeoutMs: 45000,
  }) as { ok?: boolean; text?: string; path?: string; error?: string } | null;
  if (!saved?.ok) return { ok: false, text: '', rel: destRel };
  const text = String(saved.text || '');
  if (saved.path) {
    const root = diskRoot.replace(/[/\\]+$/, '');
    const abs = String(saved.path).replace(/\\/g, '/');
    const rootNorm = root.replace(/\\/g, '/');
    if (abs.toLowerCase().startsWith(rootNorm.toLowerCase())) {
      destRel = abs.slice(rootNorm.length).replace(/^[/\\]+/, '');
      if (!destRel.startsWith('public/')) destRel = destRel.includes('heroes/') ? `public/${destRel.replace(/^.*?(heroes\/)/, '$1')}` : destRel;
      // Normalize to public/heroes/...
      const m = abs.match(/public\/heroes\/[^/]+$/i) || abs.match(/heroes\/[^/]+$/i);
      if (m) destRel = m[0].startsWith('public/') ? m[0] : `public/${m[0]}`;
    }
  }
  return { ok: true, text, rel: destRel.replace(/\\/g, '/') };
}

/** Iconify ids mentioned in chat (lucide:search, simple-icons:apple). */
export function extractIconifyIds(text: string): string[] {
  const out: string[] = [];
  const re = /\b([a-z0-9-]+):([a-z0-9-]+)\b/gi;
  let m: RegExpExecArray | null;
  const blob = String(text || '');
  while ((m = re.exec(blob))) {
    const col = m[1].toLowerCase();
    if (!ICONIFY_COLLECTIONS.has(col)) continue;
    out.push(`${col}:${m[2].toLowerCase()}`);
  }
  // Iconify page / API links
  for (const u of extractExplicitAssetUrls(blob)) {
    const api = u.match(/api\.iconify\.design\/([^/?#]+)\.svg/i);
    if (api?.[1]) out.push(decodeURIComponent(api[1]));
    const page = u.match(/icon-sets\.iconify\.design\/([^/?#]+)\/([^/?#]+)/i);
    if (page) out.push(`${page[1]}:${page[2]}`);
  }
  return [...new Set(out)];
}

export function extractExplicitAssetUrls(text: string): string[] {
  const out: string[] = [];
  const re = /https?:\/\/[^\s)\]}'"]+/gi;
  let m: RegExpExecArray | null;
  const blob = String(text || '');
  while ((m = re.exec(blob))) {
    const u = m[0].replace(/[.,;:]+$/, '');
    if (
      /\.(?:svg|png|jpe?g|webp|gif)(?:$|\?)/i.test(u)
      || /iconify\.design|openverse|wikimedia|unsplash|pexels|images\.unsplash|i\.imgur|cloudinary|cdn\./i.test(u)
    ) {
      // Never treat Pollinations as a preferred asset source.
      if (/pollinations\.ai/i.test(u)) continue;
      out.push(u);
    }
  }
  return [...new Set(out)];
}

/** Non-asset https URL the user wants as a design reference (e.g. publics.com). */
export function extractReferenceSiteUrl(text: string): string | null {
  const re = /https?:\/\/[^\s)\]}'"]+/gi;
  let m: RegExpExecArray | null;
  const blob = String(text || '');
  while ((m = re.exec(blob))) {
    const u = m[0].replace(/[.,;:]+$/, '');
    if (/\.(?:svg|png|jpe?g|webp|gif|css|js)(?:$|\?)/i.test(u)) continue;
    if (/iconify\.design|openverse|unsplash|pexels|pollinations|githubusercontent|raw\.github/i.test(u)) continue;
    if (/github\.com\/.+\/.+/i.test(u) && !/\b(?:use|reference|like|inspired)\b/i.test(blob)) continue;
    return u;
  }
  return null;
}

export function looksLikeAssetLinkAsk(message: string): boolean {
  const t = String(message || '');
  if (extractExplicitAssetUrls(t).length > 0) return true;
  if (extractIconifyIds(t).length > 0) return true;
  return /\b(?:use (?:this|these|the) (?:link|url|icon|image|photo|picture)s?|from (?:this|these) (?:link|url)s?|icons? from|add (?:these )?(?:icons?|images?|photos?)|professional icons?)\b/i.test(t);
}

function looksLikeGame(brief: string): boolean {
  return /\b(?:game|playable|canvas|wasd|three\.?js|webgl)\b/i.test(brief)
    && !/\b(?:apple\.com|marketing|homepage|landing)\b/i.test(brief);
}

/** Real company marks via Iconify simple-icons (local copies, not hotlinked). */
export const BRAND_LOGO_CATALOG: Array<{ id: string; label: string; iconify: string; re: RegExp }> = [
  { id: 'apple', label: 'Apple', iconify: 'simple-icons:apple', re: /\bapple\b/i },
  { id: 'google', label: 'Google', iconify: 'simple-icons:google', re: /\bgoogle\b/i },
  { id: 'github', label: 'GitHub', iconify: 'simple-icons:github', re: /\bgithub\b/i },
  { id: 'discord', label: 'Discord', iconify: 'simple-icons:discord', re: /\bdiscord\b/i },
  { id: 'twitch', label: 'Twitch', iconify: 'simple-icons:twitch', re: /\btwitch\b/i },
  { id: 'netflix', label: 'Netflix', iconify: 'simple-icons:netflix', re: /\bnetflix\b/i },
  { id: 'spotify', label: 'Spotify', iconify: 'simple-icons:spotify', re: /\bspotify\b/i },
  { id: 'youtube', label: 'YouTube', iconify: 'simple-icons:youtube', re: /\byoutube\b/i },
  { id: 'instagram', label: 'Instagram', iconify: 'simple-icons:instagram', re: /\binstagram\b/i },
  { id: 'x', label: 'X', iconify: 'simple-icons:x', re: /\btwitter\b|\bx\s+logo\b|(?:,\s*|\band\s+)x(?=,|\s+and\b|\s+logos?\b)/i },
  { id: 'linkedin', label: 'LinkedIn', iconify: 'simple-icons:linkedin', re: /\blinkedin\b/i },
  { id: 'slack', label: 'Slack', iconify: 'simple-icons:slack', re: /\bslack\b/i },
  { id: 'amazon', label: 'Amazon', iconify: 'simple-icons:amazon', re: /\bamazon\b/i },
  { id: 'microsoft', label: 'Microsoft', iconify: 'simple-icons:microsoft', re: /\bmicrosoft\b/i },
  { id: 'meta', label: 'Meta', iconify: 'simple-icons:meta', re: /\b(?:meta|facebook)\b/i },
  { id: 'reddit', label: 'Reddit', iconify: 'simple-icons:reddit', re: /\breddit\b/i },
  { id: 'tiktok', label: 'TikTok', iconify: 'simple-icons:tiktok', re: /\btiktok\b/i },
  { id: 'notion', label: 'Notion', iconify: 'simple-icons:notion', re: /\bnotion\b/i },
  { id: 'figma', label: 'Figma', iconify: 'simple-icons:figma', re: /\bfigma\b/i },
  { id: 'dropbox', label: 'Dropbox', iconify: 'simple-icons:dropbox', re: /\bdropbox\b/i },
];

/** UI / product icons via Lucide. */
export const UI_ICON_CATALOG: Array<{ id: string; label: string; iconify: string; re: RegExp }> = [
  { id: 'menu', label: 'menu', iconify: 'lucide:menu', re: /\bmenu\b/i },
  { id: 'search', label: 'search', iconify: 'lucide:search', re: /\bsearch\b/i },
  { id: 'user', label: 'profile', iconify: 'lucide:user', re: /\b(?:profile|user|account)\b/i },
  { id: 'settings', label: 'settings', iconify: 'lucide:settings', re: /\b(?:settings?|gear|cog)\b/i },
  { id: 'bell', label: 'bell', iconify: 'lucide:bell', re: /\b(?:bell|notif(?:ication)?s?)\b/i },
  { id: 'heart', label: 'heart', iconify: 'lucide:heart', re: /\b(?:heart|favorite|like)\b/i },
  { id: 'cart', label: 'cart', iconify: 'lucide:shopping-cart', re: /\b(?:cart|shopping)\b/i },
  { id: 'bag', label: 'bag', iconify: 'lucide:shopping-bag', re: /\bbag\b/i },
  { id: 'home', label: 'home', iconify: 'lucide:home', re: /\bhome\b/i },
  { id: 'mail', label: 'mail', iconify: 'lucide:mail', re: /\b(?:mail|email|inbox)\b/i },
  { id: 'calendar', label: 'calendar', iconify: 'lucide:calendar', re: /\bcalendar\b/i },
  { id: 'camera', label: 'camera', iconify: 'lucide:camera', re: /\bcamera\b/i },
  { id: 'mic', label: 'mic', iconify: 'lucide:mic', re: /\b(?:mic|microphone)\b/i },
  { id: 'share', label: 'share', iconify: 'lucide:share-2', re: /\bshare\b/i },
  { id: 'download', label: 'download', iconify: 'lucide:download', re: /\bdownload\b/i },
  { id: 'upload', label: 'upload', iconify: 'lucide:upload', re: /\bupload\b/i },
  { id: 'trash', label: 'trash', iconify: 'lucide:trash-2', re: /\b(?:trash|delete|bin)\b/i },
  { id: 'edit', label: 'edit', iconify: 'lucide:pencil', re: /\b(?:edit|pencil)\b/i },
  { id: 'lock', label: 'lock', iconify: 'lucide:lock', re: /\b(?:lock|secure|security)\b/i },
  { id: 'star', label: 'star', iconify: 'lucide:star', re: /\bstar\b/i },
  { id: 'bookmark', label: 'bookmark', iconify: 'lucide:bookmark', re: /\bbookmark\b/i },
  { id: 'help', label: 'help', iconify: 'lucide:circle-help', re: /\b(?:help|faq)\b/i },
  { id: 'info', label: 'info', iconify: 'lucide:info', re: /\binfo\b/i },
  { id: 'filter', label: 'filter', iconify: 'lucide:list-filter', re: /\bfilter\b/i },
  { id: 'grid', label: 'grid', iconify: 'lucide:layout-grid', re: /\b(?:grid|apps)\b/i },
  { id: 'more', label: 'more', iconify: 'lucide:ellipsis', re: /\b(?:more|ellipsis|overflow)\b/i },
  { id: 'clock', label: 'clock', iconify: 'lucide:clock', re: /\b(?:clock|time)\b/i },
  { id: 'map-pin', label: 'map', iconify: 'lucide:map-pin', re: /\b(?:map|location|pin)\b/i },
  { id: 'shield', label: 'shield', iconify: 'lucide:shield', re: /\bshield\b/i },
  { id: 'utensils', label: 'utensils', iconify: 'lucide:utensils', re: /\b(?:utensils|food|restaurant)\b/i },
];

export function parseNamedBrandLogos(brief: string): Array<{ id: string; label: string; iconify: string }> {
  const t = String(brief || '');
  if (!/\b(?:logo|logos|wordmark|brand\s*mark|company)\b/i.test(t) && !/\bsimple-icons:/i.test(t)) {
    // Still allow bare "Add Apple next to Discord" when framed as logos earlier in chat —
    // require logo/brand OR an explicit company list cue.
    if (!/\b(?:companies|brands|these)\b/i.test(t)) return [];
  }
  const out: Array<{ id: string; label: string; iconify: string }> = [];
  const seen = new Set<string>();
  for (const b of BRAND_LOGO_CATALOG) {
    if (!b.re.test(t) || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push({ id: b.id, label: b.label, iconify: b.iconify });
  }
  return out;
}

export function parseNamedUiIcons(brief: string): Array<{ id: string; label: string; iconify: string }> {
  const t = String(brief || '');
  const iconCue = /\b(?:icons?|toolbar|nav\s*icons?|profile|settings?|premium|professional)\b/i.test(t);
  if (!iconCue) return [];
  // Brand-logo asks should not also dump every UI icon whose word appears in brand names.
  if (/\b(?:logo|logos|wordmark)\b/i.test(t) && !/\bicons?\b/i.test(t)) return [];
  const out: Array<{ id: string; label: string; iconify: string }> = [];
  const seen = new Set<string>();
  for (const ic of UI_ICON_CATALOG) {
    if (!ic.re.test(t) || seen.has(ic.id)) continue;
    // Avoid treating "Apple" fruit asks etc. — catalog already scoped.
    seen.add(ic.id);
    out.push({ id: ic.id, label: ic.label, iconify: ic.iconify });
  }
  return out;
}

function logoIconifyFor(name: string, brief: string): string {
  const named = parseNamedBrandLogos(brief);
  // Only use a known brand mark when the user explicitly asked for that logo — never
  // stamp Apple/Discord icons onto every brief that merely mentions the word.
  if (named[0] && /\b(?:logo|logos|wordmark|brand\s+mark|simple-icons)\b/i.test(brief)) {
    return named[0].iconify;
  }
  if (/\b(?:logo|logos|wordmark)\b/i.test(brief) && named[0]) return named[0].iconify;
  const t = `${name}\n${brief}`;
  // Lending / reading products — never the generic hexagon mark (reads as a broken logo).
  if (/\b(?:borrow|lend(?:ing)?|bookshelf|library|quiet\s*shelf|reading\s+nook|checked\s*out)\b/i.test(t)) {
    return 'lucide:library';
  }
  if (/\b(?:book|journal|shelf|novel)\b/i.test(t) && /\b(?:app|phone|browse|tap)\b/i.test(t)) {
    return 'lucide:book-marked';
  }
  return 'lucide:sparkles';
}

/** Expand professional icon packs from NL (no link required). */
export function planIconsFromBrief(brief: string, projectName: string): Array<{ id: string; iconify: string; file: string }> {
  const t = `${projectName}\n${brief}`.toLowerCase();
  const named = parseNamedUiIcons(brief);
  if (named.length) {
    return named.map((ic) => ({
      id: ic.id,
      iconify: ic.iconify,
      file: `public/icons/${ic.id}.svg`,
    }));
  }
  const wantMore = /\b(?:professional icons?|icon set|nav icons?|toolbar icons?|add icons?|use icons?)\b/i.test(t)
    || /\b(?:icons?)\b/i.test(t);
  const lending = /\b(?:borrow|lend(?:ing)?|bookshelf|library|quiet\s*shelf|checked\s*out)\b/i.test(t);
  const base: Array<{ id: string; iconify: string; file: string }> = lending
    ? [
      { id: 'search', iconify: 'lucide:search', file: 'public/icons/search.svg' },
      { id: 'bag', iconify: 'lucide:bookmark', file: 'public/icons/bag.svg' },
    ]
    : [
      { id: 'search', iconify: 'lucide:search', file: 'public/icons/search.svg' },
      { id: 'bag', iconify: 'lucide:shopping-bag', file: 'public/icons/bag.svg' },
    ];
  if (!wantMore && !/\b(?:shop|store|cart|ecommerce|product)\b/i.test(t) && !lending) {
    return base;
  }
  const extra: Array<{ id: string; iconify: string; file: string }> = [
    { id: 'user', iconify: 'lucide:user', file: 'public/icons/user.svg' },
    { id: 'menu', iconify: 'lucide:menu', file: 'public/icons/menu.svg' },
  ];
  if (/\b(?:shop|store|cart|buy|ecommerce|product|gpu|cpu|monitor|camera|doorbell|purifier)\b/i.test(t)) {
    extra.push(
      { id: 'cart', iconify: 'lucide:shopping-cart', file: 'public/icons/cart.svg' },
      { id: 'heart', iconify: 'lucide:heart', file: 'public/icons/heart.svg' },
    );
  }
  if (/\b(?:restaurant|cafe|menu|food|fruit|grocery|supermarket)\b/i.test(t)) {
    extra.push(
      { id: 'utensils', iconify: 'lucide:utensils', file: 'public/icons/utensils.svg' },
      { id: 'clock', iconify: 'lucide:clock', file: 'public/icons/clock.svg' },
      { id: 'map', iconify: 'lucide:map-pin', file: 'public/icons/map-pin.svg' },
    );
  }
  if (/\b(?:security|camera|doorbell|smart\s*home)\b/i.test(t)) {
    extra.push(
      { id: 'shield', iconify: 'lucide:shield', file: 'public/icons/shield.svg' },
      { id: 'bell', iconify: 'lucide:bell', file: 'public/icons/bell.svg' },
    );
  }
  if (/\b(?:air\s*purifier|hvac|filter|clean\s*air)\b/i.test(t)) {
    extra.push(
      { id: 'wind', iconify: 'lucide:wind', file: 'public/icons/wind.svg' },
      { id: 'leaf', iconify: 'lucide:leaf', file: 'public/icons/leaf.svg' },
    );
  }
  const seen = new Set(base.map((b) => b.id));
  for (const e of extra) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    base.push(e);
  }
  return base.slice(0, 12);
}

function heroQueriesFor(name: string, t: string): Array<{ id: string; q: string }> {
  // Brief-only — no PC-case / Apple / bakery stock lookbooks.
  const id = createIdentityFromBrief(name, t);
  if (id.heroQueries.length) return id.heroQueries;
  const slug = String(name || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'brand';
  const blob = `${name} ${t}`.replace(/\s+/g, ' ').trim().slice(0, 160);
  return [
    { id: `${slug}-hero`, q: `${blob || name} unique original photograph editorial` },
    { id: `${slug}-story`, q: `${name} lifestyle editorial photography unique ${slug}` },
  ];
}

export function planBrandAssets(brief: string, projectName: string): BrandAssetPlan {
  const name = String(projectName || 'brand').trim() || 'brand';
  const t = String(brief || '');
  const explicit = extractExplicitAssetUrls(t);
  const iconifyIds = extractIconifyIds(t);
  const slots: BrandAssetSlot[] = [];

  const namedLogos = parseNamedBrandLogos(t);
  const logoFromIconify = iconifyIds.find((id) => /logo|apple|brand|hexagon|simple-icons/i.test(id)) || iconifyIds[0];
  const logoExplicit = explicit.find((u) => /logo|iconify|simple-icons|favicon|\.svg/i.test(u));
  const cinemaOnly = (
    /\b(?:cinematic|movie[- ]?like|film\s+still|atmospheric|premium\s+background|website[- ]?fit|editorial\s+background)\b/i.test(t)
    || (/\bbackground\b/i.test(t) && /\b(?:movie|film|cinema|orb|depth|website|premium|scroll|landing)\b/i.test(t))
  ) && !/\b(?:logo|icon|wordmark)\b/i.test(t);
  // Premium product / catalog landings use wordmark text — do not dump a shop icon-rail unless asked.
  const marketingLanding = /\b(?:landing|marketing\s+site|quiet\s+luxury|pc\s*case|product\s+marketing|scroll\s+to\s+reveal|wordmark|gaming\s+pc|product\s+(?:store|website|site|catalog)|online\s+store|shop\s+(?:site|page)|headphones?|earbuds?|laptops?|bakery|florist|watch(?:es)?)\b/i.test(t);
  const wantNavIcons = (
    /\b(?:add|put|place|include|with)\b[\s\S]{0,24}\b(?:icons?|toolbar|nav\s*icons?)\b/i.test(t)
    || /\b(?:professional|premium)\s+icons?\b/i.test(t)
  ) && !/\b(?:no|without|skip|never)\b[\s\S]{0,24}\bicons?\b|\bicon\s+clutter\b/i.test(t);

  if (!cinemaOnly && !(marketingLanding && !wantNavIcons)) {
    if (namedLogos.length) {
      for (const b of namedLogos) {
        const rel = `public/logos/${b.id}.svg`;
        slots.push({
          role: 'logo',
          id: b.id,
          rel,
          href: publicHref(rel),
          iconify: b.iconify,
          query: `${b.label} brand logo mark`,
        });
      }
    } else {
      slots.push({
        role: 'logo',
        id: 'logo',
        rel: 'public/logo.svg',
        href: publicHref('public/logo.svg'),
        iconify: logoFromIconify || logoIconifyFor(name, t),
        explicitUrl: logoExplicit && /\.svg|iconify|simple-icons/i.test(logoExplicit) ? logoExplicit : undefined,
        query: `${name} logo mark`,
      });
    }
  }

  const iconSpecs = (cinemaOnly || (marketingLanding && !wantNavIcons)) ? [] : planIconsFromBrief(t, name);
  // Prefer user-pasted Iconify ids for icon slots when present.
  const unusedIconify = iconifyIds.filter((id) => id !== logoFromIconify);
  iconSpecs.forEach((spec, i) => {
    const hit = explicit.find((u) => new RegExp(spec.id, 'i').test(u) && /iconify|lucide|\.svg/i.test(u));
    const fromText = unusedIconify[i];
    slots.push({
      role: 'icon',
      id: spec.id,
      rel: spec.file,
      href: publicHref(spec.file),
      iconify: fromText || spec.iconify,
      explicitUrl: hit,
    });
  });

  if (!looksLikeGame(t)) {
    const heroQueries = heroQueriesFor(name, t);
    const photoUrls = explicit.filter((u) =>
      /\.(?:png|jpe?g|webp)(?:$|\?)/i.test(u) || /unsplash|pexels|openverse|imgur|cloudinary/i.test(u),
    );
    const identity = createIdentityFromBrief(name, t);
    // Cinema Unsplash only when the brief itself asks for cinematic atmosphere — never a lookbook mood.
    const allowCinemaFallback = /\b(?:cinematic|movie|film|atmospheric)\b/i.test(t);
    const curatedCinema = allowCinemaFallback ? [
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=2400&q=90',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=90',
      'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=2400&q=90',
    ] : [];
    const cinemaHero = allowCinemaFallback && heroQueries.some((h) => /^cinema/i.test(h.id));
    const heroSlots = [...heroQueries];
    for (let i = heroQueries.length; i < photoUrls.length; i++) {
      heroSlots.push({ id: `${identity.slug}-user-${i + 1}`, q: heroQueries[0]?.q || `${name} product photography` });
    }
    heroSlots.forEach((h, i) => {
      const curated = cinemaHero && /^cinema/i.test(h.id) ? curatedCinema[i % curatedCinema.length] : undefined;
      slots.push({
        role: 'hero',
        id: h.id,
        rel: `public/heroes/${h.id}.jpg`,
        href: publicHref(`public/heroes/${h.id}.jpg`),
        query: h.q,
        explicitUrl: photoUrls[i] || curated,
      });
    });
  }

  return { projectName: name, slots };
}

export function formatBrandAssetsForPrompt(plan: BrandAssetPlan): string {
  if (!plan.slots.length) return '';
  const lines = [
    'BRAND ASSETS (NOVA fetches these into public/ — use the local paths; never hotlink Pollinations or scrape apple.com):',
    ...plan.slots.map((s) => {
      const src = s.explicitUrl ? `from ${s.explicitUrl}` : (s.iconify ? `Iconify ${s.iconify}` : `search “${s.query}”`);
      return `- ${s.role} ${s.id}: use src="${s.href}" (${src})`;
    }),
    'Put the logo in the nav as <img src="/logo.svg" alt="" /> — a sharp SVG, not generated pixels.',
    'Hero backgrounds: url("/heroes/....jpg") after files land. Unique CC photos or user uploads, not Pollinations.',
    'If the user pasted image/icon URLs or attached photos, those win over search.',
  ];
  return lines.join('\n');
}

function skipBanned(url: string): boolean {
  return BANNED_PHOTO_IDS.some((id) => url.includes(id));
}

/** Prefer local/cloud product gen (never Pollinations), then Openverse, then curated stock. */
async function resolveHeroSourceUrl(
  query: string,
  brief: string,
  projectName: string,
  seed: number,
): Promise<string> {
  const ctx = `${query} ${brief} ${projectName}`;
  const hardware = /\b(?:pc\s*case|computer\s*case|chassis|mid[\s-]?tower|full[\s-]?tower|gpu|graphics|keyboard|mouse|laptop|gaming\s+pc)\b/i.test(ctx);
  const promptCore = [
    enrichImagePrompt(query),
    'premium commercial product photography',
    'sharp focus, studio lighting, high detail, editorial quality',
    'no text overlay, no watermark, no collage, no logo brand mark',
  ];
  if (hardware) {
    promptCore.push(
      'subject is a real gaming PC computer case / mid-tower chassis only',
      'tempered glass panel, metal frame, cable-managed interior optional',
      'NOT an animal, NOT a cat, NOT a dog, NOT a pet, NOT a birdcage, NOT a crate, NOT a zoo enclosure',
    );
  }
  const prompt = promptCore.join(', ').slice(0, 380);

  // 1) Local image weights only — never bare engineGenerate (that cascades to Pollinations drift).
  try {
    const { listReadyLocalImageModels } = await import('@/lib/siteHeroImages');
    const ready = await listReadyLocalImageModels();
    if (ready[0]?.id) {
      const gen = await window.arkDesktop?.engineGenerate?.(prompt, ready[0].id, 'image');
      if (gen?.ok && gen.media?.dataUrl && !/pollinations/i.test(String(gen.source || gen.modelName || ''))) {
        return gen.media.dataUrl;
      }
    }
  } catch { /* fall through */ }

  // 2) Cloud image keys (HF / OpenAI) — still not Pollinations.
  try {
    const { cloudGenerateImage } = await import('@/lib/cloudMedia');
    const cloud = await cloudGenerateImage(prompt);
    if (cloud?.dataUrl) return cloud.dataUrl;
    if (cloud?.url && !/pollinations/i.test(cloud.url)) return cloud.url;
  } catch { /* fall through */ }

  // 3) Hardware product sites: curated REAL PC-case photos only (verified subjects — never Pollinations).
  if (hardware) {
    const curatedHardware = [
      // RGB interior (portrait-friendly for side media)
      'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?ixlib=rb-4.0.3&auto=format&fm=jpg&fit=crop&w=2400&q=90',
      // Gaming desk / tower exterior
      'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?ixlib=rb-4.0.3&auto=format&fm=jpg&fit=crop&w=2400&q=90',
    ];
    const idx = /\b(?:interior|tempered\s+glass|detail|story)\b/i.test(query) ? 1 : 0;
    return curatedHardware[idx] || curatedHardware[0];
  }

  // 4) Openverse / curated editorial for non-hardware
  return pickPhotoUrl(query, `${projectName} ${brief}`, seed);
}

function enrichImagePrompt(prompt: string): string {
  let p = String(prompt || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!p) p = 'premium commercial photography';
  if (!/\b(?:photo|photograph|photography|cinematic|studio|editorial)\b/i.test(p)) {
    p = `${p}, professional product photography, studio editorial`;
  }
  return p.slice(0, 320);
}

/** Openverse search only — never fall back to Pollinations for creates. */
async function pickPhotoUrl(query: string, fallbackContext: string, _seed: number): Promise<string> {
  const ctx = `${query} ${fallbackContext}`;
  const identity = createIdentityFromBrief(
    String(fallbackContext || '').split(/\s+/)[0] || 'brand',
    ctx,
  );
  const bakery = /\b(?:bakery|pastry|croissant|sourdough|bread|cake)\b/i.test(ctx);
  const florist = /\b(?:florist|bouquet|flower\s+shop|flowers?)\b/i.test(ctx);
  // food/kitchen/flower are valid for bakery/florist — only ban them for hardware/generic.
  const badTitle = bakery || florist
    ? /\b(?:specimen|scale\s*bar|diagram|chart|map|screenshot|meme|selfie|logo|icon|infographic|x[- ]?ray|microscop|forensic|radio|electronics|transistor|cassette)\b/i
    : /\b(?:specimen|scale\s*bar|diagram|chart|map|screenshot|meme|selfie|food|kitchen|tulip|flower|logo|icon|infographic|x[- ]?ray|microscop|forensic|archaeolog|insect|bird|dog|cat)\b/i;
  const hardware = /\b(?:pc\s*case|chassis|tower|gpu|keyboard|mouse|laptop|gaming)\b/i.test(ctx)
    && !bakery && !florist;
  const curatedCinema = [
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=2400&q=90',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=90',
    'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=2400&q=90',
  ];
  const curatedHardware = [
    'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?ixlib=rb-4.0.3&auto=format&fm=jpg&fit=crop&w=2400&q=90',
    'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?ixlib=rb-4.0.3&auto=format&fm=jpg&fit=crop&w=2400&q=90',
  ];
  const tries = hardware
    ? [query, 'gaming pc mid tower case', 'tempered glass pc case studio', 'computer chassis product photo']
    : bakery
      ? [query, 'bakery interior croissant display', 'sourdough bread bakery counter', 'pastry shop warm daylight']
      : florist
        ? [query, 'florist flower shop bouquet', 'fresh roses peonies bouquet', 'flower market soft pastel']
        : [query];
  for (const q of tries.filter(Boolean)) {
    try {
      const found = await window.arkDesktop?.brandSearchImages?.({ query: q, pageSize: 12 });
      const ranked = (found?.results || [])
        .filter((r) => {
          if (!r.url || skipBanned(r.url)) return false;
          if (/pollinations/i.test(r.url)) return false;
          const title = String((r as { title?: string }).title || '');
          if (title && badTitle.test(title)) return false;
          if (badTitle.test(r.url)) return false;
          if (hardware && /\b(?:cat|dog|kitten|puppy|pet|animal|bird|cage)\b/i.test(title)) return false;
          if (!heroResultMatchesCategory(identity, `${title} ${r.url}`)) return false;
          const w = Number(r.width) || 0;
          if (w > 0 && w < 900) return false;
          return /\.(?:jpe?g|png|webp)(?:$|\?)/i.test(r.url)
            || /upload\.wikimedia|images\.unsplash|pexels|flickr/i.test(r.url);
        })
        .sort((a, b) => (Number(b.width) || 1400) - (Number(a.width) || 1400));
      if (ranked[0]?.url) return ranked[0].url;
    } catch {
      /* try next */
    }
  }
  // Bakery/florist: never fall back to forest/ocean cinema stock — caller uses SVG.
  if (bakery || florist) return '';
  const pool = hardware ? curatedHardware : curatedCinema;
  const idx = Math.abs(_seed || 0) % pool.length;
  return pool[idx] || pool[0] || '';
}

export function wireBrandAssetsIntoSource(source: string, plan: BrandAssetPlan, filePath = ''): string {
  let s = String(source || '');
  if (!s) return s;
  const path = String(filePath || '');
  const isCss = /\.css$/i.test(path);
  const isJsx = /\.(?:jsx|tsx)$/i.test(path);
  // Heal CSS that was wrongly appended into App.tsx / App.jsx.
  if (isJsx || (!path && /export\s+default[\s\S]*\}\s*\n\s*\.[a-zA-Z]/i.test(s))) {
    s = s.replace(/\n\s*\.[a-zA-Z_-][\w-]*\s*\{[\s\S]*$/m, '').trimEnd();
    if (!/\n$/.test(s)) s += '\n';
  }
  const heroes = plan.slots.filter((x) => x.role === 'hero');
  const logo = plan.slots.find((x) => x.role === 'logo');
  const search = plan.slots.find((x) => x.id === 'search');
  const bag = plan.slots.find((x) => x.id === 'bag');
  const icons = plan.slots.filter((x) => x.role === 'icon');

  let heroIdx = 0;
  const fallbackHero = (() => {
    try {
      return createIdentityFromBrief(plan.projectName, '').heroHref;
    } catch {
      return `/heroes/${String(plan.projectName || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'brand'}-hero.jpg`;
    }
  })();
  const takeHero = () => {
    const slot = heroes[Math.min(heroIdx, Math.max(0, heroes.length - 1))];
    heroIdx += 1;
    return slot?.href || fallbackHero;
  };
  s = s.replace(/url\((['"]?)https:\/\/image\.pollinations\.ai\/[^)'"]+\1\)/gi, () => `url('${takeHero()}')`);
  s = s.replace(/src=(["'])https:\/\/image\.pollinations\.ai\/[^"']+\1/gi, (_m, q: string) => `src=${q}${takeHero()}${q}`);

  // Model often emits /heroes/1.jpg or src={`/heroes/${item.id}.jpg`} while Brand Assets
  // land as /heroes/quietshelf-hero.jpg — rewrite to real on-disk covers.
  if (heroes.length && isJsx) {
    const hrefs = heroes.map((h) => h.href).filter(Boolean);
    if (hrefs.length) {
      if (!/\bCOVER_HREFS\b/.test(s)) {
        const decl = `const COVER_HREFS = ${JSON.stringify(hrefs)};\n`;
        if (/^import\s.+$/m.test(s)) {
          s = s.replace(/(^import\s.+\n)+/m, (block) => `${block}${decl}`);
        } else {
          s = `${decl}${s}`;
        }
      }
      s = s.replace(
        /src=\{`\/heroes\/\$\{item\.id\}[^`]*`\}/g,
        'src={COVER_HREFS[(Math.max(0, Number(item.id) - 1)) % COVER_HREFS.length]}',
      );
      s = s.replace(
        /src=\{`\/heroes\/\$\{([^}]+)\}[^`]*`\}/g,
        'src={COVER_HREFS[(Math.max(0, Number($1) - 1)) % COVER_HREFS.length]}',
      );
      // Static numeric paths in data arrays / JSX.
      let ni = 0;
      s = s.replace(/(['"`])\/heroes\/\d+\.(?:jpe?g|png|webp)\1/gi, () => {
        const href = hrefs[ni % hrefs.length];
        ni += 1;
        return `'${href}'`;
      });
      s = s.replace(/\bsrc=(["'])\/heroes\/\d+\.(?:jpe?g|png|webp)\1/gi, (_m, q: string) => {
        const href = hrefs[ni % hrefs.length];
        ni += 1;
        return `src=${q}${href}${q}`;
      });
    }
  }

  for (const h of heroes) {
    if (h.explicitUrl && s.includes(h.explicitUrl)) s = s.split(h.explicitUrl).join(h.href);
    const idRe = h.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(
      new RegExp(`(<img[^>]*alt=["'][^"']*${idRe}[^"']*["'][^>]*\\bsrc=["'])[^"']+`, 'i'),
      `$1${h.href}`,
    );
    s = s.replace(
      new RegExp(`(<img[^>]*\\bsrc=["'])[^"']+([^>]*alt=["'][^"']*${idRe}[^"']*["'])`, 'i'),
      `$1${h.href}$2`,
    );
  }

  if (logo) {
    s = s.replace(
      /<div className=["']logo["']>\s*Apple\s*<\/div>/i,
      `<a className="logo" href="#top" aria-label="${plan.projectName}"><img src="${logo.href}" alt="" width="18" height="18" /></a>`,
    );
    s = s.replace(
      /(<div className=["']logo["'][^>]*>)([^<]*)(<\/div>)/i,
      (_m, a: string, inner: string, c: string) => {
        if (/<img/i.test(inner)) return `${a}${inner}${c}`;
        return `<a className="logo" href="#top" aria-label="${plan.projectName}"><img src="${logo.href}" alt="" width="18" height="18" /></a>`;
      },
    );
  }
  // Multi company logos → brand-rail (accumulate, never wipe cream).
  const brandLogos = plan.slots.filter((x) => x.role === 'logo' && x.id !== 'logo' && /\/logos\//.test(x.href));
  if (brandLogos.length && isJsx) {
    const missing = brandLogos.filter((b) => !s.includes(b.href));
    if (missing.length) {
      const imgs = missing
        .map((b) => `<img className="brand-mark" src="${b.href}" alt="${b.id}" width="28" height="28" />`)
        .join('');
      if (/className=["']brand-rail["']/i.test(s)) {
        s = s.replace(
          /(className=["']brand-rail["'][^>]*>)/i,
          `$1${imgs}`,
        );
      } else if (/className=["']app["'][^>]*>/i.test(s)) {
        s = s.replace(
          /(className=["']app["'][^>]*>)/i,
          `$1\n      <div className="brand-rail" aria-label="Brand logos">${imgs}</div>`,
        );
      }
    }
  }
  if (search) {
    s = s.replace(
      /<input type=["']text["'] placeholder=["']Search["']\s*\/>/i,
      `<span className="nav-tools"><img className="nav-icon" src="${search.href}" alt="" width="16" height="16" />`
      + `<input type="search" placeholder="Search" aria-label="Search" />`
      + (bag ? `<img className="nav-icon" src="${bag.href}" alt="" width="16" height="16" />` : '')
      + `</span>`,
    );
  }
  // Inject nav icons only into existing toolbars — never stamp a floating icon-rail onto .app
  // (that made every store look identical: search + heart floating on black).
  if (icons.length >= 1 && isJsx) {
    const missingIcons = icons.filter((ic) => !s.includes(ic.href));
    if (missingIcons.length) {
      const iconImgs = missingIcons
        .map((ic) => `<img className="nav-icon" src="${ic.href}" alt="${ic.id}" width="20" height="20" />`)
        .join('');
      if (/className=["']icon-rail["']/i.test(s)) {
        s = s.replace(/(className=["']icon-rail["'][^>]*>)/i, `$1${iconImgs}`);
      } else if (/className=["']nav-tools["']/i.test(s)) {
        s = s.replace(/(className=["']nav-tools["'][^>]*>)/i, `$1${iconImgs}`);
      } else if (missingIcons[0] && /corner-logo/i.test(s)) {
        const menu = missingIcons.find((ic) => /menu/i.test(ic.id)) || missingIcons[0];
        s = s.replace(
          /(className=["']corner-logo["'][\s\S]*?<\/a>)/i,
          `$1\n      <img className="nav-icon corner-icon" src="${menu.href}" alt="" width="20" height="20" />`,
        );
      }
      // Intentionally no .app fallback — stores should define their own chrome.
    }
  }
  if (heroes.length && isCss) {
    const stageIds = ['stage--a', 'stage--b', 'stage--c', 'stage-a', 'stage-b', 'stage-c'] as const;
    let wiredStages = false;
    stageIds.forEach((id, i) => {
      const heroI = Math.min(i % 3, heroes.length - 1);
      const href = heroes[heroI]?.href;
      if (!href) return;
      const re = new RegExp(
        `(\\.${id.replace(/--/g, '\\-\\-')}[^{]*\\.stage__image\\s*\\{[^}]*?url\\()['"]?[^'")]+['"]?(\\))`,
        'i',
      );
      if (re.test(s)) {
        s = s.replace(re, `$1'${href}'$2`);
        wiredStages = true;
      }
    });
    // Also wire plain .stage__image if only one hero.
    if (!wiredStages && /\.stage__image\b/.test(s) && heroes[0]) {
      s = s.replace(
        /(\.stage--a\s+\.stage__image\s*\{[^}]*?url\()['"]?[^'")]+['"]?(\))/i,
        `$1'${heroes[0].href}'$2`,
      );
      wiredStages = true;
    }
    if (!wiredStages) {
      if (/background-image:\s*url\(/i.test(s)) {
        s = s.replace(/background-image:\s*url\([^)]+\)/i, `background-image: url('${heroes[0].href}')`);
      } else if (/\.hero\b/.test(s) && !heroes.some((h) => s.includes(h.href))) {
        s = s.replace(
          /(\.hero\s*\{[^}]*background-color:\s*#000;)/,
          `$1\n  background-image: url('${heroes[0].href}');`,
        );
      } else if (/\.app\s*\{/i.test(s) && !/background-image:/i.test(s)) {
        s = s.replace(/(\.app\s*\{)/i, `$1\n  background-image: url('${heroes[0].href}');`);
      }
    }
  }
  // CSS rules belong only in .css files — never append into App.tsx.
  if (isCss && icons.length && !/\.nav-icon\b/.test(s)) {
    const light = /background\s*:\s*(?:#fef3c7|#fff(?:fff)?|#f[5-9a-f]{5}|cream|white)/i.test(s);
    if (light) {
      s += `\n.nav-tools { display:flex; align-items:center; gap:12px; }\n.nav-icon { display:block; opacity:.92; width:20px; height:20px; }\n.logo img { display:block; width:36px; height:36px; }\n.corner-icon{position:absolute;top:1.65rem;left:4.75rem;z-index:2}\n`;
    } else {
      s += `\n.nav-tools { display:flex; align-items:center; gap:10px; }\n.nav-icon { display:block; opacity:.9; filter: invert(1); }\n.logo img { display:block; filter: invert(1); }\n`;
    }
  }
  if (isCss && /background\s*:\s*(?:#fef3c7|#fff(?:fff)?|#f[5-9a-f]{5})/i.test(s)) {
    s = s.replace(/filter:\s*invert\(1\);?/gi, '');
  }
  return s;
}

export async function materializeBrandAssets(opts: {
  diskRoot: string;
  files: Record<string, string>;
  plan: BrandAssetPlan;
  brief: string;
  projectName: string;
}): Promise<{ files: Record<string, string>; saved: string[]; note: string }> {
  const saved: string[] = [];
  const files = { ...opts.files };
  const seed = heroSeedForProject(opts.projectName, 'brand');
  const lightCanvas = /background\s*:\s*(?:#fef3c7|#fff(?:fff)?|#f[5-9a-f]{5}|cream|white)/i.test(files['src/App.css'] || '')
    || /\bcream\b|\bwhite\b|\bpaper\b|\bwalnut\b|\bbeige\b|\breading\s+nook\b|\bsoft\s+paper\b/i.test(opts.brief || '');
  const ink = lightCanvas ? '#1a1a1a' : '#ffffff';

  const iconifyFallbacks = (id: string): string[] => {
    const m = String(id || '').match(/^([a-z0-9-]+):([a-z0-9-]+)$/i);
    if (!m) return [];
    const [, prefix, name] = m;
    const out: string[] = [];
    if (prefix === 'simple-icons') {
      out.push(`https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/${name}.svg`);
      out.push(`https://cdn.simpleicons.org/${name}`);
    }
    if (prefix === 'lucide') {
      out.push(`https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/${name}.svg`);
    }
    if (prefix === 'tabler') {
      out.push(`https://cdn.jsdelivr.net/npm/@tabler/icons@3.26.0/icons/outline/${name}.svg`);
    }
    if (prefix === 'heroicons') {
      out.push(`https://cdn.jsdelivr.net/npm/heroicons@2.2.0/24/outline/${name}.svg`);
    }
    return out;
  };

  const downloadSlot = async (slot: BrandAssetPlan['slots'][number]) => {
    const urls: string[] = [];
    if (slot.explicitUrl) urls.push(slot.explicitUrl);
    if (slot.iconify) {
      urls.push(iconifySvgUrl(slot.iconify, slot.role === 'logo' ? 64 : 24));
      urls.push(...iconifyFallbacks(slot.iconify));
    }
    if (!urls.length && slot.role === 'hero' && slot.query) {
      const identity = createIdentityFromBrief(opts.projectName, opts.brief);
      const generated = await resolveHeroSourceUrl(
        slot.query,
        opts.brief,
        opts.projectName,
        seed + saved.length,
      );
      if (generated) urls.push(generated);
      else urls.push(svgHeroDataUrl(identity));
    } else if (!urls.length && slot.query) {
      const photo = await pickPhotoUrl(slot.query, `${opts.projectName} ${slot.query}`, seed + saved.length);
      if (photo) urls.push(photo);
      else if (slot.role === 'hero') {
        urls.push(svgHeroDataUrl(createIdentityFromBrief(opts.projectName, opts.brief)));
      }
    }
    for (const url of urls) {
      // SVG data-URL heroes → write .svg directly (saveUrl expects base64 images).
      if (/^data:image\/svg\+xml/i.test(url)) {
        const raw = decodeURIComponent(url.replace(/^data:image\/svg\+xml[^,]*,/i, ''));
        const destRel = slot.rel.replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, '.svg');
        if (window.arkDesktop?.workspaceWriteFile) {
          const w = await window.arkDesktop.workspaceWriteFile({
            targetPath: joinDisk(opts.diskRoot, destRel),
            content: raw,
          });
          if (w?.ok !== false) {
            saved.push(destRel);
            const prevHref = slot.href;
            slot.rel = destRel;
            slot.href = publicHref(destRel);
            for (const key of Object.keys(files)) {
              if (!/\.(?:jsx|tsx|css|html)$/i.test(key)) continue;
              let next = files[key];
              if (prevHref && next.includes(prevHref)) next = next.split(prevHref).join(slot.href);
              next = next.replace(/\/heroes\/[^"')\s]+/gi, (m) => (m.includes(slot.id) ? slot.href : m));
              files[key] = next;
            }
            files[destRel] = raw;
            return;
          }
        }
        continue;
      }
      const result = await saveUrl(opts.diskRoot, slot.rel, url);
      if (!result.ok) continue;
      saved.push(result.rel);
      // Register presence for wire/Ready WITHOUT content that can be written back over the binary.
      // A previous marker string was applied via @@@FILE and wiped real JPGs to ~50 bytes.
      if (files[result.rel] == null) files[result.rel] = '';
      if (result.rel !== slot.rel) {
        const prevHref = slot.href;
        slot.rel = result.rel;
        slot.href = publicHref(result.rel);
        for (const key of Object.keys(files)) {
          if (!/\.(?:jsx|tsx|css|html)$/i.test(key)) continue;
          let next = files[key];
          if (prevHref && next.includes(prevHref)) next = next.split(prevHref).join(slot.href);
          next = next.replace(
            new RegExp(`/heroes/${slot.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\.(?:jpe?g|png|webp|gif)`, 'gi'),
            slot.href,
          );
          files[key] = next;
        }
        if (files[result.rel] == null) files[result.rel] = '';
      }
      if (result.text.includes('<svg')) {
        const tinted = tintIconSvg(result.text, ink);
        files[result.rel] = tinted;
        if (tinted !== result.text && window.arkDesktop?.workspaceWriteFile) {
          await window.arkDesktop.workspaceWriteFile({
            targetPath: joinDisk(opts.diskRoot, result.rel),
            content: tinted,
          });
        }
      }
      return;
    }
  };

  // Logos/icons in parallel; heroes sequential so image-model jobs don't stampede.
  const chromeSlots = opts.plan.slots.filter((s) => s.role === 'logo' || s.role === 'icon');
  const heroSlots = opts.plan.slots.filter((s) => s.role === 'hero');
  await Promise.all(chromeSlots.map((slot) => downloadSlot(slot)));
  for (const slot of heroSlots) {
    await downloadSlot(slot);
  }

  for (const key of Object.keys(files)) {
    if (!/\.(?:jsx|tsx|css|html)$/i.test(key)) continue;
    const next = wireBrandAssetsIntoSource(files[key], opts.plan, key);
    if (next !== files[key]) files[key] = next;
  }

  const extraCss = [
    '.logo img{display:block;width:36px;height:36px}',
    '.corner-logo img{display:block;width:40px;height:40px}',
    '.nav-tools{display:flex;align-items:center;gap:12px}',
    '.nav-icon{display:block;opacity:.92;width:20px;height:20px}',
    '.brand-rail{position:absolute;top:1.35rem;left:1.35rem;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:14px;max-width:min(92vw,720px)}',
    '.brand-mark{display:block;width:28px;height:28px;opacity:.95}',
    '.icon-rail{position:absolute;top:1.35rem;right:1.35rem;z-index:2;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:12px;max-width:min(92vw,520px)}',
  ].join('');
  const hasChromeSlots = opts.plan.slots.some((s) => s.role === 'logo' || s.role === 'icon');
  if (hasChromeSlots && files['src/App.css'] && !files['src/App.css'].includes('.brand-rail')) {
    let css = files['src/App.css'].trimEnd();
    files['src/App.css'] = `${css}\n${extraCss}\n`;
  } else if (hasChromeSlots && files['src/App.css'] && !files['src/App.css'].includes('.nav-tools')) {
    let css = files['src/App.css'].trimEnd();
    files['src/App.css'] = `${css}\n${extraCss}\n`;
  }
  // Prefer ink marks on cream/light canvases — strip forced invert filters.
  if (files['src/App.css'] && /background\s*:\s*(?:#fef3c7|#fff(?:fff)?|#f[5-9a-f]{5})/i.test(files['src/App.css'])) {
    files['src/App.css'] = files['src/App.css']
      .replace(/\.logo img\{[^}]*filter:\s*invert\(1\);?[^}]*\}/gi, '.logo img{display:block;width:36px;height:36px}')
      .replace(/\.nav-icon\{[^}]*filter:\s*invert\(1\);?[^}]*\}/gi, '.nav-icon{display:block;opacity:.92;width:20px;height:20px}')
      .replace(/filter:\s*invert\(1\);?/gi, '');
  }

  if (saved.length && window.arkDesktop?.workspaceWriteFile) {
    for (const rel of ['src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css']) {
      if (!files[rel]) continue;
      await window.arkDesktop.workspaceWriteFile({
        targetPath: joinDisk(opts.diskRoot, rel),
        content: files[rel],
      });
    }
  }

  const note = saved.length
    ? `Fetched ${saved.length} brand asset(s) from Iconify / Simple Icons / Lucide (local copies in public/).`
    : 'Brand assets: search/download missed — kept layout, will retry on edit.';
  return { files, saved, note };
}

export function looksLikeUseAttachedAsset(message: string): 'hero' | 'logo' | 'icon' | null {
  const t = String(message || '');
  const hasImg = /!\[[^\]]*]\((?:ark-media:|data:image\/)/i.test(t) || extractVisionImages(t).length > 0;
  if (!hasImg) return null;
  if (/\b(?:logo|favicon|wordmark|app\s*icon)\b/i.test(t)) return 'logo';
  if (/\b(?:nav\s*icon|toolbar\s*icon|search\s*icon)\b/i.test(t)) return 'icon';
  if (/\b(?:background|hero|banner|cover|wallpaper)\b/i.test(t)) return 'hero';
  if (/\b(?:use (?:this|these|them|it)|make (?:this|these) the|set (?:this|them|it) as|put (?:this|these)|replace (?:the )?(?:hero|background|logo)|for (?:the )?(?:site|page|website|app|build))\b/i.test(t)) {
    return /\blogo\b/i.test(t) ? 'logo' : 'hero';
  }
  if (/\b(?:photos?|images?|pictures?|pics?|screenshots?)\b/i.test(t) && /\b(?:as|for|into|on|use|add)\b/i.test(t)) {
    return 'hero';
  }
  // Attached images while building / editing a product → default hero.
  if (/\b(?:build|website|site|landing|page|app|project)\b/i.test(t)) return 'hero';
  // Bare attachments with little text — still treat as hero when bound to a workspace.
  if (t.replace(/!\[[^\]]*]\([^)]+\)/g, '').trim().length < 40) return 'hero';
  return null;
}

async function allAttachedDataUrls(message: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string | null | undefined) => {
    const v = String(u || '');
    if (!v.startsWith('data:image/') || seen.has(v.slice(0, 80))) return;
    seen.add(v.slice(0, 80));
    out.push(v);
  };
  for (const m of String(message || '').matchAll(/!\[[^\]]*]\((data:image\/[a-zA-Z0-9+.-]+;base64,[^)]+)\)/g)) {
    push(m[1]);
  }
  for (const img of extractVisionImages(message)) {
    push(`data:${img.mime};base64,${img.data}`);
  }
  for (const m of String(message || '').matchAll(/ark-media:([^)\s]+)/g)) {
    const id = m[1];
    const thumb = getMemoryThumb(id);
    if (thumb?.startsWith('data:image/')) {
      push(thumb);
      continue;
    }
    try {
      const got = await window.arkDesktop?.mediaGet?.(id);
      push(got?.item?.dataUrl);
    } catch {
      /* ignore */
    }
  }
  return out;
}

async function firstAttachedDataUrl(message: string): Promise<string | null> {
  const all = await allAttachedDataUrls(message);
  return all[0] || null;
}

function patchFilesForHero(files: Record<string, string>, href: string, role: BrandAssetRole): Record<string, string> {
  const next = { ...files };
  const patchCss = (css: string) => {
    let body = css;
    if (role === 'hero') {
      if (/\.hero\b/.test(body)) {
        if (/background-image:/i.test(body)) {
          body = body.replace(/background-image:\s*url\([^)]+\)/i, `background-image: url('${href}')`);
        } else {
          body = body.replace(/(\.hero\s*\{)/, `$1\n  background-image: url('${href}');`);
        }
      } else {
        body += `\n.app, body { background: #000 url('${href}') center/cover no-repeat fixed; }\n`;
      }
    }
    if (role === 'logo') {
      body += `\n.logo img { content: url('${href}'); }\n`;
    }
    return body;
  };
  if (next['src/App.css']) next['src/App.css'] = patchCss(next['src/App.css']);
  if (next['src/index.css']) next['src/index.css'] = patchCss(next['src/index.css']);
  const jsxKey = next['src/App.jsx'] ? 'src/App.jsx' : next['src/App.tsx'] ? 'src/App.tsx' : '';
  if (role === 'hero' && jsxKey) {
    let n = 0;
    next[jsxKey] = next[jsxKey].replace(
      /(<img[^>]*alt=["'][^"']*(?:iPhone|hero)[^"']*["'][^>]*\bsrc=["'])[^"']+/i,
      (_m, a: string) => { n += 1; return `${a}${href}`; },
    );
    if (!n) {
      next[jsxKey] = next[jsxKey].replace(
        /(<section[^>]*className=["'][^"']*hero[^"']*["'][\s\S]{0,400}?<img[^>]*\bsrc=["'])[^"']+/i,
        `$1${href}`,
      );
    }
    if (!next[jsxKey].includes(href)) {
      next[jsxKey] = next[jsxKey].replace(
        /(<img[^>]*\bsrc=["'])https?:\/\/[^"']+/,
        `$1${href}`,
      );
    }
  }
  if (role === 'logo' && jsxKey) {
    next[jsxKey] = next[jsxKey].replace(
      /<img([^>]*className=["'][^"']*logo[^"']*["'][^>]*)src=["'][^"']+["']/i,
      `<img$1src="${href}"`,
    );
    if (!next[jsxKey].includes(href)) {
      next[jsxKey] = next[jsxKey].replace(
        /className=["']logo["'][^>]*>[\s\S]*?<\/(?:div|a)>/i,
        `className="logo" href="#top"><img src="${href}" alt="" width="18" height="18" /></a`,
      );
    }
  }
  return next;
}

/** Save one or many chat-attached images into public/ and wire CSS/JSX. */
export async function applyAttachedChatImagesAsAssets(opts: {
  diskRoot: string;
  files: Record<string, string>;
  message: string;
}): Promise<{ ok: boolean; files: Record<string, string>; saved: string[]; role?: string; error?: string }> {
  const role = looksLikeUseAttachedAsset(opts.message) || 'hero';
  const dataUrls = await allAttachedDataUrls(opts.message);
  if (!dataUrls.length) return { ok: false, files: opts.files, saved: [], error: 'No image pixels on this message.' };
  if (!window.arkDesktop?.workspaceSaveAsset) {
    return { ok: false, files: opts.files, saved: [], error: 'Asset save unavailable' };
  }

  let files = { ...opts.files };
  for (const relFile of ['src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css']) {
    if (files[relFile] || !window.arkDesktop?.readTextFile) continue;
    try {
      const read = await window.arkDesktop.readTextFile({ path: joinDisk(opts.diskRoot, relFile) });
      if (read?.ok && typeof read.text === 'string') {
        files[relFile] = read.text;
      }
    } catch {
      /* missing */
    }
  }

  const saved: string[] = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const dataUrl = dataUrls[i];
    const ext = /image\/png/i.test(dataUrl) ? 'png' : /image\/webp/i.test(dataUrl) ? 'webp' : 'jpg';
    const rel = role === 'logo' && i === 0
      ? `public/logo-user.${ext}`
      : role === 'icon' && i === 0
        ? `public/icons/user.${ext}`
        : `public/heroes/user-hero${i === 0 ? '' : `-${i + 1}`}.${ext}`;
    const written = await window.arkDesktop.workspaceSaveAsset({
      targetPath: joinDisk(opts.diskRoot, rel),
      base64: dataUrl,
    });
    if (!written?.ok) continue;
    saved.push(rel);
    const href = publicHref(rel);
    // First image owns the primary hero/logo wire; later images replace next remote <img> srcs.
    if (i === 0) {
      files = patchFilesForHero(files, href, role);
    } else if (role === 'hero') {
      const jsxKey = files['src/App.jsx'] ? 'src/App.jsx' : files['src/App.tsx'] ? 'src/App.tsx' : '';
      if (jsxKey) {
        let swapped = 0;
        files[jsxKey] = files[jsxKey].replace(
          /(<img[^>]*\bsrc=["'])https?:\/\/[^"']+/gi,
          (m, a: string) => {
            if (swapped >= i) return m;
            swapped += 1;
            return `${a}${href}`;
          },
        );
      }
    }
  }

  if (!saved.length) {
    return { ok: false, files: opts.files, saved: [], error: 'Could not write the photo(s)' };
  }

  for (const relFile of ['src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css']) {
    if (!files[relFile] || !window.arkDesktop.workspaceWriteFile) continue;
    await window.arkDesktop.workspaceWriteFile({
      targetPath: joinDisk(opts.diskRoot, relFile),
      content: files[relFile],
    });
  }
  return { ok: true, files, saved, role };
}

/** Save a chat-attached image into public/ and point CSS/JSX at it. */
export async function applyAttachedChatImageAsAsset(opts: {
  diskRoot: string;
  files: Record<string, string>;
  message: string;
}): Promise<{ ok: boolean; files: Record<string, string>; rel?: string; role?: string; error?: string }> {
  const multi = await applyAttachedChatImagesAsAssets(opts);
  return {
    ok: multi.ok,
    files: multi.files,
    rel: multi.saved[0],
    role: multi.role,
    error: multi.error,
  };
}
