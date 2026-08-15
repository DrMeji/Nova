import { Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Frameless window chrome only — no brand text (sidebar owns branding).
 * Drag the empty area to move; controls stay on the right.
 */
export function TitleBar() {
  const desktop = typeof window !== 'undefined' ? window.arkDesktop : undefined;
  const [visible, setVisible] = useState(Boolean(desktop?.windowControls));
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desktop?.windowControls) {
      setVisible(false);
      return;
    }
    setVisible(true);
    void desktop.windowIsMaximized?.().then(setMaximized).catch(() => {});
  }, [desktop]);

  if (!visible) return null;

  return (
    <div
      className="ark-titlebar shrink-0 h-8 flex items-stretch select-none bg-ark-navy-950"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex-1 min-w-0" />
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
            void desktop?.windowMaximizeToggle?.().then(() => {
              void desktop.windowIsMaximized?.().then(setMaximized);
            });
          }}
        >
          <Square className="w-3 h-3.5" />
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
