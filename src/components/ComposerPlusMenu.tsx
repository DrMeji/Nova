import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, FilePlus2, ListTree, MessageCircleQuestion, Bug, Layers2, ImageIcon,
} from 'lucide-react';

export type ComposerPlusAction =
  | 'plan'
  | 'ask'
  | 'debug'
  | 'multitask'
  | 'file'
  | 'image';

type Props = {
  onAction: (action: ComposerPlusAction) => void;
  /** Show image attach row (chat / code with vision). */
  showImage?: boolean;
  className?: string;
  buttonClassName?: string;
};

const MODES: {
  id: Exclude<ComposerPlusAction, 'file' | 'image'>;
  label: string;
  hint: string;
  icon: typeof ListTree;
}[] = [
  { id: 'plan', label: 'Plan', hint: 'Outline steps before building', icon: ListTree },
  { id: 'ask', label: 'Ask', hint: 'Answer a question', icon: MessageCircleQuestion },
  { id: 'debug', label: 'Debug', hint: 'Find and fix a problem', icon: Bug },
  { id: 'multitask', label: 'Multitask', hint: 'Split into parallel tasks', icon: Layers2 },
];

export function ComposerPlusMenu({
  onAction,
  showImage = true,
  className = '',
  buttonClassName = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

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

  const pick = (action: ComposerPlusAction) => {
    setOpen(false);
    onAction(action);
  };

  const menu: ReactNode = open && pos
    ? createPortal(
      <div
        ref={menuRef}
        className="w-64 rounded-xl border border-surface-border bg-ark-navy-900 shadow-2xl overflow-hidden"
        style={{
          position: 'fixed',
          left: pos.left,
          bottom: pos.bottom,
          zIndex: 99999,
        }}
      >
        <p className="px-3 pt-2.5 pb-1.5 text-[11px] text-content-tertiary">
          Add mode, file, or image…
        </p>
        <div className="py-1">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
            >
              <m.icon className="w-4 h-4 text-content-tertiary shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-content-primary">{m.label}</span>
                <span className="block text-[11px] text-content-tertiary truncate">{m.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-surface-border py-1">
          <button
            type="button"
            onClick={() => pick('file')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
          >
            <FilePlus2 className="w-4 h-4 text-content-tertiary shrink-0" strokeWidth={1.75} />
            <span className="text-sm text-content-primary">Add file</span>
          </button>
          {showImage && (
            <button
              type="button"
              onClick={() => pick('image')}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
            >
              <ImageIcon className="w-4 h-4 text-content-tertiary shrink-0" strokeWidth={1.75} />
              <span className="text-sm text-content-primary">Add image</span>
            </button>
          )}
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
        onClick={() => setOpen(o => !o)}
        className={buttonClassName || 'w-9 h-9 rounded-full flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors shrink-0'}
        title="Add mode, file, or image"
        aria-label="Add mode, file, or image"
        aria-expanded={open}
      >
        <Plus className="w-4 h-4" />
      </button>
      {menu}
    </div>
  );
}
