import { useMemo, useState } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import {
  Search, FileText, LayoutGrid, List,
  MessageSquare, Trash2,
} from 'lucide-react';

type TabId = 'all' | 'chats';
type ViewMode = 'list' | 'grid';

type HistoryItem = {
  id: string;
  name: string;
  sortAt: string;
  modifiedLabel: string;
  sizeLabel: string;
  chatId?: string;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'chats', label: 'Chats' },
];

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
  const { chats, deleteChatForever } = useRecentProjects();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  const historyItems = useMemo(() => {
    // History = full chat list (same source as Recent). Recent is only a top-4 shortcut.
    return chats
      .filter(c => c.mode !== 'image' && c.mode !== 'video')
      .map(c => ({
        id: `chat-${c.id}`,
        name: c.title || 'Chat',
        sortAt: c.updatedAt || c.archivedAt || '',
        modifiedLabel: formatWhen(c.updatedAt || c.archivedAt || ''),
        sizeLabel: c.archivedAt ? 'Older' : 'Recent',
        chatId: c.id,
      }))
      .sort((a, b) => (b.sortAt || '').localeCompare(a.sortAt || ''));
  }, [chats]);

  const openHistoryItem = (item: HistoryItem) => {
    if (item.chatId) {
      navigate({ name: 'chat', chatId: item.chatId });
      return;
    }
    navigate({ name: 'chat' });
  };

  const deleteItem = (item: HistoryItem) => {
    if (item.chatId) {
      if (window.confirm('Delete this forever? It will leave Recent and History.')) {
        deleteChatForever(item.chatId);
      }
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = historyItems.filter(item => {
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'oldest') return [...list].sort((a, b) => (a.sortAt || '').localeCompare(b.sortAt || ''));
    return [...list].sort((a, b) => (b.sortAt || '').localeCompare(a.sortAt || ''));
  }, [historyItems, query, sort]);

  return (
    <div className="h-full min-w-0 flex flex-col overflow-hidden animate-fade-in bg-transparent">
      <div className="shrink-0 px-4 sm:px-6 pt-[min(12vh,6rem)] bg-transparent">
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

          <div className="flex items-center justify-between gap-3 mb-4 min-w-0">
            <div className="flex items-center gap-1 overflow-x-auto min-w-0">
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors ${
                    tab === t.id
                      ? 'bg-surface-hover text-content-primary'
                      : 'text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setView('list')}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  view === 'list' ? 'bg-surface-hover text-content-primary' : 'text-content-tertiary'
                }`}
                aria-label="List"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('grid')}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  view === 'grid' ? 'bg-surface-hover text-content-primary' : 'text-content-tertiary'
                }`}
                aria-label="Grid"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as typeof sort)}
                className="ark-input text-xs py-1.5 w-auto"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-10">
        <div className="w-full max-w-4xl mx-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileText className="w-10 h-10 text-content-tertiary mb-3" strokeWidth={1.5} />
              <p className="text-base font-semibold text-content-primary mb-1">Nothing in History yet</p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                <button type="button" className="ark-btn-secondary text-xs" onClick={() => navigate({ name: 'chat' })}>
                  New chat
                </button>
                <button type="button" className="ark-btn-secondary text-xs" onClick={() => navigate({ name: 'projects' })}>
                  Open Projects
                </button>
              </div>
            </div>
          ) : view === 'list' ? (
            <div className="flex flex-col">
              {filtered.map(item => (
                <div
                  key={item.id}
                  className="group w-full grid grid-cols-[1fr_6.5rem_5rem_2rem] gap-2 items-center px-1 py-3 text-left rounded-xl hover:bg-surface-hover/70 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => openHistoryItem(item)}
                    className="flex items-center gap-3 min-w-0 text-left"
                  >
                    <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center shrink-0 overflow-hidden">
                      <MessageSquare className="w-4 h-4 text-white/90" strokeWidth={1.75} />
                    </span>
                    <span className="text-sm font-medium text-content-primary truncate">{item.name}</span>
                  </button>
                  <span className="text-right text-sm text-content-secondary">{item.modifiedLabel}</span>
                  <span className="text-right text-sm text-content-secondary tabular-nums">{item.sizeLabel}</span>
                  {item.chatId ? (
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-rose-400 hover:bg-rose-500/10 transition-opacity"
                      title="Delete forever"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteItem(item);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openHistoryItem(item)}
                  className="group relative text-left rounded-2xl overflow-hidden border border-surface-border/60 bg-surface-hover/40 hover:bg-surface-hover transition-colors"
                >
                  <div className="aspect-[4/3] bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center">
                    <MessageSquare className="w-8 h-8 text-white/70" strokeWidth={1.5} />
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-content-primary truncate">{item.name}</p>
                    <p className="text-[10px] text-content-tertiary mt-0.5">{item.modifiedLabel}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
