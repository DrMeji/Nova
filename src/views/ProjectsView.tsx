import { useMemo, useState, useEffect } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { fetchProjects, createProject } from '@/lib/api';
import type { Project } from '@/types';
import { Search, Folder, Loader2, Plus, MessageSquare, ImageIcon, Code2 } from 'lucide-react';

type TabId = 'all' | 'mine' | 'shared';

type ListItem = {
  id: string;
  name: string;
  modified: Date;
  owned: boolean;
  shared: boolean;
};

type ProjectRow = Project & { id: string };

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Created by you' },
  { id: 'shared', label: 'Shared with you' },
];

function formatModified(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProjectsView() {
  const { navigate } = useRouter();
  const { recent, addRecent } = useRecentProjects();
  const [remote, setRemote] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchProjects()
      .then(data => setRemote(data as ProjectRow[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const items = useMemo<ListItem[]>(() => {
    const fromRemote: ListItem[] = remote.map(p => ({
      id: p.id,
      name: p.name,
      modified: new Date(p.updated_at),
      owned: true,
      shared: false,
    }));

    const remoteIds = new Set(fromRemote.map(p => p.id));
    const fromRecent: ListItem[] = recent
      .filter(p => !remoteIds.has(p.id))
      .map((p, index) => ({
        id: p.id,
        name: p.name,
        modified: new Date(Date.now() - index * 86_400_000),
        owned: true,
        shared: false,
      }));

    return [...fromRemote, ...fromRecent].sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }, [remote, recent]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      if (tab === 'mine' && !item.owned) return false;
      if (tab === 'shared' && !item.shared) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, tab]);

  const handleCreate = async () => {
    const name = newName.trim() || 'Untitled';
    setCreating(true);
    try {
      const project = await createProject(name, '', 'web') as ProjectRow;
      setShowCreate(false);
      setNewName('');
      navigate({ name: 'project', id: project.id });
    } catch {
      const local = addRecent(name);
      setShowCreate(false);
      setNewName('');
      setCreating(false);
      navigate({ name: 'project', id: local.id });
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fade-in bg-ark-navy-950">
      <div className="shrink-0 px-6 pt-[min(12vh,6rem)] bg-ark-navy-950">
        <div className="w-full max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h1 className="text-3xl font-semibold text-content-primary tracking-tight">Projects</h1>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 rounded-full bg-surface-hover px-3.5 py-2 w-52 sm:w-60">
                <Search className="w-4 h-4 text-content-tertiary shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search projects"
                  className="flex-1 bg-transparent border-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none min-w-0"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                title="Add project"
                aria-label="Add project"
                className="w-9 h-9 rounded-full flex items-center justify-center hover:opacity-90 transition-opacity"
                style={{ backgroundColor: 'rgb(var(--color-accent))', color: 'rgb(var(--color-accent-fg))' }}
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 mb-4">
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

          <div className="mb-5 rounded-2xl border border-surface-border bg-ark-navy-900/40 px-4 py-3.5">
            <p className="text-sm font-medium text-content-primary mb-1">Create your first thing</p>
            <p className="text-xs text-content-tertiary mb-3">Pick a path. You can always open a blank project too.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => navigate({ name: 'chat' })}
                className="text-left rounded-xl border border-surface-border hover:bg-surface-hover/80 px-3 py-2.5 transition-colors"
              >
                <MessageSquare className="w-4 h-4 text-content-secondary mb-1.5" />
                <span className="block text-sm text-content-primary">Chat app idea</span>
                <span className="block text-[11px] text-content-tertiary mt-0.5">Start in New Chat</span>
              </button>
              <button
                type="button"
                onClick={() => navigate({ name: 'chat', mode: 'image' })}
                className="text-left rounded-xl border border-surface-border hover:bg-surface-hover/80 px-3 py-2.5 transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-content-secondary mb-1.5" />
                <span className="block text-sm text-content-primary">Image set</span>
                <span className="block text-[11px] text-content-tertiary mt-0.5">Jump into Image mode</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const project = addRecent('First Code Project');
                  navigate({ name: 'project', id: project.id });
                }}
                className="text-left rounded-xl border border-surface-border hover:bg-surface-hover/80 px-3 py-2.5 transition-colors"
              >
                <Code2 className="w-4 h-4 text-content-secondary mb-1.5" />
                <span className="block text-sm text-content-primary">Code project</span>
                <span className="block text-[11px] text-content-tertiary mt-0.5">Open the build workspace</span>
              </button>
            </div>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-[1fr_7.5rem] gap-4 px-1 pb-2 text-xs text-content-tertiary">
              <span>Name</span>
              <span className="text-right">Modified</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10">
        <div className="w-full max-w-3xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-content-tertiary">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-11 h-11 rounded-xl bg-surface-hover flex items-center justify-center mb-4">
                <Folder className="w-5 h-5 text-content-secondary" />
              </div>
              <p className="text-base font-semibold text-content-primary mb-1">No matching projects</p>
              <p className="text-sm text-content-tertiary">Try a different search or tab.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {filtered.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate({ name: 'project', id: item.id })}
                  className="w-full grid grid-cols-[1fr_7.5rem] gap-4 items-center px-1 py-3 text-left rounded-xl hover:bg-surface-hover/70 transition-colors"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                      <Folder className="w-4 h-4 text-content-secondary" strokeWidth={1.75} />
                    </span>
                    <span className="text-sm font-medium text-content-primary truncate">{item.name}</span>
                  </span>
                  <span className="text-right text-sm text-content-secondary tabular-nums">
                    {formatModified(item.modified)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ark-navy-950/70 backdrop-blur-md animate-fade-in"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-surface-border bg-ark-navy-900 p-6 shadow-2xl animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-content-primary mb-4">Add project</h2>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate();
              }}
              placeholder="Project name"
              className="ark-input"
              autoFocus
            />
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setShowCreate(false)} className="ark-btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="ark-btn-primary flex-1"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
