import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import {
  blockArkId,
  hideDemoContact,
  listContacts,
  removeContact,
  subscribeMessages,
  type ArkContact,
  type DirectMessage,
} from '@/lib/arkSocial';
import { sendFriendRequest, respondFriendRequest, subscribeFriendRequests, syncFriendRequests } from '@/lib/friendRequests';
import { getLocalPrefs } from '@/lib/localPrefs';
import { isRevealed } from '@/lib/featurePark';
import { notifyWorkDone } from '@/lib/activityIndicators';
import { pushSidebarToast } from '@/lib/sidebarToast';

type SocialContextValue = {
  contacts: ArkContact[];
  unreadFrom: string[];
  refreshContacts: () => Promise<void>;
  inviteByArkId: (arkId: string, displayName?: string) => Promise<ArkContact | null>;
  acceptFriendRequest: (requestId: string) => Promise<ArkContact | null>;
  declineFriendRequest: (requestId: string) => void;
  removeFriend: (arkId: string) => void;
  blockFriend: (arkId: string) => void;
};

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

export function SocialProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { route } = useRouter();
  const [contacts, setContacts] = useState<ArkContact[]>([]);
  const [unreadFrom, setUnreadFrom] = useState<string[]>([]);
  const myArkId = profile?.ark_id || '';

  const refreshContacts = async () => {
    const list = await listContacts(user?.id);
    setContacts(list);
  };

  useEffect(() => {
    void refreshContacts();
  }, [user?.id]);

  useEffect(() => {
    if (!myArkId) return;
    void syncFriendRequests(myArkId, user?.id);
    const unsub = subscribeFriendRequests(myArkId, user?.id, {
      onAccepted: () => {
        void refreshContacts();
        pushSidebarToast('Friend request accepted — you’re connected', { ttlMs: 8_000, id: 'fr-accepted' });
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
      if (!viewingMessage && isRevealed('message')) {
        const who = msg.senderArkId;
        pushSidebarToast(`New message from ${who}`, { ttlMs: 10_000, id: `dm-${who}` });
        notifyWorkDone('message');
      } else if (isRevealed('message') && !viewingThisPeer) {
        notifyWorkDone('message');
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
    const fromName = prefs.displayName || profile?.display_name || 'ARK user';
    const result = await sendFriendRequest({
      fromArkId: myArkId,
      fromName,
      fromAvatarUrl: prefs.avatarDataUrl,
      toArkIdRaw: arkId,
      userId: user?.id,
    });
    if (!result.ok) throw new Error(result.error);
    return null;
  };

  const acceptFriendRequest = async (requestId: string) => {
    const req = await respondFriendRequest(requestId, 'accepted', { userId: user?.id, myArkId });
    if (!req) return null;
    const list = await listContacts(user?.id);
    setContacts(list);
    return list.find(c => c.arkId === req.fromArkId) || null;
  };

  const declineFriendRequest = (requestId: string) => {
    void respondFriendRequest(requestId, 'declined', { userId: user?.id, myArkId });
  };

  const removeFriend = (arkId: string) => {
    removeContact(arkId);
    hideDemoContact(arkId);
    void refreshContacts();
  };

  const blockFriend = (arkId: string) => {
    blockArkId(arkId);
    hideDemoContact(arkId);
    void refreshContacts();
  };

  const value = useMemo(
    () => ({
      contacts,
      unreadFrom,
      refreshContacts,
      inviteByArkId,
      acceptFriendRequest,
      declineFriendRequest,
      removeFriend,
      blockFriend,
    }),
    [contacts, unreadFrom, myArkId, profile?.display_name, user?.id],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error('useSocial must be used within SocialProvider');
  return ctx;
}
