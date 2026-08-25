import { useEffect, useState } from 'react';
import { tipAt, tipStartIndex } from '@/lib/arkTips';

/** Rotating tip line for wait surfaces — no layout chrome of its own. */
export function RotatingTip({
  intervalMs = 7000,
  className = 'text-[11px] text-content-tertiary text-center leading-relaxed min-h-[2.5rem]',
}: {
  intervalMs?: number;
  className?: string;
}) {
  const [idx, setIdx] = useState(tipStartIndex);

  useEffect(() => {
    const t = window.setInterval(() => {
      setIdx(i => i + 1);
    }, Math.max(3000, intervalMs));
    return () => window.clearInterval(t);
  }, [intervalMs]);

  return (
    <p className={className} aria-live="polite">
      {tipAt(idx)}
    </p>
  );
}
