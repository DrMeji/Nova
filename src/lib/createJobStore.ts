/**
 * Create job lifecycle — Preview / UI subscribe while npm runs in background.
 * Persists to sessionStorage so a tab refresh can still show Progress / Ready.
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

function storageKey(chatId: string) {
  return `nova-create-job:${chatId}`;
}

function persistJob(job: CreateJob) {
  try {
    // Avoid huge file blobs in sessionStorage — keep metadata + tiny file map.
    const fileKeys = Object.keys(job.files || {});
    const slimFiles: Record<string, string> = {};
    for (const k of fileKeys.slice(0, 40)) {
      const v = job.files[k];
      if (typeof v === 'string' && v.length <= 80_000) slimFiles[k] = v;
    }
    sessionStorage.setItem(storageKey(job.chatId), JSON.stringify({
      ...job,
      files: slimFiles,
    }));
  } catch {
    /* quota / private mode */
  }
}

function hydrateFromSession(chatId: string): CreateJob | null {
  if (!chatId) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreateJob;
    if (!parsed?.id || !parsed.chatId) return null;
    jobs.set(parsed.id, parsed);
    byChat.set(parsed.chatId, parsed.id);
    return parsed;
  } catch {
    return null;
  }
}

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
  if (id) {
    const mem = jobs.get(id);
    if (mem) return mem;
  }
  return hydrateFromSession(chatId);
}

/** Lookup create job by project id (Workspace Preview attach). */
export function getCreateJobForProject(projectId: string): CreateJob | null {
  const pid = String(projectId || '').trim();
  if (!pid) return null;
  for (const job of jobs.values()) {
    if (job.projectId === pid) return job;
  }
  return null;
}

/** Lookup create job by disk path (normalize case for Windows). */
export function getCreateJobForPath(diskPath: string): CreateJob | null {
  const key = String(diskPath || '').trim().toLowerCase();
  if (!key) return null;
  for (const job of jobs.values()) {
    if (String(job.path || '').trim().toLowerCase() === key) return job;
  }
  return null;
}

export function startCreateJob(partial: Omit<CreateJob, 'updatedAt' | 'status'> & { status?: CreateJobStatus }): CreateJob {
  const job: CreateJob = {
    ...partial,
    status: partial.status || 'writing',
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  byChat.set(job.chatId, job.id);
  persistJob(job);
  emit();
  return job;
}

export function updateCreateJob(id: string, patch: Partial<CreateJob>): CreateJob | null {
  const prev = jobs.get(id);
  if (!prev) return null;
  const next = { ...prev, ...patch, id: prev.id, updatedAt: Date.now() };
  jobs.set(id, next);
  byChat.set(next.chatId, id);
  persistJob(next);
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
