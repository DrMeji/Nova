/**
 * Cheap pre-Live syntax gate for created App sources.
 * Catches Vite red-screen classes (unclosed tags, TS-in-JSX, brace blowouts,
 * CSS dumped into JSX, unbound state) before npm/Live so users never see the
 * "Live Preview could not render" card.
 */

import {
  isBrokenReactAppSource,
  jsxSourceHasTypeScriptOnlySyntax,
  looksLikeTruncatedUiSource,
  healNearCompleteTruncatedSource,
  countJsxTagBalance,
} from '@/lib/freshSpaFromBrief';
import { ensureJsxHasNoTypeScript, healBrokenJsxOpenTags } from '@/lib/createBuildQuality';
import {
  healMissingSectionDataImports,
  healSectionRelativeImports,
  rewriteAppImportsForPageBody,
  unresolvedRelativeImportReasons,
} from '@/lib/createThinPath';

export type SyntaxGateResult = {
  ok: boolean;
  reasons: string[];
  files: Record<string, string>;
  healed: boolean;
};

/** End index (exclusive) of the outermost <div>…</div> inside a return ( … ). */
function findOuterDivEnd(inner: string): number {
  const open = String(inner || '').search(/<div\b/i);
  if (open < 0) return -1;
  const openTag = inner.slice(open).match(/^<div\b[^>]*>/i)?.[0] || '';
  let i = open + openTag.length;
  let depth = 1;
  while (i < inner.length && depth > 0) {
    const rest = inner.slice(i);
    const o = rest.search(/<div\b/i);
    const c = rest.search(/<\/div>/i);
    if (c < 0) return -1;
    if (o >= 0 && o < c) {
      depth += 1;
      i += o + 4;
      continue;
    }
    depth -= 1;
    i += c + 6;
  }
  return depth === 0 ? i : -1;
}

/**
 * Vite crash: landmarks after the return root already closed.
 * Must NOT flag brand-lockup/nav `</div>` followed by a sibling `<section>` inside `.app`.
 */
export function hasAdjacentJsxOutsideRoot(app: string): boolean {
  const body = String(app || '').match(/return\s*\(([\s\S]*?)\)\s*;/);
  if (!body) return false;
  const rootEnd = findOuterDivEnd(body[1]);
  if (rootEnd < 0) return false;
  const after = body[1].slice(rootEnd);
  // Nested logo `</div>` then `<nav>` inside a header is normal — never treat nav
  // as an orphan sibling (that re-broke SoftPalm after mangled-JSX heal).
  return /<(?:section|footer|main|aside)\b/i.test(after);
}

/** Pull orphan siblings back inside the return root before its closing </div>. */
export function healAdjacentJsxOutsideRoot(app: string): string {
  const src = String(app || '');
  if (!hasAdjacentJsxOutsideRoot(src)) return src;
  return src.replace(
    /(return\s*\()([\s\S]*?)(\)\s*;)/,
    (_m, ret: string, inner: string, end: string) => {
      const rootEnd = findOuterDivEnd(inner);
      if (rootEnd < 0) return `${ret}${inner}${end}`;
      const root = inner.slice(0, rootEnd);
      const orphans = inner.slice(rootEnd).trim();
      if (!orphans || /export\s+default/.test(orphans)) {
        return `${ret}${inner}${end}`;
      }
      const closeIdx = root.lastIndexOf('</div>');
      if (closeIdx < 0) return `${ret}${inner}${end}`;
      const healed = `${root.slice(0, closeIdx)}${orphans}\n    ${root.slice(closeIdx)}`;
      return `${ret}${healed}${end}`;
    },
  );
}

/**
 * Depth-continue smash: logo/nav/button fused into invalid JSX
 * (`<nav>\n</div>) => setX(!x)}>Label</button>`). Vite fails → black Live.
 */
