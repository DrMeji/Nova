import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { tidyMarkdownStars } from '@/lib/chatHistory';
import { normalizeAssistantLists } from '@/lib/chatPlanMode';
import { openInSystemBrowser } from '@/lib/openExternal';
import { parseClinicReportPayload, type ClinicReport } from '@/lib/debugClinic';
import { DebugClinicReport } from '@/components/DebugClinicReport';

type ListItem = { text: string; kids?: string[] };

type ResearchImageItem = { title: string; imageUrl: string; sourceUrl: string };

type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'ol'; items: ListItem[] }
  | { type: 'ul'; items: string[] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'researchImages'; items: ResearchImageItem[] }
  | { type: 'debugClinic'; report: ClinicReport };

function parseResearchImagesComment(line: string): ResearchImageItem[] | null {
  const m = line.match(/<!--NOVA_RESEARCH_IMAGES:([\s\S]*?)-->/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]);
    if (!Array.isArray(raw)) return null;
    return raw
      .map((row) => ({
        title: String(row?.title || 'Image').slice(0, 120),
        imageUrl: String(row?.imageUrl || ''),
        sourceUrl: String(row?.sourceUrl || row?.imageUrl || ''),
      }))
      .filter((row) => /^https?:\/\//i.test(row.imageUrl) && /^https?:\/\//i.test(row.sourceUrl))
      .slice(0, 6);
  } catch {
    return null;
  }
}

