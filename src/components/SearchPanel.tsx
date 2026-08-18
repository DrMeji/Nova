import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Search, Clock3, Settings, Briefcase, Database, Bot, Blocks, SquarePen, ArrowLeft,
} from 'lucide-react';
import { useRouter, type Route } from '@/context/RouterContext';

type SearchItem = {
  id: string;
  label: string;
  group: 'History' | 'Settings' | 'Navigate';
  description: string;
  icon: ComponentType<{ className?: string }>;
  route?: Route;
  action?: 'settings';
};

const CATALOG: SearchItem[] = [
  { id: 'new-chat', label: 'New Chat', group: 'Navigate', description: 'General chat tab', icon: SquarePen, route: { name: 'chat' } },
  { id: 'projects', label: 'Projects', group: 'Navigate', description: 'Browse your projects', icon: Briefcase, route: { name: 'projects' } },
  { id: 'history', label: 'History', group: 'Navigate', description: 'Recent work and prompts', icon: Clock3, route: { name: 'dashboard' } },
  { id: 'plugins', label: 'Plugins', group: 'Navigate', description: 'Integrations and tools', icon: Blocks, route: { name: 'build' } },
  { id: 'models', label: 'Models', group: 'Navigate', description: 'Local and cloud models', icon: Database, route: { name: 'models' } },
  { id: 'local-ai', label: 'Local AI', group: 'Navigate', description: 'Built-in local AI engine', icon: Bot, route: { name: 'local-ai' } },
  { id: 'settings', label: 'Settings', group: 'Settings', description: 'Account, appearance, AI preferences', icon: Settings, action: 'settings' },
  { id: 'appearance', label: 'Appearance', group: 'Settings', description: 'Theme and display options', icon: Settings, action: 'settings' },
  { id: 'providers', label: 'Providers', group: 'Settings', description: 'Cloud AI connections', icon: Settings, action: 'settings' },
];

interface SearchPanelProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

export function SearchPanel({ onClose, onOpenSettings }: SearchPanelProps) {
  const { navigate } = useRouter();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATALOG;
    return CATALOG.filter(
      item =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q),
    );
  }, [query]);

  const historyItems = results.filter(item => item.group === 'Navigate' || item.group === 'History');
  const settingsItems = results.filter(item => item.group === 'Settings');

  const runItem = (item: SearchItem) => {
    if (item.action === 'settings') {
      onClose();
      onOpenSettings();
      return;
    }
    if (item.route) {
      navigate(item.route);
      onClose();
    }
  };

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
              placeholder="Search projects, models, settings..."
              className="flex-1 bg-transparent border-none text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3 min-h-0">
        {!query && (
          <p className="px-2 pb-2 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
            History
          </p>
        )}

        {results.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-sm text-content-secondary">No results</p>
            <p className="text-xs text-content-tertiary mt-1">Try a project name, model, or setting</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(query ? [{ title: 'Results', items: results }] : [
              { title: 'History', items: historyItems },
              { title: 'Settings', items: settingsItems },
            ]).map(section =>
              section.items.length === 0 ? null : (
                <div key={section.title}>
                  {query && (
                    <p className="px-2 pb-2 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
                      {section.title}
                    </p>
                  )}
                  {!query && section.title !== 'History' && (
                    <p className="px-2 pb-2 pt-1 text-[10px] uppercase tracking-wider text-content-tertiary font-semibold">
                      {section.title}
                    </p>
                  )}
                  <div className="flex flex-col gap-0.5">
                    {section.items.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => runItem(item)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left hover:bg-surface-hover transition-colors"
                      >
                        <span className="w-8 h-8 rounded-lg border border-surface-border bg-surface-hover/50 flex items-center justify-center shrink-0">
                          <item.icon className="w-4 h-4 text-content-secondary" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-content-primary truncate">{item.label}</span>
                          <span className="block text-xs text-content-tertiary truncate">{item.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
