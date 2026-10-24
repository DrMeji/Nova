/**
 * Wave 1 invent craft pack — brand kit, logo lock, premium pass, layout salt,
 * per-SKU glyphs, invent spec, Live visual grade, steering seeds.
 * Strong-bar implementations for invent-quality competitive gaps.
 */

import { filesHaveInventDemoSite, inventDemoOwnsLogo } from '@/lib/createThinPath';

function logoLooksLikeInventDemoMark(svg: string): boolean {
  const s = String(svg || '');
  if (!s.includes('<svg')) return false;
  if (/data-nova-invent-logo\s*=\s*["']1["']/i.test(s)) return true;
  return /viewBox=["']0 0 64 64["']/i.test(s)
    && /<text\b/i.test(s)
    && !/viewBox=["']0 0 24 24["']/i.test(s);
}

export type NovaBrandKit = {
  version: 1;
  brand: string;
  genre: string;
  logoLock: 'invent-demo';
  logoPath: 'public/logo.svg';
  colors: { bg: string; fg: string; accent: string; muted: string };
  typography: { display: string; body: string };
  layoutSalt: number;
  skuGlyphDir: 'public/products';
  /** When true, invent may fetch Openverse/stock photos (brief asked for real photos). */
  allowStockPhotos: boolean;
  createdAt: string;
};

export type InventSpec = {
  version: 1;
  brand: string;
  brief: string;
  genre: string;
  layoutSalt: number;
  skuCount: number;
  requirePremiumPass: boolean;
  logoLock: true;
  createdAt: string;
};

/** Deterministic salt 0–3 from brand+brief. */
export function inventLayoutSalt(brand: string, brief: string): number {
  const h = [...`${brand}\n${brief}`].reduce((a, c) => a + c.charCodeAt(0), 0);
  return Math.abs(h) % 4;
}

/** Refuse Lucide/family stamps over invent-demo logos. */
export function assertInventLogoLock(
  files: Record<string, string>,
  nextLogo?: string,
): { ok: boolean; reason: string } {
  if (!inventDemoOwnsLogo(files) && !filesHaveInventDemoSite(files)) {
    return { ok: true, reason: 'no invent lock' };
  }
  if (nextLogo == null) return { ok: true, reason: 'read-only check' };
  if (logoLooksLikeInventDemoMark(nextLogo) || /data-nova-invent-logo\s*=\s*["']1["']/i.test(nextLogo)) {
    return { ok: true, reason: 'invent mark preserved' };
  }
  // Lucide/Iconify marks are typically 24×24 path icons — block them.
  if (/viewBox=["']0 0 24 24["']/i.test(nextLogo) || /M9\.937 15\.5/i.test(nextLogo)) {
    return { ok: false, reason: 'blocked Lucide/family overwrite of invent logo' };
  }
  return { ok: false, reason: 'blocked non-invent logo overwrite' };
}

/** Safe logo write: keeps invent mark when locked. */
export function writeLogoIfAllowed(
  files: Record<string, string>,
  logo: string,
): Record<string, string> {
  const gate = assertInventLogoLock(files, logo);
  if (!gate.ok) return files;
  return { ...files, 'public/logo.svg': logo };
}

export function inventBriefAllowsStock(brief: string): boolean {
  return /\b(?:real\s+photos?|stock\s+photos?|unsplash|openverse|pexels|photograph(?:s|y)?)\b/i.test(
    String(brief || ''),
  );
}

export function inventMayUseStock(kit: NovaBrandKit | null | undefined): boolean {
  return Boolean(kit?.allowStockPhotos);
}

export function buildBrandKit(opts: {
  brand: string;
  genre: string;
  colors: { bg: string; fg: string; accent: string; muted: string };
  typography: { display: string; body: string };
  layoutSalt: number;
  brief?: string;
  allowStockPhotos?: boolean;
}): NovaBrandKit {
  return {
    version: 1,
    brand: opts.brand,
    genre: opts.genre,
    logoLock: 'invent-demo',
    logoPath: 'public/logo.svg',
    colors: opts.colors,
    typography: opts.typography,
    layoutSalt: opts.layoutSalt,
    skuGlyphDir: 'public/products',
    allowStockPhotos: opts.allowStockPhotos ?? inventBriefAllowsStock(opts.brief || ''),
    createdAt: new Date().toISOString(),
  };
}

export function buildInventSpec(opts: {
  brand: string;
  brief: string;
  genre: string;
  layoutSalt: number;
  skuCount: number;
}): InventSpec {
  return {
    version: 1,
    brand: opts.brand,
    brief: String(opts.brief || '').slice(0, 4000),
    genre: opts.genre,
    layoutSalt: opts.layoutSalt,
    skuCount: opts.skuCount,
    requirePremiumPass: true,
    logoLock: true,
    createdAt: new Date().toISOString(),
  };
}

export function brandKitFiles(kit: NovaBrandKit, spec: InventSpec): Record<string, string> {
  const steeringProduct = `# Product
Brand: ${kit.brand}
Genre: ${kit.genre}
Logo: locked invent mark at ${kit.logoPath} (never Lucide overwrite)
Layout salt: ${kit.layoutSalt}
`;
  const steeringTech = `# Tech
Stack: Vite + React
Tokens: --bg ${kit.colors.bg}, --fg ${kit.colors.fg}, --accent ${kit.colors.accent}
Display: ${kit.typography.display}
Body: ${kit.typography.body}
`;
  const steeringStructure = `# Structure
Invent-demo site with data-nova-invent-demo=1
SKU glyphs under ${kit.skuGlyphDir}/
Premium pass required before quality Ready
`;
  const agents = `# AGENTS.md — ${kit.brand}
- Never replace public/logo.svg with Lucide/Iconify when data-nova-invent-logo is set.
- Respect .nova/brand-kit.json colors and layout salt ${kit.layoutSalt}.
- Prefer edit over re-invent when Live is already mounted.
`;
  const memory = `# Nova auto-memory
- Invent logo lock active for ${kit.brand}
- Genre: ${kit.genre}
- Layout salt: ${kit.layoutSalt}
`;
  return {
    '.nova/brand-kit.json': `${JSON.stringify(kit, null, 2)}\n`,
    '.nova/invent-spec.json': `${JSON.stringify(spec, null, 2)}\n`,
    '.nova/steering/product.md': steeringProduct,
    '.nova/steering/tech.md': steeringTech,
    '.nova/steering/structure.md': steeringStructure,
    '.nova/memory.md': memory,
    'AGENTS.md': agents,
  };
}

/** Distinct per-SKU glyph (64×64) — not a shared silhouette. */
export function skuGlyphSvg(opts: {
  index: number;
  title: string;
  genre: string;
  accent: string;
  bg: string;
  fg: string;
}): string {
  const i = opts.index;
  const rot = (i * 37) % 360;
  const cx = 22 + (i % 5) * 4;
  const cy = 22 + (Math.floor(i / 3) % 4) * 5;
  const r1 = 8 + (i % 4) * 2;
  const r2 = 4 + (i % 3);
  const initial = String(opts.title || 'P').trim().slice(0, 1).toUpperCase() || 'P';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" data-nova-sku="${i}" data-nova-invent-logo="0">
  <rect width="64" height="64" rx="${6 + (i % 5)}" fill="${opts.bg}"/>
  <g transform="rotate(${rot} 32 32)">
    <circle cx="${cx}" cy="${cy}" r="${r1}" fill="${opts.accent}" opacity="0.9"/>
    <circle cx="${64 - cx}" cy="${64 - cy}" r="${r2}" fill="${opts.fg}" opacity="0.35"/>
    <rect x="${16 + (i % 6)}" y="${40 - (i % 5)}" width="${20 + (i % 8)}" height="${8 + (i % 4)}" rx="2" fill="${opts.accent}" opacity="0.55"/>
  </g>
  <text x="32" y="58" text-anchor="middle" font-size="9" fill="${opts.fg}" font-family="sans-serif">${initial}</text>
</svg>`;
}

export function attachSkuGlyphFiles(
  files: Record<string, string>,
  items: { title: string }[],
  genre: string,
  colors: { bg: string; accent: string; fg: string },
): Record<string, string> {
  const next = { ...files };
  items.forEach((item, i) => {
    const rel = `public/products/sku-${String(i + 1).padStart(2, '0')}.svg`;
    next[rel] = skuGlyphSvg({
      index: i,
      title: item.title,
      genre,
      accent: colors.accent,
      bg: colors.bg,
      fg: colors.fg,
    });
  });
  return next;
}

/** Layout salt CSS variants — anti-twin composition. */
export function layoutSaltCss(cls: string, salt: number): string {
  if (salt === 0) {
    return `
.app.${cls}[data-nova-layout-salt="0"] { --invent-hero-pad: 8vh 6vw; }
.app.${cls}[data-nova-layout-salt="0"] .spk-grid,
.app.${cls}[data-nova-layout-salt="0"] .lug-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;
  }
  if (salt === 1) {
    return `
.app.${cls}[data-nova-layout-salt="1"] { --invent-hero-pad: 12vh 4vw; }
.app.${cls}[data-nova-layout-salt="1"] .spk-stage { flex-direction: row-reverse; }
.app.${cls}[data-nova-layout-salt="1"] .spk-grid,
.app.${cls}[data-nova-layout-salt="1"] .lug-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.75rem; }
.app.${cls}[data-nova-layout-salt="1"] header { border-bottom-width: 2px; }
`;
  }
  if (salt === 2) {
    return `
.app.${cls}[data-nova-layout-salt="2"] { --invent-hero-pad: 6vh 8vw; }
.app.${cls}[data-nova-layout-salt="2"] .spk-grid,
.app.${cls}[data-nova-layout-salt="2"] .lug-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.app.${cls}[data-nova-layout-salt="2"] h1 { letter-spacing: -0.04em; max-width: 12ch; }
`;
  }
  return `
.app.${cls}[data-nova-layout-salt="3"] { --invent-hero-pad: 10vh 5vw; }
.app.${cls}[data-nova-layout-salt="3"] .spk-bay ul li,
.app.${cls}[data-nova-layout-salt="3"] .lug-grid li { border-radius: 0; }
.app.${cls}[data-nova-layout-salt="3"] .spk-grid,
.app.${cls}[data-nova-layout-salt="3"] .lug-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 2.5rem; }
`;
}

/**
 * Premium pass after invent-demo — luggage uses existing redesign;
 * other genres get a forced craft polish (density + token CSS + SKU art).
 */
export function applyInventPremiumPass(
  files: Record<string, string>,
  brand: string,
  brief: string,
): { files: Record<string, string>; applied: boolean; note: string } {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  if (!/data-nova-invent-demo\s*=\s*["']1["']/.test(app)) {
    return { files, applied: false, note: 'premium-pass skipped (not invent-demo)' };
  }
  // Luggage premium redesign is applied by the caller (createInventDemo) to avoid cycles.
  // Generic premium polish: denser type scale + premium surface tokens + mark pass done.
  void brand;
  void brief;
  if (/data-nova-layout\s*=\s*["']luggage["']/i.test(app)) {
    // Caller should have run applyLuggagePremiumRedesign; still stamp premium marker if missing.
  }
  let next = { ...files };
  let css = String(next['src/App.css'] || '');
  if (!/data-nova-premium-pass/.test(css)) {
    css += `
/* data-nova-premium-pass */
:root { --premium-lift: 1; }
.app { letter-spacing: -0.01em; }
.app h1 { font-weight: 650; line-height: 1.05; }
.app .btn { box-shadow: 0 1px 0 color-mix(in srgb, var(--fg) 12%, transparent); }
.app section { content-visibility: auto; }
`;
    next['src/App.css'] = css;
  }
  let appJsx = String(next['src/App.jsx'] || next['src/App.tsx'] || '');
  if (!/data-nova-premium-pass\s*=\s*["']1["']/.test(appJsx)) {
    appJsx = appJsx.replace(
      /data-nova-invent-demo\s*=\s*["']1["']/,
      'data-nova-invent-demo="1" data-nova-premium-pass="1"',
    );
    if (next['src/App.jsx']) next['src/App.jsx'] = appJsx;
    else next['src/App.tsx'] = appJsx;
  }
  return { files: next, applied: true, note: 'premium-pass · invent craft polish' };
}

/** Grade Live HTML/DOM text for invent readiness (agent-sees-Live signal). */
export function gradeInventLiveDom(opts: {
  html?: string;
  title?: string;
  brand?: string;
  hasLogoImg?: boolean;
  files?: Record<string, string>;
}): { ok: boolean; score: number; reasons: string[] } {
  const html = String(opts.html || '');
  const brand = String(opts.brand || '').trim();
  const files = opts.files || {};
  const reasons: string[] = [];
  let score = 0;
  // Invent-demo marker is a host twin — do not reward it. Prefer real model invent length.
  if (/data-nova-invent-demo\s*=\s*["']1["']/.test(html)) {
    reasons.push('invent-demo host twin in Live DOM — not a brief invent');
    score = Math.max(0, score - 20);
  } else if (html.length > 800) {
    score += 22;
  } else {
    reasons.push('Live DOM thin');
  }
  if (brand && new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(html)) {
    score += 18;
  } else if (brand) {
    reasons.push('brand name not found in Live DOM');
  }
  if (/\/logo\.svg/i.test(html) || opts.hasLogoImg || Boolean(files['public/logo.svg'])) {
    score += 16;
  } else {
    reasons.push('logo img missing in Live DOM');
  }
  if (/<h1[\s>]/i.test(html) && /<(?:section|main)[\s>]/i.test(html)) {
    score += 12;
  } else {
    reasons.push('missing h1 or main/section structure');
  }
  if (/data-nova-premium-pass\s*=\s*["']1["']/i.test(html) || /premium/i.test(html)) {
    score += 8;
  }
  // Craft media floor — product/site builds must ship real visual plane, not purple-blob-only.
  const media = gradeInventCraftMedia({ html, files });
  score += media.score;
  reasons.push(...media.reasons);
  return { ok: score >= 72 && media.ok, score: Math.min(100, score), reasons };
}

/**
 * Why invent often ships without product/website images: model skips media seats,
 * Acc has no heroes/, logo text-only, SKU glyphs missing. Grade + Acc floor close that gap.
 */
export function gradeInventCraftMedia(opts: {
  html?: string;
  files?: Record<string, string>;
}): { ok: boolean; score: number; reasons: string[] } {
  const html = String(opts.html || '');
  const files = opts.files || {};
  const reasons: string[] = [];
  let score = 0;
  const fileKeys = Object.keys(files);
  const hasLogoFile = Boolean(files['public/logo.svg']) && String(files['public/logo.svg']).includes('<svg');
  const heroFiles = fileKeys.filter((k) => /^public\/heroes\//i.test(k));
  const skuFiles = fileKeys.filter((k) => /^public\/products\//i.test(k));
  const imgInDom = (html.match(/<img\b/gi) || []).length;
  const bgUrl = /url\(\s*['"]?\/(?:heroes|products|media)\//i.test(html)
    || /background(?:-image)?\s*:[^;]*url\(/i.test(html);
  const emojiAsPhoto = /[\u{1F300}-\u{1FAFF}]{2,}/u.test(html) && imgInDom < 2;
  const purpleSlop = /#(6|7|8)[0-9a-f]{2}[0-9a-f]{3}/i.test(html)
    && /gradient/i.test(html)
    && imgInDom === 0
    && heroFiles.length === 0;

  if (hasLogoFile) score += 6;
  else reasons.push('public/logo.svg missing or empty');

  if (heroFiles.length > 0 || /\/heroes\//i.test(html) || bgUrl) score += 8;
  else if (skuFiles.length >= 2) score += 6;
  else reasons.push('no hero/products media Acc (model often skips image generation)');

  if (imgInDom >= 2 || skuFiles.length >= 2 || heroFiles.length >= 1) score += 6;
  else reasons.push('Live has too few <img> / SKU art slots');

  if (emojiAsPhoto) {
    score = Math.max(0, score - 8);
    reasons.push('emoji standing in as product photography');
  }
  if (purpleSlop) {
    score = Math.max(0, score - 6);
    reasons.push('gradient-only hero with no photography plane');
  }

  return { ok: score >= 12 && !emojiAsPhoto, score, reasons };
}

/** Acc markers + checklist so invent Acc always carries the craft-media floor. */
export function inventCraftMediaFloorFiles(brand: string): Record<string, string> {
  const b = String(brand || 'App').trim() || 'App';
  return {
    '.nova/craft-media-floor.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      require: {
        logoSvg: 'public/logo.svg',
        heroOrSku: ['public/heroes/*', 'public/products/sku-*.svg'],
        liveImgMin: 2,
        blockEmojiAsPhoto: true,
        blockPurpleGradientOnly: true,
        favicon: 'public/favicon.svg',
      },
      modelSeats: {
        media: 'prefer media/vision seat when brief asks for photos or product shots',
        logo: 'brandAssets lock — never Lucide overwrite of invent mark',
        heal: 'auto-heal once on missing hero/logo before Ready',
      },
      note: 'Deep-rescan craft floor — close image/logo/atmosphere gaps on invent (any product kind, not websites-only).',
    }, null, 2)}\n`,
    '.nova/craft-media-checklist.md': `# Craft media floor — ${b}

- [ ] \`public/logo.svg\` invent mark locked (not Lucide 24×24)
- [ ] At least one hero (\`public/heroes/\`) OR 2+ SKU glyphs (\`public/products/\`)
- [ ] Live DOM shows brand + logo \`<img src="/logo.svg">\`
- [ ] No emoji clusters as product photography
- [ ] No purple/cream gradient-only first viewport
- [ ] Typography not Inter/Roboto/Arial default stack
- [ ] Atmosphere: real place/material/product plane when genre needs it
`,
  };
}

export function attachCraftMediaFloorFiles(
  files: Record<string, string>,
  opts: { brand: string },
): Record<string, string> {
  return { ...files, ...inventCraftMediaFloorFiles(opts.brand) };
}

/** Capture Live via desktop bridge when available. */
export async function captureInventLiveGrade(opts: {
  brand: string;
  files?: Record<string, string>;
}): Promise<{ ok: boolean; score: number; reasons: string[]; note: string }> {
  const desk = typeof window !== 'undefined' ? window.novaDesktop : undefined;
  const app = String(opts.files?.['src/App.jsx'] || opts.files?.['src/App.tsx'] || '');
  try {
    if (desk?.previewCaptureLive) {
      const cap = await desk.previewCaptureLive();
      const dataUrl = String((cap as { dataUrl?: string })?.dataUrl || '');
      const html = String((cap as { html?: string })?.html || '');
      if (html) {
        const grade = gradeInventLiveDom({
          html,
          brand: opts.brand,
          hasLogoImg: /logo\.svg/i.test(html),
          files: opts.files,
        });
        return { ...grade, note: grade.ok ? 'live-grade pass' : `live-grade weak: ${grade.reasons.join('; ')}` };
      }
      // Screenshot captured — grade invent Acc structure + capture ok.
      const grade = gradeInventLiveDom({
        html: app,
        brand: opts.brand,
        hasLogoImg: /logo\.svg/i.test(app) || Boolean(opts.files?.['public/logo.svg']),
        files: opts.files,
      });
      const bumped = dataUrl.startsWith('data:image') ? Math.min(100, grade.score + 15) : grade.score;
      return {
        ok: bumped >= 70,
        score: bumped,
        reasons: grade.reasons,
        note: dataUrl ? `live-grade screenshot+Acc (score ${bumped})` : 'live-grade Acc',
      };
    }
  } catch (e) {
    return { ok: false, score: 0, reasons: [String(e)], note: 'live-grade capture failed' };
  }
  const grade = gradeInventLiveDom({
    html: app,
    brand: opts.brand,
    hasLogoImg: Boolean(opts.files?.['public/logo.svg']),
    files: opts.files,
  });
  return {
    ...grade,
    note: grade.ok ? 'live-grade Acc pass' : `live-grade Acc: ${grade.reasons.join('; ')}`,
  };
}

/** Plan gate: large invent briefs need Plan approve unless already approved. */
export function inventNeedsPlanApprove(brief: string, planApproved: boolean): boolean {
  if (planApproved) return false;
  const t = String(brief || '');
  if (t.length < 180) return false;
  return /\b(?:create|invent|build|make)\b/i.test(t)
    && /\b(?:shop|store|site|website|storefront|brand)\b/i.test(t);
}

export function appendAutoMemory(
  existing: string,
  line: string,
): string {
  const base = String(existing || '# Nova auto-memory\n');
  const entry = `- ${new Date().toISOString().slice(0, 10)}: ${String(line || '').slice(0, 240)}`;
  if (base.includes(entry.slice(20))) return base;
  return `${base.trimEnd()}\n${entry}\n`;
}
