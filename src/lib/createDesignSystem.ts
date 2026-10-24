/**
 * Nova Design Spine — universal quality floor + composition grammar + locked shells.
 * Models fill slots; Nova owns structure. Keywords/site names are optional overlays only.
 */
import type { BuildGenre, CopyPack, LayoutContract, LayoutSection } from '@/lib/createLayoutContract';
import { FLOOR_CLONE_FINGERPRINT_RE, scoreStorefrontContract } from '@/lib/createLayoutContract';
import { scoreStorefrontDesignQuality } from '@/lib/createStorefrontRepair';
import {
  buildProductPlan,
  formatProductPlanBlock,
  inferCreateCompositionFamily,
  scorePlanContract,
  scoreStartingDesignQuality,
} from '@/lib/createProductPlan';
import { formatThinCreateCraftRules, isThinCreatePath, thinBriefWantsDepth } from '@/lib/createThinPath';
import { createIdentityFromBrief, svgHeroDataUrl } from '@/lib/createIdentity';
import { resolveArtifactKind, type ArtifactKind } from '@/lib/createArtifactKind';

export type CompositionFamily =
  | 'marketing-bands'
  | 'catalog-store'
  | 'app-chrome'
  | 'tool-panel'
  | 'game-stage';

export type DesignTone = 'warm' | 'cool' | 'dark' | 'light' | 'neutral';

export type DesignTokens = {
  bg: string;
  ink: string;
  accent: string;
  muted: string;
  display: string;
  body: string;
  tone: DesignTone;
  atmosphere: string;
};

export type DesignBand = { id: string; title: string; body: string };

export type DesignCopySlots = {
  brand: string;
  headline: string;
  support: string;
  ctas: string[];
  bands: DesignBand[];
  navLinks: string[];
};

/** Marketing shell grammar variants — same landmarks, different composition rhythm. */
export type MarketingShellVariant =
  | 'split-editorial'
  | 'stacked-stage'
  | 'asymmetric-rail';

/** Tool-panel layout variants — never ship one tip-card for every utility. */
export type ToolShellVariant =
  | 'card-center'
  | 'split-meter'
  | 'dense-bar';

/** App-chrome layout variants — never ship one LeafNote clone for every notes app. */
export type AppChromeShellVariant =
  | 'sidebar-notes'
  | 'rail-editor'
  | 'stacked-inbox';

export type DesignPlan = {
  family: CompositionFamily;
  tokens: DesignTokens;
  /** Required landmark classNames in App */
  landmarks: string[];
  copy: DesignCopySlots;
  forbid: string[];
  /** Explicit site reference id when user asked (apple/linear) — never required for quality */
  referenceOverlay: string | null;
  genre: BuildGenre;
  /** Per-brand shell rhythm so products do not clone the same Luna look */
  shellVariant: MarketingShellVariant;
  /** Utility layout rhythm (tool-panel only) */
  toolVariant: ToolShellVariant;
  /** tip / todo / generic tool panel */
  toolKind: 'tip' | 'todo' | 'generic';
  /** Software chrome rhythm (app-chrome only) */
  appVariant: AppChromeShellVariant;
  /** Per-create salt so rebuilds never reuse a prior look */
  freshnessKey: string;
};

/** Always-on rules — independent of brand words / site names. Genre-neutral (not marketing-first). */
export const QUALITY_FLOOR = [
  'Ship a complete, welcoming, professional STARTING version of whatever the user asked for — site, app, game, tool, shop, dashboard.',
  'One composition in the first viewport — not a dashboard dump (unless they asked for a dashboard).',
  'Invent the UI from the user brief — any product they ask for. Do not force a tip/todo/notes/marketing/shop preset.',
  'Intentional type pairing (display + body) — no default Inter void.',
  'Atmosphere via CSS when it helps the product — not decorative theater that ignores the ask.',
  'Forbid: absolute icon-rails, card-grid-as-hero (unless they asked for a catalog), floating stickers, cream-terracotta AI look, purple-glow spam, instruction-leak titles, lorem/placeholders.',
  'One job per section; generous whitespace; real interactions when the brief needs them.',
  'Match THIS ask — never default everything to a marketing one-pager.',
] as const;

const FORBID_FLOOR = [
  'absolute-icon-rail',
  'absolute-brand-rail',
  'floating-sticker-overlays',
  'cream-terracotta-serif-cluster',
  'purple-on-white-ai-gradient',
  'lorem-ipsum',
  'sample-placeholder-copy',
  'via.placeholder.com',
  'unsplash-cinema-forest-ocean',
  'card-grid-as-first-viewport',
  'instruction-leak-ui-copy',
  'band-n-placeholder-titles',
];

const LANDMARKS: Record<CompositionFamily, string[]> = {
  'marketing-bands': ['site-nav', 'site-hero', 'band-01', 'band-02', 'band-03', 'site-footer'],
  'catalog-store': ['site-nav', 'site-hero', 'filter-bar', 'product-grid', 'cart-drawer', 'site-footer'],
  'app-chrome': ['app-shell', 'app-sidebar', 'app-main'],
  'tool-panel': ['tool-chrome', 'tool-panel'],
  'game-stage': ['game-hud', 'game-stage'],
};

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Infer job shape — SINGLE OWNER.
 * Always delegates to ProductPlan `inferCreateCompositionFamily` (default app-chrome).
 * Do not fork a marketing-default copy here; that dual-inferrer sabotage is retired.
 */
export function inferCompositionFamily(brief: string, productName = ''): CompositionFamily {
  return inferCreateCompositionFamily(brief, productName);
}

function inferTone(brief: string): DesignTone {
  const t = String(brief || '');
  if (/\b(?:dark|noir|midnight|black|neon|cyber|night)\b/i.test(t)) return 'dark';
  if (/\b(?:warm|coffee|cafe|bakery|amber|terracotta|cozy|cream|latte)\b/i.test(t)) return 'warm';
  if (/\b(?:cool|ice|ocean|sky|mint|frost|glacier|skincare|serum|beauty|spa)\b/i.test(t)) return 'cool';
  if (/\b(?:light|bright|air|clean|white|minimal)\b/i.test(t)) return 'light';
  return 'neutral';
}

