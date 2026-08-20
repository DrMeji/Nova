/**
 * Process-wide ARK Engine download tracker.
 * Survives Models / Local AI unmount so progress keeps updating when you leave the tab.
 */

import {
  downloadEngineModel,
  engineDownloadCancel,
  engineDownloadError,
  engineDownloadProgress,
  getEngineStatus,
} from '@/lib/arkEngine';
import { notifyWorkDone, type ActivityKey } from '@/lib/activityIndicators';

export type EngineDownloadJob = {
  id: string;
  name: string;
  progress: number;
  phase: string;
  source: 'models' | 'local-ai';
  error?: string;
  canceling?: boolean;
};

type Listener = () => void;

const jobs = new Map<string, EngineDownloadJob>();
const timers = new Map<string, number>();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(l => l());
}

function activityFor(source: EngineDownloadJob['source']): ActivityKey {
  return source === 'models' ? 'models' : 'local-ai';
}

function stopTimer(id: string) {
  const t = timers.get(id);
  if (t != null) {
    window.clearInterval(t);
    timers.delete(id);
  }
}

function removeJob(id: string) {
  stopTimer(id);
  jobs.delete(id);
  emit();
}

async function tick(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  try {
    const p = await engineDownloadProgress(id);
    const err = await engineDownloadError(id);
    let phase = job.phase;
    try {
      const status = await getEngineStatus();
      const row = status.models.find(m => m.id === id) as { downloadPhase?: string } | undefined;
      if (row?.downloadPhase) phase = row.downloadPhase;
    } catch {
      /* ignore */
    }

    if (err) {
      jobs.set(id, { ...job, progress: p, phase: 'error', error: err });
      emit();
      stopTimer(id);
      return;
    }

    jobs.set(id, { ...job, progress: p, phase, error: undefined });
    emit();

    if (p >= 100) {
      stopTimer(id);
      notifyWorkDone(activityFor(job.source));
      try {
        void window.arkDesktop?.engineSetModel?.(id);
      } catch {
        /* warmup is best-effort */
      }
      window.setTimeout(() => removeJob(id), 800);
    }
  } catch {
    /* keep polling */
  }
}

function ensurePolling(id: string) {
  if (timers.has(id)) return;
  const handle = window.setInterval(() => {
    void tick(id);
  }, 400);
  timers.set(id, handle);
  void tick(id);
}

export function subscribeEngineDownloads(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getEngineDownloadJobs(): EngineDownloadJob[] {
  return Array.from(jobs.values());
}

export function getEngineDownloadMap(): Record<string, number> {
  const out: Record<string, number> = {};
  jobs.forEach((j, id) => {
    out[id] = j.progress;
  });
  return out;
}

export function getEngineDownloadPhaseMap(): Record<string, string> {
  const out: Record<string, string> = {};
  jobs.forEach((j, id) => {
    out[id] = j.phase;
  });
  return out;
}

export function getEngineDownloadErrors(): Record<string, string> {
  const out: Record<string, string> = {};
  jobs.forEach((j, id) => {
    if (j.error) out[id] = j.error;
  });
  return out;
}

export function isEngineDownloading(id: string) {
  const j = jobs.get(id);
  return Boolean(j && j.progress < 100 && !j.error);
}

/** Start (or reattach) a download tracked outside any React view. */
export async function startEngineDownload(opts: {
  id: string;
  name: string;
  source: 'models' | 'local-ai';
  hunt?: { url: string; sizeGb: number; detail?: string; category?: 'coding' | 'chat' };
  forceUnknownDisk?: boolean;
}) {
  if (!opts.forceUnknownDisk && window.arkDesktop?.engineDiskSpace) {
    try {
      const disk = await window.arkDesktop.engineDiskSpace();
      if (disk && disk.ok === false) {
        const ok = window.confirm(
          'Couldn\'t read free disk space on this PC. Continue download anyway? Large models need several GB.',
        );
        if (!ok) return;
      }
    } catch {
      /* ignore */
    }
  }

  const existing = jobs.get(opts.id);
  if (existing && existing.progress < 100 && !existing.error) {
    ensurePolling(opts.id);
    return;
  }

  jobs.set(opts.id, {
    id: opts.id,
    name: opts.name,
    progress: 1,
    phase: 'queued',
    source: opts.source,
  });
  emit();

  try {
    if (opts.hunt) {
      const registered = await window.arkDesktop?.engineRegisterHunt?.({
        id: opts.id,
        name: opts.name,
        url: opts.hunt.url,
        sizeGb: opts.hunt.sizeGb,
        detail: opts.hunt.detail,
        category: opts.hunt.category,
      });
      if (registered && registered.ok === false) {
        throw new Error(registered.error || 'Could not register hunted model');
      }
    }
    await downloadEngineModel(opts.id);
    ensurePolling(opts.id);
  } catch (err) {
    jobs.set(opts.id, {
      id: opts.id,
      name: opts.name,
      progress: 0,
      phase: 'error',
      source: opts.source,
      error: err instanceof Error ? err.message : 'Download failed',
    });
    emit();
    stopTimer(opts.id);
  }
}

export function dismissEngineDownloadError(id: string) {
  removeJob(id);
}

export async function retryEngineDownload(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  const { name, source } = job;
  removeJob(id);
  await startEngineDownload({ id, name, source });
}

export async function cancelEngineDownload(id: string) {
  const job = jobs.get(id);
  if (job) {
    jobs.set(id, { ...job, canceling: true, phase: 'canceling' });
    emit();
  }
  await engineDownloadCancel(id);
  removeJob(id);
}

/** On app / Models / Local AI mount — pick up Engine downloads already in flight. */
export async function reattachEngineDownloads(source: 'models' | 'local-ai' = 'models') {
  try {
    const status = await getEngineStatus();
    for (const m of status.models) {
      if (m.status !== 'downloading') continue;
      if (jobs.has(m.id)) {
        ensurePolling(m.id);
        continue;
      }
      jobs.set(m.id, {
        id: m.id,
        name: m.name,
        progress: typeof m.progress === 'number' ? m.progress : 1,
        phase: 'downloading',
        source,
      });
      ensurePolling(m.id);
    }
    emit();
  } catch {
    /* ignore */
  }
}
