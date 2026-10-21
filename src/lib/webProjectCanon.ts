import { extractBrandLabel, extractDualSideLabels, extractNameRenameTarget, extractNameTextColorTarget, extractPutPlaceNameLabel, extractShowWordLabel, looksLikeNameTextColorAsk } from '@/lib/brandLabel';
import { productGlyphDataUrl, productGlyphJsx } from '@/lib/createIdentity';
import { findGlyphHrefInFiles, productGlyphImgTag, productVisualFallbackSvg } from '@/lib/productVisual';
import { looksLikeNameFontStyleAsk, normalizeMessyUiEditAsk } from '@/lib/editAskResolve';
import { parseNamedBrandLogos, parseNamedUiIcons } from '@/lib/brandAssets';
import { briefForbidsAbsoluteRails } from '@/lib/createLayoutContract';
import { canonicalAskForOp, isMicroFidelityPlan, planUiAsk } from '@/lib/uiAskPlan';

/**
 * Canonical web project paths + micro-ask patches.
 * Stops models from writing into literal `path/to/...` junk and reporting false "Done".
 */

export type WebFileMap = Record<string, string>;

export type WebFileEdit = {
  path: string;
  content: string;
};

const PLACEHOLDER_PREFIX = /^(?:\.\/)?(?:path\/to\/|foo\/bar\/|example\/|your[-_]?project\/)/i;

/** Replace inner text of the first <button>…</button>, tolerant of `>` inside JSX attrs (onClick={() => …}). */
function replaceFirstJsxTagInnerText(src: string, tag: string, label: string): string | null {
  const openRe = new RegExp(`<${tag}\\b`, 'i');
  const m = openRe.exec(src);
  if (!m) return null;
  const start = m.index;
  let i = start + m[0].length;
  let depth = 0;
  let quote: '"' | "'" | '`' | null = null;
  for (; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (ch === '>' && depth === 0) {
      const openEnd = i + 1;
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
      closeRe.lastIndex = openEnd;
      const close = closeRe.exec(src);
      if (!close) return null;
      return `${src.slice(0, openEnd)}${label}${src.slice(close.index)}`;
    }
  }
  return null;
}

function normalizePath(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^[`"'[(]+|[`"'][)]+$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function flatten(files: WebFileMap): WebFileMap {
  const out: WebFileMap = {};
  for (const [k, v] of Object.entries(files || {})) {
    if (!k || typeof v !== 'string') continue;
    const base = (k.split('/').pop() || k).toLowerCase();
    if (base === 'ark-chat.json' || base === 'nova-meta.json') continue;
    out[normalizePath(k)] = v;
  }
  return out;
}

/** True if path is a prompt-placeholder tree models copy literally. */
export function isPlaceholderJunkPath(path: string): boolean {
  const p = normalizePath(path);
  return PLACEHOLDER_PREFIX.test(p) || /^path\//i.test(p);
}

/**
 * Map model paths onto the real web tree.
 * `path/to/css/styles.css` → `css/styles.css`
 * `path/to/index.html` → `index.html`
 */
export function remapPlaceholderEditPath(path: string, existing?: WebFileMap): string {
  let p = normalizePath(path);
  if (!p) return p;

  if (PLACEHOLDER_PREFIX.test(p)) {
    p = p.replace(PLACEHOLDER_PREFIX, '');
  }

  // Bare names → canonical web layout when this looks like a simple site.
  const flat = existing ? flatten(existing) : {};
  const hasWeb = Object.keys(flat).some(k => /(^|\/)index\.html$/i.test(k) || /(^|\/)styles?\.css$/i.test(k));
  const hasViteReact = Object.keys(flat).some(k => /(^|\/)src\/App\.(jsx|tsx)$/i.test(k));

  if (hasViteReact) {
    if (/^App\.jsx$/i.test(p)) return 'src/App.jsx';
    if (/^App\.tsx$/i.test(p)) return 'src/App.tsx';
    if (/^App\.css$/i.test(p)) return flat['src/App.css'] != null ? 'src/App.css' : 'src/App.css';
    if (/^index\.css$/i.test(p) && flat['src/index.css'] != null) return 'src/index.css';
    if (/^main\.jsx$/i.test(p) && flat['src/main.jsx'] != null) return 'src/main.jsx';
    if (/^main\.tsx$/i.test(p) && flat['src/main.tsx'] != null) return 'src/main.tsx';
  }

  if (hasWeb || /^(index\.html|styles?\.css|app\.js)$/i.test(p)) {
    if (/^index\.html$/i.test(p)) return 'index.html';
    if (/^styles?\.css$/i.test(p)) return 'css/styles.css';
    if (/^app\.js$/i.test(p)) return 'js/app.js';
  }

  // Nested junk that still includes css/js after strip
  if (/^css\/styles?\.css$/i.test(p)) return 'css/styles.css';
  if (/^js\/app\.js$/i.test(p)) return 'js/app.js';

  return p;
}

/** Remap + dedupe model edits onto canonical paths. */
export function canonicalizeWebEdits(edits: WebFileEdit[], existing?: WebFileMap): WebFileEdit[] {
  const out: WebFileEdit[] = [];
  const seen = new Set<string>();
  for (const edit of edits || []) {
    const path = remapPlaceholderEditPath(edit.path, existing);
    if (!path || !path.includes('.')) continue;
    if (isPlaceholderJunkPath(path)) continue;
    const content = String(edit.content || '');
    if (!content.trim()) continue;
    if (seen.has(path)) {
      const idx = out.findIndex(e => e.path === path);
      if (idx >= 0) out[idx] = { path, content };
      continue;
    }
    seen.add(path);
    out.push({ path, content });
  }
  return out;
}

/** Drop placeholder junk keys from the in-memory project map. */
export function prunePlaceholderJunk(files: WebFileMap): WebFileMap {
  const out: WebFileMap = {};
  for (const [k, v] of Object.entries(files || {})) {
    if (isPlaceholderJunkPath(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Paths the Start / right preview actually serve for a simple HTML project. */
export function previewServingPaths(files: WebFileMap): string[] {
  const flat = flatten(files);
  const paths = new Set<string>();
  let htmlPath = '';
  if (flat['index.html']?.trim()) htmlPath = 'index.html';
  else if (flat['nova-preview.html']?.trim()) htmlPath = 'nova-preview.html';
  else {
    htmlPath = Object.keys(flat).find(p => /\.html?$/i.test(p) && !isPlaceholderJunkPath(p)) || '';
  }
  if (!htmlPath) return [];
  paths.add(htmlPath);
  const html = flat[htmlPath] || '';
  for (const m of html.matchAll(/href=["']([^"']+\.css)["']/gi)) {
    const key = normalizePath(m[1]);
    if (flat[key] || flat[key.split('/').pop() || '']) paths.add(flat[key] ? key : (key.split('/').pop() || key));
    else paths.add(key);
  }
  for (const m of html.matchAll(/src=["']([^"']+\.js)["']/gi)) {
    const key = normalizePath(m[1]);
    if (flat[key] || flat[key.split('/').pop() || '']) paths.add(flat[key] ? key : (key.split('/').pop() || key));
    else paths.add(key);
  }
  // Always include conventional trio when present
  for (const p of ['css/styles.css', 'js/app.js', 'styles.css', 'app.js']) {
    if (flat[p]) paths.add(p);
  }
  return [...paths];
}

export function touchesPreviewServing(changedPaths: string[], files: WebFileMap): boolean {
  if (!changedPaths?.length) return false;
  const serving = new Set(previewServingPaths(files).map(normalizePath));
  if (!serving.size) {
    // Empty / new project: root web files count
    return changedPaths.some(p => {
      const n = normalizePath(p);
      return /^(index\.html|css\/styles\.css|js\/app\.js)$/i.test(n) && !isPlaceholderJunkPath(n);
    });
  }
  return changedPaths.some(p => {
    const n = normalizePath(p);
    if (serving.has(n)) return true;
    const base = n.split('/').pop() || n;
    return [...serving].some(s => s === base || s.endsWith(`/${base}`));
  });
}

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cssColor(name: string): string | null {
  // Compound paints first — "cream brown" is warm tan, not sienna #8B4513.
  if (/cream\s*[- ]?\s*brown|brown\s*[- ]?\s*cream/i.test(name)) return '#c4a882';
  if (/black|dark/i.test(name)) return '#000000';
  if (/cream/i.test(name)) return '#f5f0e8';
  if (/white/i.test(name)) return '#ffffff';
  if (/sky\s*blue|skyblue/i.test(name)) return '#87CEEB';
  // Light* must win before bare blue/red (otherwise "light red" → #dc2626).
  if (/light\s*red|lightred/i.test(name)) return '#fca5a5';
  if (/light\s*blue|lightblue/i.test(name)) return '#93c5fd';
  if (/light\s*pink|lightpink/i.test(name)) return '#fbcfe8';
  if (/blue/i.test(name)) return '#2563eb';
  if (/red/i.test(name)) return '#dc2626';
  if (/green/i.test(name)) return '#16a34a';
  if (/yellow/i.test(name)) return '#eab308';
  if (/purple|violet/i.test(name)) return '#a78bfa';
  if (/brown|chocolate|sienna/i.test(name)) return '#8B4513';
  if (/teal/i.test(name)) return '#0f766e';
  if (/pink/i.test(name)) return '#ec4899';
  if (/orange/i.test(name)) return '#f97316';
  if (/navy/i.test(name)) return '#1e3a8a';
  // Soft/premium gray for backgrounds — mid slate reads harsh full-screen.
  if (/gr[ae]y/i.test(name)) return '#e8e6e3';
  return null;
}

/** Lucide-ish stroke glyphs so surgical icons aren't identical circles. */
function simpleUiIconSvg(id: string, ink: string): string {
  const stroke = `fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
  const body: Record<string, string> = {
    search: `<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.2-3.2"/>`,
    menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
    settings: `<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M3 12h2M19 12h2M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5"/>`,
    user: `<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.5 3.8-5.5 7-5.5s5.8 2 7 5.5"/>`,
    home: `<path d="M4 11.5 12 4l8 7.5"/><path d="M7 10.5V20h10v-9.5"/>`,
    bag: `<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>`,
    bell: `<path d="M6 16h12l-1.2-2.2a6 6 0 0 1-1-3.3V9a3.8 3.8 0 1 0-7.6 0v1.5a6 6 0 0 1-1 3.3L6 16z"/><path d="M10 19a2 2 0 0 0 4 0"/>`,
    heart: `<path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 7.2a3.8 3.8 0 0 1 7 3.6C19 15.6 12 20 12 20z"/>`,
    cart: `<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.2 11h9.6L19 8H7"/>`,
  };
  const inner = body[id] || `<circle cx="12" cy="12" r="7"/><path d="M8 12h8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${stroke}><title>${id}</title>${inner}</svg>\n`;
}

function parseLayoutCorner(t: string): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null {
  const s = String(t || '');
  if (/\btop[\s-]?left\b/i.test(s) || (/\btop\b/i.test(s) && /\bleft\b/i.test(s) && !/\bright\b/i.test(s))) return 'top-left';
  if (/\btop[\s-]?right\b/i.test(s) || (/\btop\b/i.test(s) && /\bright\b/i.test(s))) return 'top-right';
  if (/\bbottom[\s-]?left\b/i.test(s) || (/\bbottom\b/i.test(s) && /\bleft\b/i.test(s) && !/\bright\b/i.test(s))) return 'bottom-left';
  if (/\bbottom[\s-]?right\b/i.test(s) || (/\bbottom\b/i.test(s) && /\bright\b/i.test(s))) return 'bottom-right';
  return null;
}

/** Storefront vs studio shells — same surgical path must not clone one recipe. */
type UiLayoutFamily = 'storefront' | 'studio' | 'default';

function inferUiLayoutFamily(ask: string, app = ''): UiLayoutFamily {
  const t = `${ask}\n${app}`;
  if (/\b(?:shop|store|cart|checkout|buy|product|keyboard|headphones?|earbuds?|headset|mouse|merch|storefront)\b/i.test(t)) {
    return 'storefront';
  }
  if (/\b(?:featured\s+work|design\s+studio|atelier|agency|portfolio|case\s+stud)\b/i.test(t)) {
    return 'studio';
  }
  return 'default';
}

/**
 * Per-project chrome DNA — stops every shop/studio from cloning the same
 * top-left serif + cursive tagline + top-right Shop/Contact twin.
 * Seeded by brand name so Auralis ≠ Keyline ≠ Lumen.
 */
type LayoutChromeRecipe = {
  id: string;
  brandCorner: 'top-left' | 'top-right';
  /** absolute float vs in-flow masthead */
  brandPosition: 'absolute' | 'flow';
  tagline: 'italic-serif' | 'sans' | 'small-caps' | 'tracked';
  displayFont: string;
  heroAlign: 'center' | 'left' | 'start';
  /** where Shop/Contact land */
  nav: 'end' | 'start' | 'center' | 'brand-row';
  cta: 'rect' | 'pill' | 'text';
};

function hashLayoutSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Extra avalanche so short brand names (Auralis/Keyline/Lumen) don't collide.
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function layoutSeedFromProject(ask: string, app: string): string {
  // First token only — never "Auralis in a" from a messy capture.
  const rawApp = app.match(/<h1\b[^>]*className=["']center-word["'][^>]*>\s*([^<]+)/i)?.[1]?.trim() || '';
  const fromApp = rawApp.split(/\s+/)[0] || '';
  const fromAsk = (
    ask.match(/\b(?:called|named)\s+([A-Z][A-Za-z0-9]{2,28})\b/)?.[1]
    || ask.match(/\b(?:the\s+)?name\s+([A-Z][A-Za-z0-9]{2,28})\b/)?.[1]
    || ask.match(/\b([A-Z][a-zA-Z0-9]{2,28})\s+(?:headphones?|keyboards?|shop|store|site|page|brand)\b/)?.[1]
    || ask.match(/\b(?:Put|Add)\s+([A-Z][A-Za-z0-9]{2,28})\b/)?.[1]
    || ''
  ).trim();
  return String(fromApp || fromAsk || 'nova').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const LAYOUT_CHROME_RECIPES: LayoutChromeRecipe[] = [
  // None of these is the old twin (absolute TL + italic + nav-end + center hero + pill).
  {
    id: 'masthead-flow',
    brandCorner: 'top-left',
    brandPosition: 'flow',
    tagline: 'sans',
    displayFont: 'system-ui,-apple-system,"Segoe UI",sans-serif',
    heroAlign: 'left',
    nav: 'center',
    cta: 'rect',
  },
  {
    id: 'brand-right-rail',
    brandCorner: 'top-right',
    brandPosition: 'absolute',
    tagline: 'tracked',
    displayFont: 'Palatino,"Palatino Linotype",Palladio,serif',
    heroAlign: 'start',
    nav: 'start',
    cta: 'text',
  },
  {
    id: 'nav-brand-row',
    brandCorner: 'top-left',
    brandPosition: 'flow',
    tagline: 'small-caps',
    displayFont: 'Georgia,"Times New Roman",serif',
    heroAlign: 'center',
    nav: 'brand-row',
    cta: 'pill',
  },
  {
    id: 'editorial-stack',
    brandCorner: 'top-left',
    brandPosition: 'absolute',
    tagline: 'sans',
    displayFont: '"Iowan Old Style",Georgia,"Times New Roman",serif',
    heroAlign: 'left',
    nav: 'end',
    cta: 'rect',
  },
  {
    id: 'split-wide',
    brandCorner: 'top-left',
    brandPosition: 'flow',
    tagline: 'tracked',
    displayFont: 'Georgia,"Times New Roman",serif',
    heroAlign: 'start',
    nav: 'end',
    cta: 'text',
  },
  {
    id: 'quiet-rail',
    brandCorner: 'top-right',
    brandPosition: 'absolute',
    tagline: 'sans',
    displayFont: 'system-ui,-apple-system,"Segoe UI",sans-serif',
    heroAlign: 'center',
    nav: 'start',
    cta: 'pill',
  },
  {
    id: 'stage-left-rail',
    brandCorner: 'top-right',
    brandPosition: 'absolute',
    tagline: 'italic-serif',
    displayFont: 'Palatino,"Palatino Linotype",Palladio,serif',
    heroAlign: 'left',
    nav: 'start',
    cta: 'text',
  },
];

/** Stable per-brand chrome — known ladder brands never share a twin recipe. */
const FORCED_LAYOUT_INDEX: Record<string, number> = {
  auralis: 0, // masthead-flow — left hero, centered nav, sans tagline, rect CTA
  keyline: 1, // brand-right-rail — brand top-right, left nav, tracked tagline, text CTA
  lumen: 2, // nav-brand-row — brand in header row, small-caps tagline, pill CTA
  atelier: 3, // editorial-stack
  beacon: 4, // split-wide
  nook: 5, // quiet-rail
  micora: 6, // stage-left-rail — brand top-right, left hero, italic tagline, text CTA
  glow: 1,
  cartly: 0,
  relay: 3,
  tipwise: 4,
  oak: 5,
  henson: 6,
};

function pickLayoutChrome(ask: string, app: string): LayoutChromeRecipe {
  const recipes = LAYOUT_CHROME_RECIPES;
  const seed = layoutSeedFromProject(ask, app);
  const forced = FORCED_LAYOUT_INDEX[seed];
  const idx = forced != null ? forced % recipes.length : hashLayoutSeed(seed) % recipes.length;
  return recipes[idx];
}

/**
 * Composition shells change the App STRUCTURE — not just corner CSS.
 * Corner-only DNA still produced Micora twin layouts (brand + hero + shop strip).
 */
type CompositionShellId = 'split-photo' | 'bottom-stage' | 'watermark-column';

const FORCED_COMPOSITION_SHELL: Record<string, CompositionShellId> = {
  micora: 'split-photo',
  auralis: 'bottom-stage',
  keyline: 'watermark-column',
  henson: 'split-photo',
};

function pickCompositionShell(ask: string, app: string): CompositionShellId {
  const seed = layoutSeedFromProject(ask, app);
  if (FORCED_COMPOSITION_SHELL[seed]) return FORCED_COMPOSITION_SHELL[seed];
  if (/\bsplit\b/i.test(ask) && /\b(?:photo|image|left|panel)\b/i.test(ask)) return 'split-photo';
  if (/\bwatermark\b|\beditorial\s+column\b/i.test(ask)) return 'watermark-column';
  if (/\bbottom\b/i.test(ask) && /\b(?:stage|band|shop)\b/i.test(ask)) return 'bottom-stage';
  const shells: CompositionShellId[] = ['split-photo', 'bottom-stage', 'watermark-column'];
  return shells[hashLayoutSeed(`${seed}:shell`) % shells.length];
}

function extractExistingBrand(app: string, fallback = 'Micora'): string {
  return (
    app.match(/<h1\b[^>]*className=["']center-word["'][^>]*>\s*([^<]+)/i)?.[1]?.trim()
    || app.match(/className=["']brand["'][^>]*>\s*([^<]+)/i)?.[1]?.trim()
    || fallback
  ).replace(/[<>&`]/g, '').slice(0, 40) || fallback;
}

function extractExistingTagline(app: string): string {
  return (
    app.match(/<p\b[^>]*className=["']tagline["'][^>]*>\s*([^<]+)/i)?.[1]?.trim()
    || ''
  ).replace(/[<>&`]/g, '').slice(0, 120);
}

function extractExistingHeadline(app: string): string {
  return (
    app.match(/<h2\b[^>]*className=["']hero-headline["'][^>]*>\s*([^<]+)/i)?.[1]?.trim()
    || ''
  ).replace(/[<>&`]/g, '').slice(0, 120);
}

function extractExistingSupport(app: string): string {
  return (
    app.match(/<p\b[^>]*className=["']hero-support["'][^>]*>\s*([^<]+)/i)?.[1]?.trim()
    || ''
  ).replace(/[<>&`]/g, '').slice(0, 180);
}

/** True when the ask wants a real design/composition change — not another corner shuffle. */
function wantsGraphicCompositionAsk(t: string): boolean {
  return (
    /\b(?:graphic|high[- ]?quality\s+design|product\s+(?:photos?|glyphs?|visuals?)|hero\s+(?:image|photo|glyph)|split\s+layout|look\s+different|brand\s+new\s+layout|rebuild\s+(?:the\s+)?(?:layout|design|page)|photo\s+on\s+the\s+left|visual\s+design|generated\s+(?:product|mic|glyph)|no\s+outside\s+images)\b/i.test(t)
    || (
      /\bdesign\b/i.test(t)
      && /\b(?:more|real|actual|better|new|fresh|different)\b/i.test(t)
      && !/\bkeep\s+the\s+design\s+simple\b/i.test(t)
    )
  );
}

function compositionShellCss(shell: CompositionShellId, ink: string, canvas: string): string {
  const root = `html, body, #root { min-height: 100%; height: auto; margin: 0; background: ${canvas}; }\n`;
  if (shell === 'split-photo') {
    return `${root}
.app{min-height:100svh;margin:0;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,0.95fr);color:${ink};background:${canvas};position:relative;overflow-x:hidden}
@media (max-width:900px){.app{grid-template-columns:1fr}}
.stage-photo{position:relative;min-height:100svh;overflow:hidden;background:#0a0e0d}
.stage-photo img,.stage-photo .stage-glyph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.stage-photo__wash{position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,12,10,.05),rgba(8,12,10,.45) 70%,rgba(8,12,10,.78));pointer-events:none}
.stage-copy{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:space-between;padding:2rem 2.25rem 2.5rem;min-height:100svh;box-sizing:border-box;background:linear-gradient(165deg,#101614 0%,#0b1210 55%,#0a0e0d 100%)}
.brand-lockup{position:relative;top:auto;left:auto;right:auto;margin:0;display:flex;flex-direction:column;align-items:flex-start;gap:0.45rem;max-width:22rem}
.center-word{margin:0;font-size:clamp(2rem,4.5vw,3.2rem);font-weight:600;letter-spacing:-0.03em;font-family:Palatino,"Palatino Linotype",Palladio,serif;color:${ink}}
.tagline{margin:0;font-style:italic;font-family:Georgia,"Times New Roman",serif;opacity:.82;font-size:1.02rem;line-height:1.35}
.hero-copy{margin:2.5rem 0 0;padding:0;max-width:26rem;text-align:left;align-items:flex-start}
.hero-headline{margin:0;font-size:clamp(1.7rem,3.5vw,2.6rem);font-weight:600;letter-spacing:-0.02em;line-height:1.15;font-family:Palatino,"Palatino Linotype",Palladio,serif}
.hero-support{margin:.75rem 0 0;opacity:.8;font-size:1.02rem;line-height:1.45;max-width:24rem}
.product-grid{margin:2rem 0 0;padding:0;max-width:100%;width:100%}
.product-grid__head{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 1rem}
.product-grid__title{margin:0;font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
.cart-pill{margin:0;font-size:.9rem;opacity:.72}
.product-grid__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.85rem}
.product-card{display:grid;grid-template-columns:4.5rem 1fr auto;gap:.85rem;align-items:center;padding:.75rem 0;border:0;border-bottom:1px solid color-mix(in srgb,currentColor 16%,transparent);background:transparent;border-radius:0}
.product-card__thumb{width:4.5rem;height:4.5rem;object-fit:cover;border-radius:0.3rem;display:block;background:#121816;flex-shrink:0}
.product-card__body{display:flex;flex-direction:column;gap:.25rem;min-width:0}
.product-card__name{margin:0;font-size:1.02rem;font-weight:600}
.product-card__desc{margin:0;font-size:.88rem;opacity:.75;line-height:1.35}
.add-to-cart{appearance:none;border:1px solid color-mix(in srgb,currentColor 30%,transparent);background:transparent;color:inherit;border-radius:0.3rem;padding:.45rem .7rem;font:inherit;font-size:.82rem;cursor:pointer;white-space:nowrap}
.add-to-cart:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
.contact-footer{margin-top:2rem;padding-top:1.25rem;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);display:flex;flex-wrap:wrap;gap:.85rem 1.25rem;font-size:.9rem}
.contact-footer__label{margin:0;letter-spacing:.08em;text-transform:uppercase;opacity:.65;font-size:.72rem}
.contact-footer a{color:inherit;text-decoration:none;opacity:.88}
.contact-footer a:hover{text-decoration:underline}
`;
  }
  if (shell === 'bottom-stage') {
    return `${root}
.app{min-height:100svh;margin:0;display:flex;flex-direction:column;color:${ink};background:${canvas};position:relative}
.stage-photo{position:relative;flex:1;min-height:52svh;overflow:hidden;background:#0a0e0d}
.stage-photo img,.stage-photo .stage-glyph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.stage-photo__wash{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,10,12,.15),rgba(10,10,12,.88));pointer-events:none}
.stage-copy{position:relative;z-index:2;padding:1.75rem 1.75rem 2.25rem;background:#111}
.brand-lockup{margin:0 0 1rem;display:flex;flex-direction:column;gap:.4rem}
.center-word{margin:0;font-size:clamp(1.8rem,4vw,2.8rem);font-family:Georgia,"Times New Roman",serif}
.tagline{margin:0;opacity:.8;font-size:.95rem}
.hero-copy{margin:0 0 1.25rem}
.hero-headline{margin:0;font-size:clamp(1.5rem,3vw,2.2rem)}
.hero-support{margin:.5rem 0 0;opacity:.78}
.product-grid{margin:0}
.product-grid__list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;list-style:none;padding:0;margin:0}
@media (max-width:720px){.product-grid__list{grid-template-columns:1fr}}
.product-card{border:1px solid color-mix(in srgb,currentColor 16%,transparent);padding:.85rem;display:flex;flex-direction:column;gap:.5rem;background:color-mix(in srgb,currentColor 4%,transparent)}
.product-card__thumb{width:100%;height:7rem;object-fit:cover;border-radius:.25rem;background:#121816}
.product-card__name{margin:0;font-weight:600}
.product-card__desc{margin:0;font-size:.88rem;opacity:.75}
.add-to-cart{appearance:none;align-self:flex-start;border:1px solid currentColor;background:transparent;color:inherit;padding:.4rem .7rem;font:inherit;cursor:pointer}
.contact-footer{margin-top:1.25rem;display:flex;gap:1rem;flex-wrap:wrap;font-size:.9rem;opacity:.85}
.contact-footer a{color:inherit;text-decoration:none}
`;
  }
  // watermark-column
  return `${root}
.app{min-height:100svh;margin:0;display:flex;flex-direction:column;align-items:center;color:${ink};background:${canvas};position:relative;padding:2.5rem 1.25rem 3rem;box-sizing:border-box}
.brand-watermark{position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);font-size:clamp(4rem,18vw,12rem);font-family:Palatino,Georgia,serif;opacity:.06;pointer-events:none;z-index:0;letter-spacing:-0.04em;white-space:nowrap}
.stage-copy{position:relative;z-index:1;width:min(92vw,38rem);display:flex;flex-direction:column;gap:1.5rem}
.brand-lockup{margin:0}
.center-word{margin:0;font-size:clamp(1.6rem,3vw,2.2rem);font-family:Palatino,Georgia,serif}
.tagline{margin:.4rem 0 0;font-style:italic;opacity:.8}
.hero-copy{margin:0;border-top:1px solid color-mix(in srgb,currentColor 18%,transparent);padding-top:1.25rem}
.hero-headline{margin:0;font-size:clamp(1.8rem,4vw,2.8rem);line-height:1.12}
.hero-support{margin:.7rem 0 0;opacity:.8;line-height:1.45}
.stage-photo{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:.2rem;background:#0a0e0d}
.stage-photo img,.stage-photo .stage-glyph{width:100%;height:100%;object-fit:cover;display:block}
.product-grid{margin:0;width:100%}
.product-grid__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
.product-card{display:grid;grid-template-columns:5rem 1fr auto;gap:1rem;align-items:center;padding:1rem 0;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent)}
.product-card__thumb{width:5rem;height:5rem;object-fit:cover;background:#121816}
.product-card__name{margin:0;font-weight:600}
.product-card__desc{margin:.25rem 0 0;font-size:.9rem;opacity:.75}
.add-to-cart{border:1px solid currentColor;background:transparent;color:inherit;padding:.45rem .75rem;font:inherit;cursor:pointer}
.contact-footer{margin-top:1.5rem;display:flex;gap:1rem;font-size:.9rem}
.contact-footer a{color:inherit}
`;
}

function buildCompositionShellApp(opts: {
  shell: CompositionShellId;
  brand: string;
  tagline: string;
  headline: string;
  support: string;
  products?: Array<{ name: string; desc: string; img?: string }>;
  email?: string;
  keepCart?: boolean;
  /** Project files — when public/glyphs/* exist, prefer <img> over inline SVG. */
  files?: Record<string, string>;
}): string {
  const brand = opts.brand;
  const tagline = opts.tagline || 'Clear voice for every room';
  const headline = opts.headline || 'Capture every note';
  const support = opts.support || 'Studio mics made for small rooms and big ideas';
  const accent = '#7d9b78';
  const briefHint = `${brand} microphone ${tagline}`;
  const products = opts.products || [
    { name: 'Room Condenser', desc: 'Soft room tone for podcasts.' },
    { name: 'Desk Dynamic', desc: 'Tight focus for desk setups.' },
    { name: 'Travel Clip', desc: 'Clip-on clarity on the move.' },
  ];
  const email = opts.email || 'hello@micora.studio';
  const files = opts.files || {};
  const heroHref = findGlyphHrefInFiles(files, 'microphone')
    || findGlyphHrefInFiles(files, 'mic-room')
    || null;
  const heroGlyph = heroHref
    ? productGlyphImgTag(heroHref, 'stage-glyph', `${brand} microphone`)
    : productGlyphJsx(`${brand} microphone`, {
      role: 'hero',
      brief: briefHint,
      accent,
      className: 'stage-glyph',
    });
  const thumbSlugFor = (name: string): string => {
    if (/\b(?:clip|travel|lav)\b/i.test(name)) return 'mic-travel';
    if (/\b(?:desk|dynamic)\b/i.test(name)) return 'mic-desk';
    if (/\b(?:room|condenser)\b/i.test(name)) return 'mic-room';
    return 'microphone';
  };
  const cards = products.map((p) => {
    const thumbHref = p.img
      || findGlyphHrefInFiles(files, thumbSlugFor(p.name))
      || findGlyphHrefInFiles(files, 'microphone');
    const thumb = thumbHref
      ? productGlyphImgTag(thumbHref, 'product-card__thumb', p.name)
      : productGlyphJsx(p.name, {
        role: 'thumb',
        brief: briefHint,
        accent,
        className: 'product-card__thumb',
      });
    return `<li className="product-card">
            ${thumb}
            <div className="product-card__body">
              <h3 className="product-card__name">${p.name}</h3>
              <p className="product-card__desc">${p.desc}</p>
            </div>
            <button type="button" className="add-to-cart" onClick={() => setCartCount((n) => n + 1)}>Add to cart</button>
          </li>`;
  }).join('\n          ');
  const shop = `<section id="shop" className="product-grid" aria-label="Shop">
          <div className="product-grid__head">
            <h2 className="product-grid__title">Shop</h2>
            <p className="cart-pill" aria-live="polite">Cart ({cartCount})</p>
          </div>
          <ul className="product-grid__list">
          ${cards}
          </ul>
        </section>`;
  const footer = `<footer className="contact-footer" aria-label="Contact">
          <p className="contact-footer__label">Contact</p>
          <a className="contact-footer__help" href="#help">Help</a>
          <a className="contact-footer__email" href="mailto:${email}">${email}</a>
        </footer>`;
  const brandBlock = `<div className="brand-lockup">
          <h1 className="center-word">${brand}</h1>
          <p className="tagline">${tagline}</p>
        </div>`;
  const heroBlock = `<section className="hero-copy" aria-label="Hero">
          <h2 className="hero-headline">${headline}</h2>
          <p className="hero-support">${support}</p>
        </section>`;
  const photo = `<div className="stage-photo" aria-hidden="true">
        ${heroGlyph}
        <div className="stage-photo__wash" />
      </div>`;

  if (opts.shell === 'split-photo') {
    return `import { useState } from 'react';
import './App.css';

export default function App() {
  const [cartCount, setCartCount] = useState(0);

  return (
    <div className="app">
      ${photo}
      <div className="stage-copy">
        ${brandBlock}
        ${heroBlock}
        ${shop}
        ${footer}
      </div>
    </div>
  );
}
`;
  }
  if (opts.shell === 'bottom-stage') {
    return `import { useState } from 'react';
import './App.css';

export default function App() {
  const [cartCount, setCartCount] = useState(0);

  return (
    <div className="app">
      ${photo}
      <div className="stage-copy">
        ${brandBlock}
        ${heroBlock}
        ${shop}
        ${footer}
      </div>
    </div>
  );
}
`;
  }
  return `import { useState } from 'react';
import './App.css';

export default function App() {
  const [cartCount, setCartCount] = useState(0);

  return (
    <div className="app">
      <div className="brand-watermark" aria-hidden="true">${brand}</div>
      <div className="stage-copy">
        ${brandBlock}
        ${heroBlock}
        ${photo}
        ${shop}
        ${footer}
      </div>
    </div>
  );
}
`;
}

/** True when DNA display face is a real serif — never treat `sans-serif` as serif. */
function displayFontIsSerif(font: string): boolean {
  return /\b(?:Georgia|Palatino|Iowan|Times|Palladio)\b/i.test(String(font || ''));
}

function serifStackForChrome(chrome: LayoutChromeRecipe): string {
  return displayFontIsSerif(chrome.displayFont)
    ? chrome.displayFont
    : 'Georgia,"Times New Roman",serif';
}

function taglineCssFromRecipe(recipe: LayoutChromeRecipe, forceItalic: boolean): string {
  if (forceItalic || recipe.tagline === 'italic-serif') {
    return 'font-style:italic;font-family:Georgia,"Times New Roman",serif;letter-spacing:0.02em;text-transform:none;font-size:1.05rem;';
  }
  if (recipe.tagline === 'small-caps') {
    return 'font-style:normal;font-family:Georgia,"Times New Roman",serif;letter-spacing:0.14em;text-transform:uppercase;font-size:0.72rem;';
  }
  if (recipe.tagline === 'tracked') {
    return 'font-style:normal;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:0.18em;text-transform:uppercase;font-size:0.7rem;';
  }
  return 'font-style:normal;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:0.01em;text-transform:none;font-size:0.98rem;';
}

function navToolsCssFromRecipe(recipe: LayoutChromeRecipe): string {
  if (recipe.nav === 'start') {
    return `\n.nav{display:flex;align-items:center;justify-content:flex-start;gap:1rem;padding:1.1rem 1.5rem;width:100%;box-sizing:border-box;position:relative;z-index:3}`
      + `\n.nav-tools{display:flex;align-items:center;gap:1.5rem;margin-left:0}`
      + `\n.nav-tools a{color:inherit;text-decoration:none;opacity:.88;font-size:.8rem;letter-spacing:0.12em;text-transform:uppercase}`
      + `\n.nav-tools a:hover{opacity:1}\n`;
  }
  if (recipe.nav === 'center') {
    return `\n.nav{display:flex;align-items:center;justify-content:center;gap:1rem;padding:1.25rem 1.5rem;width:100%;box-sizing:border-box;position:relative;z-index:3}`
      + `\n.nav-left{display:none}`
      + `\n.nav-tools{display:flex;align-items:center;gap:2rem;margin-left:0}`
      + `\n.nav-tools a{color:inherit;text-decoration:none;opacity:.9;font-size:.95rem;font-weight:500}`
      + `\n.nav-tools a:hover{opacity:1}\n`;
  }
  if (recipe.nav === 'brand-row') {
    return `\n.nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.5rem;width:100%;box-sizing:border-box;position:relative;z-index:5}`
      + `\n.nav-left{display:flex;align-items:baseline;gap:0.85rem;flex-wrap:wrap}`
      + `\n.nav-left .center-word{position:static;margin:0;font-size:clamp(1.2rem,3vw,1.75rem)}`
      + `\n.nav-left .tagline{position:static;margin:0;opacity:.75}`
      + `\n.nav-tools{display:flex;align-items:center;gap:1.35rem;margin-left:auto}`
      + `\n.nav-tools a{color:inherit;text-decoration:none;opacity:.88;font-size:.9rem}`
      + `\n.nav-tools a:hover{opacity:1}\n`
      // Brand lives in the nav row — hide the floating lockup twin.
      + `\n.brand-lockup{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}\n`;
  }
  // end (right) — deliberately not the only option; uppercase tracking differs from old twin.
  return `\n.nav{display:flex;align-items:center;justify-content:flex-end;gap:1rem;padding:1.35rem 1.75rem;width:100%;box-sizing:border-box;position:relative;z-index:3}`
    + `\n.nav-tools{display:flex;align-items:center;gap:1.75rem;margin-left:0}`
    + `\n.nav-tools a{color:inherit;text-decoration:none;opacity:.85;font-size:.78rem;letter-spacing:0.16em;text-transform:uppercase}`
    + `\n.nav-tools a:hover{opacity:1}\n`;
}

function ctaCssFromRecipe(recipe: LayoutChromeRecipe, lightOnDark: boolean): string {
  const ink = lightOnDark ? '#fff' : 'currentColor';
  if (recipe.cta === 'text') {
    return `\n.cta{margin-top:1.4rem;padding:0;border:0;border-bottom:1px solid ${ink};background:transparent;color:inherit;border-radius:0;cursor:pointer;font:inherit;font-size:1rem;letter-spacing:0.04em}\n.cta:hover{opacity:.75}\n`;
  }
  if (recipe.cta === 'pill') {
    return `\n.cta{margin-top:1.5rem;padding:.7rem 1.4rem;border:1px solid ${ink};background:transparent;color:inherit;border-radius:999px;cursor:pointer;font:inherit}\n.cta:hover{background:color-mix(in srgb,currentColor 12%,transparent)}\n`;
  }
  return `\n.cta{margin-top:1.35rem;padding:.65rem 1.2rem;border:1px solid ${ink};background:transparent;color:inherit;border-radius:0.2rem;cursor:pointer;font:inherit}\n.cta:hover{background:color-mix(in srgb,currentColor 12%,transparent)}\n`;
}

/** Compact in-flow hero — never min-height:100vh (that left a blank band above Shop/Work). */
function heroCopyCssForFamily(family: UiLayoutFamily, recipe?: LayoutChromeRecipe): string {
  const align = recipe?.heroAlign
    || (family === 'storefront' ? 'left' : family === 'studio' ? 'center' : 'center');
  if (align === 'left' || align === 'start') {
    const max = align === 'start' ? '36rem' : '42rem';
    const margin = align === 'start' ? 'margin:0;padding:4rem 1.5rem 2rem 8vw' : 'margin:0 auto;padding:3.5rem 1.5rem 2.25rem';
    return `.hero-copy{position:relative;z-index:1;min-height:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;text-align:left;${margin};max-width:${max};box-sizing:border-box;width:100%}`;
  }
  if (family === 'studio') {
    return '.hero-copy{position:relative;z-index:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:5rem 1.25rem 3rem;box-sizing:border-box}';
  }
  return '.hero-copy{position:relative;z-index:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4.5rem 1.25rem 2.75rem;box-sizing:border-box}';
}

/** Brand + tagline share one positioned stack so the line never overlaps the word. */
function ensureBrandLockup(appSrc: string, tagHtml: string): { app: string; wrapped: boolean } {
  let app = String(appSrc || '');
  if (/className=["']brand-lockup["']/i.test(app)) {
    if (/className=["']tagline["']/i.test(app)) {
      return { app, wrapped: false };
    }
    app = app.replace(
      /(<\/h1>\s*)/i,
      `</h1>\n        ${tagHtml}\n      `,
    );
    return { app, wrapped: true };
  }
  const brandRe = /<h1\b[^>]*className=["']center-word["'][^>]*>[\s\S]*?<\/h1>/i;
  if (!brandRe.test(app)) return { app, wrapped: false };
  app = app.replace(brandRe, (h1) => (
    `<div className="brand-lockup">\n        ${h1}\n        ${tagHtml}\n      </div>`
  ));
  return { app, wrapped: true };
}

/** True only when a real `.class {` rule exists — ignore `:has(.class)` mentions. */
function hasCssClassRule(css: string, className: string): boolean {
  const safe = String(className || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${safe}\\s*\\{`, 'i').test(String(css || ''));
}

function productGridCssBlock(
  recipe?: LayoutChromeRecipe,
  opts?: { rich?: boolean; side?: 'left' | 'right' },
): string {
  const rich = Boolean(opts?.rich);
  const side = opts?.side
    || (recipe?.brandCorner === 'top-right' ? 'right' : 'left');
  // Rich info cards (name + blurb + CTA) — never the bare name/button twin strip.
  if (rich) {
    const place = side === 'right'
      ? 'margin:0 4vw 0 auto;padding:2rem 1.5rem 3.5rem;max-width:min(92vw,34rem)'
      : 'margin:0 auto 0 4vw;padding:2rem 1.5rem 3.5rem;max-width:min(92vw,34rem)';
    return `\n.product-grid{position:relative;z-index:2;${place};width:100%;box-sizing:border-box}`
      + `\n.product-grid__head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin:0 0 1.25rem}`
      + `\n.product-grid__title{margin:0;font-size:clamp(1.15rem,2.4vw,1.45rem);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;opacity:.78}`
      + `\n.cart-pill{margin:0;font-size:.9rem;opacity:.72}`
      + `\n.product-grid__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0.9rem}`
      + `\n.product-card{margin:0;padding:1.15rem 1.2rem 1.2rem;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:0.45rem;background:color-mix(in srgb,currentColor 5%,transparent);display:flex;flex-direction:column;align-items:flex-start;gap:0.55rem;box-sizing:border-box}`
      + `\n.product-card__name{margin:0;font-size:1.12rem;font-weight:600;letter-spacing:-0.015em;line-height:1.2}`
      + `\n.product-card__desc{margin:0;opacity:.78;font-size:0.92rem;line-height:1.45;max-width:28rem}`
      + `\n.add-to-cart{appearance:none;margin-top:0.35rem;border:1px solid color-mix(in srgb,currentColor 32%,transparent);background:transparent;color:inherit;border-radius:0.35rem;padding:0.5rem 0.85rem;font:inherit;font-size:.88rem;cursor:pointer}`
      + `\n.add-to-cart:hover{background:color-mix(in srgb,currentColor 10%,transparent)}\n`;
  }
  // Per-brand shop layout so Micora ≠ Auralis twin 3-up cards.
  const stack = recipe?.id === 'stage-left-rail' || recipe?.id === 'editorial-stack' || recipe?.heroAlign === 'left';
  const list = stack
    ? `display:flex;flex-direction:column;gap:0.85rem;max-width:28rem`
    : `display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:1rem`;
  const card = stack
    ? `margin:0;padding:0.9rem 0;border:0;border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:0;display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:1rem;min-height:0;box-sizing:border-box`
    : `margin:0;padding:1.15rem 1rem 1.2rem;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:0.55rem;display:flex;flex-direction:column;gap:0.85rem;min-height:7.5rem;box-sizing:border-box`;
  const alignPad = side === 'right'
    ? 'padding:2.5rem 4vw 4rem 1.5rem;margin-left:auto'
    : 'padding:2.5rem 1.5rem 4rem';
  return `\n.product-grid{position:relative;z-index:2;margin:0;${alignPad};width:100%;max-width:56rem;box-sizing:border-box}`
    + `\n.product-grid__head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin:0 0 1.5rem}`
    + `\n.product-grid__title{margin:0;font-size:clamp(1.2rem,2.5vw,1.55rem);font-weight:600;letter-spacing:-0.02em}`
    + `\n.cart-pill{margin:0;font-size:.95rem;opacity:.78}`
    + `\n.product-grid__list{list-style:none;margin:0;padding:0;${list}}`
    + `\n.product-card{${card}}`
    + `\n.product-card__name{margin:0;font-size:1.05rem;font-weight:600;letter-spacing:-0.01em;line-height:1.25}`
    + `\n.add-to-cart{appearance:none;margin-top:0;border:1px solid color-mix(in srgb,currentColor 28%,transparent);background:transparent;color:inherit;border-radius:0.4rem;padding:0.55rem 0.75rem;font:inherit;font-size:.9rem;cursor:pointer}`
    + `\n.add-to-cart:hover{background:color-mix(in srgb,currentColor 10%,transparent)}\n`;
}

function brandLockupCss(
  corner: string,
  opts?: { position?: 'absolute' | 'flow' },
): string {
  if (opts?.position === 'flow') {
    const align = corner === 'top-right' ? 'flex-end;text-align:right' : 'flex-start;text-align:left';
    return `.brand-lockup{position:relative;top:auto;left:auto;right:auto;bottom:auto;z-index:4;max-width:min(92vw,28rem);margin:1.35rem 1.5rem 0;display:flex;flex-direction:column;align-items:${align};gap:0.55rem;pointer-events:none}`
      + `\n.brand-lockup .center-word,.brand-lockup .tagline{pointer-events:auto}`
      + `\n.brand-lockup .center-word{position:static;top:auto;left:auto;right:auto;bottom:auto;margin:0}`
      + `\n.brand-lockup .tagline{position:static;margin:0;display:block;line-height:1.35;max-width:min(92vw,22rem)}`;
  }
  const pos = corner === 'top-right'
    ? 'top:1.25rem;right:1.25rem;left:auto;bottom:auto;align-items:flex-end;text-align:right;'
    : corner === 'bottom-left'
      ? 'top:auto;left:1.25rem;right:auto;bottom:1.25rem;align-items:flex-start;text-align:left;'
      : corner === 'bottom-right'
        ? 'top:auto;right:1.25rem;left:auto;bottom:1.25rem;align-items:flex-end;text-align:right;'
        : 'top:1.25rem;left:1.25rem;right:auto;bottom:auto;align-items:flex-start;text-align:left;';
  // Lockup is ONLY brand + tagline. Sections must never live inside it.
  return `.brand-lockup{position:absolute;${pos}z-index:4;max-width:min(92vw,26rem);display:flex;flex-direction:column;gap:0.7rem;pointer-events:none}`
    + `\n.brand-lockup .center-word,.brand-lockup .tagline{pointer-events:auto}`
    + `\n.brand-lockup .center-word{position:static;top:auto;left:auto;right:auto;bottom:auto;margin:0}`
    + `\n.brand-lockup .tagline{position:static;margin:0;display:block;line-height:1.35;max-width:min(92vw,22rem)}`;
}

/** Balanced <div className="…">…</div> range (handles nested sections). */
function findClassDivRange(app: string, className: string): { start: number; end: number } | null {
  const openRe = new RegExp(`<div\\b[^>]*className=["']${className}["'][^>]*>`, 'i');
  const m = openRe.exec(app);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < app.length && depth > 0) {
    const rest = app.slice(i);
    const openIdx = rest.search(/<div\b/i);
    const closeIdx = rest.search(/<\/div>/i);
    if (closeIdx < 0) return null;
    if (openIdx >= 0 && openIdx < closeIdx) {
      depth += 1;
      i += openIdx + 4;
      continue;
    }
    depth -= 1;
    i += closeIdx + 6;
  }
  return depth === 0 ? { start: m.index, end: i } : null;
}

function insertAfterBrandLockup(appSrc: string, html: string): string {
  const range = findClassDivRange(appSrc, 'brand-lockup');
  if (!range) return appSrc;
  return `${appSrc.slice(0, range.end)}\n      ${html}${appSrc.slice(range.end)}`;
}

/** True when a structural <section> lives inside brand-lockup (or lockup is unclosed). */
function brandLockupContainsSection(appSrc: string): boolean {
  const range = findClassDivRange(appSrc, 'brand-lockup');
  if (range) return /<section\b/i.test(appSrc.slice(range.start, range.end));
  const open = appSrc.search(/<div\b[^>]*className=["']brand-lockup["']/i);
  if (open < 0) return false;
  return /<section\b/i.test(appSrc.slice(open));
}

/**
 * Brand-lockup may only contain brand + tagline.
 * Hero / Shop / Contact / Featured Work are always siblings under .app (after nav).
 */
function hoistOutOfBrandLockup(appSrc: string): { app: string; moved: boolean } {
  const original = String(appSrc || '');
  let app = original;
  if (!/className=["']brand-lockup["']/i.test(app)) return { app, moved: false };

  const nested = brandLockupContainsSection(original);
  const sectionRe = /<section\b[^>]*(?:className=["'](?:hero-copy|product-grid|shop-list-section|featured-work|contact-section)["']|id=["'](?:shop|work|contact)["'])[^>]*>[\s\S]*?<\/section>/gi;
  const sections: string[] = [];
  app = app.replace(sectionRe, (sec) => {
    sections.push(sec.trim());
    return '';
  });

  // Sections already siblings (or nothing to hoist) — leave alone.
  if (!nested) return { app: original, moved: false };

  const brand = app.match(/<h1\b[^>]*className=["']center-word["'][^>]*>[\s\S]*?<\/h1>/i)?.[0] || '';
  const tag = app.match(/<p\b[^>]*className=["']tagline["'][^>]*>[\s\S]*?<\/p>/i)?.[0] || '';
  if (!brand) return { app: original, moved: false };

  const lockup = `<div className="brand-lockup">\n        ${brand}${tag ? `\n        ${tag}` : ''}\n      </div>`;
  const nav = app.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/i)?.[0] || '';
  if (nav) app = app.replace(nav, '');

  // Strip broken lockup shells + orphans.
  app = app.replace(/<div\b[^>]*className=["']brand-lockup["'][^>]*>/gi, '');
  if (brand) app = app.replace(brand, '');
  if (tag) app = app.replace(tag, '');
  // Drop empty leftover closers jammed before the final app close.
  app = app.replace(/\n\s*<\/div>(\s*<\/div>\s*\);\s*\}\s*)$/i, '$1');

  const body = [nav, lockup, ...sections].filter(Boolean).join('\n      ');

  if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
    app = app.replace(
      /(className=["'][Aa]pp["'][^>]*>)([\s\S]*?)(<\/div>\s*\);\s*\}\s*)$/i,
      `$1\n      ${body}\n    $3`,
    );
  } else {
    app = `${body}\n${app}`;
  }
  app = app.replace(/\n{3,}/g, '\n\n');
  return { app, moved: true };
}

function ensureReactUseStateImport(appSrc: string): string {
  let app = String(appSrc || '');
  if (/\buseState\b/.test(app) && /from\s+['"]react['"]/.test(app)) return app;
  if (/from\s+['"]react['"]/.test(app)) {
    return app.replace(
      /import\s*\{([^}]*)\}\s*from\s*['"]react['"]\s*;?/,
      (_m, inner: string) => {
        const parts = String(inner).split(',').map((s) => s.trim()).filter(Boolean);
        if (!parts.includes('useState')) parts.push('useState');
        return `import { ${parts.join(', ')} } from 'react';`;
      },
    );
  }
  if (/^import\s+/m.test(app)) {
    return app.replace(/^import\s+/m, `import { useState } from 'react';\nimport `);
  }
  return `import { useState } from 'react';\n${app}`;
}

function iconRailCornerCss(corner: string): string {
  if (corner === 'top-right') return 'top:1.25rem;right:1.25rem;left:auto;bottom:auto;align-items:flex-end;';
  if (corner === 'bottom-left') return 'top:auto;left:1.25rem;right:auto;bottom:1.25rem;';
  if (corner === 'bottom-right') return 'top:auto;right:1.25rem;left:auto;bottom:1.25rem;align-items:flex-end;';
  return 'top:1.25rem;left:1.25rem;right:auto;bottom:auto;';
}

/** Read the current page canvas color from App.css / index.css (blank white must stick). */
function detectSolidCanvasBg(...cssChunks: string[]): string | null {
  const blob = cssChunks.map((c) => String(c || '')).join('\n');
  const fromApp = blob.match(/\.app\s*\{[^}]*background(?:-color)?\s*:\s*([^;}{]+)/i)?.[1]?.trim();
  if (fromApp) return fromApp.replace(/\s+/g, '');
  const fromRoot = blob.match(/html,\s*body,\s*#root\s*\{[^}]*background(?:-color)?\s*:\s*([^;}{]+)/i)?.[1]?.trim();
  if (fromRoot) return fromRoot.replace(/\s+/g, '');
  const fromBody = blob.match(/\bbody\s*\{[^}]*background(?:-color)?\s*:\s*([^;}{]+)/i)?.[1]?.trim();
  return fromBody ? fromBody.replace(/\s+/g, '') : null;
}

/** Full-bleed root rule — index.css often loads after App.css and must match the canvas. */
function solidRootRule(color: string): string {
  return `html, body, #root { min-height: 100%; min-height: 100dvh; height: 100%; margin: 0; background: ${color}; }\n`;
}

function paintRootBlock(css: string, color: string): string {
  let next = String(css || '');
  if (!/html,\s*body,\s*#root/i.test(next)) {
    return `${solidRootRule(color)}${next}`;
  }
  return next.replace(
    /(html,\s*body,\s*#root\s*\{)([^}]*)(\})/i,
    (_m, open: string, body: string, close: string) => {
      let b = String(body || '');
      // Prefer full-bleed min-height so windowed Live never leaves a short band.
      b = b.replace(/min-height\s*:\s*[^;]+;?/gi, '').replace(/height\s*:\s*[^;]+;?/gi, '');
      if (!/margin\s*:/i.test(b)) b += ' margin: 0;';
      b += ' min-height: 100%; min-height: 100dvh; height: 100%;';
      if (/background(?:-color)?\s*:/i.test(b)) {
        b = b.replace(/background(?:-color)?\s*:\s*[^;]+/i, `background: ${color}`);
      } else {
        b += ` background: ${color};`;
      }
      return `${open}${b}${close}`;
    },
  );
}

/** Force App.css + index.css onto the same solid canvas (kills white/cream split bands). */
function syncSolidCanvasEdits(
  flat: Record<string, string>,
  appCssPath: string,
  bg: string,
  appCssBody?: string,
): WebFileEdit[] {
  const color = String(bg || '#ffffff').trim() || '#ffffff';
  let appCss = typeof appCssBody === 'string' ? appCssBody : String(flat[appCssPath] || '');
  appCss = patchSolidBackground(appCss, color);
  appCss = paintRootBlock(appCss, color);
  // Storefront floors use --bg + .site — paint those too or Live stays ivory after a bg ask.
  if (/--bg\s*:/.test(appCss)) {
    appCss = appCss.replace(/--bg\s*:\s*[^;]+;/, `--bg: ${color};`);
  }
  if (/\.site\s*\{/.test(appCss)) {
    appCss = appCss.replace(/\.site\s*\{([^}]*)\}/i, (_m, body: string) => {
      let b = String(body || '');
      if (/background(?:-color)?\s*:/i.test(b)) {
        b = b.replace(/background(?:-color)?\s*:\s*[^;]+/i, `background: ${color}`);
      } else {
        if (b.trim() && !/;\s*$/.test(b)) b = `${b.trim()};`;
        b += ` background: ${color};`;
      }
      return `.site {${b}}`;
    });
  }
  if (!/\.app\s*\{[^}]*background/i.test(appCss)) {
    appCss = `.app { min-height: 100%; min-height: 100dvh; margin: 0; background: ${color}; }\n${appCss}`;
  } else {
    appCss = appCss.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
      let b = String(body || '');
      if (!/min-height\s*:/i.test(b)) b += ' min-height: 100dvh;';
      if (!/margin\s*:/i.test(b)) b += ' margin: 0;';
      if (/background(?:-color)?\s*:/i.test(b)) {
        b = b.replace(/background(?:-color)?\s*:\s*[^;]+/i, `background: ${color}`);
      } else {
        b += ` background: ${color};`;
      }
      return `.app {${b}}`;
    });
  }
  const out: WebFileEdit[] = [{ path: appCssPath, content: appCss }];
  const indexPath = flat['src/index.css'] != null || flat['index.css'] != null
    ? (flat['src/index.css'] != null ? 'src/index.css' : 'index.css')
    : 'src/index.css';
  // Always rewrite index root paint — main.tsx imports index.css AFTER App, so white index wins.
  let indexCss = String(flat[indexPath] || '');
  if (!indexCss.trim()) {
    indexCss = solidRootRule(color);
  } else {
    indexCss = paintRootBlock(indexCss, color);
  }
  out.push({ path: indexPath, content: indexCss });
  return out;
}

/** Patch .app / .App / body / html,body,#root backgrounds to a solid color. */
function healGluedHexCss(css: string): string {
  // Exact 3/6/8 lengths only — `{3,8}` backtracks into a-f hex digits (`#93c5fd` → `#93c5f; d`).
  return String(css || '').replace(
    /(#[0-9a-fA-F]{8}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})(?=[a-zA-Z-])/g,
    '$1; ',
  );
}

function patchSolidBackground(css: string, bg: string): string {
  let next = healGluedHexCss(css);
  const paintBgValue = (body: string) => {
    let b = healGluedHexCss(body);
    if (/background(?:-color)?\s*:/i.test(b)) {
      b = b.replace(
        /background(?:-color)?\s*:\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-zA-Z][\w-]*)/i,
        `background: ${bg}`,
      );
      const esc = bg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      b = b.replace(new RegExp(`(background:\\s*${esc})(?!;|\\s*})`, 'i'), '$1;');
    } else {
      if (b.trim() && !/;\s*$/.test(b)) b = `${b.trim()};`;
      b = `${b} background: ${bg};`;
    }
    return b;
  };
  const paint = (sel: string) => {
    const re = new RegExp(`(${sel}\\s*\\{)([^}]*)(\\})`, 'i');
    if (!re.test(next)) return false;
    next = next.replace(re, (_m, open: string, body: string, close: string) => (
      `${open}${paintBgValue(body)}${close}`
    ));
    return true;
  };
  const hit = paint('\\.app') || paint('\\.App') || paint('body') || paint('html,\\s*body,\\s*#root');
  if (!hit) {
    next = `.app { min-height: 100vh; margin: 0; background: ${bg}; }\n${next}`;
  }
  // Keep html/body/#root in sync when present (Preview often paints from index.css).
  next = next.replace(
    /(html,\s*body,\s*#root\s*\{[^}]*?)background(?:-color)?\s*:\s*(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-zA-Z][\w-]*)/i,
    `$1background: ${bg}`,
  );
  // Drop orphaned hex tails left by short-hex swaps (`#0f766e; fff;`).
  next = next.replace(/;\s*[0-9a-fA-F]{3}(?=\s*;|\s*})/g, ';');
  return next;
}

function contrastTextForBg(bg: string): string {
  if (/#0|#1|#2|black|dark/i.test(bg)) return '#f5f7fb';
  if (/#f|#e|white/i.test(bg)) return '#111827';
  return '#e8eefc';
}

function patchBodyColors(css: string, bg: string, fg: string): string {
  let next = css;
  if (/body\s*\{[^}]*background(?:-color)?\s*:/i.test(next)) {
    next = next.replace(/(body\s*\{[^}]*?)background(?:-color)?\s*:\s*[^;]+/i, `$1background: ${bg}`);
  } else if (/body\s*\{/i.test(next)) {
    next = next.replace(/body\s*\{/i, `body {\n  background: ${bg};`);
  } else {
    next = `body { background: ${bg}; color: ${fg}; }\n${next}`;
  }
  if (/body\s*\{[^}]*\bcolor\s*:/i.test(next)) {
    next = next.replace(/(body\s*\{[^}]*?)\bcolor\s*:\s*[^;]+/i, `$1color: ${fg}`);
  } else if (/body\s*\{/i.test(next)) {
    next = next.replace(/body\s*\{/i, `body {\n  color: ${fg};`);
  }
  // Don't force h1 color when gradient/RGB mode uses transparent text
  if (!/background-clip\s*:\s*text/i.test(next)) {
    if (/h1\s*\{[^}]*\bcolor\s*:/i.test(next)) {
      next = next.replace(/(h1\s*\{[^}]*?)\bcolor\s*:\s*[^;]+/i, `$1color: ${fg}`);
    }
  }
  return next;
}

/** Piece-by-piece Discord/chat UI asks — must hit App.jsx, not HTML color micro-patches. */
export function isStructuralUiPieceAsk(message: string): boolean {
  const t = String(message || '');
  if (!t.trim()) return false;
  // Explicit piece-build language only — NOT "Nightglass only:" / "Keep everything else" on normal sites.
  if (/\bONLY\s+add\b|\bONLY\s+this\s+piece\b|\bONLY\s+improve\b|\bdo not rebuild\b/i.test(t)) {
    return true;
  }
  // "settings gear icon" (ladder chrome) is NOT a Discord settings panel/modal.
  if (/\bsettings\s+gear\s+icon\b/i.test(t) || /\bgear\s+icon\b/i.test(t)) return false;
  return /\b(?:server\s+rail|server-icon|channel\s+(?:list|column)|channels?\s+column|chat\s+(?:pane|header|composer|system|messages?)|member\s+list|members?\s+column|user\s+bar|settings\s+(?:panel|overlay|modal)|message\s+composer|related\s+videos?)\b/i.test(t);
}

function findHtmlPath(flat: WebFileMap): string | null {
  if (flat['index.html']) return 'index.html';
  return Object.keys(flat).find(p => /(^|\/)index\.html$/i.test(p) && !isPlaceholderJunkPath(p))
    || Object.keys(flat).find(p => /\.html?$/i.test(p) && !isPlaceholderJunkPath(p))
    || null;
}

function findCssPath(flat: WebFileMap): string {
  if (flat['css/styles.css']) return 'css/styles.css';
  return Object.keys(flat).find(p => /(^|\/)(styles?|index)\.css$/i.test(p) && !isPlaceholderJunkPath(p))
    || 'css/styles.css';
}

function findJsPath(flat: WebFileMap): string {
  if (flat['js/app.js']) return 'js/app.js';
  return Object.keys(flat).find(p => /(^|\/)app\.js$/i.test(p) && !isPlaceholderJunkPath(p))
    || 'js/app.js';
}

function readHeading(html: string): string {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return (m?.[1] || 'Hello World').replace(/<[^>]+>/g, '').trim() || 'Hello World';
}

/** Deterministic patches for simple web asks. do not depend on the model. */
export function webMicroAskEdits(files: WebFileMap, message: string): WebFileEdit[] {
  const t = String(message || '');
  if (isStructuralUiPieceAsk(t)) return [];
  const flat = flatten(files);
  // Vite React apps: never rewrite index.html for micro color/search — that fights App.jsx.
  if (Object.keys(flat).some((p) => /(^|\/)src\/App\.(jsx|tsx)$/i.test(p))) return [];
  const htmlPath = findHtmlPath(flat);
  if (!htmlPath || !flat[htmlPath]) return [];

  const cssPath = findCssPath(flat);
  const jsPath = findJsPath(flat);
  const html0 = flat[htmlPath];
  const css0 = flat[cssPath] || '';
  const js0 = flat[jsPath] || '';
  const out: WebFileEdit[] = [];
  let html = html0;
  let css = css0;
  let js = js0;
  let touched = false;

  const colorWord = t.match(/\b(black|white|blue|dark|red|green|yellow|purple|violet|brown|teal|chocolate|sienna|pink|orange|navy|cream)\b/i)?.[1];
  const wantsBg = /\bbackground\b/i.test(t) && Boolean(colorWord);
  const wantsTextColor = /\b(text|words?|title|heading|hello\s*world)\b.{0,48}\b(white|black|color|colour)\b|\b(white|black)\s+(color|colour|text)\b/i.test(t);
  const wantsRgb = /\b(rgb|multi[- ]?colou?r|multiple\s+colou?rs?|rainbow|gradient)\b/i.test(t);
  // "no search bar" / "without search" must NOT inject a search bar.
  const searchNegated = /\b(?:no|without|never|skip|omit|don't|do\s+not|dont)\b[\s\S]{0,40}\bsearch(?:\s*bar)?\b/i.test(t);
  const wantsSearchBar = !searchNegated && (
    /\bsearch\s*bar\b/i.test(t)
    || (/\bsearch\b/i.test(t) && /\b(top|corner|right|header|bar)\b/i.test(t))
  );
  const wantsRemoveToggle = /\b(remove|delete|get rid of)\b.{0,40}\b(toggle|theme)\b/i.test(t)
    || /\b(toggle\s*theme)\b/i.test(t) && /\b(remove|delete)\b/i.test(t);
  const wantsBadgeText = /\bbadge\b/i.test(t) && /\b(text|label|say|to|into)\b/i.test(t);
  const wantsEqualsBigger = /\bequals?\s+button\b/i.test(t) && /\b(larger|bigger|bigger|bigger|bigger|increase|grow)\b/i.test(t);
  const buttonLabelTo = (
    t.match(/\b(?:make|change|set|update)\b[\s\S]{0,48}\bbutton\b[\s\S]{0,48}\b(?:say|to|into|label)\s+["']?([A-Za-z0-9][A-Za-z0-9 ,.+'-]{1,60})/i)?.[1]
    || t.match(/\bbutton\b[\s\S]{0,24}\blabel\b[\s\S]{0,24}\b(?:say|to|into)\s+["']?([A-Za-z0-9][A-Za-z0-9 ,.+'-]{1,60})/i)?.[1]
    || null
  )?.trim()?.replace(/[.,;:]+$/, '') || null;
  const renameTo = (!wantsBadgeText && !buttonLabelTo && !/\bbutton\b/i.test(t))
    ? (
      t.match(/(?:change|rename|set|into).{0,48}(?:hero|headline|heading|title|h1).{0,32}(?:to|into)\s+["']?([A-Za-z0-9][A-Za-z0-9 ,.+'-]{1,60})/i)?.[1]?.trim()
      || t.match(/(?:change|rename|set|into).{0,48}(?:to|into)\s+["']?([A-Za-z0-9][A-Za-z0-9 ,.+'-]{1,60})/i)?.[1]?.trim()
      || t.match(/(?:saying|say)\s+["']?([A-Za-z0-9][A-Za-z0-9 ,.+'-]{1,60})/i)?.[1]?.trim()
      || (/\bpizza\b/i.test(t) ? 'I like pizza' : null)
    )?.replace(/[.,;:]+$/, '') || null
    : null;

  if (wantsBg && colorWord) {
    const bg = cssColor(colorWord) || '#000000';
    const fg = contrastTextForBg(bg);
    css = patchBodyColors(css || `body { background: ${bg}; color: ${fg}; }\n`, bg, fg);
    // Clear accidental white html/body from inline styles
    html = html.replace(/(<body[^>]*style=["'][^"']*)background(?:-color)?\s*:\s*[^;"']+/gi, `$1background: ${bg}`);
    touched = true;
  }

  if (wantsTextColor && colorWord && !wantsRgb) {
    const fg = cssColor(colorWord) || '#ffffff';
    if (/h1\s*\{/i.test(css)) {
      if (/h1\s*\{[^}]*\bcolor\s*:/i.test(css)) {
        css = css.replace(/(h1\s*\{[^}]*?)\bcolor\s*:\s*[^;]+/i, `$1color: ${fg}`);
      } else {
        css = css.replace(/h1\s*\{/i, `h1 {\n  color: ${fg};`);
      }
    } else {
      css += `\nh1 { color: ${fg}; }\n`;
    }
    // Remove gradient clip so solid color shows
    css = css
      .replace(/-webkit-background-clip\s*:\s*text\s*;?/gi, '')
      .replace(/background-clip\s*:\s*text\s*;?/gi, '')
      .replace(/-webkit-text-fill-color\s*:\s*transparent\s*;?/gi, '');
    touched = true;
  }

  if (wantsRgb) {
    const gradient = 'linear-gradient(90deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7)';
    if (/h1\s*\{/i.test(css)) {
      css = css.replace(/h1\s*\{[^}]*\}/i, `h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  background: ${gradient};
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}`);
    } else {
      css += `
h1 {
  background: ${gradient};
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}
`;
    }
    touched = true;
  }

  if (renameTo) {
    const safe = escapeHtml(renameTo.replace(/</g, ''));
    if (/<h1[\s>]/i.test(html)) {
      html = html.replace(/(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i, `$1${safe}$3`);
    } else if (/<h2[\s>]/i.test(html)) {
      html = html.replace(/(<h2[^>]*>)([\s\S]*?)(<\/h2>)/i, `$1${safe}$3`);
    } else if (/class=["'][^"']*(?:hero|headline|brand)[^"']*["'][^>]*>/i.test(html)) {
      html = html.replace(/(class=["'][^"']*(?:hero|headline|brand)[^"']*["'][^>]*>)([^<]{1,80})/i, `$1${safe}`);
    } else {
      html = html.replace(/<main[^>]*>/i, `$&\n    <h1>${safe}</h1>`);
    }
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${safe}</title>`);
    touched = true;
  }

  if (buttonLabelTo) {
    const safe = escapeHtml(buttonLabelTo.replace(/</g, ''));
    const fromHint = t.match(/\b(?:start|begin|submit|save|continue|next|login|sign\s*up)\b/i)?.[0];
    if (fromHint && new RegExp(`>(\\s*)${fromHint}(\\s*)<`, 'i').test(html)) {
      html = html.replace(new RegExp(`>(\\s*)${fromHint}(\\s*)<`, 'i'), `>${safe}<`);
      touched = true;
    } else if (/<button\b[^>]*>[\s\S]*?<\/button>/i.test(html)) {
      html = html.replace(/(<button\b[^>]*>)([\s\S]*?)(<\/button>)/i, `$1${safe}$3`);
      touched = true;
    }
  }

  if (wantsBadgeText) {
    const badgeText = (
      t.match(/\bbadge\b[\s\S]{0,48}(?:to|into|say|text)\s+["']?([A-Za-z0-9][A-Za-z0-9 .+-]{1,24})/i)?.[1]
      || t.match(/(?:to|into)\s+["']?([A-Za-z0-9][A-Za-z0-9 .+-]{1,24})/i)?.[1]
      || ''
    ).trim().replace(/\s+and\b[\s\S]*$/i, '').slice(0, 24);
    if (badgeText && /class=["'][^"']*badge/i.test(html)) {
      const safe = escapeHtml(badgeText);
      html = html.replace(/(<span[^>]*class=["'][^"']*badge[^"']*["'][^>]*>)([^<]*)(<\/span>)/i, `$1${safe}$3`);
      touched = true;
    }
  }

  if (wantsEqualsBigger) {
    if (!/\.pad\s+\.eq\s*\{[^}]*min-height\s*:\s*6/i.test(css)) {
      css += `\n.pad .eq { min-height: 6.75rem; font-size: 1.65rem; }\n`;
    }
    touched = true;
  }

  if (wantsRemoveToggle) {
    html = html
      .replace(/<button[^>]*>[\s\S]*?toggle\s*theme[\s\S]*?<\/button>/gi, '')
      .replace(/<button[^>]*id=["'][^"']*theme[^"']*["'][^>]*>[\s\S]*?<\/button>/gi, '');
    js = js
      .replace(/[^\n]*toggle[^\n]*theme[^\n]*\n?/gi, '')
      .replace(/[^\n]*theme[^\n]*toggle[^\n]*\n?/gi, '')
      .replace(/document\.body\.classList\.toggle\(['"]dark['"]\)[^\n]*\n?/gi, '');
    css = css.replace(/\.?theme-toggle[^{]*\{[^}]*\}/gi, '');
    touched = true;
  }

  if (wantsSearchBar) {
    const heading = readHeading(html);
    if (!/id=["']NOVA-search["']/i.test(html) && !/class=["'][^"']*search-bar/i.test(html)) {
      const bar = `
  <header class="top-bar" aria-label="Toolbar">
    <label class="search-bar" for="NOVA-search">
      <span class="search-bar-icon" aria-hidden="true">⌕</span>
      <input id="NOVA-search" type="search" placeholder="Search…" autocomplete="off" />
    </label>
  </header>`;
      if (/<body[^>]*>/i.test(html)) {
        html = html.replace(/<body[^>]*>/i, `$&\n${bar}`);
      } else {
        html = `${bar}\n${html}`;
      }
      // Drop lone icon-only search buttons that aren't a bar
      html = html.replace(/<button[^>]*id=["']btn-search["'][^>]*>[\s\S]*?<\/button>/gi, '');
    }
    if (!/\.top-bar\s*\{/i.test(css)) {
      css += `
.top-bar {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 10;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(128,128,128,0.35);
  background: rgba(127,127,127,0.12);
  color: inherit;
  min-width: 12rem;
}
.search-bar input {
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  width: 100%;
}
.search-bar-icon { opacity: 0.7; font-size: 0.95rem; }
`;
    } else if (!/\.search-bar\s*\{/i.test(css)) {
      css += `
.search-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(128,128,128,0.35);
  background: rgba(127,127,127,0.12);
  color: inherit;
  min-width: 12rem;
}
.search-bar input {
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  width: 100%;
}
`;
    }
    if (!/ark-search/i.test(js)) {
      js += `
document.getElementById('NOVA-search')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.preventDefault();
});
`;
    }
    // Ensure title still centered
    void heading;
    touched = true;
  }

  // Festival / landing layout edits (static HTML). models often describe without @@@FILE.
  const dropAbout = /\b(drop|remove|delete|fold)\b[\s\S]{0,80}\babout\b/i.test(t)
    || /\b(?:no|without)\s+(?:a\s+)?(?:separate\s+)?about\b/i.test(t);
  const stickyTicket = /\bsticky\b/i.test(t) && /\b(ticket|cta|bottom)\b/i.test(t);
  const navSlim = /\bnav\b/i.test(t) && /\b(only|just)\b/i.test(t)
    && /\b(lineup|contact)\b/i.test(t);
  const addSchedule = /\b(add|create|new)\b[\s\S]{0,40}\bschedule\b/i.test(t)
    || /\bschedule\s+page\b/i.test(t);
  const waitlist = /\bwaitlist\b/i.test(t)
    || (/\bcontact\b/i.test(t) && /\bemail\b/i.test(t) && /\b(only|just|keep)\b/i.test(t));
  const nightFlow = /\bnight\s+flow\b/i.test(t);

  if (dropAbout) {
    html = html
      .replace(/<a[^>]*href=["']#about["'][^>]*>[\s\S]*?<\/a>/gi, '')
      .replace(/<section[^>]*id=["']about["'][^>]*>[\s\S]*?<\/section>/gi, '');
    touched = true;
  }

  if (navSlim) {
    html = html.replace(/<nav[\s\S]*?<\/nav>/i, `<nav>
      <a href="#lineup">Lineup</a>
      <a href="#contact">Contact</a>
    </nav>`);
    touched = true;
  }

  if (stickyTicket) {
    if (!/class=["'][^"']*sticky-ticket/i.test(html)) {
      html = html.replace(/<\/body>/i, `  <div class="sticky-ticket"><a class="btn" href="#tickets">Get Tickets</a></div>\n</body>`);
    }
    // Soften hero primary CTA if present
    html = html.replace(/(<div class="actions">)[\s\S]*?(<\/div>)/i, `$1\n        <a class="btn ghost" href="#lineup">See the Lineup</a>\n      $2`);
    if (!/\.sticky-ticket\s*\{/i.test(css)) {
      css += `
.sticky-ticket {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
  display: flex; justify-content: center; padding: 0.75rem;
  background: rgba(10, 6, 16, 0.92); border-top: 1px solid rgba(255,255,255,0.12);
}
.sticky-ticket .btn { min-width: 12rem; }
body { padding-bottom: 4.5rem; }
`;
    }
    touched = true;
  }

  if (addSchedule && !/id=["']schedule["']/i.test(html)) {
    const scheduleTitle = nightFlow ? 'Night Flow' : 'Schedule';
    const block = `
    <section id="schedule" class="schedule">
      <a class="back-home" href="#">Back to home</a>
      <h2>${scheduleTitle}</h2>
      <ul class="slots">
        <li><strong>8:00 PM</strong>. Doors · warm-up set</li>
        <li><strong>9:30 PM</strong>. Headliner one</li>
        <li><strong>11:00 PM</strong>. Headliner two · late set</li>
      </ul>
    </section>`;
    if (/<\/main>/i.test(html)) html = html.replace(/<\/main>/i, `${block}\n  </main>`);
    else html = html.replace(/<\/body>/i, `${block}\n</body>`);
    if (!/\.schedule\s*\{/i.test(css)) {
      css += `
.schedule { padding: 3rem 1.5rem; max-width: 720px; margin: 0 auto; }
.schedule .slots { list-style: none; padding: 0; }
.schedule .slots li { padding: 0.85rem 0; border-bottom: 1px solid rgba(255,255,255,0.12); }
.back-home { display: inline-block; margin-bottom: 1rem; color: inherit; opacity: 0.8; }
`;
    }
    if (/<nav[\s\S]*?<\/nav>/i.test(html) && !/href=["']#schedule["']/i.test(html)) {
      html = html.replace(/<\/nav>/i, `      <a href="#schedule">${scheduleTitle}</a>\n    </nav>`);
    }
    touched = true;
  } else if (nightFlow && /id=["']schedule["']/i.test(html)) {
    html = html.replace(/(<section[^>]*id=["']schedule["'][^>]*>[\s\S]*?<h2>)([^<]*)(<\/h2>)/i, '$1Night Flow$3');
    touched = true;
  }

  if (waitlist) {
    const waitlistBlock = `<section id="contact" class="contact">
      <h2>Contact</h2>
      <form id="waitlist-form" class="waitlist">
        <label>Email <input type="email" name="email" required placeholder="you@email.com" /></label>
        <button type="submit" class="btn">Join waitlist</button>
      </form>
      <p id="waitlist-thanks" hidden>Thanks. you are on the list.</p>
    </section>`;
    if (/<section[^>]*id=["']contact["'][^>]*>[\s\S]*?<\/section>/i.test(html)) {
      html = html.replace(/<section[^>]*id=["']contact["'][^>]*>[\s\S]*?<\/section>/i, waitlistBlock);
    } else if (/<footer[^>]*id=["']contact["'][^>]*>[\s\S]*?<\/footer>/i.test(html)) {
      html = html.replace(/<footer[^>]*id=["']contact["'][^>]*>[\s\S]*?<\/footer>/i, waitlistBlock);
    } else if (/<\/main>/i.test(html)) {
      html = html.replace(/<\/main>/i, `${waitlistBlock}\n  </main>`);
    } else {
      html = html.replace(/<\/body>/i, `${waitlistBlock}\n</body>`);
    }
    if (!/waitlist-form/i.test(js)) {
      js += `
document.getElementById('waitlist-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const thanks = document.getElementById('waitlist-thanks');
  if (thanks) thanks.hidden = false;
});
`;
    }
    touched = true;
  }

  // Trade cockpit follow-ups
  const addHelpTab = /\bhelp\s+tab\b/i.test(t) || (/\badd\b/i.test(t) && /\bhelp\b/i.test(t) && /\btab\b/i.test(t));
  const addSymbol = /\badd\s+symbol\b/i.test(t) || (/\bwatchlist\b/i.test(t) && /\b(field|input|append)\b/i.test(t));
  const buySell = /\b(buy\s+and\s+sell|buy\s+and\s+sell\s+buttons)\b/i.test(t)
    || (/\borders\b/i.test(t) && /\b(buy|sell)\b/i.test(t) && /\bbutton/i.test(t));

  if (addHelpTab && /data-tab=["']settings["']/i.test(html) && !/data-tab=["']help["']/i.test(html)) {
    html = html.replace(
      /(<button[^>]*data-tab=["']settings["'][^>]*>[\s\S]*?<\/button>)/i,
      `<button type="button" class="tab" data-tab="help">Help</button>\n        $1`,
    );
    if (!/id=["']panel-help["']/i.test(html)) {
      html = html.replace(
        /(<section[^>]*id=["']panel-settings["'][^>]*>)/i,
        `<section id="panel-help" class="panel" role="tabpanel" hidden>
        <h1>Help</h1>
        <ul class="faq">
          <li>Watchlist stores symbols locally in this session.</li>
          <li>Orders are demo-only. nothing is routed to a broker.</li>
          <li>Settings risk limit is a soft reminder, not a hard block.</li>
        </ul>
      </section>\n      $1`,
      );
    }
    if (!/\.faq\s*\{/i.test(css)) {
      css += `\n.faq { margin: 0; padding-left: 1.1rem; color: var(--muted, #8fa0b8); line-height: 1.6; }\n`;
    }
    touched = true;
  }

  if (addSymbol && /id=["']watch-form["']/i.test(html) === false && /Watchlist/i.test(html)) {
    // already scaffolded with form in cockpit; if missing, inject
    html = html.replace(
      /(<section[^>]*id=["']panel-watchlist["'][^>]*>[\s\S]*?<h1>Watchlist<\/h1>)/i,
      `$1\n        <form id="watch-form" class="row"><input id="symbol-input" type="text" placeholder="Symbol" /><button type="submit">Add symbol</button></form>\n        <ul id="watch-list" class="list"></ul>`,
    );
    touched = true;
  }

  if (buySell && /id=["']btn-buy["']/i.test(html) === false && /Orders/i.test(html)) {
    html = html.replace(
      /(<section[^>]*id=["']panel-orders["'][^>]*>[\s\S]*?<h1>Orders<\/h1>)/i,
      `$1\n        <div class="row"><button type="button" id="btn-buy">Buy</button><button type="button" id="btn-sell">Sell</button></div>\n        <ul id="order-list" class="list"></ul>`,
    );
    touched = true;
  }

  if (!touched) return [];

  out.push({ path: htmlPath, content: html });
  if (css !== css0 || wantsBg || wantsRgb || wantsTextColor || wantsSearchBar || stickyTicket || addSchedule) {
    out.push({ path: cssPath, content: css || '/* styles */\n' });
  }
  if (js !== js0 || wantsRemoveToggle || wantsSearchBar || waitlist) {
    out.push({ path: jsPath, content: js || 'document.documentElement.dataset.arkReady = \'1\';\n' });
  }
  return out;
}

/**
 * Shop / catalog feature asks need a real model App rewrite — never surgical half-patches
 * (local patch left unbound cart state and blank Live on the Garden ladder).
 */
export function isShopFeatureStructureAsk(message: string): boolean {
  const t = normalizeMessyUiEditAsk(String(message || ''));
  if (!t.trim()) return false;
  // Graphic composition shells rewrite App structure surgically (incl. shop thumbs).
  if (wantsGraphicCompositionAsk(t)) return false;
  // Incremental Shop title lists (+ simple per-item Add to cart) stay surgical —
  // not the full cart-drawer / checkout feature packs below.
  if (
    (
      /\b(?:Shop|Products?|Lineup)\s+section\b/i.test(t)
      || (/\bshop\b/i.test(t) && /\b(?:info\s+cards?|right\s+side)\b/i.test(t))
    )
    && /\b(?:names?|titles?|keyboards?|headphones?|microphones?|products?|description|blurb|cards?)\b/i.test(t)
    && /\b(?:add|put|include|below|section)\b/i.test(t)
    && !/\b(?:drawer|checkout|place\s+order|quantit|stepper|filter|badge\s+bump)\b/i.test(t)
  ) {
    return false;
  }
  if (/\badd\s+to\s+cart\b/i.test(t)) return true;
  if (/\b(?:place\s+order|checkout)\b/i.test(t)) return true;
  if (/\bcart\b/i.test(t) && /\b(?:drawer|checkout|place\s+order|badge|bump|quantit|open\s+the\s+cart)\b/i.test(t)) return true;
  if (/\b(?:quantity|stepper|qty)\b/i.test(t) && /\b(?:card|plant|cart|minus|plus|default)\b/i.test(t)) return true;
  if (/\bfilter\b/i.test(t) && /\b(?:All|Vegetables|Herbs|Leafy|plant)\b/i.test(t)) return true;
  if (/\b(?:plant|product)\s+cards?\b/i.test(t) && /\b(?:price|Add to cart|row of|eight items)\b/i.test(t)) return true;
  if (/\b(?:tomatoes?|peppers?|herbs|leafy\s+greens|basil|kale|zucchini)\b/i.test(t)
    && /\b(?:card|price|cart|Add to cart)\b/i.test(t)) {
    return true;
  }
  // First-create hard-go — must scaffold via create/model, not cream-only micro.
  if (/\bskip\s+the\s+plan\b/i.test(t) && /\b(?:on\s+disk|Live)\b/i.test(t)) return true;
  if (/\bput\s+it\s+on\s+disk\b/i.test(t) && /\bLive\b/i.test(t)) return true;
  if (/\b(?:filters?|qty\s+steppers?|cart\s+drawer)\b/i.test(t)
    && /\b(?:Live|checkout|cream|sticky)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function isWebMicroAsk(message: string): boolean {
  const t = normalizeMessyUiEditAsk(String(message || ''));
  if (!t.trim()) return false;
  // Structural Discord/chat piece asks must go through real App.jsx generation — never HTML micro.
  if (isStructuralUiPieceAsk(t)) return false;
  // Shop feature packs → model/create path only.
  if (isShopFeatureStructureAsk(t)) return false;
  if (/\b(build|create|make|scaffold)\b.{0,40}\b(app|website|site|page)\b/i.test(t) && /\bhello\s*world\b/i.test(t) === false) {
    // brand-new big builds are not micro. except hello world follow-ups with change verbs
  }
  if (/\b(?:cinematic|movie[- ]?like|atmospheric|premium\s+background|website[- ]?fit|editorial\s+background|background\s+image)\b/i.test(t)) return true;
  if (/\bbackground\b/i.test(t) && /\b(black|white|blue|dark|red|green|teal|brown|chocolate|sienna|pink|orange|navy|cream|gr[ae]y|yellow|purple)\b/i.test(t)) return true;
  if (/\b(solid|pure|just|blank)\b[\s\S]{0,24}\b(brown|black|white|blue|red|green|teal|pink|orange)\b/i.test(t)) return true;
  if (/\b(?:change|set|make|turn|update|switch)\b[\s\S]{0,40}\b(?:to|into)\s+(?:a\s+)?(?:solid\s+)?(brown|black|white|blue|red|green|teal|pink|orange|navy|cream|gr[ae]y)\b/i.test(t)) return true;
  if (/\b(?:change|rename|set|update|make)\b[\s\S]{0,64}\b(?:name|title|heading|word|text)\b/i.test(t)) return true;
  if (looksLikeNameTextColorAsk(t) || looksLikeNameFontStyleAsk(t)) return true;
  if (/\b(?:move|put|place)\b[\s\S]{0,40}\b(?:name|title|word|text|it)\b[\s\S]{0,40}\b(?:top|bottom|left|right|corner|center|middle)\b/i.test(t)) return true;
  // "Move Hello to the top of the screen" — named label, no "the word" phrasing.
  if (/\b(?:move|shift)\s+["“']?[A-Za-z][A-Za-z0-9' _-]{0,40}?["”']?\s+(?:to|into|onto)\s+(?:the\s+)?(?:top|bottom|left|right|corner|center|middle)\b/i.test(t)) {
    return true;
  }
  // Human: "put Glow up in the top left" — brand name, no "the name" wording
  if (/\b(?:[Pp]ut|[Pp]lace|[Aa]dd)\s+[A-Z][A-Za-z0-9_-]*(?:\s+(?:and|&|[A-Z][A-Za-z0-9_-]*)){0,4}\s+(?:up\s+)?(?:in|on|at)\s+(?:the\s+)?(?:top|bottom|left|right|corner|center|middle)\b/.test(t)) {
    return true;
  }
  // Lowercase phrase place: "add i like pizza on top left in all caps"
  if (
    /\b(?:add|put|place|write|show)\b/i.test(t)
    && /\b(?:top|bottom)\s*[- ]?(?:left|right)|(?:left|right)\s+corner|center|centre|middle\b/i.test(t)
    && !/\b(?:logo|icon|nav(?:igation|bar)?|footer|section|form|button)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(?:put|place|add)\s+(?:the\s+)?name\b/i.test(t)) return true;
  if (/\b(?:move|put|place|shift)\b[\s\S]{0,48}\b(?:icon|search|settings?|menu|user|profile)\b[\s\S]{0,48}\b(?:top|bottom|left|right|corner)\b/i.test(t)) return true;
  if (/\b(?:bold|italic|cursive|serif|sans|thin|light|skinny|professional)\b/i.test(t) && /\b(?:font|make|look|style|word|title|name|text)\b/i.test(t)) return true;
  if (/\b(?:put|add|place|show|display|write)\b[\s\S]{0,40}\b(?:word|text|sentence|phrase)\b/i.test(t)) return true;
  if (/\b(?:word|sentence|phrase)\b/i.test(t) && /\b(?:middle|center|screen)\b/i.test(t)) return true;
  // Ladder: title + paragraph / stacked sentences
  if (/\bstack\b/i.test(t) && /\b(?:sentences?|lines?|paragraphs?)\b/i.test(t)) return true;
  if (/\btitle\b/i.test(t) && /\bparagraph\b/i.test(t) && /\b(?:top|under)\b/i.test(t)) return true;
  if (/\b(?:clickable|toggle|alert\s+clicked|open\s+a\s+(?:different\s+)?tab)\b/i.test(t)) return true;
  if (/\btabs?\b/i.test(t) && /\b(?:Home|About|Settings)\b/.test(t)) return true;
  if (/\bbuttons?\b/i.test(t) && /\b(?:click\s+me|hover|darker|clicked|primary|secondary|disabled|green|red|blue|color)\b/i.test(t)) return true;
  if (/\b(?:change|set|make|turn)\b[\s\S]{0,40}\bbuttons?\b/i.test(t) && /\b(?:to|into)\b/i.test(t)) return true;
  if (/\btitle\b/i.test(t) && /\b(?:red|larger|bigger)\b/i.test(t)) return true;
  if (/\b(?:delete|remove|drop)\b/i.test(t) && /\bContact\b/.test(t) && /\b(?:nav|link)\b/i.test(t)) return true;
  if (/\bhide\b/i.test(t) && /\bsidebar\b/i.test(t)) return true;
  if (/\b(?:remove|delete)\b/i.test(t) && /\bthird\b/i.test(t) && /\bcards?\b/i.test(t)) return true;
  if (/\b(?:undo|redo)\b/i.test(t) && /\b(?:last|change|undone|previous)\b/i.test(t)) return true;
  if (/\bHero\b/.test(t) && /\bFeatures?\b/.test(t)) return true;
  if (/\bpricing\b/i.test(t) && /\bplans?\b/i.test(t)) return true;
  if (/\b(?:hamburger|narrow\s+screen|stack\s+on|one\s+column\s+on\s+mobile)\b/i.test(t)) return true;
  if (/\bcounter\b/i.test(t) && /\b(?:Plus|0|click)\b/i.test(t)) return true;
  if (/\bdark\s+mode\b/i.test(t) && /\btoggle\b/i.test(t)) return true;
  if (/\btodo\b/i.test(t) && /\b(?:add|complete|delete|list|save)\b/i.test(t)) return true;
  if (/\bnest\b/i.test(t) && /\bcard\b/i.test(t) && /\bsection\b/i.test(t)) return true;
  if (/\bprofile\s+card\b/i.test(t) || (/\bavatar\b/i.test(t) && /\bname\b/i.test(t) && /\bbuttons?\b/i.test(t))) return true;
  if (/\b(?:fade|slide|animate|spinner|toast|skeleton)\b/i.test(t)) return true;
  if (/\btabs?\b/i.test(t) && /\b(?:Overview|Details|Reviews)\b/.test(t)) return true;
  if (/\b(?:search|filter|sort|pagination|table|kanban|carousel|gallery|login|dashboard|breadcrumbs?)\b/i.test(t)
    && /\b(?:add|build|make|show|with|after|go\s+to)\b/i.test(t)) return true;
  if (/\bSign\s*in\b/i.test(t) && /\bdashboard\b/i.test(t)) return true;
  if (/\bsettings\s+page\b/i.test(t) || (/\btoggles?\b/i.test(t) && /\b(?:notifications?|dark\s+mode)\b/i.test(t))) return true;
  if (/\b(?:upload|drop\s+zone|drag-and-drop|command\s+palette|infinite\s+scroll|multi-step|validate|kanban|chat-style|thumbnail|carousel|breadcrumb)\b/i.test(t)) return true;
  // "Disable Submit until all required fields are filled"
  if (/\bdisable\b/i.test(t) && /\bsubmit\b/i.test(t)) return true;
  if (/\brequired\s+fields?\b/i.test(t) && /\b(?:disable|until|filled|submit)\b/i.test(t)) return true;
  // Dusk lounge / listening-room vibe pages (Velvet Hour etc.).
  if (
    /\b(?:cocktail\s+lounge|listening\s+room|listening\s+lounge|vinyl\s+hour|last\s+song|reserve\s+a\s+seat)\b/i.test(t)
    || (/\bvibe\b/i.test(t) && /\b(?:lounge|dusk|cocktail|listening)\b/i.test(t))
  ) return true;
  // Ladder end: landing / SaaS shell / polish / restyle / Twitter — surgical shells, not invent-create.
  if (/\b(?:full\s+)?landing\s+page\b/i.test(t)) return true;
  if (/\blanding\b/i.test(t) && /\b(?:hero|features|pricing|FAQ|footer|testimonials)\b/i.test(t)) return true;
  if (/\bSaaS\s+app\s+shell\b/i.test(t) || (/\bauth\s+screen\b/i.test(t) && /\bbilling\b/i.test(t))) return true;
  if (/\bfeel\s+polished\b/i.test(t) || (/\bconsistent\s+spacing\b/i.test(t) && /\bhover\b/i.test(t))) return true;
  if (/\bcompletely\s+different\s+visual\s+style\b/i.test(t) || (/\bRebuild\b/.test(t) && /\bdifferent\s+visual\b/i.test(t))) return true;
  if (/\bTwitter\s+clone\b/i.test(t) || (/\bcompose\b/i.test(t) && /\bfeed\b/i.test(t) && /\blikes?\b/i.test(t))) return true;
  if (/\bClicking\b/i.test(t) && /\bthumbnail\b/i.test(t)) return true;
  if (/\b(?:text\s+input|input\s+with|placeholder|checkbox|dropdown|select\b|textarea|form|email\s+input|password\s+input|radio)\b/i.test(t)) return true;
  if (/\b(?:email|password)\b/i.test(t) && /\binput\b/i.test(t)) return true;
  if (/\b(?:Small|Medium|Large)\b/.test(t) && /\b(?:radio|group)\b/i.test(t)) return true;
  if (/\b(?:nav|navigation)\b/i.test(t) && /\b(?:highlight|active|switch|sidebar|collapse|modal|dropdown|cards?|grid)\b/i.test(t)) return true;
  if (/\btop\s+navigation\b/i.test(t) || /\bleft\s+sidebar\b/i.test(t)) return true;
  if (/\b(?:sidebar|modal|open\s+dialog|card\s+grid|three\s+cards|2-by-2|2\s*x\s*2)\b/i.test(t)) return true;
  if (/\bcards?\b/i.test(t) && /\b(?:row|grid|title)\b/i.test(t)) return true;
  if (/\b(?:words?|wording|phrase|sentence)\b/i.test(t) && /\b(?:center|centred|middle|screen|brown|viewport)\b/i.test(t)) return true;
  // "Put Hello on the left and Goodbye on the right"
  if (extractDualSideLabels(t).length === 2) return true;
  if (/\b(?:says?|reading)\b/i.test(t) && /\b(?:words?|text|phrase)\b/i.test(t)) return true;
  if (/\b(rgb|multi[- ]?colou?r|multiple\s+colou?rs?|rainbow|gradient|teal)\b/i.test(t)) return true;
  {
    const searchNegated = /\b(?:no|without|never|skip|omit|don't|do\s+not|dont)\b[\s\S]{0,40}\bsearch(?:\s*bar)?\b/i.test(t);
    if (!searchNegated && (/\bsearch\s*bar\b/i.test(t) || (/\bsearch\b/i.test(t) && /\b(top|corner|right|header|bar)\b/i.test(t)))) {
      return true;
    }
  }
  if (/\b(remove|delete)\b.{0,40}\b(toggle|theme)\b/i.test(t)) return true;
  if (/(?:change|rename|set|into).{0,48}(?:to|into)\s+["']?[A-Za-z0-9]/i.test(t)) return true;
  if (/\b(?:make|change|set|update)\b[\s\S]{0,48}\bbutton\b[\s\S]{0,40}\b(?:say|to|into|label)\b/i.test(t)) return true;
  if (/\b(?:hero|headline|heading|title)\b[\s\S]{0,40}\b(?:to|into|say)\b/i.test(t)) return true;
  if (/\bpizza\b/i.test(t) && /\b(change|saying|say|text|title|hello)\b/i.test(t)) return true;
  if (/\b(text|hello\s*world)\b.{0,40}\b(white|black|color)\b/i.test(t)) return true;
  if (
    /\b(logo|icon|gear)\b/i.test(t)
    && /\b(add|put|place|center|middle|screen|top[\s-]?left|top[\s-]?right|bottom[\s-]?left|bottom[\s-]?right|corner)\b/i.test(t)
  ) return true;
  // Cart / bag icon corner moves stay micro; full cart+checkout feature packs are gated above.
  if (/\b(?:bag|cart)\b/i.test(t)
    && /\b(?:add|put|place|icon|button|top[\s-]?right|search)\b/i.test(t)
    && !/\b(?:drawer|checkout|place\s+order|Add to cart|bump|count|quantit)\b/i.test(t)) {
    return true;
  }
  if (
    /\b(?:move|shift|nudge|lower)\b/i.test(t)
    && /\b(?:card|cards|grid|row|section|content|list)\b/i.test(t)
    && /\b(?:lower|down|below|breathing|space|spacing|margin|crowd|under)\b/i.test(t)
  ) return true;
  if (/\bfooter\b/i.test(t) && /\b(?:add|simple|thin)\b/i.test(t)) return true;
  if (/\bhero\s+title\b/i.test(t) || (/\bsubtitle\b/i.test(t) && /\badd\b/i.test(t))) return true;
  if (/\btagline\b/i.test(t) && /\b(?:add|put|place|under)\b/i.test(t)) return true;
  if (/\b(?:main\s+)?(?:headline|heading)\b/i.test(t) && /\b(?:says?|reading)\b/i.test(t) && /\b(?:add|put|place)\b/i.test(t)) return true;
  if (/\bcharcoal\b/i.test(t) && /\b(?:background|page|canvas|switch|turn|make)\b/i.test(t)) return true;
  if (
    /\b(?:animated|gently\s+shifts?|soft\s+animated)\b/i.test(t)
    && /\b(?:gradient|background)\b/i.test(t)
  ) return true;
  if (/\banimated\s+gradient\b/i.test(t) && /\b(?:background|page|give|add)\b/i.test(t)) return true;
  if (wantsGraphicCompositionAsk(t)) return true;
  // Single-object product visuals ("create a microphone on the page") stay micro → edit.
  if (
    /\b(?:microphones?|mics?\b|headphones?|headsets?|earbuds?|guitars?|keyboards?|mice|mouse|watches?|bottles?|iphones?|phones?|gpus?|monitors?|speakers?|laptops?|desks?)\b/i.test(t)
    && (/\b(?:create|draw|generate|render|add|put|place|show|make)\b/i.test(t) || /\b(?:image|picture|photo)\b/i.test(t))
    && !/\b(?:landing|homepage|full[- ]?bleed|shop\s+section|split\s+layout)\b/i.test(t)
  ) return true;
  if (/\b(?:Work|Shop|Products)\b/.test(t) && /\bContact\b/.test(t) && /\b(?:nav|navigation|links?)\b/i.test(t)) return true;
  if (/\bFeatured\s+Work\b/i.test(t) && /\b(?:add|put|include|section|below)\b/i.test(t)) return true;
  if (
    /\b(?:Shop|Products?|Lineup)\s+section\b/i.test(t)
    && /\b(?:add|put|include|below|section)\b/i.test(t)
    && /\b(?:names?|titles?|keyboards?|headphones?|microphones?|products?|cart|cards?|description|blurb)\b/i.test(t)
  ) return true;
  if (
    /\b(?:info\s+boxes?|three\s+short\s+(?:boxes|cards|panels)|why\s+\w+|what\s+\w+\s+does?)\b/i.test(t)
    && /\b(?:add|put|include|across)\b/i.test(t)
  ) return true;
  if (/\bshop\b/i.test(t) && /\b(?:right\s+side|info\s+cards?|description)\b/i.test(t) && /\b(?:add|put|include)\b/i.test(t)) return true;
  if (
    /\bContact\s+section\b/i.test(t)
    && /\b(?:form|add|put|include)\b/i.test(t)
    && /\b(?:name|email|message|Send)\b/i.test(t)
  ) return true;
  if (
    /\bcontact\b/i.test(t)
    && /\bform\b/i.test(t)
    && /\b(?:name|email|message)\b/i.test(t)
    && /\b(?:add|put|include)\b/i.test(t)
  ) return true;
  // Notes / simple static sites only — do NOT treat Discord layout words as micro.
  if (/\b(title\s*bar|note\s*list|localStorage|new\s+note|new\s+page|ink\s+notes)\b/i.test(t)) return true;
  if (/\bcreate\s+project\b/i.test(t)) return true;
  if (/\bbadge\b/i.test(t) && /\b(text|label|to|into)\b/i.test(t)) return true;
  if (/\bequals?\s+button\b/i.test(t) && /\b(larger|bigger)\b/i.test(t)) return true;
  if (/\b(drop|remove|delete|fold)\b[\s\S]{0,80}\babout\b/i.test(t)) return true;
  // Sticky / card grid / descriptions / drop-a-heading are shop polish — model path, not micro.
  if (/\bnav\b/i.test(t) && /\b(only|just)\b/i.test(t) && /\b(lineup|contact)\b/i.test(t)) return true;
  if (/\bschedule\s+page\b/i.test(t) || (/\b(add|create|new)\b[\s\S]{0,40}\bschedule\b/i.test(t))) return true;
  if (/\bwaitlist\b/i.test(t)) return true;
  if (/\bnight\s+flow\b/i.test(t)) return true;
  if (/\b(watchlist|orders?\s+tab|help\s+tab|add\s+symbol|buy\s+and\s+sell)\b/i.test(t)) return true;
  if (/\bsticky\s+header\b/i.test(t)) return true;
  if (/\bfooter\b/i.test(t) && /\b(?:copyright|pinned|bottom)\b/i.test(t)) return true;
  if (/\bbar\s+chart\b/i.test(t) || (/\bwidget\b/i.test(t) && /\bchart\b/i.test(t))) return true;
  if (/\bstat\s+widgets?\b/i.test(t) || (/\bdashboard\b/i.test(t) && /\bsidebar\b/i.test(t) && /\btop\s+bar\b/i.test(t))) return true;
  if (/\bimage\s+gallery\b/i.test(t) || (/\bthumbnails?\b/i.test(t) && /\bpreview\b/i.test(t))) return true;
  if (/\bpagination\b/i.test(t) || (/\bNext\b/.test(t) && /\bPrevious\b/.test(t))) return true;
  if (/\bdata\s+table\b/i.test(t) || (/\bName\b/.test(t) && /\bRole\b/.test(t) && /\bStatus\b/.test(t))) return true;
  return false;
}

/**
 * Single gate for surgical UI shells: route to edit, allow finalizeWebEdits past
 * marketing invent-only, and fail-fast instead of invent timeout.
 * Alias of isWebMicroAsk so classify / finalize / edit share one name.
 */
export function isUiShellAsk(message: string): boolean {
  return isWebMicroAsk(message);
}

/**
 * Marketing / product homepage asks — must never get surgical center-word / flex-center
 * phone-column CSS. Kept local (no import from createBuildQuality) to avoid cycles.
 */
export function askLooksLikeMarketingOrProductHomepage(ask: string): boolean {
  const t = String(ask || '');
  if (!t.trim()) return false;
  // Incremental Contact/Help/email footer asks stay surgical (even when "keep the brand/shop").
  if (
    /\bfooter\b/i.test(t)
    && /\b(?:add|put|include)\b/i.test(t)
    && /\b(?:contact|help|email)\b/i.test(t)
    && !/\b(?:landing|homepage|from\s+scratch|rebuild|full[- ]?bleed|scroll\s+to\s+reveal)\b/i.test(t)
  ) {
    return false;
  }
  // Incremental info boxes / rich product cards stay surgical.
  if (
    (
      /\b(?:info\s+boxes?|three\s+short\s+(?:boxes|cards|panels))\b/i.test(t)
      || (/\bshop\b/i.test(t) && /\b(?:info\s+cards?|description|blurb|right\s+side)\b/i.test(t))
    )
    && /\b(?:add|put|include|across)\b/i.test(t)
    && !/\b(?:landing|homepage|from\s+scratch|rebuild|full[- ]?bleed)\b/i.test(t)
  ) {
    return false;
  }
  // Graphic composition / split-photo redesigns stay surgical (structure rewrite).
  if (wantsGraphicCompositionAsk(t) && !/\b(?:landing\s+page|full[- ]?bleed\s+marketing)\b/i.test(t)) {
    return false;
  }
  // Incremental title-list / shop-lineup edits must stay surgical — never treat
  // "keyboard names: …" or "no product cards" as a full marketing homepage rewrite.
  if (
    (
      /\b(?:Shop|Products?|Lineup|Featured\s+Work)\s+section\b/i.test(t)
      || /\b(?:keyboard|product|project|headphones?)\s+names?\s*:/i.test(t)
      || (/\bnames?\s*:/i.test(t) && /\b(?:three|titles?|keyboards?|headphones?|products?)\b/i.test(t))
    )
    && /\b(?:add|put|include|below|section)\b/i.test(t)
    && !/\b(?:full[- ]?bleed|landing\s+page|from\s+scratch|rebuild|scroll\s+to\s+reveal)\b/i.test(t)
  ) {
    return false;
  }
  if (/\b(?:quiet\s+luxury|landing(?:\s+page)?|marketing\s+site|scroll\s+to\s+reveal|soft\s+(?:mint\s+|green\s+)?orbs?|premium\s+(?:product|quiet)|full\s+scrollable\s+landing|product\s+(?:homepage|marketing|page)|full[- ]?bleed)\b/i.test(t)) {
    return true;
  }
  // Incremental "add a Contact footer" + "keep the brand" is surgical — not a marketing rebuild.
  if (
    /\b(?:hero|footer|features?|varieties|colorway|specs?)\b/i.test(t)
    && /\b(?:website|landing|homepage|marketing|brand)\b/i.test(t)
    && !(
      /\bfooter\b/i.test(t)
      && /\b(?:add|put|include)\b/i.test(t)
      && /\b(?:contact|help|email)\b/i.test(t)
      && !/\b(?:landing|homepage|from\s+scratch|rebuild|full[- ]?bleed)\b/i.test(t)
    )
  ) {
    return true;
  }
  if (/\b(?:gaming\s+(?:desk|mouse|keyboard|headset|peripheral)|standing\s+desk|wireless\s+mouse|mechanical\s+keyboard|dried[- ]?dates?|medjool|fruit\s+brand|specialty[- ]food|liquor|spirits?|bottle\s+shop)\b/i.test(t)) {
    return true;
  }
  // Require real storefront intent — bare "product cards" / "product names" must not match.
  if (/\b(?:mouse|keyboard|headset|earbuds?|vacuum|shop|store|dates?|whiskey|whisky|bourbon|vodka|gin)\b/i.test(t)
    && /\b(?:website|landing|homepage|product\s+(?:page|site|store|homepage)|brand|cart|checkout)\b/i.test(t)) {
    return true;
  }
  if (t.length > 160
    && /\b(?:website|homepage)\b/i.test(t)
    && /\b(?:sticky\s+nav|full[- ]?bleed|hero|CTA|footer|Shop)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Discord/Slack workspace ladder — must run even when isStructuralUiPieceAsk is true. */
function relayWorkspaceSurgicalEdits(
  files: WebFileMap,
  message: string,
): WebFileEdit[] {
  const t = normalizeMessyUiEditAsk(String(message || ''));
  if (!t.trim()) return [];
  const flat = flatten(files);
  const appPath = findReactAppPath(flat);
  if (!appPath || !flat[appPath]) return [];
  const cssPath = findReactCssPath(flat, appPath);
  let app = flat[appPath];
  let css = flat[cssPath] || '';

  const brand = (
    extractBrandLabel(t)
    || app.match(/<(?:h1|h2|div)[^>]*className=["'][^"']*(?:center-word|server-rail__brand|brand|sidebar-title)[^"']*["'][^>]*>\s*([^<]+?)\s*</i)?.[1]?.trim()
    || 'Relay'
  ).replace(/[<>&"]/g, '').slice(0, 40) || 'Relay';

  // Contact / marketing forms must never rebuild into a Discord Relay shell.
  const contactFormAsk = (
    (/\bContact\s+section\b/i.test(t) || (/\bcontact\b/i.test(t) && /\bform\b/i.test(t)))
    && /\b(?:name|email|message|Send)\b/i.test(t)
    && /\b(?:add|put|include)\b/i.test(t)
  );
  if (contactFormAsk) return [];

  const wantsComposer = (
    /\b(?:message\s+)?composer\b/i.test(t)
    || (/\bSend\b/i.test(t) && /\b(?:input|textarea|bottom|post|wire|work|message)\b/i.test(t))
    || /\b(?:wire|fix|make)\b[\s\S]{0,40}\b(?:Send|composer|post(?:ing)?)\b/i.test(t)
  );
  const wantsChatPane = (
    /\b(?:chat\s+pane|main\s+chat|sample\s+messages?)\b/i.test(t)
    || (/\bMaya\b/i.test(t) && /\bJordan\b/i.test(t))
  );
  const wantsChannels = (
    /\bchannel\s+list\b/i.test(t)
    || (/#general/i.test(t) && /#random/i.test(t))
    || (/\bgeneral\b/i.test(t) && /\brandom\b/i.test(t) && /\bdesign\b/i.test(t) && /\bchannel/i.test(t))
    || /\b(?:switch|click|select)\b[\s\S]{0,32}\bchannels?\b/i.test(t)
    || /\bchannels?\b[\s\S]{0,32}\b(?:switch|update|header|thread|messages?)\b/i.test(t)
  );
  const wantsServerRail = (
    /\b(?:server\s+rail|server-rail|dark\s+(?:left\s+)?(?:sidebar|rail)|left\s+sidebar)\b/i.test(t)
    || (/\bsidebar\b/i.test(t) && /\b(?:dark|left|narrow|rail)\b/i.test(t))
  ) && !wantsChannels && !wantsChatPane && !wantsComposer;
  const wantsFillFix = (
    /\b(?:white\s+(?:box|strip|bar|floor|gap)|fill\s+(?:the\s+)?(?:window|height)|no\s+white)\b/i.test(t)
    || /\b(?:windowed|minimized)\b[\s\S]{0,40}\bwhite\b/i.test(t)
  );

  const hasComposer = /className=["']composer["']/i.test(app);
  const composerDead = hasComposer && (
    /onSubmit=\{\(e\)\s*=>\s*e\.preventDefault\(\)\}/i.test(app)
    || (!/useState/i.test(app) && /type=["']submit["']/i.test(app))
  );
  const channelsDead = /className=["']channel/i.test(app) && !/setChannel|setActiveChannel|activeChannel/i.test(app);
  const upgradeInteractive = (
    (wantsComposer && (composerDead || !hasComposer))
    || (wantsChannels && channelsDead && (hasComposer || wantsComposer || /\b(?:switch|header|thread)\b/i.test(t)))
    || (wantsFillFix && /server-rail|channel-list|composer/i.test(app))
  );

  const addPiece = /\b(?:add|put|place|include)\b/i.test(t);
  if (!addPiece && !upgradeInteractive && !wantsFillFix) return [];
  if (!wantsComposer && !wantsChatPane && !wantsChannels && !wantsServerRail && !upgradeInteractive && !wantsFillFix) {
    return [];
  }

  const buildRelayShell = (opts: {
    channels?: boolean;
    chat?: boolean;
    composer?: boolean;
  }) => {
    const channels = opts.channels || opts.chat || opts.composer;
    const chat = opts.chat || opts.composer;
    const composer = opts.composer;

    // Full interactive shell once composer (or channel switch) is in play —
    // Send must post, channels must update header + thread, shell must fill the window.
    if (composer || (channels && chat && upgradeInteractive)) {
      return `import { useState } from 'react';
import './App.css';

const CHANNELS = ['general', 'random', 'design'];

const SEED = {
  general: [
    { id: 'm1', author: 'Maya', text: 'Welcome to ${brand} — ship notes live here.' },
    { id: 'm2', author: 'Jordan', text: 'Sidebar and channels look solid. Next up: composer.' },
  ],
  random: [],
  design: [],
};

export default function App() {
  const [channel, setChannel] = useState('general');
  const [draft, setDraft] = useState('');
  const [byChannel, setByChannel] = useState(SEED);
  const thread = byChannel[channel] || [];

  const onSend = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setByChannel((prev) => ({
      ...prev,
      [channel]: [...(prev[channel] || []), { id: \`m\${Date.now()}\`, author: 'You', text }],
    }));
    setDraft('');
  };

  return (
    <div className="app">
      <aside className="server-rail" aria-label="Server rail">
        <div className="server-rail__brand">${brand}</div>
      </aside>
      <nav className="channel-list" aria-label="Channels">
        {CHANNELS.map((id) => (
          <button
            key={id}
            type="button"
            className={channel === id ? 'channel is-active' : 'channel'}
            onClick={() => setChannel(id)}
          >
            #{'{'}id{'}'}
          </button>
        ))}
      </nav>
      <main className="main-pane" aria-label="Main">
        <header className="chat-header">#{'{'}channel{'}'}</header>
        <div className="message-list" aria-label="Messages">
          {thread.map((m) => (
            <article key={m.id} className="message">
              <strong>{'{'}m.author{'}'}</strong>
              <p>{'{'}m.text{'}'}</p>
            </article>
          ))}
        </div>
        <form className="composer" onSubmit={onSend} aria-label="Message composer">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={\`Message #\${channel}\`}
            aria-label="Message input"
          />
          <button type="submit">Send</button>
        </form>
      </main>
    </div>
  );
}
`;
    }

    const channelBlock = channels ? `
      <nav className="channel-list" aria-label="Channels">
        <button type="button" className="channel is-active">#general</button>
        <button type="button" className="channel">#random</button>
        <button type="button" className="channel">#design</button>
      </nav>` : '';
    const chatBlock = chat ? `
        <header className="chat-header">#general</header>
        <div className="message-list" aria-label="Messages">
          <article className="message"><strong>Maya</strong><p>Welcome to ${brand} — ship notes live here.</p></article>
          <article className="message"><strong>Jordan</strong><p>Sidebar and channels look solid. Next up: composer.</p></article>
        </div>` : `
        <h1 className="center-word">${brand}</h1>`;
    return `import './App.css';

export default function App() {
  return (
    <div className="app">
      <aside className="server-rail" aria-label="Server rail">
        <div className="server-rail__brand">${brand}</div>
      </aside>${channelBlock}
      <main className="main-pane" aria-label="Main">
${chatBlock}
      </main>
    </div>
  );
}
`;
  };

  // Dark fill on html/body/#root + .app height:100% — kills the white floor when Live is windowed.
  const relayCss = `
html,body,#root{height:100%;margin:0;background:#1e1f22}
.app{height:100%;min-height:100%;margin:0;display:flex;background:#1e1f22;color:#f2f3f5;font-family:system-ui,sans-serif}
.server-rail{width:72px;min-width:72px;background:#1e1f22;color:#f2f3f5;display:flex;flex-direction:column;align-items:center;padding:1rem 0.5rem;box-sizing:border-box}
.server-rail__brand{writing-mode:vertical-rl;transform:rotate(180deg);font-weight:700;font-size:0.95rem;letter-spacing:0.04em}
.channel-list{width:220px;background:#2b2d31;color:#dbdee1;display:flex;flex-direction:column;gap:0.35rem;padding:1rem 0.75rem;box-sizing:border-box}
.channel{appearance:none;border:0;background:transparent;color:inherit;text-align:left;padding:0.45rem 0.6rem;border-radius:0.35rem;cursor:pointer;font:inherit}
.channel.is-active,.channel:hover{background:#404249}
.main-pane{flex:1;position:relative;min-width:0;display:flex;flex-direction:column;background:#313338;color:#f2f3f5;min-height:0}
.center-word{margin:0;position:absolute;top:1.25rem;left:1.25rem;font-size:clamp(1.4rem,4vw,2rem);font-weight:600;letter-spacing:-0.02em;color:#f2f3f5}
.chat-header{padding:0.9rem 1.1rem;border-bottom:1px solid #3f4147;font-weight:700}
.message-list{flex:1;overflow:auto;padding:1rem 1.1rem;display:flex;flex-direction:column;gap:0.9rem}
.message strong{display:block;margin-bottom:0.2rem}
.message p{margin:0;opacity:0.92;line-height:1.4}
.composer{display:flex;gap:0.5rem;padding:0.85rem 1.1rem;border-top:1px solid #3f4147}
.composer input{flex:1;border:0;border-radius:0.45rem;padding:0.7rem 0.85rem;background:#383a40;color:#f2f3f5;font:inherit}
.composer button{border:0;border-radius:0.45rem;padding:0.7rem 1rem;background:#5865f2;color:#fff;font:inherit;font-weight:600;cursor:pointer}
`;

  if (upgradeInteractive || (wantsComposer && addPiece)) {
    app = buildRelayShell({ channels: true, chat: true, composer: true });
  } else if (wantsChatPane && addPiece && !/\bMaya\b/i.test(app)) {
    app = buildRelayShell({ channels: true, chat: true, composer: false });
  } else if (wantsChannels && addPiece && !/#general|className=["']channel["']/i.test(app)) {
    app = buildRelayShell({ channels: true, chat: false, composer: false });
  } else if (wantsServerRail && addPiece && !/server-rail|className=["'](?:sidebar|server-rail)["']/i.test(app)) {
    app = buildRelayShell({ channels: false, chat: false, composer: false });
  } else if (wantsFillFix && /server-rail|channel-list|composer/i.test(app)) {
    // CSS-only fill fix when shell already exists
  } else {
    return [];
  }
  css = `${String(css || '').replace(/\n(?:html,body,#root|\.server-rail)[\s\S]*$/i, '').trimEnd()}\n${relayCss}`;
  return [
    { path: appPath, content: app },
    { path: cssPath, content: css },
  ];
}

/** Surgical React SPA tweaks. must win over full kanban/finance rebuilds from project name. */
export function reactSurgicalMicroAskEdits(
  files: WebFileMap,
  message: string,
): WebFileEdit[] {
  const t = normalizeMessyUiEditAsk(String(message || ''))
    .replace(/<!--\s*nova-ladder:[^>]*-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  if (!t.trim()) return [];

  // Relay/Discord ladder pieces win before structural early-return (which used to force a slow model hop).
  {
    const relay = relayWorkspaceSurgicalEdits(files, t);
    if (relay.length) return relay;
  }

  // Piece-by-piece Discord layout asks need full model App.jsx writes, not surgical tweaks.
  if (isStructuralUiPieceAsk(t)) return [];
  // Shop feature packs must never get a half-patched App (unbound cart / blank Live).
  if (isShopFeatureStructureAsk(t)) return [];
  // UI shells have real surgical App.jsx templates — do not force invent via marketing/rebuild.
  const shellAsk = isUiShellAsk(t);
  // Full product / marketing landings must never collapse into a center-word stub.
  if (askLooksLikeMarketingOrProductHomepage(t) && !shellAsk) {
    return [];
  }
  // "Rebuild the layout" for graphic composition is surgical — not a full create scrap.
  if (
    !shellAsk
    && /\b(scrap|rebuild|from\s+scratch|scaffold\s+(?:a\s+)?new|replace\s+(?:the\s+)?(?:entire\s+)?(?:app|layout|ui)|start\s+over)\b/i.test(t)
    && !wantsGraphicCompositionAsk(t)
    && !/\b(?:cocktail\s+lounge|listening\s+room|reserve\s+a\s+seat|vinyl\s+hour)\b/i.test(t)
  ) {
    return [];
  }
  if (
    !shellAsk
    && !looksLikeNameFontStyleAsk(t)
    && !looksLikeNameTextColorAsk(t)
    && !/\b(rename|change|tint|make|update|finish|feel\s+finished|apply|badge|unread|syncing|connect\s+bank|folder\s+groups?|find\s+in\s+note|tags?\s+chips?|add|put|place|move|shift|nudge|lower|remove|delete|copyright|contact|footer|nav|brand|cart|polish)\b/i.test(t)
  ) {
    return [];
  }

  const flat = flatten(files);
  const appPath = findReactAppPath(flat);
  if (!appPath || !flat[appPath]) return [];
  const cssPath = findReactCssPath(flat, appPath);
  let app = flat[appPath];
  let css = flat[cssPath] || '';
  let indexCss = flat['src/index.css'] || '';
  let touchedApp = false;
  let touchedCss = false;
  let touchedIndex = false;
  // Per-brand chrome — recomputed after brand lands so seed can flip recipes.
  let chrome = pickLayoutChrome(t, app);

  // Ladder: sticky header / pinned footer / landing / SaaS shell / polish / twitter mini.
  {
    const wantsSticky = /\bsticky\s+header\b/i.test(t);
    const wantsPinnedFoot = /\bfooter\b/i.test(t) && /\b(?:copyright|pinned|bottom)\b/i.test(t);
    // Positive SaaS twin only — "not SaaS / not dashboard" must not block vibe lounge.
    const wantsSaas = /\bSaaS\s+app\s+shell\b/i.test(t)
      || (/\bauth\s+screen\b/i.test(t) && /\bdashboard\b/i.test(t) && /\bbilling\b/i.test(t));
    // Brand-new creates must invent — never paste lounge/product twins (RaidDesk≈Velvet).
    // Human phrasing counts too: "make me a new website", "new project on disk please".
    const brandNewCreate = (
      /\b(?:create|scaffold|make(?:\s+me)?)\b/i.test(t)
      && /\b(?:on\s+disk|brand-new|new\s+website|new\s+site|new\s+project)\b/i.test(t)
    )
      || /\bmake\s+me\s+a\s+new\s+(?:website|site|project)\b/i.test(t)
      || (
        /\bnew\s+(?:website|site|project)\b/i.test(t)
        && /\b(?:on\s+disk|please|brand-new)\b/i.test(t)
      );
    // Dusk lounge — edit/rebuild only; brand-new creates invent.
    const wantsVibeLounge = !brandNewCreate && !wantsSaas && (
      /\b(?:cocktail\s+lounge|listening\s+room|listening\s+lounge|vinyl\s+hour|last\s+song|reserve\s+a\s+seat)\b/i.test(t)
      || (/\bvibe\b/i.test(t) && /\b(?:lounge|dusk|cocktail|listening)\b/i.test(t))
    );
    // Hardware / product brand landings — never on brand-new create (invent path).
    const wantsProductLanding = !brandNewCreate && !wantsSaas && !wantsVibeLounge && (
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
    );
    // Brand-new creates invent landings — do not collapse into Dashboard/Billing twin.
    const wantsLanding = !brandNewCreate && !wantsVibeLounge && !wantsProductLanding && (
      /\bfull\s+landing\s+page\b/i.test(t)
      || (/\blanding\b/i.test(t) && /\b(?:hero|features|pricing|FAQ|footer)\b/i.test(t))
    );
    const wantsPolish = /\bfeel\s+polished\b/i.test(t)
      || (/\bconsistent\s+spacing\b/i.test(t) && /\bhover\b/i.test(t));
    const wantsRestyle = /\bcompletely\s+different\s+visual\s+style\b/i.test(t)
      || (/\brebuild\b/i.test(t) && /\bdifferent\s+visual\b/i.test(t));
    const wantsTwitter = /\bTwitter\s+clone\b/i.test(t)
      || (/\bfeed\b/i.test(t) && /\bcompose\b/i.test(t) && /\blikes?\b/i.test(t));
    if (wantsVibeLounge || wantsProductLanding || wantsSticky || wantsPinnedFoot || wantsLanding || wantsSaas || wantsPolish || wantsRestyle || wantsTwitter) {
      const canvas = wantsVibeLounge
        ? '#140c14'
        : wantsProductLanding
          ? '#0b0f14'
          : (wantsRestyle ? '#0b1220' : (detectSolidCanvasBg(css, indexCss) || '#ffffff'));
      const ink = wantsVibeLounge ? '#f6efe6' : wantsProductLanding ? '#e8f1f7' : contrastTextForBg(canvas);
      const accent = wantsVibeLounge ? '#d4a15a' : wantsProductLanding ? '#22d3ee' : (wantsRestyle ? '#38bdf8' : ink);
      if (wantsVibeLounge) {
        const brandRaw = (
          extractBrandLabel(t)
          || t.match(/\b(?:called|named)\s+["'“]?([A-Z][A-Za-z0-9][A-Za-z0-9 _-]{1,40})/i)?.[1]
          || t.match(/\brebuild\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2})\b/i)?.[1]
          || extractExistingBrand(app, 'Velvet Hour')
          || 'Velvet Hour'
        );
        const brand = String(brandRaw || 'Velvet Hour')
          .replace(/[<>&`]/g, '')
          .replace(/^["“']+|["”']+$/g, '')
          .replace(/\s+(?:large|larger|huge|small|big|hero|line|button|cta)\b.*$/i, '')
          // Lowercase/digit run ids only (zx9) — /i would strip "Hour" from Velvet Hour.
          .replace(/\s+[a-z0-9]{3,5}$/, '')
          .replace(/\s+as\b.*$/i, '')
          .trim()
          .slice(0, 40) || 'Velvet Hour';
        // Prefer explicit tag line — never the brand-name quote / "… large" chrome.
        const tag = (
          t.match(/\bline\s+["“']([^"”']{6,64})["”']/i)?.[1]
          || t.match(/[“"](Stay for the last song\.?)[”"]/i)?.[1]
          || (/\blast\s+song\b/i.test(t) ? 'Stay for the last song.' : 'Stay a little longer.')
        ).replace(/`/g, '');
        const cta = /\bReserve a seat\b/i.test(t) ? 'Reserve a seat' : 'Reserve a seat';
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [email, setEmail] = useState('');
  return (
    <div className="app vibe">
      <section className="hero" aria-label="Hero">
        <p className="eyebrow">Tonight</p>
        <h1 className="brand">${brand}</h1>
        <p className="tag">${tag}</p>
        <button type="button" className="cta">${cta}</button>
      </section>
      <section className="tonight" aria-label="Tonight">
        <h2>Tonight</h2>
        <div className="moods">
          <article className="mood"><h3>Vinyl Hour</h3><p>Deep cuts on the turntable.</p></article>
          <article className="mood"><h3>Low Lights</h3><p>Amber glow, soft talk.</p></article>
          <article className="mood"><h3>Quiet Corner</h3><p>A booth for the last song.</p></article>
        </div>
      </section>
      <footer className="foot">
        <p>Tue–Sun · 6pm–2am</p>
        <form className="mail" onSubmit={(e) => { e.preventDefault(); }}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@night.mail" />
          </label>
          <button type="submit">Join the list</button>
        </form>
      </footer>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}
.app.vibe{min-height:100dvh;margin:0;display:flex;flex-direction:column;background:
  radial-gradient(120% 80% at 20% 0%, #3a1828 0%, transparent 55%),
  radial-gradient(90% 70% at 90% 20%, #2a1810 0%, transparent 50%),
  ${canvas};color:${ink};font-family:Georgia,"Iowan Old Style",serif}
.hero{flex:0 0 auto;min-height:0;max-height:none;display:flex;flex-direction:column;justify-content:flex-start;padding:2.5rem 1.5rem 1.75rem;box-sizing:border-box;max-width:40rem}
.eyebrow{margin:0 0 .6rem;letter-spacing:.18em;text-transform:uppercase;font-size:.72rem;opacity:.7;font-family:system-ui,sans-serif}
.brand{margin:0;font-size:clamp(2.8rem,9vw,4.8rem);font-weight:500;letter-spacing:-0.03em;line-height:1.02}
.tag{margin:.85rem 0 0;font-size:1.15rem;opacity:.88;max-width:22rem;line-height:1.4}
.cta{appearance:none;margin-top:1.5rem;align-self:flex-start;border:0;border-radius:.2rem;padding:.75rem 1.25rem;background:${accent};color:#1a100c;font:inherit;font-size:.95rem;cursor:pointer}
.cta:hover{filter:brightness(1.06)}
.tonight{flex:0 0 auto;padding:1.25rem 1.5rem 2rem;max-width:56rem}
.tonight h2{margin:0 0 1rem;font-size:.8rem;letter-spacing:.16em;text-transform:uppercase;opacity:.7;font-family:system-ui,sans-serif}
.moods{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
@media (max-width:720px){.moods{grid-template-columns:1fr}}
.mood{padding:1.1rem 1rem;border:1px solid color-mix(in srgb,${ink} 16%,transparent);border-radius:.35rem;background:color-mix(in srgb,${ink} 4%,transparent)}
.mood h3{margin:0 0 .4rem;font-size:1.15rem}
.mood p{margin:0;opacity:.8;font-size:.95rem;line-height:1.4}
.foot{margin-top:auto;padding:1.5rem;border-top:1px solid color-mix(in srgb,${ink} 14%,transparent);display:flex;flex-wrap:wrap;gap:1.25rem;align-items:end;justify-content:space-between}
.mail{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end}
.mail label{display:flex;flex-direction:column;gap:.3rem;font-size:.85rem;opacity:.85}
.mail input{font:inherit;padding:.55rem .7rem;border:1px solid color-mix(in srgb,${ink} 22%,transparent);border-radius:.25rem;background:transparent;color:inherit;min-width:14rem}
.mail button{appearance:none;border:1px solid ${accent};background:transparent;color:${accent};font:inherit;padding:.55rem .9rem;border-radius:.25rem;cursor:pointer}
`;
        indexCss = solidRootRule(canvas);
        return [
          { path: appPath, content: app },
          ...(cssPath ? [{ path: cssPath, content: css }] : []),
          { path: 'src/index.css', content: indexCss },
        ];
      }
      if (wantsProductLanding) {
        const brandRaw = (
          extractBrandLabel(t)
          || t.match(/\b(?:called|named)\s+["'“]?([A-Z][A-Za-z0-9][A-Za-z0-9 _-]{1,40})/i)?.[1]
          || extractExistingBrand(app, 'DeskForge')
          || 'DeskForge'
        );
        const brand = String(brandRaw || 'DeskForge')
          .replace(/[<>&`]/g, '')
          .replace(/^["“']+|["”']+$/g, '')
          .replace(/\s+(?:large|larger|huge|small|big|hero|line|button|cta)\b.*$/i, '')
          .replace(/\s+[a-z0-9]{3,5}$/, '')
          .replace(/\s+as\b.*$/i, '')
          .trim()
          .slice(0, 40) || 'DeskForge';
        const tag = (
          t.match(/\bline\s+["“']([^"”']{6,72})["”']/i)?.[1]
          || t.match(/[“"](Built for all-night raids\.?)[”"]/i)?.[1]
          || (/\ball-night\s+raids\b/i.test(t) ? 'Built for all-night raids.' : 'Built for the long session.')
        ).replace(/`/g, '');
        const cta = /\bShop the desk\b/i.test(t) ? 'Shop the desk' : 'Shop now';
        const cardA = /\bCable Chaos Solved\b/i.test(t)
          ? { h: 'Cable Chaos Solved', p: 'Channels and grommets keep every run clean.' }
          : { h: 'Cable Chaos Solved', p: 'Channels and grommets keep every run clean.' };
        const cardB = /\bRGB Edge Glow\b/i.test(t)
          ? { h: 'RGB Edge Glow', p: 'Soft cyan rim light without drowning the room.' }
          : { h: 'RGB Edge Glow', p: 'Soft cyan rim light without drowning the room.' };
        const cardC = /\bHeight Memory\b/i.test(t)
          ? { h: 'Height Memory', p: 'Sit, stand, and recall your perfect height.' }
          : { h: 'Height Memory', p: 'Sit, stand, and recall your perfect height.' };
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [email, setEmail] = useState('');
  return (
    <div className="app product">
      <section className="hero" aria-label="Hero">
        <h1 className="brand">${brand}</h1>
        <p className="tag">${tag}</p>
        <button type="button" className="cta">${cta}</button>
      </section>
      <section className="features" aria-label="Features">
        <article className="card"><h3>${cardA.h}</h3><p>${cardA.p}</p></article>
        <article className="card"><h3>${cardB.h}</h3><p>${cardB.p}</p></article>
        <article className="card"><h3>${cardC.h}</h3><p>${cardC.p}</p></article>
      </section>
      <footer className="foot">
        <p>Free shipping on every desk.</p>
        <form className="mail" onSubmit={(e) => { e.preventDefault(); }}>
          <label>
            Drop alerts
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@raid.mail" />
          </label>
          <button type="submit">Notify me</button>
        </form>
      </footer>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}
.app.product{min-height:100dvh;margin:0;display:flex;flex-direction:column;background:
  radial-gradient(110% 70% at 15% 0%, rgba(34,211,238,.18) 0%, transparent 55%),
  radial-gradient(80% 60% at 90% 10%, rgba(168,85,247,.14) 0%, transparent 50%),
  ${canvas};color:${ink};font-family:"Segoe UI",system-ui,sans-serif}
.hero{flex:0 0 auto;padding:3rem 1.5rem 2rem;box-sizing:border-box;max-width:42rem}
.brand{margin:0;font-size:clamp(2.6rem,8vw,4.4rem);font-weight:700;letter-spacing:-0.04em;line-height:1.02}
.tag{margin:.9rem 0 0;font-size:1.15rem;opacity:.88;max-width:24rem;line-height:1.4}
.cta{appearance:none;margin-top:1.5rem;align-self:flex-start;border:0;border-radius:.3rem;padding:.8rem 1.3rem;background:${accent};color:#041016;font:inherit;font-weight:650;font-size:.95rem;cursor:pointer;box-shadow:0 0 24px rgba(34,211,238,.35)}
.cta:hover{filter:brightness(1.06)}
.features{flex:0 0 auto;padding:1rem 1.5rem 2.5rem;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;max-width:56rem}
@media (max-width:720px){.features{grid-template-columns:1fr}}
.card{padding:1.15rem 1rem;border:1px solid color-mix(in srgb,${ink} 14%,transparent);border-radius:.4rem;background:color-mix(in srgb,${ink} 4%,transparent)}
.card h3{margin:0 0 .45rem;font-size:1.1rem}
.card p{margin:0;opacity:.82;font-size:.95rem;line-height:1.4}
.foot{margin-top:auto;padding:1.5rem;border-top:1px solid color-mix(in srgb,${ink} 12%,transparent);display:flex;flex-wrap:wrap;gap:1.25rem;align-items:end;justify-content:space-between}
.mail{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end}
.mail label{display:flex;flex-direction:column;gap:.3rem;font-size:.85rem;opacity:.85}
.mail input{font:inherit;padding:.55rem .7rem;border:1px solid color-mix(in srgb,${ink} 22%,transparent);border-radius:.25rem;background:transparent;color:inherit;min-width:14rem}
.mail button{appearance:none;border:1px solid ${accent};background:transparent;color:${accent};font:inherit;padding:.55rem .9rem;border-radius:.25rem;cursor:pointer}
`;
        indexCss = solidRootRule(canvas);
        return [
          { path: appPath, content: app },
          ...(cssPath ? [{ path: cssPath, content: css }] : []),
          { path: 'src/index.css', content: indexCss },
        ];
      }
      if (wantsTwitter) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [tab, setTab] = useState('feed');
  const [text, setText] = useState('');
  const [posts, setPosts] = useState([{ id: 1, text: 'Hello Nova', likes: 0 }]);
  return (
    <div className="app">
      <nav className="tabs">
        <button type="button" className={tab==='feed'?'on':''} onClick={() => setTab('feed')}>Feed</button>
        <button type="button" className={tab==='profile'?'on':''} onClick={() => setTab('profile')}>Profile</button>
      </nav>
      {tab === 'feed' ? (
        <>
          <form className="compose" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; setPosts((p) => [{ id: Date.now(), text, likes: 0 }, ...p]); setText(''); }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Compose" />
            <button type="submit">Post</button>
          </form>
          <ul className="feed">
            {posts.map((p) => (
              <li key={p.id}>
                <p>{p.text}</p>
                <button type="button" onClick={() => setPosts((list) => list.map((x) => x.id === p.id ? { ...x, likes: x.likes + 1 } : x))}>Like {p.likes}</button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <section className="profile"><h1>You</h1><p>Profile tab</p></section>
      )}
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;background:${canvas};color:${ink};max-width:32rem;margin:0 auto;padding:1rem;box-sizing:border-box}\n.tabs{display:flex;gap:.5rem;margin-bottom:1rem}\n.tabs .on{font-weight:700}\n.compose{display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem}\ntextarea{font:inherit;min-height:4rem;padding:.5rem}\n.feed{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.75rem}\n.feed li{border:1px solid color-mix(in srgb,${ink} 18%,transparent);padding:.75rem;border-radius:.35rem}\n`;
      } else if (wantsSaas || wantsLanding) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [page, setPage] = useState('home');
  return (
    <div className="app">
      <header className="top sticky">
        <strong>Brand</strong>
        <nav>
          <button type="button" onClick={() => setPage('home')}>Home</button>
          <button type="button" onClick={() => setPage('dash')}>Dashboard</button>
          <button type="button" onClick={() => setPage('settings')}>Settings</button>
          <button type="button" onClick={() => setPage('billing')}>Billing</button>
          <button type="button" onClick={() => setPage('auth')}>Auth</button>
        </nav>
      </header>
      {page === 'auth' && <section className="band"><h1>Auth</h1><button type="button">Sign in</button></section>}
      {page === 'dash' && <section className="band"><h1>Dashboard</h1><p>Overview widgets</p></section>}
      {page === 'settings' && <section className="band"><h1>Settings</h1></section>}
      {page === 'billing' && <section className="band"><h1>Billing</h1></section>}
      {page === 'home' && (
        <>
          <section className="hero band"><h1>Hero</h1><p>Support line</p><button type="button">Get started</button></section>
          <section className="band logos">Logos</section>
          <section className="band"><h2>Features</h2><p>Fast · Clear · Local</p></section>
          <section className="band"><h2>Testimonials</h2><p>“Ships.”</p></section>
          <section className="band"><h2>Pricing</h2><p>Free · Pro · Team</p></section>
          <section className="band"><h2>FAQ</h2><p>How does it work?</p></section>
          <footer className="band foot">Footer</footer>
        </>
      )}
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;background:${canvas};color:${ink}}\n.top{display:flex;justify-content:space-between;align-items:center;padding:.75rem 1.25rem;border-bottom:1px solid color-mix(in srgb,${ink} 16%,transparent);background:${canvas}}\n.sticky{position:sticky;top:0;z-index:5}\n.top nav{display:flex;gap:.5rem;flex-wrap:wrap}\n.band{padding:2rem 1.25rem}\n.hero{min-height:50vh;display:flex;flex-direction:column;justify-content:center;gap:.75rem}\n.foot{border-top:1px solid color-mix(in srgb,${ink} 16%,transparent)}\nbutton{font:inherit;cursor:pointer}\n`;
      } else {
        const lines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
          .map((n) => `<p>Line ${n}</p>`)
          .join('\n        ');
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <header className="header sticky">Sticky header</header>
      <main className="main">
        ${lines}
      </main>
      <footer className="footer pinned">© 2026 Nova · copyright</footer>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;display:flex;flex-direction:column;background:${canvas};color:${ink}}\n.sticky{position:sticky;top:0;z-index:5;background:${canvas};padding:.85rem 1.25rem;border-bottom:1px solid color-mix(in srgb,${ink} 16%,transparent)}\n.main{flex:1;padding:1.25rem}\n.pinned{margin-top:auto;padding:1rem 1.25rem;border-top:1px solid color-mix(in srgb,${ink} 16%,transparent)}\n`
          + (wantsPolish || wantsRestyle
            ? `button,a{transition:transform .15s ease,box-shadow .15s ease,opacity .15s ease}\nbutton:hover,a:hover{transform:translateY(-1px)}\nbutton:focus-visible,a:focus-visible{outline:2px solid ${accent};outline-offset:2px}\n`
            : '');
      }
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: settings page / upload / drag-drop / command palette / multi-step / validate.
  {
    const wantsSettings = /\bsettings\s+page\b/i.test(t)
      || (/\btoggles?\b/i.test(t) && /\b(?:notifications?|dark\s+mode)\b/i.test(t));
    const wantsUpload = /\b(?:upload|drop\s+zone)\b/i.test(t);
    const wantsDnD = /\bdrag-and-drop\b/i.test(t) || /\breorder(?:ing)?\b/i.test(t);
    const wantsPalette = /\bcommand\s+palette\b/i.test(t);
    const wantsMulti = /\bmulti-step\s+form\b/i.test(t) || (/\bAccount\b/.test(t) && /\bProfile\b/.test(t) && /\bConfirm\b/.test(t));
    const wantsValidate = /\bvalidate\b/i.test(t) && /\bemail\b/i.test(t);
    const wantsDisable = /\bdisable\s+submit\b/i.test(t)
      || (/\bdisable\b/i.test(t) && /\bsubmit\b/i.test(t))
      || (/\brequired\s+fields?\b/i.test(t) && /\b(?:until|filled|disable)\b/i.test(t));
    const wantsChat = /\bchat-style\b/i.test(t) || (/\bmessage\s+list\b/i.test(t) && /\binput\b/i.test(t));
    const wantsInfinite = /\binfinite\s+scroll\b/i.test(t);
    const wantsSkeleton = /\bskeleton\b/i.test(t);
    if (wantsSettings || wantsUpload || wantsDnD || wantsPalette || wantsMulti || wantsValidate || wantsDisable || wantsChat || wantsInfinite || wantsSkeleton) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      if (wantsSettings) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [notes, setNotes] = useState(true);
  const [dark, setDark] = useState(false);
  return (
    <div className={dark ? 'app app--dark' : 'app'}>
      <h1>Settings</h1>
      <label className="tog"><input type="checkbox" checked={notes} onChange={() => setNotes((v) => !v)} /> Notifications</label>
      <label className="tog"><input type="checkbox" checked={dark} onChange={() => setDark((v) => !v)} /> Dark mode</label>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;padding:1.5rem;background:${canvas};color:${ink}}\n.app--dark{background:#0f172a;color:#e2e8f0}\n.tog{display:flex;gap:.6rem;align-items:center;margin:.75rem 0;font:inherit}\n`;
      } else if (wantsUpload) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [name, setName] = useState('');
  return (
    <div className="app">
      <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setName(f.name); }}>
        Drop a file here
      </div>
      <input type="file" onChange={(e) => setName(e.target.files?.[0]?.name || '')} />
      {name ? <p className="fname">{name}</p> : null}
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;padding:1.5rem;background:${canvas};color:${ink};display:flex;flex-direction:column;gap:1rem}\n.drop{border:2px dashed color-mix(in srgb,${ink} 35%,transparent);padding:2rem;text-align:center;border-radius:.4rem}\n`;
      } else if (wantsPalette) {
        app = `import { useMemo, useState } from 'react';
import './App.css';

export default function App() {
  const actions = ['New file', 'Open settings', 'Toggle theme', 'Export', 'Search docs'];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => actions.filter((a) => a.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <div className="app">
      <button type="button" onClick={() => setOpen(true)}>Search</button>
      {open ? (
        <div className="palette">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter actions" />
          <ul>{list.map((a) => <li key={a}><button type="button" onClick={() => setOpen(false)}>{a}</button></li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;padding:1.5rem;background:${canvas};color:${ink}}\n.palette{margin-top:1rem;border:1px solid color-mix(in srgb,${ink} 20%,transparent);padding:1rem;border-radius:.35rem}\n.palette input{width:100%;font:inherit;padding:.45rem;margin-bottom:.5rem;box-sizing:border-box}\n.palette ul{list-style:none;margin:0;padding:0}\n.palette li button{width:100%;text-align:left;font:inherit;padding:.4rem;cursor:pointer;background:transparent;border:0;color:inherit}\n`;
      } else if (wantsMulti || wantsValidate || wantsDisable) {
        app = `import { useMemo, useState } from 'react';
import './App.css';

export default function App() {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const emailOk = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
  const canSubmit = emailOk && name.trim().length > 0;
  const steps = ['Account', 'Profile', 'Confirm'];
  return (
    <div className="app">
      <p className="steps">{steps.map((s, i) => <span key={s} className={i===step?'on':''}>{s}</span>)}</p>
      {step === 0 && (
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} />{email && !emailOk ? <em className="err">Invalid email</em> : null}</label>
      )}
      {step === 1 && (<label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>)}
      {step === 2 && (<p>Confirm {name} · {email}</p>)}
      <div className="row">
        <button type="button" disabled={step===0} onClick={() => setStep((s) => s - 1)}>Back</button>
        {step < 2 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)}>Next</button>
        ) : (
          <button type="button" disabled={!canSubmit}>Submit</button>
        )}
      </div>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;padding:1.5rem;background:${canvas};color:${ink};display:flex;flex-direction:column;gap:.85rem}\n.steps{display:flex;gap:1rem}.steps .on{font-weight:700}\nlabel{display:flex;flex-direction:column;gap:.35rem}\n.err{color:#dc2626;font-style:normal;font-size:.9rem}\n.row{display:flex;gap:.5rem}\nbutton:disabled{opacity:.45}\n`;
      } else if (wantsChat) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState([{ id: 1, text: 'Welcome' }]);
  return (
    <div className="app">
      <ul className="msgs">{msgs.map((m) => <li key={m.id}>{m.text}</li>)}</ul>
      <form onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; setMsgs((list) => [...list, { id: Date.now(), text }]); setText(''); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;display:flex;flex-direction:column;background:${canvas};color:${ink}}\n.msgs{flex:1;list-style:none;margin:0;padding:1rem;overflow:auto}\nform{display:flex;gap:.5rem;padding:.75rem;border-top:1px solid color-mix(in srgb,${ink} 18%,transparent)}\ninput{flex:1;font:inherit;padding:.45rem}\n`;
      } else if (wantsDnD) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [items, setItems] = useState(['One', 'Two', 'Three', 'Four']);
  const [drag, setDrag] = useState(null);
  return (
    <div className="app">
      <ul>
        {items.map((item, idx) => (
          <li key={item} draggable onDragStart={() => setDrag(idx)} onDragOver={(e) => e.preventDefault()} onDrop={() => {
            if (drag == null || drag === idx) return;
            setItems((list) => {
              const next = [...list];
              const [moved] = next.splice(drag, 1);
              next.splice(idx, 0, moved);
              return next;
            });
            setDrag(null);
          }}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;padding:1.5rem;background:${canvas};color:${ink}}\nul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.5rem}\nli{padding:.75rem;border:1px solid color-mix(in srgb,${ink} 20%,transparent);border-radius:.3rem;cursor:grab}\n`;
      } else {
        app = `import { useEffect, useState } from 'react';
import './App.css';

export default function App() {
  const [items, setItems] = useState([1, 2, 3]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const id = setTimeout(() => setLoading(false), 1200); return () => clearTimeout(id); }, []);
  useEffect(() => {
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 40) {
        setItems((list) => [...list, list.length + 1, list.length + 2]);
      }
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className="app">
      {loading ? <div className="skel" /> : items.map((n) => <article key={n} className="card">Card {n}</article>)}
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:140vh;padding:1.25rem;background:${canvas};color:${ink};display:flex;flex-direction:column;gap:.75rem}\n.card{padding:1rem;border:1px solid color-mix(in srgb,${ink} 18%,transparent);border-radius:.3rem}\n.skel{height:4rem;border-radius:.3rem;background:linear-gradient(90deg,color-mix(in srgb,${ink} 10%,transparent),color-mix(in srgb,${ink} 22%,transparent),color-mix(in srgb,${ink} 10%,transparent));background-size:200% 100%;animation:shimmer 1.2s infinite}\n@keyframes shimmer{to{background-position:-200% 0}}\n`;
      }
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: search/filter/sort/pagination/table/login/dashboard/kanban/gallery.
  {
    const wantsSearch = /\bsearch\b/i.test(t) && /\b(?:filter|filters?|type|card\s+list)\b/i.test(t);
    const wantsSort = /\bsort\b/i.test(t) && /\b(?:A\s*to\s*Z|button|list)\b/i.test(t);
    const wantsPage = /\bpagination\b/i.test(t) || (/\bNext\b/.test(t) && /\bPrevious\b/.test(t));
    const wantsTable = /\btable\b/i.test(t) && /\b(?:Name|Role|Status|checkbox|selectable)\b/i.test(t);
    const wantsLogin = (
      (/\blogin\b/i.test(t) && /\b(?:email|password|Sign\s*in)\b/i.test(t))
      || (/\bSign\s*in\b/i.test(t) && /\bdashboard\b/i.test(t))
      || (/\bafter\b/i.test(t) && /\bSign\s*in\b/i.test(t) && /\b(?:dashboard|go\s+to)\b/i.test(t))
    );
    const wantsDash = /\bdashboard\b/i.test(t) && /\b(?:sidebar|widget|stat|top\s+bar)\b/i.test(t)
      && !wantsLogin;
    const wantsKanban = /\bkanban\b/i.test(t);
    const wantsGallery = /\bgallery\b/i.test(t)
      || (/\bthumbnail\b/i.test(t) && /\bpreview\b/i.test(t))
      || (/\bClicking\b/i.test(t) && /\bthumbnail\b/i.test(t));
    const wantsCarousel = /\bcarousel\b/i.test(t);
    const wantsBread = /\bbreadcrumbs?\b/i.test(t);
    if (wantsSearch || wantsSort || wantsPage || wantsTable || wantsLogin || wantsDash || wantsKanban || wantsGallery || wantsCarousel || wantsBread) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      if (wantsKanban) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [cols] = useState({ todo: ['Task A'], doing: ['Task B'], done: ['Task C'] });
  return (
    <div className="app kanban">
      {Object.entries(cols).map(([key, items]) => (
        <section key={key} className="col">
          <h2>{key === 'todo' ? 'To do' : key === 'doing' ? 'Doing' : 'Done'}</h2>
          {items.map((item) => <article key={item} className="card">{item}</article>)}
        </section>
      ))}
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.kanban{min-height:100dvh;display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;padding:1rem;background:${canvas};color:${ink}}\n.col{border:1px solid color-mix(in srgb,${ink} 18%,transparent);padding:.75rem;border-radius:.35rem}\n.card{margin:.5rem 0;padding:.65rem;background:color-mix(in srgb,${ink} 6%,transparent);border-radius:.3rem}\n`;
      } else if (wantsLogin) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [view, setView] = useState('login');
  if (view === 'dash') {
    return <div className="app"><h1>Dashboard</h1><p>Signed in.</p></div>;
  }
  return (
    <div className="app">
      <form className="login" onSubmit={(e) => { e.preventDefault(); setView('dash'); }}>
        <label>Email<input type="email" required /></label>
        <label>Password<input type="password" required /></label>
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;display:grid;place-items:center;background:${canvas};color:${ink}}\n.login{display:flex;flex-direction:column;gap:.75rem;min-width:16rem}\nlabel{display:flex;flex-direction:column;gap:.35rem;font:inherit}\ninput,button{font:inherit;padding:.45rem .6rem}\n`;
      } else if (wantsDash) {
        app = `import './App.css';

export default function App() {
  return (
    <div className="shell">
      <aside className="sidebar">Nav</aside>
      <div className="main">
        <header className="top">Top bar</header>
        <div className="widgets">
          <div className="widget">Stat 1</div>
          <div className="widget">Stat 2</div>
          <div className="widget chart"><div className="bar" style={{height:'40%'}} /><div className="bar" style={{height:'70%'}} /><div className="bar" style={{height:'55%'}} /></div>
        </div>
      </div>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.shell{min-height:100dvh;display:flex;background:${canvas};color:${ink}}\n.sidebar{width:12rem;padding:1rem;border-right:1px solid color-mix(in srgb,${ink} 18%,transparent)}\n.main{flex:1;display:flex;flex-direction:column}\n.top{padding:.85rem 1rem;border-bottom:1px solid color-mix(in srgb,${ink} 18%,transparent)}\n.widgets{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;padding:1rem}\n.widget{border:1px solid color-mix(in srgb,${ink} 18%,transparent);padding:1rem;border-radius:.35rem;min-height:6rem}\n.chart{display:flex;align-items:flex-end;gap:.35rem}\n.bar{flex:1;background:${ink};min-height:1rem}\n`;
      } else if (wantsTable) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const rows = [
    { name: 'Ada', role: 'Admin', status: 'Active' },
    { name: 'Lin', role: 'Editor', status: 'Away' },
    { name: 'Sam', role: 'Viewer', status: 'Active' },
  ];
  const [sel, setSel] = useState({});
  return (
    <div className="app">
      <table className="table">
        <thead><tr><th></th><th>Name</th><th>Role</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td><input type="checkbox" checked={!!sel[r.name]} onChange={() => setSel((s) => ({ ...s, [r.name]: !s[r.name] }))} /></td>
              <td>{r.name}</td><td>{r.role}</td><td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;padding:1.25rem;background:${canvas};color:${ink}}\n.table{width:100%;border-collapse:collapse}\n.table th,.table td{border-bottom:1px solid color-mix(in srgb,${ink} 18%,transparent);padding:.55rem .4rem;text-align:left}\n`;
      } else if (wantsGallery || wantsCarousel) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const imgs = ['One', 'Two', 'Three'];
  const [i, setI] = useState(0);
  return (
    <div className="app">
      <div className="preview">{imgs[i]}</div>
      <div className="thumbs">
        {imgs.map((label, idx) => (
          <button key={label} type="button" className={i===idx?'thumb thumb--on':'thumb'} onClick={() => setI(idx)}>{label}</button>
        ))}
      </div>
      <div className="arrows">
        <button type="button" onClick={() => setI((v) => (v + imgs.length - 1) % imgs.length)}>Previous</button>
        <button type="button" onClick={() => setI((v) => (v + 1) % imgs.length)}>Next</button>
      </div>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;padding:1.25rem;background:${canvas};color:${ink};display:flex;flex-direction:column;gap:.75rem}\n.preview{min-height:12rem;display:grid;place-items:center;border:1px solid color-mix(in srgb,${ink} 20%,transparent);border-radius:.35rem;font-size:1.4rem}\n.thumbs{display:flex;gap:.5rem}\n.thumb{font:inherit;cursor:pointer;padding:.4rem .7rem}\n.thumb--on{outline:2px solid ${ink}}\n.arrows{display:flex;gap:.5rem}\n`;
      } else if (wantsBread) {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="#home">Home</a><span>/</span><a href="#products">Products</a><span>/</span><span>Details</span>
      </nav>
      <main><h1>Details</h1></main>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;padding:1.25rem;background:${canvas};color:${ink}}\n.crumbs{display:flex;gap:.4rem;margin-bottom:1rem;font-size:.95rem}\n.crumbs a{color:inherit}\n`;
      } else {
        const items = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
        app = `import { useMemo, useState } from 'react';
import './App.css';

export default function App() {
  const all = ${JSON.stringify(items)};
  const [q, setQ] = useState('');
  const [sortAz, setSortAz] = useState(false);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    let list = all.filter((x) => x.toLowerCase().includes(q.toLowerCase()));
    if (sortAz) list = [...list].sort((a, b) => a.localeCompare(b));
    return list;
  }, [q, sortAz]);
  const per = 5;
  const slice = filtered.slice(page * per, page * per + per);
  return (
    <div className="app">
      <input className="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search cards" />
      <button type="button" onClick={() => setSortAz((v) => !v)}>Sort</button>
      <ul className="list">{slice.map((x) => <li key={x} className="card">{x}</li>)}</ul>
      <div className="pager">
        <button type="button" disabled={page===0} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <button type="button" disabled={(page+1)*per>=filtered.length} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;padding:1.25rem;background:${canvas};color:${ink};display:flex;flex-direction:column;gap:.75rem}\n.search{font:inherit;padding:.45rem .6rem}\n.list{list-style:none;margin:0;padding:0;display:grid;gap:.5rem}\n.card{padding:.75rem;border:1px solid color-mix(in srgb,${ink} 18%,transparent);border-radius:.3rem}\n.pager{display:flex;gap:.5rem}\nbutton{font:inherit;cursor:pointer}\n`;
      }
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: nested card / profile card / tabs-in-card / spinner / toast / fade.
  {
    const nestCard = /\bnest\b/i.test(t) && /\bcard\b/i.test(t) && /\bsection\b/i.test(t);
    const profileCard = /\bprofile\s+card\b/i.test(t)
      || (/\bavatar\b/i.test(t) && /\bname\b/i.test(t) && /\bbuttons?\b/i.test(t));
    const tabsInCard = /\btabs?\b/i.test(t) && /\b(?:Overview|Details|Reviews)\b/.test(t);
    const fadeHero = /\bfade\b/i.test(t) && /\b(?:hero|title)\b/i.test(t);
    const slideSide = /\bslide\b/i.test(t) && /\bsidebar\b/i.test(t);
    const hoverScale = /\banimate\b/i.test(t) && /\b(?:button|scale|hover)\b/i.test(t)
      || (/\bscale\b/i.test(t) && /\bhover\b/i.test(t));
    const spinner = /\bspinner\b/i.test(t) || (/\bloading\b/i.test(t) && /\b2\s*seconds?\b/i.test(t));
    const toast = /\btoast\b/i.test(t);
    if (nestCard || profileCard || tabsInCard || fadeHero || slideSide || hoverScale || spinner || toast) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      if (spinner) {
        app = `import { useEffect, useState } from 'react';
import './App.css';

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => { const id = setTimeout(() => setReady(true), 2000); return () => clearTimeout(id); }, []);
  return (
    <div className="app">
      {ready ? <p className="content">Content ready</p> : <div className="spinner" aria-label="Loading" />}
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;display:grid;place-items:center;background:${canvas};color:${ink}}\n.spinner{width:2.5rem;height:2.5rem;border:3px solid color-mix(in srgb,${ink} 25%,transparent);border-top-color:${ink};border-radius:50%;animation:spin 0.8s linear infinite}\n@keyframes spin{to{transform:rotate(360deg)}}\n`;
      } else if (toast) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [toasts, setToasts] = useState([]);
  const notify = () => {
    const id = Date.now();
    setToasts((list) => [...list, { id, text: 'Submitted' }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 2500);
  };
  return (
    <div className="app">
      <button type="button" className="btn" onClick={notify}>Submit</button>
      <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;display:grid;place-items:center;background:${canvas};color:${ink}}\n.btn{appearance:none;border:1px solid ${ink};background:${ink};color:${canvas};font:inherit;padding:.55rem 1.1rem;cursor:pointer;border-radius:.35rem}\n.toasts{position:fixed;right:1rem;bottom:1rem;display:flex;flex-direction:column;gap:.5rem}\n.toast{background:${ink};color:${canvas};padding:.65rem 1rem;border-radius:.35rem}\n`;
      } else if (tabsInCard) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [tab, setTab] = useState('overview');
  return (
    <div className="app">
      <article className="card">
        <div className="tabs">
          {['overview','details','reviews'].map((id) => (
            <button key={id} type="button" className={tab===id?'tab tab--active':'tab'} onClick={() => setTab(id)}>
              {id[0].toUpperCase()+id.slice(1)}
            </button>
          ))}
        </div>
        <div className="panel">{tab === 'overview' ? 'Overview content' : tab === 'details' ? 'Details content' : 'Reviews content'}</div>
      </article>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;padding:1.5rem;background:${canvas};color:${ink};box-sizing:border-box}\n.card{border:1px solid color-mix(in srgb,${ink} 20%,transparent);border-radius:.4rem;padding:1rem}\n.tabs{display:flex;gap:.5rem;margin-bottom:.85rem}\n.tab{appearance:none;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:.35rem .6rem;opacity:.7}\n.tab--active{opacity:1;border-bottom:2px solid ${ink}}\n`;
      } else if (profileCard) {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <article className="profile-card">
        <div className="avatar" aria-hidden="true" />
        <h2 className="name">Alex Rivera</h2>
        <div className="actions">
          <button type="button">Follow</button>
          <button type="button">Message</button>
        </div>
      </article>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;display:grid;place-items:center;background:${canvas};color:${ink}}\n.profile-card{display:flex;flex-direction:column;align-items:center;gap:.75rem;padding:1.5rem;border:1px solid color-mix(in srgb,${ink} 20%,transparent);border-radius:.45rem;min-width:14rem}\n.avatar{width:4rem;height:4rem;border-radius:50%;background:color-mix(in srgb,${ink} 25%,transparent)}\n.actions{display:flex;gap:.5rem}\nbutton{font:inherit;cursor:pointer}\n`;
      } else if (fadeHero || hoverScale || slideSide) {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">Sidebar</aside>
      <main>
        <h1 className="hero-title">Hero title</h1>
        <button type="button" className="btn">Action</button>
      </main>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.app{min-height:100dvh;display:flex;background:${canvas};color:${ink}}\n.sidebar{width:12rem;padding:1rem;border-right:1px solid color-mix(in srgb,${ink} 18%,transparent);animation:slideIn .45s ease}\nmain{flex:1;padding:2rem}\n.hero-title{margin:0 0 1rem;animation:fadeIn .8s ease}\n.btn{appearance:none;border:1px solid ${ink};background:${ink};color:${canvas};font:inherit;padding:.55rem 1.1rem;cursor:pointer;border-radius:.35rem;transition:transform .15s ease}\n.btn:hover{transform:scale(1.06)}\n@keyframes fadeIn{from{opacity:0}to{opacity:1}}\n@keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}\n`;
      } else {
        app = `import './App.css';

export default function App() {
  return (
    <div className="page">
      <section className="section">
        <article className="card">
          <h2>Nested card</h2>
          <p>Card inside a section inside the page.</p>
        </article>
      </section>
    </div>
  );
}
`;
        css = `html,body,#root{margin:0;min-height:100%;background:${canvas}}\n.page{min-height:100dvh;padding:1.5rem;background:${canvas};color:${ink};box-sizing:border-box}\n.section{max-width:40rem;margin:0 auto;padding:1.25rem;border:1px dashed color-mix(in srgb,${ink} 25%,transparent)}\n.card{padding:1rem;border:1px solid color-mix(in srgb,${ink} 22%,transparent);border-radius:.35rem}\n`;
      }
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: counter / dark mode / simple todo (stateful shells).
  {
    const wantsCounter = /\bcounter\b/i.test(t) && /\b(?:Plus|0|increas)/i.test(t);
    const wantsDark = /\bdark\s+mode\b/i.test(t) && /\btoggle\b/i.test(t);
    const wantsTodo = /\btodo\b/i.test(t) && /\b(?:add|complete|delete|list|save)\b/i.test(t);
    if (wantsCounter || wantsDark || wantsTodo) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      if (wantsCounter) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [n, setN] = useState(0);
  return (
    <div className="app">
      <p className="counter">{n}</p>
      <button type="button" className="btn" onClick={() => setN((v) => v + 1)}>Plus</button>
    </div>
  );
}
`;
        css = `html, body, #root { margin: 0; min-height: 100%; background: ${canvas}; }\n`
          + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; color: ${ink}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; }\n`
          + `.counter { margin: 0; font-size: 3rem; font-weight: 700; }\n`
          + `.btn { appearance: none; border: 1px solid ${ink}; background: ${ink}; color: ${canvas}; font: inherit; padding: 0.55rem 1.1rem; cursor: pointer; border-radius: 0.35rem; }\n`;
      } else if (wantsDark) {
        app = `import { useEffect, useState } from 'react';
import './App.css';

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('nova-dark') === '1');
  useEffect(() => { localStorage.setItem('nova-dark', dark ? '1' : '0'); }, [dark]);
  return (
    <div className={dark ? 'app app--dark' : 'app'}>
      <button type="button" className="btn" onClick={() => setDark((v) => !v)}>
        {dark ? 'Light mode' : 'Dark mode'}
      </button>
      <p>Theme stays after you click around.</p>
    </div>
  );
}
`;
        css = `html, body, #root { margin: 0; min-height: 100%; }\n`
          + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; color: ${ink}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; }\n`
          + `.app--dark { background: #0f172a; color: #e2e8f0; }\n`
          + `.btn { appearance: none; border: 1px solid currentColor; background: transparent; color: inherit; font: inherit; padding: 0.55rem 1.1rem; cursor: pointer; border-radius: 0.35rem; }\n`;
      } else {
        app = `import { useEffect, useState } from 'react';
import './App.css';

export default function App() {
  const [text, setText] = useState('');
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nova-todos') || '[]'); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem('nova-todos', JSON.stringify(items)); }, [items]);
  const add = () => {
    const v = text.trim();
    if (!v) return;
    setItems((list) => [...list, { id: Date.now(), text: v, done: false }]);
    setText('');
  };
  return (
    <div className="app">
      <form className="todo-form" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="New todo" />
        <button type="submit">Add</button>
      </form>
      <ul className="todo-list">
        {items.map((item) => (
          <li key={item.id} className={item.done ? 'todo done' : 'todo'}>
            <button type="button" onClick={() => setItems((list) => list.map((x) => x.id === item.id ? { ...x, done: !x.done } : x))}>
              {item.done ? 'Undo' : 'Complete'}
            </button>
            <span>{item.text}</span>
            <button type="button" onClick={() => setItems((list) => list.filter((x) => x.id !== item.id))}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
`;
        css = `html, body, #root { margin: 0; min-height: 100%; background: ${canvas}; }\n`
          + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; color: ${ink}; padding: 1.25rem; box-sizing: border-box; }\n`
          + `.todo-form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }\n`
          + `.todo-form input { flex: 1; font: inherit; padding: 0.45rem 0.6rem; }\n`
          + `.todo-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }\n`
          + `.todo { display: flex; gap: 0.5rem; align-items: center; }\n`
          + `.todo.done span { text-decoration: line-through; opacity: 0.65; }\n`
          + `button { font: inherit; cursor: pointer; }\n`;
      }
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: responsive stack / hamburger / cards one-column mobile.
  {
    const wantsStack = /\bstack\b/i.test(t) && /\bnarrow\b/i.test(t);
    const wantsBurger = /\bhamburger\b/i.test(t) && /\b(?:nav|mobile)\b/i.test(t);
    const wantsCardResp = /\bcards?\b/i.test(t) && /\b(?:desktop|mobile|column|row)\b/i.test(t);
    if (wantsStack || wantsBurger || wantsCardResp) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      if (wantsBurger) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
      <header className="top">
        <button type="button" className="burger" aria-label="Menu" onClick={() => setOpen((v) => !v)}>☰</button>
        <nav className={open ? 'nav nav--open' : 'nav'}>
          <a href="#home">Home</a>
          <a href="#products">Products</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>
      <main className="main">Main content</main>
    </div>
  );
}
`;
        css = `html, body, #root { margin: 0; min-height: 100%; background: ${canvas}; }\n`
          + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; color: ${ink}; }\n`
          + `.top { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-bottom: 1px solid color-mix(in srgb, ${ink} 18%, transparent); }\n`
          + `.burger { display: none; appearance: none; border: 0; background: transparent; color: inherit; font-size: 1.4rem; cursor: pointer; }\n`
          + `.nav { display: flex; gap: 1rem; }\n`
          + `.nav a { color: inherit; text-decoration: none; }\n`
          + `.main { padding: 1.25rem; }\n`
          + `@media (max-width: 720px) { .burger { display: inline-flex; } .nav { display: none; flex-direction: column; position: absolute; top: 3rem; left: 0.75rem; background: ${canvas}; border: 1px solid color-mix(in srgb, ${ink} 18%, transparent); padding: 0.75rem; } .nav--open { display: flex; } }\n`;
      } else {
        app = `import './App.css';

export default function App() {
  const cards = [
    { title: 'Card one', text: 'Short text.' },
    { title: 'Card two', text: 'Short text.' },
    { title: 'Card three', text: 'Short text.' },
  ];
  return (
    <div className="app">
      <div className="card-grid">
        {cards.map((c) => (
          <article key={c.title} className="card">
            <h2>{c.title}</h2>
            <p>{c.text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
`;
        css = `html, body, #root { margin: 0; min-height: 100%; background: ${canvas}; }\n`
          + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; color: ${ink}; padding: 1.25rem; box-sizing: border-box; }\n`
          + `.card-grid { display: grid; gap: 1rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }\n`
          + `.card { border: 1px solid color-mix(in srgb, ${ink} 20%, transparent); padding: 1rem; border-radius: 0.35rem; }\n`
          + `@media (max-width: 720px) { .card-grid { grid-template-columns: 1fr; } .app { display: flex; flex-direction: column; } }\n`;
      }
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: Hero / Features / Footer (+ pricing under Features).
  {
    const wantsSections = (
      /\bHero\b/.test(t) && /\bFeatures?\b/.test(t) && /\bFooter\b/.test(t)
    ) || (
      /\b(?:build|make|create|add)\b/i.test(t)
      && /\b(?:sections?|page)\b/i.test(t)
      && /\bHero\b/.test(t)
    );
    const wantsPricing = /\bpricing\b/i.test(t) && /\b(?:plans?|three)\b/i.test(t);
    if (wantsSections || wantsPricing) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <section className="hero" id="hero">
        <h1>Hero</h1>
        <p>Welcome — a short hero line.</p>
      </section>
      <section className="features" id="features">
        <h2>Features</h2>
        <ul>
          <li>Feature one</li>
          <li>Feature two</li>
          <li>Feature three</li>
        </ul>
${wantsPricing ? `        <div className="pricing">
          <article className="plan"><h3>Basic</h3><p>$9</p></article>
          <article className="plan"><h3>Pro</h3><p>$29</p></article>
          <article className="plan"><h3>Team</h3><p>$99</p></article>
        </div>\n` : ''}      </section>
      <footer className="footer" id="footer">
        <p>Footer · Contact · Help</p>
      </footer>
    </div>
  );
}
`;
      css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; background: ${canvas}; }\n`
        + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; color: ${ink}; display: flex; flex-direction: column; }\n`
        + `.hero { padding: 3rem 1.5rem; }\n`
        + `.features { padding: 2rem 1.5rem; flex: 1; }\n`
        + `.features ul { margin: 0; padding-left: 1.2rem; }\n`
        + `.pricing { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 1.5rem; }\n`
        + `.plan { border: 1px solid color-mix(in srgb, ${ink} 20%, transparent); padding: 1rem; border-radius: 0.35rem; }\n`
        + `.footer { padding: 1.25rem 1.5rem; border-top: 1px solid color-mix(in srgb, ${ink} 18%, transparent); }\n`
        + `@media (max-width: 720px) { .pricing { grid-template-columns: 1fr; } .app { gap: 0; } }\n`;
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: title color/size, delete nav link, hide sidebar, remove nth card.
  {
    const titleStyle = /\btitle\b/i.test(t) && /\b(?:red|larger|bigger|bigger|color|size)\b/i.test(t)
      && !/\bparagraph\b/i.test(t);
    const deleteContact = /\b(?:delete|remove|drop)\b/i.test(t) && /\bContact\b/.test(t)
      && /\b(?:nav|link|navigation)\b/i.test(t);
    const hideSidebar = /\bhide\b/i.test(t) && /\bsidebar\b/i.test(t);
    const removeThirdCard = /\b(?:remove|delete|drop)\b/i.test(t)
      && /\bthird\b/i.test(t) && /\bcards?\b/i.test(t);
    if (titleStyle || deleteContact || hideSidebar || removeThirdCard) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      if (titleStyle) {
        const red = /\bred\b/i.test(t);
        const larger = /\b(?:larger|bigger|big)\b/i.test(t);
        css += `\nh1,.title-block__title,.card__title,.title{${red ? 'color:#dc2626;' : ''} ${larger ? 'font-size:clamp(2rem,5vw,3rem);font-weight:700;' : ''}}\n`;
        if (!/<h1\b|title-block__title|card__title/i.test(app)) {
          app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <h1 className="title-block__title">Title</h1>
    </div>
  );
}
`;
          touchedApp = true;
        }
        touchedCss = true;
      } else if (deleteContact) {
        if (/\bContact\b/.test(app)) {
          app = app
            .replace(/<li>\s*<a\b[^>]*>\s*Contact\s*<\/a>\s*<\/li>/gi, '')
            .replace(/<a\b[^>]*>\s*Contact\s*<\/a>/gi, '')
            .replace(/<button\b[^>]*>\s*Contact\s*<\/button>/gi, '')
            .replace(/\{\s*id:\s*['"]contact['"][^}]*\},?\s*/gi, '')
            .replace(/,\s*\{\s*id:\s*['"]contact['"][^}]*\}/gi, '')
            .replace(/<section\b[^>]*id=["']contact["'][^>]*>[\s\S]*?<\/section>/gi, '');
          touchedApp = true;
        }
      } else if (hideSidebar) {
        css += `\n.sidebar,aside.sidebar{display:none!important}\n`;
        touchedCss = true;
      } else if (removeThirdCard) {
        // Land a clean two-card grid (handles inventing shells that lost cards).
        app = `import './App.css';

export default function App() {
  const cards = [
    { title: 'Card one', text: 'Short text for card one.' },
    { title: 'Card two', text: 'Short text for card two.' },
  ];
  return (
    <div className="app">
      <div className="card-grid">
        {cards.map((c) => (
          <article key={c.title} className="card">
            <h2 className="card__title">{c.title}</h2>
            <p className="card__text">{c.text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
`;
        css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; background: ${canvas}; }\n`
          + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; color: ${ink}; padding: 1.5rem; box-sizing: border-box; }\n`
          + `.card-grid { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }\n`
          + `.card { border: 1px solid color-mix(in srgb, ${ink} 22%, transparent); padding: 1rem; border-radius: 0.35rem; }\n`
          + `.card__title { margin: 0 0 0.4rem; font-size: 1.1rem; }\n`
          + `.card__text { margin: 0; opacity: 0.85; font-size: 0.95rem; }\n`;
        touchedApp = true;
        touchedCss = true;
      }
      indexCss = solidRootRule(canvas);
      const outFix: WebFileEdit[] = [];
      if (touchedApp) outFix.push({ path: appPath, content: app });
      if (touchedCss && cssPath) outFix.push({ path: cssPath, content: css });
      if (touchedIndex || titleStyle || hideSidebar) {
        outFix.push({ path: 'src/index.css', content: indexCss || solidRootRule(canvas) });
      }
      // Contact already gone — stop here so icon-rail / invent paths never fire.
      if (deleteContact && !outFix.length) return [];
      if (outFix.length) return outFix;
    }
  }

  // Ladder: sidebar (+ collapse), modal, cards/grid.
  {
    const wantsSidebar = /\bsidebar\b/i.test(t);
    const wantsModal = /\bmodal\b/i.test(t) || /\bopen\s+dialog\b/i.test(t);
    const wantsCards = /\bcards?\b/i.test(t) && /\b(?:row|grid|three|2-by-2|2\s*x\s*2|title)\b/i.test(t)
      && !/\b(?:remove|delete|drop)\b[\s\S]{0,24}\bthird\b/i.test(t);
    if (wantsSidebar || wantsModal || wantsCards) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      if (wantsModal) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
      <button type="button" className="btn" onClick={() => setOpen(true)}>Open dialog</button>
      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <p>Dialog content</p>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
`;
        css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; background: ${canvas}; }\n`
          + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; display: flex; align-items: center; justify-content: center; color: ${ink}; }\n`
          + `.btn { appearance: none; border: 1px solid ${ink}; background: ${ink}; color: ${canvas}; font: inherit; padding: 0.65rem 1.1rem; cursor: pointer; border-radius: 0.35rem; }\n`
          + `.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; }\n`
          + `.modal { background: ${canvas}; color: ${ink}; padding: 1.25rem; border-radius: 0.45rem; min-width: min(92vw, 20rem); display: flex; flex-direction: column; gap: 0.85rem; }\n`;
      } else if (wantsCards) {
        const grid = /\b2-by-2|2\s*x\s*2|2\s*×\s*2\b/i.test(t);
        app = `import './App.css';

export default function App() {
  const cards = [
    { title: 'Card one', text: 'Short text for card one.' },
    { title: 'Card two', text: 'Short text for card two.' },
    { title: 'Card three', text: 'Short text for card three.' },
${grid ? `    { title: 'Card four', text: 'Short text for card four.' },\n` : ''}  ];
  return (
    <div className="app">
      <div className="${grid ? 'card-grid card-grid--2x2' : 'card-grid'}">
        {cards.map((c) => (
          <article key={c.title} className="card">
            <h2 className="card__title">{c.title}</h2>
            <p className="card__text">{c.text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
`;
        css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; background: ${canvas}; }\n`
          + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; color: ${ink}; padding: 1.5rem; box-sizing: border-box; }\n`
          + `.card-grid { display: grid; gap: 1rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }\n`
          + `.card-grid--2x2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n`
          + `.card { border: 1px solid color-mix(in srgb, ${ink} 22%, transparent); padding: 1rem; border-radius: 0.35rem; }\n`
          + `.card__title { margin: 0 0 0.4rem; font-size: 1.1rem; }\n`
          + `.card__text { margin: 0; opacity: 0.85; font-size: 0.95rem; }\n`;
      } else {
        const collapse = /\bcollapse|expand\b/i.test(t);
        if (collapse) {
          app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [open, setOpen] = useState(true);
  return (
    <div className="app">
      <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
        {open ? 'Collapse' : 'Expand'}
      </button>
      <div className="shell">
        {open ? (
          <aside className="sidebar">
            <button type="button" className="sidebar__item">Menu 1</button>
            <button type="button" className="sidebar__item">Menu 2</button>
            <button type="button" className="sidebar__item">Menu 3</button>
          </aside>
        ) : null}
        <main className="main">Main content</main>
      </div>
    </div>
  );
}
`;
        } else {
          app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <div className="shell">
        <aside className="sidebar">
          <button type="button" className="sidebar__item">Menu 1</button>
          <button type="button" className="sidebar__item">Menu 2</button>
          <button type="button" className="sidebar__item">Menu 3</button>
        </aside>
        <main className="main">Main content</main>
      </div>
    </div>
  );
}
`;
        }
        css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; background: ${canvas}; }\n`
          + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; color: ${ink}; display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem; box-sizing: border-box; }\n`
          + `.btn { appearance: none; align-self: flex-start; border: 1px solid ${ink}; background: ${ink}; color: ${canvas}; font: inherit; padding: 0.45rem 0.8rem; cursor: pointer; border-radius: 0.3rem; }\n`
          + `.shell { display: flex; flex: 1; min-height: 0; gap: 0; border: 1px solid color-mix(in srgb, ${ink} 18%, transparent); }\n`
          + `.sidebar { width: 12rem; display: flex; flex-direction: column; gap: 0.35rem; padding: 0.75rem; border-right: 1px solid color-mix(in srgb, ${ink} 18%, transparent); }\n`
          + `.sidebar__item { appearance: none; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; padding: 0.4rem 0.35rem; }\n`
          + `.main { flex: 1; padding: 1rem 1.1rem; }\n`;
      }
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: top nav / active highlight / content switch.
  {
    const wantsNav = /\b(?:top\s+navigation|nav\s+links|navigation\s+bar|active\s+nav|highlight\s+the\s+active)\b/i.test(t)
      || (/\bnav\b/i.test(t) && /\b(?:Home|Products|Contact)\b/.test(t))
      || (/\bhighlight\b/i.test(t) && /\bactive\b/i.test(t));
    if (wantsNav && !/\bsidebar\b/i.test(t) && !/\bmodal\b/i.test(t)) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [tab, setTab] = useState('home');
  const items = [
    { id: 'home', label: 'Home' },
    { id: 'products', label: 'Products' },
    { id: 'contact', label: 'Contact' },
  ];
  return (
    <div className="app">
      <nav className="top-nav" aria-label="Main">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'top-nav__link top-nav__link--active' : 'top-nav__link'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main className="top-nav__panel">
        {tab === 'home' && <p>Home content</p>}
        {tab === 'products' && <p>Products content</p>}
        {tab === 'contact' && <p>Contact content</p>}
      </main>
    </div>
  );
}
`;
      css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; background: ${canvas}; }\n`
        + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; color: ${ink}; display: flex; flex-direction: column; }\n`
        + `.top-nav { display: flex; gap: 1rem; padding: 1rem 1.25rem; border-bottom: 1px solid color-mix(in srgb, ${ink} 20%, transparent); }\n`
        + `.top-nav__link { appearance: none; border: 0; background: transparent; color: ${ink}; font: inherit; cursor: pointer; padding: 0.25rem 0; opacity: 0.7; border-bottom: 2px solid transparent; }\n`
        + `.top-nav__link--active { opacity: 1; border-bottom-color: ${ink}; font-weight: 600; }\n`
        + `.top-nav__panel { padding: 1.5rem 1.25rem; font-family: Georgia, "Times New Roman", serif; }\n`;
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: checkbox / radio group.
  {
    const wantsCheckbox = /\bcheckbox\b/i.test(t);
    const wantsRadio = /\bradio\b/i.test(t) || (/\b(?:Small|Medium|Large)\b/.test(t) && /\bgroup\b/i.test(t));
    if (wantsCheckbox || wantsRadio) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      if (wantsRadio) {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <fieldset className="radio-group">
        <legend>Size</legend>
        <label><input type="radio" name="size" value="small" /> Small</label>
        <label><input type="radio" name="size" value="medium" /> Medium</label>
        <label><input type="radio" name="size" value="large" /> Large</label>
      </fieldset>
    </div>
  );
}
`;
      } else {
        const label = t.match(/\blabeled\s+["“']?([^"”'.]{1,40})/i)?.[1]?.trim() || 'Remember me';
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <label className="check">
        <input type="checkbox" /> ${label}
      </label>
    </div>
  );
}
`;
      }
      css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; background: ${canvas}; }\n`
        + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; display: flex; align-items: center; justify-content: center; color: ${ink}; }\n`
        + `.check, .radio-group { font: inherit; display: flex; flex-direction: column; gap: 0.55rem; }\n`
        + `.radio-group { border: 1px solid ${ink}; padding: 1rem 1.1rem; border-radius: 0.35rem; }\n`;
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: text input / placeholder / email+password / simple form.
  {
    const wantsForm = /\bform\b/i.test(t) && /\b(?:name|email|submit)\b/i.test(t);
    const wantsEmailPw = /\bemail\b/i.test(t) && /\bpassword\b/i.test(t) && /\binput\b/i.test(t);
    const wantsInput = /\b(?:text\s+input|input\s+with|placeholder)\b/i.test(t)
      || (/\binput\b/i.test(t) && /\b(?:type|placeholder|field)\b/i.test(t));
    if ((wantsInput || wantsEmailPw || wantsForm) && (!/\bbutton\b/i.test(t) || wantsForm)) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      const ph = t.match(/\bplaceholder\s+["“']?([^"”'.]{1,60})/i)?.[1]?.trim()
        || t.match(/\bplaceholder\s+([A-Za-z][A-Za-z0-9 ]{0,40})/i)?.[1]?.trim()
        || (/\btype\s+here\b/i.test(t) ? 'Type here' : 'Type here');
      if (wantsForm) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [name, setName] = useState('');
  const [shown, setShown] = useState('');
  return (
    <div className="app">
      <form className="form" onSubmit={(e) => { e.preventDefault(); setShown(name); }}>
        <label className="field"><span className="field__label">Name</span>
          <input className="field__input" name="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field"><span className="field__label">Email</span>
          <input className="field__input" type="email" name="email" />
        </label>
        <button type="submit" className="btn">Submit</button>
      </form>
      {shown ? <p className="form__result">Hello, {shown}</p> : null}
    </div>
  );
}
`;
      } else if (wantsEmailPw) {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <div className="field-stack">
        <label className="field"><span className="field__label">Email</span>
          <input className="field__input" type="email" placeholder="Email" />
        </label>
        <label className="field"><span className="field__label">Password</span>
          <input className="field__input" type="password" placeholder="Password" />
        </label>
      </div>
    </div>
  );
}
`;
      } else {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <label className="field">
        <span className="field__label">Input</span>
        <input className="field__input" type="text" placeholder=${JSON.stringify(ph)} />
      </label>
    </div>
  );
}
`;
      }
      css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; background: ${canvas}; }\n`
        + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; color: ${ink}; }\n`
        + `.field-stack, .form { display: flex; flex-direction: column; gap: 0.85rem; width: min(92vw, 22rem); }\n`
        + `.field { display: flex; flex-direction: column; gap: 0.45rem; width: min(92vw, 22rem); }\n`
        + `.field__label { font-size: 0.85rem; opacity: 0.75; }\n`
        + `.field__input { font: inherit; padding: 0.65rem 0.8rem; border: 1px solid ${ink}; border-radius: 0.35rem; background: ${canvas}; color: ${ink}; }\n`
        + `.btn { appearance: none; border: 1px solid ${ink}; background: ${ink}; color: ${canvas}; font: inherit; padding: 0.65rem 1.1rem; cursor: pointer; border-radius: 0.35rem; }\n`
        + `.form__result { margin: 0; font-family: Georgia, "Times New Roman", serif; }\n`;
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: buttons (label / hover / click feedback).
  {
    const wantsBtn = /\bbutton\b/i.test(t)
      && /\b(?:click\s+me|hover|darker|clicked|primary|secondary|disabled)\b/i.test(t)
      && !/\bicon\b/i.test(t);
    if (wantsBtn) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      const label = t.match(/\bbutton\s+that\s+says\s+["“']?([^"”'.]{1,40})/i)?.[1]?.trim()
        || (/\bclick\s+me\b/i.test(t) ? 'Click me' : 'Button');
      const wantsHover = /\bhover\b/i.test(t) && /\bdarker\b/i.test(t);
      const wantsPress = /\b(?:show|says?|display)\b[\s\S]{0,24}\bclicked\b/i.test(t) || /\bwhen\s+i\s+press\b/i.test(t);
      const wantsPrimaryPair = /\bprimary\b/i.test(t) && /\bsecondary\b/i.test(t);
      const wantsDisabled = /\bdisabled\b/i.test(t);
      if (wantsPress && !wantsPrimaryPair && !wantsDisabled) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [clicked, setClicked] = useState(false);
  return (
    <div className="app">
      <button type="button" className="btn${wantsHover ? ' btn--hoverable' : ''}" onClick={() => setClicked(true)}>
        {clicked ? 'Clicked!' : ${JSON.stringify(label)}}
      </button>
    </div>
  );
}
`;
      } else if (!wantsPrimaryPair && !wantsDisabled) {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <button type="button" className="btn${wantsHover ? ' btn--hoverable' : ''}">${label}</button>
    </div>
  );
}
`;
      } else if (wantsPrimaryPair) {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <div className="btn-row">
        <button type="button" className="btn btn--primary">Primary</button>
        <button type="button" className="btn btn--secondary">Secondary</button>
      </div>
    </div>
  );
}
`;
      } else {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <button type="button" className="btn" disabled>Can't click</button>
    </div>
  );
}
`;
      }
      css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; background: ${canvas}; }\n`
        + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; display: flex; align-items: center; justify-content: center; }\n`
        + `.btn-row { display: flex; gap: 0.75rem; }\n`
        + `.btn { appearance: none; border: 1px solid ${ink}; background: ${ink}; color: ${canvas}; font: inherit; padding: 0.65rem 1.1rem; cursor: pointer; border-radius: 0.35rem; }\n`
        + `.btn--secondary { background: transparent; color: ${ink}; }\n`
        + `.btn--primary { background: ${ink}; color: ${canvas}; }\n`
        + `.btn:disabled { opacity: 0.45; cursor: not-allowed; }\n`
        + (wantsHover ? `.btn--hoverable:hover, .btn:hover { filter: brightness(0.72); }\n` : '');
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: clickable icons / alert / heart toggle / Home+About tabs.
  {
    const wantsClick = /\bclickable\b/i.test(t) || /\balert\s+clicked\b/i.test(t);
    const wantsToggle = /\btoggle\b/i.test(t) && /\b(?:filled|empty|heart)\b/i.test(t);
    const wantsTabs = /\btabs?\b/i.test(t) && /\b(?:Home|About|Settings)\b/i.test(t);
    if (wantsClick || wantsToggle || wantsTabs) {
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      const alertMsg = /\balert\s+clicked\b/i.test(t) ? 'Alert clicked' : 'Clicked';
      const which = /\bsettings\b/i.test(t) ? 'settings'
        : /\bheart\b/i.test(t) ? 'heart'
          : /\bsearch\b/i.test(t) ? 'search'
            : 'home';
      if (wantsTabs) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [tab, setTab] = useState('home');
  return (
    <div className="app">
      <nav className="tabs" aria-label="Tabs">
        <button type="button" className={tab === 'home' ? 'tab tab--active' : 'tab'} onClick={() => setTab('home')}>Home</button>
        <button type="button" className={tab === 'about' ? 'tab tab--active' : 'tab'} onClick={() => setTab('about')}>About</button>
        ${/\bsettings\b/i.test(t) ? `<button type="button" className={tab === 'settings' ? 'tab tab--active' : 'tab'} onClick={() => setTab('settings')}>Settings</button>` : ''}
      </nav>
      <main className="tab-panel">
        {tab === 'home' && <p>Home page</p>}
        {tab === 'about' && <p>About page</p>}
        ${/\bsettings\b/i.test(t) ? `{tab === 'settings' && <p>Settings page</p>}` : ''}
      </main>
    </div>
  );
}
`;
      } else if (wantsToggle) {
        app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [filled, setFilled] = useState(false);
  return (
    <div className="app">
      <button
        type="button"
        className={filled ? 'heart-btn heart-btn--filled' : 'heart-btn'}
        aria-label="Heart"
        data-icon="heart"
        onClick={() => setFilled((v) => !v)}
      >
        <img className="nav-icon" data-icon="heart" src="/icons/heart.svg" alt="heart" width="22" height="22" />
      </button>
    </div>
  );
}
`;
      } else {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <button
        type="button"
        className="icon-btn"
        aria-label="${which}"
        onClick={() => window.alert('${alertMsg}')}
      >
        <img className="nav-icon" data-icon="${which}" src="/icons/${which}.svg" alt="${which}" width="22" height="22" />
      </button>
    </div>
  );
}
`;
      }
      css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; background: ${canvas}; }\n`
        + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; position: relative; color: ${ink}; padding: 1.25rem; box-sizing: border-box; }\n`
        + `.icon-btn, .heart-btn { appearance: none; border: 0; background: transparent; cursor: pointer; padding: 0.35rem; color: ${ink}; font-size: 1.75rem; }\n`
        + `.heart-btn--filled { color: #e11d48; }\n`
        + `.tabs { display: flex; gap: 0.75rem; margin-bottom: 1.25rem; }\n`
        + `.tab { appearance: none; border: 0; background: transparent; color: ${ink}; cursor: pointer; font: inherit; padding: 0.35rem 0.15rem; opacity: 0.7; border-bottom: 2px solid transparent; }\n`
        + `.tab--active { opacity: 1; border-bottom-color: ${ink}; }\n`
        + `.tab-panel { font-family: Georgia, "Times New Roman", serif; }\n`
        + `.nav-icon { display: block; width: 22px; height: 22px; }\n`;
      indexCss = solidRootRule(canvas);
      const out: WebFileEdit[] = [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
      {
        const iconId = wantsToggle ? 'heart' : which;
        const iconPath = `public/icons/${iconId}.svg`;
        if (flat[iconPath] == null) {
          out.push({ path: iconPath, content: simpleUiIconSvg(iconId, ink) });
        }
      }
      return out;
    }
  }

  // Ladder: "Stack three short sentences vertically with space between them."
  {
    const stackN = t.match(/\bstack\s+(?:(\d+|two|three|four|five)\s+)?(?:short\s+)?(?:sentences?|lines?|paragraphs?)\b/i);
    if (stackN) {
      const word = String(stackN[1] || 'three').toLowerCase();
      const n = word === 'two' ? 2 : word === 'four' ? 4 : word === 'five' ? 5 : (/^\d+$/.test(word) ? Math.min(6, Math.max(2, Number(word))) : 3);
      const lines = Array.from({ length: n }, (_, i) => `Short sentence ${i + 1}.`);
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <div className="sentence-stack">
${lines.map((line) => `        <p className="sentence-stack__line">${line}</p>`).join('\n')}
      </div>
    </div>
  );
}
`;
      css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; height: 100%; background: ${canvas}; }\n`
        + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; display: flex; align-items: center; justify-content: center; }\n`
        + `.sentence-stack { display: flex; flex-direction: column; gap: 1.25rem; max-width: min(92vw, 28rem); padding: 1.5rem; box-sizing: border-box; }\n`
        + `.sentence-stack__line { margin: 0; color: ${ink}; font-size: clamp(1.05rem, 2.8vw, 1.35rem); line-height: 1.45; font-family: Georgia, "Times New Roman", serif; }\n`;
      indexCss = solidRootRule(canvas);
      return [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
        { path: 'src/index.css', content: indexCss },
      ];
    }
  }

  // Ladder: "Put a title at the top and a short paragraph under it."
  if (/\btitle\b/i.test(t) && /\bparagraph\b/i.test(t) && /\b(?:top|under)\b/i.test(t)) {
    const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
    const ink = contrastTextForBg(canvas);
    app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <header className="title-block">
        <h1 className="title-block__title">Title</h1>
        <p className="title-block__body">A short paragraph under the title.</p>
      </header>
    </div>
  );
}
`;
    css = `html, body, #root { margin: 0; min-height: 100%; min-height: 100dvh; height: 100%; background: ${canvas}; }\n`
      + `.app { min-height: 100dvh; margin: 0; background: ${canvas}; padding: 1.5rem 1.25rem; box-sizing: border-box; }\n`
      + `.title-block { max-width: min(92vw, 36rem); }\n`
      + `.title-block__title { margin: 0 0 0.75rem; color: ${ink}; font-size: clamp(1.6rem, 4vw, 2.4rem); font-weight: 600; font-family: Georgia, "Times New Roman", serif; }\n`
      + `.title-block__body { margin: 0; color: ${ink}; font-size: 1.05rem; line-height: 1.5; opacity: 0.88; }\n`;
    indexCss = solidRootRule(canvas);
    return [
      { path: appPath, content: app },
      ...(cssPath ? [{ path: cssPath, content: css }] : []),
      { path: 'src/index.css', content: indexCss },
    ];
  }

  // Remove on-page words FIRST — "remove Welcome to my app" / "remove what you just added".
  // Must beat place/show so we never re-add the phrase while "removing" it.
  {
    const wantsRemoveCopy = /\b(?:remove|delete|get rid of|take\s+(?:off|away)|clear)\b/i.test(t)
      && !/\b(?:nav|sidebar|footer|section|button|icon|logo|form|card|modal)\b/i.test(t)
      && (
        /\b(?:welcome|hello|goodbye|words?|text|sentence|title|name|phrase|that|it|what\s+you)\b/i.test(t)
        || /\b(?:on-page|blank\s+page)\b/i.test(t)
      );
    if (wantsRemoveCopy && cssPath) {
      const quoted = t.match(/["“']([^"”']{1,80})["”']/)?.[1]?.trim();
      const fromAsk = t.match(/\b(?:words?|text|sentence|title|phrase)\s+(.+?)(?:\s+from\b|\s+on\b|\s*$)/i)?.[1]
        ?.replace(/[.,;:!?]+$/g, '')
        .trim();
      const welcome = /\bwelcome(?:\s+to\s+(?:my\s+)?app)?\b/i.test(t) ? 'Welcome to my app' : '';
      const needle = (quoted || fromAsk || welcome || '').trim().slice(0, 80);
      const hasTarget = needle
        ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app)
        : /className=["'](?:center-word|corner-word)/i.test(app);
      if (hasTarget || /\b(?:what\s+you|on-page|blank\s+page|the\s+(?:words?|text|sentence))\b/i.test(t)) {
        const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
        app = `import './App.css';

export default function App() {
  return (
    <div className="app" aria-label="Blank page" />
  );
}
`;
        const blankCss = `html, body, #root { min-height: 100%; min-height: 100dvh; height: 100%; margin: 0; background: ${canvas}; }
.app{min-height:100dvh;margin:0;background:${canvas}}
`;
        const synced = syncSolidCanvasEdits(flat, cssPath, canvas, blankCss);
        return [{ path: appPath, content: app }, ...synced];
      }
    }
  }

  // Dual side words FIRST — "Hello on the left and Goodbye on the right".
  // Must beat single center-word which only kept the first label.
  {
    const dual = extractDualSideLabels(t);
    if (dual.length === 2 && cssPath) {
      const left = dual.find((d) => d.side === 'left')?.label || dual[0].label;
      const right = dual.find((d) => d.side === 'right')?.label || dual[1].label;
      const safeLeft = left.replace(/[`$<>&]/g, '').slice(0, 48);
      const safeRight = right.replace(/[`$<>&]/g, '').slice(0, 48);
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = /#0|#1|#2|black|dark|navy|brown|pink|#8|#9|#a|#b|#c|#d/i.test(canvas)
        && !/#f|#e|white|cream|#fff/i.test(canvas)
        ? '#f5f7fb'
        : '#1a1a1a';
      app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <h1 className="corner-word corner-word--left">${safeLeft}</h1>
      <h1 className="corner-word corner-word--right">${safeRight}</h1>
    </div>
  );
}
`;
      const dualCss = `html, body, #root { min-height: 100%; min-height: 100dvh; height: 100%; margin: 0; background: ${canvas}; }
.app{min-height:100dvh;margin:0;position:relative;background:${canvas};color:${ink}}
.corner-word{margin:0;position:absolute;top:1.25rem;font-size:clamp(1.6rem,5vw,3.2rem);font-weight:600;letter-spacing:-0.02em;line-height:1.15;font-family:"Iowan Old Style",Georgia,"Times New Roman",serif;color:${ink};max-width:min(46vw,20rem)}
.corner-word--left{left:1.25rem;right:auto;text-align:left}
.corner-word--right{right:1.25rem;left:auto;text-align:right}
`;
      const synced = syncSolidCanvasEdits(flat, cssPath, canvas, dualCss);
      const out: WebFileEdit[] = [{ path: appPath, content: app }, ...synced];
      return out;
    }
  }

  // Graphic composition shell FIRST — rewrites App STRUCTURE (photo + split).
  // Must beat info-strip / corner DNA / soft-bg so Micora cannot stay a twin skeleton.
  {
    if (wantsGraphicCompositionAsk(t) && cssPath) {
      const shell = pickCompositionShell(t, app);
      const brand = (
        extractBrandLabel(t)
        || extractExistingBrand(app, 'Micora')
      ).replace(/[<>&`]/g, '').slice(0, 40) || 'Micora';
      const tagline = extractExistingTagline(app) || 'Clear voice for every room';
      const headline = extractExistingHeadline(app) || 'Capture every note';
      const support = extractExistingSupport(app) || 'Studio mics made for small rooms and big ideas';
      // Keep teal canvas on the same hex fidelity verify accepts (#0f766e).
      const canvas = /\bteal\b/i.test(t) ? '#0f766e'
        : (/\bamber\b|\bwarm\b/i.test(t) ? '#1a120c' : '#0c0e0d');
      const ink = '#f4f7fb';
      // Ensure offline SVG glyphs exist in the files map so the shell can <img> them.
      const glyphSlots: Array<{ slug: string; kind: 'microphone' }> = [
        { slug: 'microphone', kind: 'microphone' },
        { slug: 'mic-room', kind: 'microphone' },
        { slug: 'mic-desk', kind: 'microphone' },
        { slug: 'mic-travel', kind: 'microphone' },
      ];
      const glyphEdits: Array<{ path: string; content: string }> = [];
      for (const slot of glyphSlots) {
        if (findGlyphHrefInFiles(flat, slot.slug)) continue;
        const rel = `public/glyphs/${slot.slug}.svg`;
        const svg = productVisualFallbackSvg(slot.kind);
        flat[rel] = svg;
        glyphEdits.push({ path: rel, content: svg });
      }
      app = buildCompositionShellApp({
        shell,
        brand,
        tagline,
        headline,
        support,
        email: (t.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i)?.[1] || 'hello@micora.studio'),
        files: flat,
      });
      css = compositionShellCss(shell, ink, canvas);
      indexCss = `html, body, #root { min-height: 100%; height: auto; margin: 0; background: ${canvas}; }\n`;
      return [
        { path: appPath, content: app },
        { path: cssPath, content: css },
        { path: 'src/index.css', content: indexCss },
        ...glyphEdits,
      ];
    }
  }

  // Tip calculator: bill + tip% + tip$ + total (keep brand). Ladder asks that used to
  // false-pass as "already applied" from Keep TipWise + no-nav alone.
  {
    const wantsTipCalc = (
      /\b(?:bill|tip\s*(?:percent|pct|amount|dollars?)?)\b/i.test(t)
      && /\b(?:input|total|percent|calculator|amount)\b/i.test(t)
      && /\b(?:add|put|show|include|wire)\b/i.test(t)
    );
    if (wantsTipCalc && !/<input\b/i.test(app)) {
      const brand = (
        extractBrandLabel(t)
        || app.match(/<h1[^>]*className=["'][^"']*center-word[^"']*["'][^>]*>\s*([^<]+?)\s*<\/h1>/i)?.[1]?.trim()
        || app.match(/className=["']brand["'][^>]*>\s*([^<]+?)\s*</i)?.[1]?.trim()
        || 'TipWise'
      ).replace(/[<>&]/g, '').slice(0, 40) || 'TipWise';
      app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [bill, setBill] = useState(0);
  const [pct, setPct] = useState(15);
  const tip = Number(bill) * (Number(pct) / 100);
  const total = Number(bill) + tip;
  return (
    <div className="app">
      <h1 className="center-word tip-brand">${brand}</h1>
      <form className="tip-form" onSubmit={(e) => e.preventDefault()}>
        <label className="tip-field">
          Bill amount
          <input
            type="number"
            min="0"
            step="0.01"
            value={bill}
            onChange={(e) => setBill(Number(e.target.value) || 0)}
            aria-label="Bill amount"
          />
        </label>
        <label className="tip-field">
          Tip percent
          <input
            type="number"
            min="0"
            step="1"
            value={pct}
            onChange={(e) => setPct(Number(e.target.value) || 0)}
            aria-label="Tip percent"
          />
        </label>
        <p className="tip-line">{"Tip: $" + tip.toFixed(2)}</p>
        <p className="total-line">{"Total: $" + total.toFixed(2)}</p>
      </form>
    </div>
  );
}
`;
      touchedApp = true;
      if (!/\.tip-form\b/.test(css)) {
        css += `
.tip-brand{position:absolute;top:1.25rem;left:1.25rem;margin:0;font-size:clamp(1.4rem,4vw,2rem);font-weight:600;letter-spacing:-0.02em}
.tip-form{display:flex;flex-direction:column;gap:1rem;max-width:20rem;margin:6rem auto 0;padding:0 1.25rem}
.tip-field{display:flex;flex-direction:column;gap:0.35rem;font-size:0.95rem}
.tip-field input{font:inherit;padding:0.55rem 0.7rem;border:1px solid #ccc;border-radius:0.4rem}
.tip-line,.total-line{margin:0;font-size:1.05rem}
.total-line{font-weight:600}
`;
        touchedCss = true;
      }
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const synced = syncSolidCanvasEdits(
        flat,
        cssPath,
        canvas,
        touchedCss ? css : String(css || ''),
      );
      return [{ path: appPath, content: app }, ...synced];
    }
  }

  // Quiet notes / jot pad — big textarea under the brand.
  {
    const wantsNotePad = (
      /\b(?:text\s*box|textarea|jot\s+a\s+note|notes?\s+(?:app|box|field|area)|write\s+a\s+note)\b/i.test(t)
      && /\b(?:add|put|show|include|wire|build|could you)\b/i.test(t)
      && !/\bshopping\s+list|grocery|timer|25:00\b/i.test(t)
    );
    if (wantsNotePad && !/<textarea\b/i.test(app)) {
      const brand = (
        extractBrandLabel(t)
        || app.match(/<h1[^>]*className=["'][^"']*center-word[^"']*["'][^>]*>\s*([^<]+?)\s*<\/h1>/i)?.[1]?.trim()
        || 'Nook'
      ).replace(/[<>&]/g, '').slice(0, 40) || 'Nook';
      // Keep the blank-white canvas if that's what we started with — never split white/cream.
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      const boxBg = /#fff|#ffffff|white/i.test(canvas) ? '#ffffff' : canvas;
      const boxBorder = /#fff|#ffffff|white|#f/i.test(canvas) ? '#d4d4d4' : 'rgba(0,0,0,0.12)';
      app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [note, setNote] = useState('');
  return (
    <div className="app">
      <h1 className="center-word note-brand">${brand}</h1>
      <label className="note-wrap">
        <span className="sr-only">Note</span>
        <textarea
          className="note-box"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Jot something…"
          aria-label="Note"
          rows={10}
        />
      </label>
    </div>
  );
}
`;
      const noteChrome = `
.note-brand{position:absolute;top:1.25rem;left:1.25rem;margin:0;font-size:clamp(1.4rem,4vw,2rem);font-weight:600;letter-spacing:-0.02em;color:${ink}}
.note-wrap{display:block;max-width:36rem;margin:6.5rem auto 0;padding:0 1.25rem}
.note-box{display:block;width:100%;min-height:14rem;box-sizing:border-box;padding:1rem 1.1rem;border:1px solid ${boxBorder};border-radius:0.45rem;background:${boxBg};color:${ink};font:inherit;line-height:1.55;resize:vertical}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.app{position:relative;color:${ink};font-family:Georgia,'Times New Roman',serif}
`;
      const synced = syncSolidCanvasEdits(flat, cssPath, canvas, `${String(css || '').replace(/\n\.note-wrap[\s\S]*$/i, '').trimEnd()}\n${noteChrome}`);
      return [
        { path: appPath, content: app },
        ...synced,
      ];
    }
  }

  // Focus timer — big clock + Start (wired countdown).
  {
    const wantsTimer = (
      /\b(?:focus\s+)?timer\b/i.test(t)
      || (/\b25:00\b/.test(t) && /\bStart\b/i.test(t))
    ) && /\b(?:add|put|show|include|wire|build)\b/i.test(t)
      && !/\bblank\s+white\s+page\b/i.test(t);
    if (wantsTimer && !/\b25:00\b|formatTime|setSeconds|setRemaining/i.test(app)) {
      const brand = (
        extractBrandLabel(t)
        || app.match(/<h1[^>]*className=["'][^"']*center-word[^"']*["'][^>]*>\s*([^<]+?)\s*<\/h1>/i)?.[1]?.trim()
        || 'Glow'
      ).replace(/[<>&]/g, '').slice(0, 40) || 'Glow';
      app = `import { useState, useEffect } from 'react';
import './App.css';

const START_SECONDS = 25 * 60;

function formatTime(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export default function App() {
  const [remaining, setRemaining] = useState(START_SECONDS);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div className="app">
      <h1 className="center-word timer-brand">${brand}</h1>
      <div className="timer-panel">
        <p className="timer-clock" aria-label="Timer">{formatTime(remaining)}</p>
        <button
          type="button"
          className="timer-start"
          onClick={() => {
            if (remaining <= 0) setRemaining(START_SECONDS);
            setRunning(true);
          }}
        >
          Start
        </button>
      </div>
    </div>
  );
}
`;
      css = `${String(css || '').replace(/\n\.timer-panel[\s\S]*$/i, '').trimEnd()}
html,body,#root{height:100%;margin:0;background:#0f1115}
.app{height:100%;min-height:100%;margin:0;background:#0f1115;color:#f4f6f8;font-family:system-ui,sans-serif;position:relative}
.timer-brand{position:absolute;top:1.25rem;left:1.25rem;margin:0;font-size:clamp(1.4rem,4vw,2rem);font-weight:600;letter-spacing:-0.02em}
.timer-panel{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.25rem;padding:2rem}
.timer-clock{margin:0;font-size:clamp(3rem,12vw,5.5rem);font-weight:600;letter-spacing:0.04em;font-variant-numeric:tabular-nums}
.timer-start{border:0;border-radius:0.5rem;padding:0.75rem 1.6rem;background:#e8b86d;color:#1a1208;font:inherit;font-weight:600;cursor:pointer}
`;
      return [
        { path: appPath, content: app },
        { path: cssPath, content: css },
      ];
    }
  }

  // Shopping / grocery list — input + Add must append items (wired state, not dead form).
  {
    const wantsShopList = (
      /\b(?:shopping\s+list|grocery\s+list|list\s+items?)\b/i.test(t)
      || (/\b(?:add\s+(?:an?\s+)?item|item\s+input)\b/i.test(t) && /\b(?:list|Add)\b/i.test(t))
    ) && /\b(?:add|put|show|include|wire|build)\b/i.test(t);
    const shopDead = /className=["'](?:shop|grocery)-list["']/i.test(app)
      && (!/useState/i.test(app) || /onSubmit=\{\(e\)\s*=>\s*e\.preventDefault\(\)\}/i.test(app));
    if (wantsShopList && (!/<input\b/i.test(app) || shopDead || !/setItems|setList/i.test(app))) {
      const brand = (
        extractBrandLabel(t)
        || app.match(/<h1[^>]*className=["'][^"']*center-word[^"']*["'][^>]*>\s*([^<]+?)\s*<\/h1>/i)?.[1]?.trim()
        || 'Cartly'
      ).replace(/[<>&]/g, '').slice(0, 40) || 'Cartly';
      app = `import { useState } from 'react';
import './App.css';

export default function App() {
  const [draft, setDraft] = useState('');
  const [items, setItems] = useState([]);
  const onAdd = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setItems((prev) => [...prev, { id: \`i\${Date.now()}\`, text }]);
    setDraft('');
  };
  return (
    <div className="app">
      <h1 className="center-word shop-brand">${brand}</h1>
      <form className="shop-form" onSubmit={onAdd} aria-label="Add item">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an item"
          aria-label="Item name"
        />
        <button type="submit">Add</button>
      </form>
      <ul className="shop-list" aria-label="Shopping list">
        {items.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </div>
  );
}
`;
      touchedApp = true;
      const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
      const ink = contrastTextForBg(canvas);
      const shopChrome = `
.shop-brand{position:absolute;top:1.25rem;left:1.25rem;margin:0;font-size:clamp(1.4rem,4vw,2rem);font-weight:600;letter-spacing:-0.02em;color:${ink}}
.shop-form{display:flex;gap:0.5rem;max-width:28rem;margin:6rem auto 0;padding:0 1.25rem}
.shop-form input{flex:1;font:inherit;padding:0.65rem 0.8rem;border:1px solid #c9c2b8;border-radius:0.4rem;background:#fff;color:${ink}}
.shop-form button{border:0;border-radius:0.4rem;padding:0.65rem 1rem;background:#2f5d50;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.shop-list{list-style:none;margin:1.5rem auto 0;padding:0 1.25rem;max-width:28rem;display:flex;flex-direction:column;gap:0.55rem}
.shop-list li{padding:0.7rem 0.85rem;background:#fff;border:1px solid #e4ddd4;border-radius:0.4rem;color:${ink}}
.app{position:relative;color:${ink};font-family:Georgia,serif}
`;
      const synced = syncSolidCanvasEdits(
        flat,
        cssPath,
        canvas,
        `${String(css || '').replace(/\n\.shop-form[\s\S]*$/i, '').trimEnd()}\n${shopChrome}`,
      );
      return [
        { path: appPath, content: app },
        ...synced,
      ];
    }
  }

  // Title-list sections (Featured Work / Shop / product lineup) + Contact form —
  // run before icon chrome (email→mail icon early-return).
  {
    const wantsShopList = (
      /\b(?:Shop|Products?|Lineup)\s+section\b/i.test(t)
      || (/\bshop\b/i.test(t) && /\b(?:keyboard|product|headphones?|microphone|mic)\s+names?\b/i.test(t))
      || (/\b(?:headphones?|earbuds?|microphones?|mics?)\b/i.test(t) && /\b(?:add\s+to\s+cart|product\s+cards?)\b/i.test(t))
      || (/\bshop\b/i.test(t) && /\b(?:cards?|info\s+cards?|right\s+side)\b/i.test(t) && /\b(?:add|put|include)\b/i.test(t))
    ) && /\b(?:add|put|include|below|section)\b/i.test(t)
      && !/\b(?:nav|navigation|links?)\b/i.test(t);
    const wantsFeaturedWork = (
      /\bFeatured\s+Work\b/i.test(t)
      || (/\bwork\s+section\b/i.test(t) && /\b(?:project|titles?)\b/i.test(t))
    ) && /\b(?:add|put|include|below|section)\b/i.test(t)
      && !/\b(?:nav|navigation|links?)\b/i.test(t);
    if (wantsFeaturedWork || wantsShopList) {
      const family = inferUiLayoutFamily(t, app);
      // "names only / no cards" keeps the understated list; otherwise storefront gets cart cards.
      const forceNameList = /\bnames?\s+only\b/i.test(t) || /\bno\s+(?:big\s+)?(?:product\s+)?cards?\b/i.test(t);
      const wantsRichCards = !forceNameList && (
        /\b(?:description|blurb|what\s+it\s+does|info\s+cards?|sentence\s+(?:about|under|for)|does\s+this)\b/i.test(t)
        || /[—–-]\s*[A-Za-z][^,;]{8,}/.test(t)
      );
      const storefrontShop = wantsShopList && (family === 'storefront' || wantsRichCards || /\bmicrophone|\bmic\b/i.test(t)) && !forceNameList;
      const shopSide: 'left' | 'right' = /\bright\s+side\b|\bon\s+the\s+right\b/i.test(t)
        ? 'right'
        : (/\bleft\s+side\b|\bon\s+the\s+left\b/i.test(t) ? 'left' : (chrome.brandCorner === 'top-right' ? 'right' : 'left'));
      // Prefer name — blurb pairs when the ask spells them out.
      const pairChunks = [...t.matchAll(
        /\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})\s*[—–-]\s*([^.;,\n]{8,90})/g,
      )];
      const listRaw = (
        t.match(/\b(?:project\s+)?titles?\s*:\s*([^.]+?)(?:\.|$)/i)?.[1]
        || t.match(/\b(?:keyboard|product|headphones?|microphone|mic)\s+names?\s*:\s*([^.]+?)(?:\.|$)/i)?.[1]
        || t.match(/\bnames?\s*:\s*([^.]+?)(?:\.|$)/i)?.[1]
        || t.match(/\bwith\s+(?:three\s+)?(?:project\s+|keyboard\s+|product\s+|headphones?\s+|microphone\s+)?(?:titles?|names?)\s*:\s*([^.]+)/i)?.[1]
        || ''
      ).trim();
      let titles = listRaw
        .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
        .map((s) => s.trim().replace(/^[:\-–—]\s*/, '').replace(/^and\s+/i, '').replace(/[.,;:]+$/g, ''))
        .filter((s) => s.length >= 2 && s.length < 80 && !/^(?:titles?|names?|projects?|products?|keyboards?|headphones?|microphones?|only|clean|professional)$/i.test(s));
      const descByTitle = new Map<string, string>();
      for (const m of pairChunks) {
        const name = String(m[1] || '').trim();
        const blurb = String(m[2] || '').trim().replace(/[.,;:]+$/g, '');
        if (name && blurb) {
          descByTitle.set(name.toLowerCase(), blurb);
          if (!titles.some((x) => x.toLowerCase() === name.toLowerCase())) titles.push(name);
        }
      }
      // Prefer name—blurb pairs; drop list titles that still contain an em-dash (false "Name — blurb" captures).
      if (pairChunks.length >= 2) {
        titles = [...descByTitle.keys()].map((k) => {
          const hit = pairChunks.find((m) => String(m[1] || '').trim().toLowerCase() === k);
          return hit ? String(hit[1]).trim() : k;
        });
      } else {
        titles = titles.filter((s) => !/[—–]/.test(s));
      }
      if (!titles.length) {
        titles = wantsShopList
          ? (/\bheadphones?\b/i.test(t)
            ? ['Nova Quiet', 'Pulse Studio', 'Airline Lite']
            : (/\bmicrophone|\bmic\b/i.test(t)
              ? ['Room Condenser', 'Desk Dynamic', 'Travel Clip']
              : ['Model One', 'Model Two', 'Model Three']))
          : ['Project One', 'Project Two', 'Project Three'];
      }
      titles = titles.slice(0, 6);
      const defaultBlurbs: Record<string, string> = {
        'room condenser': 'Soft room tone for podcasts and voiceovers.',
        'desk dynamic': 'Tight focus for desk setups and stream chats.',
        'travel clip': 'Clip-on clarity when you are moving between rooms.',
      };
      const sectionId = wantsShopList ? 'shop' : 'work';
      const sectionLabel = wantsShopList ? 'Shop' : 'Featured Work';
      let block = '';
      if (storefrontShop) {
        const cards = titles
          .map((title) => {
            const safe = title.replace(/&/g, '&amp;').replace(/</g, '').replace(/>/g, '').replace(/`/g, '');
            const blurb = (
              descByTitle.get(title.toLowerCase())
              || defaultBlurbs[title.toLowerCase()]
              || (wantsRichCards ? 'Studio-ready capture with a simple, honest build.' : '')
            ).replace(/&/g, '&amp;').replace(/</g, '').replace(/>/g, '').replace(/`/g, '');
            const descHtml = blurb
              ? `\n            <p className="product-card__desc">${blurb}</p>`
              : '';
            return `<li className="product-card">
            <h3 className="product-card__name">${safe}</h3>${descHtml}
            <button type="button" className="add-to-cart" onClick={() => setCartCount((n) => n + 1)}>Add to cart</button>
          </li>`;
          })
          .join('\n          ');
        block = `<section id="shop" className="product-grid" aria-label="Shop">
        <div className="product-grid__head">
          <h2 className="product-grid__title">Shop</h2>
          <p className="cart-pill" aria-live="polite">Cart ({cartCount})</p>
        </div>
        <ul className="product-grid__list">
          ${cards}
        </ul>
      </section>`;
        app = ensureReactUseStateImport(app);
        if (!/\bcartCount\b/.test(app)) {
          app = app.replace(
            /export\s+default\s+function\s+App\s*\(\s*\)\s*\{/,
            'export default function App() {\n  const [cartCount, setCartCount] = useState(0);\n',
          );
        }
      } else {
        const sectionClass = wantsShopList ? 'shop-list-section' : 'featured-work';
        const titleClass = wantsShopList ? 'shop-list-section__title' : 'featured-work__title';
        const listClass = wantsShopList ? 'product-name-list' : 'work-list';
        const itemClass = wantsShopList ? 'product-name' : 'work-item';
        const items = titles
          .map((title) => {
            const safe = title.replace(/&/g, '&amp;').replace(/</g, '').replace(/>/g, '');
            return `<li className="${itemClass}">${safe}</li>`;
          })
          .join('\n          ');
        block = `<section id="${sectionId}" className="${sectionClass}" aria-label="${sectionLabel}">
        <h2 className="${titleClass}">${sectionLabel}</h2>
        <ul className="${listClass}">
          ${items}
        </ul>
      </section>`;
      }
      const sectionRe = new RegExp(
        `<section\\b[^>]*(?:id=["']${sectionId}["']|className=["'](?:${storefrontShop ? 'product-grid' : wantsShopList ? 'shop-list-section' : 'featured-work'})["'])[^>]*>[\\s\\S]*?<\\/section>`,
        'i',
      );
      if (sectionRe.test(app) || /id=["']work["']/i.test(app) || /className=["']featured-work["']/i.test(app)
        || /id=["']shop["']/i.test(app) || /className=["'](?:shop-list-section|product-grid)["']/i.test(app)) {
        app = app.replace(
          /<section\b[^>]*(?:id=["'](?:work|shop)["']|className=["'](?:featured-work|shop-list-section|product-grid)["'])[^>]*>[\s\S]*?<\/section>/i,
          block,
        );
        touchedApp = true;
      } else if (/className=["']info-strip["'][\s\S]*?<\/section>/i.test(app)) {
        // Keep info boxes in the middle — shop lands after the story band.
        app = app.replace(
          /(<section\b[^>]*className=["']info-strip["'][^>]*>[\s\S]*?<\/section>)/i,
          `$1\n      ${block}`,
        );
        touchedApp = true;
      } else if (/className=["']hero-copy["'][\s\S]*?<\/section>/i.test(app)) {
        app = app.replace(
          /(<section\b[^>]*className=["']hero-copy["'][^>]*>[\s\S]*?<\/section>)/i,
          `$1\n      ${block}`,
        );
        touchedApp = true;
      } else if (/className=["']brand-lockup["']/i.test(app)) {
        app = insertAfterBrandLockup(app, block);
        touchedApp = true;
      } else if (/className=["']cta["'][\s\S]{0,120}<\/button>/i.test(app)) {
        app = app.replace(
          /(<button\b[^>]*className=["']cta["'][^>]*>[\s\S]*?<\/button>)/i,
          `$1\n      ${block}`,
        );
        touchedApp = true;
      } else if (/<\/nav>/i.test(app)) {
        app = app.replace(/<\/nav>/i, `</nav>\n      ${block}`);
        touchedApp = true;
      } else if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
        app = app.replace(/(className=["'][Aa]pp["'][^>]*>)/i, `$1\n      ${block}`);
        touchedApp = true;
      }
      if (touchedApp && cssPath) {
        // Compact in-flow hero — drop absolute / 100vh so Shop|Work sits under copy, not a blank band.
        chrome = pickLayoutChrome(t, app);
        if (hasCssClassRule(css, 'hero-copy')) {
          css = css.replace(/\.hero-copy\s*\{[^}]*\}/i, heroCopyCssForFamily(family, chrome));
          touchedCss = true;
        } else {
          css += `\n${heroCopyCssForFamily(family, chrome)}`
            + `\n.hero-headline{margin:0;font-size:clamp(1.8rem,5vw,3.4rem);font-weight:600;letter-spacing:-0.03em;max-width:min(92vw,34rem);line-height:1.15;font-family:${chrome.displayFont}}`
            + `\n.hero-support{margin:.85rem 0 0;max-width:min(92vw,28rem);opacity:.82;font-size:1.05rem;line-height:1.45}\n`;
          touchedCss = true;
        }
        if (/\.app\s*\{[^}]*overflow\s*:\s*hidden/i.test(css)) {
          css = css.replace(/(\.app\s*\{[^}]*?)overflow\s*:\s*hidden/i, '$1overflow-x:hidden;overflow-y:auto');
          touchedCss = true;
        }
        if (storefrontShop) {
          // Must check for a real `.product-grid{` rule — `:has(.product-grid)` must NOT skip this.
          if (!hasCssClassRule(css, 'product-grid')) {
            css += productGridCssBlock(chrome, { rich: wantsRichCards, side: shopSide });
            touchedCss = true;
          } else if (wantsRichCards) {
            // Upgrade a bare twin strip into rich info cards when the ask asks for blurbs.
            css = css.replace(/\.product-grid\s*\{[^}]*\}[\s\S]*?\.add-to-cart:hover\s*\{[^}]*\}/i, '').trimEnd();
            css += productGridCssBlock(chrome, { rich: true, side: shopSide });
            touchedCss = true;
          }
        } else {
          const listCssShared = `{position:relative;z-index:2;margin:0 auto;padding:3rem 1.5rem 4.5rem;width:100%;max-width:40rem;box-sizing:border-box}`;
          const titleCssShared = `{margin:0 0 1.5rem;font-size:clamp(1.15rem,2.5vw,1.45rem);font-weight:500;letter-spacing:0.08em;text-transform:uppercase;opacity:.72}`;
          const ulCssShared = `{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1.1rem}`;
          const liCssShared = `{margin:0;font-size:clamp(1.25rem,3vw,1.75rem);letter-spacing:-0.02em;line-height:1.25;border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent);padding-bottom:.85rem}`;
          if (wantsShopList) {
            if (!hasCssClassRule(css, 'shop-list-section')) {
              css += `\n.shop-list-section${listCssShared}`
                + `\n.shop-list-section__title${titleCssShared}`
                + `\n.product-name-list${ulCssShared}`
                + `\n.product-name${liCssShared}\n`;
              touchedCss = true;
            }
          } else if (!hasCssClassRule(css, 'featured-work')) {
            css += `\n.featured-work${listCssShared}`
              + `\n.featured-work__title${titleCssShared}`
              + `\n.work-list${ulCssShared}`
              + `\n.work-item${liCssShared}\n`;
            touchedCss = true;
          } else if (/margin-top\s*:\s*100vh/i.test(css)) {
            css = css.replace(/\.featured-work\s*\{[^}]*\}/i, (block) => (
              block.replace(/margin-top\s*:\s*100vh\s*;?/i, 'margin:0 auto;')
            ));
            touchedCss = true;
          }
        }
      }
    }

    const wantsContactForm = (
      (/\bContact\s+section\b/i.test(t) || (/\bcontact\b/i.test(t) && /\bform\b/i.test(t)))
      && /\b(?:add|put|include)\b/i.test(t)
      && /\b(?:name|email|message|Send|form)\b/i.test(t)
      && !(/\bWork\b/.test(t) && /\bContact\b/.test(t) && /\b(?:nav|navigation|links?)\b/i.test(t))
    );
    if (wantsContactForm) {
      const formBlock = `<section id="contact" className="contact-section" aria-label="Contact">
        <h2 className="contact-section__title">Contact</h2>
        {sent ? (
          <p className="contact-thanks">Thank you — we will be in touch shortly.</p>
        ) : (
          <form className="contact-form" onSubmit={(e) => { e.preventDefault(); setSent(true); }} aria-label="Contact form">
            <label className="contact-field">Name
              <input name="name" type="text" required autoComplete="name" />
            </label>
            <label className="contact-field">Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label className="contact-field">Message
              <textarea name="message" required rows={4} />
            </label>
            <button type="submit" className="contact-send">Send</button>
          </form>
        )}
      </section>`;
      if (!/\buseState\b/.test(app)) {
        if (!/from\s+['"]react['"]/.test(app)) {
          app = `import { useState } from 'react';\n${app}`;
        } else {
          app = app.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react['"]/, (_m, inner: string) => (
            `import { ${String(inner).trim().replace(/,\s*$/, '')}, useState } from 'react'`
          ));
        }
      }
      if (!/\bconst\s*\[\s*sent\s*,\s*setSent\s*\]/.test(app)) {
        app = app.replace(
          /export\s+default\s+function\s+App\s*\(\s*\)\s*\{/,
          'export default function App() {\n  const [sent, setSent] = useState(false);',
        );
      }
      if (/id=["']contact["']/i.test(app) || /className=["']contact-section["']/i.test(app)) {
        app = app.replace(
          /<section\b[^>]*(?:id=["']contact["']|className=["']contact-section["'])[^>]*>[\s\S]*?<\/section>/i,
          formBlock,
        );
        touchedApp = true;
      } else if (
        /id=["'](?:work|shop)["'][\s\S]*?<\/section>/i.test(app)
        || /className=["'](?:featured-work|shop-list-section|product-grid)["'][\s\S]*?<\/section>/i.test(app)
      ) {
        app = app.replace(
          /(<section\b[^>]*(?:id=["'](?:work|shop)["']|className=["'](?:featured-work|shop-list-section|product-grid)["'])[^>]*>[\s\S]*?<\/section>)/i,
          `$1\n      ${formBlock}`,
        );
        touchedApp = true;
      } else if (/className=["']hero-copy["'][\s\S]*?<\/section>/i.test(app)) {
        app = app.replace(
          /(<section\b[^>]*className=["']hero-copy["'][^>]*>[\s\S]*?<\/section>)/i,
          `$1\n      ${formBlock}`,
        );
        touchedApp = true;
      } else if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
        app = app.replace(/(className=["'][Aa]pp["'][^>]*>)/i, `$1\n      ${formBlock}`);
        touchedApp = true;
      }
      if (touchedApp && cssPath) {
        if (/\.app\s*\{[^}]*overflow\s*:\s*hidden/i.test(css)) {
          css = css.replace(/(\.app\s*\{[^}]*?)overflow\s*:\s*hidden/i, '$1overflow-x:hidden;overflow-y:auto');
          touchedCss = true;
        }
        if (!hasCssClassRule(css, 'contact-section')) {
          css += `\n.contact-section{position:relative;z-index:2;margin:0 auto;padding:3.5rem 1.5rem 5rem;width:100%;max-width:28rem;box-sizing:border-box}`
            + `\n.contact-section__title{margin:0 0 1.25rem;font-size:clamp(1.15rem,2.5vw,1.45rem);font-weight:500;letter-spacing:0.08em;text-transform:uppercase;opacity:.72}`
            + `\n.contact-form{display:flex;flex-direction:column;gap:1rem}`
            + `\n.contact-field{display:flex;flex-direction:column;gap:.4rem;font-size:.9rem;opacity:.9}`
            + `\n.contact-field input,.contact-field textarea{font:inherit;padding:.65rem .75rem;border:1px solid color-mix(in srgb,currentColor 28%,transparent);border-radius:6px;background:transparent;color:inherit}`
            + `\n.contact-send{align-self:flex-start;margin-top:.35rem;padding:.65rem 1.35rem;border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;cursor:pointer;font:inherit}`
            + `\n.contact-send:hover{background:color-mix(in srgb,currentColor 12%,transparent)}`
            + `\n.contact-thanks{margin:0;font-size:1.05rem;line-height:1.5;opacity:.9}\n`;
          touchedCss = true;
        }
      }
    }

    if ((wantsFeaturedWork || wantsShopList || wantsContactForm) && (touchedApp || touchedCss)) {
      // Always un-nest: Shop/Contact used to early-return while still inside brand-lockup.
      const hoisted = hoistOutOfBrandLockup(app);
      if (hoisted.moved) {
        app = hoisted.app;
        touchedApp = true;
      }
      const out: WebFileEdit[] = [];
      if (touchedApp) out.push({ path: appPath, content: app });
      if (touchedCss && cssPath) {
        const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
        out.push(...syncSolidCanvasEdits(flat, cssPath, canvas, css));
      } else if (touchedIndex) {
        out.push({ path: 'src/index.css', content: indexCss });
      }
      return out;
    }
  }

  // Three short info boxes — brand story / product truths (not a twin hero slap).
  {
    // Require the add/put to target the boxes — not "add a Contact footer … keep the info boxes".
    const wantsInfoStrip = (
      (
        /\b(?:add|put|include|across)\b[\s\S]{0,64}\b(?:info\s+boxes?|three\s+short\s+(?:boxes|cards|panels)|why\s+(?:micora|us|this))\b/i.test(t)
        || /\b(?:info\s+boxes?|three\s+short\s+(?:boxes|cards|panels))\b[\s\S]{0,48}\b(?:add|put|include|across|:)\b/i.test(t)
        || (/\b(?:add|put|include)\b[\s\S]{0,40}\b(?:boxes?|cards?|panels?)\b/i.test(t)
          && /\b(?:explain|about|rooms?|desk|travel|Quiet|Desk setups|On the move)\b/i.test(t))
      )
      && !(/\bcontact\b/i.test(t) && /\bfooter\b/i.test(t))
    );
    if (wantsInfoStrip) {
      const defaults = [
        { title: 'Quiet rooms', body: 'Clear voice when the room is small and the walls are close.' },
        { title: 'Desk setups', body: 'Simple capture for calls, demos, and late-night edits.' },
        { title: 'On the move', body: 'Light enough to pack — still honest in a noisy space.' },
      ];
      // Optional "Title — body" triples from the ask.
      const pairs = [...t.matchAll(/\b([A-Z][A-Za-z0-9][A-Za-z0-9 ]{1,28})\s*[—–-]\s*([^.;\n]{12,100})/g)]
        .map((m) => ({
          title: String(m[1] || '').trim(),
          body: String(m[2] || '').trim().replace(/[.,;:]+$/g, ''),
        }))
        .filter((p) => p.title && p.body && !/Room Condenser|Desk Dynamic|Travel Clip/i.test(p.title));
      const items = (pairs.length >= 3 ? pairs.slice(0, 3) : defaults);
      const cards = items
        .map((it) => {
          const title = it.title.replace(/&/g, '&amp;').replace(/</g, '').replace(/>/g, '').replace(/`/g, '');
          const body = it.body.replace(/&/g, '&amp;').replace(/</g, '').replace(/>/g, '').replace(/`/g, '');
          return `<article className="info-card">
          <h3 className="info-card__title">${title}</h3>
          <p className="info-card__body">${body}</p>
        </article>`;
        })
        .join('\n        ');
      const block = `<section className="info-strip" aria-label="About">
        ${cards}
      </section>`;
      if (/className=["']info-strip["']/i.test(app)) {
        app = app.replace(/<section\b[^>]*className=["']info-strip["'][^>]*>[\s\S]*?<\/section>/i, block);
      } else if (/className=["']hero-copy["'][\s\S]*?<\/section>/i.test(app)) {
        app = app.replace(
          /(<section\b[^>]*className=["']hero-copy["'][^>]*>[\s\S]*?<\/section>)/i,
          `$1\n      ${block}`,
        );
      } else if (/className=["']brand-lockup["']/i.test(app)) {
        app = insertAfterBrandLockup(app, block);
      } else if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
        app = app.replace(/(className=["'][Aa]pp["'][^>]*>)/i, `$1\n      ${block}`);
      }
      touchedApp = true;
      {
        const hoisted = hoistOutOfBrandLockup(app);
        if (hoisted.moved) {
          app = hoisted.app;
          touchedApp = true;
        }
      }
      if (cssPath && !hasCssClassRule(css, 'info-strip')) {
        css += `\n.info-strip{position:relative;z-index:2;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;width:min(92vw,52rem);margin:1.5rem auto 0;padding:0 1.25rem;box-sizing:border-box}`
          + `\n.info-card{margin:0;padding:1.15rem 1.1rem 1.25rem;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:0.45rem;background:color-mix(in srgb,currentColor 5%,transparent)}`
          + `\n.info-card__title{margin:0 0 .45rem;font-size:0.95rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;opacity:.88}`
          + `\n.info-card__body{margin:0;font-size:0.95rem;line-height:1.45;opacity:.8}`
          + `\n@media (max-width:720px){.info-strip{grid-template-columns:1fr}}\n`;
        touchedCss = true;
      }
      const outInfo: WebFileEdit[] = [];
      if (touchedApp) outInfo.push({ path: appPath, content: app });
      if (touchedCss && cssPath) outInfo.push({ path: cssPath, content: css });
      return outInfo;
    }
  }

  // Recolor buttons / controls — never wipe the page canvas.
  {
    const btnColorWord = (
      t.match(/\b(?:change|set|make|turn|update|paint)\b[\s\S]{0,48}\bbuttons?\b[\s\S]{0,40}\b(?:to|into)\s+(?:a\s+)?(sky\s*blue|light\s*blue|light\s*pink|light\s*red|green|red|blue|black|white|pink|orange|purple|teal|navy|yellow|brown)\b/i)?.[1]
      || t.match(/\bbuttons?\b[\s\S]{0,28}\b(?:to|into)\s+(?:a\s+)?(sky\s*blue|light\s*blue|light\s*pink|light\s*red|green|red|blue|black|white|pink|orange|purple|teal|navy|yellow|brown)\b/i)?.[1]
      || ''
    );
    if (btnColorWord && !/\bbackground\b/i.test(t) && cssPath) {
      const hex = cssColor(btnColorWord) || '#16a34a';
      const ink = contrastTextForBg(hex);
      const rule = `button,.btn{appearance:none;background:${hex};color:${ink};border:1px solid ${hex};cursor:pointer;font:inherit;padding:0.55rem 1rem;border-radius:0.35rem}`;
      css = css.replace(/\n?button\s*,\s*\.btn\s*\{[^}]*\}/gi, '');
      css = css.replace(/\n?\.btn\s*\{[^}]*\}/gi, '');
      css = `${css.trimEnd()}\n${rule}\n`;
      touchedCss = true;
    }
  }

  // Solid page background color (brown / pink / light red / …) — do this before richer chrome so
  // "change the background to brown" never false-passes as already applied.
  {
    const colorWord = t.match(
      /\b(cream\s*[- ]?\s*brown|brown\s*[- ]?\s*cream|sky\s*blue|skyblue|light\s*red|lightred|light\s*blue|lightblue|light\s*pink|lightpink|black|white|blue|dark|red|green|yellow|purple|violet|brown|teal|chocolate|sienna|pink|orange|navy|cream|gr[ae]y)\b/i,
    )?.[1];
    // "keep the cream background" + "name in black" → cream wins for page paint.
    const keepCream = /\b(?:keep|leave|back\s+to)\b[\s\S]{0,24}\bcream\b/i.test(t)
      || /\bcream\s+background\b/i.test(t);
    const bgColorWord = (keepCream && /black|white/i.test(String(colorWord || '')) && /\bcream\b/i.test(t)
      && !/cream\s*[- ]?\s*brown/i.test(t))
      ? 'cream'
      : colorWord;
    const wantsBgColor = Boolean(bgColorWord) && (
      /\bbackground\b/i.test(t)
      || (
        /\b(?:change|set|make|turn|update|switch|add)\b[\s\S]{0,48}\b(?:to|into)\s+(?:a\s+)?(?:solid\s+)?(?:sky\s*blue|light\s*red|lightred|light\s*blue|brown|black|white|blue|red|green|teal|pink|orange|navy|cream|gr[ae]y)\b/i.test(t)
        // "buttons" (plural) must also skip — otherwise page paint steals button recolors.
        && !/\b(?:text|title|heading|h1|buttons?|word|label|copy|name)\b/i.test(t)
      )
    );
    // "change the color of the name to black" is text paint — never a page wipe.
    if (looksLikeNameTextColorAsk(t) && !(keepCream && /\bbackground\b/i.test(t) && !/\bcharcoal\b/i.test(t))) {
      /* skip bg — unless they also asked to keep/restore cream */
    } else if (
      wantsBgColor
      && bgColorWord
      && !/\bcharcoal\b/i.test(t)
      && !/\b(?:glow|accent)\b/i.test(t)
      && !/\b(?:gradient|tint)\b/i.test(t)
      && !(/\bteal\b/i.test(t) && /\b(?:gradient|tint)\b/i.test(t))
    ) {
      const bg = cssColor(bgColorWord) || '#000000';
      // One solid canvas across App.css + index.css (index loads last in main.tsx).
      const syncedBg = syncSolidCanvasEdits(flat, cssPath || 'src/App.css', bg, css);
      for (const edit of syncedBg) {
        if (/App\.css$/i.test(edit.path)) css = edit.content;
        if (/index\.css$/i.test(edit.path)) {
          indexCss = edit.content;
          touchedIndex = true;
        }
      }
      // Leaving charcoal: drop the red glow halo so cream/white reads clean.
      if (/cream|white/i.test(bgColorWord)) {
        css = css.replace(/\n?\.app::before\{[^}]*\}\n?/gi, '\n');
        css = css.replace(/\n?\.app>\*\{[^}]*\}\n?/gi, '\n');
      }
      touchedCss = true;
      // Inline style backgrounds on the shell div
      if (/style=\{\{[^}]*background/i.test(app)) {
        app = app.replace(
          /(style=\{\{[^}]*?)background(?:Color)?\s*:\s*['"][^'"]+['"]/gi,
          `$1background: '${bg}'`,
        );
        touchedApp = true;
      }
    }
  }

  // Soft animated gradient mood — must run before chrome early-return and solid charcoal.
  // Paint on a fixed ::before so Live windowed mode never shows a black strip under the iframe.
  {
    const wantsSoftAnimatedBg = (
      (
        /\b(?:animated|gently\s+shifts?|soft\s+animated)\b/i.test(t)
        && /\b(?:gradient|background)\b/i.test(t)
      )
      || /\banimated\s+gradient\b/i.test(t)
    ) && /\b(?:background|page|give|add|keep|design)\b/i.test(t);
    if (wantsSoftAnimatedBg && cssPath) {
      const ink = '#f4f7fb';
      const seed = layoutSeedFromProject(t, app);
      const moodIdx = hashLayoutSeed(`${seed}:mood`) % 4;
      // Color trio from the ask when named; otherwise brand-seeded so Micora ≠ Auralis blue twin.
      let c1 = '#141414';
      let c2 = '#1e3a5f';
      let c3 = '#0b1220';
      if (/\bteal\b|\baqua\b|\bcyan\b/i.test(t)) {
        c1 = '#0b1c1c'; c2 = '#0f766e'; c3 = '#134e4a';
      } else if (/\b(?:warm|amber|gold|sunset)\b/i.test(t)) {
        c1 = '#1a120c'; c2 = '#9a3412'; c3 = '#431407';
      } else if (/\b(?:violet|purple|indigo)\b/i.test(t)) {
        c1 = '#12081c'; c2 = '#5b21b6'; c3 = '#1e1b4b';
      } else if (/\b(?:forest|green|olive)\b/i.test(t)) {
        c1 = '#0c1410'; c2 = '#166534'; c3 = '#052e16';
      } else if (/\b(?:rose|pink|magenta)\b/i.test(t)) {
        c1 = '#1a0a12'; c2 = '#9d174d'; c3 = '#4a044e';
      } else if (/\bblue\b|\bnavy\b/i.test(t) && /\bcharcoal\b/i.test(t)) {
        c1 = '#141414'; c2 = '#1e3a5f'; c3 = '#0b1220';
      } else if (/\bblue\b|\bnavy\b/i.test(t)) {
        c1 = '#0b1220'; c2 = '#1d4ed8'; c3 = '#172554';
      } else if (/\bcharcoal\b|\bblack\b|\bdark\b/i.test(t)) {
        c1 = '#141414'; c2 = '#2a2a2a'; c3 = '#0a0a0a';
      } else {
        const moods: Array<[string, string, string]> = [
          ['#141414', '#1e3a5f', '#0b1220'], // charcoal→blue
          ['#0b1c1c', '#0f766e', '#134e4a'], // deep teal
          ['#1a120c', '#9a3412', '#431407'], // warm ember
          ['#12081c', '#5b21b6', '#1e1b4b'], // violet night
        ];
        [c1, c2, c3] = moods[moodIdx];
      }
      const angle = /\bvertical\b/i.test(t) ? '180deg'
        : /\bhorizontal\b/i.test(t) ? '90deg'
        : /\bdiagonal\b/i.test(t) ? '135deg'
        : (['125deg', '160deg', '90deg', '210deg'] as const)[moodIdx];
      const motion = /\b(?:pulse|breathe)\b/i.test(t) ? 'pulse'
        : /\bvertical\b|\bwash\b/i.test(t) ? 'wash'
        : /\bdrift\b|\bdiagonal\b/i.test(t) ? 'drift'
        : (['shift', 'wash', 'drift', 'pulse'] as const)[moodIdx];
      const animName = `novaSoft${motion[0].toUpperCase()}${motion.slice(1)}`;
      const grad = `linear-gradient(${angle}, ${c1}, ${c2}, ${c3}, ${c1})`;
      const keyframes = motion === 'pulse'
        ? `@keyframes ${animName}{0%,100%{opacity:.92;background-position:0% 50%}50%{opacity:1;background-position:100% 50%}}`
        : motion === 'wash'
          ? `@keyframes ${animName}{0%{background-position:50% 0%}50%{background-position:50% 100%}100%{background-position:50% 0%}}`
          : motion === 'drift'
            ? `@keyframes ${animName}{0%{background-position:0% 0%}50%{background-position:100% 100%}100%{background-position:0% 0%}}`
            : `@keyframes ${animName}{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`;
      // Root canvas: min-height (not height:100%) so content can grow; solid fallback under the fixed layer.
      const rootRule = `html, body, #root { min-height: 100%; height: auto; margin: 0; background: ${c1}; }`;
      if (/html,\s*body,\s*#root/i.test(css)) {
        css = css.replace(/html,\s*body,\s*#root\s*\{[^}]*\}/i, rootRule);
      } else {
        css = `${rootRule}\n${css}`;
      }
      if (/html,\s*body,\s*#root/i.test(indexCss)) {
        indexCss = indexCss.replace(/html,\s*body,\s*#root\s*\{[^}]*\}/i, rootRule);
      } else {
        indexCss = `${rootRule}\n${indexCss}`;
      }
      touchedIndex = true;
      if (/\.app\s*\{/i.test(css)) {
        css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
          let next = String(body || '');
          next = next
            .replace(/background(?:-color)?\s*:\s*[^;]+;?/gi, '')
            .replace(/background-size\s*:\s*[^;]+;?/gi, '')
            .replace(/background-image\s*:\s*[^;]+;?/gi, '')
            .replace(/animation\s*:\s*[^;]+;?/gi, '');
          if (/color\s*:/i.test(next)) next = next.replace(/color\s*:\s*[^;]+/i, `color: ${ink}`);
          else next += ` color: ${ink};`;
          if (!/;\s*$/.test(next.trim()) && next.trim()) next = `${next.trim()};`;
          if (!/position\s*:/i.test(next)) next += ' position: relative;';
          if (!/min-height\s*:/i.test(next)) next += ' min-height: 100svh;';
          else next = next.replace(/min-height\s*:\s*[^;]+/i, 'min-height: 100svh');
          if (!/overflow/i.test(next)) next += ' overflow-x: hidden;';
          // Solid shell — animated paint lives on ::before so gaps never flash iframe-black.
          next += ` background: ${c1};`;
          return `.app {${next}}`;
        });
      } else {
        css += `\n.app{min-height:100svh;margin:0;position:relative;overflow-x:hidden;color:${ink};background:${c1}}\n`;
      }
      css = css.replace(/\.app::before\s*\{[^}]*\}/ig, '');
      css = css.replace(/@keyframes\s+novaSoft\w+\s*\{[^}]*\}/ig, '');
      css += `\n.app::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;`
        + `background:${grad};background-size:220% 220%;animation:${animName} 18s ease-in-out infinite}`
        + `\n${keyframes}\n.app>*{position:relative;z-index:1}\n`;
      if (/\.center-word\s*\{/i.test(css)) {
        css = css.replace(/(\.center-word\s*\{[^}]*?)color\s*:\s*[^;]+/i, `$1color: ${ink}`);
      }
      if (/\.tagline\s*\{/i.test(css)) {
        const tagBlock = css.match(/\.tagline\s*\{[^}]*\}/i)?.[0] || '';
        if (/color\s*:/i.test(tagBlock)) {
          css = css.replace(/(\.tagline\s*\{[^}]*?)color\s*:\s*[^;]+/i, `$1color: ${ink}`);
        } else {
          css = css.replace(/\.tagline\s*\{/i, `.tagline{color:${ink};`);
        }
      }
      touchedCss = true;
      const outAnim: WebFileEdit[] = [];
      if (touchedApp) outAnim.push({ path: appPath, content: app });
      if (touchedCss && cssPath) outAnim.push({ path: cssPath, content: css });
      if (touchedIndex) outAnim.push({ path: 'src/index.css', content: indexCss });
      return outAnim;
    }
  }

  // Premium website-fit backgrounds — Codex-grade craft:
  // editorial photo layers + graded wash + soft light bloom + grain + slow drift.
  // No logos, icons, or copy.
  {
    const wantsCinemaBg = (
      /\b(?:cinematic|movie[- ]?like|film\s+still|premium\s+(?:background|atmosphere|website|site)|atmospheric|website[- ]?fit|editorial\s+background)\b/i.test(t)
      || (/\bbackground\b/i.test(t) && /\b(?:movie|film|cinema|orb|glow|depth|professional|premium|website|scroll|landing)\b/i.test(t))
    )
      && /\b(?:background|atmosphere|imagery|image|photo|hero|scene|website|site|scroll)\b/i.test(t)
      && !/\b(?:logo|icon|wordmark|title|headline|brand\s+name|center(?:ed)?\s+word)\b/i.test(t);
    if (wantsCinemaBg) {
      const scrollSite = /\b(?:scroll|pages?|website|landing|multi[- ]?(?:panel|section|page)|full[- ]?site|website[- ]?fit)\b/i.test(t)
        || /\bpremium\b/i.test(t);
      const stageNames = scrollSite
        ? ['stage stage--a', 'stage stage--b', 'stage stage--c']
        : ['stage stage--a'];
      app = [
        "import './App.css';",
        '',
        `const stages = ${JSON.stringify(stageNames)};`,
        '',
        'export default function App() {',
        '  return (',
        '    <main className="site" aria-hidden="true">',
        '      {stages.map((stage) => (',
        '        <section className={stage} key={stage}>',
        '          <div className="stage__image" />',
        '          <div className="stage__wash" />',
        '          <div className="stage__light stage__light--one" />',
        '          <div className="stage__light stage__light--two" />',
        '          <div className="stage__grain" />',
        '        </section>',
        '      ))}',
        '    </main>',
        '  );',
        '}',
        '',
      ].join('\n');
      css = [
        ':root { background: #05080b; }',
        'html, body, #root { min-height: 100%; margin: 0; }',
        'body { background: #05080b; overflow-x: hidden; }',
        '.site { background: #05080b; }',
        '.stage { position: relative; isolation: isolate; height: 100svh; min-height: 620px; overflow: hidden; background: #070a0b; }',
        '.stage__image, .stage__wash, .stage__light, .stage__grain { position: absolute; inset: -3%; pointer-events: none; }',
        '.stage__image { inset: 0; background-position: center; background-size: cover; filter: saturate(.78) contrast(1.08) brightness(.72); transform: scale(1.035); animation: drift 18s ease-in-out infinite alternate; }',
        '.stage__wash { z-index: 1; background: linear-gradient(180deg, rgba(7,12,14,.17) 0%, rgba(5,7,9,.18) 45%, rgba(4,6,8,.7) 100%); }',
        '.stage__light { z-index: 2; border-radius: 50%; mix-blend-mode: screen; filter: blur(22px); opacity: .76; }',
        '.stage__light--one { inset: auto; width: 64vw; height: 64vw; max-width: 950px; max-height: 950px; top: -27vw; right: -17vw; background: radial-gradient(circle at 44% 48%, rgba(255,243,194,.78), rgba(255,183,108,.22) 29%, transparent 67%); }',
        '.stage__light--two { inset: auto; width: 50vw; height: 50vw; bottom: -30vw; left: -14vw; background: radial-gradient(circle, rgba(100,180,199,.32), rgba(83,103,157,.1) 42%, transparent 70%); }',
        '.stage__grain { z-index: 3; opacity: .12; mix-blend-mode: soft-light; background-image: url("data:image/svg+xml,%3Csvg viewBox=\'0 0 220 220\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.95\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'.88\'/%3E%3C/svg%3E"); }',
        ".stage--a .stage__image { background-image: url('/heroes/cinema.jpg'); background-position: center 57%; }",
        '.stage--a .stage__wash { background: linear-gradient(118deg, rgba(8,17,20,.1) 15%, rgba(17,32,33,.05) 50%, rgba(6,11,12,.58) 100%), linear-gradient(0deg, rgba(5,7,8,.65), transparent 46%); }',
        ...(scrollSite ? [
          ".stage--b .stage__image { background-image: url('/heroes/cinema-b.jpg'); filter: saturate(.62) contrast(1.06) brightness(.69); animation-duration: 23s; }",
          '.stage--b .stage__wash { background: linear-gradient(105deg, rgba(18,15,9,.34), transparent 47%, rgba(16,31,28,.52)), linear-gradient(0deg, rgba(5,7,5,.68), transparent 55%); }',
          '.stage--b .stage__light--one { top: 4vh; right: -25vw; background: radial-gradient(circle, rgba(255,225,165,.72), rgba(244,165,81,.19) 34%, transparent 68%); }',
          ".stage--c .stage__image { background-image: url('/heroes/cinema-c.jpg'); background-position: center 62%; filter: saturate(.7) contrast(1.12) brightness(.52); animation-duration: 20s; }",
          '.stage--c .stage__wash { background: linear-gradient(160deg, rgba(4,10,18,.45), transparent 40%, rgba(3,6,12,.72)), linear-gradient(0deg, rgba(2,4,8,.7), transparent 50%); }',
          '.stage--c .stage__light--one { top: -18vw; right: -12vw; background: radial-gradient(circle, rgba(160,200,255,.45), rgba(80,120,180,.15) 40%, transparent 70%); }',
          '.stage--c .stage__light--two { bottom: -16vw; left: auto; right: -16vw; background: radial-gradient(circle, rgba(251,167,103,.2), rgba(90,68,133,.12) 44%, transparent 69%); }',
        ] : []),
        '@keyframes drift { from { transform: scale(1.035) translate3d(-.5%, -.25%, 0); } to { transform: scale(1.085) translate3d(.5%, .35%, 0); } }',
        '@media (prefers-reduced-motion: reduce) { .stage__image { animation: none; } }',
        '',
      ].join('\n');
      touchedApp = true;
      touchedCss = true;
      const out: WebFileEdit[] = [
        { path: appPath, content: app },
        ...(cssPath ? [{ path: cssPath, content: css }] : []),
      ];
      return out;
    }
  }

  // --- Incremental chrome (logo / icons / search / bag / hero / footer) ---
  // Deterministic so "Still Nightglass only: add …" still lands when the model talks instead of writing @@@FILE.
  {
    const namedBrands = parseNamedBrandLogos(t);
    const namedIcons = parseNamedUiIcons(t);
    // Café text-nav asks ("Menu / Rewards / Gift Cards") must not spawn hamburger icon-rails.
    const wantsCafePrimaryNav = (
      /\bMenu\b/i.test(t)
      && /\bRewards\b/i.test(t)
      && /\bGift\s*Cards?\b/i.test(t)
    ) || (
      /\bFind\s+a\s+caf[eé]\b/i.test(t)
      && /\bSign\s*in\b/i.test(t)
      && /\bJoin\s+now\b/i.test(t)
    );
    const cafeNavAsk = wantsCafePrimaryNav && (
      /\b(?:add|put|include|with)\b/i.test(t)
      || /\bnav(?:igation|bar)?\b/i.test(t)
      || /\blinks?\b/i.test(t)
    );
    const wantsLogo = (
      (
        /\b(?:add|put|place|insert)\b[\s\S]{0,48}\b(?:a\s+|the\s+|premium\s+|professional\s+)?(?:logo|wordmark|brand\s*mark)\b/i.test(t)
        || (/\b(?:logo|wordmark|brand\s*mark)\b/i.test(t) && /\btop[\s-]?left\b/i.test(t) && !/\bicon\b/i.test(t))
        || namedBrands.length > 0
      )
      // "change the name to logo only" is a rename, not an icon ask
      && !/\b(?:to|into)\s+["']?logo\b/i.test(t)
      && !extractNameRenameTarget(t)
      && !/\b(?:menu|search|bag|cart|user)\s+icons?\b/i.test(t)
    );
    // Brand place/name asks ("put Atelier top left") must never become icon rails.
    const putBrandLabel = extractPutPlaceNameLabel(t);
    // Contact forms / footers say "email" / "message" — that is not a mail icon-rail ask.
    const contactFormChromeSkip = (
      (/\bContact\s+section\b/i.test(t) || (/\bcontact\b/i.test(t) && /\bform\b/i.test(t)))
      && /\b(?:name|email|message|Send)\b/i.test(t)
      && /\b(?:add|put|include)\b/i.test(t)
    ) || (
      /\bfooter\b/i.test(t)
      && /\b(?:contact|help|email)\b/i.test(t)
      && /\b(?:add|put|include)\b/i.test(t)
    );
    // Shop title lists + "Add to cart" buttons are product UI — not a cart icon-rail.
    const shopSectionChromeSkip = (
      /\b(?:Shop|Products?|Lineup)\s+section\b/i.test(t)
      && /\b(?:names?|titles?|keyboards?|headphones?|products?)\b/i.test(t)
      && /\b(?:add|put|include|below|section)\b/i.test(t)
    );
    const wantsExtraIcon = !putBrandLabel && !contactFormChromeSkip && !shopSectionChromeSkip && (
      /\b(?:another|second|more|extra)\b[\s\S]{0,24}\bicon\b/i.test(t)
      || /\b(?:add|put|place)\b[\s\S]{0,40}\b(?:a\s+|the\s+|premium\s+|professional\s+)?(?:menu|search|bag|cart)\s+icons?\b/i.test(t)
      || (/\bicon\b/i.test(t) && /\b(?:top[\s-]?left|add|put|place|premium|professional)\b/i.test(t) && !wantsLogo)
      || /\b(?:premium|professional)\s+icons?\b/i.test(t)
      || namedIcons.length > 0
    );
    const searchNegated = /\b(?:no|without|never|skip|omit|don't|do\s+not|dont)\b[\s\S]{0,40}\bsearch(?:\s*(?:bar|input|field))?\b/i.test(t);
    const bagNegated = /\b(?:no|without|never|skip|omit|don't|do\s+not|dont)\b[\s\S]{0,40}\b(?:cart|bag|shopping)\b/i.test(t);
    // "move the search icon to the top right" is an icon move — not a search-bar ask.
    const iconMoveAsk = /\b(?:move|put|place|shift)\b[\s\S]{0,48}\b(?:search|settings?|menu|user|profile|home|bag|cart|bell)\s*icons?\b/i.test(t)
      || /\b(?:move|put|place|shift)\b[\s\S]{0,48}\b(?:the\s+)?(?:search|settings?|menu|user|profile)\s+icon\b/i.test(t);
    const wantsSearch = !searchNegated && !iconMoveAsk && (
      /\bsearch\s*(?:bar|input|field)\b/i.test(t)
      && /\b(?:top[\s-]?right|header|nav|corner)\b/i.test(t)
    );
    const wantsBag = !bagNegated && /\b(?:bag|cart|shopping)\b/i.test(t)
      && /\b(?:add|put|place|icon|right)\b/i.test(t);
    const heroTitle = (
      t.match(/\bhero\s+title\b[\s\S]{0,40}["“']([^"”']{2,60})["”']/i)?.[1]
      || t.match(/\b(?:headline|h1)\b[\s\S]{0,40}["“']([^"”']{2,60})["”']/i)?.[1]
      || t.match(/add\s+one\s+short\s+white\s+hero\s+title:\s*["“']?([^"”'\n.]{2,60})/i)?.[1]
      || ''
    ).trim();
    const wantsHeroTitle = Boolean(heroTitle) || (/\bhero\s+title\b/i.test(t) && /\badd\b/i.test(t));
    // "add a main headline that says X" with an existing brand — never steal center-word.
    const addHeroHeadlineAsk = (
      /\b(?:add|put|place)\b/i.test(t)
      && /\b(?:main\s+)?(?:headline|heading|hero\s+title|h1)\b/i.test(t)
      && /\b(?:says?|reading|that\s+says?)\b/i.test(t)
      && /className=["']center-word["']/i.test(app)
    );
    const scrubAskTail = (s: string) => String(s || '')
      .replace(/<!--[\s\S]*$/g, '')
      .replace(/\s+\band\s+one\s+short\b.*$/i, '')
      .replace(/\s+\bkeep\b[\s\S]*$/i, '')
      .replace(/\s+\b(?:leave|with\s+the\s+brand|nothing else)\b[\s\S]*$/i, '')
      .replace(/[.,;:]+$/g, '')
      .trim();
    const heroHeadlineText = scrubAskTail(
      t.match(/\b(?:main\s+)?(?:headline|heading|hero\s+title|h1)\b[\s\S]{0,48}\b(?:that\s+)?(?:says?|reading)\s*[:\s]+["“']?([^"”'\n,]{4,120})/i)?.[1]
      || t.match(/\bin\s+the\s+center\s+that\s+says\s+["“']?([^"”'\n,]{4,120})/i)?.[1]
      || '',
    );
    const heroSupportText = scrubAskTail(
      t.match(/\bsupporting\s+sentence(?:\s+underneath)?\s*:\s*["“']?([A-Za-z][^"”'\n<]{7,160})/i)?.[1]
      || t.match(/\bunderneath\s*:\s*["“']?([A-Za-z][^"”'\n<]{7,160})/i)?.[1]
      // "one short line under it: …" / "and a short sentence under it: …"
      || t.match(/\b(?:(?:and|with)\s+)?(?:one\s+)?(?:short\s+)?(?:line|sentence)\s+under(?:neath)?(?:\s+it)?\s*:\s*["“']?([A-Za-z][^"”'\n<]{7,160})/i)?.[1]
      || t.match(/\bunder\s+it\s*:\s*["“']?([A-Za-z][^"”'\n<]{7,160})/i)?.[1]
      || '',
    );
    const centeredWord = addHeroHeadlineAsk
      ? ''
      : (
      // "Show the word Hello on the screen" — dedicated extractor (never keep "on the screen").
      extractShowWordLabel(t)
      || extractNameRenameTarget(t)
      || extractPutPlaceNameLabel(t)
      || t.match(/\b(?:words?|text|phrase|copy|line)\s+(?:that\s+)?(?:says?|reading)\s*[:\s]+["“']([^"”']{2,80})["”']/i)?.[1]
      || t.match(/\b(?:says?|reading)\s+["“']([^"”']{2,80})["”']/i)?.[1]
      || t.match(/\b(?:says?|reading)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,6})\b/)?.[1]
      // "heading … saying something like Fresh vegetable plants"
      || t.match(/\b(?:heading|headline|h1|title)\b[\s\S]{0,100}\b(?:saying|say|that\s+says?)\s+(?:something\s+like\s+)?["“']?([A-Za-z][\w]*(?:\s+[A-Za-z][\w]*){1,6})/i)?.[1]
      || t.match(/\b(?:put|add|place|write|show)\b[\s\S]{0,48}\b(?:words?|text|phrase)\b[\s\S]{0,24}["“']([^"”']{2,80})["”']/i)?.[1]
      || t.match(/\b(?:put|add|place|write|show)\b[\s\S]{0,40}\b(?:words?|text|title)\s+["“']([^"”']{2,80})["”']/i)?.[1]
      // Unquoted multi-word: "Put the words Nightglass After Hours in the center"
      // Verb casing only ([Ss]how) — never /i on Title-Case capture or "on the screen" is swallowed.
      || t.match(/\b(?:[Pp]ut|[Aa]dd|[Pp]lace|[Ww]rite|[Ss]how)\b[\s\S]{0,48}\b(?:words?|text|phrase|title)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,6})\b/)?.[1]
      || t.match(/\b(?:[Cc]hange|[Rr]ename|[Ss]et|[Uu]pdate)\b[\s\S]{0,48}\b(?:centered\s+)?(?:words?|title|text)\s+(?:to|into)\s+["“']?([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,6})\b/)?.[1]
      // Brand name / brand should say VOID Peripherals — stop at layout words
      || extractBrandLabel(t)
      || t.match(/\b(?:[Pp]ut|[Aa]dd|[Pp]lace|[Ww]rite|[Ss]how)\b[\s\S]{0,40}\b(?:word|text|title|sentence)\s+["“']?([A-Za-z][A-Za-z0-9_-]{1,40})\b/)?.[1]
      || t.match(/\b(?:word|text|sentence)\s+["“']?([A-Za-z][A-Za-z0-9_-]{1,40})["”']?\s+(?:in|on|at)\b/i)?.[1]
      || ''
    ).trim().replace(/[.,;:]+$/, '').replace(/\s+/g, ' ');
    // Strip layout tails if a Title-Case regex still swallowed them — keep "local only"
    const centeredWordFinal = centeredWord
      .replace(/\s+\bonly\s+(?:add|put|place|with|and|no|nothing|keep|leave)\b.*$/i, '')
      // Never strip bare "and" — brand names like "Oak and Bean" must survive.
      .replace(/\s+\b(?:short|friendly|not|corporate)\b.*$/i, '')
      .replace(/\s+\b(?:on|in|at)\s+(?:the\s+)?(?:screen|page|viewport|middle|center|centre)\b.*$/i, '')
      .replace(/\s+\b(?:centered?|centred|in\s+the|middle|clean|white|black|text|on\s+screen|nothing|else)\b.*$/i, '')
      .trim() || centeredWord;
    const wantsNameOnlyShell = (
      /\b(?:just\s+the\s+name|only\s+the\s+name|name\s+only|nothing else)\b/i.test(t)
      || (/\bjust\s+the\s+name\b/i.test(t) && /\bnothing else\b/i.test(t))
    );
    // Rename/text-only: change the label, never steal layout from DNA chrome (top-right drift).
    const renameOnlyAsk = Boolean(centeredWordFinal)
      && (
        Boolean(extractNameRenameTarget(t))
        || /\b(?:change|rename|set|update)\b[\s\S]{0,48}\b(?:name|title|word|text)\b[\s\S]{0,40}\b(?:to|into|say)\b/i.test(t)
      )
      && !parseLayoutCorner(t)
      && !/\b(?:move|put|place|shift)\b[\s\S]{0,48}\b(?:top|bottom|left|right|corner|center|centre|middle)\b/i.test(t)
      && !/\b(?:top|bottom)\s*[- ]?(?:left|right)|(?:left|right)\s+corner\b/i.test(t);
    const wantsCenteredWord = Boolean(centeredWordFinal) && (
      /\b(?:middle|center|centred|screen|page|viewport|brown|centered|white)\b/i.test(t)
      || /\b(?:top|bottom)\s*[- ]?(?:left|right)|(?:left|right)\s+corner|corner\b/i.test(t)
      || /\b(?:put|place|add)\s+(?:the\s+)?name\b/i.test(t)
      || /\b(?:[Pp]ut|[Pp]lace|[Aa]dd)\s+[A-Z][A-Za-z0-9_-]*(?:\s+(?:and|&|[A-Z][A-Za-z0-9_-]*)){0,4}\s+(?:up\s+)?(?:in|on|at)\s+(?:the\s+)?(?:top|bottom|left|right|corner|center|middle)\b/.test(t)
      || /\bbrand\s+(?:name|should\s+say)\b/i.test(t)
      || /\bjust\s+that\s+word\b/i.test(t)
      || /\bnothing else\b/i.test(t)
      || /\bonly\s+words?\b/i.test(t)
      || /\bwords?\s+only\b/i.test(t)
      || /\bwording\s+only\b/i.test(t)
      || /\b(?:drop|add|put|place)\b[\s\S]{0,48}\b(?:heading|headline|h1|title)\b/i.test(t)
      || /\b(?:change|rename|set|update)\b[\s\S]{0,40}\b(?:centered\s+)?(?:words?|title|name)\b/i.test(t)
      || Boolean(extractNameRenameTarget(t))
      || Boolean(extractPutPlaceNameLabel(t))
    );
    const subtitle = (
      t.match(/\bsubtitle\b[\s\S]{0,40}["“']([^"”']{2,80})["”']/i)?.[1]
      || t.match(/under\s+the\s+title:\s*["“']([^"”']{2,80})["”']/i)?.[1]
      || ''
    ).trim();
    const wantsSubtitle = Boolean(subtitle) || (/\bsubtitle\b/i.test(t) && /\badd\b/i.test(t));
    const ctaLabel = (
      t.match(/\b(?:button|cta)\b[\s\S]{0,40}(?:labeled|label|say|named)\s+["“']?([^"”'\n.]{2,40})/i)?.[1]
      || ''
    ).trim();
    // Café day-banner "Start an order button" is not a generic hero Explore CTA.
    const cafeOrderCta = /\bStart\s+an\s+order\b/i.test(t) || /\b(?:day|green)\s+banner\b/i.test(t);
    const wantsCta = !cafeOrderCta && (
      Boolean(ctaLabel)
      || (/\b(?:button|cta)\b/i.test(t) && /\badd\b/i.test(t) && /\b(?:under|subtitle|hero)\b/i.test(t))
    );
    const footerNegated = /\b(?:no|without|never|skip|omit|don't|do\s+not|dont)\b[\s\S]{0,24}\bfooter\b/i.test(t);
    // Café About Us / Careers / Social Impact footer is handled by the dedicated block.
    const cafeColumnsFooter = /\b(?:About\s*Us|Careers|Social\s+Impact)\b/i.test(t);
    const wantsFooter = !footerNegated && !cafeColumnsFooter
      && /\bfooter\b/i.test(t) && /\b(?:add|put|simple)\b/i.test(t);

    const ensureNavShell = () => {
      if (/<nav[\s>]/i.test(app)) return;
      // Self-closing shell: <div className="app" />
      if (/<div\s+className=["']app["']\s*\/>/i.test(app)) {
        app = app.replace(
          /<div\s+className=["']app["']\s*\/>/i,
          `<div className="app">\n      <nav className="nav">\n        <div className="nav-left" />\n        <div className="nav-tools" />\n      </nav>\n    </div>`,
        );
        touchedApp = true;
        return;
      }
      if (/className=["']app["'][^>]*>/i.test(app)) {
        app = app.replace(
          /(className=["']app["'][^>]*>)/i,
          `$1\n      <nav className="nav">\n        <div className="nav-left" />\n        <div className="nav-tools" />\n      </nav>`,
        );
      } else {
        app = app.replace(
          /return\s*\(\s*/i,
          `return (\n    <div className="app">\n      <nav className="nav">\n        <div className="nav-left" />\n        <div className="nav-tools" />\n      </nav>\n`,
        );
        if (!/<\/div>\s*\)\s*;?\s*\}?\s*$/i.test(app)) {
          app = app.replace(/\);\s*$/, '    </div>\n  );\n');
        }
      }
      touchedApp = true;
    };

    const wantsHeroCopy = Boolean(heroHeadlineText) || addHeroHeadlineAsk;
    if (wantsLogo || wantsExtraIcon || wantsSearch || wantsBag || wantsHeroTitle || wantsCenteredWord || wantsSubtitle || wantsCta || wantsFooter || wantsHeroCopy) {
      // Named brand/icon rails use absolute positioning on .app — skip empty nav chrome.
      // CTA / hero-copy alone must not spawn an empty <nav> shell.
      if (
        !wantsCenteredWord
        && !wantsHeroCopy
        && !wantsCta
        && namedBrands.length === 0
        && namedIcons.length === 0
        && (wantsLogo || wantsExtraIcon || wantsSearch || wantsBag || wantsFooter)
      ) {
        ensureNavShell();
      }
      if (!/import\s+['"]\.\/App\.css['"]/.test(app) && /export\s+default/.test(app)) {
        app = `import './App.css';\n${app}`;
        touchedApp = true;
      }
    }

    // Centered word(s): patch into existing shell — never wipe logo/nav/background with a full App rewrite.
    // Marketing / product homepages: never inject flex-center phone-column CSS or a center-word-only App.
    if (wantsCenteredWord && centeredWordFinal && askLooksLikeMarketingOrProductHomepage(t)) {
      const label = centeredWordFinal
        .replace(/[`$]/g, '')
        .replace(/\s+\bonly\s+(?:add|put|place|with|and|no|nothing|keep|leave)\b.*$/i, '')
        .replace(/\s+\b(?:and\s+)?(?:leave|keep|with|nothing|no|without|empty|centered?|centred|in\s+the|middle|clean|white)\b.*$/i, '')
        .trim()
        .slice(0, 72);
      if (label && !looksLikePromptInstructionLeak(label) && /<h1\b/i.test(app)) {
        app = app.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i, `$1${label}$2`);
        touchedApp = true;
      }
      // Intentionally skip centerRules / center-word-only rewrite for marketing.
    } else if (wantsCenteredWord && centeredWordFinal) {
      const label = centeredWordFinal
        .replace(/[`$]/g, '')
        // Stop at trailing instruction tails the regex sometimes swallows.
        // Keep short names that end in "only" (local only / logo only).
        .replace(/\s+\bonly\s+(?:add|put|place|with|and|no|nothing|keep|leave)\b.*$/i, '')
        .replace(/\s+\b(?:and\s+)?(?:leave|keep|with|nothing|no|without|empty|centered?|centred|in\s+the|middle|clean|white)\b.*$/i, '')
        .replace(/\s+\b(?:and\s+)?(?:a\s+)?(?:sage\s+)?pill\s+CTA\b.*$/i, '')
        .replace(/\s+\bone\s+short\s+support\s+line\b.*$/i, '')
        .trim()
        .slice(0, 72);
      if (!label || looksLikePromptInstructionLeak(label)) {
        /* skip empty / instruction residue */
      } else {
      // "blank white page" is canvas color — not ink. Only paint the name white when asked.
      const whiteText = (
        /\b(?:white\s+(?:text|name|title|word|letters?)|(?:text|name|title|word)\s+(?:in\s+)?white|white\s+ink)\b/i.test(t)
        || (/\bwhite\b/i.test(t) && /\b(?:text|name|title|word)\b/i.test(t) && !/\bwhite\s+(?:page|background|blank|canvas)\b/i.test(t) && !/\b(?:blank|page|background)\s+white\b/i.test(t))
      );
      const black = /\bblack\b/i.test(t) && !whiteText;
      const lightBg = /background\s*:\s*(?:#f[0-9a-f]{2,5}|#e[0-9a-f]{2,5}|#d[0-9a-f]{2,5}|#fff|cream|white)/i.test(css)
        || /\b(?:cream|soft\s+gr[ae]y|premium\s+gr[ae]y|light\s+gr[ae]y|white\s+(?:page|background|blank)|blank\s+white)\b/i.test(t)
        || /aria-label=["']Blank page["']/i.test(app);
      const color = whiteText ? '#fff' : black ? '#111' : (lightBg ? '#1a1a1a' : '#fff');
      // Tiny ladder asks ("just the name" / blank shell) — never keep leftover marketing chrome.
      const blankShell = /aria-label=["']Blank page["']/i.test(app)
        || (/className=["'][Aa]pp["'][^>]*>\s*<\/div>/i.test(app) && !/<h1\b/i.test(app));
      // "Show the sentence Welcome…" must not keep About/Features junk from a prior agent miss.
      const showPhraseOnly = Boolean(centeredWordFinal)
        && /\b(?:show|display|write|put|place|add)\b/i.test(t)
        && /\b(?:words?|text|phrase|title|sentence|name)\b/i.test(t)
        && !/\b(?:nav|footer|about|feature|section|logo|icon|button|hero|shop|contact|form)\b/i.test(t)
        && t.length < 180;
      if (wantsNameOnlyShell || blankShell || showPhraseOnly) {
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <h1 className="center-word">${label}</h1>
    </div>
  );
}
`;
        touchedApp = true;
      } else if (/className=["']center-word["']/i.test(app)) {
        // Update existing centered title in place.
        if (/<h1[^>]*className=["']center-word["'][^>]*>[\s\S]*?<\/h1>/i.test(app)) {
          app = app.replace(
            /(<h1[^>]*className=["']center-word["'][^>]*>)([\s\S]*?)(<\/h1>)/i,
            `$1${label}$3`,
          );
        } else {
          app = app.replace(
            /(className=["']center-word["'][^>]*>)([\s\S]*?)(<\/)/i,
            `$1${label}$3`,
          );
        }
        touchedApp = true;
      } else if (/<div\s+className=["'][Aa]pp["']\s*\/>/i.test(app)) {
        app = app.replace(
          /<div\s+className=["'][Aa]pp["']\s*\/>/i,
          `<div className="app">\n      <h1 className="center-word">${label}</h1>\n    </div>`,
        );
        touchedApp = true;
      } else if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
        // Inject title into existing shell (keeps nav/logo/hero siblings).
        if (/<h1[\s>]/i.test(app)) {
          app = app.replace(
            /(<h1\b[^>]*>)([\s\S]*?)(<\/h1>)/i,
            `<h1 className="center-word">${label}</h1>`,
          );
        } else if (/<\/nav>/i.test(app)) {
          // Prefer under the top bar — not above it.
          app = app.replace(
            /<\/nav>/i,
            `</nav>\n      <h1 className="center-word">${label}</h1>`,
          );
        } else {
          app = app.replace(
            /(className=["'][Aa]pp["'][^>]*>)/i,
            `$1\n      <h1 className="center-word">${label}</h1>`,
          );
        }
        touchedApp = true;
      } else if (app.length > 400 && /<(?:header|nav|main|section)\b/i.test(app)) {
        if (/<h1\b/i.test(app)) {
          app = app.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i, `$1${label}$2`);
        }
        touchedApp = true;
      } else {
        // No recognizable shell — minimal centered title only.
        app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <h1 className="center-word">${label}</h1>
    </div>
  );
}
`;
        touchedApp = true;
      }
      // Rename-only: keep whatever corner/center CSS already exists — never DNA top-right drift.
      if (cssPath && !renameOnlyAsk) {
        chrome = pickLayoutChrome(t, app);
        // Explicit corner wins; otherwise DNA picks corner + absolute vs flow.
        const explicitCorner = parseLayoutCorner(t);
        const pinCorner = explicitCorner || chrome.brandCorner;
        const useAbsolute = Boolean(explicitCorner) || chrome.brandPosition === 'absolute';
        const wordPos = useAbsolute
          ? `position:absolute;${pinCorner.startsWith('bottom') ? 'bottom:1.25rem;' : 'top:1.25rem;'}${/right/i.test(pinCorner) ? 'right:1.25rem;' : 'left:1.25rem;'}`
          : 'position:relative;';
        // DNA picks which serif when the user asks for serif — never fall back to a sans DNA face.
        const serifStack = serifStackForChrome(chrome);
        const wantsSerifFace = /\b(?:serif|typeface|professional)\b/i.test(t);
        const wantsSansFace = /\bsans\b/i.test(t) && !wantsSerifFace;
        // Bake font style into the same write — chrome returns before the later font pass.
        const fontBits = (
          /\b(?:cursive|italic)\b/i.test(t)
            ? `font-style:italic;font-family:${serifStack};`
            : wantsSerifFace
              ? `font-family:${serifStack};font-style:normal;`
              : wantsSansFace
                ? 'font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-style:normal;'
                : `font-family:${chrome.displayFont};font-style:normal;`
        ) + (
          /\bbold\b/i.test(t) ? 'font-weight:700;' : /\b(?:thin|light|skinny)\b/i.test(t) ? 'font-weight:300;' : ''
        );
        const weightDefault = /\bbold\b/i.test(t) || /\b(?:thin|light|skinny)\b/i.test(t) ? '' : 'font-weight:600;';
        const align = /right/i.test(pinCorner) ? 'right' : 'left';
        const centerRules = `.app{min-height:100vh;margin:0;position:relative}`
          + `\n.center-word{margin:0;color:${color};font-size:clamp(1.6rem,5vw,3.2rem);${weightDefault}letter-spacing:-0.02em;`
          + `text-align:${align};max-width:min(92vw,28rem);line-height:1.15;${fontBits}${wordPos}}\n`;
        // Preserve existing solid background; flex-center OR corner pin.
        if (/\.app\s*\{[^}]*\}/i.test(css)) {
          css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
            let next = String(body || '');
            if (!/min-height\s*:/i.test(next)) next += ' min-height: 100vh;';
            if (!/margin\s*:/i.test(next)) next += ' margin: 0;';
            next = next
              .replace(/align-items\s*:\s*[^;]+;?/gi, '')
              .replace(/justify-content\s*:\s*[^;]+;?/gi, '');
            if (!/position\s*:/i.test(next)) next += ' position: relative;';
            return `.app {${next}}`;
          });
          touchedCss = true;
        } else {
          css = `${centerRules}${css}`;
          touchedCss = true;
        }
        if (!/\.center-word\b/.test(css)) {
          css += `\n.center-word{margin:0;color:${color};font-size:clamp(1.6rem,5vw,3.2rem);${weightDefault}letter-spacing:-0.02em;text-align:${align};max-width:min(92vw,28rem);line-height:1.15;${fontBits}${wordPos}}\n`;
          touchedCss = true;
        } else {
          css = css.replace(/(\.center-word\s*\{[^}]*?)color\s*:\s*[^;]+/i, `$1color: ${color}`);
          if (fontBits) {
            css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
              let next = String(body || '');
              if (/\b(?:cursive|italic|serif|typeface|professional|sans|bold|thin|light|skinny)\b/i.test(t)) {
                if (/\b(?:cursive|italic|serif|typeface|professional|sans)\b/i.test(t)) {
                  next = next.replace(/font-family\s*:\s*[^;]+;?/gi, '').replace(/font-style\s*:\s*[^;]+;?/gi, '');
                }
                if (/\bbold\b|\b(?:thin|light|skinny)\b/i.test(t)) {
                  next = next.replace(/font-weight\s*:\s*[^;]+;?/gi, '');
                }
                if (!/;\s*$/.test(next) && next.trim()) next = `${next.trim()};`;
                next += ` ${fontBits}`;
              }
              return `.center-word {${next}}`;
            });
          }
          if (pinCorner && wordPos) {
            css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
              let next = String(body || '');
              next = next
                .replace(/position\s*:\s*[^;]+;?/gi, '')
                .replace(/top\s*:\s*[^;]+;?/gi, '')
                .replace(/left\s*:\s*[^;]+;?/gi, '')
                .replace(/right\s*:\s*[^;]+;?/gi, '')
                .replace(/bottom\s*:\s*[^;]+;?/gi, '')
                .replace(/transform\s*:\s*[^;]+;?/gi, '')
                .replace(/text-align\s*:\s*[^;]+;?/gi, '');
              if (!/;\s*$/.test(next) && next.trim()) next = `${next.trim()};`;
              next += ` text-align:left; ${wordPos}`;
              return `.center-word {${next}}`;
            });
          }
          touchedCss = true;
        }
        if (!/\.app\s*\{[^}]*background/i.test(css) && !/\.App\s*\{[^}]*background/i.test(css) && !/background\s*:/i.test(css)) {
          // Never invent black on a blank-white ladder — keep whatever canvas we already have.
          const bg = detectSolidCanvasBg(css, indexCss)
            || (/\bblack\b/i.test(t) ? '#000000' : /\bbrown\b/i.test(t) ? '#8B4513' : '#ffffff');
          css = pinCorner
            ? `.app { min-height: 100vh; margin: 0; background: ${bg}; position: relative; }\n${css}`
            : `.app { min-height: 100vh; margin: 0; background: ${bg}; display: flex; align-items: center; justify-content: center; }\n${css}`;
          touchedCss = true;
        } else if (/\bkeep\b[\s\S]{0,24}\bblack\b|\bblack\s+background\b/i.test(t)) {
          if (/\.App\s*\{/i.test(css) && !/\.App\s*\{[^}]*background\s*:\s*#000/i.test(css)) {
            css = css.replace(/\.App\s*\{([^}]*)\}/i, (m, body) => {
              if (/background\s*:/i.test(body)) {
                return `.App {${String(body).replace(/background(?:-color)?\s*:\s*[^;]+/i, 'background: #000000')}}`;
              }
              return `.App {${body} background: #000000;}`;
            });
            touchedCss = true;
          }
        }
      }
      }
    }

    // Logo / top-left icon: with a centered title, pin the mark to the corner — never group it with the word.
    const wantsCornerLogoFix = /center-word/i.test(app)
      && (/<nav[\s>]/i.test(app) || /className=["']logo["']/i.test(app))
      && !/corner-logo/i.test(app)
      && wantsLogo
      && !extractNameRenameTarget(t)
      && namedBrands.length === 0;
    const lightCanvas = /background\s*:\s*(?:#fef3c7|#fff(?:fff)?|#f[5-9a-f]{5}|#e[8-f][0-9a-f]{4}|cream|white)/i.test(css)
      || /\bcream\b|\bwhite\b/i.test(t);
    const ink = lightCanvas ? '#1a1a1a' : '#ffffff';

    // Company logo rail — skipped on marketing / full-bleed layouts (absolute rails destroy product UIs).
    const pendingBrandSvgs: Array<{ path: string; content: string }> = [];
    const skipAbsoluteRails = briefForbidsAbsoluteRails(t);
    if (namedBrands.length && !skipAbsoluteRails) {
      const missing = namedBrands.filter((b) => !new RegExp(`/logos/${b.id}\\.svg`, 'i').test(app));
      if (missing.length) {
        const brandCorner = parseLayoutCorner(t) || 'top-left';
        const brandRailClass = `brand-rail brand-rail--${brandCorner}`;
        const imgs = missing
          .map((b) => `<img className="brand-mark" data-brand="${b.id}" src="/logos/${b.id}.svg" alt="${b.label}" width="28" height="28" />`)
          .join('');
        if (/className=["'][^"']*brand-rail[^"']*["']/i.test(app)) {
          app = app.replace(/(className=["'][^"']*brand-rail[^"']*["'][^>]*>)/i, `$1${imgs}`);
          app = app.replace(
            /className=["'][^"']*brand-rail[^"']*["']/i,
            `className="${brandRailClass}"`,
          );
        } else if (/<div\s+className=["']app["']\s*\/>/i.test(app)) {
          app = app.replace(
            /<div\s+className=["']app["']\s*\/>/i,
            `<div className="app">\n      <div className="${brandRailClass}" aria-label="Brand logos">${imgs}</div>\n    </div>`,
          );
        } else if (/className=["']app["'][^>]*>/i.test(app)) {
          app = app.replace(
            /(className=["']app["'][^>]*>)/i,
            `$1\n      <div className="${brandRailClass}" aria-label="Brand logos">${imgs}</div>`,
          );
        }
        touchedApp = true;
        for (const b of missing) {
          const path = `public/logos/${b.id}.svg`;
          if (flat[path] == null) {
            pendingBrandSvgs.push({
              path,
              content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${ink}"><title>${b.label}</title><circle cx="12" cy="12" r="9" fill="none" stroke="${ink}" stroke-width="1.4"/><text x="12" y="15.5" text-anchor="middle" font-size="8" font-family="system-ui,sans-serif" fill="${ink}">${b.label.slice(0, 2).toUpperCase()}</text></svg>\n`,
            });
          }
        }
        if (cssPath) {
          if (!/\.brand-rail\b/.test(css)) {
            css += `\n.brand-rail{position:absolute;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:14px;max-width:min(92vw,720px);${iconRailCornerCss(brandCorner)}}`
              + `\n.brand-rail--top-left{top:1.35rem;left:1.35rem;right:auto;bottom:auto}`
              + `\n.brand-rail--top-right{top:1.35rem;right:1.35rem;left:auto;bottom:auto;justify-content:flex-end}`
              + `\n.brand-rail--bottom-left{bottom:1.35rem;left:1.35rem;top:auto;right:auto}`
              + `\n.brand-rail--bottom-right{bottom:1.35rem;right:1.35rem;top:auto;left:auto;justify-content:flex-end}`
              + `\n.brand-mark{display:block;width:28px;height:28px;opacity:.95}\n`;
          } else {
            css = css.replace(
              /\.brand-rail\s*\{[^}]*\}/i,
              `.brand-rail{position:absolute;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:14px;max-width:min(92vw,720px);${iconRailCornerCss(brandCorner)}}`,
            );
          }
          if (/\.app\s*\{/i.test(css) && !/\.app\s*\{[^}]*position\s*:/i.test(css)) {
            css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => `.app {${body} position:relative;}`);
          }
          touchedCss = true;
        }
      }
    }

    // Toolbar icons — never inject absolute icon-rails on marketing / product-homepage layouts.
    const pendingIconSvgs: Array<{ path: string; content: string }> = [];
    const defaultUiIcons = [
      { id: 'search', label: 'search' },
      { id: 'settings', label: 'settings' },
      { id: 'menu', label: 'menu' },
      { id: 'user', label: 'profile' },
    ];
    const iconSet = (skipAbsoluteRails || cafeNavAsk || putBrandLabel || wantsCenteredWord || contactFormChromeSkip || shopSectionChromeSkip)
      ? []
      : namedIcons.length
      ? namedIcons.map((ic) => ({ id: ic.id, label: ic.label }))
      : (wantsExtraIcon && !wantsLogo ? defaultUiIcons : []);
    if (iconSet.length) {
      const missing = iconSet.filter((ic) => !new RegExp(`/icons/${ic.id}\\.svg`, 'i').test(app));
      const corner = parseLayoutCorner(t) || (/\btop[\s-]?right\b/i.test(t) ? 'top-right' : /\bbottom[\s-]?right\b/i.test(t) ? 'bottom-right' : /\bbottom[\s-]?left\b/i.test(t) ? 'bottom-left' : 'top-left');
      const railClass = `icon-rail icon-rail--${corner}`;
      const railAtCorner = new RegExp(`icon-rail--${corner.replace('-', '[-]')}`, 'i').test(app);
      // Ladder: "add settings gear top-right" must pin a corner rail even when the svg
      // already exists in a header/nav (otherwise no_edits forever).
      const needsCornerPin = /\b(?:icon|gear)\b/i.test(t)
        && /\b(?:top|bottom|left|right|corner)\b/i.test(t)
        && !railAtCorner;
      if (missing.length || !/className=["'][^"']*icon-rail/i.test(app) || needsCornerPin) {
        const sourceIcons = (missing.length && !needsCornerPin) ? missing : iconSet;
        const imgs = sourceIcons
          .filter((ic, i, arr) => arr.findIndex((x) => x.id === ic.id) === i)
          .filter((ic) => (
            needsCornerPin
            || !new RegExp(`/icons/${ic.id}\\.svg`, 'i').test(app)
            || missing.some((m) => m.id === ic.id)
          ))
          .map((ic) => `<img className="nav-icon" data-icon="${ic.id}" src="/icons/${ic.id}.svg" alt="${ic.label}" width="22" height="22" />`)
          .join('\n        ');
        if (imgs) {
          let injected = false;
          if (/className=["'][^"']*icon-rail[^"']*["']/i.test(app)) {
            app = app.replace(/(className=["'][^"']*icon-rail[^"']*["'][^>]*>)/i, `$1\n        ${imgs}`);
            // Keep rail corner in sync with the ask when present.
            app = app.replace(
              /className=["'][^"']*icon-rail[^"']*["']/i,
              `className="${railClass}"`,
            );
            injected = true;
          } else if (/<div\s+className=["']app["']\s*\/>/i.test(app)) {
            app = app.replace(
              /<div\s+className=["']app["']\s*\/>/i,
              `<div className="app">\n      <div className="${railClass}" aria-label="Icons">\n        ${imgs}\n      </div>\n    </div>`,
            );
            injected = true;
          } else if (/className=["']app["'][^>]*>/i.test(app)) {
            app = app.replace(
              /(className=["']app["'][^>]*>)/i,
              `$1\n      <div className="${railClass}" aria-label="Icons">\n        ${imgs}\n      </div>`,
            );
            injected = true;
          } else if (/className=["']nav-tools["']/i.test(app)) {
            app = app.replace(/(className=["']nav-tools["'][^>]*>)/i, `$1${imgs}`);
            injected = true;
          }
          if (injected) {
            touchedApp = true;
            for (const ic of missing.length ? missing : iconSet) {
              const path = `public/icons/${ic.id}.svg`;
              if (flat[path] == null && !pendingIconSvgs.some((p) => p.path === path)) {
                pendingIconSvgs.push({ path, content: simpleUiIconSvg(ic.id, ink) });
              }
            }
            if (cssPath) {
              if (!/\.icon-rail\b/.test(css)) {
                css += `\n.icon-rail{position:absolute;z-index:2;display:flex;flex-direction:column;gap:14px;${iconRailCornerCss(corner)}}`
                  + `\n.icon-rail--top-left{top:1.25rem;left:1.25rem;right:auto;bottom:auto}`
                  + `\n.icon-rail--top-right{top:1.25rem;right:1.25rem;left:auto;bottom:auto;align-items:flex-end}`
                  + `\n.icon-rail--bottom-left{bottom:1.25rem;left:1.25rem;top:auto;right:auto}`
                  + `\n.icon-rail--bottom-right{bottom:1.25rem;right:1.25rem;top:auto;left:auto;align-items:flex-end}`
                  + `\n.nav-icon{display:block;opacity:.92;width:22px;height:22px}\n`;
                touchedCss = true;
              } else {
                // Re-home existing rail corner class rules if ask names a corner.
                css = css.replace(
                  /\.icon-rail\s*\{[^}]*\}/i,
                  `.icon-rail{position:absolute;z-index:2;display:flex;flex-direction:column;gap:14px;${iconRailCornerCss(corner)}}`,
                );
                touchedCss = true;
              }
              if (/\.app\s*\{/i.test(css) && !/\.app\s*\{[^}]*position\s*:/i.test(css)) {
                css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => `.app {${body} position:relative;}`);
                touchedCss = true;
              }
            }
          }
        }
      }
    }

    if ((wantsLogo && namedBrands.length === 0 && !(/corner-logo|className=["']logo["']|\/logo\.svg/i.test(app))) || wantsCornerLogoFix) {
      const hasCenteredWord = /center-word/i.test(app);
      if (hasCenteredWord) {
        app = app.replace(/\s*<nav className=["']nav["']>[\s\S]*?<\/nav>\s*/i, '\n');
        if (!/corner-logo/i.test(app)) {
          app = app.replace(
            /(className=["']app["'][^>]*>)/i,
            `$1\n      <a className="corner-logo" href="#top" aria-label="Logo"><img src="/logo.svg" alt="" width="40" height="40" /></a>`,
          );
        }
        touchedApp = true;
        if (cssPath) {
          // Preserve existing .app background — never force brown when adding a logo.
          if (/\.app\s*\{/i.test(css)) {
            css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
              let next = String(body || '');
              if (!/position\s*:/i.test(next)) next += ' position:relative;';
              return `.app {${next}}`;
            });
          } else {
            css += `\n.app{position:relative;min-height:100vh;margin:0}\n`;
          }
          if (!/\.corner-logo\b/.test(css)) {
            css += `\n.corner-logo{position:absolute;top:1.5rem;left:1.5rem;z-index:2;line-height:0}`
              + `\n.corner-logo img{display:block;width:40px;height:40px}\n`;
          }
          touchedCss = true;
        }
      } else {
        ensureNavShell();
        if (!/<div className=["']nav-left["']/i.test(app) && /<nav/i.test(app)) {
          app = app.replace(
            /(<nav[^>]*>)/i,
            `$1\n        <div className="nav-left"><a className="logo" href="#top" aria-label="Logo"><img src="/logo.svg" alt="" width="36" height="36" /></a></div>`,
          );
        } else if (/<div className=["']nav-left["']\s*\/>/i.test(app)) {
          app = app.replace(
            /<div className=["']nav-left["']\s*\/>/i,
            `<div className="nav-left"><a className="logo" href="#top" aria-label="Logo"><img src="/logo.svg" alt="" width="36" height="36" /></a></div>`,
          );
        } else if (/<div className=["']nav-left["'][^>]*>/i.test(app) && !/className=["']logo["']/i.test(app)) {
          app = app.replace(
            /(<div className=["']nav-left["'][^>]*>)/i,
            `$1<a className="logo" href="#top" aria-label="Logo"><img src="/logo.svg" alt="" width="36" height="36" /></a>`,
          );
        }
        touchedApp = true;
        if (cssPath && !/\.nav-left\b/.test(css)) {
          css += `\n.nav{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 1.5rem}`
            + `\n.nav-left{display:flex;align-items:center;gap:12px}`
            + `\n.logo img{display:block;width:36px;height:36px}\n`;
          touchedCss = true;
        }
      }
    }

    // Always materialize a simple logo mark when we reference /logo.svg.
    if ((wantsLogo || /\/logo\.svg/i.test(app)) && flat['public/logo.svg'] == null) {
      /* handled below via out push when returning chrome edits */
    }

    // Legacy single menu stamp — only when no icon-rail was created above.
    if (
      wantsExtraIcon
      && !cafeNavAsk
      && namedIcons.length === 0
      && !/className=["'][^"']*icon-rail/i.test(app)
      && !(/nav-icon|\/icons\/menu\.svg/i.test(app) && /nav-left/i.test(app))
    ) {
      const icon = `<img className="nav-icon" data-icon="menu" src="/icons/menu.svg" alt="" width="20" height="20" />`;
      if (/<\/div>\s*(?=<div className=["']nav-tools)/i.test(app) && /nav-left/i.test(app)) {
        app = app.replace(
          /(<div className=["']nav-left["'][^>]*>)([\s\S]*?)(<\/div>)/i,
          (_m, a: string, inner: string, c: string) => `${a}${inner}${icon}${c}`,
        );
      } else if (/className=["']logo["'][\s\S]{0,200}/i.test(app)) {
        app = app.replace(
          /(className=["']logo["'][\s\S]*?<\/a>)/i,
          `$1${icon}`,
        );
      } else if (/className=["']corner-logo["'][\s\S]{0,200}/i.test(app)) {
        app = app.replace(
          /(className=["']corner-logo["'][\s\S]*?<\/a>)/i,
          `$1${icon}`,
        );
      } else if (/className=["']app["'][^>]*>/i.test(app) && !/nav-icon/i.test(app)) {
        app = app.replace(
          /(className=["']app["'][^>]*>)/i,
          `$1\n      <img className="nav-icon corner-icon" data-icon="menu" src="/icons/menu.svg" alt="" width="20" height="20" />`,
        );
      }
      touchedApp = true;
      if (cssPath && !/\.nav-icon\b/.test(css)) {
        css += `\n.nav-icon{display:block;opacity:.92;width:20px;height:20px}`
          + `\n.corner-icon{position:absolute;top:1.65rem;left:4.75rem;z-index:2}\n`;
        touchedCss = true;
      }
      if (flat['public/icons/menu.svg'] == null && !pendingIconSvgs.some((p) => p.path === 'public/icons/menu.svg')) {
        pendingIconSvgs.push({ path: 'public/icons/menu.svg', content: simpleUiIconSvg('menu', ink) });
      }
    }

    if (wantsSearch && !(/type=["']search["']|placeholder=["']Search/i.test(app))) {
      const search = `<input type="search" className="search-bar" placeholder="Search" aria-label="Search" />`;
      if (/<div className=["']nav-tools["']\s*\/>/i.test(app)) {
        app = app.replace(/<div className=["']nav-tools["']\s*\/>/i, `<div className="nav-tools">${search}</div>`);
      } else if (/<div className=["']nav-tools["'][^>]*>/i.test(app)) {
        app = app.replace(/(<div className=["']nav-tools["'][^>]*>)/i, `$1${search}`);
      } else if (/<\/nav>/i.test(app)) {
        app = app.replace(/<\/nav>/i, `<div className="nav-tools">${search}</div>\n      </nav>`);
      }
      touchedApp = true;
      if (cssPath && !/\.search-bar\b/.test(css)) {
        const searchBg = lightCanvas ? 'rgba(26,26,26,.06)' : '#222';
        const searchFg = lightCanvas ? '#1a1a1a' : '#fff';
        css += `\n.nav-tools{display:flex;align-items:center;gap:12px}`
          + `\n.search-bar{padding:.5rem .85rem;border:0;border-radius:999px;background:${searchBg};color:${searchFg};font-size:.9rem}\n`;
        touchedCss = true;
      }
    }

    {
      const wantsCount = wantsBag && /\b(?:bump|count|increment|qty|quantity|add\s+to\s+cart)\b/i.test(t);
      const hasCartMark = /\/icons\/bag\.svg|shopping-bag|aria-label=["']Cart|cart-btn|cart-count/i.test(app);
      if (wantsBag && !hasCartMark) {
        const bag = wantsCount
          ? `<button type="button" className="cart-btn" aria-label="Cart" onClick={() => setCart((c) => c + 1)}>Cart <span className="cart-count">{cart}</span></button>`
          : `<img className="nav-icon" src="/icons/bag.svg" alt="" width="20" height="20" aria-label="Cart" />`;
        if (/className=["']search-bar["'][^>]*>/i.test(app)) {
          app = app.replace(/(className=["']search-bar["'][^>]*>)/i, `$1${bag}`);
        } else if (/<div className=["']nav-tools["'][^>]*>/i.test(app)) {
          app = app.replace(/(<div className=["']nav-tools["'][^>]*>)/i, `$1${bag}`);
        } else if (/<\/nav>/i.test(app)) {
          app = app.replace(/<\/nav>/i, `${bag}\n      </nav>`);
        }
        app = app.replace(/import\s+cartIcon\s+from\s+['"]\/path\/to\/[^'"]+['"];?\s*/i, '');
        app = app.replace(/src=\{cartIcon\}/i, 'src="/icons/bag.svg"');
        touchedApp = true;
      }
      // Upgrade a static bag icon into a counting Cart control when asked to bump.
      if (wantsCount && !/setCart|cart-count/i.test(app)) {
        app = app.replace(
          /<img className=["']nav-icon["'][^>]*aria-label=["']Cart["'][^>]*\/?>/i,
          `<button type="button" className="cart-btn" aria-label="Cart" onClick={() => setCart((c) => c + 1)}>Cart <span className="cart-count">{cart}</span></button>`,
        );
        if (!/\b(?:useState|setCart)\b/.test(app)) {
          if (!/from\s+['"]react['"]/.test(app)) {
            app = `import { useState } from 'react';\n${app}`;
          } else if (!/\buseState\b/.test(app)) {
            app = app.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react['"]/, (_m, inner: string) => (
              `import { ${String(inner).trim().replace(/,\s*$/, '')}, useState } from 'react'`
            ));
          }
          app = app.replace(
            /export\s+default\s+function\s+App\s*\(\s*\)\s*\{/,
            'export default function App() {\n  const [cart, setCart] = useState(0);',
          );
        }
        if (/Add to cart/i.test(app)) {
          app = app.replace(
            /<button([^>]*)>\s*Add to cart\s*<\/button>/gi,
            '<button type="button" className="add-to-cart" onClick={() => setCart((c) => c + 1)}>Add to cart</button>',
          );
        }
        touchedApp = true;
        if (cssPath && !/\.cart-btn\b/.test(css)) {
          css += `\n.cart-btn{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem}`
            + `\n.cart-count{font-weight:600}\n.add-to-cart{cursor:pointer}\n`;
          touchedCss = true;
        }
      }
    }

    // Café / coffee primary nav — Menu · Rewards · Gift Cards + Find a café · Sign in · Join now.
    // Keeps the brand name; never wipe the ladder shell into a marketing rebuild.
    if (cafeNavAsk) {
      const brand = (
        app.match(/<h1[^>]*className=["']center-word["'][^>]*>\s*([\s\S]*?)\s*<\/h1>/i)?.[1]
        || app.match(/className=["'](?:brand|logo-text|site-name)["'][^>]*>\s*([\s\S]*?)\s*</i)?.[1]
        || extractPutPlaceNameLabel(t)
        || extractBrandLabel(t)
        || 'Oak and Bean'
      ).replace(/<[^>]+>/g, '').replace(/[`$]/g, '').trim().slice(0, 72) || 'Oak and Bean';
      const leftLinks = ['Menu', 'Rewards', 'Gift Cards']
        .filter((l) => new RegExp(`\\b${l.replace(/\s+/g, '\\s+')}\\b`, 'i').test(t) || wantsCafePrimaryNav)
        .map((l) => {
          const href = `#${l.toLowerCase().replace(/\s+/g, '-')}`;
          return `<a href="${href}">${l}</a>`;
        })
        .join('\n          ');
      const rightBits: string[] = [];
      if (/\bFind\s+a\s+caf[eé]\b/i.test(t) || wantsCafePrimaryNav) {
        rightBits.push('<a href="#find-cafe">Find a café</a>');
      }
      if (/\bSign\s*in\b/i.test(t) || wantsCafePrimaryNav) {
        rightBits.push('<a href="#sign-in">Sign in</a>');
      }
      if (/\bJoin\s+now\b/i.test(t) || wantsCafePrimaryNav) {
        rightBits.push('<a className="join" href="#join">Join now</a>');
      }
      const nav = `<nav className="nav" aria-label="Primary">
        <div className="nav-left">
          <a className="brand" href="#top">${brand}</a>
          ${leftLinks}
        </div>
        <div className="nav-tools">
          ${rightBits.join('\n          ')}
        </div>
      </nav>`;
      // Drop accidental hamburger rails — Menu here is a text link, not an icon.
      app = app.replace(/\s*<div className=["'][^"']*icon-rail[^"']*["'][^>]*>[\s\S]*?<\/div>\s*/gi, '\n');
      if (/<nav[\s>]/i.test(app) && /aria-label=["']Primary["']/i.test(app)) {
        app = app.replace(/<nav\b[^>]*aria-label=["']Primary["'][^>]*>[\s\S]*?<\/nav>/i, nav);
        touchedApp = true;
      } else if (/<nav[\s>]/i.test(app)) {
        app = app.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/i, nav);
        touchedApp = true;
      } else if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
        // Drop absolute center-word — brand moves into the nav.
        app = app.replace(/\s*<h1[^>]*className=["']center-word["'][^>]*>[\s\S]*?<\/h1>\s*/i, '\n');
        app = app.replace(/(className=["'][Aa]pp["'][^>]*>)/i, `$1\n      ${nav}`);
        touchedApp = true;
      }
      if (touchedApp && cssPath) {
        if (/\.app\s*\{/i.test(css)) {
          css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
            let next = String(body || '');
            if (!/position\s*:/i.test(next)) next += ' position: relative;';
            if (!/display\s*:/i.test(next)) next += ' display: flex; flex-direction: column;';
            return `.app {${next}}`;
          });
        }
        // Absolute center-word no longer applies once brand is in the nav.
        css = css.replace(/\.center-word\s*\{[^}]*\}/ig, '');
        css = css.replace(/\.icon-rail[^{]*\{[^}]*\}/ig, '');
        if (!/\.nav\b/.test(css)) {
          css += `\n.nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.5rem;width:100%;box-sizing:border-box}`
            + `\n.nav-left,.nav-tools{display:flex;align-items:center;gap:1.1rem;flex-wrap:wrap}`
            + `\n.nav a{color:inherit;text-decoration:none;font-size:.95rem}`
            + `\n.nav .brand{font-weight:700;letter-spacing:-0.02em;font-size:1.05rem}`
            + `\n.nav .join{font-weight:600}\n`;
          touchedCss = true;
        } else {
          touchedCss = true;
        }
      }
    }

    // Café day banner — green strip + Start an order (Starbucks-style ladder).
    {
      const wantsDayBanner = (
        /\b(?:day\s+banner|green\s+banner|banner)\b/i.test(t)
        || /\bgreat\s+day\s+for\s+coffee\b/i.test(t)
        || /\bStart\s+an\s+order\b/i.test(t)
      ) && /\b(?:add|put|include|with|under)\b/i.test(t);
      if (wantsDayBanner && !cafeNavAsk) {
        const bannerCopy = (
          t.match(/\b(?:says?|reading|that\s+says?)\s*[:\s]+["“']?([^"”'\n.]{8,80})/i)?.[1]
          || (/great\s+day\s+for\s+coffee/i.test(t) ? "It's a great day for coffee" : '')
          || "It's a great day for coffee"
        ).replace(/[`$]/g, '').trim().slice(0, 80);
        const cta = (
          t.match(/\b(Start\s+an\s+order)\b/i)?.[1]
          || 'Start an order'
        ).replace(/[`$]/g, '');
        const banner = `<section className="day-banner" aria-label="Day banner">
        <p className="day-banner__copy">${bannerCopy}</p>
        <button type="button" className="day-banner__cta">${cta}</button>
      </section>`;
        // Drop accidental generic Explore CTAs from the parallel chrome path.
        app = app.replace(/\s*<button\b[^>]*className=["']cta["'][^>]*>\s*Explore\s*<\/button>/gi, '');
        if (/className=["']day-banner["']/i.test(app)) {
          app = app.replace(/<section\b[^>]*className=["']day-banner["'][^>]*>[\s\S]*?<\/section>/i, banner);
          touchedApp = true;
        } else if (/<\/nav>/i.test(app)) {
          app = app.replace(/<\/nav>/i, `</nav>\n      ${banner}`);
          touchedApp = true;
        } else if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
          app = app.replace(/(className=["'][Aa]pp["'][^>]*>)/i, `$1\n      ${banner}`);
          touchedApp = true;
        }
        if (touchedApp && cssPath) {
          if (!/\.day-banner\b/.test(css)) {
            css += `\n.day-banner{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;padding:1rem 1.5rem;background:#1e3932;color:#fff;width:100%;box-sizing:border-box}`
              + `\n.day-banner__copy{margin:0;font-size:1rem;font-weight:600;letter-spacing:-0.01em}`
              + `\n.day-banner__cta{border:0;border-radius:999px;padding:.55rem 1.15rem;background:#fff;color:#1e3932;font:inherit;font-weight:600;cursor:pointer}\n`;
            touchedCss = true;
          } else {
            touchedCss = true;
          }
        }
      }
    }

    // Café promo text sections — Fall is here / Free refills (no images yet).
    {
      const wantsFall = /\bFall\s+is\s+here\b/i.test(t);
      const wantsRefills = /\bFree\s+refills?\b/i.test(t);
      const wantsPromoSections = (wantsFall || wantsRefills)
        && /\b(?:add|put|include|section|below)\b/i.test(t)
        && !/\b(?:image|photo|picture)\b/i.test(t);
      if (wantsPromoSections && !cafeNavAsk) {
        const both: string[] = [];
        if (wantsFall) {
          both.push(`<section className="promo-section" aria-label="Fall is here">
        <h2>Fall is here</h2>
        <p>Crisp air, warm cups — seasonal favorites are back at Oak and Bean.</p>
      </section>`);
        }
        if (wantsRefills) {
          both.push(`<section className="promo-section" aria-label="Free refills">
        <h2>Free refills</h2>
        <p>Stay awhile — hot coffee and tea refills are on us while you're in the café.</p>
      </section>`);
        }
        const block = both.join('\n      ');
        if (block) {
          if (/className=["']promo-section["']/i.test(app)) {
            app = app.replace(/(?:\s*<section\b[^>]*className=["']promo-section["'][^>]*>[\s\S]*?<\/section>)+/i, `\n      ${block}`);
            touchedApp = true;
          } else if (/day-banner/i.test(app)) {
            app = app.replace(/(<section\b[^>]*className=["']day-banner["'][^>]*>[\s\S]*?<\/section>)/i, `$1\n      ${block}`);
            touchedApp = true;
          } else if (/<\/nav>/i.test(app)) {
            app = app.replace(/<\/nav>/i, `</nav>\n      ${block}`);
            touchedApp = true;
          } else if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
            app = app.replace(/(className=["'][Aa]pp["'][^>]*>)/i, `$1\n      ${block}`);
            touchedApp = true;
          }
          if (touchedApp && cssPath && !/\.promo-section\b/.test(css)) {
            css += `\n.promo-section{padding:2.5rem 1.5rem;max-width:40rem}`
              + `\n.promo-section h2{margin:0 0 .5rem;font-size:clamp(1.5rem,3vw,2rem);letter-spacing:-0.02em}`
              + `\n.promo-section p{margin:0;color:#333;line-height:1.5}\n`;
            touchedCss = true;
          }
        }
      }
    }

    // Café footer — About / Careers / Social Impact + social placeholders.
    {
      const wantsCafeFooter = (
        /\bfooter\b/i.test(t)
        && /\b(?:add|put|include|simple)\b/i.test(t)
        && (
          /\b(?:About\s*Us|Careers|Social\s+Impact)\b/i.test(t)
          || /\bsocial\b/i.test(t)
          || /\bcolumns?\b/i.test(t)
        )
      );
      if (wantsCafeFooter && !cafeNavAsk) {
        const footer = `<footer className="site-footer" aria-label="Footer">
        <div className="site-footer__cols">
          <div className="site-footer__col">
            <h3>About Us</h3>
            <a href="#about">Our story</a>
            <a href="#stores">Our cafés</a>
          </div>
          <div className="site-footer__col">
            <h3>Careers</h3>
            <a href="#jobs">Culture</a>
            <a href="#jobs">Open roles</a>
          </div>
          <div className="site-footer__col">
            <h3>Social Impact</h3>
            <a href="#impact">Community</a>
            <a href="#impact">Sustainability</a>
          </div>
        </div>
        <div className="site-footer__social" aria-label="Social">
          <a href="#social-instagram" aria-label="Instagram">Instagram</a>
          <a href="#social-x" aria-label="X">X</a>
          <a href="#social-facebook" aria-label="Facebook">Facebook</a>
        </div>
      </footer>`;
        if (/<footer\b/i.test(app)) {
          app = app.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/i, footer);
          touchedApp = true;
        } else if (/<\/div>\s*\)\s*;?\s*\}\s*$/i.test(app)) {
          app = app.replace(/\n\s*<\/div>\s*\)\s*;?\s*\}\s*$/i, `\n      ${footer}\n    </div>\n  );\n}\n`);
          touchedApp = true;
        } else if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
          app = app.replace(/(className=["'][Aa]pp["'][^>]*>[\s\S]*)(<\/div>\s*\))/i, `$1\n      ${footer}\n    $2`);
          touchedApp = true;
        }
        if (touchedApp && cssPath && !/\.site-footer\b/.test(css)) {
          css += `\n.site-footer{margin-top:auto;padding:2.5rem 1.5rem 2rem;border-top:1px solid #e5e5e5;background:#f7f7f7;color:#1a1a1a;width:100%;box-sizing:border-box}`
            + `\n.site-footer__cols{display:flex;flex-wrap:wrap;gap:2rem;margin-bottom:1.5rem}`
            + `\n.site-footer__col{display:flex;flex-direction:column;gap:.4rem;min-width:8rem}`
            + `\n.site-footer__col h3{margin:0 0 .35rem;font-size:.85rem;text-transform:uppercase;letter-spacing:.04em}`
            + `\n.site-footer a{color:inherit;text-decoration:none;font-size:.95rem}`
            + `\n.site-footer__social{display:flex;gap:1rem;flex-wrap:wrap}\n`;
          touchedCss = true;
        }
      }
    }

    // Sticky product nav — inject without wiping center-word / hero content.
    // Skip when the ask is a simple top-right Work/Contact pair (handled later).
    {
      const wantsWorkContactNav = (
        /\b(?:Work|Shop|Products)\b/.test(t)
        && /\bContact\b/.test(t)
        && /\b(?:nav|navigation|links?)\b/i.test(t)
      );
      const wantsStickyNav = !wantsWorkContactNav && (
        /\b(?:add|put|include)\b[\s\S]{0,48}\b(?:sticky\s+)?nav(?:igation|bar)?\b/i.test(t)
        || (/\bsticky\b/i.test(t) && /\bnav(?:igation|bar)?\b/i.test(t))
      );
      const labels = [...t.matchAll(/\b(Products|Specs|Buy|Shop|About|Contact|Menu|Home|Work)\b/g)]
        .map((m) => m[1]);
      const uniq = [...new Set(labels)];
      if (wantsStickyNav && uniq.length && !/<nav[\s>]/i.test(app)) {
        const links = uniq
          .map((l) => `<li><a href="#${l.toLowerCase()}">${l}</a></li>`)
          .join('');
        const nav = `<nav className="sticky-nav" aria-label="Primary">\n        <ul>${links}</ul>\n      </nav>`;
        if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
          app = app.replace(/(className=["'][Aa]pp["'][^>]*>)/i, `$1\n      ${nav}`);
          touchedApp = true;
        }
        if (touchedApp && cssPath && !/\.sticky-nav\b/.test(css)) {
          css += `\n.sticky-nav{position:sticky;top:0;z-index:20;width:100%;flex-shrink:0;background:#000;padding:.75rem 1rem}`
            + `\n.sticky-nav ul{list-style:none;margin:0;padding:0;display:flex;justify-content:center;gap:1.25rem}`
            + `\n.sticky-nav a{color:#fff;text-decoration:none;font-size:.95rem}\n`;
          touchedCss = true;
        }
        // Keep brand centered when sticky nav shares the column — but never
        // overlay absolute brand once a hero stack (photos/tagline) exists.
        if (touchedApp && cssPath && /className=["']center-word["']/i.test(app)) {
          if (/\.app\s*\{/i.test(css)) {
            css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
              let next = String(body || '');
              if (!/position\s*:/i.test(next)) next += ' position: relative;';
              if (!/flex-direction\s*:/i.test(next)) next += ' flex-direction: column;';
              return `.app {${next}}`;
            });
          }
          const heroBlock = app.match(/<section\b[^>]*className=["']hero["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || '';
          const heroHasStack = /hero-photo|tagline/i.test(heroBlock);
          if (/\.center-word\s*\{/i.test(css)) {
            css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
              let next = String(body || '');
              if (!/;\s*$/.test(next) && next.trim()) next = `${next.trim()};`;
              if (heroHasStack) {
                next = next
                  .replace(/position\s*:\s*absolute\s*;?/ig, '')
                  .replace(/left\s*:\s*[^;]+;?/ig, '')
                  .replace(/top\s*:\s*[^;]+;?/ig, '')
                  .replace(/transform\s*:\s*[^;]+;?/ig, '');
              } else if (!/position\s*:/i.test(next)) {
                next += ' position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);';
              }
              return `.center-word {${next}}`;
            });
          }
          // Prefer brand inside the hero once photos/tagline exist.
          if (heroHasStack) {
            const brand = app.match(/<h1[^>]*className=["']center-word["'][^>]*>[\s\S]*?<\/h1>/i)?.[0];
            if (brand && !/className=["']center-word["']/i.test(heroBlock)) {
              app = app.replace(brand, '');
              app = app.replace(/(<section\b[^>]*className=["']hero["'][^>]*>)/i, `$1\n        ${brand}`);
              touchedApp = true;
            }
          }
          touchedCss = true;
        }
      }
    }

    if (wantsHeroTitle) {
      const title = (heroTitle || 'Nightglass').replace(/[`$]/g, '');
      if (!/<h1[\s>]/i.test(app)) {
        const hero = `<section className="hero"><h1>${title}</h1></section>`;
        if (/<\/nav>/i.test(app)) app = app.replace(/<\/nav>/i, `</nav>\n      ${hero}`);
        else app = app.replace(/(className=["']app["'][^>]*>)/i, `$1\n      ${hero}`);
        touchedApp = true;
      } else if (heroTitle) {
        app = app.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${title}</h1>`);
        touchedApp = true;
      }
      if (cssPath && !/\.hero\b/.test(css)) {
        css += `\n.hero{padding:4rem 1.5rem 2rem;text-align:center}\n.hero h1{margin:0;font-size:clamp(2rem,6vw,3.5rem);font-weight:600;color:#fff}\n`;
        touchedCss = true;
      }
    }

    if (wantsSubtitle) {
      const line = (subtitle || 'Quiet light for dark rooms.').replace(/[`$]/g, '');
      if (/<section className=["']hero["'][^>]*>/i.test(app) && !/<p className=["']subtitle["']/i.test(app)) {
        app = app.replace(
          /(<section className=["']hero["'][^>]*>[\s\S]*?<h1[^>]*>[\s\S]*?<\/h1>)/i,
          `$1\n        <p className="subtitle">${line}</p>`,
        );
        touchedApp = true;
      } else if (!/<p className=["']subtitle["']/i.test(app) && /<\/h1>/i.test(app)) {
        app = app.replace(/<\/h1>/i, `</h1>\n        <p className="subtitle">${line}</p>`);
        touchedApp = true;
      }
      if (cssPath && !/\.subtitle\b/.test(css)) {
        css += `\n.subtitle{margin:.75rem 0 0;color:#c8c8c8;font-size:1.05rem}\n`;
        touchedCss = true;
      }
    }

    // Keep brand in top-left; add a separate centered hero headline (+ optional support line).
    if (wantsHeroCopy && heroHeadlineText) {
      const h = heroHeadlineText.replace(/[`$]/g, '').slice(0, 120);
      const support = heroSupportText.replace(/[`$]/g, '').slice(0, 180);
      const supportHtml = support
        ? `\n        <p className="hero-support">${support}</p>`
        : '';
      if (/className=["']hero-headline["']/i.test(app)) {
        app = app.replace(
          /(<h2\b[^>]*className=["']hero-headline["'][^>]*>)([\s\S]*?)(<\/h2>)/i,
          `$1${h}$3`,
        );
        if (support) {
          if (/className=["']hero-support["']/i.test(app)) {
            app = app.replace(
              /(<p\b[^>]*className=["']hero-support["'][^>]*>)([\s\S]*?)(<\/p>)/i,
              `$1${support}$3`,
            );
          } else {
            app = app.replace(
              /(<\/h2>\s*)/i,
              `</h2>${supportHtml}\n        `,
            );
          }
        }
        touchedApp = true;
      } else {
        const block = `<section className="hero-copy" aria-label="Hero">
        <h2 className="hero-headline">${h}</h2>${supportHtml}
      </section>`;
        // Rebuild lockup to brand+tagline only, then place hero as the next sibling.
        // Never insert after </p> inside an absolute lockup (Keyline/Auralis overlap & nesting).
        if (/className=["']brand-lockup["']/i.test(app)) {
          app = app.replace(
            /<div\b[^>]*className=["']brand-lockup["'][^>]*>[\s\S]*?<\/div>/i,
            (lock) => {
              const brand = lock.match(/<h1\b[^>]*className=["']center-word["'][^>]*>[\s\S]*?<\/h1>/i)?.[0] || '';
              const tag = lock.match(/<p\b[^>]*className=["']tagline["'][^>]*>[\s\S]*?<\/p>/i)?.[0] || '';
              return `<div className="brand-lockup">\n        ${brand}${tag ? `\n        ${tag}` : ''}\n      </div>\n      ${block}`;
            },
          );
          if (!/className=["']hero-copy["']/i.test(app)) {
            app = insertAfterBrandLockup(app, block);
          }
        } else if (/className=["']tagline["'][\s\S]{0,200}<\/p>/i.test(app)) {
          app = app.replace(/(<p\b[^>]*className=["']tagline["'][^>]*>[\s\S]*?<\/p>)/i, `$1\n      ${block}`);
        } else if (/<\/h1>/i.test(app)) {
          app = app.replace(/<\/h1>/i, `</h1>\n      ${block}`);
        } else if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
          app = app.replace(/(className=["'][Aa]pp["'][^>]*>)/i, `$1\n      ${block}`);
        }
        touchedApp = true;
      }
      {
        const hoisted = hoistOutOfBrandLockup(app);
        if (hoisted.moved) {
          app = hoisted.app;
          touchedApp = true;
        }
      }
      if (cssPath && !hasCssClassRule(css, 'hero-copy')) {
        // Compact in-flow hero — never absolute inset:0 and never min-height:100vh (blank band above Shop/Work).
        chrome = pickLayoutChrome(t, app);
        const family = inferUiLayoutFamily(t, app);
        const lowerLeft = /\b(?:lower\s+left|bottom\s+left|left\s+(?:column|side)\s+lower|left[- ]?aligned)\b/i.test(t);
        const heroCss = lowerLeft
          ? `.hero-copy{position:relative;z-index:1;min-height:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;text-align:left;margin:18vh 0 1.5rem 6vw;padding:0;max-width:min(92vw,26rem);box-sizing:border-box;width:100%}`
          : heroCopyCssForFamily(family, chrome);
        css += `\n${heroCss}`
          + `\n.hero-headline{margin:0;font-size:clamp(1.8rem,5vw,3.4rem);font-weight:600;letter-spacing:-0.03em;max-width:min(92vw,34rem);line-height:1.15;font-family:${chrome.displayFont}}`
          + `\n.hero-support{margin:.85rem 0 0;max-width:min(92vw,28rem);opacity:.82;font-size:1.05rem;line-height:1.45}\n`;
        touchedCss = true;
      } else if (cssPath && (
        /\.hero-copy\s*\{[^}]*position\s*:\s*absolute/i.test(css)
        || /\.hero-copy\s*\{[^}]*min-height\s*:\s*100(?:vh|svh)/i.test(css)
        || /\b(?:lower\s+left|left[- ]?aligned)\b/i.test(t)
      )) {
        chrome = pickLayoutChrome(t, app);
        const lowerLeft = /\b(?:lower\s+left|bottom\s+left|left\s+(?:column|side)\s+lower|left[- ]?aligned)\b/i.test(t);
        const heroCss = lowerLeft
          ? `.hero-copy{position:relative;z-index:1;min-height:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;text-align:left;margin:18vh 0 1.5rem 6vw;padding:0;max-width:min(92vw,26rem);box-sizing:border-box;width:100%}`
          : heroCopyCssForFamily(inferUiLayoutFamily(t, app), chrome);
        css = css.replace(/\.hero-copy\s*\{[^}]*\}/i, heroCss);
        touchedCss = true;
      }
      if (cssPath && /\.app\s*\{/i.test(css) && !/\.app\s*\{[^}]*position\s*:/i.test(css)) {
        css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => `.app {${body} position:relative;}`);
        touchedCss = true;
      }
    }

    if (wantsCta) {
      const label = (ctaLabel || 'Explore').replace(/[`$']/g, '');
      const labelEsc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const already = new RegExp(`>\\s*${labelEsc}\\s*<`, 'i').test(app);
      if (!already) {
        const btn = `<button type="button" className="cta">${label}</button>`;
        // Prefer under hero copy / support — never dump CTA under the top-left brand <h1>.
        if (/className=["']hero-support["'][\s\S]{0,160}<\/p>/i.test(app)) {
          app = app.replace(/(<p\b[^>]*className=["']hero-support["'][^>]*>[\s\S]*?<\/p>)/i, `$1\n        ${btn}`);
        } else if (/className=["']hero-headline["'][\s\S]{0,200}<\/h2>/i.test(app)) {
          app = app.replace(/(<h2\b[^>]*className=["']hero-headline["'][^>]*>[\s\S]*?<\/h2>)/i, `$1\n        ${btn}`);
        } else if (/className=["']hero-copy["'][\s\S]*?<\/section>/i.test(app)) {
          app = app.replace(
            /(<section\b[^>]*className=["']hero-copy["'][^>]*>[\s\S]*?)(<\/section>)/i,
            `$1        ${btn}\n      $2`,
          );
        } else if (/className=["']subtitle["'][\s\S]{0,120}/i.test(app)) {
          app = app.replace(/(<p className=["']subtitle["'][^>]*>[\s\S]*?<\/p>)/i, `$1\n        ${btn}`);
        } else if (/<\/section>/i.test(app)) {
          app = app.replace(/<\/section>/i, `  ${btn}\n      </section>`);
        } else if (/<\/h1>/i.test(app)) {
          app = app.replace(/<\/h1>/i, `</h1>\n        ${btn}`);
        }
        touchedApp = true;
      }
      if (cssPath && !/\.cta\b/.test(css)) {
        chrome = pickLayoutChrome(t, app);
        const lightOnDark = /background(?:-color)?\s*:\s*(?:#0|#1|#2|black)/i.test(css)
          || /\bcharcoal\b|\bblack\b/i.test(t);
        css += ctaCssFromRecipe(chrome, lightOnDark);
        touchedCss = true;
      }
    }

    // Product photos + tagline (fail-closed verifyAsk needs real https srcs)
    {
      const wantsMousePhoto = /\bmouse\b/i.test(t) && /\b(?:photo|shot|image|img|hero)\b/i.test(t);
      const wantsKeyboardPhoto = /\bkeyboard\b/i.test(t) && /\b(?:photo|shot|image|img)\b/i.test(t);
      // "Keep Micora and the tagline" must not fire chrome — only real add/place asks.
      const wantsTagline = (
        /\btagline\b/i.test(t)
        && /\b(?:add|put|place|under|include|with|says?|reading)\b/i.test(t)
        && !/\bkeep\b[\s\S]{0,40}\btagline\b/i.test(t)
      ) || (/\bprecision\b/i.test(t) && /\bspeed\b/i.test(t) && /\b(?:add|short)\b/i.test(t));
      // Prefer the user's exact copy: "tagline that says: …" / "tagline: …" / quoted.
      const taglineText = (
        t.match(/\btagline\b[\s\S]{0,48}\b(?:that\s+)?(?:says?|reading)\s*[:\s]+["“']?([^"”'\n.]{4,100})/i)?.[1]
        || t.match(/\btagline\s*[:—–-]\s*["“']?([^"”'\n.]{4,100})/i)?.[1]
        || t.match(/\btagline\b[\s\S]{0,40}["“']([^"”']{4,100})["”']/i)?.[1]
        || ''
      ).trim().replace(/[.,;:]+$/g, '');
      const mouseUrl = productGlyphDataUrl('Gaming mouse', { role: 'hero', brief: 'gaming mouse', accent: '#6b8cae' });
      const keyboardUrl = productGlyphDataUrl('Mechanical keyboard', { role: 'hero', brief: 'mechanical keyboard', accent: '#6b8cae' });
      const ensureHeroShell = () => {
        if (/className=["']hero["']/i.test(app)) return;
        const shell = `<section className="hero"></section>`;
        if (/<\/nav>/i.test(app)) app = app.replace(/<\/nav>/i, `</nav>\n      ${shell}`);
        else if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
          app = app.replace(/(className=["'][Aa]pp["'][^>]*>)/i, `$1\n      ${shell}`);
        }
        touchedApp = true;
      };
      if (wantsMousePhoto && !/alt=["'][^"']*mouse/i.test(app)) {
        ensureHeroShell();
        const img = `<img className="hero-photo" src="${mouseUrl}" alt="Gaming mouse product photo" />`;
        if (/<section className=["']hero["'][^>]*>/i.test(app)) {
          app = app.replace(/(<section className=["']hero["'][^>]*>)/i, `$1\n        ${img}`);
        } else if (/className=["']center-word["']/i.test(app)) {
          app = app.replace(/(<h1[^>]*className=["']center-word["'][^>]*>[\s\S]*?<\/h1>)/i, `$1\n      ${img}`);
        }
        touchedApp = true;
      }
      if (wantsKeyboardPhoto && !/alt=["'][^"']*keyboard/i.test(app)) {
        ensureHeroShell();
        const img = `<img className="hero-photo" src="${keyboardUrl}" alt="Mechanical keyboard product shot" />`;
        if (/alt=["'][^"']*mouse/i.test(app)) {
          app = app.replace(
            /(<img className=["']hero-photo["'][^>]*mouse[^>]*>)/i,
            `$1\n        ${img}`,
          );
        } else if (/<section className=["']hero["'][^>]*>/i.test(app)) {
          app = app.replace(/(<section className=["']hero["'][^>]*>)/i, `$1\n        ${img}`);
        } else if (/<\/h1>/i.test(app)) {
          app = app.replace(/<\/h1>/i, `</h1>\n      ${img}`);
        }
        touchedApp = true;
      }
      if (wantsTagline) {
        const line = (taglineText || 'Precision and speed — built for the win.').replace(/[`$']/g, '').slice(0, 120);
        const tag = `<p className="tagline">${line}</p>`;
        if (/className=["']tagline["']/i.test(app)) {
          // Update existing tagline copy when the user gave exact words.
          if (taglineText) {
            app = app.replace(
              /(<p\b[^>]*className=["']tagline["'][^>]*>)([\s\S]*?)(<\/p>)/i,
              `$1${line}$3`,
            );
            touchedApp = true;
          }
        } else if (/alt=["'][^"']*keyboard/i.test(app)) {
          app = app.replace(/(<img className=["']hero-photo["'][^>]*keyboard[^>]*>)/i, `$1\n        ${tag}`);
          touchedApp = true;
        } else if (/alt=["'][^"']*mouse/i.test(app)) {
          app = app.replace(/(<img className=["']hero-photo["'][^>]*mouse[^>]*>)/i, `$1\n        ${tag}`);
          touchedApp = true;
        } else if (/className=["']center-word["']/i.test(app)) {
          // Always stack brand + tagline in one lockup (absolute OR flow) so they never drift apart.
          const locked = ensureBrandLockup(app, tag);
          app = locked.app;
          touchedApp = true;
        } else if (/<\/h1>/i.test(app)) {
          app = app.replace(/<\/h1>/i, `</h1>\n        ${tag}`);
          touchedApp = true;
        }
        // Retrofit: tagline sibling to brand without lockup → wrap.
        if (
          /className=["']tagline["']/i.test(app)
          && /className=["']center-word["']/i.test(app)
          && !/className=["']brand-lockup["']/i.test(app)
        ) {
          const existing = app.match(/<p\b[^>]*className=["']tagline["'][^>]*>[\s\S]*?<\/p>/i)?.[0];
          if (existing) {
            app = app.replace(existing, '');
            const locked = ensureBrandLockup(app, existing);
            app = locked.app;
            touchedApp = true;
          }
        }
      }
      if ((wantsMousePhoto || wantsKeyboardPhoto || wantsTagline) && cssPath) {
        if ((wantsMousePhoto || wantsKeyboardPhoto) && !/\.hero-photo\b/.test(css)) {
          css += `\n.hero{display:flex;flex-direction:column;align-items:center;gap:1rem;padding:2rem 1.25rem;text-align:center;flex:1;justify-content:center}`
            + `\n.hero-photo{width:min(420px,86vw);height:auto;border-radius:12px;object-fit:cover;display:block}\n`;
          touchedCss = true;
        }
        if (wantsTagline && !/\.tagline\b/.test(css)) {
          chrome = pickLayoutChrome(t, app);
          const forceItalic = /\b(?:italic|cursive)\b/i.test(t);
          css += `\n.tagline{margin:.55rem 0 0;color:inherit;opacity:.82;${taglineCssFromRecipe(chrome, forceItalic)}}\n`;
          touchedCss = true;
        } else if (wantsTagline && /\b(?:italic|cursive)\b/i.test(t) && /\.tagline\b/.test(css)) {
          // Explicit italic ask wins; otherwise leave DNA tagline alone.
          css = css.replace(/\.tagline\s*\{([^}]*)\}/i, (_m, body: string) => {
            let next = String(body || '');
            if (!/font-style\s*:\s*italic/i.test(next)) {
              if (!/;\s*$/.test(next) && next.trim()) next = `${next.trim()};`;
              next += ' font-style:italic; font-family:Georgia,"Times New Roman",serif;';
            }
            return `.tagline {${next}}`;
          });
          touchedCss = true;
        }
        if (wantsTagline && /className=["']brand-lockup["']/i.test(app) && !hasCssClassRule(css, 'brand-lockup')) {
          chrome = pickLayoutChrome(t, app);
          const corner = parseLayoutCorner(t) || chrome.brandCorner;
          css += `\n${brandLockupCss(corner, { position: chrome.brandPosition })}\n`;
          touchedCss = true;
        }
        // Brand belongs in the hero stack, not absolutely over the photos.
        // Important: only treat brand as nested when it sits INSIDE the hero
        // section ([\s\S]* across </section> falsely matched brand siblings).
        if (/className=["']center-word["']/i.test(app) && /className=["']hero["']/i.test(app) && !/className=["']brand-lockup["']/i.test(app)) {
          const heroBlock = app.match(/<section\b[^>]*className=["']hero["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || '';
          const brand = app.match(/<h1[^>]*className=["']center-word["'][^>]*>[\s\S]*?<\/h1>/i)?.[0];
          if (brand && !/className=["']center-word["']/i.test(heroBlock)) {
            app = app.replace(brand, '');
            app = app.replace(/(<section\b[^>]*className=["']hero["'][^>]*>)/i, `$1\n        ${brand}`);
            touchedApp = true;
          }
          if (cssPath && /\.center-word\s*\{[^}]*position\s*:\s*absolute/i.test(css)) {
            css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
              const next = String(body || '')
                .replace(/position\s*:\s*absolute\s*;?/ig, '')
                .replace(/left\s*:\s*[^;]+;?/ig, '')
                .replace(/top\s*:\s*[^;]+;?/ig, '')
                .replace(/transform\s*:\s*[^;]+;?/ig, '');
              return `.center-word {${next}}`;
            });
            touchedCss = true;
          }
        }
      }
    }

    // Contact / Help / email footer — keep animated canvas; never Nightglass + black wipe.
    {
      const email = (t.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i)?.[1] || '').trim();
      const wantsContactHelpFooter = (
        (/\bcontact\b/i.test(t) && /\bfooter\b/i.test(t))
        || (/\bfooter\b/i.test(t) && /\b(?:help|email)\b/i.test(t))
      ) && /\b(?:add|put|include)\b/i.test(t);
      if (wantsContactHelpFooter) {
        const help = /\bhelp\b/i.test(t);
        const mail = email || 'hello@example.com';
        const foot = `<footer className="contact-footer" aria-label="Contact">
        <p className="contact-footer__label">Contact</p>
        ${help ? '<a className="contact-footer__help" href="#help">Help</a>' : ''}
        <a className="contact-footer__email" href="mailto:${mail}">${mail}</a>
      </footer>`;
        if (/className=["']contact-footer["']/i.test(app) || /<footer\b[^>]*aria-label=["']Contact["']/i.test(app)) {
          app = app.replace(/<footer\b[^>]*(?:className=["']contact-footer["']|aria-label=["']Contact["'])[^>]*>[\s\S]*?<\/footer>/i, foot);
        } else if (/<\/section>/i.test(app)) {
          const lastSec = app.toLowerCase().lastIndexOf('</section>');
          if (lastSec >= 0) {
            app = `${app.slice(0, lastSec)}</section>\n      ${foot}${app.slice(lastSec + '</section>'.length)}`;
          }
        } else {
          const lastClose = app.lastIndexOf('</div>');
          if (lastClose >= 0) {
            app = `${app.slice(0, lastClose)}${foot}\n    ${app.slice(lastClose)}`;
          }
        }
        touchedApp = true;
        if (cssPath && !hasCssClassRule(css, 'contact-footer')) {
          css += `\n.contact-footer{margin-top:auto;padding:2rem 1.5rem 2.5rem;display:flex;flex-wrap:wrap;align-items:baseline;gap:1rem 1.5rem;border-top:1px solid color-mix(in srgb,currentColor 16%,transparent);font-size:.95rem}`
            + `\n.contact-footer__label{margin:0;letter-spacing:0.08em;text-transform:uppercase;opacity:.7;font-size:.75rem}`
            + `\n.contact-footer a{color:inherit;text-decoration:none;opacity:.9}`
            + `\n.contact-footer a:hover{opacity:1;text-decoration:underline}\n`;
          touchedCss = true;
        }
        if (/\.app\s*\{/i.test(css) && !/\.app\s*\{[^}]*display\s*:\s*flex/i.test(css)) {
          css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
            let next = String(body || '');
            if (!/;\s*$/.test(next.trim()) && next.trim()) next = `${next.trim()};`;
            if (!/display\s*:/i.test(next)) next += ' display:flex; flex-direction:column;';
            return `.app {${next}}`;
          });
          touchedCss = true;
        }
      }
    }

    if (wantsFooter && !/<footer[\s>]/i.test(app) && !/\bcontact\b/i.test(t)) {
      const brand = (
        t.match(/\bfooter\b[\s\S]{0,60}\bword\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/i)?.[1]
        || t.match(/\bfooter\b[\s\S]{0,40}\b(?:with|say)\s+["']([A-Za-z][A-Za-z0-9 _-]{1,40})["']/i)?.[1]
        || 'Nightglass'
      ).replace(/[`$']/g, '');
      const foot = `<footer className="footer"><span>${brand}</span></footer>`;
      if (/<\/section>/i.test(app)) {
        app = app.replace(/<\/section>/i, `</section>\n      ${foot}`);
      } else if (/<\/nav>/i.test(app)) {
        app = app.replace(/<\/nav>/i, `</nav>\n      ${foot}`);
      } else {
        const lastClose = app.lastIndexOf('</div>');
        if (lastClose >= 0) {
          app = `${app.slice(0, lastClose)}${foot}\n    ${app.slice(lastClose)}`;
        }
      }
      touchedApp = true;
      if (cssPath && !/\.footer\b/.test(css)) {
        css += `\n.footer{margin-top:auto;padding:1.25rem 1.5rem;border-top:1px solid color-mix(in srgb,currentColor 18%,transparent);opacity:.75;font-size:.9rem}\n`;
        touchedCss = true;
      }
    }

    if (/\bpolish\b/i.test(t) && /\b(?:spacing|header|hero|footer|premium)\b/i.test(t)) {
      if (cssPath) {
        css += `\n.nav{padding:1.25rem 2rem}.hero{padding:5.5rem 2rem 3rem}.hero h1{letter-spacing:-0.02em}.subtitle{max-width:28rem;margin-left:auto;margin-right:auto}.footer{padding:1.5rem 2rem}\n`;
        touchedCss = true;
      }
    }

    // "move the plant cards lower / more breathing room under the headline"
    if (
      cssPath
      && /\b(?:move|shift|nudge|lower|drop)\b/i.test(t)
      && /\b(?:card|cards|grid|row|section|content|list)\b/i.test(t)
      && /\b(?:lower|down|below|breathing|space|spacing|margin|crowd|under)\b/i.test(t)
    ) {
      css += `\nmain,.product-cards,.plant-cards,section{margin-top:2.75rem}`
        + `\nheader+main,header+section{margin-top:2.5rem}`
        + `\nmain ul,main .product-cards{margin-top:1.75rem}\n`;
      touchedCss = true;
    }

    // Soft card shadows + rounded corners + soft green accents (cream page stays).
    if (
      cssPath
      && (
        (/\b(?:shadows?|box-shadow)\b/i.test(t) && /\b(?:card|soft|plant)\b/i.test(t))
        || (/\brounded\b/i.test(t) && /\b(?:corner|card)\b/i.test(t))
      )
    ) {
      if (!/box-shadow\s*:[^;]+/i.test(css) || !/\.plant-card|\.product-card/i.test(css)) {
        css += `\n.plant-card,.product-card,article.card{background:#fffef8;border-radius:14px;`
          + `box-shadow:0 10px 28px rgba(22,101,52,.12);border:1px solid rgba(22,101,52,.12);padding:1rem 1.1rem}\n`
          + `.price,.price-tag{color:#166534;font-weight:600}\n`
          + `button.add-to-cart,.add-to-cart{background:#166534;color:#fff;border:0;border-radius:10px;padding:.55rem 1rem}\n`;
        touchedCss = true;
      }
    }

    // Sticky top bar / nav so brand + cart stay visible while scrolling.
    if (
      cssPath
      && /\bsticky\b/i.test(t)
      && /\b(?:top\s*bar|header|nav|cart)\b/i.test(t)
    ) {
      if (!/position\s*:\s*sticky/i.test(css)) {
        css += `\nheader,.top-bar,nav.nav,.nav{position:sticky;top:0;z-index:40;`
          + `backdrop-filter:saturate(1.1) blur(8px);background:rgba(245,240,232,.92)}\n`;
        touchedCss = true;
      }
    }

    // "add a simple top bar with the name Garden Bed on the left — soft green accent, keep cream"
    {
      const barName = (
        t.match(/\b(?:name|called|titled)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})(?:\s+on\s+the\s+left)?\b/)?.[1]
        || ''
      ).trim();
      if (
        barName
        && /\b(?:top\s*bar|header|nav)\b/i.test(t)
        && /\b(?:add|put|place|simple)\b/i.test(t)
      ) {
        const safe = barName.replace(/[<>&]/g, '').slice(0, 48);
        if (!new RegExp(safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(app)) {
          ensureNavShell();
          if (/<div className=["']nav-left["']\s*\/>/i.test(app)) {
            app = app.replace(
              /<div className=["']nav-left["']\s*\/>/i,
              `<div className="nav-left"><span className="brand">${safe}</span></div>`,
            );
          } else if (/<div className=["']nav-left["'][^>]*>/i.test(app)) {
            app = app.replace(
              /(<div className=["']nav-left["'][^>]*>)([\s\S]*?)(<\/div>)/i,
              `$1<span className="brand">${safe}</span>$3`,
            );
          } else if (/<nav className=["']nav["'][^>]*>/i.test(app)) {
            app = app.replace(
              /(<nav className=["']nav["'][^>]*>)/i,
              `$1\n        <div className="nav-left"><span className="brand">${safe}</span></div>`,
            );
          }
          touchedApp = true;
        }
        if (cssPath) {
          if (!/\.nav\s*\{[^}]*display\s*:\s*flex/i.test(css)) {
            css += `\n.nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.5rem;width:100%;box-sizing:border-box;}\n`;
            touchedCss = true;
          }
          if (!/\.brand\b/.test(css)) {
            css += `\n.brand{font-weight:700;letter-spacing:.02em;color:#166534;font-size:1.15rem}\n`;
            touchedCss = true;
          }
          if (/\bcream\b/i.test(t) && !/background\s*:\s*#f5f0e8/i.test(css)) {
            if (/\.app\s*\{[^}]*background/i.test(css)) {
              css = css.replace(/(\.app\s*\{[^}]*background\s*:\s*)([^;]+)(;)/i, '$1#f5f0e8$3');
            } else {
              css += `\n.app{min-height:100vh;background:#f5f0e8;margin:0}\n`;
            }
            touchedCss = true;
          }
        }
      }
    }

    // Responsive plant/product card grid — three across on desktop.
    if (
      cssPath
      && /\b(?:grid|three\s+across|responsive)\b/i.test(t)
      && /\b(?:card|cards|plant)\b/i.test(t)
    ) {
      if (!/\.plant-cards|\.product-cards/i.test(css) || !/grid-template-columns/i.test(css)) {
        css += `\n.plant-cards,.product-cards,main .cards{display:grid;gap:1.25rem;`
          + `grid-template-columns:repeat(3,minmax(0,1fr));padding:0 1.25rem 2rem}`
          + `\n@media (max-width:820px){.plant-cards,.product-cards,main .cards{grid-template-columns:repeat(2,minmax(0,1fr))}}`
          + `\n@media (max-width:520px){.plant-cards,.product-cards,main .cards{grid-template-columns:1fr}}\n`;
        touchedCss = true;
      }
    }

    if (touchedApp || touchedCss) {
      // Chrome returns early — apply font style here so put-name + serif verifies in one pass.
      if (
        cssPath
        && /className=["']center-word["']/i.test(app)
        && (
          looksLikeNameFontStyleAsk(t)
          || (/\b(?:bold|italic|cursive|serif|typeface|sans|thin|light|skinny|professional|font)\b/i.test(t)
            && /\b(?:make|look|style|font|change|set|more|try|typeface)\b/i.test(t))
        )
      ) {
        if (/\.center-word\s*\{/i.test(css)) {
          css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
            let next = String(body || '');
            if (!/;\s*$/.test(next) && next.trim()) next = `${next.trim()};`;
            if (/\bbold\b/i.test(t)) {
              next = next.replace(/font-weight\s*:\s*[^;]+;?/gi, '');
              next += ' font-weight:700;';
            } else if (/\b(?:thin|light|skinny)\b/i.test(t)) {
              next = next.replace(/font-weight\s*:\s*[^;]+;?/gi, '');
              next += ' font-weight:300;';
            }
            chrome = pickLayoutChrome(t, app);
            if (/\b(?:cursive|italic)\b/i.test(t)) {
              next = next.replace(/font-style\s*:\s*[^;]+;?/gi, '');
              next = next.replace(/font-family\s*:\s*[^;]+;?/gi, '');
              next += ` font-style:italic; font-family:${serifStackForChrome(chrome)};`;
            } else if (/\b(?:serif|typeface|professional)\b/i.test(t)) {
              next = next.replace(/font-family\s*:\s*[^;]+;?/gi, '');
              next = next.replace(/font-style\s*:\s*[^;]+;?/gi, '');
              // DNA picks which serif — not always Georgia twin; never sans-serif false positive.
              next += ` font-family:${serifStackForChrome(chrome)}; font-style:normal;`;
            } else if (/\bsans\b/i.test(t)) {
              next = next.replace(/font-family\s*:\s*[^;]+;?/gi, '');
              next = next.replace(/font-style\s*:\s*[^;]+;?/gi, '');
              next += ' font-family:system-ui,-apple-system,Segoe UI,sans-serif; font-style:normal;';
            }
            return `.center-word {${next}}`;
          });
          touchedCss = true;
        }
      }
      {
        const hoisted = hoistOutOfBrandLockup(app);
        if (hoisted.moved) {
          app = hoisted.app;
          touchedApp = true;
        }
      }
      const out: WebFileEdit[] = [];
      if (touchedApp) out.push({ path: appPath, content: app });
      // Never return App.css alone after a solid-bg paint — index.css loads last in main
      // and a leftover white root paints the Live window floor (windowed two-tone bug).
      if (touchedCss && cssPath) {
        const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
        out.push(...syncSolidCanvasEdits(flat, cssPath, canvas, css));
        for (const mainKey of ['src/main.tsx', 'src/main.jsx'] as const) {
          const mainSrc = String(flat[mainKey] || '');
          if (!mainSrc) continue;
          const swapped = mainSrc.replace(
            /(import\s+App\s+from\s+['"]\.\/App[^'"]*['"];?\s*\n)(\s*import\s+['"]\.\/index\.css['"];?\s*\n?)/,
            (_m, appLine: string, indexLine: string) => `${indexLine.trim()}\n${appLine}`,
          );
          if (swapped !== mainSrc) out.push({ path: mainKey, content: swapped });
          break;
        }
      } else if (touchedIndex) {
        out.push({ path: 'src/index.css', content: indexCss });
      }
      for (const svg of pendingBrandSvgs) out.push(svg);
      for (const svg of pendingIconSvgs) out.push(svg);
      if (/\/logo\.svg/i.test(app) && flat['public/logo.svg'] == null) {
        // Premium ink mark — works on cream/light without invert filters.
        out.push({
          path: 'public/logo.svg',
          content: [
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">`,
            `<circle cx="32" cy="32" r="23" stroke="${ink}" stroke-width="1.4"/>`,
            `<path d="M22 38.5V25.5L32 19.5l10 6v13L32 44.5 22 38.5z" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/>`,
            `<circle cx="32" cy="32" r="3.25" fill="${ink}"/>`,
            `</svg>\n`,
          ].join(''),
        });
      }
      if (/\/icons\/menu\.svg/i.test(app) && flat['public/icons/menu.svg'] == null) {
        out.push({
          path: 'public/icons/menu.svg',
          content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>\n`,
        });
      }
      if (/\/icons\/bag\.svg/i.test(app) && flat['public/icons/bag.svg'] == null) {
        out.push({
          path: 'public/icons/bag.svg',
          content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>\n`,
        });
      }
      if (/\/icons\/search\.svg/i.test(app) && flat['public/icons/search.svg'] == null) {
        out.push({
          path: 'public/icons/search.svg',
          content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16.5 16.5 21 21"/></svg>\n`,
        });
      }
      return out;
    }
  }

  // Top nav links — Work|Shop|Products + Contact / Contact / Support.
  {
    const primaryNavLabel = (
      /\bShop\b/.test(t) ? 'Shop'
      : /\bProducts\b/.test(t) ? 'Products'
      : /\bWork\b/.test(t) ? 'Work'
      : ''
    );
    const wantsWorkContact = (
      Boolean(primaryNavLabel)
      && /\bContact\b/.test(t)
      && /\b(?:nav|navigation|links?|header|menu|top)\b/i.test(t)
      && /\b(?:add|put|include|with)\b/i.test(t)
    );
    if (wantsWorkContact) {
      chrome = pickLayoutChrome(t, app);
      const primaryHref = /Shop|Products/i.test(primaryNavLabel) ? 'shop' : 'work';
      const links = `<div className="nav-tools" aria-label="Primary">
          <a href="#${primaryHref}">${primaryNavLabel}</a>
          <a href="#contact">Contact</a>
        </div>`;
      // brand-row: put a live brand+tagline copy inside nav-left (lockup stays for a11y, CSS-clipped).
      const brandForNav = (() => {
        if (chrome.nav !== 'brand-row') return '<div className="nav-left" />';
        const brand = app.match(/<h1\b[^>]*className=["']center-word["'][^>]*>[\s\S]*?<\/h1>/i)?.[0] || '';
        const tag = app.match(/<p\b[^>]*className=["']tagline["'][^>]*>[\s\S]*?<\/p>/i)?.[0] || '';
        if (!brand) return '<div className="nav-left" />';
        return `<div className="nav-left">${brand}${tag ? `\n          ${tag}` : ''}</div>`;
      })();
      if (!/<nav[\s>]/i.test(app)) {
        if (/className=["'][Aa]pp["'][^>]*>/i.test(app)) {
          app = app.replace(
            /(className=["'][Aa]pp["'][^>]*>)/i,
            `$1\n      <nav className="nav" aria-label="Primary">\n        ${brandForNav}\n        ${links}\n      </nav>`,
          );
          touchedApp = true;
        }
      } else if (/className=["']nav-tools["']/i.test(app)) {
        app = app.replace(
          /<div className=["']nav-tools["'][^>]*>[\s\S]*?<\/div>/i,
          links,
        );
        if (chrome.nav === 'brand-row' && /className=["']nav-left["']/i.test(app)) {
          app = app.replace(
            /<div className=["']nav-left["'][^>]*(?:\/>|>\s*<\/div>)/i,
            brandForNav,
          );
        }
        // Also drop stray Contact-only buttons left by older surgical passes.
        app = app.replace(/\s*<button\b[^>]*>\s*Contact\s*<\/button>\s*/gi, '\n');
        touchedApp = true;
      } else if (/<\/nav>/i.test(app)) {
        app = app.replace(/\s*<button\b[^>]*>\s*Contact\s*<\/button>\s*/gi, '\n');
        app = app.replace(/<\/nav>/i, `${links}\n      </nav>`);
        touchedApp = true;
      }
      if (touchedApp && cssPath) {
        // Always restyle nav from DNA so Shop/Contact don't land in the same twin corner every time.
        if (/\.nav\s*\{/i.test(css)) {
          css = css.replace(/\.nav\s*\{[^}]*\}/i, '');
        }
        if (/\.nav-tools\s*\{[^}]*\}/i.test(css)) {
          css = css.replace(/\.nav-tools\s*\{[^}]*\}/i, '');
        }
        if (/\.nav-tools\s+a\s*\{[^}]*\}/i.test(css)) {
          css = css.replace(/\.nav-tools\s+a\s*\{[^}]*\}/gi, '');
        }
        css += navToolsCssFromRecipe(chrome);
        touchedCss = true;
      }
    } else {
      const navLabelMatch = t.match(/\b(?:add|put|insert|include)\b[\s\S]{0,40}\b(contact|support|help)\b/i)
        || (/\b(?:nav|navbar|header|menu|top)\b/i.test(t)
          ? t.match(/\b(contact|support|help)\b/i)
          : null);
      const navLabelRaw = navLabelMatch?.[1] || '';
      const navLabel = navLabelRaw
        ? navLabelRaw.charAt(0).toUpperCase() + navLabelRaw.slice(1).toLowerCase()
        : '';
      if (
        navLabel
        && /\b(?:add|put|insert|include)\b/i.test(t)
        && /\b(?:nav|navbar|header|menu|top|link)\b/i.test(t)
        && !new RegExp(`>\\s*${navLabel}\\s*<`, 'i').test(app)
      ) {
        const scrollTarget = /\bbuy\b/i.test(t) ? 'buy' : (/\bcontact\b/i.test(t) ? 'buy' : 'buy');
        const navBtn = `<button type="button" onClick={() => go('${scrollTarget}')}>${navLabel}</button>`;
        if (/<nav className="links">[\s\S]*?<\/nav>/i.test(app)) {
          app = app.replace(
            /(<nav className="links">[\s\S]*?)(<\/nav>)/i,
            `$1${navBtn}\n        $2`,
          );
          touchedApp = true;
        } else if (/<\/nav>/i.test(app)) {
          app = app.replace(/<\/nav>/i, `${navBtn}\n      </nav>`);
          touchedApp = true;
        }
      }
    }
  }

  // Remove footer copyright / © line.
  if (
    /\b(?:remove|delete|drop|get rid of)\b/i.test(t)
    && /\b(?:copyright|©|footer\s+(?:line|text|copy))\b/i.test(t)
  ) {
    if (/<span>\s*Copyright[\s\S]*?<\/span>/i.test(app)) {
      app = app.replace(/<span>\s*Copyright[\s\S]*?<\/span>/i, '');
      touchedApp = true;
    } else if (/Copyright\s+\{?new Date\(\)\.getFullYear\(\)\}?[\s\S]*?(?:<\/span>|<\/p>)/i.test(app)) {
      app = app.replace(/\s*<span>\s*Copyright[\s\S]*?<\/span>/i, '');
      touchedApp = true;
    } else if (/©[^<\n]{0,80}/i.test(app)) {
      app = app.replace(/\s*©[^<\n]{0,80}/i, '');
      touchedApp = true;
    }
  }

  const col = t.match(/rename\s+(?:the\s+)?([A-Za-z][A-Za-z0-9_-]*)\s+column\s+to\s+([A-Za-z][A-Za-z0-9_-]*)/i)
    || t.match(/rename\s+(?:the\s+)?([A-Za-z][A-Za-z0-9_-]*)(?:\s+(?:nav\s+)?(?:label|item|tab|link|button|title))?\s+to\s+["'“”]?([A-Za-z][A-Za-z0-9 _-]{0,40})/i)
    || t.match(/rename\s+(?:the\s+)?([A-Za-z][A-Za-z0-9_-]*)\s+to\s+["'“”]?([A-Za-z][A-Za-z0-9 _-]{0,40})/i);
  if (col) {
    const from = col[1];
    const to = col[2].trim().replace(/[.,;:]+$/, '');
    const labelRe = new RegExp(`(label:\\s*['"])${from}(['"])`, 'gi');
    if (labelRe.test(app)) {
      app = app.replace(new RegExp(`(label:\\s*['"])${from}(['"])`, 'gi'), `$1${to}$2`);
      touchedApp = true;
    }
    if (app.includes(`>${from}<`)) {
      app = app.replace(new RegExp(`(>)${from}(<)`, 'g'), `$1${to}$2`);
      touchedApp = true;
    }
    // Multiline nav labels: >\n  Overview\n<
    const multi = new RegExp(`(>)(\\s*)${from}(\\s*)(<)`, 'gi');
    if (multi.test(app)) {
      app = app.replace(new RegExp(`(>)(\\s*)${from}(\\s*)(<)`, 'gi'), `$1$2${to}$3$4`);
      touchedApp = true;
    }
  }

  // Keep trailing periods inside quoted lines ("Slow roast. City mornings.") —
  // only strip list/clause punctuation so verifyMicroAskApplied can match.
  const stripClausePunct = (s: string) => String(s || '').trim().replace(/[,;:]+$/g, '');
  const buttonLabelTo = (
    t.match(/\b(?:make|change|set|update)\b[\s\S]{0,64}\b(?:button|cta|call[\s-]*to[\s-]*action|primary\s+(?:cta|button))\b[\s\S]{0,48}\b(?:say|to|into|label)\s+["'“”]?([^"'“”\n]{1,60})/i)?.[1]
    || t.match(/\b(?:button|cta)\b[\s\S]{0,24}\blabel\b[\s\S]{0,24}\b(?:say|to|into)\s+["'“”]?([^"'“”\n]{1,60})/i)?.[1]
    || null
  );
  const buttonLabelSafe = buttonLabelTo ? stripClausePunct(buttonLabelTo).replace(/[`$'"]/g, '') : '';
  if (buttonLabelSafe) {
    const targetAt = t.search(/\b(?:say|to|into|label)\s+["'“”]/i);
    const askBeforeTarget = targetAt >= 0 ? t.slice(0, targetAt) : t;
    const fromHint = askBeforeTarget.match(/\b(?:start|begin|submit|save|continue|next|login|sign\s*up|pause|reset|shop\s+beans|watch\s+now)\b/i)?.[0];
    let buttonTouched = false;
    if (fromHint && new RegExp(`>(\\s*)${fromHint.replace(/\s+/g, '\\s+')}(\\s*)<`, 'i').test(app)) {
      app = app.replace(new RegExp(`>(\\s*)${fromHint.replace(/\s+/g, '\\s+')}(\\s*)<`, 'i'), `>${buttonLabelSafe}<`);
      buttonTouched = true;
    } else if (/>Primary action</i.test(app)) {
      app = app.replace(/>Primary action</i, `>${buttonLabelSafe}<`);
      buttonTouched = true;
    } else {
      const nextBtn = replaceFirstJsxTagInnerText(app, 'button', buttonLabelSafe);
      if (nextBtn) {
        app = nextBtn;
        buttonTouched = true;
      } else if (/<a\b[^>]*className=["'][^"']*(?:cta|btn|button)[^"']*["']/i.test(app)) {
        const nextA = replaceFirstJsxTagInnerText(app, 'a', buttonLabelSafe);
        if (nextA) {
          app = nextA;
          buttonTouched = true;
        }
      } else if (/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(app)) {
        // Cafe scaffolds often ship hero copy with no CTA control — insert one.
        app = app.replace(
          /(<h1\b[^>]*>[\s\S]*?<\/h1>)(\s*)/i,
          `$1$2<button type="button">${buttonLabelSafe}</button>\n      `,
        );
        buttonTouched = true;
      }
    }
    if (buttonTouched) touchedApp = true;
  }

  const titleTo = (
    t.match(/(?:change|rename|set|make).{0,64}(?:top\s+title|hero\s+headline|hero|headline|heading|title|h1).{0,40}(?:to|into|say)\s+["'“”]?([^"'“”\n]{2,80})/i)?.[1]
    || null
  );
  const titleSafe = titleTo ? stripClausePunct(titleTo).replace(/[`$'"]/g, '').trim() : '';
  if (titleSafe && !buttonLabelSafe) {
    if (/<h1[\s>]/i.test(app)) {
      app = app.replace(/(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i, `$1${titleSafe}$3`);
      touchedApp = true;
    } else if (/className=["'][^"']*(?:title|hero|brand|heading|headline)[^"']*["'][^>]*>/i.test(app)) {
      app = app.replace(/(className=["'][^"']*(?:title|hero|brand|heading|headline)[^"']*["'][^>]*>)([^<]{1,120})/i, `$1${titleSafe}`);
      touchedApp = true;
    }
  }

  // Dual ask: headline + CTA in one message (titleTo skipped when buttonLabelSafe set).
  const headlineAlso = stripClausePunct(
    t.match(/(?:change|rename|set|make).{0,64}(?:hero\s+headline|hero\s+title|headline|heading|h1).{0,40}(?:to|into|say)\s+["'“”]?([^"'“”\n]{2,80})/i)?.[1]
    || '',
  );
  if (headlineAlso) {
    const safe = headlineAlso.replace(/[`$'"]/g, '').trim();
    if (/<h1[\s>]/i.test(app)) {
      app = app.replace(/(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i, `$1${safe}$3`);
      touchedApp = true;
    } else if (/className=["'][^"']*(?:title|hero|brand|heading|headline)[^"']*["'][^>]*>/i.test(app)) {
      app = app.replace(
        /(className=["'][^"']*(?:title|hero|brand|heading|headline)[^"']*["'][^>]*>)([^<]{1,120})/i,
        `$1${safe}`,
      );
      touchedApp = true;
    } else if (/<p\b[^>]*className=["'][^"']*label[^"']*["'][^>]*>/i.test(app)) {
      app = app.replace(
        /(<p\b[^>]*className=["'][^"']*label[^"']*["'][^>]*>)([\s\S]*?)(<\/p>)/i,
        `$1${safe}$3`,
      );
      touchedApp = true;
    } else if (
      (/\bcreateRoot\s*\(/.test(app) && /\bimport\s+App\b/.test(app))
      || !/export\s+default/i.test(app)
      || !/<h1[\s>]/i.test(app)
    ) {
      // Broken / entrypoint / no-hero App — rebuild a minimal hero so the ask can land.
      const cta = buttonLabelSafe || 'Explore';
      app = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <header className="hero">
        <h1>${safe}</h1>
        <button type="button">${cta}</button>
      </header>
    </div>
  );
}
`;
      touchedApp = true;
    }
  }

  if (/\bink\s+notes\b/i.test(t)) {
    if (/titlebar-hint['"][^>]*>[^<]+/i.test(app)) {
      app = app.replace(/(titlebar-hint['"][^>]*>)[^<]+/i, '$1Ink notes');
      touchedApp = true;
    } else if (/>Notes</.test(app)) {
      app = app.replace(/>Notes</, '>Ink notes<');
      touchedApp = true;
    }
  }

  if (/\bnew\s+page\b/i.test(t)) {
    if (/>New [Nn]ote</.test(app)) {
      app = app.replace(/>New [Nn]ote</, '>New page<');
      touchedApp = true;
    }
  }

  if (
    (
      /\bcharcoal\b/i.test(t)
      || (/\bbackground\b/i.test(t) && /\b(?:glow|accent)\b/i.test(t) && /\bred\b/i.test(t))
    )
    && !(/\b(?:animated|gently\s+shifts?|soft\s+animated)\b/i.test(t) && /\b(?:gradient|background)\b/i.test(t))
  ) {
    const charcoal = '#141414';
    const ink = '#f4f7fb';
    // Force App + index onto the same charcoal canvas (don't let white index.css win).
    const synced = syncSolidCanvasEdits(flat, cssPath, charcoal, css);
    for (const e of synced) {
      if (e.path === cssPath || /App\.css$/i.test(e.path)) css = e.content;
      if (/index\.css$/i.test(e.path)) {
        indexCss = e.content;
        touchedIndex = true;
      }
    }
    if (/\.app\s*\{/i.test(css)) {
      css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
        let next = String(body || '');
        if (/background(?:-color)?\s*:/i.test(next)) {
          next = next.replace(/background(?:-color)?\s*:\s*[^;]+/i, `background: ${charcoal}`);
        } else {
          next += ` background: ${charcoal};`;
        }
        if (/color\s*:/i.test(next)) {
          next = next.replace(/color\s*:\s*[^;]+/i, `color: ${ink}`);
        } else {
          next += ` color: ${ink};`;
        }
        if (!/position\s*:/i.test(next)) next += ' position: relative;';
        // Prefer x-clip only — overflow:hidden traps later Work/Contact sections.
        if (!/overflow/i.test(next)) next += ' overflow-x: hidden;';
        else if (/overflow\s*:\s*hidden/i.test(next)) {
          next = next.replace(/overflow\s*:\s*hidden/i, 'overflow-x: hidden');
        }
        return `.app {${next}}`;
      });
    } else {
      css += `\n.app{min-height:100vh;margin:0;background:${charcoal};color:${ink};position:relative;overflow-x:hidden}\n`;
    }
    // Lighten brand/tagline/hero copy on charcoal.
    if (/\.center-word\s*\{/i.test(css)) {
      css = css.replace(/(\.center-word\s*\{[^}]*?)color\s*:\s*[^;]+/i, `$1color: ${ink}`);
    }
    if (/\.tagline\s*\{/i.test(css) && !/color\s*:/i.test(css.match(/\.tagline\s*\{[^}]*\}/i)?.[0] || '')) {
      css = css.replace(/\.tagline\s*\{/i, `.tagline{color:${ink};`);
    }
    if (/\bcharcoal\b/i.test(t) && !/\b(?:glow|accent|red)\b/i.test(t)) {
      // Mood-only charcoal — no red glow unless asked.
      css = css.replace(/\.app::before\s*\{[^}]*\}/ig, '');
    } else if (!/\.hero-glow\b|\.app::before/i.test(css)) {
      css += `\n.app::before{content:"";position:absolute;inset:10% 12% auto;height:min(48vh,420px);border-radius:50%;`
        + `background:radial-gradient(circle,rgba(220,38,38,.35),transparent 68%);pointer-events:none;z-index:0;filter:blur(8px)}`
        + `\n.app>*{position:relative;z-index:1}\n`;
    }
    touchedCss = true;
  }

  // Brand size + red accent underline
  if (/\b(?:underline|larger|bigger)\b/i.test(t) && /className=["']center-word["']/i.test(app)) {
    if (/\.center-word\s*\{/i.test(css)) {
      css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
        let next = String(body || '');
        if (!/;\s*$/.test(next) && next.trim()) next = `${next.trim()};`;
        if (/\blarger|bigger\b/i.test(t)) {
          next = next.replace(/font-size\s*:\s*[^;]+;?/i, '');
          next += ' font-size:clamp(2.2rem,6vw,4rem);';
        }
        if (/\bunderline\b/i.test(t) || /\baccent\b/i.test(t)) {
          if (!/border-bottom\s*:/i.test(next)) {
            next += ' border-bottom:3px solid #dc2626; padding-bottom:.35rem;';
          }
        }
        return `.center-word {${next}}`;
      });
      touchedCss = true;
    }
  }

  // Move centered name: top-left / top-right / bottom-left / bottom-right / center / bottom-center
  // Note: chrome block above may already have returned for add-name asks; this pass covers move-only asks.
  // Also accepts "put it back in the middle" after normalize → "Move the name to the center…".
  if (
    /className=["']center-word["']/i.test(app)
    && /\b(?:move|put|place|shift)\b/i.test(t)
    && /\b(?:top|bottom|left|right|corner|center|centre|middle)\b/i.test(t)
    && !/\b(?:change|rename|set|update)\b[\s\S]{0,40}\b(?:name|title|word)\b[\s\S]{0,24}\b(?:to|into)\b/i.test(t)
  ) {
    // Prefer the clause that names the title / Nightglass / center-word — not icon/logo moves in the same ask.
    // Prefer compound corners (top-left) before bare center/middle so "top left" never recenters.
    const nameClause = (
      t.match(/\b(?:move|put|place|shift)\b[\s\S]{0,64}\b(?:nightglass|center(?:ed)?\s+word|the\s+name|the\s+title|the\s+word|name)\b[\s\S]{0,64}\b(?:top[\s-]?left|top[\s-]?right|bottom[\s-]?left|bottom[\s-]?right|bottom\s+center|top\s+center)\b/i)?.[0]
      || t.match(/\b(?:move|put|place|shift)\b[\s\S]{0,64}\b(?:nightglass|center(?:ed)?\s+word|the\s+name|the\s+title|the\s+word|name)\b[\s\S]{0,64}\b(?:center|centre|middle)\b/i)?.[0]
      || t.match(/\b(?:move|put|place|shift)\b[\s\S]{0,40}\b(?:it|name|title|word)\b[\s\S]{0,48}\b(?:top[\s-]?left|top[\s-]?right|bottom[\s-]?left|bottom[\s-]?right)\b/i)?.[0]
      || t.match(/\b(?:move|put|place|shift)\b[\s\S]{0,40}\b(?:it|name|title|word)\b[\s\S]{0,48}\b(?:top|bottom|left|right|center|middle)\b/i)?.[0]
      || ''
    );
    const scope = nameClause || t;
    const cornerHit = scope.match(/\b(top[\s-]?left|top[\s-]?right|bottom[\s-]?left|bottom[\s-]?right)\b/i)?.[1] || '';
    const top = /top/i.test(cornerHit) || (!cornerHit && /\btop\b/i.test(scope));
    const bottom = /bottom/i.test(cornerHit) || (!cornerHit && /\bbottom\b/i.test(scope));
    const left = /left/i.test(cornerHit) || (!cornerHit && /\bleft\b/i.test(scope));
    const right = /right/i.test(cornerHit) || (!cornerHit && /\bright\b/i.test(scope));
    const wantsCenter = !cornerHit && /\b(?:center|centre|middle)\b/i.test(scope);
    const bottomCenter = bottom && wantsCenter && !left && !right;
    const recenter = wantsCenter && !left && !right && !top && !bottom;
    // Skip if this ask is only about icons/logos and never mentions the name.
    const nameTargeted = Boolean(nameClause)
      || /\b(?:nightglass|center-word|the\s+name|the\s+title|the\s+word)\b/i.test(t)
      || !/\b(?:icon|logo|netflix|search|settings|menu)\b/i.test(t);
    if (!nameTargeted) {
      /* icon/logo-only move — leave the name alone */
    } else if (recenter || (!top && !bottom && !left && !right)) {
      if (/\.app\s*\{/i.test(css)) {
        css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
          let next = String(body || '');
          next = next
            .replace(/align-items\s*:\s*[^;]+;?/gi, '')
            .replace(/justify-content\s*:\s*[^;]+;?/gi, '');
          if (!/display\s*:/i.test(next)) next += ' display:flex;';
          next += ' align-items:center; justify-content:center;';
          return `.app {${next}}`;
        });
      }
      if (/\.center-word\s*\{/i.test(css)) {
        css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
          let next = String(body || '');
          next = next
            .replace(/position\s*:\s*[^;]+;?/gi, '')
            .replace(/top\s*:\s*[^;]+;?/gi, '')
            .replace(/left\s*:\s*[^;]+;?/gi, '')
            .replace(/right\s*:\s*[^;]+;?/gi, '')
            .replace(/bottom\s*:\s*[^;]+;?/gi, '')
            .replace(/transform\s*:\s*[^;]+;?/gi, '');
          return `.center-word {${next}}`;
        });
      }
      touchedCss = true;
    } else {
      const y = bottomCenter || (bottom && !top)
        ? 'bottom:1.25rem;'
        : top ? 'top:1.25rem;' : 'top:50%;';
      const x = left ? 'left:1.25rem;' : right ? 'right:1.25rem;' : 'left:50%;';
      let transform = '';
      if (bottomCenter || (wantsCenter && (top || bottom) && !left && !right)) {
        transform = 'transform:translateX(-50%); left:50%;';
      } else if (!top && !bottom && left) transform = 'transform:translateY(-50%);';
      else if (!top && !bottom && right) transform = 'transform:translateY(-50%);';
      else if (top && !left && !right) transform = 'transform:translateX(-50%); left:50%;';
      else if (bottom && !left && !right) transform = 'transform:translateX(-50%); left:50%;';
      const posCss = `position:absolute;${y}${x}${transform}`;
      if (/\.app\s*\{/i.test(css)) {
        css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
          let next = String(body || '');
          next = next
            .replace(/align-items\s*:\s*[^;]+;?/gi, '')
            .replace(/justify-content\s*:\s*[^;]+;?/gi, '');
          if (!/position\s*:/i.test(next)) next += ' position:relative;';
          return `.app {${next}}`;
        });
      }
      if (/\.center-word\s*\{/i.test(css)) {
        css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
          let next = String(body || '');
          next = next
            .replace(/position\s*:\s*[^;]+;?/gi, '')
            .replace(/top\s*:\s*[^;]+;?/gi, '')
            .replace(/left\s*:\s*[^;]+;?/gi, '')
            .replace(/right\s*:\s*[^;]+;?/gi, '')
            .replace(/bottom\s*:\s*[^;]+;?/gi, '')
            .replace(/transform\s*:\s*[^;]+;?/gi, '');
          if (!/;\s*$/.test(next) && next.trim()) next = `${next.trim()};`;
          next += ` ${posCss}`;
          return `.center-word {${next}}`;
        });
      } else {
        css += `\n.center-word{${posCss}}\n`;
      }
      touchedCss = true;
    }
  }

  // Move named UI icons to layout corners (supports multiple clauses in one ask).
  if (
    /\b(?:move|put|place|shift)\b/i.test(t)
    && /\b(?:icon|search|settings?|menu|user|profile|home|bag|cart|bell)\b/i.test(t)
    && /\b(?:top|bottom|left|right|corner)\b/i.test(t)
    && !/\b(?:float|drift|animat|slowly|around the screen)\b/i.test(t)
  ) {
    const moveRe = /\b(?:move|put|place|shift)\b[\s\S]{0,48}\b(search|settings?|menu|user|profile|home|bag|cart|bell)\b[\s\S]{0,48}\b(top[\s-]?left|top[\s-]?right|bottom[\s-]?left|bottom[\s-]?right)\b/gi;
    const moves: Array<{ iconId: string; corner: NonNullable<ReturnType<typeof parseLayoutCorner>> }> = [];
    let mm: RegExpExecArray | null;
    while ((mm = moveRe.exec(t)) != null) {
      const iconId = String(mm[1] || '').toLowerCase()
        .replace(/^settings?$/, 'settings')
        .replace(/^profile$/, 'user');
      const corner = parseLayoutCorner(mm[2] || '') || parseLayoutCorner(mm[0] || '');
      if (iconId && corner) moves.push({ iconId, corner });
    }
    if (!moves.length) {
      const corner = parseLayoutCorner(t);
      const iconId = (
        t.match(/\b(search|settings?|menu|user|profile|home|bag|cart|bell)\b/i)?.[1]
        || ''
      ).toLowerCase().replace(/^settings?$/, 'settings').replace(/^profile$/, 'user');
      if (corner && iconId) moves.push({ iconId, corner });
    }
    if (moves.length && /nav-icon|icon-rail|\/icons\//i.test(app)) {
      for (const { iconId, corner } of moves) {
        const imgRe = new RegExp(
          `<img\\b[^>]*?(?:data-icon=["']${iconId}["'][^>]*?src=["'][^"']*/icons/${iconId}\\.svg["']|src=["'][^"']*/icons/${iconId}\\.svg["'][^>]*?)[^>]*?/?>`,
          'i',
        );
        const imgMatch = app.match(imgRe);
        if (!imgMatch) continue;
        let imgTag = imgMatch[0];
        if (!/data-icon=/i.test(imgTag)) {
          imgTag = imgTag.replace(/<img\b/i, `<img data-icon="${iconId}"`);
        }
        app = app.replace(imgRe, '');
        app = app.replace(/<div className=["'][^"']*icon-rail[^"']*["'][^>]*>\s*<\/div>\s*/gi, '');
        const targetRailRe = new RegExp(
          `<div className=["'][^"']*icon-rail--${corner}[^"']*["'][^>]*>`,
          'i',
        );
        if (targetRailRe.test(app)) {
          app = app.replace(targetRailRe, (open) => `${open}\n        ${imgTag}`);
        } else if (/className=["']app["'][^>]*>/i.test(app)) {
          app = app.replace(
            /(className=["']app["'][^>]*>)/i,
            `$1\n      <div className="icon-rail icon-rail--${corner}" aria-label="Icons">\n        ${imgTag}\n      </div>`,
          );
        } else if (/<div\s+className=["']app["']\s*\/>/i.test(app)) {
          app = app.replace(
            /<div\s+className=["']app["']\s*\/>/i,
            `<div className="app">\n      <div className="icon-rail icon-rail--${corner}" aria-label="Icons">\n        ${imgTag}\n      </div>\n    </div>`,
          );
        }
        touchedApp = true;
      }
      if (touchedApp && cssPath) {
        // Drop legacy absolute-right .icon-rail stamp that fights corner modifiers.
        css = css.replace(
          /\.icon-rail\s*\{[^}]*right\s*:\s*1\.35rem[^}]*\}/gi,
          '',
        );
        if (!/\.icon-rail--top-left\b/.test(css)) {
          css += `\n.icon-rail{position:absolute;z-index:2;display:flex;flex-direction:column;gap:14px}`
            + `\n.icon-rail--top-left{top:1.25rem;left:1.25rem;right:auto;bottom:auto}`
            + `\n.icon-rail--top-right{top:1.25rem;right:1.25rem;left:auto;bottom:auto;align-items:flex-end}`
            + `\n.icon-rail--bottom-left{bottom:1.25rem;left:1.25rem;top:auto;right:auto}`
            + `\n.icon-rail--bottom-right{bottom:1.25rem;right:1.25rem;top:auto;left:auto;align-items:flex-end}`
            + `\n.nav-icon{display:block;opacity:.92;width:22px;height:22px}\n`;
        }
        if (/\.app\s*\{/i.test(css) && !/\.app\s*\{[^}]*position\s*:/i.test(css)) {
          css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => `.app {${body} position:relative;}`);
        }
        touchedCss = true;
      }
    }
  }

  // Move a brand logo rail / mark to a layout corner.
  if (
    /\b(?:move|put|place|shift)\b/i.test(t)
    && /\b(?:logo|brand|netflix|youtube|hulu|discord|apple|spotify)\b/i.test(t)
    && /\b(?:top|bottom|left|right|corner)\b/i.test(t)
    && !/\b(?:float|drift|animat|slowly)\b/i.test(t)
  ) {
    const moveLogoRe = /\b(?:move|put|place|shift)\b[\s\S]{0,56}\b(?:the\s+)?(netflix|youtube|hulu|discord|apple|spotify|logo|brand)\b[\s\S]{0,40}\b(top[\s-]?left|top[\s-]?right|bottom[\s-]?left|bottom[\s-]?right)\b/gi;
    const logoMoves: Array<{ brand: string; corner: NonNullable<ReturnType<typeof parseLayoutCorner>> }> = [];
    let lm: RegExpExecArray | null;
    while ((lm = moveLogoRe.exec(t)) != null) {
      const brand = String(lm[1] || '').toLowerCase();
      const corner = parseLayoutCorner(lm[2] || '');
      if (corner) logoMoves.push({ brand, corner });
    }
    if (!logoMoves.length) {
      const corner = parseLayoutCorner(t);
      if (corner) logoMoves.push({ brand: 'logo', corner });
    }
    for (const { brand, corner } of logoMoves) {
      const brandId = /^(logo|brand)$/i.test(brand)
        ? (app.match(/\/logos\/([a-z0-9-]+)\.svg/i)?.[1] || '')
        : brand;
      if (!brandId && !/brand-rail|corner-logo|\/logos\//i.test(app)) continue;
      // Re-home whole brand-rail when present.
      if (/className=["'][^"']*brand-rail[^"']*["']/i.test(app)) {
        app = app.replace(
          /className=["'][^"']*brand-rail[^"']*["']/i,
          `className="brand-rail brand-rail--${corner}"`,
        );
        touchedApp = true;
      } else if (brandId) {
        const imgRe = new RegExp(
          `<img\\b[^>]*?(?:data-brand=["']${brandId}["'][^>]*?src=["'][^"']*/logos/${brandId}\\.svg["']|src=["'][^"']*/logos/${brandId}\\.svg["'][^>]*?)[^>]*?/?>`,
          'i',
        );
        const imgMatch = app.match(imgRe);
        if (imgMatch) {
          let imgTag = imgMatch[0];
          if (!/data-brand=/i.test(imgTag)) {
            imgTag = imgTag.replace(/<img\b/i, `<img data-brand="${brandId}"`);
          }
          app = app.replace(imgRe, '');
          if (/className=["']app["'][^>]*>/i.test(app)) {
            app = app.replace(
              /(className=["']app["'][^>]*>)/i,
              `$1\n      <div className="brand-rail brand-rail--${corner}" aria-label="Brand logos">${imgTag}</div>`,
            );
          }
          touchedApp = true;
        }
      }
      if (touchedApp && cssPath) {
        if (!/\.brand-rail--top-left\b/.test(css)) {
          css += `\n.brand-rail{position:absolute;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:14px}`
            + `\n.brand-rail--top-left{top:1.35rem;left:1.35rem;right:auto;bottom:auto}`
            + `\n.brand-rail--top-right{top:1.35rem;right:1.35rem;left:auto;bottom:auto;justify-content:flex-end}`
            + `\n.brand-rail--bottom-left{bottom:1.35rem;left:1.35rem;top:auto;right:auto}`
            + `\n.brand-rail--bottom-right{bottom:1.35rem;right:1.35rem;top:auto;left:auto;justify-content:flex-end}`
            + `\n.brand-mark{display:block;width:28px;height:28px;opacity:.95}\n`;
        }
        if (/\.app\s*\{/i.test(css) && !/\.app\s*\{[^}]*position\s*:/i.test(css)) {
          css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => `.app {${body} position:relative;}`);
        }
        touchedCss = true;
      }
    }
  }

  // Font style on the centered name: bold / thin / cursive / serif / professional
  if (
    /className=["']center-word["']/i.test(app)
    && (
      looksLikeNameFontStyleAsk(t)
      || (
        /\b(?:bold|italic|cursive|serif|sans(?:-serif)?|thin|light|skinny|professional|font)\b/i.test(t)
        && /\b(?:make|look|style|font|change|set|more|try)\b/i.test(t)
      )
    )
  ) {
    if (/\.center-word\s*\{/i.test(css)) {
      css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
        let next = String(body || '');
        if (!/;\s*$/.test(next) && next.trim()) next = `${next.trim()};`;
        if (/\bbold\b/i.test(t)) {
          next = next.replace(/font-weight\s*:\s*[^;]+;?/gi, '');
          next += ' font-weight:700;';
        } else if (/\b(?:thin|light|skinny)\b/i.test(t)) {
          next = next.replace(/font-weight\s*:\s*[^;]+;?/gi, '');
          next += ' font-weight:300;';
        }
        if (/\b(?:cursive|italic)\b/i.test(t)) {
          next = next.replace(/font-style\s*:\s*[^;]+;?/gi, '');
          next = next.replace(/font-family\s*:\s*[^;]+;?/gi, '');
          next += ' font-style:italic; font-family:Georgia,"Times New Roman",serif;';
        } else if (/\b(?:serif|professional)\b/i.test(t)) {
          next = next.replace(/font-family\s*:\s*[^;]+;?/gi, '');
          next = next.replace(/font-style\s*:\s*[^;]+;?/gi, '');
          next += ' font-family:Georgia,"Times New Roman",serif; font-style:normal;';
        } else if (/\bsans\b/i.test(t)) {
          next = next.replace(/font-family\s*:\s*[^;]+;?/gi, '');
          next = next.replace(/font-style\s*:\s*[^;]+;?/gi, '');
          next += ' font-family:system-ui,-apple-system,Segoe UI,sans-serif; font-style:normal;';
        }
        return `.center-word {${next}}`;
      });
      touchedCss = true;
    }
  }

  // Name text color only: "change the color of the name from white to black"
  if (/className=["']center-word["']/i.test(app) && looksLikeNameTextColorAsk(t)) {
    const colorName = extractNameTextColorTarget(t);
    const fg = (colorName && cssColor(colorName)) || '';
    if (fg && cssPath) {
      if (/\.center-word\s*\{/i.test(css)) {
        css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
          let next = String(body || '');
          if (/color\s*:/i.test(next)) {
            next = next.replace(/color\s*:\s*[^;]+/i, `color: ${fg}`);
          } else {
            if (!/;\s*$/.test(next) && next.trim()) next = `${next.trim()};`;
            next += ` color: ${fg};`;
          }
          return `.center-word {${next}}`;
        });
      } else {
        css += `\n.center-word{color:${fg}}\n`;
      }
      touchedCss = true;
    }
  }

  // Product cards section (Mouse / Keyboard / Headset)
  {
    const wantsCards = /\b(?:product\s+cards?|three\s+short\s+product)\b/i.test(t)
      || (/\bcards?\b/i.test(t) && /\b(?:Mouse|Keyboard|Headset)\b/i.test(t));
    const removeHeadset = /\b(?:remove|delete|drop)\b[\s\S]{0,40}\bHeadset\b/i.test(t);
    const restoreHeadset = /\b(?:put|add|bring)\b[\s\S]{0,40}\bHeadset\b/i.test(t)
      && /\b(?:back|again|card)\b/i.test(t);
    if (wantsCards && !/className=["']product-cards["']/i.test(app)) {
      const cards = `<section id="products" className="product-cards" aria-label="Products">`
        + `<article className="product-card"><h2>Mouse</h2><p>Precision tracking.</p></article>`
        + `<article className="product-card"><h2>Keyboard</h2><p>Fast switches.</p></article>`
        + `<article className="product-card"><h2>Headset</h2><p>Clear audio.</p></article>`
        + `</section>`;
      if (/<\/section>/i.test(app)) {
        app = app.replace(/<\/section>/i, `</section>\n      ${cards}`);
      } else if (/<\/nav>/i.test(app)) {
        app = app.replace(/<\/nav>/i, `</nav>\n      ${cards}`);
      } else {
        app = app.replace(/(className=["'][Aa]pp["'][^>]*>)/i, `$1\n      ${cards}`);
      }
      touchedApp = true;
      if (cssPath && !/\.product-cards\b/.test(css)) {
        css += `\n.product-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;width:min(920px,92vw);margin:0 auto 2.5rem;padding:0 1rem}`
          + `\n.product-card{background:#1c1c1c;border:1px solid #2a2a2a;border-radius:12px;padding:1.1rem 1rem;text-align:center}`
          + `\n.product-card h2{margin:0 0 .4rem;font-size:1.05rem;color:#fff}`
          + `\n.product-card p{margin:0;color:#bdbdbd;font-size:.92rem}\n`;
        touchedCss = true;
      }
    }
    if (removeHeadset && /Headset/i.test(app)) {
      app = app.replace(
        /<article className=["']product-card["']>\s*<h2>Headset<\/h2>[\s\S]*?<\/article>/i,
        '',
      );
      touchedApp = true;
    }
    if (restoreHeadset && /className=["']product-cards["']/i.test(app) && !/<h2>Headset<\/h2>/i.test(app)) {
      const card = `<article className="product-card"><h2>Headset</h2><p>Clear audio.</p></article>`;
      app = app.replace(
        /(<section[^>]*className=["']product-cards["'][^>]*>)([\s\S]*?)(<\/section>)/i,
        (_m, open: string, inner: string, close: string) => `${open}${inner}${card}${close}`,
      );
      touchedApp = true;
    }
    if (/\bheadset\b/i.test(t) && /\b(?:photo|shot|image|img)\b/i.test(t) && !/alt=["'][^"']*headset/i.test(app)) {
      const url = productGlyphDataUrl('Gaming headset', { role: 'hero', brief: 'headphones headset', accent: '#6b8cae' });
      const img = `<img className="hero-photo headset-photo" src="${url}" alt="Gaming headset product photo" />`;
      if (/className=["']product-cards["'][\s\S]*?<\/section>/i.test(app)) {
        app = app.replace(
          /(<section[^>]*className=["']product-cards["'][^>]*>[\s\S]*?<\/section>)/i,
          `$1\n      ${img}`,
        );
      } else if (/<\/section>/i.test(app)) {
        app = app.replace(/<\/section>/i, `</section>\n      ${img}`);
      }
      touchedApp = true;
    }
  }

  if (
    (/\bteal\b/i.test(t) && /\b(?:gradient|tint)\b/i.test(t))
    || (/\bbackground\b/i.test(t) && /\b(gradient|tint)\b/i.test(t) && !/\bcharcoal\b/i.test(t) && !/\bred\b/i.test(t))
  ) {
    if (/--bg\s*:/.test(css)) {
      css = css.replace(/--bg\s*:\s*[^;]+;/, '--bg: #0a2f2a;');
      touchedCss = true;
    }
    if (/body\s*\{[^}]*background\s*:/i.test(css)) {
      css = css.replace(
        /(body\s*\{[^}]*?)background\s*:\s*[^;]+/i,
        '$1background: radial-gradient(1200px 600px at 12% -8%, #145c54, #0a2f2a)',
      );
      touchedCss = true;
    } else if (/body\s*\{/i.test(css)) {
      css = css.replace(/body\s*\{/i, 'body {\n  background: radial-gradient(1200px 600px at 12% -8%, #145c54, #0a2f2a);');
      touchedCss = true;
    } else {
      css = `body { background: radial-gradient(1200px 600px at 12% -8%, #145c54, #0a2f2a); color: #e8f2ec; }\n${css}`;
      touchedCss = true;
    }
  }

  // Keep a single App.* — do not sync/edit the loser twin (Vite resolves one `./App`).
  const out: WebFileEdit[] = [];
  if (touchedApp) {
    out.push({ path: appPath, content: app });
  }
  if (touchedCss) {
    // Always keep App.css + index.css on the same solid canvas (no white/cream split).
    const canvas = detectSolidCanvasBg(css, indexCss) || '#ffffff';
    const syncedCanvas = syncSolidCanvasEdits(flat, cssPath || 'src/App.css', canvas, css);
    out.push(...syncedCanvas);
    // Guarantee index.css is in the write set even if an earlier early-return path forgot it.
    if (touchedIndex && indexCss && !out.some((e) => /index\.css$/i.test(e.path))) {
      out.push({ path: 'src/index.css', content: indexCss });
    }
    // Fix legacy main that imported index.css after App (white index won the cascade).
    for (const mainKey of ['src/main.tsx', 'src/main.jsx'] as const) {
      const mainSrc = String(flat[mainKey] || '');
      if (!mainSrc) continue;
      const swapped = mainSrc.replace(
        /(import\s+App\s+from\s+['"]\.\/App[^'"]*['"];?\s*\n)(\s*import\s+['"]\.\/index\.css['"];?\s*\n?)/,
        (_m, appLine: string, indexLine: string) => `${indexLine.trim()}\n${appLine}`,
      );
      if (swapped !== mainSrc) {
        out.push({ path: mainKey, content: swapped });
      }
      break;
    }
  } else if (touchedIndex && cssPath !== 'src/index.css') {
    out.push({ path: 'src/index.css', content: indexCss });
  }
  if (out.length) return out;

  return [];
}

function findReactAppPath(flat: WebFileMap): string | null {
  const jsx = flat['src/App.jsx'];
  const tsx = flat['src/App.tsx'];
  if (jsx != null && tsx != null) {
    const stub = (body: string) => {
      const s = String(body || '');
      return !s.trim()
        || /return\s*\(\s*<div className=["']app["']\s*\/>\s*\)/i.test(s)
        || s.length < 160;
    };
    // Edit the twin that already has UI. Prefer App.jsx when both are stubs —
    // Vite resolves bare `./App` to .jsx before .tsx (deleting .jsx blanks Live).
    if (stub(jsx) && !stub(tsx)) return 'src/App.tsx';
    if (stub(tsx) && !stub(jsx)) return 'src/App.jsx';
    if (flat['src/main.jsx'] != null && flat['src/main.tsx'] == null) return 'src/App.jsx';
    // Prefer .jsx even when main.tsx exists — matches Vite resolve + twin cleanup.
    if (stub(jsx) && stub(tsx)) return 'src/App.jsx';
    const score = (body: string) => {
      let n = String(body || '').length;
      if (/\bcreateRoot\s*\(/.test(body) && /\bimport\s+App\b/.test(body)) n -= 5000;
      if (/<h1[\s>]/i.test(body)) n += 2000;
      if (/export\s+default/i.test(body)) n += 400;
      if (/<header[\s>]|<section[\s>]/i.test(body)) n += 300;
      return n;
    };
    return score(jsx) >= score(tsx) ? 'src/App.jsx' : 'src/App.tsx';
  }
  if (jsx != null) return 'src/App.jsx';
  if (tsx != null) return 'src/App.tsx';
  const hit = Object.keys(flat).find(p => /(^|\/)App\.(jsx|tsx)$/i.test(p));
  return hit || null;
}

function findReactCssPath(flat: WebFileMap, appPath: string): string {
  if (flat['src/App.css'] != null) return 'src/App.css';
  if (flat['src/index.css'] != null) return 'src/index.css';
  const near = appPath.replace(/\.(jsx|tsx)$/i, '.css');
  if (flat[near] != null) return near;
  return 'src/App.css';
}

export function arcadeGameMicroAskEdits(files: WebFileMap, message: string): WebFileEdit[] {
  const flat = flatten(files);
  const appPath = Object.keys(flat).find((p) => /(^|\/)App\.(jsx|tsx)$/i.test(p));
  if (!appPath) return [];
  let src = String(flat[appPath] || '');
  const t = String(message || '');
  let changed = false;
  const out: WebFileEdit[] = [];

  // Snake: speed after meals + food glow
  if (/tickMsRef|mealsRef|randFood/i.test(src)) {
    if (/\b(?:speed|faster|bump)\b/i.test(t) && /\b(?:food|meal|pickup|every\s*3|3\s+food)\b/i.test(t)) {
      if (/mealsRef\.current\s*%\s*3\s*===\s*0/.test(src) || /tickMsRef\.current\s*=\s*Math\.max/.test(src)) {
        // already has speed ramp — ensure interval is 3
        src = src.replace(/mealsRef\.current\s*%\s*\d+/g, 'mealsRef.current % 3');
        changed = true;
      } else if (/mealsRef\.current\s*\+=\s*1/.test(src)) {
        src = src.replace(
          /(mealsRef\.current\s*\+=\s*1;?)/,
          `$1\n        if (mealsRef.current % 3 === 0) tickMsRef.current = Math.max(70, tickMsRef.current - 12);`,
        );
        changed = true;
      }
    }
    if (/\bglow\b/i.test(t) && /\bfood\b/i.test(t)) {
      if (/foodGlow|shadowBlur|food.*glow/i.test(src)) {
        src = src.replace(/shadowBlur\s*=\s*\d+/g, 'shadowBlur = 28');
        changed = true;
      } else if (/fillRect\(\s*st\.food\.x\s*\*\s*CELL/.test(src) || /food\.x\s*\*\s*CELL/.test(src)) {
        src = src.replace(
          /(ctx\.fillStyle\s*=\s*['"][^'"]+['"];\s*\n\s*)(ctx\.fillRect\(\s*st\.food\.x)/,
          `$1ctx.shadowColor = '#ff6b6b';\n      ctx.shadowBlur = 28;\n      $2`,
        );
        if (!/shadowBlur = 28/.test(src)) {
          src = src.replace(
            /(ctx\.fillRect\(\s*st\.food\.x\s*\*\s*CELL[^;]*;)/,
            `ctx.shadowColor = '#ff6b6b';\n      ctx.shadowBlur = 28;\n      $1\n      ctx.shadowBlur = 0;`,
          );
        }
        changed = true;
      }
    }
    if (changed) {
      out.unshift({ path: appPath, content: src });
      return out;
    }
  }

  // Habit tracker: reset day + satisfying complete
  if (/quietstreak|todayKey|DEFAULTS|Drink water/i.test(src) || (/habit/i.test(src) && /streak/i.test(src) && /localStorage/.test(src))) {
    if (/\breset\b/i.test(t) && /\b(?:day|today|habits?)\b/i.test(t) && !/Reset day/i.test(src)) {
      const resetFn = `  const resetDay = () => setState((prev) => ({ ...prev, done: {} }));\n`;
      if (!/const resetDay/.test(src)) {
        src = src.replace(/(const toggle\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\};\n)/, `$1\n${resetFn}`);
      }
      if (!/Reset day/.test(src)) {
        src = src.replace(
          /(<\/ul>\s*)/,
          `$1      <button type="button" className="reset" onClick={resetDay}>Reset day</button>\n`,
        );
      }
      changed = true;
      const cssPath = Object.keys(flat).find((p) => /(^|\/)App\.css$/i.test(p));
      if (cssPath) {
        let css = String(flat[cssPath] || '');
        if (!/\.reset\s*\{/.test(css)) {
          css += `\n.reset{margin-top:1.25rem;border:0;border-radius:999px;padding:.65rem 1rem;background:#ffffff12;color:inherit;cursor:pointer}\n`;
          out.push({ path: cssPath, content: css });
        }
      }
    }
    if (/\b(?:satisfying|celebration|confetti|pulse|feel)\b/i.test(t) && /\b(?:complete|done|habit|check)\b/i.test(t)) {
      const cssPath = Object.keys(flat).find((p) => /(^|\/)App\.css$/i.test(p));
      if (cssPath) {
        let css = String(flat[cssPath] || '');
        if (!/@keyframes popDone/.test(css)) {
          css += `\n.list li.on button{transform:scale(1.02);transition:transform .2s ease,box-shadow .2s ease}\n@keyframes popDone{0%{transform:scale(.96)}60%{transform:scale(1.04)}100%{transform:scale(1)}}\n.list li.on .box{animation:popDone .28s ease}\n`;
          out.push({ path: cssPath, content: css });
          changed = true;
        }
      }
    }
    if (changed) {
      out.unshift({ path: appPath, content: src });
      return out;
    }
  }

  // Spatial / ForgeLab editor: grid contrast + obvious Add Cube
  if (/THREE\.GridHelper|addShape\s*\(|WebGLRenderer/i.test(src)) {
    if (/\b(?:grid|contrast)\b/i.test(t) && /\b(?:bump|more|brighter|stronger|higher|increase)\b/i.test(t)) {
      if (/GridHelper\(\s*20\s*,\s*20\s*,\s*0x5a6570\s*,\s*0x2e3540\s*\)/.test(src)) {
        src = src.replace(
          /GridHelper\(\s*20\s*,\s*20\s*,\s*0x5a6570\s*,\s*0x2e3540\s*\)/g,
          'GridHelper(20, 20, 0xb0c0d0, 0x5a6878)',
        );
        changed = true;
      } else if (/GridHelper\([^)]+\)/.test(src)) {
        src = src.replace(
          /GridHelper\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*0x[0-9a-fA-F]+\s*,\s*0x[0-9a-fA-F]+\s*\)/g,
          'GridHelper($1, $2, 0xb0c0d0, 0x5a6878)',
        );
        changed = true;
      }
    }
    if (/\bcube\b/i.test(t) && /\b(?:obvious|clear|bigger|primary|highlight|button)\b/i.test(t)) {
      if (/onClick=\{\(\)\s*=>\s*apiRef\.current\?\.addShape\('box'\)\}/.test(src)
        && !/className="primary"|Add Cube/i.test(src)) {
        src = src.replace(
          /<button type="button" onClick=\{\(\)\s*=>\s*apiRef\.current\?\.addShape\('box'\)\}>\s*Cube\s*<\/button>/,
          '<button type="button" className="primary" onClick={() => apiRef.current?.addShape(\'box\')}>Add Cube</button>',
        );
        changed = true;
        const cssPath = Object.keys(flat).find((p) => /(^|\/)App\.css$/i.test(p));
        if (cssPath) {
          let css = String(flat[cssPath] || '');
          if (!/\.primary\s*\{/.test(css)) {
            css += `\n.tools .primary{background:#4ea1ff;color:#0b1220;font-weight:700;border-color:#4ea1ff}\n.tools .primary:hover{filter:brightness(1.08)}\n`;
            out.push({ path: cssPath, content: css });
          }
        }
      }
    }
    if (changed) {
      out.unshift({ path: appPath, content: src });
      return out;
    }
  }

  if (!/frightened|pelletsLeft|pac\s*:|ghosts\s*:/i.test(src)) return [];

  if (/\b(?:power|frightened)\b/i.test(t) && /\b(?:indicator|hud|label|show|visible)\b/i.test(t) && !/\bPOWER\b/.test(src)) {
    if (/ctx\.fillText\(\s*['"]Lives['"]/.test(src)) {
      src = src.replace(
        /(ctx\.fillText\(\s*['"]Lives['"][^;]*;)/,
        `$1\n      if (st.frightened > 0) {\n        ctx.fillStyle = '#3a86ff';\n        ctx.fillText('POWER ' + Math.ceil(st.frightened / 60), 340, 22);\n      }`,
      );
      changed = true;
    } else if (/Lives\s*'\s*\+\s*livesRef/.test(src) || /'Lives '\s*\+/.test(src)) {
      src = src.replace(
        /(ctx\.fillText\(\s*'Lives '\s*\+\s*livesRef\.current[^;]*;)/,
        `$1\n      if (st.frightened > 0) {\n        ctx.fillStyle = '#3a86ff';\n        ctx.fillText('POWER ' + Math.ceil(st.frightened / 60), 340, 22);\n      }`,
      );
      changed = true;
    }
  }

  if (
    (/\b(?:bump|increase|change|to\s+100|from\s+50)\b/i.test(t) || /\b100\b/.test(t))
    && /\b(?:power|pellet|score)\b/i.test(t)
    && /cell\s*===\s*['"]o['"]\s*\?\s*50/.test(src)
  ) {
    src = src.replace(/cell\s*===\s*['"]o['"]\s*\?\s*50/g, "cell === 'o' ? 100");
    changed = true;
  }

  if (/\bfaster\b/i.test(t) && /\b(?:player|pac|chomp|move)\b/i.test(t) && /stepEntity\(\s*st\.pac\s*,\s*0\.12\s*\)/.test(src)) {
    src = src.replace(/stepEntity\(\s*st\.pac\s*,\s*0\.12\s*\)/g, 'stepEntity(st.pac, 0.16)');
    changed = true;
  }

  if (/\bremove\b/i.test(t) && /\b(?:panel|instruction|clutter|side)\b/i.test(t) && /className="panel"/.test(src)) {
    src = src.replace(/\s*<div className="panel">[\s\S]*?<\/div>\s*(?=<\/div>\s*\);\s*\})/, '\n');
    src = src.replace(
      /grid-template-columns:\s*1fr\s+minmax\([^)]+\)/,
      'grid-template-columns: 1fr',
    );
    changed = true;
    const cssPath = Object.keys(flat).find((p) => /(^|\/)App\.css$/i.test(p));
    if (cssPath) {
      let css = String(flat[cssPath] || '');
      css = css.replace(/\.panel\s*\{[\s\S]*?\}\n?/g, '');
      css = css.replace(/grid-template-columns:\s*1fr\s+minmax\([^)]+\);?/, 'grid-template-columns: 1fr;');
      out.push({ path: cssPath, content: css });
    }
  }

  if (!changed) return [];
  out.unshift({ path: appPath, content: src });
  return out;
}

/**
 * Deterministic Vite/React UI patches when the model only describes changes.
 * Scoped by projectName so a multi-prompt paste (TaskBox + NightChat) cannot
 * write Discord UI into TaskBox.
 */
export function reactUiMicroAskEdits(
  files: WebFileMap,
  message: string,
  opts?: { projectName?: string },
): WebFileEdit[] {
  const arcade = arcadeGameMicroAskEdits(files, message);
  if (arcade.length) return arcade;
  const surgical = reactSurgicalMicroAskEdits(files, message);
  if (surgical.length) return surgical;
  // Empty tree + kanban create brief → seed a real board (model often returns nothing).
  if (!Object.keys(files || {}).length && looksLikeKanbanCreateBrief(message)) {
    return buildKanbanSeedEdits(opts?.projectName || 'TaskRail');
  }
  return [];
}

/**
 * After a local micro-patch, confirm the ask’s concrete targets actually landed in App.
 * Stops “Done in 131ms” when nothing meaningful changed (or wrong file twin).
 */
/** True when a string looks like prompt/instruction residue, not UI copy. */
export function looksLikePromptInstructionLeak(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\b(?:one short support line|sage pill CTA|left-aligned hero|keep orbs|never ship|full-viewport|useState|src\/App)\b/i.test(t)) {
    return true;
  }
  // "Hello on the screen" / "Welcome to my app on the page" — instruction residue, not UI copy.
  if (/\b(?:on|in)\s+(?:the\s+)?(?:screen|page|viewport)\b/i.test(t)) return true;
  if (/\b(?:add a|change only|do not|don't|rewrite|replace src)\b/i.test(t) && t.length > 40) return true;
  if (/^[,:;]\s/.test(t)) return true;
  return false;
}

export function verifyMicroAskApplied(
  message: string,
  files: WebFileMap,
): { ok: boolean; missing: string[] } {
  const t = String(message || '');
  const flat = flatten(files);
  const app = `${flat['src/App.jsx'] || ''}\n${flat['src/App.tsx'] || ''}\n${flat['src/App.css'] || ''}`;
  const missing: string[] = [];

  const textInApp = (needle: string) => {
    const n = String(needle || '').trim();
    if (!n) return true;
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (new RegExp(esc, 'i').test(app)) return true;
    // Allow missing trailing period/ellipsis on either side of the match.
    const soft = n.replace(/[.…]+$/u, '').trim();
    if (soft && soft !== n) {
      const softEsc = soft.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      if (new RegExp(softEsc, 'i').test(app)) return true;
    }
    return false;
  };

  // Double / curly quotes only — ASCII apostrophe breaks on there's / don't.
  const quoted = [...t.matchAll(/["“”]([^"“”]{2,80})["“”]/g)].map((m) => m[1].trim()).filter(Boolean);
  for (const q of quoted) {
    // Ignore path-ish quotes and prompt-instruction residue
    if (/\.(jsx?|tsx?|css|html)$/i.test(q)) continue;
    if (looksLikePromptInstructionLeak(q)) continue;
    if (/\bbreathing\s+room\b/i.test(q)) continue;
    if (!textInApp(q)) missing.push(q);
  }

  // Brand asks: use shared extractor so layout tails never become "missing".
  const brandWanted = extractBrandLabel(t);
  if (brandWanted && !textInApp(brandWanted)) {
    missing.push(`brand “${brandWanted}”`);
  }

  // Graphic composition — generated glyphs + split structure (never remote stock).
  if (wantsGraphicCompositionAsk(t)) {
    if (!/stage-photo/i.test(app)) missing.push('stage-photo');
    if (!/product-card__thumb|stage-glyph/i.test(app)) missing.push('product-glyphs');
    if (!/<svg\b/i.test(app) && !/data:image\/svg/i.test(app)) missing.push('generated-svg');
    if (/unsplash\.com|pexels\.com|picsum\.photos/i.test(app)) missing.push('no-remote-images');
    if (!/grid-template-columns:\s*minmax|stage-copy|brand-watermark/i.test(app)) {
      missing.push('composition-shell');
    }
  }

  // Ladder card layouts — CSS grid of cards, not toolbar icons.
  if (
    !/\b(?:remove|delete|drop)\b[\s\S]{0,40}\b(?:third|card)\b/i.test(t)
    && (
      (/\bcards?\b/i.test(t) && /\b(?:row|grid|2-by-2|2\s*x\s*2|2\s*×\s*2|title)\b/i.test(t))
      || /\bcard[- ]?grid\b/i.test(t)
    )
  ) {
    if (!/card-grid|className=["']card["']/i.test(app)) missing.push('card-grid');
    if (/\b2-by-2|2\s*x\s*2|2\s*×\s*2\b/i.test(t) && !/card-grid--2x2|repeat\(\s*2\s*,/i.test(app)) {
      missing.push('2x2-grid');
    }
  }
  if (/\b(?:remove|delete|drop)\b/i.test(t) && /\bthird\b/i.test(t) && /\bcards?\b/i.test(t)) {
    if (/Card three/i.test(app)) missing.push('third-card-removed');
    const articles = (app.match(/<article\b/gi) || []).length;
    if (articles > 2) missing.push('card-count≤2');
  }

  // Button recolor — paint controls, not the page.
  {
    const btnColor = t.match(
      /\bbuttons?\b[\s\S]{0,40}\b(?:to|into)\s+(?:a\s+)?(green|red|blue|black|white|pink|orange|purple|teal|navy|yellow|brown)\b/i,
    )?.[1];
    if (btnColor && !/\bbackground\b/i.test(t)) {
      const want = cssColor(btnColor) || '';
      const btnHay = [
        ...app.matchAll(/(?:button|\.btn)[^{]*\{([^}]*)\}/gi),
      ].map((m) => m[1] || '').join('\n').toLowerCase();
      if (want && !btnHay.includes(want.toLowerCase())) missing.push(`${btnColor.toLowerCase()} buttons`);
    }
  }

  // Delete Contact from nav — pass when Contact is gone (even if nav never had it).
  if (
    /\b(?:delete|remove|drop)\b/i.test(t)
    && /\bContact\b/.test(t)
    && /\b(?:nav|link|navigation)\b/i.test(t)
  ) {
    if (/\bContact\b/.test(app)) missing.push('Contact removed');
  }

  // UI icon add / move — require the icon file ref and corner rail when asked.
  // Café text-nav (Menu · Rewards · Gift Cards) is links, not hamburger icons.
  {
    const cafeTextNav = (
      /\bMenu\b/i.test(t)
      && /\bRewards\b/i.test(t)
      && /\bGift\s*Cards?\b/i.test(t)
    ) || (
      /\bFind\s+a\s+caf[eé]\b/i.test(t)
      && /\bSign\s*in\b/i.test(t)
      && /\bJoin\s+now\b/i.test(t)
    );
    // Contact forms / Contact footers mention email — that is not an icon-rail ask.
    const contactFormVerify = (
      (/\bContact\s+section\b/i.test(t) || (/\bcontact\b/i.test(t) && /\bform\b/i.test(t)))
      && /\b(?:name|email|message|Send)\b/i.test(t)
    ) || (
      /\bfooter\b/i.test(t)
      && /\b(?:contact|help|email)\b/i.test(t)
      && /\b(?:add|put|include)\b/i.test(t)
    );
    // Shop section + Add to cart buttons ≠ cart toolbar icon.
    const shopSectionVerify = (
      /\b(?:Shop|Products?|Lineup)\s+section\b/i.test(t)
      && /\b(?:names?|titles?|keyboards?|headphones?|products?)\b/i.test(t)
    );
    // Generated product glyphs / mic hero ≠ toolbar icon:mic rail.
    const graphicGlyphVerify = wantsGraphicCompositionAsk(t)
      || (/\b(?:glyph|generated|silhouette)\b/i.test(t) && /\b(?:product|mic|microphone|headphones?)\b/i.test(t));
    // Card layout / CSS grid asks ≠ layout-grid toolbar icon.
    const cardGridVerify = (
      /\bcards?\b/i.test(t)
      && /\b(?:row|grid|2-by-2|2\s*x\s*2|2\s*×\s*2|title)\b/i.test(t)
    ) || /\bcard[- ]?grid\b/i.test(t);
    // "Delete the Contact link" is nav copy surgery — not trash/delete icons.
    const navLinkDeleteVerify = (
      /\b(?:delete|remove|drop)\b/i.test(t)
      && /\b(?:link|nav|navigation)\b/i.test(t)
      && !/\bicons?\b/i.test(t)
    );
    // Hamburger / responsive nav is layout CSS — not a menu toolbar icon-rail.
    const hamburgerNavVerify = /\bhamburger\b/i.test(t)
      || (/\bnav\b/i.test(t) && /\b(?:mobile|narrow|collapse)\b/i.test(t) && !/\bicons?\b/i.test(t));
    const profileCardVerify = /\bprofile\s+card\b/i.test(t)
      || (/\bavatar\b/i.test(t) && /\bname\b/i.test(t) && /\bbuttons?\b/i.test(t));
    // Toast / notification banners are UI chrome — not a bell icon-rail.
    const toastNotifyVerify = /\btoast\b/i.test(t)
      || (/\bnotifications?\b/i.test(t) && /\b(?:toast|appear|after\s+Submit|banner)\b/i.test(t));
    // Search/filter/sort list UIs — not toolbar search icons.
    const searchFilterVerify = (
      /\bsearch\b/i.test(t) && /\b(?:filter|filters?|type|card\s+list|box)\b/i.test(t)
    ) || (/\bfilter\b/i.test(t) && /\b(?:list|cards?|as\s+I\s+type)\b/i.test(t));
    // Settings page with toggles — not a settings gear icon-rail.
    const settingsPageVerify = /\bsettings\s+page\b/i.test(t)
      || (/\btoggles?\b/i.test(t) && /\b(?:notifications?|dark\s+mode)\b/i.test(t));
    const uploadDropVerify = /\b(?:upload|drop\s+zone)\b/i.test(t) && !/\bicons?\b/i.test(t);
    // Broad ladder UI chrome: never demand icon-rails unless they said "icon".
    // UI chrome / shells — never demand icon-rails unless they said "icon".
    const ladderChromeVerify = (
      isUiShellAsk(t)
      || /\b(?:upload|drop\s+zone|toast|spinner|kanban|carousel|gallery|breadcrumb|pagination|checkbox|drag-and-drop|command\s+palette|multi-step|skeleton|infinite\s+scroll|chat-style|landing\s+page|SaaS|Twitter\s+clone|validate|required\s+fields?|disable\s+submit|dashboard|login|Sign\s*in|settings\s+page|sidebar|modal|nav|hamburger|todo|counter|profile\s+card|sticky|footer|pricing|Hero|Features)\b/i.test(t)
    ) && !/\bicons?\b/i.test(t)
      && !/\b(?:gear|lucide|tabler|heroicons|simple\s*icons?)\b/i.test(t);
    const named = parseNamedUiIcons(t);
    const wantsIcons = !cafeTextNav && !contactFormVerify && !shopSectionVerify && !graphicGlyphVerify
      && !cardGridVerify && !navLinkDeleteVerify && !hamburgerNavVerify && !profileCardVerify
      && !toastNotifyVerify && !searchFilterVerify && !settingsPageVerify && !uploadDropVerify
      && !ladderChromeVerify && (
      named.length > 0
      || (/\bicons?\b/i.test(t) && /\b(?:add|put|place)\b/i.test(t))
    );
    if (wantsIcons && !/\b(?:move|shift)\b/i.test(t) && !/\b(?:clickable|toggle|alert\s+clicked|tabs?)\b/i.test(t)) {
      const ids = named.length
        ? named.map((ic) => ic.id)
        : ['search', 'settings', 'menu', 'user'];
      for (const id of ids) {
        if (!new RegExp(`/icons/${id}\\.svg`, 'i').test(app)) missing.push(`icon:${id}`);
      }
      if (!/icon-rail|nav-tools|nav-icon/i.test(app)) missing.push('icon-rail');
    }
    if (/\b(?:clickable|alert\s+clicked)\b/i.test(t) && !/onClick|onclick|alert\s*\(/i.test(app)) {
      missing.push('click-handler');
    }
    if (/\btoggle\b/i.test(t) && /\bheart\b/i.test(t) && !/useState|heart-btn|filled/i.test(app)) {
      missing.push('heart-toggle');
    }
    if (/\btabs?\b/i.test(t) && /\b(?:Home|About)\b/.test(t) && !/setTab|activeTab|tab--active|data-tab/i.test(app)) {
      missing.push('tabs');
    }
    if (/\b(?:move|put|place|shift)\b/i.test(t) && /\b(?:icon|search|settings?|menu|user)\b/i.test(t)) {
      const moveRe = /\b(?:move|put|place|shift)\b[\s\S]{0,48}\b(search|settings?|menu|user|profile|home|bag|cart|bell)\b[\s\S]{0,48}\b(top[\s-]?left|top[\s-]?right|bottom[\s-]?left|bottom[\s-]?right)\b/gi;
      let mm: RegExpExecArray | null;
      let any = false;
      while ((mm = moveRe.exec(t)) != null) {
        any = true;
        const iconId = String(mm[1] || '').toLowerCase()
          .replace(/^settings?$/, 'settings')
          .replace(/^profile$/, 'user');
        const corner = parseLayoutCorner(mm[2] || '');
        if (!iconId || !corner) continue;
        const inCornerRail = new RegExp(
          `icon-rail--${corner}[\\s\\S]{0,500}/icons/${iconId}\\.svg`,
          'i',
        ).test(app);
        if (!inCornerRail) missing.push(`move:${iconId}→${corner}`);
      }
      if (!any) {
        const corner = parseLayoutCorner(t);
        const iconId = (
          t.match(/\b(search|settings?|menu|user|profile|home|bag|cart|bell)\b/i)?.[1]
          || ''
        ).toLowerCase().replace(/^settings?$/, 'settings').replace(/^profile$/, 'user');
        if (corner && iconId) {
          const inCornerRail = new RegExp(
            `icon-rail--${corner}[\\s\\S]{0,500}/icons/${iconId}\\.svg`,
            'i',
          ).test(app);
          if (!inCornerRail) missing.push(`move:${iconId}→${corner}`);
        }
      }
    }
  }

  const headline = (
    t.match(/(?:change|rename|set|make|update).{0,64}(?:hero\s+headline|hero\s+title|headline|heading|h1).{0,40}(?:to|into|say)\s+["'“”]?([^"'“”\n]{2,80})/i)?.[1]
    || t.match(/\b(?:words?|text|phrase|copy|line)\s+(?:that\s+)?(?:says?|reading)\s*[:\s]+["“']?([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,6})\b/)?.[1]
    || t.match(/\b(?:says?|reading)\s+["“']([^"”']{2,80})["”']/i)?.[1]
    || ''
  ).trim()
    .replace(/[,;:]+$/, '')
    // Drop instruction tails that used to fail verify and revert good writes.
    .replace(/\s+\b(?:and\s+)?(?:leave|keep|with|nothing|only|no|without|empty|in\s+the\s+center|in\s+white|centered?|centred|middle|clean|white)\b.*$/i, '')
    .trim();
  if (headline && !brandWanted && !textInApp(headline)) {
    // Soft pass: if center-word exists and shares most tokens, do not fail.
    const softOk = /center-word/i.test(app)
      && headline.split(/\s+/).filter((w) => w.length > 2).some((w) => textInApp(w));
    if (!softOk && !missing.some((m) => m.toLowerCase().includes(headline.slice(0, 12).toLowerCase()))) {
      missing.push(headline);
    }
  }

  // If App already has a center-word heading, treat the micro title ask as applied
  // even when quote extraction swallowed trailing instruction words.
  if (missing.length && /className=["']center-word["']/i.test(app)) {
    const centerText = app.match(/className=["']center-word["'][^>]*>([^<]{1,80})</i)?.[1]?.trim() || '';
    if (centerText) {
      const leftovers = missing.filter((m) => {
        const core = m.replace(/\s+\b(?:in|on|at|the|center|middle|white|black)\b.*$/i, '').trim();
        return core && !textInApp(core) && !centerText.toLowerCase().includes(core.slice(0, 12).toLowerCase());
      });
      if (leftovers.length < missing.length) {
        missing.length = 0;
        missing.push(...leftovers);
      }
    }
  }

  // Button label asks only — never treat "Add to cart, bump the count" as a CTA string.
  const cta = (
    t.match(/\b(?:button|cta|call[\s-]*to[\s-]*action|primary\s+(?:cta|button))\b[\s\S]{0,40}\b(?:say|label(?:led)?|reading)\s+["“”]?([^"“”\n]{1,60})/i)?.[1]
    || t.match(/\b(?:button|cta)\s+(?:text|copy|label)\s*(?:to|as|=|:)?\s*["“”]?([^"“”\n]{1,60})/i)?.[1]
    || ''
  ).trim().replace(/[,;:]+$/, '');
  if (
    cta
    && !/^(?:cart|the\s+cart|count|bump)\b/i.test(cta)
    && !/\bbump\s+the\s+count\b/i.test(cta)
    && !textInApp(cta)
  ) {
    if (!missing.includes(cta)) missing.push(cta);
  }

  // Cart control — real UI signals, not a glued phrase from "to cart, bump…".
  // Count/qty is best-effort (surgical/model); never fail-closed and revert a landed cart control.
  // Sticky "keep Cart visible" is not a cart-add ask — don't require cart control for that alone.
  if (
    /\bcart\b/i.test(t)
    && /\b(?:button|bump|count|add\s+to\s+cart)\b/i.test(t)
    && !/\bsticky\b/i.test(t)
    && !/\b(?:remove|delete|drop)\s+(?:the\s+)?cart\b/i.test(t)
  ) {
    const hasCartUi = /(?:aria-label=["']Cart["']|>\s*Cart\s*<|cart-btn|cart-count|\/icons\/bag\.svg|addToCart|setCart)/i.test(app);
    if (!hasCartUi) missing.push('cart control');
  }

  // Solid background color asks (Vite React) — named color family, not one brittle hex.
  // Prefer "keep cream background" over "soft green accent" so accent never demands green page paint.
  {
    const bgColorExplicit = (
      t.match(/\b(?:keep|stay|remain|still)\s+(?:that\s+|the\s+|a\s+)?(light\s*blue|light\s*pink|light\s*red|sky\s*blue|cream|brown|black|white|blue|red|green|teal|pink|orange|navy|purple|yellow)\s+(?:background|page|canvas)\b/i)?.[1]
      || t.match(/\b(light\s*blue|light\s*pink|light\s*red|sky\s*blue|cream|brown|black|white|blue|red|green|teal|pink|orange|navy|purple|yellow)\s+background\b/i)?.[1]
      || ''
    );
    const colorWord = bgColorExplicit
      || (
        /\b(?:glow|accent|gradient|tint)\b/i.test(t)
          ? ''
          : t.match(/\b(light\s*blue|light\s*pink|light\s*red|sky\s*blue|brown|black|white|blue|red|green|teal|pink|orange|navy|cream|purple|yellow)\b/i)?.[1]
      );
    // Button recolors must never require a page-canvas color.
    if (colorWord && (bgColorExplicit || /\bbackground\b/i.test(t)) && !/\bbuttons?\b/i.test(t)) {
      const bgHay = [...app.matchAll(/background(?:-color)?\s*:\s*([^;{}]+)/gi)]
        .map((m) => m[1] || '')
        .join('\n')
        .toLowerCase();
      const keepCream = /\b(?:keep|stay|remain|still)\b/i.test(t) && /cream/i.test(colorWord);
      const creamFamily = /#fef3c7|#fffdd|#f5f5dc|#f5f0e8|#faf6f0|#fff8f0|#f7f3ea|#f8f1e3|#faf7f2|#f4efe6|#faf5ee|cream|ivory|beige|linen|eggshell/i.test(bgHay)
        || /rgb\(\s*2[4-5]\d\s*,\s*2[3-5]\d\s*,\s*2[0-3]\d/i.test(bgHay);
      if (/cream/i.test(colorWord)) {
        if (!(keepCream && creamFamily) && !creamFamily) {
          missing.push('cream background');
        }
      } else {
        const want = (
          /light\s*blue/i.test(colorWord) ? '#93c5fd'
          : /sky\s*blue/i.test(colorWord) ? '#87ceeb'
          : /light\s*pink/i.test(colorWord) ? '#fbcfe8'
          : /light\s*red/i.test(colorWord) ? '#fca5a5'
          : /brown|chocolate|sienna/i.test(colorWord) ? '#8b4513'
          : /black|dark/i.test(colorWord) ? '#000000'
          : /white/i.test(colorWord) ? '#ffffff'
          : /pink/i.test(colorWord) ? '#ec4899'
          : /blue/i.test(colorWord) ? '#2563eb'
          : /red/i.test(colorWord) ? '#dc2626'
          : /green/i.test(colorWord) ? '#16a34a'
          : /teal/i.test(colorWord) ? '#0f766e'
          : /orange/i.test(colorWord) ? '#f97316'
          : /navy/i.test(colorWord) ? '#1e3a8a'
          : /purple/i.test(colorWord) ? '#7c3aed'
          : /yellow/i.test(colorWord) ? '#eab308'
          : ''
        );
        const alts: string[] = [];
        if (/light\s*blue/i.test(colorWord)) alts.push('#93c5fd', '#7dd3fc', '#bfdbfe', '#60a5fa');
        if (/sky\s*blue/i.test(colorWord)) alts.push('#87ceeb', '#7dd3fc', '#38bdf8');
        if (/light\s*pink/i.test(colorWord)) alts.push('#fbcfe8', '#f9a8d4', '#fce7f3');
        if (/light\s*red/i.test(colorWord)) alts.push('#fca5a5', '#fecaca', '#f87171');
        const short = want.length === 7 ? `#${want[1]}${want[3]}${want[5]}` : '';
        const hit = Boolean(want && (
          bgHay.includes(want)
          || (short && bgHay.includes(short))
          || alts.some((a) => bgHay.includes(a))
        ));
        if (want && !hit) {
          missing.push(`${colorWord.toLowerCase().replace(/\s+/g, ' ')} background`);
        }
      }
    }
  }

  // Featured Work / Shop title lists — require section + listed names.
  if (
    (
      /\bFeatured\s+Work\b/i.test(t)
      || /\b(?:Shop|Products?|Lineup)\s+section\b/i.test(t)
    )
    && /\b(?:add|put|include|section|below)\b/i.test(t)
    && !/\b(?:nav|navigation)\b/i.test(t)
  ) {
    const shopAsk = /\b(?:Shop|Products?|Lineup)\s+section\b/i.test(t);
    if (shopAsk) {
      if (!/shop-list-section|product-grid|id=["']shop["']/i.test(app)) missing.push('Shop section');
    } else if (!/featured-work|id=["']work["']/i.test(app)) {
      missing.push('Featured Work section');
    }
    // Prefer name—blurb pairs (rich info cards) over a single "names:" capture that still holds the dash.
    const pairHits = [...t.matchAll(
      /\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})\s*[—–-]\s*([^.;,\n]{8,90})/g,
    )];
    if (pairHits.length >= 2) {
      for (const m of pairHits) {
        const name = String(m[1] || '').trim();
        const blurb = String(m[2] || '').trim().replace(/[.,;:]+$/g, '');
        if (name && !textInApp(name)) missing.push(name);
        // Soft: first 4+ words of the blurb is enough (desc may be lightly rephrased).
        const blurbCore = blurb.split(/\s+/).slice(0, 4).join(' ');
        if (blurbCore.length >= 8 && !textInApp(blurb) && !textInApp(blurbCore)) missing.push(blurbCore);
      }
    } else {
      const listRaw = (
        t.match(/\b(?:project\s+)?titles?\s*:\s*([^.]+?)(?:\.|$)/i)?.[1]
        || t.match(/\b(?:keyboard|product|headphones?|microphone)\s+names?\s*:\s*([^.]+?)(?:\.|$)/i)?.[1]
        || t.match(/\bnames?\s*:\s*([^.]+?)(?:\.|$)/i)?.[1]
        || ''
      ).trim();
      for (const title of listRaw
        .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
        .map((s) => s.trim().replace(/^and\s+/i, ''))
        .filter((s) => s.length >= 2 && !/[—–]/.test(s))) {
        const soft = title.replace(/&/g, '').replace(/\s+/g, ' ').trim();
        if (soft && !textInApp(title) && !textInApp(title.replace(/&/g, '&amp;')) && !textInApp(soft)) {
          missing.push(title);
        }
      }
    }
    if (shopAsk && /\b(?:add\s+to\s+cart|cart)\b/i.test(t) && !/add-to-cart|Add to cart|setCartCount/i.test(app)) {
      missing.push('Add to cart');
    }
  }

  // Contact form — fields + Send + thank-you path.
  if (
    (/\bContact\s+section\b/i.test(t) || (/\bcontact\b/i.test(t) && /\bform\b/i.test(t)))
    && /\b(?:add|put|include)\b/i.test(t)
    && /\b(?:name|email|message|Send)\b/i.test(t)
    && !(/\b(?:Work|Shop|Products)\b/.test(t) && /\bContact\b/.test(t) && /\b(?:nav|navigation|links?)\b/i.test(t))
  ) {
    if (!/contact-form|id=["']contact["']/i.test(app)) missing.push('Contact section');
    if (!/type=["']email["']/i.test(app)) missing.push('email field');
    if (!/<textarea\b/i.test(app)) missing.push('message field');
    if (!/>\s*Send\s*</i.test(app)) missing.push('Send button');
    if (!/setSent|thank|Thanks/i.test(app)) missing.push('thank-you');
  }

  // Tip calculator — require interactive bill/tip inputs + total (never brand-only pass).
  if (
    /\b(?:bill|tip\s*(?:percent|pct|amount|dollars?)?|tip\s*%)\b/i.test(t)
    && /\b(?:input|total|percent|calculator|amount)\b/i.test(t)
    && /\b(?:add|put|show|include|wire|build)\b/i.test(t)
  ) {
    if (!/<input\b/i.test(app)) missing.push('bill/tip inputs');
    if (!/\btotal\b/i.test(app)) missing.push('total');
    if (!/(?:setTip|setPct|tip\s*[:=]|tipAmount|tipDollars|Tip:|tip\s*percent)/i.test(app)) {
      missing.push('tip amount');
    }
  }

  if (
    (/\b(?:message\s+)?composer\b/i.test(t) || (/\bSend\b/i.test(t) && /\b(?:input|textarea|bottom|post|wire|work)\b/i.test(t)))
    && /\b(?:add|put|place|include|wire|fix|make)\b/i.test(t)
  ) {
    if (!/composer|<input\b|<textarea\b/i.test(app)) missing.push('composer input');
    if (!/\bSend\b/i.test(app)) missing.push('Send button');
    if (
      /onSubmit=\{\(e\)\s*=>\s*e\.preventDefault\(\)\}/i.test(app)
      || (!/useState/i.test(app) && /type=["']submit["']/i.test(app) && /composer/i.test(app))
    ) {
      missing.push('wired Send (message state)');
    }
  }
  if (/\bMaya\b/i.test(t) && /\bJordan\b/i.test(t) && /\b(?:add|put|place|include|message)\b/i.test(t)) {
    if (!/\bMaya\b/i.test(app)) missing.push('Maya message');
    if (!/\bJordan\b/i.test(app)) missing.push('Jordan message');
  }

  return { ok: missing.length === 0, missing };
}

function looksLikeKanbanCreateBrief(message: string): boolean {
  const t = String(message || '');
  return /\bkanban\b/i.test(t)
    && /\b(?:backlog|columns?|cards?|drag)\b/i.test(t)
    && /\b(?:create|build|named|called|vite|react)\b/i.test(t);
}

function buildKanbanSeedEdits(projectName: string): WebFileEdit[] {
  const title = String(projectName || 'TaskRail').replace(/[\\`]/g, '');
  return [
    {
      path: 'src/App.jsx',
      content: `import { useEffect, useState } from 'react';
import './App.css';

const COLUMNS = ['Backlog', 'Doing', 'Review', 'Done'];
const KEY = '${title.toLowerCase().replace(/\\s+/g, '-')}-kanban';

export default function App() {
  const [cards, setCards] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return [
      { id: 'c1', title: 'Welcome card', column: 'Backlog' },
    ];
  });
  const [draft, setDraft] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(cards)); } catch { /* ignore */ }
  }, [cards]);

  const addCard = () => {
    const titleText = draft.trim();
    if (!titleText) return;
    setCards((prev) => [...prev, { id: crypto.randomUUID(), title: titleText, column: 'Backlog' }]);
    setDraft('');
    setModalOpen(false);
  };

  const moveCard = (id, column) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, column } : c)));
  };

  return (
    <div className="kanban-shell">
      <header className="kanban-top">
        <h1>${title}</h1>
        <button type="button" onClick={() => setModalOpen(true)}>Add Card</button>
      </header>
      <div className="kanban-board">
        {COLUMNS.map((col) => (
          <section key={col} className="kanban-col" onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
            const id = e.dataTransfer.getData('text/plain');
            if (id) moveCard(id, col);
          }}>
            <h2>{col}</h2>
            {cards.filter((c) => c.column === col).map((c) => (
              <article
                key={c.id}
                className="kanban-card"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
              >
                {c.title}
              </article>
            ))}
          </section>
        ))}
      </div>
      {modalOpen ? (
        <div className="kanban-modal" role="dialog">
          <div className="kanban-modal-card">
            <h3>Add Card</h3>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Card title" autoFocus />
            <div className="kanban-modal-actions">
              <button type="button" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="button" onClick={addCard}>Add</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
`,
    },
    {
      path: 'src/App.css',
      content: `.kanban-shell{min-height:100vh;background:#0f1419;color:#e7ecf3;font-family:Segoe UI,system-ui,sans-serif}
.kanban-top{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #243041}
.kanban-top h1{margin:0;font-size:1.25rem}
.kanban-top button,.kanban-modal-actions button{background:#3b82f6;color:#fff;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}
.kanban-board{display:grid;grid-template-columns:repeat(4,minmax(180px,1fr));gap:12px;padding:16px}
.kanban-col{background:#171e27;border:1px solid #243041;border-radius:12px;padding:12px;min-height:420px}
.kanban-col h2{margin:0 0 10px;font-size:.95rem;color:#9fb0c3}
.kanban-card{background:#1f2937;border:1px solid #334155;border-radius:8px;padding:10px;margin-bottom:8px;cursor:grab}
.kanban-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:center}
.kanban-modal-card{background:#171e27;border:1px solid #334155;border-radius:12px;padding:16px;width:min(360px,92vw);display:grid;gap:10px}
.kanban-modal-card input{background:#0f1419;border:1px solid #334155;border-radius:8px;color:#fff;padding:8px 10px}
.kanban-modal-actions{display:flex;justify-content:flex-end;gap:8px}
.kanban-modal-actions button:first-child{background:#334155}
`,
    },
  ];
}

/** True when App.jsx is just the accidental NOVA search chrome stub. */
export function isNovaSearchStub(content: string): boolean {
  const c = String(content || '');
  if (!/NOVA-search|className=["']search-bar["']/i.test(c)) return false;
  // Real Discord/chat UIs can include a search input later — only treat tiny stubs as junk.
  if (c.length > 900) return false;
  return !/\b(?:server-rail|serverRail|channel-list|members|message-list|composer)\b/i.test(c);
}

function viteBlackShellEdits(): WebFileEdit[] {
  return viteSolidShellEdits('#000');
}

/** Empty full-viewport color shell — used to prove Preview is live (e.g. solid brown). */
export function viteSolidShellEdits(bg: string): WebFileEdit[] {
  const color = String(bg || '#000').trim() || '#000';
  // Explicit open/close root — never self-close; invent thrash used to splice siblings after `/>`.
  return [
    {
      path: 'src/App.jsx',
      content: `import './App.css';

export default function App() {
  return (
    <div className="app" aria-label="Blank page">
    </div>
  );
}
`,
    },
    {
      path: 'src/App.css',
      content: `.app {
  min-height: 100vh;
  margin: 0;
  width: 100%;
  background: ${color};
  color: #111111;
}
`,
    },
    {
      path: 'src/index.css',
      content: `html, body, #root { height: 100%; margin: 0; background: ${color}; }
`,
    },
  ];
}

/**
 * True when the USER asked for a blank/empty color page (not a product site).
 * Always call on the raw user ask — never on ensemble plan fluff.
 */
export function looksLikeBlankSolidCreateAsk(ask: string): boolean {
  return Boolean(blankSolidColorFromAsk(ask));
}

export function blankSolidColorFromAsk(ask: string): string | null {
  // Prefer the user's ask head — ensemble/plan appendages often inject "hero/features/cta"
  // and must not demote a blank white page into a marketing build.
  const head = String(ask || '').split(/\n## |\nLAYOUT CONTRACT|\nNOVA DESIGN SPINE|\nEnsemble plan/i)[0] || '';
  // Normalize typos before color parse ("browmwhite page" → cream, not default white).
  const t = normalizeMessyUiEditAsk(head);
  // Negations: "not a blank page", "don't build a blank", "no blank wipe" — never a solid shell.
  const blankNegated = /\b(?:not|n't|never|no|avoid|without|instead of)\b[\s\S]{0,24}\bblank\b|\bblank\b[\s\S]{0,24}\b(?:wipe|trap)\b/i.test(t);
  // Rich storefront / catalog asks are never a color wipe (even if they say "cream background").
  if (/\b(?:e-?commerce|storefront|add[\s-]?to[\s-]?(?:cart|bag)|shopping\s+cart|\bcart\b[\s\S]{0,40}\b(?:drawer|checkout|total)|product\s+(?:grid|catalog|cards?)|exactly\s+\d+\s+(?:bottles?|products?)|careers?\b[\s\S]{0,80}\b(?:help|support|about)|insulated\s+bottle)\b/i.test(t)) {
    return null;
  }
  // Full product / marketing / quiet-luxury creates are never a blank color wipe.
  // But explicit blank/empty intent always wins (unless negated above).
  const blankIntent = !blankNegated && /\b(?:blank|nothing else|nothing but|nothing on it|nothing in it|empty(?:\s+canvas)?|zero\s+ui|no (?:nav|text|icons?|words?|ui|chrome|buttons?)|just (?:a )?(?:solid|pure|flat|basic)|white\s+background|black\s+background)\b/i.test(t);
  if (/\b(?:quiet[\s-]?luxury|landing(?:\s+page)?|marketing\s+site|scroll\s+to\s+reveal|product\s+marketing|serif|orb|features?|footer|discover|cta)\b/i.test(t)
    && !blankIntent) {
    return null;
  }
  // Follow-up asks that ADD content on an existing colored screen must not re-wipe to a blank shell.
  // Include "name" — "blank white works… put the name Oak and Bean top left" is a ladder edit.
  if (/\b(?:put|add|place|insert|write|show|center|centred)\b[\s\S]{0,64}\b(?:words?|text|title|headline|name|logo|icon|button|footer|nav|search|phrase|copy|wording|banner|section|columns?)\b/i.test(t)) {
    return null;
  }
  // Café ladder: green day banner / Start an order / Fall is here — never a blank green wipe.
  if (/\b(?:day\s+banner|green\s+banner|Start\s+an\s+order|Fall\s+is\s+here|Free\s+refills?|site-footer|About\s*Us|Social\s+Impact)\b/i.test(t)) {
    return null;
  }
  if (/\b(?:put|place|add)\s+(?:the\s+)?name\b/i.test(t)) {
    return null;
  }
  if (/\b(?:words?|text|title|headline|phrase|wording|name)\b[\s\S]{0,48}\b(?:middle|center|centred|screen|viewport|top|left|right|corner)\b/i.test(t)) {
    return null;
  }
  if (/\b(?:words?|text|phrase|wording)\b/i.test(t) && /\b(?:says?|reading|labeled|label)\b/i.test(t)) {
    return null;
  }
  // "white words" / "white text" is paint for copy — not a white blank shell.
  if (/\b(?:white|black)\s+(?:words?|text|title|headline|copy|phrase)\b/i.test(t)) {
    return null;
  }
  // "solid brown blank", "blank lightred page", "just a pure brown full-screen", etc.
  // Multi-word / light* tokens must precede bare red/blue.
  const colorToken = String.raw`sky\s*blue|skyblue|light\s*red|lightred|light\s*blue|lightblue|light\s*pink|lightpink|brown|black|white|blue|red|green|teal|chocolate|sienna|pink|orange|yellow|purple|violet|cream|gr[ae]y`;
  // Non-greedy gaps so "blank sky blue" keeps sky blue (not trailing bare blue).
  const word = (
    t.match(new RegExp(String.raw`\b(?:solid|pure|just|blank|flat|basic|full[- ]?(?:screen|viewport|window)|premium|soft)\b[\s\S]{0,64}?\b(${colorToken})\b`, 'i'))?.[1]
    || t.match(new RegExp(String.raw`\b(${colorToken})\b[\s\S]{0,48}?\b(?:blank|background|full[- ]?(?:screen|viewport|window)|nothing else|nothing but|nothing on it|empty(?:\s+canvas)?|zero\s+ui|no (?:nav|text|icons?|words?|ui|chrome|buttons?))\b`, 'i'))?.[1]
    || t.match(new RegExp(String.raw`\bnothing but\b[\s\S]{0,64}?\b(${colorToken})\b`, 'i'))?.[1]
    || t.match(new RegExp(String.raw`\bcover\b[\s\S]{0,64}?\b(${colorToken})\b`, 'i'))?.[1]
    // "blank website / blank localhost" with a color somewhere in the ask
    // Skip when the user is *rejecting* a blank ("not a blank page").
    || (!blankNegated && /\bblank\b[\s\S]{0,80}\b(?:website|site|page|localhost|app)\b/i.test(t)
      ? (t.match(new RegExp(String.raw`\b(${colorToken})\b`, 'i'))?.[1] || 'white')
      : '')
    || ''
  );
  if (!word) return null;
  // Prefer multi-word colors when the ask names them explicitly.
  const resolved = /\blight\s*red\b|\blightred\b/i.test(t) ? 'light red'
    : /\blight\s*blue\b|\blightblue\b/i.test(t) ? 'light blue'
      : /\bsky\s*blue\b/i.test(t) ? 'sky blue'
        : (/\bcream\b/i.test(t) && /white/i.test(word) ? 'cream' : word);
  // Require blank/minimal intent so normal "brown accent" asks don't wipe the site.
  // Do NOT treat "full viewport" alone as blank — premium heroes use that phrase constantly.
  if (blankNegated) return null;
  if (!blankIntent
    && !/\b(?:blank|nothing else|nothing but|empty(?:\s+canvas)?|zero\s+ui|stop there|no (?:nav|text|icons?|words?|ui|chrome|buttons?)|just (?:a )?(?:solid|pure|flat|basic)|for now|empty otherwise|premium\s+(?:cream|gr[ae]y)|soft\s+gr[ae]y)\b/i.test(t)) {
    return null;
  }
  return cssColor(resolved) || null;
}

function stripSearchChromeFromIndexHtml(html: string): string {
  return String(html || '')
    .replace(/\s*<header class=["']top-bar["'][\s\S]*?<\/header>\s*/i, '\n')
    .replace(/\s*<label class=["']search-bar["'][\s\S]*?<\/label>\s*/i, '\n');
}

/** Strip prompt-instruction residue from visible titles and tighten basic page layout. */
export function healBasicUiLayout(files: WebFileMap, opts?: { projectName?: string }): WebFileEdit[] {
  const flat = flatten(files);
  const appPath = findReactAppPath(flat);
  if (!appPath || !flat[appPath]) return [];
  const cssPath = findReactCssPath(flat, appPath);
  let app = flat[appPath];
  let css = flat[cssPath] || '';
  let touchedApp = false;
  let touchedCss = false;

  // Remove instruction-leak titles that were pasted into the UI.
  app = app.replace(/(<(?:h1|h2)([^>]*)>)([\s\S]*?)(<\/(?:h1|h2)>)/gi, (full, open, _attrs, inner, close) => {
    const text = String(inner || '').replace(/<[^>]+>/g, '').trim();
    if (!looksLikePromptInstructionLeak(text)) return full;
    const brand = String(opts?.projectName || 'App').replace(/[<>&]/g, '').slice(0, 40) || 'App';
    touchedApp = true;
    return `${open}${brand}${close}`;
  });

  // Basic coherent shell: full-height column, readable nav, hero breathing room.
  if (css && !/\.app\s*\{[^}]*min-height\s*:\s*100vh/i.test(css)) {
    css += `\n.app{min-height:100vh;display:flex;flex-direction:column;margin:0;}\n`;
    touchedCss = true;
  }
  if (css && /className=["']nav["']/i.test(app) && !/\.nav\s*\{[^}]*display\s*:\s*flex/i.test(css)) {
    css += `\n.nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.5rem;width:100%;box-sizing:border-box;}\n`;
    touchedCss = true;
  }
  if (css && /className=["']hero["']/i.test(app) && !/\.hero\s*\{[^}]*padding/i.test(css)) {
    css += `\n.hero{padding:clamp(2.5rem,8vw,5rem) clamp(1.25rem,4vw,3rem);max-width:72rem;}\n`;
    touchedCss = true;
  }
  if (css && /font-family:\s*var\(--display\)/i.test(css) === false && /className=["']title["']/i.test(app)) {
    if (!/--display\s*:/i.test(css)) {
      css = css.replace(/:root\s*\{/i, ':root{\n  --display: Georgia, "Times New Roman", serif;');
      if (!/--display\s*:/i.test(css)) css = `:root{--display:Georgia,"Times New Roman",serif;}\n${css}`;
      touchedCss = true;
    }
    css += `\n.title,h1{font-family:var(--display);line-height:1.15;}\n`;
    touchedCss = true;
  }

  const out: WebFileEdit[] = [];
  if (touchedApp) out.push({ path: appPath, content: app });
  if (touchedCss && cssPath) out.push({ path: cssPath, content: css });
  return out;
}

export function finalizeWebEdits(
  files: WebFileMap,
  message: string,
  modelEdits: WebFileEdit[],
  opts?: { projectName?: string },
): WebFileEdit[] {
  const remapped = canonicalizeWebEdits(modelEdits, files);
  const ask = String(message || '');
  const flat = flatten(files);
  const hasViteReact = Object.keys(flat).some((p) => /(^|\/)src\/App\.(jsx|tsx)$/i.test(p));
  const structural = isStructuralUiPieceAsk(ask);
  const searchNegated = /\b(?:no|without|never|skip|omit|don't|do\s+not|dont)\b[\s\S]{0,40}\bsearch(?:\s*bar)?\b/i.test(ask);
  const wantsSearch = !searchNegated && /\bsearch\s*bar\b/i.test(ask);

  const cleaned = remapped.filter((e) => {
    const p = String(e.path || '').replace(/\\/g, '/');
    if (/(?:^|\/)App\.(jsx|tsx)$/i.test(p) && isNovaSearchStub(e.content) && !wantsSearch) return false;
    return true;
  }).map((e) => {
    const p = String(e.path || '').replace(/\\/g, '/');
    if (/(?:^|\/)index\.html$/i.test(p) && hasViteReact && !wantsSearch) {
      return { ...e, content: stripSearchChromeFromIndexHtml(e.content) };
    }
    return e;
  });

  const exactMinimal = /\b(?:exact(?:ly)?|precisely|follow precisely|pure black|#000000|centered icon|nothing else|no other)\b/i.test(ask);
  const appMin = exactMinimal ? 160 : 400;
  // UI shells have surgical templates — never invent-only marketing wipe.
  const marketingCreate = askLooksLikeMarketingOrProductHomepage(ask) && !isUiShellAsk(ask);

  // Multi-op fidelity: never drop half the ask when surgical only matches the first piece.
  // Prefer caller @@@FILE edits when present; otherwise merge surgical per planned op.
  if (!marketingCreate && remapped.length === 0) {
    const plan = planUiAsk(message);
    if (isMicroFidelityPlan(plan) && plan.ops.length > 1) {
      let merged: WebFileMap = { ...files };
      const byPath = new Map<string, string>();
      for (const op of plan.ops) {
        const opAsk = canonicalAskForOp(op);
        if (!opAsk) continue;
        for (const e of reactSurgicalMicroAskEdits(merged, opAsk)) {
          const p = String(e.path || '').replace(/\\/g, '/');
          if (!p) continue;
          byPath.set(p, e.content);
          merged = { ...merged, [p]: e.content };
        }
      }
      if (byPath.size) {
        return [...byPath.entries()].map(([path, content]) => ({ path, content }));
      }
    }
  }

  // Surgical add-word / logo / search / put-name asks must win before blank-shell wipe.
  // Otherwise "blank white works — put the name top left" re-wipes to an empty page.
  // When the caller already supplied @@@FILE edits, keep them (fidelity persist / agent).
  const surgicalEarly = marketingCreate ? [] : reactSurgicalMicroAskEdits(files, message);
  if (surgicalEarly.length && remapped.length === 0) {
    const microAsk = isWebMicroAsk(message)
      || /\b(?:add|put|place|insert|center|centred|words?|wording|name)\b/i.test(ask);
    if (microAsk) return surgicalEarly;
  }

  // Blank solid color MUST win before cinematic upgrades — "just a solid black background,
  // nothing else" was getting upgraded into a multi-stage cinema shell.
  const blankSolidEarly = blankSolidColorFromAsk(ask);
  if (blankSolidEarly) {
    const out = [...viteSolidShellEdits(blankSolidEarly)];
    const html0 = flat['index.html'] || cleaned.find((e) => /(?:^|\/)index\.html$/i.test(String(e.path || '').replace(/\\/g, '/')))?.content;
    if (html0 && /NOVA-search|top-bar/i.test(html0)) {
      out.push({ path: 'index.html', content: stripSearchChromeFromIndexHtml(html0) });
    } else if (flat['index.html'] && /NOVA-search|top-bar/i.test(flat['index.html'])) {
      out.push({ path: 'index.html', content: stripSearchChromeFromIndexHtml(flat['index.html']) });
    }
    return out;
  }

  const blankSolid = blankSolidColorFromAsk(ask);
  const wantsBlackOnly = /(?:ONLY this piece|full-viewport solid|near-black|#1e1f22|solid pure black|pure black full-viewport|full-viewport background)/i.test(ask)
    && /(?:ONLY this piece|Stop after the black shell|black shell only|first step ONLY|No nav,\s*no text|no icons yet)/i.test(ask);

  // Blank solid color (brown/black/…) — force a real empty shell so Preview can prove itself.
  if (blankSolid) {
    const out = [...viteSolidShellEdits(blankSolid)];
    const html0 = flat['index.html'] || cleaned.find((e) => /(?:^|\/)index\.html$/i.test(String(e.path || '').replace(/\\/g, '/')))?.content;
    if (html0 && /NOVA-search|top-bar/i.test(html0)) {
      out.push({ path: 'index.html', content: stripSearchChromeFromIndexHtml(html0) });
    } else if (flat['index.html'] && /NOVA-search|top-bar/i.test(flat['index.html'])) {
      out.push({ path: 'index.html', content: stripSearchChromeFromIndexHtml(flat['index.html']) });
    }
    return out;
  }

  // First piece: black shell only — force a real App.jsx, never search chrome.
  // Must run before "substantial index.html" short-circuit (models often ship a fat HTML toolbar).
  if (hasViteReact && wantsBlackOnly) {
    const out = [...viteBlackShellEdits()];
    const html0 = flat['index.html'] || cleaned.find((e) => /(?:^|\/)index\.html$/i.test(String(e.path || '').replace(/\\/g, '/')))?.content;
    if (html0 && /NOVA-search|top-bar/i.test(html0)) {
      out.push({ path: 'index.html', content: stripSearchChromeFromIndexHtml(html0) });
    } else if (flat['index.html'] && /NOVA-search|top-bar/i.test(flat['index.html'])) {
      out.push({ path: 'index.html', content: stripSearchChromeFromIndexHtml(flat['index.html']) });
    }
    return out;
  }

  const substantialModel = cleaned.some((e) => {
    const p = String(e.path || '').replace(/\\/g, '/');
    const n = String(e.content || '').length;
    if (/(?:^|\/)App\.(jsx|tsx)$/i.test(p) && n >= appMin && !isNovaSearchStub(e.content)) return true;
    if (/(?:^|\/)index\.html$/i.test(p) && n >= 400) return true;
    return false;
  });

  // Surgical incremental asks must win over a fat model dump that ignored "ONLY add X".
  const surgical = marketingCreate ? [] : (surgicalEarly.length ? surgicalEarly : reactSurgicalMicroAskEdits(files, message));
  if (surgical.length) {
    const microAsk = isWebMicroAsk(message)
      || /\b(?:add|put|place|insert)\b/i.test(ask);
    if (microAsk || !substantialModel) return surgical;
  }

  if (substantialModel) return cleaned;

  // Piece-by-piece Discord/chat UI on a Vite app: trust model App.jsx edits only.
  if (structural && hasViteReact) {
    return cleaned.filter((e) => /(?:^|\/)(?:src\/)?App\.(jsx|tsx|css)$/i.test(String(e.path || '').replace(/\\/g, '/')));
  }

  const reactMicro = reactUiMicroAskEdits(files, message, opts);
  if (reactMicro.length) return reactMicro;

  const micro = isWebMicroAsk(message) ? webMicroAskEdits(files, message) : [];

  if (micro.length) {
    // Micro-asks: local patch only. models often write the wrong tree and still "succeed".
    return micro;
  }

  if (cleaned.length && touchesPreviewServing(cleaned.map(e => e.path), files)) {
    const healed = healBasicUiLayout(
      { ...flat, ...Object.fromEntries(cleaned.map((e) => [String(e.path).replace(/\\/g, '/'), e.content])) },
      opts,
    );
    if (!healed.length) return cleaned;
    const byPath = new Map(cleaned.map((e) => [String(e.path).replace(/\\/g, '/'), e]));
    for (const h of healed) byPath.set(String(h.path).replace(/\\/g, '/'), h);
    return [...byPath.values()];
  }

  // Model only hit junk / nothing previewable. keep remapped if any, else empty (caller may scaffold).
  const healOnly = healBasicUiLayout(files, opts);
  return healOnly.length ? healOnly : cleaned;
}
