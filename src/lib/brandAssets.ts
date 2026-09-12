/**
 * Create-time Brand Assets: fetch logos, UI icons, and unique CC photos,
 * save them into public/, and wire App.jsx/CSS to local paths.
 * Never scrape apple.com CDN. Never reuse banned Unsplash cafe IDs.
 * Pollinations is not used as a create fallback.
 */

import { extractVisionImages, getMemoryThumb } from '@/lib/recentStore';
import { heroSeedForProject } from '@/lib/siteHeroImages';

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
  return `https://api.iconify.design/${encodeURIComponent(id)}.svg?height=${height}`;
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

function logoIconifyFor(name: string, brief: string): string {
  const t = `${name}\n${brief}`.toLowerCase();
  if (/\bapple\.com\b/.test(t) || (/\b(?:iphone|macbook|airpods)\b/.test(t) && /\breplica|lookalike|clone\b/.test(t))) {
    return 'simple-icons:apple';
  }
  if (/\bnetflix\b/.test(t)) return 'simple-icons:netflix';
  if (/\bspotify\b/.test(t)) return 'simple-icons:spotify';
  if (/\b(?:air\s*purifier|hvac|filter)\b/.test(t)) return 'lucide:wind';
  if (/\b(?:gpu|graphics|nvidia|radeon)\b/.test(t)) return 'lucide:cpu';
  if (/\b(?:camera|doorbell|security)\b/.test(t)) return 'lucide:camera';
  if (/\b(?:fruit|grocery|supermarket|market)\b/.test(t)) return 'lucide:apple';
  return 'lucide:hexagon';
}

