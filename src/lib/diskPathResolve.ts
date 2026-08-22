/**
 * Resolve any user-folder location for add/delete file (Pictures, Desktop, Projects, named folders).
 */

import { cleanDiskTargetName, namesRoughlyMatch } from './projectNames';
import { getLocalPrefs } from './localPrefs';
import { resolveDesktopProjectsFolderOnDisk, resolveNamedFolderOnDisk } from './deleteProjectFlow';
import type { LastListedFolder } from './chatStudioStore';

export const DESKTOP_PROJECTS_PARENT = '__desktop_projects__';

const ROOT_ALIAS: Record<string, string> = {
  picture: 'pictures',
  pictures: 'pictures',
  photo: 'pictures',
  photos: 'pictures',
  desktop: 'desktop',
  document: 'documents',
  documents: 'documents',
  doc: 'documents',
  docs: 'documents',
  download: 'downloads',
  downloads: 'downloads',
  home: 'home',
  projects: 'desktop',
  project: 'desktop',
};

export function rootParentHint(rootId: string): string {
  return `__root:${rootId}__`;
}

export function parseRootParentHint(hint: string): string | null {
  const m = String(hint || '').match(/^__root:(\w+)__$/);
  return m?.[1] || null;
}

function aliasToRootId(word: string): string | null {
  const w = String(word || '').trim().toLowerCase();
  if (!w) return null;
  if (ROOT_ALIAS[w]) return ROOT_ALIAS[w];
  if (w.endsWith('s') && ROOT_ALIAS[w.slice(0, -1)]) return ROOT_ALIAS[w.slice(0, -1)];
  return null;
}

