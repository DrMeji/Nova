import { useEffect, useState } from 'react';
import { Copy, Download, Check } from 'lucide-react';
import { resolveMediaRef } from '@/lib/recentStore';
import { usableAssistantText } from '@/lib/chatHistory';

export function GeneratingPlaceholder({
  kind,
  label,
}: {
  kind: 'image' | 'video' | 'chat';
  label?: string;
}) {
  if (kind === 'chat') {
    return (
      <div className="flex items-center gap-2 py-1 text-sm text-content-secondary" aria-label={label || 'Thinking'}>
        <span className="inline-flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary animate-pulse [animation-delay:120ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary animate-pulse [animation-delay:240ms]" />
        </span>
        <span className="text-content-tertiary text-xs">{label || 'Thinking…'}</span>
      </div>
    );
  }
  return (
    <div
      className={`relative w-full max-w-md overflow-hidden rounded-2xl bg-[#1a1d24] border border-surface-border/80 ${
        kind === 'video' ? 'aspect-video' : 'aspect-square'
      }`}
      aria-label={label || (kind === 'video' ? 'Creating video' : 'Creating image')}
    >
      <div className="absolute inset-0 media-gen-shimmer" />
      <div className="absolute inset-0 media-gen-dots opacity-40" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-content-primary/90 font-medium">
          {label || (kind === 'video' ? 'Creating video…' : 'Creating image…')}
        </p>
        <p className="text-[11px] text-content-tertiary">
          Matching your prompt — this can take a moment
        </p>
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
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
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
    const a = document.createElement('a');
    a.href = src;
    const ext = isVideo
      ? 'mp4'
      : src.includes('svg')
        ? 'svg'
        : src.includes('png')
          ? 'png'
          : 'jpg';
    a.download = `${(alt || 'ark-creation').slice(0, 40).replace(/\s+/g, '-')}.${ext}`;
    a.click();
  };

  return (
    <div className="flex items-center gap-0.5 mt-2">
      <button
        type="button"
        onClick={() => void onCopy()}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover transition-colors"
        title="Copy"
        aria-label="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={onDownload}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover transition-colors"
        title="Download"
        aria-label="Download"
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ResolvedMedia({
  src,
  alt,
  preview,
}: {
  src: string;
  alt: string;
  preview?: boolean;
}) {
  const isVideo = src.startsWith('data:video/') || /\.mp4(\?|$)/i.test(src);
  const isSvg = src.startsWith('data:image/svg');
  const showPreview = Boolean(preview || (!isVideo && isSvg));
  return (
    <div className="max-w-md">
      {showPreview && (
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-amber-400/90 font-semibold">
          Preview · not finished
        </p>
      )}
      {isVideo ? (
        <video
          src={src}
          controls
          playsInline
          className="w-full rounded-2xl object-cover bg-ark-navy-950 aspect-video"
          aria-label={alt || 'ARK video'}
        />
      ) : (
        <img
          src={src}
          alt={alt || 'ARK generation'}
          className={`w-full rounded-2xl object-cover bg-ark-navy-950 ${showPreview ? 'ring-1 ring-amber-400/30' : ''}`}
        />
      )}
      <MediaActions src={src} alt={alt} />
    </div>
  );
}

function ArkMediaImage({ id, alt, preview }: { id: string; alt: string; preview?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = await resolveMediaRef(id);
      if (cancelled) return;
      if (url) setSrc(url);
      else setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (failed) {
    return <p className="text-xs text-content-tertiary">Couldn’t load this creation.</p>;
  }
  if (!src) {
    return <GeneratingPlaceholder kind="image" label="Loading…" />;
  }
  return <ResolvedMedia src={src} alt={alt} preview={preview} />;
}

export function MessageContent({ content }: { content: string }) {
  if (!content) {
    return <GeneratingPlaceholder kind="chat" label="Thinking…" />;
  }

  if (content.startsWith('__generating__:')) {
    const parts = content.split(':');
    const kind = parts[1] === 'video' ? 'video' : parts[1] === 'chat' ? 'chat' : 'image';
    const label = parts.slice(2).join(':') || undefined;
    return <GeneratingPlaceholder kind={kind} label={label} />;
  }

  if (content.startsWith('__progress__:')) {
    return <GeneratingPlaceholder kind="chat" label="Working…" />;
  }

  if (!content.includes('ark-media:')) {
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
  const previewHint = /preview|not a finished|motion still|offline fallback/i.test(content);

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
          return (
            <p key={i} className="text-[10px] uppercase tracking-wider text-content-tertiary">
              {text}
            </p>
          );
        }
        // Keep preview lines visible; soft-style them
        if (/preview|not a finished|motion still|offline fallback/i.test(text) && text.length < 200) {
          return (
            <p key={i} className="text-xs text-amber-400/90 whitespace-pre-wrap">
              {text}
            </p>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {text}
          </p>
        );
      })}
    </div>
  );
}
