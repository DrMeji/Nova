/**
 * Diff review before apply — shows patch confidence + diff snippet.
 */
export function DiffReviewPanel({
  path,
  diff,
  confidenceLabel,
  onApply,
  onReject,
}: {
  path: string;
  diff?: string;
  confidenceLabel?: string;
  onApply?: () => void;
  onReject?: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-stroke-subtle bg-surface-raised p-3 space-y-2"
      data-nova-diff-review="1"
      aria-label="Diff review before apply"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-content-primary truncate">{path}</h3>
        {confidenceLabel ? (
          <span className="text-[11px] text-amber-100/90">{confidenceLabel}</span>
        ) : null}
      </div>
      <pre className="text-[11px] max-h-40 overflow-auto rounded-lg bg-black/30 p-2 text-content-secondary whitespace-pre-wrap">
        {diff || '(no diff)'}
      </pre>
      <div className="flex gap-2">
        {onReject ? (
          <button type="button" className="text-xs px-2 py-1 rounded border border-stroke-subtle" onClick={onReject}>
            Reject
          </button>
        ) : null}
        {onApply ? (
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
            onClick={onApply}
          >
            Apply patch
          </button>
        ) : null}
      </div>
    </section>
  );
}
