import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { pushLocalNotification, loadLocalNotifications } from '@/lib/localNotifications';
import { formatArkId } from '@/lib/arkUserId';
import { isArkDevEmail } from '@/lib/arkDevAccount';

const DISMISS_KEY = 'ark:post-login-safety-tip';
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

    const forArkId = isArkDevEmail(user.email)
      ? 'DEV'
      : (profile?.ark_id ? formatArkId(profile.ark_id) : undefined);

    const existing = loadLocalNotifications(forArkId).some(n => n.id === NOTICE_ID);
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
        'If Windows shows a firewall, SmartScreen, or similar warning for ARK or the local brain, you can minimize that window and keep using the app. Those prompts are normal on first run — they are not a failed login.',
      forArkId,
      unread: true,
    });

    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, [loading, bypass, user, profile?.ark_id]);

  return null;
}
