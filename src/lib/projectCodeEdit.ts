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
