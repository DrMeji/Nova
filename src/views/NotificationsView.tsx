import { useEffect, useMemo, useState } from 'react';
import {
  Bell, Download, Flag, Search, Sparkles, UserPlus, RefreshCw,
} from 'lucide-react';
import { buildDemoNotifications, type DemoNotification } from '@/lib/socialDemo';
import { loadLocalNotifications, type LocalNotification } from '@/lib/localNotifications';

type Notice = DemoNotification | LocalNotification;

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.max(0, Math.floor(ms / 3600_000));
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function kindIcon(kind: Notice['kind']) {
  if (kind === 'friend') return UserPlus;
  if (kind === 'update') return RefreshCw;
  if (kind === 'model') return Download;
  if (kind === 'report') return Flag;
  return Sparkles;
}

export function NotificationsView() {
  const [query, setQuery] = useState('');
  const [localTick, setLocalTick] = useState(0);
  const demos = useMemo(() => buildDemoNotifications(), []);
  const local = useMemo(() => loadLocalNotifications(), [localTick]);

  useEffect(() => {
    const bump = () => setLocalTick(t => t + 1);
    window.addEventListener('ark:local-notifications', bump);
    return () => window.removeEventListener('ark:local-notifications', bump);
  }, []);

  const all = useMemo(() => {
    return [...local, ...demos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [local, demos]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(n => `${n.title} ${n.body}`.toLowerCase().includes(q));
  }, [all, query]);

  return (
    <div className="h-full box-border p-4 animate-fade-in bg-ark-navy-950">
      <div className="h-full min-h-0 flex flex-col rounded-2xl border border-surface-border bg-ark-navy-900/55 shadow-[0_8px_32px_rgba(0,0,0,0.35)] overflow-hidden">
        <div className="shrink-0 px-5 sm:px-8 pt-5 pb-3">
          <div className="mt-3 flex items-center justify-center">
            <div className="h-10 w-56 flex items-center gap-2 rounded-full bg-ark-navy-950/70 border border-white/10 px-3">
              <Search className="w-3.5 h-3.5 text-content-tertiary shrink-0" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search"
                className="flex-1 min-w-0 bg-transparent text-sm text-content-primary outline-none placeholder:text-content-tertiary"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 pb-6">
          <div className="w-full max-w-2xl mx-auto space-y-2">
            {shown.length === 0 ? (
              <div className="text-center py-16 text-content-tertiary">
                <Bell className="w-6 h-6 mx-auto mb-2 opacity-70" />
                <p className="text-sm">No notifications match that search.</p>
              </div>
            ) : (
              shown.map(n => {
                const Icon = kindIcon(n.kind);
                return (
                  <div
                    key={n.id}
                    className={`rounded-2xl border px-4 py-3.5 flex items-start gap-3 ${
                      n.unread
                        ? 'border-sky-500/25 bg-ark-navy-900/70'
                        : 'border-surface-border bg-ark-navy-900/40'
                    }`}
                  >
                    <span className="h-10 w-10 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-content-secondary">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-content-primary truncate">{n.title}</p>
                        {n.unread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" aria-hidden />
                        )}
                      </div>
                      <p className="text-xs text-content-secondary mt-1 leading-relaxed">{n.body}</p>
                      <p className="text-[10px] text-content-tertiary mt-2">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
