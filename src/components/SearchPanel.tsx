import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import {
  Search, Clock3, Settings, Briefcase, Database, Bot, Blocks, SquarePen, ArrowLeft,
  ImageIcon, Video, MessageSquare, Globe, Bell, Mic, Cable,
} from 'lucide-react';
import { useRouter, type Route } from '@/context/RouterContext';
import { useRecentProjects } from '@/context/RecentProjectsContext';
import { CLOUD_MODELS } from '@/views/ModelsView';
import {
  isRevealed,
  isTestersSettingsEnabled,
  isVideoTabEnabled,
  isVoiceTabEnabled,
} from '@/lib/featurePark';
import { getEngineStatus } from '@/lib/arkEngine';

type SearchItem = {
  id: string;
  label: string;
  group: 'Recent' | 'Settings' | 'Navigate' | 'Models';
  description: string;
  icon: ComponentType<{ className?: string }>;
  route?: Route;
  action?: 'settings';
  settingsSection?: string;
};

const CATALOG: SearchItem[] = [
  { id: 'new-chat', label: 'Chat', group: 'Navigate', description: 'Start a conversation', icon: SquarePen, route: { name: 'chat' } },
  { id: 'image', label: 'Image', group: 'Navigate', description: 'Generate a picture', icon: ImageIcon, route: { name: 'chat', mode: 'image' } },
  { id: 'video', label: 'Video', group: 'Navigate', description: 'Generate a short clip', icon: Video, route: { name: 'chat', mode: 'video' } },
  { id: 'voice', label: 'Voice', group: 'Navigate', description: 'Talk with ARK (conversation only) · soon', icon: Mic, route: { name: 'chat', mode: 'voice' } },
  { id: 'projects', label: 'Projects', group: 'Navigate', description: 'Browse your projects', icon: Briefcase, route: { name: 'projects' } },
  { id: 'history', label: 'History', group: 'Navigate', description: 'Recent chats and creations', icon: Clock3, route: { name: 'dashboard' } },
  { id: 'plugins', label: 'Plugins', group: 'Navigate', description: 'Integrations and tools', icon: Blocks, route: { name: 'build' } },
  { id: 'models', label: 'Models', group: 'Navigate', description: 'Local, cloud, and engine', icon: Database, route: { name: 'models' } },
  { id: 'local-ai', label: 'Engine', group: 'Navigate', description: 'ARK Engine start, stop, and storage', icon: Bot, route: { name: 'local-ai' } },
  { id: 'mcp', label: 'MCP', group: 'Navigate', description: 'Register external MCP tool servers', icon: Cable, route: { name: 'mcp' } },
  { id: 'settings', label: 'Settings', group: 'Settings', description: 'Account, appearance, AI preferences', icon: Settings, action: 'settings', settingsSection: 'account' },
  { id: 'appearance', label: 'Appearance', group: 'Settings', description: 'Theme and display options', icon: Settings, action: 'settings', settingsSection: 'appearance' },
  { id: 'ai', label: 'AI', group: 'Settings', description: 'Routing and failover', icon: Settings, action: 'settings', settingsSection: 'ai' },
  { id: 'providers', label: 'Providers', group: 'Settings', description: 'Cloud AI connections', icon: Settings, action: 'settings', settingsSection: 'providers' },
  { id: 'privacy', label: 'Privacy', group: 'Settings', description: 'What stays on this PC', icon: Settings, action: 'settings', settingsSection: 'privacy' },
  { id: 'security', label: 'Security', group: 'Settings', description: 'PIN, auto-lock, sandbox', icon: Settings, action: 'settings', settingsSection: 'security' },
  { id: 'updates', label: 'Updates', group: 'Settings', description: 'Check for new ARK builds', icon: Settings, action: 'settings', settingsSection: 'updates' },
  { id: 'testers', label: 'Testers', group: 'Settings', description: 'Reveal parked features, feedback', icon: Settings, action: 'settings', settingsSection: 'testers' },
];

function navigateCatalog(): SearchItem[] {
  return CATALOG.filter(item => {
    if (item.id === 'video' && !isVideoTabEnabled()) return false;
    if (item.id === 'voice' && !isVoiceTabEnabled()) return false;
    if (item.id === 'testers' && !isTestersSettingsEnabled()) return false;
    return true;
  });
}

function socialSearchItems(): SearchItem[] {
  const items: SearchItem[] = [];
  if (isRevealed('networking')) {
    items.push({ id: 'networking', label: 'Networking', group: 'Navigate', description: 'Contacts and social feed', icon: Globe, route: { name: 'networking' } });
  }
  if (isRevealed('message')) {
    items.push({ id: 'message', label: 'Message', group: 'Navigate', description: 'Direct messages', icon: MessageSquare, route: { name: 'message' } });
  }
  items.push({ id: 'notifications', label: 'Notifications', group: 'Navigate', description: 'Updates, friends, and downloads', icon: Bell, route: { name: 'notifications' } });
  return items;
}

interface SearchPanelProps {
  onClose: () => void;
  onOpenSettings: (section?: string) => void;
}

