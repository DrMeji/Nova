/**
 * Live turn status outside the messages array — avoids remounting chat on every status tick.
 */

export type ChatTurnStatus = {
  chatId: string;
  assistantId: string;
  label: string;
};

let current: ChatTurnStatus | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => {
    try { l(); } catch { /* ignore */ }
  });
}

export function getChatTurnStatus(): ChatTurnStatus | null {
  return current;
}

export function setChatTurnStatus(next: ChatTurnStatus | null): void {
  const prev = current;
  if (
    prev
    && next
    && prev.chatId === next.chatId
    && prev.assistantId === next.assistantId
    && prev.label === next.label
  ) {
    return;
  }
  current = next;
  emit();
}

export function clearChatTurnStatus(assistantId?: string): void {
  if (!current) return;
  if (assistantId && current.assistantId !== assistantId) return;
  current = null;
  emit();
}

export function subscribeChatTurnStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