/** Extract where on disk the user wants a file (Pictures, Desktop\\Projects, DeBloat, …). */
export function extractDiskParentHintFromText(text: string): string | undefined {
  const t = String(text || '').trim();
  if (!t) return undefined;

  const abs = t.match(/\b([A-Za-z]:\\(?:[^\s"'<>|]+\\)*[^\s"'<>|]+)\b/);
  if (abs?.[1] && !/\.[A-Za-z0-9]{1,6}$/i.test(abs[1])) {
    return abs[1];
  }

  if (
    /\b(?:desktop\s+)?projects?\s+folder\b/i.test(t)
    || (/\bproject\s+folder\b/i.test(t) && !/\b(?:called|named)\s+[A-Za-z]/i.test(t))
    || (/\b(?:on|in)\s+(?:my\s+)?desktop\b/i.test(t) && /\bprojects?\b/i.test(t))
  ) {
    return DESKTOP_PROJECTS_PARENT;
  }

  const inXFolder = t.match(
    /\b(?:in|inside|within|to|into)\s+(?:the\s+)?(?:of\s+)?(?:the\s+)?(?:my\s+)?([A-Za-z][A-Za-z0-9 _-]{0,32})\s+folder\b/i,
  );
  if (inXFolder?.[1]) {
    const rootId = aliasToRootId(inXFolder[1]);
    if (rootId && rootId !== 'desktop') return rootParentHint(rootId);
    const cleaned = cleanDiskTargetName(inXFolder[1]);
    if (cleaned) return cleaned;
  }

  const inRoot = t.match(
    /\b(?:in|inside|within|to|into|put\s+it\s+in|add\s+it\s+to|go\s+ahead\s+and\s+put\s+it\s+in)\s+(?:the\s+)?(?:my\s+)?(pictures?|photos?|desktop|documents?|docs|downloads?|home)\b/i,
  );
  if (inRoot?.[1]) {
    const rootId = aliasToRootId(inRoot[1]);
    if (rootId) return rootParentHint(rootId);
  }

  const folderNamed = t.match(/\b(?:folder|directory)\s+(?:called|named)\s+([A-Za-z][A-Za-z0-9 _-]{1,48})/i);
  if (folderNamed?.[1]) {
    const cleaned = cleanDiskTargetName(folderNamed[1]);
    if (cleaned) {
      const rootId = aliasToRootId(cleaned);
      if (rootId && rootId !== 'desktop') return rootParentHint(rootId);
      return cleaned;
    }
  }

  const projectFolderNamed = t.match(/\bproject\s+folder\s+(?:called|named)\s+([A-Za-z][A-Za-z0-9 _-]{1,48})/i);
  if (projectFolderNamed?.[1]) {
    const cleaned = cleanDiskTargetName(projectFolderNamed[1]);
    if (cleaned) return cleaned;
  }

  const inNamed = t.match(/\bin\s+([A-Za-z][A-Za-z0-9 _-]{1,48})\s*$/i);
  if (inNamed?.[1]) {
    const cleaned = cleanDiskTargetName(inNamed[1]);
    if (cleaned) {
      const rootId = aliasToRootId(cleaned);
      if (rootId) return rootParentHint(rootId);
      return cleaned;
    }
  }

  return undefined;
}

async function ensureGrantsSynced() {
  try {
    const p = getLocalPrefs();
    await window.arkDesktop?.workspaceSetGrants?.({
      desktop: Boolean(p.allowDesktopFolderAccess),
      documents: Boolean(p.allowDocumentsFolderAccess),
      fullPc: Boolean(p.allowFullPcAccess),
      executionMode: p.agentExecutionMode || 'allowlist',
    });
  } catch {
    /* ignore */
  }
}

async function browseRootPath(rootId: string): Promise<string | null> {
  const roots = await window.arkDesktop?.browseRoots?.();
  const hit = roots?.roots?.find(r => r.id === rootId);
  return hit?.path || null;
}

async function pathStat(targetPath: string) {
  return window.arkDesktop?.pathStat?.(targetPath);
}

async function findNamedFolderAnywhere(wantName: string): Promise<string | null> {
  await ensureGrantsSynced();
  const rootIds = ['pictures', 'desktop', 'documents', 'downloads', 'home'] as const;
  for (const rootId of rootIds) {
    const rootPath = await browseRootPath(rootId);
    if (!rootPath) continue;
    const rootName = rootPath.split(/[/\\]/).pop() || '';
    if (namesRoughlyMatch(rootName, wantName)) {
      const stat = await pathStat(rootPath);
      if (stat?.ok && stat.isDirectory) return stat.path || rootPath;
    }
    const listing = await window.arkDesktop?.listDir?.(rootPath);
    if (!listing?.ok) continue;
    for (const item of listing.items || []) {
      if (item.kind !== 'dir') continue;
      if (namesRoughlyMatch(item.name, wantName)) return item.path;
    }
  }
  const fast = await resolveNamedFolderOnDisk(wantName);
  return fast?.path || null;
}

export async function resolveDiskParentPath(opts: {
  parentHint?: string;
  workspaceDiskRoot?: string | null;
  workspaceName?: string | null;
  stickyTarget?: { path: string; name: string; kind: 'file' | 'folder' } | null;
  lastListedFolder?: LastListedFolder | null;
}): Promise<string | null> {
  const {
    parentHint,
    workspaceDiskRoot,
    workspaceName,
    stickyTarget,
    lastListedFolder,
  } = opts;

  const hint = String(parentHint || '').trim();

  if (hint === DESKTOP_PROJECTS_PARENT) {
    return (await resolveDesktopProjectsFolderOnDisk())?.path || null;
  }

  const rootId = parseRootParentHint(hint) || aliasToRootId(hint);
  if (rootId) {
    const rootPath = await browseRootPath(rootId);
    if (rootPath) {
      const stat = await pathStat(rootPath);
      if (stat?.ok && stat.isDirectory) return stat.path || rootPath;
      return rootPath;
    }
  }

  if (/^[A-Za-z]:\\/i.test(hint)) {
    const stat = await pathStat(hint);
    if (stat?.ok && stat.isDirectory) return stat.path || hint;
  }

  if (hint) {
    const found = await findNamedFolderAnywhere(hint);
    if (found) return found;
  }

  if (lastListedFolder?.path) {
    const stat = await pathStat(lastListedFolder.path);
    if (stat?.ok && stat.isDirectory) return lastListedFolder.path;
  }

  if (stickyTarget?.kind === 'folder') return stickyTarget.path;
  if (workspaceDiskRoot) return workspaceDiskRoot;

  if (workspaceName) {
    const found = await findNamedFolderAnywhere(workspaceName);
    if (found) return found;
  }

  return null;
}
