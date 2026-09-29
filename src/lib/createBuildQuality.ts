/**
 * Post-build hygiene for website creates: strip model prose, keep Vite entry valid,
 * and decide when Preview is actually safe to open.
 */

import { buildScaffoldFiles } from '@/lib/projectScaffolds';
import { upgradePollinationsUrlsInSource } from '@/lib/siteHeroImages';
import { looksLikeTruncatedUiSource, isBrokenReactAppSource, jsxSourceHasTypeScriptOnlySyntax, stripIllegalTsFromJsx, looksLikePlayableCanvasGame, looksLikeSpatialApp, looksLikeFpsGame } from '@/lib/freshSpaFromBrief';
import { blankSolidColorFromAsk } from '@/lib/webProjectCanon';
import { wantsChatAppScaffold } from '@/lib/webLandingFromBrief';
import type { CreateIdentity, CreatePalette } from '@/lib/createIdentity';
import { createIdentityFromBrief } from '@/lib/createIdentity';
import {
  buildProductSpec,
  scoreFunctionalReady,
  scoreLayoutQuality,
  type LayoutContract,
  type ProductSpec,
} from '@/lib/createLayoutContract';

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
  // Markdown / explanation dumps into CSS (common local-model failure).
  if (/^#{1,6}\s+\w+/m.test(t) && /(?:explanation|changes|styling|add the following|we'll add)/i.test(t)) {
    return true;
  }
  if (/^###\s+/m.test(t) && !/[{};:]/.test(t.slice(0, 200))) return true;
  // English paragraphs inside CSS/HTML that are not comments or string/JSX text.
  // Strip quotes first — sample book titles ("The Great Gatsby", "To Kill…") must not
  // trip Preview Ready (that false-failed QuietShelf).
  const withoutComments = t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const withoutStrings = withoutComments
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  const sentences = withoutStrings.match(
    /\b(?:The updated|We (?:can|will|should|need)|I (?:added|updated|changed|fixed|created)|This (?:file|code|component)|To (?:verify|link|update|open)|If you|Please |Open the|Note that)\b[^.\n]{12,}\./g,
  );
  return Boolean(sentences && sentences.length >= 1);
}

/**
 * Close dangling `{` blocks in CSS so PostCSS/Vite does not fail the module
 * (Unclosed block → App.css import throws → #root stays empty / blank Live).
 */
/**
 * PostCSS "Missed semicolon" blanks Live the same way an unclosed block does:
 * `justify-content:center position:relative` never loads App.css, so #root stays empty.
 */
export function healMissedCssSemicolons(css: string): string {
  const src = String(css || '');
  if (!src.trim()) return src;
  return src.replace(
    /([a-zA-Z_-][\w-]*\s*:\s*(?:[^;{}]|(\([^)]*\)))+?)(\s+)(?=[a-zA-Z_-][\w-]*\s*:)/g,
    (full, decl, _paren, space) => (/;\s*$/.test(decl) ? full : `${decl};${space}`),
  );
}

export function healUnbalancedCssBraces(css: string): string {
  let s = healMissedCssSemicolons(css);
  if (!s.trim()) return s;
  const stripped = s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
  let depth = 0;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth = Math.max(0, depth - 1);
  }
  if (depth > 0 && depth < 48) {
    s = `${s.replace(/\s*$/, '')}\n${'}'.repeat(depth)}\n`;
  }
  return s;
}

/** Count unclosed CSS `{` blocks (ignoring comments/strings). */
export function countUnclosedCssBlocks(css: string): number {
  const stripped = String(css || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
  let depth = 0;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth = Math.max(0, depth - 1);
  }
  return depth;
}

/**
 * Free models invent `src={logo}` / `src={heroImage}` without declaring them → ReferenceError blank Live.
 * Rewrite bare identifiers to on-disk hero paths (or a safe empty string when none exist).
 */
export function healUndefinedImgSrcBindings(app: string, heroes: string[] = []): string {
  let s = String(app || '');
  if (!s || !/\bsrc=\{[A-Za-z_$]/.test(s)) return s;
  const declared = new Set<string>();
  for (const m of s.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)) {
    declared.add(m[1]);
  }
  for (const m of s.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\b/g)) declared.add(m[1]);
  for (const m of s.matchAll(/\bimport\s+\*\s+as\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of s.matchAll(/\bimport\s+\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/i).pop()?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
    }
  }
  // Destructuring: const { logo, basketImage } = …
  for (const m of s.matchAll(/\b(?:const|let|var)\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':')[0]?.trim().split(/\s+as\s+/i).pop()?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
    }
  }
  const safe = new Set([
    'COVER_HREFS', 'undefined', 'null', 'true', 'false', 'window', 'document',
    'props', 'state', 'item', 'book', 'product', 'img', 'image', 'src',
  ]);
  let ni = 0;
  s = s.replace(/\bsrc=\{([A-Za-z_$][\w$]*)\}/g, (full, id: string) => {
    if (declared.has(id) || safe.has(id)) return full;
    // Member-like names that are usually props — leave alone if declared via props.
    if (/^(?:props|state)$/i.test(id)) return full;
    if (heroes.length) {
      const href = heroes[ni % heroes.length];
      ni += 1;
      return `src="${href}"`;
    }
    return 'src=""';
  });
  return s;
}

