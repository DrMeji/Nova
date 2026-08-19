import type { ChatMessage } from '@/types';
import { safeProjectWrite } from '@/lib/projectWriteSafe';

export const PROJECT_CHAT_FILE = 'ark-chat.json';

function threadKey(projectId: string) {
  return `ark:project-thread:${projectId}`;
}

function slim(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(m => m?.role && String(m.content || '').trim())
    .slice(-80);
}

export function parseProjectThread(raw: string | undefined | null): ChatMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed)
      ? parsed.filter(m => m && m.role && typeof m.content === 'string')
      : [];
  } catch {
    return [];
  }
}

export function serializeProjectThread(messages: ChatMessage[]): string {
  return JSON.stringify(slim(messages), null, 2);
}

export function loadProjectThread(projectId: string): ChatMessage[] {
  if (!projectId) return [];
  try {
    return parseProjectThread(localStorage.getItem(threadKey(projectId)));
  } catch {
    return [];
  }
}

export function saveProjectThread(projectId: string, messages: ChatMessage[]) {
  if (!projectId) return;
  try {
    localStorage.setItem(threadKey(projectId), serializeProjectThread(messages));
  } catch {
    /* quota */
  }
}

/** Prefer the longer, newer thread when disk and localStorage disagree. */
export function mergeProjectThreads(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const pick = a.length >= b.length ? a : b;
  return slim(pick);
}

export async function persistProjectThreadToDisk(
  projectId: string,
  projectName: string | undefined,
  messages: ChatMessage[],
  files?: Record<string, string>,
): Promise<void> {
  if (!projectId) return;
  const payload: Record<string, string> = { ...(files || {}) };
  payload[PROJECT_CHAT_FILE] = serializeProjectThread(messages);
  delete payload['ark-meta.json'];
  await safeProjectWrite({
    projectId,
    projectName: projectName || 'Code',
    files: payload,
  });
}
