import { classifyMobileTarget, looksLikeWebsiteBuild, mobileCodingRules } from '@/lib/mobileTarget';
import { extractGreenfieldName } from '@/lib/chatIdeaIntent';
import { layoutLockEdits, planMobileFiles, simpleVisualPatchEdits } from '@/lib/mobileTemplates';
import { isLayoutLockAsk } from '@/lib/mobileDevices';
import {
  canonicalizeWebEdits,
  finalizeWebEdits,
  isPlaceholderJunkPath,
  prunePlaceholderJunk,
  reactUiMicroAskEdits,
  touchesPreviewServing,
  webMicroAskEdits,
} from '@/lib/webProjectCanon';
import { applyAgentPatches, parseAgentPatches } from '@/lib/arkAgentPatch';

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

const MAX_CONTEXT_CHARS = 12_000;
const MAX_FILE_CHARS = 3_200;
const MICRO_CONTEXT_CHARS = 4_500;
const SMALL_CONTEXT_CHARS = 8_000;
const OVERVIEW_CONTEXT_CHARS = 8_000;
const MICRO_FILE_CHARS = 2_400;
const FULL_PACK_MAX_FILES = 24;
const SMALL_PACK_MAX_FILES = 8;
const MICRO_PACK_MAX_FILES = 3;

const ENTRY_PRIORITY = [
  'package.json',
  'README.md',
  'readme.md',
  'index.html',
  'src/App.tsx',
  'src/main.tsx',
  'src/index.tsx',
  'electron/main.cjs',
  'electron/main.ts',
  'main.py',
  'engine.py',
];

export type CodeTurnSize = 'micro' | 'small' | 'full';

const LAYOUT_RULES = `Layout rules for simple pages:
- Center the main title with flex/grid on body or main (place-items: center; min-height: 100vh).
- Top-right controls: position: fixed; top: 1rem; right: 1rem; display: flex; gap: 0.5rem; z-index: 10.
- Do not float the title left. Do not leave Hello World stuck top-left unless the user asked for that.
- Keep HTML, CSS, and JS in sync (if you add .top-bar icons, include CSS for them).`;

const CODING_INSTRUCTIONS = `You are NOVA inside a developer project workspace. not a generic chatbot and not a local-engine toy.
Your job is to help the user build and change real software in this project.
Answer the user’s latest request directly (build / edit / fix / explain). Do not substitute a different feature, dump unrelated files, or “improve” something they did not ask for. If they only asked a question, answer it. do not invent file edits.
Interpret typos and misspellings generously (infer the intended words) and do not lecture about spelling unless they ask.

When the user asks you to build, add, remove, upgrade, fix, or change code, you MUST write real files. The left tree and Start preview only update when you write files.

**Edits to existing files (preferred):** SEARCH/REPLACE patches — smaller and safer than rewriting the whole file:
PATH: relative/file.ext
SEARCH:
exact old text from the file
REPLACE:
new text

You may also use:
<<<<<<< SEARCH
exact old text
=======
new text
>>>>>>> REPLACE

**New files or large scaffolds:** emit @@@FILE blocks with FULL file contents:

@@@FILE path/relative/to/project.ext
\`\`\`
...entire file contents here...
\`\`\`

If the user mentions GitHub or a remote repo, still write real files into this local project first. cloning/PRs can come after the files exist on disk.

Rules:
- Use real paths with folders: css/styles.css, js/app.js, src/App.tsx, package.json (forward slashes). Parent folders are created automatically.
- Change only what the user asked. Prefer SEARCH/REPLACE for small edits. Use @@@FILE full contents for creates or when most of the file must change.
- For a one-line CSS tweak, touch only the CSS (and HTML only if needed). Do not regenerate the whole app.
- Never create a folder named path/to. that phrase is not a real path. Always write index.html, css/styles.css, js/app.js (or src/…).
- For typical web UIs, split markup, styles, and behavior:
  - index.html. markup only; link css/styles.css and js/app.js
  - css/styles.css. all CSS
  - js/app.js. all JavaScript
- Only put CSS and JS inline in one index.html if the user asked for a single file.
- After the file blocks, write a short plain-language summary of what you changed and that they can press Start to preview. Never echo the user’s message.
- Never put “Summary:” paragraphs, changelog text, or assistant notes inside the HTML/CSS/JS page itself. only in the short chat summary after the files.
- Keep text readable on the background (dark bg → light text; light bg → dark text). Do not add a Theme Toggle unless the user asked for one.
- Match the ask: add new files/features, remove dead UI, upgrade the page, or fix a bug. Do not only patch unless that is what they asked.
- Empty projects: start from a blank working page and grow it. Do not refuse because the folder is empty.
- If the user is only asking a question (no code change), answer normally WITHOUT @@@FILE or SEARCH/REPLACE blocks.

${LAYOUT_RULES}`;