/** `items.map` with no `const items` throws and leaves #root empty. */
export function healUndeclaredItemsList(app: string, heroes: string[] = []): string {
  const s = String(app || '');
  if (!/\bitems\.map\s*\(/.test(s)) return s;
  if (/\b(?:const|let|var|function)\s+items\b/.test(s)) return s;
  const titles = [...s.matchAll(/item\.title\s*===\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const names = [...new Set(titles.length ? titles : ['iPhone', 'Mac', 'iPad', 'Watch', 'AirPods'])];
  const rows = names.map((title, i) => {
    const safe = title.replace(/['\\]/g, '');
    const icon = heroes.length ? heroes[i % heroes.length] : '/logo.svg';
    return `  { id: '${i + 1}', title: '${safe}', blurb: '${safe}', icon: '${icon}' }`;
  }).join(',\n');
  const decl = `const items = [\n${rows},\n];\n`;
  if (/(?:const\s+App\s*=\s*\([^)]*\)\s*=>\s*\{|function\s+App\s*\([^)]*\)\s*\{)/.test(s)) {
    return s.replace(
      /(const\s+App\s*=\s*\([^)]*\)\s*=>\s*\{|function\s+App\s*\([^)]*\)\s*\{)/,
      `$1\n  ${decl}`,
    );
  }
  return `${decl}${s}`;
}

/**
 * Product bands gated on selectedProduct === 'Mac' paint blank until a click —
 * nothing like apple.com. Unwrap those conditionals so every band is always on screen.
 */
export function healHiddenProductBands(app: string): string {
  let s = String(app || '');
  if (!s) return s;
  if (!/selectedProduct\s*===\s*['"][^'"]+['"]\s*&&/i.test(s)
    && !/\{selectedItem\s*&&/i.test(s)) {
    return s;
  }
  // {selectedProduct === 'Mac' && ( <>...</> )} → <>...</>
  s = s.replace(
    /\{\s*selectedProduct\s*===\s*['"][^'"]+['"]\s*&&\s*\(\s*<>\s*([\s\S]*?)\s*<\/>\s*\)\s*\}/gi,
    '$1',
  );
  s = s.replace(
    /\{\s*selectedProduct\s*===\s*['"][^'"]+['"]\s*&&\s*\(\s*([\s\S]*?)\s*\)\s*\}/gi,
    '$1',
  );
  // Drop unused selectedProduct state if nothing references it anymore.
  if (!/\bselectedProduct\b/.test(s.replace(/const\s*\[\s*selectedProduct[\s\S]*?\]\s*=\s*useState[^;]+;?/i, ''))) {
    s = s.replace(/const\s*\[\s*selectedProduct\s*,\s*setSelectedProduct\s*\]\s*=\s*useState\([^)]*\)\s*;?\s*/i, '');
    s = s.replace(/\s*onClick=\{\(\)\s*=>\s*setSelectedProduct\([^)]*\)\}/gi, '');
  }
  return s;
}

/** Brief asks for an apple.com-like full-bleed product homepage. */
export function briefLooksLikeAppleStyleHomepage(brief: string): boolean {
  const t = String(brief || '');
  if (!t.trim()) return false;
  if (/\bapple\.com\b/i.test(t)) return true;
  return /\b(?:iphone|mac|ipad|airpods)\b/i.test(t)
    && /\b(?:product\s+band|colorful\s+band|full[- ]?bleed|thin\s+nav|hero)\b/i.test(t);
}

/**
 * True when Mac / iPad / Watch / AirPods appear as real product stages —
 * not merely as thin-nav link text (which previously cleared Ready on Band-N stubs).
 */
export function appleHomepageHasProductBands(app: string): boolean {
  const src = String(app || '');
  if (!src.trim()) return false;
  if (/\bBand\s*[1-4]\b/i.test(src)) return false;
  // Strip chrome that often lists product names without owning a band.
  const body = src
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
    .replace(/className=["'][^"']*nav[^"']*["'][\s\S]*?(?=<(?:section|main|footer)\b)/gi, ' ');
  const products = ['Mac', 'iPad', 'Watch', 'AirPods'] as const;
  let hits = 0;
  for (const p of products) {
    const reHeading = new RegExp(`<(?:h[1-3]|p)\\b[^>]*>[^<]*\\b${p}\\b`, 'i');
    const reData = new RegExp(`(?:name|title|id)\\s*[:=]\\s*['"\`]${p}['"\`]`, 'i');
    const reSectionId = new RegExp(`<(?:section|div)\\b[^>]*(?:id|aria-label)=["'][^"']*\\b${p}\\b`, 'i');
    if (reHeading.test(body) || reData.test(body) || reSectionId.test(body)) hits += 1;
  }
  return hits >= 3;
}

/** Drop trailing / embedded assistant chatter from CSS or markup. */
function isTrailingAssistantProse(rest: string): boolean {
  const t = String(rest || '').trim();
  if (!t) return false;
  if (/@@@FILE|```|To verify|Please |Note that|You should|Open the|This enhanced|This completes/i.test(t)) return true;
  if (/^(?:Added|Updated|Done|Here|This |I (?:added|updated|changed|fixed)|The (?:updated|file))\b/i.test(t)) {
    return true;
  }
  // English sentence with no CSS/JS tokens.
  if (/^[A-Z][\w\s,',-]{8,}\.$/m.test(t) && !/[{};=<>]|className|import |export |function /.test(t)) {
    return true;
  }
  if (/This implementation includes|The page is designed to be/i.test(t)) return true;
  return false;
}

export function stripModelProseFromSource(path: string, content: string): string {
  const p = path.replace(/\\/g, '/');
  let text = String(content || '');
  if (!text) return text;

  if (/\.css$/i.test(p)) {
    // Whole-file markdown / explanation dump — drop entirely (caller restores scaffold).
    if (looksLikeModelProseLeak(text) && !/[{}]/.test(text.slice(0, 120))) {
      return '';
    }
    if (/^#{1,6}\s+/m.test(text.trim()) && text.includes('```')) {
      return '';
    }
    const cut = text.search(
      /\n(?:#{1,6}\s*)?(?:The updated|To (?:link|verify|update)|Note that|Please |Open the |Added |Updated |Done\.|Here(?:'s| is)|###\s|```|@@@FILE)/i,
    );
    if (cut > 40) text = text.slice(0, cut);
    // Trailing English lines that are not CSS (e.g. "Added the logo centered on screen.")
    text = text.replace(/\n[A-Z][A-Za-z][^;{}:\n]{8,}\.?\s*$/g, '');
    text = text.replace(/\n?#{0,6}\s*@@@FILE\b[\s\S]*$/i, '');
    // Cut trailing essay after the last CSS rule: `}\nThis implementation…`
    {
      const lastBrace = text.lastIndexOf('}');
      if (lastBrace > 40) {
        const tail = text.slice(lastBrace + 1);
        if (/This implementation|The page is designed|Here is|Note that|Please /i.test(tail)) {
          text = `${text.slice(0, lastBrace + 1).trimEnd()}\n`;
        }
      }
    }
    if (looksLikeModelProseLeak(text) && (text.match(/\{/g) || []).length < 1) {
      return '';
    }
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
    // Duplicate src= (data-url placeholder + {item.image}) — keep the expression.
    text = text.replace(/\ssrc=(["'])data:image[^"']*\1\s+(?=src=\{)/gi, ' ');
    text = text.replace(/\ssrc=(["'])[^"']*\1(\s+src=(["'])[^"']*\3)/g, '$2');
    // "export default App;\nAdded the logo…" / "To verify…" — keep the export, drop the essay.
    text = text.replace(
      /(\nexport\s+default\s+[\w.]+;\s*)\n[\s\S]*$/i,
      (full, keep) => {
        const rest = full.slice(keep.length);
        if (isTrailingAssistantProse(rest)) {
          return `${keep}\n`;
        }
        // Non-code trailing text after a complete export — always drop.
        const trimmed = rest.trim();
        if (
          trimmed
          && !/^(?:import |export |const |let |var |function |class |\/\/|\/\*|\}\)|;)/m.test(trimmed)
          && !/^[<{]/.test(trimmed)
        ) {
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
    if (/export\s+default/i.test(text)) {
      const exp = text.lastIndexOf('export default');
      if (exp > 0) {
        const semi = text.indexOf(';', exp);
        if (semi > exp) {
          const head = text.slice(0, semi + 1);
          const tail = text.slice(semi + 1);
          if (isTrailingAssistantProse(tail) || looksLikeModelProseLeak(text)) {
            if (isTrailingAssistantProse(tail) || /To verify|Please |Note |You should|```|@@@FILE|Added |Done\.|This enhanced|This completes/i.test(tail)) {
              text = `${head}\n`;
            }
          }
        } else {
          // `export default function App() { ... }\nThis enhanced…` — no semicolon form.
          const after = text.slice(exp);
          const lastBrace = after.lastIndexOf('}');
          if (lastBrace > 0) {
            const cutAt = exp + lastBrace + 1;
            const tail = text.slice(cutAt);
            if (
              tail.trim()
              && (
                isTrailingAssistantProse(tail)
                || /^(?:\s*)(?:This |The |Here |Note |Please |You |I |To |Added |Done)/m.test(tail)
                || looksLikeModelProseLeak(tail)
              )
            ) {
              text = `${text.slice(0, cutAt).trimEnd()}\n`;
            }
          }
        }
      }
    }
    // Always strip TS generics from .jsx/.js payloads before they hit disk.
    if (/\.jsx$/i.test(p) || /(?:^|\/)[^/]+\.js$/i.test(p)) {
      text = stripIllegalTsFromJsx(text);
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

  const mustJs = ['package.json', 'vite.config.js', 'index.html', 'src/main.jsx', 'src/index.css'];
  const mustTs = ['package.json', 'vite.config.ts', 'index.html', 'src/main.tsx', 'src/index.css'];
  const preferTs = Boolean(next['src/main.tsx'] || next['src/App.tsx'] || next['vite.config.ts'])
    && !next['src/main.jsx'];
  const must = preferTs ? mustTs : mustJs;
  for (const path of must) {
    const cur = next[path] || '';
    if (!cur || (path === 'index.html' && !isValidViteIndexHtml(cur))) {
      // Prefer matching scaffold language — never inject js main into a ts project.
      const fromMap = scaffoldMap[path];
      if (fromMap) {
        next[path] = fromMap;
        repaired.push(path);
      }
    }
  }
  // Drop language twins so Vite resolves one entry.
  if (next['src/main.jsx'] && next['src/main.tsx']) {
    if (preferTs) delete next['src/main.jsx'];
    else delete next['src/main.tsx'];
    repaired.push('removed:main-twin');
  }
  if (next['vite.config.js'] && next['vite.config.ts']) {
    if (preferTs) delete next['vite.config.js'];
    else delete next['vite.config.ts'];
    repaired.push('removed:vite-config-twin');
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
  // Generic scaffold copy models leave in place of real product names.
  if (/\bBook Title\s*\d+\b/i.test(s) || /\bA brief description of the book\b/i.test(s)) {
    return true;
  }
  if (/\bItem Title\s*\d+\b/i.test(s) || /\bProduct Name\s*\d+\b/i.test(s)) {
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

/**
 * Old Veopx / quiet-luxury stock copy. Fail Ready unless the brief asked for those phrases.
 */
export function looksLikeStockQuietLuxuryCopy(app: string, brief = ''): boolean {
  const s = String(app || '');
  if (!s) return false;
  const b = String(brief || '');
  // Brief explicitly requested this lookbook — allow it.
  if (/Light,?\s*distilled|Quiet by design|Presence without|Made for the in-between/i.test(b)) {
    return false;
  }
  let hits = 0;
  if (/Light,?\s*distilled/i.test(s)) hits += 1;
  if (/Quiet by design/i.test(s)) hits += 1;
  if (/Light that listens/i.test(s)) hits += 1;
  if (/Presence without\s+(?:the\s+)?noise/i.test(s)) hits += 1;
  if (/Made for the in-between/i.test(s)) hits += 1;
  if (/Meet\s+\w+\s+One/i.test(s)) hits += 1;
  return hits >= 2;
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
  // React.useState without importing React → Live paints black / blank (ReferenceError).
  if (appUsesReactNamespaceWithoutImport(s)) return true;
  return false;
}

/** True when App calls React.useX but never imports React — classic blank Live. */
export function appUsesReactNamespaceWithoutImport(body: string): boolean {
  const s = String(body || '');
  if (!/\bReact\.use(?:State|Effect|Memo|Callback|Ref|Reducer|Context|LayoutEffect|ImperativeHandle)\s*\(/.test(s)
    && !/\bReact\.createElement\s*\(/.test(s)
    && !/\bReact\.Fragment\b/.test(s)) {
    return false;
  }
  return !/\bimport\s+React\b|\bimport\s+\*\s+as\s+React\b/.test(s);
}

/**
 * Heal blank-Live crash: `React.useState` without `import React`,
 * or bare `useState(` / `useEffect(` without a hooks import.
 */
export function ensureReactImportForNamespace(app: string): string {
  let s = String(app || '');
  if (appUsesReactNamespaceWithoutImport(s)) {
    if (/^['"]use client['"];?\s*/.test(s)) {
      s = s.replace(/^(['"]use client['"];?\s*)/, `$1import React from 'react';\n`);
    } else {
      s = `import React from 'react';\n${s}`;
    }
  }
  const namedImport = s.match(/import\s+(?:React\s*,\s*)?\{([^}]*)\}\s*from\s*['"]react['"]/);
  const already = new Set(
    String(namedImport?.[1] || '')
      .split(',')
      .map((p) => p.trim().split(/\s+as\s+/i)[0].trim())
      .filter(Boolean),
  );
  const missing = ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef'].filter((h) =>
    new RegExp(`\\b${h}\\s*[<(]`).test(s)
    && !already.has(h)
    && !new RegExp(`\\bReact\\.${h}\\b`).test(s)
  );
  if (!missing.length) return s;
  if (namedImport) {
    const nextList = [...already, ...missing].join(', ');
    return s.replace(
      /import\s+(React\s*,\s*)?\{[^}]*\}\s*from\s*['"]react['"]/,
      (_m, reactPrefix) => `import ${reactPrefix || ''}{ ${nextList} } from 'react'`,
    );
  }
  if (/\bimport\s+React\s+from\s*['"]react['"]/.test(s)) {
    return s.replace(
      /\bimport\s+React\s+from\s*['"]react['"]/,
      `import React, { ${missing.join(', ')} } from 'react'`,
    );
  }
  if (/^['"]use client['"];?\s*/.test(s)) {
    return s.replace(/^(['"]use client['"];?\s*)/, `$1import { ${missing.join(', ')} } from 'react';\n`);
  }
  if (/import\s+['"]\.\/App\.css['"]/.test(s)) {
    return s.replace(
      /import\s+['"]\.\/App\.css['"];?/,
      `import './App.css';\nimport { ${missing.join(', ')} } from 'react';`,
    );
  }
  return `import { ${missing.join(', ')} } from 'react';\n${s}`;
}

/** Heal TS-only syntax written into .jsx so Vite Live does not crash. */
export function ensureJsxHasNoTypeScript(app: string): string {
  const s = String(app || '');
  if (!jsxSourceHasTypeScriptOnlySyntax(s)) return s;
  return stripIllegalTsFromJsx(s);
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

/**
 * Tiny one-screen toys: name dance, click counters, simple timers.
 * These must ship in seconds — never run marketing/landing polish for 20+ minutes.
 */
export function briefLooksLikeClickCounter(brief: string): boolean {
  const t = String(brief || '').trim();
  if (!t || t.length > 420) return false;
  if (/\b(?:landing|marketing|dashboard|discord|checkout|ecommerce)\b/i.test(t)) return false;
  const hasButton = /\bbutton\b/i.test(t);
  const hasCount = /\b(?:count(?:s|er|ing)?|how\s+many\s+times|click(?:s|ed|ing)?)\b/i.test(t);
  const simple = /\b(?:simple|basic|small|tiny|quick|just|only|page|site|app)\b/i.test(t) || t.length < 160;
  return hasButton && hasCount && simple;
}

export function briefLooksLikeTodoList(brief: string): boolean {
  // Create appends ensemble plan / contract — only score the user ask head so we
  // never miss "build a todo list" just because the brief grew past 420 chars.
  const raw = String(brief || '').trim();
  if (!raw) return false;
  const head = raw
    .split(/\n##\s+Ensemble|\n##\s+Layout contract|\ncreateV2 RULES:/i)[0]
    .trim()
    .slice(0, 520);
  const t = head || raw.slice(0, 520);
  if (/\b(?:landing\s+page|marketing\s+site|dashboard|discord|checkout|ecommerce|cafe|restaurant)\b/i.test(t)
    && !/\b(?:todo|to-?do|checklist|task\s*list)\b/i.test(t)) {
    return false;
  }
  const wantsTodo = /\b(?:todo(?:s)?|to-?dos?|to\s+do\s+list|checklist|task\s*list)\b/i.test(t);
  const wantsActions = /\b(?:add|check|delete|remove|complete|mark)\b/i.test(t) || t.length < 220;
  return wantsTodo && wantsActions;
}

export function briefLooksLikeSimpleTimer(brief: string): boolean {
  const t = String(brief || '').trim();
  if (!t || t.length > 360) return false;
  if (/\b(?:landing|marketing|dashboard|discord)\b/i.test(t)) return false;
  return /\b(?:timer|stopwatch|pomodoro|countdown)\b/i.test(t)
    && /\b(?:build|create|make|simple|basic|page|app|site)\b/i.test(t);
}

export function briefLooksLikeMicroWebToy(brief: string): boolean {
  const t = String(brief || '').trim();
  if (!t || t.length > 520) return false;
  // Explicit marketing / multi-section product sites are not toys.
  if (/\b(?:landing\s+page|marketing\s+site|restaurant|cafe|menu\s+highlights|apple\.com|product\s+band|quiet\s+luxury|dashboard|kanban|discord|slack|checkout|ecommerce)\b/i.test(t)) {
    return false;
  }
  if (looksLikePlayableCanvasGame(t) || looksLikeSpatialApp(t) || looksLikeFpsGame(t)) return false;
  if (briefLooksLikeClickCounter(t)) return true;
  if (briefLooksLikeTodoList(t)) return true;
  if (briefLooksLikeSimpleTimer(t)) return true;

  const wantsName = /\b(?:enter(?:\s+their)?\s+name|type\s+(?:your|their)\s+name|name\s+(?:input|field)|user(?:'s)?\s+name)\b/i.test(t)
    || (/\bname\b/i.test(t) && /\b(?:input|textbox|form|type|enter)\b/i.test(t));
  const wantsAnim = /\b(?:css\s+animation|@keyframes|animat(?:e|ion|ing)|danc(?:e|ing)|bounce|wiggle|float(?:ing)?|spin(?:ning)?)\b/i.test(t);
  const simpleSite = /\b(?:simple|basic|small|tiny|quick|just|only)\b/i.test(t)
    || /\b(?:website|site|page|app)\b/i.test(t);
  if (wantsName && wantsAnim) return true;
  if (wantsAnim && simpleSite && t.length < 280 && !/\b(?:hero|footer|nav|section|brand|marketing)\b/i.test(t)) {
    return true;
  }
  // Bare “CSS animation with X” micros.
  if (wantsAnim && /\b(?:with\s+(?:my|their|the|a)\s+name|name\s+danc)/i.test(t)) return true;
  return false;
}

/** @deprecated Micro prebuilt Ready gate removed — use isPreviewReady. */
export function isMicroWebToyReady(files: Record<string, string>): PreviewReadyResult {
  return isPreviewReady(files);
}

/** Marketing / restaurant / landing briefs need real page depth before Preview Ready. */
export function briefLooksLikeMarketingLanding(brief: string): boolean {
  const t = String(brief || '');
  if (!t.trim()) return false;
  // Tiny interactive toys (name dance, CSS animation demos) must NEVER use landing depth.
  if (briefLooksLikeMicroWebToy(t)) return false;
  // Games / 3D / interactive apps are never marketing landings — use playable/interactive Ready.
  if (looksLikePlayableCanvasGame(t) || looksLikeSpatialApp(t) || looksLikeFpsGame(t)) return false;
  if (/\b(?:dashboard|kanban|inbox|workspace|transactions?|accounts?|todo|tracker|application)\b/i.test(t)
    && !/\b(?:landing|restaurant|cafe|menu|marketing)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:game|playable|arcade|canvas\s+game|fps|shooter|three\.?js|webgl|3d\s+(?:app|editor|tool|model)|modeler)\b/i.test(t)
    && !/\b(?:landing\s+page|marketing\s+site|product\s+marketing|home\s*page|apple\.com|full[- ]?bleed)\b/i.test(t)) {
    return false;
  }
  // Bare "viewport" is layout jargon (first viewport) — not a 3D app ask.
  if (/\bviewport\b/i.test(t)
    && !/\b(?:three\.?js|webgl|3d|orbit|mesh|babylon|modeler)\b/i.test(t)
    && !/\b(?:landing|home\s*page|apple\.com|full[- ]?bleed|product\s+band)\b/i.test(t)) {
    return false;
  }
  // Quiet-luxury / product marketing sites — even when also "premium website" SPA signals.
  if (/\b(?:quiet\s+luxury|soft\s+(?:mint\s+|green\s+)?orbs?|scroll\s+to\s+reveal|product\s+marketing|premium\s+product|pc\s*case|gaming\s+pc|computer\s*case|mid[\s-]?tower)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:landing(?:\s+page)?|marketing\s+site|homepage|home\s+page|coffee\s+homepage)\b/i.test(t)) return true;
  // Do not let bare "website" / "hero" alone force landing depth — too many app/game briefs say that.
  return /\b(?:landing(?:\s+page)?|marketing\s+site|product\s+marketing|premium\s+product|quiet\s+luxury|apple\.com|restaurant|bistro|bakery|cafe|coffee\s+shop|roaster|menu\s+highlights|tagline|dishes?|soft\s+(?:green\s+)?orbs?|scroll\s+to\s+reveal|sign[- ]?in|login\s+page|cinematic|embark|platform\s+button|headphones?|earbuds?|headset|audio\s+product|luxur(?:y|ious)\s+(?:product|landing|site)|aquarium|saltwater|reef\s+shop|coral|fish\s+shop|pet\s+store|florist|flower\s+shop)\b/i.test(t);
}

/**
 * Rich product/marketing/chat create briefs that must not finish as a thin stub App marked success.
 * Bare “build me a website” stays scaffold-only; blank-color shells are excluded by the caller.
 */
export function briefNeedsCreateUiPolish(brief: string): boolean {
  const t = String(brief || '').trim();
  if (!t) return false;
  if (briefLooksLikeMicroWebToy(t)) return false;
  if (/^(?:build|create|make)\s+(?:me\s+)?(?:a\s+)?(?:simple\s+)?(?:website|site|app|project)\s*[.!]?\s*$/i.test(t)) {
    return false;
  }
  // Discord / Slack-style chat apps — even short “create Discord-like app with servers/channels”.
  if (t.length >= 16 && (
    wantsChatAppScaffold(t)
    || /\b(?:discord|slack)\b/i.test(t)
    || (/\bservers?\b/i.test(t) && /\bchannels?\b/i.test(t))
    || /\bchat\s+pane\b/i.test(t)
    || /\b(?:chat|messaging)\s+(?:web\s+)?app\b/i.test(t)
  )) {
    return true;
  }
  // Games / 3D / canvas apps — always polish thoroughly (never scaffold-only speedrun).
  if (t.length >= 16 && (
    looksLikePlayableCanvasGame(t)
    || looksLikeSpatialApp(t)
    || looksLikeFpsGame(t)
    || /\b(?:game|playable|arcade|three\.?js|webgl|3d\s+(?:app|editor|tool|scene)|modeler)\b/i.test(t)
  )) {
    return true;
  }
  // Hardware / brand / product-site asks — even when the ask is short (e.g. "keyboard landing page").
  // Do not require length ≥ 40 first; that previously skipped Logitech/gaming keyboard briefs.
  if (
    t.length >= 16
    && /\b(?:keyboard|gaming|logitech|razer|corsair|keychron|mechanical\s+keys?|pc\s*case|computer\s*case|chassis|mid[\s-]?tower|headphone|headphones|earbuds?|airpods?|beats|sony|bose|audio[- ]?technica|headset|earphones?|laptop|notebook|macbook|chromebook|ultrabook|computers?|bakery|florist|flower|watch(?:es)?|pastry|product\s+website|product\s+site|marketing\s+(?:site|landing|page)|landing\s+page|quiet\s+luxury|premium\s+(?:product|hardware|object)|soft\s+(?:green\s+)?orbs?)\b/i.test(t)
  ) {
    return true;
  }
  if (t.length < 40) return false;
  if (briefLooksLikeMarketingLanding(t)) return true;
  if (briefRequiresInteractiveApp(t)) return true;
  const structureHits = [
    /\bhero\b/i,
    /\b(?:nav|navigation|header)\b/i,
    /\bfooter\b/i,
    /\b(?:sections?|landing)\b/i,
    /\b(?:menu|hours|cta|tagline)\b/i,
    /\b(?:premium|product\s+(?:website|site|marketing))\b/i,
  ].filter((re) => re.test(t)).length;
  return structureHits >= 2 || (t.length >= 200 && structureHits >= 1);
}

/** True when the brief asks for a Discord/Slack-style multi-pane chat shell. */
export function briefLooksLikeChatApp(brief: string): boolean {
  const t = String(brief || '').trim();
  if (!t) return false;
  if (wantsChatAppScaffold(t)) return true;
  if (/\b(?:discord|slack)\b/i.test(t) && /\b(?:app|clone|like|chat|server|channel)\b/i.test(t)) return true;
  if (/\bservers?\b/i.test(t) && /\bchannels?\b/i.test(t) && /\b(?:chat|message|pane|rail)\b/i.test(t)) return true;
  return /\b(?:chat|messaging)\s+(?:web\s+)?app\b/i.test(t)
    && /\b(?:server|channel|dm|sidebar|rail|pane)\b/i.test(t);
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
  const hasMainJsx = next['src/main.jsx'] != null;
  const hasMainTsx = next['src/main.tsx'] != null;
  const jsxScore = scoreAppSource(jsx);
  const tsxScore = scoreAppSource(tsx);
  let keep: 'src/App.jsx' | 'src/App.tsx';
  // Always keep the real UI. Entry-file preference is only a tie-breaker —
  // never discard a centered brand / nav App.tsx just because main.jsx exists.
  if (isEmptyOrStubAppSource(jsx) && !isEmptyOrStubAppSource(tsx)) {
    keep = 'src/App.tsx';
  } else if (isEmptyOrStubAppSource(tsx) && !isEmptyOrStubAppSource(jsx)) {
    keep = 'src/App.jsx';
  } else if (Math.abs(jsxScore - tsxScore) < 800 && hasMainJsx && !hasMainTsx) {
    keep = 'src/App.jsx';
  } else if (Math.abs(jsxScore - tsxScore) < 800 && hasMainTsx && !hasMainJsx) {
    keep = 'src/App.tsx';
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
  // Model sometimes pastes main.tsx into App.tsx (createRoot + getElementById('root')).
  if (/\bcreateRoot\s*\(/.test(s) && /getElementById\s*\(\s*['"]root['"]/.test(s)) return true;
  if (/from\s+['"]react-dom\/client['"]/.test(s) && /\.render\s*\(/.test(s)) return true;
  return false;
}

export function stripEntrypointBleedFromApp(app: string): string {
  let s = String(app || '');
  if (!s) return s;
  const hadEntrypoint = looksLikeReactEntrypointSource(s) || /\bcreateRoot\s*\(/.test(s);
  if (!hadEntrypoint) return s;
  s = s.replace(/\n?import\s+\{\s*createRoot\s*\}\s+from\s+['"]react-dom\/client['"]\s*;?\s*/g, '\n');
  s = s.replace(/\n?createRoot\s*\([\s\S]*?\)\s*;?\s*/g, '\n');
  s = s.replace(/\n?ReactDOM\.(?:createRoot|render)\s*\([\s\S]*?\)\s*;?\s*/g, '\n');
  s = s.replace(/document\.getElementById\([^)]+\)!/g, '');
  if (!/export\s+default/i.test(s) && /(?:const|function)\s+App\b/.test(s)) {
    s = `${s.trimEnd()}\n\nexport default App;\n`;
  }
  return s.trimEnd() + '\n';
}

/** Neutral last-resort App when the model left an unusable shell (not genre-specific).
 * DEPRECATED NEVER CALL FROM CREATE — kept for smoke/helpers only. */
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
 * Discord/Slack-style multi-pane shell.
 * DEPRECATED NEVER CALL FROM CREATE — kept for smoke/helpers only.
 */
export function buildLastResortChatApp(projectName: string): { app: string; css: string } {
  const title = String(projectName || 'Chat').replace(/[`$\\]/g, '').trim() || 'Chat';
  const safe = title.replace(/'/g, "\\'");
  const initials = safe.slice(0, 2).toUpperCase() || 'NC';
  return {
    app: `import { useMemo, useState, type FormEvent } from 'react';
import './App.css';

type Server = { id: string; label: string; name: string };
type Channel = { id: string; name: string };
type Msg = { id: string; author: string; text: string };

const SERVERS: Server[] = [
  { id: 'home', label: '${initials}', name: '${safe}' },
  { id: 'devs', label: 'DV', name: 'Devs' },
  { id: 'games', label: 'GM', name: 'Games' },
];

const CHANNELS: { [key: string]: Channel[] } = {
  home: [
    { id: 'general', name: 'general' },
    { id: 'announcements', name: 'announcements' },
    { id: 'random', name: 'random' },
  ],
  devs: [
    { id: 'frontend', name: 'frontend' },
    { id: 'backend', name: 'backend' },
  ],
  games: [
    { id: 'lobby', name: 'lobby' },
    { id: 'lfg', name: 'looking-for-group' },
  ],
};

const SEED: { [key: string]: Msg[] } = {
  'home:general': [
    { id: '1', author: 'Nova', text: 'Welcome to ${safe} — pick a channel and say hello.' },
    { id: '2', author: 'Alex', text: 'Servers on the left, channels next, chat on the right.' },
  ],
  'home:announcements': [
    { id: '1', author: 'Nova', text: 'Ship notes land here.' },
  ],
  'home:random': [
    { id: '1', author: 'Sam', text: 'Off-topic lives here.' },
  ],
  'devs:frontend': [
    { id: '1', author: 'Jordan', text: 'UI threads for the app shell.' },
  ],
  'devs:backend': [
    { id: '1', author: 'Riley', text: 'API and realtime notes.' },
  ],
  'games:lobby': [
    { id: '1', author: 'Casey', text: 'Who is online?' },
  ],
  'games:lfg': [
    { id: '1', author: 'Morgan', text: 'Looking for a squad tonight.' },
  ],
};

export default function App() {
  const [serverId, setServerId] = useState('home');
  const [channelId, setChannelId] = useState('general');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(SEED);
  const channels = CHANNELS[serverId] || CHANNELS.home;
  const threadKey = \`\${serverId}:\${channelId}\`;
  const thread = messages[threadKey] || [];
  const server = useMemo(() => SERVERS.find((s) => s.id === serverId) || SERVERS[0], [serverId]);
  const channel = channels.find((c) => c.id === channelId) || channels[0];

  function selectServer(id: string) {
    setServerId(id);
    const next = (CHANNELS[id] || CHANNELS.home)[0];
    setChannelId(next.id);
  }

  function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => ({
      ...prev,
      [threadKey]: [...(prev[threadKey] || []), { id: String(Date.now()), author: 'You', text }],
    }));
    setDraft('');
  }

  return (
    <div className="app">
      <aside className="server-rail" aria-label="Servers">
        {SERVERS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === serverId ? 'server active' : 'server'}
            title={s.name}
            onClick={() => selectServer(s.id)}
          >
            {s.label}
          </button>
        ))}
      </aside>
      <aside className="channel-list" aria-label="Channels">
        <div className="guild-name">{server.name}</div>
        <p className="channel-heading">Text channels</p>
        <ul>
          {channels.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === channelId ? 'channel active' : 'channel'}
                onClick={() => setChannelId(c.id)}
              >
                <span className="hash">#</span> {c.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="chat-pane">
        <header className="chat-header">
          <strong><span className="hash">#</span> {channel.name}</strong>
          <span className="muted">{server.name}</span>
        </header>
        <div className="message-list" role="log" aria-live="polite">
          {thread.map((m) => (
            <article key={m.id} className="message">
              <div className="avatar" aria-hidden>{m.author.slice(0, 1)}</div>
              <div>
                <div className="meta"><strong>{m.author}</strong></div>
                <p>{m.text}</p>
              </div>
            </article>
          ))}
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={\`Message #\${channel.name}\`}
            aria-label="Message"
          />
          <button type="submit">Send</button>
        </form>
      </main>
    </div>
  );
}
`,
    css: `:root {
  --bg: #1e1f22;
  --rail: #0f1012;
  --panel: #2b2d31;
  --chat: #313338;
  --ink: #f2f3f5;
  --muted: #b5bac1;
  --accent: #5865f2;
  --line: rgba(255,255,255,.06);
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--ink); }
.app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 72px 240px 1fr;
  background: var(--bg);
}
.server-rail {
  background: var(--rail);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .65rem;
  padding: .85rem 0;
}
.server {
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 50%;
  background: #1e1f22;
  color: var(--ink);
  font-weight: 700;
  cursor: pointer;
}
.server.active, .server:hover { border-radius: 16px; background: var(--accent); }
.channel-list {
  background: var(--panel);
  padding: .9rem .75rem;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: .35rem;
}
.guild-name { font-weight: 700; font-size: .95rem; padding: .2rem .45rem .7rem; }
.channel-heading {
  margin: 0;
  padding: .35rem .45rem;
  font-size: .68rem;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--muted);
}
.channel-list ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .2rem; }
.channel {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--muted);
  border-radius: .45rem;
  padding: .45rem .55rem;
  cursor: pointer;
  font: inherit;
}
.channel.active, .channel:hover { background: rgba(255,255,255,.06); color: var(--ink); }
.hash { opacity: .7; margin-right: .15rem; }
.chat-pane {
  background: var(--chat);
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-width: 0;
}
.chat-header {
  display: flex;
  align-items: baseline;
  gap: .75rem;
  padding: .85rem 1rem;
  border-bottom: 1px solid var(--line);
}
.muted { color: var(--muted); font-size: .85rem; }
.message-list {
  overflow: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: .9rem;
}
.message { display: grid; grid-template-columns: 40px 1fr; gap: .75rem; }
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--accent);
  display: grid;
  place-items: center;
  font-weight: 700;
}
.message p { margin: .2rem 0 0; line-height: 1.45; }
.composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: .55rem;
  padding: .85rem 1rem 1.1rem;
}
.composer input {
  border: 0;
  border-radius: .55rem;
  background: #383a40;
  color: var(--ink);
  padding: .85rem 1rem;
  font: inherit;
}
.composer button {
  border: 0;
  border-radius: .55rem;
  background: var(--accent);
  color: white;
  font-weight: 700;
  padding: 0 1rem;
  cursor: pointer;
}
@media (max-width: 860px) {
  .app { grid-template-columns: 64px 1fr; }
  .channel-list { display: none; }
}
`,
  };
}

type MarketingShellCopy = {
  product: string;
  eyebrow: string;
  headline: string;
  lede: string;
  cta: string;
  storyEyebrow: string;
  storyHeadline: string;
  storyBody: string;
  storyCta: string;
  features: Array<{ n: string; title: string; body: string }>;
  accent: string;
  accentInk: string;
};

function marketingShellCopyFor(title: string, brief = ''): MarketingShellCopy {
  const t = String(brief || '');
  if (/\b(?:pc\s*case|computer\s*case|mid[\s-]?tower|full[\s-]?tower|chassis|gaming\s+pc|pc\s+gaming|buy\s+(?:a\s+)?(?:pc|case))\b/i.test(t)) {
    return {
      product: `${title} Tower`,
      eyebrow: `${title} · ATX / mATX`,
      headline: 'Mesh that means business.',
      lede: 'High-airflow gaming chassis with clean cable routes, GPU clearance, and a show-floor silhouette — built for serious builders.',
      cta: 'Browse the lineup',
      storyEyebrow: 'Inside the frame',
      storyHeadline: 'Clearance without compromise.',
      storyBody: `${title} towers keep radiators, vertical GPUs, and PSU shrouds in their lane. Tool-less panels. Routed channels. No wasted volume.`,
      storyCta: 'See the chassis',
      features: [
        { n: '01', title: 'Front mesh wall', body: 'High-intake mesh across the front plane for cooler GPU runs under load.' },
        { n: '02', title: 'Cable channels', body: 'Deep rear routes and PSU cover keep the showcase side clean.' },
        { n: '03', title: 'Glass + steel', body: 'Tempered side panel, rigid steel frame, mounts for modern ATX boards.' },
      ],
      accent: '#ff6a3d',
      accentInk: '#140801',
    };
  }
  return {
    product: `${title} One`,
    eyebrow: `Introducing ${title} One`,
    headline: 'Light, distilled.',
    lede: 'A singular object for your most considered spaces.',
    cta: `Meet ${title} One`,
    storyEyebrow: 'Made for the in-between',
    storyHeadline: 'Presence without the noise.',
    storyBody: `${title} turns a room into a place you want to remain. Its silhouette captures and softens light with quiet precision.`,
    storyCta: 'Explore the design',
    features: [
      { n: '01', title: 'Quiet by design', body: 'Every surface earns its place. Nothing decorative for its own sake.' },
      { n: '02', title: 'Light that listens', body: 'Ambient sensing adapts to the changing rhythms of your day.' },
      { n: '03', title: 'Built to last', body: 'Machined aluminum, hand-finished edges, materials meant for years of use.' },
    ],
    accent: '#c6e6c0',
    accentInk: '#132016',
  };
}

/**
 * Last-resort Vite marketing shell.
 * DEPRECATED NEVER CALL FROM CREATE — kept for smoke/helpers only.
 * Real /heroes/*.jpg slots (Brand Assets fill them) — never CSS orbs or fake silver blobs.
 */
export function buildLastResortMarketingApp(projectName: string, brief = ''): { app: string; css: string } {
  const title = String(projectName || 'Brand').replace(/[*/\\]/g, '').slice(0, 48) || 'Brand';
  const identity = createIdentityFromBrief(title, brief);
  const heroSrc = identity.heroHref;
  const storySrc = identity.heroQueries[1]
    ? `/heroes/${identity.heroQueries[1].id}.jpg`
    : heroSrc.replace(/-hero(\.|$)/, '-story$1');
  const copy = marketingShellCopyFor(title, brief);
  const featuresLiteral = JSON.stringify(copy.features, null, 2);
  const isPcCase = /\b(?:pc\s*case|computer\s*case|mid[\s-]?tower|chassis|gaming\s+pc)\b/i.test(`${title} ${brief}`);

  if (isPcCase) {
    return {
      app: `import './App.css';

const features = [
${featuresLiteral}
];

export default function App() {
  const year = new Date().getFullYear();
  return (
    <main className="app">
      <header className="top">
        <a className="mark" href="#top" id="brand-name">${title}</a>
        <nav className="links" aria-label="Primary">
          <a href="#story">Chassis</a>
          <a href="#features">Specs</a>
          <a className="buy" href="#features">Buy</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid">
          <div className="hero-text">
            <p className="kicker">${copy.eyebrow}</p>
            <h1>${copy.headline}</h1>
            <p className="lede">${copy.lede}</p>
            <div className="actions">
              <a className="cta" href="#features">${copy.cta}</a>
              <a className="ghost" href="#story">Tour the build</a>
            </div>
          </div>
          <figure className="hero-media">
            <img src="${heroSrc}" alt="${title} gaming PC case" />
          </figure>
        </div>
      </section>

      <section className="band" id="story">
        <figure className="band-media">
          <img src="${storySrc}" alt="${title} case interior" />
        </figure>
        <div className="band-copy">
          <p className="kicker dim">${copy.storyEyebrow}</p>
          <h2>${copy.storyHeadline}</h2>
          <p>${copy.storyBody}</p>
          <a className="text-link" href="#features">${copy.storyCta}</a>
        </div>
      </section>

      <section className="specs" id="features" aria-label="${title} specs">
        {features.map((f) => (
          <article key={f.n}>
            <span className="n">{f.n}</span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <footer className="foot">
        <span>${title}</span>
        <span>{year}</span>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  );
}
`,
      css: buildMarketingCompanionCss(title, brief, identity),
    };
  }

  // Lookbook layouts removed — DEPRECATED helper always returns the generic shop shell.
  return {
    app: `import './App.css';
import { useState } from 'react';

const products = [
  { name: '${title} One', blurb: 'Flagship for this brief.', price: '$48' },
  { name: '${title} Day', blurb: 'Everyday favorite.', price: '$28' },
  { name: '${title} Edit', blurb: 'Limited seasonal.', price: '$36' },
  { name: '${title} Bundle', blurb: 'Shareable set.', price: '$64' },
  { name: '${title} Classic', blurb: 'Always on the shelf.', price: '$22' },
  { name: '${title} Reserve', blurb: 'Weekend special.', price: '$42' },
];

export default function App() {
  const [q, setQ] = useState('');
  const [cart, setCart] = useState(0);
  const list = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="app">
      <nav className="sticky-nav">
        <div className="brand-wordmark">${title}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search" />
        <div className="cart-count">Cart: {cart}</div>
      </nav>
      <div className="hero">
        <img src="${heroSrc}" alt="${title}" />
      </div>
      <div className="product-grid">
        {list.map((p) => (
          <div className="product-card" key={p.name}>
            <h3>{p.name}</h3>
            <p>{p.blurb}</p>
            <p className="price">{p.price}</p>
            <button type="button" className="add-to-cart" onClick={() => setCart((c) => c + 1)}>Add to Cart</button>
          </div>
        ))}
      </div>
    </div>
  );
}
`,
    css: buildMarketingCompanionCss(title, brief, identity),
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
  // Include sibling components so split Header/Hero/Footer crafts are not scored as thin App-only.
  const uiBlob = [
    app,
    ...Object.entries(files)
      .filter(([p]) => /^src\/(?!main\.|index\.)[\w./-]+\.(jsx|tsx)$/i.test(p.replace(/\\/g, '/')))
      .map(([, body]) => String(body || '')),
  ].join('\n');
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
  if (
    /\b(?:useState|useEffect|useMemo|useCallback|useRef)\s*[<(]/.test(app)
    && !/\bimport\s+[^;]*\b(?:useState|useEffect|useMemo|useCallback|useRef)\b/.test(app)
    && !/\bReact\.(?:useState|useEffect|useMemo|useCallback|useRef)\b/.test(app)
  ) {
    reasons.push('App uses React hooks without importing them (would blank Live)');
  }
  if (looksLikeModelProseLeak(app) || looksLikeModelProseLeak(css)) reasons.push('model prose leaked into source');
  if (looksLikeTruncatedUiSource(app) || looksLikeTruncatedUiSource(css)) {
    reasons.push('App/CSS source looks truncated mid-write');
  }
  if (countUnclosedCssBlocks(css) > 0) {
    reasons.push('App.css has unclosed blocks (would blank Live)');
  }
  {
    const miss = createPolishMissingLocalImports(files);
    if (miss.length) {
      reasons.push(`App imports missing modules (${miss.slice(0, 3).join(', ')}) — would blank Live`);
    }
  }
  if (/\bsrc=\{([A-Za-z_$][\w$]*)\}/.test(app)) {
    const undeclared = [...app.matchAll(/\bsrc=\{([A-Za-z_$][\w$]*)\}/g)]
      .map((m) => m[1])
      .filter((id) => {
        if (/^(?:COVER_HREFS|undefined|null|true|false|props|state|item|book|product)$/.test(id)) return false;
        return !new RegExp(`\\b(?:const|let|var|function|import)\\s+${id}\\b`).test(app)
          && !new RegExp(`\\bimport\\s+\\{[^}]*\\b${id}\\b`).test(app);
      });
    if (undeclared.length) {
      reasons.push(`App references undeclared img src={${undeclared[0]}} (would blank Live)`);
    }
  }
  // App.css must be linked or Live stays browser-default.
  if (css && !(
    /import\s+['"]\.\/App\.css['"]/.test(app)
    || /import\s+['"]\.\/App\.css['"]/.test(files['src/main.jsx'] || '')
    || /import\s+['"]\.\/App\.css['"]/.test(files['src/main.tsx'] || '')
  )) {
    reasons.push('App.css present but not imported by App/main');
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
  if (looksLikeStockQuietLuxuryCopy(app, brief)) {
    reasons.push('App reused stock quiet-luxury demo copy instead of inventing this brand');
  }
  // Remote placeholder hosts break offline / in Electron Live.
  if (/via\.placeholder\.com|placehold\.co|placekitten\.com|picsum\.photos|dummyimage\.com/i.test(app)) {
    reasons.push('App uses broken remote placeholder image URLs');
  }
  if (/via\.placeholder\.com|placehold\.co|picsum\.photos/i.test(cssBlob)) {
    reasons.push('CSS references remote placeholder image hosts');
  }
  if (appUsesReactNamespaceWithoutImport(app)) {
    reasons.push('App uses React.* hooks without importing React (blank Live)');
  }
  // Hard gate: broken App shell, OR TypeScript-only syntax in .jsx (Vite babel crash).
  if (isBrokenReactAppSource(app)) {
    reasons.push('App source is broken or incomplete (would crash or blank Live)');
  }
  const appIsJsx = Boolean(jsx) && scoreApp(jsx) >= scoreApp(tsx);
  if (appIsJsx && jsxSourceHasTypeScriptOnlySyntax(app)) {
    reasons.push('src/App.jsx contains TypeScript syntax (Vite Live crash — strip types or use .tsx)');
  }
  for (const [path, body] of Object.entries(files)) {
    const norm = path.replace(/\\/g, '/');
    if (!/\.(?:jsx|js)$/i.test(norm)) continue;
    if (/node_modules|\.config\.|vite\.config|main\.(?:jsx|js)$/i.test(norm)) continue;
    if (norm === 'src/App.jsx') continue; // already checked
    if (jsxSourceHasTypeScriptOnlySyntax(String(body || ''))) {
      reasons.push(`${norm} contains TypeScript syntax (Vite Live crash — use plain JS or rename to .tsx)`);
    }
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
    const appleStyle = briefLooksLikeAppleStyleHomepage(brief);
    const hasStructure = /<(?:section|header|footer|nav|main|article)\b/i.test(uiBlob)
      || /className=["'][^"']*\b(?:hero|menu|footer|nav|header|sticky-nav|product-grid|grid|cards?|band)\b/i.test(uiBlob);
    const hasCta = /<(?:button|a)\b/i.test(uiBlob)
      || /\b(?:cta|order|reserve|book|explore|menu|purchase|add\s*to\s*cart|get\s+started|shop|learn\s+more)\b/i.test(uiBlob);
    const cssLen = cssBlob.replace(/\s+/g, '').length;
    const sectionCount = (uiBlob.match(/<(?:section|main|header|footer)\b/gi) || []).length
      + (uiBlob.match(/className=["'][^"']*\bhero\b/i) ? 1 : 0)
      + (uiBlob.match(/className=["'][^"']*\bband\b/i) ? 1 : 0);
    const hasPremiumCss = /gradient|radial-gradient|@keyframes|backdrop-filter|box-shadow|background-image/i.test(cssBlob);
    const hasMotion = /@keyframes|animation\s*:|transition\s*:/i.test(cssBlob);
    const hasHeroVisual = /\/heroes\/|<img\b|background-image|radial-gradient|full[- ]?bleed|\.hero\b/i.test(`${uiBlob}\n${cssBlob}`);
    const hasDiskHeroes = Object.keys(files).some((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp|svg)/i.test(p.replace(/\\/g, '/')));
    const wantsBooking = /\b(?:reserv|appointment|time\s*slot|book\s+(?:a\s+)?(?:table|appointment|slot))\b/i.test(brief)
      && !/\b(?:borrow|bookshelf|library|lend(?:ing)?|checked\s*out|return\s+button)\b/i.test(brief);
    // Quiet-luxury / orb aesthetic — never force this on apple.com-style product bands.
    const wantsPremium = !appleStyle && /\b(?:quiet[\s-]?luxury|luxur(?:y|ious)|editorial|serif|orb|vesper|distilled|atmosphere|cinematic|sign[- ]?in|embark|game\s+auth|lumenforge|headphones?|parchment|cream|sage|gold\s+light)\b/i.test(brief);
    const minApp = appleStyle ? 2200 : (wantsPremium ? (hasDiskHeroes ? 1800 : 2800) : (wantsBooking ? 2200 : 1800));
    const minCss = appleStyle ? 900 : (wantsPremium ? 1400 : (wantsBooking ? 1200 : 900));
    const uiLen = uiBlob.replace(/\s+/g, '').length;
    const depthOk = hasStructure && hasHeroVisual && (hasMotion || hasPremiumCss || appleStyle) && sectionCount >= 2;
    if (uiLen < minApp && app.length < minApp && !depthOk) {
      reasons.push('landing App.jsx too thin for a real page');
    }
    if (!hasStructure || sectionCount < 2) reasons.push('landing App missing sections (hero/menu/footer)');
    if (cssLen < minCss) reasons.push('landing CSS too thin');
    if (!appleStyle && !hasPremiumCss && cssLen < 2000) {
      reasons.push('landing CSS lacks premium depth (gradients, atmosphere, or motion)');
    }
    if (wantsPremium && !hasMotion) {
      reasons.push('premium landing missing CSS motion (@keyframes / animation)');
    }
    if (wantsPremium && !hasHeroVisual) {
      reasons.push('premium landing missing hero visual / atmospheric imagery');
    }
    // Marketing/auth pages that ship a blank white canvas as the "hero" are not Ready.
    if (
      wantsPremium
      && /<canvas\b/i.test(uiBlob)
      && !/<img\b/i.test(uiBlob)
      && /fillStyle\s*=\s*['"](?:white|#fff|rgba\(\s*255)/i.test(uiBlob)
    ) {
      reasons.push('premium landing used a blank canvas stub instead of a real hero visual');
    }
    if (wantsPremium && !/serif|Playfair|Iowan|Palatino|Georgia|Cormorant|Fraunces|Times New Roman/i.test(`${uiBlob}\n${cssBlob}`)) {
      reasons.push('premium landing missing serif display typography');
    }
    if (wantsPremium && !/orb|radial-gradient|glow|@keyframes|animation\s*:/i.test(`${uiBlob}\n${cssBlob}`)) {
      reasons.push('premium landing missing atmospheric light / orb treatment');
    }
    if (appleStyle) {
      if (!appleHomepageHasProductBands(uiBlob)) {
        reasons.push('apple-style homepage missing product bands (Mac / iPad / Watch / AirPods)');
      }
      if (!/<nav\b/i.test(uiBlob)) {
        reasons.push('apple-style homepage missing thin top nav');
      }
      if (/\bBuilt for general users\b/i.test(uiBlob) || /\bBand\s*[1-4]\b/i.test(uiBlob)) {
        reasons.push('apple-style homepage still uses stub copy (Band N / general users)');
      }
      if (/circle[^>]*r=["']?\d+/i.test(cssBlob + uiBlob) && /rx=["']?(?:36|46|48)/i.test(cssBlob + uiBlob)) {
        reasons.push('apple-style homepage still uses toy tablet hero bezel');
      }
      // Bands must be visual stages, not plain text paragraphs.
      const bandImgs = (uiBlob.match(/<(?:img|svg)\b/gi) || []).length
        + (cssBlob.match(/background(?:-image)?\s*:\s*[^;]*url\(/gi) || []).length;
      if (bandImgs < 2 && app.length < 4500) {
        reasons.push('apple-style homepage bands lack product-stage imagery');
      }
    }
    if (restaurantBriefBuiltAsCoffeeShop(uiBlob, brief)) {
      reasons.push('restaurant brief built as a coffee shop instead');
    }
    if (/\b(?:restaurant|menu|dishes?|cafe|bistro)\b/i.test(brief) && !/\b(?:menu|dish|price|\$\d)/i.test(uiBlob)) {
      reasons.push('restaurant/menu brief missing menu content');
    }
    if (!hasCta && /\b(?:cta|button|order|reserve|explore)\b/i.test(brief)) {
      reasons.push('landing missing a clear CTA');
    }
    // Wrong default export (export default Header) cannot mount a product page.
    if (/export\s+default\s+(Header|Hero|Footer|Nav|FeatureBand)\b/i.test(app)) {
      reasons.push('App.jsx default-exports a partial component instead of the page');
    }
    if (wantsBooking) {
      const hasState = /\buseState\b|\bReact\.useState\b/.test(uiBlob);
      const hasSlots = /\b(?:slot|time|schedule|select)\b/i.test(uiBlob);
      if (!hasState) reasons.push('booking landing needs interactive state (useState)');
      if (!hasSlots) reasons.push('booking landing missing time-slot / schedule UI');
    }
  }

  // Library / shelf borrow apps — not appointment booking.
  if (/\b(?:borrow|bookshelf|library\s+shelf|lend(?:ing)?\s+books?|checked\s*out|return\s+button|quiet\s*shelf)\b/i.test(brief)
    || /\b(?:borrow|bookshelf|library|lend)\b/i.test(brief) && /\b(?:book|journal|shelf|item)\b/i.test(brief)) {
    const hasBorrow = /\bborrow\b/i.test(app);
    const hasReturn = /\breturn\b/i.test(app) && /\bonClick|button/i.test(app);
    const fakeBooking = /\b(?:10:00\s*AM|time\s*slot|appointment)\b/i.test(app) && !hasReturn;
    const hasItemRows = (app.match(/<img\b/gi) || []).length >= 2
      || /className=["'][^"']*\b(?:item|card|row|product|shelf)\b/i.test(app);
    const hasFlexLayout = /display\s*:\s*flex|grid-template|flex-direction|gap\s*:/i.test(cssBlob);
    const logoAsCover = /background(?:-image)?\s*:\s*[^;]*url\(\s*['"]?\/logo\.svg/i.test(cssBlob)
      && /cover|100vw|100vh|center\s+center\/cover/i.test(cssBlob);
    const fillerTitles = /\bBook Title\s*\d+\b/i.test(app) || /\bA brief description of the book\b/i.test(app);
    const publicIconsOnDisk = Object.keys(files).some((p) => /public\/(?:logo\.svg|icons\/)/i.test(p.replace(/\\/g, '/')));
    const iconsWired = /\/logo\.svg|\/icons\/(?:bag|search|cart|menu)\.svg/i.test(app)
      || /\/logo\.svg/i.test(cssBlob);
    if (app.length < 1600) reasons.push('shelf/borrow App too thin');
    if (!hasBorrow) reasons.push('shelf brief missing borrow action');
    if (!hasReturn) reasons.push('shelf brief missing return flow');
    if (fakeBooking) reasons.push('shelf/borrow brief built as time-slot booking instead');
    if (!hasItemRows) reasons.push('shelf App missing browse item rows / images');
    if (!hasFlexLayout) reasons.push('shelf CSS missing real layout (flex/grid)');
    if (logoAsCover) reasons.push('logo.svg used as full-bleed background (giant mark)');
    if (fillerTitles) reasons.push('shelf App still uses filler Book Title copy');
    if (publicIconsOnDisk && !iconsWired) reasons.push('public icons/logo exist but are not used in the UI');
    if (cssBlob.replace(/\s+/g, '').length < 900) reasons.push('shelf CSS too thin');
    // Broken covers: /heroes/1.jpg or template ${item.id} when real files are slug-hero.jpg.
    const publicHeroNames = new Set(
      Object.keys(files)
        .map((p) => p.replace(/\\/g, '/'))
        .filter((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp|svg)$/i.test(p))
        .map((p) => p.replace(/^public\//i, '')),
    );
    if (publicHeroNames.size > 0) {
      if (/\/heroes\/\$\{|src=\{`\/heroes\//i.test(app)) {
        reasons.push('shelf App still uses dynamic /heroes/${…} paths instead of on-disk covers');
      }
      const numericRefs = [...app.matchAll(/\/heroes\/(\d+\.(?:jpe?g|png|webp))/gi)].map((m) => m[1]);
      if (numericRefs.some((r) => !publicHeroNames.has(`heroes/${r}`) && ![...publicHeroNames].some((n) => n.endsWith(r)))) {
        reasons.push('shelf App references /heroes/N.jpg files that are missing on disk');
      }
      // Invented names like /heroes/gatsby.jpg while only quietshelf-hero.jpg exists.
      const namedRefs = [...app.matchAll(/\/heroes\/([a-z0-9._-]+\.(?:jpe?g|png|webp))/gi)].map((m) => m[1].toLowerCase());
      const missingNamed = namedRefs.filter((r) => !publicHeroNames.has(`heroes/${r}`) && ![...publicHeroNames].some((n) => n.toLowerCase().endsWith(r)));
      if (missingNamed.length) {
        reasons.push(`shelf App references missing cover files (${missingNamed.slice(0, 3).join(', ')})`);
      }
      // Detect wiped binary heroes (@@@FILE wrote marker/empty over real JPGs).
      for (const [p, body] of Object.entries(files)) {
        const norm = p.replace(/\\/g, '/');
        if (!/public\/heroes\/.+\.(?:jpe?g|png|webp)$/i.test(norm)) continue;
        const b = String(body || '');
        if (b && b.length < 400 && (/on-disk asset|\/\* binary|ASSET:/i.test(b) || !/[\x00-\x08\x80-\xff]/.test(b))) {
          // Empty string is OK (presence marker). Non-empty tiny ASCII means overwrite corruption.
          if (b.trim()) reasons.push('hero image was overwritten with placeholder text');
        }
      }
    }
  }

  // Chat / messaging apps: require a working interactive shell — not Discord-specific chrome classes.
  if (briefLooksLikeChatApp(brief)) {
    const cssLenChat = cssBlob.replace(/\s+/g, '').length;
    const hasMultiPane = /<(?:aside|nav|main|section)\b/i.test(app)
      || /className=["'][^"']*\b(?:sidebar|rail|pane|panel|channels?|servers?|messages?|composer|inbox)\b/i.test(app);
    const hasComposer = /<(?:input|textarea)\b/i.test(app)
      || /\b(?:composer|send|message)\b/i.test(app);
    if (app.length < 1200) reasons.push('chat App.jsx too thin for a messaging shell');
    if (!hasMultiPane) reasons.push('chat App missing multi-pane layout');
    if (!hasComposer) reasons.push('chat App missing message composer');
    if (cssLenChat < 600) reasons.push('chat CSS too thin');
    if (looksLikeFillerStubAppSource(app)) {
      reasons.push('chat App is still a title splash, not a messaging shell');
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
    // Reject leftover demo brands when building a different product.
    if (!/\bnightglass\b/i.test(wantName) && /\bNightglass\b/.test(app) && token && token.length >= 4) {
      reasons.push('App still shows Nightglass instead of this product');
    }
  }

  if (opts?.requireInteractive) {
    // Match useState(…) and useState<number[]>(…) / useReducer<…>(…).
    const hasState = /\buse(?:State|Reducer)(?:\s*<[^>\n]+>)?\s*\(/.test(app);
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
  if (briefLooksLikeChatApp(t)) return true;
  // Booking / reservation / marketplace products always need interactive depth.
  if (/\b(?:book|reserv|time\s*slot|appointment|check(?:ed)?\s*out|borrow|share)\b/i.test(t)
    && /\b(?:tool|slip|trail|marina|shed|neighbor|garden|service|slot)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:book|reserv|appointment|time\s*slot)\b/i.test(t)
    && /\b(?:site|app|web|page|simple)\b/i.test(t)) {
    return true;
  }
  const looksMarketing = /\b(?:landing\s+page|marketing\s+site|cafe|coffee\s+shop|roaster|bistro|bakery|restaurant|portfolio\s+site|hero\s+with|menu\s+highlights)\b/i.test(t);
  const looksApp = /\b(?:app|application|dashboard|workspace|kanban|todo|tracker|inbox|editor|ledger|budget|notes?)\b/i.test(t)
    || /\b(?:build|create|make)\s+(?:an?\s+)?(?:[\w-]+\s+){0,4}(?:app|application)\b/i.test(t)
    || /\b(?:useState|working\s+controls|multi-pane|interactive)\b/i.test(t);
  if (looksMarketing && !looksApp) return false;
  if (/\b(?:landing\s+page|marketing\s+site)\b/i.test(t) && !/\b(?:app|dashboard|workspace|interactive)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(?:build|create|make)\s+(?:an?\s+)?(?:[\w-]+\s+){0,4}(?:app|application)\b/i.test(t)
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

/**
 * Pick the right Preview Ready gate for this brief — games/3D/apps must not use marketing landing depth.
 */
export function previewReadyForBrief(
  files: Record<string, string>,
  opts?: {
    productName?: string;
    brief?: string;
    requireInteractive?: boolean;
    spec?: ProductSpec | null;
    contract?: LayoutContract | null;
  },
): PreviewReadyResult {
  const brief = String(opts?.brief || '');
  // apple.com-style product homepages must never use the 3D/spatial gate
  // (layout recipes say "first viewport" which used to false-positive).
  if (briefLooksLikeAppleStyleHomepage(brief) || briefLooksLikeMarketingLanding(brief)) {
    const base = isPreviewReady(files, {
      ...opts,
      requireInteractive: Boolean(opts?.requireInteractive) && !briefLooksLikeAppleStyleHomepage(brief),
    });
    const reasons = [...base.reasons];
    const spec = opts?.spec || buildProductSpec({
      brief,
      productName: opts?.productName || '',
    });
    const layout = scoreLayoutQuality(files, { brief, spec, contract: opts?.contract || null });
    const functional = scoreFunctionalReady(files, { brief, spec });
    for (const r of layout.reasons) reasons.push(r);
    for (const r of functional.reasons) reasons.push(r);
    return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
  }
  if (looksLikeFpsGame(brief)) return isPlayableGameReady(files);
  if (looksLikePlayableCanvasGame(brief)) return isPlayableArcadeGameReady(files);
  if (looksLikeSpatialApp(brief)) {
    const base = isPreviewReady(files, { ...opts, requireInteractive: true });
    const reasons = [...base.reasons];
    const app = files['src/App.jsx'] || files['src/App.tsx'] || '';
    const pkg = files['package.json'] || '';
    if (!/\bthree\b/i.test(pkg) && !/\bfrom\s+['"]three['"]/i.test(app)) {
      reasons.push('3D brief missing three.js dependency or import');
    }
    if (!/<canvas\b|\bWebGLRenderer\b|\bTHREE\b/i.test(app) && app.length < 1800) {
      reasons.push('3D App missing canvas / WebGL scene');
    }
    return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
  }
  const marketing = briefLooksLikeMarketingLanding(brief);
  const commerce = /\b(?:cart|checkout|booking|reserv|borrow)\b/i.test(brief);
  const needsInteractive = (!marketing || commerce) && (
    Boolean(opts?.requireInteractive)
    || briefRequiresInteractiveApp(brief)
    || briefLooksLikeChatApp(brief)
  );
  const base = isPreviewReady(files, { ...opts, requireInteractive: needsInteractive });
  const reasons = [...base.reasons];
  const spec = opts?.spec || buildProductSpec({
    brief,
    productName: opts?.productName || '',
  });
  const layout = scoreLayoutQuality(files, { brief, spec, contract: opts?.contract || null });
  const functional = scoreFunctionalReady(files, { brief, spec });
  for (const r of layout.reasons) reasons.push(r);
  for (const r of functional.reasons) reasons.push(r);
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** True when App already has multi-section landing structure (keep it; don't revert to stub). */
export function appLooksLikeStructuredLanding(app: string): boolean {
  const s = String(app || '');
  if (s.length < 1400) return false;
  if (looksLikeFillerStubAppSource(s)) return false;
  const catalogHits = [
    /className=["'][^"']*\b(?:product-grid|product-card|product-cards)\b/i.test(s),
    /className=["'][^"']*\b(?:sticky-nav|nav|header)\b/i.test(s) || /<(?:nav|header)\b/i.test(s),
    /className=["'][^"']*\bhero\b/i.test(s) || /<(?:section|main)\b/i.test(s),
  ].filter(Boolean).length;
  if (catalogHits >= 3) return true;
  const structureHits = [
    /<(?:header|nav)\b/i.test(s),
    /<(?:section|main)\b/i.test(s) || /className=["'][^"']*\bhero\b/i.test(s),
    /<footer\b/i.test(s) || /className=["'][^"']*\bfooter\b/i.test(s),
  ].filter(Boolean).length;
  return structureHits >= 2;
}

/** Tiny inline SVG tile — works offline in Electron Live (no remote host). */
function inlineShelfSvgDataUri(label: string, hue: number): string {
  const safe = String(label || 'Item').replace(/[<>&"']/g, '').slice(0, 18);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="hsl(${hue} 28% 22%)"/><stop offset="100%" stop-color="hsl(${hue} 18% 12%)"/>
</linearGradient></defs>
<rect width="640" height="480" fill="url(#g)"/>
<rect x="48" y="48" width="544" height="384" rx="28" fill="hsla(40,30%,92%,0.08)" stroke="hsla(40,20%,85%,0.25)"/>
<text x="320" y="260" text-anchor="middle" fill="hsla(40,25%,92%,0.92)" font-family="Georgia,serif" font-size="42">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const REMOTE_PLACEHOLDER_HOST =
  /via\.placeholder\.com|placehold\.co|placekitten\.com|picsum\.photos|dummyimage\.com/i;

/**
 * Replace fake / broken remote placeholder image hosts with offline-safe data URIs.
 * via.placeholder.com / placehold.co break Electron Live and leave overlapping alt text.
 */
export function sanitizeCreatePolishPlaceholders(app: string): string {
  let next = String(app || '');
  let n = 0;
  const swap = (label?: string) => {
    n += 1;
    return inlineShelfSvgDataUri(label || `Item ${n}`, 28 + (n * 37) % 300);
  };

  next = next.replace(/src=(["'])\/path\/to\/[^"']+\1/gi, (_m, q) => `src=${q}${swap('Item')}${q}`);
  next = next.replace(/url\((['"]?)\/path\/to\/[^)"']+\1\)/gi, () => `url(${swap('Item')})`);

  next = next.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/src=(["'])([^"']*)\1/i)?.[2] ?? '';
    const needsFix = !src
      || REMOTE_PLACEHOLDER_HOST.test(src)
      || /\/path\/to\//i.test(src);
    if (!needsFix) return tag;
    const alt = tag.match(/alt=(["'])([^"']*)\1/i)?.[2] || 'Item';
    const uri = swap(alt);
    if (/src=(["'])[^"']*\1/i.test(tag)) {
      return tag.replace(/src=(["'])[^"']*\1/i, `src=$1${uri}$1`);
    }
    return tag.replace(/<img\b/i, `<img src="${uri}"`);
  });

  next = next.replace(
    /url\((['"]?)https?:\/\/(?:via\.placeholder\.com|placehold\.co|placekitten\.com|picsum\.photos|dummyimage\.com)[^)"']*\1\)/gi,
    () => `url(${swap('Item')})`,
  );
  return next;
}

/**
 * Free 7B coders often split Header/Hero/Footer into sibling files and leave
 * App.jsx exporting only Header (or a thin shell). Collapse into one App so
 * Live mounts a real page and Ready can see sections.
 */
export function assembleCreateAppFromParts(
  files: Record<string, string>,
  productName = 'App',
): { files: Record<string, string>; changed: string[] } {
  const next = { ...files };
  const changed: string[] = [];
  const appKey = next['src/App.jsx']
    ? 'src/App.jsx'
    : (next['src/App.tsx'] ? 'src/App.tsx' : '');
  if (!appKey) return { files: next, changed };

  const brand = String(productName || 'Brand').replace(/[<>&'"`]/g, '').slice(0, 48) || 'Brand';
  const app = String(next[appKey] || '');
  const siblingBodies: string[] = [];
  for (const [p, body] of Object.entries(next)) {
    const norm = p.replace(/\\/g, '/');
    if (!/^src\/(?!main\.|index\.)[\w./-]+\.(jsx|tsx)$/i.test(norm)) continue;
    siblingBodies.push(String(body || ''));
  }
  const blob = siblingBodies.join('\n');
  const wrongDefault = /export\s+default\s+(Header|Hero|Footer|Nav|FeatureBand|Feature|Banner)\b/i.test(app);
  const thinOrShell = app.replace(/\s+/g, '').length < 2200
    || !/<(?:section|main|footer)\b/i.test(app)
    || (/export\s+default\s+Header\b/i.test(app));
  const hasSplitParts = /const\s+(Header|Hero|Footer|FeatureBand)\b/i.test(blob)
    || Object.keys(next).some((p) => /src\/(?:Header|Hero|Footer|Feature)/i.test(p.replace(/\\/g, '/')));
  // App imports ./components/Navbar etc. that were never written — blank Live.
  const missingLocal = createPolishMissingLocalImports(next);
  const hasMissingComponents = missingLocal.some((s) =>
    /components\//i.test(s)
    || /\/(?:Navbar|Nav|Header|Hero|Footer|FeatureBand|Feature|Banner)\b/i.test(s),
  );
  if (!wrongDefault && !(thinOrShell && hasSplitParts) && !hasMissingComponents) {
    return { files: next, changed };
  }

  const extractInner = (src: string): string => {
    const m = String(src || '').match(/return\s*\(\s*([\s\S]*?)\s*\);/);
    return m ? m[1].trim() : '';
  };
  let headline = '';
  let lede = '';
  // Prefer copy already on the App shell (e.g. <Hero title="Glow soft" lede="…"/>).
  const titleProp = app.match(/<(?:Hero|Banner)\b[^>]*\btitle=["']([^"']+)["']/i)
    || app.match(/<(?:h1|h2)\b[^>]*>([^<]{3,80})<\/(?:h1|h2)>/i);
  const ledeProp = app.match(/<(?:Hero|Banner)\b[^>]*\blede=["']([^"']+)["']/i);
  if (titleProp) headline = titleProp[1].trim();
  if (ledeProp) lede = ledeProp[1].trim();
  for (const body of siblingBodies) {
    if (/const\s+Hero\b|function\s+Hero\b|className=["']headline["']/i.test(body)) {
      const h = body.match(/<h1[^>]*>([^<]{3,80})<\/h1>/i);
      const p = body.match(/<(?:p)[^>]*className=["'][^"']*lede[^"']*["'][^>]*>([^<]{3,160})<\/p>/i)
        || body.match(/<(?:p)[^>]*>([^<]{12,160})<\/p>/i);
      if (h && !headline) headline = h[1].trim();
      if (p && !lede) lede = p[1].trim();
    }
  }
  if (!headline) {
    const h2 = blob.match(/<h1[^>]*>([^<]{3,80})<\/h1>/i);
    if (h2) headline = h2[1].trim();
  }
  headline = headline || 'Crafted with care.';
  lede = lede || `${brand} — a quiet luxury product made to last.`;

  const heroes = Object.keys(next)
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp)$/i.test(p))
    .map((p) => '/' + p.replace(/^public\//i, ''));
  const heroSrc = heroes[0] || `/heroes/${brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand'}-hero.jpg`;

  const headerInner = extractInner(siblingBodies.find((b) => /const\s+Header\b|function\s+Header\b/i.test(b)) || '')
    || `<header className="header sticky-nav" role="banner">
        <a className="brand-wordmark" href="#top">${brand}</a>
        <nav>
          <a className="nav-link" href="#discover">Discover</a>
          <a className="nav-link" href="#support">Support</a>
        </nav>
      </header>`;

  const assembled = `import './App.css';

export default function App() {
  return (
    <div className="app">
      ${headerInner.includes('brand-wordmark') || headerInner.includes(brand)
        ? headerInner
        : `<header className="header sticky-nav" role="banner">
        <a className="brand-wordmark" href="#top">${brand}</a>
        <nav>
          <a className="nav-link" href="#discover">Discover</a>
          <a className="nav-link" href="#support">Support</a>
        </nav>
      </header>`}
      <main>
        <section className="hero" id="top">
          <div className="hero-text">
            <h1>${headline.replace(/\.$/, '')}.</h1>
            <p className="lede">${lede}</p>
            <button type="button" className="cta-button">Explore</button>
          </div>
          <figure className="hero-media">
            <img src="${heroSrc}" alt="${brand}" />
          </figure>
        </section>
        <section className="feature-bands" id="discover">
          <article className="feature-band">
            <h2>Material honesty</h2>
            <p>Textures and finishes chosen for this brand — not stock filler cards.</p>
          </article>
          <article className="feature-band">
            <h2>Quiet detail</h2>
            <p>Spacing, type, and motion tuned so the page feels finished on first scroll.</p>
          </article>
          <article className="feature-band">
            <h2>Made to last</h2>
            <p>A product story you can explore — not a Vite title splash.</p>
          </article>
        </section>
      </main>
      <footer className="footer" id="support">
        <a className="nav-link" href="#top">Back to top</a>
        <p>© 2026 ${brand}</p>
      </footer>
    </div>
  );
}
`;

  next[appKey] = assembled;
  changed.push(appKey);
  return { files: next, changed };
}

/**
 * After Brand Assets land in public/, wire them into App + CSS and strip the
 * common failure mode where /logo.svg is stretched as a full-bleed background
 * (reads as a giant geometric mark behind the page).
 */
export function wireCreatePublicAssets(
  files: Record<string, string>,
  productName = 'App',
): { files: Record<string, string>; changed: string[] } {
  const assembled = assembleCreateAppFromParts(files, productName);
  const importHeal = healMissingLocalImports(assembled.files, productName);
  const next = { ...importHeal.files };
  const changed: string[] = [...assembled.changed];
  if (importHeal.healed.length) {
    const healedAppKey = next['src/App.tsx'] && !next['src/App.jsx']
      ? 'src/App.tsx'
      : (next['src/App.jsx'] ? 'src/App.jsx' : (next['src/App.tsx'] ? 'src/App.tsx' : ''));
    if (healedAppKey) changed.push(healedAppKey);
  }
  const keys = Object.keys(next).map((p) => p.replace(/\\/g, '/'));
  const hasLogo = keys.some((p) => /(^|\/)public\/logo\.svg$/i.test(p));
  const hasSearch = keys.some((p) => /(^|\/)public\/icons\/search\.svg$/i.test(p));
  const hasBag = keys.some((p) => /(^|\/)public\/icons\/bag\.svg$/i.test(p));
  const heroes = keys
    .filter((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp|svg)$/i.test(p))
    .map((p) => '/' + p.replace(/^public\//i, ''));
  const appKey = next['src/App.tsx'] && !next['src/App.jsx']
    ? 'src/App.tsx'
    : (next['src/App.jsx'] ? 'src/App.jsx' : (next['src/App.tsx'] ? 'src/App.tsx' : ''));
  const cssKey = next['src/App.css'] ? 'src/App.css' : '';

  if (cssKey) {
    let css = String(next[cssKey] || '');
    const before = css;
    // Model often leaves the last rule unclosed — PostCSS then blanks Live.
    css = healUnbalancedCssBraces(css);
    if (heroes.length) {
      css = css.replace(/url\(\s*(['"]?)(\/[^'")\s]+)\1\s*\)/gi, (full, q, href) => {
        const rel = `public${href}`.toLowerCase();
        const exists = keys.some((p) => p.replace(/\\/g, '/').toLowerCase() === rel);
        if (exists) return full;
        const quote = q || "'";
        return `url(${quote}${heroes[0]}${quote})`;
      });
    }
    // Never stretch the brand mark across the whole viewport.
    css = css.replace(
      /background(?:-image)?\s*:\s*[^;]*url\(\s*['"]?\/logo\.svg['"]?\s*\)[^;]*;?/gi,
      '/* logo mark reserved for nav — not a page background */',
    );
    css = css.replace(
      /\.logo[^{]*\{[^}]*background[^}]*\/logo\.svg[^}]*\}/gi,
      '.logo { width: 36px; height: 36px; object-fit: contain; }',
    );
    // Close again before appends so injections never nest into a dangling block.
    css = healUnbalancedCssBraces(css);
    // Hero photo underlay — tint from existing --bg / page color, never hardcode cream.
    if (heroes[0] && !/url\(\s*['"]?\/heroes\//i.test(css)) {
      css += `\n.app-shell, .app { background-image: linear-gradient(180deg, color-mix(in srgb, var(--bg, #0f1419) 88%, transparent), color-mix(in srgb, var(--bg, #0f1419) 94%, transparent)), url('${heroes[0]}'); background-size: cover; background-position: center; }\n`;
    }
    if ((hasLogo || hasSearch || hasBag) && !/\.sticky-nav\b/.test(css)) {
      css += `
.sticky-nav { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.85rem 1.25rem; position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--bg, #0f1419) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line, rgba(232,238,244,0.14)); }
.nav-left, .nav-right { display: flex; align-items: center; gap: 0.75rem; }
.nav-logo, .nav-icon { display: block; object-fit: contain; }
.nav-brand { font-weight: 700; letter-spacing: -0.03em; }
`;
    }
    if (css !== before) {
      next[cssKey] = css;
      changed.push(cssKey);
    }
  }

  if (appKey) {
    let app = String(next[appKey] || '');
    const before = app;
    app = ensureReactImportForNamespace(app);
    app = stripEntrypointBleedFromApp(app);
    app = healUndefinedImgSrcBindings(app, heroes);
    app = healUndeclaredItemsList(app, heroes);
    app = healHiddenProductBands(app);
    // Prefer on-disk heroes over empty/broken/data-uri tiles for browse cards.
    if (heroes.length) {
      if (!/\bCOVER_HREFS\b/.test(app)) {
        const decl = `const COVER_HREFS = ${JSON.stringify(heroes)};\n`;
        if (/^import\s.+$/m.test(app)) {
          app = app.replace(/(^import\s.+\n)+/m, (block) => `${block}${decl}`);
        } else {
          app = `${decl}${app}`;
        }
      }
      app = app.replace(
        /src=\{`\/heroes\/\$\{item\.id\}[^`]*`\}/g,
        'src={COVER_HREFS[(Math.max(0, Number(item.id) - 1)) % COVER_HREFS.length]}',
      );
      app = app.replace(
        /src=\{`\/heroes\/\$\{([^}]+)\}[^`]*`\}/g,
        'src={COVER_HREFS[(Math.max(0, Number($1) - 1)) % COVER_HREFS.length]}',
      );
      let ni = 0;
      app = app.replace(/(['"`])\/heroes\/\d+\.(?:jpe?g|png|webp)\1/gi, () => {
        const src = heroes[ni % heroes.length];
        ni += 1;
        return `'${src}'`;
      });
      // Named invented covers (/heroes/gatsby.jpg) → cycle real on-disk heroes.
      app = app.replace(/(['"`])\/heroes\/(?!quietshelf)[a-z0-9._-]+\.(?:jpe?g|png|webp)\1/gi, () => {
        const src = heroes[ni % heroes.length];
        ni += 1;
        return `'${src}'`;
      });
      // Prefer COVER_HREFS when the model stores covers on imageUrl / cover / image fields
      // but never wired them to the const.
      if (/\bCOVER_HREFS\b/.test(app) && /\.(?:imageUrl|cover|image|img)\b/.test(app)) {
        app = app.replace(
          /\bsrc=\{book\.(?:imageUrl|cover|image|img)\}/g,
          'src={COVER_HREFS[(Math.max(0, Number(book.id) - 1)) % COVER_HREFS.length]}',
        );
        app = app.replace(
          /\bsrc=\{item\.(?:imageUrl|cover|image|img)\}/g,
          'src={COVER_HREFS[(Math.max(0, Number(item.id) - 1)) % COVER_HREFS.length]}',
        );
      }
      // Borrow/Return toggle must stay clickable — models often disable the button when borrowed.
      app = app.replace(/\s+disabled=\{[^}]*isBorrowed[^}]*\}/g, '');
      // Fix broken <button …\n{label}</button> missing the closing `>` before children.
      app = app.replace(
        /(<button\b[^>]*?)(\r?\n)(\s*\{[^;{}]{3,80}\})\s*(\r?\n\s*<\/button>)/g,
        (full, open, nl, child, close) => (/>\s*$/.test(open) ? full : `${open}>${nl}${child}${close}`),
      );
      let hi = 0;
      app = app.replace(/<img\b[^>]*>/gi, (tag) => {
        if (/\/logo\.svg|\/icons\/|COVER_HREFS/i.test(tag)) return tag;
        // Already wired to a real on-disk hero path.
        if (heroes.some((h) => tag.includes(h))) return tag;
        if (/\/heroes\/\$\{|\/heroes\/\d+\./i.test(tag) || /src=\{`\/heroes/i.test(tag)) {
          // Handled by COVER_HREFS rewrites above; leave tag structure alone.
          return tag;
        }
        const src = heroes[hi % heroes.length];
        hi += 1;
        if (/src=(["'])[^"']*\1/i.test(tag)) {
          return tag.replace(/src=(["'])[^"']*\1/i, `src=$1${src}$1`);
        }
        if (/src=\{/i.test(tag)) return tag;
        return tag.replace(/<img\b/i, `<img src="${src}"`);
      });
    }
    // Drop filler titles when present.
    const brand = String(productName || 'QuietShelf').replace(/[*/\\]/g, '').slice(0, 32) || 'QuietShelf';
    const shelfNames = [`${brand} Novel`, `${brand} Journal`, `${brand} Field Notes`, 'Walnut Almanac', 'Paperbound'];
    let ni = 0;
    app = app.replace(/\bBook Title\s*\d+\b/gi, () => shelfNames[ni++ % shelfNames.length]);
    app = app.replace(/\bA brief description of the book\b/gi, 'Soft paper tones · warm walnut shelf copy');

    // Inject sticky-nav icons from public/ when files exist but UI never references them.
    // Prefer inline nav icons over absolute icon-rails (marketing layouts forbid rails).
    const iconFiles = keys
      .filter((p) => /(?:^|\/)public\/icons\/([a-z0-9_-]+)\.svg$/i.test(p))
      .map((p) => {
        const m = p.replace(/\\/g, '/').match(/public\/icons\/([a-z0-9_-]+)\.svg$/i);
        return m ? m[1].toLowerCase() : '';
      })
      .filter(Boolean);
    const unusedIcons = iconFiles.filter((id) => !new RegExp(`/icons/${id}\\.svg`, 'i').test(app));
    const needsLogoWire = hasLogo && !/\/logo\.svg/i.test(app);
    const needsIconWire = unusedIcons.length > 0;
    if (needsLogoWire || needsIconWire) {
      const prefer = ['search', 'bag', 'user', 'settings', 'mail', 'grid', 'clock', 'more'];
      const ordered = [
        ...prefer.filter((id) => unusedIcons.includes(id) || (iconFiles.includes(id) && !new RegExp(`/icons/${id}\\.svg`, 'i').test(app))),
        ...unusedIcons.filter((id) => !prefer.includes(id)),
      ].filter((id, i, arr) => arr.indexOf(id) === i).slice(0, 6);
      const logo = hasLogo
        ? `<img className="nav-logo" src="/logo.svg" alt="${brand}" width="36" height="36" />`
        : `<span className="nav-brand">${brand}</span>`;
      const iconImgs = ordered
        .map((id) => `<img className="nav-icon" data-icon="${id}" src="/icons/${id}.svg" alt="${id}" width="20" height="20" />`)
        .join('');
      // Strip absolute icon-rails — they hide the product and leave icons unused in the real nav.
      app = app.replace(/<div className=["'][^"']*\bicon-rail\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*/gi, '');
      if (/className=["'][^"']*\bsticky-nav\b[^"']*["']/i.test(app)) {
        if (needsLogoWire && /nav-left|brand-wordmark/i.test(app)) {
          if (/className=["'][^"']*\bnav-left\b[^"']*["'][^>]*>/i.test(app)) {
            app = app.replace(/(className=["'][^"']*\bnav-left\b[^"']*["'][^>]*>)/i, `$1${logo}`);
          } else if (/className=["'][^"']*\bbrand-wordmark\b[^"']*["'][^>]*>/i.test(app)) {
            app = app.replace(
              /(<[^>]*className=["'][^"']*\bbrand-wordmark\b[^"']*["'][^>]*>)/i,
              `${logo}$1`,
            );
          }
        }
        if (iconImgs) {
          if (/className=["'][^"']*\bnav-right\b[^"']*["'][^>]*>/i.test(app)) {
            app = app.replace(/(className=["'][^"']*\bnav-right\b[^"']*["'][^>]*>)/i, `$1${iconImgs}`);
          } else if (/className=["'][^"']*\bnav-links\b[^"']*["'][^>]*>[\s\S]*?<\/nav>/i.test(app)) {
            app = app.replace(
              /(<\/nav>)/i,
              `</nav><div className="nav-right" aria-label="Tools">${iconImgs}</div>`,
            );
          } else {
            app = app.replace(
              /(className=["'][^"']*\bsticky-nav\b[^"']*["'][^>]*>)/i,
              `$1<div className="nav-right" aria-label="Tools">${iconImgs}</div>`,
            );
          }
        }
      } else if (/<(?:h1|header|section)\b/i.test(app) || /className=["'][^"']*\bapp\b/i.test(app)) {
        const nav = `<header className="sticky-nav" role="banner"><div className="nav-left">${logo}</div><div className="nav-right">${iconImgs}</div></header>\n`;
        if (/className=["'][^"']*\bapp\b[^"']*["'][^>]*>/i.test(app)) {
          app = app.replace(/(className=["'][^"']*\bapp\b[^"']*["'][^>]*>)/i, `$1\n      ${nav}`);
        } else {
          app = app.replace(/<(?:h1|header|section)\b/i, `${nav}$&`);
        }
      }
      if (cssKey && iconImgs && !/\.nav-icon\b/.test(String(next[cssKey] || ''))) {
        let css = String(next[cssKey] || '');
        css += `
.nav-right { display: flex; align-items: center; gap: 0.75rem; }
.nav-icon { display: block; object-fit: contain; opacity: 0.9; }
.nav-logo { display: block; object-fit: contain; }
`;
        next[cssKey] = css;
        changed.push(cssKey);
      }
    }

    // Bare /hero.jpg, /logo.svg, /icons/*.svg, or missing /heroes/*.jpg → offline-safe fallbacks.
    const hasPublicLogo = keys.some((p) => /(^|\/)public\/logo\.svg$/i.test(p));
    const publicHeroSet = new Set(
      keys.filter((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp|svg)$/i.test(p))
        .map((p) => '/' + p.replace(/^public\//i, '').toLowerCase()),
    );
    const svgHero = 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1100" viewBox="0 0 960 1100">`
      + `<defs>`
      + `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`
      + `<stop offset="0%" stop-color="#0f1419"/><stop offset="45%" stop-color="#1a222c"/><stop offset="100%" stop-color="#122033"/>`
      + `</linearGradient>`
      + `<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" stop-color="#2a2e2c"/><stop offset="55%" stop-color="#5a625c"/><stop offset="100%" stop-color="#1a1f1c"/>`
      + `</linearGradient>`
      + `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">`
      + `<stop offset="0%" stop-color="#c4a45a"/><stop offset="100%" stop-color="#8a6b2f"/>`
      + `</linearGradient>`
      + `</defs>`
      + `<rect width="960" height="1100" fill="url(#bg)"/>`
      + `<polygon points="0,0 280,0 0,320" fill="#c6e6c0" opacity="0.55"/>`
      + `<polygon points="960,0 680,0 960,360" fill="#ffd478" opacity="0.28"/>`
      + `<path d="M250 420 C250 260 710 260 710 420" fill="none" stroke="url(#metal)" stroke-width="42" stroke-linecap="round"/>`
      + `<rect x="198" y="400" width="110" height="220" rx="48" fill="url(#metal)"/>`
      + `<rect x="652" y="400" width="110" height="220" rx="48" fill="url(#metal)"/>`
      + `<circle cx="253" cy="510" r="34" fill="url(#gold)" opacity="0.9"/>`
      + `<circle cx="707" cy="510" r="34" fill="url(#gold)" opacity="0.9"/>`
      + `<text x="480" y="980" text-anchor="middle" fill="#1a1f1c" font-family="Georgia,serif" font-size="40" letter-spacing="4">${brand.replace(/[<>&]/g, '').toUpperCase().slice(0, 18)}</text>`
      + `</svg>`,
    );
    if (!publicHeroSet.size) {
      app = app.replace(/src=["']\/hero\.jpg["']/gi, `src="${svgHero}"`);
      app = app.replace(/src=["']\/heroes\/[^"']+["']/gi, `src="${svgHero}"`);
    } else {
      app = app.replace(/src=["'](\/heroes\/[^"']+)["']/gi, (full, href) => {
        if (publicHeroSet.has(String(href).toLowerCase())) return full;
        return `src="${svgHero}"`;
      });
      if (/src=["']\/hero\.jpg["']/i.test(app)) {
        const first = [...publicHeroSet][0];
        app = app.replace(/src=["']\/hero\.jpg["']/gi, `src="${first}"`);
      }
    }
    // Models often invent /assets/logo.svg or /public/hero.jpg — Vite serves public/ at /.
    app = app.replace(/(['"`])\/assets\/(logo\.svg|icons\/)/gi, '$1/$2');
    app = app.replace(/(['"`])\/public\//g, '$1/');
    if (heroes[0]) {
      const heroSet = new Set(heroes.map((h) => h.toLowerCase()));
      app = app.replace(/url\(\s*(['"`])(\/[^'"`)\s]+)\1\s*\)/gi, (full, _q, href) => {
        const pathOnly = String(href).split('?')[0].toLowerCase();
        if (heroSet.has(pathOnly)) return full;
        if (keys.some((p) => `/${p.replace(/^public\//i, '').replace(/\\/g, '/')}`.toLowerCase() === pathOnly)) return full;
        return `url("${heroes[0]}")`;
      });
    }
    if (!hasPublicLogo && /src=["']\/logo\.svg["']/i.test(app)) {
      app = app.replace(
        /<img\b[^>]*src=["']\/logo\.svg["'][^>]*\/?>/gi,
        `<span className="logo-mark" aria-label="${brand}">${brand}</span>`,
      );
    }
    // Missing platform icons → write public/icons/*.svg files (do NOT inline into JSX —
    // data-URI replaces previously ate the button's closing `>` and blanked Live).
    if (
      /const\s+\[\s*filteredItems\s*,/.test(app)
      && /const\s+items\s*=\s*\[/.test(app)
      && /filteredItems\.map\b/.test(app)
    ) {
      app = app.replace(
        /\{filteredItems\.map\b/g,
        '{(filteredItems.length ? filteredItems : items).map',
      );
    }
    const iconHits = [...app.matchAll(/src=["']\/icons\/([a-z0-9_-]+)\.svg["']/gi)];
    for (const hit of iconHits) {
      const name = String(hit[1] || '');
      if (!name) continue;
      const rel = `public/icons/${name}.svg`;
      const exists = keys.some((p) => p.replace(/\\/g, '/').toLowerCase().endsWith(rel.toLowerCase()))
        || Boolean(next[rel]);
      if (exists) continue;
      const fill = /steam/i.test(name) ? '#1b2838'
        : /epic/i.test(name) ? '#2a2a2a'
        : /play/i.test(name) ? '#003791'
        : /xbox/i.test(name) ? '#107c10'
        : '#222';
      next[rel] = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="${fill}"/><circle cx="12" cy="12" r="5" fill="#fff" opacity="0.9"/></svg>\n`;
      changed.push(rel);
    }
    // Heal: `<button … onClick={…}\n  <img` missing `>` before children (common free-model crash).
    app = app.replace(
      /(<button\b[^>]*?onClick=\{[^}]+\})\s*\r?\n(\s*<)/gi,
      '$1>\n$2',
    );
    // Heal accidental ` / />` self-close junk from prior bad rewrites.
    app = app.replace(/\s+\/\s*\/>/g, ' />');

    if (app !== before) {
      next[appKey] = app;
      changed.push(appKey);
    }
  }

  // Never inject cream/sage/gold apple-home atmosphere as a Ready heal.
  // Layout Contract / Design hop owns palette; thin CSS stays honest for the gate.
  if (cssKey) {
    const css = healUnbalancedCssBraces(String(next[cssKey] || ''));
    // Strip legacy atmospheric injects left from older builds.
    let cleaned = css
      .replace(/\/\*\s*Prefer cream atmosphere[\s\S]*?(?=\n\/\*|\n\.|\n@media|$)/gi, '')
      .replace(/\/\*\s*NOVA create polish — brief companion[\s\S]*?(?=\/\* NOVA|\n\/\*|@media \(max-width: 640px\)[\s\S]*?\}\s*$)/gi, '')
      .replace(/@keyframes\s+novaAtmosSweep\s*\{[\s\S]*?\}\s*/gi, '')
      .replace(/@keyframes\s+novaCompanionSweep\s*\{[\s\S]*?\}\s*/gi, '')
      .replace(/@keyframes\s+novaGoldSheen\s*\{[\s\S]*?\}\s*/gi, '')
      .replace(/body\s*\{\s*background-color:\s*#f3eee4\s*!important;[\s\S]*?color:\s*#14181c;\s*\}\s*/gi, '')
      .replace(/body::before\s*\{[\s\S]*?z-index:\s*0;\s*\}\s*/gi, '')
      .replace(/--bg:\s*#f3eee4\s*;/gi, '--bg: #0f1419;')
      .replace(/--panel:\s*#faf7f0\s*;/gi, '--panel: #1a222c;');
    cleaned = healUnbalancedCssBraces(cleaned);
    if (cleaned !== String(next[cssKey] || '')) {
      next[cssKey] = cleaned;
      changed.push(cssKey);
    }
  }

  return { files: next, changed: [...new Set(changed)] };
}

/**
 * When the model ships a real App but leaves scaffold CSS, inject a marketing companion
 * so Preview Ready is not blocked solely by thin CSS.
 * Palette + silhouette come from CreateIdentity — bakery is cream, Veopx-like is dark editorial.
 */
/** @deprecated Prefer createIdentityFromBrief(...).palette — kept for callers that still pass name+brief. */
export function pickMarketingPalette(productName: string, brief = ''): CreatePalette {
  return createIdentityFromBrief(productName, brief).palette;
}

export function buildMarketingCompanionCss(
  productName: string,
  brief = '',
  identity?: CreateIdentity,
): string {
  const id = identity || createIdentityFromBrief(productName, brief);
  const brand = String(id.name || productName || 'Product').replace(/[*/\\]/g, '').slice(0, 48);
  const p = id.palette;
  const briefText = String(brief || id.brief || '');
  const shopish = /\b(?:shop|store|bakery|product|cart|menu|catalog)\b/i.test(briefText);
  return `/* NOVA create polish — brief companion for ${brand} */
:root {
  --bg: ${p.bg};
  --panel: ${p.panel};
  --text: ${p.text};
  --muted: ${p.muted};
  --accent: ${p.accent};
  --line: ${p.line};
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); }
body { font-family: ${p.font}; }
.app { min-height: 100vh; display: flex; flex-direction: column; background:
  radial-gradient(1200px 600px at 20% -10%, ${p.glow} 0%, transparent 55%),
  linear-gradient(125deg, ${p.bg}, color-mix(in srgb, ${p.glow} 35%, ${p.bg}), ${p.panel});
  background-size: 180% 180%;
  animation: novaCompanionSweep 18s ease-in-out infinite;
}
@keyframes novaCompanionSweep {
  0% { background-position: 0% 40%; }
  50% { background-position: 100% 60%; }
  100% { background-position: 0% 40%; }
}
.header, header, .sticky-nav {
  position: sticky; top: 0; z-index: 20; backdrop-filter: blur(12px);
  background: color-mix(in srgb, var(--bg) 82%, transparent); border-bottom: 1px solid var(--line);
}
.nav, nav, .sticky-nav {
  display: flex; gap: 1.25rem; align-items: center; justify-content: space-between;
  max-width: 1100px; margin: 0 auto; padding: 1rem 1.25rem; flex-wrap: wrap; width: 100%;
}
.brand, .brand-wordmark { font-weight: 700; letter-spacing: -0.03em; color: var(--text); }
.nav-link, nav a { color: var(--muted); text-decoration: none; font-size: 0.95rem; }
.nav-link:hover, nav a:hover { color: var(--text); }
.search input, .search-input, input[type="search"], input[type="text"] {
  background: var(--panel); border: 1px solid var(--line); color: var(--text);
  border-radius: ${shopish ? '12px' : '999px'}; padding: 0.55rem 1rem; min-width: min(240px, 70vw);
}
.cart-count { color: var(--muted); font-size: 0.95rem; }
.hero { min-height: 48vh; display: grid; place-items: center; text-align: center; padding: 3.5rem 1.25rem 2.5rem; }
.hero img, .hero-photo { max-width: min(920px, 92vw); width: 100%; border-radius: ${shopish ? '16px' : '20px'}; border: 1px solid var(--line); object-fit: cover; }
.hero-title, .hero h1 { margin: 0 0 0.75rem; font-size: clamp(2.2rem, 5vw, 3.6rem); letter-spacing: -0.04em; line-height: 1.05; }
.product-grid, .product-cards {
  display: grid; gap: 1.1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  max-width: 1100px; margin: 0 auto 3rem; padding: 0 1.25rem; width: 100%;
}
.product-card {
  background: var(--panel); border: 1px solid var(--line); border-radius: ${shopish ? '14px' : '18px'};
  padding: 1.15rem; display: flex; flex-direction: column; gap: 0.55rem; text-align: left;
}
.product-card img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 12px; background: ${p.glow}; }
.product-card h2, .product-card h3, .product-name { margin: 0; font-size: 1.05rem; color: var(--text); }
.product-card p, .product-blurb { margin: 0; color: var(--muted); line-height: 1.45; font-size: 0.92rem; }
.product-price, .product-card .price { color: var(--text); font-weight: 700; }
.cta-button, .purchase-button, .add-to-cart, button {
  appearance: none; border: 0; border-radius: ${shopish ? '10px' : '999px'}; padding: 0.7rem 1.15rem;
  background: var(--accent); color: ${p.btnInk}; font-weight: 700; cursor: pointer; margin-top: auto;
}
.cta-button:hover, .purchase-button:hover, .add-to-cart:hover, button:hover { filter: brightness(1.06); }
.footer, footer { margin-top: auto; border-top: 1px solid var(--line); padding: 1.5rem 1.25rem; text-align: center; color: var(--muted); font-size: 0.9rem; }
@media (max-width: 640px) {
  .hero { min-height: 36vh; padding-top: 2.5rem; }
}
`;
}

/** Marketing / shop landing floor — uses on-disk heroes; never booking stubs. */
function buildMarketingShopFloor(
  title: string,
  brief: string,
  p: CreatePalette,
  kind: 'reef' | 'shop',
): { app: string; css: string } {
  const reef = kind === 'reef';
  const bands = reef
    ? [
        { id: 'livestock', title: 'Livestock', body: 'Corals and reef fish, healthy and ready for home tanks.' },
        { id: 'kits', title: 'Care kits', body: 'Salt, test kits, and lighting matched to your reef.' },
        { id: 'visit', title: 'Visit', body: 'Tue–Sat 10–6 · Ask about acclimation and water parameters.' },
      ]
    : [
        { id: 'featured', title: 'Featured', body: `Signature pieces from ${title}.` },
        { id: 'story', title: 'Our story', body: 'Crafted with care for people who notice the details.' },
        { id: 'visit', title: 'Visit', body: 'Open daily · Come see what’s new.' },
      ];
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand';
  const hero = `/heroes/${slug}-hero.webp`;
  const story = `/heroes/${slug}-story.webp`;
  const app = `import './App.css';

export default function App() {
  return (
    <div className="site">
      <header className="topnav" role="banner">
        <nav className="topnav-inner" aria-label="Primary">
          <a className="mark" href="#top">${title}</a>
          ${bands.map((b) => `<a href="#${b.id}">${b.title}</a>`).join('\n          ')}
          <a href="#visit">Hours</a>
        </nav>
      </header>
      <section className="hero full-bleed" id="top">
        <div className="hero-copy">
          <p className="eyebrow">${reef ? 'Saltwater / Reef' : 'Welcome'}</p>
          <h1>${reef ? 'Reef life, carefully curated.' : `${title}.`}</h1>
          <p className="sub">${reef ? 'Corals, fish, and care kits for calm, living aquariums.' : (String(brief || '').slice(0, 120) || 'A premium shop experience.')}</p>
          <div className="cta-row">
            <a className="pill pill-primary" href="#${bands[0].id}">${reef ? 'Browse livestock' : 'Explore'}</a>
            <a className="pill pill-ghost" href="#visit">Visit</a>
          </div>
        </div>
        <img className="hero-photo" src="${hero}" alt="${title} hero" />
      </section>
      ${bands.map((b, i) => `
      <section className="band band-${i % 2 === 0 ? 'light' : 'dark'}" id="${b.id}">
        <div className="band-copy">
          <h2>${b.title}</h2>
          <p>${b.body}</p>
        </div>
        <img src="${i === 0 ? story : hero}" alt="${b.title}" />
      </section>`).join('\n')}
      <footer className="foot" id="visit">
        <a href="#top">${title}</a>
        <a href="#visit">Hours</a>
        <a href="#top">Contact</a>
      </footer>
    </div>
  );
}
`;
  const css = `:root {
  --bg: ${reef ? '#04151c' : p.bg};
  --ink: ${reef ? '#e8f6f8' : p.text};
  --mute: ${reef ? '#8eb8c0' : p.muted};
  --accent: ${reef ? '#2ec4b6' : p.accent};
  --panel: ${reef ? '#0a2430' : p.panel};
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); }
body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; }
.site { width: 100%; }
.topnav { position: sticky; top: 0; z-index: 30; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(14px); }
.topnav-inner { max-width: 1040px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 1.1rem; justify-content: center; padding: 0.85rem 1rem; }
.topnav a { color: var(--ink); text-decoration: none; font-size: 0.92rem; opacity: 0.9; }
.mark { font-weight: 700; letter-spacing: -0.02em; }
.hero { min-height: 88vh; display: grid; place-items: center; text-align: center; padding: 4rem 1.25rem 3rem; position: relative; overflow: hidden; }
.hero-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
.hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, color-mix(in srgb, var(--bg) 35%, transparent), var(--bg)); }
.hero-copy { position: relative; z-index: 1; max-width: 40rem; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.08em; color: var(--mute); font-size: 0.8rem; }
.hero h1, .band h2 { margin: 0.35rem 0 0; font-size: clamp(2.2rem, 6vw, 3.8rem); letter-spacing: -0.03em; font-weight: 650; }
.sub, .band p { margin: 0.75rem auto 0; max-width: 34rem; color: var(--mute); font-size: clamp(1.05rem, 2.2vw, 1.25rem); }
.cta-row { display: flex; gap: 0.85rem; justify-content: center; flex-wrap: wrap; margin-top: 1.35rem; }
.pill { display: inline-flex; align-items: center; justify-content: center; padding: 0.55rem 1.15rem; border-radius: 980px; text-decoration: none; font-size: 0.95rem; }
.pill-primary { background: var(--accent); color: #042026; font-weight: 600; }
.pill-ghost { border: 1px solid var(--accent); color: var(--accent); }
.band { display: grid; gap: 1.5rem; padding: 4rem 1.25rem; text-align: center; justify-items: center; }
.band img { width: min(720px, 90vw); border-radius: 22px; object-fit: cover; max-height: 380px; }
.band-light { background: var(--panel); color: var(--ink); }
.band-dark { background: color-mix(in srgb, var(--bg) 92%, #000); }
.foot { display: flex; flex-wrap: wrap; gap: 1.25rem; justify-content: center; padding: 2.5rem 1rem 3rem; background: #021017; }
.foot a { color: var(--mute); text-decoration: none; font-size: 0.85rem; }
`;
  return { app, css };
}

/**
 * When craft leaves a title stub, materialize a brief-aware interactive floor
 * (hero + item grid + hours + confirm form) using CreateIdentity palette —
 * never cream luxury companion or Veopx stock copy.
 */
export function buildBriefInteractiveFloor(productName: string, brief = ''): { app: string; css: string } {
  const identity = createIdentityFromBrief(productName, brief);
  const title = String(identity.name || productName || 'Product').replace(/[*/\\<>]/g, '').slice(0, 48) || 'Product';
  const p = identity.palette;
  const t = String(brief || identity.brief || '');
  // Prefer marketing/shop when the ask is clearly that — never a silent default for utility asks.
  // (create fail-closed no longer injects this floor for empty crafts; research-first owns those.)
  const boatish = /\b(?:boat|skiff|harbor|dock|clipper|marina|sail)\b/i.test(t);
  const machineish = /\b(?:machine|laser|cnc|makerspace|forge|printer)\b/i.test(t);
  const reefish = /\b(?:aquarium|saltwater|reef|coral|fish\s+shop|livestock)\b/i.test(t);
  // Marketing / shop landings must NOT ship the booking "Core / Day / Reserve" stub.
  if (reefish || (briefLooksLikeMarketingLanding(t) && !boatish && !machineish)) {
    return buildMarketingShopFloor(title, t, p, reefish ? 'reef' : 'shop');
  }
  const items = boatish
    ? [
        { name: 'Harbor Skiff', blurb: 'Weekend day-boat for 4.', status: 'Open' },
        { name: 'Clipper 18', blurb: 'Steady for foggy mornings.', status: 'Open' },
        { name: 'Dock Runner', blurb: 'Quick loops around the bay.', status: 'Hold' },
      ]
    : machineish
      ? [
          { name: 'Laser bay', blurb: 'Open until 9pm.', status: 'Free' },
          { name: 'CNC table', blurb: 'Book a 2-hour slot.', status: 'Free' },
          { name: '3D printers', blurb: 'Three stations online.', status: 'Busy' },
        ]
      : [
          { name: `${title} Core`, blurb: 'Primary offer for this brief.', status: 'Open' },
          { name: `${title} Day`, blurb: 'Everyday pick.', status: 'Open' },
          { name: `${title} Reserve`, blurb: 'Weekend special.', status: 'Hold' },
        ];
  const hours = boatish
    ? 'Sat-Sun 8am-6pm | Dock C'
    : machineish
      ? 'Tonight 5pm-10pm | Shop floor'
      : 'Open hours | See below';
  const cta = boatish ? 'Reserve' : machineish ? 'Book slot' : 'Confirm';
  const itemsLit = JSON.stringify(items, null, 2);
  const app = `import { useState } from 'react';
import './App.css';

const ITEMS = ${itemsLit};

export default function App() {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState(ITEMS[0].name);
  const [confirmed, setConfirmed] = useState('');
  return (
    <div className="app">
      <header className="sticky-nav" role="banner">
        <div className="nav-left">
          <img className="nav-logo" src="/logo.svg" alt="${title}" width="36" height="36" />
          <div className="brand-wordmark">${title}</div>
        </div>
        <nav className="nav-links" aria-label="Primary">
          <a href="#fleet">Browse</a>
          <a href="#hours">Hours</a>
          <a href="#reserve">${cta}</a>
        </nav>
        <div className="nav-right" aria-label="Tools">
          <img className="nav-icon" data-icon="user" src="/icons/user.svg" alt="profile" width="20" height="20" />
          <img className="nav-icon" data-icon="settings" src="/icons/settings.svg" alt="settings" width="20" height="20" />
          <img className="nav-icon" data-icon="mail" src="/icons/mail.svg" alt="mail" width="20" height="20" />
        </div>
      </header>
      <section className="hero" id="top">
        <p className="eyebrow">${title}</p>
        <h1>${boatish ? 'Boats ready for the weekend.' : machineish ? 'Machines free tonight.' : `${title} - ready when you are.`}</h1>
        <p className="lede">${boatish ? 'See open skiffs, weekend hours, and reserve a boat without an account.' : machineish ? 'Check open bays, tonight hours, and book a slot without calling.' : 'Browse what is open, check hours, and confirm without an account.'}</p>
      </section>
      <section className="hours-strip" id="hours">${hours}</section>
      <section className="product-grid" id="fleet" aria-label="Available">
        {ITEMS.map((item) => (
          <article className="product-card" key={item.name}>
            <h3>{item.name}</h3>
            <p>{item.blurb}</p>
            <span className="chip">{item.status}</span>
            <button type="button" onClick={() => setPicked(item.name)}>Select</button>
          </article>
        ))}
      </section>
      <section className="reserve" id="reserve">
        <h2>${cta}</h2>
        <p className="dim">Selected: {picked}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfirmed(name.trim() ? \`Saved for \${name.trim()} - \${picked}\` : \`Saved - \${picked}\`);
          }}
        >
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </label>
          <label>
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
          </label>
          <button type="submit">${cta}</button>
        </form>
        {confirmed ? <p className="confirm" role="status">{confirmed}</p> : null}
      </section>
      <footer className="footer">${title}</footer>
    </div>
  );
}
`;
  const css = `/* NOVA brief floor - ${title} */
:root {
  --bg: ${p.bg};
  --panel: ${p.panel};
  --text: ${p.text};
  --muted: ${p.muted};
  --accent: ${p.accent};
  --line: ${p.line};
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); }
body { font-family: ${p.font}; }
.app {
  min-height: 100vh; display: flex; flex-direction: column;
  background:
    radial-gradient(900px 480px at 15% -10%, ${p.glow} 0%, transparent 55%),
    linear-gradient(160deg, ${p.bg}, ${p.panel});
  color: var(--text);
}
.sticky-nav {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 1rem 1.35rem; position: sticky; top: 0; z-index: 20;
  background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.nav-left { display: flex; align-items: center; gap: 0.65rem; }
.brand-wordmark { font-weight: 750; letter-spacing: -0.03em; font-size: 1.15rem; }
.nav-links { display: flex; gap: 1.1rem; }
.nav-links a { color: var(--muted); text-decoration: none; }
.nav-links a:hover { color: var(--text); }
.nav-right { display: flex; align-items: center; gap: 0.75rem; }
.nav-icon, .nav-logo { display: block; object-fit: contain; }
.hero { padding: 3.5rem 1.35rem 2rem; max-width: 920px; margin: 0 auto; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.75rem; color: var(--accent); margin: 0 0 0.75rem; }
.hero h1 { margin: 0 0 0.85rem; font-size: clamp(2rem, 5vw, 3.4rem); letter-spacing: -0.04em; line-height: 1.05; }
.lede { margin: 0; color: var(--muted); max-width: 42rem; line-height: 1.55; font-size: 1.05rem; }
.hours-strip {
  margin: 0 1.35rem 1.5rem; padding: 0.85rem 1.1rem; border-radius: 12px;
  border: 1px solid var(--line); background: color-mix(in srgb, var(--panel) 80%, transparent);
  color: var(--muted); max-width: 1100px; width: calc(100% - 2.7rem);
}
.product-grid {
  display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  max-width: 1100px; margin: 0 auto 2rem; padding: 0 1.35rem; width: 100%;
}
.product-card {
  background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
  padding: 1.1rem; display: flex; flex-direction: column; gap: 0.45rem;
}
.product-card h3 { margin: 0; font-size: 1.05rem; }
.product-card p { margin: 0; color: var(--muted); line-height: 1.45; font-size: 0.92rem; }
.chip {
  align-self: flex-start; font-size: 0.75rem; letter-spacing: 0.04em;
  padding: 0.2rem 0.55rem; border-radius: 999px; border: 1px solid var(--line); color: var(--accent);
}
.product-card button, .reserve button {
  appearance: none; border: 0; border-radius: 10px; padding: 0.65rem 1rem;
  background: var(--accent); color: ${p.btnInk}; font-weight: 700; cursor: pointer; margin-top: auto;
}
.reserve {
  max-width: 560px; margin: 0 auto 3rem; padding: 0 1.35rem; width: 100%;
  display: flex; flex-direction: column; gap: 0.75rem;
}
.reserve h2 { margin: 0; letter-spacing: -0.03em; }
.dim { color: var(--muted); margin: 0; }
.reserve form { display: flex; flex-direction: column; gap: 0.75rem; }
.reserve label { display: flex; flex-direction: column; gap: 0.35rem; color: var(--muted); font-size: 0.9rem; }
.reserve input {
  background: var(--panel); border: 1px solid var(--line); color: var(--text);
  border-radius: 10px; padding: 0.65rem 0.85rem;
}
.confirm { color: var(--accent); font-weight: 600; }
.footer { margin-top: auto; border-top: 1px solid var(--line); padding: 1.25rem; text-align: center; color: var(--muted); font-size: 0.9rem; }
@media (max-width: 640px) {
  .hero { padding-top: 2.5rem; }
}
`;
  return { app, css };
}

export function cssBlobIsThin(files: Record<string, string>, minLen = 1500): boolean {
  const css = `${files['src/App.css'] || ''}\n${files['src/index.css'] || ''}`;
  return css.replace(/\s+/g, '').length < minLen;
}

/** App imports ./components/* (or similar) that were never written — Preview will crash. */
export function createPolishMissingLocalImports(
  files: Record<string, string>,
): string[] {
  const app = files['src/App.tsx'] || files['src/App.jsx'] || '';
  const missing: string[] = [];
  const re = /from\s+['"](\.\/[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(app))) {
    let rel = m[1].replace(/^\.\//, 'src/');
    if (!/\.(tsx|ts|jsx|js|css)$/i.test(rel)) {
      const candidates = [`${rel}.tsx`, `${rel}.jsx`, `${rel}.ts`, `${rel}.js`, `${rel}/index.tsx`, `${rel}/index.jsx`];
      if (!candidates.some((c) => files[c] != null || files[c.replace(/\\/g, '/')] != null)) {
        missing.push(m[1]);
      }
    } else if (files[rel] == null && files[rel.replace(/\\/g, '/')] == null) {
      missing.push(m[1]);
    }
  }
  return [...new Set(missing)];
}

/**
 * Heal App that imports missing local modules (e.g. ./productData or ./components/Hero)
 * by collapsing to a single-file landing or stripping imports + JSX so Live does not crash.
 */
export function healMissingLocalImports(
  files: Record<string, string>,
  productName = 'Item',
): { files: Record<string, string>; healed: string[] } {
  const missing = createPolishMissingLocalImports(files);
  if (!missing.length) return { files, healed: [] };
  const missingUi = missing.some((s) =>
    /components\//i.test(s)
    || /\/(?:Navbar|Nav|Header|Hero|Footer|FeatureBand|Feature|Banner)\b/i.test(s),
  );
  if (missingUi) {
    const assembled = assembleCreateAppFromParts(files, productName);
    if (assembled.changed.length && !createPolishMissingLocalImports(assembled.files).length) {
      return { files: assembled.files, healed: missing };
    }
  }
  const next = { ...files };
  const appKey = next['src/App.tsx'] && !next['src/App.jsx']
    ? 'src/App.tsx'
    : (next['src/App.jsx'] ? 'src/App.jsx' : (next['src/App.tsx'] ? 'src/App.tsx' : ''));
  if (!appKey) return { files, healed: [] };
  let app = String(next[appKey] || '');
  const healed: string[] = [];
  const brand = String(productName || 'Item').replace(/[*/\\]/g, '').slice(0, 28) || 'Item';
  const droppedNames = new Set<string>();

  for (const spec of missing) {
    const esc = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const importLine = app.match(new RegExp(`^\\s*import\\s+([^;]*?)from\\s+['"]${esc}['"]\\s*;?\\s*$`, 'im'));
    if (importLine) {
      const clause = importLine[1].trim();
      const def = clause.match(/^([A-Za-z_$][\w$]*)/);
      if (def && !clause.startsWith('{')) droppedNames.add(def[1]);
      const named = clause.match(/\{([^}]+)\}/);
      if (named) {
        for (const part of named[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/i).pop()?.trim();
          if (name && /^[A-Za-z_$][\w$]*$/.test(name)) droppedNames.add(name);
        }
      }
    }
    app = app.replace(new RegExp(`^\\s*import\\s+[^;]*?from\\s+['"]${esc}['"]\\s*;?\\s*$`, 'gim'), '');
    app = app.replace(new RegExp(`^\\s*import\\s+['"]${esc}['"]\\s*;?\\s*$`, 'gim'), '');
    healed.push(spec);
  }

  for (const name of droppedNames) {
    const ne = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    app = app.replace(new RegExp(`<${ne}\\b[^>]*/>`, 'g'), '');
    app = app.replace(new RegExp(`<${ne}\\b[^>]*>[\\s\\S]*?</${ne}>`, 'g'), '');
  }

  if (
    healed.some((h) => /product|item|book|catalog|data|shelf/i.test(h))
    && !/\bconst\s+(?:ITEMS|PRODUCTS|BOOKS|items|products|books)\s*=/.test(app)
  ) {
    const stub = `const ITEMS = [
  { id: '1', title: '${brand} Novel', blurb: 'Soft paper tones on the shared shelf.', cover: '/heroes/app-hero.jpg' },
  { id: '2', title: '${brand} Journal', blurb: 'Warm walnut notes for who has what.', cover: '/heroes/app-story.jpg' },
  { id: '3', title: 'Field Notes', blurb: 'Borrow and return without accounts.', cover: '/logo.svg' },
];\n`;
    if (/^import\s.+$/m.test(app)) {
      app = app.replace(/(^import\s.+\n)+/m, (block) => `${block}${stub}`);
    } else {
      app = `${stub}\n${app}`;
    }
    if (/\bproductData\b/.test(app) && !/\bconst\s+productData\b/.test(app)) {
      app = app.replace(stub, `${stub}const productData = ITEMS;\n`);
    }
    if (/\bproducts\b/.test(app) && !/\bconst\s+products\b/.test(app)) {
      app = `const products = ITEMS;\n${app}`;
    }
  }

  next[appKey] = app;
  return { files: next, healed };
}

/** Drop react-icons / icon-pack imports that were never added to package.json. */
export function healMissingIconPackImports(
  files: Record<string, string>,
): { files: Record<string, string>; healed: string[] } {
  const next = { ...files };
  const healed: string[] = [];
  for (const key of Object.keys(next)) {
    if (!/\.(?:jsx|tsx|js|ts)$/i.test(key)) continue;
    let body = String(next[key] || '');
    if (!/from\s+['"](?:react-icons|@mui\/icons-material|lucide-react)['"/]/i.test(body)
      && !/from\s+['"]react-icons\//i.test(body)) {
      continue;
    }
    // Only strip packs that are not declared in package.json.
    let pkg = '';
    try { pkg = String(next['package.json'] || ''); } catch { pkg = ''; }
    const needsStrip =
      (/react-icons/i.test(body) && !/"react-icons"\s*:/.test(pkg))
      || (/@mui\/icons-material/i.test(body) && !/"@mui\/icons-material"\s*:/.test(pkg));
    // lucide-react is often present in Nova scaffolds — leave if declared.
    if (!needsStrip) continue;
    body = body.replace(/^\s*import\s+\{[^}]+\}\s+from\s+['"]react-icons\/[^'"]+['"]\s*;?\s*$/gim, '');
    body = body.replace(/^\s*import\s+\{[^}]+\}\s+from\s+['"]@mui\/icons-material['"]\s*;?\s*$/gim, '');
    body = body.replace(/<(?:Fa|Md|Hi|Bi|Io|Ai|Bs|Fi|Ri)[A-Za-z0-9]+\b[^>]*\/>/g, '');
    body = body.replace(/<(?:Fa|Md|Hi|Bi|Io|Ai|Bs|Fi|Ri)[A-Za-z0-9]+\b[^>]*>\s*<\/(?:Fa|Md|Hi|Bi|Io|Ai|Bs|Fi|Ri)[A-Za-z0-9]+>/g, '');
    next[key] = body;
    healed.push(key);
  }
  return { files: next, healed };
}
