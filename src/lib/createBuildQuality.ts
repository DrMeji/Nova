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
import {
  briefWantsLightPaperGround,
  createIdentityFromBrief,
  productGlyphDataUrl,
} from '@/lib/createIdentity';
import {
  buildProductSpec,
  briefLooksLikeStorefront,
  scoreFunctionalReady,
  scoreLayoutQuality,
  type LayoutContract,
  type ProductSpec,
} from '@/lib/createLayoutContract';
import { ensureDesignedHeroVisual, lintOriginalCreateQuality } from '@/lib/createDesignSystem';
import { inferCreateCompositionFamily } from '@/lib/createProductPlan';
import { buildStorefrontCommerceFloor } from '@/lib/createStorefrontFloor';
import {
  thinBriefWantsDepth,
  thinBlocksLivePreview,
  thinLiveVisualDeficits,
  thinQualityRubricHints,
  thinWantsCompositionalShell,
  appLooksLikeCompositionalShell,
} from '@/lib/createThinPath';
import { CREATE_QUALITY_RUBRIC_PREFIX } from '@/lib/createQualityRubric';
import { brandLogoSvgFor, logoIconifyFor } from '@/lib/brandAssets';
import { healModernAtelierCompanionStomp } from '@/lib/atelierInventShells';
import {
  briefWantsProductLadder,
  gradeProductQuality,
} from '@/lib/createProductLadder';
import { isProductSiteAsk, resolveArtifactKind } from '@/lib/createArtifactKind';

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

