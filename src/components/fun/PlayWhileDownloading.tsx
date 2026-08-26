import { useEffect, useRef, useState } from 'react';
import { Gamepad2, X } from 'lucide-react';
import { ArkRunnerGame } from '@/components/fun/ArkRunnerGame';
import {
  getEngineDownloadJobs,
  subscribeEngineDownloads,
} from '@/lib/engineDownloads';
import { pushSidebarToast } from '@/lib/sidebarToast';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Optional label shown under the title (e.g. model name). */
  contextLabel?: string;
  /** When the host tracks download itself (setup wizard). */
  externalProgress?: number;
  externalComplete?: boolean;
};

/**
 * Lightweight play overlay while a download runs in the background.
 * Shows a clear banner when the download finishes so the user can exit.
 */
export function PlayWhileDownloading({
  open,
  onClose,
  contextLabel,
  externalProgress,
  externalComplete,
}: Props) {
  const [complete, setComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobName, setJobName] = useState(contextLabel || '');
  const hadActive = useRef(false);
  const notified = useRef(false);

  useEffect(() => {
    if (!open) {
      setComplete(false);
      hadActive.current = false;
      notified.current = false;
      return;
    }

    if (typeof externalProgress === 'number' || externalComplete) {
      const p = Math.max(0, Math.min(100, Number(externalProgress) || 0));
      setProgress(p);
      if (contextLabel) setJobName(contextLabel);
      if (p > 0 && p < 100) hadActive.current = true;
      if (externalComplete || p >= 100) {
        if (hadActive.current || externalComplete) {
          setComplete(true);
          setProgress(100);
          if (!notified.current) {
            notified.current = true;
            pushSidebarToast('Download complete — close the game when you’re ready.', {
              id: 'download-play-complete',
              ttlMs: 14_000,
            });
          }
        }
      } else {
        setComplete(false);
      }
      return;
    }

    const sync = () => {
      const jobs = getEngineDownloadJobs().filter(j => !j.error);
      const active = jobs.filter(j => j.progress < 100 && !j.canceling);
      if (active.length > 0) {
        hadActive.current = true;
        const top = active[0];
        setProgress(top.progress);
        setJobName(top.name.replace(/^Next brain · /i, '') || contextLabel || 'download');
        setComplete(false);
        return;
      }
      if (hadActive.current) {
        setComplete(true);
        setProgress(100);
        if (!notified.current) {
          notified.current = true;
          pushSidebarToast('Download complete — close the game when you’re ready.', {
            id: 'download-play-complete',
            ttlMs: 14_000,
          });
        }
      }
    };

    sync();
    return subscribeEngineDownloads(sync);
  }, [open, contextLabel, externalProgress, externalComplete]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/65 border-0 cursor-default"
        aria-label="Close game"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ark-play-title"
        className="relative z-10 w-full max-w-2xl rounded-2xl border border-surface-border bg-ark-navy-900 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-surface-border">
          <div className="min-w-0 flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-sky-300 shrink-0" />
            <div className="min-w-0">
              <h2 id="ark-play-title" className="text-sm font-semibold text-content-primary truncate">
                ARK Runner
              </h2>
              <p className="text-[11px] text-content-tertiary truncate">
                {complete
                  ? 'Download finished'
                  : jobName
                    ? `Downloading ${jobName}${progress > 0 ? ` · ${Math.round(progress)}%` : ''}`
                    : 'Play while things install in the background'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="h-8 w-8 rounded-lg border border-surface-border text-content-tertiary hover:text-content-primary flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {complete ? (
          <div className="mx-4 mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <p className="text-sm font-medium text-emerald-200">Download complete</p>
            <p className="text-[11px] text-emerald-100/80 mt-0.5 leading-relaxed">
              You can close this game and continue in ARK whenever you’re ready.
            </p>
            <button type="button" className="ark-btn-primary text-xs mt-2.5" onClick={onClose}>
              Back to ARK
            </button>
          </div>
        ) : progress > 0 ? (
          <div className="mx-4 mt-3">
            <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full bg-sky-500/80 transition-all"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="p-4 pt-3">
          <ArkRunnerGame active={open} />
          <p className="mt-3 text-[11px] text-content-tertiary leading-relaxed text-center">
            Nothing extra downloads for this game. It’s built into ARK so slow installs feel less idle.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Small CTA used next to download progress. */
export function PlayGameButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-sky-500/35 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-200 hover:bg-sky-500/15 transition-colors ${className}`}
    >
      <Gamepad2 className="w-3.5 h-3.5" />
      Play game
    </button>
  );
}
