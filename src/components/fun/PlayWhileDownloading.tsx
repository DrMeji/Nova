import { useEffect, useRef, useState } from 'react';
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
 * Two separate panels on a blurred backdrop:
 * left = runner, right = download — with clear space between.
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

  const pct = Math.min(100, Math.round(complete ? 100 : progress));
  const label = jobName || contextLabel || 'Local brain';
  const phaseLabel = complete
    ? 'Installed on this PC'
    : pct < 25
      ? 'Preparing runtime'
      : pct < 100
        ? 'Downloading model weights'
        : 'Finalizing install';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-8">
      {/* Blurred backdrop */}
      <button
        type="button"
        className="absolute inset-0 border-0 cursor-default bg-black/55 backdrop-blur-md"
        aria-label="Close"
        onClick={onClose}
      />

      {/* Two separate panels — left / gap / right */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="NOVA-play-title"
        className="relative z-10 w-full max-w-6xl grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)] gap-4 sm:gap-6 items-stretch"
      >
        {/* LEFT — runner */}
        <section className="rounded-2xl border border-surface-border bg-ark-navy-900 shadow-2xl overflow-hidden flex flex-col min-h-[24rem] h-[min(30rem,calc(100vh-4rem))]">
          <div className="flex items-center px-4 h-11 border-b border-white/[0.06] shrink-0">
            <h2 id="NOVA-play-title" className="text-[13px] font-medium text-content-primary">
              NOVA Runner
            </h2>
          </div>
          <div className="flex-1 min-h-0 px-3 pb-3 pt-2">
            <ArkRunnerGame active={open} compact />
          </div>
        </section>

        {/* RIGHT — download */}
        <section className="rounded-2xl border border-surface-border bg-ark-navy-900 shadow-2xl overflow-hidden flex flex-col min-h-[24rem] h-[min(30rem,calc(100vh-4rem))]">
          <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] shrink-0">
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

          <div className="flex-1 flex flex-col justify-center px-5 sm:px-6 py-6 gap-5">
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

            <ul className="space-y-2 text-[12px] text-content-tertiary leading-relaxed">
              <li className="flex gap-2">
                <span className="text-content-secondary shrink-0">·</span>
                <span>
                  {complete
                    ? 'Weights are on this PC — Chat can use this brain without waiting.'
                    : 'NOVA Engine is pulling GGUF weights in the background while you play.'}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-content-secondary shrink-0">·</span>
                <span>This mini-game is built into NOVA — it does not add to the download.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-content-secondary shrink-0">·</span>
                <span>
                  {complete
                    ? 'Close when you’re done, then continue setup with Enter NOVA.'
                    : 'You can close this anytime — the install keeps going.'}
                </span>
              </li>
            </ul>

            <button
              type="button"
              className="ark-btn-primary h-10 px-5 rounded-xl text-sm w-full mt-1"
              onClick={onClose}
            >
              {complete ? 'Back to setup' : 'Close game'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function PlayGameButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-sky-500/35 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-200 hover:bg-sky-500/15 transition-colors ${className}`}
    >
      Play game
    </button>
  );
}
