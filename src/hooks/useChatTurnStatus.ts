/**
 * Subscribe to chat turn status outside React message state.
 */
import { useSyncExternalStore } from 'react';
import {
  getChatTurnStatus,
  getFinishedChatTurnStatus,
  subscribeChatTurnStatus,
  type ChatTurnStatus,
} from '@/lib/chatTurnStatusStore';

export function useChatTurnStatus(assistantId?: string | null): ChatTurnStatus | null {
  const status = useSyncExternalStore(
    subscribeChatTurnStatus,
    getChatTurnStatus,
    getChatTurnStatus,
  );
  // Prefer finished snapshot only when this turn is no longer live.
  // Never flash “Done” on the current bubble while generating is still true.
  const finishedSnap = getFinishedChatTurnStatus(assistantId);
  if (
    finishedSnap
    && (!status || status.assistantId !== assistantId)
  ) {
    return finishedSnap;
  }
  if (status && (!assistantId || status.assistantId === assistantId)) return status;
  return finishedSnap;
}
