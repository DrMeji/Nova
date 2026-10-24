import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, type Route } from '@/context/RouterContext';
import {
  Settings, Search, History,
  Trash2,
  Globe, Download, Brain, PackageOpen,
} from 'lucide-react';
import {
  IconChatAi,
  IconProject,
  IconAgents,
  IconPlugins,
  IconModelsCpuAi,
  IconLocalAi,
  IconMcp,
  IconAutomations,
  IconIntegrations,
  IconNotifications,
  IconMessage,
  IconTestDevice,
} from '@/components/NavIcons';
import { GlobalHelpHost } from '@/components/GlobalHelpHost';
import { Modal } from './Modal';
import { SettingsContent } from './SettingsContent';
import { SearchPanel } from './SearchPanel';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { useAuth } from '@/context/AuthContext';
import { isSocialParked, isVmParked } from '@/lib/featurePark';
import { useSocial } from '@/context/SocialContext';
import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';
import {
  PRESENCE_OPTIONS,
  PRESENCE_UI_ENABLED,
  presenceDotClass,
  presenceRingClass,
  type PresenceStatus,
} from '@/lib/presenceStatus';
import { probeLiveCapacity, type LiveCapacity } from '@/lib/novaCapacity';
import { probeAiModeLabel, type AiModeLabel } from '@/lib/aiModeStatus';
import { JobsStrip } from '@/components/JobsStrip';
import { PostLoginSafetyTip } from '@/components/PostLoginSafetyTip';
import { AuthAmbientOrbs } from '@/components/auth/AuthAmbientOrbs';
import { useIdleGhostChrome } from '@/hooks/useIdleGhostChrome';
import { useTheme } from '@/context/ThemeContext';
import { isNovaDevEmail } from '@/lib/novaDevAccount';
import {
  clearActivity,
  getActivityFlags,
  getDoneChatIds,
  setActivityViewing,
  subscribeActivity,
  type ActivityKey,
} from '@/lib/activityIndicators';
import {
  listInflightChatIds,
  subscribeChatInflight,
} from '@/lib/chatInflight';
import { reattachEngineDownloads } from '@/lib/engineDownloads';
import { countUnreadLocalNotifications } from '@/lib/localNotifications';
import {
  countMissingOpen,
  loadMissingPlaced,
  MISSING_ITEMS,
  placeAllMissingHomesOnce,
  saveMissingPlaced,
} from '@/lib/missingItemsCatalog';
import { ensureHomeControlDefaultsOn } from '@/components/HomeControlsPanel';
import { ARK_UPDATE_INDICATOR_CACHE_KEY, checkArkGitHubUpdate, clearUpdateIndicatorCache, downloadAndInstallArkUpdate, type ArkUpdateInfo } from '@/lib/novaUpdates';

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
        { label: 'Chat', icon: IconChatAi, route: { name: 'chat' }, activity: 'chat' },
      ],
    },
    {
      id: 'work',
      label: 'Work',
      items: [
        { label: 'Projects', icon: IconProject, route: { name: 'projects' as const } },
        { label: 'History', icon: History, route: { name: 'dashboard' as const } },
      ],
    },
    {
      id: 'tools',
      label: 'Tools',
      items: [
        { label: 'Agents', icon: IconAgents, route: { name: 'agents' } },
        { label: 'Plugins', icon: IconPlugins, route: { name: 'build' }, activity: 'plugins' },
        { label: 'Models', icon: IconModelsCpuAi, route: { name: 'models' }, activity: 'models' },
        { label: 'Local AI', icon: IconLocalAi, route: { name: 'local-ai' } },
        { label: 'MCP', icon: IconMcp, route: { name: 'mcp' } },
        { label: 'Automations', icon: IconAutomations, route: { name: 'automations' } },
        { label: 'Integrations', icon: IconIntegrations, route: { name: 'integrations' } },
        { label: 'Test device', icon: IconTestDevice, route: { name: 'test-device' }, comingSoon: isVmParked() },
        { label: 'Brain', icon: BrainNavIcon, route: { name: 'brain' } },
      ],
    },
    {
      id: 'connect',
      label: 'Connect',
      items: [
        { label: 'Networking', icon: Globe, route: { name: 'networking' }, activity: 'networking', comingSoon: isSocialParked('networking') },
        { label: 'Message', icon: IconMessage, route: { name: 'message' }, activity: 'message', comingSoon: isSocialParked('message') },
        { label: 'Notifications', icon: IconNotifications, route: { name: 'notifications' }, activity: 'notifications' },
        { label: 'Missing items', icon: PackageOpen, route: { name: 'missing-items' } },
      ],
    },
  ];
}

