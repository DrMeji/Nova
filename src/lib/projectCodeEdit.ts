import { classifyMobileTarget, mobileCodingRules } from '@/lib/mobileTarget';
import { layoutLockEdits, mobileTemplateEdits, planMobileFiles } from '@/lib/mobileTemplates';
import { isLayoutLockAsk } from '@/lib/mobileDevices';

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

When the user asks you to build, add, remove, upgrade, fix, or change code, respond with FULL file contents using this exact format for every file you create or update:

@@@FILE path/relative/to/project.ext
\`\`\`
...entire file contents here...
\`\`\`

Prefer small, correct diffs as full-file rewrites. If the user mentions GitHub or a remote repo, still write real files into this local project first — cloning/PRs can come after the files exist on disk.

Rules:
- Use real paths with folders: css/styles.css, js/app.js, src/App.tsx, package.json (forward slashes).
- For typical web UIs, split markup, styles, and behavior:
  - index.html — markup only; link css/styles.css and js/app.js
  - css/styles.css — all CSS
  - js/app.js — all JavaScript
- Only put CSS and JS inline in one index.html if the user asked for a single file.
- After the file blocks, write a short plain-language summary of what you changed (no fake “installing dependencies” claims).
- Match the ask: add new files/features, remove dead UI, upgrade the page, or fix a bug. Do not only patch unless that is what they asked.
- Empty projects: start from a blank working page and grow it. Do not refuse because the folder is empty.
- If the user is only asking a question (no code change), answer normally WITHOUT @@@FILE blocks.`;

