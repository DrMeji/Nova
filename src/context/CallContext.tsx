import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  ArkVoiceCall, sendCallSignal, subscribeUserSignals, type CallSignal, type IncomingCall,
} from '@/lib/arkCall';
import { playCallConnected, playCallEnded, startCallRingtone, stopCallRingtone } from '@/lib/callSounds';
import { isRevealed } from '@/lib/featurePark';
import { isArkDevEmail } from '@/lib/arkDevAccount';
import { SOCIAL_DEMO_ENABLED } from '@/lib/socialDemo';
import { notifyWorkDone } from '@/lib/activityIndicators';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'live' | 'ended';

export type CallParticipant = { arkId: string; name: string };

export type CallSession = {
  peerArkId: string;
  peerName: string;
  phase: CallPhase;
  isCaller: boolean;
  muted: boolean;
  error: string;
  liveStartedAt: number | null;
  groupId?: string;
  groupName?: string;
  participants?: CallParticipant[];
};

type CallContextValue = {
  session: CallSession | null;
  incoming: IncomingCall | null;
  elapsedSec: number;
  /** For the Message header call button when this peer is active. */
  peerCallVisual: (peerArkId: string) => 'idle' | 'ringing' | 'live';
  groupCallVisual: (groupId: string) => 'idle' | 'ringing' | 'live';
  startCall: (peerArkId: string, peerName?: string) => void;
  startGroupCall: (opts: { groupId: string; groupName: string; participants: CallParticipant[] }) => void;
  acceptIncoming: () => void;
  declineIncoming: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  /** Dev-only: pretend the other person answered. */
  demoSimulateAnswer: () => void;
  /** Dev-only: simulate an incoming call from someone. */
  demoSimulateIncoming: (peerArkId: string, peerName?: string) => void;
};

const CallContext = createContext<CallContextValue | undefined>(undefined);

const RING_MS = 45_000;

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export { formatElapsed as formatCallElapsed };

