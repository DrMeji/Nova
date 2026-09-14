/**
 * Subscribe to create-job phase for Preview / JobsStrip.
 */
import { useSyncExternalStore } from 'react';
import {
  getCreateJobForChat,
  getCreateJobForPath,
  getCreateJobForProject,
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

/** Workspace: prefer projectId, then disk path. */
export function useCreateJobForWorkspace(
  projectId: string | null | undefined,
  diskPath?: string | null,
): CreateJob | null {
  const pid = projectId || '';
  const path = diskPath || '';
  return useSyncExternalStore(
    subscribeCreateJobs,
    () => getCreateJobForProject(pid) || (path ? getCreateJobForPath(path) : null),
    () => getCreateJobForProject(pid) || (path ? getCreateJobForPath(path) : null),
  );
}
