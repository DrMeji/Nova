/**
 * Ask contract — brief → required sections, copy, interactions, Live match judge.
 * Model-agnostic: Nova seed + gates own quality; 7B invent is optional depth.
 */

import { inferCreateCompositionFamily } from '@/lib/createProductPlan';
import type { CompositionFamily } from '@/lib/createDesignSystem';

export type AskGenre = 'spirits' | 'coffee' | 'tea' | 'chocolate' | 'ceramic' | 'generic';

export type AskContract = {
  productName: string;
  genre: AskGenre;
  compositionFamily: CompositionFamily;
  /** DOM ids the page must expose for nav CTAs. */
  requiredAnchors: string[];
  /** Extra section slots beyond plan regions (notes / shop / subscribe). */
  extraSlots: string[];
  headline: string;
  lede: string;
  storyTitle: string;
  storyCards: Array<{ title: string; body: string }>;
  noteItems: Array<{ title: string; body: string }>;
  shopItems: Array<{ name: string; price: string; blurb: string }>;
  wantsNotes: boolean;
  wantsShop: boolean;
  wantsSubscribe: boolean;
  wantsVisit: boolean;
  forbidCoffeeCopy: boolean;
};

function scrubNegations(brief: string): string {
  return String(brief || '')
    .replace(/\bnot\s+coffee\b/gi, ' ')
    .replace(/\b(?:not|never|no|without|avoid)\s+(?:a\s+|an\s+)?(?:tip|todo|landing)\b/gi, ' ');
}

/** Craft / verify / Live-test jargon that must never become H1 / lede copy. */
const CRAFT_LEAK_RE = /\b(?:skip\s+plan|put\s+it\s+on\s+disk|get\s+it\s+live|full\s+sections?|brand-?new|marketing\s+website|website\s+for|hero\s+with|roast\s+visual|product\s+visual|nav|footer)\b/gi;
/** Short run tokens appended in Live verifies (wj4v9, wo8h1) — never UI copy. */
const RUN_TOKEN_RE = /\b[a-z]{1,3}\d[a-z0-9]{2,5}\b/gi;

