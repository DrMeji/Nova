/**
 * Create-time Brand Assets: fetch logos, UI icons, and unique CC photos,
 * save them into public/, and wire App.jsx/CSS to local paths.
 * Never scrape apple.com CDN. Never reuse banned Unsplash cafe IDs.
 * Pollinations is not used as a create fallback.
 */

import { extractVisionImages, getMemoryThumb } from '@/lib/recentStore';
import { heroSeedForProject } from '@/lib/siteHeroImages';
import {
  createIdentityFromBrief,
  detectHeroProductKind,
  heroResultMatchesCategory,
  svgHeroDataUrl,
} from '@/lib/createIdentity';
import { localIconifySvg } from '@/lib/localLucideIcons';
import { productDeskLogoSvg, productDeliveryLogoSvg } from '@/lib/createProductLadder';
import { briefLooksLikeInsulatedBottleShop } from '@/lib/createStorefrontFloor';

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
  // Recycled forest / field / ocean stills. They showed up as coffee, tea, and hot chocolate.
  '1441974231531',
  '1500530855697',
  '1518837695005',
  // Canned hardware stock that Freebuff flagged as always-the-same PC-case photos.
  '1597872200969',
  '1593640408182',
];

/** Map non-lucide Iconify ids → nearest bundled Lucide mark (offline-first). */
const ICONIFY_TO_LUCIDE: Record<string, string> = {
  'tabler:search': 'lucide:search',
  'tabler:shopping-cart': 'lucide:shopping-cart',
  'tabler:heart': 'lucide:heart',
  'tabler:user': 'lucide:user',
  'tabler:menu-2': 'lucide:menu',
  'tabler:menu': 'lucide:menu',
  'tabler:home': 'lucide:home',
  'tabler:settings': 'lucide:settings',
  'heroicons:magnifying-glass': 'lucide:search',
  'heroicons:shopping-bag': 'lucide:shopping-bag',
  'heroicons:heart': 'lucide:heart',
  'heroicons:user': 'lucide:user',
  'heroicons:bars-3': 'lucide:menu',
  'mdi:magnify': 'lucide:search',
  'mdi:cart': 'lucide:shopping-cart',
  'mdi:heart': 'lucide:heart',
  'mdi:account': 'lucide:user',
  'ph:magnifying-glass': 'lucide:search',
  'ph:shopping-cart': 'lucide:shopping-cart',
  'simple-icons:apple': 'lucide:sparkles',
};

/** Prefer bundled Lucide when a synonym exists. */
export function resolveLocalIconifyId(iconify: string): string {
  const raw = String(iconify || '').trim();
  if (!raw) return 'lucide:sparkles';
  if (/^lucide:/i.test(raw)) return raw.toLowerCase();
  const hit = ICONIFY_TO_LUCIDE[raw.toLowerCase()];
  return hit || raw;
}

const ICONIFY_COLLECTIONS = new Set([
  'lucide', 'simple-icons', 'mdi', 'tabler', 'ph', 'heroicons', 'ri', 'bi', 'carbon', 'ion',
]);

