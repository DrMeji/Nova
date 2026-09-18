/**
 * CreateIdentity — single source of truth for create look (palette, layout, heroes).
 * Every create must derive identity from THIS brief — never reuse a prior shell recipe.
 */

export type CreateMood =
  | 'light-warm'
  | 'light-pastel'
  | 'dark-editorial'
  | 'dark-tech'
  | 'studio-product'
  | 'chat-shell';

export type CreateCategory =
  | 'bakery'
  | 'florist'
  | 'watch'
  | 'laptop'
  | 'audio'
  | 'lighting'
  | 'chat'
  | 'generic';

export type CreateLayout =
  | 'editorial-dark'
  | 'warm-shop'
  | 'catalog-grid'
  | 'split-story'
  | 'chat-shell';

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

export type CreateIdentity = {
  name: string;
  slug: string;
  category: CreateCategory;
  mood: CreateMood;
  palette: CreatePalette;
  layout: CreateLayout;
  heroQueries: Array<{ id: string; q: string }>;
  heroHref: string;
  categoryNouns: string[];
  forbidden: { hex: string[]; layouts: string[] };
};

const CREAM: CreatePalette = {
  bg: '#f3efe6',
  panel: '#fffaf3',
  text: '#1c1917',
  muted: '#78716c',
  accent: '#d97706',
  glow: '#e7dcc8',
  btnInk: '#1c1005',
  font: 'Georgia, "Times New Roman", serif',
  line: 'rgba(28,25,23,0.12)',
};

const PASTEL: CreatePalette = {
  bg: '#faf5ff',
  panel: '#ffffff',
  text: '#3b0764',
  muted: '#a78bfa',
  accent: '#c084fc',
  glow: '#f3e8ff',
  btnInk: '#2e1065',
  font: 'Georgia, "Times New Roman", serif',
  line: 'rgba(59,7,100,0.12)',
};

const EDITORIAL_DARK: CreatePalette = {
  bg: '#07090d',
  panel: '#12161e',
  text: '#f4f7fb',
  muted: '#9aa7b8',
  accent: '#3dff9a',
  glow: '#152018',
  btnInk: '#04140c',
  font: 'Georgia, "Times New Roman", serif',
  line: 'rgba(255,255,255,0.08)',
};

const STUDIO: CreatePalette = {
  bg: '#0e1014',
  panel: '#171b22',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#e2e8f0',
  glow: '#1e293b',
  btnInk: '#0f172a',
  font: '"Segoe UI", system-ui, sans-serif',
  line: 'rgba(255,255,255,0.08)',
};

const CHAT_DARK: CreatePalette = {
  bg: '#1e1f22',
  panel: '#2b2d31',
  text: '#f2f3f5',
  muted: '#b5bac1',
  accent: '#5865f2',
  glow: '#111214',
  btnInk: '#ffffff',
  font: '"Segoe UI", system-ui, sans-serif',
  line: 'rgba(255,255,255,0.08)',
};

const GOLD_WATCH: CreatePalette = {
  bg: '#111108',
  panel: '#1c1910',
  text: '#fefce8',
  muted: '#fde047',
  accent: '#eab308',
  glow: '#422006',
  btnInk: '#422006',
  font: 'Georgia, "Times New Roman", serif',
  line: 'rgba(255,255,255,0.08)',
};

function slugify(name: string): string {
  return String(name || 'brand')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'brand';
}

export function detectCreateCategory(name: string, brief: string): CreateCategory {
  const t = `${name} ${brief}`.toLowerCase();
  if (/\b(?:discord|slack|chat\s+(?:web\s+)?app|servers?\b.*\bchannels?|channels?\b.*\bservers?)\b/.test(t)
    && !/\b(?:bakery|florist|laptop|headphone)\b/.test(t)) {
    return 'chat';
  }
  if (/\b(?:bakery|pastry|croissant|sourdough|focaccia|bread|cafe|coffee\s+shop)\b/.test(t)) return 'bakery';
  if (/\b(?:florist|flower|bloom|bouquet|petal)\b/.test(t)) return 'florist';
  if (/\b(?:watch(?:es)?|horolog|jewelry|jewellery)\b/.test(t)) return 'watch';
  if (/\b(?:laptop|notebook|macbook|chromebook|ultrabook|computer\s+store|pc\s+store)\b/.test(t)) return 'laptop';
  if (/\b(?:headphone|earbuds?|airpods?|headset|earphones?|audio\s+store)\b/.test(t)) return 'audio';
  // Veopx-class only when the brief is clearly a lighting / sculptural-object ask —
  // bare "premium product/website" must NOT become editorial-dark.
  if (
    /\b(?:veopx|light\s+distilled|sculptural\s+lamp)\b/.test(t)
    || (/\bquiet\s+luxury\b/.test(t) && /\b(?:lamp|light(?:ing)?|object|orbs?|sculptural)\b/.test(t))
    || (/\blighting\b/.test(t) && /\b(?:lamp|product|object|studio|sculptural)\b/.test(t))
  ) {
    return 'lighting';
  }
  return 'generic';
}

