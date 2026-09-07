/** Local app notifications (reports, etc.) shown on the Notifications screen. */

import { formatArkId, isArkUserId, normalizeArkId } from '@/lib/arkUserId';
import { notifyWorkDone } from '@/lib/activityIndicators';

export type LocalNotification = {
  id: string;
  kind: 'friend' | 'update' | 'model' | 'system' | 'report';
  title: string;
  body: string;
  createdAt: string;
  unread?: boolean;
  /** When set, only this NOVA ID should see the notification. */
  forArkId?: string;
  /** Friend request id for Accept / Decline actions. */
  friendRequestId?: string;
  fromArkId?: string;
  fromName?: string;
  fromAvatarUrl?: string;
};

const KEY = 'NOVA:local-notifications';

function sameArkId(a?: string, b?: string) {
  if (!a || !b) return false;
  return formatArkId(normalizeArkId(a)) === formatArkId(normalizeArkId(b));
}

export function loadLocalNotifications(forArkId?: string): LocalNotification[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) as LocalNotification[] : [];
    if (!Array.isArray(list)) return [];
    const me = forArkId && isArkUserId(forArkId) ? formatArkId(normalizeArkId(forArkId)) : '';
    if (!me) return list;
    return list.filter(n => !n.forArkId || sameArkId(n.forArkId, me));
  } catch {
    return [];
  }
}

export function countUnreadLocalNotifications(forArkId?: string): number {
  return loadLocalNotifications(forArkId).filter(n => n.unread).length;
}

export function pushLocalNotification(n: Omit<LocalNotification, 'id' | 'createdAt'> & { id?: string }) {
  const existing = loadLocalNotifications();
  const id = n.id || crypto.randomUUID();
  const withoutDup = existing.filter(x => x.id !== id);
  const item: LocalNotification = {
    id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    createdAt: new Date().toISOString(),
    unread: n.unread !== false,
    forArkId: n.forArkId,
    friendRequestId: n.friendRequestId,
    fromArkId: n.fromArkId,
    fromName: n.fromName,
    fromAvatarUrl: n.fromAvatarUrl,
  };
  const next = [item, ...withoutDup].slice(0, 40);
  localStorage.setItem(KEY, JSON.stringify(next));
  try {
    window.dispatchEvent(new CustomEvent('NOVA:local-notifications'));
  } catch {
    /* ignore */
  }
  if (item.unread) {
    try {
      notifyWorkDone('notifications');
    } catch {
      /* ignore */
    }
  }
  return item;
}

export function markLocalNotificationsRead(forArkId?: string) {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) as LocalNotification[] : [];
    if (!Array.isArray(list)) return;
    let changed = false;
    const me = forArkId && isArkUserId(forArkId) ? formatArkId(normalizeArkId(forArkId)) : '';
    const next = list.map(n => {
      if (!n.unread) return n;
      if (me && n.forArkId && !sameArkId(n.forArkId, me)) return n;
      changed = true;
      return { ...n, unread: false };
    });
    if (!changed) return;
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('NOVA:local-notifications'));
  } catch {
    /* ignore */
  }
}

export function removeLocalNotification(id: string) {
  try {
    const next = loadLocalNotifications().filter(n => n.id !== id);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('NOVA:local-notifications'));
  } catch {
    /* ignore */
  }
}

export function dismissFriendRequestNotification(requestId: string) {
  removeLocalNotification(`fr-in-${requestId}`);
}
