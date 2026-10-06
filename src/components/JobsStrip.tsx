/**
 * Compact background jobs + transient toasts above the sidebar profile.
 * Model downloads collapse into one combined progress card.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Folder } from 'lucide-react';
import {
  cancelEngineDownload,
  dismissEngineDownloadError,
  getEngineDownloadJobs,
  subscribeEngineDownloads,
  type EngineDownloadJob,
} from '@/lib/engineDownloads';
import { ENGINE_UI_CATALOG } from '@/lib/engineCatalogUi';
import { NovaErrorInline } from '@/components/NovaErrorInline';
import { ROTATION_NOTE_EVENT } from '@/lib/modelRotation';
import { SIDEBAR_TOAST_EVENT, type SidebarToastDetail } from '@/lib/sidebarToast';
import { PlayGameButton, PlayWhileDownloading } from '@/components/fun/PlayWhileDownloading';

type ToastRow = {
  id: string;
  message: string;
  kind?: 'info' | 'download';
  folderPath?: string;
  fileName?: string;
};

function jobRoleLabel(job: EngineDownloadJob): string {
  const id = String(job.id || '').toLowerCase();
  const name = String(job.name || '');
  if (/next brain/i.test(name)) return 'Next brain';
  if (/coder/i.test(id) || /coder/i.test(name)) return 'Coding model';
  if (/uigen|design/i.test(`${id} ${name}`)) return 'Design brain';
  if (/vl|vision/i.test(`${id} ${name}`)) return 'Vision model';
  if (/qwen25-7b|instruct|llama|mistral|chat/i.test(`${id} ${name}`)) return 'Chat brain';
  return name.replace(/^Next brain · /i, '').trim() || job.id;
}

function jobSizeGb(job: EngineDownloadJob): number {
  if (typeof job.sizeGb === 'number' && job.sizeGb > 0) return job.sizeGb;
  const hit = ENGINE_UI_CATALOG.find((m) => m.id === job.id);
  return hit?.sizeGb && hit.sizeGb > 0 ? hit.sizeGb : 1;
}

/** Size-weighted overall % across concurrent downloads. */
function combinedProgress(jobs: EngineDownloadJob[]): number {
  if (jobs.length === 0) return 0;
  let done = 0;
  let total = 0;
  for (const j of jobs) {
    const w = jobSizeGb(j);
    total += w;
    done += w * (Math.min(100, Math.max(0, j.progress)) / 100);
  }
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/** Rough ETA from elapsed time + weighted progress. */
function formatEta(jobs: EngineDownloadJob[], combinedPct: number): string | null {
  if (combinedPct <= 1 || combinedPct >= 100) return null;
  const started = jobs
    .map((j) => j.startedAt)
    .filter((t): t is number => typeof t === 'number' && t > 0);
  if (!started.length) return null;
  const earliest = Math.min(...started);
  const elapsedMs = Date.now() - earliest;
  if (elapsedMs < 4_000) return null;
  const rate = combinedPct / elapsedMs;
  if (rate <= 0) return null;
  const remainMs = (100 - combinedPct) / rate;
  if (!Number.isFinite(remainMs) || remainMs <= 0) return null;
  const sec = Math.round(remainMs / 1000);
  if (sec < 60) return `~${sec}s left`;
  const min = Math.round(sec / 60);
  if (min < 60) return `~${min} min left`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `~${hr}h ${remMin}m left` : `~${hr}h left`;
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
  const [, setTick] = useState(0);

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
        return [...without, {
          id,
          message: detail.message,
          kind: detail.kind,
          folderPath: detail.folderPath,
          fileName: detail.fileName,
        }];
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
    const unsub = window.novaDesktop?.onUpdateProgress?.((payload) => {
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
  const errored = active.filter(j => j.error);

  const sortedBySpeed = useMemo(
    () => [...downloading].sort((a, b) => b.progress - a.progress),
    [downloading],
  );
  const lead = sortedBySpeed[0] || null;
  const combinedPct = combinedProgress(downloading);
  const eta = formatEta(downloading, combinedPct);

  useEffect(() => {
    if (downloading.length === 0) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 5_000);
    return () => window.clearInterval(id);
  }, [downloading.length]);

  if (active.length === 0 && !updateJob && !rotationNote && toasts.length === 0 && !playOpen) return null;

  const compactRail = variant === 'sidebar' && collapsed;
  const displayPct = downloading.length > 0
    ? combinedPct
    : Math.round(updateJob?.percent ?? 0);

  if (compactRail) {
    const dlToasts = toasts.filter(t => t.kind === 'download');
    return (
      <>
        <div className="mb-2 flex flex-col items-center gap-1.5 px-1">
          {dlToasts.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (t.folderPath && window.novaDesktop?.openPath) {
                  void window.novaDesktop.openPath(t.folderPath);
                }
              }}
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/20 nova-dl-pulse"
              title={t.message}
              aria-label={t.message}
            >
              <Folder className="w-4 h-4 text-emerald-300" aria-hidden />
            </button>
          ))}
          {(downloading.length > 0 || updateJob) ? (
            <>
              <div
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-nova-navy-950/95"
                title={
                  lead
                    ? `${jobRoleLabel(lead)} lead · ${downloading.length} model${downloading.length === 1 ? '' : 's'} · ${displayPct}%`
                    : 'Download'
                }
                aria-label={`Download ${displayPct} percent`}
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
                      strokeDashoffset: `${2 * Math.PI * 14 * (1 - Math.min(100, displayPct) / 100)}`,
                      transform: 'rotate(-90deg)',
                      transformOrigin: '50% 50%',
                    }}
                  />
                </svg>
                <Loader2 className="relative z-[1] h-3.5 w-3.5 text-sky-300 animate-spin" />
              </div>
              <span className="text-[10px] tabular-nums text-content-tertiary leading-none">{displayPct}%</span>
            </>
          ) : null}
        </div>
        <PlayWhileDownloading open={playOpen} onClose={() => setPlayOpen(false)} />
      </>
    );
  }

  const shell =
    variant === 'sidebar'
      ? 'mb-2 rounded-xl border border-white/[0.08] bg-nova-navy-950/95 px-3 py-2.5 space-y-2'
      : 'shrink-0 border-t border-surface-border bg-nova-navy-950/95 px-3 py-2.5 space-y-2';

  return (
    <>
      <div className={shell}>
        {toasts.map(t => (
          t.kind === 'download' ? (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                const folder = t.folderPath;
                if (folder && window.novaDesktop?.openPath) {
                  void window.novaDesktop.openPath(folder);
                }
              }}
              className="w-full flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-left hover:bg-emerald-500/15 transition-colors group"
              title={t.folderPath ? `Open ${t.folderPath}` : t.message}
              aria-label={t.message}
            >
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/20 nova-dl-pulse">
                <Folder className="w-4 h-4 text-emerald-300" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium text-emerald-100/95 truncate leading-tight">
                  Downloaded
                </span>
                <span className="block text-[10px] text-content-tertiary truncate leading-tight mt-0.5">
                  {t.fileName || t.message}
                </span>
              </span>
            </button>
          ) : (
            <p key={t.id} className="text-[11px] text-content-secondary leading-snug">
              {t.message}
            </p>
          )
        ))}

        {downloading.length > 0 && lead ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-content-secondary truncate leading-tight">
                    {jobRoleLabel(lead)}
                  </p>
                  <p className="text-[10px] text-content-tertiary truncate leading-tight mt-0.5">
                    {downloading.length === 1
                      ? 'Downloading'
                      : `${downloading.length} models · combined`}
                    {eta ? ` · ${eta}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <PlayGameButton onClick={() => setPlayOpen(true)} className="shrink-0" />
                <span className="tabular-nums text-[11px] text-content-tertiary">{combinedPct}%</span>
                <button
                  type="button"
                  className="p-0.5 text-content-tertiary hover:text-rose-300"
                  aria-label="Cancel all downloads"
                  title="Cancel all"
                  onClick={() => {
                    for (const j of downloading) void cancelEngineDownload(j.id);
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500/80 transition-all"
                style={{ width: `${Math.min(100, combinedPct)}%` }}
              />
            </div>
          </div>
        ) : null}

        {errored.map(job => (
          <div key={job.id} className="space-y-1">
            <div className="flex items-center gap-2 text-[11px]">
              <div className="min-w-0 flex-1">
                <NovaErrorInline message={job.error || 'Download failed'} />
              </div>
            </div>
            <button
              type="button"
              className="text-[10px] text-content-tertiary hover:text-content-secondary"
              onClick={() => dismissEngineDownloadError(job.id)}
            >
              Dismiss
            </button>
          </div>
        ))}

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
