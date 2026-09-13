/**
 * Subscribe to create-job phase for Preview / JobsStrip.
 */
import { useSyncExternalStore } from 'react';
import {
  getCreateJobForChat,
  subscribeCreateJobs,
  type CreateJob,
} from '@/lib/createJobStore';

export function useCreateJob(chatId: string | null | undefined): CreateJob | null {
  const id = chatId || '';
  return useSyncExternalStore(
    subscribeCreateJobs,
    () => (id ? getCreateJobForChat(id) : null),
    () => (id ? getCreateJobForChat(id) : null),
  );
}
