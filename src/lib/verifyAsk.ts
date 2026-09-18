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
    cream: String.raw`#[Ff][Ff][Ff][Dd][Dd]|#[Ff]5[Ff]5[Dd][Cc]|#[Ff][Ee][Ff]3[Cc]7|\bcream\b`,
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

  const quotes = [...t.matchAll(/["“']([^"”']{2,80})["”']/g)].map((m) => m[1]);
  for (const q of quotes) {
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

  if (/\bcenter(?:ed)?\b/i.test(t)) {
    check();
    if (!/text-align:\s*center|justify(?:-content)?:\s*center|place-items:\s*center|mx-auto|items-center|text-center/i.test(blob)) {
      missing.push('center layout');
    }
  }

  const colorWord = t.match(/\b(brown|white|black|red|blue|green|orange|pink|purple|gray|grey|navy|cream|teal|yellow)\b/i)?.[1];
  // Name text-color asks ("from white to black") are verified below — don't require the "from" color.
  if (colorWord && !looksLikeNameTextColorAsk(t)) {
    check();
    // Accent/glow asks need a real warm accent in CSS — any leftover #fff/#000 must not pass.
    if (/\b(?:glow|accent)\b/i.test(t) && /\bred\b/i.test(colorWord)) {
      const hasRedAccent = /#(?:f|e|c|d)[0-9a-f]{2,6}\b|rgb\(\s*2[0-5]\d|rgba?\(\s*2[0-5]\d|radial-gradient[^;{]{0,120}(?:red|#(?:f|e|c|d))/i.test(blob);
      if (!hasRedAccent) missing.push('red accent glow');
    } else {
      // Named color asks must match THAT color — any leftover hex (#000 etc.) must not pass.
      const colorRe = namedColorPresenceRe(colorWord);
      const wantsBackground = /\bbackground\b/i.test(t) || /\b(?:bg|back\s*ground)\b/i.test(t);
      if (wantsBackground) {
        const bgHay = backgroundDeclarations(blob);
        if (!colorRe.test(bgHay)) missing.push(`${colorWord.toLowerCase()} background`);
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

  // Font style
  if (/\b(?:bold|italic|cursive|serif|thin|light|skinny)\b/i.test(t) && /\b(?:font|make|look|style|word|title|name|text)\b/i.test(t)) {
    check();
    const cw = blob.match(/\.center-word\s*\{[^}]*\}/i)?.[0] || '';
    if (/\bbold\b/i.test(t) && !/font-weight\s*:\s*(?:700|800|bold)/i.test(cw)) missing.push('bold font');
    if (/\b(?:thin|light|skinny)\b/i.test(t) && !/font-weight\s*:\s*(?:200|300|light)/i.test(cw)) missing.push('thin font');
    if (/\b(?:cursive|italic)\b/i.test(t) && !/font-style\s*:\s*italic|Georgia/i.test(cw)) missing.push('cursive font');
    if (/\bserif\b/i.test(t) && !/Georgia|Times New Roman|serif/i.test(cw)) missing.push('serif font');
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

  // Real https image — reject placeholders with clear reasons (not "missing fake…")
  const wantsHttpsImage = /\bhttps?\b/i.test(t)
    && /\b(?:image|photo|shot|url|img)\b/i.test(t);
  const wantsMousePhoto = /\bmouse\b/i.test(t) && /\b(?:photo|shot|image|img|hero)\b/i.test(t);
  const wantsKeyboardPhoto = /\bkeyboard\b/i.test(t) && /\b(?:photo|shot|image|img)\b/i.test(t);
  if (wantsHttpsImage || wantsMousePhoto || wantsKeyboardPhoto || /\b(?:product|gaming)\s+(?:photo|shot|image)\b/i.test(t)) {
    check();
    const hasFake = /src=["'][^"']*path\/to\//i.test(blob)
      || /src=["'][^"']*placeholder/i.test(blob)
      || /src=["']https?:\/\/(?:example\.com|example\.org|localhost)\b/i.test(blob);
    const hasReal = /src=["']https?:\/\/(?!example\.(?:com|org)|localhost)[^"']+/i.test(blob);
    const hasMouse = /alt=["'][^"']*mouse/i.test(blob)
      || (/mouse/i.test(blob) && /src=["']https?:\/\//i.test(blob) && /hero-photo|product/i.test(blob));
    const hasKeyboard = /alt=["'][^"']*keyboard/i.test(blob)
      || (/keyboard/i.test(blob) && /src=["']https?:\/\//i.test(blob));
    if (hasFake) missing.push('a real https image URL');
    if (wantsMousePhoto && !hasMouse) missing.push('gaming mouse https photo');
    else if (wantsKeyboardPhoto && !hasKeyboard) missing.push('keyboard https photo');
    else if (!wantsMousePhoto && !wantsKeyboardPhoto && (wantsHttpsImage && !hasReal)) {
      missing.push('a real https image URL');
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

  const removeTarget = t.match(/\b(?:remove|delete|drop)\s+(?:the\s+)?([a-z0-9 _-]{2,40})/i)?.[1];
  if (removeTarget && !/^nav(?:igation|bar)?$/i.test(removeTarget.trim())) {
    check();
    if (new RegExp(removeTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(blob)) {
      missing.push(`still contains “${removeTarget.trim()}”`);
    }
  }

  return { ok: missing.length === 0, missing, checked };
}
