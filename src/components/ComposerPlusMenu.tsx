import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';

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
  | 'image';

type Props = {
  onAction: (action: ComposerPlusAction) => void;
  /** chat = full attach menu; image = photos only; code = file/folder/photo for workspace */
  scope?: 'chat' | 'image' | 'code';
  /** @deprecated Image is handled via Add file */
  showImage?: boolean;
  /** Spinning ring around + while folder/files upload */
  busy?: boolean;
  className?: string;
  buttonClassName?: string;
};

type MenuItem = {
  id: ComposerPlusAction;
  label: string;
};

const MODE_ITEMS: MenuItem[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'ask', label: 'Ask' },
  { id: 'agent', label: 'Agent' },
  { id: 'debug', label: 'Debug' },
  { id: 'multitask', label: 'Multi-agent' },
];

const MODE_IDS = new Set<ComposerPlusAction>(MODE_ITEMS.map((m) => m.id));

function itemsForScope(scope: 'chat' | 'image' | 'code'): MenuItem[] {
  if (scope === 'image') {
    return [{ id: 'image', label: 'Add photo' }];
  }
  if (scope === 'code') {
    return [
      ...MODE_ITEMS,
      { id: 'bind-path', label: 'Bind project' },
      { id: 'import-folder', label: 'Import copy' },
    ];
  }
  return [
    ...MODE_ITEMS,
    { id: 'bind-path', label: 'Bind project' },
  ];
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
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = itemsForScope(scope);

  useEffect(() => {
    if (!open || busy) return;
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
      if (openAbove) {
        const topEdge = shellRect?.top ?? r.top;
        setPos({ left, bottom: window.innerHeight - topEdge + gap });
      } else {
        const bottomEdge = shellRect?.bottom ?? r.bottom;
        setPos({ left, top: bottomEdge + gap });
      }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, busy]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
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

  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

  const pick = (action: ComposerPlusAction) => {
    setOpen(false);
    onAction(action);
  };

  const menu: ReactNode = open && pos && !busy
    ? createPortal(
      <div
        ref={menuRef}
        className="rounded-xl border border-surface-border bg-ark-navy-900 shadow-2xl shadow-black/50 px-1.5 py-1.5"
        style={{
          position: 'fixed',
          left: pos.left,
          ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
          zIndex: 99999,
          maxWidth: 'min(92vw, 560px)',
        }}
      >
        <div className="flex flex-wrap items-center gap-0.5">
          {visible.map((m, i) => {
            const showSep = i > 0 && MODE_IDS.has(visible[i - 1]!.id) && !MODE_IDS.has(m.id);
            return (
              <span key={m.id} className="contents">
                {showSep ? (
                  <span className="mx-1 h-4 w-px bg-surface-border shrink-0" aria-hidden />
                ) : null}
                <button
                  type="button"
                  onClick={() => pick(m.id)}
                  className="px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors whitespace-nowrap"
                >
                  {m.label}
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
          setOpen(o => !o);
        }}
        disabled={busy}
        className={`relative ${buttonClassName || 'w-9 h-9 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0'} ${busy ? 'opacity-90 cursor-wait' : ''}`}
        title={busy ? 'Uploading…' : scope === 'image' ? 'Add photo' : 'Modes and project'}
        aria-label={busy ? 'Uploading' : scope === 'image' ? 'Add photo' : 'Modes and project'}
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
