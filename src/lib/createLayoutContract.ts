import { detectLayoutReference } from '@/lib/layoutReference';

/**
 * ProductSpec + LayoutContract + CopyPack + genre floors + quality scores.
 * Free models fill slots; Nova owns composition taste and Ready gates.
 */

export type BuildGenre =
  | 'product-homepage'
  | 'cafe-local'
  | 'saas-landing'
  | 'arcade-game'
  | 'utility-tool'
  | 'desktop-app'
  | 'cli-tool'
  | 'python-app'
  | 'generic-web';

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
  role: 'nav' | 'hero' | 'band' | 'grid' | 'footer' | 'canvas' | 'sidebar' | 'main';
  fullBleed?: boolean;
  headlineKey?: string;
};

export type LayoutContract = {
  composition: 'full-bleed-bands' | 'split-hero' | 'single-canvas' | 'app-chrome' | 'cli-chrome' | 'tool-panel';
  hero: {
    fullBleed: boolean;
    media: 'product-stage' | 'photo' | 'gradient' | 'canvas' | 'none';
    overlaysForbidden: boolean;
  };
  sections: LayoutSection[];
  typography: {
    display: string;
    body: string;
    scale: 'editorial' | 'product' | 'utility';
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
  if (
    /\bapple\.com\b/i.test(t)
    || (/\b(?:iphone|macbook|ipad|airpods|apple\s+watch|product\s+band|full[- ]?bleed)\b/i.test(t)
      && /\b(?:homepage|landing|store|product)\b/i.test(t))
  ) {
    return { genre: 'product-homepage', kind: 'web' };
  }
  if (/\b(?:cafe|coffee|bakery|bistro|restaurant|roaster)\b/i.test(t)) {
    return { genre: 'cafe-local', kind: 'web' };
  }
  if (/\b(?:saas|dashboard\s+landing|pricing\s+page|sign[- ]?up|waitlist)\b/i.test(t)) {
    return { genre: 'saas-landing', kind: 'web' };
  }
  if (/\b(?:calculator|tracker|utility|tool\s+ui|converter)\b/i.test(t)) {
    return { genre: 'utility-tool', kind: 'web' };
  }
  if (/\b(?:landing|marketing|homepage|website|product\s+site)\b/i.test(t)) {
    return { genre: 'saas-landing', kind: 'web' };
  }
  return { genre: 'generic-web', kind: 'web' };
}

/** True when absolute icon/brand rails would destroy the layout. */
export function briefForbidsAbsoluteRails(brief: string): boolean {
  const { genre } = inferBuildGenre(brief);
  if (genre === 'product-homepage' || genre === 'cafe-local' || genre === 'saas-landing') return true;
  const t = String(brief || '');
  return /\b(?:full[- ]?bleed|apple\.com|product\s+band|marketing|landing|hero)\b/i.test(t)
    && !/\b(?:icon[- ]?rail|toolbar\s+icons?\s+top[- ]?left)\b/i.test(t);
}

export function genreFloor(genre: BuildGenre): LayoutContract {
  const baseForbid = [...FORBID_COMMON];
  switch (genre) {
    case 'product-homepage':
      return {
        composition: 'full-bleed-bands',
        hero: { fullBleed: true, media: 'product-stage', overlaysForbidden: true },
        sections: [
          { id: 'nav', role: 'nav' },
          { id: 'hero', role: 'hero', fullBleed: true, headlineKey: 'hero' },
          { id: 'mac', role: 'band', fullBleed: true },
          { id: 'ipad', role: 'band', fullBleed: true },
          { id: 'watch', role: 'band', fullBleed: true },
          { id: 'airpods', role: 'band', fullBleed: true },
          { id: 'footer', role: 'footer' },
        ],
        typography: { display: 'SF Pro Display, Helvetica Neue, system-ui', body: 'SF Pro Text, system-ui, sans-serif', scale: 'product' },
        palette: { bg: '#000000', ink: '#f5f5f7', accent: '#2997ff', muted: '#a1a1a6' },
        motion: ['subtle-fade-in', 'band-reveal'],
        forbid: [
          ...baseForbid,
          'card-grid-as-first-viewport',
          'inset-hero-card',
          'low-contrast-product-titles',
          'left-black-strip-nav',
          'band-n-placeholder-titles',
          'toy-tablet-hero-bezel',
          'built-for-general-users-copy',
        ],
        genre,
      };
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
  const floor = genreFloor(genre);
  const appleish = /\bapple\.com\b|\biphone\b|\bairpods\b/i.test(`${opts.brief}\n${opts.productName}`)
    && /\b(?:product\s+band|full[- ]?bleed|thin\s+nav|homepage)\b/i.test(opts.brief);
  return {
    productName: String(p.productName || opts.productName || 'Product').trim() || 'Product',
    genre,
    audience: String(
      p.audience
      || (appleish || genre === 'product-homepage'
        ? 'people who want beautiful products'
        : 'general users'),
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
  return /^(?:product-homepage|cafe-local|saas-landing|arcade-game|utility-tool|desktop-app|cli-tool|python-app|generic-web)$/.test(v);
}

function defaultMustHave(genre: BuildGenre, name: string): string[] {
  const n = name || 'brand';
  switch (genre) {
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
    case 'product-homepage': return 'apple.com product homepage — full-bleed bands, brand-first';
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
export function applyLayoutReference(brief: string, contract: LayoutContract): LayoutContract {
  const recipe = detectLayoutReference(brief).recipe;
  if (!recipe) return contract;
  return {
    ...contract,
    composition: recipe.composition,
    hero: {
      ...contract.hero,
      fullBleed: recipe.heroFullBleed,
      overlaysForbidden: recipe.overlaysForbidden,
    },
    typography: {
      display: recipe.typography.display,
      body: recipe.typography.body,
      scale: recipe.typography.scale,
    },
    motion: [...new Set([...recipe.motion, ...contract.motion])],
    forbid: [...new Set([...contract.forbid, ...recipe.forbidExtra])],
  };
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
  const bandCopy: Record<string, { title: string; body: string }> = {
    mac: { title: 'Mac', body: 'Mind-blowing. Head-turning.' },
    ipad: { title: 'iPad', body: 'Lovable. Drawable. Magical.' },
    watch: { title: 'Watch', body: 'Smarter. Brighter. Mightier.' },
    airpods: { title: 'AirPods', body: 'Sound that surrounds you.' },
    iphone: { title: 'iPhone', body: 'Built for what matters most.' },
    hero: { title: brand, body: 'The best products. Full-bleed. Brand first.' },
  };
  const sections: CopyPack['sections'] = {};
  for (const s of contract.sections) {
    if (s.role === 'nav' || s.role === 'footer') continue;
    const preset = bandCopy[s.id.toLowerCase()];
    if (productHomepage && preset) {
      sections[s.id] = preset;
      continue;
    }
    // Never ship "Band 1" as a customer-facing title.
    const rawTitle = s.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const title = /^Band\s*\d+$/i.test(rawTitle) && productHomepage
      ? (['Mac', 'iPad', 'Watch', 'AirPods'][Object.keys(sections).length] || brand)
      : (s.role === 'hero' ? brand : rawTitle);
    sections[s.id] = {
      title,
      body: s.role === 'hero'
        ? (productHomepage ? 'The best products. Full-bleed stages. Huge type.' : `Designed for ${spec.audience}.`)
        : (productHomepage ? `Explore ${title}.` : `Explore ${brand} — ${s.id}.`),
    };
  }
  return {
    brand,
    headline: brand,
    support: productHomepage
      ? 'Thin nav. Full-bleed product bands. Huge type. Lots of whitespace.'
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
    '- Put UI in src/App.jsx + src/App.css (or kind-appropriate entry). No absolute icon-rail / brand-rail overlays.',
    '- Use CopyPack headlines/CTAs verbatim where possible.',
    `- Palette CSS variables: --bg ${contract.palette.bg}; --ink ${contract.palette.ink}; --accent ${contract.palette.accent}; --muted ${contract.palette.muted}`,
  ].join('\n');
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
  const contract = opts.contract || genreFloor(spec.genre);
  const marketing = /product-homepage|cafe-local|saas-landing|generic-web/.test(spec.genre);

  if (marketing || briefForbidsAbsoluteRails(brief)) {
    if (/className=["'][^"']*\bicon-rail\b/i.test(app) || /\.icon-rail\s*\{[^}]*position\s*:\s*absolute/i.test(css)) {
      reasons.push('absolute icon-rail overlays product UI');
      score -= 35;
    }
    if (/className=["'][^"']*\bbrand-rail\b/i.test(app) || /\.brand-rail\s*\{[^}]*position\s*:\s*absolute/i.test(css)) {
      reasons.push('absolute brand-rail overlays product UI');
      score -= 30;
    }
  }

  if (contract.hero.fullBleed || contract.composition === 'full-bleed-bands') {
    const hasFullBleed = /100vw|100vh|min-height:\s*100vh|full[- ]?bleed|product-band|className=["'][^"']*\b(?:hero|band|stage)\b/i.test(blob)
      || /width:\s*100%[^;]*;\s*min-height:\s*(?:80|90|100)vh/i.test(css);
    const cardGridHero = /className=["'][^"']*\b(?:product-card|cards?|grid)\b/i.test(app)
      && !/className=["'][^"']*\b(?:hero|product-band|full-bleed)\b/i.test(app)
      && app.length < 4500;
    if (!hasFullBleed && spec.genre === 'product-homepage') {
      reasons.push('product homepage missing full-bleed hero / bands');
      score -= 25;
    }
    if (cardGridHero && spec.genre === 'product-homepage') {
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

  if (/\b(?:lorem ipsum|Sample text|placeholder copy|TODO copy|Built for general users|Band\s*[1-4])\b/i.test(app)) {
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
    if (/#f4f1ea|#e07a5f|terracotta/i.test(css) && /Georgia|Playfair|serif/i.test(css) && spec.genre === 'product-homepage') {
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

  if (spec.mustHave.some((m) => /product\s+stage|product\s+band/i.test(m))
    && !/product-band|product-stage|\/heroes\/|svg/i.test(app + (files['src/App.css'] || ''))) {
    reasons.push('Spec requires product stages/bands but none found');
    score -= 20;
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
