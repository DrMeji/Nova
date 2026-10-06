/**
 * CreateBriefSpec — brief-only create contract.
 * No category lookbook (bakery/Discord/Veopx). Every create invents from THIS ask.
 */

import { premiumWebCraftRules } from '@/lib/createEnsemble';
import { detectLayoutReference } from '@/lib/layoutReference';

function premiumWebCraftRulesSafe(brief: string): string[] {
  try {
    return premiumWebCraftRules(brief);
  } catch {
    return [];
  }
}

export type CreateBriefSpec = {
  name: string;
  slug: string;
  brief: string;
  /** Concrete must-haves pulled from the brief (not a genre enum). */
  mustHave: string[];
  /** Only set when the user explicitly asked to use a site as layout inspiration. */
  referenceSite: string | null;
  referenceMode: 'none' | 'layout-inspiration';
  /** Local hero path slot — filled by Brand Assets from brief words, never a category stock photo. */
  heroHref: string;
};

/** @deprecated Thin aliases so older imports compile — do not use for lookbook routing. */
export type CreateMood = 'brief';
export type CreateCategory = 'brief';
export type CreateLayout = 'brief';
export type CreatePalette = {
  bg: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  glow: string;
  btnInk: string;
  font: string;
  line: string;
};
/** @deprecated Use CreateBriefSpec. Kept as a shape alias for transitional call sites. */
export type CreateIdentity = CreateBriefSpec & {
  category: CreateCategory;
  mood: CreateMood;
  layout: CreateLayout;
  palette: CreatePalette;
  heroQueries: Array<{ id: string; q: string }>;
  categoryNouns: string[];
  forbidden: { hex: string[]; layouts: string[] };
};

function slugify(name: string): string {
  return String(name || 'brand')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'brand';
}

/**
 * Fallback when the brief has no color cues — cool slate, NOT cream/sage/gold
 * (cream was leaking AppleHome-class pages onto unrelated products).
 */
const NEUTRAL: CreatePalette = {
  bg: '#0f1419',
  panel: '#1a222c',
  text: '#e8eef4',
  muted: '#8b98a8',
  accent: '#5b9fd4',
  glow: 'rgba(91, 159, 212, 0.28)',
  btnInk: '#0f1419',
  font: '"Segoe UI", "Helvetica Neue", system-ui, sans-serif',
  line: 'rgba(232, 238, 244, 0.14)',
};

/** Brief-aware starter palette — explicit vibe words beat cream/bakery defaults. */
function paletteFromBrief(brief: string): CreatePalette {
  const t = String(brief || '').toLowerCase();
  // Maritime / dark vibes FIRST — ensemble plans often say "avoid cream" and the
  // word "cream" alone used to steal the palette from navy/seafoam briefs.
  if (/\b(?:navy|harbor|seafoam|ocean|maritime|dock|boat|clipper)\b/.test(t)) {
    return {
      bg: '#0a1628',
      panel: '#12233a',
      text: '#f4f8fc',
      muted: '#8fa3b8',
      accent: '#6ec8b8',
      glow: 'rgba(110, 200, 184, 0.32)',
      btnInk: '#0a1628',
      font: '"Segoe UI", "Helvetica Neue", system-ui, sans-serif',
      line: 'rgba(244, 248, 252, 0.14)',
    };
  }
  if (/\b(?:charcoal|amber|workshop|makerspace|forge|metal)\b/.test(t)) {
    return {
      bg: '#121417',
      panel: '#1c2026',
      text: '#f0ebe3',
      muted: '#9a948a',
      accent: '#d4893a',
      glow: 'rgba(212, 137, 58, 0.3)',
      btnInk: '#121417',
      font: '"Segoe UI", "Helvetica Neue", system-ui, sans-serif',
      line: 'rgba(240, 235, 227, 0.12)',
    };
  }
  const wantsCream = (
    (/\b(?:cream|parchment|bakery|terracotta)\b/.test(t)
      && !/\b(?:not\s+cream|no\s+cream|avoid\s+cream|never\s+cream|don'?t\s+.*?cream)\b/.test(t))
    || (/\bsage\b/.test(t)
      && /\b(?:bakery|cafe|pastry|bread)\b/.test(t)
      && !/\b(?:not\s+(?:cafe\s+)?sage|avoid\s+sage)\b/.test(t))
  );
  if (wantsCream) {
    return {
      bg: '#f3eee4',
      panel: '#faf7f0',
      text: '#1a1f1c',
      muted: '#5c665e',
      accent: '#8a6b2f',
      glow: 'rgba(198, 230, 192, 0.42)',
      btnInk: '#faf7f0',
      font: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
      line: 'rgba(26, 31, 28, 0.12)',
    };
  }
  return { ...NEUTRAL };
}

/** Local URL scan — avoid importing brandAssets (circular). */
function extractReferenceSiteUrlLocal(text: string): string | null {
  const re = /https?:\/\/[^\s)\]}'"]+/gi;
  let m: RegExpExecArray | null;
  const blob = String(text || '');
  while ((m = re.exec(blob))) {
    const u = m[0].replace(/[.,;:]+$/, '');
    if (/\.(?:svg|png|jpe?g|webp|gif|css|js)(?:$|\?)/i.test(u)) continue;
    if (/iconify\.design|openverse|unsplash|pexels|pollinations|githubusercontent|raw\.github/i.test(u)) continue;
    return u;
  }
  return null;
}

