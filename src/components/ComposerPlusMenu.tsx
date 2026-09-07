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

export function ComposerPlusMenu({
  onAction,
  scope = 'chat',
  busy = false,
  className = '',
  buttonClassName = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = itemsForScope(scope);

  useEffect(() => {
    if (!open || busy) return;
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      // Sit fully above the chat composer box (not mid-overlap with its top edge).
      const shell = btn.closest('[data-ark-composer]') as HTMLElement | null;
      const topEdge = shell?.getBoundingClientRect().top ?? r.top;
      setPos({ left: r.left, bottom: window.innerHeight - topEdge + 10 });
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
        className="rounded-xl border border-white/10 bg-[#141416] shadow-2xl px-1.5 py-1.5"
        style={{
          position: 'fixed',
          left: pos.left,
          bottom: pos.bottom,
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
                  <span className="mx-1 h-4 w-px bg-white/10 shrink-0" aria-hidden />
                ) : null}
                <button
                  type="button"
                  onClick={() => pick(m.id)}
                  className="px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-zinc-200 hover:text-white hover:bg-white/[0.08] transition-colors whitespace-nowrap"
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
        <Plus className={`w-4 h-4 relative z-[1] ${busy ? 'opacity-70' : ''}`} />
      </button>
      {menu}
    </div>
  );
}
