import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import {
  blockNovaId,
  hideDemoContact,
  listContacts,
  subscribeMessages,
  syncBlockedFromCloud,
  unfriendPeer,
  unblockNovaId,
  loadBlockedUsers,
  type NovaContact,
  type BlockedUser,
  type DirectMessage,
} from '@/lib/novaSocial';
import { sendFriendRequest, respondFriendRequest, subscribeFriendRequests, syncFriendRequests } from '@/lib/friendRequests';
import { getLocalPrefs } from '@/lib/localPrefs';
import { isNovaDevEmail } from '@/lib/novaDevAccount';
import { isRevealed, isSocialParked } from '@/lib/featurePark';
import { notifyWorkDone } from '@/lib/activityIndicators';
import { pushSidebarToast } from '@/lib/sidebarToast';
import { pushLocalNotification } from '@/lib/localNotifications';
import { formatNovaId } from '@/lib/novaUserId';
import { isSupabaseConfigured } from '@/lib/supabase';

type SocialContextValue = {
  contacts: NovaContact[];
  unreadFrom: string[];
  blockedUsers: BlockedUser[];
  refreshContacts: () => Promise<void>;
  refreshBlocked: () => Promise<void>;
  inviteByNovaId: (novaId: string, displayName?: string) => Promise<NovaContact | null>;
  acceptFriendRequest: (requestId: string) => Promise<NovaContact | null>;
  declineFriendRequest: (requestId: string) => Promise<void>;
  removeFriend: (novaId: string) => Promise<void>;
  deleteContact: (novaId: string) => Promise<void>;
  blockFriend: (novaId: string, displayName?: string) => Promise<void>;
  unblockFriend: (novaId: string) => Promise<void>;
};

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

const PARKED_VALUE: SocialContextValue = {
  contacts: [],
  unreadFrom: [],
  blockedUsers: [],
  refreshContacts: async () => undefined,
  refreshBlocked: async () => undefined,
  inviteByNovaId: async () => {
    throw new Error('Networking is coming soon.');
  },
  acceptFriendRequest: async () => {
    throw new Error('Networking is coming soon.');
  },
  declineFriendRequest: async () => undefined,
  removeFriend: async () => undefined,
  deleteContact: async () => undefined,
  blockFriend: async () => undefined,
  unblockFriend: async () => undefined,
};

/** Friends / DMs stay dead while Networking + Message are parked (GitHub-only auth). */
function socialCloudLive() {
  return !isSocialParked('networking') && !isSocialParked('message') && isSupabaseConfigured;
}

