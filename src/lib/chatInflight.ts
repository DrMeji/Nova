/**
 * Track in-flight Chat/Image generations so App can keep AIChat mounted
 * while the user visits Settings / Models / etc.
 *
 * Wave 2: Map chatId → jobId; legacy no-arg begin/end still works for AIChat.
 */

type Listener = () => void;

/** chatId → jobId (empty string when unknown). */
const byChat = new Map<string, string>();
/** Most recent beginChatInflight chat — engineGenerate auto-attaches jobId. */
let lastChatId: string | null = null;
/** Legacy counter for beginChatInflight() / endChatInflight() without chatId. */
let legacyCount = 0;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(fn => {
    try { fn(); } catch { /* ignore */ }
  });
}

/**
 * Mark a chat generation in flight.
 * @param chatId optional — omit for legacy AIChat call sites
 * @param jobId optional create/preview job id
 */
export function beginChatInflight(chatId?: string, jobId?: string) {
  const id = String(chatId || '').trim();
  if (id) {
    byChat.set(id, jobId != null ? String(jobId) : (byChat.get(id) || ''));
    lastChatId = id;
  } else {
    legacyCount += 1;
  }
  notify();
}

/**
 * Clear one inflight slot. Without chatId: drain legacy first, then one mapped chat
 * (keeps `while (hasChatInflight()) endChatInflight()` Stop-safe).
 */
export function endChatInflight(chatId?: string) {
  const id = String(chatId || '').trim();
  if (id) {
    byChat.delete(id);
    if (lastChatId === id) {
      const keys = [...byChat.keys()];
      lastChatId = keys.length ? keys[keys.length - 1]! : null;
    }
  } else if (legacyCount > 0) {
    legacyCount = Math.max(0, legacyCount - 1);
  } else if (byChat.size > 0) {
    const first = byChat.keys().next().value;
    if (first != null) {
      byChat.delete(first);
      if (lastChatId === first) {
        const keys = [...byChat.keys()];
        lastChatId = keys.length ? keys[keys.length - 1]! : null;
      }
    }
  }
  notify();
}

/** App.tsx keep-alive: any chat or legacy gen still running. */
export function hasChatInflight(): boolean {
  return byChat.size > 0 || legacyCount > 0;
}

/** True when this chatId still has an in-flight generation (tab switches must not interrupt). */
export function isChatInflight(chatId: string | null | undefined): boolean {
  const id = String(chatId || '').trim();
  if (!id) return false;
  return byChat.has(id);
}

/** Chat ids with active work — Recent sidebar pulse. */
export function listInflightChatIds(): string[] {
  return [...byChat.keys()];
}

export function getChatJobId(chatId: string): string | null {
  const id = String(chatId || '').trim();
  if (!id) return null;
  const jobId = byChat.get(id);
  return jobId != null && jobId !== '' ? jobId : null;
}

/** Latest chat that called beginChatInflight — used to stamp GGUF jobId on generate. */
export function getLastInflightChatId(): string | null {
  return lastChatId;
}

/** Clear all slots — call on App mount so a prior crash can't leave Chat stuck alive. */
export function cancelAll(): void {
  byChat.clear();
  legacyCount = 0;
  lastChatId = null;
  notify();
}

/** @deprecated alias — prefer cancelAll */
export const cancelAllChatInflight = cancelAll;

export function subscribeChatInflight(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
