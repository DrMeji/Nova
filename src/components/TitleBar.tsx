import { Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { titleForRoute } from '@/lib/routeTitle';
import { needsFirstRunSetup } from '@/lib/setup';

/** Overlay window chrome. does not push layout down (even sidebar padding). */
export function TitleBar() {
  const desktop = typeof window !== 'undefined' ? window.novaDesktop : undefined;
  const [visible, setVisible] = useState(Boolean(desktop?.windowControls));
  const [maximized, setMaximized] = useState(false);
  const { route } = useRouter();
  const { user, profile, loading } = useAuth();
  const context = !user || loading
    ? 'NOVA'
    : (needsFirstRunSetup() || !profile?.onboarding_completed)
      ? 'Setup'
      : titleForRoute(route);

  useEffect(() => {
    if (!desktop?.windowControls) {
      setVisible(false);
      return;
    }
    setVisible(true);
    void desktop.windowIsMaximized?.().then(setMaximized).catch(() => {});
    const unsub = desktop.onWindowMaximized?.((payload) => {
      if (typeof payload?.maximized === 'boolean') setMaximized(payload.maximized);
    });
    return () => {
      unsub?.();
    };
  }, [desktop]);

  useEffect(() => {
    document.title = (!context || context === 'NOVA') ? 'NOVA' : `NOVA · ${context}`;
  }, [context]);

  if (!visible) return null;

  return (
    <div
      className="ark-titlebar absolute top-0 inset-x-0 z-40 h-8 flex items-stretch select-none bg-transparent"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Intentionally blank: you only want sidebar icons/search at the top-left. */}
      <div className="flex-1 min-w-0 flex items-center pl-3 pr-2 pointer-events-none" />
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          type="button"
          aria-label="Minimize"
          className="w-11 h-8 flex items-center justify-center text-content-tertiary hover:bg-white/5 hover:text-content-primary"
          onClick={() => void desktop?.windowMinimize?.()}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          className="w-11 h-8 flex items-center justify-center text-content-tertiary hover:bg-white/5 hover:text-content-primary"
          onClick={() => {
            void desktop?.windowMaximizeToggle?.().then((next) => {
              if (typeof next === 'boolean') setMaximized(next);
              else void desktop.windowIsMaximized?.().then(setMaximized);
            });
          }}
        >
          {maximized ? (
            <Square className="w-3 h-3.5" strokeWidth={1.75} />
          ) : (
            <Square className="w-3 h-3.5" />
          )}
        </button>
        <button
          type="button"
          aria-label="Close"
          className="w-11 h-8 flex items-center justify-center text-content-tertiary hover:bg-red-500/80 hover:text-white"
          onClick={() => void desktop?.windowClose?.()}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
