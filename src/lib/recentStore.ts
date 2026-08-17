/** Persisted Recent: projects + creation metadata (media bytes stay in Engine). */

export type RecentProject = { id: string; name: string; kind?: 'project'; updatedAt?: string };

export type RecentCreation = {
  id: string;
  kind: 'image' | 'video';
  title: string;
  prompt: string;
  modelName: string;
  /** In-memory only when large — Engine mediaLibrary / mediaGet for reopen */
  dataUrl?: string;
  createdAt: string;
  real?: boolean;
  source?: string;
};

/** Unified Recent list entry (ChatGPT-style). */
export type RecentChat = {
  id: string;
  mode: 'general' | 'image' | 'video' | 'code';
  title: string;
  updatedAt: string;
  /** Optional link to media library item for image/video threads */
  creationId?: string;
  /** When set, chat left Recent and lives in History only */
  archivedAt?: string;
};

const PROJECTS_KEY = 'ark:recent-projects';
const CREATIONS_KEY = 'ark:recent-creations';
const CHATS_KEY = 'ark:recent-chats';

/** In-memory thumbs so sidebar/viewer work without stuffing localStorage. */
const memoryThumbs = new Map<string, string>();

export function rememberThumb(id: string, dataUrl?: string) {
  if (id && dataUrl) memoryThumbs.set(id, dataUrl);
}

export function getMemoryThumb(id: string) {
  return memoryThumbs.get(id);
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
  // Metadata only — never persist base64 media in localStorage
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
  if (entry.dataUrl) rememberThumb(entry.id, entry.dataUrl);
  const list = loadRecentCreations().filter(c => c.id !== entry.id);
  list.unshift({ ...entry, dataUrl: entry.dataUrl || memoryThumbs.get(entry.id) });
  saveRecentCreations(list);
  window.dispatchEvent(new Event('ark:creations-changed'));
  return list;
}

export function loadRecentChats(): RecentChat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentChat[];
  } catch {
    return [];
  }
}

export function saveRecentChats(list: RecentChat[]) {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

export function upsertRecentChat(entry: RecentChat) {
  const list = loadRecentChats().filter(c => c.id !== entry.id);
  list.unshift(entry);
  saveRecentChats(list);
  window.dispatchEvent(new Event('ark:chats-changed'));
  return list;
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
  const creationId = existing?.creationId;

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

  if (creationId) {
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

  window.dispatchEvent(new Event('ark:chats-changed'));
  window.dispatchEvent(new Event('ark:creations-changed'));
  return nextChats;
}

export function deleteCreationPermanently(creationId: string) {
  if (!creationId) return loadRecentCreations();
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

  // Detach chats that pointed at this creation
  const nextChats = loadRecentChats().map(c =>
    c.creationId === creationId ? { ...c, creationId: undefined } : c,
  );
  saveRecentChats(nextChats);

  window.dispatchEvent(new Event('ark:creations-changed'));
  window.dispatchEvent(new Event('ark:chats-changed'));
  return nextCreations;
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
  opts?: { real?: boolean; kind?: 'image' | 'video' },
): string {
  const safe = (alt || 'ARK generation').slice(0, 80).replace(/[\[\]]/g, '');
  const body = dataUrl ? `![${safe}](${dataUrl})` : `![${safe}](ark-media:${libraryId})`;
  if (opts?.real === false) {
    const label = opts.kind === 'video'
      ? 'Video preview · not a finished MP4'
      : 'Image preview · not a finished generation';
    return `${label}\n\n${body}`;
  }
  return body;
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