function explicitReferenceAsk(brief: string): { url: string | null; wantsInspiration: boolean } {
  const det = detectLayoutReference(brief);
  const url = det.url || extractReferenceSiteUrlLocal(brief);
  return {
    url,
    wantsInspiration: det.wantsInspiration || Boolean(url),
  };
}

/** Extract concrete product requirements from the brief — never map to a genre template. */
export function extractMustHaveFromBrief(brief: string): string[] {
  const t = String(brief || '');
  const out: string[] = [];
  const push = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };

  if (/\bsearch\b/i.test(t)) push('working search that filters or finds items from the brief');

  // Lending / borrow shelf (QuietShelf-style) — NOT appointment booking.
  // Do NOT match the noun "book" alone; that fired false booking must-haves on library apps.
  const lendingBrief =
    /\b(?:borrow|lend(?:ing)?|checked?\s*out|who\s+has|return\s+(?:button|it|the)|shelf\s+you\s+browse)\b/i.test(t)
    && !/\b(?:appointment|reserv|time\s*slot|pick\s+a\s+slot)\b/i.test(t);
  if (lendingBrief) {
    push('browseable shelf / item list from the brief');
    push('borrow action that marks who has the item checked out');
    if (/\breturn\b/i.test(t)) push('return action that clears checkout state');
  }

  // Real appointments / reservations — require booking language, not the noun "book".
  if (
    /\b(?:appointment|reserv|time\s*slot|pick\s+a\s+slot)\b/i.test(t)
    || (/\bbook(?:ing|ed)\b/i.test(t) && /\b(?:slot|appointment|table|haircut|class|session)\b/i.test(t))
  ) {
    push('booking flow with selectable time slots');
    push('confirmation step showing who has what reserved / checked out');
  }
  if (/\bemail\b|confirmation/i.test(t) && !lendingBrief) {
    push('email or on-screen confirmation path from the brief');
  }
  // Cart/checkout only when the brief is clearly commerce — not todo "Add" buttons,
  // and not accidental "buy" substrings in research fluff.
  const utilityBrief = /\b(?:todo|task\s*list|tip\s*(?:calc|calculator|wise)|calculator|checklist|counter|timer|notepad)\b/i.test(t);
  if (
    !lendingBrief
    && !utilityBrief
    && (/\b(?:cart|checkout|add\s+to\s+cart)\b/i.test(t)
      || (/\b(?:purchase|buy)\b/i.test(t) && /\b(?:shop|store|product|merch|checkout)\b/i.test(t)))
  ) {
    push('cart or purchase actions from the brief');
  }
  if (/\bchat\b|\bmessag/i.test(t)) push('messaging UI that matches the brief (original — not a clone shell)');
  if (/\blogin\b|\bsign[\s-]?in\b|\bauth/i.test(t)) push('sign-in / account UI if the brief asks for it');
  if (/\bdashboard\b/i.test(t)) push('dashboard with real panels from the brief');
  if (/\bmap\b|\blocation\b/i.test(t)) push('location / map affordance from the brief');
  if (/\btool|neighbor|community\s+garden|shed/i.test(t) && /\b(?:reserv|book|share|borrow)/i.test(t)) {
    push('browseable tool / item list from the brief');
  }
  if (/\brestaurant/i.test(t) && /\b(?:any|search|pick|choose|list|browse)/i.test(t)) {
    push('multi-restaurant browse/search — not a single restaurant landing');
  }

  // Keep short — polish prompt stays brief-led.
  return out.slice(0, 8);
}

