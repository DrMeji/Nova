const JS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null',
  'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
  'var', 'void', 'while', 'with', 'yield', 'async', 'await', 'of', 'from',
  'as', 'type', 'interface', 'enum', 'implements', 'private', 'public',
  'protected', 'readonly', 'static', 'namespace', 'abstract', 'declare',
]);

const PY_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def',
  'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass',
  'raise', 'return', 'True', 'try', 'while', 'with', 'yield',
]);

export function languageFromPath(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (ext === 'html' || ext === 'htm' || ext === 'svg') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'js';
  if (ext === 'ts') return 'ts';
  if (ext === 'tsx' || ext === 'jsx') return 'tsx';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'py') return 'py';
  if (ext === 'swift') return 'swift';
  if (ext === 'kt' || ext === 'kts') return 'kt';
  if (ext === 'gradle' || ext === 'pbxproj' || ext === 'plist' || ext === 'xml') return 'txt';
  return 'txt';
}

function esc(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function tok(cls: string, text: string) {
  return `<span class="nova-tok-${cls}">${esc(text)}</span>`;
}

function highlightJsLike(code: string): string {
  let i = 0;
  let out = '';
  const n = code.length;

  while (i < n) {
    const two = code.slice(i, i + 2);
    if (two === '//') {
      const end = code.indexOf('\n', i);
      const take = end < 0 ? code.slice(i) : code.slice(i, end);
      out += tok('comment', take);
      i += take.length;
      continue;
    }
    if (two === '/*') {
      const end = code.indexOf('*/', i + 2);
      const take = end < 0 ? code.slice(i) : code.slice(i, end + 2);
      out += tok('comment', take);
      i += take.length;
      continue;
    }
    const ch = code[i];
    // JSX / TSX tags — same colors as HTML (was all-gray "Notes" look for <div> etc.).
    if (ch === '<' && i + 1 < n && /[A-Za-z/!]/.test(code[i + 1])) {
      const end = code.indexOf('>', i);
      if (end < 0) {
        out += highlightHtmlTag(code.slice(i));
        break;
      }
      out += highlightHtmlTag(code.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === ch) { j += 1; break; }
        j += 1;
      }
      out += tok('string', code.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) && (i === 0 || /[^\w$]/.test(code[i - 1]))) {
      let j = i + 1;
      while (j < n && /[0-9_.]/.test(code[j])) j += 1;
      out += tok('number', code.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(code[j])) j += 1;
      const word = code.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(code[k])) k += 1;
      if (JS_KEYWORDS.has(word)) out += tok('keyword', word);
      else if (code[k] === '(') out += tok('fn', word);
      else if (/^[A-Z]/.test(word)) out += tok('type', word);
      else out += tok('plain', word);
      i = j;
      continue;
    }
    out += tok('punct', ch);
    i += 1;
  }
  return out;
}

function highlightCss(code: string): string {
  let i = 0;
  let out = '';
  const n = code.length;
  while (i < n) {
    if (code.slice(i, i + 2) === '/*') {
      const end = code.indexOf('*/', i + 2);
      const take = end < 0 ? code.slice(i) : code.slice(i, end + 2);
      out += tok('comment', take);
      i += take.length;
      continue;
    }
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && code[j] !== ch) {
        if (code[j] === '\\') j += 1;
        j += 1;
      }
      out += tok('string', code.slice(i, Math.min(n, j + 1)));
      i = Math.min(n, j + 1);
      continue;
    }
    if (ch === '#') {
      let j = i + 1;
      while (j < n && /[0-9A-Fa-f]/.test(code[j])) j += 1;
      if (j - i >= 4) {
        out += tok('number', code.slice(i, j));
        i = j;
        continue;
      }
    }
    if (/[A-Za-z_-]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[\w-]/.test(code[j])) j += 1;
      const word = code.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(code[k])) k += 1;
      if (code[k] === ':') out += tok('attr', word);
      else if (code[k] === '(') out += tok('fn', word);
      else if (word.startsWith('@')) out += tok('keyword', word);
      else out += tok('tag', word);
      i = j;
      continue;
    }
    out += esc(ch);
    i += 1;
  }
  return out;
}

