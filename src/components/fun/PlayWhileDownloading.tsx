import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ArkRunnerGame } from '@/components/fun/ArkRunnerGame';
import {
  getEngineDownloadJobs,
  subscribeEngineDownloads,
} from '@/lib/engineDownloads';
import { pushSidebarToast } from '@/lib/sidebarToast';

type Props = {
  open: boolean;
  onClose: () => void;
  contextLabel?: string;
  /** e.g. "4.7 GB" */
  contextSize?: string;
  /** Short line under the model name */
  contextDetail?: string;
  externalProgress?: number;
  externalComplete?: boolean;
};

/**
 * Full-screen play-while-download: game left, install status right.
 * Portaled to document.body so sidebar transforms cannot trap position:fixed.
 */
export function PlayWhileDownloading({
  open,
  onClose,
  contextLabel,
  contextSize,
  contextDetail,
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
            pushSidebarToast('Download complete. Close the game when you are ready.', {
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
          pushSidebarToast('Download complete. Close the game when you are ready.', {
            id: 'download-play-complete',
            ttlMs: 14_000,
          });
        }
      }
    };

    sync();
    return subscribeEngineDownloads(sync);
  }, [open, contextLabel, externalProgress, externalComplete]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const pct = Math.min(100, Math.round(complete ? 100 : progress));
  const label = jobName || contextLabel || 'Local brain';
  const phaseLabel = complete
    ? 'Installed on this PC'
    : pct < 25
      ? 'Preparing runtime'
      : pct < 100
        ? 'Downloading model weights'
        : 'Finalizing install';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8 overflow-hidden"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 border-0 cursor-default bg-black/70 backdrop-blur-xl"
        aria-label="Close game"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="NOVA-play-title"
        className="relative z-10 w-full max-w-6xl grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)] gap-4 sm:gap-6 items-stretch pointer-events-auto"
        onClick={e => e.stopPropagation()}
      >
        <section className="rounded-2xl border border-white/10 bg-ark-navy-950 shadow-2xl overflow-hidden flex flex-col min-h-[24rem] h-[min(30rem,calc(100vh-4rem))]">
          <div className="flex items-center px-4 h-11 border-b border-white/[0.08] shrink-0 bg-ark-navy-950">
            <h2 id="NOVA-play-title" className="text-[13px] font-medium text-content-primary">
              NOVA Runner
            </h2>
          </div>
          <div className="flex-1 min-h-0 px-3 pb-3 pt-2 bg-ark-navy-950">
            <ArkRunnerGame active={open} compact />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-ark-navy-950 shadow-2xl overflow-hidden flex flex-col min-h-[24rem] h-[min(30rem,calc(100vh-4rem))]">
          <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.08] shrink-0 bg-ark-navy-950">
            <p className="text-[13px] font-medium text-content-primary">
              {complete ? 'Install complete' : 'Background install'}
            </p>
            <button
              type="button"
              className="h-7 w-7 rounded-md text-content-tertiary hover:text-content-primary flex items-center justify-center"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center px-5 sm:px-6 py-6 gap-5 bg-ark-navy-950">
            <div className="space-y-1.5">
              <p className={`text-[11px] font-medium ${complete ? 'text-emerald-300/90' : 'text-sky-300/90'}`}>
                {phaseLabel}
              </p>
              <p className="text-xl font-semibold text-content-primary tracking-tight leading-snug">
                {label}
              </p>
              {(contextDetail || contextSize) && (
                <p className="text-[12px] text-content-secondary leading-relaxed">
                  {[contextDetail, contextSize].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-content-secondary">
                  {complete ? 'Ready for chat' : 'Download progress'}
                </span>
                <span className="text-sm font-medium tabular-nums text-content-primary">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    complete ? 'bg-emerald-400/90' : 'bg-sky-400/90'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              className="ark-btn-primary h-10 px-5 rounded-xl text-sm w-full mt-1"
              onClick={onClose}
            >
              {complete ? 'Back to Models' : 'Close game'}
            </button>
            <p className="text-[11px] text-content-tertiary text-center">
              Press Esc to close
            </p>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

export function PlayGameButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-white/[0.07] hover:border-sky-500/30 transition-colors ${className}`}
    >
      Play
    </button>
  );
}
