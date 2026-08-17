/**
 * Project coding loop — prompt packing, parse model file blocks, apply to tree.
 * ARK is a developer studio: chat must produce real files, not comment stamps.
 */

export type ProjectFileMap = Record<string, string>;

export type ProjectFileNode = {
  name: string;
  type: 'file' | 'folder';
  children?: ProjectFileNode[];
  language?: string;
};

export type ParsedFileEdit = {
  path: string;
  content: string;
};

export type ApplyEditsResult = {
  files: ProjectFileMap;
  tree: ProjectFileNode[];
  changedPaths: string[];
  addedLines: number;
  removedLines: number;
  summary: string;
};

const MAX_CONTEXT_CHARS = 14_000;
const MAX_FILE_CHARS = 3_500;

const CODING_INSTRUCTIONS = `You are ARK inside a developer project workspace — not a generic chatbot and not a local-engine toy.
Your job is to help the user build and change real software in this project.

When the user asks you to build, create, fix, or change code, respond with FULL file contents using this exact format for every file you create or update:

@@@FILE path/relative/to/project.ext
\`\`\`
...entire file contents here...
\`\`\`

Prefer small, correct diffs as full-file rewrites. If the user mentions GitHub or a remote repo, still write real files into this local project first — cloning/PRs can come after the files exist on disk.

Rules:
- Use paths like src/App.tsx, package.json, README.md (forward slashes).
- Prefer a small, working set of files over huge scaffolds.
- For web UI apps, include at least index.html (or a self-contained preview HTML) plus the main source files needed.
- After the file blocks, write a short plain-language summary of what you changed (no fake “installing dependencies” claims).
- If the user is only asking a question (no code change), answer normally WITHOUT @@@FILE blocks.`;

