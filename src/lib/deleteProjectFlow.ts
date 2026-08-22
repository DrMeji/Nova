/**
 * Delete project/folder from Chat — zero external imports (avoids Vite pulling main bundle → TDZ).
 */

const PREFS_KEY = 'ark:local-prefs';

const DELETE_GRANT_OFF_MSG =
  'I need permission to read folders on your PC.\n\nOn first setup, enable **Give ARK access to your PC** (or open **Settings → Security** → Allow Desktop folder access + Full PC access), confirm the dialog, then ask again.';

type PrefsSlice = {
  allowDesktopFolderAccess?: boolean;
  allowDocumentsFolderAccess?: boolean;
  allowFullPcAccess?: boolean;
  agentExecutionMode?: string;
};

type LastListedFolder = { path: string; name: string; at?: number };

type CatalogSnapshot = {
  folderPath?: string;
  folderName?: string;
  projects?: Array<{ name: string }>;
};

function readPrefs(): PrefsSlice {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as PrefsSlice) : {};
  } catch {
    return {};
  }
}

function slugifyProjectName(name: string): string {
  const s = String(name || '').trim();
  if (!s) return 'new-project';
  if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(s)) return s;
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'new-project';
}

function nameVariants(name: string): string[] {
  const trimmed = String(name || '').trim();
  if (!trimmed) return [];
  const slug = slugifyProjectName(trimmed);
  const compact = trimmed.replace(/\s+/g, '');
  return [...new Set([trimmed, compact, slug].filter(Boolean))];
}

function namesRoughlyMatch(a: string, b: string): boolean {
  const variantsA = nameVariants(a).map(v => v.toLowerCase());
  const variantsB = nameVariants(b).map(v => v.toLowerCase());
  return variantsA.some(va => variantsB.some(vb => va === vb || va.includes(vb) || vb.includes(va)));
}

function hasFolderAccessGrant(): boolean {
  const p = readPrefs();
  return Boolean(p.allowDesktopFolderAccess || p.allowDocumentsFolderAccess || p.allowFullPcAccess);
}

function parseCatalogSnapshot(content: string): CatalogSnapshot | null {
  const m = String(content || '').match(/<!--ark-catalog:([\s\S]*?)-->/);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]) as CatalogSnapshot;
  } catch {
    return null;
  }
}

function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

export function looksLikeDeleteProjectAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!/\b(delete|remove|trash|wipe|get rid of)\b/i.test(t)) return false;
  return (
    /\b(project|workspace|repo|repository)\b/i.test(t)
    || (/\b(folder|directory)\b/i.test(t) && /\b(named|called|project)\b/i.test(t))
  );
}

export function looksLikeDeleteFollowUp(text: string): boolean {
  const t = String(text || '').trim();
  if (!/\b(delete|remove|trash|wipe|get rid of)\b/i.test(t)) return false;
  if (looksLikeDeleteProjectAsk(t)) return false;
  return (
    /\b(it|this|that|that folder|that project|the folder|the project)\b/i.test(t)
    || /^(yes\s+)?delete\b/i.test(t)
    || /\bi\s+want\s+you\s+to\s+delete\b/i.test(t)
    || /\bgo ahead and delete\b/i.test(t)
    || /\bjust\s+delete\b/i.test(t)
  );
}

export function looksLikeDeleteFolderAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (/\bdelete\b[\s\S]*\bfiles?\b/i.test(t) && !/\bdelete\s+(?:the\s+)?(?:project|workspace|folder|directory)\b/i.test(t)) {
    return false;
  }
  return looksLikeDeleteProjectAsk(text) || looksLikeDeleteFollowUp(text);
}

export type DeleteResolveTarget = 'current' | 'follow-up' | string;