const CODING_INSTRUCTIONS_LITE = `You are NOVA Code. Edit ONLY what the user asked.
Interpret typos generously; do not lecture about spelling unless asked.

Prefer SEARCH/REPLACE for small edits to existing files (path + old + new). Use @@@FILE full contents only for new files or large rewrites.
Do not echo the user message. Do not dump tutorials.
Keep HTML/CSS/JS in sync.

Patch format:
PATH: css/styles.css
SEARCH:
old
REPLACE:
new

Or create:
@@@FILE index.html
\`\`\`
full file
\`\`\`

Use real paths (or src/… for React). Never write path/to/…. that is only an example people say in chat, not a folder.

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

/** Rank paths for the turn pack. never dump the whole tree alphabetically. */
export function rankFilesForTurnPack(
  flat: ProjectFileMap,
  userMessage: string,
  size: CodeTurnSize,
): string[] {
  const keys = Object.keys(flat).filter(k => !isInternalProjectFile(k) && !isPlaceholderJunkPath(k));
  if (!keys.length) return [];
  const limit = size === 'micro' ? MICRO_PACK_MAX_FILES : size === 'small' ? SMALL_PACK_MAX_FILES : FULL_PACK_MAX_FILES;
  const scores = new Map<string, number>();
  const bump = (path: string, n: number) => scores.set(path, (scores.get(path) || 0) + n);
  const lower = userMessage.toLowerCase();

  for (const ep of ENTRY_PRIORITY) {
    if (flat[ep]) bump(ep, 22);
    const nested = keys.find(k => k.endsWith(`/${ep}`));
    if (nested) bump(nested, 20);
  }

  const html = keys.find(k => /(^|\/)index\.html$/i.test(k)) || keys.find(k => /\.html?$/i.test(k));
  const css = keys.find(k => /(^|\/)(styles?|index)\.css$/i.test(k)) || keys.find(k => /\.css$/i.test(k));
  const js = keys.find(k => /(^|\/)app\.js$/i.test(k)) || keys.find(k => /\.js$/i.test(k) && !/node_modules/.test(k));

  for (const k of keys) {
    const base = k.split('/').pop() || k;
    if (lower.includes(k.toLowerCase())) bump(k, 28);
    else if (base.length >= 4 && lower.includes(base.toLowerCase())) bump(k, 18);
    if (/(^|\/)readme(\.md)?$/i.test(k)) bump(k, 16);
    if (/(^|\/)package\.json$/i.test(k)) bump(k, 14);
  }

  // Content tokens from the ask (cheap keyword hit — no embeddings).
  const tokens = lower
    .replace(/[^a-z0-9_./\s-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 8);
  if (tokens.length) {
    const scanLimit = Math.min(keys.length, 80);
    for (let i = 0; i < scanLimit; i++) {
      const k = keys[i]!;
      const body = String(flat[k] || '').toLowerCase().slice(0, 12_000);
      if (!body) continue;
      let hits = 0;
      for (const t of tokens) {
        if (body.includes(t)) hits += 1;
      }
      if (hits > 0) bump(k, 6 + hits * 4);
    }
  }

  // Bug-hunt hints: prefer chat/generating/stop-related sources when the user describes UI bugs.
  if (/\b(stop|generating|stuck|inflight|streaming|button|chat)\b/i.test(userMessage)) {
    for (const k of keys) {
      if (/AIChat\.tsx$/i.test(k) || /chatInflight/i.test(k) || /chatAgent/i.test(k)) bump(k, 32);
    }
  }

  if (size === 'micro') {
    if (/\b(background|color|colour|css|style)\b/i.test(userMessage) && css) bump(css, 30);
    if (html) bump(html, 14);
    if (css) bump(css, 12);
  } else if (size === 'small') {
    [html, css, js].forEach(p => { if (p) bump(p, 24); });
  } else {
    [html, css, js].forEach(p => { if (p) bump(p, 16); });
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const out: string[] = [];
  for (const p of ranked) {
    if (out.length >= limit) break;
    if (!out.includes(p)) out.push(p);
  }
  if (!out.length) return keys.slice(0, limit);
  return out;
}

function pickFilesForTurnSize(flat: ProjectFileMap, size: CodeTurnSize, userMessage: string): string[] {
  return rankFilesForTurnPack(flat, userMessage, size);
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
  const entries = picked.map(path => [path, flat[path]] as const);

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
    : '(empty project. create the files that are needed)';

  return `${codingInstructionsFor(userMessage, flat, size)}

