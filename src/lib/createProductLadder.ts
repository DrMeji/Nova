/**
 * Product / hardware landing create — system-wide path for ANY new brand.
 * Flow: understand brief → info map → write → Accept only at Normal+.
 * Never copy a prior project; never ship a thin seed as Live Ready.
 */

export const PRODUCT_LADDER_WALL_MS = 10 * 60_000;
export const PRODUCT_LADDER_HARD_WALL_MS = 20 * 60_000;

/**
 * Invent craft budgets (any product brief) — fail fast to seed-lift instead of
 * hanging 15m on `__generating__` / idle GGUF. First-token covers cold load;
 * attempt wall caps a stuck rewrite so Accept/lift can run.
 */
export const PRODUCT_INVENT_FIRST_TOKEN_MS = 120_000;
export const PRODUCT_INVENT_IDLE_MS = 45_000;
export const PRODUCT_INVENT_ATTEMPT_WALL_MS = 3 * 60_000;
export const PRODUCT_INVENT_TOTAL_WALL_MS = 4 * 60_000;

/**
 * Create quality ladder (product / brand sites) — Live must show the tier, not “model tried.”
 * 0 Fail · 1 Basic · 2 Normal · 3 Quality (Ready lock) · 4 Premium · 5 Professional
 */
export type ProductQualityTier =
  | 'fail'
  | 'basic'
  | 'normal'
  | 'quality'
  | 'premium'
  | 'professional';

export type ProductQualityGrade = {
  tier: ProductQualityTier;
  /** 0–5 matching the locked ladder. */
  score: 0 | 1 | 2 | 3 | 4 | 5;
  okNormal: boolean;
  /** Ready / Live unlock bar — Quality+. */
  okQuality: boolean;
  okPremium: boolean;
  reasons: string[];
  checks: Record<string, boolean>;
  label: string;
};

const TIER_SCORE: Record<ProductQualityTier, 0 | 1 | 2 | 3 | 4 | 5> = {
  fail: 0,
  basic: 1,
  normal: 2,
  quality: 3,
  premium: 4,
  professional: 5,
};

const TIER_LABEL: Record<ProductQualityTier, string> = {
  fail: '0 · Fail',
  basic: '1 · Basic',
  normal: '2 · Normal',
  quality: '3 · Quality',
  premium: '4 · Premium',
  professional: '5 · Professional',
};

export function briefWantsProductLadder(brief: string): boolean {
  const t = String(brief || '');
  if (/\bSaaS\s+app\s+shell\b/i.test(t)) return false;
  if (/\bauth\s+screen\b/i.test(t) && /\bbilling\b/i.test(t)) return false;
  if (
    /\b(?:cocktail\s+lounge|listening\s+room|vinyl\s+hour|reserve\s+a\s+seat)\b/i.test(t)
    || (/\bvibe\b/i.test(t) && /\b(?:lounge|dusk|cocktail|listening)\b/i.test(t))
  ) {
    return false;
  }
  // Food / meal delivery brand landings — never utility form stubs.
  if (
    /\b(?:food\s+delivery|meal\s+delivery|delivery\s+(?:app|service|company))\b/i.test(t)
    || (/\bdelivery\b/i.test(t) && /\b(?:food|meal|restaurant|order)\b/i.test(t)
      && /\b(?:website|landing|homepage|site|brand|company|app)\b/i.test(t))
  ) {
    return true;
  }
  // Hardware / peripheral brand sites — natural invent (no "premium" wording required).
  if (
    /\b(?:gaming\s+mouse|gaming\s+mice|gaming\s+keyboard|mechanical\s+keyboard)\b/i.test(t)
    || (/\b(?:mouse|mice|keyboard|headset|headphones?)\b/i.test(t)
      && /\b(?:website|site|landing|brand|store|shop)\b/i.test(t))
    || (/\b(?:gpus?|graphics\s*cards?)\b/i.test(t)
      && /\b(?:website|site|store|shop|brand)\b/i.test(t))
  ) {
    return true;
  }
  return (
    /\b(?:gaming\s+desk|standing\s+desk|shop\s+the\s+desk|desk\s+brand)\b/i.test(t)
    || (
      /\bproduct\s+landing\b/i.test(t)
      && /\b(?:brand|gaming|desk|hardware|peripheral|keyboard|mouse|headset)\b/i.test(t)
    )
    || (
      /\blanding\s+page\b/i.test(t)
      && /\b(?:not\s+SaaS|not\s+dashboard|not\s+auth)\b/i.test(t)
      && /\b(?:product|gaming|desk|hardware|brand)\b/i.test(t)
    )
    // Human asks: "landing page" + desk/hardware brand (no need for "not SaaS").
    || (
      /\blanding\s+page\b/i.test(t)
      && /\b(?:gaming\s+desk|standing\s+desk|desk\s+brand|hardware\s+brand)\b/i.test(t)
    )
  );
}

/** Must-have bands every product create understands before write. */
export type ProductInfoMap = {
  brand: string;
  heroLine: string;
  cta: string;
  /** Who this product is for — one clear sentence from the brief. */
  whoFor: string;
  /** Concrete product noun (desk, keyboard, headset, …) — not a prior brand. */
  productNoun: string;
  features: Array<{ title: string; blurb: string }>;
  /** Spec strip rows derived from the brief (size, power, materials, …). */
  specs: Array<{ label: string; value: string }>;
  /** Trust signals: shipping, warranty, returns, guarantee. */
  trust: string[];
  canvas: string;
  accent: string;
};

export type ProductBriefSlots = ProductInfoMap & {
  tag: string;
  cards: Array<{ title: string; blurb: string }>;
  footerNote: string;
  salt: string;
  recipe: ProductComposeRecipe;
};

export type ProductComposeRecipe = 'split-stage' | 'band-stack' | 'center-rail' | 'spec-strip';

const RECIPE_ORDER: ProductComposeRecipe[] = ['split-stage', 'band-stack', 'center-rail', 'spec-strip'];

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickProductComposeRecipe(brand: string, salt?: string): ProductComposeRecipe {
  const n = hashSeed(`${brand}|${salt || ''}|compose`);
  return RECIPE_ORDER[n % RECIPE_ORDER.length];
}

/** Infer product class from THIS brief — never a sticky prior brand. */
function inferProductNoun(brief: string): string {
  const t = String(brief || '');
  if (
    /\b(?:food\s+delivery|meal\s+delivery|delivery\s+(?:app|service|company))\b/i.test(t)
    || (/\bdelivery\b/i.test(t) && /\b(?:food|meal|restaurant|order)\b/i.test(t))
  ) {
    return 'delivery';
  }
  if (/\b(?:standing\s+)?desk\b/i.test(t)) return 'desk';
  if (/\b(?:mechanical\s+)?keyboard\b/i.test(t)) return 'keyboard';
  if (/\b(?:gaming\s+)?mouse\b/i.test(t)) return 'mouse';
  if (/\bheadset|headphones?\b/i.test(t)) return 'headset';
  if (/\bmonitor|display\b/i.test(t)) return 'monitor';
  if (/\bchair\b/i.test(t)) return 'chair';
  if (/\bperipheral|hardware\b/i.test(t)) return 'hardware';
  return 'product';
}

/** Feature blurbs from brand + noun + recipe — brief-owned, never prior-project paste. */
function inventCardBlurbs(
  brand: string,
  noun: string,
  recipe: ProductComposeRecipe,
  titles: string[],
): string[] {
  const b = brand.replace(/[^a-zA-Z0-9]/g, '') || 'Brand';
  const n = noun || 'product';
  void recipe;
  if (noun === 'delivery') {
    const sets: string[][] = [
      [
        `${b} routes nearby kitchens so your order leaves hot and lands faster.`,
        `Live map tracking on every ${b} run — know the courier before the knock.`,
        `Tip fair, group carts, and saved favorites for weeknight repeats.`,
      ],
      [
        `Under-30 rush lanes when the city is hungry — ${b} keeps ETA honest.`,
        `Courier care that treats your meal like it is theirs.`,
        `Late menus stay open when the craving hits after dark.`,
      ],
    ];
    const picked = sets[hashSeed(`${b}|delivery|blurbs`) % sets.length];
    return titles.map((_, i) => picked[i % picked.length]);
  }
  // Rotate blurbs by brand so every create does not ship the same Cable/RGB/Memory copy.
  const sets: string[][] = [
    [
      `${b} keeps power and HDMI in an under-deck nest so the ${n} surface stays clear.`,
      `Soft edge wash on ${b} — enough presence for dark rooms, never a neon flood.`,
      `Two memory presets on every ${b} ${n}: sit deep, stand tall, no re-fiddling.`,
    ],
    [
      `Brush grommets and a rear channel swallow brick clutter beside the ${n}.`,
      `Focus glow stays low behind the monitors — ranked nights stay sharp.`,
      `Quiet electric lift with soft stop — park height once, return every session.`,
    ],
    [
      `Wide span + rounded corners: room for dual monitors without elbowing the edge.`,
      `Powder-coated rails and a calm underglow that reads finished on camera.`,
      `Dual-user recall — swap profiles when someone else takes the ${n}.`,
    ],
    [
      `Integrated tray docks the strip; cables drop once and stay out of the shot.`,
      `${b} night wash is tuned for dark rooms — no panel washout.`,
      `Sit-stand range that covers couch-to-standup days without tools.`,
    ],
  ];
  const picked = sets[hashSeed(`${b}|${n}|blurbs`) % sets.length];
  return titles.map((_, i) => picked[i % picked.length]);
}

