/**
 * Brief helpers + shell detection.
 * Product UI must come from the model — never from canned SPA templates.
 */

export function isEmptyReactAppShell(appSource: string | undefined | null): boolean {
  const s = String(appSource || '');
  if (!s.trim()) return true;
  if (/return\s*\(\s*<div\s+className=["']app["']\s*\/>\s*\)/i.test(s)) return true;
  if (/return\s*\(\s*<div\s+className=["']app["']\s*>\s*<\/div>\s*\)/i.test(s)) return true;
  const withoutImports = s.replace(/^[\s\S]*?export\s+default\s+function\s+App\s*\(/i, '');
  const tags = withoutImports.match(/<[A-Za-z][\w.-]*/g) || [];
  return tags.length <= 1;
}

/** True when create left only an empty static shell (blank Preview). */
export function isBlankProjectScaffold(files: Record<string, string> | null | undefined): boolean {
  const flat = files || {};
  const keys = Object.keys(flat);
  if (!keys.length) return true;
  const app = flat['src/App.jsx'] || flat['src/App.tsx'] || '';
  if (app && !isBrokenReactAppSource(app)) return false;
  const html = flat['index.html'] || '';
  const js = flat['js/app.js'] || flat['app.js'] || '';
  const staticEmpty = /id=["']app["']\s*>\s*<\/div>/i.test(html)
    && (
      !js.trim()
      || /^\s*document\.documentElement\.dataset\.arkReady\s*=\s*['"]1['"]\s*;?\s*$/i.test(js.trim())
      || js.trim().length < 40
    );
  if (staticEmpty && !app) return true;
  if (keys.some((p) => /(?:^|\/)App\.(jsx|tsx)$/i.test(p)) && isBrokenReactAppSource(app)) return true;
  return false;
}

/** Model sometimes writes truncated / invalid App.jsx — treat as unusable for Preview. */
export function isBrokenReactAppSource(appSource: string | undefined | null): boolean {
  if (isEmptyReactAppShell(appSource)) return true;
  const s = String(appSource || '');
  if (/\bcreateRoot\s*\(/.test(s) && /\bimport\s+App\b/.test(s)) return true;
  if (/\bReactDOM\.(?:createRoot|render)\s*\(/.test(s) && /\bimport\s+App\b/.test(s)) return true;
  if (/from\s+['"]\.\/App['"]/.test(s) && /\brender\s*\(/.test(s)) return true;
  // Free-model filler: title + "sample text" / lorem — never a product UI.
  if (/\b(?:this is a sample text|sample text|lorem ipsum|placeholder text|coming soon|hello world)\b/i.test(s)) {
    return true;
  }
  // Endless SVG path / attribute loops (local-model failure mode).
  // Require path-like content — large real games can sit under 100 unique chars.
  if (
    s.length >= 8000
    && new Set(s).size < 80
    && /(?:\bd\s*=\s*["']|viewBox|path\s|\.arcTo\b)/i.test(s)
    && (s.match(/[-\d.]{4,}/g) || []).length > 180
  ) {
    return true;
  }
  if (s.length >= 5000) {
    const start = Math.floor(s.length / 3);
    for (let len = 28; len <= 48; len += 4) {
      const probe = s.slice(start, start + len);
      if (probe.length === len && (s.split(probe).length - 1) >= 40) return true;
    }
  }
  if (/\*\*CSS\b|```(?:jsx|css|tsx)?\s*$/m.test(s) || /This completes the initial implementation/i.test(s)) return true;
  if (/This enhanced version includes/i.test(s) || /\nThis (?:version|component|file) (?:includes|adds|creates)/i.test(s)) return true;
  // useState without importing React hooks — Preview will white-screen.
  if (/\buseState\s*\(/.test(s) && !/\bimport\s+/.test(s) && !/\bfrom\s+['"]react['"]/.test(s)) return true;
  // JSX attribute-as-child bug: onClick={...}\n  Play\n</button>
  if (/onClick=\{[^}]+\}\s*\n\s*[A-Za-z][A-Za-z ]{0,24}\s*\n\s*<\//.test(s)) return true;
  // Unclosed opening tag before nested tag: onClick={...}\n  <img  (not onClick={...}>\n  <img)
  if (/onClick=\{[^}]+\}(?!>)\s*\n\s*</.test(s)) return true;
  // Default export may be App, FPS_Arena, Game, etc. — main.jsx binds it as App either way.
  const hasAppComponent =
    /export\s+default\s+function\s+[A-Za-z_$][\w$]*/i.test(s)
    || /export\s+default\s+(?:async\s*)?(?:function\s*)?\(/i.test(s)
    || /export\s+default\s+[A-Za-z_$][\w$]*\b/i.test(s)
    || /function\s+App\s*\(/i.test(s)
    || /(?:const|let|var)\s+App\s*=\s*(?:async\s*)?(?:\(|function)/i.test(s);
  const tagCount = (s.match(/<[A-Za-z]/g) || []).length;
  const hasRealStructure = /<(?:section|header|footer|nav|main|article|canvas)\b/i.test(s);
  if (s.length < 400) {
    // Allow intentionally tiny exact UIs when App exports real JSX — but not title+filler.
    if (s.length >= 160 && hasAppComponent && tagCount >= 2 && hasRealStructure) {
      /* ok */
    } else if (s.length >= 160 && hasAppComponent && tagCount >= 3 && /<(?:button|a)\b/i.test(s) && /<h1\b/i.test(s)) {
      /* ok — minimal branded hero + CTA */
    } else {
      return true;
    }
  }
  if (!hasAppComponent) return true;
  if (/Ask NOVA in chat to add pages|Local demo from your brief|Main view/i.test(s)) return true;
  // Single search box / empty chrome is not a product UI.
  if (/placeholder=["']Search/i.test(s) && tagCount < 12) return true;
  if (/^\s*\)\s*;?\s*$/m.test(s.slice(0, 120))) return true;
  if (/\bwindow\.event\b/.test(s) && /newDirection/.test(s) && !/useState\s*\(/.test(s)) return true;
  const opens = (s.match(/\{/g) || []).length;
  const closes = (s.match(/\}/g) || []).length;
  // Allow mild imbalance from `{` inside strings; huge gaps still mean truncated output.
  if (Math.abs(opens - closes) > 6) return true;
  // Mid-stream / truncated model dumps (ends mid-tag or never closes the component).
  if (looksLikeTruncatedUiSource(s)) return true;
  // React.useState without importing React → Preview white-screen.
  if (
    /\bReact\.use(?:State|Effect|Memo|Callback|Ref|Reducer)\s*\(/.test(s)
    && !/\bimport\s+React\b|\bimport\s+\*\s+as\s+React\b|\bimport\s+\{[^}]*\buse(?:State|Effect)/.test(s)
  ) {
    return true;
  }
  return false;
}

/**
 * Detect TS-only syntax that crashes Vite when written into .jsx/.js (not .tsx).
 * Common local-coder failure: `const App: React.FC = () => {`.
 */
export function jsxSourceHasTypeScriptOnlySyntax(source: string | undefined | null): boolean {
  const s = String(source || '');
  if (!s.trim()) return false;
  if (/:\s*React\.FC\b/.test(s) || /\bReact\.FC\s*</.test(s)) return true;
  if (/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*:\s*React\.FC\b/.test(s)) return true;
  if (/^(?:export\s+)?(?:type|interface)\s+[A-Za-z_$]/m.test(s)) return true;
  if (/\bas\s+const\b/.test(s)) return true;
  if (/\buse(?:State|Ref|Memo|Callback|Reducer)\s*</.test(s)) return true;
  // `const App: Something =` / `function foo(x: string)` — not valid JS.
  if (/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*:\s*[A-Za-z_$][\w$.]*\s*=/.test(s)) return true;
  if (/\(\s*[A-Za-z_$][\w$]*\s*:\s*(?:string|number|boolean|any|unknown|void|React\.)/.test(s)) return true;
  return false;
}

/** Strip the common TS-in-JSX crashers so Live can boot (heal before Preview Ready). */
export function stripIllegalTsFromJsx(source: string | undefined | null): string {
  let s = String(source || '');
  if (!s) return s;
  s = s.replace(/:\s*React\.FC(?:\s*<[^>]*>)?/g, '');
  s = s.replace(/\bReact\.FC(?:\s*<[^>]*>)?\s*=/g, '=');
  s = s.replace(/\bas\s+const\b/g, '');
  s = s.replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$.<>|\s]*(?=\s*=)/g, '$1 $2');
  s = s.replace(/\buse(State|Ref|Memo|Callback|Reducer)\s*<[^>]*>\s*\(/g, 'use$1(');
  return s;
}

/** True when App/CSS source was cut off mid-write (common local-model failure). */
export function looksLikeTruncatedUiSource(source: string | undefined | null): boolean {
  const s = String(source || '').replace(/\s+$/g, '');
  if (!s || s.length < 80) return false;
  // Ends inside an opening tag: `<h3` or `<div className="foo`
  if (/<[A-Za-z][\w.:-]*([^>'"`]|"[^"]*"|'[^']*')*$/.test(s)) return true;
  // Ends mid-expression / mid-string / mid-JSX prop
  if (/[=({[,:]\s*$/.test(s)) return true;
  if (/["'`]\s*$/.test(s) && (s.match(/["'`]/g) || []).length % 2 === 1) return true;
  // Component file that never closes — allow `export default App;` (const/arrow style)
  if (/export\s+default/i.test(s)) {
    const endsClean = /\}\s*;?\s*$/.test(s)
      || /export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/.test(s)
      || /export\s+\{\s*default\s*\}\s*;?\s*$/.test(s);
    if (!endsClean) return true;
  }
  // Incomplete open tag then a close tag mid-tree: `<button\n    </li>`
  if (/<[A-Za-z][\w.:-]*\b[^>]*\n\s*<\/[A-Za-z]/.test(s)) return true;
  // Incomplete CLOSE tag at EOF: `</footer` / `</div` (no `>`) — common GGUF cut
  if (/<\/[A-Za-z][\w.-]*\s*$/.test(s)) return true;
  // Incomplete close then another close on next line: `</footer\n    </footer>`
  if (/<\/[A-Za-z][\w.-]*\s*\n\s*<\//.test(s)) return true;
  // Extra paren junk near EOF: `</div>))` — not a normal `return ( … )\n}` close.
  if (/<\/[A-Za-z][\w.-]*>\s*\){2,}/.test(s.slice(-120))) return true;
  // Accidental over-close from a bad heal / model cut: `)))}}` / `}}}}`
  if (/\){3,}\s*\}+\s*$/.test(s) || /\}{3,}\s*$/.test(s)) return true;
  // Far more open JSX tags than closes (truncated return tree)
  const openTags = (s.match(/<[A-Za-z][\w.-]*\b[^>]*(?<!\/)\s*>/g) || []).length;
  const closeTags = (s.match(/<\/[A-Za-z][\w.-]*>/g) || []).length;
  if (openTags >= 6 && openTags - closeTags >= 4) return true;
  // CSS cut mid-rule / unbalanced braces (e.g. `color: #3333` with no `}`)
  if (/[{;]\s*[\w-]+\s*:\s*[^;{}]*$/i.test(s) || /:\s*#[0-9a-fA-F]{1,5}\s*$/.test(s)) return true;
  const openBrace = (s.match(/\{/g) || []).length;
  const closeBrace = (s.match(/\}/g) || []).length;
  if (openBrace >= 1 && openBrace > closeBrace) return true;
  return false;
}

/**
 * Best-effort close for near-complete App/CSS that the local coder cut mid-token.
 * Generic (any product) — strips incomplete trailing tags and balances JSX/braces.
 * Returns original when healing would be unsafe or useless.
 */
export function healNearCompleteTruncatedSource(
  path: string,
  source: string | undefined | null,
): string {
  const rel = String(path || '').replace(/\\/g, '/');
  let s = String(source || '').replace(/\s+$/g, '');
  if (!s || s.length < 200) return String(source || '');
  if (!looksLikeTruncatedUiSource(s)) return s;

  if (/\.css$/i.test(rel)) {
    // Drop incomplete trailing declaration, then close open braces.
    s = s.replace(/[{;]\s*[\w-]+\s*:\s*[^;{}]*$/i, (m) => m.startsWith('{') ? '{' : ';');
    s = s.replace(/:\s*#[0-9a-fA-F]{1,5}\s*$/i, '').trimEnd();
    const openBrace = (s.match(/\{/g) || []).length;
    const closeBrace = (s.match(/\}/g) || []).length;
    if (openBrace > closeBrace) s += '\n'.repeat(1) + '}'.repeat(openBrace - closeBrace);
    return looksLikeTruncatedUiSource(s) ? String(source || '') : s;
  }

  // Strip incomplete trailing opening tag: `<footer className="footer` / `<div` / `<p className`
  s = s.replace(/<[A-Za-z][\w.:-]*\b[^>]*["'][^"'>]*$/g, '').trimEnd();
  // Bare tag + prop name with no `=` yet (common GGUF cut): `<p className`
  s = s.replace(/<[A-Za-z][\w.:-]*(?:\s+[A-Za-z_$][\w$-]*)+\s*$/g, '').trimEnd();
  s = s.replace(/<[A-Za-z][\w.:-]*\b[^>]*$/g, '').trimEnd();
  s = s.replace(/<[A-Za-z][\w.:-]*\s*$/g, '').trimEnd();
  // Incomplete CLOSE tag cut mid-name: `</footer` / `</div` → close it
  s = s.replace(/<\/([A-Za-z][\w.-]*)\s*$/g, '</$1>');
  // Broken `</footer\n    </footer>` duplicate — keep one close
  s = s.replace(/<\/([A-Za-z][\w.-]*)\s*\n\s*<\/\1>/g, '</$1>');
  // Incomplete open tag then a close tag: `<button\n    </li>` → `</li>`
  s = s.replace(/<[A-Za-z][\w.:-]*\b[^>]*\n\s*(<\/[A-Za-z])/g, '$1');
  // Strip dangling incomplete prop value
  s = s.replace(/\s+[A-Za-z_$][\w$-]*=(?:"[^"]*|'[^']*|\{[^}]*)$/g, '').trimEnd();
  s = s.replace(/[=({[,:]\s*$/g, '').trimEnd();
  // Collapse accidental ))) / }} from bad brace fills
  s = s.replace(/\){3,}/g, ')').replace(/\}{3,}/g, '}');
  // `</div>)`  /  `</div>))` before end of component
  s = s.replace(/<\/([A-Za-z][\w.-]*)\s*\)+/g, '</$1>');
  // Typical broken end after a cut: `</div>)))\n}}` → `</div>\n  );\n}\n`
  s = s.replace(/\n\s*<\/div>\)+\s*\}+\s*$/g, '\n    </div>\n  );\n}\n');
  s = s.replace(/\)+\s*\}+\s*$/g, ')\n}\n');
  // Ensure return closes: `</div>\n}` → `</div>\n  );\n}`
  if (/<\/[A-Za-z][\w.-]*>\s*\n\s*\}\s*$/.test(s) && !/\)\s*;?\s*\n\s*\}\s*$/.test(s)) {
    s = s.replace(/\n\s*\}\s*$/, '\n  );\n}\n');
  }

  const voidRe = /^(?:img|input|br|hr|meta|link|source|area|base|col|embed|track|wbr)$/i;
  const stack: string[] = [];
  const tagRe = /<\/?([A-Za-z][\w.-]*)\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s))) {
    const full = m[0];
    const name = m[1];
    if (full.startsWith('</')) {
      if (stack.length) stack.pop();
    } else if (!/\/>$/.test(full) && !voidRe.test(name)) {
      stack.push(name);
    }
  }
  while (stack.length) {
    s += `\n    </${stack.pop()}>`;
  }

  const openParen = (s.match(/\(/g) || []).length;
  const closeParen = (s.match(/\)/g) || []).length;
  const openBrace = (s.match(/\{/g) || []).length;
  const closeBrace = (s.match(/\}/g) || []).length;
  // Prefer a proper return close over bare `</div>)` which looksLikeTruncated flags.
  if (openParen > closeParen && /<\/[A-Za-z][\w.-]*>\s*$/.test(s)) {
    s += '\n  );';
    if (openParen - closeParen > 1) s += ')'.repeat(Math.min(7, openParen - closeParen - 1));
  } else if (openParen > closeParen) {
    s += ')'.repeat(Math.min(8, openParen - closeParen));
  }
  if (openBrace > closeBrace) s += `\n${'}'.repeat(Math.min(12, openBrace - closeBrace))}`;
  if (/export\s+default/i.test(s) && !/\}\s*;?\s*$/.test(s)) s += '\n}\n';
  // Normalize `</div>)\n}` → `</div>\n  );\n}`
  s = s.replace(/\n\s*<\/([A-Za-z][\w.-]*)>\s*\)+\s*\n\s*\}+\s*$/g, '\n    </$1>\n  );\n}\n');
  s = s.replace(/<\/([A-Za-z][\w.-]*)>\s*\)+\s*;?\s*\n\s*\}+\s*$/g, '</$1>\n  );\n}\n');

  // Reject heal if still truncated or suspiciously shorter than a real component.
  // Keep a partial heal when we clearly closed the cut tag (better than shipping mid-`<p className`).
  if (looksLikeTruncatedUiSource(s) || s.length < 200) {
    const improved = s.length >= 200
      && s !== String(source || '').replace(/\s+$/g, '')
      && !/<[A-Za-z][\w.:-]*(?:\s+[A-Za-z_$][\w$-]*)*\s*$/.test(s)
      && !/<\/[A-Za-z][\w.-]*\s*$/.test(s);
    if (improved && /\}\s*;?\s*$/.test(s)) return s;
    return String(source || '');
  }
  return s;
}

/** True when App.jsx is the old meta "What you asked for" checklist shell. */
export function isChecklistMetaSpa(appSource: string | undefined | null): boolean {
  const s = String(appSource || '');
  return /What you asked for/i.test(s) && /Quick note/i.test(s) && /FEATURES\s*=/.test(s);
}

/** Drop injected skill playbooks so they never become UI copy. */
export function stripSkillNoise(summary: string): string {
  return String(summary || '')
    .replace(/\n*##\s*NOVA design skills[\s\S]*/i, '')
    .replace(/\n*##\s*NOVA skills[\s\S]*/i, '')
    .replace(/\n*NOVA design skills\s*\(follow these\)[\s\S]*/i, '')
    .replace(/\n*NOVA skills\s*\(follow these[^)]*\)[\s\S]*/i, '')
    .replace(/\n*Infer a distinct design language[\s\S]*/i, '')
    .trim();
}

/** Prefer a short product name for the UI header (not the whole create sentence). */
export function cleanProductTitle(name: string): string {
  let s = String(name || '').trim();
  if (!s) return 'New App';
  const called = s.match(/\b(?:called|named|name\s+it|call\s+it)\s+["“']?([A-Z][A-Za-z0-9][A-Za-z0-9 _-]{0,40})/i);
  if (called?.[1]) s = called[1].trim();
  const createProject = s.match(/\bcreate\s+(?:the\s+)?(?:project\s+)?["“']?([A-Z][A-Za-z0-9][A-Za-z0-9 _-]{1,40})(?:["”']|\s+on\s+disk|\s+project|\s*$)/i);
  if (createProject?.[1] && !/^(the|a|an|new|this)$/i.test(createProject[1])) {
    s = createProject[1].trim();
  }
  s = s.replace(/\s+(?:and|with|that|which|where|when|so|for|but|featuring|including|—|–|-)\b.*$/i, '').trim();
  s = s.replace(/\s+(?:app|application|project|product|platform|website|site)\b.*$/i, '').trim();
  if (/^(on[\s-]?disk|disk|on|folder|files?|ready|ui)$/i.test(s)) {
    const called = String(name || '').match(/\b(?:called|named|name\s+it|call\s+it)\s+["“']?([A-Z][A-Za-z0-9][A-Za-z0-9 _-]{0,40})/i);
    if (called?.[1]) return called[1].trim();
    return 'New App';
  }
  if (
    /^(add|make|fix|update|bigger|please|help|create\s+the|scaffold|build\s+me|is|that|this|not|scrap)\b/i.test(s)
    || s.split(/\s+/).length > 4
    || /[,:!?]/.test(s)
  ) {
    const token = s.split(/\s+/).find(w => /^[A-Z][a-zA-Z0-9_-]{2,32}$/.test(w) && !/^(Add|Make|Fix|Update|Bigger|Please|Create|Build|Help|That|This|Not|Want)$/.test(w));
    if (token) return token;
    return 'New App';
  }
  if (s.length >= 2 && s.length <= 48) {
    if (/^(my|the|a|an|new|app|project|site)$/i.test(s)) {
      const raw = String(name || '').trim();
      if (raw.length >= 2 && raw.length <= 48 && !/^(my|the|a|an)$/i.test(raw)) return raw;
      return 'New App';
    }
    return s;
  }
  const first = String(name || '').trim().split(/\s+/).find(w => /^[A-Za-z][A-Za-z0-9_-]{1,40}$/.test(w));
  return first && first.length >= 2 ? first : 'New App';
}

/** Classic maze chomper — must never fall through to the space-shooter arcade scaffold. */
export function looksLikePacManGame(summary: string, title = ''): boolean {
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  return /\bpac[\s-]?man\b/.test(t)
    || /\bpacman\b/.test(t)
    || (/\bmaze\b/.test(t) && /\b(?:ghosts?|pellets?|chomper|waka)\b/.test(t));
}

/** Snake / grow-on-food arcade — never the ship-and-rocks shooter. */
export function looksLikeSnakeGame(summary: string, title = ''): boolean {
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  return /\bsnake\b/.test(t)
    || /\bviper\b/.test(t) && /\b(?:game|arcade|neon|grow|food)\b/.test(t)
    || (/\bgrows?\b/.test(t) && /\b(?:food|eat|meals?)\b/.test(t) && /\b(?:game|arcade)\b/.test(t));
}

/** First-person / raycast shooter — only these get the FPS Arena scaffold. */
export function looksLikeFpsGame(summary: string, title = ''): boolean {
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  if (looksLikePacManGame(summary, title) || looksLikeSnakeGame(summary, title) || looksLikeChromeDinoGame(summary, title)) {
    return false;
  }
  return (
    /\b(?:fps|first[\s-]?person|raycast|hitscan|pointer[\s-]?lock|wasd)\b/.test(t)
    && /\b(?:shoot(?:er|ing)?|gun|crosshair|arena|enemy|enemies|crates?)\b/.test(t)
  ) || /\bfps[\s_-]?arena\b/.test(t);
}

/** Playable canvas / arcade games (shooters, runners, score+lives). Not marketing sites. */
export function looksLikePlayableCanvasGame(summary: string, title = ''): boolean {
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  // Todo / tip / utility apps are never arcade games (ensemble fluff may say "playable").
  if (/\b(?:todo|task\s*list|tip\s*(?:calc|calculator|wise)|checklist|counter|timer|notepad)\b/.test(t)
    && !/\b(?:game|arcade|pac-?man|snake|dino|shooter|pong)\b/.test(t)) {
    return false;
  }
  if (looksLikeChromeDinoGame(summary, title) || looksLikePacManGame(summary, title) || looksLikeSnakeGame(summary, title)) return true;
  if (looksLikeFpsGame(summary, title)) return true;
  if (/\b(?:buy\s+now|shopping\s+bag|storefront|landing\s+page)\b/.test(t) && !/\b(?:game|playable|arcade|canvas)\b/.test(t)) {
    return false;
  }
  return (
    /\b(?:playable|arcade|canvas\s+game|html5\s+game|browser\s+game|asteroid|space\s+shooter|fps|first[\s-]?person|shooter|pong|paddle\s+ball|platformer|rpg|roguelike|tower\s+defense|endless\s+runner)\b/.test(t)
    || (
      /\bgame\b/.test(t)
      && /\b(?:score|lives?|shoot(?:ing)?|hud|game\s*over|play\s+again|arrow\s+keys?|space\s*bar|player\s+ship|weapons?|enemies|hitscan|crosshair|muzzle|paddle|ball|reset|jump|levels?)\b/.test(t)
    )
    // Rebuild briefs often list mechanics without the word "game".
    || (
      /\b(?:hitscan|pointer[\s-]?lock|crosshair|requestAnimationFrame)\b/.test(t)
      && /\b(?:wasd|mousedown|canvas|shoot|enemy|crates?)\b/.test(t)
    )
  );
}

/** Chrome offline T-Rex runner style. */
export function looksLikeChromeDinoGame(summary: string, title = ''): boolean {
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  return /\b(chrome\s+dino|dinosaur\s+game|t-?rex\s+(?:runner|game)|offline\s+dinosaur|dino\s+runner|no\s+internet\s+dinosaur)\b/.test(t)
    || (/\bdinosaur\b/.test(t) && /\b(game|runner|jump|space\s*bar|cactus|offline)\b/.test(t));
}

/** Interactive 3D / viewport modeling tool — not a marketing site. */
export function looksLikeSpatialApp(summary: string, title = ''): boolean {
  // Strip “No Three.js / never WebGL…” so forbid text never forces the 3D Ready gate.
  const cleaned = `${stripSkillNoise(summary)} ${title}`
    .replace(
      /\b(?:do\s+not|never|forbidden|forbidding|don't|dont|avoid|no)\b[^\n.]{0,80}\b(?:three\.?js|webgl|babylon|orbit\s*controls?)\b[^\n.]*/gi,
      ' ',
    )
    .toLowerCase();
  const t = cleaned;
  // Layout-inspiration copy ("first viewport", apple.com bands) is NOT a 3D app.
  if (
    /\b(?:apple\.com|full[- ]?bleed|product\s+band|landing\s+page|home\s*page|marketing)\b/.test(t)
    && !/\b(?:three\.?js|webgl|babylon|modeling\s+app|modeler|mesh\s+editor|blender)\b/.test(t)
  ) {
    return false;
  }
  // Real 3D stack / modeler asks only — bare "viewport" is CSS/layout jargon.
  if (/\b(?:three\.?js|webgl|babylon|modeling\s+app|modeler|mesh\s+editor|blender[-\s]?like)\b/.test(t)) {
    return true;
  }
  if (/\b3d\b/.test(t) && /\b(?:app|editor|tool|scene|cube|sphere|mesh|canvas|orbit|model)\b/.test(t)) {
    return true;
  }
  if (/\bviewport\b/.test(t) && /\b(?:3d|orbit|mesh|webgl|three|babylon)\b/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Removed: never invent a product SPA from templates.
 * Callers must refuse honestly when the model leaves a broken shell.
 */
export function buildFreshSpaFromBrief(
  _name: string,
  _summary: string,
): { appJsx: string; appCss: string; indexCss: string } | null {
  return null;
}
