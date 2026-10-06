/**
 * verifyAsk — post-write check that the ask actually landed in files.
 * Fail closed: any unmatched constraint goes into missing[].
 */

import { extractBrandLabel, extractNameTextColorTarget, looksLikeNameTextColorAsk } from '@/lib/brandLabel';
import { parseNamedBrandLogos, parseNamedUiIcons } from '@/lib/brandAssets';

export type VerifyAskResult = {
  ok: boolean;
  missing: string[];
  /** How many concrete constraints were evaluated (0 = do not treat as already-applied). */
  checked: number;
};

function haystack(files: Record<string, string>): string {
  return Object.entries(files || {})
    .filter(([p]) => /\.(jsx?|tsx?|css|html|md)$/i.test(p))
    .map(([, t]) => String(t || ''))
    .join('\n');
}

/** Match the *requested* named color (not “any hex on the page”). */
function namedColorPresenceRe(colorWord: string): RegExp {
  const c = String(colorWord || '').toLowerCase();
  const table: Record<string, string> = {
    brown: String.raw`#8[Bb]4513|#5[Cc]4033|#[Aa]0522[Dd]|#6[Ff]4[Ee]37|#7[Aa]3[Ff]1[Aa]|\bbrown\b|\bsienna\b|\bchocolate\b`,
    black: String.raw`#000(?:000)?\b|#0[aA]0[aA]0[aA]\b|#111(?:111)?\b|#1[aA]1[aA]1[aA]\b|\bblack\b`,
    white: String.raw`#fff(?:fff)?\b|#[Ff]{6}\b|\bwhite\b`,
    pink: String.raw`#[Ff][Ff][Cc]0[Cc][Bb]|#[Ee][Cc]4899|#[Ff]472[Bb]6|#[Dd][Bb]2777|#[Ff]9[Aa]8[Dd]|\bpink\b`,
    blue: String.raw`#2563[Ee][Bb]|#3[Bb]82[Ff]6|#1[Dd]4[Ee][Dd]8|#0000[Ff][Ff]|\bblue\b`,
    red: String.raw`#[Dd][Cc]2626|#[Ee][Ff]4444|#[Ff]00(?:000)?\b|\bred\b`,
    green: String.raw`#16[Aa]34[Aa]|#22[Cc]55[Ee]|#008000\b|\bgreen\b`,
    orange: String.raw`#[Ff][Aa]7315|#[Ff]97316|#[Ee][Aa]580[Cc]|\borange\b`,
    purple: String.raw`#7[Cc]3[Aa][Ee][Dd]|#[Aa]855[Ff]7|#800080\b|\bpurple\b|\bviolet\b`,
    gray: String.raw`#6[Bb]7280|#9[Cc][Aa]3[Aa][Ff]|#808080\b|\bgr[ae]y\b`,
    grey: String.raw`#6[Bb]7280|#9[Cc][Aa]3[Aa][Ff]|#808080\b|\bgr[ae]y\b`,
    navy: String.raw`#1[Ee]3[Aa]8[Aa]|#000080\b|\bnavy\b`,
    // Warm cream / ivory / linen family — not one brittle hex (Garden Bed uses #f5f0e8).
    cream: String.raw`#[Ff][Ee][Ff]3[Cc]7|#[Ff][Ff][Ff][Dd][Dd]|#[Ff]5[Ff]5[Dd][Cc]|#[Ff]5[Ff]0[Ee]8|#[Ff][Aa][Ff]6[Ff]0|#[Ff][Ff][Ff]8[Ff]0|#[Ff]7[Ff]3[Ee][Aa]|#[Ff]8[Ff]1[Ee]3|#[Ff][Aa][Ff]7[Ff]2|#[Ff]4[Ee][Ff][Ee]6|#[Ff][Aa][Ff]5[Ee][Ee]|cream|ivory|beige|linen|eggshell`,
    teal: String.raw`#0[Ff]766[Ee]|#14[Bb]8[Aa]6|#008080\b|\bteal\b`,
    yellow: String.raw`#[Ee][Aa][Bb]308|#[Ff][Aa][Cc]c15|#[Ff][Ff]0(?:000)?\b|\byellow\b`,
  };
  return new RegExp(table[c] || String.raw`\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
}

/** Background paint only — avoids matching color words in copy/brand text. */
function backgroundDeclarations(blob: string): string {
  const parts: string[] = [];
  for (const m of String(blob || '').matchAll(/background(?:-color)?\s*:\s*([^;{}]+)/gi)) {
    parts.push(m[1] || '');
  }
  return parts.join('\n');
}

/** Quoted strings, named colors, center, remove X, no-nav constraints. */
export function verifyAsk(ask: string, files: Record<string, string>): VerifyAskResult {
  const t = String(ask || '');
  const blob = haystack(files);
  const missing: string[] = [];
  let checked = 0;
  const check = () => { checked += 1; };

  // Double / curly quotes only — never ASCII apostrophe (there's / don't).
  const quotes = [...t.matchAll(/["“”]([^"“”]{2,80})["“”]/g)].map((m) => m[1]);
  for (const q of quotes) {
    // Ignore prompt-instruction residue that should never be required as UI copy.
    if (/\b(?:short support|pill CTA|left-aligned|keep orbs|never ship|full-viewport|breathing room)\b/i.test(q || '')) continue;
    check();
    if (q && !blob.toLowerCase().includes(q.toLowerCase())) missing.push(`quoted “${q}”`);
  }

  // Bare heading / h1 / title: "change the heading to X" (words after to, not only quotes)
  const headingTo = t.match(
    /\b(?:change|set|update|make|rename)\s+(?:the\s+)?(?:heading|h1|title|headline)\s+to\s+["“']?([^"”'\n.!?]{2,80})/i,
  );
  if (headingTo?.[1]) {
    check();
    const want = headingTo[1].trim().replace(/[.!,;:]+$/, '');
    if (want && !blob.toLowerCase().includes(want.toLowerCase())) {
      missing.push(`heading “${want}”`);
    }
  }
  // "drop a big heading … saying something like Fresh vegetable plants"
  const headingLike = (
    t.match(
      /\b(?:heading|headline|h1|title)\b[\s\S]{0,100}\b(?:saying|say|that\s+says?)\s+(?:something\s+like\s+)?["“']?([A-Za-z][\w]*(?:\s+[A-Za-z][\w]*){1,6})/i,
    )?.[1]
    || ''
  ).trim().replace(/[,;:]+$/, '')
    .replace(/\s+\b(?:short|friendly|not|corporate|and)\b.*$/i, '')
    .trim();
  if (headingLike && headingLike.length >= 4) {
    check();
    const tokens = headingLike.split(/\s+/).filter((w) => w.length > 2);
    const hit = tokens.length
      ? tokens.filter((w) => blob.toLowerCase().includes(w.toLowerCase())).length >= Math.ceil(tokens.length * 0.6)
      : blob.toLowerCase().includes(headingLike.toLowerCase());
    if (!hit) missing.push(`heading “${headingLike}”`);
  }

  if (/\bcenter(?:ed)?\b/i.test(t)) {
    check();
    if (!/text-align:\s*center|justify(?:-content)?:\s*center|place-items:\s*center|mx-auto|items-center|text-center/i.test(blob)) {
      missing.push('center layout');
    }
  }

  // Prefer an explicit "X background" / "keep cream background" over accent colors
  // ("soft green accent … keep that cream background" must NOT require green background).
  const bgColorExplicit = (
    t.match(/\b(?:keep|stay|remain|still)\s+(?:that\s+|the\s+|a\s+)?(cream|brown|white|black|red|blue|green|orange|pink|purple|gray|grey|navy|teal|yellow)\s+(?:background|page|canvas)\b/i)?.[1]
    || t.match(/\b(cream|brown|white|black|red|blue|green|orange|pink|purple|gray|grey|navy|teal|yellow)\s+background\b/i)?.[1]
    || ''
  );
  const accentColor = t.match(/\b(?:soft\s+)?(brown|white|black|red|blue|green|orange|pink|purple|gray|grey|navy|cream|teal|yellow)\s+accents?\b/i)?.[1] || '';
  const accentOptional = /\b(?:is\s+fine|are\s+fine|ok|okay|optional)\b/i.test(t);
  const firstColor = t.match(/\b(brown|white|black|red|blue|green|orange|pink|purple|gray|grey|navy|cream|teal|yellow)\b/i)?.[1] || '';
  // When keep-cream + accent, verify cream background — never the accent as page paint.
  const colorWord = bgColorExplicit
    || (accentColor && /\b(?:keep|stay|remain|still)\b[\s\S]{0,48}\bcream\b/i.test(t) ? 'cream' : '')
    || (accentColor && !/\bbackground\b/i.test(t) ? '' : firstColor)
    || firstColor;
  // Name text-color asks ("from white to black") are verified below — don't require the "from" color.
  if (colorWord && !looksLikeNameTextColorAsk(t)) {
    check();
    // Accent/glow asks need a real warm accent in CSS — any leftover #fff/#000 must not pass.
    if (/\b(?:glow|accent)\b/i.test(t) && /\bred\b/i.test(colorWord) && !bgColorExplicit) {
      const hasRedAccent = /#(?:f|e|c|d)[0-9a-f]{2,6}\b|rgb\(\s*2[0-5]\d|rgba?\(\s*2[0-5]\d|radial-gradient[^;{]{0,120}(?:red|#(?:f|e|c|d))/i.test(blob);
      if (!hasRedAccent) missing.push('red accent glow');
    } else if (accentColor && !bgColorExplicit && !/\bbackground\b/i.test(t) && accentOptional) {
      // "soft green accent is fine" — permission, not a hard paint requirement.
    } else {
      // Named color asks must match THAT color — any leftover hex (#000 etc.) must not pass.
      const colorRe = namedColorPresenceRe(colorWord);
      const wantsBackground = Boolean(bgColorExplicit)
        || (/\bbackground\b/i.test(t) || /\b(?:bg|back\s*ground)\b/i.test(t))
          && !(/\b(?:glow|accent)\b/i.test(t) && !bgColorExplicit);
      if (wantsBackground) {
        const bgHay = backgroundDeclarations(blob);
        // "keep that cream background" — pass when paint is already a warm light family.
        const keepCream = /\b(?:keep|stay|remain|still)\b/i.test(t) && /cream/i.test(colorWord);
        const lightWarm = /#f[4-9a-f][e-f0-9][0-9a-f]{3}|rgb\(\s*2[4-5]\d\s*,\s*2[3-5]\d\s*,\s*2[0-3]\d/i.test(bgHay)
          || /cream|ivory|beige|linen|eggshell/i.test(bgHay);
        if (!(keepCream && lightWarm) && !colorRe.test(bgHay)) {
          missing.push(`${colorWord.toLowerCase()} background`);
        }
      } else if (!colorRe.test(blob)) {
        missing.push(`color ${colorWord}`);
      }
    }
  }

  if (/\bcharcoal\b/i.test(t) && /\bbackground\b/i.test(t)) {
    check();
    const hasCharcoal = /charcoal|#0[d-f]0[d-f]0[d-f]\b|#1[0-8][0-9a-f]{4}\b|#2[0-2][0-9a-f]{4}\b|#111(?:111)?\b|#121212\b|#141414\b|#1a1a1a\b/i.test(blob);
    if (!hasCharcoal) missing.push('charcoal background');
  }

  if (/\bglow\b/i.test(t) && /\b(?:hero|behind|accent|soft)\b/i.test(t)) {
    check();
    if (!/radial-gradient|box-shadow|drop-shadow|::before|::after/i.test(blob)) {
      missing.push('accent glow');
    }
  }

  if (/\bunderline\b/i.test(t) && /\b(?:brand|title|name|ridge|volt|ember|accent)\b/i.test(t)) {
    check();
    if (!/border-bottom|text-decoration\s*:\s*underline|underline/i.test(blob)) {
      missing.push('brand underline');
    }
  }

  if (/\b(?:larger|bigger|slightly larger)\b/i.test(t) && /\b(?:brand|title|name|heading|h1)\b/i.test(t)) {
    check();
    if (!/font-size\s*:\s*clamp\(\s*2\.|font-size\s*:\s*(?:[3-9]\d|2[2-9])px|text-(?:3|4|5)xl|text-\[/i.test(blob)) {
      // Accept if center-word font-size clamp starts at >= 2.0rem
      const m = blob.match(/\.center-word\s*\{[^}]*font-size\s*:\s*clamp\(\s*([0-9.]+)\s*rem/i);
      const start = m ? Number(m[1]) : 0;
      if (!(start >= 2.0)) missing.push('larger brand title');
    }
  }

  if (/\bproduct\s+cards?\b/i.test(t) || (/\bcards?\b/i.test(t) && /\bMouse\b/i.test(t) && /\bKeyboard\b/i.test(t))) {
    check();
    if (!/product-card|product-cards/i.test(blob)) missing.push('product cards');
    if (/\bMouse\b/i.test(t) && !/<h2>Mouse<\/h2>|>Mouse</i.test(blob)) missing.push('Mouse card');
    if (/\bKeyboard\b/i.test(t) && !/<h2>Keyboard<\/h2>|>Keyboard</i.test(blob)) missing.push('Keyboard card');
    if (/\bHeadset\b/i.test(t) && !/\b(?:remove|delete|drop)\b/i.test(t) && !/<h2>Headset<\/h2>|>Headset</i.test(blob)) {
      missing.push('Headset card');
    }
  }

  if (/\b(?:remove|delete|drop)\b[\s\S]{0,48}\bHeadset\b/i.test(t)) {
    check();
    if (/<h2>Headset<\/h2>|product-card[^>]*>[\s\S]{0,80}Headset/i.test(blob)) {
      missing.push('Headset card still present');
    }
  }

  if (/\bheadset\b/i.test(t) && /\b(?:photo|shot|image|img)\b/i.test(t)) {
    check();
    const hasHeadsetImg = /alt=["'][^"']*headset/i.test(blob)
      || /<img[^>]+(?:headset|earcup|headphone)[^>]*>/i.test(blob)
      || (/className=["'][^"']*headset[^"']*["'][^>]*src=["']https?:\/\//i.test(blob));
    if (!hasHeadsetImg) missing.push('headset https photo');
  }

  // Hex colors in the ask must appear in files
  const askHexes = [...t.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)].map((m) => m[0].toLowerCase());
  for (const hex of askHexes) {
    check();
    if (!blob.toLowerCase().includes(hex)) missing.push(`color ${hex}`);
  }

  // Footer + any hours (am/pm patterns), not only 9am–9pm
  const wantsFooterHours = /\bfooter\b/i.test(t) && /\b\d{1,2}\s*(?:am|pm)\b|\bhours?\b|\bopen\b/i.test(t);
  const bareHours = /\b\d{1,2}\s*:\s*\d{2}\s*(?:am|pm)\b|\b\d{1,2}\s*(?:am|pm)\s*[–\-—]\s*\d{1,2}\s*(?:am|pm)\b/i.test(t)
    && /\bfooter\b/i.test(t);
  if (wantsFooterHours || bareHours) {
    check();
    const hasHours = /\b\d{1,2}\s*(?::\d{2})?\s*(?:am|pm)\b/i.test(blob);
    const hasFooter = /footer|<footer[\s>]/i.test(blob);
    if (!hasFooter || !hasHours) missing.push('footer hours');
  }

  // Logo: require a real mark in markup / public path — CSS `.logo` alone must not pass.
  // Skip when the ask is really about a menu/search icon "near the logo".
  if (
    /\blogos?\b/i.test(t)
    && !/\b(?:to|into)\s+["']?logo\b/i.test(t)
    && !/\b(?:menu|search|bag|cart|user)\s+icons?\b/i.test(t)
  ) {
    check();
    const hasLogo = /className=["'][^"']*(?:corner-)?logo["']|className=["']brand-rail["']|src=["']\/(?:logo|logos\/[^"']+)\.svg/i.test(blob)
      || /<img[^>]+alt=["'][^"']*logo/i.test(blob);
    if (!hasLogo) missing.push('logo');
  }

  // Named company logos must each be present (accumulate — cream keep-asks still need the new marks).
  {
    const brands = parseNamedBrandLogos(t);
    for (const b of brands) {
      check();
      const hit = new RegExp(`/logos/${b.id}\\.svg`, 'i').test(blob)
        || new RegExp(`alt=["']${b.label}["']`, 'i').test(blob);
      if (!hit) missing.push(`${b.label} logo`);
    }
  }

  // Premium / menu icons — require real <img> icons, and named icons must each land.
  if (
    /\b(?:menu|search|bag|cart|user)\s+icons?\b/i.test(t)
    || (/\b(?:premium|professional)\s+icons?\b/i.test(t))
    || (/\bicons?\b/i.test(t) && /\b(?:add|put|place)\b/i.test(t) && !/\b(?:add|put|place)\b[\s\S]{0,40}\blogo\b/i.test(t))
  ) {
    check();
    const hasIcon = /className=["'][^"']*nav-icon["']|src=["']\/icons\/[\w-]+\.svg/i.test(blob);
    if (!hasIcon) missing.push('icon');
  }
  {
    const icons = parseNamedUiIcons(t);
    for (const ic of icons) {
      check();
      const hit = new RegExp(`/icons/${ic.id}\\.svg`, 'i').test(blob);
      if (!hit) missing.push(`${ic.label} icon`);
    }
  }

  // Brand name X / put the brand name APEX Gear / brand should say VOID Peripherals
  const brandName = extractBrandLabel(t);
  if (brandName) {
    check();
    if (!blob.toLowerCase().includes(brandName.toLowerCase())) {
      missing.push(`brand “${brandName}”`);
    }
  }

  // Move name position
  if (/\b(?:move|put|place|shift)\b/i.test(t) && /\b(?:top|bottom|left|right|corner)\b/i.test(t) && /\b(?:name|title|word|text|it)\b/i.test(t)) {
    check();
    const wantTop = /\btop\b/i.test(t);
    const wantBottom = /\bbottom\b/i.test(t);
    const wantLeft = /\bleft\b/i.test(t);
    const wantRight = /\bright\b/i.test(t);
    const cw = blob.match(/\.center-word\s*\{[^}]*\}/i)?.[0] || '';
    if (wantTop && !/top\s*:\s*/i.test(cw)) missing.push('top position');
    if (wantBottom && !/bottom\s*:\s*/i.test(cw)) missing.push('bottom position');
    if (wantLeft && !/left\s*:\s*/i.test(cw)) missing.push('left position');
    if (wantRight && !/right\s*:\s*/i.test(cw)) missing.push('right position');
    if ((wantTop || wantBottom || wantLeft || wantRight) && !/position\s*:\s*absolute/i.test(cw)) {
      missing.push('absolute name position');
    }
  }

  // Font style — check center-word AND hero/title CSS (marketing pages rarely use .center-word).
  if (/\b(?:bold|italic|cursive|serif|thin|light|skinny)\b/i.test(t) && /\b(?:font|make|look|style|word|title|name|text|headline)\b/i.test(t)) {
    check();
    const cw = blob.match(/\.center-word\s*\{[^}]*\}/i)?.[0] || '';
    const heroFont = blob.match(/\.(?:title|headline|hero-title|hero-h1|display|section-title|brand)\s*\{[^}]*\}/gi)?.join('\n') || '';
    const fontScope = `${cw}\n${heroFont}\n${blob}`;
    if (/\bbold\b/i.test(t) && !/font-weight\s*:\s*(?:700|800|bold)/i.test(fontScope)) missing.push('bold font');
    if (/\b(?:thin|light|skinny)\b/i.test(t) && !/font-weight\s*:\s*(?:200|300|light)/i.test(fontScope)) missing.push('thin font');
    if (/\b(?:cursive|italic)\b/i.test(t) && !/font-style\s*:\s*italic|Georgia/i.test(fontScope)) missing.push('cursive font');
    // Do not treat "sans-serif" as a serif hit.
    if (/\bserif\b/i.test(t) && !/(?:Georgia|Times New Roman|(?<![A-Za-z-])serif)\b/i.test(fontScope)) {
      missing.push('serif font');
    }
  }

  // Name text color (not page background)
  if (looksLikeNameTextColorAsk(t)) {
    check();
    const want = extractNameTextColorTarget(t);
    const cw = blob.match(/\.center-word\s*\{[^}]*\}/i)?.[0] || '';
    const colorDecl = cw.match(/color\s*:\s*([^;]+)/i)?.[1]?.trim() || '';
    if (want) {
      const re = namedColorPresenceRe(want);
      if (!re.test(colorDecl) && !re.test(cw)) missing.push(`${want} name text color`);
    } else if (!/color\s*:/i.test(cw)) {
      missing.push('name text color');
    }
  }

  // Real product imagery — https URLs OR project /heroes/ assets both count.
  // Local hero art is first-class for create/rebuild; do not demand remote only.
  const wantsHttpsImage = /\bhttps?\b/i.test(t)
    && /\b(?:image|photo|shot|url|img)\b/i.test(t);
  const wantsMousePhoto = /\bmouse\b/i.test(t) && /\b(?:photo|shot|image|img|hero)\b/i.test(t);
  const wantsKeyboardPhoto = /\bkeyboard\b/i.test(t) && /\b(?:photo|shot|image|img)\b/i.test(t);
  if (wantsHttpsImage || wantsMousePhoto || wantsKeyboardPhoto || /\b(?:product|gaming)\s+(?:photo|shot|image)\b/i.test(t)) {
    check();
    const hasFake = /src=["'][^"']*path\/to\//i.test(blob)
      || /src=["'][^"']*placeholder/i.test(blob)
      || /src=["']https?:\/\/(?:example\.com|example\.org|localhost)\b/i.test(blob);
    const hasLocalHero = /(?:src=["'][^"']*\/heroes\/|url\(\s*['"]?[^)'"]*\/heroes\/|background(?:-image)?\s*:\s*[^;]*\/heroes\/)/i.test(blob);
    const hasReal = /src=["']https?:\/\/(?!example\.(?:com|org)|localhost)[^"']+/i.test(blob)
      || hasLocalHero;
    const hasMouse = /alt=["'][^"']*mouse/i.test(blob)
      || (/mouse/i.test(blob) && /src=["']https?:\/\//i.test(blob) && /hero-photo|product/i.test(blob))
      || (hasLocalHero && /\b(?:mouse|viper|gaming)\b/i.test(blob));
    const hasKeyboard = /alt=["'][^"']*keyboard/i.test(blob)
      || (/keyboard/i.test(blob) && /src=["']https?:\/\//i.test(blob))
      || (hasLocalHero && /\bkeyboard\b/i.test(blob));
    if (hasFake) missing.push('a real https image URL');
    if (wantsMousePhoto && !hasMouse) missing.push('gaming mouse product photo');
    else if (wantsKeyboardPhoto && !hasKeyboard) missing.push('keyboard product photo');
    else if (!wantsMousePhoto && !wantsKeyboardPhoto && (wantsHttpsImage && !hasReal)) {
      missing.push('a real product image');
    }
  }

  // Tagline about precision / speed
  if (/\btagline\b/i.test(t) || (/\bprecision\b/i.test(t) && /\bspeed\b/i.test(t) && /\b(?:add|short)\b/i.test(t))) {
    check();
    if (!/precision|speed|tagline/i.test(blob)) missing.push('tagline');
  }

  // Nav labels named in the ask (Products, Specs, Buy, …)
  if (/\bnav(?:igation|bar)?\b/i.test(t)) {
    check();
    const labels = [...t.matchAll(/\b(Products|Specs|Buy|Shop|About|Contact|Menu|Home)\b/g)]
      .map((m) => m[1]);
    for (const label of [...new Set(labels)]) {
      if (!new RegExp(`\\b${label}\\b`, 'i').test(blob)) missing.push(`nav ${label}`);
    }
  }

  // Nav add / remove
  if (/\b(?:add|include|put)\b[\s\S]{0,40}\bnav(?:igation|bar)?\b/i.test(t) && !/<nav[\s>]/i.test(blob)) {
    check();
    missing.push('nav missing');
  }
  if (/\b(?:remove|delete|drop)\b[\s\S]{0,40}\bnav(?:igation|bar)?\b/i.test(t) && /<nav[\s>]/i.test(blob)) {
    check();
    missing.push('nav still present');
  }

  if (/\bdon'?t\s+add\s+(?:a\s+)?nav\b|\bno\s+nav\b/i.test(t) && /<nav[\s>]/i.test(blob)) {
    check();
    missing.push('nav was introduced');
  }

  // Blank page / full viewport
  if (/\b(?:blank\s+page|full\s+viewport|full[\s-]?screen|fill\s+(?:the\s+)?(?:screen|viewport)|100vh)\b/i.test(t)) {
    check();
    if (!/min-height:\s*100vh|height:\s*100%|min-h-screen|h-screen|h-full|100vh/i.test(blob)) {
      missing.push('full viewport height');
    }
  }

  // "drop a big heading / drop a card into…" is an ADD ask — never treat as remove.
  const dropIsAdd = /\bdrop\b[\s\S]{0,64}\b(?:heading|headline|h1|title|card|button|into|in\s+the\s+middle)\b/i.test(t);
  const removeTarget = dropIsAdd
    ? null
    : (
      t.match(/\b(?:remove|delete)\s+(?:the\s+)?([a-z0-9 _-]{2,40})/i)?.[1]
      || t.match(/\bdrop\s+(?:the\s+)?(nav|footer|header|sidebar|cart|about|section|button|panel|clutter)\b/i)?.[1]
      || null
    );
  if (removeTarget && !/^nav(?:igation|bar)?$/i.test(removeTarget.trim())) {
    check();
    if (new RegExp(removeTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(blob)) {
      missing.push(`still contains “${removeTarget.trim()}”`);
    }
  }

  // Card polish — never "already applied" from a leftover cream color alone.
  if (/\b(?:shadows?|box-shadow)\b/i.test(t) && /\b(?:card|soft|plant)\b/i.test(t)) {
    check();
    if (!/box-shadow\s*:/i.test(blob)) missing.push('card shadow');
  }
  if (/\brounded\b/i.test(t) && /\b(?:corner|card|soft)\b/i.test(t)) {
    check();
    if (!/border-radius\s*:\s*(?:[1-9]\d*(?:\.\d+)?(?:px|rem)|0?\.[1-9]\d*rem)/i.test(blob)) {
      missing.push('rounded corners');
    }
  }
  if (/\bsticky\b/i.test(t) && /\b(?:top\s*bar|header|nav|cart)\b/i.test(t)) {
    check();
    if (!/position\s*:\s*(?:sticky|fixed)/i.test(blob)) missing.push('sticky top bar');
  }
  if (
    /\bdescription\b/i.test(t)
    && /\b(?:card|plant|under\s+the\s+name|one-line|one\s+line)\b/i.test(t)
  ) {
    check();
    if (!/\bdescription\b|className=["'][^"']*desc/i.test(blob)) missing.push('card description');
  }
  // Responsive card grid
  if (/\b(?:three\s+across|responsive\s+grid|clean\s+responsive\s+grid)\b/i.test(t)
    || (/\bgrid\b/i.test(t) && /\b(?:card|cards|plant)\b/i.test(t) && /\b(?:responsive|desktop|stack)\b/i.test(t))) {
    check();
    if (!/grid-template-columns|display\s*:\s*grid/i.test(blob)) missing.push('card grid');
  }
  // "name Garden Bed on the left" / top bar brand (Title Case only — never swallow "on the left")
  const barName = t.match(
    /\b(?:name|called|titled)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})(?:\s+on\s+the\s+left)?\b/,
  )?.[1]?.trim();
  if (barName && /\b(?:top\s*bar|header|nav)\b/i.test(t)) {
    check();
    if (!blob.toLowerCase().includes(barName.toLowerCase())) missing.push(`name “${barName}”`);
  }

  return { ok: missing.length === 0, missing, checked };
}
