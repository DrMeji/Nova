import { useMemo, useState, useEffect } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { fetchProjects, createProject } from '@/lib/api';
import { getLocalPrefs } from '@/lib/localPrefs';
import type { Project } from '@/types';
import { Search, Folder, Loader2, Plus, FolderOpen, Pencil, Trash2, MoreHorizontal } from 'lucide-react';

type TabId = 'all' | 'local' | 'remote';

type ListItem = {
  id: string;
  name: string;
  modified: Date;
  source: 'local' | 'remote';
  typeLabel: string;
};

type ProjectRow = Project & { id: string; project_type?: string };

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'local', label: 'This PC' },
  { id: 'remote', label: 'Signed-in' },
];

function formatModified(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProjectsView() {
  const { navigate } = useRouter();
  const { recent, addRecent, renameRecent, removeRecent } = useRecentProjects();
  const [remote, setRemote] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'web' | 'api' | 'desktop'>(() => getLocalPrefs().defaultProjectType);
  const [creating, setCreating] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [openingFolder, setOpeningFolder] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      source: 'remote',
      typeLabel: p.project_type || 'web',
    }));

    const remoteIds = new Set(fromRemote.map(p => p.id));
    const fromRecent: ListItem[] = recent
      .filter(p => !remoteIds.has(p.id))
      .map(p => ({
        id: p.id,
        name: p.name,
        modified: p.updatedAt ? new Date(p.updatedAt) : new Date(),
        source: 'local',
        typeLabel: 'this PC',
      }));

    return [...fromRemote, ...fromRecent].sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }, [remote, recent]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      if (tab === 'local' && item.source !== 'local') return false;
      if (tab === 'remote' && item.source !== 'remote') return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, tab]);

  const handleCreate = async () => {
    const name = newName.trim() || 'Untitled';
    const type = newType || getLocalPrefs().defaultProjectType;
    setCreating(true);
    try {
      const project = await createProject(name, '', type) as ProjectRow;
      setShowCreate(false);
      setNewName('');
      setCreating(false);
      navigate({ name: 'project', id: project.id });
    } catch {
      const local = addRecent(name);
      setShowCreate(false);
      setNewName('');
      setCreating(false);
      setNotice('Saved on this PC only. cloud sync unavailable');
      window.setTimeout(() => setNotice(null), 4000);
      navigate({ name: 'project', id: local.id });
    }
  };

  const openFolder = async () => {
    setOpeningFolder(true);
    try {
      if (!window.arkDesktop?.projectImportFolder) {
        const local = addRecent('New project');
        navigate({ name: 'project', id: local.id });
        return;
      }
      const project = addRecent('Opened folder');
      const res = await window.arkDesktop.projectImportFolder({
        projectId: project.id,
        projectName: project.name,
      });
      if (!res?.ok || res.canceled) {
        removeRecent(project.id);
        return;
      }
      if (res.name) renameRecent(project.id, res.name);
      const skipped = res.skipped as { env?: number; large?: number; binary?: number; limit?: number } | undefined;
      const skipBits: string[] = [];
      if (skipped?.env) skipBits.push(`${skipped.env} .env`);
      if (skipped?.large) skipBits.push(`${skipped.large} large`);
      if (skipped?.binary) skipBits.push(`${skipped.binary} binary`);
      if (skipped?.limit) skipBits.push('limit');
      if (skipBits.length) {
        setNotice(`Opened on this PC. Skipped ${skipBits.join(', ')}.`);
        window.setTimeout(() => setNotice(null), 6000);
      }
      navigate({ name: 'project', id: project.id });
    } finally {
      setOpeningFolder(false);
    }
  };

  const commitRename = (id: string) => {
    const name = renameValue.trim();
    if (name) renameRecent(id, name);
    setRenamingId(null);
    setRenameValue('');
  };

  return (
    <div className="h-full min-w-0 flex flex-col overflow-hidden animate-fade-in bg-transparent">
      <div className="shrink-0 px-4 sm:px-6 pt-[min(12vh,6rem)] bg-transparent">
        <div className="w-full max-w-3xl mx-auto min-w-0">
          {notice && (
            <p className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
              {notice}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 mb-5 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight truncate">Projects</h1>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 rounded-full bg-surface-hover px-3 py-2 w-32 sm:w-52 md:w-60 min-w-0">
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
                onClick={() => void openFolder()}
                disabled={openingFolder}
                title="Open a folder on this PC"
                className="h-9 rounded-full px-3 inline-flex items-center gap-1.5 text-xs font-medium border border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-hover disabled:opacity-50"
              >
                {openingFolder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                Open folder
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewType(getLocalPrefs().defaultProjectType);
                  setShowCreate(true);
                }}
                title="New blank project"
                aria-label="New project"
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

          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-[1fr_6rem_7.5rem] gap-4 px-1 pb-2 text-xs text-content-tertiary">
              <span>Name</span>
              <span>Where</span>
              <span className="text-right">Modified</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-10">
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
              <p className="text-base font-semibold text-content-primary mb-1">No projects here</p>
              <p className="text-sm text-content-tertiary max-w-sm">
                Open a folder on this PC, or create a blank project. Templates live in Code after you open one.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {filtered.map(item => (
                <div
                  key={item.id}
                  className="w-full grid grid-cols-[1fr_6rem_7.5rem] gap-4 items-center px-1 py-3 rounded-xl hover:bg-surface-hover/70 transition-colors group"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'project', id: item.id })}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <span className="w-9 h-9 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                        <Folder className="w-4 h-4 text-content-secondary" strokeWidth={1.75} />
                      </span>
                      {renamingId === item.id ? (
                        <input
                          value={renameValue}
                          autoFocus
                          onChange={e => setRenameValue(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename(item.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          onBlur={() => commitRename(item.id)}
                          className="flex-1 min-w-0 bg-transparent border-b border-surface-border text-sm text-content-primary outline-none"
                        />
                      ) : (
                        <span className="text-sm font-medium text-content-primary truncate">{item.name}</span>
                      )}
                    </button>
                    <div className="relative shrink-0 opacity-0 group-hover:opacity-100">
                      <button
                        type="button"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-content-primary"
                        onClick={e => {
                          e.stopPropagation();
                          setMenuId(menuId === item.id ? null : item.id);
                        }}
                        aria-label="Project actions"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuId === item.id && (
                        <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-surface-border bg-ark-navy-900 shadow-xl py-1">
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-hover"
                            onClick={() => {
                              setRenamingId(item.id);
                              setRenameValue(item.name);
                              setMenuId(null);
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                            Rename
                          </button>
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
                            onClick={() => {
                              if (window.confirm(`Remove “${item.name}” from this list? Files on disk stay.`)) {
                                removeRecent(item.id);
                              }
                              setMenuId(null);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </span>
                  <span className="text-xs text-content-tertiary capitalize truncate">
                    {item.source === 'remote' ? item.typeLabel : 'This PC'}
                  </span>
                  <span className="text-right text-sm text-content-secondary tabular-nums">
                    {formatModified(item.modified)}
                  </span>
                </div>
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
            <h2 className="text-lg font-semibold text-content-primary mb-1">New project</h2>
            <p className="text-xs text-content-tertiary mb-4">
              Blank project. Type comes from Settings → Projects (you can change it here).
            </p>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleCreate();
              }}
              placeholder="Project name"
              className="ark-input"
              autoFocus
            />
            <div className="grid grid-cols-3 gap-2 mt-3">
              {([
                { id: 'web' as const, label: 'Web' },
                { id: 'api' as const, label: 'API' },
                { id: 'desktop' as const, label: 'Desktop' },
              ]).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setNewType(t.id)}
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    newType === t.id
                      ? 'border-content-primary bg-surface-hover text-content-primary'
                      : 'border-surface-border text-content-secondary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setShowCreate(false)} className="ark-btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
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
