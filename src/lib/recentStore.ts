/** Persisted Recent: projects + creation metadata (media bytes stay in Engine). */

export type RecentProject = {
  id: string;
  name: string;
  kind?: 'project';
  updatedAt?: string;
  pinnedAt?: string;
  /** Absolute folder path when known (Chat create / Open folder). */
  diskPath?: string;
};

export type RecentCreation = {
  id: string;
  kind: 'image' | 'video';
  title: string;
  prompt: string;
  modelName: string;
  /** In-memory only when large. Engine mediaLibrary / mediaGet for reopen */
  dataUrl?: string;
  createdAt: string;
  real?: boolean;
  source?: string;
  /** Chat that produced this media (used when deleting / History overflow) */
  chatId?: string;
};

/** Unified Recent list entry (ChatGPT-style). */
export type RecentChat = {
  id: string;
  mode: 'general' | 'image' | 'video' | 'code' | 'voice';
  title: string;
  updatedAt: string;
  /** Last message snippet for the sidebar. */
  preview?: string;
  pinnedAt?: string;
  /** Optional link to media library item for image/video threads */
  creationId?: string;
  /** When set, chat left Recent and lives in History only */
  archivedAt?: string;
};

const PROJECTS_KEY = 'NOVA:recent-projects';
const CREATIONS_KEY = 'NOVA:recent-creations';
const CHATS_KEY = 'NOVA:recent-chats';
const DELETED_MEDIA_KEY = 'NOVA:deleted-media-ids';
const DELETED_CHATS_KEY = 'NOVA:deleted-chat-ids';
const DELETED_PROJECTS_KEY = 'NOVA:deleted-project-keys';

/** Keep Recent short; older unpinned chats move to History overflow. */
const RECENT_SIDEBAR_MAX = 4;
const HISTORY_KEEP = 80;

export { RECENT_SIDEBAR_MAX };

/** In-memory thumbs so sidebar/viewer work without stuffing localStorage. */
const memoryThumbs = new Map<string, string>();

export function rememberThumb(id: string, dataUrl?: string) {
  if (id && dataUrl) memoryThumbs.set(id, dataUrl);
}

export function getMemoryThumb(id: string) {
  return memoryThumbs.get(id);
}

/** Pixels for vision APIs from ark-media ids already stored via rememberThumb. */
export function extractVisionImages(content: string): { mime: string; data: string }[] {
  const ids = [...String(content || '').matchAll(/!\[[^\]]*]\(nova-media:([^)]+)\)/g)]
    .map(m => m[1].trim())
    .filter(Boolean);
  const out: { mime: string; data: string }[] = [];
  for (const id of ids) {
    const url = getMemoryThumb(id);
    const m = url?.match(/^data:([^;]+);base64,(.+)$/);
    if (m) out.push({ mime: m[1], data: m[2] });
  }
  return out;
}

export function loadRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as RecentProject[]).filter((p) => !isProjectDeleted(p.id, p.diskPath, p.name));
  } catch {
    return [];
  }
}

export function saveRecentProjects(list: RecentProject[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list.slice(0, 30)));
}

export function renameRecentProject(id: string, name: string): RecentProject[] {
  const nextName = name.trim();
  if (!nextName) return loadRecentProjects();
  const list = loadRecentProjects().map(p =>
    p.id === id
      ? { ...p, name: nextName, updatedAt: new Date().toISOString() }
      : p,
  );
  saveRecentProjects(list);
  return list;
}

export function renameRecentChatTitle(chatId: string, title: string): RecentChat[] {
  const nextTitle = title.trim();
  if (!nextTitle) return loadRecentChats();
  const list = loadRecentChats().map(c =>
    c.id === chatId
      ? { ...c, title: nextTitle, updatedAt: new Date().toISOString() }
      : c,
  );
  saveRecentChats(list);
  try {
    window.dispatchEvent(new Event('NOVA:chats-changed'));
  } catch {
    /* ignore */
  }
  return list;
}

