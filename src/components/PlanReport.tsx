import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, FileCode, Folder, HelpCircle, Map } from 'lucide-react';
import type { PlanReport as PlanReportData, PlanStep } from '@/lib/planReport';
import { countPlanSteps } from '@/lib/planReport';

function looksLikeFileNode(title: string): boolean {
  const t = String(title || '').trim().replace(/^[└├│─\s|]+/, '');
  if (!t || t.length > 80) return false;
  if (/[└├│─]/.test(title)) return true;
  if (/\.(?:html?|css|scss|js|jsx|ts|tsx|json|md|svg|png|vue|svelte)$/i.test(t)) return true;
  if (/^(?:src|public|assets|components|pages|lib|styles?|css|js|dist)(?:\/|\\|$)/i.test(t)) return true;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+$/.test(t)) return true;
  return false;
}

function FileTreeBranch({ steps, depth = 0 }: { steps: PlanStep[]; depth?: number }) {
  return (
    <ul className={`list-none m-0 p-0 font-mono text-[11px] ${depth ? 'ml-3 border-l border-white/10 pl-2' : ''}`}>
      {steps.map((node, i) => {
        const kids = node.children || [];
        const clean = node.title.replace(/^[└├│─\s|]+/, '');
        const isFolder = kids.length > 0 || /\/$/.test(clean) || !/\.[a-z0-9]+$/i.test(clean);
        return (
          <li key={`${depth}-${i}-${clean.slice(0, 24)}`} className="py-0.5">
            <div className="flex items-center gap-1.5 text-content-secondary min-w-0">
              {isFolder ? (
                <Folder className="w-3 h-3 shrink-0 text-sky-300/70" aria-hidden />
              ) : (
                <FileCode className="w-3 h-3 shrink-0 text-content-tertiary" aria-hidden />
              )}
              <span className="truncate text-content-primary/90">{clean}</span>
            </div>
            {node.detail && !looksLikeFileNode(node.detail) ? (
              <p className="pl-4 text-[11px] text-content-tertiary font-sans leading-snug">{node.detail}</p>
            ) : null}
            {kids.length ? <FileTreeBranch steps={kids} depth={depth + 1} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical connector with optional edge badge (create_edit_plan / chat / fail / pass). */
function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1 select-none" aria-hidden>
      <div className="w-px h-3 bg-white/20" />
      {label ? (
        <span className="my-1 max-w-[11rem] truncate rounded-sm bg-black/80 border border-white/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-200">
          {label}
        </span>
      ) : null}
      <div className="w-px h-3 bg-white/20" />
      <div
        className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-white/35"
      />
    </div>
  );
}

function FlowNode({
  title,
  subtitle,
  detail,
  defaultOpen = false,
  accent = 'neutral',
  children,
}: {
  title: string;
  subtitle?: string;
  detail?: string;
  defaultOpen?: boolean;
  accent?: 'neutral' | 'plan' | 'action' | 'question';
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const hasBody = Boolean(detail?.trim()) || Boolean(children) || Boolean(subtitle?.trim());
  const ring =
    accent === 'plan'
      ? 'border-sky-400/25 hover:border-sky-300/40'
      : accent === 'action'
        ? 'border-emerald-400/20 hover:border-emerald-300/35'
        : accent === 'question'
          ? 'border-amber-400/25 hover:border-amber-300/40'
          : 'border-white/12 hover:border-white/22';

  return (
    <div className="w-full max-w-xl mx-auto">
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        aria-expanded={hasBody ? open : undefined}
        aria-controls={hasBody ? panelId : undefined}
        className={`w-full text-left rounded-lg border bg-[#141416]/95 backdrop-blur-sm px-4 py-3 transition-colors ${ring} ${
          hasBody ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold tracking-tight text-zinc-100 leading-snug">
              {title}
            </div>
            {subtitle ? (
              <div className="mt-0.5 text-[11px] text-zinc-400 leading-snug">{subtitle}</div>
            ) : null}
          </div>
          {hasBody ? (
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 text-zinc-500 transition-transform mt-0.5 ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          ) : null}
        </div>
      </button>
      {hasBody && open ? (
        <div
          id={panelId}
          className="mt-1.5 rounded-lg border border-white/[0.08] bg-black/35 px-3.5 py-3 text-[12px] text-zinc-300 leading-relaxed space-y-2"
        >
          {detail ? <p className="text-zinc-300/95 whitespace-pre-wrap">{detail}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

function StepFlowNode({
  step,
  index,
  depth = 0,
}: {
  step: PlanStep;
  index: number;
  depth?: number;
}) {
  const kids = step.children || [];
  const fileKids = kids.filter(
    (c) => looksLikeFileNode(c.title) || (c.children || []).some((g) => looksLikeFileNode(g.title)),
  );
  const otherKids = kids.filter((c) => !fileKids.includes(c));
  const n = index + 1;
  const title = depth === 0 ? `${n}. ${step.title}` : step.title;
  const detailSnippet = String(step.detail || '').replace(/\s+/g, ' ').trim();
  const subtitle = depth === 0
    ? (index === 0
      ? (detailSnippet ? `Step ${n} · start here — ${detailSnippet.slice(0, 120)}${detailSnippet.length > 120 ? '…' : ''}` : `Step ${n} · start here`)
      : (detailSnippet
        ? `Step ${n} · ${detailSnippet.length > 140 ? `${detailSnippet.slice(0, 138)}…` : detailSnippet}`
        : `Step ${n} · next`))
    : 'Sub-step';

  return (
    <div className="w-full">
      <FlowNode
        title={title}
        subtitle={subtitle}
        detail={step.detail}
        accent="plan"
        // Open every top-level step so the map is readable without hunting empty dropdowns.
        defaultOpen={depth === 0}
      >
        {fileKids.length ? (
          <div className="rounded-md border border-white/[0.08] bg-black/25 overflow-hidden">
            <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 border-b border-white/5 flex items-center gap-1.5">
              <Folder className="w-3 h-3 text-sky-300/70" aria-hidden />
              Project files
            </div>
            <div className="px-2.5 py-2">
              <FileTreeBranch steps={fileKids} />
            </div>
          </div>
        ) : null}
        {otherKids.length ? (
          <div className="space-y-2 pt-1">
            {otherKids.map((child, i) => (
              <StepFlowNode
                key={`${depth}-${i}-${child.title.slice(0, 24)}`}
                step={child}
                index={i}
                depth={depth + 1}
              />
            ))}
          </div>
        ) : null}
      </FlowNode>
    </div>
  );
}

/**
 * Full-bleed Plan flowchart — gray canvas, vertical flow boxes, click-to-expand detail.
 * - inline: card with retractable header (legacy / rare)
 * - overlay: map body only — parent shell owns the PLAN title bar (no nested chrome)
 */
export function PlanReport({
  report,
  hideSummary = false,
  variant = 'inline',
}: {
  report: PlanReportData;
  hideSummary?: boolean;
  /** overlay = single Plan screen (no nested PLAN header / retract accordion) */
  variant?: 'inline' | 'overlay';
}) {
  const stepCount = countPlanSteps(report);
  const showSummary = !hideSummary && Boolean(report.summary?.trim());
  const isOverlay = variant === 'overlay';
  // Start expanded so new plans are readable; user can retract to scroll chat history.
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();

  const mapBody = (
    <div id={isOverlay ? undefined : bodyId} className={`relative px-3 sm:px-6 py-6 sm:py-8 ${isOverlay ? 'min-h-full' : ''}`}>
      {/* Soft grid / atmosphere — matches Nova dark studio, not a flat card dump */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.04), transparent 55%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 24px 24px, 24px 24px',
        }}
      />

      <div className="relative flex flex-col items-stretch gap-0 max-w-2xl mx-auto">
        {report.compare?.left && report.compare?.right ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {([report.compare.left, report.compare.right] as const).map((pane, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-white/12 bg-[#141416]/95 px-3.5 py-3"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-1">
                    {i === 0 ? 'Left · now' : 'Right · next'}
                  </div>
                  <div className="text-[13px] font-semibold text-zinc-100">{pane.title}</div>
                  {pane.summary ? (
                    <p className="mt-1 text-[12px] text-zinc-400 leading-relaxed">{pane.summary}</p>
                  ) : null}
                  {pane.bullets?.length ? (
                    <ul className="mt-2 space-y-1 list-none m-0 p-0">
                      {pane.bullets.map((b, j) => (
                        <li key={j} className="text-[12px] text-zinc-300 leading-snug flex gap-2">
                          <span className="text-zinc-600 shrink-0">·</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
            <FlowArrow label="compare → plan" />
          </>
        ) : null}

        <FlowNode
          title="Your request"
          subtitle="What you asked NOVA to plan"
          detail={
            showSummary
              ? report.summary
              : 'This plan maps how we will build — expand each step for the work inside.'
          }
          accent="neutral"
          defaultOpen={showSummary}
        />

        <FlowArrow label="start → build" />

        {report.steps.length ? (
          report.steps.map((step, i) => (
            <div key={`${i}-${step.title.slice(0, 24)}`} className="w-full">
              {i > 0 ? <FlowArrow label={i === 1 ? 'next' : undefined} /> : null}
              <StepFlowNode step={step} index={i} />
            </div>
          ))
        ) : (
          <FlowNode
            title="No steps yet"
            detail="Ask for more detail in Plan mode and NOVA will expand this map."
            accent="neutral"
          />
        )}

        {report.questions.length ? (
          <>
            <FlowArrow label="open questions" />
            <FlowNode
              title="Open questions"
              subtitle={`${report.questions.length} to clarify before build`}
              accent="question"
              defaultOpen
            >
              <ul className="space-y-2 list-none m-0 p-0">
                {report.questions.map((q, i) => (
                  <li
                    key={`${i}-${q.slice(0, 20)}`}
                    className="flex gap-2 text-[12px] text-zinc-300 leading-relaxed"
                  >
                    <HelpCircle className="w-3.5 h-3.5 shrink-0 text-amber-300/70 mt-0.5" aria-hidden />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </FlowNode>
          </>
        ) : null}
      </div>
    </div>
  );

  if (isOverlay) {
    return (
      <section
        className="nova-plan-flow w-full max-w-full min-h-full bg-[#0c0c0e]"
        aria-label={`Plan: ${report.title}`}
      >
        {mapBody}
      </section>
    );
  }

  return (
    <section
      className="nova-plan-flow my-2 w-full max-w-full rounded-2xl border border-white/[0.08] bg-[#0c0c0e] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      aria-label={`Plan: ${report.title}`}
    >
      <header className="flex items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-white/[0.06] bg-[#101012]/90">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left rounded-md hover:bg-white/[0.04] transition-colors -mx-1 px-1 py-0.5"
          aria-expanded={expanded}
          aria-controls={bodyId}
          title={expanded ? 'Retract plan map' : 'Expand plan map'}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="inline-flex items-center gap-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300 bg-white/[0.08] border border-white/10 rounded-md px-2 py-1">
            <Map className="w-3 h-3 text-content-tertiary" aria-hidden />
            Plan
          </span>
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-zinc-100 tracking-tight">
            {report.title}
          </h3>
          <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-content-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      </header>

      {expanded ? (
        mapBody
      ) : (
        <button
          type="button"
          id={bodyId}
          className="w-full px-4 sm:px-5 py-3 text-left text-[12px] text-content-tertiary hover:bg-white/[0.03] transition-colors"
          onClick={() => setExpanded(true)}
        >
          Plan map retracted — click to expand {stepCount} {stepCount === 1 ? 'step' : 'steps'}.
        </button>
      )}
    </section>
  );
}