export function createIdentityFromBrief(name: string, brief = ''): CreateIdentity {
  const product = String(name || 'Brand').trim() || 'Brand';
  const slug = slugify(product);
  const category = detectCreateCategory(product, brief);
  const t = `${product} ${brief}`.toLowerCase();
  const wantsCream = /\b(?:cream|warm|amber|cozy)\b/.test(t);

  let mood: CreateMood;
  let layout: CreateLayout;
  let palette: CreatePalette;
  let heroQueries: Array<{ id: string; q: string }>;
  let categoryNouns: string[];
  let forbiddenHex: string[];

  switch (category) {
    case 'bakery':
      mood = 'light-warm';
      layout = 'warm-shop';
      palette = { ...CREAM };
      categoryNouns = ['bakery', 'pastry', 'croissant', 'sourdough', 'bread', 'cafe', 'bakery interior'];
      heroQueries = [
        { id: `${slug}-hero`, q: 'bakery interior sourdough croissant pastry display warm cream daylight' },
        { id: `${slug}-story`, q: 'fresh croissants on wooden board bakery food photography warm' },
      ];
      forbiddenHex = ['#07090d', '#0c0a09', '#3dff9a'];
      break;
    case 'florist':
      mood = 'light-pastel';
      layout = 'warm-shop';
      palette = { ...PASTEL };
      categoryNouns = ['florist', 'flower', 'bouquet', 'bloom', 'petal', 'garden'];
      heroQueries = [
        { id: `${slug}-hero`, q: 'florist flower shop bouquet roses peonies soft pastel daylight' },
        { id: `${slug}-story`, q: 'fresh flower bouquet close up soft pastel photography' },
      ];
      forbiddenHex = ['#07090d', '#0c0a09', '#3dff9a'];
      break;
    case 'watch':
      mood = 'studio-product';
      layout = 'catalog-grid';
      palette = { ...GOLD_WATCH };
      categoryNouns = ['watch', 'wristwatch', 'timepiece', 'jewelry'];
      heroQueries = [
        { id: `${slug}-hero`, q: 'luxury wristwatch product photography studio gold editorial' },
        { id: `${slug}-story`, q: 'watch close up dial product photography studio' },
      ];
      forbiddenHex = ['#3dff9a'];
      break;
    case 'laptop':
      mood = 'studio-product';
      layout = 'catalog-grid';
      palette = { ...STUDIO };
      categoryNouns = ['laptop', 'notebook', 'computer', 'macbook'];
      heroQueries = [
        { id: `${slug}-hero`, q: 'laptop computer product photography silver studio editorial' },
        { id: `${slug}-story`, q: 'open laptop on desk product photography editorial' },
      ];
      forbiddenHex = ['#3dff9a'];
      break;
    case 'audio':
      mood = 'studio-product';
      layout = 'catalog-grid';
      palette = { ...STUDIO };
      categoryNouns = ['headphones', 'earbuds', 'headset', 'audio'];
      heroQueries = [
        { id: `${slug}-hero`, q: 'wireless headphones product photography studio editorial' },
        { id: `${slug}-story`, q: 'earbuds charging case product photography studio' },
      ];
      forbiddenHex = [];
      break;
    case 'lighting':
      mood = 'dark-editorial';
      layout = 'editorial-dark';
      palette = { ...EDITORIAL_DARK };
      categoryNouns = ['lamp', 'lighting', 'sculptural', 'object', 'product studio'];
      heroQueries = [
        { id: `${slug}-hero`, q: 'sculptural lamp product photography dark studio editorial' },
        { id: `${slug}-story`, q: 'minimal lighting object dark studio product photography' },
      ];
      forbiddenHex = [];
      break;
    case 'chat':
      mood = 'chat-shell';
      layout = 'chat-shell';
      palette = { ...CHAT_DARK };
      categoryNouns = ['chat', 'server', 'channel', 'discord'];
      heroQueries = [];
      forbiddenHex = ['#3dff9a'];
      break;
    default: {
      // "Premium" alone tightens craft later — it does NOT switch to Veopx editorial-dark.
      const editorialObject = (
        /\b(?:veopx|light\s+distilled|sculptural\s+lamp)\b/.test(t)
        || (/\bquiet\s+luxury\b/.test(t) && /\b(?:lamp|light(?:ing)?|object|orbs?|sculptural)\b/.test(t))
      );
      if (editorialObject) {
        mood = 'dark-editorial';
        layout = 'editorial-dark';
        palette = { ...EDITORIAL_DARK };
        categoryNouns = ['lamp', 'lighting', 'sculptural', 'object'];
        heroQueries = [
          { id: `${slug}-hero`, q: `${product} sculptural lamp product photography dark studio editorial` },
        ];
        forbiddenHex = [];
      } else if (wantsCream || /\b(?:warm|cozy|cafe)\b/.test(t)) {
        mood = 'light-warm';
        layout = 'warm-shop';
        palette = { ...CREAM };
        categoryNouns = ['shop', 'store', 'interior', 'warm'];
        heroQueries = [
          { id: `${slug}-hero`, q: `${product} warm shop interior daylight editorial photography` },
        ];
        forbiddenHex = ['#07090d', '#0c0a09', '#3dff9a'];
      } else {
        mood = 'studio-product';
        layout = 'catalog-grid';
        palette = { ...STUDIO };
        categoryNouns = ['product', 'store', 'shop'];
        heroQueries = [
          { id: `${slug}-hero`, q: `${product} product photography studio editorial category ${slug}` },
        ];
        forbiddenHex = ['#3dff9a'];
      }
      break;
    }
  }

  const heroHref = heroQueries[0]
    ? `/heroes/${heroQueries[0].id}.jpg`
    : `/heroes/${slug}-hero.jpg`;

  return {
    name: product,
    slug,
    category,
    mood,
    palette,
    layout,
    heroQueries,
    heroHref,
    categoryNouns,
    forbidden: {
      hex: forbiddenHex,
      layouts: category === 'bakery' || category === 'florist'
        ? ['editorial-dark', 'quiet-luxury-veopx']
        : category === 'chat'
          ? ['warm-shop', 'editorial-dark', 'catalog-grid']
          : [],
    },
  };
}