function normalizePath(raw: string): string {
  return raw
    .trim()
    .replace(/^[`"'[\(]+|[`"'][\)]+$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function languageFor(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  if (ext === 'tsx' || ext === 'ts' || ext === 'jsx' || ext === 'js') return ext;
  if (ext === 'css' || ext === 'json' || ext === 'md' || ext === 'html' || ext === 'svg') return ext;
  return ext;
}

/** Flatten preferred full-path map from mixed basename/full keys. */
export function flattenProjectFiles(files: ProjectFileMap): ProjectFileMap {
  const out: ProjectFileMap = {};
  for (const [k, v] of Object.entries(files)) {
    if (!k || typeof v !== 'string') continue;
    if (k.includes('/')) {
      out[normalizePath(k)] = v;
    } else if (k.endsWith('.tsx') || k.endsWith('.ts') || k.endsWith('.css') || k.endsWith('.jsx') || k.endsWith('.js')) {
      const full = `src/${k}`;
      if (!out[full]) out[full] = v;
    } else {
      out[normalizePath(k)] = v;
    }
  }
  return out;
}

export function buildProjectCodingPrompt(
  userMessage: string,
  files: ProjectFileMap,
  projectName?: string,
): string {
  const flat = flattenProjectFiles(files);
  if (Object.keys(flat).length === 0) {
    return buildProjectCodingPromptLite(userMessage, projectName);
  }
  const entries = Object.entries(flat).sort(([a], [b]) => a.localeCompare(b));
  let used = 0;
  const chunks: string[] = [];

  for (const [path, content] of entries) {
    const body =
      content.length > MAX_FILE_CHARS
        ? `${content.slice(0, MAX_FILE_CHARS)}\n/* …truncated… */`
        : content;
    const block = `--- ${path} ---\n${body}`;
    if (used + block.length > MAX_CONTEXT_CHARS) {
      chunks.push(`--- ${path} ---\n/* omitted for size */`);
      continue;
    }
    chunks.push(block);
    used += block.length;
  }

  const fileSection = chunks.length
    ? chunks.join('\n\n')
    : '(empty project — create the files that are needed)';

  return `${CODING_INSTRUCTIONS}

Project: ${projectName || 'ARK project'}

Current files:
${fileSection}

User request:
${userMessage.trim()}`;
}

const LITE_CODING = `You are ARK in the Code workspace. Create working files now.

Format each file exactly:
@@@FILE path/to/file.ext
\`\`\`
...full file contents...
\`\`\`

Rules: prefer index.html for web/calculator asks; complete runnable code; one short summary after files.`;

/** Shorter prompt for empty projects — faster on local GGUF. */
export function buildProjectCodingPromptLite(userMessage: string, projectName?: string): string {
  return `${LITE_CODING}

Project: ${projectName || 'ARK project'}

User request:
${userMessage.trim()}`;
}

/** Human label for Explorer header while building. */
export function inferBuildLabel(message: string, projectName?: string): string {
  const t = String(message || '').toLowerCase();
  if (/\bcalculator\b/.test(t)) return 'Calculator';
  if (/\bdiscord\b/.test(t)) return 'Discord';
  if (/\bwebsite\b|\bweb page\b|\blanding page\b|\bhomepage\b/.test(t)) {
    const host = t.match(/\b([a-z0-9-]+\.(?:com|io|dev|app|org))\b/i);
    if (host?.[1]) {
      const base = host[1].split('.')[0];
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
    return 'Website';
  }
  if (/\bios\b|\biphone\b|\bandroid\b/.test(t)) return 'Mobile UI';
  if (/\bapp\b|\bapplication\b/.test(t)) return 'App';
  if (/\bapi\b|\bbackend\b/.test(t)) return 'API';
  const name = String(projectName || '').trim();
  if (name && !/^code project$/i.test(name)) return name;
  return 'Project';
}

/** Planned file paths shown in Explorer before the model returns. */
export function planFilesForBuild(message: string): string[] {
  const t = String(message || '').toLowerCase();
  if (/\bcalculator\b/.test(t)) return ['index.html'];
  if (/\breact\b|\btsx\b/.test(t)) return ['index.html', 'src/App.tsx', 'src/main.tsx'];
  if (/\bpython\b/.test(t)) return ['main.py'];
  if (/\bwebsite\b|\bhtml\b/.test(t)) return ['index.html', 'styles.css'];
  return ['index.html'];
}

export type BuildLiveStep = 'understand' | 'plan' | 'generate' | 'apply' | 'done';

export const BUILD_PROGRESS_STEPS: { id: BuildLiveStep; label: string }[] = [
  { id: 'understand', label: 'Understanding your request' },
  { id: 'plan', label: 'Planning files and structure' },
  { id: 'generate', label: 'Writing code' },
  { id: 'apply', label: 'Saving to project folder' },
  { id: 'done', label: 'Finished' },
];

/**
 * Parse @@@FILE blocks and common markdown fence variants with paths.
 */
export function parseFileEdits(reply: string): ParsedFileEdit[] {
  const text = reply || '';
  const found: ParsedFileEdit[] = [];
  const seen = new Set<string>();

  const push = (pathRaw: string, content: string) => {
    const path = normalizePath(pathRaw);
    if (!path || !path.includes('.') || path.length > 180) return;
    if (!/^[A-Za-z0-9_./@+-]+$/.test(path)) return;
    const body = content.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
    if (!body.trim()) return;
    if (seen.has(path)) {
      const idx = found.findIndex(f => f.path === path);
      if (idx >= 0) found[idx] = { path, content: body };
      return;
    }
    seen.add(path);
    found.push({ path, content: body });
  };

  // Preferred: @@@FILE path\n```...\n```
  const atFile = /@@@FILE\s+([^\n\r]+)\s*```[\w.+-]*\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = atFile.exec(text)) !== null) {
    push(m[1], m[2]);
  }

  // @@@FILE path\n content until next @@@FILE or end (no fence)
  const atFileLoose = /@@@FILE\s+([^\n\r]+)\n([\s\S]*?)(?=\n@@@FILE\s+|$)/gi;
  while ((m = atFileLoose.exec(text)) !== null) {
    const path = m[1];
    let body = m[2].trim();
    if (body.startsWith('```')) {
      body = body.replace(/^```[\w.+-]*\s*\n?/, '').replace(/```\s*$/, '');
    }
    push(path, body);
  }

  // Fallback: ```tsx path/to/file.tsx  OR  ```path/to/file.tsx
  const fencePath = /```(?:[\w.+-]*)?(?:\s+|:)([A-Za-z0-9_./@+-]+\.[A-Za-z0-9]+)\s*\n([\s\S]*?)```/g;
  while ((m = fencePath.exec(text)) !== null) {
    push(m[1], m[2]);
  }

  // Fallback: ```tsx file="src/App.tsx"
  const fenceAttr = /```[\w.+-]*\s+(?:file|path)=["']([^"']+)["']\s*\n([\s\S]*?)```/gi;
  while ((m = fenceAttr.exec(text)) !== null) {
    push(m[1], m[2]);
  }

  return found;
}

/** When the model returns chat-style fences instead of @@@FILE blocks. */
export function extractChatStyleFileEdits(reply: string, userMessage: string): ParsedFileEdit[] {
  const ask = String(userMessage || '').toLowerCase();
  const singleFile = /\b(single[\s-]?file|one file|index\.html)\b/i.test(ask)
    || /\bcalculator\b/i.test(ask);
  if (!singleFile) return [];

  const html = reply.match(/```html\s*\n([\s\S]*?)```/i);
  if (html?.[1]?.trim()) {
    return [{ path: 'index.html', content: html[1].trim() }];
  }

  const any = reply.match(/```([\w.+-]*)\s*\n([\s\S]*?)```/);
  if (!any?.[2]?.trim()) return [];

  const tag = (any[1] || '').toLowerCase();
  if (tag === 'html' || tag === 'htm') return [{ path: 'index.html', content: any[2].trim() }];
  if (tag === 'javascript' || tag === 'js') return [{ path: 'index.html', content: `<script>\n${any[2].trim()}\n</script>` }];
  if (tag.includes('.')) return [{ path: normalizePath(tag), content: any[2].trim() }];
  return [{ path: 'index.html', content: any[2].trim() }];
}

/** Build explorer tree from a flat path → content map. */
export function buildFileTreeFromPaths(files: ProjectFileMap): ProjectFileNode[] {
  const flat = flattenProjectFiles(files);
  const paths = Object.keys(flat).filter(p => p.includes('.') && flat[p]?.trim());
  const root: ProjectFileNode[] = [];

  const sortNodes = (nodes: ProjectFileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  };

  for (const filePath of paths.sort()) {
    const parts = normalizePath(filePath).split('/').filter(Boolean);
    let nodes = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        if (!nodes.some(n => n.name === name && n.type === 'file')) {
          nodes.push({ name, type: 'file', language: languageFor(filePath) });
          sortNodes(nodes);
        }
      } else {
        let folder = nodes.find(n => n.name === name && n.type === 'folder');
        if (!folder) {
          folder = { name, type: 'folder', children: [] };
          nodes.push(folder);
          sortNodes(nodes);
        }
        folder.children = folder.children ?? [];
        nodes = folder.children;
      }
    }
  }
  return root;
}

