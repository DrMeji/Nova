import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bug, ChevronLeft, Folder, Paperclip, Plus } from 'lucide-react';
import { isDebugComposerParked } from '@/lib/featurePark';

export type ComposerPlusAction =
  | 'plan'
  | 'ask'
  | 'agent'
  | 'debug'
  | 'multitask'
  | 'file'
  | 'folder'
  | 'import-folder'
  | 'enter-path'
  | 'bind-path'
  | 'models-brain'
  | 'image'
  /** Combined photo + file picker (chat/code). */
  | 'attach';

type Props = {
  onAction: (action: ComposerPlusAction) => void;
  /** chat = modes + attach; image = attach photos; code = modes + attach */
  scope?: 'chat' | 'image' | 'code';
  /** @deprecated Image is handled via Attach */
  showImage?: boolean;
  /** Spinning ring around + while folder/files upload */
  busy?: boolean;
  className?: string;
  buttonClassName?: string;
};

type MenuItem = {
  id: ComposerPlusAction;
  label: string;
  /** Icon-only paperclip — opens file / project attach panel. */
  clip?: boolean;
  /** Optional leading icon for attach-panel rows. */
  icon?: 'folder' | 'clip' | 'bug';
  /** Parked like Message / Networking — visible, not clickable. */
  comingSoon?: boolean;
};

/** Mode ids (for separator between modes and attach). */
const MODE_IDS = new Set<ComposerPlusAction>(['plan', 'ask', 'agent', 'debug', 'multitask']);

function modeItemsForScope(scope: 'chat' | 'image' | 'code'): MenuItem[] {
  if (scope === 'image') {
    return [{ id: 'attach', label: '', clip: true }];
  }
  // Debug visible (parked Soon until clinic is ready); Plan/Agent/Multi-agent stay out.
  // Attach (files + project bind) under the paperclip.
  return [
    {
      id: 'debug',
      label: 'Debug',
      icon: 'bug',
      comingSoon: isDebugComposerParked(),
    },
    { id: 'attach', label: '', clip: true },
  ];
}

function attachPanelItems(scope: 'chat' | 'image' | 'code'): MenuItem[] {
  if (scope === 'image') {
    return [{ id: 'attach', label: 'Photos', icon: 'clip' }];
  }
  const items: MenuItem[] = [
    { id: 'attach', label: 'Files', icon: 'clip' },
    { id: 'bind-path', label: 'Project folder', icon: 'folder' },
  ];
  if (scope === 'code') {
    items.push(
      { id: 'enter-path', label: 'Enter path', icon: 'folder' },
      { id: 'import-folder', label: 'Import copy', icon: 'folder' },
    );
  }
  return items;
}

type MenuPos =
  | { left: number; top: number; bottom?: undefined }
  | { left: number; bottom: number; top?: undefined };