function scrubCraftJargon(brief: string): string {
  return String(brief || '')
    .replace(CRAFT_LEAK_RE, ' ')
    .replace(RUN_TOKEN_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a brief cue is instruction leak / verify noise, not brand voice. */
export function isCraftLeakCue(cue: string): boolean {
  const c = String(cue || '').trim();
  if (!c) return true;
  if (/^-?new\s+marketing\b/i.test(c)) return true;
  if (/\b(?:skip\s+plan|put\s+it\s+on\s+disk|get\s+it\s+live|full\s+sections?|brand-?new|marketing\s+website|website\s+for|hero\s+with|roast\s+visual|product\s+visual)\b/i.test(c)) {
    return true;
  }
  if (/\b[a-z]{1,3}\d[a-z0-9]{2,5}\b/i.test(c)) return true;
  if (/^(?:subscribe|shop|story|notes|visit|nav|footer)$/i.test(c)) return true;
  return false;
}

/** Display name for seed UI — strips Live run tokens from the product title. */
export function displayProductName(name: string): string {
  const cleaned = String(name || '')
    .replace(RUN_TOKEN_RE, ' ')
    // Trailing short run ids without digits (yyega, zdgj7 already covered above).
    .replace(/\s+[a-z]{4,6}$/i, (m, _o, s) => (/\s/.test(String(s).slice(0, -m.length)) ? '' : m))
    // Harness salts like "zl02" / "j9yj" (3–5 alnum) — Wren Latch 2026-10-23: zl02
    // survived RUN_TOKEN_RE (needs 2+ chars after the digit) and blocked Ready forever.
    .replace(/\s+[a-z0-9]{3,5}$/i, (m, _o, s) => {
      const core = String(s).slice(0, -m.length).trim();
      return /[A-Z]/.test(core) && core.split(/\s+/).length >= 2 ? '' : m;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || String(name || 'Brand').trim() || 'Brand';
}

export function inferAskGenre(name: string, brief: string): AskGenre {
  const blob = `${name} ${brief}`;
  // Leather atelier / bags — never coffee just because the brief says "espresso navy type".
  // Dune Latch 2026-10-23: coffee genre forced #notes/#visit + tasting notes → soft Ready forever.
  if (/\b(?:leather[- ]?goods|leather\s+atelier|handcrafted\s+bags?|atelier|parchment|satchel|tote|messenger|weekender)\b/i.test(blob)
    && !/\b(?:coffee\s+shop|coffee\s+brand|roaster|cafe|café)\b/i.test(blob)) {
    return 'generic';
  }
  if (/\b(?:gin|whisky|whiskey|vodka|tequila|bourbon|rum|spirit|distill|liquor|scotch)\b/i.test(blob)) {
    return 'spirits';
  }
  if (/\b(?:matcha|green\s+tea|ceremonial\s+tea)\b/i.test(blob)) return 'tea';
  if (/\b(?:tea|steep|tin)\b/i.test(blob) && !/\bcoffee\b/i.test(blob)) return 'tea';
  if (
    /\b(?:coffee|roaster|roast)\b/i.test(blob)
    || (/\bespresso\b/i.test(blob) && !/\bespresso\s+(?:navy|type|ink|text|color)\b/i.test(blob))
  ) {
    if (!/\bnot\s+coffee\b/i.test(brief)) return 'coffee';
  }
  if (/\b(?:chocolate|cacao|cocoa)\b/i.test(blob)) return 'chocolate';
  if (/\b(?:ceramic|pottery|porcelain|stoneware|tableware|kiln|dinnerware|clay)\b/i.test(blob)) {
    return 'ceramic';
  }
  return 'generic';
}

/**
 * Pull short phrase cues from the brief for seed copy (never craft jargon).
 * Patch 4 — split on sentence punctuation too, up to 6 cues.
 */
export function briefPhrases(brief: string, max = 6): string[] {
  const raw = scrubCraftJargon(scrubNegations(brief)).replace(/https?:\/\/\S+/gi, ' ');
  const parts = raw
    .split(/[.!?;,·|]+/)
    .map((p) => p
      .replace(/\b(?:build|create|make|website|homepage|landing|page|with|and|the|a|an|for|brand|called|new|marketing)\b/gi, ' ')
      .replace(/[^a-z0-9\s'’.-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((p) => p.length >= 8 && p.length <= 90 && !isCraftLeakCue(p))
    .slice(0, max);
  if (parts.length) return parts;
  const flat = raw
    .replace(/\b(?:build|create|make|website|homepage|landing|page|new|marketing)\b/gi, ' ')
    .replace(/[^a-z0-9\s'’.-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length >= 12 && !isCraftLeakCue(flat.slice(0, 90))) return [flat.slice(0, 90)];
  return [];
}

/** Weave a brief cue into a seed sentence without dropping the genre fallback. */
function withCue(cue: string | undefined, fallback: string): string {
  if (!cue) return fallback;
  const c = escapeJsxText(cue);
  const f = String(fallback || '').trim();
  if (!f) return c;
  if (f.toLowerCase().includes(c.slice(0, 12).toLowerCase())) return f;
  return escapeJsxText(`${c}. ${f}`);
}

function escapeJsxText(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .slice(0, 160);
}

/**
 * Build a concrete ask contract from the user brief.
 * Drives seed sections, copy, interactions, and Live match scoring.
 */
export function buildAskContract(brief: string, productName = ''): AskContract {
  const rawName = String(productName || '').trim() || 'Brand';
  const name = displayProductName(rawName);
  const b = String(brief || '');
  const genre = inferAskGenre(rawName, b);
  const compositionFamily = inferCreateCompositionFamily(b, rawName);
  const phrases = briefPhrases(b, 6).filter((p) => !isCraftLeakCue(p));
  const cueRaw = phrases[0] || '';
  const cue = cueRaw && !isCraftLeakCue(cueRaw) ? escapeJsxText(cueRaw) : '';

  // Toys / tools / games: never force F&B shop/notes. Catalog + marketing get shop when asked.
  const isToyFamily = compositionFamily === 'tool-panel'
    || compositionFamily === 'app-chrome'
    || compositionFamily === 'game-stage';
  const wantsNotes = !isToyFamily && (
    /\b(?:tast(?:e|ing)\s*notes?|flavor\s*notes?|aroma|palate|notes?\s+section|clay\s*notes?|material\s*notes?)\b/i.test(b)
    || genre === 'spirits'
    || genre === 'coffee'
    || genre === 'tea'
    || genre === 'chocolate'
    || genre === 'ceramic'
  );
  const localRetailSite = compositionFamily === 'marketing-bands'
    && /\b(?:plant\s+shop|flower\s+shop|bookshop|bookstore|gift\s+shop|hardware\s+store|bike\s+shop|pet\s+shop|record\s+shop|farm\s+stand|garden\s+center|neighborhood\s+(?:shop|store|business))\b/i.test(b);
  const wantsShop = !isToyFamily && (
    compositionFamily === 'catalog-store'
    || localRetailSite
    || /\b(?:shop|store|collection|catalog|buy|purchase|cart|checkout)\b/i.test(b)
  );
  const wantsSubscribe = !isToyFamily && (
    /\b(?:subscribe|subscription|newsletter|club)\b/i.test(b)
  );
  const wantsVisit = !isToyFamily && (
    /\b(?:visit|tasting\s+room|counter|open\s+days|location)\b/i.test(b)
    || localRetailSite
    || genre === 'spirits'
    || genre === 'coffee'
  );
  const forbidCoffeeCopy = genre === 'spirits' || /\bnot\s+coffee\b/i.test(b);

  const requiredAnchors = ['top'];
  if (!isToyFamily) requiredAnchors.push('story');
  if (wantsNotes) requiredAnchors.push('notes');
  if (wantsShop) requiredAnchors.push('shop');
  if (wantsSubscribe) requiredAnchors.push('subscribe');
  if (wantsVisit) requiredAnchors.push('visit');
  // Patch 5 — family anchors (non-F&B) without inventing F&B bands.
  if (compositionFamily === 'catalog-store') {
    requiredAnchors.push('shop');
    if (!requiredAnchors.includes('filters')) requiredAnchors.push('filters');
  } else if (compositionFamily === 'tool-panel') {
    requiredAnchors.push('tool', 'result');
  } else if (compositionFamily === 'app-chrome') {
    requiredAnchors.push('workspace');
  } else if (compositionFamily === 'game-stage') {
    requiredAnchors.push('play', 'hud');
  }
  if (localRetailSite) {
    if (!requiredAnchors.includes('shop')) requiredAnchors.push('shop');
    if (!requiredAnchors.includes('visit')) requiredAnchors.push('visit');
  }

  const extraSlots: string[] = [];
  if (wantsNotes) extraSlots.push('tasting notes band with aroma / palate / finish');
  if (wantsShop) extraSlots.push('shop / collection catalog with priced items');
  if (wantsSubscribe) extraSlots.push('subscribe / newsletter capture before footer');
  if (compositionFamily === 'catalog-store' && !wantsShop) {
    extraSlots.push('shop / collection catalog with priced items');
  }
  if (compositionFamily === 'tool-panel') {
    extraSlots.push('tool inputs + compute/action + readable result area');
  } else if (compositionFamily === 'app-chrome') {
    extraSlots.push('main workspace + primary action + sample items or empty state');
  } else if (compositionFamily === 'game-stage') {
    extraSlots.push('score/status HUD + restart affordance');
  }

  const storyTitle = genre === 'spirits' || /coast|harbor|cove|brine/i.test(b)
    ? 'From the coast'
    : genre === 'coffee' || /farm/i.test(b)
      ? 'From the farm'
      : genre === 'tea'
        ? 'From the garden'
        : genre === 'chocolate'
          ? 'From the origin'
          : genre === 'ceramic'
            ? 'From clay to table'
            : compositionFamily === 'catalog-store'
              ? 'The collection'
              : 'Our story';

  const headline = genre === 'spirits'
    ? (cue ? `${name} — ${cue}` : `${name} · coastal craft in every pour`)
    : genre === 'coffee'
      ? (cue ? `${name} — ${cue}` : `${name} · roasted for people who taste the farm`)
      : genre === 'tea'
        ? (cue ? `${name} — ${cue}` : `${name} · ceremonial calm in every tin`)
        : genre === 'chocolate'
          ? (cue ? `${name} — ${cue}` : `${name} · origin cacao, tempered with care`)
          : genre === 'ceramic'
            ? (cue ? `${name} — ${cue}` : `Tableware that keeps the fire's quiet.`)
            : (cue ? `${name} — ${cue}` : `Crafted for people who notice the details`);

  const lede = (() => {
    if (phrases.length >= 2) {
      return escapeJsxText(`${phrases[0]}. ${phrases[1]}.`);
    }
    if (cue) {
      return `${escapeJsxText(name)} is shaped by ${cue} — with a clear path to shop${wantsSubscribe ? ' or subscribe' : ''}.`;
    }
    if (genre === 'spirits') {
      return `${name} is a small-batch spirits brand built around place, craft, and tasting — not coffee, not a template.`;
    }
    if (genre === 'coffee') {
      return `${name} is a small-batch coffee brand built around farm origin and careful roasting, with a clear path to shop or subscribe.`;
    }
    if (genre === 'tea') {
      return `${name} is a ceremonial tea brand built around leaf, tin, and quiet ritual — shop the collection or start a subscription.`;
    }
    if (genre === 'chocolate') {
      return `${name} is an origin chocolate brand built around cacao and careful tempering, with a clear path to shop.`;
    }
    if (genre === 'ceramic') {
      return `${name} is small-batch ceramic tableware — kiln-fired plates and bowls for ordinary evenings that feel considered.`;
    }
    return `${name} is built around origin, craft, and honest materials — with a clear path to try it.`;
  })();

  const baseStory = genre === 'spirits'
    ? [
      { title: 'Coast', body: `Where ${name} begins — salt air, stills, and a place you can taste in the glass.` },
      { title: 'Craft', body: 'Botanicals paced with intention. Small batches. No filler stories.' },
      { title: 'Taste', body: 'Citrus peel, juniper, a clean finish — written like a real tasting card.' },
      { title: 'Invite', body: 'Shop a bottle, book a tasting, or subscribe without a cluttered funnel.' },
    ]
    : genre === 'coffee'
      ? [
        { title: 'Origin', body: `Farm lots behind ${name} — elevation, variety, and the people who grew it.` },
        { title: 'Roast', body: 'Careful development so sweetness stays, bitterness never takes over.' },
        { title: 'Cup', body: 'What you notice first — aroma, body, finish — in plain language.' },
        { title: 'Invite', body: 'Shop bags, start a subscription, or visit the counter.' },
      ]
      : genre === 'tea'
        ? [
          { title: 'Leaf', body: `The gardens and grades behind ${name} — ceremonial and everyday.` },
          { title: 'Tin', body: 'Sealed for freshness. Opened for a quiet daily ritual.' },
          { title: 'Steep', body: 'Water, time, and a clean cup — no ceremony theater.' },
          { title: 'Invite', body: 'Shop tins or subscribe for the tin that fits your week.' },
        ]
        : genre === 'ceramic'
          ? [
            { title: 'One kiln', body: `Every ${name} piece shares the same heat curve — glaze and body speak one language.` },
            { title: 'Honest rims', body: 'Edges stay soft under the thumb. Stacks stay quiet in the cupboard.' },
            { title: 'Daily use', body: 'Designed for dishwashers and weeknights — not a shelf you are afraid to touch.' },
            { title: 'Invite', body: 'Shop the collection or subscribe when a new firing leaves the kiln.' },
          ]
        : [
          { title: 'Origin', body: `Where it begins: materials, place, and the people behind ${name}.` },
          { title: 'Craft', body: 'How it is made — paced, intentional, finished on first glance.' },
          { title: 'Invite', body: 'A short path to try it: shop, visit, or subscribe.' },
          { title: 'Notes', body: 'What you notice first — texture, aroma, finish — not lorem.' },
        ];
  // Patch 4 — cues[1..3] into story card bodies.
  const storyCards = baseStory.map((c, i) => ({
    title: c.title,
    body: withCue(phrases[i + 1], c.body),
  }));

  const baseNotes = genre === 'spirits'
    ? [
      { title: 'Nose', body: 'Citrus peel, juniper, a hint of coastal herb.' },
      { title: 'Palate', body: 'Clean botanicals, soft spice, no heavy sweetness.' },
      { title: 'Finish', body: 'Long, dry, and easy to return to.' },
    ]
    : genre === 'coffee'
      ? [
        { title: 'Aroma', body: 'Stone fruit and cocoa when the bag first opens.' },
        { title: 'Cup', body: 'Rounded sweetness, steady body, quiet acidity.' },
        { title: 'Finish', body: 'Clean aftertaste that invites another sip.' },
      ]
      : genre === 'tea'
        ? [
          { title: 'Aroma', body: 'Fresh leaf and soft umami when the tin opens.' },
          { title: 'Cup', body: 'Silky body, calm bitterness, no harsh edge.' },
          { title: 'Finish', body: 'A lingering green sweetness.' },
        ]
        : genre === 'ceramic'
          ? [
            { title: 'Stoneware body', body: 'High-fire clay that holds heat at the table and keeps a quiet ring when tapped.' },
            { title: 'Ash glaze', body: 'Soft kiln ash melts into a satin skin — never glossy, never plastic.' },
            { title: 'Hand trim', body: 'Every foot ring is cut by hand so plates stack clean and bowls sit true.' },
          ]
        : [
          { title: 'First', body: `What ${name} shows in the first moment.` },
          { title: 'Middle', body: 'How the craft settles once you stay with it.' },
          { title: 'Last', body: 'The detail you remember after.' },
        ];
  const noteItems = baseNotes.map((n, i) => ({
    title: n.title,
    body: withCue(phrases[i + 1] || phrases[i], n.body),
  }));

  const baseShop = genre === 'spirits'
    ? [
      { name: `${name} Coastal Gin`, price: '$42', blurb: '750ml · small batch · tasting card included' },
      { name: `${name} Reserve`, price: '$58', blurb: 'Limited cask finish · numbered bottles' },
      { name: 'Tasting flight', price: '$24', blurb: 'Three pours · book ahead or walk in' },
    ]
    : genre === 'coffee'
      ? [
        { name: `${name} House Roast`, price: '$18', blurb: '12oz whole bean · weekly fresh' },
        { name: 'Farm Lot', price: '$22', blurb: 'Single origin · rotating lots' },
        { name: 'Subscription', price: '$16/bag', blurb: 'Arrive on your schedule' },
      ]
      : genre === 'tea'
        ? [
          { name: `${name} Ceremonial`, price: '$28', blurb: '40g tin · stone-ground' },
          { name: 'Everyday', price: '$18', blurb: 'Daily whisk · same garden line' },
          { name: 'Subscribe', price: '$16/tin', blurb: 'Never run out of the good tin' },
        ]
        : genre === 'ceramic'
          ? [
            { name: `${name} Dinner Plate`, price: '$48', blurb: 'Wide rim, warm cream field' },
            { name: 'Coupe Bowl', price: '$36', blurb: 'Deep enough for stew, soft enough for fruit' },
            { name: 'Side Plate', price: '$28', blurb: 'A smaller stage for bread and citrus' },
          ]
        : [
          { name: `${name} Signature`, price: '$24', blurb: 'The starting piece of the collection' },
          { name: 'Gift set', price: '$48', blurb: 'Two pieces · ready to give' },
          { name: 'Subscribe', price: '$20', blurb: 'A steady rhythm, not a hard sell' },
        ];
  const shopItems = baseShop.map((p, i) => ({
    ...p,
    blurb: withCue(phrases[i + 2] || phrases[1], p.blurb),
  }));

  return {
    productName: name,
    genre,
    compositionFamily,
    requiredAnchors: [...new Set(requiredAnchors)],
    extraSlots: [...new Set(extraSlots)],
    headline: escapeJsxText(headline).slice(0, 96),
    lede,
    storyTitle,
    storyCards,
    noteItems,
    shopItems,
    wantsNotes,
    wantsShop,
    wantsSubscribe,
    wantsVisit,
    forbidCoffeeCopy,
  };
}

/** UI blob for scoring — App + section files + CSS. */
export function askUiBlob(files: Record<string, string>): string {
  return Object.entries(files)
    .filter(([k]) => /^(?:src\/App\.(?:jsx|tsx|css)|src\/sections\/.+\.jsx)$/i.test(k.replace(/\\/g, '/')))
    .map(([, v]) => String(v || ''))
    .join('\n');
}

/** Bands whose copy must live under its own anchor (Patch 6 — per-section purpose). */
const ASK_BANDS = ['notes', 'shop', 'subscribe'] as const;
type AskBand = (typeof ASK_BANDS)[number];

/** Tight copy signals — loose words ("shop", "aroma" in story copy) must not flag a band. */
const BAND_COPY: Record<AskBand, RegExp> = {
  notes: /tasting\s+notes|\bnose\b|\bpalate\b|note-card|notes-list/i,
  shop: /Shop the collection|add\s+to\s+(?:bag|cart)|shop-(?:card|price|grid)/i,
  subscribe: /subscribe-form|type=["']email["']|newsletter/i,
};

function fileBandIds(path: string, body: string): AskBand[] {
  const norm = String(path || '').replace(/\\/g, '/');
  if (!/^src\/(?:sections\/[^/]+\.jsx|App\.(?:jsx|tsx))$/i.test(norm)) return [];
  const ids = [...String(body || '').matchAll(/\bid=["']([a-z-]+)["']/gi)].map((m) => m[1].toLowerCase());
  return ASK_BANDS.filter((b) => ids.includes(b));
}

/**
 * Patch 6 — per-section purpose: copy for a required band must live under its own anchor.
 * Soft in scoreAskMatch (reasons only, no ok flip); askSectionHardMisses promotes
 * notes/shop to a hard Live miss for compositional asks (subscribe stays soft).
 * Monolith App.jsx is home for every band it declares, so this never fires on thin single-file creates.
 */
export function askSectionPurposeDeficits(
  files: Record<string, string>,
  brief: string,
  productName = '',
): string[] {
  const contract = buildAskContract(brief, productName);
  String(brief || '');
  const wanted: AskBand[] = [];
  if (contract.wantsNotes) wanted.push('notes');
  if (contract.wantsShop) wanted.push('shop');
  if (contract.wantsSubscribe) wanted.push('subscribe');
  if (!wanted.length) return [];
  const entries = Object.entries(files || {}).map(([path, body]) => ({
    path: String(path || '').replace(/\\/g, '/'),
    body: String(body || ''),
  }));
  const out: string[] = [];
  for (const band of wanted) {
    const homes = entries.filter((e) => fileBandIds(e.path, e.body).includes(band));
    if (homes.some((e) => BAND_COPY[band].test(e.body))) continue;
    // Copy exists only in files that declare a *different* band id (hero/nav/footer have none → never culprits).
    const culprits = entries.filter((e) => {
      const ids = fileBandIds(e.path, e.body);
      return ids.length > 0 && !ids.includes(band) && BAND_COPY[band].test(e.body);
    });
    if (!culprits.length) continue;
    const under = [...new Set(culprits.flatMap((e) => fileBandIds(e.path, e.body)))];
    out.push(`band purpose: ${band} copy lives under #${under.join(' #')} — move it under #${band}`);
  }
  return out;
}

export type AskMatchResult = {
  ok: boolean;
  score: number;
  reasons: string[];
};

/**
 * Live judge — does the mounted tree match the ask?
 * Soft on invent depth; hard on wrong genre + missing required anchors/art.
 */
export function scoreAskMatch(
  files: Record<string, string>,
  brief: string,
  productName = '',
): AskMatchResult {
  const contract = buildAskContract(brief, productName);
  const rawBrief = String(brief || '');
  const blob = askUiBlob(files);
  const reasons: string[] = [];
  let score = 0;
  const max = 10;

  if (!blob.trim()) {
    return { ok: false, score: 0, reasons: ['no UI files to judge'] };
  }

  // Patch 6 — per-section purpose (soft; pushed early so it survives the reasons slice).
  for (const d of askSectionPurposeDeficits(files, brief, productName)) reasons.push(d);

  const nameRe = new RegExp(contract.productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (nameRe.test(blob)) score += 1;
  else reasons.push(`brand name missing: ${contract.productName}`);

  const wantsProductVisual = /\b(?:product\s+visual|hero\s+(?:product\s+)?(?:visual|art)|product\s+(?:image|illustration|render)|show\s+(?:the\s+)?product)\b/i.test(rawBrief);
   if (!wantsProductVisual) score += 2;
   else if (/\bHERO_VISUAL\b/.test(blob) && /data:image\/svg\+xml/i.test(blob)) score += 2;
   else if (/className=["'][^"']*\bhero-art\b/i.test(blob)) score += 1;
   else reasons.push('missing designed hero product art');

  for (const id of contract.requiredAnchors) {
    if (id === 'top' || id === 'story') continue;
    // Soft-skip family chrome anchors that seed may express without exact ids (tool/workspace/play).
    if (/^(?:tool|result|workspace|play|hud|filters)$/i.test(id)) {
      const soft = id === 'filters'
        ? /filter|catalog|product-grid|id=["']shop["']/i.test(blob)
        : id === 'tool' || id === 'result'
          ? /input|button|result|compute|useState/i.test(blob)
          : id === 'workspace'
            ? /sidebar|workspace|main|empty/i.test(blob)
            : /canvas|score|hud|restart|play/i.test(blob);
      if (soft) score += 1;
      else reasons.push(`ask anchor missing: #${id}`);
      continue;
    }
    const idHit = new RegExp(`id=["']${id}["']`, 'i').test(blob)
      || new RegExp(`href=["']#${id}["']`, 'i').test(blob);
    if (idHit) score += 1;
    else reasons.push(`ask anchor missing: #${id}`);
  }

  if (contract.forbidCoffeeCopy) {
    if (/\bcoffee brand\b|careful roasting|whole bean|espresso\b/i.test(blob)
      && !/\bnot\s+coffee\b/i.test(blob)) {
      reasons.push('wrong genre: coffee copy on a spirits/not-coffee ask');
      score = Math.max(0, score - 3);
    } else {
      score += 1;
    }
  } else {
    score += 1;
  }

  if (contract.wantsSubscribe) {
    if (/id=["']subscribe["']|type=["']email["']|Subscribe/i.test(blob)) score += 1;
    else reasons.push('subscribe path missing');
  }

  if (contract.wantsShop) {
    if (/id=["']shop["']|Shop the collection|add to (?:bag|cart)/i.test(blob)) score += 1;
    else reasons.push('shop path missing');
  }

  if (contract.wantsNotes) {
    if (/id=["']notes["']|Tasting notes|Nose|Aroma|Palate/i.test(blob)) score += 1;
    else reasons.push('tasting notes missing');
  }

  // Interactive stubs (Interact v1) — landing shop/nav CTAs count; leather invents
  // often ship #shop + "Shop the collection" without useState.
  const interactHits = [
    /useState\s*\(/.test(blob),
    /onClick|onSubmit|type=["']email["']/i.test(blob),
    /Shop the collection|id=["']shop["']|href=["']#shop["']|id=["']subscribe["']/i.test(blob),
  ].filter(Boolean).length;
  if (interactHits >= 1) score += 1;
  else if (contract.wantsShop || contract.wantsSubscribe) {
    reasons.push('no interactive stub (subscribe/shop/notes)');
  }

  const ok = reasons.filter((r) => /wrong genre|missing designed hero|brand name missing/i.test(r)).length === 0
    && score >= Math.min(6, max - 2);
  return {
    ok,
    score: Math.min(max, score),
    reasons: [...new Set(reasons)].slice(0, 10),
  };
}

/** Deficits suitable for Live unlock / status chrome. */
export function askMatchDeficits(
  files: Record<string, string>,
  brief: string,
  productName = '',
): string[] {
  const blob = `${brief} ${productName}`;
  const family = inferCreateCompositionFamily(brief, productName);
  const marketingish = /\b(?:website|homepage|landing|brand|shop|store|gin|coffee|tea|matcha|chocolate|roaster|distill|lotion|serum|skincare|dates?|honey|olive|vacuum|hardware|mouse|keyboard|saas)\b/i.test(blob);
  const familyish = family === 'catalog-store'
    || family === 'marketing-bands'
    || family === 'tool-panel'
    || family === 'app-chrome'
    || family === 'game-stage';
  if (!marketingish && !familyish) return [];
  const m = scoreAskMatch(files, brief, productName);
  // Soft band-purpose deficits surface even when the match otherwise passes.
  if (m.ok) {
    return m.reasons
      .filter((r) => /^band purpose:/i.test(r))
      .map((r) => `ask match: ${r}`);
  }
  return m.reasons.map((r) => `ask match: ${r}`);
}