function cleanDeleteName(raw: string): string {
  const s = String(raw || '').trim().replace(/[?.!,;:]+$/g, '').replace(/\s+(?:that(?:'s| is)|inside|on|in)\b[\s\S]*$/i, '').trim();
  if (/^(this|the|that)\s+(project|folder)$/i.test(s)) return '';
  if (/^(project|folder)$/i.test(s)) return '';
  return s;
}

function isBlockedDeleteName(name: string): boolean {
  const n = String(name || '').trim().toLowerCase();
  return !n || n.length < 2
    || n === 'it' || n === 'this' || n === 'that' || n === 'the'
    || n === 'this project' || n === 'the project' || n === 'the folder'
    || n === 'project folder' || n === 'projects folder';
}

export function extractDeleteNameFromMessage(message: string): string | null {
  const t = String(message || '').trim();
  const patterns = [
    /\bdelete\s+(?:the\s+)?project\s+named\s+([A-Za-z][A-Za-z0-9 _-]{1,48})/i,
    /\b([A-Za-z][A-Za-z0-9 _-]{2,48})\b[\s,]+(?:that(?:'s| is)|which is)[\s\S]{0,60}\bdelete\b/i,
    /\b([A-Za-z][A-Za-z0-9 _-]{2,48})\b[\s,]+(?:inside|in)\b[\s\S]{0,60}\bdelete\b/i,
    /\b(?:project|workspace|folder)\s+(?:named|called)\s+["\u201c']([^"\u201d']+)["\u201d']/i,
    /\b(?:project|workspace|folder)\s+(?:named|called)\s+([A-Za-z][A-Za-z0-9 _-]{1,48})/i,
    /\bdelete\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _-]{2,48})\s+project\b/i,
    /\bproject\s+name\s+([A-Za-z][A-Za-z0-9 _-]{1,48})/i,
    /\bdelete\s+(?:the\s+)?(?:project|workspace|folder)\s+["\u201c']([^"\u201d']+)["\u201d']/i,
    /\bdelete\s+(?:the\s+)?(?:project|workspace)\s+([A-Za-z][A-Za-z0-9 _-]{1,48})/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const name = cleanDeleteName(m[1]);
      if (name.length >= 2 && !isBlockedDeleteName(name)) return name;
    }
  }
  return null;
}

export function parseDeleteProjectTarget(message: string): DeleteResolveTarget | null {
  const t = String(message || '').trim();
  if (!looksLikeDeleteFolderAsk(t)) return null;
  if (looksLikeDeleteFollowUp(t)) return 'follow-up';
  const extracted = extractDeleteNameFromMessage(t);
  if (extracted) return extracted;
  if (/\b(this|the|entire|whole)\s+(project|workspace|folder)\b/i.test(t)) return 'follow-up';
  if (/\bdelete\s+(?:this\s+)?(?:project|workspace|folder)\b/i.test(t)) return 'follow-up';
  return 'follow-up';
}

export function extractDeleteNameFromThread(userMessages: string[]): string | null {
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const line = String(userMessages[i] || '').trim();
    const extracted = extractDeleteNameFromMessage(line);
    if (extracted) return extracted;
    const parsed = parseDeleteProjectTarget(line);
    if (parsed && parsed !== 'current' && parsed !== 'follow-up') return parsed;
  }
  return null;
}

export function lastListedFolderFromCatalogThread(
  messages: Array<{ role?: string; content?: string | null }>,
): { path: string; name: string; at: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== 'assistant') continue;
    const catalog = parseCatalogSnapshot(String(msg.content || ''));
    if (catalog?.folderPath) {
      return {
        path: catalog.folderPath,
        name: catalog.folderName || catalog.folderPath.split(/[/\\]/).pop() || 'folder',
        at: Date.now(),
      };
    }
  }
  return null;
}

function findDeletePathInCatalogThread(
  messages: Array<{ role?: string; content?: string | null }>,
  wantName: string,
): { path: string; name: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== 'assistant') continue;
    const catalog = parseCatalogSnapshot(String(msg.content || ''));
    if (!catalog?.folderPath) continue;
    for (const project of catalog.projects || []) {
      if (namesRoughlyMatch(project.name, wantName)) {
        return {
          path: joinPath(catalog.folderPath, project.name),
          name: project.name,
        };
      }
    }
  }
  return null;
}

async function pathIsDirectory(targetPath: string): Promise<boolean> {
  const stat = await window.arkDesktop?.pathStat?.(targetPath);
  return Boolean(stat?.ok && stat.isDirectory);
}

async function firstExistingDirectory(paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    if (await pathIsDirectory(candidate)) return candidate;
  }
  return null;
}

export function buildDeleteNotFoundMessage(name: string): string {
  if (!hasFolderAccessGrant()) return DELETE_GRANT_OFF_MSG;
  const label = name && name !== 'follow-up' && name !== 'current' ? `**${name}**` : 'that folder';
  return `Couldn't find a folder named ${label} on Desktop or Desktop\\Projects.\n\nCheck the spelling in File Explorer, or list the folder first so I know the exact path.`;
}

async function findInProjectsParent(projectsDir: string, wantName: string): Promise<string | null> {
  const listing = await window.arkDesktop?.listDir?.(projectsDir);
  if (!listing?.ok) return null;
  for (const item of listing.items || []) {
    if (item.kind !== 'dir') continue;
    if (namesRoughlyMatch(item.name, wantName)) return item.path;
  }
  return null;
}

