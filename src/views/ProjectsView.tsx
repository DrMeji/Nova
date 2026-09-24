import { useMemo, useState, useEffect } from 'react';
import { useRouter } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { fetchProjects, createProject, deleteProject } from '@/lib/api';
import { getLocalPrefs } from '@/lib/localPrefs';
import { listNovaProjectFolders } from '@/lib/novaProjectsHome';
import { isProjectDeleted, markProjectDeleted } from '@/lib/recentStore';
import { requestOpenChatCode } from '@/lib/openChatCode';
import type { Project } from '@/types';
import { Search, Folder, Loader2, Plus, FolderOpen, Pencil, Trash2, MoreHorizontal } from 'lucide-react';

type TabId = 'all' | 'local' | 'remote';

type ListItem = {
  id: string;
  name: string;
  modified: Date;
  source: 'local' | 'remote';
  typeLabel: string;
  diskPath?: string;
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

  const openProjectInChat = (opts: { projectId: string; name?: string; diskPath?: string }) => {
    navigate({ name: 'chat' });
    requestOpenChatCode({
      projectId: opts.projectId,
      name: opts.name,
      diskPath: opts.diskPath,
    });
  };

  const [remote, setRemote] = useState<ProjectRow[]>([]);
  const [novaFolders, setNovaFolders] = useState<Array<{
    id: string;
    name: string;
    path: string;
    sourceLabel: string;
    modified: Date;
  }>>([]);
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());


  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchProjects().then(data => setRemote(data as ProjectRow[])).catch(() => {}),
      listNovaProjectFolders().then(setNovaFolders).catch(() => setNovaFolders([])),
    ]).finally(() => setLoading(false));
  }, []);

  const items = useMemo<ListItem[]>(() => {
    const fromRemote: ListItem[] = remote
      .filter(p => !isProjectDeleted(p.id, null, p.name))
      .map(p => ({
      id: p.id,
      name: p.name,
      modified: new Date(p.updated_at),
      source: 'remote',
      typeLabel: p.project_type || 'web',
    }));

    const remoteIds = new Set(fromRemote.map(p => p.id));
    const fromRecent: ListItem[] = recent
      .filter(p => !remoteIds.has(p.id) && !isProjectDeleted(p.id, (p as { diskPath?: string }).diskPath, p.name))
      .map(p => ({
        id: p.id,
        name: p.name,
        modified: p.updatedAt ? new Date(p.updatedAt) : new Date(),
        source: 'local',
        typeLabel: 'this PC',
        diskPath: (p as { diskPath?: string }).diskPath,
      }));

    const recentNames = new Set(fromRecent.map(p => p.name.toLowerCase()));
    const fromArk: ListItem[] = novaFolders
      .filter(f => !recentNames.has(f.name.toLowerCase()) && !isProjectDeleted(f.id, f.path, f.name))
      .map(f => ({
        id: f.id,
        name: f.name,
        modified: f.modified,
        source: 'local' as const,
        typeLabel: 'NOVA Projects',
        diskPath: f.path,
      }));

    return [...fromRemote, ...fromRecent, ...fromArk].sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }, [remote, recent, novaFolders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      if (tab === 'local' && item.source !== 'local') return false;
      if (tab === 'remote' && item.source !== 'remote') return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, tab]);

  const selectedCount = selectedIds.size;
  const allFilteredSelected = filtered.length > 0 && filtered.every(item => selectedIds.has(item.id));
  const someFilteredSelected = filtered.some(item => selectedIds.has(item.id));

  useEffect(() => {
    if (selectedCount === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
      }
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

  const deleteListItem = async (item: ListItem) => {
    markProjectDeleted(item.id, item.diskPath, item.name);
    if (item.diskPath && window.novaDesktop?.workspaceDeleteFolder) {
      await window.novaDesktop.workspaceDeleteFolder({ targetPath: item.diskPath });
    } else if (item.id.startsWith('nova-folder:') || item.id.startsWith('ark-folder:')) {
      const disk = item.id.replace(/^(?:nova|ark)-folder:/, '');
      await window.novaDesktop?.workspaceDeleteFolder?.({ targetPath: disk });
      markProjectDeleted(item.id, disk, item.name);
    }
    if (item.source === 'remote') {
      try { await deleteProject(item.id); } catch { /* offline / already gone */ }
      setRemote(prev => prev.filter(p => p.id !== item.id));
    }
    removeRecent(item.id);
    setNovaFolders(prev => prev.filter(f => f.id !== item.id && f.path !== item.diskPath));
  };

  const handleCreate = async () => {
    const name = newName.trim() || 'Untitled';
    const type = newType || getLocalPrefs().defaultProjectType;
    setCreating(true);
    try {
      const project = await createProject(name, '', type) as ProjectRow;
      setShowCreate(false);
      setNewName('');
      setCreating(false);
      navigate({ name: 'chat' });
      requestOpenChatCode({ projectId: project.id, name: project.name });
    } catch {
      const local = addRecent(name);
      setShowCreate(false);
      setNewName('');
      setCreating(false);
      setNotice('Saved on this PC only. cloud sync unavailable');
      window.setTimeout(() => setNotice(null), 4000);
      openProjectInChat({ projectId: local.id, name: local.name });
    }
  };

  const openFolder = async () => {
    setOpeningFolder(true);
    try {
      if (!window.novaDesktop?.projectImportFolder) {
        const local = addRecent('New project');
        openProjectInChat({ projectId: local.id, name: local.name });
        return;
      }
      const project = addRecent('Opened folder');
      const res = await window.novaDesktop.projectImportFolder({
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
      openProjectInChat({
        projectId: project.id,
        name: res.name || project.name,
        diskPath: typeof res.root === 'string' ? res.root : undefined,
      });
    } finally {
      setOpeningFolder(false);
    }
  };

  const openListItem = async (item: ListItem) => {
    if (item.diskPath && window.novaDesktop?.workspaceOpenRoot) {
      setOpeningFolder(true);
      try {
        const project = addRecent(item.name);
        const res = await window.novaDesktop.workspaceOpenRoot({
          projectId: project.id,
          projectName: item.name,
          sourceDir: item.diskPath,
        });
        if (!res?.ok) {
          setNotice(res?.error || 'Could not open that NOVA project folder.');
          window.setTimeout(() => setNotice(null), 4000);
          return;
        }
        openProjectInChat({
          projectId: project.id,
          name: item.name,
          diskPath: item.diskPath,
        });
      } finally {
        setOpeningFolder(false);
      }
      return;
    }
    openProjectInChat({ projectId: item.id, name: item.name, diskPath: item.diskPath });
  };

  const commitRename = (id: string) => {
    const name = renameValue.trim();
    if (name) renameRecent(id, name);
    setRenamingId(null);
    setRenameValue('');
  };

  const handleBulkDelete = async () => {
    const toDelete = items.filter(item => selectedIds.has(item.id));
    if (!toDelete.length) return;
    const n = toDelete.length;
    if (!window.confirm(
      `Remove ${n} project${n === 1 ? '' : 's'} from this list and delete their folders if they still exist?`,
    )) {
      return;
    }
    for (const item of toDelete) {
      await deleteListItem(item);
    }
    clearSelection();
    setMenuId(null);
    setNotice(`Removed ${n} project${n === 1 ? '' : 's'}.`);
    window.setTimeout(() => setNotice(null), 3000);
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
                    onClick={() => void handleBulkDelete()}
                    className="h-7 rounded-full px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete ({selectedCount})
                  </button>
                </div>
              )}
              <div className="grid grid-cols-[1fr_6rem_7.5rem] gap-4 px-1 pb-2 text-xs text-content-tertiary">
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
                <span>Where</span>
                <span className="text-right">Modified</span>
              </div>
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
                New builds land in <span className="text-content-secondary">Documents\NOVA Projects</span>. Open a folder, or create a blank project.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map(item => {
                const selected = selectedIds.has(item.id);
                return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`${selected ? 'Deselect' : 'Select'} ${item.name}`}
                  onClick={() => toggleSelect(item.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSelect(item.id);
                    }
                  }}
                  className={`w-full grid grid-cols-[1fr_6rem_7.5rem] gap-4 items-center px-2 py-3 rounded-xl transition-colors group cursor-pointer ${
                    selected
                      ? 'bg-sky-500/15 ring-1 ring-sky-500/30'
                      : 'hover:bg-surface-hover/70'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-4 h-4 rounded-full border shrink-0 transition-colors ${
                        selected
                          ? 'border-sky-400 bg-sky-400'
                          : 'border-content-tertiary/50 bg-transparent group-hover:border-content-tertiary'
                      }`}
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        void openListItem(item);
                      }}
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
                            if (e.key === 'Escape') {
                              e.stopPropagation();
                              setRenamingId(null);
                            }
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
                        <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-surface-border bg-nova-navy-900 shadow-xl py-1">
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-hover"
                            onClick={e => {
                              e.stopPropagation();
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
                            onClick={e => {
                              e.stopPropagation();
                              void (async () => {
                                const label = item.name;
                                if (!window.confirm(`Remove “${label}” from this list and delete its folder if it still exists?`)) {
                                  setMenuId(null);
                                  return;
                                }
                                await deleteListItem(item);
                                setSelectedIds(prev => {
                                  if (!prev.has(item.id)) return prev;
                                  const next = new Set(prev);
                                  next.delete(item.id);
                                  return next;
                                });
                                setMenuId(null);
                                setNotice(`Removed “${label}”.`);
                                window.setTimeout(() => setNotice(null), 3000);
                              })();
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
                    {item.source === 'remote' ? item.typeLabel : (item.diskPath ? 'NOVA Projects' : 'This PC')}
                  </span>
                  <span className="text-right text-sm text-content-secondary tabular-nums">
                    {formatModified(item.modified)}
                  </span>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-nova-navy-950/70 backdrop-blur-md animate-fade-in"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-surface-border bg-nova-navy-900 p-6 shadow-2xl animate-slide-up"
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
              className="nova-input"
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
              <button type="button" onClick={() => setShowCreate(false)} className="nova-btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                className="nova-btn-primary flex-1"
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