export function hasMangledJsxControlFlow(app: string): boolean {
  const s = String(app || '');
  if (/<\/div>\)\s*=>/.test(s)) return true;
  if (/<nav>\s*<\/div>\)\s*=>/.test(s)) return true;
  // Lone fused arrow-button — NOT valid onClick={() => setX(...)}>
  if (/(?:^|\n)\s*\)\s*=>\s*set[A-Z]\w*\s*\([^)]*\)\s*\}>[^<]*<\/button>/m.test(s)) return true;
  // Closing button with no opening <button in the nearby nav.
  if (/<nav>[\s\S]{0,180}<\/button>/.test(s) && !/<nav>[\s\S]{0,180}<button\b/.test(s)) return true;
  return false;
}

/** Repair logo/nav button smash from thin depth continues. */
export function healMangledJsxControlFlow(app: string): string {
  let s = String(app || '');
  if (!hasMangledJsxControlFlow(s)) return s;
  // SoftPalm smash: logo <img> then <nav> then `</div>) => setX(!x)}>Label</button>`
  // Do NOT use [^)]+ for the handler — nested (!showX) breaks the match.
  s = s.replace(
    /(<div\b[^>]*className=["'][^"']*\blogo\b[^"']*["'][^>]*>\s*<img\b[^>]*\/?>)\s*<nav>\s*<\/div>\)\s*=>\s*([\s\S]*?)\}>([^<\n]*)<\/button>\s*<\/nav>/gi,
    (_m, logoOpen: string, expr: string, label: string) => (
      `${logoOpen}\n        </div>\n        <nav>\n          <button type="button" onClick={() => ${String(expr).trim()}}>${String(label).trim()}</button>\n        </nav>`
    ),
  );
  // Generic: <nav> </div>) => expr}>Label</button> </nav>
  s = s.replace(
    /<nav>\s*<\/div>\)\s*=>\s*([\s\S]*?)\}>([^<\n]*)<\/button>\s*<\/nav>/gi,
    (_m, expr: string, label: string) => (
      `</div>\n        <nav>\n          <button type="button" onClick={() => ${String(expr).trim()}}>${String(label).trim()}</button>\n        </nav>`
    ),
  );
  // Any indented `</div>) => …}>Label</button>` line (depth-continue fuse).
  s = s.replace(
    /^([ \t]*)<\/div>\)\s*=>\s*([\s\S]*?)\}>([^<\n]*)<\/button>/gm,
    (_m, indent: string, expr: string, label: string) => (
      `${indent}<button type="button" onClick={() => ${String(expr).trim()}}>${String(label).trim()}</button>`
    ),
  );
  // Lone `) => setX(!x)}>Label</button>` after a cut open tag.
  s = s.replace(
    /^\s*\)\s*=>\s*(set[A-Z]\w*\s*\([^)]*\))\}>([^<\n]*)<\/button>/gm,
    (_m, expr: string, label: string) => (
      `<button type="button" onClick={() => ${String(expr).trim()}}>${String(label).trim()}</button>`
    ),
  );
  // Logo still open before <nav> (img never closed the div).
  s = s.replace(
    /(<div\b[^>]*className=["'][^"']*\blogo\b[^"']*["'][^>]*>\s*<img\b[^>]*\/?>)\s*\n(\s*)<nav>/gi,
    '$1\n        </div>\n$2<nav>',
  );
  return s;
}

/** CSS leaked into App.jsx after the component (Vite Transform failed). */
export function hasCssDumpedInAppJsx(app: string): boolean {
  const s = String(app || '');
  if (!/export\s+default\s+function|function\s+App\s*\(/.test(s)) return false;
  // After the component's closing `}`, raw CSS selectors / :root blocks.
  return /\n\}\s*\n[\s\S]{0,80}(?:\/\*\s*NOVA|\s*:root\s*\{|\s*html\s*,\s*body)/.test(s)
    || (/\n\}\s*\n[\s\S]*\b:root\s*\{/.test(s) && /font-family\s*:/.test(s));
}

/** Split leaked CSS out of App.jsx into App.css extract. */
export function healCssDumpedFromAppJsx(app: string): { app: string; cssExtract: string } {
  const s = String(app || '');
  if (!hasCssDumpedInAppJsx(s)) return { app: s, cssExtract: '' };
  const m = s.match(/^([\s\S]*?\n\}\s*)\n([\s\S]*)$/);
  if (!m) return { app: s, cssExtract: '' };
  const head = m[1];
  const tail = m[2];
  if (!/(?:\/\*|:root\s*\{|html\s*,\s*body)/.test(tail)) {
    return { app: s, cssExtract: '' };
  }
  // Keep only JS/JSX in head; ensure it still ends with component close.
  return { app: `${head.trimEnd()}\n`, cssExtract: tail.trim() + '\n' };
}

/**
 * Orphan closings / ternary junk after `</main>` (Tipjar failure mode):
 *   </main></div></div>) : null}<footer/>
 */
export function hasOrphanJsxAfterRootClose(app: string): boolean {
  const s = String(app || '');
  // Tipjar-style junk only: ternary/null glued after root closes — not a normal
  // nested shell (`</main></div></div>`), which is valid layout markup.
  return /<\/main>\s*(?:<\/div>\s*){2,}\s*\)\s*:\s*null\s*\}/i.test(s)
    || /<\/main>\s*\)\s*:\s*null\s*\}/i.test(s)
    || /<\/(?:main|div)>\s*(?:<\/div>\s*){2,}\s*\)\s*:\s*null/i.test(s);
}