export function removeRecentProject(id: string, diskPath?: string | null, name?: string | null): RecentProject[] {
  // Always tombstone path/name from the stored row so a re-bind with a new proj-* id
  // cannot resurrect the same folder after delete.
  let existing: RecentProject | undefined;
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    const list = raw ? (JSON.parse(raw) as RecentProject[]) : [];
    existing = Array.isArray(list) ? list.find((p) => p.id === id) : undefined;
  } catch {
    existing = undefined;
  }
  markProjectDeleted(
    id,
    diskPath || existing?.diskPath || null,
    name || existing?.name || null,
  );
  const list = loadRecentProjects().filter(p => p.id !== id);
  saveRecentProjects(list);
  try {
    window.dispatchEvent(new Event('NOVA:projects-changed'));
  } catch {
    /* ignore */
  }
  return list;
}

/** Wipe legacy Code-project Recent rows (Chat + Code pill replaced that UI). */
export function clearRecentProjects(): RecentProject[] {
  saveRecentProjects([]);
  try {
    window.dispatchEvent(new Event('NOVA:projects-changed'));
  } catch {
    /* ignore */
  }
  return [];
}

/** Permanent project delete key (id, disk path, and/or folder name). */
export function projectDeleteKey(id?: string | null, diskPath?: string | null, name?: string | null): string[] {
  const keys: string[] = [];
  if (id) keys.push(`id:${id}`);
  if (diskPath) {
    const norm = String(diskPath).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    keys.push(`path:${norm}`);
    const base = norm.split('/').pop();
    if (base) keys.push(`name:${base}`);
  }
  if (name) keys.push(`name:${String(name).trim().toLowerCase()}`);
  return keys.filter(Boolean);
}

function loadDeletedProjectKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_PROJECTS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function markProjectDeleted(id?: string | null, diskPath?: string | null, name?: string | null) {
  const keys = projectDeleteKey(id, diskPath, name);
  if (!keys.length) return;
  const ids = loadDeletedProjectKeys();
  for (const k of keys) ids.add(k);
  try {
    localStorage.setItem(DELETED_PROJECTS_KEY, JSON.stringify([...ids].slice(-500)));
  } catch {
    /* ignore */
  }
}

export function isProjectDeleted(id?: string | null, diskPath?: string | null, name?: string | null): boolean {
  const deleted = loadDeletedProjectKeys();
  if (!deleted.size) return false;
  return projectDeleteKey(id, diskPath, name).some((k) => deleted.has(k));
}

/** Put a project in Recent only when the user actually works in it (chat / files). */
export function ensureRecentProject(id: string, name?: string, diskPath?: string): RecentProject[] {
  if (!id || id.startsWith('demo-')) return loadRecentProjects();
  if (isProjectDeleted(id, diskPath, name)) return loadRecentProjects();
  // Also block path-only resurrection when id is new but folder was deleted before.
  if (diskPath && isProjectDeleted(null, diskPath, name || null)) return loadRecentProjects();
  const list = loadRecentProjects();
  const label = (name || '').trim() || 'Code project';
  const existing = list.find(p => p.id === id);
  const nextEntry: RecentProject = {
    id,
    name: existing?.name || label,
    kind: 'project',
    updatedAt: new Date().toISOString(),
    pinnedAt: existing?.pinnedAt,
    diskPath: diskPath || existing?.diskPath,
  };
  const next = [nextEntry, ...list.filter(p => p.id !== id)].slice(0, 30);
  saveRecentProjects(next);
  try {
    window.dispatchEvent(new Event('NOVA:projects-changed'));
  } catch {
    /* ignore */
  }
  return next;
}

