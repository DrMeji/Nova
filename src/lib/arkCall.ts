/**
 * Voice calls between NOVA IDs. Signaling over Supabase Realtime + Postgres;
 * media is peer-to-peer WebRTC (STUN + optional TURN from env).
 */

import { supabase } from '@/lib/supabase';
import { canUseCloud } from '@/lib/arkSocial';

export type CallSignal = {
  kind: 'ring' | 'accept' | 'decline' | 'hangup' | 'offer' | 'answer' | 'ice';
  from: string;
  to: string;
  payload?: Record<string, unknown>;
};

export type IncomingCall = {
  from: string;
  fromName?: string;
};

const PERSIST_KINDS = new Set<CallSignal['kind']>(['ring', 'accept', 'decline', 'hangup', 'offer', 'answer', 'ice']);

function buildIceConfig(): RTCConfiguration {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrl = (import.meta.env.VITE_TURN_URL as string | undefined)?.trim();
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: (import.meta.env.VITE_TURN_USERNAME as string | undefined)?.trim() || undefined,
      credential: (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined)?.trim() || undefined,
    });
  }
  return { iceServers: servers };
}

const ICE = buildIceConfig();

function pairChannel(a: string, b: string) {
  return `NOVA-call-${[a, b].sort().join('-')}`;
}

function userChannel(arkId: string) {
  return `NOVA-user-${arkId}`;
}

function rowToSignal(row: Record<string, unknown>): CallSignal {
  return {
    kind: String(row.kind) as CallSignal['kind'],
    from: String(row.from_ark_id),
    to: String(row.to_ark_id),
    payload: (row.payload as Record<string, unknown>) || {},
  };
}

async function persistSignal(signal: CallSignal, userId?: string | null) {
  if (!canUseCloud(userId) || !PERSIST_KINDS.has(signal.kind)) return;
  try {
    await supabase.from('ark_call_signals').insert({
      from_ark_id: signal.from,
      to_ark_id: signal.to,
      kind: signal.kind,
      payload: signal.payload || {},
    });
  } catch {
    /* ignore */
  }
}

export async function sendCallSignal(signal: CallSignal, userId?: string | null) {
  const sendOn = (name: string) => new Promise<void>(resolve => {
    const ch = supabase.channel(name, { config: { broadcast: { self: false } } });
    ch.subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      void ch.send({ type: 'broadcast', event: 'NOVA-call', payload: signal }).finally(() => {
        void supabase.removeChannel(ch);
        resolve();
      });
    });
    window.setTimeout(() => resolve(), 2500);
  });
  await Promise.all([
    sendOn(userChannel(signal.to)),
    sendOn(pairChannel(signal.from, signal.to)),
  ]);
  await persistSignal(signal, userId);
}

