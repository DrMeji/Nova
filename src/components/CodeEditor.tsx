import { forwardRef, useEffect, useMemo, useRef } from 'react';
import { highlightCode, languageFromPath } from '@/lib/syntaxHighlight';

type CodeEditorProps = {
  path: string;
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  jumpLine?: number;
  onSave?: () => void;
  /** When true (Live typing), keep the viewport pinned to the growing bottom. */
  followTail?: boolean;
  /** Ghost / inline autocomplete hints (from .nova/ghost-hints.json). */
  ghostHints?: string[];
};

export const CodeEditor = forwardRef<HTMLTextAreaElement, CodeEditorProps>(
  function CodeEditor({ path, value, onChange, readOnly, jumpLine, onSave, followTail, ghostHints }, ref) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const language = languageFromPath(path);
    const rawLineCount = Math.max(1, value.split('\n').length);
    // Huge lockfiles / dumps: never mount thousands of gutter nodes (scroll glitch).
    const MAX_PAINT_LINES = 400;
    const truncated = rawLineCount > MAX_PAINT_LINES;
    const paintValue = truncated
      ? `${value.split('\n').slice(0, MAX_PAINT_LINES).join('\n')}\n\n/* … ${rawLineCount - MAX_PAINT_LINES} more lines hidden — open the file in Explorer if you need the full lockfile */\n`
      : value;
    // Skip heavy highlight only while following a live craft stream (followTail).
    // Manual Code pill open for reading/editing still gets full VS Code colors.
    const streamPlain = Boolean(followTail);
    const highlighted = useMemo(() => {
      if (streamPlain) {
        return paintValue
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }
      return highlightCode(paintValue, language);
    }, [paintValue, language, streamPlain]);
    const lineCount = Math.max(1, paintValue.split('\n').length);
    const lines = useMemo(
      () => Array.from({ length: lineCount }, (_, i) => String(i + 1)),
      [lineCount],
    );

    const setTaRef = (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };

    const scrollToTail = () => {
      const ta = localRef.current;
      if (!ta) return;
      ta.scrollTop = ta.scrollHeight;
      const root = ta.parentElement;
      const pre = root?.querySelector('.nova-code-highlight') as HTMLElement | null;
      const gutter = root?.querySelector('.nova-code-gutter') as HTMLElement | null;
      if (pre) {
        pre.scrollTop = ta.scrollTop;
        pre.scrollLeft = ta.scrollLeft;
      }
      if (gutter) gutter.scrollTop = ta.scrollTop;
    };

    useEffect(() => {
      if (!jumpLine || jumpLine < 1) return;
      const root = localRef.current;
      if (!root) return;
      root.scrollTop = Math.max(0, (jumpLine - 1) * 20 - 40);
      try {
        const from = value.split('\n').slice(0, jumpLine - 1).join('\n').length + (jumpLine > 1 ? 1 : 0);
        const line = value.split('\n')[jumpLine - 1] || '';
        root.focus();
        root.setSelectionRange(from, from + line.length);
      } catch {
        /* ignore */
      }
    }, [jumpLine, path, value]);

    // Pin viewport to the growing end while Live types / craft streams.
    useEffect(() => {
      if (!followTail && !readOnly) return;
      let cancelled = false;
      const run = () => {
        if (cancelled) return;
        scrollToTail();
      };
      // Double rAF — wait until highlight + textarea layout finish after value paint.
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(run);
      });
      const t = window.setTimeout(run, 32);
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(id);
        window.clearTimeout(t);
      };
    }, [paintValue, path, readOnly, followTail, lineCount]);

    return (
      <div className="nova-code-editor relative h-full min-h-0 overflow-hidden rounded-md">
        <div className="nova-code-gutter" aria-hidden>
          {lines.map(n => (
            <div key={n}>{n}</div>
          ))}
        </div>
        <pre
          className="nova-code-highlight"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: `${highlighted}\n` }}
        />
        <textarea
          ref={setTaRef}
          data-nova-code-editor=""
          value={paintValue}
          readOnly={readOnly || truncated}
          onChange={e => {
            if (truncated) return;
            onChange(e.target.value);
          }}
          onKeyDown={e => {
            if (readOnly || truncated) return;
            if (e.key === 'Tab') {
              e.preventDefault();
              const ta = e.currentTarget;
              const start = ta.selectionStart;
              const end = ta.selectionEnd;
              // Ghost autocomplete: Tab completes matching hint when caret is on a word prefix.
              const hints = ghostHints || [];
              if (hints.length && start === end) {
                const before = value.slice(0, start);
                const m = before.match(/([A-Za-z_][A-Za-z0-9_-]*)$/);
                const prefix = m?.[1] || '';
                if (prefix.length >= 2) {
                  const hit = hints.find(
                    (h) => h.startsWith(prefix) && h.length > prefix.length,
                  );
                  if (hit) {
                    const insert = hit.slice(prefix.length);
                    const next = `${value.slice(0, start)}${insert}${value.slice(end)}`;
                    onChange(next);
                    requestAnimationFrame(() => {
                      ta.selectionStart = ta.selectionEnd = start + insert.length;
                    });
                    return;
                  }
                }
              }
              const insert = '  ';
              const next = `${value.slice(0, start)}${insert}${value.slice(end)}`;
              onChange(next);
              requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + insert.length;
              });
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              onSave?.();
            }
          }}
          onScroll={e => {
            const ta = e.currentTarget;
            const root = ta.parentElement;
            const pre = root?.querySelector('.nova-code-highlight') as HTMLElement | null;
            const gutter = root?.querySelector('.nova-code-gutter') as HTMLElement | null;
            if (pre) {
              pre.scrollTop = ta.scrollTop;
              pre.scrollLeft = ta.scrollLeft;
            }
            if (gutter) gutter.scrollTop = ta.scrollTop;
          }}
          spellCheck={false}
          wrap="off"
          className="nova-code-input"
          aria-label={path}
        />
      </div>
    );
  },
);