export function loadRecentCreations(): RecentCreation[] {
  try {
    const raw = localStorage.getItem(CREATIONS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentCreation[];
    return list.map(c => ({
      ...c,
      dataUrl: c.dataUrl || memoryThumbs.get(c.id),
    }));
  } catch {
    return [];
  }
}

export function saveRecentCreations(list: RecentCreation[]) {
  // Metadata only. never persist base64 media in localStorage
  const metaOnly = list.slice(0, 60).map(({ dataUrl: _d, ...rest }) => rest);
  try {
    localStorage.setItem(CREATIONS_KEY, JSON.stringify(metaOnly));
  } catch {
    try {
      localStorage.setItem(CREATIONS_KEY, JSON.stringify(metaOnly.slice(0, 20)));
    } catch {
      /* ignore */
    }
  }
}

export function upsertCreation(entry: RecentCreation) {
  if (isMediaDeleted(entry.id)) return loadRecentCreations();
  if (entry.dataUrl) rememberThumb(entry.id, entry.dataUrl);
  const prev = loadRecentCreations().find(c => c.id === entry.id);
  const list = loadRecentCreations().filter(c => c.id !== entry.id);
  list.unshift({
    ...prev,
    ...entry,
    chatId: entry.chatId ?? prev?.chatId,
    dataUrl: entry.dataUrl || memoryThumbs.get(entry.id),
  });
  saveRecentCreations(list);
  window.dispatchEvent(new Event('NOVA:creations-changed'));
  return list;
}

export function loadRecentChats(): RecentChat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentChat[];
    const deleted = loadDeletedChatIds();
    const filtered = (Array.isArray(list) ? list : []).filter(c => c?.id && !deleted.has(c.id));
    const capped = capRecentAndArchive(filtered);
    const activeBefore = filtered.filter(c => !c.archivedAt).length;
    const activeAfter = capped.filter(c => !c.archivedAt).length;
    const archivedBefore = filtered.filter(c => c.archivedAt).length;
    const archivedAfter = capped.filter(c => c.archivedAt).length;
    if (
      activeBefore !== activeAfter
      || archivedBefore !== archivedAfter
      || capped.length !== filtered.length
      || filtered.length !== (Array.isArray(list) ? list.length : 0)
    ) {
      try {
        localStorage.setItem(CHATS_KEY, JSON.stringify(capped));
      } catch {
        /* ignore */
      }
    }
    return capped;
  } catch {
    return [];
  }
}

function capRecentAndArchive(list: RecentChat[]): RecentChat[] {
  const pinned = list.filter(c => c.pinnedAt && !c.archivedAt);
  const active = list
    .filter(c => !c.archivedAt && !c.pinnedAt)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const alreadyArchived = list.filter(c => c.archivedAt);
  const keepActive = active.slice(0, RECENT_SIDEBAR_MAX);
  const overflow = active.slice(RECENT_SIDEBAR_MAX).map(c => ({
    ...c,
    archivedAt: c.archivedAt || new Date().toISOString(),
  }));
  const archived = [...overflow, ...alreadyArchived]
    .sort((a, b) => (b.archivedAt || b.updatedAt || '').localeCompare(a.archivedAt || a.updatedAt || ''))
    .slice(0, HISTORY_KEEP);
  // Deduplicate by id (pinned/active win)
  const seen = new Set<string>();
  const out: RecentChat[] = [];
  for (const c of [...pinned, ...keepActive, ...archived]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

export function saveRecentChats(list: RecentChat[]) {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(capRecentAndArchive(list)));
  } catch {
    /* ignore */
  }
}

export function upsertRecentChat(entry: RecentChat) {
  // Permanent deletes must stick — ignore resurrecting upserts for tombstoned ids.
  if (isChatDeleted(entry.id)) {
    return loadRecentChats();
  }
  const prev = loadRecentChats().find(c => c.id === entry.id);
  const merged: RecentChat = {
    ...prev,
    ...entry,
    pinnedAt: entry.pinnedAt ?? prev?.pinnedAt,
    preview: entry.preview ?? prev?.preview,
    // Activity restores the thread into Recent (out of History overflow).
    archivedAt: undefined,
  };
  const list = loadRecentChats().filter(c => c.id !== entry.id);
  list.unshift(merged);
  saveRecentChats(list);
  window.dispatchEvent(new Event('NOVA:chats-changed'));
  return list;
}