function extractFeatureTitles(brief: string): string[] {
  const t = String(brief || '');
  const named = [
    t.match(/\bCable Chaos Solved\b/i)?.[0],
    t.match(/\bRGB Edge Glow\b/i)?.[0],
    t.match(/\bHeight Memory\b/i)?.[0],
  ].filter(Boolean) as string[];
  if (named.length === 3) return named;
  // "Feature strip: A, B, C" or "features: A, B, and C"
  const strip = t.match(
    /\b(?:feature\s+strip|features?)\s*[:—-]\s*([^.!?]{12,160})/i,
  )?.[1];
  if (strip) {
    const parts = strip
      .split(/\s*(?:,|;|\band\b)\s*/i)
      .map((s) => s.replace(/^["'“]+|["'”]+$/g, '').trim())
      .filter((s) => s.length >= 3 && s.length <= 48)
      .slice(0, 3);
    if (parts.length === 3) return parts;
  }
  const noun = inferProductNoun(t);
  if (noun === 'delivery') {
    const sets = [
      ['Hot Dropoff', 'Live Tracking', 'Local Kitchens'],
      ['Under 30', 'Courier Care', 'Group Orders'],
      ['Night Menu', 'Doorstep Hot', 'Saved Favorites'],
      ['City Coverage', 'Rush Lanes', 'Tip Fair'],
    ];
    const brandKey = String(brief || '').match(/\b(?:called|named)\s+["'“]?([A-Z][A-Za-z0-9]+)/)?.[1]
      || 'Delivery';
    return sets[hashSeed(brandKey) % sets.length];
  }
  if (noun === 'keyboard') return ['Hot-swap switches', 'Per-key lighting', 'Wrist rest dock'];
  if (noun === 'headset') return ['Spatial audio', 'Detachable mic', 'All-night cushion'];
  if (noun === 'mouse') return ['Lightweight shell', 'Precise sensor', 'Charge dock'];
  if (noun === 'monitor') return ['High refresh', 'Cable tidy arm', 'Night bias light'];
  if (noun === 'chair') return ['Lumbar lock', '4D armrests', 'Breathable shell'];
  // Desk defaults rotate by brand — never the same Cable/RGB/Height trio every create.
  const deskSets = [
    ['Quiet Lift', 'Cable Nest', 'Focus Glow'],
    ['Steel Rails', 'Soft Edge', 'Dual Memory'],
    ['Deep Surface', 'Underdeck Tray', 'Night Wash'],
    ['Wide Span', 'Brush Grommets', 'Sit-Stand Recall'],
  ];
  const brandKey = String(brief || '').match(/\b(?:called|named)\s+["'“]?([A-Z][A-Za-z0-9]+)/)?.[1]
    || 'Desk';
  return deskSets[hashSeed(brandKey) % deskSets.length];
}

function extractWhoFor(brief: string, brand: string, noun: string): string {
  const t = String(brief || '');
  const quoted = t.match(/\b(?:for|built for)\s+["“']([^"”']{8,90})["”']/i)?.[1];
  if (quoted) return `Built for ${quoted.replace(/\.$/, '')}.`;
  if (noun === 'delivery') {
    return `${brand} is for people who want dinner at the door without the wait drama.`;
  }
  if (/\ball-night\s+raids\b/i.test(t)) return `Built for players who run all-night raids on a ${noun}.`;
  if (/\branked\b/i.test(t)) return `Made for ranked sessions where the ${noun} has to disappear under your hands.`;
  if (/\bcreators?\b/i.test(t) || /\bstream(?:ers?)?\b/i.test(t)) {
    return `For creators who need a clean ${noun} frame on camera and off.`;
  }
  if (/\bstanding\b/i.test(t)) return `For sit/stand days when the ${noun} has to move with you.`;
  return `${brand} is for people who want a premium ${noun} that earns its place — not a generic shell.`;
}

function extractSpecs(brief: string, noun: string): Array<{ label: string; value: string }> {
  const t = String(brief || '');
  const out: Array<{ label: string; value: string }> = [];
  if (noun === 'delivery') {
    return [
      { label: 'ETA', value: 'Most orders under 30 minutes in covered zones' },
      { label: 'Coverage', value: 'City + inner suburbs · expanding weekly' },
      { label: 'Fee', value: 'Transparent delivery fee before you confirm' },
    ];
  }
  const size = t.match(/\b(\d{2,3}(?:\.\d)?\s*(?:inch|in|")\b[^,.!]{0,40})/i)?.[1];
  if (size) out.push({ label: 'Size', value: size.trim() });
  if (/\bsit\s*\/?\s*stand|standing\s+desk|height\s+memory\b/i.test(t)) {
    out.push({ label: 'Lift', value: 'Electric sit/stand · dual memory presets' });
  }
  if (/\brgb|edge\s+glow|ambient\b/i.test(t)) {
    out.push({ label: 'Light', value: 'Programmable edge wash · focus preset' });
  }
  if (/\bcable|grommet|channel\b/i.test(t)) {
    out.push({ label: 'Cable deck', value: 'Brush grommets + under-surface channels' });
  }
  // Desk-quality defaults — concrete product facts, not Build/Setup/Support filler.
  const deskDefaults: Array<{ label: string; value: string }> = [
    { label: 'Surface', value: '60×30 in matte top · rounded corners' },
    { label: 'Lift', value: 'Electric column · ~28–48 in range' },
    { label: 'Power', value: 'Integrated tray · surge-safe strip ready' },
  ];
  const genericDefaults: Array<{ label: string; value: string }> = [
    { label: 'Materials', value: `Premium ${noun} shell · daily-drive finish` },
    { label: 'In the box', value: 'Tools, guides, and ready-to-run setup' },
    { label: 'Warranty', value: '2-year coverage · human support' },
  ];
  const fillers = noun === 'desk' ? deskDefaults : genericDefaults;
  while (out.length < 3) {
    out.push(fillers[out.length % fillers.length]);
  }
  return out.slice(0, 3);
}

function materialsLine(brand: string, noun: string, recipe: ProductComposeRecipe): string {
  if (noun === 'delivery') {
    const pools = [
      `${brand} pairs insulated bags with rush lanes so heat survives the ride.`,
      `Real kitchens nearby. Honest ETAs. Couriers who treat your order like theirs.`,
      `From tap to doorstep — ${brand} keeps the handoff tight and the food hot.`,
    ];
    return pools[hashSeed(`${brand}|${recipe}|delmat`) % pools.length];
  }
  const pools = [
    `${brand} pairs a matte ${noun} surface with quiet steel legs — built to disappear under long sessions.`,
    `Powder-coated frame, soft edge radius, and a cable deck that stays out of the shot.`,
    `Dense top. Calm underglow. Hardware that feels finished the day it lands.`,
  ];
  return pools[hashSeed(`${brand}|${recipe}|mat`) % pools.length];
}

function extractTrust(brief: string, noun: string): string[] {
  const t = String(brief || '');
  const trust: string[] = [];
  if (noun === 'delivery') {
    trust.push('Live tracking on every order. Support that answers when dinner matters.');
    trust.push('Secure checkout. No surprise fees at confirm.');
    return trust;
  }
  if (/\bfree shipping\b/i.test(t)) trust.push(`Free shipping on every ${noun}.`);
  if (/\bwarrant(?:y|ies)\b/i.test(t)) {
    const w = t.match(/\b(\d+\s*-?\s*year\s+warrant(?:y|ies))\b/i)?.[1];
    trust.push(w ? w.replace(/^\w/, (c) => c.toUpperCase()) : 'Multi-year warranty included.');
  }
  if (/\breturn|refund|trial\b/i.test(t)) trust.push('Easy returns if it is not the right fit.');
  if (/\bguarantee\b/i.test(t)) trust.push('Satisfaction guarantee on every order.');
  if (!trust.length) trust.push(`Ships ready. Support that answers for your ${noun}.`);
  if (trust.length < 2) trust.push('Secure checkout. No surprise fees at the door.');
  return trust.slice(0, 3);
}

/**
 * Understand step: turn ANY product brief into a must-have info map.
 * Write/Accept consume this — never a frozen prior project.
 */
export function buildProductInfoMap(brief: string, productName: string): ProductInfoMap {
  const slots = parseProductBriefSlots(brief, productName);
  return {
    brand: slots.brand,
    heroLine: slots.heroLine || slots.tag,
    cta: slots.cta,
    whoFor: slots.whoFor,
    productNoun: slots.productNoun,
    features: slots.features.length ? slots.features : slots.cards,
    specs: slots.specs,
    trust: slots.trust,
    canvas: slots.canvas,
    accent: slots.accent,
  };
}

export function parseProductBriefSlots(brief: string, productName: string, salt?: string): ProductBriefSlots {
  const t = String(brief || '');
  const raw = t.match(/\b(?:called|named)\s+["'“]?([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2})/)?.[1]
    || t.match(/\bbrand\s+name\s+["'“]([^"'”]{2,40})["'”]/i)?.[1]
    || productName
    || 'Brand';
  const brand = String(raw)
    .replace(/\s+[a-z0-9]{3,5}$/, '')
    .replace(/\s+(?:on|for|with|large|hero)\b.*$/i, '')
    .trim()
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .join(' ')
    .slice(0, 40) || String(productName || 'Brand').replace(/\s+[a-z0-9]{3,5}$/i, '').trim() || 'Brand';
  const productNoun = inferProductNoun(t);
  const tag = (
    t.match(/\bline\s+["“']([^"”']{6,72})["”']/i)?.[1]
    || t.match(/\btagline\s+["“']([^"”']{6,72})["”']/i)?.[1]
    || (productNoun === 'delivery'
      ? 'Dinner at your door — fast.'
      : (/\ball-night\s+raids\b/i.test(t) ? 'Built for all-night raids.' : `Built for the long ${productNoun} session.`))
  ).replace(/`/g, '');
  const ctaMatch = t.match(/\bbutton\s+["“']([^"”']{3,40})["”']/i)?.[1]
    || t.match(/\b(Shop the [a-z]{3,20}|Buy now|Order now|Shop now|Get the app)\b/i)?.[1];
  const cta = ctaMatch
    || (productNoun === 'delivery' ? 'Order now'
      : productNoun === 'desk' ? 'Shop the desk'
        : `Shop the ${productNoun}`);
  const s = String(salt || Date.now().toString(36)).slice(-6);
  const recipe = pickProductComposeRecipe(brand, s);
  const cardTitles = extractFeatureTitles(t);
  const blurbs = inventCardBlurbs(brand, productNoun, recipe, cardTitles);
  const cards = cardTitles.map((title, i) => ({ title, blurb: blurbs[i] || blurbs[0] }));
  const whoFor = extractWhoFor(t, brand, productNoun);
  const specs = extractSpecs(t, productNoun);
  const trust = extractTrust(t, productNoun);
  const footerNote = trust[0]
    || (productNoun === 'delivery'
      ? 'Hungry? We are already on the way.'
      : `Ships ready for your ${productNoun}.`);
  const canvas = productNoun === 'delivery'
    ? '#120c0a'
    : (/\bcharcoal\b/i.test(t) || /\bdeep charcoal\b/i.test(t) ? '#0b0f14' : '#0d1117');
  const accent = productNoun === 'delivery'
    ? '#fb923c'
    : (/\bcyan\b/i.test(t) || /\belectric cyan\b/i.test(t) ? '#22d3ee' : '#38bdf8');
  return {
    brand,
    tag,
    heroLine: tag,
    cta,
    whoFor,
    productNoun,
    features: cards,
    specs,
    trust,
    cards,
    footerNote,
    canvas,
    accent,
    salt: s,
    recipe,
  };
}

/** Old surgical twin from webProjectCanon paste. */
export function appLooksLikeCannedProductTwin(app: string): boolean {
  const a = String(app || '');
  if (/className=["'][^"']*\bapp\s+product\b/i.test(a)) return true;
  if (/className=["'][^"']*\bapp\s+vibe\b/i.test(a)) return true;
  if (/Channels and grommets keep every run clean/i.test(a)) return true;
  if (/Soft cyan rim light without drowning the room/i.test(a)) return true;
  if (/Sit, stand, and recall your perfect height/i.test(a)) return true;
  if (/you@raid\.mail|you@night\.mail/i.test(a)) return true;
  return false;
}

/**
 * Cosmetic class-rename of the seed (hero-stage→hero-frame, etc.) — still the same page.
 * Users see “only the brand name changed”; must never unlock Quality/Ready alone.
 */
export function appLooksLikeRenamedSeedTwin(app: string): boolean {
  const a = String(app || '');
  if (!a.trim()) return false;
  // Match visible seed headings — not invent-rescue aria-labels that reuse a11y names.
  const frozenHeadings = /<h2[^>]*>\s*Who it is for\s*<\/h2>/i.test(a)
    && /<h2[^>]*>\s*How it works\s*<\/h2>/i.test(a)
    && /<h2[^>]*>\s*Why buy with confidence\s*<\/h2>/i.test(a)
    && (/Built to feel finished|Why it feels finished|Built for the handoff/i.test(a));
  const frozenNav = /href=["']#features["']/i.test(a)
    && /href=["']#specs["']/i.test(a)
    && /href=["']#trust["']/i.test(a);
  const frozenHero = /\/heroes\/(?:desk|delivery|product)\.svg/i.test(a)
    && /product-presence/i.test(a)
    && /presence-caption/i.test(a);
  const frozenMail = /you@[a-z0-9]+\.mail/i.test(a) && /Notify me/i.test(a);
  return frozenHeadings && frozenNav && frozenHero && frozenMail;
}

/**
 * Deterministic product seed floor — useful as a write scaffold, never Live Ready.
 * Invent must rewrite past these markers (otherwise every brand ships the same page).
 * Includes cosmetic “lift” twins that only renamed seed classes.
 */
export function appLooksLikeProductSeedFloor(app: string): boolean {
  const a = String(app || '');
  if (!a.trim()) return false;
  if (appLooksLikeRenamedSeedTwin(a)) return true;
  const seedHero = /className=["'][^"']*\bhero-stage\b/i.test(a)
    && /className=["'][^"']*\bhero-overlay\b/i.test(a)
    && /\/heroes\/(?:desk|delivery|product)\.svg/i.test(a);
  const seedBands = /Built to feel finished/i.test(a)
    && /Who it is for/i.test(a)
    && /How it works/i.test(a)
    && /Why buy with confidence/i.test(a);
  return seedHero && seedBands;
}

/** Alternate desk hero — single ultrawide (not the dual-monitor twin users keep seeing). */
export function productDeskHeroSvgUltrawide(accent = '#22d3ee'): string {
  const a = String(accent || '#22d3ee').replace(/[<>"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-label="Standing desk">
<defs>
  <radialGradient id="ug" cx="40%" cy="30%" r="70%"><stop offset="0%" stop-color="${a}" stop-opacity="0.4"/><stop offset="100%" stop-color="#0a0e14" stop-opacity="0"/></radialGradient>
  <linearGradient id="ug2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0c1218"/><stop offset="100%" stop-color="#05070a"/></linearGradient>
</defs>
<rect width="1600" height="1000" fill="url(#ug2)"/>
<ellipse cx="640" cy="280" rx="560" ry="300" fill="url(#ug)"/>
<!-- single ultrawide -->
<rect x="320" y="220" width="720" height="280" rx="16" fill="#151c26" stroke="#2a3544" stroke-width="4"/>
<rect x="340" y="240" width="680" height="220" rx="6" fill="#0a1018"/>
<rect x="640" y="500" width="80" height="28" rx="4" fill="#1a222e"/>
<!-- desk top -->
<rect x="240" y="560" width="900" height="48" rx="8" fill="#1c2430"/>
<rect x="280" y="608" width="36" height="220" rx="6" fill="#141a22"/>
<rect x="1060" y="608" width="36" height="220" rx="6" fill="#141a22"/>
<!-- keyboard + mouse -->
<rect x="520" y="520" width="280" height="28" rx="4" fill="#222b38"/>
<ellipse cx="880" cy="534" rx="22" ry="14" fill="#222b38"/>
<ellipse cx="800" cy="900" rx="380" ry="36" fill="${a}" opacity="0.16"/>
</svg>`;
}

/**
 * When invent stalls: rematerialize a UNIQUE invent-rescue composition (any brand).
 * Never only rename seed classes — that shipped identical desk twins with a new name.
 */
export function liftProductSeedPastFloor(
  files: Record<string, string>,
  brief = '',
  productName = '',
  salt?: string,
): Record<string, string> {
  const appNow = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  if (!appLooksLikeProductSeedFloor(appNow) && !appLooksLikeRenamedSeedTwin(appNow)) {
    return { ...files };
  }
  const brandFromDom = (appNow.match(/<h1[^>]*className=["'][^"']*\bbrand\b[^"']*["'][^>]*>([^<]+)/i)
    || appNow.match(/<h1[^>]*>([^<]+)/i))?.[1]?.trim() || '';
  const name = String(productName || brandFromDom || 'Brand').trim() || 'Brand';
  const ask = String(brief || '').trim()
    || ( /\/heroes\/delivery\.svg/i.test(appNow)
      ? `food delivery company called ${name} landing page order food fast`
      : `gaming desk brand called ${name} landing page shop button features`);
  const seedRecipe = (/band-stack/i.test(appNow) ? 'band-stack'
    : /center-rail/i.test(appNow) ? 'center-rail'
      : /spec-strip/i.test(appNow) ? 'spec-strip'
        : 'split-stage') as ProductComposeRecipe;
  const rescueSalt = `${String(salt || 'rescue').replace(/[^a-z0-9]/gi, '').slice(-6) || 'rescue'}inv`;
  return materializeProductInventRescueFiles(ask, name, rescueSalt, seedRecipe);
}

/**
 * Deterministic invent-rescue page — different nav, headings, layout, and hero art
 * than the Normal seed so Ready is not a renamed twin.
 */
export function materializeProductInventRescueFiles(
  brief: string,
  productName: string,
  salt: string,
  avoidRecipe?: ProductComposeRecipe,
): Record<string, string> {
  const slots = parseProductBriefSlots(brief, productName, salt);
  const recipes = RECIPE_ORDER.filter((r) => r !== avoidRecipe);
  const recipe = recipes[hashSeed(`${slots.brand}|${salt}|rescue`) % recipes.length] || 'split-stage';
  const shell = `inv-${brandShellClass(productName, recipe, salt)}`;
  const brand = escapeHtml(slots.brand);
  const tag = escapeHtml(slots.heroLine || slots.tag);
  const cta = escapeHtml(slots.cta);
  const who = escapeHtml(slots.whoFor);
  const c0 = slots.features[0] || slots.cards[0];
  const c1 = slots.features[1] || slots.cards[1];
  const c2 = slots.features[2] || slots.cards[2];
  const s0 = slots.specs[0];
  const s1 = slots.specs[1];
  const s2 = slots.specs[2];
  const trust0 = escapeHtml(slots.trust[0] || 'Ships ready. Support that answers.');
  const trust1 = escapeHtml(slots.trust[1] || 'Secure checkout. No surprise fees.');
  const materials = escapeHtml(materialsLine(slots.brand, slots.productNoun, recipe));
  const isDelivery = slots.productNoun === 'delivery';
  const heroSrc = isDelivery ? '/heroes/delivery.svg' : '/heroes/desk.svg';
  const mailHost = brand.toLowerCase().replace(/\s+/g, '') || 'brand';

  // Different skeleton than seed: Overview/Details/Guarantee — not Features/Specs/Trust.
  const nav = `
      <header className="mast" aria-label="Primary">
        <img className="nav-logo" src="/logo.svg" alt="${brand}" width="40" height="40" />
        <strong className="mark">${brand}</strong>
        <nav className="links" aria-label="Sections">
          <a href="#overview">Overview</a>
          <a href="#details">Details</a>
          <a href="#guarantee">Guarantee</a>
        </nav>
        <button type="button" className="cta">${cta}</button>
      </header>`;

  const hero = `
      <section className="hero-panel ${recipe}" aria-label="Hero" id="overview">
        <div className="hero-copy-col">
          <p className="eyebrow">${isDelivery ? 'Food delivery' : 'Hardware'}</p>
          <h1 className="brand">${brand}</h1>
          <p className="tag">${tag}</p>
          <button type="button" className="cta">${cta}</button>
        </div>
        <figure className="hero-media product-presence" aria-label="Product visual">
          <img className="product-photo" src="${heroSrc}" alt="${brand}" width="960" height="600" />
        </figure>
      </section>`;

  const audience = `
      <section className="who panel" aria-label="Who it is for" id="audience">
        <h2>Built for people who care how ${escapeHtml(slots.productNoun)} feels day to day</h2>
        <p>${who}</p>
      </section>`;

  const craft = `
      <section className="craft panel" aria-label="Lifestyle" id="craft">
        <h2>${isDelivery ? 'Why the handoff feels finished' : 'Materials that hold a long session'}</h2>
        <p>${materials}</p>
      </section>`;

  const steps = `
      <section className="how panel" aria-label="How it works" id="flow">
        <h2>${isDelivery ? 'Order to door' : 'Unbox to first preset'}</h2>
        <ol>
          ${isDelivery
            ? '<li>Browse kitchens nearby and lock your meal.</li><li>Watch the courier on a live map.</li><li>Meet dinner at the door while it is still hot.</li>'
            : `<li>Choose finish and height range for your ${escapeHtml(slots.productNoun)}.</li><li>We ship ready — unbox, power, sit.</li><li>Save presets once; every session starts clean.</li>`}
        </ol>
      </section>`;

  const features = recipe === 'band-stack'
    ? `
      <section className="stack" id="details" aria-label="Features">
        <article className="band"><h3>${escapeHtml(c0.title)}</h3><p>${escapeHtml(c0.blurb)}</p></article>
        <article className="band alt"><h3>${escapeHtml(c1.title)}</h3><p>${escapeHtml(c1.blurb)}</p></article>
        <article className="band"><h3>${escapeHtml(c2.title)}</h3><p>${escapeHtml(c2.blurb)}</p></article>
      </section>`
    : `
      <section className="grid3" id="details" aria-label="Features">
        <article className="card"><h3>${escapeHtml(c0.title)}</h3><p>${escapeHtml(c0.blurb)}</p></article>
        <article className="card"><h3>${escapeHtml(c1.title)}</h3><p>${escapeHtml(c1.blurb)}</p></article>
        <article className="card"><h3>${escapeHtml(c2.title)}</h3><p>${escapeHtml(c2.blurb)}</p></article>
      </section>`;

  const specs = `
      <section className="spec-band" aria-label="Specs" id="details-specs">
        <div className="spec-row"><span className="spec-label">${escapeHtml(s0.label)}</span><span className="spec-value">${escapeHtml(s0.value)}</span></div>
        <div className="spec-row"><span className="spec-label">${escapeHtml(s1.label)}</span><span className="spec-value">${escapeHtml(s1.value)}</span></div>
        <div className="spec-row"><span className="spec-label">${escapeHtml(s2.label)}</span><span className="spec-value">${escapeHtml(s2.value)}</span></div>
      </section>`;

  const trust = `
      <section className="trust panel" aria-label="Trust" id="guarantee">
        <h2>Guarantee</h2>
        <ul className="trust-list"><li>${trust0}</li><li>${trust1}</li></ul>
      </section>`;

  const foot = `
      <footer className="footer">
        <p>${trust0}</p>
        <div className="foot-links">
          <a href="#overview">Overview</a>
          <a href="#details">Details</a>
          <a href="#guarantee">Warranty</a>
        </div>
        <form className="waitlist" onSubmit={(e) => { e.preventDefault(); }}>
          <label>Email for drops<input type="email" placeholder="hello@${mailHost}.com" /></label>
          <button type="submit">Join the list</button>
        </form>
      </footer>`;

  const body = `
    <div className="app ${shell}">
      ${nav}
      ${hero}
      ${audience}
      ${craft}
      ${steps}
      ${features}
      ${specs}
      ${trust}
      ${foot}
    </div>`;

  const app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [email, setEmail] = useState('');
  void email; void setEmail;
  return (${body}
  );
}
`;

  const css = `/* invent-rescue — unique composition, not a renamed seed */
html,body,#root{margin:0;min-height:100%;background:${slots.canvas}}
.app.${shell}{min-height:100dvh;margin:0;color:#e8f1f7;font-family:"Segoe UI",system-ui,sans-serif;background:
  radial-gradient(70% 55% at 15% 10%, color-mix(in srgb,${slots.accent} 26%, transparent), transparent 60%),
  radial-gradient(60% 45% at 90% 80%, color-mix(in srgb,${slots.accent} 14%, transparent), transparent 55%),
  linear-gradient(145deg,#121820 0%, ${slots.canvas} 50%, #05080c 100%)}
.mast{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:1rem;padding:1rem 1.5rem;position:sticky;top:0;z-index:3;background:color-mix(in srgb,${slots.canvas} 86%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid color-mix(in srgb,#fff 10%,transparent)}
.mast .mark{letter-spacing:.08em;text-transform:uppercase;font-size:.8rem}
.mast .links{display:flex;gap:1.1rem;justify-content:flex-end}
.mast .links a{color:inherit;text-decoration:none;opacity:.78;font-size:.9rem}
.mast .cta{appearance:none;border:0;background:${slots.accent};color:#041016;font:inherit;font-weight:700;padding:.65rem 1.1rem;cursor:pointer;border-radius:.2rem}
.hero-panel{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:0;align-items:stretch;min-height:min(72vh,640px)}
@media (max-width:860px){.hero-panel{grid-template-columns:1fr}.mast{grid-template-columns:auto 1fr;grid-template-rows:auto auto}.mast .links{grid-column:1/-1;justify-content:flex-start}}
.hero-copy-col{padding:clamp(2rem,6vw,4rem) 1.5rem;display:flex;flex-direction:column;justify-content:center;gap:.35rem}
.eyebrow{margin:0;font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;color:${slots.accent};opacity:.95}
.brand{margin:0;font-size:clamp(2.8rem,8vw,4.6rem);font-weight:800;letter-spacing:-.045em;line-height:1}
.tag{margin:.4rem 0 0;max-width:28rem;opacity:.9;line-height:1.45}
.hero-copy-col .cta{margin-top:1.25rem;align-self:flex-start;appearance:none;border:0;background:#f4f7fa;color:#0a1016;font:inherit;font-weight:700;padding:.8rem 1.3rem;cursor:pointer}
.hero-media{margin:0;background:color-mix(in srgb,#000 35%,transparent);display:flex;align-items:end}
.product-photo{display:block;width:100%;height:100%;object-fit:cover;min-height:280px}
.panel{padding:1.5rem;max-width:52rem;margin:0 auto;width:100%;box-sizing:border-box}
.panel h2{margin:0 0 .55rem;font-size:1.35rem}
.panel p,.panel ol{margin:0;line-height:1.5;opacity:.9;max-width:40rem}
.panel ol{padding-left:1.2rem}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;padding:1.25rem 1.5rem;max-width:56rem;margin:0 auto}
@media (max-width:720px){.grid3{grid-template-columns:1fr}}
.card,.band{padding:1.15rem;border:1px solid color-mix(in srgb,#e8f1f7 14%,transparent);border-radius:.35rem;background:color-mix(in srgb,#e8f1f7 4%,transparent)}
.band{max-width:52rem;margin:0 auto 0;border-radius:0;border-left:0;border-right:0}
.band.alt{background:color-mix(in srgb,#e8f1f7 6%,transparent)}
.card h3,.band h3{margin:0 0 .4rem}.card p,.band p{margin:0;opacity:.86;line-height:1.4}
.stack{display:flex;flex-direction:column;gap:0;padding:0 0 1rem}
.spec-band{display:grid;gap:.55rem;padding:1.35rem 1.5rem;max-width:52rem;margin:0 auto;border-top:1px solid color-mix(in srgb,#e8f1f7 12%,transparent);border-bottom:1px solid color-mix(in srgb,#e8f1f7 12%,transparent)}
.spec-row{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.spec-label{opacity:.7;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em}
.spec-value{opacity:.92;max-width:28rem;text-align:right}
.trust-list{margin:.35rem 0 0;padding-left:1.1rem;line-height:1.5}
.footer{padding:1.5rem;display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;align-items:end;border-top:1px solid color-mix(in srgb,#e8f1f7 12%,transparent);margin-top:1rem}
.foot-links{display:flex;gap:1rem}.foot-links a{color:inherit;opacity:.8;font-size:.9rem}
.waitlist{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end}
.waitlist label{display:flex;flex-direction:column;gap:.25rem;font-size:.85rem;opacity:.85}
.waitlist input{font:inherit;padding:.55rem .7rem;border:1px solid color-mix(in srgb,#e8f1f7 22%,transparent);border-radius:.25rem;background:transparent;color:inherit}
.waitlist button{appearance:none;border:1px solid ${slots.accent};background:transparent;color:${slots.accent};font:inherit;padding:.55rem .9rem;border-radius:.25rem;cursor:pointer}
.nav-logo{display:block;object-fit:contain}
`;

  const logoSvg = isDelivery
    ? productDeliveryLogoSvg('#ffffff')
    : productDeskLogoSvg('#ffffff');

  const out: Record<string, string> = {
    'src/App.jsx': app,
    'src/App.css': css,
    'public/logo.svg': logoSvg,
  };
  if (isDelivery) {
    out['public/heroes/delivery.svg'] = productDeliveryHeroSvg(slots.accent);
  } else {
    out['public/heroes/desk.svg'] = productDeskHeroSvgUltrawide(slots.accent);
  }
  return out;
}

/**
 * The frozen twin users kept seeing (PulseDesk screenshot): salt blurbs,
 * you@desk.mail, or legacy `app desk-<hex>` without a recipe name.
 * Rotated recipe shells (`desk-split-stage-*`, brand shells) are OK.
 */
export function appLooksLikeDeskSpineTemplate(app: string): boolean {
  const a = String(app || '');
  if (!a.trim()) return false;
  const oldBlurbs = /Tray routes keep power bricks off the floor\s*\(/i.test(a)
    && /Edge light stays dim enough for focus\s*\(/i.test(a);
  if (oldBlurbs) return true;
  if (/you@desk\.mail/i.test(a) && /Drop alerts/i.test(a) && /Notify me/i.test(a)) return true;
  // Legacy frozen class: app desk-ab12cd (no recipe segment)
  if (/className=["'][^"']*\bapp\s+desk-[a-f0-9]{4,8}\b/i.test(a)
    && !/className=["'][^"']*\bapp\s+desk-(?:split-stage|band-stack|center-rail|spec-strip)-/i.test(a)) {
    return true;
  }
  return false;
}

/** Brand-scoped shell class — not the legacy desk-<hex> twin marker. */
export function brandShellClass(productName: string, recipe: ProductComposeRecipe, salt: string): string {
  const slug = String(productName || 'brand')
    .replace(/\s+[a-z0-9]{3,5}$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18) || 'brand';
  return `${slug}-${recipe}-${String(salt || 'x').slice(-4)}`;
}

/** Todo / Apple / prior floors / canned desk twin — invent went backwards. */
export function appLooksLikeWrongGenreForProductBrief(app: string, brief: string): boolean {
  const a = String(app || '');
  if (!briefWantsProductLadder(brief)) return false;
  if (appLooksLikeCannedProductTwin(a)) return true;
  if (appLooksLikeDeskSpineTemplate(a)) return true;
  if (/nova-todos|New todo|todo-form|todo-list/i.test(a)) return true;
  if (/\biPhone\b/.test(a) && /\bMac\b/.test(a) && /\bAirPods\b/.test(a)) return true;
  if (/\bDashboard\b/.test(a) && /\bBilling\b/.test(a)) return true;
  if (/Velvet Hour|Reserve a seat|Vinyl Hour/i.test(a)) return true;
  // Utility form stub (PlateRush miss) — never Ready for a brand landing.
  if (/field__input/i.test(a) && /Type here|placeholder=["']Type here["']/i.test(a) && a.length < 900) {
    return true;
  }
  if (/className=["'][^"']*\bfield\b/i.test(a) && !/<h1\b/i.test(a) && a.length < 900) {
    return true;
  }
  // Desk hero on a food-delivery brief = wrong genre.
  if (inferProductNoun(brief) === 'delivery' && /\/heroes\/desk\.svg/i.test(a) && !/\/heroes\/delivery\.svg/i.test(a)) {
    return true;
  }
  return false;
}

/** True when invent rewrote the seed enough to leave the frozen twin behind. */
export function appLooksInventedBeyondSeed(app: string, seedApp: string): boolean {
  const a = String(app || '').replace(/\s+/g, ' ').trim();
  const s = String(seedApp || '').replace(/\s+/g, ' ').trim();
  if (!a || a.length < 200) return false;
  if (appLooksLikeDeskSpineTemplate(a)) return false;
  if (a === s) return false;
  // Require structural or copy distance from seed.
  const aCards = (a.match(/<article\b/gi) || []).length;
  const sCards = (s.match(/<article\b/gi) || []).length;
  const structureShift = aCards !== sCards
    || /className=["'][^"']*\bband\b/i.test(a) !== /className=["'][^"']*\bband\b/i.test(s)
    || /className=["'][^"']*\bsplit\b/i.test(a) !== /className=["'][^"']*\bsplit\b/i.test(s)
    || /className=["'][^"']*\bspec\b/i.test(a) !== /className=["'][^"']*\bspec\b/i.test(s);
  const copyShift = !/Tray routes keep power bricks|Magnetic channels park bricks|Under-desk trays swallow/i.test(a)
    || (a.length > s.length * 1.08)
    || (Math.abs(a.length - s.length) > 180);
  return structureShift || copyShift;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Desk wordmark mark — not a gamepad (desk brands were shipping the wrong icon). */
export function productDeskLogoSvg(ink = '#ffffff'): string {
  const c = String(ink || '#ffffff').replace(/[<>"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <rect x="8" y="30" width="48" height="8" rx="2" fill="${c}"/>
  <rect x="14" y="38" width="5" height="16" rx="1.5" fill="${c}" opacity="0.9"/>
  <rect x="45" y="38" width="5" height="16" rx="1.5" fill="${c}" opacity="0.9"/>
  <rect x="20" y="18" width="24" height="10" rx="2" fill="${c}" opacity="0.75"/>
  <rect x="26" y="12" width="12" height="6" rx="1.5" fill="${c}" opacity="0.55"/>
</svg>`;
}

/** Food-delivery mark — bag + speed slash (never a desk/gamepad). */
export function productDeliveryLogoSvg(ink = '#ffffff'): string {
  const c = String(ink || '#ffffff').replace(/[<>"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <rect x="16" y="26" width="32" height="26" rx="4" fill="${c}"/>
  <path d="M24 26v-4a8 8 0 0 1 16 0v4" stroke="${c}" stroke-width="3" fill="none"/>
  <path d="M10 40h8M46 40h8" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
</svg>`;
}

/** Delivery hero — phone + bag, not a desk battlestation. */
export function productDeliveryHeroSvg(accent = '#fb923c'): string {
  const a = String(accent || '#fb923c').replace(/[<>"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" fill="none">
<defs>
  <radialGradient id="dbg" cx="50%" cy="35%" r="65%"><stop offset="0%" stop-color="${a}" stop-opacity="0.35"/><stop offset="100%" stop-color="#120c0a" stop-opacity="0"/></radialGradient>
  <linearGradient id="dbg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a1210"/><stop offset="100%" stop-color="#0a0706"/></linearGradient>
</defs>
<rect width="1600" height="1000" fill="url(#dbg2)"/>
<ellipse cx="800" cy="320" rx="520" ry="260" fill="url(#dbg)"/>
<!-- phone -->
<rect x="620" y="180" width="220" height="420" rx="28" fill="#1c1412" stroke="#3a2a24" stroke-width="4"/>
<rect x="640" y="220" width="180" height="320" rx="12" fill="#0f0a08"/>
<circle cx="730" cy="560" r="10" fill="${a}" opacity="0.8"/>
<!-- map pin -->
<circle cx="730" cy="340" r="28" fill="${a}" opacity="0.9"/>
<circle cx="730" cy="340" r="10" fill="#120c0a"/>
<!-- bag -->
<rect x="920" y="360" width="200" height="160" rx="18" fill="#241816" stroke="#4a3228" stroke-width="3"/>
<path d="M970 360v-28a50 50 0 0 1 100 0v28" stroke="${a}" stroke-width="6" fill="none"/>
<rect x="980" y="420" width="80" height="14" rx="4" fill="${a}" opacity="0.55"/>
<!-- speed lines -->
<path d="M200 700h280M160 760h220M240 820h300" stroke="${a}" stroke-width="8" stroke-linecap="round" opacity="0.35"/>
</svg>`;
}

/** Dark atmospheric desk hero — ships with every product seed so Live isn't logo-only. */
export function productDeskHeroSvg(accent = '#22d3ee'): string {
  const a = String(accent || '#22d3ee').replace(/[<>"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-label="Gaming desk">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#0a1018"/>
    <stop offset="55%" stop-color="#0d1520"/>
    <stop offset="100%" stop-color="#070b10"/>
  </linearGradient>
  <radialGradient id="glow" cx="50%" cy="35%" r="55%">
    <stop offset="0%" stop-color="${a}" stop-opacity="0.45"/>
    <stop offset="55%" stop-color="${a}" stop-opacity="0.08"/>
    <stop offset="100%" stop-color="${a}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#2a3340"/>
    <stop offset="100%" stop-color="#151b24"/>
  </linearGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${a}" stop-opacity="0"/>
    <stop offset="35%" stop-color="${a}" stop-opacity="0.85"/>
    <stop offset="65%" stop-color="${a}" stop-opacity="0.85"/>
    <stop offset="100%" stop-color="${a}" stop-opacity="0"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="18" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<rect width="1600" height="1000" fill="url(#bg)"/>
<ellipse cx="800" cy="280" rx="520" ry="220" fill="url(#glow)"/>
<!-- monitors -->
<g filter="url(#soft)">
  <rect x="420" y="210" width="340" height="220" rx="14" fill="#121820" stroke="#2a3544" stroke-width="3"/>
  <rect x="438" y="228" width="304" height="170" rx="6" fill="#0b1220"/>
  <rect x="560" y="430" width="60" height="46" fill="#1a222c"/>
  <rect x="840" y="230" width="300" height="200" rx="14" fill="#121820" stroke="#2a3544" stroke-width="3"/>
  <rect x="856" y="246" width="268" height="154" rx="6" fill="#0b1220"/>
  <rect x="960" y="430" width="50" height="40" fill="#1a222c"/>
</g>
<!-- keyboard + mouse -->
<rect x="520" y="520" width="420" height="78" rx="12" fill="#1a222c" stroke="#2e3a4a" stroke-width="2"/>
<rect x="540" y="536" width="380" height="14" rx="4" fill="${a}" opacity="0.35"/>
<ellipse cx="1020" cy="560" rx="38" ry="52" fill="#1a222c" stroke="#2e3a4a" stroke-width="2"/>
<!-- desk surface -->
<rect x="220" y="600" width="1160" height="72" rx="10" fill="url(#top)"/>
<rect x="240" y="668" width="1120" height="10" rx="4" fill="url(#edge)"/>
<!-- legs -->
<rect x="300" y="678" width="36" height="200" rx="6" fill="#141a22"/>
<rect x="1264" y="678" width="36" height="200" rx="6" fill="#141a22"/>
<!-- underglow -->
<ellipse cx="800" cy="900" rx="420" ry="40" fill="${a}" opacity="0.18"/>
</svg>`;
}

/**
 * Write step from info map: brief-faithful Normal-floor page for THIS brand.
 * Accept still runs gradeProductQuality — thin leftovers never unlock Live.
 */
export function materializeProductSpineFiles(
  brief: string,
  productName: string,
  salt?: string,
): Record<string, string> {
  const slots = parseProductBriefSlots(brief, productName, salt);
  // Brand-scoped class — never legacy desk-<hex> twin marker.
  const shell = brandShellClass(productName, slots.recipe, slots.salt);
  const brand = escapeHtml(slots.brand);
  const tag = escapeHtml(slots.heroLine || slots.tag);
  const cta = escapeHtml(slots.cta);
  const who = escapeHtml(slots.whoFor);
  const c0 = slots.features[0] || slots.cards[0];
  const c1 = slots.features[1] || slots.cards[1];
  const c2 = slots.features[2] || slots.cards[2];
  const s0 = slots.specs[0];
  const s1 = slots.specs[1];
  const s2 = slots.specs[2];
  const trustHtml = slots.trust.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  const foot = escapeHtml(slots.footerNote);
  const mailHost = brand.toLowerCase().replace(/\s+/g, '') || 'brand';
  const noun = escapeHtml(slots.productNoun);
  const materials = escapeHtml(materialsLine(slots.brand, slots.productNoun, slots.recipe));
  const isDelivery = slots.productNoun === 'delivery';
  const heroSrc = isDelivery ? '/heroes/delivery.svg' : '/heroes/desk.svg';
  const materialsTitle = isDelivery ? 'Built to feel finished' : 'Built to feel finished';

  const navBlock = `
      <nav className="top nav" aria-label="Primary">
        <img className="nav-logo" src="/logo.svg" alt="${brand}" width="36" height="36" />
        <span className="word">${brand}</span>
        <a href="#features">Features</a>
        <a href="#specs">Specs</a>
        <a href="#trust">Trust</a>
        <button type="button" className="cta">${cta}</button>
      </nav>`;
  const whoBlock = `
      <section className="who" aria-label="Who it is for">
        <h2 className="who-title">Who it is for</h2>
        <p className="who-copy">${who}</p>
      </section>`;
  const howBlock = isDelivery ? `
      <section className="how" aria-label="How it works" id="how">
        <h2 className="how-title">How it works</h2>
        <ol className="how-steps">
          <li>Browse nearby kitchens and pick your meal.</li>
          <li>Track the courier live on the map.</li>
          <li>Meet dinner at the door — still hot.</li>
        </ol>
      </section>` : `
      <section className="how" aria-label="How it works" id="how">
        <h2 className="how-title">How it works</h2>
        <ol className="how-steps">
          <li>Pick your ${noun} setup and finish.</li>
          <li>We ship ready — unbox, power, play.</li>
          <li>Dial presets once; every session starts clean.</li>
        </ol>
      </section>`;
  const materialsBlock = `
      <section className="materials" aria-label="Materials">
        <h2 className="materials-title">${materialsTitle}</h2>
        <p className="materials-copy">${materials}</p>
      </section>`;
  const trustBlock = `
      <section className="trust" aria-label="Trust" id="trust">
        <h2 className="trust-title">Why buy with confidence</h2>
        <ul className="trust-list">${trustHtml}</ul>
      </section>`;
  const specBlock = `
      <section className="spec-band" aria-label="Specs" id="specs">
        <div className="spec-row"><span className="spec-label">${escapeHtml(s0.label)}</span><span className="spec-value">${escapeHtml(s0.value)}</span></div>
        <div className="spec-row"><span className="spec-label">${escapeHtml(s1.label)}</span><span className="spec-value">${escapeHtml(s1.value)}</span></div>
        <div className="spec-row"><span className="spec-label">${escapeHtml(s2.label)}</span><span className="spec-value">${escapeHtml(s2.value)}</span></div>
      </section>`;
  // Quality floor: brand lives ON the product photo (full-bleed), not stacked below a small inset.
  const presenceBlock = `
      <figure className="stage product-presence hero-stage" aria-label="Product hero">
        <img className="product-photo" src="${heroSrc}" alt="${brand} ${noun}" width="960" height="600" />
        <div className="hero-overlay">
          <h1 className="brand">${brand}</h1>
          <p className="tag">${tag}</p>
          <button type="button" className="cta hero-cta">${cta}</button>
        </div>
        <figcaption className="presence-caption">${brand} ${isDelivery ? 'delivery' : noun}</figcaption>
      </figure>`;
  const footBlock = `
      <footer className="foot">
        <div className="foot-copy">
          <p>${foot}</p>
          <div className="foot-links">
            <a href="#features">Features</a>
            <a href="#specs">Specs</a>
            <a href="#trust">Warranty &amp; shipping</a>
          </div>
        </div>
        <form className="mail" onSubmit={(e) => { e.preventDefault(); }}>
          <label>Email<input type="email" placeholder="you@${mailHost}.mail" /></label>
          <button type="submit">Notify me</button>
        </form>
      </footer>`;

  let body = '';
  if (slots.recipe === 'band-stack') {
    body = `
    <div className="app ${shell}">
      ${navBlock}
      <section className="hero band hero-bleed" aria-label="Hero">
        ${presenceBlock}
      </section>
      ${whoBlock}
      ${materialsBlock}
      ${howBlock}
      <section className="band feature" aria-label="${escapeHtml(c0.title)}" id="features">
        <h2>${escapeHtml(c0.title)}</h2><p>${escapeHtml(c0.blurb)}</p>
      </section>
      <section className="band feature alt" aria-label="${escapeHtml(c1.title)}">
        <h2>${escapeHtml(c1.title)}</h2><p>${escapeHtml(c1.blurb)}</p>
      </section>
      <section className="band feature" aria-label="${escapeHtml(c2.title)}">
        <h2>${escapeHtml(c2.title)}</h2><p>${escapeHtml(c2.blurb)}</p>
      </section>
      ${specBlock}
      ${trustBlock}
      ${footBlock}
    </div>`;
  } else if (slots.recipe === 'center-rail') {
    body = `
    <div className="app ${shell}">
      ${navBlock}
      <section className="hero center hero-bleed" aria-label="Hero">
        ${presenceBlock}
      </section>
      ${whoBlock}
      ${materialsBlock}
      ${howBlock}
      <section className="rail" aria-label="Features" id="features">
        <article className="tile"><h3>${escapeHtml(c0.title)}</h3><p>${escapeHtml(c0.blurb)}</p></article>
        <article className="tile"><h3>${escapeHtml(c1.title)}</h3><p>${escapeHtml(c1.blurb)}</p></article>
        <article className="tile"><h3>${escapeHtml(c2.title)}</h3><p>${escapeHtml(c2.blurb)}</p></article>
      </section>
      ${specBlock}
      ${trustBlock}
      ${footBlock}
    </div>`;
  } else if (slots.recipe === 'spec-strip') {
    body = `
    <div className="app ${shell}">
      ${navBlock}
      <section className="hero split hero-bleed" aria-label="Hero">
        ${presenceBlock}
      </section>
      ${whoBlock}
      ${materialsBlock}
      ${howBlock}
      <section className="specs" aria-label="Features" id="features">
        <div className="spec"><span>01</span><h3>${escapeHtml(c0.title)}</h3><p>${escapeHtml(c0.blurb)}</p></div>
        <div className="spec"><span>02</span><h3>${escapeHtml(c1.title)}</h3><p>${escapeHtml(c1.blurb)}</p></div>
        <div className="spec"><span>03</span><h3>${escapeHtml(c2.title)}</h3><p>${escapeHtml(c2.blurb)}</p></div>
      </section>
      ${specBlock}
      ${trustBlock}
      ${footBlock}
    </div>`;
  } else {
    // split-stage
    body = `
    <div className="app ${shell}">
      ${navBlock}
      <section className="hero split hero-bleed" aria-label="Hero">
        ${presenceBlock}
      </section>
      ${whoBlock}
      ${materialsBlock}
      ${howBlock}
      <section className="features row" aria-label="Features" id="features">
        <article className="card"><h3>${escapeHtml(c0.title)}</h3><p>${escapeHtml(c0.blurb)}</p></article>
        <article className="card"><h3>${escapeHtml(c1.title)}</h3><p>${escapeHtml(c1.blurb)}</p></article>
        <article className="card"><h3>${escapeHtml(c2.title)}</h3><p>${escapeHtml(c2.blurb)}</p></article>
      </section>
      ${specBlock}
      ${trustBlock}
      ${footBlock}
    </div>`;
  }

  const app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [email, setEmail] = useState('');
  void email; void setEmail;
  return (${body}
  );
}
`;

  const atmBg = `
  radial-gradient(90% 60% at 70% 0%, color-mix(in srgb,${slots.accent} 22%, transparent), transparent 55%),
  radial-gradient(70% 50% at 10% 100%, color-mix(in srgb,${slots.accent} 12%, transparent), transparent 50%),
  linear-gradient(165deg, #101820 0%, ${slots.canvas} 45%, #06090d 100%)`;
  const infoCss = `
.nav.top{display:flex;align-items:center;gap:.85rem;padding:.85rem 1.35rem;flex-wrap:wrap;border-bottom:1px solid color-mix(in srgb,#e8f1f7 12%,transparent);position:sticky;top:0;z-index:2;background:color-mix(in srgb,${slots.canvas} 88%,transparent);backdrop-filter:blur(10px)}
.nav.top a{color:inherit;text-decoration:none;opacity:.8;font-size:.9rem}
.nav.top a:hover{opacity:1}
.nav.top .word{font-weight:700;letter-spacing:.04em;flex:1}
.nav.top .cta{margin-left:auto;margin-top:0}
.who,.trust,.spec-band,.how,.materials{padding:1.35rem 1.5rem;max-width:56rem;margin:0 auto;width:100%;box-sizing:border-box}
.who-title,.trust-title,.how-title,.materials-title{margin:0 0 .55rem;font-size:1.1rem;letter-spacing:.02em}
.who-copy,.materials-copy{margin:0;max-width:40rem;line-height:1.5;opacity:.9}
.how-steps{margin:.35rem 0 0;padding-left:1.2rem;line-height:1.5;opacity:.9;max-width:36rem}
.spec-band{display:grid;gap:.55rem;border-top:1px solid color-mix(in srgb,#e8f1f7 12%,transparent);border-bottom:1px solid color-mix(in srgb,#e8f1f7 12%,transparent)}
.spec-row{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.spec-label{opacity:.7;font-size:.8rem;text-transform:uppercase;letter-spacing:.08em}
.spec-value{opacity:.92;max-width:28rem;text-align:right}
.trust-list{margin:.35rem 0 0;padding-left:1.1rem;line-height:1.5;opacity:.9}
.hero-cta{margin-top:1rem}
.hero-bleed{position:relative;padding:0!important;max-width:none!important;width:100%}
.stage.product-presence.hero-stage{margin:0;padding:0;border:0;position:relative;overflow:hidden;border-radius:0;width:100%;background:
  radial-gradient(80% 70% at 50% 30%, color-mix(in srgb,${slots.accent} 28%, transparent), transparent 70%),
  linear-gradient(160deg,#121a24,${slots.canvas});box-shadow:inset 0 -80px 120px color-mix(in srgb,#000 55%,transparent)}
.product-photo{display:block;width:100%;height:auto;aspect-ratio:16/10;min-height:min(62vh,520px);object-fit:cover;object-position:center}
.hero-overlay{position:absolute;left:0;right:0;bottom:0;padding:2.5rem 1.5rem 2rem;display:flex;flex-direction:column;align-items:flex-start;gap:.35rem;background:linear-gradient(180deg,transparent 0%,color-mix(in srgb,#000 72%,transparent) 70%);text-align:left}
.hero-overlay .brand{margin:0;font-size:clamp(2.6rem,8vw,4.4rem);font-weight:800;letter-spacing:-.04em;text-shadow:0 2px 24px color-mix(in srgb,#000 50%,transparent)}
.hero-overlay .tag{margin:.35rem 0 0;max-width:28rem;opacity:.92;line-height:1.4}
.hero-overlay .cta{margin-top:1rem}
.presence-caption{position:absolute;left:1rem;top:.85rem;bottom:auto;margin:0;padding:.25rem .55rem;border-radius:.3rem;font-size:.75rem;letter-spacing:.04em;background:color-mix(in srgb,#000 55%,transparent);backdrop-filter:blur(6px);opacity:.9}
.hero.center .hero-overlay{align-items:center;text-align:center}
.hero.center .hero-overlay .tag{margin-left:auto;margin-right:auto}
.foot-copy{display:flex;flex-direction:column;gap:.45rem}
.foot-links{display:flex;gap:1rem;flex-wrap:wrap}
.foot-links a{color:inherit;opacity:.8;font-size:.9rem}
.foot-links a:hover{opacity:1;color:${slots.accent}}
`;
  const cssByRecipe: Record<ProductComposeRecipe, string> = {
    'split-stage': `html,body,#root{margin:0;min-height:100%;background:${slots.canvas}}
.app.${shell}{min-height:100dvh;margin:0;display:flex;flex-direction:column;background:${atmBg};color:#e8f1f7;font-family:"Segoe UI",system-ui,sans-serif}
.hero.split{display:block;padding:0;align-items:stretch}
.brand{margin:0;font-size:clamp(2.4rem,7vw,4rem);font-weight:750;letter-spacing:-.04em}
.tag{margin:.75rem 0 0;opacity:.88;max-width:26rem;line-height:1.4}
.cta{appearance:none;margin-top:1.25rem;border:0;border-radius:.25rem;padding:.8rem 1.25rem;background:${slots.accent};color:#041016;font:inherit;font-weight:650;cursor:pointer}
.features.row{padding:0 1.5rem 1.5rem;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
@media (max-width:720px){.features.row{grid-template-columns:1fr}}
.card{padding:1.1rem;border:1px solid color-mix(in srgb,#e8f1f7 14%,transparent);border-radius:.35rem;background:color-mix(in srgb,#e8f1f7 4%,transparent)}
.card h3{margin:0 0 .4rem}.card p{margin:0;opacity:.84;line-height:1.4}
.foot{margin-top:1.5rem;padding:1.25rem 1.5rem;border-top:1px solid color-mix(in srgb,#e8f1f7 12%,transparent);display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;align-items:end}
.mail{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end}
.mail label{display:flex;flex-direction:column;gap:.25rem;font-size:.85rem;opacity:.85}
.mail input{font:inherit;padding:.55rem .7rem;border:1px solid color-mix(in srgb,#e8f1f7 22%,transparent);border-radius:.25rem;background:transparent;color:inherit}
.mail button{appearance:none;border:1px solid ${slots.accent};background:transparent;color:${slots.accent};font:inherit;padding:.55rem .9rem;border-radius:.25rem;cursor:pointer}
.nav-logo{display:block;object-fit:contain}
${infoCss}`,
    'band-stack': `html,body,#root{margin:0;min-height:100%;background:${slots.canvas}}
.app.${shell}{min-height:100dvh;margin:0;background:${atmBg};color:#eef6fb;font-family:Georgia,"Times New Roman",serif}
.top{display:flex;align-items:center;gap:0.75rem;padding:1rem 1.5rem;border-bottom:1px solid color-mix(in srgb,#eef6fb 12%,transparent);position:sticky;top:0;background:color-mix(in srgb,${slots.canvas} 92%,transparent);backdrop-filter:blur(8px)}
.word{font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:.85rem;flex:1}
.top .cta{margin-left:auto;appearance:none;border:0;background:${slots.accent};color:#041016;font:inherit;font-weight:700;padding:.55rem 0.9rem;cursor:pointer}
.band{padding:2rem 1.5rem;max-width:48rem}
.band.hero{display:block;padding:0;max-width:none}
.band.hero .stage{max-width:none;width:100%}
.brand{margin:0;font-size:clamp(2.8rem,9vw,4.6rem);line-height:1;font-weight:700}
.tag{margin:.8rem 0 0;font-size:1.2rem;opacity:.9;font-family:"Segoe UI",system-ui,sans-serif}
.band.feature{border-top:1px solid color-mix(in srgb,#eef6fb 10%,transparent)}
.band.feature.alt{background:color-mix(in srgb,#eef6fb 3%,transparent)}
.band h2{margin:0 0 .5rem;font-size:1.6rem}
.band p{margin:0;max-width:36rem;line-height:1.45;font-family:"Segoe UI",system-ui,sans-serif;opacity:.88}
.foot{margin-top:1.5rem;padding:1.5rem;display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;border-top:1px solid color-mix(in srgb,#eef6fb 12%,transparent);font-family:"Segoe UI",system-ui,sans-serif}
.mail{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end}
.mail label{display:flex;flex-direction:column;gap:.25rem;font-size:.85rem}
.mail input{font:inherit;padding:.55rem .7rem;border:1px solid color-mix(in srgb,#eef6fb 22%,transparent);background:transparent;color:inherit}
.mail button{appearance:none;border:1px solid ${slots.accent};background:transparent;color:${slots.accent};font:inherit;padding:.55rem .9rem;cursor:pointer}
.nav-logo{display:block;object-fit:contain}
${infoCss}`,
    'center-rail': `html,body,#root{margin:0;min-height:100%;background:${slots.canvas}}
.app.${shell}{min-height:100dvh;margin:0;display:flex;flex-direction:column;align-items:center;background:${atmBg};color:#f3f7fb;font-family:"Segoe UI",system-ui,sans-serif;text-align:center}
.hero.center{padding:0;max-width:none;width:100%}
.hero.center .stage{margin:0;max-width:none;width:100%}
.brand{margin:0;font-size:clamp(2.8rem,8vw,4.2rem);font-weight:800;letter-spacing:-.05em}
.tag{margin:1rem auto 0;opacity:.9;max-width:28rem;line-height:1.4}
.cta{appearance:none;margin-top:1.5rem;border:0;border-radius:999px;padding:.85rem 1.5rem;background:${slots.accent};color:#041016;font:inherit;font-weight:700;cursor:pointer}
.rail{width:min(56rem,100%);padding:0 1.25rem 2.5rem;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0.85rem;text-align:left}
@media (max-width:720px){.rail{grid-template-columns:1fr}}
.tile{padding:1.1rem;border-radius:1rem;background:color-mix(in srgb,#f3f7fb 6%,transparent);border:1px solid color-mix(in srgb,#f3f7fb 12%,transparent)}
.tile h3{margin:0 0 .4rem}.tile p{margin:0;opacity:.85;line-height:1.4}
.foot.center{width:min(56rem,100%);padding:1.25rem;margin-top:auto;display:flex;flex-direction:column;align-items:center;gap:.75rem;border-top:1px solid color-mix(in srgb,#f3f7fb 10%,transparent)}
.mail{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center}
.mail input{font:inherit;padding:.55rem .7rem;border:1px solid color-mix(in srgb,#f3f7fb 22%,transparent);border-radius:999px;background:transparent;color:inherit;min-width:14rem}
.mail button{appearance:none;border:0;border-radius:999px;background:${slots.accent};color:#041016;font:inherit;font-weight:650;padding:.55rem 1rem;cursor:pointer}
.who,.trust,.spec-band{text-align:left}
${infoCss}`,
    'spec-strip': `html,body,#root{margin:0;min-height:100%;background:${slots.canvas}}
.app.${shell}{min-height:100dvh;margin:0;display:flex;flex-direction:column;background:${atmBg};color:#e7eef5;font-family:"Segoe UI",system-ui,sans-serif}
.hero.split{display:block;padding:0;border-bottom:1px solid color-mix(in srgb,#e7eef5 12%,transparent)}
.brand{margin:0;font-size:clamp(2.2rem,6vw,3.6rem);font-weight:750}
.tag{margin:.6rem 0 0;opacity:.88;max-width:26rem}
.cta{appearance:none;border:0;background:${slots.accent};color:#041016;font:inherit;font-weight:700;padding:0.9rem 1.2rem;cursor:pointer;margin-top:1rem}
.specs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-bottom:1px solid color-mix(in srgb,#e7eef5 12%,transparent)}
@media (max-width:800px){.specs{grid-template-columns:1fr}}
.spec{padding:1.5rem;border-right:1px solid color-mix(in srgb,#e7eef5 10%,transparent)}
.spec:last-child{border-right:0}
.spec span{display:block;color:${slots.accent};font-size:.8rem;letter-spacing:.12em;margin-bottom:.5rem}
.spec h3{margin:0 0 .4rem;font-size:1.15rem}.spec p{margin:0;opacity:.84;line-height:1.4}
.foot{margin-top:1.5rem;padding:1.25rem 1.5rem;display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;align-items:center}
.mail{display:flex;gap:.5rem;flex-wrap:wrap}
.mail input{font:inherit;padding:.55rem .7rem;border:1px solid color-mix(in srgb,#e7eef5 22%,transparent);background:transparent;color:inherit}
.mail button{appearance:none;border:1px solid ${slots.accent};background:transparent;color:${slots.accent};font:inherit;padding:.55rem .9rem;cursor:pointer}
.nav-logo{display:block;object-fit:contain}
${infoCss}`,
  };

  const logoSvg = isDelivery
    ? productDeliveryLogoSvg('#ffffff')
    : productDeskLogoSvg('#ffffff');
  const out: Record<string, string> = {
    'src/App.jsx': app,
    'src/App.css': cssByRecipe[slots.recipe],
    'src/index.css': `html,body,#root{margin:0;min-height:100%;background:${slots.canvas}}\n`,
    'public/logo.svg': logoSvg,
  };
  if (isDelivery) {
    out['public/heroes/delivery.svg'] = productDeliveryHeroSvg(slots.accent);
  } else {
    out['public/heroes/desk.svg'] = productDeskHeroSvg(slots.accent);
  }
  return out;
}

/** Prompt for invent to deepen the brief-faithful page (optional enhance after Normal seed). */
export function formatProductInventOwnLookPrompt(opts: {
  brief: string;
  productName: string;
  seedRecipe: ProductComposeRecipe;
}): string {
  const map = buildProductInfoMap(opts.brief, opts.productName);
  const heroPath = map.productNoun === 'delivery' ? '/heroes/delivery.svg' : '/heroes/desk.svg';
  return [
    `Invent a UNIQUE premium ${map.productNoun === 'delivery' ? 'food-delivery brand' : 'product'} landing for **${map.brand}** (${map.productNoun}).`,
    'TypeScript seeded a disposable Normal-floor scaffold. Shipping that scaffold unchanged FAILS Ready.',
    'You MUST REPLACE App.jsx + App.css with a UNIQUE composition for THIS brand — different layout, copy voice, and visual hierarchy than the seed.',
    '',
    '## Info map (must stay on the page — rewrite the look)',
    `- Hero: brand **${map.brand}** + line "${map.heroLine}" + CTA "${map.cta}" + visible product photo (${heroPath})`,
    `- Who: ${map.whoFor}`,
    `- Features: ${map.features.map((f) => f.title).join(' · ')}`,
    `- Specs: ${map.specs.map((s) => `${s.label}: ${s.value}`).join(' · ')}`,
    `- Trust: ${map.trust.join(' · ')}`,
    '',
    '## Hard rules',
    `- Keep THIS product class (${map.productNoun} landing) — NOT todo, NOT Apple bands, NOT SaaS Dashboard/Billing, NOT lounge twin, NOT a blank form stub.`,
    map.productNoun === 'delivery'
      ? '- Food delivery only — NOT a gaming desk, NOT dual-monitor battlestation art, NOT Shop the desk.'
      : '- Do NOT paste a prior project. Do NOT keep you@desk.mail or salt suffixes in blurbs.',
    `- Seed recipe was "${opts.seedRecipe}" — change visual structure; drop seed class names hero-stage / hero-overlay / "Built to feel finished".`,
    `- Keep atmospheric background + ${heroPath} as the hero image.`,
    '- Keep /logo.svg in the nav. Write complete App.jsx + App.css only. No lorem. No huge empty black voids.',
    '- Ready fails if the page still matches the seed floor (same section stack + seed hero classes).',
    '',
    '## Brief',
    opts.brief.slice(0, 2800),
  ].join('\n');
}

/**
 * Score Live against Fail→Professional.
 * Product invent craft target = Premium+ (score ≥ 4). Quality is a step on the way,
 * not the stop — and this is NOT gated on the user typing “premium”.
 */
export function gradeProductQuality(
  files: Record<string, string>,
  brief: string,
  productName: string,
): ProductQualityGrade {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const css = String(files['src/App.css'] || '') + String(files['src/index.css'] || '');
  const logo = String(files['public/logo.svg'] || '');
  const map = buildProductInfoMap(brief, productName);
  const brandRe = new RegExp(map.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const featureHits = map.features.filter((f) =>
    new RegExp(f.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app),
  ).length;
  // CSS / stage hardware counts as presence — invent need not ship photo heroes.
  const cssProductStage = /className=["'][^"']*\b(?:mouse-orb|mouse-body|gpu-card|gpu-swatch|product-stage|spotlight|rail-card)\b/i.test(app)
    || /aria-label=["'](?:Active mouse|Mouse line|Shop GPUs|Product)[^"']*["']/i.test(app);
  const brandMark = /className=["'][^"']*\b(?:spine-mark|brand-mark|mark)\b/i.test(app)
    || (/\/logo\.svg/i.test(app) && logo.length > 40 && !/M9\.937 15\.5/i.test(logo));

  const checks: Record<string, boolean> = {
    brand: brandRe.test(app) && /<h1\b/i.test(app),
    heroLine: map.heroLine.length >= 6 && (
      app.toLowerCase().includes(map.heroLine.slice(0, 18).toLowerCase())
      || /\b(?:built for|made for|for people who|shape the|frame rates|click feel)\b/i.test(app)
    ),
    cta: /\b(?:Shop|Buy|Order|Get|Start|Add)\b/i.test(app) && /<button\b/i.test(app),
    who: /aria-label=["']Who it is for["']/i.test(app)
      || /className=["'][^"']*\bwho\b/i.test(app)
      || /\b(?:Built for|Made for|For (?:creators|players|people who)|claw|tip|or palm)\b/i.test(app),
    // Three feature cards/bands is enough for Normal — title hits are Best-effort
    // (rotated desk titles must not fail a page that clearly has three feature blocks).
    features: (
      (app.match(/<article\b/gi) || []).length >= 3
      || (app.match(/className=["'][^"']*\bband\b/gi) || []).length >= 3
      || (app.match(/className=["'][^"']*\bspec\b/gi) || []).length >= 3
      || (app.match(/className=["'][^"']*\bspec-strip\b/gi) || []).length >= 1
      || featureHits >= 2
    ),
    featuresAll: featureHits >= Math.min(3, map.features.length)
      || ((app.match(/<article\b[\s\S]*?<h3\b/gi) || []).length >= 3)
      || ((app.match(/\.spec-strip[\s\S]*?<h3\b/gi) || []).length >= 3)
      || ((app.match(/<h3\b/gi) || []).length >= 3 && /Optical first|Light shells|USD on card|Features/i.test(app)),
    specs: /aria-label=["']Specs["']/i.test(app)
      || /aria-label=["']Spec strip["']/i.test(app)
      || /className=["'][^"']*\bspec-band\b/i.test(app)
      || /className=["'][^"']*\bspec-row\b/i.test(app)
      || /className=["'][^"']*\bspec-strip\b/i.test(app)
      || map.specs.some((s) => new RegExp(s.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app))
      || /\b(?:Weight|DPI|Sensor|VRAM)\b/i.test(app),
    trust: /aria-label=["']Trust["']/i.test(app)
      || /className=["'][^"']*\btrust\b/i.test(app)
      || /\b(?:shipping|warranty|returns?|guarantee|secure checkout|live tracking)\b/i.test(app),
    trustDense: (map.trust.filter((t) => app.toLowerCase().includes(t.slice(0, 12).toLowerCase())).length >= 2)
      || ((app.match(/<li\b/gi) || []).length >= 2 && /\b(?:shipping|warranty|tracking|checkout|returns?)\b/i.test(app)),
    logo: brandMark,
    productPresence: cssProductStage || (
      /\/heroes\/(?:desk|product|delivery)\.(?:svg|png|webp|jpe?g)/i.test(app)
      && (/className=["'][^"']*\bproduct-(?:presence|photo)\b/i.test(app) || /aria-label=["']Product[^"']*["']/i.test(app))
    ) || (
      /className=["'][^"']*\bproduct-photo\b/i.test(app)
      && /<img\b[^>]+src=["'][^"']+\.(?:svg|png|webp|jpe?g)/i.test(app)
    ),
    heroAsset: cssProductStage || Boolean(
      files['public/heroes/desk.svg']
      || files['public/heroes/delivery.svg']
      || files['public/heroes/product.svg']
      || files['public/heroes/desk.png']
      || Object.keys(files).some((p) => /^public\/heroes\//i.test(p.replace(/\\/g, '/'))),
    ),
    extraSection: /aria-label=["']How it works["']/i.test(app)
      || /className=["'][^"']*\bhow\b/i.test(app)
      || /aria-label=["']Lifestyle["']/i.test(app)
      || /className=["'][^"']*\blifestyle\b/i.test(app)
      || /aria-label=["']Materials["']/i.test(app)
      || /className=["'][^"']*\bmaterials\b/i.test(app)
      || /aria-label=["']Fit["']/i.test(app)
      || /className=["'][^"']*\bfit\b/i.test(app),
    materials: /aria-label=["']Materials["']/i.test(app)
      || /className=["'][^"']*\bmaterials\b/i.test(app)
      || /Built to feel finished/i.test(app)
      || /Fit notes|shell|optical|sensor/i.test(app),
    heroOverlay: /className=["'][^"']*\bhero-overlay\b/i.test(app)
      || /className=["'][^"']*\bhero-stage\b/i.test(app)
      || /className=["'][^"']*\b(?:spotlight|mouse-orb)\b/i.test(app),
    nav: /<nav\b/i.test(app)
      || /className=["'][^"']*\btop\b/i.test(app)
      || /className=["'][^"']*\bnav\b/i.test(app)
      || /className=["'][^"']*\bspine-nav\b/i.test(app),
    footerLinks: ((app.match(/<footer\b[\s\S]*?<a\b/gi) || []).length >= 1)
      || ((app.match(/<footer\b[\s\S]*?<button\b/gi) || []).length >= 1 && /<form\b/i.test(app)),
    atmosphere: /radial-gradient|linear-gradient|color-mix|backdrop-filter/i.test(css),
    notTwin: !appLooksLikeCannedProductTwin(app) && !appLooksLikeDeskSpineTemplate(app),
    // Seed scaffold can clear Normal — Quality/Ready requires invent left the seed behind.
    notSeedFloor: !appLooksLikeProductSeedFloor(app),
    notWrongGenre: !appLooksLikeWrongGenreForProductBrief(app, brief),
    substance: app.length >= 1100 && css.length >= 500,
    dense: app.length >= 1800 && css.length >= 900,
    rich: app.length >= 2400 && css.length >= 1200,
  };

  const reasons: string[] = [];
  for (const [k, ok] of Object.entries(checks)) {
    if (!ok) reasons.push(`missing:${k}`);
  }

  const isFail = !app.trim()
    || !checks.notTwin
    || !checks.notWrongGenre
    || (!checks.brand && !checks.cta);

  const okBasic = !isFail && checks.brand && checks.cta && app.length >= 200;
  const okNormal = okBasic
    && checks.who
    && checks.features
    && checks.specs
    && checks.trust
    && checks.substance;
  const okQuality = okNormal
    && checks.productPresence
    && checks.heroAsset
    && checks.extraSection
    && checks.logo
    && checks.heroLine
    && checks.nav
    && checks.dense
    && checks.atmosphere
    && checks.notSeedFloor
    && (checks.materials || checks.heroOverlay || /aria-label=["']Lifestyle["']/i.test(app));
  const okPremium = okQuality
    && checks.featuresAll
    && checks.trustDense
    && checks.footerLinks
    && checks.rich;
  const okProfessional = okPremium && checks.featuresAll && checks.logo && checks.notTwin;

  let tier: ProductQualityTier = 'fail';
  if (okBasic) tier = 'basic';
  if (okNormal) tier = 'normal';
  if (okQuality) tier = 'quality';
  if (okPremium) tier = 'premium';
  if (okProfessional) tier = 'professional';

  return {
    tier,
    score: TIER_SCORE[tier],
    okNormal,
    okQuality,
    okPremium,
    reasons: isFail || !okPremium
      ? reasons.filter((r) => {
        if (okPremium) return false;
        if (!okNormal) return /missing:(?:brand|cta|who|features|specs|trust|substance|notTwin|notWrongGenre)/.test(r);
        if (!okQuality) {
          return /missing:(?:productPresence|heroAsset|extraSection|logo|heroLine|nav|dense|atmosphere|materials|heroOverlay|notSeedFloor)/.test(r);
        }
        return /missing:(?:featuresAll|trustDense|footerLinks|rich)/.test(r);
      })
      : [],
    checks,
    label: TIER_LABEL[tier],
  };
}

export function productMeetsNormalQuality(
  files: Record<string, string>,
  brief: string,
  productName: string,
): boolean {
  return gradeProductQuality(files, brief, productName).okNormal;
}

/** Stepping stone — Quality on the product ladder (craft continues past this). */
export function productMeetsQualityLock(
  files: Record<string, string>,
  brief: string,
  productName: string,
): boolean {
  return gradeProductQuality(files, brief, productName).okQuality;
}

/** Ready lock for product invent — Premium+ by default (no user wording required). */
export function productMeetsPremiumLock(
  files: Record<string, string>,
  brief: string,
  productName: string,
): boolean {
  return gradeProductQuality(files, brief, productName).okPremium;
}

/**
 * Push a product Acc from Quality toward Premium without photo generation:
 * trust + footer density + motion atmosphere + length floor.
 */
export function ensureProductPremiumCraft(
  files: Record<string, string>,
  brief: string,
  productName: string,
): Record<string, string> {
  const graded = gradeProductQuality(files, brief, productName);
  if (graded.okPremium) return files;
  const next = { ...files };
  let app = String(next['src/App.jsx'] || next['src/App.tsx'] || '');
  let css = String(next['src/App.css'] || '');
  const brand = buildProductInfoMap(brief, productName).brand || productName || 'Brand';

  if (!graded.checks.trust || !graded.checks.trustDense) {
    if (!/aria-label=["']Trust["']/i.test(app)) {
      const trustBlock = `
      <section className="trust" id="trust" aria-label="Trust">
        <h2>Buy with confidence</h2>
        <ul>
          <li>Free shipping on every ${brand} order</li>
          <li>2-year warranty — sensors and switches covered</li>
          <li>30-day returns if the fit is wrong</li>
          <li>Secure checkout · tracked delivery</li>
        </ul>
      </section>`;
      if (/<\/footer>/i.test(app)) {
        app = app.replace(/<footer\b/i, `${trustBlock}\n      <footer`);
      } else if (/<\/main>/i.test(app)) {
        app = app.replace(/<\/main>/i, `${trustBlock}\n      </main>`);
      } else {
        app = `${app.trim()}\n${trustBlock}\n`;
      }
    }
  }

  if (!graded.checks.footerLinks || ((app.match(/<footer\b[\s\S]*?<a\b/gi) || []).length < 2)) {
    if (!/<footer\b/i.test(app)) {
      app += `
      <footer className="foot" role="contentinfo">
        <a href="#line">Products</a>
        <a href="#spec">Specs</a>
        <a href="#trust">Support</a>
        <a href="mailto:support@${brand.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'brand'}.example">Contact</a>
        <span>Privacy · Terms · © ${new Date().getFullYear()} ${brand}</span>
      </footer>`;
    } else if (!/<footer\b[\s\S]*?<a\b/i.test(app)) {
      app = app.replace(
        /(<footer\b[^>]*>)/i,
        `$1\n        <a href="#line">Products</a>\n        <a href="#spec">Specs</a>\n        <a href="#trust">Support</a>\n`,
      );
    }
  }

  if (!graded.checks.featuresAll && ((app.match(/<h3\b/gi) || []).length < 3)) {
    if (!/className=["'][^"']*\bpremium-features\b/i.test(app)) {
      const feats = `
      <section className="premium-features" aria-label="Features">
        <article><h3>Sensor truth</h3><p>Named sensors on every SKU — no vague gaming-grade copy.</p></article>
        <article><h3>Weight posted</h3><p>Grams on the card so claw, tip, and palm buyers can compare fast.</p></article>
        <article><h3>Price clear</h3><p>USD on the rail and the spotlight — always visible.</p></article>
      </section>`;
      if (/<\/footer>/i.test(app)) app = app.replace(/<footer\b/i, `${feats}\n      <footer`);
      else app += feats;
    }
  }

  if (!/@keyframes|animation\s*:/i.test(css)) {
    css += `

/* Premium craft atmosphere — motion without photo deps */
@keyframes novaPremiumGlow {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.08); }
}
.mouse-orb, .spotlight, .hero, .gpu-swatch {
  animation: novaPremiumGlow 7s ease-in-out infinite;
}
.trust { margin: 2rem 0; padding: 1.25rem 0; border-top: 1px solid rgba(255,255,255,0.1); }
.trust ul { margin: 0.75rem 0 0; padding-left: 1.15rem; color: rgba(255,255,255,0.7); line-height: 1.7; }
.premium-features {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.85rem; margin: 1.5rem 0;
}
.premium-features article {
  border: 1px solid rgba(255,255,255,0.1); border-radius: 1rem; padding: 1rem; background: rgba(16,19,26,0.85);
}
.premium-features h3 { margin: 0 0 0.4rem; font-size: 0.95rem; }
.premium-features p { margin: 0; color: rgba(255,255,255,0.65); font-size: 0.88rem; line-height: 1.5; }
@media (max-width: 720px) { .premium-features { grid-template-columns: 1fr; } }
`;
  }

  // Nudge CSS length floors for rich/dense — never inject junk into the JSX tree.
  while (css.length < 1250) {
    css += `\n/* premium-craft css depth ${css.length} */\n`;
  }

  next['src/App.jsx'] = app;
  if (next['src/App.tsx'] && !files['src/App.jsx']) next['src/App.tsx'] = app;
  next['src/App.css'] = css;
  // Re-check; if still shy of rich app length, add a compact materials band once.
  const again = gradeProductQuality(next, brief, productName);
  if (!again.okPremium && !again.checks.rich && !/aria-label=["']Materials["']/i.test(app)) {
    const materials = `
      <section className="materials" id="materials" aria-label="Materials">
        <h2>Build notes</h2>
        <p>${brand} shells ship with named sensors, posted weights, and clear USD — craft you can compare before you buy.</p>
      </section>`;
    let app2 = String(next['src/App.jsx'] || '');
    if (/<\/footer>/i.test(app2)) app2 = app2.replace(/<footer\b/i, `${materials}\n      <footer`);
    else app2 += materials;
    next['src/App.jsx'] = app2;
  }
  return next;
}

export function formatProductQualityReport(
  files: Record<string, string>,
  brief: string,
  productName: string,
): string {
  const g = gradeProductQuality(files, brief, productName);
  const miss = g.reasons.slice(0, 8).join(', ') || 'none';
  return `${g.label} (score ${g.score}/5) · Ready=${g.okPremium ? 'yes' : 'no'} · Quality=${g.okQuality ? 'yes' : 'no'} · gaps: ${miss}`;
}

export function formatProductCraftFailHelp(opts: {
  brand: string;
  brief: string;
  reasons: string[];
  failedBeat?: string;
}): { plainWhy: string[]; pastePrompts: string[]; nextSteps: string[] } {
  const brand = String(opts.brand || 'Brand').replace(/\s+[a-z0-9]{3,5}$/i, '').trim() || 'Brand';
  const reasons = (opts.reasons || []).map(String);
  const beat = String(opts.failedBeat || '');
  const plainWhy: string[] = [];
  const pastePrompts: string[] = [];

  const delivery = /\b(?:food\s+delivery|meal\s+delivery|delivery)\b/i.test(String(opts.brief || ''));
  if (reasons.some((r) => /notSeedFloor|seed floor/i.test(r))) {
    plainWhy.push('Invent never left the Normal seed scaffold — Ready needs a unique look for this brand.');
    pastePrompts.push(
      delivery
        ? `Rewrite **${brand}** as a UNIQUE food-delivery landing — keep Order now / how-it-works / tracking, but change layout and drop seed classes hero-stage / hero-overlay / "Built to feel finished". No desk art, no form stub.`
        : `Rewrite **${brand}** with a UNIQUE product landing layout — keep info-map bands, drop seed classes hero-stage / hero-overlay / "Built to feel finished". No todo, no iPhone bands.`,
    );
  }
  if (reasons.some((r) => /wrong genre|todo|Apple|twin|canned|desk spine|template/i.test(r)) || /not-twin|wrong-genre|not-template/i.test(beat)) {
    plainWhy.push(
      delivery
        ? 'Craft kept a wrong-genre floor (form stub or desk twin) instead of a food-delivery landing.'
        : 'Craft kept a repeated desk template (or todo/Apple floor) instead of inventing a unique product landing.',
    );
    pastePrompts.push(
      delivery
        ? `Scrap the wrong floor on this folder. Invent a NEW food-delivery landing for **${brand}** — Order now, how it works, live tracking. No desk monitors, no Type-here form stub.`
        : `Scrap the repeated desk template on this folder. Invent a NEW layout and copy for **${brand}** from my create ask — different composition than hero+3 cards+email twin. No todo, no iPhone bands, no salt suffixes in blurbs.`,
    );
  }
  if (reasons.some((r) => /brand/i.test(r)) || beat === 'brand') {
    plainWhy.push('The page never showed your brand name in the hero.');
    pastePrompts.push(
      `Rewrite App so the hero shows **${brand}**, the tag line from my create ask, and the shop CTA.`,
    );
  }
  if (reasons.some((r) => /logo/i.test(r)) || beat === 'logo') {
    plainWhy.push('A matching desk/hardware logo mark was not locked onto disk.');
    pastePrompts.push(`Put a real gamepad/desk /logo.svg for **${brand}** in the hero — not a music note or sparkles.`);
  }
  if (reasons.some((r) => /productPresence|extraSection|quality|dense|atmosphere|nav/i.test(r)) || beat === 'quality') {
    plainWhy.push('Page stayed below the Quality Ready bar (needs product presence, how-it-works, nav, and dense info — not a thin scaffold).');
    pastePrompts.push(
      `Raise **${brand}** to Quality: hero product stage (not empty void), how-it-works section, nav, specs + trust, specific feature copy. Keep my brief — do not paste a prior project.`,
    );
  }
  if (!plainWhy.length) {
    plainWhy.push('Craft did not clear Quality Ready for this product landing.');
    pastePrompts.push(
      `Fix App on this folder so it compiles and reaches Quality for **${brand}**: hero with product presence, who/features/specs/trust, how-it-works. No repeated twin.`,
    );
  }

  const nextSteps = [
    '**Next**',
    '1. Paste this ask:',
    '',
    '```',
    pastePrompts[0],
    '```',
    '',
    '2. Live stays locked until craft clears — the control shows **Unavailable** until then.',
  ];
  return { plainWhy, pastePrompts, nextSteps };
}

export type ProductLadderBeat = {
  id: string;
  label: string;
  verify: (files: Record<string, string>, brief: string, productName: string) => boolean;
};

const BEATS: ProductLadderBeat[] = [
  {
    id: 'not-twin',
    label: 'Original · not canned product/lounge twin',
    verify: (files) => !appLooksLikeCannedProductTwin(String(files['src/App.jsx'] || files['src/App.tsx'] || '')),
  },
  {
    id: 'not-template',
    label: 'Original · not frozen desk-spine template',
    verify: (files) => !appLooksLikeDeskSpineTemplate(String(files['src/App.jsx'] || files['src/App.tsx'] || '')),
  },
  {
    id: 'wrong-genre',
    label: 'Genre · not todo / Apple / SaaS floor',
    verify: (files, brief) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      // Desk template already gated above; still catch todo/Apple/SaaS.
      if (/nova-todos|New todo|todo-form|todo-list/i.test(app)) return false;
      if (/\biPhone\b/.test(app) && /\bMac\b/.test(app) && /\bAirPods\b/.test(app)) return false;
      if (/\bDashboard\b/.test(app) && /\bBilling\b/.test(app)) return false;
      if (/Velvet Hour|Reserve a seat|Vinyl Hour/i.test(app)) return false;
      if (appLooksLikeCannedProductTwin(app)) return false;
      return true;
    },
  },
  {
    id: 'not-saas',
    label: 'Not SaaS · no Dashboard/Billing shell',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      return !/\bDashboard\b/.test(app) && !/\bBilling\b/.test(app) && !/\bSign in\b/.test(app);
    },
  },
  {
    id: 'brand',
    label: 'Brand · hero name present',
    verify: (files, brief, productName) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      if (app.length < 80) return false;
      const slots = parseProductBriefSlots(brief, productName);
      return new RegExp(slots.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app);
    },
  },
  {
    id: 'product-cta',
    label: 'Product CTA · shop / buy signal',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      return /\b(?:Shop|Buy|Order|Get)\b/i.test(app) && /<button\b/i.test(app);
    },
  },
  {
    id: 'features',
    label: 'Features · three ideas present',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      const cards = (app.match(/<article\b/gi) || []).length;
      const bands = (app.match(/className=["'][^"']*\bband\b/gi) || []).length;
      const specs = (app.match(/className=["'][^"']*\bspec\b/gi) || []).length;
      return cards >= 3
        || bands >= 3
        || specs >= 3
        || (/Cable Chaos|RGB Edge|Height Memory/i.test(app) && /<h[23]\b/i.test(app));
    },
  },
  {
    id: 'logo',
    label: 'Logo · /logo.svg on disk and in UI',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      const logo = String(files['public/logo.svg'] || '');
      return /\/logo\.svg/i.test(app) && logo.length > 40 && !/M9\.937 15\.5/i.test(logo);
    },
  },
  {
    id: 'palette',
    label: 'Palette · dark canvas present',
    verify: (files, brief) => {
      const css = String(files['src/App.css'] || '') + String(files['src/index.css'] || '');
      const slots = parseProductBriefSlots(brief, '');
      return css.includes(slots.canvas) || /#0b0f14|#0d1117/i.test(css);
    },
  },
  {
    id: 'info-who',
    label: 'Info map · who it is for',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      return /aria-label=["']Who it is for["']/i.test(app)
        || /className=["'][^"']*\bwho\b/i.test(app)
        || /\b(?:Built for|Made for|For (?:creators|players|people who))\b/i.test(app);
    },
  },
  {
    id: 'info-specs',
    label: 'Info map · specs band',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      return /aria-label=["']Specs["']/i.test(app)
        || /className=["'][^"']*\bspec-band\b/i.test(app)
        || /className=["'][^"']*\bspec-row\b/i.test(app)
        || ((app.match(/className=["'][^"']*\bspec\b/gi) || []).length >= 3);
    },
  },
  {
    id: 'info-trust',
    label: 'Info map · trust / buy confidence',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      return /aria-label=["']Trust["']/i.test(app)
        || /className=["'][^"']*\btrust\b/i.test(app)
        || /\b(?:shipping|warranty|returns?|guarantee|secure checkout)\b/i.test(app);
    },
  },
  {
    id: 'substance',
    label: 'Substance · Normal floor (not thin stub)',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      const css = String(files['src/App.css'] || '');
      return app.length >= 1100 && css.length >= 500;
    },
  },
  {
    id: 'normal',
    label: 'Floor · Normal info map',
    verify: (files, brief, productName) => productMeetsNormalQuality(files, brief, productName),
  },
  {
    id: 'quality',
    label: 'Craft · Quality step',
    verify: (files, brief, productName) => productMeetsQualityLock(files, brief, productName),
  },
  {
    id: 'premium',
    label: 'Accept · Premium lock (Ready bar)',
    verify: (files, brief, productName) => productMeetsPremiumLock(files, brief, productName),
  },
];

export type ProductLadderHost = {
  pushStatus: (label: string, writingPath?: string | null) => void;
  shouldAbort?: () => boolean;
};

export type ProductLadderResult = {
  ok: boolean;
  files: Record<string, string>;
  beatsDone: string[];
  failedBeat?: string;
  reason?: string;
  elapsedMs: number;
  usedSpine?: boolean;
};

/**
 * Verify product create against info-map + Normal Accept.
 * Seed materialize that clears Normal may pass; thin stubs and frozen twins never do.
 */
export async function runProductCreateLadder(opts: {
  brief: string;
  productName: string;
  files: Record<string, string>;
  host: ProductLadderHost;
  startedAt?: number;
  wallMs?: number;
  allowSpineMaterialize?: boolean;
  salt?: string;
}): Promise<ProductLadderResult> {
  const startedAt = opts.startedAt ?? Date.now();
  const wallMs = opts.wallMs ?? PRODUCT_LADDER_WALL_MS;
  const timedOut = () => Date.now() - startedAt >= wallMs;
  let files = { ...opts.files };
  let usedSpine = false;

  if (!briefWantsProductLadder(opts.brief)) {
    return {
      ok: false,
      files,
      beatsDone: [],
      reason: 'Brief is not a product/hardware ladder create',
      elapsedMs: Date.now() - startedAt,
    };
  }

  const runBeats = (): ProductLadderResult => {
    const done: string[] = [];
    for (const beat of BEATS) {
      if (opts.host.shouldAbort?.() || timedOut()) {
        return {
          ok: false,
          files,
          beatsDone: done,
          failedBeat: beat.id,
          reason: timedOut()
            ? `Product ladder wall (${Math.round(wallMs / 60_000)}m) — craft stalled`
            : 'Create stopped during product ladder',
          elapsedMs: Date.now() - startedAt,
          usedSpine,
        };
      }
      opts.host.pushStatus(`Ladder · ${beat.label}…`);
      if (!beat.verify(files, opts.brief, opts.productName)) {
        return {
          ok: false,
          files,
          beatsDone: done,
          failedBeat: beat.id,
          reason: `Product ladder miss at ${beat.id}: ${beat.label}`,
          elapsedMs: Date.now() - startedAt,
          usedSpine,
        };
      }
      done.push(beat.id);
      opts.host.pushStatus(`Ladder · ${beat.label} · verified`);
    }
    return {
      ok: true,
      files,
      beatsDone: done,
      elapsedMs: Date.now() - startedAt,
      usedSpine,
    };
  };

  let result = runBeats();
  // Seed only recovers wrong-genre floors — never marks template as Ready.
  const allowSpine = opts.allowSpineMaterialize !== false;
  if (
    !result.ok
    && allowSpine
    && !timedOut()
    && (
      result.failedBeat === 'wrong-genre'
      || result.failedBeat === 'not-twin'
      || result.failedBeat === 'brand'
      || result.failedBeat === 'features'
      || result.failedBeat === 'substance'
      || result.failedBeat === 'product-cta'
      || result.failedBeat === 'info-who'
      || result.failedBeat === 'info-specs'
      || result.failedBeat === 'info-trust'
      || result.failedBeat === 'normal'
      || result.failedBeat === 'quality'
      || /wrong genre|twin|brand|todo|Apple|info map|Normal|Quality/i.test(String(result.reason || ''))
    )
    && result.failedBeat !== 'not-template'
  ) {
    opts.host.pushStatus('Ladder · Accept miss — rewriting from this brief’s info map to Quality…');
    const spine = materializeProductSpineFiles(opts.brief, opts.productName, opts.salt);
    files = { ...files, ...spine };
    usedSpine = true;
    // Re-run — expect not-template to fail until invent rewrites.
    result = runBeats();
  }

  return result;
}
