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
  // English paragraphs inside CSS/HTML that are not comments.
  const withoutComments = t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const sentences = withoutComments.match(/\b(?:The|We|I|This|To|If|Please|Open|Note)\b[^.\n]{20,}\./g);
  return Boolean(sentences && sentences.length >= 2);
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
 * Discord/Slack-style multi-pane shell — used when create polish must not leave a title splash.
 * Interactive: switch servers/channels and send messages in the chat pane.
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
 * Last-resort Vite marketing shell when the model left an unusable App.
 * Real /heroes/*.jpg slots (Brand Assets fill them) — never CSS orbs or fake silver blobs.
 * PC-case briefs get a distinct industrial layout (not the quiet-luxury Vesper clone).
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

  // Editorial-dark last-resort ONLY when identity says so — not for bakery/chat.
  if (identity.layout !== 'editorial-dark') {
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

  return {
    app: `import './App.css';

const features = [
${featuresLiteral}
];

export default function App() {
  const year = new Date().getFullYear();
  return (
    <main className="app">
      <section className="hero" aria-labelledby="brand-name">
        <img className="hero-photo" src="${heroSrc}" alt="${title} product hero" />
        <div className="hero-wash" aria-hidden="true" />
        <nav className="nav" aria-label="Main navigation">
          <a className="wordmark" href="#top" id="brand-name">${title}.</a>
          <a className="nav-link" href="#story">Discover</a>
        </nav>
        <div className="hero-copy" id="top">
          <p className="eyebrow">${copy.eyebrow}</p>
          <h1>${copy.headline}</h1>
          <p className="lede">${copy.lede}</p>
          <a className="button" href="#story">${copy.cta}</a>
        </div>
        <p className="scroll-hint"><span className="scroll-line" aria-hidden="true" />Scroll to reveal</p>
      </section>

      <section className="story" id="story">
        <div className="story-visual">
          <img className="story-photo" src="${storySrc}" alt="${title} product detail" />
        </div>
        <div className="story-copy">
          <p className="eyebrow dark">${copy.storyEyebrow}</p>
          <h2>${copy.storyHeadline}</h2>
          <p>${copy.storyBody}</p>
          <a className="text-link" href="#features">${copy.storyCta}</a>
        </div>
      </section>

      <section className="features" id="features">
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
        <a href="#top">Back to top</a>
      </footer>
    </main>
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
    const catalogStore = /\b(?:product-grid|product-card|product-cards|add-to-cart|purchase|cart-count|sticky-nav)\b/i.test(app)
      && /\b(?:search|cart|price|\$)\b/i.test(app);
    const hasStructure = /<(?:section|header|footer|nav|main|article)\b/i.test(app)
      || /className=["'][^"']*\b(?:hero|menu|footer|nav|header|sticky-nav|product-grid)\b/i.test(app);
    const hasCta = /<(?:button|a)\b/i.test(app)
      || /\b(?:cta|order|reserve|book|explore|menu|purchase|add\s*to\s*cart)\b/i.test(app);
    const cssLen = cssBlob.replace(/\s+/g, '').length;
    // Catalog stores can be compact (~1.5–2k) and still be a real interactive shop.
    const minApp = catalogStore ? 1400 : 2000;
    if (app.length < minApp) reasons.push('landing App.jsx too thin for a real page');
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

  // Discord / team-chat apps: centered brand splash is never Ready.
  if (briefLooksLikeChatApp(brief)) {
    const hasServerRail = /server-rail|serverRail|className=["'][^"']*\bservers?\b/i.test(app);
    const hasChannels = /channel-list|channelList|className=["'][^"']*\bchannels?\b/i.test(app)
      || /#\s*\{?channel/i.test(app);
    const hasChatPane = /chat-pane|chatPane|message-list|composer/i.test(app);
    const cssLenChat = cssBlob.replace(/\s+/g, '').length;
    if (app.length < 1800) reasons.push('chat App.jsx too thin for a multi-pane shell');
    if (!hasServerRail) reasons.push('chat App missing server rail');
    if (!hasChannels) reasons.push('chat App missing channel list');
    if (!hasChatPane) reasons.push('chat App missing chat pane / messages');
    if (cssLenChat < 1200) reasons.push('chat CSS too thin for a multi-pane layout');
    if (looksLikeFillerStubAppSource(app)) {
      reasons.push('chat App is still a title splash, not a Discord-like shell');
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
  if (briefLooksLikeChatApp(t)) return true;
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

/** Replace fake /path/to assets with a real public keyboard photo. */
export function sanitizeCreatePolishPlaceholders(app: string): string {
  const kb =
    'https://images.unsplash.com/photo-1541140532154-b024d705b90a?auto=format&fit=crop&w=1200&q=80';
  return String(app || '')
    .replace(/src=(["'])\/path\/to\/[^"']+\1/gi, `src=$1${kb}$1`)
    .replace(/url\((['"]?)\/path\/to\/[^)"']+\1\)/gi, `url($1${kb}$1)`);
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
  const shopish = id.layout === 'warm-shop' || id.layout === 'catalog-grid';
  return `/* NOVA create polish — ${id.layout} companion for ${brand} (${id.category}/${id.mood}) */
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
.hero { min-height: ${id.layout === 'editorial-dark' ? '72vh' : '48vh'}; display: grid; place-items: center; text-align: center; padding: 3.5rem 1.25rem 2.5rem; }
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