export function togglePinnedChat(chatId: string): RecentChat[] {
  const list = loadRecentChats().map(c =>
    c.id === chatId
      ? { ...c, pinnedAt: c.pinnedAt ? undefined : new Date().toISOString() }
      : c,
  );
  saveRecentChats(list);
  window.dispatchEvent(new Event('NOVA:chats-changed'));
  return list;
}

export function togglePinnedProject(id: string): RecentProject[] {
  const list = loadRecentProjects().map(p =>
    p.id === id
      ? { ...p, pinnedAt: p.pinnedAt ? undefined : new Date().toISOString() }
      : p,
  );
  saveRecentProjects(list);
  window.dispatchEvent(new Event('NOVA:projects-changed'));
  return list;
}

export function comparePinnedThenRecent(
  a: { pinnedAt?: string; updatedAt?: string },
  b: { pinnedAt?: string; updatedAt?: string },
) {
  const ap = Boolean(a.pinnedAt);
  const bp = Boolean(b.pinnedAt);
  if (ap !== bp) return ap ? -1 : 1;
  return (b.updatedAt || '').localeCompare(a.updatedAt || '');
}

/** Active Recent sidebar list (excludes archived). */
export function loadActiveRecentChats(): RecentChat[] {
  return loadRecentChats().filter(c => !c.archivedAt);
}