export function ComposerPlusMenu({
  onAction,
  scope = 'chat',
  busy = false,
  className = '',
  buttonClassName = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [attachPanel, setAttachPanel] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modes = modeItemsForScope(scope);
  const attachItems = attachPanelItems(scope);
  const visible = attachPanel ? attachItems : modes;

  useEffect(() => {
    if (!open || busy) return;
    let lastKey = '';
    let timer: ReturnType<typeof setInterval> | null = null;
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const shell = btn.closest('[data-ark-composer]') as HTMLElement | null;
      const shellRect = shell?.getBoundingClientRect();
      // Flush with the chat box left edge (not the inset + button).
      const left = Math.max(12, Math.min(window.innerWidth - 24, shellRect?.left ?? r.left));
      const gap = 10;
      const estimatedMenuH = 48;
      const spaceBelow = window.innerHeight - (shellRect?.bottom ?? r.bottom) - gap;
      const spaceAbove = (shellRect?.top ?? r.top) - gap;
      // Prefer below the composer; only flip above when the thread/viewport is cramped below.
      const openAbove = spaceBelow < estimatedMenuH + 12 && spaceAbove > spaceBelow;
      const next: MenuPos = openAbove
        ? { left, bottom: window.innerHeight - (shellRect?.top ?? r.top) + gap }
        : { left, top: (shellRect?.bottom ?? r.bottom) + gap };
      // Avoid setState spam — only commit when the bar actually moved (sidebar hover anim).
      const key = next.top != null
        ? `t:${Math.round(next.left)}:${Math.round(next.top)}`
        : `b:${Math.round(next.left)}:${Math.round(next.bottom!)}`;
      if (key === lastKey) return;
      lastKey = key;
      setPos(next);
    };
    place();
    // Light poll while open (sidebar anim) — not a continuous rAF CPU burn.
    timer = setInterval(place, 120);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, busy, attachPanel]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setAttachPanel(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (attachPanel) {
          setAttachPanel(false);
          return;
        }
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, attachPanel]);

  useEffect(() => {
    if (busy) {
      setOpen(false);
      setAttachPanel(false);
    }
  }, [busy]);

  const pick = (action: ComposerPlusAction) => {
    setOpen(false);
    setAttachPanel(false);
    onAction(action);
  };

  const onItemClick = (m: MenuItem) => {
    if (m.comingSoon) return;
    // Image scope: clip fires attach directly.
    if (scope === 'image' && m.clip) {
      pick('attach');
      return;
    }
    // Modes strip: clip opens the attach panel (files + project), does not close the bar.
    if (!attachPanel && m.clip) {
      setAttachPanel(true);
      return;
    }
    // Parked Debug must never arm even if comingSoon flag is stale.
    if (m.id === 'debug' && isDebugComposerParked()) return;
    pick(m.id);
  };

  const menu: ReactNode = open && pos && !busy
    ? createPortal(
      <div
        ref={menuRef}
        className="rounded-xl border border-surface-border bg-nova-navy-900 shadow-2xl shadow-black/50 px-1.5 py-1.5"
        style={{
          position: 'fixed',
          left: pos.left,
          ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
          zIndex: 99999,
          maxWidth: 'min(92vw, 560px)',
        }}
      >
        <div className="flex flex-wrap items-center gap-0.5">
          {attachPanel && scope !== 'image' ? (
            <button
              type="button"
              onClick={() => setAttachPanel(false)}
              title="Back to modes"
              aria-label="Back to modes"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0"
            >
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.25} aria-hidden />
            </button>
          ) : null}
          {visible.map((m, i) => {
            const showSep =
              !attachPanel
              && i > 0
              && MODE_IDS.has(visible[i - 1]!.id)
              && !MODE_IDS.has(m.id);
            const isClipOnly = Boolean(m.clip) && !m.label;
            const soon = Boolean(m.comingSoon);
            return (
              <span key={`${attachPanel ? 'a' : 'm'}-${m.id}-${i}`} className="contents">
                {showSep ? (
                  <span className="mx-1 h-4 w-px bg-surface-border shrink-0" aria-hidden />
                ) : null}
                <button
                  type="button"
                  disabled={soon}
                  aria-disabled={soon || undefined}
                  onClick={(e) => {
                    if (soon) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    onItemClick(m);
                  }}
                  title={
                    soon
                      ? `${m.label} · Coming Soon — find issues in a bound project`
                      : isClipOnly
                        ? 'Files, photos, or bind a project folder'
                        : m.id === 'attach'
                          ? 'Upload photos, PDFs, notes, or other files'
                          : m.id === 'bind-path'
                            ? 'Bind a project folder for Debug and edits'
                            : m.id === 'enter-path'
                              ? 'Type or paste a folder path on this PC'
                              : m.id === 'import-folder'
                                ? 'Import a copy of a project folder'
                                : m.id === 'debug'
                                  ? 'Debug — find issues in a bound project and how to fix them'
                                  : undefined
                  }
                  aria-label={
                    soon
                      ? `${m.label} (coming soon)`
                      : isClipOnly
                        ? 'Attach files or project'
                        : m.label
                  }
                  className={
                    soon
                      ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-content-tertiary opacity-55 cursor-not-allowed whitespace-nowrap'
                      : isClipOnly
                        ? 'inline-flex items-center justify-center w-8 h-8 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0'
                        : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors whitespace-nowrap'
                  }
                >
                  {m.clip || m.icon === 'clip' ? (
                    <Paperclip className="w-3.5 h-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
                  ) : null}
                  {m.icon === 'folder' ? (
                    <Folder className="w-3.5 h-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
                  ) : null}
                  {m.icon === 'bug' ? (
                    <Bug className="w-3.5 h-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
                  ) : null}
                  {m.label || null}
                  {soon ? (
                    <span className="text-[10px] uppercase tracking-wide text-content-tertiary">Soon</span>
                  ) : null}
                </button>
              </span>
            );
          })}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (busy) return;
          setOpen(o => {
            if (o) setAttachPanel(false);
            return !o;
          });
        }}
        disabled={busy}
        className={`relative ${buttonClassName || 'w-9 h-9 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0'} ${busy ? 'opacity-90 cursor-wait' : ''}`}
        title={busy ? 'Uploading…' : scope === 'image' ? 'Attach photo' : 'Modes, files, and project'}
        aria-label={busy ? 'Uploading' : scope === 'image' ? 'Attach photo' : 'Modes, files, and project'}
        aria-expanded={open}
        aria-busy={busy}
      >
        {busy && (
          <span
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-sky-400/25 border-t-sky-400 animate-spin"
            aria-hidden
          />
        )}
        <Plus className={`w-4 h-4 relative z-[1] ${busy ? 'opacity-70' : ''}`} strokeWidth={2.25} />
      </button>
      {menu}
    </div>
  );
}
