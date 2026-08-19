import { Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { titleForRoute } from '@/lib/routeTitle';
import { needsFirstRunSetup } from '@/lib/setup';
import { getLocalPrefs } from '@/lib/localPrefs';
import { probeAiModeLabel, type AiModeLabel } from '@/lib/aiModeStatus';

/** Overlay window chrome — does not push layout down (even sidebar padding). */
export function TitleBar() {
  const desktop = typeof window !== 'undefined' ? window.arkDesktop : undefined;
  const [visible, setVisible] = useState(Boolean(desktop?.windowControls));
  const [maximized, setMaximized] = useState(false);
  const { route } = useRouter();
  const { user, profile, loading } = useAuth();
  const context = !user || loading
    ? 'ARK'
    : (needsFirstRunSetup() || !profile?.onboarding_completed)
      ? 'Setup'
      : titleForRoute(route);

  const [channel, setChannel] = useState(() => getLocalPrefs().updateChannel);
  const [aiMode, setAiMode] = useState<AiModeLabel>('Offline');

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void probeAiModeLabel().then((label) => {
        if (alive) setAiMode(label);
      });
    };
    refresh();
    window.addEventListener('ark:prefs-changed', refresh);
    window.addEventListener('ark:provider-keys-changed', refresh);
    const t = window.setInterval(refresh, 15000);
    return () => {
      alive = false;
      window.removeEventListener('ark:prefs-changed', refresh);
      window.removeEventListener('ark:provider-keys-changed', refresh);
      window.clearInterval(t);
    };
  }, []);

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
    const onPrefs = () => setChannel(getLocalPrefs().updateChannel);
    window.addEventListener('ark:prefs-changed', onPrefs);
    return () => window.removeEventListener('ark:prefs-changed', onPrefs);
  }, []);

  useEffect(() => {
    document.title = context === 'ARK' ? 'ARK' : `ARK · ${context}`;
  }, [context]);

  if (!visible) return null;

  return (
    <div
      className="ark-titlebar absolute top-0 inset-x-0 z-50 h-8 flex items-stretch select-none bg-transparent"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex-1 min-w-0 flex items-center pl-3 pr-2 pointer-events-none">
        <span className="text-[11px] text-content-tertiary truncate">
          ARK
          {context !== 'ARK' ? <span className="text-content-secondary"> · {context}</span> : null}
          {channel === 'beta' && (
            <span className="ml-2 text-[9px] uppercase tracking-wide text-amber-400/90">Beta</span>
          )}
          <span className={`ml-2 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
            aiMode === 'Offline'
              ? 'text-rose-300/90 bg-rose-500/10'
              : aiMode === 'Degraded'
                ? 'text-amber-300/90 bg-amber-500/10'
              : aiMode === 'Cloud'
                ? 'text-sky-300/90 bg-sky-500/10'
                : aiMode === 'Hybrid'
                  ? 'text-violet-300/90 bg-violet-500/10'
                  : 'text-emerald-300/90 bg-emerald-500/10'
          }`}>
            {aiMode}
          </span>
        </span>
      </div>
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
            <span className="relative w-3 h-3.5">
              <Square className="w-2.5 h-2.5 absolute top-0.5 left-0.5 opacity-70" />
              <Square className="w-2.5 h-2.5 absolute top-0 left-0" />
            </span>
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
