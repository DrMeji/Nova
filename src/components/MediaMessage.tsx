import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, Check } from 'lucide-react';
import { resolveMediaRef } from '@/lib/recentStore';
import { usableAssistantText } from '@/lib/chatHistory';
import { ChatMarkdown } from '@/lib/chatMarkdown';
import { isChatAttachMessage, stripChatAttach } from '@/lib/chatAttach';
import { AttachMessageBody } from '@/components/AttachCard';
import { isTraceMessage, parseTraceMessage } from '@/lib/agentTrace';
import { AgentTracePanel } from '@/components/AgentTracePanel';
import { isCatalogMessage, parseCatalogMessage } from '@/lib/folderCatalog';
import { FolderCatalogCard } from '@/components/FolderCatalogCard';
import { isPcExploreMessage, parsePcExploreMessage } from '@/lib/pcExplore';
import { PcExploreCard } from '@/components/PcExploreCard';
import { isPromptChipsMessage, parsePromptChipsMessage } from '@/lib/chatPromptChips';
import { PromptChipsCard } from '@/components/PromptChipsCard';
import { AgentProgressStatus } from '@/components/AgentProgressStatus';

const PIXEL_COLS = 18;
const PIXEL_ROWS = 14;

function MediaPixelField() {
  const cells = useMemo(() => {
    const list: { id: number; delay: number; dur: number }[] = [];
    for (let i = 0; i < PIXEL_COLS * PIXEL_ROWS; i++) {
      list.push({
        id: i,
        delay: (i * 41 + (i % 7) * 90) % 1600,
        dur: 850 + ((i * 59) % 1100),
      });
    }
    return list;
  }, []);

  // Full-card grid: equal padding on all sides (no paddingTop squeeze into the foot).
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ padding: 14 }}
      aria-hidden
    >
      <div
        className="grid h-full w-full gap-[4px]"
        style={{
          gridTemplateColumns: `repeat(${PIXEL_COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${PIXEL_ROWS}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((cell) => (
          <span
            key={cell.id}
            className="media-gen-pixel rounded-full"
            style={{
              width: '100%',
              height: '100%',
              animationDelay: `${cell.delay}ms`,
              animationDuration: `${cell.dur}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function GeneratingPlaceholder({
  kind,
  label,
  sessionKey,
}: {
  kind: 'image' | 'video' | 'chat';
  label?: string;
  sessionKey?: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (kind === 'chat') return;
    const t0 = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [kind, sessionKey]);

  if (kind === 'chat') {
    const shown = label || 'Thinking…';
    return (
      <div className="flex items-center gap-2.5 py-1 text-sm text-content-secondary" aria-label={shown}>
        <span className="inline-flex items-center gap-1.5" aria-hidden>
          <span className="ark-status-dot" />
          <span className="ark-status-dot ark-status-dot-2" />
          <span className="ark-status-dot ark-status-dot-3" />
        </span>
        <span className="text-content-secondary text-xs font-medium tracking-wide">{shown}</span>
      </div>
    );
  }

  const headline = label
    || (kind === 'video' ? 'Creating video' : 'Creating image');

  // Slightly smaller card; fixed px so flex layouts cannot collapse it.
  return (
    <div
      role="status"
      aria-label={headline}
      style={{
        position: 'relative',
        width: 320,
        maxWidth: '100%',
        height: kind === 'video' ? 180 : 320,
        borderRadius: 16,
        background: '#2a2b32',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div className="absolute inset-0 media-gen-wash" />
      <MediaPixelField />
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          top: 0,
          padding: '14px 16px 0',
          zIndex: 2,
          background: 'linear-gradient(180deg, rgba(42,43,50,0.92) 0%, rgba(42,43,50,0.55) 70%, transparent 100%)',
          paddingBottom: 28,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 500,
            color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.55)',
          }}
        >
          {headline}
        </p>
        {elapsed > 0 ? (
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
              fontVariantNumeric: 'tabular-nums',
              textShadow: '0 1px 2px rgba(0,0,0,0.45)',
            }}
          >
            {elapsed}s
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Ext from MIME / path only — never scan base64 (random “svg” bytes caused .svg downloads). */
function mediaDownloadExt(src: string, isVideo: boolean): string {
  if (isVideo) return 'mp4';
  const data = /^data:(image|video)\/([a-z0-9+.-]+)/i.exec(src);
  if (data) {
    const sub = data[2].toLowerCase();
    if (sub.includes('png')) return 'png';
    if (sub.includes('webp')) return 'webp';
    if (sub.includes('gif')) return 'gif';
    if (sub.includes('svg')) return 'png';
    return 'jpg';
  }
  const pathOnly = src.split('?')[0].split('#')[0];
  if (/\.png$/i.test(pathOnly)) return 'png';
  if (/\.webp$/i.test(pathOnly)) return 'webp';
  if (/\.gif$/i.test(pathOnly)) return 'gif';
  if (/\.jpe?g$/i.test(pathOnly)) return 'jpg';
  return 'jpg';
}

function sniffImageExt(buf: ArrayBuffer): 'png' | 'jpg' | 'webp' | 'gif' | null {
  const u8 = new Uint8Array(buf);
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'jpg';
  if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'png';
  if (u8.length >= 12 && u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46
    && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return 'webp';
  if (u8.length >= 6 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'gif';
  return null;
}

function MediaLightbox({
  src,
  alt,
  isVideo,
  onClose,
}: {
  src: string;
  alt: string;
  isVideo: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Image preview'}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 sm:p-8"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-4 right-4 rounded-lg px-3 py-1.5 text-sm text-white/90 bg-white/10 hover:bg-white/20"
        onClick={onClose}
      >
        Close
      </button>
      <div
        className="max-h-full max-w-full"
        onClick={e => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={src}
            controls
            autoPlay
            className="max-h-[min(92vh,900px)] max-w-[min(96vw,1200px)] rounded-xl bg-black"
          />
        ) : (
          <img
            src={src}
            alt={alt}
            className="max-h-[min(92vh,900px)] max-w-[min(96vw,1200px)] rounded-xl object-contain bg-[#0d1117]"
          />
        )}
      </div>
    </div>
  );
}

function MediaActions({ src, alt }: { src: string; alt: string }) {
  const [copied, setCopied] = useState(false);
  const isVideo = src.startsWith('data:video/') || /\.mp4(\?|$)/i.test(src);

  const onCopy = async () => {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
      } else {
        await navigator.clipboard.writeText(alt || src);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      try {
        await navigator.clipboard.writeText(alt || '');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      } catch {
        /* ignore */
      }
    }
  };

  const onDownload = () => {
    void (async () => {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        const buf = await blob.arrayBuffer();
        const sniffed = sniffImageExt(buf);
        let ext = isVideo ? 'mp4' : (sniffed || mediaDownloadExt(src, false));
        // Never offer a broken .svg wrapper for real raster bytes.
        if (ext === 'svg') ext = sniffed || 'jpg';
        const mime =
          ext === 'png' ? 'image/png'
            : ext === 'webp' ? 'image/webp'
              : ext === 'gif' ? 'image/gif'
                : ext === 'mp4' ? 'video/mp4'
                  : 'image/jpeg';
        const out = new Blob([buf], { type: mime });
        const url = URL.createObjectURL(out);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ark-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      } catch {
        // Fallback: still avoid .svg from base64 false-positives
        const a = document.createElement('a');
        a.href = src;
        a.download = `ark-${Date.now()}.${mediaDownloadExt(src, isVideo)}`;
        a.click();
      }
    })();
  };

  return (
    <div className="flex items-center gap-1 mt-2">
      <button
        type="button"
        onClick={() => void onCopy()}
        className="p-1.5 rounded-lg text-content-tertiary hover:text-content-primary hover:bg-surface-hover/80 transition-colors"
        title="Copy"
        aria-label="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={onDownload}
        className="p-1.5 rounded-lg text-content-tertiary hover:text-content-primary hover:bg-surface-hover/80 transition-colors"
        title="Download"
        aria-label="Download"
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ResolvedMedia({ src, alt, preview }: { src: string; alt: string; preview?: boolean }) {
  const [lightbox, setLightbox] = useState(false);
  const isVideo = src.startsWith('data:video/') || /\.mp4(\?|$)/i.test(src);
  const looksSvg = /^data:image\/svg\+xml/i.test(src) || /\.svg(\?|$)/i.test(src);
  const showHonesty = Boolean(preview) || looksSvg;
  return (
    <div className={`relative ${showHonesty ? 'opacity-90' : ''}`}>
      {showHonesty ? (
        <p className="mb-1 text-[11px] text-amber-400/90">
          {looksSvg ? 'Offline / SVG placeholder — not a finished image' : 'Preview / offline fallback — not a finished image'}
        </p>
      ) : null}
      {isVideo ? (
        <video
          src={src}
          controls
          className="rounded-2xl bg-black block cursor-pointer"
          style={{ width: 320, maxWidth: '100%' }}
          onDoubleClick={() => setLightbox(true)}
        />
      ) : (
        <button
          type="button"
          className="block p-0 m-0 border-0 bg-transparent cursor-zoom-in rounded-2xl overflow-hidden text-left"
          onClick={() => setLightbox(true)}
          title="View larger"
          aria-label={`View larger: ${alt || 'image'}`}
        >
          <img
            src={src}
            alt={alt}
            className="rounded-2xl object-contain bg-[#0d1117] block pointer-events-none"
            style={{ maxWidth: 'min(100%, 420px)', maxHeight: 480, width: 'auto', height: 'auto' }}
          />
        </button>
      )}
      <MediaActions src={src} alt={alt} />
      {lightbox ? (
        <MediaLightbox
          src={src}
          alt={alt}
          isVideo={isVideo}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </div>
  );
}

function ArkMediaImage({ id, alt, preview }: { id: string; alt: string; preview?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void resolveMediaRef(id).then(url => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  if (!src) {
    return <GeneratingPlaceholder kind="image" label="Loading…" />;
  }
  return <ResolvedMedia src={src} alt={alt} preview={preview} />;
}

export function MessageContent({
  content,
  live,
  onPromptChipPick,
}: {
  content: string;
  live?: boolean;
  onPromptChipPick?: (prompt: string) => void;
}) {
  if (!content) {
    return <GeneratingPlaceholder kind="chat" label="Thinking…" />;
  }

  if (isPcExploreMessage(content)) {
    const data = parsePcExploreMessage(content);
    if (data) return <PcExploreCard data={data} />;
  }

  if (isCatalogMessage(content)) {
    const data = parseCatalogMessage(content);
    if (data) return <FolderCatalogCard data={data} />;
  }

  if (isPromptChipsMessage(content)) {
    const { body, chips } = parsePromptChipsMessage(content);
    if (onPromptChipPick && chips.length) {
      return <PromptChipsCard body={body} chips={chips} onPick={onPromptChipPick} />;
    }
    return body ? <ChatMarkdown text={body} /> : null;
  }

  if (isTraceMessage(content)) {
    const { payload, answer } = parseTraceMessage(content);
    if (payload) {
      const shown = (answer || payload.answer || '').trim() || 'Done.';
      return (
        <AgentTracePanel
          payload={payload}
          answer={shown}
          live={live ?? (!payload.done && !answer)}
          onContinue={payload.canContinue ? () => {
            window.dispatchEvent(new CustomEvent('ark:agent-continue'));
          } : undefined}
        />
      );
    }
  }

  if (isChatAttachMessage(content)) {
    const rest = stripChatAttach(content);
    if (rest && (/!\[[^\]]*\]\([^)]+\)/.test(rest) || rest.includes('ark-media:'))) {
      return (
        <div className="space-y-2">
          <AttachMessageBody content={content} />
          <MessageContent content={rest} live={live} />
        </div>
      );
    }
    return <AttachMessageBody content={content} />;
  }

  if (content.startsWith('__generating__:')) {
    const parts = content.split(':');
    const kind = parts[1] === 'video' ? 'video' : parts[1] === 'chat' ? 'chat' : 'image';
    const label = parts.slice(2).join(':') || undefined;
    const sessionKey = `${kind}`;
    if (kind === 'chat') {
      return <AgentProgressStatus label={label || 'Thinking…'} />;
    }
    return <GeneratingPlaceholder kind={kind} label={label} sessionKey={sessionKey} />;
  }

  if (content.startsWith('__progress__:')) {
    return <GeneratingPlaceholder kind="chat" label="Working…" />;
  }

  if (!content.includes('ark-media:') && !/!\[[^\]]*\]\([^)]+\)/.test(content)) {
    const shown = usableAssistantText(content) || content.trim();
    if (!shown) {
      return <p className="text-sm text-content-tertiary">(no response)</p>;
    }
    content = shown;
  }

  const mediaRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const chunks: { type: 'text' | 'media'; value: string; alt?: string }[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = mediaRe.exec(content)) !== null) {
    if (match.index > last) {
      chunks.push({ type: 'text', value: content.slice(last, match.index) });
    }
    chunks.push({ type: 'media', value: match[2], alt: match[1] });
    last = match.index + match[0].length;
  }
  if (last < content.length) chunks.push({ type: 'text', value: content.slice(last) });
  if (chunks.length === 0) chunks.push({ type: 'text', value: content });

  const onlyMedia = chunks.every(c => c.type === 'media' || !c.value.trim());
  const previewHint = /not a finished|motion still|offline fallback|real:\s*false|demo placeholder/i.test(content);

  return (
    <div className={onlyMedia ? 'space-y-2' : 'space-y-3'}>
      {chunks.map((chunk, i) => {
        if (chunk.type === 'media') {
          const src = chunk.value;
          const alt = chunk.alt || 'ARK generation';
          if (
            src.startsWith('data:image/')
            || src.startsWith('data:video/')
            || src.startsWith('http://')
            || src.startsWith('https://')
          ) {
            return <ResolvedMedia key={i} src={src} alt={alt} preview={previewHint} />;
          }
          if (src.startsWith('ark-media:')) {
            const id = src.slice('ark-media:'.length);
            return <ArkMediaImage key={i} id={id} alt={alt} preview={previewHint} />;
          }
          return (
            <p key={i} className="text-xs text-content-tertiary break-all">
              {src}
            </p>
          );
        }
        const text = chunk.value.trim();
        if (!text) return null;
        if (/^Source:\s/i.test(text)) {
          return null;
        }
        if (/not a finished|motion still|offline fallback|real:\s*false/i.test(text) && text.length < 200) {
          return (
            <p key={i} className="text-xs text-amber-400/90 whitespace-pre-wrap">
              {text}
            </p>
          );
        }
        return <ChatMarkdown key={i} text={text} />;
      })}
    </div>
  );
}
