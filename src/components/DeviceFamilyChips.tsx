import { Laptop, Smartphone, Tablet } from 'lucide-react';
import type { DeviceFamilyKind, MobilePlatform } from '@/lib/mobileDevices';

const ROWS: Record<Exclude<MobilePlatform, 'both'>, { id: DeviceFamilyKind; label: string; icon: typeof Smartphone }[]> = {
  ios: [
    { id: 'phone', label: 'iPhone', icon: Smartphone },
    { id: 'tablet', label: 'iPad', icon: Tablet },
    { id: 'computer', label: 'Mac', icon: Laptop },
  ],
  android: [
    { id: 'phone', label: 'Phone', icon: Smartphone },
    { id: 'tablet', label: 'Tablet', icon: Tablet },
    { id: 'computer', label: 'Laptop', icon: Laptop },
  ],
};

export function DeviceFamilyChips({
  platform,
  onPick,
}: {
  platform: MobilePlatform;
  onPick: (family: DeviceFamilyKind) => void;
}) {
  const items = platform === 'both'
    ? [
        { id: 'phone' as const, label: 'Phone', icon: Smartphone },
        { id: 'tablet' as const, label: 'Tablet', icon: Tablet },
        { id: 'computer' as const, label: 'Computer', icon: Laptop },
      ]
    : ROWS[platform];

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => onPick(item.id)}
          className="min-w-[5.5rem] flex flex-col items-center gap-1.5 rounded-xl border border-surface-border bg-nova-navy-950/60 px-3 py-2.5 text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
        >
          <item.icon className="w-5 h-5 text-sky-400" />
          <span className="text-[11px] font-medium">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
