/** Presence / online status for NOVA Connect (Message list + sidebar). */

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'inactive';

export const PRESENCE_OPTIONS: {
  id: PresenceStatus;
  label: string;
  hint?: string;
}[] = [
  { id: 'online', label: 'Online' },
  { id: 'idle', label: 'Idle' },
  { id: 'dnd', label: 'Do Not Disturb', hint: 'You will not receive desktop notifications.' },
  { id: 'inactive', label: 'Inactive', hint: 'You will appear offline.' },
];

/** Solid status circle. same shape for every status, only the color changes. */
export function presenceDotClass(status: PresenceStatus): string {
  if (status === 'online') return 'bg-emerald-400';
  if (status === 'idle') return 'bg-amber-400';
  if (status === 'dnd') return 'bg-rose-500';
  return 'bg-zinc-500';
}

/** Letter / monogram color inside the profile icon. */
export function presenceTextClass(status: PresenceStatus): string {
  if (status === 'online') return 'text-emerald-400';
  if (status === 'idle') return 'text-amber-400';
  if (status === 'dnd') return 'text-rose-500';
  return 'text-zinc-400';
}

/** Border around the sidebar profile avatar (first box). */
export function presenceRingClass(status: PresenceStatus): string {
  if (status === 'online') return 'border-emerald-400/80 ring-1 ring-emerald-400/35';
  if (status === 'idle') return 'border-amber-400/80 ring-1 ring-amber-400/35';
  if (status === 'dnd') return 'border-rose-500/90 ring-1 ring-rose-500/40';
  return 'border-zinc-500/70 ring-1 ring-zinc-500/25';
}

/** NOVA ID / DEV label under the name. matches presence. */
export function presenceIdClass(status: PresenceStatus): string {
  if (status === 'online') return 'text-emerald-400/90';
  if (status === 'idle') return 'text-amber-400/90';
  if (status === 'dnd') return 'text-rose-400';
  return 'text-zinc-500';
}

export function presenceLabel(status: PresenceStatus): string {
  return PRESENCE_OPTIONS.find(o => o.id === status)?.label || 'Online';
}

/** Relative time for message list (2m, 15m, 1h, 2h, 1w, …). */
export function formatActivityAge(iso: string | undefined | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${Math.max(1, months)}mo`;
}

/** Demo statuses for Message contacts (preview). */
export function demoPresenceFor(arkId: string): PresenceStatus {
  const map: Record<string, PresenceStatus> = {
    '4820193': 'online',
    '7193044': 'idle',
    '3301882': 'online',
    '9056711': 'online',
    '2288440': 'dnd',
    '6612039': 'inactive',
    '1044882': 'idle',
    '8733001': 'online',
    '5521190': 'online',
    '4482011': 'dnd',
    '9910334': 'idle',
    '7766502': 'inactive',
    '3344556': 'online',
    '2200987': 'inactive',
  };
  return map[arkId] || 'online';
}
