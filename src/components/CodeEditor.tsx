import { forwardRef, useEffect, useMemo } from 'react';
import { highlightCode, languageFromPath } from '@/lib/syntaxHighlight';

type CodeEditorProps = {
  path: string;
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  jumpLine?: number;
  onSave?: () => void;
};

export const CodeEditor = forwardRef<HTMLTextAreaElement, CodeEditorProps>(
  function CodeEditor({ path, value, onChange, readOnly, jumpLine, onSave }, ref) {
    const language = languageFromPath(path);
    const rawLineCount = Math.max(1, value.split('\n').length);
    // Huge lockfiles / dumps: never mount thousands of gutter nodes (scroll glitch).
    const MAX_PAINT_LINES = 400;
    const truncated = rawLineCount > MAX_PAINT_LINES;
    const paintValue = truncated
      ? `${value.split('\n').slice(0, MAX_PAINT_LINES).join('\n')}\n\n/* … ${rawLineCount - MAX_PAINT_LINES} more lines hidden — open the file in Explorer if you need the full lockfile */\n`
      : value;
    // Live create streams huge App buffers — full highlight every chunk freezes the shell.
    // During watch-only, paint plain text (escaped) and only syntax-highlight when idle/small.
    const highlighted = useMemo(() => {
      if (readOnly && paintValue.length > 2400) {
        return paintValue
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }
      return highlightCode(paintValue, language);
    }, [paintValue, language, readOnly]);
    const lineCount = Math.max(1, paintValue.split('\n').length);
    const lines = useMemo(
      () => Array.from({ length: lineCount }, (_, i) => String(i + 1)),
      [lineCount],
    );

    useEffect(() => {
      if (!jumpLine || jumpLine < 1) return;
      const root = typeof ref === 'object' && ref?.current ? ref.current : null;
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
    }, [jumpLine, path, ref, value]);

    // Keep highlighted layer + gutter locked to the textarea when value grows (live write).
    useEffect(() => {
      if (!readOnly) return;
      const ta = typeof ref === 'object' && ref?.current ? ref.current : null;
      if (!ta) return;
      const root = ta.parentElement;
      const pre = root?.querySelector('.nova-code-highlight') as HTMLElement | null;
      const gutter = root?.querySelector('.nova-code-gutter') as HTMLElement | null;
      ta.scrollTop = ta.scrollHeight;
      if (pre) {
        pre.scrollTop = ta.scrollTop;
        pre.scrollLeft = ta.scrollLeft;
      }
      if (gutter) gutter.scrollTop = ta.scrollTop;
    }, [value, path, readOnly, ref]);

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
          ref={ref}
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
