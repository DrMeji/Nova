/** Combined usage badge: context + model pressure as one percent (detail on click). */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { displayUsagePercent } from '@/lib/tokenUsage';

type Props = {
  /** 0–1 how full this turn’s packed prompt is */
  contextRatio: number;
  /** 0–1 how worn the current model session is (0 = fresh) */
  modelRatio?: number;
  size?: number;
  className?: string;
  title?: string;
  modelName?: string;
  modelDetail?: string;
  /** While the model is still generating — hide misleading 0% combined load. */
  working?: boolean;
};

export function TokenUsageRing({
  contextRatio,
  modelRatio = 0,
  size: _size = 18,
  className = '',
  title,
  modelName,
  modelDetail: _modelDetail,
  working = false,
}: Props) {
  const ctx = Math.max(0, Math.min(1, contextRatio));
  const mdl = Math.max(0, Math.min(1, modelRatio));
  const ctxPct = displayUsagePercent(ctx);
  const mdlPct = displayUsagePercent(mdl);
  /** Combined load — average of context + model pressure. Always show N% (0% ok while working). */
  const combinedPct = displayUsagePercent(Math.min(1, (ctx + mdl) / 2));
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const label = modelName?.trim() || 'NOVA';
  const hot = combinedPct >= 85;
  const warm = combinedPct >= 55;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPos({
        left: Math.min(rect.left, window.innerWidth - 240),
        bottom: window.innerHeight - rect.top + 8,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center justify-center shrink-0 min-w-[1.75rem] h-5 px-0.5 rounded-md tabular-nums text-[11px] font-semibold tracking-tight hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
          hot
            ? 'text-rose-300'
            : warm
              ? 'text-amber-300'
              : 'text-content-secondary'
        } ${className}`}
        title={title || `${label} · ${combinedPct}% session budget${working ? ' · working' : ''}`}
        aria-label={`${label}, ${combinedPct} percent session budget${working ? ', working' : ''}`}
        aria-expanded={open}
      >
        {`${combinedPct}%`}
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="fixed z-[80] w-[200px] rounded-xl border border-surface-border bg-surface-panel shadow-xl backdrop-blur-md p-3"
          style={{ left: pos.left, bottom: pos.bottom }}
          role="dialog"
          aria-label="Usage details"
        >
          <p className="text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">Using now</p>
          <p className="text-sm font-medium text-content-primary mt-1 truncate" title={label}>{label}</p>

          <div className="mt-3 flex items-center justify-between text-[11px]">
            <span className="text-content-secondary">Combined</span>
            <span className={`font-semibold tabular-nums ${hot ? 'text-rose-300' : warm ? 'text-amber-300' : 'text-content-primary'}`}>
              {combinedPct}%
            </span>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-content-secondary">
                  <span className="w-2 h-2 rounded-full bg-sky-500 dark:bg-sky-300 shrink-0" aria-hidden />
                  Context
                </span>
                <span className={`font-medium tabular-nums ${ctx > 0.85 ? 'text-amber-600 dark:text-amber-300' : 'text-content-primary'}`}>{ctxPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-active border border-surface-border overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] ${ctx > 0.85 ? 'bg-amber-500' : 'bg-sky-500'}`}
                  style={{ width: `${ctxPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-content-secondary">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${mdl > 0.85 ? 'bg-rose-500' : 'bg-violet-500 dark:bg-violet-300'}`} aria-hidden />
                  Model
                </span>
                <span className={`font-medium tabular-nums ${mdl > 0.85 ? 'text-rose-600 dark:text-rose-300' : mdl > 0.55 ? 'text-amber-600 dark:text-amber-300' : 'text-content-primary'}`}>{mdlPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-active border border-surface-border overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] ${
                    mdl > 0.85 ? 'bg-rose-500' : mdl > 0.55 ? 'bg-amber-500' : 'bg-violet-500'
                  }`}
                  style={{ width: `${mdlPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
