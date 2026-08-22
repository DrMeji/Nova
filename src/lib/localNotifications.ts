/** Local app notifications (reports, etc.) shown on the Notifications screen. */

export type LocalNotification = {
  id: string;
  kind: 'friend' | 'update' | 'model' | 'system' | 'report';
  title: string;
  body: string;
  createdAt: string;
  unread?: boolean;
};

const KEY = 'ark:local-notifications';

export function loadLocalNotifications(): LocalNotification[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) as LocalNotification[] : [];
    return Array.isArray(list) ? list : [];
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
