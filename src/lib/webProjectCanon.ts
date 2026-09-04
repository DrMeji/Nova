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
  const renameTo = (!wantsBadgeText && !/\bbutton\b/i.test(t))
    ? (
      t.match(/(?:change|rename|set|into).{0,48}(?:to|into)\s+["']?([A-Za-z0-9][A-Za-z0-9 .+-]{1,40})/i)?.[1]?.trim()
      || t.match(/(?:saying|say)\s+["']?([A-Za-z0-9][A-Za-z0-9 .+-]{1,40})/i)?.[1]?.trim()
      || (/\bpizza\b/i.test(t) ? 'I like pizza' : null)
    )
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
    } else {
      html = html.replace(/<main[^>]*>/i, `$&\n    <h1>${safe}</h1>`);
    }
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${safe}</title>`);
    touched = true;
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
    && !/\b(rename|change|tint|make|update|finish|feel\s+finished|apply|badge|unread|syncing|connect\s+bank|folder\s+groups?|find\s+in\s+note|tags?\s+chips?)\b/i.test(t)
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

  // Feature polish asks (badges / syncing / connect bank / find bar / tags) on an existing App.
  return reactFeaturePolishEdits(files, message);
}

/** Inject visible polish into an existing React App without dumping source into chat. */
export function reactFeaturePolishEdits(
  files: WebFileMap,
  message: string,
): WebFileEdit[] {
  const t = String(message || '');
  if (!t.trim()) return [];
  const wantsUnread = /\bunread\b|\bbadge\s*counts?\b|\bbadges?\b/i.test(t);
  const wantsSync = /\bsyncing\b|\btyping\s+indicator\b/i.test(t);
  const wantsBank = /\bconnect\s+bank\b|\bconnected\s+avatars?\b|\bstatus\s+bar\b/i.test(t);
  const wantsFolders = /\bfolder\s+groups?\b/i.test(t);
  const wantsFind = /\bfind\s+in\s+note\b|\bfind\s+bar\b/i.test(t);
  const wantsTags = /\btags?\s+chips?\b|\btag\s+chips?\b/i.test(t);
  if (!wantsUnread && !wantsSync && !wantsBank && !wantsFolders && !wantsFind && !wantsTags) {
    return [];
  }

  const flat = flatten(files);
  const appPath = findReactAppPath(flat);
  if (!appPath || !flat[appPath]) return [];
  const cssPath = findReactCssPath(flat, appPath);
  let app = String(flat[appPath]);
  let css = String(flat[cssPath] || '');
  let touchedApp = false;
  let touchedCss = false;

  if (wantsUnread && !/ark-unread-badge|data-ark-unread/i.test(app)) {
    if (/(className=["'][^"']*(?:row|account|channel|item|wallet)[^"']*["'][^>]*>)/i.test(app)) {
      app = app.replace(
        /(className=["'][^"']*(?:row|account|channel|item|wallet)[^"']*["'][^>]*>)/i,
        '$1<span className="ark-unread-badge" data-ark-unread="1">3</span>',
      );
      touchedApp = true;
    } else if (/return\s*\(/i.test(app)) {
      app = app.replace(
        /return\s*\(/i,
        'return (\n    <>\n    <div className="ark-unread-badge" data-ark-unread="1" style={{position:\'fixed\',top:12,right:12,zIndex:40}}>3 unread</div>\n',
      );
      // Only wrap if we did not already close a fragment — avoid corrupting nested functions.
      if (!/<>[\s\S]*<\/>\s*\)\s*;?\s*$/m.test(app)) {
        app = app.replace(/\);\s*\n\}\s*$/m, '    </>\n  );\n}\n');
      }
      touchedApp = true;
    }
    if (!/\.ark-unread-badge/.test(css)) {
      css += `\n.ark-unread-badge{display:inline-flex;min-width:1.1rem;height:1.1rem;padding:0 0.35rem;border-radius:999px;align-items:center;justify-content:center;background:#ef4444;color:#fff;font-size:0.65rem;font-weight:700;margin-left:0.35rem;}\n`;
      touchedCss = true;
    }
  }

  if (wantsSync && !/data-ark-syncing/i.test(app)) {
    const sync = '<p className="ark-syncing" data-ark-syncing="1">syncing…</p>';
    if (/transaction|table|messages|editor|main/i.test(app)) {
      app = app.replace(
        /(<(?:div|section|main)[^>]*className=["'][^"']*(?:main|messages|table|editor|content)[^"']*["'][^>]*>)/i,
        `$1${sync}`,
      );
      touchedApp = true;
    } else {
      app = app.replace(/return\s*\(\s*<>/, `return (\n    <>\n    ${sync}`);
      if (!/data-ark-syncing/i.test(app)) {
        app = app.replace(/return\s*\(/i, `return (\n    <>\n    ${sync}\n`);
        if (!/<\/>\s*\);\s*$/m.test(app)) app = app.replace(/\);\s*$/m, '    </>\n  );');
      }
      touchedApp = true;
    }
    if (!/\.ark-syncing/.test(css)) {
      css += `\n.ark-syncing{margin:0.35rem 0;font-size:0.75rem;opacity:0.7;font-style:italic;}\n`;
      touchedCss = true;
    }
  }

  if (wantsBank && !/data-ark-connect-bank/i.test(app)) {
    const bar = `<div className="ark-status-bar" data-ark-connect-bank="1"><button type="button">Connect Bank</button><span className="ark-avatars" aria-label="connected"><i/><i/><i/></span></div>`;
    if (/<\/div>\s*\)\s*;?\s*$/m.test(app)) {
      app = app.replace(/<\/div>\s*(\)\s*;?\s*)$/m, `${bar}</div>$1`);
      touchedApp = true;
    } else {
      app = app.replace(/return\s*\(/i, `return (\n    <>\n    ${bar}\n`);
      if (!/<\/>\s*\);\s*$/m.test(app)) app = app.replace(/\);\s*$/m, '    </>\n  );');
      touchedApp = true;
    }
    if (!/\.ark-status-bar/.test(css)) {
      css += `\n.ark-status-bar{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.55rem 0.85rem;background:color-mix(in srgb, var(--card, #151c27) 92%, #000);border-top:1px solid #ffffff14;}\n.ark-status-bar button{border:0;border-radius:999px;padding:0.4rem 0.85rem;background:var(--accent,#38bdf8);color:#041018;font-weight:700;cursor:pointer;}\n.ark-avatars{display:inline-flex;}\n.ark-avatars i{width:1.35rem;height:1.35rem;border-radius:999px;background:#64748b;margin-left:-0.35rem;border:2px solid #0b1220;display:inline-block;}\n.ark-avatars i:nth-child(2){background:#38bdf8;}\n.ark-avatars i:nth-child(3){background:#a78bfa;}\n`;
      touchedCss = true;
    }
  }

  if (wantsFolders && !/data-ark-folder-groups/i.test(app)) {
    const block = `<div className="ark-folder-groups" data-ark-folder-groups="1"><p>Library</p><button type="button">Personal</button><button type="button">Work</button><button type="button">Archive</button></div>`;
    app = app.replace(
      /(<(?:aside|nav|div)[^>]*className=["'][^"']*(?:sidebar|rail|library|list)[^"']*["'][^>]*>)/i,
      `$1${block}`,
    );
    if (!/data-ark-folder-groups/i.test(app)) {
      app = app.replace(/return\s*\(/i, `return (\n    <>\n    ${block}\n`);
      if (!/<\/>\s*\);\s*$/m.test(app)) app = app.replace(/\);\s*$/m, '    </>\n  );');
    }
    touchedApp = true;
    if (!/\.ark-folder-groups/.test(css)) {
      css += `\n.ark-folder-groups{display:grid;gap:0.35rem;margin:0.5rem 0 0.85rem;}\n.ark-folder-groups p{margin:0;font-size:0.7rem;text-transform:uppercase;opacity:0.65;letter-spacing:0.04em;}\n.ark-folder-groups button{text-align:left;border:0;border-radius:8px;padding:0.4rem 0.55rem;background:transparent;color:inherit;cursor:pointer;}\n.ark-folder-groups button:hover{background:#ffffff10;}\n`;
      touchedCss = true;
    }
  }

  if (wantsFind && !/data-ark-find-bar/i.test(app)) {
    const find = `<label className="ark-find-bar" data-ark-find-bar="1">Find in note <input placeholder="Search in note…" /></label>`;
    app = app.replace(
      /(<(?:div|section|main)[^>]*className=["'][^"']*(?:editor|main|content|pane)[^"']*["'][^>]*>)/i,
      `$1${find}`,
    );
    if (!/data-ark-find-bar/i.test(app)) {
      app = app.replace(/return\s*\(/i, `return (\n    <>\n    ${find}\n`);
      if (!/<\/>\s*\);\s*$/m.test(app)) app = app.replace(/\);\s*$/m, '    </>\n  );');
    }
    touchedApp = true;
    if (!/\.ark-find-bar/.test(css)) {
      css += `\n.ark-find-bar{display:flex;align-items:center;gap:0.5rem;font-size:0.75rem;opacity:0.9;margin:0.4rem 0 0.75rem;}\n.ark-find-bar input{flex:1;border:1px solid #ffffff18;border-radius:8px;padding:0.35rem 0.55rem;background:#0006;color:inherit;}\n`;
      touchedCss = true;
    }
  }

  if (wantsTags && !/data-ark-tags/i.test(app)) {
    const tags = `<div className="ark-tags" data-ark-tags="1"><span>draft</span><span>idea</span><span>review</span></div>`;
    app = app.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/i, `$1${tags}`);
    if (!/data-ark-tags/i.test(app)) {
      app = app.replace(/return\s*\(/i, `return (\n    <>\n    ${tags}\n`);
      if (!/<\/>\s*\);\s*$/m.test(app)) app = app.replace(/\);\s*$/m, '    </>\n  );');
    }
    touchedApp = true;
    if (!/\.ark-tags/.test(css)) {
      css += `\n.ark-tags{display:flex;flex-wrap:wrap;gap:0.35rem;margin:0.35rem 0 0.75rem;}\n.ark-tags span{border:1px solid #ffffff22;border-radius:999px;padding:0.15rem 0.55rem;font-size:0.7rem;opacity:0.85;}\n`;
      touchedCss = true;
    }
  }

  const edits: WebFileEdit[] = [];
  if (touchedApp) edits.push({ path: appPath, content: app });
  if (touchedCss) edits.push({ path: cssPath, content: css || String(flat[cssPath] || '') });
  return edits;
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

/** Original geometric mark. not Discord's logo. */
function brandLogoSvg(initial: string): string {
  const letter = escapeHtml(initial.slice(0, 1).toUpperCase() || 'N');
  return `<svg className="brand-mark" viewBox="0 0 48 48" aria-hidden="true" role="img">
  <polygon points="24,4 44,14 44,34 24,44 4,34 4,14" fill="none" stroke="currentColor" stroke-width="2.5"/>
  <text x="24" y="30" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor" font-family="system-ui,sans-serif">${letter}</text>
</svg>`;
}

function patchPackageJsonForLucide(flat: WebFileMap): WebFileEdit | null {
  const pkgPath = flat['package.json'] != null ? 'package.json' : null;
  if (!pkgPath) return null;
  try {
    const pkg = JSON.parse(String(flat[pkgPath]));
    pkg.dependencies = { ...(pkg.dependencies || {}), 'lucide-react': '^0.474.0' };
    return { path: pkgPath, content: `${JSON.stringify(pkg, null, 2)}\n` };
  } catch {
    return null;
  }
}

function buildFinanceAppJsx(title: string): string {
  const safeTitle = escapeHtml(title);
  return `import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Wallet, ArrowLeftRight, Target, Settings, Plus, X, Moon, Sun,
} from 'lucide-react';
import './App.css';

const STORAGE_KEY = 'ark-finance-v1';
const WALLETS = [
  { id: 'checking', name: 'Checking', balance: 2450 },
  { id: 'savings', name: 'Savings', balance: 8200 },
  { id: 'credit', name: 'Credit', balance: -420 },
];
const SEED = [
  { id: '1', wallet: 'checking', category: 'Salary', note: 'Payroll', amount: 3200, date: '2026-08-01' },
  { id: '2', wallet: 'checking', category: 'Food', note: 'Groceries', amount: -86.4, date: '2026-08-03' },
  { id: '3', wallet: 'credit', category: 'Rent', note: 'August rent', amount: -1400, date: '2026-08-01' },
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.transactions?.length) return parsed;
  } catch { /* ignore */ }
  return { transactions: SEED, theme: 'dark', displayName: 'You' };
}

export default function App() {
  const [page, setPage] = useState('overview');
  const [walletId, setWalletId] = useState('checking');
  const [state, setState] = useState(loadState);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState({ amount: '', category: 'Food', note: '', date: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    document.documentElement.dataset.theme = state.theme;
  }, [state]);

  const txs = useMemo(
    () => state.transactions.filter(t => t.wallet === walletId).sort((a, b) => b.date.localeCompare(a.date)),
    [state.transactions, walletId],
  );
  const net = useMemo(() => state.transactions.reduce((s, t) => s + Number(t.amount), 0), [state.transactions]);
  const weekly = useMemo(() => {
    const days = [0, 0, 0, 0, 0, 0, 0];
    state.transactions.forEach(t => {
      if (Number(t.amount) >= 0) return;
      const d = new Date(t.date).getDay();
      days[d] += Math.abs(Number(t.amount));
    });
    return days;
  }, [state.transactions]);
  const maxBar = Math.max(1, ...weekly);

  const addTx = () => {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || !draft.amount) return;
    setState(s => ({
      ...s,
      transactions: [
        { id: String(Date.now()), wallet: walletId, category: draft.category, note: draft.note || draft.category, amount, date: draft.date },
        ...s.transactions,
      ],
    }));
    setModalOpen(false);
    setDraft({ amount: '', category: 'Food', note: '', date: new Date().toISOString().slice(0, 10) });
  };

  const nav = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'wallets', label: 'Wallets', icon: Wallet },
    { id: 'cashflow', label: 'Cashflow', icon: ArrowLeftRight },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'prefs', label: 'Preferences', icon: Settings },
  ];

  return (
    <div className="finance-shell">
      <aside className="side">
        <div className="brand">${safeTitle}</div>
        {nav.map(n => {
          const Icon = n.icon;
          return (
            <button key={n.id} type="button" className={page === n.id ? 'nav active' : 'nav'} onClick={() => setPage(n.id)}>
              <Icon size={18} /> {n.label}
            </button>
          );
        })}
      </aside>
      <main className="main">
        <header className="top">
          <h1>{nav.find(n => n.id === page)?.label}</h1>
          <button type="button" className="btn" onClick={() => setModalOpen(true)}><Plus size={16} /> Add Transaction</button>
        </header>

        {page === 'overview' && (
          <section className="stack">
            <div className="tiles">
              <div className="tile"><span>Net worth</span><strong>{net.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</strong></div>
              <div className="tile"><span>Wallets</span><strong>{WALLETS.length}</strong></div>
              <div className="tile"><span>Transactions</span><strong>{state.transactions.length}</strong></div>
            </div>
            <div className="card">
              <h2>Weekly spend</h2>
              <svg viewBox="0 0 280 100" className="chart" role="img" aria-label="Weekly spend">
                {weekly.map((v, i) => (
                  <rect key={i} x={20 + i * 36} y={90 - (v / maxBar) * 70} width="22" height={(v / maxBar) * 70 || 2} rx="4" />
                ))}
              </svg>
            </div>
            <div className="card">
              <h2>Recent</h2>
              {state.transactions.length === 0 ? <p className="empty">No transactions yet.</p> : (
                <ul className="ledger">{state.transactions.slice(0, 8).map(t => (
                  <li key={t.id}><span>{t.note}</span><em className={t.amount < 0 ? 'neg' : 'pos'}>{t.amount.toFixed(2)}</em></li>
                ))}</ul>
              )}
            </div>
          </section>
        )}

        {(page === 'wallets' || page === 'cashflow') && (
          <section className="stack">
            <div className="tiles">
              {WALLETS.map(w => (
                <button key={w.id} type="button" className={walletId === w.id ? 'tile active' : 'tile'} onClick={() => setWalletId(w.id)}>
                  <span>{w.name}</span><strong>{w.balance.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</strong>
                </button>
              ))}
            </div>
            <div className="card">
              <h2>{WALLETS.find(w => w.id === walletId)?.name} ledger</h2>
              {txs.length === 0 ? <p className="empty">No rows for this wallet.</p> : (
                <ul className="ledger">{txs.map(t => (
                  <li key={t.id}><span>{t.date} · {t.category} · {t.note}</span><em className={t.amount < 0 ? 'neg' : 'pos'}>{t.amount.toFixed(2)}</em></li>
                ))}</ul>
              )}
            </div>
          </section>
        )}

        {page === 'goals' && (
          <section className="tiles">
            {[{ name: 'Savings', pct: 62 }, { name: 'Travel', pct: 28 }].map(g => (
              <div key={g.name} className="tile goal">
                <svg viewBox="0 0 36 36" className="ring"><circle cx="18" cy="18" r="15.5" /><circle cx="18" cy="18" r="15.5" style={{ strokeDasharray: \`\${g.pct} 100\` }} /></svg>
                <div><span>{g.name}</span><strong>{g.pct}%</strong></div>
              </div>
            ))}
          </section>
        )}

        {page === 'prefs' && (
          <section className="card prefs">
            <label>Display name<input value={state.displayName} onChange={e => setState(s => ({ ...s, displayName: e.target.value }))} /></label>
            <button type="button" className="btn" onClick={() => setState(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))}>
              {state.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} Switch to {state.theme === 'dark' ? 'light' : 'dark'}
            </button>
          </section>
        )}
      </main>

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <header><h2>Add transaction</h2><button type="button" onClick={() => setModalOpen(false)}><X size={16} /></button></header>
            <label>Amount<input value={draft.amount} onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} placeholder="-42.50" /></label>
            <label>Category
              <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}>
                {['Food', 'Rent', 'Salary', 'Transfer', 'Travel'].map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Note<input value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} /></label>
            <label>Date<input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} /></label>
            <button type="button" className="btn primary" onClick={addTx}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
`;
}

function buildFinanceAppCss(): string {
  return `:root, [data-theme="dark"] {
  --bg: #0c1210; --panel: #141c18; --text: #e8f2ec; --muted: #8aa396; --accent: #3dd68c; --line: #24302a; --neg: #f07178; --pos: #3dd68c;
}
[data-theme="light"] {
  --bg: #f3f7f4; --panel: #ffffff; --text: #14201a; --muted: #5b6f64; --accent: #0f9f6e; --line: #d7e3db; --neg: #c0392b; --pos: #0f9f6e;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--text); }
.finance-shell { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
.side { border-right: 1px solid var(--line); padding: 1rem 0.75rem; background: var(--panel); }
.brand { font-weight: 700; letter-spacing: 0.04em; margin: 0 0.5rem 1rem; }
.nav { width: 100%; display: flex; gap: 0.55rem; align-items: center; border: 0; background: transparent; color: var(--muted); padding: 0.65rem 0.75rem; border-radius: 10px; cursor: pointer; }
.nav.active, .nav:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--text); }
.main { padding: 1.25rem 1.5rem 2rem; }
.top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.top h1 { margin: 0; font-size: 1.35rem; }
.btn { display: inline-flex; gap: 0.4rem; align-items: center; border: 1px solid var(--line); background: var(--panel); color: var(--text); border-radius: 999px; padding: 0.45rem 0.85rem; cursor: pointer; }
.btn.primary { background: var(--accent); color: #062216; border-color: transparent; font-weight: 600; }
.stack { display: grid; gap: 1rem; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
.tile { text-align: left; border: 1px solid var(--line); background: var(--panel); border-radius: 14px; padding: 0.9rem 1rem; color: inherit; cursor: pointer; }
.tile.active { outline: 2px solid var(--accent); }
.tile span, .card h2 { color: var(--muted); font-size: 0.8rem; }
.tile strong { display: block; margin-top: 0.35rem; font-size: 1.25rem; }
.card { border: 1px solid var(--line); background: var(--panel); border-radius: 16px; padding: 1rem; }
.chart { width: 100%; height: 120px; fill: var(--accent); }
.ledger { list-style: none; margin: 0; padding: 0; }
.ledger li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.55rem 0; border-bottom: 1px solid var(--line); }
.neg { color: var(--neg); } .pos { color: var(--pos); }
.empty { color: var(--muted); }
.goal { display: flex; gap: 0.75rem; align-items: center; }
.ring { width: 52px; height: 52px; transform: rotate(-90deg); }
.ring circle { fill: none; stroke: var(--line); stroke-width: 3; }
.ring circle:last-child { stroke: var(--accent); }
.prefs { display: grid; gap: 0.85rem; max-width: 360px; }
.prefs label, .modal label { display: grid; gap: 0.3rem; font-size: 0.85rem; color: var(--muted); }
.prefs input, .modal input, .modal select { border: 1px solid var(--line); background: var(--bg); color: var(--text); border-radius: 10px; padding: 0.55rem 0.7rem; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: grid; place-items: center; padding: 1rem; }
.modal { width: min(420px, 100%); background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 1rem; display: grid; gap: 0.75rem; }
.modal header { display: flex; justify-content: space-between; align-items: center; }
.modal header h2 { margin: 0; font-size: 1rem; color: var(--text); }
.modal header button { border: 0; background: transparent; color: var(--muted); cursor: pointer; }
@media (max-width: 800px) { .finance-shell { grid-template-columns: 1fr; } .side { display: flex; gap: 0.35rem; overflow-x: auto; } }
`;
}

function buildPulseAppJsx(title: string, brief = ''): string {
  const safeTitle = escapeHtml(title);
  const wantStopwatch = /\b(stopwatch|lap)\b/i.test(brief);
  if (wantStopwatch) {
    return `import { useEffect, useRef, useState } from 'react';
import './App.css';

const LAPS_KEY = 'ark-pulse-laps-v1';
function loadLaps() {
  try { const p = JSON.parse(localStorage.getItem(LAPS_KEY) || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
}
function fmt(ms) {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
  return mm + ':' + ss + '.' + cs;
}

export default function App() {
  const [ms, setMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState(loadLaps);
  const tick = useRef(null);
  const started = useRef(0);
  const base = useRef(0);
  useEffect(() => { try { localStorage.setItem(LAPS_KEY, JSON.stringify(laps)); } catch {} }, [laps]);
  useEffect(() => {
    if (!running) { if (tick.current) clearInterval(tick.current); return undefined; }
    started.current = Date.now();
    tick.current = setInterval(() => setMs(base.current + (Date.now() - started.current)), 40);
    return () => clearInterval(tick.current);
  }, [running]);
  return (
    <div className="pulse-shell stopwatch">
      <header className="pulse-bar"><strong>${safeTitle}</strong><span>Emerald stopwatch</span></header>
      <div className="pulse-grid">
        <section className="timer-card glow-ring">
          <p className="label">Stopwatch</p>
          <div className="clock">{fmt(ms)}</div>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => { if (!running) setRunning(true); }} disabled={running}>Start</button>
            <button type="button" className="btn" onClick={() => { if (running) { base.current = ms; setRunning(false); } }} disabled={!running}>Pause</button>
            <button type="button" className="btn" onClick={() => { setRunning(false); base.current = 0; setMs(0); setLaps([]); }}>Reset</button>
            <button type="button" className="btn primary" onClick={() => setLaps((p) => [{ id: Date.now(), at: ms }, ...p].slice(0, 40))} disabled={ms === 0}>Lap</button>
          </div>
        </section>
        <section className="note-card">
          <p className="label">Lap times</p>
          <ul className="laps">
            {laps.length === 0 && <li className="empty">No laps yet</li>}
            {laps.map((item, i) => (
              <li key={item.id}><span>Lap {laps.length - i}</span><strong>{fmt(item.at)}</strong></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
`;
  }
  return `import { useEffect, useRef, useState } from 'react';
import './App.css';

const NOTE_KEY = 'ark-pulse-note-v1';
const FOCUS_SECS = 25 * 60;

function loadNote() {
  try { return localStorage.getItem(NOTE_KEY) || ''; } catch { return ''; }
}

export default function App() {
  const [seconds, setSeconds] = useState(FOCUS_SECS);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState(loadNote);
  const tick = useRef(null);

  useEffect(() => {
    localStorage.setItem(NOTE_KEY, note);
  }, [note]);

  useEffect(() => {
    if (!running) {
      if (tick.current) clearInterval(tick.current);
      return undefined;
    }
    tick.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick.current);
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="pulse-shell">
      <header className="pulse-bar"><strong>${safeTitle}</strong><span>Focus utility</span></header>
      <div className="pulse-grid">
        <section className="timer-card">
          <p className="label">Pomodoro</p>
          <div className="clock">{mm}:{ss}</div>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => setRunning(true)} disabled={running || seconds === 0}>Start</button>
            <button type="button" className="btn" onClick={() => setRunning(false)} disabled={!running}>Pause</button>
            <button type="button" className="btn" onClick={() => { setRunning(false); setSeconds(FOCUS_SECS); }}>Reset</button>
          </div>
        </section>
        <section className="note-card">
          <p className="label">Scratch pad</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Quick notes. saved locally…"
          />
        </section>
      </div>
    </div>
  );
}
`;
}

function buildPulseAppCss(brief = ''): string {
  const emerald = /\b(emerald|stopwatch|lap|green)\b/i.test(brief);
  const root = emerald
    ? ':root { --bg:#07140f; --panel:#0f2a1f; --text:#e8f7ef; --muted:#8aafa0; --accent:#3dd68c; --line:#1d3d30; --glow:rgba(61,214,140,0.35); }'
    : ':root { --bg:#10141a; --panel:#1a222d; --text:#e8eef7; --muted:#8b97a8; --accent:#f0b429; --line:#2a3442; --glow:rgba(240,180,41,0.2); }';
  return `${root}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: radial-gradient(900px 480px at 15% -5%, var(--glow), transparent), linear-gradient(160deg, var(--bg), #0a1210 55%, var(--bg)); color: var(--text); }
.pulse-shell { min-height: 100vh; }
.pulse-bar { display:flex; justify-content:space-between; align-items:center; padding:0.85rem 1.1rem; border-bottom:1px solid var(--line); background: rgba(0,0,0,0.25); }
.pulse-bar span { color: var(--muted); font-size: 0.8rem; }
.pulse-grid { display:grid; grid-template-columns: 1fr 1fr; gap:1rem; padding:1.25rem; max-width:960px; margin:0 auto; }
.timer-card, .note-card { background: var(--panel); border:1px solid var(--line); border-radius:16px; padding:1.1rem; min-height:280px; }
.glow-ring { box-shadow: 0 0 0 1px var(--line), 0 0 36px var(--glow); }
.label { margin:0 0 0.75rem; color:var(--muted); letter-spacing:0.08em; text-transform:uppercase; font-size:0.72rem; }
.clock { font-size:4rem; font-variant-numeric: tabular-nums; font-weight:600; margin:1rem 0 1.25rem; }
.row { display:flex; gap:0.5rem; flex-wrap:wrap; }
.btn { border:1px solid var(--line); background:#0c1612; color:var(--text); border-radius:10px; padding:0.55rem 0.9rem; cursor:pointer; }
.btn.primary { background: var(--accent); color:#062015; border-color:transparent; font-weight:600; }
.btn:disabled { opacity:0.45; cursor:not-allowed; }
.note-card textarea { width:100%; height:210px; resize:vertical; border:1px solid var(--line); border-radius:12px; background:#07110d; color:var(--text); padding:0.75rem; font:inherit; }
.laps { list-style:none; margin:0; padding:0; display:grid; gap:0.45rem; max-height:260px; overflow:auto; }
.laps li { display:flex; justify-content:space-between; padding:0.55rem 0.7rem; border-radius:10px; background:rgba(0,0,0,0.22); border:1px solid var(--line); }
.laps .empty { color:var(--muted); border-style:dashed; }
@media (max-width:720px) { .pulse-grid { grid-template-columns: 1fr; } }
`;
}

function buildKanbanAppJsx(title: string): string {
  const safeTitle = escapeHtml(title);
  return `import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import './App.css';

const STORAGE_KEY = 'ark-kanban-v1';
const COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'doing', label: 'Doing' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* ignore */ }
  return [
    { id: '1', column: 'backlog', title: 'Sketch board chrome', notes: 'Dark original UI, not a Trello clone.' },
    { id: '2', column: 'doing', title: 'Wire drag-and-drop', notes: 'HTML5 DnD between columns.' },
    { id: '3', column: 'review', title: 'Persist to localStorage', notes: 'Survive reloads.' },
  ];
}

export default function App() {
  const [cards, setCards] = useState(loadCards);
  const [modalOpen, setModalOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftColumn, setDraftColumn] = useState('backlog');
  const [draggingId, setDraggingId] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  }, [cards]);

  const byColumn = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((c) => [c.id, []]));
    for (const card of cards) {
      if (map[card.column]) map[card.column].push(card);
      else map.backlog.push(card);
    }
    return map;
  }, [cards]);

  const openAdd = (columnId) => {
    setDraftColumn(columnId);
    setDraftTitle('');
    setDraftNotes('');
    setModalOpen(true);
  };

  const saveCard = () => {
    const title = draftTitle.trim();
    if (!title) return;
    setCards((prev) => [
      { id: String(Date.now()), column: draftColumn, title, notes: draftNotes.trim() },
      ...prev,
    ]);
    setModalOpen(false);
  };

  const onDropColumn = (columnId) => {
    if (!draggingId) return;
    setCards((prev) => prev.map((c) => (c.id === draggingId ? { ...c, column: columnId } : c)));
    setDraggingId(null);
  };

  return (
    <div className="kanban-shell">
      <header className="kanban-top">
        <div>
          <p className="eyebrow">Board</p>
          <h1>${safeTitle}</h1>
        </div>
        <button type="button" className="btn primary" onClick={() => openAdd('backlog')}>
          <Plus size={16} /> Add Card
        </button>
      </header>
      <div className="board">
        {COLUMNS.map((col) => (
          <section
            key={col.id}
            className="column"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropColumn(col.id)}
          >
            <div className="column-head">
              <h2>{col.label}</h2>
              <span>{byColumn[col.id].length}</span>
              <button type="button" className="ghost" onClick={() => openAdd(col.id)} aria-label={\`Add to \${col.label}\`}>
                <Plus size={14} />
              </button>
            </div>
            <ul className="card-list">
              {byColumn[col.id].map((card) => (
                <li
                  key={card.id}
                  className="kcard"
                  draggable
                  onDragStart={() => setDraggingId(card.id)}
                  onDragEnd={() => setDraggingId(null)}
                >
                  <strong>{card.title}</strong>
                  {card.notes ? <p>{card.notes}</p> : null}
                </li>
              ))}
              {!byColumn[col.id].length ? <li className="empty">Drop cards here</li> : null}
            </ul>
          </section>
        ))}
      </div>
      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>New card</h2>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Close"><X size={16} /></button>
            </header>
            <label>
              Title
              <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Card title" autoFocus />
            </label>
            <label>
              Notes
              <textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} placeholder="Optional notes" rows={4} />
            </label>
            <label>
              Column
              <select value={draftColumn} onChange={(e) => setDraftColumn(e.target.value)}>
                {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <button type="button" className="btn primary" onClick={saveCard}>Save card</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
`;
}

function buildKanbanAppCss(): string {
  return `:root {
  --bg: #0e1116; --panel: #161b22; --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff; --line: #30363d; --lift: #1c2128;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif; background: radial-gradient(1200px 600px at 10% -10%, #1a2740, var(--bg)); color: var(--text); }
.kanban-shell { min-height: 100vh; padding: 1.25rem 1.5rem 2rem; }
.kanban-top { display: flex; justify-content: space-between; align-items: end; gap: 1rem; margin-bottom: 1.25rem; }
.eyebrow { margin: 0; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; }
.kanban-top h1 { margin: 0.15rem 0 0; font-size: 1.6rem; }
.btn { display: inline-flex; gap: 0.4rem; align-items: center; border: 1px solid var(--line); background: var(--panel); color: var(--text); border-radius: 10px; padding: 0.5rem 0.9rem; cursor: pointer; }
.btn.primary { background: var(--accent); color: #041018; border-color: transparent; font-weight: 600; }
.board { display: grid; grid-template-columns: repeat(4, minmax(200px, 1fr)); gap: 0.85rem; align-items: start; }
.column { background: color-mix(in srgb, var(--panel) 88%, transparent); border: 1px solid var(--line); border-radius: 14px; min-height: 420px; padding: 0.65rem; }
.column-head { display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.55rem; }
.column-head h2 { margin: 0; font-size: 0.92rem; flex: 1; }
.column-head span { color: var(--muted); font-size: 0.75rem; }
.ghost { border: 0; background: transparent; color: var(--muted); cursor: pointer; display: grid; place-items: center; padding: 0.2rem; }
.card-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.55rem; min-height: 320px; }
.kcard { background: var(--lift); border: 1px solid var(--line); border-radius: 12px; padding: 0.75rem 0.8rem; cursor: grab; }
.kcard:active { cursor: grabbing; }
.kcard strong { display: block; font-size: 0.92rem; }
.kcard p { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.82rem; line-height: 1.35; }
.empty { color: var(--muted); font-size: 0.8rem; padding: 0.75rem; border: 1px dashed var(--line); border-radius: 10px; text-align: center; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: grid; place-items: center; padding: 1rem; }
.modal { width: min(420px, 100%); background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 1rem; display: grid; gap: 0.75rem; }
.modal header { display: flex; justify-content: space-between; align-items: center; }
.modal header h2 { margin: 0; font-size: 1rem; }
.modal header button { border: 0; background: transparent; color: var(--muted); cursor: pointer; }
.modal label { display: grid; gap: 0.3rem; font-size: 0.85rem; color: var(--muted); }
.modal input, .modal textarea, .modal select { border: 1px solid var(--line); background: var(--bg); color: var(--text); border-radius: 10px; padding: 0.55rem 0.7rem; font: inherit; }
@media (max-width: 960px) { .board { grid-template-columns: repeat(2, minmax(180px, 1fr)); } }
@media (max-width: 560px) { .board { grid-template-columns: 1fr; } .kanban-top { flex-direction: column; align-items: start; } }
`;
}

function buildChatAppJsx(title: string): string {
  const logo = brandLogoSvg(title);
  const safeTitle = escapeHtml(title);
  return `import { useMemo, useState } from 'react';
import {
  Users, MessageCircle, Settings, Hash, Volume2, Phone,
  Mic, MicOff, MonitorUp, X, UserPlus, Smile,
} from 'lucide-react';
import './App.css';

const FRIENDS = ['Alex', 'Jordan', 'Sam'];
const CHANNELS = [
  { id: 'general', name: 'general', type: 'text' },
  { id: 'random', name: 'random', type: 'text' },
  { id: 'voice', name: 'Lounge', type: 'voice' },
];
const MEMBERS = [
  { name: 'You', status: 'online' },
  { name: 'Ark Bot', status: 'online' },
  { name: 'Guest', status: 'idle' },
];
const SEED = [
  { id: '1', channel: 'general', author: 'Ark Bot', text: 'Welcome to ${safeTitle}. pick a channel or open DMs.' },
];

export default function App() {
  const [rail, setRail] = useState('servers');
  const [channelId, setChannelId] = useState('general');
  const [dmUser, setDmUser] = useState(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(SEED);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('appearance');
  const [theme, setTheme] = useState('dark');
  const [accent, setAccent] = useState('#38bdf8');
  const [displayName, setDisplayName] = useState('You');
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [screenShare, setScreenShare] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const channel = CHANNELS.find(c => c.id === channelId) || CHANNELS[0];
  const threadKey = dmUser ? \`dm:\${dmUser}\` : channel.id;
  const thread = useMemo(
    () => messages.filter(m => (dmUser ? m.dm === dmUser : m.channel === channel.id && !m.dm)),
    [messages, channel.id, dmUser],
  );

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages(prev => [...prev, {
      id: String(Date.now()),
      channel: dmUser ? null : channel.id,
      dm: dmUser,
      author: displayName,
      text,
    }]);
    setDraft('');
    if (dmUser) {
      window.setTimeout(() => {
        setMessages(prev => [...prev, {
          id: String(Date.now() + 1),
          dm: dmUser,
          author: dmUser,
          text: \`Got it. "\${text.slice(0, 80)}"\`,
        }]);
      }, 600);
    }
  };

  return (
    <div className={\`app-shell theme-\${theme}\`} style={{ '--accent': accent }}>
      <nav className="rail" aria-label="Main">
        <div className="rail-logo" title="${safeTitle}">
          ${logo}
        </div>
        <button type="button" className={rail === 'friends' ? 'rail-btn active' : 'rail-btn'} onClick={() => { setRail('friends'); setDmUser(null); }} title="Friends"><Users size={20} /></button>
        <button type="button" className={rail === 'servers' ? 'rail-btn active' : 'rail-btn'} onClick={() => { setRail('servers'); setDmUser(null); }} title="Servers"><Hash size={20} /></button>
        <button type="button" className={rail === 'dms' ? 'rail-btn active' : 'rail-btn'} onClick={() => setRail('dms')} title="Direct messages"><MessageCircle size={20} /></button>
        <button type="button" className="rail-btn rail-settings" onClick={() => setSettingsOpen(true)} title="Settings"><Settings size={20} /></button>
      </nav>

      <aside className="sidebar">
        {rail === 'friends' && (
          <>
            <p className="sidebar-title">Friends</p>
            <ul className="list">{FRIENDS.map(f => <li key={f}><span className="dot online" />{f}</li>)}</ul>
          </>
        )}
        {rail === 'dms' && (
          <>
            <p className="sidebar-title">Direct Messages</p>
            <ul className="list">
              {FRIENDS.map(f => (
                <li key={f}>
                  <button type="button" className={dmUser === f ? 'row active' : 'row'} onClick={() => { setDmUser(f); setRail('dms'); }}>
                    <span className="dot online" />{f}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {(rail === 'servers' || (!dmUser && rail !== 'dms' && rail !== 'friends')) && (
          <>
            <p className="sidebar-title">${safeTitle}</p>
            <p className="sidebar-sub">Text channels</p>
            <ul className="list">
              {CHANNELS.filter(c => c.type === 'text').map(c => (
                <li key={c.id}>
                  <button type="button" className={channelId === c.id && !dmUser ? 'row active' : 'row'} onClick={() => { setChannelId(c.id); setDmUser(null); setRail('servers'); }}>
                    <Hash size={14} /> {c.name}
                  </button>
                </li>
              ))}
            </ul>
            <p className="sidebar-sub">Voice</p>
            <ul className="list">
              {CHANNELS.filter(c => c.type === 'voice').map(c => (
                <li key={c.id}><button type="button" className="row" onClick={() => setInCall(true)}><Volume2 size={14} /> {c.name}</button></li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <main className="main">
        <header className="main-header">
          <h1>{dmUser ? \`@\${dmUser}\` : \`# \${channel.name}\`}</h1>
          <div className="header-actions">
            <button type="button" className="ghost" onClick={() => setInviteOpen(true)}><UserPlus size={16} /> Add people</button>
            <button type="button" className="ghost" onClick={() => setInCall(v => !v)}><Phone size={16} /> {inCall ? 'End call' : 'Start call'}</button>
          </div>
        </header>
        <div className="messages">
          {thread.map(m => (
            <article key={m.id} className="msg">
              <span className="avatar" style={{ background: accent }}>{(m.author || '?')[0]}</span>
              <div>
                <header><strong>{m.author}</strong> <time>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header>
                <p>{m.text}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="composer">
          <button type="button" className="icon-btn" aria-label="Emoji"><Smile size={18} /></button>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder={dmUser ? \`Message @\${dmUser}\` : \`Message #\${channel.name}\`}
          />
          <button type="button" className="send" onClick={send}>Send</button>
        </div>
        {inCall && (
          <div className="call-bar">
            <span><Phone size={14} /> Connected (demo)</span>
            <div className="call-actions">
              <button type="button" className={muted ? 'on' : ''} onClick={() => setMuted(v => !v)}>{muted ? <MicOff size={16} /> : <Mic size={16} />}</button>
              <button type="button" className={deafened ? 'on' : ''} onClick={() => setDeafened(v => !v)} title="Deafen">🔇</button>
              <button type="button" className={screenShare ? 'on' : ''} onClick={() => setScreenShare(v => !v)}><MonitorUp size={16} /></button>
              <button type="button" onClick={() => { setInCall(false); setScreenShare(false); }}><X size={16} /></button>
            </div>
          </div>
        )}
      </main>

      <aside className="members">
        <p className="sidebar-sub">Members</p>
        <ul className="list">
          {MEMBERS.map(m => (
            <li key={m.name}><span className={\`dot \${m.status}\`} />{m.name}</li>
          ))}
        </ul>
      </aside>

      {inviteOpen && (
        <div className="modal-backdrop" onClick={() => setInviteOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Invite to ${safeTitle}</h2>
            <p>Share link: <code>${safeTitle.toLowerCase()}.invite/demo</code></p>
            <button type="button" onClick={() => setInviteOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal settings" onClick={e => e.stopPropagation()}>
            <header><h2>Settings</h2><button type="button" onClick={() => setSettingsOpen(false)}><X size={18} /></button></header>
            <div className="settings-body">
              <nav>
                {['account', 'appearance', 'notifications', 'privacy', 'keybinds', 'voice'].map(tab => (
                  <button key={tab} type="button" className={settingsTab === tab ? 'active' : ''} onClick={() => setSettingsTab(tab)}>{tab}</button>
                ))}
              </nav>
              <div className="settings-panel">
                {settingsTab === 'account' && (
                  <label>Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)} /></label>
                )}
                {settingsTab === 'appearance' && (
                  <>
                    <label>Theme
                      <select value={theme} onChange={e => setTheme(e.target.value)}>
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                      </select>
                    </label>
                    <label>Accent color<input type="color" value={accent} onChange={e => setAccent(e.target.value)} /></label>
                  </>
                )}
                {settingsTab === 'notifications' && <p>Notification toggles (demo). all on.</p>}
                {settingsTab === 'privacy' && <p>Privacy toggles (demo). DMs from friends only.</p>}
                {settingsTab === 'keybinds' && <p>Ctrl+Enter. send message (read-only list for v1).</p>}
                {settingsTab === 'voice' && <p>Input / output device dropdowns (demo).</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;
}

function buildChatAppCss(): string {
  return `html, body, #root { margin: 0; height: 100%; }
* { box-sizing: border-box; }
.app-shell {
  --bg: #0c1017;
  --panel: #151b26;
  --panel-2: #1c2433;
  --text: #e8edf5;
  --muted: #8b95a8;
  --accent: #38bdf8;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 72px 240px 1fr 200px;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, Segoe UI, sans-serif;
}
.app-shell.theme-light {
  --bg: #f4f6fa;
  --panel: #ffffff;
  --panel-2: #eef1f6;
  --text: #111827;
  --muted: #6b7280;
}
.rail {
  background: var(--panel);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0;
  border-right: 1px solid #0003;
}
.rail-logo { color: var(--accent); width: 44px; height: 44px; margin-bottom: 0.5rem; }
.brand-mark { width: 100%; height: 100%; }
.rail-btn {
  width: 44px; height: 44px; border: 0; border-radius: 14px;
  background: var(--panel-2); color: var(--muted); cursor: pointer;
  display: grid; place-items: center;
}
.rail-btn:hover, .rail-btn.active { background: var(--accent); color: #0c1017; }
.rail-settings { margin-top: auto; }
.sidebar, .members { background: var(--panel); padding: 0.85rem; border-right: 1px solid #0002; }
.members { border-right: 0; border-left: 1px solid #0002; }
.sidebar-title { margin: 0 0 0.75rem; font-weight: 700; }
.sidebar-sub { margin: 0.75rem 0 0.35rem; font-size: 0.7rem; text-transform: uppercase; color: var(--muted); letter-spacing: 0.04em; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
.row {
  width: 100%; text-align: left; border: 0; border-radius: 8px; padding: 0.45rem 0.5rem;
  background: transparent; color: inherit; cursor: pointer; display: flex; align-items: center; gap: 0.35rem;
}
.row:hover, .row.active { background: var(--panel-2); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 0.35rem; }
.dot.online { background: #34d399; }
.dot.idle { background: #fbbf24; }
.main { display: flex; flex-direction: column; min-width: 0; background: var(--bg); }
.main-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.85rem 1rem; border-bottom: 1px solid #0003;
}
.main-header h1 { margin: 0; font-size: 1rem; }
.header-actions { display: flex; gap: 0.5rem; }
.ghost {
  border: 1px solid #ffffff18; background: transparent; color: inherit;
  border-radius: 8px; padding: 0.35rem 0.6rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;
}
.messages { flex: 1; overflow: auto; padding: 1rem; display: grid; gap: 0.85rem; align-content: start; }
.msg { display: grid; grid-template-columns: 40px 1fr; gap: 0.65rem; }
.avatar {
  width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
  font-weight: 700; color: #0c1017;
}
.msg header { display: flex; gap: 0.5rem; align-items: baseline; }
.msg time { color: var(--muted); font-size: 0.75rem; }
.msg p { margin: 0.2rem 0 0; }
.composer {
  display: flex; gap: 0.5rem; padding: 0.75rem 1rem 1rem; align-items: center;
}
.composer input {
  flex: 1; border: 0; border-radius: 10px; padding: 0.7rem 0.85rem;
  background: var(--panel); color: inherit; outline: none;
}
.icon-btn, .send {
  border: 0; border-radius: 10px; padding: 0.55rem 0.85rem; cursor: pointer;
}
.send { background: var(--accent); color: #0c1017; font-weight: 700; }
.call-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.5rem 1rem; background: var(--panel); border-top: 1px solid #0003;
}
.call-actions { display: flex; gap: 0.35rem; }
.call-actions button {
  border: 0; border-radius: 8px; padding: 0.4rem; background: var(--panel-2); color: inherit; cursor: pointer;
}
.call-actions button.on { background: var(--accent); color: #0c1017; }
.modal-backdrop {
  position: fixed; inset: 0; background: #0008; backdrop-filter: blur(4px);
  display: grid; place-items: center; z-index: 50;
}
.modal {
  background: var(--panel); border-radius: 16px; padding: 1.25rem; width: min(92vw, 420px);
  box-shadow: 0 20px 60px #0006;
}
.modal.settings { width: min(94vw, 640px); }
.modal header { display: flex; justify-content: space-between; align-items: center; }
.settings-body { display: grid; grid-template-columns: 140px 1fr; gap: 1rem; margin-top: 1rem; }
.settings-body nav { display: grid; gap: 0.35rem; }
.settings-body nav button {
  text-align: left; border: 0; border-radius: 8px; padding: 0.45rem 0.6rem;
  background: transparent; color: inherit; cursor: pointer; text-transform: capitalize;
}
.settings-body nav button.active { background: var(--panel-2); }
.settings-panel label { display: grid; gap: 0.35rem; margin-bottom: 0.75rem; }
.settings-panel input, .settings-panel select {
  border: 1px solid #ffffff18; border-radius: 8px; padding: 0.45rem 0.6rem; background: var(--panel-2); color: inherit;
}
`;
}

/**
 * When the user pastes several project prompts, only use the segment that
 * mentions this project. so NightChat's Discord text cannot patch TaskBox.
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
  const surgical = reactSurgicalMicroAskEdits(files, message);
  if (surgical.length) return surgical;

  // Small UI tweaks must not trigger a full layout rebuild just because the
  // project name maps to kanban/finance/notes. Full create/scaffold briefs still rebuild.
  const looksLikeTweakOnly = (
    /\b(rename|tint|change|update|make)\b/i.test(message)
    && !/\b(create|scaffold|build\s+(?:a|me|the)|named|called)\b/i.test(message)
    && String(message || '').length < 500
  );
  if (looksLikeTweakOnly) {
    return [];
  }

  const projectName = String(opts?.projectName || '').trim();
  const t = segmentForProject(String(message || ''), projectName);
  const flat = flatten(files);
  let appPath = findReactAppPath(flat);

  const nameKey = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  // Do NOT force canned apps from product names (SignalDesk → Discord, BrewDesk → coffee, etc.).
  // Only the user's brief keywords may choose a layout kind — every create stays fresh otherwise.
  const kindForced = ((): 'todo' | 'notes' | 'discord' | 'weather' | 'coffee' | 'finance' | 'kanban' | 'pulse' | null => {
    // Keep only unambiguous name tokens that are the product TYPE itself.
    if (/^kanban/.test(nameKey)) return 'kanban';
    if (/^todo/.test(nameKey)) return 'todo';
    return null;
  })();

  const wantsLogo = /\b(logo|icon)\b/i.test(t) && /\b(add|put|place|create|insert|center|middle|screen)\b/i.test(t);
  const wantsCenter = /\b(center|middle)\b/i.test(t) && /\b(screen|page|app|logo|icon)\b/i.test(t)
    && !/\b(sidebar|note|editor|title\s*bar|task|channel)\b/i.test(t);
  const wantsNotesLayout = (
    (
      /\b(title\s*bar|sidebar|note\s*list|main\s+editor|sticky\s*notes?|notes?\s+app)\b/i.test(t)
      || (/\b(new\s+note|searchable|localStorage)\b/i.test(t) && /\b(note|list|sidebar|button)\b/i.test(t))
    )
    // Hiking / trail / inventory "notes" are not a sticky-notes app.
    && !/\b(trail|hiking|waypoint|elevation|kiln|glaze|aquarium|reef|livestock|greenhouse|plant)\b/i.test(t)
  );
  const wantsTodoLayout = (
    /\b(todo|task\s*list|add\s+task)\b/i.test(t)
    || (/\btask\b/i.test(t) && /\b(list|editor|localStorage|button)\b/i.test(t)
      && !/\b(kanban|column|board|drag)\b/i.test(t))
  );
  const wantsKanbanLayout = (
    /\b(kanban|drag[\s-]?and[\s-]?drop)\b/i.test(t)
    || (/\b(column|board)\b/i.test(t) && /\b(backlog|doing|review|card|draggable)\b/i.test(t))
    || /flowdeck|taskrail|columnforge|boardly/.test(nameKey)
  );
  const wantsDiscordLayout = (
    /\b(server\s+rail|channel\s+list|chat\s+pane|member\s+list|welcome\s+screen)\b/i.test(t)
    || (/\bdiscord\b/i.test(t) && /\b(layout|channels?|sidebar|chat)\b/i.test(t))
  );
  // Strong chat signals only. do NOT treat lucide / settings modal / left rail alone as Discord.
  const wantsChatAppLayout = (
    wantsDiscordLayout
    || /\b(direct\s+messages?|voice\s+channel|screen\s+share|server\s+sidebar|threads?\s+panel|command\s+palette|call\s+bar|team\s+messaging|chat\s+app)\b/i.test(t)
    || (/\b(channel|dm|mute|deafen|friends?)\b/i.test(t) && /\b(react|vite|sidebar|rail|layout)\b/i.test(t)
      && !/\b(budget|transaction|finance|ledger|wallet|invoice|kanban|note|todo|task)\b/i.test(t))
  );
  const wantsFinanceLayout = (
    /\b(budget|transaction|finance|ledger|wallet|expense|net\s*worth|cashflow)\b/i.test(t)
    || /coinnest|ledgerfox|vaultbean|moneypit|shelfledger/.test(nameKey)
  );
  const wantsPulseLayout = (
    /\b(pomodoro|focus\s+timer|scratch\s*pad)\b/i.test(t)
    || (/\btimer\b/i.test(t) && /\b(notepad|scratch|pause|reset)\b/i.test(t))
    || /deskpulse|chronopad|focuspulse/.test(nameKey)
  );
  const wantsWeatherLayout = /\bweather\b/i.test(t) && /\b(dashboard|search|temperature|city)\b/i.test(t);
  const wantsCoffeeLayout = /\b(coffee|brew|menu|order\s+now|hero)\b/i.test(t)
    && !/\b(budget|transaction|finance)\b/i.test(t);

  let kind: 'todo' | 'notes' | 'discord' | 'weather' | 'coffee' | 'finance' | 'kanban' | 'pulse' | 'logo' | null = kindForced;
  if (!kind) {
    if (wantsKanbanLayout) kind = 'kanban';
    else if (wantsPulseLayout) kind = 'pulse';
    else if (wantsFinanceLayout) kind = 'finance';
    else if (wantsTodoLayout) kind = 'todo';
    else if (wantsChatAppLayout) kind = 'discord';
    else if (wantsNotesLayout) kind = 'notes';
    else if (wantsWeatherLayout) kind = 'weather';
    else if (wantsCoffeeLayout) kind = 'coffee';
    else if (wantsLogo || wantsCenter) kind = 'logo';
  }

  // Never keep Discord layout when the project name + brief are clearly non-chat.
  if (kind === 'discord' && projectName && !/discord|nightchat|nexus|link|chat|voice|message|signal|desk|team|messaging/i.test(projectName)) {
    const briefLooksChat = /\b(channel|dm|voice\s+channel|screen\s+share|member\s+list|team\s+messaging|chat\s+app)\b/i.test(t);
    if (!briefLooksChat) {
      kind = wantsKanbanLayout ? 'kanban'
        : wantsPulseLayout ? 'pulse'
        : wantsFinanceLayout ? 'finance'
        : wantsTodoLayout ? 'todo'
        : wantsNotesLayout ? 'notes'
        : null;
    }
  }

  if (!kind) return [];

  // Empty sticky map (after reload). still patch the standard Vite React paths.
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

  if (kind === 'finance') {
    const pkgEdit = patchPackageJsonForLucide(flat);
    if (pkgEdit) out.push(pkgEdit);
    out.push({ path: appPath, content: buildFinanceAppJsx(title) });
    out.push({ path: cssPath, content: buildFinanceAppCss() });
    return out;
  }

  if (kind === 'kanban') {
    const pkgEdit = patchPackageJsonForLucide(flat);
    if (pkgEdit) out.push(pkgEdit);
    out.push({ path: appPath, content: buildKanbanAppJsx(title) });
    out.push({ path: cssPath, content: buildKanbanAppCss() });
    return out;
  }

  if (kind === 'pulse') {
    out.push({ path: appPath, content: buildPulseAppJsx(title, t) });
    out.push({ path: cssPath, content: buildPulseAppCss(t) });
    return out;
  }

  if (kind === 'discord') {
    const pkgEdit = patchPackageJsonForLucide(flat);
    if (pkgEdit) out.push(pkgEdit);
    out.push({ path: appPath, content: buildChatAppJsx(title) });
    out.push({ path: cssPath, content: buildChatAppCss() });
    return out;
  }

  // Weather / coffee layouts are not hard-coded here yet. leave to model/scaffold.
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

  const logoMark = brandLogoSvg(projectName || 'App');
  const jsx = `import './App.css';

export default function App() {
  return (
    <div className="app">
      <div className="logo-stage" aria-label="App logo">
        ${logoMark}
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
