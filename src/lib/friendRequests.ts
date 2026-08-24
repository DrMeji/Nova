/**
 * Friend requests — Supabase when signed in; local cache for offline / same-device dev.
 */

import { supabase } from '@/lib/supabase';
import { canUseCloud } from '@/lib/arkSocial';
import { isArkUserId, lookupArkUser, normalizeArkId } from '@/lib/arkUserId';
import { pushLocalNotification, dismissFriendRequestNotification } from '@/lib/localNotifications';
import { pushSidebarToast } from '@/lib/sidebarToast';

export type FriendRequest = {
  id: string;
  fromArkId: string;
  fromName: string;
  fromAvatarUrl?: string;
  toArkId: string;
  createdAt: string;
  status: 'pending' | 'accepted' | 'declined';
};

const KEY = 'ark:friend-requests';

function readLocal(): FriendRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) as FriendRequest[] : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLocal(list: FriendRequest[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 80)));
    window.dispatchEvent(new CustomEvent('ark:friend-requests'));
  } catch {
    /* ignore */
  }
}

function mapRow(row: Record<string, unknown>): FriendRequest {
  return {
    id: String(row.id),
    fromArkId: String(row.from_ark_id),
    fromName: String(row.from_name || row.from_ark_id),
    fromAvatarUrl: row.from_avatar_url ? String(row.from_avatar_url) : undefined,
    toArkId: String(row.to_ark_id),
    createdAt: String(row.created_at),
    status: (row.status === 'accepted' || row.status === 'declined') ? row.status : 'pending',
  };
}