const GRAIN_DATA_URI =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Restore `.site-grain` when a hero-url rewrite mangled a data-URI noise layer. */
export function healCorruptedGrainCss(css: string): string {
  let s = String(css || '');
  if (!s.trim()) return s;
  // Classic corruption: url('/heroes/…')'/%3E%3C/svg%3E");
  if (/url\(\s*['"]?\/heroes\/[^)'"]+['"]?\)\s*['"]?\/?%3E/i.test(s)
    || /\.site-grain\s*\{[^}]*url\(\s*['"]?\/heroes\//i.test(s)) {
    s = s.replace(
      /\.site-grain\s*\{[\s\S]*?\n\}/,
      `.site-grain {\n  pointer-events: none; position: fixed; inset: 0; z-index: 40; opacity: 0.055; mix-blend-mode: overlay;\n  background-image: ${GRAIN_DATA_URI};\n}`,
    );
  }
  return s;
}

export function healUnbalancedCssBraces(css: string): string {
  let s = healCorruptedGrainCss(healMissedCssSemicolons(css));
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
/** Inject `const COVER_HREFS = […]` when App uses it without a declaration (blank Live / ReferenceError). */
export function healUndeclaredCoverHrefs(app: string, heroes: string[] = []): string {
  const s = String(app || '');
  if (!s || !/\bCOVER_HREFS\b/.test(s)) return s;
  if (/\b(?:const|let|var)\s+COVER_HREFS\b/.test(s)) return s;
  const list = heroes.length
    ? heroes
    : ['/logo.svg'];
  const decl = `const COVER_HREFS = ${JSON.stringify(list)};\n`;
  if (/^import\s.+$/m.test(s)) {
    return s.replace(/(^import\s.+\n)+/m, (block) => `${block}${decl}`);
  }
  if (/import\s+['"]\.\/App\.css['"];?\s*/i.test(s)) {
    return s.replace(/(import\s+['"]\.\/App\.css['"];?\s*)/i, `$1\n${decl}`);
  }
  return `${decl}${s}`;
}

export function healUndefinedImgSrcBindings(app: string, heroes: string[] = []): string {
  let s = String(app || '');
  // Always declare COVER_HREFS before other src heals — usage without const blanks Live.
  s = healUndeclaredCoverHrefs(s, heroes);
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
/** Strip create system / forbid prose so genre gates only see the user ask. */
function stripCreateSystemProse(brief: string): string {
  return String(brief || '')
    .replace(/##\s*ProductSpec[\s\S]*?(?=##\s|\s*$)/gi, ' ')
    .replace(/##\s*LayoutContract[\s\S]*?(?=##\s|\s*$)/gi, ' ')
    .replace(/##\s*CopyPack[\s\S]*?(?=##\s|\s*$)/gi, ' ')
    .replace(/##\s*Plan checklist[\s\S]*?(?=##\s|\s*$)/gi, ' ')
    .replace(/##\s*Ensemble plan[\s\S]*?(?=##\s|\s*$)/gi, ' ')
    .replace(/ORIGINAL ONE-OF-ONE CREATE[\s\S]*?(?=##\s|\s*$)/gi, ' ')
    .replace(/CRAFT RULES:[\s\S]*?(?=##\s|\s*$)/gi, ' ')
    .replace(/REFERENCE BAR[\s\S]{0,500}/gi, ' ')
    .replace(/\bapple\.com product homepage\b[^\n]*/gi, ' ')
    // Forbid lines that name apple.com / cafe recipes must never classify the ask.
    .replace(
      /\b(?:forbidden|forbidding|never|avoid|do\s+not|don't|dont)\b[^\n]{0,220}\b(?:apple(?:\.com)?|linear|cafe\s+recipe|mac\s*\/\s*ipad)[^\n]*/gi,
      ' ',
    )
    .replace(/\bapple\.com\/Linear\/cafe recipe layouts\b[^\n]*/gi, ' ');
}

export function briefLooksLikeAppleStyleHomepage(brief: string): boolean {
  // Strip injected contract / craft-forbid prose — "apple.com/…cafe recipe" used to
  // false-force the Mac/iPad floor on unrelated brands (Glassroot, vacuum, etc.).
  const t = stripCreateSystemProse(brief);
  if (!t.trim()) return false;
  // "Forbidden: Apple Mac/iPad clones" must NEVER trip the Apple floor.
  const forbidsApple = /\b(?:never|forbidden|forbidding|not|no|don't|dont|avoid|instead of)\b[\s\S]{0,80}\b(?:apple(?:\.com)?|mac\s*\/\s*ipad|mac\/ipad|iphone|ipad|airpods)\b/i.test(t)
    || /\b(?:apple\s+)?mac\s*\/\s*ipad(?:\s*\/\s*watch)?\s+clones?\b/i.test(t)
    || /\bclones?\b[\s\S]{0,24}\b(?:apple|mac|ipad|iphone)\b/i.test(t);
  if (forbidsApple) return false;
  // Positive user ask only (not a generic "apple.com" mention inside system text).
  if (/\bexact\s+apple(?:\.com)?[- ]?style\b/i.test(t)) return true;
  if (/\bapple\.com\b/i.test(t)
    && /\b(?:style|like|exact|replica|clone|copy|homepage)\b/i.test(t)
    && /\b(?:build|create|make|start building|apple)\b/i.test(t)) {
    return true;
  }
  const positive = /\b(?:build|create|make|clone|replica|like|exact)\b[\s\S]{0,80}\b(?:apple|iphone|mac|ipad|airpods)\b/i.test(t)
    || /\b(?:iphone|ipad|airpods)\b[\s\S]{0,48}\b(?:product\s+band|full[- ]?bleed|thin\s+nav)\b/i.test(t);
  return positive
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
                || /^(?:\s*)(?:This |The |Here |Note |Please |You |I |To |Added |Done|#{1,6}\s|How to fix)/m.test(tail)
                || /How to fix it|###\s|Verification:|Ensure that the path/i.test(tail)
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
  // Step-ladder brand-only shell (center-word / put-name) is intentional — not filler.
  if (
    hasBrandTitle
    && /className=["']center-word["']/i.test(s)
    && !hasStructure
    && tags.length <= 4
  ) {
    return false;
  }
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

/** Pottery firing journal (KilnBook-style) — single screen form + list. */
export function briefLooksLikeFiringJournal(brief: string): boolean {
  const t = String(brief || '').trim();
  if (!t) return false;
  if (/\b(?:kilnbook|kiln\s*book)\b/i.test(t)) return true;
  const pottery = /\b(?:kiln|firing|pottery|clay|glaze|cone)\b/i.test(t);
  const journal = /\b(?:journal|log|form|list|pass\s*\/?\s*fail|result)\b/i.test(t);
  return pottery && journal;
}

/** Tiny sticky-note / single-note page (title + one text box). */
export function briefLooksLikeStickyNotePage(brief: string): boolean {
  const raw = String(brief || '').trim();
  if (!raw) return false;
  const head = raw
    .split(/\n##\s+Ensemble|\n##\s+Layout contract|\ncreateV2 RULES:/i)[0]
    .trim()
    .slice(0, 520);
  const t = head || raw.slice(0, 520);
  if (/\b(?:landing\s+page|marketing\s+site|dashboard|discord|checkout|ecommerce|cafe|restaurant)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:notedot|note\s*dot|sticky\s*notes?|notepad)\b/i.test(t)) return true;
  const wantsNote = /\b(?:note|notes|sticky)\b/i.test(t);
  const wantsType = /\b(?:title|text\s*box|textarea|type|typing|input)\b/i.test(t);
  const tiny = /\b(?:tiny|simple|basic|just|only|most basic|nothing else)\b/i.test(t) || t.length < 220;
  return wantsNote && wantsType && tiny;
}

export function briefLooksLikeMicroWebToy(brief: string): boolean {
  // Strip “Do not ship a tip/todo…” so forbid text never classifies a product homepage as a toy.
  const t = stripUtilityFloorNoise(brief).trim();
  if (!t || t.length > 520) return false;
  // Explicit marketing / multi-section product sites are not toys.
  if (/\b(?:landing\s+page|marketing\s+site|product\s+homepage|homepage|restaurant|cafe|menu\s+highlights|apple\.com|product\s+band|quiet[- ]luxury|full[- ]?bleed|dashboard|kanban|discord|slack|checkout|ecommerce|vacuum)\b/i.test(t)) {
    return false;
  }
  if (looksLikePlayableCanvasGame(t) || looksLikeSpatialApp(t) || looksLikeFpsGame(t)) return false;
  // Tip calculators are tools — never marketing-hero heal targets.
  if (/\b(?:tip[- ]?(?:calc|calculator|wise|jar)?|split\s+the\s+bill|gratuity)\b/i.test(t)
    || /\bTipjar\b|\bTipWise\b/i.test(t)) {
    return true;
  }
  if (briefLooksLikeClickCounter(t)) return true;
  if (briefLooksLikeTodoList(t)) return true;
  if (briefLooksLikeSimpleTimer(t)) return true;
  if (briefLooksLikeStickyNotePage(t)) return true;

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

/** Minimal sticky-note page floor — title + one text box (createV2 stall fallback). */
export function stickyNotePageApp(productName: string): string {
  const title = String(productName || 'Note')
    .replace(/[<>&'"`\\]/g, '')
    .replace(/\s+Build Plan.*$/i, '')
    .trim()
    .slice(0, 48) || 'Note';
  return `import { useState } from 'react';
import './App.css';

export default function App() {
  const [note, setNote] = useState('');
  return (
    <div className="app">
      <h1 className="title">${title}</h1>
      <label className="note-label" htmlFor="note">
        Note
        <textarea
          id="note"
          className="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Type your note…"
          rows={8}
        />
      </label>
    </div>
  );
}
`;
}

export function stickyNotePageCss(): string {
  return `.app {
  min-height: 100vh;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 1rem;
  padding: 2rem 1.25rem;
  max-width: 36rem;
  margin-inline: auto;
  background: #12141a;
  color: #f2f4f8;
  box-sizing: border-box;
}
.title {
  margin: 0;
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  font-weight: 650;
  letter-spacing: -0.03em;
}
.note-label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #a8b0bd;
}
.note {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 10rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(255,255,255,0.12);
  background: #1a1d24;
  color: #f2f4f8;
  padding: 0.85rem 1rem;
  font: inherit;
  line-height: 1.45;
}
.note:focus {
  outline: 2px solid rgba(125, 180, 255, 0.45);
  outline-offset: 1px;
}
`;
}

/** @deprecated Micro prebuilt Ready gate removed — use isPreviewReady. */
export function isMicroWebToyReady(files: Record<string, string>): PreviewReadyResult {
  return isPreviewReady(files);
}

/** Marketing / restaurant / landing briefs need real page depth before Preview Ready. */
export function briefLooksLikeMarketingLanding(brief: string): boolean {
  // Strip "Do not ship a tip/todo…" so forbid text never classifies a product homepage as a utility.
  const t = stripUtilityFloorNoise(brief);
  if (!t.trim()) return false;
  // Tiny interactive toys (name dance, CSS animation demos) must NEVER use landing depth.
  if (briefLooksLikeMicroWebToy(t)) return false;
  // Games / 3D / interactive apps are never marketing landings — use playable/interactive Ready.
  if (looksLikePlayableCanvasGame(t) || looksLikeSpatialApp(t) || looksLikeFpsGame(t)) return false;
  // Positive product-homepage signals win before utility early-outs (forbid text used to say "todo").
  const premiumHome = /\b(?:product\s+homepage|premium\s+product|quiet[- ]luxury|full[- ]?bleed\s+hero|soft(?:\s+\w+){0,3}\s+orbs?|scroll[- ]?(?:to[- ]?)?reveal|product\s+marketing)\b/i.test(t)
    || (/\b(?:homepage|home\s+page|landing(?:\s+page)?|marketing\s+site)\b/i.test(t)
      && /\b(?:premium|editorial|vacuum|brand|hero|feature\s+sections?|specs?\s+strip|full[- ]?bleed)\b/i.test(t))
    // "coffee brand website" + hero/story bands — must not fall into coffee utility ladder
    || (/\b(?:brand\s+website|marketing\s+website|complete\s+(?:\w+\s+){0,3}website)\b/i.test(t)
      && /\b(?:hero|story\s+bands?|site-band|full[- ]?bleed|nav)\b/i.test(t));
  if (premiumHome) return true;
  // Utility apps win even when ensemble/plan fluff says "landing" / "menu" / "hero".
  if (/\b(?:todo|task\s*list|tip\s*(?:calc|calculator|wise)|checklist|counter|timer|notepad)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:dashboard|kanban|inbox|workspace|transactions?|accounts?|tracker|application)\b/i.test(t)
    && !/\b(?:landing|restaurant|cafe|menu|marketing|homepage)\b/i.test(t)) {
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
  if (/\b(?:quiet[- ]luxury|soft(?:\s+\w+){0,3}\s+orbs?|scroll[- ]?(?:to[- ]?)?reveal|product\s+marketing|premium\s+product|pc\s*case|gaming\s+pc|computer\s*case|mid[\s-]?tower)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:landing(?:\s+page)?|marketing\s+site|homepage|home\s+page|coffee\s+homepage)\b/i.test(t)) return true;
  // Short coffee/cafe ladder prompts are simple sites — not full marketing landings.
  if (t.length < 320 && /\b(?:brewhaus|simple\s+coffee|coffee\s+shop\s+page|list of \d+ drinks)\b/i.test(t)) {
    return false;
  }
  // Gaming peripherals / hardware product pages — "gaming mouse website" must never
  // fall through as a non-marketing SPA (that skipped originality + shipped phone-columns).
  if (/\b(?:gaming\s+(?:mouse|keyboard|headset|peripheral|gear)|wireless\s+mouse|mechanical\s+keyboard)\b/i.test(t)
    || (/\b(?:mouse|keyboard|headset|earbuds?)\b/i.test(t)
      && /\b(?:website|landing|homepage|product|shop|store|DPI|polling)\b/i.test(t))) {
    return true;
  }
  // Specialty food / fruit / liquor / shop / delivery brand sites — never booking Core/Day/Reserve stubs.
  if (/\b(?:dried[- ]?dates?|medjool|deglet|fruit\s+brand|specialty[- ]food|food\s+brand|food\s+delivery|meal\s+delivery|delivery\s+(?:app|service|company)|varieties|liquor|spirits?|whiskey|whisky|bottle\s+shop)\b/i.test(t)
    || (/\b(?:dates?|fruit|honey|olive|chocolate|tea|spice|bourbon|vodka|gin|tequila)\b/i.test(t)
      && /\b(?:brand|shop|store|website|landing|homepage|varieties|cultivar|cart|checkout)\b/i.test(t))
    || (/\b(?:shop|store|boutique)\b/i.test(t)
      && /\b(?:website|landing|homepage|brand|featured|story|cart|buy)\b/i.test(t))
    || (/\b(?:food|meal|restaurant)\b/i.test(t) && /\bdelivery\b/i.test(t)
      && /\b(?:website|landing|homepage|app|company|brand|order)\b/i.test(t))) {
    return true;
  }
  // One-page brand website with Shop/Story/hero structure.
  if (/\b(?:one[- ]?page|brand[- ]?new)\b/i.test(t)
    && /\b(?:website|site)\b/i.test(t)
    && /\b(?:shop|varieties|story|hero|footer|full[- ]?bleed)\b/i.test(t)) {
    return true;
  }
  // Do not let bare "website" / "hero" alone force landing depth — too many app/game briefs say that.
  return /\b(?:landing(?:\s+page)?|marketing\s+site|product\s+marketing|premium\s+product|quiet[- ]luxury|apple\.com|restaurant|bistro|bakery|cafe|coffee\s+shop|roaster|menu\s+highlights|tagline|dishes?|soft(?:\s+\w+){0,3}\s+orbs?|scroll[- ]?(?:to[- ]?)?reveal|sign[- ]?in|login\s+page|cinematic|embark|platform\s+button|headphones?|earbuds?|headset|audio\s+product|luxur(?:y|ious)\s+(?:product|landing|site)|aquarium|saltwater|reef\s+shop|coral|fish\s+shop|pet\s+store|florist|flower\s+shop|dried[- ]?dates?|fruit\s+brand|specialty[- ]food)\b/i.test(t);
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
 * Point main.* at the kept App file with an explicit extension.
 * Bare `./App` + deleting App.jsx leaves Vite serving index.html for /src/App.jsx
 * (SPA fallback) → "React never mounted".
 */
export function syncMainAppImport(
  files: Record<string, string>,
  kept: 'src/App.jsx' | 'src/App.tsx',
): void {
  const ext = kept.endsWith('.tsx') ? 'tsx' : 'jsx';
  const target = `./App.${ext}`;
  for (const mainKey of ['src/main.tsx', 'src/main.jsx']) {
    const body = files[mainKey];
    if (typeof body !== 'string' || !body.trim()) continue;
    const next = body.replace(
      /from\s+['"]\.\/App(?:\.(?:jsx|tsx))?['"]/g,
      `from '${target}'`,
    );
    if (next !== body) files[mainKey] = next;
  }
}

/**
 * #6 — When both App.jsx and App.tsx exist, keep exactly one real App.*.
 * Prefer the higher-scoring product UI; on a tie keep App.jsx (Vite resolves `./App` there first).
 * When the winner is App.tsx, move it to App.jsx so bare `./App` imports keep working.
 */
export function cleanupAppTwins(
  files: Record<string, string>,
): { files: Record<string, string>; removed: string[]; kept: string | null } {
  const next = { ...files };
  const jsx = next['src/App.jsx'];
  const tsx = next['src/App.tsx'];
  if (jsx == null || tsx == null) {
    const keptSole = (jsx != null ? 'src/App.jsx' : tsx != null ? 'src/App.tsx' : null) as
      | 'src/App.jsx'
      | 'src/App.tsx'
      | null;
    if (keptSole) syncMainAppImport(next, keptSole);
    return {
      files: next,
      removed: [],
      kept: keptSole,
    };
  }
  const hasMainJsx = next['src/main.jsx'] != null;
  const hasMainTsx = next['src/main.tsx'] != null;
  const jsxScore = scoreAppSource(jsx);
  const tsxScore = scoreAppSource(tsx);
  let keep: 'src/App.jsx' | 'src/App.tsx';
  const hasBrandWord = (body: string) =>
    /className=["']center-word["']/i.test(body) && /<h1\b/i.test(body);
  const hasCafeNav = (body: string) =>
    /<nav[\s>]/i.test(body) && /\bMenu\b/.test(body) && /\bRewards\b/.test(body);
  // Always keep the real UI. Entry-file preference is only a tie-breaker —
  // never discard a centered brand / nav App.tsx just because main.jsx exists.
  if (isEmptyOrStubAppSource(jsx) && !isEmptyOrStubAppSource(tsx)) {
    keep = 'src/App.tsx';
  } else if (isEmptyOrStubAppSource(tsx) && !isEmptyOrStubAppSource(jsx)) {
    keep = 'src/App.jsx';
  } else if ((hasBrandWord(tsx) || hasCafeNav(tsx)) && !(hasBrandWord(jsx) || hasCafeNav(jsx))) {
    // Twin blank shell vs put-name / café-nav ladder — never drop the named App.
    keep = 'src/App.tsx';
  } else if ((hasBrandWord(jsx) || hasCafeNav(jsx)) && !(hasBrandWord(tsx) || hasCafeNav(tsx))) {
    keep = 'src/App.jsx';
  } else if (Math.abs(jsxScore - tsxScore) < 800 && hasMainJsx && !hasMainTsx) {
    keep = 'src/App.jsx';
  } else if (Math.abs(jsxScore - tsxScore) < 800 && hasMainTsx && !hasMainJsx) {
    // Still prefer .jsx for Vite bare-resolve safety when content is equivalent.
    keep = jsxScore >= tsxScore ? 'src/App.jsx' : 'src/App.tsx';
  } else if (jsxScore >= tsxScore) {
    keep = 'src/App.jsx';
  } else {
    keep = 'src/App.tsx';
  }
  const removed: string[] = [];
  if (keep === 'src/App.tsx') {
    // Move winner into App.jsx — Vite resolves bare `./App` to .jsx before .tsx.
    // Deleting App.jsx while main still imports it serves index.html as a module
    // → blank Live ("React never mounted").
    next['src/App.jsx'] = next['src/App.tsx'];
    delete next['src/App.tsx'];
    removed.push('src/App.tsx');
    keep = 'src/App.jsx';
  } else {
    delete next['src/App.tsx'];
    removed.push('src/App.tsx');
  }
  syncMainAppImport(next, keep);
  return { files: next, removed, kept: keep };
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

/** Strip contract dumps + “Forbidden: tip calculator” lines so floors never false-trigger. */
function stripUtilityFloorNoise(brief: string): string {
  return stripCreateSystemProse(brief)
    // "Do not ship a tip app, todo list…" / "Forbidden: tip calculator" — strip the whole forbid clause.
    .replace(
      /\b(?:do\s+not|never|forbidden|forbidding|don't|dont|avoid)\b[^\n.]{0,160}\b(?:tip(?:\s*(?:calc|calculator|wise|app))?|tipwise|todo(?:\s*lists?)?|tasknest|gratuity|checklist|coffee)\b[^\n.]*/gi,
      ' ',
    )
    .replace(
      /\b(?:not|no)\b[^\n.]{0,120}\b(?:tip(?:\s*(?:calc|calculator|wise|app))?|tipwise|todo(?:\s*lists?)?|tasknest|gratuity|checklist)\b[^\n.]*/gi,
      ' ',
    );
}

/** True only when the user is actually asking for a tip/todo/coffee utility — not forbidding them. */
export function briefWantsUtilityFloorKind(
  brief: string,
  kind: 'tip' | 'todo' | 'coffee' | 'kiln',
): boolean {
  const t = stripUtilityFloorNoise(brief);
  if (!t.trim()) return false;
  // Premium / product homepages never get ladder utility stubs.
  if (/\b(?:premium|product\s+homepage|marketing\s+landing|full-?bleed\s+hero|quiet[- ]luxury|vacuum|ambient\s+light)\b/i.test(t)
    && !/\b(?:build|create|make)\b[\s\S]{0,48}\b(?:tip\s*(?:calc|calculator)|tipwise|todo\s*list|tasknest|coffee\s*shop)\b/i.test(t)) {
    return false;
  }
  if (kind === 'tip') {
    return /\b(?:build|create|make|scaffold)\b[\s\S]{0,64}\b(?:tip\s*(?:calc|calculator|wise)|tipwise|gratuity)\b/i.test(t)
      || /\b(?:tip\s*(?:calc|calculator|wise)|tipwise)\b[\s\S]{0,40}\bon\s+disk\b/i.test(t);
  }
  if (kind === 'todo') {
    return /\b(?:build|create|make|scaffold)\b[\s\S]{0,64}\b(?:todo|tasknest|task\s*list|checklist)\b/i.test(t)
      || /\b(?:todo|tasknest)\b[\s\S]{0,40}\bon\s+disk\b/i.test(t);
  }
  if (kind === 'coffee') {
    // Marketing brand sites (hero + story bands) are Design Spine — not the cafe-menu utility stub.
    if (/\b(?:brand\s+website|marketing\s+website|story\s+bands?|product\s+homepage|full[- ]?bleed)\b/i.test(t)) {
      return false;
    }
    return /\b(?:build|create|make|scaffold)\b[\s\S]{0,64}\b(?:coffee|caf[eé]|brewhaus|espresso)\b/i.test(t)
      || /\b(?:brewhaus|coffee\s*shop)\b[\s\S]{0,40}\bon\s+disk\b/i.test(t);
  }
  if (/\b(?:brand\s+website|marketing\s+website|story\s+bands?|product\s+homepage)\b/i.test(t)) {
    return false;
  }
  return /\b(?:kiln|firing|pottery|clay|glaze|cone|kilnbook)\b/i.test(t)
    && /\b(?:build|create|make|journal|log)\b/i.test(t);
}

/** Neutral last-resort App when the model left an unusable shell (not genre-specific).
 * DEPRECATED NEVER CALL FROM CREATE — kept for smoke/helpers only. */
/**
 * Brief-shaped floor when small-model craft leaves truncated/crashy App.
 * Used so Live can paint for todo / tip / coffee stress scenarios.
 * NEVER call for premium/product-homepage asks — “Forbidden: tip calculator” must not match.
 */
export function buildUtilityFloorFromBrief(_projectName: string, _brief = ''): { app: string; css: string; kind: string } {
  // REMOVED: tip/todo/coffee/kiln host floors — no look-back recreate.
  return { kind: 'none', app: '', css: '' };
}

export function buildLastResortInteractiveApp(_projectName: string): { app: string; css: string } {
  // REMOVED — no look-back interactive twin.
  return { app: '', css: '' };
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
  // Missing npm deps blank Live — three is the usual marketing-craft false positive.
  if (/\bfrom\s+['"]three(?:\/[^'"]*)?['"]|\brequire\s*\(\s*['"]three['"]/.test(app)
    && !/"three"\s*:/.test(pkg)) {
    reasons.push('App imports three.js but package.json has no three dependency (would blank Live)');
  }
  if (briefLooksLikeMarketingLanding(brief)
    && !looksLikeSpatialApp(brief)
    && /\b(?:from\s+['"]three|OrbitControls|THREE\.|WebGLRenderer)\b/i.test(app)) {
    reasons.push('marketing homepage must not ship a Three.js scene (CSS atmosphere only)');
  }
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
  if (/\bCOVER_HREFS\b/.test(app) && !/\b(?:const|let|var)\s+COVER_HREFS\b/.test(app)) {
    reasons.push('App uses COVER_HREFS without declaring it (would blank Live)');
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
    // Genre floors must follow the user ask — not craft-forbid lines naming apple.com/cafe.
    const askForGenre = stripCreateSystemProse(brief);
    const appleStyle = briefLooksLikeAppleStyleHomepage(askForGenre);
    const hasStructure = /<(?:section|header|footer|nav|main|article)\b/i.test(uiBlob)
      || /className=["'][^"']*\b(?:hero|menu|footer|nav|header|sticky-nav|product-grid|grid|cards?|band|feature-[a-z]|specs)\b/i.test(uiBlob);
    const hasCta = /<(?:button|a)\b/i.test(uiBlob)
      || /\b(?:cta|order|reserve|book|explore|menu|purchase|add\s*to\s*cart|get\s+started|shop|learn\s+more)\b/i.test(uiBlob);
    const cssLen = cssBlob.replace(/\s+/g, '').length;
    // Count semantic tags AND common product-homepage class bands (feature-a/b/c, specs, footer).
    const sectionCount = (uiBlob.match(/<(?:section|main|header|footer)\b/gi) || []).length
      + (uiBlob.match(/className=["'][^"']*\bhero\b/i) ? 1 : 0)
      + (uiBlob.match(/className=["'][^"']*\b(?:band|feature-[a-z0-9]+|feature|specs|footer)\b/gi) || []).length;
    const hasPremiumCss = /gradient|radial-gradient|@keyframes|backdrop-filter|box-shadow|background-image/i.test(cssBlob);
    const hasMotion = /@keyframes|animation\s*:|transition\s*:/i.test(cssBlob);
    const hasHeroVisual = /\/heroes\/|<img\b|background-image|radial-gradient|full[- ]?bleed|\.hero\b/i.test(`${uiBlob}\n${cssBlob}`);
    const hasDiskHeroes = Object.keys(files).some((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp|svg)/i.test(p.replace(/\\/g, '/')));
    const wantsBooking = /\b(?:reserv|appointment|time\s*slot|book\s+(?:a\s+)?(?:table|appointment|slot))\b/i.test(askForGenre)
      && !/\b(?:borrow|bookshelf|library|lend(?:ing)?|checked\s*out|return\s+button)\b/i.test(askForGenre);
    // Quiet-luxury / orb aesthetic — never force this on apple.com-style product bands.
    const wantsPremium = !appleStyle && /\b(?:quiet[\s-]?luxury|luxur(?:y|ious)|editorial|serif|orb|vesper|distilled|atmosphere|cinematic|sign[- ]?in|embark|game\s+auth|lumenforge|headphones?|parchment|cream|sage|gold\s+light)\b/i.test(askForGenre);
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
    if (restaurantBriefBuiltAsCoffeeShop(uiBlob, askForGenre)) {
      reasons.push('restaurant brief built as a coffee shop instead');
    }
    // Require a real food ask — bare "menu"/"cafe" in craft-forbid text must not trip this.
    const foodMenuAsk = /\b(?:restaurant|bistro|bakery|dishes?|dinner\s+menu|food\s+menu)\b/i.test(askForGenre)
      || (/\b(?:cafe|coffee\s+shop|roaster)\b/i.test(askForGenre)
        && /\b(?:menu|dishes?|drinks?|pastr(?:y|ies)|latte|espresso)\b/i.test(askForGenre));
    if (foodMenuAsk && !/\b(?:menu|dish|price|\$\d|latte|espresso|pastr)/i.test(uiBlob)) {
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
        const containsBinaryByte = Array.from(b).some((character) => {
          const code = character.charCodeAt(0);
          return code <= 8 || (code >= 0x80 && code <= 0xff);
        });
        if (b && b.length < 400 && (/on-disk asset|\/\* binary|ASSET:/i.test(b) || !containsBinaryByte)) {
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
  // Strip forbid clauses first — "Do not ship a tip app / todo list" must not force interactive Ready.
  const t = stripUtilityFloorNoise(brief);
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
  // Marketing / product homepages are static story pages — CTAs as links are enough.
  if (briefLooksLikeMarketingLanding(t)) return false;
  const looksMarketing = /\b(?:landing\s+page|marketing\s+site|homepage|home\s+page|cafe|coffee\s+shop|roaster|bistro|bakery|restaurant|portfolio\s+site|hero\s+with|menu\s+highlights|premium\s+product|quiet[- ]luxury)\b/i.test(t);
  const looksApp = /\b(?:application|dashboard|workspace|kanban|todo|tracker|inbox|editor|ledger|budget|notes?)\b/i.test(t)
    || /\b(?:build|create|make)\s+(?:an?\s+)?(?:[\w-]+\s+){0,4}(?:app|application)\b/i.test(t)
    || /\b(?:useState|working\s+controls|multi-pane|interactive)\b/i.test(t);
  if (looksMarketing && !looksApp) return false;
  if (/\b(?:landing\s+page|marketing\s+site|homepage|home\s+page|product\s+homepage)\b/i.test(t)
    && !/\b(?:dashboard|workspace|interactive|todo|kanban)\b/i.test(t)) {
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
  // Section shells already carry the brand in NavHeader — don't stamp App.jsx.
  const appProbe = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  if (
    appLooksLikeCompositionalShell(appProbe)
    || Object.keys(files).some((p) => /^src\/sections\/[^/]+\.jsx$/i.test(p.replace(/\\/g, '/')))
  ) {
    return files;
  }
  const safe = name.replace(/[`$]/g, '');
  const token = name.split(/\s+/).find((w) => w.length >= 3) || name;
  const tokenRe = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const next = { ...files };
  for (const key of ['src/App.jsx', 'src/App.tsx']) {
    const body = next[key];
    if (!body) continue;
    if (tokenRe.test(body)) continue;
    let updated = body;
    // Swap stock titles the small coders leave in logo / h1.
    updated = updated.replace(
      /(<(?:span|a|h1|div)[^>]*className=["'][^"']*\b(?:logo-mark|brand-wordmark|brand|logo|nav-brand)\b[^"']*["'][^>]*>)([^<]{0,48})(<\/)/gi,
      (full, open, text, close) => {
        if (/todo\s*list|my\s*app|website|sample|untitled|product\s*name/i.test(String(text))) {
          return `${open}${safe}${close}`;
        }
        return full;
      },
    );
    updated = updated.replace(
      /(<h1\b[^>]*>)(\s*(?:Todo\s*List|My\s*App|Website|Sample|Untitled)\s*)(<\/h1>)/i,
      `$1${safe}$3`,
    );
    if (tokenRe.test(updated)) {
      next[key] = updated;
      continue;
    }
    if (/<header[\s>]/i.test(updated)) {
      updated = updated.replace(
        /(<header[^>]*>)/i,
        `$1\n        <div className="brand"><strong>${safe}</strong></div>`,
      );
    } else if (/<nav[\s>]/i.test(updated)) {
      updated = updated.replace(
        /(<nav[^>]*>)/i,
        `$1\n        <div className="brand"><strong>${safe}</strong></div>`,
      );
    } else if (/className=["']app["'][^>]*>/i.test(updated)) {
      updated = updated.replace(
        /(className=["']app["'][^>]*>)/i,
        `$1\n      <div className="brand"><strong>${safe}</strong></div>`,
      );
    }
    if (updated !== body) next[key] = updated;
  }
  return next;
}

/**
 * Lightweight CSS floor for utility apps (todo / tip / counter) when craft only
 * left :root tokens. Generic — never a canned App.jsx template.
 */
export function buildUtilityCompanionCss(productName: string, brief = ''): string {
  const id = createIdentityFromBrief(productName, brief);
  const brand = String(id.name || productName || 'App').replace(/[*/\\]/g, '').slice(0, 48);
  const p = id.palette;
  return `/* NOVA utility companion — ${brand} */
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
body { font-family: ${p.font}; line-height: 1.45; }
.App, .app { min-height: 100vh; display: flex; flex-direction: column; }
.nav, nav, .nav-container, .sticky-nav, header {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.9rem 1.25rem; border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
}
.logo-mark, .brand, .brand-wordmark, .nav-brand { font-weight: 700; letter-spacing: -0.03em; }
.nav-links { display: flex; gap: 1rem; flex-wrap: wrap; }
.nav-links a { color: var(--muted); text-decoration: none; }
.nav-links a:hover { color: var(--text); }
.hero, .hero-content, section.body, .body-content, main {
  width: min(720px, 92vw); margin: 0 auto; padding: 1.75rem 0 2.5rem;
}
.hero h1, h1 { margin: 0 0 0.4rem; font-size: clamp(1.6rem, 3vw, 2.2rem); letter-spacing: -0.03em; }
.hero p, .lede { margin: 0 0 1rem; color: var(--muted); }
.hero-cta { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 1rem; }
.todo-input, .tip-row, form.row, .controls {
  display: flex; gap: 0.55rem; flex-wrap: wrap; margin: 1rem 0;
}
input[type="text"], input[type="number"], input:not([type]), textarea, select {
  flex: 1; min-width: 160px; padding: 0.65rem 0.85rem; border-radius: 10px;
  border: 1px solid var(--line); background: var(--panel); color: var(--text);
}
button, .cta-button {
  appearance: none; border: 0; border-radius: 10px; padding: 0.65rem 1rem;
  background: var(--accent); color: ${p.btnInk}; font-weight: 700; cursor: pointer;
}
button:hover, .cta-button:hover { filter: brightness(1.06); }
.todo-list, ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
.todo-list li, li {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  padding: 0.7rem 0.85rem; border-radius: 10px; border: 1px solid var(--line); background: var(--panel);
}
.todo-search { margin: 0.75rem 0 1rem; }
.footer, footer {
  margin-top: auto; padding: 1.1rem 1.25rem; text-align: center;
  color: var(--muted); font-size: 0.9rem; border-top: 1px solid var(--line);
}
@media (max-width: 640px) {
  .hero, .body-content, main { width: min(100%, 94vw); padding-top: 1.2rem; }
}
`;
}

/**
 * Fix common small-model JSX mistakes that red-screen Vite Live:
 * - opening tag attrs then child `<` without closing `>`
 * - button label written as a bare attribute (`Add` before `</button>`)
 */
export function healBrokenJsxOpenTags(source: string): string {
  let s = String(source || '');
  if (!s || s.length < 40) return s;
  // Craft typo: `onClick={() => handleClick('6')}}">6` — extra } " before label.
  s = s.replace(/(\{\(\)\s*=>\s*[^}]+\})\}\s*["']\s*>/g, '$1>');
  // Craft typo: `required / value={…}` breaks Vite transform and freezes Live evidence.
  s = s.replace(/\brequired\s*\/\s*(value|onChange|onClick|placeholder|type|className)=/gi, 'required $1=');
  // Absolute public paths — `./public/…` or `/public/…` 404 in Vite Live (root is already public/).
  s = s.replace(/\bsrc=(["'])(?:\.\/)?public\//gi, 'src=$1/');
  s = s.replace(/\bsrc=(["'])\/public\//gi, 'src=$1/');
  // aria-label={`…`} / className="…" / onClick={() => …}\n    <child  → close the open tag
  s = s.replace(
    /(=(?:\{`[^`]*`\}|\{[^}\n]{0,180}\}|"[^"]*"|'[^']*'))\s*\n(\s*)(<\/?[A-Za-z])/g,
    '$1>\n$2$3',
  );
  // onClick={() => foo(bar)}\n    <child  when arrow args contain () — prior pattern stops early
  s = s.replace(
    /(onClick=\{\(\)\s*=>\s*[^\n{}]{1,120}\})\s*\n(\s*)(<\/?[A-Za-z])/g,
    '$1>\n$2$3',
  );
  // <button … aria-label={`…`}>\n missing: bare text attr then </button>
  s = s.replace(
    /(<button\b[^>]*?)(aria-label=\{`[^`]*`\})\s*\n(\s*)([A-Za-z][\w ]{0,40})\s*\n(\s*)<\/button>/g,
    '$1$2>\n$3$4\n$5</button>',
  );
  // Same without nested capture when > already almost there
  s = s.replace(
    /(aria-label=\{`[^`]*`\})\s*\n(\s*)([A-Za-z][\w ]{0,40})\s*\n(\s*)<\/button>/g,
    '$1>\n$2$3\n$4</button>',
  );
  return s;
}

/** True when CSS/App is a centered phone-column or skinny mid-stack. */
export function hasPhoneColumnShell(css: string, app = ''): boolean {
  const c = String(css || '');
  const a = String(app || '');
  const flexPhone = (
    /\.(?:app|site|App)\b[\s\S]{0,320}\bjustify-content\s*:\s*center\b/i.test(c)
    && /\.(?:app|site|App)\b[\s\S]{0,320}\balign-items\s*:\s*center\b/i.test(c)
  ) || (
    /#root\b[\s\S]{0,200}\bjustify-content\s*:\s*center\b/i.test(c)
    && /#root\b[\s\S]{0,200}\balign-items\s*:\s*center\b/i.test(c)
  );
  const skinnyMid = /\.(?:app|site)\b[^{]*\{[^}]{0,220}\bmax-width\s*:\s*(?:[0-9]|[12][0-9]|3[0-9]|40)(?:rem|em|%)\b/i.test(c)
    && /\.(?:app|site)\b[^{]*\{[^}]{0,220}\bmargin(?:-inline)?\s*:\s*(?:0\s+auto|auto)\b/i.test(c)
    && !/(?:100vw|full[- ]?bleed|width\s*:\s*100%)/i.test(c + a);
  return flexPhone || skinnyMid;
}

/** Liquor / cart / checkout storefront asks. */
export function briefLooksLikeCommerceStore(brief: string): boolean {
  return briefLooksLikeStorefront(brief);
}

/** True when App has real cart state + purchase — not just a cart icon. */
export function appHasCommerceCart(files: Record<string, string>): boolean {
  const app = String(files['src/App.tsx'] || files['src/App.jsx'] || '');
  const hasCartState = /\b(?:setCart|addToCart|add-to-cart)\b/i.test(app)
    || (/useState\s*\(\s*\[\s*\]\s*\)/.test(app) && /\bcart\b/i.test(app));
  const hasAdd = /Add to cart|addToCart|onClick=\{[^}]*cart/i.test(app);
  const hasBuy = /\b(?:Purchase|checkout|Order placed|placeOrder)\b/i.test(app);
  return hasCartState && hasAdd && hasBuy;
}

/**
 * Brand-agnostic thin product/marketing shell — header+title stubs, phone-column,
 * missing footer, unused heroes. Used to open the marketing floor on create fail-closed.
 */
export function isThinProductMarketingShell(
  files: Record<string, string>,
  brief = '',
): boolean {
  const t = String(brief || '');
  if (!briefLooksLikeMarketingLanding(t) && !/\b(?:website|homepage|landing|product\s+page|shop|store|liquor|cart)\b/i.test(t)) {
    return false;
  }
  if (briefLooksLikeMicroWebToy(t)) return false;
  const app = String(files['src/App.tsx'] || files['src/App.jsx'] || '');
  const css = String(files['src/App.css'] || '');
  if (!app.trim()) return true;
  const sectionCount = (app.match(/<(?:section|main)\b/gi) || []).length;
  const hasFooter = /<footer\b/i.test(app) || /className=["'][^"']*\b(?:footer|foot)\b/i.test(app);
  const heroFiles = Object.keys(files).some((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp|svg)/i.test(p.replace(/\\/g, '/')));
  const coverDecls = /COVER_HREFS|heroes\/[\w.-]+\.(?:jpe?g|png|webp|svg)/i.test(app);
  const heroRendered = /(?:src|href)=['"][^'"]*\/heroes\//i.test(app)
    || /\.hero\b[\s\S]{0,220}\/heroes\//i.test(css);
  if (hasPhoneColumnShell(css, app)) return true;
  if (!hasFooter) return true;
  if ((heroFiles || coverDecls) && !heroRendered) return true;
  // Liquor/cart asks with only a cart icon / title stub are still thin.
  if (briefLooksLikeCommerceStore(t) && !appHasCommerceCart(files)) return true;
  if (app.replace(/\s+/g, '').length < 1800 && sectionCount < 2) return true;
  return false;
}

/**
 * Surgical structure heal for thin product shells — strip phone-column, wire hero, add footer.
 * Does not replace a rich multi-section App.
 */
export function healProductMarketingStructure(
  files: Record<string, string>,
  productName: string,
  brief = '',
): { files: Record<string, string>; changed: boolean; actions: string[] } {
  const actions: string[] = [];
  const next = { ...files };
  const appKey = next['src/App.jsx'] ? 'src/App.jsx' : (next['src/App.tsx'] ? 'src/App.tsx' : '');
  if (!appKey || !next[appKey]) return { files: next, changed: false, actions };
  // Compositional shells own landmarks in src/sections — never inject COVER_HREFS / full-bleed
  // hero into App.jsx (that pushes nav below a broken missing-image stage).
  const keysNorm = Object.keys(next).map((p) => p.replace(/\\/g, '/'));
  const hasSections = keysNorm.some((p) => /^src\/sections\/[^/]+\.jsx$/i.test(p));
  if (
    thinWantsCompositionalShell(brief)
    || hasSections
    || appLooksLikeCompositionalShell(String(next[appKey] || ''))
  ) {
    return { files: next, changed: false, actions };
  }
  let app = String(next[appKey] || '');
  let css = String(next['src/App.css'] || '');
  const title = String(productName || 'Brand').replace(/[<>&'"`]/g, '').slice(0, 48) || 'Brand';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand';
  const heroFromDisk = Object.keys(next)
    .map((p) => p.replace(/\\/g, '/'))
    .find((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp|svg)$/i.test(p));
  const heroHref = heroFromDisk
    ? `/${heroFromDisk.replace(/^public\//i, '')}`
    : (app.match(/COVER_HREFS\s*=\s*\[['"]([^'"]+)/i)?.[1]
      || `/heroes/${slug}-hero.jpg`);

  if (hasPhoneColumnShell(css, app)) {
    css = css.replace(/\.app\s*\{([^}]*)\}/i, (_m, body: string) => {
      let b = String(body || '')
        .replace(/\bdisplay\s*:\s*flex\s*;?/gi, '')
        .replace(/\balign-items\s*:\s*center\s*;?/gi, '')
        .replace(/\bjustify-content\s*:\s*center\s*;?/gi, '');
      if (!/min-height\s*:/i.test(b)) b += ' min-height: 100vh;';
      if (!/width\s*:/i.test(b)) b += ' width: 100%;';
      if (!/display\s*:/i.test(b)) b += ' display: block;';
      return `.app {${b}}`;
    });
    css = css.replace(/\.site\s*\{([^}]*)\}/i, (_m, body: string) => {
      let b = String(body || '')
        .replace(/\bdisplay\s*:\s*flex\s*;?/gi, '')
        .replace(/\balign-items\s*:\s*center\s*;?/gi, '')
        .replace(/\bjustify-content\s*:\s*center\s*;?/gi, '');
      if (!/width\s*:/i.test(b)) b += ' width: 100%;';
      return `.site {${b}}`;
    });
    actions.push('strip-phone-column');
  }

  const heroRendered = /(?:src|href)=['"][^'"]*\/heroes\//i.test(app)
    || /\.hero\b[\s\S]{0,220}\/heroes\//i.test(css);
  if (!heroRendered && heroHref) {
    if (!/COVER_HREFS/.test(app) && !/const\s+COVER/.test(app)) {
      app = app.replace(
        /(import\s+['"]\.\/App\.css['"];?\s*)/i,
        `$1\nconst COVER_HREFS = ['${heroHref}'];\n`,
      );
    }
    if (/<\/header>/i.test(app)) {
      app = app.replace(
        /<\/header>/i,
        `</header>\n      <section className="hero full-bleed" id="top" aria-label="${title}">\n        <img className="hero-photo" src="${heroHref}" alt="${title} hero" />\n        <div className="hero-copy"><h1 className="product-name">${title}</h1></div>\n      </section>`,
      );
      actions.push('inject-hero');
    } else if (/className=["']app["'][^>]*>/i.test(app)) {
      app = app.replace(
        /(className=["']app["'][^>]*>)/i,
        `$1\n      <section className="hero full-bleed" id="top"><img className="hero-photo" src="${heroHref}" alt="${title} hero" /><h1>${title}</h1></section>`,
      );
      actions.push('inject-hero');
    }
    if (!/\.hero-photo\b/.test(css)) {
      css += `
.hero.full-bleed,.hero{position:relative;min-height:min(88vh,820px);width:100%;display:grid;place-items:center;overflow:hidden}
.hero-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55}
.hero-copy,.hero h1,.product-name{position:relative;z-index:1;text-align:center}
`;
      actions.push('hero-css');
    }
  }

  if (!/<footer\b/i.test(app) && !/className=["'][^"']*\b(?:footer|foot)\b/i.test(app)) {
    const foot = `\n      <footer className="footer foot" role="contentinfo">\n        <a href="#top">${title}</a>\n        <span>© ${new Date().getFullYear()} ${title}</span>\n      </footer>\n`;
    if (/<\/main>/i.test(app)) {
      app = app.replace(/<\/main>/i, `</main>${foot}`);
    } else if (/<\/div>\s*\)\s*;?\s*$/i.test(app)) {
      app = app.replace(/(\s*)<\/div>(\s*\)\s*;?\s*)$/i, `${foot}$1</div>$2`);
    } else {
      app = app.replace(/(\n\s*\);\s*}?\s*)$/i, `${foot}$1`);
    }
    actions.push('inject-footer');
    if (!/\.footer\b|\.foot\b/.test(css)) {
      css += `\n.footer,.foot{display:flex;flex-wrap:wrap;gap:1rem;justify-content:center;padding:2rem 1rem;border-top:1px solid rgba(255,255,255,.12)}\n.footer a,.foot a{color:inherit;opacity:.8;text-decoration:none}\n`;
    }
  }

  if (actions.length) {
    next[appKey] = app;
    next['src/App.css'] = css;
  }
  return { files: next, changed: actions.length > 0, actions };
}

/**
 * When craft left a real App but Ready fails on thin CSS / missing brand, heal those
 * two gaps without replacing the App with a canned template.
 */
/**
 * True when App.css still carries the dark SaaS near-ready atmosphere on a light brief.
 */
export function cssHasDarkTechStomp(css: string): boolean {
  const c = String(css || '');
  if (!c.trim()) return false;
  if (/linear-gradient\(\s*165deg[^;]*#0c0f14/i.test(c)) return true;
  if (/#0c0f14/.test(c) && /NOVA near-ready|softOrbDrift/i.test(c) && /--paper|#f4efe6|#f3eee4/i.test(c)) {
    return true;
  }
  return false;
}

/**
 * Strip dark-tech atmosphere / forced --bg:#0f1419 when the brief wants parchment grounds.
 * Safe no-op for dark product asks.
 */
export function healAtelierPaletteCss(css: string, brief: string): string {
  if (!briefWantsLightPaperGround(brief)) return String(css || '');
  let next = String(css || '');
  next = next.replace(
    /\.app,\s*\.hero\s*\{\s*background-image:\s*[\s\S]*?#0c0f14[\s\S]*?\}\s*/gi,
    '',
  );
  next = next.replace(
    /background-image:\s*[\s\S]{0,280}linear-gradient\(\s*165deg,\s*#0c0f14[\s\S]{0,120}\)\s*;/gi,
    'background-image: linear-gradient(165deg, #f4efe6, #efe8dc 55%, #f7f2ea);',
  );
  if (/--paper\s*:|#f4efe6|#f3eee4|#faf7f0|#f7f2ea/i.test(next)) {
    next = next
      .replace(/--bg:\s*#0f1419\s*;/gi, '--bg: #f4efe6;')
      .replace(/--panel:\s*#1a222c\s*;/gi, '--panel: #faf7f0;');
  }
  // Sticky-nav defaults that hard-code charcoal over parchment tokens.
  next = next.replace(
    /var\(--bg,\s*#0f1419\)/gi,
    'var(--bg, #f4efe6)',
  );
  return next;
}

export function healNearReadyCreateUi(
  files: Record<string, string>,
  productName: string,
  brief = '',
): { files: Record<string, string>; changed: boolean; actions: string[] } {
  const actions: string[] = [];
  let next = ensureProductBrandInApp({ ...files }, productName);
  const appKey = next['src/App.jsx'] ? 'src/App.jsx' : (next['src/App.tsx'] ? 'src/App.tsx' : '');
  if (appKey && next[appKey]) {
    let fixed = healBrokenJsxOpenTags(next[appKey]);
    // Craft sometimes appends orphan `</div>}` after a valid App — breaks Vite Live.
    const stripped = String(fixed || '').replace(/\n\}\s*\n\s*<\/(?:div|main|section|aside)>\s*\n\}\s*$/i, '\n}\n');
    if (stripped !== fixed) {
      fixed = stripped;
      actions.push('trailing-jsx-junk');
    }
    if (fixed !== next[appKey]) {
      next[appKey] = fixed;
      actions.push('jsx-open-tags');
    }
  }
  const app = appKey ? String(next[appKey] || '') : '';
  const css = String(next['src/App.css'] || '');
  const cssLen = css.replace(/\s+/g, '').length;
  const marketing = briefLooksLikeMarketingLanding(brief) && !briefLooksLikeMicroWebToy(brief);
  const accBlob = Object.values(next).join('\n');
  const modernAtelierShell = /data-nova-shell=["'](?:lookbook|rail|feature|strip|commission)["']/i.test(accBlob);
  // Cafe/landing Ready wants ~900–2000 CSS + gradients. Small models often leave 400–800
  // chars of flat CSS — still fail "too thin" / "premium depth". Floor those too.
  // Never replace modern atelier shell App.css with the shared companion stamp (Prism Latch).
  const cssFloorAt = marketing ? 2000 : 400;
  if (
    !modernAtelierShell
    && app.length >= 200
    && cssLen < cssFloorAt
    && !/getContext\s*\(\s*['"]2d['"]|canvas|requestAnimationFrame/i.test(app)
  ) {
    next['src/App.css'] = marketing
      ? buildMarketingCompanionCss(productName, brief)
      : buildUtilityCompanionCss(productName, brief);
    actions.push('css-floor');
  }
  if (modernAtelierShell) {
    const healedShell = healModernAtelierCompanionStomp(next, productName);
    if (String(healedShell['src/App.css'] || '') !== String(next['src/App.css'] || '')
      || String(healedShell['src/sections/HeroSection.jsx'] || '') !== String(next['src/sections/HeroSection.jsx'] || '')) {
      next = healedShell;
      actions.push('atelier-shell-companion-stomp');
    }
  }
  // Premium landings: thick but flat CSS still fails Ready — inject motion + atmosphere in place.
  // Never stamp dark SaaS #0c0f14 onto parchment / cream atelier briefs (Fern Latch stomp).
  // Never stamp shared motion/atmosphere onto modern atelier shells (owns section CSS).
  if (marketing && app.length >= 200 && !modernAtelierShell) {
    let cssNow = String(next['src/App.css'] || '');
    const beforeAtmos = cssNow;
    const lightPaper = briefWantsLightPaperGround(brief);
    if (!/@keyframes/i.test(cssNow)) {
      cssNow += `

/* NOVA near-ready motion */
@keyframes contractReveal {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}
@keyframes softOrbDrift {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(10px, -16px); }
}
.hero, section, .band, .feature-a, .feature-b, .feature-c {
  animation: contractReveal 0.75s ease both;
}
`;
      actions.push('css-motion');
    }
    if (!/radial-gradient|linear-gradient/i.test(cssNow)) {
      cssNow += lightPaper
        ? `
.app, .hero {
  background-image:
    radial-gradient(ellipse 55% 45% at 18% 22%, rgba(176,141,87,0.16), transparent 60%),
    radial-gradient(ellipse 50% 40% at 82% 18%, rgba(20,32,51,0.06), transparent 58%),
    linear-gradient(165deg, #f4efe6, #efe8dc 55%, #f7f2ea);
}
`
        : `
.app, .hero {
  background-image:
    radial-gradient(ellipse 55% 45% at 18% 22%, rgba(126,184,255,0.22), transparent 60%),
    radial-gradient(ellipse 50% 40% at 82% 18%, rgba(154,163,178,0.18), transparent 58%),
    linear-gradient(165deg, #0c0f14, #141a22 55%, #0c0f14);
}
`;
      actions.push('css-atmosphere');
    }
    if (cssNow !== beforeAtmos) next['src/App.css'] = cssNow;
  }
  // Permanent: strip prior dark-tech stomps when this brief wants parchment grounds.
  if (next['src/App.css'] && briefWantsLightPaperGround(brief)) {
    const healedCss = healAtelierPaletteCss(String(next['src/App.css'] || ''), brief);
    if (healedCss !== next['src/App.css']) {
      next['src/App.css'] = healedCss;
      actions.push('atelier-palette-heal');
    }
  }
  // Marketing / brand: designed hero visual so hero preflight passes without Pollinations or /heroes files.
  if (briefLooksLikeMarketingLanding(brief) && appKey && next[appKey]) {
    try {
      const hv = ensureDesignedHeroVisual(next, { brief, productName });
      if (hv.changed) {
        next = { ...hv.files };
        actions.push('designed-hero-visual');
      }
    } catch { /* optional */ }
  }
  if (appKey && next[appKey] && next['src/App.css'] && !/import\s+['"]\.\/App\.css['"]/.test(next[appKey])) {
    next[appKey] = `import './App.css';\n${next[appKey]}`;
    actions.push('css-import');
  }
  // Strip stock stub footers that fail layout score on otherwise-good utility apps.
  if (appKey && next[appKey] && /\b(?:Built|Designed) for general users\b/i.test(next[appKey])) {
    const brand = String(productName || 'App').replace(/[`$]/g, '').slice(0, 48);
    next[appKey] = next[appKey]
      .replace(/\bDesigned for general users\.?/gi, `${brand} — add, track, done.`)
      .replace(/\bBuilt for general users\.?/gi, `Made with ${brand}`);
    actions.push('stub-copy');
  }
  // Marketing crafts often glue a Three.js demo onto a homepage — blanks Live when
  // `three` is not in package.json. Prefer Design Spine shell restore (paren-balance
  // JSX salvage fails on onClick={() => …} nests). Keep the old salvage as a soft path.
  // Use marketingLanding (not the micro-toy-gated `marketing` flag) so forbid-tip text cannot skip this.
  if (
    briefLooksLikeMarketingLanding(brief)
    && appKey
    && next[appKey]
    && /(?:from\s+['"]three|OrbitControls|\bTHREE\b|WebGLRenderer)/i.test(next[appKey])
    && !looksLikeSpatialApp(brief)
  ) {
    const src = next[appKey];
    const returnIdx = src.search(/\breturn\s*\(/);
    let jsx = '';
    if (returnIdx >= 0) {
      const after = src.slice(returnIdx).replace(/^\s*return\s*\(\s*/i, '');
      let depth = 1;
      let end = -1;
      for (let i = 0; i < after.length; i++) {
        const ch = after[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') {
          depth -= 1;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end > 0) jsx = after.slice(0, end).trim();
    }
    // Only keep JSX when it already looks like a marketing shell AND has no THREE tags.
    if (
      jsx
      && /className=["'][^"']*\b(?:hero|app|feature|band|site)\b/i.test(jsx)
      && !/\bTHREE\b|WebGLRenderer|OrbitControls/i.test(jsx)
      && !/<\/THREE\./i.test(jsx)
    ) {
      const brand = String(productName || 'App').replace(/[`$\\]/g, '').slice(0, 48);
      next[appKey] = `import './App.css';\n\nexport default function App() {\n  return (\n    ${jsx}\n  );\n}\n`;
      if (brand.length >= 2 && !new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(next[appKey])) {
        next[appKey] = next[appKey].replace(
          /(<h1\b[^>]*>)([\s\S]*?)(<\/h1>)/i,
          `$1${brand}$3`,
        );
      }
      actions.push('strip-three-marketing');
    }
    // Never paste a Design Spine template when Three.js strip fails — leave craft
    // source and let originality lint / craft retry handle quality.
  }
  // Tip/todo/utility: absolute icon-rails fail craft preflight — strip before score.
  const utilityAsk = /\b(?:todo|task\s*list|tip\s*(?:calc|calculator|wise)|checklist|counter|timer|notepad)\b/i.test(brief);
  if (utilityAsk && appKey && next[appKey]) {
    const beforeRail = next[appKey];
    next[appKey] = beforeRail
      .replace(/<div className=["'][^"']*\b(?:icon|brand)-rail\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*/gi, '');
    if (next[appKey] !== beforeRail) actions.push('strip-utility-rails');
    if (next['src/App.css'] && /\.(?:icon|brand)-rail\s*\{/i.test(next['src/App.css'])) {
      next['src/App.css'] = next['src/App.css']
        .replace(/\.(?:icon|brand)-rail(?:--[a-z0-9-]+)?\s*\{[^}]*\}\s*/gi, '');
      actions.push('strip-utility-rail-css');
    }
  }
  // Thick CSS can still fail originality on missing fonts — append without wiping App.
  if (marketing && app.length >= 200) {
    let cssFonts = String(next['src/App.css'] || '');
    if (!/@font-face|fonts\.googleapis|font-family\s*:/i.test(cssFonts)) {
      cssFonts = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=Source+Sans+3:wght@400;600&display=swap');\n${cssFonts}\n:root{--display:Fraunces,Georgia,serif;--body:"Source Sans 3",system-ui,sans-serif}\nbody,.app,.site{font-family:var(--body)}\nh1,h2,.product-name,.title{font-family:var(--display)}\n`;
      next['src/App.css'] = cssFonts;
      actions.push('css-fonts');
    }
  }
  // Marketing thin shells: strip phone-column / wire heroes / footer while keeping model App when possible.
  // NEVER run on tool-panel / app-chrome / game — that injected Tipjar’s broken COVER hero.
  // NEVER run on compositional section shells — inject-hero poisons the App shell.
  const family = inferCreateCompositionFamily(brief, productName);
  const allowMarketingStruct = family === 'marketing-bands' || family === 'catalog-store';
  const compositionalNow = thinWantsCompositionalShell(brief)
    || Object.keys(next).some((p) => /^src\/sections\/[^/]+\.jsx$/i.test(p.replace(/\\/g, '/')))
    || appLooksLikeCompositionalShell(String(next['src/App.jsx'] || next['src/App.tsx'] || ''));
  if (
    allowMarketingStruct
    && !compositionalNow
    && (marketing || isThinProductMarketingShell(next, brief))
  ) {
    const struct = healProductMarketingStructure(next, productName, brief);
    if (struct.changed) {
      next = struct.files;
      actions.push(...struct.actions.map((a) => `struct-${a}`));
    }
  }
  const brandBefore = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  const brandAfter = String(next['src/App.jsx'] || next['src/App.tsx'] || '');
  if (brandBefore !== brandAfter) actions.push('brand-stamp');
  const changed = actions.length > 0
    || css !== String(next['src/App.css'] || '')
    || brandBefore !== brandAfter;
  return { files: next, changed, actions: [...new Set(actions)] };
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
  const rawBrief = String(opts?.brief || '');
  // Strip "Do not ship a tip/todo…" before ladder/utility detection — otherwise premium
  // homepages false-route into requireInteractive and fail with "no interactive handlers".
  const brief = stripUtilityFloorNoise(rawBrief);
  // Product invent only: Preview/Ready aligns with Premium — never for CLI/API/dashboard.
  if (isProductSiteAsk(rawBrief) && briefWantsProductLadder(rawBrief)) {
    const graded = gradeProductQuality(files, rawBrief, opts?.productName || '');
    if (!graded.okPremium) {
      return {
        ok: false,
        reasons: [
          `product invent below Premium (${graded.label})`,
          ...graded.reasons.slice(0, 4),
        ],
      };
    }
  }
  // Product / marketing homepages first — never treat forbid-tip text as a todo ladder ask.
  if (briefLooksLikeAppleStyleHomepage(rawBrief) || briefLooksLikeMarketingLanding(rawBrief)) {
    const bookingCommerce = /\b(?:book|reserv|appointment|time\s*slot|cart|checkout|borrow)\b/i.test(brief);
    const base = isPreviewReady(files, {
      ...opts,
      brief: rawBrief,
      requireInteractive: Boolean(opts?.requireInteractive) && bookingCommerce,
    });
    const reasons = [...base.reasons];
    const spec = opts?.spec || buildProductSpec({
      brief: rawBrief,
      productName: opts?.productName || '',
    });
    const layout = scoreLayoutQuality(files, { brief: rawBrief, spec, contract: opts?.contract || null });
    const functional = scoreFunctionalReady(files, { brief: rawBrief, spec });
    for (const r of layout.reasons) reasons.push(r);
    for (const r of functional.reasons) reasons.push(r);
    // Originality / quality — never force Design Spine landmarks.
    const blankSolid = blankSolidColorFromAsk(rawBrief);
    if (!blankSolid) {
      const orig = lintOriginalCreateQuality(files, {
        brief: rawBrief,
        productName: opts?.productName || '',
      });
      for (const r of orig.reasons) reasons.push(r);
    }
    // Live/Ready uses visual floor (seed-reachable) — invent 9k floor is soft.
    if (thinBriefWantsDepth(rawBrief) && thinBlocksLivePreview(files, rawBrief)) {
      for (const d of thinLiveVisualDeficits(files, rawBrief).slice(0, 6)) {
        reasons.push(`thin visual floor open: ${d}`);
      }
    }
    for (const r of thinQualityRubricHints(files, rawBrief)) {
      reasons.push(r);
    }
    const hard = reasons.filter((r) => !r.startsWith(CREATE_QUALITY_RUBRIC_PREFIX));
    return { ok: hard.length === 0, reasons: [...new Set(reasons)] };
  }
  // Side-by-side / everyday creates: base Ready only — no layout/marketing score walls.
  const simpleLadderAsk = briefWantsUtilityFloorKind(brief, 'todo')
    || briefWantsUtilityFloorKind(brief, 'tip')
    || briefWantsUtilityFloorKind(brief, 'coffee')
    || briefWantsUtilityFloorKind(brief, 'kiln')
    || /\b(?:tasknest|checklist|counter|timer|notepad|calculator|simple\s+coffee|coffee\s+shop\s+page|kilnbook|kiln\s*book|pottery|firing\s+journal)\b/i.test(brief)
    || briefLooksLikeFiringJournal(brief)
    || (brief.length < 280 && /\b(?:simple|basic|small|quick)\b/i.test(brief)
      && /\b(?:coffee|todo|tip|page|app|site|kiln|firing|calculator)\b/i.test(brief));
  if (simpleLadderAsk) {
    return isPreviewReady(files, {
      ...opts,
      brief: rawBrief,
      requireInteractive: briefWantsUtilityFloorKind(brief, 'todo')
        || briefWantsUtilityFloorKind(brief, 'tip')
        || briefWantsUtilityFloorKind(brief, 'kiln')
        || /\b(?:task|counter|timer|kiln|firing|pottery|clay|glaze|calculator)\b/i.test(brief)
        || briefLooksLikeFiringJournal(brief),
    });
  }
  // Utility asks must never hit arcade/FPS/3D gates — ensemble plan fluff often
  // says "playable" / "canvas" / "game loop" and false-fails a working todo.
  const utilityAsk = briefWantsUtilityFloorKind(brief, 'todo')
    || briefWantsUtilityFloorKind(brief, 'tip')
    || briefWantsUtilityFloorKind(brief, 'kiln')
    || /\b(?:checklist|counter|timer|notepad|kilnbook|pottery|firing|calculator)\b/i.test(brief)
    || briefLooksLikeFiringJournal(brief);
  if (utilityAsk) {
    return isPreviewReady(files, { ...opts, brief: rawBrief, requireInteractive: true });
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
  const storefrontAsk = briefLooksLikeCommerceStore(brief);
  const commerce = storefrontAsk || /\b(?:cart|checkout|booking|reserv|borrow)\b/i.test(brief);
  const needsInteractive = (!marketing || commerce) && (
    Boolean(opts?.requireInteractive)
    || briefRequiresInteractiveApp(brief)
    || briefLooksLikeChatApp(brief)
    || storefrontAsk
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
  // Product hardware / shop / storefront pages still need originality even when marketing classifier missed.
  const productHardware = /\b(?:mouse|keyboard|headset|earbuds?|vacuum|shop|store|product\s+page)\b/i.test(rawBrief)
    && /\b(?:website|landing|homepage|marketing|brand)\b/i.test(rawBrief);
  if ((marketing || productHardware || storefrontAsk) && !blankSolidColorFromAsk(rawBrief)) {
    const orig = lintOriginalCreateQuality(files, {
      brief: rawBrief,
      productName: opts?.productName || '',
    });
    for (const r of orig.reasons) reasons.push(r);
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
  /via\.placeholder\.com|placehold\.co|placekitten\.com|picsum\.photos|dummyimage\.com|images\.unsplash\.com|unsplash\.com|pexels\.com|i\.imgur\.com/i;

/**
 * Replace fake / placeholder image hosts with offline-safe generated glyphs.
 * Only known placeholder/stock demo hosts — never blanket-wipe every https URL
 * (that destroyed real CDN product art, brand assets, and general-app images).
 * User-uploaded local paths (/heroes/, nova-media:, data:) are left alone.
 */
export function sanitizeCreatePolishPlaceholders(app: string): string {
  let next = String(app || '');
  let n = 0;
  const swap = (label?: string) => {
    n += 1;
    return productGlyphDataUrl(label || `Item ${n}`, { role: 'thumb', brief: String(label || '') });
  };

  next = next.replace(/src=(["'])\/path\/to\/[^"']+\1/gi, (_m, q) => `src=${q}${swap('Item')}${q}`);
  next = next.replace(/url\((['"]?)\/path\/to\/[^)"']+\1\)/gi, () => `url(${swap('Item')})`);

  next = next.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/src=(["'])([^"']*)\1/i)?.[2] ?? '';
    // Keep same-origin / local public assets / data / nova-media / localhost.
    if (/^\/(?:heroes|icons|logo|brand|media)\//i.test(src)) return tag;
    if (/^data:/i.test(src)) return tag;
    if (/nova-media:|localhost|127\.0\.0\.1/i.test(src)) return tag;
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
    /url\((['"]?)https?:\/\/(?:via\.placeholder\.com|placehold\.co|placekitten\.com|picsum\.photos|dummyimage\.com|images\.unsplash\.com|[^)"']*unsplash\.com|[^)"']*pexels\.com)[^)"']*\1\)/gi,
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
  opts?: { artifactKind?: string; brief?: string },
): { files: Record<string, string>; changed: string[] } {
  const next = { ...files };
  const changed: string[] = [];
  // Never flatten CLI / Python / library Acc into a quiet-luxury marketing landing.
  const paths = Object.keys(next).map((p) => p.replace(/\\/g, '/'));
  const looksNonWebAcc = paths.some((p) =>
    /^(?:bin\/|src\/cli\.|cli\.js$|main\.py$|app\.py$|server\.js$|index\.js$)/i.test(p)
    || /\.(?:py|go|rs)$/i.test(p),
  ) && !paths.some((p) => /^src\/App\.(jsx|tsx)$/i.test(p));
  if (looksNonWebAcc) return { files: next, changed };
  // Only product-site / thin web shells may be assembled into a landing — not dashboards/games mid-edit.
  try {
    const kind = String(opts?.artifactKind || '');
    // Fail closed: missing kind + non-product brief → never assemble marketing shell.
    if (!kind || kind === 'unknown') {
      if (opts?.brief && !isProductSiteAsk(opts.brief)) {
        return { files: next, changed };
      }
    } else if (kind !== 'product-site' && kind !== 'static-web') {
      return { files: next, changed };
    }
  } catch { /* keep legacy path */ }
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

/** Brief-aware product hero fallback — glow rim + product silhouette (not luggage). */
export function productHeroDataUrl(brief: string, brand: string): string {
  const label = String(brand || 'Brand').replace(/[<>&'"]/g, '').slice(0, 28) || 'Brand';
  const ctx = String(brief || '').toLowerCase();
  const tea = /\b(?:matcha|tea|steep|tin|canister|leaf|brew)\b/i.test(ctx);
  const coffee = /\b(?:coffee|espresso|roast|cafe)\b/i.test(ctx);
  const bottle = /\b(?:liquor|spirits?|whiskey|wine|bottle)\b/i.test(ctx);
  const lotion = /\b(?:lotion|skincare|cream|serum|beauty)\b/i.test(ctx);
  const accent = tea ? '#7d9b78' : coffee ? '#c9853a' : bottle ? '#c4a45a' : lotion ? '#d4a5a5' : '#6b8cae';
  let product = '';
  if (tea) {
    product = [
      '<ellipse cx="480" cy="520" rx="150" ry="28" fill="#2a322c"/>',
      '<rect x="330" y="320" width="300" height="220" rx="28" fill="#e8eef4"/>',
      '<rect x="355" y="290" width="250" height="48" rx="14" fill="#cfd8e0"/>',
      `<text x="480" y="440" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="28" font-weight="700">${label.slice(0, 14)}</text>`,
      '<text x="480" y="480" text-anchor="middle" fill="#4a5560" font-family="Helvetica Neue,sans-serif" font-size="18">tin · ceremonial</text>',
    ].join('');
  } else if (coffee) {
    product = [
      '<ellipse cx="480" cy="620" rx="160" ry="30" fill="#2a2218"/>',
      '<path d="M340 300 h240 a40 40 0 0 1 40 40 v220 a40 40 0 0 1 -40 40 h-240 a40 40 0 0 1 -40 -40 v-220 a40 40 0 0 1 40 -40 z" fill="#e8eef4"/>',
      '<path d="M620 380 h70 a50 50 0 0 1 0 140 h-70" fill="none" stroke="#e8eef4" stroke-width="28"/>',
      `<text x="460" y="470" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="26">${label.slice(0, 12)}</text>`,
    ].join('');
  } else if (bottle) {
    product = [
      '<rect x="420" y="240" width="120" height="40" rx="8" fill="#cfd8e0"/>',
      '<path d="M400 280 h160 l30 360 h-220 z" fill="#e8eef4"/>',
      `<text x="480" y="480" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="22">${label.slice(0, 10)}</text>`,
    ].join('');
  } else if (lotion) {
    product = [
      '<rect x="400" y="260" width="160" height="360" rx="70" fill="#e8eef4"/>',
      '<rect x="430" y="230" width="100" height="50" rx="12" fill="#cfd8e0"/>',
      `<text x="480" y="460" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="24">${label.slice(0, 12)}</text>`,
    ].join('');
  } else {
    product = [
      '<rect x="360" y="300" width="240" height="300" rx="24" fill="#e8eef4"/>',
      `<text x="480" y="460" text-anchor="middle" fill="#1a222c" font-family="Georgia,serif" font-size="28">${label.slice(0, 14)}</text>`,
    ].join('');
  }
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1100" viewBox="0 0 960 1100">',
    '<defs>',
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#0f1419"/><stop offset="55%" stop-color="#1a222c"/><stop offset="100%" stop-color="#122033"/>',
    '</linearGradient>',
    '<radialGradient id="glow" cx="50%" cy="42%" r="45%">',
    `<stop offset="0%" stop-color="${accent}" stop-opacity="0.45"/><stop offset="100%" stop-color="#0f1419" stop-opacity="0"/>`,
    '</radialGradient>',
    '</defs>',
    '<rect width="960" height="1100" fill="url(#bg)"/>',
    '<rect width="960" height="1100" fill="url(#glow)"/>',
    product,
    `<text x="480" y="980" text-anchor="middle" fill="#e8eef4" font-family="Helvetica Neue,sans-serif" font-size="34" font-weight="650">${label}</text>`,
    '</svg>',
  ].join('');
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/**
 * After Brand Assets land in public/, wire them into App + CSS and strip the
 * common failure mode where /logo.svg is stretched as a full-bleed background
 * (reads as a giant geometric mark behind the page).
 */
export function wireCreatePublicAssets(
  files: Record<string, string>,
  productName = 'App',
  brief = '',
): { files: Record<string, string>; changed: string[] } {
  const briefText = String(brief || '');
  const keysEarly = Object.keys(files).map((p) => p.replace(/\\/g, '/'));
  const hasSectionFiles = keysEarly.some((p) => /^src\/sections\/[^/]+\.jsx$/i.test(p));
  const appEarly = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  // Compositional depth owns App as a <Section /> shell — do not flatten via
  // assembleCreateAppFromParts or inject sticky-nav (that re-poisons landmarks).
  const compositionalShell = thinWantsCompositionalShell(briefText)
    || hasSectionFiles
    || appLooksLikeCompositionalShell(appEarly);
  const assembleKind = briefText ? resolveArtifactKind(briefText) : undefined;
  const assembled = compositionalShell
    ? { files: { ...files }, changed: [] as string[] }
    : assembleCreateAppFromParts(files, productName, { brief: briefText, artifactKind: assembleKind });
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
  const logoKey = keys.find((p) => /(^|\/)public\/logo\.svg$/i.test(p)) || 'public/logo.svg';
  // Presence means a REAL SVG body — prose leaks ("No changes needed.") must not count.
  const logoLooksReal = (body: string) => {
    const t = String(body || '').trim();
    return t.length >= 40 && /<svg[\s>]/i.test(t);
  };
  let hasLogo = logoLooksReal(String(next[logoKey] || ''));
  const hasSearch = keys.some((p) => /(^|\/)public\/icons\/search\.svg$/i.test(p));
  const hasBag = keys.some((p) => /(^|\/)public\/icons\/bag\.svg$/i.test(p));
  const family = inferCreateCompositionFamily(brief || productName, productName);
  // Tools/apps must not get COVER_HREFS forced in — that paints broken hero theater.
  const allowCoverWire = family === 'marketing-bands' || family === 'catalog-store';
  const heroes = allowCoverWire
    ? keys
      .filter((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp|svg)$/i.test(p))
      .map((p) => '/' + p.replace(/^public\//i, ''))
    : [];
  const appKey = next['src/App.tsx'] && !next['src/App.jsx']
    ? 'src/App.tsx'
    : (next['src/App.jsx'] ? 'src/App.jsx' : (next['src/App.tsx'] ? 'src/App.tsx' : ''));
  const cssKey = next['src/App.css'] ? 'src/App.css' : '';

  // Every marketing/brand create ships a real mark: synthesize public/logo.svg offline
  // from logoIconifyFor(brief) whenever it is missing/empty. Network materialize can miss
  // (no iconify, bridge write refused) — this is the guarantee, and it never uses a hero.
  const wantsBrandLogo = family === 'marketing-bands'
    || family === 'catalog-store'
    || briefLooksLikeMarketingLanding(String(brief || ''))
    || thinBriefWantsDepth(String(brief || ''));
  // Rewrite sparkles last-resort marks when the brief now resolves to a family icon
  // (gin→wine, coffee→coffee). Otherwise prior Live runs keep the identical star.
  const existingLogo = hasLogo ? String(next[logoKey] || '') : '';
  const logoIsSparkles = /M9\.937 15\.5/i.test(existingLogo);
  const wantFamily = logoIconifyFor(String(productName || ''), String(brief || ''));
  const logoMatchesFamily = wantFamily === 'lucide:wine' ? /M8 22h8/i.test(existingLogo)
    : wantFamily === 'lucide:coffee' ? /M10 2v2|M16 8a1 1 0 0 1 1 1v8/i.test(existingLogo)
      : wantFamily === 'lucide:leaf' ? /M11 20A7 7 0 0 1 9\.8/i.test(existingLogo) || /leaf/i.test(existingLogo)
        : wantFamily === 'lucide:utensils' ? /M3 2v7c0 1\.1/i.test(existingLogo)
          : wantFamily === 'nova:desk' ? /viewBox="0 0 64 64"[\s\S]*width="48" height="8"/i.test(existingLogo)
            : !logoIsSparkles;
  // Invent-demo owns its logo — never stomp with Lucide family marks (speakers→package race).
  const inventOwnsLogo = /data-nova-invent-demo\s*=\s*["']1["']/.test(
    String(next['src/App.jsx'] || next['src/App.tsx'] || ''),
  ) || /data-nova-invent-logo\s*=\s*["']1["']/i.test(existingLogo)
    || (/viewBox=["']0 0 64 64["']/i.test(existingLogo)
      && /<text\b/i.test(existingLogo)
      && !/viewBox=["']0 0 24 24["']/i.test(existingLogo));
  // Always stomp sparkles (and mismatched family marks) for F&B / brand creates.
  const shouldWriteLogo = wantsBrandLogo && !inventOwnsLogo && (
    !hasLogo
    || (logoIsSparkles && wantFamily !== 'lucide:sparkles')
    || (wantFamily !== 'lucide:sparkles' && !logoMatchesFamily)
  );
  if (shouldWriteLogo) {
    const mark = brandLogoSvgFor({
      productName,
      brief,
      css: cssKey ? String(next[cssKey] || '') : '',
    });
    if (mark) {
      next[logoKey] = mark;
      changed.push(logoKey);
      if (!keys.includes(logoKey)) keys.push(logoKey);
      hasLogo = true;
    }
  }

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
    // Hero photo underlay — only when the App has no real hero <img> / COVER stage.
    // Booking stubs used to get a recycled full-page bg; shop floors already render heroes.
    const appSrc = appKey ? String(next[appKey] || '') : '';
    const hasHeroStage = /className=["'][^"']*\bhero-photo\b|COVER_HREFS|src=["'][^"']*\/heroes\//i.test(appSrc)
      || /\.hero-photo\b|url\(\s*['"]?\/heroes\//i.test(css);
    const bgFallback = briefWantsLightPaperGround(briefText) ? '#f4efe6' : '#0f1419';
    const lineFallback = briefWantsLightPaperGround(briefText)
      ? 'rgba(26, 31, 28, 0.12)'
      : 'rgba(232,238,244,0.14)';
    if (heroes[0] && !hasHeroStage && !/url\(\s*['"]?\/heroes\//i.test(css)) {
      css += `\n.app-shell, .app { background-image: linear-gradient(180deg, color-mix(in srgb, var(--bg, ${bgFallback}) 88%, transparent), color-mix(in srgb, var(--bg, ${bgFallback}) 94%, transparent)), url('${heroes[0]}'); background-size: cover; background-position: center; }\n`;
    }
    if ((hasLogo || hasSearch || hasBag) && !/\.sticky-nav\b/.test(css)) {
      css += `
.sticky-nav { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.85rem 1.25rem; position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--bg, ${bgFallback}) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line, ${lineFallback}); }
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
    // Never let a hero image stand in as the brand mark: nav/logo <img> points at /logo.svg.
    if (hasLogo) {
      app = app.replace(/<img\b[^>]*>/gi, (tag) => {
        if (/\/logo\.svg/i.test(tag)) return tag;
        if (!/\/heroes\/|\/hero\.jpg/i.test(tag)) return tag;
        const brandClass = /className=(["'])[^"']*(?:\blogo\b|\bbrand\b)[^"']*\1/i.test(tag);
        if (!brandClass) return tag;
        return tag.replace(/src=(["'])[^"']*\1/i, 'src=$1/logo.svg$1');
      });
      // Models also drop the mark in <nav> with no class at all — first <img> wins.
      app = app.replace(/<nav\b[^>]*>[\s\S]{0,900}?<\/nav>/gi, (block) => {
        if (/\/logo\.svg/i.test(block) || !/\/heroes\/|\/hero\.jpg/i.test(block)) return block;
        return block.replace(
          /<img\b[^>]*src=(["'])[^"']*\1[^>]*>/i,
          (m) => m.replace(/src=(["'])[^"']*\1/i, 'src=$1/logo.svg$1'),
        );
      });
    }
    app = healUndefinedImgSrcBindings(app, heroes);
    app = healUndeclaredCoverHrefs(app, heroes);
    app = healUndeclaredItemsList(app, heroes);
    app = healHiddenProductBands(app);
    // Prefer on-disk heroes over empty/broken/data-uri tiles for browse cards.
    // Compositional shells must not get COVER_HREFS stuffed into App.jsx.
    if (heroes.length && !compositionalShell) {
      if (!/\b(?:const|let|var)\s+COVER_HREFS\b/.test(app)) {
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
    // Compositional shells: logo lives in NavHeaderSection — never inject sticky-nav into App.
    const iconFiles = keys
      .filter((p) => /(?:^|\/)public\/icons\/([a-z0-9_-]+)\.svg$/i.test(p))
      .map((p) => {
        const m = p.replace(/\\/g, '/').match(/public\/icons\/([a-z0-9_-]+)\.svg$/i);
        return m ? m[1].toLowerCase() : '';
      })
      .filter(Boolean);
    const unusedIcons = iconFiles.filter((id) => !new RegExp(`/icons/${id}\\.svg`, 'i').test(app));
    const navSectionKey = keys.find((p) => /^src\/sections\/NavHeaderSection\.jsx$/i.test(p));
    const logoInNavSection = navSectionKey
      ? /\/logo\.svg/i.test(String(next[navSectionKey] || ''))
      : false;
    // Compositional + NavHeader: wire there. Compositional without a nav file yet: still
    // inject into App so /logo.svg is never orphaned (smoke + thin pre-section trees).
    const needsLogoWire = hasLogo && !/\/logo\.svg/i.test(app) && !logoInNavSection
      && (!compositionalShell || !navSectionKey);
    const needsIconWire = !compositionalShell && unusedIcons.length > 0;
    if (compositionalShell && hasLogo && navSectionKey && !logoInNavSection) {
      // Prefer wiring /logo.svg into the nav section file, not App.jsx.
      // Rail / minimal / centered shells: put logo beside brand — never as first child of <nav> links.
      let nav = String(next[navSectionKey] || '');
      const brandAlt = String(productName || 'Brand').replace(/[<>&'"`]/g, '').slice(0, 48);
      const logoTag = `<img className="nav-logo" src="/logo.svg" alt="${brandAlt}" width="36" height="36" />`;
      if (/nav-rail|nav-minimal|nav-centered|nav-under|nav-dock|data-nova-shell/i.test(nav)) {
        if (/nav-brand/i.test(nav) && !/nav-logo/i.test(nav)) {
          nav = nav.replace(
            /(<span[^>]*className=["'][^"']*\bnav-brand\b[^"']*["'][^>]*>)/i,
            `${logoTag}\n      $1`,
          );
          next[navSectionKey] = nav;
          if (!changed.includes(navSectionKey)) changed.push(navSectionKey);
        }
      } else if (/<nav\b/i.test(nav) || /nav-brand|nav-header|role=["']banner["']/i.test(nav)) {
        if (/<nav\b/i.test(nav)) {
          nav = nav.replace(
            /(<nav\b[^>]*>)/i,
            `$1\n      ${logoTag}`,
          );
        } else if (/nav-brand/i.test(nav)) {
          nav = nav.replace(
            /(className=["'][^"']*\bnav-brand\b[^"']*["'][^>]*>)/i,
            `$1\n        ${logoTag}`,
          );
        }
        next[navSectionKey] = nav;
        if (!changed.includes(navSectionKey)) changed.push(navSectionKey);
      }
    }
    const landingHeroShellEarly = /className=["'][^"']*\bapp\s+(?:vibe|product)\b/i.test(app)
      || (/aria-label=["']Hero["']/i.test(app) && /className=["'][^"']*\bbrand\b/i.test(app));
    // Copper Loom: never stamp sticky-nav onto Bare Vite / root-app before invent
    // writes real sections — nav-only Acc looked "started" and Live opened empty.
    const bareViteMount = (/Bare Vite mount|id=["']root-app["']/i.test(app)
      || (app.replace(/\s+/g, '').length < 500 && !/<(?:section|main|h1)\b/i.test(app)))
      && !/from\s+['"]\.\/sections\//i.test(app)
      && !/<(?:Hero|HeroSection|Catalog|ProductGrid|Story)\b/i.test(app);
    if ((needsLogoWire || needsIconWire) && !landingHeroShellEarly && !bareViteMount) {
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
        // Inject /logo.svg into any sticky-nav — do not require nav-left / brand-wordmark class names.
        if (needsLogoWire) {
          if (/className=["'][^"']*\bnav-left\b[^"']*["'][^>]*>/i.test(app)) {
            app = app.replace(/(className=["'][^"']*\bnav-left\b[^"']*["'][^>]*>)/i, `$1${logo}`);
          } else if (/className=["'][^"']*\bbrand-wordmark\b[^"']*["'][^>]*>/i.test(app)) {
            app = app.replace(
              /(<[^>]*className=["'][^"']*\bbrand-wordmark\b[^"']*["'][^>]*>)/i,
              `${logo}$1`,
            );
          } else {
            app = app.replace(
              /(className=["'][^"']*\bsticky-nav\b[^"']*["'][^>]*>)/i,
              `$1${logo}`,
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

    // Final brand law: hasLogo ⇒ UI must reference /logo.svg.
    // Compositional: already wired into NavHeaderSection above — do not inject into App shell.
    // Vibe / product landing shells keep brand in the hero — never prepend sticky-nav chrome.
    const landingHeroShell = /className=["'][^"']*\bapp\s+(?:vibe|product)\b/i.test(app)
      || (/aria-label=["']Hero["']/i.test(app) && /className=["'][^"']*\bbrand\b/i.test(app));
    if (!compositionalShell && !landingHeroShell && !bareViteMount && hasLogo && !/\/logo\.svg/i.test(app)) {
      const logo = `<img className="nav-logo" src="/logo.svg" alt="${brand}" width="36" height="36" />`;
      if (/className=["'][^"']*\bsticky-nav\b[^"']*["']/i.test(app)) {
        app = app.replace(
          /(className=["'][^"']*\bsticky-nav\b[^"']*["'][^>]*>)/i,
          `$1${logo}`,
        );
      } else if (/className=["'][^"']*\bapp\b[^"']*["'][^>]*>/i.test(app)) {
        app = app.replace(
          /(className=["'][^"']*\bapp\b[^"']*["'][^>]*>)/i,
          `$1\n      <header className="sticky-nav" role="banner"><div className="nav-left">${logo}</div></header>`,
        );
      } else {
        app = `${logo}\n${app}`;
      }
    } else if (landingHeroShell && hasLogo && !/\/logo\.svg/i.test(app)) {
      // Quiet logo in hero — no sticky-nav strip.
      const logo = `<img className="nav-logo" src="/logo.svg" alt="${brand}" width="40" height="40" />`;
      if (/aria-label=["']Hero["'][^>]*>/i.test(app)) {
        app = app.replace(/(aria-label=["']Hero["'][^>]*>)/i, `$1\n        ${logo}`);
      }
    }

    // Bare /hero.jpg, /logo.svg, /icons/*.svg, or missing /heroes/*.jpg → offline-safe fallbacks.
    const hasPublicLogo = hasLogo;
    const publicHeroSet = new Set(
      keys.filter((p) => /public\/heroes\/.+\.(?:jpe?g|png|webp|svg)$/i.test(p))
        .map((p) => '/' + p.replace(/^public\//i, '').toLowerCase()),
    );
    const svgHero = productHeroDataUrl(String(brief || ''), brand);
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

  // Never inject cream/sage/gold apple-home atmosphere as a Ready heal —
  // unless THIS brief explicitly wants parchment/cream paper grounds.
  // Layout Contract / Design hop owns palette; thin CSS stays honest for the gate.
  if (cssKey) {
    const css = healUnbalancedCssBraces(String(next[cssKey] || ''));
    const keepLightPaper = briefWantsLightPaperGround(briefText);
    // Strip legacy atmospheric injects left from older builds.
    let cleaned = css
      .replace(/\/\*\s*Prefer cream atmosphere[\s\S]*?(?=\n\/\*|\n\.|\n@media|$)/gi, '')
      .replace(/\/\*\s*NOVA create polish — brief companion[\s\S]*?(?=\/\* NOVA|\n\/\*|@media \(max-width: 640px\)[\s\S]*?\}\s*$)/gi, '')
      .replace(/@keyframes\s+novaAtmosSweep\s*\{[\s\S]*?\}\s*/gi, '')
      .replace(/@keyframes\s+novaCompanionSweep\s*\{[\s\S]*?\}\s*/gi, '')
      .replace(/@keyframes\s+novaGoldSheen\s*\{[\s\S]*?\}\s*/gi, '')
      .replace(/body\s*\{\s*background-color:\s*#f3eee4\s*!important;[\s\S]*?color:\s*#14181c;\s*\}\s*/gi, '')
      .replace(/body::before\s*\{[\s\S]*?z-index:\s*0;\s*\}\s*/gi, '');
    // Only force cream→dark when the brief is NOT a parchment/atelier ask.
    if (!keepLightPaper) {
      cleaned = cleaned
        .replace(/--bg:\s*#f3eee4\s*;/gi, '--bg: #0f1419;')
        .replace(/--panel:\s*#faf7f0\s*;/gi, '--panel: #1a222c;');
    } else {
      cleaned = healAtelierPaletteCss(cleaned, briefText);
    }
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
/* Centered card hero for simple pages — never fight compositional full-bleed. */
.hero:not(.hero-section):not(.hero-fullbleed) { min-height: 48vh; display: grid; place-items: center; text-align: center; padding: 3.5rem 1.25rem 2.5rem; }
.hero:not(.hero-section):not(.hero-fullbleed) img,
.hero:not(.hero-section):not(.hero-fullbleed) .hero-photo { max-width: min(920px, 92vw); width: 100%; border-radius: ${shopish ? '16px' : '20px'}; border: 1px solid var(--line); object-fit: cover; }
.hero-section.hero-fullbleed { position: relative; min-height: 88vh; display: grid; align-items: end; padding: 0; overflow: hidden; }
.hero-section.hero-fullbleed .hero-stage { position: absolute; inset: 0; z-index: 0; opacity: 0.45; pointer-events: none; }
.hero-section.hero-fullbleed .hero-art { width: 100%; height: 100%; object-fit: cover; border: 0; border-radius: 0; max-width: none; }
.hero-section.hero-fullbleed .hero-veil { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.hero-section.hero-fullbleed .hero-copy { position: relative; z-index: 2; padding: 5.5rem 8vw 4.25rem; max-width: 40rem; text-align: left; }
.hero-title, .hero h1 { margin: 0 0 0.75rem; font-size: clamp(2.2rem, 5vw, 3.6rem); letter-spacing: -0.04em; line-height: 1.05; }
.product-swatch { width: 100%; aspect-ratio: 4/3; border-radius: 12px; background:
  linear-gradient(145deg, color-mix(in srgb, var(--accent) 35%, #c4a574), color-mix(in srgb, var(--panel) 40%, #8b6914));
  border: 1px solid var(--line); }
/* Scope to bare product grids — never fight section.catalog-section layouts (Ivory Latch). */
.product-grid:not(.catalog-section), .product-cards {
  display: grid; gap: 1.1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  max-width: 1100px; margin: 0 auto 3rem; padding: 0 1.25rem; width: 100%;
}
section.catalog-section { display: block; max-width: none; width: 100%; }
header.nav-header.sticky-nav {
  display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between;
  max-width: none; width: 100%; margin: 0; padding: 0.9rem 8vw;
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
  .hero:not(.hero-section):not(.hero-fullbleed) { min-height: 36vh; padding-top: 2.5rem; }
  .hero-section.hero-fullbleed { min-height: 72vh; }
}
`;
}

/** Liquor / cart storefront floor — rich catalog + filters + cart (see createStorefrontFloor). */
function buildCommerceCartFloor(
  title: string,
  brief: string,
  p: CreatePalette,
): { app: string; css: string; files?: Record<string, string> } {
  const floor = buildStorefrontCommerceFloor(title, brief, p);
  return { app: floor.app, css: floor.css, files: floor.files };
}

/** Marketing / shop landing floor — uses on-disk heroes; never booking stubs. */
function buildMarketingShopFloor(
  title: string,
  brief: string,
  p: CreatePalette,
  kind: 'reef' | 'shop' | 'food',
): { app: string; css: string } {
  const reef = kind === 'reef';
  const food = kind === 'food';
  const bands = reef
    ? [
        { id: 'livestock', title: 'Livestock', body: 'Corals and reef fish, healthy and ready for home tanks.' },
        { id: 'kits', title: 'Care kits', body: 'Salt, test kits, and lighting matched to your reef.' },
        { id: 'visit', title: 'Visit', body: 'Tue–Sat 10–6 · Ask about acclimation and water parameters.' },
      ]
    : food
      ? (
        /\b(?:dates?|medjool|deglet)\b/i.test(brief)
          ? [
              { id: 'varieties', title: 'Varieties', body: 'Medjool, Deglet Noor, and harvest picks with real tasting notes.' },
              { id: 'story', title: 'Story', body: 'Sun-ripened fruit, packed for people who care how dates taste.' },
              { id: 'pair', title: 'Pairing', body: 'Cheese boards, tea, and everyday snacks — simple ways to serve.' },
            ]
          : [
              { id: 'varieties', title: 'Shop', body: `Signature selections from ${title}.` },
              { id: 'story', title: 'Story', body: 'Sourced with care for people who taste the difference.' },
              { id: 'pair', title: 'Enjoy', body: 'Simple ways to serve, gift, and share.' },
            ]
      )
      : [
          { id: 'featured', title: 'Featured', body: `Signature pieces from ${title}.` },
          { id: 'story', title: 'Our story', body: 'Crafted with care for people who notice the details.' },
          { id: 'visit', title: 'Visit', body: 'Open daily · Come see what’s new.' },
        ];
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand';
  // Prefer .jpg — brandAssets materializes jpg; webp stubs 404 when only jpg lands.
  const hero = `/heroes/${slug}-hero.jpg`;
  const story = `/heroes/${slug}-story.jpg`;
  const datesBrief = /\b(?:dates?|medjool|deglet)\b/i.test(brief);
  const eyebrow = reef ? 'Saltwater / Reef' : food ? (datesBrief ? 'Specialty fruit' : 'Specialty food') : 'Welcome';
  const headline = reef ? 'Reef life, carefully curated.' : `${title}.`;
  const sub = reef
    ? 'Corals, fish, and care kits for calm, living aquariums.'
    : food
      ? (datesBrief
        ? 'Sun-ripened Medjool and Deglet Noor dates — shop varieties, read the harvest story, and taste the difference.'
        : (String(brief || '').replace(/\s+/g, ' ').trim().slice(0, 140) || `Premium ${title} — shop, story, and taste.`))
      : (String(brief || '').slice(0, 120) || 'A premium shop experience.');
  const ctaPrimary = reef ? 'Browse livestock' : food ? 'Shop varieties' : 'Explore';
  const ctaGhost = food ? 'Our story' : 'Visit';
  const app = `import './App.css';

export default function App() {
  return (
    <div className="site">
      <header className="topnav" role="banner">
        <nav className="topnav-inner" aria-label="Primary">
          <a className="mark" href="#top">${title}</a>
          ${bands.map((b) => `<a href="#${b.id}">${b.title}</a>`).join('\n          ')}
          <a href="#${food ? 'varieties' : 'visit'}">${food ? 'Shop' : 'Hours'}</a>
        </nav>
      </header>
      <section className="hero full-bleed" id="top">
        <div className="hero-copy">
          <p className="eyebrow">${eyebrow}</p>
          <h1>${headline}</h1>
          <p className="sub">${sub}</p>
          <div className="cta-row">
            <a className="pill pill-primary" href="#${bands[0].id}">${ctaPrimary}</a>
            <a className="pill pill-ghost" href="#${food ? 'story' : 'visit'}">${ctaGhost}</a>
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
  const css = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;700&family=Source+Sans+3:wght@400;600&display=swap');
:root {
  --bg: ${reef ? '#04151c' : p.bg};
  --ink: ${reef ? '#e8f6f8' : p.text};
  --mute: ${reef ? '#8eb8c0' : p.muted};
  --accent: ${reef ? '#2ec4b6' : p.accent};
  --panel: ${reef ? '#0a2430' : p.panel};
  --display: Fraunces, Georgia, serif;
  --body: "Source Sans 3", system-ui, sans-serif;
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); }
body { font-family: var(--body); }
h1, h2, .mark { font-family: var(--display); }
.site { width: 100%; }
@keyframes contractReveal { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.hero, .band { animation: contractReveal 0.7s ease both; }
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
export function buildBriefInteractiveFloor(_productName: string, _brief = ''): { app: string; css: string; files?: Record<string, string> } {
  // REMOVED — no look-back commerce/marketing floor twin.
  return { app: '', css: '', files: {} };
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
    const rel = m[1].replace(/^\.\//, 'src/');
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
  opts?: { brief?: string; artifactKind?: string },
): { files: Record<string, string>; healed: string[] } {
  const missing = createPolishMissingLocalImports(files);
  if (!missing.length) return { files, healed: [] };
  const missingUi = missing.some((s) =>
    /components\//i.test(s)
    || /\/(?:Navbar|Nav|Header|Hero|Footer|FeatureBand|Feature|Banner)\b/i.test(s),
  );
  const brief = String(opts?.brief || '');
  const kind = opts?.artifactKind || (brief ? resolveArtifactKind(brief) : '');
  const allowAssemble = kind === 'product-site'
    || kind === 'static-web'
    || (!kind && isProductSiteAsk(brief));
  if (missingUi) {
    // Never flatten dashboards/games/CLI into a marketing assemble shell.
    if (allowAssemble) {
      const assembled = assembleCreateAppFromParts(files, productName, {
        brief,
        artifactKind: kind || undefined,
      });
      if (assembled.changed.length && !createPolishMissingLocalImports(assembled.files).length) {
        return { files: assembled.files, healed: missing };
      }
    } else {
      // Stub missing local components so App structure survives (dashboard/game/Electron).
      const nextStub = { ...files };
      const healedStub: string[] = [];
      for (const spec of missing) {
        const rel = String(spec || '').replace(/^\.\//, '').replace(/\\/g, '/');
        if (!rel || /node_modules/.test(rel)) continue;
        const path = rel.endsWith('.jsx') || rel.endsWith('.tsx') || rel.endsWith('.js') || rel.endsWith('.ts')
          ? (rel.startsWith('src/') ? rel : `src/${rel}`)
          : (rel.startsWith('src/') ? `${rel}.jsx` : `src/${rel}.jsx`);
        if (nextStub[path]) continue;
        const base = path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Comp';
        const comp = base.replace(/(^\w|-\w)/g, (m) => m.replace('-', '').toUpperCase());
        nextStub[path] = `export default function ${comp}() {\n  return <div className="${base.toLowerCase()}" />;\n}\n`;
        healedStub.push(spec);
      }
      if (healedStub.length) return { files: nextStub, healed: healedStub };
    }
  }
  // Non-product Acc: do not strip App imports into an empty <main/> — leave for model repair.
  if (!allowAssemble && missingUi) {
    return { files, healed: [] };
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