Project: ${projectName || 'NOVA project'}
Turn size: ${size}. edit only what was asked; keep context small.

Current files:
${fileSection}

${Object.values(flat).some(v => String(v || '').trim())
    ? 'The project already has files. Apply the latest user request on top of them. Do not recreate the app from scratch unless they asked to start over.'
    : ''}

User request:
${userMessage.trim()}`;
}

/** Estimate tokens for the packed coding prompt (inner ring). */
export function estimateCodingTurnTokens(
  userMessage: string,
  files: ProjectFileMap,
  projectName?: string,
): number {
  const flat = flattenProjectFiles(files);
  if (!Object.keys(flat).length) {
    return Math.max(1, Math.ceil(buildProjectCodingPromptLite(userMessage, projectName).length / 4));
  }
  return Math.max(1, Math.ceil(buildProjectCodingPrompt(userMessage, files, projectName).length / 4));
}

/** Shorter prompt for empty projects. faster on local GGUF. */
export function buildProjectCodingPromptLite(userMessage: string, projectName?: string): string {
  const target = classifyMobileTarget(userMessage);
  const extra = target
    ? `\n\n${mobileCodingRules(target)}`
    : looksLikeWebsiteBuild(userMessage) || /\bhello\s*world\b|\bblank\s+page\b/i.test(userMessage)
      ? `\n\nThis is a website for the browser. MUST write index.html + css/styles.css + js/app.js with @@@FILE. Do not write Swift or Kotlin. Do not only give a tutorial.`
      : '';
  return `${CODING_INSTRUCTIONS_LITE}${extra}

