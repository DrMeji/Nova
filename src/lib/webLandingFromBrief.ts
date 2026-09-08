/**
 * Scaffold routing signals only.
 * No stock Unsplash heroes, restaurant packs, portfolio galleries, or CTA landings.
 * Product UI must come from the model.
 */

export type LandingFile = { path: string; content: string };

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** True when the brief is a team-chat / Discord-style app (not a marketing site). */
export function wantsChatAppScaffold(text: string): boolean {
  const t = String(text || '').toLowerCase();
  const chatNoun = /\b(chat\s+app|messaging\s+app|desktop[- ]style\s+chat|team\s+messaging|discord)\b/.test(t)
    || (/\b(channel|direct\s+messages?|\bdms?\b|voice\s+channel|screen\s+share|mute|deafen)\b/.test(t)
      && /\b(ui|app|react|sidebar|rail|layout|server)\b/.test(t));
  const railChat = /\bleft\s+rail\b/.test(t) && /\b(channel|dm|voice|message|thread|server|discord|chat)\b/.test(t);
  return (
    chatNoun
    || railChat
    || /\b(threads?\s+panel|command\s+palette|no\s+static\s+html)\b/.test(t)
    || (/\b(server\s+sidebar|member\s+list|friends?\s+list|emoji\s+picker)\b/.test(t))
  );
}

