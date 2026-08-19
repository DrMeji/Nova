import { useMemo, useState } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { getMemoryThumb } from '@/lib/recentStore';
import {
  Search, ImageIcon, FileText, LayoutGrid, List,
  Video, MessageSquare, Trash2,
} from 'lucide-react';

type HistoryKind = 'image' | 'video' | 'chat';
type TabId = 'all' | 'images' | 'videos' | 'chats';
type ViewMode = 'list' | 'grid';

type HistoryItem = {
  id: string;
  name: string;
  kind: HistoryKind;
  source: 'generated';
  sortAt: string;
  modifiedLabel: string;
  sizeLabel: string;
  tone: string;
  chatId?: string;
  mode?: 'general' | 'image' | 'video' | 'code';
  creationId?: string;
  thumb?: string;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'images', label: 'Images' },
  { id: 'videos', label: 'Videos' },
  { id: 'chats', label: 'Chats' },
];

function kindIcon(kind: HistoryKind) {
  switch (kind) {
    case 'image': return ImageIcon;
    case 'video': return Video;
    default: return MessageSquare;
  }
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return 'Today';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

export function Dashboard() {
  const { navigate } = useRouter();
  const { creations, chats, deleteCreationForever, deleteChatForever } = useRecentProjects();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'type'>('newest');

  const historyItems = useMemo(() => {
    const fromCreations: HistoryItem[] = creations.map(c => ({
      id: `creation-${c.id}`,
      name: c.title || c.prompt || 'Creation',
      kind: c.kind === 'video' ? 'video' : 'image',
      source: 'generated' as const,
      sortAt: c.createdAt || '',
      modifiedLabel: formatWhen(c.createdAt),
      sizeLabel: (c.source || '').includes('motion-still')
        ? 'Motion still'
        : c.real
          ? 'Generated'
          : 'Preview',
      tone: c.kind === 'video' ? 'from-violet-900/70 to-indigo-950' : 'from-sky-900/80 to-blue-950',
      creationId: c.id,
      mode: c.kind === 'video' ? 'video' : 'image',
      thumb: c.dataUrl || getMemoryThumb(c.id),
    }));

    const fromChats: HistoryItem[] = chats
      .filter(c => !c.creationId || !creations.some(x => x.id === c.creationId))
      .map(c => ({
        id: `chat-${c.id}`,
        name: c.title,
        kind: c.mode === 'image' ? 'image' : c.mode === 'video' ? 'video' : 'chat',
        source: 'generated' as const,
        sortAt: c.updatedAt || '',
        modifiedLabel: formatWhen(c.updatedAt),
        sizeLabel: c.archivedAt
          ? 'Archived'
          : c.mode === 'image'
            ? 'Image'
            : c.mode === 'video'
              ? 'Video'
              : 'Chat',
        tone:
          c.mode === 'video'
            ? 'from-violet-900/70 to-indigo-950'
            : c.mode === 'image'
              ? 'from-sky-900/80 to-blue-950'
              : 'from-zinc-800 to-zinc-950',
        chatId: c.id,
        mode: c.mode,
        creationId: c.creationId,
      }));

    return [...fromChats, ...fromCreations].sort((a, b) => (b.sortAt || '').localeCompare(a.sortAt || ''));
  }, [creations, chats]);

  const openHistoryItem = (item: HistoryItem) => {
    if (item.chatId) {
      navigate({
        name: 'chat',
        mode: item.mode === 'general' ? undefined : item.mode,
        chatId: item.chatId,
      });
      return;
    }
    if (item.creationId) {
      navigate({ name: 'creation', id: item.creationId });
      return;
    }
    navigate({ name: 'chat' });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = historyItems.filter(item => {
      if (tab === 'images' && item.kind !== 'image') return false;
      if (tab === 'videos' && item.kind !== 'video') return false;
      if (tab === 'chats' && item.kind !== 'chat') return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'oldest') return [...list].sort((a, b) => (a.sortAt || '').localeCompare(b.sortAt || ''));
    if (sort === 'type') return [...list].sort((a, b) => a.kind.localeCompare(b.kind) || (b.sortAt || '').localeCompare(a.sortAt || ''));
    return [...list].sort((a, b) => (b.sortAt || '').localeCompare(a.sortAt || ''));
  }, [historyItems, query, tab, sort]);

  return (
    <div className="h-full min-w-0 flex flex-col overflow-hidden animate-fade-in bg-ark-navy-950">
      <div className="shrink-0 px-4 sm:px-6 pt-[min(12vh,6rem)] bg-ark-navy-950">
        <div className="w-full max-w-4xl mx-auto min-w-0">
          <div className="flex items-center justify-between gap-3 mb-5 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight truncate">History</h1>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 rounded-full bg-surface-hover px-3 py-2 w-32 sm:w-48 md:w-56 min-w-0">
                <Search className="w-4 h-4 text-content-tertiary shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search"
                  className="flex-1 bg-transparent border-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none min-w-0"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                    tab === t.id
                      ? 'bg-surface-hover text-content-primary'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as 'newest' | 'oldest' | 'type')}
              className="bg-transparent border border-surface-border rounded-full px-2 py-1 text-[11px] text-content-secondary"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="type">Type</option>
            </select>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setView('grid')}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  view === 'grid' ? 'bg-surface-hover text-content-primary' : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                }`}
                title="Grid"
                aria-label="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  view === 'list' ? 'bg-surface-hover text-content-primary' : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                }`}
                title="List"
                aria-label="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {view === 'list' && filtered.length > 0 && (
            <div className="grid grid-cols-[1fr_6.5rem_5rem_2rem] gap-2 px-1 pb-2 text-xs text-content-tertiary">
              <span>Name</span>
              <span className="text-right">Modified</span>
              <span className="text-right">Type</span>
              <span />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-10">
        <div className="w-full max-w-4xl mx-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-11 h-11 rounded-xl bg-surface-hover flex items-center justify-center mb-4">
                <FileText className="w-5 h-5 text-content-secondary" />
              </div>
              <p className="text-base font-semibold text-content-primary mb-1">Nothing here yet</p>
              <p className="text-sm text-content-tertiary mb-5 max-w-sm">
                Chats, images, and videos you create will show up here — reopen anything from one place.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button type="button" className="ark-btn-secondary text-xs" onClick={() => navigate({ name: 'chat' })}>
                  New chat
                </button>
                <button type="button" className="ark-btn-secondary text-xs" onClick={() => navigate({ name: 'chat', mode: 'image' })}>
                  Create image
                </button>
                <button type="button" className="ark-btn-secondary text-xs" onClick={() => navigate({ name: 'code' })}>
                  Open Code
                </button>
              </div>
            </div>
          ) : view === 'list' ? (
            <div className="flex flex-col">
              {filtered.map(item => {
                const Icon = kindIcon(item.kind);
                return (
                  <div
                    key={item.id}
                    className="group w-full grid grid-cols-[1fr_6.5rem_5rem_2rem] gap-2 items-center px-1 py-3 text-left rounded-xl hover:bg-surface-hover/70 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => openHistoryItem(item)}
                      className="flex items-center gap-3 min-w-0 text-left"
                    >
                      <span className={`w-9 h-9 rounded-lg bg-gradient-to-br ${item.tone} flex items-center justify-center shrink-0`}>
                        <Icon className="w-4 h-4 text-white/90" strokeWidth={1.75} />
                      </span>
                      <span className="text-sm font-medium text-content-primary truncate">{item.name}</span>
                    </button>
                    <span className="text-right text-sm text-content-secondary">{item.modifiedLabel}</span>
                    <span className="text-right text-sm text-content-secondary tabular-nums">{item.sizeLabel}</span>
                    {item.creationId || item.chatId ? (
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-rose-400 hover:bg-rose-500/10 transition-opacity"
                        title="Delete forever"
                        aria-label="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.creationId) {
                            if (window.confirm('Delete this creation forever?')) {
                              deleteCreationForever(item.creationId);
                            }
                          } else if (item.chatId && window.confirm('Delete this chat forever?')) {
                            deleteChatForever(item.chatId);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              {filtered.map(item => {
                const Icon = kindIcon(item.kind);
                return (
                  <div key={item.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => openHistoryItem(item)}
                      className="w-full aspect-[4/3] rounded-2xl border border-surface-border overflow-hidden text-left hover:brightness-110 transition-all relative bg-ark-navy-900"
                    >
                      {item.thumb ? (
                        item.kind === 'video' ? (
                          <video src={item.thumb} className="absolute inset-0 w-full h-full object-cover" muted />
                        ) : (
                          <img src={item.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        )
                      ) : (
                        <span className={`absolute inset-0 bg-gradient-to-br ${item.tone}`} />
                      )}
                      <span className="relative z-10 flex flex-col h-full p-3 bg-gradient-to-t from-black/70 via-black/20 to-transparent">
                        <span className="text-xs font-medium text-white/95 truncate">{item.name}</span>
                        <span className="flex-1" />
                        <span className="text-[11px] text-white/80">{item.sizeLabel} · {item.modifiedLabel}</span>
                      </span>
                    </button>
                    {item.creationId ? (
                      <button
                        type="button"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg flex items-center justify-center bg-black/40 text-white/90 hover:bg-rose-500/80 transition-opacity"
                        title="Delete forever"
                        aria-label="Delete creation"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('Delete this creation forever?')) {
                            deleteCreationForever(item.creationId!);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
