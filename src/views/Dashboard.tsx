import { useEffect, useMemo, useState } from 'react';
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
  const { chats, deleteChatForever, deleteChatsForeverBulk } = useRecentProjects();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);

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
        const chatId = item.chatId;
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        // Yield a frame so confirm dismisses before any wipe work (composer stay usable).
        window.setTimeout(() => {
          deleteChatForever(chatId);
          navigate({ name: 'chat' });
        }, 0);
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

  const selectedCount = selectedIds.size;
  const allFilteredSelected = filtered.length > 0 && filtered.every(item => selectedIds.has(item.id));
  const someFilteredSelected = filtered.some(item => selectedIds.has(item.id));

  useEffect(() => {
    if (selectedCount === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIds(new Set());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCount]);

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const item of filtered) next.delete(item.id);
      } else {
        for (const item of filtered) next.add(item.id);
      }
      return next;
    });
  };

  const handleBulkDelete = () => {
    const toDelete = filtered.filter(item => selectedIds.has(item.id) && item.chatId);
    if (!toDelete.length) return;
    const n = toDelete.length;
    if (!window.confirm(
      `Delete ${n} chat${n === 1 ? '' : 's'} forever from Recent and History?`,
    )) {
      return;
    }
    const chatIds = toDelete.map((item) => item.chatId!).filter(Boolean);
    // Single-pass wipe — avoids multi-second main-thread freeze that locks the composer.
    deleteChatsForeverBulk(chatIds);
    clearSelection();
    setNotice(`Deleted ${n} chat${n === 1 ? '' : 's'}.`);
    window.setTimeout(() => setNotice(null), 3000);
    // Return to a fresh chat so the composer is immediately usable for the next test.
    navigate({ name: 'chat' });
  };

  return (
    <div className="h-full min-w-0 flex flex-col overflow-hidden animate-fade-in bg-transparent">
      <div className="shrink-0 px-4 sm:px-6 pt-[min(12vh,6rem)] bg-transparent">
        <div className="w-full max-w-4xl mx-auto min-w-0">
          {notice && (
            <p className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
              {notice}
            </p>
          )}
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
                className="nova-input text-xs py-1.5 w-auto"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </div>

          {filtered.length > 0 && (
            <div className="flex flex-col gap-2 mb-1">
              {selectedCount > 0 && (
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs text-content-secondary">{selectedCount} selected</span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="h-7 rounded-full px-2.5 text-xs font-medium text-content-secondary hover:text-content-primary hover:bg-surface-hover"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="h-7 rounded-full px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete ({selectedCount})
                  </button>
                </div>
              )}
              <div className="grid grid-cols-[1fr_6.5rem_5rem_2rem] gap-2 px-1 pb-2 text-xs text-content-tertiary">
                <span className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={toggleSelectAllFiltered}
                    title="Select all"
                    aria-label="Select all"
                    aria-pressed={allFilteredSelected}
                    className="inline-flex items-center gap-2 shrink-0 cursor-pointer select-none text-xs text-content-tertiary hover:text-content-secondary"
                  >
                    <span
                      className={`w-4 h-4 rounded-full border transition-colors ${
                        allFilteredSelected
                          ? 'border-sky-400 bg-sky-400'
                          : someFilteredSelected
                            ? 'border-sky-400/80 bg-sky-400/35'
                            : 'border-content-tertiary/50 bg-transparent'
                      }`}
                      aria-hidden
                    />
                    <span>Select all</span>
                  </button>
                </span>
                <span className="text-right">When</span>
                <span className="text-right">Where</span>
                <span />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-10">
        <div className="w-full max-w-4xl mx-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileText className="w-10 h-10 text-content-tertiary mb-3" strokeWidth={1.5} />
              <p className="text-base font-semibold text-content-primary mb-1">Nothing in History yet</p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                <button type="button" className="nova-btn-secondary text-xs" onClick={() => navigate({ name: 'chat' })}>
                  New chat
                </button>
                <button type="button" className="nova-btn-secondary text-xs" onClick={() => navigate({ name: 'projects' })}>
                  Open Projects
                </button>
              </div>
            </div>
          ) : view === 'list' ? (
            <div className="flex flex-col">
              {filtered.map(item => {
                const selected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="group w-full grid grid-cols-[1fr_6.5rem_5rem_2rem] gap-2 items-center px-1 py-3 text-left rounded-xl transition-colors hover:bg-surface-hover/70"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleSelect(item.id)}
                        title={selected ? 'Deselect' : 'Select'}
                        aria-label={selected ? `Deselect ${item.name}` : `Select ${item.name}`}
                        aria-pressed={selected}
                        className="shrink-0 p-0.5"
                      >
                        <span
                          className={`block w-4 h-4 rounded-full border transition-colors shadow-none ${
                            selected
                              ? 'border-sky-400 bg-sky-400'
                              : 'border-content-tertiary/50 bg-transparent'
                          }`}
                          aria-hidden
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => openHistoryItem(item)}
                        className="flex items-center gap-3 min-w-0 text-left flex-1"
                      >
                        <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center shrink-0 overflow-hidden">
                          <MessageSquare className="w-4 h-4 text-white/90" strokeWidth={1.75} />
                        </span>
                        <span className="text-sm font-medium text-content-primary truncate">{item.name}</span>
                      </button>
                    </div>
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
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map(item => {
                const selected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="group relative text-left rounded-2xl overflow-hidden border border-surface-border/60 bg-surface-hover/40 hover:bg-surface-hover transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelect(item.id)}
                      className="absolute top-2 left-2 z-10 w-5 h-5 rounded-full border border-white/30 bg-black/40 flex items-center justify-center"
                      aria-label={selected ? `Deselect ${item.name}` : `Select ${item.name}`}
                      aria-pressed={selected}
                    >
                      <span
                        className={`block w-2.5 h-2.5 rounded-full ${selected ? 'bg-sky-400' : 'bg-transparent'}`}
                        aria-hidden
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => openHistoryItem(item)}
                      className="w-full text-left p-3 pt-8"
                    >
                      <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center mb-2">
                        <MessageSquare className="w-4 h-4 text-white/90" strokeWidth={1.75} />
                      </span>
                      <span className="block text-sm font-medium text-content-primary truncate">{item.name}</span>
                      <span className="block text-xs text-content-tertiary mt-0.5">{item.modifiedLabel}</span>
                    </button>
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