function highlightHtml(code: string): string {
  let i = 0;
  let out = '';
  const n = code.length;
  while (i < n) {
    if (code.startsWith('<!--', i)) {
      const end = code.indexOf('-->', i + 4);
      const take = end < 0 ? code.slice(i) : code.slice(i, end + 3);
      out += tok('comment', take);
      i += take.length;
      continue;
    }
    if (code[i] === '<') {
      const end = code.indexOf('>', i);
      if (end < 0) {
        out += tok('tag', code.slice(i));
        break;
      }
      const tag = code.slice(i, end + 1);
      out += highlightHtmlTag(tag);
      i = end + 1;
      const open = tag.match(/^<\s*(script|style)\b/i);
      if (open && !/\/\s*>$/.test(tag)) {
        const closeName = open[1].toLowerCase();
        const close = code.toLowerCase().indexOf(`</${closeName}`, i);
        const inner = close < 0 ? code.slice(i) : code.slice(i, close);
        out += closeName === 'style' ? highlightCss(inner) : highlightJsLike(inner);
        i = close < 0 ? n : close;
      }
      continue;
    }
    const next = code.indexOf('<', i);
    const chunk = next < 0 ? code.slice(i) : code.slice(i, next);
    out += tok('plain', chunk);
    i += chunk.length;
  }
  return out;
}

function highlightHtmlTag(tag: string): string {
  return tag.replace(
    /^(<\/?)([A-Za-z][\w:-]*)([^>]*)(\/?>)$/s,
    (_m, open, name, rest, close) => {
      const attrs = rest.replace(
        /([A-Za-z_:][\w:.-]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)?/g,
        (_a: string, key: string, eq: string, val?: string) =>
          tok('attr', key) + esc(eq) + (val ? tok('string', val) : ''),
      );
      return tok('punct', open) + tok('tag', name) + attrs + tok('punct', close);
    },
  ) || tok('tag', tag);
}

function highlightJson(code: string): string {
  return code.replace(
    /("(?:\\.|[^"\\])*")\s*(:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g,
    (m, str?: string, colon?: string, kw?: string, num?: string, comment?: string) => {
      if (comment) return tok('comment', comment);
      if (str && colon) return tok('attr', str) + esc(colon);
      if (str) return tok('string', str);
      if (kw) return tok('keyword', kw);
      if (num) return tok('number', num);
      return esc(m);
    },
  );
}

function highlightMd(code: string): string {
  return code
    .replace(/^(#{1,6}\s.*)$/gm, m => tok('keyword', m))
    .replace(/(`[^`]+`)/g, m => tok('string', m))
    .replace(/(\*\*[^*]+\*\*|\*[^*]+\*)/g, m => tok('type', m));
}

function highlightPy(code: string): string {
  let i = 0;
  let out = '';
  const n = code.length;
  while (i < n) {
    if (code[i] === '#') {
      const end = code.indexOf('\n', i);
      const take = end < 0 ? code.slice(i) : code.slice(i, end);
      out += tok('comment', take);
      i += take.length;
      continue;
    }
    const triple = code.slice(i, i + 3);
    if (triple === '"""' || triple === "'''") {
      const end = code.indexOf(triple, i + 3);
      const take = end < 0 ? code.slice(i) : code.slice(i, end + 3);
      out += tok('string', take);
      i += take.length;
      continue;
    }
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === ch) { j += 1; break; }
        j += 1;
      }
      out += tok('string', code.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[\w]/.test(code[j])) j += 1;
      const word = code.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(code[k])) k += 1;
      if (PY_KEYWORDS.has(word)) out += tok('keyword', word);
      else if (code[k] === '(') out += tok('fn', word);
      else out += tok('plain', word);
      i = j;
      continue;
    }
    out += esc(ch);
    i += 1;
  }
  return out;
}

export function highlightCode(code: string, language: string): string {
  if (!code) return '';
  if (code.length > 180_000) return tok('plain', code);
  switch (language) {
    case 'html': return highlightHtml(code);
    case 'css': return highlightCss(code);
    case 'js':
    case 'ts':
    case 'tsx': return highlightJsLike(code);
    case 'json': return highlightJson(code);
    case 'md': return highlightMd(code);
    case 'py': return highlightPy(code);
    case 'swift':
    case 'kt': return highlightJsLike(code);
    default: return tok('plain', code);
  }
}

export function fileTintClass(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'html' || ext === 'htm') return 'text-orange-400';
  if (ext === 'css') return 'text-sky-400';
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'text-yellow-300';
  if (ext === 'ts' || ext === 'tsx') return 'text-blue-400';
  if (ext === 'json') return 'text-amber-300';
  if (ext === 'py') return 'text-sky-300';
  if (ext === 'swift') return 'text-orange-400';
  if (ext === 'kt' || ext === 'kts') return 'text-violet-300';
  if (ext === 'md') return 'text-content-secondary';
  return 'text-content-tertiary';
}
