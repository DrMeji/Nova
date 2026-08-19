import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, FilePlus2, ListTree, MessageCircleQuestion, Bug, Layers2, FolderOpen, ImagePlus,
} from 'lucide-react';

export type ComposerPlusAction =
  | 'plan'
  | 'ask'
  | 'debug'
  | 'multitask'
  | 'file'
  | 'folder'
  | 'image';

type Props = {
  onAction: (action: ComposerPlusAction) => void;
  /** @deprecated Image is handled via Add file */
  showImage?: boolean;
  className?: string;
  buttonClassName?: string;
};

const ITEMS: {
  id: ComposerPlusAction;
  label: string;
  hint: string;
  icon: typeof ListTree;
}[] = [
  { id: 'plan', label: 'Plan', hint: 'Prefix: step-by-step plan before building', icon: ListTree },
  { id: 'ask', label: 'Ask', hint: 'Prefix: direct Q&A, no code changes', icon: MessageCircleQuestion },
  { id: 'debug', label: 'Debug', hint: 'Prefix: find and fix the problem', icon: Bug },
  { id: 'multitask', label: 'Tasks', hint: 'Prefix: split work into a numbered list', icon: Layers2 },
  { id: 'file', label: 'Add file', hint: 'Attach a file to inspect in chat', icon: FilePlus2 },
  { id: 'image', label: 'Add photo', hint: 'Attach an image for vision models', icon: ImagePlus },
  { id: 'folder', label: 'Open folder', hint: 'Inspect a folder, then continue in Code', icon: FolderOpen },
];

const MODE_IDS = new Set<ComposerPlusAction>(['plan', 'ask', 'debug', 'multitask']);

export function ComposerPlusMenu({
  onAction,
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
      setPos({ left: r.left, bottom: window.innerHeight - r.top + 6 });
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
        className="w-52 rounded-lg border border-surface-border bg-ark-navy-900 shadow-xl overflow-hidden"
        style={{
          position: 'fixed',
          left: pos.left,
          bottom: pos.bottom,
          zIndex: 99999,
        }}
      >
        <p className="px-2.5 pt-2 pb-1 text-[10px] text-content-tertiary">
          Message modes add a prefix to your next send
        </p>
        <div className="pb-1">
          {ITEMS.filter(m => MODE_IDS.has(m.id)).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface-hover transition-colors"
            >
              <m.icon className="w-3.5 h-3.5 text-content-tertiary shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-content-primary leading-tight">{m.label}</span>
                <span className="block text-[10px] text-content-tertiary truncate leading-tight">{m.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mx-2.5 border-t border-surface-border" />
        <p className="px-2.5 pt-2 pb-1 text-[10px] text-content-tertiary">Attach or open</p>
        <div className="pb-1">
          {ITEMS.filter(m => !MODE_IDS.has(m.id)).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface-hover transition-colors"
            >
              <m.icon className="w-3.5 h-3.5 text-content-tertiary shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-content-primary leading-tight">{m.label}</span>
                <span className="block text-[10px] text-content-tertiary truncate leading-tight">{m.hint}</span>
              </span>
            </button>
          ))}
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
        title="Add mode or file"
        aria-label="Add mode or file"
        aria-expanded={open}
      >
        <Plus className="w-4 h-4" />
      </button>
      {menu}
    </div>
  );
}
