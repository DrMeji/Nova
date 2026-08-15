import { useEffect, useState } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { resolveCreationDataUrl } from '@/lib/recentStore';
import { ArrowLeft, Download, ImageIcon, Loader2, MessageSquare, Video } from 'lucide-react';

export function CreationViewer() {
  const { route, navigate } = useRouter();
  const { creations } = useRecentProjects();
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

  // Prefer the continuable chat thread over a dead-end viewer.
  useEffect(() => {
    if (!creation) return;
    navigate({
      name: 'chat',
      mode: creation.kind === 'video' ? 'video' : 'image',
      creationId: creation.id,
    });
  }, [creation, navigate]);

  if (!creation) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-content-secondary p-8">
        <p>Creation not found.</p>
        <button
          type="button"
          onClick={() => navigate({ name: 'chat', mode: 'image' })}
          className="text-sm text-ark-blue-400 hover:underline"
        >
          Back to Image
        </button>
      </div>
    );
  }

  const Icon = creation.kind === 'video' ? Video : ImageIcon;
  const editMode = creation.kind === 'video' ? 'video' : 'image';

  const continueInChat = () => {
    navigate({ name: 'chat', mode: editMode, creationId: creation.id });
  };

  const onDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${creation.title.slice(0, 40).replace(/\s+/g, '-')}.jpg`;
    a.click();
  };

  return (
    <div className="h-full flex flex-col bg-ark-navy-950">
      <header className="flex-none flex items-center gap-3 px-5 py-3 border-b border-surface-border">
        <button
          type="button"
          onClick={() => navigate({ name: 'chat', mode: editMode })}
          className="w-8 h-8 rounded-lg border border-surface-border flex items-center justify-center text-content-secondary hover:bg-surface-hover"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Icon className="w-4 h-4 text-content-tertiary" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-medium text-content-primary truncate">{creation.title}</h1>
          <p className="text-[11px] text-content-tertiary truncate">{creation.modelName}</p>
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
          onClick={continueInChat}
          className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-hover hover:text-content-primary"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Continue
        </button>
      </header>

      <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-4">
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-content-tertiary mt-20" />
        ) : dataUrl ? (
          <img
            src={dataUrl}
            alt={creation.title}
            className="max-w-full max-h-[70vh] rounded-2xl bg-ark-navy-900 object-contain"
          />
        ) : (
          <p className="text-sm text-content-tertiary mt-20">Couldn’t load this creation.</p>
        )}
      </div>
    </div>
  );
}