const CALCULATOR_SCAFFOLD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Calculator</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .calc { width: min(320px, 92vw); background: #1e293b; border-radius: 16px; padding: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
    #display { width: 100%; font-size: 1.75rem; text-align: right; padding: 12px; border: none; border-radius: 10px; margin-bottom: 12px; background: #0f172a; color: #f8fafc; }
    .keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    button { font-size: 1.1rem; padding: 14px; border: none; border-radius: 10px; cursor: pointer; background: #334155; color: #f1f5f9; }
    button.op { background: #0369a1; }
    button.eq { background: #059669; grid-column: span 2; }
    button.clear { background: #b91c1c; }
  </style>
</head>
<body>
  <div class="calc">
    <input id="display" type="text" readonly value="0" />
    <div class="keys">
      <button class="clear" data-a="C">C</button>
      <button class="op" data-a="/">÷</button>
      <button class="op" data-a="*">×</button>
      <button class="op" data-a="-">−</button>
      <button data-a="7">7</button><button data-a="8">8</button><button data-a="9">9</button>
      <button class="op" data-a="+">+</button>
      <button data-a="4">4</button><button data-a="5">5</button><button data-a="6">6</button>
      <button data-a="1">1</button><button data-a="2">2</button><button data-a="3">3</button>
      <button data-a="0">0</button><button data-a=".">.</button>
      <button class="eq" data-a="=">=</button>
    </div>
  </div>
  <script>
    const display = document.getElementById('display');
    let current = '0', pending = null, op = null;
    function render() { display.value = current; }
    function inputDigit(d) { current = current === '0' && d !== '.' ? d : current + d; render(); }
    function compute(a, b, op) {
      const x = parseFloat(a), y = parseFloat(b);
      if (op === '+') return String(x + y);
      if (op === '-') return String(x - y);
      if (op === '*') return String(x * y);
      if (op === '/') return y === 0 ? 'Error' : String(x / y);
      return b;
    }
    document.querySelector('.keys').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const a = btn.dataset.a;
      if (a === 'C') { current = '0'; pending = null; op = null; render(); return; }
      if ('0123456789.'.includes(a)) { inputDigit(a); return; }
      if ('+-*/'.includes(a)) { pending = current; op = a; current = '0'; return; }
      if (a === '=' && pending != null && op) { current = compute(pending, current, op); pending = op = null; render(); }
    });
  </script>
</body>
</html>`;

/** Offline fallback when the brain times out or returns no file blocks. */
export function scaffoldFallbackEdits(userMessage: string): ParsedFileEdit[] {
  const ask = String(userMessage || '').toLowerCase();
  if (/\bcalculator\b/.test(ask) && (/\bhtml\b/.test(ask) || /\bsingle[\s-]?file\b/.test(ask) || /\bweb\b/.test(ask))) {
    return [{ path: 'index.html', content: CALCULATOR_SCAFFOLD }];
  }
  return [];
}

/** Pull partial HTML from a streaming model reply for live editor preview. */
export function extractStreamingHtml(partial: string): string | null {
  const fenced = partial.match(/```html\s*\n([\s\S]*)$/i);
  if (fenced?.[1] && fenced[1].trim().length > 40) return fenced[1];
  if (/<!DOCTYPE html/i.test(partial) || /<html[\s>]/i.test(partial)) {
    const start = partial.search(/<!DOCTYPE html|<html[\s>]/i);
    if (start >= 0) return partial.slice(start);
  }
  return null;
}

/** Strip file blocks from reply so the chat bubble stays readable. */
export function stripFileBlocks(reply: string): string {
  let text = reply || '';
  text = text.replace(/@@@FILE\s+[^\n\r]+\s*```[\w.+-]*\s*\n[\s\S]*?```/gi, '');
  text = text.replace(/@@@FILE\s+[^\n\r]+\n[\s\S]*?(?=\n@@@FILE\s+|$)/gi, '');
  text = text.replace(/```(?:[\w.+-]*)?(?:\s+|:)[A-Za-z0-9_./@+-]+\.[A-Za-z0-9]+\s*\n[\s\S]*?```/g, '');
  text = text.replace(/```[\w.+-]*\s+(?:file|path)=["'][^"']+["']\s*\n[\s\S]*?```/gi, '');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function countLines(s: string) {
  if (!s) return 0;
  return s.split('\n').length;
}

function ensurePathInTree(tree: ProjectFileNode[], path: string): ProjectFileNode[] {
  const parts = normalizePath(path).split('/').filter(Boolean);
  if (!parts.length) return tree;

  const clone = structuredClone(tree) as ProjectFileNode[];

  const ensure = (nodes: ProjectFileNode[], idx: number): void => {
    const name = parts[idx];
    const isLast = idx === parts.length - 1;
    if (isLast) {
      const existing = nodes.find(n => n.name === name && n.type === 'file');
      if (!existing) {
        nodes.push({ name, type: 'file', language: languageFor(path) });
        nodes.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      }
      return;
    }
    let folder = nodes.find(n => n.name === name && n.type === 'folder');
    if (!folder) {
      folder = { name, type: 'folder', children: [] };
      nodes.push(folder);
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    folder.children = folder.children ?? [];
    ensure(folder.children, idx + 1);
  };

  ensure(clone, 0);
  return clone;
}

export function applyFileEdits(
  currentFiles: ProjectFileMap,
  tree: ProjectFileNode[],
  edits: ParsedFileEdit[],
): ApplyEditsResult {
  const files = { ...currentFiles };
  let nextTree = tree;
  let addedLines = 0;
  let removedLines = 0;
  const changedPaths: string[] = [];

  for (const edit of edits) {
    const path = normalizePath(edit.path);
    const base = path.split('/').pop() || path;
    const prev =
      files[path]
      ?? files[base]
      ?? '';
    const next = edit.content;

    addedLines += Math.max(0, countLines(next) - countLines(prev));
    removedLines += Math.max(0, countLines(prev) - countLines(next));

    files[path] = next;
    files[base] = next;
    nextTree = ensurePathInTree(nextTree, path);
    changedPaths.push(path);
  }

  const summary = changedPaths.length
    ? `Updated ${changedPaths.length} file${changedPaths.length === 1 ? '' : 's'}: ${changedPaths.join(', ')}`
    : 'No file edits parsed from the model reply.';

  return {
    files,
    tree: nextTree,
    changedPaths,
    addedLines,
    removedLines,
    summary,
  };
}

export function foldersToExpand(paths: string[]): string[] {
  const set = new Set<string>();
  for (const p of paths) {
    const parts = normalizePath(p).split('/');
    for (let i = 1; i < parts.length; i++) {
      set.add(parts.slice(0, i).join('/'));
    }
  }
  return [...set];
}