export function CallProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const myArkId = isArkDevEmail(user?.email) ? 'DEV' : (profile?.ark_id || '');
  const myName = profile?.display_name || myArkId || 'NOVA user';
  const [session, setSession] = useState<CallSession | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const callRef = useRef<ArkVoiceCall | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const liveTimerRef = useRef<number | null>(null);
  const sessionRef = useRef<CallSession | null>(null);

  sessionRef.current = session;

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current != null) {
      window.clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }, []);

  const stopMedia = useCallback(() => {
    callRef.current?.stop();
    callRef.current = null;
  }, []);

  const patchSession = useCallback((patch: Partial<CallSession>) => {
    setSession(prev => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const hangUp = useCallback(() => {
    const cur = sessionRef.current;
    clearRingTimer();
    stopCallRingtone();
    if (cur && myArkId) {
      void sendCallSignal({ kind: 'hangup', from: myArkId, to: cur.peerArkId }, user?.id);
    }
    stopMedia();
    playCallEnded();
    setSession(null);
    setIncoming(null);
  }, [myArkId, user?.id, clearRingTimer, stopMedia]);

  const beginLive = useCallback((liveStartedAt: number) => {
    clearRingTimer();
    stopCallRingtone();
    playCallConnected();
    setIncoming(null);
    patchSession({ phase: 'live', liveStartedAt, error: '' });
  }, [clearRingTimer, patchSession]);

  const startMedia = useCallback(async (peerArkId: string, isCaller: boolean) => {
    if (!myArkId) return;
    patchSession({ phase: 'connecting', error: '' });
    try {
      const voice = new ArkVoiceCall(myArkId, peerArkId, user?.id || null, state => {
        if (state === 'live') beginLive(Date.now());
        if (state === 'ended') {
          playCallEnded();
          setSession(null);
        }
        if (state === 'connecting') patchSession({ phase: 'connecting' });
      });
      callRef.current = voice;
      await voice.start(isCaller);
    } catch (err) {
      stopMedia();
      setSession(null);
    }
  }, [myArkId, user?.id, patchSession, beginLive, stopMedia]);

  const handleRemoteSignal = useCallback((signal: CallSignal) => {
    const cur = sessionRef.current;
    if (signal.kind === 'ring' && signal.from) {
      if (cur && cur.phase !== 'idle' && cur.phase !== 'ended') return;
      const name = typeof signal.payload?.name === 'string' ? signal.payload.name : signal.from;
      setIncoming({ from: signal.from, fromName: name });
      startCallRingtone();
      if (isRevealed('call')) notifyWorkDone('call');
      return;
    }
    if (!cur || signal.from !== cur.peerArkId) return;
    if (signal.kind === 'accept') {
      clearRingTimer();
      stopCallRingtone();
      void startMedia(cur.peerArkId, cur.isCaller);
    }
    if (signal.kind === 'decline') {
      clearRingTimer();
      stopCallRingtone();
      stopMedia();
      setSession(null);
    }
    if (signal.kind === 'hangup') {
      hangUp();
    }
  }, [clearRingTimer, startMedia, patchSession, stopMedia, hangUp]);

  useEffect(() => {
    if (!myArkId) return;
    const unsub = subscribeUserSignals(myArkId, handleRemoteSignal);
    const onLocal = (ev: Event) => {
      const signal = (ev as CustomEvent<CallSignal>).detail;
      if (signal) handleRemoteSignal(signal);
    };
    window.addEventListener('NOVA:call-signal', onLocal);
    return () => {
      unsub();
      window.removeEventListener('NOVA:call-signal', onLocal);
    };
  }, [myArkId, handleRemoteSignal]);

  useEffect(() => {
    if (session?.phase !== 'live' || !session.liveStartedAt) {
      setElapsedSec(0);
      if (liveTimerRef.current != null) {
        window.clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      return;
    }
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - session.liveStartedAt!) / 1000)));
    };
    tick();
    liveTimerRef.current = window.setInterval(tick, 1000);
    return () => {
      if (liveTimerRef.current != null) window.clearInterval(liveTimerRef.current);
    };
  }, [session?.phase, session?.liveStartedAt]);

  useEffect(() => {
    callRef.current?.setMuted(Boolean(session?.muted));
  }, [session?.muted]);

  useEffect(() => () => {
    clearRingTimer();
    stopCallRingtone();
    stopMedia();
  }, [clearRingTimer, stopMedia]);

  const beginOutgoingSession = useCallback((
    peerArkId: string,
    peerName: string,
    extra?: Partial<CallSession>,
  ) => {
    stopMedia();
    setIncoming(null);
    setSession({
      peerArkId,
      peerName,
      phase: 'outgoing',
      isCaller: true,
      muted: false,
      error: '',
      liveStartedAt: null,
      ...extra,
    });
    startCallRingtone();
    void sendCallSignal({
      kind: 'ring',
      from: myArkId,
      to: peerArkId,
      payload: { name: myName },
    }, user?.id);

    clearRingTimer();
    ringTimerRef.current = window.setTimeout(() => {
      const cur = sessionRef.current;
      if (!cur || cur.phase !== 'outgoing') return;
      stopCallRingtone();
      void sendCallSignal({ kind: 'hangup', from: myArkId, to: peerArkId }, user?.id);
      setSession(null);
    }, RING_MS);
  }, [myArkId, myName, user?.id, stopMedia, clearRingTimer, patchSession]);

  const startCall = useCallback((peerArkId: string, peerName?: string) => {
    if (!myArkId || peerArkId === myArkId) return;
    if (!isRevealed('call')) return;
    beginOutgoingSession(peerArkId, peerName?.trim() || peerArkId);
  }, [myArkId, beginOutgoingSession]);

  const startGroupCall = useCallback((opts: {
    groupId: string;
    groupName: string;
    participants: CallParticipant[];
  }) => {
    if (!myArkId || !isRevealed('call')) return;
    const remote = opts.participants.filter(p => p.arkId !== myArkId);
    if (!remote.length) return;
    const primary = remote[0];
    beginOutgoingSession(primary.arkId, opts.groupName.trim() || opts.groupId, {
      groupId: opts.groupId,
      groupName: opts.groupName,
      participants: remote,
    });
  }, [myArkId, beginOutgoingSession]);

  const acceptIncoming = useCallback(() => {
    const inc = incoming;
    if (!inc || !myArkId) return;
    stopCallRingtone();
    setSession({
      peerArkId: inc.from,
      peerName: inc.fromName || inc.from,
      phase: 'connecting',
      isCaller: false,
      muted: false,
      error: '',
      liveStartedAt: null,
    });
    setIncoming(null);
    void sendCallSignal({ kind: 'accept', from: myArkId, to: inc.from }, user?.id);
    void startMedia(inc.from, false);
  }, [incoming, myArkId, user?.id, startMedia]);

  const declineIncoming = useCallback(() => {
    if (!incoming || !myArkId) return;
    stopCallRingtone();
    void sendCallSignal({ kind: 'decline', from: myArkId, to: incoming.from }, user?.id);
    setIncoming(null);
  }, [incoming, myArkId, user?.id]);

  const toggleMute = useCallback(() => {
    setSession(prev => (prev ? { ...prev, muted: !prev.muted } : prev));
  }, []);

  const demoSimulateAnswer = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur || cur.phase !== 'outgoing' || !SOCIAL_DEMO_ENABLED) return;
    clearRingTimer();
    beginLive(Date.now());
  }, [clearRingTimer, beginLive]);

  const demoSimulateIncoming = useCallback((peerArkId: string, peerName?: string) => {
    if (!SOCIAL_DEMO_ENABLED || sessionRef.current) return;
    setIncoming({ from: peerArkId, fromName: peerName || peerArkId });
    startCallRingtone();
  }, []);

  const peerCallVisual = useCallback((peerArkId: string): 'idle' | 'ringing' | 'live' => {
    const cur = sessionRef.current;
    if (!cur || cur.groupId || cur.peerArkId !== peerArkId) return 'idle';
    if (cur.phase === 'live') return 'live';
    if (cur.phase === 'outgoing' || cur.phase === 'connecting') return 'ringing';
    return 'idle';
  }, []);

  const groupCallVisual = useCallback((groupId: string): 'idle' | 'ringing' | 'live' => {
    const cur = sessionRef.current;
    if (!cur || cur.groupId !== groupId) return 'idle';
    if (cur.phase === 'live') return 'live';
    if (cur.phase === 'outgoing' || cur.phase === 'connecting') return 'ringing';
    return 'idle';
  }, []);

  const value = useMemo(
    () => ({
      session,
      incoming,
      elapsedSec,
      peerCallVisual,
      groupCallVisual,
      startCall,
      startGroupCall,
      acceptIncoming,
      declineIncoming,
      hangUp,
      toggleMute,
      demoSimulateAnswer,
      demoSimulateIncoming,
    }),
    [
      session, incoming, elapsedSec, peerCallVisual, groupCallVisual,
      startCall, startGroupCall, acceptIncoming, declineIncoming, hangUp, toggleMute, demoSimulateAnswer, demoSimulateIncoming,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
