import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, FilePlus2, ListTree, MessageCircleQuestion, Bug, Layers2, FolderOpen, ImagePlus, Zap,
} from 'lucide-react';

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

const ITEMS: {
  id: ComposerPlusAction;
  label: string;
  hint: string;
  icon: typeof ListTree;
}[] = [
  { id: 'plan', label: 'Plan', hint: 'Steps only — no file writes until Go implement', icon: ListTree },
  { id: 'ask', label: 'Ask', hint: 'Answer only — no disk writes or commands', icon: MessageCircleQuestion },
  { id: 'agent', label: 'Agent', hint: 'Edit files and run approved tools in workspace', icon: Zap },
  { id: 'debug', label: 'Debug', hint: 'Find bugs and propose fixes', icon: Bug },
  { id: 'multitask', label: 'Tasks', hint: 'Split work into a numbered list', icon: Layers2 },
  { id: 'file', label: 'Add file', hint: 'Windows File Explorer — pick one or more files', icon: FilePlus2 },
  { id: 'image', label: 'Add photo', hint: 'Windows File Explorer — pick photo(s)', icon: ImagePlus },
  { id: 'folder', label: 'Open folder', hint: 'Edit files in place on your PC (recommended)', icon: FolderOpen },
  { id: 'import-folder', label: 'Import copy', hint: 'Copy folder into ARK storage (sandbox)', icon: FolderOpen },
  { id: 'enter-path', label: 'Enter path…', hint: 'Type a folder path and approve access', icon: FolderOpen },
];

const MODE_IDS = new Set<ComposerPlusAction>(['plan', 'ask', 'agent', 'debug', 'multitask']);

function itemsForScope(scope: 'chat' | 'image' | 'code') {
  if (scope === 'image') {
    return ITEMS.filter(m => m.id === 'image');
  }
  if (scope === 'code') {
    return ITEMS.filter(m =>
      m.id === 'file' || m.id === 'image' || m.id === 'folder'
      || m.id === 'import-folder' || m.id === 'enter-path' || MODE_IDS.has(m.id));
  }
  // Chat: Ask / Plan / Agent + open folder — no import-copy confusion.
  return ITEMS.filter(m =>
    m.id === 'file' || m.id === 'image' || m.id === 'folder'
    || m.id === 'plan' || m.id === 'ask' || m.id === 'agent');
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
  const modes = visible.filter(m => MODE_IDS.has(m.id));
  const attach = visible.filter(m => !MODE_IDS.has(m.id));

  useEffect(() => {
    if (!open || busy) return;
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
        className="w-52 rounded-lg border border-surface-border bg-ark-navy-900 shadow-xl overflow-hidden"
        style={{
          position: 'fixed',
          left: pos.left,
          bottom: pos.bottom,
          zIndex: 99999,
        }}
      >
        {modes.length > 0 && (
          <>
            <p className="px-2.5 pt-2 pb-1 text-[10px] text-content-tertiary">
              Message modes add a prefix to your next send
            </p>
            <div className="pb-1">
              {modes.map(m => (
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
            {attach.length > 0 && <div className="mx-2.5 border-t border-surface-border" />}
          </>
        )}
        {attach.length > 0 && (
          <>
            <p className="px-2.5 pt-2 pb-1 text-[10px] text-content-tertiary">
              {scope === 'image' ? 'Photos only' : 'Attach'}
            </p>
            <div className="pb-1">
              {attach.map(m => (
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
          </>
        )}
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
        title={busy ? 'Uploading…' : scope === 'image' ? 'Add photo' : 'Add mode or file'}
        aria-label={busy ? 'Uploading' : scope === 'image' ? 'Add photo' : 'Add mode or file'}
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
