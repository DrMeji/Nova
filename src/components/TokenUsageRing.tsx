/** Circular dual-ring: turn context (inner) + model freshness (outer). */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ggufCtxCapacityLabel } from '@/lib/ggufContext';

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
};

export function TokenUsageRing({
  contextRatio,
  modelRatio = 0,
  size = 18,
  className = '',
  title,
  modelName,
  modelDetail,
}: Props) {
  const ctx = Math.max(0, Math.min(1, contextRatio));
  const mdl = Math.max(0, Math.min(1, modelRatio));
  const stroke = 2.1;
  const gap = 2.4;
  const outerR = (size - stroke) / 2;
  const innerR = Math.max(3, outerR - stroke - gap);
  const outerC = 2 * Math.PI * outerR;
  const innerC = 2 * Math.PI * innerR;
  const ctxPct = Math.round(ctx * 100);
  const mdlPct = Math.round(mdl * 100);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const label = modelName?.trim() || 'ARK Auto';
  const detail = modelDetail?.trim() || 'Session';
  const isLocal = /\blocal\b|on-device/i.test(detail);

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
        className={`inline-flex items-center justify-center shrink-0 rounded-full hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${className}`}
        title={title || `${label} · context ${ctxPct}% · model ${mdlPct}%`}
        aria-label={`${label}, context ${ctxPct} percent, model ${mdlPct} percent`}
        aria-expanded={open}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          {/* Outer. model freshness (color only when used; no white donut) */}
          {mdl > 0.008 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={outerR}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${outerC * mdl} ${outerC}`}
              className={mdl > 0.85 ? 'text-rose-500' : mdl > 0.55 ? 'text-amber-500' : 'text-violet-500'}
            />
          )}
          {/* Inner. turn context */}
          {ctx > 0.008 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={innerR}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${innerC * ctx} ${innerC}`}
              className={ctx > 0.85 ? 'text-amber-500' : 'text-sky-500'}
            />
          )}
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="fixed z-[80] w-[220px] rounded-xl border border-surface-border bg-surface-panel shadow-xl backdrop-blur-md p-3"
          style={{ left: pos.left, bottom: pos.bottom }}
          role="dialog"
          aria-label="Usage rings"
        >
          <p className="text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">Using now</p>
          <p className="text-sm font-medium text-content-primary mt-1 truncate" title={label}>{label}</p>
          <p className="text-[11px] text-content-tertiary mt-0.5 truncate">{detail}</p>

          <div className="mt-3 space-y-3">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-content-secondary">
                  <span className="w-2 h-2 rounded-full bg-sky-500 dark:bg-sky-300 shrink-0" aria-hidden />
                  {isLocal ? 'Context budget' : 'Turn context'}
                </span>
                <span className={`font-medium ${ctx > 0.85 ? 'text-amber-600 dark:text-amber-300' : 'text-content-primary'}`}>{ctxPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-active border border-surface-border overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] ${ctx > 0.85 ? 'bg-amber-500' : 'bg-sky-500'}`}
                  style={{ width: `${ctxPct}%` }}
                />
              </div>
              <p className="text-[10px] text-content-tertiary mt-1">
                {isLocal
                  ? `How full this turn’s prompt is · ${ggufCtxCapacityLabel()}`
                  : 'How full this turn’s prompt is.'}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-content-secondary">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${mdl > 0.85 ? 'bg-rose-500' : 'bg-violet-500 dark:bg-violet-300'}`} aria-hidden />
                  Model freshness
                </span>
                <span className={`font-medium ${mdl > 0.85 ? 'text-rose-600 dark:text-rose-300' : mdl > 0.55 ? 'text-amber-600 dark:text-amber-300' : 'text-content-primary'}`}>{mdlPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-active border border-surface-border overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] ${
                    mdl > 0.85 ? 'bg-rose-500' : mdl > 0.55 ? 'bg-amber-500' : 'bg-violet-500'
                  }`}
                  style={{ width: `${mdlPct}%` }}
                />
              </div>
              <p className="text-[10px] text-content-tertiary mt-1">
                How hard this brain has been worked. High = may slow down; Auto can rotate.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
