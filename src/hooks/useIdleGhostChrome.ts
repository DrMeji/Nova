import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Ghost chrome after idle — same idea as Voice dimming Chat/Voice pill.
 * Idle → soft opacity; hover / focus / pointer near restores full.
 */
export function useIdleGhostChrome(opts?: {
  idleMs?: number;
  ghostOpacity?: number;
  enabled?: boolean;
}) {
  const idleMs = opts?.idleMs ?? 5000;
  const ghostOpacity = opts?.ghostOpacity ?? 0.28;
  const enabled = opts?.enabled !== false;
  const [ghosted, setGhosted] = useState(false);
  const [hovering, setHovering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(() => {
    if (!enabled) return;
    setGhosted(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setGhosted(true), idleMs);
  }, [enabled, idleMs]);

  useEffect(() => {
    if (!enabled) {
      setGhosted(false);
      return;
    }
    bump();
    const onActivity = () => bump();
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('wheel', onActivity, { passive: true });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('wheel', onActivity);
    };
  }, [enabled, bump]);

  const visible = !enabled || hovering || !ghosted;
  const style = {
    opacity: visible ? 1 : ghostOpacity,
    transition: 'opacity 700ms ease',
  } as const;

  const bind = {
    onMouseEnter: () => setHovering(true),
    onMouseLeave: () => setHovering(false),
    onFocus: () => setHovering(true),
    onBlur: () => setHovering(false),
  };

  return { ghosted: enabled && ghosted && !hovering, style, bind, bump };
}
