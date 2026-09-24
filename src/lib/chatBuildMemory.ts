/**
 * ChatBuildMemory — ProductSpec / LayoutContract SSOT per chat.
 * Rebuild/edit read this so craft does not drift the brand mid-thread.
 */

import type { CopyPack, LayoutContract, ProductSpec } from '@/lib/createLayoutContract';

export type ChatBuildMemory = {
  chatId: string;
  spec: ProductSpec;
  contract: LayoutContract;
  copy: CopyPack;
  lastPhase: string;
  projectId: string | null;
  updatedAt: number;
};

const KEY = (chatId: string) => `NOVA:chat-build-memory:${chatId}`;

export function saveChatBuildMemory(mem: ChatBuildMemory): void {
  const id = String(mem.chatId || '').trim();
  if (!id) return;
  try {
    localStorage.setItem(KEY(id), JSON.stringify({ ...mem, updatedAt: Date.now() }));
  } catch { /* ignore */ }
}

export function loadChatBuildMemory(chatId: string): ChatBuildMemory | null {
  const id = String(chatId || '').trim();
  if (!id) return null;
  try {
    const raw = localStorage.getItem(KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatBuildMemory;
    if (!parsed?.spec || !parsed?.contract) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearChatBuildMemory(chatId: string): void {
  try {
    localStorage.removeItem(KEY(String(chatId || '')));
  } catch { /* ignore */ }
}
