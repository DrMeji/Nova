/**
 * In-chat Code overlay. file tree left, editor right.
 * Not a separate Code chat / ProjectWorkspace route.
 */

import { useEffect, useMemo, useState } from 'react';
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

export function ChatCodeOverlay({
  open,
  onClose,
  files,
  projectName,
  onChangeFile,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  files: Record<string, string>;
  projectName?: string;
  onChangeFile: (path: string, content: string) => void;
  readOnly?: boolean;
}) {
  const paths = useMemo(() => Object.keys(files).map(p => p.replace(/\\/g, '/')), [files]);
  const tree = useMemo(() => buildTree(paths), [paths]);
  const [selected, setSelected] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
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
    const prefer = paths.find(p => /index\.html$/i.test(p))
      || paths.find(p => /App\.(jsx|tsx)$/i.test(p))
      || paths[0]
      || '';
    setSelected(prefer);
  }, [open, paths]);

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
        className="relative z-10 flex flex-col rounded-2xl border border-violet-500/25 bg-ark-navy-950 shadow-2xl shadow-black/50 overflow-hidden"
        style={{ width: 'min(98vw, 88rem)', height: 'min(94vh, 58rem)' }}
      >
        <div className="shrink-0 h-11 px-3 flex items-center justify-between gap-2 border-b border-surface-border/80 bg-ark-navy-900/80">
          <div className="flex items-center gap-2 min-w-0">
            <Code2 className="w-4 h-4 text-violet-300 shrink-0" />
            <p className="text-sm font-medium text-content-primary truncate">
              {projectName || 'Project files'}
            </p>
            {readOnly ? (
              <span className="text-[10px] text-amber-300/90 shrink-0">
                Live view — Nova is writing (editing unlocks when done)
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
            className="shrink-0 border-r border-surface-border/70 bg-ark-navy-900/40 overflow-auto"
            style={{ width: 'min(42%, 16rem)' }}
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
                onPick={setSelected}
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