Project: ${projectName || 'NOVA project'}

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
  if (/\b(?:vite|jsx)\b/.test(t) || /\.jsx\b/.test(t)) {
    return ['index.html', 'src/App.jsx', 'src/main.jsx', 'src/App.css', 'src/index.css'];
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
    let path = normalizePath(pathRaw);
    // Bare @@@FILE left the next code line as "path" — treat as App when it looks like source.
    if (
      !path
      || !path.includes('.')
      || /^(?:import|export|const|function|class|```)/i.test(String(pathRaw || '').trim())
    ) {
      const sniff = String(content || pathRaw || '');
      if (/export\s+default|function\s+App|const\s+App\s*=/i.test(sniff)) path = 'src/App.jsx';
      else if (/^\s*(?:\/\*|\.|body\s*\{|:root)/i.test(sniff)) path = 'src/App.css';
      else return;
    }
    if (!path || !path.includes('.') || path.length > 180) return;
    if (!/^[A-Za-z0-9_./@+-]+$/.test(path)) return;
    let body = scrubLeakedFileMarkers(content.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, ''));
    if (/\.json$/i.test(path) || /(^|\/)package\.json$/i.test(path)) {
      body = sanitizeJsonFileContent(path, body);
    }
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

  // @@@FILE path\n content until next @@@FILE, bare @@@ junk, or end (no fence)
  const atFileLoose = /@@@FILE\s+([^\n\r]+)\n([\s\S]*?)(?=\n@@@FILE\s+|\n@@@(?:\s|$)|$)/gi;
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

/** Prefer SEARCH/REPLACE patches when files are known; fall back to @@@FILE. */
export function parseFileEditsOrPatches(
  reply: string,
  files: ProjectFileMap = {},
): ParsedFileEdit[] {
  const patches = parseAgentPatches(reply);
  const full = parseFileEdits(reply);
  if (!patches.length) return full;
  const patched = applyAgentPatches(files, patches);
  if (!patched.updated.length) return full;
  const fromPatches = patched.updated.map((p) => ({ path: p, content: patched.files[p]! }));
  const patchedPaths = new Set(fromPatches.map((e) => e.path));
  return [...fromPatches, ...full.filter((e) => !patchedPaths.has(e.path))];
}

function workspacePaths(files?: ProjectFileMap): string[] {
  if (!files) return [];
  return Object.keys(files).filter(p => p.includes('.')).map(normalizePath);
}

function pickWorkspacePath(
  paths: string[],
  tests: Array<(p: string) => boolean>,
  fallback: string,
): string {
  for (const test of tests) {
    const hit = paths.find(test);
    if (hit) return hit;
  }
  return fallback;
}

function inferLangPath(lang: string, userMessage: string, existing?: ProjectFileMap): string {
  const planned = planFilesForBuild(userMessage);
  const paths = workspacePaths(existing);
  const lower = String(lang || '').toLowerCase();

  if (lower === 'css') {
    return pickWorkspacePath(
      paths,
      [
        p => /src\/App\.css$/i.test(p),
        p => /src\/index\.css$/i.test(p),
        p => /\.css$/i.test(p),
      ],
      planned.find(p => p.endsWith('.css')) || 'src/App.css',
    );
  }
  if (lower === 'jsx') {
    return pickWorkspacePath(
      paths,
      [
        p => /src\/App\.jsx$/i.test(p),
        p => /App\.jsx$/i.test(p),
        p => /\.jsx$/i.test(p),
      ],
      'src/App.jsx',
    );
  }
  if (lower === 'tsx') {
    return pickWorkspacePath(
      paths,
      [
        p => /src\/App\.tsx$/i.test(p),
        p => /App\.tsx$/i.test(p),
        p => /\.tsx$/i.test(p),
      ],
      'src/App.tsx',
    );
  }
  if (lower === 'javascript' || lower === 'js') {
    return pickWorkspacePath(
      paths,
      [
        p => /src\/main\.jsx$/i.test(p),
        p => /src\/App\.jsx$/i.test(p),
        p => /js\/app\.js$/i.test(p),
        p => /\.jsx?$/i.test(p),
      ],
      planned.find(p => p.endsWith('.js')) || 'js/app.js',
    );
  }
  if (lower === 'html' || lower === 'htm') {
    return pickWorkspacePath(paths, [p => /index\.html$/i.test(p)], 'index.html');
  }
  if (lower === 'python' || lower === 'py') return 'main.py';
  if (lower === 'ts' || lower === 'typescript') {
    return pickWorkspacePath(paths, [p => /src\/main\.ts$/i.test(p)], 'src/main.ts');
  }
  if (lower === 'json') {
    return pickWorkspacePath(paths, [p => /package\.json$/i.test(p)], 'package.json');
  }
  if (lower === 'md' || lower === 'markdown') {
    const fromAsk = String(userMessage || '').match(/\b([A-Za-z0-9_-]+\.md)\b/i)?.[1]
      || (/\breadme\b/i.test(userMessage) ? 'README.md' : null);
    return pickWorkspacePath(
      paths,
      [
        p => /readme\.md$/i.test(p),
        p => /\.md$/i.test(p),
      ],
      fromAsk || 'notes.md',
    );
  }
  return '';
}

function pathFromProseBeforeFence(reply: string, fenceIndex: number): string | null {
  const before = reply.slice(Math.max(0, fenceIndex - 280), fenceIndex);
  const backtick = before.match(/`([A-Za-z0-9_./@+-]+\.[A-Za-z0-9]+)`\s*:?\s*$/);
  if (backtick?.[1]) return backtick[1];
  const named = before.match(/(?:update|edit|modify|change|in)\s+([A-Za-z0-9_./@+-]+\.[A-Za-z0-9]+)\s*:?\s*$/i);
  if (named?.[1]) return named[1];
  return null;
}

/** When the model returns chat-style fences instead of @@@FILE blocks. */
export function extractChatStyleFileEdits(
  reply: string,
  userMessage: string,
  existingFiles?: ProjectFileMap,
): ParsedFileEdit[] {
  const planned = planFilesForBuild(userMessage);
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
    const prosePath = typeof f.index === 'number' ? pathFromProseBeforeFence(reply, f.index) : null;
    if (prosePath) {
      push(prosePath, body);
      continue;
    }
    const lang = (meta.split(/\s+/)[0] || '').toLowerCase();
    const inferred = inferLangPath(lang, userMessage, existingFiles);
    if (inferred) push(inferred, body);
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
      ? `Stopped. I kept what was already in Explorer. Edit your prompt and send. I’ll continue from those files.`
      : `Stopped. Edit your prompt and send when you’re ready.`;
  }
  if (opts?.continued) {
    return `Done. I updated the project. Press **Start** to see the preview.`;
  }
  const safe = String(label || 'Project').trim();
  // Never echo a full user ask as the project title in chat.
  const lookslikeAsk = /^(okay|ok|can you|please|change|add|remove|update|make)\b/i.test(safe)
    || safe.length > 48
    || /\?$/.test(safe);
  if (lookslikeAsk) {
    return `Done. I updated the project. Press **Start** to see the preview.`;
  }
  return `I built **${safe}**. It’s in Explorer. hit Start when you want to try it, or tell me what to change.`;
}

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function titleFromAsk(message: string) {
  // Prefer explicit product names from casual speech ("ShelfCircle sounds good").
  const named = extractGreenfieldName(message);
  if (named && !/^My (App|Website|Web App)$/i.test(named)) return named;
  const called = String(message || '').match(/\bcalled\s+([A-Za-z0-9][A-Za-z0-9 '-]{1,40})/);
  if (called?.[1]) return called[1].trim();
  const camel = String(message || '').match(/\b([A-Z][a-z]+[A-Z][A-Za-z0-9]+)\b/);
  if (camel?.[1] && !/^(HTML|CSS|JS|API)$/i.test(camel[1])) return camel[1];
  return inferBuildLabel(message);
}

/** Only patch an existing tree. Never invent Hello World / stock React / landings. */
export function scaffoldFallbackEdits(
  userMessage: string,
  files?: ProjectFileMap,
  opts?: { projectName?: string },
): ParsedFileEdit[] {
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
  const hasReactApp = Object.keys(flat).some(p => /(^|\/)App\.(jsx|tsx)$/i.test(p));

  if (hasReactApp && files) {
    const react = reactUiMicroAskEdits(flat, userMessage, { projectName: opts?.projectName });
    if (react.length) return react;
  }

  if (hasHtml) {
    const micro = webMicroAskEdits(flat, userMessage);
    if (micro.length) return micro;
    const visual = simpleVisualPatchEdits(flat, userMessage);
    if (visual.length) return visual;
  }

  return [];
}

/** Removed: never rewrite pages into Hello World / icon-bar shells. */
export function webUiLayoutPatchEdits(_files: ProjectFileMap, _userMessage: string): ParsedFileEdit[] {
  return [];
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

/** Removed: never invent a Hello World static site when the model blanks. */
export function webScaffoldFallbackEdits(_userMessage: string): ParsedFileEdit[] {
  return [];
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
    return /\{/.test(body) && /\}/.test(body) && !/\{\s*$/.test(body);
  }
  if (/\.(js|ts|tsx|jsx)$/i.test(path)) {
    if (body.length <= 40 || /(function|=>)\s*\{\s*$/.test(body)) return false;
    // Reject mid-write dumps so we never commit truncated App.* to disk.
    if (/export\s+default/i.test(body) && !/\}\s*;?\s*$/.test(body)) return false;
    if (/<[A-Za-z][\w.:-]*([^>'"`]|"[^"]*"|'[^']*')*$/.test(body)) return false;
    return true;
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

/** Final commit only. closed fences / finished HTML. Streaming preview may still show a draft. */
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
  if (/@@@FILE\b/i.test(t)) return true;
  if (/\b(?:emit|write|output)\b[\s\S]{0,40}\b(?:@@@FILE|file blocks?|complete file contents)\b/i.test(t)) return true;
  if (/\b(?:build|rewrite|create)\b[\s\S]{0,80}\b(?:src\/App\.|first real ui|product ui)\b/i.test(t)) return true;
  return /SEARCH\/REPLACE|<<<<<<< SEARCH/i.test(t);
}