async function fetchCloudRequests(myArkId: string): Promise<FriendRequest[]> {
  try {
    const { data, error } = await supabase
      .from('ark_friend_requests')
      .select('*')
      .or(`from_ark_id.eq.${myArkId},to_ark_id.eq.${myArkId}`)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error || !data) return [];
    return data.map(r => mapRow(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

function mergeRequests(local: FriendRequest[], cloud: FriendRequest[]): FriendRequest[] {
  const byId = new Map<string, FriendRequest>();
  [...cloud, ...local].forEach(r => {
    if (!byId.has(r.id)) byId.set(r.id, r);
  });
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function syncFriendRequests(myArkId: string, userId?: string | null): Promise<FriendRequest[]> {
  const me = normalizeArkId(myArkId);
  if (!isArkUserId(me)) return [];
  const local = readLocal().filter(r => r.fromArkId === me || r.toArkId === me);
  if (!canUseCloud(userId)) return local;
  const cloud = await fetchCloudRequests(me);
  const merged = mergeRequests(local, cloud);
  writeLocal(merged);
  return merged;
}

export function listPendingInbound(myArkId: string): FriendRequest[] {
  const me = normalizeArkId(myArkId);
  if (!isArkUserId(me)) return [];
  return readLocal().filter(r => r.toArkId === me && r.status === 'pending');
}

export function listPendingOutbound(myArkId: string): FriendRequest[] {
  const me = normalizeArkId(myArkId);
  if (!isArkUserId(me)) return [];
  return readLocal().filter(r => r.fromArkId === me && r.status === 'pending');
}

function notifyInbound(req: FriendRequest) {
  pushLocalNotification({
    id: `fr-in-${req.id}`,
    kind: 'friend',
    title: `${req.fromName} wants to be friends`,
    body: `${req.fromName} · ARK ID ${req.fromArkId} sent you a friend request.`,
    forArkId: req.toArkId,
    friendRequestId: req.id,
    fromArkId: req.fromArkId,
    fromName: req.fromName,
    fromAvatarUrl: req.fromAvatarUrl,
  });
}

/**
 * Sender: do NOT reveal the other person's name/avatar.
 * Receiver: gets a notification with full sender profile (via Realtime + local).
 */
export async function sendFriendRequest(opts: {
  fromArkId: string;
  fromName: string;
  fromAvatarUrl?: string;
  toArkIdRaw: string;
  userId?: string | null;
}): Promise<{ ok: true; request: FriendRequest } | { ok: false; error: string }> {
  const from = normalizeArkId(opts.fromArkId);
  const to = normalizeArkId(opts.toArkIdRaw);
  if (!isArkUserId(from) || !isArkUserId(to)) {
    return { ok: false, error: 'Enter a valid 7-digit ARK ID' };
  }
  if (from === to) return { ok: false, error: 'That’s your own ARK ID' };
  if (!canUseCloud(opts.userId)) {
    return { ok: false, error: 'Sign in to send friend requests to other ARK users.' };
  }

  const all = await syncFriendRequests(from, opts.userId);
  if (all.some(r => r.fromArkId === from && r.toArkId === to && r.status === 'pending')) {
    return { ok: false, error: 'Friend request already sent' };
  }

  try {
    await lookupArkUser(to);
  } catch {
    /* still allow send */
  }

  try {
    const { data, error } = await supabase.from('ark_friend_requests').insert({
      from_ark_id: from,
      to_ark_id: to,
      from_name: opts.fromName || 'ARK user',
      from_avatar_url: opts.fromAvatarUrl || null,
      status: 'pending',
    }).select('*').maybeSingle();
    if (error || !data) {
      return { ok: false, error: error?.message || 'Could not send friend request' };
    }
    const req = mapRow(data as Record<string, unknown>);
    writeLocal([req, ...readLocal().filter(r => r.id !== req.id)]);

    pushSidebarToast(`Friend request was sent to ${to}`, { ttlMs: 8_000, id: `fr-sent-${to}` });
    pushLocalNotification({
      kind: 'system',
      title: 'Friend request sent',
      body: `Your request was sent to ARK ID ${to}. You’ll connect after they accept.`,
      forArkId: from,
    });

    return { ok: true, request: req };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not send friend request' };
  }
}

export async function respondFriendRequest(
  requestId: string,
  decision: 'accepted' | 'declined',
  opts?: { userId?: string | null; myArkId?: string },
): Promise<FriendRequest | null> {
  const all = readLocal();
  const idx = all.findIndex(r => r.id === requestId);
  const local = idx >= 0 ? all[idx] : null;

  if (canUseCloud(opts?.userId)) {
    try {
      if (decision === 'accepted') {
        const { error } = await supabase.rpc('accept_ark_friend_request', { p_request_id: requestId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ark_friend_requests')
          .update({ status: 'declined', updated_at: new Date().toISOString() })
          .eq('id', requestId);
        if (error) throw error;
      }
    } catch {
      if (!local) return null;
    }
  }

  if (idx < 0 && !local) {
    if (opts?.myArkId && canUseCloud(opts.userId)) {
      await syncFriendRequests(opts.myArkId, opts.userId);
      return respondFriendRequest(requestId, decision, opts);
    }
    return null;
  }

  const next = idx >= 0 ? { ...all[idx], status: decision } as FriendRequest : local!;
  if (idx >= 0) {
    all[idx] = next;
    writeLocal(all);
  } else {
    writeLocal([{ ...next, status: decision }, ...all]);
  }
  dismissFriendRequestNotification(requestId);
  window.dispatchEvent(new CustomEvent('ark:friend-requests'));
  return { ...next, status: decision };
}

export function findFriendRequestByNotificationId(notificationId: string): FriendRequest | null {
  const m = /^fr-in-(.+)$/.exec(notificationId);
  if (!m) return null;
  return readLocal().find(r => r.id === m[1]) || null;
}

/** Realtime: inbound requests + outbound acceptances (add contact on sender side). */
export function subscribeFriendRequests(
  myArkId: string,
  userId: string | null | undefined,
  handlers: {
    onInbound?: (req: FriendRequest) => void;
    onAccepted?: (req: FriendRequest) => void;
  },
): () => void {
  if (!myArkId || !canUseCloud(userId)) return () => undefined;

  void syncFriendRequests(myArkId, userId);

  const channel = supabase
    .channel(`ark-fr-${myArkId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ark_friend_requests' },
      payload => {
        const req = mapRow(payload.new as Record<string, unknown>);
        const existing = readLocal();
        if (!existing.some(r => r.id === req.id)) {
          writeLocal([req, ...existing]);
        }
        if (req.toArkId === myArkId && req.status === 'pending') {
          notifyInbound(req);
          handlers.onInbound?.(req);
        }
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'ark_friend_requests' },
      payload => {
        const req = mapRow(payload.new as Record<string, unknown>);
        const list = readLocal();
        const i = list.findIndex(r => r.id === req.id);
        if (i >= 0) list[i] = req;
        else list.unshift(req);
        writeLocal(list);
        if (req.status === 'accepted' && req.fromArkId === myArkId) {
          handlers.onAccepted?.(req);
        }
        if (req.status !== 'pending') {
          dismissFriendRequestNotification(req.id);
        }
        window.dispatchEvent(new CustomEvent('ark:friend-requests'));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
