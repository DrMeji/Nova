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
  // Prefer finished snapshot once the turn settled — never keep a mid-flight
  // label (e.g. Final pass…) pulsing after the reply is on screen.
  const finishedSnap = getFinishedChatTurnStatus(assistantId);
  if (finishedSnap && (!status || status.assistantId !== assistantId || /^done$/i.test(finishedSnap.label))) {
    if (!status || status.assistantId !== assistantId) return finishedSnap;
    // Live status still open after Done was snapshotted — prefer Done.
    if (/^done$/i.test(finishedSnap.label) && !/^done$/i.test(status.label || '')) {
      return finishedSnap;
    }
  }
  if (status && (!assistantId || status.assistantId === assistantId)) return status;
  return finishedSnap;
}