/** Move chat out of Recent into History. */
export function archiveRecentChat(chatId: string) {
  const list = loadRecentChats().map(c =>
    c.id === chatId
      ? { ...c, archivedAt: c.archivedAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
      : c,
  );
  saveRecentChats(list);
  window.dispatchEvent(new Event('NOVA:chats-changed'));
  return list;
}

/** Known per-chat keys (no full localStorage scan). */
function removeKnownChatKeys(chatId: string) {
  try {
    localStorage.removeItem(`NOVA:chat-studio-files:${chatId}`);
    localStorage.removeItem(`NOVA:chat-studio:${chatId}`);
    localStorage.removeItem(`NOVA:chat-code-pill:${chatId}`);
    localStorage.removeItem(`NOVA:chat-build-memory:${chatId}`);
    localStorage.removeItem(`NOVA:chat-plan-pill:${chatId}`);
    localStorage.removeItem(`NOVA:chat-plan:${chatId}`);
    localStorage.removeItem(`NOVA:plan-nudge-at:${chatId}`);
    localStorage.removeItem(chatThreadKey(chatId));
  } catch {
    /* ignore */
  }
}

function wipeLinkedChatProjects(chatId: string, opts?: { quiet?: boolean }) {
  try {
    const raw = localStorage.getItem(`NOVA:chat-build-memory:${chatId}`);
    if (raw) {
      const mem = JSON.parse(raw) as { projectId?: string | null };
      const pid = String(mem?.projectId || '').trim();
      if (pid) {
        void window.novaDesktop?.projectDeleteFiles?.(pid)?.catch?.(() => undefined);
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const linked = loadRecentProjects().filter(
      (p) => p.id === chatId || p.id === `chat:${chatId}` || p.id.startsWith(`${chatId}-`),
    );
    if (!linked.length) return;

    if (opts?.quiet) {
      for (const p of linked) {
        void window.novaDesktop?.projectDeleteFiles?.(p.id)?.catch?.(() => undefined);
        if (p.diskPath) {
          void window.novaDesktop?.workspaceDeleteFolder?.({ targetPath: p.diskPath })?.catch?.(() => undefined);
        }
        markProjectDeleted(p.id, p.diskPath || null, p.name || null);
      }
      const drop = new Set(linked.map((p) => p.id));
      saveRecentProjects(loadRecentProjects().filter((x) => !drop.has(x.id)));
      return;
    }

    for (const p of linked) {
      void window.novaDesktop?.projectDeleteFiles?.(p.id)?.catch?.(() => undefined);
      if (p.diskPath) {
        void window.novaDesktop?.workspaceDeleteFolder?.({ targetPath: p.diskPath })?.catch?.(() => undefined);
      }
      removeRecentProject(p.id, p.diskPath, p.name);
    }
  } catch {
    /* ignore */
  }
}

function removeLocalStorageKeysMatching(ids: Set<string>) {
  if (!ids.size) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      for (const id of ids) {
        if (k.includes(id)) {
          keys.push(k);
          break;
        }
      }
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/**
 * Permanently wipe a chat and linked local data (thread, creation meta, thumbs, project folder).
 * Does not leave a recoverable copy on this PC.
 */
export function deleteRecentChatPermanently(chatId: string) {
  const existing = loadRecentChats().find(c => c.id === chatId);
  const mediaIds = collectChatMediaIds(chatId, existing?.creationId);

  markChatDeleted(chatId);
  wipeLinkedChatProjects(chatId);
  removeKnownChatKeys(chatId);

  const nextChats = loadRecentChats().filter(c => c.id !== chatId);
  saveRecentChats(nextChats);

  removeLocalStorageKeysMatching(new Set([chatId]));

  for (const creationId of mediaIds) {
    wipeCreationLocal(creationId);
  }

  saveRecentCreations(loadRecentCreations().filter(c => c.chatId !== chatId));

  window.dispatchEvent(new Event('NOVA:chats-changed'));
  window.dispatchEvent(new Event('NOVA:creations-changed'));
  return nextChats;
}

/**
 * Bulk permanent wipe — one deleted-id write, one localStorage scan, one chats/creations save,
 * one UI event. Avoids freezing the composer (~5s) after deleting many History rows.
 */
export function deleteRecentChatsPermanentlyBulk(chatIds: string[]): number {
  const ids = [...new Set((chatIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return 0;

  const idSet = new Set(ids);
  const chats = loadRecentChats();
  const mediaIds = new Set<string>();

  // One tombstone write for all ids.
  markChatsDeleted(ids);

  for (const chatId of ids) {
    const existing = chats.find((c) => c.id === chatId);
    for (const mid of collectChatMediaIds(chatId, existing?.creationId)) {
      mediaIds.add(mid);
    }
    wipeLinkedChatProjects(chatId, { quiet: true });
    removeKnownChatKeys(chatId);
  }

  // One leftover key scan for the whole batch.
  removeLocalStorageKeysMatching(idSet);

  for (const creationId of mediaIds) {
    markMediaDeleted(creationId);
    memoryThumbs.delete(creationId);
    try {
      localStorage.removeItem(`NOVA:chat-thread:creation:${creationId}`);
      localStorage.removeItem(`NOVA:media-feedback:${creationId}`);
    } catch {
      /* ignore */
    }
    void window.novaDesktop?.mediaRemove?.(creationId)?.catch?.(() => undefined);
  }

  saveRecentChats(loadRecentChats().filter((c) => !idSet.has(c.id)));
  saveRecentCreations(
    loadRecentCreations().filter(
      (c) => !mediaIds.has(c.id) && (!c.chatId || !idSet.has(c.chatId)),
    ),
  );

  window.dispatchEvent(new Event('NOVA:chats-changed'));
  window.dispatchEvent(new Event('NOVA:creations-changed'));
  window.dispatchEvent(new Event('NOVA:projects-changed'));
  try {
    window.dispatchEvent(
      new CustomEvent('NOVA:chats-bulk-deleted', { detail: { chatIds: ids } }),
    );
  } catch {
    /* ignore */
  }
  return ids.length;
}

function loadDeletedMediaIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_MEDIA_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function loadDeletedChatIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_CHATS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

/** Tombstone so upserts cannot resurrect a forever-deleted chat. */
export function markChatDeleted(id: string) {
  if (!id) return;
  markChatsDeleted([id]);
}

/** Batch tombstone write — used by bulk History delete. */
export function markChatsDeleted(chatIds: string[]) {
  const add = (chatIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  if (!add.length) return;
  const ids = loadDeletedChatIds();
  for (const id of add) ids.add(id);
  try {
    localStorage.setItem(DELETED_CHATS_KEY, JSON.stringify([...ids].slice(-400)));
  } catch {
    /* ignore */
  }
}

export function isChatDeleted(id: string) {
  return Boolean(id) && loadDeletedChatIds().has(id);
}

export function markMediaDeleted(id: string) {
  if (!id) return;
  const ids = loadDeletedMediaIds();
  ids.add(id);
  try {
    localStorage.setItem(DELETED_MEDIA_KEY, JSON.stringify([...ids].slice(-240)));
  } catch {
    /* ignore */
  }
}

export function isMediaDeleted(id: string) {
  return Boolean(id) && loadDeletedMediaIds().has(id);
}

export function collectChatMediaIds(chatId: string, creationId?: string): string[] {
  const ids = new Set<string>();
  if (creationId) ids.add(creationId);
  try {
    const raw = localStorage.getItem(chatThreadKey(chatId));
    if (raw) {
      for (const m of raw.matchAll(/nova-media:([A-Za-z0-9_-]+)/g)) ids.add(m[1]);
      for (const m of raw.matchAll(/"libraryId"\s*:\s*"([^"]+)"/g)) ids.add(m[1]);
    }
  } catch {
    /* ignore */
  }
  try {
    if (creationId) {
      const raw = localStorage.getItem(`NOVA:chat-thread:creation:${creationId}`);
      if (raw) {
        for (const m of raw.matchAll(/nova-media:([A-Za-z0-9_-]+)/g)) ids.add(m[1]);
      }
    }
  } catch {
    /* ignore */
  }
  for (const c of loadRecentCreations()) {
    if (c.chatId === chatId) ids.add(c.id);
  }
  return [...ids];
}

function wipeCreationLocal(creationId: string) {
  if (!creationId) return;
  markMediaDeleted(creationId);
  memoryThumbs.delete(creationId);
  const nextCreations = loadRecentCreations().filter(c => c.id !== creationId);
  saveRecentCreations(nextCreations);
  try {
    localStorage.removeItem(`NOVA:chat-thread:creation:${creationId}`);
    localStorage.removeItem(`NOVA:media-feedback:${creationId}`);
  } catch {
    /* ignore */
  }
  void window.novaDesktop?.mediaRemove?.(creationId)?.catch?.(() => undefined);
}

export function deleteCreationPermanently(creationId: string) {
  if (!creationId) return loadRecentCreations();
  const linkedChatIds = loadRecentChats()
    .filter(c => c.creationId === creationId)
    .map(c => c.id);

  wipeCreationLocal(creationId);

  for (const chatId of linkedChatIds) {
    const otherMedia = collectChatMediaIds(chatId).filter(id => id !== creationId);
    for (const id of otherMedia) wipeCreationLocal(id);

    saveRecentChats(loadRecentChats().filter(c => c.id !== chatId));
    try {
      localStorage.removeItem(chatThreadKey(chatId));
    } catch {
      /* ignore */
    }
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
      for (const k of keys) {
        if (k.includes(chatId)) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  }

  saveRecentChats(
    loadRecentChats().map(c =>
      c.creationId === creationId ? { ...c, creationId: undefined } : c,
    ),
  );

  window.dispatchEvent(new Event('NOVA:creations-changed'));
  window.dispatchEvent(new Event('NOVA:chats-changed'));
  return loadRecentCreations();
}

export function titleFromPrompt(prompt: string): string {
  let cleaned = String(prompt || '')
    .replace(/<!--nova-attach:[\s\S]*?-->/g, '')
    .replace(/<!--nova-auto-read-->/g, '')
    .replace(/^Agent mode\.[^\n]*\n+/i, '')
    .replace(/^Plan this out step by step[^\n]*\n+/i, '')
    .replace(/^Debug this\.[^\n]*/i, '')
    .replace(/<!--nova-debug-clinic-->\s*/gi, '')
    .replace(/<!--nova-plan-mode-->\s*/gi, '')
    .replace(/<!--nova-agent-mode-->\s*/gi, '')
    .replace(/<!--nova-multi-agent-->\s*/gi, '')
    .replace(/^\[Debug\]\s*/i, '')
    .replace(/^\[Agent\]\s*/i, '')
    .replace(/^\[Multi-agent\]\s*/i, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return 'New chat';
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 38).trim()}…`;
}

export function chatThreadKey(chatId: string) {
  return `NOVA:chat-thread:chat:${chatId}`;
}

export async function resolveCreationDataUrl(creation: RecentCreation): Promise<string | null> {
  if (creation.dataUrl) return creation.dataUrl;
  const mem = memoryThumbs.get(creation.id);
  if (mem) return mem;
  try {
    if (window.novaDesktop?.mediaGet) {
      const res = await window.novaDesktop.mediaGet(creation.id);
      if (res?.ok && res.item?.dataUrl) {
        rememberThumb(creation.id, res.item.dataUrl);
        return res.item.dataUrl;
      }
    }
    const res = await window.novaDesktop?.mediaLibrary?.();
    const hit = res?.items?.find(i => i.id === creation.id);
    if (hit?.dataUrl) {
      rememberThumb(creation.id, hit.dataUrl);
      return hit.dataUrl;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function resolveMediaRef(id: string): Promise<string | null> {
  if (!id || id === 'inline') return null;
  const mem = memoryThumbs.get(id);
  if (mem) return mem;
  return resolveCreationDataUrl({
    id,
    kind: 'image',
    title: '',
    prompt: '',
    modelName: '',
    createdAt: '',
  });
}

/** Strip huge data URLs from chat threads before localStorage. Prefer library ids. */
export function slimChatContent(content: string, libraryId?: string): string {
  return content
    .replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, (_m, alt) => {
      const id = libraryId || 'inline';
      return `![${alt || 'NOVA generation'}](nova-media:${id})`;
    })
    .replace(/!\[([^\]]*)\]\((data:video\/[^)]+)\)/g, (_m, alt) => {
      const id = libraryId || 'inline';
      return `![${alt || 'NOVA generation'}](nova-media:${id})`;
    });
}

export function mediaMessageMarkdown(
  alt: string,
  libraryId: string,
  dataUrl?: string,
  opts?: { real?: boolean; kind?: 'image' | 'video'; source?: string },
): string {
  const safe = (alt || 'NOVA generation').slice(0, 80).replace(/[\[\]]/g, '');
  const body = dataUrl ? `![${safe}](${dataUrl})` : `![${safe}](nova-media:${libraryId})`;
  const sourceLine = '';
  if (opts?.source?.includes('motion-still')) {
    return [
      'Short motion clip · MP4 from a still (not generative video)',
      sourceLine,
      body,
    ].filter(Boolean).join('\n\n');
  }
  if (opts?.real === false) {
    const label = opts.kind === 'video'
      ? 'Video preview · not a finished MP4'
      : 'Image preview · not a finished generation';
    return [label, sourceLine, body].filter(Boolean).join('\n\n');
  }
  return [sourceLine, body].filter(Boolean).join('\n\n');
}

export function feedbackKey(id: string) {
  return `NOVA:media-feedback:${id}`;
}

export type MediaFeedback = 'like' | 'dislike' | null;

export function getMediaFeedback(id: string): MediaFeedback {
  try {
    const v = localStorage.getItem(feedbackKey(id));
    if (v === 'like' || v === 'dislike') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function setMediaFeedback(id: string, value: MediaFeedback) {
  try {
    if (!value) localStorage.removeItem(feedbackKey(id));
    else localStorage.setItem(feedbackKey(id), value);
  } catch {
    /* ignore */
  }
}
