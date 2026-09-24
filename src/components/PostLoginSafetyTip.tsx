import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { pushLocalNotification, loadLocalNotifications } from '@/lib/localNotifications';
import { formatNovaId } from '@/lib/novaUserId';
import { isNovaDevEmail } from '@/lib/novaDevAccount';

const DISMISS_KEY = 'NOVA:post-login-safety-tip';
const NOTICE_ID = 'post-login-safety';

/**
 * One-time after sign-in: put the firewall / SmartScreen tip in Notifications
 * (with unread blue-dot) instead of a banner over Chat.
 */
export function PostLoginSafetyTip() {
  const { user, profile, bypass, loading } = useAuth();

  useEffect(() => {
    if (loading || bypass || !user || user.id === 'guest-local') return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      return;
    }

    const forNovaId = isNovaDevEmail(user.email)
      ? 'DEV'
      : (profile?.nova_id ? formatNovaId(profile.nova_id) : undefined);

    const existing = loadLocalNotifications(forNovaId).some(n => n.id === NOTICE_ID);
    if (existing) {
      try {
        localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* ignore */
      }
      return;
    }

    pushLocalNotification({
      id: NOTICE_ID,
      kind: 'system',
      title: "You're signed in",
      body:
        'If Windows shows a firewall, SmartScreen, or similar warning for NOVA or the local brain, you can minimize that window and keep using the app. Those prompts are normal on first run. They are not a failed login.',
      forNovaId,
      unread: true,
    });

    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, [loading, bypass, user, profile?.nova_id]);

  return null;
}