export function SearchPanel({ onClose, onOpenSettings }: SearchPanelProps) {
  const { navigate } = useRouter();
  const { recent, chats, creations } = useRecentProjects();
  const [query, setQuery] = useState('');
  const [featureTick, setFeatureTick] = useState(0);
  const [selected, setSelected] = useState(0);
  const [localModels, setLocalModels] = useState<{ id: string; name: string; detail: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onFeat = () => setFeatureTick(t => t + 1);
    window.addEventListener('ark:features-changed', onFeat);
    return () => window.removeEventListener('ark:features-changed', onFeat);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    void getEngineStatus()
      .then(status => {
        const ready = (status.models || []).filter(m => m.status === 'ready');
        setLocalModels(ready.map(m => ({ id: m.id, name: m.name, detail: m.detail || 'Installed on this PC' })));
      })
      .catch(() => undefined);
  }, []);

  const liveItems = useMemo<SearchItem[]>(() => {
    void featureTick;
    const recents: SearchItem[] = [
      ...chats.filter(c => !c.archivedAt).slice(0, 12).map(c => ({
        id: `chat:${c.id}`,
        label: c.title || 'Chat',
        group: 'Recent' as const,
        description: c.mode === 'image' ? 'Image chat' : c.mode === 'video' ? 'Video chat' : 'Chat',
        icon: c.mode === 'image' ? ImageIcon : c.mode === 'video' ? Video : MessageSquare,
        route: {
          name: 'chat' as const,
          mode: c.mode === 'general' ? undefined : c.mode,
          chatId: c.id,
        },
      })),
      ...recent.slice(0, 8).map(p => ({
        id: `project:${p.id}`,
        label: p.name,
        group: 'Recent' as const,
        description: 'Project',
        icon: Briefcase,
        route: { name: 'project' as const, id: p.id },
      })),
      ...creations.slice(0, 8).map(c => ({
        id: `creation:${c.id}`,
        label: c.title || c.prompt || 'Creation',
        group: 'Recent' as const,
        description: c.kind === 'video' ? 'Video' : 'Image',
        icon: c.kind === 'video' ? Video : ImageIcon,
        route: { name: 'creation' as const, id: c.id },
      })),
    ];
    return [...recents, ...navigateCatalog(), ...socialSearchItems()];
  }, [chats, recent, creations, featureTick]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cloudHits: SearchItem[] = q
      ? CLOUD_MODELS
        .filter(m =>
          m.name.toLowerCase().includes(q)
          || m.provider.toLowerCase().includes(q)
          || m.id.toLowerCase().includes(q)
          || m.description.toLowerCase().includes(q),
        )
        .slice(0, 8)
        .map(m => ({
          id: `cloud:${m.id}`,
          label: m.name,
          group: 'Models' as const,
          description: `${m.provider} · ${m.category}`,
          icon: Database,
          route: { name: 'models' as const },
        }))
      : [];
    const localHits: SearchItem[] = (q ? localModels : localModels.slice(0, 4))
      .filter(m => !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .slice(0, 8)
      .map(m => ({
        id: `local:${m.id}`,
        label: m.name,
        group: 'Models' as const,
        description: `Installed · ${m.detail}`,
        icon: Bot,
        route: { name: 'local-ai' as const },
      }));
    if (!q) return [...liveItems, ...localHits];
    const hits = liveItems.filter(
      item =>
        item.label.toLowerCase().includes(q)
        || item.description.toLowerCase().includes(q)
        || item.group.toLowerCase().includes(q),
    );
    return [...hits, ...localHits, ...cloudHits];
  }, [query, liveItems, localModels]);

  const recentItems = results.filter(item => item.group === 'Recent');
  const navigateItems = results.filter(item => item.group === 'Navigate');
  const settingsItems = results.filter(item => item.group === 'Settings');
  const modelItems = results.filter(item => item.group === 'Models');

  const sections = query.trim()
    ? [{ title: 'Results', items: results }]
    : [
        { title: 'Recent', items: recentItems },
        { title: 'Go to', items: navigateItems },
        { title: 'Models', items: modelItems },
        { title: 'Settings', items: settingsItems },
      ];
  const flat = sections.flatMap(s => s.items);

  useEffect(() => {
    setSelected(0);
  }, [query, flat.length]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const runItem = (item: SearchItem) => {
    if (item.action === 'settings') {
      onClose();
      onOpenSettings(item.settingsSection);
      return;
    }
    if (item.route) {
      navigate(item.route);
      onClose();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(i => Math.min(flat.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[selected];
      if (item) runItem(item);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const renderItem = (item: SearchItem, index: number) => (
    <button
      key={item.id}
      type="button"
      ref={selected === index ? selectedRef : undefined}
      onClick={() => runItem(item)}
      onMouseEnter={() => setSelected(index)}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors ${
        selected === index ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      }`}
    >
      <span className="w-8 h-8 rounded-lg border border-surface-border bg-surface-hover/50 flex items-center justify-center shrink-0">
        <item.icon className="w-4 h-4 text-content-secondary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-content-primary truncate">{item.label}</span>
        <span className="block text-xs text-content-tertiary truncate">{item.description}</span>
      </span>
    </button>
  );

  let runningIndex = 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-surface-border bg-surface-hover/60 hover:bg-surface-hover flex items-center justify-center text-content-secondary hover:text-content-primary transition-colors shrink-0"
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-surface-border bg-ark-navy-950/80 px-3.5 py-2.5">
            <Search className="w-4 h-4 text-content-tertiary shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Go to chat, project, model, or setting…"
              className="flex-1 bg-transparent border-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none"
            />
            <span className="text-[10px] text-content-tertiary shrink-0 hidden sm:inline">Ctrl+K · ↑↓ Enter</span>
          </div>
        </div>
        <p className="px-12 pt-2 text-[10px] text-content-tertiary">
          App search is Ctrl+K. In Code, Ctrl+F finds in project files.
        </p>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3 min-h-0">
        {results.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-sm text-content-secondary">No results</p>
            <p className="text-xs text-content-tertiary mt-1">Try a chat, project, model, or setting</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map(section => {
              if (section.items.length === 0) return null;
              const start = runningIndex;
              runningIndex += section.items.length;
              return (
                <div key={section.title}>
                  <p className="px-2 pb-2 pt-1 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
                    {section.title}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {section.items.map((item, i) => renderItem(item, start + i))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
