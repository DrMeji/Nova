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
