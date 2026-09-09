import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, type Route } from '@/context/RouterContext';
import {
  SquarePen, Briefcase, Blocks, Database,
  Settings, Search, PanelLeft, ChevronDown, History, Clock3,
  MessageSquare, Trash2, Code2, Pencil, Mic,
  Globe, Bell, Copy, Star, Download, Brain, Cable, Bot,
} from 'lucide-react';
import { Modal } from './Modal';
import { SettingsContent } from './SettingsContent';
import { SearchPanel } from './SearchPanel';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { useAuth } from '@/context/AuthContext';
import { isSocialParked, isCodeTabEnabled } from '@/lib/featurePark';
import { useSocial } from '@/context/SocialContext';
import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';
import {
  PRESENCE_OPTIONS,
  presenceDotClass,
  presenceIdClass,
  presenceRingClass,
  presenceTextClass,
  type PresenceStatus,
} from '@/lib/presenceStatus';
import { probeLiveCapacity, type LiveCapacity } from '@/lib/arkCapacity';
import { probeAiModeLabel, type AiModeLabel } from '@/lib/aiModeStatus';
import { JobsStrip } from '@/components/JobsStrip';
import { PostLoginSafetyTip } from '@/components/PostLoginSafetyTip';
import { AuthAmbientOrbs } from '@/components/auth/AuthAmbientOrbs';
import { NovaMark } from '@/components/NovaMark';
import { comparePinnedThenRecent } from '@/lib/recentStore';
import { formatArkId } from '@/lib/arkUserId';
import { isArkDevEmail } from '@/lib/arkDevAccount';
import {
  clearActivity,
  clearChatDone,
  getActivityFlags,
  getDoneChatIds,
  setActivityViewing,
  subscribeActivity,
  type ActivityKey,
} from '@/lib/activityIndicators';
import { reattachEngineDownloads } from '@/lib/engineDownloads';
import { countUnreadLocalNotifications } from '@/lib/localNotifications';
import { ARK_UPDATE_INDICATOR_CACHE_KEY, checkArkGitHubUpdate, clearUpdateIndicatorCache, downloadAndInstallArkUpdate, type ArkUpdateInfo } from '@/lib/arkUpdates';

function BrainNavIcon({ className }: { className?: string }) {
  return <Brain className={className || 'w-4 h-4'} />;
}

function getNavGroups(): {
  id: string;
  label?: string;
  items: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    route?: Route;
    activity?: ActivityKey;
    comingSoon?: boolean;
  }[];
}[] {
  return [
    {
      id: 'create',
      items: [
        { label: 'Chat', icon: SquarePen, route: { name: 'chat' }, activity: 'chat' },
      ],
    },
    {
      id: 'work',
      label: 'Work',
      items: [
        { label: 'Projects', icon: Briefcase, route: { name: 'projects' as const } },
        { label: 'History', icon: History, route: { name: 'dashboard' as const } },
      ],
    },
    {
      id: 'tools',
      label: 'Tools',
      items: [
        { label: 'Plugins', icon: Blocks, route: { name: 'build' }, activity: 'plugins' },
        { label: 'Models', icon: Database, route: { name: 'models' }, activity: 'models' },
        { label: 'Local AI', icon: Bot, route: { name: 'local-ai' } },
        { label: 'MCP', icon: Cable, route: { name: 'mcp' } },
        { label: 'Brain', icon: BrainNavIcon, route: { name: 'brain' } },
      ],
    },
    {
      id: 'connect',
      label: 'Connect',
      items: [
        { label: 'Networking', icon: Globe, route: { name: 'networking' }, activity: 'networking', comingSoon: isSocialParked('networking') },
        { label: 'Message', icon: MessageSquare, route: { name: 'message' }, activity: 'message', comingSoon: isSocialParked('message') },
        { label: 'Notifications', icon: Bell, route: { name: 'notifications' }, activity: 'notifications' },
      ],
    },
  ];
}

function resolveDisplayName(
  prefsName: string | undefined,
  profileName: string | null | undefined,
  email: string | undefined,
) {
  const fromPrefs = prefsName?.trim();
  if (fromPrefs && fromPrefs !== 'Guest') return fromPrefs;
  if (profileName?.trim()) return profileName.trim();
  return email?.split('@')[0] || 'Guest';
}

