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
  return `ark:chat-studio:${chatId}`;
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
  if (studio && Object.keys(studio.files || {}).length > 0) return true;
  return false;
}

function studioPathJoin(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

/**
 * Resolve THIS chat's project folder.
 * Never return another thread's in-memory root. Prefer Desktop\\Projects\\{chatTitle}
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
  const buildIntent = chatId ? chatHasBuildWorkspace(chatId, snap) : false;

  // Plain conversations must never bind to a folder just because the title matches
  // Desktop\Projects\{title} after restart.
  if (!buildIntent) {
    if (snap?.diskRoot && !Object.keys(snap.files || {}).length && !snap.projectId) {
      try {
        localStorage.removeItem(chatStudioKey(chatId));
      } catch {
        /* ignore */
      }
    }
    return {
      diskRoot: null,
      name: undefined,
      files: {},
      projectId: null,
      previewUrl: null,
      healed: false,
    };
  }

  const last = chatId ? getLastDiskTarget(chatId) : null;
  const rawTitle = String(opts.chatTitle || snap?.name || last?.name || '').trim();
  // Sidebar titles are short product names after create; ignore long prompt titles.
  const productName = (
    rawTitle
    && rawTitle.length <= 48
    && !/^(create|build|make|write|help)\b/i.test(rawTitle)
  ) ? rawTitle.replace(/\s+and\s+build\b[\s\S]*$/i, '').trim() : '';
  const wantName = productName || String(snap?.name || '').trim();
  const wantKey = wantName.toLowerCase();

  const candidates: string[] = [];
  if (last?.path) candidates.push(last.path);
  if (snap?.diskRoot) candidates.push(snap.diskRoot);

  try {
    const roots = await window.arkDesktop?.browseRoots?.();
    const desktop = roots?.roots?.find(r => r.id === 'desktop')?.path;
    if (desktop && wantName && buildIntent) {
      const projectsDir = studioPathJoin(desktop, 'Projects');
      candidates.unshift(studioPathJoin(projectsDir, wantName));
      const listing = await window.arkDesktop?.listDir?.(projectsDir);
      if (listing?.ok) {
        for (const item of listing.items || []) {
          if (item.kind !== 'dir') continue;
          if (String(item.name || '').toLowerCase() === wantKey && item.path) {
            candidates.unshift(item.path);
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  let chosen: string | null = null;
  if (wantKey) {
    for (const c of candidates) {
      if (studioPathBasename(c).toLowerCase() === wantKey) {
        chosen = c;
        break;
      }
    }
  }
  // Mismatched stored root (e.g. ReefLog chat pointing at LumenLoom) → do not keep it.
  if (!chosen) {
    const snapBase = studioPathBasename(snap?.diskRoot).toLowerCase();
    if (wantKey && snap?.diskRoot && snapBase && snapBase !== wantKey) {
      chosen = null;
    } else {
      chosen = snap?.diskRoot || last?.path || null;
    }
  }

  const healed = Boolean(
    chosen
    && (
      (snap?.diskRoot && chosen.replace(/[/\\]+$/, '').toLowerCase()
        !== String(snap.diskRoot).replace(/[/\\]+$/, '').toLowerCase())
      || (wantName && snap?.name && snap.name.toLowerCase() !== wantName.toLowerCase())
    ),
  );

  if (healed && chatId && chosen) {
    saveChatStudio(chatId, {
      files: snap?.files || {},
      projectId: snap?.projectId || null,
      name: wantName || snap?.name,
      diskRoot: chosen,
      previewUrl: null,
    });
    setLastDiskTarget(chatId, {
      path: chosen,
      name: wantName || studioPathBasename(chosen),
      kind: 'folder',
    });
  }

  return {
    diskRoot: chosen,
    name: wantName || snap?.name,
    files: snap?.files || {},
    projectId: snap?.projectId || null,
    previewUrl: healed ? null : (snap?.previewUrl || null),
    healed,
  };
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
  return `ark:chat-code-pill:${chatId}`;
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
  return `ark:chat-last-folder:${chatId}`;
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
  return `ark:chat-last-disk-target:${chatId}`;
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
  return `ark:chat-pending-add-file:${chatId}`;
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
  return `ark:chat-pending-greenfield:${chatId}`;
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
