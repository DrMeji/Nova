import type { LiveCapacity } from '@/lib/arkCapacity';

type Props = {
  capacity: LiveCapacity | null;
  className?: string;
};

/** Compact live-capacity strip: local ready · free keys · chat on/off. */
export function CapacityMeter({ capacity, className = '' }: Props) {
  if (!capacity) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] text-content-tertiary ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary" />
        Checking capacity...
      </span>
    );
  }

  const localLabel = capacity.localGguf
    ? 'Local ready'
    : capacity.ollama
      ? 'Ollama ready'
      : 'Local off';
  const keysLabel = capacity.keyCount
    ? `${capacity.keyCount} free key${capacity.keyCount === 1 ? '' : 's'}`
    : 'No keys';
  const chatLabel = capacity.liveChat ? 'Chat on' : 'Chat off';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] text-content-tertiary ${className}`}
      title={capacity.summary}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          capacity.liveChat ? 'bg-emerald-400' : 'bg-content-tertiary'
        }`}
      />
      <span className="truncate">
        {localLabel}
        <span className="text-content-tertiary/50 mx-1">·</span>
        {keysLabel}
        <span className="text-content-tertiary/50 mx-1">·</span>
        {chatLabel}
      </span>
    </span>
  );
}