export function AppShell({ children }: { children: ReactNode }) {
  const { route, navigate } = useRouter();
  const { user, profile } = useAuth();
  const { recent, activeChats, archiveChat, deleteChatForever, renameRecent, renameChat, removeRecent, pinChat, pinProject } = useRecentProjects();
  const [collapsed, setCollapsed] = useState(() => getLocalPrefs().compactSidebar);
  const [narrowForced, setNarrowForced] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('account');
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);
  const [prefsName, setPrefsName] = useState(() => getLocalPrefs().displayName);
  const [presence, setPresence] = useState<PresenceStatus>(() => getLocalPrefs().presenceStatus || 'online');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [capacity, setCapacity] = useState<LiveCapacity | null>(null);
  const [modeLabel, setModeLabel] = useState<AiModeLabel | null>(null);
  const [updateInfo, setUpdateInfo] = useState<ArkUpdateInfo | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; kind: 'chat' | 'project' } | null>(null);
  const [wipeProjectDisk, setWipeProjectDisk] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [activity, setActivity] = useState(() => ({ ...getActivityFlags() }));
  const [doneChats, setDoneChats] = useState(() => new Set(getDoneChatIds()));
  const [navTick, setNavTick] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const { unreadFrom } = useSocial();
  const myArkIdForNotifs = isArkDevEmail(user?.email) ? 'DEV' : (profile?.ark_id || undefined);

  useEffect(() => {
    const onFeat = () => setNavTick(t => t + 1);
    window.addEventListener('NOVA:features-changed', onFeat);
    return () => window.removeEventListener('NOVA:features-changed', onFeat);
  }, []);

  const NAV_GROUPS = useMemo(() => getNavGroups(), [navTick]);

  useEffect(() => {
    const unsub = subscribeActivity(() => {
      setActivity({ ...getActivityFlags() });
      setDoneChats(new Set(getDoneChatIds()));
    });
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const bump = () => setNotifUnread(countUnreadLocalNotifications(myArkIdForNotifs));
    bump();
    window.addEventListener('NOVA:local-notifications', bump);
    return () => window.removeEventListener('NOVA:local-notifications', bump);
  }, [myArkIdForNotifs]);

  useEffect(() => {
    const onPrefs = () => {
      const next = getLocalPrefs();
      setPrefsName(next.displayName);
      setPresence(next.presenceStatus || 'online');
      if (!narrowForced) setCollapsed(next.compactSidebar);
    };
    window.addEventListener('ark:prefs-changed', onPrefs);
    return () => window.removeEventListener('ark:prefs-changed', onPrefs);
  }, [narrowForced]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 980px)');
    const apply = () => {
      const narrow = mq.matches;
      setNarrowForced(narrow);
      if (narrow) setCollapsed(true);
      else setCollapsed(getLocalPrefs().compactSidebar);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-status-menu]')) return;
      setStatusMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStatusMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [statusMenuOpen]);

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
      route: settingsOpen ? 'settings' : route.name,
      mode: route.name === 'chat' ? route.mode : undefined,
      chatId: settingsOpen ? undefined : (route.name === 'chat' ? route.chatId : undefined),
    });
  }, [route, settingsOpen]);

  const displayName = resolveDisplayName(prefsName, profile?.display_name, user?.email);
  const initial = displayName[0]?.toUpperCase() || '?';

  const inRecentChat = route.name === 'chat' && Boolean(route.chatId);

  const isActive = (item: { route?: Route; label: string }) => {
    if (!item.route) return false;
    if (route.name === 'project' || route.name === 'creation') {
      if (item.route.name === 'chat') return false;
      // Projects list stays inactive while inside a Code workspace; Recent row is the highlight.
      if (item.label === 'Projects') return false;
      if (item.label === 'Code') return false;
    }
    // Once a conversation is in Recent, highlight that item. not Chat / Image / Voice starters.
    if (inRecentChat && item.route.name === 'chat') return false;

    if (item.label === 'Chat') {
      return route.name === 'chat' && !route.chatId && !route.mode;
    }
    if (item.label === 'Voice') {
      return route.name === 'chat' && route.mode === 'voice' && !route.chatId;
    }
    if (item.label === 'Code') {
      return route.name === 'code';
    }
    if (item.label === 'Projects') {
      return route.name === 'projects';
    }
    if (item.label === 'Models') {
      return route.name === 'models';
    }
    if (item.label === 'Local AI') {
      return route.name === 'local-ai';
    }
    if (item.label === 'MCP') {
      return route.name === 'mcp';
    }
    if (item.label === 'Brain') {
      return route.name === 'brain';
    }
    return route.name === item.route.name;
  };

  const activeRecentId = route.name === 'project' ? route.id : null;
  const activeChatId = route.name === 'chat' ? route.chatId ?? null : null;

  const recentFeed = useMemo(() => {
    // Recent is chats only — never a separate “Code project” filing-system row.
    // Code files open from the Code pill on the chat that built them.
    const chats = activeChats.map(c => ({
      key: `chat:${c.id}`,
      kind: 'chat' as const,
      id: c.id,
      title: c.title,
      preview: c.preview,
      pinned: Boolean(c.pinnedAt),
      mode: c.mode,
      updatedAt: c.updatedAt || '',
    }));
    const byPin = (a: { pinned: boolean; updatedAt: string }, b: { pinned: boolean; updatedAt: string }) =>
      comparePinnedThenRecent(
        { pinnedAt: a.pinned ? '1' : undefined, updatedAt: a.updatedAt },
        { pinnedAt: b.pinned ? '1' : undefined, updatedAt: b.updatedAt },
      );
    const sorted = [...chats].sort(byPin).slice(0, 20);
    return {
      chats: sorted,
      projects: [] as typeof sorted,
      mixed: sorted,
    };
  }, [activeChats]);

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

  const openSettings = (section = 'account') => {
    setSearchOpen(false);
    setStatusMenuOpen(false);
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
  };

  const startUpdateDownload = () => {
    if (!updateInfo?.newerAvailable || !updateInfo.setupAssetUrl || !updateInfo.latestTag || updateBusy) return;
    void (async () => {
      setUpdateBusy(true);
      const result = await downloadAndInstallArkUpdate({
        setupAssetUrl: updateInfo.setupAssetUrl!,
        latestTag: updateInfo.latestTag!,
      });
      if (!result?.ok) {
        setUpdateBusy(false);
        setUpdateInfo(null);
        clearUpdateIndicatorCache();
      }
    })();
  };

  const setPresenceStatus = (next: PresenceStatus) => {
    setPresence(next);
    setLocalPrefs({ presenceStatus: next });
    setStatusMenuOpen(false);
  };

  useEffect(() => {
    const onOpen = (e: Event) => {
      const section = (e as CustomEvent<{ section?: string }>).detail?.section || 'account';
      openSettings(section);
    };
    window.addEventListener('NOVA:open-settings', onOpen);
    return () => window.removeEventListener('NOVA:open-settings', onOpen);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void probeLiveCapacity().then(c => { if (alive) setCapacity(c); }).catch(() => undefined);
      void probeAiModeLabel().then(l => { if (alive) setModeLabel(l); }).catch(() => undefined);
    };
    refresh();
    window.addEventListener('ark:prefs-changed', refresh);
    window.addEventListener('NOVA:engine-models-changed', refresh);
    return () => {
      alive = false;
      window.removeEventListener('ark:prefs-changed', refresh);
      window.removeEventListener('NOVA:engine-models-changed', refresh);
    };
  }, []);

  useEffect(() => {
    // Lightweight update indicator (near Search). cached so we don't hammer GitHub.
    let alive = true;
    const CACHE_KEY = ARK_UPDATE_INDICATOR_CACHE_KEY;
    const CACHE_MS = 30 * 60 * 1000; // 30 minutes

    const readCache = (): { at: number; info: ArkUpdateInfo } | null => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { at?: number; info?: ArkUpdateInfo };
        if (!parsed?.at || !parsed?.info) return null;
        return { at: parsed.at, info: parsed.info };
      } catch {
        return null;
      }
    };

    const writeCache = (info: ArkUpdateInfo) => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), info }));
      } catch {
        /* ignore */
      }
    };

    const maybeCheck = async () => {
      if (!getLocalPrefs().autoCheckUpdates) {
        if (alive) setUpdateInfo(null);
        return;
      }
      const currentVersion = await window.arkDesktop?.appMeta?.().then((m) => m?.version).catch(() => undefined);
      const cached = readCache();
      if (cached && Date.now() - cached.at < CACHE_MS && currentVersion && cached.info.currentVersion === currentVersion) {
        if (alive) setUpdateInfo(cached.info);
        return;
      }

      const info = await checkArkGitHubUpdate().catch(() => null);
      if (!alive || !info) return;
      setUpdateInfo(info);
      writeCache(info);
      if (info.newerAvailable && getLocalPrefs().notifyOnUpdate) {
        try {
          // Lightweight in-app toast via existing update indicator — Notification when permitted.
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('NOVA update available', {
              body: info.latestTag
                ? `Version ${info.latestTag} is ready to install.`
                : (info.message || 'A newer NOVA build is available.'),
            });
          } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            void Notification.requestPermission();
          }
        } catch {
          /* ignore */
        }
      }
    };

    void maybeCheck();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const unsub = window.arkDesktop?.onUpdateProgress?.((payload) => {
      if (payload?.status === 'downloading' || payload?.status === 'handoff' || payload?.status === 'installing') {
        setUpdateBusy(true);
      } else if (payload?.status === 'error' || payload?.status === 'idle' || payload?.status === 'available') {
        setUpdateBusy(false);
      }
    });
    return () => {
      unsub?.();
    };
  }, []);

  const chatIcon = (mode: string) => {
    if (mode === 'voice') return Mic;
    if (mode === 'code') return Code2;
    return MessageSquare;
  };

  type RecentRow = {
    key: string;
    kind: 'chat' | 'project';
    id: string;
    title: string;
    preview?: string;
    pinned: boolean;
    mode?: string;
    updatedAt: string;
  };

  const openRecent = (item: RecentRow) => {
    if (item.kind === 'chat') {
      clearChatDone(item.id);
      const mode = item.mode === 'voice'
        ? 'voice' as const
        : item.mode === 'code'
          ? 'code' as const
          : undefined;
      navigate({
        name: 'chat',
        mode,
        chatId: item.id,
      });
      return;
    }
    // Legacy Code-project Recent rows are retired — jump to Chat; use the Code pill for files.
    navigate({ name: 'chat' });
  };

  const renderRecentRow = (item: RecentRow) => {
    const active = item.kind === 'chat' ? activeChatId === item.id : activeRecentId === item.id;
    const doneAway = item.kind === 'chat' && doneChats.has(item.id) && !active;
    const Icon = item.kind === 'project' ? Code2 : chatIcon(item.mode || 'general');
    const renameKey = item.key;
    const editing = renamingId === renameKey;
    return (
      <div
        key={item.key}
        className={`group relative flex items-center gap-0.5 rounded-lg transition-colors ${
          active ? 'bg-surface-active' : 'hover:bg-surface-hover'
        }`}
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
            onClick={() => openRecent(item)}
            onDoubleClick={(e) => {
              e.preventDefault();
              setRenamingId(renameKey);
              setRenameDraft(item.title);
            }}
            className={`ark-nav-item !py-1.5 !gap-2.5 flex-1 min-w-0 !bg-transparent hover:!bg-transparent ${
              active ? '!text-content-primary' : ''
            }`}
            title={`${item.title} · double-click to rename`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0 text-content-tertiary" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 text-left truncate">{item.title}</span>
          </button>
        )}
        {!editing && doneAway ? (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mr-1" aria-hidden title="Updated" />
        ) : !editing ? (
          <span className="w-1.5 h-1.5 shrink-0 mr-1" aria-hidden />
        ) : null}
        {!editing && (
          <>
            <button
              type="button"
              title={item.pinned ? 'Unpin' : 'Pin'}
              aria-label={item.pinned ? `Unpin ${item.title}` : `Pin ${item.title}`}
              onClick={(e) => {
                e.stopPropagation();
                if (item.kind === 'chat') pinChat(item.id);
                else pinProject(item.id);
              }}
              className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-opacity ${
                item.pinned
                  ? 'opacity-100 text-amber-300'
                  : 'opacity-0 group-hover:opacity-100 focus:opacity-100 text-content-tertiary hover:text-amber-300 hover:bg-white/5'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${item.pinned ? 'fill-amber-300 text-amber-300' : ''}`} />
            </button>
            <button
              type="button"
              title="Rename"
              aria-label={`Rename ${item.title}`}
              onClick={(e) => {
                e.stopPropagation();
                setRenamingId(renameKey);
                setRenameDraft(item.title);
              }}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-white/5 shrink-0 transition-opacity"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Delete forever"
              aria-label={`Delete ${item.title}`}
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget({ id: item.id, title: item.title, kind: item.kind });
                setWipeProjectDisk(false);
              }}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-rose-400 hover:bg-white/5 shrink-0 transition-opacity mr-0.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    );
  };

  const handleNavClick = (item: { label: string; route?: Route; activity?: ActivityKey; comingSoon?: boolean }) => {
    if (item.comingSoon) {
      // Navigate into the route so the blur "Coming Soon" overlay is shown.
      if (item.route) navigate(item.route);
      return;
    }
    if (item.activity) clearActivity(item.activity);
    if (item.label === 'Chat') {
      navigate({ name: 'chat' });
      return;
    }
    if (item.route) navigate(item.route);
  };

  const toggleMainSidebar = () => {
    setCollapsed(c => {
      const next = !c;
      // On Message / Networking / Call the people/filter rail stays visible;
      // collapsing the main nav only compacts that rail to icons.
      if (next && (route.name === 'message' || route.name === 'networking')) {
        window.dispatchEvent(new CustomEvent('NOVA:compact-connect-rail'));
      }
      return next;
    });
  };

  const renderNavItem = (item: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    route?: Route;
    activity?: ActivityKey;
    comingSoon?: boolean;
  }) => {
    const active = isActive(item);
    const isNotifications = item.label === 'Notifications';
    const notifAttention = isNotifications && (notifUnread > 0 || Boolean(activity.notifications));
    const busy = Boolean(item.activity && activity[item.activity]) && !notifAttention;
    const unreadCount = item.label === 'Message' && !item.comingSoon ? unreadFrom.length : 0;
    if (item.comingSoon) {
      return (
        <button
          key={item.label}
          type="button"
          aria-label={`${item.label} (coming soon)`}
          title={`${item.label} · Coming Soon`}
          onClick={() => handleNavClick(item)}
          className={`ark-nav-item w-full opacity-55 ${collapsed ? 'ark-nav-item-rail' : ''}`}
        >
          <item.icon className="w-4 h-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <span className="text-[9px] uppercase tracking-wide text-content-tertiary">Soon</span>
            </>
          )}
        </button>
      );
    }
    return (
      <button
        key={item.label}
        type="button"
        aria-label={
          isNotifications && notifUnread > 0
            ? `Notifications (${notifUnread} unread)`
            : item.label
        }
        onClick={() => handleNavClick(item)}
        title={collapsed ? item.label : undefined}
        className={`ark-nav-item w-full relative ${collapsed ? 'ark-nav-item-rail' : ''} ${active ? 'active' : ''}`}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && unreadCount > 0 ? (
          <span className="text-[10px] font-semibold rounded-full bg-sky-500/20 text-sky-300 px-1.5 py-0.5 min-w-[1.25rem] text-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
        {notifAttention && (
          <span
            className={`absolute w-2 h-2 rounded-full bg-sky-400 ring-2 ring-ark-navy-900 ${collapsed ? 'top-1.5 right-1.5' : 'top-2 right-2'}`}
            aria-hidden
          />
        )}
        {busy && (
          <span
            className={`absolute w-1.5 h-1.5 rounded-full bg-emerald-400 ${collapsed ? 'top-1.5 right-1.5' : 'top-2 right-2'}`}
            aria-hidden
          />
        )}
      </button>
    );
  };

  return (
    <div className="h-full min-w-0 flex overflow-hidden relative bg-ark-navy-950">
      <AuthAmbientOrbs variant="app" />
      <aside
        className={`relative z-10 shrink-0 m-2 mr-0 flex flex-col min-w-0 rounded-2xl border border-surface-border bg-ark-navy-900 shadow-[0_8px_32px_rgba(0,0,0,0.35)] ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
          <div className={`flex-none ${collapsed ? 'px-2 pt-3 pb-2' : 'px-3 pt-3 pb-3'}`}>
            <div className={`flex items-center gap-2 ${collapsed ? 'flex-col w-full' : 'justify-between'}`}>
              {!collapsed && (
                <div className="flex items-center gap-2 min-w-0 pl-0.5">
                  <NovaMark className="w-7 h-7 text-content-primary" title="NOVA" />
                </div>
              )}
              {collapsed ? (
                <button
                  type="button"
                  onClick={toggleMainSidebar}
                  className="ark-nav-item w-full ark-nav-item-rail"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <PanelLeft className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="ark-btn-ghost !p-1.5"
                    title="Search (Ctrl+K)"
                    aria-label="Search"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  {updateInfo?.newerAvailable && updateInfo.setupAssetUrl && updateInfo.latestTag ? (
                    <button
                      type="button"
                      onClick={startUpdateDownload}
                      className={`relative rounded-lg !p-1.5 transition-colors ${
                        updateBusy
                          ? 'opacity-60'
                          : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:text-emerald-200'
                      }`}
                      title={`Update available (${updateInfo.latestTag}). Click to download.`}
                      aria-label="Download update"
                    >
                      <Download className={`w-4 h-4 ${updateBusy ? 'text-content-tertiary' : ''}`} />
                      {!updateBusy ? (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400" aria-hidden />
                      ) : null}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={toggleMainSidebar}
                    className="ark-btn-ghost !p-1.5"
                    title="Toggle sidebar"
                    aria-label="Toggle sidebar"
                  >
                    <PanelLeft className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <nav className={`flex-1 min-h-0 flex flex-col gap-1 ${collapsed ? 'px-2 pt-3' : 'px-3 pt-4'}`}>
            {/* Locked primary nav — Chat / Work / Tools / Connect never scroll away */}
            <div className="flex-none shrink-0 flex flex-col gap-1">
              {NAV_GROUPS.map(group => (
                <div key={group.id} className={group.label ? (collapsed ? 'mt-2 first:mt-0' : 'mt-3 first:mt-0') : ''}>
                  {group.label && !collapsed ? (
                    <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-content-tertiary">{group.label}</p>
                  ) : null}
                  {group.items.map(renderNavItem)}
                </div>
              ))}
            </div>

            {/* Recent only scrolls */}
            <div className={`mt-4 min-h-0 flex-1 flex flex-col ${collapsed ? '' : 'pt-2 border-t border-surface-border'}`}>
              <button
                type="button"
                onClick={() => setRecentOpen(o => !o)}
                title={collapsed ? 'Recent' : undefined}
                aria-label="Recent"
                className={`ark-nav-item w-full flex-none ${collapsed ? 'ark-nav-item-rail' : ''}`}
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
                <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col gap-0.5 pl-1 pr-0.5">
                  {recentFeed.mixed.length === 0 ? (
                    <p className="px-3 py-2 text-[11px] text-content-tertiary leading-snug">
                      Chats you start will show up here.
                    </p>
                  ) : (
                    recentFeed.mixed.map(renderRecentRow)
                  )}
                </div>
              )}

              {collapsed && recentOpen && (
                <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col gap-0.5">
                  {recentFeed.mixed.slice(0, 12).map(item => {
                    const active = item.kind === 'chat'
                      ? activeChatId === item.id
                      : activeRecentId === item.id;
                    const doneAway = item.kind === 'chat' && doneChats.has(item.id) && !active;
                    const Icon = chatIcon(item.mode || 'general');
                    return (
                      <button
                        key={item.key}
                        type="button"
                        aria-label={item.title}
                        onClick={() => openRecent(item)}
                        className={`ark-nav-item ark-nav-item-rail relative ${active ? 'active' : ''}`}
                        title={item.title}
                      >
                        <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                        {doneAway ? <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

            <div
              className={`mt-auto flex-none shrink-0 relative ${collapsed ? 'p-2 pb-3' : 'p-3 pt-2 pb-3'}`}
              data-status-menu
              data-nova-status-bar
            >
            <JobsStrip variant="sidebar" />
            {statusMenuOpen && (
              <div
                className={`absolute z-50 rounded-xl border border-white/10 bg-ark-navy-900 shadow-2xl shadow-black/50 overflow-hidden min-w-[14rem] p-0 ${
                  collapsed ? 'left-full bottom-2 ml-2' : 'left-3 right-3 bottom-full mb-2'
                }`}
                role="menu"
              >
                {PRESENCE_OPTIONS.map(opt => {
                  const active = presence === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitem"
                      onClick={() => setPresenceStatus(opt.id)}
                      className={`w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-white/5 first:rounded-t-xl last:rounded-b-xl ${
                        active ? 'bg-white/[0.04]' : ''
                      }`}
                    >
                      <span className={`mt-1 shrink-0 h-3.5 w-3.5 rounded-full ${presenceDotClass(opt.id)}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-content-primary">{opt.label}</span>
                        {opt.hint && (
                          <span className="block text-[11px] text-content-tertiary leading-snug mt-0.5">{opt.hint}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {collapsed ? (
              <div className="flex flex-col items-center gap-1.5">
                {updateInfo?.newerAvailable && updateInfo.setupAssetUrl && updateInfo.latestTag ? (
                  <button
                    type="button"
                    onClick={startUpdateDownload}
                    disabled={updateBusy}
                    title={updateBusy ? 'Downloading update…' : `Update available (${updateInfo.latestTag})`}
                    aria-label="Update now"
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${
                      updateBusy
                        ? 'opacity-60 border-surface-border bg-ark-navy-900/80 text-content-tertiary'
                        : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setStatusMenuOpen(v => !v)}
                  title="Change status"
                  className={`w-9 h-9 rounded-xl border bg-ark-navy-900/80 flex items-center justify-center overflow-hidden hover:bg-surface-hover transition-colors ${presenceRingClass(presence)}`}
                  aria-label="Change status"
                  aria-expanded={statusMenuOpen}
                >
                  <NovaMark className={`w-4 h-4 ${presenceTextClass(presence)}`} title="NOVA" />
                </button>
                <button
                  type="button"
                  onClick={() => openSettings('account')}
                  title="Open Settings"
                  className="w-9 h-9 rounded-xl border border-surface-border bg-ark-navy-900/80 flex items-center justify-center text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                  aria-label="Open Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {updateInfo?.newerAvailable && updateInfo.setupAssetUrl && updateInfo.latestTag ? (
                  <button
                    type="button"
                    onClick={startUpdateDownload}
                    disabled={updateBusy}
                    className={`w-full flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                      updateBusy
                        ? 'opacity-70 border-surface-border bg-ark-navy-950/80 text-content-secondary'
                        : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15 hover:border-emerald-400/45'
                    }`}
                    title={updateBusy ? 'Downloading update…' : `Update to ${updateInfo.latestTag}`}
                    aria-label="Update now"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold leading-tight">
                        {updateBusy ? 'Downloading update…' : 'New update available'}
                      </span>
                      <span className="block text-[10px] text-emerald-300/80 truncate mt-0.5">
                        {updateBusy ? 'Stay in the app while it installs' : `Update now · ${updateInfo.latestTag}`}
                      </span>
                    </span>
                  </button>
                ) : null}
                <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-ark-navy-900 px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() => setStatusMenuOpen(v => !v)}
                    className={`w-8 h-8 shrink-0 rounded-lg bg-surface-hover border flex items-center justify-center text-sm font-semibold overflow-hidden ${presenceRingClass(presence)}`}
                    title="Change status"
                    aria-label="Change status"
                    aria-expanded={statusMenuOpen}
                  >
                    <NovaMark className={`w-4 h-4 ${presenceTextClass(presence)}`} title="NOVA" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusMenuOpen(v => !v)}
                    className="flex-1 min-w-0 text-left"
                    title="Change status"
                  >
                    <span className="block text-xs font-medium text-content-primary truncate">
                      {displayName}
                    </span>
                    {(profile?.ark_id || isArkDevEmail(user?.email)) ? (
                      <span className={`block text-[10px] font-mono tracking-[0.22em] truncate mt-0.5 ${presenceIdClass(presence)}`}>
                        {isArkDevEmail(user?.email)
                          ? 'DEV'
                          : formatArkId(profile!.ark_id!)}
                      </span>
                    ) : null}
                  </button>
                  {(profile?.ark_id || isArkDevEmail(user?.email)) ? (
                    <button
                      type="button"
                      className="p-1.5 rounded-lg shrink-0 text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
                      title="Copy your NOVA ID"
                      aria-label="Copy your NOVA ID"
                      onClick={() => {
                        const arkIdText = isArkDevEmail(user?.email)
                          ? 'DEV'
                          : formatArkId(profile?.ark_id || '');
                        void navigator.clipboard.writeText(arkIdText).catch(() => undefined);
                      }}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openSettings()}
                    title="Open Settings"
                    className="p-1.5 rounded-lg shrink-0 text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                    aria-label="Open Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
      </aside>

        <main className="relative z-10 flex-1 min-h-0 min-w-0 overflow-hidden m-2 ml-2 flex flex-col">
          <PostLoginSafetyTip />
          <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col h-full">
          {children}
          </div>
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
          onOpenSettings={(section) => openSettings(section || 'account')}
        />
      </Modal>

      <Modal
        isOpen={settingsOpen}
        onClose={closeSettings}
        title="Settings"
        size="settings"
      >
        <SettingsContent
          onClose={closeSettings}
          initialSection={settingsSection}
        />
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        hideHeader
        title={deleteTarget?.kind === 'project' ? 'Delete Code project?' : 'Delete chat?'}
      >
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-400/25 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4 text-rose-300" />
            </div>
            <div className="min-w-0 pt-0.5">
              <h2 className="text-base font-semibold text-content-primary tracking-tight">
                {deleteTarget?.kind === 'project' ? 'Delete Code project?' : 'Delete this chat?'}
              </h2>
              <p className="text-sm text-content-secondary leading-relaxed mt-2">
                {deleteTarget?.kind === 'project' ? (
                  <>
                    Remove{' '}
                    <span className="text-content-primary font-medium">“{deleteTarget.title}”</span>
                    {' '}from Recent.
                  </>
                ) : (
                  <>
                    Permanently remove{' '}
                    <span className="text-content-primary font-medium">“{deleteTarget?.title}”</span>
                    {' '}and its local conversation data on this PC. This can’t be undone.
                  </>
                )}
              </p>
              {deleteTarget?.kind === 'project' ? (
                <label className="mt-3 flex items-start gap-2 text-xs text-content-secondary">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={wipeProjectDisk}
                    onChange={(e) => setWipeProjectDisk(e.target.checked)}
                  />
                  <span>
                    Also delete this project’s files on disk. This cannot be undone.
                  </span>
                </label>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-7">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-full px-4 py-2 text-xs font-medium text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!deleteTarget) return;
                const id = deleteTarget.id;
                if (deleteTarget.kind === 'project') {
                  if (wipeProjectDisk) {
                    void window.arkDesktop?.projectDeleteFiles?.(id).catch(() => undefined);
                  }
                  removeRecent(id);
                  setDeleteTarget(null);
                  setWipeProjectDisk(false);
                  if (activeRecentId === id) navigate({ name: 'chat' });
                } else {
                  deleteChatForever(id);
                  setDeleteTarget(null);
                  if (activeChatId === id) navigate({ name: 'chat' });
                }
              }}
              className="rounded-full px-4 py-2 text-xs font-semibold bg-rose-500/90 text-white hover:bg-rose-500 transition-colors"
            >
              Delete forever
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