function normalizePath(raw: string): string {
  return raw
    .trim()
    .replace(/^[`"'[\(]+|[`"'][\)]+$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function codingInstructionsFor(userMessage: string, files: ProjectFileMap): string {
  const target = classifyMobileTarget(userMessage)
    || (Object.keys(files).some(p => /\.swift$|\.pbxproj$/i.test(p)) && Object.keys(files).some(p => /\.kt$|androidmanifest/i.test(p))
      ? 'both'
      : Object.keys(files).some(p => /\.swift$|\.pbxproj$/i.test(p))
        ? 'ios'
        : Object.keys(files).some(p => /\.kt$|androidmanifest/i.test(p))
          ? 'android'
          : null);
  const extra = target ? `\n\n${mobileCodingRules(target)}` : '';
  return `${CODING_INSTRUCTIONS}${extra}`;
}

function languageFor(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  if (ext === 'tsx' || ext === 'ts' || ext === 'jsx' || ext === 'js') return ext;
  if (ext === 'css' || ext === 'json' || ext === 'md' || ext === 'html' || ext === 'svg') return ext;
  if (ext === 'swift' || ext === 'kt' || ext === 'kts' || ext === 'gradle' || ext === 'plist' || ext === 'pbxproj') return ext;
  return ext;
}

/** Flatten preferred full-path map from mixed basename/full keys. */
function isInternalProjectFile(path: string) {
  const base = (path.split('/').pop() || path).toLowerCase();
  return base === 'ark-chat.json' || base === 'ark-meta.json';
}

export function flattenProjectFiles(files: ProjectFileMap): ProjectFileMap {
  const out: ProjectFileMap = {};
  for (const [k, v] of Object.entries(files)) {
    if (!k || typeof v !== 'string') continue;
    if (isInternalProjectFile(k)) continue;
    if (k.includes('/')) {
      out[normalizePath(k)] = v;
    } else if (/\.(tsx|ts|jsx)$/i.test(k)) {
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

  return `${codingInstructionsFor(userMessage, flat)}

Project: ${projectName || 'ARK project'}

Current files:
${fileSection}

${Object.values(flat).some(v => String(v || '').trim())
    ? 'The project already has files. Apply the latest user request on top of them. Do not recreate the app from scratch unless they asked to start over.'
    : ''}

User request:
${userMessage.trim()}`;
}

const LITE_CODING = `You are ARK in the Code workspace. Create working files now.

Format each file exactly:
@@@FILE path/to/file.ext
\`\`\`
...full file contents...
\`\`\`

Rules: for web UIs write index.html + css/styles.css + js/app.js (not one giant HTML file unless they asked for a single file). Complete runnable code. One short summary after files.`;

/** Shorter prompt for empty projects — faster on local GGUF. */
export function buildProjectCodingPromptLite(userMessage: string, projectName?: string): string {
  const target = classifyMobileTarget(userMessage);
  const extra = target ? `\n\n${mobileCodingRules(target)}` : '';
  return `${LITE_CODING}${extra}

Project: ${projectName || 'ARK project'}

User request:
${userMessage.trim()}`;
}

/** Human label for Explorer header while building. */
export function inferBuildLabel(message: string, projectName?: string): string {
  const t = String(message || '').toLowerCase();
  if (/\bcalculator\b/.test(t)) return 'Calculator';
  if (/\bcount(er|s)?\b/.test(t) && /\bclick(s|ing)?\b/.test(t)) return 'Click counter';
  if (/\brecipe\b|\bramen\b|\bcook\b/.test(t)) return 'Recipe';
  if (/\bhabit\b/.test(t)) return 'Habit tracker';
  if (/\bpet\b/.test(t)) return 'Pixel pet';
  if (/\bexpense\b|\bsplitter\b|\bowes\b/.test(t)) return 'Expense splitter';
  if (/\bplaylist\b|\bmusic player\b/.test(t)) return 'Music player';
  if (/\bportfolio\b/.test(t)) return 'Portfolio';
  if (/\bpomodoro\b/.test(t)) return 'Pomodoro';
  if (/\bquiz\b/.test(t)) return 'Quiz';
  if (/\btodo\b|\bto-do\b|\bto do\b/.test(t)) return 'To-do list';
  if (/\bdiscord\b/.test(t)) return 'Discord';
  const called = t.match(/\bcalled\s+([a-z0-9][a-z0-9 '-]{1,40})/i);
  if (called?.[1]) {
    return called[1].trim().replace(/\b\w/g, c => c.toUpperCase());
  }
  if (/\blanding page\b|\bcoffee\b|\bcafe\b/.test(t)) {
    return called?.[1] ? called[1] : 'Landing page';
  }
  if (/\bwebsite\b|\bweb page\b|\bhomepage\b/.test(t)) return 'Website';
  if (/\bpomodoro\b/.test(t) || (/\btimer\b/.test(t) && !/\brecipe\b/.test(t))) return 'Timer';
  if (/\bios\b|\biphone\b|\bipad\b/.test(t)) return 'iPhone app';
  if (/\bandroid\b|\bsamsung\b|\bplay store\b/.test(t)) return 'Android app';
  if (/\bapp\b|\bapplication\b/.test(t)) return 'App';
  if (/\bapi\b|\bbackend\b/.test(t)) return 'API';
  const stripped = String(message || '')
    .replace(/^(build|create|make|write)\s+(a\s+|an\s+)?(single\s+html\s+)?/i, '')
    .trim();
  if (stripped) {
    const clip = stripped.split(/[.!?]/)[0]?.trim() || stripped;
    return clip.charAt(0).toUpperCase() + clip.slice(1, 42);
  }
  const name = String(projectName || '').trim();
  if (name && !/^code$/i.test(name) && !/^code project$/i.test(name)) return name;
  return 'Project';
}

/** Planned file paths shown in Explorer before the model returns. */
export function planFilesForBuild(message: string): string[] {
  const t = String(message || '').toLowerCase();
  const mobile = classifyMobileTarget(message);
  if (mobile) return planMobileFiles(mobile, message);
  if (/\bpython\b|\.py\b/.test(t)) return ['main.py'];
  if (/\breact\b|\btsx\b/.test(t)) {
    return ['index.html', 'src/App.tsx', 'src/main.tsx', 'src/index.css'];
  }
  if (/\b(express|node\.js|nodejs)\b/.test(t) && /\b(server|api|backend)\b/.test(t)) {
    return ['package.json', 'server.js'];
  }
  const singleFile = /\bsingle[\s-]?file\b|\bone file\b|\ball in (one|a single)\b|\binline css\b/.test(t);
  if (singleFile) return ['index.html'];

  const files = ['index.html', 'css/styles.css', 'js/app.js'];
  if (/\babout\b/.test(t) && /\bpage\b/.test(t)) files.push('about.html');
  return files;
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
  const planned = planFilesForBuild(userMessage);
  const cssPath = planned.find(p => p.endsWith('.css')) || 'css/styles.css';
  const jsPath = planned.find(p => p.endsWith('.js')) || 'js/app.js';
  const edits: ParsedFileEdit[] = [];
  const seen = new Set<string>();

  const push = (pathRaw: string, content: string) => {
    const path = normalizePath(pathRaw);
    if (!path || !content.trim()) return;
    if (seen.has(path)) {
      const idx = edits.findIndex(e => e.path === path);
      if (idx >= 0) edits[idx] = { path, content: content.trim() };
      return;
    }
    seen.add(path);
    edits.push({ path, content: content.trim() });
  };

  const fences = reply.matchAll(/```([^\n`]*)\n([\s\S]*?)```/g);
  for (const f of fences) {
    const meta = String(f[1] || '').trim();
    const body = String(f[2] || '').trim();
    if (!body) continue;
    const pathHit = meta.match(/[A-Za-z0-9_./@+-]+\.[A-Za-z0-9]+/);
    if (pathHit?.[0] && /[./]/.test(pathHit[0])) {
      push(pathHit[0], body);
      continue;
    }
    const lang = (meta.split(/\s+/)[0] || '').toLowerCase();
    if (lang === 'css') push(cssPath, body);
    else if (lang === 'javascript' || lang === 'js') push(jsPath, body);
    else if (lang === 'html' || lang === 'htm') push('index.html', body);
    else if (lang === 'python' || lang === 'py') push('main.py', body);
    else if (lang === 'tsx') push('src/App.tsx', body);
    else if (lang === 'ts' || lang === 'typescript') push('src/main.ts', body);
    else if (lang === 'json') push('package.json', body);
  }

  if (edits.length === 1 && edits[0].path === 'index.html' && planned.length > 1) {
    return editsFromWorkingHtml(edits[0].content, planned);
  }
  return edits;
}

/** Build explorer tree from a flat path → content map. */
export function buildFileTreeFromPaths(files: ProjectFileMap): ProjectFileNode[] {
  const flat = flattenProjectFiles(files);
  const paths = Object.keys(flat).filter(p => p.includes('.'));
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

const CLICK_COUNTER_SCAFFOLD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Click counter</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .card { text-align: center; background: #1e293b; border-radius: 16px; padding: 32px 40px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
    p { margin: 0 0 8px; color: #94a3b8; font-size: 0.95rem; }
    #count { font-size: 3rem; font-weight: 700; margin: 8px 0 20px; color: #f8fafc; }
    button { font-size: 1rem; padding: 12px 28px; border: none; border-radius: 999px; cursor: pointer; background: #6366f1; color: #fff; font-weight: 600; }
    button:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="card">
    <p>Clicks</p>
    <div id="count">0</div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button id="btn" type="button">Add</button>
      <button id="reset" type="button" style="background:#334155">Reset</button>
    </div>
  </div>
  <script>
    let n = 0;
    const count = document.getElementById('count');
    document.getElementById('btn').addEventListener('click', () => {
      n += 1;
      count.textContent = String(n);
    });
    document.getElementById('reset').addEventListener('click', () => {
      n = 0;
      count.textContent = '0';
    });
  </script>
</body>
</html>`;

const TODO_SCAFFOLD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>To-do list</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; min-height: 100vh; display: grid; place-items: start center; padding: 40px 16px; }
    .card { width: min(420px, 100%); background: #1e293b; border-radius: 16px; padding: 22px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
    h1 { margin: 0 0 16px; font-size: 1.25rem; }
    form { display: flex; gap: 8px; margin-bottom: 14px; }
    input { flex: 1; border: 0; border-radius: 10px; padding: 10px 12px; background: #0f172a; color: #f8fafc; }
    button.add { border: 0; border-radius: 10px; padding: 10px 14px; background: #6366f1; color: #fff; font-weight: 600; cursor: pointer; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { display: flex; align-items: center; gap: 10px; background: #0f172a; border-radius: 10px; padding: 10px 12px; }
    li.done span { text-decoration: line-through; color: #64748b; }
    li span { flex: 1; }
    button.del { border: 0; background: transparent; color: #94a3b8; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>To-do</h1>
    <form id="form">
      <input id="task" placeholder="Add a task" autocomplete="off" />
      <button class="add" type="submit">Add</button>
    </form>
    <ul id="list"></ul>
  </div>
  <script>
    const list = document.getElementById('list');
    const form = document.getElementById('form');
    const input = document.getElementById('task');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const li = document.createElement('li');
      li.innerHTML = '<input type="checkbox"><span></span><button class="del" type="button">Delete</button>';
      li.querySelector('span').textContent = text;
      li.querySelector('input').addEventListener('change', (ev) => li.classList.toggle('done', ev.target.checked));
      li.querySelector('.del').addEventListener('click', () => li.remove());
      list.appendChild(li);
      input.value = '';
      input.focus();
    });
  </script>
</body>
</html>`;

export function buildDoneSummary(
  label: string,
  opts?: { continued?: boolean; stopped?: boolean; hadFiles?: boolean },
): string {
  if (opts?.stopped) {
    return opts.hadFiles
      ? `Stopped. I kept what was already in Explorer. Edit your prompt and send — I’ll continue from those files.`
      : `Stopped. Edit your prompt and send when you’re ready.`;
  }
  if (opts?.continued) {
    return `Updated **${label}** from your latest notes. Let me know if you want to change anything else.`;
  }
  return `I built **${label}**. It’s in Explorer — hit Start when you want to try it, or tell me what to change.`;
}

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function titleFromAsk(message: string) {
  const called = String(message || '').match(/\bcalled\s+([A-Za-z0-9][A-Za-z0-9 '-]{1,40})/);
  if (called?.[1]) return called[1].trim();
  return inferBuildLabel(message);
}

function pomodoroHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pomodoro</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #14080a; color: #ffe4e6; }
    .card { text-align: center; background: #1f1014; border: 1px solid #7f1d1d; border-radius: 20px; padding: 36px 40px; box-shadow: 0 20px 50px rgba(0,0,0,.45); }
    h1 { margin: 0 0 8px; font-size: 1.1rem; letter-spacing: .12em; text-transform: uppercase; color: #fb7185; }
    #time { font-size: 4rem; font-weight: 700; margin: 12px 0 22px; }
    .row { display: flex; gap: 10px; justify-content: center; }
    button { border: 0; border-radius: 999px; padding: 10px 18px; font-weight: 600; cursor: pointer; background: #be123c; color: #fff; }
    button.ghost { background: #3f1d24; color: #fecdd3; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Focus</h1>
    <div id="time">25:00</div>
    <div class="row">
      <button id="start" type="button">Start</button>
      <button id="pause" class="ghost" type="button">Pause</button>
      <button id="reset" class="ghost" type="button">Reset</button>
    </div>
  </div>
  <script>
    let left = 25 * 60, tick = null;
    const el = document.getElementById('time');
    function render() {
      const m = String(Math.floor(left / 60)).padStart(2, '0');
      const s = String(left % 60).padStart(2, '0');
      el.textContent = m + ':' + s;
    }
    document.getElementById('start').onclick = () => {
      if (tick) return;
      tick = setInterval(() => { if (left > 0) { left -= 1; render(); } else { clearInterval(tick); tick = null; } }, 1000);
    };
    document.getElementById('pause').onclick = () => { clearInterval(tick); tick = null; };
    document.getElementById('reset').onclick = () => { clearInterval(tick); tick = null; left = 25 * 60; render(); };
    render();
  </script>
</body>
</html>`;
}

function quizHtml(message: string) {
  const space = /\bspace\b|\bnasa\b|\bplanet\b/i.test(message);
  const qs: Array<[string, string[], number]> = space
    ? [
      ['Which planet is known as the Red Planet?', ['Mars', 'Venus', 'Jupiter'], 0],
      ['What is the hottest planet in our solar system?', ['Mercury', 'Venus', 'Mars'], 1],
      ['How many planets are in our solar system?', ['7', '8', '9'], 1],
      ['What does a light-year measure?', ['Time', 'Distance', 'Brightness'], 1],
      ['Which is the largest planet?', ['Saturn', 'Neptune', 'Jupiter'], 2],
    ]
    : [
      ['What does HTML stand for?', ['HyperText Markup Language', 'Home Tool Markup', 'Hyperlinks Text'], 0],
      ['Which one is a JavaScript keyword?', ['const', 'document-only', 'stylesheet'], 0],
      ['CSS is used for?', ['Structure', 'Styling', 'Databases'], 1],
      ['2 + 2 equals?', ['3', '4', '22'], 1],
      ['Which is a heading tag?', ['<p>', '<h1>', '<span>'], 1],
    ];
  const items = qs.map((q, i) => `
    <section class="q" data-a="${q[2]}">
      <p>${i + 1}. ${q[0]}</p>
      ${q[1].map((c, ci) => `<label><input type="radio" name="q${i}" value="${ci}" /> ${c}</label>`).join('')}
    </section>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quiz</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #050505; color: #f4f4f5; }
    main { max-width: 640px; margin: 0 auto; padding: 32px 18px 48px; }
    h1 { margin: 0 0 18px; }
    .q { background: #18181b; border: 1px solid #27272a; border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; display: grid; gap: 8px; }
    label { display: flex; gap: 8px; align-items: center; color: #d4d4d8; }
    button { border: 0; border-radius: 10px; padding: 12px 16px; background: #6366f1; color: #fff; font-weight: 600; cursor: pointer; }
    #score { margin-top: 14px; font-size: 1.15rem; }
  </style>
</head>
<body>
  <main>
    <h1>${space ? 'Space quiz' : 'Quiz'}</h1>
    ${items}
    <button id="go" type="button">See score</button>
    <p id="score"></p>
  </main>
  <script>
    document.getElementById('go').onclick = () => {
      const blocks = [...document.querySelectorAll('.q')];
      let n = 0;
      blocks.forEach(b => {
        const pick = b.querySelector('input:checked');
        if (pick && pick.value === b.dataset.a) n += 1;
      });
      document.getElementById('score').textContent = 'Score: ' + n + ' / ' + blocks.length;
    };
  </script>
</body>
</html>`;
}

function landingHtml(message: string) {
  const name = escapeHtml(titleFromAsk(message) || 'Nightshift');
  const coffee = /\bcoffee\b|\bcafe\b|\bshop\b/i.test(message);
  const drinks = coffee
    ? ['Nightshift Drip', 'Oat latte', 'Espresso', 'Mocha', 'Cold brew', 'House chai']
    : ['Signature one', 'House favorite', 'Seasonal', 'Classic', 'Sparkling', 'Dessert'];
  const hours = coffee ? 'Mon–Thu 7am–8pm · Fri–Sat 7am–11pm · Sun 8am–4pm' : 'Open daily 9am–9pm';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: #0c0a09; color: #f5f0e8; }
    header { min-height: 70vh; display: grid; place-items: center; text-align: center; padding: 48px 20px; background:
      radial-gradient(900px 420px at 50% -10%, #3f2a1c, transparent), #0c0a09; }
    h1 { font-size: clamp(2.4rem, 6vw, 4.2rem); margin: 0 0 10px; letter-spacing: .04em; }
    .sub { color: #d6c7b5; font-size: 1.1rem; }
    section { max-width: 820px; margin: 0 auto; padding: 28px 20px 8px; }
    h2 { font-size: 1.1rem; letter-spacing: .14em; text-transform: uppercase; color: #e7b989; }
    .hours { background: #1c1410; border: 1px solid #3f2e22; border-radius: 14px; padding: 16px 18px; }
    .menu { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    .item { background: #17110e; border: 1px solid #3f2e22; border-radius: 12px; padding: 14px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${name}</h1>
      <p class="sub">${coffee ? 'Coffee after dark.' : 'A dark landing page, built for this brief.'}</p>
    </div>
  </header>
  <section>
    <h2>Hours</h2>
    <p class="hours">${hours}</p>
  </section>
  <section>
    <h2>${coffee ? 'Menu' : 'Highlights'}</h2>
    <div class="menu">${drinks.map(d => `<div class="item">${d}</div>`).join('')}</div>
  </section>
</body>
</html>`;
}

function themedPageHtml(message: string) {
  const title = escapeHtml(titleFromAsk(message));
  const blurb = escapeHtml(String(message || '').replace(/\s+/g, ' ').slice(0, 180));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; font-family: system-ui, sans-serif; background: #0b1220; color: #e8eefc; display: grid; place-items: center; padding: 24px; }
    main { max-width: 560px; width: 100%; background: #121a2b; border: 1px solid #243047; border-radius: 18px; padding: 28px; }
    h1 { margin: 0 0 10px; }
    p { margin: 0; color: #9fb0cc; line-height: 1.55; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${blurb}</p>
  </main>
</body>
</html>`;
}

function recipeHtml(message: string) {
  const ramen = /\bramen\b/i.test(message);
  const title = ramen ? 'Spicy ramen' : escapeHtml(titleFromAsk(message) || 'Recipe');
  const ingredients = ramen
    ? ['Noodles', 'Chili oil', 'Garlic', 'Soft egg', 'Green onion', 'Broth']
    : ['Main ingredient', 'Aromatics', 'Salt', 'Oil', 'Garnish', 'Side'];
  const steps = ramen
    ? ['Boil noodles until springy.', 'Warm chili oil and garlic.', 'Pour broth, add noodles and egg.', 'Finish with green onion.']
    : ['Prep ingredients.', 'Cook the base.', 'Season to taste.', 'Plate and serve.'];
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #1c100c; color: #fde8d0; }
    main { max-width: 560px; margin: 0 auto; padding: 28px 18px 48px; }
    h1 { margin: 0 0 6px; }
    .sub { color: #e7b989; margin: 0 0 18px; }
    .card { background: #2a1812; border: 1px solid #5c331f; border-radius: 16px; padding: 16px; margin-bottom: 12px; }
    ul, ol { margin: 8px 0 0; padding-left: 18px; line-height: 1.6; }
    #time { font-size: 2.2rem; font-weight: 700; margin: 8px 0; }
    button { border: 0; border-radius: 999px; padding: 8px 14px; margin-right: 8px; background: #c2410c; color: #fff; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p class="sub">20-minute cook timer</p>
    <div class="card">
      <div id="time">20:00</div>
      <button id="start" type="button">Start</button>
      <button id="reset" type="button">Reset</button>
    </div>
    <div class="card"><strong>Ingredients</strong><ul>${ingredients.map(i => `<li>${i}</li>`).join('')}</ul></div>
    <div class="card"><strong>Steps</strong><ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol></div>
  </main>
  <script>
    let left = 20 * 60, tick = null;
    const el = document.getElementById('time');
    function render() {
      el.textContent = String(Math.floor(left / 60)).padStart(2,'0') + ':' + String(left % 60).padStart(2,'0');
    }
    document.getElementById('start').onclick = () => {
      if (tick) return;
      tick = setInterval(() => { if (left > 0) { left--; render(); } else { clearInterval(tick); tick = null; } }, 1000);
    };
    document.getElementById('reset').onclick = () => { clearInterval(tick); tick = null; left = 20 * 60; render(); };
    render();
  </script>
</body>
</html>`;
}

function habitHtml() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Habit tracker</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #052e16; color: #dcfce7; }
    main { max-width: 720px; margin: 0 auto; padding: 28px 16px; }
    h1 { margin: 0 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
    .cell { background: #14532d; border: 1px solid #166534; border-radius: 12px; min-height: 88px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
    .cell.on { background: #22c55e; color: #052e16; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>This week</h1>
    <div class="grid" id="grid">
      ${days.map(d => `<button class="cell" type="button" data-d="${d}"><span>${d}</span><span class="mark">○</span></button>`).join('')}
    </div>
  </main>
  <script>
    document.getElementById('grid').onclick = (e) => {
      const cell = e.target.closest('.cell'); if (!cell) return;
      cell.classList.toggle('on');
      cell.querySelector('.mark').textContent = cell.classList.contains('on') ? '✓' : '○';
    };
  </script>
</body>
</html>`;
}

function pixelPetHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pixel pet</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: ui-monospace, monospace; background: #0b1020; color: #e2e8f0; }
    .card { width: min(340px, 92vw); background: #111827; border: 3px solid #22d3ee; border-radius: 8px; padding: 18px; text-align: center; }
    #pet { font-size: 4rem; margin: 8px 0; image-rendering: pixelated; }
    .bar { height: 16px; background: #1f2937; border: 2px solid #334155; }
    .fill { height: 100%; width: 70%; background: #22c55e; }
    button { margin: 8px 4px 0; border: 2px solid #22d3ee; background: #0f172a; color: #67e8f9; padding: 8px 12px; cursor: pointer; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <div id="pet">🐱</div>
    <p>Hunger</p>
    <div class="bar"><div class="fill" id="fill"></div></div>
    <button id="feed" type="button">Feed</button>
    <button id="play" type="button">Play</button>
  </div>
  <script>
    let hunger = 70;
    const fill = document.getElementById('fill');
    const pet = document.getElementById('pet');
    function draw() { fill.style.width = hunger + '%'; fill.style.background = hunger < 30 ? '#ef4444' : '#22c55e'; }
    document.getElementById('feed').onclick = () => { hunger = Math.min(100, hunger + 18); pet.textContent = '😺'; draw(); };
    document.getElementById('play').onclick = () => { hunger = Math.max(0, hunger - 12); pet.textContent = '🙀'; draw(); };
    setInterval(() => { hunger = Math.max(0, hunger - 1); draw(); }, 2000);
    draw();
  </script>
</body>
</html>`;
}

function expenseHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Expense splitter</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #020617; color: #e2e8f0; }
    main { max-width: 520px; margin: 0 auto; padding: 24px 16px 48px; }
    h1 { margin: 0 0 14px; }
    form, .row { display: flex; gap: 8px; margin-bottom: 10px; }
    input { flex: 1; border: 0; border-radius: 10px; padding: 10px; background: #0f172a; color: #f8fafc; }
    button { border: 0; border-radius: 10px; padding: 10px 12px; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 12px; margin-top: 12px; }
    li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1e293b; }
  </style>
</head>
<body>
  <main>
    <h1>Split a bill</h1>
    <form id="person"><input id="pname" placeholder="Add a person" /><button type="submit">Add</button></form>
    <form id="bill"><input id="bname" placeholder="Bill name" /><input id="bamt" type="number" min="0" step="0.01" placeholder="Amount" /><button type="submit">Add bill</button></form>
    <div class="card"><strong>People</strong><ul id="people"></ul></div>
    <div class="card"><strong>Who owes</strong><ul id="owes"></ul></div>
  </main>
  <script>
    const people = [];
    const bills = [];
    function render() {
      document.getElementById('people').innerHTML = people.map(p => '<li>' + p + '</li>').join('') || '<li>Add someone</li>';
      const n = people.length || 1;
      const total = bills.reduce((s, b) => s + b.amt, 0);
      const share = total / n;
      document.getElementById('owes').innerHTML = people.map(p => '<li><span>' + p + '</span><span>$' + share.toFixed(2) + '</span></li>').join('') || '<li>No bills yet</li>';
    }
    document.getElementById('person').onsubmit = (e) => {
      e.preventDefault();
      const v = document.getElementById('pname').value.trim();
      if (!v) return;
      people.push(v); document.getElementById('pname').value = ''; render();
    };
    document.getElementById('bill').onsubmit = (e) => {
      e.preventDefault();
      const amt = parseFloat(document.getElementById('bamt').value);
      if (!amt) return;
      bills.push({ name: document.getElementById('bname').value || 'Bill', amt });
      document.getElementById('bname').value = ''; document.getElementById('bamt').value = ''; render();
    };
    render();
  </script>
</body>
</html>`;
}

function musicHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Music player</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #0a0a0a; color: #fafafa; }
    .card { width: min(380px, 92vw); background: #171717; border-radius: 18px; padding: 20px; }
    h1 { font-size: 1.1rem; margin: 0 0 12px; }
    .song { padding: 8px 10px; border-radius: 8px; cursor: pointer; }
    .song.on { background: #262626; color: #a3e635; }
    .bar { height: 8px; background: #262626; border-radius: 99px; overflow: hidden; margin: 14px 0; }
    .fill { height: 100%; width: 20%; background: #a3e635; }
    button { border: 0; border-radius: 999px; padding: 10px 18px; background: #a3e635; color: #052e16; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Playlist</h1>
    <div id="list"></div>
    <div class="bar"><div class="fill" id="fill"></div></div>
    <button id="toggle" type="button">Play</button>
  </div>
  <script>
    const songs = ['Night Drive', 'Glass Harbor', 'Low Battery', 'After Hours', 'Static Bloom'];
    let i = 0, playing = false, p = 20;
    const list = document.getElementById('list');
    function draw() {
      list.innerHTML = songs.map((s, n) => '<div class="song' + (n===i?' on':'') + '" data-i="'+n+'">'+(n+1)+'. '+s+'</div>').join('');
      document.getElementById('fill').style.width = p + '%';
      document.getElementById('toggle').textContent = playing ? 'Pause' : 'Play';
    }
    list.onclick = (e) => { const el = e.target.closest('.song'); if (!el) return; i = +el.dataset.i; p = 8; draw(); };
    document.getElementById('toggle').onclick = () => { playing = !playing; draw(); };
    setInterval(() => { if (playing) { p = Math.min(100, p + 2); draw(); } }, 400);
    draw();
  </script>
</body>
</html>`;
}

function portfolioHtml(message: string) {
  const name = escapeHtml((message.match(/\bnamed\s+([A-Za-z][A-Za-z '-]{1,40})/)?.[1] || 'Vale').trim());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name} — Portfolio</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #09090b; color: #f4f4f5; }
    header { padding: 64px 20px 28px; text-align: center; }
    h1 { margin: 0 0 8px; font-size: 2.4rem; }
    .grid { max-width: 860px; margin: 0 auto; padding: 0 16px 32px; display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
    .tile { height: 120px; border-radius: 12px; background: linear-gradient(135deg, #27272a, #3f3f46); }
    form { max-width: 420px; margin: 0 auto 48px; display: grid; gap: 8px; }
    input, textarea { border: 0; border-radius: 10px; padding: 10px; background: #18181b; color: #fafafa; }
    button { border: 0; border-radius: 10px; padding: 10px; background: #fafafa; color: #09090b; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <header>
    <h1>${name}</h1>
    <p>Photographer · available for work</p>
  </header>
  <div class="grid">${Array.from({ length: 6 }, (_, i) => `<div class="tile" style="opacity:${0.55 + i * 0.07}"></div>`).join('')}</div>
  <form onsubmit="event.preventDefault(); alert('Sent');">
    <input placeholder="Your name" required />
    <input type="email" placeholder="Email" required />
    <textarea rows="3" placeholder="A note"></textarea>
    <button type="submit">Contact</button>
  </form>
</body>
</html>`;
}

/** Full working HTML for a build prompt — unique to the ask, never an empty stub. */
export function htmlForBuildPrompt(userMessage: string): string {
  const ask = String(userMessage || '').toLowerCase();
  if (/\btodo\b|\bto-do\b|\bto do\b/.test(ask)) return TODO_SCAFFOLD;
  if (/\bcalculator\b/.test(ask)) return CALCULATOR_SCAFFOLD;
  if ((/\bcount(er|s)?\b/.test(ask) && /\bclick(s|ing)?\b/.test(ask)) || /\bclick counter\b/.test(ask)) {
    return CLICK_COUNTER_SCAFFOLD;
  }
  if (/\brecipe\b|\bramen\b/.test(ask)) return recipeHtml(userMessage);
  if (/\bhabit\b/.test(ask)) return habitHtml();
  if (/\bpet\b/.test(ask)) return pixelPetHtml();
  if (/\bexpense\b|\bsplitter\b|\bowes\b/.test(ask)) return expenseHtml();
  if (/\bplaylist\b|\bmusic player\b/.test(ask)) return musicHtml();
  if (/\bportfolio\b/.test(ask)) return portfolioHtml(userMessage);
  if (/\bpomodoro\b/.test(ask) || (/\btimer\b/.test(ask) && /\b25\b/.test(ask) && !/\brecipe\b/.test(ask))) {
    return pomodoroHtml();
  }
  if (/\bquiz\b/.test(ask)) return quizHtml(userMessage);
  if (/\blanding page\b|\bcoffee\b|\bcafe\b/.test(ask) || (/\bmenu\b/.test(ask) && /\bhours\b/.test(ask) && !/\brecipe\b/.test(ask))) {
    return landingHtml(userMessage);
  }
  return themedPageHtml(userMessage);
}

function splitWebScaffold(html: string): { html: string; css: string; js: string } {
  let css = '';
  let js = '';
  let out = String(html || '');
  out = out.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, body: string) => {
    const chunk = String(body || '').trim();
    if (chunk) css += (css ? '\n\n' : '') + chunk;
    return '';
  });
  out = out.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (_, body: string) => {
    const chunk = String(body || '').trim();
    if (chunk) js += (js ? '\n\n' : '') + chunk;
    return '';
  });
  out = out.replace(/\n{3,}/g, '\n\n');
  if (css) {
    out = /<\/head>/i.test(out)
      ? out.replace(/<\/head>/i, `  <link rel="stylesheet" href="css/styles.css" />\n</head>`)
      : `<link rel="stylesheet" href="css/styles.css" />\n${out}`;
  }
  if (js) {
    out = /<\/body>/i.test(out)
      ? out.replace(/<\/body>/i, `  <script src="js/app.js"></script>\n</body>`)
      : `${out}\n<script src="js/app.js"></script>`;
  }
  return { html: out.trim(), css, js };
}

export function editsFromWorkingHtml(html: string, planned: string[]): ParsedFileEdit[] {
  if (planned.length <= 1) {
    return [{ path: planned[0] || 'index.html', content: html }];
  }
  const split = splitWebScaffold(html);
  const edits: ParsedFileEdit[] = [{ path: 'index.html', content: split.html || html }];
  const cssPath = planned.find(p => p.endsWith('.css'));
  const jsPath = planned.find(p => p.endsWith('.js'));
  if (cssPath) edits.push({ path: cssPath, content: split.css || '/* styles */\n' });
  if (jsPath) edits.push({ path: jsPath, content: split.js || '// app\n' });
  return edits;
}

function pythonFallback(userMessage: string): string {
  const title = escapeHtml(titleFromAsk(userMessage)).replace(/&quot;/g, '"');
  return `# ${title}
# Local ARK project — run with: python main.py

def main():
    print(${JSON.stringify(titleFromAsk(userMessage))})

if __name__ == "__main__":
    main()
`;
}

function reactFallback(userMessage: string): ParsedFileEdit[] {
  const title = titleFromAsk(userMessage);
  return [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="src/index.css" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="src/main.tsx"></script>
</body>
</html>`,
    },
    {
      path: 'src/index.css',
      content: `* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
#root { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.card { background: #1e293b; border-radius: 16px; padding: 28px; max-width: 420px; }
button { border: 0; border-radius: 10px; padding: 10px 16px; background: #6366f1; color: #fff; font-weight: 600; cursor: pointer; }
`,
    },
    {
      path: 'src/App.tsx',
      content: `export default function App() {
  return (
    <div className="card">
      <h1>${title.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}</h1>
      <p>Ask ARK to change this React app.</p>
    </div>
  );
}
`,
    },
    {
      path: 'src/main.tsx',
      content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    },
  ];
}

/** Offline fallback when the brain times out or returns no file blocks. */
export function scaffoldFallbackEdits(userMessage: string, files?: ProjectFileMap): ParsedFileEdit[] {
  const mobile = classifyMobileTarget(userMessage);
  const nativeTree = files && Object.keys(files).some(p =>
    /ios\/[^/]+\/ContentView\.swift$/i.test(p) || /MainActivity\.kt$/i.test(p),
  );
  if (mobile && files && nativeTree) {
    const locked = layoutLockEdits(files, userMessage, mobile);
    if (locked.length) return locked;
    return [];
  }
  if (mobile) return mobileTemplateEdits(mobile, userMessage, inferBuildLabel(userMessage), files);
  const planned = planFilesForBuild(userMessage);
  if (planned.length === 1 && planned[0].endsWith('.py')) {
    return [{ path: 'main.py', content: pythonFallback(userMessage) }];
  }
  if (planned.some(p => p.endsWith('.tsx'))) {
    return reactFallback(userMessage);
  }
  return editsFromWorkingHtml(htmlForBuildPrompt(userMessage), planned);
}

/** Inline linked CSS/JS so the Start tab works from local files. */
export function composePreviewHtml(files: ProjectFileMap): string {
  const flat = flattenProjectFiles(files);
  let html = '';
  if (flat['ark-preview.html']?.trim()) html = flat['ark-preview.html'];
  if (!html.trim()) html = flat['index.html'] || '';
  if (!html.trim()) {
    const htmlPath = Object.keys(flat).find(p => /\.html?$/i.test(p) && !/node_modules/.test(p));
    html = htmlPath ? flat[htmlPath] : '';
  }
  if (!html.trim()) return '';

  html = html.replace(/<link([^>]*?)href=["']([^"']+\.css)["']([^>]*)>/gi, (full, pre, href) => {
    const key = normalizePath(String(href));
    const css = flat[key] || flat[key.split('/').pop() || ''] || '';
    if (!css) return full;
    return `<style>\n${css}\n</style>`;
  });
  html = html.replace(/<script([^>]*?)src=["']([^"']+\.js)["']([^>]*)>\s*<\/script>/gi, (full, _pre, src) => {
    const key = normalizePath(String(src));
    const js = flat[key] || flat[key.split('/').pop() || ''] || '';
    if (!js) return full;
    return `<script>\n${js}\n</script>`;
  });
  return html;
}

/** Pull completed + in-progress @@@FILE blocks from a streaming reply. */
export function extractStreamingFileEdits(partial: string): ParsedFileEdit[] {
  const found = parseFileEdits(partial);
  const lastAt = partial.lastIndexOf('@@@FILE');
  if (lastAt < 0) return found;
  const tail = partial.slice(lastAt);
  const header = tail.match(/^@@@FILE\s+([^\n\r]+)/);
  if (!header?.[1]) return found;
  const path = normalizePath(header[1]);
  if (!path.includes('.') || found.some(e => e.path === path)) return found;
  let body = tail.replace(/^@@@FILE\s+[^\n\r]+\s*/, '');
  body = body.replace(/^```[\w.+-]*\s*\n?/, '').replace(/```\s*$/, '');
  if (body.trim().length > 8) found.push({ path, content: body });
  return found;
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
    if (!path.includes('/')) files[base] = next;
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
