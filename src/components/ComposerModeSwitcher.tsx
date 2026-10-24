/**
 * Ask / Plan / Act mode switcher — always visible in composer chrome.
 */
export type ComposerModeId = 'ask' | 'plan' | 'act';

const MODES: Array<{ id: ComposerModeId; label: string }> = [
  { id: 'ask', label: 'Ask' },
  { id: 'plan', label: 'Plan' },
  { id: 'act', label: 'Act' },
];

export function ComposerModeSwitcher({
  value,
  onChange,
}: {
  value: ComposerModeId;
  onChange: (m: ComposerModeId) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-stroke-subtle bg-surface-raised p-0.5"
      data-nova-composer-mode-switcher="1"
      role="tablist"
      aria-label="Ask Plan Act mode switcher"
    >
      {MODES.map((m) => {
        const on = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(m.id)}
            className={
              on
                ? 'px-2 py-1 text-[11px] font-semibold rounded-md bg-amber-500/20 text-amber-100'
                : 'px-2 py-1 text-[11px] font-medium rounded-md text-content-secondary hover:text-content-primary'
            }
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
