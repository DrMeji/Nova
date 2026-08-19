import { useEffect, useRef, useState } from 'react';
import { Loader2, Phone, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { useSocial } from '@/context/SocialContext';
import { listThread, sendDirectMessage, subscribeMessages, threadPreview, type DirectMessage } from '@/lib/arkSocial';
import { formatArkId, isArkUserId, normalizeArkId } from '@/lib/arkUserId';
import { GuestSocialBanner } from '@/components/GuestSocialBanner';

export function MessageView() {
  const { user, profile } = useAuth();
  const { route, navigate } = useRouter();
  const { contacts, inviteByArkId, refreshContacts } = useSocial();
  const myArkId = profile?.ark_id || '';
  const peer = route.name === 'message' ? route.peer : undefined;
  const [addId, setAddId] = useState('');
  const [draft, setDraft] = useState('');
  const [thread, setThread] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const active = contacts.find(c => c.arkId === peer) || (peer ? { arkId: peer, displayName: peer, addedAt: '' } : null);

  useEffect(() => {
    if (!myArkId || !peer) {
      setThread([]);
      return;
    }
    setLoading(true);
    void listThread(myArkId, peer, user?.id).then(list => {
      setThread(list);
      setLoading(false);
    });
    const unsub = subscribeMessages(myArkId, msg => {
      if (
        (msg.senderArkId === myArkId && msg.recipientArkId === peer)
        || (msg.senderArkId === peer && msg.recipientArkId === myArkId)
      ) {
        setThread(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      }
    }, user?.id);
    const poll = window.setInterval(() => {
      void listThread(myArkId, peer, user?.id).then(list => setThread(list));
    }, 4000);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, [myArkId, peer, user?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !myArkId || !peer) return;
    setDraft('');
    const msg = await sendDirectMessage({
      userId: user?.id,
      senderArkId: myArkId,
      recipientArkId: peer,
      body,
    });
    setThread(prev => [...prev, msg]);
    if (!contacts.some(c => c.arkId === peer)) {
      await inviteByArkId(peer);
    }
  };

  const add = async () => {
    const id = normalizeArkId(addId);
    if (!isArkUserId(id) || id === myArkId) return;
    const contact = await inviteByArkId(id);
    setAddId('');
    if (contact) navigate({ name: 'message', peer: contact.arkId });
    await refreshContacts();
  };

  return (
    <div className="h-full flex overflow-hidden animate-fade-in bg-ark-navy-950">
      <aside className="w-64 shrink-0 border-r border-surface-border flex flex-col">
        <div className="px-4 pt-[min(12vh,6rem)] pb-3">
          <GuestSocialBanner feature="message" />
          <h1 className="text-xl font-semibold text-content-primary tracking-tight mb-3">Message</h1>
          <div className="flex gap-1">
            <input
              value={addId}
              onChange={e => setAddId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void add(); }}
              placeholder="Add ARK ID"
              className="flex-1 bg-ark-navy-900 border border-surface-border rounded-lg px-2 py-1.5 text-xs font-mono text-content-primary"
            />
            <button type="button" onClick={() => void add()} className="text-[11px] px-2 rounded-lg bg-surface-hover text-content-secondary">
              Add
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {contacts.length === 0 && (
            <p className="px-2 text-[11px] text-content-tertiary leading-relaxed">
              Add someone with their 7-digit ARK ID. They get it under their name in the sidebar.
            </p>
          )}
          {contacts.map(c => {
            const last = myArkId ? threadPreview(myArkId, c.arkId) : null;
            return (
              <button
                key={c.arkId}
                type="button"
                onClick={() => navigate({ name: 'message', peer: c.arkId })}
                className={`w-full text-left rounded-xl px-3 py-2 mb-0.5 ${
                  peer === c.arkId ? 'bg-surface-hover' : 'hover:bg-surface-hover/60'
                }`}
              >
                <p className="text-sm text-content-primary truncate">{c.displayName}</p>
                <p className="text-[10px] font-mono text-content-tertiary tracking-wider">{formatArkId(c.arkId)}</p>
                {last && <p className="text-[10px] text-content-tertiary truncate mt-0.5">{last.body}</p>}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-sm text-content-tertiary px-6 text-center">
            Pick a person, or add an ARK ID to start a thread.
          </div>
        ) : (
          <>
            <div className="shrink-0 px-5 py-3 border-b border-surface-border flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-content-primary">{active.displayName}</p>
                <p className="text-[11px] font-mono tracking-wider text-content-tertiary">{formatArkId(active.arkId)}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate({ name: 'call', peer: active.arkId })}
                className="inline-flex items-center gap-1.5 text-xs rounded-full border border-surface-border px-3 py-1.5 text-content-secondary hover:text-content-primary"
              >
                <Phone className="w-3.5 h-3.5" />
                Call
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin text-content-tertiary" />}
              {thread.map(m => (
                <div key={m.id} className={`flex ${m.senderArkId === myArkId ? 'justify-end' : 'justify-start'}`}>
                  <p className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    m.senderArkId === myArkId
                      ? 'bg-sky-600 text-white'
                      : 'bg-surface-hover text-content-primary'
                  }`}>
                    {m.body}
                  </p>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="shrink-0 p-3 flex gap-2">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={myArkId ? 'Message…' : 'Your ARK ID is still creating…'}
                className="flex-1 bg-ark-navy-900 border border-surface-border rounded-full px-4 py-2 text-sm text-content-primary"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!draft.trim() || !myArkId}
                className="w-9 h-9 rounded-full bg-sky-600 text-white flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
