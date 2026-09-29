/** Persist sticky Chat workspace (files + disk root) per chat thread. */

export type ChatStudioSnapshot = {
  files: Record<string, string>;
  projectId: string | null;
  name?: string;
  diskRoot?: string | null;
  /** Last localhost / preview URL for this chat only (never reuse across threads). */
  previewUrl?: string | null;
  savedAt?: number;
};

function chatStudioKey(chatId: string) {
  return `NOVA:chat-studio:${chatId}`;
}

export function studioPathBasename(diskRoot: string | null | undefined): string {
  if (!diskRoot) return '';
  const parts = String(diskRoot).split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

/** True when this chat actually started a build / code workspace — not a plain conversation. */
export function chatHasBuildWorkspace(chatId: string, snap?: ChatStudioSnapshot | null): boolean {
  if (!chatId) return false;
  const studio = snap === undefined ? loadChatStudio(chatId) : snap;
  if (hasChatCodePill(chatId)) return true;
  if (getLastPendingGreenfield(chatId)) return true;
  if (studio?.projectId) return true;
  // Path-only binds (catalog) still count — Preview / Explorer need the root.
  if (studio?.diskRoot) return true;
  if (studio && Object.keys(studio.files || {}).length > 0) return true;
  return false;
}

/** Sidebar titles from the first user prompt must never become folder names. */
function looksLikePromptTitle(title: string): boolean {
  const t = String(title || '').trim();
  if (!t) return true;
  if (t.length > 40) return true;
  if (/[,!?]/.test(t)) return true;
  if (/\s{2,}/.test(t)) return true;
  if (/^(add|fix|update|change|edit|insert|remove|delete|please|can|how|what|why|make|create|build|write|help|implement|open|bind|read|show|tell)\b/i.test(t)) {
    return true;
  }
  if (/\b(comment|near the top|app\/|src\/|\.py|\.tsx?|\.jsx?)\b/i.test(t)) return true;
  return false;
}

async function pathLooksReal(absPath: string | null | undefined): Promise<boolean> {
  const p = String(absPath || '').trim();
  if (!p) return false;
  try {
    const stat = await window.novaDesktop?.workspaceStatPath?.(p)
      || await window.novaDesktop?.pathStat?.(p);
    return Boolean(stat?.ok && (stat.isDirectory !== false));
  } catch {
    return false;
  }
}

function studioPathJoin(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

/**
 * Resolve THIS chat's project folder.
 * Never return another thread's in-memory root. Prefer NOVA Projects\{chatTitle}
 * when the stored studio diskRoot basename does not match the chat's product name
 * (fixes cross-chat Localhost bleed after a wrong persist).
 */
export async function resolveChatProjectRoot(opts: {
  chatId: string;
  chatTitle?: string | null;
}): Promise<{
  diskRoot: string | null;
  name?: string;
  files: Record<string, string>;
  projectId: string | null;
  previewUrl: string | null;
  healed: boolean;
}> {
  const chatId = String(opts.chatId || '').trim();
  const snap = chatId ? loadChatStudio(chatId) : null;
  const last = chatId ? getLastDiskTarget(chatId) : null;
  const buildIntent = chatId ? chatHasBuildWorkspace(chatId, snap) : false;

  // Plain conversations (no bind, no files) must never invent a folder from the chat title.
  if (!buildIntent && !snap?.diskRoot && !last?.path) {
    return {
      diskRoot: null,
      name: undefined,
      files: {},
      projectId: null,
      previewUrl: null,
      healed: false,
    };
  }

  // Prefer a real on-disk root already bound to this chat — never replace with a prompt title.
  const trustedRoots = [snap?.diskRoot, last?.path].filter(Boolean) as string[];
  for (const root of trustedRoots) {
    if (await pathLooksReal(root)) {
      const folderName = studioPathBasename(root) || String(snap?.name || '').trim() || undefined;
      const namePoisoned = Boolean(snap?.name && looksLikePromptTitle(snap.name));
      const healedName = namePoisoned && folderName
        ? folderName !== snap?.name
        : false;
      if (healedName && chatId) {
        saveChatStudio(chatId, {
          files: snap?.files || {},
          projectId: snap?.projectId || null,
          name: folderName,
          diskRoot: root,
          previewUrl: snap?.previewUrl || null,
        });
      }
      return {
        diskRoot: root,
        name: folderName || snap?.name,
        files: snap?.files || {},
        projectId: snap?.projectId || null,
        previewUrl: snap?.previewUrl || null,
        healed: healedName,
      };
    }
  }

  const candidates: string[] = [];
  if (last?.path) candidates.push(last.path);
  if (snap?.diskRoot) candidates.push(snap.diskRoot);

  // Prefer already-bound / last-disk paths only — never invent a folder by scanning
  // NOVA Projects for a chat title slug (that rebinds Nightcord → nightcord-2 leftovers).

  let chosen: string | null = null;
  for (const c of candidates) {
    if (!(await pathLooksReal(c))) continue;
    chosen = c;
    break;
  }
  if (!chosen) {
    // Last resort: keep stored root even if stat failed (offline / grant race) — never invent title path.
    chosen = (snap?.diskRoot && !looksLikePromptTitle(studioPathBasename(snap.diskRoot)))
      ? snap.diskRoot
      : (last?.path || null);
  }

  const folderLabel = studioPathBasename(chosen) || snap?.name || last?.name;
  const healed = Boolean(
    chosen
    && snap?.diskRoot
    && chosen.replace(/[/\\]+$/, '').toLowerCase()
      !== String(snap.diskRoot).replace(/[/\\]+$/, '').toLowerCase(),
  );

  if (healed && chatId && chosen) {
    saveChatStudio(chatId, {
      files: snap?.files || {},
      projectId: snap?.projectId || null,
      name: folderLabel,
      diskRoot: chosen,
      previewUrl: null,
    });
    setLastDiskTarget(chatId, {
      path: chosen,
      name: folderLabel || studioPathBasename(chosen),
      kind: 'folder',
    });
  }

  return {
    diskRoot: chosen,
    name: folderLabel || undefined,
    files: snap?.files || {},
    projectId: snap?.projectId || null,
    previewUrl: healed ? null : (snap?.previewUrl || null),
    healed,
  };
}

const studioPersistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const studioPersistPending = new Map<string, {
  files: Record<string, string>;
  projectId: string | null;
  name?: string;
  diskRoot?: string | null;
  previewUrl?: string | null;
}>();

function flushChatStudio(chatId: string) {
  const snapshot = studioPersistPending.get(chatId);
  studioPersistPending.delete(chatId);
  const t = studioPersistTimers.get(chatId);
  if (t) clearTimeout(t);
  studioPersistTimers.delete(chatId);
  if (!snapshot) return;
  const hasFiles = Boolean(chatId && Object.keys(snapshot.files).length);
  const hasRoot = Boolean(chatId && snapshot.diskRoot);
  if (!hasFiles && !hasRoot) return;
  try {
    localStorage.setItem(chatStudioKey(chatId), JSON.stringify({
      files: snapshot.files,
      projectId: snapshot.projectId,
      name: snapshot.name ?? undefined,
      diskRoot: snapshot.diskRoot || null,
      previewUrl: snapshot.previewUrl || null,
      savedAt: Date.now(),
    } satisfies ChatStudioSnapshot));
  } catch {
    /* ignore */
  }
}

export function saveChatStudio(
  chatId: string,
  snapshot: {
    files: Record<string, string>;
    projectId: string | null;
    name?: string;
    diskRoot?: string | null;
    previewUrl?: string | null;
  },
) {
  const hasFiles = Boolean(chatId && Object.keys(snapshot.files).length);
  const hasRoot = Boolean(chatId && snapshot.diskRoot);
  if (!hasFiles && !hasRoot) return;
  studioPersistPending.set(chatId, snapshot);
  const prev = studioPersistTimers.get(chatId);
  if (prev) clearTimeout(prev);
  // Debounce large JSON.stringify of full file maps — avoid main-thread freezes mid-craft.
  const bytes = Object.values(snapshot.files || {}).reduce((n, c) => n + String(c || '').length, 0);
  const delay = bytes > 40_000 ? 2_000 : 400;
  studioPersistTimers.set(chatId, setTimeout(() => flushChatStudio(chatId), delay));
}

export type BoundStudio = {
  chatId: string;
  diskRoot: string | null;
  projectId: string | null;
  name?: string;
  files: Record<string, string>;
  previewUrl?: string | null;
};

/** SSOT snapshot for one chatId — handlers must use this, not mixed refs. */
export function getBoundStudio(chatId: string): BoundStudio | null {
  const id = String(chatId || '').trim();
  if (!id) return null;
  const snap = loadChatStudio(id);
  if (!snap) return null;
  return {
    chatId: id,
    diskRoot: snap.diskRoot || null,
    projectId: snap.projectId || null,
    name: snap.name,
    files: snap.files || {},
    previewUrl: snap.previewUrl ?? null,
  };
}

export function loadChatStudio(chatId: string): ChatStudioSnapshot | null {
  if (!chatId) return null;
  try {
    const raw = localStorage.getItem(chatStudioKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatStudioSnapshot;
    const files = parsed?.files || {};
    const hasFiles = Object.keys(files).length > 0;
    const hasRoot = Boolean(parsed?.diskRoot);
    if (!hasFiles && !hasRoot) return null;
    return {
      files,
      projectId: parsed.projectId || null,
      name: parsed.name || undefined,
      diskRoot: parsed.diskRoot || null,
      previewUrl: parsed.previewUrl || null,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearChatStudio(chatId: string) {
  if (!chatId) return;
  try {
    localStorage.removeItem(chatStudioKey(chatId));
  } catch {
    /* ignore */
  }
  clearChatCodePill(chatId);
}

/** Sticky Code pill for this chat. set when build/files start; cleared only when chat is deleted. */
function chatCodePillKey(chatId: string) {
  return `NOVA:chat-code-pill:${chatId}`;
}

export function setChatCodePill(chatId: string, on = true) {
  if (!chatId) return;
  try {
    if (on) localStorage.setItem(chatCodePillKey(chatId), '1');
    else localStorage.removeItem(chatCodePillKey(chatId));
  } catch {
    /* ignore */
  }
}

export function hasChatCodePill(chatId: string | null | undefined): boolean {
  if (!chatId) return false;
  try {
    return localStorage.getItem(chatCodePillKey(chatId)) === '1';
  } catch {
    return false;
  }
}

export function clearChatCodePill(chatId: string) {
  if (!chatId) return;
  try {
    localStorage.removeItem(chatCodePillKey(chatId));
  } catch {
    /* ignore */
  }
}

export type LastListedFolder = {
  path: string;
  name: string;
  at: number;
};

export const LAST_LISTED_FOLDER_TTL_MS = 30 * 60 * 1000;

function lastListedFolderKey(chatId: string) {
  return `NOVA:chat-last-folder:${chatId}`;
}

export function setLastListedFolder(chatId: string, folder: { path: string; name: string }) {
  if (!chatId || !folder.path) return;
  try {
    localStorage.setItem(lastListedFolderKey(chatId), JSON.stringify({
      path: folder.path,
      name: folder.name,
      at: Date.now(),
    } satisfies LastListedFolder));
  } catch {
    /* ignore */
  }
}

export function getLastListedFolder(chatId: string): LastListedFolder | null {
  if (!chatId) return null;
  try {
    const raw = localStorage.getItem(lastListedFolderKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastListedFolder;
    if (!parsed?.path) return null;
    if (Date.now() - (parsed.at || 0) > LAST_LISTED_FOLDER_TTL_MS) {
      localStorage.removeItem(lastListedFolderKey(chatId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastListedFolder(chatId: string) {
  if (!chatId) return;
  try {
    localStorage.removeItem(lastListedFolderKey(chatId));
  } catch {
    /* ignore */
  }
}

export type LastDiskTarget = {
  path: string;
  name: string;
  kind: 'file' | 'folder';
  at: number;
};

export const LAST_DISK_TARGET_TTL_MS = 30 * 60 * 1000;

function lastDiskTargetKey(chatId: string) {
  return `NOVA:chat-last-disk-target:${chatId}`;
}

export function setLastDiskTarget(
  chatId: string,
  target: { path: string; name: string; kind: 'file' | 'folder' },
) {
  if (!chatId || !target.path) return;
  try {
    localStorage.setItem(lastDiskTargetKey(chatId), JSON.stringify({
      path: target.path,
      name: target.name,
      kind: target.kind,
      at: Date.now(),
    } satisfies LastDiskTarget));
  } catch {
    /* ignore */
  }
}

export function getLastDiskTarget(chatId: string): LastDiskTarget | null {
  if (!chatId) return null;
  try {
    const raw = localStorage.getItem(lastDiskTargetKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastDiskTarget;
    if (!parsed?.path) return null;
    if (Date.now() - (parsed.at || 0) > LAST_DISK_TARGET_TTL_MS) {
      localStorage.removeItem(lastDiskTargetKey(chatId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastDiskTarget(chatId: string) {
  if (!chatId) return;
  try {
    localStorage.removeItem(lastDiskTargetKey(chatId));
  } catch {
    /* ignore */
  }
}

export type LastPendingAddFile = {
  fileName: string;
  at: number;
};

export const LAST_PENDING_ADD_FILE_TTL_MS = 30 * 60 * 1000;

function lastPendingAddFileKey(chatId: string) {
  return `NOVA:chat-pending-add-file:${chatId}`;
}

export function setLastPendingAddFile(chatId: string, fileName: string) {
  if (!chatId || !fileName) return;
  try {
    localStorage.setItem(lastPendingAddFileKey(chatId), JSON.stringify({
      fileName,
      at: Date.now(),
    } satisfies LastPendingAddFile));
  } catch {
    /* ignore */
  }
}

export function getLastPendingAddFile(chatId: string): LastPendingAddFile | null {
  if (!chatId) return null;
  try {
    const raw = localStorage.getItem(lastPendingAddFileKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastPendingAddFile;
    if (!parsed?.fileName) return null;
    if (Date.now() - (parsed.at || 0) > LAST_PENDING_ADD_FILE_TTL_MS) {
      localStorage.removeItem(lastPendingAddFileKey(chatId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastPendingAddFile(chatId: string) {
  if (!chatId) return;
  try {
    localStorage.removeItem(lastPendingAddFileKey(chatId));
  } catch {
    /* ignore */
  }
}

export type LastPendingGreenfield = {
  name: string;
  slug: string;
  kind: string;
  summary: string;
  problemLine: string;
  at: number;
  /** How many times Keep planning / expand was used. drives richer replies. */
  planDepth?: number;
  /** Last expand focus (gallery, menu, hero, …). */
  planFocus?: string;
  /** Accumulated plan sections. each Keep planning / expand appends; never drops prior ones. */
  planLog?: string[];
};

export const LAST_PENDING_GREENFIELD_TTL_MS = 60 * 60 * 1000;

function lastPendingGreenfieldKey(chatId: string) {
  return `NOVA:chat-pending-greenfield:${chatId}`;
}

export function setLastPendingGreenfield(
  chatId: string,
  idea: {
    name: string;
    slug: string;
    kind: string;
    summary: string;
    problemLine: string;
    planDepth?: number;
    planFocus?: string;
    planLog?: string[];
  },
) {
  if (!chatId || !idea.name) return;
  try {
    localStorage.setItem(lastPendingGreenfieldKey(chatId), JSON.stringify({
      ...idea,
      planDepth: idea.planDepth ?? 0,
      planFocus: idea.planFocus,
      planLog: Array.isArray(idea.planLog) ? idea.planLog : [],
      at: Date.now(),
    } satisfies LastPendingGreenfield));
  } catch {
    /* ignore */
  }
}

export function getLastPendingGreenfield(chatId: string): LastPendingGreenfield | null {
  if (!chatId) return null;
  try {
    const raw = localStorage.getItem(lastPendingGreenfieldKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastPendingGreenfield;
    if (!parsed?.name) return null;
    if (Date.now() - (parsed.at || 0) > LAST_PENDING_GREENFIELD_TTL_MS) {
      localStorage.removeItem(lastPendingGreenfieldKey(chatId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastPendingGreenfield(chatId: string) {
  if (!chatId) return;
  try {
    localStorage.removeItem(lastPendingGreenfieldKey(chatId));
  } catch {
    /* ignore */
  }
}
