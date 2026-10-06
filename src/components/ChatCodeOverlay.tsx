/**
 * In-chat Code overlay. file tree left, editor right.
 * Not a separate Code chat / ProjectWorkspace route.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Code2, FileCode, Folder, FolderOpen, X } from 'lucide-react';
import { CodeEditor } from '@/components/CodeEditor';
import { fileTintClass } from '@/lib/syntaxHighlight';
import {
  getBuildLiveClock,
  subscribeBuildDiagnostics,
  type BuildFileTiming,
} from '@/lib/buildDiagnostics';

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
  fileMs,
  activePath,
}: {
  nodes: TreeNode[];
  depth: number;
  selected: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onPick: (path: string) => void;
  fileMs?: Record<string, number>;
  activePath?: string | null;
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
                  fileMs={fileMs}
                  activePath={activePath}
                />
              ) : null}
            </div>
          );
        }
        const ms = fileMs?.[node.path] ?? 0;
        const isActive = activePath === node.path;
        const stalled = isActive && ms >= 8000;
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
            <span className="truncate flex-1 min-w-0">{node.name}</span>
            {ms > 400 ? (
              <span
                className={`shrink-0 text-[9px] tabular-nums font-mono ${
                  stalled ? 'text-amber-300' : isActive ? 'text-violet-300' : 'text-content-tertiary/80'
                }`}
              >
                {(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s
              </span>
            ) : null}
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

function shortPath(path: string | null | undefined): string {
  const p = String(path || '').replace(/\\/g, '/');
  if (!p) return '';
  return p.split('/').pop() || p;
}

function BuildTimerBadge({
  live,
  clock,
}: {
  live: boolean;
  clock: ReturnType<typeof getBuildLiveClock>;
}) {
  const show = clock.totalMs > 0 || clock.active || live;
  if (!show) return null;

  const fileName = shortPath(clock.currentPath);
  const topFiles = clock.fileTimings.slice(0, 3);

  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 pointer-events-none select-none"
      title={
        topFiles.length
          ? topFiles.map((f: BuildFileTiming) => `${shortPath(f.path)} ${Math.round(f.ms / 100) / 10}s`).join('\n')
          : 'Build elapsed'
      }
    >
      <div
        className={`font-mono text-[13px] font-semibold tracking-wide tabular-nums ${
          clock.stalled ? 'text-amber-300' : clock.active || live ? 'text-violet-100' : 'text-content-secondary'
        }`}
      >
        {clock.totalLabel}
        {(clock.active || live) ? (
          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-300 animate-pulse align-middle" aria-hidden />
        ) : clock.totalMs > 0 ? (
          <span className="ml-1.5 text-[10px] font-sans font-medium text-content-tertiary align-middle">done</span>
        ) : null}
      </div>
      {fileName ? (
        <div
          className={`text-[10px] tabular-nums max-w-[14rem] truncate ${
            clock.stalled ? 'text-amber-200/90' : 'text-content-tertiary'
          }`}
        >
          {clock.stalled ? 'idle · ' : 'coding · '}
          {fileName}
          {clock.currentFileMs > 0 ? ` · ${clock.currentFileLabel}` : ''}
        </div>
      ) : clock.phase ? (
        <div className="text-[10px] text-content-tertiary max-w-[16rem] truncate">
          {String(clock.phase).replace(/\*\*/g, '').slice(0, 48)}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Smooth “typing” reveal for Live / Preview — never dump whole model chunks at once.
 * Catches up gently when the buffer races ahead so we stay watchable, not hours behind.
 */
function nextRevealSlice(prev: string, target: string): string {
  if (!target) return '';
  if (prev === target) return prev;
  // Rewind / replace: keep common prefix, then ease forward.
  let common = 0;
  const maxCommon = Math.min(prev.length, target.length);
  while (common < maxCommon && prev.charCodeAt(common) === target.charCodeAt(common)) common += 1;
  if (common < prev.length) {
    // Content changed under us — jump to common prefix (or a short ahead if target is shorter).
    return target.slice(0, Math.min(target.length, Math.max(common, Math.min(common + 24, target.length))));
  }
  const lag = target.length - prev.length;
  if (lag <= 0) return target;
  const remain = target.slice(prev.length);
  const nl = remain.indexOf('\n');
  // Prefer finishing the current line so it reads like typing, not paste.
  if (nl === 0) return target.slice(0, prev.length + 1);
  if (nl > 0 && nl <= 56 && lag <= 120) {
    return target.slice(0, prev.length + nl + 1);
  }
  // Soft catch-up when the model is far ahead — still stepwise, not one paste.
  const step = lag > 800 ? 48 : lag > 320 ? 18 : lag > 120 ? 8 : lag > 40 ? 4 : 2;
  return target.slice(0, prev.length + Math.min(step, lag));
}

