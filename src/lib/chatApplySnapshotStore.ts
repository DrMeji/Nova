/**
 * Per-turn file snapshot for Chat undo (restore last apply).
 */

export type ApplySnapshot = {
  chatId: string;
  assistantId: string;
  diskRoot: string | null;
  files: Record<string, string>;
  updatedPaths: string[];
  at: number;
};

const byChat = new Map<string, ApplySnapshot>();
/** Files as they were just before undo — so redo can put the forward change back. */
const redoByChat = new Map<string, ApplySnapshot>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => {
    try { l(); } catch { /* ignore */ }
  });
}

export function subscribeApplySnapshots(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function pushApplySnapshot(snap: ApplySnapshot): void {
  byChat.set(snap.chatId, snap);
  redoByChat.delete(snap.chatId);
  emit();
}

export function getApplySnapshot(chatId: string): ApplySnapshot | null {
  return byChat.get(chatId) || null;
}

export function clearApplySnapshot(chatId: string): void {
  if (!byChat.has(chatId)) return;
  byChat.delete(chatId);
  emit();
}

export function pushRedoSnapshot(snap: ApplySnapshot): void {
  redoByChat.set(snap.chatId, snap);
  emit();
}

export function getRedoSnapshot(chatId: string): ApplySnapshot | null {
  return redoByChat.get(chatId) || null;
}

export function clearRedoSnapshot(chatId: string): void {
  if (!redoByChat.has(chatId)) return;
  redoByChat.delete(chatId);
  emit();
}

/** Restore snapshot files via applyChatReplyEdits-style @@@FILE blocks. */
export function snapshotToRevertBlocks(snap: ApplySnapshot): string {
  return snap.updatedPaths
    .filter((p) => snap.files[p] != null)
    .map((p) => `@@@FILE ${p}\n${snap.files[p]}`)
    .join('\n');
}
