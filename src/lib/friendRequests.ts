/**
 * Friend requests. Supabase when signed in; local cache for offline / same-device dev.
 */

import { supabase } from '@/lib/supabase';
import { canUseCloud } from '@/lib/novaSocial';
import { formatNovaId, isNovaUserId, lookupNovaUser, normalizeNovaId } from '@/lib/novaUserId';
import { isDevNovaAlias } from '@/lib/novaDevAccount';
import { pushLocalNotification, dismissFriendRequestNotification, loadLocalNotifications } from '@/lib/localNotifications';
import { pushSidebarToast } from '@/lib/sidebarToast';
import { isBlockedNovaId, isBlockedFromAdding } from '@/lib/novaSocial';

export type FriendRequest = {
  id: string;
  fromNovaId: string;
  fromName: string;
  fromAvatarUrl?: string;
  toNovaId: string;
  createdAt: string;
  status: 'pending' | 'accepted' | 'declined';
};

const KEY = 'NOVA:friend-requests';

function sameNovaId(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return formatNovaId(normalizeNovaId(a)) === formatNovaId(normalizeNovaId(b));
}

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
    window.dispatchEvent(new CustomEvent('NOVA:friend-requests'));
  } catch {
    /* ignore */
  }
}

function mapRow(row: Record<string, unknown>): FriendRequest {
  return {
    id: String(row.id),
    fromNovaId: String(row.from_nova_id),
    fromName: String(row.from_name || row.from_nova_id),
    fromAvatarUrl: row.from_avatar_url ? String(row.from_avatar_url) : undefined,
    toNovaId: String(row.to_nova_id),
    createdAt: String(row.created_at),
    status: (row.status === 'accepted' || row.status === 'declined') ? row.status : 'pending',
  };
}

