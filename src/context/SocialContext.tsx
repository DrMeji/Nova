import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import {
  addContact,
  blockArkId,
  hideDemoContact,
  listContacts,
  persistContact,
  removeContact,
  subscribeMessages,
  type ArkContact,
  type DirectMessage,
} from '@/lib/arkSocial';
import { sendCallSignal, subscribeUserSignals, type IncomingCall } from '@/lib/arkCall';
import { isRevealed, isSocialParked } from '@/lib/featurePark';
import { notifyWorkDone } from '@/lib/activityIndicators';
import { pushSidebarToast } from '@/lib/sidebarToast';

type SocialContextValue = {
  contacts: ArkContact[];
  incoming: IncomingCall | null;
  unreadFrom: string[];
  refreshContacts: () => Promise<void>;
  inviteByArkId: (arkId: string, displayName?: string) => Promise<ArkContact | null>;
  removeFriend: (arkId: string) => void;
  blockFriend: (arkId: string) => void;
  acceptCall: () => void;
  declineCall: () => void;
};

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

export function SocialProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { navigate, route } = useRouter();
  const [contacts, setContacts] = useState<ArkContact[]>([]);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
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

  useEffect(() => {
    if (!myArkId) return;
    const unsub = subscribeUserSignals(myArkId, signal => {
      if (signal.kind === 'ring' && signal.to === myArkId) {
        setIncoming({
          from: signal.from,
          fromName: typeof signal.payload?.name === 'string' ? signal.payload.name : signal.from,
        });
        if (isRevealed('call')) notifyWorkDone('call');
      }
      if (signal.kind === 'hangup' || signal.kind === 'decline') {
        setIncoming(prev => (prev && (signal.from === prev.from || signal.to === myArkId) ? null : prev));
      }
      window.dispatchEvent(new CustomEvent('ark:call-signal', { detail: signal }));
    });
    return unsub;
  }, [myArkId]);

  const inviteByArkId = async (arkId: string, displayName?: string) => {
    const contact = await addContact(arkId, displayName);
    if (!contact) return null;
    await persistContact(user?.id, contact);
    await refreshContacts();
    return contact;
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

  const acceptCall = () => {
    if (!incoming) return;
    const peer = incoming.from;
    setIncoming(null);
    if (isSocialParked('call')) return;
    navigate({ name: 'call', peer, incoming: true });
  };

  const declineCall = () => {
    if (!incoming || !myArkId) return;
    void sendCallSignal({ kind: 'decline', from: myArkId, to: incoming.from }, user?.id);
    setIncoming(null);
  };

  const value = useMemo(
    () => ({
      contacts,
      incoming,
      unreadFrom,
      refreshContacts,
      inviteByArkId,
      removeFriend,
      blockFriend,
      acceptCall,
      declineCall,
    }),
    [contacts, incoming, unreadFrom],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error('useSocial must be used within SocialProvider');
  return ctx;
}