export function SocialProvider({ children }: { children: ReactNode }) {
  const live = socialCloudLive();
  const { user, profile } = useAuth();
  const { route } = useRouter();
  const [contacts, setContacts] = useState<NovaContact[]>([]);
  const [unreadFrom, setUnreadFrom] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>(() => (live ? loadBlockedUsers() : []));
  const myNovaId = isNovaDevEmail(user?.email) ? 'DEV' : (profile?.nova_id || '');
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  const refreshContacts = async () => {
    if (!live) {
      setContacts([]);
      return;
    }
    const list = await listContacts(user?.id);
    setContacts(list);
  };

  const refreshBlocked = async () => {
    if (!live) {
      setBlockedUsers([]);
      return;
    }
    const list = await syncBlockedFromCloud(user?.id);
    setBlockedUsers(list);
  };

  useEffect(() => {
    if (!live) {
      setContacts([]);
      setUnreadFrom([]);
      setBlockedUsers([]);
      return;
    }
    void refreshContacts();
    void refreshBlocked();
  }, [user?.id, live]);

  useEffect(() => {
    if (!live) return;
    const bump = () => setBlockedUsers(loadBlockedUsers());
    window.addEventListener('NOVA:blocks-changed', bump);
    return () => window.removeEventListener('NOVA:blocks-changed', bump);
  }, [live]);

  useEffect(() => {
    if (!live) return;
    if (route.name === 'message') void refreshContacts();
  }, [route.name, user?.id, live]);

  useEffect(() => {
    if (!live || !myNovaId) return;
    void syncFriendRequests(myNovaId, user?.id);
    const unsub = subscribeFriendRequests(myNovaId, user?.id, {
      onAccepted: () => {
        void refreshContacts();
        pushSidebarToast('Friend request accepted. you’re connected', { ttlMs: 8_000, id: 'fr-accepted' });
      },
    });
    return unsub;
  }, [myNovaId, user?.id, live]);

  useEffect(() => {
    if (!live || !myNovaId) return;
    const unsub = subscribeMessages(myNovaId, (msg: DirectMessage) => {
      if (msg.recipientNovaId !== myNovaId) return;
      const viewingMessage = route.name === 'message';
      const viewingThisPeer = viewingMessage && route.peer === msg.senderNovaId;
      if (!viewingThisPeer) {
        setUnreadFrom(prev => (prev.includes(msg.senderNovaId) ? prev : [...prev, msg.senderNovaId]));
      }
      const who =
        contactsRef.current.find(c => c.novaId === msg.senderNovaId || formatNovaId(c.novaId) === formatNovaId(msg.senderNovaId))?.displayName
        || formatNovaId(msg.senderNovaId);
      if (!viewingMessage && isRevealed('message')) {
        pushSidebarToast(`New message from ${who}`, { ttlMs: 10_000, id: `dm-${msg.senderNovaId}` });
        notifyWorkDone('message');
        pushLocalNotification({
          id: `dm-${msg.id}`,
          kind: 'system',
          title: `Message from ${who}`,
          body: (msg.body || '').trim().slice(0, 160) || 'New direct message',
          forNovaId: myNovaId,
        });
      } else if (isRevealed('message') && !viewingThisPeer) {
        notifyWorkDone('message');
        notifyWorkDone('notifications');
      }
    }, user?.id);
    return unsub;
  }, [myNovaId, route, user?.id, live]);

  useEffect(() => {
    if (!live) return;
    if (route.name === 'message' && route.peer) {
      setUnreadFrom(prev => prev.filter(id => id !== route.peer));
    }
  }, [route, live]);

  const inviteByNovaId = async (novaId: string, _displayName?: string) => {
    if (!live) throw new Error('Networking is coming soon.');
    const prefs = getLocalPrefs();
    const fromName = prefs.displayName?.trim() && prefs.displayName.trim() !== 'Guest'
      ? prefs.displayName.trim()
      : (profile?.display_name?.trim() || (isNovaDevEmail(user?.email) ? 'DEV' : 'NOVA user'));
    const result = await sendFriendRequest({
      fromNovaId: myNovaId,
      fromName,
      fromAvatarUrl: profile?.avatar_url || undefined,
      toNovaIdRaw: novaId,
      userId: user?.id,
    });
    if (!result.ok) throw new Error(result.error);
    return null;
  };

  const acceptFriendRequest = async (requestId: string) => {
    if (!live) throw new Error('Networking is coming soon.');
    const req = await respondFriendRequest(requestId, 'accepted', { userId: user?.id, myNovaId });
    if (!req) throw new Error('Could not accept that friend request.');
    const list = await listContacts(user?.id);
    setContacts(list);
    return list.find(c => c.novaId === req.fromNovaId) || null;
  };

  const declineFriendRequest = async (requestId: string) => {
    if (!live) return;
    await respondFriendRequest(requestId, 'declined', { userId: user?.id, myNovaId });
  };

  const removeFriend = async (novaId: string) => {
    if (!live) return;
    await unfriendPeer(user?.id, novaId);
    hideDemoContact(novaId);
    await refreshContacts();
  };

  const deleteContact = async (novaId: string) => {
    if (!live) return;
    await unfriendPeer(user?.id, novaId);
    hideDemoContact(novaId);
    await refreshContacts();
  };

  const blockFriend = async (novaId: string, displayName?: string) => {
    if (!live) return;
    await blockNovaId(novaId, { userId: user?.id, displayName });
    await refreshContacts();
    await refreshBlocked();
  };

  const unblockFriend = async (novaId: string) => {
    if (!live) return;
    await unblockNovaId(novaId, user?.id);
    await refreshBlocked();
  };

  const value = useMemo(
    () => (live
      ? {
          contacts,
          unreadFrom,
          blockedUsers,
          refreshContacts,
          refreshBlocked,
          inviteByNovaId,
          acceptFriendRequest,
          declineFriendRequest,
          removeFriend,
          deleteContact,
          blockFriend,
          unblockFriend,
        }
      : PARKED_VALUE),
    [live, contacts, unreadFrom, blockedUsers, myNovaId, profile?.display_name, user?.id],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error('useSocial must be used within SocialProvider');
  return ctx;
}
