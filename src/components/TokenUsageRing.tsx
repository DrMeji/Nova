/** Circular token-budget indicator — click for model + usage detail. */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  /** 0–1 */
  ratio: number;
  size?: number;
  className?: string;
  title?: string;
  /** Active model label shown in the popover */
  modelName?: string;
  /** Optional subtitle (e.g. Local · failover) */
  modelDetail?: string;
};

export function TokenUsageRing({
  ratio,
  size = 18,
  className = '',
  title,
  modelName,
  modelDetail,
}: Props) {
  const r = Math.max(0, Math.min(1, ratio));
  const stroke = 2.25;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const dash = c * r;
  const pct = Math.round(r * 100);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const label = modelName?.trim() || 'ARK Auto';
  const detail = modelDetail?.trim() || 'Session turn budget';
  const isLocal = /\blocal\b|on-device/i.test(detail);
  const budgetLabel = isLocal ? 'On-device context budget' : 'Turn budget';

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPos({
        left: Math.min(rect.left, window.innerWidth - 220),
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
        title={title || `${label} · ${pct}% of ${isLocal ? 'on-device context' : 'turn'} budget`}
        aria-label={`${label}, token usage ${pct} percent`}
        aria-expanded={open}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-white/15"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            className={r > 0.85 ? 'text-amber-300' : 'text-white/90'}
          />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="fixed z-[80] w-[200px] rounded-xl border border-surface-border bg-ark-navy-900/95 shadow-xl backdrop-blur-md p-3"
          style={{ left: pos.left, bottom: pos.bottom }}
          role="dialog"
          aria-label="Model usage"
        >
          <p className="text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">Using now</p>
          <p className="text-sm font-medium text-content-primary mt-1 truncate" title={label}>{label}</p>
          <p className="text-[11px] text-content-tertiary mt-0.5 truncate">{detail}</p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-content-secondary">{budgetLabel}</span>
              <span className={`font-medium ${r > 0.85 ? 'text-amber-300' : 'text-content-primary'}`}>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] ${r > 0.85 ? 'bg-amber-400' : 'bg-sky-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