/** Polish prompt lines owned by identity — never default to Veopx for bakery/chat. */
export function polishPromptLinesFromIdentity(
  identity: CreateIdentity,
  appPath: string,
  brief: string,
): string[] {
  const hero = identity.heroHref;
  const p = identity.palette;
  const sharedTail = [
    '',
    `Product: ${identity.name}`,
    `Identity: category=${identity.category} mood=${identity.mood} layout=${identity.layout}`,
    `Palette: bg ${p.bg}, accent ${p.accent}, text ${p.text} — use these (or closer), not neon-mint #3dff9a unless identity allows.`,
    '',
    'Brief:',
    String(brief || '').slice(0, 6000),
  ];

  if (identity.layout === 'chat-shell') {
    return [
      'Build the first real Discord-like multi-pane chat UI for this new project from the brief.',
      'Output ONLY @@@FILE blocks — no preface, no plan.',
      `Write ALL UI in @@@FILE ${appPath} and @@@FILE src/App.css only.`,
      'Do NOT create ./components/* — one App file with the full shell inline.',
      `MUST import './App.css' at the top of ${appPath}.`,
      'Required layout (working React state):',
      '- Left server rail (clickable server icons)',
      '- Channel list for the active server (text channels)',
      '- Main chat pane with message list + composer that can send messages',
      '- useState for active server/channel and messages — buttons must update state',
      '- Dark Discord-like styling; include the product name in the UI',
      'Do NOT ship a centered brand-name splash. Do NOT build a marketing landing or product store.',
      ...sharedTail,
    ];
  }

  if (identity.layout === 'editorial-dark') {
    return [
      'Build a quiet-luxury product marketing landing from THIS brief only.',
      'Output ONLY @@@FILE blocks — no preface, no plan.',
      `Write ALL UI in @@@FILE ${appPath} and @@@FILE src/App.css only.`,
      `MUST import './App.css' at the top of ${appPath}.`,
      'Do NOT create ./components/*.',
      'Editorial-dark craft (this identity ONLY — do not use for bakeries/florists):',
      `- Full-viewport dark hero with LOCAL photo at ${hero} (img.hero-photo), wordmark top-left, Discover top-right`,
      '- Eyebrow + large serif headline + short lede + soft mint pill CTA',
      '- Scroll hint, split story, three numbered feature columns, minimal footer',
      'Match the product name and brief; do not invent a different genre.',
      ...sharedTail,
    ];
  }

  if (identity.layout === 'warm-shop') {
    return [
      `Build a warm ${identity.category} shop website from the brief.`,
      'Output ONLY @@@FILE blocks — no preface, no plan.',
      `Write ALL UI in @@@FILE ${appPath} and @@@FILE src/App.css only.`,
      `MUST import './App.css' at the top of ${appPath}.`,
      'Do NOT create ./components/*.',
      'Warm-shop craft (REQUIRED — not dark neon tech, not quiet-luxury Veopx):',
      `- Cream/light canvas (bg near ${p.bg}), ink text, amber/soft accent — NOT #07090d / #0c0a09 / #3dff9a`,
      '- Sticky nav: brand wordmark, Search that filters products, cart count',
      `- Hero with LOCAL image at ${hero} — category-correct photo, not electronics/radio`,
      '- CSS GRID of product cards (bordered boxes) with name, blurb, price, Add to Cart',
      '- At least 6 products matching the brief category',
      'Do NOT reuse Discover / mint pill / 01-02-03 quiet-luxury chrome.',
      ...sharedTail,
    ];
  }

  return [
    'Build a premium product catalog store from the brief.',
    'Output ONLY @@@FILE blocks — no preface, no plan.',
    `Write ALL UI in @@@FILE ${appPath} and @@@FILE src/App.css only.`,
    `MUST import './App.css' at the top of ${appPath}.`,
    'Do NOT create ./components/*.',
    'Catalog-grid craft:',
    '- Sticky nav with brand wordmark, Search filter, cart count',
    `- Hero with LOCAL image at ${hero}`,
    '- Product GRID of bordered cards — name, blurb, price, Purchase/Add to Cart',
    `- Palette near bg ${p.bg} / accent ${p.accent} — invent craft for THIS brand, not the last store`,
    'Do NOT use quiet-luxury Discover/mint/01-02-03 unless identity is editorial-dark.',
    ...sharedTail,
  ];
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

/** SVG hero in identity colors — last resort when photo search is wrong category. */
export function svgHeroDataUrl(identity: CreateIdentity): string {
  const { palette: p, name, category } = identity;
  const label = category === 'bakery' ? 'Bakery' : category === 'florist' ? 'Florist' : name;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${p.glow}"/><stop offset="55%" stop-color="${p.bg}"/>
<stop offset="100%" stop-color="${p.panel}"/></linearGradient></defs>
<rect width="1600" height="900" fill="url(#g)"/>
<circle cx="1280" cy="180" r="220" fill="${p.accent}" opacity="0.18"/>
<circle cx="320" cy="720" r="280" fill="${p.accent}" opacity="0.12"/>
<text x="80" y="120" fill="${p.text}" font-family="Georgia,serif" font-size="64" font-weight="700">${escapeXml(name)}</text>
<text x="80" y="190" fill="${p.muted}" font-family="Georgia,serif" font-size="28">${escapeXml(label)}</text>
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

/** True when Openverse/title text looks like the right category. */
export function heroResultMatchesCategory(
  identity: CreateIdentity,
  titleOrTags: string,
): boolean {
  if (!identity.categoryNouns.length) return true;
  const hay = String(titleOrTags || '').toLowerCase();
  if (!hay.trim()) return true;
  const bad = /\b(?:radio|electronics?|transistor|cassette|walkman|vga|gpu|chassis|tower\s+case|forest|meadow|ocean|underwater)\b/i;
  if (identity.category === 'bakery' || identity.category === 'florist') {
    if (bad.test(hay) && !identity.categoryNouns.some((n) => hay.includes(n))) return false;
  }
  return identity.categoryNouns.some((n) => hay.includes(n.toLowerCase())) || !bad.test(hay);
}

/** Fail-closed identity checks for create-ready. */
export function identityCreateMisses(
  identity: CreateIdentity,
  files: Record<string, string>,
): string[] {
  const misses: string[] = [];
  const css = files['src/App.css'] || '';
  const app = files['src/App.jsx'] || files['src/App.tsx'] || '';

  if (css && !stylesAreLinked(files)) {
    misses.push('App.css exists but App/main do not import ./App.css');
  }
  for (const hex of identity.forbidden.hex) {
    const re = new RegExp(hex.replace('#', '#?'), 'i');
    if (hex.toLowerCase() === '#3dff9a' && identity.mood === 'dark-editorial') continue;
    if ((hex === '#0c0a09' || hex === '#07090d') && identity.mood.startsWith('light') && re.test(css)) {
      misses.push(`${identity.category} identity forbids dark shell ${hex}`);
    } else if (hex.toLowerCase() === '#3dff9a' && identity.mood.startsWith('light') && re.test(css)) {
      misses.push(`${identity.category} identity forbids neon mint ${hex}`);
    }
  }
  if (identity.layout === 'warm-shop' && /Discover|01\s*\/\s*02\s*\/\s*03|soft mint pill/i.test(app)) {
    misses.push('warm-shop App still uses quiet-luxury Veopx chrome');
  }
  if (identity.category === 'bakery' && /\b(?:radio|electronics|gpu|pc\s*case)\b/i.test(app)
    && !/\b(?:croissant|sourdough|bakery|pastry)\b/i.test(app)) {
    misses.push('bakery App missing pastry content');
  }
  return misses;
}

/**
 * Heal files to match identity: link CSS, rewrite legacy generic hero.jpg paths,
 * strip forbidden hex by rewriting companion CSS when light moods are poisoned.
 */
export function healFilesToIdentity(
  identity: CreateIdentity,
  files: Record<string, string>,
  companionCssBuilder?: (id: CreateIdentity) => string,
): { files: Record<string, string>; healed: string[] } {
  let next = { ...files };
  const healed: string[] = [];
  const linked = ensureStylesLinked(next);
  next = linked.files;
  if (linked.changed.length) healed.push(`linked:${linked.changed.join(',')}`);

  const storyHref = identity.heroQueries[1]
    ? `/heroes/${identity.heroQueries[1].id}.jpg`
    : identity.heroHref.replace(/-hero(\.|$)/, '-story$1');

  for (const k of Object.keys(next)) {
    if (!/\.(?:jsx|tsx|css|html)$/i.test(k)) continue;
    let body = next[k];
    const before = body;
    body = body.replace(/\/heroes\/hero\.jpg/gi, identity.heroHref);
    body = body.replace(/\/heroes\/story\.jpg/gi, storyHref);
    if (body !== before) {
      next[k] = body;
      healed.push(`hero-path:${k}`);
    }
  }

  const css = next['src/App.css'] || '';
  const poisoned = identity.mood.startsWith('light') && (
    /#0c0a09|#07090d|#3dff9a/i.test(css)
  );
  if (poisoned && companionCssBuilder) {
    next['src/App.css'] = companionCssBuilder(identity);
    healed.push('rewrote-css');
  } else if (poisoned) {
    // Inline cream rewrite without circular import on createBuildQuality.
    const p = identity.palette;
    next['src/App.css'] = `/* healed ${identity.category} */\n:root{--bg:${p.bg};--panel:${p.panel};--text:${p.text};--muted:${p.muted};--accent:${p.accent};--line:${p.line}}\n`
      + (css
        .replace(/--bg\s*:\s*#[0-9a-fA-F]{3,8}/gi, `--bg: ${p.bg}`)
        .replace(/--accent\s*:\s*#[0-9a-fA-F]{3,8}/gi, `--accent: ${p.accent}`)
        .replace(/#0c0a09|#07090d/gi, p.bg)
        .replace(/#3dff9a/gi, p.accent));
    healed.push('stripped-forbidden-hex');
  }

  return { files: next, healed };
}