function ResearchImageGallery({ items }: { items: ResearchImageItem[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2.5 py-1" role="list" aria-label="Research images">
      {items.map((item, i) => (
        <button
          key={`${item.imageUrl}-${i}`}
          type="button"
          role="listitem"
          title={`Open ${item.title}`}
          aria-label={`Open ${item.title}`}
          className="group relative w-[5.5rem] h-[8rem] sm:w-28 sm:h-40 rounded-lg overflow-hidden border border-surface-border bg-surface-hover/40 shadow-sm hover:border-sky-400/60 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          onClick={() => {
            void openInSystemBrowser(item.sourceUrl).catch(() => undefined);
          }}
        >
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = '0.25';
            }}
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1.5 pt-5 text-[10px] leading-tight text-white/95 opacity-90 group-hover:opacity-100">
            {item.title}
          </span>
        </button>
      ))}
    </div>
  );
}

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
      const code = codeLines.join('\n').replace(/\n$/, '');
      // Never paint an empty CODE / Copy box (models often emit ```markdown then stall).
      if (code.trim()) {
        if ((codeLang || '') === 'nova-debug-clinic') {
          const report = parseClinicReportPayload(code);
          if (report) {
            blocks.push({ type: 'debugClinic', report });
          } else {
            blocks.push({ type: 'code', lang: codeLang || '', code });
          }
        } else {
          blocks.push({ type: 'code', lang: codeLang || '', code });
        }
      }
    }
    codeLang = null;
    codeLines = null;
  };

  for (const line of lines) {
    const researchImgs = parseResearchImagesComment(line.trim());
    if (researchImgs?.length) {
      flushPara();
      flushList();
      blocks.push({ type: 'researchImages', items: researchImgs });
      blankPending = false;
      continue;
    }
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

    // After a blank line inside an ordered list, a non-indented line starts a new section
    // (e.g. **What’s next**) — never glue it onto the last finding.
    if (blankPending && ol?.length && !/^\s{2,}\S/.test(line)) {
      flushList();
      blankPending = false;
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
      // Former ★ subsections render as normal bullets under the current numbered step.
      if (ol?.length) {
        blankPending = false;
        const last = ol[ol.length - 1];
        last.kids = last.kids || [];
        last.kids.push(star);
        continue;
      }
      blankPending = false;
      ul = ul || [];
      ul.push(star);
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

    // Prose between numbered steps: keep the SAME <ol> so CSS/numbers don't restart at 1.
    // Attach short supporting sentences under the current item; only flush on a hard break.
    if (ol?.length) {
      const t = line.trim();
      blankPending = false;
      if (t) {
        const last = ol[ol.length - 1];
        last.kids = last.kids || [];
        // Plain description lines (not another list marker).
        last.kids.push(t);
      }
      continue;
    }

    if (blankPending || ul) flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  flushCode();
  return promoteUnfencedCode(blocks);
}

/** Detect unfenced source dumps (Python/JS) and wrap them in CodeCopyBox blocks.
 *  Never promote plain English planning lines into CODE boxes. */
function looksLikeCodeLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // Prose / planning — never a CODE box.
  if (/^(?:for\s+a\s+first\s+version|here(?:'s| is)|let'?s\s+focus|must-?haves?|nice-?to-?haves?|overall\s+approach|clarifying)\b/i.test(t)) {
    return false;
  }
  if (/^[A-Z][a-z]+(?:\s+[a-z]+){3,}/.test(t) && !/[{};=<>]/.test(t)) return false;
  if (/^(import |from |def |class |const |let |var |function |export |package |using |#include|<!DOCTYPE|<\?php)/i.test(t)) {
    // Require a code-ish tail so "const trust" style English does not match.
    if (/^(?:const|let|var)\s+\w+\s*=/.test(t) || /^(?:import|from|def|class|function|export|package|#include|<!DOCTYPE)/i.test(t)) {
      return true;
    }
    return false;
  }
  if (/^(stalls|products|items|data|users)\s*=\s*\[/.test(t)) return true;
  if (/^[{}\[\],]$/.test(t)) return true;
  if (/^["']?\w+["']?\s*:\s*/.test(t) && /[,{\[]\s*$/.test(t)) return true;
  if (/^\s{2,}(".+"\s*:|\{|\}|\[|\])/.test(line)) return true;
  // Control-flow only when it looks like real JS/Python, not "return home".
  if (/^(if\s*\(|for\s*\(|while\s*\(|return\s+[\[{'"0-9]|print\(|console\.|await\s+\w|async\s+function)/i.test(t)) {
    return true;
  }
  return false;
}

function inferLang(code: string): string {
  if (/\bdef\s+\w+\s*\(|\bprint\s*\(|^\s*from\s+\w+\s+import/m.test(code)) return 'python';
  if (/\b(const|let|function|export|import)\b/.test(code) && /[{;]/.test(code)) return 'javascript';
  if (/^\s*</.test(code.trim())) return 'html';
  return 'code';
}

function promoteUnfencedCode(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    if (block.type !== 'p') {
      out.push(block);
      continue;
    }
    const lines = block.text.split('\n');
    let buf: string[] = [];
    let codeBuf: string[] = [];
    const flushText = () => {
      const joined = buf.join('\n').trim();
      if (joined) out.push({ type: 'p', text: joined });
      buf = [];
    };
    const flushCodeRun = () => {
      const code = codeBuf.join('\n').replace(/\n+$/, '');
      if (code.trim().split('\n').length >= 2 || code.length > 80) {
        out.push({ type: 'code', lang: inferLang(code), code });
      } else if (code.trim()) {
        buf.push(...codeBuf);
      }
      codeBuf = [];
    };
    for (const line of lines) {
      if (looksLikeCodeLine(line) || (codeBuf.length > 0 && (/^\s{2,}\S/.test(line) || /^[{}\[\],]/.test(line.trim())))) {
        if (buf.length) flushText();
        codeBuf.push(line);
      } else {
        if (codeBuf.length) flushCodeRun();
        buf.push(line);
      }
    }
    if (codeBuf.length) flushCodeRun();
    flushText();
  }
  return out;
}

function renderLabelDetail(text: string, keyBase: number, opts?: { splitTone?: boolean }): ReactNode[] | null {
  const raw = String(text || '');
  // **Appearance:** thin bar…  OR  Appearance: thin bar…
  const m = raw.match(/^(?:\*\*)?([A-Za-z][\w\s/-]{1,40}?)(?:\*\*)?:\s+(.+)$/);
  if (!m) return null;
  const label = m[1].trim();
  const detail = m[2].trim();
  if (!label || !detail || detail.length < 2) return null;
  // User prompts stay one tone — never bold-primary label + gray detail.
  if (opts?.splitTone === false) {
    return [
      <span key={keyBase}>{label}: {renderInlinePlain(detail)}</span>,
    ];
  }
  return [
    <strong key={keyBase} className="text-content-primary font-semibold">{label}:</strong>,
    ' ',
    <span key={keyBase + 1} className="text-content-secondary font-normal">{renderInline(detail)}</span>,
  ];
}

/** Inline without recursive label-split (avoids nested tone splits). */
function renderInlinePlain(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) parts.push(token.slice(2, -2));
    else if (token.startsWith('*')) parts.push(token.slice(1, -1));
    else if (token.startsWith('`')) parts.push(token.slice(1, -1));
    else parts.push(token);
    last = match.index + token.length;
    key += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

/** `[label](url)` with balanced parentheses so Wikipedia `Holes_(novel)` does not leave a stray ")". */
function matchMarkdownLinkAt(text: string, from: number): { end: number; label: string; href: string } | null {
  if (text[from] !== '[') return null;
  const closeBracket = text.indexOf(']', from + 1);
  if (closeBracket < 0 || text[closeBracket + 1] !== '(') return null;
  let depth = 1;
  let j = closeBracket + 2;
  while (j < text.length && depth > 0) {
    if (text[j] === '(') depth += 1;
    else if (text[j] === ')') depth -= 1;
    j += 1;
  }
  if (depth !== 0) return null;
  const label = text.slice(from + 1, closeBracket);
  const href = text.slice(closeBracket + 2, j - 1).trim();
  if (!label || !href) return null;
  return { end: j, label, href };
}

function renderInline(text: string, opts?: { splitTone?: boolean }): ReactNode[] {
  const labeled = renderLabelDetail(text, 9000, opts);
  if (labeled) return labeled;
  const parts: ReactNode[] = [];
  // Links scanned separately — regex `[^)]+` breaks on Wikipedia _(novel) paths.
  const re = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+`|#[0-9A-Fa-f]{3,8}\b)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  const pushLinkNode = (label: string, href: string) => {
    if (!/^https?:\/\//i.test(href)) {
      parts.push(label);
      return;
    }
    parts.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={event => {
          event.preventDefault();
          void openInSystemBrowser(href).catch(() => undefined);
        }}
        className="inline-flex items-center gap-1 text-sky-400 underline-offset-2 hover:underline font-medium"
      >
        <span>{label}</span>
        <span className="text-[10px] opacity-70" aria-hidden>↗</span>
      </a>,
    );
  };

  const pushTextWithLinks = (slice: string) => {
    let i = 0;
    while (i < slice.length) {
      const link = matchMarkdownLinkAt(slice, i);
      if (link) {
        pushLinkNode(link.label, link.href);
        i = link.end;
        continue;
      }
      const next = slice.indexOf('[', i);
      if (next < 0) {
        if (i < slice.length) parts.push(slice.slice(i));
        break;
      }
      if (next > i) parts.push(slice.slice(i, next));
      // Literal "[" that isn't a valid markdown link — emit and continue.
      if (!matchMarkdownLinkAt(slice, next)) {
        parts.push('[');
        i = next + 1;
      } else {
        i = next;
      }
    }
  };

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) pushTextWithLinks(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      const inner = token.slice(2, -2).trim();
      if (/^#[0-9A-Fa-f]{3,8}$/.test(inner)) {
        parts.push(<HexColorChip key={key++} hex={inner} />);
      } else {
        parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
      }
    } else if (token.startsWith('*')) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      const inner = token.slice(1, -1).trim();
      if (/^#[0-9A-Fa-f]{3,8}$/.test(inner)) {
        parts.push(<HexColorChip key={key++} hex={inner} />);
      } else if (looksLikeFilePathChip(inner)) {
        parts.push(<FilePathChip key={key++} path={inner} />);
      } else {
        parts.push(
          <code key={key++} className="rounded bg-surface-hover/80 px-1 py-0.5 text-[0.85em] font-mono">
            {token.slice(1, -1)}
          </code>,
        );
      }
    } else if (token.startsWith('#')) {
      parts.push(<HexColorChip key={key++} hex={token} />);
    } else {
      parts.push(token);
    }
    last = match.index + token.length;
  }
  if (last < text.length) pushTextWithLinks(text.slice(last));
  return parts;
}

function looksLikeFilePathChip(raw: string): boolean {
  const t = String(raw || '').trim();
  if (!t || /\s/.test(t) || t.length > 160) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(t)) return false;
  // path/to/file.ext or bare file.ext
  if (/^[\w@.+-]+(?:[\\/][\w@.+-]+)+\.\w{1,12}$/.test(t)) return true;
  if (/^[\w@.+-]+\.(?:md|tsx?|jsx?|css|html?|json|svg|py|rs|go|vue|svelte|mjs|cjs|toml|yml|yaml)$/i.test(t)) {
    return true;
  }
  return false;
}

function fileExtBadge(path: string): { label: string; tone: string } {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (ext === 'ts' || ext === 'tsx') return { label: 'TS', tone: 'bg-sky-500/30 text-sky-100' };
  if (ext === 'js' || ext === 'jsx' || ext === 'cjs' || ext === 'mjs') {
    return { label: 'JS', tone: 'bg-amber-500/30 text-amber-100' };
  }
  if (ext === 'py') return { label: 'PY', tone: 'bg-emerald-500/30 text-emerald-100' };
  if (ext === 'html' || ext === 'htm') return { label: 'HTML', tone: 'bg-orange-500/30 text-orange-100' };
  if (ext === 'css') return { label: 'CSS', tone: 'bg-fuchsia-500/30 text-fuchsia-100' };
  if (ext === 'json') return { label: 'JSON', tone: 'bg-yellow-500/30 text-yellow-100' };
  if (ext === 'md' || ext === 'markdown') return { label: 'MD', tone: 'bg-violet-500/30 text-violet-100' };
  if (ext === 'svg') return { label: 'SVG', tone: 'bg-rose-500/30 text-rose-100' };
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), tone: 'bg-surface-hover text-content-tertiary' };
}

/** Boxed, extension-colored path chip for files touched in chat. */
function FilePathChip({ path }: { path: string }) {
  const badge = fileExtBadge(path);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 align-middle max-w-full"
      title={path}
    >
      <span className={`inline-flex h-4 min-w-[1.4rem] items-center justify-center rounded px-1 text-[8px] font-bold leading-none ${badge.tone}`}>
        {badge.label}
      </span>
      <span className="font-mono text-[0.85em] text-content-secondary truncate">{path}</span>
    </span>
  );
}

/** Click the swatch/chip to copy the hex — no separate Copy button. */
function HexColorChip({ hex }: { hex: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={copied ? 'Copied' : `Click to copy ${hex}`}
      aria-label={copied ? 'Copied' : `Copy ${hex}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void navigator.clipboard?.writeText(hex).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }).catch(() => undefined);
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-hover/60 px-2 py-1 align-middle cursor-pointer hover:border-sky-400/50 hover:bg-surface-hover transition-colors"
    >
      <span
        className="inline-block h-4 w-4 shrink-0 rounded-md border border-white/25 shadow-sm"
        style={{ background: hex }}
        aria-hidden
      />
      <code className="text-[0.85em] font-mono text-content-primary tracking-wide">
        {copied ? 'Copied' : hex}
      </code>
    </button>
  );
}

function CodeCopyBox({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl border border-surface-border bg-nova-navy-950/90 overflow-hidden">
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

export function ChatMarkdown({ text, tone = 'assistant' }: { text: string; tone?: 'user' | 'assistant' }) {
  const cleaned = normalizeAssistantLists(tidyMarkdownStars(text)).trim();
  if (!cleaned) return null;
  const splitTone = tone !== 'user';
  const inline = (s: string) => renderInline(s, { splitTone });
  const blocks = splitBlocks(cleaned);
  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((block, i) => {
        if (block.type === 'researchImages') {
          return <ResearchImageGallery key={i} items={block.items} />;
        }
        if (block.type === 'debugClinic') {
          return <DebugClinicReport key={i} report={block.report} />;
        }
        if (block.type === 'code') {
          return <CodeCopyBox key={i} lang={block.lang} code={block.code} />;
        }
        if (block.type === 'h') {
          const Tag = (`h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4');
          return (
            <Tag key={i} className={HEADING_CLASS[block.level]}>
              {inline(block.text)}
            </Tag>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="list-none space-y-2 [overflow-wrap:anywhere] pl-0">
              {block.items.map((item, j) => (
                <li key={j} className="pl-0 flex gap-2">
                  <span className="shrink-0 font-semibold tabular-nums text-content-primary w-5 text-right">
                    {j + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className={splitTone ? 'font-semibold' : undefined}>{inline(item.text)}</span>
                    {item.kids && item.kids.length > 0 ? (
                      <ul className="list-none pl-0 mt-1 space-y-1 font-normal">
                        {item.kids.map((kid, k) => {
                          const raw = String(kid || '').replace(/^★\s+/, '').trim();
                          const labeled = renderLabelDetail(
                            raw.replace(/^([-*•]|\u2022)\s+/, ''),
                            k * 10,
                            { splitTone },
                          );
                          const isDisc = /^([-*•]|\u2022)\s+/.test(raw)
                            || /^(Fields|Purpose|Must-Have|Later|Optional|Functionality)\s*:/i.test(raw);
                          const clean = raw.replace(/^([-*•]|\u2022)\s+/, '');
                          return (
                            <li
                              key={k}
                              className={
                                labeled
                                  ? 'font-normal mt-0.5 text-[0.95em]'
                                  : isDisc
                                  ? `font-normal list-disc ml-5${splitTone ? ' text-content-secondary' : ''}`
                                  : `font-normal mt-0.5${splitTone ? ' text-content-secondary' : ''}`
                              }
                            >
                              {labeled || inline(clean)}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-none pl-0 space-y-1">
              {block.items.map((item, j) => {
                const label = item.replace(/^★\s+/, '');
                return (
                  <li key={j} className="list-disc ml-5">{inline(label)}</li>
                );
              })}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0">
            {inline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
