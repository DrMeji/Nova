/**
 * Cheap pre-Live syntax gate for created App sources.
 * Catches Vite red-screen classes (unclosed tags, TS-in-JSX, brace blowouts,
 * CSS dumped into JSX, unbound state) before npm/Live so users never see the
 * "Live Preview could not render" card.
 */

import { isBrokenReactAppSource, jsxSourceHasTypeScriptOnlySyntax, looksLikeTruncatedUiSource } from '@/lib/freshSpaFromBrief';
import { healBrokenJsxOpenTags } from '@/lib/createBuildQuality';

export type SyntaxGateResult = {
  ok: boolean;
  reasons: string[];
  files: Record<string, string>;
  healed: boolean;
};

/** Vite crash: siblings after the return root closed (`</div>` then `<section>`…). */
export function hasAdjacentJsxOutsideRoot(app: string): boolean {
  const body = String(app || '').match(/return\s*\(([\s\S]*?)\)\s*;/);
  if (!body) return false;
  return /<\/div>\s*\n\s*<(?:section|footer|main|header|aside|nav|div)\b/.test(body[1]);
}

/** Pull orphan siblings back inside the return root before its closing </div>. */
export function healAdjacentJsxOutsideRoot(app: string): string {
  const src = String(app || '');
  if (!hasAdjacentJsxOutsideRoot(src)) return src;
  return src.replace(
    /(return\s*\(\s*)([\s\S]*?)(<\/div>)(\s*)((?:<(?:section|footer|main|header|aside|nav)\b[\s\S]*?))(\s*\))/m,
    (_m, ret, before, close, _ws, orphans, end) => {
      if (!String(orphans || '').trim() || /export\s+default/.test(orphans)) {
        return `${ret}${before}${close}${orphans}${end}`;
      }
      return `${ret}${before}${orphans}\n    ${close}${end}`;
    },
  );
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
  if (!/(?:\/\*|\:root\s*\{|html\s*,\s*body)/.test(tail)) {
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
  return /<\/main>\s*(?:<\/div>\s*)+(?:\)\s*:\s*null\s*\})?/i.test(s)
    || /<\/main>\s*\)\s*:\s*null\s*\}/i.test(s)
    || /<\/(?:main|div)>\s*(?:<\/div>\s*){2,}\s*(?:\)\s*:\s*null)?/i.test(s);
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

/** Heuristic JSX/TSX sanity — not a full parser; enough to block known Live crashers. */
export function runCreateSyntaxGate(
  files: Record<string, string>,
): SyntaxGateResult {
  const next = { ...files };
  const reasons: string[] = [];
  let healed = false;

  const appKey = next['src/App.jsx']
    ? 'src/App.jsx'
    : (next['src/App.tsx'] ? 'src/App.tsx' : '');
  if (!appKey) {
    return { ok: false, reasons: ['No src/App.jsx or src/App.tsx'], files: next, healed: false };
  }

  let app = String(next[appKey] || '');
  const beforeHeal = app;

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
  if (app !== beforeHeal) {
    next[appKey] = app;
    healed = true;
  } else if (healed) {
    next[appKey] = app;
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
  if (hasCssDumpedInAppJsx(app)) {
    reasons.push('CSS dumped into App.jsx (will not compile)');
  }
  if (hasOrphanJsxAfterRootClose(app)) {
    reasons.push('Orphan JSX after root close (will not compile)');
  }
  for (const r of unboundStateReasons(app)) reasons.push(r);
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

  const css = String(next['src/App.css'] || '');
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
