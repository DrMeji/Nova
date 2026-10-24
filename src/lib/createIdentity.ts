/**
 * CreateBriefSpec — brief-only create contract.
 * No category lookbook (bakery/Discord/Veopx). Every create invents from THIS ask.
 */

import { premiumWebCraftRules } from '@/lib/createEnsemble';
import { detectLayoutReference } from '@/lib/layoutReference';
import { atelierLeatherHeroDataUrl } from '@/lib/atelierLeatherPlate';

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

/**
 * True when the brief asks for parchment / soft-paper / cream atelier grounds.
 * Used to stop dark SaaS CSS heals from stomping invent-floor atelier paint.
 */
export function briefWantsLightPaperGround(brief: string): boolean {
  const t = String(brief || '').toLowerCase();
  if (!t.trim()) return false;
  if (/\b(?:not|never|no|avoid)\s+(?:a\s+)?(?:cream|parchment|paper\s+ground|soft\s+paper)\b/.test(t)) {
    return false;
  }
  // Dark product UIs win unless the ask also names parchment/paper explicitly.
  if (
    /\b(?:dark\s+saas|oled|charcoal\s+ui|navy|harbor|seafoam|gin|whisky|whiskey|vodka)\b/.test(t)
    && !/\b(?:parchment|cream\s+paper|soft\s+paper|paper\s+ground)\b/.test(t)
  ) {
    return false;
  }
  if (/\b(?:parchment|soft\s+paper|paper\s+ground|cream\s+paper|oatmeal\s+paper|leather[- ]?goods|warm\s+brass|off[- ]?white\s+paper)\b/.test(t)) {
    return true;
  }
  if (/\batelier\b/.test(t) && /\b(?:parchment|cream|paper|brass|leather|bags?|shop)\b/.test(t)) {
    return true;
  }
  if (
    /\bcream\b/.test(t)
    && /\b(?:website|homepage|landing|bakery|shop|marketing)\b/.test(t)
    && !/\b(?:hand\s+cream|face\s+cream|body\s+cream|skincare|serum|lotion)\b/.test(t)
  ) {
    return true;
  }
  return false;
}

