import { useEffect, useMemo, useState } from 'react';
import {
  Bell, Download, Flag, Search, Sparkles, UserPlus, RefreshCw, Check, X,
} from 'lucide-react';
import { buildDemoNotifications, type DemoNotification } from '@/lib/socialDemo';
import {
  loadLocalNotifications,
  type LocalNotification,
} from '@/lib/localNotifications';
import { useSocial } from '@/context/SocialContext';
import { useAuth } from '@/context/AuthContext';
import { listPendingInbound, syncFriendRequests } from '@/lib/friendRequests';
import { formatArkId } from '@/lib/arkUserId';

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

function isLocalFriend(n: Notice): n is LocalNotification {
  return n.kind === 'friend' && 'friendRequestId' in n && Boolean((n as LocalNotification).friendRequestId);
}

export function NotificationsView() {
  const { profile, user } = useAuth();
  const { acceptFriendRequest, declineFriendRequest } = useSocial();
  const [query, setQuery] = useState('');
  const [localTick, setLocalTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const demos = useMemo(() => buildDemoNotifications(), []);
  const local = useMemo(
    () => loadLocalNotifications(profile?.ark_id),
    [localTick, profile?.ark_id],
  );
  const inbound = useMemo(
    () => (profile?.ark_id ? listPendingInbound(profile.ark_id) : []),
    [profile?.ark_id, localTick],
  );

  useEffect(() => {
    if (!profile?.ark_id) return;
    void syncFriendRequests(profile.ark_id, user?.id);
  }, [profile?.ark_id, user?.id]);

  useEffect(() => {
    const bump = () => setLocalTick(t => t + 1);
    window.addEventListener('ark:local-notifications', bump);
    window.addEventListener('ark:friend-requests', bump);
    return () => {
      window.removeEventListener('ark:local-notifications', bump);
      window.removeEventListener('ark:friend-requests', bump);
    };
  }, []);

  const all = useMemo(() => {
    return [...local, ...demos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [local, demos]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(n => `${n.title} ${n.body}`.toLowerCase().includes(q));
  }, [all, query]);

  const onAccept = async (n: LocalNotification) => {
    if (!n.friendRequestId) return;
    setBusyId(n.id);
    try {
      await acceptFriendRequest(n.friendRequestId);
      setLocalTick(t => t + 1);
    } finally {
      setBusyId(null);
    }
  };

  const onDecline = (n: LocalNotification) => {
    if (!n.friendRequestId) return;
    declineFriendRequest(n.friendRequestId);
    setLocalTick(t => t + 1);
  };

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
            {inbound.length > 0 && !query.trim() && (
              <p className="text-[11px] text-content-tertiary px-1 mb-1">
                {inbound.length} pending friend request{inbound.length === 1 ? '' : 's'}
              </p>
            )}
            {shown.length === 0 ? (
              <div className="text-center py-16 text-content-tertiary">
                <Bell className="w-6 h-6 mx-auto mb-2 opacity-70" />
                <p className="text-sm">{query.trim() ? 'No notifications match that search.' : 'No notifications yet.'}</p>
              </div>
            ) : (
              shown.map(n => {
                const Icon = kindIcon(n.kind);
                const friend = isLocalFriend(n) ? n : null;
                return (
                  <div
                    key={n.id}
                    className={`rounded-2xl border px-4 py-3.5 flex items-start gap-3 ${
                      n.unread
                        ? 'border-sky-500/25 bg-ark-navy-900/70'
                        : 'border-surface-border bg-ark-navy-900/40'
                    }`}
                  >
                    {friend?.fromAvatarUrl ? (
                      <img
                        src={friend.fromAvatarUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover border border-white/10"
                      />
                    ) : (
                      <span className="h-10 w-10 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-content-secondary">
                        <Icon className="w-4 h-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-content-primary truncate">{n.title}</p>
                        {n.unread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" aria-hidden />
                        )}
                      </div>
                      <p className="text-xs text-content-secondary mt-1 leading-relaxed">{n.body}</p>
                      {friend?.fromArkId && (
                        <p className="text-[10px] font-mono text-content-tertiary mt-1 tracking-wider">
                          {formatArkId(friend.fromArkId)}
                        </p>
                      )}
                      {friend?.friendRequestId && (
                        <div className="flex items-center gap-2 mt-2.5">
                          <button
                            type="button"
                            disabled={busyId === n.id}
                            onClick={() => void onAccept(friend)}
                            className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 border border-sky-500/35 px-3 py-1 text-[11px] font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                            Accept
                          </button>
                          <button
                            type="button"
                            disabled={busyId === n.id}
                            onClick={() => onDecline(friend)}
                            className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[11px] font-medium text-content-secondary hover:text-rose-300 disabled:opacity-50"
                          >
                            <X className="w-3 h-3" />
                            Decline
                          </button>
                        </div>
                      )}
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
