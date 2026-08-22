import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, PanelLeft, Phone, PhoneOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { useSocial } from '@/context/SocialContext';
import { ArkVoiceCall, sendCallSignal } from '@/lib/arkCall';
import {
  isBlockedArkId,
  loadHiddenDemoContacts,
  threadPreview,
  type ArkContact,
} from '@/lib/arkSocial';
import { formatArkId, isArkUserId, normalizeArkId } from '@/lib/arkUserId';
import { GuestSocialBanner } from '@/components/GuestSocialBanner';
import { ConnectShell } from '@/components/ConnectShell';
import { buildDemoContacts, buildDemoThread } from '@/lib/socialDemo';

function initials(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

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
  const [railCompact, setRailCompact] = useState(false);
  const callRef = useRef<ArkVoiceCall | null>(null);

  const people = useMemo(() => {
    const hidden = new Set(loadHiddenDemoContacts());
    const demos = buildDemoContacts().filter(c => !hidden.has(c.arkId) && !isBlockedArkId(c.arkId));
    const byId = new Map<string, ArkContact>();
    for (const c of demos) byId.set(c.arkId, c);
    for (const c of contacts) {
      if (!isBlockedArkId(c.arkId)) byId.set(c.arkId, c);
    }
    const me = myArkId || '3218815';
    const activityAt = (arkId: string) => {
      const last = threadPreview(me, arkId);
      const demoLast = !last && arkId === '3301882'
        ? buildDemoThread(me, arkId).slice(-1)[0]
        : null;
      return (last || demoLast)?.createdAt || '';
    };
    return [...byId.values()].sort((a, b) => activityAt(b.arkId).localeCompare(activityAt(a.arkId)));
  }, [contacts, myArkId]);

  useEffect(() => {
    const compact = () => setRailCompact(true);
    window.addEventListener('ark:compact-connect-rail', compact);
    return () => window.removeEventListener('ark:compact-connect-rail', compact);
  }, []);

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
    setError('');
    void sendCallSignal({
      kind: 'ring',
      from: myArkId,
      to: peer,
      payload: { name: profile?.display_name || myArkId },
    }, user?.id);

    const ringTimer = window.setTimeout(() => {
      setStatus('ended');
      setError('No answer. They need ARK open with Call revealed. Try again, or Message them.');
      void sendCallSignal({ kind: 'hangup', from: myArkId, to: peer }, user?.id);
    }, 30000);

    const onSig = (ev: Event) => {
      const signal = (ev as CustomEvent).detail as { kind?: string; from?: string };
      if (signal.from !== peer) return;
      if (signal.kind === 'accept') {
        window.clearTimeout(ringTimer);
        setStatus('connecting');
        void startMedia(true);
      }
      if (signal.kind === 'decline' || signal.kind === 'hangup') {
        window.clearTimeout(ringTimer);
        callRef.current?.stop();
        setStatus('ended');
      }
    };
    window.addEventListener('ark:call-signal', onSig);
    return () => {
      window.clearTimeout(ringTimer);
      window.removeEventListener('ark:call-signal', onSig);
      callRef.current?.stop();
      callRef.current = null;
    };
  }, [myArkId, peer, asCallee, user?.id, profile?.display_name, round]);

  useEffect(() => {
    callRef.current?.setMuted(muted);
  }, [muted]);

  const person = people.find(c => c.arkId === peer);

  return (
    <ConnectShell
      railVisible
      railCompact={railCompact}
      rail={(
        <>
          <div className={`shrink-0 ${railCompact ? 'px-1.5 pt-3 pb-2' : 'px-2.5 pt-3 pb-2'} space-y-2`}>
            {!railCompact && <GuestSocialBanner feature="call" />}
            <div className={`flex items-center gap-1.5 ${railCompact ? 'flex-col' : ''}`}>
              {!railCompact && (
                <div className="flex-1 min-w-0 flex items-center gap-1 rounded-full bg-ark-navy-950/60 border border-white/10 p-1 pl-2.5">
                  <input
                    value={addId}
                    onChange={e => setAddId(e.target.value)}
                    placeholder="ARK ID"
                    className="flex-1 min-w-0 bg-transparent text-xs font-mono text-content-primary placeholder:text-content-tertiary outline-none py-1"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-full bg-surface-hover hover:bg-white/10 text-[11px] text-content-primary px-2.5 py-1"
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
              )}
              <button
                type="button"
                onClick={() => setRailCompact(v => !v)}
                className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
                title={railCompact ? 'Expand people' : 'Collapse to icons'}
                aria-label={railCompact ? 'Expand people' : 'Collapse to icons'}
              >
                <PanelLeft className={`w-4 h-4 transition-transform ${railCompact ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
          <div className={`flex-1 overflow-y-auto pb-3 ${railCompact ? 'px-1.5 space-y-1' : 'px-2 pt-1 space-y-1'}`}>
            {people.map(c => (
              <button
                key={c.arkId}
                type="button"
                title={c.displayName}
                onClick={() => navigate({ name: 'call', peer: c.arkId })}
                className={`w-full flex items-center gap-2.5 text-left rounded-xl ${
                  railCompact ? 'justify-center py-2' : 'px-2.5 py-3'
                } ${peer === c.arkId ? 'bg-surface-hover' : 'hover:bg-surface-hover/60'}`}
              >
                <span className="h-9 w-9 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[11px] font-semibold text-content-primary">
                  {initials(c.displayName)}
                </span>
                {!railCompact && (
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-content-primary truncate">{c.displayName}</span>
                    <span className="block text-[10px] font-mono text-content-tertiary tracking-wider">{formatArkId(c.arkId)}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    >
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center px-6 text-center">
        {!peer ? (
          <p className="text-sm text-content-tertiary max-w-sm">
            Call another ARK user by their 7-digit ID. No Discord or Teams — it stays in ARK.
          </p>
        ) : (
          <>
            <div className="w-20 h-20 rounded-2xl bg-surface-hover border border-surface-border flex items-center justify-center text-2xl font-semibold text-content-primary mb-4">
              {initials(person?.displayName || peer)}
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
    </ConnectShell>
  );
}
