import { classifyMobileTarget, looksLikeWebsiteBuild, mobileCodingRules } from '@/lib/mobileTarget';
import { layoutLockEdits, planMobileFiles, simpleVisualPatchEdits } from '@/lib/mobileTemplates';
import { isLayoutLockAsk } from '@/lib/mobileDevices';
import {
  canonicalizeWebEdits,
  finalizeWebEdits,
  isPlaceholderJunkPath,
  prunePlaceholderJunk,
  touchesPreviewServing,
  webMicroAskEdits,
} from '@/lib/webProjectCanon';

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
  fileDiffs: { path: string; added: number; removed: number }[];
};

const MAX_CONTEXT_CHARS = 14_000;
const MAX_FILE_CHARS = 3_500;
const MICRO_CONTEXT_CHARS = 4_500;
const SMALL_CONTEXT_CHARS = 9_000;
const MICRO_FILE_CHARS = 2_800;

export type CodeTurnSize = 'micro' | 'small' | 'full';

const LAYOUT_RULES = `Layout rules for simple pages:
- Center the main title with flex/grid on body or main (place-items: center; min-height: 100vh).
- Top-right controls: position: fixed; top: 1rem; right: 1rem; display: flex; gap: 0.5rem; z-index: 10.
- Do not float the title left. Do not leave Hello World stuck top-left unless the user asked for that.
- Keep HTML, CSS, and JS in sync (if you add .top-bar icons, include CSS for them).`;

const CODING_INSTRUCTIONS = `You are ARK inside a developer project workspace — not a generic chatbot and not a local-engine toy.
Your job is to help the user build and change real software in this project.
Answer the user’s latest request directly (build / edit / fix / explain). Do not substitute a different feature, dump unrelated files, or “improve” something they did not ask for. If they only asked a question, answer it — do not invent file edits.

When the user asks you to build, add, remove, upgrade, fix, or change code, you MUST emit @@@FILE blocks with FULL file contents. Do not only explain how to create files. The left tree and Start preview only update when you write files.

Format every create/update exactly:

@@@FILE path/relative/to/project.ext
\`\`\`
...entire file contents here...
\`\`\`

Prefer small, correct diffs as full-file rewrites. If the user mentions GitHub or a remote repo, still write real files into this local project first — cloning/PRs can come after the files exist on disk.

Rules:
- Use real paths with folders: css/styles.css, js/app.js, src/App.tsx, package.json (forward slashes). Parent folders are created automatically.
- Never create a folder named path/to — that phrase is not a real path. Always write index.html, css/styles.css, js/app.js (or src/…).
- For typical web UIs, split markup, styles, and behavior:
  - index.html — markup only; link css/styles.css and js/app.js
  - css/styles.css — all CSS
  - js/app.js — all JavaScript
- Only put CSS and JS inline in one index.html if the user asked for a single file.
- After the file blocks, write a short plain-language summary of what you changed and that they can press Start to preview. Never echo the user’s message.
- Never put “Summary:” paragraphs, changelog text, or assistant notes inside the HTML/CSS/JS page itself — only in the short chat summary after the files.
- Keep text readable on the background (dark bg → light text; light bg → dark text). Do not add a Theme Toggle unless the user asked for one.
- Match the ask: add new files/features, remove dead UI, upgrade the page, or fix a bug. Do not only patch unless that is what they asked.
- Empty projects: start from a blank working page and grow it. Do not refuse because the folder is empty.
- If the user is only asking a question (no code change), answer normally WITHOUT @@@FILE blocks.

${LAYOUT_RULES}`;

const CODING_INSTRUCTIONS_LITE = `You are ARK Code. Edit ONLY what the user asked.

Output @@@FILE path + COMPLETE file content for each changed file. Do not rewrite unrelated files.
Do not echo the user message. Do not dump tutorials.
Keep HTML/CSS/JS in sync.

Format:
@@@FILE index.html
\`\`\`
full file
\`\`\`

@@@FILE css/styles.css
\`\`\`
full file
\`\`\`

@@@FILE js/app.js
\`\`\`
full file
\`\`\`

Use those real paths (or src/… for React). Never write path/to/… — that is only an example people say in chat, not a folder.

Then one short chat summary only (no code). Press Start to preview. Never write Summary text into the page files.

${LAYOUT_RULES}`;