/** Electron bridge when present — unit smokes run without a window. */
function desktop(): Window['novaDesktop'] | undefined {
  return typeof window !== 'undefined' ? window.novaDesktop : undefined;
}

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
  if (!window.novaDesktop?.workspaceSaveAsset) return { ok: false, text: '', rel };
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
  const saved = await window.novaDesktop.workspaceSaveAsset({
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
  const t = String(brief || '');
  // Negations like "not a website landing page" must not count as marketing.
  const marketingHit = /\b(?:apple\.com|marketing\s+site|product\s+homepage)\b/i.test(t)
    || (/\b(?:homepage|landing(?:\s+page)?)\b/i.test(t)
      && !/\b(?:not\s+(?:a\s+)?(?:website\s+)?landing|not\s+(?:a\s+)?homepage|no\s+landing)\b/i.test(t)
      && !/\b(?:game|playable|arcade|canvas\s+game|paddle|bricks?)\b/i.test(t));
  if (marketingHit) return false;
  return /\b(?:game|playable|arcade|canvas\s+game|paddle|bricks?|wasd|three\.?js|webgl)\b/i.test(t);
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
  // Require icon cue — "hamburger menu on mobile" is nav layout, not a menu.svg rail.
  { id: 'menu', label: 'menu', iconify: 'lucide:menu', re: /\bmenu\s*icons?\b|\bicons?\b[\s\S]{0,28}\bmenu\b|\b(?:hamburger\s+)?menu\s+icon\b/i },
  // Require icon cue — "search box that filters" is an input, not search.svg rail.
  { id: 'search', label: 'search', iconify: 'lucide:search', re: /\b(?:search|magnifier|magnifying\s*glass)\s*icons?\b|\bicons?\b[\s\S]{0,28}\b(?:search|magnifier)\b|\bsearch\s+icon\b|\bmagnifying\s+glass\b/i },
  // Require icon cue — "profile card" / "Account dropdown" are UI chrome, not user.svg rails.
  { id: 'user', label: 'profile', iconify: 'lucide:user', re: /\b(?:profile|user|account)\s*icons?\b|\bicons?\b[\s\S]{0,28}\b(?:profile|user|account)\b|\buser\s+icon\b/i },
  // Require icon/gear cue — "settings page with toggles" is a page, not settings.svg.
  { id: 'settings', label: 'settings', iconify: 'lucide:settings', re: /\b(?:settings?|gear|cog)\s*icons?\b|\bicons?\b[\s\S]{0,28}\b(?:settings?|gear|cog)\b|\b(?:gear|cog)\b/i },
  // Require icon cue — "toast notifications" are banners, not a bell.svg rail.
  { id: 'bell', label: 'bell', iconify: 'lucide:bell', re: /\b(?:bell|notif(?:ication)?s?)\s*icons?\b|\bicons?\b[\s\S]{0,28}\b(?:bell|notif(?:ication)?s?)\b|\bbell\s+icon\b/i },
  // Avoid prose false hits: "like a …", bare "Edit the project", nav "Help" links.
  { id: 'heart', label: 'heart', iconify: 'lucide:heart', re: /\b(?:heart|favorite|wishlist|like\s+icon|likes?\s+button)\b/i },
  { id: 'cart', label: 'cart', iconify: 'lucide:shopping-cart', re: /\b(?:cart|shopping)\b/i },
  { id: 'bag', label: 'bag', iconify: 'lucide:shopping-bag', re: /\bbag\b/i },
  { id: 'play', label: 'play', iconify: 'lucide:play', re: /\b(?:play\s*button|play\s*icon)\b/i },
  { id: 'home', label: 'home', iconify: 'lucide:home', re: /\bhome\s+icon\b|\bicon[s]?\b[\s\S]{0,32}\bhome\b/i },
  // Require icon cue — "email line" / Contact footer / form fields must not spawn a mail rail.
  { id: 'mail', label: 'mail', iconify: 'lucide:mail', re: /\b(?:mail|email|inbox)\s*icons?\b|\bicons?\b[\s\S]{0,28}\b(?:mail|email|inbox)\b|\b(?:mail|email)\s+icon\b/i },
  { id: 'calendar', label: 'calendar', iconify: 'lucide:calendar', re: /\bcalendar\b/i },
  { id: 'camera', label: 'camera', iconify: 'lucide:camera', re: /\bcamera\b/i },
  { id: 'mic', label: 'mic', iconify: 'lucide:mic', re: /\b(?:mic|microphone)\b/i },
  { id: 'share', label: 'share', iconify: 'lucide:share-2', re: /\bshare\b/i },
  { id: 'download', label: 'download', iconify: 'lucide:download', re: /\bdownload\b/i },
  // Require icon cue — "file upload drop zone" is a control, not upload.svg.
  { id: 'upload', label: 'upload', iconify: 'lucide:upload', re: /\bupload\s*icons?\b|\bicons?\b[\s\S]{0,28}\bupload\b|\bupload\s+icon\b/i },
  // Require icon cue — bare "delete the Contact link" is nav surgery, not a trash toolbar icon.
  { id: 'trash', label: 'trash', iconify: 'lucide:trash-2', re: /\b(?:trash|bin)\s*icons?\b|\bicons?\b[\s\S]{0,28}\b(?:trash|delete|bin)\b|\bdelete\s+icon\b/i },
  { id: 'edit', label: 'edit', iconify: 'lucide:pencil', re: /\b(?:edit\s+icon|pencil(?:\s+icon)?)\b/i },
  { id: 'lock', label: 'lock', iconify: 'lucide:lock', re: /\b(?:lock|secure|security)\b/i },
  { id: 'star', label: 'star', iconify: 'lucide:star', re: /\bstar\b/i },
  { id: 'bookmark', label: 'bookmark', iconify: 'lucide:bookmark', re: /\bbookmark\b/i },
  { id: 'help', label: 'help', iconify: 'lucide:circle-help', re: /\b(?:help\s+icon|faq\s+icon)\b/i },
  { id: 'info', label: 'info', iconify: 'lucide:info', re: /\binfo\b/i },
  { id: 'filter', label: 'filter', iconify: 'lucide:list-filter', re: /\bfilter\b/i },
  // Require icon cue — "card grid" / "2-by-2 grid" are layout, not a grid toolbar icon.
  { id: 'grid', label: 'grid', iconify: 'lucide:layout-grid', re: /\b(?:grid|apps)\s*icons?\b|\bicons?\b[\s\S]{0,28}\b(?:grid|apps)\b|\b(?:layout[- ]?grid|apps)\s+icon\b/i },
  // Require icon cue — bare "more" / "for now" / "more professional" must never spawn an ellipsis rail.
  { id: 'more', label: 'more', iconify: 'lucide:ellipsis', re: /\b(?:more|ellipsis|overflow)\s*icons?\b|\bicons?\b[\s\S]{0,28}\b(?:more|ellipsis|overflow)\b/i },
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
  // Brand-logo-only asks should not dump every UI icon whose word appears in brand names.
  if (/\b(?:logo|logos|wordmark)\b/i.test(t) && !/\b(?:icons?|toolbar|nav|cart|search|bag|heart|menu|profile)\b/i.test(t)) {
    return [];
  }
  // Intent→icon: match nouns/verbs in the brief (no required "icon" cue).
  // "A nav with a magnifier and a cart" should still plan search + bag.
  const out: Array<{ id: string; label: string; iconify: string }> = [];
  const seen = new Set<string>();
  for (const ic of UI_ICON_CATALOG) {
    if (!ic.re.test(t) || seen.has(ic.id)) continue;
    seen.add(ic.id);
    out.push({ id: ic.id, label: ic.label, iconify: resolveLocalIconifyId(ic.iconify) });
  }
  return out;
}

/**
 * Product-family mark for the default logo slot (same families planIconsFromBrief uses for nav icons).
 * Ordered most-specific first so "doorbell camera shop" gets a shield, not a shopping bag.
 * All ids are bundled in localLucideIcons — no network needed.
 */
const LOGO_FAMILY_ICONS: Array<{ re: RegExp; iconify: string }> = [
  { re: /\b(?:borrow|lend(?:ing)?|bookshelf|library|quiet\s*shelf|reading\s+nook|checked\s*out)\b/i, iconify: 'lucide:library' },
  { re: /\b(?:security|doorbell|smart\s*home)\b/i, iconify: 'lucide:shield-check' },
  { re: /\b(?:air\s*purifier|hvac|clean\s*air)\b/i, iconify: 'lucide:wind' },
  // Insulated / hydration bottles BEFORE spirits wine + music — water flask ≠ wine glass ≠ note.
  {
    re: /\b(?:insulated|water\s+bottle|tumbler|hydration|flask|rambler|\d+\s*oz)\b|\b(?:bottle|bottles)\b[\s\S]{0,80}\b(?:cart|checkout|e-?commerce|storefront|add\s+to\s+cart)\b/i,
    iconify: 'lucide:shopping-bag',
  },
  // Food / beverage BEFORE notes — "tasting notes" must not steal matcha/tea brands.
  // Spirits before coffee so "gin · not coffee" never gets a mug mark.
  { re: /\b(?:gin|whisky|whiskey|vodka|tequila|bourbon|rum|spirit|distill|liquor|scotch|cognac|wine)\b/i, iconify: 'lucide:wine' },
  { re: /\b(?:matcha|green\s*tea|tea\s+brand|loose[- ]?leaf|steep|tin\s+hero|canister|brew(?:ing)?)\b/i, iconify: 'lucide:leaf' },
  { re: /\b(?:coffee|cafe|espresso|roasters?|roast(?:ery)?)\b/i, iconify: 'lucide:coffee' },
  { re: /\b(?:ceramic|pottery|porcelain|stoneware|tableware|kiln|dinnerware|clay)\b/i, iconify: 'lucide:utensils' },
  { re: /\b(?:restaurant|dining|menu|food|fruit|grocery|supermarket|bakery|kitchen)\b/i, iconify: 'lucide:utensils' },
  { re: /\b(?:lotion|skincare|serum|beauty|moisturizer|hand\s+cream|face\s+cream|body\s+cream)\b/i, iconify: 'lucide:sparkles' },
  { re: /\b(?:finance|budget|ledger|invoice|expense|banking|wallet)\b/i, iconify: 'lucide:wallet' },
  { re: /\b(?:gym|fitness|workout|hiit|yoga)\b/i, iconify: 'lucide:dumbbell' },
  // Food delivery BEFORE desk/game — never ship a desk mark on PlateRush-class briefs.
  { re: /\b(?:food\s+delivery|meal\s+delivery|delivery\s+(?:app|service|company))\b/i, iconify: 'nova:delivery' },
  // Desk / hardware BEFORE music/shop — custom desk mark (not gamepad).
  { re: /\b(?:gaming\s+desk|standing\s+desk|desk\s+brand|battlestation|rgb\s+edge|shop\s+the\s+desk)\b/i, iconify: 'nova:desk' },
  { re: /\b(?:game|arcade|puzzle|playable|gaming)\b/i, iconify: 'lucide:gamepad-2' },
  { re: /\b(?:music|playlist|podcast|album)\b/i, iconify: 'lucide:music' },
  { re: /\b(?:photo(?:graphy|grapher)?|gallery|portfolio|camera)\b/i, iconify: 'lucide:camera' },
  { re: /\b(?:chat|messag(?:e|ing)|inbox|community)\b/i, iconify: 'lucide:message-circle' },
  { re: /\b(?:weather|forecast)\b/i, iconify: 'lucide:cloud-sun' },
  { re: /\b(?:travel|trip|flight|itinerary)\b/i, iconify: 'lucide:plane' },
  { re: /\b(?:course|learn(?:ing)?|school|study|tutor|flash\s*cards?)\b/i, iconify: 'lucide:graduation-cap' },
  { re: /\b(?:calculator)\b/i, iconify: 'lucide:calculator' },
  { re: /\b(?:timer|stopwatch|pomodoro)\b/i, iconify: 'lucide:timer' },
  { re: /\b(?:todo|to-?do|checklist|tasks?)\b/i, iconify: 'lucide:list-checks' },
  { re: /\b(?:kanban|backlog|sprint)\b/i, iconify: 'lucide:kanban' },
  { re: /\b(?:dashboard|analytics|metrics)\b/i, iconify: 'lucide:layout-dashboard' },
  // Notes app only — not "tasting notes" / "steep guides".
  { re: /\b(?:notes?\s+app|notebook|journal(?:ing)?|diary|note[- ]?taking)\b/i, iconify: 'lucide:notebook-pen' },
  { re: /\b(?:booking|appointment|schedule|calendar|reservation)\b/i, iconify: 'lucide:calendar-days' },
  { re: /\b(?:garden|plants?|nursery|florist)\b/i, iconify: 'lucide:sprout' },
  { re: /\b(?:shop|store|cart|buy|ecommerce|e-commerce|product|catalog)\b/i, iconify: 'lucide:shopping-bag' },
];

/** Exported for smokes — product-family mark from brief (local Lucide only). */
export function logoIconifyFor(name: string, brief: string): string {
  const t = `${name}\n${brief}`;
  // Scrub negations first — "do not copy … Apple" / "not coffee" must not pick marks.
  const scrubbed = t
    .replace(/\bnot\s+coffee\b/gi, ' ')
    .replace(/\b(?:not|never|no|without|avoid)\s+(?:a\s+|an\s+)?(?:gin|coffee|tea|matcha)\b/gi, ' ')
    .replace(/\b(?:do\s+not|don't|dont|never)\s+copy\b[^.!?\n]{0,80}\bapple\b/gi, ' ')
    .replace(/\bor\s+apple\b/gi, ' ')
    .replace(/\b(?:not|never|no|without|avoid)\s+apple\b/gi, ' ');
  // Product family BEFORE named logos — "logo + wordmark" + "Apple" in a ceramic brief
  // used to stamp lucide:sparkles via simple-icons:apple and skip utensils forever.
  for (const fam of LOGO_FAMILY_ICONS) {
    if (fam.re.test(scrubbed)) return fam.iconify;
  }
  const named = parseNamedBrandLogos(scrubbed);
  // Only use a known brand mark when the user explicitly asked for that logo — never
  // stamp Apple/Discord icons onto every brief that merely mentions the word.
  if (named[0] && /\b(?:logo|logos|wordmark|brand\s+mark|simple-icons)\b/i.test(scrubbed)) {
    const id = resolveLocalIconifyId(named[0].iconify);
    if (id !== 'lucide:sparkles') return named[0].iconify;
  }
  // Lending / reading products — never the generic hexagon mark (reads as a broken logo).
  if (/\b(?:borrow|lend(?:ing)?|bookshelf|library|quiet\s*shelf|reading\s+nook|checked\s*out)\b/i.test(scrubbed)) {
    return 'lucide:library';
  }
  if (/\b(?:book|journal|shelf|novel)\b/i.test(scrubbed) && /\b(?:app|phone|browse|tap)\b/i.test(scrubbed)) {
    return 'lucide:book-marked';
  }
  // Name-only fallbacks when brief was stripped/empty at a late wire pass —
  // "Emberlot Roasters" / "Saltmere Gin" must not collapse to sparkles.
  if (/\b(?:gin|whisky|whiskey|vodka|tequila|bourbon|rum|spirit|distill)\b/i.test(name)) {
    return 'lucide:wine';
  }
  if (/\b(?:coffee|espresso|roaster|roast|cafe|café)\b/i.test(name)) {
    return 'lucide:coffee';
  }
  if (/\b(?:matcha|tea)\b/i.test(name)) return 'lucide:leaf';
  if (/\b(?:ceramic|pottery|kiln|tableware)\b/i.test(name)) return 'lucide:utensils';
  // Last resort only — a brief with no recognisable product family.
  return 'lucide:sparkles';
}

/**
 * Offline mark for public/logo.svg — what every marketing/brand create must ship.
 * Pure: logoIconifyFor(brief) → bundled Lucide → standalone SVG. Never network,
 * never a hero image standing in as the logo. Empty string only if nothing bundles.
 */
export function brandLogoSvgFor(opts: {
  productName?: string;
  brief?: string;
  css?: string;
}): string {
  const name = String(opts.productName || '').trim() || 'Brand';
  const brief = String(opts.brief || '');
  const css = String(opts.css || '');
  // Same ink rule as materializeBrandAssets — dark mark on cream, white mark on dark.
  const lightCanvas = /background\s*:\s*(?:#fef3c7|#fff(?:fff)?|#f[5-9a-f]{5})/i.test(css)
    || /\bcream\b|\bwhite\b|\bpaper\b|\bwalnut\b|\bbeige\b|\breading\s+nook\b|\bsoft\s+paper\b/i.test(brief);
  const ink = lightCanvas ? '#1a1a1a' : '#ffffff';
  const rawId = logoIconifyFor(name, brief);
  const deliveryBrief = /\b(?:food\s+delivery|meal\s+delivery|delivery\s+(?:app|service|company))\b/i
    .test(`${name}\n${brief}`)
    || (/\bdelivery\b/i.test(`${name}\n${brief}`) && /\b(?:food|meal|restaurant|order)\b/i.test(`${name}\n${brief}`));
  if (rawId === 'nova:delivery' || deliveryBrief) {
    return productDeliveryLogoSvg(ink);
  }
  const deskBrief = /\b(?:gaming\s+desk|standing\s+desk|shop\s+the\s+desk|battlestation|desk\s+brand)\b/i
    .test(`${name}\n${brief}`);
  // Desk mark is custom SVG — never a gamepad / music note / sparkles.
  if (rawId === 'nova:desk' || deskBrief) {
    return productDeskLogoSvg(ink);
  }
  // Insulated / hydration bottle shops — flask mark, never wine glass / music / gamepad.
  const insulatedShop = briefLooksLikeInsulatedBottleShop(name, brief);
  if (insulatedShop || rawId === 'lucide:shopping-bag') {
    const bag = localIconifySvg('lucide:shopping-bag', ink);
    if (bag && !/M9 18V5l12-2v13/i.test(bag)) return bag;
  }
  const id = resolveLocalIconifyId(rawId);
  let svg = localIconifySvg(id, ink) || '';
  // Never Accept music/gamepad marks on commerce storefronts.
  if (
    briefLooksLikeInsulatedBottleShop(name, brief)
    || /\b(?:cart|checkout|e-?commerce|storefront|add\s+to\s+cart)\b/i.test(`${name}\n${brief}`)
  ) {
    if (/M9 18V5l12-2v13/i.test(svg) || /M17\.32 5H6\.68/i.test(svg) || /M9\.937 15\.5/i.test(svg)) {
      svg = localIconifySvg(
        insulatedShop ? 'lucide:shopping-bag' : 'lucide:shopping-bag',
        ink,
      ) || svg;
    }
  }
  // F&B hard override — if family resolve somehow returns sparkles, still ship wine/mug/leaf.
  // Live gin runs logged "Logo lock: skipped mark=sparkles" while name still said Gin.
  // Insulated water bottles stay shopping-bag (not wine).
  if (!svg || /M9\.937 15\.5/i.test(svg)) {
    const kind = detectHeroProductKind(name, brief);
    const forcedId = insulatedShop ? 'lucide:shopping-bag'
      : kind === 'bottle' ? 'lucide:wine'
        : kind === 'coffee' ? 'lucide:coffee'
          : kind === 'tea' ? 'lucide:leaf'
            : kind === 'ceramic' ? 'lucide:utensils'
              : '';
    if (forcedId) svg = localIconifySvg(forcedId, ink) || svg;
  }
  return svg || localIconifySvg('lucide:sparkles', ink) || '';
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
    { id: `${slug}-hero`, q: `${blob || name} product studio photograph, no landscape, no forest, no ocean` },
    { id: `${slug}-story`, q: `${name} product detail studio photograph, different angle` },
    { id: `${slug}-detail`, q: `${name} close product color studio photograph` },
    { id: `${slug}-color`, q: `${name} second product studio photograph, distinct subject` },
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
    const heroSlots = [...heroQueries];
    for (let i = heroQueries.length; i < photoUrls.length; i++) {
      heroSlots.push({ id: `${identity.slug}-user-${i + 1}`, q: heroQueries[0]?.q || `${name} product photography` });
    }
    heroSlots.forEach((h, i) => {
      slots.push({
        role: 'hero',
        id: h.id,
        rel: `public/heroes/${h.id}.jpg`,
        href: publicHref(`public/heroes/${h.id}.jpg`),
        query: h.q,
        explicitUrl: photoUrls[i],
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

  const foodBrand = /\b(?:dried[- ]?dates?|medjool|deglet|fruit\s+brand|specialty[- ]food|dates?\b|olive|chocolate|honey)\b/i.test(ctx);
  const liquorBrand = /\b(?:liquor|spirits?|whiskey|whisky|bourbon|vodka|gin|tequila|rum|bottle\s+shop)\b/i.test(ctx);
  const foodPrompt = foodBrand
    ? [
      enrichImagePrompt(query),
      'real dried dates fruit food photography',
      'medjool or deglet noor dates, warm natural light, ceramic plate or bowl',
      'NOT electronics, NOT radio, NOT dial, NOT machine, NOT vacuum tube',
      'no text overlay, no watermark, no collage, no logo brand mark',
    ].join(', ').slice(0, 380)
    : liquorBrand
      ? [
        enrichImagePrompt(query),
        'premium whiskey or spirits bottle product photography',
        'amber glass bottle, dark bar wood, warm editorial light',
        'NOT electronics, NOT radio, NOT dial, NOT machine',
        'no text overlay, no watermark, no collage, no logo brand mark',
      ].join(', ').slice(0, 380)
      : prompt;

  // 1) Hugging Face FLUX when keyed (premium path — never Pollinations).
  try {
    const { cloudGenerateImage } = await import('@/lib/cloudMedia');
    const cloud = await cloudGenerateImage(foodPrompt);
    if (cloud?.dataUrl) return cloud.dataUrl;
    if (cloud?.url && !/pollinations/i.test(cloud.url)) return cloud.url;
  } catch { /* fall through */ }

  // 2) Local image weights when installed — skip for food/liquor (small models invent radios/machines).
  if (!foodBrand && !liquorBrand) {
    try {
      const { listReadyLocalImageModels } = await import('@/lib/siteHeroImages');
      const ready = await listReadyLocalImageModels();
      if (ready[0]?.id) {
        const gen = await window.novaDesktop?.engineGenerate?.(prompt, ready[0].id, 'image');
        if (gen?.ok && gen.media?.dataUrl && !/pollinations/i.test(String(gen.source || gen.modelName || ''))) {
          return gen.media.dataUrl;
        }
      }
    } catch { /* fall through */ }
  }

  // 3) Hardware: never return canned Unsplash stock — designed SVG / Openverse only.
  // (Previous hardcoded PC-case URLs made every hardware site look identical.)

  // 4) Openverse / editorial search (banned IDs stripped inside pickPhotoUrl)
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
  // Dates / fruit / specialty food / liquor — ALLOW food titles; ban radio/electronics reuse.
  const foodBrand = /\b(?:dried[- ]?dates?|medjool|deglet|fruit\s+brand|specialty[- ]food|food\s+brand|dates?\b|olive\s+oil|chocolate|honey)\b/i.test(ctx)
    || (/\b(?:fruit|dates?)\b/i.test(ctx) && /\b(?:brand|shop|store|varieties|harvest)\b/i.test(ctx));
  const liquorBrand = /\b(?:liquor|spirits?|whiskey|whisky|bourbon|vodka|gin|tequila|rum|bottle\s+shop|wine\s+shop)\b/i.test(ctx);
  const edible = bakery || florist || foodBrand || liquorBrand;
  // food/kitchen/flower are valid for bakery/florist/food — only ban them for hardware/generic.
  const badTitle = edible
    ? /\b(?:specimen|scale\s*bar|diagram|chart|map|screenshot|meme|selfie|logo|icon|infographic|x[- ]?ray|microscop|forensic|radio|electronics|transistor|cassette|vacuum\s*tube|dial|gauge|oscilloscope|circuit|motherboard)\b/i
    : /\b(?:specimen|scale\s*bar|diagram|chart|map|screenshot|meme|selfie|food|kitchen|tulip|flower|logo|icon|infographic|x[- ]?ray|microscop|forensic|archaeolog|insect|bird|dog|cat|radio|electronics|cassette)\b/i;
  const hardware = /\b(?:pc\s*case|chassis|tower|gpu|keyboard|mouse|laptop|gaming)\b/i.test(ctx)
    && !edible;
  const seed = Math.abs(_seed || 0);
  const tries = hardware
    ? [query, 'gaming pc mid tower case', 'tempered glass pc case studio', 'computer chassis product photo']
    : bakery
      ? [query, 'bakery interior croissant display', 'sourdough bread bakery counter', 'pastry shop warm daylight']
      : florist
        ? [query, 'florist flower shop bouquet', 'fresh roses peonies bouquet', 'flower market soft pastel']
        : foodBrand
          ? [
            query,
            'medjool dates fruit bowl warm daylight food photography',
            'dried dates palm fruit close up editorial',
            'deglet noor dates on ceramic plate studio',
            'desert date fruit harvest basket',
          ]
          : liquorBrand
            ? [
              query,
              'whiskey bottle amber glass bar photography',
              'bourbon bottle dark wood editorial',
              'spirits bottle shop shelf warm light',
              'gin bottle citrus garnish studio',
            ]
            : [query];
  const seenUrls = new Set<string>();
  for (const q of tries.filter(Boolean)) {
    try {
      const found = await window.novaDesktop?.brandSearchImages?.({ query: q, pageSize: 12 });
      const ranked = (found?.results || [])
        .filter((r) => {
          if (!r.url || skipBanned(r.url)) return false;
          if (/pollinations/i.test(r.url)) return false;
          if (seenUrls.has(r.url)) return false;
          const title = String((r as { title?: string }).title || '');
          if (title && badTitle.test(title)) return false;
          if (badTitle.test(r.url)) return false;
          if (hardware && /\b(?:cat|dog|kitten|puppy|pet|animal|bird|cage)\b/i.test(title)) return false;
          if (foodBrand && /\b(?:radio|electronics|circuit|vacuum|cassette|dial)\b/i.test(title)) return false;
          if (!heroResultMatchesCategory(identity, `${title} ${r.url}`)) return false;
          const w = Number(r.width) || 0;
          if (w > 0 && w < 900) return false;
          return /\.(?:jpe?g|png|webp)(?:$|\?)/i.test(r.url)
            || /upload\.wikimedia|images\.unsplash|pexels|flickr/i.test(r.url);
        })
        .sort((a, b) => (Number(b.width) || 1400) - (Number(a.width) || 1400));
      const pick = ranked[seed % Math.max(1, ranked.length)] || ranked[0];
      if (pick?.url) {
        seenUrls.add(pick.url);
        return pick.url;
      }
    } catch {
      /* try next */
    }
  }
  // No canned Unsplash / forest / ocean stock. Miss → empty so caller uses designed SVG hero.
  void hardware;
  void edible;
  return '';
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
      // Only rewrite path/http backgrounds — never data-URI grain/noise (`)` inside
      // `url(%23n)` used to truncate and leave `url('/heroes/…')'/%3E%3C/svg%3E")` junk).
      if (/background-image:\s*url\(\s*(['"]?)(?:https?:|\/)[^)'"]+\1\s*\)/i.test(s)) {
        s = s.replace(
          /background-image:\s*url\(\s*(['"]?)(?:https?:|\/)[^)'"]+\1\s*\)/i,
          `background-image: url('${heroes[0].href}')`,
        );
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
  const usedHeroUrls = new Set<string>();
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

  let localInstalled = 0;
  /** Disk-first: bundled Lucide SVG (no network). Returns true when the slot file is written. */
  const installLocalIcon = async (slot: BrandAssetPlan['slots'][number]): Promise<boolean> => {
    if (!slot.iconify || slot.role === 'hero') return false;
    // Brand mark: always prefer offline family SVG (gin→wine, coffee→mug) over a
    // stale sparkles iconify id left in the plan from an earlier pass.
    let svg = '';
    if (slot.role === 'logo' && /(^|\/)public\/logo\.svg$/i.test(slot.rel.replace(/\\/g, '/'))) {
      svg = brandLogoSvgFor({
        productName: opts.projectName,
        brief: opts.brief,
        css: String(files['src/App.css'] || ''),
      });
    }
    if (!svg) {
      const localId = resolveLocalIconifyId(slot.iconify);
      svg = localIconifySvg(localId, ink) || localIconifySvg(slot.iconify, ink) || '';
    }
    if (!svg) return false;
    // Never materialize sparkles when the brief resolves to a family mark.
    if (slot.role === 'logo' && /M9\.937 15\.5/i.test(svg)) {
      const family = brandLogoSvgFor({
        productName: opts.projectName,
        brief: opts.brief,
        css: String(files['src/App.css'] || ''),
      });
      if (family && !/M9\.937 15\.5/i.test(family)) svg = family;
      else return false;
    }
    const bridge = desktop();
    if (bridge?.workspaceWriteFile) {
      const w = await bridge.workspaceWriteFile({
        targetPath: joinDisk(opts.diskRoot, slot.rel),
        content: svg,
      });
      if (w?.ok === false) return false;
    }
    files[slot.rel] = svg;
    saved.push(slot.rel);
    localInstalled += 1;
    return true;
  };

  const downloadSlot = async (slot: BrandAssetPlan['slots'][number]) => {
    const urls: string[] = [];
    // User-pasted URL wins; otherwise bundled Lucide runs before any Iconify HTTP.
    if (slot.explicitUrl) urls.push(slot.explicitUrl);
    const httpIconify: string[] = [];
    if (slot.iconify) {
      httpIconify.push(iconifySvgUrl(slot.iconify, slot.role === 'logo' ? 64 : 24));
      httpIconify.push(...iconifyFallbacks(slot.iconify));
      urls.push(...httpIconify);
    }
    let localTried = !slot.iconify;
    if (!urls.length && slot.role === 'hero' && slot.query) {
      const identity = createIdentityFromBrief(opts.projectName, opts.brief);
      let attempts = 0;
      while (attempts < 4) {
        const generated = await resolveHeroSourceUrl(
          slot.query,
          opts.brief,
          opts.projectName,
          seed + saved.length + attempts * 17,
        );
        attempts += 1;
        if (!generated || usedHeroUrls.has(generated)) continue;
        urls.push(generated);
        break;
      }
      // Pass product name — never the photo query ("… product photography …"),
      // which used to trip the Apple phone stage via a "product" substring.
      if (!urls.length) urls.push(svgHeroDataUrl(identity, opts.projectName || identity.name));
    } else if (!urls.length && slot.query) {
      const photo = await pickPhotoUrl(slot.query, `${opts.projectName} ${slot.query}`, seed + saved.length);
      if (photo && !usedHeroUrls.has(photo)) urls.push(photo);
      else if (slot.role === 'hero') {
        const ident = createIdentityFromBrief(opts.projectName, opts.brief);
        urls.push(svgHeroDataUrl(ident, opts.projectName || ident.name));
      }
    }
    for (const url of urls) {
      if (!localTried && httpIconify.includes(url)) {
        localTried = true;
        if (await installLocalIcon(slot)) return;
      }
      if (slot.role === 'hero' && usedHeroUrls.has(url) && !/^data:image\/svg\+xml/i.test(url)) continue;
      // SVG data-URL heroes → write .svg directly (saveUrl expects base64 images).
      if (/^data:image\/svg\+xml/i.test(url)) {
        const raw = decodeURIComponent(url.replace(/^data:image\/svg\+xml[^,]*,/i, ''));
        const destRel = slot.rel.replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, '.svg');
        if (window.novaDesktop?.workspaceWriteFile) {
          const w = await window.novaDesktop.workspaceWriteFile({
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
      if (slot.role === 'hero') usedHeroUrls.add(url);
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
        if (tinted !== result.text && window.novaDesktop?.workspaceWriteFile) {
          await window.novaDesktop.workspaceWriteFile({
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

  const appSrc = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const usesAbsoluteRail = /\b(?:icon|brand)-rail\b/i.test(appSrc);
  const extraCss = [
    '.logo img{display:block;width:36px;height:36px}',
    '.corner-logo img{display:block;width:40px;height:40px}',
    '.nav-tools{display:flex;align-items:center;gap:12px}',
    '.nav-icon{display:block;opacity:.92;width:20px;height:20px}',
    ...(usesAbsoluteRail
      ? [
          '.brand-rail{position:absolute;top:1.35rem;left:1.35rem;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:14px;max-width:min(92vw,720px)}',
          '.brand-mark{display:block;width:28px;height:28px;opacity:.95}',
          '.icon-rail{position:absolute;top:1.35rem;right:1.35rem;z-index:2;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:12px;max-width:min(92vw,520px)}',
        ]
      : []),
  ].join('');
  const hasChromeSlots = opts.plan.slots.some((s) => s.role === 'logo' || s.role === 'icon');
  if (hasChromeSlots && files['src/App.css'] && usesAbsoluteRail && !files['src/App.css'].includes('.brand-rail')) {
    const css = files['src/App.css'].trimEnd();
    files['src/App.css'] = `${css}\n${extraCss}\n`;
  } else if (hasChromeSlots && files['src/App.css'] && !files['src/App.css'].includes('.nav-tools')) {
    const css = files['src/App.css'].trimEnd();
    files['src/App.css'] = `${css}\n${extraCss}\n`;
  }
  // Prefer ink marks on cream/light canvases — strip forced invert filters.
  if (files['src/App.css'] && /background\s*:\s*(?:#fef3c7|#fff(?:fff)?|#f[5-9a-f]{5})/i.test(files['src/App.css'])) {
    files['src/App.css'] = files['src/App.css']
      .replace(/\.logo img\{[^}]*filter:\s*invert\(1\);?[^}]*\}/gi, '.logo img{display:block;width:36px;height:36px}')
      .replace(/\.nav-icon\{[^}]*filter:\s*invert\(1\);?[^}]*\}/gi, '.nav-icon{display:block;opacity:.92;width:20px;height:20px}')
      .replace(/filter:\s*invert\(1\);?/gi, '');
  }

  const writeBridge = desktop();
  if (saved.length && writeBridge?.workspaceWriteFile) {
    for (const rel of ['src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css']) {
      if (!files[rel]) continue;
      await writeBridge.workspaceWriteFile({
        targetPath: joinDisk(opts.diskRoot, rel),
        content: files[rel],
      });
    }
  }

  const note = saved.length
    ? `Installed ${saved.length} brand asset(s) in public/ (${localInstalled} from bundled Lucide, ${saved.length - localInstalled} fetched).`
    : 'Brand assets: search/download missed — kept layout, will retry on edit.';
  return { files, saved, note };
}

export function looksLikeUseAttachedAsset(message: string): 'hero' | 'logo' | 'icon' | null {
  const t = String(message || '');
  const hasImg = /!\[[^\]]*]\((?:nova-media:|data:image\/)/i.test(t) || extractVisionImages(t).length > 0;
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
  for (const m of String(message || '').matchAll(/nova-media:([^)\s]+)/g)) {
    const id = m[1];
    const thumb = getMemoryThumb(id);
    if (thumb?.startsWith('data:image/')) {
      push(thumb);
      continue;
    }
    try {
      const got = await window.novaDesktop?.mediaGet?.(id);
      push(got?.item?.dataUrl);
    } catch {
      /* ignore */
    }
  }
  return out;
}



function patchFilesForHero(files: Record<string, string>, href: string, role: BrandAssetRole): Record<string, string> {
  const next = { ...files };
  const patchCss = (css: string) => {
    let body = css;
    if (role === 'hero') {
      if (/\.hero\b/.test(body)) {
        if (/background-image:\s*url\(\s*(['"]?)(?:https?:|\/)[^)'"]+\1\s*\)/i.test(body)) {
          body = body.replace(
            /background-image:\s*url\(\s*(['"]?)(?:https?:|\/)[^)'"]+\1\s*\)/i,
            `background-image: url('${href}')`,
          );
        } else if (!/background-image:/i.test(body)) {
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
  if (!window.novaDesktop?.workspaceSaveAsset) {
    return { ok: false, files: opts.files, saved: [], error: 'Asset save unavailable' };
  }

  let files = { ...opts.files };
  for (const relFile of ['src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css']) {
    if (files[relFile] || !window.novaDesktop?.readTextFile) continue;
    try {
      const read = await window.novaDesktop.readTextFile({ path: joinDisk(opts.diskRoot, relFile) });
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
    const written = await window.novaDesktop.workspaceSaveAsset({
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
    if (!files[relFile] || !window.novaDesktop.workspaceWriteFile) continue;
    await window.novaDesktop.workspaceWriteFile({
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
