/**
 * Layout-inspiration references ("like apple.com", "use this site as a reference").
 * Product content stays the user's product; composition/type/motion come from the reference.
 */

export type LayoutReferenceRecipe = {
  id: string;
  label: string;
  /** Host or short name shown in prompts */
  site: string;
  composition: 'full-bleed-bands' | 'split-hero' | 'app-chrome';
  heroFullBleed: boolean;
  overlaysForbidden: boolean;
  typography: { display: string; body: string; scale: 'editorial' | 'product' | 'utility' };
  motion: string[];
  /** Concrete craft rules the model must follow — not optional taste */
  craftRules: string[];
  forbidExtra: string[];
};

const APPLE_RECIPE: LayoutReferenceRecipe = {
  id: 'apple',
  label: 'apple.com product homepage',
  site: 'apple.com',
  composition: 'full-bleed-bands',
  heroFullBleed: true,
  overlaysForbidden: true,
  typography: {
    display: 'SF Pro Display, system-ui, -apple-system, "Segoe UI", sans-serif',
    body: 'SF Pro Text, system-ui, -apple-system, "Segoe UI", sans-serif',
    scale: 'product',
  },
  motion: ['soft-fade-up', 'band-reveal'],
  craftRules: [
    'REFERENCE BAR (apple.com layout inspiration — NOT an Apple brand clone):',
    '- Thin sticky top nav with wordmark left + text links; icons only if public/icons exist (inline in nav, never absolute icon-rail).',
    '- First viewport: brand-scale headline + one short support line + one CTA group on a full-bleed band (edge-to-edge).',
    '- Stack full-bleed product/story bands (min 3) that alternate light/dark — each band is one job, one headline.',
    '- Huge display type, generous whitespace, high contrast. No card-grid-as-hero. No floating stickers/badges on media.',
    '- Smooth scroll section reveals via CSS (@keyframes). Keep interactions real (useState) where the brief needs them.',
    '- Rebuild for THIS product (coffee, boats, etc.) — never copy Apple marks, product names, or proprietary assets.',
  ],
  forbidExtra: [
    'card-grid-as-hero',
    'absolute-icon-rail',
    'floating-sticker-overlays',
    'inset-hero-media-card',
  ],
};

const LINEAR_RECIPE: LayoutReferenceRecipe = {
  id: 'linear',
  label: 'linear.app product marketing + app chrome',
  site: 'linear.app',
  composition: 'app-chrome',
  heroFullBleed: false,
  overlaysForbidden: true,
  typography: {
    display: 'Inter, "Segoe UI", system-ui, sans-serif',
    body: 'Inter, "Segoe UI", system-ui, sans-serif',
    scale: 'utility',
  },
  motion: ['soft-fade-up', 'subtle-hover'],
  craftRules: [
    'REFERENCE BAR (linear.app layout inspiration — NOT a Linear brand clone):',
    '- Marketing page: tight sticky nav, sharp headline + short support + primary CTA, then feature sections with hairline borders and calm spacing.',
    '- Prefer a dark or near-black surface with one indigo/violet accent — not purple glow stacks or glassmorphism.',
    '- Dense but readable type; small labels, clear hierarchy; no emoji, no pill-stat strips in the hero.',
    '- If the brief asks for an app: left sidebar + main canvas, subtle separators, list/detail feel — original product name and copy only.',
    '- Rebuild for THIS product — never copy Linear marks, screenshots, or proprietary assets.',
  ],
  forbidExtra: [
    'floating-sticker-overlays',
    'purple-glow-hero',
    'emoji-stat-row',
  ],
};

const KNOWN: Array<{ re: RegExp; recipe: LayoutReferenceRecipe }> = [
  { re: /\bapple\.com\b|\biphone\b.*\bmac\b|\blike\s+apple\b|\bapple[- ]?style\b/i, recipe: APPLE_RECIPE },
  { re: /\blinear\.app\b|\blike\s+linear\b|\blinear[- ]?style\b/i, recipe: LINEAR_RECIPE },
];

/** Detect named reference sites / URLs the user asked to emulate for layout. */
export function detectLayoutReference(brief: string): {
  wantsInspiration: boolean;
  url: string | null;
  namedSite: string | null;
  recipe: LayoutReferenceRecipe | null;
} {
  const t = String(brief || '');
  const urlMatch = t.match(/https?:\/\/[^\s)\]}'"]+/i);
  let url = urlMatch ? urlMatch[0].replace(/[.,;:]+$/, '') : null;
  if (url && /\.(?:svg|png|jpe?g|webp|gif|css|js)(?:$|\?)/i.test(url)) url = null;

  const named =
    t.match(/\b(?:like|as|from|off|reference(?:\s+off)?|inspired\s+by|based\s+on)\s+(?:the\s+)?([a-z0-9.-]+\.(?:com|io|co|app|dev|net|org))\b/i)?.[1]
    || t.match(/\b([a-z0-9.-]+\.(?:com|io|co|app))\b(?:\s+(?:as|for)\s+(?:a\s+)?(?:layout\s+)?(?:reference|inspiration|look|vibe|feel))?/i)?.[1]
    || (/\bapple\.com\b|\blike\s+apple\b|\bapple[- ]?style\b/i.test(t) ? 'apple.com' : null);

  const wants = Boolean(
    url
    || named
    || /\b(?:use|as)\s+(?:a\s+)?(?:layout\s+)?(?:reference|inspiration)\b/i.test(t)
    || /\binspired\s+by\b/i.test(t)
    || /\blayout\s+(?:like|from)\b/i.test(t)
    || /\blook(?:s|ing)?\s+(?:like|as\s+premium\s+as)\b/i.test(t)
    || /\breference\s+off\b/i.test(t)
    || /\bbased\s+off\b/i.test(t),
  );

  let recipe: LayoutReferenceRecipe | null = null;
  for (const row of KNOWN) {
    if (row.re.test(t) || (named && row.re.test(named)) || (url && row.re.test(url))) {
      recipe = row.recipe;
      break;
    }
  }
  if (!recipe && (named === 'apple.com' || (url && /apple\.com/i.test(url)))) {
    recipe = APPLE_RECIPE;
  }
  if (!recipe && (named === 'linear.app' || (url && /linear\.app/i.test(url)))) {
    recipe = LINEAR_RECIPE;
  }

  return {
    wantsInspiration: wants || Boolean(recipe),
    url: url || (named ? `https://${named.replace(/^https?:\/\//i, '')}` : null),
    namedSite: named || recipe?.site || null,
    recipe,
  };
}

/** Prompt block injected into craft / polish when a reference is active. */
export function layoutReferencePromptLines(brief: string): string[] {
  const det = detectLayoutReference(brief);
  if (!det.wantsInspiration) return [];
  const site = det.namedSite || det.url || 'the referenced site';
  const lines = [
    '',
    `LAYOUT REFERENCE (must honor): ${site}`,
    '- Match hierarchy, spacing, type scale, motion, and section rhythm from the reference.',
    '- Keep THIS product\'s name, copy, palette cues, and features from the brief — do not clone the reference brand.',
    '- If the user asked for exact / 1:1 / clone-the-layout of a public marketing site, push composition fidelity hard while still inventing original copy/assets for THIS product.',
  ];
  if (det.recipe) {
    lines.push(...det.recipe.craftRules);
  }
  return lines;
}