export function ChatCodeOverlay({
  open,
  onClose,
  files,
  projectName,
  onChangeFile,
  readOnly = false,
  followPath = null,
  /** When true, typewriter-reveal even if not mid-generate (Preview demo). */
  smoothTyping = false,
}: {
  open: boolean;
  onClose: () => void;
  files: Record<string, string>;
  projectName?: string;
  onChangeFile: (path: string, content: string) => void;
  readOnly?: boolean;
  /** While Nova is writing, auto-select this path so you can watch live. */
  followPath?: string | null;
  smoothTyping?: boolean;
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
  const [clock, setClock] = useState(() => getBuildLiveClock());
  const [revealed, setRevealed] = useState('');
  const revealPathRef = useRef('');
  const revealedByPathRef = useRef<Record<string, string>>({});
  const targetRef = useRef('');
  const typingActive = readOnly || smoothTyping;

  useEffect(() => {
    if (!open) return;
    const sync = () => setClock(getBuildLiveClock());
    sync();
    const unsub = subscribeBuildDiagnostics(sync);
    const id = window.setInterval(sync, 250);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, [open]);

  const fileMs = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of clock.fileTimings) map[f.path] = f.ms;
    return map;
  }, [clock.fileTimings]);

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

  // Auto-scroll editor to bottom as live / typed content grows — keep highlight + gutter in sync.
  useEffect(() => {
    if (!open || !typingActive) return;
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
    const timer = window.setTimeout(() => requestAnimationFrame(sync), 24);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, typingActive, followPath, files, selected, revealed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const altPath = selected ? selected.split('/').join('\\') : '';
  const fullValue = selected
    ? (files[selected] ?? (altPath ? files[altPath] : '') ?? '')
    : '';
  // Always point the ticker at the latest buffer — do not restart the interval on each paint.
  targetRef.current = fullValue;

  // Typewriter toward the latest buffer while Live / Preview demo is on.
  useEffect(() => {
    if (!open) {
      setRevealed('');
      revealPathRef.current = '';
      revealedByPathRef.current = {};
      targetRef.current = '';
      return;
    }
    if (!typingActive) {
      setRevealed(targetRef.current);
      return;
    }
    // Path switch: resume that file's prior reveal — never blank App.tsx just because
    // follow hopped to App.css (looked like a full wipe + rewrite).
    if (revealPathRef.current !== selected) {
      revealPathRef.current = selected;
      const target = targetRef.current;
      const saved = revealedByPathRef.current[selected] || '';
      let resume = '';
      if (saved && target.startsWith(saved)) {
        resume = saved;
      } else if (saved && saved.startsWith(target) && target.length > 0) {
        // File shrank (heal/truncation) — show current buffer, don't replay from empty.
        resume = target;
      } else if (target.length > 0 && saved.length === 0) {
        // First visit mid-stream: catch up near the end so we don't replay thousands of chars.
        resume = target.length > 400 ? target.slice(0, Math.max(0, target.length - 280)) : '';
      } else {
        resume = '';
      }
      setRevealed(resume);
      if (selected) revealedByPathRef.current[selected] = resume;
    }
    const pathKey = selected;
    const id = window.setInterval(() => {
      setRevealed((prev) => {
        const next = nextRevealSlice(prev, targetRef.current);
        if (pathKey) revealedByPathRef.current[pathKey] = next;
        // Keep the viewport glued to the growing tail while typewriter runs.
        if (next !== prev) {
          window.requestAnimationFrame(() => {
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
          });
        }
        return next;
      });
    }, 22);
    return () => window.clearInterval(id);
  }, [open, typingActive, selected]);

  // When not typing, keep revealed synced so toggling modes never shows stale text.
  useEffect(() => {
    if (!open || typingActive) return;
    setRevealed(fullValue);
  }, [open, typingActive, fullValue]);

  if (!open) return null;

  const value = typingActive ? revealed : fullValue;

  const waitingBanner = (() => {
    if (!readOnly || !clock.active) return null;
    const phase = String(clock.phase || '');
    const waitingCoder = /waiting for (?:first tokens|App)|Loading coder|Coder is thinking|still waiting/i.test(phase);
    const appSelected = /App\.(tsx|jsx)$/i.test(selected || '');
    const stubby = fullValue.trim().length < 120
      || /Todo List\s*\d*|export default function App\(\)\s*\{\s*return\s*\(\s*<div[^>]*>\s*<h1/i.test(fullValue);
    if (waitingCoder || (appSelected && stubby && clock.totalMs > 4_000)) {
      const target = clock.currentPath?.split('/').pop() || 'App';
      return waitingCoder
        ? `Coder is loading in the background — watching ${selected?.split('/').pop() || 'scaffold'} while ${target} prepares…`
        : `Still building ${target} — local coder is writing; this can take a couple of minutes…`;
    }
    if (clock.stalled) {
      return `Working on ${clock.currentPath?.split('/').pop() || 'files'} — retry kicks in if this stays quiet…`;
    }
    return null;
  })();

  const onPick = (path: string) => {
    // Watch-only during Live create/edit — never steal auto-follow by clicking the tree.
    if (readOnly) return;
    userPickedRef.current = true;
    setSelected(path);
  };

  return (
    <div
      data-nova-code-overlay="1"
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
        <div className="shrink-0 h-11 px-3 flex items-center justify-between gap-2 border-b border-surface-border/80 bg-nova-navy-900/80 relative">
          <div className="flex items-center gap-2 min-w-0 z-[1]">
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
          <BuildTimerBadge live={readOnly} clock={clock} />
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover z-[1]"
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
                fileMs={fileMs}
                activePath={clock.currentPath}
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
            {waitingBanner ? (
              <div
                className="shrink-0 px-3 py-1.5 text-[11px] leading-snug border-b border-violet-500/20 bg-violet-500/10 text-violet-100/90 flex items-center gap-2"
                role="status"
                aria-live="polite"
              >
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                  <span className="absolute inset-0 rounded-full bg-violet-300/50 animate-ping" />
                  <span className="relative h-2 w-2 rounded-full bg-violet-300" />
                </span>
                <span className="min-w-0">{waitingBanner}</span>
              </div>
            ) : null}
            <div className="flex-1 min-h-0">
              {selected ? (
                <CodeEditor
                  path={selected}
                  value={value}
                  readOnly={readOnly}
                  followTail={typingActive || readOnly}
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