/** Stable per-brand (+ optional per-create) seed so products — and rebuilds — do not share one look. */
export function brandDesignSeed(brand: string, brief = '', freshnessKey = ''): number {
  const s = [
    String(brand || '').trim().toLowerCase(),
    String(brief || '').trim().toLowerCase(),
    String(freshnessKey || '').trim().toLowerCase(),
  ].join('\n');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** New salt every create — never bake the same TipWise/LeafNote/Luna look twice. */
export function newDesignFreshnessKey(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function pick<T>(seed: number, items: readonly T[], salt = 0): T {
  return items[(seed + salt * 97) % items.length]!;
}

export function inferShellVariant(brand: string, brief: string): MarketingShellVariant {
  const variants: MarketingShellVariant[] = ['split-editorial', 'stacked-stage', 'asymmetric-rail'];
  return pick(brandDesignSeed(brand, brief), variants, 3);
}

/** Stock spine phrases that made every homepage look like Luna — banned as defaults. */
export const STOCK_SPINE_CLONE_RE =
  /\b(?:The\s+\w+\s+ritual\.?|Form that earns its keep|Made for real rooms|A singular ritual for how you actually live|Skin,?\s*clarified|Skin,?\s*moonlight|Nourish Your Skin|Embrace (?:Your )?Radiance|Scroll to reveal|Everyday ease|Designed detail|Why it wins|Explore Everyday ease|Explore Designed detail|Explore Why it wins)\b/i;

function tokensFor(
  family: CompositionFamily,
  tone: DesignTone,
  brief: string,
  brand: string,
  freshnessKey = '',
): DesignTokens {
  // layoutReference recipes (apple/Linear/cafe) are retired on create — invent from brief only.
  const seed = brandDesignSeed(brand, brief, freshnessKey);

  if (family === 'tool-panel') {
    const accents = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c'] as const;
    return {
      bg: pick(seed, ['#f4f6f8', '#f7f5f2', '#f1f5f9'] as const, 1),
      ink: '#0f172a',
      accent: pick(seed, accents, 2),
      muted: '#64748b',
      display: 'Segoe UI Variable Display, "Segoe UI", system-ui, sans-serif',
      body: 'Segoe UI, system-ui, sans-serif',
      tone: 'light',
      atmosphere: 'panel',
    };
  }
  if (family === 'game-stage') {
    const accents = ['#39ff14', '#ff2d55', '#00e5ff', '#fbbf24'] as const;
    return {
      bg: '#07070c',
      ink: '#f0f0f5',
      accent: pick(seed, accents, 4),
      muted: '#8a8a9a',
      display: 'Segoe UI Variable Display, system-ui, sans-serif',
      body: 'Segoe UI, system-ui, sans-serif',
      tone: 'dark',
      atmosphere: 'stage',
    };
  }
  if (family === 'app-chrome') {
    const accents = ['#6b9fff', '#34d399', '#f472b6', '#fbbf24'] as const;
    return {
      bg: pick(seed, ['#111318', '#0f1419', '#151820'] as const, 5),
      ink: '#e8eaed',
      accent: pick(seed, accents, 6),
      muted: '#9aa0a6',
      display: 'Segoe UI Variable Display, system-ui, sans-serif',
      body: 'Segoe UI, system-ui, sans-serif',
      tone: 'dark',
      atmosphere: 'chrome',
    };
  }
  if (family === 'catalog-store') {
    const liquor = /\b(?:liquor|spirit|whiskey|bourbon|vodka|gin|tequila|rum)\b/i.test(brief);
    return {
      bg: liquor ? '#120c0a' : pick(seed, ['#0f1419', '#101418', '#14110e'] as const, 7),
      ink: liquor ? '#f4ebe2' : '#eef2f6',
      accent: liquor ? '#c9853a' : pick(seed, ['#d4a574', '#c4a574', '#e8b86d'] as const, 8),
      muted: liquor ? '#b7a597' : '#9aa3b2',
      display: 'Fraunces, Georgia, "Times New Roman", serif',
      body: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
      tone: 'dark',
      atmosphere: liquor ? 'bar-amber' : 'retail-stage',
    };
  }

  // marketing-bands — tone + brand seed → unique palette / type / atmosphere
  const displays = [
    'Georgia, "Iowan Old Style", "Times New Roman", serif',
    '"Palatino Linotype", Palatino, Georgia, serif',
    'Georgia, "Times New Roman", Times, serif',
    'Segoe UI Variable Display, "Segoe UI", system-ui, sans-serif',
    '"Segoe UI", "Helvetica Neue", system-ui, sans-serif',
  ] as const;
  const bodies = [
    'Segoe UI, "Helvetica Neue", system-ui, sans-serif',
    'Source Sans 3, "Segoe UI", system-ui, sans-serif',
    '"Segoe UI", system-ui, sans-serif',
  ] as const;

  type Pack = { bg: string; ink: string; accent: string; muted: string; atmosphere: string };
  const packs: Record<DesignTone, readonly Pack[]> = {
    warm: [
      { bg: '#14100e', ink: '#f6efe6', accent: '#d4a574', muted: '#b0a090', atmosphere: 'warm-ember' },
      { bg: '#1a1210', ink: '#f8f1e8', accent: '#e07a45', muted: '#c4a590', atmosphere: 'copper-haze' },
      { bg: '#120e0c', ink: '#efe6d8', accent: '#c9a227', muted: '#a89878', atmosphere: 'amber-wash' },
    ],
    cool: [
      { bg: '#0a0b0c', ink: '#f3f0ea', accent: '#b7c9d6', muted: '#9aa3ad', atmosphere: 'pearl-mist' },
      { bg: '#071018', ink: '#e8f1f6', accent: '#5eb0d8', muted: '#8aa0b0', atmosphere: 'coastal-depth' },
      { bg: '#0b1210', ink: '#eef4f0', accent: '#6fafa0', muted: '#8aa49a', atmosphere: 'sage-glow' },
      { bg: '#0c0e14', ink: '#eef0f8', accent: '#8b9cff', muted: '#9aa0b8', atmosphere: 'violet-mist' },
    ],
    light: [
      { bg: '#f7f8fa', ink: '#111318', accent: '#1a6bff', muted: '#5c6570', atmosphere: 'air-grid' },
      { bg: '#faf7f2', ink: '#1a1510', accent: '#0d9488', muted: '#6b6358', atmosphere: 'paper-sun' },
      { bg: '#f4f1ec', ink: '#16120f', accent: '#c2410c', muted: '#6b5e52', atmosphere: 'clay-light' },
    ],
    dark: [
      { bg: '#050507', ink: '#f4f4f6', accent: '#7eb8ff', muted: '#9a9aaa', atmosphere: 'noir-beam' },
      { bg: '#08060c', ink: '#f2eef8', accent: '#c084fc', muted: '#a090b0', atmosphere: 'violet-stage' },
      { bg: '#060a08', ink: '#eef6f0', accent: '#4ade80', muted: '#8a9a90', atmosphere: 'signal-green' },
    ],
    neutral: [
      { bg: '#0c0f14', ink: '#f2f4f8', accent: '#6eb0ff', muted: '#9aa3b2', atmosphere: 'steel-stage' },
      { bg: '#101210', ink: '#f0f2ec', accent: '#a3b18a', muted: '#9aa094', atmosphere: 'olive-field' },
      { bg: '#12100e', ink: '#f5f0ea', accent: '#e8c4a2', muted: '#a89a8c', atmosphere: 'sand-shadow' },
    ],
  };
  const pack = pick(seed, packs[tone] || packs.neutral, 11);
  return {
    bg: pack.bg,
    ink: pack.ink,
    accent: pack.accent,
    muted: pack.muted,
    display: pick(seed, displays, 12),
    body: pick(seed, bodies, 13),
    tone,
    atmosphere: pack.atmosphere,
  };
}

function defaultBands(brand: string, family: CompositionFamily, brief = '', freshnessKey = ''): DesignBand[] {
  if (family !== 'marketing-bands') return [];
  const seed = brandDesignSeed(brand, brief, freshnessKey);
  const sets: DesignBand[][] = [
    [
      { id: 'band-01', title: `${brand} starts here.`, body: `Open with what ${brand} actually changes — one clear move, no filler.` },
      { id: 'band-02', title: 'Built for the workday.', body: 'Details stay sharp when the light is harsh and the clock is loud.' },
      { id: 'band-03', title: 'Keep what matters.', body: `${brand} stays out of the way until you need it — then it earns the click.` },
    ],
    [
      { id: 'band-01', title: `Meet ${brand} in motion.`, body: `A tight loop: see it, try it, keep going — ${brand} is the through-line.` },
      { id: 'band-02', title: 'Materials that mean it.', body: 'Surface, pace, and finish chosen for this product — not a borrowed lookbook.' },
      { id: 'band-03', title: 'Where it lives.', body: 'Designed for the rooms and screens you already use.' },
    ],
    [
      { id: 'band-01', title: 'First impression, finished.', body: `${brand} leads with clarity — hierarchy, atmosphere, and a real next step.` },
      { id: 'band-02', title: 'Proof in the details.', body: 'Spacing, type, and contrast do the selling. No sticker overlays.' },
      { id: 'band-03', title: 'Ready when you are.', body: `When you are done looking, ${brand} is ready to use.` },
    ],
    [
      { id: 'band-01', title: `Why ${brand}.`, body: 'One job per section. Generous space. Nothing that could belong to any other brand.' },
      { id: 'band-02', title: 'Craft you can feel.', body: 'Accent, type, and motion are tuned to this brief — not a recycled shell.' },
      { id: 'band-03', title: 'From look to use.', body: 'The page is a product preview, not a mood board.' },
    ],
  ];
  return pick(seed, sets, 21).map((b) => ({ ...b }));
}

function familyToGenre(family: CompositionFamily, brief: string): BuildGenre {
  if (family === 'game-stage') return 'arcade-game';
  if (family === 'tool-panel') return 'utility-tool';
  if (family === 'catalog-store') return 'storefront';
  if (family === 'app-chrome') {
    return /\b(?:electron|desktop)\b/i.test(brief) ? 'desktop-app' : 'saas-landing';
  }
  // marketing-bands — prefer product-homepage so full-bleed floors apply
  if (/\b(?:saas|pricing|waitlist|sign[- ]?up)\b/i.test(brief)) return 'saas-landing';
  return 'product-homepage';
}

export function buildDesignPlan(opts: {
  brief: string;
  productName: string;
  copy?: Partial<CopyPack> | null;
  /** Design-hop LayoutContract — palette/type only; never changes family/landmarks. */
  contract?: LayoutContract | null;
  /** Per-create salt — pass the same key across hops in one create job. */
  freshnessKey?: string;
}): DesignPlan {
  const brief = String(opts.brief || '');
  const brand = String(opts.productName || 'Product').trim() || 'Product';
  const freshnessKey = String(opts.freshnessKey || newDesignFreshnessKey());
  const family = inferCompositionFamily(brief, brand);
  const tone = inferTone(brief);
  const seed = brandDesignSeed(brand, brief, freshnessKey);
  const tokens = tokensFor(family, tone, brief, brand, freshnessKey);
  const shellVariant = family === 'marketing-bands'
    ? pick(seed, ['split-editorial', 'stacked-stage', 'asymmetric-rail'] as const, 3)
    : 'split-editorial';
  const toolVariant = pick(seed, ['card-center', 'split-meter', 'dense-bar'] as const, 41);
  const appVariant = pick(seed, ['sidebar-notes', 'rail-editor', 'stacked-inbox'] as const, 42);
  const productPlanForKind = buildProductPlan(brief, brand);
  const toolKind: 'tip' | 'todo' | 'generic' = productPlanForKind.toolKind || 'generic';
  const copyIn = opts.copy || null;
  const supportPool = [
    `${brand} — clear, specific, built for this brief.`,
    `A focused ${family === 'marketing-bands' ? 'product story' : 'tool'} for people who already know what they need.`,
    `Less noise. More ${brand}.`,
    `Made for how you actually use it — not a generic template.`,
  ] as const;
  const defaultSupport = family === 'marketing-bands'
    ? pick(seed, supportPool, 31)
    : family === 'tool-panel'
      ? 'Fast, clear, and ready to use.'
      : family === 'game-stage'
        ? 'Press play.'
        : 'Your workspace.';
  const headlinePool = [
    `${brand}.`,
    `${brand}, ready.`,
    `This is ${brand}.`,
    `Start with ${brand}.`,
  ] as const;
  const headlineFallback = family === 'marketing-bands' ? pick(seed, headlinePool, 32) : brand;
  const bands = defaultBands(brand, family, brief, freshnessKey).map((b) => {
    const fromPack = copyIn?.sections?.[b.id];
    if (!fromPack) return b;
    return {
      id: b.id,
      title: scrubLeakCopy(String(fromPack.title || ''), b.title),
      body: scrubLeakCopy(String(fromPack.body || ''), b.body),
    };
  });
  let headline = scrubLeakCopy(String(copyIn?.headline || ''), headlineFallback);
  let support = scrubLeakCopy(String(copyIn?.support || ''), defaultSupport);
  // Never keep stock clone copy even if a hop/model re-emits it.
  if (STOCK_SPINE_CLONE_RE.test(headline)) headline = headlineFallback;
  if (STOCK_SPINE_CLONE_RE.test(support)) support = defaultSupport;
  const defaultCtas = family === 'game-stage'
    ? ['Play', 'Restart']
    : family === 'tool-panel'
      ? ['Calculate', 'Reset']
      : [pick(seed, [`Start with ${brand}`, `Try ${brand}`, `Open ${brand}`, `Explore ${brand}`] as const, 33)];
  const ctas = (Array.isArray(copyIn?.ctas) && copyIn!.ctas.length
    ? copyIn!.ctas.map(String).slice(0, 4)
    : defaultCtas
  ).map((c, i) => scrubLeakCopy(c, defaultCtas[i] || `Open ${brand}`));

  const plan: DesignPlan = {
    family,
    tokens,
    landmarks: [...LANDMARKS[family]],
    copy: {
      brand: String(copyIn?.brand || brand),
      headline,
      support,
      ctas,
      bands: bands.map((b) => (
        STOCK_SPINE_CLONE_RE.test(b.title) || STOCK_SPINE_CLONE_RE.test(b.body)
          ? defaultBands(brand, family, brief, freshnessKey).find((d) => d.id === b.id) || b
          : b
      )),
      navLinks: family === 'marketing-bands'
        ? pick(seed, [['Discover', 'Story', 'Contact'], ['Explore', 'Details', 'Contact'], ['Product', 'About', 'Contact']] as const, 34).slice()
        : ['Home', 'Work'],
    },
    forbid: [
      ...FORBID_FLOOR,
      'stock-spine-clone-copy',
      ...(family === 'marketing-bands' ? ['inset-hero-card', 'fake-utility-stub'] : []),
      ...(family === 'tool-panel' ? ['fake-marketing-hero'] : []),
      ...(family === 'game-stage' ? ['marketing-card-grid'] : []),
    ],
    referenceOverlay: null,
    genre: familyToGenre(family, brief),
    shellVariant,
    toolVariant,
    toolKind,
    appVariant,
    freshnessKey,
  };
  return applyDesignSlots(plan, { contract: opts.contract || null, copy: copyIn });
}

/**
 * Bake Design/Copy hop results into a DesignPlan without changing family or landmarks.
 * Models refine palette/type/copy slots only — Nova keeps composition grammar.
 */
export function applyDesignSlots(
  plan: DesignPlan,
  opts: {
    contract?: LayoutContract | null;
    copy?: Partial<CopyPack> | null;
  } = {},
): DesignPlan {
  const next: DesignPlan = {
    ...plan,
    shellVariant: plan.shellVariant || 'split-editorial',
    tokens: { ...plan.tokens },
    copy: {
      ...plan.copy,
      ctas: [...plan.copy.ctas],
      bands: plan.copy.bands.map((b) => ({ ...b })),
      navLinks: [...plan.copy.navLinks],
    },
    landmarks: [...plan.landmarks],
    forbid: [...plan.forbid],
  };
  const c = opts.contract;
  if (c?.palette) {
    if (c.palette.bg) next.tokens.bg = String(c.palette.bg);
    if (c.palette.ink) next.tokens.ink = String(c.palette.ink);
    if (c.palette.accent) next.tokens.accent = String(c.palette.accent);
    if (c.palette.muted) next.tokens.muted = String(c.palette.muted);
  }
  if (c?.typography) {
    if (c.typography.display) next.tokens.display = String(c.typography.display);
    if (c.typography.body) next.tokens.body = String(c.typography.body);
  }
  const copyIn = opts.copy;
  if (copyIn) {
    if (copyIn.brand) next.copy.brand = String(copyIn.brand);
    if (copyIn.headline) {
      next.copy.headline = scrubLeakCopy(String(copyIn.headline), next.copy.headline);
    }
    if (copyIn.support) {
      next.copy.support = scrubLeakCopy(String(copyIn.support), next.copy.support);
    }
    if (Array.isArray(copyIn.ctas) && copyIn.ctas.length) {
      next.copy.ctas = copyIn.ctas.map(String).slice(0, 4).map((t, i) => (
        scrubLeakCopy(t, next.copy.ctas[i] || t)
      ));
    }
    if (copyIn.sections && typeof copyIn.sections === 'object') {
      next.copy.bands = next.copy.bands.map((b) => {
        const from = copyIn.sections?.[b.id];
        if (!from) return b;
        return {
          id: b.id,
          title: scrubLeakCopy(String(from.title || ''), b.title),
          body: scrubLeakCopy(String(from.body || ''), b.body),
        };
      });
    }
  }
  return next;
}

/** Bridge DesignPlan → existing LayoutContract consumers. */
export function designPlanToLayoutContract(plan: DesignPlan): LayoutContract {
  const sections: LayoutSection[] = [];
  if (plan.family === 'marketing-bands') {
    sections.push(
      { id: 'nav', role: 'nav' },
      { id: 'hero', role: 'hero', fullBleed: true, headlineKey: 'hero' },
      ...plan.copy.bands.map((b) => ({ id: b.id, role: 'band' as const, fullBleed: true })),
      { id: 'footer', role: 'footer' },
    );
  } else if (plan.family === 'app-chrome') {
    sections.push(
      { id: 'sidebar', role: 'sidebar' },
      { id: 'main', role: 'main' },
    );
  } else if (plan.family === 'tool-panel') {
    sections.push(
      { id: 'chrome', role: 'nav' },
      { id: 'panel', role: 'main' },
    );
  } else {
    sections.push(
      { id: 'hud', role: 'nav' },
      { id: 'play', role: 'canvas', fullBleed: true },
    );
  }
  const composition =
    plan.family === 'marketing-bands' ? 'full-bleed-bands'
      : plan.family === 'app-chrome' ? 'app-chrome'
        : plan.family === 'tool-panel' ? 'tool-panel'
          : 'single-canvas';
  return {
    composition,
    hero: {
      fullBleed: plan.family === 'marketing-bands' || plan.family === 'game-stage',
      media: plan.family === 'game-stage' ? 'canvas'
        : plan.family === 'marketing-bands' ? 'product-stage'
          : 'none',
      overlaysForbidden: plan.family !== 'game-stage',
    },
    sections,
    typography: {
      display: plan.tokens.display,
      body: plan.tokens.body,
      scale: plan.family === 'marketing-bands' ? 'product' : 'utility',
    },
    palette: {
      bg: plan.tokens.bg,
      ink: plan.tokens.ink,
      accent: plan.tokens.accent,
      muted: plan.tokens.muted,
    },
    motion: plan.family === 'marketing-bands'
      ? ['soft-fade-up', 'band-reveal', 'orb-drift']
      : plan.family === 'game-stage'
        ? ['game-loop']
        : [],
    forbid: [...plan.forbid],
    genre: plan.genre,
  };
}

export function designPlanToCopyPack(plan: DesignPlan): CopyPack {
  const sections: CopyPack['sections'] = {
    hero: { title: plan.copy.headline, body: plan.copy.support },
  };
  for (const b of plan.copy.bands) {
    sections[b.id] = { title: b.title, body: b.body };
  }
  return {
    brand: plan.copy.brand,
    headline: plan.copy.headline,
    support: plan.copy.support,
    ctas: plan.copy.ctas,
    sections,
  };
}

export function formatDesignCraftRules(plan: DesignPlan): string[] {
  // Deprecated for create craft — prefer formatOriginalCraftRules. Kept for heal tooling.
  return formatOriginalCraftRules({
    brief: '',
    productName: plan.copy.brand,
    freshnessKey: plan.freshnessKey,
  });
}

/**
 * Brief-first craft law — invent whatever THIS ask needs.
 * No tip/todo/notes/shop recipe menus. Family is a soft hint against wrong-shape sabotage only.
 * When thin create is on (default), uses the short Temp-Nova-shaped prompt instead.
 */
export function formatOriginalCraftRules(opts: {
  brief: string;
  productName?: string;
  freshnessKey?: string;
  artifactKind?: ArtifactKind;
}): string[] {
  if (isThinCreatePath()) {
    return formatThinCreateCraftRules({
      brief: opts.brief,
      productName: opts.productName,
      artifactKind: opts.artifactKind || resolveArtifactKind(opts.brief),
    });
  }
  const name = String(opts.productName || '').trim();
  const brief = String(opts.brief || '').trim().slice(0, 800);
  const salt = String(opts.freshnessKey || '').slice(0, 16);
  const productPlan = buildProductPlan(brief, name);
  const productPlanBlock = formatProductPlanBlock(productPlan);
  const passSpineBlock = [
    '## Create pass spine (required order — do not skip)',
    '1) PLAN — read the user brief; decide the real product they asked for (not a preset genre)',
    `2) STRUCTURE — invent the layout that fits THIS ask (hint shape: ${productPlan.compositionFamily})`,
    '3) DESIGN — intentional type + atmosphere when it helps the product (no phone-column, no cream-terracotta AI look)',
    '4) INTERACT — real controls the brief needs',
    '5) VERIFY — complete tags/braces; App must mount',
    '6) CRITIC — does the UI match the brief? If not, keep building:',
    ...productPlan.checklist.map((c) => `   - ${c}`),
  ].join('\n');
  return [
    'ORIGINAL ONE-OF-ONE CREATE — build what the user asked for, not a tip/todo/notes/marketing preset.',
    productPlanBlock,
    passSpineBlock,
    ...QUALITY_FLOOR.map((r) => `- ${r}`),
    name ? `- Product / brand to invent around: ${name}` : '- Invent a fitting brand name from the brief when none is given.',
    brief ? `- User brief (SOURCE OF TRUTH — invent the UI from this):\n${brief}` : '- Follow the user brief in the messages.',
    salt ? `- Freshness salt ${salt}: diverge layout, type pairing, palette, and section rhythm from any prior build.` : '',
    '- Read the brief like a human: invent the product they described — tip calc, vacuum brand site, hybrid, anything. Do not force a canned tip/todo/notes/shop shell.',
    `- Shape hint (not a template): **${productPlan.compositionFamily}** — only to avoid the wrong product class (e.g. do not ship a marketing hero when they asked for a working tool/app).`,
    '- FORBIDDEN: genre recipe menus, placeholder copy (lorem/Sample/Band-N/John Doe), apple.com/Linear/cafe layout recipes,',
    '  cream-terracotta AI look, purple-glow spam, via.placeholder.com, “fill Design Spine slots only”, restoring a prior shell,',
    '  or copy-pasting another Nova project.',
    '- FORBIDDEN: wrapping the whole page in a centered flex phone-column (.app { justify-content:center; align-items:center }).',
    productPlan.compositionFamily === 'catalog-store'
      ? '- This ask looks like shop/cart — include a real catalog + working cart/checkout from the brief (not a marketing one-pager). Emit src/data/products.ts when the brief needs products.'
      : '- Do not invent COVER_HREFS / full-bleed marketing heroes / product catalogs unless the brief actually asks for a marketing site or shop.',
    '- Use intentional display+body fonts (not Inter/Roboto/Arial/system void) and CSS atmosphere when it fits.',
    '- Emit @@@FILE src/App.tsx (or .jsx) + src/App.css at minimum; more files only when the brief needs them.',
    '- Do not finish until the starting product matches the brief and feels complete enough to use.',
  ].filter(Boolean);
}

const THIN_TOKENS_CSS_PATH = 'src/styles/tokens.css';

/** Minimal palette tokens for marketing/brand thin create — no floor page paste. */
export function ensureThinDeterministicTokensCss(
  files: Record<string, string>,
  brief: string,
  productName = '',
): Record<string, string> {
  if (!isThinCreatePath() || !thinBriefWantsDepth(brief)) return files;
  const family = inferCreateCompositionFamily(brief, productName);
  if (family !== 'marketing-bands' && !/\b(?:brand|matcha|boutique|skincare|restaurant)\b/i.test(brief)) {
    return files;
  }
  if (String(files[THIN_TOKENS_CSS_PATH] || '').trim()) return files;
  const id = createIdentityFromBrief(productName, brief);
  const p = id.palette;
  const tokensCss = `:root {
  --bg: ${p.bg};
  --ink: ${p.text};
  --accent: ${p.accent};
  --muted: ${p.muted};
  --panel: ${p.panel};
  --line: ${p.line};
}
`.trim();
  const next: Record<string, string> = { ...files, [THIN_TOKENS_CSS_PATH]: tokensCss };
  const appCss = String(files['src/App.css'] || '');
  if (!/tokens\.css/i.test(appCss)) {
    next['src/App.css'] = `@import './styles/tokens.css';\n${appCss}`.trim();
  }
  return next;
}

/**
 * True when the page already paints a designed hero stage without Pollinations/photo files:
 * inline SVG / data-URL art, a hero orb/atmosphere layer, or a gradient-backed .hero.
 * `extra` may be compositional section bodies (App shell alone often has no hero).
 */
export function heroVisualRendered(app: string, css: string, extra = ''): boolean {
  const a = `${String(app || '')}\n${String(extra || '')}`;
  const c = String(css || '');
  if (/(?:src|href)=\{?\s*['"]data:image\/svg\+xml/i.test(a)) return true;
  if (/\bHERO_VISUAL\b/.test(a) && /data:image\/svg\+xml/i.test(a)) return true;
  if (/className=["'][^"']*\bhero-art\b/i.test(a) && /\bHERO_VISUAL\b|data:image\/svg\+xml/i.test(a)) return true;
  if (/<svg\b[\s\S]{0,4000}<\/svg>/i.test(a) && /className=["'][^"']*\bhero\b/i.test(a)) return true;
  if (/className=["'][^"']*\bhero\b[^"']*["'][\s\S]{0,600}className=["'][^"']*\b(?:orb|hero-visual|hero__visual|hero-art|stage)\b/i.test(a)) return true;
  if (/\.hero\b[^{]*\{[^}]*(?:radial-gradient|linear-gradient|conic-gradient)/i.test(c)
    && /className=["'][^"']*\bhero\b/i.test(a)) return true;
  return false;
}

function compositionalSectionBlob(files: Record<string, string>): string {
  return Object.entries(files)
    .filter(([k]) => /^src\/sections\/.+\.jsx$/i.test(k.replace(/\\/g, '/')))
    .map(([, v]) => String(v || ''))
    .join('\n');
}

/**
 * Marketing / brand creates: when no hero visual exists, add a designed SVG stage
 * (createIdentity.svgHeroDataUrl) inside the hero — never Pollinations or a missing /heroes file.
 * Compositional shells: inject into HeroSection.jsx, never the thin App shell.
 */
export function ensureDesignedHeroVisual(
  files: Record<string, string>,
  opts: { brief?: string; productName?: string },
): { files: Record<string, string>; changed: boolean } {
  const appKey = files['src/App.jsx'] ? 'src/App.jsx' : (files['src/App.tsx'] ? 'src/App.tsx' : '');
  if (!appKey) return { files, changed: false };
  const app = String(files[appKey] || '');
  const css = String(files['src/App.css'] || '');
  const sections = compositionalSectionBlob(files);
  // Modern atelier shells own hero art (or typography-only rail/commission).
  // Injecting the same bag SVG into every shell made Latch invents look copied (Prism).
  if (/data-nova-shell=["'](?:lookbook|rail|feature|strip|commission)["']/i.test(`${app}\n${sections}`)) {
    return { files, changed: false };
  }
  if (!app.trim() || heroVisualRendered(app, css, sections)) return { files, changed: false };
  if (/<(?:img|video)\b[^>]*(?:className=["'][^"']*hero|alt=["'][^"']*(?:hero|product))/i.test(`${app}\n${sections}`)) {
    return { files, changed: false };
  }

  const name = String(opts.productName || '').trim() || 'Brand';
  let dataUrl = '';
  try {
    const ident = createIdentityFromBrief(name, String(opts.brief || ''));
    dataUrl = svgHeroDataUrl(ident, name);
  } catch {
    dataUrl = svgHeroDataUrl({ name }, name);
  }
  if (!dataUrl) return { files, changed: false };

  const heroSectionKey = Object.keys(files).find((k) => /src\/sections\/.*Hero.*\.jsx$/i.test(k.replace(/\\/g, '/')))
    || Object.keys(files).find((k) => {
      const body = String(files[k] || '');
      return /src\/sections\//i.test(k) && /className=["'][^"']*\bhero\b/i.test(body);
    });

  const decl = `const HERO_VISUAL = ${JSON.stringify(dataUrl)};\n`;
  const artCss = `

/* NOVA designed hero stage (no remote image) */
.hero-stage {
  margin-top: 2.5rem; min-height: min(48vh, 420px); border-radius: 1.25rem;
  overflow: hidden; position: relative; border: 1px solid rgba(255,255,255,0.12);
}
.hero-art, .hero-visual {
  display: block; width: 100%; height: 100%; min-height: inherit;
  object-fit: cover; object-position: center 40%;
}
.hero { position: relative; overflow: hidden; }
.hero > .hero-visual { position: absolute; inset: 0; opacity: 0.55; pointer-events: none; z-index: 0; }
.hero > *:not(.hero-visual) { position: relative; z-index: 1; }
`;

  // Prefer compositional Hero section — never poison a thin App shell with inject-hero.
  if (heroSectionKey) {
    let body = String(files[heroSectionKey] || '');
    if (!body.trim()) return { files, changed: false };
    if (!/\bHERO_VISUAL\b/.test(body)) {
      body = /^export\s+default/m.test(body)
        ? body.replace(/^(export\s+default)/m, `${decl}$1`)
        : `${decl}${body}`;
    }
    const artImg = `<img className="hero-art" src={HERO_VISUAL} alt="" aria-hidden="true" />`;
    if (/<div className="hero-stage-inner"\s*\/>/i.test(body)) {
      body = body.replace(/<div className="hero-stage-inner"\s*\/>/i, artImg);
    } else if (/className=["'][^"']*\bhero-stage\b[^"']*["'][^>]*>/i.test(body)
      && !/hero-art|<svg\b/i.test(body)) {
      body = body.replace(
        /(className=["'][^"']*\bhero-stage\b[^"']*["'][^>]*>)/i,
        `$1\n        ${artImg}`,
      );
    } else {
      const heroOpen = /<(header|section|div)\b[^>]*className=["'][^"']*\bhero\b[^"']*["'][^>]*>/i.exec(body);
      if (!heroOpen) return { files, changed: false };
      const insertAt = heroOpen.index + heroOpen[0].length;
      body = `${body.slice(0, insertAt)}\n      <div className="hero-stage" aria-hidden="true">${artImg}</div>${body.slice(insertAt)}`;
    }
    return {
      files: { ...files, [heroSectionKey]: body, 'src/App.css': `${css.trimEnd()}${artCss}` },
      changed: true,
    };
  }

  const heroOpen = /<(header|section|div)\b[^>]*className=["'][^"']*\bhero\b[^"']*["'][^>]*>/i.exec(app);
  if (!heroOpen) return { files, changed: false };
  const insertAt = heroOpen.index + heroOpen[0].length;
  const img = `\n        <img className="hero-visual" src={HERO_VISUAL} alt="" aria-hidden="true" />`;
  let nextApp = `${app.slice(0, insertAt)}${img}${app.slice(insertAt)}`;
  const importEnd = [...nextApp.matchAll(/^import[^\n]*\n/gm)].pop();
  nextApp = importEnd
    ? `${nextApp.slice(0, importEnd.index! + importEnd[0].length)}${decl}${nextApp.slice(importEnd.index! + importEnd[0].length)}`
    : `${decl}${nextApp}`;
  return {
    files: { ...files, [appKey]: nextApp, 'src/App.css': `${css.trimEnd()}${artCss}` },
    changed: true,
  };
}

/** Reject unprofessional / stock-clone create output (no template heal — caller retries craft). */
export function lintOriginalCreateQuality(
  files: Record<string, string>,
  opts?: { brief?: string; productName?: string },
): { ok: boolean; reasons: string[] } {
  const app = String(files['src/App.tsx'] || files['src/App.jsx'] || '');
  const css = String(files['src/App.css'] || '');
  const sectionBlob = compositionalSectionBlob(files);
  const blob = `${app}\n${css}\n${sectionBlob}`;
  const reasons: string[] = [];
  if (app.trim().length < 400) reasons.push('App source too thin for a professional page');
  if (css.trim().length < 400) reasons.push('CSS too thin — missing type/atmosphere depth');
  if (/\blorem\s+ipsum\b|\bSample\b|\bBand-\d+\b|via\.placeholder\.com/i.test(blob)) {
    reasons.push('Placeholder / Sample / Band-N copy forbidden');
  }
  if (/\bA singular ritual for how you actually live\b|\bForm that earns its keep\b|\bMade for real rooms\b|\bEveryday ease\b|\bThe \w+ ritual\b/i.test(blob)) {
    reasons.push('Stock Spine clone phrases forbidden');
  }
  // Prior Nova floor / SoftPalm / Pond / apple-band pastes — brand landings must invent.
  if (FLOOR_CLONE_FINGERPRINT_RE.test(blob)) {
    reasons.push('Canned floor / prior-brand clone fingerprint forbidden');
  }
  if (!/@font-face|fonts\.googleapis|font-family\s*:/i.test(css)) {
    reasons.push('Missing intentional font pairing');
  }
  if (!/radial-gradient|linear-gradient|@keyframes/i.test(css) && !/blank|solid\s+white/i.test(String(opts?.brief || ''))) {
    reasons.push('Missing atmosphere (gradient or motion)');
  }
  if (/#f4f1ea/i.test(css) && /#c2410c|#b45309|terracotta/i.test(css) && /serif/i.test(css)) {
    reasons.push('Cream-terracotta-serif AI cluster forbidden');
  }
  if (/purple|indigo|#7c3aed|#8b5cf6/i.test(css) && /glow|drop-shadow.*purple/i.test(css)) {
    reasons.push('Purple-glow AI look forbidden');
  }
  const brief = String(opts?.brief || '');
  // Scope product homepage rules to marketing/product-page signals — not bare productName alone
  // (that false-failed utilities named after a brand).
  const productAsk = /\b(?:website|homepage|landing|product\s+(?:page|marketing|homepage)|marketing\s+site|full[- ]?bleed|sticky\s+nav)\b/i.test(brief)
    || (/\b(?:shop|store|brand|vacuum|mouse|keyboard|headset|earbuds?|dates?)\b/i.test(brief)
      && /\b(?:website|landing|homepage|hero|footer|varieties)\b/i.test(brief));
  const storefrontAsk = /\b(?:cart|checkout|purchase|add\s+to\s+cart|online\s+store|e-?commerce)\b/i.test(brief)
    || /\b(?:liquor|spirits?|whiskey|whisky|bourbon|vodka|gin|tequila|bottle\s+shop)\b/i.test(brief);
  if (productAsk && /\b(?:tip\s*calculator|todo\s*list|split\s*the\s*bill)\b/i.test(blob)
    && !/\b(?:tip|todo|coffee)\b/i.test(brief)) {
    reasons.push('Utility tip/todo stub on a product brief forbidden');
  }
  // Universal starting-product plan score (any ask — not storefront-only).
  {
    const productPlan = buildProductPlan(brief, String(opts?.productName || ''));
    const planScore = scorePlanContract(files, productPlan);
    for (const r of planScore.reasons.slice(0, 6)) reasons.push(r);
    const designAll = scoreStartingDesignQuality(files, productPlan);
    for (const r of designAll.reasons.slice(0, 4)) reasons.push(r);
  }
  if (storefrontAsk) {
    const shop = scoreStorefrontContract(files, { brief });
    for (const r of shop.reasons.slice(0, 6)) reasons.push(r);
    const design = scoreStorefrontDesignQuality(files);
    for (const r of design.reasons.slice(0, 4)) reasons.push(r);
    if (!files['src/data/products.ts'] && shop.reasons.some((x) => /priced products|catalog/i.test(x))) {
      reasons.push('storefront craft missing required src/data/products.ts');
    }
  }
  if (productAsk && !/blank|solid\s+white/i.test(brief)) {
    // Phone-column: flex-centered shell OR skinny max-width mid-stack without full-bleed bands.
    const flexPhone = (
      /\.(?:app|site|App)\b[\s\S]{0,320}\bjustify-content\s*:\s*center\b/i.test(css)
      && /\.(?:app|site|App)\b[\s\S]{0,320}\balign-items\s*:\s*center\b/i.test(css)
    ) || (
      /#root\b[\s\S]{0,200}\bjustify-content\s*:\s*center\b/i.test(css)
      && /#root\b[\s\S]{0,200}\balign-items\s*:\s*center\b/i.test(css)
    );
    const skinnyMid = /\.(?:app|site)\b[^{]*\{[^}]{0,220}\bmax-width\s*:\s*(?:[0-9]|[12][0-9]|3[0-9]|40)(?:rem|em|%)\b/i.test(css)
      && /\.(?:app|site)\b[^{]*\{[^}]{0,220}\bmargin(?:-inline)?\s*:\s*(?:0\s+auto|auto)\b/i.test(css)
      && !/(?:100vw|full[- ]?bleed|width\s*:\s*100%)/i.test(css + app);
    if (flexPhone || skinnyMid) {
      reasons.push('Product site cannot be a centered phone-column shell — use full-bleed edge-to-edge sections');
    }
    const heroFiles = Object.keys(files).filter((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp|svg)/i.test(p.replace(/\\/g, '/')));
    const coverDecls = /COVER_HREFS|heroes\/[\w.-]+\.(?:jpe?g|png|webp|svg)/i.test(app);
    // Require real hero-stage media — CSS url on .app alone is not enough (often overwritten by solid bg).
    // Compositional shells keep hero art in section files — include them.
    const uiBlob = `${app}\n${sectionBlob}`;
    const heroRendered = heroVisualRendered(app, css, sectionBlob)
      || /(?:src|href)=['"][^'"]*\/heroes\//i.test(uiBlob)
      || /className=["'][^"']*\bhero\b[^"']*["'][\s\S]{0,400}\/heroes\//i.test(uiBlob)
      || /\.hero\b[\s\S]{0,220}(?:url\(\s*['"]?[^)'"]*\/heroes\/|background(?:-image)?\s*:\s*[^;]*\/heroes\/)/i.test(css)
      || /<(?:img|video)\b[^>]*(?:className=["'][^"']*hero|alt=["'][^"']*(?:hero|product))/i.test(uiBlob)
        && /(?:src|href)=['"][^'"]+/i.test(uiBlob);
    if ((heroFiles.length > 0 || coverDecls) && !heroRendered) {
      reasons.push('Hero/product imagery exists (or COVER_HREFS) but is never rendered in the page');
    }
    if (!heroRendered && /\b(?:mouse|keyboard|headset|vacuum|product|shop|store|gaming|dates?|fruit|matcha|tea|tin|brand|lotion|coffee)\b/i.test(brief)) {
      reasons.push('Product marketing page missing a real hero/product visual stage');
    }
    // Old luggage fallback painted brand text fill="#1a1f1c" on a dark plate (invisible).
    try {
      const dataUri = (app.match(/data:image\/svg\+xml,([^"']+)/) || [])[1] || '';
      const decoded = decodeURIComponent(dataUri.slice(0, 6000));
      if (/fill=["']#1a1f1c["'][^>]*>\s*[A-Z0-9 ]{2,24}\s*</i.test(decoded)
        && /stroke=["']url\(#metal\)["']/i.test(decoded)) {
        reasons.push('Hero fallback uses invisible dark-on-dark brand text (luggage stub)');
      }
    } catch { /* ignore bad URI */ }
    // Bare decorative Lucide as the only nav brand mark (music/star/notebook without /logo.svg).
    if (!/\/logo\.svg/i.test(app)
      && /src=["']\/icons\/(?:music|star|sparkles|notebook-pen|heart)\.svg["']/i.test(app)
      && !/nav-brand|brand-wordmark|className=["'][^"']*\blogo\b/i.test(app)) {
      reasons.push('Brand mark is a bare decorative icon — use /logo.svg or a wordmark');
    }
    if (!/<footer\b/i.test(app) && !/className=["'][^"']*\bfooter\b/i.test(app) && !/className=["'][^"']*\bfoot\b/i.test(app)) {
      reasons.push('Product website missing a footer');
    }
    if (/\bJohn\s+Doe\b|\bJane\s+Doe\b|\bLorem\b/i.test(blob)) {
      reasons.push('Fake review / placeholder people copy forbidden');
    }
  }
  return { ok: reasons.length === 0, reasons };
}

function marketingBandBlock(
  plan: DesignPlan,
  band: DesignBand,
  idx: number,
  nextHref: string,
  kicker: string,
): string {
  const flip = idx % 2 === 1 ? ' band-flip' : '';
  const n = String(idx + 1).padStart(2, '0');
  if (plan.shellVariant === 'stacked-stage') {
    return `
        <section className="site-band site-band-stack band-${n} ${band.id}" id="${band.id}" aria-labelledby="${band.id}-title">
          <div className="stack-stage" aria-hidden="true">
            <span className="stack-wash" />
            <span className="stack-mark">${n}</span>
          </div>
          <div className="stack-copy">
            <p className="split-kicker">${esc(kicker)}</p>
            <h2 id="${band.id}-title" className="split-title">${esc(band.title)}</h2>
            <p className="split-body">${esc(band.body)}</p>
            <a className="text-link" href="#${nextHref}">Continue →</a>
          </div>
        </section>`;
  }
  if (plan.shellVariant === 'asymmetric-rail') {
    return `
        <section className="site-band site-band-rail band-${n} ${band.id}" id="${band.id}" aria-labelledby="${band.id}-title">
          <aside className="rail-index" aria-hidden="true"><span>${n}</span></aside>
          <div className="rail-copy">
            <p className="split-kicker">${esc(kicker)}</p>
            <h2 id="${band.id}-title" className="split-title">${esc(band.title)}</h2>
            <p className="split-body">${esc(band.body)}</p>
            <a className="text-link" href="#${nextHref}">Continue →</a>
          </div>
          <div className="rail-visual" aria-hidden="true"><span className="rail-block" /></div>
        </section>`;
  }
  return `
        <section className="site-band band-${n}${flip} ${band.id}" id="${band.id}" aria-labelledby="${band.id}-title">
          <div className="split-visual" aria-hidden="true">
            <div className="object-stage">
              <span className="obj-glow" />
              <span className="obj-form" />
              <span className="obj-label">${n} / ${esc(plan.copy.brand)}</span>
            </div>
          </div>
          <div className="split-copy">
            <p className="split-kicker">${esc(kicker)}</p>
            <h2 id="${band.id}-title" className="split-title">${esc(band.title)}</h2>
            <p className="split-body">${esc(band.body)}</p>
            <a className="text-link" href="#${nextHref}">Continue →</a>
          </div>
        </section>`;
}

function marketingHeroAtmosphere(plan: DesignPlan): string {
  if (plan.shellVariant === 'stacked-stage') {
    return `<div className="hero-atmosphere hero-atmosphere-stack" aria-hidden="true">
            <span className="plane plane-1" />
            <span className="plane plane-2" />
          </div>`;
  }
  if (plan.shellVariant === 'asymmetric-rail') {
    return `<div className="hero-atmosphere hero-atmosphere-rail" aria-hidden="true">
            <span className="rail-glow" />
            <span className="rail-bar" />
          </div>`;
  }
  return `<div className="hero-atmosphere" aria-hidden="true">
            <span className="orb orb-1" />
            <span className="orb orb-2" />
            <span className="orb orb-3" />
            <span className="hero-line" />
          </div>`;
}

function marketingApp(plan: DesignPlan): string {
  const c = plan.copy;
  const b0 = c.bands[0] || { id: 'band-01', title: `${c.brand} starts here.`, body: '' };
  const b1 = c.bands[1] || { id: 'band-02', title: 'Built for the workday.', body: '' };
  const b2 = c.bands[2] || { id: 'band-03', title: 'Keep what matters.', body: '' };
  const cta = c.ctas[0] || `Open ${c.brand}`;
  const nav = c.navLinks[0] || 'Discover';
  const kickers = ['Start here', 'Detail', 'Stay'] as const;
  return `import { useState } from 'react'
import './App.css'

export default function App() {
  const [lit, setLit] = useState(false)
  return (
    <div className="site site-${plan.shellVariant}">
      <div className="site-grain" aria-hidden="true" />
      <header className="site-nav">
        <a className="nav-brand" href="#top">${esc(c.brand)}.</a>
        <nav className="nav-links" aria-label="Primary">
          <a className="nav-link" href="#${b0.id}">${esc(nav)}</a>
        </nav>
      </header>
      <main id="top">
        <section className="site-hero" aria-label="Hero">
          ${marketingHeroAtmosphere(plan)}
          <div className="hero-copy">
            <p className="hero-eyebrow">${esc(c.brand)}</p>
            <h1 className="hero-brand">${esc(c.headline)}</h1>
            <p className="hero-support">${esc(c.support)}</p>
            <button
              type="button"
              className={"btn btn-primary" + (lit ? " is-lit" : "")}
              onClick={() => setLit((v) => !v)}
            >${esc(cta)}</button>
          </div>
        </section>
${marketingBandBlock(plan, b0, 0, b1.id, kickers[0])}
${marketingBandBlock(plan, b1, 1, b2.id, kickers[1])}
${marketingBandBlock(plan, b2, 2, 'contact', kickers[2])}
      </main>
      <footer className="site-footer" id="contact">
        <a className="footer-brand" href="#top">${esc(c.brand)}.</a>
        <p className="footer-copy">© {new Date().getFullYear()} ${esc(c.brand)}</p>
        <a className="footer-top" href="#top">Back to top ↑</a>
      </footer>
    </div>
  )
}
`;
}

function marketingCss(plan: DesignPlan): string {
  const t = plan.tokens;
  const light = t.tone === 'light';
  const panel = light ? '#111318' : '#ebe6dc';
  const panelInk = light ? '#f4f1ea' : '#14120f';
  const btnInk = light ? '#0a0b0c' : '#14120f';
  return `/* NOVA Design Spine — editorial marketing shell */
:root {
  --bg: ${t.bg};
  --ink: ${t.ink};
  --accent: ${t.accent};
  --muted: ${t.muted};
  --display: ${t.display};
  --body: ${t.body};
  --panel: ${panel};
  --panel-ink: ${panelInk};
}
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); }
body { font-family: var(--body); -webkit-font-smoothing: antialiased; }
.site { position: relative; min-height: 100vh; background: var(--bg); color: var(--ink); overflow-x: clip; }
.site-grain {
  pointer-events: none; position: fixed; inset: 0; z-index: 40; opacity: 0.055; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.site-nav {
  position: absolute; top: 0; left: 0; right: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.15rem clamp(1.5rem, 5vw, 3.5rem);
  background: transparent; border: 0;
}
.nav-brand {
  font-family: var(--body); font-weight: 650; font-size: 1.05rem;
  letter-spacing: -0.02em; color: var(--ink); text-decoration: none;
}
.nav-link {
  color: var(--ink); text-decoration: none; font-size: 0.86rem; opacity: 0.78;
}
.nav-link:hover { opacity: 1; }
.site-hero {
  position: relative; min-height: 100vh; width: 100%;
  display: flex; flex-direction: column; justify-content: center;
  padding: clamp(5rem, 12vh, 7rem) clamp(1.5rem, 6vw, 5rem) 4rem;
  overflow: hidden;
}
.hero-atmosphere { position: absolute; inset: 0; pointer-events: none; }
.orb {
  position: absolute; border-radius: 50%;
  filter: blur(42px);
  background: radial-gradient(circle at 38% 32%,
    color-mix(in srgb, var(--accent) 92%, #fff),
    color-mix(in srgb, var(--accent) 45%, transparent) 48%,
    transparent 72%);
  animation: orb-float 14s ease-in-out infinite alternate;
}
.orb-1 { width: min(52vw, 560px); height: min(52vw, 560px); right: 4%; top: 14%; opacity: 0.95; filter: blur(28px); }
.orb-2 { width: min(30vw, 320px); height: min(30vw, 320px); right: 30%; top: 50%; opacity: 0.7; animation-delay: -4s; }
.orb-3 { width: min(20vw, 220px); height: min(20vw, 220px); right: 12%; bottom: 14%; opacity: 0.55; animation-delay: -7s; }
.hero-line {
  position: absolute; width: 1px; height: 55%;
  right: 34%; top: 22%;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--accent) 55%, transparent), transparent);
  transform: rotate(-28deg); transform-origin: center; opacity: 0.55;
}
.hero-copy { position: relative; z-index: 2; max-width: 34rem; }
.hero-eyebrow {
  margin: 0 0 1.1rem; text-transform: uppercase; letter-spacing: 0.18em;
  font-size: 0.72rem; color: var(--accent); font-weight: 500;
}
.hero-brand {
  margin: 0; font-family: var(--display); font-weight: 500;
  font-size: clamp(3.4rem, 7.5vw, 5.8rem); line-height: 0.98; letter-spacing: -0.035em;
}
.hero-support {
  margin: 1.35rem 0 0; max-width: 26rem; font-size: 1.08rem;
  color: color-mix(in srgb, var(--ink) 72%, var(--muted)); line-height: 1.55;
}
.btn {
  appearance: none; border: 0; cursor: pointer; margin-top: 1.85rem;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.85rem 1.45rem; border-radius: 999px; font-size: 0.92rem; font-weight: 600;
  transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
}
.btn-primary { background: var(--accent); color: ${btnInk}; }
.btn-primary:hover, .btn-primary.is-lit {
  transform: translateY(-1px);
  box-shadow: 0 14px 36px color-mix(in srgb, var(--accent) 28%, transparent);
  filter: brightness(1.04);
}
.scroll-cue {
  position: absolute; left: clamp(1.5rem, 6vw, 5rem); bottom: 1.75rem; z-index: 2;
  display: flex; align-items: center; gap: 0.75rem; margin: 0;
  font-size: 0.68rem; letter-spacing: 0.16em; text-transform: uppercase; color: color-mix(in srgb, var(--ink) 55%, transparent);
}
.scroll-rule { width: 2.75rem; height: 1px; background: color-mix(in srgb, var(--ink) 35%, transparent); }
.site-band {
  display: grid; grid-template-columns: 1.05fr 0.95fr; min-height: 78vh;
  border-top: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
}
.site-band.band-flip { grid-template-columns: 0.95fr 1.05fr; }
.site-band.band-flip .split-visual { order: 2; }
.site-band.band-flip .split-copy { order: 1; }
.split-visual {
  background:
    radial-gradient(ellipse 70% 60% at 45% 55%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 70%),
    linear-gradient(160deg, color-mix(in srgb, var(--accent) 22%, #1a1c18), #0c0d0c);
  display: grid; place-items: center; padding: clamp(2rem, 5vw, 4rem);
}
.object-stage { position: relative; width: min(100%, 360px); aspect-ratio: 1; display: grid; place-items: center; }
.obj-glow {
  position: absolute; width: 70%; height: 70%; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 50%, transparent), transparent 70%);
  filter: blur(22px); animation: orb-float 12s ease-in-out infinite alternate;
}
.obj-form {
  position: relative; z-index: 1; width: 38%; height: 58%;
  border-radius: 999px 999px 1.4rem 1.4rem;
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--ink) 22%, transparent), transparent 42%),
    linear-gradient(180deg, #d7d3c8, #8f8a7c 55%, #5c584e);
  box-shadow: 0 28px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.28);
}
.obj-label {
  position: absolute; left: 0; bottom: 0;
  font-size: 0.72rem; letter-spacing: 0.08em; color: color-mix(in srgb, var(--ink) 65%, transparent);
  font-variant-numeric: tabular-nums;
}
.split-copy {
  background: var(--panel); color: var(--panel-ink);
  display: flex; flex-direction: column; justify-content: center;
  padding: clamp(2.5rem, 7vw, 5rem);
}
.split-kicker {
  margin: 0 0 1rem; text-transform: uppercase; letter-spacing: 0.16em;
  font-size: 0.7rem; color: color-mix(in srgb, var(--panel-ink) 55%, #6b7a64); font-weight: 600;
}
.split-title {
  margin: 0; font-family: var(--display); font-weight: 500;
  font-size: clamp(2.2rem, 4.2vw, 3.4rem); line-height: 1.05; letter-spacing: -0.03em;
}
.split-body {
  margin: 1.15rem 0 0; max-width: 28rem; font-size: 1.02rem; line-height: 1.6;
  color: color-mix(in srgb, var(--panel-ink) 72%, #666);
}
.text-link {
  margin-top: 1.6rem; color: var(--panel-ink); text-decoration: none;
  font-size: 0.95rem; border-bottom: 1px solid color-mix(in srgb, var(--panel-ink) 35%, transparent);
  align-self: flex-start; padding-bottom: 0.15rem;
}
.text-link:hover { border-color: var(--panel-ink); }
.site-band-stack {
  display: grid; grid-template-columns: 1fr; min-height: 72vh;
  border-top: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
}
.stack-stage {
  position: relative; min-height: 36vh;
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--accent) 28%, transparent), transparent 55%),
    radial-gradient(ellipse 80% 70% at 70% 40%, color-mix(in srgb, var(--accent) 40%, transparent), transparent 70%),
    var(--bg);
}
.stack-wash {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--bg) 85%, transparent));
}
.stack-mark {
  position: absolute; left: clamp(1.5rem, 5vw, 3.5rem); bottom: 1.25rem;
  font-size: 0.75rem; letter-spacing: 0.14em; color: var(--muted);
}
.stack-copy {
  padding: clamp(2.2rem, 6vw, 4rem) clamp(1.5rem, 5vw, 3.5rem) clamp(3rem, 8vw, 5rem);
  max-width: 42rem;
}
.site-band-rail {
  display: grid; grid-template-columns: 4.5rem 1.1fr 0.9fr; min-height: 70vh;
  border-top: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
}
.rail-index {
  display: grid; place-items: start center; padding-top: 2.5rem;
  border-right: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
  font-size: 0.75rem; letter-spacing: 0.12em; color: var(--accent);
}
.rail-copy {
  padding: clamp(2.5rem, 6vw, 4.5rem) clamp(1.5rem, 4vw, 3rem);
  display: flex; flex-direction: column; justify-content: center;
}
.rail-visual {
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--accent) 30%, #101010), #0a0a0a);
  display: grid; place-items: center;
}
.rail-block {
  width: min(46%, 160px); aspect-ratio: 3/4;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ink) 18%, transparent), var(--accent));
  border-radius: 1.25rem;
  box-shadow: 0 24px 48px rgba(0,0,0,0.35);
}
.hero-atmosphere-stack .plane {
  position: absolute; border-radius: 0; filter: blur(40px); opacity: 0.55;
}
.hero-atmosphere-stack .plane-1 {
  width: 55vw; height: 55vw; right: -8%; top: 10%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 55%, transparent), transparent 70%);
}
.hero-atmosphere-stack .plane-2 {
  width: 40vw; height: 40vw; left: 35%; bottom: -10%;
  background: radial-gradient(circle, color-mix(in srgb, var(--ink) 18%, transparent), transparent 70%);
}
.hero-atmosphere-rail .rail-glow {
  position: absolute; right: 8%; top: 18%; width: 38vw; height: 38vw; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent), transparent 70%);
  filter: blur(28px);
}
.hero-atmosphere-rail .rail-bar {
  position: absolute; right: 14%; top: 22%; bottom: 18%; width: 2px;
  background: linear-gradient(180deg, transparent, var(--accent), transparent); opacity: 0.7;
}
.site-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  padding: 1.35rem clamp(1.5rem, 5vw, 3.5rem);
  border-top: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
  font-size: 0.86rem; color: var(--muted);
}
.footer-brand { color: var(--ink); text-decoration: none; font-weight: 650; letter-spacing: -0.02em; }
.footer-copy { margin: 0; }
.footer-top { color: var(--muted); text-decoration: none; }
.footer-top:hover { color: var(--ink); }
@keyframes orb-float {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(1.5%, -2.5%, 0) scale(1.04); }
}
@media (max-width: 900px) {
  .site-band, .site-band.band-flip, .site-band-rail { grid-template-columns: 1fr; }
  .site-band.band-flip .split-visual,
  .site-band.band-flip .split-copy { order: initial; }
  .rail-index { display: none; }
  .orb-1 { width: 70vw; height: 70vw; right: -10%; top: 8%; }
  .hero-line { display: none; }
}
`;
}

function toolApp(plan: DesignPlan): string {
  const c = plan.copy;
  const variant = plan.toolVariant || 'card-center';
  const tip = plan.toolKind !== 'generic';
  const shellClass = `tool-chrome tool-${variant}`;
  const calcBody = tip
    ? `<>
            <h1 className="tool-title">${esc(c.headline)}</h1>
            <label className="field">
              <span>Bill amount</span>
              <input value={bill} onChange={(e) => setBill(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span>Tip ({tipPct}%)</span>
              <input type="range" min={0} max={40} value={tipPct} onChange={(e) => setTipPct(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Split ({people})</span>
              <input type="range" min={1} max={12} value={people} onChange={(e) => setPeople(Number(e.target.value))} />
            </label>
            <div className="tool-result" aria-live="polite">
              <div><span>Tip</span><strong>{\`$\${tipAmt.toFixed(2)}\`}</strong></div>
              <div><span>Total</span><strong>{\`$\${total.toFixed(2)}\`}</strong></div>
              <div><span>Each</span><strong>{\`$\${each.toFixed(2)}\`}</strong></div>
            </div>
            <button type="button" className="tool-btn" onClick={() => { setBill('0'); setTipPct(15); setPeople(2) }}>
              ${esc(c.ctas[1] || 'Reset')}
            </button>
          </>`
    : `<>
            <h1 className="tool-title">${esc(c.headline)}</h1>
            <label className="field">
              <span>Value</span>
              <input value={bill} onChange={(e) => setBill(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span>Factor ({tipPct})</span>
              <input type="range" min={1} max={40} value={tipPct} onChange={(e) => setTipPct(Number(e.target.value))} />
            </label>
            <div className="tool-result" aria-live="polite">
              <div><span>Result</span><strong>{\`$\${total.toFixed(2)}\`}</strong></div>
            </div>
            <button type="button" className="tool-btn" onClick={() => { setBill('0'); setTipPct(10) }}>
              ${esc(c.ctas[1] || 'Reset')}
            </button>
          </>`;

  const mainBlock = variant === 'split-meter'
    ? `<div className="tool-split">
        <section className="tool-panel tool-form">
          {tab === 'settings' ? (
            <>
              <h1 className="tool-title">Settings</h1>
              <label className="field row">
                <span>Dark mode</span>
                <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
              </label>
              <p className="tool-hint">${esc(c.support)}</p>
            </>
          ) : (
            ${calcBody}
          )}
        </section>
        <aside className="tool-meter" aria-live="polite">
          <p className="meter-kicker">${esc(c.brand)}</p>
          <strong className="meter-hero">{\`$\${total.toFixed(2)}\`}</strong>
          <p className="meter-sub">${tip ? 'Total with tip' : 'Computed result'}</p>
        </aside>
      </div>`
    : variant === 'dense-bar'
      ? `<main className="tool-panel tool-dense">
        {tab === 'settings' ? (
          <>
            <h1 className="tool-title">Settings</h1>
            <label className="field row">
              <span>Dark mode</span>
              <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
            </label>
            <p className="tool-hint">${esc(c.support)}</p>
          </>
        ) : (
          <div className="dense-row">
            <label className="field">
              <span>${tip ? 'Bill' : 'Value'}</span>
              <input value={bill} onChange={(e) => setBill(e.target.value)} inputMode="decimal" />
            </label>
            <label className="field">
              <span>${tip ? 'Tip %' : 'Factor'}</span>
              <input type="range" min={0} max={40} value={tipPct} onChange={(e) => setTipPct(Number(e.target.value))} />
            </label>
            ${tip ? `<label className="field">
              <span>Split</span>
              <input type="range" min={1} max={12} value={people} onChange={(e) => setPeople(Number(e.target.value))} />
            </label>` : ''}
            <div className="tool-result dense-result" aria-live="polite">
              <div><span>Total</span><strong>{\`$\${total.toFixed(2)}\`}</strong></div>
              ${tip ? `<div><span>Each</span><strong>{\`$\${each.toFixed(2)}\`}</strong></div>` : ''}
            </div>
          </div>
        )}
      </main>`
      : `<main className="tool-panel">
        {tab === 'settings' ? (
          <>
            <h1 className="tool-title">Settings</h1>
            <label className="field row">
              <span>Dark mode</span>
              <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
            </label>
            <p className="tool-hint">${esc(c.support)}</p>
          </>
        ) : (
          ${calcBody}
        )}
      </main>`;

  return `import { useMemo, useState } from 'react'
import './App.css'

export default function App() {
  const [bill, setBill] = useState('${tip ? '42.50' : '100'}')
  const [tipPct, setTipPct] = useState(${tip ? 18 : 12})
  const [people, setPeople] = useState(2)
  const [dark, setDark] = useState(${variant === 'split-meter' ? 'true' : 'false'})
  const [tab, setTab] = useState('calc')
  const tipAmt = useMemo(() => {
    const n = Number(bill)
    if (!Number.isFinite(n)) return 0
    return (n * tipPct) / 100
  }, [bill, tipPct])
  const total = useMemo(() => {
    const n = Number(bill)
    if (!Number.isFinite(n)) return tipAmt
    return ${tip ? 'n + tipAmt' : 'n * (tipPct / 10)'}
  }, [bill, tipAmt, tipPct])
  const each = useMemo(() => total / Math.max(1, people), [total, people])
  return (
    <div className={"${shellClass}" + (dark ? " is-dark" : "")}>
      <header className="tool-bar">
        <strong className="tool-brand">${esc(c.brand)}</strong>
        <nav className="tool-tabs" aria-label="Sections">
          <button type="button" className={tab === 'calc' ? 'is-on' : ''} onClick={() => setTab('calc')}>Calculator</button>
          <button type="button" className={tab === 'settings' ? 'is-on' : ''} onClick={() => setTab('settings')}>Settings</button>
        </nav>
      </header>
      ${mainBlock}
    </div>
  )
}
`;
}

function toolCss(plan: DesignPlan): string {
  const t = plan.tokens;
  const variant = plan.toolVariant || 'card-center';
  const radius = variant === 'dense-bar' ? '8px' : variant === 'split-meter' ? '4px' : '16px';
  const panelW = variant === 'dense-bar' ? '920px' : variant === 'split-meter' ? '960px' : '420px';
  return `/* NOVA Design Spine — tool-panel · ${variant} · ${plan.freshnessKey.slice(0, 8)} */
:root {
  --bg: ${t.bg}; --ink: ${t.ink}; --accent: ${t.accent}; --muted: ${t.muted};
  --display: ${t.display}; --body: ${t.body};
}
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); font-family: var(--body); }
.tool-chrome { min-height: 100vh; display: flex; flex-direction: column; }
.tool-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.9rem 1.25rem; border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  background: color-mix(in srgb, var(--bg) 88%, #fff);
}
.tool-brand { font-family: var(--display); letter-spacing: -0.02em; }
.tool-tabs { display: flex; gap: 0.35rem; }
.tool-tabs button {
  border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent); background: transparent; color: var(--muted);
  border-radius: ${variant === 'dense-bar' ? '6px' : '999px'}; padding: 0.35rem 0.75rem; cursor: pointer; font: inherit; font-size: 0.85rem;
}
.tool-tabs button.is-on { background: var(--accent); border-color: var(--accent); color: #fff; }
.tool-panel {
  width: min(${panelW}, calc(100% - 2rem)); margin: 2.5rem auto; padding: 1.5rem;
  background: color-mix(in srgb, var(--bg) 70%, #fff); border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  border-radius: ${radius}; box-shadow: 0 18px 40px color-mix(in srgb, var(--ink) 8%, transparent);
}
.tool-split {
  width: min(${panelW}, calc(100% - 2rem)); margin: 2rem auto; display: grid;
  grid-template-columns: 1.1fr 0.9fr; gap: 1rem; align-items: stretch;
}
.tool-split .tool-panel { width: auto; margin: 0; }
.tool-meter {
  border-radius: ${radius}; padding: 2rem 1.5rem; display: grid; align-content: center; gap: 0.35rem;
  background: linear-gradient(160deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #111));
  color: #fff;
}
.meter-kicker { margin: 0; opacity: 0.8; font-size: 0.85rem; letter-spacing: 0.08em; text-transform: uppercase; }
.meter-hero { font-size: clamp(2.4rem, 6vw, 3.6rem); letter-spacing: -0.04em; font-family: var(--display); }
.meter-sub { margin: 0; opacity: 0.85; }
.tool-dense .dense-row {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.85rem; align-items: end;
}
.dense-result { margin: 0 !important; }
.tool-title { margin: 0 0 1.25rem; font-size: 1.45rem; letter-spacing: -0.02em; font-family: var(--display); }
.field { display: grid; gap: 0.35rem; margin-bottom: 1rem; color: var(--muted); font-size: 0.9rem; }
.field.row { grid-template-columns: 1fr auto; align-items: center; }
.field input[type="text"], .field input:not([type]), .field input[inputmode] {
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent); border-radius: 10px; padding: 0.7rem 0.8rem; font: inherit; color: var(--ink);
  background: color-mix(in srgb, var(--bg) 92%, #fff);
}
.tool-hint { margin: 0; color: var(--muted); font-size: 0.92rem; line-height: 1.5; }
.tool-result {
  display: grid; gap: 0.55rem; margin: 1.1rem 0 1.25rem; padding: 0.9rem 1rem;
  background: color-mix(in srgb, var(--accent) 10%, var(--bg)); border-radius: 12px;
}
.tool-result div { display: flex; justify-content: space-between; }
.tool-btn {
  width: 100%; border: 0; border-radius: 10px; padding: 0.8rem 1rem; cursor: pointer;
  background: var(--accent); color: #fff; font-weight: 600;
}
.tool-btn:hover { filter: brightness(1.05); }
.tool-chrome.is-dark { background: #0f1419; color: #e8eaed; }
.tool-chrome.is-dark .tool-bar { background: #151b22; border-bottom-color: #243041; }
.tool-chrome.is-dark .tool-panel { background: #151b22; border-color: #243041; box-shadow: none; }
.tool-chrome.is-dark .tool-result { background: #0f1419; }
.tool-chrome.is-dark .tool-tabs button { background: #0f1419; border-color: #243041; color: #9aa3b2; }
.tool-chrome.is-dark .tool-tabs button.is-on { background: var(--accent); color: #0a0b0c; }
.tool-chrome.is-dark .field input[inputmode] { background: #0f1419; border-color: #243041; color: #e8eaed; }
@media (max-width: 840px) {
  .tool-split { grid-template-columns: 1fr; }
  .tool-dense .dense-row { grid-template-columns: 1fr 1fr; }
}
`;
}

function appChromeApp(plan: DesignPlan): string {
  const c = plan.copy;
  const variant = plan.appVariant || 'sidebar-notes';
  const themeDefault = variant === 'stacked-inbox' ? 'light' : 'dark';
  const shellMod = `app-${variant}`;
  const listBlock = `{tab === 'Notes' && (
          <div className="note-list">
            {notes.map((n) => (
              <button
                key={n.id}
                type="button"
                className={"note-item" + (n.id === activeId ? " is-active" : "")}
                onClick={() => setActiveId(n.id)}
              >{n.title}</button>
            ))}
            <button
              type="button"
              className="note-new"
              onClick={() => {
                const id = String(Date.now())
                setNotes((prev) => [{ id, title: 'Untitled', body: '' }, ...prev])
                setActiveId(id)
              }}
            >New note</button>
          </div>
        )}`;
  const settingsBlock = `<section className="main-canvas">
            <h1>Settings</h1>
            <label className="field">
              <span>Font size ({fontPx}px)</span>
              <input type="range" min={14} max={22} value={fontPx} onChange={(e) => setFontPx(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Theme</span>
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
          </section>`;
  const editorBlock = `<section className="main-canvas editor" style={{ fontSize: fontPx }}>
            <input
              className="note-title"
              value={active?.title || ''}
              onChange={(e) => setNotes((prev) => prev.map((n) => n.id === activeId ? { ...n, title: e.target.value } : n))}
            />
            <textarea
              className="note-body"
              value={active?.body || ''}
              onChange={(e) => setNotes((prev) => prev.map((n) => n.id === activeId ? { ...n, body: e.target.value } : n))}
            />
          </section>`;

  const authedBody = variant === 'rail-editor'
    ? `<aside className="app-sidebar app-rail">
        <div className="side-brand" title="${esc(c.brand)}">${esc(c.brand).slice(0, 1)}</div>
        <nav className="side-nav">
          {['Notes', 'Settings'].map((item) => (
            <button
              key={item}
              type="button"
              className={"side-link" + (tab === item ? " is-active" : "")}
              onClick={() => setTab(item)}
              title={item}
            >{item.slice(0, 1)}</button>
          ))}
        </nav>
      </aside>
      <div className="app-col">
        ${listBlock}
        <main className="app-main">
          {tab === 'Settings' ? (${settingsBlock}) : (${editorBlock})}
        </main>
      </div>`
    : variant === 'stacked-inbox'
      ? `<header className="app-top">
        <div className="side-brand">${esc(c.brand)}</div>
        <nav className="side-nav horizontal">
          {['Notes', 'Settings'].map((item) => (
            <button
              key={item}
              type="button"
              className={"side-link" + (tab === item ? " is-active" : "")}
              onClick={() => setTab(item)}
            >{item}</button>
          ))}
        </nav>
      </header>
      <div className="app-stack">
        <aside className="app-sidebar">
          ${listBlock}
        </aside>
        <main className="app-main">
          {tab === 'Settings' ? (${settingsBlock}) : (${editorBlock})}
        </main>
      </div>`
      : `<aside className="app-sidebar">
        <div className="side-brand">${esc(c.brand)}</div>
        <nav className="side-nav">
          {['Notes', 'Settings'].map((item) => (
            <button
              key={item}
              type="button"
              className={"side-link" + (tab === item ? " is-active" : "")}
              onClick={() => setTab(item)}
            >{item}</button>
          ))}
        </nav>
        ${listBlock}
      </aside>
      <main className="app-main">
        {tab === 'Settings' ? (${settingsBlock}) : (${editorBlock})}
      </main>`;

  return `import { useMemo, useState } from 'react'
import './App.css'

const SEED = [
  { id: '1', title: 'Welcome to ${esc(c.brand)}', body: 'Your first note. Edit me or start a new one.' },
  { id: '2', title: 'Ideas', body: 'Capture something worth keeping.' },
]

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [email, setEmail] = useState('')
  const [tab, setTab] = useState('Notes')
  const [notes, setNotes] = useState(SEED)
  const [activeId, setActiveId] = useState('1')
  const [fontPx, setFontPx] = useState(${variant === 'rail-editor' ? 17 : 16})
  const [theme, setTheme] = useState('${themeDefault}')
  const active = useMemo(() => notes.find((n) => n.id === activeId) || notes[0], [notes, activeId])
  if (!authed) {
    return (
      <div className={"app-shell sign-in ${shellMod} theme-" + theme}>
        <main className="sign-card">
          <h1>${esc(c.brand)}</h1>
          <p>${esc(c.support)}</p>
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <button type="button" className="primary" onClick={() => setAuthed(true)} disabled={!email.includes('@')}>
            Continue
          </button>
        </main>
      </div>
    )
  }
  return (
    <div className={"app-shell ${shellMod} theme-" + theme}>
      ${authedBody}
    </div>
  )
}
`;
}

function appChromeCss(plan: DesignPlan): string {
  const t = plan.tokens;
  const variant = plan.appVariant || 'sidebar-notes';
  const sideW = variant === 'rail-editor' ? '64px' : variant === 'stacked-inbox' ? '260px' : '220px';
  return `/* NOVA Design Spine — app-chrome · ${variant} · ${plan.freshnessKey.slice(0, 8)} */
:root {
  --bg: ${t.bg}; --ink: ${t.ink}; --accent: ${t.accent}; --muted: ${t.muted};
  --display: ${t.display}; --body: ${t.body};
}
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); font-family: var(--body); }
.app-shell { min-height: 100vh; display: grid; grid-template-columns: ${sideW} 1fr; }
.app-shell.app-rail-editor { grid-template-columns: ${sideW} 1fr; }
.app-shell.app-stacked-inbox { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
.app-shell.app-rail-editor .app-col { display: grid; grid-template-columns: 220px 1fr; min-width: 0; }
.app-stack { display: grid; grid-template-columns: ${sideW} 1fr; min-height: 0; }
.app-top {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.75rem 1.25rem; border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  background: color-mix(in srgb, var(--bg) 90%, #000);
}
.app-sidebar {
  border-right: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  padding: 1rem 0.75rem; background: color-mix(in srgb, var(--bg) 92%, #000);
}
.app-rail { padding: 0.75rem 0.35rem; text-align: center; }
.app-rail .side-brand { font-size: 1.2rem; padding: 0.4rem 0 0.8rem; }
.app-rail .side-link { text-align: center; padding: 0.65rem 0.2rem; font-weight: 700; }
.side-brand {
  font-family: var(--display); font-weight: 650; padding: 0.5rem 0.65rem 1rem;
  letter-spacing: -0.02em;
}
.side-nav { display: grid; gap: 0.25rem; }
.side-nav.horizontal { display: flex; gap: 0.35rem; }
.side-link {
  text-align: left; border: 0; background: transparent; color: var(--muted);
  padding: 0.55rem 0.65rem; border-radius: 8px; cursor: pointer; font: inherit;
}
.side-link.is-active, .side-link:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--ink); }
.app-main { display: flex; flex-direction: column; min-width: 0; }
.main-canvas { padding: 1rem 1.5rem 1.5rem; display: grid; gap: 1rem; }
.sign-in { display: grid; place-items: center; grid-template-columns: 1fr; }
.sign-card {
  width: min(380px, calc(100% - 2rem)); padding: 1.75rem; border-radius: ${variant === 'stacked-inbox' ? '6px' : '16px'};
  border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  background: color-mix(in srgb, var(--bg) 88%, #fff);
}
.sign-card h1 { margin: 0 0 0.4rem; font-family: var(--display); letter-spacing: -0.03em; }
.sign-card p { margin: 0 0 1.2rem; color: var(--muted); }
.field { display: grid; gap: 0.35rem; color: var(--muted); font-size: 0.9rem; }
.field input, .field select {
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent); border-radius: 10px;
  padding: 0.7rem 0.8rem; font: inherit; color: var(--ink); background: transparent;
}
.primary {
  margin-top: 1rem; width: 100%; border: 0; border-radius: 10px; padding: 0.8rem 1rem;
  background: var(--accent); color: #0a0b0c; font-weight: 650; cursor: pointer;
}
.primary:disabled { opacity: 0.45; cursor: not-allowed; }
.note-list { display: grid; gap: 0.25rem; margin-top: 0.75rem; padding: 0 0.25rem; }
.note-item, .note-new {
  text-align: left; border: 0; background: transparent; color: var(--muted);
  padding: 0.5rem 0.65rem; border-radius: 8px; cursor: pointer; font: inherit;
}
.note-item.is-active, .note-item:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--ink); }
.note-new { color: var(--accent); font-weight: 600; }
.editor { min-height: calc(100vh - 2rem); }
.note-title {
  width: 100%; border: 0; background: transparent; color: var(--ink);
  font-family: var(--display); font-size: 1.6rem; font-weight: 650; letter-spacing: -0.03em;
  padding: 0.25rem 0; outline: none;
}
.note-body {
  width: 100%; min-height: 55vh; border: 0; resize: vertical; background: transparent;
  color: var(--ink); font: inherit; line-height: 1.55; outline: none;
}
.theme-light { --bg: #f6f7f9; --ink: #12141a; --muted: #5c6570; }
@media (max-width: 800px) {
  .app-shell, .app-shell.app-rail-editor .app-col, .app-stack { grid-template-columns: 1fr; }
  .app-sidebar { border-right: 0; border-bottom: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); }
}
`;
}

function gameApp(plan: DesignPlan): string {
  const c = plan.copy;
  return `import { useEffect, useRef, useState } from 'react'
import './App.css'

export default function App() {
  const canvasRef = useRef(null)
  const [score, setScore] = useState(0)
  const [running, setRunning] = useState(true)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let x = 40, y = 120, vy = 0, frame = 0, raf = 0
    const loop = () => {
      frame += 1
      vy += 0.35
      y += vy
      if (y > canvas.height - 24) { y = canvas.height - 24; vy = -8; setScore((s) => s + 1) }
      ctx.fillStyle = '${tEscape(plan.tokens.bg)}'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '${tEscape(plan.tokens.accent)}'
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill()
      if (running) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running])
  return (
    <div className="game-root">
      <header className="game-hud">
        <strong>${esc(c.brand)}</strong>
        <span>Score {score}</span>
        <button type="button" onClick={() => { setScore(0); setRunning((r) => !r) }}>
          {running ? '${esc(c.ctas[1] || 'Pause')}' : '${esc(c.ctas[0] || 'Play')}'}
        </button>
      </header>
      <canvas className="game-stage" ref={canvasRef} width={720} height={360} />
      <p className="game-blurb">${esc(c.support)}</p>
    </div>
  )
}
`;
}

function tEscape(hex: string): string {
  return String(hex || '#000').replace(/'/g, '');
}

function gameCss(plan: DesignPlan): string {
  const t = plan.tokens;
  return `/* NOVA Design Spine — game-stage shell */
:root {
  --bg: ${t.bg}; --ink: ${t.ink}; --accent: ${t.accent}; --muted: ${t.muted};
  --display: ${t.display}; --body: ${t.body};
}
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); font-family: var(--body); }
.game-root {
  min-height: 100vh; display: grid; place-content: center; gap: 0.75rem; padding: 1rem;
  background:
    radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 50%),
    var(--bg);
}
.game-hud {
  display: flex; gap: 1rem; align-items: center; justify-content: space-between;
  width: min(720px, 100%); font-family: var(--display);
}
.game-hud button {
  border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--ink); border-radius: 8px; padding: 0.4rem 0.8rem; cursor: pointer;
}
.game-stage {
  width: min(720px, 100%); height: auto; border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--ink) 16%, transparent);
  background: #000; display: block;
}
.game-blurb { margin: 0; color: var(--muted); width: min(720px, 100%); font-size: 0.92rem; }
`;
}

/**
 * Drop orphaned JSX / braces after the main App module ends.
 * Craft sometimes appends `</div>}` tails that break Vite Live.
 */
export function stripTrailingSourceJunk(source: string): string {
  let s = String(source || '');
  if (!s.trim()) return s;
  // Classic LeafNote fail: valid App closes, then stray `</div>}`
  s = s.replace(/\n\}\s*\n\s*<\/(?:div|main|section|aside|header|footer)>\s*\n\}\s*$/i, '\n}\n');
  s = s.replace(/\n\}\s*\n\s*\}\s*$/g, '\n}\n');
  // Trim trailing orphan close-tags after final top-level `}`
  const lastExport = s.lastIndexOf('export default function');
  if (lastExport >= 0) {
    const after = s.slice(lastExport);
    const close = after.search(/\n\}\s*$/);
    if (close >= 0) {
      const head = s.slice(0, lastExport) + after.slice(0, close + 2);
      const tail = after.slice(close + 2).trim();
      if (tail && /^<\/?[a-zA-Z]|^\}\s*$/m.test(tail)) {
        s = `${head}\n`;
      }
    }
  }
  return s;
}

/** Deterministic App + CSS shell Nova owns before craft. */
export function renderDesignShell(plan: DesignPlan): Record<string, string> {
  let app = '';
  let css = '';
  if (plan.family === 'tool-panel') {
    app = toolApp(plan);
    css = toolCss(plan);
  } else if (plan.family === 'app-chrome') {
    app = appChromeApp(plan);
    css = appChromeCss(plan);
  } else if (plan.family === 'game-stage') {
    app = gameApp(plan);
    css = gameCss(plan);
  } else {
    app = marketingApp(plan);
    css = marketingCss(plan);
  }
  return {
    'src/App.tsx': stripTrailingSourceJunk(app),
    'src/App.css': css,
  };
}

const LEAK_RE = /\b(?:short support line|pill CTA|keep orbs|full-bleed hero|full-bleed image|text overlay|distinct feature bands|atmosphere and motion|brand first\.?|LayoutContract|CopyPack|FORBIDDEN:|CRAFT RULES)\b/i;

/** Drop craft-instruction residue from CopyPack slots before it becomes UI. */
function scrubLeakCopy(text: string, fallback: string): string {
  const t = String(text || '').trim();
  if (!t || LEAK_RE.test(t)) return fallback;
  // Models often emit "Band 1" / "Band 01" / "Story Band 2" as titles — never ship those.
  if (/^(?:story\s+)?band\s*0*[1-4]$/i.test(t)) return fallback;
  if (/\b(?:story\s+)?band\s*0*[1-4]\b/i.test(t) && t.length < 40) return fallback;
  if (STOCK_SPINE_CLONE_RE.test(t)) return fallback;
  return t;
}

export function lintDesignSystem(
  files: Record<string, string>,
  plan: DesignPlan,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const app = files['src/App.tsx'] || files['src/App.jsx'] || '';
  const css = `${files['src/App.css'] || ''}\n${files['src/index.css'] || ''}`;
  const blob = `${app}\n${css}`;

  if (!app.trim()) {
    reasons.push('missing App source');
    return { ok: false, reasons };
  }

  for (const lm of plan.landmarks) {
    // Match string classNames and JSX template/concat forms: className={"tool-chrome" + ...}
    const re = new RegExp(
      `(?:className=["'][^"']*\\b${lm}\\b|class=["'][^"']*\\b${lm}\\b|className=\\{\\s*["'\`][^"'\`]*\\b${lm}\\b|["'\`]${lm}\\b)`,
      'i',
    );
    if (!re.test(app)) reasons.push(`missing landmark ${lm}`);
  }

  if (plan.family === 'marketing-bands') {
    if (!new RegExp(plan.copy.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app)) {
      reasons.push('brand missing from App');
    }
    // Craft often keeps one band-* and collapses the rest into a feature card grid — reject that.
    const siteBandCount = (app.match(/className=["'][^"']*\bsite-band\b/gi) || []).length;
    if (siteBandCount < 3) {
      reasons.push(`marketing shell needs 3 full-bleed site-band sections (found ${siteBandCount})`);
    }
    if (/className=["'][^"']*\bsite-features\b/i.test(app)) {
      reasons.push('marketing shell collapsed into feature-card grid');
    }
    if (!/--bg\s*:|--accent\s*:|background\s*:/i.test(css)) {
      reasons.push('CSS missing palette / atmosphere tokens');
    }
    if (!/@keyframes/i.test(css)) {
      reasons.push('CSS missing motion (@keyframes)');
    }
    if (/className=["'][^"']*\bicon-rail\b/i.test(app) || /className=["'][^"']*\bbrand-rail\b/i.test(app)) {
      reasons.push('absolute rail overlays present');
    }
    // Atmosphere is CSS-only — UIGEN/Instruct must not glue a WebGL demo onto a homepage.
    if (/\b(?:from\s+['"]three|OrbitControls|\bTHREE\.|WebGLRenderer)\b/i.test(app)) {
      reasons.push('marketing shell must not use three.js (CSS atmosphere only)');
    }
  }

  if (LEAK_RE.test(app)) {
    reasons.push('instruction-leak UI copy');
  }
  if (/\b(?:lorem ipsum|Sample text|placeholder copy|Band\s*0*[1-4])\b/i.test(app)) {
    reasons.push('placeholder / Band-N stub copy');
  }
  if (plan.family === 'marketing-bands' && STOCK_SPINE_CLONE_RE.test(app)) {
    reasons.push('stock spine clone copy (ritual / Form that earns / Luna lookbook reuse)');
  }
  if (plan.family === 'game-stage' && !/<canvas\b|getContext\s*\(\s*['"]2d['"]/i.test(app)) {
    reasons.push('game-stage missing canvas loop');
  }
  if (plan.family === 'tool-panel' && !/<input\b|useState/i.test(app)) {
    reasons.push('tool-panel missing interactive controls');
  }

  // Soft check that CSS variables match plan tokens when present
  if (css.includes('--bg:') && !css.includes(plan.tokens.bg) && plan.family === 'marketing-bands') {
    // allow model accent edits — only flag if bg completely drifted to cream AI cluster
    if (/--bg\s*:\s*#(?:f4f1ea|faf7f2)\b/i.test(css) && /#e07a5f/i.test(css)) {
      reasons.push('cream-terracotta AI cluster');
    }
  }

  void blob;
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Restore shell landmarks; re-apply copy slots from plan. */
export function healDesignShell(
  files: Record<string, string>,
  plan: DesignPlan,
): { files: Record<string, string>; changed: boolean; actions: string[] } {
  const actions: string[] = [];
  const lint = lintDesignSystem(files, plan);
  if (lint.ok) return { files, changed: false, actions };

  const shell = renderDesignShell(plan);
  const next = { ...files };
  const preferTsx = Boolean(files['src/App.tsx']) || !files['src/App.jsx'];
  if (preferTsx) {
    next['src/App.tsx'] = shell['src/App.tsx'];
    delete next['src/App.jsx'];
  } else {
    // JSX consumers — strip types if any (shell is already plain enough)
    next['src/App.jsx'] = shell['src/App.tsx'].replace(/: [A-Za-z<>|]+(=)/g, '$1');
    delete next['src/App.tsx'];
  }
  next['src/App.css'] = shell['src/App.css'];
  actions.push('restore-design-shell');
  return { files: next, changed: true, actions };
}

/** True when Design Spine should own the App (web-ish creates). */
export function designSpineApplies(brief: string, productName = ''): boolean {
  const head = String(brief || '').split(/\n## |\nLAYOUT CONTRACT|\nNOVA DESIGN SPINE|\nEnsemble plan/i)[0] || '';
  const t = `${head}\n${productName}`;
  if (/\b(?:cli|command[- ]line|terminal\s+tool)\b/i.test(t)) return false;
  if (/\b(?:python|flask|fastapi)\b/i.test(t) && !/\b(?:website|landing|react)\b/i.test(t)) return false;
  // Blank / solid-color pages are not marketing shells — never invent nav/bands/CTAs.
  if (
    /\bblank\b/i.test(t)
    && /\b(?:website|site|page|localhost|background|canvas)\b/i.test(t)
    && !/\b(?:landing\s+page|marketing\s+site|product\s+homepage|scroll\s+to\s+reveal)\b/i.test(t)
  ) {
    return false;
  }
  if (/\b(?:solid|pure|just)\b[\s\S]{0,40}\b(?:white|black|brown)\s+background\b/i.test(t)
    && !/\b(?:nav|hero|bands?|features?|sections?)\b/i.test(t)) {
    return false;
  }
  return true;
}