/** Cut orphan closings after the real root (`</main>` / primary `</div>`) before `);`. */
export function healOrphanJsxAfterRootClose(app: string): string {
  let s = String(app || '');
  if (!hasOrphanJsxAfterRootClose(s)) return s;
  // Prefer main root: keep </main>, drop junk until return close.
  s = s.replace(
    /<\/main>\s*(?:<\/div>\s*)*(?:\)\s*:\s*null\s*\})?\s*(?:<footer\b[\s\S]*?<\/footer>\s*)?(?=\n\s*\);)/i,
    '</main>\n',
  );
  // Footer that fell outside the return after junk — drop if still orphaned.
  s = s.replace(
    /<\/main>\s*\n\s*<footer\b[\s\S]*?<\/footer>\s*(?=\n\s*\);)/i,
    '</main>\n',
  );
  return s;
}

/**
 * Free-model invent often emits `cards.map` / `books.map` after deleting the
 * array — Live ReferenceError blank. Catch before Ready (Live invent 2026-10-23).
 */
export function undeclaredCollectionReasons(app: string): string[] {
  const s = String(app || '');
  const reasons: string[] = [];
  for (const name of ['cards', 'books', 'items', 'products', 'posts', 'entries', 'rows', 'slides', 'features'] as const) {
    const used = new RegExp(`\\b${name}\\.(?:map|filter|length|forEach|find|slice)\\b`, 'i').test(s)
      || new RegExp(`\\{${name}\\.`).test(s);
    if (!used) continue;
    const declared = new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`).test(s)
      || new RegExp(`\\b(?:const|let)\\s*\\[\\s*${name}\\s*,`).test(s)
      || new RegExp(`\\bfunction\\s+${name}\\b`).test(s)
      || new RegExp(`\\bimport\\s+[\\s\\S]{0,120}\\b${name}\\b[\\s\\S]{0,40}from\\s+['\"]`).test(s);
    if (!declared) reasons.push(`${name} used without declaration (would ReferenceError / blank Live)`);
  }
  return reasons;
}

/** setX / value={x} without matching useState — ReferenceError at runtime / sometimes compile. */
export function unboundStateReasons(app: string): string[] {
  const s = String(app || '');
  const reasons: string[] = [];
  if (/\bsetCart\b/.test(s) && !/\b(?:const|let)\s*\[\s*cart\s*,\s*setCart\s*\]/.test(s)) {
    reasons.push('cart/setCart used without useState');
  }
  if (/\bsetBill\b/.test(s) && !/\b(?:const|let)\s*\[\s*bill\s*,\s*setBill\s*\]/.test(s)) {
    reasons.push('bill/setBill used without useState');
  }
  if (/\bsetPct\b/.test(s) && !/\b(?:const|let)\s*\[\s*pct\s*,\s*setPct\s*\]/.test(s)) {
    reasons.push('pct/setPct used without useState');
  }
  // tip/total used as values but never declared (Tipjar: tip.toFixed without const tip).
  if (/\btip\.toFixed\b|\b\{['"]?\$['"]?\}?\{tip\b|\bTip:\s*<[^>]*>\{?\$?\{?tip\b/i.test(s)
    && !/\b(?:const|let)\s+tip\b/.test(s)
    && !/\b(?:const|let)\s*\[\s*tip\s*,/.test(s)) {
    reasons.push('tip used without declaration');
  }
  if (/\btotal\.toFixed\b|\bTotal:\s*<[^>]*>\{?\$?\{?total\b/i.test(s)
    && !/\b(?:const|let)\s+total\b/.test(s)
    && !/\b(?:const|let)\s*\[\s*total\s*,/.test(s)) {
    reasons.push('total used without declaration');
  }
  if (/\bcart\b/.test(s) && /\bsetCart\b/.test(s) && !/\bfrom\s+['"]react['"]/.test(s) && !/\bimport\s+React\b/.test(s)) {
    reasons.push('cart state without React import');
  }
  return reasons;
}

/** Inject tip-calculator state when bill/pct are wired in JSX but missing. */
export function healUnboundTipCalculatorState(app: string): string {
  let s = String(app || '');
  const needsBill = /\bsetBill\b/.test(s) && !/\b(?:const|let)\s*\[\s*bill\s*,\s*setBill\s*\]/.test(s);
  const needsTip = (/\btip\.toFixed\b/.test(s) || /\b\{tip\b/.test(s))
    && !/\b(?:const|let)\s+tip\b/.test(s);
  if (!needsBill && !needsTip) return s;
  if (!/\bfrom\s+['"]react['"]/.test(s)) {
    s = `import { useMemo, useState } from 'react';\n${s}`;
  } else if (!/\buseState\b/.test(s)) {
    s = s.replace(
      /import\s*\{([^}]*)\}\s*from\s*['"]react['"]/,
      (_m, inner) => {
        const parts = String(inner).split(',').map((p) => p.trim()).filter(Boolean);
        if (!parts.includes('useState')) parts.push('useState');
        if (!parts.includes('useMemo') && needsTip) parts.push('useMemo');
        return `import { ${parts.join(', ')} } from 'react'`;
      },
    );
  }
  const inject = [
    '  const [bill, setBill] = useState(\'0\');',
    '  const [pct, setPct] = useState(\'15\');',
    '  const tip = Number(bill || 0) * Number(pct || 0) / 100;',
    '  const total = Number(bill || 0) + tip;',
    '',
  ].join('\n');
  if (/export\s+default\s+function\s+\w+\s*\(\)\s*\{/.test(s)) {
    s = s.replace(
      /(export\s+default\s+function\s+\w+\s*\(\)\s*\{)\s*/,
      `$1\n${inject}`,
    );
  } else if (/function\s+App\s*\(\)\s*\{/.test(s)) {
    s = s.replace(/(function\s+App\s*\(\)\s*\{)\s*/, `$1\n${inject}`);
  }
  return s;
}

/**
 * Agent-loop mid-write dumps (`TOOL: write` / `PATH:` / `TOOL: ready`) into App/CSS
 * must never ship — Vite treats them as syntax errors → SPA HTML fallback.
 */
export function stripAgentToolResidueFromSource(source: string): string {
  let s = String(source || '');
  if (!s) return s;
  // Cut from first agent tool trailer (TOOL: write / ready / …).
  const cut = s.search(/\n\s*TOOL:\s*(?:write|ready|done|read|patch|list)\b/i);
  if (cut >= 0) s = s.slice(0, cut);
  s = s.replace(/\n\s*PATH:\s*src\/[\w./-]+\s*\n?\s*\}?\s*$/i, '');
  return `${s.trimEnd()}\n`;
}

/** Heuristic JSX/TSX sanity — not a full parser; enough to block known Live crashers. */
export function runCreateSyntaxGate(
  files: Record<string, string>,
): SyntaxGateResult {
  const next = { ...files };
  const reasons: string[] = [];
  let healed = false;

  // Strip TOOL:/PATH: residue from every text source before App-specific heals.
  for (const [rel, body] of Object.entries(next)) {
    if (typeof body !== 'string') continue;
    if (!/\.(?:jsx?|tsx?|css)$/i.test(rel)) continue;
    if (!/\bTOOL:\s*(?:write|ready|done)\b|\bPATH:\s*src\//i.test(body)) continue;
    const cleaned = stripAgentToolResidueFromSource(body);
    if (cleaned !== body) {
      next[rel] = cleaned;
      healed = true;
    }
  }

  const appKey = next['src/App.jsx']
    ? 'src/App.jsx'
    : (next['src/App.tsx'] ? 'src/App.tsx' : '');
  if (!appKey) {
    return { ok: false, reasons: ['No src/App.jsx or src/App.tsx'], files: next, healed: false };
  }

  let app = String(next[appKey] || '');
  const beforeHeal = app;

  // 0) .jsx with TypeScript — strip generics/annotations so Vite can compile.
  if (appKey.endsWith('.jsx')) {
    const stripped = ensureJsxHasNoTypeScript(app);
    if (stripped !== app) {
      app = stripped;
      healed = true;
    }
  }

  // 1) Strip CSS dumped into JSX → App.css
  if (hasCssDumpedInAppJsx(app)) {
    const split = healCssDumpedFromAppJsx(app);
    if (split.app !== app) {
      app = split.app;
      healed = true;
      if (split.cssExtract) {
        const prevCss = String(next['src/App.css'] || '');
        next['src/App.css'] = prevCss.includes(split.cssExtract.slice(0, 40))
          ? prevCss
          : `${prevCss.trimEnd()}\n${split.cssExtract}`.trimStart();
      }
    }
  }

  // 2) Orphan closings after </main>
  const afterOrphan = healOrphanJsxAfterRootClose(app);
  if (afterOrphan !== app) {
    app = afterOrphan;
    healed = true;
  }

  // 3) Tip-calc unbound state
  const afterTip = healUnboundTipCalculatorState(app);
  if (afterTip !== app) {
    app = afterTip;
    healed = true;
  }

  app = healBrokenJsxOpenTags(app);
  const afterAdjacent = healAdjacentJsxOutsideRoot(app);
  if (afterAdjacent !== app) {
    app = afterAdjacent;
    healed = true;
  }
  // Close near-complete tag/brace cuts before declaring truncated / broken.
  {
    const { open: openN, close: closeN } = countJsxTagBalance(app);
    if (
      looksLikeTruncatedUiSource(app)
      || isBrokenReactAppSource(app)
      || openN > closeN
    ) {
      const near = healNearCompleteTruncatedSource(appKey, app);
      if (near && near !== app) {
        app = near;
        healed = true;
      }
    }
  }
  // Mangle heal LAST — adjacent/trunc heals must not re-fuse nav/button JSX.
  {
    const afterMangle = healMangledJsxControlFlow(app);
    if (afterMangle !== app) {
      app = afterMangle;
      healed = true;
    }
  }
  if (app !== beforeHeal) {
    next[appKey] = app;
    healed = true;
  } else if (healed) {
    next[appKey] = app;
  }

  // Strip TypeScript from section .jsx files (depth invent often emits useState<T>).
  for (const [rel, body] of Object.entries(next)) {
    const norm = rel.replace(/\\/g, '/');
    if (!/^src\/.+\.jsx$/i.test(norm) || norm === appKey) continue;
    if (typeof body !== 'string' || !body.trim()) continue;
    const stripped = ensureJsxHasNoTypeScript(body);
    if (stripped !== body) {
      next[rel] = stripped;
      healed = true;
    }
  }

  if (/\bTOOL:\s*(?:write|ready|done)\b|\bPATH:\s*src\//i.test(app)) {
    reasons.push('App source still contains agent TOOL residue');
  }
  if (looksLikeTruncatedUiSource(app)) {
    reasons.push('App source looks truncated mid-write');
  }
  if (isBrokenReactAppSource(app)) {
    reasons.push('App source is broken or incomplete');
  }
  if (hasAdjacentJsxOutsideRoot(app)) {
    reasons.push('Adjacent JSX outside return root (will not compile)');
  }
  if (hasMangledJsxControlFlow(app)) {
    reasons.push('Mangled JSX nav/button (will blank Live)');
  }
  if (hasCssDumpedInAppJsx(app)) {
    reasons.push('CSS dumped into App.jsx (will not compile)');
  }
  if (hasOrphanJsxAfterRootClose(app)) {
    reasons.push('Orphan JSX after root close (will not compile)');
  }
  // Compositional splice corruption: tag injected inside an attribute expression.
  if (/=\{[^{}]*<[A-Za-z][\w.]*\s*\/?>/.test(app)) {
    reasons.push('JSX element inside an attribute expression (mangled splice)');
  }
  // Orphan markup after a premature component close (sits before export default).
  if (/^\s*\}\s*[<>]/m.test(app)) {
    reasons.push('Orphan JSX after component close (will not compile)');
  }
  for (const r of unboundStateReasons(app)) reasons.push(r);
  for (const r of undeclaredCollectionReasons(app)) reasons.push(r);

  // PageBody + all section files: rewrite App-relative ./context|./sections paths.
  // Also heal App.jsx if ../context leaked from a PageBody rewrite (kids:0 Live).
  {
    const importHealed = healSectionRelativeImports(next);
    for (const k of Object.keys(importHealed)) {
      if (importHealed[k] !== next[k]) {
        next[k] = importHealed[k];
        healed = true;
      }
    }
  }
  const bodyKey = 'src/sections/PageBodySection.jsx';
  if (typeof next[bodyKey] === 'string' && next[bodyKey].trim()) {
    const rewritten = rewriteAppImportsForPageBody(String(next[bodyKey]));
    if (rewritten !== next[bodyKey]) {
      next[bodyKey] = rewritten;
      healed = true;
    }
  }
  {
    const dataHealed = healMissingSectionDataImports(next);
    for (const k of Object.keys(dataHealed)) {
      if (dataHealed[k] !== next[k]) {
        next[k] = dataHealed[k];
        healed = true;
      }
    }
  }
  for (const r of unresolvedRelativeImportReasons(next)) {
    reasons.push(`Unresolved import: ${r}`);
  }
  // After strip heal — only fail if TS still remains.
  if (appKey.endsWith('.jsx') && jsxSourceHasTypeScriptOnlySyntax(app)) {
    reasons.push('src/App.jsx contains TypeScript syntax');
  }
  // Self-closing root then sibling JSX (`return <div … />\n<nav>`) — Vite will not compile.
  if (/return\s*(?:\([\s\n]*)?<[A-Za-z][\w.-]*\b[^>]*\/>\s*\n\s*</.test(app)) {
    reasons.push('Self-closing return root with sibling JSX');
  }
  // Button/tag props then children without closing `>` before `{…}` text.
  if (/<(?:button|a|div|span)\b[^>]*\n\s*\{[^}]+\}\s*\n\s*<\/(?:button|a|div|span)>/i.test(app)
    && !/<(?:button|a|div|span)\b[^>]*>\s*\n\s*\{/i.test(app)) {
    reasons.push('JSX tag missing > before children');
  }

  // Unclosed open-tag before child (classic Vite "Expected > but found <")
  if (/(=(?:\{[^}\n]{0,200}\}|`[^`]*`|"[^"]*"|'[^']*'))\s*\n\s*</.test(app)
    && !/(=(?:\{[^}\n]{0,200}\}|`[^`]*`|"[^"]*"|'[^']*'))>\s*\n\s*</.test(app)) {
    const retry = healBrokenJsxOpenTags(app);
    if (retry !== app) {
      next[appKey] = retry;
      app = retry;
      healed = true;
    } else {
      reasons.push('Likely unclosed JSX tag before nested element');
    }
  }

  const opens = (app.match(/\{/g) || []).length;
  const closes = (app.match(/\}/g) || []).length;
  if (Math.abs(opens - closes) > 6) {
    reasons.push('Severe brace imbalance in App');
  }

  let css = String(next['src/App.css'] || '');
  if (css && looksLikeTruncatedUiSource(css)) {
    const cssHeal = healNearCompleteTruncatedSource('src/App.css', css);
    if (cssHeal && cssHeal !== css) {
      css = cssHeal;
      next['src/App.css'] = css;
      healed = true;
    }
  }
  if (css && looksLikeTruncatedUiSource(css)) {
    reasons.push('App.css looks truncated');
  }

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    files: next,
    healed,
  };
}
