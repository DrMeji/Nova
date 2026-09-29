import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, Check, Globe } from 'lucide-react';
import { resolveMediaRef } from '@/lib/recentStore';
import { usableAssistantText } from '@/lib/chatHistory';
import { scrubUnexpectedForeignScript } from '@/lib/scrubForeignBleed';
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
import {
  isClinicReportMessage,
  parseClinicReportMessage,
  parseClinicStatusHistory,
} from '@/lib/debugClinic';
import { DebugClinicReport } from '@/components/DebugClinicReport';
import { isPlanReportMessage, parsePlanReport } from '@/lib/planReport';
import { PlanReport } from '@/components/PlanReport';
import { AgentProgressStatus } from '@/components/AgentProgressStatus';
import { useChatTurnStatus } from '@/hooks/useChatTurnStatus';
import { stripComposerPrefix } from '@/lib/chatAgentTurn';

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
    const webSearch = /\bsearch(?:ing)?\s+(?:the\s+)?web\b|\breading\s+(?:results|layout\s+references)\b|\blayout\s+references\b/i.test(shown);
    return (
      <div className="flex items-center gap-2.5 py-1 text-sm text-content-secondary" aria-label={shown}>
        {webSearch ? (
          <Globe className="w-3.5 h-3.5 shrink-0 text-sky-400 animate-pulse" aria-hidden />
        ) : (
          <span className="inline-flex items-center gap-1.5" aria-hidden>
            <span className="nova-status-dot nova-status-dot-1" />
            <span className="nova-status-dot nova-status-dot-2" />
            <span className="nova-status-dot nova-status-dot-3" />
          </span>
        )}
        <span className={`min-w-0 flex-1 text-xs font-medium tracking-wide break-words [overflow-wrap:anywhere] ${webSearch ? 'text-sky-300' : 'text-content-secondary'}`}>{shown}</span>
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
        a.download = `NOVA-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      } catch {
        // Fallback: still avoid .svg from base64 false-positives
        const a = document.createElement('a');
        a.href = src;
        a.download = `NOVA-${Date.now()}.${mediaDownloadExt(src, isVideo)}`;
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
  messageId,
  tone = 'assistant',
}: {
  content: string;
  live?: boolean;
  onPromptChipPick?: (prompt: string) => void;
  /** When set, live turn status is read from the status store (not message remounts). */
  messageId?: string;
  /** User bubbles stay one text tone (no label/detail color split). */
  tone?: 'user' | 'assistant';
}) {
  const turnStatus = useChatTurnStatus(messageId);
  if (tone === 'user') {
    content = stripComposerPrefix(content);
  }
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

  if (isClinicReportMessage(content)) {
    const report = parseClinicReportMessage(content);
    if (report) {
      const embedded = parseClinicStatusHistory(content);
      const liveHistory = (
        messageId
        && turnStatus
        && turnStatus.assistantId === messageId
        && Array.isArray(turnStatus.history)
      ) ? turnStatus.history : [];
      const history = (embedded && embedded.length > 1) ? embedded : liveHistory;
      const clinicHistory = history.some((step) => {
        const label = typeof step === 'string' ? step : String(step?.label || '');
        return /\b(?:debug clinic|pass [123]|static|deep|triage|clinic ready)\b/i.test(label);
      });
      return (
        <div className="space-y-3 w-full max-w-full">
          {clinicHistory && history.length > 1 && !live ? (
            <AgentProgressStatus
              label={/^done$/i.test(String(
                (embedded && embedded.length ? embedded[embedded.length - 1]?.label : turnStatus?.label) || '',
              )) ? 'Done' : 'Done'}
              history={history}
            />
          ) : null}
          <DebugClinicReport
            report={report}
            onRepair={onPromptChipPick
              ? (findingId) => {
                  const id = String(findingId || '').trim();
                  if (!id) return;
                  onPromptChipPick(`fix ${id}`);
                }
              : undefined}
            onRepairAll={onPromptChipPick
              ? () => {
                  onPromptChipPick('finish all remaining work items');
                }
              : undefined}
          />
        </div>
      );
    }
  }

  if (isPlanReportMessage(content) || (isPromptChipsMessage(content) && isPlanReportMessage(parsePromptChipsMessage(content).body))) {
    const { body, chips } = isPromptChipsMessage(content)
      ? parsePromptChipsMessage(content)
      : { body: content, chips: [] as { label: string; prompt: string }[] };
    const report = parsePlanReport(body || content);
    if (report) {
      const intro =
        String(report.intro || '').trim()
        || String(body || '')
          .split(/<!--nova-plan-report-->/i)[0]
          ?.replace(/<!--[\s\S]*?-->/g, '')
          .trim()
        || '';
      const introNorm = intro.replace(/\*\*/g, '').trim().toLowerCase();
      const sumNorm = String(report.summary || '').replace(/\*\*/g, '').trim().toLowerCase();
      const hideSummary = Boolean(intro)
        && (
          !sumNorm
          || sumNorm === introNorm
          || (sumNorm.length >= 24 && introNorm.includes(sumNorm.slice(0, 48)))
        );
      return (
        <div className="space-y-3 w-full max-w-full">
          {intro ? (
            <div className="text-[14px] text-content-primary/95 leading-relaxed">
              <ChatMarkdown text={intro} tone={tone} />
            </div>
          ) : null}
          <PlanReport report={report} hideSummary={hideSummary} />
          {onPromptChipPick && chips.length ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {chips.map((chip) => (
                <button
                  key={chip.prompt}
                  type="button"
                  className="text-[11px] rounded-full border border-white/15 bg-white/[0.04] text-content-secondary px-3 py-1.5 hover:bg-white/[0.08] hover:text-content-primary transition-colors"
                  onClick={() => onPromptChipPick(chip.prompt)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    }
  }

  if (isPromptChipsMessage(content)) {
    const { body, chips } = parsePromptChipsMessage(content);
    if (onPromptChipPick && chips.length) {
      return <PromptChipsCard body={body} chips={chips} onPick={onPromptChipPick} />;
    }
    return body ? <ChatMarkdown text={body} tone={tone} /> : null;
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
            window.dispatchEvent(new CustomEvent('NOVA:agent-continue'));
          } : undefined}
        />
      );
    }
  }

  if (isChatAttachMessage(content)) {
    const rest = stripChatAttach(content);
    if (rest && (/!\[[^\]]*\]\([^)]+\)/.test(rest) || rest.includes('nova-media:'))) {
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
    const labelFromMsg = parts.slice(2).join(':') || undefined;
    const sessionKey = `${kind}`;
    if (kind === 'chat') {
      const liveLabel = (
        messageId
        && turnStatus
        && turnStatus.assistantId === messageId
        && turnStatus.label
      ) || labelFromMsg || 'Working…';
      const liveHistory = (
        messageId
        && turnStatus
        && turnStatus.assistantId === messageId
        && turnStatus.history
      ) || [];
      // Never flash the seed "Thinking…" once real create/edit work has started.
      const lastStep = liveHistory[liveHistory.length - 1];
      const lastLabel = typeof lastStep === 'string'
        ? lastStep
        : (lastStep && typeof lastStep === 'object' && 'label' in lastStep
          ? String((lastStep as { label?: string }).label || '')
          : '');
      // Prefer the newest history step so clinic counters (5/60 · left) stay live on the top line.
      const clinicLive = /\b(?:debug clinic|pass [123]|deep ·|verify ·|triage ·|clinic ready)\b/i.test(
        `${liveLabel} ${lastLabel}`,
      );
      const label = clinicLive && lastLabel
        ? lastLabel
        : (
          /^Thinking…?$/i.test(String(liveLabel))
          && liveHistory.length > 1
            ? (lastLabel || 'Working…')
            : liveLabel
        );
      return <AgentProgressStatus label={label} history={liveHistory} />;
    }
    return <GeneratingPlaceholder kind={kind} label={labelFromMsg} sessionKey={sessionKey} />;
  }

  if (content.startsWith('__progress__:')) {
    return <GeneratingPlaceholder kind="chat" label="Working…" />;
  }

  if (!content.includes('nova-media:') && !/!\[[^\]]*\]\([^)]+\)/.test(content)) {
    let shown = usableAssistantText(content);
    // Display-time safety net: English lead-in + CJK dump must never stay visible.
    shown = scrubUnexpectedForeignScript(shown || content) || shown;
    if (!shown) {
      // Never flash canned greetings / empty usable text as the bubble body.
      if (/^Hello! How can I assist you today\??\.?$/i.test(content.trim())) {
        return <GeneratingPlaceholder kind="chat" label="Thinking…" />;
      }
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
  // Build/create turns keep an expandable step list while live. Settled plain chat
  // never shows a leftover "Done" bar — that clutter is for long builds only.
  const history = (
    messageId
    && turnStatus
    && turnStatus.assistantId === messageId
    && Array.isArray(turnStatus.history)
  ) ? turnStatus.history : [];
  const buildyHistory = history.some((step) => {
    const label = typeof step === 'string' ? step : String(step?.label || '');
    return /\b(?:build|craft|creating|writing|polish|coding|verif|scaffold|npm|design ·|copy ·|contract|folder|debug clinic|pass [123]|static ·|deep review|triage|clinic ready)\b/i.test(label)
      || /^Reading /i.test(label);
  });
  const liveGenerating = Boolean(live);
  const finishedSteps = (
    messageId
    && turnStatus
    && turnStatus.assistantId === messageId
    && buildyHistory
    && history.length > 1
    && !liveGenerating
    && !/^\(stopped\)$/i.test(String(content || '').trim())
  ) ? {
    ...turnStatus,
    label: /^done$/i.test(String(turnStatus.label || '')) ? turnStatus.label : 'Done',
  } : null;

  return (
    <div className={onlyMedia ? 'space-y-2' : 'space-y-3'}>
      {finishedSteps ? (
        <AgentProgressStatus
          label={finishedSteps.label || 'Build steps'}
          history={finishedSteps.history}
        />
      ) : null}
      {chunks.map((chunk, i) => {
        if (chunk.type === 'media') {
          const src = chunk.value;
          const alt = chunk.alt || 'NOVA generation';
          if (
            src.startsWith('data:image/')
            || src.startsWith('data:video/')
            || src.startsWith('http://')
            || src.startsWith('https://')
          ) {
            return <ResolvedMedia key={i} src={src} alt={alt} preview={previewHint} />;
          }
          if (src.startsWith('nova-media:')) {
            const id = src.slice('nova-media:'.length);
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
        return <ChatMarkdown key={i} text={text} tone={tone} />;
      })}
    </div>
  );
}
