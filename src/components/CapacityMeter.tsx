import type { LiveCapacity } from '@/lib/arkCapacity';

type Props = {
  capacity: LiveCapacity | null;
  /** Which surface this meter is describing */
  kind?: 'chat' | 'image' | 'video';
  className?: string;
};

function mediaReady(capacity: LiveCapacity, kind: 'chat' | 'image' | 'video') {
  if (kind === 'image') return capacity.imageFree || capacity.openaiImage || Boolean(capacity.keyCount);
  if (kind === 'video') return capacity.videoFree;
  return capacity.liveChat;
}

/** Compact live-capacity strip for Chat / Image / Video. */
export function CapacityMeter({ capacity, kind = 'chat', className = '' }: Props) {
  if (!capacity) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] text-content-tertiary ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary" />
        Checking capacity…
      </span>
    );
  }

  const ready = mediaReady(capacity, kind);
  const localLabel = capacity.localGguf
    ? 'Local ready'
    : capacity.ollama
      ? 'Ollama ready'
      : 'Local off';
  const keysLabel = capacity.keyCount
    ? `${capacity.keyCount} key${capacity.keyCount === 1 ? '' : 's'}`
    : 'No keys';

  let modeLabel: string;
  if (kind === 'image') {
    modeLabel = capacity.openaiImage || capacity.imageFree
      ? 'Image on'
      : capacity.keyCount
        ? 'Image limited'
        : 'Image off';
  } else if (kind === 'video') {
    modeLabel = capacity.videoFree ? 'Video trying free' : 'Video offline';
  } else {
    modeLabel = capacity.liveChat ? 'Chat on' : 'Chat off';
  }

  const title =
    kind === 'image'
      ? (ready
        ? 'Image path available (free host and/or keys)'
        : 'No live image path — add Hugging Face / OpenAI or use desktop Engine')
      : kind === 'video'
        ? (ready
          ? 'Video will try free/cloud MP4 routes; may fall back to a labeled preview'
          : 'Video needs desktop Engine online')
        : capacity.summary;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] text-content-tertiary ${className}`}
      title={title}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          ready ? 'bg-emerald-400' : 'bg-amber-400/80'
        }`}
      />
      <span className="truncate">
        {localLabel}
        <span className="text-content-tertiary/50 mx-1">·</span>
        {keysLabel}
        <span className="text-content-tertiary/50 mx-1">·</span>
        {modeLabel}
      </span>
    </span>
  );
}
