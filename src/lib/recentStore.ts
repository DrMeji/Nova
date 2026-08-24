/** Persisted Recent: projects + creation metadata (media bytes stay in Engine). */

export type RecentProject = {
  id: string;
  name: string;
  kind?: 'project';
  updatedAt?: string;
  pinnedAt?: string;
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
  mode: 'general' | 'image' | 'video' | 'code';
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

const PROJECTS_KEY = 'ark:recent-projects';
const CREATIONS_KEY = 'ark:recent-creations';
const CHATS_KEY = 'ark:recent-chats';
const DELETED_MEDIA_KEY = 'ark:deleted-media-ids';

/** Keep Recent short; older unpinned chats move to History. */
const RECENT_SIDEBAR_MAX = 12;
const HISTORY_KEEP = 80;

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
  const ids = [...String(content || '').matchAll(/!\[[^\]]*]\(ark-media:([^)]+)\)/g)]
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
    return JSON.parse(raw) as RecentProject[];
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
    window.dispatchEvent(new Event('ark:chats-changed'));
  } catch {
    /* ignore */
  }
  return list;
}

export function removeRecentProject(id: string): RecentProject[] {
  const list = loadRecentProjects().filter(p => p.id !== id);
  saveRecentProjects(list);
  return list;
}

/** Put a project in Recent only when the user actually works in it (chat / files). */
export function ensureRecentProject(id: string, name?: string): RecentProject[] {
  if (!id || id.startsWith('demo-')) return loadRecentProjects();
  const list = loadRecentProjects();
  const label = (name || '').trim() || 'Code project';
  const existing = list.find(p => p.id === id);
  const nextEntry: RecentProject = {
    id,
    name: existing?.name || label,
    kind: 'project',
    updatedAt: new Date().toISOString(),
    pinnedAt: existing?.pinnedAt,
  };
  const next = [nextEntry, ...list.filter(p => p.id !== id)].slice(0, 30);
  saveRecentProjects(next);
  try {
    window.dispatchEvent(new Event('ark:projects-changed'));
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
  window.dispatchEvent(new Event('ark:creations-changed'));
  return list;
}

export function loadRecentChats(): RecentChat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentChat[];
    const capped = capRecentAndArchive(Array.isArray(list) ? list : []);
    const activeBefore = list.filter(c => !c.archivedAt).length;
    const activeAfter = capped.filter(c => !c.archivedAt).length;
    const archivedBefore = list.filter(c => c.archivedAt).length;
    const archivedAfter = capped.filter(c => c.archivedAt).length;
    if (activeBefore !== activeAfter || archivedBefore !== archivedAfter || capped.length !== list.length) {
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
  window.dispatchEvent(new Event('ark:chats-changed'));
  return list;
}

export function togglePinnedChat(chatId: string): RecentChat[] {
  const list = loadRecentChats().map(c =>
    c.id === chatId
      ? { ...c, pinnedAt: c.pinnedAt ? undefined : new Date().toISOString() }
      : c,
  );
  saveRecentChats(list);
  window.dispatchEvent(new Event('ark:chats-changed'));
  return list;
}

export function togglePinnedProject(id: string): RecentProject[] {
  const list = loadRecentProjects().map(p =>
    p.id === id
      ? { ...p, pinnedAt: p.pinnedAt ? undefined : new Date().toISOString() }
      : p,
  );
  saveRecentProjects(list);
  window.dispatchEvent(new Event('ark:projects-changed'));
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
  window.dispatchEvent(new Event('ark:chats-changed'));
  return list;
}

/**
 * Permanently wipe a chat and linked local data (thread, creation meta, thumbs).
 * Does not leave a recoverable copy on this PC.
 */
export function deleteRecentChatPermanently(chatId: string) {
  const existing = loadRecentChats().find(c => c.id === chatId);
  const mediaIds = collectChatMediaIds(chatId, existing?.creationId);

  const nextChats = loadRecentChats().filter(c => c.id !== chatId);
  saveRecentChats(nextChats);

  try {
    localStorage.removeItem(chatThreadKey(chatId));
  } catch {
    /* ignore */
  }

  // Clear any draft/thread keys that reference this id
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

  for (const creationId of mediaIds) {
    wipeCreationLocal(creationId);
  }

  // Drop any leftover creations still tagged to this chat
  saveRecentCreations(loadRecentCreations().filter(c => c.chatId !== chatId));

  window.dispatchEvent(new Event('ark:chats-changed'));
  window.dispatchEvent(new Event('ark:creations-changed'));
  return nextChats;
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
      for (const m of raw.matchAll(/ark-media:([A-Za-z0-9_-]+)/g)) ids.add(m[1]);
      for (const m of raw.matchAll(/"libraryId"\s*:\s*"([^"]+)"/g)) ids.add(m[1]);
    }
  } catch {
    /* ignore */
  }
  try {
    if (creationId) {
      const raw = localStorage.getItem(`ark:chat-thread:creation:${creationId}`);
      if (raw) {
        for (const m of raw.matchAll(/ark-media:([A-Za-z0-9_-]+)/g)) ids.add(m[1]);
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
    localStorage.removeItem(`ark:chat-thread:creation:${creationId}`);
    localStorage.removeItem(`ark:media-feedback:${creationId}`);
  } catch {
    /* ignore */
  }
  void window.arkDesktop?.mediaRemove?.(creationId)?.catch?.(() => undefined);
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

  window.dispatchEvent(new Event('ark:creations-changed'));
  window.dispatchEvent(new Event('ark:chats-changed'));
  return loadRecentCreations();
}

export function titleFromPrompt(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New chat';
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 38).trim()}…`;
}

export function chatThreadKey(chatId: string) {
  return `ark:chat-thread:chat:${chatId}`;
}

export async function resolveCreationDataUrl(creation: RecentCreation): Promise<string | null> {
  if (creation.dataUrl) return creation.dataUrl;
  const mem = memoryThumbs.get(creation.id);
  if (mem) return mem;
  try {
    if (window.arkDesktop?.mediaGet) {
      const res = await window.arkDesktop.mediaGet(creation.id);
      if (res?.ok && res.item?.dataUrl) {
        rememberThumb(creation.id, res.item.dataUrl);
        return res.item.dataUrl;
      }
    }
    const res = await window.arkDesktop?.mediaLibrary?.();
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
      return `![${alt || 'ARK generation'}](ark-media:${id})`;
    })
    .replace(/!\[([^\]]*)\]\((data:video\/[^)]+)\)/g, (_m, alt) => {
      const id = libraryId || 'inline';
      return `![${alt || 'ARK generation'}](ark-media:${id})`;
    });
}

export function mediaMessageMarkdown(
  alt: string,
  libraryId: string,
  dataUrl?: string,
  opts?: { real?: boolean; kind?: 'image' | 'video'; source?: string },
): string {
  const safe = (alt || 'ARK generation').slice(0, 80).replace(/[\[\]]/g, '');
  const body = dataUrl ? `![${safe}](${dataUrl})` : `![${safe}](ark-media:${libraryId})`;
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
  return `ark:media-feedback:${id}`;
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
