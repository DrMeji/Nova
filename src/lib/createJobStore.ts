/**
 * Create job lifecycle — Preview / UI subscribe while npm runs in background.
 */

export type CreateJobStatus = 'writing' | 'npm' | 'ready' | 'failed';

export type CreateJob = {
  id: string;
  chatId: string;
  path: string;
  projectId: string;
  name: string;
  files: Record<string, string>;
  status: CreateJobStatus;
  previewUrl?: string | null;
  error?: string;
  updatedAt: number;
};

const jobs = new Map<string, CreateJob>();
const byChat = new Map<string, string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => {
    try { l(); } catch { /* ignore */ }
  });
}

export function subscribeCreateJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getCreateJob(id: string): CreateJob | null {
  return jobs.get(id) || null;
}

export function getCreateJobForChat(chatId: string): CreateJob | null {
  const id = byChat.get(chatId);
  return id ? jobs.get(id) || null : null;
}

export function startCreateJob(partial: Omit<CreateJob, 'updatedAt' | 'status'> & { status?: CreateJobStatus }): CreateJob {
  const job: CreateJob = {
    ...partial,
    status: partial.status || 'writing',
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  byChat.set(job.chatId, job.id);
  emit();
  return job;
}

export function updateCreateJob(id: string, patch: Partial<CreateJob>): CreateJob | null {
  const prev = jobs.get(id);
  if (!prev) return null;
  const next = { ...prev, ...patch, id: prev.id, updatedAt: Date.now() };
  jobs.set(id, next);
  byChat.set(next.chatId, id);
  emit();
  return next;
}

export function markCreateJobNpm(id: string): void {
  updateCreateJob(id, { status: 'npm' });
}

export function markCreateJobReady(id: string, previewUrl?: string | null): void {
  updateCreateJob(id, { status: 'ready', previewUrl: previewUrl ?? null, error: undefined });
}

export function markCreateJobFailed(id: string, error: string): void {
  updateCreateJob(id, { status: 'failed', error });
}
