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
  const hasAppComponent =
    /export\s+default\s+function\s+App\b/i.test(s)
    || /export\s+default\s+(?:function\s*)?\(\s*\)\s*=>/i.test(s)
    || /function\s+App\s*\(/i.test(s)
    || /(?:const|let|var)\s+App\s*=\s*(?:async\s*)?(?:\(|function)/i.test(s)
    || /export\s+default\s+App\b/i.test(s);
  const tagCount = (s.match(/<[A-Za-z]/g) || []).length;
  if (s.length < 400) {
    // Allow intentionally tiny exact UIs (black screen + icon) when App exports real JSX.
    if (s.length >= 160 && hasAppComponent && tagCount >= 2) {
      /* ok */
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
  return false;
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
    .replace(/\n*NOVA design skills\s*\(follow these\)[\s\S]*/i, '')
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

/** Playable canvas / arcade games (shooters, runners, score+lives). Not marketing sites. */
export function looksLikePlayableCanvasGame(summary: string, title = ''): boolean {
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  if (looksLikeChromeDinoGame(summary, title) || looksLikePacManGame(summary, title) || looksLikeSnakeGame(summary, title)) return true;
  if (/\b(?:buy\s+now|shopping\s+bag|storefront|landing\s+page)\b/.test(t) && !/\b(?:game|playable|arcade|canvas)\b/.test(t)) {
    return false;
  }
  return (
    /\b(?:playable|arcade|canvas\s+game|html5\s+game|browser\s+game|asteroid|space\s+shooter)\b/.test(t)
    || (
      /\bgame\b/.test(t)
      && /\b(?:score|lives?|shoot|hud|game\s*over|play\s+again|arrow\s+keys?|space\s*bar|player\s+ship)\b/.test(t)
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
  const t = `${stripSkillNoise(summary)} ${title}`.toLowerCase();
  if (/\b(3d|three\.?js|webgl|babylon|modeling\s+app|modeler|viewport|blender[-\s]?like|mesh\s+editor)\b/.test(t)) {
    return /\b(app|editor|tool|scene|cube|sphere|mesh|viewport|canvas|orbit|model)\b/.test(t) || /\b3d\b/.test(t);
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
