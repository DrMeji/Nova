/** Live status line inside the assistant bubble (Thinking → Exploring → …). */

export function AgentProgressStatus({ label }: { label: string }) {
  const shown = label?.trim() || 'Thinking…';
  return (
    <div className="flex items-center gap-2.5 py-0.5 min-w-0 max-w-full" aria-live="polite" aria-label={shown}>
      <span className="inline-flex items-center gap-1.5 shrink-0" aria-hidden>
        <span className="ark-status-dot" />
        <span className="ark-status-dot ark-status-dot-2" />
        <span className="ark-status-dot ark-status-dot-3" />
      </span>
      <span className="min-w-0 flex-1 text-[13px] font-medium text-content-secondary tracking-wide break-words [overflow-wrap:anywhere]">
        {shown}
      </span>
    </div>
  );
}
