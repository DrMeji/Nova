/**
 * ProductSpec + LayoutContract + CopyPack + genre floors + quality scores.
 * Free models fill slots; Nova owns composition taste and Ready gates.
 */

export type BuildGenre =
  | 'product-homepage'
  | 'storefront'
  | 'cafe-local'
  | 'saas-landing'
  | 'arcade-game'
  | 'utility-tool'
  | 'desktop-app'
  | 'cli-tool'
  | 'python-app'
  | 'generic-web';

/** Catalog product schema craft/floors must fill for storefront genre. */
export type StorefrontProduct = {
  id: string;
  name: string;
  type: string;
  origin?: string;
  age?: string;
  abv?: string;
  notes: string;
  price: number;
  image?: string;
};

export type ProductSpec = {
  productName: string;
  genre: BuildGenre;
  audience: string;
  pageMap: string[];
  mustHave: string[];
  mustNot: string[];
  referenceBar: string;
  kind: 'web' | 'desktop' | 'cli' | 'game' | 'python';
};

export type LayoutSection = {
  id: string;
  role: 'nav' | 'hero' | 'band' | 'grid' | 'footer' | 'canvas' | 'sidebar' | 'main' | 'filters' | 'cart' | 'checkout';
  fullBleed?: boolean;
  headlineKey?: string;
};

export type LayoutContract = {
  composition: 'full-bleed-bands' | 'catalog-storefront' | 'split-hero' | 'single-canvas' | 'app-chrome' | 'cli-chrome' | 'tool-panel';
  hero: {
    fullBleed: boolean;
    media: 'product-stage' | 'photo' | 'gradient' | 'canvas' | 'none';
    overlaysForbidden: boolean;
  };
  sections: LayoutSection[];
  typography: {
    display: string;
    body: string;
    scale: 'editorial' | 'product' | 'utility' | 'retail';
  };
  palette: {
    bg: string;
    ink: string;
    accent: string;
    muted: string;
  };
  motion: string[];
  forbid: string[];
  genre: BuildGenre;
};

export type CopyPack = {
  brand: string;
  headline: string;
  support: string;
  ctas: string[];
  sections: Record<string, { title: string; body: string }>;
};

export type QualityScore = {
  ok: boolean;
  score: number;
  reasons: string[];
};

const FORBID_COMMON = [
  'absolute-icon-rail',
  'absolute-brand-rail',
  'floating-sticker-overlays',
  'cream-terracotta-serif-cluster',
  'purple-on-white-ai-gradient',
  'lorem-ipsum',
  'sample-placeholder-copy',
  'via.placeholder.com',
  'unsplash-cinema-forest-ocean',
];

/** True when the brief wants a real shop / cart / catalog — not a marketing one-pager. */
export function briefLooksLikeStorefront(brief: string, productName = ''): boolean {
  const t = `${brief}\n${productName}`;
  if (/\b(?:cart|checkout|purchase|add\s+to\s+cart|online\s+store|e-?commerce|product\s+catalog)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:liquor|spirits?|whiskey|whisky|vodka|gin|tequila|bourbon|rum|bottle\s+shop|wine\s+shop)\b/i.test(t)) {
    return true;
  }
  return /\b(?:shop|store|boutique)\b/i.test(t)
    && /\b(?:buy|browse|products?|catalog|filter|quantity|checkout)\b/i.test(t);
}

/** Infer genre + kind from brief (deterministic; LLM may refine). */
export function inferBuildGenre(brief: string, productName = ''): { genre: BuildGenre; kind: ProductSpec['kind'] } {
  const t = `${brief}\n${productName}`;
  if (/\b(?:cli|command[- ]line|terminal\s+tool)\b/i.test(t)) {
    return { genre: 'cli-tool', kind: 'cli' };
  }
  if (/\b(?:python|flask|fastapi|\.py)\b/i.test(t) && !/\b(?:website|landing|react)\b/i.test(t)) {
    return { genre: 'python-app', kind: 'python' };
  }
  if (/\b(?:arcade|canvas\s+game|playable|pong|snake|pac-?man|fps|shooter|dino)\b/i.test(t)) {
    return { genre: 'arcade-game', kind: 'game' };
  }
  if (/\b(?:electron|desktop\s+app|native\s+window)\b/i.test(t) && !/\b(?:website|landing)\b/i.test(t)) {
    return { genre: 'desktop-app', kind: 'desktop' };
  }
  // Storefront / commerce before marketing homepage — shops are not one-pager landings.
  if (briefLooksLikeStorefront(brief, productName)) {
    return { genre: 'storefront', kind: 'web' };
  }
  // Job shape first — site names (apple.com) are NOT what unlocks product-homepage quality.
  // Explicit Apple brand replica still uses product-homepage via briefWantsAppleProductBands elsewhere.
  if (/\b(?:calculator|tracker|utility|tool\s+ui|converter|tip\s*(?:calc|calculator|wise)|todo|task\s*list)\b/i.test(t)
    && !/\b(?:landing|marketing|homepage|website|product\s+site)\b/i.test(t)) {
    return { genre: 'utility-tool', kind: 'web' };
  }
  if (/\b(?:dashboard|sidebar|admin\s+panel)\b/i.test(t)
    && !/\b(?:landing|marketing|homepage)\b/i.test(t)) {
    return { genre: 'desktop-app', kind: 'web' };
  }
  if (/\b(?:saas|pricing\s+page|sign[- ]?up|waitlist)\b/i.test(t)
    && !/\b(?:homepage|product\s+site|full[- ]?bleed)\b/i.test(t)) {
    return { genre: 'saas-landing', kind: 'web' };
  }
  // Local businesses share marketing composition; warm tokens come from Design Spine, not a cafe-only gate.
  if (/\b(?:cafe|coffee|bakery|bistro|restaurant|roaster)\b/i.test(t)
    && /\b(?:website|site|landing|homepage|page)\b/i.test(t)
    && !/\b(?:cart|checkout|online\s+store)\b/i.test(t)) {
    return { genre: 'cafe-local', kind: 'web' };
  }
  if (/\b(?:landing|marketing|homepage|website|product\s+site|product\s+band|full[- ]?bleed)\b/i.test(t)
    || /\b(?:skincare|brand|studio)\b/i.test(t)) {
    return { genre: 'product-homepage', kind: 'web' };
  }
  // Default web asks → generic-web; ProductPlan picks the composition family (not silent marketing).
  return { genre: 'generic-web', kind: 'web' };
}

