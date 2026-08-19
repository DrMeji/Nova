import { classifyMobileTarget, looksLikeWebsiteBuild, mobileCodingRules } from '@/lib/mobileTarget';
import { layoutLockEdits, planMobileFiles, simpleVisualPatchEdits } from '@/lib/mobileTemplates';
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
  fileDiffs: { path: string; added: number; removed: number }[];
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
  const extra = target
    ? `\n\n${mobileCodingRules(target)}`
    : looksLikeWebsiteBuild(userMessage)
      ? `\n\nThis is a website for the browser, not a native phone app. Write index.html + css/styles.css + js/app.js. Do NOT write Swift, Xcode, Kotlin, or Android Studio files.`
      : '';
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
  const extra = target
    ? `\n\n${mobileCodingRules(target)}`
    : looksLikeWebsiteBuild(userMessage)
      ? `\n\nThis is a website for the browser. Write index.html + css/styles.css + js/app.js. Do not write Swift or Kotlin.`
      : '';
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
  return [];
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

  // Closed markdown fences that name a path
  text = text.replace(/```(?:[\w.+-]*)?(?:\s+|:)[A-Za-z0-9_./@+-]+\.[A-Za-z0-9]+\s*\n[\s\S]*?```/g, '');
  text = text.replace(/```[\w.+-]*\s+(?:file|path)=["'][^"']+["']\s*\n[\s\S]*?```/gi, '');

  // Unclosed fence at the end of the bubble (truncated HTML/Swift/JS)
  text = text.replace(/```[\w.+-]*[^\n]*\n[\s\S]*$/g, (block) => (
    /```[\s\S]*```/.test(block.trim()) ? block : ''
  ));

  // Raw page dump if the model skipped @@@FILE
  text = text.replace(/<!DOCTYPE html[\s\S]*$/i, '');
  text = text.replace(/<html[\s>][\s\S]*$/i, '');

  // Huge leftover fences (inspect / accidental dumps)
  text = text.replace(/```[\s\S]*?```/g, block => (block.length > 400 ? '' : block));

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
  const fileDiffs: { path: string; added: number; removed: number }[] = [];

  for (const edit of edits) {
    const path = normalizePath(edit.path);
    const base = path.split('/').pop() || path;
    const prev =
      files[path]
      ?? files[base]
      ?? '';
    const next = edit.content;

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
