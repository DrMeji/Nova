/**
 * Lightweight coding-worker DAG viewer (Missing-tab Agents gap).
 * Shows understand→prep→scaffold→craft→verify→premium→done as a graph strip.
 */
import { CODING_PIPELINE_STEPS } from '@/lib/codingQualityWinPack';

export function CodingWorkerDagPanel() {
  const steps = [...CODING_PIPELINE_STEPS];
  return (
    <section
      className="rounded-xl border border-stroke-subtle bg-surface-raised px-3 py-3 mb-4"
      data-nova-coding-dag="1"
      aria-label="Coding worker DAG"
    >
      <h3 className="text-sm font-semibold text-content-primary mb-1">Coding worker DAG</h3>
      <p className="text-[12px] text-content-secondary mb-3 leading-relaxed">
        Create/agent order Nova follows for “build me X”. Each node must pass before Ready.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="rounded-lg border border-sky-500/35 bg-sky-500/10 px-2.5 py-1.5 text-[12px] font-medium text-sky-100">
              {s}
            </div>
            {i < steps.length - 1 ? (
              <span className="text-content-muted text-xs" aria-hidden>
                →
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