/**
 * Build a fresh brief spec. No bakery/Discord/Veopx categories.
 * heroQueries are derived from the product name + brief words only.
 */
export function createBriefSpecFromAsk(name: string, brief = ''): CreateBriefSpec {
  const product = String(name || 'Brand').trim() || 'Brand';
  const slug = slugify(product);
  const text = String(brief || '').trim();
  // layoutReference recipes (apple.com / Linear / cafe) are retired — brief invents the look.
  void explicitReferenceAsk(text);
  return {
    name: product,
    slug,
    brief: text,
    mustHave: extractMustHaveFromBrief(text),
    referenceSite: null,
    referenceMode: 'none',
    heroHref: `/heroes/${slug}-hero.jpg`,
  };
}

/** @deprecated Prefer createBriefSpecFromAsk — returns a transitional CreateIdentity-shaped object with no lookbook. */
export function createIdentityFromBrief(name: string, brief = ''): CreateIdentity {
  const spec = createBriefSpecFromAsk(name, brief);
  const q = `${spec.name} ${spec.brief}`.replace(/\s+/g, ' ').trim().slice(0, 160)
    || `${spec.name} product photography editorial`;
  return {
    ...spec,
    category: 'brief',
    mood: 'brief',
    layout: 'brief',
    palette: paletteFromBrief(brief),
    heroQueries: [
      { id: `${spec.slug}-hero`, q: `${q} unique original photograph` },
      { id: `${spec.slug}-story`, q: `${spec.name} lifestyle editorial photography unique` },
    ],
    categoryNouns: [],
    forbidden: { hex: [], layouts: [] },
  };
}

/** @deprecated Category lookbook removed — always "brief". */
export function detectCreateCategory(_name: string, _brief: string): CreateCategory {
  return 'brief';
}

/**
 * Polish prompt owned by THIS brief only — never Discord/Veopx/bakery sermons.
 */
export function polishPromptLinesFromBrief(
  spec: CreateBriefSpec,
  appPath: string,
  brief: string,
): string[] {
  const must = spec.mustHave.length
    ? spec.mustHave.map((m, i) => `${i + 1}. ${m}`).join('\n')
    : '1. Implement the product the user described — invent a unique IA and visual language for THIS brief only.';

  const refLines = [
    '',
    'No external lookbook / layoutReference recipes. Invent original layout, type, and palette for THIS brief — do not imitate Apple.com, Linear, cafe word-lists, Discord, Slack, Veopx, bakery templates, or any prior Nova demo.',
  ];

  const briefText = String(brief || '');
  const looksGame = /\b(?:game|playable|arcade|fps|shooter|canvas\s+game|pong|snake|pac-?man|dino)\b/i.test(briefText);
  const looks3d = /\b(?:3d|three\.?js|webgl|modeler|viewport|mesh\s+editor)\b/i.test(briefText);

  return [
    'Build the FIRST real product UI for this new project from the user brief alone.',
    'Output ONLY @@@FILE blocks — no preface, no plan.',
    `Write ALL UI in @@@FILE ${appPath} and @@@FILE src/App.css only.`,
    'Do NOT create ./components/* — one App file with the full UI inline.',
    `MUST import './App.css' at the top of ${appPath}.`,
    'ORIGINAL ONE-OF-ONE: invent a unique professional layout, type, palette, and copy for THIS brief — never fill Design Spine slots, never keep a prior shell, never copy another Nova project.',
    'Ship a complete working App in one pass — real UI and interactions, not a stub. Be thorough but finish.',
    'If public/logo.svg or public/icons/*.svg exist (or will), put them IN the sticky nav as <img> tags — never leave icon files unused on disk.',
    ...(
      looksGame
        ? [
            'This is a PLAYABLE GAME — not a marketing landing page.',
            'Ship a real <canvas> (or WebGL) with requestAnimationFrame, keyboard/pointer controls, score/HUD, and a game loop.',
            'Do NOT ship a centered brand splash, feature cards, or static CSS mock of a game.',
            'Take the time to implement movement, collision, and win/lose — not a thin stub.',
          ]
        : looks3d
          ? [
              'This is a 3D / viewport app — import three (or WebGL) and show a real interactive scene.',
              'Include orbit/pan controls and at least one editable mesh or tool. Not a marketing hero.',
              'Add three to package.json dependencies if missing.',
            ]
          : [
              'PREMIUM depth required: layered background (gradient/atmosphere), strong type hierarchy, generous spacing — invent the composition for this brand.',
              'Implement the REAL flows from the brief (borrow/return, browse, booking, cart, etc.). Do not invent a generic time-slot booking flow unless the brief asks for appointments/reservations.',
              'Images: NEVER use via.placeholder.com, placehold.co, picsum, or other remote placeholder hosts (they break offline). Prefer inline SVG, data-URI icons, or /heroes/*.jpg /logo.svg paths that will be filled locally.',
              'Item / product rows: each row is a horizontal flex with a fixed-size image (no overlapping alt text), title, short blurb, and action button. Do not stack broken <img> on top of the label.',
              'NEVER set background: url(/logo.svg) cover on the page — logo.svg is a small nav mark only. Atmosphere comes from gradients or /heroes/*.jpg.',
              'If the brief needs search, messaging, carts, borrow/return, etc. — implement those with useState and real UI states.',
              'ASCII-safe copy only in source (use hyphen - not em/en dashes) so Windows file writes never mojibake.',
            ]
    ),
    'Do NOT ship a centered brand-name splash, Vite title shell, or filler placeholder text.',
    'Do NOT use filler labels like "Book Title 1" or "A brief description of the book" — invent real product names from the brief.',
    'Never reuse stock Nova demo copy ("Light, distilled.", "Quiet by design", "Presence without the noise", "Meet … One", "A singular ritual…") unless the brief literally asks for that wording — invent fresh copy for THIS brand.',
    'Finish the App in this reply — do not trail off or ask to continue.',
    ...premiumWebCraftRulesSafe(String(brief || '')),
    'Nova is free forever — never add paywalls, upgrade CTAs, license gates, or "Pro unlock" screens in the generated UI.',
    '',
    `Product: ${spec.name}`,
    'Must-haves from the brief (implement ALL as working UI):',
    must,
    ...refLines,
    '',
    'Brief:',
    String(brief || spec.brief || '').slice(0, 6000),
  ];
}

