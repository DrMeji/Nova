import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { tidyMarkdownStars } from '@/lib/chatHistory';
import { normalizeAssistantLists } from '@/lib/chatPlanMode';
import { openInSystemBrowser } from '@/lib/openExternal';

type ListItem = { text: string; kids?: string[] };

type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'ol'; items: ListItem[] }
  | { type: 'ul'; items: string[] }
  | { type: 'code'; lang: string; code: string };

/** Match "1. Title", "**1. Title:**", "1) Title" — models often bold the whole numbered line. */
function matchOrderedLine(line: string): { indent: string; body: string } | null {
  const m = line.match(/^(\s*)(?:\*\*\s*)?(\d+)[.)]\s+(.*)$/);
  if (!m) return null;
  let body = String(m[3] || '').trim();
  // Unwrap a whole-line bold wrapper: **Hero Section:** → Hero Section:
  if (/^\*\*.+\*\*:?\s*$/.test(body)) {
    body = body.replace(/^\*\*/, '').replace(/\*\*:?\s*$/, (tail) => (tail.includes(':') ? ':' : ''));
  }
  body = body.trim();
  if (!body) return null;
  return { indent: m[1], body };
}

function matchBulletLine(line: string): string | null {
  const m = line.match(/^\s*[-*•]\s+(.*)$/);
  return m ? String(m[1] || '').trim() : null;
}

function matchStarLine(line: string): string | null {
  const m = line.match(/^\s*[★☆✦]\s+(.*)$/);
  if (!m) return null;
  return String(m[1] || '').trim().replace(/^\*\*/, '').replace(/\*\*:?\s*$/, (t) => (t.includes(':') ? ':' : ''));
}

function splitBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let ol: ListItem[] | null = null;
  let ul: string[] | null = null;
  let codeLang: string | null = null;
  let codeLines: string[] | null = null;
  // Blank lines inside a list should not break numbering — only flush when content resumes non-list.
  let blankPending = false;

  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join('\n').trim();
    if (joined) blocks.push({ type: 'p', text: joined });
    para = [];
  };
  const flushList = () => {
    if (ol?.length) blocks.push({ type: 'ol', items: ol });
    if (ul?.length) blocks.push({ type: 'ul', items: ul });
    ol = null;
    ul = null;
    blankPending = false;
  };
  const flushCode = () => {
    if (codeLines) {
      blocks.push({ type: 'code', lang: codeLang || '', code: codeLines.join('\n').replace(/\n$/, '') });
    }
    codeLang = null;
    codeLines = null;
  };

  for (const line of lines) {
    const fenceOpen = line.match(/^```([\w+-]*)\s*$/);
    const fenceOpenInline = !fenceOpen && line.match(/^```([\w+-]*)\s+(.*)$/);
    if (fenceOpen && codeLines === null) {
      flushPara();
      flushList();
      codeLang = fenceOpen[1] || '';
      codeLines = [];
      continue;
    }
    if (fenceOpenInline && codeLines === null) {
      flushPara();
      flushList();
      codeLang = fenceOpenInline[1] || '';
      codeLines = [fenceOpenInline[2]];
      continue;
    }
    if (/^```\s*$/.test(line) && codeLines !== null) {
      flushCode();
      continue;
    }
    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      if (ol || ul) {
        blankPending = true;
        continue;
      }
      flushPara();
      continue;
    }

    const heading = line.match(/^\s*(#{1,4})\s+(.+?)\s*#*\s*$/);
    const ordered = matchOrderedLine(line);
    const star = matchStarLine(line);
    const bullet = matchBulletLine(line);

    if (heading) {
      flushPara();
      flushList();
      const level = Math.min(4, heading[1].length) as 1 | 2 | 3 | 4;
      blocks.push({ type: 'h', level, text: heading[2].trim() });
      continue;
    }

    if (ordered) {
      flushPara();
      // Starting / continuing an ordered list ends any open bullet list.
      if (ul) {
        blocks.push({ type: 'ul', items: ul });
        ul = null;
      }
      blankPending = false;
      ol = ol || [];
      ol.push({ text: ordered.body, kids: [] });
      continue;
    }

    if (star != null) {
      flushPara();
      if (ul) {
        blocks.push({ type: 'ul', items: ul });
        ul = null;
      }
      // Nest ★ subsections under the current main numbered step.
      if (ol?.length) {
        blankPending = false;
        const last = ol[ol.length - 1];
        last.kids = last.kids || [];
        last.kids.push(`★ ${star}`);
        continue;
      }
      blankPending = false;
      ul = ul || [];
      ul.push(`★ ${star}`);
      continue;
    }

    if (bullet != null) {
      flushPara();
      // Nest bullets under the current ordered item — do NOT flush the ol
      // (that was forcing every "1. Title" into its own one-item list).
      if (ol?.length) {
        blankPending = false;
        const last = ol[ol.length - 1];
        last.kids = last.kids || [];
        last.kids.push(bullet);
        continue;
      }
      blankPending = false;
      ul = ul || [];
      ul.push(bullet);
      continue;
    }

    // Non-list prose: end any open list.
    if (blankPending || ol || ul) flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  flushCode();
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={key++} className="rounded bg-surface-hover/80 px-1 py-0.5 text-[0.85em] font-mono">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        parts.push(
          <a
            key={key++}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            onClick={event => {
              event.preventDefault();
              void openInSystemBrowser(link[2]).catch(() => undefined);
            }}
            className="text-sky-400 underline-offset-2 hover:underline"
          >
            {link[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    } else {
      parts.push(token);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function CodeCopyBox({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl border border-surface-border bg-ark-navy-950/90 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-surface-border/80 bg-surface-hover/30">
        <span className="text-[10px] uppercase tracking-wide text-content-tertiary font-medium">
          {lang || 'code'}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-content-secondary hover:text-content-primary hover:bg-surface-hover"
          title={copied ? 'Copied' : 'Copy code'}
          aria-label={copied ? 'Copied' : 'Copy code'}
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }).catch(() => undefined);
          }}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 max-h-[min(28rem,50vh)] overflow-auto px-3 py-2.5 text-[12px] leading-relaxed font-mono text-content-primary whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

const HEADING_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: 'text-base font-semibold text-content-primary mt-1',
  2: 'text-[15px] font-semibold text-content-primary mt-1',
  3: 'text-sm font-semibold text-content-primary mt-0.5',
  4: 'text-sm font-medium text-content-primary mt-0.5',
};

export function ChatMarkdown({ text }: { text: string }) {
  const cleaned = normalizeAssistantLists(tidyMarkdownStars(text)).trim();
  if (!cleaned) return null;
  const blocks = splitBlocks(cleaned);
  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((block, i) => {
        if (block.type === 'code') {
          return <CodeCopyBox key={i} lang={block.lang} code={block.code} />;
        }
        if (block.type === 'h') {
          const Tag = (`h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4');
          return (
            <Tag key={i} className={HEADING_CLASS[block.level]}>
              {renderInline(block.text)}
            </Tag>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="list-decimal list-inside space-y-2 [overflow-wrap:anywhere] marker:font-semibold marker:tabular-nums">
              {block.items.map((item, j) => (
                <li key={j} className="pl-1">
                  <span className="font-semibold">{renderInline(item.text)}</span>
                  {item.kids && item.kids.length > 0 ? (
                    <ul className="list-none pl-0 mt-1 space-y-1 font-normal">
                      {item.kids.map((kid, k) => {
                        const isStar = /^★\s+/.test(kid);
                        const label = isStar ? kid.replace(/^★\s+/, '') : kid;
                        if (isStar) {
                          return (
                            <li key={k} className="font-normal flex gap-2">
                              <span className="shrink-0 text-content-secondary" aria-hidden>★</span>
                              <span className="font-semibold">{renderInline(label)}</span>
                            </li>
                          );
                        }
                        return (
                          <li key={k} className="font-normal list-disc ml-5">
                            {renderInline(label)}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-none pl-0 space-y-1">
              {block.items.map((item, j) => {
                const isStar = /^★\s+/.test(item);
                const label = isStar ? item.replace(/^★\s+/, '') : item;
                if (isStar) {
                  return (
                    <li key={j} className="flex gap-2">
                      <span className="shrink-0 text-content-secondary" aria-hidden>★</span>
                      <span className="font-semibold">{renderInline(label)}</span>
                    </li>
                  );
                }
                return (
                  <li key={j} className="list-disc ml-5">{renderInline(label)}</li>
                );
              })}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
