import { type ReactNode } from 'react';
import { useRouter, type Route } from '@/context/RouterContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ArkLogo } from '@/components/branding/ArkLogo';
import {
  LayoutDashboard, FolderKanban, MessageSquare, Cpu, Boxes,
  Play, Settings, Search, Sun, Moon, LogOut, Zap,
} from 'lucide-react';

const NAV_ITEMS: { label: string; icon: React.ComponentType<{ className?: string }>; route: Route }[] = [
  { label: 'Dashboard', icon: LayoutDashboard, route: { name: 'dashboard' } },
  { label: 'Projects', icon: FolderKanban, route: { name: 'projects' } },
  { label: 'AI Chat', icon: MessageSquare, route: { name: 'chat' } },
  { label: 'Models', icon: Boxes, route: { name: 'models' } },
  { label: 'Build & Run', icon: Play, route: { name: 'build' } },
  { label: 'Local AI', icon: Cpu, route: { name: 'local-ai' } },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { route, navigate } = useRouter();
  const { user, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const isActive = (item: { route: Route; label: string }) => {
    if (item.route.name === 'projects' && route.name === 'project') return true;
    return route.name === item.route.name;
  };

  return (
    <div className="h-screen flex flex-col bg-ark-navy-950 overflow-hidden">
      {/* Top bar */}
      <header className="h-12 shrink-0 border-b border-surface-border flex items-center justify-between px-4 bg-ark-navy-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate({ name: 'dashboard' })} className="flex items-center gap-2.5">
            <ArkLogo size={24} showWordmark />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-tertiary" />
            <input
              type="text"
              placeholder="Search projects..."
              className="bg-ark-navy-800 border border-surface-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-content-primary placeholder:text-content-tertiary w-48 focus:outline-none focus:border-ark-blue-400 transition-colors"
            />
          </div>
          <button onClick={toggleTheme} className="ark-btn-ghost !p-2" title="Toggle theme">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={() => navigate({ name: 'settings' })} className="ark-btn-ghost !p-2" title="Settings">
            <Settings className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-surface-border mx-1" />
          <div className="flex items-center gap-2 px-2">
            <div className="w-7 h-7 rounded-full bg-ark-blue-500/20 border border-ark-blue-500/30 flex items-center justify-center text-xs font-semibold text-ark-blue-300">
              {(profile?.display_name ?? user?.email ?? '?')[0].toUpperCase()}
            </div>
            <span className="text-xs text-content-secondary hidden sm:block max-w-[120px] truncate">
              {profile?.display_name ?? user?.email?.split('@')[0]}
            </span>
          </div>
          <button onClick={signOut} className="ark-btn-ghost !p-2" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-surface-border bg-ark-navy-900/30 flex flex-col p-3">
          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map(item => {
              const active = isActive(item);
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.route)}
                  className={`ark-nav-item ${active ? 'active' : ''}`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto pt-3 border-t border-surface-border">
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-content-tertiary">
              <div className="w-1.5 h-1.5 rounded-full bg-ark-accent-green animate-pulse-soft" />
              <span>Local AI Ready</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-content-tertiary">
              <Zap className="w-3 h-3 text-ark-blue-400" />
              <span>ARK AI · Optimizing</span>
            </div>
          </div>
        </aside>

        {/* Content area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Bottom status bar */}
      <footer className="h-7 shrink-0 border-t border-surface-border bg-ark-navy-900/50 flex items-center justify-between px-4 text-2xs text-content-tertiary">
        <div className="flex items-center gap-4">
          <span>Build: Idle</span>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-ark-accent-green" />
            Local AI: Ready
          </span>
          <span>Provider: Optimized</span>
        </div>
        <div className="flex items-center gap-4">
          <span>ARK v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}