const LIGHT_PAPER_PALETTE: CreatePalette = {
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

/** Brief-aware starter palette — explicit vibe words beat cream/bakery defaults. */
function paletteFromBrief(brief: string): CreatePalette {
  const t = String(brief || '').toLowerCase();
  // Parchment / leather atelier — before coffee "espresso" token steals a dark roast UI.
  if (briefWantsLightPaperGround(brief)) {
    return { ...LIGHT_PAPER_PALETTE };
  }
  // Maritime / dark vibes FIRST — ensemble plans often say "avoid cream" and the
  // word "cream" alone used to steal the palette from navy/seafoam briefs.
  if (/\b(?:navy|harbor|seafoam|ocean|maritime|dock|boat|clipper|coast|cove|brine)\b/.test(t)
    || /\b(?:gin|whisky|whiskey|vodka|tequila|bourbon|rum|spirit|distill)\b/.test(t)) {
    return {
      bg: '#0a1628',
      panel: '#12233a',
      text: '#f4f8fc',
      muted: '#8fa3b8',
      accent: '#6ec8b8',
      glow: 'rgba(110, 200, 184, 0.32)',
      btnInk: '#0a1628',
      font: '"Fraunces", Georgia, "Iowan Old Style", serif',
      line: 'rgba(244, 248, 252, 0.14)',
    };
  }
  if (/\b(?:matcha|green\s+tea|ceremonial\s+tea)\b/.test(t)) {
    return {
      bg: '#0e1612',
      panel: '#18241c',
      text: '#eef6ef',
      muted: '#8fa898',
      accent: '#7d9b78',
      glow: 'rgba(125, 155, 120, 0.34)',
      btnInk: '#0e1612',
      font: '"Fraunces", Georgia, "Iowan Old Style", serif',
      line: 'rgba(238, 246, 239, 0.14)',
    };
  }
  // "espresso type/ink" is parchment copy — not a coffee roaster site.
  const espressoInkOnly = /\bespresso\s+(?:type|ink|navy)\b/.test(t)
    && !/\b(?:coffee|roaster|roast|cafe|café)\b/.test(t);
  if (
    !espressoInkOnly
    && (/\b(?:coffee|roaster|roast)\b/.test(t) || /\bespresso\b/.test(t))
    && !/\bnot\s+coffee\b/.test(t)
  ) {
    return {
      bg: '#140e0a',
      panel: '#221810',
      text: '#f6efe6',
      muted: '#a89884',
      accent: '#c9853a',
      glow: 'rgba(201, 133, 58, 0.32)',
      btnInk: '#140e0a',
      font: '"Fraunces", Georgia, "Iowan Old Style", serif',
      line: 'rgba(246, 239, 230, 0.14)',
    };
  }
  if (/\b(?:chocolate|cacao|cocoa)\b/.test(t)) {
    return {
      bg: '#120c0a',
      panel: '#1e1410',
      text: '#f4ebe3',
      muted: '#a89080',
      accent: '#b07a4a',
      glow: 'rgba(176, 122, 74, 0.3)',
      btnInk: '#120c0a',
      font: '"Fraunces", Georgia, "Iowan Old Style", serif',
      line: 'rgba(244, 235, 227, 0.14)',
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
  const beautyBrief = /\b(?:lotion|skincare|serum|beauty|moisturizer|hand\s+cream|face\s+cream|body\s+cream)\b/.test(t);
  const ceramicsBrief = /\b(?:ceramic|pottery|porcelain|stoneware|tableware|kiln|plateware|dinnerware|clay)\b/.test(t);
  const explicitNoCream = /\b(?:not\s+cream|no\s+cream|avoid\s+cream|never\s+cream|don'?t\s+.*?cream)\b/.test(t);
  const wantsCream = !ceramicsBrief && !beautyBrief && (
    (/\b(?:cream|parchment|bakery|terracotta)\b/.test(t)
      && !explicitNoCream)
    || (/\bsage\b/.test(t)
      && /\b(?:bakery|cafe|pastry|bread)\b/.test(t)
      && !/\b(?:not\s+(?:cafe\s+)?sage|avoid\s+sage)\b/.test(t))
  );
  if (wantsCream) {
    return { ...LIGHT_PAPER_PALETTE };
  }
  return { ...NEUTRAL };
}

/** Product silhouette kind for designed hero stages — model-agnostic. */
export type HeroProductKind =
  | 'tea' | 'coffee' | 'bottle' | 'lotion' | 'chocolate' | 'ceramic'
  | 'bag'
  | 'mic' | 'headphones' | 'guitar' | 'keyboard' | 'mouse'
  | 'device' | 'generic';

/**
 * Pick a product silhouette from brief + name.
 * Spirits win over coffee so "gin · not coffee" never draws a mug.
 * Leather atelier wins over "espresso type" typography (Oak Latch coffee-bag miss).
 */
export function detectHeroProductKind(name: string, brief = '', label = ''): HeroProductKind {
  // Scrub negations first — "do not copy Apple" / "not coffee" must not pick silhouettes.
  const scrubbed = `${name} ${brief} ${label}`
    .replace(/\b(?:do\s+not|don't|dont|never|not|avoid|without)\s+copy\b[^.!?\n]{0,80}\b(?:apple(?:\.com)?|iphone)\b/gi, ' ')
    .replace(/\b(?:not|never|no|without|avoid)\s+(?:a\s+|an\s+)?(?:apple(?:\.com)?|iphone|ipad|mac)\b/gi, ' ')
    .replace(/\bor\s+apple(?:\.com)?\b/gi, ' ')
    .replace(/\bnot\s+coffee\b/gi, ' ')
    // "espresso type / espresso navy / espresso ink" is parchment copy — not a roaster.
    .replace(/\bespresso\s+(?:type|ink|navy)\b/gi, ' ');
  const blob = scrubbed;
  const ceramics = /\b(?:ceramic|pottery|porcelain|stoneware|tableware|kiln|plateware|dinnerware|clay)\b/i.test(blob);
  // Ceramics before spirits/tea — "ceramic wine tumblers" / "biscuit tin" must not become bottle/tea.
  if (ceramics) return 'ceramic';
  // Leather-goods atelier BEFORE coffee — "espresso type" + leather must not draw a roast bag.
  // Negation ("not a leather atelier") must not force bags onto gaming mice / tech.
  const leatherNegated = /\b(?:not|no|never|without|unlike|don't|dont|do\s+not)\b[\s\S]{0,40}\b(?:leather|atelier|parchment|satchel|tote|lookbook)\b/i.test(blob);
  if (
    !leatherNegated
    && (
      /\b(?:leather[- ]?goods|leather\s+atelier|handcrafted\s+bags?|full[- ]?grain|bridle\s+leather|saddle\s+leather|vegetable[- ]?tanned)\b/i.test(blob)
      || (/\batelier\b/i.test(blob) && /\b(?:bag|bags|leather|parchment|brass|tote|satchel)\b/i.test(blob))
      || (/\bbags?\b/i.test(blob) && /\b(?:leather|atelier|handcrafted|premium)\b/i.test(blob))
    )
  ) {
    return 'bag';
  }
  // Audio / instrument glyphs before generic device (never fetch remote stock photos).
  if (/\b(?:microphone|mic\b|condenser|dynamic\s+mic|lavalier|clip[- ]?on|room\s+condenser|desk\s+dynamic|travel\s+clip)\b/i.test(blob)
    || /\bmicora\b/i.test(blob)) {
    return 'mic';
  }
  if (/\b(?:headphones?|headset|earbuds?|earphones?|auralis)\b/i.test(blob)) return 'headphones';
  if (/\b(?:guitar|ukulele|bass\s+guitar)\b/i.test(blob)) return 'guitar';
  if (/\b(?:keyboard|keyboards|mechanical\s+key)\b/i.test(blob)) return 'keyboard';
  if (/\b(?:gaming\s+)?mouse\b/i.test(blob) && !/\bmousepad\b/i.test(blob)) return 'mouse';
  // Insulated / hydration bottles before spirits wine silhouette (water flask ≠ wine).
  if (
    /\b(?:insulated|water\s+bottle|tumbler|hydration|flask|rambler|\d+\s*oz)\b/i.test(blob)
    && !/\b(?:gin|whisky|whiskey|vodka|tequila|bourbon|rum|spirit|distill|liquor|scotch|cognac|wine)\b/i.test(blob)
  ) {
    return 'bottle';
  }
  // F&B silhouettes always beat device/phone.
  if (/\b(?:gin|whisky|whiskey|vodka|tequila|bourbon|rum|spirit|distill|liquor|scotch|cognac)\b/i.test(blob)
    || /\bwine\b/i.test(blob)
    || (/\bbottle\b/i.test(blob) && /\b(?:spirit|liquor|whiskey|gin|vodka|shop|cart)\b/i.test(blob))) {
    return 'bottle';
  }
  // Bare "tin" alone is too broad — require tea framing.
  if (/\b(?:matcha|tea|steep)\b/i.test(blob) && !/\bcoffee\b/i.test(blob)) {
    return 'tea';
  }
  if (/\b(?:coffee|espresso|roaster|roast)\b/i.test(blob) && !/\bnot\s+coffee\b/i.test(brief)) {
    return 'coffee';
  }
  if (/\b(?:chocolate|cacao|cocoa)\b/i.test(blob)) return 'chocolate';
  // Bare "cream" is too broad. Require skincare framing.
  if (/\b(?:lotion|skincare|serum|beauty|moisturizer)\b/i.test(blob)
    || /\b(?:hand|face|body|night|day)\s+creams?\b/i.test(blob)) {
    return 'lotion';
  }
  if (/\b(?:apple|iphone|ipad|mac|watch|airpods|product[- ]?home)\b/i.test(blob)
    || /\b(?:device|phone|laptop|earbuds)\b/i.test(blob)) {
    return 'device';
  }
  return 'generic';
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
  // Word-bound auth only — do NOT match "author" / "authority" substrings.
  if (/\blogin\b|\bsign[\s-]?in\b|\bauth(?:entication|orize[ds]?|z)?\b/i.test(t)) {
    push('sign-in / account UI if the brief asks for it');
  }
  if (/\bdashboard\b/i.test(t)) push('dashboard with real panels from the brief');
  if (/\bmap\b|\blocation\b/i.test(t)) push('location / map affordance from the brief');
  // Tool-lending only — do NOT match "polished" via bare "shed", or "book cards" alone.
  if (
    (/\b(?:tool\s+(?:library|share|lending)|neighbor(?:hood)?\s+tool|community\s+garden|tool\s+shed)\b/i.test(t)
      || (/\btools?\b/i.test(t) && /\b(?:reserv|borrow|share|lend)\b/i.test(t)))
    && !/\b(?:book\s+cards?|reading\s+shelf|title\s*\+?\s*author)\b/i.test(t)
  ) {
    push('browseable tool / item list from the brief');
  }
  if (/\brestaurant/i.test(t) && /\b(?:any|search|pick|choose|list|browse)/i.test(t)) {
    push('multi-restaurant browse/search — not a single restaurant landing');
  }

  // Editorial / marketing landing must-haves (peers extract these before invent).
  if (/\b(?:soft\s+paper|paper\s+background|oatmeal|cream\s+paper|off[- ]?white\s+paper)\b/i.test(t)) {
    push('soft paper / light paper background (not dark neon tech shell)');
  }
  if (/\b(?:ink\s+navy|deep\s+(?:ink\s+)?navy|navy\s+type|navy\s+text)\b/i.test(t)) {
    push('deep ink navy type / text color from the brief');
  }
  if (/\b(?:warm\s+brass|brass\s+accent|brass)\b/i.test(t)) {
    push('warm brass accent color from the brief');
  }
  if (/\b(?:full[- ]?bleed|quiet\s+hero|hero\s+with\s+the\s+brand|brand[- ]?first\s+hero)\b/i.test(t)
    || (/\bhero\b/i.test(t) && /\b(?:brand|name|title)\b/i.test(t))) {
    push('full-bleed quiet hero with the brand name in first viewport');
  }
  // "not Book One / Card one" on leather invents must NOT force a reading-shelf must-have.
  const forbidsBookLadder = /\bnot\s+book\s+one\b|\bavoid\s+book\s+one\b|\bno\s+book\s+one\b/i.test(t);
  const leatherGoodsAsk = /\b(?:leather[- ]?goods|leather\s+atelier|handcrafted\s+bags?|bags?\s+with|satchel|weekender|tote)\b/i.test(t);
  if (
    !forbidsBookLadder
    && !leatherGoodsAsk
    && (/\b(?:reading\s+shelf|book\s+shelf|bookshelf|book\s+cards?|grid\s+of\s+\d+\s+book)\b/i.test(t)
      || (/\bbooks?\b/i.test(t) && /\b(?:grid|cards?|shelf|title\s*\+\s*author|title and author)\b/i.test(t)))
  ) {
    push('reading shelf / book grid with title + author cards from the brief');
  }
  if (leatherGoodsAsk && /\bgrid\s+of\s+\d+\s+product/i.test(t)) {
    push('product grid with real bag names + material lines from the brief');
  }
  const gridN = t.match(/\bgrid\s+of\s+(\d+)\s+/i)?.[1]
    || t.match(/\b(\d+)\s+book\s+cards?\b/i)?.[1];
  if (gridN) push(`exactly ${gridN} cards/items in the primary grid`);
  if (/\b(?:polished\s+single\s+page|single\s+page|one\s+page)\b/i.test(t)) {
    push('polished single-page site (not a multi-route app shell)');
  }
  if (/\b(?:not\s+neon|no\s+neon|not\s+tech|not\s+a\s+todo|not\s+todo)\b/i.test(t)) {
    push('avoid neon/tech/todo twin shells — match this brief only');
  }

  // Keep short — polish prompt stays brief-led.
  return out.slice(0, 12);
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
  // Compositional brand/marketing asks — shell + sections (never monolith App instructions).
  // Keep logic local to avoid circular import with createThinPath.
  const compositionalAsk = (
    /\b(?:website|web\s*site|landing|homepage|marketing|brand(?:ed)?|storefront|product\s+page)\b/i.test(briefText)
    || /\b(?:lotion|skincare|restaurant|cafe|café|portfolio|matcha|tea\s+brand|coffee\s+brand|ceramic|pottery|kiln|stoneware|tableware|chocolate|cacao)\b/i.test(briefText)
  ) && !(
    /\b(?:tip\s*calc|todo(?:s)?|calculator|counter|timer)\b/i.test(briefText)
    && !/\b(?:website|landing|marketing|brand)\b/i.test(briefText)
  );
  if (compositionalAsk) {
    return [
      'Build the FIRST real product UI for this new project from the user brief alone.',
      'Output ONLY @@@FILE blocks — no preface, no plan.',
      'COMPOSITIONAL SHELL: thin App.jsx imports src/sections/*Section.jsx — do NOT put the full page UI inline in App.',
      `Write @@@FILE ${appPath} as a thin shell (imports + layout) and @@@FILE src/App.css.`,
      'Put real sections in src/sections/*Section.jsx (Nav, Hero, story bands, notes/shop as the brief needs).',
      'Plain JavaScript JSX only — no TypeScript generics or .tsx.',
      'Do NOT invent a phone-column Apple stage unless the brief explicitly asks for a device product.',
      'ORIGINAL ONE-OF-ONE: invent layout, type, palette, and copy for THIS brief.',
      'ASCII-safe copy only. Nova is free forever — never add paywalls.',
      '',
      `Product: ${spec.name}`,
      'Must-haves from the brief:',
      must,
      ...refLines,
      '',
      'Brief:',
      briefText.slice(0, 4000),
    ];
  }

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

/** Deterministic per-brand plate hash — offline, model-agnostic (Patch H). */
function plateHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 1–2 concrete brief words as a plate prop — strips negations + template jargon. */
function plateBriefChip(brief: string): string {
  const stop = new Set([
    'website', 'homepage', 'landing', 'page', 'brand', 'called', 'build', 'create', 'make',
    'with', 'that', 'this', 'from', 'into', 'look', 'feel', 'looks', 'feels', 'their', 'they',
    'have', 'real', 'nice', 'best', 'great', 'some', 'very', 'just', 'like', 'using', 'users',
    'product', 'official', 'simple', 'clean', 'modern', 'beautiful', 'easy', 'your', 'bout',
  ]);
  const words = String(brief || '')
    .replace(/\b(?:not|never|no|without|avoid)\s+[a-z0-9-]+/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .split(/[^a-zA-Z0-9-]+/)
    .filter((w) => w.length >= 4 && w.length <= 14 && !stop.has(w.toLowerCase()) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, 2).join(' · ');
}

/**
 * Patch H — name-hashed framing behind the product: 6 offline variants so two
 * brands in the same genre are never identical plates. Palette-derived only.
 */
function svgPlateFrame(name: string, p: CreatePalette): string {
  const id = plateHash(name) % 6;
  const a = p.accent;
  const frames: Record<number, string> = {
    0: `<circle cx="800" cy="470" r="310" fill="none" stroke="${a}" stroke-opacity="0.16" stroke-width="2"/>
<circle cx="1240" cy="220" r="46" fill="none" stroke="${a}" stroke-opacity="0.3" stroke-width="2"/>`,
    1: `<line x1="80" y1="706" x2="1520" y2="706" stroke="${a}" stroke-opacity="0.22" stroke-width="2"/>
<g fill="${a}" fill-opacity="0.4"><circle cx="160" cy="706" r="5"/><circle cx="440" cy="706" r="5"/><circle cx="800" cy="706" r="5"/><circle cx="1160" cy="706" r="5"/><circle cx="1440" cy="706" r="5"/></g>`,
    2: `<g stroke="${a}" stroke-opacity="0.2" stroke-width="2"><line x1="120" y1="140" x2="120" y2="760"/><line x1="1480" y1="140" x2="1480" y2="760"/></g>
<g stroke="${a}" stroke-opacity="0.45" stroke-width="3"><line x1="120" y1="140" x2="170" y2="140"/><line x1="1430" y1="760" x2="1480" y2="760"/></g>`,
    3: `<path d="M0 190 L520 70 L566 146 L46 266 Z" fill="${a}" fill-opacity="0.1"/>
<path d="M1600 710 L1080 830 L1034 754 L1554 634 Z" fill="${a}" fill-opacity="0.1"/>`,
    4: `<g fill="${a}" fill-opacity="0.35">${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<circle cx="${1330 + c * 70}" cy="${140 + r * 70}" r="6"/>`).join('')).join('')}</g>
<line x1="80" y1="760" x2="360" y2="760" stroke="${a}" stroke-opacity="0.3" stroke-width="3"/>`,
    5: `<g fill="none" stroke="${a}" stroke-opacity="0.24" stroke-width="2"><path d="M1540 560 a170 170 0 0 0 -170 170"/><path d="M1540 480 a250 250 0 0 0 -250 250"/><path d="M60 340 a130 130 0 0 1 130 -130"/></g>`,
  };
  return `<g data-frame="${id}">${frames[id]}</g>`;
}

/** Product stage when photo search and image models both miss. Not a reused landscape photo.
 *  Never draws a toy tablet / home-button bezel — that shipped as “Apple Live” and looked like a stub.
 */
export function svgHeroDataUrl(
  identity: { name: string; palette?: CreatePalette; category?: string; brief?: string },
  label = '',
): string {
  const p = identity.palette || NEUTRAL;
  const name = identity.name || 'Brand';
  const tag = String(label || name).replace(/[-_]+/g, ' ').slice(0, 28);
  const cat = String(identity.category || '').toLowerCase();
  const brief = String(identity.brief || '');
  // Soft abstract stage — gradient + glow rim + product silhouette (never an empty black plate).
  const hue = [...(tag || name)].reduce((n, c) => n + c.charCodeAt(0), 40) % 360;
  const kind = detectHeroProductKind(name, brief || `${tag} ${cat}`, tag);
  // F&B / product silhouettes always win. "hero with product visual" / photo-query labels
  // used to trip the Apple phone stage because `product` appeared in the label/category.
  const fnbKind = kind === 'bottle' || kind === 'coffee' || kind === 'tea'
    || kind === 'lotion' || kind === 'chocolate' || kind === 'ceramic' || kind === 'bag';
  const appleAsk = /\b(?:apple\.com|iphone|ipad|macbook|airpods|product[- ]?home)\b/i.test(`${name} ${brief}`)
    || (/\b(?:apple|mac)\b/i.test(`${name} ${brief}`) && /\b(?:iphone|ipad|watch|airpods|laptop|phone)\b/i.test(brief));
  const deviceCat = /^(?:product|device|phone|laptop|watch|earbuds)$/i.test(cat);
  if (!fnbKind && (appleAsk || deviceCat)) {
    return svgPremiumProductStageDataUrl({ name, tag: name.slice(0, 28), palette: p });
  }
  const mark = escapeXml(name.slice(0, 14));
  let product = '';
  if (kind === 'bag') {
    // Permanent v2 leather plate (grain + form) — replaces flat toy satchel paths
    // that made every Latch invent look like the same icon stamp.
    const forcedBag = /\bbag-variant-([0-3])\b/i.exec(brief);
    const bagSalt = forcedBag ? Number(forcedBag[1]) % 4 : hue % 8;
    return atelierLeatherHeroDataUrl({
      name,
      brief: brief || `${tag} ${cat}`,
      variant: bagSalt,
    });
  } else if (kind === 'tea') {
    product = `<ellipse cx="800" cy="560" rx="170" ry="32" fill="#1a2220" opacity="0.55"/>
<rect x="640" y="280" width="320" height="260" rx="36" fill="#e8eef4"/>
<rect x="670" y="248" width="260" height="52" rx="16" fill="#cfd8e0"/>
<rect x="690" y="310" width="220" height="8" rx="4" fill="${p.accent}" opacity="0.55"/>
<text x="800" y="410" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="34" font-weight="700">${mark}</text>
<text x="800" y="460" text-anchor="middle" fill="#4a5560" font-family="Helvetica Neue,sans-serif" font-size="20">ceremonial tin</text>`;
  } else if (kind === 'coffee') {
    // Roast bag — fold top + label plate (not a mug).
    product = `<ellipse cx="800" cy="640" rx="190" ry="36" fill="#1a1612" opacity="0.5"/>
<path d="M610 250 L680 210 L920 210 L990 250 L970 600 Q800 660 630 600 Z" fill="#e8eef4"/>
<path d="M680 210 L700 185 L900 185 L920 210" fill="#cfd8e0"/>
<rect x="700" y="320" width="200" height="160" rx="12" fill="#1a1612" opacity="0.12"/>
<text x="800" y="390" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="28" font-weight="700">${mark}</text>
<text x="800" y="430" text-anchor="middle" fill="#4a5560" font-family="Helvetica Neue,sans-serif" font-size="18">whole bean</text>`;
  } else if (kind === 'lotion') {
    product = `<ellipse cx="800" cy="620" rx="90" ry="22" fill="#1a1612" opacity="0.4"/>
<rect x="720" y="220" width="160" height="380" rx="72" fill="#e8eef4"/>
<rect x="750" y="190" width="100" height="48" rx="12" fill="#cfd8e0"/>
<rect x="760" y="300" width="80" height="6" rx="3" fill="${p.accent}" opacity="0.5"/>
<text x="800" y="420" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="24">${escapeXml(name.slice(0, 12))}</text>`;
  } else if (kind === 'bottle') {
    // Tall spirits bottle — neck, shoulder, label.
    product = `<ellipse cx="800" cy="680" rx="110" ry="28" fill="#0a1018" opacity="0.45"/>
<rect x="762" y="160" width="76" height="70" rx="10" fill="#cfd8e0"/>
<rect x="748" y="145" width="104" height="28" rx="6" fill="#e8eef4"/>
<path d="M730 230 C730 210 870 210 870 230 L900 360 L880 640 C880 670 720 670 720 640 L700 360 Z" fill="#e8eef4"/>
<rect x="745" y="400" width="110" height="140" rx="8" fill="#1a222c" opacity="0.14"/>
<text x="800" y="460" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="22" font-weight="700">${escapeXml(name.slice(0, 10))}</text>
<text x="800" y="495" text-anchor="middle" fill="#4a5560" font-family="Helvetica Neue,sans-serif" font-size="16">small batch</text>`;
  } else if (kind === 'chocolate') {
    product = `<ellipse cx="800" cy="620" rx="200" ry="34" fill="#1a120e" opacity="0.45"/>
<rect x="620" y="300" width="360" height="260" rx="18" fill="#e8eef4"/>
<rect x="640" y="320" width="320" height="80" rx="8" fill="#1a120e" opacity="0.1"/>
<line x1="740" y1="300" x2="740" y2="560" stroke="#1a120e" stroke-opacity="0.12" stroke-width="3"/>
<line x1="860" y1="300" x2="860" y2="560" stroke="#1a120e" stroke-opacity="0.12" stroke-width="3"/>
<text x="800" y="430" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="28" font-weight="700">${mark}</text>
<text x="800" y="470" text-anchor="middle" fill="#4a5560" font-family="Helvetica Neue,sans-serif" font-size="18">origin bar</text>`;
  } else if (kind === 'ceramic') {
    // Plate + bowl stack — kiln tableware (not a phone / generic box).
    product = `<ellipse cx="800" cy="680" rx="260" ry="36" fill="#1a1612" opacity="0.35"/>
<ellipse cx="800" cy="520" rx="220" ry="48" fill="#f7f0e6" stroke="#2a2118" stroke-width="3"/>
<ellipse cx="800" cy="500" rx="190" ry="36" fill="#efe2d2"/>
<path d="M560 360 C560 300 1040 300 1040 360 L1000 500 Q800 560 600 500 Z" fill="#f0e4d4" stroke="#2a2118" stroke-width="3"/>
<ellipse cx="800" cy="360" rx="240" ry="42" fill="#faf4eb" stroke="#2a2118" stroke-width="2.5"/>
<text x="800" y="375" text-anchor="middle" fill="#2a2118" font-family="Georgia,serif" font-size="26" font-weight="700">${escapeXml(name.slice(0, 14))}</text>
<text x="800" y="620" text-anchor="middle" fill="#5a4636" font-family="Helvetica Neue,sans-serif" font-size="18">kiln-fired tableware</text>`;
  } else if (kind === 'mic') {
    product = svgMicSilhouette(800, 420, 1.15, p.accent);
  } else if (kind === 'headphones') {
    product = svgHeadphonesSilhouette(800, 400, 1.1, p.accent);
  } else if (kind === 'guitar') {
    product = svgGuitarSilhouette(800, 420, 1.05, p.accent);
  } else if (kind === 'keyboard') {
    product = svgKeyboardSilhouette(800, 480, 1, p.accent);
  } else if (kind === 'mouse') {
    product = svgMouseSilhouette(800, 420, 1.1, p.accent);
  } else {
    product = `<ellipse cx="800" cy="600" rx="200" ry="36" fill="#0a1018" opacity="0.4"/>
<rect x="640" y="260" width="320" height="320" rx="28" fill="#e8eef4"/>
<rect x="680" y="300" width="240" height="10" rx="5" fill="${p.accent}" opacity="0.45"/>
<text x="800" y="430" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="32">${escapeXml(name.slice(0, 16))}</text>`;
  }
  // Patch H — name-hashed framing + brief chip.
  // Leather/bag heroes return early via atelierLeatherHeroDataUrl above, so
  // this plate path is non-bag only (quiet chrome not needed here).
  const frame = svgPlateFrame(name, p);
  const chip = plateBriefChip(brief);
  const titleBlock = `<text x="800" y="780" text-anchor="middle" fill="${p.text}" font-family="SF Pro Display, Helvetica Neue, system-ui, sans-serif" font-size="42" font-weight="650">${escapeXml(name)}</text>
<text x="800" y="830" text-anchor="middle" fill="${p.text}" font-family="SF Pro Text, Helvetica Neue, system-ui, sans-serif" font-size="20" opacity="0.65">${escapeXml(tag)}</text>`;
  const stageBg = p.bg;
  const stagePanel = p.panel;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${stageBg}"/><stop offset="100%" stop-color="${stagePanel}"/>
</linearGradient>
<radialGradient id="glow" cx="50%" cy="42%" r="45%">
<stop offset="0%" stop-color="hsl(${hue},35%,55%)" stop-opacity="0.35"/>
<stop offset="100%" stop-color="${stageBg}" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="1600" height="900" fill="url(#g)"/>
<rect width="1600" height="900" fill="url(#glow)"/>
${frame}
${product}
${chip ? `<text x="800" y="118" text-anchor="middle" fill="${p.text}" font-family="SF Pro Text, Helvetica Neue, system-ui, sans-serif" font-size="18" letter-spacing="6" opacity="0.55">${escapeXml(chip.toUpperCase())}</text>` : ''}
${titleBlock}
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

/** Generated product glyphs — offline data-URIs, never remote stock photos. */
function svgMicSilhouette(cx: number, cy: number, scale = 1, accent = '#7d9b78'): string {
  const g = (n: number) => Math.round(n * scale);
  // Wider capsule + shock-mount ring + stand — reads as condenser mic, not a lollipop.
  return `<g transform="translate(${cx},${cy})">
<ellipse cx="0" cy="${g(230)}" rx="${g(78)}" ry="${g(18)}" fill="#0a0a0a" opacity="0.45"/>
<ellipse cx="0" cy="${g(210)}" rx="${g(55)}" ry="${g(12)}" fill="#3a4046"/>
<rect x="${g(-16)}" y="${g(70)}" width="${g(32)}" height="${g(140)}" rx="${g(8)}" fill="#c8cdd2"/>
<path d="M ${g(-78)} ${g(20)} C ${g(-78)} ${g(95)} ${g(78)} ${g(95)} ${g(78)} ${g(20)}" fill="none" stroke="#b8c0c6" stroke-width="${g(10)}" stroke-linecap="round"/>
<rect x="${g(-70)}" y="${g(-150)}" width="${g(140)}" height="${g(220)}" rx="${g(62)}" fill="#e8eef4"/>
<rect x="${g(-52)}" y="${g(-120)}" width="${g(104)}" height="${g(160)}" rx="${g(44)}" fill="#1a222c" opacity="0.16"/>
${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="0" cy="${g(-95 + i * 26)}" rx="${g(42)}" ry="${g(8)}" fill="none" stroke="#1a222c" stroke-opacity="0.32" stroke-width="2"/>`).join('')}
<circle cx="0" cy="${g(-150)}" r="${g(11)}" fill="${accent}" opacity="0.6"/>
<rect x="${g(48)}" y="${g(20)}" width="${g(18)}" height="${g(28)}" rx="${g(5)}" fill="#6e767e"/>
</g>`;
}

function svgHeadphonesSilhouette(cx: number, cy: number, scale = 1, accent = '#7d9b78'): string {
  const g = (n: number) => Math.round(n * scale);
  return `<g transform="translate(${cx},${cy})">
<path d="M ${g(-130)} ${g(10)} C ${g(-130)} ${g(-130)} ${g(130)} ${g(-130)} ${g(130)} ${g(10)}" fill="none" stroke="#e8eef4" stroke-width="${g(28)}" stroke-linecap="round"/>
<path d="M ${g(-130)} ${g(10)} C ${g(-130)} ${g(-130)} ${g(130)} ${g(-130)} ${g(130)} ${g(10)}" fill="none" stroke="#1a222c" stroke-opacity="0.12" stroke-width="${g(8)}"/>
<rect x="${g(-168)}" y="${g(-20)}" width="${g(70)}" height="${g(130)}" rx="${g(28)}" fill="#e8eef4"/>
<rect x="${g(98)}" y="${g(-20)}" width="${g(70)}" height="${g(130)}" rx="${g(28)}" fill="#e8eef4"/>
<rect x="${g(-152)}" y="${g(8)}" width="${g(40)}" height="${g(80)}" rx="${g(16)}" fill="#1a222c" opacity="0.2"/>
<rect x="${g(112)}" y="${g(8)}" width="${g(40)}" height="${g(80)}" rx="${g(16)}" fill="#1a222c" opacity="0.2"/>
<rect x="${g(-146)}" y="${g(22)}" width="${g(28)}" height="${g(52)}" rx="${g(10)}" fill="${accent}" opacity="0.5"/>
<rect x="${g(118)}" y="${g(22)}" width="${g(28)}" height="${g(52)}" rx="${g(10)}" fill="${accent}" opacity="0.5"/>
</g>`;
}

function svgGuitarSilhouette(cx: number, cy: number, scale = 1, accent = '#7d9b78'): string {
  const g = (n: number) => Math.round(n * scale);
  return `<g transform="translate(${cx},${cy})">
<rect x="${g(-10)}" y="${g(-220)}" width="${g(20)}" height="${g(200)}" rx="${g(6)}" fill="#cfd8e0"/>
<ellipse cx="0" cy="${g(40)}" rx="${g(90)}" ry="${g(120)}" fill="#e8eef4"/>
<ellipse cx="0" cy="${g(-20)}" rx="${g(55)}" ry="${g(50)}" fill="#e8eef4"/>
<circle cx="0" cy="${g(20)}" r="${g(28)}" fill="#1a222c" opacity="0.2"/>
<circle cx="0" cy="${g(20)}" r="${g(10)}" fill="${accent}" opacity="0.5"/>
</g>`;
}

function svgKeyboardSilhouette(cx: number, cy: number, scale = 1, accent = '#7d9b78'): string {
  const g = (n: number) => Math.round(n * scale);
  const keys = Array.from({ length: 12 }, (_, i) => {
    const x = g(-140 + (i % 6) * 48);
    const y = g(-40 + Math.floor(i / 6) * 42);
    return `<rect x="${x}" y="${y}" width="${g(36)}" height="${g(28)}" rx="${g(6)}" fill="#1a222c" opacity="0.2"/>`;
  }).join('');
  return `<g transform="translate(${cx},${cy})">
<rect x="${g(-170)}" y="${g(-70)}" width="${g(340)}" height="${g(140)}" rx="${g(18)}" fill="#e8eef4"/>
${keys}
<rect x="${g(-40)}" y="${g(50)}" width="${g(80)}" height="${g(10)}" rx="${g(4)}" fill="${accent}" opacity="0.5"/>
</g>`;
}

function svgMouseSilhouette(cx: number, cy: number, scale = 1, accent = '#7d9b78'): string {
  const g = (n: number) => Math.round(n * scale);
  return `<g transform="translate(${cx},${cy})">
<ellipse cx="0" cy="${g(20)}" rx="${g(70)}" ry="${g(110)}" fill="#e8eef4"/>
<line x1="0" y1="${g(-70)}" x2="0" y2="${g(20)}" stroke="#1a222c" stroke-opacity="0.2" stroke-width="3"/>
<rect x="${g(-8)}" y="${g(-40)}" width="${g(16)}" height="${g(36)}" rx="${g(6)}" fill="${accent}" opacity="0.55"/>
</g>`;
}

function svgClipMicSilhouette(cx: number, cy: number, scale = 1, accent = '#7d9b78'): string {
  const g = (n: number) => Math.round(n * scale);
  return `<g transform="translate(${cx},${cy})">
<rect x="${g(-28)}" y="${g(-78)}" width="${g(56)}" height="${g(120)}" rx="${g(22)}" fill="#e8eef4"/>
${[0, 1, 2, 3].map((i) => `<ellipse cx="0" cy="${g(-48 + i * 22)}" rx="${g(18)}" ry="${g(6)}" fill="none" stroke="#1a222c" stroke-opacity="0.35" stroke-width="2"/>`).join('')}
<path d="M ${g(28)} ${g(-8)} L ${g(62)} ${g(28)} L ${g(52)} ${g(38)} L ${g(18)} ${g(2)} Z" fill="#cfd8e0"/>
<path d="M ${g(52)} ${g(38)} L ${g(72)} ${g(58)}" stroke="#cfd8e0" stroke-width="${g(6)}" stroke-linecap="round"/>
<circle cx="0" cy="${g(-78)}" r="${g(7)}" fill="${accent}" opacity="0.55"/>
</g>`;
}

function productGlyphBody(
  kind: HeroProductKind,
  variant: 'clip' | 'dynamic' | 'condenser',
  cx: number,
  cy: number,
  scale: number,
  accent: string,
  label: string,
): string {
  if (kind === 'mic' && variant === 'clip') return svgClipMicSilhouette(cx, cy, scale, accent);
  if (kind === 'mic' && variant === 'dynamic') return svgMicSilhouette(cx, cy, scale * 0.85, accent);
  if (kind === 'mic') return svgMicSilhouette(cx, cy, scale, accent);
  if (kind === 'headphones') return svgHeadphonesSilhouette(cx, cy, scale, accent);
  if (kind === 'guitar') return svgGuitarSilhouette(cx, cy, scale, accent);
  if (kind === 'keyboard') return svgKeyboardSilhouette(cx, cy, scale, accent);
  if (kind === 'mouse') return svgMouseSilhouette(cx, cy, scale, accent);
  return `<rect x="${cx - 90}" y="${cy - 90}" width="180" height="180" rx="28" fill="#e8eef4"/>
<text x="${cx}" y="${cy + 8}" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="22">${escapeXml(label.slice(0, 10))}</text>`;
}

/**
 * Inline SVG JSX for App.jsx — preferred over data-URIs (syntax-gate safe, offline).
 */
export function productGlyphJsx(
  label: string,
  opts?: { role?: 'hero' | 'thumb'; brief?: string; accent?: string; className?: string },
): string {
  const name = String(label || 'Product').replace(/[<>&'"`]/g, '').slice(0, 40) || 'Product';
  const brief = String(opts?.brief || '');
  const role = opts?.role || 'thumb';
  const accent = opts?.accent || '#7d9b78';
  const kind = detectHeroProductKind(name, brief, name);
  const variant = /\b(?:clip|travel|lav)\b/i.test(name) ? 'clip'
    : /\b(?:desk|dynamic)\b/i.test(name) ? 'dynamic'
    : 'condenser';
  const cls = opts?.className || (role === 'hero' ? 'stage-glyph' : 'product-card__thumb');
  const uid = `g${Math.abs(hashGlyph(`${name}:${role}:${kind}`)).toString(36)}`;

  if (role === 'hero') {
    const body = productGlyphBody(kind, variant, 800, 420, 1.35, accent, name);
    return `<svg className="${cls}" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${uid}-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#0c1410" />
      <stop offset="100%" stopColor="#0a0e0d" />
    </linearGradient>
    <radialGradient id="${uid}-glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stopColor="${accent}" stopOpacity="0.32" />
      <stop offset="100%" stopColor="#0a0e0d" stopOpacity="0" />
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill={"url(#${uid}-bg)"} />
  <rect width="1600" height="900" fill={"url(#${uid}-glow)"} />
  <circle cx="420" cy="220" r="120" fill="${accent}" fillOpacity="0.12" />
  <circle cx="1180" cy="640" r="180" fill="${accent}" fillOpacity="0.1" />
  ${body.replace(/stroke-opacity=/g, 'strokeOpacity=').replace(/stroke-width=/g, 'strokeWidth=').replace(/fill-opacity=/g, 'fillOpacity=').replace(/stroke-linecap=/g, 'strokeLinecap=')}
</svg>`;
  }

  const body = productGlyphBody(kind, variant, 160, 160, 1.15, accent, name);
  return `<svg className="${cls}" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${uid}-tg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#121816" />
      <stop offset="100%" stopColor="#0a0e0d" />
    </linearGradient>
    <radialGradient id="${uid}-g" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stopColor="${accent}" stopOpacity="0.28" />
      <stop offset="100%" stopColor="#0a0e0d" stopOpacity="0" />
    </radialGradient>
  </defs>
  <rect width="320" height="320" rx="18" fill={"url(#${uid}-tg)"} />
  <rect width="320" height="320" rx="18" fill={"url(#${uid}-g)"} />
  ${body.replace(/stroke-opacity=/g, 'strokeOpacity=').replace(/stroke-width=/g, 'strokeWidth=').replace(/fill-opacity=/g, 'fillOpacity=').replace(/stroke-linecap=/g, 'strokeLinecap=')}
</svg>`;
}

function hashGlyph(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/**
 * Offline product glyph for shop thumbs / hero stages.
 * Never returns http(s) — only data:image/svg+xml.
 */
export function productGlyphDataUrl(
  label: string,
  opts?: { role?: 'hero' | 'thumb'; brief?: string; accent?: string },
): string {
  const name = String(label || 'Product').replace(/[<>&'"`]/g, '').slice(0, 40) || 'Product';
  const brief = String(opts?.brief || '');
  const role = opts?.role || 'thumb';
  const accent = opts?.accent || '#7d9b78';
  const kind = detectHeroProductKind(name, brief, name);
  const variant = /\b(?:clip|travel|lav)\b/i.test(name) ? 'clip'
    : /\b(?:desk|dynamic)\b/i.test(name) ? 'dynamic'
    : 'condenser';

  if (role === 'hero') {
    return svgHeroDataUrl(
      { name, brief: `${brief} ${name} ${kind}`, category: kind, palette: { ...NEUTRAL, accent } },
      name,
    );
  }

  const w = 320;
  const h = 320;
  const body = productGlyphBody(kind, variant, 160, 160, kind === 'mic' ? 1.05 : 0.95, accent, name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="#121816"/><stop offset="100%" stop-color="#0a0e0d"/>
</linearGradient>
<radialGradient id="glow" cx="50%" cy="40%" r="50%">
<stop offset="0%" stop-color="${accent}" stop-opacity="0.28"/><stop offset="100%" stop-color="#0a0e0d" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="${w}" height="${h}" rx="18" fill="url(#tg)"/>
<rect width="${w}" height="${h}" rx="18" fill="url(#glow)"/>
${body}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
