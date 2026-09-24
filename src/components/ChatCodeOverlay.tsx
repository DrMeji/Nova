/**
 * In-chat Code overlay. file tree left, editor right.
 * Not a separate Code chat / ProjectWorkspace route.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Code2, FileCode, Folder, FolderOpen, X } from 'lucide-react';
import { CodeEditor } from '@/components/CodeEditor';
import { fileTintClass } from '@/lib/syntaxHighlight';

type TreeNode = {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  children?: TreeNode[];
};

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  for (const full of sorted) {
    const parts = full.split('/').filter(Boolean);
    let level = root;
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      acc = acc ? `${acc}/${name}` : name;
      const isFile = i === parts.length - 1;
      let node = level.find(n => n.name === name);
      if (!node) {
        node = {
          name,
          path: acc,
          kind: isFile ? 'file' : 'folder',
          children: isFile ? undefined : [],
        };
        level.push(node);
      }
      if (!isFile) {
        node.children = node.children || [];
        level = node.children;
      }
    }
  }
  return root;
}

function TreeRows({
  nodes,
  depth,
  selected,
  expanded,
  onToggle,
  onPick,
}: {
  nodes: TreeNode[];
  depth: number;
  selected: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onPick: (path: string) => void;
}) {
  return (
    <>
      {nodes.map(node => {
        const pad = 8 + depth * 12;
        if (node.kind === 'folder') {
          const open = expanded.has(node.path);
          const hasKids = Boolean(node.children?.length);
          return (
            <div key={node.path}>
              <button
                type="button"
                className="w-full flex items-center gap-1 py-1 pr-2 text-left text-[12px] text-content-secondary hover:bg-surface-hover/80"
                style={{ paddingLeft: pad }}
                onClick={() => onToggle(node.path)}
                aria-expanded={open}
              >
                <ChevronRight
                  className={`w-3 h-3 shrink-0 text-content-tertiary transition-transform ${
                    open ? 'rotate-90' : ''
                  } ${hasKids ? 'opacity-100' : 'opacity-40'}`}
                />
                {open
                  ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-400/80" />
                  : <Folder className="w-3.5 h-3.5 shrink-0 text-amber-400/80" />}
                <span className="truncate">{node.name}</span>
              </button>
              {open && hasKids ? (
                <TreeRows
                  nodes={node.children!}
                  depth={depth + 1}
                  selected={selected}
                  expanded={expanded}
                  onToggle={onToggle}
                  onPick={onPick}
                />
              ) : null}
            </div>
          );
        }
        return (
          <button
            key={node.path}
            type="button"
            className={`w-full flex items-center gap-1.5 py-1 pr-2 text-left text-[12px] truncate ${
              selected === node.path
                ? 'bg-violet-500/20 text-violet-100'
                : 'text-content-secondary hover:bg-surface-hover/80'
            }`}
            style={{ paddingLeft: pad }}
            onClick={() => onPick(node.path)}
          >
            <FileCode className={`w-3.5 h-3.5 shrink-0 ${fileTintClass(node.name)}`} />
            <span className="truncate">{node.name}</span>
          </button>
        );
      })}
    </>
  );
}

function followMatchesOpenFile(follow: string | null | undefined, selected: string): boolean {
  const want = String(follow || '').replace(/\\/g, '/').split('/').pop() || '';
  const got = String(selected || '').split('/').pop() || '';
  if (!want || !got) return false;
  if (want === got) return true;
  return want.replace(/\.tsx$/i, '.jsx') === got || want.replace(/\.jsx$/i, '.tsx') === got;
}

export function ChatCodeOverlay({
  open,
  onClose,
  files,
  projectName,
  onChangeFile,
  readOnly = false,
  followPath = null,
}: {
  open: boolean;
  onClose: () => void;
  files: Record<string, string>;
  projectName?: string;
  onChangeFile: (path: string, content: string) => void;
  readOnly?: boolean;
  /** While Nova is writing, auto-select this path so you can watch live. */
  followPath?: string | null;
}) {
  const paths = useMemo(
    () => Object.keys(files)
      .map(p => p.replace(/\\/g, '/'))
      // Never show npm lockfiles in Code — they look like endless copy-paste and freeze scroll.
      .filter(p => !/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/i.test(p))
      .filter(p => !/(^|\/)node_modules\//i.test(p)),
    [files],
  );
  const tree = useMemo(() => buildTree(paths), [paths]);
  const [selected, setSelected] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const userPickedRef = useRef(false);

  const pickPreferred = (list: string[], focus?: string | null) => {
    if (focus) {
      const f = String(focus).replace(/\\/g, '/').replace(/^\.\//, '');
      const hit = list.find((p) => p === f || p.endsWith('/' + f) || p.split('/').pop() === f.split('/').pop());
      if (hit) return hit;
    }
    return list.find(p => /App\.(jsx|tsx)$/i.test(p))
      || list.find(p => /App\.css$/i.test(p))
      || list.find(p => /index\.html$/i.test(p))
      || list.find(p => /main\.(tsx|jsx|js)$/i.test(p))
      || list.find(p => /package\.json$/i.test(p))
      || list[0]
      || '';
  };

  useEffect(() => {
    if (!open) {
      userPickedRef.current = false;
      return;
    }
    const folders = new Set<string>();
    for (const p of paths) {
      const parts = p.split('/');
      let acc = '';
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        folders.add(acc);
      }
    }
    setExpanded(folders);
    // Always pick a file when opening — including watch-only (readOnly) so Live create
    // never leaves "Pick a file on the left" empty while the explorer lists files.
    if (!userPickedRef.current) {
      const prefer = pickPreferred(paths, followPath);
      if (prefer) setSelected(prefer);
    }
  }, [open, paths, readOnly, followPath]);

  // Live follow: while writing, keep the editor on the file Nova is updating.
  // Throttle hard — rapid App.tsx↔App.jsx swaps + huge buffers were freezing the shell.
  useEffect(() => {
    if (!open || !readOnly) return;
    const focus = String(followPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (!focus) {
        setSelected((prev) => {
          if (prev) return prev;
          return paths.find(p => /App\.(jsx|tsx)$/i.test(p)) || paths[0] || '';
        });
        return;
      }
      const match = paths.find((p) => p === focus)
        || paths.find((p) => p.endsWith('/' + focus))
        || paths.find((p) => {
          const want = focus.split('/').pop() || '';
          const got = p.split('/').pop() || '';
          if (want === got) return true;
          return want.replace(/\.tsx$/i, '.jsx') === got || want.replace(/\.jsx$/i, '.tsx') === got;
        });
      if (!match) return;
      setSelected(match);
      setExpanded((prev) => {
        const next = new Set(prev);
        const parts = match.split('/');
        let acc = '';
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i];
          next.add(acc);
        }
        return next;
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, readOnly, followPath, paths]);

  // Auto-scroll editor to bottom as live content grows — keep highlight + gutter in sync.
  useEffect(() => {
    if (!open || !readOnly) return;
    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      const el = document.querySelector('[data-nova-code-editor]');
      if (!(el instanceof HTMLElement)) return;
      el.scrollTop = el.scrollHeight;
      const root = el.parentElement;
      const pre = root?.querySelector('.nova-code-highlight') as HTMLElement | null;
      const gutter = root?.querySelector('.nova-code-gutter') as HTMLElement | null;
      if (pre) {
        pre.scrollTop = el.scrollTop;
        pre.scrollLeft = el.scrollLeft;
      }
      if (gutter) gutter.scrollTop = el.scrollTop;
    };
    const timer = window.setTimeout(() => requestAnimationFrame(sync), 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, readOnly, followPath, files, selected]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const altPath = selected ? selected.split('/').join('\\') : '';
  const value = selected
    ? (files[selected] ?? (altPath ? files[altPath] : '') ?? '')
    : '';

  const onPick = (path: string) => {
    // Watch-only during Live create/edit — never steal auto-follow by clicking the tree.
    if (readOnly) return;
    userPickedRef.current = true;
    setSelected(path);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Code files"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-md"
        aria-label="Close code overlay"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex flex-col rounded-2xl border border-violet-500/25 bg-nova-navy-950 shadow-2xl shadow-black/50 overflow-hidden"
        style={{ width: 'min(98vw, 88rem)', height: 'min(94vh, 58rem)' }}
      >
        <div className="shrink-0 h-11 px-3 flex items-center justify-between gap-2 border-b border-surface-border/80 bg-nova-navy-900/80">
          <div className="flex items-center gap-2 min-w-0">
            <Code2 className="w-4 h-4 text-violet-300 shrink-0" />
            <p className="text-sm font-medium text-content-primary truncate">
              {projectName || 'Project files'}
            </p>
            {readOnly ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] text-violet-200/80 shrink-0">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inset-0 rounded-full bg-violet-300/50 animate-ping" />
                  <span className="relative h-2 w-2 rounded-full bg-violet-300" />
                </span>
                Live
              </span>
            ) : (
              <span className="text-[10px] text-content-tertiary hidden sm:inline">
                Click outside or Esc to return to chat
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <aside
            className={`shrink-0 border-r border-surface-border/70 bg-nova-navy-900/40 overflow-auto ${
              readOnly ? 'pointer-events-none select-none' : ''
            }`}
            style={{ width: 'min(42%, 16rem)' }}
            aria-label={readOnly ? 'Explorer (live follow — clicks disabled)' : 'Explorer'}
          >
            <p className="px-3 py-2 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
              Explorer
            </p>
            {tree.length ? (
              <TreeRows
                nodes={tree}
                depth={0}
                selected={selected}
                expanded={expanded}
                onToggle={(folderPath) => {
                  setExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(folderPath)) next.delete(folderPath);
                    else next.add(folderPath);
                    return next;
                  });
                }}
                onPick={onPick}
              />
            ) : (
              <p className="px-3 text-[12px] text-content-tertiary">No files yet.</p>
            )}
          </aside>
          <div className="flex-1 min-w-0 min-h-0 flex flex-col" style={{ background: '#1e1e1e' }}>
            <div
              className="shrink-0 h-9 px-3 flex items-center border-b border-white/5 text-[11px]"
              style={{ color: '#cccccc' }}
            >
              {selected || 'Select a file'}
              {readOnly && followMatchesOpenFile(followPath, selected) ? (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-violet-300/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-300 animate-pulse" aria-hidden />
                  live
                </span>
              ) : null}
            </div>
            <div className="flex-1 min-h-0">
              {selected ? (
                <CodeEditor
                  path={selected}
                  value={value}
                  readOnly={readOnly}
                  onChange={(next) => {
                    if (readOnly) return;
                    onChangeFile(selected, next);
                  }}
                />
              ) : (
                <div className="h-full grid place-items-center text-sm text-content-tertiary">
                  Pick a file on the left
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
