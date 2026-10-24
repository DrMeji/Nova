/** Create kind picker: website / game / utility / dashboard */
export type CreateKindId = 'website' | 'game' | 'utility' | 'dashboard';

const KINDS: Array<{ id: CreateKindId; label: string }> = [
  { id: 'website', label: 'Website' },
  { id: 'game', label: 'Game' },
  { id: 'utility', label: 'Utility' },
  { id: 'dashboard', label: 'Dashboard' },
];

export function CreateKindPicker({
  value: _value,
  onChange: _onChange,
  disabled = false,
}: {
  value: CreateKindId;
  onChange: (k: CreateKindId) => void;
  /** Parked until invent kind sticky is wired — labels only, not clickable. */
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
      data-nova-create-kind-picker="1"
      role="group"
      aria-label="Create kind — coming soon"
      aria-disabled={disabled || undefined}
    >
      {KINDS.map((k) => (
        <span
          key={k.id}
          className={
            disabled
              ? 'text-[11px] font-medium text-content-tertiary/55 select-none pointer-events-none'
              : 'text-[11px] font-medium text-content-secondary select-none'
          }
          aria-hidden={disabled || undefined}
        >
          {k.label}
        </span>
      ))}
    </div>
  );
}
