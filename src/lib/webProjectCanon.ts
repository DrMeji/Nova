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

/** Deterministic patches for simple web asks. do not depend on the model. */
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

export function isWebMicroAsk(message: string): boolean {
  const t = String(message || '');
  if (!t.trim()) return false;
  if (/\b(build|create|make|scaffold)\b.{0,40}\b(app|website|site|page)\b/i.test(t) && /\bhello\s*world\b/i.test(t) === false) {
    // brand-new big builds are not micro. except hello world follow-ups with change verbs
  }
  if (/\bbackground\b/i.test(t) && /\b(black|white|blue|dark|red|green|teal)\b/i.test(t)) return true;
  if (/\b(rgb|multi[- ]?colou?r|multiple\s+colou?rs?|rainbow|gradient|teal)\b/i.test(t)) return true;
  if (/\bsearch\s*bar\b/i.test(t) || (/\bsearch\b/i.test(t) && /\b(top|corner|right|header|bar)\b/i.test(t))) return true;
  if (/\b(remove|delete)\b.{0,40}\b(toggle|theme)\b/i.test(t)) return true;
  if (/(?:change|rename|set|into).{0,48}(?:to|into)\s+["']?[A-Za-z0-9]/i.test(t)) return true;
  if (/\b(?:make|change|set|update)\b[\s\S]{0,48}\bbutton\b[\s\S]{0,40}\b(?:say|to|into|label)\b/i.test(t)) return true;
  if (/\b(?:hero|headline|heading|title)\b[\s\S]{0,40}\b(?:to|into|say)\b/i.test(t)) return true;
  if (/\bpizza\b/i.test(t) && /\b(change|saying|say|text|title|hello)\b/i.test(t)) return true;
  if (/\b(text|hello\s*world)\b.{0,40}\b(white|black|color)\b/i.test(t)) return true;
  if (/\b(logo|icon)\b/i.test(t) && /\b(add|put|place|center|middle|screen)\b/i.test(t)) return true;
  if (/\b(title\s*bar|sidebar|note\s*list|localStorage|new\s+note|new\s+page|ink\s+notes|column)\b/i.test(t)) return true;
  if (/\b(server\s+rail|channel\s+list|chat\s+pane|member\s+list|welcome\s+screen)\b/i.test(t)) return true;
  if (/\bcreate\s+project\b/i.test(t)) return true;
  if (/\bbadge\b/i.test(t) && /\b(text|label|to|into)\b/i.test(t)) return true;
  if (/\bequals?\s+button\b/i.test(t) && /\b(larger|bigger)\b/i.test(t)) return true;
  if (/\b(drop|remove|delete|fold)\b[\s\S]{0,80}\babout\b/i.test(t)) return true;
  if (/\bsticky\b/i.test(t) && /\b(ticket|cta|bottom)\b/i.test(t)) return true;
  if (/\bnav\b/i.test(t) && /\b(only|just)\b/i.test(t) && /\b(lineup|contact)\b/i.test(t)) return true;
  if (/\bschedule\s+page\b/i.test(t) || (/\b(add|create|new)\b[\s\S]{0,40}\bschedule\b/i.test(t))) return true;
  if (/\bwaitlist\b/i.test(t)) return true;
  if (/\bnight\s+flow\b/i.test(t)) return true;
  if (/\b(watchlist|orders?\s+tab|help\s+tab|add\s+symbol|buy\s+and\s+sell)\b/i.test(t)) return true;
  return false;
}

/** Surgical React SPA tweaks. must win over full kanban/finance rebuilds from project name. */
export function reactSurgicalMicroAskEdits(
  files: WebFileMap,
  message: string,
): WebFileEdit[] {
  const t = String(message || '');
  if (!t.trim()) return [];
  if (/\b(scrap|rebuild|from\s+scratch|scaffold\s+(?:a\s+)?new|replace\s+(?:the\s+)?(?:entire\s+)?(?:app|layout|ui)|start\s+over)\b/i.test(t)) {
    return [];
  }
  if (
    !isWebMicroAsk(t)
    && !/\b(rename|change|tint|make|update|finish|feel\s+finished|apply|badge|unread|syncing|connect\s+bank|folder\s+groups?|find\s+in\s+note|tags?\s+chips?|add|remove|delete|copyright|contact|footer|nav)\b/i.test(t)
  ) {
    return [];
  }

  const flat = flatten(files);
  const appPath = findReactAppPath(flat);
  if (!appPath || !flat[appPath]) return [];
  const cssPath = findReactCssPath(flat, appPath);
  let app = flat[appPath];
  let css = flat[cssPath] || '';
  let touchedApp = false;
  let touchedCss = false;

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
    || t.match(/rename\s+(?:the\s+)?([A-Za-z][A-Za-z0-9_-]*)\s+to\s+([A-Za-z][A-Za-z0-9_-]*)/i);
  if (col) {
    const from = col[1];
    const to = col[2];
    const labelRe = new RegExp(`(label:\\s*['"])${from}(['"])`, 'gi');
    if (labelRe.test(app)) {
      app = app.replace(new RegExp(`(label:\\s*['"])${from}(['"])`, 'gi'), `$1${to}$2`);
      touchedApp = true;
    }
    if (app.includes(`>${from}<`)) {
      app = app.replace(new RegExp(`(>)${from}(<)`, 'g'), `$1${to}$2`);
      touchedApp = true;
    }
  }

  const buttonLabelTo = (
    t.match(/\b(?:make|change|set|update)\b[\s\S]{0,48}\bbutton\b[\s\S]{0,48}\b(?:say|to|into|label)\s+["']?([A-Za-z0-9][A-Za-z0-9 ,.+'-]{1,60})/i)?.[1]
    || t.match(/\bbutton\b[\s\S]{0,24}\blabel\b[\s\S]{0,24}\b(?:say|to|into)\s+["']?([A-Za-z0-9][A-Za-z0-9 ,.+'-]{1,60})/i)?.[1]
    || null
  )?.trim()?.replace(/[.,;:]+$/, '');
  if (buttonLabelTo) {
    const safe = buttonLabelTo.replace(/[`$'"]/g, '');
    const fromHint = t.match(/\b(?:start|begin|submit|save|continue|next|login|sign\s*up|pause|reset|primary)\b/i)?.[0];
    if (fromHint && new RegExp(`>(\\s*)${fromHint}(?:\\s+action)?(\\s*)<`, 'i').test(app)) {
      app = app.replace(new RegExp(`>(\\s*)${fromHint}(?:\\s+action)?(\\s*)<`, 'i'), `>${safe}<`);
      touchedApp = true;
    } else if (/>Primary action</i.test(app)) {
      app = app.replace(/>Primary action</i, `>${safe}<`);
      touchedApp = true;
    } else if (/<button\b[^>]*>[\s\S]*?<\/button>/i.test(app)) {
      app = app.replace(/(<button\b[^>]*>)([\s\S]*?)(<\/button>)/i, `$1${safe}$3`);
      touchedApp = true;
    }
  }

  const titleTo = (
    t.match(/(?:change|rename|set).{0,48}(?:top\s+title|hero|headline|heading|title|h1).{0,32}(?:to|into)\s+["']?([A-Za-z0-9][A-Za-z0-9 ,.+'-]{1,60})/i)?.[1]
    || null
  )?.trim()?.replace(/[.,;:]+$/, '');
  if (titleTo && !buttonLabelTo) {
    const safe = titleTo.replace(/[`$'"]/g, '');
    if (/<h1[\s>]/i.test(app)) {
      app = app.replace(/(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i, `$1${safe}$3`);
      touchedApp = true;
    } else if (/className=["'][^"']*(?:title|hero|brand|heading)[^"']*["'][^>]*>/i.test(app)) {
      app = app.replace(/(className=["'][^"']*(?:title|hero|brand|heading)[^"']*["'][^>]*>)([^<]{1,80})/i, `$1${safe}`);
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

  if (/\bteal\b/i.test(t) || (/\bbackground\b/i.test(t) && /\b(gradient|tint|deep)\b/i.test(t))) {
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

  const out: WebFileEdit[] = [];
  if (touchedApp) out.push({ path: appPath, content: app });
  if (touchedCss) out.push({ path: cssPath, content: css });
  if (out.length) return out;

  return [];
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
  _opts?: { projectName?: string },
): WebFileEdit[] {
  // Only patch what already exists. Never invent todo/notes/discord/kanban/finance shells.
  const arcade = arcadeGameMicroAskEdits(files, message);
  if (arcade.length) return arcade;
  return reactSurgicalMicroAskEdits(files, message);
}

export function finalizeWebEdits(
  files: WebFileMap,
  message: string,
  modelEdits: WebFileEdit[],
  opts?: { projectName?: string },
): WebFileEdit[] {
  const remapped = canonicalizeWebEdits(modelEdits, files);

  // Model already shipped a real App / page dump — never let nav/footer keyword micro-patches
  // replace a full create/UI rewrite (create briefs often say "nav" + "footer").
  const ask = String(message || '');
  const exactMinimal = /\b(?:exact(?:ly)?|precisely|follow precisely|pure black|#000000|centered icon|nothing else|no other)\b/i.test(ask);
  const appMin = exactMinimal ? 160 : 400;
  const substantialModel = remapped.some((e) => {
    const p = String(e.path || '').replace(/\\/g, '/');
    const n = String(e.content || '').length;
    if (/(?:^|\/)App\.(jsx|tsx)$/i.test(p) && n >= appMin) return true;
    if (/(?:^|\/)index\.html$/i.test(p) && n >= 400) return true;
    return false;
  });
  if (substantialModel) return remapped;

  // Surgical tweaks first. never let project-name full rebuilds clobber them.
  const surgical = reactSurgicalMicroAskEdits(files, message);
  if (surgical.length) return surgical;

  const reactMicro = reactUiMicroAskEdits(files, message, opts);
  if (reactMicro.length) return reactMicro;

  const micro = isWebMicroAsk(message) ? webMicroAskEdits(files, message) : [];

  if (micro.length) {
    // Micro-asks: local patch only. models often write the wrong tree and still "succeed".
    return micro;
  }

  if (remapped.length && touchesPreviewServing(remapped.map(e => e.path), files)) {
    return remapped;
  }

  // Model only hit junk / nothing previewable. keep remapped if any, else empty (caller may scaffold).
  return remapped;
}
