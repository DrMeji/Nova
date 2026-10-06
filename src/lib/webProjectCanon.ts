import { extractBrandLabel, extractNameRenameTarget, extractNameTextColorTarget, looksLikeNameTextColorAsk } from '@/lib/brandLabel';
import { looksLikeNameFontStyleAsk, normalizeMessyUiEditAsk } from '@/lib/editAskResolve';
import { parseNamedBrandLogos, parseNamedUiIcons } from '@/lib/brandAssets';
import { briefForbidsAbsoluteRails } from '@/lib/createLayoutContract';

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
    .replace(/^[`"'[\(]+|[`"'][\)]+$/g, '')
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
  if (/black|dark/i.test(name)) return '#000000';
  if (/cream/i.test(name)) return '#f5f0e8';
  if (/white/i.test(name)) return '#ffffff';
  if (/blue/i.test(name)) return '#2563eb';
  if (/red/i.test(name)) return '#dc2626';
  if (/green/i.test(name)) return '#16a34a';
  if (/yellow/i.test(name)) return '#eab308';
  if (/purple|violet/i.test(name)) return '#7c3aed';
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

function iconRailCornerCss(corner: string): string {
  if (corner === 'top-right') return 'top:1.25rem;right:1.25rem;left:auto;bottom:auto;align-items:flex-end;';
  if (corner === 'bottom-left') return 'top:auto;left:1.25rem;right:auto;bottom:1.25rem;';
  if (corner === 'bottom-right') return 'top:auto;right:1.25rem;left:auto;bottom:1.25rem;align-items:flex-end;';
  return 'top:1.25rem;left:1.25rem;right:auto;bottom:auto;';
}

/** Patch .app / .App / body / html,body,#root backgrounds to a solid color. */
function patchSolidBackground(css: string, bg: string): string {
  let next = String(css || '');
  const paint = (sel: string) => {
    const re = new RegExp(`(${sel}\\s*\\{)([^}]*)(\\})`, 'i');
    if (!re.test(next)) return false;
    next = next.replace(re, (_m, open: string, body: string, close: string) => {
      let b = String(body || '');
      if (/background(?:-color)?\s*:/i.test(b)) {
        b = b.replace(/background(?:-color)?\s*:\s*[^;]+/i, `background: ${bg}`);
      } else {
        if (b.trim() && !/;\s*$/.test(b)) b = `${b.trim()};`;
        b = `${b} background: ${bg};`;
      }
      return `${open}${b}${close}`;
    });
    return true;
  };
  const hit = paint('\\.app') || paint('\\.App') || paint('body') || paint('html,\\s*body,\\s*#root');
  if (!hit) {
    next = `.app { min-height: 100vh; margin: 0; background: ${bg}; }\n${next}`;
  }
  // Keep html/body/#root in sync when present (Preview often paints from index.css).
  next = next.replace(
    /(html,\s*body,\s*#root\s*\{[^}]*?)background(?:-color)?\s*:\s*[^;]+/i,
    `$1background: ${bg}`,
  );
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
  return /\b(?:server\s+rail|server-icon|channel\s+(?:list|column)|channels?\s+column|chat\s+(?:pane|header|composer|system|messages?)|member\s+list|members?\s+column|user\s+bar|settings\s+(?:panel|overlay|gear|modal)|message\s+composer|related\s+videos?)\b/i.test(t);
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
  if (/\b(?:move|put|place|shift)\b[\s\S]{0,48}\b(?:icon|search|settings?|menu|user|profile)\b[\s\S]{0,48}\b(?:top|bottom|left|right|corner)\b/i.test(t)) return true;
  if (/\b(?:bold|italic|cursive|serif|sans|thin|light|skinny|professional)\b/i.test(t) && /\b(?:font|make|look|style|word|title|name|text)\b/i.test(t)) return true;
  if (/\b(?:put|add|place)\b[\s\S]{0,40}\b(?:word|text)\b/i.test(t)) return true;
  if (/\bword\b/i.test(t) && /\b(?:middle|center|screen)\b/i.test(t)) return true;
  if (/\b(?:words?|wording|phrase)\b/i.test(t) && /\b(?:center|centred|middle|screen|brown|viewport)\b/i.test(t)) return true;
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
  if (/\b(logo|icon)\b/i.test(t) && /\b(add|put|place|center|middle|screen|top[\s-]?left)\b/i.test(t)) return true;
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
  return false;
}

/**
 * Marketing / product homepage asks — must never get surgical center-word / flex-center
 * phone-column CSS. Kept local (no import from createBuildQuality) to avoid cycles.
 */
export function askLooksLikeMarketingOrProductHomepage(ask: string): boolean {
  const t = String(ask || '');
  if (!t.trim()) return false;
  if (/\b(?:quiet\s+luxury|landing(?:\s+page)?|marketing\s+site|scroll\s+to\s+reveal|soft\s+(?:mint\s+|green\s+)?orbs?|premium\s+(?:product|quiet)|full\s+scrollable\s+landing|product\s+(?:homepage|marketing|page)|full[- ]?bleed)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:hero|footer|features?|varieties|colorway|specs?)\b/i.test(t)
    && /\b(?:website|landing|homepage|marketing|brand)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:gaming\s+(?:mouse|keyboard|headset|peripheral)|wireless\s+mouse|mechanical\s+keyboard|dried[- ]?dates?|medjool|fruit\s+brand|specialty[- ]food|liquor|spirits?|bottle\s+shop)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:mouse|keyboard|headset|earbuds?|vacuum|shop|store|dates?|whiskey|whisky|bourbon|vodka|gin)\b/i.test(t)
    && /\b(?:website|landing|homepage|product|brand|cart|checkout)\b/i.test(t)) {
    return true;
  }
  if (t.length > 160
    && /\b(?:website|homepage)\b/i.test(t)
    && /\b(?:sticky\s+nav|full[- ]?bleed|hero|CTA|footer|Shop)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Surgical React SPA tweaks. must win over full kanban/finance rebuilds from project name. */
export function reactSurgicalMicroAskEdits(
  files: WebFileMap,
  message: string,
): WebFileEdit[] {
  const t = normalizeMessyUiEditAsk(String(message || ''));
  if (!t.trim()) return [];
  // Piece-by-piece Discord layout asks need full model App.jsx writes, not surgical tweaks.
  if (isStructuralUiPieceAsk(t)) return [];
  // Shop feature packs must never get a half-patched App (unbound cart / blank Live).
  if (isShopFeatureStructureAsk(t)) return [];
  // Full product / marketing landings must never collapse into a center-word stub.
  if (askLooksLikeMarketingOrProductHomepage(t)) {
    return [];
  }
  if (/\b(scrap|rebuild|from\s+scratch|scaffold\s+(?:a\s+)?new|replace\s+(?:the\s+)?(?:entire\s+)?(?:app|layout|ui)|start\s+over)\b/i.test(t)) {
    return [];
  }
  if (
    !isWebMicroAsk(t)
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

  // Solid page background color (brown / pink / blue / …) — do this before richer chrome so
  // "change the background to brown" never false-passes as already applied.
  {
    const colorWord = t.match(
      /\b(black|white|blue|dark|red|green|yellow|purple|violet|brown|teal|chocolate|sienna|pink|orange|navy|cream|gr[ae]y)\b/i,
    )?.[1];
    // "keep the cream background" + "name in black" → cream wins for page paint.
    const keepCream = /\b(?:keep|leave|back\s+to)\b[\s\S]{0,24}\bcream\b/i.test(t)
      || /\bcream\s+background\b/i.test(t);
    const bgColorWord = (keepCream && /black|white/i.test(String(colorWord || '')) && /\bcream\b/i.test(t))
      ? 'cream'
      : colorWord;
    const wantsBgColor = Boolean(bgColorWord) && (
      /\bbackground\b/i.test(t)
      || (
        /\b(?:change|set|make|turn|update|switch|add)\b[\s\S]{0,48}\b(?:to|into)\s+(?:a\s+)?(?:solid\s+)?(?:brown|black|white|blue|red|green|teal|pink|orange|navy|cream|gr[ae]y)\b/i.test(t)
        && !/\b(?:text|title|heading|h1|button|word|label|copy|name)\b/i.test(t)
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
      css = patchSolidBackground(css, bg);
      // Leaving charcoal: drop the red glow halo so cream/white reads clean.
      if (/cream|white/i.test(bgColorWord)) {
        css = css.replace(/\n?\.app::before\{[^}]*\}\n?/gi, '\n');
        css = css.replace(/\n?\.app>\*\{[^}]*\}\n?/gi, '\n');
      }
      touchedCss = true;
      if (indexCss) {
        indexCss = patchSolidBackground(indexCss, bg);
        touchedIndex = true;
      } else if (/html,\s*body,\s*#root/i.test(css) === false) {
        // Ensure root paint even when index.css is missing from the map.
        css = `html, body, #root { height: 100%; margin: 0; background: ${bg}; }\n${css}`;
      }
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
    const wantsExtraIcon = /\b(?:another|second|more|extra)\b[\s\S]{0,24}\bicon\b/i.test(t)
      || /\b(?:add|put|place)\b[\s\S]{0,40}\b(?:a\s+|the\s+|premium\s+|professional\s+)?(?:menu|search|bag|cart)\s+icons?\b/i.test(t)
      || (/\bicon\b/i.test(t) && /\b(?:top[\s-]?left|add|put|place|premium|professional)\b/i.test(t) && !wantsLogo)
      || /\b(?:premium|professional)\s+icons?\b/i.test(t)
      || namedIcons.length > 0;
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
    const centeredWord = (
      extractNameRenameTarget(t)
      || t.match(/\b(?:words?|text|phrase|copy|line)\s+(?:that\s+)?(?:says?|reading)\s*[:\s]+["“']([^"”']{2,80})["”']/i)?.[1]
      || t.match(/\b(?:says?|reading)\s+["“']([^"”']{2,80})["”']/i)?.[1]
      || t.match(/\b(?:says?|reading)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,6})\b/)?.[1]
      // "heading … saying something like Fresh vegetable plants"
      || t.match(/\b(?:heading|headline|h1|title)\b[\s\S]{0,100}\b(?:saying|say|that\s+says?)\s+(?:something\s+like\s+)?["“']?([A-Za-z][\w]*(?:\s+[A-Za-z][\w]*){1,6})/i)?.[1]
      || t.match(/\b(?:put|add|place|write|show)\b[\s\S]{0,48}\b(?:words?|text|phrase)\b[\s\S]{0,24}["“']([^"”']{2,80})["”']/i)?.[1]
      || t.match(/\b(?:put|add|place|write|show)\b[\s\S]{0,40}\b(?:words?|text|title)\s+["“']([^"”']{2,80})["”']/i)?.[1]
      // Unquoted multi-word: "Put the words Nightglass After Hours in the center"
      // Verb is case-insensitive; Title-Case capture stays case-sensitive so
      // "centered in the" is not swallowed as the product name.
      || t.match(/\b(?:put|add|place|write|show)\b[\s\S]{0,48}\b(?:words?|text|phrase|title)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,6})\b/i)?.[1]
      || t.match(/\b(?:change|rename|set|update)\b[\s\S]{0,48}\b(?:centered\s+)?(?:words?|title|text)\s+(?:to|into)\s+["“']?([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,6})\b/i)?.[1]
      // Brand name / brand should say VOID Peripherals — stop at layout words
      || extractBrandLabel(t)
      || t.match(/\b(?:put|add|place|write|show)\b[\s\S]{0,40}\b(?:word|text|title)\s+["“']?([A-Za-z][A-Za-z0-9_-]{1,40})\b/i)?.[1]
      || t.match(/\b(?:word|text)\s+["“']?([A-Za-z][A-Za-z0-9_-]{1,40})["”']?\s+(?:in|on|at)\b/i)?.[1]
      || ''
    ).trim().replace(/[.,;:]+$/, '').replace(/\s+/g, ' ');
    // Strip layout tails if a Title-Case regex still swallowed them — keep "local only"
    const centeredWordFinal = centeredWord
      .replace(/\s+\bonly\s+(?:add|put|place|with|and|no|nothing|keep|leave)\b.*$/i, '')
      .replace(/\s+\b(?:short|friendly|not|corporate|and)\b.*$/i, '')
      .replace(/\s+\b(?:centered?|centred|in\s+the|middle|clean|white|black|text|on\s+screen|nothing|else)\b.*$/i, '')
      .trim() || centeredWord;
    const wantsCenteredWord = Boolean(centeredWordFinal) && (
      /\b(?:middle|center|centred|screen|page|viewport|brown|centered|white)\b/i.test(t)
      || /\bbrand\s+(?:name|should\s+say)\b/i.test(t)
      || /\bjust\s+that\s+word\b/i.test(t)
      || /\bnothing else\b/i.test(t)
      || /\bonly\s+words?\b/i.test(t)
      || /\bwords?\s+only\b/i.test(t)
      || /\bwording\s+only\b/i.test(t)
      || /\b(?:drop|add|put|place)\b[\s\S]{0,48}\b(?:heading|headline|h1|title)\b/i.test(t)
      || /\b(?:change|rename|set|update)\b[\s\S]{0,40}\b(?:centered\s+)?(?:words?|title|name)\b/i.test(t)
      || Boolean(extractNameRenameTarget(t))
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
    const wantsCta = Boolean(ctaLabel) || (/\b(?:button|cta)\b/i.test(t) && /\badd\b/i.test(t) && /\b(?:under|subtitle|hero)\b/i.test(t));
    const footerNegated = /\b(?:no|without|never|skip|omit|don't|do\s+not|dont)\b[\s\S]{0,24}\bfooter\b/i.test(t);
    const wantsFooter = !footerNegated && /\bfooter\b/i.test(t) && /\b(?:add|put|simple)\b/i.test(t);

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

    if (wantsLogo || wantsExtraIcon || wantsSearch || wantsBag || wantsHeroTitle || wantsCenteredWord || wantsSubtitle || wantsCta || wantsFooter) {
      // Named brand/icon rails use absolute positioning on .app — skip empty nav chrome.
      if (!wantsCenteredWord && namedBrands.length === 0 && namedIcons.length === 0) ensureNavShell();
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
      const white = /\bwhite\b/i.test(t);
      const black = /\bblack\b/i.test(t) && !white;
      const lightBg = /background\s*:\s*(?:#f[0-9a-f]{2,5}|#e[0-9a-f]{2,5}|#d[0-9a-f]{2,5}|#fff|cream|white)/i.test(css)
        || /\b(?:cream|soft\s+gr[ae]y|premium\s+gr[ae]y|light\s+gr[ae]y)\b/i.test(t);
      const color = white ? '#fff' : black ? '#111' : (lightBg ? '#1a1a1a' : '#fff');
      if (/className=["']center-word["']/i.test(app)) {
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
      if (cssPath) {
        const centerRules = `.app{min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center}`
          + `\n.center-word{margin:0;color:${color};font-size:clamp(1.6rem,5vw,3.2rem);font-weight:600;letter-spacing:-0.02em;`
          + `text-align:center;max-width:min(92vw,28rem);line-height:1.15}\n`;
        // Preserve existing solid background; only ensure flex centering + word style.
        if (/\.app\s*\{[^}]*\}/i.test(css)) {
          css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
            let next = String(body || '');
            if (!/min-height\s*:/i.test(next)) next += ' min-height: 100vh;';
            if (!/display\s*:/i.test(next)) next += ' display: flex;';
            if (!/align-items\s*:/i.test(next)) next += ' align-items: center;';
            if (!/justify-content\s*:/i.test(next)) next += ' justify-content: center;';
            if (!/margin\s*:/i.test(next)) next += ' margin: 0;';
            return `.app {${next}}`;
          });
          touchedCss = true;
        } else {
          css = `${centerRules}${css}`;
          touchedCss = true;
        }
        if (!/\.center-word\b/.test(css)) {
          css += `\n.center-word{margin:0;color:${color};font-size:clamp(1.6rem,5vw,3.2rem);font-weight:600;letter-spacing:-0.02em;text-align:center;max-width:min(92vw,28rem);line-height:1.15}\n`;
          touchedCss = true;
        } else {
          css = css.replace(/(\.center-word\s*\{[^}]*?)color\s*:\s*[^;]+/i, `$1color: ${color}`);
          touchedCss = true;
        }
        if (!/\.app\s*\{[^}]*background/i.test(css) && !/\.App\s*\{[^}]*background/i.test(css) && !/background\s*:/i.test(css)) {
          const bg = /\bblack\b/i.test(t) ? '#000000' : /\bbrown\b/i.test(t) ? '#8B4513' : '#000000';
          css = `.app { min-height: 100vh; margin: 0; background: ${bg}; display: flex; align-items: center; justify-content: center; }\n${css}`;
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
    const iconSet = skipAbsoluteRails
      ? []
      : namedIcons.length
      ? namedIcons.map((ic) => ({ id: ic.id, label: ic.label }))
      : (wantsExtraIcon && !wantsLogo ? defaultUiIcons : []);
    if (iconSet.length) {
      const missing = iconSet.filter((ic) => !new RegExp(`/icons/${ic.id}\\.svg`, 'i').test(app));
      const corner = parseLayoutCorner(t) || 'top-left';
      const railClass = `icon-rail icon-rail--${corner}`;
      if (missing.length || !/className=["'][^"']*icon-rail/i.test(app)) {
        const imgs = (missing.length ? missing : iconSet)
          .filter((ic, i, arr) => arr.findIndex((x) => x.id === ic.id) === i)
          .filter((ic) => !new RegExp(`/icons/${ic.id}\\.svg`, 'i').test(app) || missing.some((m) => m.id === ic.id))
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

    // Sticky product nav — inject without wiping center-word / hero content.
    {
      const wantsStickyNav = (
        /\b(?:add|put|include)\b[\s\S]{0,48}\b(?:sticky\s+)?nav(?:igation|bar)?\b/i.test(t)
        || (/\bsticky\b/i.test(t) && /\bnav(?:igation|bar)?\b/i.test(t))
      );
      const labels = [...t.matchAll(/\b(Products|Specs|Buy|Shop|About|Contact|Menu|Home)\b/g)]
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

    if (wantsCta) {
      const label = (ctaLabel || 'Explore').replace(/[`$]/g, '');
      const labelEsc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const already = new RegExp(`>\\s*${labelEsc}\\s*<`, 'i').test(app);
      if (!already) {
        const btn = `<button type="button" className="cta">${label}</button>`;
        if (/className=["']subtitle["'][\s\S]{0,120}/i.test(app)) {
          app = app.replace(/(<p className=["']subtitle["'][^>]*>[\s\S]*?<\/p>)/i, `$1\n        ${btn}`);
        } else if (/<\/h1>/i.test(app)) {
          app = app.replace(/<\/h1>/i, `</h1>\n        ${btn}`);
        } else if (/<\/section>/i.test(app)) {
          app = app.replace(/<\/section>/i, `  ${btn}\n      </section>`);
        }
        touchedApp = true;
      }
      if (cssPath && !/\.cta\b/.test(css)) {
        css += `\n.cta{margin-top:1.5rem;padding:.7rem 1.4rem;border:1px solid #fff;background:transparent;color:#fff;border-radius:999px;cursor:pointer}\n.cta:hover{background:#fff;color:#000}\n`;
        touchedCss = true;
      }
    }

    // Product photos + tagline (fail-closed verifyAsk needs real https srcs)
    {
      const wantsMousePhoto = /\bmouse\b/i.test(t) && /\b(?:photo|shot|image|img|hero)\b/i.test(t);
      const wantsKeyboardPhoto = /\bkeyboard\b/i.test(t) && /\b(?:photo|shot|image|img)\b/i.test(t);
      const wantsTagline = /\btagline\b/i.test(t)
        || (/\bprecision\b/i.test(t) && /\bspeed\b/i.test(t) && /\b(?:add|short)\b/i.test(t));
      const mouseUrl = 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=1200&q=80';
      const keyboardUrl = 'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?auto=format&fit=crop&w=1200&q=80';
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
      if (wantsTagline && !/className=["']tagline["']/i.test(app)) {
        const line = 'Precision and speed — built for the win.';
        const tag = `<p className="tagline">${line}</p>`;
        if (/alt=["'][^"']*keyboard/i.test(app)) {
          app = app.replace(/(<img className=["']hero-photo["'][^>]*keyboard[^>]*>)/i, `$1\n        ${tag}`);
        } else if (/alt=["'][^"']*mouse/i.test(app)) {
          app = app.replace(/(<img className=["']hero-photo["'][^>]*mouse[^>]*>)/i, `$1\n        ${tag}`);
        } else if (/<\/h1>/i.test(app)) {
          app = app.replace(/<\/h1>/i, `</h1>\n        ${tag}`);
        }
        touchedApp = true;
      }
      if ((wantsMousePhoto || wantsKeyboardPhoto || wantsTagline) && cssPath) {
        if (!/\.hero-photo\b/.test(css)) {
          css += `\n.hero{display:flex;flex-direction:column;align-items:center;gap:1rem;padding:2rem 1.25rem;text-align:center;flex:1;justify-content:center}`
            + `\n.hero-photo{width:min(420px,86vw);height:auto;border-radius:12px;object-fit:cover;display:block}\n`;
          touchedCss = true;
        }
        if (wantsTagline && !/\.tagline\b/.test(css)) {
          css += `\n.tagline{margin:0;color:#d4d4d4;font-size:1.05rem;letter-spacing:0.02em}\n`;
          touchedCss = true;
        }
        // Brand belongs in the hero stack, not absolutely over the photos.
        // Important: only treat brand as nested when it sits INSIDE the hero
        // section ([\s\S]* across </section> falsely matched brand siblings).
        if (/className=["']center-word["']/i.test(app) && /className=["']hero["']/i.test(app)) {
          const heroBlock = app.match(/<section\b[^>]*className=["']hero["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || '';
          const brand = app.match(/<h1[^>]*className=["']center-word["'][^>]*>[\s\S]*?<\/h1>/i)?.[0];
          if (brand && !/className=["']center-word["']/i.test(heroBlock)) {
            app = app.replace(brand, '');
            app = app.replace(/(<section\b[^>]*className=["']hero["'][^>]*>)/i, `$1\n        ${brand}`);
            touchedApp = true;
          }
          if (cssPath && /\.center-word\s*\{[^}]*position\s*:\s*absolute/i.test(css)) {
            css = css.replace(/\.center-word\s*\{([^}]*)\}/i, (_m, body: string) => {
              let next = String(body || '')
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

    if (wantsFooter && !/<footer[\s>]/i.test(app)) {
      const brand = (
        t.match(/\bfooter\b[\s\S]{0,60}\bword\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/i)?.[1]
        || t.match(/\bfooter\b[\s\S]{0,40}\b(?:with|say)\s+["']([A-Za-z][A-Za-z0-9 _-]{1,40})["']/i)?.[1]
        || 'Nightglass'
      ).replace(/[`$]/g, '');
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
        css += `\n.footer{margin-top:auto;padding:1.25rem 1.5rem;border-top:1px solid #333;color:#aaa;font-size:.9rem}\n.app{min-height:100vh;display:flex;flex-direction:column;background:#000;color:#fff}\n`;
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
      const out: WebFileEdit[] = [];
      if (touchedApp) out.push({ path: appPath, content: app });
      if (touchedCss && cssPath) out.push({ path: cssPath, content: css });
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

  // Add Contact / Support (or similar) nav control that scrolls to buy / contact.
  {
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
    /\bcharcoal\b/i.test(t)
    || (/\bbackground\b/i.test(t) && /\b(?:glow|accent)\b/i.test(t) && /\bred\b/i.test(t))
  ) {
    const charcoal = '#141414';
    if (/\.app\s*\{/i.test(css)) {
      css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
        let next = String(body || '');
        if (/background(?:-color)?\s*:/i.test(next)) {
          next = next.replace(/background(?:-color)?\s*:\s*[^;]+/i, `background: ${charcoal}`);
        } else {
          next += ` background: ${charcoal};`;
        }
        if (!/position\s*:/i.test(next)) next += ' position: relative;';
        if (!/overflow\s*:/i.test(next)) next += ' overflow: hidden;';
        return `.app {${next}}`;
      });
      touchedCss = true;
    } else {
      css += `\n.app{min-height:100vh;margin:0;background:${charcoal};color:#f4f7fb;position:relative;overflow:hidden}\n`;
      touchedCss = true;
    }
    if (!/\.hero-glow\b|\.app::before/i.test(css)) {
      css += `\n.app::before{content:"";position:absolute;inset:10% 12% auto;height:min(48vh,420px);border-radius:50%;`
        + `background:radial-gradient(circle,rgba(220,38,38,.35),transparent 68%);pointer-events:none;z-index:0;filter:blur(8px)}`
        + `\n.app>*{position:relative;z-index:1}\n`;
      touchedCss = true;
    }
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
  if (
    /className=["']center-word["']/i.test(app)
    && /\b(?:move|put|place|shift)\b/i.test(t)
    && /\b(?:top|bottom|left|right|corner|center|middle)\b/i.test(t)
  ) {
    // Prefer the clause that names the title / Nightglass / center-word — not icon/logo moves in the same ask.
    const nameClause = (
      t.match(/\b(?:move|put|place|shift)\b[\s\S]{0,48}\b(?:nightglass|center(?:ed)?\s+word|the\s+name|the\s+title|the\s+word)\b[\s\S]{0,48}\b(?:top[\s-]?left|top[\s-]?right|bottom[\s-]?left|bottom[\s-]?right|bottom\s+center|top\s+center|center|middle)\b/i)?.[0]
      || t.match(/\b(?:move|put|place|shift)\b[\s\S]{0,24}\b(?:it|name|title|word)\b[\s\S]{0,40}\b(?:top|bottom|left|right|center|middle)\b/i)?.[0]
      || ''
    );
    const scope = nameClause || t;
    const top = /\btop\b/i.test(scope);
    const bottom = /\bbottom\b/i.test(scope);
    const left = /\bleft\b/i.test(scope);
    const right = /\bright\b/i.test(scope);
    const wantsCenter = /\b(?:center|centre|middle)\b/i.test(scope);
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
      const url = 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=1200&q=80';
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
  if (touchedCss) out.push({ path: cssPath, content: css });
  if (touchedIndex && cssPath !== 'src/index.css') {
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
    // Edit the twin that already has UI; only fall back to entry preference for two stubs.
    if (stub(jsx) && !stub(tsx)) return 'src/App.tsx';
    if (stub(tsx) && !stub(jsx)) return 'src/App.jsx';
    if (flat['src/main.jsx'] != null && flat['src/main.tsx'] == null) return 'src/App.jsx';
    if (flat['src/main.tsx'] != null && flat['src/main.jsx'] == null) return 'src/App.tsx';
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

  // UI icon add / move — require the icon file ref and corner rail when asked.
  {
    const named = parseNamedUiIcons(t);
    const wantsIcons = named.length > 0
      || (/\bicons?\b/i.test(t) && /\b(?:add|put|place)\b/i.test(t));
    if (wantsIcons && !/\b(?:move|shift)\b/i.test(t)) {
      const ids = named.length
        ? named.map((ic) => ic.id)
        : ['search', 'settings', 'menu', 'user'];
      for (const id of ids) {
        if (!new RegExp(`/icons/${id}\\.svg`, 'i').test(app)) missing.push(`icon:${id}`);
      }
      if (!/icon-rail|nav-tools|nav-icon/i.test(app)) missing.push('icon-rail');
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
      t.match(/\b(?:keep|stay|remain|still)\s+(?:that\s+|the\s+|a\s+)?(cream|brown|black|white|blue|red|green|teal|pink|orange|navy|purple|yellow)\s+(?:background|page|canvas)\b/i)?.[1]
      || t.match(/\b(cream|brown|black|white|blue|red|green|teal|pink|orange|navy|purple|yellow)\s+background\b/i)?.[1]
      || ''
    );
    const colorWord = bgColorExplicit
      || (
        /\b(?:glow|accent|gradient|tint)\b/i.test(t)
          ? ''
          : t.match(/\b(brown|black|white|blue|red|green|teal|pink|orange|navy|cream|purple|yellow)\b/i)?.[1]
      );
    if (colorWord && (bgColorExplicit || /\bbackground\b/i.test(t))) {
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
          /brown|chocolate|sienna/i.test(colorWord) ? '#8b4513'
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
        const short = want.length === 7 ? `#${want[1]}${want[3]}${want[5]}` : '';
        if (want && !bgHay.includes(want) && !(short && bgHay.includes(short))) {
          missing.push(`${colorWord.toLowerCase()} background`);
        }
      }
    }
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
  return [
    {
      path: 'src/App.jsx',
      content: `import './App.css';

export default function App() {
  return <div className="app" aria-label="Blank page" />;
}
`,
    },
    {
      path: 'src/App.css',
      content: `.app {
  min-height: 100vh;
  margin: 0;
  background: ${color};
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
  const t = head;
  // Full product / marketing / quiet-luxury creates are never a blank color wipe.
  // But explicit blank/empty intent always wins.
  const blankIntent = /\b(?:blank|nothing else|nothing but|empty(?:\s+canvas)?|zero\s+ui|no (?:nav|text|icons?|words?|ui|chrome|buttons?)|just (?:a )?(?:solid|pure|flat|basic)|white\s+background|black\s+background)\b/i.test(t);
  if (/\b(?:quiet[\s-]?luxury|landing(?:\s+page)?|marketing\s+site|scroll\s+to\s+reveal|product\s+marketing|serif|orb|features?|footer|discover|cta)\b/i.test(t)
    && !blankIntent) {
    return null;
  }
  // Follow-up asks that ADD content on an existing colored screen must not re-wipe to a blank shell.
  if (/\b(?:put|add|place|insert|write|show|center|centred)\b[\s\S]{0,64}\b(?:words?|text|title|headline|logo|icon|button|footer|nav|search|phrase|copy|wording)\b/i.test(t)) {
    return null;
  }
  if (/\b(?:words?|text|title|headline|phrase|wording)\b[\s\S]{0,48}\b(?:middle|center|centred|screen|viewport)\b/i.test(t)) {
    return null;
  }
  if (/\b(?:words?|text|phrase|wording)\b/i.test(t) && /\b(?:says?|reading|labeled|label)\b/i.test(t)) {
    return null;
  }
  // "white words" / "white text" is paint for copy — not a white blank shell.
  if (/\b(?:white|black)\s+(?:words?|text|title|headline|copy|phrase)\b/i.test(t)) {
    return null;
  }
  // "solid brown blank", "just a pure brown full-screen", "blank brown page",
  // "basic website … solid black background … nothing else", etc.
  const word = (
    t.match(/\b(?:solid|pure|just|blank|flat|basic|full[- ]?(?:screen|viewport|window)|premium|soft)\b[\s\S]{0,64}\b(brown|black|white|blue|red|green|teal|chocolate|sienna|pink|orange|yellow|cream|gr[ae]y)\b/i)?.[1]
    || t.match(/\b(brown|black|white|blue|red|green|teal|pink|orange|yellow|cream|gr[ae]y)\b[\s\S]{0,48}\b(?:blank|background|full[- ]?(?:screen|viewport|window)|nothing else|nothing but|empty(?:\s+canvas)?|zero\s+ui|no (?:nav|text|icons?|words?|ui|chrome|buttons?))\b/i)?.[1]
    || t.match(/\bnothing but\b[\s\S]{0,64}\b(brown|black|white|blue|red|green|teal|pink|orange|yellow|cream|gr[ae]y)\b/i)?.[1]
    || t.match(/\bcover\b[\s\S]{0,64}\b(brown|black|white|blue|red|green|teal|pink|orange|yellow|cream|gr[ae]y)\b/i)?.[1]
    // "blank website / blank localhost" with a color somewhere in the ask
    || (/\bblank\b[\s\S]{0,80}\b(?:website|site|page|localhost|app)\b/i.test(t)
      ? (t.match(/\b(brown|black|white|blue|red|green|teal|pink|orange|yellow|cream|gr[ae]y)\b/i)?.[1] || 'white')
      : '')
    || ''
  );
  if (!word) return null;
  // Prefer cream when both cream + white appear ("cream white").
  const resolved = /\bcream\b/i.test(t) && /white/i.test(word) ? 'cream' : word;
  // Require blank/minimal intent so normal "brown accent" asks don't wipe the site.
  // Do NOT treat "full viewport" alone as blank — premium heroes use that phrase constantly.
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
  // Full marketing / product homepage creates: never let surgical center-word win over model/shell writes.
  const marketingCreate = askLooksLikeMarketingOrProductHomepage(ask);

  // Blank solid color MUST win before cinematic / surgical — "just a solid black background,
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

  // Surgical add-word / logo / search asks must win before blank-shell wipe.
  const surgicalEarly = marketingCreate ? [] : reactSurgicalMicroAskEdits(files, message);
  if (surgicalEarly.length) {
    const microAsk = isWebMicroAsk(message)
      || /\b(?:add|put|place|insert|center|centred|words?|wording)\b/i.test(ask);
    if (microAsk) return surgicalEarly;
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