/** micro = color/text tweak; small = icons/layout; full = scaffold / multi-page. */
export function classifyCodeTurnSize(userMessage: string, files?: ProjectFileMap): CodeTurnSize {
  const t = String(userMessage || '').trim();
  if (!t) return 'full';
  const flat = files ? flattenProjectFiles(files) : {};
  const empty = Object.keys(flat).filter(p => !isInternalProjectFile(p)).length === 0;

  if (empty || /\bhello\s*world\b|\bblank\s+page\b|\bscaffold\b|\bcoffee\s*&?\s*go\b|\bfull\s+(site|website|app)\b/i.test(t)) {
    return 'full';
  }
  if (looksLikeWebsiteBuild(t) && /\b(build|create|make|start)\b/i.test(t) && !/\b(change|add|update|fix|icon|background|center)\b/i.test(t)) {
    return 'full';
  }
  if (/\b(new page|another page|multi-?page|landing page|menu section|contact form|settings page)\b/i.test(t)) {
    return 'full';
  }

  const micro =
    /\b(background|color|colour|font-size|rename|title text|text color)\b/i.test(t)
    && !/\b(icon|button|search|profile|header|layout|center|add|create)\b/i.test(t);
  if (micro) return 'micro';

  if (/\b(icon|search|profile|account|center|middle|top[- ]?right|layout|button|header|navbar)\b/i.test(t)) {
    return 'small';
  }
  if (/\b(change|update|set|make|add|fix|edit|switch)\b/i.test(t) && Object.keys(flat).length > 0) {
    return 'small';
  }
  return 'full';
}

function pickFilesForTurnSize(flat: ProjectFileMap, size: CodeTurnSize, userMessage: string): string[] {
  const keys = Object.keys(flat).filter(k => !isInternalProjectFile(k));
  if (!keys.length) return [];
  const html = keys.find(k => /(^|\/)index\.html$/i.test(k)) || keys.find(k => /\.html?$/i.test(k));
  const css = keys.find(k => /(^|\/)(styles?|index)\.css$/i.test(k)) || keys.find(k => /\.css$/i.test(k));
  const js = keys.find(k => /(^|\/)app\.js$/i.test(k)) || keys.find(k => /\.js$/i.test(k) && !/node_modules/.test(k));

  if (size === 'micro') {
    if (/\b(background|color|colour|css|style)\b/i.test(userMessage) && css) return [css, html].filter(Boolean) as string[];
    if (html) return [html, css].filter(Boolean) as string[];
    return keys.slice(0, 2);
  }
  if (size === 'small') {
    const picked = [html, css, js].filter(Boolean) as string[];
    return picked.length ? picked : keys.slice(0, 3);
  }
  return keys;
}

