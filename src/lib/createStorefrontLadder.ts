/**
 * Storefront helpers — invent-first create owns the look.
 * `composeStorefrontSpine` / `runStorefrontCreateLadder` are LAST-RESORT salvage only
 * (after invent + tool-loop miss). Happy path: model writes unique App + catalog.
 */

import { createIdentityFromBrief } from '@/lib/createIdentity';
import { briefLooksLikeStorefront } from '@/lib/createLayoutContract';
import {
  briefLooksLikeInsulatedBottleShop,
  buildStorefrontCommerceFloor,
  catalogForStorefrontBrief,
} from '@/lib/createStorefrontFloor';
import { appHasCommerceCart } from '@/lib/createBuildQuality';
import { brandLogoSvgFor } from '@/lib/brandAssets';

export const STOREFRONT_LADDER_WALL_MS = 8 * 60_000;

/** Create path must invent before any floor paste. */
export const STOREFRONT_INVENT_FIRST = true;

/**
 * Invent owns a unique storefront from the brief — never ship the compose floor as Ready.
 */
export function formatStorefrontInventOwnLookPrompt(opts: {
  brand: string;
  brief: string;
  salt?: string;
  /** From understandCreateBrief — peers put the contract in the invent prompt. */
  goal?: string;
  audience?: string;
  primaryAction?: string;
  assumptions?: string[];
  mustHave?: string[];
  outOfScope?: string[];
  verifyChecks?: string[];
  craftOrder?: string[];
}): string {
  const brand = String(opts.brand || 'Shop').trim() || 'Shop';
  const brief = String(opts.brief || '').trim();
  const salt = String(opts.salt || '').slice(-6);
  const n = wantedProductCount(brief);
  const must = (opts.mustHave || []).filter(Boolean).slice(0, 10);
  const out = (opts.outOfScope || []).filter(Boolean).slice(0, 6);
  const verify = (opts.verifyChecks || []).filter(Boolean).slice(0, 8);
  const assumptions = (opts.assumptions || []).filter(Boolean).slice(0, 6);
  const order = (opts.craftOrder || []).filter(Boolean).slice(0, 6);
  return [
    `Invent a one-of-one storefront for **${brand}** from the brief (salt ${salt || 'new'}).`,
    opts.goal ? `GOAL: ${opts.goal}` : '',
    opts.audience ? `AUDIENCE: ${opts.audience}` : '',
    opts.primaryAction ? `PRIMARY ACTION: ${opts.primaryAction}` : '',
    'Do NOT reuse a generic shop shell, twin catalog names, or a hardcoded commerce floor.',
    `Catalog: ≥${n} real products matching the brief (names, prices, variants the ask implies).`,
    'Working add-to-cart, quantity, and purchase — state-backed, not decorative.',
    'Brand mark + hero must match the product category in the brief (not a wrong genre icon).',
    'Full page: nav, hero, catalog, cart affordance, about/help as the brief asks.',
    'Write unique classNames and copy for this brand — shipping an unchanged seed/floor fails Ready.',
    order.length
      ? `CRAFT ORDER:\n${order.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : '',
    must.length
      ? `MUST-HAVES (implement every item — Ready fails if any missing):\n${must.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : '',
    out.length
      ? `OUT OF SCOPE (do not build):\n${out.map((m) => `- ${m}`).join('\n')}`
      : '',
    assumptions.length
      ? `ASSUMPTIONS:\n${assumptions.map((m) => `- ${m}`).join('\n')}`
      : '',
    verify.length
      ? `DONE CHECKS (your App must satisfy):\n${verify.map((m) => `- ${m}`).join('\n')}`
      : '',
    brief ? `Brief:\n${brief.slice(0, 1600)}` : '',
  ].filter(Boolean).join('\n');
}

/** True when disk still looks like the compose/hard-guarantee floor (invent must rewrite). */
export function appLooksLikeStorefrontFloor(
  app: string,
  files?: Record<string, string>,
): boolean {
  const t = String(app || '');
  const blob = `${t}\n${String(files?.['src/data/products.ts'] || '')}\n${String(files?.['src/App.css'] || '')}`;
  if (!t.trim() && !blob.trim()) return false;
  // Markers from composeStorefrontSpine / commerce floors
  if (/nova-storefront-spine/i.test(blob)) return true;
  if (/className=["'][^"']*storefront-floor/i.test(t)) return true;
  if (/\/\*\s*storefront\s+commerce\s+floor/i.test(blob)) return true;
  return false;
}

export function briefWantsStorefrontLadder(brief: string, productName = ''): boolean {
  const t = String(brief || '');
  if (/\bSaaS\s+app\s+shell\b/i.test(t)) return false;
  if (/\bauth\s+screen\b/i.test(t) && /\bbilling\b/i.test(t)) return false;
  // Product desk/delivery landings own their ladder — not shops.
  if (
    /\b(?:gaming\s+desk|standing\s+desk|food\s+delivery|meal\s+delivery)\b/i.test(t)
    && !/\b(?:cart|checkout|add\s+to\s+cart|e-?commerce|storefront|catalog)\b/i.test(t)
  ) {
    return false;
  }
  return briefLooksLikeStorefront(t, productName)
    || briefLooksLikeInsulatedBottleShop(productName, t);
}

export type StorefrontLadderBeat = {
  id: string;
  label: string;
  verify: (files: Record<string, string>, brief: string, brand: string) => boolean;
};

function productCount(files: Record<string, string>): number {
  const products = String(files['src/data/products.ts'] || '');
  return (products.match(/"id"\s*:/g) || []).length;
}

function wantedProductCount(brief: string): number {
  const m = String(brief || '').match(/\bexactly\s+(\d+)\s+(?:bottles?|products?|items?)\b/i);
  if (m) return Math.max(3, Math.min(24, Number(m[1]) || 9));
  if (/\b9\s+bottles?\b/i.test(brief)) return 9;
  return 8;
}

function logoLooksWrongGenre(logo: string, brief: string, brand: string): boolean {
  if (!logo.trim()) return true;
  // Music note path (lucide:music)
  if (/M9 18V5l12-2v13/i.test(logo)) return true;
  // Gamepad
  if (/gamepad|M17\.32 5H6\.68/i.test(logo)) return true;
  // Sparkles-only when we have a clear shop brief
  if (/M9\.937 15\.5/i.test(logo) && briefLooksLikeStorefront(brief, brand)) return true;
  // Wine glass on insulated water-bottle shop
  if (
    briefLooksLikeInsulatedBottleShop(brand, brief)
    && /M12 15a5 5 0 0 0 5-5c0-2/i.test(logo)
  ) {
    return true;
  }
  return false;
}

/** Simple flask mark — insulated bottle shops (not wine glass). */
export function storefrontFlaskLogoSvg(ink = '#0f766e'): string {
  const i = String(ink || '#0f766e').replace(/[<>"']/g, '') || '#0f766e';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">`,
    `<rect x="22" y="6" width="20" height="8" rx="2" fill="${i}"/>`,
    `<path d="M26 14h12v8c4 4 8 10 8 18a14 14 0 0 1-28 0c0-8 4-14 8-18v-8z" fill="${i}" opacity="0.92"/>`,
    `<ellipse cx="32" cy="44" rx="8" ry="4" fill="#fff" opacity="0.25"/>`,
    `</svg>`,
  ].join('');
}

export function storefrontHeroSvg(brand: string, accent = '#0f766e', canvas = '#f7f3eb'): string {
  const b = String(brand || 'Shop').replace(/[<>&"']/g, '').slice(0, 40) || 'Shop';
  const a = String(accent || '#0f766e').replace(/[<>"']/g, '');
  const c = String(canvas || '#f7f3eb').replace(/[<>"']/g, '');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" role="img" aria-label="${b} hero">`,
    `<rect width="1200" height="720" fill="${c}"/>`,
    `<circle cx="920" cy="220" r="180" fill="${a}" opacity="0.18"/>`,
    `<circle cx="280" cy="480" r="220" fill="${a}" opacity="0.12"/>`,
    `<rect x="520" y="160" width="160" height="360" rx="80" fill="${a}" opacity="0.85"/>`,
    `<rect x="560" y="120" width="80" height="50" rx="12" fill="${a}"/>`,
    `<text x="600" y="620" text-anchor="middle" font-family="Georgia,serif" font-size="42" fill="#1c1917">${b}</text>`,
    `</svg>`,
  ].join('');
}

const BEATS: StorefrontLadderBeat[] = [
  {
    id: 'catalog',
    label: 'Catalog · products.ts priced SKUs',
    verify: (files, brief) => productCount(files) >= Math.min(wantedProductCount(brief), 6),
  },
  {
    id: 'cart',
    label: 'Cart · add / qty / purchase',
    verify: (files) => appHasCommerceCart(files),
  },
  {
    id: 'chrome',
    label: 'Chrome · nav Shop + footer',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      return /href=["']#shop["']/i.test(app) && (/<footer\b/i.test(app) || /className=["']foot["']/i.test(app));
    },
  },
  {
    id: 'mark',
    label: 'Mark · logo not wrong genre',
    verify: (files, brief, brand) => {
      const logo = String(files['public/logo.svg'] || '');
      return logo.length > 40 && !logoLooksWrongGenre(logo, brief, brand);
    },
  },
  {
    id: 'hero',
    label: 'Hero · compose-owned stage',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      const heroKeys = Object.keys(files).filter((p) => /public\/heroes\/.+\.svg$/i.test(p.replace(/\\/g, '/')));
      return heroKeys.length > 0 && /\/heroes\//i.test(app);
    },
  },
];

export type StorefrontGrade = {
  okNormal: boolean;
  okQuality: boolean;
  label: 'Fail' | 'Normal' | 'Quality' | 'Professional';
  reasons: string[];
};

export function gradeStorefrontQuality(
  files: Record<string, string>,
  brief: string,
  brand: string,
): StorefrontGrade {
  const reasons: string[] = [];
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const want = wantedProductCount(brief);
  const n = productCount(files);
  if (n < Math.min(want, 6)) reasons.push(`catalog thin (${n} < ${Math.min(want, 6)} products)`);
  if (!appHasCommerceCart(files)) reasons.push('missing working add-to-cart / purchase');
  if (!/href=["']#shop["']/i.test(app)) reasons.push('missing Shop nav');
  if (/\b(?:About|Careers|Help)\b/i.test(brief) || /\bsupport\s+email\b/i.test(brief)) {
    if (!/About/i.test(app)) reasons.push('missing About');
    if (!/Career/i.test(app)) reasons.push('missing Careers');
    if (!/Help/i.test(app)) reasons.push('missing Help');
  }
  const logo = String(files['public/logo.svg'] || '');
  if (logoLooksWrongGenre(logo, brief, brand)) reasons.push('logo wrong genre or missing');
  const heroOk = Object.keys(files).some((p) => /public\/heroes\/.+\.svg$/i.test(p.replace(/\\/g, '/')));
  if (!heroOk) reasons.push('missing compose hero svg');
  if (/\b(?:cream|ivory|#f7f3eb|welcoming|off-?white)\b/i.test(brief)) {
    const css = String(files['src/App.css'] || '') + String(files['src/index.css'] || '');
    if (!/#f7f3eb|#fffef9|#faf7f0|floralwhite|seashell/i.test(css)) {
      reasons.push('light/ivory canvas missing');
    }
  }
  const brandHit = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 24), 'i').test(app);
  if (brand.trim() && !brandHit) reasons.push('brand name missing from App');

  const hardMiss = reasons.some((r) => /catalog thin|add-to-cart|logo wrong/i.test(r));
  if (hardMiss || reasons.length >= 4) {
    return { okNormal: false, okQuality: false, label: 'Fail', reasons };
  }
  if (reasons.length > 0) {
    return { okNormal: true, okQuality: false, label: 'Normal', reasons };
  }
  return { okNormal: true, okQuality: true, label: 'Quality', reasons: [] };
}

export function composeStorefrontSpine(
  brand: string,
  brief: string,
  salt = '',
): Record<string, string> {
  const title = String(brand || 'Shop').replace(/\s+/g, ' ').trim().slice(0, 48) || 'Shop';
  const identity = createIdentityFromBrief(title, brief);
  const floor = buildStorefrontCommerceFloor(title, brief, identity.palette);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
  const accent = identity.palette?.accent || '#0f766e';
  const canvas = identity.palette?.bg || '#f7f3eb';

  let logo = brandLogoSvgFor({
    productName: title,
    brief,
    css: `background:${canvas}`,
  });
  if (
    briefLooksLikeInsulatedBottleShop(title, brief)
    || logoLooksWrongGenre(logo, brief, title)
  ) {
    if (briefLooksLikeInsulatedBottleShop(title, brief)) {
      logo = storefrontFlaskLogoSvg(accent);
    } else if (!logo.trim() || logoLooksWrongGenre(logo, brief, title)) {
      logo = brandLogoSvgFor({ productName: title, brief: `${brief} shop store cart`, css: `background:${canvas}` })
        || storefrontFlaskLogoSvg(accent);
    }
  }

  const hero = storefrontHeroSvg(title, accent, canvas);
  const heroPath = `public/heroes/${slug}-hero.svg`;

  // Ensure App references the SVG hero (floor already uses /heroes/{slug}-hero.svg).
  let app = floor.app;
  if (!app.includes(`/heroes/${slug}-hero.svg`)) {
    app = app.replace(/const HERO = '[^']*'/, `const HERO = '/heroes/${slug}-hero.svg'`);
  }

  const out: Record<string, string> = {
    ...floor.files,
    'src/App.jsx': app,
    'src/App.css': floor.css,
    'public/logo.svg': logo,
    [heroPath]: hero,
  };
  delete out['src/App.tsx'];

  // Marker proves compose spine (vs late hard-guarantee paste) + salt for uniqueness.
  if (out['src/data/products.ts']) {
    const mark = `// nova-storefront-spine${salt ? `:${salt}` : ''}\n`;
    if (!/nova-storefront-spine/i.test(out['src/data/products.ts'])) {
      out['src/data/products.ts'] = `${out['src/data/products.ts'].trimEnd()}\n\n${mark}`;
    }
  }

  void catalogForStorefrontBrief(title, brief);
  return out;
}

export type StorefrontLadderHost = {
  pushStatus: (label: string, writingPath?: string | null) => void;
  shouldAbort?: () => boolean;
};

export type StorefrontLadderResult = {
  ok: boolean;
  files: Record<string, string>;
  beatsDone: string[];
  failedBeat?: string;
  reason?: string;
  grade: StorefrontGrade;
  elapsedMs: number;
};

export async function runStorefrontCreateLadder(opts: {
  brief: string;
  productName: string;
  files: Record<string, string>;
  host: StorefrontLadderHost;
  startedAt?: number;
  wallMs?: number;
  salt?: string;
}): Promise<StorefrontLadderResult> {
  const startedAt = opts.startedAt ?? Date.now();
  const wallMs = opts.wallMs ?? STOREFRONT_LADDER_WALL_MS;
  const brand = String(opts.productName || 'Shop').trim() || 'Shop';
  const brief = String(opts.brief || '');
  const beatsDone: string[] = [];

  if (!briefWantsStorefrontLadder(brief, brand)) {
    const grade = gradeStorefrontQuality(opts.files, brief, brand);
    return {
      ok: false,
      files: opts.files,
      beatsDone,
      reason: 'Brief is not a storefront ladder create',
      grade,
      elapsedMs: Date.now() - startedAt,
    };
  }

  opts.host.pushStatus('Ladder · storefront salvage spine (last resort — invent missed)…');
  let files = {
    ...opts.files,
    ...composeStorefrontSpine(brand, brief, opts.salt || String(Date.now()).slice(-6)),
  };

  for (const beat of BEATS) {
    if (opts.host.shouldAbort?.() || Date.now() - startedAt >= wallMs) {
      return {
        ok: false,
        files,
        beatsDone,
        failedBeat: beat.id,
        reason: 'Storefront ladder aborted or wall',
        grade: gradeStorefrontQuality(files, brief, brand),
        elapsedMs: Date.now() - startedAt,
      };
    }
    opts.host.pushStatus(`Ladder · ${beat.label}…`);
    if (!beat.verify(files, brief, brand)) {
      // One rematerialize retry for the whole spine
      files = {
        ...opts.files,
        ...composeStorefrontSpine(brand, brief, `${opts.salt || 'sf'}-retry`),
      };
      if (!beat.verify(files, brief, brand)) {
        return {
          ok: false,
          files,
          beatsDone,
          failedBeat: beat.id,
          reason: `Storefront beat missed: ${beat.id}`,
          grade: gradeStorefrontQuality(files, brief, brand),
          elapsedMs: Date.now() - startedAt,
        };
      }
    }
    beatsDone.push(beat.id);
  }

  const grade = gradeStorefrontQuality(files, brief, brand);
  return {
    ok: grade.okQuality || grade.okNormal,
    files,
    beatsDone,
    reason: grade.okQuality ? undefined : `Accept ${grade.label}: ${grade.reasons.slice(0, 3).join('; ')}`,
    grade,
    elapsedMs: Date.now() - startedAt,
  };
}
