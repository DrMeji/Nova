/** Persist sticky Chat workspace (files + disk root) per chat thread. */

export type ChatStudioSnapshot = {
  files: Record<string, string>;
  projectId: string | null;
  name?: string;
  diskRoot?: string | null;
  savedAt?: number;
};

function chatStudioKey(chatId: string) {
  return `ark:chat-studio:${chatId}`;
}

export function saveChatStudio(
  chatId: string,
  snapshot: {
    files: Record<string, string>;
    projectId: string | null;
    name?: string;
    diskRoot?: string | null;
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