async function resolveDeleteByFastPaths(wantName: string): Promise<{ path: string; name: string } | null> {
  const variants = nameVariants(wantName);
  const roots = await window.arkDesktop?.browseRoots?.();
  const desktop = roots?.roots?.find(r => r.id === 'desktop')?.path;
  const documents = roots?.roots?.find(r => r.id === 'documents')?.path;
  const prefs = readPrefs();

  const candidates: string[] = [];
  if (prefs.allowDesktopFolderAccess && desktop) {
    const projectsDir = joinPath(desktop, 'Projects');
    const inProjects = await findInProjectsParent(projectsDir, wantName);
    if (inProjects) {
      return { path: inProjects, name: inProjects.split(/[/\\]/).pop() || wantName };
    }
    for (const variant of variants) {
      candidates.push(joinPath(desktop, variant));
      candidates.push(joinPath(projectsDir, variant));
    }
  }
  if (prefs.allowDocumentsFolderAccess && documents) {
    for (const variant of variants) {
      candidates.push(joinPath(joinPath(documents, 'ARK Projects'), variant));
    }
  }

  const hit = await firstExistingDirectory([...new Set(candidates)]);
  if (!hit) return null;
  return { path: hit, name: hit.split(/[/\\]/).pop() || wantName };
}

function isProjectsContainerPath(folderPath: string): boolean {
  return /[/\\]projects$/i.test(String(folderPath || '').trim());
}

export async function resolveDeleteProjectFolder(opts: {
  target: DeleteResolveTarget;
  workspaceDiskRoot?: string | null;
  workspaceName?: string | null;
  lastListedFolder?: LastListedFolder | null;
  recentUserMessages?: string[];
  threadMessages?: Array<{ role?: string; content?: string | null }>;
}): Promise<{ path: string | null; name: string; source?: string }> {
  const {
    target,
    workspaceDiskRoot,
    workspaceName,
    lastListedFolder,
    recentUserMessages = [],
    threadMessages = [],
  } = opts;

  if (!hasFolderAccessGrant()) {
    return { path: null, name: typeof target === 'string' ? target : 'folder' };
  }

  const prefs = readPrefs();
  await window.arkDesktop?.workspaceSetGrants?.({
    desktop: prefs.allowDesktopFolderAccess,
    documents: prefs.allowDocumentsFolderAccess,
    fullPc: prefs.allowFullPcAccess,
    executionMode: (prefs.agentExecutionMode as 'allowlist' | 'auto_review' | 'run_all' | undefined) || 'allowlist',
  });

  const nameHint = target === 'follow-up' || target === 'current'
    ? (extractDeleteNameFromThread(recentUserMessages) || extractDeleteNameFromMessage(recentUserMessages[recentUserMessages.length - 1] || ''))
    : target;

  if (nameHint && nameHint !== 'follow-up' && nameHint !== 'current' && threadMessages.length) {
    const fromCatalog = findDeletePathInCatalogThread(threadMessages, nameHint);
    if (fromCatalog?.path && await pathIsDirectory(fromCatalog.path)) {
      return { ...fromCatalog, source: 'catalogThread' };
    }
  }

  if (typeof target === 'string' && target !== 'follow-up' && target !== 'current') {
    const fast = await resolveDeleteByFastPaths(target);
    if (fast) return { ...fast, source: 'fastPath' };
  }

  if (nameHint && nameHint !== 'follow-up' && nameHint !== 'current') {
    const fast = await resolveDeleteByFastPaths(nameHint);
    if (fast) return { ...fast, source: 'fastPath' };
  }

  if (target === 'follow-up' || target === 'current') {
    if (lastListedFolder?.path && await pathIsDirectory(lastListedFolder.path)) {
      const isContainer = isProjectsContainerPath(lastListedFolder.path);
      if (!isContainer) {
        return { path: lastListedFolder.path, name: lastListedFolder.name, source: 'lastListedFolder' };
      }
    }
    if (workspaceDiskRoot && await pathIsDirectory(workspaceDiskRoot)) {
      return {
        path: workspaceDiskRoot,
        name: workspaceName || workspaceDiskRoot.split(/[/\\]/).pop() || 'workspace',
        source: 'workspace',
      };
    }
    if (target === 'follow-up' && nameHint && nameHint !== 'follow-up' && nameHint !== 'current') {
      const fast = await resolveDeleteByFastPaths(nameHint);
      if (fast) return { ...fast, source: 'fastPath' };
    }
    return { path: null, name: workspaceName || 'folder' };
  }

  if (workspaceDiskRoot && workspaceName && namesRoughlyMatch(workspaceName, target)) {
    if (await pathIsDirectory(workspaceDiskRoot)) {
      return { path: workspaceDiskRoot, name: workspaceName, source: 'workspace' };
    }
  }

  const fast = await resolveDeleteByFastPaths(target);
  if (fast) return { ...fast, source: 'fastPath' };

  return { path: null, name: target };
}

export async function resolveDesktopProjectsFolderOnDisk(): Promise<{ path: string; name: string } | null> {
  if (!hasFolderAccessGrant()) return null;
  const roots = await window.arkDesktop?.browseRoots?.();
  const desktop = roots?.roots?.find(r => r.id === 'desktop')?.path;
  if (!desktop) return null;
  const projectsPath = joinPath(desktop, 'Projects');
  if (await pathIsDirectory(projectsPath)) {
    return { path: projectsPath, name: 'Projects' };
  }
  return null;
}

