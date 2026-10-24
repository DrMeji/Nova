/**
 * Studio controls — opened from the composer + menu (not a bar above the ask box).
 */
import { SlidersHorizontal, X } from 'lucide-react';
import { HomeControlsPanel } from '@/components/HomeControlsPanel';

export function StudioControlsOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Studio controls"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        aria-label="Close studio controls"
        onClick={onClose}
      />
      <div className="relative z-10 flex w-full max-w-xl max-h-[min(88vh,40rem)] flex-col overflow-hidden rounded-2xl border border-surface-border bg-nova-navy-900 shadow-2xl shadow-black/50">
        <header className="shrink-0 flex items-start justify-between gap-3 border-b border-surface-border px-4 py-3.5">
          <div className="min-w-0 flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-surface-hover/40">
              <SlidersHorizontal className="w-4 h-4 text-content-secondary" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-content-primary">Studio controls</h2>
              <p className="mt-0.5 text-[12px] text-content-tertiary leading-snug">
                Optional switches for chat, Live preview, and the project workspace.
                Turn one on only if you need it — most invent work ignores these.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-6">
          <HomeControlsPanel
            home="chat-composer"
            title="While you chat"
            blurb="Open a suite to see what’s active."
            peerBoxes
            defaultOn
          />
          <HomeControlsPanel
            home="chat-side"
            title="Beside the thread"
            blurb="Open a suite to see what’s active."
            peerBoxes
            defaultOn
          />
          <HomeControlsPanel
            home="live-chrome"
            title="Live preview window"
            blurb="Open a suite to see what’s active."
            peerBoxes
            defaultOn
          />
          <HomeControlsPanel
            home="code-header"
            title="Code overlay"
            blurb="Open a suite to see what’s active."
            peerBoxes
            defaultOn
          />
          <HomeControlsPanel
            home="workspace"
            title="Project workspace"
            blurb="Open a suite to see what’s active."
            peerBoxes
            defaultOn
          />
        </div>
      </div>
    </div>
  );
}
