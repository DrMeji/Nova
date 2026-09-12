/**
 * Post-build hygiene for website creates: strip model prose, keep Vite entry valid,
 * and decide when Preview is actually safe to open.
 */

import { buildScaffoldFiles } from '@/lib/projectScaffolds';
import { upgradePollinationsUrlsInSource } from '@/lib/siteHeroImages';
import { looksLikeTruncatedUiSource } from '@/lib/freshSpaFromBrief';
import { blankSolidColorFromAsk } from '@/lib/webProjectCanon';

const PROSE_MARKERS = [
  /the updated file should/i,
  /to (?:link|verify|update|open) (?:the |this )?/i,
  /note that i(?:'ve| have)/i,
  /please let me know/i,
  /as follows\s*:/i,
  /```(?:jsx|tsx|css|html|javascript)?/i,
  /@@@FILE\b/i,
  /here(?:'s| is) (?:the |an? )?(?:updated|complete|full)/i,
];

export function looksLikeModelProseLeak(text: string): boolean {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (PROSE_MARKERS.some((re) => re.test(t))) return true;
  // Tool fences that leaked into CSS/JSX (e.g. "### @@@FILE src/index.css").
  if (/#{1,6}\s*@@@FILE\b/i.test(t) || /\n@@@FILE\s+\S+/i.test(t)) return true;
  // English paragraphs inside CSS/HTML that are not comments.
  const withoutComments = t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const sentences = withoutComments.match(/\b(?:The|We|I|This|To|If|Please|Open|Note)\b[^.\n]{20,}\./g);
  return Boolean(sentences && sentences.length >= 2);
}

/** Drop trailing / embedded assistant chatter from CSS or markup. */
export function stripModelProseFromSource(path: string, content: string): string {
  const p = path.replace(/\\/g, '/');
  let text = String(content || '');
  if (!text) return text;

  if (/\.css$/i.test(p)) {
    const cut = text.search(
      /\n(?:#{1,6}\s*)?(?:The updated|To (?:link|verify|update)|Note that|Please |Open the |```|@@@FILE)/i,
    );
    if (cut > 40) text = text.slice(0, cut);
    text = text.replace(/\n?#{0,6}\s*@@@FILE\b[\s\S]*$/i, '');
    return `${text.trimEnd()}\n`;
  }

  if (/index\.html$/i.test(p)) {
    if (!/<!DOCTYPE html>/i.test(text) || looksLikeModelProseLeak(text)) {
      return '';
    }
    return text;
  }

  if (/\.(?:jsx|tsx|js|ts)$/i.test(p)) {
    // Strip trailing tool/prose dumps after a real component.
    const cutFile = text.search(/\n(?:#{1,6}\s*)?@@@FILE\b/i);
    if (cutFile > 80) text = text.slice(0, cutFile).trimEnd() + '\n';
    // "export default App;\nTo verify the changes…" — keep the export, drop the essay.
    text = text.replace(
      /(\nexport\s+default\s+[\w.]+;\s*)\n(?=[A-Z`*]|To\s+verify|Please\s|Note\s|Open\s|You\s+should)/i,
      '$1\n',
    );
    text = text.replace(
      /(\nexport\s+default\s+[\w.]+;\s*)\n[\s\S]*$/i,
      (full, keep) => {
        const rest = full.slice(keep.length);
        if (/@@@FILE|```|To verify|Please |Note that|You should|Open the/i.test(rest)) {
          return `${keep}\n`;
        }
        return full;
      },
    );
    // Invalid HTML comments inside JSX are model leftovers.
    text = text.replace(/<!--[\s\S]*?-->/g, '{/* */}');
    if (looksLikeModelProseLeak(text) && !/export\s+default/i.test(text)) {
      return '';
    }
    // If prose still trails a valid export, cut from first English sentence after export.
    if (/export\s+default/i.test(text) && looksLikeModelProseLeak(text)) {
      const exp = text.lastIndexOf('export default');
      if (exp > 0) {
        const semi = text.indexOf(';', exp);
        if (semi > exp) {
          const head = text.slice(0, semi + 1);
          const tail = text.slice(semi + 1);
          if (/To verify|Please |Note |You should|```|@@@FILE/i.test(tail)) {
            text = `${head}\n`;
          }
        }
      }
    }
    return text;
  }

  return text;
}

export function isValidViteIndexHtml(html: string): boolean {
  const t = String(html || '');
  return /<!DOCTYPE html>/i.test(t)
    && /id=["']root["']/i.test(t)
    && /src\/main\.(jsx|tsx)/i.test(t)
    && !looksLikeModelProseLeak(t);
}

/** Merge a Vite React shell under model App.* without wiping a good App.jsx. */
export function ensureViteReactProjectFiles(
  files: Record<string, string>,
  projectName: string,
): { files: Record<string, string>; repaired: string[] } {
  const next = { ...files };
  const repaired: string[] = [];
  const scaffold = buildScaffoldFiles('vite-react', { name: projectName });
  const scaffoldMap = Object.fromEntries(scaffold.map((f) => [f.path.replace(/\\/g, '/'), f.content]));

  for (const key of Object.keys(next)) {
    const cleaned = stripModelProseFromSource(key, next[key]);
    let body = cleaned;
    if (/(?:App\.(jsx|tsx|css)|index\.css|index\.html)$/i.test(key.replace(/\\/g, '/'))) {
      const upgraded = upgradePollinationsUrlsInSource(body, projectName);
      if (upgraded !== body) {
        body = upgraded;
        repaired.push(key);
      }
    }
    if (body !== next[key]) {
      next[key] = body;
      repaired.push(key);
    }
    if (!body && scaffoldMap[key]) {
      next[key] = scaffoldMap[key];
      repaired.push(key);
    }
  }

  const must = ['package.json', 'vite.config.js', 'index.html', 'src/main.jsx', 'src/index.css'];
  for (const path of must) {
    const cur = next[path] || '';
    if (!cur || (path === 'index.html' && !isValidViteIndexHtml(cur))) {
      next[path] = scaffoldMap[path];
      repaired.push(path);
    }
  }

  if (!(next['src/App.jsx'] || next['src/App.tsx'])) {
    next['src/App.jsx'] = scaffoldMap['src/App.jsx'];
    repaired.push('src/App.jsx');
  }
  // Models often ship `function App()` / `const App =` without export default — Preview can't mount it.
  for (const key of ['src/App.jsx', 'src/App.tsx']) {
    const body = next[key];
    if (!body || /export\s+default/i.test(body)) continue;
    if (/function\s+App\s*\(/.test(body)) {
      next[key] = body.replace(/function\s+App\s*\(/, 'export default function App(');
      repaired.push(key);
    } else if (/const\s+App\s*(?::[^=]+)?=/.test(body)) {
      next[key] = `${body.trimEnd()}\n\nexport default App;\n`;
      repaired.push(key);
    }
  }
    // Entrypoint written into App.* — drop the broken twin only; never inject canned UI.
    {
    const jsxBroken = looksLikeReactEntrypointSource(next['src/App.jsx'] || '');
    const tsxBroken = looksLikeReactEntrypointSource(next['src/App.tsx'] || '');
    if (jsxBroken || tsxBroken) {
      if (jsxBroken && next['src/App.tsx'] && !looksLikeReactEntrypointSource(next['src/App.tsx'] || '')) {
        delete next['src/App.jsx'];
        repaired.push('removed:src/App.jsx');
      } else if (tsxBroken && next['src/App.jsx'] && !looksLikeReactEntrypointSource(next['src/App.jsx'] || '')) {
        delete next['src/App.tsx'];
        repaired.push('removed:src/App.tsx');
      }
    }
  }
  // #6 Drop App.jsx / App.tsx twins — keep exactly one real App.* after Ready.
  {
    const twin = cleanupAppTwins(next);
    for (const key of Object.keys(next)) {
      if (!Object.prototype.hasOwnProperty.call(twin.files, key)) delete next[key];
    }
    Object.assign(next, twin.files);
    for (const drop of twin.removed) repaired.push(`removed:${drop}`);
  }
  if (!next['src/App.css'] || looksLikeModelProseLeak(next['src/App.css'])) {
    const css = stripModelProseFromSource('src/App.css', next['src/App.css'] || '');
    next['src/App.css'] = css && css.length > 20 ? css : scaffoldMap['src/App.css'];
    repaired.push('src/App.css');
  }

  // Drop static-web leftovers that steal Preview from Vite.
  for (const junk of ['css/styles.css', 'js/app.js', 'src/index.html']) {
    if (next[junk] != null) {
      delete next[junk];
      repaired.push(`removed:${junk}`);
    }
  }

  return { files: next, repaired: [...new Set(repaired)] };
}

export type PreviewReadyResult = {
  ok: boolean;
  reasons: string[];
};

/** Score an App.* body so twin cleanup keeps the real product UI. */
export function scoreAppSource(body: string): number {
  const s = String(body || '');
  if (!s.trim()) return -1;
  let n = s.length;
  if (looksLikeReactEntrypointSource(s)) n -= 8000;
  if (looksLikeFillerStubAppSource(s)) n -= 6000;
  if (/return\s*\(\s*<div className=["']app["']\s*\/>\s*\)/i.test(s)) n -= 5000;
  if (/return\s*\(\s*<div className=["']app["']\s*>\s*<\/div>\s*\)/i.test(s)) n -= 5000;
  if (/NOVA-search|Ask NOVA/i.test(s)) n -= 3000;
  if (!/export\s+default/i.test(s)) n -= 1500;
  if (/<h1[\s>]/i.test(s)) n += 2500;
  if (/<header[\s>]|<section[\s>]|<main[\s>]|<nav[\s>]/i.test(s)) n += 800;
  if (/\buse(?:State|Reducer)\s*\(/.test(s)) n += 1200;
  if (/\bon(?:Click|Change|Submit)\s*=/.test(s)) n += 600;
  if (/<[A-Za-z]/.test(s)) n += 400;
  if (s.length < 280) n -= 1200;
  return n;
}

/** Filler / demo copy the Free model often ships instead of a real product UI. */
export function looksLikeFillerStubAppSource(body: string): boolean {
  const s = String(body || '');
  if (!s.trim()) return false;
  if (/\b(?:this is a sample text|sample text|lorem ipsum|placeholder text|coming soon|hello world|your (?:app|site|content) here)\b/i.test(s)) {
    return true;
  }
  // Title + one short paragraph, no real landing structure.
  const tags = s.match(/<[A-Za-z]/g) || [];
  const hasBrandTitle = /<h1\b/i.test(s);
  const hasStructure = /<(?:section|header|footer|nav|main|article)\b/i.test(s);
  if (hasBrandTitle && !hasStructure && s.length < 700 && tags.length <= 6) {
    return true;
  }
  return false;
}

export function isEmptyOrStubAppSource(body: string): boolean {
  const s = String(body || '');
  if (!s.trim()) return true;
  if (looksLikeReactEntrypointSource(s)) return true;
  if (looksLikeFillerStubAppSource(s)) return true;
  if (/return\s*\(\s*<div className=["']app["']\s*\/>\s*\)/i.test(s)) return true;
  if (/return\s*\(\s*<div className=["']app["']\s*>\s*<\/div>\s*\)/i.test(s)) return true;
  if (s.length < 280 && !/<h1\b|<section\b|<header\b|<main\b|<nav\b|<canvas\b/i.test(s)) return true;
  if (s.length < 220 && /export\s+default\s+function\s+App/i.test(s) && !/useState|onClick|className=/.test(s)) return true;
  // Thin decorative shell: a couple buttons, no real structure / state.
  if (
    s.length < 500
    && /<button[\s>]/i.test(s)
    && !/\buse(?:State|Reducer)\s*\(/.test(s)
    && !/<h1\b|<section\b|<main\b/i.test(s)
  ) {
    return true;
  }
  return false;
}

/**
 * Restaurant/seafood/dinner briefs often get free-model coffee menus (espresso/latte).
 * Detect drink-name menus even when the code uses `Dish` / `dishes` identifiers.
 */
export function restaurantBriefBuiltAsCoffeeShop(app: string, brief: string): boolean {
  const b = String(brief || '');
  const a = String(app || '');
  if (!b.trim() || !a.trim()) return false;
  // Brief explicitly wants a cafe → coffee is correct.
  if (/\b(?:coffee\s*shop|caf[eé]|espresso\s*bar|roastery|roaster)\b/i.test(b)
    && !/\b(?:restaurant|seafood|dinner|coastal\s+kitchen|bistro)\b/i.test(b)) {
    return false;
  }
  const wantsFoodRestaurant = /\b(?:restaurant|bistro|seafood|dinner|coastal|kitchen|dishes?)\b/i.test(b)
    || /\b(?:landing\s+page|hero).{0,80}\b(?:menu|dishes?)\b/i.test(b);
  if (!wantsFoodRestaurant) return false;
  const coffeeDrinks = (a.match(/\b(?:espresso|cappuccino|latte|mocha|americano|macchiato|flat\s*white|cold\s*brew|cortado)\b/gi) || []).length;
  const foodSignals = (a.match(
    /\b(?:halibut|salmon|tuna|oyster|mussel|gnocchi|pasta|steak|entree|entr[eé]e|seafood|grill(?:ed)?|panna\s*cotta|risotto|chowder|bisque|dumpling|brassica|kitchen|dinner|dining)\b/gi,
  ) || []).length;
  // Two+ coffee drinks and no food signals = wrong product genre.
  if (coffeeDrinks >= 2 && foodSignals === 0) return true;
  // Older heuristic: coffee words without any restaurant-genre language in the App body.
  if (
    /\b(?:coffee|cafe|latte|espresso|mocha|roast)\b/i.test(a)
    && coffeeDrinks >= 1
    && !/\b(?:restaurant|seafood|entree|entr[eé]e|dinner|kitchen|galley|coastal)\b/i.test(a)
    && foodSignals === 0
  ) {
    return true;
  }
  return false;
}

/** Marketing / restaurant / landing briefs need real page depth before Preview Ready. */
export function briefLooksLikeMarketingLanding(brief: string): boolean {
  const t = String(brief || '');
  if (!t.trim()) return false;
  if (/\b(?:dashboard|kanban|inbox|workspace|transactions?|accounts?|todo|tracker|application)\b/i.test(t)
    && !/\b(?:landing|restaurant|cafe|menu|marketing)\b/i.test(t)) {
    return false;
  }
  return /\b(?:landing(?:\s+page)?|marketing\s+site|product\s+marketing|premium\s+product|apple\.com|restaurant|bistro|bakery|cafe|coffee\s+shop|roaster|menu\s+highlights|hero|tagline|dishes?|website)\b/i.test(t);
}

/**
 * #6 — When both App.jsx and App.tsx exist, keep exactly one real App.*.
 * Prefer the higher-scoring product UI; on a tie keep App.jsx (Vite resolves `./App` there first).
 */
export function cleanupAppTwins(
  files: Record<string, string>,
): { files: Record<string, string>; removed: string[]; kept: string | null } {
  const next = { ...files };
  const jsx = next['src/App.jsx'];
  const tsx = next['src/App.tsx'];
  if (jsx == null || tsx == null) {
    return {
      files: next,
      removed: [],
      kept: jsx != null ? 'src/App.jsx' : tsx != null ? 'src/App.tsx' : null,
    };
  }
  const jsxScore = scoreAppSource(jsx);
  const tsxScore = scoreAppSource(tsx);
  // Always collapse twins under stress — never leave both fighting for `./App`.
  let keep: 'src/App.jsx' | 'src/App.tsx';
  if (isEmptyOrStubAppSource(jsx) && !isEmptyOrStubAppSource(tsx)) {
    keep = 'src/App.tsx';
  } else if (isEmptyOrStubAppSource(tsx) && !isEmptyOrStubAppSource(jsx)) {
    keep = 'src/App.jsx';
  } else if (jsxScore >= tsxScore) {
    keep = 'src/App.jsx';
  } else {
    keep = 'src/App.tsx';
  }
  const drop = keep === 'src/App.jsx' ? 'src/App.tsx' : 'src/App.jsx';
  delete next[drop];
  return { files: next, removed: [drop], kept: keep };
}
export function looksLikeReactEntrypointSource(appSource: string | undefined | null): boolean {
  const s = String(appSource || '');
  if (!s.trim()) return false;
  if (/\bcreateRoot\s*\(/.test(s) && /\bimport\s+App\b/.test(s)) return true;
  if (/\bReactDOM\.(?:createRoot|render)\s*\(/.test(s) && /\bimport\s+App\b/.test(s)) return true;
  if (/from\s+['"]\.\/App['"]/.test(s) && /\brender\s*\(/.test(s)) return true;
  return false;
}

/** Neutral last-resort App when the model left an unusable shell (not genre-specific). */
export function buildLastResortInteractiveApp(projectName: string): { app: string; css: string } {
  const title = String(projectName || 'Studio').replace(/[`$\\]/g, '').trim() || 'Studio';
  return {
    app: `import { useState } from 'react';
import './App.css';

export default function App() {
  const [items, setItems] = useState([{ id: '1', text: 'First item', done: false }]);
  const [draft, setDraft] = useState('');
  return (
    <main className="app">
      <header className="hero">
        <h1>${title}</h1>
        <p className="lede">Working shell — add items and toggle them.</p>
      </header>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setItems((prev) => [{ id: String(Date.now()), text, done: false }, ...prev]);
          setDraft('');
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add item" aria-label="Add item" />
        <button type="submit">Add</button>
      </form>
      <ul className="list">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, done: !x.done } : x))}>
              {item.done ? 'Done' : 'Open'}
            </button>
            <span className={item.done ? 'done' : ''}>{item.text}</span>
            <button type="button" onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}>Remove</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
`,
    css: `:root { --bg:#12151c; --ink:#eef2f7; --muted:#9aa6b8; --accent:#6ee0c4; --line:rgba(255,255,255,.12); }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
.app { min-height: 100vh; padding: 2rem 1.25rem; max-width: 40rem; margin: 0 auto; }
.hero h1 { margin: 0 0 .5rem; font-size: clamp(2rem,5vw,3rem); }
.lede { color: var(--muted); }
.row { display: grid; grid-template-columns: 1fr auto; gap: .5rem; margin: 1rem 0; }
input, button { font: inherit; }
input { padding: .7rem .8rem; border-radius: .6rem; border: 1px solid var(--line); background: #0e1218; color: var(--ink); }
button { padding: .7rem .9rem; border-radius: .6rem; border: 0; background: var(--accent); color: #10221c; font-weight: 700; cursor: pointer; }
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: .45rem; }
.list li { display: grid; grid-template-columns: auto 1fr auto; gap: .6rem; align-items: center; padding: .65rem .7rem; border: 1px solid var(--line); border-radius: .6rem; }
.done { text-decoration: line-through; color: var(--muted); }
`,
  };
}

/**
 * Last-resort Vite marketing shell when the model left an unusable App.
 * Genre-neutral product homepage — NEVER a restaurant/halibut menu.
 */
export function buildLastResortMarketingApp(projectName: string): { app: string; css: string } {
  const title = String(projectName || 'Studio').replace(/[`$\\]/g, '').trim() || 'Studio';
  return {
    app: `import './App.css';

const features = [
  { n: '01', title: 'Material', body: 'Machined surfaces finished by hand for a quiet, lasting feel.' },
  { n: '02', title: 'Presence', body: 'A clear silhouette that holds a room without shouting.' },
  { n: '03', title: 'Craft', body: 'Every detail chosen for daily use, not display cases alone.' },
];

export default function App() {
  const year = new Date().getFullYear();
  return (
    <main className="app">
      <section className="hero" aria-labelledby="brand-name">
        <nav className="nav" aria-label="Main navigation">
          <a className="wordmark" href="#top" id="brand-name">${title}</a>
          <a className="nav-link" href="#story">Discover</a>
        </nav>
        <div className="hero-copy" id="top">
          <p className="eyebrow">Introducing ${title}</p>
          <h1>Made to be noticed<br /><em>quietly.</em></h1>
          <p className="lede">A premium product story with room to breathe.</p>
          <a className="button" href="#story">Explore ${title}</a>
        </div>
      </section>
      <section className="story" id="story">
        <h2>Designed for lasting presence.</h2>
        <p>Form, material, and motion work together so the first viewport feels intentional.</p>
      </section>
      <section className="features" aria-label="${title} details">
        {features.map((f) => (
          <article key={f.n}>
            <span className="n">{f.n}</span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </section>
      <footer className="footer">
        <strong>${title}</strong>
        <span>&copy; {year}</span>
      </footer>
    </main>
  );
}
`,
    css: `:root {
  --bg: #0a0c0f;
  --ink: #f2f4f7;
  --muted: #9aa3ad;
  --accent: #d7e4ff;
  --panel: #12161c;
  --display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --body: "Segoe UI", "Helvetica Neue", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--body); background: var(--bg); color: var(--ink); }
.app { min-height: 100vh; overflow-x: hidden; }
.hero {
  min-height: 88vh;
  padding: 1.5rem 4vw 3rem;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(900px 480px at 78% 18%, #2a3548 0%, transparent 55%),
    linear-gradient(180deg, #10141a, var(--bg));
}
.nav { display: flex; justify-content: space-between; align-items: center; }
.wordmark, .nav-link { color: inherit; text-decoration: none; }
.wordmark { font-weight: 700; letter-spacing: -0.04em; font-size: 1.25rem; }
.nav-link { color: var(--muted); }
.hero-copy { margin-top: auto; max-width: 36rem; padding-bottom: 8vh; }
.eyebrow {
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-size: 0.72rem;
}
.hero h1 {
  margin: 0.55rem 0 0.9rem;
  font-family: var(--display);
  font-weight: 400;
  font-size: clamp(2.8rem, 8vw, 5.2rem);
  line-height: 0.95;
}
.hero h1 em { font-style: italic; }
.lede { color: var(--muted); max-width: 28rem; line-height: 1.55; }
.button {
  display: inline-flex;
  margin-top: 1.3rem;
  padding: 0.85rem 1.2rem;
  border-radius: 999px;
  background: var(--accent);
  color: #10141a;
  text-decoration: none;
  font-weight: 700;
}
.story, .features, .footer { padding: 3.5rem 4vw; }
.story { background: #e8eaee; color: #12151a; }
.story h2 { margin: 0 0 0.8rem; font-family: var(--display); font-size: clamp(2rem, 4vw, 3rem); font-weight: 400; }
.story p { margin: 0; max-width: 34rem; color: #4a5360; line-height: 1.6; }
.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  background: var(--panel);
}
.features article { border-top: 1px solid rgba(255,255,255,.14); padding-top: 1rem; }
.features .n { color: #9eb6ff; font-size: 0.72rem; letter-spacing: 0.08em; }
.features h3 { margin: 1.4rem 0 0.6rem; font-family: var(--display); font-weight: 400; font-size: 1.6rem; }
.features p { margin: 0; color: var(--muted); max-width: 16rem; line-height: 1.55; }
.footer {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid rgba(255,255,255,.1);
  color: var(--muted);
  font-size: 0.85rem;
}
@media (max-width: 720px) {
  .features { grid-template-columns: 1fr; }
}
`,
  };
}

/** True when Preview/Localhost should show a real product shell, not a black empty window. */
export function isPreviewReady(
  files: Record<string, string>,
  opts?: { productName?: string; requireInteractive?: boolean; brief?: string },
): PreviewReadyResult {
  const reasons: string[] = [];
  const jsx = files['src/App.jsx'] || '';
  const tsx = files['src/App.tsx'] || '';
  // Prefer a real App component — never score an entrypoint (createRoot) as the product UI.
  const scoreApp = (body: string) => {
    if (!body) return -1;
    if (looksLikeReactEntrypointSource(body)) return 0;
    if (!/export\s+default/i.test(body)) return Math.min(body.length, 80);
    return body.length + (/<[A-Za-z]/.test(body) ? 200 : 0);
  };
  const app = scoreApp(jsx) >= scoreApp(tsx) ? jsx : tsx;
  const css = files['src/App.css'] || '';
  const indexCss = files['src/index.css'] || '';
  const cssBlob = `${css}\n${indexCss}`;
  const html = files['index.html'] || '';
  const pkg = files['package.json'] || '';
  const brief = String(opts?.brief || '');
  const blankSolid = blankSolidColorFromAsk(brief);

  // Intentional blank color shell (e.g. solid brown) — Preview is Ready when the empty
  // App paints that color. Do not demand a full landing page.
  if (blankSolid) {
    if (!pkg || !/"vite"/i.test(pkg)) reasons.push('missing Vite package.json');
    if (!isValidViteIndexHtml(html)) reasons.push('index.html is not a Vite entry');
    if (!files['src/main.jsx'] && !files['src/main.tsx']) reasons.push('missing src/main.jsx');
    if (!/export\s+default/i.test(app)) reasons.push('App.jsx has no default export');
    if (looksLikeReactEntrypointSource(app)) reasons.push('App.jsx looks like a Vite entry file, not a component');
    const emptyShell = /className=["']app["']\s*\/>/i.test(app)
      || /className=["']app["'][^>]*>\s*<\/div>/i.test(app);
    if (!emptyShell) reasons.push('blank-color ask should keep an empty App shell');
    const colorEsc = blankSolid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`background(?:-color)?\\s*:\\s*${colorEsc}`, 'i').test(cssBlob)) {
      reasons.push(`blank shell missing background ${blankSolid}`);
    }
    return { ok: reasons.length === 0, reasons };
  }

  if (!pkg || !/"vite"/i.test(pkg)) reasons.push('missing Vite package.json');
  if (!isValidViteIndexHtml(html)) reasons.push('index.html is not a Vite entry');
  if (!files['src/main.jsx'] && !files['src/main.tsx']) reasons.push('missing src/main.jsx');
  if (looksLikeReactEntrypointSource(app)) reasons.push('App.jsx looks like a Vite entry file, not a component');
  if (app.length < 120) reasons.push('App.jsx too thin');
  if (!/export\s+default/i.test(app)) reasons.push('App.jsx has no default export');
  if (looksLikeModelProseLeak(app) || looksLikeModelProseLeak(css)) reasons.push('model prose leaked into source');
  if (looksLikeTruncatedUiSource(app) || looksLikeTruncatedUiSource(css)) {
    reasons.push('App/CSS source looks truncated mid-write');
  }
  if (!/<[A-Za-z]|className=/.test(app) && !/getContext\s*\(\s*['"]2d['"]|canvas|requestAnimationFrame/i.test(app)) {
    reasons.push('App.jsx has no JSX UI');
  }
  // Empty shell only
  if (/return\s*\(\s*<div className=["']app["']\s*\/>\s*\)/i.test(app) && app.length < 200) {
    reasons.push('App is still an empty shell');
  }
  if (looksLikeFillerStubAppSource(app)) {
    reasons.push('App is still a filler stub (sample/placeholder text)');
  }
  if (/NOVA-search/i.test(app) || /NOVA-search/i.test(html)) {
    reasons.push('App still looks like a search chrome stub');
  }
  // Only treat top-bar as the NOVA stub when the App is still a thin toolbar shell.
  if (
    app.length < 900
    && /className=["']top-bar["']/i.test(app)
    && /className=["']search-bar["']/i.test(app)
    && !/<main[\s>]|<section[\s>]|<table[\s>]/i.test(app)
  ) {
    reasons.push('App still looks like a search chrome stub');
  }
  // Thin placeholder: default export returning a single empty/black div
  if (
    app.length < 400
    && /return\s*\(\s*<div[^>]*>\s*<\/div>\s*\)/i.test(app)
    && !/<(?:section|nav|header|main|canvas|button)/i.test(app)
  ) {
    reasons.push('App is a thin placeholder shell');
  }

  // Landing / restaurant / marketing: brand + one paragraph is never Ready.
  if (briefLooksLikeMarketingLanding(brief)) {
    const hasStructure = /<(?:section|header|footer|nav|main|article)\b/i.test(app)
      || /className=["'][^"']*\b(?:hero|menu|footer|nav|header)\b/i.test(app);
    const hasCta = /<(?:button|a)\b/i.test(app)
      || /\b(?:cta|order|reserve|book|explore|menu)\b/i.test(app);
    const cssLen = cssBlob.replace(/\s+/g, '').length;
    if (app.length < 2000) reasons.push('landing App.jsx too thin for a real page');
    if (!hasStructure) reasons.push('landing App missing sections (hero/menu/footer)');
    if (cssLen < 1500) reasons.push('landing CSS too thin');
    if (restaurantBriefBuiltAsCoffeeShop(app, brief)) {
      reasons.push('restaurant brief built as a coffee shop instead');
    }
    if (/\b(?:restaurant|menu|dishes?|cafe|bistro)\b/i.test(brief) && !/\b(?:menu|dish|price|\$\d)/i.test(app)) {
      reasons.push('restaurant/menu brief missing menu content');
    }
    if (!hasCta && /\b(?:cta|button|order|reserve|explore)\b/i.test(brief)) {
      reasons.push('landing App missing a primary CTA');
    }
  }

  const wantName = String(opts?.productName || '').trim();
  if (wantName && wantName.length >= 3 && !/^(new app|my app|app|on[\s-]?disk)$/i.test(wantName)) {
    const blob = `${app}\n${html}`;
    // Require the distinctive first token (Copper / Nightcord) so "Mug" alone never passes.
    const token = wantName.split(/\s+/).find((w) => w.length >= 4) || wantName.split(/\s+/)[0];
    if (token && token.length >= 3 && !new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(blob)) {
      reasons.push(`App is missing product brand "${wantName}"`);
    }
  }

  if (opts?.requireInteractive) {
    const hasState = /\buse(?:State|Reducer)\s*\(/.test(app);
    const hasSetter = /\bset[A-Z]\w*\s*\(/.test(app);
    const hasHandler = /\bon(?:Click|Change|Submit|Input|KeyDown|Toggle)\s*=/.test(app)
      || /\baddEventListener\s*\(/.test(app);
    if (!hasState) {
      reasons.push('App has no interactive React state');
    }
    if (!hasHandler) {
      reasons.push('App has no interactive handlers');
    }
    // Pretty shells often ship dead <button>s with no setState — fail Ready for app briefs.
    if (hasState && hasHandler && !hasSetter) {
      reasons.push('App handlers do not update state');
    }
    if (!hasState && /<button[\s>]/i.test(app)) {
      reasons.push('App is a pretty static shell (buttons without state)');
    }
  }

  // Generic CSS floor — empty / near-empty App.css is never Ready for a product UI.
  const cssLen = cssBlob.replace(/\s+/g, '').length;
  if (cssLen < 400 && !/getContext\s*\(\s*['"]2d['"]|canvas|requestAnimationFrame/i.test(app)) {
    reasons.push('App.css too thin');
  }

  // Local brand heroes on disk/in map must win over leftover Pollinations URLs.
  const hasLocalBrandRef = Object.keys(files).some((k) =>
    /(?:^|\/)public\/(?:logo|icons?|heroes?|hero|bg|photos?)\//i.test(k.replace(/\\/g, '/'))
  ) || /(?:src=["']\/(?:logo|icons?|heroes?|hero)|url\(['"]?\/(?:logo|icons?|heroes?|hero))/i.test(`${app}\n${cssBlob}`);
  if (/image\.pollinations\.ai/i.test(`${app}\n${cssBlob}`)) {
    reasons.push(hasLocalBrandRef
      ? 'still using Pollinations URLs while local brand assets exist'
      : 'Pollinations hotlinks are blocked for site creates — use Brand Assets / uploads');
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * True when the brief is a real app (dashboard / todo / workspace / “build an app”),
 * not a marketing cafe/landing page. Used for the interactive Ready depth gate (#5).
 */
export function briefRequiresInteractiveApp(brief: string): boolean {
  const t = String(brief || '');
  if (!t.trim()) return false;
  const looksMarketing = /\b(?:landing\s+page|marketing\s+site|cafe|coffee\s+shop|roaster|bistro|bakery|restaurant|portfolio\s+site|hero\s+with|menu\s+highlights)\b/i.test(t);
  const looksApp = /\b(?:app|application|dashboard|workspace|kanban|todo|tracker|inbox|editor|ledger|budget|notes?)\b/i.test(t)
    || /\b(?:build|create|make)\s+(?:an?\s+)?(?:app|application)\b/i.test(t)
    || /\b(?:useState|working\s+controls|multi-pane|interactive)\b/i.test(t);
  if (looksMarketing && !looksApp) return false;
  if (/\b(?:landing\s+page|marketing\s+site)\b/i.test(t) && !/\b(?:app|dashboard|workspace|interactive)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(?:build|create|make)\s+(?:an?\s+)?(?:app|application)\b/i.test(t)
    || /\b(?:todo|notes?|kanban|dashboard|workspace|tracker|inbox|ledger|budget)\b/i.test(t)
      && /\b(?:app|application|desktop|react|vite)\b/i.test(t)
    || /\b(?:interactive\s+app|working\s+controls|useState|multi-pane|swap\s+main\s+view)\b/i.test(t)
    || (/\b(?:workspace|dashboard|accounts?|transactions?|kanban|inbox)\b/i.test(t)
      && /\b(?:app|application|desktop)\b/i.test(t))
  );
}

/** If the model forgot the product name but built a real shell, stamp the brand into the header. */
export function ensureProductBrandInApp(
  files: Record<string, string>,
  productName: string,
): Record<string, string> {
  const name = String(productName || '').trim();
  if (!name || name.length < 2) return files;
  const token = name.split(/\s+/).find((w) => w.length >= 3) || name;
  const next = { ...files };
  for (const key of ['src/App.jsx', 'src/App.tsx']) {
    const body = next[key];
    if (!body) continue;
    if (new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(body)) continue;
    let updated = body;
    if (/<header[\s>]/i.test(updated)) {
      updated = updated.replace(
        /(<header[^>]*>)/i,
        `$1\n        <div className="brand"><strong>${name.replace(/[`$]/g, '')}</strong></div>`,
      );
    } else if (/<nav[\s>]/i.test(updated)) {
      updated = updated.replace(
        /(<nav[^>]*>)/i,
        `$1\n        <div className="brand"><strong>${name.replace(/[`$]/g, '')}</strong></div>`,
      );
    } else if (/className=["']app["'][^>]*>/i.test(updated)) {
      updated = updated.replace(
        /(className=["']app["'][^>]*>)/i,
        `$1\n      <div className="brand"><strong>${name.replace(/[`$]/g, '')}</strong></div>`,
      );
    }
    if (updated !== body) next[key] = updated;
  }
  return next;
}

/**
 * Playable FPS / canvas games must ship real controls — not a static CSS mock of walls/crates.
 * Used before claiming Ready on game creates.
 */
export function isPlayableGameReady(files: Record<string, string>): PreviewReadyResult {
  const base = isPreviewReady(files);
  const reasons = [...base.reasons];
  const app = files['src/App.jsx'] || files['src/App.tsx'] || files['js/app.js'] || '';
  const blob = `${app}\n${files['src/App.css'] || ''}\n${files['js/app.js'] || ''}`;

  if (app.length < 900) reasons.push('game App.jsx too thin for playable mechanics');
  if (!/\bgetContext\s*\(|<canvas\b/i.test(blob)) {
    reasons.push('no canvas');
  }
  if (!/\brequestAnimationFrame\b/i.test(blob)) {
    reasons.push('no requestAnimationFrame game loop');
  }
  // Prefer WASD / pointer-lock — arrow-only stubs are not FPS Ready.
  if (!/\b(?:KeyW|KeyA|KeyS|KeyD|keys\.KeyW|code\s*===\s*['"]Key[WASD]|wasd)\b/i.test(blob)
    && !/\b(?:event\.key\s*===\s*['"][wasd]['"])/i.test(blob)) {
    reasons.push('no WASD movement');
  }
  if (!/\b(?:requestPointerLock|pointerLockElement|movementX)\b/i.test(blob)) {
    reasons.push('no pointer-lock look');
  }
  // Require real shoot input — bare "click" alone matches score UIs and false-passes.
  if (!/\b(?:mousedown|mouseup|pointerdown|shoot|fire|hitscan|raycast|isShooting|gunfire)\b/i.test(blob)) {
    reasons.push('no shooting input');
  }
  // FPS briefs should not ship arrow-key top-down stubs as Ready.
  if (
    /\b(?:ArrowUp|ArrowDown|ArrowLeft|ArrowRight)\b/.test(blob)
    && !/\b(?:KeyW|KeyA|KeyS|KeyD|event\.key\s*===\s*['"][wasd]['"])\b/i.test(blob)
  ) {
    reasons.push('arrow-key stub without WASD');
  }
  // Classic thin fail: decorative .floor/.wall/.crate/.enemy divs with no loop.
  if (
    /\b(?:floor|wall|crate|enemy|crosshair)\b/i.test(blob)
    && !/\brequestAnimationFrame\b/i.test(blob)
    && app.length < 2500
  ) {
    reasons.push('CSS mock arena without a playable game loop');
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Pac-Man / Snake / Dino / top-down arcade — canvas + loop + keyboard, not FPS pointer-lock. */
export function isPlayableArcadeGameReady(files: Record<string, string>): PreviewReadyResult {
  const base = isPreviewReady(files);
  const reasons = [...base.reasons];
  const app = files['src/App.jsx'] || files['src/App.tsx'] || files['js/app.js'] || '';
  const blob = `${app}\n${files['src/App.css'] || ''}\n${files['js/app.js'] || ''}`;

  if (app.length < 600) reasons.push('arcade App.jsx too thin');
  if (!/\bgetContext\s*\(|<canvas\b/i.test(blob)) reasons.push('no canvas');
  if (!/\brequestAnimationFrame\b/i.test(blob)) reasons.push('no requestAnimationFrame game loop');
  if (
    !/\b(?:ArrowUp|ArrowDown|ArrowLeft|ArrowRight|KeyW|KeyA|KeyS|KeyD|keydown|keyup|Space|spacebar)\b/i.test(blob)
    && !/\bevent\.key\b/i.test(blob)
  ) {
    reasons.push('no keyboard controls');
  }
  if (
    /\b(?:floor|wall|crate|enemy|crosshair)\b/i.test(blob)
    && !/\brequestAnimationFrame\b/i.test(blob)
    && app.length < 2500
  ) {
    reasons.push('CSS mock without a playable game loop');
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}
