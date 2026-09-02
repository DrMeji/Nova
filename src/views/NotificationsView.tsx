import { useEffect, useMemo, useState } from 'react';
import {
  Bell, Download, Flag, Search, Sparkles, UserPlus, RefreshCw, Check, X,
} from 'lucide-react';
import { buildDemoNotifications, type DemoNotification } from '@/lib/socialDemo';
import {
  loadLocalNotifications,
  markLocalNotificationsRead,
  type LocalNotification,
} from '@/lib/localNotifications';
import { useSocial } from '@/context/SocialContext';
import { useAuth } from '@/context/AuthContext';
import { listPendingInbound, syncFriendRequests } from '@/lib/friendRequests';
import { formatArkId } from '@/lib/arkUserId';
import { ArkAvatar } from '@/components/ArkAvatar';
import { getLocalPrefs } from '@/lib/localPrefs';
import { clearActivity } from '@/lib/activityIndicators';
import { isArkDevEmail } from '@/lib/arkDevAccount';
import { useRouter } from '@/context/RouterContext';
import { formatActivityAge } from '@/lib/presenceStatus';

type Notice = DemoNotification | LocalNotification;

function kindIcon(kind: Notice['kind']) {
  if (kind === 'friend') return UserPlus;
  if (kind === 'update') return RefreshCw;
  if (kind === 'model') return Download;
  if (kind === 'report') return Flag;
  return Sparkles;
}

function kindAccent(kind: Notice['kind']) {
  if (kind === 'friend') {
    return { iconBg: 'bg-sky-500/14 border-sky-400/20', icon: 'text-sky-300', unreadBar: 'bg-sky-400' };
  }
  if (kind === 'update') {
    return { iconBg: 'bg-violet-500/14 border-violet-400/20', icon: 'text-violet-300', unreadBar: 'bg-violet-400' };
  }
  if (kind === 'model') {
    return { iconBg: 'bg-emerald-500/14 border-emerald-400/20', icon: 'text-emerald-300', unreadBar: 'bg-emerald-400' };
  }
  if (kind === 'report') {
    return { iconBg: 'bg-rose-500/14 border-rose-400/20', icon: 'text-rose-300', unreadBar: 'bg-rose-400' };
  }
  return { iconBg: 'bg-amber-500/12 border-amber-400/20', icon: 'text-amber-200', unreadBar: 'bg-amber-300' };
}

function isLocalFriend(n: Notice): n is LocalNotification {
  return n.kind === 'friend' && 'friendRequestId' in n && Boolean((n as LocalNotification).friendRequestId);
}

function sectionFor(n: Notice): 'new' | 'earlier' {
  return n.unread ? 'new' : 'earlier';
}

