import { useEffect, useState } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { resolveCreationDataUrl } from '@/lib/recentStore';
import { ArrowLeft, Copy, Download, ImageIcon, Loader2, MessageSquare, Video } from 'lucide-react';

export function CreationViewer() {
  const { route, navigate } = useRouter();
  const { creations, chats } = useRecentProjects();
  const id = route.name === 'creation' ? route.id : '';
  const creation = creations.find(c => c.id === id);
  const [dataUrl, setDataUrl] = useState<string | null>(creation?.dataUrl ?? null);
  const [loading, setLoading] = useState(!creation?.dataUrl);

  useEffect(() => {
    if (!creation) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const url = await resolveCreationDataUrl(creation);
      if (!cancelled) {
        setDataUrl(url);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creation]);

  // Prefer showing the media. Continue still jumps to the matching chat tab.
  if (!creation) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-content-secondary p-8">
        <p>Creation not found.</p>
        <button
          type="button"
          onClick={() => navigate({ name: 'dashboard' })}
          className="text-sm text-ark-blue-400 hover:underline"
        >
          Back to History
        </button>
      </div>
    );
  }

  const Icon = creation.kind === 'video' ? Video : ImageIcon;

  const continueInChat = () => {
    const thread = chats.find(c => c.creationId === creation.id);
    // Image / Video modes are retired — open plain Chat.
    navigate({
      name: 'chat',
      chatId: thread?.id,
      creationId: creation.id,
    });
  };

  const honesty = (creation.source || '').includes('motion-still')
    ? 'Motion still'
    : creation.real
      ? 'Generated'
      : 'Preview';
  const isPreview = !creation.real
    || (creation.source || '').includes('motion-still')
    || Boolean(dataUrl?.startsWith('data:image/svg'));

  const onDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    const ext = dataUrl.startsWith('data:video/')
      ? 'mp4'
      : dataUrl.includes('svg')
        ? 'svg'
        : dataUrl.includes('png')
          ? 'png'
          : 'jpg';
    a.download = `${creation.title.slice(0, 40).replace(/\s+/g, '-')}.${ext}`;
    a.click();
  };

  return (
    <div className="h-full flex flex-col bg-transparent">
      <header className="flex-none flex items-center gap-3 px-5 py-3 border-b border-surface-border">
        <button
          type="button"
          onClick={() => navigate({ name: 'dashboard' })}
          className="w-8 h-8 rounded-lg border border-surface-border flex items-center justify-center text-content-secondary hover:bg-surface-hover"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Icon className="w-4 h-4 text-content-tertiary" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-medium text-content-primary truncate">{creation.title}</h1>
          <p className="text-[11px] text-content-tertiary truncate">
            {creation.modelName} · {honesty}
            {creation.prompt ? ` · ${creation.prompt}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={!dataUrl}
          className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-hover hover:text-content-primary disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
        <button
          type="button"
          onClick={async () => {
            const text = creation.prompt?.trim();
            if (!text) return;
            try {
              await navigator.clipboard.writeText(text);
            } catch {
              /* ignore */
            }
          }}
          disabled={!creation.prompt?.trim()}
          className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-hover hover:text-content-primary disabled:opacity-40"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy prompt
        </button>
        <button
          type="button"
          onClick={continueInChat}
          className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-hover hover:text-content-primary"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Continue
        </button>
      </header>

      <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-4">
        {isPreview ? (
          <div className="w-full max-w-3xl rounded-xl border border-amber-400/35 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
            <span className="font-semibold">Preview only</span>
            {'. '}
            {honesty === 'Motion still'
              ? 'This is a still preview, not a generated video.'
              : 'This fallback is not a finished generated image or video.'}
          </div>
        ) : null}
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-content-tertiary mt-20" />
        ) : dataUrl ? (
          creation.kind === 'video' && (dataUrl.startsWith('data:video/') || dataUrl.includes('video')) ? (
            <video
              src={dataUrl}
              controls
              autoPlay
              loop
              className="max-w-full max-h-[70vh] rounded-2xl bg-ark-navy-900"
            />
          ) : (
            <img
              src={dataUrl}
              alt={creation.title}
              className="max-w-full max-h-[70vh] rounded-2xl bg-ark-navy-900 object-contain"
            />
          )
        ) : (
          <p className="text-sm text-content-tertiary mt-20">Couldn’t load this creation.</p>
        )}
      </div>
    </div>
  );
}
