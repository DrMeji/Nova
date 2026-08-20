import type { ReactNode } from 'react';
import { tidyMarkdownStars } from '@/lib/chatHistory';

type Block =
  | { type: 'p'; text: string }
  | { type: 'ol'; items: string[] }
  | { type: 'ul'; items: string[] };

function splitBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let ol: string[] | null = null;
  let ul: string[] | null = null;

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
  };

  for (const line of lines) {
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ordered) {
      flushPara();
      if (ul) {
        flushList();
      }
      ol = ol || [];
      ol.push(ordered[1]);
      continue;
    }
    if (bullet) {
      flushPara();
      if (ol) {
        flushList();
      }
      ul = ul || [];
      ul.push(bullet[1]);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    if (ol || ul) {
      flushList();
    }
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[1];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={key++} className="rounded bg-black/30 px-1 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        parts.push(
          <a
            key={key++}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 underline-offset-2 hover:underline"
          >
            {link[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function ChatMarkdown({ text }: { text: string }) {
  const cleaned = tidyMarkdownStars(text).trim();
  if (!cleaned) return null;
  const blocks = splitBlocks(cleaned);
  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((block, i) => {
        if (block.type === 'ol') {
          return (
            <ol key={i} className="list-decimal pl-5 space-y-1">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