/** Interactive SPA shells that must never become static marketing landings. */
export function wantsInteractiveSpaScaffold(text: string): boolean {
  const t = String(text || '');
  if (wantsChatAppScaffold(t)) return true;
  if (/\b(3d|three\.?js|webgl|babylon|modeling\s+app|modeler|viewport|orbit\s+controls?|blender[-\s]?like)\b/i.test(t)
    && /\b(app|editor|tool|scene|mesh|cube|sphere|viewport|canvas)\b/i.test(t)) {
    return true;
  }
  if (/\b(chrome\s+dino|dinosaur\s+game|dino\s+runner|t-?rex\s+(?:runner|game))\b/i.test(t)
    || (/\bdinosaur\b/i.test(t) && /\b(game|runner|jump|space)\b/i.test(t))) {
    return true;
  }
  if (
    /\b(?:playable|arcade|canvas\s+game|html5\s+game|browser\s+game)\b/i.test(t)
    || (
      /\bgame\b/i.test(t)
      && /\b(?:score|lives?|shoot|asteroid|runner|jump|player|hud|game\s*over|play\s+again|space\s*bar|arrow\s+keys?)\b/i.test(t)
    )
    || (
      /\b(?:build|create|make)\b/i.test(t)
      && /\bgame\b/i.test(t)
      && !/\b(?:landing|marketing|storefront|buy\s+now|website\s+about)\b/i.test(t)
    )
  ) {
    return true;
  }
  if (/\b(kanban|drag[\s-]?and[\s-]?drop|draggable|localStorage)\b/i.test(t)
    && /\b(column|board|card|modal|task|backlog)\b/i.test(t)) {
    return true;
  }
  if (/\b(budget|transaction|finance|ledger|wallet|expense)\b/i.test(t)
    && /\b(react|vite|app|dashboard)\b/i.test(t)) {
    return true;
  }
  if (/\b(notes?\s+app|todo\s+app|task\s+(?:list|board)|sticky\s*notes?)\b/i.test(t)
    && /\b(react|vite|localStorage)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:habit|streak|daily\s+checklist|tracker\s+app)\b/i.test(t)) {
    return true;
  }
  // Streaming product clones (Netflix / Twitch style) need Vite React, not blank static HTML.
  if (
    /\b(?:netflix|twitch|nightflix|pulsestream|streaming\s+(?:home|app|site)|live\s+stream(?:ing)?\s+(?:app|site)|billboard|watch\s+page)\b/i.test(t)
    || (
      /\b(?:react|vite)\b/i.test(t)
      && /\b(?:stream(?:ing)?|poster\s+rows?|my\s+list|follow|subscribe)\b/i.test(t)
    )
  ) {
    return true;
  }
  // Brand marketing replicas (Apple.com etc.) — animated SPA, not blank static HTML.
  if (/\b(?:apple\.com|exact\s+replica)\b/i.test(t) && /\b(?:apple|website|site|landing|homepage|marketing)\b/i.test(t)) {
    return true;
  }
  if (/\b(watchlist|orders?\s+tab|trading\s+cockpit|trade\s*rail|desktop[- ]style)\b/i.test(t)
    && /\b(tab|settings|panel|button|cockpit|software)\b/i.test(t)) {
    return true;
  }
  if (
    /\b(animated|premium|full-?bleed|scroll(?:able)?\s+sections?|bag\s+drawer|product\s+bag)\b/i.test(t)
    && /\b(website|web\s*site|site|marketing|landing|homepage|storefront)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(?:apple[\s-]?like|professional\s+animated|working\s+(?:buy|buttons?)|learn\s+more\s+buttons?)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Marketing / restaurant / portfolio landing signals (hero, menu, Unsplash, etc.). */
function looksLikeMarketingLanding(text: string): boolean {
  const t = String(text || '');
  if (t.length < 60) return false;
  if (wantsInteractiveSpaScaffold(t)) return false;
  if (/\bgame\b/i.test(t) && /\b(?:playable|score|lives?|canvas|shoot|asteroid|runner|arcade|hud|play\s+again)\b/i.test(t)) {
    return false;
  }
  if (/\b(festival|lineup|ticket\s+cta|jazz|concert|velvet|landing\s+page)\b/i.test(t)) return true;
  const hasMedia = /unsplash|https?:\/\/\S+\.(?:jpg|jpeg|png|webp)|images\.unsplash/i.test(t);
  const hasLayout = /\b(hero|cta|headline|subtitle|gallery|masonry|portfolio|menu|cabin|class(?:es)?|booking|restaurant|dish(?:es)?)\b/i.test(t)
    || (/\bcards?\b/i.test(t) && /\b(hero|unsplash|menu|gallery|portfolio|restaurant)\b/i.test(t));
  return hasMedia || (hasLayout && t.length > 100);
}

/**
 * True when the user asked for a React/Vite app shell (not a static marketing landing).
 */
export function prefersReactAppScaffold(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (/\b(static\s+html|plain\s+html|landing\s+page\s+only)\b/.test(t)) return false;
  if (wantsInteractiveSpaScaffold(text)) return true;
  // Explicit React/Vite asks win over marketing-landing → static-html heuristics.
  if (/\b(react|vite|next\.?js|npm\s+install|lucide|jsx|tsx|usestate|dev\s+server|localhost|app\.jsx|app\.tsx)\b/.test(t)
    || /\bsrc\/app\.(jsx|tsx|css)\b/.test(t)) {
    return true;
  }
  if (looksLikeMarketingLanding(text)) return false;
  return false;
}

/** True when the brief describes a real landing page (not a one-line create). */
export function looksLikeLandingBrief(text: string): boolean {
  return looksLikeMarketingLanding(text);
}

/** Detector only — no canned premium landing pack. */
export function wantsPremiumProductLanding(brief: string): boolean {
  const t = String(brief || '');
  return /\b(?:apple\.com|premium|professional|atelier|product\s+(?:story|marketing)|full[- ]?bleed|feature\s+grid|terms\s+of\s+service|privacy\s+(?:policy|footer)|design[- ]conscious)\b/i.test(t)
    || (/\b(?:unsplash|hero\s+photograph)\b/i.test(t) && /\b(?:buy\s+now|cta|newsletter|specs?)\b/i.test(t));
}

/** Empty static folder only. Unique UI must come from the model. */
export function buildLandingPageFiles(name: string, brief: string): LandingFile[] {
  const title = String(name || 'Site').trim() || 'Site';
  void brief;
  return [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <div id="app"></div>
  <script src="js/app.js"></script>
</body>
</html>
`,
    },
    {
      path: 'css/styles.css',
      content: `* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
#app { min-height: 100vh; }
`,
    },
    {
      path: 'js/app.js',
      content: `document.documentElement.dataset.arkReady = '1';
`,
    },
    { path: '.gitignore', content: '.DS_Store\nThumbs.db\n*.log\n.env\n.env.*\n' },
  ];
}
