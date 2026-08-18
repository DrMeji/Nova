import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import {
  addContact,
  listContacts,
  persistContact,
  subscribeMessages,
  type ArkContact,
  type DirectMessage,
} from '@/lib/arkSocial';
import { sendCallSignal, subscribeUserSignals, type IncomingCall } from '@/lib/arkCall';
import { notifyWorkDone } from '@/lib/activityIndicators';

type SocialContextValue = {
  contacts: ArkContact[];
  incoming: IncomingCall | null;
  refreshContacts: () => Promise<void>;
  inviteByArkId: (arkId: string, displayName?: string) => Promise<ArkContact | null>;
  acceptCall: () => void;
  declineCall: () => void;
};

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

export function SocialProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { route, navigate } = useRouter();
  const [contacts, setContacts] = useState<ArkContact[]>([]);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
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
      if (route.name !== 'message') notifyWorkDone('message');
    });
    return unsub;
  }, [myArkId, route.name]);

  useEffect(() => {
    if (!myArkId) return;
    const unsub = subscribeUserSignals(myArkId, signal => {
      if (signal.kind === 'ring' && signal.to === myArkId) {
        setIncoming({ from: signal.from, fromName: String(signal.payload?.name || '') });
        if (route.name !== 'call') notifyWorkDone('call');
      }
      if (signal.kind === 'hangup' || signal.kind === 'decline') {
        setIncoming(prev => (prev && (signal.from === prev.from || signal.to === myArkId) ? null : prev));
      }
      window.dispatchEvent(new CustomEvent('ark:call-signal', { detail: signal }));
    });
    return unsub;
  }, [myArkId, route.name]);

  const inviteByArkId = async (arkId: string, displayName?: string) => {
    const contact = await addContact(arkId, displayName);
    if (!contact) return null;
    await persistContact(user?.id, contact);
    await refreshContacts();
    return contact;
  };

  const acceptCall = () => {
    if (!incoming || !myArkId) return;
    const peer = incoming.from;
    setIncoming(null);
    navigate({ name: 'call', peer, incoming: true });
  };

  const declineCall = () => {
    if (!incoming || !myArkId) return;
    void sendCallSignal({ kind: 'decline', from: myArkId, to: incoming.from }, user?.id);
    setIncoming(null);
  };

  const value = useMemo(
    () => ({ contacts, incoming, refreshContacts, inviteByArkId, acceptCall, declineCall }),
    [contacts, incoming],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error('useSocial must be used within SocialProvider');
  return ctx;
}
