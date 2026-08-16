import { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import {
  Search, Plus, ImageIcon, FileText, LayoutGrid, List,
  Filter, Upload, File, Eye, Folder, Video, MessageSquare, Trash2,
} from 'lucide-react';

type HistoryKind = 'image' | 'video' | 'chat' | 'document' | 'other';
type HistorySource = 'uploaded' | 'generated';
type TabId = 'all' | 'images' | 'documents';
type ViewMode = 'list' | 'grid';

type HistoryItem = {
  id: string;
  name: string;
  kind: HistoryKind;
  source: HistorySource;
  modifiedLabel: string;
  sizeLabel: string;
  tone: string;
  chatId?: string;
  mode?: 'general' | 'image' | 'video' | 'code';
  creationId?: string;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'images', label: 'Images' },
  { id: 'documents', label: 'Documents' },
];

const ADD_OPTIONS = [
  { id: 'note', label: 'Note', icon: FileText },
  { id: 'document', label: 'Document', icon: File },
  { id: 'folder', label: 'Folder', icon: Folder },
  { id: 'upload', label: 'Upload files', icon: Upload },
];

function kindIcon(kind: HistoryKind) {
  switch (kind) {
    case 'image': return ImageIcon;
    case 'video': return Video;
    case 'chat': return MessageSquare;
    case 'document': return FileText;
    default: return File;
  }
}

function isDocumentLike(kind: HistoryKind) {
  return kind === 'document' || kind === 'other';
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
  const { creations, chats, deleteCreationForever } = useRecentProjects();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [addOpen, setAddOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'all' | HistorySource>('all');
  const addRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const historyItems = useMemo(() => {
    const fromCreations: HistoryItem[] = creations.map(c => ({
      id: `creation-${c.id}`,
      name: c.title || c.prompt || 'Creation',
      kind: c.kind === 'video' ? 'video' : 'image',
      source: 'generated' as const,
      modifiedLabel: formatWhen(c.createdAt),
      sizeLabel: c.real ? 'Generated' : 'Preview',
      tone: c.kind === 'video' ? 'from-violet-900/70 to-indigo-950' : 'from-sky-900/80 to-blue-950',
      creationId: c.id,
      mode: c.kind === 'video' ? 'video' : 'image',
    }));

    const fromChats: HistoryItem[] = chats
      .filter(c => !c.creationId || !creations.some(x => x.id === c.creationId))
      .map(c => ({
        id: `chat-${c.id}`,
        name: c.title,
        kind: c.mode === 'image' ? 'image' : c.mode === 'video' ? 'video' : 'chat',
        source: 'generated' as const,
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

    return [...fromChats, ...fromCreations].sort((a, b) => {
      // Rough: Today first already via labels; keep chats list order from context
      return 0;
    });
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
      navigate({
        name: 'chat',
        mode: item.kind === 'video' ? 'video' : 'image',
        creationId: item.creationId,
      });
      return;
    }
    navigate({ name: 'chat' });
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (addRef.current && !addRef.current.contains(target)) setAddOpen(false);
      if (filterRef.current && !filterRef.current.contains(target)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return historyItems.filter(item => {
      if (tab === 'images' && item.kind !== 'image' && item.kind !== 'video') return false;
      if (tab === 'documents' && !isDocumentLike(item.kind)) return false;
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [historyItems, query, tab, sourceFilter]);

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fade-in bg-ark-navy-950">
      <div className="shrink-0 px-6 pt-[min(12vh,6rem)] bg-ark-navy-950">
        <div className="w-full max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h1 className="text-3xl font-semibold text-content-primary tracking-tight">History</h1>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 rounded-full bg-surface-hover px-3.5 py-2 w-48 sm:w-56">
                <Search className="w-4 h-4 text-content-tertiary shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search"
                  className="flex-1 bg-transparent border-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none min-w-0"
                />
              </div>

              <div className="relative" ref={addRef}>
                <button
                  type="button"
                  onClick={() => { setAddOpen(o => !o); setFilterOpen(false); }}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgb(var(--color-accent))', color: 'rgb(var(--color-accent-fg))' }}
                  title="Add"
                  aria-label="Add"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                </button>
                {addOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-surface-border bg-ark-navy-900 shadow-2xl py-1.5 z-20 animate-fade-in">
                    {ADD_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAddOpen(false)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-content-primary hover:bg-surface-hover text-left"
                      >
                        <opt.icon className="w-4 h-4 text-content-secondary" />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
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

            <div className="flex items-center gap-1">
              <div className="relative" ref={filterRef}>
                <button
                  type="button"
                  onClick={() => { setFilterOpen(o => !o); setAddOpen(false); }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    filterOpen || sourceFilter !== 'all'
                      ? 'bg-surface-hover text-content-primary'
                      : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                  }`}
                  title="Filter"
                  aria-label="Filter"
                >
                  <Filter className="w-4 h-4" />
                </button>
                {filterOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-xl border border-surface-border bg-ark-navy-900 shadow-2xl py-2 z-20 animate-fade-in">
                    <p className="px-3 pb-1 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">Source</p>
                    {([
                      { id: 'all' as const, label: 'All sources' },
                      { id: 'uploaded' as const, label: 'Uploaded' },
                      { id: 'generated' as const, label: 'Generated' },
                    ]).map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => { setSourceFilter(opt.id); setFilterOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-hover ${
                          sourceFilter === opt.id ? 'text-content-primary' : 'text-content-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

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

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10">
        <div className="w-full max-w-4xl mx-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-11 h-11 rounded-xl bg-surface-hover flex items-center justify-center mb-4">
                <FileText className="w-5 h-5 text-content-secondary" />
              </div>
              <p className="text-base font-semibold text-content-primary mb-1">Nothing here yet</p>
              <p className="text-sm text-content-tertiary">
                Chats, images, and videos you create will show up here.
              </p>
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
                    {item.creationId ? (
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-rose-400 hover:bg-rose-500/10 transition-opacity"
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
                      className={`w-full aspect-[4/3] rounded-2xl bg-gradient-to-br ${item.tone} border border-surface-border p-3 flex flex-col text-left hover:brightness-110 transition-all`}
                    >
                      <span className="text-xs font-medium text-white/95 truncate">{item.name}</span>
                      <span className="flex-1 flex items-center justify-center">
                        <Icon className="w-8 h-8 text-white/80" strokeWidth={1.5} />
                      </span>
                      <span className="text-[11px] text-white/70">{item.modifiedLabel}</span>
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