function normalizePath(raw: string): string {
  return raw
    .trim()
    .replace(/^[`"'[\(]+|[`"'][\)]+$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function codingInstructionsFor(userMessage: string, files: ProjectFileMap, size: CodeTurnSize = 'full'): string {
  const base = size === 'full' ? CODING_INSTRUCTIONS : CODING_INSTRUCTIONS_LITE;
  const target = classifyMobileTarget(userMessage)
    || (Object.keys(files).some(p => /\.swift$|\.pbxproj$/i.test(p)) && Object.keys(files).some(p => /\.kt$|androidmanifest/i.test(p))
      ? 'both'
      : Object.keys(files).some(p => /\.swift$|\.pbxproj$/i.test(p))
        ? 'ios'
        : Object.keys(files).some(p => /\.kt$|androidmanifest/i.test(p))
          ? 'android'
          : null);
  const extra = target
    ? `\n\n${mobileCodingRules(target)}`
    : looksLikeWebsiteBuild(userMessage) || /\bhello\s*world\b|\bblank\s+page\b/i.test(userMessage)
      ? `\n\nThis is a website for the browser, not a native phone app. You MUST write index.html + css/styles.css + js/app.js with @@@FILE blocks. Do NOT write Swift, Xcode, Kotlin, or Android Studio files. Do not only give a tutorial.`
      : '';
  return `${base}${extra}`;
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
  const size = classifyCodeTurnSize(userMessage, files);
  if (Object.keys(flat).length === 0) {
    return buildProjectCodingPromptLite(userMessage, projectName);
  }

  const budget = size === 'micro' ? MICRO_CONTEXT_CHARS : size === 'small' ? SMALL_CONTEXT_CHARS : MAX_CONTEXT_CHARS;
  const fileCap = size === 'full' ? MAX_FILE_CHARS : MICRO_FILE_CHARS;
  const picked = pickFilesForTurnSize(flat, size, userMessage);
  const entries = (size === 'full'
    ? Object.keys(flat).sort()
    : picked
  ).map(path => [path, flat[path]] as const);

  let used = 0;
  const chunks: string[] = [];
  for (const [path, content] of entries) {
    if (!content) continue;
    const body =
      content.length > fileCap
        ? `${content.slice(0, fileCap)}\n/* …truncated… */`
        : content;
    const block = `--- ${path} ---\n${body}`;
    if (used + block.length > budget) {
      if (size === 'full') chunks.push(`--- ${path} ---\n/* omitted for size */`);
      continue;
    }
    chunks.push(block);
    used += block.length;
  }

  const fileSection = chunks.length
    ? chunks.join('\n\n')
    : '(empty project — create the files that are needed)';

  return `${codingInstructionsFor(userMessage, flat, size)}

Project: ${projectName || 'ARK project'}
Turn size: ${size} — edit only what was asked; keep context small.

Current files:
${fileSection}

${Object.values(flat).some(v => String(v || '').trim())
    ? 'The project already has files. Apply the latest user request on top of them. Do not recreate the app from scratch unless they asked to start over.'
    : ''}

User request:
${userMessage.trim()}`;
}

/** Shorter prompt for empty projects — faster on local GGUF. */
export function buildProjectCodingPromptLite(userMessage: string, projectName?: string): string {
  const target = classifyMobileTarget(userMessage);
  const extra = target
    ? `\n\n${mobileCodingRules(target)}`
    : looksLikeWebsiteBuild(userMessage) || /\bhello\s*world\b|\bblank\s+page\b/i.test(userMessage)
      ? `\n\nThis is a website for the browser. MUST write index.html + css/styles.css + js/app.js with @@@FILE. Do not write Swift or Kotlin. Do not only give a tutorial.`
      : '';
  return `${CODING_INSTRUCTIONS_LITE}${extra}

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
    return `Done — I updated the project. Press **Start** to see the preview.`;
  }
  const safe = String(label || 'Project').trim();
  // Never echo a full user ask as the project title in chat.
  const lookslikeAsk = /^(okay|ok|can you|please|change|add|remove|update|make)\b/i.test(safe)
    || safe.length > 48
    || /\?$/.test(safe);
  if (lookslikeAsk) {
    return `Done — I updated the project. Press **Start** to see the preview.`;
  }
  return `I built **${safe}**. It’s in Explorer — hit Start when you want to try it, or tell me what to change.`;
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
    return simpleVisualPatchEdits(files, userMessage);
  }

  const flat = files ? flattenProjectFiles(files) : {};
  const hasHtml = Object.keys(flat).some(p => /\.html?$/i.test(p));

  // Existing project: micro-asks first (bg, search bar, rename…), then layout, then color.
  if (hasHtml) {
    const micro = webMicroAskEdits(flat, userMessage);
    if (micro.length) return micro;
    const layout = webUiLayoutPatchEdits(flat, userMessage);
    if (layout.length) return layout;
    const visual = simpleVisualPatchEdits(flat, userMessage);
    if (visual.length) return visual;
  }

  // Empty / new web build: always create real HTML/CSS/JS so Start works.
  if (!hasHtml && wantsProjectFileEdits(userMessage)) {
    return webScaffoldFallbackEdits(userMessage);
  }
  if (!hasHtml && (looksLikeWebsiteBuild(userMessage) || /\bhello\s*world\b|\bblank\s+page\b/i.test(userMessage))) {
    return webScaffoldFallbackEdits(userMessage);
  }
  return [];
}

/**
 * Local patch for “center title + top-right search/profile icons” when the model fails.
 * Rewrites the three web files as a coherent page so preview does not go blank.
 */
export function webUiLayoutPatchEdits(files: ProjectFileMap, userMessage: string): ParsedFileEdit[] {
  const t = String(userMessage || '');
  const wantsIcons = /\b(search|profile|account)\b/i.test(t) && /\b(icon|button|top|corner|right)\b/i.test(t);
  const wantsCenter = /\b(center|middle|centred|centered)\b/i.test(t);
  if (!wantsIcons && !wantsCenter) return [];

  const flat = flattenProjectFiles(files);
  const htmlPath = Object.keys(flat).find(p => /(^|\/)index\.html$/i.test(p))
    || Object.keys(flat).find(p => /\.html?$/i.test(p));
  if (!htmlPath) return [];
  const cssPath = Object.keys(flat).find(p => /(^|\/)(styles?|index)\.css$/i.test(p)) || 'css/styles.css';
  const jsPath = Object.keys(flat).find(p => /(^|\/)app\.js$/i.test(p)) || 'js/app.js';

  // Preserve background/color hints from current CSS when possible.
  const prevCss = flat[cssPath] || '';
  const bg = prevCss.match(/body\s*\{[^}]*background(?:-color)?\s*:\s*([^;]+)/i)?.[1]?.trim() || '#0b1220';
  const fg = prevCss.match(/body\s*\{[^}]*\bcolor\s*:\s*([^;]+)/i)?.[1]?.trim() || '#e8eefc';
  const titleMatch = (flat[htmlPath] || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const heading = (titleMatch?.[1] || 'Hello World').replace(/<[^>]+>/g, '').trim() || 'Hello World';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(heading)}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <header class="top-bar" aria-label="Toolbar">
    <button type="button" class="icon-btn" id="btn-search" title="Search" aria-label="Search">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
      </svg>
    </button>
    <button type="button" class="icon-btn" id="btn-profile" title="Account" aria-label="Account">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
      </svg>
    </button>
  </header>
  <main class="page">
    <h1>${escapeHtml(heading)}</h1>
  </main>
  <script src="js/app.js"></script>
</body>
</html>
`;

  const css = `* { box-sizing: border-box; }
html, body {
  margin: 0;
  min-height: 100%;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
  background: ${bg};
  color: ${fg};
}
.top-bar {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 10;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.icon-btn {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.06);
  color: inherit;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.icon-btn:hover { background: rgba(255,255,255,0.12); }
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
  text-align: center;
}
h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}
`;

  const js = `document.documentElement.dataset.arkReady = '1';
document.getElementById('btn-search')?.addEventListener('click', () => {
  window.alert('Search');
});
document.getElementById('btn-profile')?.addEventListener('click', () => {
  window.alert('Account');
});
`;

  return [
    { path: htmlPath.includes('/') ? htmlPath : 'index.html', content: html },
    { path: cssPath.includes('/') ? cssPath : 'css/styles.css', content: css },
    { path: jsPath.includes('/') ? jsPath : 'js/app.js', content: js },
  ];
}

/** True when the user asked Code to build or change files (not just explain). */
export function wantsProjectFileEdits(message: string): boolean {
  const t = String(message || '').trim();
  if (!t) return false;
  if (/Do NOT write @@@FILE/i.test(t)) return false;
  if (/\b(what is|explain|describe|tell me about|how does|why)\b/i.test(t)
    && !/\b(build|create|make|add|change|fix|edit)\b/i.test(t)) {
    return false;
  }
  if (/\bhello\s*world\b|\bblank\s+page\b|\blanding\s*page\b/i.test(t)) return true;
  if (looksLikeWebsiteBuild(t)) return true;
  if (/\b(build|create|make|scaffold|start)\b[\s\S]{0,80}\b(app|website|site|page|tool|ui|html)\b/i.test(t)) {
    return true;
  }
  if (/\b(change|update|set|make|turn|edit|switch|add|fix|rewrite|remove|delete)\b.{0,64}\b(background|color|css|style|theme|dark|light|settings|page|button|header|title|icon|search|profile|account|center|toggle|rgb|gradient)\b/i.test(t)) {
    return true;
  }
  if (/\bsearch\s*bar\b/i.test(t)) return true;
  if (/\b(search|profile|account)\b/i.test(t) && /\b(icon|button|top|corner|bar)\b/i.test(t)) return true;
  if (/\b(add|create|build)\b.{0,48}\b(settings|feature|page|component|section)\b/i.test(t)) return true;
  return false;
}

/** Static HTML/CSS/JS starter — Start preview works with no npm. */
export function webScaffoldFallbackEdits(userMessage: string): ParsedFileEdit[] {
  const title = titleFromAsk(userMessage);
  const hello = /\bhello\s*world\b/i.test(userMessage);
  const heading = hello ? 'Hello World' : title;
  const safeHeading = escapeHtml(heading);
  const safeTitle = escapeHtml(title);
  return [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <main class="page">
    <h1>${safeHeading}</h1>
    <p class="tagline">Built in ARK Code — press Start to preview, then ask for changes.</p>
  </main>
  <script src="js/app.js"></script>
</body>
</html>
`,
    },
    {
      path: 'css/styles.css',
      content: `* { box-sizing: border-box; }
html, body {
  margin: 0;
  min-height: 100%;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
  background: #0b1220;
  color: #e8eefc;
}
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
  text-align: center;
}
h1 {
  margin: 0 0 0.75rem;
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}
.tagline {
  margin: 0;
  max-width: 28rem;
  color: #9db0d0;
  line-height: 1.5;
}
`,
    },
    {
      path: 'js/app.js',
      content: `// ${heading.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}
document.documentElement.dataset.arkReady = '1';
`,
    },
  ];
}

/** Inline linked CSS/JS so the Start tab works from local files. */
export function composePreviewHtml(files: ProjectFileMap): string {
  const flat = flattenProjectFiles(prunePlaceholderJunk(files));
  let html = '';
  if (flat['ark-preview.html']?.trim()) html = flat['ark-preview.html'];
  if (!html.trim()) html = flat['index.html'] || '';
  if (!html.trim()) {
    const htmlPath = Object.keys(flat).find(p => /\.html?$/i.test(p) && !isPlaceholderJunkPath(p));
    html = htmlPath ? flat[htmlPath] : '';
  }
  if (!html.trim()) return '';

  html = html.replace(/<link([^>]*?)href=["']([^"']+\.css)["']([^>]*)>/gi, (full, pre, href) => {
    const key = normalizePath(String(href));
    if (isPlaceholderJunkPath(key)) return full;
    const css = flat[key] || flat[key.split('/').pop() || ''] || '';
    if (!css) return full;
    return `<style>\n${css}\n</style>`;
  });
  html = html.replace(/<script([^>]*?)src=["']([^"']+\.js)["']([^>]*)>\s*<\/script>/gi, (full, _pre, src) => {
    const key = normalizePath(String(src));
    if (isPlaceholderJunkPath(key)) return full;
    const js = flat[key] || flat[key.split('/').pop() || ''] || '';
    if (!js) return full;
    return `<script>\n${js}\n<\/script>`;
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

export function fileContentLooksComplete(path: string, content: string): boolean {
  const body = String(content || '').trim();
  if (body.length < 24) return false;
  if (/\.html?$/i.test(path)) {
    return /<\/html>/i.test(body);
  }
  if (/\.swift$/i.test(path)) {
    return /struct\s+\w+|class\s+\w+|func\s+\w+/.test(body) && body.length > 80;
  }
  if (/\.(kt|kts)$/i.test(path)) {
    return /\b(fun|class|@Composable)\b/.test(body) && body.length > 80;
  }
  if (/\.css$/i.test(path)) {
    return /\{/.test(body) && /\}/.test(body);
  }
  if (/\.(js|ts|tsx|jsx)$/i.test(path)) {
    return body.length > 40 && !/(function|=>)\s*\{\s*$/.test(body);
  }
  return body.length > 40;
}

function lastFileBlockClosed(reply: string): boolean {
  const text = reply || '';
  const lastAt = text.lastIndexOf('@@@FILE');
  if (lastAt < 0) {
    const html = extractStreamingHtml(text);
    if (html && /<html[\s>]/i.test(html)) return /<\/html>/i.test(html);
    return true;
  }
  const tail = text.slice(lastAt);
  const ticks = tail.match(/```/g) || [];
  if (ticks.length >= 2) return true;
  const path = tail.match(/^@@@FILE\s+([^\n\r]+)/)?.[1] || '';
  const body = tail.replace(/^@@@FILE\s+[^\n\r]+\s*/, '').replace(/^```[\w.+-]*\s*\n?/, '');
  return fileContentLooksComplete(normalizePath(path), body);
}

export function replyHasUnclosedFileBlock(reply: string): boolean {
  return !lastFileBlockClosed(reply);
}

/** Final commit only — closed fences / finished HTML. Streaming preview may still show a draft. */
export function parseClosedFileEdits(reply: string): ParsedFileEdit[] {
  const all = parseFileEdits(reply);
  const lastAt = (reply || '').lastIndexOf('@@@FILE');
  const lastPath = lastAt >= 0
    ? normalizePath((reply || '').slice(lastAt).match(/^@@@FILE\s+([^\n\r]+)/)?.[1] || '')
    : '';
  const dropLast = replyHasUnclosedFileBlock(reply) && lastPath;
  return all.filter(e => {
    if (dropLast && e.path === lastPath) return false;
    return fileContentLooksComplete(e.path, e.content);
  });
}

export function codingPromptWantsFiles(userMessage: string): boolean {
  const t = String(userMessage || '');
  if (/Do NOT write @@@FILE/i.test(t)) return false;
  return /@@@FILE\s+path/i.test(t);
}

/** Local/cloud coding reply that asked for files but never closed them. */
export function codingOutputIncomplete(reply: string, userMessage: string): boolean {
  const text = String(reply || '');
  if (replyHasUnclosedFileBlock(text)) return true;
  if (!codingPromptWantsFiles(userMessage)) return false;
  if (parseClosedFileEdits(text).length > 0) return false;
  const html = extractStreamingHtml(text);
  if (html && fileContentLooksComplete('index.html', html)) return false;
  return true;
}

/** Strip file protocol from the chat bubble. Keeps English; drops closed and unclosed @@@FILE / HTML dumps. */
export function stripFileBlocks(reply: string): string {
  let text = String(reply || '');

  // Closed @@@FILE + fenced body
  text = text.replace(/@@@FILE\s+[^\n\r]+\s*```[\w.+-]*\s*\n[\s\S]*?```/gi, '');
  // Unclosed @@@FILE (no closing fence) through the next file or end of message
  text = text.replace(/@@@FILE\b[\s\S]*?(?=\n@@@FILE\b|$)/gi, '');
  text = text.replace(/^[ \t]*@@@FILE[^\n]*$/gim, '');

  // All markdown fences (code never belongs in the Code chat bubble)
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/```[\w.+-]*[^\n]*\n[\s\S]*$/g, '');

  // Raw page dump if the model skipped @@@FILE
  text = text.replace(/<!DOCTYPE html[\s\S]*$/i, '');
  text = text.replace(/<html[\s>][\s\S]*$/i, '');

  // CSS/JS dumps that leaked without fences
  text = text.replace(/(?:^|\n)\s*(?:body|html|main|h1|\.[\w-]+|#[\w-]+)\s*\{[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '\n');
  text = text.replace(/^(?:import |export |const |let |function |document\.|window\.)[^\n]*$/gim, '');

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/** Natural-language Code chat reply — never dump source into the bubble. */
export function formatCodeChatReply(
  userMessage: string,
  changedPaths: string[],
  spoken?: string,
  opts?: { previewTouched?: boolean },
): string {
  const ask = String(userMessage || '').replace(/^\[(?:Plan|Ask|Debug|Tasks)\]\s*/i, '').trim();
  const clean = stripFileBlocks(spoken || '');
  const echoesAsk = Boolean(ask)
    && clean.length > 8
    && (
      clean.toLowerCase().includes(ask.slice(0, 28).toLowerCase())
      || /from your latest notes/i.test(clean)
      || /^Updated\s+(Okay|Ok|Can you|Please)\b/i.test(clean)
    );
  const usable = clean
    && clean.length > 12
    && clean.length < 600
    && !echoesAsk
    && !/```|@@@FILE|^\s*(body|html)\s*\{/i.test(clean)
    && !looksLikeCodeDump(clean)
    && !/^Updated [\w./,\s-]+\.?$/i.test(clean)
    && !/\b(css|js|html)\/[\w.-]+\.(css|js|html?)\b/i.test(clean);

  const previewOk = opts?.previewTouched !== false;

  if (changedPaths.length && previewOk) {
    const hello = /\bhello\s*world\b/i.test(ask) && /\b(build|create|make)\b/i.test(ask);
    const pizza = /\bpizza\b/i.test(ask);
    const bg = /\bbackground\b/i.test(ask);
    const search = /\bsearch\b/i.test(ask);
    const rgb = /\b(rgb|multi[- ]?colou?r|gradient)\b/i.test(ask);
    const toggle = /\b(toggle|theme)\b/i.test(ask) && /\b(remove|delete)\b/i.test(ask);
    if (usable) return `${clean}\n\nPress **Start** to see the preview.`;
    if (hello) return 'Done — Hello World is ready. Press **Start** to open the preview.';
    if (pizza) return 'Done — updated the page text. Press **Start** to see it.';
    if (bg) return 'Done — background and colors are updated. Press **Start** to check the preview.';
    if (search) return 'Done — search is in the top-right. Press **Start** to see it.';
    if (rgb) return 'Done — multi-color title is applied. Press **Start** to see it.';
    if (toggle) return 'Done — removed the theme toggle. Press **Start** to check the preview.';
    if (/\b(icon|profile|account|center)\b/i.test(ask)) {
      return 'Done — layout updated. Press **Start** to see the preview.';
    }
    return `Done — I updated the project. Press **Start** to see the preview.`;
  }

  if (changedPaths.length && !previewOk) {
    return 'I wrote files, but they were not on the live preview page. Try the ask again — I’ll target index.html / css / js.';
  }

  if (usable) return clean;
  return 'I couldn’t apply file changes for that. Try a shorter ask, or say “build a hello world page”.';
}

function looksLikeCodeDump(text: string): boolean {
  const t = String(text || '');
  if ((t.match(/[{};]/g) || []).length >= 8) return true;
  if (/background-color\s*:|font-family\s*:|display\s*:\s*flex/i.test(t)) return true;
  return false;
}

/** Remove chat-style “Summary:” blobs the model sometimes writes into the page. */
export function sanitizeAppliedWebContent(path: string, content: string): string {
  let body = String(content || '');
  if (/\.html?$/i.test(path)) {
    body = body.replace(/<p[^>]*>\s*Summary:\s*[\s\S]*?<\/p>/gi, '');
    body = body.replace(/Summary:\s*The text[\s\S]{0,500}/gi, '');
    body = body.replace(/<p[^>]*>\s*The text ['"]Hello[\s\S]*?<\/p>/gi, '');
  }
  if (/\.css$/i.test(path)) {
    body = body.replace(/\/\*\s*Summary:[\s\S]*?\*\//gi, '');
    // Dark background + dark text → force readable foreground
    const darkBg = /body\s*\{[^}]*(?:background(?:-color)?\s*:\s*(?:#0|#1|#2|black)|background(?:-color)?\s*:\s*rgb\(\s*0)/i.test(body);
    const darkText = /(?:body|h1)\s*\{[^}]*\bcolor\s*:\s*(?:#0|#1|#2|#3|black)/i.test(body);
    if (darkBg && darkText) {
      body = body.replace(/(body\s*\{[^}]*?)\bcolor\s*:\s*[^;]+/i, '$1color: #f5f7fb');
      body = body.replace(/(h1\s*\{[^}]*?)\bcolor\s*:\s*[^;]+/i, '$1color: #f5f7fb');
    }
  }
  if (/\.js$/i.test(path)) {
    body = body.replace(/\/\*\s*Summary:[\s\S]*?\*\//gi, '');
    body = body.replace(/\/\/\s*Summary:.*$/gim, '');
  }
  return body;
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
  let files = prunePlaceholderJunk({ ...currentFiles });
  let nextTree = tree;
  let addedLines = 0;
  let removedLines = 0;
  const changedPaths: string[] = [];
  const fileDiffs: { path: string; added: number; removed: number }[] = [];

  const normalizedEdits = canonicalizeWebEdits(edits, files);

  for (const edit of normalizedEdits) {
    const path = normalizePath(edit.path);
    if (isPlaceholderJunkPath(path)) continue;
    const base = path.split('/').pop() || path;
    const prev =
      files[path]
      ?? files[base]
      ?? '';
    const next = sanitizeAppliedWebContent(path, edit.content);

    const added = Math.max(0, countLines(next) - countLines(prev));
    const removed = Math.max(0, countLines(prev) - countLines(next));
    addedLines += added;
    removedLines += removed;
    fileDiffs.push({ path, added, removed });

    files[path] = next;
    if (!path.includes('/')) files[base] = next;
    nextTree = ensurePathInTree(nextTree, path);
    changedPaths.push(path);
  }

  // Drop leftover placeholder folders from the tree map keys
  files = prunePlaceholderJunk(files);

  const summary = changedPaths.length
    ? `Updated ${changedPaths.length} file${changedPaths.length === 1 ? '' : 's'}: ${changedPaths.join(', ')}`
    : 'No file edits parsed from the model reply.';

  return {
    files,
    tree: nextTree,
    changedPaths,
    addedLines,
    removedLines,
    fileDiffs,
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
