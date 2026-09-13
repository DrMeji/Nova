/**
 * Subscribe to chat turn status outside React message state.
 */
import { useSyncExternalStore } from 'react';
import {
  getChatTurnStatus,
  subscribeChatTurnStatus,
  type ChatTurnStatus,
} from '@/lib/chatTurnStatusStore';

export function useChatTurnStatus(assistantId?: string | null): ChatTurnStatus | null {
  const status = useSyncExternalStore(
    subscribeChatTurnStatus,
    getChatTurnStatus,
    getChatTurnStatus,
  );
  if (!status) return null;
  if (assistantId && status.assistantId !== assistantId) return null;
  return status;
}
