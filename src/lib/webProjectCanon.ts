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
    if (base === 'ark-chat.json' || base === 'ark-meta.json') continue;
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
  else if (flat['ark-preview.html']?.trim()) htmlPath = 'ark-preview.html';
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
  if (/white/i.test(name)) return '#ffffff';
  if (/blue/i.test(name)) return '#2563eb';
  if (/red/i.test(name)) return '#dc2626';
  if (/green/i.test(name)) return '#16a34a';
  if (/yellow/i.test(name)) return '#eab308';
  if (/purple|violet/i.test(name)) return '#7c3aed';
  return null;
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

/** Deterministic patches for simple web asks — do not depend on the model. */
export function webMicroAskEdits(files: WebFileMap, message: string): WebFileEdit[] {
  const t = String(message || '');
  const flat = flatten(files);
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

  const colorWord = t.match(/\b(black|white|blue|dark|red|green|yellow|purple|violet)\b/i)?.[1];
  const wantsBg = /\bbackground\b/i.test(t) && Boolean(colorWord);
  const wantsTextColor = /\b(text|words?|title|heading|hello\s*world)\b.{0,48}\b(white|black|color|colour)\b|\b(white|black)\s+(color|colour|text)\b/i.test(t);
  const wantsRgb = /\b(rgb|multi[- ]?colou?r|multiple\s+colou?rs?|rainbow|gradient)\b/i.test(t);
  const wantsSearchBar = /\bsearch\s*bar\b/i.test(t)
    || (/\bsearch\b/i.test(t) && /\b(top|corner|right|header|bar)\b/i.test(t));
  const wantsRemoveToggle = /\b(remove|delete|get rid of)\b.{0,40}\b(toggle|theme)\b/i.test(t)
    || /\b(toggle\s*theme)\b/i.test(t) && /\b(remove|delete)\b/i.test(t);
  const renameTo = t.match(/(?:change|rename|set|into).{0,48}(?:to|into)\s+["']?([A-Za-z0-9][A-Za-z0-9 .+-]{1,40})/i)?.[1]?.trim()
    || t.match(/(?:saying|say)\s+["']?([A-Za-z0-9][A-Za-z0-9 .+-]{1,40})/i)?.[1]?.trim()
    || (/\bpizza\b/i.test(t) ? 'I like pizza' : null);

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
    } else {
      html = html.replace(/<main[^>]*>/i, `$&\n    <h1>${safe}</h1>`);
    }
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${safe}</title>`);
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
    if (!/id=["']ark-search["']/i.test(html) && !/class=["'][^"']*search-bar/i.test(html)) {
      const bar = `
  <header class="top-bar" aria-label="Toolbar">
    <label class="search-bar" for="ark-search">
      <span class="search-bar-icon" aria-hidden="true">⌕</span>
      <input id="ark-search" type="search" placeholder="Search…" autocomplete="off" />
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
document.getElementById('ark-search')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.preventDefault();
});
`;
    }
    // Ensure title still centered
    void heading;
    touched = true;
  }

  if (!touched) return [];

  out.push({ path: htmlPath, content: html });
  if (css !== css0 || wantsBg || wantsRgb || wantsTextColor || wantsSearchBar) {
    out.push({ path: cssPath, content: css || '/* styles */\n' });
  }
  if (js !== js0 || wantsRemoveToggle || wantsSearchBar) {
    out.push({ path: jsPath, content: js || 'document.documentElement.dataset.arkReady = \'1\';\n' });
  }
  return out;
}

export function isWebMicroAsk(message: string): boolean {
  const t = String(message || '');
  if (!t.trim()) return false;
  if (/\b(build|create|make|scaffold)\b.{0,40}\b(app|website|site|page)\b/i.test(t) && /\bhello\s*world\b/i.test(t) === false) {
    // brand-new big builds are not micro — except hello world follow-ups with change verbs
  }
  if (/\bbackground\b/i.test(t) && /\b(black|white|blue|dark|red|green)\b/i.test(t)) return true;
  if (/\b(rgb|multi[- ]?colou?r|multiple\s+colou?rs?|rainbow|gradient)\b/i.test(t)) return true;
  if (/\bsearch\s*bar\b/i.test(t) || (/\bsearch\b/i.test(t) && /\b(top|corner|right|header|bar)\b/i.test(t))) return true;
  if (/\b(remove|delete)\b.{0,40}\b(toggle|theme)\b/i.test(t)) return true;
  if (/(?:change|rename|set|into).{0,48}(?:to|into)\s+["']?[A-Za-z0-9]/i.test(t)) return true;
  if (/\bpizza\b/i.test(t) && /\b(change|saying|say|text|title|hello)\b/i.test(t)) return true;
  if (/\b(text|hello\s*world)\b.{0,40}\b(white|black|color)\b/i.test(t)) return true;
  if (/\b(logo|icon)\b/i.test(t) && /\b(add|put|place|center|middle|screen)\b/i.test(t)) return true;
  if (/\b(title\s*bar|sidebar|note\s*list|localStorage|new\s+note)\b/i.test(t)) return true;
  if (/\b(server\s+rail|channel\s+list|chat\s+pane|member\s+list|welcome\s+screen)\b/i.test(t)) return true;
  if (/\bcreate\s+project\b/i.test(t)) return true;
  return false;
}

function findReactAppPath(flat: WebFileMap): string | null {
  if (flat['src/App.jsx'] != null) return 'src/App.jsx';
  if (flat['src/App.tsx'] != null) return 'src/App.tsx';
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

/** Discord-ish mark as inline SVG (works offline; no external image dependency). */
const DISCORD_STYLE_LOGO_SVG = `<svg className="ark-logo" viewBox="0 0 127.14 96.36" aria-hidden="true" role="img">
  <path fill="#5865F2" d="M107.7 8.07A105.15 105.15 0 0 0 81.07 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.23 0 105.89 105.89 0 0 0 18.39 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.16c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.18 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"/>
</svg>`;

/**
 * When the user pastes several project prompts, only use the segment that
 * mentions this project — so NightChat's Discord text cannot patch TaskBox.
 */
function segmentForProject(message: string, projectName: string): string {
  const full = String(message || '');
  const name = String(projectName || '').trim();
  if (!name || !full) return full;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Prefer a numbered list item / line that starts with the project name.
  const lineRe = new RegExp(
    `(?:^|\\n)\\s*(?:\\d+[.)]\\s*)?(?:[-*]\\s*)?${escaped}\\b[\\s\\S]*?(?=\\n\\s*(?:\\d+[.)]\\s*)?(?:[-*]\\s*)?[A-Z][A-Za-z0-9_-]{2,}\\b|$)`,
    'i',
  );
  const lineHit = full.match(lineRe)?.[0]?.trim();
  if (lineHit && lineHit.length > name.length + 8) return lineHit;
  // Fallback: from the project name to the next ALLCAPS-ish project title.
  const idx = full.search(new RegExp(`\\b${escaped}\\b`, 'i'));
  if (idx < 0) return full;
  const from = full.slice(idx);
  const next = from.slice(name.length).search(/\n\s*(?:\d+[.)]\s*)?(?:[-*]\s*)?[A-Z][A-Za-z0-9_-]{2,}\b/);
  return (next >= 0 ? from.slice(0, name.length + next) : from).trim() || full;
}

function notesShellCss(): string {
  return `html, body, #root {
  margin: 0;
  min-height: 100%;
  height: 100%;
}