/** Resolve a named folder on Desktop / Projects (shared with add/delete file). */
export async function resolveNamedFolderOnDisk(
  wantName: string,
): Promise<{ path: string; name: string } | null> {
  const cleaned = String(wantName || '').trim();
  if (!cleaned) return null;
  return resolveDeleteByFastPaths(cleaned);
}

export async function deleteProjectFolderOnDisk(opts: {
  folderPath: string;
  projectId?: string | null;
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  const want = String(opts.folderPath || '').replace(/[/\\]+$/, '').toLowerCase();
  if (opts.projectId && window.arkDesktop?.workspaceDeleteRoot && window.arkDesktop?.projectPath) {
    const info = await window.arkDesktop.projectPath(opts.projectId);
    const root = info?.ok ? String(info.root || '').replace(/[/\\]+$/, '').toLowerCase() : '';
    if (root && want && root === want) {
      const viaProject = await window.arkDesktop.workspaceDeleteRoot({ projectId: opts.projectId });
      if (viaProject.ok) return viaProject;
    }
  }
  if (!window.arkDesktop?.workspaceDeleteFolder) {
    return { ok: false, error: 'Delete is only available in the desktop app.' };
  }
  return window.arkDesktop.workspaceDeleteFolder({ targetPath: opts.folderPath });
}

export type DeleteProjectChatOutcome =
  | { kind: 'not-delete' }
  | { kind: 'reply'; text: string }
  | {
      kind: 'prompt';
      projectName: string;
      folderPath: string;
      projectId: string | null;
    };

/** Runs delete detect + resolve outside AIChat sendMessage (avoids minifier `l` shadowing chats). */
export async function handleDeleteProjectChatRequest(opts: {
  content: string;
  messages: Array<{ role?: string; content?: string | null }>;
  workspaceDiskRoot?: string | null;
  workspaceName?: string | null;
  workspaceProjectId?: string | null;
  stickyListedFolder?: LastListedFolder | null;
  stickyDiskTarget?: { path: string; name: string; kind: 'file' | 'folder' } | null;
}): Promise<DeleteProjectChatOutcome> {
  const {
    content,
    messages,
    workspaceDiskRoot,
    workspaceName,
    workspaceProjectId,
    stickyListedFolder,
    stickyDiskTarget,
  } = opts;

  if (!looksLikeDeleteFolderAsk(content)) {
    return { kind: 'not-delete' };
  }

  const deleteTarget = parseDeleteProjectTarget(content);
  if (!deleteTarget) {
    return {
      kind: 'reply',
      text: 'Which project should I delete? Say e.g. *delete the project named Starbucks* or *delete it* after I list a folder.',
    };
  }

  const recentUserLines = messages
    .filter(m => m.role === 'user')
    .map(m => String(m.content || ''));

  const listedFolder = stickyListedFolder
    || lastListedFolderFromCatalogThread(messages);

  const resolved = await resolveDeleteProjectFolder({
    target: deleteTarget,
    workspaceDiskRoot,
    workspaceName,
    lastListedFolder: listedFolder,
    recentUserMessages: recentUserLines,
    threadMessages: messages,
  });

  let folderPath = resolved.path;
  if (!folderPath && workspaceProjectId) {
    const info = await window.arkDesktop?.projectPath?.(workspaceProjectId);
    if (info?.ok && info.root) folderPath = info.root;
  }
  if (!folderPath && deleteTarget === 'follow-up' && stickyDiskTarget?.kind === 'folder') {
    folderPath = stickyDiskTarget.path;
  }

  if (!folderPath) {
    const missName = deleteTarget === 'follow-up'
      ? (extractDeleteNameFromThread(recentUserLines) || stickyDiskTarget?.name || 'that folder')
      : deleteTarget === 'current'
        ? 'this project'
        : deleteTarget;
    return { kind: 'reply', text: buildDeleteNotFoundMessage(missName) };
  }

  const projectName = resolved.name
    || (deleteTarget === 'current'
      ? (workspaceName || 'this project')
      : deleteTarget === 'follow-up'
        ? folderPath.split(/[/\\]/).pop() || 'this project'
        : deleteTarget);

  const boundRoot = String(workspaceDiskRoot || '').replace(/[/\\]+$/, '').toLowerCase();
  const deletedRoot = String(folderPath || '').replace(/[/\\]+$/, '').toLowerCase();
  const boundProjectId = (boundRoot && deletedRoot && boundRoot === deletedRoot)
    ? (workspaceProjectId || null)
    : null;

  return {
    kind: 'prompt',
    projectName,
    folderPath,
    projectId: boundProjectId,
  };
}
