/** Local app notifications (reports, etc.) shown on the Notifications screen. */

export type LocalNotification = {
  id: string;
  kind: 'friend' | 'update' | 'model' | 'system' | 'report';
  title: string;
  body: string;
  createdAt: string;
  unread?: boolean;
  /** When set, only this ARK ID should see the notification. */
  forArkId?: string;
  /** Friend request id for Accept / Decline actions. */
  friendRequestId?: string;
  fromArkId?: string;
  fromName?: string;
  fromAvatarUrl?: string;
};

const KEY = 'ark:local-notifications';

export function loadLocalNotifications(forArkId?: string): LocalNotification[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) as LocalNotification[] : [];
    if (!Array.isArray(list)) return [];
    const me = forArkId?.replace(/\D/g, '') || '';
    if (!me) return list;
    return list.filter(n => !n.forArkId || n.forArkId.replace(/\D/g, '') === me);
  } catch {
    return [];
  }
}

export function pushLocalNotification(n: Omit<LocalNotification, 'id' | 'createdAt'> & { id?: string }) {
  const item: LocalNotification = {
    id: n.id || crypto.randomUUID(),
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
  const next = [item, ...loadLocalNotifications()].slice(0, 40);
  localStorage.setItem(KEY, JSON.stringify(next));
  try {
    window.dispatchEvent(new CustomEvent('ark:local-notifications'));
  } catch {
    /* ignore */
  }
  return item;
}

export function removeLocalNotification(id: string) {
  try {
    const next = loadLocalNotifications().filter(n => n.id !== id);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('ark:local-notifications'));
  } catch {
    /* ignore */
  }
}

export function dismissFriendRequestNotification(requestId: string) {
  removeLocalNotification(`fr-in-${requestId}`);
}
