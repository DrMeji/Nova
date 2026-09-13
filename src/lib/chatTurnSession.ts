/**
 * Turn session helpers — status goes to the store, not setMessages.
 */

import { setChatTurnStatus, clearChatTurnStatus } from '@/lib/chatTurnStatusStore';

export function pushTurnStatus(opts: {
  chatId: string;
  assistantId: string;
  label: string;
}): void {
  const label = String(opts.label || '').trim();
  if (!label) return;
  setChatTurnStatus({
    chatId: opts.chatId,
    assistantId: opts.assistantId,
    label,
  });
}

export function clearTurnStatus(assistantId?: string): void {
  clearChatTurnStatus(assistantId);
}
