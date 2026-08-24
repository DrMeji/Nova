/**
 * Cursor-style folder catalog — list top level + light README/package.json peek.
 * Never imports thousands of files into chat context.
 */

import { parseFolderPathAsk, parseDesktopSubfolderAsk, type FolderPathRef } from '@/lib/folderPathAsk';
import { looksLikeInstalledAppsAsk } from '@/lib/pcExplore';
import { looksLikeAddFileDestinationClarify } from '@/lib/chatDiskIntent';
import { looksLikeConversationalPlanningAsk, looksLikeGreenfieldIdea } from '@/lib/chatIdeaIntent';
import { isProjectCreateBrief } from '@/lib/chatCreateBrief';
import { isBlockedDiskTargetName } from '@/lib/projectNames';

/** "What projects do I have on my PC / desktop?" — not installed-apps asks. */
export function looksLikeProjectsInventoryAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!/\bprojects?\b/i.test(t)) return false;
  if (isProjectCreateBrief(t)) return false;
  if (looksLikeInstalledAppsAsk(t)) return false;
  if (looksLikeGreenfieldIdea(t)) return false;
  if (/\b(?:work\s+on|start\s+work|implement|build|fix|edit|create\s+project|open\s+(?:the\s+)?(?:folder|project)|summarize|how it works|flag any)\b/i.test(t)) return false;
  // Soft product chat (“hobby project”, “auth for this project”) is not an inventory ask.
  if (/\b(?:hobby|side|side\s+project|auth|authentication|mvp|week\s+one|tech\s+stack|three\.?js|babylon)\b/i.test(t)
    && !/\b(?:on\s+(?:my\s+)?(?:pc|desktop|computer)|do\s+i\s+have|list\s+(?:my\s+)?projects)\b/i.test(t)) {
    return false;
  }
  if (/\btell\s+me\s+more\b/i.test(t) || /\bmore\s+details?\b/i.test(t) || /\babout\s+auth\b/i.test(t)) {
    return false;
  }
  // Must be a real inventory question — not just the words project + “tell me” in a planning reply.
  const asksInventory = (
    /\b(?:what|which)\s+projects?\b/i.test(t)
    || /\bprojects?\s+(?:do\s+i\s+have|have\s+i|are\s+on|on\s+my)\b/i.test(t)
    || /\b(?:list|show)\s+(?:my\s+)?projects?\b/i.test(t)
    || /\b(?:what(?:'s| is)|list|show).{0,40}\b(?:on|in)\s+(?:my\s+)?(?:pc|computer|desktop)\b/i.test(t)
  );
  if (!asksInventory) return false;
  return true;
}

/** Best-guess folder for a catalog ask — no "say the folder name" template needed. */
export function resolveCatalogFolderRef(message: string): FolderPathRef | null {
  const parsed = parseFolderPathAsk(message);
  if (parsed) return parsed;

  const t = String(message || '').trim();
  if (!t) return null;
  if (isProjectCreateBrief(t)) return null;
  if (looksLikeAddFileDestinationClarify(t)) return null;

  if (looksLikeProjectsInventoryAsk(t)) {
    return { scope: 'desktop', name: 'Projects' };
  }

  // Require an inventory-style ask — never treat "Create project X … Desktop window" as a list.
  if (/\bprojects?\b/i.test(t) && /\bdesktop\b/i.test(t)
    && /\b(?:what|which|list|show|tell|inside|contents?)\b/i.test(t)
    && !/\b(?:create|build|scaffold|want\s+a)\b/i.test(t)) {
    return { scope: 'desktop', name: 'Projects' };
  }

  if (
    /\b(?:what(?:'s| is)|tell me)\s+(?:what(?:'s| is)\s+)?(?:inside|in)\s+(?:of\s+)?it\b/i.test(t)
    && /\b(?:project|desktop)\b/i.test(t)
  ) {
    return { scope: 'desktop', name: 'Projects' };
  }

  if (/\b(?:inside|in)\s+(?:of\s+)?(?:my\s+)?desktop\b/i.test(t) && /\bproject/i.test(t)) {
    return { scope: 'desktop', name: 'Projects' };
  }

  if (/\b(?:inside|in)\s+(?:of\s+)?(?:the\s+)?projects?\b/i.test(t)) {
    return { scope: 'desktop', name: 'Projects' };
  }

  if (/\b(?:files?|folders?|contents?)\b/i.test(t) && /\bprojects?\b/i.test(t)) {
    return { scope: 'desktop', name: 'Projects' };
  }

  if (/\bwhat(?:'s| is)\s+on\s+(?:my\s+)?desktop\b/i.test(t)) {
    return { scope: 'desktop', name: 'Projects' };
  }

  return null;
}

const FOLDER_CATALOG_RE =
  /\b(what(?:'s| is)\s+(?:in|inside)|what(?:'s| is)\s+in\s+it|what(?:'s| is)\s+inside|what\s+projects?\s+(?:are\s+)?(?:in|inside)|list\s+(?:the\s+)?(?:contents?|files?|folders?)|tell\s+me\s+what(?:'s| is)\s+in|show\s+me\s+what(?:'s| is)\s+in|what\s+do\s+you\s+see\s+in|what(?:'s| is)\s+(?:exactly\s+)?in\s+(?:that|the|my|this)?\s*(?:folder|project)?)\b/i;

const WORK_ON_FOLDER_RE =
  /\b(start\s+work(?:ing)?\s+on|let'?s\s+(?:work\s+on|open|start)|work\s+on|switch\s+(?:this\s+chat\s+)?to|move\s+(?:to|into)|open\s+(?:the\s+)?(?:project|folder|repo))\b/i;

const KEY_FILE_NAMES = [
  'package.json',
  'README.md',
  'readme.md',
  'requirements.txt',
  'pyproject.toml',
  'vite.config.ts',
  'tsconfig.json',
  '.env',
  'run.bat',
  'main.py',
  'app.py',
];

export function looksLikeFolderCatalogAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (isProjectCreateBrief(t)) return false;
  if (looksLikeConversationalPlanningAsk(t)) return false;
  if (looksLikeAddFileDestinationClarify(t)) return false;
  if (/\b(?:scrap|rebuild|redo|replace)\b/i.test(t) && /\b(?:folder|project|ui|layout)\b/i.test(t)) return false;
  if (/\b(delete|remove|trash|wipe|get rid of)\b/i.test(t)) return false;
  if (looksLikeInstalledAppsAsk(t)) return false;
  if (looksLikeProjectsInventoryAsk(t)) return true;
  if (WORK_ON_FOLDER_RE.test(t)) return false;
  if (/\b(?:folder|project)\b/i.test(t) && /\b(work\s+on|start\s+work|want\s+to\s+work|begin\s+work)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:what\s+do\s+(?:i|you)\s+have|what(?:'s| is))\s+(?:in(?:side)?|in)\b/i.test(t) && /\bdesktop\b/i.test(t)) {
    return true;
  }
  if (/\b(?:inside|in)\s+(?:my\s+)?(?:desktop\s+)?folder\b/i.test(t)) return true;
  if (/\bunder\s+[A-Za-z0-9_.-]+\b/i.test(t) && /\bdesktop\b/i.test(t)) return true;
  if (/\bprojects?\b/i.test(t) && /\bdesktop\b/i.test(t) && /\b(?:inside|what|tell|show|in it)\b/i.test(t)) {
    // "Open DeBloat on Desktop Projects. Tell me what it does" is analyze, not inventory.
    if (/\b(?:open|work\s+on|summarize|flag|about|how it works)\b/i.test(t)) return false;
    return true;
  }
  if (
    /\b(?:what(?:'s| is)|tell me)\s+(?:what(?:'s| is)\s+)?(?:inside|in)\s+(?:of\s+)?it\b/i.test(t)
    && /\bproject/i.test(t)
  ) {
    return true;
  }
  if (FOLDER_CATALOG_RE.test(t)) return true;
  if (/\b(?:files?|folders?|contents?)\b/i.test(t) && /\b(?:inside|in)\s+(?:of\s+)?(?:the\s+)?projects?\b/i.test(t)) {
    return true;
  }
  if (/\b(?:folder|project)\b[\s\S]{0,80}\bwhat(?:'s| is)\s+(?:in|inside)\b/i.test(t)) return true;
  if (/\bwhat(?:'s| is)\s+in\s+it\b/i.test(t)) return true;
  if (
    /\b(?:what(?:'s| is)|tell\s+me\s+about|describe|explain)\s+[\w.-]+\s+(?:on|in)\s+(?:my\s+)?desktop\b/i.test(t)
    && !/\b(fix|bug|scan|security|build|implement|edit|install|work\s+on|start\s+work|create)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** User wants to open / work in a specific project folder — bind workspace + rename chat. */
export function looksLikeStartWorkOnFolderAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (looksLikeGreenfieldIdea(t)) return false;
  if (FOLDER_CATALOG_RE.test(t) || /\bwhat(?:'s| is)\s+in\s+it\b/i.test(t)) return false;
  // "start working on this/the/a/my project" without a folder name = continue current idea, not bind-existing.
  if (
    /\b(?:start\s+)?work(?:ing)?\s+on\s+(?:a\s+|this\s+|the\s+|my\s+)?project\b/i.test(t)
    && !/\blet'?s\s+work\s+on\s+[A-Za-z]/i.test(t)
    && !/\b(?:called|named)\s+[A-Za-z]/i.test(t)
    && !/\bstart\s+work(?:ing)?\s+on\s+[A-Za-z][A-Za-z0-9_-]/i.test(t)
  ) {
    return false;
  }
  if (WORK_ON_FOLDER_RE.test(t)) return true;
  if (/\b(?:folder|project)\b/i.test(t) && /\b(work\s+on|start\s+work|want\s+to\s+work|begin\s+work)\b/i.test(t)) {
    return Boolean(parseWorkOnFolderName(t));
  }
  return false;
}

export function parseWorkOnFolderName(text: string): string | null {
  const t = String(text || '').trim();
  if (!t) return null;

  const patterns = [
    /\b(?:start\s+work(?:ing)?\s+on|work(?:ing)?\s+on|let'?s\s+(?:work\s+on|open)|switch\s+(?:this\s+chat\s+)?to|move\s+(?:to|into)|open)\s+(?:the\s+)?(?:folder|project)\s+(?:called|named)\s+["\u201c']?([A-Za-z][A-Za-z0-9 _-]{1,48})/i,
    /\b(?:start\s+work(?:ing)?\s+on|work(?:ing)?\s+on|let'?s\s+(?:work\s+on|open)|switch\s+(?:this\s+chat\s+)?to|move\s+(?:to|into)|open)\s+(?:the\s+(?:folder|project)\s+)?(.+)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      let raw = m[1].trim();
      raw = raw.replace(/\s+(?:folder|project|app|repo)\b.*$/i, '').trim();
      raw = raw.replace(/[?.!,;:]+$/g, '').trim();
      const quoted = raw.match(/^["\u201c'](.+)["\u201d']$/);
      const name = (quoted?.[1] || raw.split(/\s+(?:on|in|and|to|for)\b/i)[0] || '').trim();
      if (isBlockedDiskTargetName(name)) continue;
      if (/^(a|this|the|my)\s+project$/i.test(name)) continue;
      if (name.length >= 2 && name.length <= 80) return name;
    }
  }

  const folderRef = parseFolderPathAsk(t);
  if (folderRef?.name) return folderRef.name;
  return null;
}

/** Full file import only when the user clearly wants deep code work — not a listing ask. */
export function shouldFullImportFolderAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (looksLikeFolderCatalogAsk(t)) return false;
  if (WORK_ON_FOLDER_RE.test(t)) return true;
  if (/\b(?:folder|project)\b/i.test(t) && /\b(work\s+on|start\s+work|want\s+to\s+work|begin\s+work)\b/i.test(t)) {
    return true;
  }
  if (/\b(scan|debug|find\s+(?:bugs|problems|issues)|security|read\s+(?:all|every)|full\s+(?:scan|import|project)|index\s+all)\b/i.test(t)) {
    return true;
  }
  if (/\b(fix|implement|build|edit|change|update|create|add|remove|delete)\b[\s\S]{0,48}\b(code|file|files|project|app|bug)\b/i.test(t)) {
    return true;
  }
  if (/\b(install|npm\s+i|pip\s+install|run\s+tests?)\b/i.test(t)) return true;
  return false;
}

function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

function formatBytes(size?: number): string {
  if (size == null || size < 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `~${Math.round(size / 1024)} KB`;
  return `~${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function hintFromPackageJson(text: string): string | null {
  try {
    const j = JSON.parse(text) as { name?: string; description?: string; version?: string };
    const parts: string[] = [];
    if (j.description) parts.push(String(j.description).trim().slice(0, 140));
    else if (j.name) parts.push(`Node project \u201c${j.name}\u201d.`);
    if (j.version && parts[0]) parts[0] = `${parts[0].replace(/\.$/, '')} (v${j.version}).`;
    return parts[0] || null;
  } catch {
    /* ignore */
  }
  return null;
}

function hintFromReadme(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/^#+\s*/, '').trim())
    .filter(Boolean);
  const first = lines.find(l => !/^!\[/.test(l) && l.length > 8);
  return first ? first.slice(0, 140) : null;
}

async function peekSubfolderHint(dirPath: string): Promise<string | null> {
  const candidates = ['README.md', 'readme.md', 'Readme.md', 'package.json', 'pyproject.toml'];
  for (const file of candidates) {
    const read = await window.arkDesktop?.readTextFile?.({
      path: joinPath(dirPath, file),
      maxBytes: 12_000,
    });
    if (!read?.ok || !read.text?.trim()) continue;
    if (/package\.json$/i.test(file)) {
      const hint = hintFromPackageJson(read.text);
      if (hint) return hint;
    } else {
      const hint = hintFromReadme(read.text);
      if (hint) return hint;
    }
  }
  return null;
}

async function summarizeSubfolder(dirPath: string, dirName: string): Promise<{
  description: string | null;
  folders: string[];
  keyFiles: string[];
}> {
  const description = await peekSubfolderHint(dirPath);
  const listing = await window.arkDesktop?.listDir?.(dirPath);
  const items = listing?.items || [];
  const subdirs = items
    .filter(i => i.kind === 'dir')
    .map(i => i.name)
    .filter(n => !/^(node_modules|\.git|dist|build|out|\.venv|venv|__pycache__)$/i.test(n))
    .slice(0, 10);
  const files = items.filter(i => i.kind === 'file').map(i => i.name);
  const keyFiles = KEY_FILE_NAMES.filter(k => files.some(f => f.toLowerCase() === k.toLowerCase()));
  for (const f of files) {
    if (keyFiles.length >= 8) break;
    if (KEY_FILE_NAMES.some(k => k.toLowerCase() === f.toLowerCase())) continue;
    if (/\.(json|md|toml|yaml|yml|ts|py|bat|env)$/i.test(f) && keyFiles.length < 6) {
      keyFiles.push(f);
    }
  }
  return { description, folders: subdirs, keyFiles: keyFiles.slice(0, 8) };
}

export type CatalogProject = {
  name: string;
  description?: string;
  folders: string[];
  keyFiles: string[];
};

export type CatalogItem = {
  name: string;
  kind: 'folder' | 'file' | 'shortcut';
  detail?: string;
};

export type FolderCatalogData = {
  folderPath: string;
  folderName: string;
  desktopPath?: string | null;
  projects: CatalogProject[];
  rootFiles: CatalogItem[];
  desktopSiblings: CatalogItem[];
};

const CATALOG_MARKER_RE = /<!--ark-catalog:([\s\S]*?)-->/;

export function isCatalogMessage(content: string): boolean {
  return CATALOG_MARKER_RE.test(String(content || ''));
}

export function parseCatalogMessage(content: string): FolderCatalogData | null {
  const m = String(content || '').match(CATALOG_MARKER_RE);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]) as FolderCatalogData;
  } catch {
    return null;
  }
}

export function encodeCatalogMessage(data: FolderCatalogData): string {
  return `<!--ark-catalog:${JSON.stringify(data)}-->`;
}

export function catalogToPlainText(data: FolderCatalogData): string {
  const lines: string[] = [];
  if (data.desktopPath) {
    lines.push(`Projects folder at ${data.folderPath} on Desktop.`);
  } else {
    lines.push(`Folder ${data.folderName} at ${data.folderPath}.`);
  }
  for (const p of data.projects) {
    lines.push(`${p.name}${p.description ? `: ${p.description}` : ''}`);
  }
  return lines.join('\n');
}

export type FolderCatalogResult = {
  data: FolderCatalogData;
  topLevelCount: number;
};

export async function buildFolderCatalogData(
  dirPath: string,
  displayName?: string,
  opts?: {
    desktopPath?: string | null;
    showDesktopSiblings?: boolean;
  },
): Promise<FolderCatalogResult> {
  const listing = await window.arkDesktop?.listDir?.(dirPath);
  const folderName = displayName || listing?.name || dirPath.split(/[/\\]/).pop() || 'folder';
  if (!listing?.ok) {
    return {
      data: {
        folderPath: dirPath,
        folderName,
        desktopPath: opts?.desktopPath || null,
        projects: [],
        rootFiles: [],
        desktopSiblings: [],
      },
      topLevelCount: 0,
    };
  }

  const items = listing.items || [];
  const dirs = items.filter(i => i.kind === 'dir');
  const files = items.filter(i => i.kind === 'file');
  const desktopPath = opts?.desktopPath || null;

  const projects: CatalogProject[] = [];
  for (const d of dirs.slice(0, 12)) {
    const summary = await summarizeSubfolder(d.path, d.name);
    projects.push({
      name: d.name,
      description: summary.description || undefined,
      folders: summary.folders,
      keyFiles: summary.keyFiles,
    });
  }

  const rootFiles: CatalogItem[] = files.slice(0, 12).map(f => {
    const ext = f.name.includes('.') ? f.name.split('.').pop()?.toLowerCase() : '';
    let kind: CatalogItem['kind'] = 'file';
    if (ext === 'lnk') kind = 'shortcut';
    const detail = ext && ext !== 'lnk'
      ? `${ext}${f.size ? ` · ${formatBytes(f.size)}` : ''}`
      : f.size ? formatBytes(f.size) : undefined;
    return { name: f.name, kind, detail };
  });

  const desktopSiblings: CatalogItem[] = [];
  if (opts?.showDesktopSiblings && desktopPath) {
    const desktopList = await window.arkDesktop?.listDir?.(desktopPath);
    for (const item of (desktopList?.items || []).filter(i => i.name.toLowerCase() !== folderName.toLowerCase()).slice(0, 14)) {
      if (item.kind === 'dir') {
        desktopSiblings.push({
          name: item.name,
          kind: 'folder',
          detail: item.name.toLowerCase() === folderName.toLowerCase() ? 'Described above' : undefined,
        });
      } else if (item.name.endsWith('.lnk')) {
        desktopSiblings.push({ name: item.name, kind: 'shortcut' });
      } else {
        desktopSiblings.push({
          name: item.name,
          kind: 'file',
          detail: item.size ? formatBytes(item.size) : undefined,
        });
      }
    }
  }

  return {
    data: {
      folderPath: dirPath,
      folderName,
      desktopPath,
      projects,
      rootFiles,
      desktopSiblings,
    },
    topLevelCount: items.length,
  };
}
