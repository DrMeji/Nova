/**
 * Brief ↔ invent layout fidelity — stop stored invent-demo twins
 * (e.g. knife brief → speakers skeleton because “don’t use speaker” matched).
 */

export type InventDemoGenre =
  | 'cutlery'
  | 'atelier'
  | 'cafe'
  | 'portfolio'
  | 'luggage'
  | 'speakers'
  | 'game'
  | 'utility'
  | 'saas'
  | 'generic';

/** Strip anti-twin / “do not reuse X” noise so detectGenre only sees positive product asks. */
export function stripAntiTwinNoise(brief: string): string {
  let t = String(brief || '');
  // “do not reuse … speaker/luggage demo structure”
  t = t.replace(
    /\b(?:do\s+not|don't|dont|never|not|no|without|skip|anti[- ]?twin)\b[\s\S]{0,64}\b(?:speakers?|speaker|luggage|atelier|textile|loom|demo|skeleton|layout|pattern|twin)\b[\s\S]{0,32}/gi,
    ' ',
  );
  t = t.replace(/\b(?:speakers?|luggage|atelier|textile)\s*\/\s*(?:speakers?|luggage|atelier|textile)\b/gi, ' ');
  t = t.replace(/\b(?:demo\s+structure|last\s+invent|invent\s+layout)\b/gi, ' ');
  t = t.replace(/\b(?:hard\s+requirements?|follow\s+exactly|do\s+not\s+invent\s+a\s+generic\s+store)\b/gi, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function hasPositive(cleaned: string, re: RegExp): boolean {
  return re.test(cleaned);
}

/** Genre from user brief — positive product nouns win; anti-twin wording ignored. */
export function detectInventGenre(brief: string): InventDemoGenre {
  const raw = String(brief || '');
  const t = stripAntiTwinNoise(raw);

  // Cutlery / knife shop — own genre (NOT textile atelier twin).
  if (
    hasPositive(t, /\b(?:knife|knives|cutlery|blade|whetstone|damascus|gyuto|santoku|nakiri|chef'?s?\s+knives?)\b/i)
    || (/\bforge\b/i.test(t) && /\b(?:steel|blade|chef|knife|knives)\b/i.test(raw))
  ) {
    return 'cutlery';
  }

  if (hasPositive(t, /\b(?:café|cafe|coffee|bakery|roaster|espresso)\b/i)) return 'cafe';

  if (
    hasPositive(t, /\b(?:suitcase|carry[- ]?on|travel\s+bag|duffel|weekender|roller\s+bag|cabin\s+bag)\b/i)
    || (hasPositive(t, /\bluggage\b/i) && hasPositive(t, /\b(?:travel|trip|airport|flight|pack)\b/i))
  ) {
    return 'luggage';
  }

  // Speakers only on cleaned positive audio product ask — not “speaker” inside “don’t reuse speaker”.
  const speakersPos = hasPositive(
    t,
    /\b(?:subwoofers?|bookshelf\s+speakers?|floorstanding|soundbars?|woofers?|tweeters?|studio\s+monitors?|hi[- ]?fi|hifi|listening[- ]?room|audio\s+(?:showroom|gear|kit|system))\b/i,
  )
    || (
      hasPositive(t, /\bspeakers?\b/i)
      && hasPositive(t, /\b(?:shop|store|showroom|buy|sell|listening|audio)\b/i)
      && !/\b(?:knife|knives|cutlery|blade|luggage|cafe|café|coffee)\b/i.test(raw)
    );
  if (speakersPos) return 'speakers';

  // Textile / handloom atelier only when fabric is the product (not “knife atelier”).
  if (
    hasPositive(t, /\b(?:textile|loom|fabric|weave|cloth|handloom|swatch)\b/i)
    || (
      hasPositive(t, /\batelier\b/i)
      && !hasPositive(t, /\b(?:knife|knives|cutlery|blade|software|saas)\b/i)
    )
  ) {
    return 'atelier';
  }

  if (hasPositive(t, /\b(?:portfolio|photographer|editorial\s+studio)\b/i)) return 'portfolio';

  // Browser / arcade game — must not fall through to landing-page twins.
  if (
    hasPositive(t, /\b(?:arcade|game\s+loop|requestAnimationFrame|pixel\s+game|browser\s+game)\b/i)
    || (
      hasPositive(t, /\b(?:game|gaming)\b/i)
      && hasPositive(t, /\b(?:canvas|score|HUD|lives|high\s*score|start\s+button)\b/i)
    )
  ) {
    return 'game';
  }

  // Utility / todo / notes — not a storefront or textile twin.
  if (
    hasPositive(t, /\b(?:todo|to-?do|checklist|localStorage)\b/i)
    || (
      hasPositive(t, /\b(?:utility|utilities)\b/i)
      && hasPositive(t, /\b(?:app|tool|tasks?)\b/i)
    )
    || (
      hasPositive(t, /\b(?:notes?|task\s+list)\b/i)
      && hasPositive(t, /\b(?:add|complete|delete)\b/i)
    )
  ) {
    return 'utility';
  }

  if (hasPositive(t, /\b(?:saas|dashboard|product\s+app|software)\b/i)) return 'saas';
  return 'generic';
}

export type InventFidelityResult = {
  ok: boolean;
  genre: InventDemoGenre;
  layout: string;
  reasons: string[];
};

/** Physical retail product ask that must never ship a speakers/luggage invent twin. */
export function isDistinctRetailProductBrief(brief: string): boolean {
  const t = stripAntiTwinNoise(brief);
  return /\b(?:knife|knives|cutlery|blade|bottle|bottles|wine|flask|flasks|decanter|desk|desks|furniture|jewelry|jewellery|ring|necklace|watch|watches|pottery|ceramic|candle|candles|skateboard|bike|bicycle|plant|nursery)\b/i.test(t);
}

/** True when Acc App layout/copy contradicts the user brief (stored twin). */
export function inventBriefLayoutFidelity(opts: {
  brief: string;
  files?: Record<string, string>;
  app?: string;
}): InventFidelityResult {
  const brief = String(opts.brief || '');
  const app = String(opts.app || opts.files?.['src/App.jsx'] || opts.files?.['src/App.tsx'] || '');
  const genre = detectInventGenre(brief);
  const layout = (app.match(/data-nova-layout\s*=\s*["']([^"']+)["']/i)?.[1] || '').toLowerCase();
  const reasons: string[] = [];
  const distinctRetail = isDistinctRetailProductBrief(brief);

  if (layout === 'speakers' && genre !== 'speakers') {
    reasons.push(`speakers invent-demo layout but brief genre is ${genre}`);
  }
  if ((layout === 'luggage' || layout === 'luggage-premium') && genre !== 'luggage') {
    reasons.push(`luggage invent-demo layout but brief genre is ${genre}`);
  }
  if (layout === 'atelier' && genre === 'cutlery') {
    reasons.push('textile atelier layout for knife/cutlery brief');
  }
  if (layout === 'cutlery' && genre !== 'cutlery') {
    reasons.push(`cutlery invent-demo layout but brief genre is ${genre}`);
  }
  if (/Audio showroom|Enter the bay|spk-rail|spk-stage|spk-bay|listening gear/i.test(app)
    && genre !== 'speakers') {
    reasons.push('audio/speakers copy in App for non-speakers brief');
  }
  if (/\b(?:Woofer|Soundbar|Subwoofer|Floorstander|Bookshelf Pair)\b/i.test(app)
    && (/\b(?:knife|knives|cutlery|blade)\b/i.test(brief) || distinctRetail)) {
    reasons.push('speaker SKU names for non-speakers product brief');
  }
  if (/bag-layers|Carry-on|Weekender|duffel/i.test(app) && genre !== 'luggage'
    && (/\b(?:knife|knives|cutlery|cafe|coffee|speaker)\b/i.test(brief) || distinctRetail)) {
    reasons.push('luggage copy for non-luggage brief');
  }
  // Knife brief must not ship textile/handloom twin copy (Obsidian Edge Knives failure).
  if (
    genre === 'cutlery'
    && /(?:Textile atelier|Handloom studio|Quiet textiles|How we weave|On the loom|Undyed linen|Plant-dyed wool|Hand-finished hems|Book a swatch visit|fiber preference|handloom atelier)/i.test(app)
  ) {
    reasons.push('textile/handloom copy for knife/cutlery brief');
  }
  if (
    genre === 'cutlery'
    && !/\b(?:knife|knives|blade|cutlery|steel|forge|gyuto|santoku|nakiri|whetstone)\b/i.test(app)
  ) {
    reasons.push('knife/cutlery product nouns missing from invent-demo App');
  }
  if (distinctRetail && genre !== 'speakers' && genre !== 'luggage'
    && (/data-nova-layout\s*=\s*["']speakers["']/i.test(app)
      || /spk-bay|Audio showroom/i.test(app))) {
    reasons.push('stored speakers twin for distinct retail product brief');
  }

  // Brand must appear when invent-demo shipped.
  const brandGuess = brief.match(/\*\*([^*]{2,48})\*\*/)?.[1]
    || brief.match(/for\s+\*\*([^*]+)\*\*/i)?.[1]
    || '';
  if (brandGuess && /data-nova-invent-demo\s*=\s*["']1["']/.test(app)) {
    const tok = brandGuess.trim().split(/\s+/)[0] || '';
    if (tok.length >= 3 && !new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app)) {
      reasons.push('brand token missing from invent-demo App');
    }
  }

  return { ok: reasons.length === 0, genre, layout, reasons };
}

/** Ready must not pass while invent layout still contradicts the brief. */
export function inventFidelityBlocksReady(fid: InventFidelityResult | null | undefined): boolean {
  if (!fid) return false;
  return fid.ok !== true;
}
