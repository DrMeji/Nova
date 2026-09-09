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
import { PlayGameButton, PlayWhileDownloading } from '@/components/fun/PlayWhileDownloading';

type ToastRow = { id: string; message: string };

function jobRoleLabel(job: EngineDownloadJob): string {
  const id = String(job.id || '').toLowerCase();
  const name = String(job.name || '');
  if (/next brain/i.test(name)) return 'Next brain';
  if (/coder/i.test(id) || /coder/i.test(name)) return 'Coding model';
  if (/qwen25-7b|instruct|llama|mistral|chat/i.test(`${id} ${name}`)) return 'Chat brain';
  return name.replace(/^Next brain · /i, '').trim() || job.id;
}

export function JobsStrip({
  variant = 'footer',
  collapsed = false,
}: {
  variant?: 'footer' | 'sidebar';
  /** When sidebar rail is narrow, show ring + % only until hover expands. */
  collapsed?: boolean;
}) {
  const [jobs, setJobs] = useState<EngineDownloadJob[]>(() => getEngineDownloadJobs());
  const [updateJob, setUpdateJob] = useState<{ percent: number; message: string } | null>(null);
  const [rotationNote, setRotationNote] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastRow[]>([]);
  const [playOpen, setPlayOpen] = useState(false);

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
      if (status === 'idle' || status === 'available' || percent >= 100) {
        setUpdateJob(null);
        return;
      }
      if (
        status === 'checking'
        || status === 'downloading'
        || status === 'handoff'
        || status === 'installing'
      ) {
        setUpdateJob({
          percent,
          message: message || (status === 'checking' ? 'Checking for updates…' : 'Downloading update…'),
        });
      }
    });
    return () => { unsub?.(); };
  }, []);

  const active = jobs.filter(j => j.progress < 100 || j.error || j.canceling);
  const downloading = active.filter(j => j.progress < 100 && !j.error && !j.canceling);
  if (active.length === 0 && !updateJob && !rotationNote && toasts.length === 0 && !playOpen) return null;

  const topPct = Math.round(
    downloading[0]?.progress
      ?? updateJob?.percent
      ?? 0,
  );
  const compactRail = variant === 'sidebar' && collapsed;

  if (compactRail) {
    return (
      <>
        <div className="mb-2 flex flex-col items-center gap-1.5 px-1">
          <div
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-ark-navy-950/95"
            title={downloading[0] ? `Downloading ${jobRoleLabel(downloading[0])} (${topPct}%)` : 'Download'}
            aria-label={`Download ${topPct} percent`}
          >
            <svg className="absolute inset-1" viewBox="0 0 36 36" aria-hidden>
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-white/10"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="text-sky-400 transition-[stroke-dashoffset] duration-300"
                style={{
                  strokeDasharray: `${2 * Math.PI * 14}`,
                  strokeDashoffset: `${2 * Math.PI * 14 * (1 - Math.min(100, topPct) / 100)}`,
                  transform: 'rotate(-90deg)',
                  transformOrigin: '50% 50%',
                }}
              />
            </svg>
            <Loader2 className="relative z-[1] h-3.5 w-3.5 text-sky-300 animate-spin" />
          </div>
          <span className="text-[10px] tabular-nums text-content-tertiary leading-none">{topPct}%</span>
        </div>
        <PlayWhileDownloading open={playOpen} onClose={() => setPlayOpen(false)} />
      </>
    );
  }

  const shell =
    variant === 'sidebar'
      ? 'mb-2 rounded-xl border border-white/[0.08] bg-ark-navy-950/95 px-3 py-2.5 space-y-2'
      : 'shrink-0 border-t border-surface-border bg-ark-navy-950/95 px-3 py-2.5 space-y-2';

  return (
    <>
      <div className={shell}>
        {toasts.map(t => (
          <p key={t.id} className="text-[11px] text-content-secondary leading-snug">
            {t.message}
          </p>
        ))}
        {downloading.length > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-content-secondary leading-tight truncate min-w-0">Downloading…</p>
            <PlayGameButton onClick={() => setPlayOpen(true)} className="shrink-0" />
          </div>
        ) : null}
        {active.map(job => {
          const label = jobRoleLabel(job);
          const pct = Math.round(job.progress);
          return (
            <div key={job.id} className="space-y-1">
              <div className="flex items-center gap-2 text-[11px]">
                {!job.error && !job.canceling ? (
                  <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
                ) : null}
                <div className="min-w-0 flex-1">
                  {job.error ? (
                    <ArkErrorInline message={job.error} />
                  ) : (
                    <div className="flex items-baseline justify-between gap-2 min-w-0">
                      <p className="text-content-secondary truncate">
                        {job.canceling ? 'Canceling…' : label}
                      </p>
                      {!job.canceling ? (
                        <span className="tabular-nums text-content-tertiary shrink-0">{pct}%</span>
                      ) : null}
                    </div>
                  )}
                </div>
                {!job.error && !job.canceling ? (
                  <button
                    type="button"
                    className="shrink-0 p-0.5 text-content-tertiary hover:text-rose-300"
                    aria-label="Cancel download"
                    onClick={() => void cancelEngineDownload(job.id)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
              {job.error ? (
                <button
                  type="button"
                  className="text-[10px] text-content-tertiary hover:text-content-secondary"
                  onClick={() => dismissEngineDownloadError(job.id)}
                >
                  Dismiss
                </button>
              ) : null}
              {!job.error && !job.canceling && job.progress < 100 ? (
                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-500/80 transition-all"
                    style={{ width: `${Math.min(100, job.progress)}%` }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        {rotationNote ? (
          <p className="text-xs text-content-tertiary truncate">{rotationNote}</p>
        ) : null}
        {updateJob ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px]">
              <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
              <p className="min-w-0 flex-1 text-content-secondary truncate">{updateJob.message}</p>
              {updateJob.percent > 0 ? (
                <span className="tabular-nums text-content-tertiary shrink-0">
                  {Math.round(updateJob.percent)}%
                </span>
              ) : null}
            </div>
            {updateJob.percent > 0 ? (
              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500/70 transition-all"
                  style={{ width: `${Math.min(100, updateJob.percent)}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <PlayWhileDownloading open={playOpen} onClose={() => setPlayOpen(false)} />
    </>
  );
}
