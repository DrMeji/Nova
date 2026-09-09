import { useEffect, useMemo, useState } from 'react';
import { Mic, MicOff, PanelLeft, Phone, PhoneOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { useSocial } from '@/context/SocialContext';
import { useCall, formatCallElapsed } from '@/context/CallContext';
import {
  isBlockedArkId,
  loadHiddenDemoContacts,
  type ArkContact,
} from '@/lib/arkSocial';
import { formatArkId, isArkUserId, normalizeArkId } from '@/lib/arkUserId';
import { GuestSocialBanner } from '@/components/GuestSocialBanner';
import { ConnectShell } from '@/components/ConnectShell';
import { buildDemoContacts, buildDemoThread } from '@/lib/socialDemo';
import { threadPreview } from '@/lib/arkSocial';
import { ArkAvatar } from '@/components/ArkAvatar';

export function CallView() {
  const { profile } = useAuth();
  const { route, navigate } = useRouter();
  const { contacts, inviteByArkId } = useSocial();
  const { session, startCall, hangUp, toggleMute, elapsedSec, demoSimulateAnswer } = useCall();
  const myArkId = profile?.ark_id || '';
  const peer = route.name === 'call' ? route.peer : undefined;
  const [addId, setAddId] = useState('');
  const [railCompact, setRailCompact] = useState(false);

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
    window.addEventListener('NOVA:compact-connect-rail', compact);
    return () => window.removeEventListener('NOVA:compact-connect-rail', compact);
  }, []);

  useEffect(() => {
    if (peer && !session) startCall(peer, people.find(c => c.arkId === peer)?.displayName);
  }, [peer]); // eslint-disable-line react-hooks/exhaustive-deps -- dial when opening /call/:peer

  const activePeer = session?.peerArkId || peer;
  const person = people.find(c => c.arkId === activePeer);
  const phase = session?.phase || 'idle';

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
                    placeholder="NOVA ID"
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
                      startCall(id);
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
                onClick={() => {
                  navigate({ name: 'call', peer: c.arkId });
                  startCall(c.arkId, c.displayName);
                }}
                className={`w-full flex items-center gap-2.5 text-left rounded-xl ${
                  railCompact ? 'justify-center py-2' : 'px-2.5 py-3'
                } ${activePeer === c.arkId ? 'bg-surface-hover' : 'hover:bg-surface-hover/60'}`}
              >
                <ArkAvatar name={c.displayName} size="md" />
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
        {!activePeer ? (
          <p className="text-sm text-content-tertiary max-w-sm">
            Call another NOVA user by their 7-digit ID. The call bar stays visible while you browse other tabs.
          </p>
        ) : (
          <>
            <div className={`w-20 h-20 rounded-2xl border flex items-center justify-center mb-4 ${
              phase === 'live' ? 'border-rose-400/40 bg-rose-500/10' : phase === 'outgoing' ? 'border-amber-400/40 bg-amber-500/10 animate-pulse' : 'bg-surface-hover border-surface-border'
            }`}>
              <ArkAvatar name={person?.displayName || activePeer || 'NOVA'} size="lg" className="!h-14 !w-14 !border-0 !bg-transparent" />
            </div>
            <p className="text-lg font-medium text-content-primary">{person?.displayName || formatArkId(activePeer)}</p>
            <p className="text-xs font-mono tracking-wider text-content-tertiary mt-1">{formatArkId(activePeer)}</p>
            <p className="text-sm text-content-secondary mt-3">
              {phase === 'outgoing' && 'Ringing…'}
              {phase === 'connecting' && 'Connecting voice…'}
              {phase === 'live' && `On a call · ${formatCallElapsed(elapsedSec)}`}
              {phase === 'ended' && 'Call ended'}
              {phase === 'idle' && 'Ready'}
            </p>
            {session?.error && <p className="text-xs text-amber-200/90 mt-2 max-w-sm">{session.error}</p>}
            <div className="flex items-center gap-3 mt-8">
              {phase === 'live' && session && (
                <button
                  type="button"
                  onClick={toggleMute}
                  className="w-12 h-12 rounded-full border border-surface-border flex items-center justify-center text-content-secondary hover:text-content-primary"
                >
                  {session.muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}
              {phase === 'outgoing' && (
                <button
                  type="button"
                  onClick={demoSimulateAnswer}
                  className="rounded-full border border-violet-400/30 bg-violet-500/15 px-4 py-2 text-xs text-violet-200"
                >
                  Demo answer
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (phase === 'ended' || phase === 'idle') {
                    startCall(activePeer, person?.displayName);
                    return;
                  }
                  hangUp();
                }}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-white ${
                  phase === 'ended' || phase === 'idle' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                {phase === 'ended' || phase === 'idle' ? <Phone className="w-5 h-5" /> : <PhoneOff className="w-5 h-5" />}
              </button>
            </div>
          </>
        )}
      </div>
    </ConnectShell>
  );
}
