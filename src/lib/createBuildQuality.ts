/**
 * Post-build hygiene for website creates: strip model prose, keep Vite entry valid,
 * and decide when Preview is actually safe to open.
 */

import { buildScaffoldFiles } from '@/lib/projectScaffolds';
import { upgradePollinationsUrlsInSource } from '@/lib/siteHeroImages';
import { looksLikeTruncatedUiSource } from '@/lib/freshSpaFromBrief';
import { blankSolidColorFromAsk } from '@/lib/webProjectCanon';
import { wantsChatAppScaffold } from '@/lib/webLandingFromBrief';
import type { CreateIdentity, CreatePalette } from '@/lib/createIdentity';
import { createIdentityFromBrief } from '@/lib/createIdentity';

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

/** Drop trailing / embedded assistant chatter from CSS or markup. */
function isTrailingAssistantProse(rest: string): boolean {
  const t = String(rest || '').trim();
  if (!t) return false;
  if (/@@@FILE|```|To verify|Please |Note that|You should|Open the/i.test(t)) return true;
  if (/^(?:Added|Updated|Done|Here|I (?:added|updated|changed|fixed)|The (?:updated|file))\b/i.test(t)) {
    return true;
  }
  // English sentence with no CSS/JS tokens.
  if (/^[A-Z][\w\s,',-]{8,}\.$/m.test(t) && !/[{};=<>]|className|import |export |function /.test(t)) {
    return true;
  }
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
            if (isTrailingAssistantProse(tail) || /To verify|Please |Note |You should|```|@@@FILE|Added |Done\./i.test(tail)) {
              text = `${head}\n`;
            }
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
 * Heal blank-Live crash: `React.useState` without `import React`.
 * Prefer a default React import so existing React.* calls keep working.
 */
export function ensureReactImportForNamespace(app: string): string {
  const s = String(app || '');
  if (!appUsesReactNamespaceWithoutImport(s)) return s;
  if (/^['"]use client['"];?\s*/.test(s)) {
    return s.replace(/^(['"]use client['"];?\s*)/, `$1import React from 'react';\n`);
  }
  return `import React from 'react';\n${s}`;
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
  // Quiet-luxury / product marketing sites — even when also "premium website" SPA signals.
  if (/\b(?:quiet\s+luxury|soft\s+(?:mint\s+|green\s+)?orbs?|scroll\s+to\s+reveal|product\s+marketing|premium\s+product|pc\s*case|gaming\s+pc|computer\s*case|mid[\s-]?tower)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:landing(?:\s+page)?|marketing\s+site)\b/i.test(t)) return true;
  return /\b(?:landing(?:\s+page)?|marketing\s+site|product\s+marketing|premium\s+product|quiet\s+luxury|apple\.com|restaurant|bistro|bakery|cafe|coffee\s+shop|roaster|menu\s+highlights|hero|tagline|dishes?|website|soft\s+(?:green\s+)?orbs?|scroll\s+to\s+reveal)\b/i.test(t);
}

/**
 * Rich product/marketing/chat create briefs that must not finish as a thin stub App marked success.
 * Bare “build me a website” stays scaffold-only; blank-color shells are excluded by the caller.
 */
export function briefNeedsCreateUiPolish(brief: string): boolean {
  const t = String(brief || '').trim();
  if (!t) return false;
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
  return false;
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
      || /className=["'][^"']*\b(?:hero|menu|footer|nav|header|sticky-nav|product-grid|grid|cards?)\b/i.test(app);
    const hasCta = /<(?:button|a)\b/i.test(app)
      || /\b(?:cta|order|reserve|book|explore|menu|purchase|add\s*to\s*cart|get\s+started|shop)\b/i.test(app);
    const cssLen = cssBlob.replace(/\s+/g, '').length;
    const sectionCount = (app.match(/<(?:section|main|header|footer)\b/gi) || []).length;
    const hasPremiumCss = /gradient|radial-gradient|@keyframes|backdrop-filter|box-shadow|background-image/i.test(cssBlob);
    const wantsBooking = /\b(?:reserv|appointment|time\s*slot|book\s+(?:a\s+)?(?:table|appointment|slot))\b/i.test(brief)
      && !/\b(?:borrow|bookshelf|library|lend(?:ing)?|checked\s*out|return\s+button)\b/i.test(brief);
    if (app.length < (wantsBooking ? 2200 : 1800)) reasons.push('landing App.jsx too thin for a real page');
    if (!hasStructure || sectionCount < 2) reasons.push('landing App missing sections (hero/menu/footer)');
    if (cssLen < (wantsBooking ? 1200 : 900)) reasons.push('landing CSS too thin');
    if (!hasPremiumCss && cssLen < 2000) reasons.push('landing CSS lacks premium depth (gradients, atmosphere, or motion)');
    if (restaurantBriefBuiltAsCoffeeShop(app, brief)) {
      reasons.push('restaurant brief built as a coffee shop instead');
    }
    if (/\b(?:restaurant|menu|dishes?|cafe|bistro)\b/i.test(brief) && !/\b(?:menu|dish|price|\$\d)/i.test(app)) {
      reasons.push('restaurant/menu brief missing menu content');
    }
    if (!hasCta && /\b(?:cta|button|order|reserve|explore)\b/i.test(brief)) {
      reasons.push('landing App missing a primary CTA');
    }
    if (wantsBooking) {
      const hasState = /\buseState\b|\bReact\.useState\b/.test(app);
      const hasSlots = /\b(?:slot|time|schedule|select)\b/i.test(app);
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
 * After Brand Assets land in public/, wire them into App + CSS and strip the
 * common failure mode where /logo.svg is stretched as a full-bleed background
 * (reads as a giant geometric mark behind the page).
 */
export function wireCreatePublicAssets(
  files: Record<string, string>,
  productName = 'App',
): { files: Record<string, string>; changed: string[] } {
  const next = { ...files };
  const changed: string[] = [];
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
    // Never stretch the brand mark across the whole viewport.
    css = css.replace(
      /background(?:-image)?\s*:\s*[^;]*url\(\s*['"]?\/logo\.svg['"]?\s*\)[^;]*;?/gi,
      '/* logo mark reserved for nav — not a page background */',
    );
    css = css.replace(
      /\.logo[^{]*\{[^}]*background[^}]*\/logo\.svg[^}]*\}/gi,
      '.logo { width: 36px; height: 36px; object-fit: contain; }',
    );
    if (heroes[0] && !/url\(\s*['"]?\/heroes\//i.test(css)) {
      css += `\n.app-shell, .app { background-image: linear-gradient(180deg, rgba(250,247,242,0.92), rgba(245,240,232,0.96)), url('${heroes[0]}'); background-size: cover; background-position: center; }\n`;
    }
    if ((hasLogo || hasSearch || hasBag) && !/\.sticky-nav\b/.test(css)) {
      css += `
.sticky-nav { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.85rem 1.25rem; position: sticky; top: 0; z-index: 20; background: rgba(250,247,242,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(60,40,20,0.08); }
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

    // Inject a compact nav with real public icons when files exist but UI never references them.
    const needsNavWire = (hasLogo || hasSearch || hasBag)
      && !/\/logo\.svg|\/icons\/(?:search|bag)\.svg/i.test(app);
    if (needsNavWire) {
      const logo = hasLogo
        ? `<img className="nav-logo" src="/logo.svg" alt="${brand}" width="36" height="36" />`
        : `<span className="nav-brand">${brand}</span>`;
      const search = hasSearch
        ? `<img className="nav-icon" src="/icons/search.svg" alt="" width="20" height="20" aria-label="Search" />`
        : '';
      const bag = hasBag
        ? `<img className="nav-icon" src="/icons/bag.svg" alt="" width="20" height="20" aria-label="Shelf bag" />`
        : '';
      const nav = `<header className="sticky-nav" role="banner"><div className="nav-left">${logo}</div><div className="nav-right">${search}${bag}</div></header>\n`;
      if (/<h1\b/i.test(app)) {
        app = app.replace(/<h1\b/i, `${nav}<h1`);
      } else if (/className=["'][^"']*\bapp\b[^"']*["'][^>]*>/i.test(app)) {
        app = app.replace(
          /(className=["'][^"']*\bapp\b[^"']*["'][^>]*>)/i,
          `$1\n      ${nav}`,
        );
      }
    }

    if (app !== before) {
      next[appKey] = app;
      changed.push(appKey);
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
.app { min-height: 100vh; display: flex; flex-direction: column; background: radial-gradient(1200px 600px at 20% -10%, ${p.glow} 0%, var(--bg) 55%); }
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
 * Heal App that imports missing local modules (e.g. ./productData) by stripping
 * those imports and inlining a tiny data stub so Live does not crash.
 */
export function healMissingLocalImports(
  files: Record<string, string>,
  productName = 'Item',
): { files: Record<string, string>; healed: string[] } {
  const missing = createPolishMissingLocalImports(files);
  if (!missing.length) return { files, healed: [] };
  const next = { ...files };
  const appKey = next['src/App.tsx'] && !next['src/App.jsx']
    ? 'src/App.tsx'
    : (next['src/App.jsx'] ? 'src/App.jsx' : (next['src/App.tsx'] ? 'src/App.tsx' : ''));
  if (!appKey) return { files, healed: [] };
  let app = String(next[appKey] || '');
  const healed: string[] = [];
  const brand = String(productName || 'Item').replace(/[*/\\]/g, '').slice(0, 28) || 'Item';

  for (const spec of missing) {
    const esc = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Drop `import … from './missing'` / `import './missing'`.
    app = app.replace(new RegExp(`^\\s*import\\s+[^;]*?from\\s+['"]${esc}['"]\\s*;?\\s*$`, 'gim'), '');
    app = app.replace(new RegExp(`^\\s*import\\s+['"]${esc}['"]\\s*;?\\s*$`, 'gim'), '');
    healed.push(spec);
  }

  // If the App referenced a product/items catalog that vanished with the import, inject a local stub.
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
    // Soft alias common names models import.
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
