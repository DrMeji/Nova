import { Ban, Mic, MicOff, Phone, PhoneOff, Sparkles, UserMinus, UsersRound } from 'lucide-react';
import { useCall, formatCallElapsed, type CallSession } from '@/context/CallContext';
import { SOCIAL_DEMO_ENABLED } from '@/lib/socialDemo';
import { isRevealed } from '@/lib/featurePark';
import { useRouter } from '@/context/RouterContext';

export type CallRingMode = 'idle' | 'outgoing' | 'incoming' | 'live';

export function resolveCallRingMode(opts: {
  session: CallSession | null;
  incoming: boolean;
  isLive: boolean;
  isRinging: boolean;
}): CallRingMode {
  if (opts.incoming) return 'incoming';
  if (opts.isLive) return 'live';
  if (opts.isRinging) return 'outgoing';
  return 'idle';
}

export function callRingBorderClass(mode: CallRingMode): string {
  switch (mode) {
    case 'outgoing':
      return 'border-amber-500/70 ring-2 ring-amber-500/35 shadow-[0_0_20px_rgba(245,158,11,0.15)]';
    case 'incoming':
      return 'border-sky-500/70 ring-2 ring-sky-500/35 shadow-[0_0_20px_rgba(56,189,248,0.15)] animate-pulse';
    case 'live':
      return 'border-emerald-500/70 ring-2 ring-emerald-500/35 shadow-[0_0_20px_rgba(16,185,129,0.12)]';
    default:
      return 'border-white/10';
  }
}

function initials(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function StackedAvatars({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="h-7 w-7 rounded-full bg-white/10 border-2 border-ark-navy-950 flex items-center justify-center text-[9px] font-semibold text-content-primary"
          style={{ zIndex: shown.length - i }}
          title={name}
        >
          {initials(name)}
        </span>
      ))}
      {names.length > max && (
        <span className="h-7 w-7 rounded-full bg-white/5 border-2 border-ark-navy-950 flex items-center justify-center text-[9px] text-content-tertiary">
          +{names.length - max}
        </span>
      )}
    </div>
  );
}

type CallControlsProps = {
  mode: CallRingMode;
  muted: boolean;
  onCall: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onDemoAnswer?: () => void;
  compact?: boolean;
};