function looksLikeFullUiBuildAsk(userMessage: string): boolean {
  return /\b(?:first real ui|from this brief|Emit COMPLETE @@@FILE|Build the first real UI|RETRY:.*unusable UI|product UI matching|rich|multi-?section|landing|marketing site|fully built)\b/i.test(
    String(userMessage || ''),
  );
}

/**
 * Local models sometimes balloon App.jsx with endless SVG path / attribute repeats.
 * Treat that as unusable so create retries instead of shipping junk.
 */
export function isPathologicalCodeSource(source: string | undefined | null): boolean {
  const s = String(source || '');
  if (s.length < 5000) return false;
  // Long file with a tiny alphabet (digits/dashes loops) is almost never real UI.
  if (s.length >= 8000 && new Set(s).size < 100) return true;
  // Any mid-file 28–48 char probe that appears dozens of times.
  const start = Math.floor(s.length / 3);
  for (let len = 28; len <= 48; len += 4) {
    for (let off = 0; off < 160; off += 16) {
      const probe = s.slice(start + off, start + off + len);
      if (probe.length < len) continue;
      if ((s.split(probe).length - 1) >= 40) return true;
    }
  }
  if (/\*\*CSS\b|```css|This completes the initial implementation/i.test(s)) return true;
  return false;
}

/** Too thin for a create/product UI pass — keep generating / failover instead of shipping a stub. */
export function isThinProductUiSource(
  appSource: string | undefined | null,
  briefOrAsk?: string,
): boolean {
  const s = String(appSource || '');
  const ask = String(briefOrAsk || '');
  const tags = s.match(/<[A-Za-z][\w.-]*/g) || [];
  if (isPathologicalCodeSource(s)) return true;
  // Exact / minimal visual specs (black screen + icon, etc.) are intentionally small.
  if (
    /\b(?:exact(?:ly)?|precisely|follow precisely|nothing else|no other|pure black|#000000|#1e1f22|near-black|centered icon|only\s+(?:this|these)\s+requirements|ONLY this piece|ONLY add)\b/i.test(ask)
  ) {
    return s.length < 80 || tags.length < 1;
  }
  const richBrief = /\b(?:landing|marketing|museum|store|shop|portfolio|animation|hero|multi-?section|fully built|premium|cinematic|gallery|editorial|twitch|streaming|live\s*stream|streamer|netflix|watch\s*page|browse|apple\.com|replica|exact\s+replica|pac-?man|game|three\.?js|3d|restaurant|bistro|bakery|cafe|menu|dishes?)\b/i.test(ask)
    || /\b(?:first real ui|from this brief|product UI matching)\b/i.test(ask);
  if (!richBrief) {
    // Simple tools/trackers: only reject truly tiny shells.
    return s.length < 1200 || tags.length < 12;
  }
  if (s.length < 2200) return true;
  if (tags.length < 28) return true;
  const sections = (s.match(/\b(?:header|nav|footer|section|aside|main|hero)\b/gi) || []).length
    + (s.match(/className=["'][^"']+/g) || []).length;
  if (s.length < 3500 && sections < 10) return true;
  return false;
}

/**
 * Local models often dump App.jsx / CSS without @@@FILE markers.
 * Wrap salvageable dumps so apply + incomplete checks can use them.
 */
export function coerceCodingFileReply(reply: string): string {
  let text = String(reply || '').trim();
  if (!text) return text;

  // Drop leading chatty greeting before file blocks (models often prepend it).
  text = text.replace(
    /^(?:Hello!?\s+How can I assist you today\??\s*)+/i,
    '',
  ).trim();
  // Drop echoed system prompt if the model still emitted file blocks after it.
  if (/@@@FILE\b/i.test(text) && /You are NOVA,/i.test(text)) {
    const fileAt = text.search(/@@@FILE\b/i);
    if (fileAt > 0) text = text.slice(fileAt).trim();
  }
  // Models sometimes put the marker inside a markdown comment/fence header.
  text = text.replace(/\/\/\s*@@@FILE\b/gi, '@@@FILE');
  text = text.replace(/<!--\s*@@@FILE\b/gi, '@@@FILE');
  // Close an open fence before the next @@@FILE (exact UI dumps often omit ```).
  text = text.replace(/(^|\n)@@@FILE\b/g, (full, lead, offset) => {
    if (offset === 0) return full;
    const before = text.slice(0, offset);
    const opens = (before.match(/```/g) || []).length;
    if (opens % 2 === 1) return `${lead}\`\`\`\n@@@FILE`;
    return full;
  });

  // Models often emit "@@@FILE" with no path before a fence or import dump.
  text = text.replace(
    /@@@FILE\s*(?:\r?\n)+(?=\s*(?:```|import\s|export\s|\/\*|\/\/))/gi,
    '@@@FILE src/App.jsx\n',
  );
  text = text.replace(
    /@@@FILE\s+(?:```[\w.+-]*|jsx|tsx|javascript|css)\s*\r?\n/gi,
    '@@@FILE src/App.jsx\n',
  );

  const parsed = parseFileEdits(text);
  // Exact/minimal UIs (black screen + icon) are often 180–350 chars — still usable.
  const hasUsableApp = parsed.some(
    (e) => /(?:^|\/)App\.(jsx|tsx)$/i.test(e.path) && String(e.content || '').length >= 160,
  );
  if (hasUsableApp) return text;

  const blocks: string[] = [];
  const takeFence = (re: RegExp, path: string) => {
    const m = re.exec(text);
    if (!m?.[1]?.trim()) return;
    const body = m[1].replace(/\r\n/g, '\n').trim();
    if (body.length < 40) return;
    blocks.push(`@@@FILE ${path}\n\`\`\`\n${body}\n\`\`\``);
  };

  takeFence(/```(?:jsx|tsx|javascript|js)\s*\n([\s\S]*?)```/i, 'src/App.jsx');
  takeFence(/```css\s*\n([\s\S]*?)```/i, 'src/App.css');

  if (!blocks.some((b) => /@@@FILE src\/App\.jsx/i.test(b))) {
    const appMatch = text.match(
      /((?:import\s+[^;]+;\s*)*)(?:export\s+default\s+function\s+App\s*\(|(?:const|let|var)\s+App\s*=\s*(?:async\s*)?\(|function\s+App\s*\()([\s\S]+)/i,
    );
    if (appMatch && appMatch[0].length >= 160) {
      let body = appMatch[0].trim();
      if (!/^import\s/i.test(body) && !/export\s+default/i.test(body)) {
        body = `import './App.css';\n${body}`;
      }
      if (!/export\s+default\s+App\b/i.test(body) && /(?:const|let|var)\s+App\s*=/.test(body)) {
        body = `${body}\nexport default App;`;
      }
      blocks.unshift(`@@@FILE src/App.jsx\n\`\`\`\n${body}\n\`\`\``);
    }
  }

  // Also salvage a CSS dump that never got a path.
  if (!blocks.some((b) => /@@@FILE src\/App\.css/i.test(b))) {
    const cssMatch = text.match(/(?:^|\n)((?:\.|\#|body|html|:root)[^{]*\{[\s\S]{200,})/);
    if (cssMatch?.[1]) {
      blocks.push(`@@@FILE src/App.css\n\`\`\`\n${cssMatch[1].trim()}\n\`\`\``);
    }
  }

  if (!blocks.length) return text;
  return `${blocks.join('\n\n')}\n`;
}

/** Local/cloud coding reply that asked for files but never closed them. */
export function codingOutputIncomplete(reply: string, userMessage: string): boolean {
  const raw = String(reply || '');
  const coerced = coerceCodingFileReply(raw);
  // Raw unclosed @@@FILE still counts as incomplete (even if coerce can't help).
  if (/@@@FILE\b/i.test(raw) && replyHasUnclosedFileBlock(raw)) return true;
  if (!codingPromptWantsFiles(userMessage)) return false;
  const closed = parseClosedFileEdits(coerced);
  if (closed.length > 0) {
    if (looksLikeFullUiBuildAsk(userMessage)) {
      const app = closed.find((e) => /(?:^|\/)App\.(jsx|tsx)$/i.test(e.path));
      if (app) {
        const s = app.content || '';
        const exactMinimal = /\b(?:exact(?:ly)?|precisely|follow precisely|pure black|#000000|centered icon|nothing else|no other)\b/i.test(
          String(userMessage || ''),
        );
        // Reject empty/search stubs at the router — thin-but-real UIs are retried in create flow.
        // Exact visual specs are intentionally short (often <400 chars).
        if (s.length < (exactMinimal ? 160 : 1800)) return true;
        if (!exactMinimal && isThinProductUiSource(s, userMessage)) return true;
        if (/placeholder=["']Search/i.test(s) && (s.match(/<[A-Za-z]/g) || []).length < 12) return true;
        if (/return\s*\(\s*<div\s+className=["']app["']\s*\/>\s*\)/i.test(s)) return true;
        // Split-component scaffolds without companion @@@FILE blocks break Preview.
        if (/from\s+['"]\.\/components\//i.test(s)) {
          const needed = [...s.matchAll(/from\s+['"](\.\/components\/[^'"]+)['"]/gi)].map((m) => m[1]);
          const emitted = closed.map((e) => e.path.replace(/\\/g, '/'));
          const missing = needed.some((rel) => {
            const base = rel.replace(/^\.\//, '');
            return !emitted.some((p) => p === base || p.endsWith(`/${base}`) || p.includes(base.replace(/^components\//, 'components/')));
          });
          if (missing) return true;
        }
      }
    }
    return false;
  }
  const html = extractStreamingHtml(coerced);
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

/** Natural-language Code chat reply. never dump source into the bubble. */
export function formatCodeChatReply(
  userMessage: string,
  changedPaths: string[],
  spoken?: string,
  opts?: { previewTouched?: boolean; surface?: 'chat' | 'code' },
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
  const surface = opts?.surface || 'code';
  const doneFooter = surface === 'chat'
    ? 'Refresh your browser tab to see the change.'
    : 'Press **Start** to see the preview.';

  if (changedPaths.length && previewOk) {
    const hello = /\bhello\s*world\b/i.test(ask) && /\b(build|create|make)\b/i.test(ask);
    const pizza = /\bpizza\b/i.test(ask);
    const structural = /\bONLY\s+add\b|\bserver\s+rail\b|\bchannel\s+(?:list|column)\b|\bchat\s+(?:pane|header|composer)\b|\bmember\s+list\b|\buser\s+bar\b/i.test(ask);
    const bg = /\bbackground\b/i.test(ask) && !structural;
    const search = /\bsearch\b/i.test(ask) && !structural;
    const rgb = /\b(rgb|multi[- ]?colou?r|gradient)\b/i.test(ask);
    const toggle = /\b(toggle|theme)\b/i.test(ask) && /\b(remove|delete)\b/i.test(ask);
    if (usable) return `${clean}\n\n${doneFooter}`;
    if (hello) return `Done. Hello World is ready. ${doneFooter}`;
    if (pizza) return `Done. updated the page text. ${doneFooter}`;
    if (bg) return `Done. background and colors are updated. ${doneFooter}`;
    if (search) return `Done. search is in the top-right. ${doneFooter}`;
    if (rgb) return `Done. multi-color title is applied. ${doneFooter}`;
    if (toggle) return `Done. removed the theme toggle. ${doneFooter}`;
    if (/\b(logo|icon)\b/i.test(ask) && /\b(center|middle|screen)\b/i.test(ask) && !structural) {
      return `Done. added the logo centered on screen. ${doneFooter}`;
    }
    if (/\b(icon|profile|account|center|logo|button)\b/i.test(ask) && !structural) {
      return `Done. updated the layout. ${doneFooter}`;
    }
    return `Done. I updated the project. ${doneFooter}`;
  }

  if (changedPaths.length && !previewOk) {
    return 'I wrote files, but they were not on the live preview page. Try the ask again. I’ll target index.html / css / js.';
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

/** Strip leftover @@@FILE markers / fence junk the model appends after a file body. */
export function scrubLeakedFileMarkers(content: string): string {
  let body = String(content || '');
  const nextFile = body.search(/\n@@@FILE\s+\S/i);
  if (nextFile >= 0) body = body.slice(0, nextFile);
  body = body.replace(/\n@@@[\s\S]*$/g, '');
  body = body.replace(/\s*@@@\s*$/g, '');
  // Model often appends ```css / **CSS… / This completes… after a valid App body.
  body = body.replace(/\n```(?:[a-z0-9_+-]*)?\s*[\s\S]*$/i, '');
  body = body.replace(/\n\*\*[^\n]{0,80}\*?\*?[\s\S]*$/g, '');
  body = body.replace(/\nThis completes[\s\S]*$/i, '');
  body = body.replace(/\n```\s*$/g, '');
  return body.trimEnd();
}

/** Repair / reject corrupt JSON bodies (especially package.json). */
export function sanitizeJsonFileContent(path: string, content: string): string {
  let body = scrubLeakedFileMarkers(content).trim();
  if (!body) return body;
  try {
    return `${JSON.stringify(JSON.parse(body), null, 2)}\n`;
  } catch {
    const start = body.search(/[\{\[]/);
    if (start < 0) return '';
    let depth = 0;
    let end = -1;
    let inStr = false;
    let esc = false;
    for (let i = start; i < body.length; i += 1) {
      const ch = body[i];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) return '';
    const sliced = body.slice(start, end + 1);
    try {
      return `${JSON.stringify(JSON.parse(sliced), null, 2)}\n`;
    } catch {
      console.warn('[NOVA] dropping invalid JSON write', path);
      return '';
    }
  }
}

/** Remove chat-style “Summary:” blobs the model sometimes writes into the page. */
export function sanitizeAppliedWebContent(path: string, content: string): string {
  let body = scrubLeakedFileMarkers(content);
  // Refuse pathological ballooned sources so create/retry can replace them.
  if (/\.(?:jsx?|tsx?|css)$/i.test(path) && isPathologicalCodeSource(body)) {
    console.warn('[NOVA] dropping pathological write', path, body.length);
    return '';
  }
  if (/\.json$/i.test(path) || /(^|\/)package\.json$/i.test(path)) {
    return sanitizeJsonFileContent(path, body);
  }
  if (/\.html?$/i.test(path)) {
    body = body.replace(/<p[^>]*>\s*Summary:\s*[\s\S]*?<\/p>/gi, '');
    body = body.replace(/Summary:\s*The text[\s\S]{0,500}/gi, '');
    body = body.replace(/<p[^>]*>\s*The text ['"]Hello[\s\S]*?<\/p>/gi, '');
  }
  if (/\.css$/i.test(path)) {
    body = body.replace(/\/\*\s*Summary:[\s\S]*?\*\//gi, '');
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
    // Don't clobber a good on-disk file with empty/corrupt sanitized output.
    if (!String(next || '').trim()) continue;
    const beforeLines = String(prev || '').split('\n');
    const afterLines = String(next || '').split('\n');
    const beforeCounts = new Map<string, number>();
    for (const line of beforeLines) beforeCounts.set(line, (beforeCounts.get(line) || 0) + 1);
    const afterCounts = new Map<string, number>();
    for (const line of afterLines) afterCounts.set(line, (afterCounts.get(line) || 0) + 1);
    let added = 0;
    let removed = 0;
    for (const key of new Set([...beforeCounts.keys(), ...afterCounts.keys()])) {
      const left = beforeCounts.get(key) || 0;
      const right = afterCounts.get(key) || 0;
      if (right > left) added += right - left;
      if (left > right) removed += left - right;
    }
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