/** @deprecated Prefer polishPromptLinesFromBrief. */
export function polishPromptLinesFromIdentity(
  identity: CreateIdentity | CreateBriefSpec,
  appPath: string,
  brief: string,
): string[] {
  const spec: CreateBriefSpec = 'mustHave' in identity && Array.isArray(identity.mustHave)
    ? {
        name: identity.name,
        slug: identity.slug,
        brief: identity.brief || brief,
        mustHave: identity.mustHave,
        referenceSite: identity.referenceSite ?? null,
        referenceMode: identity.referenceMode ?? 'none',
        heroHref: identity.heroHref,
      }
    : createBriefSpecFromAsk(identity.name, brief);
  return polishPromptLinesFromBrief(spec, appPath, brief);
}

/** Ensure App.css is imported wherever App / main exist. */
export function ensureStylesLinked(files: Record<string, string>): {
  files: Record<string, string>;
  changed: string[];
} {
  const next = { ...files };
  const changed: string[] = [];
  if (!next['src/App.css']) return { files: next, changed };

  const targets = ['src/App.jsx', 'src/App.tsx', 'src/main.jsx', 'src/main.tsx'] as const;
  for (const k of targets) {
    const body = next[k];
    if (!body) continue;
    if (/import\s+['"]\.\/App\.css['"]/.test(body)) continue;
    next[k] = `import './App.css';\n${body}`;
    changed.push(k);
  }
  return { files: next, changed };
}

export function stylesAreLinked(files: Record<string, string>): boolean {
  if (!files['src/App.css']) return true;
  const app = files['src/App.jsx'] || files['src/App.tsx'] || '';
  const main = files['src/main.jsx'] || files['src/main.tsx'] || '';
  return /import\s+['"]\.\/App\.css['"]/.test(app) || /import\s+['"]\.\/App\.css['"]/.test(main);
}

/** Product stage when photo search and image models both miss. Not a reused landscape photo.
 *  Never draws a toy tablet / home-button bezel — that shipped as “Apple Live” and looked like a stub.
 */
export function svgHeroDataUrl(
  identity: { name: string; palette?: CreatePalette; category?: string },
  label = '',
): string {
  const p = identity.palette || NEUTRAL;
  const name = identity.name || 'Brand';
  const tag = String(label || name).replace(/[-_]+/g, ' ').slice(0, 28);
  const cat = String(identity.category || tag || '').toLowerCase();
  const appleish = /\b(?:apple|iphone|ipad|mac|watch|airpods|product[- ]?home)\b/i.test(`${name} ${tag} ${cat}`);
  if (appleish || /product|device|phone|laptop|watch|earbuds/i.test(cat)) {
    return svgPremiumProductStageDataUrl({ name, tag, palette: p });
  }
  // Soft abstract stage — gradient field + brand type. No fake device chrome.
  const hue = [...tag].reduce((n, c) => n + c.charCodeAt(0), 40) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${p.bg}"/><stop offset="100%" stop-color="${p.panel}"/>
</linearGradient>
<radialGradient id="glow" cx="50%" cy="42%" r="45%">
<stop offset="0%" stop-color="hsl(${hue},35%,55%)" stop-opacity="0.35"/>
<stop offset="100%" stop-color="${p.bg}" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="1600" height="900" fill="url(#g)"/>
<rect width="1600" height="900" fill="url(#glow)"/>
<rect x="560" y="220" width="480" height="420" rx="36" fill="${p.panel}" opacity="0.55"/>
<rect x="600" y="260" width="400" height="300" rx="20" fill="#0a0a0c" opacity="0.85"/>
<text x="800" y="780" text-anchor="middle" fill="${p.text}" font-family="SF Pro Display, Helvetica Neue, system-ui, sans-serif" font-size="42" font-weight="650">${escapeXml(name)}</text>
<text x="800" y="830" text-anchor="middle" fill="${p.text}" font-family="SF Pro Text, Helvetica Neue, system-ui, sans-serif" font-size="20" opacity="0.65">${escapeXml(tag)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Full-bleed product stage for apple.com-class heroes — no bezel / home-button toy. */
export function svgPremiumProductStageDataUrl(opts: {
  name: string;
  tag?: string;
  palette?: CreatePalette;
  kind?: 'phone' | 'laptop' | 'tablet' | 'watch' | 'buds' | 'stage';
}): string {
  const p = opts.palette || NEUTRAL;
  const name = opts.name || 'Brand';
  const tag = String(opts.tag || name).slice(0, 32);
  const kind = opts.kind
    || (/mac|laptop/i.test(tag) ? 'laptop'
      : /ipad|tablet/i.test(tag) ? 'tablet'
      : /watch/i.test(tag) ? 'watch'
      : /airpods|buds|ear/i.test(tag) ? 'buds'
      : /iphone|phone/i.test(tag) ? 'phone'
      : 'stage');
  let product = '';
  if (kind === 'laptop') {
    product = `<rect x="420" y="210" width="760" height="460" rx="18" fill="#1d1d1f"/>
<rect x="448" y="236" width="704" height="400" rx="8" fill="#000"/>
<rect x="380" y="670" width="840" height="28" rx="6" fill="#2c2c2e"/>
<rect x="560" y="698" width="480" height="14" rx="4" fill="#3a3a3c"/>`;
  } else if (kind === 'tablet') {
    product = `<rect x="520" y="140" width="560" height="640" rx="36" fill="#1d1d1f"/>
<rect x="548" y="168" width="504" height="584" rx="18" fill="#000"/>`;
  } else if (kind === 'watch') {
    product = `<rect x="720" y="200" width="160" height="280" rx="36" fill="#1d1d1f"/>
<rect x="736" y="220" width="128" height="200" rx="24" fill="#0a0a0a"/>
<rect x="760" y="160" width="80" height="40" rx="8" fill="#2c2c2e"/>
<rect x="760" y="480" width="80" height="60" rx="8" fill="#2c2c2e"/>`;
  } else if (kind === 'buds') {
    product = `<rect x="680" y="280" width="240" height="300" rx="48" fill="#f5f5f7"/>
<circle cx="740" cy="400" r="36" fill="#1d1d1f"/>
<circle cx="860" cy="400" r="36" fill="#1d1d1f"/>
<rect x="760" y="520" width="80" height="24" rx="12" fill="#d2d2d7"/>`;
  } else {
    // phone / generic stage — thin silhouette, soft screen glow, no home button
    product = `<rect x="640" y="160" width="320" height="600" rx="44" fill="#1d1d1f"/>
<rect x="658" y="186" width="284" height="548" rx="28" fill="#000"/>
<rect x="760" y="176" width="80" height="8" rx="4" fill="#2c2c2e"/>
<rect x="678" y="220" width="244" height="480" rx="8" fill="#111827" opacity="0.9"/>
<circle cx="800" cy="280" r="70" fill="#2997ff" opacity="0.12"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#000000"/><stop offset="100%" stop-color="#1d1d1f"/>
</linearGradient>
</defs>
<rect width="1600" height="900" fill="url(#bg)"/>
${product}
<text x="800" y="820" text-anchor="middle" fill="#f5f5f7" font-family="SF Pro Display, Helvetica Neue, system-ui, sans-serif" font-size="48" font-weight="650">${escapeXml(name)}</text>
<text x="800" y="868" text-anchor="middle" fill="#a1a1a6" font-family="SF Pro Text, Helvetica Neue, system-ui, sans-serif" font-size="22">${escapeXml(tag)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reject obvious wrong-media dumps for the brief category (food ≠ radio, etc.). */
export function heroResultMatchesCategory(
  identity: CreateIdentity | CreateBriefSpec,
  titleOrTags: string,
): boolean {
  const hay = String(titleOrTags || '').toLowerCase();
  if (!hay.trim()) return true;
  const brief = String(
    (identity as CreateBriefSpec)?.brief
    || (identity as CreateIdentity)?.brief
    || (identity as CreateIdentity)?.name
    || '',
  ).toLowerCase();
  const foodBrief = /\b(?:date|dates|medjool|deglet|fruit|bakery|pastry|bread|cafe|coffee|chocolate|honey|olive|food|restaurant)\b/.test(brief);
  const hardwareBrief = /\b(?:mouse|keyboard|headset|pc\s*case|chassis|gpu|laptop|gaming)\b/.test(brief)
    && !foodBrief;
  if (foodBrief && /\b(?:radio|electronics|transistor|cassette|vacuum\s*tube|oscilloscope|circuit|motherboard|dial\s*gauge)\b/.test(hay)) {
    return false;
  }
  if (hardwareBrief && /\b(?:croissant|bakery|pastry|bouquet|tulip|kitten|puppy)\b/.test(hay)) {
    return false;
  }
  return true;
}

/**
 * Brief-accuracy Ready misses — structural honesty only, no palette/layout lookbook.
 */
export function briefCreateMisses(
  spec: CreateBriefSpec,
  files: Record<string, string>,
): string[] {
  const misses: string[] = [];
  const css = files['src/App.css'] || '';
  const app = files['src/App.jsx'] || files['src/App.tsx'] || '';

  if (css && !stylesAreLinked(files)) {
    misses.push('App.css exists but App/main do not import ./App.css');
  }
  if (!app.trim() || app.length < 120) {
    misses.push('App is still empty or too thin for the brief');
  }
  // Multi-restaurant booking must not be a single-kitchen splash.
  if (/\brestaurant/i.test(spec.brief) && /\b(?:any|search|pick|choose|browse|list)\b/i.test(spec.brief)) {
    if (!/\bsearch\b/i.test(app) && !/filter|query|find/i.test(app)) {
      misses.push('brief asks for restaurant search/browse but App has no search');
    }
  }

  for (const need of spec.mustHave || []) {
    const n = String(need || '').toLowerCase();
    if (/time\s*slot|booking flow|reserv/i.test(n)) {
      const hasSlots = /\b(?:slot|time|schedule|datetime|select)\b/i.test(app)
        && (/\buseState\b/.test(app) || /\bReact\.useState\b/.test(app));
      if (!hasSlots) misses.push(`missing working booking / time-slot UI (${need})`);
    }
    // Only real confirmation must-haves — not "who has" inside a borrow-action string.
    if (/confirmation step|on-screen confirmation|email or on-screen/i.test(n)) {
      if (!/\b(?:confirm|checked\s*out|reserved|success|booking|claimedBy|picked\s*up)\b/i.test(app)
        || !(/\buseState\b/.test(app) || /\bReact\.useState\b/.test(app))) {
        misses.push(`missing confirmation / checked-out state (${need})`);
      }
    }
    // "email or on-screen confirmation" — on-screen confirm alone is enough.
    if (/email or on-screen confirmation/i.test(n)) {
      const hasConfirm = /\b(?:confirm|claimedBy|picked\s*up|success|reserved|confirmation)\b/i.test(app)
        && (/\buseState\b/.test(app) || /\bReact\.useState\b/.test(app));
      const hasEmail = /email|mailto|@/i.test(app);
      if (!hasConfirm && !hasEmail) {
        misses.push(`missing email / confirmation path (${need})`);
      }
    } else if (/^\s*email\b/i.test(n) || (/\bemail\b/i.test(n) && !/on-screen confirmation/i.test(n) && !/borrow/i.test(n))) {
      if (!/email|mailto|@/i.test(app)) {
        misses.push(`missing email / confirmation path (${need})`);
      }
    }
    if (/browseable tool|tool \/ item list|browseable shelf/i.test(n)) {
      if ((app.match(/\btool-item\b|<li[\s>]/gi) || []).length < 2
        && !/\b(?:map\(|\.map\s*\()/i.test(app)) {
        misses.push(`missing browseable item list (${need})`);
      }
    }
    if (/borrow action that marks who has/i.test(n)) {
      if (!/\bborrow\b/i.test(app) || !(/\buseState\b/.test(app) || /\bReact\.useState\b/.test(app))) {
        misses.push(`missing borrow / checked-out state (${need})`);
      }
    }
    if (/return action that clears checkout/i.test(n)) {
      if (!/\breturn\b/i.test(app) || !(/\buseState\b/.test(app) || /\bReact\.useState\b/.test(app))) {
        misses.push(`missing return action (${need})`);
      }
    }
    if (/cart or purchase/i.test(n)) {
      if (!/\bcart\b|\bcheckout\b|addToCart|add.to.cart/i.test(app)) {
        misses.push(`missing cart / purchase actions (${need})`);
      }
    }
  }

  // Flat card-row stubs fail when the brief asked for a real product flow.
  if (spec.mustHave.some((m) => /book|slot|confirm|cart|checkout|borrow|return action|shelf/i.test(m))) {
    const sectionCount = (app.match(/<(?:section|main|header|footer|nav)\b/gi) || []).length;
    const hasState = /\buseState\b|\bReact\.useState\b/.test(app);
    const hasBorrowFlow = /\bborrow\b/i.test(app) && /\breturn\b/i.test(app) && hasState;
    if (!hasState) misses.push('product brief needs interactive state (useState), not static cards');
    // Lending shelf with real borrow/return state is enough even without <section> tags.
    if (sectionCount < 2 && app.length < 2200 && !hasBorrowFlow) {
      misses.push('product UI too shallow — need richer sections and flow, not a title + two cards');
    }
  }

  return misses;
}

/** @deprecated Lookbook identity misses removed — delegates to briefCreateMisses. */
export function identityCreateMisses(
  identity: CreateIdentity | CreateBriefSpec,
  files: Record<string, string>,
): string[] {
  const spec = createBriefSpecFromAsk(identity.name, 'brief' in identity ? identity.brief : '');
  if ('mustHave' in identity && Array.isArray(identity.mustHave)) {
    spec.mustHave = identity.mustHave;
    spec.brief = identity.brief || spec.brief;
    spec.referenceMode = identity.referenceMode || 'none';
    spec.referenceSite = identity.referenceSite ?? null;
  }
  return briefCreateMisses(spec, files);
}

/**
 * Soft heal only: link CSS + rewrite legacy /heroes/hero.jpg to slug path.
 * Never rewrite palette/layout into a lookbook recipe.
 */
export function healFilesToIdentity(
  identity: CreateIdentity | CreateBriefSpec,
  files: Record<string, string>,
  _companionCssBuilder?: (id: CreateIdentity) => string,
): { files: Record<string, string>; healed: string[] } {
  let next = { ...files };
  const healed: string[] = [];
  const linked = ensureStylesLinked(next);
  next = linked.files;
  if (linked.changed.length) healed.push(`linked:${linked.changed.join(',')}`);

  const heroHref = identity.heroHref || `/heroes/${slugify(identity.name)}-hero.jpg`;
  const storyHref = heroHref.replace(/-hero(\.|$)/, '-story$1');

  for (const k of Object.keys(next)) {
    if (!/\.(?:jsx|tsx|css|html)$/i.test(k)) continue;
    let body = next[k];
    const before = body;
    body = body.replace(/\/heroes\/hero\.jpg/gi, heroHref);
    body = body.replace(/\/heroes\/story\.jpg/gi, storyHref);
    if (body !== before) {
      next[k] = body;
      healed.push(`hero-path:${k}`);
    }
  }

  return { files: next, healed };
}