function CallControls({
  mode, muted, onCall, onHangUp, onToggleMute, onAccept, onDecline, onDemoAnswer, compact,
}: CallControlsProps) {
  if (mode === 'incoming') {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onDecline}
          className={`${compact ? 'h-6 px-2 text-[10px]' : 'h-7 px-2.5 text-[11px]'} rounded-full border border-white/10 text-content-secondary hover:text-rose-200`}
        >
          Decline
        </button>
        <button
          type="button"
          onClick={onAccept}
          className={`${compact ? 'h-6 px-2 text-[10px]' : 'h-7 px-2.5 text-[11px]'} rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-medium`}
        >
          Accept
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      {mode === 'live' && (
        <button
          type="button"
          onClick={onToggleMute}
          title={muted ? 'Unmute' : 'Mute'}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="h-7 w-7 rounded-full flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-white/5"
        >
          {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>
      )}
      {SOCIAL_DEMO_ENABLED && mode === 'outgoing' && onDemoAnswer && (
        <button
          type="button"
          onClick={onDemoAnswer}
          title="Demo: simulate answer"
          className="hidden sm:inline-flex items-center gap-0.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[9px] text-violet-200 hover:bg-violet-500/20"
        >
          <Sparkles className="w-3 h-3" />
          Demo
        </button>
      )}
      <button
        type="button"
        onClick={mode === 'idle' ? onCall : onHangUp}
        title={mode === 'idle' ? 'Call' : mode === 'outgoing' ? 'Cancel call' : 'End call'}
        aria-label={mode === 'idle' ? 'Call' : 'End call'}
        className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
          mode === 'live'
            ? 'bg-rose-500 text-white hover:bg-rose-400'
            : mode === 'outgoing'
              ? 'bg-amber-500 text-white hover:bg-amber-400 animate-pulse'
              : mode === 'idle'
                ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                : 'bg-rose-500 text-white hover:bg-rose-400'
        }`}
      >
        {mode === 'idle' ? <Phone className="w-3.5 h-3.5" /> : <PhoneOff className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

/** DM header pill. colored ring + bottom timer when live. */
export function MessageDmCallPill({
  displayName,
  peerArkId,
  onUnadd,
  onBlock,
  onDemoRing,
}: {
  displayName: string;
  peerArkId: string;
  onUnadd: () => void;
  onBlock: () => void;
  onDemoRing?: () => void;
}) {
  const {
    session, incoming, elapsedSec, peerCallVisual,
    startCall, hangUp, toggleMute, acceptIncoming, declineIncoming, demoSimulateAnswer,
  } = useCall();

  const isIncomingHere = Boolean(incoming?.from === peerArkId && !session);
  const visual = peerCallVisual(peerArkId);
  const isLive = visual === 'live';
  const isRinging = visual === 'ringing';
  const mode = resolveCallRingMode({ session, incoming: isIncomingHere, isLive, isRinging });
  const ring = callRingBorderClass(mode);
  const showTimer = mode === 'live';

  const onCall = () => {
    if (mode === 'idle') startCall(peerArkId, displayName);
    else hangUp();
  };

  return (
    <div className={`relative inline-flex items-center rounded-full border bg-ark-navy-950/80 shadow-sm transition-colors duration-300 ${ring}`}>
      <div className={`inline-flex items-center gap-1.5 pl-4 pr-1.5 ${showTimer || mode === 'outgoing' ? 'py-1.5' : 'py-1'}`}>
        <div className="min-w-0 flex flex-col justify-center">
          <p className="text-sm font-medium text-content-primary truncate max-w-[11rem] leading-tight">{displayName}</p>
          {showTimer && (
            <p className="text-[10px] font-mono tabular-nums text-content-tertiary leading-none mt-0.5">{formatCallElapsed(elapsedSec)}</p>
          )}
          {mode === 'outgoing' && !showTimer && (
            <p className="text-[9px] text-amber-300/80 leading-none mt-0.5">Ringing…</p>
          )}
        </div>
        {mode === 'idle' && (
          <>
            <button type="button" onClick={onUnadd} title="Unadd" aria-label="Unadd" className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-white/5">
              <UserMinus className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={onBlock} title="Block" aria-label="Block" className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-rose-300/90 hover:text-rose-200 hover:bg-rose-500/15">
              <Ban className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <CallControls
          mode={mode}
          muted={Boolean(session?.muted)}
          onCall={onCall}
          onHangUp={hangUp}
          onToggleMute={toggleMute}
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
          onDemoAnswer={demoSimulateAnswer}
        />
        {SOCIAL_DEMO_ENABLED && mode === 'idle' && onDemoRing && (
          <button type="button" onClick={onDemoRing} className="text-[9px] text-violet-300/80 hover:text-violet-200 underline underline-offset-2 pr-1">
            Demo ring
          </button>
        )}
      </div>
    </div>
  );
}

/** Group header pill. call + stacked member avatars when live. */
export function MessageGroupCallPill({
  groupId,
  groupName,
  memberNames,
  memberArkIds,
  onOpenDetails,
}: {
  groupId: string;
  groupName: string;
  memberNames: string[];
  memberArkIds: string[];
  onOpenDetails: () => void;
}) {
  const {
    session, elapsedSec, groupCallVisual,
    startGroupCall, hangUp, toggleMute, demoSimulateAnswer,
  } = useCall();

  const visual = groupCallVisual(groupId);
  const isLive = visual === 'live';
  const isRinging = visual === 'ringing';
  const mode = resolveCallRingMode({ session, incoming: false, isLive, isRinging });
  const ring = callRingBorderClass(mode);

  const participants = memberArkIds.map((id, i) => ({
    arkId: id,
    name: memberNames[i] || id,
  }));

  const onCall = () => {
    if (mode === 'idle') {
      startGroupCall({ groupId, groupName, participants });
    } else {
      hangUp();
    }
  };

  return (
    <div className={`relative inline-flex items-center rounded-full border bg-ark-navy-950/80 shadow-sm transition-colors duration-300 ${ring}`}>
      <div className={`inline-flex items-center gap-2 pl-3 pr-1.5 ${mode === 'live' || mode === 'outgoing' ? 'py-1.5' : 'py-1'}`}>
        <button type="button" onClick={onOpenDetails} className="inline-flex items-center gap-1.5 min-w-0 hover:opacity-90">
          {mode === 'live' || mode === 'outgoing' ? (
            <StackedAvatars names={memberNames.filter(Boolean)} />
          ) : (
            <UsersRound className="w-3.5 h-3.5 text-sky-300 shrink-0" />
          )}
          <div className="min-w-0 flex flex-col justify-center text-left">
            <p className="text-sm font-medium text-content-primary truncate max-w-[10rem] leading-tight">{groupName}</p>
            {mode === 'live' && (
              <p className="text-[10px] font-mono tabular-nums text-content-tertiary leading-none mt-0.5">{formatCallElapsed(elapsedSec)}</p>
            )}
            {mode === 'outgoing' && (
              <p className="text-[9px] text-amber-300/80 leading-none mt-0.5">Calling group…</p>
            )}
          </div>
          <span className="text-[10px] text-content-tertiary shrink-0">{memberArkIds.length}</span>
        </button>
        <CallControls
          mode={mode}
          muted={Boolean(session?.muted)}
          onCall={onCall}
          onHangUp={hangUp}
          onToggleMute={toggleMute}
          onDemoAnswer={demoSimulateAnswer}
        />
      </div>
    </div>
  );
}

/** Above sidebar profile when call is active but user left Message tab. */
export function SidebarCallDock() {
  const { route } = useRouter();
  const {
    session, incoming, elapsedSec, hangUp, toggleMute, acceptIncoming, declineIncoming, demoSimulateAnswer,
  } = useCall();

  if (!isRevealed('call')) return null;

  const onMessagePeer = route.name === 'message' && route.peer;
  const onMessageGroup = route.name === 'message' && route.groupId;

  const sessionShownOnMessage =
    (session && onMessagePeer && session.peerArkId === route.peer && !session.groupId)
    || (session && onMessageGroup && session.groupId === route.groupId);

  const incomingShownOnMessage =
    incoming && onMessagePeer && incoming.from === route.peer;

  if (sessionShownOnMessage || incomingShownOnMessage) return null;

  if (!session && !incoming) return null;
  if (session?.phase === 'ended') return null;

  const isIncoming = Boolean(incoming && !session);
  const isLive = session?.phase === 'live';
  const isRinging = session?.phase === 'outgoing' || session?.phase === 'connecting';
  const mode = resolveCallRingMode({ session, incoming: isIncoming, isLive, isRinging });
  const ring = callRingBorderClass(mode);

  const title = isIncoming
    ? (incoming!.fromName || incoming!.from)
    : (session!.groupName || session!.peerName);

  const avatarNames = session?.participants?.map(p => p.name)
    || (isIncoming ? [incoming!.fromName || incoming!.from] : [session!.peerName]);

  return (
    <div className={`mb-2 rounded-xl border bg-ark-navy-950/90 px-2.5 py-2 transition-colors ${ring}`}>
      <div className="flex items-center gap-2">
        {session?.participants && session.participants.length > 1 ? (
          <StackedAvatars names={avatarNames} max={3} />
        ) : (
          <span className="h-8 w-8 shrink-0 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[10px] font-semibold">
            {initials(avatarNames[0] || '?')}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-content-primary truncate">{title}</p>
          <p className="text-[10px] text-content-tertiary">
            {mode === 'live' && formatCallElapsed(elapsedSec)}
            {mode === 'outgoing' && 'Ringing…'}
            {mode === 'incoming' && 'Incoming call'}
            {session?.phase === 'connecting' && 'Connecting…'}
          </p>
        </div>
        <CallControls
          mode={mode}
          muted={Boolean(session?.muted)}
          compact
          onCall={() => session && hangUp()}
          onHangUp={hangUp}
          onToggleMute={toggleMute}
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
          onDemoAnswer={demoSimulateAnswer}
        />
      </div>
    </div>
  );
}

/** @deprecated Bottom bar removed. use Message pills + SidebarCallDock. */
export function ActiveCallBar() {
  return null;
}