async function fetchCloudRequests(): Promise<FriendRequest[]> {
  try {
    // RLS scopes rows to my_nova_id(); do not add a client-side ID filter — stale local
    // cache IDs would hide valid inbound/outbound requests.
    const { data, error } = await supabase
      .from('nova_friend_requests')
      .select('*')
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

export async function syncFriendRequests(myNovaId: string, userId?: string | null): Promise<FriendRequest[]> {
  const me = normalizeNovaId(myNovaId);
  if (!isNovaUserId(me)) return [];
  const local = readLocal().filter(r => sameNovaId(r.fromNovaId, me) || sameNovaId(r.toNovaId, me));
  if (!canUseCloud(userId)) return local;
  const cloud = await fetchCloudRequests();
  const merged = mergeRequests(local, cloud);
  writeLocal(merged);
  notifyPendingInbound(myNovaId, merged);
  return merged;
}

export function listPendingInbound(myNovaId: string): FriendRequest[] {
  const me = normalizeNovaId(myNovaId);
  if (!isNovaUserId(me)) return [];
  return readLocal().filter(r => sameNovaId(r.toNovaId, me) && r.status === 'pending');
}

export function listPendingOutbound(myNovaId: string): FriendRequest[] {
  const me = normalizeNovaId(myNovaId);
  if (!isNovaUserId(me)) return [];
  return readLocal().filter(r => sameNovaId(r.fromNovaId, me) && r.status === 'pending');
}

function notifyInbound(req: FriendRequest) {
  const notifId = `fr-in-${req.id}`;
  if (loadLocalNotifications().some(n => n.id === notifId)) return;
  pushLocalNotification({
    id: notifId,
    kind: 'friend',
    title: `${req.fromName} wants to be friends`,
    body: `${req.fromName} · NOVA ID ${req.fromNovaId} sent you a friend request.`,
    forNovaId: req.toNovaId,
    friendRequestId: req.id,
    fromNovaId: req.fromNovaId,
    fromName: req.fromName,
    fromAvatarUrl: req.fromAvatarUrl,
  });
}

/** Create Accept/Decline notifications for inbound pending rows (sync + offline catch-up). */
export function notifyPendingInbound(myNovaId: string, requests?: FriendRequest[]) {
  const pending = (requests ?? readLocal()).filter(
    r => sameNovaId(r.toNovaId, myNovaId) && r.status === 'pending',
  );
  for (const req of pending) {
    notifyInbound(req);
  }
}

/**
 * Sender: do NOT reveal the other person's name/avatar.
 * Receiver: gets a notification with full sender profile (via Realtime + local).
 */
function friendlyFriendError(raw: string | undefined): string {
  const msg = String(raw || '').trim();
  const lower = msg.toLowerCase();
  if (
    lower.includes('ark_friend_requests')
    || lower.includes('schema cache')
    || lower.includes('could not find the table')
  ) {
    return 'Friend requests are not set up on the server yet. Ask the NOVA developer to apply the friend-requests SQL migration, then try again.';
  }
  if (lower.includes('row-level security') || lower.includes('rls') || lower.includes('permission denied')) {
    return 'Could not send that request (permission). Sign out, sign back in, and try again.';
  }
  if (lower.includes('duplicate') || lower.includes('unique')) {
    return 'Friend request already sent';
  }
  return msg || 'Could not send friend request';
}

export async function sendFriendRequest(opts: {
  fromNovaId: string;
  fromName: string;
  fromAvatarUrl?: string;
  toNovaIdRaw: string;
  userId?: string | null;
}): Promise<{ ok: true; request: FriendRequest } | { ok: false; error: string }> {
  const from = normalizeNovaId(opts.fromNovaId);
  const rawTo = String(opts.toNovaIdRaw || '').trim();
  const toAlias = isDevNovaAlias(rawTo);
  const to = toAlias ? '' : normalizeNovaId(rawTo);
  if (!isNovaUserId(from)) {
    return { ok: false, error: 'Your NOVA ID is missing. Sign out and sign back in.' };
  }
  if (!toAlias && !isNovaUserId(to)) {
    return { ok: false, error: 'Enter a valid 7-digit NOVA ID (or DEV for the developer account)' };
  }
  if (!canUseCloud(opts.userId)) {
    return { ok: false, error: 'Sign in to send friend requests to other NOVA users.' };
  }

  if (isBlockedNovaId(toAlias ? 'DEV' : to)) {
    return { ok: false, error: 'You blocked this user. Unblock them in Settings → Privacy first.' };
  }

  const found = await lookupNovaUser(toAlias ? 'DEV' : to);
  if (!found) {
    return {
      ok: false,
      error: toAlias
        ? 'DEV account is not registered yet. Sign in once with the developer email first.'
        : `No NOVA account found for ID ${to}. They must sign in once so their ID is registered.`,
    };
  }
  if (found.novaId === from) return { ok: false, error: 'That’s your own NOVA ID' };

  if (await isBlockedFromAdding(found.novaId, opts.userId)) {
    return { ok: false, error: 'This user is not accepting friend requests from you.' };
  }

  const all = await syncFriendRequests(from, opts.userId);
  if (all.some(r => sameNovaId(r.fromNovaId, from) && sameNovaId(r.toNovaId, found.novaId) && r.status === 'pending')) {
    return { ok: false, error: 'Friend request already sent' };
  }

  try {
    const { data, error } = await supabase.from('nova_friend_requests').insert({
      from_nova_id: from,
      to_nova_id: found.novaId,
      from_name: opts.fromName || 'NOVA user',
      from_avatar_url: opts.fromAvatarUrl || null,
      status: 'pending',
    }).select('*').maybeSingle();
    if (error || !data) {
      return { ok: false, error: friendlyFriendError(error?.message) };
    }
    const req = mapRow(data as Record<string, unknown>);
    writeLocal([req, ...readLocal().filter(r => r.id !== req.id)]);

    const label = toAlias ? 'DEV' : found.novaId;
    pushSidebarToast(`Friend request was sent to ${label}`, { ttlMs: 8_000, id: `fr-sent-${found.novaId}` });
    pushLocalNotification({
      kind: 'system',
      title: 'Friend request sent',
      body: `Your request was sent to ${label}. You’ll connect after they accept.`,
      forNovaId: from,
    });

    return { ok: true, request: req };
  } catch (err) {
    return { ok: false, error: friendlyFriendError(err instanceof Error ? err.message : undefined) };
  }
}

export async function respondFriendRequest(
  requestId: string,
  decision: 'accepted' | 'declined',
  opts?: { userId?: string | null; myNovaId?: string; _retried?: boolean },
): Promise<FriendRequest | null> {
  const all = readLocal();
  const idx = all.findIndex(r => r.id === requestId);
  const local = idx >= 0 ? all[idx] : null;

  if (canUseCloud(opts?.userId)) {
    try {
      if (decision === 'accepted') {
        const { error } = await supabase.rpc('accept_nova_friend_request', { p_request_id: requestId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('nova_friend_requests')
          .update({ status: 'declined', updated_at: new Date().toISOString() })
          .eq('id', requestId);
        if (error) throw error;
      }
    } catch (err) {
      // Do not mark accepted/declined locally when the server rejected the change.
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: string }).message || '').trim()
        : '';
      throw new Error(
        msg || (decision === 'accepted'
          ? 'Could not accept that friend request on the server. Try again.'
          : 'Could not decline that friend request on the server. Try again.'),
      );
    }
  }

  if (idx < 0 && !local) {
    if (!opts?._retried && opts?.myNovaId && canUseCloud(opts.userId)) {
      await syncFriendRequests(opts.myNovaId, opts.userId);
      return respondFriendRequest(requestId, decision, { ...opts, _retried: true });
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
  window.dispatchEvent(new CustomEvent('NOVA:friend-requests'));
  return { ...next, status: decision };
}

export function findFriendRequestByNotificationId(notificationId: string): FriendRequest | null {
  const m = /^fr-in-(.+)$/.exec(notificationId);
  if (!m) return null;
  return readLocal().find(r => r.id === m[1]) || null;
}

/** Realtime: inbound requests + outbound acceptances (add contact on sender side). */
export function subscribeFriendRequests(
  myNovaId: string,
  userId: string | null | undefined,
  handlers: {
    onInbound?: (req: FriendRequest) => void;
    onAccepted?: (req: FriendRequest) => void;
  },
): () => void {
  if (!myNovaId || !canUseCloud(userId)) return () => undefined;

  void syncFriendRequests(myNovaId, userId);

  const channel = supabase
    .channel(`NOVA-fr-${myNovaId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ark_friend_requests' },
      payload => {
        const req = mapRow(payload.new as Record<string, unknown>);
        const existing = readLocal();
        if (!existing.some(r => r.id === req.id)) {
          writeLocal([req, ...existing]);
        }
        if (sameNovaId(req.toNovaId, myNovaId) && req.status === 'pending') {
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
        if (req.status === 'accepted' && sameNovaId(req.fromNovaId, myNovaId)) {
          handlers.onAccepted?.(req);
        }
        if (req.status !== 'pending') {
          dismissFriendRequestNotification(req.id);
        }
        window.dispatchEvent(new CustomEvent('NOVA:friend-requests'));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