/** Catch signals delivered while the app was offline or Realtime was reconnecting. */
export async function fetchRecentCallSignals(myArkId: string, peerArkId?: string, sinceMs = 90_000): Promise<CallSignal[]> {
  if (!myArkId) return [];
  const since = new Date(Date.now() - sinceMs).toISOString();
  try {
    let q = supabase
      .from('ark_call_signals')
      .select('*')
      .eq('to_ark_id', myArkId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(120);
    if (peerArkId) {
      q = q.eq('from_ark_id', peerArkId);
    }
    const { data, error } = await q;
    if (error || !data) return [];
    return data.map(r => rowToSignal(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

export function subscribeUserSignals(myArkId: string, onSignal: (signal: CallSignal) => void) {
  const seen = new Set<string>();
  const deliver = (signal: CallSignal, id?: string) => {
    if (signal?.to !== myArkId || !signal.from) return;
    const key = id || `${signal.kind}-${signal.from}-${JSON.stringify(signal.payload || {}).slice(0, 80)}`;
    if (seen.has(key)) return;
    seen.add(key);
    onSignal(signal);
  };

  void fetchRecentCallSignals(myArkId).then(rows => {
    rows.forEach(r => deliver(r, `${r.kind}-${r.from}-${Date.now()}`));
  });

  const ch = supabase
    .channel(userChannel(myArkId))
    .on('broadcast', { event: 'NOVA-call' }, ({ payload }) => {
      deliver(payload as CallSignal);
    })
    .subscribe();

  const table = supabase
    .channel(`NOVA-call-table-${myArkId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ark_call_signals' },
      payload => {
        const row = payload.new as Record<string, unknown>;
        if (String(row.to_ark_id) !== myArkId) return;
        deliver(rowToSignal(row), String(row.id));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(ch);
    void supabase.removeChannel(table);
  };
}

export function subscribeCallPair(myArkId: string, peerArkId: string, onSignal: (signal: CallSignal) => void) {
  const seen = new Set<string>();
  const deliver = (signal: CallSignal) => {
    if (!signal?.kind || signal.from === myArkId) return;
    const key = `${signal.kind}-${signal.from}-${JSON.stringify(signal.payload || {}).slice(0, 120)}`;
    if (seen.has(key)) return;
    seen.add(key);
    onSignal(signal);
  };

  void fetchRecentCallSignals(myArkId, peerArkId).then(rows => {
    rows.forEach(deliver);
  });

  const ch = supabase
    .channel(pairChannel(myArkId, peerArkId))
    .on('broadcast', { event: 'NOVA-call' }, ({ payload }) => {
      deliver(payload as CallSignal);
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

export class ArkVoiceCall {
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private remote: MediaStream | null = null;
  private unsub: (() => void) | null = null;
  remoteAudio: HTMLAudioElement | null = null;

  constructor(
    private me: string,
    private peer: string,
    private userId: string | null,
    private onState: (state: 'connecting' | 'live' | 'ended' | string) => void,
  ) {}

  async start(isCaller: boolean) {
    this.local = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.pc = new RTCPeerConnection(ICE);
    this.local.getTracks().forEach(t => this.pc?.addTrack(t, this.local!));
    this.remote = new MediaStream();
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;
    this.remoteAudio.srcObject = this.remote;

    this.pc.ontrack = ev => {
      ev.streams[0]?.getTracks().forEach(t => this.remote?.addTrack(t));
      if (this.remoteAudio) this.remoteAudio.srcObject = this.remote;
      this.onState('live');
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc?.connectionState;
      if (s === 'connected') this.onState('live');
      if (s === 'failed' || s === 'disconnected' || s === 'closed') this.onState('ended');
    };
    this.pc.onicecandidate = ev => {
      if (!ev.candidate) return;
      void sendCallSignal({
        kind: 'ice',
        from: this.me,
        to: this.peer,
        payload: { candidate: ev.candidate.toJSON() },
      }, this.userId);
    };

    this.unsub = subscribeCallPair(this.me, this.peer, signal => {
      void this.handle(signal);
    });

    if (isCaller) {
      this.onState('connecting');
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await sendCallSignal({
        kind: 'offer',
        from: this.me,
        to: this.peer,
        payload: { sdp: offer },
      }, this.userId);
    }
  }

  private async handle(signal: CallSignal) {
    if (!this.pc) return;
    if (signal.kind === 'offer' && signal.payload?.sdp) {
      await this.pc.setRemoteDescription(signal.payload.sdp as RTCSessionDescriptionInit);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await sendCallSignal({
        kind: 'answer',
        from: this.me,
        to: this.peer,
        payload: { sdp: answer },
      }, this.userId);
    }
    if (signal.kind === 'answer' && signal.payload?.sdp) {
      await this.pc.setRemoteDescription(signal.payload.sdp as RTCSessionDescriptionInit);
    }
    if (signal.kind === 'ice' && signal.payload?.candidate) {
      try {
        await this.pc.addIceCandidate(signal.payload.candidate as RTCIceCandidateInit);
      } catch {
        /* ignore */
      }
    }
    if (signal.kind === 'hangup' || signal.kind === 'decline') {
      this.stop();
    }
  }

  setMuted(muted: boolean) {
    this.local?.getAudioTracks().forEach(t => {
      t.enabled = !muted;
    });
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
    this.pc?.getSenders().forEach(s => s.track?.stop());
    this.local?.getTracks().forEach(t => t.stop());
    this.pc?.close();
    this.pc = null;
    this.local = null;
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
    }
    this.onState('ended');
  }
}
