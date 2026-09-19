/**
 * CreateBriefSpec — brief-only create contract.
 * No category lookbook (bakery/Discord/Veopx). Every create invents from THIS ask.
 */

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

/** Neutral palette — model invents the real look from the brief. Not a lookbook. */
const NEUTRAL: CreatePalette = {
  bg: '#f7f7f5',
  panel: '#ffffff',
  text: '#171717',
  muted: '#737373',
  accent: '#2563eb',
  glow: '#e5e5e5',
  btnInk: '#ffffff',
  font: 'Georgia, "Times New Roman", serif',
  line: 'rgba(23,23,23,0.12)',
};

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
  const t = String(brief || '');
  const url = extractReferenceSiteUrlLocal(t);
  const wantsInspiration = Boolean(
    url
    || /\b(?:use|as)\s+(?:a\s+)?(?:layout\s+)?(?:reference|inspiration)\b/i.test(t)
    || /\binspired\s+by\b/i.test(t)
    || /\blayout\s+(?:like|from)\b/i.test(t),
  );
  return { url, wantsInspiration };
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
  if (/\bcart\b|\bcheckout\b|\bpurchase\b|\bbuy\b/i.test(t) && !lendingBrief) {
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
  const ref = explicitReferenceAsk(text);
  return {
    name: product,
    slug,
    brief: text,
    mustHave: extractMustHaveFromBrief(text),
    referenceSite: ref.wantsInspiration ? (ref.url || null) : null,
    referenceMode: ref.wantsInspiration ? 'layout-inspiration' : 'none',
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
    palette: { ...NEUTRAL },
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

  const refLines = spec.referenceMode === 'layout-inspiration'
    ? [
        '',
        'Layout inspiration (NOT a clone):',
        spec.referenceSite
          ? `- User pointed at ${spec.referenceSite} for hierarchy/clarity/spacing only.`
          : '- User asked for layout inspiration from a known site — match clarity and hierarchy only.',
        '- Rebuild an ORIGINAL product UI for THIS brief. Do not copy brand marks, copy, or proprietary assets.',
        '- Do not ship a lookalike homepage of that reference.',
      ]
    : [
        '',
        'No external lookbook. Do not imitate Discord, Slack, Apple.com, Veopx, bakery shop templates, or any prior Nova demo.',
      ];

  return [
    'Build the FIRST real product UI for this new project from the user brief alone.',
    'Output ONLY @@@FILE blocks — no preface, no plan.',
    `Write ALL UI in @@@FILE ${appPath} and @@@FILE src/App.css only.`,
    'Do NOT create ./components/* — one App file with the full UI inline.',
    `MUST import './App.css' at the top of ${appPath}.`,
    'Invent a unique visual language for THIS brand (palette, type, layout). Never reuse a prior shell.',
    'PREMIUM depth required: layered background (gradient/atmosphere), strong type hierarchy, generous spacing, polished cards — not a flat title + two buttons on charcoal.',
    'Implement the REAL flows from the brief (borrow/return, browse, booking, cart, etc.). Do not invent a generic time-slot booking flow unless the brief asks for appointments/reservations.',
    'Images: NEVER use via.placeholder.com, placehold.co, picsum, or other remote placeholder hosts (they break offline). Prefer inline SVG, data-URI icons, or /heroes/*.jpg /logo.svg paths that will be filled locally.',
    'Item / product rows: each row is a horizontal flex with a fixed-size image (no overlapping alt text), title, short blurb, and action button. Do not stack broken <img> on top of the label.',
    'NEVER set background: url(/logo.svg) cover on the page — logo.svg is a small nav mark only. Atmosphere comes from gradients or /heroes/*.jpg.',
    'If public/logo.svg or /icons/*.svg will exist, reference them in the nav (<img src="/logo.svg" />, search, bag). Do not leave those files unused.',
    'If the brief needs search, messaging, carts, borrow/return, etc. — implement those with useState and real UI states.',
    'Do NOT ship a centered brand-name splash, Vite title shell, or filler placeholder text.',
    'Do NOT use filler labels like "Book Title 1" or "A brief description of the book" — invent real product names from the brief.',
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

/** SVG hero in neutral colors — only when photo search fails; not a category poster. */
export function svgHeroDataUrl(identity: { name: string; palette?: CreatePalette; category?: string }): string {
  const p = identity.palette || NEUTRAL;
  const name = identity.name || 'Brand';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${p.glow}"/><stop offset="55%" stop-color="${p.bg}"/>
<stop offset="100%" stop-color="${p.panel}"/></linearGradient></defs>
<rect width="1600" height="900" fill="url(#g)"/>
<circle cx="1280" cy="180" r="220" fill="${p.accent}" opacity="0.18"/>
<circle cx="320" cy="720" r="280" fill="${p.accent}" opacity="0.12"/>
<text x="80" y="120" fill="${p.text}" font-family="Georgia,serif" font-size="64" font-weight="700">${escapeXml(name)}</text>
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

/** No category nouns — accept Openverse results unless clearly junk. */
export function heroResultMatchesCategory(
  _identity: CreateIdentity | CreateBriefSpec,
  titleOrTags: string,
): boolean {
  const hay = String(titleOrTags || '').toLowerCase();
  if (!hay.trim()) return true;
  // Soft reject obvious wrong-media dumps when the brief clearly isn't about them —
  // callers that care can still use the photo; we no longer force bakery≠radio.
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