export function AppShell({ children }: { children: ReactNode }) {
  const { route, navigate } = useRouter();
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const { deleteChatForever, removeRecent } = useRecentProjects();
  /** Moving color orbs only in Fun — Dark / Light / Gray stay still. */
  const hideOrbs = theme !== 'fun';
  /** Hover-expanded main nav. Collapsed by default; no sticky toggle. */
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverLeaveTimer = useRef<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('account');
  const [searchOpen, setSearchOpen] = useState(false);
  const [prefsName, setPrefsName] = useState(() => getLocalPrefs().displayName);
  const [presence, setPresence] = useState<PresenceStatus>(() => getLocalPrefs().presenceStatus || 'online');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuOpenRef = useRef(false);
  statusMenuOpenRef.current = statusMenuOpen;
  const collapsed = !hoverOpen;
  const [, setCapacity] = useState<LiveCapacity | null>(null);
  const [, setModeLabel] = useState<AiModeLabel | null>(null);
  const [updateInfo, setUpdateInfo] = useState<ArkUpdateInfo | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; kind: 'chat' | 'project' } | null>(null);
  const [wipeProjectDisk, setWipeProjectDisk] = useState(true);
  const [activity, setActivity] = useState(() => ({ ...getActivityFlags() }));
  const [, setDoneChats] = useState(() => new Set(getDoneChatIds()));
  const [, setInflightChats] = useState(() => new Set(listInflightChatIds()));
  const [navTick, setNavTick] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [missingOpen, setMissingOpen] = useState(() => countMissingOpen());
  const { unreadFrom } = useSocial();
  const myNovaIdForNotifs = isNovaDevEmail(user?.email) ? 'DEV' : (profile?.nova_id || undefined);

  useEffect(() => {
    const onFeat = () => setNavTick(t => t + 1);
    window.addEventListener('NOVA:features-changed', onFeat);
    return () => window.removeEventListener('NOVA:features-changed', onFeat);
  }, []);

  // All Missing-item controls now have mounted homes — mark Placed once.
  useEffect(() => {
    placeAllMissingHomesOnce();
    // Code helpers On by default without cluttering the Code pill (Agents · helper suites).
    ensureHomeControlDefaultsOn('code-header');
    setMissingOpen(countMissingOpen());
  }, []);

  const voiceFocus = route.name === 'chat' && route.mode === 'voice';
  const railGhost = useIdleGhostChrome({
    idleMs: 5000,
    ghostOpacity: 0.26,
    // Keep full opacity while Voice hides the rail entirely.
    enabled: !voiceFocus,
  });

  // Keep ambient orbs in sync when leaving/entering Voice (sidebar hops, etc.).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('NOVA:voice-visual', {
      detail: { mode: voiceFocus ? 'voice' : 'chat' },
    }));
  }, [route, voiceFocus]);

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
    const sync = () => setInflightChats(new Set(listInflightChatIds()));
    sync();
    return subscribeChatInflight(sync);
  }, []);

  useEffect(() => {
    const bump = () => setNotifUnread(countUnreadLocalNotifications(myNovaIdForNotifs));
    bump();
    window.addEventListener('NOVA:local-notifications', bump);
    return () => window.removeEventListener('NOVA:local-notifications', bump);
  }, [myNovaIdForNotifs]);

  useEffect(() => {
    const bump = () => setMissingOpen(countMissingOpen());
    bump();
    window.addEventListener('NOVA:missing-items-changed', bump);
    return () => window.removeEventListener('NOVA:missing-items-changed', bump);
  }, []);

  // Homes now exist — mark catalog rows Placed so Missing items tracks deepen-work, not parking.
  useEffect(() => {
    const SEED = 'NOVA:missing-homes-seeded-v2';
    try {
      if (localStorage.getItem(SEED)) return;
      const placed = loadMissingPlaced();
      for (const item of MISSING_ITEMS) {
        if (item.id === 'missing-items-nav') continue;
        placed.add(item.id);
      }
      saveMissingPlaced(placed);
      localStorage.setItem(SEED, '1');
      setMissingOpen(countMissingOpen());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onPrefs = () => {
      const next = getLocalPrefs();
      setPrefsName(next.displayName);
      setPresence(next.presenceStatus || 'online');
    };
    window.addEventListener('nova:prefs-changed', onPrefs);
    return () => window.removeEventListener('nova:prefs-changed', onPrefs);
  }, []);

  const clearHoverLeave = () => {
    if (hoverLeaveTimer.current != null) {
      window.clearTimeout(hoverLeaveTimer.current);
      hoverLeaveTimer.current = null;
    }
  };

  const openSidebarHover = () => {
    clearHoverLeave();
    setHoverOpen(true);
  };

  const scheduleSidebarClose = () => {
    clearHoverLeave();
    // Short leave delay — long enough to cross nested buttons, short enough to retract.
    hoverLeaveTimer.current = window.setTimeout(() => {
      hoverLeaveTimer.current = null;
      // Keep open while the presence menu is up so the user can pick a status.
      if (statusMenuOpenRef.current) return;
      setHoverOpen(false);
    }, 90);
  };

  useEffect(() => {
    return () => clearHoverLeave();
  }, []);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-status-menu]')) return;
      setStatusMenuOpen(false);
      setHoverOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStatusMenuOpen(false);
        setHoverOpen(false);
      }
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
    void window.novaDesktop?.postUpdateConsume?.().then((res) => {
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

  void prefsName; // kept in sync for prefs listeners; sidebar shows GitHub handle only

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
    if (item.label === 'Agents') {
      return route.name === 'agents';
    }
    if (item.label === 'Automations') {
      return route.name === 'automations';
    }
    if (item.label === 'Integrations') {
      return route.name === 'integrations';
    }
    if (item.label === 'Settings') {
      return settingsOpen;
    }
    return route.name === item.route.name;
  };

  const activeRecentId = route.name === 'project' ? route.id : null;
  const activeChatId = route.name === 'chat' ? route.chatId ?? null : null;

  const openSettings = (section = 'account') => {
    setSearchOpen(false);
    setStatusMenuOpen(false);
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
  };

  // Legacy full-page Settings route → restore click-outside modal.
  useEffect(() => {
    if (route.name !== 'settings') return;
    setSettingsSection(route.section || 'account');
    setSettingsOpen(true);
    navigate({ name: 'chat' });
  }, [route, navigate]);

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
    window.addEventListener('nova:prefs-changed', refresh);
    window.addEventListener('NOVA:engine-models-changed', refresh);
    return () => {
      alive = false;
      window.removeEventListener('nova:prefs-changed', refresh);
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
      const currentVersion = await window.novaDesktop?.appMeta?.().then((m) => m?.version).catch(() => undefined);
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
    const unsub = window.novaDesktop?.onUpdateProgress?.((payload) => {
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

  const handleNavClick = (item: { label: string; route?: Route; activity?: ActivityKey; comingSoon?: boolean }) => {
    if (item.comingSoon) {
      // Parked — visible with Soon, but not navigable.
      return;
    }
    if (item.activity) clearActivity(item.activity);
    if (item.label === 'Settings') {
      openSettings('account');
      return;
    }
    if (item.label === 'Chat') {
      navigate({ name: 'chat' });
      return;
    }
    if (item.route) navigate(item.route);
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
    const isMissingItems = item.label === 'Missing items';
    const notifAttention = isNotifications && (notifUnread > 0 || Boolean(activity.notifications));
    const missingAttention = isMissingItems && missingOpen > 0;
    const busy = Boolean(item.activity && activity[item.activity]) && !notifAttention;
    const unreadCount = item.label === 'Message' && !item.comingSoon && !isSocialParked('message')
      ? unreadFrom.length
      : 0;
    const attention = notifAttention || missingAttention || busy || unreadCount > 0;
    if (item.comingSoon) {
      return (
        <button
          key={item.label}
          type="button"
          disabled
          aria-disabled="true"
          aria-label={`${item.label} (coming soon)`}
          title={`${item.label} · Coming Soon`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className={`nova-nav-item w-full opacity-55 cursor-not-allowed pointer-events-none ${collapsed ? 'nova-nav-item-rail' : ''}`}
        >
          <span className="nova-nav-icon">
            <item.icon />
          </span>
          <span className={`flex-1 min-w-0 text-left truncate nova-nav-label ${collapsed ? 'nova-nav-label-hide' : ''}`}>
            {item.label}
          </span>
          <span className={`shrink-0 mr-1.5 text-[10px] uppercase tracking-wide text-content-tertiary nova-nav-label ${collapsed ? 'nova-nav-label-hide' : ''}`}>
            Soon
          </span>
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
            : isMissingItems && missingOpen > 0
              ? `Missing items (${missingOpen} open)`
              : item.label
        }
        onClick={() => handleNavClick(item)}
        title={collapsed ? item.label : undefined}
        className={`nova-nav-item w-full relative ${collapsed ? 'nova-nav-item-rail' : ''} ${active ? 'active' : ''} ${
          attention && !active ? 'nova-nav-attention' : ''
        }`}
      >
        <span className={`nova-nav-icon ${missingAttention ? 'text-amber-400' : attention ? 'text-sky-400' : ''}`}>
          <item.icon />
        </span>
        <span className={`truncate nova-nav-label ${collapsed ? 'nova-nav-label-hide' : ''} ${
          missingAttention ? 'text-amber-200' : attention ? 'text-sky-300' : ''
        }`}>
          {item.label}
        </span>
        {unreadCount > 0 ? (
          <span className={`text-[10px] font-semibold tabular-nums text-sky-300 nova-nav-label ${collapsed ? 'nova-nav-label-hide' : ''}`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
        {isMissingItems && missingOpen > 0 ? (
          <span className={`text-[10px] font-semibold tabular-nums text-amber-300 nova-nav-label ${collapsed ? 'nova-nav-label-hide' : ''}`}>
            {missingOpen > 99 ? '99+' : missingOpen}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="h-full min-w-0 flex overflow-hidden relative bg-nova-navy-950">
      {!hideOrbs ? <AuthAmbientOrbs variant="app" /> : null}
      {/* Left edge tab — vertically centered; hover widens labels without moving icons */}
      {!voiceFocus ? (
      <div
        className="relative z-10 shrink-0 mr-2 flex items-center self-stretch"
        style={railGhost.style}
        {...railGhost.bind}
      >
      <div className="relative flex flex-col min-w-0 my-auto">
        <div className="absolute bottom-full left-0 right-0 mb-1.5 flex flex-col items-center gap-1 pointer-events-auto z-20">
          <JobsStrip variant="sidebar" collapsed />
          {updateInfo?.newerAvailable && updateInfo?.setupAssetUrl && updateInfo?.latestTag ? (
            <button
              type="button"
              onClick={startUpdateDownload}
              disabled={updateBusy}
              title={updateBusy ? 'Downloading update…' : `Update available (${updateInfo?.latestTag})`}
              aria-label="Update now"
              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-colors ${
                updateBusy
                  ? 'opacity-60 border-surface-border bg-nova-navy-900/80 text-content-tertiary'
                  : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      <aside
        className={`nova-sidebar-edge nova-sidebar-bare nova-sidebar-fit flex flex-col min-w-0 overflow-hidden nova-sidebar-panel ${
          collapsed ? 'is-collapsed' : ''
        }`}
        onMouseEnter={() => { railGhost.bump(); openSidebarHover(); }}
        onMouseLeave={scheduleSidebarClose}
      >
          <nav className="nova-nav-flat flex flex-col" aria-label="Main">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={`nova-nav-item w-full ${collapsed ? 'nova-nav-item-rail' : ''}`}
              title="Search (Ctrl+K)"
              aria-label="Search"
            >
              <span className="nova-nav-icon">
                <Search />
              </span>
              <span className={`nova-nav-label ${collapsed ? 'nova-nav-label-hide' : ''}`}>
                Search
              </span>
            </button>
            {NAV_GROUPS.flatMap((group) => group.items.map((item) => renderNavItem(item)))}
            <span className="nova-nav-flat-rule" aria-hidden />
            {renderNavItem({
              label: 'Settings',
              icon: Settings,
              route: { name: 'settings' },
            })}
          </nav>
      </aside>
      </div>
      </div>
      ) : null}

        <main className={`relative z-10 flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col ${
          voiceFocus ? 'm-0' : 'm-2'
        }`}>
          <PostLoginSafetyTip />
          <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col h-full">
          {children}
          </div>
        </main>

      <GlobalHelpHost />

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
                    Permanently delete this project’s files from this PC (recommended). Uncheck to only remove it from Recent.
                  </span>
                </label>
              ) : (
                <p className="mt-3 text-xs text-content-tertiary leading-relaxed">
                  Linked project folders and media for this chat are removed from this PC when you delete forever.
                </p>
              )}
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
                const kind = deleteTarget.kind;
                const wipeDisk = wipeProjectDisk;
                const goChat = kind === 'project'
                  ? activeRecentId === id
                  : activeChatId === id;
                // Close dialog first so backdrop cannot block the composer.
                setDeleteTarget(null);
                setWipeProjectDisk(true);
                window.setTimeout(() => {
                  if (kind === 'project') {
                    if (wipeDisk) {
                      void window.novaDesktop?.projectDeleteFiles?.(id).catch(() => undefined);
                    }
                    removeRecent(id);
                  } else {
                    deleteChatForever(id);
                  }
                  if (goChat) navigate({ name: 'chat' });
                }, 0);
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