/** True when absolute icon/brand rails would destroy the layout. */
export function briefForbidsAbsoluteRails(brief: string): boolean {
  const { genre } = inferBuildGenre(brief);
  if (genre === 'product-homepage' || genre === 'storefront' || genre === 'cafe-local' || genre === 'saas-landing') {
    return true;
  }
  const t = String(brief || '');
  return /\b(?:full[- ]?bleed|apple\.com|product\s+band|marketing|landing|hero|shop|store)\b/i.test(t)
    && !/\b(?:icon[- ]?rail|toolbar\s+icons?\s+top[- ]?left)\b/i.test(t);
}

/** True only for intentional Apple.com replica asks — not “Forbidden: Mac/iPad clones”. */
function briefWantsAppleProductBands(brief: string): boolean {
  const t = String(brief || '')
    .replace(/##\s*ProductSpec[\s\S]*?(?=##\s|\s*$)/gi, ' ')
    .replace(/##\s*LayoutContract[\s\S]*?(?=##\s|\s*$)/gi, ' ')
    .replace(/##\s*CopyPack[\s\S]*?(?=##\s|\s*$)/gi, ' ')
    .replace(/\bapple\.com product homepage\b[^\n]*/gi, ' ');
  if (!t.trim()) return false;
  if (/\b(?:never|forbidden|forbidding|not|no|don't|dont|avoid)\b[\s\S]{0,80}\b(?:apple(?:\.com)?|mac\s*\/\s*ipad|mac\/ipad|iphone|ipad|airpods)\b/i.test(t)
    || /\b(?:apple\s+)?mac\s*\/\s*ipad(?:\s*\/\s*watch)?\s+clones?\b/i.test(t)
    || /\bclones?\b[\s\S]{0,24}\b(?:apple|mac|ipad|iphone)\b/i.test(t)) {
    return false;
  }
  return /\bexact\s+apple(?:\.com)?[- ]?style\b/i.test(t)
    || (/\bapple\.com\b/i.test(t) && /\b(?:style|like|exact|replica|clone|homepage)\b/i.test(t) && /\b(?:build|create|make|apple)\b/i.test(t))
    || (/\b(?:build|create|make|clone|replica)\b[\s\S]{0,80}\b(?:apple|iphone)\b/i.test(t)
      && /\b(?:mac|ipad|airpods|product\s+band)\b/i.test(t));
}

export function genreFloor(genre: BuildGenre, brief?: string): LayoutContract {
  const baseForbid = [...FORBID_COMMON];
  switch (genre) {
    case 'storefront': {
      const liquor = /\b(?:liquor|spirits?|whiskey|whisky|bourbon|vodka|gin|tequila|rum|bottle)\b/i.test(String(brief || ''));
      return {
        composition: 'catalog-storefront',
        hero: { fullBleed: true, media: liquor ? 'photo' : 'product-stage', overlaysForbidden: true },
        sections: [
          { id: 'nav', role: 'nav' },
          { id: 'hero', role: 'hero', fullBleed: true, headlineKey: 'hero' },
          { id: 'filters', role: 'filters' },
          { id: 'catalog', role: 'grid' },
          { id: 'story', role: 'band' },
          { id: 'cart', role: 'cart' },
          { id: 'checkout', role: 'checkout' },
          { id: 'footer', role: 'footer' },
        ],
        typography: {
          display: liquor ? 'Fraunces, Georgia, serif' : 'Instrument Serif, Georgia, serif',
          body: 'Source Sans 3, system-ui, sans-serif',
          scale: 'retail',
        },
        palette: liquor
          ? { bg: '#120c0a', ink: '#f4ebe2', accent: '#c9853a', muted: '#b7a597' }
          : { bg: '#0f1419', ink: '#eef2f6', accent: '#d4a574', muted: '#9aa3b2' },
        motion: ['card-rise', 'drawer-slide', 'soft-fade-in'],
        forbid: [
          ...baseForbid,
          'phone-column-shell',
          'booking-core-day-reserve-stub',
          'icon-only-cart',
          'thin-3-sku-catalog',
          'missing-product-metadata',
          'missing-qty-controls',
          'missing-filter-bar',
        ],
        genre,
      };
    }
    case 'product-homepage': {
      const appleBands = briefWantsAppleProductBands(String(brief || ''));
      return {
        composition: 'full-bleed-bands',
        hero: { fullBleed: true, media: 'product-stage', overlaysForbidden: true },
        sections: appleBands
          ? [
            { id: 'nav', role: 'nav' },
            { id: 'hero', role: 'hero', fullBleed: true, headlineKey: 'hero' },
            { id: 'mac', role: 'band', fullBleed: true },
            { id: 'ipad', role: 'band', fullBleed: true },
            { id: 'watch', role: 'band', fullBleed: true },
            { id: 'airpods', role: 'band', fullBleed: true },
            { id: 'footer', role: 'footer' },
          ]
          : [
            { id: 'nav', role: 'nav' },
            { id: 'hero', role: 'hero', fullBleed: true, headlineKey: 'hero' },
            { id: 'feature-a', role: 'band', fullBleed: true },
            { id: 'feature-b', role: 'band', fullBleed: true },
            { id: 'feature-c', role: 'band', fullBleed: true },
            { id: 'specs', role: 'band' },
            { id: 'footer', role: 'footer' },
          ],
        typography: appleBands
          ? { display: 'SF Pro Display, Helvetica Neue, system-ui', body: 'SF Pro Text, system-ui, sans-serif', scale: 'product' }
          : { display: 'Georgia, Times New Roman, serif', body: 'system-ui, sans-serif', scale: 'editorial' },
        palette: appleBands
          ? { bg: '#000000', ink: '#f5f5f7', accent: '#2997ff', muted: '#a1a1a6' }
          : { bg: '#0c0f14', ink: '#f4f1ea', accent: '#7eb8ff', muted: '#9aa3b2' },
        motion: ['subtle-fade-in', 'band-reveal', 'soft-orb-drift'],
        forbid: [
          ...baseForbid,
          'card-grid-as-first-viewport',
          'inset-hero-card',
          'low-contrast-product-titles',
          'left-black-strip-nav',
          'band-n-placeholder-titles',
          'toy-tablet-hero-bezel',
          'built-for-general-users-copy',
          ...(appleBands ? [] : ['apple-mac-ipad-watch-clone-bands', 'iphone-hero-for-non-apple-brand']),
        ],
        genre,
      };
    }
    case 'cafe-local':
      return {
        composition: 'split-hero',
        hero: { fullBleed: true, media: 'photo', overlaysForbidden: true },
        sections: [
          { id: 'nav', role: 'nav' },
          { id: 'hero', role: 'hero', fullBleed: true, headlineKey: 'hero' },
          { id: 'menu', role: 'band' },
          { id: 'visit', role: 'band' },
          { id: 'footer', role: 'footer' },
        ],
        typography: { display: 'Fraunces, Georgia, serif', body: 'Source Sans 3, system-ui', scale: 'editorial' },
        palette: { bg: '#1a1512', ink: '#f3ebe3', accent: '#c4a574', muted: '#a89888' },
        motion: ['steam-drift', 'soft-parallax'],
        forbid: [...baseForbid, 'generic-stock-forest', 'purple-gradient-hero'],
        genre,
      };
    case 'saas-landing':
      return {
        composition: 'split-hero',
        hero: { fullBleed: false, media: 'gradient', overlaysForbidden: true },
        sections: [
          { id: 'nav', role: 'nav' },
          { id: 'hero', role: 'hero', headlineKey: 'hero' },
          { id: 'features', role: 'grid' },
          { id: 'cta', role: 'band' },
          { id: 'footer', role: 'footer' },
        ],
        typography: { display: 'Inter Display, system-ui', body: 'Inter, system-ui', scale: 'product' },
        palette: { bg: '#0b1020', ink: '#e8eefc', accent: '#5b8cff', muted: '#8b97b8' },
        motion: ['gradient-shift'],
        forbid: [...baseForbid, 'cream-terracotta-serif-cluster'],
        genre,
      };
    case 'arcade-game':
      return {
        composition: 'single-canvas',
        hero: { fullBleed: true, media: 'canvas', overlaysForbidden: false },
        sections: [
          { id: 'hud', role: 'nav' },
          { id: 'play', role: 'canvas', fullBleed: true },
        ],
        typography: { display: 'system-ui', body: 'system-ui', scale: 'utility' },
        palette: { bg: '#0a0a0f', ink: '#f0f0f5', accent: '#39ff14', muted: '#888' },
        motion: ['game-loop'],
        forbid: [...baseForbid.filter((f) => f !== 'floating-sticker-overlays'), 'marketing-card-grid'],
        genre,
      };
    case 'utility-tool':
      return {
        composition: 'tool-panel',
        hero: { fullBleed: false, media: 'none', overlaysForbidden: true },
        sections: [
          { id: 'chrome', role: 'nav' },
          { id: 'panel', role: 'main' },
        ],
        typography: { display: 'system-ui', body: 'system-ui', scale: 'utility' },
        palette: { bg: '#f8fafc', ink: '#0f172a', accent: '#2563eb', muted: '#64748b' },
        motion: [],
        forbid: [...baseForbid, 'fake-marketing-hero'],
        genre,
      };
    case 'desktop-app':
      return {
        composition: 'app-chrome',
        hero: { fullBleed: false, media: 'none', overlaysForbidden: true },
        sections: [
          { id: 'titlebar', role: 'nav' },
          { id: 'sidebar', role: 'sidebar' },
          { id: 'main', role: 'main' },
        ],
        typography: { display: 'system-ui', body: 'system-ui', scale: 'utility' },
        palette: { bg: '#1e1e1e', ink: '#cccccc', accent: '#0078d4', muted: '#858585' },
        motion: [],
        forbid: [...baseForbid],
        genre,
      };
    case 'cli-tool':
      return {
        composition: 'cli-chrome',
        hero: { fullBleed: false, media: 'none', overlaysForbidden: true },
        sections: [{ id: 'cli', role: 'main' }],
        typography: { display: 'ui-monospace, monospace', body: 'ui-monospace, monospace', scale: 'utility' },
        palette: { bg: '#0d1117', ink: '#c9d1d9', accent: '#58a6ff', muted: '#8b949e' },
        motion: [],
        forbid: [...baseForbid, 'web-landing-layout'],
        genre,
      };
    case 'python-app':
      return {
        composition: 'tool-panel',
        hero: { fullBleed: false, media: 'none', overlaysForbidden: true },
        sections: [{ id: 'main', role: 'main' }],
        typography: { display: 'system-ui', body: 'system-ui', scale: 'utility' },
        palette: { bg: '#ffffff', ink: '#111', accent: '#306998', muted: '#666' },
        motion: [],
        forbid: [...baseForbid],
        genre,
      };
    default:
      return {
        composition: 'split-hero',
        hero: { fullBleed: true, media: 'gradient', overlaysForbidden: true },
        sections: [
          { id: 'nav', role: 'nav' },
          { id: 'hero', role: 'hero', fullBleed: true, headlineKey: 'hero' },
          { id: 'body', role: 'band' },
          { id: 'footer', role: 'footer' },
        ],
        typography: { display: 'system-ui', body: 'system-ui', scale: 'product' },
        palette: { bg: '#111827', ink: '#f9fafb', accent: '#38bdf8', muted: '#9ca3af' },
        motion: ['soft-fade'],
        forbid: [...baseForbid],
        genre: 'generic-web',
      };
  }
}

export function buildProductSpec(opts: {
  brief: string;
  productName: string;
  partial?: Partial<ProductSpec> | null;
}): ProductSpec {
  const inferred = inferBuildGenre(opts.brief, opts.productName);
  const p = opts.partial || {};
  const genre = (p.genre && isGenre(p.genre) ? p.genre : inferred.genre) as BuildGenre;
  const floor = genreFloor(genre, opts.brief);
  const appleish = briefWantsAppleProductBands(opts.brief);
  return {
    productName: String(p.productName || opts.productName || 'Product').trim() || 'Product',
    genre,
    audience: String(
      p.audience
      || (appleish
        ? 'people who want beautiful products'
        : (genre === 'storefront'
          ? `people shopping ${opts.productName}`
          : (genre === 'product-homepage' ? `people shopping for ${opts.productName}` : 'general users'))),
    ).trim(),
    pageMap: Array.isArray(p.pageMap) && p.pageMap.length
      ? p.pageMap.map(String).slice(0, 8)
      : floor.sections.map((s) => s.id),
    mustHave: Array.isArray(p.mustHave) && p.mustHave.length
      ? p.mustHave.map(String).slice(0, 16)
      : defaultMustHave(genre, opts.productName),
    mustNot: Array.isArray(p.mustNot) && p.mustNot.length
      ? p.mustNot.map(String).slice(0, 16)
      : [...floor.forbid.slice(0, 8)],
    referenceBar: String(p.referenceBar || defaultReferenceBar(genre)).trim(),
    kind: p.kind || inferred.kind,
  };
}

function isGenre(v: string): v is BuildGenre {
  return /^(?:product-homepage|storefront|cafe-local|saas-landing|arcade-game|utility-tool|desktop-app|cli-tool|python-app|generic-web)$/.test(v);
}

function defaultMustHave(genre: BuildGenre, name: string): string[] {
  const n = name || 'brand';
  switch (genre) {
    case 'storefront':
      return [
        `${n} sticky nav with cart badge`,
        'full-bleed brand hero',
        'filter/category bar',
        '8–12 product cards with type/origin/notes/price',
        'working qty ± cart + line items + totals',
        'demo checkout / purchase confirm',
        'footer',
      ];
    case 'product-homepage':
      return [`${n} wordmark in thin nav`, 'full-bleed product hero', '3+ product bands', 'high-contrast CTAs', 'footer links'];
    case 'cafe-local':
      return ['brand hero photo', 'menu section', 'hours/visit', 'primary CTA'];
    case 'arcade-game':
      return ['playable canvas loop', 'HUD score', 'start/restart'];
    case 'cli-tool':
      return ['README usage', 'entry script', 'help flag'];
    default:
      return ['clear brand', 'primary CTA', 'readable type hierarchy'];
  }
}

function defaultReferenceBar(genre: BuildGenre): string {
  switch (genre) {
    case 'storefront':
      return 'specialty retail storefront — catalog grid, filters, rich product metadata, cart with qty, demo checkout (not a marketing one-pager)';
    case 'product-homepage': return 'premium product homepage — full-bleed bands, brand-first (not an Apple replica unless asked)';
    case 'cafe-local': return 'neighborhood cafe marketing site — warm, photographic';
    case 'saas-landing': return 'modern SaaS landing — split hero, feature grid';
    case 'arcade-game': return 'classic playable browser arcade';
    case 'utility-tool': return 'clean utility tool UI';
    case 'desktop-app': return 'native-feeling desktop chrome';
    case 'cli-tool': return 'polished CLI with --help';
    default: return 'premium intentional web product';
  }
}

/** Merge LLM JSON onto genre floor (floor wins on forbid + composition defaults). */
export function mergeLayoutContract(
  floor: LayoutContract,
  partial: Partial<LayoutContract> | null | undefined,
): LayoutContract {
  if (!partial || typeof partial !== 'object') return floor;
  const sections = Array.isArray(partial.sections) && partial.sections.length
    ? partial.sections.map((s, i) => ({
        id: String(s?.id || floor.sections[i]?.id || `s${i}`),
        role: (s?.role || floor.sections[i]?.role || 'band') as LayoutSection['role'],
        fullBleed: Boolean(s?.fullBleed ?? floor.sections[i]?.fullBleed),
        headlineKey: s?.headlineKey || floor.sections[i]?.headlineKey,
      }))
    : floor.sections;
  return {
    composition: partial.composition || floor.composition,
    hero: {
      fullBleed: partial.hero?.fullBleed ?? floor.hero.fullBleed,
      media: partial.hero?.media || floor.hero.media,
      overlaysForbidden: partial.hero?.overlaysForbidden ?? floor.hero.overlaysForbidden,
    },
    sections,
    typography: {
      display: partial.typography?.display || floor.typography.display,
      body: partial.typography?.body || floor.typography.body,
      scale: partial.typography?.scale || floor.typography.scale,
    },
    palette: {
      bg: partial.palette?.bg || floor.palette.bg,
      ink: partial.palette?.ink || floor.palette.ink,
      accent: partial.palette?.accent || floor.palette.accent,
      muted: partial.palette?.muted || floor.palette.muted,
    },
    motion: Array.isArray(partial.motion) && partial.motion.length ? partial.motion.map(String) : floor.motion,
    forbid: [...new Set([...(partial.forbid || []).map(String), ...floor.forbid])],
    genre: floor.genre,
  };
}

/**
 * When the user references apple.com (or similar) for look/feel while building
 * another product (coffee shop, etc.), promote composition to the reference recipe
 * without changing the product genre / must-haves.
 */
/** Retired — layoutReference recipes must not reshape contracts on create. */
export function applyLayoutReference(_brief: string, contract: LayoutContract): LayoutContract {
  return contract;
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function defaultCopyPack(spec: ProductSpec, contract: LayoutContract): CopyPack {
  const brand = spec.productName;
  const productHomepage = contract.genre === 'product-homepage' || spec.genre === 'product-homepage';
  const appleBands = contract.sections.some((s) => /^(?:mac|ipad|watch|airpods|iphone)$/i.test(s.id));
  const bandCopy: Record<string, { title: string; body: string }> = appleBands
    ? {
      mac: { title: 'Mac', body: 'Mind-blowing. Head-turning.' },
      ipad: { title: 'iPad', body: 'Lovable. Drawable. Magical.' },
      watch: { title: 'Watch', body: 'Smarter. Brighter. Mightier.' },
      airpods: { title: 'AirPods', body: 'Sound that surrounds you.' },
      iphone: { title: 'iPhone', body: 'Built for what matters most.' },
      hero: { title: brand, body: 'The best products. Full-bleed. Brand first.' },
    }
    : {
      hero: { title: brand, body: `${brand} — designed for how you actually live.` },
      'feature-a': { title: 'Built for the job', body: 'Real performance, not brochure fluff.' },
      'feature-b': { title: 'Quiet confidence', body: 'Refined in every detail you touch.' },
      'feature-c': { title: 'Form that lasts', body: 'Materials and lines you notice every day.' },
      specs: { title: 'Specs that matter', body: 'Clear numbers. No filler rows.' },
    };
  const genericBandTitles = ['Signature strength', 'Everyday ease', 'Designed detail', 'Why it wins'];
  const sections: CopyPack['sections'] = {};
  for (const s of contract.sections) {
    if (s.role === 'nav' || s.role === 'footer') continue;
    const preset = bandCopy[s.id.toLowerCase()];
    if (productHomepage && preset) {
      sections[s.id] = preset;
      continue;
    }
    // Never ship "Band 1" as a customer-facing title — and never invent Mac/iPad for non-Apple brands.
    const rawTitle = s.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const bandIdx = Object.keys(sections).length;
    const title = /^Band\s*\d+$/i.test(rawTitle) && productHomepage
      ? (appleBands
        ? (['Mac', 'iPad', 'Watch', 'AirPods'][bandIdx] || brand)
        : (genericBandTitles[bandIdx] || `${brand} ${bandIdx + 1}`))
      : (s.role === 'hero' ? brand : rawTitle);
    sections[s.id] = {
      title,
      body: s.role === 'hero'
        ? (productHomepage
          ? (appleBands ? `The latest from ${brand} — made for everyday.` : `${brand} — a clearer product story.`)
          : `Designed for ${spec.audience}.`)
        : (productHomepage ? `Explore ${title}.` : `Explore ${brand} — ${s.id}.`),
    };
  }
  return {
    brand,
    headline: brand,
    support: productHomepage
      ? (appleBands
        ? `${brand} products, staged simply — space to breathe.`
        : `A singular ritual for how you actually live — made by ${brand}.`)
      : `Built for ${spec.audience}.`,
    ctas: contract.genre === 'arcade-game' ? ['Play', 'Restart'] : ['Learn more', 'Buy'],
    sections,
  };
}

export function mergeCopyPack(base: CopyPack, partial: Partial<CopyPack> | null | undefined): CopyPack {
  if (!partial) return base;
  return {
    brand: String(partial.brand || base.brand),
    headline: String(partial.headline || base.headline),
    support: String(partial.support || base.support),
    ctas: Array.isArray(partial.ctas) && partial.ctas.length ? partial.ctas.map(String).slice(0, 6) : base.ctas,
    sections: { ...base.sections, ...(partial.sections || {}) },
  };
}

/** Prompt block craft must implement. */
export function formatEnsembleBriefBlock(
  spec: ProductSpec,
  contract: LayoutContract,
  copy: CopyPack,
): string {
  return [
    '## ProductSpec (locked — do not drift)',
    JSON.stringify(spec, null, 2),
    '',
    '## LayoutContract (implement exactly)',
    JSON.stringify(contract, null, 2),
    '',
    '## CopyPack (use these strings — no lorem/Sample)',
    JSON.stringify(copy, null, 2),
    '',
    'CRAFT RULES:',
    `- Composition: ${contract.composition}`,
    `- Hero fullBleed=${contract.hero.fullBleed}; media=${contract.hero.media}; overlaysForbidden=${contract.hero.overlaysForbidden}`,
    `- FORBIDDEN: ${contract.forbid.join(', ')}`,
    contract.genre === 'storefront'
      ? '- STOREFRONT: emit src/App.tsx + src/App.css AND optional src/data/products.ts + src/components/*.tsx (ProductCard, CartDrawer, FilterBar).'
      : '- Put UI in src/App.jsx + src/App.css (or kind-appropriate entry). No absolute icon-rail / brand-rail overlays.',
    contract.genre === 'storefront'
      ? '- Catalog: ≥8 products with {id,name,type,origin?,age?,abv?,notes,price}. Filters by type. Qty ± cart + checkout demo. Optional detail view.'
      : '- Use CopyPack headlines/CTAs verbatim where possible.',
    `- Palette CSS variables: --bg ${contract.palette.bg}; --ink ${contract.palette.ink}; --accent ${contract.palette.accent}; --muted ${contract.palette.muted}`,
  ].join('\n');
}

/** Score a craft against the storefront contract (catalog depth + cart + filters). */
export function scoreStorefrontContract(
  files: Record<string, string>,
  opts?: { brief?: string },
): QualityScore {
  const reasons: string[] = [];
  let score = 100;
  const app = `${files['src/App.tsx'] || files['src/App.jsx'] || ''}\n${files['src/data/products.ts'] || ''}\n${
    Object.entries(files)
      .filter(([k]) => /src\/components\//i.test(k))
      .map(([, v]) => v)
      .join('\n')
  }`;
  const css = files['src/App.css'] || '';
  const brief = String(opts?.brief || '');
  // Accept TS object literals and JSON-style keys from src/data/products.ts.
  const productBlocks = (app.match(/["']?(?:id|name)["']?\s*:\s*['"`][^'"`]+['"`]/g) || []).length;
  const priceHits = (app.match(/["']?price["']?\s*:\s*\d+/g) || []).length;
  const hasCart = /\b(?:setCart|addToCart|add-to-cart)\b/i.test(app) && /Add to cart/i.test(app);
  const hasQty = /\bqty\b|quantity|setQty|qty\s*[±+\-]/i.test(app);
  const hasCheckout = /\b(?:Purchase|checkout|Order placed|placeOrder)\b/i.test(app);
  const hasFilters = /\b(?:filter|category|type)\b/i.test(app)
    && (/\bsetFilter\b|\bactiveType\b|\bAll\b/.test(app) || /role=["'](?:tablist|toolbar)/i.test(app));
  const hasMeta = /\b(?:origin|age|abv|notes|tasting)\b/i.test(app);
  const hasGrid = /product-grid|product-card|catalog/i.test(`${app}\n${css}`);
  const hasNavCart = /Cart\s*\(|cart-btn|cart badge/i.test(app);
  const thinSku = priceHits > 0 && priceHits < 6;

  if (!hasNavCart) { reasons.push('storefront missing sticky nav cart badge'); score -= 15; }
  if (!hasGrid) { reasons.push('storefront missing product grid/cards'); score -= 20; }
  if (priceHits < 6) { reasons.push('storefront needs ≥6 priced products'); score -= 25; }
  if (thinSku) { reasons.push('catalog too thin for specialty retail'); score -= 10; }
  if (!hasMeta && /\b(?:liquor|spirit|whiskey|origin|age|notes)\b/i.test(brief)) {
    reasons.push('liquor/shop brief missing origin/age/notes metadata');
    score -= 15;
  }
  if (!hasFilters) { reasons.push('storefront missing filter/category controls'); score -= 12; }
  if (!hasCart) { reasons.push('storefront missing working add-to-cart state'); score -= 25; }
  if (!hasQty) { reasons.push('storefront missing quantity controls'); score -= 15; }
  if (!hasCheckout) { reasons.push('storefront missing purchase/checkout path'); score -= 15; }
  if (productBlocks < 8 && priceHits < 8) {
    reasons.push('prefer 8+ catalog entries with real attributes');
    score -= 8;
  }
  if (/ready when you are|Browse what is open|Core["'].*Day["']/i.test(app)) {
    reasons.push('booking Core/Day/Reserve stub forbidden on storefront');
    score -= 40;
  }
  score = Math.max(0, score);
  return { ok: reasons.length === 0 && score >= 70, score, reasons };
}

function hexLuminance(hex: string): number | null {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Deterministic layout score — blocks Ready on AppleHome-class failures. */
export function scoreLayoutQuality(
  files: Record<string, string>,
  opts: { brief?: string; spec?: ProductSpec | null; contract?: LayoutContract | null },
): QualityScore {
  const reasons: string[] = [];
  let score = 100;
  const app = files['src/App.jsx'] || files['src/App.tsx'] || files['index.html'] || '';
  const css = `${files['src/App.css'] || ''}\n${files['src/index.css'] || ''}`;
  const blob = `${app}\n${css}`;
  const brief = String(opts.brief || '');
  const spec = opts.spec || buildProductSpec({ brief, productName: '' });
  const contract = opts.contract || genreFloor(spec.genre, opts.brief);
  const marketing = /product-homepage|cafe-local|saas-landing|generic-web/.test(spec.genre);
  const storefront = spec.genre === 'storefront' || contract.genre === 'storefront';
  const utilityBrief = /\b(?:todo|task\s*list|tip\s*(?:calc|calculator|wise)|checklist|counter|timer|notepad)\b/i.test(brief);

  if (storefront) {
    const shop = scoreStorefrontContract(files, { brief });
    for (const r of shop.reasons) reasons.push(r);
    score = Math.min(score, shop.score);
    // Design bar is soft here — hard design score lives in lintOriginalCreateQuality / repair.
    if (!files['src/data/products.ts'] && shop.score < 90) {
      reasons.push('storefront missing src/data/products.ts catalog module');
      score -= 10;
    }
  }

  if ((marketing || briefForbidsAbsoluteRails(brief)) && !utilityBrief) {
    // Penalize only when the App actually mounts a rail — dead CSS from brand wiring is noise.
    if (/className=["'][^"']*\bicon-rail\b/i.test(app)) {
      reasons.push('absolute icon-rail overlays product UI');
      score -= 35;
    }
    if (/className=["'][^"']*\bbrand-rail\b/i.test(app)) {
      reasons.push('absolute brand-rail overlays product UI');
      score -= 30;
    }
  }

  if (contract.hero.fullBleed || contract.composition === 'full-bleed-bands') {
    const phoneColumn = (
      /\.(?:app|site)\b[\s\S]{0,320}\bjustify-content\s*:\s*center\b/i.test(css)
      && /\.(?:app|site)\b[\s\S]{0,320}\balign-items\s*:\s*center\b/i.test(css)
    );
    // Bare min-height:100vh on a centered .app is NOT full-bleed.
    const hasFullBleed = !phoneColumn && (
      /100vw|full[- ]?bleed|product-band|className=["'][^"']*\b(?:hero|band|stage)\b/i.test(blob)
      || /width:\s*100%[^;]*;\s*min-height:\s*(?:80|90|100)vh/i.test(css)
      || (/min-height:\s*100vh/i.test(css)
        && /className=["'][^"']*\b(?:hero|band|site)\b/i.test(app)
        && !phoneColumn)
    );
    const cardGridHero = /className=["'][^"']*\b(?:product-card|cards?|grid)\b/i.test(app)
      && !/className=["'][^"']*\b(?:hero|product-band|full-bleed)\b/i.test(app)
      && app.length < 4500;
    if (!hasFullBleed && (spec.genre === 'product-homepage' || storefront)) {
      reasons.push(storefront
        ? 'storefront missing full-bleed brand hero above the catalog'
        : 'product homepage missing full-bleed hero / bands');
      score -= 25;
    }
    if (phoneColumn && (spec.genre === 'product-homepage' || storefront)) {
      reasons.push(storefront
        ? 'storefront is a centered phone-column — not a retail layout'
        : 'product homepage is a centered phone-column — not full-bleed');
      score -= 30;
    }
    // Card grid as first viewport is wrong for marketing homepages — OK for storefronts after hero.
    if (cardGridHero && spec.genre === 'product-homepage' && !storefront) {
      reasons.push('card grid used as first viewport instead of full-bleed bands');
      score -= 30;
    }
  }

  // Cream + low-contrast dark cards (AppleHome failure mode)
  if (/#f4f1ea|#faf7f2|#f5f0e8|cream|off-white/i.test(css) && /background(?:-color)?\s*:\s*#(?:1[0-9a-f]{5}|2[0-9a-f]{5}|333|222)/i.test(css)) {
    if (/color\s*:\s*#(?:1[0-9a-f]{5}|2[0-9a-f]{5}|333)/i.test(css)) {
      reasons.push('low-contrast product titles (dark on dark / mute on cream)');
      score -= 20;
    }
  }

  const bgLum = hexLuminance(contract.palette.bg);
  const inkLum = hexLuminance(contract.palette.ink);
  if (bgLum != null && inkLum != null && Math.abs(bgLum - inkLum) < 0.25) {
    reasons.push('contract palette contrast too low');
    score -= 10;
  }

  if (/left:\s*0[^;]*;\s*width:\s*(?:48|56|64|72|80)px|black\s+vertical|icon-rail--top-left/i.test(css)
    && /background(?:-color)?\s*:\s*#000/i.test(css)) {
    reasons.push('left black strip / overlapping absolute stack');
    score -= 25;
  }

  if (/images\.unsplash\.com\/photo-(?:1441974231531|1506905925346|1470071459604|1469474968028)/i.test(blob)) {
    reasons.push('banned cinema stock Unsplash hero');
    score -= 20;
  }

  // Stub-copy gate is for marketing / product-homepage craft. Utility apps (todo, tip,
  // calculator) often leave "Built for general users" in the footer — heal, don't fail-closed.
  const utilityApp = /\b(?:todo|task\s*list|tip\s*calc|calculator|counter|timer|notepad|checklist)\b/i.test(`${brief}\n${spec.genre || ''}`)
    || /(?:todo|tip|utility|tool|checklist)/i.test(String(spec.genre || ''));
  if (!utilityApp && /\b(?:lorem ipsum|Sample text|placeholder copy|TODO copy|Built for general users|Band\s*[1-4])\b/i.test(app)) {
    reasons.push('placeholder / stub copy in App (Band N or general users)');
    score -= 25;
  }

  // Toy tablet SVG / CSS bezel with home-button circle — never Ready for marketing sites.
  if (marketing || spec.genre === 'product-homepage') {
    if (/circle[^>]*(?:cy|r)=|home[- ]?button|border(?:-width)?\s*:\s*(?:1[0-9]|2\d)px[^;]*border-radius\s*:\s*(?:3|4)\d/i.test(blob)
      && /rx=["']?(?:36|46|48)|rounded-\[1\.6rem\]|device[- ]?(?:frame|bezel|shell)/i.test(blob)) {
      reasons.push('toy tablet / device-bezel hero instead of product stage');
      score -= 35;
    }
    if (/hsl\(\d+,\s*42%,\s*62%\)/i.test(blob) && /circle\s+cx=/i.test(blob)) {
      reasons.push('legacy svgHero tablet chrome still in assets');
      score -= 35;
    }
  }

  if (contract.forbid.includes('cream-terracotta-serif-cluster')) {
    // True cluster = cream page background + terracotta accent + serif display.
    // Do NOT trip on --ink: #f4f1ea (warm light text on a dark product homepage).
    const creamBg = /(?:--bg|background(?:-color)?)\s*:\s*#(?:f4f1ea|faf7f2|f5f0e8)\b/i.test(css)
      || /background(?:-color)?\s*:\s*(?:cream|off-white)\b/i.test(css);
    const terracotta = /(?:--accent|color|background(?:-color)?)\s*:\s*#e07a5f\b/i.test(css)
      || /\bterracotta\b/i.test(css);
    const serifDisplay = /(?:--display|font-family)\s*:[^;]*(?:Georgia|Playfair|Cormorant|Fraunces)/i.test(css);
    if (creamBg && terracotta && serifDisplay && spec.genre === 'product-homepage') {
      reasons.push('AI cream + terracotta + serif cluster on product homepage');
      score -= 15;
    }
  }

  if (contract.forbid.includes('purple-on-white-ai-gradient')) {
    if (/purple|#7c3aed|#8b5cf6|indigo/i.test(css) && /#fff(?:fff)?|white/i.test(css) && /linear-gradient/i.test(css)) {
      reasons.push('generic purple-on-white AI gradient look');
      score -= 12;
    }
  }

  score = Math.max(0, score);
  return { ok: reasons.length === 0 && score >= 70, score, reasons };
}

/** Non-visual Ready gates (build, playable, truncated JSX). */
export function scoreFunctionalReady(
  files: Record<string, string>,
  opts: { brief?: string; spec?: ProductSpec | null },
): QualityScore {
  const reasons: string[] = [];
  let score = 100;
  const app = files['src/App.jsx'] || files['src/App.tsx'] || '';
  const pkg = files['package.json'] || '';
  const html = files['index.html'] || '';
  const brief = String(opts.brief || '');
  const spec = opts.spec || buildProductSpec({ brief, productName: '' });

  if (spec.kind === 'web' || spec.kind === 'game' || spec.kind === 'desktop') {
    if (pkg && !/"vite"|"react"/i.test(pkg) && /\.jsx|\.tsx/.test(Object.keys(files).join('\n'))) {
      reasons.push('package.json missing vite/react for SPA');
      score -= 20;
    }
    if (!html && Object.keys(files).some((p) => /src\/App\.(jsx|tsx)$/.test(p))) {
      reasons.push('missing index.html');
      score -= 15;
    }
  }

  if (/<[A-Za-z][^>]*$/.test(app.trim()) || /\{\s*$/.test(app.trim()) || /<\/[A-Za-z]+>\s*$/.test(app) === false && app.length > 200 && /return\s*\(/.test(app) && !/export\s+default/.test(app)) {
    // Truncation heuristics
    if (app.length > 80 && (!/export\s+default/i.test(app) || /<(?:div|section|main)[^>]*$/m.test(app))) {
      reasons.push('App source looks truncated mid-write');
      score -= 40;
    }
  }

  if (spec.genre === 'arcade-game' || /\b(?:playable|arcade|canvas\s+game)\b/i.test(brief)) {
    if (!/<canvas\b|getContext\s*\(\s*['"]2d['"]|requestAnimationFrame/i.test(app)) {
      reasons.push('arcade brief missing playable canvas loop');
      score -= 35;
    }
  }

  // Nav hrefs that point nowhere
  const hrefs = [...app.matchAll(/href=["']#([^"']+)["']/g)].map((m) => m[1]);
  for (const h of hrefs.slice(0, 8)) {
    if (h && h !== '/' && !new RegExp(`id=["']${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(app)
      && !new RegExp(`['"]${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'i').test(app)) {
      // soft — many SPAs use hash routes without ids
    }
  }

  // "3+ product bands" in default mustHave means feature sections — not only Apple class names.
  if (spec.mustHave.some((m) => /product\s+stage|product\s+band/i.test(m))) {
    const css = files['src/App.css'] || '';
    const blob = `${app}\n${css}`;
    const hasNamedBands = /product-band|product-stage|feature-band|\/heroes\//i.test(blob);
    const sectionCount = (app.match(/<(?:section|article)\b/gi) || []).length
      + (app.match(/className=["'][^"']*\b(?:band|stage|feature)\b/gi) || []).length;
    const hasSvgOrImg = /<(?:svg|img)\b/i.test(app) || /background-image\s*:/i.test(css);
    if (!hasNamedBands && sectionCount < 2 && !hasSvgOrImg) {
      reasons.push('Spec requires product stages/bands but none found');
      score -= 20;
    }
  }

  // Wrong-product shell: canned booking cards when the ask was not a booking/reserve product.
  const bookingShell = /\bCore\b/.test(app)
    && /\bDay\b/.test(app)
    && /\bReserve\b/.test(app)
    && /ready when you are|Browse what is open|Primary offer for this brief/i.test(app);
  const askIsBooking = /\b(?:book|reserv|harbor|marina|boat|skiff|cnc|makerspace)\b/i.test(brief);
  if (bookingShell && !askIsBooking) {
    reasons.push('App is a booking/reserve shell that does not match the user ask');
    score -= 45;
  }

  score = Math.max(0, score);
  return { ok: reasons.length === 0 && score >= 70, score, reasons };
}

/** CSS token fill from contract — replaces cream-bias style hop. */
export function cssTokensFromContract(contract: LayoutContract): string {
  return `/* NOVA layout contract tokens */
:root {
  --bg: ${contract.palette.bg};
  --ink: ${contract.palette.ink};
  --accent: ${contract.palette.accent};
  --muted: ${contract.palette.muted};
  --display: ${contract.typography.display};
  --body: ${contract.typography.body};
}
html, body, #root {
  margin: 0;
  min-height: 100%;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--body);
}
`;
}

export function shipReadyLabel(layout: QualityScore, functional: QualityScore): string {
  if (layout.ok && functional.ok) return 'Ready to ship';
  if (!layout.ok && !functional.ok) return 'Blocked — layout and functional gates';
  if (!layout.ok) return 'Blocked — layout quality';
  return 'Blocked — functional gates';
}