export function NotificationsView() {
  const { profile, user } = useAuth();
  const { route } = useRouter();
  const { acceptFriendRequest, declineFriendRequest } = useSocial();
  const [query, setQuery] = useState('');
  const [localTick, setLocalTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const myArkId = isArkDevEmail(user?.email) ? 'DEV' : (profile?.ark_id || undefined);
  const demos = useMemo(() => buildDemoNotifications(), []);
  const local = useMemo(
    () => loadLocalNotifications(myArkId),
    [localTick, myArkId],
  );
  const inbound = useMemo(
    () => (myArkId ? listPendingInbound(myArkId) : []),
    [myArkId, localTick],
  );
  const inboundNotices = useMemo((): LocalNotification[] => {
    if (!myArkId) return [];
    const known = new Set(local.filter(n => n.friendRequestId).map(n => n.friendRequestId));
    return inbound
      .filter(req => !known.has(req.id))
      .map(req => ({
        id: `fr-in-${req.id}`,
        kind: 'friend' as const,
        title: `${req.fromName} wants to be friends`,
        body: `${req.fromName} · ARK ID ${req.fromArkId} sent you a friend request.`,
        createdAt: req.createdAt,
        unread: true,
        forArkId: myArkId,
        friendRequestId: req.id,
        fromArkId: req.fromArkId,
        fromName: req.fromName,
        fromAvatarUrl: req.fromAvatarUrl,
      }));
  }, [inbound, local, myArkId]);

  useEffect(() => {
    if (!myArkId) return;
    void syncFriendRequests(myArkId, user?.id);
  }, [myArkId, user?.id]);

  useEffect(() => {
    if (route.name !== 'notifications') return;
    markLocalNotificationsRead(myArkId);
    clearActivity('notifications');
    setLocalTick(t => t + 1);
  }, [route.name, myArkId]);

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
    return [...local, ...inboundNotices, ...demos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [local, inboundNotices, demos]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(n => `${n.title} ${n.body}`.toLowerCase().includes(q));
  }, [all, query]);

  const unreadCount = useMemo(() => shown.filter(n => n.unread).length, [shown]);

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

  let lastSection: 'new' | 'earlier' | null = null;

  return (
    <div className="h-full box-border p-4 animate-fade-in bg-transparent">
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
          <div className="w-full max-w-2xl mx-auto">
            {!query.trim() && unreadCount > 0 && (
              <p className="text-[11px] text-content-tertiary px-1 mb-3">
                {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
                {inbound.length > 0 ? ` · ${inbound.length} pending friend request${inbound.length === 1 ? '' : 's'}` : ''}
              </p>
            )}

            {shown.length === 0 ? (
              <div className="text-center py-20 text-content-tertiary">
                <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Bell className="w-5 h-5 opacity-70" />
                </div>
                <p className="text-sm text-content-secondary">
                  {query.trim() ? 'No notifications match that search.' : 'You’re all caught up.'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-white/[0.07] bg-ark-navy-950/30 overflow-hidden divide-y divide-white/[0.06]">
                {shown.map(n => {
                  const section = sectionFor(n);
                  const showHeader = section !== lastSection;
                  lastSection = section;
                  const Icon = kindIcon(n.kind);
                  const accent = kindAccent(n.kind);
                  const friend = isLocalFriend(n) ? n : null;
                  const age = formatActivityAge(n.createdAt);

                  return (
                    <div key={n.id}>
                      {showHeader && (
                        <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.05]">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">
                            {section === 'new' ? 'New' : 'Earlier'}
                          </p>
                        </div>
                      )}
                      <div
                        className={`relative flex gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025] ${
                          n.unread ? 'bg-white/[0.02]' : ''
                        }`}
                      >
                        {n.unread && (
                          <span
                            className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${accent.unreadBar}`}
                            aria-hidden
                          />
                        )}

                        <div className="shrink-0 pt-0.5">
                          {friend ? (
                            <ArkAvatar
                              name={friend.fromName || 'ARK user'}
                              src={friend.fromAvatarUrl || (friend.fromArkId === profile?.ark_id ? getLocalPrefs().avatarDataUrl : undefined)}
                              size="md"
                            />
                          ) : (
                            <span
                              className={`h-9 w-9 rounded-full border flex items-center justify-center ${accent.iconBg}`}
                            >
                              <Icon className={`w-4 h-4 ${accent.icon}`} />
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-content-primary leading-snug pr-1">
                                {n.title}
                              </p>
                              <p className="text-xs text-content-secondary mt-1 leading-relaxed">
                                {n.body}
                              </p>
                              {friend?.fromArkId && (
                                <p className="text-[10px] font-mono text-content-tertiary mt-1.5 tracking-wider">
                                  {friend.fromName === 'DEV' || /^dev$/i.test(friend.fromName || '')
                                    ? 'DEV'
                                    : formatArkId(friend.fromArkId)}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 flex items-center gap-1 pt-0.5">
                              <span className="text-[10px] text-content-tertiary tabular-nums">{age}</span>
                              <span className="h-1.5 w-1.5 shrink-0 flex items-center justify-center">
                                {n.unread ? (
                                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" aria-hidden />
                                ) : null}
                              </span>
                            </span>
                          </div>

                          {friend?.friendRequestId && (
                            <div className="flex items-center gap-2 mt-3">
                              <button
                                type="button"
                                disabled={busyId === n.id}
                                onClick={() => void onAccept(friend)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 px-3 py-1.5 text-[11px] font-medium text-sky-100 hover:bg-sky-500/28 disabled:opacity-50 transition-colors"
                              >
                                <Check className="w-3 h-3" />
                                Accept
                              </button>
                              <button
                                type="button"
                                disabled={busyId === n.id}
                                onClick={() => onDecline(friend)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-1.5 text-[11px] font-medium text-content-secondary hover:text-content-primary hover:bg-white/[0.07] disabled:opacity-50 transition-colors"
                              >
                                <X className="w-3 h-3" />
                                Decline
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
