import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, type Route } from '@/context/RouterContext';
import {
  SquarePen, Briefcase, Blocks, Database, Bot,
  Settings, Search, PanelLeft, ChevronDown, History, Clock3,
  ImageIcon, Video, MessageSquare, Archive, Trash2, Code2, Pencil,
} from 'lucide-react';
import { Modal } from './Modal';
import { SettingsContent } from './SettingsContent';
import { SearchPanel } from './SearchPanel';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import {
  clearActivity,
  getActivityFlags,
  setActivityViewing,
  subscribeActivity,
  type ActivityKey,
} from '@/lib/activityIndicators';
import { reattachEngineDownloads } from '@/lib/engineDownloads';

const NAV_ITEMS: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  route: Route;
  activity?: ActivityKey;
}[] = [
  { label: 'New Chat', icon: SquarePen, route: { name: 'chat' }, activity: 'chat' },
  { label: 'Image', icon: ImageIcon, route: { name: 'chat', mode: 'image' }, activity: 'image' },
  { label: 'Video', icon: Video, route: { name: 'chat', mode: 'video' }, activity: 'video' },
  { label: 'Code', icon: Code2, route: { name: 'projects' }, activity: 'code' },
  { label: 'Projects', icon: Briefcase, route: { name: 'projects' } },
  { label: 'History', icon: History, route: { name: 'dashboard' } },
  { label: 'Plugins', icon: Blocks, route: { name: 'build' }, activity: 'plugins' },
  { label: 'Models', icon: Database, route: { name: 'models' }, activity: 'models' },
  { label: 'Local AI', icon: Bot, route: { name: 'local-ai' }, activity: 'local-ai' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { route, navigate } = useRouter();
  const { recent, activeChats, archiveChat, deleteChatForever, addRecent, renameRecent, renameChat, removeRecent } = useRecentProjects();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; kind: 'chat' | 'project' } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [activity, setActivity] = useState(() => ({ ...getActivityFlags() }));

  useEffect(() => subscribeActivity(() => setActivity({ ...getActivityFlags() })), []);

  useEffect(() => {
    void reattachEngineDownloads('models');
  }, []);

  useEffect(() => {
    void window.arkDesktop?.postUpdateConsume?.().then((res) => {
      if (res?.land === 'chat') {
        setSettingsOpen(false);
        navigate({ name: 'chat' });
      }
    }).catch(() => {});
  }, [navigate]);

  useEffect(() => {
    setActivityViewing({
      route: route.name,
      mode: route.name === 'chat' ? route.mode : undefined,
      chatId: route.name === 'chat' ? route.chatId : undefined,
    });
  }, [route]);

  const inRecentChat = route.name === 'chat' && Boolean(route.chatId);

  const isActive = (item: { route: Route; label: string }) => {
    if (route.name === 'project' || route.name === 'creation') {
      if (item.route.name === 'chat') return false;
      // Projects list stays inactive while inside a Code workspace; Code stays active.
      if (item.label === 'Projects') return false;
    }
    // Once a conversation is in Recent, highlight that item — not New Chat / Image / Video.
    if (inRecentChat && item.route.name === 'chat') return false;

    if (item.label === 'New Chat') {
      return route.name === 'chat' && !route.mode && !route.chatId;
    }
    if (item.label === 'Image') {
      return route.name === 'chat' && route.mode === 'image' && !route.chatId;
    }
    if (item.label === 'Video') {
      return route.name === 'chat' && route.mode === 'video' && !route.chatId;
    }
    if (item.label === 'Code') {
      return route.name === 'project';
    }
    if (item.label === 'Projects') {
      return route.name === 'projects';
    }
    return route.name === item.route.name;
  };

  const activeRecentId = route.name === 'project' ? route.id : null;
  const activeChatId = route.name === 'chat' ? route.chatId ?? null : null;

  const recentFeed = useMemo(() => {
    const chats = activeChats.map(c => ({
      key: `chat:${c.id}`,
      kind: 'chat' as const,
      id: c.id,
      title: c.title,
      mode: c.mode,
      updatedAt: c.updatedAt || '',
    }));
    const projects = recent.map(p => ({
      key: `project:${p.id}`,
      kind: 'project' as const,
      id: p.id,
      title: p.name,
      updatedAt: p.updatedAt || '',
    }));
    return [...chats, ...projects]
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 28);
  }, [activeChats, recent]);

  const commitRename = () => {
    if (!renamingId) return;
    const name = renameDraft.trim();
    if (name) {
      if (renamingId.startsWith('chat:')) renameChat(renamingId.slice(5), name);
      else if (renamingId.startsWith('project:')) renameRecent(renamingId.slice(8), name);
    }
    setRenamingId(null);
    setRenameDraft('');
  };

  const openSettings = () => {
    setSearchOpen(false);
    setSettingsOpen(true);
  };

  const chatIcon = (mode: string) => {
    if (mode === 'image') return ImageIcon;
    if (mode === 'video') return Video;
    if (mode === 'code') return Code2;
    return MessageSquare;
  };

  return (
    <div className="h-full flex bg-ark-navy-950 overflow-hidden">
      <aside
        className={`shrink-0 m-2 mr-0 flex flex-col rounded-2xl border border-surface-border bg-ark-navy-900/70 shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
          <div className={`flex-none ${collapsed ? 'px-2 pt-3 pb-2' : 'px-3 pt-3 pb-3'}`}>
            <div className={`flex items-center gap-2 ${collapsed ? 'flex-col w-full' : 'justify-between'}`}>
              {!collapsed && (
                <div className="flex items-center gap-2 min-w-0 pl-0.5">
                  <img
                    src={`${import.meta.env.BASE_URL}ark-icon.png`}
                    alt="ARK"
                    className="w-7 h-7 rounded-lg object-cover shrink-0"
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              {collapsed ? (
                <button
                  type="button"
                  onClick={() => setCollapsed(c => !c)}
                  className="ark-nav-item w-full !justify-center"
                  title="Expand sidebar"
                >
                  <PanelLeft className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="ark-btn-ghost !p-1.5"
                    title="Search"
                    aria-label="Search"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollapsed(c => !c)}
                    className="ark-btn-ghost !p-1.5"
                    title="Toggle sidebar"
                  >
                    <PanelLeft className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <nav className={`flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto ${collapsed ? 'px-2 pt-4' : 'px-3 pt-4'}`}>
            {NAV_ITEMS.map(item => {
              const active = isActive(item);
              const busy = Boolean(item.activity && activity[item.activity]);
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (item.activity) clearActivity(item.activity);
                    // New Chat / Image / Video are distinct tabs — always navigate explicitly.
                    if (item.label === 'New Chat') {
                      navigate({ name: 'chat' });
                      return;
                    }
                    if (item.label === 'Code') {
                      const project = addRecent('Code project');
                      navigate({ name: 'project', id: project.id });
                      return;
                    }
                    navigate(item.route);
                  }}
                  title={collapsed ? item.label : undefined}
                  className={`ark-nav-item w-full relative ${collapsed ? '!justify-center' : ''} ${active ? 'active' : ''} ${busy ? 'ark-nav-activity' : ''}`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                  {busy && (
                    <span
                      className={`absolute w-1.5 h-1.5 rounded-full bg-emerald-400 ${collapsed ? 'top-1.5 right-1.5' : 'top-2 right-2'}`}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}

            {/* Recent — always present, retractable list */}
            <div className={`mt-4 ${collapsed ? '' : 'pt-2 border-t border-surface-border'}`}>
              <button
                type="button"
                onClick={() => setRecentOpen(o => !o)}
                title={collapsed ? 'Recent' : undefined}
                className={`ark-nav-item w-full ${collapsed ? '!justify-center' : ''}`}
              >
                <Clock3 className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">Recent</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-content-tertiary transition-transform ${recentOpen ? '' : '-rotate-90'}`}
                    />
                  </>
                )}
              </button>

              {recentOpen && !collapsed && (
                <div className="mt-1 flex flex-col gap-0.5 pl-1">
                  {recentFeed.length === 0 ? (
                    <p className="px-3 py-2 text-[11px] text-content-tertiary leading-snug">
                      Conversations and Code workspaces you start will show up here.
                    </p>
                  ) : null}
                  {recentFeed.map(item => {
                    const active = item.kind === 'chat'
                      ? activeChatId === item.id
                      : activeRecentId === item.id;
                    const Icon = item.kind === 'project'
                      ? Code2
                      : chatIcon(item.mode);
                    const renameKey = item.key;
                    const editing = renamingId === renameKey;
                    return (
                      <div
                        key={item.key}
                        className={`group flex items-center gap-0.5 rounded-lg ${active ? 'bg-surface-hover' : ''}`}
                      >
                        {editing ? (
                          <input
                            autoFocus
                            value={renameDraft}
                            onChange={e => setRenameDraft(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitRename();
                              }
                              if (e.key === 'Escape') {
                                setRenamingId(null);
                                setRenameDraft('');
                              }
                            }}
                            className="flex-1 min-w-0 mx-1 my-0.5 rounded-md bg-ark-navy-950 border border-surface-border px-2 py-1 text-xs text-content-primary outline-none focus:border-sky-500/50"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (item.kind === 'chat') {
                                navigate({
                                  name: 'chat',
                                  mode: item.mode === 'general' ? undefined : item.mode,
                                  chatId: item.id,
                                });
                              } else {
                                navigate({ name: 'project', id: item.id });
                              }
                            }}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              setRenamingId(renameKey);
                              setRenameDraft(item.title);
                            }}
                            className={`ark-nav-item !py-1.5 !gap-2.5 flex-1 min-w-0 ${active ? 'active' : ''}`}
                            title={`${item.title} · double-click to rename`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0 text-content-tertiary" strokeWidth={1.75} />
                            <span className="truncate">{item.title}</span>
                          </button>
                        )}
                        {!editing && (
                          <>
                            <button
                              type="button"
                              title="Rename"
                              aria-label={`Rename ${item.title}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(renameKey);
                                setRenameDraft(item.title);
                              }}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover shrink-0 transition-opacity"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title={item.kind === 'chat' ? 'Archive to History' : 'Remove from Recent'}
                              aria-label={`Archive ${item.title}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.kind === 'chat') {
                                  archiveChat(item.id);
                                  if (activeChatId === item.id) navigate({ name: 'chat' });
                                } else {
                                  removeRecent(item.id);
                                  if (activeRecentId === item.id) navigate({ name: 'chat' });
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-sky-300 hover:bg-surface-hover shrink-0 transition-opacity"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete forever"
                              aria-label={`Delete ${item.title}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({ id: item.id, title: item.title, kind: item.kind });
                              }}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-rose-400 hover:bg-surface-hover shrink-0 transition-opacity mr-0.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {collapsed && recentOpen && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {recentFeed.slice(0, 12).map(item => {
                    const active = item.kind === 'chat'
                      ? activeChatId === item.id
                      : activeRecentId === item.id;
                    const Icon = item.kind === 'project' ? Code2 : chatIcon(item.mode);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          if (item.kind === 'chat') {
                            navigate({
                              name: 'chat',
                              mode: item.mode === 'general' ? undefined : item.mode,
                              chatId: item.id,
                            });
                          } else {
                            navigate({ name: 'project', id: item.id });
                          }
                        }}
                        className={`ark-nav-item !justify-center ${active ? 'active' : ''}`}
                        title={item.title}
                      >
                        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          <div className={`mt-auto flex-none shrink-0 ${collapsed ? 'p-2 pb-3' : 'p-3 pt-2 pb-3'}`}>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Open Settings"
              className={`flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors ${
                collapsed
                  ? 'w-9 h-9 mx-auto rounded-xl border border-surface-border bg-ark-navy-900/80'
                  : 'w-full gap-2 rounded-xl border border-surface-border bg-ark-navy-950/80 px-2.5 py-2.5'
              }`}
              aria-label="Open Settings"
            >
              <Settings className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="text-xs font-medium text-content-primary">Settings</span>}
            </button>
          </div>
      </aside>

        <main className="flex-1 min-h-0 min-w-0 overflow-hidden m-2 ml-2">
          {children}
        </main>

      <Modal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Search"
        size="search"
        hideHeader
      >
        <SearchPanel
          onClose={() => setSearchOpen(false)}
          onOpenSettings={openSettings}
        />
      </Modal>

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
        size="settings"
      >
        <SettingsContent onClose={() => setSettingsOpen(false)} />
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.kind === 'project' ? 'Delete Code project?' : 'Delete chat?'}
        size="sm"
      >
        <div className="px-1 pb-1">
          <p className="text-sm text-content-secondary leading-relaxed">
            You’re about to permanently delete
            {deleteTarget ? (
              <>
                {' '}
                <span className="text-content-primary font-medium">“{deleteTarget.title}”</span>
              </>
            ) : null}
            {deleteTarget?.kind === 'project'
              ? ' from Recent. Project files on disk are kept unless you remove them yourself.'
              : '. This removes the conversation and linked local data from this PC. This can’t be undone.'}
          </p>
          <div className="flex items-center justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-full px-3.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!deleteTarget) return;
                const id = deleteTarget.id;
                if (deleteTarget.kind === 'project') {
                  removeRecent(id);
                  setDeleteTarget(null);
                  if (activeRecentId === id) navigate({ name: 'chat' });
                } else {
                  deleteChatForever(id);
                  setDeleteTarget(null);
                  if (activeChatId === id) navigate({ name: 'chat' });
                }
              }}
              className="rounded-full px-3.5 py-1.5 text-xs font-medium bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors"
            >
              Yes, delete forever
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