/** Expand professional icon packs from NL (no link required). */
export function planIconsFromBrief(brief: string, projectName: string): Array<{ id: string; iconify: string; file: string }> {
  const t = `${projectName}\n${brief}`.toLowerCase();
  const wantMore = /\b(?:professional icons?|icon set|nav icons?|toolbar icons?|add icons?|use icons?)\b/i.test(t)
    || /\b(?:icons?)\b/i.test(t);
  const base: Array<{ id: string; iconify: string; file: string }> = [
    { id: 'search', iconify: 'lucide:search', file: 'public/icons/search.svg' },
    { id: 'bag', iconify: 'lucide:shopping-bag', file: 'public/icons/bag.svg' },
  ];
  if (!wantMore && !/\b(?:shop|store|cart|ecommerce|product)\b/i.test(t)) {
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
  return base.slice(0, 8);
}

function heroQueriesFor(name: string, t: string): Array<{ id: string; q: string }> {
  if (/\bapple\.com\b/i.test(`${name} ${t}`)) {
    return [
      { id: 'iphone', q: 'smartphone product photography studio white background editorial' },
      { id: 'macbook', q: 'laptop computer on desk product photography editorial sharp' },
      { id: 'watch', q: 'wristwatch close up product photography studio editorial' },
      { id: 'airpods', q: 'wireless earbuds charging case product photography studio' },
    ];
  }
  if (/\b(?:air\s*purifier|purifier)\b/i.test(t)) {
    return [
      { id: 'hero', q: 'modern air purifier product photography studio clean white editorial' },
      { id: 'story', q: 'bright modern living room interior soft daylight editorial photography' },
    ];
  }
  if (/\b(?:gpu|graphics card|rtx|radeon)\b/i.test(t)) {
    return [
      { id: 'hero', q: 'gaming graphics card product photography rgb studio editorial' },
      { id: 'story', q: 'modern gaming desk setup monitor keyboard editorial photography' },
    ];
  }
  if (/\b(?:fruit|grocery|supermarket|produce)\b/i.test(t)) {
    return [
      { id: 'hero', q: 'fresh colorful fruit market produce display editorial photography' },
      { id: 'story', q: 'fresh apples oranges berries close up food photography editorial' },
    ];
  }
  if (/\b(?:doorbell|security camera|smart camera)\b/i.test(t)) {
    return [
      { id: 'hero', q: 'modern smart doorbell on house porch product photography editorial' },
      { id: 'story', q: 'modern home exterior front door daylight editorial photography' },
    ];
  }
  return [
    { id: 'hero', q: `${name} premium product photography editorial unique ${heroSeedForProject(name, 'hero')}` },
    { id: 'story', q: `${name} lifestyle interior photography editorial unique ${heroSeedForProject(name, 'story')}` },
  ];
}

export function planBrandAssets(brief: string, projectName: string): BrandAssetPlan {
  const name = String(projectName || 'brand').trim() || 'brand';
  const t = String(brief || '');
  const explicit = extractExplicitAssetUrls(t);
  const iconifyIds = extractIconifyIds(t);
  const slots: BrandAssetSlot[] = [];

  const logoFromIconify = iconifyIds.find((id) => /logo|apple|brand|hexagon/i.test(id)) || iconifyIds[0];
  const logoExplicit = explicit.find((u) => /logo|iconify|simple-icons|favicon|\.svg/i.test(u));
  slots.push({
    role: 'logo',
    id: 'logo',
    rel: 'public/logo.svg',
    href: publicHref('public/logo.svg'),
    iconify: logoFromIconify || logoIconifyFor(name, t),
    explicitUrl: logoExplicit && /\.svg|iconify|simple-icons/i.test(logoExplicit) ? logoExplicit : undefined,
    query: `${name} logo mark`,
  });

  const iconSpecs = planIconsFromBrief(t, name);
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
    // Extra pasted photos → extra hero slots so "use these images" can land all of them.
    const heroSlots = [...heroQueries];
    for (let i = heroQueries.length; i < photoUrls.length; i++) {
      heroSlots.push({ id: `user-${i + 1}`, q: `${name} product photography editorial` });
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

/** Openverse search only — never fall back to Pollinations for creates. */
async function pickPhotoUrl(query: string, _fallbackPrompt: string, _seed: number): Promise<string> {
  const tries = [
    query,
    `${query} photography`,
    query.replace(/\bunique\b|\beditorial\b/gi, '').trim(),
  ].filter(Boolean);
  for (const q of tries) {
    try {
      const found = await window.arkDesktop?.brandSearchImages?.({ query: q, pageSize: 8 });
      const hit = (found?.results || []).find((r) => r.url && !skipBanned(r.url) && (r.width || 1200) >= 800);
      if (hit?.url) return hit.url;
    } catch {
      /* try next */
    }
  }
  return '';
}

async function saveUrl(diskRoot: string, rel: string, url: string): Promise<boolean> {
  if (!window.arkDesktop?.workspaceSaveAsset) return false;
  const saved = await window.arkDesktop.workspaceSaveAsset({
    targetPath: joinDisk(diskRoot, rel),
    url,
    timeoutMs: 45000,
  });
  return Boolean(saved?.ok);
}

export function wireBrandAssetsIntoSource(source: string, plan: BrandAssetPlan): string {
  let s = String(source || '');
  if (!s) return s;
  const heroes = plan.slots.filter((x) => x.role === 'hero');
  const logo = plan.slots.find((x) => x.role === 'logo');
  const search = plan.slots.find((x) => x.id === 'search');
  const bag = plan.slots.find((x) => x.id === 'bag');
  const icons = plan.slots.filter((x) => x.role === 'icon');

  let heroIdx = 0;
  const takeHero = () => {
    const slot = heroes[Math.min(heroIdx, Math.max(0, heroes.length - 1))];
    heroIdx += 1;
    return slot?.href || '/heroes/hero.jpg';
  };
  s = s.replace(/url\((['"]?)https:\/\/image\.pollinations\.ai\/[^)'"]+\1\)/gi, () => `url('${takeHero()}')`);
  s = s.replace(/src=(["'])https:\/\/image\.pollinations\.ai\/[^"']+\1/gi, (_m, q: string) => `src=${q}${takeHero()}${q}`);
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
  if (search) {
    s = s.replace(
      /<input type=["']text["'] placeholder=["']Search["']\s*\/>/i,
      `<span className="nav-tools"><img className="nav-icon" src="${search.href}" alt="" width="16" height="16" />`
      + `<input type="search" placeholder="Search" aria-label="Search" />`
      + (bag ? `<img className="nav-icon" src="${bag.href}" alt="" width="16" height="16" />` : '')
      + `</span>`,
    );
  }
  // Inject nav icon row when we have icons but JSX never referenced them.
  if (icons.length >= 2 && !/nav-icon|\/icons\//i.test(s) && /<nav[\s>]/i.test(s)) {
    const iconImgs = icons.slice(0, 4)
      .map((ic) => `<img className="nav-icon" src="${ic.href}" alt="" width="16" height="16" />`)
      .join('');
    s = s.replace(
      /(<nav[^>]*>)/i,
      `$1\n      <span className="nav-tools">${iconImgs}</span>`,
    );
  }
  if (heroes[0] && /\.hero\b/.test(s) && !heroes.some((h) => s.includes(h.href))) {
    s = s.replace(
      /(\.hero\s*\{[^}]*background-color:\s*#000;)/,
      `$1\n  background-image: url('${heroes[0].href}');`,
    );
  }
  if (/\.nav-icon\b/.test(s) === false && /className=["']nav-icon["']/.test(s)) {
    s += `\n.nav-tools { display:flex; align-items:center; gap:10px; }\n.nav-icon { display:block; opacity:.9; filter: invert(1); }\n.logo img { display:block; filter: invert(1); }\n`;
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

  for (const slot of opts.plan.slots) {
    let url = slot.explicitUrl || '';
    if (!url && slot.iconify) url = iconifySvgUrl(slot.iconify, slot.role === 'logo' ? 64 : 24);
    if (!url && slot.query) {
      url = await pickPhotoUrl(slot.query, `${opts.projectName} ${slot.query}`, seed + saved.length);
    }
    if (!url) continue;
    const ok = await saveUrl(opts.diskRoot, slot.rel, url);
    if (ok) saved.push(slot.rel);
  }

  for (const key of Object.keys(files)) {
    if (!/\.(?:jsx|tsx|css|html)$/i.test(key)) continue;
    const next = wireBrandAssetsIntoSource(files[key], opts.plan);
    if (next !== files[key]) files[key] = next;
  }

  const extraCss = [
    '.logo img{display:block;filter:invert(1)}',
    '.nav-tools{display:flex;align-items:center;gap:10px}',
    '.nav-icon{display:block;opacity:.9;filter:invert(1)}',
  ].join('');
  if (files['src/App.css'] && !files['src/App.css'].includes('.nav-tools')) {
    let css = files['src/App.css'].trimEnd();
    if (!/\}\s*$/.test(css)) css += '\n}';
    files['src/App.css'] = `${css}\n${extraCss}\n`;
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
    ? `Brand assets saved: ${saved.map((p) => p.replace(/^public\//, '/')).join(', ')}`
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
