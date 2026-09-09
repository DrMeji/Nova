import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import {
  blockArkId,
  hideDemoContact,
  listContacts,
  subscribeMessages,
  syncBlockedFromCloud,
  unfriendPeer,
  unblockArkId,
  loadBlockedUsers,
  type ArkContact,
  type BlockedUser,
  type DirectMessage,
} from '@/lib/arkSocial';
import { sendFriendRequest, respondFriendRequest, subscribeFriendRequests, syncFriendRequests } from '@/lib/friendRequests';
import { getLocalPrefs } from '@/lib/localPrefs';
import { isArkDevEmail } from '@/lib/arkDevAccount';
import { isRevealed } from '@/lib/featurePark';
import { notifyWorkDone } from '@/lib/activityIndicators';
import { pushSidebarToast } from '@/lib/sidebarToast';
import { pushLocalNotification } from '@/lib/localNotifications';
import { formatArkId } from '@/lib/arkUserId';

type SocialContextValue = {
  contacts: ArkContact[];
  unreadFrom: string[];
  blockedUsers: BlockedUser[];
  refreshContacts: () => Promise<void>;
  refreshBlocked: () => Promise<void>;
  inviteByArkId: (arkId: string, displayName?: string) => Promise<ArkContact | null>;
  acceptFriendRequest: (requestId: string) => Promise<ArkContact | null>;
  declineFriendRequest: (requestId: string) => Promise<void>;
  removeFriend: (arkId: string) => Promise<void>;
  deleteContact: (arkId: string) => Promise<void>;
  blockFriend: (arkId: string, displayName?: string) => Promise<void>;
  unblockFriend: (arkId: string) => Promise<void>;
};

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

export function SocialProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { route } = useRouter();
  const [contacts, setContacts] = useState<ArkContact[]>([]);
  const [unreadFrom, setUnreadFrom] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>(() => loadBlockedUsers());
  const myArkId = isArkDevEmail(user?.email) ? 'DEV' : (profile?.ark_id || '');
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  const refreshContacts = async () => {
    const list = await listContacts(user?.id);
    setContacts(list);
  };

  const refreshBlocked = async () => {
    const list = await syncBlockedFromCloud(user?.id);
    setBlockedUsers(list);
  };

  useEffect(() => {
    void refreshContacts();
    void refreshBlocked();
  }, [user?.id]);

  useEffect(() => {
    const bump = () => setBlockedUsers(loadBlockedUsers());
    window.addEventListener('NOVA:blocks-changed', bump);
    return () => window.removeEventListener('NOVA:blocks-changed', bump);
  }, []);

  // Re-pull live names/avatars when opening Message (friends may have updated Settings).
  useEffect(() => {
    if (route.name === 'message') void refreshContacts();
  }, [route.name, user?.id]);

  useEffect(() => {
    if (!myArkId) return;
    void syncFriendRequests(myArkId, user?.id);
    const unsub = subscribeFriendRequests(myArkId, user?.id, {
      onAccepted: () => {
        void refreshContacts();
        pushSidebarToast('Friend request accepted. you’re connected', { ttlMs: 8_000, id: 'fr-accepted' });
      },
    });
    return unsub;
  }, [myArkId, user?.id]);

  useEffect(() => {
    if (!myArkId) return;
    const unsub = subscribeMessages(myArkId, (msg: DirectMessage) => {
      if (msg.recipientArkId !== myArkId) return;
      const viewingMessage = route.name === 'message';
      const viewingThisPeer = viewingMessage && route.peer === msg.senderArkId;
      if (!viewingThisPeer) {
        setUnreadFrom(prev => (prev.includes(msg.senderArkId) ? prev : [...prev, msg.senderArkId]));
      }
      const who =
        contactsRef.current.find(c => c.arkId === msg.senderArkId || formatArkId(c.arkId) === formatArkId(msg.senderArkId))?.displayName
        || formatArkId(msg.senderArkId);
      if (!viewingMessage && isRevealed('message')) {
        pushSidebarToast(`New message from ${who}`, { ttlMs: 10_000, id: `dm-${msg.senderArkId}` });
        notifyWorkDone('message');
        pushLocalNotification({
          id: `dm-${msg.id}`,
          kind: 'system',
          title: `Message from ${who}`,
          body: (msg.body || '').trim().slice(0, 160) || 'New direct message',
          forArkId: myArkId,
        });
      } else if (isRevealed('message') && !viewingThisPeer) {
        notifyWorkDone('message');
        notifyWorkDone('notifications');
      }
    }, user?.id);
    return unsub;
  }, [myArkId, route, user?.id]);

  useEffect(() => {
    if (route.name === 'message' && route.peer) {
      setUnreadFrom(prev => prev.filter(id => id !== route.peer));
    }
  }, [route]);

  const inviteByArkId = async (arkId: string, _displayName?: string) => {
    const prefs = getLocalPrefs();
    const fromName = prefs.displayName?.trim() && prefs.displayName.trim() !== 'Guest'
      ? prefs.displayName.trim()
      : (profile?.display_name?.trim() || (isArkDevEmail(user?.email) ? 'DEV' : 'NOVA user'));
    const result = await sendFriendRequest({
      fromArkId: myArkId,
      fromName,
      fromAvatarUrl: prefs.avatarDataUrl || profile?.avatar_url || undefined,
      toArkIdRaw: arkId,
      userId: user?.id,
    });
    if (!result.ok) throw new Error(result.error);
    return null;
  };

  const acceptFriendRequest = async (requestId: string) => {
    const req = await respondFriendRequest(requestId, 'accepted', { userId: user?.id, myArkId });
    if (!req) throw new Error('Could not accept that friend request.');
    const list = await listContacts(user?.id);
    setContacts(list);
    return list.find(c => c.arkId === req.fromArkId) || null;
  };

  const declineFriendRequest = async (requestId: string) => {
    await respondFriendRequest(requestId, 'declined', { userId: user?.id, myArkId });
  };

  const removeFriend = async (arkId: string) => {
    await unfriendPeer(user?.id, arkId);
    hideDemoContact(arkId);
    await refreshContacts();
  };

  const deleteContact = async (arkId: string) => {
    await unfriendPeer(user?.id, arkId);
    hideDemoContact(arkId);
    await refreshContacts();
  };

  const blockFriend = async (arkId: string, displayName?: string) => {
    await blockArkId(arkId, { userId: user?.id, displayName });
    await refreshContacts();
    await refreshBlocked();
  };

  const unblockFriend = async (arkId: string) => {
    await unblockArkId(arkId, user?.id);
    await refreshBlocked();
  };

  const value = useMemo(
    () => ({
      contacts,
      unreadFrom,
      blockedUsers,
      refreshContacts,
      refreshBlocked,
      inviteByArkId,
      acceptFriendRequest,
      declineFriendRequest,
      removeFriend,
      deleteContact,
      blockFriend,
      unblockFriend,
    }),
    [contacts, unreadFrom, blockedUsers, myArkId, profile?.display_name, user?.id],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error('useSocial must be used within SocialProvider');
  return ctx;
}