* { box-sizing: border-box; }

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1e1f22;
  color: #f2f3f5;
  font-family: system-ui, Segoe UI, sans-serif;
}

.titlebar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid #2b2d31;
  background: #111214;
}

.titlebar-hint {
  color: #949ba4;
  font-size: 0.8rem;
}

.shell {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
}

.sidebar {
  border-right: 1px solid #2b2d31;
  background: #2b2d31;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sidebar-tools {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
}

.primary {
  border: 0;
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  background: #5865f2;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.search {
  border: 1px solid #3f4147;
  border-radius: 8px;
  padding: 0.45rem 0.65rem;
  background: #1e1f22;
  color: inherit;
}

.note-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0.5rem 1rem;
  overflow: auto;
}

.note-item {
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 0.15rem;
}

.note-item:hover { background: #35373c; }
.note-item.active { background: #404249; }

.note-title { font-weight: 600; font-size: 0.9rem; }
.note-preview { color: #949ba4; font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 1rem 1.25rem 1.25rem;
  background: #1e1f22;
}

.editor-title {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 1.4rem;
  font-weight: 700;
  padding: 0.25rem 0;
  margin-bottom: 0.75rem;
  outline: none;
}

.done-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #949ba4;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}

.editor-body {
  flex: 1;
  min-height: 280px;
  border: 1px solid #2b2d31;
  border-radius: 12px;
  background: #111214;
  color: inherit;
  padding: 1rem;
  resize: none;
  font: inherit;
  line-height: 1.5;
  outline: none;
}

.empty { color: #949ba4; }
`;
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
  const projectName = String(opts?.projectName || '').trim();
  const t = segmentForProject(String(message || ''), projectName);
  const flat = flatten(files);
  let appPath = findReactAppPath(flat);

  const nameKey = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  // Project name wins over other prompts in the same paste.
  const kindForced = ((): 'todo' | 'notes' | 'discord' | 'weather' | 'coffee' | null => {
    if (/taskbox|todobox/.test(nameKey) || (/^todo/.test(nameKey) && !/discord|night/.test(nameKey))) return 'todo';
    if (/pixelpad|noteark|stickynotes?/.test(nameKey)) return 'notes';
    if (/discord|nightchat|discorddesk/.test(nameKey)) return 'discord';
    if (/weather/.test(nameKey)) return 'weather';
    if (/brewdesk|coffee/.test(nameKey)) return 'coffee';
    if (/task/.test(nameKey) && /box|list|todo/.test(nameKey)) return 'todo';
    return null;
  })();

  const wantsLogo = /\b(logo|icon)\b/i.test(t) && /\b(add|put|place|create|insert|center|middle|screen)\b/i.test(t);
  const wantsCenter = /\b(center|middle)\b/i.test(t) && /\b(screen|page|app|logo|icon)\b/i.test(t)
    && !/\b(sidebar|note|editor|title\s*bar|task|channel)\b/i.test(t);
  const wantsNotesLayout = (
    /\b(title\s*bar|sidebar|note\s*list|main\s+editor|sticky\s*notes?|notes?\s+app)\b/i.test(t)
    || (/\b(new\s+note|searchable|localStorage)\b/i.test(t) && /\b(note|list|sidebar|button)\b/i.test(t))
  );
  const wantsTodoLayout = (
    /\b(todo|task\s*list|add\s+task)\b/i.test(t)
    || (/\btask\b/i.test(t) && /\b(list|editor|localStorage|button)\b/i.test(t))
  );
  const wantsDiscordLayout = (
    /\b(server\s+rail|channel\s+list|chat\s+pane|member\s+list|welcome\s+screen)\b/i.test(t)
    || (/\bdiscord\b/i.test(t) && /\b(layout|channels?|sidebar|chat)\b/i.test(t))
  );
  const wantsWeatherLayout = /\bweather\b/i.test(t) && /\b(dashboard|search|temperature|city)\b/i.test(t);
  const wantsCoffeeLayout = /\b(coffee|brew|menu|order\s+now|hero)\b/i.test(t);

  let kind: 'todo' | 'notes' | 'discord' | 'weather' | 'coffee' | 'logo' | null = kindForced;
  if (!kind) {
    if (wantsTodoLayout) kind = 'todo';
    else if (wantsDiscordLayout) kind = 'discord';
    else if (wantsNotesLayout) kind = 'notes';
    else if (wantsWeatherLayout) kind = 'weather';
    else if (wantsCoffeeLayout) kind = 'coffee';
    else if (wantsLogo || wantsCenter) kind = 'logo';
  }

  // Hard block: never apply Discord UI to a non-Discord project name.
  if (kind === 'discord' && projectName && !/discord|nightchat/i.test(projectName)) {
    kind = wantsTodoLayout ? 'todo' : wantsNotesLayout ? 'notes' : null;
  }

  if (!kind) return [];

  // Empty sticky map (after reload) — still patch the standard Vite React paths.
  if (!appPath) {
    const looksVite = Object.keys(flat).some(p => /vite\.config|package\.json|src\//i.test(p));
    if (looksVite || Object.keys(flat).length === 0) {
      appPath = 'src/App.jsx';
    } else {
      return [];
    }
  }

  const cssPath = findReactCssPath(flat, appPath);
  const out: WebFileEdit[] = [];
  const title = escapeHtml(projectName || 'App');

  if (kind === 'todo') {
    const jsx = `import { useEffect, useMemo, useState } from 'react';
import './App.css';

const STORAGE_KEY = 'ark-tasks-v1';

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* ignore */
  }
  return [{ id: '1', title: 'Welcome', body: 'Add your first task…', done: false }];
}

export default function App() {
  const [tasks, setTasks] = useState(loadTasks);
  const [activeId, setActiveId] = useState(() => loadTasks()[0]?.id || '1');
  const [query, setQuery] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(n =>
      String(n.title || '').toLowerCase().includes(q)
      || String(n.body || '').toLowerCase().includes(q)
    );
  }, [tasks, query]);

  const active = tasks.find(n => n.id === activeId) || tasks[0] || null;

  const addTask = () => {
    const id = String(Date.now());
    const next = [{ id, title: 'New task', body: '', done: false }, ...tasks];
    setTasks(next);
    setActiveId(id);
  };

  const updateActive = (patch) => {
    if (!active) return;
    setTasks(tasks.map(n => (n.id === active.id ? { ...n, ...patch } : n)));
  };

  return (
    <div className="app">
      <header className="titlebar">
        <strong>${title}</strong>
        <span className="titlebar-hint">Todo</span>
      </header>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-tools">
            <button type="button" className="primary" onClick={addTask}>Add Task</button>
            <input
              className="search"
              type="search"
              placeholder="Search tasks…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="note-list">
            {filtered.map(n => (
              <li key={n.id}>
                <button
                  type="button"
                  className={n.id === active?.id ? 'note-item active' : 'note-item'}
                  onClick={() => setActiveId(n.id)}
                >
                  <span className="note-title">{n.done ? '✓ ' : ''}{n.title || 'Untitled'}</span>
                  <span className="note-preview">{(n.body || '').slice(0, 48) || 'Empty task'}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <main className="editor">
          {active ? (
            <>
              <input
                className="editor-title"
                value={active.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                placeholder="Task title"
              />
              <label className="done-row">
                <input
                  type="checkbox"
                  checked={Boolean(active.done)}
                  onChange={(e) => updateActive({ done: e.target.checked })}
                />
                Done
              </label>
              <textarea
                className="editor-body"
                value={active.body}
                onChange={(e) => updateActive({ body: e.target.value })}
                placeholder="Details…"
              />
            </>
          ) : (
            <p className="empty">Add a task to get started.</p>
          )}
        </main>
      </div>
    </div>
  );
}
`;
    const css = notesShellCss();
    out.push({ path: appPath, content: jsx });
    out.push({ path: cssPath, content: css });
    return out;
  }

  if (kind === 'discord') {
    const jsx = `import { useState } from 'react';
import './App.css';

const SERVERS = [{ id: 's1', label: 'D' }];
const CHANNELS = [
  { id: 'c1', name: 'general' },
  { id: 'c2', name: 'random' },
];
const MEMBERS = ['You', 'Ark Bot', 'Guest'];

export default function App() {
  const [channelId, setChannelId] = useState(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);

  const channel = CHANNELS.find(c => c.id === channelId) || null;

  const send = () => {
    const text = draft.trim();
    if (!text || !channel) return;
    setMessages(prev => [...prev, { id: String(Date.now()), channelId: channel.id, author: 'You', text }]);
    setDraft('');
  };

  return (
    <div className="desk">
      <aside className="servers" aria-label="Servers">
        {SERVERS.map(s => (
          <button key={s.id} type="button" className="server-btn" title="${title}">{s.label}</button>
        ))}
      </aside>
      <aside className="channels" aria-label="Channels">
        <p className="channels-title">${title}</p>
        <ul>
          {CHANNELS.map(c => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === channelId ? 'channel active' : 'channel'}
                onClick={() => setChannelId(c.id)}
              >
                # {c.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="chat">
        {!channel ? (
          <div className="welcome">
            ${DISCORD_STYLE_LOGO_SVG}
            <h1>Welcome</h1>
            <p>Pick a channel to start chatting.</p>
          </div>
        ) : (
          <>
            <header className="chat-header"># {channel.name}</header>
            <div className="messages">
              {messages.filter(m => m.channelId === channel.id).map(m => (
                <div key={m.id} className="msg">
                  <strong>{m.author}</strong>
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
            <div className="composer">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send(); }}
                placeholder={\`Message #\${channel.name}\`}
              />
              <button type="button" onClick={send}>Send</button>
            </div>
          </>
        )}
      </main>
      <aside className="members" aria-label="Members">
        <p className="members-title">Members</p>
        <ul>
          {MEMBERS.map(name => <li key={name}>{name}</li>)}
        </ul>
      </aside>
    </div>
  );
}
`;

    const css = `html, body, #root { margin: 0; height: 100%; }
* { box-sizing: border-box; }
.desk {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 72px 220px 1fr 200px;
  background: #313338;
  color: #f2f3f5;
  font-family: system-ui, Segoe UI, sans-serif;
}
.servers { background: #1e1f22; padding: 0.75rem 0; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.server-btn {
  width: 48px; height: 48px; border: 0; border-radius: 16px;
  background: #5865f2; color: #fff; font-weight: 700; cursor: pointer;
}
.channels { background: #2b2d31; padding: 0.75rem; }
.channels-title { margin: 0 0 0.75rem; font-weight: 700; }
.channels ul, .members ul { list-style: none; margin: 0; padding: 0; }
.channel {
  width: 100%; text-align: left; border: 0; border-radius: 6px;
  padding: 0.45rem 0.55rem; background: transparent; color: #dbdee1; cursor: pointer;
}
.channel:hover, .channel.active { background: #404249; color: #fff; }
.chat { display: flex; flex-direction: column; min-width: 0; background: #313338; }
.chat-header { padding: 0.85rem 1rem; border-bottom: 1px solid #1e1f22; font-weight: 700; }
.messages { flex: 1; overflow: auto; padding: 1rem; display: grid; gap: 0.75rem; align-content: start; }
.msg { display: grid; gap: 0.15rem; }
.msg strong { font-size: 0.9rem; }
.composer { display: flex; gap: 0.5rem; padding: 0.75rem 1rem 1rem; }
.composer input {
  flex: 1; border: 0; border-radius: 8px; padding: 0.7rem 0.85rem;
  background: #383a40; color: inherit; outline: none;
}
.composer button {
  border: 0; border-radius: 8px; padding: 0 1rem; background: #5865f2; color: #fff; font-weight: 600; cursor: pointer;
}
.welcome {
  flex: 1; display: grid; place-content: center; justify-items: center; gap: 0.75rem; text-align: center;
}
.welcome h1 { margin: 0; }
.welcome p { margin: 0; color: #b5bac1; }
.ark-logo { width: min(160px, 40vw); height: auto; }
.members { background: #2b2d31; padding: 0.75rem; }
.members-title { margin: 0 0 0.75rem; font-weight: 700; color: #949ba4; font-size: 0.75rem; text-transform: uppercase; }
.members li { padding: 0.35rem 0.25rem; color: #dbdee1; }
`;

    out.push({ path: appPath, content: jsx });
    out.push({ path: cssPath, content: css });
    return out;
  }

  // Weather / coffee layouts are not hard-coded here yet — leave to model/scaffold.
  if (kind === 'weather' || kind === 'coffee') return [];

  if (kind === 'notes') {
    const noteTitle = escapeHtml(
      projectName
      || t.match(/\b(?:called|named)\s+([A-Za-z][A-Za-z0-9_-]{1,24})/i)?.[1]
      || 'Notes',
    );
    const jsx = `import { useEffect, useMemo, useState } from 'react';
import './App.css';

const STORAGE_KEY = 'ark-notes-v1';

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* ignore */
  }
  return [{ id: '1', title: 'Welcome', body: 'Write your first note…' }];
}

export default function App() {
  const [notes, setNotes] = useState(loadNotes);
  const [activeId, setActiveId] = useState(() => loadNotes()[0]?.id || '1');
  const [query, setQuery] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(n =>
      String(n.title || '').toLowerCase().includes(q)
      || String(n.body || '').toLowerCase().includes(q)
    );
  }, [notes, query]);

  const active = notes.find(n => n.id === activeId) || notes[0] || null;

  const addNote = () => {
    const id = String(Date.now());
    const next = [{ id, title: 'New note', body: '' }, ...notes];
    setNotes(next);
    setActiveId(id);
  };

  const updateActive = (patch) => {
    if (!active) return;
    setNotes(notes.map(n => (n.id === active.id ? { ...n, ...patch } : n)));
  };

  return (
    <div className="app">
      <header className="titlebar">
        <strong>${noteTitle}</strong>
        <span className="titlebar-hint">Sticky notes</span>
      </header>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-tools">
            <button type="button" className="primary" onClick={addNote}>New Note</button>
            <input
              className="search"
              type="search"
              placeholder="Search notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="note-list">
            {filtered.map(n => (
              <li key={n.id}>
                <button
                  type="button"
                  className={n.id === active?.id ? 'note-item active' : 'note-item'}
                  onClick={() => setActiveId(n.id)}
                >
                  <span className="note-title">{n.title || 'Untitled'}</span>
                  <span className="note-preview">{(n.body || '').slice(0, 48) || 'Empty note'}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <main className="editor">
          {active ? (
            <>
              <input
                className="editor-title"
                value={active.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                placeholder="Title"
              />
              <textarea
                className="editor-body"
                value={active.body}
                onChange={(e) => updateActive({ body: e.target.value })}
                placeholder="Start typing…"
              />
            </>
          ) : (
            <p className="empty">Create a note to get started.</p>
          )}
        </main>
      </div>
    </div>
  );
}
`;

    const css = notesShellCss();

    out.push({ path: appPath, content: jsx });
    out.push({ path: cssPath, content: css });
    return out;
  }

  if (kind !== 'logo') return [];

  const disco = /\b(discord|disco)\b/i.test(t);
  const jsx = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <div className="logo-stage" aria-label="${disco ? 'Discord logo' : 'Logo'}">
        ${disco ? DISCORD_STYLE_LOGO_SVG : `<div className="ark-logo-fallback">${escapeHtml(t.match(/\b([A-Z][A-Za-z0-9-]{1,20})\s+logo\b/i)?.[1] || 'Logo')}</div>`}
      </div>
    </div>
  );
}
`;

  const css = `html, body, #root {
  margin: 0;
  min-height: 100%;
}

.app {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e1f22;
}

.logo-stage {
  display: flex;
  align-items: center;
  justify-content: center;
}

.ark-logo {
  width: min(200px, 42vw);
  height: auto;
  display: block;
}

.ark-logo-fallback {
  width: min(200px, 42vw);
  height: min(200px, 42vw);
  border-radius: 28%;
  background: #5865F2;
  color: #fff;
  font: 700 1.25rem/1 system-ui, sans-serif;
  display: grid;
  place-items: center;
}
`;

  out.push({ path: appPath, content: jsx });
  out.push({ path: cssPath, content: css });
  return out;
}

/**
 * Prefer remapped model edits; if they miss the live preview tree (or ask is micro),
 * merge deterministic local patches onto canonical files.
 */
export function finalizeWebEdits(
  files: WebFileMap,
  message: string,
  modelEdits: WebFileEdit[],
  opts?: { projectName?: string },
): WebFileEdit[] {
  const remapped = canonicalizeWebEdits(modelEdits, files);
  const reactMicro = reactUiMicroAskEdits(files, message, opts);
  if (reactMicro.length) return reactMicro;

  const micro = isWebMicroAsk(message) ? webMicroAskEdits(files, message) : [];

  if (micro.length) {
    // Micro-asks: local patch only — models often write the wrong tree and still "succeed".
    return micro;
  }

  if (remapped.length && touchesPreviewServing(remapped.map(e => e.path), files)) {
    return remapped;
  }

  // Model only hit junk / nothing previewable — keep remapped if any, else empty (caller may scaffold).
  return remapped;
}
