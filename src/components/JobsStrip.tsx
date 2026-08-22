/**
 * Compact background jobs + transient toasts above the sidebar profile.
 */

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  cancelEngineDownload,
  dismissEngineDownloadError,
  getEngineDownloadJobs,
  subscribeEngineDownloads,
  type EngineDownloadJob,
} from '@/lib/engineDownloads';
import { ArkErrorInline } from '@/components/ArkErrorInline';
import { ROTATION_NOTE_EVENT } from '@/lib/modelRotation';
import { SIDEBAR_TOAST_EVENT, type SidebarToastDetail } from '@/lib/sidebarToast';

type ToastRow = { id: string; message: string };

export function JobsStrip({ variant = 'footer' }: { variant?: 'footer' | 'sidebar' }) {
  const [jobs, setJobs] = useState<EngineDownloadJob[]>(() => getEngineDownloadJobs());
  const [updateJob, setUpdateJob] = useState<{ percent: number; message: string } | null>(null);
  const [rotationNote, setRotationNote] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastRow[]>([]);

  useEffect(() => subscribeEngineDownloads(() => {
    setJobs(getEngineDownloadJobs());
  }), []);

  useEffect(() => {
    const onNote = (ev: Event) => {
      const message = (ev as CustomEvent<{ message?: string }>).detail?.message;
      if (!message) return;
      setRotationNote(message);
      window.setTimeout(() => setRotationNote(prev => (prev === message ? null : prev)), 12_000);
    };
    window.addEventListener(ROTATION_NOTE_EVENT, onNote);
    return () => window.removeEventListener(ROTATION_NOTE_EVENT, onNote);
  }, []);

  useEffect(() => {
    const onToast = (ev: Event) => {
      const detail = (ev as CustomEvent<SidebarToastDetail>).detail;
      if (!detail?.message) return;
      const id = detail.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const ttl = detail.ttlMs ?? 10_000;
      setToasts(prev => {
        const without = prev.filter(t => t.id !== id);
        return [...without, { id, message: detail.message }];
      });
      if (ttl > 0) {
        window.setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
        }, ttl);
      }
    };
    window.addEventListener(SIDEBAR_TOAST_EVENT, onToast);
    return () => window.removeEventListener(SIDEBAR_TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    const unsub = window.arkDesktop?.onUpdateProgress?.((payload) => {
      const status = String(payload?.status || '');
      const percent = typeof payload?.percent === 'number' ? payload.percent : 0;
      const message = payload?.message || payload?.error || '';
      if (status === 'error') {
        setUpdateJob({ percent: 0, message: message || 'Update failed' });
        window.setTimeout(() => setUpdateJob(null), 10_000);
        return;
      }
      if (status === 'idle' || percent >= 100) {
        setUpdateJob(null);
        return;
      }
      if (
        status === 'checking'
        || status === 'downloading'
        || status === 'handoff'
        || status === 'installing'
        || status === 'available'
      ) {
        setUpdateJob({
          percent,
          message: message || (status === 'checking' ? 'Checking for updates…' : 'Updating…'),
        });
      }
    });
    return () => { unsub?.(); };
  }, []);

  const active = jobs.filter(j => j.progress < 100 || j.error || j.canceling);
  if (active.length === 0 && !updateJob && !rotationNote && toasts.length === 0) return null;

  const shell =
    variant === 'sidebar'
      ? 'mb-2 rounded-xl border border-white/10 bg-ark-navy-950/90 px-2.5 py-2 space-y-1.5'
      : 'shrink-0 border-t border-surface-border bg-ark-navy-950/95 px-3 py-2 space-y-1.5';

  return (
    <div className={shell}>
      {toasts.map(t => (
        <p key={t.id} className="text-[11px] text-content-secondary leading-snug">
          {t.message}
        </p>
      ))}
      {active.map(job => (
        <div key={job.id} className="flex items-start gap-2 text-xs">
          {!job.error && !job.canceling ? (
            <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0 mt-0.5" />
          ) : null}
          <div className="min-w-0 flex-1">
            {job.error ? (
              <ArkErrorInline message={job.error} />
            ) : (
              <>
                <p className="text-content-secondary truncate">
                  {job.canceling
                    ? 'Canceling…'
                    : /next brain/i.test(job.name)
                      ? 'Preparing next brain'
                      : 'Downloading'}{' '}
                  {job.name.replace(/^Next brain · /i, '') || job.id}
                  {!job.canceling ? ` · ${Math.round(job.progress)}%` : ''}
                </p>
                {!job.canceling && job.progress < 100 ? (
                  <div className="h-1 mt-1 bg-surface-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500/70 transition-all"
                      style={{ width: `${Math.min(100, job.progress)}%` }}
                    />
                  </div>
                ) : null}
              </>
            )}
            {job.error ? (
              <div className="flex gap-2 mt-1">
                <button type="button" className="text-[10px] text-content-tertiary hover:text-content-secondary" onClick={() => dismissEngineDownloadError(job.id)}>
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
          {!job.error && !job.canceling ? (
            <button
              type="button"
              className="shrink-0 p-1 text-content-tertiary hover:text-rose-300"
              aria-label="Cancel download"
              onClick={() => void cancelEngineDownload(job.id)}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      ))}
      {rotationNote ? (
        <p className="text-xs text-content-tertiary truncate">{rotationNote}</p>
      ) : null}
      {updateJob ? (
        <div className="flex items-start gap-2 text-xs">
          <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-content-secondary truncate">
              {updateJob.message}
              {updateJob.percent > 0 ? ` · ${Math.round(updateJob.percent)}%` : ''}
            </p>
            {updateJob.percent > 0 ? (
              <div className="h-1 mt-1 bg-surface-hover rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500/70 transition-all" style={{ width: `${Math.min(100, updateJob.percent)}%` }} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
