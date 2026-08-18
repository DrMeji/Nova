import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { useSocial } from '@/context/SocialContext';
import { ArkVoiceCall, sendCallSignal } from '@/lib/arkCall';
import { formatArkId, isArkUserId, normalizeArkId } from '@/lib/arkUserId';
import { GuestSocialBanner } from '@/components/GuestSocialBanner';

export function CallView() {
  const { user, profile } = useAuth();
  const { route, navigate } = useRouter();
  const { contacts, inviteByArkId } = useSocial();
  const myArkId = profile?.ark_id || '';
  const peer = route.name === 'call' ? route.peer : undefined;
  const asCallee = route.name === 'call' ? Boolean(route.incoming) : false;
  const [addId, setAddId] = useState('');
  const [status, setStatus] = useState<'idle' | 'ringing' | 'connecting' | 'live' | 'ended'>('idle');
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [round, setRound] = useState(0);
  const callRef = useRef<ArkVoiceCall | null>(null);

  const hangUp = () => {
    if (myArkId && peer) {
      void sendCallSignal({ kind: 'hangup', from: myArkId, to: peer }, user?.id);
    }
    callRef.current?.stop();
    callRef.current = null;
    setStatus('ended');
  };

  useEffect(() => {
    return () => {
      callRef.current?.stop();
      callRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!myArkId || !peer) return;

    const startMedia = async (isCaller: boolean) => {
      try {
        const voice = new ArkVoiceCall(myArkId, peer, user?.id || null, state => {
          if (state === 'live') setStatus('live');
          if (state === 'ended') setStatus('ended');
          if (state === 'connecting') setStatus('connecting');
        });
        callRef.current = voice;
        await voice.start(isCaller);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Microphone permission is needed for calls.');
        setStatus('ended');
      }
    };

    if (asCallee) {
      setStatus('connecting');
      void sendCallSignal({ kind: 'accept', from: myArkId, to: peer }, user?.id);
      void startMedia(false);
      return () => {
        callRef.current?.stop();
        callRef.current = null;
      };
    }

    setStatus('ringing');
    void sendCallSignal({
      kind: 'ring',
      from: myArkId,
      to: peer,
      payload: { name: profile?.display_name || myArkId },
    }, user?.id);

    const onSig = (ev: Event) => {
      const signal = (ev as CustomEvent).detail as { kind?: string; from?: string };
      if (signal.from !== peer) return;
      if (signal.kind === 'accept') {
        setStatus('connecting');
        void startMedia(true);
      }
      if (signal.kind === 'decline' || signal.kind === 'hangup') {
        callRef.current?.stop();
        setStatus('ended');
      }
    };
    window.addEventListener('ark:call-signal', onSig);
    return () => {
      window.removeEventListener('ark:call-signal', onSig);
      callRef.current?.stop();
      callRef.current = null;
    };
  }, [myArkId, peer, asCallee, user?.id, round]);

  useEffect(() => {
    callRef.current?.setMuted(muted);
  }, [muted]);

  const person = contacts.find(c => c.arkId === peer);

  return (
    <div className="h-full flex overflow-hidden animate-fade-in bg-ark-navy-950">
      <aside className="w-64 shrink-0 border-r border-surface-border flex flex-col">
        <div className="px-4 pt-[min(12vh,6rem)] pb-3">
          <GuestSocialBanner feature="call" />
          <h1 className="text-xl font-semibold text-content-primary tracking-tight mb-3">Call</h1>
          <div className="flex gap-1">
            <input
              value={addId}
              onChange={e => setAddId(e.target.value)}
              placeholder="ARK ID"
              className="flex-1 bg-ark-navy-900 border border-surface-border rounded-lg px-2 py-1.5 text-xs font-mono text-content-primary"
            />
            <button
              type="button"
              className="text-[11px] px-2 rounded-lg bg-surface-hover text-content-secondary"
              onClick={async () => {
                const id = normalizeArkId(addId);
                if (!isArkUserId(id)) return;
                await inviteByArkId(id);
                setAddId('');
                navigate({ name: 'call', peer: id });
              }}
            >
              Call
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {contacts.map(c => (
            <button
              key={c.arkId}
              type="button"
              onClick={() => navigate({ name: 'call', peer: c.arkId })}
              className={`w-full text-left rounded-xl px-3 py-2 mb-0.5 ${
                peer === c.arkId ? 'bg-surface-hover' : 'hover:bg-surface-hover/60'
              }`}
            >
              <p className="text-sm text-content-primary truncate">{c.displayName}</p>
              <p className="text-[10px] font-mono tracking-wider text-content-tertiary">{formatArkId(c.arkId)}</p>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col items-center justify-center px-6 text-center">
        {!peer ? (
          <p className="text-sm text-content-tertiary max-w-sm">
            Call another ARK user by their 7-digit ID. No Discord or Teams — it stays in ARK.
          </p>
        ) : (
          <>
            <div className="w-20 h-20 rounded-2xl bg-surface-hover border border-surface-border flex items-center justify-center text-2xl font-semibold text-content-primary mb-4">
              {(person?.displayName || peer).slice(0, 1).toUpperCase()}
            </div>
            <p className="text-lg font-medium text-content-primary">{person?.displayName || formatArkId(peer)}</p>
            <p className="text-xs font-mono tracking-wider text-content-tertiary mt-1">{formatArkId(peer)}</p>
            <p className="text-sm text-content-secondary mt-3">
              {status === 'ringing' && 'Ringing… they need ARK open.'}
              {status === 'connecting' && 'Connecting voice…'}
              {status === 'live' && 'On a call'}
              {status === 'ended' && 'Call ended'}
              {status === 'idle' && 'Ready'}
            </p>
            {error && <p className="text-xs text-amber-200/90 mt-2 max-w-sm">{error}</p>}
            <div className="flex items-center gap-3 mt-8">
              {status === 'live' && (
                <button
                  type="button"
                  onClick={() => setMuted(v => !v)}
                  className="w-12 h-12 rounded-full border border-surface-border flex items-center justify-center text-content-secondary hover:text-content-primary"
                >
                  {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (status === 'ended' || status === 'idle') {
                    setError('');
                    setStatus('ringing');
                    setRound(n => n + 1);
                    return;
                  }
                  hangUp();
                }}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-white ${
                  status === 'ended' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                {status === 'ended' ? <Phone className="w-5 h-5" /> : <PhoneOff className="w-5 h-5" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
