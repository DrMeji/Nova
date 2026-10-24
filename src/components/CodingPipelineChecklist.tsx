/**
 * Visible understand→prep→scaffold→craft→verify→premium→done strip.
 * Implements Missing-tab “pipeline step checklist” for coding create.
 */
import { codingPipelineChecklist } from '@/lib/codingCreatePipeline';

export function CodingPipelineChecklist({
  active,
  compact = false,
}: {
  active?: string | null;
  compact?: boolean;
}) {
  const steps = codingPipelineChecklist();
  return (
    <div
      className={
        compact
          ? 'flex flex-wrap gap-1 items-center'
          : 'rounded-xl border border-stroke-subtle bg-surface-raised px-3 py-2'
      }
      data-nova-coding-pipeline="1"
      aria-label="Coding pipeline understand through done"
    >
      {!compact ? (
        <p className="text-[11px] uppercase tracking-wide text-content-muted mb-1.5">
          Coding pipeline
        </p>
      ) : null}
      <ol className="flex flex-wrap gap-1">
        {steps.map((s, i) => {
          const on = active === s.id;
          return (
            <li key={s.id}>
              <span
                className={
                  on
                    ? 'inline-flex items-center rounded-md bg-amber-500/20 text-amber-100 border border-amber-400/40 px-1.5 py-0.5 text-[11px] font-medium'
                    : 'inline-flex items-center rounded-md border border-stroke-subtle text-content-secondary px-1.5 py-0.5 text-[11px]'
                }
              >
                {i + 1}. {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
