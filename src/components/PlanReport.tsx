import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, FileCode, Folder } from 'lucide-react';
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

function FileTreeDropdown({ label, steps }: { label: string; steps: PlanStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5 rounded-md border border-white/[0.08] bg-black/25 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-content-secondary hover:bg-white/[0.04] transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <Folder className="w-3 h-3 shrink-0 text-sky-300/80" aria-hidden />
        <span className="font-medium text-content-primary/90">{label}</span>
        <span className="ml-auto tabular-nums text-content-tertiary">{steps.length}</span>
      </button>
      {open ? (
        <div className="px-2.5 pb-2 pt-0.5 border-t border-white/5">
          <FileTreeBranch steps={steps} />
        </div>
      ) : null}
    </div>
  );
}

function PlanTreeNode({
  step,
  index,
  total,
  depth = 0,
}: {
  step: PlanStep;
  index: number;
  total: number;
  depth?: number;
}) {
  const isLast = index === total - 1;
  const kids = step.children || [];
  const fileKids = kids.filter((c) => looksLikeFileNode(c.title) || (c.children || []).some((g) => looksLikeFileNode(g.title)));
  const otherKids = kids.filter((c) => !fileKids.includes(c));
  // Any file/folder children collapse into a VS Code-style dropdown.
  const showFileDrop = fileKids.length >= 1;

  const railLeft = depth === 0 ? 'left-[0.6875rem]' : 'left-[0.3rem]';
  const railTop = depth === 0 ? 'top-5' : 'top-3';

  return (
    <li className="relative">
      {!isLast ? (
        <span
          className={`pointer-events-none absolute ${railLeft} ${railTop} bottom-0 w-px bg-white/10`}
          aria-hidden
        />
      ) : null}

      <div className="relative flex gap-2.5 min-w-0">
        <span
          className={`relative z-[1] shrink-0 rounded-full border flex items-center justify-center tabular-nums ${
            depth === 0
              ? 'mt-0.5 w-[1.375rem] h-[1.375rem] border-white/20 bg-white/[0.06] text-content-secondary text-[10px] font-semibold'
              : 'mt-1.5 w-2.5 h-2.5 border-white/15 bg-white/[0.08]'
          }`}
          aria-hidden
        >
          {depth === 0 ? index + 1 : null}
        </span>

        <div className={`min-w-0 flex-1 ${isLast && !kids.length ? 'pb-0.5' : 'pb-3'}`}>
          <p
            className={`leading-snug text-content-primary ${
              depth === 0 ? 'text-[13px] font-semibold tracking-tight' : 'text-[12px] font-medium text-content-secondary'
            }`}
          >
            {step.title}
          </p>
          {step.detail ? (
            <p className="mt-0.5 text-[12px] text-content-tertiary leading-relaxed">
              {step.detail}
            </p>
          ) : null}

          {showFileDrop ? (
            <FileTreeDropdown label="Project files" steps={fileKids} />
          ) : null}

          {(showFileDrop ? otherKids : kids).length ? (
            <ul className="mt-2 pl-1 space-y-0 list-none border-l border-white/[0.08]">
              {(showFileDrop ? otherKids : kids).map((child, i) => (
                <PlanTreeNode
                  key={`${depth}-${i}-${child.title.slice(0, 24)}`}
                  step={child}
                  index={i}
                  total={(showFileDrop ? otherKids : kids).length}
                  depth={depth + 1}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function PlanReport({
  report,
  hideSummary = false,
}: {
  report: PlanReportData;
  /** When intro prose is shown above the card, skip repeating summary inside. */
  hideSummary?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const stepCount = countPlanSteps(report);
  const showSummary = !hideSummary && Boolean(report.summary?.trim());

  return (
    <div className="my-1 w-full max-w-full rounded-xl border border-white/[0.1] bg-zinc-950/90 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
        aria-expanded={open}
      >
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300 bg-white/10 border border-white/10 rounded-md px-1.5 py-0.5">
          Plan
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-content-primary">
          {report.title}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-content-tertiary">
          {stepCount} {stepCount === 1 ? 'step' : 'steps'}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-content-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="px-3.5 pb-3.5 border-t border-white/[0.06] pt-3 space-y-3">
          {showSummary ? (
            <p className="text-[13px] text-content-secondary leading-relaxed">
              {report.summary}
            </p>
          ) : null}

          {report.steps.length ? (
            <ul className="list-none m-0 p-0" aria-label="Plan steps">
              {report.steps.map((step, i) => (
                <PlanTreeNode
                  key={`${i}-${step.title.slice(0, 24)}`}
                  step={step}
                  index={i}
                  total={report.steps.length}
                  depth={0}
                />
              ))}
            </ul>
          ) : null}

          {report.questions.length ? (
            <div className="space-y-2 border-t border-white/[0.06] pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-content-tertiary">
                Open questions
              </div>
              <ul className="space-y-1.5">
                {report.questions.map((q, i) => (
                  <li
                    key={`${i}-${q.slice(0, 20)}`}
                    className="text-[13px] text-content-secondary leading-relaxed flex gap-2"
                  >
                    <span className="text-content-tertiary shrink-0">·</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        null as ReactNode
      )}
    </div>
  );
}
