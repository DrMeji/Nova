/**
 * Keyboard cheatsheet + global command palette (Ctrl+K already opens Search;
 * this hosts the dedicated Help surface items from Missing items).
 */
import { useEffect, useState } from 'react';
import { HomeControlsPanel } from '@/components/HomeControlsPanel';
import { X } from 'lucide-react';

export function GlobalHelpHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('NOVA:open-help', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('NOVA:open-help', onOpen);
    };
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Help">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close help" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl border border-surface-border bg-surface-panel shadow-2xl flex flex-col">
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-border">
          <div>
            <p className="text-sm font-semibold text-content-primary">Help & shortcuts</p>
            <p className="text-[11px] text-content-tertiary">Press ? anytime · Ctrl+K for Search</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-content-tertiary hover:text-content-primary hover:bg-surface-hover" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <HomeControlsPanel
            home="new-surface"
            title="Global surfaces"
            blurb="Open a suite to see what’s active."
            peerBoxes
            defaultOn
          />
        </div>
      </div>
    </div>
  );
}
